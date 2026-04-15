---
title: feat: SEO Content Operating System - Keyword Research & Planning Platform
type: feat
status: active
date: 2026-04-14
deepened: 2026-04-14
---

# SEO Content Operating System

本地優先、規則驅動的關鍵詞研究與內容規劃工作台。完整閉環：種子詞 → 長尾擴展 → 去重分類 → 聚類 → 頁面規劃。

## Overview

構建一個 Web 應用，支持 SEO 運營團隊從單個或多個核心關鍵詞生成**可執行的內容規劃結果**，而非僅輸出詞庫。系統整合 7 層架構（擴展、標準化、分類、趨勢、SERP 啟發式、聚類、內容規劃），每層可獨立驗證，後續易接入 LLM agent 進行自動化生成（brief、FAQ、內鏈建議）。

**核心特性：**
- 本地優先：SQLite + 本地規則引擎，無強 LLM 依賴
- 規則優先：模版化關鍵詞擴展、可配置分類邏輯、啟發式 SERP 競爭分析
- 可追溯：每個關鍵詞保留來源、深度、處理路徑
- 可縮放：provider 層支持後續替換（Trend API、SERP API、分類模型等）

---

## Problem Frame

目前 SEO 內容團隊的工作流程痛點：

1. **關鍵詞研究分散**：多個工具（Google Trends、SEO Platform、手動擴展）分別產出，無統一視圖
2. **規劃成本高**：詞庫輸出後仍需手工分類、聚類、判斷頁面形態，後期難以追蹤來源與邏輯
3. **無規則化流程**：每次規劃方式不一致，難以建立可重複的工作流
4. **Agent 無法接管**：現有工具輸出的詞庫格式各異，無清晰的數據契約供自動化系統消費

**解決目標：**
- 統一研究平台，支持種子詞到頁面規劃的完整鏈路
- 輸出**內容規劃任務單**，而非單純詞庫（包含頁面類型、內容角度、FAQ 候選、內鏈建議）
- 所有決策可解釋、可追蹤、可調整
- 預留 Agent 接口，支持自動化內容生成（brief、FAQ、專題規劃）

---

## Requirements Trace

- **R1. 項目管理**：創建、切換、管理多個項目；每個項目隔離種子詞、任務、結果
- **R2. 關鍵詞擴展**：支持 8+ 擴展策略（原詞、疑問詞、對比、商業、場景、地區、數字修飾等），模版化配置
- **R3. 關鍵詞清洗與標準化**：大小寫、空白、標點統一；去重；近似詞檢測接口預留
- **R4. 關鍵詞分類**：輸出 `intent_primary / secondary`, `funnel_stage`, `keyword_type`, `content_format_recommendation`
- **R5. 趨勢標籤**：支持 5 種標籤（stable / seasonal / rising / declining / unknown）；provider 可替換
- **R6. SERP 粗分析**：輸出 top_titles, top_domains, domain_diversity, competition_score 等 8+ 字段；規則驅動
- **R7. 聚類**：基於相似度 + n-gram overlap 的輕量聚類；生成 cluster_name、pillar_keyword、page_type
- **R8. 內容規劃**：每個 cluster 輸出 content_angle、FAQ 候選、內鏈目標、priority_score
- **R9. 導出**：CSV / JSON 導出，包含詞庫明細、cluster 結果、頁面規劃建議
- **R10. Phase 2**：SERP API 集成、聚類優化、內容規劃視圖完善

---

## Scope Boundaries

**Phase 1 (4-5 週) MVP 包含：**
- R1-R4：項目管理、擴展、標準化、分類
- 結果表格展示、CSV/JSON 導出
- 基礎前端 UI（Dashboard、Project List、Job Form、Results Table）
- 異步 Worker 任務執行

**Phase 2 (2-3 週)：**
- R5-R8：SERP 分析、聚類、內容規劃視圖
- Cluster 詳情頁、頁面規劃預覽
- 優化聚類算法、改進 SERP 啟發式

**Phase 3 (後續)：**
- Trend provider 集成（Google Trends API、SEMrush 等）
- LLM provider 集成（自動 brief、FAQ、內鏈建議）
- Agent 接口預留（自動任務提交、批量生成）

**明確非目標：**
- 不支持實時 SERP 爬蟲（Phase 1 使用啟發式規則，Phase 2 考慮 Playwright 可選層）
- 不內建 LLM 推理（預留接口，第三方 agent 可插入）
- 不支持多語言（中文優先，預留 i18n 架構）

---

## Context & Research

### Relevant Code and Patterns

**已驗證的 YD 2026 工程模式：**

1. **前後端一體化（Next.js）**
   - 參考：`Prompt Optimizer/` 結構
   - 路由層：`app/api/` → 服務層：`lib/services/` → 數據層：`prisma/`
   - 可借鑒：rate limit service、webhook queue 架構

2. **SQLite + Prisma 設計**
   - 參考：`Prompt Optimizer/prisma/schema.prisma`
   - 異步任務表：`KeywordJob { id, project_id, status, config_json, ... }`
   - TTL 清理策略：內存 Map + 定期清理（見 metrics.ts）

