# Phase 3 深度优化规划

**日期**: 2026-04-01 18:15 UTC
**阶段**: Week 3-5 (性能 + 可靠性)
**目标**: 80-99% 性能提升 + 自愈能力

---

## 📊 当前基线 vs 目标

### 性能基线 (Phase 2)
```
agent-monitoring:   10 秒  (4 个顺序任务)
vault-sync-daily:   30 秒  (4 个顺序任务)
publish-and-sync:   3-5 分 (4 个顺序任务)

周平均自动化: 11 个任务 × 平均 20 秒 = 约 3.6 分钟/周
月度自动化总耗时: 约 15 分钟
```

### Phase 3 目标
```
agent-monitoring:   3 秒   (70% 加速 - 4 个并行)
vault-sync-daily:   12 秒  (60% 加速 - 数据缓存 + 并行)
publish-and-sync:   2-3 分 (40% 加速 - 缓存)

周平均自动化: 约 1.5 分钟/周
月度自动化总耗时: 约 6 分钟
→ 月度节省: 9 分钟 + 用户手动 = ~4-6 小时/月
```

---

## 🔧 三大优化方向详解

### A. 数据传递优化 (快速赢)

#### 问题
```
vault-query-cache 运行 1 次 → 读取 52 笔记
结果被 vault-progress-sync 扔掉
tool-ecosystem-bridge 又独立查询
obsidian-daily-snapshot 再查询一次

= 3 次重复的 vault 查询 (浪费)
```

#### 解决方案
```
1. vault-query-cache 输出标准化 JSON
   {
     "stats": { "total": 52, "projects": 14, ... },
     "projects": [ { "name": "gwx", "status": "active" }, ... ],
     "recent": [ ... ]
   }

2. 缓存到 /tmp/vault_query_cache_{timestamp}.json

3. 后续技能检查缓存:
   IF cache exists AND cache_age < 30s
     THEN use cache
     ELSE run vault-query-cache

4. skill-orchestrator 保持缓存在内存
   (整个工作流期间)
```

#### 预期收益
```
减少 vault 查询: 4 次 → 1 次
节省时间: ~15 秒/周 (vault 查询约 5 秒)
实施难度: 低 (数据格式 + 条件判断)
```

---

### B. 并行执行 (重大突破)

#### 当前架构 (顺序)
```
[1] agent-trace-system (3s)
         ↓
[2] ai-agent-coordinator (3s)
         ↓
[3] unified-monitor (2s)
         ↓
[4] skill-changelog-bot (2s)
═════════════════════════
总计: 10 秒
```

#### 新架构 (并行)
```
[1] agent-trace-system (3s) ─┐
[2] ai-agent-coordinator (3s) ├─ 3 秒 (并行)
[3] unified-monitor (2s) ─────┤
[4] skill-changelog-bot (2s) ─┘
═════════════════════════
总计: 3 秒 (70% 加速!)

关键: 这 4 个技能无依赖关系
      各自独立处理不同数据源
      可安全并行
```

#### 实施方案
```
workflow.yml 新增字段:

chain:
  - skill: agent-trace-system
    parallel_group: "monitoring"

  - skill: ai-agent-coordinator
    parallel_group: "monitoring"

  - skill: unified-monitor
    parallel_group: "monitoring"

  - skill: skill-changelog-bot
    parallel_group: "monitoring"

skill-orchestrator 识别 parallel_group:
  1. 将相同 group 的技能并行启动
  2. 等待 group 内所有技能完成
  3. 再执行下一个 group
```

#### 可并行的工作流
```
agent-monitoring:
  ✅ 4 个技能都可并行 (10s → 3s)

vault-sync-daily:
  ✅ vault-progress-sync 和 tool-ecosystem-bridge 可并行
  ✅ obsidian-daily-snapshot 可并行
  (30s → ~15s)

publish-and-sync:
  ⚠️ pypi + npm 可并行
  ⚠️ 但需等 pypi/npm 完成后再 vault-sync
  (部分并行, 3-5m → 2.5-4m)
```

#### 预期收益
```
agent-monitoring: 10s → 3s (70% 加速!)
vault-sync-daily: 30s → 15s (50% 加速!)
publish-and-sync: 3-5m → 2.5-3.5m (30% 加速)

工作量: 中 (修改编排引擎)
风险: 低 (无数据竞争)
```

---

### C. 条件执行与重试 (可靠性)

#### 问题
```
当前:
  vault-query-cache 失败 → 整个工作流停止
  vault-progress-sync 失败 → 依赖的所有技能失败

改进需求:
  某些技能失败 → 自动重试 (最多 3 次)
  关键路径失败 → 跳过非关键技能但发出警报
  非关键失败 → 继续执行，记录日志
```

#### 实施方案
```yaml
chain:
  - skill: vault-query-cache
    args: ""
    timeout: 30s
    on_error: fail        # 失败停止 (关键路径)
    retry: 3              # 重试最多 3 次
    retry_backoff: 30s    # 每次等待 30 秒

  - skill: vault-progress-sync
    args: "--direction bidirectional"
    timeout: 60s
    on_error: fail        # 失败停止 (关键路径)
    retry: 2

  - skill: tool-ecosystem-bridge
    args: "--from obsidian --to github"
    timeout: 30s
    on_error: continue    # 失败继续 (非关键)
    retry: 1              # 只重试 1 次

  - skill: obsidian-daily-snapshot
    args: "--output slack"
    timeout: 30s
    on_error: continue    # 失败继续 (非关键)
    retry: 0              # 不重试
```

