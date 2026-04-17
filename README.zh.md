# Claude Crawler

高性能网站爬虫，具有结构化数据优先提取、HTTP 响应缓存和智能标签分析。使用 Python 构建，支持并发爬取、SSRF 防护和 Streamlit 交互式界面。

**核心特性：**
- 🚀 **并发爬虫** — BFS 前沿队列，支持可配置的工作线程和域级速率限制
- 🏗️ **结构化优先提取** — JSON-LD → OpenGraph → Twitter Card → 微数据 → DOM 降级
- 💾 **HTTP 缓存** — ETag + Last-Modified 条件请求（支持 304 Not Modified）
- 🔒 **安全防护** — SSRF 防护、私有主机检测、可配置重定向限制
- 📊 **标签分析** — 抽取并排名爬取页面中的热门资源标签
- 🎨 **交互式界面** — Streamlit 仪表板监控扫描和探索结果
- ✅ **充分测试** — 606 个测试覆盖爬虫、解析、缓存和 API 逻辑

## 快速开始

### 安装

```bash
pip install -e .
```

### CLI 使用

```bash
# 启动扫描
python app.py

# 查看结果
# → http://localhost:8501
```

### API 使用

```python
from crawler.core.engine import CrawlEngine
from crawler.config import Config

config = Config(
    start_url="https://example.com",
    max_pages=100,
    worker_count=4,
)

engine = CrawlEngine(config)
job = engine.run()

print(f"爬取页面数: {job.pages_done}")
print(f"发现资源数: {job.resources_found}")
print(f"缓存命中: {job.cache_hits}")
```

## 架构设计

### 核心组件

| 组件 | 职责 |
|------|------|
| **Frontier** | BFS URL 队列，支持域级重复检测 |
| **FetcherThread** | HTTP 请求，连接池复用，条件缓存 |
| **ParserThread** | HTML 解析和标签抽取（多信号排名） |
| **WriterThread** | 结果持久化到 SQLite |
| **RenderThread** | JavaScript 渲染（Playwright） |
| **CacheService** | HTTP 缓存，ETag/Last-Modified 验证 |

### 提取管道

```
HTML 响应
    ↓
1. JSON-LD（结构化数据）
    ↓ （缺失则降级）
2. OpenGraph（og:* 标签）
    ↓ （缺失则降级）
3. Twitter Card（twitter:* 标签）
    ↓ （缺失则降级）
4. 微数据（itemscope）
    ↓ （缺失则降级）
5. DOM 解析（h1, p, meta）
```

每个信号都包含 **来源追踪** — 了解每条数据来自哪个抽取器。

## 配置

环境变量在 `crawler/config.py` 中：

```python
# 爬虫配置
WORKER_COUNT = 4
MAX_PAGES = 1000
MAX_RESPONSE_BYTES = 10 * 1024 * 1024  # 每页 10 MB 上限
HTTP_TIMEOUT = 10  # 秒

# 缓存配置
CACHE_ENABLED = True
MAX_REDIRECTS = 5

# 安全配置
ALLOW_PRIVATE_HOSTS = False  # SSRF 防护

# 速率限制
DOMAIN_RATE_LIMIT = 2  # 每秒请求数
```

## 测试

运行所有测试：

```bash
pytest tests/ -v
```

覆盖率报告：

```bash
pytest tests/ --cov=crawler --cov-report=html
```

测试分类：
- **Fetcher 测试** — HTTP 请求、缓存、条件头
- **Parser 测试** — 结构化数据提取、降级链
- **Crawler 测试** — 引擎生命周期、工作线程协调
- **Export 测试** — CSV/JSON 结果格式化
- **Cache 测试** — ETag/Last-Modified 验证

## 数据库架构

SQLite 数据库包含 11 个表：

- `scans` — 爬虫任务（start_url, worker_count, pages_done, cache_hits/misses）
- `pages` — 爬取的 URL（title, description, status_code, fetched_at）
- `resources` — 抽取的标签/链接（type, name, url, confidence）
- `raw_data` — 结构化数据（json_ld, og, twitter, microdata, dom）
- `provenance` — 数据源追踪（extractor_name, signal_type）

详见 `crawler/storage.py`。

## 性能指标

**基准测试**（100 页爬取，4 个工作线程）：
- 获取阶段：~2-3 秒（连接池复用）
- 解析阶段：~1 秒
- 总耗时：~3-4 秒 + 网络 I/O
- 缓存命中率：重复扫描时 30-50%

**优化亮点：**
- 模块级 Session 复用（避免每次 TLS 握手）
- 流中止超大响应（MAX_RESPONSE_BYTES）
- 域级速率限制（防止被封）
- 条件请求（节省缓存页面的带宽）

## 已知限制 & 后续计划

### Phase 2（UI 增强）
- [ ] 实时进度流传输
- [ ] 扫描历史 + 过滤
- [ ] 导出调度器（邮件发送结果）

### Phase 3（高级功能）
- [ ] 内容相似性聚类
- [ ] 关键词频率分析
- [ ] 趋势检测（GA 集成）

## 贡献指南

1. Fork 此仓库
2. 创建功能分支 (`git checkout -b feature/my-feature`)
3. 为新功能添加测试
4. 运行 `pytest` 验证
5. 提交 Pull Request

## 许可证

MIT

## 相关资源

- [HTTP 缓存设计](docs/plans/2026-04-17-001-feat-http-response-caching-plan.md)
- [结构化优先提取设计](docs/plans/2026-04-17-005-refactor-structured-data-first-extraction-plan.md)
- [性能扩展需求分析](docs/brainstorms/2026-04-17-crawler-performance-scaling-requirements.md)
