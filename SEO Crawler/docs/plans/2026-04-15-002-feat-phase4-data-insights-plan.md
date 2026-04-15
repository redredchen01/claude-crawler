---
date: 2026-04-15
topic: feat-phase4-data-insights
type: feat
status: active
---

# SEO Crawler Phase 4 — 数据洞察优化与本地分析引擎 (Technical Plan)

## Overview

此计划实现SEO Crawler的第4阶段：**本地数据分析引擎**。目标是为用户提供关键词难度评分、竞争对手识别、ROI排序、趋势分析和主题聚类等可操作的洞察，**无需第三方付费API**。

**规模**：9个实现单元，3个阶段  
**预期工期**：2-3周（取决于并行度）  
**依赖**：Phase 3前端已完成，后端API已就绪

---

## System-Wide Decisions

| 决策 | 选项 | 原因 |
|------|------|------|
| **难度评分算法** | 加权启发式（结果数0.4 + 品牌竞争0.3 + 域名权重0.3） | 可解释性强，无需训练数据 |
| **搜索量估计** | 本地启发式（基于竞争程度） | 避免外部API依赖，启用ROI排序 |
| **竞争对手定义** | SERP Top 10（动态计算） | 简化维护，保持动态性 |
| **历史追踪** | task_runs表（时间序列） | 支持趋势识别，最小化schema改动 |
| **聚类算法** | 层次凝聚聚类（Jaccard + Intent 0.6/0.4） | 平衡准确性和性能 |
| **可视化库** | Recharts + Nivo（前端） | React友好，SSR兼容 |
| **报告生成** | html2canvas + jsPDF（前端）/ Node canvas（后端） | 支持离线生成，无Playwright依赖 |

---

## Implementation Units

### Phase 4.1: 基础分析引擎（难度、竞争、ROI）

#### 4.1.1 难度评分计算服务（后端）

**Goal**  
实现DifficultyScoreService，基于SERP特征为每个关键词计算0-100的难度评分。

**Files**  
- `backend/src/services/difficultyScoreService.ts` (新建, ~200 LOC)
- `backend/tests/services/difficultyScoreService.test.ts` (新建, ~150 LOC)
- `backend/dist/services/difficultyScoreService.js` (编译产物)

**Approach**  
1. 接收JobResult数组（包含searchResultCount、topDomains、intent等）
2. 实现3部分加权公式：
   - 结果数标准化 (log scale, 0-100)
   - 品牌域名出现次数 (Top 10中品牌频率×3)
   - 平均域名权重估计 (基于brand indicators如google.com/wikipedia.org)
3. 返回难度评分object: { keyword, difficulty, factors: { resultCount, brandCompetition, domainWeight } }

**Patterns to follow**  
- 参考 `backend/src/services/scoringService.js` 的加权计算模式
- 参考 `backend/src/services/classificationService.js` 的domain解析逻辑

**Test scenarios**  
- 低难度 (结果<10K, 无品牌): ~15
- 中等难度 (结果100K, 1-2个品牌): ~45
- 高难度 (结果>1M, 3+品牌): ~75
- 极难 (结果>10M, 5+品牌): ~95
- 边界: 结果数=0时处理

**Verification**  
- [ ] 50个测试关键词的难度评分符合预期范围
- [ ] difficulty值总是0-100范围内
- [ ] factors详细展示打分依据

---

#### 4.1.2 竞争对手识别与分析服务（后端）

**Goal**  
实现CompetitorAnalysisService，自动识别SERP Top 10网站并提取竞争对手信息。

**Files**  
- `backend/src/services/competitorAnalysisService.ts` (新建, ~250 LOC)
- `backend/tests/services/competitorAnalysisService.test.ts` (新建, ~180 LOC)

**Approach**  
1. 从JobResult的topDomains中提取Top 10 URL
2. 为每个竞争对手计算：
   - domain normalize (example.com → example)
   - ranking_position (1-10)
   - is_brand (启发式：google.com/amazon.com等)
   - content_type (blog/news/product page通过启发式判断)
   - estimated_domain_authority (0-100, 基于domain patterns)
