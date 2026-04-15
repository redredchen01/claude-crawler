"""file 子命令 — 檔案操作工具"""

import click
from pathlib import Path


@click.group()
def cli():
    """檔案操作工具"""
    pass


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--ext", "-e", multiple=True, help="篩選副檔名 (可多次指定)")
@click.option("--depth", "-d", default=-1, help="最大深度 (-1 = 無限)")
def tree(directory, ext, depth):
    """列出目錄樹狀結構"""
    dir_path = Path(directory)
    _print_tree(dir_path, ext, depth, prefix="")


def _print_tree(
    path: Path, exts: tuple, max_depth: int, prefix: str, current_depth: int = 0
):
    if max_depth >= 0 and current_depth > max_depth:
        return

    entries = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    dirs = [e for e in entries if e.is_dir()]
    files = [e for e in entries if e.is_file()]

    if exts:
        files = [f for f in files if f.suffix in exts]

    items = dirs + files

    for i, item in enumerate(items):
        is_last = i == len(items) - 1
        connector = "└── " if is_last else "├── "
        display = f"{item.name}/" if item.is_dir() else item.name
        click.echo(f"{prefix}{connector}{display}")

        if item.is_dir():
            extension = "    " if is_last else "│   "
            _print_tree(item, exts, max_depth, prefix + extension, current_depth + 1)


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--pattern", "-p", default="*", help="glob 模式")
def stats(directory, pattern):
    """統計目錄檔案資訊"""
    dir_path = Path(directory)
    files = list(dir_path.rglob(pattern))
    files = [f for f in files if f.is_file()]

    if not files:
        click.echo("沒有符合的檔案")
        return

    total_size = sum(f.stat().st_size for f in files)
    ext_count: dict[str, int] = {}
    for f in files:
        ext = f.suffix or "(無副檔名)"
        ext_count[ext] = ext_count.get(ext, 0) + 1

    click.echo(f"📁 {directory}")
    click.echo(f"   檔案數：{len(files)}")
    click.echo(f"   總大小：{_human_size(total_size)}")
    click.echo()
    click.echo("   副檔名分佈：")
    for ext, count in sorted(ext_count.items(), key=lambda x: -x[1]):
        click.echo(f"     {ext}: {count}")


def _human_size(size: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--older-than", "-n", default=30, help="天數閾值")
def stale(directory, older_than):
    """找出過期檔案（未修改超過 N 天）"""
    import time

    dir_path = Path(directory)
    now = time.time()
    threshold = now - older_than * 86400

    stale_files = []
    for f in dir_path.rglob("*"):
        if f.is_file() and f.stat().st_mtime < threshold:
            stale_files.append((f, f.stat().st_mtime))

    stale_files.sort(key=lambda x: x[1])

    if not stale_files:
        click.echo(f"✅ 沒有超過 {older_than} 天未修改的檔案")
        return

    click.echo(f"⚠️  {len(stale_files)} 個檔案超過 {older_than} 天未修改：")
    for f, mtime in stale_files[:50]:
        days = int((now - mtime) / 86400)
        click.echo(f"   {days:>4}d  {f.relative_to(dir_path)}")

    if len(stale_files) > 50:
        click.echo(f"   ... 還有 {len(stale_files) - 50} 個")
