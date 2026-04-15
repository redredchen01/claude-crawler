# Development Guide

YD 2026 工作區的開發指南。

---

## 工作區結構

```
YD 2026/
├── projects/
│   ├── production/          # P1/P2/P3 - 生產項目
│   ├── tools/               # 開發工具
│   └── experimental/        # 試驗環境
├── docs/                    # 文檔和指南
├── scripts/                 # 自動化腳本
├── obsidian/                # 知識庫
└── Archived/                # 歷史項目
```

---

## 快速開始

### 1. 設置環境

```bash
# 激活別名系統
source ~/.zshrc-workspace

# 驗證別名
p1          # 應該進入 projects/production/dexapi
yd-status   # 應該顯示所有項目狀態
```

### 2. 選擇項目

```bash
# 進入生產項目
p1          # YDAPI 核心
p2          # YDAPI 測試環境
p3          # APEX 去水印工具

# 進入工具
cd projects/tools/session-wrap-backend

# 進入實驗環境
cd projects/experimental/sub2api-deploy
```

### 3. 開發流程

```bash
# 創建特性分支
git checkout -b feature/your-feature develop

# 開發和提交
# ... 編輯代碼 ...
git add .
git commit -m "feat(scope): description"

# 推送並創建 PR
git push origin feature/your-feature
# 在 GitHub 上創建 Pull Request
```

---

## 項目開發

### Production Projects

見 [projects/production/README.md](../projects/production/README.md)

**快速命令：**

```bash
# P1: dexapi
p1
npm install
npm run dev
npm test

# P2: test-ydapi
p2
npm install
npm test

# P3: watermark-0324
p3
# 見 CLAUDE.md 了解特定命令
```

### Tools

見 [projects/tools/README.md](../projects/tools/README.md)

```bash
cd projects/tools/session-wrap-backend
npm install
npm run dev
npm run build
```

### Experimental

見 [projects/experimental/README.md](../projects/experimental/README.md)

```bash
cd projects/experimental/sub2api-deploy
docker-compose up -d
docker-compose down
```

---

## 開發規範

### 提交消息

```
type(scope): brief description

[optional body with more details]

Closes #ISSUE_NUMBER
Co-Authored-By: Name <email@example.com>
```

**Types:**
- `feat` - 新功能
- `fix` - Bug 修復
- `refactor` - 代碼重構
- `test` - 測試相關
- `docs` - 文檔更新
- `chore` - 維護任務
- `perf` - 性能優化

**Scope:** 修改的模塊或組件

**例子：**
```
feat(auth): add JWT token refresh mechanism

Implements automatic token refresh on expiration.
Closes #123

Co-Authored-By: Alice <alice@example.com>
```

### 分支策略

```
main/master           # 生產分支（受保護）
├── develop           # 開發主分支
├── feature/*         # 功能分支
├── bugfix/*          # 修復分支
└── release/*         # 發布分支
```

### 代碼風格

見各項目的：
- `.editorconfig` - 編輯器配置
- `.eslintrc` - JavaScript/TypeScript 規則
- `pyproject.toml` / `.flake8` - Python 規則
- `.prettierrc` - 代碼格式化規則

### 測試

**單元測試：**
```bash
npm test              # JavaScript/Node.js
pytest                # Python
go test ./...         # Go
```

**集成測試：**
```bash
# 在 experimental/sub2api-deploy 中運行
docker-compose up -d
npm run test:integration  # 或相應命令
```

**代碼覆蓋率：**
```bash
npm test -- --coverage
pytest --cov=.
```

---

## 常見任務

### 添加依賴

```bash
# JavaScript/Node.js
npm install package-name
npm install -D dev-package

# Python
pip install package-name
pip install -e .  # 安裝本地包

# Go
go get github.com/user/package
```

### 更新所有依賴

```bash
# JavaScript
npm update
npm audit fix

# Python
pip list --outdated
pip install --upgrade package-name

# Go
go get -u ./...
```

### 運行特定測試

```bash
# JavaScript - 特定文件
npm test -- tests/auth.test.js

# Python
pytest tests/test_auth.py -v

# Go
go test -run TestAuthFunction
```

