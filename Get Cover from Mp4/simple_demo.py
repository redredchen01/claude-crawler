#!/usr/bin/env python
"""Simple demo showing Cover Selector MVP outputs."""

import json
from pathlib import Path
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()

console.print("\n[bold blue]═══════════════════════════════════════════════════════[/bold blue]")
console.print("[bold blue]     Local Video Cover Frame Selector MVP - Demo[/bold blue]")
console.print("[bold blue]═══════════════════════════════════════════════════════[/bold blue]\n")

# Read output files
output_dir = Path("test_output")

if not output_dir.exists():
    console.print("[red]❌ Output directory not found[/red]")
    console.print("Run the full pipeline first to generate output.")
    exit(1)

# Load JSON reports
console.print("[cyan]📊 Generated Reports:[/cyan]\n")

try:
    with open(output_dir / "top_candidates.json") as f:
        top_candidates = json.load(f)
    
    with open(output_dir / "scoring_report.json") as f:
        scoring_report = json.load(f)
    
    with open(output_dir / "reject_log.json") as f:
        reject_log = json.load(f)
    
    # Display top candidates
    console.print("[bold cyan]🏆 Top Candidates:[/bold cyan]")
    if top_candidates.get("candidates"):
        table = Table(show_header=True)
        table.add_column("Rank", style="cyan")
        table.add_column("Frame ID", style="magenta")
        table.add_column("Score", style="yellow")
        table.add_column("Confidence", style="green")
        
        for cand in top_candidates["candidates"][:5]:
            table.add_row(
                str(cand["rank"]),
                str(cand["frame_id"]),
                f"{cand['final_score']:.1f}",
                f"{cand['confidence_score']:.1f}%"
            )
        console.print(table)
    else:
        console.print("[yellow]No normal candidates[/yellow]")
    
    console.print()
    
    # Display rejected frames
    if reject_log.get("total_rejected", 0) > 0:
        console.print(f"[red]⚠️  {reject_log['total_rejected']} Rejected Frames:[/red]")
        for reject in reject_log.get("rejected_frames", [])[:5]:
            reasons = ", ".join(reject["violation_reasons"]) if reject["violation_reasons"] else "No reason"
            console.print(f"  • Frame {reject['frame_id']}: {reasons}")
        console.print()
    
    # Summary
    console.print("[bold cyan]📋 Summary:[/bold cyan]")
    summary = Panel(
        f"""[green]Status:[/green] {scoring_report.get('status', 'unknown')}
[green]Normal Candidates:[/green] {scoring_report.get('summary', {}).get('total_normal_candidates', 0)}
[green]Degraded Candidates:[/green] {scoring_report.get('summary', {}).get('total_degraded_candidates', 0)}
[green]Rejected Frames:[/green] {reject_log.get('total_rejected', 0)}
[green]Output Files:[/green]
  • final_cover.jpg
  • top_candidates.json
  • scoring_report.json
  • reject_log.json
  • candidate_frames/
""",
        title="Processing Complete ✓"
    )
    console.print(summary)
    
except FileNotFoundError as e:
    console.print(f"[red]Error: {e}[/red]")
    console.print("Some output files are missing. Ensure the full pipeline ran successfully.")

console.print("\n[cyan]📁 Output Directory:[/cyan] test_output/\n")
