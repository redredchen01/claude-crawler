# Troubleshooting Guide

YD 2026 工作區常見問題和解決方案。

---

## Table of Contents

- [環境配置](#環境配置)
- [Git 相關](#git-相關)
- [依賴和包管理](#依賴和包管理)
- [開發服務](#開發服務)
- [Docker 相關](#docker-相關)
- [數據庫](#數據庫)
- [測試](#測試)
- [性能](#性能)

---

## 環境配置

### 別名不工作

**問題：** `p1`, `p2`, `p3` 等別名無法使用

**解決方案：**

```bash
# 檢查是否已激活
source ~/.zshrc-workspace

# 驗證別名
alias p1

# 如果仍然無效，檢查 shell
echo $SHELL    # 應該是 /bin/zsh

# 添加到 ~/.zshrc
echo 'source ~/YD\ 2026/.zshrc-workspace' >> ~/.zshrc
source ~/.zshrc
```

### 路徑不正確

**問題：** 別名導航到錯誤的目錄

**解決方案：**

```bash
# 檢查 WORKSPACE_ROOT 設置
echo $WORKSPACE_ROOT

# 驗證實際路徑
ls -d ~/YD\ 2026/projects/production/dexapi

# 手動修復 .zshrc-workspace
nano ~/.zshrc-workspace
# 確保 WORKSPACE_ROOT 正確
```

---

## Git 相關

### 無法 push

**問題：** `git push` 被拒絕

**原因和解決方案：**

#### 認證失敗
```bash
# SSH 密鑰
ssh -T git@github.com              # 測試連接
eval $(ssh-agent -s)               # 啟動 ssh-agent
ssh-add ~/.ssh/id_rsa              # 添加密鑰

# Personal Access Token
git config --global credential.helper osxkeychain  # macOS
git config --global credential.helper cache        # Linux
```

#### 遠程分支被保護
```bash
# 檢查遠程狀態
git push -u origin feature/name --dry-run

# 確認分支存在
git branch -vv
```

#### 本地與遠程分歧
```bash
# 同步遠程狀態
git fetch origin
git status

# 如果有衝突，合併
git merge origin/main
```

### 提交消息格式不正確

**問題：** Pre-commit hook 拒絕提交

**解決方案：**

```bash
# 檢查提交消息格式
git log --oneline -1

# 正確的格式
git commit -m "feat(scope): description

Optional body with details"

# 修改上次提交
git commit --amend
```

### 分支衝突

**問題：** `git merge` 或 `git rebase` 衝突

**解決方案：**

```bash
# 查看衝突文件
git status

# 手動解決衝突
nano conflicted-file.js
# 移除 <<<<<<, ======, >>>>>> 標記，保留想要的代碼

# 標記為已解決
git add conflicted-file.js

# 完成 merge/rebase
git commit -m "resolve: merge conflicts"
# 或對於 rebase
git rebase --continue
```

### 誤 push 需要撤銷

**問題：** Push 了不應該 push 的東西

**解決方案（謹慎！）：**

```bash
# 如果尚未有人拉取，可以強制 push
git reset --soft HEAD~1            # 撤銷上次提交但保留更改
git push origin branch-name --force # 強制 push（不推薦）

# 更安全的方法：創建新提交還原更改
git revert HEAD
git push origin branch-name

# 詢問 code owner 和 reviewer
```

### 在錯誤分支上工作

**問題：** 在 master 上進行開發，應該在 develop 上

**解決方案：**

```bash
# 創建新分支並保留更改
git branch feature/new-name

# 重置當前分支
git reset --hard origin/main

# 切換到新分支
git checkout feature/new-name

# 驗證更改
git log --oneline -5
```

---

## 依賴和包管理

### npm 依賴衝突

**問題：** `npm install` 因版本衝突失敗

**解決方案：**

```bash
# 清理緩存
npm cache clean --force

# 刪除舊的鎖文件
rm -f package-lock.json

# 重新安裝
npm install

# 如果仍然失敗，強制安裝
npm install --force
```

### 過時依賴

**問題：** 安全警告關於過時的依賴

**解決方案：**

```bash
# 查看過時的包
npm outdated

# 更新所有包
npm update

# 修復安全漏洞
npm audit
npm audit fix

# 強制修復（可能破壞兼容性）
npm audit fix --force
```

### Python 依賴問題

**問題：** `pip install` 失敗或版本衝突

**解決方案：**

```bash
# 使用虛擬環境
python3 -m venv venv
source venv/bin/activate

# 清理緩存
pip cache purge

# 重新安裝
pip install -r requirements.txt

# 特定版本
pip install package-name==1.2.3
```

### Go 模塊問題

**問題：** `go get` 或 `go mod` 命令失敗

**解決方案：**

```bash
# 下載依賴
go mod download

# 清理未使用的依賴
go mod tidy

# 驗證依賴
go mod verify

# 更新依賴
go get -u ./...
```

---

## 開發服務

### 開發服務器無法啟動

**問題：** `npm run dev` 失敗

**排除步驟：**

```bash
# 檢查端口是否被佔用
lsof -i :3000

# 查看完整錯誤
npm run dev 2>&1 | tee dev.log

# 檢查依賴
npm ls

# 清理並重新安裝
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### 熱重載不工作

**問題：** 更改代碼後服務器未重新加載

**解決方案：**

```bash
# 檢查 watch 配置
cat webpack.config.js   # 或 vite.config.js

# 重啟開發服務器
npm run dev

# 強制刷新瀏覽器
Ctrl+Shift+R  # 硬刷新

# 檢查文件監控限制
ulimit -n     # 應該 > 1024
```

### 靜態資源 404

**問題：** CSS、JS、圖片無法加載

**解決方案：**

```bash
# 檢查 public 目錄
ls -la public/

# 驗證資源路徑
# 開發模式 vs 生產模式可能不同

# 清理 dist
rm -rf dist build
npm run build

# 檢查 webpack/vite 配置
```

---

## Docker 相關

### 容器無法啟動

**問題：** `docker-compose up` 失敗

**解決方案：**

```bash
# 查看詳細日誌
docker-compose logs

# 查看具體容器
docker-compose logs postgres
docker-compose logs app

# 強制重建
docker-compose up -d --build

# 清理並重新啟動
docker-compose down -v
docker-compose up -d
```

### 端口已被佔用

**問題：** "Address already in use" 錯誤

**解決方案：**

```bash
# 查找佔用端口的進程
lsof -i :5432              # PostgreSQL
lsof -i :6379              # Redis
lsof -i :3000              # 應用

# 殺死進程
kill -9 <PID>

# 或修改 docker-compose.yml 中的端口
# ports:
#   - "5433:5432"          # 使用不同的外部端口
```

### 容器間通信失敗

**問題：** 應用無法連接到 PostgreSQL 或 Redis

**解決方案：**

```bash
# 驗證容器正在運行
docker-compose ps

# 進入容器測試連接
docker-compose exec app sh
ping postgres              # 應該可以 ping

# 檢查環境變數
docker-compose config | grep -A 5 environment

# 查看網絡
docker network ls
docker network inspect <network_name>
```

### 數據持久化問題

**問題：** 停止容器後數據丟失

**解決方案：**

```bash
# 驗證卷配置
docker-compose config | grep -A 3 volumes

# 檢查本地數據目錄
ls -la postgres_data/
ls -la redis_data/

# 備份數據
docker-compose exec postgres pg_dump > backup.sql

# 完整清理（清除所有數據）
docker-compose down -v     # 移除卷
docker-compose up -d       # 重新啟動（新數據庫）
```

---

## 數據庫

### 無法連接到 PostgreSQL

**問題：** `psql` 或應用連接失敗

**解決方案：**

```bash
# 檢查連接字符串
echo $DATABASE_URL

# 進入容器測試
docker-compose exec postgres psql -U postgres

# 檢查數據庫是否存在
\l                         # 列出數據庫

# 創建數據庫
CREATE DATABASE mydb;
```

### 遷移失敗

**問題：** 數據庫遷移無法運行

**解決方案：**

```bash
# 查看遷移狀態
docker-compose exec app python manage.py showmigrations

# 運行遷移
docker-compose exec app python manage.py migrate

# 回滾遷移
docker-compose exec app python manage.py migrate app 0001

# 創建新遷移
docker-compose exec app python manage.py makemigrations
```

### Redis 連接問題

**問題：** Redis 命令失敗或超時

**解決方案：**

```bash
# 進入 Redis
docker-compose exec redis redis-cli

# 檢查連接
ping

# 查看 keys
KEYS *

# 清空數據庫（小心！）
FLUSHDB
```

---

## 測試

### 測試失敗

**問題：** `npm test` 返回失敗

**排除步驟：**

```bash
# 運行特定測試
npm test -- test-name.test.js

# 運行單個測試函數
npm test -- --testNamePattern="should do something"

# 查看詳細輸出
npm test -- --verbose

# 調試模式
node --inspect-brk node_modules/.bin/jest --runInBand
```

### 覆蓋率不足

**問題：** 測試覆蓋率低於目標

**解決方案：**

```bash
# 查看覆蓋報告
npm test -- --coverage

# 找出未覆蓋的代碼行
open coverage/index.html    # 打開 HTML 報告

# 為缺失的代碼編寫測試
# ... 編寫更多測試 ...
```

### 測試超時

**問題：** 測試因超時而失敗

**解決方案：**

```bash
# 增加超時時間
npm test -- --testTimeout=10000    # 10 秒

# 檢查異步代碼
// 確保有 done() 或 return Promise

// 不正確
test('async', () => {
  setTimeout(() => expect(1).toBe(1), 100);
});

// 正確
test('async', (done) => {
  setTimeout(() => {
    expect(1).toBe(1);
    done();
  }, 100);
});
```

---

## 性能

### 構建緩慢

**問題：** `npm run build` 需要很長時間

**優化方法：**

```bash
# 分析構建時間
npm run build -- --analyze

# 並行構建
npm run build -- --parallel

# 增加 Node 堆大小
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### 應用啟動緩慢

**問題：** 開發服務器或應用啟動慢

**診斷：**

```bash
# 測量時間
time npm run dev

# 檢查模塊加載時間
node --prof app.js
node --prof-process isolate-*.log > profile.txt
cat profile.txt | less
```

### 內存泄漏

**問題：** 應用 RAM 使用持續增加

**分析和修復：**

```bash
# 啟用堆快照
node --heap-prof app.js

# 分析堆
node inspect
.analyze(readFileSync('heap.heapsnapshot'))

# 使用 clinic.js
npm install -g clinic
clinic doctor -- node app.js
```

---

## 常見錯誤信息

### "Cannot find module"

**原因：** 依賴未安裝或導入路徑錯誤

```bash
# 重新安裝
npm install

# 檢查導入路徑（區分大小寫）
# import Foo from './foo'  ❌ (如果文件是 Foo.js)
# import Foo from './Foo'  ✓
```

### "EACCES: permission denied"

**原因：** 文件權限問題

```bash
# 修復 npm 全局權限
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# 或使用 sudo（不推薦）
sudo npm install -g package
```

### "ECONNREFUSED: Connection refused"

**原因：** 無法連接到服務（數據庫、Redis 等）

```bash
# 檢查服務運行狀態
docker-compose ps

# 檢查連接字符串
echo $DATABASE_URL

# 測試連接
nc -zv localhost 5432
```

---

## 獲得幫助

### 調查步驟

1. 閱讀錯誤消息 - 通常包含關鍵信息
2. 搜索 Issues - 可能有人已遇到同樣問題
3. 查看日誌 - `docker-compose logs`, `npm run dev 2>&1`
4. 搜索 Stack Overflow - 通用問題可能有答案
5. 創建新 Issue - 包含完整的錯誤日誌和重現步驟

### 報告 Bug 時包含

- 錯誤消息（完整）
- 重現步驟
- 期望行為 vs 實際行為
- 環境信息（OS, Node 版本等）
- 相關日誌

```bash
# 收集系統信息
node --version
npm --version
docker --version
git --version
uname -a

# 收集日誌
npm run dev 2>&1 | tee dev.log
docker-compose logs > docker.log
```

---

**最後更新：** 2026-03-26
**版本：** 1.0
