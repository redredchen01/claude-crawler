---
date: 2026-04-17
topic: structured-data-first-extraction
---

# Structured-Data-First Extraction Architecture

## Problem Frame

当前 parser 以 DOM 启发式为主路径：meta tags → `<h1>` → breadcrumb → `_extract_number_near_keyword`（字符串邻近）等。这套在简单博客 HTML 上跑得通，但在真实内容站（视频、电商、文章聚合）上反复摔跤：

- **kissavs.com**：`<span class="mr-3">14143</span>` 光秃秃没有"views"字样，启发式抓不到；`_extract_number_near_keyword` 匹配到 `<script>` 里的 "heart" 字符串，误把 JS 代码中的随机数字当 hearts
- **网页结构已移位到 `<section>` / `<div>`**：`<article>`/`<main>` 不再是标配，page-type 检测因此误判 detail 为 list，整个 detail extractor 路径跳过
- **title 里的 SEO chain（`Item ｜ Section ｜ Brand`）**需要专门处理，但不同站点规范不一
- **breadcrumb 末项有时是 current item、有时是 category**，无单一规则

**关键观察：** 做 SEO 的内容站（大多数有规模的站）都内嵌结构化数据（JSON-LD schema.org、OpenGraph、Twitter Cards、microdata），这些是**为机器设计的规范输出**，比扫 DOM 找关键字的可靠性高一个数量级。parser 目前几乎**忽略了这些金矿**（kissavs session 已证明：JSON-LD `InteractionCounter` 直接给出 views=14143 / likes=3096 规范值）。

## Requirements

**架构（Architecture）**
- R1. 建立"结构化数据优先，DOM 启发式兜底"的两段式抽取链。结构化路径命中的字段直接填入 `Resource`，未命中才下降到现有 DOM 逻辑
- R2. 不改 `Resource` 模型、不改 storage schema、不做 migration（与上一个 brainstorm 保持一致）
- R3. 结构化抽取集中在 `crawler/parser.py` 内部（不新建模块），抽成一个 `_extract_structured(soup) -> dict[field, value]` 函数，返回命中的字段字典

**数据源优先级（Sources）**
- R4. 顺序（高到低）：JSON-LD schema.org > OpenGraph (`og:*`) > Twitter Cards (`twitter:*`) > microdata (`itemprop=...`) > DOM 启发式
- R5. JSON-LD 支持 `@graph` 展开（部分 CMS 把 entities 包一层）、`@type` 字符串或数组、InteractionCounter 完整枚举（WatchAction/ViewAction/LikeAction/FavoriteAction/BookmarkAction/AgreeAction）
- R6. 不做 RDFa（复杂度 vs 覆盖率不划算，几乎没人用）；不做站点专属内联 JS（kissavs 的 `_detail_` 对象这类 —— 属于 per-site profile，推迟）

**字段覆盖（Fields）**
- R7. 结构化路径必须覆盖：`title`、`cover_url`、`views/likes/hearts`、`tags`（来自 `keywords` / `articleSection`）、`category`、`published_at`、`description`（可选扩展）
- R8. 同字段多源冲突时按 R4 优先级采信第一个有效值；无效值（空串、非数、越界）继续向后尝试

**Page-type 检测（Page Detection）**
- R9. JSON-LD `@type` ∈ 单条目类型（`VideoObject` / `Article` / `NewsArticle` / `BlogPosting` / `Product` / `Recipe` / ...）且 URL 非 root → detail（已在 kissavs fix 里落地）
- R10. 扩展 main container 回退：`section[class*="video|article|post|detail|content"]` 按文本量选最大的（已在 kissavs fix 里落地）

**观测性（Observability）**
- R11. 每次提取后记录每个字段的来源（JSON-LD / OG / Twitter / microdata / DOM / missing），存入 `Resource.raw_data` 的 JSON 里（已有字段，无 schema 改动）。用于 debug 和后续数据质量分析

**兼容（Compat）**
- R12. 现有测试（kissavs fix 后是 405 个）全部通过；新逻辑只改变 DOM 启发式"漏抓"的字段，不改变已正确字段
- R13. 新增 ≥3 组 fixture：OG-only 站、JSON-LD Article 站、JSON-LD VideoObject + InteractionCounter 完整站（kissavs 风格，可复用现有本地 HTML）

## Success Criteria

- 同一组真实站点 HTML 上，parser 输出的准确率（人工标注对照）从当前基线显著提升，尤其是 views/likes/hearts 字段
- `_extract_number_near_keyword` 的调用次数下降（多数字段在结构化阶段已命中）
- 已知 bug 类型消失：script/style 文本误匹配、SEO chain 污染 title、breadcrumb 末项歧义（部分已在 kissavs fix 里解决，架构升级后不会再手打补丁）

## Scope Boundaries

- 不引入 per-domain profile 注册表（用 YAML 配置某站优先用某 selector）—— 是明确未来方向但不在这次
- 不做 RDFa 或 Microformats 解析
- 不抓需要 JS 渲染才出现的结构化数据（已有 RenderThread 路径，是另一层的事）
- 不做站点内联 JS 对象解析（`window._detail_`, `__NEXT_DATA__`, `__NUXT__` 等 —— 下一个可选 unit）
- 不改 `Resource` 模型、不改 storage schema、不改 UI

## Key Decisions

- **结构化优先而非并行**：两条路径并行再合并 → 冲突消解复杂；直接串行（结构化失败才 DOM），降级可预测
- **OG + JSON-LD 捆绑支持**：只做 JSON-LD 不如连带 OG/Twitter 一起处理，因为小站只有 OG 的很多
- **单文件内聚**：不新建 `extractors/` 目录；规模还没到拆分的临界点，内聚更好维护
- **观测性走 raw_data**：不改 schema，复用现有 JSON 字段记录来源元信息

## Dependencies / Assumptions

- 现有 `_parse_jsonld_blocks` / `_jsonld_has_detail_entity` / `_extract_jsonld_metrics`（kissavs fix 里已实现）是这次架构升级的基础零件，可以直接扩展
- `Resource.raw_data` 当前用作 JSON 字符串字段，暂未正规使用，可以安全写入字段来源元信息

## Outstanding Questions

### Resolve Before Planning
- [Affects R11][User decision] raw_data 的字段来源元信息是否对外暴露（UI/导出）还是仅用于 debug 日志？这决定是否要设计稳定格式
- [Affects R7][User decision] 是否把 `description` 字段加进 `Resource` 模型（现在没有）？若是，需要 schema migration —— 会和 R2 冲突，需要权衡

### Deferred to Planning
- [Affects R5][Technical] InteractionCounter 之外的 rating/review 数据是否纳入（`aggregateRating.ratingValue`）？
- [Affects R7][Technical] tags 从 `keywords` 字符串解析时的分隔符策略（逗号 vs 顿号 vs 空格）
- [Affects R9][Needs research] `@type` 列表还有哪些应识别为 detail（`CreativeWork` 已加，但 `SoftwareApplication` / `Event` 是否纳入需根据目标站调研）

## Next Steps

→ Resolve the two `Resolve Before Planning` questions, then `/ce:plan`
