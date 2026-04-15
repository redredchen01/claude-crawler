---
name: doc-scaffolder
description: "Auto-generate documentation (ARCHITECTURE.md, CONTRIBUTING.md, TROUBLESHOOTING.md) from code and metadata."
triggers:
  - "Generate project documentation"
  - "Create ARCHITECTURE and CONTRIBUTING guides"
  - "Scaffold missing docs"
categories:
  - documentation
  - automation
  - project-setup
dependencies:
  - Node.js 16+
  - Project README.md
  - Project CLAUDE.md (optional but recommended)
  - Git repository (for commit history)
---

# /doc-scaffolder (P1)

自動從代碼 + 元數據生成項目文檔。

## 功能

- **ARCHITECTURE.md** — 系統架構概覽、模塊分層、性能目標
- **CONTRIBUTING.md** — 開發指南、提交規範、測試流程
- **TROUBLESHOOTING.md** — 常見問題、恢復流程、已知問題

## 使用方式

### 生成單一文檔

```bash
cd /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot
node doc-scaffolder.mjs --project /path/to/project --type architecture
```

### 生成全部三個文檔

```bash
node doc-scaffolder.mjs --project /path/to/project --all
```

### Dry-run（預覽，不寫入）

```bash
node doc-scaffolder.mjs --project /path/to/project --type architecture --dry-run
```

## 文檔類型說明

### ARCHITECTURE.md

系統設計概覽，包括：
- 項目概述（來自 README.md 第一段）
- 模塊分層（gwx 11 服務、telegram bot 6 層）
- 核心依賴（來自 CLAUDE.md）
- 數據模型（如果存在於 README.md）
- 性能指標（如果存在於 README.md）
- 系統約束（平台、Node 版本、並發模型）

**高優先級使用**：
- gwx ARCHITECTURE.md 已生成（原本缺失但被 CLAUDE.md 引用）
- telegram bot ARCHITECTURE.md 新生成

### CONTRIBUTING.md

開發者貢獻指南，包括：
- 快速開始（clone 和 npm install）
- 代碼風格（來自 CLAUDE.md）
- 提交規範（來自 CLAUDE.md）
- 測試運行方式
- Pull Request 流程

### TROUBLESHOOTING.md

故障排查指南，包括：
- 常見問題（來自 README.md 的 ## 故障排除 段落）
- 最近的 bug 修復（從 `git log --grep="fix|bug"` 提取）
- 恢復流程（LaunchD restart、查看日誌）
- 支持求助鏈接

## 數據來源優先順序

| 信息 | 來源優先級 |
|------|-----------|
| 項目概述 | README.md 第一段 |
| 模塊架構 | CLAUDE.md / README.md 相關段落 |
| 代碼風格 | CLAUDE.md `## Code Style` |
| 提交規範 | CLAUDE.md `## Commit Conventions` |
| 數據模型 | README.md `## 數據模型` |
| 性能目標 | README.md `## 性能` |
| 已知問題 | git log `--grep="fix\|bug"` (last 20) |
| 運維程序 | OPERATIONS.md (if exists) |

## 項目配置

### 必須

- **README.md** 在項目根目錄
  - 第一段用作項目概述
  - ## 架構 / ## Architecture 段落用作模塊設計
  - ## 故障排除 段落用作常見問題

### 推薦

- **CLAUDE.md** 在項目根目錄
  - `## Code Style` 段落
  - `## Commit Conventions` 或 `## Commit & PR` 段落
  - Subagent 列表和 MCP server 配置

### 可選

- **package.json** — 依賴版本信息
- **OPERATIONS.md** — 運維程序（TROUBLESHOOTING.md 中會引用）
- **git 歷史** — 用於提取已知修復

## 快速開始

### 為新項目生成所有文檔

```bash
node doc-scaffolder.mjs --project ~/projects/my-new-project --all
```

### 為 gwx 刷新 ARCHITECTURE.md

```bash
node doc-scaffolder.mjs --project ~/projects/production/gwx --type architecture
```

### 預覽輸出（Dry-run）

```bash
node doc-scaffolder.mjs --project . --type contributing --dry-run | head -50
```

## 與現有系統的整合

替代（部分）：
- `/Users/dex/YD 2026/scripts/agent/doc-scaffolder.sh` — 更強大的新版本
- 手動編寫 ARCHITECTURE.md 和 CONTRIBUTING.md

優點：
- **自動化** — 一個命令生成 3 個文檔
- **一致性** — 跨項目使用統一模板
- **可維護性** — 從元數據（README/CLAUDE.md）驅動，避免重複
- **版本同步** — git 歷史自動反映在已知問題中

## 故障排除

### 找不到 README.md

確保項目根目錄有 README.md：

```bash
ls -la /path/to/project/README.md
```

### 文檔內容不完整

檢查 CLAUDE.md 是否有以下段落：
- `## Code Style`
- `## Commit Conventions` 或 `## Commit & PR`
- `## 數據模型`

如果缺失，doc-scaffolder 會使用默認內容。

### 性能目標未出現在 ARCHITECTURE.md

檢查 README.md 中是否有 `## 性能` 或 `## Performance` 段落。

## 生成的文件位置

```
project-root/
├── ARCHITECTURE.md          (新生成)
├── CONTRIBUTING.md          (新生成)
├── TROUBLESHOOTING.md       (新生成)
├── README.md                (已存在)
└── CLAUDE.md                (已存在)
```

## 性能

- 生成時間: ~100-500ms（取決於項目大小和 git 歷史）
- 單個文檔: ~50ms
- 全部 3 個: ~200ms

## 相關技能

- /code-doc-linker — 代碼實體到文檔映射
- /doc-updater — Vault 文檔索引更新
- /project-foundry — 項目初始化和結構搭建

---

**狀態**: ✅ Implemented  
**上線日期**: 2026-04-10  
**支持項目**: gwx, telegram bot, 任意 Node.js/Go 項目  
**維護者**: dex
