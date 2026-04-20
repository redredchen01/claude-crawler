---
title: "feat: Claude Crawler UI 增强 — 实时进度统计 & 历史管理"
type: feat
status: active
date: 2026-04-20
origin: docs/brainstorms/2026-04-20-crawler-ui-enhancements-requirements.md
---

# Claude Crawler UI 增强：实时进度统计 & 历史管理

## 概览

增强 Claude Crawler 的 Streamlit UI，为用户提供更详细的扫描进度监控和灵活的历史扫描管理。MVP 包含两个并行的功能群：

**A. 实时进度统计增强** — 显示性能指标（抓取速度、预估剩余时间、失败统计），帮助用户理解扫描质量和性能趋势

**B. 历史扫描管理增强** — 支持搜索、过滤、排序，让用户快速定位特定扫描记录

## 问题框架

当前 Streamlit UI 的进度显示和历史扫描管理功能基础但不充分：
- 进度显示仅有 3 个指标（页数、总数、经过时间），缺乏运行时性能洞察
- 历史列表是静态表格，无搜索、过滤或排序，难以管理多个扫描记录

## 需求追踪

**来自需求文档的核心需求：**
- R1-R4: 动态性能指标（速度、预估时间、失败分布、资源计数）
- R7-R8: 视觉改进（卡片布局、失败进度条）
- R9-R14: 搜索、过滤、排序、分页
- R15-R16: 数据导出（扫描配置 + 元数据 JSON）
- R17-R20: 架构需求（进度流数据扩展、存储层查询增强）

## 范围边界

**不包含：**
- 事件日志（R5-R6）推迟到 Phase 2
- 远程日志持久化或分布式进度流
- 从历史扫描快速重新发起功能
- 进度通知（邮件、Slack）
- 爬虫引擎逻辑修改（仅在呈现层增强）

## 关键技术决策

1. **进度数据流扩展** — 通过 `ProgressCoalescer` 事件 dict 扩展（向后兼容），在 `engine.py` 发送点计算新指标，而非独立数据收集
2. **失败计数来源** — 从 DB 查询 `SELECT COUNT(*) FROM pages WHERE scan_job_id=? AND status='failed'`，保持架构一致性
3. **历史列表分页** — SQL `LIMIT+OFFSET` + session state 驱动分页状态（保持 Streamlit 无状态原则）
4. **搜索/过滤** — WHERE 子句组合（domain + status + resource_range），在 session state 存储过滤条件
5. **导出格式** — JSON（便于后续处理），包含扫描配置 + 元数据的一级内容

## 实现单元

### Unit A1: 存储层扩展 — 统计查询函数

**目标：** 为存储层添加支持性能统计和历史过滤的新查询函数

**需求：** R17-R20

**依赖：** 无

**文件：**
- 修改：`crawler/storage.py`
- 修改：`crawler/models.py`（新增 `ScanJobStats` dataclass）
- 测试：`tests/test_storage.py`

**方法：**

1. **新增 `ScanJobStats` dataclass** (models.py):
   - 字段：`scan_job_id`, `pages_success`, `pages_failed`, `failed_reasons_dict`, `resources_avg_per_page`
   - 用于统计聚合查询返回

2. **新增存储查询函数** (storage.py):
   - `get_scan_job_stats(db_path: str, scan_job_id: int) -> ScanJobStats | None`
     - 查询页面状态分布（成功/失败），失败原因分布，平均资源数
     - SQL：多个 COUNT(CASE WHEN...) + AVG(resource_count) in one query
   
   - `list_scan_jobs_filtered(db_path: str, domain_filter: str | None = None, status_filter: str | None = None, resource_min: int | None = None, resource_max: int | None = None, sort_by: str = "created_at", limit: int | None = None, offset: int = 0) -> [ScanJob]`
     - 支持组合过滤和分页
     - SQL WHERE 子句动态拼接（用参数化查询）
     - 排序：created_at, pages_scanned, resources_found
   
   - `export_scan_job_metadata(db_path: str, scan_job_id: int) -> dict`
     - 返回 JSON 友好的字典：{scan_job: {...}, pages: [...], stats: {...}}
     - 供下载功能使用

