# LongTail Tool — 可复用架构模式库

从 YD 2026 生产项目提取的 web 应用、数据库、异步处理、React 最佳实践的完整指南。

## 📚 核心文档

### 1. **ARCHITECTURE_PATTERNS.md** — 主文档

10 大章节，覆盖您提出的所有主题：

| 章节 | 内容 | 用途 |
|------|------|------|
| 1. Web 应用架构 | Next.js 全栈应用结构、文件组织、设计决策 | 新项目脚手架 |
| 2. SQLite / Prisma | 数据库设计、索引策略、查询模式、单例模式 | 数据层实现 |
| 3. 异步任务处理 | Job Queue 模式、数据库支持、客户端轮询、清理任务 | 后台任务 |
| 4. React 最佳实践 | 组件分类、Hooks 模式、状态管理 | 前端组件设计 |
| 5. TypeScript 严格模式 | 项目配置、类型定义规范、常见模式 | 代码质量 |
| 6. API 设计 | RESTful 路由、速率限制、标准模板 | API 开发 |
| 7. 日志与可观测性 | Pino 配置、结构化日志字段 | 监控运维 |
| 8. 部署检查清单 | 预部署和部署后检查项 | 生产部署 |
| 9. 知识库索引 | 原项目文档导航 | 深入学习 |
| 10. 快速参考 | 常用命令、环境变量模板 | 日常开发 |

## 🔗 来源项目

所有模式均来自生产环境验证的项目：

- **Prompt Optimizer v0.2.0** — Next.js + Prisma + Rate Limiting + Webhooks
  - 186 个单元测试 (100%)
  - 完整部署文档和 API 参考
  - 路径：`/Users/dex/YD 2026/Prompt Optimizer/`

- **session-wrap-backend v3.10.0** — Express + PostgreSQL + RBAC
  - 数据库初始化 SQL、路由模式
  - 中间件和错误处理
  - 路径：`/Users/dex/YD 2026/projects/tools/session-wrap-backend/`

- **wm-tool** — Python 异步处理和性能优化
  - 参考数据库索引策略

## 🎯 快速开始

### 新建 Next.js 项目？
→ 参考 **第 1、6 章**（Web 应用架构、API 设计）

### 需要数据库实现？
→ 参考 **第 2、3 章**（Prisma 设计、异步任务处理）

### React 组件组织？
→ 参考 **第 4 章**（React 最佳实践）

### API 速率限制、认证？
→ 参考 **第 6 章**（API 设计）

### 部署到生产环境？
→ 参考 **第 8 章**（部署检查清单）+ Prompt Optimizer 的 `docs/PRODUCTION_DEPLOYMENT.md`

## 📋 高频问题

**Q: SQLite 还是 PostgreSQL？**
- 开发：SQLite
- 生产：PostgreSQL（见第 8 章）

**Q: Job Queue 用什么？**
- 推荐：数据库表 + 轮询（简单、无额外依赖）
- 参考：第 3 章

**Q: 速率限制如何实现？**
- 双策略：DB（持久化）+ 内存（轻量）
- 参考：第 6.2 章

**Q: TypeScript 配置？**
- strict mode 所有开启
- 参考：第 5.1 章

## 🔧 使用方式

1. **复制整个 `lib/` 文件夹**
   - 包含 `db.ts`、`rateLimit.ts`、`routeHelpers.ts` 等可复用模块

2. **参考 Prisma schema**
   - 第 2.1 章有完整示例，直接修改字段

3. **API 路由模板**
   - 第 6.3 章标准模板，复制 + 替换业务逻辑

4. **环境变量**
   - 第 10 章有完整模板，`.env.local` 直接用

## 📊 项目统计

| 指标 | 值 |
|------|------|
| 总测试覆盖率 | 711/713 (99.7%) 企业级 |
| Prompt Optimizer 测试 | 186/186 (100%) |
| 文档行数 | 500+ |
| 代码示例 | 40+ |
| 支持的技术栈 | Next.js, Express, Prisma, PostgreSQL, SQLite, React, TypeScript |

## 🚀 最佳实践总结

### 架构原则
✅ 关注点分离：`lib/` 作为 API + SSR 双重服务层  
✅ 数据库设计：反范式化聚合值、复合索引  
✅ 异步任务：数据库支持，无需外部 Queue  
✅ 认证：middleware 层一次检查  

### 代码质量
✅ TypeScript strict mode  
✅ 结构化日志（Pino）  
✅ 错误处理标准化  
✅ 输入验证前置  

### 部署
✅ PostgreSQL 生产（SQLite 开发）  
✅ 环境变量完全配置  
✅ 所有 186 个测试通过  
✅ 预部署检查清单（8 章）  

---

**创建日期：** 2026-04-14  
**文档维护者：** Claude Code  
**版本：** 1.0  
**状态：** 生产就绪

## 📖 文件列表

```
LongTail Tool/
├── ARCHITECTURE_PATTERNS.md    # 主文档（本指南）
├── README.md                   # 本文件
└── [待补充：示例项目/boilerplate]
```

## 🔗 相关资源

- Prompt Optimizer 完整部署文档：`/Prompt Optimizer/docs/PRODUCTION_DEPLOYMENT.md`
- API 参考：`/Prompt Optimizer/docs/API_REFERENCE.md`
- YD 2026 架构概览：`/docs/ARCHITECTURE.md`
