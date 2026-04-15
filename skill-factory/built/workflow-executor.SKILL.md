---
name: workflow-executor
description: "Declarative YAML/JSON DAG runner. Execute multi-step workflows with dependency resolution and parallel execution."
triggers:
  - "Run a workflow from YAML"
  - "Execute multi-step automation"
  - "DAG-based task execution"
categories:
  - automation
  - orchestration
  - workflow
dependencies:
  - Node.js 16+
  - workflows/ directory with .yaml or .json definitions
---

# /workflow-executor (P1)

聲明式 YAML 或 JSON DAG 執行器 — 取代硬編碼的 `&&` 鏈接。

## 功能

- **DAG 依賴解析** — 自動拓撲排序步驟
- **並行執行** — 同層無依賴的步驟並行運行
- **靈活失敗模式** — per-step 或 workflow 級別的 `on_failure` 控制
- **回滾支持** — 失敗時執行 `rollback` 命令
- **Dry-run 模式** — 顯示執行計劃不實際執行

## 工作流 YAML/JSON 格式

### YAML 格式

```yaml
name: morning-check
description: "Daily morning automation"
on_failure: abort  # continue | abort | rollback

steps:
  - id: context
    run: node auto-daily-context.mjs --silent
    timeout: 60s

  - id: briefing
    depends_on: [context]
    run: node morning-briefing.mjs

  - id: health
    depends_on: [context]  # Parallel with briefing
    run: node site-health.mjs

  - id: ssl-check
    depends_on: [health]
    run: node ssl-domain-check.mjs
    on_failure: rollback
    rollback: "node notify-failure.mjs ssl-check"
```

### JSON 格式

```json
{
  "name": "morning-check",
  "on_failure": "abort",
  "steps": [
    {
      "id": "context",
      "run": "node auto-daily-context.mjs --silent",
      "timeout": "60s"
    },
    {
      "id": "briefing",
      "depends_on": ["context"],
      "run": "node morning-briefing.mjs"
    }
  ]
}
```

## 使用方式

### 列出所有工作流

```bash
cd /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot
node workflow-executor.mjs --list
```

### 運行工作流

```bash
node workflow-executor.mjs workflows/morning-check.yaml
```

### Dry-run（查看執行計劃）

```bash
node workflow-executor.mjs workflows/morning-check.yaml --dry-run
```

### Verbose 模式

```bash
node workflow-executor.mjs workflows/morning-check.yaml --dry-run --verbose
```

## 執行計劃

```
📊 Execution Plan:
  Generation 0: [context]
  Generation 1: [briefing, ga4-daily, health]
  Generation 2: [ssl-check, content-analytics]
```

說明：
- **Generation 0**：無依賴的步驟，首先運行
- **Generation 1**：依賴 context 的步驟，並行執行（互相無依賴）
- **Generation 2**：依賴上一層的步驟

## 工作流 YAML 結構

### 頂級欄位

| 欄位 | 說明 | 預設值 |
|------|------|--------|
| `name` | 工作流名稱 | 必需 |
| `description` | 工作流描述 | — |
| `on_failure` | 全局失敗模式 | `abort` |
| `steps` | 步驟列表 | 必需 |

### 步驟欄位

| 欄位 | 說明 | 預設值 |
|------|------|--------|
| `id` | 步驟 ID（唯一） | 必需 |
| `run` | 要執行的命令 | 必需 |
| `depends_on` | 依賴的步驟 ID 列表 | `[]` |
| `timeout` | 超時時間（如 `60s`） | — |
| `on_failure` | 此步驟失敗時的行為 | 使用全局設定 |
| `rollback` | 失敗時執行的回滾命令 | — |
| `description` | 步驟描述 | — |

## 失敗模式

### `continue`

即使步驟失敗也繼續執行。

```yaml
on_failure: continue
```

### `abort`

步驟失敗時停止整個工作流。

```yaml
on_failure: abort
```

### `rollback`

步驟失敗時執行回滾命令。

```yaml
- id: deploy
  run: node deploy.mjs
  on_failure: rollback
  rollback: "node rollback.mjs"
```

## 範例工作流

### morning-check.yaml

```bash
cd /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot
node workflow-executor.mjs workflows/morning-check.yaml
```

流程：
1. `context`（生成日常上下文）
2. 並行：`briefing`、`ga4-daily`、`health`（都依賴 context）
3. `ssl-check`（依賴 health）
4. `content-analytics`（依賴 ga4-daily）

## 工作流文件位置

```
/Users/dex/YD 2026/projects/production/claude_code_telegram_bot/workflows/
├── morning-check.yaml
├── ...
```

## 與現有系統的整合

替代：
- `automation-cron.sh` 中的硬編碼 `&&` 鏈
- `team-dispatch.sh` 中的手動並行管理

優點：
- **聲明式**：YAML 比 bash 更易讀
- **可組合**：輕鬆重用步驟和工作流
- **可視化**：Dry-run 顯示執行計劃
- **失敗處理**：per-step 控制

## 故障排除

### 工作流未找到

檢查文件是否存在於 `workflows/` 目錄：

```bash
ls /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot/workflows/
```

### 步驟執行失敗

查看詳細輸出：

```bash
node workflow-executor.mjs workflows/your-workflow.yaml --verbose
```

### 無效的 YAML

確保 YAML 格式正確（正確的縮進、引號）。或改用 JSON 格式。

## 性能

- 解析時間: ~10-50ms
- DAG 構建: ~5ms
- 執行: 取決於步驟內容
- 總開銷: ~100ms

## 相關技能

- /automation-cron — 現有任務分派入口
- /team-dispatch — 多代理並行管理
- /task-perf-tracker — 步驟性能追蹤

---

**狀態**: ✅ Implemented  
**上線日期**: 2026-04-10  
**執行引擎**: Node.js  
**支持格式**: YAML + JSON  
**維護者**: dex
