import "server-only";
import { z } from "zod";
import { RateLimitError } from "@/lib/rate-limit";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Turns a ZodError into a field → message map for forms. */
export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = issue.path.join(".") || "_";
    out[k] ??= issue.message;
  }
  return out;
}

/** A problem with one field found after parsing (e.g. a matter that is not the user's). */
export class ActionFieldError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

/** A user-facing refusal ("Hearing not found.", "Already paid."): shown as is. */
export class ActionError extends Error {}

/** Maps known errors to safe user-facing messages; never leaks internals. */
export function toActionError(err: unknown): ActionResult<never> {
  if (err instanceof ActionFieldError) return fail(err.message, { [err.field]: err.message });
  if (err instanceof ActionError) return fail(err.message);
  if (err instanceof RateLimitError) return fail(err.message);
  // Postgres guards (CHECK constraints, same-owner and append-only triggers) are a
  // second line of defence; if one fires, the request was invalid, not a crash.
  if (isDbGuardError(err)) return fail("That change is not allowed.");
  if (err instanceof z.ZodError) return fail("Please check the highlighted fields.", zodFieldErrors(err));
  console.error("[action]", err);
  return fail("Something went wrong. Please try again.");
}

function isDbGuardError(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code ?? (err as { cause?: { code?: string } } | null)?.cause?.code;
  // 23514 check_violation, 23503 foreign_key_violation, 42501 insufficient_privilege (our triggers and RLS)
  return code === "23514" || code === "23503" || code === "42501";
}
