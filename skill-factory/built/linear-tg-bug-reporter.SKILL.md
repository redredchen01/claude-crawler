---
name: linear-tg-bug-reporter
description: "Query Linear bugs and push formatted report to Telegram. Supports status/priority filters."
triggers:
  - "Query open bugs from Linear"
  - "Send bug report to Telegram"
  - "Check Linear issues status"
categories:
  - integration
  - automation
  - reporting
dependencies:
  - Linear API key (env: LINEAR_API_KEY)
  - Telegram bot token
  - tg-utils.mjs (sendTelegramLong)
---

# /linear-tg-bug-reporter

自動從 Linear 查詢 bugs，格式化表格，推送到 Telegram 通知。

## 功能

- 查詢 Linear API（支持狀態、優先級篩選）
- 生成格式化表格報告
- 自動推送到 Telegram（支持長文本分段）
- 乾運行模式（--dry-run）用於預覽

## 使用方式

### 查詢所有開放 Bug

```bash
cd /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot
node linear-tg-reporter.mjs
```

### 查詢指定優先級

```bash
# 只查 P1/P2
node linear-tg-reporter.mjs --priority 1,2

# 指定狀態（默認: open）
node linear-tg-reporter.mjs --status "in progress" --priority 1
```

### 參數說明

| 參數 | 默認值 | 說明 |
|------|--------|------|
| `--status` | `open` | 狀態篩選（open, in progress, closed） |
| `--priority` | `all` | 優先級篩選（1=P1, 2=P2, 3=P3, 4=P4） |
| `--limit` | 50 | 返回結果數量上限 |
| `--dry-run` | false | 測試模式，不推送 |

### 預覽報告（不推送）

```bash
node linear-tg-reporter.mjs --dry-run
```

## 報告格式

```
📋 Linear Bug 報告

統計: 共 X 項 | 🔴 P1 個 | 🟠 P2 個 | 🟡 P3 個

詳情:
Priority | ID        | Title                    | Assignee    | Status
----------|-----------|--------------------------|-------------|----------
🔴 P1    | ISSUE-123 | Critical bug description | alice       | In Progress
...
```

## 環境變量

```bash
# 設置 Linear API Key
export LINEAR_API_KEY="your-linear-api-key"

# 或在 hooks-config.json 中設置
cat > hooks-config.json << EOF
{
  "linear_api_key": "your-key"
}
EOF
```

## 排程執行

在 launchd 或 cron 中添加：

```bash
# 每天 09:00 查詢 P1/P2 bugs
0 9 * * * cd /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot && node linear-tg-reporter.mjs --priority 1,2
```

**已配置排程**：週一～五 09:15 AM（通過 launchd）

## 集成用法

在其他腳本中調用：

```javascript
// import 相同函數
import { queryLinearBugs, formatPriority, generateReport, sendTelegramLong } from './linear-tg-reporter.mjs';

// 或直接執行 Node 子進程
const { execSync } = require('child_process');
const result = execSync('node linear-tg-reporter.mjs --priority 1');
```

## 故障排除

### 錯誤：Linear API Key not configured

確保 LINEAR_API_KEY 環境變量已設置或 hooks-config.json 包含 linear_api_key

```bash
export LINEAR_API_KEY="your-key"
node linear-tg-reporter.mjs --dry-run
```

### 錯誤：推送失敗

檢查 Telegram bot token 和 Chat ID 是否正確配置

```bash
cat hooks-config.json | grep -A2 telegram
```

### 無結果返回

嘗試增加 limit 或檢查狀態篩選

```bash
node linear-tg-reporter.mjs --status "open" --limit 100 --dry-run
```

## 依賴項

- Node.js 16+
- Linear GraphQL API
- Telegram Bot API
- tg-utils.mjs (sendTelegramLong 函數)

## 性能

- 查詢時間: ~1-2 秒（取決於 Linear API 響應）
- Telegram 推送: ~0.5-1 秒
- 總執行時間: ~2-3 秒

## 相關技能

- /linear-issue-export — CSV 導出
- /vault-note-tracker — idea 生命週期追蹤

---

**狀態**: ✅ Implemented  
**上線日期**: 2026-04-10  
**排程**: 週一～五 09:15 AM  
**維護者**: dex
