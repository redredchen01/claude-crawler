---
title: YD 2026 Changelog
type: resource
tags: [changelog, reference, releases]
created: 2026-03-26
updated: 2026-04-07
status: active
heat: cool
summary: "YD 2026 工作區版本歷史與發佈記錄"
---

# Changelog

YD 2026 工作區的版本歷史。

格式遵循 [Keep a Changelog](https://keepachangelog.com/) 約定。

---

## [3.3.0] - 2026-03-26

### Added
- **Phase 3 文檔層級化**
  - 添加 `projects/README.md` - 項目目錄總覽
  - 添加 `projects/production/README.md` - 生產項目指南
  - 添加 `projects/tools/README.md` - 工具項目指南
  - 添加 `projects/experimental/README.md` - 實驗項目指南
  - 添加 `docs/DEVELOPMENT.md` - 完整開發指南（974 行）

### Changed
- 更新 CLAUDE.md 以反映新的項目層級結構
- 更新 WORKSPACE.md 中所有項目路徑
- 更新 .zshrc-workspace 別名系統
  - `p1`, `p2`, `p3` 指向新的 projects/production/ 路徑
  - 新增 `pj` 別名快速進入 projects/ 目錄

### Improved
- 項目組織文檔樹化（2 層級架構）
- 開發流程文檔完整化
- 新開發者快速上手資料

## [3.4.0] - 2026-03-30

### Changed
- 將工作區主入口重新對齊到真實活躍項目
  - `p1` → `projects/production/gwx`
  - `p2` → `projects/production/claude_code_telegram_bot`
  - `p3` → `projects/experimental/NS_0327`
- 重寫 `CLAUDE.md`、`PROJECTS_INFO.md`、`docs/WORKSPACE_STRUCTURE.md`、`docs/ARCHITECTURE.md`
- 修正 README 與腳本中的文檔路徑，統一指向 `docs/`

### Fixed
- 移除把使用者帶到空殼目錄的舊別名與舊主項目說明
- 標記 `web/` 與 `server/` 相關說明為歷史資料，不再假定當前工作區存在

---

## [3.2.0] - 2026-03-26

### Added
- **Phase 2 項目層級分離**
  - 創建 `projects/` 統一項目目錄
  - `projects/production/` - P1/P2/P3 主項目
  - `projects/tools/` - 開發工具
  - `projects/experimental/` - 試驗環境
  - 添加 `PROJECTS.md` - 統一項目管理文檔

### Changed
- 遷移項目到層級結構
  - dexapi → projects/production/dexapi
  - test-ydapi → projects/production/test-ydapi
  - watermark 0324 → projects/production/watermark-0324
  - session-wrap-backend → projects/tools/
  - sub2api-deploy → projects/experimental/


### Improved
- 項目管理清晰度
- 開發環境可視性

---

## [3.1.0] - 2026-03-26

### Added
- **Phase 1 目錄結構優化**
  - 創建 `docs/` 文件夾
  - 創建 `scripts/` 文件夾
  - 添加 `docs/WORKSPACE_STRUCTURE.md` - 優化記錄

### Changed
- 移動 8 個 markdown 文檔到 `docs/`
- 移動 4 個 shell 腳本到 `scripts/`
- 重命名 watermark 0324 為 watermark-0324（統一命名）

### Fixed
- 增強 `.gitignore` - 添加 logs, database, temp 規則

### Improved
- 根目錄清潔度（36 項 → 15 項）
- 文檔組織結構

---

## [3.0.0] - 2026-03-24

### Added
- 新的 session-wrap-backend Phase 3 實現
- 多 Agent 雲同步後端
- Docker 部署配置
- 增強的文檔和部署指南

### Changed
- 升級工作區配置系統
- 改進 CI/CD 流程

---

## [2.0.0] - 2026-03-01

### Added
- Obsidian 知識庫遷移
- Sub-Agents 統一配置（Codex, Cline, Kilo, OpenCode, Gemini）
- 工作區自動化脚本

### Changed
- 重組 Archived 結構
- 更新別名系統

---

## [1.0.0] - 2026-02-15

### Added
- 初始工作區結構
- 三個主項目（P1/P2/P3）
- 基礎配置和文檔

---

## Future Roadmap

### Phase 4（計劃中）
- [ ] API 文檔生成（Swagger/OpenAPI）
- [ ] 架構文檔完善
- [ ] 貢獻指南（CONTRIBUTING.md）
- [ ] 故障排除 Wiki（TROUBLESHOOTING.md）

### Phase 5（考慮中）
- [ ] CI/CD 流程優化
- [ ] 監控和日誌集中化
- [ ] 性能基準測試
- [ ] 安全審計流程

---

## 版本說明

### 語義化版本控制

格式：`MAJOR.MINOR.PATCH`

- **MAJOR** - 工作區結構大幅改變
- **MINOR** - 新功能或顯著改進
- **PATCH** - Bug 修復或小改進

---

## 升級指南

### 從 3.2.0 升級到 3.3.0

1. 激活新的別名系統
   ```bash
   source ~/.zshrc-workspace
   ```

2. 驗證項目路徑
   ```bash
   p1 && git status  # 應該進入 projects/production/gwx
   ```

3. 閱讀新文檔
   - 工作區：讀 `PROJECTS_INFO.md`
   - 貢獻者：讀 `docs/CONTRIBUTING.md`
   - 結構：讀 `docs/WORKSPACE_STRUCTURE.md`

### 從 3.1.0 升級到 3.2.0

**重要變更：**
- 項目已遷移到 `projects/` 目錄
- 更新所有項目引用

```bash
# 舊路徑已不再有效
p1          # 自動更新到新位置

# 更新本地設置（如有）
cd projects/production/gwx
# 重新配置任何硬編碼路徑
```

---

## Breaking Changes

### v3.2.0
- 項目路徑變更
  - 舊：`./dexapi` → 新：`./projects/production/dexapi`
  - 舊：`./watermark 0324` → 新：`./projects/production/watermark-0324`

### v3.4.0
- 工作區主入口變更
  - 舊：`p1`/`p2`/`p3` 指向空殼歷史目錄
  - 新：`p1`=`gwx`，`p2`=`claude_code_telegram_bot`，`p3`=`NS_0327`

**遷移步驟：**
1. 更新本地腳本和配置中的路徑
2. 激活更新的別名系統：`source ~/.zshrc-workspace`
3. 驗證 CI/CD 配置（通常自動處理）

### v3.1.0
- 腳本位置變更
  - 舊：根目錄的 `*.sh` → 新：`scripts/` 目錄
  - package.json 中的 bin 路徑已更新

---

## 已知問題

### 當前版本無已知問題

如果發現問題，請創建 Issue 報告。

---

## 貢獻

見 [CONTRIBUTING.md](CONTRIBUTING.md)

---

## License

MIT

---

**最後更新：** 2026-03-30
