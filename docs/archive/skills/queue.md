# Skill Factory Queue

每日由 `/skx` 自動更新。`/sfx` 從此隊列消費並生成 skill。

## 格式
```
- [ ] YYYY-MM-DD | P1 | /skill-name | 描述 | vault-idea-note (可選)
- [x] YYYY-MM-DD | P1 | /skill-name | 描述 | built: YYYY-MM-DD
```

---

## Pending

- [x] 2026-03-31 | P1 | /vault-search-cli | Obsidian 全文搜索 API — 給腳本查詢 vault 內容、歷史記錄、決策追蹤 | built: 2026-03-31
- [x] 2026-03-31 | P1 | /vault-watch | Real-time vault file watcher — 整合到開發流程，偵測變更自動觸發 | built: 2026-03-31

## Built

- [x] 2026-03-31 | P1 | /linear-slack-reporter-skill | 自動查詢 Linear bug，格式化為 Slack 表格，一鍵發送通知 | built: 2026-03-31
- [x] 2026-03-31 | P1 | /dspy-optimizer | DSPy 自動 prompt 優化 — Obsidian tag 匹配精度 + A/B 測試框架 | built: 2026-03-31
- [x] 2026-03-31 | P1 | /agent-tracer | 輕量級 Agent 追蹤系統：append-only JSONL + 周報聚合 | built: 2026-03-31
- [x] 2026-03-31 | P1 | /dashboard-value-logger | 自動記錄 dashboard 使用情況（會話數/時長/功能熱度）| built: 2026-03-31

- [x] 2026-03-31 | P1 | /auto-daily | 自動從 git+Obsidian+gwx+GA4 生成 daily-context.json | built: 2026-03-31
- [x] 2026-03-31 | P1 | /dspy-trial | DSPy 自動 prompt 優化 — Obsidian tag 匹配精度 | built: 2026-03-31
- [x] 2026-03-31 | P1 | /dashboard-roi-logger | 記錄 dashboard 使用頻率，驗證 Phase 9C/D ROI | built: 2026-03-31

- [x] 2026-03-31 | P2 | /ops-recommender | AI 推薦引擎：基於歷史告警模式推薦行動 | built: 2026-03-31
- [x] 2026-03-31 | P2 | /alert-dedupe | 告警去重和自動升級邏輯 | built: 2026-03-31
- [x] 2026-03-31 | P2 | /xhs-healthcheck | xhs 集成故障根因分析 (392 連續失敗) | built: 2026-03-31

- [x] 2026-03-31 | P1 | /site-doctor-skill | 一鍵全套站點診斷，整合 Lighthouse + SEO + 斷鏈 + CrUX + SSL | built: 2026-03-31
- [x] 2026-03-31 | P1 | /competitor-intel-skill | 競品情報自動簡報，定期監控、趨勢識別、週報推送 | built: 2026-03-31
- [x] 2026-03-31 | P1 | /api-aggregation-notifier | 通用框架：多源 API 數據聚合 → 轉換表格 → Slack dispatch | built: 2026-03-31
- [x] 2026-03-30 | P1 | /pypi-publish | 消除手動 twine upload，一鍵打包+上傳 PyPI | built: 2026-03-30
- [x] 2026-03-30 | P1 | /agent-trace | append-only JSONL agent 操作追蹤，查詢+周報整合 | built: 2026-03-30
- [x] 2026-03-30 | P1 | /site-doctor | 複合站點診斷：可用性+SEO+效能+競品對標 | built: 2026-03-30
- [x] 2026-03-30 | P2 | /prompt-audit | 掃描所有 skill/prompt 找反模式，A/B 框架建議 | built: 2026-03-30
- [x] 2026-03-30 | P2 | /launchd-health | 列出 24 個 LaunchAgent 狀態+失敗告警 | built: 2026-03-30
- [x] 2026-03-31 | P1 | /linear-slack-reporter | 自動查詢 Linear bug、整理成表格、發 Slack 通知 | built: 2026-03-31


- [x] 2026-03-31 | P1 | /t1-status-snapshot | Live T1 project status with execution readiness matrix | built: 2026-03-31
- [x] 2026-03-31 | P1 | /version-bump-auto | Auto-detect semver, update CHANGELOG, tag git | built: 2026-03-31
- [x] 2026-03-31 | P1 | /reference-digest | Collect top resources by tag, generate digest | built: 2026-03-31

- [x] 2026-03-31 | P1 | /npm-publish-auto | npm 包自動發布 — 檢測版本、更新 package.json、發布到 npm | built: 2026-03-31
- [x] 2026-03-31 | P1 | /analytics-report | Phase 10 深度指標分析 — GA4 聚合、Custom Dashboard 生成、Scheduled 報表 | built: 2026-03-31
- [x] 2026-03-31 | P1 | /agent-dashboard | Agent 系統監控儀表板 — 顯示 6 agents 健康度、fallback 鏈、週報聚合 | built: 2026-03-31

- [x] 2026-03-31 | P1 | /prompt-ab-test | Prompt A/B 測試框架 — 自動比較不同 prompt 效果 + 版本控制 | built: 2026-03-31
- [x] 2026-03-31 | P1 | /journal-auto-log | Obsidian journal 自動同步 — 將操作記錄自動寫回 journal，形成閉環 | built: 2026-03-31

---

## 近期 (Next Round)

### P2 — Build Next

- [x] 2026-03-31 | P2 | /context-compact | 上下文壓縮器 — 自動檢測大型 codebase，壓縮冗長上下文到 200K | built: 2026-03-31
- [x] 2026-03-31 | P2 | /tg-task-runner | TG Bot 遠端任務觸發 — /run <task> 遠端執行 launchd 排程任務 | built: 2026-03-31
- [ ] 2026-03-31 | P1 | /linear-slack-bug-reporter pypi-auto-publish agent-trace-system | TBD | vault-idea
