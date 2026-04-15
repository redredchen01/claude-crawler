#!/usr/bin/env python3
"""性能测试：对比顺序处理 vs 并行处理"""

import time
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline
from cover_selector.core.parallel_pipeline import ParallelVideoToTripleCollagePipeline
from cover_selector.core.analyzer_cache import clear_cache


def benchmark_sequential(video_path: str, num_runs: int = 2):
    """运行顺序管道"""
    config = CoverSelectorConfig()
    output_dir = Path(__file__).parent / "output" / "benchmark"
    output_dir.mkdir(parents=True, exist_ok=True)

    results = {"type": "sequential", "runs": []}

    print(f"\n{'='*60}")
    print(f"⏸️  顺序处理（单线程）")
    print(f"{'='*60}")

    for run_num in range(num_runs):
        clear_cache()
        pipeline = VideoToTripleCollagePipeline(config)

        start_time = time.time()
        pipeline_result = pipeline.run(video_path=video_path, output_dir=output_dir)
        elapsed = time.time() - start_time

        results["runs"].append({
            "run": run_num + 1,
            "elapsed_sec": round(elapsed, 3),
        })

        print(f"Run {run_num + 1}: {elapsed:.3f}s")

    return results


def benchmark_parallel(video_path: str, num_runs: int = 2, max_workers: int = 4):
    """运行并行管道"""
    config = CoverSelectorConfig()
    output_dir = Path(__file__).parent / "output" / "benchmark"
    output_dir.mkdir(parents=True, exist_ok=True)

    results = {"type": "parallel", "max_workers": max_workers, "runs": []}

    print(f"\n{'='*60}")
    print(f"⚡ 并行处理（{max_workers} workers）")
    print(f"{'='*60}")

    for run_num in range(num_runs):
        clear_cache()
        pipeline = ParallelVideoToTripleCollagePipeline(config, max_workers=max_workers)

        start_time = time.time()
        pipeline_result = pipeline.run(video_path=video_path, output_dir=output_dir)
        elapsed = time.time() - start_time

        results["runs"].append({
            "run": run_num + 1,
            "elapsed_sec": round(elapsed, 3),
        })

        print(f"Run {run_num + 1}: {elapsed:.3f}s")

    return results


def main():
    # 查找测试视频
    test_video = Path("/tmp/test_video_large.mp4")
    if not test_video.exists():
        print(f"❌ 测试视频不存在：{test_video}")
        return

    print(f"📹 测试视频：{test_video}")
    print(f"📊 运行次数：2 次\n")

    # 顺序处理
    seq_results = benchmark_sequential(str(test_video), num_runs=2)

    # 并行处理（4个workers）
    par_results = benchmark_parallel(str(test_video), num_runs=2, max_workers=4)

    # 对比
    seq_avg = sum(r["elapsed_sec"] for r in seq_results["runs"]) / len(seq_results["runs"])
    par_avg = sum(r["elapsed_sec"] for r in par_results["runs"]) / len(par_results["runs"])
    speedup = seq_avg / par_avg if par_avg > 0 else 1.0

    print(f"\n{'='*60}")
    print("📈 性能对比")
    print(f"{'='*60}")

    print(f"\n顺序处理:")
    print(f"  平均耗时: {seq_avg:.3f}s")
    print(f"  单次范围: {min(r['elapsed_sec'] for r in seq_results['runs']):.3f}s - {max(r['elapsed_sec'] for r in seq_results['runs']):.3f}s")

    print(f"\n并行处理 (4 workers):")
    print(f"  平均耗时: {par_avg:.3f}s")
    print(f"  单次范围: {min(r['elapsed_sec'] for r in par_results['runs']):.3f}s - {max(r['elapsed_sec'] for r in par_results['runs']):.3f}s")

    print(f"\n✨ 加速倍数: {speedup:.2f}x")
    if speedup > 1.2:
        print(f"   ✅ 性能提升显著（目标：1.2x 以上）")
    else:
        print(f"   ℹ️  性能差异不明显（帧数少、IO密集）")

    # 保存报告
    report = {
        "test_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "speedup": round(speedup, 2),
        "sequential": seq_results,
        "parallel": par_results,
    }

    report_path = Path(__file__).parent / "output" / "benchmark" / "parallel_performance.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2))
    print(f"\n📊 报告已保存：{report_path}")

    return speedup > 1.2


if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"❌ 错误：{e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