3. **保持现有模式**：
   - 使用 `with get_connection(db_path)` 上下文管理
   - 所有 SQL 用参数化查询
   - 返回类型用 dataclass

**模式参考：** 
- 参考现有 `list_scan_jobs()` (storage.py:235-244)
- 参考现有 `get_scan_job_stats()` SQL 聚合模式（如存在）

**测试场景：**
- 统计查询：job 有混合状态页面，验证失败计数和原因分布
- 过滤组合：domain + status + resource_range 同时生效，验证 WHERE 子句正确
- 分页：100+ 记录，验证 LIMIT+OFFSET 边界（第一页、最后一页、越界）
- 排序：按 created_at/pages_scanned 排序，验证顺序
- 导出：验证返回字典结构完整，包含所有必要字段

**验证：**
- 新查询通过单元测试，覆盖快乐路径、边界、错误路径
- 导出字典可序列化为 JSON 无错误
- 参数化查询防止 SQL injection（验证特殊字符处理）

---

### Unit A2: 进度事件扩展 — 性能指标计算和发送

**目标：** 在爬虫引擎中计算性能指标（速度、预估时间、失败数），通过 ProgressCoalescer 事件发送到 UI

**需求：** R1-R4, R17-R18

**依赖：** Unit A1（需要 `get_scan_job_stats()` 函数）

**文件：**
- 修改：`crawler/core/engine.py`（计算和发送逻辑）
- 修改：`crawler/core/progress.py`（可选，如果需要验证事件结构）
- 测试：`tests/test_progress.py`

**方法：**

1. **扩展 `ProgressCoalescer.emit()` 事件 dict** (progress.py):
   - 新增可选字段（向后兼容）：
     ```python
     {
       "pages_done": int,
       "pages_total": int,
       "current_url": str,
       "status": str,
       "warning": str | None,
       
       # 新增字段（可选）
       "failed_count": int,  # 失败页面数
       "speed_pages_per_sec": float,  # 实时速度
       "estimated_seconds_remaining": int,  # 预估秒数
     }
     ```
   - 注释：所有新字段可选，UI 用 `.get(key, default)` 读取

2. **在 engine.py `_emit_progress()` 中计算指标**:
   - 计算失败页面数：`SELECT COUNT(*) FROM pages WHERE scan_job_id=? AND status='failed'` 或维护计数器
   - 计算速度：`pages_done / (current_time - start_time)` 页面/秒
   - 计算预估时间：`(pages_total - pages_done) / speed_pages_per_sec`
   - 处理边界：速度为 0 时预估 = None，pages_done = 0 时速度设 0
   - 发送间隔：利用 ProgressCoalescer 的节流（已有，无需修改）

3. **发送点 (engine.py:274 行左右)**:
   ```python
   def _emit_progress(ctx, current_url):
       stats = get_scan_job_stats(ctx.db_path, ctx.scan_job_id)
       elapsed = time.time() - ctx.start_time
       speed = ctx.counters.pages_done / max(elapsed, 0.1)
       eta = (ctx.counters.pages_total - ctx.counters.pages_done) / max(speed, 0.001)
       
       ctx.coalescer.emit({
           "pages_done": ctx.counters.pages_done,
           "pages_total": ctx.counters.pages_total,
           "current_url": current_url,
           "status": "running",
           "failed_count": stats.pages_failed if stats else 0,
           "speed_pages_per_sec": speed,
           "estimated_seconds_remaining": int(eta),
       })
   ```

4. **保持 ProgressCoalescer 无状态**：
   - 事件合并逻辑不变
   - 新字段仅作为信息传递，不影响线程安全

**模式参考：**
- 参考现有 `_Counters` 和 `counters_lock` 使用（engine.py:119-125）
- 参考现有 `_emit_progress()` 发送点（engine.py:127-134）
- 参考现有 `time.time()` 使用（app.py:291）

