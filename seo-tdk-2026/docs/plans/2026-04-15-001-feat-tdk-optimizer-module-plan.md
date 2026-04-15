---
title: feat: TDK Optimizer Module - Phase 6 Integration
type: feat
status: active
date: 2026-04-15
origin: docs/brainstorms/2026-04-15-tdk-optimizer-requirements.md
---

# TDK 优化器模块 — Phase 6 集成实现计划

## Overview

在 Phase 6 (SEO Content System) 中新增 **TDK 优化器模块**，为编辑提供自动化的 Title、Description、Keywords 生成与验证。通过复用现有的 Claude API 生成、分类规则、和多语言服务，以最小的新代码实现最大的功能覆盖。

**核心价值：**
- 编辑生成 TDK 从 15 分钟 → 2 分钟（工具生成 + 验证）
- 减少 SEO 专家审核负担（自动检测堆砌、长度、一致性问题）
- 集成到现有 Phase 6 UI（无独立工具学习曲线）

## Problem Frame

内容编辑手工编写 Title/Description 容易出错、耗时低效。当前流程：编辑猜测 → SEO 专家审核 → 多轮反馈。TDK 优化器将规则驱动检查（长度、堆砌、一致性）与 AI 辅助生成结合，前置在编辑端，减少后续返工。

（参考源文档 Problem Frame；已验证用户需求为"单一最优推荐 + 2-3 备选"，而非三维度）

## Requirements Trace

- **R1. 输入与基础信息** — 支持主题词、核心关键词、内容摘要输入；支持手工修改和实时更新推荐
- **R2. Title 生成与推荐** — 生成 1 个最优推荐 + 2-3 备选；展示长度计数和检查状态
- **R3. Meta Description 生成** — 生成 1 个最优推荐 + 2-3 备选；展示长度和关键词覆盖状态
- **R4. 长度检查** — Title/Description/Keywords 长度验证（中英文分别）；可用户配置范围
- **R5. 堆砌检测** — 关键词重复检测和密度异常标记；提供修复建议
- **R6. 一致性检查** — 提取内容核心词，检查 Title/Description 是否覆盖
- **R7. Keywords 推荐** — 生成 8-12 个关键词列表；支持手工编辑

## Scope Boundaries

- **包含** — 规则验证、单一最优推荐 + 2-3 备选、与 Phase 6 集成、长度和堆砌检测、基础一致性检查
- **不包含** — SERP 实时排名抓取、竞品对标、多语言自动翻译（支持中英文规则分离）
- **集成约束** — 作为 Phase 6 contentPlans 模块扩展；生成的 TDK 直接保存到新 tdkJson 字段；复用现有 Claude API、ClassificationService、MultiLanguageService

## Context & Research

### 相关代码与模式

**现有生成服务（可复用）：**
- `ContentBriefService.ts` — 已支持 Title + MetaDescription 生成（via Claude API）
  - Prompt 已包含长度指导：Title 50-60 字符（英文）、Description 150-160 字符（英文）
  - 输出格式：JSON ContentBrief 接口，含 targetKeywords（primary/secondary/longtail）
  - **复用方式**：扩展 buildBriefPrompt 以包含"生成 2-3 个备选方案"逻辑

**现有验证/分类服务（可复用）：**
- `ClassificationService.ts` — 中英文规则指标集（Question, Comparison, Price, Brand, Location 等）
  - **复用方式**：用于 TDK 验证时参考关键意图应包含的标记词
- `MultiLanguageService.ts` — 中文规则分离 + 密度检查逻辑
  - **复用方式**：复用密度计算为堆砌检测的基础

**现有数据模型（可扩展）：**
- `contentPlans` 表已有 Phase 6 编辑字段（userBriefJson, isUserEdited, editedAt）
  - **扩展方式**：新增 tdkJson、tdkValidation（验证结果缓存）字段

**现有 API 端点（可扩展）：**
- `PATCH /api/projects/{projectId}/clusters/{clusterId}/content-plan` — 已支持 Brief 编辑
  - **扩展方式**：添加 tdkJson 到请求/响应体

