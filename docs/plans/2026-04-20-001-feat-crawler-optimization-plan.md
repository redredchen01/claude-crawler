---
title: Claude Crawler 优化实现计划
type: feat
status: active
date: 2026-04-20
origin: docs/brainstorms/2026-04-20-claude-crawler-optimization-analysis.md
---

# Claude Crawler 优化实现计划

## Overview

实现 Claude Crawler 的 4 层优化（可靠性基础 → JS 渲染 → 性能 → 代码质量），解锁 SPA/CSR 网站爬取能力，提升系统可靠性和性能。

**关键路径**：P0（可靠性）→ P1（JS 渲染）‖ P2（性能）→ P4（代码质量）

## Problem Frame

Claude Crawler MVP（606 测试）已稳定运行，但存在 4 个优化机会：

1. **功能缺口**：RenderThread 存在但未充分利用，SPA/CSR 网站爬取成功率 ~45%，需要 <5%
2. **可靠性风险**：R1 新功能引入 4 个新失败模式（Chromium 崩溃、超时、DOM 检测、集成），需要先建立异常+重试+监控基础
3. **性能余量**：缓存和数据库操作未优化，吞吐量有 10-20% 提升空间
4. **代码质量**：99% 类型覆盖（实际不需要 P2，作为养护任务延后）

**立即阻塞项**：
- 8 个测试在 main 分支失败（fetcher.py:312-319 解包错误）
- R1.1 滚动停止策略需验证
- R1.3 启发式精度需基准化

## Requirements Trace

**来自优化分析文档：**

- **R0.1** — 统一异常策略 (CrawlerException 基类)
- **R0.2** — 智能重试 (exponential backoff + 浏览器重启)
- **R0.3** — 核心监控 (JSON 日志导出)
- **R1.1** — 无限滚动支持 (Option A: 内容稳定性检测)
- **R1.2** — 渲染内容集成 (parser 接口扩展 + source 元数据)
- **R1.3** — 智能页面检测 (启发式验证)
- **R1.4** — 超时降级 (回退到静态 HTML)
- **R3.1** — HTTP 缓存 LRU 上限 (50MB)
- **R3.2** — 批量 DB 操作 (事务安全版本)

**成功指标**：
- P0：异常覆盖率 ≥95%，瞬态错误重试成功率 ≥70%，故障自恢复率 ≥80%
- P1：渲染集成度 ≥90%，无限滚动准确率 ≥80%，单页渲染 <10s，SPA 爬取失败率 <5%
- P2：吞吐量 ≥10% 提升 vs 基准，内存 ≤600MB (100 页)，缓存命中率 ≥50%

## Scope Boundaries

**不做的事：**
- WebDriver API 注入、自定义 JavaScript 执行
- 登录流程、Cookie 管理
- 视频/音频流处理
- 分布式追踪、APM 集成
- 实时告警通知（仅日志）
- 强制 mypy strict 模式（P4 养护）
- Redis 集群化缓存（保留 SQLite）

## Context & Research

### 相关代码和模式

**核心模块：**
- `crawler/core/render.py` — RenderThread 实现（线程亲和 Playwright，防御性复杂度，熔断器）
- `crawler/core/fetcher.py` — HTTP 层（缓存追踪，需修复 line 312-319 解包）
- `crawler/parser.py` — 解析管道（66KB，无状态，15+ _extract_* 函数）
- `crawler/core/engine.py` — 主编排器（WriterThread 序列化，FetcherThread 池）
- `crawler/storage.py` — 数据库层（SQLite，UNIQUE 约束 O(N²) 病理，79% 类型覆盖）
- `crawler/models.py` — 数据模型（dataclass，需扩展 RenderRequest）

**相关测试：**
- `tests/test_crawler.py` — 8 个失败（fetch_page_with_cache_tracking 解包）
- `tests/test_render.py` — RenderThread 测试（覆盖 crash recovery）
- `tests/test_parser.py` — 解析器测试（≥3 个单位，无 source 元数据）

### 关键决策和理由