3. **異步任務處理**
   - 參考：`Tagging Baby/backend/tasks/` (APScheduler)
   - 輕量替代：Node.js 原生 Worker Threads / 外部 Bull / RQ
   - 本計劃選用：Bull（Redis optional, 可降級到內存隊列）

4. **React 組件與表格**
   - 參考：`Tagging Baby/admin/` 結構，TanStack Table 虛擬滾動
   - 狀態管理：React Hooks + TanStack Query
   - 表單：React Hook Form + Zod 驗證

5. **TypeScript 嚴格模式**
   - `tsconfig.json: { strict: true, noImplicitAny, strictNullChecks }`
   - 所有 service 層 return `Result<T, Error>` 或 `Promise<{data, error}>`

### Institutional Learnings

- **worker 非強依賴**：使用 in-process 隊列（內存 Queue）支持快速迭代，later upgrade to Bull/RQ
- **provider 層隔離**：所有外部依賴（SERP、Trend、LLM）透過 interface 注入，便於單元測試 + mock
- **可追溯性優先**：每個處理步驟保留 source_type、source_engine、depth，支持後向分析
- **規則引擎優先**：相似度匹配 > 機器學習，確保初期MVP快速上線
- **評分機制可解釋**：每個 score 組件（demand_score、intent_value_score 等）有明確公式，支持調優

### External References

- None required for Phase 1（規則驅動、本地優先）
- Phase 2 可參考：
  - SERP 啟發式：moz.com/learn/seo 競爭度評分方法論
  - 聚類：tf-idf + cosine similarity（scikit-learn 參考，但用 JS 實現以簡化棧）

---

## Key Technical Decisions

| 決策 | 理由 |
|------|------|
| **Monorepo 中新目錄** `seo-content-system/` | 與 YD 2026 workspace 保持一致，便於共享工具、scripts、memory |
| **Fastify / Hono 後端** | 相比 Next.js API Routes，更輕量、更易單元測試；Hono 官方支持 Node.js + Cloudflare Workers（後期 serverless 選項） |
| **SQLite + Drizzle** | Prisma 對複雜聚類查詢支持有限；Drizzle 更接近 SQL、更易優化。SQLite 足夠 MVP 規模（單機 10-100GB 無壓力） |
| **Bull Queue（in-memory 降級）** | 支持 Redis，但 MVP 階段可用內存隊列（使用 `p-queue` 或 `bull` 的內存後端）避免外部依賴 |
| **啟發式 SERP 分析** | Phase 1 不爬蟲，使用規則（word count、修飾詞、domain authority heuristic）預測競爭度。Phase 2 可選 Playwright 採集真實 SERP |
| **Provider 層注入** | 所有外部服務（Trend API、SERP API、Classifier model）透過 interface 實現，支持 mock + 後期替換 |
| **React Query + Zustand** | 無 Redux，React Query 管理伺服器狀態 + 快取，Zustand 管理 UI 狀態（filter、sort、pagination） |

---

## Open Questions

### Resolved During Planning

- **Q: 後端框架選擇？** → **決策**：Hono（輕量、易測試、可 serverless）
- **Q: 如何支持長時間的關鍵詞擴展任務？** → **決策**：Bull in-memory queue + webhooks 通知前端（參考 Prompt Optimizer 的 webhook 架構）
- **Q: SERP 資料如何獲得？** → **決策**：Phase 1 使用規則啟發式，Phase 2 考慮 Playwright / SERP API

### Deferred to Implementation

- **關鍵詞擴展的具體 modifier 值**：中文 modifier（怎么、如何 等）會在 Phase 1 編碼時確認，可配置化
- **聚類相似度閾值**：初期設定為 0.7（cosine similarity），後續根據測試結果調整
- **Priority score 的精確公式**：由 4 個維度組成（demand + intent_value + competition_inverse + relevance），各維度權重在實現時細化
- **SERP API 集成細節**：Phase 2 確認，暫不在 Phase 1 規劃中

---

## High-Level Technical Design

> *此圖為方向性指引，非實現規範。實現時應視為上下文，而非代碼藍本。*

**整體數據流：**

```
用戶 (UI)
  ↓
[New Job Form] → seed_keywords, config
  ↓
Backend API (Hono)
  ↓
[Keyword Expansion Service] → candidates (10-1000 詞)
  ↓
[Normalization Service] → normalized_keyword (大小寫、空白、標點)
  ↓
[Classification Service] → intent_primary/secondary, funnel_stage, keyword_type
  ↓
[Trend Provider] → trend_label (stable/seasonal/rising/...)
  ↓
[SERP Analysis Service] → competition_score, top_titles, domain_diversity
  ↓
[Clustering Service] → cluster_name, pillar_keyword, page_type
  ↓
[Content Planning Service] → content_angle, faq_candidates, internal_link_targets, priority_score
  ↓
Database (Drizzle + SQLite)
  ↓
[Results UI] → Table (filter, sort, export) / Cluster View / Content Plan View
```

**單一關鍵詞的處理管道（per keyword candidate）：**

```
raw_keyword
  ↓ [Normalization] → normalized_keyword + normalization_log
  ↓ [Classification] → intent_primary, intent_secondary, funnel_stage, keyword_type, content_format_recommendation
  ↓ [Trend Lookup] → trend_label
  ↓ [SERP Analysis] → competition_score, opportunity_score
  ↓ [Cluster Assignment] → cluster_id (Phase 2 後)
```

