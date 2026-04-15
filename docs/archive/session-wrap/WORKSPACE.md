# Workspace 快速參考

## 三個活躍項目

### 🔴 P1：dexapi（YDAPI 主項目）
```
位置: projects/production/dexapi/
開發語言: JavaScript/Node.js
狀態: 🟢 Active
最後更新: 2026-03-25
Commits: 20

快速進入:
  cd projects/production/dexapi
  npm run dev          # 假設有此指令
  npm test
```

### 🟡 P2：test-ydapi（YDAPI 測試環境）
```
位置: projects/production/test-ydapi/
開發語言: JavaScript/Node.js
狀態: 🟢 Active
最後更新: 2026-03-25
Commits: 18
規模: 3264 files, 137M

快速進入:
  cd projects/production/test-ydapi
  npm run test         # 假設有此指令
```

### 🟠 P3：watermark-0324（APEX 工具）
```
位置: projects/production/watermark-0324/
開發語言: 多語言（APEX 自治系統）
狀態: 🟢 Maintained
最後更新: 2026-03-25
Commits: 25
特點: 含完整 SDD context + dev/specs

快速進入:
  cd projects/production/watermark-0324
  # 查看 CLAUDE.md 了解特定指令
```

## 知識庫

### Obsidian 本地庫
```
位置: .obsidian-vault/
用途: 項目筆記、決策記錄、工作流程

打開:
  code .obsidian-vault
  
瀏覽:
  _index.md           # 知識庫入口
  projects/           # 項目筆記
  areas/              # 知識領域
  resources/          # 參考資料
```

## Memory System

```
位置: /Users/dex/.claude/projects/-Users-dex-YD-2026/memory/
用途: 會話持久化、項目狀態

查看:
  cat /Users/dex/.claude/projects/-Users-dex-YD-2026/memory/MEMORY.md
```

## 快速命令

### 激活別名（首次執行）
```bash
source ~/YD\ 2026/.zshrc-workspace
```

### 常用快速命令
```bash
p1              # 進入 dexapi
p2              # 進入 test-ydapi
p3              # 進入 watermark 0324
pw              # 進入工作區根目錄
kb              # 打開知識庫
mem             # 查看 Memory 狀態

dev1            # 啟動 dexapi 開發模式
test1           # 運行 dexapi 測試
dev2            # 啟動 test-ydapi 開發模式
test2           # 運行 test-ydapi 測試

yd-status       # 查看工作區狀態
yd-sync         # 同步工作區
```

## 工作流文檔

- **[CI/CD 標準](`.obsidian-vault/areas/ci-cd-standards.md`)** — 統一工作流和最佳實踐
- **[Workspace 決策](`.obsidian-vault/areas/workspace-decisions.md`)** — 架構決策和優化日誌
- **[故障排除](`.obsidian-vault/areas/troubleshooting.md`)** — 常見問題快速修復

## 歸檔結構

```
Archived/
├── projects/      # 舊項目（sub2api, quickstart 等）
├── tools/         # 舊工具和技能（gstack, skills 等）
└── references/    # 工作區歷史（workspace-0323, workspace-0325）
```

## 快速檢查表

- [x] 知識庫 `.obsidian-vault` 已同步
- [x] 三個項目狀態正常
- [x] Memory files 最新
- [x] 快速命令別名已配置
- [x] CI/CD 工作流已統一
- [x] 故障排除指南已編寫

---

**最後優化：** 2026-03-26
*需要詳細配置？見 `CLAUDE.md`*
