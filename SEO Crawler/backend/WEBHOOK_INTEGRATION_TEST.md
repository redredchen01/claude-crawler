# Webhook Integration Test - Phase 8 P6

## 测试环境启动

### 步骤 1: 启动后端服务器

```bash
cd "/Users/dex/YD 2026/SEO Crawler"
node backend/dist/index.js
```

**预期输出：**
```
[WebhookRouter] Initialized and started
[JobStatusWatcher] Initialized and started
✅ Server running on http://localhost:3001
```

## 集成测试场景

### 场景 1: 创建 Webhook 监听任务完成

**请求：**
```bash
curl -X POST http://localhost:3001/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.site/unique-id",
    "events": ["job:completed"],
    "filters": {
      "minResultCount": 0
    }
  }'
```

**预期响应：**
```json
{
  "id": "webhook-1",
  "url": "https://webhook.site/unique-id",
  "events": ["job:completed"],
  "filters": { "minResultCount": 0 },
  "enabled": true,
  "createdAt": "2026-04-15T10:30:00.000Z"
}
```

### 场景 2: 列表所有 Webhooks

**请求：**
```bash
curl http://localhost:3001/api/webhooks
```

**预期响应：**
```json
{
  "webhooks": [
    {
      "id": "webhook-1",
      "url": "https://webhook.site/unique-id",
      "events": ["job:completed"],
      "filters": { "minResultCount": 0 },
      "enabled": true,
      "createdAt": "2026-04-15T10:30:00.000Z"
    }
  ]
}
```

### 场景 3: 获取单个 Webhook 详情

**请求：**
```bash
curl http://localhost:3001/api/webhooks/webhook-1
```

**预期响应：**
```json
{
  "id": "webhook-1",
  "url": "https://webhook.site/unique-id",
  "events": ["job:completed"],
  "filters": { "minResultCount": 0 },
  "enabled": true,
  "createdAt": "2026-04-15T10:30:00.000Z",
  "deliveries": 0
}
```

### 场景 4: 更新 Webhook

**请求：**
```bash
curl -X PATCH http://localhost:3001/api/webhooks/webhook-1 \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false
  }'
```

**预期响应：**
```json
{
  "id": "webhook-1",
  "url": "https://webhook.site/unique-id",
  "events": ["job:completed"],
  "filters": { "minResultCount": 0 },
  "enabled": false,
  "createdAt": "2026-04-15T10:30:00.000Z"
}
```

### 场景 5: 创建多个 Webhooks

**请求 1 - 监听任务失败：**
```bash
curl -X POST http://localhost:3001/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.site/failure-webhook",
    "events": ["job:failed"],
    "filters": {}
  }'
```

**请求 2 - 监听任务开始：**
```bash
curl -X POST http://localhost:3001/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.site/start-webhook",
    "events": ["job:started"],
    "filters": {}
  }'
```

### 场景 6: 模拟任务事件（通过修改内存数据库）

在 backend-real.js 中，可以直接修改 db.jobs 来模拟任务状态变化：

```javascript
// 将任务状态从 "running" 改为 "completed"
db.jobs.get("job-002").status = "completed";
db.jobs.get("job-002").finished_at = Date.now();
db.jobs.get("job-002").result_count = 42;
```

此时 EventBus 会触发事件，WebhookRouter 会匹配相应的 webhooks 并发送投递请求。

### 场景 7: 获取投递历史

**请求：**
```bash
curl http://localhost:3001/api/webhooks/webhook-1/attempts
```

**预期响应（如果有投递）：**
```json
{
  "webhookId": "webhook-1",
  "attempts": [
    {
      "timestamp": "2026-04-15T10:31:00.000Z",
      "attempt": 1,
      "status": "failed",
      "error": "getaddrinfo ENOTFOUND webhook.site"
    }
  ]
}
```

**说明：** 由于 https://webhook.site 是真实 URL，实际投递可能失败或成功取决于网络连接。

### 场景 8: 获取全局统计

**请求：**
```bash
curl http://localhost:3001/api/webhooks/stats/global
```

**预期响应：**
```json
{
  "totalWebhooks": 2,
  "totalAttempts": 1,
  "successAttempts": 0,
  "failedAttempts": 1,
  "successRate": 0
}
```

### 场景 9: 删除 Webhook

**请求：**
```bash
curl -X DELETE http://localhost:3001/api/webhooks/webhook-1
```

**预期响应：**
```json
{
  "deleted": true,
  "id": "webhook-1"
}
```

**验证删除：**
```bash
curl http://localhost:3001/api/webhooks/webhook-1
```

**预期：404 错误**
```json
{
  "error": "Webhook not found"
}
```

## 关键验证点

✅ WebhookRouter 启动时被初始化  
✅ API 端点都能正确响应  
✅ CRUD 操作正常工作  
✅ 过滤规则生效  
✅ 投递历史被正确记录  
✅ 统计信息准确  
✅ 已删除的 webhook 无法访问  

## 故障排除

### 问题：WebhookRouter 未启动

**检查：** 查看启动日志是否包含 `[WebhookRouter] Initialized and started`

**解决：** 确保 backend/dist/index.js 正确导入了 WebhookRouter

### 问题：API 返回 404

**检查：** 确保 POST 请求包含 `Content-Type: application/json`

**检查：** 确保 webhook ID 正确（从创建响应中复制）

### 问题：投递失败

**检查：** 查看投递历史了解具体错误信息

**常见原因：**
- 网络连接问题
- webhook URL 无效
- 外部服务返回非 2xx 状态码

## 性能验证

### 单位测试（已通过）

```bash
node backend/dist/webhookService.test.js
```

**结果：** ✅ 16/16 tests passed

## 生产检查清单

- [ ] 修改 webhookService.js 中的超时时间（当前 5 秒）
- [ ] 添加签名验证（HMAC-SHA256）
- [ ] 实现持久化存储（替换内存 Map）
- [ ] 添加 webhook 投递队列和工作进程池
- [ ] 实现 webhook 节流和速率限制
- [ ] 添加死信队列处理持续失败的投递
- [ ] 监控和告警集成

---

**Status:** ✅ Integration Test Ready  
**Version:** Phase 8 P6  
**Last Updated:** 2026-04-15
