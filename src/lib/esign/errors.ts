import "server-only";
import { ActionError, fail, toActionError, type ActionResult } from "@/lib/action";
import { RateLimitError } from "@/lib/rate-limit";
import { ProviderNotConfiguredError, ProviderUnsupportedError } from "./provider";
import { UnreadablePdfError, UnsupportedTextError } from "./pdf";
import { WorkflowError } from "./workflow";

/**
 * An expected, user-facing e-sign failure. The message is safe to show. It is an
 * ActionError, so defineAction() shows it as is; `status` is used by route handlers.
 */
export class EsignError extends ActionError {
  constructor(
    message: string,
    public status = 400,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "EsignError";
  }
}

/** Map e-sign errors to safe action results; everything else goes through toActionError. */
export function toEsignActionError(err: unknown): ActionResult<never> {
  if (err instanceof EsignError) return fail(err.message, err.fieldErrors);
  if (
    err instanceof WorkflowError ||
    err instanceof ProviderNotConfiguredError ||
    err instanceof ProviderUnsupportedError ||
    err instanceof UnreadablePdfError ||
    err instanceof UnsupportedTextError ||
    err instanceof RateLimitError
  ) {
    return fail(err.message);
  }
  return toActionError(err);
}

/** HTTP status for the same errors in route handlers. */
export function errorStatus(err: unknown): number {
  if (err instanceof EsignError) return err.status;
  if (err instanceof RateLimitError) return 429;
  if (err instanceof ProviderNotConfiguredError) return 501;
  // An illegal status change: the request does not fit the envelope's current state.
  if (err instanceof WorkflowError) return 409;
  if (err instanceof ProviderUnsupportedError || err instanceof UnreadablePdfError || err instanceof UnsupportedTextError) return 400;
  return 500;
}
