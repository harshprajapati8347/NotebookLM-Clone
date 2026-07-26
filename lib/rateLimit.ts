import { redisConnection } from "@/lib/queue/connection";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until the current window resets. */
  resetMs: number;
}

/**
 * Fixed-window rate limiter backed by the app's existing Redis connection
 * (plan §5 non-functional requirement: "Basic rate limiting on chat/upload
 * routes"). Redis-backed rather than in-memory so limits are correct across
 * multiple server instances/serverless invocations, not just per-process.
 *
 * Key is namespaced per bucket + identity (usually `userId`) so different
 * routes (chat vs. upload vs. content) get independent budgets.
 */
export async function checkRateLimit(
  bucket: string,
  identity: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const key = `ratelimit:${bucket}:${identity}`;

  try {
    const count = await redisConnection.incr(key);
    if (count === 1) {
      await redisConnection.expire(key, windowSeconds);
    }
    const ttlMs = await redisConnection.pttl(key);
    const resetMs = ttlMs > 0 ? ttlMs : windowSeconds * 1000;

    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetMs,
    };
  } catch (error) {
    // Redis being briefly unavailable should never take the whole app down —
    // fail open (allow the request) and log, same "one bad thing never
    // blocks everything else" philosophy used elsewhere (plan §10/§14).
    console.error(`[rateLimit] Redis error for bucket "${bucket}", failing open:`, error);
    return { success: true, limit, remaining: limit, resetMs: windowSeconds * 1000 };
  }
}

/** Standard 429 JSON response with a `Retry-After` header, per plan §5. */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please slow down and try again shortly.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil(result.resetMs / 1000)),
      },
    }
  );
}

/** Named per-route budgets (requests per window per user), kept in one place for easy tuning. */
export const RATE_LIMITS = {
  chat: { limit: 20, windowSeconds: 60 },
  sourceCreate: { limit: 15, windowSeconds: 60 },
  sourceReindex: { limit: 10, windowSeconds: 60 },
  sourceContent: { limit: 60, windowSeconds: 60 },
  notebookCreate: { limit: 20, windowSeconds: 60 },
  notebookMutate: { limit: 30, windowSeconds: 60 },
} as const;
