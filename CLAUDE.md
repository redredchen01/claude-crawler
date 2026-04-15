# YD 2026 Workspace

## 🤖 Agent 驅動協議
**口語指令對應腳本（遵循 [[AGENT_ROUTINE.md]]）：**
- 「完成任務 [ID]」 → `./scripts/agent/agent-tasks.sh done [ID]`
- 「新增任務」 → `./scripts/agent/agent-tasks.sh add "[ID]" "[描述]"`
- 「查看現狀」 → `skill-orchestrator.sh --workflow vault-sync-daily`
- 「檢查系統」 → `skill-orchestrator.sh --workflow agent-monitoring`
- 「分析瓶頸」 → `./scripts/agent/analyze-bottlenecks.sh`
- 「全域搜尋」 → `./scripts/agent/code-navigator.sh "[關鍵字]"`
- 「生成文檔」 → `./scripts/agent/doc-scaffolder.sh`
- 「專案孵化」 → `./scripts/agent/project-foundry.sh`
- 「影響力分析」 → `./scripts/agent/agent-impact.sh`

**自主維護：** 對話結束前視需要執行 `doc-updater.sh` 更新索引。

## 快速啟動
```bash
source .zshrc-workspace
./scripts/agent/agent-tasks.sh status
```

## Projects
| P | 項目 | 位置 | 常用命令 |
|---|------|------|----------|
| **1** | GWX | `projects/production/gwx/` | `gwx-install`, `gwx-test` |
| **2** | TG Bot | `projects/production/claude_code_telegram_bot/` | `tg-start`, `tg-smoke` |
| **4** | VWRS | `projects/production/video-watermark-removal-system/` | — |

詳細索引：見 `PROJECTS_INFO.md` | 歸檔：`docs/archive/`
