/**
 * WebhookRouter - 事件路由与 Webhook 分发
 *
 * 功能：
 * - 监听 EventBus 所有任务事件
 * - 查询和过滤相关 webhooks
 * - 触发 webhook 投递
 * - 处理投递失败和日志
 */

class WebhookRouter {
  constructor(eventBus, webhookService) {
    this.eventBus = eventBus;
    this.webhookService = webhookService;
    this.running = false;
    this.eventNames = [
      "job:created",
      "job:started",
      "job:progress",
      "job:completed",
      "job:failed",
      "job:status_changed",
    ];
  }

  /**
   * 启动事件监听
   */
  start() {
    if (this.running) {
      console.warn("[WebhookRouter] Already running");
      return;
    }

    this.running = true;
    console.log("[WebhookRouter] Started, listening to EventBus");

    // 订阅所有任务事件
    for (const eventName of this.eventNames) {
      this.eventBus.on(eventName, (eventData) => {
        this.onJobEvent(eventName, eventData).catch((err) => {
          console.error(`[WebhookRouter] Error handling ${eventName}:`, err);
        });
      });
    }
  }

  /**
   * 停止事件监听
   */
  stop() {
    if (!this.running) return;

    this.running = false;
    console.log("[WebhookRouter] Stopped");

    // 取消订阅（实际上需要 eventBus.off() 方法，这里仅作记录）
    // 注：当前 EventBus 实现不提供自动清理订阅的方式
  }

  /**
   * 处理任务事件
   * @param {string} eventName - 事件名称，如 "job:completed"
   * @param {Object} eventData - 事件数据
   */
  async onJobEvent(eventName, eventData) {
    // 查找匹配的 webhooks
    const matchingWebhooks = this.findMatchingWebhooks(eventName, eventData);

    if (matchingWebhooks.length === 0) {
      // 没有匹配的 webhooks，无需操作
      return;
    }

    console.log(
      `[WebhookRouter] Found ${matchingWebhooks.length} matching webhook(s) for ${eventName}`,
    );

    // 并发投递所有匹配的 webhooks
    const promises = matchingWebhooks.map((webhook) =>
      this.deliverToWebhook(webhook.id, eventName, eventData),
    );

    await Promise.allSettled(promises);
  }

  /**
   * 查找匹配的 webhooks
   * @returns {Object[]} 匹配的 webhook 配置数组
   */
  findMatchingWebhooks(eventName, eventData) {
    const allWebhooks = this.webhookService.listWebhooks();
    const matchingWebhooks = [];

    for (const webhook of allWebhooks) {
      if (this.webhookService.shouldTrigger(webhook, eventName, eventData)) {
        matchingWebhooks.push(webhook);
      }
    }

    return matchingWebhooks;
  }

  /**
   * 投递单个 webhook
   * @private
   */
  async deliverToWebhook(webhookId, eventName, eventData) {
    try {
      const enrichedData = {
        ...eventData,
        type: eventName,
      };

      const result = await this.webhookService.deliverWebhook(
        webhookId,
        enrichedData,
      );

      if (result.success) {
        console.log(
          `[WebhookRouter] Successfully delivered webhook ${webhookId} (HTTP ${result.statusCode})`,
        );
      } else {
        console.error(
          `[WebhookRouter] Failed to deliver webhook ${webhookId}: ${result.error}`,
        );
      }
    } catch (err) {
      console.error(
        `[WebhookRouter] Error delivering webhook ${webhookId}:`,
        err,
      );
    }
  }

  /**
   * 获取路由统计
   */
  getStats() {
    return {
      running: this.running,
      listeningTo: this.eventNames,
      webhookService: this.webhookService.getStats(),
    };
  }
}

export default WebhookRouter;
//# sourceMappingURL=webhookRouter.js.map
