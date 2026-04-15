# Contributing to YD 2026

感謝您對 YD 2026 工作區的貢獻！本文檔說明如何有效地為此項目做出貢獻。

---

## 在開始之前

### 了解項目

1. 讀 [../README.md](../README.md) 了解工作區概述
2. 讀 [../CLAUDE.md](../CLAUDE.md) 了解工作區規則
3. 讀 [../PROJECTS_INFO.md](../PROJECTS_INFO.md) 了解當前活躍項目
4. 讀 [WORKSPACE_STRUCTURE.md](WORKSPACE_STRUCTURE.md) 了解目錄結構

### 設置環境

```bash
# 激活別名系統
source ~/.zshrc-workspace

# 驗證環境
p1 && git status    # 預設會進入 gwx
```

---

## 貢獻流程

### 1. 創建 Issue（如適用）

對於大型變更或新功能，先創建 Issue 討論設計：

```
Title: [Feature/Bug] Brief description

Description:
- What: 你要做什麼
- Why: 為什麼需要這個變更
- How: 建議的實現方式
```

### 2. 創建特性分支

```bash
# 進入項目
p1          # 或 p2, p3, 等

# 更新 develop 分支
git checkout develop
git pull origin develop

# 創建特性分支
git checkout -b feature/your-feature-name develop
# 或修復分支
git checkout -b bugfix/issue-name develop
```

**分支命名約定：**
- `feature/feature-name` - 新功能
- `bugfix/bug-name` - Bug 修復
- `refactor/refactor-name` - 代碼重構
- `docs/doc-topic` - 文檔更新
- `chore/task-name` - 維護任務

### 3. 進行變更

```bash
# 編輯代碼
# ... 做出你的變更 ...

# 運行測試
gwx-test              # 或 tg-smoke / ns-test 等相應命令

# 查看變更
git diff
git status
```

### 4. 提交變更

```bash
# 暫存文件
git add .

# 提交（遵循提交消息格式）
git commit -m "type(scope): brief description

Optional detailed explanation of the change."
```

**提交消息格式：**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type（必須）：**
- `feat` - 新功能
- `fix` - Bug 修復
- `refactor` - 代碼重構
- `test` - 測試相關
- `docs` - 文檔更新
- `style` - 代碼風格（不影響邏輯）
- `chore` - 構建、依賴、工具相關
- `perf` - 性能優化
- `ci` - CI/CD 配置

**Scope（可選）：**
修改的模塊或組件名稱，如 `auth`, `api`, `ui`

**Subject（必須）：**
- 不超過 50 個字符
- 命令式語氣（"add" 而不是 "added"）
- 不要以句號結尾

**Body（可選）：**
- 解釋 **what** 和 **why**，而不是 **how**
- 每行不超過 72 個字符
- 使用 `#123` 引用 Issue 號

**Footer（可選）：**
- 引用相關 Issue：`Closes #123`
- 列出 Breaking Changes

**例子：**

```
feat(auth): add JWT token refresh mechanism

Implement automatic token refresh on expiration,
improving user experience and security.

Closes #456
Breaking Changes: Login endpoint now requires /api/v2/auth/login
```

### 5. 推送並創建 Pull Request

```bash
# 推送分支到遠程
git push origin feature/your-feature-name

# 在 GitHub 上創建 Pull Request
# 或使用 gh 命令：
gh pr create --title "feat(scope): description" \
             --body "Detailed description of changes"
```

**PR 標題格式：**
與提交消息 subject 一致，如 `feat(auth): add JWT refresh`

**PR 描述模板：**

```markdown
## Description
簡要說明這個 PR 做了什麼

## Changes
- Change 1
- Change 2
- Change 3

## Testing
- [ ] 運行了單元測試
- [ ] 運行了集成測試
- [ ] 手動測試場景
- [ ] 涵蓋了邊界情況

## Related Issues
Closes #123
Related to #456

## Breaking Changes
（如有）

## Screenshots
（如果涉及 UI）

## Additional Notes
（任何其他信息）
```

### 6. 代碼審查

- 回應 reviewer 的評論
- 進行請求的更改
- 重新提交更新
- 最後獲得批准

```bash
# 進行更改後
git add .
git commit -m "refactor: address review feedback"
git push origin feature/your-feature-name
```

### 7. 合併

一旦獲得批准：

```bash
# 方式 1：通過 GitHub UI 合併
# 方式 2：使用 gh 命令
gh pr merge --merge      # create a merge commit
gh pr merge --squash     # squash commits
gh pr merge --rebase     # rebase and merge
```

