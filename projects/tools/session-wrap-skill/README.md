# session-wrap v3.1

**通用 AI Agent 記憶持久化** — 對話結束自動保存上下文，下次無縫接續。v3.1 新增 Context Window 智慧管理。支援 19+ AI 平台。

Universal memory persistence for every AI agent. Say "wrap up" — context survives to the next session.

[![npm](https://img.shields.io/npm/v/session-wrap-skill)](https://www.npmjs.com/package/session-wrap-skill)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 痛點 / The Problem

每次開新 AI 對話：

```
你：我們在做 XXX 專案，用 YYY 技術，上次做到 ZZZ...
你：對，那個 bug 是因為 AAA，我們決定用 BBB 方案...
```

**重複解釋上下文 = 浪費時間 + 遺漏關鍵資訊。**

## 解法 / The Solution

```
你：收工
```

AI 自動掃描 → 記憶寫入 → 維護壓縮 → 下次自動載入。**零手動。**

---

## 一鍵安裝 / One-Click Install

### 方法一：npx（推薦，自動偵測平台）

```bash
npx session-wrap-skill install
```

自動偵測你用的 agent，安裝到正確位置。輸出範例：

```
🧠 session-wrap-skill installer

Detected 2 platform(s):

  ✅ Claude Code → ~/.claude/skills/session-wrap/SKILL.md
  ✅ Cursor → .cursor/rules/session-wrap.mdc

✨ Done! Say '收工' or 'wrap up' to save context at session end.
```

### 方法二：Shell 腳本（不需要 Node.js）

```bash
curl -fsSL https://raw.githubusercontent.com/redredchen01/session-wrap-skill/main/install.sh | bash
```

### 方法三：npm 安裝

```bash
npm install session-wrap-skill
npx session-wrap-skill install
```

### 方法四：手動安裝

```bash
git clone https://github.com/redredchen01/session-wrap-skill.git
```

各平台手動複製：

```bash
# Claude Code
mkdir -p ~/.claude/skills/session-wrap
cp session-wrap-skill/SKILL.md ~/.claude/skills/session-wrap/SKILL.md

# Cursor
mkdir -p .cursor/rules
cp session-wrap-skill/SKILL.md .cursor/rules/session-wrap.mdc

# Cline / Roo Code
cp session-wrap-skill/SKILL.md .cline/rules/session-wrap.md
cp session-wrap-skill/SKILL.md .roo/rules/session-wrap.md

# OpenClaw
mkdir -p ~/.openclaw/skills/session-wrap
cp session-wrap-skill/SKILL.md ~/.openclaw/skills/session-wrap/SKILL.md

# Codex / Gemini CLI / Amp / Copilot / 其他
cat session-wrap-skill/SKILL.md >> AGENTS.md   # 或 GEMINI.md / AGENT.md
```

### 移除 / Uninstall

```bash
npx session-wrap-skill uninstall
```

---

## 支援平台 / Supported Agents (19+)

### 有原生記憶的 Agent

| Agent | 記憶路徑 | 備註 |
|-------|---------|------|
| **Claude Code** | `~/.claude/projects/<hash>/memory/` | 完整原生支援 |
| **Windsurf** | 內建 Memories DB + `.ai-memory/` | 雙寫 |
| **Cline** | `.cline/memory/` | Memory Bank |
| **Roo Code** | `.roo/memory/` | 繼承 Cline |

### 無原生記憶（Bootstrap 自動注入）

| Agent | 指令檔 | Bootstrap |
|-------|--------|-----------|
| **Codex** (OpenAI) | `AGENTS.md` | ✅ 自動 |
| **Gemini CLI** | `GEMINI.md` | ✅ 自動 |
| **Amp** (Sourcegraph) | `AGENT.md` | ✅ 自動 |
| **GitHub Copilot** | `.github/copilot-instructions.md` | ✅ 自動 |
| **Cursor** | `.cursor/rules/` | ✅ 自動 |
| **Continue.dev** | `.continuerules` | ✅ 自動 |
| **Aider** | `.aider.conf.yml` | ✅ 自動 |
| **OpenHands** | `.openhands/config.toml` | ✅ 自動 |
| **Amazon Q** | `.amazonq/rules/` | ✅ 自動 |
| **Tabnine** | IDE settings | 手動 |
| **Supermaven** | IDE settings | 手動 |

### AI 助理平台

| Agent | 記憶路徑 |
|-------|---------|
| **[OpenClaw](https://github.com/openclaw/openclaw)** | `~/.openclaw/workspace/memory/` |

### 雲端 Agent

| Agent | 方式 |
|-------|------|
| **Devin** | `.ai-memory/` in repo |
| **bolt.new** | `.ai-memory/` in project |

---

## 使用方式 / Usage

用任何語言說「結束」：

| 語言 | 觸發詞 |
|------|--------|
| 中文 | 收工、結束、先到這、今天先這樣、下次繼續 |
| English | wrap up, done for now, save context, end session |
| 日本語 | 終了、今日はここまで |
| 한국어 | 마무리, 오늘은 여기까지 |

### 輸出範例

```
記憶已更新：

| 檔案 | 動作 | 內容 |
|------|------|------|
| project_myapp.md | 更新 | v2.1 完成，auth 重構進行中 |
| feedback_testing.md | 新增 | 整合測試用 real DB |
| reference_apis.md | 壓縮 | 58→25 行，移除過期歷史 |

維護: 壓縮 1 檔 | 過期 0 檔 | 合併 0 檔
平台: Claude Code | 記憶路徑: ~/.claude/projects/.../memory/
```

---

## v3.1 新功能：Context Window 智慧管理

不用等到「收工」才存。AI 會**持續監控**上下文使用量，自動在關鍵節點保存記憶。

### 三段式閾值機制

```
上下文使用量
─────────────────────────────────────────────────
 0%                    50%              75%    100%
 │     🟢 正常工作      │  🟠 檢查點存檔  │ 🔴 完整存檔 │
 │                     │  (輕量快速)     │ (含維護壓縮) │
 │                     │                │ → 建議開新對話│
```

| 閾值 | 行為 |
|------|------|
| **~50%** | 🟠 **自動檢查點** — 快速保存當前進度（跳過維護），然後繼續工作 |
| **~75%** | 🔴 **完整存檔 + 提醒** — 執行全套 session-wrap，建議開新對話 |
| **> 80%** | 🔴 **緊急模式** — 最小化回應，優先保存所有未存的上下文 |

### 怎麼判斷上下文用了多少？

AI 沒有精確 token 計數器，但可以從訊號估算：

| 訊號 | 說明 |
|------|------|
| 對話輪次 | 30+ 輪通常已過半 |
| 工具呼叫數 | 60+ 次通常已過半 |
| 系統壓縮訊息 | 看到 `[compacted]` = 已經被壓縮，立刻存檔 |
| 重複讀檔 | 重新讀之前讀過的檔案 = 早期 context 被裁剪 |

### 各階段行為調整

| 階段 | 行為 |
|------|------|
| **早期 (< 30%)** | 自由探索、完整讀檔、詳細解釋 |
| **中期 (30-60%)** | 精確定位讀取、合併工具呼叫、精簡回覆 |
| **後期 (60%+)** | 只讀必要內容、引用記憶不重讀、主動存檔 |

---

## v3.0 功能：記憶維護引擎

### 自動壓縮

記憶檔超過 50 行時自動壓縮：保留核心事實，歷史只留最近 3 條，90 天以前的歷史自動刪除。

### 過期機制

| 記憶類型 | 預設有效期 | 原因 |
|---------|-----------|------|
| project | 30 天 | 專案狀態頻繁變動 |
| feedback | 永不過期 | 教訓長期有效 |
| user | 永不過期 | 偏好穩定 |
| reference | 90 天 | 外部資源可能變更 |

過期記憶標記 `[STALE]` 但不自動刪除 — 讓下次 session 決定更新或移除。

### 衝突解決

新資訊與現有記憶矛盾時：
1. **驗證** — 查 git 或檔案確認哪個正確
2. **更新** — 替換過時資訊
3. **標注** — 加一行 `> Updated YYYY-MM-DD: 原因` 說明變更

### 去重合併

發現兩個檔案主題重疊時，合併到更具體的那個，刪除泛用的。

---

## 運作原理

```
                    持續監控 context window
                    ┌──────────────────┐
                    │ < 50%  → 正常    │
                    │ ~ 50%  → 檢查點  │  ← v3.1 新增
                    │ ~ 75%  → 完整存檔│
                    └──────────────────┘

觸發「收工」或達到閾值
    │
    ▼
┌───────────────────────────────────┐
│  1. 偵測平台（19+ agent）          │
│  2. 決定記憶路徑                   │
│  3. 掃描 git + 現有記憶            │
│  4. 分析本次 session 關鍵資訊      │
│  5. 記憶維護（壓縮/過期/去重）     │  ← v3.0
│  6. 寫入/更新記憶檔案              │
│  7. 更新 MEMORY.md 索引           │
│  8. Bootstrap 注入（如需要）       │
│  9. 回報摘要                      │
└───────────────────────────────────┘
    │
    ▼
下次對話自動載入 → 無縫接續
```

### 記憶四大類型

| 類型 | 存什麼 | 範例 |
|------|--------|------|
| **project** | 專案狀態、版本、進度 | 「v2.1 已發布，auth 重構在 feat/auth」 |
| **feedback** | 踩過的坑、教訓 | 「別用 mock DB，上次漏掉 migration bug」 |
| **user** | 使用者偏好、風格 | 「偏好 TDD、精簡回覆」 |
| **reference** | 外部資源、URL | 「API 文件在 internal.company.com/api」 |

### 記憶檔格式（v3）

```markdown
---
name: MyApp 專案狀態
description: v2.1 已發布，auth 重構進行中
type: project
updated: 2026-03-25
expires: 2026-04-24
platform: codex
---

## MyApp v2.1

**Repo**: https://github.com/user/myapp
**Branch**: feat/auth

### 已完成
- API v2 endpoint 全部遷移

### 待做
- session store 選型

## History
> Updated 2026-03-25: 從 v2.0 更新到 v2.1
> Updated 2026-03-20: 新增 auth 重構分支
```

---

## 不會保存什麼

| 不保存 | 原因 |
|--------|------|
| 程式碼片段 | 會過時，存檔案路徑 + 行號 |
| Git 歷史 | `git log` 就有 |
| 任務清單 | 當次 session 專用 |
| 暫存檔路徑 | 短暫存在 |
| 架構/API 簽名 | 讀 code 就有 |
| 密碼/API Key | 安全考量，永不保存 |

---

## Bootstrap 機制

```
your-project/
├── .ai-memory/              ← 通用記憶目錄
│   ├── MEMORY.md            ← 索引（含 [STALE] 標記）
│   ├── project_myapp.md     ← 專案狀態（expires: 30d）
│   ├── feedback_testing.md  ← 教訓（永不過期）
│   └── user_preferences.md  ← 偏好（永不過期）
├── AGENTS.md                ← bootstrap 指令（Codex）
├── GEMINI.md                ← bootstrap 指令（Gemini CLI）
└── src/
```

> 建議：`echo ".ai-memory/" >> .gitignore`

---

## 常見問題 FAQ

**Q: 記憶會越來越多嗎？**
v3 有自動壓縮 + 去重。典型專案 3-5 個檔案，超過 50 行自動壓縮。

**Q: 敏感資訊安全嗎？**
不存 secrets。建議 `.gitignore` 記憶目錄。

**Q: 不用 git 能用嗎？**
能。用目錄結構和修改時間判斷。

**Q: 跟 Claude Code auto memory 差別？**
auto memory 被動。session-wrap 主動掃描 + 結構化寫入 + 維護壓縮。兩者互補。

**Q: 我的 Agent 不在列表上？**
加入系統提示詞即可。記憶寫到 `.ai-memory/`。

**Q: 過期的記憶會被刪掉嗎？**
不會。只標記 `[STALE]`，讓下次 session 決定。

---

## 版本歷史 / Changelog

| 版本 | 日期 | 變更 |
|------|------|------|
| **v3.1** | 2026-03-25 | Context Window 智慧管理（50% 檢查點、75% 完整存檔、行為分階段調整） |
| v3.0 | 2026-03-25 | 記憶維護引擎（壓縮/過期/衝突解決/去重）、一鍵安裝 CLI、install.sh、19+ agent、韓語觸發 |
| v2.1.1 | 2026-03-25 | 新增 OpenClaw 支援 |
| v2.1 | 2026-03-25 | 14+ agent、Bootstrap 機制、中文文件 |
| v2.0 | 2026-03-25 | 通用化（Claude Code + Cursor + Windsurf） |
| v1.0 | 2026-03-25 | 初版，Claude Code 專用 |

## Contributing

```bash
git clone https://github.com/redredchen01/session-wrap-skill.git
cd session-wrap-skill
# 修改 → 測試 → PR
```

歡迎 PR：更多 agent、記憶視覺化、團隊共享記憶、AI 驅動的記憶摘要。

## License

MIT
