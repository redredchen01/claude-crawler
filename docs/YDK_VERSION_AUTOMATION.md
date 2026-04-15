# ydk ↔ /triple-publish 版本號自動橋接

**狀態**: v0.5 實現方案（核心組件完成）  
**最後更新**: 2026-04-07

---

## 概覽

完整的自動版本管理和多渠道發佈流程，涵蓋：
1. **版本檢測** — 自動監測 pyproject.toml 版本變化
2. **Git 工作流** — 自動創建版本 tag
3. **發佈協調** — 鏈式調用 triple-publish（GitHub + npm + PyPI）
4. **反饋循環** — Obsidian vault 自動更新

---

## 架構

```
開發工作流
    ↓
PR 合併到 main
    ↓
CI/CD 觸發 (webhook 或手動)
    ↓
version-bump-bridge.sh
    ├─ 步驟 1: 檢測版本變化
    ├─ 步驟 2: 計算新版本號 (conventional commits)
    ├─ 步驟 3: 創建 git tag (ydk-vX.Y.Z)
    ├─ 步驟 4: 調用 /triple-publish
    └─ 步驟 5: 更新 Obsidian 記錄
    ↓
GitHub Release
npm Registry
PyPI Repository
Obsidian Vault
```

---

## 組件概述

### 1. version-bump-bridge.sh
**位置**: `scripts/version-bump-bridge.sh`

**功能**:
- 檢測自上次 git tag 以來的 commit
- 基於 conventional commits 分析推薦版本號
  - `BREAKING` 或 `!` → major bump
  - `feat:` → minor bump
  - `fix:` → patch bump
- 創建新的 git tag
- 調用 triple-publish
- 更新 Obsidian vault

**用法**:
```bash
# 預演模式（檢查但不執行）
bash scripts/version-bump-bridge.sh --dry-run

# 實際執行
bash scripts/version-bump-bridge.sh
```

**觸發點**:
- GitHub Actions（PR merge 後自動觸發）
- 手動命令（開發流程中按需）
- Cron 任務（定期檢查）

### 2. /triple-publish 技能（已存在）

**功能**:
- GitHub: commit + tag + push
- npm: `npm publish`
- PyPI: `twine upload` (目前支援 Trusted Publisher)

**改進計畫**:
- [ ] 集成 PyPI Trusted Publisher（GitHub Actions）
- [ ] 版本號自動檢測
- [ ] 失敗重試機制

### 3. /vault-mining-feedback 技能（已完成）

**功能**:
- 標記 idea 已實現
- 更新部署日期和 skill 鏈接
- Obsidian 索引同步

---

## 實現階段

### Phase 1: 核心版本檢測（✅ 完成）
- ✅ version-bump-bridge.sh 實現
- ✅ Conventional commits 分析
- ✅ 版本號計算邏輯
- ✅ Git tag 創建

### Phase 2: CI/CD 集成（⏳ 進行中）
**需要完成**:
- [ ] GitHub Actions workflow `.github/workflows/publish.yml`
- [ ] 環境變數配置（PYPI_API_TOKEN / TRUSTED_PUBLISHER）
- [ ] 測試和驗證

**預期實現**:
```yaml
# .github/workflows/publish.yml
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run version-bump-bridge
        run: bash scripts/version-bump-bridge.sh
      - name: Notify vault
        run: /vault-mining-feedback --skill ydk --status success
```

### Phase 3: PyPI Trusted Publisher（⏳ 計畫中）
**改進方案**:
```bash
# 替代 twine upload，使用 PyPI Trusted Publisher
# 在 GitHub Actions 中無需存儲 API token

- name: Publish to PyPI
  uses: pypa/gh-action-pypi-publish@release/v1
  with:
    packages-dir: dist/
```

### Phase 4: 完整反饋循環（⏳ 計畫中）
**目標**:
- 版本發佈成功後自動更新 Obsidian vault
- 記錄發佈時間、目標、結果
- 生成發佈日誌報告

---

## 使用場景