| 决策 | 理由 |
|------|------|
| **P0 优先于 P1** | R1 引入 4 个新失败模式，无 P0 支撑则 ROI ≈0；P0.1+P0.2 是必需基础 |
| **R1.1 选项 A（内容稳定性）** | 基于 Instagram/TikTok 风格 SPA（连续 3 次滚动无新 DOM = 停止）；需验证 ≥80% 准确率 |
| **R1.2 扩展 parser 接口** | 非简单集成：150+ 调用点需更新 source 参数，scope 为 1.5-2 天工作 |
| **R3.2 保留 WriterThread** | 现有序列化确保事务安全，批处理无并发风险；buffer flush on close 足够 |
| **P2 性能并行于 P1** | 缓存+批处理独立于 JS 渲染，可同步推进；parser 缓存延后（命中率 0% in single-scan） |
| **P4 后置养护** | 代码质量 DX-only，1-2 天工作，无用户价值；ship P0-P1 first |

### 机制和模式

**异常处理** — 预期模式：定义异常基类，子类覆盖 NetworkError/RenderError/ParserError/StorageError，所有模块使用

**重试逻辑** — 参考现有 render.py (line 617) 循环 + backoff，扩展到 HTTP 和存储层

**缓存策略** — 现有 HTTP 缓存 (ETag/Last-Modified)，添加 LRU 驱逐限制，parser 缓存延后

**解析器接口** — 现有无状态 _extract_* 函数，扩展签名加 `source: rendered|static` 参数

## Implementation Units

### 前置条件：P0 阻塞项清除

- [ ] **Unit 0a: 修复测试失败**

**Goal：** 恢复 main 分支可用性，解除 P0 blocker

**Requirements：** 必须在所有新功能工作前

**Dependencies：** 无

**Files：**
- Modify: `crawler/core/fetcher.py` (line 312-319)
- Run: `pytest tests/test_crawler.py` (all 8 tests should pass)

**Approach：**
- `_attempt_fetch()` 返回 (html, is_cached, etag, last_modified)
- `fetch_page_with_cache_tracking()` wrapper 仅返回 (html, is_cached)
- 修复：line 312 改为只解包 (html, is_cached)，忽略 etag/last_modified
- 5 分钟修复

**Test scenarios：**
- Happy path: 正常 HTTP 请求 → 返回 (html, cached=False)
- Cached hit: ETag 匹配 → 返回 (html, cached=True)
- Network error: 连接失败 → 抛出 NetworkError

**Verification：**
- `pytest tests/test_crawler.py -v` 全部通过

---

- [ ] **Unit 0b: 建立性能基准线**

**Goal：** 量化当前性能，建立 P3 ROI 验证基础

**Requirements：** P3 成功指标验证需依赖此基准

**Dependencies：** 无（可与 Unit 0c 并行）

**Files：**
- Create: `docs/benchmarks/2026-04-20-baseline.json`
- Modify: `scripts/benchmark.py` (如不存在则新建)

**Approach：**
- 运行 100 页扫描（测试 URL 列表从 tests/fixtures/benchmark_urls.txt 读取）
- 测量：pages/sec、峰值内存、缓存命中率、缓存大小（字节）
- 输出：JSON 格式 {pages_per_sec, peak_memory_mb, cache_hit_rate, cache_bytes}
- 耗时：2-3 小时

**Test scenarios：**
- 单次扫描基准完整运行
- 日志捕获（无 P3 执行）

**Verification：**
- `docs/benchmarks/2026-04-20-baseline.json` 存在且包含所有指标

---

- [ ] **Unit 0c: 验证 R1.1 和 R1.3 启发式**

**Goal：** 证实 R1.1 选项 A 和 R1.3 页面检测启发式在真实数据上可行

**Requirements：** R1 ROI 验证，决策确认

**Dependencies：** 无（可与 Unit 0b 并行）

**Files：**
- Create: `tests/fixtures/heuristic_test_urls.jsonl` (100+ 真实或代表性 URLs)
- Create: `scripts/validate_heuristics.py` (选项 A + 启发式验证脚本)
- Create: `docs/validation/2026-04-20-r1-validation-report.md`

