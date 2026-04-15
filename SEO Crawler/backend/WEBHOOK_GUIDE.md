# Webhook Guide - SEO Crawler Phase 8 P6

## 概述

Webhook 系统允许外部应用订阅 SEO Crawler 的事件（如任务完成、任务失败等），并在这些事件发生时接收 HTTP POST 请求。

## 支持的事件

- `job:created` - 任务被创建
- `job:started` - 任务开始执行
- `job:progress` - 任务进度更新
- `job:completed` - 任务完成
- `job:failed` - 任务失败
- `job:status_changed` - 任务状态变化（通用事件）

## Webhook Payload 格式

当事件触发 webhook 时，POST 请求包含以下格式的 JSON：

```json
{
  "webhookId": "webhook-1",
  "eventName": "job:completed",
  "timestamp": "2026-04-15T10:30:00.000Z",
  "data": {
    "jobId": "job-001",
    "newStatus": "completed",
    "oldStatus": "running",
    "resultCount": 42,
    "timestamp": "2026-04-15T10:30:00.000Z",
    "job": {
      "id": "job-001",
      "seed": "seo optimization",
      "status": "completed",
      "created_at": 1713174600000,
      "finished_at": 1713174900000
    }
  }
}
```

## 过滤规则

Webhook 可以使用过滤规则来只在特定条件下触发。

### 支持的过滤条件

| 条件 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `minResultCount` | number | 最小结果数 | `{ minResultCount: 10 }` |
| `maxResultCount` | number | 最大结果数 | `{ maxResultCount: 100 }` |
| `statuses` | string[] | 指定的任务状态 | `{ statuses: ["completed", "failed"] }` |
| `sources` | string[] | 指定的搜索源 | `{ sources: ["google", "bing"] }` |
| `seedKeyword` | string | 种子关键词包含 | `{ seedKeyword: "seo" }` |

## API 文档

### 创建 Webhook

**请求**

```bash
curl -X POST http://localhost:3001/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/seo-crawler",
    "events": ["job:completed", "job:failed"],
    "filters": {
      "minResultCount": 5
    }
  }'
```

**响应**

```json
{
  "id": "webhook-1",
  "url": "https://example.com/webhooks/seo-crawler",
  "events": ["job:completed", "job:failed"],
  "filters": {
    "minResultCount": 5
  },
  "enabled": true,
  "createdAt": "2026-04-15T10:30:00.000Z"
}
```

### 列表 Webhooks

```bash
curl http://localhost:3001/api/webhooks
```

### 获取单个 Webhook

```bash
curl http://localhost:3001/api/webhooks/webhook-1
```

### 更新 Webhook

```bash
curl -X PATCH http://localhost:3001/api/webhooks/webhook-1 \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false
  }'
```

### 删除 Webhook

```bash
curl -X DELETE http://localhost:3001/api/webhooks/webhook-1
```

### 获取投递历史

```bash
curl http://localhost:3001/api/webhooks/webhook-1/attempts
```

**响应**

```json
{
  "webhookId": "webhook-1",
  "attempts": [
    {
      "timestamp": "2026-04-15T10:30:00.000Z",
      "attempt": 1,
      "status": "success",
      "statusCode": 200
    },
    {
      "timestamp": "2026-04-15T10:31:00.000Z",
      "attempt": 1,
      "status": "failed",
      "error": "Connection timeout"
    }
  ]
}
```

### 获取全局统计

```bash
curl http://localhost:3001/api/webhooks/stats/global
```

**响应**

```json
{
  "totalWebhooks": 3,
  "totalAttempts": 15,
  "successAttempts": 13,
  "failedAttempts": 2,
  "successRate": 86.67
}
```

## 使用场景

### 场景 1：任务完成时通知外部系统

创建一个 webhook 监听 `job:completed` 事件，触发时通知你的分析系统：

```bash
curl -X POST http://localhost:3001/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://analytics.example.com/seo-results",
    "events": ["job:completed"],
    "filters": {
      "minResultCount": 50
    }
  }'
```

### 场景 2：特定关键词的任务完成时告警

监听包含特定关键词的任务完成事件：

```bash
curl -X POST http://localhost:3001/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://alerts.example.com/seo",
    "events": ["job:completed"],
    "filters": {
      "seedKeyword": "competitor"
    }
  }'
```

### 场景 3：任务失败时自动重试

监听 `job:failed` 事件，触发你的重试逻辑：

```bash
curl -X POST http://localhost:3001/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://retry.example.com/jobs",
    "events": ["job:failed"]
  }'
```

## 重试策略

Webhook 投递失败时会自动重试，重试参数如下：

- **最大重试次数**：3 次
- **初始延迟**：1 秒
- **延迟策略**：指数退避（每次翻倍）
  - 第 1 次重试：1 秒后
  - 第 2 次重试：2 秒后
  - 第 3 次重试：4 秒后

## 成功状态码

HTTP 响应状态码 2xx (200-299) 被认为投递成功。其他状态码将触发重试。

## 最佳实践

1. **快速响应** - 你的 webhook 处理程序应该快速响应（< 5s），否则可能超时
2. **幂等处理** - 考虑到可能的重试，确保你的处理程序是幂等的
3. **验证签名** - 考虑在生产环境中添加签名验证
4. **监控投递** - 定期检查投递历史，确保 webhooks 正常工作
5. **错误日志** - 记录所有 webhook 失败，便于调试

## 监控和调试

检查投递历史来调试 webhook 问题：

```bash
# 获取特定 webhook 的投递历史
curl http://localhost:3001/api/webhooks/webhook-1/attempts

# 获取全局统计
curl http://localhost:3001/api/webhooks/stats/global
```

## 集成步骤

1. 启动后端：`node backend-real.js`
2. 创建 webhook：`curl -X POST http://localhost:3001/api/webhooks ...`
3. 创建 SEO Crawler 任务
4. 监控外部 webhook URL 接收请求
5. 检查投递历史验证

## 故障排除

### Webhook 未被触发

1. 检查 webhook 是否启用：`curl http://localhost:3001/api/webhooks/webhook-1`
2. 检查过滤规则是否与事件数据匹配
3. 检查投递历史查看是否有失败：`curl http://localhost:3001/api/webhooks/webhook-1/attempts`

### 投递失败

1. 确认 webhook URL 可访问
2. 检查防火墙/网络配置
3. 查看错误消息了解具体原因
4. 确认你的 webhook 处理程序返回 2xx 状态码

---

**Phase 8 P6 - Webhook Filtering & Routing**  
SEO Crawler Backend  
Version 1.0
