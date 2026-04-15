# YD 2026 Projects Directory

統一的項目管理文檔。所有項目按層級分類：**Production**、**Tools**、**Experimental**。

---

## 📦 Production Projects

生產環境主項目 - 持續開發維護。

### P1: YDAPI (Core)
**位置:** `projects/production/dexapi/`

| 字段 | 值 |
|------|-----|
| **名稱** | YDAPI (Main) |
| **狀態** | 🟢 Active Development |
| **技術棧** | TypeScript, Python, Go |
| **大小** | 756M |
| **描述** | 主 API 服務核心 |
| **開發者** | - |

**快速命令：**
```bash
cd projects/production/dexapi
# 開發、測試、部署命令
```

---

### P2: YDAPI (Testing)
**位置:** `projects/production/test-ydapi/`

| 字段 | 值 |
|------|-----|
| **名稱** | YDAPI Testing Environment |
| **狀態** | 🟢 Active |
| **技術棧** | Same as P1 |
| **大小** | 137M |
| **文件數** | 3,264 files |
| **描述** | 測試環境和集成測試 |
| **開發者** | - |

**用途：**
- 集成測試
- UAT 環境
- 性能測試

---

### P3: APEX Tool
**位置:** `projects/production/watermark-0324/`

| 字段 | 值 |
|------|-----|
| **名稱** | APEX Watermark Remover |
| **狀態** | 🟢 Active |
| **技術棧** | Python, Go, React |
| **大小** | 1.3G |
| **提交數** | 25+ |
| **描述** | 去水印和鬼影移除工具 |
| **開發者** | - |

**子模塊：**
- `apex-plugins/` - 多語言插件（database, django, dotnet, flutter, golang, nestjs, python, react, rust）
- `ghost-remover/` - 鬼影移除核心引擎
- `instincts/` - 智能分析模塊

---

## 🔧 Tools

開發工具和支援項目。

### session-wrap-backend
**位置:** `projects/tools/session-wrap-backend/`

| 字段 | 值 |
|------|-----|
| **名稱** | Session Wrap Backend |
| **狀態** | 🟡 Maintenance |
| **技術棧** | Node.js, Express.js, PostgreSQL |
| **版本** | 1.0.1 |
| **大小** | 47M |
| **描述** | 多 Agent 會話同步雲後端 |
| **用途** | Claude Code, Cursor, Windsurf 等 AI Agent 會話同步 |

**npm Package:**
```bash
npm install session-wrap-backend
# 或
yarn add session-wrap-backend
```

**API 端點：**
- `/api/auth/login` - 多 Agent 登入
- `/api/auth/verify` - JWT 驗證
- `/api/wraps` - 會話存儲
- `/api/wraps/history` - 會話歷史
- `/api/users/profile` - 用戶資料

---

## 🧪 Experimental

試驗性項目和本地環境。

### sub2api-deploy
**位置:** `projects/experimental/sub2api-deploy/`

| 字段 | 值 |
|------|-----|
| **名稱** | Sub2API Deploy (Local) |
| **狀態** | 🟠 Development |
| **技術棧** | Docker, PostgreSQL, Python |
| **大小** | 68M |
| **描述** | 本地測試部署環境 |
| **環境** | Docker Compose |

**用途：**
- 本地開發環境
- Docker 配置測試
- 數據庫集成測試

**啟動：**
```bash
cd projects/experimental/sub2api-deploy
docker-compose up
```

---

## 📊 Projects Quick Stats

| 層級 | 項目數 | 總大小 | 狀態 |
|------|--------|--------|------|
| Production | 3 | 2.2G | 🟢 Active |
| Tools | 1 | 47M | 🟡 Maintenance |
| Experimental | 1 | 68M | 🟠 Development |
| **Total** | **5** | **2.3G** | - |

---

## 🔗 相關文檔

- [CLAUDE.md](CLAUDE.md) - 項目規則和配置
- [WORKSPACE.md](WORKSPACE.md) - 工作區索引
- [docs/WORKSPACE_STRUCTURE.md](docs/WORKSPACE_STRUCTURE.md) - 目錄結構優化記錄
- [obsidian/](obsidian/) - 知識庫

---

## 快速命令

### 進入項目
```bash
# Production
cd projects/production/dexapi        # P1
cd projects/production/test-ydapi    # P2
cd projects/production/watermark-0324 # P3

# Tools
cd projects/tools/session-wrap-backend

# Experimental
cd projects/experimental/sub2api-deploy
```

### 項目操作
```bash
# 查看所有項目
ls -la projects/*/

# 查看項目大小
du -sh projects/*/

# 查看 git 狀態（所有項目）
for dir in projects/**/; do
  echo "=== $(basename $dir) ==="
  cd "$dir" && git status --short && cd -
done
```

---

## 開發規範

### 分支策略
- **main/master** - 生產分支
- **develop** - 開發主分支
- **feature/** - 功能分支
- **bugfix/** - 修復分支

### 提交消息格式
```
type: brief description

[optional body]

Co-Authored-By: Name <email@example.com>
```

### 更新此文檔
當添加新項目或更改現有項目狀態時，請更新此文檔。

---

**最後更新:** 2026-03-26
**版本:** 1.0 (Phase 2 Optimization)