**Approach：**
- **R1.1 验证**：对 100+ 测试 URL 运行选项 A (MutationObserver，3 次无新 DOM = 停止)，手工或自动分类准确率
  - 预期：≥80% 准确率，特别是 Instagram/TikTok 风格
  - 失败路径：若 <80%，触发设计评审（选择选项 B 或混合）
  
- **R1.3 验证**：对同批 URL 测试启发式 (初始 HTML <20KB AND ...)，分类准确率
  - 预期：≥80% 准确判断是否需要渲染
  - 失败路径：若 <80%，调整启发式或改用机器学习/列表

- 耗时：3-5 天工作

**Test scenarios：**
- Happy path: Instagram URL → 检测为需渲染 → 准确率计算
- Edge case: 小型静态网站 → 检测为不需渲染 → 准确性验证
- Error case: 超时或崩溃 → 回退到保守策略（假定需渲染）

**Verification：**
- 验证报告包含样本 URL、结果分布、准确率统计
- 若准确率 ≥80%，解锁 P1 规划；若 <80%，记录决策变更

---

### P0 实现：可靠性基础

- [ ] **Unit 1: 异常体系定义**

**Goal：** 定义统一异常策略，为 P1 新失败模式提供处理框架

**Requirements：** R0.1

**Dependencies：** Unit 0a 修复（测试通过）

**Files：**
- Create: `crawler/exceptions.py`
- Modify: `crawler/__init__.py` (导出异常类)
- Modify: `tests/test_exceptions.py` (新建，异常定义单元测试)

**Approach：**
- 定义 `CrawlerException(Exception)` 基类，包含：
  - `error_code: str` (唯一标识符)
  - `severity: str` (critical/error/warning)
  - `retriable: bool` (是否可重试)
  
- 定义子类：
  - `NetworkError(CrawlerException)` — HTTP、DNS、连接超时
  - `RenderError(CrawlerException)` — Chromium 崩溃、渲染超时、DOM 检测失败
  - `ParserError(CrawlerException)` — 解析失败、无效 HTML
  - `StorageError(CrawlerException)` — DB 写入失败、约束冲突

- 现有代码改为使用：
  - `core/fetcher.py` — 捕获 `requests.exceptions.*` 转为 `NetworkError`
  - `core/render.py` — 捕获 Playwright 异常转为 `RenderError`
  - `parser.py` — 捕获解析异常转为 `ParserError`
  - `storage.py` — 捕获 sqlite3 异常转为 `StorageError`

**Patterns to follow：**
- 遵循现有 render.py 异常处理模式（line 54-60 ShutdownError/RenderQueueFullError）

**Test scenarios：**
- Happy path: 各异常类实例化、属性设置正确
- Edge case: 异常序列化（用于日志）、字符串表示清晰
- Inheritance: 子类实例 `isinstance(e, CrawlerException)` 成立

**Verification：**
- `pytest tests/test_exceptions.py -v` 通过
- 现有所有模块的异常处理更新为新异常类

---

- [ ] **Unit 2: 智能重试机制**

**Goal：** 实现 exponential backoff 和故障恢复，为网络/渲染/存储错误提供重试能力

**Requirements：** R0.2

**Dependencies：** Unit 1 (异常定义)

**Files：**
- Create: `crawler/retry.py` (重试策略和辅助函数)
- Modify: `core/fetcher.py` (HTTP 请求添加重试)
- Modify: `core/render.py` (渲染失败浏览器重启改进)
- Modify: `storage.py` (存储错误重试)
- Modify: `tests/test_retry.py` (新建，重试单元和集成测试)

**Approach：**
- `retry.py` 中定义：
  - `Backoff` 类 (配置 backoffs=[1s, 2s, 4s, 8s], max_attempts=3)
  - `should_retry(exception: CrawlerException) -> bool` (检查 exception.retriable)
  - `execute_with_retry(fn, backoff, exceptions_to_catch)` (通用重试装饰器)

