"""json 子命令 — JSON 處理工具"""

import json
import click
from pathlib import Path


@click.group()
def cli():
    """JSON 處理工具"""
    pass


@cli.command()
@click.argument("file", type=click.Path(exists=True))
@click.option("--indent", "-i", default=2, help="縮排空格數")
@click.option("--in-place", "-w", is_flag=True, help="直接修改檔案")
def fmt(file, indent, in_place):
    """格式化 JSON 檔案"""
    path = Path(file)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        click.echo(f"❌ JSON 解析錯誤: {e}")
        raise SystemExit(1)

    formatted = json.dumps(data, indent=indent, ensure_ascii=False)

    if in_place:
        path.write_text(formatted + "\n", encoding="utf-8")
        click.echo(f"✅ 已格式化: {file}")
    else:
        click.echo(formatted)


@cli.command()
@click.argument("file", type=click.Path(exists=True))
@click.option(
    "--query", "-q", required=True, help="jq 風格查詢 (如 .key, .items[0].name)"
)
def get(file, query):
    """查詢 JSON 值（簡單路徑查詢）"""
    path = Path(file)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        click.echo(f"❌ JSON 解析錯誤: {e}")
        raise SystemExit(1)

    result = _query(data, query)
    if result is _MISSING:
        click.echo(f"❌ 路徑不存在: {query}")
        raise SystemExit(1)

    if isinstance(result, (dict, list)):
        click.echo(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        click.echo(result)


@cli.command()
@click.argument("file", type=click.Path(exists=True))
def keys(file):
    """列出 JSON 頂層鍵"""
    path = Path(file)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        click.echo(f"❌ JSON 解析錯誤: {e}")
        raise SystemExit(1)

    if isinstance(data, dict):
        for k in sorted(data.keys()):
            v = data[k]
            vtype = type(v).__name__
            if isinstance(v, (list, dict)):
                vtype = f"{vtype}[{len(v)}]"
            click.echo(f"  {k:<30} {vtype}")
    elif isinstance(data, list):
        click.echo(f"  Array: {len(data)} items")
    else:
        click.echo(f"  Type: {type(data).__name__}")


@cli.command()
@click.argument("file_a", type=click.Path(exists=True))
@click.argument("file_b", type=click.Path(exists=True))
def diff(file_a, file_b):
    """比較兩個 JSON 檔案的差異"""
    path_a = Path(file_a)
    path_b = Path(file_b)

    try:
        data_a = json.loads(path_a.read_text(encoding="utf-8"))
        data_b = json.loads(path_b.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        click.echo(f"❌ JSON 解析錯誤: {e}")
        raise SystemExit(1)

    differences = _deep_diff(data_a, data_b, "")

    if not differences:
        click.echo("✅ 兩個 JSON 完全相同")
        return

    click.echo(f"發現 {len(differences)} 處差異:\n")
    for path, (val_a, val_b) in differences:
        click.echo(f"  {path or '(root)'}:")
        click.echo(f"    A: {_display(val_a)}")
        click.echo(f"    B: {_display(val_b)}")


@cli.command()
@click.argument("file", type=click.Path(exists=True))
def validate(file):
    """驗證 JSON 檔案格式"""
    path = Path(file)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        size = path.stat().st_size
        keys = len(data) if isinstance(data, dict) else None
        items = len(data) if isinstance(data, list) else None

        click.echo("✅ 有效 JSON")
        click.echo(f"   大小: {size:,} bytes")
        click.echo(f"   類型: {type(data).__name__}")
        if keys is not None:
            click.echo(f"   鍵數: {keys}")
        if items is not None:
            click.echo(f"   項目: {items}")
    except json.JSONDecodeError as e:
        click.echo("❌ 無效 JSON")
        click.echo(f"   錯誤: {e}")
        click.echo(f"   行 {e.lineno}, 列 {e.colno}")
        raise SystemExit(1)


@cli.command()
@click.argument("file", type=click.Path(exists=True))
def flatten(file):
    """扁平化 JSON 結構"""
    path = Path(file)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        click.echo(f"❌ JSON 解析錯誤: {e}")
        raise SystemExit(1)

    flat = _flatten_dict(data)
    for k in sorted(flat.keys()):
        click.echo(f"  {k} = {_display(flat[k])}")


# --- Internal helpers ---

_MISSING = object()


def _query(data, query: str):
    """Simple jq-style path query: .key.nested[0].value"""
    parts = query.lstrip(".").split(".")
    current = data
    for part in parts:
        if current is _MISSING:
            return _MISSING
        # Handle array index: items[0]
        if "[" in part and part.endswith("]"):
            name, idx_str = part.split("[", 1)
            idx = int(idx_str[:-1])
            if name:
                current = (
                    current.get(name, _MISSING)
                    if isinstance(current, dict)
                    else _MISSING
                )
            if (
                current is not _MISSING
                and isinstance(current, list)
                and 0 <= idx < len(current)
            ):
                current = current[idx]
            else:
                return _MISSING
        elif isinstance(current, dict):
            current = current.get(part, _MISSING)
        else:
            return _MISSING
    return current


def _deep_diff(a, b, path: str) -> list:
    """Deep compare two JSON structures"""
    diffs = []
    if type(a) is not type(b):
        diffs.append((path, (a, b)))
    elif isinstance(a, dict):
        all_keys = set(a.keys()) | set(b.keys())
        for k in sorted(all_keys):
            sub_path = f"{path}.{k}" if path else k
            if k not in a:
                diffs.append((sub_path, (None, b[k])))
            elif k not in b:
                diffs.append((sub_path, (a[k], None)))
            else:
                diffs.extend(_deep_diff(a[k], b[k], sub_path))
    elif isinstance(a, list):
        if len(a) != len(b):
            diffs.append((path + "[]", (f"len={len(a)}", f"len={len(b)}")))
        else:
            for i in range(len(a)):
                diffs.extend(_deep_diff(a[i], b[i], f"{path}[{i}]"))
    elif a != b:
        diffs.append((path, (a, b)))
    return diffs


def _flatten_dict(data, prefix: str = "") -> dict:
    """Flatten nested dict to dot-separated keys"""
    result = {}
    if isinstance(data, dict):
        for k, v in data.items():
            key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                result.update(_flatten_dict(v, key))
            elif isinstance(v, list):
                for i, item in enumerate(v):
                    result.update(_flatten_dict(item, f"{key}[{i}]"))
            else:
                result[key] = v
    elif isinstance(data, list):
        for i, item in enumerate(data):
            result.update(_flatten_dict(item, f"{prefix}[{i}]"))
    else:
        result[prefix] = data
    return result


def _display(val) -> str:
    if val is None:
        return "null"
    if isinstance(val, str):
        return f'"{val[:50]}..."' if len(val) > 50 else f'"{val}"'
    return str(val)
