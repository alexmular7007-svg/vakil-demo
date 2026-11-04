import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { todayIST } from "@/lib/diary/dates";
import { hearingDescription, hearingLocation, hearingSummary } from "@/lib/diary/format";
import { buildIcs } from "@/lib/diary/ics";
import { getHearingsForExport } from "@/lib/diary/queries";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/diary/ics            → the signed-in user's upcoming scheduled hearings
 * GET /api/diary/ics?hearing=ID → one hearing (for "Add to Apple / Outlook calendar")
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401, headers: { "Cache-Control": "no-store" } });

  const param = new URL(req.url).searchParams.get("hearing");
  const id = param ? z.uuid().safeParse(param) : null;
  if (id && !id.success) return new Response("Invalid hearing.", { status: 400 });

  try {
    await enforceRateLimit(`diary:ics:${user.id}`, 30, 60);
  } catch (e) {
    if (e instanceof RateLimitError) return new Response(e.message, { status: 429 });
    throw e;
  }

  const today = todayIST();
  const rows = await getHearingsForExport(user.id, { id: id?.data, today });
  if (id && rows.length === 0) return new Response("Hearing not found.", { status: 404 });

  const ics = buildIcs(
    rows.map((h) => ({
      uid: `hearing-${h.id}@vaakil-ai`,
      date: h.hearingDate,
      time: h.hearingTime,
      summary: hearingSummary(h),
      location: hearingLocation(h) || null,
      description: hearingDescription(h),
    })),
    { name: "Vaakil AI case diary" },
  );

  const filename = id ? `hearing-${rows[0].hearingDate}.ics` : `vaakil-diary-${today}.ics`;
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