3. 支持过滤：exclude_brands=true时排除大品牌
4. 返回 { competitors: [ { domain, position, isB

rand, contentType, authority } ], totalCount }

**Patterns to follow**  
- 参考现有的domain提取逻辑
- 参考scoringService中的品牌判断启发式

**Test scenarios**  
- 竞争对手3-10个范围
- 混合品牌与非品牌域名
- 品牌过滤开启时无大品牌出现
- 同一根domain不重复

**Verification**  
- [ ] Top 10竞争对手准确识别，无重复
- [ ] 品牌过滤功能正常
- [ ] authority评分合理分布

---

#### 4.1.3 ROI评分与排序服务（后端）

**Goal**  
实现RoiScoringService，计算ROI评分并排序关键词优先级。

**Files**  
- `backend/src/services/roiScoringService.ts` (新建, ~150 LOC)
- `backend/tests/services/roiScoringService.test.ts` (新建, ~120 LOC)

**Approach**  
1. 接收keyword list，包含difficulty和competitorCount
2. 计算searchVolumeEstimate = log(resultCount) × competitorCount (启发式)
3. 计算ROI评分 = (searchVolumeEstimate / (difficulty + 1)) × ln(competitorCount + 1)
4. 排序并标注rank
5. 返回 { keyword, difficulty, roiScore, rank, searchVolumeEstimate }

**Patterns to follow**  
- 参考scoringService的公式计算模式

**Test scenarios**  
- 低难度+高竞争 → 高ROI
- 高难度+低竞争 → 低ROI
- 竞争对手数=0时处理
- 排序顺序正确（ROI高在前）

**Verification**  
- [ ] ROI评分排序正确，Top 1最高
- [ ] 公式合理反映"简单且有搜索量"的词获高分

---

#### 4.1.4 洞察仪表板前端组件

**Goal**  
实现InsightsDashboard React组件，展示难度分布、ROI排行、竞争对手热力图。

**Files**  
- `frontend/src/components/InsightsDashboard.tsx` (新建, ~600 LOC)
- `frontend/src/hooks/useInsightsData.ts` (新建, ~100 LOC)
- `frontend/styles/insights.module.css` (新建, ~200 LOC)
- `frontend/pages/jobs/[id]/insights.tsx` (新建, 作为tab页面)

**Approach**  
1. 在job结果页面新增"洞察"tab（现有"原始结果"tab旁）
2. 实现3个主要可视化组件：
   - 难度分布直方图 (Recharts BarChart, 0-20/21-50/51-80/81-100)
   - ROI Top 10表 (TanStack React Table, 可排序)
   - 竞争对手热力图 (Nivo Heatmap, domain × frequency)
3. 快速筛选：难度范围、ROI范围、分群（Phase 4.2后启用）、趋势标签
4. 结果表格增强：新增难度/ROI/分群列

**Patterns to follow**  
- 参考 `frontend/pages/jobs/[id].tsx` 的table结构和过滤逻辑
- 参考globals.css的样式模式（badge, table)
- 参考现有的filtering state管理（useState + useEffect）

**Test scenarios**  
- 渲染3个图表无错误
- 难度直方图数据正确分桶
- ROI表可排序，Top 1最高
- 热力图显示竞争对手频率
- 筛选后图表和表格同时更新

**Verification**  
- [ ] 3个图表正确渲染，无错误
- [ ] 数据与后端API响应对应
- [ ] 筛选交互流畅

---

### Phase 4.2: 趋势与分群（历史对比、语义分组）

#### 4.2.1 任务历史跟踪Schema（后端）

**Goal**  
扩展数据库schema，支持多次爬取的历史追踪和趋势分析。

**Files**  
- `backend/src/migrations/001_add_task_runs_table.sql` (新建, ~80 LOC)
- `backend/src/db/schema.ts` (修改, +TaskRun interface)
- `backend/src/models/TaskRun.ts` (新建, ~100 LOC)

**Approach**  
1. 新建task_runs表：
   ```sql
   CREATE TABLE task_runs (
     id UUID PRIMARY KEY,
     job_id UUID FOREIGN KEY,
     run_number INT,
     created_at TIMESTAMP,
     difficulty_snapshot JSON,
     competitor_snapshot JSON,
     roi_snapshot JSON,
     trend_score INT
   )
   ```
