---
title: "feat: Phase 3 — SERP Real Data Integration & Multi-Page Analysis"
type: feat
status: active
date: 2026-04-15
---

# Phase 3 — SERP Real Data Integration & Multi-Page Analysis

## Overview

Phase 2 完成了 TDK 生成的核心功能，但系统仍停留在**模拟阶段**：SERP 预览只是静态演示，没有真实的搜索结果反馈。Phase 3 将系统转变为**反馈驱动的优化引擎**，集成真实 Google SERP 数据，并扩展为支持跨多页面的分析和学习。

**核心转变**：
- 从"生成 TDK"→ 从"生成 + 验证 + 跟踪性能"
- 从"单页面优化"→ 从"单页面 + 多页面协调优化"
- 从"静态验证规则"→ 从"规则 + 实时数据 + 用户反馈"

## Problem Frame

### 用户问题
1. **缺乏真实数据反馈**：生成的 TDK 看起来符合规则，但在搜索结果中的真实表现如何？
2. **无法对标竞争**：同一主题的多个页面应该有不同的关键词策略，但系统无法识别冲突或重复。
3. **无学习闭环**：哪些 TDK 变体在 SERP 中排名更好？系统不会从这些数据中学习。

### 业务机会
1. **多页面一致性检查** — 同主题页面的 TDK 冲突检测，避免自家页面竞争
2. **SERP 排名洞察** — 跟踪生成的 TDK 在真实搜索结果中的表现
3. **A/B 验证** — 在发布前对标现有 SERP 排名靠前的页面
4. **用户反馈循环** — "这个 TDK 的表现很好/很差"→ 模型学习

---

## Requirements Trace

- **R1**: 支持从 Google Trends 或 SERP 模拟器获取实时搜索结果数据
- **R2**: 多页面关系建模与冲突检测（同主题关键词重复度）
- **R3**: 对比生成 TDK 和真实 SERP 排名页面的内容相似度
- **R4**: 实现用户反馈机制（"赞/踩"生成的 TDK）
- **R5**: 批量分析 API 支持多页面统计与洞察导出
- **R6**: 成本控制（SERP 查询、Claude API token 预算管理）
- **R7**: 跨页面状态共享（编辑会话、进度追踪）
- **R8**: 兼容现有 Phase 2 的 API 和数据模型

---

## Scope Boundaries

**明确包括**：
- SERP 数据源集成（起始：模拟器/Trends API；后期：真实 Google）
- 多页面关系表和冲突检测规则
- 用户反馈收集 API 和前端 UI
- 批量查询和聚合统计
- Zustand 全局状态管理（跨页面编辑会话共享）

**明确不包括**：
- 自动 SEO 排名监控（与现有排名跟踪工具重复）
- 深度机器学习模型（会议反馈循环后再考虑）
- 实时 WebSocket 协作编辑（Phase 4）
- CI/CD 集成（Phase 5）
- 移动端 UI 优化（Phase 6）

---

## Key Technical Decisions

| 决策 | 选项 | 选中 | 理由 |
|------|------|------|------|
| **SERP 数据源** | 真实 Google API / Trends API / 模拟器 | 模拟器 (可扩展) | 快速启动，真实 API 需 auth/quota；模拟器支持后续升级 |
| **多页面关系模型** | 添加字段 / 新关系表 | 混合（先字段，后表） | 数据量小时保持简洁，后期迁移到规范化 |
| **全局状态管理** | Context / Zustand / Redux | Zustand | 轻量 + 类型安全，适合中等复杂度 |
| **反馈存储** | JSON 字段 / 专用表 | 专用表 | 支持聚合查询（按反馈类型、时间统计） |
| **成本控制** | Token 预算库 / Rate limit 中间件 / 用户配额 | 三层 | 库级 + 路由级 + 用户级的防御深度 |
| **批量操作** | 队列系统 / 同步 API | 同步 (短期) + 队列 (长期) | Phase 3 用同步简化，<10 页聚合；Phase 4 升级队列 |

---

## Context & Research

### 相关代码模式

- **API 端点设计**：`backend/src/api/tdk.ts` — 参考 Zod 验证、错误码规范、`clusterId` 路由模式
- **服务层**：`backend/src/services/tdk/` — 参考依赖注入、单例模式、Claude API 集成
- **数据模型**：`backend/src/db/schema.ts` — JSON 字段存储、时间戳约定
- **前端状态**：`frontend/src/hooks/useBulkTdkGeneration.ts` — 参考 hook 组织、批量操作状态机
- **测试**：`backend/tests/api/mocks.ts` — 参考 Mock 服务、DB 集成测试

### 现有模式要遵循

1. **API 约定**：`/api/projects/{projectId}/clusters/{clusterId}/...`
2. **错误响应**：`{ error: { code: "ERROR_CODE", message: "..." } }`
3. **验证**：Zod Schema + 严格的入参检查
4. **JSON 存储**：TEXT 字段，应用层序列化/反序列化
5. **时间戳**：`new Date().toISOString()` (ISO 8601)
6. **依赖注入**：可选的服务构造参数（便于 mocking）

### 架构上的关键约束

- ⚠️ **JSON 查询困难** — 无法在 DB 层按 JSON 字段内容查询，需应用层过滤
- ⚠️ **无多页面关系表** — 需要新建或扩展字段
- ⚠️ **前端状态孤立** — 每个 hook 独立，无全局共享（需 Zustand 升级）
- ⚠️ **无批量 API** — 批量查询需新端点

---

## Open Questions

### 已在规划中解决

1. **SERP 数据源选择**：Google Trends API vs 模拟器
   - **决议**：起始用模拟器（固定假数据），结构支持后期升级到真实 API
   - **实现**：抽象 `SerpDataProvider` 接口，切换实现而不改 API 层

2. **多页面关系建模**：如何存储"同主题页面"？
   - **决议**：Phase 3 用可选字段 `topicGroupId` + `relatedClusterIds`，不创建新表
   - **迁移路径**：数据量增长后创建 `page_relationships` 规范化表

3. **用户反馈格式**：收集什么信息？
   - **决议**：最小化：`{ type: "thumbs_up|thumbs_down", feedback?: string }`
   - **未来扩展**：ranking_position, actual_ctr, bounce_rate

### 实现中待解决

- **SERP 匹配算法**：如何判断"生成的 TDK 和 SERP 第 N 结果相似"？（文本相似度 + 关键词重叠）
- **成本追踪粒度**：按项目、用户、还是两者？
- **批量聚合的时间范围**：预计算还是实时查询？

---

## High-Level Technical Design

> *This diagram illustrates the intended Phase 3 architecture and is directional guidance for review. Implementing agents should treat it as context, not implementation specification.*

