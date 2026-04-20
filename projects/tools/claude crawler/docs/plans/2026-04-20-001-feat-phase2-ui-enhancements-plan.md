---
title: feat: Phase 2 UI 增强 — 实时进度统计 & 历史管理
type: feat
status: completed
date: 2026-04-20
origin: docs/brainstorms/2026-04-20-crawler-ui-enhancements-requirements.md
---

# Phase 2 UI 增强 — 实时进度统计 & 历史管理

## Overview

扩展 Streamlit UI 以支持实时性能监控和历史扫描管理。当前 UI 仅展示基础进度（页数、URL、耗时），缺乏性能洞察和历史查询能力。Phase 2 将通过扩展进度事件、增强存储查询、重构 UI 布局来解决这些问题，无需修改爬虫引擎核心逻辑。

## Problem Frame

用户无法有效监控扫描质量和性能趋势，历史管理是静态列表，难以快速定位特定扫描。具体：

- **进度显示** (R1-R4)：缺乏抓取速度、预估完成时间、失败分析，用户无法评估扫描状态和预期
- **历史管理** (R9-R14)：无搜索、过滤、排序能力，100+ 条历史扫描中难以查找特定任务
- **数据导出** (R15-R16)：无法导出扫描配置和元数据用于审计或重新运行

(see origin: docs/brainstorms/2026-04-20-crawler-ui-enhancements-requirements.md)

## Requirements Trace

**进度统计 (A1)**
- R1. 实时抓取速度（页/秒），每 1-2 秒更新
- R2. 基于速度预估剩余时间，精度 ±5%
- R3. 失败页面数和按原因分布（HTTP 错误、robots.txt、渲染失败等）
- R4. 累计字节数或资源发现计数（低成本增强，可选）
- R7. 卡片或网格布局展示清晰
- R8. 失败进度条可视化（红色/警告样式）

**历史管理 (B1-B3)**
- R9. 按域名或 URL 关键字搜索（模糊匹配，实时过滤）
- R10. 按状态过滤（成功、失败、部分失败）
- R11. 按资源发现数范围过滤
- R12. 过滤组合使用（同时有效）
- R13. 按创建时间、扫描耗时排序
- R14. 分页或虚拟滚动（支持 100+ 条）
- R15. 为每次扫描导出按钮，导出 JSON 配置
- R16. 导出内容：目标 URL、配置参数、扫描时间、页面列表、失败统计

**架构约束 (C1-C2)**
- R17. ProgressCoalescer 事件字典扩展（向后兼容）
- R18. 新字段可选，不破坏现有订阅
- R19. 存储层增强过滤和排序查询
- R20. 新增导出函数

## Scope Boundaries

**包含** (Phase 2.1 MVP)
- A1 动态性能指标（速度、ETA、失败数、失败分布）
- B 历史管理（搜索、过滤、排序、分页、导出）
- 单元测试覆盖

**不包含** (推迟到 Phase 2.2)
- R5-R6：详细事件日志（可选功能）
- 从历史扫描快速重新运行
- 进度通知（邮件、Slack）
- 爬虫引擎逻辑改动（仅呈现层）

## Context & Research

### Relevant Code and Patterns

**Streamlit UI 架构** (`app.py`)
- `render_progress()` (第 263-325 行)：当前仅显示 3 个指标（页数、URL、耗时）
- `render_history()` (第 159-220 + 590-630 行)：静态列表，按 created_at DESC 排序
- 会话状态管理：`st.session_state._progress_queue`、`scan_started_at`
- 自动刷新：`time.sleep(1) + st.rerun()`

**爬虫引擎** (`crawler/core/engine.py`)
- `_WorkerContext`：包含 `counters`（pages_done、resources_found、cache_hits/misses）和 `counters_lock`
- `ProgressCoalescer`：250ms 节流，发出事件字典 (pages_done, pages_total, current_url, status)
- `_emit_progress(ctx, url)`：在 robots.txt、HTTP 失败、解析成功时调用

