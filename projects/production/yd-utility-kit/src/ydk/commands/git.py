"""git 子命令 — Git 輔助工具"""

import subprocess
import click
from pathlib import Path


@click.group()
def cli():
    """Git 輔助工具"""
    pass


@cli.command()
@click.argument("base_dir", type=click.Path(exists=True), default=".")
@click.option("--depth", "-d", default=3, help="搜尋深度")
def scan(base_dir, depth):
    """掃描目錄下所有 git repo 的狀態"""
    base = Path(base_dir).resolve()
    repos = _find_git_repos(base, depth)

    if not repos:
        click.echo("找不到 git repo")
        return

    for repo in sorted(repos):
        _show_repo_status(repo)


@cli.command()
@click.option("--days", "-n", default=90, help="超過 N 天未更新的分支")
def stale(days):
    """找出本地過期分支"""
    branches = _run("git branch --format='%(refname:short) %(committerdate:iso)'")
    if not branches:
        click.echo("無法取得分支資訊")
        return

    import datetime

    now = datetime.datetime.now()
    threshold = datetime.timedelta(days=days)

    click.echo(f"🔍 超過 {days} 天未更新的分支：\n")
    found = False
    for line in branches.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.strip().split(" ", 1)
        if len(parts) < 2:
            continue
        name, date_str = parts
        try:
            commit_date = datetime.datetime.fromisoformat(date_str[:19])
            if now - commit_date > threshold:
                delta = (now - commit_date).days
                click.echo(f"  {name:<30} {delta:>4}d 未更新")
                found = True
        except ValueError:
            continue

    if not found:
        click.echo("  ✅ 沒有過期分支")


@cli.command()
def summary():
    """當前 repo 摘要"""
    info = {}
    info["branch"] = _run("git branch --show-current") or "(unknown)"
    info["remote"] = _run("git remote get-url origin") or "(no remote)"

    log = _run("git log --oneline -5")
    status = _run("git status --short")

    click.echo(f"🌿 分支：{info['branch']}")
    click.echo(f"📡 Remote：{info['remote']}")
    click.echo()

    if log:
        click.echo("📝 最近提交：")
        for line in log.strip().split("\n"):
            click.echo(f"   {line}")

    if status:
        click.echo(f"\n⚠️  未提交變更：{len(status.strip().split(chr(10)))} 個檔案")
    else:
        click.echo("\n✅ 工作目錄乾淨")


def _find_git_repos(base: Path, max_depth: int) -> list[Path]:
    repos = []
    for p in base.rglob(".git"):
        if p.is_dir():
            repo = p.parent
            rel = repo.relative_to(base)
            if len(rel.parts) <= max_depth:
                repos.append(repo)
    return repos


def _show_repo_status(repo: Path):
    name = repo.name
    branch = _run("git -C {} branch --show-current".format(repo)) or "?"
    status = _run("git -C {} status --short".format(repo))
    dirty = "⚠️ " if status else "✅"
    last_commit = _run("git -C {} log --oneline -1".format(repo)) or ""

    click.echo(f"{dirty} {name:<25} [{branch}] {last_commit[:60]}")


def _run(cmd: str) -> str | None:
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except (subprocess.TimeoutExpired, Exception):
        return None
