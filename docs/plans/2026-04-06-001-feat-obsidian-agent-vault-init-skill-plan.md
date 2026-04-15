---
title: "feat: /vault-init — Obsidian Agent Knowledge Vault Initialization Skill"
type: feat
status: completed
date: 2026-04-06
---

# feat: /vault-init — Obsidian Agent Knowledge Vault Initialization Skill

## Overview

新增 `/vault-init` skill，讓 Claude Code 能夠一鍵初始化一個「Obsidian Agent Knowledge Vault」——一個專為 AI 代理 + 自動化工作流 + 人工協作設計的混合架構知識庫。

Skill 輸出：完整目錄樹 + 7 種模板 + 3 份系統文件 + `.obsidian/` 配置 + clausidian 初始化。

## Problem Frame

現有 obsidian vault（`/obsidian`）是有機生長的，結構是無編號 PARA（`projects/`, `areas/`, etc.）。當用戶要為新的工作場景（新項目組、新客戶、新知識域）開一個全新的知識庫時，沒有自動化手段——需要手動複製目錄、改配置、寫模板。

這個 skill 解決「零到可用 vault」的問題，讓新 vault 天生支持：
- Agent 可寫（標準 YAML schema + agent 寫入協議文件）
- 自動化可調度（clausidian init + .obsidian 配置好）
- 人工可讀（PARA 組織 + Zettelkasten 雙鏈設計）

## Requirements Trace

- R1. 接受 `--name` 和 `--path` 參數，支持默認值
- R2. 創建完整的編號 PARA 目錄樹（00-04 + 90 + 99）
- R3. 寫入 7 種標準模板到 `90 Templates/`（6 類型 + 1 Daily Note）
- R4. 寫入 3 份系統文件到 `99 System/`（命名規則、YAML schema、agent 寫入協議）
- R5. 創建 `.obsidian/` 配置（daily notes 指向 `00 Inbox/`，templates 指向 `90 Templates/`）
- R6. 若 `clausidian` 可用，執行 `clausidian init` 並建立初始索引
- R7. 輸出一份初始化摘要（目錄列表 + 模板清單 + 下一步行動）

## Scope Boundaries

- 不修改現有 vault（`/obsidian`）
- 不安裝 Obsidian 插件（只寫 core plugin 配置 JSON）
- 不創建 Johnny.Decimal 編號（用戶可選，不在初始化範疇）
- 不創建示例筆記內容（只創建模板和系統文件）
- Skill 文件本身是 Markdown，不是 shell 腳本

## Context & Research

### 現有模板格式（`obsidian/templates/`）

```yaml
---
title: "{{TITLE}}"
type: project | area | resource | journal | idea
tags: []
created: "{{DATE}}"
updated: "{{DATE}}"
status: active | draft | archived
summary: ""
related: []
# 可選
goal: ""        # project 類型
deadline: ""    # project 類型
source: ""      # resource 類型
---
```

所有模板使用 `{{PLACEHOLDER}}` 語法，尾部附有 AGENT 說明注釋。

### Skill 文件格式（`~/.claude/commands/`）

```
---
description: 一行描述
allowed-tools: Bash, Read, Write, Glob
argument-hint: "[--name VAULT_NAME] [--path PATH]"
---

# /vault-init — 標題

## Trigger
- 何時執行

## Steps
1. ...（含 bash 代碼塊）

## Output
預期輸出格式
```

### Clausidian CLI 關鍵命令

- `clausidian init [--vault PATH]` — 初始化新 vault（建立 `.clausidian/` cache）
- `clausidian sync` — 重建索引（`_tags.md`, `_graph.md`, `_index.md`）
- `clausidian health` — vault 健康檢查
- 環境變量：`OA_VAULT=<path>`

### 參考路徑

- 現有 vault：`/Users/dex/YD 2026/obsidian/`
- Skill 目錄：`/Users/dex/.claude/commands/`
- 現有模板目錄：`/Users/dex/YD 2026/obsidian/templates/`（14 個模板）
- 相近 skill：`/Users/dex/.claude/commands/vault-search-cli.md`（vault 操作參考）

### Institutional Learnings

- 模板的 `{{PLACEHOLDER}}` 替換規則：agent 填入時不留佔位符
- `_index.md`, `_tags.md`, `_graph.md` 由 `clausidian sync` 維護，不手寫
- Skills 用 `allowed-tools: Bash` 處理所有文件系統操作