**测试场景：**
- 速度计算：100 页，10 秒，验证速度 = 10 pages/sec
- 预估时间：100 页总，30 页完成，速度 3 pages/sec，预估剩余 = 70/3 ≈ 23 秒
- 失败计数：20 页失败，验证事件包含 `failed_count: 20`
- 边界：0 页完成时速度 = 0，预估 = None（或无穷大，取决于实现）
- 线程安全：多线程发送事件，验证计算无竞态条件

**验证：**
- 事件中新字段出现无异常，值合理（非 NaN、非负数）
- 速度和预估随扫描进度平滑变化
- 后向兼容：缺少新字段的旧代码仍能运行

---

### Unit A3: 进度 UI 增强 — 显示性能指标面板

**目标：** 扩展 `render_progress()` 函数，显示详细的性能指标面板（速度、预估时间、失败统计）

**需求：** R1-R4, R7-R8

**依赖：** Unit A2（需要进度事件包含新指标）

**文件：**
- 修改：`app.py`（render_progress() 函数）
- 新建：可选的辅助函数 `_format_duration()`, `_render_performance_panel()`
- 测试：`tests/test_app_helpers.py`

**方法：**

1. **重构 `render_progress()` 函数**：
   - 保持现有的基础流程（队列读取、状态转移）
   - 添加"性能指标面板"section，展示新指标

2. **新增函数 `_render_performance_panel(progress: dict)**：
   - 读取 progress dict 中的新字段
   - 使用 `st.metric()` 或 `st.columns()` 布局显示：
     - 抓取速度（pages/sec）
     - 预估剩余时间（分:秒格式）
     - 已失败页面数
     - 失败原因分布（可选，饼图或文本统计）
   - 布局：6 列网格或 2x3 卡片，保持现有风格

3. **视觉改进**：
   - 失败进度条：`st.progress()` 加红色样式或条件颜色
   - 预估时间警告：超过 1 小时时显示警告（可选）
   - 数字格式化：速度 2 位小数，时间 M:SS 格式

4. **保持现有模式**：
   - Session state 驱动（无新增状态需求）
   - 自动刷新间隔 1 秒（无变更）
   - 状态流转逻辑保持不变

**模式参考：**
- 参考现有 `st.columns()` 和 `st.metric()` 使用（app.py:294-300）
- 参考现有 `st.progress()` 使用（app.py:302）
- 参考现有 `_format_*()` 辅助函数（如存在）

**测试场景：**
- 指标显示：传入模拟 progress dict（含所有新字段），验证 st.metric 被正确调用
- 格式化：速度 10.345 → "10.35 pages/sec"，时间 125 秒 → "2:05"
- 缺失字段处理：progress dict 缺失新字段，验证 UI 不崩溃（用 `.get()` 默认值）
- 状态流转：从 running → completed，验证进度条和指标消失

**验证：**
- UI 屏幕显示清晰、数字合理
- 无 Streamlit 异常或渲染问题
- 所有指标随进度动态更新

---

### Unit B1: 存储层过滤支持 — 已在 Unit A1 中完成

**参考 Unit A1** 中的 `list_scan_jobs_filtered()` 函数实现

---

### Unit B2: 历史 UI 增强 — 搜索、过滤、排序、分页

**目标：** 扩展 `render_history()` 函数，添加搜索框、过滤控件、排序选项、分页导航

**需求：** R9-R14

**依赖：** Unit A1（需要 `list_scan_jobs_filtered()` 函数）

**文件：**
- 修改：`app.py`（render_history() 函数）
- 新建：辅助函数 `_render_history_filters()`, `_render_history_table()`, `_render_pagination()`
- 修改：`app.py` main() 中的 session state 初始化（新增过滤、分页状态）
- 测试：`tests/test_app_helpers.py`

**方法：**

1. **扩展 session state 初始化** (main() 函数):
   ```python
   if "history_search" not in st.session_state:
       st.session_state.history_search = ""
   if "history_status_filter" not in st.session_state:
       st.session_state.history_status_filter = None
   if "history_resource_range" not in st.session_state:
       st.session_state.history_resource_range = (0, 10000)
   if "history_sort_by" not in st.session_state:
       st.session_state.history_sort_by = "created_at"
   if "history_page" not in st.session_state:
       st.session_state.history_page = 0
   ```

2. **新增函数 `_render_history_filters()**：
   - 搜索框：`st.text_input("搜索域名/URL")` → 模糊匹配
   - 状态过滤：`st.selectbox("状态", [None, "completed", "failed", "partial"])` → SQL WHERE
   - 资源范围：`st.slider("资源范围", 0, 1000, (0, 1000))` → SQL WHERE range
   - 排序：`st.selectbox("排序", ["created_at_desc", "created_at_asc", "pages_scanned_desc"])`
   - 应用按钮：`st.button("应用过滤")` → 更新 session state 并重置页码

