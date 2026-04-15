#!/usr/bin/env python3
"""内存使用分析 - 找出优化机会"""

import sys
import psutil
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline


def get_memory_usage():
    """获取当前进程的内存使用（MB）"""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 * 1024)


def main():
    test_video = "/tmp/test_video_large.mp4"
    output_dir = Path(__file__).parent / "output" / "benchmark"
    output_dir.mkdir(parents=True, exist_ok=True)

    print("\n" + "="*60)
    print("📊 内存使用分析")
    print("="*60)

    # 记录初始内存
    initial_mem = get_memory_usage()
    print(f"\n初始内存: {initial_mem:.1f} MB")

    # 运行管道
    print(f"\n处理视频：{test_video}")
    config = CoverSelectorConfig()
    pipeline = VideoToTripleCollagePipeline(config)

    peak_mem = initial_mem
    print("\n处理过程中的内存使用:")
    print("  时间点          | 内存(MB)  | 变化(MB)")
    print("  " + "-" * 50)

    # 监控内存（简单方法：在管道运行前后测量）
    mem_before = get_memory_usage()
    print(f"  管道前          | {mem_before:>8.1f} | +0.0")

    result = pipeline.run(video_path=test_video, output_dir=output_dir)

    mem_after = get_memory_usage()
    peak_mem = max(peak_mem, mem_after)
    print(f"  管道后          | {mem_after:>8.1f} | +{mem_after - mem_before:.1f}")

    # 统计
    print(f"\n📈 统计:")
    print(f"  初始内存:       {initial_mem:.1f} MB")
    print(f"  峰值内存:       {peak_mem:.1f} MB")
    print(f"  峰值增长:       {peak_mem - initial_mem:.1f} MB ({((peak_mem - initial_mem) / initial_mem * 100):.1f}%)")
    print(f"  最终内存:       {mem_after:.1f} MB")
    print(f"  最终增长:       {mem_after - initial_mem:.1f} MB")

    # 识别优化点
    print(f"\n💡 优化建议:")
    if mem_after - initial_mem > 200:
        print(f"  ⚠️  内存增长较大 ({mem_after - initial_mem:.1f} MB)")
        print(f"      建议：添加 gc.collect() 和及时释放大对象")
    else:
        print(f"  ✅ 内存使用合理")

    print(f"\n✨ 处理结果:")
    print(f"  场景数: {result['scenes_count']}")
    print(f"  候选帧: {result['candidates_count']}")
    print(f"  覆盖模式: {result['cover_mode']}")
    print(f"  输出: {result['final_cover']}")


if __name__ == "__main__":
    main()