### 数据流架构

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React)                                            │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────┐   │
│  │ TdkOptimizer │→ │ MultiPageAnalysis│→ │ FeedbackPanel│   │
│  │  (单页编辑)   │  │  (多页分析)      │  │  (反馈收集)   │   │
│  └──────────────┘  └─────────────────┘  └──────────────┘   │
│         ↓                  ↓                    ↓            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Zustand Store (useTdkStore)                  │   │
│  │  • pageCache: Map<clusterId, TdkData>               │   │
│  │  • editingSessions: Map<clusterId, EditSession>     │   │
│  │  • multiPageAnalysis: Map<topicGroup, GroupStats>   │   │
│  │  • feedbackDraft: { clusterId, type, text }         │   │
│  └──────────────────────────────────────────────────────┘   │
│         ↓                  ↓                    ↓            │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ API Layer (Hono)                                            │
│                                                             │
│  POST /tdk-optimize          (既有，兼容)                   │
│  POST /clusters/{id}/tdk-save (既有，兼容)                  │
│  GET  /clusters/{id}/tdk      (既有，兼容)                  │
│                                                             │
│  ──── 新增 Phase 3 ────                                     │
│  GET  /projects/{id}/tdk-summary         (多页查询)        │
│  GET  /projects/{id}/page-relationships  (关系查询)        │
│  GET  /clusters/{id}/serp-comparison     (SERP 对标)       │
│  POST /clusters/{id}/feedback            (反馈提交)        │
│  GET  /projects/{id}/feedback-analytics  (反馈统计)        │
│  GET  /projects/{id}/conflict-report     (冲突检测)        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         ↓ (依赖注入)
┌─────────────────────────────────────────────────────────────┐
│ Service Layer                                               │
│                                                             │
│  • TdkGeneratorService (既有)                               │
│  • TdkValidatorService (既有)                               │
│  • TdkRulesEngine (既有)                                    │
│                                                             │
│  ──── 新增 ────                                             │
│  • SerpDataProvider (接口，可扩展)                          │
│  • MultiPageAnalysisService                                │
│  • ConflictDetectionService                                │
│  • FeedbackService                                         │
│  • CostTrackingService                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Data Layer (SQLite)                                         │
│                                                             │
│  contentPlans (扩展)                                         │
│    + topicGroupId?: TEXT                                   │
│    + relatedClusterIds?: TEXT (JSON)                       │
│    + serpDataJson?: TEXT (SERP 快照)                       │
│                                                             │
│  tdk_feedback (新表)                                        │
│    id, content_plan_id, type, feedback_text, created_at   │
│                                                             │
│  page_relationships (新表，未来)                            │
│    id, from_id, to_id, type, created_at                   │
│                                                             │
│  tdk_cost_log (新表)                                        │
│    id, project_id, user_id, operation, tokens, cost, ts   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 关键流程

**1. 多页面冲突检测流程**
```
用户输入多个 clusterIds → 
  GetTdkSummary API →
    MultiPageAnalysisService.detectConflicts() →
      1. 提取每个页面的 TDK 关键词
      2. 计算关键词重叠度 (Jaccard 相似度)
      3. 标记 >70% 重叠为冲突
      4. 返回冲突矩阵和建议
```

**2. SERP 对标流程**
```
用户生成 TDK → 
  SerpComparisonAPI →
    1. 调用 SerpDataProvider.fetch(topic, keywords)
    2. 获取 Top-10 SERP 结果
    3. 计算生成的 title/desc 和各 SERP 页面的相似度
    4. 标记"已被覆盖"或"差异化机会"
    5. 返回排名洞察
```

**3. 反馈收集和学习**
```
用户点击"赞/踩" → 
  SubmitFeedbackAPI →
    FeedbackService.record() →
      1. 存储反馈和当时的 TDK
      2. 同步存储 SERP 快照（跟踪对标结果）
      3. 异步：计算反馈得分分布（未来用于模型训练）
```

---

## Implementation Units

- [ ] **Unit P3.1: Database Schema Extension**

**Goal**: 添加多页面关系字段、SERP 数据和反馈表

**Requirements**: R1, R2, R5, R8

**Dependencies**: None (纯 schema 扩展，向后兼容)