3. **新增函数 `_render_history_table()**：
   - 调用 `storage.list_scan_jobs_filtered(domain_filter, status_filter, resource_range, sort_by, limit=50, offset=page*50)`
   - 返回 `[ScanJob]` 加上总行数（需要额外查询或窗口函数）
   - 渲染 `st.dataframe()` 或 `st.columns()` 表格（保持现有风格）
   - 每行添加"下载"按钮（触发导出）

4. **新增函数 `_render_pagination()**：
   - 显示"第 X 页，共 Y 页"
   - "上一页" / "下一页" 按钮驱动 `st.session_state.history_page`
   - 点击时调用 `st.rerun()`

5. **集成到 `render_history()`**：
   ```python
   def render_history(db_path: str):
       _render_history_filters()
       total_count = storage.count_scan_jobs_filtered(...)  # 新增计数函数
       _render_history_table(db_path, total_count)
       _render_pagination(total_count)
   ```

6. **导出功能**：
   - 每行添加"下载"按钮（`st.download_button()`）
   - 调用 `storage.export_scan_job_metadata(db_path, job_id)` 获取 JSON
   - 提示用户下载文件名：`scan_<domain>_<date>.json`

**模式参考：**
- 参考现有 `st.text_input()`, `st.selectbox()`, `st.slider()` 使用
- 参考现有 `st.dataframe()` 表格渲染
- 参考现有 `st.button()` 和 session state 交互（app.py:591-596）
- 参考现有 `st.download_button()` 如存在，否则用 `st.write()` 打印 JSON

**测试场景：**
- 搜索：输入 "example.com"，验证表格仅显示匹配域名的记录
- 过滤组合：状态=completed + 资源 50-200，验证 SQL 正确
- 分页：50 条/页，总 150 条，第 1 页显示 50 条，第 2 页显示 50 条，第 3 页显示 50 条
- 排序：按 created_at 降序，验证时间从新到旧
- 下载：点击下载按钮，验证 JSON 文件可下载
- 缺失数据：无匹配结果时，显示"无结果"

**验证：**
- UI 操作流畅，无 Streamlit 异常
- 过滤条件组合生效
- 分页导航正确
- 导出文件格式有效

---

### Unit B3: 存储层辅助函数

**目标：** 添加支持历史 UI 的辅助查询函数

**需求：** R9-R14

**依赖：** Unit A1

**文件：**
- 修改：`crawler/storage.py`

**方法：**

1. **新增 `count_scan_jobs_filtered(db_path, domain_filter, status_filter, resource_min, resource_max) -> int`**：
   - 返回过滤后的总记录数（用于分页）
   - SQL：`SELECT COUNT(*) FROM scan_jobs WHERE ...`

2. **已在 Unit A1 中定义的函数**：
   - `list_scan_jobs_filtered()` — 分页查询
   - `export_scan_job_metadata()` — 导出 JSON

**模式参考：**
- 参考现有 `get_connection()` 使用

**验证：**
- 计数精确（与列表行数一致）

---

### Unit C: 测试套件

**目标：** 为新增功能添加单元测试和集成测试

**需求：** 所有需求

**依赖：** Units A1-B3

