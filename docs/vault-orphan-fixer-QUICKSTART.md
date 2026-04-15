---
title: /vault-orphan-fixer Quick Start
type: guide
tags: [vault, orphan-fixer, quick-start]
created: 2026-04-06
updated: 2026-04-06
status: active
summary: "快速开始指南 — 修复 34 个 Obsidian 孤立笔记"
---

# /vault-orphan-fixer 快速开始

## 概览

`/vault-orphan-fixer` 自动扫描 Obsidian vault，识别无反向链接和标签的孤立笔记，生成智能关联建议，支持自动应用。

## 快速命令

### 1. 扫描并生成报告（基础用法）

```bash
/vault-orphan-fixer
```

输出：生成 Markdown 报告 + JSON 数据

### 2. 自动应用高信度建议

```bash
/vault-orphan-fixer --auto-link
```

自动修复分数 ≥75 的孤立笔记（含备份）

### 3. 调整严格度

```bash
/vault-orphan-fixer --threshold 50    # 更宽松
/vault-orphan-fixer --threshold 85    # 更严格
```

### 4. 测试模式（仅 5 个孤立笔记）

```bash
/vault-orphan-fixer --target-count 5 --verbose
```

## 参数参考

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--auto-link` | disabled | 自动应用建议，创建备份 |
| `--verbose` | disabled | 详细日志（[INFO] 标记）|
| `--threshold` | 75 | 建议最低分数（0-100） |
| `--output-format` | markdown | 输出格式：json\|markdown\|both |
| `--target-count` | 0 | 限制扫描前 N 个孤立笔记（0=全部） |

## 工作流示例

**月度维护 + 手动审核**:
```bash
/vault-orphan-fixer
cat /Users/dex/YD\ 2026/docs/reports/2026-04-06-vault-orphan-analysis.md
# 根据建议手动编辑孤立笔记
git commit -m "refactor: link orphan notes"
```

**快速自动修复**:
```bash
/vault-orphan-fixer --auto-link
git diff obsidian/
git commit -m "feat: auto-link orphan notes"
```

---

完整文档：`/Users/dex/.claude/commands/vault-orphan-fixer.md`
