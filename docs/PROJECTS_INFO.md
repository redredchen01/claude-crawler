# YD 2026 Project Index

## Active Production Projects

### P1: GWX
- **Location**: `projects/production/gwx/`
- **Status**: ✅ v1.0.0 (PR #3 breaking changes resolved)
- **Stack**: Node.js, TypeScript
- **Last Update**: 2026-03-30

### P2: TG Bot (Claude Code Telegram Bot)
- **Location**: `projects/production/claude_code_telegram_bot/`
- **Status**: ✅ KB Health Report + Mon 09:15 scheduled
- **Stack**: Python, Telegram API
- **Features**: Auto-tagging, stale detection
- **Last Update**: 2026-03-31

### P3: NS_0327
- **Location**: `projects/experimental/NS_0327/`
- **Status**: ✅ 6 SOPs completed + parallel framework v1 prod-ready
- **Stack**: Python
- **Last Update**: 2026-03-30

### P4: YD Utility Kit
- **Location**: `projects/production/yd-utility-kit/`
- **Status**: ✅ v0.2.0 — Workspace automation CLI toolset
- **Stack**: Python, Click, OpenCV, Pillow
- **Features**: File/Git/Media/Text/Project/Env/Sys management
- **Last Update**: 2026-04-01

### P5: VWRS (Video Watermark Removal System)
- **Location**: `projects/production/video-watermark-removal-system/`
- **Status**: ✅ v1.0.0 — 生產就緒 (MVP 完成)
- **Stack**: Python, OpenCV, FastAPI, PostgreSQL, Docker, Kubernetes
- **Architecture**: 6 層核心管道 + 企業級 API/安全/部署
- **Core Pipeline (Phase 1-6)**:
  - Phase 1: 架構設計 (763 行)
  - Phase 2: 追蹤層 — CSRT + MaskStabilizer (906 行 + 12 測試)
  - Phase 3: 時序參考 — OpticalFlow + FrameAligner + ReferenceFetcher (787 行 + 15 測試)
  - Phase 4: 空間修復 — Telea/NS inpainting + 可替換後端 (721 行 + 16 測試)
  - Phase 5: 整合層 — BoundaryBlender + GrainMatcher + TemporalRefiner (843 行 + 23 測試)
  - Phase 6: 優化 — BatchProcessor + CLI + 配置模板 (1,200 行 + 20 E2E 測試)
- **Extended (Phase 7-15)**:
  - REST API + WebSocket 即時進度
  - PostgreSQL 持久化 + SQLAlchemy ORM
  - JWT 認證 + 2FA (TOTP) + RBAC + API Keys
  - Token Bucket 速率限制
  - K8s + Terraform + CI/CD + Prometheus/Grafana 監控
- **Stats**: 15,000+ 行代碼, 138 測試全通過, 100% 關鍵路徑覆蓋
- **Performance**: 4-8 FPS (100 幀 480p), P95 < 200ms API
- **Last Update**: 2026-03-31

## Tools

### P6: WM Tool (Watermark Removal + Re-watermark Local Tool)
- **Location**: `projects/tools/wm-tool/`
- **Status**: 🔨 MVP 完成 — Stage A→F pipeline + Gradio WebUI
- **Stack**: Python, EasyOCR, OpenCV, ffmpeg, Gradio
- **Features**: EasyOCR 偵測、時序追蹤、動態遮罩、高斯模糊去除、圖片/影片浮水印疊加、per-frame 座標追蹤
- **Last Update**: 2026-03-31

### P7: VTS (Video Transcode Skill)
- **Location**: `projects/production/vts/`
- **Status**: ✅ v0.1.0 — Quality-first video transcode skill
- **Stack**: Node.js, TypeScript, FFmpeg
- **Features**: Multi-codec support, quality profiles, agent-native CLI
- **Tests**: 15 tests (vitest)
- **Last Update**: 2026-04-07

## Agent & Automation Infrastructure

### Obsidian Vault Mining Pipeline
- **Location**: `scripts/agent/vault-miner.sh`, `scripts/vault-mining-scheduler.sh`
- **Status**: ✅ Active — Knowledge & insight extraction pipeline
- **Stack**: Bash, Python, Obsidian Metadata
- **Features**: ROI-based skill idea generation, pain point detection, vault quality metrics
- **Last Update**: 2026-04-01

## Experimental Projects

### HR Admin Bot (v0.5)
- **Location**: `projects/experimental/hr-admin-bot/`
- **Status**: Development

## Libraries

### Clausidian (v3.4.0)
- **Location**: `projects/tools/clausidian/`
- **Status**: ✅ Architecture refactored (table-formatter + frontmatter-helper)
- **Last Update**: 2026-03-31

---

## Quick Commands

```bash
source ~/.zshrc-workspace

p1   # cd to GWX
p2   # cd to TG Bot
p3   # cd to NS_0327
p4   # cd to YD Utility Kit
p5   # cd to VWRS
p6   # cd to wm-tool
p7   # cd to vts
ydk  # alias for yd-utility-kit
pw   # cd to workspace root
kb   # cd to obsidian/
```

## Development Checklist

### VWRS Phase 1 ✅
- [x] Project structure
- [x] 4-layer architecture design
- [x] VideoReader / VideoWriter
- [x] MaskHandler (ROI support)
- [x] Pipeline coordinator
- [x] CLI framework
- [x] Configuration system (YAML)
- [x] Architecture documentation
- [x] Development guide + code templates
- [x] Initial commit

### VWRS Phase 2 ✅
- [x] Tracker (CSRT with drift detection)
- [x] MaskStabilizer (temporal smoothing + edge feathering + denoising)
- [x] Tracking visualization (bbox + mask overlay)
- [x] 12+ unit tests (~85% coverage)
- [x] Complete demo script (synthetic video generation)
- [x] Automated test suite (test_phase2.sh)
- [x] Phase 2 completion report

### VWRS Phase 3 ✅
- [x] OpticalFlowEstimator (Farneback algorithm)
- [x] FrameAligner (reverse flow warping + confidence)
- [x] ReferenceFetcher (temporal window sampling + weighted fusion)
- [x] 15+ unit tests (~80% coverage)
- [x] Complete demo script (optical flow + alignment + reference extraction)
- [x] Automated test suite (test_phase3.sh)
- [x] Phase 3 completion report

### VWRS Phase 4 ✅
- [x] SpatialRestorer implementation
  - [x] Telea inpainting backend
  - [x] NS (Navier-Stokes) inpainting backend
  - [x] Swappable backend architecture
- [x] Reference-guided restoration (Fixed copy logic)
- [x] NumPy 2.x compatibility fix
- [x] 17 unit tests (~85% coverage)
- [x] Demo script + visualization

### VWRS Phase 5 ✅
- [x] BoundaryBlender (distance transform + linear/sigmoid curves)
- [x] GrainMatcher (boundary statistics color transfer)
- [x] TemporalRefiner (Gaussian temporal smoothing + color stabilization)
- [x] 20 unit tests (~85% coverage)
- [x] Demo script + test_phase5.sh

### VWRS Phase 6 ✅
- [x] BatchProcessor (multi-thread/process)
- [x] CLI stats/config commands (4 templates: fast/balanced/quality)
- [x] 20 E2E system tests (100% pipeline coverage)
- [x] Performance baselines established

### VWRS Phase 7-15 ✅
- [x] REST API + WebSocket
- [x] PostgreSQL + SQLAlchemy ORM
- [x] JWT auth + 2FA + RBAC + API Keys
- [x] Rate limiting (Token Bucket)
- [x] K8s deployment + Terraform + CI/CD
- [x] Prometheus/Grafana monitoring
- [x] 138 tests all passing, production ready

---

## Infrastructure: Workspace Evolution
- **Location**: `scripts/agent/`, `scripts/lib/`
- **Status**: ✅ Phase 3 Core Infrastructure COMPLETE
- **Stack**: Bash, JQ, Parallel Processing
- **Deliverables**:
  - `scripts/lib/cache.sh`: Shared JSON cache library (macOS/Linux portable)
  - `scripts/vault-query-cache.sh`: Standardized vault metadata provider (5min TTL)
  - `scripts/agent/skill-orchestrator.sh`: Optimized execution engine (Parallel groups + Backoff retries)
  - `docs/workflows/`: Declarative workflow definitions (YAML-like)
- **Performance Gains**:
  - `agent-monitoring`: 10s → ~3s (estimated via 4-way parallelism)
  - `vault-sync-daily`: 30s → ~12s (estimated via cache + 3-way parallelism)
- **Last Update**: 2026-04-01 (Current)
