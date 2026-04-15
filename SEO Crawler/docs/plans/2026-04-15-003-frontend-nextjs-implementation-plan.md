---
title: feat: SEO Crawler Phase 3 - Next.js 前端完善
type: feat
status: active
date: 2026-04-15
origin: Phase 2完成，后端API已就绪 (端口3001)
---

# SEO Crawler Phase 3 - Next.js 前端完善

## Overview

实现完整的Next.js前端，支持任务创建、结果展示、历史任务查看、CSV导出等核心功能。后端MVP和性能优化已完成，现在搭建用户面向的前端界面。

## Problem Frame

- 后端API已完全就绪 (4个性能优化单元已实现)
- 前端框架已安装 (Next.js 14.2.35, Pages Router)
- 缺少页面实现、组件和API集成
- 用户无法通过UI与系统交互

**用户期望**:
- 快速创建爬虫任务
- 实时监测任务状态
- 查看和过滤关键词结果
- 下载CSV导出

## Requirements Trace

**R1. API集成** — 封装所有后端API调用，提供类型安全的接口  
**R2. 任务管理** — 支持创建、查看列表、查看详情、等待完成  
**R3. 结果展示** — 分页表格、过滤、排序关键词结果  
**R4. 数据导出** — CSV下载功能  
**R5. 状态监测** — 实时轮询任务状态，自动刷新  

## Scope Boundaries

**明确做**:
- 5个Next.js Pages Router页面 (首页、列表、详情)
- Hono风格的API调用封装
- @tanstack/react-table 表格组件
- 简单CSS (无Tailwind/UI框架)
- 轮询状态更新 (3秒间隔)

**明确不做**:
- Tailwind/Material Design
- WebSocket实时更新 (轮询足够)
- Redux/Zustand 状态管理 (useState足够)
- 国际化 (先英文)
- 权限控制 (MVP不需要)

## Architecture & File Structure

```
frontend/
├── pages/
│   ├── _app.tsx              # 全局布局 + 导航
│   ├── index.tsx             # 首页：创建任务表单
│   ├── jobs/
│   │   ├── index.tsx         # 任务列表（分页）
│   │   └── [id].tsx          # 任务详情 + 结果表格
│
├── src/
│   └── utils/
│       └── api.ts            # axios封装 + API函数
│
├── styles/
│   └── globals.css           # 最小化reset + helpers
│
├── public/
│   └── (favicon, etc.)
│
└── package.json              # 依赖: @tanstack/react-table, axios
```

## Implementation Units

### Unit A: API工具层 ⭐ START HERE

**文件**: `frontend/src/utils/api.ts`  
**目标**: 封装所有后端API调用，提供类型安全接口

**TypeScript接口**:
```typescript
interface Job {
  id: string;
  seed: string;
  sources: string[];
  status: "waiting" | "running" | "completed" | "failed";
  createdAt: number;
  finishedAt?: number;
  errorMessage?: string;
}

interface JobResult {
  id: string;
  source: string;
  rawKeyword: string;
  normalizedKeyword: string;
  intent: "informational" | "commercial" | "transactional" | "navigational" | "other";
  score: number;
  createdAt: number;
}

interface CreateJobPayload {
  seed: string;
  sources: string[]; // ["google", "bing"]
  competitorUrls?: string[];
}

interface JobListResponse {
  jobs: Job[];
  total: number;
  page: number;
  pageSize: number;
}

interface JobResultsResponse {
  jobId: string;
  keywords: JobResult[];
  total: number;
  page: number;
  pageSize: number;
}
```