---

## Implementation Units

### Phase 1: Core Keyword Pipeline (4-5 weeks)

- [ ] **Unit 1.1: Project Infrastructure & Database**

**Goal:** 建立項目管理系統、數據庫 schema、API 基礎架構

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `seo-content-system/backend/src/db/schema.ts`（Drizzle schema）
- Create: `seo-content-system/backend/src/api/projects.ts`（CRUD 路由）
- Create: `seo-content-system/backend/src/services/projectService.ts`（業務邏輯）
- Create: `seo-content-system/backend/src/queue/index.ts`（Bull in-memory queue 初始化）
- Test: `seo-content-system/backend/tests/services/projectService.test.ts`
- Create: `seo-content-system/package.json`, `tsconfig.json`, `.env.example`

**Approach:**

- **Drizzle schema 至少包含表：**
  - `users`: id, email, hashed_password, role (admin/user), created_at
  - `projects`: id, owner_id (FK users), name, site_name, locale, language, default_engine, created_at, updated_at
  - `keyword_jobs`: id, project_id, seed_keywords, status, config_version, expansion_config_snapshot (JSON), classification_rules_version, serp_heuristics_version, checkpoint_count, created_at, updated_at
  - `keyword_candidates`: id, job_id, raw_keyword, normalized_keyword, parent_keyword, source_type, depth, collected_at, UNIQUE(job_id, normalized_keyword, depth)
  - `keyword_features`: keyword_id, word_count, intent_primary, intent_secondary, funnel_stage, keyword_type, content_format_recommendation, trend_label, competition_score, opportunity_score
  - `serp_snapshots`: id, keyword_id, competition_score, top_titles_json, top_domains_json, fetched_at
  - `keyword_clusters`: id, job_id, cluster_name, pillar_keyword, page_type, priority_score, created_at
  - `cluster_members`: id, cluster_id, keyword_id
  - `content_plans`: id, cluster_id, content_angle, faq_candidates_json, internal_link_targets_json

- **API 端點與認證：**
  - 所有端點（除 POST /auth/register, POST /auth/login）皆需 JWT 認證
  - POST /auth/register, POST /auth/login → JWT token
  - POST /projects, GET /projects → 篩選 owner_id == current_user.id（除 admin）
  - GET /projects/:id → 驗證 ownership 或 admin role

- **隊列實現決策（Unit 1.1 中明確）：**
  - **選項 A（推薦 Phase 1）：** p-queue（`npm install p-queue`）
    - 無外部依賴，輕量，適合 < 1000 jobs/day
    - 構造：`const queue = new PQueue({ concurrency: 4, timeout: 30 * 1000 })`
    - 無持久化，重啟遺失未完成任務
  
  - **選項 B（可升級到 Phase 2）：** Bull（`npm install bull`）
    - 更成熟，支持 Redis 後端，持久化
    - 構造：`const queue = new Queue('keywords', { redis: { ... } })`
    - Phase 1 可用 in-memory mock
  
  - **決策：Phase 1 選用 p-queue，Unit 1.5 中實現 POC；Phase 2 如需持久化升級到 Bull + Redis**

- **ORM 決策（Unit 1.1 中 POC）：**
  - Prisma vs Drizzle 技術原型：實現「分頁查詢」、「聚合計數」、「複合索引」三個典型 query
  - 對比 code readability、type safety、query performance
  - 記錄決策文檔於 `docs/DECISION_DRIZZLE_VS_PRISMA.md`
  - **推薦：** Drizzle（更接近 SQL，利於後期複雜聚類查詢）

- **配置版本控制：**
  - 所有規則（expansion strategies、classification rules、SERP heuristics）版本化
  - 每個 job 記錄創建時刻的所有規則版本（snapshot）
  - 支持規則變更日誌查詢（GET /config-history）

**Patterns to follow:**

- 參考 Prompt Optimizer 的 service 層架構（`lib/services/` 下分功能）
- 參考 Tagging Baby 的 async session 管理（Drizzle async API）
- 錯誤處理：`Result<T, ErrorCode>` 型別定義，統一 error handling middleware

**Test scenarios:**

- Happy path：創建項目 → 檢驗必填字段 → 返回 project_id
- Edge case：重複名稱 → 拒絕；locale 無效 → 400 BAD REQUEST
- Edge case：查詢不存在項目 → 404 NOT FOUND；列表分頁 → offset/limit 驗證
- Integration：創建後、修改後、刪除前檢驗相關聯的 jobs 狀態

**Verification:**

- 所有 CRUD 端點可用，unit tests 100% 通過
- Drizzle migration 可生成，數據庫初始化成功
- 異步隊列可插入、消費任務（測試用 dummy job）

---

- [ ] **Unit 1.2: Keyword Expansion Service & Rules Engine**

**Goal:** 實現關鍵詞擴展管道，支持 8+ 擴展策略，規則配置化

**Requirements:** R2

**Dependencies:** Unit 1.1

**Files:**
- Create: `seo-content-system/backend/src/services/keywordExpansionService.ts`（主邏輯）
- Create: `seo-content-system/backend/src/rules/expansionStrategies.ts`（模版定義）
- Create: `seo-content-system/backend/src/api/jobs.ts`（POST /jobs/{projectId}/keywords 端點）
- Test: `seo-content-system/backend/tests/services/keywordExpansionService.test.ts`

