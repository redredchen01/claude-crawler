# SEO Crawler 性能优化实现指南

**计划**: `docs/plans/2026-04-15-002-perf-backend-query-optimization-plan.md`

**分支**: `perf/backend-query-optimization`

---

## Unit 1: 数据库索引优化 ✅ 完成

### 目标
添加三个复合索引到 SQLite 数据库，消除关键词结果查询和任务列表查询的全表扫描。

### 实现步骤

#### 1.1 修改 `backend/src/db/schema.ts` (或编译后的 dist/db/schema.js)

**添加新索引定义到 `keywordResults` 表**:

```typescript
export const keywordResults = sqliteTable("keyword_results", {
  // ... 现有字段 ...
}, (table) => ({
  // 现有索引
  jobIdIdx: index("idx_results_job_id").on(table.jobId),
  normalizedKeywordIdx: index("idx_results_normalized").on(table.jobId, table.normalizedKeyword),
  
  // NEW: 性能优化索引 (Unit 1)
  // 用于按评分排序的查询 - GET /api/jobs/:id/results?sortBy=score
  scoreIdx: index("idx_results_score").on(table.jobId, table.score, table.createdAt),
  
  // 用于意图过滤的查询 - GET /api/jobs/:id/results?intent=commercial
  intentIdx: index("idx_results_job_intent").on(table.jobId, table.intent),
}))
```

#### 1.2 修改 `backend/src/db/index.ts` (或 dist/db/index.js)

**在数据库初始化的 SQL 中添加索引创建语句**:

