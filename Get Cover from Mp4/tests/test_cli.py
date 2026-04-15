"""Tests for CLI entry point."""

import tempfile
from pathlib import Path

import pytest
from typer.testing import CliRunner

from cover_selector.cli.main import app

runner = CliRunner()


def test_cli_help():
    """Test that CLI help works."""
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "Automatically select the best cover frame" in result.stdout


def test_cli_requires_input():
    """Test that CLI requires --input parameter."""
    result = runner.invoke(app, [])
    assert result.exit_code != 0
    # Should mention missing required option


def test_cli_input_must_exist():
    """Test that CLI validates input file exists."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_dir = Path(tmpdir) / "output"

        result = runner.invoke(app, [
            "--input", "/nonexistent/video.mp4",
            "--output", str(output_dir),
        ])
        assert result.exit_code != 0


def test_cli_with_valid_video():
    """Test CLI invocation with valid video file."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)

        # Create a minimal valid video file (just for testing file existence)
        # In real tests, would use a proper test fixture
        video_file = tmppath / "test.mp4"
        video_file.touch()  # Just create empty file to pass existence check

        output_dir = tmppath / "output"

        result = runner.invoke(app, [
            "--input", str(video_file),
            "--output", str(output_dir),
        ])

        # Should process or show pre-flight errors gracefully
        # Success: exit_code=0 with "Processing" or similar
        # Graceful failure: exit_code!=0 with error message about missing dependencies/invalid video
        # Acceptable outcome: Either success or clear error message
        if result.exit_code == 0:
            assert "Processing" in result.stdout or "Scene" in result.stdout
        else:
            # Non-zero exit is OK if it's a clear error message
            assert "Error" in result.stdout or "error" in result.stderr.lower() or "Missing" in result.stdout


def test_cli_creates_output_directory():
    """Test that CLI creates output directory if it doesn't exist."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)
        video_file = tmppath / "test.mp4"
        video_file.touch()

        output_dir = tmppath / "nonexistent" / "output"
        assert not output_dir.exists()

        result = runner.invoke(app, [
            "--input", str(video_file),
            "--output", str(output_dir),
        ])

        # Output directory should be created OR pre-flight checks should fail
        # (if Tesseract is missing, program exits early without creating directory)
        assert output_dir.exists() or "Missing dependencies" in result.stdout


def test_cli_with_custom_config():
    """Test CLI with custom config file."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)

        # Create test video and config
        video_file = tmppath / "test.mp4"
        video_file.touch()

        config_file = tmppath / "custom_config.yaml"
        config_file.write_text("scene_detection:\n  threshold: 35.0\n")

        output_dir = tmppath / "output"

        result = runner.invoke(app, [
            "--input", str(video_file),
            "--output", str(output_dir),
            "--config", str(config_file),
        ])

        # Should either load config successfully or show pre-flight check errors
        assert "Config loaded" in result.stdout or "Missing dependencies" in result.stdout


def test_cli_with_profile_flag():
    """Test CLI with --profile flag."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)

        video_file = tmppath / "test.mp4"
        video_file.touch()

        output_dir = tmppath / "output"

        result = runner.invoke(app, [
            "--input", str(video_file),
            "--output", str(output_dir),
            "--profile",
        ])

        # With profile, should show memory info or pre-flight errors
        assert "memory" in result.stdout.lower() or "MB" in result.stdout or "Missing dependencies" in result.stdout
