"""sys 子命令 — 系統/workspace 診斷"""

import subprocess
import click
from pathlib import Path


WORKSPACE = Path("/Users/dex/YD 2026")


@click.group()
def cli():
    """系統/workspace 診斷"""
    pass


@cli.command()
def status():
    """Workspace 快速狀態"""
    click.echo("📊 YD 2026 Workspace Status\n")

    # Git
    branch = _run("git -C '{}' branch --show-current".format(WORKSPACE))
    changes = _run("git -C '{}' status --porcelain".format(WORKSPACE))
    change_count = len(changes.strip().splitlines()) if changes else 0
    last_commit = _run("git -C '{}' log --oneline -1".format(WORKSPACE))

    click.echo(f"🌿 Git: [{branch}] {change_count} changes")
    click.echo(f"   Last: {last_commit or 'N/A'}")

    # 專案數量
    prod = _count_dirs(WORKSPACE / "projects/production")
    exp = _count_dirs(WORKSPACE / "projects/experimental")
    tools = _count_dirs(WORKSPACE / "projects/tools")
    click.echo(f"\n📁 Projects: {prod} production / {exp} experimental / {tools} tools")

    # Obsidian
    vault = WORKSPACE / "obsidian"
    if vault.exists():
        notes = len(list(vault.rglob("*.md")))
        click.echo(f"📝 Obsidian: {notes} notes")

    # Memory
    memory = Path.home() / ".claude/projects/-Users-dex-YD-2026/memory"
    if memory.exists():
        mem_files = len(list(memory.glob("*.md")))
        click.echo(f"🧠 Memory: {mem_files} files")

    # Disk usage
    total_size = sum(f.stat().st_size for f in WORKSPACE.rglob("*") if f.is_file())
    click.echo(f"\n💾 Workspace size: {_human_size(total_size)}")


@cli.command()
def doctor():
    """完整系統診斷"""
    click.echo("🩺 System Doctor\n")
    score = 100
    issues = []

    # 1. Git health
    changes = _run("git -C '{}' status --porcelain".format(WORKSPACE))
    if changes:
        count = len(changes.strip().splitlines())
        issues.append(f"⚠️  {count} uncommitted changes")
        score -= 5

    # 2. Large files
    large_files = []
    for f in WORKSPACE.rglob("*"):
        if f.is_file() and f.stat().st_size > 10 * 1024 * 1024:  # > 10MB
            large_files.append((f, f.stat().st_size))
    if large_files:
        issues.append(f"⚠️  {len(large_files)} files > 10MB")
        score -= 10

    # 3. Broken symlinks
    broken = 0
    for f in WORKSPACE.rglob("*"):
        if f.is_symlink() and not f.exists():
            broken += 1
    if broken:
        issues.append(f"❌ {broken} broken symlinks")
        score -= 15

    # 4. .env check
    if not (WORKSPACE / ".env").exists():
        issues.append("❌ Missing .env")
        score -= 10

    # 5. Agent scripts executable
    non_exec = 0
    for f in (WORKSPACE / "scripts/agent").glob("*.sh"):
        if not f.stat().st_mode & 0o111:
            non_exec += 1
    if non_exec:
        issues.append(f"⚠️  {non_exec} non-executable agent scripts")
        score -= 5

    # 6. Test suites
    projects_with_tests = 0
    projects_without_tests = []
    for cat in ["production", "experimental", "tools"]:
        cat_path = WORKSPACE / "projects" / cat
        if not cat_path.exists():
            continue
        for proj in cat_path.iterdir():
            if not proj.is_dir() or proj.name.startswith("."):
                continue
            has_tests = any(
                [
                    (proj / "tests").exists(),
                    (proj / "test").exists(),
                    list(proj.rglob("test_*.py")),
                    list(proj.rglob("*.test.*")),
                ]
            )
            if has_tests:
                projects_with_tests += 1
            else:
                projects_without_tests.append(proj.name)

    if projects_without_tests:
        issues.append(
            f"⚠️  {len(projects_without_tests)} projects without tests: {', '.join(projects_without_tests[:3])}"
        )
        score -= 5

    # Result
    score = max(0, score)
    grade = "🟢" if score >= 80 else "🟡" if score >= 60 else "🔴"
    click.echo(f"{grade} Health Score: {score}/100\n")

    if issues:
        for issue in issues:
            click.echo(f"  {issue}")
    else:
        click.echo("  ✅ No issues found!")


@cli.command()
def top():
    """Workspace 資源佔用排行"""
    click.echo("💾 大檔案排行 (>1MB):\n")

    large = []
    for f in WORKSPACE.rglob("*"):
        if f.is_file() and not f.name.startswith(".") and ".git" not in str(f):
            size = f.stat().st_size
            if size > 1024 * 1024:
                large.append((f, size))

    large.sort(key=lambda x: -x[1])

    for f, size in large[:20]:
        rel = f.relative_to(WORKSPACE)
        click.echo(f"  {_human_size(size):>10}  {rel}")


def _count_dirs(path: Path) -> int:
    if not path.exists():
        return 0
    return len([d for d in path.iterdir() if d.is_dir() and not d.name.startswith(".")])


def _human_size(size: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def _run(cmd: str) -> str | None:
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None
