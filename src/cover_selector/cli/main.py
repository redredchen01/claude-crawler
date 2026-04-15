"""CLI entry point for Cover Selector MVP."""

import sys
import time
from pathlib import Path
from shutil import which
from typing import Optional

import psutil
import typer
from rich.console import Console
from rich.table import Table

from cover_selector.config import CoverSelectorConfig

app = typer.Typer(help="Local video cover frame selector using rule-based analysis")
console = Console()


def run_preflight_checks() -> None:
    """Verify all dependencies are available before processing."""
    console.print("[bold blue]Running pre-flight checks...[/bold blue]")

    checks = {
        "FFmpeg": "ffmpeg",
        "Tesseract OCR": "tesseract",
    }

    missing = []
    for name, cmd in checks.items():
        if which(cmd) is None:
            missing.append(name)
            console.print(f"[red]✗[/red] {name} not found")
        else:
            console.print(f"[green]✓[/green] {name} found")

    # Check MediaPipe import
    try:
        import mediapipe
        console.print(f"[green]✓[/green] MediaPipe v{mediapipe.__version__} installed")
    except ImportError:
        missing.append("MediaPipe")
        console.print("[red]✗[/red] MediaPipe not installed")

    if missing:
        console.print(f"\n[bold red]Missing dependencies: {', '.join(missing)}[/bold red]")
        console.print("\n[yellow]Installation instructions:[/yellow]")
        if "FFmpeg" in missing:
            console.print("  macOS: brew install ffmpeg")
            console.print("  Ubuntu: sudo apt-get install ffmpeg")
        if "Tesseract OCR" in missing:
            console.print("  macOS: brew install tesseract")
            console.print("  Ubuntu: sudo apt-get install tesseract-ocr")
        sys.exit(1)

    console.print("[green]All dependencies available[/green]\n")


def check_disk_space(output_path: Path, video_path: Path) -> None:
    """Check available disk space for output."""
    video_size_mb = video_path.stat().st_size / (1024 * 1024)
    required_mb = video_size_mb * 4  # Estimate: original + thumbnails + reports + temp

    output_path.mkdir(parents=True, exist_ok=True)
    stat = output_path.stat()
    free_mb = psutil.disk_usage(output_path).free / (1024 * 1024)

    if free_mb < required_mb:
        console.print(f"[yellow]⚠ Low disk space:[/yellow] {free_mb:.0f}MB free, ~{required_mb:.0f}MB needed")
    else:
        console.print(f"[green]✓[/green] Disk space: {free_mb:.0f}MB available")


@app.command()
def main(
    input: Path = typer.Option(
        ...,
        "--input",
        help="Path to input video file",
        exists=True,
        file_okay=True,
        dir_okay=False,
    ),
    output: Path = typer.Option(
        "./output",
        "--output",
        help="Directory for output files (created if missing)",
    ),
    config: Optional[Path] = typer.Option(
        None,
        "--config",
        help="Path to config YAML (uses default if not specified)",
        exists=True,
        file_okay=True,
        dir_okay=False,
    ),
    profile: bool = typer.Option(
        False,
        "--profile",
        help="Enable detailed timing and memory profiling output",
    ),
) -> None:
    """
    Automatically select the best cover frame from a video.

    Uses rule-based analysis (no ML models) to find frames that are:
    - Clear and sharp
    - Free of text and watermarks
    - Well-composed with visible subjects
    - Suitable as video cover thumbnails

    Outputs: final_cover.jpg, top_candidates.json, scoring_report.json, reject_log.json
    """
    try:
        console.print("[bold]Cover Selector MVP[/bold]\n")

        # Pre-flight checks
        run_preflight_checks()

        # Validate inputs
        if not input.exists():
            console.print(f"[red]Error: Video file not found: {input}[/red]")
            sys.exit(1)

        if input.suffix.lower() not in ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.flv', '.m4v']:
            console.print(f"[yellow]Warning: Unusual video format: {input.suffix}[/yellow]")

        # Check disk space
        output.mkdir(parents=True, exist_ok=True)
        check_disk_space(output, input)

        # Load configuration
        if config is None:
            # Use default config from package
            config = Path(__file__).parent.parent / "configs" / "default.yaml"

        cfg = CoverSelectorConfig.load_yaml(config)
        console.print(f"[green]✓[/green] Config loaded from {config}\n")

        # Display pipeline info
        table = Table(title="Processing Pipeline Configuration", show_header=True)
        table.add_column("Parameter", style="cyan")
        table.add_column("Value", style="magenta")
        table.add_row("Input video", str(input))
        table.add_row("Output directory", str(output))
        table.add_row("Scene threshold", f"{cfg.scene_detection.threshold}")
        table.add_row("Analysis size", f"{cfg.image_preprocessing.analysis_max_size}px")
        table.add_row("Top candidates", f"{cfg.scorer.top_k}")
        table.add_row("Batch size", f"{cfg.scorer.batch_size}")
        console.print(table)

        # Monitor memory
        process = psutil.Process()
        initial_memory_mb = process.memory_info().rss / (1024 * 1024)
        console.print(f"\n[blue]Initial memory: {initial_memory_mb:.1f} MB[/blue]\n")

        # Run complete end-to-end pipeline: Video → Frames → Ranking → Triple-Collage Image
        from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline

        pipeline = VideoToTripleCollagePipeline(cfg)
        console.print("[bold cyan]═══ VIDEO → TRIPLE-COLLAGE PIPELINE ═══[/bold cyan]\n")

        results = pipeline.run(video_path=str(input), output_dir=output)

        # Display results
        console.print("\n[bold cyan]═══ RESULTS ═══[/bold cyan]\n")

        results_table = Table(title="Processing Complete", show_header=True)
        results_table.add_column("Metric", style="cyan")
        results_table.add_column("Value", style="magenta")
        results_table.add_row("Scenes detected", str(results["scenes_count"]))
        results_table.add_row("Candidate frames", str(results["candidates_count"]))
        results_table.add_row("Cover mode", f"[green]{results['cover_mode'].upper()}[/green]")
        if results.get("final_cover"):
            results_table.add_row(
                "Final cover", f"[green]{Path(results['final_cover']).name}[/green]"
            )

        console.print(results_table)

        if results.get("final_cover"):
            console.print(f"\n[bold]✨ Final Triple-Collage Cover:[/bold]")
            console.print(f"  {results['final_cover']}")

        if profile:
            peak_memory_mb = process.memory_info().rss / (1024 * 1024)
            console.print(
                f"\n[blue]Peak memory: {peak_memory_mb:.1f} MB (Δ {peak_memory_mb - initial_memory_mb:+.1f} MB)[/blue]"
            )

        console.print("\n[green]✓ Triple-collage cover generation complete[/green]")

    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted by user[/yellow]")
        sys.exit(0)
    except Exception as e:
        console.print(f"\n[red]Error: {e}[/red]")
        if profile:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    app()
