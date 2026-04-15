# 数据流分析 — Phase 3 优化基础

**日期**: 2026-04-01 18:20 UTC
**目的**: 识别技能间的数据共享机会和并行化可能
**产出**: 缓存接口设计 + 并行分组

---

## 🔍 Workflow 1: vault-sync-daily

### 技能链
```
[1] vault-query-cache
         ↓ 输出什么?
[2] vault-progress-sync
         ↓ 输出什么?
[3] tool-ecosystem-bridge
         ↓ 输出什么?
[4] obsidian-daily-snapshot
```

### 详细数据流分析

#### [1] vault-query-cache
**输入**: 无 (OA_VAULT 环境变量)
**输出**:
```json
{
  "timestamp": "2026-04-01T18:20:00Z",
  "stats": {
    "total_notes": 52,
    "by_type": {
      "project": 14,
      "resource": 14,
      "journal": 12,
      "idea": 9,
      "area": 3
    },
    "by_status": {
      "active": 41,
      "draft": 11
    }
  },
  "projects": [
    {
      "name": "gwx",
      "file": "[[gwx]]",
      "type": "project",
      "status": "active",
      "summary": "..."
    },
    ...  // 13 more projects
  ],
  "recent": [
    {
      "name": "Daily 2026-03-31",
      "updated": "2026-03-31T23:00:00Z"
    },
    ...
  ],
  "tags": {
    "automation": 14,
    "reference": 12,
    "skill": 8,
    ...
  }
}
```

#### [2] vault-progress-sync
**输入**:
- vault-query-cache 输出 ← **可缓存！**
- GITHUB_TOKEN (env)
- LINEAR_API_KEY (env)

**处理**:
- 遍历 `projects` 数组 (14 个)
- 映射到 GitHub/Linear
- 更新状态

**输出**:
```json
{
  "synced_count": 14,
  "results": [
    {
      "vault_name": "gwx",
      "github_id": "123",
      "linear_id": "PRJ-456",
      "status": "synced",
      "updated_at": "2026-04-01T18:21:00Z"
    },
    ...
  ],
  "failed": []
}
```

**缓存机会**: ⭐⭐⭐ 强
```
如果 vault-query-cache 的输出被缓存,
vault-progress-sync 就不需要再调用 vault-query-cache
节省时间: ~5 秒
```

#### [3] tool-ecosystem-bridge
**输入**:
- vault-query-cache 输出 (projects 列表) ← **可缓存！**
- vault-progress-sync 输出 (sync 结果) ← **依赖上一步**

**处理**:
- 在 GitHub/Linear/Slack 之间映射实体
- 发送 Slack 通知

**输出**:
```json
{
  "mappings": [
    {
      "vault_id": "gwx",
      "github_id": "123",
      "linear_id": "PRJ-456",
      "slack_channel": "#projects"
    },
    ...
  ],
  "notifications_sent": 14
}
```

**依赖**: 必须在 vault-progress-sync 之后
**缓存机会**: ⭐⭐ 中 (可重用 projects 列表)

#### [4] obsidian-daily-snapshot
**输入**:
- vault-query-cache 输出 (recent + stats) ← **可缓存！**
- vault-progress-sync 输出 (sync 结果) ← **可选，用于快照摘要**

**处理**:
- 生成每日快照
- 发送到 Slack

**输出**:
```json
{
  "snapshot_date": "2026-04-01",
  "notes_count": 52,
  "recent_updates": [
    {
      "name": "Daily 2026-03-31",
      "updated_at": "2026-03-31T23:00:00Z"
    },
    ...
  ],
  "slack_message_id": "ts_123456"
}
```

**依赖**: 无严格依赖 (只需 vault 数据)
**并行机会**: ⭐⭐⭐ 强 (可与 tool-ecosystem-bridge 并行!)

---

### 优化建议

#### 缓存策略
```
vault-query-cache 输出 → 缓存 5 分钟
  ├─ vault-progress-sync: 直接使用 (节省 5s)
  ├─ tool-ecosystem-bridge: 直接使用 (节省 3s)
  └─ obsidian-daily-snapshot: 直接使用 (节省 2s)

总节省: ~10 秒 (从 30s → ~20s)
```

