# Phase 4: 审计日志和监控规划

**项目:** SEO TDK Optimizer  
**阶段:** Phase 4 (Audit Logging & Monitoring)  
**状态:** 规划中  
**优先级:** P1 (安全相关)  

---

## 目标

在 Phase 3 RBAC 的基础上，添加完整的审计日志和实时监控，以:
- 追踪所有权限相关事件
- 检测异常活动
- 满足安全和合规要求
- 支持安全事件响应

---

## 范围

### 包含项目

- [x] 审计日志数据模型
- [x] 日志记录中间件
- [x] 日志查询 API
- [x] 监控仪表板
- [x] 告警规则
- [x] 日志导出

### 不包含项目

- [ ] 外部日志收集 (ELK, Splunk)
- [ ] 自动化响应系统
- [ ] 机器学习异常检测
- [ ] 长期日志存储档案

---

## Implementation Units

### P4.1: 审计日志数据模型 & 迁移

**目标:** 定义审计日志的数据结构

**文件:**
- `backend/src/db/schema.ts` - 添加 `audit_logs` 表
- `backend/src/db/migrations/0003_add_audit_logs.sql`

**表结构:**
```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id TEXT,
  project_id TEXT,
  status INTEGER,
  result TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  request_headers JSON,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_project ON audit_logs(project_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
```

**测试场景:**
1. 创建审计日志记录
2. 查询特定用户的日志
3. 按日期范围查询
4. 按操作类型查询
5. 级联删除用户时保留日志

**验证:**
- 20+ 单元测试
- 外键约束检查
- 索引性能验证

---

### P4.2: 日志记录中间件

**目标:** 自动记录所有权限相关事件

**文件:**
- `backend/src/middleware/auditLog.ts` - 日志记录中间件
- `backend/src/services/audit/auditService.ts` - 日志服务

**功能:**

```typescript
// 自动记录的事件:
- 所有 403 (权限拒绝)
- 所有 401 (未认证)
- 所有成功的 API 调用 (生成 TDK, 保存等)
- 所有 Admin 操作 (创建用户, 分配项目等)
- 所有数据修改操作

// 记录信息:
- 用户 ID
- 操作名称
- 资源类型和 ID
- 项目 ID
- HTTP 状态码
- IP 地址
- User-Agent
- 请求头 (部分)
- 错误代码 (如有)
- 错误消息 (如有)
- 时间戳
```

**集成点:**

```typescript
// 1. 在 auth 中间件中捕获:
app.use(auditLogMiddleware);  // 最前面

// 2. 在 permission 中间件中记录拒绝:
if (!hasPermission) {
  auditService.logDenied({ userId, action, projectId });
}

// 3. 在路由处理器中记录成功:
auditService.logSuccess({ userId, action, resourceId });
```

**测试场景:**
1. 记录成功操作
2. 记录权限拒绝
3. 记录认证失败
4. 记录 Admin 操作
5. 验证日志内容完整性
6. 性能: < 5ms 开销

---

### P4.3: 日志查询 API

**目标:** 提供 API 查询审计日志

**端点:**

```typescript
GET /api/audit/logs
  查询参数:
    - user_id?: 过滤用户
    - action?: 过滤操作 (generate_tdk, save_tdk, create_user, etc)
    - project_id?: 过滤项目
    - start_date?: 开始日期 (ISO 8601)
    - end_date?: 结束日期
    - status?: 过滤状态 (success, denied, error)
    - limit?: 分页 (默认 100, 最大 1000)
    - offset?: 分页偏移
  
  响应:
    {
      total: number,
      logs: [
        {
          id: number,
          user_id: string,
          action: string,
          resource_type: string,
          status: number,
          created_at: timestamp,
          ...
        }
      ]
    }

GET /api/audit/logs/:id
  获取单条日志详情 (包含完整的 headers 和请求体)

GET /api/audit/stats
  获取统计信息:
    - 过去 24 小时的操作数
    - 过去 7 天的拒绝数
    - 最活跃的用户
    - 最常见的操作
    - 错误率趋势

GET /api/audit/export
  导出日志 (CSV 或 JSON)
```

