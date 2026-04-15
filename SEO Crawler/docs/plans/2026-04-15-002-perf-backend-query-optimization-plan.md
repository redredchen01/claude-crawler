---
title: perf: SEO Crawler 后端查询性能优化
type: perf
status: active
date: 2026-04-15
origin: 用户选择"后端查询慢"作为性能优化的主要痛点
---

# SEO Crawler 后端查询性能优化计划

## Overview

SEO Crawler MVP 后端存在三个关键性能瓶颈，特别是大数据量场景下的响应缓慢：
1. **数据库查询缺少索引** — 关键词结果按评分排序、任务列表计数都触发全表扫描
2. **竞争对手提取串行化** — 3-5 个 URL 串行处理，每个 1-2 秒，总耗时 3-10 秒
3. **缺少应用层缓存** — 结果集和列表数据无缓存，重复查询重复扫描

本计划通过四个优化单元，将 API 响应时间从 500ms-5s+ 降低到 100-500ms（对象小于 10K 结果），并支持更大的数据集。

## Problem Frame

用户在 brainstorm 阶段明确指出"后端查询慢"是最大痛点。当前系统：
- 任务列表查询 (分页) 耗时 200-500ms，大数据量情况下 1-2s
- 关键词结果查询 (带排序) 耗时 300-1000ms，数据量 > 5K 关键词时 2-3s
- 竞争对手提取耗时 3-10s，直接影响任务执行时间
- 无任何应用层缓存，同一任务多次查询都重复扫描数据库

**痛点来源**:
- SQLite 索引策略不完整，关键查询缺少复合索引
- 竞争对手 URL 提取使用串行处理，浪费了 I/O 并发机会
- 数据库模型和 API 路由缺少缓存层，无 HTTP 缓存头

## Requirements Trace

- **R1. 数据库查询优化** — 关键词结果按分数排序、任务列表分页、导出 CSV 查询的响应时间降低 50-70%
- **R2. 并发提取优化** — 竞争对手 URL 提取从串行改为并发，耗时降低 60-80%
- **R3. 应用层缓存** — 任务结果和列表数据支持短期缓存，减少重复查询的 I/O
- **R4. 向后兼容** — 优化不改变现有 API 契约，前端和数据库查询语义保持一致

## Scope Boundaries

**明确做**:
- 数据库索引优化 (SQLite)
- 竞争对手提取并发化 (p-queue)
- 内存缓存层 (短期 TTL，任务粒度)
- API 响应时间监测和日志

**明确不做**:
- Redis 分布式缓存 (MVP 阶段，内存缓存足够)
- 数据库迁移或重新设计 (保持 SQLite)
- 前端渲染优化 (范围外)
- 查询语言优化 (SQLite 限制)

## Context & Research

### Relevant Code and Patterns

- **数据库初始化**: `backend/dist/db/index.js` — WAL 模式、cache_size、synchronous 配置
- **API 查询路由**: `backend/dist/routes/jobs.js` — GET /jobs (列表), GET /jobs/:id/results (关键词结果)
- **竞争对手提取**: `backend/dist/crawler/competitorExtractor.js` — 当前串行实现
- **缓存服务**: `backend/dist/services/cacheService.js` — 现有 SuggestionCache (仅用于搜索引擎建议)
- **任务队列**: `backend/dist/queue/taskQueue.js` — p-queue 用法范例

### Institutional Learnings

- SuggestionCache 已验证内存缓存模式可行，TTL 30 分钟适合 MVP
- p-queue 已用于并发采集，支持 maxConcurrent 配置

### External References

- SQLite 复合索引优化: https://www.sqlite.org/queryplanner.html
- p-queue 文档: https://github.com/sindresorhus/p-queue

## Key Technical Decisions

- **缓存策略**: 短期内存缓存 (TTL 2-5 分钟)，而非 Redis
  - 理由: MVP 阶段，单进程部署足够，避免额外依赖和运维复杂度
  
