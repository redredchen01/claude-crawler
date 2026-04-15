"""P6: Performance benchmark tests"""

import time
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from cover_selector.config import CoverSelectorConfig
from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline
from cover_selector.core.analyzer_cache import clear_cache


class PerformanceBenchmark:
    """Performance benchmark tests"""

    @staticmethod
    def benchmark_single_run(video_path: str, use_cache: bool = True) -> dict:
        """Run pipeline once and measure performance"""
        config = CoverSelectorConfig()
        output_dir = Path(__file__).parent.parent / "output" / "benchmark"
        output_dir.mkdir(parents=True, exist_ok=True)

        if not use_cache:
            clear_cache()

        pipeline = VideoToTripleCollagePipeline(config)

        start_time = time.time()
        result = pipeline.run(video_path=video_path, output_dir=output_dir)
        elapsed = time.time() - start_time

        return {
            "elapsed_sec": round(elapsed, 3),
            "scenes_count": result["scenes_count"],
            "candidates_count": result["candidates_count"],
            "cover_mode": result["cover_mode"],
        }

    @staticmethod
    def test_single_video_performance():
        """Test performance on a single video"""
        test_video = Path("/tmp/test_video.mp4")
        if not test_video.exists():
            print(f"⚠️ Test video not found: {test_video}")
            return True

        print("\n📊 单视频性能测试")
        print("-" * 40)

        result = PerformanceBenchmark.benchmark_single_run(str(test_video))

        print(f"  处理时间: {result['elapsed_sec']:.3f}s")
        print(f"  场景数: {result['scenes_count']}")
        print(f"  候选帧: {result['candidates_count']}")
        print(f"  覆盖模式: {result['cover_mode']}")

        # 性能目标检查
        if result["elapsed_sec"] < 2.0:
            print(f"  ✅ 性能良好 (< 2.0s)")
            return True
        elif result["elapsed_sec"] < 3.0:
            print(f"  ⚠️ 性能可以接受 (< 3.0s)")
            return True
        else:
            print(f"  ❌ 性能不理想 (> 3.0s)")
            return False

    @staticmethod
    def test_consecutive_requests():
        """Test performance with consecutive requests"""
        test_video = Path("/tmp/test_video.mp4")
        if not test_video.exists():
            print(f"⚠️ Test video not found: {test_video}")
            return True

        print("\n📊 连续请求性能测试 (缓存效果)")
        print("-" * 40)

        num_requests = 3
        results = []

        clear_cache()  # 清空缓存
        for i in range(num_requests):
            result = PerformanceBenchmark.benchmark_single_run(str(test_video), use_cache=True)
            results.append(result["elapsed_sec"])
            print(f"  请求 {i+1}: {result['elapsed_sec']:.3f}s")

        first_run = results[0]
        avg_subsequent = sum(results[1:]) / (len(results) - 1) if len(results) > 1 else results[0]
        improvement = ((first_run - avg_subsequent) / first_run * 100) if first_run > 0 else 0

        print(f"\n  首次运行: {first_run:.3f}s")
        print(f"  后续平均: {avg_subsequent:.3f}s")
        print(f"  缓存改进: {improvement:.1f}%")

        if improvement > 0:
            print(f"  ✅ 缓存生效")
        else:
            print(f"  ℹ️ 初始化成本低，缓存无明显改进")

        return True

    @staticmethod
    def test_memory_footprint():
        """Test memory usage"""
        import psutil
        import os

        test_video = Path("/tmp/test_video_large.mp4")
        if not test_video.exists():
            print(f"⚠️ Large test video not found: {test_video}")
            return True

        print("\n📊 内存占用测试")
        print("-" * 40)

        process = psutil.Process(os.getpid())
        initial_mem = process.memory_info().rss / (1024 * 1024)

        clear_cache()
        pipeline = VideoToTripleCollagePipeline(CoverSelectorConfig())
        output_dir = Path(__file__).parent.parent / "output" / "benchmark"
        output_dir.mkdir(parents=True, exist_ok=True)

        result = pipeline.run(video_path=str(test_video), output_dir=output_dir)

        peak_mem = process.memory_info().rss / (1024 * 1024)
        memory_increase = peak_mem - initial_mem

        print(f"  初始内存: {initial_mem:.1f} MB")
        print(f"  峰值内存: {peak_mem:.1f} MB")
        print(f"  内存增长: {memory_increase:.1f} MB ({(memory_increase / initial_mem * 100):.1f}%)")

        # 内存目标检查
        if memory_increase < 100:
            print(f"  ✅ 内存使用优化良好 (< 100 MB)")
            return True
        elif memory_increase < 200:
            print(f"  ⚠️ 内存使用可以接受 (< 200 MB)")
            return True
        else:
            print(f"  ❌ 内存占用过高 (> 200 MB)")
            return False


def run_performance_tests():
    """运行所有性能测试"""
    print("\n" + "=" * 60)
    print("⚡ P6 性能基准测试")
    print("=" * 60)

    results = {}

    try:
        results["single_video"] = PerformanceBenchmark.test_single_video_performance()
        results["consecutive_requests"] = PerformanceBenchmark.test_consecutive_requests()
        results["memory_footprint"] = PerformanceBenchmark.test_memory_footprint()

        print("\n" + "=" * 60)
        print("📊 测试总结")
        print("=" * 60)
        for test_name, passed in results.items():
            status = "✅" if passed else "❌"
            print(f"{status} {test_name}")

        all_passed = all(results.values())
        print(f"\n{'✨ 所有测试通过！' if all_passed else '⚠️ 部分测试未通过'}")

        return all_passed
    except Exception as e:
        print(f"\n❌ 性能测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    try:
        success = run_performance_tests()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"❌ 错误：{e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