**文件：**
- 修改：`tests/test_storage.py`（新增 SQL 查询测试）
- 修改：`tests/test_app_helpers.py`（新增 UI 渲染测试）
- 修改：`tests/test_progress.py`（新增进度事件扩展测试）

**方法：**

1. **test_storage.py — 新增测试用例**：
   - `test_get_scan_job_stats_success()` — 统计查询返回正确值
   - `test_list_scan_jobs_filtered_by_domain()` — 域名过滤有效
   - `test_list_scan_jobs_filtered_combined()` — 组合过滤（domain + status + resource）
   - `test_list_scan_jobs_filtered_pagination()` — 分页正确（LIMIT+OFFSET）
   - `test_count_scan_jobs_filtered()` — 计数精确
   - `test_export_scan_job_metadata_structure()` — 导出 JSON 结构有效

2. **test_app_helpers.py — 新增 UI 测试**：
   - `test_render_performance_panel_with_stats()` — mocked st.metric 验证
   - `test_render_performance_panel_missing_fields()` — 缺失字段不崩溃
   - `test_render_history_filters_search()` — 搜索框交互
   - `test_render_history_pagination()` — 分页导航
   - `test_render_history_download_button()` — 下载功能

3. **test_progress.py — 扩展测试**：
   - `test_progress_coalescer_new_fields()` — 新事件字段正确合并
   - `test_progress_calculation_speed()` — 速度计算正确
   - `test_progress_calculation_eta()` — ETA 计算正确

**模式参考：**
- 参考现有 `test_storage.py` 中的 fixture (临时 DB)
- 参考现有 `test_app_helpers.py` 中的 mocked st
- 参考现有 `test_progress.py` 中的线程测试

**验证：**
- 所有新测试通过
- 现有测试不破坏

---

## 系统范围影响

**交互图：**
- `app.py` → `storage.py`: 调用新增的查询函数和导出函数
- `core/engine.py` → `storage.py`: 查询失败统计（用于计算进度指标）
- `core/engine.py` → `core/progress.py`: emit 新增字段到进度事件
- `core/progress.py` → `app.py` session state: 接收新增字段并渲染

**错误传播：**
- 存储查询失败 → engine 进度计算失败 → 进度事件不含新字段 → UI 回退到默认值（无异常）
- 搜索输入无效 → storage 查询返回空列表 → UI 显示"无结果"

**状态生命周期：**
- Session state 新增字段：history_search, history_status_filter, history_resource_range, history_sort_by, history_page
- 生命周期：session 开始 → 初始化为默认 → 用户交互更新 → UI 重新渲染 → session 结束清空

**不变量：**
- ProgressCoalescer 线程安全（无新增线程或锁）
- ScanJob 数据结构向后兼容（仅新增查询函数，不修改 dataclass）
- DB schema 不变（使用现有列，无迁移）

## 风险与依赖

| 风险 | 缓解 |
|------|------|
| SQL 注入（搜索输入） | 使用参数化查询（已验证现有模式） |
| 大数据集性能（100+ 扫描） | 分页限制（50 条/页）+ 索引（created_at 已有） |
| 进度指标计算错误（ETA 为负） | 边界检查（speed=0 时预估=None，pages_done=0 时速度=0） |
| Streamlit 状态同步（多标签） | session state 管理已有，遵循现有模式 |
| 缓存不一致（导出数据陈旧） | 每次导出时查询最新数据，无长期缓存 |

## 开放问题

### 规划时已解决

- [决策] 事件日志优先级：推迟到 Phase 2 ✓

### 实现时待确认

- [技术] 失败页面计数方式：DB 查询 vs. 维护内存计数器（推荐 DB 查询，保持架构一致）
- [技术] ETA 为 0 或负数时如何显示（推荐显示"已完成"或省略）
- [技术] 导出文件名中特殊字符处理（推荐 URL 编码或替换为下划线）

## 后续步骤

→ `/ce:work` 按 Units 顺序执行实现（A1 → A2 → A3 → B1-B3 → C）