**权限:**
- Admin: 可查询所有日志
- ProjectOwner: 可查询自己项目的日志
- Editor: 可查询自己的操作日志
- Viewer: 无访问权限

**测试场景:**
1. 基本查询 (所有日志)
2. 按用户过滤
3. 按操作过滤
4. 日期范围过滤
5. 分页查询
6. 权限验证 (ProjectOwner 只能看自己项目)
7. 导出功能

---

### P4.4: 监控仪表板

**目标:** 可视化审计日志和监控指标

**文件:**
- `frontend/src/pages/AuditDashboard.tsx` - 仪表板主页
- `frontend/src/components/AuditLogsTable.tsx` - 日志表格
- `frontend/src/components/AuditStats.tsx` - 统计卡片
- `frontend/src/hooks/useAuditLogs.ts` - Hook

**功能:**

```typescript
// 仪表板布局:
┌─────────────────────────────────────┐
│  审计日志仪表板                      │
├──────────┬──────────┬──────────┬──┐ │
│ 过去24h  │ 过去7天  │ 拒绝数  │📊 │
│ 操作: 234│ 操作:1.5K│  45    │  │
├─────────────────────────────────┤ │
│ 最常见操作:  生成 TDK (156) ...  │ │
│ 最活跃用户:  alice@... (34) ...  │ │
├─────────────────────────────────┤ │
│ 日志过滤 [用户] [操作] [项目] [日期]│
├─────────────────────────────────┤ │
│ 日志表格 (实时, 自动刷新)        │ │
│ ID │时间│用户│操作│资源│状态│详情│
│  1 │... │... │... │... │ ✓  │ ...│
│  2 │... │... │... │... │ ✗  │ ...│
└─────────────────────────────────┘ │
```

**实时刷新:**
- 自动刷新间隔: 30 秒
- 支持实时 WebSocket (可选 Phase 5)
- 新日志自动添加到表格顶部

**导出功能:**
- CSV 导出
- JSON 导出
- PDF 报告

**测试场景:**
1. 加载仪表板
2. 实时刷新工作
3. 过滤和搜索
4. 导出功能
5. 权限验证
6. 性能: < 2s 加载时间

---

### P4.5: 告警规则

**目标:** 定义和执行告警条件

**文件:**
- `backend/src/services/audit/alertRules.ts`
- `backend/src/services/audit/alertService.ts`

**预定义规则:**

| 规则 | 条件 | 严重程度 | 动作 |
|------|------|---------|------|
| 高拒绝率 | 1 小时内拒绝数 > 10 | 🟡 中 | 通知 Admin |
| 暴力破解 | 同用户 5 分钟内认证失败 > 3 | 🔴 高 | 锁定 + 通知 |
| 异常访问 | 用户 24h 内访问 > 5 个新项目 | 🟡 中 | 记录 + 通知 |
| 大量导出 | 1 小时内导出 > 10 次 | 🟡 中 | 通知 Admin |
| 权限提升 | 用户角色改为 Admin | 🔴 高 | 即时通知 |

**通知方式:**
- 邮件通知 (Admin)
- Slack 集成 (可选)
- 仪表板警告横幅

**测试场景:**
1. 手动触发规则条件
2. 验证通知发送
3. 规则参数灵活性
4. 误报最小化

---

### P4.6: 日志导出和报告

**目标:** 支持各种导出格式和定期报告

**文件:**
- `backend/src/services/audit/exportService.ts`
- `backend/src/api/audit.ts` - 导出端点

**导出格式:**

1. **CSV** (Excel 兼容)
   ```
   ID,Time,User,Action,Resource,Status,Details
   1,2026-04-15T10:30:00Z,alice@...,generate_tdk,cluster123,success,...
   ```

