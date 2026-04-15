---
name: vault-note-tracker
description: "Track idea notes lifecycle from vault to skill-factory. Visualize progress from concept to implementation."
triggers:
  - "Track idea progress"
  - "Show idea lifecycle"
  - "Check skill development status"
categories:
  - tracking
  - reporting
  - lifecycle-management
dependencies:
  - vault (ideas/ directory)
  - skill-factory (built/ and queue.md)
---

# /vault-note-tracker (Quick-C)

追蹤想法從 vault 中的 idea 筆記到 skill-factory 的實現進度。

## 功能

- 掃描 vault/ideas/ 目錄的所有想法
- 交叉參考已實現的技能 (skill-factory/built/)
- 交叉參考隊列中的項目 (skill-factory/queue.md)
- 生成進度報告，展示想法的生命週期

## 使用方式

### 查看想法追蹤報告

```bash
cd /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot
node vault-note-tracker.mjs
```

**輸出**：
- 想法總數統計
- 已完成 / 隊列中 / 待處理數量
- 逐一列出每個想法的進度

### 預覽報告（不推送）

```bash
node vault-note-tracker.mjs --dry-run
```

## 報告格式

```
📊 Idea 追蹤報告
════════════════════════════════════════

摘要
• 總想法數: 6
• ✅ 已完成: 1
• 🟡 隊列中: 2
• ⚪ 待處理: 3

進度詳情
Idea                  | Status  | Progress
─────────────────────────────────────────
idea-1               | active  | ✅ Completed
idea-2               | draft   | 🟡 In Queue
idea-3               | active  | ⚪ Not Started
...
```

## 進度狀態解讀

| 圖標 | 狀態 | 含義 |
|-----|------|------|
| ✅ | Completed | 已實現為 skill（在 skill-factory/built/ 中） |
| 🟡 | In Queue | 已排入隊列，準備實施（在 queue.md 中） |
| ⚪ | Not Started | 尚未開始實施 |

## 想法生命週期

```
想法產生
  ↓
vault/ideas/ (idea 筆記)
  ↓
評估 & 排優先級
  ↓
加入 skill-factory/queue.md
  ↓
實施 (開發 skill)
  ↓
完成 → skill-factory/built/
```

## 集成場景

### 1. 晨報展示

每日早會展示想法進度：

```bash
node vault-note-tracker.mjs | \
  grep -E "摘要|已完成|隊列中" | \
  mail -s "想法追蹤" team@example.com
```

### 2. 週報統計

追蹤本週完成的想法轉化：

```bash
node vault-note-tracker.mjs > tracking-$(date +%Y-%W).txt
```

### 3. 績效指標

計算想法轉化率：

```bash
# 已完成 / 總想法
completed=$(grep "✅" output | wc -l)
total=$(grep "| active" output | wc -l)
rate=$((completed * 100 / total))
echo "轉化率: ${rate}%"
```

## 手動操作

### 新增想法

在 `vault/ideas/` 中創建新 markdown 文件：

```markdown
---
title: 新想法
type: idea
status: active
created: 2026-04-10
updated: 2026-04-10
tags: [feature, automation]
---

# 新想法

想法描述...
```

### 推進想法到隊列

當想法成熟時，添加到 `skill-factory/queue.md`：

```
| 2026-04-10 | P2 | /skill-id | Idea Title | vault-idea |
```

追蹤器會自動識別並更新進度為 "In Queue"。

### 標記想法為已完成

當實現為 skill 後，創建對應的 `SKILL.md` 文件在 `skill-factory/built/`：

```
/Users/dex/YD 2026/skill-factory/built/skill-name.SKILL.md
```

追蹤器會自動識別並更新進度為 "Completed"。

## 故障排除

### 報告顯示 0 個想法

檢查 vault 是否在正確路徑：

```bash
ls -la /Users/dex/YD\ 2026/obsidian/ideas/
```

### 想法未識別為已完成

確保 SKILL.md 文件名與想法名稱匹配（不區分大小寫）

### 隊列項目未被識別

檢查 queue.md 的格式是否正確：

```
| YYYY-MM-DD | P# | /skill-id | Title | source |
```

## 性能

- 掃描時間: ~500ms
- 交叉參考: ~100ms
- 報告生成: ~50ms
- 總執行時間: ~700ms

## 相關技能

- /linear-issue-export — CSV 導出
- /linear-tg-bug-reporter — Issue 管理
- /vault-mining-daemon — vault 自動化掃描

---

**狀態**: ✅ Implemented  
**上線日期**: 2026-04-10  
**實現時間**: ~25 分鐘  
**維護者**: dex