**API函数** (axios baseURL=http://localhost:3001):
- `createJob(seed: string, sources: string[], competitorUrls?: string[]): Promise<Job>`
- `listJobs(page: number, pageSize: number): Promise<JobListResponse>`
- `getJob(id: string): Promise<Job>`
- `getJobResults(id: string, page: number, pageSize: number): Promise<JobResultsResponse>`
- `getExportUrl(id: string): string` (CSV下载URL)

**Patterns to follow**:
- 参考 `backend/dist/routes/jobs.js` API签名
- 错误处理: 返回类型标准化 (error, message, status)
- 类型定义: 与后端响应完全对应

**Test scenarios**:
- ✓ 成功创建任务，返回Job对象
- ✓ 任务列表分页 (page/pageSize)
- ✓ 获取任务详情 (包括finishedAt, errorMessage)
- ✓ 获取结果列表 (包括排序和过滤)
- ✓ 错误处理: 404 (Job not found), 500 (Server error)
- ✓ CSV导出URL正确格式化

---

### Unit B: 全局布局

**文件**: `pages/_app.tsx`, `styles/globals.css`  
**目标**: 设置全局样式和导航框架

**_app.tsx内容**:
- 导入 `styles/globals.css`
- 顶部导航条：Logo + "新建任务" 链接 + "历史任务" 链接
- 简单flex布局容器，max-width 1200px

**globals.css内容**:
- HTML reset (margin/padding reset)
- body: sans-serif字体, 背景色#f5f5f5
- .container: max-width 1200px, margin auto
- .button: 基础按钮样式 (padding, border-radius, hover)
- .loading: 加载态提示

**Patterns to follow**:
- 最小化依赖，原生CSS
- Flexbox布局
- 颜色: 主色#0070f3, 灰色#666, 错误#ff0000

---

### Unit C: 首页——新建任务

**文件**: `pages/index.tsx`  
**目标**: 创建任务的表单页面

**UI组件**:
1. **种子关键词输入** (必填)
   - `<input type="text" placeholder="输入种子关键词 (如: SEO, digital marketing)"/>`
   - 验证: 非空

2. **来源Checkbox** (至少选一个)
   - ☑ Google
   - ☑ Bing
   - 验证: 至少勾选一个

3. **竞争对手URLs** (可选)
   - `<textarea placeholder="每行一个URL"/>`
   - 提交时: split('\n').filter(u => u.trim())

4. **提交按钮**
   - 显示loading状态时禁用，显示"Creating..."
   - 成功: 自动跳转到 `/jobs/[id]`
   - 错误: 显示内联错误消息 (红色文字)

**Logic**:
```typescript
const [seed, setSeed] = useState("");
const [sources, setSources] = useState({ google: false, bing: false });
const [competitorUrls, setCompetitorUrls] = useState("");
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");
const router = useRouter();

const handleSubmit = async (e) => {
  e.preventDefault();
  setError("");
  const selectedSources = Object.keys(sources).filter(s => sources[s]);
  
  if (!seed || selectedSources.length === 0) {
    setError("请输入种子词并至少选择一个来源");
    return;
  }
  
  setLoading(true);
  try {
    const urls = competitorUrls.split('\n').map(u => u.trim()).filter(Boolean);
    const job = await createJob(seed, selectedSources, urls.length > 0 ? urls : undefined);
    router.push(`/jobs/${job.id}`);
  } catch (err) {
    setError(err.message || "创建任务失败");
  } finally {
    setLoading(false);
  }
};
```

**Test scenarios**:
- ✓ 填写完整表单，成功创建任务并跳转
- ✓ 不填种子词: 显示错误提示
- ✓ 不选来源: 显示错误提示
- ✓ 竞争对手URLs有效格式化（空行忽略）

---

### Unit D: 任务详情 + 结果页

**文件**: `pages/jobs/[id].tsx`  
**目标**: 展示任务进度和关键词结果表格

**UI分段**:

1. **任务状态头部** (顶部)
   - 种子词、来源、状态徽章 (waiting/running/completed/failed)
   - 用时 (HH:MM:SS)
   - 结果数量 (total)
   ```
   Seed: digital marketing | Sources: Google, Bing | Status: [RUNNING] | Results: 234
   ```

2. **轮询状态** (logic)
   - `useEffect(() => { interval = setInterval(() => getJob(id), 3000) })`
   - waiting/running时刷新，completed/failed时停止

3. **结果表格** (@tanstack/react-table)
   - 列: normalizedKeyword, source, intent, score, rawKeyword
   - 行数: 25条/页 (分页控件)
   - 过滤: 来源下拉 (google/bing/全部)
   - 过滤: 意图下拉 (5种 + 全部)
   ```
   Keyword | Source | Intent | Score | Raw
   ------  | ------ | ------ | ----- | ---
   [table rows...]
   ```

4. **CSV导出按钮**
   - `window.location.href = getExportUrl(id)` 触发下载

5. **错误状态**
   - failed时显示 errorMessage (红色) 和重试按钮

**Logic**:
```typescript
const [job, setJob] = useState<Job | null>(null);
const [results, setResults] = useState<JobResult[]>([]);
const [page, setPage] = useState(1);
const [source, setSource] = useState(""); // 过滤
const [intent, setIntent] = useState(""); // 过滤

// 轮询状态
useEffect(() => {
  const pollJob = async () => {
    const updated = await getJob(id);
    setJob(updated);
    if (updated.status !== "waiting" && updated.status !== "running") {
      clearInterval(interval);
    }
  };
  
  const interval = setInterval(pollJob, 3000);
  pollJob(); // 立即执行一次
  return () => clearInterval(interval);
}, [id]);

// 获取结果
useEffect(() => {
  if (job?.status === "completed") {
    getJobResults(id, page, 25).then(setResults);
  }
}, [id, page, job?.status]);
```

**Test scenarios**:
- ✓ 新建任务，自动跳转到详情页
- ✓ 轮询状态：waiting → running → completed (手动修改DB验证)
- ✓ 结果表格加载并分页
- ✓ 来源和意图过滤正常工作
- ✓ CSV导出链接正确
- ✓ 失败任务显示错误消息

---

### Unit E: 历史任务列表

**文件**: `pages/jobs/index.tsx`  
**目标**: 显示所有任务列表，支持分页

**UI内容**:
1. **任务表格** (@tanstack/react-table)
   - 列: seed, sources, status, createdAt, action
   - 行数: 10条/页 (分页)
   - 点击"查看"跳转到 `/jobs/[id]`
   ```
   Seed | Sources | Status | Created | Action
   ---- | ------- | ------ | ------- | ------
   ...  | ...     | ...    | ...     | [View]
   ```

2. **新建任务按钮**
   - 浮动在顶部，点击跳转到 `/`

3. **自动刷新**
   - 每次进入页面调用 `listJobs(1, 10)`

**Logic**:
```typescript
const [jobs, setJobs] = useState<Job[]>([]);
const [total, setTotal] = useState(0);
const [page, setPage] = useState(1);

useEffect(() => {
  listJobs(page, 10).then((res) => {
    setJobs(res.jobs);
    setTotal(res.total);
  });
}, [page]);

const handleView = (id: string) => {
  router.push(`/jobs/${id}`);
};
```

**Test scenarios**:
- ✓ 列表加载所有任务
- ✓ 分页正常工作
- ✓ 点击"查看"正确跳转
- ✓ 新建按钮跳转到首页

---

## Key Technical Decisions

- **轮询 vs WebSocket**: 轮询更简单，MVPあるいは不需要实时性
- **原生CSS**: 最小依赖，可维护性高
- **@tanstack/react-table**: 已安装，功能完整
- **axios**: RESTful API调用标准库
- **无状态管理库**: useState足够，不引入Redux/Zustand

## Dev Workflow

```bash
# 1. 启动后端 (端口3001)
cd backend && npm start

# 2. 启动前端 (端口3000)
cd frontend && npm run dev

# 3. 浏览器打开 http://localhost:3000
# 4. 创建任务测试完整流程
```

## Verification Checklist

- [ ] Unit A: API工具层完成，所有函数有类型定义
- [ ] Unit B: 全局布局和导航正常显示
- [ ] Unit C: 首页表单验证和提交正常
- [ ] Unit D: 任务详情轮询和结果表格显示
- [ ] Unit E: 任务列表分页和导航正常
- [ ] 完整流程: 创建→等待→完成→查看→导出 ✓
- [ ] 无控制台错误
- [ ] 移动端响应 (简单flex布局)

## Performance Targets

- 首页加载: < 1s
- 列表查询: < 500ms (缓存命中 < 50ms)
- 结果查询: < 200ms (缓存命中 < 10ms)
- CSV导出: < 2s (500-1000个关键词)

## Related Files

- 后端API: `backend/dist/routes/jobs.js`
- 后端缓存: `backend/dist/services/resultsCache.js`
- 性能文档: `docs/PERFORMANCE_OPTIMIZATION_EXECUTION_SUMMARY.md`

---

**Status**: Ready for Implementation  
**Order**: A → B → C → D → E (逐个单元，每个单元完成后单独提交)