**Approach:**

- 定義 `ExpandStrategy` interface：`{ type, modifiers: string[], apply(keyword: string): string[] }`
- 內建策略：original, space, a-z, 0-9, question_modifiers, comparison_modifiers, commercial_modifiers, scenario_modifiers
- 每個策略返回 candidate list，带上 source_type（"original" / "strategy_name"）、depth（擴展深度）
- 配置檔：JSON / YAML，可定義每個項目的激活策略、modifier 值、最大候選數

例子：
```json
{
  "expansionStrategies": [
    { "type": "original", "enabled": true },
    { "type": "a-z", "enabled": true },
    { "type": "question_modifiers", "modifiers": ["怎么", "如何", "为什么"] }
  ],
  "maxCandidatesPerStrategy": 100,
  "totalMaxCandidates": 1000
}
```

- 擴展作為 async job 運行（透過 Bull queue），進度回報給 websocket 或 polling endpoint
- 每個候選保存到 `keyword_candidates` 表，帶上 raw_keyword, source_type, source_engine (null for now), depth

**Patterns to follow:**

- 參考 Prompt Optimizer 的 rate limit service（模組化 rules）
- 參考 Tagging Baby 的 APScheduler 非同步任務模式

**Test scenarios:**

- Happy path：擴展 "AI工具" → 原詞 + 修飾詞組合 → 返回 200+ 候選
- Edge case：空字符串、特殊字符、超長詞（>50 字） → 清理或拒絕
- Edge case：修飾詞重複 → 去重；生成的詞重複 → 去重
- Edge case：擴展數超過上限 → 截斷、記錄被截斷的數量
- Integration：job 提交 → 進入隊列 → 完成後更新 job 狀態 → 前端輪詢 /jobs/{jobId} 获得进度

**Verification:**

- 擴展服務可獨立測試（無 DB 依賴）
- Job 完成後，keyword_candidates 表中候選數 >= min expected
- 配置變更不需改程式碼

---

- [ ] **Unit 1.3: Keyword Normalization Service**

**Goal:** 清洗與標準化關鍵詞，去重，檢測近似詞

**Requirements:** R3

**Dependencies:** Unit 1.1

**Files:**
- Create: `seo-content-system/backend/src/services/normalizationService.ts`
- Create: `seo-content-system/backend/src/utils/stringUtils.ts`（大小寫、空白、標點工具函數）
- Test: `seo-content-system/backend/tests/services/normalizationService.test.ts`

**Approach:**

- Normalization 步驟：
  1. 去前後空白
  2. 大小寫統一（小寫）
  3. 標點符號統一（移除或替換為空格）
  4. 連續空白壓縮為單個空白
  5. 可選：簡繁體轉換（預留 interface，不在 MVP 實現）

- 去重：基於 normalized_keyword（同表中 UNIQUE 約束）
- 近似詞檢測：預留 `similarityDetector(keyword1, keyword2): score` 接口，初期返回 NOT_IMPLEMENTED，Phase 2 考慮 TF-IDF

- 每個 candidate 保存 `normalized_keyword`、`parent_keyword`（來源種子詞）、normalization_log（JSON，記錄每步轉換）

**Patterns to follow:**

- 參考 Prompt Optimizer 的 logger 架構（結構化日誌）

**Test scenarios:**

- Happy path：" AI  工具  " → "ai 工具"；"AI-工具" → "ai 工具"；"AI,工具" → "ai 工具"
- Edge case：已全小寫 → 無改變；純標點 → 空字符串或拒絕；重複詞 → 去重
- Edge case：特殊 Unicode（emoji、CJK 符號） → 清理或保留（測試確定規則）
- Integration：擴展後 1000 候選 → 標準化後可能 < 1000（去重）

**Verification:**

- 無符號異常
- 去重後候選數 <= 原數
- normalization_log 完整記錄

---

- [ ] **Unit 1.4: Keyword Classification Service**

**Goal:** 分類每個關鍵詞，輸出 intent、funnel_stage、keyword_type、content_format_recommendation

**Requirements:** R4

**Dependencies:** Unit 1.1

**Files:**
- Create: `seo-content-system/backend/src/services/classificationService.ts`
- Create: `seo-content-system/backend/src/rules/classificationRules.ts`（規則引擎）
- Test: `seo-content-system/backend/tests/services/classificationService.test.ts`

**Approach:**

- **Intent Primary（信息、商業、交易、導航）：**
  - 規則：檢測疑問詞（怎么、如何） → informational；檢測商業詞（購買、費用、推薦） → commercial；檢測品牌詞 → navigational；其他 → transactional

- **Intent Secondary（問題、對比、場景、解決方案、價格、本地、品牌、新鮮度）：**
  - 基於 keyword 本身的修飾詞+字段推測

- **Funnel Stage（意識、考慮、決策）：**
  - awareness：通用、宏觀詞彙
  - consideration：對比、評測、功能詞
  - decision：購買、訂價、促銷詞

- **Keyword Type（question, comparison, scenario, solution, price, local, brand, freshness）：**
  - 基於詞彙特徵（疑問詞、"vs"、地點名、時間詞 等）

