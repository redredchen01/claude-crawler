---
name: performance-oracle
description: "Cross-project bottleneck analyzer. Aggregates task performance, benchmarks, and site metrics to identify slowdowns."
triggers:
  - "Analyze performance bottlenecks"
  - "Get performance report"
  - "Check task execution times"
categories:
  - monitoring
  - performance
  - analytics
dependencies:
  - task-perf.json (perf stats)
  - logs/*.log (task timings)
  - benchmark-results.json (optional)
  - lighthouse-history.csv (optional)
  - ga4-history.csv (optional)
---

# /performance-oracle (P2)

跨項目瓶頸分析器 — 聚合任務性能、基準測試、網站指標。

## 功能

- **任務執行分析** — 從 `logs/*.log` 提取 END (Nms) 時間戳，構建時間序列
- **性能統計** — 讀取 `task-perf.json`，計算平均值、慢運行百分比
- **基準測試發現** — 從 `benchmark-results.json` 提取瓶頸和 P0 bug
- **網站性能趨勢** — Lighthouse 和 GA4 的週比較，檢測迴歸

## 使用方式

### 完整報告

```bash
cd /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot
node performance-oracle.mjs
```

**輸出**: 推送到 Telegram 的性能報告

### 預覽（不推送）

```bash
node performance-oracle.mjs --dry-run
```

### 簡短版本（僅頂級瓶頸）

```bash
node performance-oracle.mjs --short --dry-run
```

## 報告結構

### 1. Top Bottlenecks

優先級排序的瓶頸清單：
- 最慢任務（avg > 1000ms）
- P0 bug（來自基準測試）
- 可靠性問題（fail 或超時）

### 2. Task Execution Summary

表格顯示：
| Task | Avg(ms) | Max(ms) | Slow% | Status |

Status 指示：
- ✅ — Slow% ≤ 5%
- 🟡 — Slow% 5-20%
- 🔴 — Slow% > 20%

### 3. Site Performance (Last 4 weeks)

Lighthouse 和 GA4 趨勢：

```
Site        | Mobile | Desktop | Trend
──────────────────────────────────────
xhssex.com  |   72   |   85    | ↑
51acgs.com  |   68   |   82    | ↓
```

Trend symbols:
- ↑ — 性能提升
- ↓ — 性能下降 >10%
- → — 無明顯變化

### 4. Benchmark Findings

模塊級瓶頸和 P0 bug：
- 🔴 Critical: P0 bug
- 🟡 Medium: 優化機會

### 5. Recommendations

依據發現的具體建議。

## 數據來源

### 必要

| 文件 | 說明 |
|------|------|
| `logs/*.log` | 所有任務執行日誌（30+ 文件） |
| `task-perf.json` | 任務性能統計 |

### 可選

| 文件 | 說明 |
|------|------|
| `benchmark-results.json` | 模塊基準測試結果 |
| `benchmark-summary.json` | 基準測試摘要 |
| `lighthouse-history.csv` | 網站性能歷史 |
| `ga4-history.csv` | GA4 會話數據 |

## 任務執行時間解析

性能 Oracle 掃描所有 `logs/*.log` 文件，查找 `END (Nms)` 模式：

```
===== 2026-04-10 17:07:08 [task-name] START =====
...
===== 2026-04-10 17:07:09 [task-name] END (695ms) =====
```

這提供了整個自動化艦隊的高精度牆鐘時間數據。

## 瓶頸定義

| 類型 | 定義 | 觸發條件 |
|------|------|----------|
| Slow Task | 任務執行時間異常 | avg > 1.5x fleet avg 或 slow% > 10% |
| P0 Bug | 臨界生產錯誤 | 來自基準測試摘要 |
| Timeout | 執行超時 | execution > 120s |
| Reliability | 可靠性問題 | fail 率 > 20% |

## 集成場景

### 日常監控

排程在每週五執行：

```bash
# 在 launchd 或 cron 中
0 18 * * 5 cd /path && node performance-oracle.mjs
```

### 性能會議

在週一晨會上快速查看：

```bash
node performance-oracle.mjs --short --dry-run
```

### 深度分析

當出現性能下降時：

```bash
node performance-oracle.mjs --dry-run | tee perf-report-$(date +%Y%m%d).txt
```

## 故障排除

### 報告中沒有任務數據

檢查 `task-perf.json` 是否存在且有效：

```bash
cat task-perf.json | jq . | head -20
```

### 沒有站點性能數據

確保 CSV 文件存在：

```bash
ls -lh lighthouse-history.csv ga4-history.csv
```

### Telegram 推送失敗

檢查 `sendTelegramLong` 是否正確配置（見 CLAUDE.md）。

## 性能指標

- 解析時間: ~200-500ms（取決於日誌大小）
- 報告生成: ~100ms
- 推送時間: <1s
- 總執行時間: ~500ms-1s

## 相關技能

- /task-perf-tracker — 任務性能跟蹤（數據源）
- /site-health — 站點可用性監控
- /lighthouse — 網站性能審計

---

**狀態**: ✅ Implemented  
**上線日期**: 2026-04-10  
**執行頻率**: On-demand / Weekly（建議）  
**數據範圍**: 所有 30+ 任務 + 網站性能  
**維護者**: dex
