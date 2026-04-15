# Session Wrap — Universal Agent Skill

一個通用的會話自動化技能，支持所有 AI agent（Claude Code、Cursor、Windsurf、Cline 等）。

## 使用方式

### 在任何 Agent 中

```bash
# 保存會話
wrap "Feature完成"

# 查看雲端狀態
wrap status

# 同步到雲端
wrap sync

# 下次會話自動恢復上下文
```

## 支持的 Agent

- ✅ Claude Code（官方）
- ✅ Cursor
- ✅ Windsurf
- ✅ Cline
- ✅ Aider
- ✅ Continue.dev
- ✅ Copilot
- ✅ 任何其他 agent

## 架構

```
Agent Process
    ↓
session-wrap CLI
    ├─ 自動檢測環境變數
    ├─ 獲取 agent token
    └─ 調用後端 API

Backend API (Node.js)
    ├─ 自動認證任何 agent
    ├─ PostgreSQL 雲端存儲
    └─ 返回 JWT + 數據
```

## 環境變數

每個 agent 設定自己的 token：

```bash
# Claude Code
export CLAUDE_CODE_TOKEN=sk_...

# Cursor
export CURSOR_TOKEN=sk_...

# Windsurf
export WINDSURF_TOKEN=sk_...

# 其他
export CLINE_TOKEN=...
export AIDER_TOKEN=...
```

## 工作流

### 會話開始
```bash
source ~/.zshrc-wrap
yd-start-session      # 載入上次 context
```

### 工作中
```bash
wrap "做完功能 X"     # 中途保存
wrap                  # 簡單保存
```

### 會話結束
```bash
yd-end-session "全部完成"  # 最終保存 + 雲端同步
```

### 下次會話
自動恢復上次的 context！

## 認證流程

1. **自動偵測** — 檢查環境變數或 user-agent
2. **驗證 Token** — 調用 Claude Code API（無需重新登錄）
3. **獲得 JWT** — 用於後續 API 請求
4. **雲端同步** — 存儲 wrap + 索引

**零配置** — 只要設定對應的環境變數即可！

## Skill 命令

在 Claude Code / Cursor 等中：

```bash
/session-wrap login          # 驗證認證
/session-wrap upload         # 上傳當前 wrap
/session-wrap history        # 查看歷史
/session-wrap status         # 檢查存儲
```

## 為什麼是 Skill？

1. **跨 Agent** — 任何工具都能用
2. **零依賴** — 只需環境變數
3. **完全開源** — 自託管或雲端
4. **隱私優先** — 你的 token，你控制

## 下一步

1. 每個 agent 設定環境變數
2. 執行 `wrap` 保存會話
3. 下次開始自動恢復！

---

**部署：** Railway / Render / Self-hosted
**監控：** wrap 數量、存儲使用量
**擴展：** Slack 通知、團隊協作等
