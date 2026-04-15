---
title: "feat: Phase 4 — Data Insights & Advanced Analytics"
type: feat
status: active
date: 2026-04-15
---

# Phase 4 — Data Insights & Advanced Analytics

## Overview

Phase 3 建立了完整的多页面分析和反馈收集基础（冲突检测、一致性评分、用户反馈）。Phase 4 将这些**原始数据**转变为**可操作的洞察**，通过高级分析、趋势预测和性能追踪，帮助编辑做出数据驱动的优化决策。

**核心转变**：
- 从"收集数据"→ "分析 + 可视化 + 预测"
- 从"单一指标"→ "多维度评分（CTR、排名、覆盖度）"
- 从"手工批量操作"→ "自动推荐 + 队列处理"
- 从"即时 API"→ "缓存 + 预计算聚合"

---

## Problem Frame

### 用户问题
1. **数据过载无洞察** — 有 100 个页面的冲突报告，但不知道优先解决哪个
2. **缺乏性能反馈** — 生成 TDK 后，编辑无法看到其在搜索结果中的实际表现
3. **无自动推荐** — 哪些页面应该合并？哪些应该分化？需要系统建议
4. **批量操作困难** — 为 500 个页面手工生成 TDK，需要自动化

### 业务机会
1. **优先级排序** — 按"冲突影响 × 流量损失"排名页面，指导编辑逐个修复
2. **性能仪表板** — 实时追踪 TDK 变更对搜索排名的影响
3. **智能推荐** — "这 3 个页面应该合并"、"这 5 个关键词有机会"
4. **异步批量处理** — 队列系统处理大规模 TDK 生成（不阻塞 UI）

---

## Requirements Trace

- **R1**: 高级分析服务 — 跨多页面的聚合统计（冲突总数、覆盖度、一致性）
- **R2**: 性能评分模型 — 综合指标 (conflict_severity × page_importance × edit_recency)
- **R3**: 异步队列系统 — 支持 500+ 页面的批量 TDK 生成（BullMQ / 简单内存队列）
- **R4**: 推荐引擎 — "应该修复的页面对"、"高价值关键词"、"聚类建议"
- **R5**: 分析仪表板 API — 返回分组、排序、分页的洞察数据
- **R6**: 缓存层 — 预计算常见聚合，减少实时查询压力
- **R7**: 时间序列追踪 — TDK 变更日志 + SERP 排名变化记录（支持后续对标）
- **R8**: 向后兼容** — Phase 3 现有 API 无破坏性变更

---

## Scope Boundaries

**明确包括**：
- 多维度聚合统计（按项目、主题、时间）
- 冲突优先级排序和推荐
- 简单内存队列用于批量操作（MVP）
- 性能评分模型（规则驱动，非 ML）
- 仪表板数据 API（聚合、分组、排序）
- 预计算缓存（Redis 或内存）

**明确不包括**：
- 机器学习模型训练（需大量历史数据）
- 实时 WebSocket 推送（Phase 5）
- 高级可视化前端（单独的 React dashboard 库）
- 与外部 SEO 工具的集成（Ahrefs、SEMrush 等）
- 移动端仪表板（Phase 6）

---

## Key Technical Decisions

| 决策 | 选项 | 选中 | 理由 |
|------|------|------|------|
| **队列系统** | Bull MQ / 本地内存队列 / 数据库轮询 | 本地内存队列 | MVP 快速启动，<10K 任务足够；后期升级 Bull/Redis |
| **缓存策略** | Redis / 应用内存 / 数据库视图 | 应用内存 + 简单过期 | 个人使用，无需 Redis；规模大后升级 |
| **性能评分** | 规则驱动 / ML 模型 | 规则驱动 | 数据不足，规则更透明可控 |
| **推荐算法** | 启发式 / 聚类 / 图算法 | 启发式 (快速) + 简单聚类 | 结果可解释，计算开销小 |
| **分析范围** | 实时计算 / 预计算快照 | 混合 | 小数据集实时，大操作预计算 |
| **时间序列** | 完整审计表 / 采样日志 | 采样日志 (定期快照) | 节约存储，保留关键事件 |

---

## Implementation Units

### P4.1 — 高级分析服务 (2-3 小时)

**Goal**: 实现多维度聚合统计，支持项目级、主题级、时间段的分析查询

**Files**:
- `backend/src/services/analytics/analyticsService.ts` ← 新建
- `backend/src/api/tdk.ts` ← 添加分析端点
- `backend/tests/services/analytics/analyticsService.test.ts` ← 新建

**Approach**:

```typescript
// analyticsService.ts — 3 个核心方法
interface ProjectAnalytics {
  projectId: string;
  totalClusters: number;
  generatedCount: number;
  conflictCount: number;
  avgCoherence: number;
  topicsWithHighConflict: Array<{ topicGroup, conflictCount, severity }>;
}

class AnalyticsService {
  // 1. getProjectAnalytics(projectId) → ProjectAnalytics
  // 2. getClusterScoring(projectId) → Array<{ clusterId, score, reason }>
  // 3. getTimeSeriesStats(projectId, days=30) → Array<{ date, generated, conflicts }>
}
```

