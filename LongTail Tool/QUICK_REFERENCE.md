# 快速参考卡 — 5 分钟速查

## 项目初始化

### Next.js + Prisma 项目结构
```bash
my-app/
├── app/
│   ├── api/              # 后端路由
│   ├── components/       # React 组件
│   ├── [route]/page.tsx # 前端页面
│   ├── layout.tsx
│   └── providers.tsx
├── lib/
│   ├── db.ts            # Prisma 单例
│   ├── auth.ts
│   ├── rateLimit.ts
│   ├── logger.ts
│   ├── rbac.ts
│   ├── routeHelpers.ts
│   ├── jobs.ts
│   ├── services/        # 业务逻辑
│   └── llm/            # 可选：LLM 服务
├── prisma/
│   └── schema.prisma
├── middleware.ts        # NextAuth + Request ID
├── package.json
├── tsconfig.json
└── next.config.js
```

## Prisma 常用代码

### 初始化
```typescript
// lib/db.ts
const globalForPrisma = global as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma || new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

### CRUD 模式
```typescript
// 创建
await prisma.user.create({ data: { email, password } })

// 读取
await prisma.user.findUnique({ where: { id } })
await prisma.user.findMany({ where: { role: 'ADMIN' }, take: 10 })

// 计数（速率限制）
const count = await prisma.record.count({
  where: { userId, created_at: { gt: oneHourAgo } }
})

// 更新
await prisma.job.update({
  where: { id },
  data: { status: 'completed', result: JSON.stringify(data) }
})

// 删除
await prisma.job.deleteMany({
  where: { createdAt: { lt: sevenDaysAgo } }
})
```

### 索引规则
```prisma
@@index([email])                    // 常查字段
@@index([userId])                   // 外键
@@index([status])                   // 状态过滤
@@index([created_at])               # 时间范围
@@index([userId, created_at])       # 复合：用户 + 时间
```

## API 路由模板

```typescript
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  
  try {
    // 1. 认证
    const session = await requireAuth()
    
    // 2. 速率限制
    const rateLimit = await checkRateLimit(session.user.id, 'endpoint')
    if (!rateLimit.allowed) {
      return buildRateLimitErrorResponse(rateLimit, '/api/endpoint', session.user.id, requestId)
    }
    
    // 3. 输入验证
    const body = await request.json()
    const validation = validatePromptInput(body.raw_prompt)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    
    // 4. 业务逻辑
    const result = await businessLogic(body)
    const duration = Date.now() - startTime
    
    // 5. 日志
    logger.info({ route: '/api/endpoint', userId: session.user.id, request_id: requestId, duration_ms: duration, status: 200 })
    
    // 6. 响应 + 速率限制头
    const response = NextResponse.json(result)
    Object.entries(formatRateLimitHeaders(rateLimit)).forEach(([k, v]) => {
      response.headers.set(k, v)
    })
    return response
  } catch (error: any) {
    return buildErrorResponse(error, '/api/endpoint', requestId, Date.now() - startTime)
  }
}
```

## React 组件模板

### 页面 + 客户端组件
```typescript
// app/dashboard/page.tsx（服务器组件）
import DashboardClient from './DashboardClient'
export const metadata = { title: 'Dashboard' }
export default function Page() {
  return <DashboardClient />
}

// app/dashboard/DashboardClient.tsx（客户端）
"use client"
import { useState, useEffect } from 'react'

export default function DashboardClient() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await fetch('/api/user/history')
        setData(await res.json())
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [])
  
  if (loading) return <div>Loading...</div>
  return <div>{/* 展示 data */}</div>
}
```

## 速率限制：两种策略

### 持久化（DB 支持，跨重启）
```typescript
async function checkOptimizeFullRateLimit(userId: string) {
  const limit = parseInt(process.env.RATE_LIMIT_OPTIMIZE_PER_HOUR || '10', 10)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  
  const count = await prisma.record.count({
    where: { userId, created_at: { gt: oneHourAgo } }
  })
  
  return { allowed: count < limit, remaining: limit - count, limit }
}
```

### 内存（快速，重启丢失）
```typescript
const tracker = new Map<string, { count: number, windowStart: number }>()

function checkScoreRateLimit(userId: string) {
  const limit = 30, now = Date.now(), oneHourMs = 60 * 60 * 1000
  
  const tracking = tracker.get(userId)
  if (!tracking || now - tracking.windowStart > oneHourMs) {
    tracker.set(userId, { count: 1, windowStart: now })
    return { allowed: true, remaining: limit }
  }
  
  tracking.count++
  return { allowed: tracking.count <= limit, remaining: limit - tracking.count }
}