- **Content Format Recommendation（article, faq, category, landing, comparison, glossary, topic_page）：**
  - 基於上述分類組合推薦

規則引擎可配置化（JSON 規則文件），支持優先級、fallback。每個規則返回 (intent_primary, confidence_score)。

**Patterns to follow:**

- 參考 Prompt Optimizer 的 metrics 和規則化架構

**Test scenarios:**

- Happy path：
  - "如何使用 AI" → intent_primary=informational, intent_secondary=question, format=article+faq
  - "AI 工具 vs ChatGPT" → intent_primary=informational, intent_secondary=comparison, format=comparison
  - "購買 AI 軟件價格" → intent_primary=commercial, intent_secondary=price, format=landing
  
- Edge case：多個修飾詞衝突 → 使用優先級規則；無匹配規則 → fallback 到 default classification

**Verification:**

- 分類結果完整（每個字段都有值，無 null）
- 規則更新後重新分類不需重啟服務

---

- [ ] **Unit 1.5: API Routes & Job Queue Integration**

**Goal:** 串聯 Unit 1.1-1.4 的 API 端點，整合 Bull queue 進行異步處理

**Requirements:** R2, R3, R4

**Dependencies:** Unit 1.1-1.4

**Files:**
- Create: `seo-content-system/backend/src/api/keywords.ts`（POST /projects/{projectId}/jobs, GET /projects/{projectId}/keywords）
- Create: `seo-content-system/backend/src/workers/keywordProcessingWorker.ts`（Bull job handler）
- Modify: `seo-content-system/backend/src/queue/index.ts`（註冊 worker）
- Test: `seo-content-system/backend/tests/api/keywords.test.ts`

**Approach:**

- POST /projects/{projectId}/jobs：
  - Input：{ seed_keywords: string[], config: ExpansionConfig }
  - Output：{ job_id: UUID, status: "pending" }
  - 插入 `keyword_jobs` 記錄，推送 Bull job

- **p-queue job 流程（keywordProcessingWorker）：**
  1. 擴展（expandKeywords） → candidates array（返回 { keyword, source_type, depth }）
  2. 標準化（normalizeKeywords） → normalized_keyword
  3. **去重（基於 normalized_keyword + depth）**，使用 UNIQUE 約束防止重複插入
  4. 分類（classifyKeywords） → features（intent_primary, funnel_stage 等，無 null，使用 default）
  5. **批量插入（batch size 500）** → keyword_candidates + keyword_features
  6. **Checkpoint 機制：** 每 500 詞保存 checkpoint_count 到 job 表；失敗時從 checkpoint 恢復
  7. 更新 job 狀態為 "completed" 或 "failed"
  
- **Idempotency 保證：**
  - 每個 candidate 的 (job_id, normalized_keyword, depth) 必須唯一
  - 重試時若已存在，INSERT IGNORE 或 ON CONFLICT DO NOTHING
  - 確保 worker 失敗重啟後不會產生重複候選

- GET /projects/{projectId}/keywords?jobId=...：
  - 返回該 job 的候選詞列表，帶上 features（intent, funnel, type, format）

**Patterns to follow:**

- 參考 Prompt Optimizer 的 route handler 結構（error handling, auth）
- 參考 Tagging Baby 的 async worker 模式

**Test scenarios:**

- Happy path：提交 job → 入隊 → worker 處理 → job marked as completed → keywords 可查詢
- Edge case：job 處理中查詢 → 返回進度或 202 Accepted
- Error path：擴展失敗（OOM） → job marked as failed，返回錯誤信息
- Integration：多個 job 並行処理不互相干擾

**Verification:**

- 隊列消費速度 >= 100 keywords/sec（本地機）
- Job 狀態轉移正確（pending → processing → completed/failed）

---

- [ ] **Unit 1.6: Trend Service & Provider Interface**

**Goal:** 實現 Trend provider interface，Phase 1 使用 stub（返回 "unknown"），Phase 2 接入真實 API

**Requirements:** R5

**Dependencies:** Unit 1.1

**Files:**
- Create: `seo-content-system/backend/src/providers/trendProvider.ts`（interface）
- Create: `seo-content-system/backend/src/providers/trendProviders/stubTrendProvider.ts`（stub implementation）
- Create: `seo-content-system/backend/src/services/trendService.ts`（facade）
- Test: `seo-content-system/backend/tests/providers/trendProvider.test.ts`

**Approach:**

```typescript
interface TrendProvider {
  getTrendLabel(keyword: string, locale: string): Promise<'stable' | 'seasonal' | 'rising' | 'declining' | 'unknown'>;
}

class StubTrendProvider implements TrendProvider {
  async getTrendLabel() { return 'unknown'; }
}
```

- Phase 1：所有關鍵詞返回 "unknown"
- Phase 2：切換到 google-trends API 或類似

**Patterns to follow:**

- 依賴注入：`trendService` 構造函數接受 `provider: TrendProvider`
- 參考 Prompt Optimizer 的 LLM provider 模式

**Test scenarios:**

- Happy path：調用 stub → 返回 "unknown"；返回值符合預期型別
- Mock 測試：注入 mock provider，驗證 trendService 正確調用

**Verification:**