- HTTP 层（fetcher.py）：
  - 使用 `execute_with_retry` 包装 `fetch_page_with_cache_tracking()`
  - NetworkError 可重试，重试 ≤3 次 + backoff
  - 日志记录重试尝试（attempt N/3）

- 渲染层（render.py）：
  - 现有 line 617 重试循环改为使用 backoff
  - RenderError (Chromium 崩溃、超时) 触发浏览器重启 + 2 秒 backoff
  - 失败 3 次后熔断，标记渲染禁用

- 存储层（storage.py）：
  - DB 事务失败时使用 backoff 重试
  - StorageError 最多重试 2 次（短 backoff，避免死锁扩大）

**Execution note：** 从集成测试开始验证重试/backoff 行为，再逐层单元测试

**Patterns to follow：**
- 遵循 render.py 线程亲和模式（单线程重启）
- 遵循 fetcher.py 连接池模式（复用连接）

**Test scenarios：**
- Happy path: 第一次成功，无重试
- Transient failure: 第 2 次成功，backoff 间隔正确
- Max attempts exceeded: 3 次失败后抛出 NetworkError/RenderError
- Integration: 网络超时 → 重试 2 次 → 最终失败 → 标记页面为 failed（不导致扫描停止）
- Chromium crash: 渲染失败 → 重启浏览器 → 重试（1 次）→ 回退到静态 HTML

**Verification：**
- `pytest tests/test_retry.py -v` 通过所有场景
- 集成测试：100 页扫描中模拟网络中断，验证重试成功率 ≥70%

---

- [ ] **Unit 3: 核心监控和日志**

**Goal：** 记录关键事件和指标，支持 JSON 导出便于离线分析

**Requirements：** R0.3

**Dependencies：** Unit 1 (异常定义)

**Files：**
- Create: `crawler/monitoring.py` (事件记录器、JSON 导出)
- Modify: `core/engine.py` (集成事件记录)
- Create: `tests/test_monitoring.py`

**Approach：**
- `monitoring.py` 中定义 `EventLogger` 类：
  - `log_event(event_type: str, data: dict, timestamp: float)` — 记录事件
  - `export_json(filepath) -> str` — 导出 JSON 格式日志
  - 事件类型：scan_start, scan_complete, fetch_failed, render_timeout, parser_error, db_error, etc.

- 集成点（engine.py）：
  - 扫描启动 → log_event('scan_start', {url, max_pages})
  - 页面完成 → log_event('page_fetched', {url, status, fetch_time_ms})
  - 渲染失败 → log_event('render_error', {url, error_code, attempt})
  - 扫描完成 → log_event('scan_complete', {total_pages, failed_pages, total_time_ms})

- 日志级别：
  - DEBUG: 每页详细日志
  - INFO: 扫描级别摘要
  - ERROR: 失败事件
  - 存储：内存缓冲 (max 10K 事件) + 可导出 JSON

**Test scenarios：**
- Happy path: 扫描日志从 scan_start 到 scan_complete
- Error logging: 网络失败 → log_event('fetch_failed') + 重试记录
- JSON export: 导出格式合法且完整
- Integration: 100 页扫描 → JSON 包含所有页面事件

**Verification：**
- `pytest tests/test_monitoring.py -v` 通过
- 导出 JSON 可被标准 JSON 解析器读取
- 关键事件计数 = Unit 2 重试次数 + Unit 1 异常处理

---

### P1 实现：JavaScript 渲染增强

- [ ] **Unit 4: 无限滚动实现（R1.1）**

**Goal：** 实现选项 A（内容稳定性），自动检测和处理分页加载

**Requirements：** R1.1（需验证通过 Unit 0c）

**Dependencies：** Unit 1 (异常), Unit 2 (重试), Unit 3 (监控)

**Files：**
- Modify: `core/render.py` 
  - 新建 `_auto_scroll()` 方法，使用 MutationObserver 检测新 DOM
  - 配置参数：`scroll_pause_ms=500, max_scroll_count=10, stability_threshold=3` (3 次无新节点 = 停止)
