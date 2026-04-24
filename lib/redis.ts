import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

/**
 * Rate limiting simple por key.
 * Retorna true si se PERMITE la request, false si se debe bloquear.
 */
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

  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }

  const remaining = Math.max(0, maxRequests - count);
  return { allowed: count <= maxRequests, remaining };
}

/**
 * Cache helper: intenta leer de Redis, si no existe ejecuta el fetcher
 * y guarda el resultado con un TTL en segundos.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached !== null) return cached;

  const fresh = await fetcher();
  await redis.set(key, fresh, { ex: ttlSeconds });
  return fresh;
}

/**
 * Invalida una clave de caché.
 */
export async function invalidateCache(key: string) {
  await redis.del(key);
}
