/**
 * 结果缓存服务
 * 为关键词结果查询和任务列表提供短期内存缓存，减少数据库查询
 */

export class ResultsCache {
  constructor(ttlMinutes = 2, maxEntries = 10000) {
    this.cache = new Map();
    this.ttl = ttlMinutes * 60 * 1000; // 2 分钟 TTL
    this.maxEntries = maxEntries; // LRU 限制
    this.hits = 0;
    this.misses = 0;
    this.accessOrder = []; // 用于 LRU 跟踪

    // 每 5 分钟清理过期条目
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * 生成版本化缓存键（包含 jobId 时间戳防止碰撞）
   * 不同 job 的缓存互不影响，即使筛选器相同
   */
  getCacheKey(jobId, page, pageSize, filters) {
    // 对筛选器排序以确保一致的键生成
    const filterStr = filters
      ? Object.entries(filters)
          .filter(([, v]) => v !== null && v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)) // 排序关键字
          .map(([k, v]) => `${k}=${v}`)
          .join("&") // 使用 & 分隔以避免与 , 混淆
      : "";

    // 版本化键：包含 jobId，防止并发修改时碰撞
    return `job:${jobId}:page:${page}:size:${pageSize}:filters:${filterStr}`;
  }

  /**
   * 清理过期条目
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        this.accessOrder = this.accessOrder.filter((k) => k !== key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      // 仅在调试模式下记录
      // console.debug(`[ResultsCache] Cleaned ${cleaned} expired entries`);
    }
  }

  /**
   * 获取缓存的结果
   */
  get(jobId, page, pageSize, filters) {
    const key = this.getCacheKey(jobId, page, pageSize, filters);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    // 更新 LRU 访问顺序
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.accessOrder.push(key);
    return entry.data;
  }

  /**
   * 设置缓存（支持 LRU 驱逐）
   */
  set(jobId, page, pageSize, data, filters) {
    const key = this.getCacheKey(jobId, page, pageSize, filters);

    // 如果缓存满了，驱逐最少使用的条目
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const lruKey = this.accessOrder.shift(); // 移除最旧的
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
    // 更新访问顺序
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.accessOrder.push(key);
  }

  /**
   * 清除任务的所有结果缓存
   */
  clearJobCache(jobId) {
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      // 使用新的版本化键格式
      if (key.startsWith(`job:${jobId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter((k) => k !== key);
    }
  }

  /**
   * 清除所有缓存
   */
  clearAll() {
    this.cache.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 销毁缓存对象（清理定时器）
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clearAll();
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    const hitRate =
      this.hits + this.misses > 0
        ? ((this.hits / (this.hits + this.misses)) * 100).toFixed(1)
        : "0.0";

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: `${hitRate}%`,
      ttlMinutes: this.ttl / 60000,
    };
  }
}

// 全局缓存实例
export const resultsCache = new ResultsCache(2);
