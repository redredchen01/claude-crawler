# Phase 2 Deployment Checklist — Production Rollout

**Date:** 2026-04-20  
**Status:** Pre-Deployment  
**Timeline:** 2-4 hours total

---

## Pre-Deployment Validation (30 min)

- [ ] **Phase 1 Validation Gates All Pass** (from previous session)
  - [ ] Gate 1: Syntax fix + regex patterns ✓
  - [ ] Gate 2: Threshold discovery (F1=0.86) ✓
  - [ ] Gate 3: Heading hierarchy heuristic ✓
  - [ ] Gate 4-5: Offline reclassification + extraction validation ✓

- [ ] **Stakeholder Approval** (PENDING)
  - [ ] Engineering Lead review: detection improvements
  - [ ] Product Manager review: success metrics alignment
  - [ ] DevOps review: deployment plan and rollback

- [ ] **Database Backup Created**
  - [ ] Full production database backup taken
  - [ ] Backup verified: restoration tested
  - [ ] Backup location documented: `backup_location_here`

- [ ] **Deployment Window Confirmed**
  - [ ] Low-traffic time window scheduled (off-peak hours)
  - [ ] Team availability confirmed (≥2 on-call)
  - [ ] Communication channels ready (Slack, status page)

---

## Unit 5A: Schema Migration (15 min)

- [ ] **Pre-Migration Check**
  - [ ] Current schema backed up
  - [ ] No active write transactions
  - [ ] Database size recorded: `_______`

- [ ] **Run Migration**
  - [ ] Execute: `python -m crawler.storage init_db`
  - [ ] Verify: raw_html column added
  - [ ] Verify: All existing pages have raw_html = '' (empty)

- [ ] **Post-Migration Verification**
  - [ ] Query: `PRAGMA table_info(pages)` contains raw_html
  - [ ] No errors in application logs
  - [ ] Query performance unchanged (test SELECT on pages table)

---

## Unit 5B: Backfill raw_html (75 min, can run async with Unit 6+)

- [ ] **Pre-Backfill Check**
  - [ ] Network connectivity verified (10+ URLs can be fetched)
  - [ ] Backfill script tested on staging: `--limit 100`
  - [ ] Expected success rate: ≥80%

- [ ] **Run Backfill (Parallel with Units 6-7)**
  - [ ] Start command:
    ```bash
    python crawler/scripts/backfill_raw_html.py \
      --db /path/to/production.db \
      --limit 22000 \
      --output-csv backfill_results.csv
    ```
  - [ ] Monitor progress: log every 100 pages
  - [ ] Gate check: Success rate ≥80%
  - [ ] If gate fails: investigate (network? timeouts? HTML truncation?)

- [ ] **Post-Backfill Verification**
  - [ ] Row count check: `SELECT COUNT(*) WHERE raw_html != ''` ≥ 17,600 (80% of 22k)
  - [ ] Sample HTML validation: pick 10 random pages, check ≥500 chars
  - [ ] Database size increase: expected ~50-100MB
  - [ ] Query performance: unchanged (test SELECT performance)

---

## Unit 6-7: Offline Reclassification (45 min, parallel with Unit 5B)

- [ ] **Pre-Reclassification**
  - [ ] Script tested on staging with 100-page sample
  - [ ] CSV export format verified

- [ ] **Run Reclassification**
  - [ ] Command:
    ```bash
    python crawler/scripts/offline_reclassify.py \
      --sample-size 22000 \
      --output /tmp/reclassify_all.json \
      --export-csv reclassify_all
    ```
  - [ ] Monitor: Progress logged every 100 pages
  - [ ] Gate: ≥70% of pages reclassified to detail/list

- [ ] **CSV Tier Review** (Unit 7)
  - [ ] **Tier High** (confidence ≥0.90):
    - [ ] Row count: _____ (auto-accept, no manual review)
  - [ ] **Tier Medium** (0.70-0.90):
    - [ ] Row count: _____ (spot-check 20 samples)
    - [ ] Spot-checks passed: ___ / 20
  - [ ] **Tier Low** (<0.70):
    - [ ] Row count: _____
    - [ ] If >100 rows: PAUSE and debug before proceeding

- [ ] **Results Validation**
  - [ ] Reclassification count: _____ pages (≥70% target)
  - [ ] Reclassification reasons logged (url_pattern, listing_path, heading_hierarchy)
  - [ ] No reclassification of already-correct pages verified

---

## Unit 8: Extraction Validation (30 min, parallel with Unit 5B+6)

- [ ] **Pre-Validation**
  - [ ] Script tested on staging with 50-page sample
  - [ ] Stratified sampling confirmed (page_type + detection_signal buckets)

- [ ] **Run Extraction Validation**
  - [ ] Command:
    ```bash
    python crawler/scripts/validate_extraction.py \
      --sample-size 100 \
      --input /tmp/reclassify_all.json \
      --output /tmp/validate_extraction_all.json
    ```
  - [ ] Monitor: Stratified sample sizes logged

- [ ] **Validation Gates**
  - [ ] **Gate 1 (Extraction Success):** success_rate ≥0.80
    - [ ] Result: _____ (target: ≥0.80)
  - [ ] **Gate 2 (False Positives):** false_positive_rate <0.05
    - [ ] Result: _____ (target: <0.05)
  - [ ] **Gate 3 (Per-Stratum):** all strata ≥0.70 success
    - [ ] detail_url_pattern: _____
    - [ ] detail_heading_hierarchy: _____
    - [ ] detail_jsonld: _____
    - [ ] list_url_pattern: _____

