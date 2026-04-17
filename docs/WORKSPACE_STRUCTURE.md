---
title: YD 2026 Workspace Structure
type: resource
tags: [workspace, structure, reference]
created: 2026-03-30
updated: 2026-04-07
status: active
heat: active
summary: "YD 2026 工作區完整目錄結構：生產項目、實驗項目、工具、文檔、腳本、知識庫"
---

# YD 2026 Workspace Structure

**Date:** 2026-03-30  
**Status:** Active

## Current Layout

```text
YD 2026/
├── projects/
│   ├── production/
│   │   ├── gwx/
│   │   └── claude_code_telegram_bot/
│   ├── experimental/
│   │   ├── NS_0327/
│   │   ├── remotion-clip/
│   │   └── dspy-trial/
│   └── tools/
│       ├── ctx/
│       ├── clausidian/
│       ├── session-wrap-backend/
│       └── session-wrap-skill/
├── docs/
│   ├── archive/
│   └── plans/
├── scripts/
├── obsidian/
├── PROJECTS_INFO.md
├── CLAUDE.md
└── .zshrc-workspace
```

## Active Project Mapping

| Alias | Path | Role |
|------|------|------|
| `p1` | `projects/production/gwx/` | 主力 production CLI 專案 |
| `p2` | `projects/production/claude_code_telegram_bot/` | 日常自動化與 Telegram bot |
| `p3` | `projects/experimental/NS_0327/` | 活躍中的 Python 實驗專案 |

## Notes

- `projects/production/dexapi/`
- `projects/production/test-ydapi/`
- `projects/production/watermark-0324/`

以上三個路徑目前僅保留為空殼歷史目錄，不應再出現在主文檔、別名或新工作流中。

- session-wrap 相關長文檔已集中到 `docs/`，舊資料放在 `docs/archive/`
- 任何引用 `web/` 或 `server/` 的說明，都屬於歷史部署資料，不代表當前工作區存在這些目錄
