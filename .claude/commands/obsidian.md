Obsidian 知识库管理 — 根据用户意图自动路由到对应子命令。

所有操作通过 `clausidian` CLI 执行，vault 路径：`/Users/dex/YD 2026/obsidian`

## 意图路由

| 用户意图 | 路由到 | CLI 命令 |
|---------|--------|---------|
| 写日记/今日日记 | /journal | `clausidian journal` |
| 创建笔记 | /note | `clausidian note` |
| 快速记录想法 | /capture | `clausidian capture` |
| 搜索/查找 | /search | `clausidian search` |
| 列出/浏览 | /list | `clausidian list` |
| 周/月回顾 | /review | `clausidian review` |
| 健康检查 | /health | `clausidian health + orphans + broken-links + duplicates + stats` |
| 重命名 | /rename | `clausidian rename` |
| 移动笔记 | /move | `clausidian move` |
| 批量操作 | /batch | `clausidian batch` |
| 孤立笔记 | /orphans | `clausidian orphans` |
| 查看反向链接 | /backlinks | `clausidian backlinks <note>` |
| 标签管理 | /tags | `clausidian tag list/rename` |
| 统计 | 直接执行 | `clausidian stats` |
| 知识图谱 | 直接执行 | `clausidian graph` |

## 路由规则

1. 解析用户输入，匹配上表中的意图关键词
2. 所有 CLI 命令自动附加 `--vault '/Users/dex/YD 2026/obsidian'`
3. 如果意图不明确，运行 `clausidian list --recent 7 --vault '/Users/dex/YD 2026/obsidian'` 显示最近 7 天活动
4. 多意图时按顺序依次执行（如「写日记并检查健康度」→ journal + health）

## 自动化（无需手动触发）

- **PostToolUse hook**: 编辑 .md 后自动 sync 索引
- **Stop hook**: 会话结束自动 session-stop + health check
- **launchd**: daily 08:00 / weekly Sun 20:00 / monthly 1st 20:00

## 子命令参考

子命令定义位于 `/Users/dex/YD 2026/obsidian/.claude/commands/`：
`backlinks` `batch` `capture` `health` `journal` `list` `move` `note` `orphans` `rename` `review` `search` `tags`

$ARGUMENTS