**Files**:
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/db/migrations/0002_phase3_schema_extension.sql`
- Modify: `backend/src/db/index.ts` (initializeDatabase)
- Create: `backend/tests/db/schema_phase3.test.ts`

**Approach**:

1. **扩展 contentPlans 表** (4 个新字段，全部可空，向后兼容)：
   - `topicGroupId?: TEXT` — 主题分组标识符，用于聚合同主题页面
   - `relatedClusterIds?: TEXT` — JSON 数组格式："[cluster-2, cluster-3]"
   - `serpDataJson?: TEXT` — 存储最新的 SERP 快照 (top-10 结果摘要)
   - `lastSerpFetchedAt?: TEXT` — SERP 数据最后更新时间

2. **创建 tdk_feedback 表** (无 FK 约束，支持删除 contentPlan 后保留反馈):
   ```sql
   CREATE TABLE tdk_feedback (
     id TEXT PRIMARY KEY,
     content_plan_id TEXT NOT NULL,
     project_id TEXT NOT NULL,
     type TEXT NOT NULL,  -- 'positive' | 'negative' | 'detailed'
     feedback_text TEXT,  -- 可选的文字反馈
     serp_snapshot_json TEXT,  -- 反馈时的 SERP 数据
     created_at TEXT NOT NULL,
     created_by TEXT
   );
   ```

3. **创建 tdk_cost_log 表** (成本追踪):
   ```sql
   CREATE TABLE tdk_cost_log (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     user_id TEXT,
     operation TEXT,  -- 'generate', 'serp_fetch', 'analyze'
     tokens_used INT,
     estimated_cost REAL,
     created_at TEXT NOT NULL
   );
   ```

4. **索引策略**:
   - `idx_content_plans_topic_group` — 按主题分组快速查询
   - `idx_tdk_feedback_plan_id` — 按页面查反馈
   - `idx_tdk_feedback_created_at` — 按时间范围查询
   - `idx_cost_log_project_created` — 按项目和时间查询成本

**Patterns to follow**:
- Drizzle ORM 定义（参考 schema.ts 现有模式）
- 时间戳用 `new Date().toISOString()`
- UUID 生成用 `crypto.randomUUID()`
- Migration 文件用 SQL 硬编码（支持向后兼容）

**Test scenarios**:
- 添加新字段后，查询既有数据（无字段的老记录）应正常返回
- 向 relatedClusterIds 添加 JSON 数组，查询和更新都保留格式
- tdk_feedback 表支持插入和批量查询
- 删除 contentPlan 不删除 feedback（验证无 FK）
- 索引创建后，按主题分组的查询 <50ms (1000 行数据)

**Verification**:
- 所有测试通过，包括向后兼容性测试
- `initializeDatabase()` 调用后，新表和字段可用
- 现有 contentPlans 数据保持不变

---

- [ ] **Unit P3.2: SerpDataProvider Interface & Mock Implementation**

**Goal**: 抽象 SERP 数据源，支持可扩展的数据获取

**Requirements**: R1, R6

**Dependencies**: Unit P3.1 (schema 中的 serpDataJson 字段)

**Files**:
- Create: `backend/src/services/serp/serpDataProvider.ts` (interface)
- Create: `backend/src/services/serp/mockSerpDataProvider.ts`
- Create: `backend/src/services/serp/index.ts` (singleton)
- Create: `backend/tests/services/serp/mockSerpDataProvider.test.ts`

**Approach**:

1. **定义 SerpDataProvider 接口** (支持后期升级):
   ```typescript
   interface SerpDataProvider {
     /**
      * 获取 SERP 搜索结果
      * @param query - 搜索关键词
      * @param language - 'en' | 'zh'
      * @returns 前 10 个结果
      */
     fetch(
       query: string,
       language?: Language
     ): Promise<SerpResult[]>;
   }

   interface SerpResult {
     rank: number;           // 1-10
     title: string;
     description: string;
     url: string;
     domain: string;
     metadata?: {
       date?: string;
       snippet?: string;
     };
   }
   ```

2. **实现 MockSerpDataProvider** (固定数据，便于测试):
   ```typescript
   class MockSerpDataProvider implements SerpDataProvider {
     async fetch(query: string, language = "en"): Promise<SerpResult[]> {
       // Phase 3 时期，返回预定义的结果集
       // 基于 query 的哈希返回一致的假数据
       // 支持 5-10 个常见查询的模拟结果
       // 未知查询返回通用结果
     }
   }
   ```

3. **单例和依赖注入**:
   ```typescript
   let _serpProvider: SerpDataProvider | null = null;

   export function getSerpDataProvider(
     overrideProvider?: SerpDataProvider
   ): SerpDataProvider {
     if (overrideProvider) return overrideProvider;
     if (!_serpProvider) {
       _serpProvider = new MockSerpDataProvider();
       // 后期升级：process.env.SERP_PROVIDER_TYPE === 'google'
       //   → _serpProvider = new GoogleSerpDataProvider(API_KEY);
     }
     return _serpProvider;
   }
   ```

4. **成本追踪**:
   - Mock 实现不计成本 (cost = 0)
   - 真实实现（未来）会记录 token 消耗

**Patterns to follow**:
- 参考 TdkGeneratorService 的单例模式
- 接口定义清晰，便于后期实现切换
- 返回数据结构与 Google SERP API 兼容

**Test scenarios**:
- `fetch("how to bake cookies")` 返回 10 个结果，rank 递增
- 相同查询返回相同结果（确定性）
- 不同语言返回不同语言的结果
- 极长查询（>200 字符）处理正确，截断或报错
- 空查询处理（返回空数组或错误）

**Verification**:
- SerpDataProvider 接口已定义，清晰可扩展
- MockSerpDataProvider 通过所有测试
- 可通过依赖注入替换实现（验证 interface 正确性）
- getSerpDataProvider() 返回单例，多次调用返回同一实例

---

- [ ] **Unit P3.3: MultiPageAnalysisService & Conflict Detection**

**Goal**: 实现多页面分析和冲突检测逻辑

**Requirements**: R2, R5

**Dependencies**: Unit P3.1, Unit P3.2

**Files**:
- Create: `backend/src/services/multipage/multiPageAnalysisService.ts`
- Create: `backend/src/services/multipage/conflictDetectionService.ts`
- Create: `backend/src/services/multipage/index.ts`
- Create: `backend/tests/services/multipage/conflictDetection.test.ts`

**Approach**:

1. **MultiPageAnalysisService** (协调多页面查询和聚合):
   ```typescript
   class MultiPageAnalysisService {
     /**
      * 分析多个页面的 TDK，检测冲突和机会
      */
     async analyzeClusterGroup(
       projectId: string,
       clusterIds: string[],
       language: Language = "en"
     ): Promise<MultiPageAnalysisResult>
   }

   interface MultiPageAnalysisResult {
     // 页面摘要
     pages: {
       clusterId: string;
       title?: string;
       keywords?: string[];
       hasGenerated: boolean;
     }[];

     // 冲突分析
     conflicts: {
       cluster1Id: string;
       cluster2Id: string;
       overlapKeywords: string[];
       jaccardSimilarity: number;  // 0-1
       severity: "high" | "medium" | "low";
       recommendation: string;
     }[];

     // 话题一致性
     topicCoherence: {
       avgJaccardSimilarity: number;
       redundancyScore: number;  // 0-1，越高越冗余
       suggestedTopicGroup?: string;
     };

     // 聚合统计
     statistics: {
       totalPages: number;
       generatedCount: number;
       avgKeywordCount: number;
       languageDistribution: Record<Language, number>;
     };
   }
   ```

2. **ConflictDetectionService** (纯算法):
   ```typescript
   class ConflictDetectionService {
     /**
      * 检测两个 TDK 的关键词冲突
      */
     detectPairConflict(
       keywords1: string[],
       keywords2: string[]
     ): ConflictResult

     /**
      * 计算 Jaccard 相似度 (交集 / 并集)
      */
     jaccardSimilarity(set1: string[], set2: string[]): number

     /**
      * 标准化和去重关键词
      */
     normalizeKeywords(keywords: string[], language: Language): string[]
   }
   ```

3. **冲突严重程度分级**:
   - **High** (jaccardSimilarity > 0.7): 两个页面的关键词重叠 >70%，强烈建议分离
   - **Medium** (0.4-0.7): 部分关键词重叠，可考虑调整
   - **Low** (<0.4): 大部分不同，通常可接受

4. **语言感知**:
   - 英文：标准化为小写，删除停用词
   - 中文：按字符分割，删除停用词，保留英文词

**Patterns to follow**:
- 参考 TdkValidatorService 的批处理模式
- 返回数据结构参考现有 ValidationReport 的设计

**Test scenarios**:
- 分析 3 个页面，其中 2 个冲突，1 个独立 → 返回正确的冲突矩阵
- 无关键词的页面（未生成 TDK）→ 跳过，不计入冲突
- 英文冲突检测：["chocolate", "chip"] vs ["chocolate chip", "cookie"] → 检测 "chocolate" 重叠
- 中文冲突：["饼干", "巧克力"] vs ["巧克力", "甜点"] → 检测"巧克力"重叠
- 极端情况：0 个页面、1 个页面、100 个页面 → 处理正确

**Verification**:
- 冲突矩阵对称：conflict(A, B) == conflict(B, A)
- Jaccard 相似度范围 [0, 1]
- 无重叠关键词 → Jaccard = 0
- 完全相同关键词 → Jaccard = 1
- 所有测试通过，包括边界情况

---

- [ ] **Unit P3.4: SERP Comparison API Endpoint**

**Goal**: 提供 SERP 对标数据（生成的 TDK vs 真实排名页面）

**Requirements**: R1, R3

**Dependencies**: Unit P3.1, Unit P3.2, Unit P3.3

**Files**:
- Modify: `backend/src/api/tdk.ts` (新增路由)
- Create: `backend/src/services/serp/serpComparisonService.ts`
- Modify: `backend/tests/api/tdk-db-integration.test.ts` (新增测试)

**Approach**:

1. **新路由** (只读):
   ```typescript
   router.get("/clusters/:clusterId/serp-comparison", async (c) => {
     const { clusterId } = c.req.param();
     const { projectId } = c.req.query();

     // 1. 获取该页面的生成 TDK
     const plan = await getContentPlan(clusterId);
     if (!plan.tdkJson) {
       return c.json({ error: "No TDK generated yet" }, 400);
     }

     // 2. 获取 SERP 数据
     const serpProvider = getSerpDataProvider();
     const serpResults = await serpProvider.fetch(
       plan.tdkJson.primary.title,  // 用生成的 title 作为查询
       plan.tdkLanguage || "en"
     );

     // 3. 计算相似度和对标
     const comparisonResult =
       SerpComparisonService.compareWithSerp(
         plan.tdkJson.primary,
         serpResults
       );

     // 4. 返回结果（可选：保存 snapshot）
     return c.json({
       clusterId,
       generatedTdk: plan.tdkJson.primary,
       serpResults,
       comparison: comparisonResult
     }, 200);
   });
   ```

2. **SerpComparisonService**:
   ```typescript
   class SerpComparisonService {
     static compareWithSerp(
       tdkCandidate: TdkCandidate,
       serpResults: SerpResult[]
     ): SerpComparisonResult {
       return {
         // 逐个 SERP 结果对比
         comparisons: serpResults.map((serp, idx) => ({
           rank: serp.rank,
           serp: { title: serp.title, description: serp.description },
           similarity: {
             titleSimilarity: cosineSimilarity(tdkCandidate.title, serp.title),
             descriptionSimilarity: cosine(tdkCandidate.description, serp.description),
             keywordOverlap: calcKeywordOverlap(
               tdkCandidate.keywords,
               extractKeywordsFrom(serp.title + " " + serp.description)
             )
           },
           verdict: (similarity > 0.7) ? "covered" : "differentiated"
         })),

         // 聚合
         coverage: "40% 已被覆盖，60% 差异化",
         opportunity: "考虑突出 'advanced techniques' 来区别 rank #3"
       };
     }
   }
   ```

3. **相似度计算** (文本相似度库):
   - 使用 `string-similarity` npm 包 (Jaro-Winkler)，或简单的 cosine 向量相似度
   - 关键词重叠：intersection / union

**Patterns to follow**:
- 返回数据结构参考 ValidationReport（severity badge, issues list）
- 可选：保存 snapshot 到 `serpDataJson` 字段以支持历史对比

**Test scenarios**:
- 生成 title="How to Bake Cookies" → 查询 SERP → 返回 Top-10 对标数据
- 相同 title 和 SERP 第 1 结果 → 相似度 >0.9
- 完全不同的 title 和所有 SERP → 相似度 <0.3
- 无 TDK 生成的页面 → 返回 400 错误
- 无生成 TDK 但有用户编辑的 TDK → 对标用户 TDK

**Verification**:
- 返回 200 带完整对标数据
- 无 TDK 时返回 400
- 相似度范围 [0, 1]
- SERP 结果排序 rank 1-10，无重复

---

- [ ] **Unit P3.5: Feedback Collection API & Frontend UI**

**Goal**: 收集用户对生成 TDK 的评价（赞/踩），为后续学习积累数据

**Requirements**: R4

**Dependencies**: Unit P3.1

**Files**:
- Modify: `backend/src/api/tdk.ts` (新增 POST 路由)
- Create: `backend/src/services/feedback/feedbackService.ts`
- Create: `backend/tests/api/feedback.test.ts`
- Modify: `frontend/src/components/TdkOptimizer.tsx` (新增反馈 UI)
- Create: `frontend/src/hooks/useFeedbackSubmission.ts`
- Modify: `frontend/tests/components/TdkOptimizer.test.tsx`

**Approach**:

1. **后端 API**:
   ```typescript
   // POST /clusters/:clusterId/feedback
   router.post("/clusters/:clusterId/feedback", async (c) => {
     const { clusterId, projectId } = c.req.param();
     const userId = c.req.header("x-user-id");

     const schema = z.object({
       type: z.enum(["positive", "negative"]),
       feedbackText: z.string().max(500).optional(),
       serpSnapshot: z.record(z.any()).optional()  // 可选的 SERP 快照
     });

     const data = schema.parse(await c.req.json());

     // 保存反馈
     const feedbackId = await FeedbackService.record({
       contentPlanId: clusterId,
       projectId,
       type: data.type,
       feedbackText: data.feedbackText,
       serpSnapshot: data.serpSnapshot,
       createdBy: userId,
       createdAt: new Date().toISOString()
     });

     return c.json({ feedbackId, recorded: true }, 200);
   });
   ```

2. **FeedbackService**:
   ```typescript
   class FeedbackService {
     static async record(feedback: FeedbackInput): Promise<string> {
       const id = crypto.randomUUID();

       await db.insert(tdk_feedback).values({
         id,
         content_plan_id: feedback.contentPlanId,
         project_id: feedback.projectId,
         type: feedback.type,
         feedback_text: feedback.feedbackText,
         serp_snapshot_json: JSON.stringify(feedback.serpSnapshot),
         created_at: feedback.createdAt,
         created_by: feedback.createdBy
       });

       return id;
     }

     static async getProjectStats(projectId: string) {
       const feedbacks = await db
         .select({ type: tdk_feedback.type })
         .from(tdk_feedback)
         .where(eq(tdk_feedback.project_id, projectId));

       return {
         total: feedbacks.length,
         positive: feedbacks.filter(f => f.type === "positive").length,
         negative: feedbacks.filter(f => f.type === "negative").length,
         positiveRate: (positive / total) || 0
       };
     }
   }
   ```

3. **前端 UI** (TdkOptimizer.tsx 中集成):
   ```typescript
   function FeedbackSection({ clusterId }: { clusterId: string }) {
     const [submitted, setSubmitted] = useState(false);
     const { mutate: submitFeedback } = useFeedbackSubmission(clusterId);

     return (
       <div style={{ marginTop: "16px", padding: "12px", background: "#f0f0f0" }}>
         <p>这个 TDK 的表现如何？</p>
         <button
           onClick={() => submitFeedback({ type: "positive" })}
           disabled={submitted}
         >
           👍 很有帮助
         </button>
         <button
           onClick={() => submitFeedback({ type: "negative" })}
           disabled={submitted}
         >
           👎 需要改进
         </button>
         {submitted && <p style={{ color: "green" }}>感谢反馈！</p>}
       </div>
     );
   }
   ```

4. **前端 Hook**:
   ```typescript
   export function useFeedbackSubmission(clusterId: string) {
     return useMutation(async (data: FeedbackInput) => {
       const response = await fetch(
         `/api/clusters/${clusterId}/feedback`,
         {
           method: "POST",
           body: JSON.stringify(data)
         }
       );
       if (!response.ok) throw new Error("Failed to submit feedback");
       return response.json();
     });
   }
   ```

**Patterns to follow**:
- 参考 useBulkTdkGeneration 的 hook 设计
- API 返回标准错误码
- 前端提交后禁用按钮，防重复提交

**Test scenarios**:
- 提交"赞"反馈 → 保存到数据库，返回 200
- 提交"踩"和文字反馈 → 两者都保存
- 无 x-user-id header → 返回 401
- 包含 SERP 快照 → 快照正确序列化到 DB
- 前端提交后，UI 显示"已提交"

**Verification**:
- FeedbackService.record() 返回有效 UUID
- 反馈正确保存到 tdk_feedback 表
- 前端提交成功后不重复提交
- 无认证时返回 401

---

- [ ] **Unit P3.6: Zustand Global State Management**

**Goal**: 实现跨页面的全局状态共享（编辑会话、批量操作进度）

**Requirements**: R5, R7

**Dependencies**: Unit P3.1

**Files**:
- Create: `frontend/src/store/tdkStore.ts` (Zustand store)
- Create: `frontend/src/hooks/useTdkStore.ts` (使用 hook)
- Modify: `frontend/src/components/TdkOptimizer.tsx` (集成 store)
- Create: `frontend/src/components/MultiPageAnalysisPanel.tsx` (新组件)
- Create: `frontend/tests/store/tdkStore.test.ts`

**Approach**:

1. **Zustand Store 定义**:
   ```typescript
   interface TdkStoreState {
     // 页面缓存
     pageCache: Map<string, {
       clusterId: string;
       title?: string;
       tdkJson?: TdkJson;
       userTdkJson?: UserTdkJson;
       lastFetched: ISO8601;
     }>;

     // 编辑会话（支持多页面并发编辑）
     editingSessions: Map<string, {
       clusterId: string;
       candidate: TdkCandidate;
       isDirty: boolean;
       lastSaved?: ISO8601;
     }>;

     // 批量操作进度
     batchOperation?: {
       status: "idle" | "running" | "completed";
       processed: number;
       total: number;
       results: Map<string, BatchResult>;
     };

     // 方法
     fetchTdk(clusterId: string): Promise<void>;
     startEditSession(clusterId: string, candidate: TdkCandidate): void;
     updateEditingCandidate(clusterId: string, updates: Partial<TdkCandidate>): void;
     saveTdk(clusterId: string): Promise<void>;
     clearEditSession(clusterId: string): void;
   }

   export const useTdkStore = create<TdkStoreState>((set, get) => ({
     pageCache: new Map(),
     editingSessions: new Map(),

     fetchTdk: async (clusterId) => {
       const cached = get().pageCache.get(clusterId);
       if (cached && Date.now() - new Date(cached.lastFetched).getTime() < 5*60*1000) {
         return;
       }

       const response = await fetch(`/api/clusters/${clusterId}/tdk`);
       const data = await response.json();

       set(state => ({
         pageCache: new Map(state.pageCache).set(clusterId, {
           clusterId,
           title: data.title,
           tdkJson: data.tdkJson,
           userTdkJson: data.userTdkJson,
           lastFetched: new Date().toISOString()
         })
       }));
     },

     startEditSession: (clusterId, candidate) => {
       set(state => ({
         editingSessions: new Map(state.editingSessions).set(clusterId, {
           clusterId,
           candidate: { ...candidate },
           isDirty: false
         })
       }));
     },

     updateEditingCandidate: (clusterId, updates) => {
       set(state => {
         const session = state.editingSessions.get(clusterId);
         if (!session) return state;

         return {
           editingSessions: new Map(state.editingSessions).set(clusterId, {
             ...session,
             candidate: { ...session.candidate, ...updates },
             isDirty: true
           })
         };
       });
     },

     saveTdk: async (clusterId) => {
       const session = get().editingSessions.get(clusterId);
       if (!session) throw new Error("No editing session");

       const response = await fetch(`/api/clusters/${clusterId}/tdk-save`, {
         method: "POST",
         body: JSON.stringify({ userTdkJson: session.candidate })
       });

       const data = await response.json();

       set(state => ({
         pageCache: new Map(state.pageCache).set(clusterId, {
           ...(state.pageCache.get(clusterId) || { clusterId, lastFetched: new Date().toISOString() }),
           userTdkJson: data.userTdkJson
         }),
         editingSessions: new Map(state.editingSessions).set(clusterId, {
           ...session,
           isDirty: false,
           lastSaved: new Date().toISOString()
         })
       }));
     },

     clearEditSession: (clusterId) => {
       set(state => {
         const newSessions = new Map(state.editingSessions);
         newSessions.delete(clusterId);
         return { editingSessions: newSessions };
       });
     }
   }));
   ```

2. **集成到 TdkOptimizer**:
   ```typescript
   function TdkOptimizer({ clusterId, projectId }: Props) {
     const store = useTdkStore();
     const pageData = store.pageCache.get(clusterId);

     useEffect(() => {
       store.fetchTdk(clusterId);
     }, [clusterId, store]);

     const handleEditCandidate = (candidate: TdkCandidate) => {
       store.startEditSession(clusterId, candidate);
     };

     const handleSave = async () => {
       await store.saveTdk(clusterId);
     };

     // 渲染...
   }
   ```

3. **多页面分析组件** (消费 store):
   ```typescript
   function MultiPageAnalysisPanel({ clusterIds }: { clusterIds: string[] }) {
     const store = useTdkStore();

     const getPageTdks = () => {
       return clusterIds.map(id => ({
         clusterId: id,
         tdkJson: store.pageCache.get(id)?.tdkJson
       }));
     };

     // 分析多页面冲突...
   }
   ```

**Patterns to follow**:
- Zustand 推荐的浅拷贝 + Map 模式（避免不必要重新渲染）
- 缓存 5 分钟策略
- 错误处理：async 方法 throw，调用方负责 catch

**Test scenarios**:
- `fetchTdk("cluster-1")` → pageCache 中出现该条目
- 缓存命中（<5 min）→ 不重新请求
- `startEditSession(clusterId, candidate)` → editingSessions 中出现，isDirty=false
- `updateEditingCandidate(clusterId, { title: "..." })` → isDirty=true
- `saveTdk(clusterId)` → userTdkJson 更新，isDirty=false，lastSaved 设置
- 多个页面的 editingSessions 独立维护

**Verification**:
- Store 创建和更新无内存泄漏
- 并发 fetchTdk 只触发一次 HTTP 请求
- 缓存过期后重新获取
- 所有异步操作返回 Promise

---

- [ ] **Unit P3.7: Multi-Page Query Endpoints (GET /tdk-summary, /conflict-report)**

**Goal**: 提供批量查询 API，支持多页面分析的数据聚合

**Requirements**: R5, R6

**Dependencies**: Unit P3.1, Unit P3.3, Unit P3.4

**Files**:
- Modify: `backend/src/api/tdk.ts` (新增 2 个 GET 端点)
- Create: `backend/src/services/multipage/aggregationService.ts`
- Modify: `backend/tests/api/tdk-db-integration.test.ts` (新增测试)

**Approach**:

1. **Endpoint 1: GET /projects/{projectId}/tdk-summary**
   ```typescript
   // 查询多个页面的 TDK 生成状态摘要
   // 用于 UI 展示"哪些页面已生成，哪些未生成"
   
   router.get("/projects/:projectId/tdk-summary", async (c) => {
     const { projectId } = c.req.param();
     const clusterIds = c.req.query("clusterIds")?.split(",") || [];  // "a,b,c"

     const plans = await db
       .select({
         clusterId: contentPlans.clusterId,
         title: contentPlans.title,
         hasGenerated: sql`tdkJson IS NOT NULL`,
         generationCount: contentPlans.tdkGenerationCount,
         lastGeneratedAt: contentPlans.tdkGeneratedAt,
         language: contentPlans.tdkLanguage
       })
       .from(contentPlans)
       .where(
         and(
           eq(contentPlans.projectId, projectId),
           inArray(contentPlans.clusterId, clusterIds)
         )
       );

     return c.json({ summaries: plans }, 200);
   });
   ```

   **返回**:
   ```json
   {
     "summaries": [
       {
         "clusterId": "cluster-1",
         "title": "Content Title",
         "hasGenerated": true,
         "generationCount": 2,
         "lastGeneratedAt": "2026-04-15T10:30:00Z",
         "language": "en"
       }
     ]
   }
   ```

2. **Endpoint 2: GET /projects/{projectId}/conflict-report**
   ```typescript
   router.get("/projects/:projectId/conflict-report", async (c) => {
     const { projectId } = c.req.param();
     const topicGroup = c.req.query("topicGroup");  // 可选，按分组过滤
     const language = c.req.query("language") as Language || "en";

     // 查询该主题下的所有页面
     let query = db
       .select({ clusterId: contentPlans.clusterId, tdkJson: contentPlans.tdkJson })
       .from(contentPlans)
       .where(eq(contentPlans.projectId, projectId));

     if (topicGroup) {
       query = query.where(eq(contentPlans.topicGroupId, topicGroup));
     }

     const plans = await query;

     // 调用 ConflictDetectionService
     const conflicts = ConflictDetectionService.detectMultipleConflicts(
       plans.map(p => ({
         clusterId: p.clusterId,
         keywords: p.tdkJson?.primary?.keywords || []
       })),
       language
     );

     return c.json({
       topicGroup,
       conflictCount: conflicts.length,
       conflicts,
       recommendation: generateRecommendation(conflicts)
     }, 200);
   });
   ```

   **返回**:
   ```json
   {
     "topicGroup": "baking-guide",
     "conflictCount": 2,
     "conflicts": [
       {
         "cluster1Id": "cluster-1",
         "cluster2Id": "cluster-2",
         "overlapKeywords": ["chocolate", "cookie"],
         "jaccardSimilarity": 0.75,
         "severity": "high"
       }
     ],
     "recommendation": "建议为 cluster-1 突出 '巧克力豆' 关键词..."
   }
   ```

3. **AggregationService** (支持实时和预计算两种模式):
   ```typescript
   class AggregationService {
     // 实时聚合（数据量<100 页时）
     static async realTimeConflictDetection(
       plans: ContentPlan[],
       language: Language
     ): Promise<ConflictResult[]> {
       // 应用层内存计算
     }

     // 预计算索引（未来，数据量>1000 页时）
     static async cachedConflictIndex(
       projectId: string,
       topicGroup?: string
     ): Promise<ConflictResult[]> {
       // 查询预计算的冲突表
     }
   }
   ```

**Patterns to follow**:
- 参考 TdkOptimizer 的 Zod 验证和错误处理
- 支持可选参数（topicGroup, language）
- 返回数据结构一致（始终是数组）

**Test scenarios**:
- 查询 3 个页面 → 返回 3 个摘要，正确的生成状态
- 无生成 TDK 的页面 → hasGenerated=false
- 按 topicGroup 过滤 → 仅返回该主题的页面
- 按 language 过滤 → 仅返回该语言的冲突
- 无冲突 → conflicts=[], 无建议

**Verification**:
- 摘要数据准确（生成计数、时间戳）
- 冲突检测逻辑一致（参考 Unit P3.3 的测试）
- 无认证时返回 401
- 非空 clusterIds 列表时返回数据

---

- [ ] **Unit P3.8: Cost Tracking & Rate Limiting Middleware**

**Goal**: 追踪 API 成本，实现用户级和项目级速率限制

**Requirements**: R6

**Dependencies**: Unit P3.1

**Files**:
- Create: `backend/src/services/cost/costTrackingService.ts`
- Create: `backend/src/middleware/rateLimitMiddleware.ts`
- Modify: `backend/src/api/tdk.ts` (集成中间件和成本记录)
- Create: `backend/tests/middleware/rateLimitMiddleware.test.ts`

**Approach**:

1. **CostTrackingService** (纯日志记录，无限流):
   ```typescript
   class CostTrackingService {
     static async logOperation(
       projectId: string,
       userId: string | undefined,
       operation: "generate" | "serp_fetch" | "analyze",
       tokensUsed: number,
       metadata?: Record<string, any>
     ): Promise<void> {
       const costId = crypto.randomUUID();
       const estimatedCost = calculateCost(operation, tokensUsed);

       await db.insert(tdk_cost_log).values({
         id: costId,
         project_id: projectId,
         user_id: userId,
         operation,
         tokens_used: tokensUsed,
         estimated_cost: estimatedCost,
         created_at: new Date().toISOString(),
         metadata_json: JSON.stringify(metadata)
       });
     }

     static async getProjectCost(
       projectId: string,
       dateFrom: string,
       dateTo: string
     ): Promise<CostSummary> {
       const logs = await db
         .select()
         .from(tdk_cost_log)
         .where(
           and(
             eq(tdk_cost_log.project_id, projectId),
             gte(tdk_cost_log.created_at, dateFrom),
             lte(tdk_cost_log.created_at, dateTo)
           )
         );

       return {
         totalTokens: logs.reduce((sum, l) => sum + l.tokens_used, 0),
         totalCost: logs.reduce((sum, l) => sum + l.estimated_cost, 0),
         byOperation: groupBy(logs, "operation")
       };
     }
   }

   function calculateCost(operation: string, tokensUsed: number): number {
     const costs = {
       "generate": 0.015 / 1000,  // $0.015 per 1K tokens (Claude Opus)
       "serp_fetch": 0.001,       // $0.001 per fetch (fixed)
       "analyze": 0.005           // $0.005 per analyze
     };
     return (costs[operation] || 0) * tokensUsed;
   }
   ```

2. **RateLimitMiddleware** (简单的内存限制器，后期升级到 Redis):
   ```typescript
   interface RateLimitConfig {
     maxTokensPerHour: number;  // 每小时最大 token 数
     maxRequestsPerMinute: number;  // 每分钟最大请求数
   }

   class RateLimiter {
     private tokenBuckets = new Map<string, { tokens: number; lastReset: number }>();
     private requestCounts = new Map<string, { count: number; lastReset: number }>();

     checkRateLimit(key: string, config: RateLimitConfig): boolean {
       const now = Date.now();

       // Token 桶算法（针对 API 成本）
       const tokenBucket = this.tokenBuckets.get(key) || { tokens: config.maxTokensPerHour, lastReset: now };
       const hourPassed = (now - tokenBucket.lastReset) / (1000 * 60 * 60) >= 1;

       if (hourPassed) {
         tokenBucket.tokens = config.maxTokensPerHour;
         tokenBucket.lastReset = now;
       }

       return tokenBucket.tokens > 0;
     }

     deductTokens(key: string, tokens: number) {
       const bucket = this.tokenBuckets.get(key);
       if (bucket) bucket.tokens -= tokens;
     }
   }

   export const rateLimitMiddleware = (limiter: RateLimiter) => {
     return async (c: Context, next: Next) => {
       const userId = c.req.header("x-user-id");
       const projectId = c.req.query("projectId");
       const key = `${projectId}:${userId}`;  // 按项目和用户分别限制

       const config = {
         maxTokensPerHour: 100000,  // 每小时 10 万 token
         maxRequestsPerMinute: 60   // 每分钟 60 请求
       };

       if (!limiter.checkRateLimit(key, config)) {
         return c.json(
           { error: "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" },
           429
         );
       }

       await next();
     };
   };
   ```

3. **在 API 中集成**:
   ```typescript
   // tdk.ts 中
   const limiter = new RateLimiter();

   router.use(
     "/tdk-optimize",
     rateLimitMiddleware(limiter)
   );

   router.post("/tdk-optimize", async (c) => {
     // ... 生成逻辑 ...
     const tokensUsed = result.metadata.tokensUsed;

     // 记录成本
     await CostTrackingService.logOperation(
       projectId,
       userId,
       "generate",
       tokensUsed,
       { clusterId, language }
     );

     // 扣除 token
     limiter.deductTokens(`${projectId}:${userId}`, tokensUsed);

     return c.json(result, 200);
   });
   ```

**Patterns to follow**:
- 参考 Express middleware 的设计
- 错误码参考现有约定 (429 = Rate Limit)
- 成本计算基于实际 token 消耗

**Test scenarios**:
- 在限额内的请求 → 通过，记录成本
- 超过每小时限额 → 返回 429
- 获取项目成本报告 → 正确聚合（按日期、按操作类型）
- 不同用户分别限制 → 互不影响

**Verification**:
- 成本日志完整记录所有操作
- 限流算法准确（token 桶）
- 无认证时返回 401（在 requireAuth 后）

---

- [ ] **Unit P3.9: Documentation & Migration Guide**

**Goal**: 文档化 Phase 3 的新功能、API、和数据迁移步骤

**Requirements**: R8（兼容性）

**Dependencies**: 所有其他单元

**Files**:
- Create: `docs/PHASE3_API.md` (新 API 文档)
- Create: `docs/PHASE3_MIGRATION.md` (迁移指南)
- Create: `docs/PHASE3_ARCHITECTURE.md` (架构设计文档)
- Modify: `README.md` (更新主项目概览)

**Approach**:

1. **PHASE3_API.md** (OpenAPI 风格):
   ```markdown
   # Phase 3 API Reference

   ## New Endpoints

   ### GET /projects/{projectId}/tdk-summary
   - Description: 查询多个页面的 TDK 生成状态
   - Query Params: clusterIds (逗号分隔)
   - Response: { summaries: TdkSummary[] }

   ### GET /projects/{projectId}/conflict-report
   - Description: 检测多页面关键词冲突
   - Query Params: topicGroup?, language?
   - Response: { conflicts: ConflictResult[], recommendation: string }

   ### GET /clusters/{clusterId}/serp-comparison
   - Description: 对标生成 TDK 与真实 SERP 排名
   - Response: { comparison: SerpComparisonResult[] }

   ### POST /clusters/{clusterId}/feedback
   - Description: 提交用户反馈（赞/踩）
   - Body: { type: "positive" | "negative", feedbackText?: string }
   - Response: { feedbackId: string }

   ### New Fields in GET /clusters/{clusterId}/tdk
   - serpDataJson: SERP 快照
   - topicGroupId: 主题分组 ID
   - relatedClusterIds: 关联页面列表
   ```

2. **PHASE3_MIGRATION.md** (向后兼容性指南):
   ```markdown
   # Phase 3 Migration Guide

   ## Data Model Changes

   ### New Optional Fields
   - contentPlans.topicGroupId
   - contentPlans.relatedClusterIds
   - contentPlans.serpDataJson
   - contentPlans.lastSerpFetchedAt

   ✅ **全部向后兼容** — 既有数据不受影响

   ### New Tables
   - tdk_feedback: 用户反馈
   - tdk_cost_log: 成本追踪

   ### Migration Steps
   1. 运行数据库迁移脚本
   2. 无需数据转换（字段可空）
   3. 可选：批量填充 topicGroupId（基于内容类型分组）

   ### Zero-Downtime Deployment
   - 部署新 API 时，旧端点仍可用
   - 新字段为可空，不影响既有查询
   - 建议灰度发布（10% → 50% → 100%）
   ```

3. **PHASE3_ARCHITECTURE.md** (设计决策文档):
   ```markdown
   # Phase 3 Architecture

   ## Component Overview
   1. SerpDataProvider: 可扩展的 SERP 数据源
   2. MultiPageAnalysisService: 多页面冲突检测
   3. FeedbackService: 反馈收集和统计
   4. CostTrackingService: 成本追踪和限流
   5. Zustand Store: 前端全局状态

   ## Key Design Decisions
   1. **SERP 数据源** — 起始模拟，后期升级真实 API
   2. **多页面关系** — 先字段后表，保持简洁
   3. **状态管理** — Zustand 支持跨页面编辑会话
   4. **成本控制** — 三层限流（库/API/用户）

   ## Scalability Path
   - <1000 页: 现有 JSON 存储 + 应用层聚合
   - 1000-100k 页: 规范化表 + 数据库索引
   - >100k 页: 缓存层（Redis）+ 异步预计算
   ```

**Patterns to follow**:
- Markdown 格式，GitHub 友好
- 示例包括真实的 cURL 或 fetch 调用
- 向后兼容性明确标记 ✅

**Test scenarios**:
- 文档中所有 API 示例都可工作
- 迁移步骤清晰且可自动化
- 架构文档和代码实现一致

**Verification**:
- 所有新 API 都在文档中有记载
- 迁移指南可供运维人员参考
- 架构文档同步代码注释

---

## System-Wide Impact

### Cross-Layer Effects

| 层 | 影响 | 缓解 |
|-----|------|------|
| **数据库** | 新表 (tdk_feedback, tdk_cost_log)，contentPlans 扩展 | 可空字段，无强约束 |
| **API** | 6 个新端点，成本追踪中间件 | 版本化 API，旧端点兼容 |
| **前端** | Zustand 依赖引入，跨组件状态共享 | 渐进迁移（先 TdkOptimizer，后其他） |
| **认证** | 中间件链变长（auth → rateLimit → ...） | 顺序明确，易于调试 |

### Callback & Middleware Chain

```
HTTP Request
    ↓
