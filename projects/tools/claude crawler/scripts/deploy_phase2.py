#!/usr/bin/env python
"""Phase 2 Production Deployment Orchestrator.

Runs complete deployment pipeline:
1. Schema migration (Unit 5A)
2. HTML backfill (Unit 5B)
3. Offline reclassification (Unit 6)
4. CSV export & filtering (Unit 7)
5. Extraction validation (Unit 8)
6. Deployment gates verification
"""

import json
import subprocess
import sys
import time
from pathlib import Path
from datetime import datetime


class DeploymentOrchestrator:
    """Manages Phase 2 deployment execution and reporting."""

    def __init__(self, db_path: str, dry_run: bool = False):
        self.db_path = db_path
        self.dry_run = dry_run
        self.start_time = datetime.now()
        self.results = {
            "timestamp": self.start_time.isoformat(),
            "dry_run": dry_run,
            "stages": {},
        }

    def log(self, stage: str, message: str, level: str = "INFO"):
        """Log deployment message."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        prefix = f"[{timestamp}] [{level}]"
        print(f"{prefix} {stage}: {message}")

    def stage_1_schema_migration(self):
        """Unit 5A: Schema Migration."""
        self.log("STAGE-1", "Starting schema migration...", "INFO")

        try:
            from crawler.storage import init_db
            import sqlite3

            # Run migration
            init_db(self.db_path)

            # Verify raw_html column exists
            conn = sqlite3.connect(self.db_path)
            cursor = conn.execute("PRAGMA table_info(pages)")
            cols = {row[1] for row in cursor.fetchall()}
            conn.close()

            if "raw_html" in cols:
                self.log("STAGE-1", "✓ raw_html column added successfully", "OK")
                self.results["stages"]["schema_migration"] = {"status": "pass"}
                return True
            else:
                self.log("STAGE-1", "✗ raw_html column not found", "ERROR")
                self.results["stages"]["schema_migration"] = {"status": "fail", "reason": "column_not_found"}
                return False
        except Exception as e:
            self.log("STAGE-1", f"✗ Migration failed: {e}", "ERROR")
            self.results["stages"]["schema_migration"] = {"status": "fail", "reason": str(e)}
            return False

    def stage_2_backfill(self, limit: int = 10):
        """Unit 5B: HTML Backfill."""
        self.log("STAGE-2", f"Starting backfill (limit={limit})...", "INFO")

        try:
            result = subprocess.run([
                sys.executable,
                "crawler/scripts/backfill_raw_html.py",
                "--db", self.db_path,
                "--limit", str(limit),
                "--dry-run" if self.dry_run else "",
            ], capture_output=True, text=True, timeout=60)

            if result.returncode == 0:
                # Parse success rate from output
                output = result.stdout
                if "Gate" in output:
                    status = "pass" if "Gate passed" in output else "fail"
                else:
                    status = "pass"

                self.log("STAGE-2", f"✓ Backfill complete ({status})", "OK")
                self.results["stages"]["backfill"] = {"status": status, "output": output}
                return status == "pass"
            else:
                self.log("STAGE-2", f"✗ Backfill failed: {result.stderr}", "ERROR")
                self.results["stages"]["backfill"] = {"status": "fail", "reason": result.stderr}
                return False
        except Exception as e:
            self.log("STAGE-2", f"✗ Backfill error: {e}", "ERROR")
            self.results["stages"]["backfill"] = {"status": "fail", "reason": str(e)}
            return False

    def stage_3_reclassification(self, limit: int = 10):
        """Unit 6: Offline Reclassification."""
        self.log("STAGE-3", f"Starting reclassification (limit={limit})...", "INFO")

        try:
            result = subprocess.run([
                sys.executable,
                "crawler/scripts/offline_reclassify.py",
                "--sample-size", str(limit),
                "--output", "/tmp/reclassify_phase2.json",
                "--export-csv", "/tmp/reclassify_phase2",
            ], capture_output=True, text=True, timeout=60)

            if result.returncode == 0:
                # Load results
                with open("/tmp/reclassify_phase2.json") as f:
                    reclass_data = json.load(f)

                reclassified_pct = (
                    (reclass_data["reclassified"] / reclass_data["processed"] * 100)
                    if reclass_data["processed"] > 0
                    else 0
                )

                # Check gate: >=70%
                gate_pass = reclassified_pct >= 70

                self.log("STAGE-3", f"✓ Reclassified {reclassified_pct:.0f}% (gate: {gate_pass})", "OK" if gate_pass else "WARN")
                self.results["stages"]["reclassification"] = {
                    "status": "pass" if gate_pass else "fail",
                    "reclassified_pct": reclassified_pct,
                    "total": reclass_data["total"],
                }
                return gate_pass
            else:
                self.log("STAGE-3", f"✗ Reclassification failed: {result.stderr}", "ERROR")
                self.results["stages"]["reclassification"] = {"status": "fail"}
                return False
        except Exception as e:
            self.log("STAGE-3", f"✗ Reclassification error: {e}", "ERROR")
            self.results["stages"]["reclassification"] = {"status": "fail", "reason": str(e)}
            return False

    def stage_4_extraction_validation(self):
        """Unit 8: Extraction Validation."""
        self.log("STAGE-4", "Starting extraction validation...", "INFO")

        try:
            result = subprocess.run([
                sys.executable,
                "crawler/scripts/validate_extraction.py",
                "--sample-size", "20",
                "--input", "/tmp/reclassify_phase2.json",
                "--output", "/tmp/validate_phase2.json",
            ], capture_output=True, text=True, timeout=60)

            if result.returncode == 0:
                # Load results
                with open("/tmp/validate_phase2.json") as f:
                    validation_data = json.load(f)

                gate_pass = validation_data.get("pass", False)
                success_rate = validation_data.get("success_rate", 0)
                fp_rate = validation_data.get("false_positive_rate", 0)

                self.log("STAGE-4", f"✓ Extraction: {success_rate*100:.0f}% success, {fp_rate*100:.1f}% FP (gate: {gate_pass})", "OK" if gate_pass else "WARN")
                self.results["stages"]["extraction_validation"] = {
                    "status": "pass" if gate_pass else "fail",
                    "success_rate": success_rate,
                    "false_positive_rate": fp_rate,
                }
                return gate_pass
            else:
                self.log("STAGE-4", f"✗ Validation failed: {result.stderr}", "ERROR")
                self.results["stages"]["extraction_validation"] = {"status": "fail"}
                return False
        except Exception as e:
            self.log("STAGE-4", f"✗ Validation error: {e}", "ERROR")
            self.results["stages"]["extraction_validation"] = {"status": "fail", "reason": str(e)}
            return False

    def final_report(self):
        """Generate deployment report."""
        elapsed = (datetime.now() - self.start_time).total_seconds()
        self.results["elapsed_seconds"] = elapsed

        print("\n" + "="*70)
        print("PHASE 2 DEPLOYMENT REPORT")
        print("="*70)

        all_passed = all(
            stage.get("status") == "pass"
            for stage in self.results["stages"].values()
        )

        for stage_name, stage_result in self.results["stages"].items():
            status = "✓ PASS" if stage_result.get("status") == "pass" else "✗ FAIL"
            print(f"\n{stage_name.upper()}: {status}")
            for key, value in stage_result.items():
                if key != "status" and key != "output":
                    print(f"  {key}: {value}")

        print(f"\n{'='*70}")
        print(f"Overall: {'✓ ALL GATES PASSED' if all_passed else '✗ SOME GATES FAILED'}")
        print(f"Elapsed: {elapsed:.1f}s")
        print(f"{'='*70}\n")

        # Save report
        report_path = Path("phase2_deployment_report.json")
        with open(report_path, "w") as f:
            json.dump(self.results, f, indent=2)
        print(f"Report saved to: {report_path}")

        return all_passed

    def run(self, stages: list = None):
        """Run deployment with specified stages."""
        if stages is None:
            stages = ["schema_migration", "backfill", "reclassification", "extraction_validation"]

        print(f"\n{'='*70}")
        print(f"PHASE 2 DEPLOYMENT STARTED")
        print(f"Timestamp: {self.start_time}")
        print(f"Dry-run: {self.dry_run}")
        print(f"{'='*70}\n")

        results = {}

        if "schema_migration" in stages:
            results["schema_migration"] = self.stage_1_schema_migration()

        if "backfill" in stages and results.get("schema_migration", True):
            results["backfill"] = self.stage_2_backfill(limit=10)

        if "reclassification" in stages and results.get("backfill", True):
            results["reclassification"] = self.stage_3_reclassification(limit=10)

        if "extraction_validation" in stages and results.get("reclassification", True):
            results["extraction_validation"] = self.stage_4_extraction_validation()

        return self.final_report()


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Phase 2 Deployment Orchestrator")
    parser.add_argument(
        "--db",
        type=str,
        default="crawler.db",
        help="Database path (default: crawler.db)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Don't write to database",
    )
    parser.add_argument(
        "--stages",
        type=str,
        default="schema_migration,backfill,reclassification,extraction_validation",
        help="Comma-separated stages to run",
    )
    args = parser.parse_args()

    orchestrator = DeploymentOrchestrator(args.db, dry_run=args.dry_run)
    stages = [s.strip() for s in args.stages.split(",")]
    success = orchestrator.run(stages=stages)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
