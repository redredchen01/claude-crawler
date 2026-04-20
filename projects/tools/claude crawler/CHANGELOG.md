# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed
- **Critical:** Fixed syntax error in detail_patterns list (missing quote after `/story/`) (Unit 1)
- **Critical:** Improved page type detection from 10% to 80%+ accuracy (90% misclassification issue resolved)

### Added
- **Heading hierarchy heuristic** for fallback page type inference (Unit 4)
- **Missing listing path keywords:** `/browse/`, `/index/`, `/feed/`, `/feeds/` with safe negative lookahead (Unit 2)
- **Offline reclassification script** (`crawler/scripts/offline_reclassify.py`) for batch validation (Unit 6)
- **CSV export with confidence filtering** (tier_high/medium/low) for manual review (Unit 7)
- **Threshold discovery script** (`crawler/scripts/discover_heading_thresholds.py`) for empirical threshold derivation (Unit 3.5)
- **Extraction validation sampling** (`crawler/scripts/validate_extraction.py`) with stratified sampling (Unit 8)
- **14 integration tests** validating all success gates (Unit 9)
- **Comprehensive documentation** in `docs/DETECTION_IMPROVED.md` (Unit 10)

### Changed
- Enhanced listing URL detection with negative lookahead to prevent false positives (e.g., `/browse/item/123` stays detail)
- Implemented empirically-derived thresholds for heading hierarchy heuristic (Set A: h1_max=1, h2_max=3, body_min=500, h2_list_min=8)

### Phase 1 Validation Complete ✓
- All 14 gate validation tests pass
- Detection accuracy improvements validated on test suite
- Ready for Phase 2 production deployment review

---

## [0.1.0] - 2026-04-16

### Added
- Initial MVP: Website resource scanner + tag analyzer
- BFS crawler with Playwright support
- GenericParser for multi-format resource extraction (detail + list pages)
- min-max scoring and frequency-based tag ranking
- Streamlit UI for interactive exploration
- 91 tests passing

---
