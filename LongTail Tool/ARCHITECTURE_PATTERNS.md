# YD 2026 已完成项目 — 可复用架构模式指南

基于 Prompt Optimizer (v0.2.0)、session-wrap-backend、wm-tool 等生产项目的实战提取。

---

## 1. Web 应用架构 (前后端分离)

### 1.1 Next.js 全栈应用架构

**文件组织结构：**
```
app/
├── api/              # API 路由 (后端)
│   ├── auth/         # 认证路由
│   ├── admin/        # 权限管理路由
│   ├── user/         # 用户数据路由
│   └── [resource]/   # 动态资源路由
├── components/       # 可复用 React 组件
├── [page]/          # 页面路由 (前端)
│   └── page.tsx     # 页面入口
└── layout.tsx       # 根布局

lib/
├── db.ts            # 数据库连接管理 (Prisma)
├── auth.ts          # 认证逻辑
├── rateLimit.ts     # 限流实现
├── logger.ts        # 日志服务
├── services/        # 业务逻辑服务
├── rbac.ts          # 权限管理
└── routeHelpers.ts  # API 路由辅助函数

middleware.ts       # Next.js 中间件 (请求拦截/转发)
```

**设计决策：**
- ✅ 将 `lib/` 作为 SSR+API 双重服务层
- ✅ 认证在 middleware 层完成，减少重复检查
- ✅ API 路由提供 REST + 速率限制 + 日志
- ✅ 使用 "use client" 指令明确分割客户端组件

**文档参考：** Prompt Optimizer v0.2.0 `docs/PRODUCTION_DEPLOYMENT.md`

---

## 2. SQLite / Prisma 使用模式

### 2.1 Prisma 数据库设计

**关键约定：**

```prisma
model User {
  id        String    @id @default(cuid())
  email     String    @unique
  password  String
  role      String    @default("USER")    // RBAC: "ADMIN" | "USER"
  records   OptimizationRecord[]
  apiKeys   ApiKey[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  
  @@index([email])                        // 必须索引查询字段
}

model OptimizationRecord {
  id                    String   @id @default(uuid())
  raw_prompt            String
  raw_score_total       Int?     // ✅ 反范式化：存储聚合值加速查询
  optimized_score_total Int?
  userId                String?
  user                  User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  created_at            DateTime @default(now())
  
  @@index([created_at])
  @@index([userId])
  @@index([userId, created_at])          // ✅ 复合索引：用户历史时间序列
}
```

**最佳实践：**

1. **默认值与时间戳：**
   - 使用 `@default(cuid())` 或 `@default(uuid())` 避免数据库生成
   - 所有记录都有 `createdAt` 和 `updatedAt`

2. **反范式化策略：**
   ```prisma
   // ❌ 不好：每次查询都计算总分
   SELECT AVG(JSON_EXTRACT(score, '$.total'))
   
   // ✅ 好：存储计算结果
   model OptimizationRecord {
     raw_score_total Int?  // 冗余字段，加速聚合查询
   }
   ```

3. **级联删除：**
   ```prisma
   user User @relation(fields: [userId], references: [id], onDelete: SetNull)
   // onDelete: Cascade   // 删除用户时删除所有记录
   // onDelete: SetNull   // 删除用户时，userId 设为 NULL
   ```

### 2.2 Prisma 客户端单例模式

```typescript
// lib/db.ts
const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**原因：** Next.js 在开发模式下热加载，防止连接泄漏。

### 2.3 常见 Prisma 查询模式

```typescript
// 模式1：计数 + 窗口检查（用于速率限制）
const count = await prisma.optimizationRecord.count({
  where: {
    userId,
    created_at: { gt: oneHourAgo },  // 大于某时间
  },
});

// 模式2：查找最早记录（计算重置时间）
const oldestRecord = await prisma.optimizationRecord.findFirst({
  where: { userId, created_at: { gt: oneHourAgo } },
  orderBy: { created_at: 'asc' },
});

// 模式3：插入 + 级联（外键约束）
const job = await prisma.optimizationJob.create({
  data: { userId, status: 'running' },  // userId 必须存在
});

// 模式4：更新 + 返回更新后的对象
const updated = await prisma.optimizationJob.update({
  where: { id: jobId },
  data: { status: 'completed', result: JSON.stringify(result) },
});

