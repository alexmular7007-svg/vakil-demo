import { metaFromRequest } from "@/lib/esign/context";
import { EsignError } from "@/lib/esign/errors";
import { pdfResponse, textError } from "@/lib/esign/http";
import { tokenSchema } from "@/lib/esign/schemas";
import { openLockedDocument } from "@/lib/esign/signer";

// The locked PDF for a signer whose turn it is, after email OTP. Opened in a new
// tab (our headers forbid framing), never embedded.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!tokenSchema.safeParse(token).success) throw new EsignError("This signing link is not valid.", 404);
    const doc = await openLockedDocument(token, metaFromRequest(req));
    return pdfResponse(doc.bytes, doc.name, new URL(req.url).searchParams.get("download") === "1");
  } catch (err) {
    return textError(err);
  }
}
