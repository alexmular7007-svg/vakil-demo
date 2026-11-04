import "server-only";
import { headers } from "next/headers";

export type RequestMeta = { ip: string | null; userAgent: string | null };

function metaFrom(h: Headers): RequestMeta {
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const userAgent = h.get("user-agent")?.slice(0, 400) || null;
  return { ip: ip ? ip.slice(0, 64) : null, userAgent };
}

/** IP and user agent of the current request (server actions, pages). */
export async function requestMeta(): Promise<RequestMeta> {
  return metaFrom(await headers());
}

/** IP and user agent from a route handler's Request. */
export function metaFromRequest(req: Request): RequestMeta {
  return metaFrom(req.headers);
}

/**
 * CSRF guard for cookie-authenticated route handlers (server actions check this
 * themselves). Rejects cross-site requests by Fetch Metadata and Origin.
 */
export function isSameOriginRequest(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