### 制度学习

- **数据分离模式（Phase 6）**：AI 推荐 JSON + 用户编辑 JSON 分离存储，允许用户保留原推荐和重新生成
- **策略架构（Phase 1）**：规则采用 Strategy 模式实现，配置驱动而非硬编码，提升可维护性
- **配置外部化（Phase 8）**：规则阈值（长度、堆砌门槛等）通过环境变量或配置文件外部化，支持后续微调
- **可观测性（Phase 8）**：暴露 Prometheus 指标，便于线上监控

### 外部参考

- 无额外外部研究需求；复用现有项目模式

## 关键技术决策

| 决策 | 理由 |
|------|------|
| **复用 ContentBriefService** | 已验证可用，Prompt 包含长度规范；避免重复实现 AI 调用层 |
| **扩展 contentPlans 表** | 复用现有编辑 UI 和 API；tdkJson 字段为新 TDK 推荐 + 验证结果 |
| **按钮触发生成（非实时）** | 控制 Claude API 成本；避免每次输入变化都调用模型（防止成本爆炸、卡顿） |
| **单一最优 + 2-3 备选** | 简化编辑决策（vs 三维度），同时保留对比灵活性 |
| **规则外部化为配置** | 遵循 Phase 8 模式；支持后续长度标准、堆砌阈值微调（无需代码改动） |
| **数据分离（AI + 用户）** | 遵循 Phase 6 模式；允许编辑保留原推荐和多次重新生成 |

## 开放问题

### 规划时已解决

- ✅ **SEO 策略维度** — 确认为"单一最优推荐"（而非三维度）
- ✅ **集成位置** — Phase 6 contentPlans 模块扩展（vs 独立工具）

### 规划中需要解决

- **Q1. 中文 TDK 长度标准确认**
  - Title: 25-30 汉字？ (code 中仅有英文 50-60 字符)
  - Description: 75-80 汉字？ (code 中仅有英文 150-160 字符)
  - **决议**：从 code 中提取现有标准；若无，与 SEO 团队确认标准值，写入 TDK_RULES.md

- **Q2. 堆砌检测算法详细**
  - 同一词重复 2 次算堆砌？还是依赖密度？
  - 关键词密度多少% 算异常？(建议 >8%)
  - 虚词（"的"、"和"）是否计入？
  - **决议**：定义 3-5 个具体检测场景和阈值

- **Q3. 一致性检查实现**
  - TF-IDF vs 简单词频？(简单词频更易实现，足够 MVP)
  - 核心词提取多少个？(建议 5-8 个)
  - **决议**：采用简单词频作为 MVP；TF-IDF 可作为 Phase 2 优化

### 推迟到实现

- **Q4. API 响应性能** — 单个 TDK 生成耗时多少？(预计 Claude API 2-3 秒)；需基准测试确认
- **Q5. Keywords 数据源** — 复用 Phase 1 Expansion Service vs 新实现？
- **Q6. UI 布局** — React 组件嵌入 contentPlan 编辑页的确切位置和样式

## High-Level Technical Design

> *以下为方向性设计，非实现规范。实现者应以此为上下文，而非逐行复制。*

**TDK 优化器核心流程：**

```
User Input (topic, keywords, content snippet)
        ↓
Validate Input (非空、长度合理)
        ↓
AI Generation (Claude API via TdkGeneratorService)
  ├─ Generate Primary Recommendation
  ├─ Generate 2-3 Alternatives
  └─ Return with metadata (model_version, generated_at)
        ↓
Rule-Based Validation (TdkValidatorService)
  ├─ Title Length Check (R4.1: 中文 25-30 / 英文 50-60)
  ├─ Description Length Check (R4.2: 中文 75-80 / 英文 150-160)
  ├─ Keyword Stacking Detection (R5: 词频密度 >8% 或同词 2+ 次)
  ├─ Content Consistency Check (R6: 核心词覆盖度)
  └─ Return validation result per candidate
        ↓
Store in contentPlans.tdkJson (新字段)
  {
    primary: { title, description, keywords, validations },
    alternatives: [ { title, description, keywords, validations } ],
    metadata: { generated_at, language, model_version }
  }
        ↓
User Edit & Save (via existing PATCH /api/contentPlan endpoint)
  └─ contentPlans.userTdkJson (保留编辑版本，分离存储)
```

