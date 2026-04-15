# LongTail Tool 文档索引

## 📖 核心文档（按阅读顺序）

### 1️⃣ README.md（从这里开始）
**用途：** 项目概览、快速导航  
**阅读时间：** 5 分钟  
**包含内容：**
- 项目背景（来自 YD 2026 生产项目）
- 10 大章节快速索引
- 来源项目列表
- 高频问题 Q&A

### 2️⃣ QUICK_REFERENCE.md（日常查询）
**用途：** 代码片段速查、5 分钟快速初始化  
**阅读时间：** 随需即用  
**包含内容：**
- 项目结构模板
- Prisma CRUD 常用代码
- API 路由模板
- 速率限制两种实现
- Job Queue 完整代码
- 环境变量模板
- 常用命令速查

### 3️⃣ ARCHITECTURE_PATTERNS.md（深度学习）
**用途：** 生产就绪的完整架构指南  
**阅读时间：** 30-45 分钟（分章节阅读）  
**章节分类：**

| 章节 | 标题 | 适用场景 |
|------|------|---------|
| 1 | Web 应用架构 | 新建 Next.js 项目 |
| 2 | SQLite / Prisma | 数据库设计与优化 |
| 3 | 异步任务处理 | 后台 Job / Worker |
| 4 | React 最佳实践 | 前端组件组织 |
| 5 | TypeScript 严格模式 | 代码质量 |
| 6 | API 设计 & 路由 | REST API 开发 |
| 7 | 日志与可观测性 | 生产监控 |
| 8 | 部署检查清单 | 上线前验证 |
| 9 | 知识库索引 | 进阶学习 |
| 10 | 快速参考 | 日常开发 |

---

## 🎯 按用途查找

### 我想新建一个 Web 项目
**路径：**
1. 读 README.md（5 分钟）
2. 参考 QUICK_REFERENCE.md 中的"项目初始化"（复制文件结构）
3. 读 ARCHITECTURE_PATTERNS.md 的 1、6 章（Web 架构、API 设计）
4. 参考源项目文件：
   - `/Prompt Optimizer/app/` — React 页面和组件
   - `/Prompt Optimizer/app/api/` — API 路由
   - `/Prompt Optimizer/lib/` — 共享服务层

### 我需要数据库实现（Prisma）
**路径：**
1. QUICK_REFERENCE.md 中的"Prisma 常用代码"（快速开始）
2. ARCHITECTURE_PATTERNS.md 的 第 2 章（完整设计指南）
3. 参考源项目：
   - `/Prompt Optimizer/prisma/schema.prisma` — Schema 示例
   - `/Prompt Optimizer/lib/db.ts` — 连接管理

### 我需要实现速率限制
**路径：**
1. QUICK_REFERENCE.md 中的"速率限制：两种策略"
2. ARCHITECTURE_PATTERNS.md 的 6.2 章（完整实现）
3. 参考源项目：
   - `/Prompt Optimizer/lib/rateLimit.ts` — 生产代码
   - `/Prompt Optimizer/docs/API_REFERENCE.md` — 端点说明

### 我要处理后台任务（异步）
**路径：**
1. QUICK_REFERENCE.md 中的"Job Queue 模式"
2. ARCHITECTURE_PATTERNS.md 的 第 3 章（Job 设计）
3. 参考源项目：
   - `/Prompt Optimizer/lib/jobs.ts` — Job 生命周期管理

### 我需要 React 组件结构
**路径：**
1. QUICK_REFERENCE.md 中的"React 组件模板"
2. ARCHITECTURE_PATTERNS.md 的 第 4 章（组件分类、Hooks 模式）
3. 参考源项目：
   - `/Prompt Optimizer/app/components/` — 展示组件
   - `/Prompt Optimizer/app/dashboard/` — 页面 + 客户端组件

### 我要部署到生产环境
**路径：**
1. QUICK_REFERENCE.md 中的"预部署检查清单"
2. ARCHITECTURE_PATTERNS.md 的 第 8 章（完整检查清单）
3. 参考源项目：
   - `/Prompt Optimizer/docs/PRODUCTION_DEPLOYMENT.md` — 详细部署指南

### 我需要 TypeScript 项目配置
**路径：**
1. QUICK_REFERENCE.md 中的"TypeScript 类型定义"
2. ARCHITECTURE_PATTERNS.md 的 第 5 章（严格模式、类型规范）

### 我需要日志和监控
**路径：**
1. QUICK_REFERENCE.md 中的"日志模式"
2. ARCHITECTURE_PATTERNS.md 的 第 7 章（Pino 配置、结构化日志）
3. 参考源项目：
   - `/Prompt Optimizer/lib/logger.ts`

---

## 📚 源项目完整路径

所有代码示例都可以在以下位置找到：

