import { NextResponse } from "next/server";
import { zodFieldErrors } from "@/lib/action";
import { getCurrentUser } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { maxUploadBytes } from "@/lib/files/validate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ESIGN_RATE_LIMITS } from "@/lib/esign/constants";
import { isSameOriginRequest, metaFromRequest } from "@/lib/esign/context";
import { EsignError, errorStatus } from "@/lib/esign/errors";
import { envelopeInputSchema } from "@/lib/esign/schemas";
import { createEnvelope } from "@/lib/esign/service";

// Creating an envelope is a route handler (not a server action) because it carries
// a PDF up to MAX_UPLOAD_MB, above the 1 MB server-action body limit.

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return json({ ok: false, error: "Cross-site request refused." }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Please sign in." }, 401);

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxUploadBytes() + 256 * 1024) {
    return json({ ok: false, error: `The PDF is larger than ${env.MAX_UPLOAD_MB} MB.` }, 413);
  }

  try {
    await enforceRateLimit(`esign:create:${user.id}`, ESIGN_RATE_LIMITS.ownerCreate.limit, ESIGN_RATE_LIMITS.ownerCreate.windowSeconds);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ ok: false, error: "The upload could not be read. Try again." }, 400);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(String(form.get("payload") ?? ""));
    } catch {
      return json({ ok: false, error: "The form could not be read. Reload the page and try again." }, 400);
    }
    const parsed = envelopeInputSchema.safeParse(payload);
    if (!parsed.success) {
      return json({ ok: false, error: "Please check the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) }, 422);
    }
    const input = parsed.data;
    const file = form.get("file");
    let created: { id: string };
    if (input.draftId) {
      created = await createEnvelope(user, input, { kind: "draft", draftId: input.draftId }, metaFromRequest(req));
    } else if (file instanceof File && file.size > 0) {
      if (file.size > maxUploadBytes()) throw new EsignError(`The PDF is larger than ${env.MAX_UPLOAD_MB} MB.`, 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      created = await createEnvelope(user, input, { kind: "upload", bytes, filename: file.name || "document.pdf" }, metaFromRequest(req));
    } else {
      return json({ ok: false, error: "Choose the PDF to send.", fieldErrors: { file: "Choose the PDF to send." } }, 422);
    }
    return json({ ok: true, id: created.id }, 201);
  } catch (err) {
    const status = errorStatus(err);
    if (status === 500) {
      console.error("[esign] create failed", err);
      return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
    }
    const fieldErrors = err instanceof EsignError ? err.fieldErrors : undefined;
    return json({ ok: false, error: (err as Error).message, fieldErrors }, status);
  }
}
