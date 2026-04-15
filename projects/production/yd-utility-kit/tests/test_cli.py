"""基礎測試 — ydk CLI 與核心模組"""

import pytest
from click.testing import CliRunner
from ydk.cli import cli


@pytest.fixture
def runner():
    return CliRunner()


class TestCLI:
    def test_help(self, runner):
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "通用工具集" in result.output

    def test_version(self, runner):
        result = runner.invoke(cli, ["--version"])
        assert result.exit_code == 0
        assert "0.4.1" in result.output

    def test_subcommands_exist(self, runner):
        result = runner.invoke(cli, ["--help"])
        for cmd in [
            "file",
            "git",
            "media",
            "text",
            "project",
            "env",
            "sys",
            "json",
            "net",
            "hash",
            "find",
            "batch",
            "watch",
            "llm",
        ]:
            assert cmd in result.output


class TestFileCommands:
    def test_stats(self, runner, tmp_path):
        (tmp_path / "a.py").write_text("print('hello')")
        (tmp_path / "b.txt").write_text("world")
        result = runner.invoke(cli, ["file", "stats", str(tmp_path)])
        assert result.exit_code == 0
        assert "檔案數：2" in result.output

    def test_stale(self, runner, tmp_path):
        result = runner.invoke(cli, ["file", "stale", str(tmp_path)])
        assert result.exit_code == 0


class TestTextCommands:
    def test_wordcount(self, runner, tmp_path):
        (tmp_path / "test.md").write_text("# Hello\n\nThis is a test.")
        result = runner.invoke(cli, ["text", "wordcount", str(tmp_path)])
        assert result.exit_code == 0
        assert "檔案：1" in result.output

    def test_frontmatter(self, runner, tmp_path):
        fm_file = tmp_path / "note.md"
        fm_file.write_text("---\ntitle: Test\n---\nContent")
        result = runner.invoke(cli, ["text", "frontmatter", str(fm_file)])
        assert result.exit_code == 0
        assert "title" in result.output

    def test_no_frontmatter(self, runner, tmp_path):
        fm_file = tmp_path / "plain.md"
        fm_file.write_text("# Just content")
        result = runner.invoke(cli, ["text", "frontmatter", str(fm_file)])
        assert "沒有 frontmatter" in result.output

    def test_replace_dry_run(self, runner, tmp_path):
        f = tmp_path / "test.txt"
        f.write_text("hello world hello")
        result = runner.invoke(
            cli, ["text", "replace", str(f), "-f", "hello", "-r", "hi", "--dry-run"]
        )
        assert result.exit_code == 0
        assert "2 處" in result.output
        assert f.read_text() == "hello world hello"  # 未修改


class TestGitCommands:
    def test_summary(self, runner):
        result = runner.invoke(cli, ["git", "summary"])
        # 可能在非 git 目錄，不報錯即可
        assert result.exit_code in (0, 1)


class TestProjectCommands:
    def test_list(self, runner):
        result = runner.invoke(cli, ["project", "list"])
        assert result.exit_code == 0

    def test_health(self, runner):
        result = runner.invoke(cli, ["project", "health"])
        assert result.exit_code == 0
        assert "✅" in result.output or "⚠️" in result.output

    def test_cd_not_found(self, runner):
        result = runner.invoke(cli, ["project", "cd", "nonexistent-project-xyz"])
        assert result.exit_code != 0

    def test_cd_gwx(self, runner):
        result = runner.invoke(cli, ["project", "cd", "gwx"])
        if result.exit_code == 0:
            assert "gwx" in result.output


class TestEnvCommands:
    def test_check(self, runner):
        result = runner.invoke(cli, ["env", "check"])
        assert result.exit_code == 0

    def test_doctor(self, runner):
        result = runner.invoke(cli, ["env", "doctor"])
        assert result.exit_code == 0

    def test_get_all(self, runner):
        result = runner.invoke(cli, ["env", "get"])
        # 可能有 .env 或沒有
        assert result.exit_code == 0