**存储层** (`crawler/storage.py`)
- `list_scan_jobs(db_path)`：简单 SELECT，按 created_at DESC，无过滤
- `update_scan_job()`：更新 pages_scanned、resources_found（实时计数）
- `pages` 表：已有 `failure_reason` 字段，支持故障原因追踪
- 迁移模式：PRAGMA busy_timeout + BEGIN IMMEDIATE（race-safe）

**测试约定** (`tests/`)
- Fixture：`db_path` 临时数据库 + `init_db()`
- 类基础组织：`TestXxx` + pytest `parametrize`
- 现有覆盖：storage (511 行)、progress (未读取)、crawler 集成 (1280 行)

### Institutional Learnings

**Cover Selector v0.2.0** — 实时进度模式
- 会话 UUID 解耦 HTTP 请求/响应与后台处理
- 轮询 API：`/api/progress/{session_id}` 返回 `status|progress_pct|current_stage`
- Streamlit 可直接套用该模式（已有 `st.session_state` 管理）
- 状态机：`uploading → processing → completed|failed`

**爬虫 Phase 1 性能计划** (docs/plans/)
- R4：250ms 刷新窗口已在 ProgressCoalescer 实现 ✓
- R16：进度应包含页数 + 耗时 + 性能指标（当前仅 3 项）
- R17：failure_reason 已持久化，可在 UI 聚合为分布

### External References

- Streamlit 文档：`st.columns`, `st.metric`, `st.bar_chart` — 内置卡片布局和图表
- SQLite 优化：GROUP_CONCAT 单查询多表关联（避免 N+1）
- Python 标准库：time.monotonic() 用于精确计时

## Key Technical Decisions

1. **进度指标在引擎中计算，而非 UI 层**
   - 决策：WriterThread（或 ProgressCoalescer 发出时）计算速度和 ETA
   - 理由：单一数据源，避免 UI 层重复统计；引擎知道真实速度；cover-selector 经验验证该模式
   - 实施：记录 `(pages_done_at_t0, epoch_t0)` 快照，每次事件发出计算 delta

2. **历史查询使用单 SQL 语句 + 组合过滤**
   - 决策：扩展 `storage.py` 新增 `list_scan_jobs_filtered()` 函数，支持 domain/status/resource_range/sort_by
   - 理由：性能 <100ms（SQLite <1K 记录），避免应用层过滤的 N+1
   - 实施：WHERE 1=1 + 动态 AND 条件 + ORDER BY + LIMIT

3. **向后兼容扩展 ProgressCoalescer 事件字典**
   - 决策：新字段可选，不破坏现有订阅；UI 用 `.get()` 处理缺失
   - 理由：R18 要求；已有代码（如 render_failed_pages）仅读特定字段
   - 实施：`ProgressCoalescer` 发出时包含新字段，不影响订阅者

4. **导出格式为 JSON，而非 CSV**
   - 决策：export_scan_job_metadata() 返回嵌套 dict，序列化为 JSON
   - 理由：保留结构化信息（配置参数），便于未来重新导入或重新运行
   - 实施：包含 metadata + config + pages 三层结构

## Open Questions

### Resolved During Planning

- **MVP 范围**：确认 A1 + B 为 Phase 2.1，R5-R6 推迟到 Phase 2.2 ✓
- **性能目标**：进度 UI <100ms 渲染，历史查询 <100ms ✓
- **事件日志必要性**：R5-R6 标记为可选，初版不实现 ✓

### Deferred to Implementation

- **UI 动画/过渡**：Streamlit 本身支持有限，可后续用 CSS/JavaScript 增强
- **实时图表更新**：Streamlit 缓存机制，具体刷新策略实施时确定
- **分页分界点**：100+ 条历史时是用虚拟滚动还是分页，实施时测试决定

## High-Level Technical Design

> *此图示展示整体方案架构，是方向指导而非实现规范。实施者应将其作为上下文参考，而非逐字复制。*

### 数据流（进度指标）

