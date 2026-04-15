"""text 子命令 — 文字/Markdown 工具"""

import re
import click
from pathlib import Path


@click.group()
def cli():
    """文字/Markdown 工具"""
    pass


@cli.command()
@click.argument("file", type=click.Path(exists=True))
def links(file):
    """檢查 Markdown 連結是否有效"""
    content = Path(file).read_text(encoding="utf-8")

    # 內部連結 [[...]]
    internal = re.findall(r"\[\[([^\]|]+)", content)
    # 外部連結 [text](url)
    external = re.findall(r"\[([^\]]*)\]\(([^)]+)\)", content)

    click.echo(f"📄 {file}\n")
    click.echo(f"   內部連結：{len(internal)}")
    for link in internal[:20]:
        click.echo(f"     [[{link}]]")
    if len(internal) > 20:
        click.echo(f"     ... 還有 {len(internal) - 20} 個")

    click.echo(f"\n   外部連結：{len(external)}")
    for text, url in external[:20]:
        display = text[:30] if text else "(no text)"
        click.echo(f"     [{display}]({url[:60]})")
    if len(external) > 20:
        click.echo(f"     ... 還有 {len(external) - 20} 個")


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
def wordcount(directory):
    """統計目錄下所有 .md 檔案字數"""
    dir_path = Path(directory)
    md_files = list(dir_path.rglob("*.md"))

    if not md_files:
        click.echo("找不到 .md 檔案")
        return

    total_chars = 0
    total_lines = 0
    total_words = 0

    for f in sorted(md_files):
        content = f.read_text(encoding="utf-8", errors="ignore")
        lines = content.count("\n") + 1
        words = len(content.split())
        chars = len(content)
        total_chars += chars
        total_lines += lines
        total_words += words

    click.echo(f"📁 {directory}")
    click.echo(f"   檔案：{len(md_files)}")
    click.echo(f"   行數：{total_lines:,}")
    click.echo(f"   字數：{total_words:,}")
    click.echo(f"   字元：{total_chars:,}")


@cli.command()
@click.argument("file", type=click.Path(exists=True))
def frontmatter(file):
    """提取並顯示 Markdown frontmatter"""
    import yaml

    content = Path(file).read_text(encoding="utf-8")

    if not content.startswith("---"):
        click.echo("❌ 沒有 frontmatter")
        return

    parts = content.split("---", 2)
    if len(parts) < 3:
        click.echo("❌ frontmatter 格式不完整")
        return

    try:
        fm = yaml.safe_load(parts[1])
        click.echo(f"📄 {file}\n")
        for key, value in fm.items():
            click.echo(f"   {key}: {value}")
    except yaml.YAMLError as e:
        click.echo(f"❌ YAML 解析錯誤：{e}")


@cli.command()
@click.argument("file", type=click.Path(exists=True))
@click.option("--find", "-f", required=True, help="搜尋文字")
@click.option("--replace", "-r", required=True, help="替換文字")
@click.option("--dry-run", is_flag=True, help="預覽不修改")
def replace(file, find, replace, dry_run):
    """批次文字替換"""
    path = Path(file)
    content = path.read_text(encoding="utf-8")
    count = content.count(find)

    if count == 0:
        click.echo(f"找不到 '{find}'")
        return

    click.echo(f"找到 {count} 處 '{find}'")

    if dry_run:
        click.echo("(dry-run 模式，不修改檔案)")
        return

    new_content = content.replace(find, replace)
    path.write_text(new_content, encoding="utf-8")
    click.echo(f"✅ 已替換 {count} 處")
