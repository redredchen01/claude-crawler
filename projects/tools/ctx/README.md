# ctx

**免費用戶的 Context 神器** — 自動追蹤、去重、預算、存檔。裝完就不用管。

The **stateful context OS** for free-tier AI agent users. Zero manual overhead.

[![npm](https://img.shields.io/npm/v/@redredchen01/ctx)](https://www.npmjs.com/package/@redredchen01/ctx)
[![Tests](https://img.shields.io/badge/tests-184%20passing-brightgreen)](.)
[![CI](https://github.com/redredchen01/ctx/actions/workflows/test.yml/badge.svg)](https://github.com/redredchen01/ctx/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 一行安裝，永久受益

```bash
npx @redredchen01/ctx setup
```

一行搞定：裝 skill + 初始化 .ctx/ + 安裝自動追蹤 hook。裝完就不用管了。

---

## 它解決什麼問題？

```
❌ AI 突然忘了前面在幹嘛          → ✅ 自動存檔，換對話無痛續上
❌ 不知道 context 還剩多少        → ✅ 即時狀態面板
❌ AI 瘋狂重複讀同一個檔案        → ✅ 自動攔截重複讀取
❌ AI 回覆太長浪費 token          → ✅ 按閾值自動縮減回覆
❌ Context 爆了進度全丟           → ✅ 到 60% 自動 checkpoint
```

## 架構：帶狀態落盤的執行習慣層

**v2.1 不是提示詞規則，是真的執行層。** Hook 在每次 tool call 後自動更新狀態：

```
你的項目/
├── .ctx/
│   ├── state.json          ← 機器讀寫（每次操作自動更新）
│   ├── status.md           ← 人類面板（每 5 次操作刷新）
│   └── checkpoints/        ← 自動 + 手動存檔
│       ├── ctx-checkpoint-20260327-140000.md
│       └── ctx-emergency-20260327-150000.md
├── src/
└── ...
```

### state.json 記了什麼

```json
{
  "maxTokens": 200000,
  "usedTokens": 85000,
  "filesRead": [
    {"path": "src/auth.js", "lines": 150, "readCount": 2},
    {"path": "src/index.js", "lines": 50, "readCount": 1}
  ],
  "dupCount": 1,
  "toolCallCount": 12,
  "writeCount": 3,
  "_lastThreshold": "yellow",
  "_lastPercentage": 42
}
```

### 狀態面板

終端輸入 `python3 scripts/ctx_status.py`：

```
  🟡 ctx — Context Window Status
  ────────────────────────────────────────

  Usage:  ████████████░░░░░░░░░░░░░░░░░░ 42%
          85K / 200K tokens

  Threshold:    yellow 🟡
  Files read:   2
  Duplicates:   1
  Tool calls:   12

  ────────────────────────────────────────
  File                                 Lines  Reads
  src/auth.js                            150     2x
  src/index.js                            50     1x
```

---

## 運作方式

### 1. Hook 自動追蹤（零開銷）

安裝 hook 後，每次 AI 用工具都會自動更新 `state.json`：

| 操作 | 自動記錄 |
|------|---------|
| 讀文件 | `filesRead[]` + 重複偵測 |
| 寫文件 | `writeCount` |
| 跑命令 | `bashCount` |
| 每次呼叫 | `toolCallCount` + token 估算 |
| 每 5 次 | 刷新 `status.md` |

**AI 不需要手動管狀態。Hook 全自動。**

### 2. AI 讀狀態、按閾值行動

| Context 用量 | 狀態 | AI 行為 |
|-------------|------|--------|
| < 40% | 🟢 green | 正常工作 |
| 40-60% | 🟡 yellow | 精簡回覆 ~300 字，用 offset+limit 讀檔 |
| 60-80% | 🟠 orange | 回覆 ~150 字，**自動寫 checkpoint** |
| > 80% | 🔴 red | 回覆 ~50 字，**緊急存檔 + 建議開新對話** |

### 3. 自動去重

AI 讀檔前先查 `state.json`：
- 已讀過？→ 跳過，用記憶中的資訊
- 沒讀過？→ 正常讀，hook 會記錄

**等效把 200K 擴大到 ~260K。**

### 4. 跨 Session 續接

下次開對話，AI 讀到 `.ctx/checkpoints/` → 自動顯示：

```
📋 Resuming from checkpoint (~65%). Last: Auth module refactor, JWT done.
```

---

## 安裝

### 方法一：npx（推薦）

```bash
npx @redredchen01/ctx install    # 安裝 skill 到你的 agent
npx @redredchen01/ctx init       # 在項目目錄初始化 .ctx/
npx @redredchen01/ctx hook       # 安裝自動追蹤 hook
```

### 方法二：curl（不需要 Node）

```bash
curl -fsSL https://raw.githubusercontent.com/redredchen01/ctx/main/install.sh | bash
```

### 方法三：手動

```bash
git clone https://github.com/redredchen01/ctx.git
cp ctx/SKILL.md ~/.openclaw/skills/ctx/SKILL.md   # OpenClaw
cp ctx/SKILL.md ~/.claude/skills/ctx/SKILL.md      # Claude Code
```

---

## 支援平台

| Agent | Context | 狀態 |
|-------|---------|------|
| **OpenClaw** | 200K | ✅ 主要支援 |
| **Claude Code** | 200K | ✅ Hook 支援 |
| **Cline** | 200K | ✅ |
| **Kilo Code** | 200K | ✅ |
| **Roo Code** | 200K | ✅ |
| **Cursor** | 128K | ✅ |

---

## 為什麼免費用戶需要 ctx？

| | 沒有 ctx | 有 ctx |
|---|---|---|
| 可用 context | 200K（浪費 30%+） | **等效 ~260K** |
| 知道剩多少 | ❌ | ✅ 即時面板 |
| 重複讀檔 | 浪費 token | ✅ 自動攔截 |
| 回覆太長 | 不知道要省 | ✅ 按閾值自動縮 |
| Context 爆了 | 進度全丟 | ✅ 自動存檔 |
| 換對話 | 從頭來 | ✅ 無痛續接 |
| **開銷** | — | **~500 tokens (0.25%)** |

---

## CLI 命令

```bash
npx @redredchen01/ctx install [--full]   # 安裝 skill
npx @redredchen01/ctx init               # 初始化 .ctx/
npx @redredchen01/ctx hook               # 安裝 hook
npx @redredchen01/ctx status             # 查看狀態
npx @redredchen01/ctx uninstall          # 移除（保留 .ctx/）
```

## Python 腳本

```bash
python3 scripts/ctx_status.py            # 視覺化狀態面板
python3 scripts/ctx_checkpoint.py "msg"  # 手動存檔
```

---

## 搭配 session-wrap

ctx 管**過程中**，[session-wrap](https://github.com/redredchen01/session-wrap-skill) 管**收工時**。

```bash
npx @redredchen01/ctx install && npx @redredchen01/ctx init && npx @redredchen01/ctx hook
npx session-wrap-skill install
```

---

## 開發

```bash
git clone https://github.com/redredchen01/ctx.git
cd ctx && npm install
npm test              # 171 tests
npm test -- --watch   # TDD mode
```

## License

MIT — 免費用，免費改，免費分享。