**数据模型：**

```typescript
// 新增字段到 contentPlans 表
interface ContentPlanTDK {
  tdkJson: {
    primary: TdkCandidate;
    alternatives: TdkCandidate[];
    metadata: { generated_at: Date; language: 'en' | 'zh'; model_version: string };
  };
  userTdkJson?: {
    // 用户编辑后的版本（遵循 Phase 6 数据分离模式）
    title?: string;
    description?: string;
    keywords?: string[];
  };
  tdkValidations: {
    primary: ValidationResult;
    alternatives: ValidationResult[];
  };
}

interface TdkCandidate {
  title: string;
  description: string;
  keywords: string[];
}

interface ValidationResult {
  titleLength: { status: 'pass' | 'warn' | 'fail'; message: string };
  descriptionLength: { status: 'pass' | 'warn' | 'fail'; message: string };
  keywordStacking: { status: 'pass' | 'warn' | 'fail'; issues: StackingIssue[] };
  contentConsistency: { status: 'pass' | 'warn' | 'info'; coverage: number };
}
```

## 实现单元

### Unit 1: TDK 规范和验证规则定义

**目标：** 从代码/文档提取现有 TDK 规范；定义堆砌检测、长度检查、一致性检查的具体算法和阈值。

**需求：** R4, R5, R6

**依赖：** 无（前提条件）

**文件：**
- Create: `docs/TDK_RULES.md` — 规范文档（5-10 个实例，完整参数）
- Create: `backend/src/services/tdk/tdkRules.ts` — 规则常量和算法实现
- Create: `backend/tests/services/tdk/tdkRules.test.ts` — 规则验证测试

**方法：**
- 从 `contentBriefService.ts` 提取 Prompt 中的长度指导
- 确认中文长度标准（与 SEO 团队确认或从 Phase 1-6 代码搜索）
- 定义堆砌检测阈值（关键词密度 >8%、同词 2+ 次）
- 定义一致性检查（简单词频，Top 5-8 词）
- 编写 TDK_RULES.md：包含规范、5 个 Title 例子、5 个 Description 例子、3 个堆砌检测场景

**执行注记：** Test-first — 先写 tdkRules.test.ts 列举具体场景，再实现算法

**模式遵循：** 参考 Phase 1 ClassificationService 的规则组织方式

**测试场景：**
- **长度检查**：
  - Happy path: Title "25-30 汉字" 通过✓
  - Edge case: Title "30 汉字" 边界值通过✓
  - Edge case: Title "31 汉字" 警告⚠️
  - Error: Title "15 汉字" 失败✗
- **堆砌检测**：
  - Happy path: 关键词不重复，密度 <8% 通过✓
  - Warning: 同词出现 2 次，密度 8-10% 警告⚠️
  - Fail: 同词出现 3+ 次或密度 >15% 失败✗
- **一致性检查**：
  - Integration: 内容包含"Python教程"，Title 包含"Python" 或"教程" 任一，通过✓
  - Integration: 内容全是"数据分析"，Title 无相关词，标记为弱⚠️

**验证：**
- TdkRules 所有测试通过 ✓
- TDK_RULES.md 包含完整参数和 10+ 实例 ✓

---

### Unit 2: TdkGeneratorService 和 TdkValidatorService 实现

**目标：** 实现两个核心服务：生成推荐（复用 Claude API）和验证候选（应用规则）。

**需求：** R2, R3, R5, R6, R7

**依赖：** Unit 1 (TdkRules)

