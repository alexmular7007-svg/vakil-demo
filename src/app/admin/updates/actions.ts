"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requestIp } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { legalUpdates } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { adminForAction, NOT_ADMIN } from "@/lib/admin/guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ActionError, fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { defineAction } from "@/lib/define-action";
import { syncLegalUpdates } from "@/lib/updates/sync";
import { IMPORTANCE } from "@/lib/updates/types";

// Admin actions for /admin/updates. Writes to the shared legal-updates tables go
// through the owner connection (they are not user rows); each action still checks the
// "admin.updates" permission, the admin's current status in the database (demoted,
// banned, two-factor) and appends to the audit log.

/** defineAction checks the session's role; this also checks the database, like every admin action. */
async function freshAdmin() {
  const admin = await adminForAction();
  if (!admin) throw new ActionError(NOT_ADMIN);
  return admin;
}

const syncSchema = z.object({ deep: z.boolean().default(false) });

export type SyncNowResult = { feedsStatus: string | null; indiaCodeStatus: string | null; newItems: number; actsUpdated: string[]; errors: number; skipped: string[] };

/**
 * Runs the legal-updates job now (feeds + India Code). Admin only, rate-limited.
 * Not built with defineAction on purpose: a sync takes minutes, and defineAction would
 * hold a withUser transaction (and a pooled connection) open for all of it. The same
 * steps are done by hand: session, permission, fresh admin check, zod, rate limit, audit.
 */
export async function syncUpdatesNow(input: z.input<typeof syncSchema>): Promise<ActionResult<SyncNowResult>> {
  const admin = await adminForAction();
  if (!admin || !can(admin, "admin.updates")) return fail(NOT_ADMIN);
  const parsed = syncSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  try {
    // Each run makes several requests to government sites: keep manual runs rare.
    await enforceRateLimit(`admin-updates-sync:${admin.id}`, 3, 600);
    await enforceRateLimit("admin-updates-sync:all", 6, 600);
    const summary = await syncLegalUpdates({ trigger: "admin", deep: parsed.data.deep });
    // Another sync (cron, local scheduler, another admin) holds the lock: say so plainly.
    if (summary.alreadyRunning) return fail(`${summary.alreadyRunning.message} Try again when it has finished.`);
    const feedsNew = Object.values(summary.feeds?.sources ?? {}).reduce((a, s) => a + s.new, 0);
    const feedErrors = Object.values(summary.feeds?.sources ?? {}).filter((s) => !s.ok).length;
    const ic = summary.indiaCode?.result;
    const result: SyncNowResult = {
      feedsStatus: summary.feeds?.status ?? null,
      indiaCodeStatus: summary.indiaCode?.status ?? null,
      newItems: feedsNew + (ic?.new ?? 0),
      actsUpdated: ic ? Object.entries(ic.acts).filter(([, a]) => a.status === "updated").map(([k]) => k) : [],
      errors: feedErrors + (ic?.errors.length ?? 0),
      skipped: summary.skipped,
    };
    await appendAudit({
      action: "legal_updates.sync",
      actorId: admin.id,
      actorRole: "admin",
      entityType: "sync_run",
      entityId: summary.feeds?.runId ?? summary.indiaCode?.runId ?? null,
      ip: await requestIp(),
      data: { deep: parsed.data.deep, ...result, disabled: summary.disabled },
    });
    revalidatePath("/admin/updates");
    revalidatePath("/app/updates");
    return ok(result);
  } catch (err) {
    return toActionError(err);
  }
}

const importanceSchema = z.object({ id: z.uuid(), importance: z.enum(IMPORTANCE) });

const setImportanceAction = defineAction({
  input: importanceSchema,
  permission: "admin.updates",
  rateLimit: { name: "admin-updates-importance", limit: 120, windowSeconds: 60 },
  run: async ({ input: { id, importance } }) => {
    await freshAdmin();
    // Shared table: owner connection, row locked so two admins cannot record the same "from".
    const before = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ importance: legalUpdates.importance, title: legalUpdates.title, sourceKey: legalUpdates.sourceKey })
        .from(legalUpdates)
        .where(eq(legalUpdates.id, id))
        .limit(1)
        .for("update");
      if (!row) return null;
      if (row.importance !== importance) await tx.update(legalUpdates).set({ importance }).where(eq(legalUpdates.id, id));
      return row;
    });
    if (!before) throw new ActionError("This item no longer exists. Refresh the list.");
    return before;
  },
  audit: ({ id, importance }, before) =>
    before.importance === importance
      ? null
      : {
          action: "legal_update.importance_changed",
          entityType: "legal_update",
          entityId: id,
          data: { from: before.importance, to: importance, title: before.title, source: before.sourceKey },
        },
  revalidate: () => ["/admin/updates", "/app/updates"],
});

/** Sets an item to high (pop-up), normal (list only) or hidden. Audited. */
export async function setUpdateImportance(input: z.input<typeof importanceSchema>): Promise<ActionResult> {
  const r = await setImportanceAction(input);
  return r.ok ? ok(undefined) : r;
}