```
Worker 处理 URL (fetch/parse)
  └─ 计数器增加：pages_done++, resources_found+=N
  └─ _emit_progress(ctx, url)
       └─ [计算] speed_pps = pages_done / (time.time() - start_time)
       └─ [计算] eta_seconds = (pages_total - pages_done) / max(speed_pps, 0.1)
       └─ [汇总] failure_reasons = {reason: count, ...}
       └─ Coalescer 发出完整事件
            └─ Streamlit render_progress() 读取 + UI 展示
```

### 数据流（历史查询）

```
UI 过滤控件（sidebar）
  └─ domain_filter, status_filter, resource_range, sort_by
  └─ list_scan_jobs_filtered(db, filters...) [单 SQL]
       └─ SQLite WHERE + ORDER BY + LIMIT
       └─ 返回 list[ScanJob]
  └─ st.dataframe() 展示
  └─ [导出] export_scan_job_metadata(db, job_id)
       └─ SELECT * FROM pages WHERE scan_job_id=?
       └─ 返回 JSON {metadata, config, pages}
```

## Implementation Units

### Unit 1: 扩展 ProgressCoalescer 事件字典 + 引擎中计算速度/ETA

**目标**：支持 R1、R2、R3 的动态性能指标计算

**需求**：R1, R2, R3, R17, R18

**依赖**：无

**文件**：
- Modify: `crawler/core/progress.py` (ProgressCoalescer 类)
- Modify: `crawler/core/engine.py` (_emit_progress 函数、_Counters 类)
- Modify: `crawler/models.py` (ScanJob 数据类，如需扩展)
- Test: `tests/test_progress.py`

**方案**：

1. **ProgressCoalescer 事件字典扩展**（向后兼容）
   - 新增可选字段：`fetch_speed_pps`（浮点，页/秒）、`eta_seconds`（整数）、`failed_count`（整数）、`failure_reasons`（dict）
   - 保留原有字段：pages_done、pages_total、current_url、status
   - 发出时用 dict.update()，不影响现有订阅者

2. **引擎中计算速度/ETA**
   - 在 `_WorkerContext` 中添加 `scan_start_time: float`（time.monotonic()）
   - 在 `_emit_progress()` 中计算：
     - speed_pps = `pages_done / (now - scan_start_time)` 取最近 10 秒平滑（避免抖动）
     - eta_seconds = `(pages_total - pages_done) / max(speed, 0.1)`
   - 采集失败原因分布：从 WriterThread 统计 failure_reason，定期推送

3. **失败原因汇总**
   - WriterThread 维护 `failure_reasons: dict[str, int]`，每插入 page 时更新
   - _emit_progress() 发出时序列化为事件字典
   - 支持的原因：http_error、robots_txt、render_timeout、parse_error、unknown

**模式参考**：
- 计时：`crawler/core/progress.py` 已有 `time.perf_counter()` 示例
- 计数器管理：`_WorkerContext._Counters` 现有锁保护机制

**测试场景**：
- Happy path：速度计算正确性（pages_done=100, elapsed=30s → speed≈3.33 p/s）
- Edge case：初始速度为 0（pages_done < 2 时）、高速爬虫（>10 p/s）、极低速（<0.1 p/s）
- Error path：failure_reason 聚合准确（5 个不同原因的页面正确计数）
- Integration：速度/ETA 变化不中断进度流（ProgressCoalescer 继续节流）

**验证**：
- 进度事件包含完整的 6 个指标（pages_done, pages_total, speed_pps, eta_seconds, failed_count, failure_reasons）
- 与 kissavs 实时扫描对标，ETA 精度 ±5% 内
- 无新的竞态条件（counters_lock 保护一致性）

---

### Unit 2: 增强 storage.py 的过滤、排序和导出能力

**目标**：支持 R9-R14、R19-R20 的历史查询和导出

**需求**：R9, R10, R11, R12, R13, R14, R15, R16, R19, R20

**依赖**：Unit 1 完成（为了知道进度数据结构，虽然不硬依赖）

**文件**：
- Modify: `crawler/storage.py` (新增函数)
- Test: `tests/test_storage.py`

**方案**：

