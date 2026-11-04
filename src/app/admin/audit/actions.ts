"use server";

import { requestIp } from "@/lib/auth/dal";
import { appendAudit, verifyAuditChain, type ChainReport } from "@/lib/audit";
import { adminForAction, NOT_ADMIN } from "@/lib/admin/guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";

export async function verifyChain(): Promise<ActionResult<ChainReport>> {
  const admin = await adminForAction();
  if (!admin) return fail(NOT_ADMIN);
  try {
    await enforceRateLimit(`audit-verify:${admin.id}`, 6, 60);
    const report = await verifyAuditChain();
    await appendAudit({
      action: "admin.audit_chain_verified",
      actorId: admin.id,
      actorRole: "admin",
      entityType: "audit",
      ip: await requestIp(),
      data: { ok: report.ok, checked: report.checked, brokenAtSeq: report.brokenAtSeq ?? null },
    });
    return ok(report);
  } catch (err) {
    return toActionError(err);
  }
}
