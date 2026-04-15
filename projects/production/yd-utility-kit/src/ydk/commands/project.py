"""project 子命令 — 工作區專案管理"""

import subprocess
import click
from pathlib import Path


WORKSPACE = Path("/Users/dex/YD 2026")


@click.group()
def cli():
    """工作區專案管理"""
    pass


@cli.command()
def list():
    """列出所有專案"""
    categories = {
        "production": WORKSPACE / "projects/production",
        "experimental": WORKSPACE / "projects/experimental",
        "tools": WORKSPACE / "projects/tools",
    }

    for cat, path in categories.items():
        if not path.exists():
            continue
        projects = [
            d for d in path.iterdir() if d.is_dir() and not d.name.startswith(".")
        ]
        if not projects:
            continue

        click.echo(
            f"\n{'🏗️' if cat == 'production' else '🧪' if cat == 'experimental' else '🔧'} {cat}/"
        )
        for proj in sorted(projects):
            # 取得 git 狀態
            branch = _git_info(proj, "branch --show-current")
            last_commit = _git_info(proj, "log --oneline -1")
            has_changes = bool(_git_info(proj, "status --short"))

            status = "⚠️" if has_changes else "✅"
            click.echo(
                f"   {status} {proj.name:<30} [{branch or '?'}] {last_commit[:50] if last_commit else ''}"
            )


@cli.command()
@click.argument("name")
def info(name):
    """顯示專案詳細資訊"""
    proj = _find_project(name)
    if not proj:
        click.echo(f"❌ 找不到專案: {name}")
        return

    click.echo(f"📁 {proj.name}")
    click.echo(f"   路徑: {proj}")

    # Git info
    branch = _git_info(proj, "branch --show-current")
    remote = _git_info(proj, "remote get-url origin")
    last_commit = _git_info(proj, "log --oneline -3")
    changes = _git_info(proj, "status --short")

    click.echo(f"   分支: {branch or 'N/A'}")
    click.echo(f"   Remote: {remote or 'N/A'}")

    if last_commit:
        click.echo("\n   最近提交:")
        for line in last_commit.strip().split("\n"):
            click.echo(f"     {line}")

    if changes:
        click.echo(f"\n   ⚠️  未提交變更: {len(changes.strip().splitlines())} 個檔案")

    # 檔案統計
    py_files = list(proj.rglob("*.py"))
    js_files = list(proj.rglob("*.js"))
    md_files = list(proj.rglob("*.md"))

    click.echo(
        f"\n   檔案: {len(py_files)} .py / {len(js_files)} .js / {len(md_files)} .md"
    )


@cli.command()
@click.argument("name")
def cd(name):
    """輸出專案路徑（用於 cd $(ydk project cd name)）"""
    proj = _find_project(name)
    if proj:
        click.echo(str(proj))
    else:
        click.echo(f"❌ 找不到專案: {name}", err=True)
        raise SystemExit(1)


@cli.command()
@click.argument("name", required=False)
def health(name):
    """檢查專案或所有專案健康度"""
    if name:
        projects = [_find_project(name)]
        projects = [p for p in projects if p]
    else:
        projects = []
        for cat in ["production", "experimental", "tools"]:
            cat_path = WORKSPACE / "projects" / cat
            if cat_path.exists():
                projects.extend(
                    d
                    for d in cat_path.iterdir()
                    if d.is_dir() and not d.name.startswith(".")
                )

    for proj in sorted(projects):
        issues = []

        # 檢查 README
        if not (proj / "README.md").exists():
            issues.append("缺少 README.md")

        # 檢查未提交變更
        changes = _git_info(proj, "status --short")
        if changes:
            issues.append(f"{len(changes.strip().splitlines())} 個未提交變更")

        # 檢查最近提交時間
        last_date = _git_info(proj, "log -1 --format=%cr")
        if last_date and "month" in last_date.lower():
            issues.append(f"最近提交: {last_date}")

        # 檢查測試
        has_tests = any(
            [
                (proj / "tests").exists(),
                (proj / "test").exists(),
                list(proj.rglob("test_*.py")),
                list(proj.rglob("*.test.*")),
            ]
        )
        if not has_tests:
            issues.append("找不到測試檔案")

        status = "⚠️" if issues else "✅"
        click.echo(f"{status} {proj.name}")
        for issue in issues:
            click.echo(f"   └─ {issue}")


def _find_project(name: str) -> Path | None:
    for cat in ["production", "experimental", "tools"]:
        proj = WORKSPACE / "projects" / cat / name
        if proj.exists():
            return proj
    # 模糊搜尋
    for cat in ["production", "experimental", "tools"]:
        cat_path = WORKSPACE / "projects" / cat
        if cat_path.exists():
            for d in cat_path.iterdir():
                if d.is_dir() and name.lower() in d.name.lower():
                    return d
    return None


def _git_info(repo: Path, cmd: str) -> str | None:
    try:
        result = subprocess.run(
            f"git -C {repo} {cmd}",
            shell=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None