**文件：**
- Create: `backend/src/services/tdk/tdkGeneratorService.ts` — 生成服务
- Create: `backend/src/services/tdk/tdkValidatorService.ts` — 验证服务
- Create: `backend/tests/services/tdk/tdkGeneratorService.test.ts` — 生成测试
- Create: `backend/tests/services/tdk/tdkValidatorService.test.ts` — 验证测试
- Modify: `backend/src/services/contentBriefService.ts` — 提取和扩展 buildBriefPrompt

**方法：**

**TdkGeneratorService：**
- 复用 `ContentBriefService.buildBriefPrompt()` 的核心 Prompt 框架
- 扩展 Prompt 以生成"primary + 2 alternatives"（而非仅 primary）
- 调用 Claude API (@anthropic-ai/sdk) 获取 JSON 响应
- 解析响应为 TdkCandidate[] 数组
- 添加 metadata（generated_at, model_version, language）

**TdkValidatorService：**
- 导入 Unit 1 的 tdkRules
- 对每个 TdkCandidate 执行：
  - titleLength 检查（调用 tdkRules.validateTitleLength）
  - descriptionLength 检查
  - keywordStacking 检查
  - contentConsistency 检查
- 返回 ValidationResult[] 与 candidates 一一对应

**执行注记：** Start with integration test for Claude API contract (mock response structure)

**模式遵循：** 参考 Phase 8 RateLimitService 的外部 API 调用模式（含重试、错误处理）

**技术设计（伪代码）：**

```typescript
class TdkGeneratorService {
  async generateRecommendations(
    topic: string,
    keywords: string[],
    contentSnippet?: string,
    language: 'en' | 'zh' = 'zh'
  ): Promise<TdkCandidate[]> {
    const prompt = this.buildTdkPrompt(topic, keywords, contentSnippet, language);
    const response = await this.claudeClient.messages.create({
      model: 'claude-opus-4-6', // 或从 env 配置
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const jsonContent = response.content[0].text;
    const parsed = JSON.parse(jsonContent); // { primary: {...}, alternatives: [...] }
    
    return [parsed.primary, ...parsed.alternatives];
  }
  
  private buildTdkPrompt(topic, keywords, content, language): string {
    // 基于 ContentBriefService.buildBriefPrompt，扩展为生成多个版本
    return `
      Generate Title and Meta Description for a page about: ${topic}
      Primary keywords: ${keywords.join(', ')}
      Page content snippet: ${content || 'N/A'}
      
      Return JSON with:
      {
        "primary": { "title": "...", "description": "...", "keywords": [...] },
        "alternatives": [
          { "title": "...", "description": "...", "keywords": [...] },
          { "title": "...", "description": "...", "keywords": [...] }
        ]
      }
      
      Rules: Title ${language === 'zh' ? '25-30 汉字' : '50-60 chars'}, ...
    `;
  }
}

class TdkValidatorService {
  validate(candidate: TdkCandidate, rules: TdkRules, language: 'en' | 'zh'): ValidationResult {
    return {
      titleLength: rules.validateTitleLength(candidate.title, language),
      descriptionLength: rules.validateDescriptionLength(candidate.description, language),
      keywordStacking: rules.detectKeywordStacking(candidate.title + ' ' + candidate.description, candidate.keywords),
      contentConsistency: { status: 'pass', coverage: 1.0 } // 暂时 pass；需 content input
    };
  }
}
```

**测试场景：**
- **Happy path**: generateRecommendations("Python教程", ["Python", "教程"]) → 返回 3 个 TdkCandidate，各含 title/description/keywords ✓
- **Edge case**: 空 contentSnippet → 仍生成有效推荐 ✓
- **Error path**: Claude API timeout → 返回错误，不抛出异常 (fail gracefully)
- **Integration**: generateRecommendations output + validate → 返回 ValidationResult 与候选一一对应 ✓

**验证：**
- TdkGeneratorService 集成测试通过 ✓
- TdkValidatorService 所有规则应用正确 ✓
- 生成 + 验证端到端流程可用 ✓

---