**Test scenarios**:
1. 项目无数据 → 返回 zero values
2. 混合数据（3 个集群，2 个冲突）→ 正确聚合
3. 按时间过滤 → 仅返回指定范围内的记录

**Verification**: 端点返回正确的聚合结果 + 5 个单元测试通过

---

### P4.2 — 队列系统（批量处理）(2-3 小时)

**Goal**: 实现简单的内存任务队列，支持异步批量 TDK 生成，不阻塞 UI

**Files**:
- `backend/src/services/queue/taskQueue.ts` ← 新建
- `backend/src/api/tdk.ts` ← 添加 POST /batch-tdk 端点
- `backend/tests/services/queue/taskQueue.test.ts` ← 新建

**Approach**:

```typescript
// taskQueue.ts — 最小化实现
interface Task {
  id: string;
  type: "generate-tdk";
  clusterIds: string[];
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Date;
  result?: Array<{ clusterId, success, tdk?, error? }>;
}

class TaskQueue {
  // 1. enqueueTask(task) → task.id
  // 2. processNext() → 后台处理，不阻塞
  // 3. getTaskStatus(taskId) → Task
  // 4. cancelTask(taskId) → boolean
}
```

**API Endpoint**:
```bash
POST /api/projects/{projectId}/batch-tdk
Body: { clusterIds: [...], topic: "...", keywords: [...] }
Response: { taskId, status: "enqueued", estimatedWait: "5 min" }

GET /api/projects/{projectId}/batch-tdk/{taskId}
Response: { status, completed, failed, results: [...] }
```

**Test scenarios**:
1. 入队 3 个任务 → 正确分配 ID
2. 处理队列 → 依次执行，状态更新
3. 查询任务进度 → 返回当前状态
4. 取消任务 → 移出队列

**Verification**: 端点支持入队、查询、取消 + 6 个测试通过

---

### P4.3 — 推荐引擎 (2-3 小时)

**Goal**: 基于分析数据生成可操作的推荐（合并建议、关键词机会、修复优先级）

**Files**:
- `backend/src/services/recommendations/recommendationEngine.ts` ← 新建
- `backend/src/api/tdk.ts` ← 添加 GET /recommendations 端点
- `backend/tests/services/recommendations/engine.test.ts` ← 新建

**Approach**:

```typescript
// 3 种推荐类型
interface Recommendation {
  type: "merge" | "differentiate" | "high-value-keyword";
  priority: "high" | "medium" | "low";
  affectedClusters: string[];
  reason: string;
  suggestedAction: string;
}

class RecommendationEngine {
  // 1. getMergeRecommendations(projectId) 
  //    → Jaccard > 0.8 的页面对 → "应该合并"
  // 2. getDifferentiateRecommendations(projectId)
  //    → Jaccard 0.4-0.8 的页面对 → "应该分化关键词"
  // 3. getKeywordOpportunities(projectId)
  //    → 高频关键词未覆盖的集群 → "应该添加这个关键词"
}
```

**Recommendation Scoring**:
```
priority = min(
  conflict_severity × (1 + traffic_importance),
  keyword_opportunity_score,
  recency_boost (如果最近修改过)
)
```

**Test scenarios**:
1. 5 个集群，2 对高冲突 → 返回 2 个 merge 推荐
2. 10 个集群，3 个关键词机会 → 返回优先级排序的建议
3. 无冲突数据 → 返回空列表

**Verification**: 推荐端点返回排序建议 + 5 个测试通过

---

### P4.4 — 缓存 + 预计算 (1-2 小时)

**Goal**: 为高频聚合查询添加缓存，减少重复计算

**Files**:
- `backend/src/services/cache/cacheService.ts` ← 新建
- `backend/src/api/tdk.ts` ← 集成缓存（分析端点）

**Approach**:

```typescript
// 简单的应用内存缓存（TTL 基础）
class CacheService {
  private cache = new Map<string, { data, expiresAt }>();

  // 1. get(key) → 如果未过期返回，否则返回 null
  // 2. set(key, value, ttlMinutes) → 存储带过期时间
  // 3. invalidate(pattern) → 清除匹配的 key（如 "project:*"）
}
```

**缓存键规范**:
- `analytics:project:{projectId}` (TTL: 5 分钟)
- `recommendations:project:{projectId}` (TTL: 10 分钟)
- `timeseries:project:{projectId}` (TTL: 30 分钟)
- 触发器：新 TDK 生成、反馈提交时自动清除相关缓存

**Test scenarios**:
1. 缓存 hit/miss 正确
2. TTL 过期后返回 null
3. 手动 invalidate 清除缓存