1. **list_scan_jobs_filtered() 函数**
   ```python
   def list_scan_jobs_filtered(
       db_path: str,
       domain_filter: str | None = None,
       status_filter: str | None = None,
       resource_range: tuple[int, int] | None = None,
       sort_by: str = "created_at",
       reverse: bool = True,
       limit: int = 100,
   ) -> list[ScanJob]:
   ```
   - 单 SQL 查询，WHERE 动态拼接（domain LIKE、status =、resources BETWEEN）
   - ORDER BY 支持 created_at、duration（完成时间 - 创建时间）、resources_found
   - LIMIT 支持分页（默认 100）
   - 返回 list[ScanJob]

2. **export_scan_job_metadata() 函数**
   ```python
   def export_scan_job_metadata(db_path: str, scan_job_id: int) -> dict:
   ```
   - 返回 JSON 结构：{metadata: {job fields}, config: {max_pages, max_depth}, pages: [{url, status, failure_reason}]}
   - 支持 Streamlit 下载（st.download_button）

3. **查询优化**
   - 避免 N+1：pages 表查询一次（SELECT url, status, failure_reason WHERE scan_job_id=?）
   - 索引假设：scan_job_id 已有索引（现有 storage.py 可能已创建）
   - 性能目标：<100ms for 1K 扫描历史

**模式参考**：
- 现有 list_scan_jobs()：简单 SELECT，可用作扩展基础
- 现有 delete_scan_job()：动态 WHERE + BEGIN IMMEDIATE 模式
- 现有 get_connection()：连接管理和 row_factory 设置

**测试场景**：
- Happy path：各种 filter 单独测试 + 组合测试（domain + status + resource_range）
- Edge case：空过滤结果、limit=1、reverse=False、sort_by 不存在
- Ordering：created_at DESC、duration DESC、resources DESC 准确性
- Export：导出 JSON 可解析、包含所有字段、pages 列表完整

**验证**：
- 过滤查询 <100ms（500+ 条记录）
- 导出 JSON 结构合法（schema 验证）
- 无 SQL 注入（使用参数化查询）

---

### Unit 3: UI 进度屏幕重构（卡片布局 + 失败分布可视化）

**目标**：支持 R1-R4、R7-R8 的进度展示重设计

**需求**：R1, R2, R3, R4, R7, R8

**依赖**：Unit 1 完成（新增的进度事件字段）

**文件**：
- Modify: `app.py` (render_progress 函数，第 263-325 行)
- Test: `tests/test_crawler.py` (集成测试)

**方案**：

1. **卡片布局替代简单 3 列**
   - 上排：4 个 metric 卡片（Pages Scanned、Speed、ETA、Failed）
   - 中排：失败分布条形图（failure_reasons dict → st.bar_chart）
   - 下排：进度条 + 当前 URL

2. **动态指标展示**
   ```python
   col1, col2, col3, col4 = st.columns(4)
   col1.metric("Pages Scanned", progress.get("pages_done", 0))
   col2.metric("Speed (p/s)", f"{progress.get('fetch_speed_pps', 0):.2f}")
   col3.metric("ETA (s)", int(progress.get("eta_seconds", 0)))
   col4.metric("Failed", progress.get("failed_count", 0))
   ```

3. **失败分布可视化**
   - 如果 failure_reasons 非空，用 st.bar_chart(failure_reasons) 展示
   - 自动按原因降序排列

4. **进度条样式**
   - 若 failed_count > 0 或 speed 很低，用 st.warning 提示
   - 进度条仍用 st.progress，但可用 Streamlit 的 delta 表示变化（可选）

**模式参考**：
- 现有 render_progress()：progress_queue 读取逻辑、update 频率（1 秒）
- Streamlit API：st.metric、st.columns、st.bar_chart、st.progress 组合

**测试场景**：
- Happy path：进度值完整更新，卡片无异常显示
- Edge case：speed_pps = 0、eta_seconds = 0、failure_reasons = {}（空时不显示图表）
- Rendering：同时 6+ 指标，无重叠或布局错位
- Real-time：1 秒刷新周期，数值平滑变化（非抖动）