## Key Technical Decisions

- **編號目錄 vs 無編號**：用戶明確要求帶編號（00-99），便於 Finder/文件管理器按序顯示。保留。
- **6 種類型 vs 現有 5 種**：用戶新增 `meeting` 和 `sop` 類型（替換現有 `idea`），因為這個 vault 設計目標是「AI 代理工作中樞」而非個人 PKM——meeting 紀要和 SOP 是高頻場景。
- **Daily Note 指向 `00 Inbox/`**：Inbox 比 journal 更符合 GTD 入口語義，且保留「分流」的顯式設計意圖。
- **Clausidian init 為 optional**：若 `clausidian` 不在 PATH，跳過並提示；vault 功能不依賴。
- **Skill 在本地執行 Write 操作**：不使用 `bash heredoc`，改用 Write tool 寫每個文件，配合 allowed-tools: Write。
- **`area` vs `project` 的 YAML 字段差異**：project 帶 `goal + deadline`，area 帶 `scope`（負責邊界），meeting 帶 `attendees + action-items`，sop 帶 `steps + owner`。

## Open Questions

### Resolved During Planning

- **Q: 是否需要 `.gitignore`?** — 是，包含 `.DS_Store`, `.clausidian/cache/`, `*.tmp`
- **Q: Daily Note 模板語言？** — 中文（對齊用戶現有 vault 風格）
- **Q: 是否需要 `00 Inbox/_index.md`?** — 不需要，`clausidian init` 後 `sync` 會自動建立各目錄的 `_index.md`
- **Q: `.obsidian/` core-plugins 哪些要啟用？** — 只需 `daily-notes` 和 `templates`（最小配置，不假設用戶 plugin 偏好）

### Deferred to Implementation

- `.obsidian/app.json` 的精確 JSON schema — 運行時確認最小可用字段
- `clausidian init` 的完整參數格式 — 執行時確認（`--vault` 或 positional arg）

## High-Level Technical Design

> *這是方向性設計，用於審閱，不是實現規格。實現時請以此為背景，不要照搬。*

```
/vault-init --name "MyVault" --path ~/Vaults/MyVault
    │
    ├─ STEP 1: Parse args (--name, --path, defaults)
    │
    ├─ STEP 2: mkdir PARA tree
    │    00 Inbox/
    │    01 Projects/
    │    02 Areas/
    │    03 Resources/
    │    04 Archives/
    │       ├─ projects/
    │       ├─ areas/
    │       └─ resources/
    │    90 Templates/
    │    99 System/
    │    .obsidian/
    │
    ├─ STEP 3: Write 90 Templates/ (7 files)
    │    ├─ project.md
    │    ├─ area.md
    │    ├─ note.md
    │    ├─ resource.md
    │    ├─ meeting.md
    │    ├─ sop.md
    │    └─ daily-note.md
    │
    ├─ STEP 4: Write 99 System/ (3 files + 1 README)
    │    ├─ naming-conventions.md
    │    ├─ yaml-schema.md
    │    ├─ agent-write-protocol.md
    │    └─ README.md (vault intro)
    │
    ├─ STEP 5: Write .obsidian/ config (3 JSON files)
    │    ├─ daily-notes.json  → folder: "00 Inbox", template: "90 Templates/daily-note"
    │    ├─ templates.json    → folder: "90 Templates"
    │    └─ core-plugins.json → ["daily-notes", "templates"]
    │
    ├─ STEP 6: Create .gitignore
    │
    ├─ STEP 7: clausidian init (if available)
    │    └─ OA_VAULT=<path> clausidian init
    │       └─ on fail: warn, continue
    │
    └─ STEP 8: Print summary
         ├─ Vault path
         ├─ Directory tree (7 dirs)
         ├─ Templates created (7)
         ├─ System docs (4)
         └─ Next steps: open Obsidian, run clausidian health
```

## Implementation Units

- [ ] **Unit 1: Skill 文件骨架與參數解析**

**Goal:** 創建 `/Users/dex/.claude/commands/vault-init.md`，定義 frontmatter、trigger、參數解析邏輯。

**Requirements:** R1

**Dependencies:** 無

**Files:**
- Create: `/Users/dex/.claude/commands/vault-init.md`

