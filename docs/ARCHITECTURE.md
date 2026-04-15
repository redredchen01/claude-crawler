---
title: YD 2026 Workspace Architecture
type: resource
tags: [architecture, workspace, reference]
created: 2026-04-07
updated: 2026-04-07
status: active
summary: "YD 2026 工作區架構概覽：生產項目、實驗項目、共享工具與知識庫的多層集成"
---

# Architecture

YD 2026 是一個工作區倉庫，不是單一產品倉庫。它的主要作用是聚合多個獨立項目、共享腳本、文檔和知識庫。

## Workspace Layers

```text
workspace
├── production apps
├── experimental apps
├── tools
├── shared scripts
├── docs
└── obsidian knowledge base
```

## Active Projects

### P1: GWX
- Path: `projects/production/gwx/`
- Type: Go CLI with npm packaging
- Role: Google Workspace CLI 主項目

### P2: Claude Code Telegram Bot
- Path: `projects/production/claude_code_telegram_bot/`
- Type: Node.js automation scripts
- Role: Telegram 通知、報表與 Obsidian 自動化

### P3: NS_0327
- Path: `projects/experimental/NS_0327/`
- Type: Python package
- Role: HR Admin Bot 與相關 skill 實驗

## Shared Tooling

- `scripts/`: 工作區共享 shell 腳本
- `docs/`: 工作區和 session-wrap 文檔
- `obsidian/`: 知識庫
- `projects/tools/`: 可重用工具與 skill 專案

## Boundaries

- 各主項目保留自己的 repo、依賴與啟動方式
- 工作區級別名只負責導航和常用入口，不應偽裝成統一的 build/test 系統
- 空殼歷史目錄 `dexapi`、`test-ydapi`、`watermark-0324` 不再視為現行架構的一部分
