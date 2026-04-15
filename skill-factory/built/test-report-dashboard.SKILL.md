---
name: test-report-dashboard
description: "Parse vitest, node:test, and pytest outputs to generate a unified test results dashboard."
triggers:
  - "Run test report"
  - "Generate test dashboard"
  - "Check test coverage status"
categories:
  - testing
  - ci-cd
  - reporting
dependencies:
  - Node.js 16+
  - vitest (for gwx/npm)
  - node:test (built-in, for tg-bot)
  - pytest (for tg-bot Python tests)
---

# /test-report-dashboard (P2)

統一的測試報告儀表板 — 聚合 vitest、node:test、pytest 結果。

## 功能

- **多運行器支持** — vitest、node:test、pytest
- **結果聚合** — 統計通過/失敗/跳過
- **失敗詳情** — 顯示前 3 個失敗測試
- **性能跟蹤** — 執行時間和通過率

## 使用方式

### 運行完整報告

```bash
cd /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot
node test-report-dashboard.mjs
```

**輸出**: 推送到 Telegram 的測試報告

### 預覽（不推送）

```bash
node test-report-dashboard.mjs --dry-run
```

### 運行特定項目的測試

```bash
# 只運行 gwx 的 vitest
node test-report-dashboard.mjs --project gwx --dry-run
```

## 報告結構

### Per-Project Results

```
📦 gwx (vitest)
✅ 5 passed  ⏱ 25.7s

📦 tg-bot (node:test)
✅ 80 passed  ⏱ 0.4s
  • Failed test name 1
  • Failed test name 2
  • ... 3 more

📦 tg-bot (Python)
✅ 9 passed  ⏱ 0.8s
```

### Summary

- ✅ **Passed**: 總通過測試數
- ❌ **Failed**: 總失敗測試數
- **Overall**: 通過率百分比 + 狀態 (✅ PASS / 🟡 PARTIAL / ❌ FAIL)

## 支持的測試框架

| Project | Runner | Status |
|---|---|---|
| gwx/npm | vitest | ✅ Supported |
| tg-bot | node:test | ✅ Supported |
| tg-bot | pytest | ✅ Supported |

## 測試位置

### gwx (vitest)

```
/Users/dex/YD 2026/projects/production/gwx/npm/tests/
└── gwx.test.js
```

Run: `npm run test` (in npm/ directory)

### tg-bot (node:test)

```
/Users/dex/YD 2026/projects/production/claude_code_telegram_bot/tests/
├── anomaly-detection-v2.test.mjs
├── command-args.test.mjs
├── config.test.mjs
├── core.test.mjs
├── integration-suite.test.mjs
├── integration.test.mjs
└── tg-bot-v12-integration.test.mjs
```

Run: `node --test tests/*.test.mjs`

### tg-bot (pytest)

```
/Users/dex/YD 2026/projects/production/claude_code_telegram_bot/tests/python/
├── test_staticghost.py
├── test_tag_predictor.py
└── test_tg_bot_core.py
```

Run: `pytest tests/python/ -v`

## 集成場景

### 日常 CI/CD

在 GitHub Actions 或 launchd 排程中：

```bash
# 每日報告
0 18 * * * cd /path && node test-report-dashboard.mjs
```

### 自動化工作流

納入部署前檢查：

```bash
# 推送到生產前
node test-report-dashboard.mjs
# 如果失敗，退出 1
```

### 早晨簡報集成

結合 `/morning-briefing`：

```bash
node test-report-dashboard.mjs --dry-run | grep "Overall"
# 附加到晨報摘要
```

## 故障排除

### "No tests found"

確保測試文件存在於預期位置：

```bash
ls tests/*.test.mjs
ls tests/python/*.py
ls ../gwx/npm/tests/
```

### vitest 測試失敗

檢查 gwx/npm 目錄：

```bash
cd /Users/dex/YD\ 2026/projects/production/gwx/npm
npm run test
```

### pytest 導入錯誤

確保已安裝依賴：

```bash
pip install -r requirements.txt
```

### Telegram 推送失敗

檢查 `sendTelegramLong` 是否正確配置（見 CLAUDE.md）。

## 性能

- 運行時間: ~30-40 秒（受 vitest 速度影響）
- 報告生成: ~100ms
- 推送時間: <1s
- 總執行時間: ~30-40s

## 相關技能

- /performance-oracle — 性能分析
- /site-health — 監控和告警

---

**狀態**: ✅ Implemented  
**上線日期**: 2026-04-10  
**支持框架**: vitest、node:test、pytest  
**執行頻率**: On-demand / Daily（建議）  
**維護者**: dex
