import { getCurrentUser } from "@/lib/auth/dal";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { markUpdatesSeen } from "@/lib/updates/queries";

/** Marks every legal update up to now as seen by the signed-in user (pop-up Read / Dismiss). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  // Same-site only: a cross-site page cannot mark someone's updates as seen.
  if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    await enforceRateLimit(`updates-seen:${user.id}`, 30, 60);
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: e.message }, { status: 429 });
    throw e;
  }
  await markUpdatesSeen(user.id);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