### Unit 3: contentPlans 数据库扩展

**目标：** 扩展 contentPlans 表以支持 TDK 存储；创建迁移脚本。

**需求：** R1-R7 (基础设施)

**依赖：** Unit 1 (规则定义)

**文件：**
- Modify: `backend/src/db/schema.ts` — 新增 tdkJson, userTdkJson, tdkValidations 字段
- Create: `backend/src/db/migrations/add_tdk_fields_to_content_plans.sql` — 迁移脚本 (或 drizzle migration)
- Modify: `backend/tests/db/contentPlans.test.ts` — 数据库层测试

**方法：**
- 使用 Drizzle ORM 新增字段（遵循现有 Phase 6 模式）
- tdkJson: JSON 类型，存储 { primary, alternatives, metadata }
- userTdkJson: JSON 类型（可空），存储用户编辑版本
- tdkValidations: JSON 类型，存储验证结果缓存
- 创建迁移脚本（SQLite ALTER TABLE）

**执行注记：** 使用 Drizzle 迁移工具确保跨环境一致性

**模式遵循：** 参考 Phase 6 contentPlans 现有字段扩展方式（userBriefJson, editedAt 等）

**测试场景：**
- **Happy path**: Insert contentPlan with tdkJson → 查询返回正确 JSON ✓
- **Edge case**: tdkJson 为 null → 查询返回 null，不报错 ✓
- **Integration**: PATCH contentPlan，更新 userTdkJson → 保留原 tdkJson，user 版本分离 ✓

**验证：**
- 迁移脚本在本地 SQLite 执行成功 ✓
- contentPlans 新字段可读写 ✓

---

### Unit 4: TDK 优化 API 端点

**目标：** 实现后端 API 路由，接收 TDK 生成请求，返回推荐和验证结果。

**需求：** R1-R7 (API 层)

**依赖：** Unit 2 (服务), Unit 3 (数据库)

**文件：**
- Create: `backend/src/api/tdk.ts` — TDK API 路由
- Create: `backend/tests/api/tdk.test.ts` — API 集成测试
- Modify: `backend/src/middleware/auth.ts` — 权限检查（若需）

**方法：**
- POST `/api/projects/{projectId}/tdk-optimize` — 生成 TDK 推荐
  - 请求体：{ topic, keywords[], contentSnippet?, language }
  - 响应：{ primary: TdkCandidate, alternatives: [], validations: [] }
- POST `/api/projects/{projectId}/clusters/{clusterId}/tdk-save` — 保存编辑后的 TDK
  - 请求体：{ userTdkJson: { title, description, keywords } }
  - 响应：{ success: true, contentPlan: {...} }

**执行注记：** 使用 Hono 框架遵循现有路由模式

**模式遵循：** 参考 Phase 8 webhooks.ts / jobs.ts 的端点设计

**技术设计（伪代码）：**

```typescript
// tdk.ts
router.post('/projects/:projectId/tdk-optimize', async (c) => {
  const projectId = c.req.param('projectId');
  const { topic, keywords, contentSnippet, language } = await c.req.json();
  
  // 验证权限（项目所有者或编辑者）
  await verifyProjectAccess(projectId, c.get('user'));
  
  // 生成
  const candidates = await tdkGeneratorService.generateRecommendations(
    topic, keywords, contentSnippet, language
  );
  
  // 验证
  const validations = candidates.map(c => 
    tdkValidatorService.validate(c, tdkRules, language)
  );
  
  // 响应
  return c.json({
    primary: { candidate: candidates[0], validation: validations[0] },
    alternatives: candidates.slice(1).map((c, i) => ({ 
      candidate: c, 
      validation: validations[i+1] 
    }))
  });
});

router.post('/projects/:projectId/clusters/:clusterId/tdk-save', async (c) => {
  const { clusterId, projectId } = c.req.param();
  const { userTdkJson } = await c.req.json();
  
  await verifyClusterAccess(clusterId, projectId, c.get('user'));
  
  const updated = await db.contentPlans.update(
    { id: clusterId },
    { userTdkJson, updatedAt: new Date() }
  );
  
  return c.json({ success: true, contentPlan: updated });
});
```