2. 修改jobs表添加current_run_number字段
3. 实现TaskRun model的CRUD操作

**Patterns to follow**  
- 参考现有migration模式

**Test scenarios**  
- 创建task_run成功
- 多个runs按顺序记录
- snapshot完整捕获当时的分析数据

**Verification**  
- [ ] 创建/读取/更新task_runs正常
- [ ] 现有jobs功能不受影响

---

#### 4.2.2 趋势分析服务（后端）

**Goal**  
实现TrendAnalysisService，对比多次爬取结果，识别难度/竞争/ROI趋势。

**Files**  
- `backend/src/services/trendAnalysisService.ts` (新建, ~300 LOC)
- `backend/tests/services/trendAnalysisService.test.ts` (新建, ~200 LOC)

**Approach**  
1. 接收job_id和两个run snapshots (前次 vs 当前)
2. 计算变化指标：
   - difficulty_delta = current - previous
   - competitor_count_delta
   - roi_delta
3. 分类标签：
   - 🔥 新机会 (difficulty ↓ 10+)
   - 📈 上升 (competitor_count ↑ 2+)
   - ⬇️ 饱和 (difficulty ↑ 15+ AND competitor_count ↑ 3+)
   - → 保持 (无显著变化)
4. 返回 { keyword, previousMetrics, currentMetrics, trendLabel, recommendation }

**Patterns to follow**  
- 参考difficultyScoreService的逻辑结构

**Test scenarios**  
- 难度下降 → 新机会标签
- 竞争对手增加 → 上升标签
- 小幅波动 → 保持标签
- 首次爬取无前序数据 → 无趋势标签

**Verification**  
- [ ] 趋势标签准确反映变化方向
- [ ] 推荐文字清晰可操作

---

#### 4.2.3 关键词聚类服务（后端）

**Goal**  
实现ClusteringService，基于语义和意图对关键词进行聚类。

**Files**  
- `backend/src/services/clusteringService.ts` (新建, ~400 LOC)
- `backend/tests/services/clusteringService.test.ts` (新建, ~250 LOC)

**Approach**  
1. 实现混合相似度度量：
   - Jaccard相似度（词重叠）权重0.6
   - 意图匹配（classification结果）权重0.4
   - 特殊处理：exact match = 1.0, intent match = +0.3
2. 使用层次凝聚聚类（linkage='average'）
3. 阈值0.6自动确定簇数
4. 为每个簇计算特征：
   - centroid_keyword (中心词)
   - avg_difficulty
   - avg_roi_score
   - shared_competitors
   - recommendation (针对该簇的优化建议)

**Patterns to follow**  
- 参考classificationService的意图提取逻辑

**Test scenarios**  
- 相似词聚为一簇 (e.g., "seo" + "search engine optimization")
- 不同意图词分离 (e.g., "python programming" vs "python snake")
- 簇内词数合理 (3-20个词)
- 簇特征摘要准确

**Verification**  
- [ ] 聚类结果符合语义直觉
- [ ] 簇特征准确反映共同特点
- [ ] 推荐建议具体可操作

---

### Phase 4.3: 高级导出与报告

#### 4.3.1 增强型CSV导出（后端API + 前端集成）

**Goal**  
增强CSV导出，包含难度、ROI、分群、趋势等新数据。

**Files**  
- `backend/src/routes/export.ts` (修改, +新列处理)
- `frontend/src/components/ExportButton.tsx` (修改, 支持报告格式选择)

**Approach**  
1. 修改CSV生成逻辑，新增列：
   - difficulty (R1实现的难度评分)
   - roi_score (R3实现的ROI评分)
   - cluster_id (R5实现的分群ID)
   - cluster_name
   - trend_label (R4实现的趋势标签)
   - recommendation
2. 保持原有列顺序，新列追加在末尾
3. 前端UI：添加导出选项菜单（CSV/Report）

**Patterns to follow**  
- 参考现有的CSV导出实现

**Test scenarios**  
- 导出CSV包含所有新列
- 数据准确无遗漏
- 特殊字符（如逗号）正确转义

