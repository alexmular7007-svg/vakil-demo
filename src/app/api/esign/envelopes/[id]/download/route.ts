import { getCurrentUser } from "@/lib/auth/dal";
import { enforceRateLimit } from "@/lib/rate-limit";
import { appendAudit } from "@/lib/audit";
import { ESIGN_RATE_LIMITS } from "@/lib/esign/constants";
import { metaFromRequest } from "@/lib/esign/context";
import { readStoredDocument } from "@/lib/esign/documents";
import { EsignError } from "@/lib/esign/errors";
import { pdfResponse, textError } from "@/lib/esign/http";
import { ownsEnvelope } from "@/lib/esign/queries";
import { envelopeIdSchema } from "@/lib/esign/schemas";

// Owner download of the original or final PDF. Ownership is checked through an
// RLS-scoped read; the storage key never leaves the server. The file is checked
// against its recorded SHA-256 first: a missing (410) or altered (409) file is
// reported in plain words, never served.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new EsignError("Please sign in.", 401);
    const { id } = await ctx.params;
    const parsed = envelopeIdSchema.safeParse(id);
    if (!parsed.success) throw new EsignError("Envelope not found.", 404);
    const url = new URL(req.url);
    const which = url.searchParams.get("file") === "final" ? "final" : "original";
    await enforceRateLimit(`esign:owner-download:${user.id}`, ESIGN_RATE_LIMITS.ownerDownload.limit, ESIGN_RATE_LIMITS.ownerDownload.windowSeconds);
    const envelope = await ownsEnvelope(user.id, parsed.data);
    if (!envelope) throw new EsignError("Envelope not found.", 404);
    const key = which === "final" ? envelope.finalStorageKey : envelope.originalStorageKey;
    if (!key) throw new EsignError("The final PDF is available once everyone has finished.", 409);
    const bytes = await readStoredDocument(key, which === "final" ? envelope.finalSha256 : envelope.originalSha256, which);
    await appendAudit({
      action: "esign.owner_downloaded",
      actorId: user.id,
      entityType: "esign.envelope",
      entityId: envelope.id,
      ip: metaFromRequest(req).ip,
      data: { file: which },
    });
    const base = envelope.originalName.replace(/\.pdf$/i, "");
    return pdfResponse(bytes, which === "final" ? `${base} (signed).pdf` : `${base}.pdf`, url.searchParams.get("download") === "1");
  } catch (err) {
    return textError(err);
  }
}
