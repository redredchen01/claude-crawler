# Session Wrap Cloud — Implementation Roadmap

統一的會話自動化系統 + 雲端後端

## 架構概覽

```
┌──────────────────────────────────────┐
│     session-wrap-skill (開源)        │
│   ├─ session-wrap.sh                 │
│   ├─ obsidian-sync.sh                │
│   └─ .zshrc-wrap                     │
│   (本地完整功能，所有人免費)          │
└────────┬─────────────────────────────┘
         │ HTTP/REST API
         ▼
┌──────────────────────────────────────┐
│   session-wrap-backend (雲端)         │
│   ├─ Node.js + Express               │
│   ├─ PostgreSQL                      │
│   ├─ Claude Code 驗證                │
│   └─ REST API                        │
│   (Claude Code 訂戶 + 雲端功能)       │
└────────┬─────────────────────────────┘
         │
    ┌────┴────────┐
    ▼             ▼
 PostgreSQL      S3 Storage
 (User Data)     (Wrap History)
```

## 完成狀態

### ✅ Phase 1: 核心（已完成）

- [x] 本地 session-wrap 系統（CLI + bash 腳本）
- [x] Obsidian 知識庫同步
- [x] Memory 自動化
- [x] 發佈到 npm + GitHub（v3.2.0）

### 🔄 Phase 2: 後端基礎（進行中）

- [x] Express 伺服器框架
- [x] PostgreSQL 資料庫設計
- [x] Claude Code token 驗證
- [x] JWT 認證系統
- [x] REST API 路由
- [x] CLI 同步客戶端
- [ ] Docker + docker-compose 測試
- [ ] 前端 Web Dashboard（React）

### ⏳ Phase 3: 整合（下週）

- [ ] 更新 session-wrap.sh 調用後端 API
- [ ] 雲端 wrap 上傳
- [ ] Web Dashboard（查看歷史）
- [ ] Slack 集成

### 📊 Phase 4: 擴展（第四週）

- [ ] 團隊協作 API
- [ ] 高級分析
- [ ] 性能優化

---

## 檔案結構

```
YD 2026/
├── session-wrap-skill/          ← 開源 CLI 工具
│   ├── session-wrap.sh
│   ├── obsidian-sync.sh
│   └── .zshrc-wrap
│
├── session-wrap-backend/        ← 雲端後端（新建）
│   ├── src/
│   │   ├── index.js             # Express 服務器
│   │   ├── config/
│   │   │   └── database.js      # PostgreSQL 連接
│   │   ├── db/
│   │   │   └── init.js          # Schema 初始化
│   │   ├── middleware/
│   │   │   ├── auth.js          # Claude Code 驗證
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js          # 登錄 API
│   │   │   ├── wraps.js         # Wrap 存儲 API
│   │   │   └── users.js         # 用戶 API
│   │   └── cli/
│   │       └── sync-client.js   # CLI 同步工具
│   ├── docker-compose.yml       # 本地開發環境
│   ├── Dockerfile               # 生產構建
│   └── package.json
│
├── session-wrap-frontend/       ← Web Dashboard（下週）
│   ├── src/
│   │   ├── pages/Dashboard.tsx
│   │   ├── pages/History.tsx
│   │   └── api/client.ts
│   └── package.json
│
└── .obsidian-vault/             # 本地知識庫
```

---

## 下週任務：Phase 2 完成 + Phase 3 開始

### Task 1: 後端本地測試（2天）
```bash
cd session-wrap-backend
docker-compose up          # 啟動 PostgreSQL + Minio
npm run dev                # 啟動開發伺服器
curl http://localhost:3000/health  # 驗證
```

### Task 2: CLI 同步集成（2天）
更新 `session-wrap.sh` 調用後端：
```bash
# Before
wrap "Feature done"
# 📁 Saved locally

# After
wrap "Feature done"
# 📁 Saved locally
# ☁️  Synced to cloud (if logged in)
```

### Task 3: 前端 Dashboard（1.5天）
```
/api/auth/login
    ↓
JWT token
    ↓
React Dashboard
    ├─ Wrap History
    ├─ Storage Status
    └─ Settings
```

### Task 4: Slack 集成（1.5天）
```bash
wrap "All tasks done"
# 📤 Notifications:
#   - Cloud: ✅
#   - Slack: "User saved wrap at 11:30 AM"
```

---

## 立即行動清單

### Now（今天）
- [ ] 確認後端代碼完整性
- [ ] 測試 docker-compose 運行
- [ ] 驗證 Claude Code API 端點

### Week 1
- [ ] 本地開發環境驗證
- [ ] DB schema 測試
- [ ] CLI 同步客戶端測試

### Week 2
- [ ] 整合 session-wrap.sh 與後端
- [ ] Web Dashboard 基礎（React）
- [ ] 部署到 Railway / Render（免費層）

### Week 3
- [ ] Slack bot 集成
- [ ] 團隊協作 API
- [ ] 文檔完善

---

## 部署策略

### Development
```bash
docker-compose up                    # 本地
# PostgreSQL on :5432
# Backend on :3000
# Minio on :9000
```

### Production
```bash
# Railway (推薦)
1. Connect GitHub
2. Set env variables
3. Deploy

# Or Render
1. Create new web service
2. Connect GitHub repo
3. Set environment
```

### Environment Variables
```
# Backend (.env)
DATABASE_URL=postgresql://...
CLAUDE_CODE_API_URL=https://api.claude.ai
CLAUDE_CODE_API_KEY=...
JWT_SECRET=...

# CLI
SESSION_WRAP_API_URL=https://api.session-wrap.io
CLAUDE_CODE_TOKEN=...
```

---

## 技術決策

| 決策 | 原因 |
|------|------|
| Node.js + Express | 輕量、快速、npm 生態豐富 |
| PostgreSQL | 開源、免費、標準化、支持 JSON |
| Claude Code 驗證 | 直接集成，無需自建認證 |
| JWT | 無狀態認證，適合 API |
| Railway/Render | 免費層足夠，部署簡單 |
| S3 兼容存儲 | 便宜、可擴展 |

---

## 風險 & 緩解

| 風險 | 緩解 |
|------|------|
| Claude API 限制 | 已改用 token 驗證，無 API 調用 |
| 免費層容量 | Render DB 免費 500MB，夠用 |
| 冷啟動延遲 | Render 有免費 always-on 層 |
| 資料安全 | Token 只儲存本地，加密連接 |

---

## 成功指標

✅ **完成後的狀態：**
- 本地 wrap 100% 免費開源
- Claude Code 訂戶可雲端同步
- Web Dashboard 查看歷史
- Slack 通知
- 自託管或 Railway 部署

---

**下一步：** 確認啟動本地 docker-compose？
