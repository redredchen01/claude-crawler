"""find 子命令 — 進階搜尋工具"""

import re
import click
from pathlib import Path


@click.group()
def cli():
    """進階搜尋工具"""
    pass


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.argument("keyword")
@click.option("--ext", "-e", multiple=True, help="篩選副檔名")
@click.option("--ignore-case", "-i", is_flag=True, help="忽略大小寫")
@click.option("--count", "-c", is_flag=True, help="只顯示匹配數量")
@click.option("--context", "-C", default=0, help="顯示匹配行上下文")
@click.option("--max-results", "-n", default=100, help="最大結果數")
def grep(directory, keyword, ext, ignore_case, count, context, max_results):
    """在檔案中搜尋文字（快速 grep wrapper）"""
    dir_path = Path(directory)
    flags = re.IGNORECASE if ignore_case else 0
    pattern = re.compile(re.escape(keyword), flags)

    total_matches = 0
    files_with_matches = 0

    for f in sorted(dir_path.rglob("*")):
        if not f.is_file() or f.name.startswith("."):
            continue
        if ext and f.suffix not in ext:
            continue
        if f.stat().st_size > 10 * 1024 * 1024:  # skip > 10MB
            continue

        try:
            lines = f.read_text(encoding="utf-8", errors="ignore").splitlines()
        except (UnicodeDecodeError, PermissionError):
            continue

        matches = [(i, line) for i, line in enumerate(lines) if pattern.search(line)]
        if not matches:
            continue

        files_with_matches += 1
        if count:
            total_matches += len(matches)
            continue

        rel = f.relative_to(dir_path)
        for line_no, line in matches:
            if total_matches >= max_results:
                click.echo(f"\n... 已達上限 ({max_results})")
                return
            total_matches += 1
            display = line.strip()[:120]
            click.echo(f"  {rel}:{line_no + 1}: {display}")

    if count:
        click.echo(f"  {total_matches} matches in {files_with_matches} files")


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--name", "-n", multiple=True, help="檔案名稱模式 (glob)")
@click.option("--ext", "-e", multiple=True, help="副檔名篩選")
@click.option("--newer", help="比此日期新 (YYYY-MM-DD)")
@click.option("--older", help="比此日期舊 (YYYY-MM-DD)")
@click.option("--min-size", help="最小大小 (如 1M, 500K)")
@click.option("--max-size", help="最大大小")
@click.option(
    "--type",
    "-t",
    "file_type",
    type=click.Choice(["file", "dir", "link"]),
    help="檔案類型",
)
@click.option("--empty", is_flag=True, help="只找空檔案/目錄")
def files(directory, name, ext, newer, older, min_size, max_size, file_type, empty):
    """進階檔案搜尋"""
    dir_path = Path(directory)
    results = []

    min_bytes = _parse_size(min_size) if min_size else 0
    max_bytes = _parse_size(max_size) if max_size else float("inf")

    import time

    now = time.time()
    newer_ts = _parse_date(newer, now) if newer else 0
    older_ts = _parse_date(older, now) if older else float("inf")

    for f in dir_path.rglob("*"):
        if f.name.startswith(".") and f != dir_path:
            continue

        # Type filter
        if file_type == "file" and not f.is_file():
            continue
        if file_type == "dir" and not f.is_dir():
            continue
        if file_type == "link" and not f.is_symlink():
            continue

        # Name pattern
        if name:
            import fnmatch

            if not any(fnmatch.fnmatch(f.name, n) for n in name):
                continue

        # Extension filter
        if ext and f.is_file() and f.suffix not in ext:
            continue

        # Size filter
        if f.is_file():
            size = f.stat().st_size
            if size < min_bytes or size > max_bytes:
                continue
            if empty and size > 0:
                continue

        # Date filter
        mtime = f.stat().st_mtime
        if mtime < newer_ts or mtime > older_ts:
            continue

        results.append(f)

    results.sort()
    for f in results[:200]:
        rel = f.relative_to(dir_path)
        if f.is_file():
            size = _human_size(f.stat().st_size)
            click.echo(f"  {size:>10}  {rel}")
        elif f.is_dir():
            click.echo(f"  {'[dir]':>10}  {rel}/")
        else:
            click.echo(f"  {'[link]':>10}  {rel}")

    click.echo(f"\n共 {len(results)} 個結果")


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--top", "-n", default=20, help="顯示前 N 個")
def duplicates(directory, top):
    """找出重複檔案（基於 SHA-256）"""
    import hashlib

    dir_path = Path(directory)

    size_map: dict[int, list[Path]] = {}
    for f in dir_path.rglob("*"):
        if f.is_file() and not f.name.startswith("."):
            size = f.stat().st_size
            if size > 0:
                size_map.setdefault(size, []).append(f)

    # Only check files with same size
    hash_map: dict[str, list[Path]] = {}
    for size, files in size_map.items():
        if len(files) < 2:
            continue
        for f in files:
            h = hashlib.sha256(f.read_bytes()).hexdigest()
            hash_map.setdefault(h, []).append(f)

    duplicates = {h: paths for h, paths in hash_map.items() if len(paths) > 1}
    if not duplicates:
        click.echo("✅ 沒有重複檔案")
        return

    total_wasted = 0
    for i, (h, paths) in enumerate(
        sorted(duplicates.items(), key=lambda x: -len(x[1]))
    ):
        if i >= top:
            click.echo(f"\n... 還有 {len(duplicates) - top} 組")
            break
        size = paths[0].stat().st_size
        wasted = size * (len(paths) - 1)
        total_wasted += wasted
        click.echo(f"\n  🔁 {len(paths)} 個重複 ({_human_size(size)} each):")
        for p in sorted(paths):
            click.echo(f"     {p.relative_to(dir_path)}")

    click.echo(f"\n總計浪費: {_human_size(total_wasted)}")


def _parse_size(s: str) -> int:
    s = s.strip().upper()
    multipliers = {"K": 1024, "M": 1024**2, "G": 1024**3}
    if s[-1] in multipliers:
        return int(float(s[:-1]) * multipliers[s[-1]])
    return int(s)


def _parse_date(date_str: str, now: float) -> float:
    from datetime import datetime

    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return dt.timestamp()


def _human_size(size: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}TB"
