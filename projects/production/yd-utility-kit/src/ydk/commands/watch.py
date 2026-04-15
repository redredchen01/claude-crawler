"""watch 子命令 — 檔案監聽工具"""

import subprocess
import click
from pathlib import Path


@click.group()
def cli():
    """檔案監聽工具"""
    pass


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--ext", "-e", multiple=True, help="篩選副檔名")
@click.option("--command", "-c", required=True, help="觸發命令")
@click.option("--debounce", "-d", default=1, help="防抖秒數")
def onchange(directory, ext, command, debounce):
    """檔案變化時執行命令"""
    dir_path = Path(directory)

    click.echo(f"👁️  監聽: {dir_path}")
    click.echo(f"   命令: {command}")
    if ext:
        click.echo(f"   篩選: {', '.join(ext)}")
    click.echo("   按 Ctrl+C 停止\n")

    try:
        import time

        last_trigger = 0

        # Use fswatch on macOS, inotifywait on Linux
        cmd = ["fswatch", "-r", "-l", "0.5", str(dir_path)]
        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
            )
        except FileNotFoundError:
            click.echo("❌ 需要安裝 fswatch: brew install fswatch")
            return

        for line in proc.stdout:
            changed = Path(line.strip())
            if not changed.exists():
                continue
            if ext and changed.suffix not in ext:
                continue

            now = time.time()
            if now - last_trigger < debounce:
                continue
            last_trigger = now

            click.echo(f"📝 變化: {changed.name}")
            result = subprocess.run(command, shell=True, capture_output=True, text=True)
            if result.returncode == 0:
                click.echo("   ✅ 完成")
            else:
                click.echo(f"   ❌ 錯誤: {result.stderr[:100]}")
            click.echo()

    except KeyboardInterrupt:
        click.echo("\n🛑 已停止")


@cli.command()
@click.argument("file", type=click.Path(exists=True))
@click.option("--lines", "-n", default=10, help="初始顯示行數")
def tail(file, lines):
    """即時監看檔案尾部（tail -f）"""
    path = Path(file)
    click.echo(f"👁️  監看: {path}")
    click.echo("   按 Ctrl+C 停止\n")

    try:
        proc = subprocess.Popen(
            ["tail", "-f", "-n", str(lines), str(path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for line in proc.stdout:
            click.echo(line, nl=False)
    except KeyboardInterrupt:
        click.echo("\n🛑 已停止")


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--interval", "-i", default=5, help="檢查間隔秒數")
def size(directory, interval):
    """監控目錄大小變化"""
    import time

    dir_path = Path(directory)

    def get_size(path):
        return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())

    def get_counts(path):
        files = len([f for f in path.rglob("*") if f.is_file()])
        dirs = len([d for d in path.rglob("*") if d.is_dir()])
        return files, dirs

    prev_size = get_size(dir_path)
    prev_files, prev_dirs = get_counts(dir_path)

    click.echo(f"📊 監控: {dir_path}")
    click.echo(f"   間隔: {interval}s | Ctrl+C 停止\n")
    click.echo(
        f"   初始: {_human_size(prev_size)} | {prev_files} files | {prev_dirs} dirs\n"
    )

    try:
        while True:
            time.sleep(interval)
            curr_size = get_size(dir_path)
            curr_files, curr_dirs = get_counts(dir_path)

            size_diff = curr_size - prev_size
            files_diff = curr_files - prev_files

            if size_diff != 0 or files_diff != 0:
                sign = "+" if size_diff > 0 else ""
                click.echo(
                    f"  [{time.strftime('%H:%M:%S')}] "
                    f"{_human_size(curr_size)} ({sign}{_human_size(abs(size_diff))}) | "
                    f"{curr_files} files ({files_diff:+d})"
                )
                prev_size = curr_size
                prev_files = curr_files
    except KeyboardInterrupt:
        click.echo("\n🛑 已停止")


def _human_size(size: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}TB"