authenticateMiddleware (x-user-id)
    ↓
rateLimitMiddleware (token 桶)
    ↓
requestValidationMiddleware (Zod)
    ↓
API Handler (tdk.ts)
    ↓
CostTrackingService.logOperation()
    ↓
HTTP Response
```

**风险**: 中间件顺序错误会导致认证前限流。**缓解**: 单元测试覆盖中间件链。

### State Lifecycle & Cleanup

**前端状态**:
- pageCache 5 分钟过期 (自动)
- editingSessions 无自动清理 → 用户必须主动 clearEditSession
- 防止泄漏: 组件卸载时清理会话 (useEffect cleanup)

**后端状态**:
- cost_log 永久保存（审计需求）
- tdk_feedback 永久保存（学习需求）
- 定期归档（>1 年） → cold storage

### Error Propagation

```
SerpDataProvider.fetch()
  ↓ throws NetworkError
API Handler
  ↓ catches, 返回 { error: "SERP_FETCH_FAILED", code: "..." }
Frontend useFeedbackSubmission
  ↓ useMutation error
UI
  ↓ 显示 "无法获取 SERP 数据，请重试"
```

### Unchanged Invariants

- **既有 TDK 生成流程**: Phase 2 的 POST /tdk-optimize 行为完全不变
- **数据分离模式**: userTdkJson 和 tdkJson 继续独立存储
- **验证规则**: TdkValidatorService 逻辑不变（仅 Phase 3.9 文档化）
- **认证要求**: 所有端点继续要求 x-user-id header

---

## Risks & Dependencies

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| SERP 数据源 API 变更 | 中 | 需代码适配 | 抽象 SerpDataProvider，支持多实现 |
| 多页面关系建模不足 | 低 | 需 Phase 3.5 重构 | 设计支持从字段 → 表的迁移 |
| 成本追踪 token 计数不准 | 低 | 财务影响 | 定期审计，基于真实 API 统计 |
| Zustand 状态不一致 | 低 | 编辑冲突 | 单元测试 + DevTools 调试 |
| 数据库规范化延迟 | 中 | 1000+ 页后查询变慢 | 预留 migration 脚本，Phase 4 执行 |

### 外部依赖

- **Claude Opus API**: SERP 对标时可能需要文本相似度分析（未来可用 embedding）
- **npm 库**: `string-similarity` 或 `js-levenshtein` 用于文本相似度计算
- **SQLite**: 现有，无新依赖

---

## Open Questions (Deferred to Implementation)

- **SERP 相似度算法**: 使用 Jaro-Winkler（快，浅） 还是 BERT embedding（慢，精）？
  - **决议**: Phase 3 用 Jaro-Winkler，Phase 4 升级 embedding
- **反馈聚合的粒度**: 按页面、项目、还是用户？
  - **决议**: Phase 3 仅存储原始反馈，Phase 4 计算聚合统计
- **批量 SERP 查询的并发度**: 串行还是并发？
  - **决议**: Phase 3 串行（速度可接受），Phase 4 考虑队列系统

---

## Success Metrics

✅ **功能完成**:
- 6 个新 API 端点全部可用，文档完整
- Zustand store 支持多页面编辑会话
- SERP 对标和冲突检测算法正确

✅ **质量指标**:
- 所有新代码 unit tests >80% 覆盖率
- 数据库迁移脚本 可回滚
- API 端点 <200ms 响应时间 (5K 页规模)

✅ **兼容性**:
- Phase 2 的所有现有 API 行为不变
- 既有数据可查询，无修复需要
- 灰度发布支持

---

## 执行顺序

```
Week 1:
├── P3.1 Schema Extension (1 day)
├── P3.2 SerpDataProvider (1 day)
└── P3.3 MultiPageAnalysisService (1.5 days)

