#!/usr/bin/env python3
"""性能测试：验证P2模块缓存效果"""

import time
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline
from cover_selector.core.analyzer_cache import clear_cache


def benchmark_pipeline(video_path: str, num_runs: int = 3, use_cache: bool = True):
    """运行管道多次，测量性能"""

    config = CoverSelectorConfig()
    output_dir = Path(__file__).parent / "output" / "benchmark"
    output_dir.mkdir(parents=True, exist_ok=True)

    results = {
        "cache_enabled": use_cache,
        "num_runs": num_runs,
        "runs": []
    }

    print(f"\n{'='*60}")
    print(f"🎯 性能测试：{'缓存启用' if use_cache else '缓存禁用'}")
    print(f"{'='*60}")

    for run_num in range(num_runs):
        if not use_cache:
            clear_cache()

        pipeline = VideoToTripleCollagePipeline(config)

        start_time = time.time()
        pipeline_result = pipeline.run(video_path=video_path, output_dir=output_dir)
        elapsed = time.time() - start_time

        results["runs"].append({
            "run": run_num + 1,
            "elapsed_sec": round(elapsed, 3),
            "scenes_count": pipeline_result["scenes_count"],
            "candidates_count": pipeline_result["candidates_count"],
        })

        print(f"Run {run_num + 1}: {elapsed:.3f}s (Scenes: {pipeline_result['scenes_count']}, Candidates: {pipeline_result['candidates_count']})")

    # 计算统计
    times = [r["elapsed_sec"] for r in results["runs"]]
    results["stats"] = {
        "min": round(min(times), 3),
        "max": round(max(times), 3),
        "avg": round(sum(times) / len(times), 3),
        "first_run": round(times[0], 3),
        "subsequent_avg": round(sum(times[1:]) / (len(times) - 1), 3) if len(times) > 1 else None,
    }

    return results


def main():
    # 查找测试视频
    test_video = Path("/tmp/test_video.mp4")
    if not test_video.exists():
        print(f"❌ 测试视频不存在：{test_video}")
        print("   运行此命令创建：ffmpeg -f lavfi -i color=c=blue:s=320x240:d=5 -f lavfi -i sine=f=1000:d=5 -y /tmp/test_video.mp4")
        return

    print(f"📹 测试视频：{test_video}")
    print(f"📊 运行次数：3 次\n")

    # 测试1：禁用缓存
    results_no_cache = benchmark_pipeline(str(test_video), num_runs=3, use_cache=False)

    # 测试2：启用缓存
    results_cache = benchmark_pipeline(str(test_video), num_runs=3, use_cache=True)

    # 对比分析
    print(f"\n{'='*60}")
    print("📈 性能对比分析")
    print(f"{'='*60}")

    no_cache_avg = results_no_cache["stats"]["avg"]
    cache_avg = results_cache["stats"]["avg"]
    improvement = ((no_cache_avg - cache_avg) / no_cache_avg) * 100

    print(f"\n禁用缓存（每次重新初始化）:")
    print(f"  首次运行: {results_no_cache['stats']['first_run']:.3f}s")
    print(f"  平均耗时: {no_cache_avg:.3f}s")
    print(f"  (最快: {results_no_cache['stats']['min']:.3f}s, 最慢: {results_no_cache['stats']['max']:.3f}s)")

    print(f"\n启用缓存（模块重用）:")
    print(f"  首次运行: {results_cache['stats']['first_run']:.3f}s")
    print(f"  后续平均: {results_cache['stats']['subsequent_avg']:.3f}s" if results_cache['stats']['subsequent_avg'] else "  N/A")
    print(f"  平均耗时: {cache_avg:.3f}s")
    print(f"  (最快: {results_cache['stats']['min']:.3f}s, 最慢: {results_cache['stats']['max']:.3f}s)")

    print(f"\n✨ 性能提升：{improvement:.1f}% ({'✅ 目标达成' if improvement >= 15 else '⚠️ 未达预期目标'})")
    print(f"   期望：15-25% | 实际：{improvement:.1f}%")

    # 保存结果
    report = {
        "test_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "cache_improvement_percent": round(improvement, 1),
        "no_cache": results_no_cache,
        "with_cache": results_cache,
    }

    report_path = Path(__file__).parent / "output" / "benchmark" / "cache_performance.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2))
    print(f"\n📊 报告已保存：{report_path}")

    return improvement >= 15


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
