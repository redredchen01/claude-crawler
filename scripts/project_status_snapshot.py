#!/usr/bin/env python3
"""
Project Status Snapshot Script
扫描 ~/YD 2026/projects/*/ 下的 Git 状态、最后修改时间、体积
输出 JSON 到 ~/YD 2026/data/projects_snapshot.json
"""

import json
import os
import subprocess
from datetime import datetime
from pathlib import Path

# 配置
PROJECTS_ROOT = Path("/Users/dex/YD 2026/projects")
OUTPUT_PATH = Path("/Users/dex/YD 2026/data/projects_snapshot.json")
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)


def run_git_command(cwd: Path, args: list) -> tuple:
    """运行 Git 命令，返回 (stdout, stderr, returncode)"""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except subprocess.TimeoutExpired:
        return "", "Command timed out", -1
    except FileNotFoundError:
        return "", "Git not found", -1
    except Exception as e:
        return "", str(e), -1


def get_git_status(project_path: Path) -> dict:
    """获取 Git 状态信息"""
    git_dir = project_path / ".git"
    if not git_dir.exists():
        return {"is_git_repo": False}

    status = {"is_git_repo": True}

    # 获取当前分支
    stdout, _, _ = run_git_command(project_path, ["rev-parse", "--abbrev-ref", "HEAD"])
    status["branch"] = stdout if stdout else "unknown"

    # 检查是否有未提交的修改
    stdout, _, _ = run_git_command(project_path, ["status", "--porcelain"])
    status["has_changes"] = bool(stdout)
    status["uncommitted_files"] = len(stdout.splitlines()) if stdout else 0

    # 获取最后一次提交信息
    stdout, _, _ = run_git_command(project_path, ["log", "-1", "--format=%H|%an|%ae|%ad|%s"])
    if stdout:
        parts = stdout.split("|", 4)
        if len(parts) >= 5:
            status["last_commit"] = {
                "hash": parts[0][:8],
                "author": parts[1],
                "email": parts[2],
                "date": parts[3],
                "message": parts[4]
            }
    else:
        status["last_commit"] = None

    # 获取提交数量
    stdout, _, _ = run_git_command(project_path, ["rev-list", "--count", "HEAD"])
    status["commit_count"] = int(stdout) if stdout.isdigit() else 0

    # 获取最新tag
    stdout, _, _ = run_git_command(project_path, ["describe", "--tags", "--always"])
    status["latest_tag"] = stdout if stdout else None

    return status


def get_directory_size(path: Path) -> int:
    """计算目录体积（字节）"""
    total_size = 0
    try:
        for dirpath, dirnames, filenames in os.walk(path):
            for filename in filenames:
                filepath = Path(dirpath) / filename
                try:
                    total_size += filepath.stat().st_size
                except (OSError, FileNotFoundError):
                    pass
    except PermissionError:
        pass
    return total_size


def get_last_modified(path: Path) -> str:
    """获取目录最后修改时间"""
    try:
        last_mtime = path.stat().st_mtime
        for item in path.rglob("*"):
            try:
                if item.stat().st_mtime > last_mtime:
                    last_mtime = item.stat().st_mtime
            except (OSError, FileNotFoundError):
                pass
        return datetime.fromtimestamp(last_mtime).isoformat()
    except Exception:
        return ""


def human_readable_size(size_bytes: int) -> str:
    """转换为人类可读的大小"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"


def categorize_project(project_path: Path) -> str:
    """根据路径分类项目"""
    parts = project_path.parts
    try:
        idx = parts.index("projects")
        if idx + 1 < len(parts):
            category = parts[idx + 1]
            return category if category in ["production", "tools", "archive", "experimental", "skills-publishing"] else "other"
    except ValueError:
        pass
    return "unknown"


def scan_projects():
    """扫描项目目录"""
    if not PROJECTS_ROOT.exists():
        return {
            "scan_time": datetime.now().isoformat(),
            "error": f"路径不存在: {PROJECTS_ROOT}"
        }

    projects_data = []
    category_summary = {}

    try:
        for category_dir in PROJECTS_ROOT.iterdir():
            if category_dir.is_dir() and category_dir.name not in ['.DS_Store', '.git']:
                category = category_dir.name
                projects_in_category = []

                for project_dir in category_dir.iterdir():
                    if project_dir.is_dir() and project_dir.name not in ['.DS_Store']:
                        project_info = {
                            "name": project_dir.name,
                            "path": str(project_dir),
                            "category": category,
                            "size_bytes": None,
                            "size_human": None,
                            "last_modified": None,
                            "git": None
                        }

                        try:
                            project_info["size_bytes"] = get_directory_size(project_dir)
                            project_info["size_human"] = human_readable_size(project_info["size_bytes"])
                            project_info["last_modified"] = get_last_modified(project_dir)
                            project_info["git"] = get_git_status(project_dir)
                        except Exception as e:
                            project_info["error"] = str(e)

                        projects_data.append(project_info)
                        projects_in_category.append(project_info)

                # 计算分类统计
                if projects_in_category:
                    total_size = sum(p.get("size_bytes", 0) or 0 for p in projects_in_category)
                    git_repos = sum(1 for p in projects_in_category if p.get("git", {}).get("is_git_repo"))
                    dirty_repos = sum(1 for p in projects_in_category if p.get("git", {}).get("has_changes", False))
                    category_summary[category] = {
                        "project_count": len(projects_in_category),
                        "total_size_human": human_readable_size(total_size),
                        "git_repos": git_repos,
                        "dirty_repos": dirty_repos
                    }

    except PermissionError as e:
        return {
            "scan_time": datetime.now().isoformat(),
            "error": f"权限错误: {e}"
        }

    # 排序：按类型和名称
    projects_data.sort(key=lambda x: (x["category"], x["name"]))

    result = {
        "scan_time": datetime.now().isoformat(),
        "projects_root": str(PROJECTS_ROOT),
        "summary": {
            "total_projects": len(projects_data),
            "total_git_repos": sum(1 for p in projects_data if p.get("git", {}).get("is_git_repo")),
            "dirty_repos": sum(1 for p in projects_data if p.get("git", {}).get("has_changes", False)),
            "categories": list(category_summary.keys())
        },
        "category_summary": category_summary,
        "projects": projects_data,
        "status": "success"
    }

    return result


def main():
    try:
        result = scan_projects()
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        if result.get('status') == 'success':
            print(f"[project_snapshot] Scan completed: {result['summary']['total_projects']} projects")
        else:
            print(f"[project_snapshot] Error: {result.get('error')}")
    except Exception as e:
        error_result = {
            "scan_time": datetime.now().isoformat(),
            "error": str(e),
            "status": "failed"
        }
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(error_result, f, ensure_ascii=False, indent=2)
        print(f"[project_snapshot] Critical error: {e}")


if __name__ == "__main__":
    main()
