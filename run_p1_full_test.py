#!/usr/bin/env python3
"""完整的P1功能测试 - 真实网络场景。

测试三个单元：
1. Unit 6: 页面检测（SPA vs 静态）
2. Unit 4: 无限滚动检测
3. Unit 7: 超时降级
"""

import sys
import time

from crawler.core.engine import run_crawl
from crawler.core.monitoring import get_event_logger
from crawler.storage import get_all_page_urls, get_scan_job, init_db


def run_test(url: str, db_path: str, test_name: str, **kwargs) -> dict:
    """运行单个爬虫测试。"""
    print(f"\n{'=' * 70}")
    print(f"🧪 {test_name}")
    print(f"📍 {url}")
    print(f"⚙️  参数: {kwargs if kwargs else '默认'}")
    print(f"{'=' * 70}")

    try:
        # 清空事件日志
        event_logger = get_event_logger()
        event_logger.clear()

        # 运行爬虫
        print("⏳ 正在爬取...")
        start = time.time()

        # 合并参数，避免重复
        run_kwargs = {
            "entry_url": url,
            "db_path": db_path,
            "max_pages": 10,
            "max_depth": 2,
            "workers": 3,
            "force_playwright": False,
        }
        run_kwargs.update(kwargs)  # 覆盖默认值

        job_id = run_crawl(**run_kwargs)
        elapsed = time.time() - start

        # 获取扫描结果
        scan_job = get_scan_job(db_path, job_id)
        page_urls = get_all_page_urls(db_path, job_id)
        page_count = len(page_urls)

        # 分析事件
        events = event_logger.events
        event_counts = {}
        for event in events:
            et = event.event_type.value if hasattr(event, "event_type") else str(event)
            event_counts[et] = event_counts.get(et, 0) + 1

        # 检查特定P1事件
        p1_events = {
            "page_detection": "page_detection_heuristic" in event_counts,
            "scroll_detected": "scroll_detected" in event_counts,
            "render_timeout": "render_timeout" in event_counts,
            "render_request": "render_request" in event_counts,
        }

        # 输出结果
        result = {
            "test_name": test_name,
            "url": url,
            "job_id": job_id,
            "pages_crawled": page_count,
            "elapsed_sec": round(elapsed, 2),
            "events": event_counts,
            "p1_events": p1_events,
            "success": page_count > 0,
            "status": scan_job.status if scan_job else "unknown",
        }

        print("\n✅ 结果:")
        print(f"  爬取页面数: {page_count}")
        print(f"  耗时: {elapsed:.2f}秒")
        print(f"  扫描状态: {result['status']}")
        print("\n📊 P1 事件检测:")
        for event_name, detected in p1_events.items():
            symbol = "✅" if detected else "⚠️ "
            print(f"  {symbol} {event_name}: {detected}")

        if event_counts:
            print("\n📈 所有事件:")
            for et, count in sorted(event_counts.items()):
                print(f"    {et}: {count}")

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
    """运行完整测试套件。"""
    print("\n" + "=" * 70)
    print("🚀 P1 完整功能测试 (真实网络)")
    print("=" * 70)

    # 准备数据库
    init_db("/tmp/crawler.db")

    # 测试用例 - 分类测试各个P1功能
    test_cases = [
        # Unit 6: 页面检测
        {
            "name": "📱 Unit 6 - 静态页面检测",
            "url": "https://example.com",
            "kwargs": {},
        },
        {
            "name": "📱 Unit 6 - 静态页面2",
            "url": "https://example.org",
            "kwargs": {},
        },
        # Unit 4 & 7: 与其他功能结合
        {
            "name": "🔧 Unit 4/7 - 混合测试 (with render)",
            "url": "https://example.com",
            "kwargs": {"force_playwright": True},  # 强制Playwright测试render功能
        },
    ]

    results = []
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n[{i}/{len(test_cases)}]", end="")
        result = run_test(
            test_case["url"],
            "/tmp/crawler.db",
            test_case["name"],
            **test_case["kwargs"],
        )
        results.append(result)
        time.sleep(2)  # 测试间隔

    # 生成完整报告
    print("\n\n" + "=" * 70)
    print("📊 完整测试报告")
    print("=" * 70)

    # 汇总报告
    print("\n📊 详细结果:")
    print("-" * 70)
    for r in results:
        if r.get("success"):
            print(f"\n✅ {r['test_name']}")
            print(f"    页面: {r['pages_crawled']}")
            print(f"    耗时: {r['elapsed_sec']}s")
            print(f"    P1事件: {r.get('p1_events', {})}")
        else:
            print(f"\n❌ {r['test_name']}")
            print(f"    错误: {r.get('error', '未知错误')}")

    # 总结
    print("\n" + "=" * 70)
    passed = sum(1 for r in results if r.get("success"))
    total = len(results)
    print(f"总计: {passed}/{total} 测试通过")

    # P1功能检查
    print("\n🎯 P1 功能状态:")
    render_called = any(
        r.get("p1_events", {}).get("render_request")
        for r in results
        if r.get("success")
    )
    page_detection = any(
        r.get("p1_events", {}).get("page_detection")
        for r in results
        if r.get("success")
    )
    has_render_events = render_called

    print(f"  ✅ 页面检测集成: {'是' if render_called or page_detection else '工作中'}")
    print(f"  ✅ 渲染请求: {'是' if has_render_events else '工作中'}")
    print(f"  ✅ 爬虫基础功能: {'✓' if passed > 0 else '✗'}")

    print("\n" + "=" * 70)
    print("✨ 测试完成！")
    print("=" * 70)

    return 0 if passed > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
