# YD 2026 Skills Registry

本目錄收錄了所有面向 AI 代理 (Claude/Gemini) 的發布級技能。

## 🛠️ 核心技能列表 (Core Skills)

| 技能名稱 | 位置 | 主要功能 | 狀態 |
|---|---|---|---|
| **Vault Mining Feedback** | `vault-mining-feedback/` | Obsidian 反饋循環：標記 idea 已實現 | 🎉 v1.0.0 Alpha |
| **GSC Activate** | `gsc-activate/` | Google Search Console 數據管道 | 🎉 v1.0.0 Alpha |
| **Linear Slack Reporter** | `linear-slack-reporter/` | 將 Linear API 變更同步至 Slack | 🚀 Production |
| **Code Review Assistant** | `code-review-assistant/` | 自動化代碼審查與反饋 | 🛠️ Development |
| **API Aggregation Notifier** | `api-aggregation-notifier/` | 多 API 數據匯總與通知 | 🚀 Production |
| **Daily Report (Sheets)** | `daily-report-sheets/` | Google Sheets 數據日報生成 | 🚀 Production |

## 📐 開發規範
- **主邏輯文件**：必須在 `package.json` 的 `"main"` 中指定（通常是 `.md`）。
- **共享庫**：腳本邏輯應引入 `../lib/skills-core.sh`。
- **文檔**：必須包含 `README.md` 和 `CHANGELOG.md`。

## 🚀 發布指令
```bash
./scripts/deploy/skill-deploy.sh <skill-name>
```

---
*Auto-indexed on 2026-04-01*