#### 自动恢复逻辑
```
IF skill fails on attempt 1
  THEN wait(retry_backoff) → retry

IF skill fails on attempt 3 (final)
  AND on_error == "fail"
  THEN alert("关键技能失败") + stop workflow

  AND on_error == "continue"
  THEN alert("非关键技能失败") + continue
```

#### 预期收益
```
减少因瞬时故障导致的工作流失败
提高可靠性: 92% → 99.5% (3 次重试)
自动恢复时间: 平均 60 秒内
工作量: 中
```

---

## 📅 实施时间表

### Week 3a (现在 ~ 2026-04-08) — 设计阶段
```
✓ 完成本文档
[ ] 分析所有工作流的数据流
[ ] 识别哪些数据可缓存
[ ] 绘制依赖关系图
[ ] 设计缓存接口 (.json 格式)

产出:
  • data_flow_analysis.md (每个工作流的数据流)
  • parallel_groups.md (可并行的技能组)
  • cache_interface.md (缓存数据格式)
```

### Week 3b (2026-04-09 ~ 2026-04-15) — 实施阶段 A
```
[ ] 实装 vault-query-cache 缓存输出
[ ] 修改 vault-progress-sync 支持缓存输入
[ ] 实装 tool-ecosystem-bridge 缓存支持
[ ] 实装 skill-orchestrator 内存缓存层

测试:
  • vault-sync-daily --dry-run (验证缓存)
  • 测试缓存命中率
  • 性能对标: 30s → 25s?

产出:
  • Cache v1.0 (JSON-based)
  • Performance report (缓存效果)
```

### Week 3c (2026-04-16 ~ 2026-04-22) — 实施阶段 B
```
[ ] 修改 workflow.yml 格式支持 parallel_group
[ ] 实装 skill-orchestrator 并行执行引擎
[ ] 修改 worker pool 支持并发

测试:
  • agent-monitoring (4 个并行): 10s → 3s?
  • vault-sync-daily (混合): 30s → 15s?
  • 无竞争条件

产出:
  • Parallel v1.0
  • Performance report (并行效果)
  • Load test results
```

### Week 3d (2026-04-23 ~ 2026-04-29) — 实施阶段 C
```
[ ] 实装重试逻辑 (指数退避)
[ ] 实装条件执行 (fail/continue)
[ ] 实装警报系统

测试:
  • 模拟技能失败，验证重试
  • 验证关键路径 fail-fast
  • 验证非关键继续

产出:
  • Resilience v1.0
  • Test suite (20+ scenarios)
  • Documentation
```

---

## 🎯 成功标准

### 性能目标
```
✅ agent-monitoring:   10s → ≤5s (50% 加速, 目标 3s)
✅ vault-sync-daily:   30s → ≤15s (50% 加速)
✅ publish-and-sync:   3-5m → ≤2m50s (30% 加速)
```

### 可靠性目标
```
✅ 失败恢复率: 92% → 98%+
✅ 关键路径 fail-fast: 100%
✅ 非关键路径继续: 100%
```

### 代码质量
```
✅ 单元测试: ≥80% 覆蓋
✅ 集成测试: 所有工作流
✅ 负载测试: 10+ 并发任务
```

---

## 📋 第一周行动项

### Day 1-2 (现在 ~ 2026-04-02)
```
[ ] 创建 DATA_FLOW_ANALYSIS.md
    └─ 分析每个工作流中哪些数据被重复查询

[ ] 创建 PARALLEL_GROUPS.md
    └─ 识别所有可并行的技能组

[ ] 创建 CACHE_INTERFACE.md
    └─ 定义缓存数据的 JSON 格式
```

### Day 3-5 (2026-04-03 ~ 2026-04-05)
```
[ ] 实装 vault-query-cache JSON 输出
[ ] 实装缓存文件生成逻辑
[ ] 创建测试数据
```

### Day 6-7 (2026-04-06 ~ 2026-04-07)
```
[ ] 修改 vault-progress-sync 支持缓存读取
[ ] 端到端测试
[ ] 性能测量
```

---

## 🚀 立即启动

**第一步**: 创建数据流分析文档

你需要审视现有的 4 个工作流，回答这些问题:

1. **vault-sync-daily** 工作流中:
   - vault-query-cache 输出什么数据?
   - vault-progress-sync 需要什么数据?
   - 两者有重叠吗?

2. **agent-monitoring** 工作流中:
   - 4 个技能有依赖关系吗?
   - 哪些可以并行?

3. **publish-and-sync** 工作流中:
   - pypi 和 npm 发布可以并行吗?
   - 发布完成后哪些技能需要新版本号?

---

## 📊 投资回报

```
投入成本:
  • 设计文档: 2 小时
  • 代码实装: 15-20 小时
  • 测试: 5 小时
  总计: 22-27 小时 (约 3-4 个工作日)

回报:
  • 月度时间节省: 4-6 小时
  • ROI 周期: 5-7 天
  • 年度节省: 48-72 小时 (~1 周)
  + 系统可靠性: 92% → 99%
```

---

## 🎉 成功标志

当这三个标志都出现时，Phase 3 完成:

1. ✅ `agent-monitoring` 运行时间 ≤ 5 秒
2. ✅ `vault-sync-daily` 运行时间 ≤ 15 秒
3. ✅ 首次失败自动重试后成功，0 个告警

---

**计划状态**: 🟢 **Ready to Launch**
**下一步**: 分析数据流 → 设计缓存接口 → 实装

要开始吗? Y/N