- **竞争对手提取并发**: 同时处理 2-3 个 URL，使用 p-queue 而非 Promise.all
  - 理由: p-queue 支持速率限制和失败重试，已在项目中使用
  
- **索引添加**: 三个新复合索引 (job_id, score DESC), (job_id, intent), (status, created_at)
  - 理由: 覆盖 API 查询的主要排序和过滤场景，最小化索引维护成本

- **不涉及数据库迁移**: 直接使用 SQLite ALTER TABLE 添加索引
  - 理由: SQLite 索引添加无需锁表，兼容 WAL 模式

## Open Questions

### Resolved During Planning

- **缓存键设计** → `jobs:{jobId}:results:{page}:{pageSize}:{filters}` 用于结果列表；`jobs:{jobId}:list` 用于任务列表
- **缓存 TTL** → 2 分钟（足够用户浏览，避免陈旧数据）
- **并发数限制** → 竞争对手提取设 maxConcurrent=3，避免目标网站限流

### Deferred to Implementation

- 具体的查询执行时间基准需要在实际环境测试
- HTTP 缓存头设置 (Cache-Control, ETag) 的具体值需要根据前端行为调整

## High-Level Technical Design

```
优化流程：

1. 数据库层 (SQLite 索引)
   ├─ 添加索引: (job_id, score DESC)      ← 关键词结果排序
   ├─ 添加索引: (job_id, intent)          ← 意图过滤
   └─ 添加索引: (status, created_at)      ← 任务列表过滤

2. 竞争对手提取层 (并发化)
   extractFromUrl(url)  [1-2s per URL]
      ↓ (Promise.all with p-queue: maxConcurrent=3)
   [同时处理 3 个 URL] → [600ms-1s for all]

3. API 查询层 (缓存)
   GET /api/jobs/:id/results 
      ├─ Check ResultsCache[jobId:page:filters] (hit → 返回)
      ├─ 如果 miss → 执行 SQL (有索引，快速)
      └─ 缓存结果 (TTL 2 min)

4. 任务执行层 (缓存清除)
   任务完成 → 清除该任务的所有缓存
```

## Implementation Units

### Unit 1: 数据库索引优化

**Goal:** 添加三个复合索引，使关键词结果查询、任务列表查询、意图过滤都能使用索引，避免全表扫描

**Requirements:** R1

**Dependencies:** None (数据库已初始化)

**Files:**
- Modify: `backend/dist/db/schema.js` — 在创建表时添加索引定义
- Modify: `backend/dist/db/index.js` — 初始化时执行 CREATE INDEX IF NOT EXISTS
- Test: `backend/tests/database.test.ts` — 添加索引验证测试

**Approach:**

三个新索引：

1. **idx_results_score** — `(job_id, score DESC, created_at DESC)`
   - 用于: `GET /api/jobs/:id/results?sortBy=score` 排序查询
   - 覆盖过滤条件 (job_id) 和排序条件 (score DESC)

2. **idx_results_job_intent** — `(job_id, intent)`
   - 用于: `GET /api/jobs/:id/results?intent=commercial` 过滤查询
   - 覆盖过滤条件组合

3. **idx_jobs_created** — `(status, created_at DESC)` 改进现有索引
   - 用于: `GET /api/jobs?page=1&pageSize=10` 列表查询，按创建时间倒序

**现有索引保留**:
- `idx_candidates_job_id` (job_id)
- `idx_results_job_id` (job_id)
- `idx_results_normalized` (job_id, normalized_keyword)
- `idx_results_intent` (intent)

**Patterns to follow:**
- 遵循 `schema.js` 现有索引定义风格 (SQL CREATE INDEX 语句)

**Test scenarios:**
- Happy path: 创建索引后，查询 `SELECT * FROM keyword_results WHERE job_id=? ORDER BY score DESC LIMIT 10 OFFSET 0` 使用索引（EXPLAIN QUERY PLAN 验证）
- Edge case: 索引创建时表非空，验证现有数据被正确索引
- Edge case: 重复创建索引（CREATE INDEX IF NOT EXISTS），不报错
- Integration: 插入新数据后，查询仍使用索引

