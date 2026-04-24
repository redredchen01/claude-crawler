---
title: P1 JS 渲染增强 - 实现计划
type: feat
status: active
date: 2026-04-20
origin: docs/brainstorms/2026-04-20-claude-crawler-optimization-analysis.md
---

# P1：JavaScript 渲染增强

## Overview

实现 RenderThread 完整化，使爬虫能处理动态内容网站。当前 SPA/CSR 网站爬取成功率 ~45%，目标 <5% 失败率。

**关键路径**：P0 完成（已 ✅） → **P1 实施（4 units）** → P2 性能

## Requirements Summary

来自 P0 优化分析（已验证）：

- **R1.1** — 无限滚动支持 (Option A: 内容稳定性检测)
- **R1.2** — 渲染内容集成 (parser 接口扩展 + source 元数据)
- **R1.3** — 智能页面检测 (启发式验证)
- **R1.4** — 超时降级 (回退到静态 HTML)

**Success Criteria**：
- 渲染管道集成度 ≥90%
- 无限滚动准确率 ≥80%（Instagram/TikTok 风格）
- 单页渲染 <10s
- SPA 爬取失败率 <5%

## Implementation Units

### Unit 4: 无限滚动实现（R1.1）

**Status**: Ready for implementation  
**Est. effort**: 2-3 hours  
**Dependencies**: P0 complete ✅

**Files**:
- Modify: `crawler/core/render.py` → add `_auto_scroll()` method
- Modify: `crawler/models.py` → extend RenderRequest with scroll config
- Create: `tests/test_infinite_scroll.py`

**Key config**:
```python
scroll_pause_ms = 500  # Pause between scroll attempts
max_scroll_count = 10  # Maximum attempts
stability_threshold = 3  # Consecutive no-DOM-change to stop
```

**Approach**:
- JavaScript injection: MutationObserver to detect new DOM nodes
- Strategy: Scroll → wait 500ms → check mutation count → repeat
- Stop condition: 3 consecutive scrolls with no DOM changes
- Error handling: NetworkError, RenderError, timeout → fallback to partial HTML

**Test scenarios**:
- ✓ Happy path: 5 scrolls → stabilize → return complete HTML
- ✓ Stable content: News site → 3 scrolls → stabilize
- ✓ Timeout: 30s no progress → return partial, mark source=rendered
- ✓ Integration: Scroll HTML → Unit 5 parser

---

### Unit 5: 渲染内容集成（R1.2）

**Status**: Blocked on Unit 4  
**Est. effort**: 2-3 hours  
**Dependencies**: Unit 4

**Files**:
- Modify: `crawler/parser.py` → add `source` parameter to parse_page + all _extract_*
- Modify: `crawler/core/engine.py` → wire render HTML to parser
- Modify: `crawler/models.py` → extend ParseResult
- Modify: `crawler/raw_data.py` → track extraction source
- Modify: `tests/test_parser.py` → add source parameter tests
- Create: `tests/test_render_integration.py`

**Key change**:
```python
# Before
parse_page(html, url)

# After
parse_page(html, url, source='static' | 'rendered')
```

**Approach**:
- Parser tracks data source: static HTML vs rendered DOM
- JS-injected OG tags (source='rendered') prioritized over static OG
- Fallback chain: JSON-LD > (JS OG) > (Static OG) > Microdata > DOM
- Monitoring: log_event('parse_complete', {url, source, fields_extracted})

**Test scenarios**:
- ✓ JS-injected OG: SPA OG only appears after render
- ✓ Static site: source='static' produces same results
- ✓ Integration: Unit 4 scroll + Unit 5 parse chain works end-to-end

---

### Unit 6: 智能页面检测（R1.3）

**Status**: Blocked on Unit 4  
**Est. effort**: 1-2 hours  
**Dependencies**: Unit 4

**Files**:
- Create: `crawler/page_detector.py` → `should_render(html) -> bool`
- Modify: `crawler/core/engine.py` → integrate detection logic
- Create: `tests/test_page_detector.py`

**Heuristic**:
```
should_render() = True if:
  AND len(html) < 20KB
  AND (
    '<script type="module">' in html
    OR '<body>.*</body>' is empty
    OR critical meta missing (title, description, og:*, twitter:*)
  )
```

