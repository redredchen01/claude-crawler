/**
 * Cache Service Tests
 */

import { CacheService } from "../../../src/services/cache/cacheService.js";

describe("P4.4: Cache Service", () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService();
  });

  afterEach(() => {
    cache.shutdown();
  });

  describe("get and set", () => {
    it("should return null for non-existent key", () => {
      const value = cache.get<string>("non-existent");
      expect(value).toBeNull();
    });

    it("should store and retrieve cached value", () => {
      const testData = { id: 1, name: "test" };
      cache.set("test-key", testData);

      const retrieved = cache.get<typeof testData>("test-key");
      expect(retrieved).toEqual(testData);
    });

    it("should return null for expired cache entry", async () => {
      const testData = "test value";
      cache.set("expiring-key", testData, 0.01); // 0.6 seconds TTL

      // Should be available immediately
      expect(cache.get<string>("expiring-key")).toBe(testData);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 700));

      // Should be expired
      expect(cache.get<string>("expiring-key")).toBeNull();
    });

    it("should override existing cache entry", () => {
      cache.set("key", "value1");
      cache.set("key", "value2");

      expect(cache.get<string>("key")).toBe("value2");
    });
  });

  describe("invalidate", () => {
    it("should invalidate cache entries by pattern", () => {
      cache.set("analytics:project:123", { data: "test" });
      cache.set("analytics:project:456", { data: "test" });
      cache.set("recommendations:project:123", { data: "test" });

      const count = cache.invalidate("analytics:*");

      expect(count).toBe(2);
      expect(cache.get<{ data: string }>("analytics:project:123")).toBeNull();
      expect(cache.get<{ data: string }>("analytics:project:456")).toBeNull();
      expect(
        cache.get<{ data: string }>("recommendations:project:123"),
      ).not.toBeNull();
    });

    it("should invalidate with wildcard patterns", () => {
      cache.set("project:123:analytics", "data1");
      cache.set("project:123:recommendations", "data2");
      cache.set("project:456:analytics", "data3");

      const count = cache.invalidate("project:123:*");

      expect(count).toBe(2);
      expect(cache.get<string>("project:123:analytics")).toBeNull();
      expect(cache.get<string>("project:123:recommendations")).toBeNull();
      expect(cache.get<string>("project:456:analytics")).not.toBeNull();
    });

    it("should return 0 when no entries match pattern", () => {
      cache.set("key1", "value1");

      const count = cache.invalidate("nomatch:*");

      expect(count).toBe(0);
    });
  });

  describe("clear", () => {
    it("should clear all cache entries", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.set("key3", "value3");

      cache.clear();

      expect(cache.get<string>("key1")).toBeNull();
      expect(cache.get<string>("key2")).toBeNull();
      expect(cache.get<string>("key3")).toBeNull();
    });
  });

  describe("getStats", () => {
    it("should return cache statistics", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.keys).toContain("key1");
      expect(stats.keys).toContain("key2");
    });

    it("should track size after operations", () => {
      cache.set("key1", "value1");
      expect(cache.getStats().size).toBe(1);

      cache.set("key2", "value2");
      expect(cache.getStats().size).toBe(2);

      cache.invalidate("key1");
      expect(cache.getStats().size).toBe(1);
    });
  });
});