- Modify: `models.py` (扩展 RenderRequest 配置)
- Create: `tests/test_infinite_scroll.py`

**Approach：**
- RenderThread 在 `render_page()` 后添加 `_auto_scroll()` 步骤（仅当 enable_scroll=True）
- JavaScript 注入：
  ```javascript
  var mutationCount = 0;
  var observer = new MutationObserver(() => { mutationCount++; });
  observer.observe(document.body, {childList: true, subtree: true});
  // 循环：window.scrollBy(0, window.innerHeight), wait 500ms, check mutationCount
  // 若 3 次循环无增长，停止；否则继续，最多 10 次
  ```
- 错误处理：
  - Nil（无初始 HTML）→ 抛出 NetworkError
  - Empty（超时无新内容）→ 返回部分 HTML，标记 source=rendered (partial)
  - Error（Chromium 崩溃）→ RenderError，触发 Unit 2 重试

**Patterns to follow：**
- 遵循 render.py 现有 `page.goto()` + `page.wait_for_load_state()` 模式
- 遵循 `_render_request_handler()` 线程亲和逻辑

**Test scenarios：**
- Happy path: Instagram 风格页面 → 滚动 5 次 → 3 次无新 DOM → 停止，返回完整 HTML
- Stable content: 新闻网站 → 滚动 3 次 → 稳定，无更多内容
- Timeout: 30 秒内无进展 → 返回当前 HTML，标记 source=rendered (timeout)
- Integration: 无限滚动 + R1.2 集成 → 解析器接收 source=rendered 元数据

**Verification：**
- `pytest tests/test_infinite_scroll.py -v` 通过
- Unit 0c 验证报告确认 ≥80% 准确率

---

- [ ] **Unit 5: 渲染内容集成（R1.2）**

**Goal：** 将渲染 HTML 注入 parser 管道，扩展 parser 接口支持 source 元数据

**Requirements：** R1.2

**Dependencies：** Unit 4 (无限滚动), Unit 1 (异常)

**Files：**
- Modify: `parser.py` 
  - 更新 `parse_page(html, url, source='static')` 签名
  - 更新所有 `_extract_*()` 方法加 `source` 参数
  - 在 extraction 结果中标记 `source`（用于 Unit 3 监控）
- Modify: `core/engine.py` (wire render HTML → parse_page)
- Modify: `models.py` (ParseResult 扩展 source_metadata 字段)
- Modify: `raw_data.py` (扩展 OG/JSON-LD/microdata 提取考虑 source)
- Modify: `tests/test_parser.py` (add source parameter tests)
- Create: `tests/test_render_integration.py`

**Approach：**
- parser.py 修改：
  - 签名：`parse_page(html, url, source='static')` 
  - 所有 `_extract_*` 函数添加 `source` 参数，保留默认值
  - Example: `_extract_jsonld_blocks(soup, source='static') -> list[dict]`

- engine.py 修改：
  - 渲染路径（line 216）：取 rendered HTML，调用 `parse_page(html, url, source='rendered')`
  - 静态路径（line 200）：调用 `parse_page(html, url, source='static')`

- raw_data.py 修改：
  - OG 提取时若 source='rendered' 且找到 JS 注入标签，标记为 `extraction_source='js'`
  - 优先级：JSON-LD > (JS-injected OG) > (Static OG) > Microdata > DOM

- 监控集成（Unit 3）：
  - log_event('parse_complete', {url, source, fields_extracted})

**Patterns to follow：**
- 遵循现有 `_extract_jsonld_blocks()` 模式（soup 参数）
- 遵循现有 ParseResult dataclass 结构

**Test scenarios：**
- Happy path: 渲染 HTML → parse_page(source='rendered') → 提取所有字段
- JS-injected OG: SPA 的 OG 标签仅在 JS 渲染后出现 → 静态 HTML 失败 → 渲染成功
- Static HTML: 纯服务端渲染 → source='static' → 提取相同结果
- Integration: Unit 4 无限滚动 HTML + Unit 5 集成 → 多页动态内容提取