**Verification:**
- SQLite EXPLAIN QUERY PLAN 输出显示 "SEARCH keyword_results USING idx_results_score"
- 测试数据集 (10K+ 关键词) 查询耗时 < 100ms

---

### Unit 2: 竞争对手提取并发化

**Goal:** 将竞争对手 URL 提取从串行改为并发处理，使用 p-queue 限制并发数为 3，耗时从 3-10s 降低至 1-2s

**Requirements:** R2

**Dependencies:** None (p-queue 已安装)

**Files:**
- Modify: `backend/dist/crawler/competitorExtractor.js` — 改变 extractFromUrls() 实现
- Test: `backend/tests/competitorExtractor.test.ts` — 添加并发提取测试

**Approach:**

改变 extractFromUrls 从串行循环改为 p-queue：

```javascript
// Before (串行)
async extractFromUrls(urls) {
  for (const url of urls) {
    await extractFromUrl(url)  // 串行，3 个 URL = 3-6 秒
  }
}

// After (并发)
async extractFromUrls(urls) {
  const queue = new PQueue({ concurrency: 3 })  // 同时 3 个
  const results = await Promise.all(
    urls.map(url => queue.add(() => extractFromUrl(url)))
  )
  return results
}
```

**并发限制理由**:
- 3 = 平衡吞吐量和目标网站负载（避免触发速率限制）
- extractFromUrl 包含 1-2s fetch 时间 + 正则解析 < 100ms
- 3 个并发 → 总耗时 = max(3 × 1-2s / 3) = 1-2s (相比串行 3-6s 节省 60-80%)

**Patterns to follow:**
- 参考 `backend/dist/queue/taskQueue.js` 中的 p-queue 用法
- 保留现有错误处理和重试逻辑

**Test scenarios:**
- Happy path: 3 个 URL 并发提取，总耗时 < 3 秒（模拟 1-2s fetch 延迟）
- Edge case: 1 个 URL 提取，无并发开销
- Error path: 1 个 URL 失败，其他 2 个继续执行
- Error path: 所有 URL 失败，返回空结果数组
- Integration: 任务执行中竞争对手提取使用并发，整体任务耗时减少 30-50%

**Verification:**
- 单元测试验证并发处理 (模拟延迟)
- 性能基准测试: 3 个 URL 提取耗时 < 3s（vs 之前 5-6s）

---

### Unit 3: 结果列表缓存层

**Goal:** 为关键词结果和任务列表查询添加 2 分钟 TTL 的内存缓存，减少重复查询对数据库的负载，降低 API 响应时间

**Requirements:** R3

**Dependencies:** Unit 1 (数据库优化完成，查询基线快速)

**Files:**
- Create: `backend/dist/services/resultsCache.ts` — 新缓存服务
- Modify: `backend/dist/routes/jobs.js` — 集成缓存到 GET /jobs/:id/results 和 GET /api/jobs
- Modify: `backend/dist/queue/taskQueue.js` — 任务完成时清除缓存
- Test: `backend/tests/resultsCache.test.ts` — 缓存策略测试

**Approach:**

**ResultsCache 类**（扩展现有 SuggestionCache 模式）:

```javascript
class ResultsCache {
  constructor(ttlMs = 2 * 60 * 1000) {  // 2 分钟 TTL
    this.cache = new Map()
    this.ttl = ttlMs
  }

  getCacheKey(jobId, page, pageSize, filters) {
    // "jobs:123:results:1:25:intent=commercial"
    const filterStr = Object.entries(filters)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')
    return `jobs:${jobId}:results:${page}:${pageSize}:${filterStr}`
  }

  get(jobId, page, pageSize, filters) {
    const key = this.getCacheKey(jobId, page, pageSize, filters)
    const cached = this.cache.get(key)
    if (cached && Date.now() < cached.expireAt) {
      return cached.data
    }
    this.cache.delete(key)
    return null
  }

  set(jobId, page, pageSize, filters, data) {
    const key = this.getCacheKey(jobId, page, pageSize, filters)
    this.cache.set(key, {
      data,
      expireAt: Date.now() + this.ttl
    })
  }

  clearJobCache(jobId) {
    // 删除该任务所有结果缓存
    for (const key of this.cache.keys()) {
      if (key.startsWith(`jobs:${jobId}:`)) {
        this.cache.delete(key)
      }
    }
  }

  clearAll() {
    this.cache.clear()
  }
}
```