Week 2:
├── P3.4 SERP Comparison API (1 day)
├── P3.5 Feedback API + Frontend (1.5 days)
└── P3.6 Zustand Store (1 day)

Week 3:
├── P3.7 Multi-Page Query Endpoints (1 day)
├── P3.8 Cost Tracking & Rate Limiting (1.5 days)
└── P3.9 Documentation & Testing (1 day)

Week 4 (可选):
└── 性能优化、压力测试、文档完善
```

---

## 关键文件路径总结

**新增文件** (19 个):
- `backend/src/db/migrations/0002_phase3_schema_extension.sql`
- `backend/src/services/serp/serpDataProvider.ts`
- `backend/src/services/serp/mockSerpDataProvider.ts`
- `backend/src/services/serp/serpComparisonService.ts`
- `backend/src/services/multipage/multiPageAnalysisService.ts`
- `backend/src/services/multipage/conflictDetectionService.ts`
- `backend/src/services/feedback/feedbackService.ts`
- `backend/src/services/cost/costTrackingService.ts`
- `backend/src/middleware/rateLimitMiddleware.ts`
- `frontend/src/store/tdkStore.ts`
- `frontend/src/hooks/useFeedbackSubmission.ts`
- `frontend/src/components/MultiPageAnalysisPanel.tsx`
- `docs/PHASE3_API.md`
- `docs/PHASE3_MIGRATION.md`
- `docs/PHASE3_ARCHITECTURE.md`
- 以及 9 个测试文件

**修改文件** (6 个):
- `backend/src/api/tdk.ts` (6 个新路由)
- `backend/src/db/schema.ts` (4 个新字段 + 2 个新表)
- `backend/src/db/index.ts` (初始化新表)
- `frontend/src/components/TdkOptimizer.tsx` (集成反馈 UI)
- `frontend/tests/components/TdkOptimizer.test.tsx` (新测试)
- `README.md` (更新概览)
