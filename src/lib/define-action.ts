import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { appendAudit, type AuditInput } from "@/lib/audit";
import { getCurrentUser, requestIp, type CurrentUser } from "@/lib/auth/dal";
import { can, type Permission } from "@/lib/auth/permissions";
import { withUser, type Tx } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";

type AuditSpec = Omit<AuditInput, "actorId" | "actorRole" | "ip">;

export type ActionContext<I> = { user: CurrentUser; tx: Tx; input: I };

/**
 * The one pattern for a server action that changes a user's data. In order:
 *   1. identity from the verified session (never from input)
 *   2. optional permission check (src/lib/auth/permissions.ts)
 *   3. input validated with the zod schema (field errors go back to the form)
 *   4. optional rate limit, keyed by user
 *   5. `run` inside withUser(): row-level security applies to every query
 *   6. audit record (with role and IP) and page revalidation after commit
 *   7. errors mapped to safe messages (ActionError, ActionFieldError, zod, DB guards)
 *
 * Server actions are public POST endpoints; this keeps every one of them honest.
 * Example: src/app/app/diary/actions.ts.
 */
export function defineAction<S extends z.ZodType, R>(opts: {
  input: S;
  permission?: Permission;
  rateLimit?: { name: string; limit: number; windowSeconds: number };
  run: (ctx: ActionContext<z.output<S>>) => Promise<R>;
  audit?: (input: z.output<S>, result: R) => AuditSpec | null;
  revalidate?: (input: z.output<S>, result: R) => (string | null | undefined)[];
}): (input: z.input<S>) => Promise<ActionResult<R>> {
  return async (raw) => {
    const user = await getCurrentUser();
    if (!user) return fail("Please sign in.");
    if (opts.permission && !can(user, opts.permission)) return fail("You do not have access to this.");
    try {
      const input = opts.input.parse(raw) as z.output<S>;
      if (opts.rateLimit) await enforceRateLimit(`${opts.rateLimit.name}:${user.id}`, opts.rateLimit.limit, opts.rateLimit.windowSeconds);
      const result = await withUser(user.id, (tx) => opts.run({ user, tx, input }));
      const spec = opts.audit?.(input, result);
      if (spec) await appendAudit({ ...spec, actorId: user.id, actorRole: user.role, ip: await requestIp().catch(() => null) });
      for (const path of new Set(opts.revalidate?.(input, result) ?? [])) if (path) revalidatePath(path);
      return ok(result);
    } catch (e) {
      return toActionError(e);
    }
  };
}