- Provider interface 清晰，支持後續替換無需修改 service 層代碼

---

- [ ] **Unit 1.7: SERP Analysis Service & Heuristics**

**Goal:** 實現啟發式 SERP 競爭度分析，Phase 1 規則驅動，Phase 2 可選 Playwright 採集

**Requirements:** R6

**Dependencies:** Unit 1.1

**Files:**
- Create: `seo-content-system/backend/src/services/serpAnalysisService.ts`
- Create: `seo-content-system/backend/src/providers/serpProvider.ts`（interface）
- Create: `seo-content-system/backend/src/providers/serpProviders/heuristicSerpProvider.ts`（Phase 1）
- Create: `seo-content-system/backend/src/rules/serpHeuristics.ts`
- Test: `seo-content-system/backend/tests/services/serpAnalysisService.test.ts`

**Approach:**

- **啟發式規則計算 competition_score（0-100）：**
  - 詞長：shorter keywords（1-2 words） → higher competition
  - 修飾詞：商業詞 → higher competition；長尾詞（4+ words） → lower
  - Keyword type：branded, transactional → higher；informational → lower
  - 公式初版（可調）：
    ```
    base_score = 50
    if word_count <= 2: base_score += 25
    if has_commercial_modifiers: base_score += 15
    if intent_primary == 'commercial': base_score += 10
    competition_score = clamp(base_score, 0, 100)
    ```

- 輸出字段（相比 SERP 查詢簡化版，Phase 2 可擴展）：
  - `competition_score`
  - `estimated_search_volume_tier` (low/medium/high) — 基於詞長
  - `difficulty_indicators`: { word_count, commercial_modifiers, branded_presence_estimated }
  - `top_content_types_estimated`: ["article", "landing", ...] — 基於 intent

- 保存到 `serp_snapshots` 表（即使無實際爬蟲數據）

**Patterns to follow:**

- Provider interface 同 Trend service，支持後期切換到真實 SERP API 或 Playwright

**Test scenarios:**

- Happy path：
  - "AI" → competition_score ~75 (短、商業)
  - "如何使用 AI 工具進行寫作" → competition_score ~35 (長尾、信息)
  
- Edge case：特殊詞（emoji、URL） → 返回默認分數或拒絕
- Heuristic 調整：修改規則 → 重新計算不需重啟

**Verification:**

- 啟發式分數範圍 [0, 100]
- 分數與詞特徵邏輯一致（短詞 > 長詞）

---

- [ ] **Unit 1.8: Frontend Infrastructure & Dashboard**

**Goal:** 建立 React 前端，實現 Dashboard、Project List、Job Form、Results Table

**Requirements:** R1, R2, R3, R4, R9（部分）

**Dependencies:** Unit 1.1, Unit 1.5（可與 1.2-1.7 並行，使用 mock API）

**Files:**
- Create: `seo-content-system/frontend/` 目錄結構
- Create: `seo-content-system/frontend/src/pages/Dashboard.tsx`
- Create: `seo-content-system/frontend/src/pages/ProjectList.tsx`
- Create: `seo-content-system/frontend/src/pages/ProjectDetail.tsx`
- Create: `seo-content-system/frontend/src/pages/NewKeywordJob.tsx`
- Create: `seo-content-system/frontend/src/components/KeywordResultsTable.tsx`
- Create: `seo-content-system/frontend/src/hooks/useProjects.ts`, `useKeywords.ts`（React Query 自定義 hooks）
- Create: `seo-content-system/frontend/src/store/uiStore.ts`（Zustand 過濾/排序狀態）
- Test: `seo-content-system/frontend/tests/pages/Dashboard.test.tsx`

**Approach:**

- **技術棧：** React 18 + TypeScript + Vite + Tailwind CSS + React Query + Zustand + React Hook Form
- **頁面結構：**
  1. Dashboard：項目數、最近任務、keyword 總量（通過 GET /analytics）
  2. Project List：可搜索的項目表，新增按鈕
  3. New Keyword Job：表單（種子詞、config、選項），提交後進入 Results
  4. Results Table：TanStack Table，支持 filter（intent、funnel、type）、sort、export

- **狀態管理：**
  - React Query：伺服器狀態（projects、keywords、jobs）
  - Zustand：UI 狀態（currentFilter、sortBy、pagination）

- **實時進度：** 
  - Polling GET /projects/{id}/jobs/{jobId}（智能退避：前 10s 每 500ms，之後 2s，5 分鐘後 5s）
  - 若 job 狀態 > 5 分鐘未變化，標記為 "stalled"，顯示警告
  - 返回 { status, checkpoint_count, total_count, progress_percent, estimated_remaining_time }

**Patterns to follow:**

- 參考 Tagging Baby 的 React component 結構（hooks + 無狀態元件）
- 參考 Prompt Optimizer 的表單驗證（React Hook Form + Zod）

**Test scenarios:**

- Happy path：進入 Dashboard → 看到項目列表；新建項目 → 進入 Project Detail；提交 Job → 進度更新 → 完成後查看結果
- Edge case：網絡斷開時提交表單 → error toast；job 處理中刷新頁面 → 進度保留
- Accessibility：鍵盤導航、ARIA labels

**Verification:**

