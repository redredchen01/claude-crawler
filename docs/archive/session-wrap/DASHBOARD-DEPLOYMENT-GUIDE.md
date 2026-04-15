# Session Wrap Dashboard Deployment Guide

本文件描述的是 session-wrap dashboard/backend 的部署資料。對當前 YD 2026 工作區來說，它是「遷移後的定位說明」，不是頂層目錄操作手冊。

## Current Reality

- 工作區根目錄沒有頂層 `web/` 或 `server/`
- 相關代碼目前位於：
  - `projects/tools/session-wrap-backend/`
  - `projects/tools/session-wrap-skill/web/`
  - `projects/tools/session-wrap-skill/server/`

## If You Need the Backend

優先使用：

```bash
cd ~/YD\ 2026/projects/tools/session-wrap-backend
```

這裡包含：
- `README.md`
- `docker-compose.yml`
- `package.json`
- `src/`
- `web/`

## If You Need the Older Split Web/Server Layout

查看：

```bash
cd ~/YD\ 2026/projects/tools/session-wrap-skill
```

其中保留了：
- `web/`
- `server/`

## Guidance

- 若文檔寫著 `cd web` 或 `cd server`，不要在工作區根目錄執行
- 先確認它實際對應的是 `projects/tools/session-wrap-backend/` 還是 `projects/tools/session-wrap-skill/`
- Railway / Vercel / Docker 的具體部署細節應以對應子項目的 README 為準

## Recommended Entry Points

- Backend: `projects/tools/session-wrap-backend/README.md`
- Legacy split app: `projects/tools/session-wrap-skill/README.md`
- Workspace overview: `../README.md`
