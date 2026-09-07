import { RateLimiterMemory } from "rate-limiter-flexible";

/**
 * In-memory rate limiting — appropriate for the single-VM internal deployment.
 * If the app is ever scaled horizontally, swap for a Postgres/Redis-backed store.
 */

/** 20 chat requests per minute per user. */
export const chatLimiter = new RateLimiterMemory({ points: 20, duration: 60 });

/** 30 uploads (files or URLs) per hour per user. */
export const uploadLimiter = new RateLimiterMemory({ points: 30, duration: 3600 });

/** Returns true when the request is allowed, false when rate-limited. */
export async function allow(limiter: RateLimiterMemory, key: string): Promise<boolean> {
  try {
    await limiter.consume(key);
    return true;
  } catch {
    return false;
  }
}