**测试场景：**
- **Happy path**: POST /tdk-optimize with valid input → 返回 primary + 2 alternatives + validations ✓
- **Edge case**: keywords 为空 → 仍生成推荐（仅基于 topic） ✓
- **Auth**: 无权限用户调用 → 返回 401 ✓
- **Integration**: 生成后调用 tdk-save → userTdkJson 保存，原 tdkJson 保留 ✓

**验证：**
- API 端点返回正确结构 ✓
- 权限检查生效 ✓
- 端到端：生成 → 保存 → 查询 完整流程 ✓

---

### Unit 5: 前端 TDK 编辑面板集成

**目标：** 在 Phase 6 contentPlan 编辑 UI 中嵌入 TDK 优化面板；实现生成、验证结果展示、手工编辑。

**需求：** R1-R7 (UI 层)

**依赖：** Unit 4 (API), Unit 2 (验证规则)

**文件：**
- Create: `frontend/src/components/TdkOptimizer.tsx` — TDK 编辑面板组件
- Create: `frontend/src/hooks/useTdkOptimizer.ts` — 自定义 Hook (API 调用 + 状态管理)
- Create: `frontend/tests/components/TdkOptimizer.test.tsx` — 组件测试
- Modify: `frontend/src/pages/ContentPlanDetail.tsx` — 嵌入 TdkOptimizer 组件

**方法：**
- 新建 TdkOptimizer React 组件，包含：
  - Input 面板：topic, keywords, contentSnippet 输入框
  - Generate 按钮 → 触发 POST /tdk-optimize
  - Results 面板：展示 primary + alternatives，各显示 title/description/keywords + validation 状态
  - Edit 模式：允许用户手工修改选中候选
  - Save 按钮 → 触发 POST /tdk-save
- 使用 React Query useMutation() 调用后端 API（遵循 Phase 6 UI 模式）
- 状态管理：loading, error, success 等状态反馈

**执行注记：** UI 层可用 external-delegate 执行（前端代码较成熟）

**模式遵循：** 参考 Phase 6 ClusterDetailView 的编辑 + API 集成模式

**技术设计（伪代码）：**

