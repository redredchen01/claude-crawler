"""env 子命令 — 環境與配置管理"""

import os
import click
from pathlib import Path


WORKSPACE = Path("/Users/dex/YD 2026")


@click.group()
def cli():
    """環境與配置管理"""
    pass


@cli.command()
def check():
    """檢查環境變數與配置完整性"""
    click.echo("🔍 環境檢查\n")

    # .env 檔案
    env_file = WORKSPACE / ".env"
    if env_file.exists():
        click.echo("✅ .env 存在")
        envs = _parse_env(env_file)
        click.echo(f"   變數數量: {len(envs)}")

        # 檢查空值
        empty = [k for k, v in envs.items() if not v or v.startswith("...")]
        if empty:
            click.echo(f"   ⚠️  空值變數: {', '.join(empty)}")
    else:
        click.echo("❌ .env 不存在（參考 .env.example）")

    # PATH 中的工具
    click.echo("\n📦 工具檢查:")
    tools = ["git", "node", "python3", "ffmpeg", "clausidian", "jq", "rg"]
    for tool in tools:
        path = _which(tool)
        version = _get_version(tool)
        if path:
            ver_str = f" ({version})" if version else ""
            click.echo(f"   ✅ {tool:<15} {path}{ver_str}")
        else:
            click.echo(f"   ❌ {tool:<15} not found")

    # Python 環境
    click.echo("\n🐍 Python 環境:")
    py_ver = _run("python3 --version")
    click.echo(f"   版本: {py_ver or 'N/A'}")
    venv = os.environ.get("VIRTUAL_ENV")
    if venv:
        click.echo(f"   虛擬環境: {venv}")
    else:
        click.echo("   虛擬環境: (無)")

    # Node 環境
    click.echo("\n📦 Node 環境:")
    node_ver = _run("node --version")
    npm_ver = _run("npm --version")
    click.echo(f"   Node: {node_ver or 'N/A'}")
    click.echo(f"   npm: {npm_ver or 'N/A'}")


@cli.command()
@click.argument("key", required=False)
def get(key):
    """讀取環境變數"""
    env_file = WORKSPACE / ".env"
    if not env_file.exists():
        click.echo("❌ .env 不存在")
        return

    envs = _parse_env(env_file)

    if key:
        value = envs.get(key)
        if value:
            # 遮蔽敏感值
            if any(s in key.lower() for s in ["key", "token", "secret", "password"]):
                display = value[:8] + "..." if len(value) > 8 else "***"
            else:
                display = value
            click.echo(f"{key}={display}")
        else:
            click.echo(f"❌ 找不到變數: {key}")
    else:
        for k, v in sorted(envs.items()):
            if any(s in k.lower() for s in ["key", "token", "secret", "password"]):
                display = v[:8] + "..." if len(v) > 8 else "***"
            else:
                display = v
            click.echo(f"  {k}={display}")


@cli.command()
def doctor():
    """診斷環境問題並給出修復建議"""
    click.echo("🩺 環境診斷\n")
    issues = []

    # 檢查 .env
    if not (WORKSPACE / ".env").exists():
        issues.append((".env 不存在", "cp .env.example .env"))

    # 檢查必要工具
    for tool in ["git", "python3", "node", "clausidian"]:
        if not _which(tool):
            issues.append((f"{tool} 未安裝", f"brew install {tool} 或查看安裝文檔"))

    # 檢查 Python 套件
    for pkg in ["click", "pytest"]:
        try:
            __import__(pkg)
        except ImportError:
            issues.append((f"Python 套件 {pkg} 缺失", f"pip install {pkg}"))

    # 檢查 git config
    git_name = _run("git config user.name")
    git_email = _run("git config user.email")
    if not git_name or not git_email:
        issues.append(("Git user 未設定", "git config --global user.name 'Your Name'"))

    if not issues:
        click.echo("✅ 環境健康，無問題！")
    else:
        for i, (issue, fix) in enumerate(issues, 1):
            click.echo(f"  {i}. ❌ {issue}")
            click.echo(f"     🛠️  {fix}\n")


def _parse_env(path: Path) -> dict[str, str]:
    envs = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            envs[key.strip()] = value.strip().strip('"').strip("'")
    return envs


def _which(cmd: str) -> str | None:
    return _run(f"which {cmd}")


def _get_version(cmd: str) -> str | None:
    version_cmds = {
        "git": "git --version",
        "node": "node --version",
        "python3": "python3 --version",
        "ffmpeg": "ffmpeg -version 2>&1 | head -1",
        "clausidian": "clausidian --version 2>/dev/null",
        "jq": "jq --version",
        "rg": "rg --version 2>&1 | head -1",
    }
    cmd_line = version_cmds.get(cmd, f"{cmd} --version")
    result = _run(cmd_line)
    if result:
        # 提取版本號
        import re

        match = re.search(r"[\d]+\.[\d]+[\d.]*", result)
        return match.group(0) if match else result[:20]
    return None


def _run(cmd: str) -> str | None:
    import subprocess

    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None