class TestSysCommands:
    def test_status(self, runner):
        result = runner.invoke(cli, ["sys", "status"])
        assert result.exit_code == 0

    def test_doctor(self, runner):
        result = runner.invoke(cli, ["sys", "doctor"])
        assert result.exit_code == 0
        assert "Health Score" in result.output

    def test_top(self, runner):
        result = runner.invoke(cli, ["sys", "top"])
        assert result.exit_code == 0


class TestJsonCommands:
    def test_fmt(self, runner, tmp_path):
        f = tmp_path / "test.json"
        f.write_text('{"a":1,"b":2}')
        result = runner.invoke(cli, ["json", "fmt", str(f)])
        assert result.exit_code == 0
        assert '"a"' in result.output

    def test_fmt_in_place(self, runner, tmp_path):
        f = tmp_path / "test.json"
        f.write_text('{"a":1}')
        result = runner.invoke(cli, ["json", "fmt", str(f), "-w"])
        assert result.exit_code == 0
        assert '"a"' in f.read_text()

    def test_keys(self, runner, tmp_path):
        f = tmp_path / "test.json"
        f.write_text('{"name": "test", "count": 42}')
        result = runner.invoke(cli, ["json", "keys", str(f)])
        assert result.exit_code == 0
        assert "name" in result.output
        assert "count" in result.output

    def test_get(self, runner, tmp_path):
        f = tmp_path / "test.json"
        f.write_text('{"user": {"name": "dex"}}')
        result = runner.invoke(cli, ["json", "get", str(f), "-q", "user.name"])
        assert result.exit_code == 0
        assert "dex" in result.output

    def test_validate_valid(self, runner, tmp_path):
        f = tmp_path / "valid.json"
        f.write_text('{"a": 1}')
        result = runner.invoke(cli, ["json", "validate", str(f)])
        assert result.exit_code == 0
        assert "有效" in result.output

    def test_validate_invalid(self, runner, tmp_path):
        f = tmp_path / "invalid.json"
        f.write_text('{"a": invalid}')
        result = runner.invoke(cli, ["json", "validate", str(f)])
        assert result.exit_code != 0

    def test_diff_same(self, runner, tmp_path):
        a = tmp_path / "a.json"
        b = tmp_path / "b.json"
        a.write_text('{"x": 1}')
        b.write_text('{"x": 1}')
        result = runner.invoke(cli, ["json", "diff", str(a), str(b)])
        assert result.exit_code == 0
        assert "相同" in result.output

    def test_diff_different(self, runner, tmp_path):
        a = tmp_path / "a.json"
        b = tmp_path / "b.json"
        a.write_text('{"x": 1}')
        b.write_text('{"x": 2}')
        result = runner.invoke(cli, ["json", "diff", str(a), str(b)])
        assert result.exit_code == 0
        assert "差異" in result.output

    def test_flatten(self, runner, tmp_path):
        f = tmp_path / "nested.json"
        f.write_text('{"a": {"b": 1}}')
        result = runner.invoke(cli, ["json", "flatten", str(f)])
        assert result.exit_code == 0
        assert "a.b" in result.output


class TestNetCommands:
    def test_check(self, runner):
        result = runner.invoke(cli, ["net", "check", "localhost", "-p", "22"])
        # 連線成功或失敗都不報錯
        assert result.exit_code == 0

    def test_scan(self, runner):
        result = runner.invoke(cli, ["net", "scan", "localhost", "-p", "22,80"])
        assert result.exit_code == 0
        assert "結果:" in result.output