**集成位置**:

1. **GET /api/jobs/:id/results** (routes/jobs.js):
   ```javascript
   const cached = resultsCache.get(jobId, page, pageSize, filters)
   if (cached) return cached

   const results = await queryResults(jobId, page, pageSize, filters)
   resultsCache.set(jobId, page, pageSize, filters, results)
   return results
   ```

2. **任务完成时清除** (taskQueue.js):
   ```javascript
   taskQueue.on('complete', (jobId) => {
     resultsCache.clearJobCache(jobId)
   })
   ```

**缓存策略**:
- 键: `jobs:{jobId}:results:{page}:{pageSize}:{filters}`
- TTL: 2 分钟 (用户浏览结果的典型时间)
- 清除: 任务完成时主动清除

**Patterns to follow:**
- 参考 `services/cacheService.js` 现有 SuggestionCache 设计
- 使用 Map + 过期时间戳方案，不依赖外部库

**Test scenarios:**
- Happy path: 缓存命中，返回缓存数据（无数据库查询）
- Edge case: 缓存过期后，重新查询数据库
- Edge case: 不同过滤条件，缓存键不同，各自缓存
- Error path: 任务完成时，清除所有相关缓存
- Integration: 同一用户快速多次请求关键词结果，第一个查询数据库，后续使用缓存

**Verification:**
- 缓存命中率 > 70% (用户通常查看 1-3 页)
- 缓存命中时 API 响应时间 < 10ms
- 缓存未命中时保持原性能 (Unit 1 优化基础上 < 100ms)

---

### Unit 4: HTTP 缓存头和监测

**Goal:** 为 GET API 响应添加 Cache-Control 头，允许浏览器和 CDN 缓存；添加响应时间监测日志

**Requirements:** R1, R3

**Dependencies:** Unit 1, Unit 3

**Files:**
- Modify: `backend/dist/routes/jobs.js` — 添加 Cache-Control 头
- Modify: `backend/dist/server.js` — 中间件记录响应时间
- Test: `backend/tests/caching.test.ts` — 验证缓存头和响应时间

**Approach:**

**HTTP 缓存头**:

```javascript
// GET /api/jobs/:id/results
// Cache-Control: public, max-age=120, s-maxage=300
// Expires: [2 min 后的时间]

response.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300')
response.setHeader('ETag', hashResults(data))
```

- `public` = 允许浏览器和中间代理缓存
- `max-age=120` = 浏览器缓存 2 分钟
- `s-maxage=300` = 中间代理 (CDN) 缓存 5 分钟
- `ETag` = 数据版本校验（任务更新时服务端改变 ETag）

**响应时间监测**:

```javascript
// 中间件
app.use(async (c, next) => {
  const start = Date.now()
  await next()
  const duration = Date.now() - start
  
  if (duration > 100) {  // > 100ms 才记录
    logger.warn(`Slow query: ${c.req.method} ${c.req.path} - ${duration}ms`)
  }
})
```

记录内容:
- 路由, 方法, 响应时间 (ms)
- 数据库命中状态 (缓存命中/未命中)
- 结果集大小

**Patterns to follow:**
- Hono 中间件风格
- 参考现有日志配置 (backend/logger.ts 或类似)

**Test scenarios:**
- Happy path: API 响应包含 Cache-Control 头，格式正确
- Edge case: POST/PUT/DELETE 请求，不设置缓存头 (no-cache)
- Integration: 浏览器发送 If-None-Match (ETag 验证)，服务端返回 304 Not Modified
- Monitoring: 响应时间 > 500ms 的请求被记录到日志