**Verification**  
- [ ] CSV文件可在Excel/Sheets中打开
- [ ] 新列数据完整准确

---

#### 4.3.2 HTML/Markdown批量报告生成（后端）

**Goal**  
实现报告生成服务，生成可分享的HTML/Markdown摘要报告。

**Files**  
- `backend/src/services/reportGeneratorService.ts` (新建, ~350 LOC)
- `backend/tests/services/reportGeneratorService.test.ts` (新建, ~150 LOC)
- `backend/src/routes/reports.ts` (新建, 报告API路由)

**Approach**  
1. 接收job_id，生成结构化报告包含：
   - Executive Summary (总体统计：词数、平均难度、平均ROI)
   - 难度分布 (表格：简/中/难/极难 各占比)
   - Top 10 ROI词表 (markdown表)
   - 推荐优化词库 (按ROI排序，前30个)
   - 竞争对手总结 (出现最频繁的10个)
   - 聚类优化策略 (按簇分组的建议)
   - 趋势识别 (新机会/饱和词汇)
2. 输出格式：
   - HTML (带基础样式，可直接打开)
   - Markdown (易于嵌入博客/文档)
3. API: `GET /api/jobs/:id/report?format=html|markdown`

**Patterns to follow**  
- 参考现有的API响应结构

**Test scenarios**  
- 生成HTML格式，包含所有部分
- 生成Markdown格式，格式正确
- 表格数据准确
- 无HTML/Markdown语法错误

**Verification**  
- [ ] HTML报告可在浏览器中正确显示
- [ ] Markdown可在标准渲染器中正确显示
- [ ] 所有数据准确，无遗漏

---

## Dependencies & Sequencing

```
4.1.1 (难度评分) ─┐
4.1.2 (竞争对手) ─┤
4.1.3 (ROI评分)  ─┼─→ 4.1.4 (前端仪表板)
                  │
                  └─→ 4.2.1 (历史schema)
                       ├─→ 4.2.2 (趋势分析)
                       ├─→ 4.2.3 (聚类)
                            ├─→ 4.3.1 (CSV导出)
                            └─→ 4.3.2 (报告生成)
```

**关键路径**：4.1.1 → 4.1.2 → 4.1.3 → 4.1.4 → 4.2.1 → 4.2.2 → 4.2.3 → 4.3.1 & 4.3.2 (并行)

---

## Test Strategy

| 类型 | 覆盖范围 | 工具 |
|------|---------|------|
| **单元测试** | 各Service的逻辑计算 | Jest |
| **集成测试** | API端点 → Service → DB | Supertest + SQLite |
| **E2E测试** | 完整工作流 (create job → compute insights → export) | Cypress/Playwright |
| **性能测试** | 1000+关键词的聚类 < 5s, API < 200ms | k6或ab |

---

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **聚类算法性能** | 1000+词可能超时 | 采用增量式聚类 + 结果缓存 |
| **难度权重不准** | 用户不认可评分 | Phase 1后收集用户反馈，迭代权重 |
| **内存溢出（大数据集）** | 报告生成崩溃 | 流式处理 + 分页生成 |

---

## Execution Checklist

- [ ] Phase 4.1 单元4个全部完成，API集成测试通过
- [ ] Phase 4.2 单元3个全部完成，多run支持验证
- [ ] Phase 4.3 单元2个全部完成，报告输出验证
- [ ] 完整工作流E2E测试通过
- [ ] PR代码审查通过（全tier 2）
- [ ] 性能基准测试通过 (P95 < 500ms)
- [ ] 文档完成 (API doc + 使用指南)
- [ ] 部署清单完成

---

## 后续阶段 (Phase 5)

- **Playwright集成**：通过浏览器自动化捕获search bar dropdown、related questions、People Also Ask
- **GSC整合**：支持导入Google Search Console真实搜索数据，优化search volume估计
- **自动化任务**：定时爬取 + 邮件报告
- **多用户支持**：团队协作、任务共享

---

**计划完成时间**：2026-04-15  
**执行开始时间**：2026-04-15  
**状态**：✅ Ready for Execution  
