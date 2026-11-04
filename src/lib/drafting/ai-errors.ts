import "server-only";
import { AiProviderError, AiUnavailableError, FairUseLimitError, type CompletionResult } from "@/lib/ai/gateway";
import { fail, toActionError, type ActionResult } from "@/lib/action";
import { RateLimitError } from "@/lib/rate-limit";

/** Maps AI gateway errors to friendly action failures; everything else is generic. */
export function aiActionError(err: unknown): ActionResult<never> {
  if (err instanceof AiUnavailableError || err instanceof FairUseLimitError || err instanceof AiProviderError) {
    return fail(err.message);
  }
  if (err instanceof RateLimitError) return fail("You are sending AI requests too quickly. Please wait a minute and try again.");
  return toActionError(err);
}

/** Notes about the completion the user should see alongside the result. */
export function completionNotes(r: CompletionResult): string[] {
  const notes: string[] = [];
  if (r.downgraded) notes.push("Today's fair-use threshold was passed, so a faster model answered this request.");
  if (r.truncated) notes.push("The answer hit the length limit and may be cut off at the end.");
  return notes;
}

/** Removes a wrapping ``` fence if the model added one around a whole document. */
export function stripCodeFence(text: string): string {
  const t = text.trim();
  const m = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(t);
  return m ? m[1] : t;
}
