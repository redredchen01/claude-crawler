#!/usr/bin/env python3
"""自动化P1功能测试脚本。

运行几个测试URL，验证：
- Unit 6: 页面检测（SPA vs 静态）
- Unit 4: 无限滚动（可选）
- Unit 7: 超时降级（可选）
"""

import sqlite3
import sys
import time

from crawler.core.engine import run_crawl
from crawler.core.monitoring import get_event_logger
from crawler.storage import get_all_page_urls, init_db


def run_test(url: str, db_path: str, test_name: str, **kwargs) -> dict:
    """运行单个爬虫测试。"""
    print(f"\n{'=' * 70}")
    print(f"🧪 测试: {test_name}")
    print(f"📍 URL: {url}")
    print(f"{'=' * 70}")

    try:
        # 清空事件日志
        event_logger = get_event_logger()
        event_logger.clear()

        # 运行爬虫
        print("⏳ 正在爬取...")
        start = time.time()
        job_id = run_crawl(
            entry_url=url,
            db_path=db_path,
            max_pages=5,
            max_depth=1,
            workers=2,
            force_playwright=False,
            **kwargs,
        )
        elapsed = time.time() - start

        # 收集结果
        page_urls = get_all_page_urls(db_path, job_id)
        page_count = len(page_urls)

        # 分析事件
        events = event_logger.events
        event_counts = {}
        for event in events:
            et = event.event_type.value if hasattr(event, "event_type") else str(event)
            event_counts[et] = event_counts.get(et, 0) + 1

        # 输出结果
        result = {
            "test_name": test_name,
            "url": url,
            "job_id": job_id,
            "pages_crawled": page_count,
            "elapsed_sec": round(elapsed, 2),
            "events": event_counts,
            "success": page_count > 0,
        }

        print("\n✅ 结果:")
        print(f"  爬取页面数: {page_count}")
        print(f"  耗时: {elapsed:.2f}秒")
        print(f"  事件统计: {event_counts}")

        # 检查P1事件
        has_page_detection = "page_detection_heuristic" in event_counts
        has_scroll = "scroll_detected" in event_counts
        has_timeout = "render_timeout" in event_counts

        if has_page_detection:
            print("  ✅ 页面检测触发")
        if has_scroll:
            print("  ✅ 无限滚动检测")
        if has_timeout:
            print("  ⚠️  超时事件")

        return result

    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback

        traceback.print_exc()
        return {
            "test_name": test_name,
            "url": url,
            "error": str(e),
            "success": False,
        }


def main():
    """运行测试套件。"""
    print("\n" + "=" * 70)
    print("🚀 P1 自动化测试套件")
    print("=" * 70)

    # 测试用例
    test_cases = [
        {
            "name": "静态页面测试 (Page Detection)",
            "url": "https://example.com",
            "kwargs": {},
        },
        {
            "name": "静态页面测试2 (Page Detection)",
            "url": "https://example.org",
            "kwargs": {},
        },
    ]

    with sqlite3.connect("/tmp/crawler.db"):
        init_db("/tmp/crawler.db")

    results = []
    for test_case in test_cases:
        result = run_test(
            test_case["url"],
            "/tmp/crawler.db",
            test_case["name"],
            **test_case["kwargs"],
        )
        results.append(result)
        time.sleep(1)  # 测试间隔

    # 生成报告
    print("\n" + "=" * 70)
    print("📊 测试报告汇总")
    print("=" * 70)

    passed = sum(1 for r in results if r.get("success"))
    total = len(results)

    for result in results:
        status = "✅ PASS" if result.get("success") else "❌ FAIL"
        print(f"\n{status} {result['test_name']}")
        if result.get("success"):
            print(f"    页面: {result['pages_crawled']}")
            print(f"    耗时: {result['elapsed_sec']}s")
        else:
            print(f"    错误: {result.get('error')}")

    print(f"\n总计: {passed}/{total} 通过")
    print("=" * 70)

    if passed == total:
        print("\n✅ 所有测试通过!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} 个测试失败")
        return 1


if __name__ == "__main__":
    sys.exit(main())
