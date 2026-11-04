import "server-only";
import { lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

export type RateLimitResult = { ok: boolean; remaining: number; resetAt: Date };

/**
 * Fixed-window limiter stored in Postgres, so it holds across server instances.
 * Swap for Upstash Redis at high traffic; the signature stays the same.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  // Opportunistic cleanup of old windows.
  if (Math.random() < 0.01) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now - 24 * 3600 * 1000)));
  }
  const count = row?.count ?? 1;
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt: new Date(windowStart.getTime() + windowMs) };
}

export class RateLimitError extends Error {
  constructor(public resetAt: Date) {
    super("Too many requests. Please wait a moment and try again.");
  }
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const r = await rateLimit(key, limit, windowSeconds);
  if (!r.ok) throw new RateLimitError(r.resetAt);
  return r;
}