**Verification：**
- `pytest tests/test_parser.py -v` 通过（需添加 source 参数）
- `pytest tests/test_render_integration.py -v` 验证渲染→解析→监控完整链路

---

- [ ] **Unit 6: 智能页面检测（R1.3）**

**Goal：** 自动判断页面是否需要渲染，避免不必要的 Chromium 启动

**Requirements：** R1.3（需验证通过 Unit 0c）

**Dependencies：** Unit 4 (R1.1)

**Files：**
- Create: `crawler/page_detector.py` (启发式检测函数)
- Modify: `core/engine.py` (集成页面检测逻辑)
- Modify: `tests/test_page_detector.py`

**Approach：**
- `page_detector.py` 中定义 `should_render(html: str) -> bool`：
  - 规则：`len(html) < 20KB AND ('<script type="module">' in html OR '<body>.*</body>' is empty OR critical meta missing)`
  - Critical meta：title, description, og:*, twitter:*
  - 返回 True 若判定为 SPA/需渲染

- engine.py 修改（line 200-220）：
  - 静态获取后调用 `should_render(html)`
  - 若 True 且 RenderThread 可用 → 触发渲染
  - 若 False → 直接解析静态 HTML

- 监控：
  - log_event('page_detection', {url, should_render, reason})

**Patterns to follow：**
- 遵循现有 frontier.py 启发式（URL 去重检测）

**Test scenarios：**
- Happy path: SPA (shell HTML <10KB + <script type="module">) → should_render=True
- Static site: 完整 HTML (>20KB + meta tags) → should_render=False
- Edge case: 边界 20KB + module script → should_render=True（保守）
- False positive: 小网站无 <script> → should_render=False → 静态解析成功
- Integration: 与 Unit 4 结合，渲染路径自动触发

**Verification：**
- Unit 0c 验证报告确认 ≥80% 准确率
- `pytest tests/test_page_detector.py -v` 通过
- 100 页扫描中不必要的 Chromium 启动次数 <10%

---

- [ ] **Unit 7: 超时降级（R1.4）**

**Goal：** 渲染超时时回退到静态 HTML，确保最终成功

**Requirements：** R1.4

**Dependencies：** Unit 4 (无限滚动), Unit 5 (集成)

**Files：**
- Modify: `core/render.py` (添加超时降级)
- Modify: `core/engine.py` (捕获 RenderError 超时)
- Modify: `tests/test_render_timeout.py`

**Approach：**
- render.py 修改：
  - 现有 `page.wait_for_load_state()` timeout=10s 后若超时
  - 返回当前已渲染的 HTML（部分），而非抛出异常

- engine.py 修改：
  - 捕获 RenderError (timeout) → 记录日志 → 回退到静态 HTML
  - 调用 parse_page(static_html, source='static')（使用缓存的初始响应）

- 监控：
  - log_event('render_timeout', {url, partial_html_size})

**Test scenarios：**
- Happy path: 渲染成功 <10s，无超时
- Timeout: 10s 内无 networkidle → 返回当前 HTML → 回退解析
- Graceful degradation: SPA 超时 → 回退静态 HTML → 提取部分数据（仍比无 render 好）

**Verification：**
- `pytest tests/test_render_timeout.py -v` 通过
- 集成：超时页面标记为 source=static (fallback) 在 Unit 3 日志中

---

### P2 实现：性能优化

- [ ] **Unit 8: HTTP 缓存 LRU 上限（R3.1）**

**Goal：** 添加内存限制到 HTTP 缓存，防止无界增长

**Requirements：** R3.1（需先建立基准 Unit 0b）

**Dependencies：** 无（独立）

**Files：**
- Modify: `crawler/cache.py` (添加 LRU 和内存上限)
- Modify: `tests/test_cache.py`

**Approach：**
- cache.py 中修改 `CacheService`：
  - 添加 `max_size_bytes=50*1024*1024` 配置
  - 跟踪当前缓存大小
  - 超限时触发 LRU 驱逐（最久未用项）
  - 监控：log 驱逐事件