// 模式5：批量删除 + 时间范围
const deleted = await prisma.optimizationJob.deleteMany({
  where: { createdAt: { lt: sevenDaysAgo } },
});
```

---

## 3. 异步任务处理（Worker / Queue）

### 3.1 数据库支持的 Job Queue 模式

**不推荐：** 使用外部 Redis/RabbitMQ（增加基础设施复杂度）

**推荐：** 使用数据库表 + 轮询

```typescript
// lib/jobs.ts
export async function createOptimizationJob(userId: string): Promise<string> {
  const job = await prisma.optimizationJob.create({
    data: {
      userId,
      status: 'running',    // 状态机：running → completed | cancelled | failed
    },
  });
  return job.id;
}

export async function getJobStatus(
  jobId: string,
  userId: string,
): Promise<JobStatus | null> {
  const job = await prisma.optimizationJob.findUnique({
    where: { id: jobId },
  });
  if (!job || job.userId !== userId) return null;
  
  return {
    id: job.id,
    status: job.status,
    result: job.result ? JSON.parse(job.result) : undefined,
    error: job.error || undefined,
  };
}

export async function completeJob(jobId: string, result: any): Promise<void> {
  await prisma.optimizationJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      result: JSON.stringify(result),
    },
  });
}

export async function cleanupOldJobs(): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.optimizationJob.deleteMany({
    where: { createdAt: { lt: sevenDaysAgo } },
  });
  return result.count;
}
```

**Job 表设计：**
```prisma
model OptimizationJob {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  status     String   @default("running")     // 状态机
  result     String?  // JSON 序列化结果
  error      String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  cancelledAt DateTime?
  
  @@index([userId])
  @@index([status])                          // 快速查询待处理任务
  @@index([createdAt])                       // 清理过期任务
}
```

**客户端轮询模式：**
```typescript
// 前端：定期查询 Job 状态
const pollJobStatus = async (jobId: string) => {
  const response = await fetch(`/api/optimize-full/${jobId}`);
  const job = await response.json();
  
  if (job.status === 'completed' || job.status === 'failed') {
    clearInterval(pollerId);  // 停止轮询
    return job;
  }
  // 继续轮询...
};

setInterval(() => pollJobStatus(jobId), 2000);
```

### 3.2 后台清理任务

```typescript
// 在应用启动时运行
setTimeout(async () => {
  const count = await cleanupOldJobs();
  logger.info({ deletedCount: count }, 'Cleaned up old jobs');
}, 5 * 60 * 1000);  // 5分钟后首次运行

setInterval(async () => {
  await cleanupOldJobs();
}, 24 * 60 * 60 * 1000);  // 每24小时
```

---

## 4. React 项目结构与最佳实践

### 4.1 组件分类

```typescript
// 类型1：页面组件 (包含业务逻辑、数据获取)
// app/dashboard/page.tsx
import DashboardClient from './DashboardClient';

export const metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return <DashboardClient />;  // 服务器组件包装客户端组件
}

// 类型2：客户端组件 (交互、状态管理)
// app/dashboard/DashboardClient.tsx
"use client";

export default function DashboardClient() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    fetch('/api/user/history')
      .then(r => r.json())
      .then(setData);
  }, []);
  
  return <div>{/* UI */}</div>;
}

// 类型3：展示组件 (纯展示，无状态)
// app/components/OptimizationResult.tsx
interface Props {
  rawScore: Score | null;
  optimizedScore: Score | null;
  isLoading: boolean;
}

export function OptimizationResult(props: Props) {
  if (props.isLoading) return <LoadingSpinner />;
  if (!props.rawScore) return null;
  
  return <div>{/* 展示逻辑 */}</div>;
}
```

### 4.2 Hooks 模式

```typescript
// ✅ 标准 useEffect 模式：初始化 + 清理
useEffect(() => {
  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/user/history');
      const data = await response.json();
      setData(data);
    } catch (error) {
      // 错误已在 UI 加载状态中体现
    }
  };
  
  fetchHistory();
}, []);  // 空依赖 = 仅在挂载时运行

// ✅ useMemo：缓存计算结果
const { totalDelta } = useMemo(() => {
  return {
    totalDelta: optimizedScore.total - rawScore.total,
  };
}, [rawScore, optimizedScore]);

// ✅ 避免：在 effect 中运行副作用
useEffect(() => {
  fetch(...)  // 不要这样 ❌
    .then(() => fetch(...))  // 链式 fetch 容易泄漏
}, [dependency]);
```

### 4.3 状态管理约定

- 使用 React hooks + Context（数据量小）
- 对于复杂状态，考虑 Redux / Zustand
- 前端状态与后端状态分离

```typescript
// ✅ 分离关注点
const [uiState, setUiState] = useState<'loading' | 'success' | 'error'>(
  'loading',
);
const [data, setData] = useState<ApiResponse | null>(null);
const [error, setError] = useState<string>('');
```

---

## 5. TypeScript 严格模式约定

### 5.1 项目配置

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  }
}
```