**Approach**:
- Conservative: when in doubt, prefer to render
- Skip Chromium for clearly static content (>20KB + meta tags)
- Monitor: log_event('page_detection', {url, should_render, reason})

**Test scenarios**:
- ✓ SPA shell: <10KB + module script → should_render=True
- ✓ Static site: >20KB + meta tags → should_render=False
- ✓ Edge case: boundary conditions handled conservatively
- ✓ Integration: with Unit 4, render path auto-triggers

---

### Unit 7: 超时降级（R1.4）

**Status**: Blocked on Unit 4  
**Est. effort**: 1 hour  
**Dependencies**: Unit 4

**Files**:
- Modify: `crawler/core/render.py` → timeout handling in _real_render
- Modify: `crawler/core/engine.py` → handle partial rendered HTML
- Modify: `tests/test_render.py`

**Approach**:
- Render timeout (10s) → return partial HTML, mark source=rendered (timeout)
- Parser receives partial HTML, extracts what it can
- Monitoring: log_event('render_timeout', {url, elapsed_ms})

**Test scenarios**:
- ✓ Timeout: 10s elapsed → return partial, continue parsing
- ✓ Integration: partial HTML → successful resource extraction

---

## Execution Dependencies

```
Unit 4 (Infinite Scroll)
├─ Required by: Unit 5, 6, 7
├─ Requires: P0 complete ✅

Unit 5 (Parse Integration)
├─ Requires: Unit 4
├─ Required by: Full rendering pipeline

Unit 6 (Page Detection)
├─ Requires: Unit 4
├─ Parallel-able with Unit 5

Unit 7 (Timeout Fallback)
├─ Requires: Unit 4
├─ Parallel-able with Unit 5, 6
```

**Recommended sequence**:
1. Unit 4 (2-3h) → verify infinite scroll works
2. Unit 5 (2-3h) → wire into parser, establish end-to-end
3. Unit 6 & 7 (2-3h) → optimization & resilience, can parallelize

**Total effort**: 6-9 hours implementation + 2-3 hours testing & validation

---

## Blockers & Risks

**Known blockers**: None (P0 complete ✅)

**Implementation risks**:
- MutationObserver timing sensitivity → may need tuning on real sites
- Parser interface change (source parameter) → requires careful backfill across 150+ call sites
- Memory usage with large scrolled HTML → may need streaming or chunking

**Mitigation**:
- Unit 4: Test with real Instagram/TikTok-style pages before Unit 5
- Unit 5: Audit parser.py for all _extract_* call sites; use IDE refactoring
- Unit 7: Implement chunked HTML handling if memory concerns arise

---

## Success Gates

**Unit 4 complete when**:
- `pytest tests/test_infinite_scroll.py -v` → all pass
- Real-world test on 10+ Instagram/TikTok-style URLs → ≥80% accuracy
- No memory leaks (monitor process RSS during scroll)

**Unit 5 complete when**:
- `pytest tests/test_parser.py -v` → all pass
- `pytest tests/test_render_integration.py -v` → all pass
- Source metadata correctly tracked through pipeline

**Unit 6 complete when**:
- `pytest tests/test_page_detector.py -v` → all pass
- 100-page scan shows <10% unnecessary renders

**Unit 7 complete when**:
- `pytest tests/test_render.py -v` → timeout scenarios pass
- Partial HTML parsing succeeds (resources extracted even from incomplete DOM)

**P1 complete when**:
- ✓ All 4 units pass their gates
- ✓ Integration test: full pipeline (fetch → detect → render/scroll → parse → extract)
- ✓ SPA crawl success rate: <5% failure (vs current ~45%)

---

## Next Actions

**Immediate** (after P0 validation unit 0b/0c):
1. Start Unit 4 in new session
2. Set up test fixtures (Instagram-style HTML, timeout scenarios)
3. Implement _auto_scroll() with MutationObserver

**Validation** (before Unit 5):
1. Run against 10+ real Instagram/TikTok URLs
2. Measure scroll performance, memory, accuracy
3. Refine heuristic if accuracy <80%

**Phase-out** (post-P1):
1. P2: HTTP cache LRU + batch DB ops
2. P4: Type annotation completion (養護)

