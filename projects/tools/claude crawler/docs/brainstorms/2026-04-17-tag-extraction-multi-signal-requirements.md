---
date: 2026-04-17
topic: tag-extraction-multi-signal
---

# Tag Extraction: Multi-Signal Scoring for Cross-Site Generalization

## Problem Frame

当前 `crawler/parser.py` 的 tag 提取依赖两条规则：`a[rel="tag"]` 和 `[class*="tag"] a` fallback。这在 `<h3 class="tags">` 这类容器上能命中，但：

- **容器 class 不含 "tag"** 的站点（`.post-meta` / `.entry-footer` / `.keywords` / 自定义命名）会漏抓
- **category/theme 链接** 混在 tag 列表里被当成 tag（示例：`<a class="cat" href="/av/theme/...">直接开啪</a>` 会被和真 tag 一起返回）
- **HTML 结构以外的强信号**（href 路径含 `/tag/`、URL 含 percent-encoded 中文、`rel="tag"`、class 含 `label/keyword/topic`）没被联合利用

目标：用多信号评分让 tag 识别跨站更稳，同时把 category 与 tag 区分开。

## Requirements

**识别逻辑（Signals）**
- R1. 对每个候选 `<a>` 计算一个 tag 分数，至少考虑以下信号：href 路径段命中 tag 模式（`/tag/`、`/tags/`、`/label/`、`/keyword/`、`/topic/`）、href 含 percent-encoded 非 ASCII、`rel="tag"`、自身或祖先 class 含 tag/label/keyword、文本长度在合理 tag 范围（1–20 字符）、兄弟 `<a>` 呈重复链表结构（siblings 相似度）
- R2. 超过阈值的候选归类为 tag；低于阈值者丢弃
- R3. 识别 category 信号并**从 tag 结果中剔除**：href 含 `/theme/`、`/category/`、`/categories/`、`/channel/`、`/cat/`，或 class 含 `cat`/`category`/`channel`/`section`

**输出模型（Output）**
- R4. tags 仍写入 `Resource.tags`，**不新增字段、不改 storage schema**
- R5. 从 tag block 识别到的 category link 用于**补强** `Resource.category`；优先级：breadcrumb > 识别到的 category link > URL 首段
- R6. 同一页面可能出现多个 category 链接；只取第一个（最靠近正文的）写入 `Resource.category`

**作用域（Scope）**
- R7. detail page 和 list card 两条路径共用同一套打分逻辑（抽成辅助函数），避免两处实现漂移
- R8. 保留现有容器优先原则：若 `<article>`/`<main>` 存在则仅在容器内评分；否则整个 `<soup>` 评分但保留 `_FALLBACK_TAG_CLOUD_CAP` 的 sanity 截断

**兼容性（Compat）**
- R9. 现有 151+ 测试全部通过；`rel="tag"` 和 `[class*="tag"]` 已覆盖的正样本继续命中
- R10. 新增至少 2 组 fixture：示例站（`<h3 class="tags">` + `class="cat"` 混入）、一个 class 不含 "tag" 的站点（例如 `.post-meta a`）

## Success Criteria

- 示例 HTML 区块：返回 5 个 tags（偶像/巨乳/独角戏/痴女/纪录片），且 `Resource.category == "直接开啪"`（若 breadcrumb 缺失）
- 现有 MVP 测试（tests/test_parser.py、test_analysis.py 等）零回归
- 至少 2 组新站点 fixture 覆盖：容器 class 含 "tag" 的情况 + 不含 "tag" 的情况

## Scope Boundaries

- 不做 per-domain profile 注册表（未来可选）
- 不改 `Resource` 模型、不改 storage schema、不改 migration
- 不动 `crawler/analysis.py` 的频率打分
- 不引入 ML / 模糊匹配 / NLP 判词性
- 不改变 detail/list 页面类型判定逻辑

## Key Decisions

- **多信号评分而非容器优先**：容器名在各站差异过大，href pattern 和 percent-encoded CJK 是更稳的跨站信号
- **category 复用现有字段**：避免 schema/migration 成本；识别出的 category link 比 URL 首段更准，作为 breadcrumb 的补强来源
- **阈值而非硬规则**：每个信号加分，命中多条才算 tag，降低单信号误判

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] 各信号具体权重与阈值需要在实现+调 fixture 时校准
- [Affects R7][Technical] `_extract_detail_resource` 与 `_extract_list_resources` 的公共打分函数放在 parser.py 内部私有，还是抽到独立 helper 模块

## Next Steps

→ `/ce:work` for implementation
