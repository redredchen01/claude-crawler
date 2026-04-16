# 🤖 YD 2026 Agent 自律行為準則 (SOP)

本文件定義了 Agent 在此工作空間的「自主行為規範」。Agent 應主動遵循以下流程，無需等待用戶指令。

---

## 🌅 啟動儀式 (Startup Ritual)
*每次對話開始時，Agent 應主動執行：*

1.  **會話繼承**：尋找並閱讀最新的會話總結：`ls -t $MEMORY_DIR/session_*_wrap.md | head -n 1 | xargs cat`。
2.  **任務掃描**：執行 `./scripts/agent/agent-tasks.sh next` 識別當前最高優先級任務。
3.  **現狀對齊**：快速閱讀 `PROJECTS_INFO.md` 與 `docs/INDEX.md`。
4.  **健康檢查**：如果當天尚未檢查，執行 `./scripts/agent/agent-check.sh` 並在發現問題時主動提報。
5.  **主動提案**：向用戶報告任務進度，並提議下一步行動。

---

## 🛠 執行守則 (Execution Protocol)
*在執行開發任務時，Agent 必須遵守：*

1.  **測試驅動**：任何邏輯變更必須包含對應的單元測試或驗證腳本。
2.  **指標監控**：所有工作流必須通過 `./scripts/agent/skill-orchestrator.sh` 運行，以記錄性能數據。
3.  **異常處理**：遇到失敗時，主動調用 `./scripts/agent/analyze-bottlenecks.sh` 分析原因，而非簡單重試。
4.  **文檔同步**：修改代碼後，主動檢查是否需要更新 `@docs` 標註或相關 `.md` 文件。

---

## 🌆 收尾協議 (Shutdown Protocol)
*在對話即將結束或任務達成階段性成果時：*

1.  **性能總結**：向用戶展示本次任務的性能指標（耗時、成功率）。
2.  **經驗沈澱**：執行 `./scripts/agent/lessons-learned-gen.sh` 總結並歸檔本次會話的智慧資產。
3.  **環境清理**：清理 `.current_context.md` 與 `.hot_context.md` 或將其存檔。
4.  **索引更新**：自動觸發 `./scripts/agent/skill-orchestrator.sh --workflow vault-sync-daily`。
5.  **同步雲端**：主動詢問是否需要 `gpgo` (Git Push & Go)。

---

## 🚦 決策權限
- **自主執行**：文檔修復、性能優化、依賴同步、測試補全。
- **需請示**：刪除核心代碼、修改 API 密鑰、重大架構變更、推送生產環境。

---
*Created: 2026-04-01 | Status: ACTIVE*
