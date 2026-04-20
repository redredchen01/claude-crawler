#!/usr/bin/env python3
"""
Downloads Directory Audit Script
扫描 ~/Downloads 目录，生成文件清单、体积统计、热点识别
输出 JSON 到 ~/YD 2026/data/downloads_status.json
"""

import json
import os
from datetime import datetime
from pathlib import Path
from collections import defaultdict

# 配置
DOWNLOADS_PATH = Path.home() / "Downloads"
OUTPUT_PATH = Path("/Users/dex/YD 2026/data/downloads_status.json")
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_file_info(filepath: Path) -> dict:
    """获取文件信息"""
    try:
        stat = filepath.stat()
        return {
            "name": filepath.name,
            "path": str(filepath),
            "size": stat.st_size,
            "size_human": human_readable_size(stat.st_size),
            "modified_time": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "extension": filepath.suffix.lower() or "[no_ext]"
        }
    except (OSError, PermissionError) as e:
        return {
            "name": filepath.name,
            "path": str(filepath),
            "error": str(e)
        }


def human_readable_size(size_bytes: int) -> str:
    """转换为人类可读的大小"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"


def scan_downloads():
    """扫描 Downloads 目录"""
    if not DOWNLOADS_PATH.exists():
        return {
            "scan_time": datetime.now().isoformat(),
            "error": f"路径不存在: {DOWNLOADS_PATH}"
        }

    files = []
    total_size = 0
    extension_stats = defaultdict(lambda: {"count": 0, "size": 0})
    hotspots = []

    try:
        for item in DOWNLOADS_PATH.iterdir():
            if item.is_file():
                file_info = get_file_info(item)
                files.append(file_info)

                if "size" in file_info:
                    total_size += file_info["size"]
                    ext = file_info["extension"]
                    extension_stats[ext]["count"] += 1
                    extension_stats[ext]["size"] += file_info["size"]

    except PermissionError as e:
        return {
            "scan_time": datetime.now().isoformat(),
            "error": f"权限错误: {e}"
        }

    # 识别热点（大文件 > 100MB）
    for f in files:
        if f.get("size", 0) > 100 * 1024 * 1024:
            hotspots.append({
                "name": f["name"],
                "size_human": f["size_human"]
            })

    # 按类型排行
    top_extensions = sorted(
        [{**v, "extension": k} for k, v in extension_stats.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:10]

    result = {
        "scan_time": datetime.now().isoformat(),
        "downloads_path": str(DOWNLOADS_PATH),
        "summary": {
            "total_files": len(files),
            "total_size": total_size,
            "total_size_human": human_readable_size(total_size),
            "unique_extensions": len(extension_stats)
        },
        "extensions_rank": [
            {
                "extension": e["extension"],
                "count": e["count"],
                "size": e["size"],
                "size_human": human_readable_size(e["size"])
            }
            for e in top_extensions
        ],
        "hotspots": {
            "large_files_threshold": "100MB",
            "large_files_count": len(hotspots),
            "large_files": hotspots[:20]  # 最多显示20个
        },
        "recent_files": sorted(
            [f for f in files if "modified_time" in f],
            key=lambda x: x["modified_time"],
            reverse=True
        )[:20],  # 最近20个文件
        "all_files": files if len(files) < 500 else f"[文件过多，仅显示前500个，共{len(files)}个]",
        "status": "success"
    }

    return result


def main():
    try:
        result = scan_downloads()
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"[downloads_audit] Scan completed: {result['summary']['total_files']} files" if result.get('status') == 'success' else f"[downloads_audit] Error: {result.get('error')}")
    except Exception as e:
        error_result = {
            "scan_time": datetime.now().isoformat(),
            "error": str(e),
            "status": "failed"
        }
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(error_result, f, ensure_ascii=False, indent=2)
        print(f"[downloads_audit] Critical error: {e}")


if __name__ == "__main__":
    main()