```typescript
// TdkOptimizer.tsx
export function TdkOptimizer({ clusterId, projectId }) {
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [contentSnippet, setContentSnippet] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<'primary' | number>(0);
  
  const generateMutation = useMutation(
    (input) => fetch(`/api/projects/${projectId}/tdk-optimize`, { 
      method: 'POST', 
      body: JSON.stringify(input) 
    }),
    { onSuccess: (data) => setResults(data) }
  );
  
  const saveMutation = useMutation(
    (userTdk) => fetch(`/api/projects/${projectId}/clusters/${clusterId}/tdk-save`, {
      method: 'POST',
      body: JSON.stringify({ userTdkJson: userTdk })
    })
  );
  
  const handleGenerate = () => {
    generateMutation.mutate({ topic, keywords, contentSnippet });
  };
  
  const handleSave = (editedTdk) => {
    saveMutation.mutate(editedTdk);
  };
  
  return (
    <div className="tdk-optimizer">
      {/* Input Panel */}
      <div className="input-section">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="页面主题词" />
        <KeywordInput value={keywords} onChange={setKeywords} />
        <textarea value={contentSnippet} onChange={(e) => setContentSnippet(e.target.value)} placeholder="页面内容摘要" />
        <button onClick={handleGenerate} disabled={generateMutation.isLoading}>
          {generateMutation.isLoading ? '生成中...' : '生成推荐'}
        </button>
      </div>
      
      {/* Results Panel */}
      {results && (
        <div className="results-section">
          <TdkCandidateCard 
            candidate={results.primary.candidate} 
            validation={results.primary.validation}
            isSelected={selectedCandidate === 'primary'}
            onSelect={() => setSelectedCandidate('primary')}
            onEdit={(edited) => handleSave(edited)}
          />
          {results.alternatives.map((alt, i) => (
            <TdkCandidateCard 
              key={i}
              candidate={alt.candidate} 
              validation={alt.validation}
              isSelected={selectedCandidate === i}
              onSelect={() => setSelectedCandidate(i)}
              onEdit={(edited) => handleSave(edited)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// TdkCandidateCard.tsx 展示单个候选
function TdkCandidateCard({ candidate, validation, isSelected, onSelect, onEdit }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCandidate, setEditedCandidate] = useState(candidate);
  
  const renderValidationStatus = () => (
    <div className="validations">
      <span className={validation.titleLength.status}>{validation.titleLength.message}</span>
      <span className={validation.descriptionLength.status}>{validation.descriptionLength.message}</span>
      {validation.keywordStacking.status === 'fail' && (
        <span className="fail">关键词堆砌: {validation.keywordStacking.issues.join('; ')}</span>
      )}
    </div>
  );
  
  return (
    <div className={`candidate-card ${isSelected ? 'selected' : ''}`}>
      <input type="radio" checked={isSelected} onChange={onSelect} />
      
      {!isEditing ? (
        <>
          <div><strong>Title:</strong> {candidate.title} ({candidate.title.length})</div>
          <div><strong>Description:</strong> {candidate.description} ({candidate.description.length})</div>
          <div><strong>Keywords:</strong> {candidate.keywords.join(', ')}</div>
          {renderValidationStatus()}
          <button onClick={() => setIsEditing(true)}>编辑</button>
        </>
      ) : (
        <>
          <input value={editedCandidate.title} onChange={(e) => setEditedCandidate({...editedCandidate, title: e.target.value})} />
          <textarea value={editedCandidate.description} onChange={(e) => setEditedCandidate({...editedCandidate, description: e.target.value})} />
          <input value={editedCandidate.keywords.join(', ')} onChange={(e) => setEditedCandidate({...editedCandidate, keywords: e.target.value.split(', ')})} />
          <button onClick={() => { onEdit(editedCandidate); setIsEditing(false); }}>保存</button>
          <button onClick={() => setIsEditing(false)}>取消</button>
        </>
      )}
    </div>
  );
}
```

**测试场景：**
- **Happy path**: 输入 topic + keywords → 点击生成 → 显示 primary + 2 alternatives，各含验证状态 ✓
- **User interaction**: 选择 alternative → 编辑 title → 点击保存 → 调用 API，保存成功 ✓
- **Edge case**: 生成失败（网络错误） → 显示错误提示和重试按钮 ✓
- **Loading state**: 点击生成时显示"生成中..."，按钮禁用 ✓

**验证：**
- 组件正确渲染且交互可用 ✓
- API 调用和数据展示正常 ✓
- 验证状态颜色/图标清晰可辨（✓ green, ⚠ yellow, ✗ red）✓

---

### Unit 6: 测试覆盖和文档

**目标：** 补充端到端集成测试、性能基准、用户文档。

**需求：** 所有需求 (测试和文档)

**依赖：** Unit 1-5 (所有模块)

**文件：**
- Create: `backend/tests/integration/tdk-optimizer.e2e.test.ts` — 端到端集成测试
- Create: `docs/TDK_OPTIMIZER_GUIDE.md` — 用户指南（编辑 + SEO 专家）
- Create: `docs/TDK_OPTIMIZER_ARCHITECTURE.md` — 架构和扩展指南
- Modify: `README.md` — 添加 TDK 优化器的概述

**方法：**
- **集成测试**：
  - 创建测试项目 → 创建内容集群 → 调用 TDK 优化 → 验证结果 → 编辑 TDK → 查询验证结果保存
  - 测试中英文混合内容
  - 测试错误情况（无效输入、API 超时等）
