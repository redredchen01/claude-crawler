# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **gsc-activate v1.0.0** — Google Search Console data pipeline skill with automated GSC API activation, data fetching, and Obsidian vault reporting
- **vault-mining-feedback v1.0.0** — Obsidian vault feedback loop automation; auto-marks idea notes as implemented with deployment metadata

### Changed
- Updated `obsidian` submodule: daily auto-sync (2026-04-07) + complete PARA restructuring
- Updated `projects/tools/wm-tool` submodule: Production Monitoring Framework v1.0 implementation

## [1.1.0.0] - 2026-04-07

### Added
- **Vault Mining TF-IDF Engine** — `scripts/vault-mining/` with 3 pure Node.js scripts (`build-tfidf-index.mjs`, `compute-related.mjs`, `apply-related.mjs`); auto-updates `related` frontmatter across 93 vault notes
- **ydk v0.5.0** — `api` module with `RequestBuilder` + `RetryStrategy` (305 LOC, 29 tests)
- **Skill Factory P1 Suite** — `/vault-orphan-fixer`, `/journal-promoter`, `/skill-dsl-auditor` (3 skills, ~1,000 LOC)
- **4-Layer Automation Architecture** — design docs + implementation checklist (`docs/AUTOMATION_ARCHITECTURE.md`, `docs/AUTOMATION_IMPLEMENTATION_CHECKLIST.md`)
- **Session Wrap v4.0.1** — intelligence integration, L1+L2 automation baseline
- **Site Doctor v0.1** — new monitoring skill; Daily Report Skill upgraded to v1.0.1
- **Vault Init Skill** — `/vault-init` PARA+ZK hybrid vault scaffolding (7 templates + system files)
- **GA4 Analytics** — `ga4-server.js` local dashboard + setup guide
- **perf-mail-web** — YC experimental Flask app prototype

### Changed
- `AGENT_ROUTINE.md` — updated L1/L2 automation SOP
- `scripts/session-wrap.sh` — v4.0.1 refactor (-168 lines net)
- `scripts/agent/daily-report-gen.sh` — expanded report generation

### Fixed
- Removed 5 duplicate orphan notes from Obsidian vault (`workspace-docs/architecture/`)
- Updated 93 vault notes' `related` field via TF-IDF cosine similarity (threshold 0.15)
- `scripts/agent/agent-check.sh` — minor fixes

## [1.0.1.1] - 2026-04-01

### Added
- Phase 3 Cache Interface for Skill-to-Skill data sharing — implemented `scripts/vault-query-cache.sh`
- `vault-query-cache` provider: 5-minute TTL JSON cache for vault metadata (stats, projects, tags)
- Integrated `clausidian --json` flags for high-speed machine-readable outputs

### Changed
- Fixed `scripts/vault-mining-scheduler.sh` path errors for project-level tool discovery
- Optimized `Archived/experimental` storage — released 600MB+ by removing redundant `node_modules`
- Verified VWRS Phase 12 REST API extension — 19 endpoints across jobs, bulk, cache, and health

## [1.0.1.0] - 2026-03-31

### Added
- Clausidian v3.4.0 event bus architecture — 29 system events, universal subscription system
- Parallel query executor for Vault with pattern-based caching (B2.2)
- Event-driven automation engine with YAML-based triggers and actions
- Multi-vault workflow support with bidirectional link synchronization

### Changed
- Vault class architecture refactored to support event-driven integration
- Pattern detector algorithms optimized for larger vaults
- Connection pooling and query performance improvements

### Fixed
- JavaScript class structure corrections in Pattern Detector
- Sync and workspace state consistency improvements

### Removed
- HR_BOT_PHASE2 experimental directory (archived to projects/production/)