**Approach:**
- Frontmatter: `description`, `allowed-tools: Bash, Write, Read`, `argument-hint: "[--name NAME] [--path PATH]"`
- 參數解析：bash 解析 `$@`，提取 `--name` 和 `--path`；默認值為 `AgentVault` 和 `~/Vaults/AgentVault`
- 如果目標路徑已存在且不為空，提示錯誤並退出（防止覆蓋）

**Patterns to follow:**
- `/Users/dex/.claude/commands/vault-search-cli.md` — 參數解析方式
- `/Users/dex/.claude/commands/obsidian-daily-snapshot.md` — Steps 結構

**Test scenarios:**
- Happy path: `--name TestVault --path /tmp/testvault` 創建新空目錄並初始化
- Edge case: 目標路徑已存在且有文件 → 輸出錯誤訊息，不覆蓋
- Edge case: 只傳 `--name` 不傳 `--path` → 使用默認路徑 `~/Vaults/<name>`
- Edge case: 不傳任何參數 → 使用完整默認值創建

**Verification:**
- Skill 文件可被 Claude Code 識別（frontmatter 有效）
- `/vault-init --help` 或無參數時顯示 usage

---

- [ ] **Unit 2: 目錄結構創建邏輯**

**Goal:** 在 Steps 中寫入 `mkdir -p` 邏輯，創建完整 PARA 目錄樹（帶編號）。

**Requirements:** R2

**Dependencies:** Unit 1

**Files:**
- Modify: `/Users/dex/.claude/commands/vault-init.md`（Step 2 代碼塊）

**Approach:**
- 創建目錄：`00 Inbox`, `01 Projects`, `02 Areas`, `03 Resources`, `04 Archives/projects`, `04 Archives/areas`, `04 Archives/resources`, `90 Templates`, `99 System`, `.obsidian`
- 目錄名含空格，bash 需加引號
- 各 PARA 目錄下創建 `.gitkeep` 防止空目錄被 git 忽略

**Test scenarios:**
- Happy path: 7 個頂層目錄 + 3 個 Archives 子目錄全部創建成功
- Edge case: `00 Inbox`（帶空格）路徑被正確處理，不分裂為兩個目錄

**Verification:**
- `ls -la <vault_path>` 顯示 7 個頂層目錄
- `find <vault_path> -type d` 顯示完整樹狀結構

---

- [ ] **Unit 3: 模板庫內容（7 個模板）**

**Goal:** 定義 7 個模板文件的完整內容，在 Steps 中用 Write tool 或 `cat >` 寫入 `90 Templates/`。

**Requirements:** R3

**Dependencies:** Unit 2

**Files:**
- Modify: `/Users/dex/.claude/commands/vault-init.md`（Step 3 代碼塊）

**Approach:**

每個模板包含：
1. YAML frontmatter（帶所有標準字段）
2. Markdown 正文（針對類型的結構化章節）
3. `<!-- AGENT 說明 -->` 注釋（告知 agent 如何填充）

**7 個模板字段設計**：

| 模板 | 特有 YAML 字段 | 核心章節 |
|------|--------------|---------|
| `project.md` | `goal, deadline, area, project` | 目標、進展表格、待辦、筆記 |
| `area.md` | `scope, owner` | 範圍定義、當前關注、最近進展、資源 |
| `note.md` | `source` | 觀察/洞察、延伸連接、標籤 |
| `resource.md` | `source, version` | 摘要、使用方法、注意事項 |
| `meeting.md` | `attendees, date, action-items` | 出席者、討論摘要、行動項 |
| `sop.md` | `owner, steps, version` | 適用場景、步驟列表、驗證清單 |
| `daily-note.md` | — (title 用日期) | 今日記錄、待辦、想法、明日計劃 |

所有模板共用字段：`type, status, tags, created, updated, summary, related`

**Patterns to follow:**
- `/Users/dex/YD 2026/obsidian/templates/project.md` — YAML 格式
- `/Users/dex/YD 2026/obsidian/templates/journal.md` — Agent 注釋格式

**Test scenarios:**
- Happy path: 7 個 `.md` 文件存在於 `90 Templates/`
- Happy path: 每個模板 frontmatter 包含 `type`, `status`, `created`, `updated`, `summary`, `related`
- Edge case: `meeting.md` 的 `attendees` 字段為 list 格式（YAML array）
- Edge case: `sop.md` 的 `steps` 為 markdown 有序列表，agent 可清晰識別

**Verification:**
- 所有 7 個模板可被 Obsidian Template 插件識別（無語法錯誤）
- `clausidian health` 在 vault init 後不報 frontmatter 錯誤

