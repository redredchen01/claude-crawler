"""batch 子命令 — 批次檔案操作"""

import shutil
import click
from pathlib import Path


@click.group()
def cli():
    """批次檔案操作"""
    pass


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--pattern", "-p", required=True, help="檔名模式 (如 'IMG_*.jpg')")
@click.option("--template", "-t", required=True, help="新名稱模板 (如 'photo_{n:03d}')")
@click.option("--dry-run", is_flag=True, help="預覽不執行")
@click.option("--ext", "-e", default=None, help="保留副檔名")
def rename(directory, pattern, template, dry_run, ext):
    """批次重新命名檔案"""
    import fnmatch

    dir_path = Path(directory)

    files = sorted(
        f
        for f in dir_path.iterdir()
        if f.is_file() and fnmatch.fnmatch(f.name, pattern)
    )
    if not files:
        click.echo(f"找不到符合 '{pattern}' 的檔案")
        return

    click.echo(f"找到 {len(files)} 個檔案\n")
    renamed = []

    for i, f in enumerate(files):
        suffix = ext or f.suffix
        new_name = template.format(n=i + 1, name=f.stem, N=len(files)) + suffix
        new_path = dir_path / new_name

        if new_path.exists() and new_path != f:
            click.echo(f"  ⚠️  {new_name} 已存在，跳過")
            continue

        click.echo(f"  {f.name} → {new_name}")
        renamed.append((f, new_path))

    if dry_run:
        click.echo(f"\n(dry-run 模式，{len(renamed)} 個檔案未修改)")
        return

    for old, new in renamed:
        old.rename(new)

    click.echo(f"\n✅ 已重新命名 {len(renamed)} 個檔案")


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--ext", "-e", multiple=True, required=True, help="副檔名篩選")
@click.option("--target", "-d", required=True, help="目標目錄")
@click.option("--dry-run", is_flag=True, help="預覽不執行")
def move(directory, ext, target, dry_run):
    """依副檔名批次移動檔案"""
    dir_path = Path(directory)
    target_path = Path(target)
    target_path.mkdir(parents=True, exist_ok=True)

    moved = 0
    for f in dir_path.rglob("*"):
        if not f.is_file() or f.name.startswith("."):
            continue
        if f.suffix not in ext:
            continue

        dest = target_path / f.name
        if dest.exists():
            click.echo(f"  ⚠️  {f.name} 已存在，跳過")
            continue

        if not dry_run:
            shutil.move(str(f), str(dest))
        click.echo(f"  {f.relative_to(dir_path)} → {target}/")
        moved += 1

    action = "會移動" if dry_run else "已移動"
    click.echo(f"\n✅ {action} {moved} 個檔案")


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--ext", "-e", multiple=True, help="副檔名篩選")
@click.option("--dry-run", is_flag=True, help="預覽不執行")
def dedup(directory, ext, dry_run):
    """刪除重複檔案（保留第一個）"""
    import hashlib

    dir_path = Path(directory)

    hash_map: dict[str, Path] = {}
    duplicates = []

    for f in sorted(dir_path.rglob("*")):
        if not f.is_file() or f.name.startswith("."):
            continue
        if ext and f.suffix not in ext:
            continue

        h = hashlib.sha256(f.read_bytes()).hexdigest()
        if h in hash_map:
            duplicates.append((f, hash_map[h]))
        else:
            hash_map[h] = f

    if not duplicates:
        click.echo("✅ 沒有重複檔案")
        return

    for dup, original in duplicates:
        if not dry_run:
            dup.unlink()
        click.echo(f"  刪除: {dup.relative_to(dir_path)} (重複 {original.name})")

    action = "會刪除" if dry_run else "已刪除"
    click.echo(f"\n✅ {action} {len(duplicates)} 個重複檔案")


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--from", "from_enc", default="utf-8", help="來源編碼")
@click.option("--to", "to_enc", default="utf-8", help="目標編碼")
@click.option(
    "--ext", "-e", multiple=True, default=[".txt", ".md", ".csv"], help="檔案類型"
)
@click.option("--dry-run", is_flag=True, help="預覽不執行")
def encode(directory, from_enc, to_enc, ext, dry_run):
    """批次轉換文字檔案編碼"""
    dir_path = Path(directory)
    converted = 0
    failed = 0

    for f in sorted(dir_path.rglob("*")):
        if not f.is_file() or f.suffix not in ext:
            continue
        try:
            content = f.read_text(encoding=from_enc)
            if not dry_run:
                f.write_text(content, encoding=to_enc)
            click.echo(f"  ✅ {f.relative_to(dir_path)}")
            converted += 1
        except (UnicodeDecodeError, UnicodeEncodeError) as e:
            click.echo(f"  ❌ {f.relative_to(dir_path)}: {e}")
            failed += 1

    action = "會轉換" if dry_run else "已轉換"
    click.echo(f"\n{action} {converted} 個檔案 ({failed} 失敗)")


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option("--pattern", "-p", default="*", help="檔案匹配模式")
@click.option(
    "--template", "-t", required=True, help="目標目錄模板 (如 '{year}/{month}')"
)
@click.option(
    "--by", type=click.Choice(["ext", "date"]), default="ext", help="分類方式"
)
@click.option("--dry-run", is_flag=True, help="預覽不執行")
def organize(directory, pattern, template, by, dry_run):
    """依規則自動分類檔案到子目錄"""
    import fnmatch
    from datetime import datetime

    dir_path = Path(directory)
    files = sorted(
        f
        for f in dir_path.iterdir()
        if f.is_file() and fnmatch.fnmatch(f.name, pattern)
    )

    moved = 0
    for f in files:
        if by == "ext":
            ext = f.suffix.lstrip(".")
            sub = template.format(ext=ext or "no-ext")
        else:
            mtime = datetime.fromtimestamp(f.stat().st_mtime)
            sub = template.format(
                year=mtime.year, month=f"{mtime.month:02d}", day=f"{mtime.day:02d}"
            )

        dest_dir = dir_path / sub
        dest = dest_dir / f.name

        if not dry_run:
            dest_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(f), str(dest))

        click.echo(f"  {f.name} → {sub}/")
        moved += 1

    action = "會移動" if dry_run else "已移動"
    click.echo(f"\n✅ {action} {moved} 個檔案")