### 創建發布

見各項目的部署文檔

---

## 使用 Shell 別名

### 項目導航

```bash
# 快速進入項目
p1              # dexapi
p2              # test-ydapi
p3              # watermark-0324
pj              # projects/
pw              # 工作區根目錄
kb              # Obsidian 知識庫

# 查看項目狀態
yd-status       # 所有項目的 git 狀態

# 快速開發命令
dev1            # p1 + npm run dev
test1           # p1 + npm test
dev2            # p2 + npm run dev
test2           # p2 + npm test
```

### 自定義別名

編輯 `~/.zshrc-workspace` 添加你自己的快捷命令：

```bash
# 例子：快速運行所有測試
alias test-all='
  echo "Running tests in all projects..."
  for project in dexapi test-ydapi; do
    echo "Testing $project..."
    cd projects/production/$project
    npm test
  done
'
```

---

## 多項目工作

### 使用多個終端

```bash
# 終端 1
p1 && npm run dev

# 終端 2
p2 && npm test

# 終端 3
p3 && npm run watch
```

### 使用 tmux

```bash
# 創建新會話
tmux new-session -s dev

# 在第一個窗口運行 P1
p1 && npm run dev

# 創建新窗口運行 P2
tmux new-window -t dev -n p2
p2 && npm test

# 附加到會話
tmux attach -t dev

# 在窗口間切換
C-b n   # 下一個
C-b p   # 上一個
C-b 1   # 窗口 1
```

### 並行運行測試

```bash
# 在後台運行所有項目的測試
(cd projects/production/dexapi && npm test) &
(cd projects/production/test-ydapi && npm test) &
(cd projects/production/watermark-0324 && npm test) &
wait    # 等待所有完成
```

---

## 調試

### 查看日誌

```bash
# 應用日誌
npm run dev              # 輸出到終端

# Docker 日誌
docker-compose logs -f app
docker-compose logs app | tail -100

# 系統日誌
tail -f /var/log/syslog  # Linux
log stream                # macOS
```

### 調試模式

```bash
# Node.js
node --inspect=9229 script.js
# 在 Chrome DevTools 中打開：chrome://inspect

# Python
python -m pdb script.py

# Go
dlv debug ./cmd/main.go
```

### 數據庫調試

```bash
# PostgreSQL
docker-compose exec postgres psql -U postgres
SELECT * FROM table_name LIMIT 10;

# Redis
docker-compose exec redis redis-cli
KEYS *
GET key-name
```

---

## 性能優化

### 分析性能

```bash
# Node.js
node --prof app.js
node --prof-process isolate-*.log > profile.txt

# Python
python -m cProfile script.py

# Go
go test -bench=. -benchmem
```

### 監視資源使用

```bash
# Docker 容器
docker stats

# 系統資源
top              # 或 htop
ps aux | grep node
```

---

## 常見問題

### 依賴衝突
```bash
# JavaScript
npm ci              # 使用 package-lock.json
npm cache clean --force

# Python
pip install -r requirements.txt
pip cache purge
```

### 端口已被佔用
```bash
# 查找佔用的進程
lsof -i :3000

# 殺死進程
kill -9 <PID>

# 或修改配置使用不同端口
PORT=3001 npm run dev
```

### Git 衝突
```bash
# 查看衝突
git status

# 手動解決或使用工具
git mergetool

# 標記為已解決
git add .
git commit -m "resolve: merge conflicts"
```

### Docker 問題
```bash
# 清理所有容器
docker-compose down -v

# 重建鏡像
docker-compose up -d --build

# 檢查日誌
docker-compose logs
```

---

## 相關資源

- [CLAUDE.md](../CLAUDE.md) - 項目規則
- [PROJECTS.md](../PROJECTS.md) - 項目詳情
- [projects/README.md](../projects/README.md) - 項目結構
- [projects/production/README.md](../projects/production/README.md) - 生產項目指南
- [projects/tools/README.md](../projects/tools/README.md) - 工具項目指南
- [projects/experimental/README.md](../projects/experimental/README.md) - 實驗項目指南

---

**最後更新：** 2026-03-26
**版本：** 1.0