- [ ] **Failure Analysis** (if gates fail)
  - [ ] Extract failures by reason (extraction_error field)
  - [ ] Per-signal false positive breakdown
  - [ ] Decision: debug or abort?

---

## Blue-Green Deployment (1-2 hours)

### Phase 2a: Canary Deployment (10% of scan jobs, 24 hours)

- [ ] **Pre-Canary**
  - [ ] Canary environment prepared (separate DB replica?)
  - [ ] Monitoring dashboards set up for:
    - [ ] reclassification_rate (target: ≥70%)
    - [ ] extraction_success_rate (target: ≥80%)
    - [ ] false_positive_rate (target: <5%)
    - [ ] query latency (target: unchanged)

- [ ] **Deploy Detection Changes to Canary**
  - [ ] Code changes (Units 1-4) deployed to canary
  - [ ] Reclassified page_type values applied to 10% of pages
  - [ ] New page detections use new heuristics
  - [ ] Metrics collection starts

- [ ] **24-Hour Canary Monitoring**
  - [ ] Check metrics every 1 hour:
    - [ ] reclassification_rate stable ≥70%
    - [ ] extraction_success_rate stable ≥80%
    - [ ] false_positive_rate stable <5%
    - [ ] No spike in error logs
  - [ ] User feedback: no complaints reported
  - [ ] Performance: no latency degradation

- [ ] **Canary Approval**
  - [ ] All metrics pass (24 hours)
  - [ ] No unexpected issues
  - [ ] Decision: **GO** for 100% rollout

### Phase 2b: Production Rollout (100%, 2 hours)

- [ ] **Pre-Rollout Deployment**
  - [ ] Code changes verified in staging
  - [ ] Rollback plan tested: can revert in <30 min

- [ ] **Gradual Rollout** (30-min windows)
  - [ ] **10:00 — Deploy to 25% of production**
    - [ ] Monitor: metrics stable, no errors
  - [ ] **10:30 — Deploy to 50%**
    - [ ] Monitor: metrics stable
  - [ ] **11:00 — Deploy to 75%**
    - [ ] Monitor: metrics stable
  - [ ] **11:30 — Deploy to 100%**
    - [ ] Monitor: final 30-min stability check

- [ ] **Post-Rollout Validation** (30 min)
  - [ ] Sample 100 production pages, verify reclassification
  - [ ] Check extraction on new page_type values
  - [ ] Alert thresholds reviewed (no false alerts)
  - [ ] Team standup: all clear?

---

## Rollback Plan

**Trigger:** If any production metric breaches (>30 min of degradation):

1. **Immediate Actions** (<5 min)
   - [ ] Revert code changes to pre-Phase2 version
   - [ ] Revert page_type values from backup
   - [ ] Clear any cached page_type predictions

2. **Detailed Rollback** (5-30 min)
   - [ ] Database rollback command:
     ```sql
     -- Restore original page_type values (from backup)
     UPDATE pages SET page_type = original_page_type 
       WHERE id IN (SELECT id FROM pages_backup);
     ```
   - [ ] Code rollback: revert commits post-Phase 1
   - [ ] Restart application services
   - [ ] Verify metrics return to baseline

3. **Post-Rollback** (30 min)
   - [ ] Root cause analysis of failure
   - [ ] Document issue and resolution
   - [ ] Stakeholder communication: incident summary
   - [ ] Decide: retry or defer to Phase 2b

---

## Success Criteria (Phase 2 Complete)

- [ ] **Reclassification Success**
  - [ ] ≥70% of 'other' pages reclassified to detail/list
  - [ ] <5% false positives (detail→list misclassifications)
  - [ ] Audit trail (CSV) generated and reviewed

- [ ] **Extraction Validation Success**
  - [ ] ≥80% extraction success on reclassified pages
  - [ ] All stratified sampling tiers ≥70% success
  - [ ] Extraction failures analyzed and documented

- [ ] **Deployment Stability**
  - [ ] Canary metrics stable (24 hours, all gates pass)
  - [ ] Production rollout complete (100% adoption)
  - [ ] Zero unplanned rollbacks

- [ ] **Data Quality Improvement**
  - [ ] Resource extraction count on reclassified pages: _____ (target: >80% yield resources)
  - [ ] User-facing impact: improved data coverage reported

---

## Post-Deployment Monitoring (7 days)

- [ ] **Daily Metrics Review**
  - [ ] reclassification_rate, extraction_success_rate, false_positive_rate
  - [ ] Query latency, error rates
  - [ ] User feedback channels monitored

- [ ] **Weekly Summary Report**
  - [ ] Production metrics vs. targets
  - [ ] Issues encountered and resolutions
  - [ ] Lessons learned documented

---

## Sign-Offs

- [ ] **Engineering Lead:** `_____________` Date: `__________`
- [ ] **Product Manager:** `_____________` Date: `__________`
- [ ] **DevOps Lead:** `_____________` Date: `__________`
- [ ] **Deployment Engineer:** `_____________` Date: `__________`

---

## Notes

- Backfill + Reclassification + Extraction validation can run **in parallel**
- Total critical path: ~2.5-3 hours (Phase 5B + 6 + 8 in parallel)
- Canary phase adds 24 hours for safety validation
- Post-deployment monitoring for 7 days recommended

---

**Status:** ⏳ Ready for Stakeholder Review → Awaiting Approval