- 所有主要頁面可渲染，API 呼叫正確
- 進度輪詢在 job 完成後停止

---

- [ ] **Unit 1.9: Export & CSV/JSON Generation**

**Goal:** 支持結果導出為 CSV 和 JSON 格式

**Requirements:** R9

**Dependencies:** Unit 1.1, Unit 1.5（可與 Unit 1.8 並行開發）

**Files:**
- Create: `seo-content-system/backend/src/services/exportService.ts`
- Create: `seo-content-system/backend/src/api/export.ts`
- Test: `seo-content-system/backend/tests/services/exportService.test.ts`

**Approach:**

- API 端點：
  - GET /projects/{projectId}/jobs/{jobId}/export?format=csv|json
  - 返回 Content-Disposition: attachment；filename=`keywords-{jobId}-{date}.{ext}`

- **CSV 格式：**
  ```
  keyword,parent_keyword,source_type,normalized_keyword,intent_primary,intent_secondary,funnel_stage,keyword_type,content_format,trend_label,competition_score,opportunity_score
  ```

- **JSON 格式：**
  ```json
  {
    "job_id": "...",
    "project_id": "...",
    "created_at": "...",
    "keywords": [ { keyword, features, ... } ],
    "stats": { total_keywords, intent_distribution, ... }
  }
  ```

- 前端下載：React 元件提供按鈕，調用 export API，瀏覽器自動下載

**Patterns to follow:**

- 參考 Tagging Baby 的批量操作導出邏輯

**Test scenarios:**

- Happy path：CSV 導出 → 1000 詞 → 文件 > 100KB；JSON 導出 → 格式正確、內容完整
- Edge case：空結果 → 仍返回有效的 CSV header 或 JSON 框架

**Verification:**

- CSV 文件可用 Excel / Google Sheets 打開，無編碼問題
- JSON 可被 jq 解析

---

- [ ] **Unit 1.10: Documentation, README, Setup Guide**

**Goal:** 完整的項目文檔、本地運行說明、database 初始化腳本

**Requirements:** 所有

**Dependencies:** Unit 1.1-1.9

**Files:**
- Create: `seo-content-system/README.md`（項目概覽、快速啟動）
- Create: `seo-content-system/.env.example`
- Create: `seo-content-system/docs/ARCHITECTURE.md`（系統架構、層級設計）
- Create: `seo-content-system/docs/API.md`（完整 API 參考）
- Create: `seo-content-system/docs/DATABASE.md`（schema 詳解、索引建議）
- Create: `seo-content-system/scripts/init-db.sh`（初始化數據庫）
- Create: `seo-content-system/scripts/seed-demo.sh`（示例數據）
- Create: `seo-content-system/tests/benchmarks/performance.test.ts`（性能基準測試）
- Create: `seo-content-system/docs/PERFORMANCE_BENCHMARKS.md`（基準測試結果 & 硬件要求）

**Approach:**

- **README：** 5 分鐘內讓新用戶跑起來（npm install → npm run dev → 訪問 localhost:3000）
  
- **ARCHITECTURE.md：** Layer diagram、provider interface、future extensions roadmap、Unit 並行開發建議
  
- **API.md：** 所有端點、Request/Response 示例、error codes、認證方式
  
- **DATABASE.md：** 每個表的說明、索引策略、N+1 query 避免建議、多用戶隔離注意事項
  
- **DECISION_DRIZZLE_VS_PRISMA.md：** ORM 選擇決策、POC 對比結果、性能數據
  
- **DECISION_QUEUE_IMPLEMENTATION.md：** p-queue vs Bull 決策、Phase 2 升級路徑
  
- **PERFORMANCE_BENCHMARKS.md：**
  - 測試用例（運行 `npm run bench`）：
    ```
    ✓ Expand 100 seeds → 5000 candidates：期望 < 5s
    ✓ Normalize + deduplicate 5000 keywords：期望 < 2s
    ✓ Classify 5000 keywords：期望 < 3s
    ✓ Batch insert 5000 records to SQLite：期望 < 2s
    ✓ Concurrent 3 jobs (5000 keywords each)：無死鎖，期望 15s 完成
    ✓ API response time (GET /projects/:id)：期望 < 100ms
    ✓ Polling loop stress test (100 concurrent jobs)：期望 < 500ms per request
    ```
  - 硬件要求：4GB RAM, 500MB SSD（供 SQLite + demo data）
  - Demo project 規模：50 seed keywords → ~5000 candidates → 3-5 job runs

**Verification:**

- 文檔與代碼同步
- README 的快速啟動步驟實際可執行

---

### Phase 2: Clustering & Content Planning (2-3 weeks)

*(以下為輪廓，Phase 1 完成後細化)*

- [ ] **Unit 2.1: Keyword Clustering Service**

基於 TF-IDF + cosine similarity 聚類，生成 cluster_name、pillar_keyword、page_type

- [ ] **Unit 2.2: Content Planning Service**

基於 cluster，生成 content_angle、faq_candidates、internal_link_targets、priority_score

- [ ] **Unit 2.3: Cluster & Content Plan UI**

前端 Cluster View、Content Planning Preview、頁面規劃編輯

- [ ] **Unit 2.4: SERP API Integration (Optional)**

Playwright / Puppeteer 採集真實 SERP，替換啟發式規則（可選）

