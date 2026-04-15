---
name: infra-monitor-realtime
description: "Real-time infrastructure monitoring with Slack alerts. Polls 7 resource categories and sends L1/L2/L3 alerts."
triggers:
  - "Monitor infrastructure in real-time"
  - "Check all services status"
  - "Real-time health alerts"
categories:
  - monitoring
  - automation
  - infrastructure
dependencies:
  - Node.js 16+
  - slack_bot_token (hooks-config.json)
  - Slack channels configuration
  - launchd (macOS)
---

# /infra-monitor-realtime (P1)

即時基礎設施監控 — 7 類資源檢查 + Slack 多層告警。

## 功能

- **HTTP 可用性** — xhssex.com + 51acgs.com（3 次失敗 → L1 critical）
- **Backend 健康** — Session Wrap `/health` 端點（3 次失敗 → L1 critical）
- **TG Bot 進程** — `pgrep -f tg-bot.mjs`（未找到 → L1 critical）
- **SSL 證書** — 到期日期檢查（<7d → L1，<30d → L2）
- **LaunchD 代理** — 所有 `com.dex.*` 的退出碼（非零 → L2）
- **LaunchD 數量** — 確保 ≥20 個代理（<20 → L2）
- **daily-context.json** — 新鮮度檢查（10am 後 >24h 未更新 → L2）

## 使用方式

### 手動測試

```bash
cd /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot
node infra-monitor-realtime.mjs --dry-run --once
```

**輸出**: 列出所有 7 類檢查結果，不發送 Slack。

### 單次運行

```bash
node infra-monitor-realtime.mjs --once
```

**輸出**: 檢查結果 + Slack 告警（若有）。

### 啟用定時執行

```bash
launchctl load ~/Library/LaunchAgents/com.dex.infra-monitor.plist
```

**頻率**: 每 5 分鐘檢查一次。

## 告警層級

| 層級 | Slack 頻道 | 顏色 | 何時觸發 |
|------|-----------|------|----------|
| L1 Critical | #urgent-alerts | 🔴 紅 | 網站宕機、Bot 程序死亡、Backend 不可達 |
| L2 Warning | #alerts | 🟡 黃 | SSL 將到期、LaunchD 代理停止、文件陳舊 |
| L3 Info | #logs | 🟢 綠 | 日常狀態報告、檢查通過 |

## 配置 (hooks-config.json)

需要添加以下 Slack 配置：

```json
{
  "slack_bot_token": "xoxb-your-bot-token",
  "slack_urgent_channel": "#urgent-alerts",
  "slack_alerts_channel": "#alerts",
  "slack_logs_channel": "#logs"
}
```

### 獲取 Slack Bot Token

1. 前往 [Slack App 管理頁面](https://api.slack.com/apps)
2. 創建或選擇應用
3. 在「OAuth & Permissions」中生成 Bot Token
4. 複製 `xoxb-...` token
5. 確保機器人有 `chat:write` 權限

## 狀態管理

狀態文件: `infra-monitor-state.json`

記錄：
- 各資源上次檢查狀態
- 故障計數（用於 3 次失敗 → L1 邏輯）
- 上次告警時間戳（防止過度告警，1 小時冷卻）

## LaunchD 安裝

plist 位置: `/Users/dex/YD 2026/projects/production/claude_code_telegram_bot/launchd/com.dex.infra-monitor.plist`

載入：
```bash
launchctl load ~/Library/LaunchAgents/com.dex.infra-monitor.plist
```

卸載：
```bash
launchctl unload ~/Library/LaunchAgents/com.dex.infra-monitor.plist
```

查看日誌：
```bash
tail -f /Users/dex/YD\ 2026/projects/production/claude_code_telegram_bot/logs/infra-monitor-launchd.log
```

## 故障排除

### Slack 告警未發送

1. 檢查 hooks-config.json 中的 `slack_bot_token`
2. 驗證 token 是否有效：
   ```bash
   curl -H "Authorization: Bearer xoxb-..." https://slack.com/api/auth.test
   ```
3. 確保機器人加入了 #urgent-alerts 等頻道

### LaunchD 未按預期執行

1. 驗證是否已載入：
   ```bash
   launchctl list | grep infra-monitor
   ```
2. 查看日誌：
   ```bash
   tail -f ~/Library/Logs/infra-monitor-launchd.log
   ```
3. 檢查 node 路徑是否正確

## 性能

- 檢查時間: ~5-10 秒（取決於網路狀況）
- Slack 推送: <1 秒
- 總執行時間: ~6-11 秒

## 相關技能

- /infra-status — 靜態基礎設施狀態快照
- /linear-tg-bug-reporter — Bug 追蹤
- /vault-note-tracker — 想法生命週期

## 依賴項

- `/config.mjs` — SITES, THRESHOLDS, loadState/saveState
- `/slack-utils.mjs` — Slack 告警發送
- `/tg-utils.mjs` — Telegram 備用通知（未來擴展）

---

**狀態**: ✅ Implemented  
**上線日期**: 2026-04-10  
**檢查頻率**: 每 5 分鐘  
**告警冷卻**: 1 小時  
**維護者**: dex