**验证**：
- UI 展示 ≥6 个动态指标（pages_done, pages_total, speed_pps, eta_seconds, failed_count, failure_reasons）
- 进度屏幕布局美观、对齐，符合 Streamlit 设计语言
- 无性能滞后（render <500ms）

---

### Unit 4: UI 历史管理增强（搜索、过滤、排序、分页）

**目标**：支持 R9-R14 的历史扫描查询和导航

**需求**：R9, R10, R11, R12, R13, R14

**依赖**：Unit 2 完成（list_scan_jobs_filtered）

**文件**：
- Modify: `app.py` (render_history 函数，第 159-220 + 590-630 行)
- Test: `tests/test_crawler.py` (集成测试)

**方案**：

1. **过滤控件**（sidebar 或主区域）
   - 搜索框：domain/url 关键字（text_input，实时）
   - 状态选择框：All | success | failed | partial
   - 资源范围：min/max slider 或 number_input
   - 排序单选：created_at | duration | resources（radio，水平排列）

2. **查询和展示**
   ```python
   jobs = storage.list_scan_jobs_filtered(
       db_path,
       domain_filter=search if search else None,
       status_filter=None if status == "All" else status,
       resource_range=(res_min, res_max) if res_min or res_max else None,
       sort_by=sort_by,
       reverse=True,
       limit=100,
   )
   
   data = [{"ID": j.id, "Domain": j.domain, "Status": j.status, ...} for j in jobs]
   st.dataframe(data, use_container_width=True)
   ```

3. **行级操作**
   - "Load" 按钮：加载该扫描结果（跳转到 results tab，select_job_id 更新）
   - "Delete" 按钮：删除扫描（再次确认）
   - "Export" 按钮：下载 JSON（Unit 5）

4. **分页（简化版）**
   - 当结果 >100 时显示 pagination 控件
   - 或用 Streamlit Pagination Extension（如可用）
   - 首版可用 session_state offset 管理

**模式参考**：
- 现有 render_history()：storage.list_scan_jobs() 调用、delete 确认逻辑
- Streamlit API：st.text_input、st.selectbox、st.radio、st.dataframe、st.button

**测试场景**：
- Happy path：各过滤条件应用成功，结果正确
- Edge case：无结果（显示"未找到"提示）、所有过滤同时为空（显示所有最近 100）
- Filtering：domain_filter 模糊匹配工作、status 精确匹配、resource_range BETWEEN
- Sorting：按创建时间 DESC（最新优先）、按耗时 DESC、按资源数 DESC
- Pagination：offset/limit 正确应用

**验证**：
- 用户能在 100+ 条历史中 <100ms 内找到特定扫描
- 过滤 + 排序组合运行无误
- UI 布局清晰，操作直观

---

### Unit 5: 导出功能实现和集成

**目标**：支持 R15-R16 的扫描元数据导出

**需求**：R15, R16, R20

**依赖**：Unit 2 完成（export_scan_job_metadata）、Unit 4 完成（按钮集成）

**文件**：
- Modify: `app.py` (render_history 中集成 st.download_button)
- Modify: `crawler/storage.py` (export_scan_job_metadata 已在 Unit 2，此处集成和测试)
- Test: `tests/test_storage.py`

**方案**：

1. **export_scan_job_metadata() 已在 Unit 2 实现**
   - 此单元重点是 UI 集成和验证

2. **Streamlit 下载按钮**
   ```python
   for job in jobs:
       col1, col2, col3 = st.columns([1, 3, 0.5])
       with col3:
           if st.button("Export", key=f"export_{job.id}"):
               metadata = storage.export_scan_job_metadata(db_path, job.id)
               json_str = json.dumps(metadata, indent=2, ensure_ascii=False)
               st.download_button(
                   label="Download JSON",
                   data=json_str,
                   file_name=f"scan_{job.id}_{job.domain}_{job.created_at[:10]}.json",
                   mime="application/json",
               )
   ```

3. **导出内容验证**
   - metadata：扫描 ID、entry_url、domain、status、created_at、completed_at、pages_scanned、resources_found
   - config：max_pages、max_depth
   - pages：url、status、failure_reason 列表