---

## 代碼風格和標準

### 通用規則

- **語言** - 代碼英文，提交消息繁體中文或英文
- **縮進** - 見 `.editorconfig`
- **行寬** - 80-100 個字符
- **命名** - camelCase 用於變數，PascalCase 用於類

### JavaScript/TypeScript

見 `.eslintrc` 和 `.prettierrc`

```bash
npm run lint              # 檢查代碼風格
npm run lint:fix          # 自動修復
npm run format            # 格式化代碼
```

### Python

見 `pyproject.toml` 和 `.flake8`

```bash
black .                   # 格式化
flake8 .                  # 檢查風格
isort .                   # 組織導入
```

### Go

見 `.golangci.yml`

```bash
go fmt ./...              # 格式化
golangci-lint run         # 檢查
```

---

## 測試

### 運行測試

```bash
cd projects/production/your-project

# 單元測試
npm test                  # 或 pytest, go test

# 集成測試
npm run test:integration

# 覆蓋率報告
npm test -- --coverage
pytest --cov=.
```

### 編寫測試

- 為新功能編寫測試
- 為 Bug 修復編寫測試以防止回歸
- 目標覆蓋率：>80%

### 測試最佳實踐

- 獨立運行測試（無副作用）
- 使用有意義的測試名稱
- 測試邊界情況
- 使用 fixtures 和 mocks

---

## 文檔

### 更新文檔

- 更新代碼時同時更新相關文檔
- 添加 API 變更時更新文檔
- 添加新功能時添加使用示例

### 文檔位置

- README 在各項目和層級目錄
- API 文檔在 `docs/`
- 工作區結構在 `docs/WORKSPACE_STRUCTURE.md`
- 工作區架構在 `docs/ARCHITECTURE.md`

### 文檔格式

- 使用 Markdown
- 代碼塊加上語言標識
- 使用清晰的標題層級
- 包含實例和命令

---

## 提交前檢查清單

在創建 PR 前：

```bash
# 更新到最新
git checkout develop
git pull origin develop
git checkout your-branch
git merge develop

# 運行測試
npm test

# 檢查代碼風格
npm run lint
npm run lint:fix

# 檢查提交消息
git log origin/develop..HEAD --oneline

# 檢查無意外的更改
git diff develop..HEAD
```

---

## PR 審查指南

### 作為審查者

- 檢查代碼邏輯和風格
- 驗證測試覆蓋
- 檢查文檔更新
- 建議改進但保持友好

### 作為貢獻者

- 認真對待反饋
- 解釋你的設計決策
- 提出反建議時保持尊重
- 及時進行更改

---

## 常見貢獻類型

### 新功能

1. 創建 Issue 討論設計
2. 獲得批准
3. 實現功能
4. 編寫測試（>80% 覆蓋）
5. 更新文檔
6. 創建 PR

### Bug 修復

1. 創建 Issue 描述 Bug
2. 編寫測試重現 Bug
3. 實現修復
4. 驗證測試通過
5. 更新文檔（如需）
6. 創建 PR

### 文檔更新

1. 編輯相關文檔
2. 驗證格式和鏈接
3. 創建 PR

### 性能優化

1. 衡量性能改進
2. 編寫測試驗證改進
3. 文檔化更改
4. 創建 PR

---

## 行為準則

我們致力於為所有貢獻者提供包容和尊重的環境。

- **尊重** - 尊重所有參與者
- **包容** - 歡迎各種背景的貢獻者
- **誠實** - 誠實溝通
- **專業** - 保持專業態度

違反行為準則可能導致被禁止參與。

---

## 如何尋求幫助

- **提問** - 在 Issue 中提問
- **討論** - 使用 Discussions 進行討論
- **反饋** - 通過 PR 評論提供反饋
- **報告問題** - 創建 Issue 報告 Bug

---

## 致謝

感謝所有貢獻者使 YD 2026 變得更好！

您的貢獻無論大小都很重要。

---

## 快速參考

```bash
# 開始貢獻
source ~/.zshrc-workspace
p1                                          # 進入項目
git checkout -b feature/my-feature develop
# ... 進行更改 ...
npm test && npm run lint:fix                # 驗證
git add . && git commit -m "feat: ..."      # 提交
git push origin feature/my-feature          # 推送
# 在 GitHub 上創建 PR
```

---

**最後更新：** 2026-03-26
**版本：** 1.0