---

- [ ] **Unit 4: 系統文件內容（3 份文件 + README）**

**Goal:** 定義 `99 System/` 下 4 個文件的完整內容：命名規則、YAML schema、agent 寫入協議、vault README。

**Requirements:** R4

**Dependencies:** Unit 2

**Files:**
- Modify: `/Users/dex/.claude/commands/vault-init.md`（Step 4 代碼塊）

**Approach:**

**`naming-conventions.md`** 涵蓋：
- 文件名：`lowercase-with-hyphens.md`
- 日記：`YYYY-MM-DD.md`（存在 `00 Inbox/`）
- 週回顧：`YYYY-WNN-review.md`
- SOP：`sop-<domain>-<action>.md`（如 `sop-deployment-rollback.md`）
- 項目：`proj-<name>.md`
- 禁止：空格、中文、大寫（Obsidian 跨平台兼容）

**`yaml-schema.md`** 涵蓋：
- 完整 YAML schema（含所有字段 + 類型 + 允許值）
- 必填字段標記（`type`, `status`, `created`, `updated`, `summary`）
- `type` 枚舉：`project | area | note | resource | meeting | sop`
- `status` 枚舉：`active | draft | archived`
- `source` 枚舉：`manual | ai | web | meeting | import`
- 字段驗證規則（date 格式 `YYYY-MM-DD`）

**`agent-write-protocol.md`** 涵蓋（Agent 寫入規範）：
- 5 條強制規則（完整 frontmatter、替換所有 `{{}}` 占位符、更新 `updated` 字段、維護 `related` 雙鏈、寫後運行 `clausidian sync`）
- 4 個決策矩陣（什麼內容放哪個目錄）
- 歸檔觸發條件（project 完成 / area 停用 3+ 個月）
- 禁止直接編輯 `_index.md`, `_tags.md`, `_graph.md`
- Zettelkasten 原則：每張 note 只講一件事，積極建立 `related` 連接

**`README.md`** 涵蓋：
- Vault 名稱 + 創建日期
- 架構一句話說明（PARA + ZK + Properties/Bases）
- 快速啟動（`clausidian daily`、打開 Obsidian）
- 指向 `99 System/` 的各文件

**Test scenarios:**
- Happy path: 4 個文件存在於 `99 System/`
- Happy path: `agent-write-protocol.md` 包含"禁止編輯 `_index.md`"的明確條文
- Happy path: `yaml-schema.md` 包含所有 6 種 type 的枚舉值

**Verification:**
- Agent 能通過閱讀 `99 System/agent-write-protocol.md` 知道如何寫入新筆記，無需查閱其他文件

---

- [ ] **Unit 5: `.obsidian/` 配置 + `.gitignore`**

**Goal:** 寫入 `.obsidian/` 下 3 個 JSON 配置文件，確保 Obsidian 打開時 Daily Notes 和 Templates 插件自動指向正確目錄。

**Requirements:** R5

**Dependencies:** Unit 2

**Files:**
- Modify: `/Users/dex/.claude/commands/vault-init.md`（Step 5-6 代碼塊）

**Approach:**

**`.obsidian/daily-notes.json`**:
```json
{
  "folder": "00 Inbox",
  "format": "YYYY-MM-DD",
  "template": "90 Templates/daily-note"
}
```

**`.obsidian/templates.json`**:
```json
{
  "folder": "90 Templates"
}
```

**`.obsidian/core-plugins.json`**（最小集合，僅啟用必要插件）:
```json
["daily-notes", "templates"]
```

**`.gitignore`**:
```
.DS_Store
.clausidian/cache/
*.tmp
.obsidian/workspace.json
.obsidian/workspace-mobile.json
```

> 注意：`.obsidian/` 本身要加入 git（保留 plugin 配置），只排除 workspace 狀態文件。

**Test scenarios:**
- Happy path: Obsidian 打開 vault 後 Daily Notes 插件的 folder 設置為 `00 Inbox`
- Happy path: 新建 Daily Note 時使用 `90 Templates/daily-note.md`
- Edge case: `.obsidian/workspace.json` 被 `.gitignore` 排除（不追蹤 UI 狀態）

**Verification:**
- 用 Obsidian 打開新 vault，側邊欄 daily-notes 可直接使用，無需手動配置

---

- [ ] **Unit 6: Clausidian Init + 摘要輸出**