2. **JSON** (结构化)
   ```json
   [
     {
       "id": 1,
       "timestamp": "2026-04-15T10:30:00Z",
       "user_id": "user123",
       "action": "generate_tdk",
       ...
     }
   ]
   ```

3. **PDF 报告** (摘要)
   - 日期范围摘要
   - 操作统计
   - 拒绝排行
   - 用户活动排行

**定期报告:**
- 每日摘要 (邮件)
- 每周详细报告 (PDF)
- 每月合规报告

**测试场景:**
1. 导出 CSV
2. 导出 JSON
3. 生成 PDF
4. 定期报告调度
5. 大数据集导出性能

---

## 实现顺序

### Week 1
- P4.1: 数据模型和迁移 (1 天)
- P4.2: 日志中间件 (1.5 天)
- P4.3: 查询 API (1 天)

### Week 2
- P4.4: 仪表板 (1.5 天)
- P4.5: 告警规则 (1 天)
- P4.6: 导出和报告 (1.5 天)

### Week 3
- 集成测试 (1 天)
- 性能优化 (1 天)
- 文档和验收 (1 天)

---

## 测试策略

### 单元测试 (85 个)
- 数据模型: 20 个
- 日志服务: 25 个
- 查询 API: 15 个
- 告警规则: 15 个
- 导出服务: 10 个

### 集成测试 (25 个)
- 完整的操作流程
- 权限验证
- 性能基准

### 端到端测试 (10 个)
- 仪表板功能
- 导出工作流

**目标:** 120+ 测试, 100% 通过率

---

## 性能要求

| 操作 | 目标 | 优先级 |
|------|------|--------|
| 日志记录开销 | < 5ms | P1 |
| 查询 API 响应 | < 500ms | P1 |
| 仪表板加载 | < 2s | P2 |
| 导出 10K 日志 | < 5s | P2 |
| 告警检查 | < 100ms | P1 |

---

## 安全考虑

- ✅ 日志数据不包含敏感信息 (密码, tokens)
- ✅ 日志访问受 RBAC 保护
- ✅ 日志数据加密 (可选)
- ✅ 日志导出记录
- ✅ 日志保留策略 (90 天默认)
- ✅ 日志不可修改 (append-only)

---

## 成功标准

- [x] 所有 120+ 测试通过
- [x] 性能要求达成
- [x] 完整的 API 文档
- [x] 仪表板功能完整
- [x] 告警规则工作
- [x] 导出功能测试
- [x] 零安全问题

---

## 风险和缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 日志表过大 | 查询变慢 | 索引 + 日志保留 |
| 日志泄露 | 安全问题 | 访问控制 + 加密 |
| 告警风暴 | 通知疲劳 | 规则去重 + 阈值 |
| 性能下降 | 用户体验 | 异步日志 + 批处理 |

---

## 预计工作量

| 单元 | 天数 | FTE |
|------|------|-----|
| P4.1 | 1 | 1 |
| P4.2 | 1.5 | 1 |
| P4.3 | 1 | 1 |
| P4.4 | 1.5 | 1 |
| P4.5 | 1 | 1 |
| P4.6 | 1.5 | 1 |
| **总计** | **7.5 天** | **1 人** |

**假设:** 无外部依赖，标准的开发环境

---

## 文档交付

- 【待】P4 实现规划 (本文档)
- 【待】API 文档
- 【待】仪表板使用指南
- 【待】告警规则配置
- 【待】数据导出指南

---

## 下一阶段 (Phase 5)

- **速率限制** - 登录/API 频率限制
- **WebSocket 日志** - 实时日志推送
- **日志分析** - 高级查询和报告
- **合规性** - GDPR/HIPAA 支持

---

## 批准

- [ ] 产品负责人
- [ ] 技术负责人
- [ ] 安全负责人
- [ ] 运维负责人

---

**准备日期:** 2026-04-15  
**计划开始:** 2026-04-22 (Phase 3 推送后)  
**预计完成:** 2026-05-06

