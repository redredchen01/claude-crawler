---
name: linear-issue-export
description: "Export Linear issues to CSV format. Complements /linear-tg-bug-reporter for bulk reporting."
triggers:
  - "Export Linear issues to CSV"
  - "Generate Linear report CSV"
  - "Bulk Linear issue export"
categories:
  - integration
  - reporting
  - data-export
dependencies:
  - linear-tg-reporter.mjs (extended with CSV export)
  - Linear API key
---

# /linear-issue-export (Quick-B)

將 Linear issues 導出為 CSV 格式，用於後續處理或數據分析。

## 功能

- 查詢 Linear API
- 導出結果為 CSV 格式
- 支持所有過濾選項（狀態、優先級、數量限制）

## 使用方式

### 基本導出

```bash
cd /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot
node linear-tg-reporter.mjs --export-csv
```

**輸出**: `output/linear-issues-YYYY-MM-DD.csv`

### 過濾導出

```bash
# 導出 P1/P2 bugs
node linear-tg-reporter.mjs --export-csv --priority 1,2

# 導出特定狀態
node linear-tg-reporter.mjs --export-csv --status "in progress"

# 限制數量
node linear-tg-reporter.mjs --export-csv --limit 100
```

### 預覽 CSV（不生成文件）

```bash
node linear-tg-reporter.mjs --export-csv --dry-run
```

## CSV 格式

```
ID,Title,Priority,Status,Assignee,Created
ISSUE-001,"Bug title",1,In Progress,Alice,2026-04-10
ISSUE-002,"Feature request",2,Open,Bob,2026-04-09
...
```

| 欄位 | 說明 |
|------|------|
| ID | Linear issue ID |
| Title | Issue 標題 |
| Priority | 優先級 (1-4) |
| Status | 狀態 (Open, In Progress, etc) |
| Assignee | 負責人名稱 |
| Created | 建立日期 |

## 使用場景

### 1. 每周匯總

```bash
# 導出本周 P1/P2 issues
node linear-tg-reporter.mjs --export-csv --priority 1,2 > week-summary.csv
```

### 2. 數據分析

導出 CSV 後可用 Excel/Google Sheets 進行：
- 優先級分佈分析
- 狀態進度追蹤
- 負責人工作量統計

### 3. 集成其他系統

```bash
# 導出後上傳到 Google Drive
csv_file=$(node linear-tg-reporter.mjs --export-csv)
gwx drive upload "$csv_file" --parent-id "..."
```

## 環境變量

```bash
# 設置 Linear API Key
export LINEAR_API_KEY="your-key"

# 或在 hooks-config.json 中設置
cat hooks-config.json | jq '.linear_api_key = "your-key"'
```

## 故障排除

### CSV 文件為空

檢查 Linear API Key 是否正確配置

```bash
node linear-tg-reporter.mjs --export-csv --dry-run
```

### 字符編碼問題

CSV 文件使用 UTF-8 編碼，在 Excel 中打開時若出現亂碼：

1. 在 Excel 中選擇「開舊檔」
2. 選擇編碼 → UTF-8

## 性能

- 查詢時間: ~1-2 秒
- 文件寫入: <100ms
- 總執行時間: ~2-3 秒

## 相關技能

- /linear-tg-bug-reporter — 實時 Telegram 推送
- /vault-note-tracker — idea 生命週期追蹤

---

**狀態**: ✅ Implemented  
**上線日期**: 2026-04-10  
**實現時間**: ~15 分鐘  
**維護者**: dex