### 場景 1：開發新模塊後自動發佈
```bash
# 開發完成，提交 PR
git commit -m "feat(llm): add LLM workflow module"
git push

# PR review 和合併
# → GitHub Actions 自動觸發 version-bump-bridge
# → 自動計算版本號: 0.5.0 → 0.6.0
# → 自動發佈到三個管道
# → Obsidian 自動更新
```

### 場景 2：手動觸發版本發佈
```bash
# 需要立即發佈時
bash scripts/version-bump-bridge.sh

# 或通過 GitHub Actions 手動觸發
gh workflow run publish
```

### 場景 3：預演模式驗證
```bash
# 檢查將執行什麼操作，不真正提交
bash scripts/version-bump-bridge.sh --dry-run

# 輸出示例：
# ✅ 環境檢查通過
# ℹ️  當前版本: 0.5.0
# ✅ 檢測到 minor 類型的版本變化
# ℹ️  計畫版本號: 0.5.0 → 0.6.0
# ⚠️  預演模式：跳過實際操作
```

---

## 配置和環保變數

### GitHub Actions 環境變數

設置在 Settings → Secrets and variables:

```bash
# 選項 A: 使用 API Token（當前方式）
PYPI_API_TOKEN=pypi-...

# 選項 B: 使用 Trusted Publisher（推薦）
# 配置步驟：
# 1. 在 PyPI 項目設置中啟用 Trusted Publisher
# 2. 授權 GitHub 項目
# 3. GitHub Actions 自動使用 OIDC token
```

### 本地開發環境

```bash
# ~/.pypirc
[distutils]
index-servers = pypi

[pypi]
username = __token__
password = pypi-xxxx
```

---

## 監控和驗證

### 檢查發佈狀態

```bash
# 查看最新的 git tag
git tag -l 'ydk-v*' | sort -V | tail -5

# 查看 PyPI 上的版本
python3 -m pip index versions yd-utility-kit

# 查看 npm 上的版本
npm view yd-utility-kit versions
```

### 日誌查看

```bash
# 查看最新的 GitHub Actions 運行
gh run list --repo=your-org/yd-utility-kit

# 查看 Obsidian vault 記錄
grep "last_published" ~/YD\ 2026/obsidian/projects/yd-utility-kit.md
```

---

## 故障排查

### 問題 1：版本號未自動遞增
**原因**: 可能是 commit message 格式不符合 conventional commits

**解決**:
```bash
# 確保 commit 遵循格式
git commit -m "feat: 新功能"      # minor bump
git commit -m "fix: 修復 bug"     # patch bump
git commit -m "BREAKING: 破壞性變更"  # major bump
```

### 問題 2：PyPI 發佈失敗
**原因**: Token 失效或缺少依賴

**解決**:
```bash
# 檢查 twine 是否安裝
pip install twine

# 驗證 PyPI token
python3 -m twine check dist/*
```

### 問題 3：Obsidian vault 未更新
**原因**: clausidian CLI 未安裝或路徑錯誤

**解決**:
```bash
# 安裝 clausidian
npm install -g clausidian

# 手動同步
clausidian sync ~/YD\ 2026/obsidian
```

---

## 下一步（V1.0 計畫）

### 計畫中的改進

1. **自動版本號遞增** ✅ 檢測邏輯已實現
   - [ ] 支持語義化版本設定
   - [ ] 預發佈版本（alpha/beta/rc）

2. **PyPI Trusted Publisher** 🔄 正在規劃
   - [ ] 配置 GitHub Actions OIDC
   - [ ] 移除本地 token 存儲

3. **發佈失敗恢復** 📋 設計中
   - [ ] 自動重試機制
   - [ ] 回滾支持
   - [ ] Slack 通知

4. **跨專案支持** 🎯 後續計畫
   - [ ] 支持多個 Python 項目
   - [ ] 版本號同步（如 ydk 和 clausidian）

---

## 參考資源

- [Conventional Commits](https://www.conventionalcommits.org/)
- [PyPI Trusted Publisher](https://docs.pypi.org/trusted-publishers/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Semantic Versioning](https://semver.org/)

---

## 相關技能

- `/triple-publish` — 多渠道發佈協調
- `/vault-mining-feedback` — Vault 反饋循環
- `/version-sync` — 跨項目版本同步（計畫中）
