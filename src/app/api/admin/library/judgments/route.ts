import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminForAction, NOT_ADMIN } from "@/lib/admin/guard";
import { requestIp } from "@/lib/auth/dal";
import { appendAudit } from "@/lib/audit";
import { zodFieldErrors } from "@/lib/action";
import { json, sameOrigin } from "@/lib/judgments/http";
import { UPLOAD_SOURCE_KEY } from "@/lib/judgments/sources";
import { existingJudgmentId, insertJudgment, uploadFingerprint } from "@/lib/judgments/store";
import { splitJudgmentParas } from "@/lib/judgments/text";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";

// A route handler rather than a server action: judgment text can exceed the
// 1 MB server-action body limit.
const MAX_BODY = 6 * 1024 * 1024;

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => s || null);

const Body = z.object({
  court: z.string().trim().min(3, "Enter the court.").max(200),
  title: z.string().trim().min(3, "Enter the case title, e.g. A v. B.").max(500),
  parties: opt(2000),
  decidedOn: z
    .string()
    .trim()
    .optional()
    .refine((s) => !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))), "Use a valid date.")
    .transform((s) => s || null),
  citation: opt(500),
  caseNo: opt(300),
  bench: opt(500),
  sourceUrl: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .refine((s) => !s || /^https?:\/\/\S+$/i.test(s), "Use a full link starting with https://")
    .transform((s) => s || null),
  licence: z.string().trim().min(2, "Choose the licence or basis for reuse.").max(200),
  summary: opt(1500),
  text: z.string().min(50, "Paste or upload the judgment text.").max(5_000_000, "The text is too long."),
});

/** Admin "Add judgment": splits the reviewed text into paragraphs and stores it in the library. */
export async function POST(req: NextRequest) {
  const admin = await adminForAction();
  if (!admin) return json({ error: NOT_ADMIN }, 403);
  if (!sameOrigin(req)) return json({ error: "Cross-site request refused." }, 403);
  try {
    await enforceRateLimit(`library:judgment:${admin.id}`, 120, 3600);
  } catch (err) {
    if (err instanceof RateLimitError) return json({ error: err.message }, 429);
    throw err;
  }
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY) return json({ error: "The judgment text is too long (over 5 MB)." }, 413);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Please check the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) }, 400);
  const b = parsed.data;

  const { paras, mode } = splitJudgmentParas(b.text);
  if (paras.length === 0) return json({ error: "No paragraphs could be found in the text." }, 422);
  const externalId = uploadFingerprint(paras);

  try {
    const row = await insertJudgment({
      court: b.court,
      title: b.title,
      decidedOn: b.decidedOn,
      citation: b.citation,
      caseNo: b.caseNo,
      bench: b.bench,
      sourceUrl: b.sourceUrl,
      licence: b.licence,
      sourceKey: UPLOAD_SOURCE_KEY,
      externalId,
      parties: b.parties,
      summary: b.summary,
      addedBy: admin.id,
      paras,
    });
    if (!row) {
      const id = await existingJudgmentId(UPLOAD_SOURCE_KEY, externalId);
      return json({ error: "This judgment is already in the library.", existingId: id }, 409);
    }
    await appendAudit({
      action: "admin.judgment_added",
      actorId: admin.id,
      actorRole: "admin",
      entityType: "judgment",
      entityId: row.id,
      ip: await requestIp(),
      data: { title: b.title, court: b.court, citation: b.citation, paras: paras.length, mode },
    });
    revalidatePath("/admin/library");
    return json({ id: row.id, paras: paras.length, mode });
  } catch (err) {
    console.error("[library] judgment save failed", err);
    return json({ error: "The judgment could not be saved. Please try again." }, 500);
  }
}
