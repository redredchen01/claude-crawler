"""hash 子命令 — 檔案哈希/checksum 工具"""

import hashlib
import click
from pathlib import Path


@click.group()
def cli():
    """檔案哈希/checksum 工具"""
    pass


@cli.command()
@click.argument("files", nargs=-1, type=click.Path(exists=True))
@click.option(
    "--algo",
    "-a",
    default="sha256",
    type=click.Choice(["md5", "sha1", "sha256", "sha512"]),
    help="哈希算法",
)
def file(files, algo):
    """計算檔案哈希值"""
    if not files:
        click.echo("需要指定檔案")
        return

    for f in files:
        path = Path(f)
        h = _hash_file(path, algo)
        click.echo(f"  {h}  {path.name}")


@cli.command()
@click.argument("text")
@click.option(
    "--algo",
    "-a",
    default="sha256",
    type=click.Choice(["md5", "sha1", "sha256", "sha512"]),
    help="哈希算法",
)
def text(text, algo):
    """計算文字哈希值"""
    h = hashlib.new(algo, text.encode("utf-8")).hexdigest()
    click.echo(f"  {algo}: {h}")


@cli.command()
@click.argument("file_a", type=click.Path(exists=True))
@click.argument("file_b", type=click.Path(exists=True))
@click.option(
    "--algo",
    "-a",
    default="sha256",
    type=click.Choice(["md5", "sha1", "sha256", "sha512"]),
    help="哈希算法",
)
def compare(file_a, file_b, algo):
    """比較兩個檔案是否相同"""
    path_a = Path(file_a)
    path_b = Path(file_b)

    hash_a = _hash_file(path_a, algo)
    hash_b = _hash_file(path_b, algo)

    click.echo(f"  A: {hash_a}  {path_a.name}")
    click.echo(f"  B: {hash_b}  {path_b.name}")

    if hash_a == hash_b:
        click.echo(f"\n  ✅ 檔案相同 ({algo})")
    else:
        click.echo(f"\n  ❌ 檔案不同 ({algo})")


@cli.command()
@click.argument("directory", type=click.Path(exists=True))
@click.option(
    "--algo",
    "-a",
    default="sha256",
    type=click.Choice(["md5", "sha1", "sha256", "sha512"]),
    help="哈希算法",
)
@click.option("--ext", "-e", multiple=True, help="篩選副檔名")
def manifest(directory, algo, ext):
    """生成目錄檔案 checksum 清單"""
    dir_path = Path(directory)
    files = [
        f for f in dir_path.rglob("*") if f.is_file() and not f.name.startswith(".")
    ]

    if ext:
        files = [f for f in files if f.suffix in ext]

    files.sort()

    if not files:
        click.echo("沒有符合的檔案")
        return

    click.echo(f"# {algo} manifest — {dir_path.name}")
    click.echo(f"# {len(files)} files\n")

    for f in files:
        h = _hash_file(f, algo)
        rel = f.relative_to(dir_path)
        click.echo(f"{h}  {rel}")


@cli.command()
@click.argument("manifest_file", type=click.Path(exists=True))
def verify(manifest_file):
    """驗證 checksum 清單"""
    path = Path(manifest_file)
    base_dir = path.parent

    lines = path.read_text(encoding="utf-8").strip().split("\n")
    ok = 0
    fail = 0
    missing = 0

    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        parts = line.split("  ", 1)
        if len(parts) != 2:
            continue

        expected_hash, rel_path = parts
        file_path = base_dir / rel_path

        if not file_path.exists():
            click.echo(f"  ❌ {rel_path} (missing)")
            missing += 1
            continue

        # Detect algo from hash length
        algo = _detect_algo(expected_hash)
        actual_hash = _hash_file(file_path, algo)

        if actual_hash == expected_hash:
            click.echo(f"  ✅ {rel_path}")
            ok += 1
        else:
            click.echo(f"  ❌ {rel_path} (hash mismatch)")
            fail += 1

    click.echo(f"\n結果: {ok} ok / {fail} failed / {missing} missing")


def _hash_file(path: Path, algo: str) -> str:
    h = hashlib.new(algo)
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _detect_algo(hash_str: str) -> str:
    length = len(hash_str)
    return {32: "md5", 40: "sha1", 64: "sha256", 128: "sha512"}.get(length, "sha256")