**Goal:** 在 Steps 末段嘗試執行 `clausidian init`，並輸出格式化的初始化摘要。

**Requirements:** R6, R7

**Dependencies:** Unit 2, Unit 3, Unit 4, Unit 5

**Files:**
- Modify: `/Users/dex/.claude/commands/vault-init.md`（Step 7-8 代碼塊）

**Approach:**

Clausidian init 邏輯：
```bash
if command -v clausidian &>/dev/null; then
    OA_VAULT="<path>" clausidian init
    OA_VAULT="<path>" clausidian sync
    echo "✓ clausidian initialized"
else
    echo "⚠ clausidian not found — skipping index init"
    echo "  Install: npm install -g clausidian (or check ~/.local/bin)"
fi
```

摘要輸出格式：
```
╔══════════════════════════════════════╗
║  Obsidian Agent Vault Initialized    ║
╚══════════════════════════════════════╝

📁 Vault: MyVault
📍 Path:  ~/Vaults/MyVault

Directories (7):
  00 Inbox/          ← Daily notes + GTD inbox
  01 Projects/       ← Active projects with goals
  02 Areas/          ← Long-term sustained work
  03 Resources/      ← Reusable SOPs, docs, refs
  04 Archives/       ← Completed/retired content
  90 Templates/      ← Note templates (7 files)
  99 System/         ← Conventions + protocols (4 files)

Templates (7):
  project.md | area.md | note.md | resource.md
  meeting.md | sop.md | daily-note.md

System Docs (4):
  README.md | naming-conventions.md
  yaml-schema.md | agent-write-protocol.md

Next Steps:
  1. open -a Obsidian <path>   (macOS)
  2. clausidian health          (verify vault)
  3. Read 99 System/agent-write-protocol.md
```

**Test scenarios:**
- Happy path: clausidian 可用 → `clausidian init` 成功，`.clausidian/` 目錄存在
- Error path: clausidian 不可用 → 警告訊息，繼續輸出摘要，不中斷
- Happy path: 摘要輸出包含正確的 vault 路徑和文件清單

**Verification:**
- 執行完 skill 後，`clausidian health` 在 vault 路徑下無報錯
- 摘要輸出包含 Next Steps，讓用戶知道如何繼續

## System-Wide Impact

- **Interaction graph:** Skill 執行後可被 `/vault-search-cli`、`/vault-watch`、`/obsidian-daily-snapshot` 直接使用（只需設置 `OA_VAULT` 環境變量）
- **Error propagation:** 文件寫入失敗（磁盤滿/權限問題）時，bash `set -e` 確保提前退出並報告哪個步驟失敗
- **State lifecycle risks:** 若 skill 中途中斷，vault 可能部分初始化——摘要中注明用戶可重新執行（幂等：只覆蓋，不重複創建）
- **API surface parity:** 新 vault 結構與現有 vault 不同（有編號），現有 vault-* skills 用 `OA_VAULT` 指向哪個就操作哪個，互不影響
- **Integration coverage:** `clausidian health` 是端到端驗證——確保初始化後 vault 無破損鏈接

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 目錄名含空格（`00 Inbox`）在 bash 路徑拼接時出錯 | Steps 中所有路徑操作使用 `"$VAULT_PATH/00 Inbox"` 引號包裹 |
| clausidian init 失敗（版本不兼容） | Step 7 用 `if command -v clausidian`，失敗 warn 不 error |
| Obsidian 打開時 core-plugins.json 格式不正確導致插件失效 | 寫入前驗證 JSON 格式（`echo '...' \| python3 -m json.tool`） |
| 用戶在現有非空目錄運行 → 覆蓋文件 | Unit 1 加防護：路徑存在且非空時 exit 1 |

## Documentation / Operational Notes

- 完成後在 `skill-factory/queue.md` 將此 skill 加入「Built This Week」列表
- Skill 名 `/vault-init` 應加入 CLAUDE.md 的 Frequently Used Skills（可選）
- 若用戶後續要支持 Johnny.Decimal 編號，只需在 Unit 2 擴展目錄創建邏輯

## Sources & References

- 現有模板參考：`/Users/dex/YD 2026/obsidian/templates/project.md`
- 現有 vault CLAUDE.md：`/Users/dex/YD 2026/obsidian/CLAUDE.md`
- Skill 參考：`/Users/dex/.claude/commands/vault-search-cli.md`
- Clausidian CLI：`/Users/dex/.local/bin/clausidian`（43 個命令）
