# Production Setup Guide

這份文檔面向當前 YD 2026 工作區，描述 session-wrap backend 的正確入口位置。

## Current Location

不要再把下面這種寫法當成當前工作區入口：

```bash
cd session-wrap-backend
```

當前應使用：

```bash
cd ~/YD\ 2026/projects/tools/session-wrap-backend
```

## Recommended Flow

1. 進入 backend 專案目錄
2. 依該子項目的 README 執行安裝與部署
3. 設定 `SESSION_WRAP_API_URL`
4. 用 `wrap login` / `wrap status` 驗證雲同步

## Railway

```bash
cd ~/YD\ 2026/projects/tools/session-wrap-backend
npm install -g @railway/cli
railway login
railway init
railway up
```

部署完成後：

```bash
export SESSION_WRAP_API_URL="https://your-url.railway.app"
curl "$SESSION_WRAP_API_URL/health"
```

## Local Docker

```bash
cd ~/YD\ 2026/projects/tools/session-wrap-backend
docker-compose up -d
export SESSION_WRAP_API_URL="http://localhost:3000"
curl "$SESSION_WRAP_API_URL/health"
```

## VPS / Manual

若要走 VPS、自管 Docker、反向代理等完整部署，請直接以這個子項目為準：

- `projects/tools/session-wrap-backend/README.md`

## Related Docs

- `DASHBOARD-DEPLOYMENT-GUIDE.md`
- `SESSION-WRAP-QUICKSTART.md`
- `../README.md`

## Notes

- 若舊文檔出現 `cd session-wrap-backend`，應視為歷史寫法
- 若需要 legacy split `web/` / `server/` 結構，請改看 `projects/tools/session-wrap-skill/`
