---
title: /vault-orphan-fixer Example Output
type: reference
tags: [vault, orphan-fixer, examples]
created: 2026-04-06
updated: 2026-04-06
status: active
summary: "完整的示例输出展示（Markdown + JSON）"
---

# /vault-orphan-fixer 示例输出

## 命令

```bash
/vault-orphan-fixer --threshold 75 --verbose
```

## 控制台输出示例

```
[INFO] Vault: /Users/dex/YD 2026/obsidian
[INFO] Found 143 notes
[INFO] Found 8 orphan notes
[INFO] Generated suggestions

=== Vault 孤立笔记修复完成 ===
孤立笔记数: 8 / 143 (孤立率: 5.59%)

输出:
  Markdown 报告: /Users/dex/YD 2026/docs/reports/2026-04-06-vault-orphan-analysis.md
  JSON 数据: /Users/dex/YD 2026/docs/reports/2026-04-06-vault-orphan-analysis.json

下一步:
  1. 查看报告: cat /Users/dex/YD\ 2026/docs/reports/2026-04-06-vault-orphan-analysis.md
  2. 手动添加链接或使用 --auto-link
```

## Markdown 报告结构示例

### 摘要部分

```markdown
---
title: Vault Orphan Analysis
type: report
summary: "孤立笔记分析报告 — 8 个孤立笔记，143 个活跃笔记"
---

## 摘要

| 指标 | 数值 |
|------|------|
| 总笔记数 | 143 |
| 孤立笔记数 | 8 |
| 孤立率 | 5.59% |
| 建议阈值 | 75 |
```

### 孤立笔记清单示例

```markdown
### #1. [[ga4-data-pipeline]]

- **标题**: GA4 Data Pipeline
- **类型**: project
- **建议数**: 4

**推荐关联** (按推荐分数排序):

1. [[project-ga4|GA4 Analytics Platform]] (策略: Content Relevance, 分数: 88)
2. [[analytics-automation|Analytics Automation]] (策略: Tag Match, 分数: 81)
3. [[data-pipeline|Data Pipeline Framework]] (策略: Title Similarity, 分数: 76)
4. [[reporting-system|Reporting System]] (策略: Content Relevance, 分数: 75)
```

## JSON 数据结构示例

```json
{
  "metadata": {
    "generated_at": "2026-04-06T14:23:45+08:00",
    "vault_path": "/Users/dex/YD 2026/obsidian",
    "total_notes": 143,
    "orphan_notes": 8,
    "orphan_rate": 5.59,
    "threshold": 75
  },
  "orphans": [
    {
      "orphan": "ga4-data-pipeline",
      "orphan_path": "/Users/dex/YD 2026/obsidian/projects/ga4-data-pipeline.md",
      "orphan_title": "GA4 Data Pipeline",
      "orphan_type": "project",
      "suggestion_count": 4,
      "suggestions": [
        {
          "target": "project-ga4",
          "target_title": "GA4 Analytics Platform",
          "strategy": "content_relevance",
          "score": 88,
          "link": "[[project-ga4|GA4 Analytics Platform]]"
        },
        {
          "target": "analytics-automation",
          "target_title": "Analytics Automation",
          "strategy": "tag_match",
          "score": 81,
          "link": "[[analytics-automation|Analytics Automation]]"
        }
      ]
    }
  ]
}
```

## 自动链接后的效果

运行 `/vault-orphan-fixer --auto-link` 后，孤立笔记会被修改为：

### 修改前
```markdown
---
title: GA4 Data Pipeline
type: project
tags: []
---

（原有内容）
```

### 修改后
```markdown
---
title: GA4 Data Pipeline
type: project
tags: [analytics, data, automation]
---

## 相关笔记

- [[project-ga4|GA4 Analytics Platform]] (88%)
- [[analytics-automation|Analytics Automation]] (81%)
- [[data-pipeline|Data Pipeline Framework]] (76%)
- [[reporting-system|Reporting System]] (75%)

（原有内容保持不变）
```

## 备份恢复

如果自动链接出现问题，可以恢复：

```bash
# 列出备份
ls -la /Users/dex/YD\ 2026/obsidian/.backup/

# 恢复最近的备份
cp -r /Users/dex/YD\ 2026/obsidian/.backup/20260406_142345/* \
      /Users/dex/YD\ 2026/obsidian/
```

---

**关键数据点**：
- 8 个孤立笔记，共 16 个高质量建议（分数 ≥75）
- 平均每个孤立笔记 2 个建议
- 最高分数：87（roadmap-planning）
- 最低分数：75（threshold）
