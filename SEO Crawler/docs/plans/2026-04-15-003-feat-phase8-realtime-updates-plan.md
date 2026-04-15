---
date: 2026-04-15
topic: feat-phase8-realtime-updates
type: feat
status: draft
---

# SEO Crawler Phase 8 — 实时更新与推送系统

## Overview

此计划实现SEO Crawler的第8阶段：**实时数据推送与分析反馈系统**。目标是为用户提供关键词任务的实时进度更新、LLM 驱动的智能分析建议、以及动态数据更新能力。

**规模**：6个实现单元，3个阶段  
**预期工期**：1-2周  
**依赖**：Phase 4 数据洞察已完成

---

## System-Wide Decisions

| 决策 | 选项 | 原因 |
|------|------|------|
| **实时通信** | Server-Sent Events (SSE) | 单向推送足够，不需双向通信开销 |
| **LLM 集成** | Claude API (streaming) | 成本低，响应快，支持流式输出 |
| **推送内容** | 任务进度、分析建议、异常告警 | 保持轻量级，避免信息过载 |
| **缓存策略** | Redis (可选，开发环境内存) | 支持消息队列和状态同步 |
| **前端更新** | React hooks + custom SSE client | 最小依赖，原生SSE支持 |

---

## Implementation Units

### Phase 8.1: 后端实时推送基础设施

#### 8.1.1 SSE 端点与连接管理

**Goal**  
实现 `/api/jobs/:id/subscribe` SSE 端点，支持客户端实时接收任务进度更新。

**Files**  
- `backend/src/routes/realtime.ts` (新建, ~150 LOC)
- `backend/src/services/sseManager.ts` (新建, ~200 LOC)
- `backend/tests/realtime.test.ts` (新建, ~100 LOC)

**Approach**  
1. 创建 SSEManager 类管理活跃连接池
   - 连接存储：Map<jobId, Set<Response>>
   - 生命周期：连接时 add，断开时 remove，任务完成时广播
2. 实现 `/api/jobs/:id/subscribe` 端点
   - 验证 jobId 存在
   - 发送初始状态消息
   - 设置 3s 心跳保活
   - 监听任务状态变化，推送更新
3. 消息格式：`{ type: 'progress'|'complete'|'error', jobId, data: {...} }`

**Patterns to follow**  
- 参考现有的 Express 路由定义
- 使用标准 Express Response 的 SSE 方法

**Test scenarios**  
- 单个连接：连接建立、心跳、断开
- 多个连接：同一任务多个客户端
- 连接超时：1分钟无心跳自动断开
- 任务完成：广播到所有监听连接
- 错误处理：无效 jobId、网络中断

**Verification**  
- [ ] 连接建立立即返回初始状态
- [ ] 3s 心跳正常发送
- [ ] 任务状态变化实时推送
- [ ] 多客户端同时监听无干扰

---

#### 8.1.2 任务状态变化事件系统

**Goal**  
实现事件发射系统，当任务状态变化时触发推送。

**Files**  
- `backend/src/services/eventBus.ts` (新建, ~120 LOC)
- `backend/src/services/jobStatusWatcher.ts` (新建, ~150 LOC)

**Approach**  
1. 创建 EventBus 单例
   - on(event, callback) / off / emit
   - 支持事件：job:created, job:started, job:progress, job:completed, job:failed
2. JobStatusWatcher 定期轮询任务状态
   - 间隔：1s（可配置）
   - 检测状态变化并 emit 对应事件
   - 事件载荷：{ jobId, oldStatus, newStatus, timestamp, resultCount }
3. SSEManager 订阅事件并向客户端推送

**Patterns to follow**  
- 标准 Node.js EventEmitter 模式

**Test scenarios**  
- 事件订阅与取消订阅
- 多监听器同时处理
- 事件载荷准确性
- 高频事件处理（轮询1000个任务）

**Verification**  
- [ ] 事件发射准确
- [ ] 监听器接收回调
- [ ] 取消订阅生效

---

### Phase 8.2: LLM 实时分析建议

#### 8.2.1 Claude API 流式集成

**Goal**  
集成 Claude API 流式接口，为用户提供实时的智能分析建议。

**Files**  
- `backend/src/services/analysisService.ts` (新建, ~250 LOC)
- `backend/src/routes/api/analysis.ts` (新建, ~100 LOC)
- `backend/tests/analysisService.test.ts` (新建, ~80 LOC)

**Approach**  
1. 创建 AnalysisService
   - 接收 jobId、结果集、分析类型（difficulty_insights / roi_opportunities / competitor_gaps）
   - 构建 prompt：关键词总结 + 数据特征 + 分析指示
   - 调用 Claude API streaming 模式
   - 返回 async generator：yield 每个流式 token
2. 创建 `/api/jobs/:id/analysis/:type` 端点
   - 支持 Accept: text/event-stream
   - 通过 SSE 流式返回分析结果
   - 支持客户端中断（关闭连接）

**Approach Detail - Prompt Design**  
- 分析类型 1（difficulty_insights）：为什么这些词难度高？推荐的简化策略？
- 分析类型 2（roi_opportunities）：高ROI词的共同特征？如何扩展这个空间？
- 分析类型 3（competitor_gaps）：竞争对手的内容策略？我们的差异点？

**Patterns to follow**  
- 参考现有 API 端点的错误处理
- 使用标准 SSE 格式

**Test scenarios**  
- 流式响应格式正确
- token 逐个返回
- 客户端断开连接处理
- API key 验证（环境变量）
- 网络超时（30s）