- **文档**：
  - TDK_OPTIMIZER_GUIDE.md：用户如何使用（编辑 2 分钟生成流程、SEO 专家审核流程）
  - TDK_OPTIMIZER_ARCHITECTURE.md：系统如何工作、如何扩展（新增规则、修改 Prompt 等）

**执行注记：** 文档优先于代码（或与代码同步）

**测试场景：**
- **Happy path E2E**: Project → Cluster → TDK optimize → Save → Query → Verify saved ✓
- **Chinese + English**: 中文 topic/keywords → 生成中文 TDK → 验证中文规范 ✓
- **Error recovery**: API 超时 → 显示错误 → 用户重试 → 成功 ✓

**验证：**
- E2E 测试通过 ✓
- 文档覆盖主要用户场景 ✓
- 架构文档清晰，便于后续维护 ✓

---

## 系统范围影响

| 影响范围 | 详情 |
|---------|------|
| **回调和中间件** | 无新回调；现有 contentPlan PATCH 端点扩展参数（向后兼容） |
| **数据库约束** | contentPlans 新字段 (tdkJson, userTdkJson, tdkValidations) 可空；无新表依赖 |
| **API 表面** | 新增 2 个端点 (`/tdk-optimize`, `/tdk-save`)；现有 `/api/contentPlan` PATCH 兼容扩展 |
| **权限** | 复用现有 Project + Cluster 权限模型；无新权限维度 |
| **性能** | Claude API 调用 2-3 秒（可缓存）；验证规则本地执行 <100ms；无数据库 N+1 问题 |
| **状态一致性** | 用户编辑 TDK 后，userTdkJson 分离存储；原 tdkJson 保留（可重新生成） |
| **监控** | 暴露 Prometheus 指标：tdk_generation_duration_ms, tdk_validation_errors, tdk_save_failures |

## 风险与缓解

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| **Claude API 成本超支** | 中 | 成本爆炸（高频生成） | 按钮触发（vs 实时）；配置请求限流；设置月度预算告警 |
| **TDK 质量不稳定** | 中 | 生成的推荐偏离规范 | Prompt 工程（参考 ContentBriefService）；通过 5-10 个实例测试 Prompt；建立 QA 基准 |
| **规则参数不准确** | 中 | 检测结果误导用户 | Unit 1 测试覆盖所有规则场景；与 SEO 团队迭代确认参数 |
| **集成破坏 Phase 6** | 低 | 现有编辑流程受影响 | 数据库字段向后兼容（可空）；API 端点独立（无覆盖）；充分集成测试 |
| **一致性检查的 TF-IDF** | 中 | 核心词提取不准确 | MVP 采用简单词频；评估 Phase 2 升级到 TF-IDF 的收益 |

## 部署和运维注记

- **环境变量**：ANTHROPIC_API_KEY（已有）；新增 TDK_GENERATION_TIMEOUT_MS (default: 5000)、TDK_CACHE_TTL_MINUTES (default: 60)
- **监控**：见上面"系统范围影响"的监控指标
- **回滚**：若发现 TDK 生成质量问题，可禁用 TDK 优化端点（frontend 降级到输入框提示）
- **特性开关**：建议用 feature flag 控制 TDK 优化器的前端展示，便于分阶段推出

---

## 源文档与参考

- **Origin requirements:** `docs/brainstorms/2026-04-15-tdk-optimizer-requirements.md`
- **Related services:** 
  - `backend/src/services/contentBriefService.ts` (复用 Claude Prompt 框架)
  - `backend/src/services/classificationService.ts` (复用规则指标集)
  - `backend/src/services/multiLanguageService.ts` (复用密度计算)
- **Related patterns:**
  - Phase 6 data model & API: `schema.ts`, `api/contentPlan.ts`
  - Phase 8 validation patterns: `webhookDeliveryService.ts`, rate limiting
  - Phase 1 architecture: 7 layers, strategy-based design
- **External docs:**
  - Anthropic Claude API: https://docs.anthropic.com
  - Hono framework: https://hono.dev
  - Drizzle ORM: https://orm.drizzle.team
  - Jest testing: https://jestjs.io