**Verification**: 缓存运行正确 + 3 个测试通过

---

### P4.5 — 分析仪表板 API (1-2 小时)

**Goal**: 整合 P4.1-P4.4，暴露统一的分析 API，支持前端仪表板

**Files**:
- `backend/src/api/analytics.ts` ← 新建（独立路由）
- `backend/tests/api/analytics.test.ts` ← 新建

**API Endpoints**:

```bash
# 1. 项目概览
GET /api/projects/{projectId}/analytics/overview
Response: {
  totalClusters, generatedCount, conflictCount, avgCoherence,
  topicsWithHighConflict: [...], recentChanges: [...]
}

# 2. 集群评分榜单
GET /api/projects/{projectId}/analytics/cluster-scores?sort=score&limit=20
Response: Array<{
  clusterId, title, score, reasons: ["conflict_high", "no_tdk_yet"],
  conflictCount, coherenceScore
}>

# 3. 推荐列表
GET /api/projects/{projectId}/analytics/recommendations?type=merge
Response: Array<Recommendation>

# 4. 时间趋势
GET /api/projects/{projectId}/analytics/timeseries?days=30
Response: Array<{ date, generated, conflicts, avgScore }>

# 5. 批量任务状态
GET /api/projects/{projectId}/batch-tasks
Response: Array<{ taskId, status, progress, createdAt }>
```

**Test scenarios**:
1. 空项目 → 返回 zero values
2. 完整项目 → 返回所有聚合指标
3. 推荐过滤 → 按类型返回正确的子集
4. 时间范围 → 支持按天数过滤

**Verification**: 所有端点返回正确格式 + 8 个测试通过

---

### P4.6 — 测试与集成 (1-2 小时)

**Goal**: 确保 P4.1-P4.5 整合无误，所有新端点通过集成测试

**Files**:
- `backend/tests/integration/analytics-workflow.test.ts` ← 新建
- `backend/tests/api/analytics.test.ts` ← 新建

**Test Scenarios**:
1. 完整工作流：生成 TDK → 冲突检测 → 聚合分析 → 推荐
2. 缓存有效性：第一次查询计算，第二次返回缓存值
3. 队列处理：入队 → 处理 → 完成，状态正确转移
4. 时间序列：生成多条数据，按时间正确聚合

**Verification**: 所有新测试通过（预计 15+ 个）

---

## Implementation Order & Dependencies

```
P4.1 (AnalyticsService)
    ↓
P4.4 (CacheService — 依赖 P4.1)
    ↓
P4.2 (TaskQueue) — 独立，并行
    ↓
P4.3 (RecommendationEngine — 依赖 P4.1)
    ↓
P4.5 (Analytics API — 依赖 P4.1, P4.2, P4.3, P4.4)
    ↓
P4.6 (Integration Tests)
```

**建议执行顺序**:
1. 先做 P4.1 + P4.4（核心分析 + 缓存）
2. 并行 P4.2（队列）
3. 然后 P4.3（推荐）
4. 最后 P4.5 + P4.6（API 整合 + 测试）

---

## Testing Strategy

**单元测试**:
- AnalyticsService: 8 tests (聚合、时间过滤、边界情况)
- TaskQueue: 6 tests (入队、处理、状态)
- RecommendationEngine: 7 tests (推荐类型、优先级)
- CacheService: 5 tests (hit/miss/TTL/invalidate)

**集成测试**:
- 完整工作流: 5 tests (端到端场景)
- API 契约: 8 tests (响应格式、错误处理)

**预期**: ~40 个新测试，总测试数 297 → 337+

---

## Acceptance Criteria

1. ✅ 分析服务返回正确的聚合数据（≥3 个查询类型）
2. ✅ 队列系统支持入队、查询、处理（≥5 个任务并发）
3. ✅ 推荐引擎生成可操作的建议（≥3 种推荐类型）
4. ✅ 缓存减少重复计算（命中率 >80% 在实际使用中）
5. ✅ 所有新 API 端点通过集成测试
6. ✅ 性能：聚合查询 <500ms (小数据集)，队列处理 <2s per task
7. ✅ 向后兼容：Phase 3 API 无破坏性变更

---

## Branch & Timeline

**Branch**: feat/phase4-data-insights  
**Estimated time**: 10-14 小时（取决于并行度）  
**Target commit**: 按 P4.1 → P4.6 顺序，每单元 1 个 commit

---

## Success Metrics

After Phase 4 completion:

| Metric | Target |
|--------|--------|
| 测试总数 | 340+ |
| 分析端点 | 5+ |
| 推荐类型 | 3+ |
| 缓存命中率 | >80% |
| API 响应时间 | <500ms (常见查询) |
| 队列吞吐量 | >100 tasks/hour |

---

**Last updated**: 2026-04-15
**Status**: Ready for implementation