**Verification**  
- [ ] Claude API 集成工作
- [ ] 流式 token 正常返回
- [ ] 分析质量符合预期
- [ ] 性能：首个 token < 500ms

---

#### 8.2.2 分析结果缓存与记录

**Goal**  
缓存分析结果，支持用户重新查看，减少 API 调用成本。

**Files**  
- `backend/src/services/analysisCache.ts` (新建, ~100 LOC)
- 数据库迁移：添加 job_analyses 表

**Approach**  
1. 添加数据库表
   ```sql
   CREATE TABLE job_analyses (
     id BIGINT PRIMARY KEY,
     job_id BIGINT NOT NULL,
     analysis_type VARCHAR(50),
     content TEXT,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY (job_id) REFERENCES jobs(id)
   );
   ```
2. 分析完成后保存到 job_analyses
3. 提供 GET `/api/jobs/:id/analysis/:type` 直接返回缓存

**Verification**  
- [ ] 分析结果保存正确
- [ ] 缓存命中减少 API 调用
- [ ] 查询性能 < 100ms

---

### Phase 8.3: 前端实时 UI 更新

#### 8.3.1 SSE 客户端与 React 集成

**Goal**  
实现前端 SSE 客户端，与后端 SSE 端点连接，实时更新 UI。

**Files**  
- `frontend/src/hooks/useRealtime.ts` (新建, ~150 LOC)
- `frontend/src/components/JobRealtimeStatus.tsx` (新建, ~200 LOC)
- `frontend/pages/jobs/[id].tsx` (修改)

**Approach**  
1. 创建 `useRealtime` hook
   - 初始化：连接 `/api/jobs/:id/subscribe`
   - 消息处理：parse 事件，更新本地状态
   - 清理：disconnect on unmount
   - 错误处理：重连策略（exponential backoff）
2. JobRealtimeStatus 组件
   - 显示任务进度条（waiting → running → completed）
   - 实时显示结果计数器
   - 预估完成时间（基于进度速率）
3. 修改 [id].tsx
   - 用 useRealtime 替代轮询
   - 结果表格实时更新

**Patterns to follow**  
- 参考现有的 useEffect + state 模式
- 使用标准 EventSource API

**Test scenarios**  
- 连接建立、状态更新、断开
- 多个并发连接
- 网络中断与重连
- 性能：100+ 连接下无明显 UI 卡顿

**Verification**  
- [ ] 实时状态更新显示
- [ ] 进度条平滑动画
- [ ] 网络中断自动重连

---

#### 8.3.2 分析建议流式显示

**Goal**  
实现分析建议的流式显示 UI，用户可以看到 Claude 的分析逐步生成。

**Files**  
- `frontend/src/components/AnalysisStreaming.tsx` (新建, ~250 LOC)
- `frontend/pages/jobs/[id].tsx` (修改)

**Approach**  
1. AnalysisStreaming 组件
   - 接收 jobId、analysisType 作为 props
   - 调用 `/api/jobs/:id/analysis/:type`（Accept: text/event-stream）
   - 逐行接收 SSE 数据，实时更新显示
   - 支持"停止分析"按钮（abort fetch）
2. 显示效果
   - Markdown 格式化（用 react-markdown）
   - 加载指示（骨架屏 → 内容流入）
   - 错误处理（显示重试按钮）

**Patterns to follow**  
- 参考现有组件的 error/loading 状态
- 使用 Markdown 渲染库

**Test scenarios**  
- 流式接收与渲染
- 中途断开处理
- Markdown 格式正确
- 长文本滚动

**Verification**  
- [ ] 分析建议实时显示
- [ ] 支持停止
- [ ] 格式化正确

---

## File Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── realtime.ts         (NEW)
│   │   └── api/
│   │       └── analysis.ts     (NEW)
│   └── services/
│       ├── sseManager.ts       (NEW)
│       ├── eventBus.ts         (NEW)
│       ├── jobStatusWatcher.ts (NEW)
│       ├── analysisService.ts  (NEW)
│       └── analysisCache.ts    (NEW)
├── tests/
│   ├── realtime.test.ts        (NEW)
│   ├── analysisService.test.ts (NEW)
│   └── ...

frontend/
├── src/
│   ├── hooks/
│   │   └── useRealtime.ts      (NEW)
│   └── components/
│       ├── JobRealtimeStatus.tsx    (NEW)
│       └── AnalysisStreaming.tsx    (NEW)
└── pages/
    └── jobs/
        └── [id].tsx            (MODIFY)
```

---

## Success Criteria

- [ ] 任务进度实时更新（延迟 < 1s）
- [ ] Claude 分析流式生成（首 token < 500ms）
- [ ] 前端 UI 实时同步，无跳变
- [ ] 支持 100+ 并发连接
- [ ] 分析结果缓存有效，减少成本 50%+
- [ ] 网络中断自动重连，用户无感
- [ ] 所有单元测试通过 (90%+ 覆盖率)

---

## Next Steps

1. **Phase 8.1** → 后端 SSE 基础架构
2. **Phase 8.2** → Claude API 集成  
3. **Phase 8.3** → 前端实时 UI
4. **验收** → 本地端到端测试
5. **发布** → 合并到 main，准备 Phase 9

---

## Dependencies & Risks

| 项目 | 说明 |
|------|------|
| Claude API Key | 需要在 .env 中配置 |
| Redis（可选） | 开发可用内存队列代替 |
| 网络稳定性 | SSE 依赖持久连接 |

**Risk Mitigation**  
- 实现自动重连机制（exponential backoff）
- 分析结果本地缓存，即使 API 失败也可查看
- 可降级为轮询（如 SSE 不可用）