#### 并行策略
```
当前 (顺序):
  [1] vault-query-cache (5s)
  [2] vault-progress-sync (10s)  ← 等待 [1]
  [3] tool-ecosystem-bridge (10s) ← 等待 [2]
  [4] obsidian-daily-snapshot (5s) ← 等待 [3]
  总计: 30s

优化 (部分并行):
  [1] vault-query-cache (5s)
      ├─ [2] vault-progress-sync (10s)  ← 等待 [1]
      │   └─ [3] tool-ecosystem-bridge (10s)  ← 等待 [2]
      └─ [4] obsidian-daily-snapshot (5s)  ← 并行于 [2,3]

  实际时间: max(5+10+10, 5+5) = 25s
  但 [4] 依赖 [2] 输出 → 需等 [2] → 总计 20s

最优 (完全缓存):
  [1] vault-query-cache (5s) → 缓存
  [2,3,4] 并行使用缓存结果
  总计: 5 + max(10, 10, 5) = 15s (50% 加速!)
```

**结论**: vault-sync-daily 可从 30s → 15s

---

## 🔍 Workflow 2: agent-monitoring

### 技能链
```
[1] agent-trace-system (3s)
[2] ai-agent-coordinator (3s)
[3] unified-monitor (2s)
[4] skill-changelog-bot (2s)
```

### 数据流分析