class TestHashCommands:
    def test_file_sha256(self, runner, tmp_path):
        f = tmp_path / "test.txt"
        f.write_text("hello")
        result = runner.invoke(cli, ["hash", "file", str(f)])
        assert result.exit_code == 0
        assert "2cf24dba" in result.output  # sha256 of "hello"

    def test_file_md5(self, runner, tmp_path):
        f = tmp_path / "test.txt"
        f.write_text("hello")
        result = runner.invoke(cli, ["hash", "file", str(f), "-a", "md5"])
        assert result.exit_code == 0
        assert "5d41402abc" in result.output  # md5 of "hello"

    def test_text_hash(self, runner):
        result = runner.invoke(cli, ["hash", "text", "hello"])
        assert result.exit_code == 0
        assert "sha256:" in result.output

    def test_compare_same(self, runner, tmp_path):
        a = tmp_path / "a.txt"
        b = tmp_path / "b.txt"
        a.write_text("same content")
        b.write_text("same content")
        result = runner.invoke(cli, ["hash", "compare", str(a), str(b)])
        assert result.exit_code == 0
        assert "相同" in result.output

    def test_compare_different(self, runner, tmp_path):
        a = tmp_path / "a.txt"
        b = tmp_path / "b.txt"
        a.write_text("content A")
        b.write_text("content B")
        result = runner.invoke(cli, ["hash", "compare", str(a), str(b)])
        assert result.exit_code == 0
        assert "不同" in result.output

    def test_manifest(self, runner, tmp_path):
        (tmp_path / "a.txt").write_text("hello")
        (tmp_path / "b.txt").write_text("world")
        result = runner.invoke(cli, ["hash", "manifest", str(tmp_path)])
        assert result.exit_code == 0
        assert "2 files" in result.output


class TestFindCommands:
    def test_grep(self, runner, tmp_path):
        (tmp_path / "a.txt").write_text("hello world")
        (tmp_path / "b.txt").write_text("goodbye world")
        result = runner.invoke(cli, ["find", "grep", str(tmp_path), "hello"])
        assert result.exit_code == 0
        assert "a.txt" in result.output

    def test_grep_count(self, runner, tmp_path):
        (tmp_path / "a.txt").write_text("hello\nhello\nworld")
        result = runner.invoke(cli, ["find", "grep", str(tmp_path), "hello", "-c"])
        assert result.exit_code == 0
        assert "2 matches" in result.output

    def test_files(self, runner, tmp_path):
        (tmp_path / "a.py").write_text("x")
        (tmp_path / "b.txt").write_text("y")
        result = runner.invoke(cli, ["find", "files", str(tmp_path), "-e", ".py"])
        assert result.exit_code == 0
        assert "a.py" in result.output

    def test_duplicates(self, runner, tmp_path):
        (tmp_path / "a.txt").write_text("same")
        (tmp_path / "b.txt").write_text("same")
        (tmp_path / "c.txt").write_text("diff")
        result = runner.invoke(cli, ["find", "duplicates", str(tmp_path)])
        assert result.exit_code == 0
        assert "重複" in result.output


class TestBatchCommands:
    def test_rename_dry_run(self, runner, tmp_path):
        for i in range(3):
            (tmp_path / f"IMG_{i:04d}.jpg").write_text(f"photo {i}")
        result = runner.invoke(
            cli,
            [
                "batch",
                "rename",
                str(tmp_path),
                "-p",
                "IMG_*.jpg",
                "-t",
                "photo_{n:03d}",
                "--dry-run",
            ],
        )
        assert result.exit_code == 0
        assert "3 個檔案" in result.output
        # Files not actually renamed
        assert (tmp_path / "IMG_0000.jpg").exists()

    def test_rename_exec(self, runner, tmp_path):
        (tmp_path / "old.txt").write_text("data")
        result = runner.invoke(
            cli, ["batch", "rename", str(tmp_path), "-p", "*.txt", "-t", "new_{n}"]
        )
        assert result.exit_code == 0
        assert (tmp_path / "new_1.txt").exists()

    def test_dedup(self, runner, tmp_path):
        (tmp_path / "a.txt").write_text("same")
        (tmp_path / "b.txt").write_text("same")
        (tmp_path / "c.txt").write_text("diff")
        result = runner.invoke(cli, ["batch", "dedup", str(tmp_path)])
        assert result.exit_code == 0
        assert "1 個重複" in result.output
        assert (tmp_path / "a.txt").exists()
        assert not (tmp_path / "b.txt").exists()