```javascript
function initializeDatabase() {
  const sqlite = new Database(dbPath);
  // ... 配置 ...
  
  sqlite.exec(`
    -- 其他 CREATE TABLE 和索引 ...
    
    -- Unit 1: 性能优化索引
    CREATE INDEX IF NOT EXISTS idx_results_score ON keyword_results(job_id, score DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_results_job_intent ON keyword_results(job_id, intent);
  `);
  
  return { sqlite, db };
}
```

#### 1.3 验证索引使用

使用 SQLite EXPLAIN QUERY PLAN 验证查询使用索引:

```bash
sqlite3 data/app.db

-- 检查评分排序查询是否使用索引
EXPLAIN QUERY PLAN
SELECT * FROM keyword_results
WHERE job_id = 'abc123'
ORDER BY score DESC, created_at DESC
LIMIT 25 OFFSET 0;

-- 输出应该包含 "SEARCH keyword_results USING idx_results_score"

-- 检查意图过滤查询是否使用索引
EXPLAIN QUERY PLAN
SELECT * FROM keyword_results
WHERE job_id = 'abc123' AND intent = 'commercial';

-- 输出应该包含 "SEARCH keyword_results USING idx_results_job_intent"
```

#### 1.4 预期性能改进

- **关键词结果查询** (GET /api/jobs/:id/results):
  - 无索引: 300-1000ms (取决于数据量)
  - 有索引: < 100ms
  - **改进**: 70-90%

- **任务列表查询** (GET /api/jobs):
  - 无索引: 200-500ms
  - 有索引: < 50ms
  - **改进**: 75-90%

---

## Unit 2: 竞争对手提取并发化

### 目标
将竞争对手 URL 提取从串行改为并发处理，使用 p-queue 限制并发数为 3。

### 实现步骤

#### 2.1 修改 `backend/src/crawler/competitorExtractor.ts`

**当前实现（串行）**:

```typescript
async extractFromUrls(urls: string[]): Promise<ExtractedContent[]> {
  const results: ExtractedContent[] = [];
  
  for (const url of urls) {  // ❌ 串行处理
    try {
      const result = await this.extractFromUrl(url);  // 1-2s per URL
      results.push(result);
    } catch (err) {
      console.error(`Failed to extract from ${url}:`, err);
    }
  }
  
  return results;
}
```

**优化实现（并发）**:

```typescript
import PQueue from "p-queue";

async extractFromUrls(urls: string[]): Promise<ExtractedContent[]> {
  const queue = new PQueue({ concurrency: 3 });  // 同时处理 3 个 URL
  
  const promises = urls.map(url =>
    queue.add(async () => {
      try {
        return await this.extractFromUrl(url);
      } catch (err) {
        console.error(`Failed to extract from ${url}:`, err);
        return null;  // 失败返回 null，继续处理其他 URL
      }
    })
  );
  
  const results = await Promise.all(promises);
  return results.filter(r => r !== null);  // 过滤失败的结果
}
```

#### 2.2 性能验证

**测试场景**:
```typescript
describe("CompetitorExtractor - Concurrency", () => {
  it("should process 3 URLs in parallel (not serial)", async () => {
    const extractor = new CompetitorExtractor();
    const urls = [
      "https://example1.com",
      "https://example2.com",
      "https://example3.com"
    ];
    
    const start = Date.now();
    const results = await extractor.extractFromUrls(urls);
    const duration = Date.now() - start;
    
    // 并发: 3 个 URL 1-2s each = 1-2s 总耗时
    // 串行: 3 个 URL 1-2s each = 3-6s 总耗时
    expect(duration).toBeLessThan(3000);  // ✓ 并发完成
    expect(results).toHaveLength(3);
  });
});
```

#### 2.3 并发限制说明

- `maxConcurrency: 3` — 平衡吞吐量和目标网站友好度
- 避免触发速率限制 (429 Too Many Requests)
- 可根据实测调整 (2-4 之间)

---

## Unit 3: 结果列表缓存层

### 目标
为关键词结果和任务列表查询添加 2 分钟 TTL 的内存缓存。

### 实现步骤

#### 3.1 创建 `backend/src/services/resultsCache.ts`

```typescript
export class ResultsCache {
  private cache = new Map<string, { data: any; expireAt: number }>();
  private ttlMs = 2 * 60 * 1000;  // 2 分钟 TTL

  getCacheKey(jobId: string, page: number, pageSize: number, filters?: Record<string, any>): string {
    const filterStr = filters
      ? Object.entries(filters)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
      : '';
    
    return `jobs:${jobId}:results:${page}:${pageSize}:${filterStr}`;
  }

  get(jobId: string, page: number, pageSize: number, filters?: Record<string, any>): any {
    const key = this.getCacheKey(jobId, page, pageSize, filters);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() < cached.expireAt) {
      return cached.data;  // ✓ 缓存命中
    }
    
    this.cache.delete(key);
    return null;  // ✗ 缓存过期或未找到
  }

  set(jobId: string, page: number, pageSize: number, data: any, filters?: Record<string, any>): void {
    const key = this.getCacheKey(jobId, page, pageSize, filters);
    this.cache.set(key, {
      data,
      expireAt: Date.now() + this.ttlMs
    });
  }

  clearJobCache(jobId: string): void {
    // 清除该任务所有结果缓存
    for (const key of this.cache.keys()) {
      if (key.startsWith(`jobs:${jobId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  clearAll(): void {
    this.cache.clear();
  }
}
```

#### 3.2 集成到 API 路由

**修改 `backend/src/routes/jobs.ts`**:

```typescript
import { ResultsCache } from "../services/resultsCache.js";

const resultsCache = new ResultsCache();

// GET /api/jobs/:id/results
app.get("/api/jobs/:id/results", async (c) => {
  const jobId = c.req.param("id");
  const page = parseInt(c.req.query("page") || "1");
  const pageSize = parseInt(c.req.query("pageSize") || "25");
  const filters = {
    source: c.req.query("source"),
    intent: c.req.query("intent"),
  };

  // ✓ 检查缓存
  const cached = resultsCache.get(jobId, page, pageSize, filters);
  if (cached) {
    return c.json(cached);
  }

  // ✗ 缓存未命中，查询数据库
  const results = await queryResults(jobId, page, pageSize, filters);

  // 缓存结果
  resultsCache.set(jobId, page, pageSize, results, filters);

  return c.json(results);
});
```

#### 3.3 任务完成时清除缓存

**修改 `backend/src/queue/taskQueue.ts`**:

```typescript
async executeTask(jobId: string, seed: string, sources: string[], competitorUrls?: string[]) {
  // ... 执行任务 ...
  
  // 任务完成时清除缓存
  resultsCache.clearJobCache(jobId);
  
  // 更新任务状态为 completed
  updateJobStatus(jobId, "completed");
}
```

---

## Unit 4: HTTP 缓存头和监测

### 目标
为 GET API 响应添加 Cache-Control 和 ETag 头，记录响应时间。

### 实现步骤

#### 4.1 添加响应时间监测中间件

**修改 `backend/src/server.ts`**:

```typescript
app.use(async (c, next) => {
  const start = Date.now();
  
  await next();
  
  const duration = Date.now() - start;
  
  // 记录慢查询
  if (duration > 100) {
    console.warn(`[SLOW_QUERY] ${c.req.method} ${c.req.path} - ${duration}ms`);
    // 可集成到监测系统 (如 Prometheus)
  }
  
  // 添加响应时间头
  c.header("X-Response-Time", `${duration}ms`);
});
```

#### 4.2 添加 Cache-Control 响应头

**修改 `backend/src/routes/jobs.ts`**:

```typescript
app.get("/api/jobs/:id/results", async (c) => {
  // ... 现有逻辑 ...
  
  // ✓ 添加缓存头
  c.header("Cache-Control", "public, max-age=120, s-maxage=300");
  // max-age=120 → 浏览器缓存 2 分钟
  // s-maxage=300 → CDN/代理缓存 5 分钟
  
  c.header("ETag", `"${hashResults(results)}"`);
  // ETag 用于条件请求 (If-None-Match)
  
  return c.json(results);
});

app.get("/api/jobs", async (c) => {
  // ... 任务列表 ...
  
  c.header("Cache-Control", "public, max-age=60, s-maxage=300");
  c.header("ETag", `"${hashJobList(jobs)}"`);
  
  return c.json(jobs);
});

// 不缓存 POST/PUT/DELETE
app.post("/api/jobs", async (c) => {
  // ...
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  return c.json(newJob);
});
```

#### 4.3 监测指标

**建议监测**:
- API 响应时间 P50, P95, P99
- 缓存命中率 (目标 > 70%)
- 数据库慢查询日志 (目标 < 5/hour)

```typescript
// 示例: 记录缓存命中率
let cacheHits = 0;
let cacheTotal = 0;

app.get("/api/jobs/:id/results", async (c) => {
  cacheTotal++;
  
  const cached = resultsCache.get(jobId, page, pageSize, filters);
  if (cached) {
    cacheHits++;
  }
  
  // 定期日志
  if (cacheTotal % 100 === 0) {
    const hitRate = (cacheHits / cacheTotal * 100).toFixed(1);
    console.info(`[CACHE_STATS] Hit rate: ${hitRate}% (${cacheHits}/${cacheTotal})`);
  }
  
  // ... 返回结果 ...
});
```

---

## 验证清单

### Unit 1: 数据库索引
- [ ] 索引已创建 (EXPLAIN QUERY PLAN 验证)
- [ ] 单位测试通过 (schema.test.js)
- [ ] 查询性能 < 100ms

### Unit 2: 竞争对手并发化
- [ ] extractFromUrls() 使用 p-queue (maxConcurrency=3)
- [ ] 3 个 URL 提取耗时 < 3 秒
- [ ] 单个 URL 失败不阻塞其他 URL

### Unit 3: 缓存层
- [ ] ResultsCache 类实现完成
- [ ] API 路由集成缓存
- [ ] 任务完成时清除缓存
- [ ] 缓存命中率 > 70%

### Unit 4: HTTP 缓存头
- [ ] Cache-Control 头添加正确
- [ ] ETag 生成和验证工作
- [ ] 响应时间监测日志记录
- [ ] 慢查询告警配置

---

## 性能目标

| 指标 | 优化前 | 优化后 | 改进 |
|------|--------|--------|------|
| 关键词结果查询 (10K keywords) | 1-2s | 50-100ms | 95% ⬇️ |
| 任务列表查询 | 500ms | 30-50ms | 90% ⬇️ |
| 竞争对手提取 (3 URLs) | 5-6s | 1-2s | 70% ⬇️ |
| 重复请求 (缓存命中) | 500ms | < 10ms | 98% ⬇️ |
| **整体任务执行** | **10-15s** | **3-5s** | **70% ⬇️** |

---

## 相关文件

- **源代码**: `backend/src/`
- **编译代码**: `backend/dist/`
- **计划文档**: `docs/plans/2026-04-15-002-perf-backend-query-optimization-plan.md`
- **测试文件**: `backend/dist/db/schema.test.js`

---

## 推送与部署

构建和部署流程:

```bash
# 1. 编译 TypeScript
npm run build

# 2. 运行测试
npm test

# 3. 推送到远程
git push origin perf/backend-query-optimization

# 4. 创建 PR 用于审查
gh pr create --title "perf(backend): Query optimization with indexes, caching, and concurrency" \
  --body-file docs/PERFORMANCE_OPTIMIZATION_IMPLEMENTATION.md
```

---

**Last Updated**: 2026-04-15
**Status**: Implementation Guide Complete