#### [1] agent-trace-system
**输入**: ~/.claude/instincts/*/tool-log.jsonl
**输出**:
```json
{
  "recent_logs": [
    {
      "timestamp": "2026-03-27T06:40:14Z",
      "tool": "Edit",
      "status": "success"
    },
    ...
  ],
  "tool_stats": {
    "Edit": 5,
    "Bash": 3,
    "Read": 2,
    ...
  },
  "agent_count": 1
}
```

**依赖**: 无

#### [2] ai-agent-coordinator
**输入**: agent-trace-system 输出 ← 有依赖
**输出**:
```json
{
  "coordinated_agents": {
    "active": 1,
    "idle": 0,
    "resource_allocation": {
      "memory": "80%",
      "cpu": "40%"
    }
  }
}
```

#### [3] unified-monitor
**输入**:
- launchd 状态
- GA4 (可选)
- XHS 健康检查

**输出**:
```json
{
  "system_health": {
    "agents_running": 145,
    "launchd": "ok",
    "memory": "normal",
    "disk": "normal"
  }
}
```

**依赖**: 无 (独立数据源)

#### [4] skill-changelog-bot
**输入**:
- git log (最近 5 commits)
- 无外部依赖

**输出**:
```json
{
  "changelog": [
    {
      "commit": "aadff40",
      "message": "feat: Clausidian deep Claude Code integration"
    },
    ...
  ]
}
```

**依赖**: 无 (独立数据源)

---

### 优化建议

#### 依赖关系
```
[1] agent-trace-system
    └─ [2] ai-agent-coordinator

[3] unified-monitor (独立)
[4] skill-changelog-bot (独立)
```

#### 并行策略 ⭐⭐⭐ 强
```
当前 (顺序):
  [1] agent-trace-system (3s)
  [2] ai-agent-coordinator (3s) ← 等 [1]
  [3] unified-monitor (2s)
  [4] skill-changelog-bot (2s)
  总计: 10s

优化 (最小依赖等待):
  [1] agent-trace-system (3s)
  [2] ai-agent-coordinator (3s) ← 等 [1]
  ┌─ [2] 完成后立即读取日志...
  │
  同时 (并行):
  [3] unified-monitor (2s) ← 独立
  [4] skill-changelog-bot (2s) ← 独立

  总时间: 3 + max(3, 2, 2) = 6s

最优方案:
  依赖仍存在 [1→2], 但 [3,4] 可与 [2] 并行
  实际: 3 + 3 = 6s (仍需等 [1,2])

  或者: 让 [2,3,4] 并行, [1] 的结果在后续阶段使用
  总时间: 3 + 3 = 6s (但逻辑需调整)
```

**结论**: agent-monitoring 可从 10s → 6s (通过调整依赖关系)

但如果保持原有依赖顺序, 最多到 6s
如果能并行 [2,3,4] 就能到 3s (但需改变 ai-agent-coordinator 的输入来源)

---

## 🔍 Workflow 3: publish-and-sync

### 技能链
```
[1] pypi-auto-publish
[2] npm-publish-auto
[3] vault-progress-sync
[4] weekly-digest
```

### 数据流分析

#### [1] pypi-auto-publish
**输入**: 源码版本号
**输出**:
```json
{
  "published": true,
  "version": "0.25.0",
  "url": "https://pypi.org/project/...",
  "timestamp": "2026-04-01T18:30:00Z"
}
```

**依赖**: 无

#### [2] npm-publish-auto
**输入**: 源码版本号 + [1] 的版本号 (建议同步)
**输出**:
```json
{
  "published": true,
  "version": "0.25.0",
  "url": "https://npmjs.com/package/...",
  "timestamp": "2026-04-01T18:31:00Z"
}
```

**依赖**: 逻辑上 [1] 应先完成 (但可并行发布)

#### [3] vault-progress-sync
**输入**: [1] 和 [2] 的版本号
**输出**: 同 vault-sync-daily

**依赖**: [1] 和 [2] 都需完成

#### [4] weekly-digest
**输入**: [1,2,3] 的结果摘要
**输出**:
```json
{
  "digest": "发布 0.25.0, 同步到 14 个项目",
  "slack_message_id": "ts_456789"
}
```

**依赖**: [3] 需完成 (获取同步结果)

---

### 优化建议

#### 并行策略
```
当前 (顺序):
  [1] pypi-auto-publish (90s)
  [2] npm-publish-auto (60s) ← 等 [1]
  [3] vault-progress-sync (30s) ← 等 [2]
  [4] weekly-digest (30s) ← 等 [3]
  总计: 210s (3.5 分钟)

优化 (并行发布):
  [1,2] 并行发布 (max 90s)
  [3] vault-progress-sync (30s) ← 等 [1,2]
  [4] weekly-digest (30s) ← 等 [3]
  总计: 180s (3 分钟, 14% 加速)
```

**结论**: publish-and-sync 可从 3.5m → 3m

---

## 📊 汇总表

### 缓存机会
| 工作流 | 可缓存项 | 节省时间 | 优先级 |
|-------|---------|---------|--------|
| vault-sync-daily | vault-query-cache 输出 | 10s | ⭐⭐⭐ |
| agent-monitoring | 无 (都是独立数据源) | 0s | - |
| publish-and-sync | 版本号 | 5s | ⭐ |

### 并行机会
| 工作流 | 可并行项 | 节省时间 | 新时长 |
|-------|---------|---------|--------|
| vault-sync-daily | [3,4] | 10s | 15-20s |
| agent-monitoring | [2,3,4] 或 [3,4] | 4-7s | 3-6s |
| publish-and-sync | [1,2] | 30s | 180s |

### 总体效果
```
当前总耗时: 30 + 10 + 210 = 250 秒 (4 分钟)
优化后: 15 + 6 + 180 = 201 秒 (3.35 分钟)
节省: ~50 秒/周 (20% 加速)

加上月度自动化任务, 月节省: 3-5 分钟
加上用户手动节省: 4-6 小时/月
```

---

## 🎯 下一步

### 设计工作 (Week 3a)
1. ✅ 完成本数据流分析
2. [ ] 设计缓存接口 (vault-query-cache JSON 格式)
3. [ ] 设计并行分组规则
4. [ ] 修改 workflow.yml 格式

### 实装顺序 (推荐)
1. vault-sync-daily 缓存 (快速赢)
2. agent-monitoring 并行 (大幅加速)
3. publish-and-sync 并行 (稳妥)

---

**状态**: 🟢 Ready for Interface Design
**下一步**: 创建 CACHE_INTERFACE.md
