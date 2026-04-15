"""P6: Integration tests - Complete HTTP workflow testing"""

import json
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError
import subprocess
import threading
import os
import sys

# 添加src到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


class TestCoverSelectorApp:
    """Integration tests for Cover Selector API"""

    @classmethod
    def setup_class(cls):
        """启动测试服务器"""
        cls.port = 8003  # 使用不同的端口避免冲突
        cls.base_url = f"http://localhost:{cls.port}"

        # 启动应用服务器（后台）
        os.chdir(Path(__file__).parent.parent)
        cls.server_process = subprocess.Popen(
            [sys.executable, "app.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={**os.environ, "COVER_PORT": str(cls.port)},
        )

        # 等待服务器启动
        time.sleep(2)

    @classmethod
    def teardown_class(cls):
        """关闭测试服务器"""
        if hasattr(cls, "server_process"):
            cls.server_process.terminate()
            cls.server_process.wait(timeout=5)

    def test_health_check(self):
        """Test GET / endpoint"""
        try:
            response = urlopen(f"{self.base_url}/")
            assert response.status == 200
            data = json.loads(response.read())
            assert "service" in data
            assert "endpoints" in data
            print("✅ Health check passed")
        except Exception as e:
            print(f"❌ Health check failed: {e}")
            raise

    def test_api_process_with_video(self):
        """Test POST /api/process with video upload"""
        import urllib.parse

        # 创建测试视频
        test_video = Path("/tmp/test_video.mp4")
        if not test_video.exists():
            print(f"⚠️ Test video not found: {test_video}")
            return

        try:
            # 准备 multipart 表单数据
            with open(test_video, "rb") as f:
                video_data = f.read()

            boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
            body = (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="video"; filename="test_video.mp4"\r\n'
                f"Content-Type: video/mp4\r\n\r\n"
            ).encode() + video_data + f"\r\n--{boundary}--\r\n".encode()

            req = Request(
                f"{self.base_url}/api/process",
                data=body,
                headers={
                    "Content-Type": f"multipart/form-data; boundary={boundary}",
                    "Content-Length": str(len(body)),
                },
                method="POST",
            )

            start_time = time.time()
            response = urlopen(req, timeout=30)
            elapsed = time.time() - start_time

            assert response.status == 200
            result = json.loads(response.read())

            assert result["status"] == "success"
            assert result["scenes_count"] >= 0
            assert result["candidates_count"] >= 0
            assert result["cover_mode"] in ["triple", "degraded"]
            assert result["final_cover"] is not None

            print(f"✅ API process test passed ({elapsed:.2f}s)")
            print(f"   Scenes: {result['scenes_count']}")
            print(f"   Candidates: {result['candidates_count']}")
            print(f"   Mode: {result['cover_mode']}")
        except Exception as e:
            print(f"❌ API process test failed: {e}")
            raise

    def test_invalid_request_handling(self):
        """Test error handling for invalid requests"""
        try:
            # 尝试没有视频的POST请求
            body = b"--boundary\r\n--boundary--\r\n"
            req = Request(
                f"{self.base_url}/api/process",
                data=body,
                headers={"Content-Type": "multipart/form-data; boundary=boundary"},
                method="POST",
            )

            try:
                response = urlopen(req, timeout=10)
                # 应该返回错误状态码
                assert response.status >= 400
            except URLError as e:
                # 预期的错误响应
                assert e.code >= 400
                result = json.loads(e.read())
                assert "error" in result
                print("✅ Error handling test passed")
        except Exception as e:
            print(f"❌ Error handling test failed: {e}")
            raise


def run_integration_tests():
    """运行集成测试"""
    print("\n" + "=" * 60)
    print("🧪 P6 集成测试 - 完整HTTP流程")
    print("=" * 60)

    test_obj = TestCoverSelectorApp()

    try:
        test_obj.setup_class()

        print("\n1️⃣  Health Check...")
        test_obj.test_health_check()

        print("\n2️⃣  API Process Test...")
        test_obj.test_api_process_with_video()

        print("\n3️⃣  Error Handling Test...")
        test_obj.test_invalid_request_handling()

        print("\n✨ All integration tests passed!")
        return True
    except Exception as e:
        print(f"\n❌ Integration tests failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        test_obj.teardown_class()


if __name__ == "__main__":
    success = run_integration_tests()
    sys.exit(0 if success else 1)