### 5.2 类型定义规范

```typescript
// ✅ 显式定义 API 响应类型
interface ScoreResponse {
  total: number;
  dimensions: {
    specificity: number;
    context: number;
    // ...
  };
  missing_slots: string[];
  issues: string;
}

// ✅ 导出接口供外部使用
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

// ✅ 使用 type 定义联合类型
export type JobStatus = 'running' | 'completed' | 'cancelled' | 'failed';

// ✅ 函数参数和返回值都要注解
async function checkRateLimit(
  userId: string,
  endpoint: 'optimize-full' | 'score',
): Promise<RateLimitResult> {
  // ...
}
```

### 5.3 常见模式

```typescript
// ✅ 模式1：环境变量类型安全
const limit = parseInt(process.env.RATE_LIMIT_OPTIMIZE_PER_HOUR ?? '10', 10);

// ✅ 模式2：JSON 序列化/反序列化
const result = JSON.parse(job.result ?? '{}') as OptimizationResult;
const stored = JSON.stringify(result);

// ✅ 模式3：可选字段处理
export interface ValidationResult {
  valid: boolean;
  error?: string;  // 可选
}

if (!validation.valid) {
  return { valid: false, error: 'Invalid input' };
}

// ✅ 模式4：错误处理
try {
  // ...
} catch (error: any) {
  const message = error?.message || 'Unknown error';
  const status = error?.name === 'UnauthorizedError' ? 401 : 500;
}
```

---

## 6. API 设计 & 路由模式

### 6.1 RESTful 路由结构

```
GET    /api/health                    # 健康检查
POST   /api/auth/register             # 注册
POST   /api/auth/login                # 登录

POST   /api/score                     # 单个评分
POST   /api/optimize-full             # 优化
POST   /api/optimize-full/batch       # 批量优化
GET    /api/optimize-full/{jobId}     # 查询 Job 状态
POST   /api/optimize-full/{jobId}/cancel

GET    /api/user/history              # 用户历史
GET    /api/user/search?q=...         # 搜索
GET    /api/user/quotas               # 配额信息

GET    /api/admin/users               # 列表用户 (仅 ADMIN)
GET    /api/admin/stats               # 统计 (仅 ADMIN)
GET    /api/admin/analytics           # 分析 (仅 ADMIN)
DELETE /api/admin/users               # 删除用户 (仅 ADMIN)
```

### 6.2 速率限制实现

**双策略：**

```typescript
// 策略1：数据库支持（持久化，跨重启）
async function checkOptimizeFullRateLimit(userId: string): Promise<RateLimitResult> {
  const limit = parseInt(process.env.RATE_LIMIT_OPTIMIZE_PER_HOUR || '10', 10);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const count = await prisma.optimizationRecord.count({
    where: { userId, created_at: { gt: oneHourAgo } },
  });
  
  return { allowed: count < limit, remaining: limit - count, limit, resetAt };
}

// 策略2：内存存储（轻量，速度快）
interface ScoreTracking {
  count: number;
  windowStart: number;  // 时间戳
}
const scoreTracker = new Map<string, ScoreTracking>();

function checkScoreRateLimit(userId: string): RateLimitResult {
  const limit = 30;
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  
  const tracking = scoreTracker.get(userId);
  if (!tracking || now - tracking.windowStart > oneHourMs) {
    scoreTracker.set(userId, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit, limit, resetAt };
  }
  
  tracking.count++;
  return { allowed: tracking.count <= limit, ... };
}

// 定期清理过期条目
setInterval(() => {
  const now = Date.now();
  for (const [userId, tracking] of scoreTracker.entries()) {
    if (now - tracking.windowStart > 60 * 60 * 1000) {
      scoreTracker.delete(userId);
    }
  }
}, 10 * 60 * 1000);  // 每10分钟
```

### 6.3 标准 API 路由模板

