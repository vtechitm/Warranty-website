import { AppError } from "./errors";

/**
 * Fixed-window in-memory rate limiter. Suitable for a single-instance VPS deployment;
 * swap for Redis (same interface) when running multiple app instances.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  if (b.count > limit) {
    throw new AppError("RATE_LIMITED", "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.", {
      retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000),
    });
  }
}

export function resetRateLimits() {
  buckets.clear();
}
