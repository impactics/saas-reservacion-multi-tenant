import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

export async function rateLimit({
  key,
  maxRequests,
  windowSeconds,
}: {
  key: string;
  maxRequests: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; remaining: number }> {
  const redisKey = `rl:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) await redis.expire(redisKey, windowSeconds);
  return { allowed: count <= maxRequests, remaining: Math.max(0, maxRequests - count) };
}

export async function withCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached !== null) return cached;
  const fresh = await fetcher();
  await redis.set(key, fresh, { ex: ttlSeconds });
  return fresh;
}

export async function invalidateCache(key: string) {
  await redis.del(key);
}