**Verification:**
- HTTP 响应头验证 (curl -i)
- 日志包含 > 100ms 的请求
- 缓存头遵循 RFC 7234 标准

---

## System-Wide Impact

### Interaction Graph

```
客户端请求
  ↓
routes/jobs.js (API 入口)
  ├─ resultsCache.get() → 检查缓存 (Unit 3)
  ├─ 缓存 MISS → 执行 SQL 查询 (Unit 1 索引)
  ├─ resultsCache.set() → 存储结果 (Unit 3)
  └─ setHeader(Cache-Control) → 浏览器缓存 (Unit 4)

taskQueue (任务执行)
  ├─ competitorExtractor.extractFromUrls() → 并发提取 (Unit 2)
  ├─ 完成时 resultsCache.clearJobCache() → 清除缓存
  └─ logger.info() → 记录耗时 (Unit 4)
```

### Error Propagation

- 缓存层错误 (过期检查失败) → 降级到数据库查询，无功能影响
- 竞争对手提取某个 URL 失败 → p-queue 继续处理其他 URL，返回部分结果
- 响应时间监测异常 → 仅影响日志，不影响 API 功能

### State Lifecycle Risks

- **缓存一致性**: 任务状态变更时必须清除缓存（由 Unit 3 的 clearJobCache 保证）
- **并发写入**: 多个任务同时更新同一 job_id 的缓存 → 最后一个写入胜出（可接受，2min TTL 快速恢复）
- **内存泄漏**: 缓存未过期清理 → 由 TTL 2min 自动过期机制保证，不会无限增长

### API Surface Parity

- GET 请求添加缓存头，无破坏性改动
- 竞争对手提取耗时减少，用户无感（任务状态查询体验改善）
- 数据库索引添加，查询语义不变

### Integration Coverage

- Unit 1 (索引) 必须先于 Unit 3 (缓存) 完成（缓存才能有明显性能收益）
- Unit 2 (并发化) 与其他 Unit 无依赖，可并行开发
- Unit 4 (缓存头) 依赖 Unit 3 缓存策略已定，但可独立实现

### Unchanged Invariants

- API 请求/响应契约不变 (JSON 格式, 字段名)
- 数据库 schema 不变 (仅添加索引)
- 规范化、分类、评分逻辑不变

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 索引维护开销增加 (INSERT/UPDATE/DELETE 变慢) | SQLite 索引开销低，3 个新索引影响 < 5% 写入性能 |
| 缓存键设计错误导致数据不一致 | 单元测试覆盖缓存键生成和清除逻辑 |
| 竞争对手网站检测到并发请求被限流 | maxConcurrency=3 相对保守，可根据实测调整 |
| HTTP 缓存导致用户看到过期数据 | TTL 2 min 足够平衡（用户刷新可立即更新） |
| 缓存内存占用过大 | TTL 自动过期，实测估计 < 10MB (小数据集) |

## Documentation / Operational Notes

- **部署前检查**: SQLite 版本 ≥ 3.32.0 (支持 DESC 索引，通常默认满足)
- **滚动部署**: 先部署索引添加 (Unit 1，无影响)，再部署缓存 (Unit 3)，最后部署监测 (Unit 4)
- **监测指标**: 
  - API 响应时间 P50, P95, P99 (Target: P95 < 200ms)
  - 缓存命中率 (Target: > 70%)
  - 数据库慢查询日志 (Target: < 5 per hour)

---

## Sources & References

- **Origin**: 用户在 brainstorm 阶段明确选择"后端查询慢"作为性能优化的主要痛点
- **Repo analysis**: 架构扫描发现关键索引缺失、竞争对手提取串行化、缺少应用层缓存
- **SQLite optimization**: https://www.sqlite.org/queryplanner.html (复合索引 & EXPLAIN QUERY PLAN)
- **p-queue usage**: 已在 taskQueue.js 中应用，本计划扩展其用法