// 定期清理
setInterval(() => {
  const now = Date.now()
  for (const [uid, t] of tracker.entries()) {
    if (now - t.windowStart > 60 * 60 * 1000) tracker.delete(uid)
  }
}, 10 * 60 * 1000)
```

## Job Queue 模式

```typescript
// lib/jobs.ts
export async function createJob(userId: string) {
  const job = await prisma.optimizationJob.create({
    data: { userId, status: 'running' }
  })
  return job.id
}

export async function getJobStatus(jobId: string, userId: string) {
  const job = await prisma.optimizationJob.findUnique({ where: { id: jobId } })
  if (!job || job.userId !== userId) return null
  return {
    id: job.id,
    status: job.status,
    result: job.result ? JSON.parse(job.result) : undefined,
    error: job.error
  }
}

export async function completeJob(jobId: string, result: any) {
  await prisma.optimizationJob.update({
    where: { id: jobId },
    data: { status: 'completed', result: JSON.stringify(result) }
  })
}

export async function cleanupOldJobs() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  return await prisma.optimizationJob.deleteMany({
    where: { createdAt: { lt: sevenDaysAgo } }
  })
}

// 在 API 初始化时运行
setTimeout(() => cleanupOldJobs(), 5 * 60 * 1000)
setInterval(() => cleanupOldJobs(), 24 * 60 * 60 * 1000)
```

**Job 表设计：**
```prisma
model OptimizationJob {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  status     String   @default("running")    // running|completed|failed|cancelled
  result     String?
  error      String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  
  @@index([userId])
  @@index([status])
  @@index([createdAt])
}
```

## TypeScript 类型定义

```typescript
// API 响应
export interface ScoreResult {
  total: number
  dimensions: { specificity: number; context: number }
  missing_slots: string[]
}

// 状态类型
export type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled'

// 速率限制
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  resetAt: Date
}

// 验证结果
export interface ValidationResult {
  valid: boolean
  error?: string
}
```

## 日志模式

```typescript
// lib/logger.ts
import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
})

export default logger
```

**使用：**
```typescript
logger.info({ route, userId, request_id, duration_ms, status: 200 })
logger.warn({ userId, error: 'Rate limit exceeded' })
logger.error({ route, error, stack: error.stack })
```

## 环境变量模板

```bash
# .env.local（开发）
DATABASE_URL=sqlite://./dev.db
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000
RATE_LIMIT_OPTIMIZE_PER_HOUR=10
RATE_LIMIT_SCORE_PER_HOUR=30
LOG_LEVEL=debug
NODE_ENV=development

# .env.production（生产）
DATABASE_URL=postgresql://user:pass@host:5432/db_name
NEXTAUTH_SECRET=<secure-random>
NEXTAUTH_URL=https://yourdomain.com
RATE_LIMIT_OPTIMIZE_PER_HOUR=10
RATE_LIMIT_SCORE_PER_HOUR=30
LOG_LEVEL=info
NODE_ENV=production
```

## 常用命令

```bash
# 开发
npm run dev                           # 启动开发服务器
npm run db:studio                    # Prisma Studio UI

# 测试
npm run test:ci                      # 全部单元测试
npm run test:e2e                     # E2E 测试
npm run test:watch                   # 监听模式

# 数据库
npm run db:push                      # 应用 Prisma 迁移
npm run db:reset                     # 重置数据库（开发）
npx prisma db seed                   # 填充数据

# 部署
npm run build                        # 生产构建
npm run start                        # 启动生产服务器
npm run lint                         # TypeScript + ESLint
```

## Middleware 请求 ID 注入

```typescript
// middleware.ts
import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

export const config = {
  matcher: ['/api/score', '/api/optimize-full', '/api/admin/:path*']
}

export default withAuth(
  function middleware(req) {
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID()
    const response = NextResponse.next()
    response.headers.set('x-request-id', requestId)
    return response
  },
  {
    callbacks: { authorized: ({ token }) => !!token },
    pages: { signIn: '/login' }
  }
)
```

## 预部署检查清单

- [ ] PostgreSQL 已配置（生产用 PostgreSQL，不是 SQLite）
- [ ] 环境变量完整（`NEXTAUTH_SECRET`, `DATABASE_URL` 等）
- [ ] 所有测试通过（`npm run test:ci`）
- [ ] 编译成功（`npm run build`）
- [ ] 依赖安全（`npm audit`）
- [ ] 健康检查正常（`GET /api/health`）
- [ ] 速率限制工作（应返回 429）
- [ ] 日志输出正确
- [ ] 数据库连接稳定
- [ ] 无内存泄漏

---

**快速参考卡 v1.0 — 2026-04-14**

**使用场景：**
- 新建项目时快速初始化（5 分钟）
- 开发中快速查阅常用代码片段
- 部署前检查清单

**详细说明：** 见 `ARCHITECTURE_PATTERNS.md`
