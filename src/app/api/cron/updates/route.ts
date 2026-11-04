import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { syncLegalUpdates } from "@/lib/updates/sync";
import { expireOverdueEnvelopes } from "@/lib/esign/service";

// Vercel Cron (vercel.json, every 6 hours) calls this with
// "Authorization: Bearer <CRON_SECRET>". Without CRON_SECRET configured it refuses all calls.
// Only one sync runs at a time: while another one (admin "Sync now", the local scheduler,
// a script) holds the lock, this answers 409 with what is running and does nothing.
export const maxDuration = 300;

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = env.CRON_SECRET;
  if (!secret || !auth.startsWith("Bearer ") || !safeEqual(auth.slice(7).trim(), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  }
  try {
    // Housekeeping on the same schedule: expire e-sign envelopes past their deadline
    // (expiry is also enforced whenever an envelope is opened or acted on).
    await expireOverdueEnvelopes().catch((e) => console.error("[cron] e-sign expiry sweep failed", e));
    const summary = await syncLegalUpdates({ trigger: "cron" });
    if (summary.alreadyRunning) {
      const r = summary.alreadyRunning;
      return Response.json(
        { ok: false, alreadyRunning: true, error: r.message, running: { kind: r.kind, startedAt: r.startedAt.toISOString(), trigger: r.trigger } },
        { status: 409, headers: noStore },
      );
    }
    const feeds = summary.feeds
      ? { status: summary.feeds.status, new: Object.values(summary.feeds.sources).reduce((a, s) => a + s.new, 0), failed: Object.entries(summary.feeds.sources).filter(([, s]) => !s.ok).map(([k]) => k) }
      : null;
    const indiaCode = summary.indiaCode ? { status: summary.indiaCode.status, new: summary.indiaCode.result.new, errors: summary.indiaCode.result.errors.length } : null;
    return Response.json({ ok: true, feeds, indiaCode, skipped: summary.skipped, disabled: summary.disabled }, { headers: noStore });
  } catch (err) {
    console.error("[cron/updates]", err);
    return Response.json({ ok: false, error: "Sync failed." }, { status: 500, headers: noStore });
  }
}