### Prompt Optimizer v0.2.0
```
/Users/dex/YD 2026/Prompt Optimizer/
├── app/                                    # Next.js app 目录
│   ├── api/                                # API 路由
│   │   ├── score/route.ts                 # 评分端点（rate limit 示例）
│   │   ├── optimize-full/route.ts         # 优化端点
│   │   ├── optimize-full/batch/route.ts   # 批量处理
│   │   └── admin/                         # 权限管理路由
│   └── components/                         # React 组件
├── lib/
│   ├── db.ts                              # Prisma 单例
│   ├── rateLimit.ts                       # 速率限制（双策略）
│   ├── jobs.ts                            # Job Queue 管理
│   ├── logger.ts                          # Pino 配置
│   ├── auth.ts                            # 认证逻辑
│   ├── rbac.ts                            # 权限管理
│   ├── routeHelpers.ts                    # API 辅助函数
│   └── services/                          # 业务逻辑
├── prisma/
│   └── schema.prisma                      # 数据库设计（完整示例）
├── middleware.ts                           # NextAuth 中间件
├── docs/
│   ├── PRODUCTION_DEPLOYMENT.md           # 完整部署指南（100+ 页）
│   ├── API_REFERENCE.md                   # API 文档
│   ├── TESTING.md                         # 测试指南
│   └── local-testing.md                   # 开发环境设置
└── package.json                            # 依赖配置
```

### session-wrap-backend v3.10.0
```
/Users/dex/YD 2026/projects/tools/session-wrap-backend/
├── src/
│   ├── index.js                           # Express 应用入口
│   ├── db/init.js                         # PostgreSQL 初始化 SQL
│   ├── middleware/                        # 中间件（错误处理、认证）
│   ├── routes/                            # 路由处理
│   ├── config/                            # 配置管理
│   └── utils/                             # 工具函数
└── package.json                            # Express 依赖
```

---

## 🔗 相关资源

### YD 2026 工作区
- **架构概览：** `/YD 2026/docs/ARCHITECTURE.md`
- **工作约定：** `/YD 2026/CONVENTIONS.md`

### 官方文档
- **Next.js 文档：** https://nextjs.org/docs
- **Prisma 文档：** https://www.prisma.io/docs
- **PostgreSQL 文档：** https://www.postgresql.org/docs
- **NextAuth.js 文档：** https://next-auth.js.org

---

## 📊 文档覆盖范围

| 技术 | 覆盖程度 | 源项目 |
|------|---------|--------|
| Next.js 14 | ✅ 完整 | Prompt Optimizer |
| Prisma 5 | ✅ 完整 | Prompt Optimizer |
| React 18 | ✅ 完整 | Prompt Optimizer |
| TypeScript 5 | ✅ 完整 | Prompt Optimizer |
| NextAuth.js | ✅ 完整 | Prompt Optimizer |
| PostgreSQL | ✅ 完整 | session-wrap-backend |
| Express | ✅ 完整 | session-wrap-backend |
| Pino 日志 | ✅ 完整 | Prompt Optimizer |
| SQLite | ✅ 开发指南 | Prompt Optimizer |

**覆盖的关键模式：**
- ✅ Web 应用架构（前后端分离）
- ✅ 数据库设计（Prisma + SQL）
- ✅ 速率限制（双策略实现）
- ✅ 异步任务（Job Queue）
- ✅ 认证与授权（RBAC）
- ✅ 日志与监控（结构化日志）
- ✅ 错误处理（标准化）
- ✅ API 设计（RESTful）
- ✅ 部署检查清单（完整）

---

## 🚀 快速导航

| 需求 | 文件 | 章节 | 耗时 |
|------|------|------|------|
| 5 分钟快速开始 | QUICK_REFERENCE.md | 全部 | 5m |
| 项目文件结构 | QUICK_REFERENCE.md | 第 1 节 | 2m |
| Prisma 数据库设计 | ARCHITECTURE_PATTERNS.md | 2 章 | 10m |
| API 速率限制 | QUICK_REFERENCE.md | 速率限制 | 3m |
| Job Queue 实现 | QUICK_REFERENCE.md | Job Queue | 5m |
| React 组件模板 | QUICK_REFERENCE.md | React 组件 | 3m |
| 完整架构学习 | ARCHITECTURE_PATTERNS.md | 全部 | 45m |
| 部署前检查 | QUICK_REFERENCE.md | 预部署检查 | 5m |

---

## 📝 文档版本

| 文件 | 版本 | 更新日期 | 来源项目版本 |
|------|------|---------|-------------|
| README.md | 1.0 | 2026-04-14 | v1.0 |
| QUICK_REFERENCE.md | 1.0 | 2026-04-14 | v1.0 |
| ARCHITECTURE_PATTERNS.md | 1.0 | 2026-04-14 | v1.0 |
| INDEX.md | 1.0 | 2026-04-14 | v1.0 |

**基础项目版本：**
- Prompt Optimizer：v0.2.0 (2026-04-13)
- session-wrap-backend：v3.10.0 (2026-04-13)

---

## 💡 使用建议

### 第一次使用
1. 读 README.md（了解概况）
2. 看 QUICK_REFERENCE.md（速查代码）
3. 基于模板初始化项目

### 需要深入学习
1. 选择相关章节从 ARCHITECTURE_PATTERNS.md 读取
2. 对照源项目代码理解实现
3. 自己写个小项目练习

### 在生产中使用
1. 参考部署检查清单（第 8 章）
2. 使用源项目的完整部署文档
3. 监控和日志配置（第 7 章）

---

**最后更新：** 2026-04-14  
**维护者：** Claude Code  
**状态：** 生产就绪