---

## System-Wide Impact

- **Interaction graph:** Job submission → async worker → database updates → frontend polling → export trigger
- **Error propagation:** Worker 失敗 → job marked as failed → UI 顯示錯誤信息；API validation 失敗 → 400 with details
- **State lifecycle risks:** 
  - Partial keyword processing：job crashed 中途 → 實現 resume 機制（重新處理未完成的 candidates）
  - Duplicate expansion：同一 job 重複提交 → 檢驗 idempotency key 或簡單的 deduplication
- **API surface parity:** 前端導出與後端導出結果須一致；classification 規則更新需同步到所有 candidates
- **Integration coverage:**
  - Job lifecycle：creation → queue → processing → completion → export
  - Keyword pipeline：expansion → normalization → classification → SERP analysis → clustering（Phase 2）

---

## Risks & Dependencies

| 風險 | 緩解 |
|------|------|
| **關鍵詞擴展爆炸（億級候選）** | 設置 maxCandidatesPerStrategy、totalMaxCandidates 上限；Phase 1 測試規模 < 10K |
| **聚類性能低（1000+ 詞 cosine similarity）** | Phase 1 不聚類（遞延到 Phase 2），或使用近似 LSH；本地測試規模檢驗 |
| **SERP 啟發式不準** | 初版公式會有偏差；Phase 2 可接入真實 API 校準；允許用戶調整權重 |
| **Worker 長期運行卡住** | Bull queue timeout 設定（default 30s），超時自動重試；添加 healthcheck endpoint |
| **數據庫鎖定** | SQLite 並發寫入有限；Phase 1 單機可接受，Phase 2+ 考慮遷移到 PostgreSQL |
| **前端實時性要求** | Polling 頻率 2s，接受 2s 延遲；後期可升級 WebSocket (Hono 支持) |

---

## Documentation / Operational Notes

- **Logging:** Pino 結構化日誌，key events：job submission, expansion progress, completion, errors
- **Monitoring:** 
  - Job completion rate（target > 95%）
  - Worker throughput（keywords/sec）
  - API response time（< 200ms for read endpoints）
  - Database size（target < 1GB for MVP）
- **Deployment:** 
  - 本地開發：SQLite in-memory 或 dev.db
  - 容器化：Docker setup for easy distribution（後期）
  - Backup：每日 DB 備份（手動或 cron）

---

## Sources & References

- **本地架構參考：**
  - Prompt Optimizer：https://github.com/redredchen01/Prompt-Optimizer（rate limiting, webhooks, service layers）
  - Tagging Baby：`/Users/dex/YD 2026/Tagging Baby/`（FastAPI async, SQLAlchemy, React patterns）

- **待研究（Phase 2）：**
  - Google Trends API 文檔（趨勢數據）
  - Playwright / Puppeteer 官方文檔（SERP 採集）
  - TF-IDF clustering：scikit-learn 參考（JavaScript 實現可參考 natural.js）

---

## Recommended Development Timeline (Parallelized)

**Week 1-2: Foundation (Critical Path)**
- Unit 1.1：DB schema + ORM POC（Drizzle vs Prisma）+ Queue 決策
- Unit 1.10（Doc skeleton）：README、API.md 框架

**Week 2-4: Parallel Development (4 Tracks)**

| Track | Units | Assignee | Output |
|-------|-------|----------|--------|
| **Backend Core** | 1.2-1.7 | Backend team | Keyword pipeline services（各自可獨立測試） |
| **API Integration** | 1.5 | Senior BE / TL | Route handlers + Worker integration（串聯 1.2-1.7） |
| **Frontend UI** | 1.8 | Frontend team | React pages（可使用 mock API from Unit 1.5） |
| **Documentation** | 1.10 | Tech writer + TL | ARCHITECTURE、API、DECISION 文檔（與代碼同步） |

**Week 4: Integration & Export**
- Unit 1.8 + 1.5 連接（真實 API）
- Unit 1.9：Export 實現
- 整體集成測試

**Week 4-5: Testing & Hardening**
- 全量測試（unit + integration + E2E）
- 性能基準測試（Unit 1.10 benchmark suite）
- Demo project 驗證（50 seeds → 5000 keywords flow）
- 文檔最終審查

**Critical Success Factors:**
- ✅ Unit 1.1 schema 與認證模型在 Week 1 確定（卡點）
- ✅ 1.2-1.7 各自可在沙盒環境中獨立測試（減少集成風險）
- ✅ 1.8 使用 mock API（不必等 1.5 細節完成）
- ✅ 定期集成檢查（每天 EOD 合併 main branch，檢驗無相衝突）

## Next Steps After Planning

1. **立即起始 Unit 1.1：** 環境設置（Hono + Drizzle + SQLite POC）、schema 設計、認證模型
2. **並行啟動 Unit 1.2-1.7 開發團隊：** 各自獨立開發，每日單元測試驗證
3. **Unit 1.5 作為 glue layer：** 待 1.2-1.7 初版完成後立即串聯，並暴露 API
4. **Unit 1.8 mock API 開發：** 不必等後端完全完成，可並行設計頁面結構
5. **Phase 1 完成後：** 全量測試、性能基準測試、demo project 驗證、Phase 2 規劃