- LRU 实现：
  - 使用 `collections.OrderedDict` 或 `functools.lru_cache` 的自定义版本
  - 记录最后访问时间，驱逐时间最早的项

**Patterns to follow：**
- 遵循现有 cache.py ETag/Last-Modified 追踪模式

**Test scenarios：**
- Happy path: 缓存 10MB → 下 50MB → 命中率 >60%
- Eviction: 缓存满 (50MB) → 新项加入 → LRU 项驱逐 → 当前大小 <50MB
- Hit after eviction: 新请求命中仍在缓存的项 → 时间戳更新

**Verification：**
- `pytest tests/test_cache.py -v` 通过
- 单元 0b 基准测试后，100 页扫描缓存大小 <50MB
- 缓存命中率 ≥50%（基于真实爬取数据）

---

- [ ] **Unit 9: 批量数据库操作（R3.2）**

**Goal：** 优化存储层，批量插入减少 SQLite 事务开销，同时确保事务一致性

**Requirements：** R3.2

**Dependencies：** Unit 1 (异常)

**Files：**
- Modify: `crawler/storage.py` (改 save_resource 为批处理)
- Modify: `core/writer.py` (批处理协调)
- Modify: `tests/test_storage.py`

**Approach：**
- storage.py 修改：
  - 当前 `save_resource()` 逐个插入
  - 改为 `save_resources_batch(resources: list, batch_size=100)` 
  - 使用 `executemany()` 批量插入（SQL 参数化）

- writer.py 修改（WriterThread 序列化确保安全）：
  - 缓冲资源列表，当缓冲满 batch_size OR 收到 flush 信号时批处理
  - 关键：关闭时调用 `flush_pending()` 确保 buffer flushed → DB committed
  - 不变量：`counter_updated ↔ DB rows committed` 通过同步刷新维护

- 监控：
  - log_event('batch_insert', {batch_size, insert_time_ms})
  - 跟踪中止时缓冲大小

**Execution note：** 从集成测试开始（关闭扫描时缓冲刷新），再单元测试

**Patterns to follow：**
- 遵循现有 WriterThread 单线程序列化模式（page 写入已用批处理）

**Test scenarios：**
- Happy path: 100 资源 → 10 批 (size=10) → 插入耗时 <100ms
- Graceful interrupt: 扫描中途 Ctrl+C → flush pending (50 资源未提交) → DB 一致
- Integration: Unit 0b 基准测试 → 100 页×50 资源/页 = 5000 批插入 → 耗时 <1s

**Verification：**
- `pytest tests/test_storage.py -v` 通过
- 集成测试：扫描中止后检查 DB 行数 = 缓冲 flush 数量（无丢失）
- 单元 0b 基准：吞吐量 ≥10% 提升 (相对基准)

---

### P4 实现：代码质量（可选养护）

- [ ] **Unit 10: 类型注解补充**

**Goal：** 提升代码质量至 90%+ 类型覆盖（可选，UX 用途）

**Requirements：** P4（低优先级）

**Dependencies：** Unit 1-9 完成后可并行或推迟

**Files：**
- Modify: `crawler/storage.py` (补全 6 个无类型函数)
- Modify: `crawler/config.py` (使用 dataclass 或 TypedDict)
- Modify: `crawler/models.py` (若有缺失)

**Approach：**
- storage.py：逐函数添加参数和返回类型
  - Example: `def save_page(page: Page, job_id: str) -> PageRecord:`
  - 配置模块：config values 用 `@dataclass Config:` 封装
  
- 运行 `mypy --check-untyped-defs` 验证 <5 errors

**Test scenarios：**
- Type checking: mypy 无新增错误

**Verification：**
- `mypy --check-untyped-defs` 通过
- 类型覆盖率测试（使用 `coverage.py` 或类似）≥90%

---

## System-Wide Impact

