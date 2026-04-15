/**
 * WebhookService - Webhook 管理与投递
 *
 * 功能：
 * - 存储 webhook 配置（URL、事件类型、过滤规则）
 * - 过滤事件数据
 * - 异步投递 webhook（带重试）
 * - 跟踪投递历史
 */

import http from "http";
import https from "https";

class WebhookService {
  constructor() {
    this.webhooks = new Map(); // webhookId → config
    this.attempts = new Map(); // webhookId → attempts[]
    this.nextId = 1;
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
  }

  /**
   * 添加 webhook
   * @param {string} url - Webhook URL
   * @param {string[]} events - 订阅的事件列表，如 ["job:completed", "job:failed"]
   * @param {Object} filters - 过滤规则，如 { minResultCount: 10 }
   * @returns {string} webhookId
   */
  addWebhook(url, events, filters = {}) {
    const id = `webhook-${this.nextId++}`;
    const config = {
      id,
      url,
      events: Array.isArray(events) ? events : [events],
      filters,
      createdAt: new Date().toISOString(),
      enabled: true,
    };
    this.webhooks.set(id, config);
    this.attempts.set(id, []);
    return id;
  }

  /**
   * 获取 webhook 配置
   */
  getWebhook(id) {
    const config = this.webhooks.get(id);
    if (!config) return null;
    return { ...config };
  }

  /**
   * 列出所有 webhooks
   */
  listWebhooks() {
    return Array.from(this.webhooks.values()).map((w) => ({ ...w }));
  }

  /**
   * 更新 webhook
   */
  updateWebhook(id, updates) {
    const config = this.webhooks.get(id);
    if (!config) return null;

    const updated = {
      ...config,
      ...updates,
      id: config.id, // 保留原始 ID
      createdAt: config.createdAt, // 保留创建时间
    };
    this.webhooks.set(id, updated);
    return { ...updated };
  }

  /**
   * 删除 webhook
   */
  deleteWebhook(id) {
    const deleted = this.webhooks.delete(id);
    this.attempts.delete(id);
    return deleted;
  }

  /**
   * 检查 webhook 是否应该被触发
   * @param {Object} webhook - webhook 配置
   * @param {string} eventName - 事件名称，如 "job:completed"
   * @param {Object} eventData - 事件数据
   * @returns {boolean}
   */
  shouldTrigger(webhook, eventName, eventData) {
    // 检查 webhook 是否启用
    if (!webhook.enabled) return false;

    // 检查事件类型是否匹配
    if (!webhook.events.includes(eventName)) return false;

    // 检查过滤规则
    const filters = webhook.filters || {};

    // 过滤：最小结果数
    if (filters.minResultCount !== undefined) {
      if ((eventData.resultCount || 0) < filters.minResultCount) return false;
    }

    // 过滤：最大结果数
    if (filters.maxResultCount !== undefined) {
      if ((eventData.resultCount || 0) > filters.maxResultCount) return false;
    }

    // 过滤：状态
    if (filters.statuses !== undefined) {
      if (!filters.statuses.includes(eventData.newStatus)) return false;
    }

    // 过滤：源
    if (filters.sources !== undefined) {
      const jobSources = (eventData.job?.sources || "").split(",");
      const hasMatchingSource = jobSources.some((s) =>
        filters.sources.includes(s.trim()),
      );
      if (!hasMatchingSource) return false;
    }

    // 过滤：关键词包含
    if (filters.seedKeyword !== undefined) {
      const seed = eventData.job?.seed || "";
      if (!seed.toLowerCase().includes(filters.seedKeyword.toLowerCase())) {
        return false;
      }
    }

    return true;
  }

  /**
   * 投递 webhook（带重试）
   * @param {string} webhookId
   * @param {Object} eventData
   * @returns {Promise}
   */
  async deliverWebhook(webhookId, eventData) {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) throw new Error(`Webhook ${webhookId} not found`);

    const payload = {
      webhookId,
      eventName: eventData.type || "job:event",
      timestamp: new Date().toISOString(),
      data: eventData,
    };

    let lastError = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const statusCode = await this._sendRequest(webhook.url, payload);
        this._recordAttempt(webhookId, {
          timestamp: new Date().toISOString(),
          attempt,
          status: "success",
          statusCode,
        });
        return { success: true, statusCode };
      } catch (err) {
        lastError = err;
        this._recordAttempt(webhookId, {
          timestamp: new Date().toISOString(),
          attempt,
          status: "failed",
          error: err.message,
        });

        // 指数退避重试延迟
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return { success: false, error: lastError?.message };
  }

  /**
   * 发送 HTTP 请求到 webhook URL
   * @private
   */
  _sendRequest(url, payload) {
    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(url);
        const client = urlObj.protocol === "https:" ? https : http;

        const options = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "SEO-Crawler-Webhook/1.0",
          },
          timeout: 5000,
        };

        const req = client.request(url, options, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            // 只有 2xx 状态码认为成功
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.statusCode);
            } else {
              reject(
                new Error(
                  `HTTP ${res.statusCode}: ${data || "no response body"}`,
                ),
              );
            }
          });
        });

        req.on("error", (err) => {
          reject(err);
        });

        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timeout"));
        });

        req.write(JSON.stringify(payload));
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 记录投递尝试
   * @private
   */
  _recordAttempt(webhookId, record) {
    if (!this.attempts.has(webhookId)) {
      this.attempts.set(webhookId, []);
    }
    this.attempts.get(webhookId).push(record);
  }

  /**
   * 获取投递历史
   */
  getAttempts(webhookId) {
    return (this.attempts.get(webhookId) || []).slice();
  }

  /**
   * 获取投递统计
   */
  getStats() {
    let totalWebhooks = this.webhooks.size;
    let totalAttempts = 0;
    let successAttempts = 0;
    let failedAttempts = 0;

    for (const attempts of this.attempts.values()) {
      for (const attempt of attempts) {
        totalAttempts++;
        if (attempt.status === "success") {
          successAttempts++;
        } else {
          failedAttempts++;
        }
      }
    }

    return {
      totalWebhooks,
      totalAttempts,
      successAttempts,
      failedAttempts,
      successRate:
        totalAttempts > 0 ? (successAttempts / totalAttempts) * 100 : 0,
    };
  }

  /**
   * 清空所有数据（用于测试）
   */
  clear() {
    this.webhooks.clear();
    this.attempts.clear();
  }
}

export default new WebhookService();
//# sourceMappingURL=webhookService.js.map
