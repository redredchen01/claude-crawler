import Redis from "ioredis";
import { loggerService } from "./loggerService";

/**
 * Redis Service - Distributed caching layer
 * Wraps ioredis for connection management and error handling
 */
export class RedisService {
  private client: Redis | null = null;
  private isConnected = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

      this.client = new Redis(redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        enableOfflineQueue: true,
      });

      this.client.on("connect", () => {
        this.isConnected = true;
        loggerService.getLogger().info("Redis connected", {
          type: "redis",
          status: "connected",
        });
      });

      this.client.on("error", (err) => {
        loggerService.logError(err as Error, "Redis connection error");
      });

      this.client.on("close", () => {
        this.isConnected = false;
        loggerService.getLogger().warn("Redis connection closed", {
          type: "redis",
          status: "disconnected",
        });
      });
    } catch (error) {
      loggerService.logError(error as Error, "Failed to initialize Redis");
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is connected
   */
  checkConnection(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get value by key
   */
  async get(key: string): Promise<string | null> {
    if (!this.checkConnection()) {
      return null;
    }

    try {
      const value = await this.client!.get(key);
      return value;
    } catch (error) {
      loggerService.logError(error as Error, `Redis GET error for key: ${key}`);
      return null;
    }
  }

  /**
   * Get parsed JSON value
   */
  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      loggerService.logError(
        error as Error,
        `Failed to parse JSON for key: ${key}`,
      );
      return null;
    }
  }

  /**
   * Set value with optional TTL
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.checkConnection()) {
      return false;
    }

    try {
      if (ttlSeconds) {
        await this.client!.setex(key, ttlSeconds, value);
      } else {
        await this.client!.set(key, value);
      }
      return true;
    } catch (error) {
      loggerService.logError(error as Error, `Redis SET error for key: ${key}`);
      return false;
    }
  }

  /**
   * Set JSON value with optional TTL
   */
  async setJson(
    key: string,
    value: any,
    ttlSeconds?: number,
  ): Promise<boolean> {
    try {
      const jsonString = JSON.stringify(value);
      return await this.set(key, jsonString, ttlSeconds);
    } catch (error) {
      loggerService.logError(
        error as Error,
        `Failed to stringify JSON for key: ${key}`,
      );
      return false;
    }
  }

  /**
   * Delete key(s)
   */
  async delete(...keys: string[]): Promise<number> {
    if (!this.checkConnection() || keys.length === 0) {
      return 0;
    }

    try {
      const deletedCount = await this.client!.del(...keys);
      return deletedCount;
    } catch (error) {
      loggerService.logError(error as Error, "Redis DEL error");
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.checkConnection()) {
      return false;
    }

    try {
      const exists = await this.client!.exists(key);
      return exists === 1;
    } catch (error) {
      loggerService.logError(
        error as Error,
        `Redis EXISTS error for key: ${key}`,
      );
      return false;
    }
  }

  /**
   * Get remaining TTL in seconds (-1 if no expiry, -2 if not exists)
   */
  async ttl(key: string): Promise<number> {
    if (!this.checkConnection()) {
      return -2;
    }

    try {
      return await this.client!.ttl(key);
    } catch (error) {
      loggerService.logError(error as Error, `Redis TTL error for key: ${key}`);
      return -2;
    }
  }

  /**
   * Increment counter
   */
  async increment(key: string, amount = 1): Promise<number> {
    if (!this.checkConnection()) {
      return 0;
    }

    try {
      return await this.client!.incrby(key, amount);
    } catch (error) {
      loggerService.logError(
        error as Error,
        `Redis INCRBY error for key: ${key}`,
      );
      return 0;
    }
  }

  /**
   * Decrement counter
   */
  async decrement(key: string, amount = 1): Promise<number> {
    if (!this.checkConnection()) {
      return 0;
    }

    try {
      return await this.client!.decrby(key, amount);
    } catch (error) {
      loggerService.logError(
        error as Error,
        `Redis DECRBY error for key: ${key}`,
      );
      return 0;
    }
  }

  /**
   * Set with incremented counter (atomic)
   */
  async incrementWithExpiry(
    key: string,
    ttlSeconds: number,
    amount = 1,
  ): Promise<number> {
    if (!this.checkConnection()) {
      return 0;
    }

    try {
      const pipeline = this.client!.pipeline();
      pipeline.incrby(key, amount);
      pipeline.expire(key, ttlSeconds);
      const results = await pipeline.exec();

      if (results && results[0]) {
        const [, value] = results[0];
        return value as number;
      }
      return 0;
    } catch (error) {
      loggerService.logError(
        error as Error,
        `Redis INCRBY+EXPIRE error for key: ${key}`,
      );
      return 0;
    }
  }

  /**
   * Flush all keys (use with caution!)
   */
  async flush(): Promise<boolean> {
    if (!this.checkConnection()) {
      return false;
    }

    try {
      await this.client!.flushall();
      loggerService
        .getLogger()
        .warn("Redis FLUSHALL executed", { type: "redis" });
      return true;
    } catch (error) {
      loggerService.logError(error as Error, "Redis FLUSHALL error");
      return false;
    }
  }

  /**
   * Disconnect gracefully
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.isConnected = false;
        loggerService.getLogger().info("Redis disconnected", { type: "redis" });
      } catch (error) {
        loggerService.logError(error as Error, "Redis disconnect error");
      }
    }
  }
}

// Singleton instance
export const redisService = new RedisService();