4. **文件命名规约**
   - `scan_{job_id}_{domain}_{date}.json`
   - 防止中文文件名问题：确保 ensure_ascii=False

**模式参考**：
- Streamlit API：st.download_button、json.dumps
- JSON 格式：平铺结构，便于后续处理

**测试场景**：
- Happy path：导出成功，JSON 可解析，包含所有字段
- Edge case：空 pages 列表（仍能导出）、resources_found=0（metadata 正确）
- File naming：文件名无特殊字符、中文支持
- Data integrity：导出的 JSON 可重新加载为 dict

**验证**：
- 导出 JSON 结构有效（schema 验证或 json.loads 测试）
- 文件可正常下载
- 导出完整性：metadata + config + pages 全部包含

---

## System-Wide Impact

**交互图**：
- `render_progress()` 读取 ProgressCoalescer 事件 → 依赖 Unit 1 新字段
- `render_history()` 调用 `list_scan_jobs_filtered()` → 依赖 Unit 2
- 导出按钮调用 `export_scan_job_metadata()` → 依赖 Unit 2、Unit 5
- WriterThread 写 failure_reason → Unit 1 依赖该字段汇总

**不变的不变量**：
- WriterThread 单一序列化者（不变）
- ProgressCoalescer 250ms 节流（不变，但事件字典扩展）
- 爬虫引擎核心逻辑（不变，仅在 _emit_progress 添加计算）
- 现有导出（CSV/JSON in render_rankings）继续可用

**错误传播**：
- 进度计算错误（divide-by-zero）：已用 max(speed, 0.1) 防止
- 查询过滤错误：使用参数化 SQL 防止注入，sqlite3 异常捕获
- 导出 I/O 错误：Streamlit 下载按钮内置错误处理

**并发与缓存**：
- ProgressCoalescer 已有 Lock 保护，新字段遵循现有机制
- 历史查询在 WriterThread 之外（读操作），无竞态
- Streamlit session_state 缓存，过滤条件更新时强制重查

---

## Risks & Dependencies

| 风险 | 缓解 |
|------|------|
| 进度计算精度 ±5% 无法达成 | ETA 基于历史速度平滑窗口（10 秒），若波动大则预留宽容范围 |
| 历史查询 >100ms（1K+ 记录） | SQLite PRAGMA optimize 或业务期望调整为 500 条记录 |
| Streamlit st.rerun() 频率过高导致卡顿 | 保持 1 秒刷新周期，或用 streamlit>=1.31 的 `fragment` 优化 |
| 中文字符在导出文件名中乱码 | ensure_ascii=False + 测试，或用 url-encode 避免 |
| failure_reasons 字典键不统一（重复或拼写错） | 在 WriterThread 中定义常量或 enum，normalize 输入 |

---

## Documentation / Operational Notes

- **用户指南**：更新爬虫文档说明新增的性能指标含义（速度、ETA、失败分布）
- **API 变更**：ProgressCoalescer 事件字典新增可选字段，向后兼容，文档化
- **测试文档**：补充单元测试说明（如何验证速度精度、过滤准确性）
- **监控**：进度 UI 渲染时间（<500ms）、历史查询时间（<100ms）

---

## Sources & References

- **Origin document**: [docs/brainstorms/2026-04-20-crawler-ui-enhancements-requirements.md](../../brainstorms/2026-04-20-crawler-ui-enhancements-requirements.md)
- **Related code**: 
  - app.py (Streamlit UI)
  - crawler/core/progress.py (ProgressCoalescer)
  - crawler/core/engine.py (worker context)
  - crawler/storage.py (CRUD)
- **Related documents**: 
  - docs/plans/2026-04-17-002-refactor-crawler-performance-scaling-plan.md (Phase 1 性能计划)
- **Institutional pattern**: Cover Selector v0.2.0 会话管理模式（docs/solutions/）
- **External docs**: Streamlit API (st.metric, st.columns, st.bar_chart, st.download_button)