| 关注面 | 影响 | 处理 |
|--------|------|------|
| **异常传播** | P0 定义 4 个异常类，所有模块改用这些；P1 RenderError 触发 P0.2 重试 | Unit 1+2 协调 |
| **缓存一致性** | 新增 HTTP 缓存 LRU (P2.1) 和 parser 缓存延后 (P3.1)；需隔离两层 | Unit 8 配置隔离 |
| **并发安全** | WriterThread 保持单线程序列化，P2.2 批处理无并发风险 | Unit 9 依赖现有设计 |
| **监控覆盖** | P0.3 日志记录所有关键路径，P1 各层都需集成 log_event | Unit 3 统一接口 |
| **数据库约束** | UNIQUE(scan_job_id, url) O(N²) 问题保持，P2.2 批处理缓解但不消除 | Unit 9 性能测试验证 |
| **API 表面** | parser.py `parse_page()` 签名扩展 source 参数，下游调用点需更新（150+） | Unit 5 full audit |
| **故障模式** | P1 引入 4 新失败模式（Chromium, timeout, DOM detect, integration)；P0 负责捕获+重试+监控 | Unit 1-3 完整覆盖 |

## Risks & Dependencies

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| R1.1 启发式验证失败 (<80%) | 中 | R1 ROI 折损；需选择方案 B 或混合 | Unit 0c 提前验证；决策评审 |
| R1.2 parser 签名改变超过预期 (>200 调用点) | 低 | 1.5→3 天工作；集成测试复杂 | Unit 5 audit 前完整 grep |
| Chromium 生命周期在高并发下失败 (Unit 4+5) | 低 | P1 ROI 损耗；需重构 render.py | Unit 0a 前压力测试 (1000 pages) |
| SQLite O(N²) 约束在 100K 页时超限 | 低 | 性能目标不可达；需迁移 | Unit 9 基准测试 10K 页 |
| P0.2 重试导致 DOS 反向调用 (retry storm) | 低 | 客户端被 API 限流封禁 | 配置速率限制 + 指数退避验证 |

## Deferred Questions

- **R1.1 选项最终确认**：单选 Option A（内容稳定性）vs B（滚动次数）vs 混合；决策权交由 Unit 0c 验证结果
- **R1.2 adapter vs signature change**：设计决策（创建 RenderAwareParser 子类 vs 直接改签名）；Unit 5 design review 前确认
- **P2 性能基准重新测量**：Unit 0b 完成后重新评估 P3 是否应提前于 P1（若基准显示 >30% 吞吐量增益空间）
- **P0.3 JSON export 格式**：单选 JSON Lines (JSONL) vs 数组；影响离线分析工具链

## Documentation / Operational Notes

- **监控日志**：P0.3 产生的 JSON 日志应定期导出至 `docs/logs/`，用于性能分析和故障诊断
- **部署**：P0（Unit 1-3）应作为基础 PR 先行合并；P1 可在 P0 合并后并行推进 P2
- **版本标记**：P0+P1 完成后标记 v0.3.0；建议 release notes 强调 SPA 支持解锁
- **回滚计划**：若 P1 在生产环境中导致 Chromium 资源耗尽，降级方案为 disable_render=True 配置临时回退

## Sources & References

- **Origin document:** [2026-04-20-claude-crawler-optimization-analysis.md](../brainstorms/2026-04-20-claude-crawler-optimization-analysis.md)
- **Related code:**
  - `crawler/core/render.py` (line 14-17 lifecycle, line 54-60 exceptions, line 617 retry pattern)
  - `crawler/core/fetcher.py` (line 312-319 unpacking bug, line 319 caching return)
  - `crawler/parser.py` (line 1-15 extraction, line 150+ _extract_* functions)
  - `crawler/core/engine.py` (line 136-150 WriterThread coordination, line 200-220 fetch flow)
- **Test files:**
  - `tests/test_crawler.py` (8 failing, need fix in Unit 0a)
  - `tests/test_render.py` (RenderThread lifecycle tests)
- **External docs:**
  - Playwright Python docs (async/sync patterns, browser lifecycle)
  - SQLite batch insert optimization
  - MutationObserver API for DOM change detection