class TestWatchCommands:
    def test_size(self, runner, tmp_path):
        # Just test it doesn't crash immediately
        (tmp_path / "test.txt").write_text("hello")
        # Can't test infinite loop, just verify help
        result = runner.invoke(cli, ["watch", "size", "--help"])
        assert result.exit_code == 0
        assert "監控目錄大小" in result.output


class TestLLMCommands:
    """LLM 工作流加速工具測試"""

    def test_llm_token_stdin(self, runner):
        """測試從 stdin 計算 token"""
        result = runner.invoke(cli, ["llm", "token"], input="Hello world")
        assert result.exit_code == 0
        assert "tokens" in result.output

    def test_llm_token_from_file(self, runner, tmp_path):
        """測試從檔案計算 token"""
        prompt_file = tmp_path / "test.txt"
        prompt_file.write_text("This is a test prompt with some content.")
        result = runner.invoke(cli, ["llm", "token", str(prompt_file)])
        assert result.exit_code == 0
        assert "tokens" in result.output

    def test_llm_token_gpt4(self, runner):
        """測試 GPT-4 模型"""
        result = runner.invoke(cli, ["llm", "token", "-m", "gpt4"], input="test prompt")
        assert result.exit_code == 0
        assert "gpt4" in result.output or "tokens" in result.output

    def test_llm_split(self, runner, tmp_path):
        """測試文本分割"""
        long_text = "。".join(["這是第 {} 句".format(i) for i in range(50)])
        prompt_file = tmp_path / "long.txt"
        prompt_file.write_text(long_text)

        result = runner.invoke(
            cli, ["llm", "split", str(prompt_file), "--max-tokens", "500"]
        )
        assert result.exit_code == 0
        assert "分割為" in result.output or "tokens" in result.output

    def test_llm_cache_stats(self, runner):
        """測試緩存統計"""
        result = runner.invoke(cli, ["llm", "cache", "--stats"])
        assert result.exit_code == 0
        assert "總數" in result.output or "快取" in result.output

    def test_llm_test(self, runner, tmp_path):
        """測試 prompt 分析"""
        prompt_file = tmp_path / "prompt.txt"
        prompt_file.write_text("Analyze this text and summarize it.")
        result = runner.invoke(cli, ["llm", "test", str(prompt_file)])
        assert result.exit_code == 0
        assert "分析" in result.output or "Prompt" in result.output


class TestMediaCommands:
    """media 子命令測試 (需要 ffmpeg)"""

    @pytest.fixture
    def sample_video(self, tmp_path):
        """建立 1 秒測試影片"""
        import subprocess

        video = tmp_path / "test.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=duration=1:size=320x240:rate=10",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                str(video),
            ],
            capture_output=True,
            timeout=30,
        )
        return video

    def test_media_help(self, runner):
        result = runner.invoke(cli, ["media", "--help"])
        assert result.exit_code == 0
        assert "影片" in result.output or "圖片" in result.output

    def test_media_info(self, runner, sample_video):
        result = runner.invoke(cli, ["media", "info", str(sample_video)])
        assert result.exit_code == 0
        assert "格式" in result.output
        assert "時長" in result.output

    def test_media_info_missing_file(self, runner):
        result = runner.invoke(cli, ["media", "info", "/nonexistent/video.mp4"])
        assert result.exit_code != 0

    def test_media_thumbs(self, runner, sample_video, tmp_path):
        out_dir = tmp_path / "thumbs"
        result = runner.invoke(
            cli, ["media", "thumbs", str(sample_video), "-n", "2", "-o", str(out_dir)]
        )
        assert result.exit_code == 0
        assert "縮圖" in result.output

    def test_media_compare_too_few(self, runner, sample_video):
        result = runner.invoke(cli, ["media", "compare", str(sample_video)])
        assert result.exit_code == 0
        assert "至少" in result.output
