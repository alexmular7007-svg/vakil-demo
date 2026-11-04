import { metaFromRequest } from "@/lib/esign/context";
import { EsignError } from "@/lib/esign/errors";
import { pdfResponse, textError } from "@/lib/esign/http";
import { tokenSchema } from "@/lib/esign/schemas";
import { openFinalDocument } from "@/lib/esign/signer";

// The completed PDF (original + certificate of completion) for any party, through
// the personal link emailed at completion.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!tokenSchema.safeParse(token).success) throw new EsignError("This link is not valid.", 404);
    const doc = await openFinalDocument(token, metaFromRequest(req));
    return pdfResponse(doc.bytes, doc.name, new URL(req.url).searchParams.get("download") === "1");
  } catch (err) {
    return textError(err);
  }
}
