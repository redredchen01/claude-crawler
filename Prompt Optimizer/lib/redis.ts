/**
 * Redis response caching layer
 * Provides simple in-memory cache for responses
 */

const cache = new Map<string, { data: any; expiresAt: number }>();

export function cacheKey(
  userId: string,
  endpoint: string,
  params?: Record<string, string>,
): string {
  const paramStr = params
    ? `_${Object.entries(params)
        .sort()
        .map(([k, v]) => `${k}=${v}`)
        .join("_")}`
    : "";
  return `${userId}:${endpoint}${paramStr}`;
}

export async function getResponseCache(
  userIdOrKey: string,
  endpoint?: string,
): Promise<any | null> {
  // Support both (key) and (userId, endpoint) calling patterns
  const key =
    endpoint !== undefined ? cacheKey(userIdOrKey, endpoint) : userIdOrKey;

  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }

  return item.data;
}

export async function setResponseCache(
  userIdOrKey: string,
  dataOrEndpoint?: any,
  ttlSecondsOrData?: number | any,
  ttlSeconds?: number,
): Promise<void> {
  // Support both calling patterns:
  // (key, data, ttlSeconds)
  // (userId, endpoint, data, ttlSeconds)
  let key: string;
  let data: any;
  let ttl: number;

  if (typeof dataOrEndpoint === "string") {
    // (userId, endpoint, data, ttlSeconds) pattern
    key = cacheKey(userIdOrKey, dataOrEndpoint, undefined);
    data = ttlSecondsOrData;
    ttl = ttlSeconds || 300;
  } else {
    // (key, data, ttlSeconds) pattern
    key = userIdOrKey;
    data = dataOrEndpoint;
    ttl = (ttlSecondsOrData as number) || 300;
  }

  cache.set(key, {
    data,
    expiresAt: Date.now() + ttl * 1000,
  });
}

export async function deleteResponseCache(
  userIdOrKey: string,
  endpoint?: string,
): Promise<void> {
  const key =
    endpoint !== undefined ? cacheKey(userIdOrKey, endpoint) : userIdOrKey;
  cache.delete(key);
}

export async function clearCache(): Promise<void> {
  cache.clear();
}