```typescript
// app/api/score/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  
  try {
    // 1. 认证
    const session = await requireAuth();
    
    // 2. 限流检查
    const rateLimit = await checkRateLimit(session.user.id, 'score');
    if (!rateLimit.allowed) {
      return buildRateLimitErrorResponse(rateLimit, '/api/score', session.user.id, requestId);
    }
    
    // 3. 输入验证
    const body = await request.json();
    const validation = validatePromptInput(body.raw_prompt, 50000);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    
    // 4. 业务逻辑
    const score = await scorePromptService(body.raw_prompt);
    const duration = Date.now() - startTime;
    
    // 5. 日志记录
    logger.info({
      route: '/api/score',
      userId: session.user.id,
      request_id: requestId,
      duration_ms: duration,
      status: 200,
    });
    
    // 6. 响应 + 限流头
    const response = NextResponse.json(score);
    Object.entries(formatRateLimitHeaders(rateLimit)).forEach(([key, val]) => {
      response.headers.set(key, val);
    });
    
    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return buildErrorResponse(error, '/api/score', requestId, duration);
  }
}
```

---

## 7. 日志与可观测性

### 7.1 Pino 日志配置

```typescript
// lib/logger.ts
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true },
  } : undefined,
});

export default logger;
```

**使用模式：**
```typescript
logger.info({ route: '/api/score', userId, request_id, duration_ms, status: 200 });
logger.warn({ route, userId, error: 'Rate limit exceeded' });
logger.error({ route, userId, error: errorMessage, stack: error.stack });
```

### 7.2 结构化日志字段

```typescript
// ✅ 标准字段
{
  route: string,              // 路由路径
  userId: string,             // 用户ID
  request_id: string,         // 请求跟踪ID
  duration_ms: number,        // 响应时间
  status: number,             // HTTP 状态码
  error?: string,             // 错误信息
  stack?: string,             // 堆栈跟踪（仅 dev）
}
```

---

## 8. 部署检查清单

**预部署：**
- [ ] PostgreSQL 实例已配置（生产用 PostgreSQL，不是 SQLite）
- [ ] 环境变量已设置（`NEXTAUTH_SECRET`, `DATABASE_URL` 等）
- [ ] 所有 186 个测试通过 (`npm run test:ci`)
- [ ] TypeScript 编译无错误 (`npm run build`)
- [ ] 依赖审计无漏洞 (`npm audit`)

**部署后：**
- [ ] 健康检查通过 (`GET /api/health`)
- [ ] 速率限制正常工作（429 响应）
- [ ] 日志正确输出
- [ ] 数据库连接稳定
- [ ] 无内存泄漏（监控堆大小）

---

## 9. 知识库索引

| 主题 | 文件 | 关键要点 |
|------|------|---------|
| **API 参考** | `/Prompt Optimizer/docs/API_REFERENCE.md` | 所有端点、请求/响应格式、错误码 |
| **部署** | `/Prompt Optimizer/docs/PRODUCTION_DEPLOYMENT.md` | Pre-deployment 检查、数据库迁移、监控 |
| **本地开发** | `/Prompt Optimizer/docs/local-testing.md` | 开发环境设置、测试命令 |
| **测试** | `/Prompt Optimizer/docs/TESTING.md` | Jest 单元测试、Playwright E2E 测试 |
| **优化计划** | `/Prompt Optimizer/docs/OPTIMIZATION_PLAN.md` | Phase 1-8 优化策略 |

---

## 10. 快速参考

### 常用命令

```bash
# 开发
npm run dev                    # 启动开发服务器 (Next.js)
npm run db:studio             # 打开 Prisma Studio

# 测试
npm run test:ci               # 运行所有单元测试
npm run test:e2e              # 运行 E2E 测试（Playwright）
npm run test:load             # 负载测试

# 数据库
npm run db:push               # 应用 Prisma 迁移
npm run db:reset              # 重置数据库（开发）
npx prisma db execute < query.sql  # 执行原始 SQL

# 部署
npm run build                 # 生产构建
npm run start                 # 启动生产服务器
npm run lint                  # 代码检查
```

### 环境变量模板

```bash
# .env.local
DATABASE_URL=sqlite://./dev.db              # 开发用 SQLite
# 生产用
# DATABASE_URL=postgresql://user:pass@host:5432/prompt_optimizer

NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000

RATE_LIMIT_OPTIMIZE_PER_HOUR=10
RATE_LIMIT_SCORE_PER_HOUR=30

LOG_LEVEL=debug                             # 开发用
NODE_ENV=development
```

---

**最后更新：** 2026-04-14
**基础项目版本：** Prompt Optimizer v0.2.0, session-wrap-backend v3.10.0
**测试覆盖率：** 186/186 (100%), 711/713 (99.7%) 企业级
