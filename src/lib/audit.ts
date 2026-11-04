import "server-only";
import { asc, desc, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import { GENESIS_HASH, canonicalJson, sha256 } from "@/lib/crypto";

export type AuditInput = {
  action: string;
  actorId?: string | null;
  actorRole?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  data?: Record<string, unknown> | null;
};

// Arbitrary constant: serialises appends so every row links to the true previous hash.
const AUDIT_LOCK = 7340001;

function rowDigest(prevHash: string, e: AuditInput & { at: Date }): string {
  return sha256(
    prevHash +
      canonicalJson({
        at: e.at.toISOString(),
        actorId: e.actorId ?? null,
        actorRole: e.actorRole ?? null,
        action: e.action,
        entityType: e.entityType ?? null,
        entityId: e.entityId ?? null,
        ip: e.ip ?? null,
        data: e.data ?? null,
      }),
  );
}

/** Append one event to the tamper-evident audit chain. Never throws into the caller's flow. */
export async function appendAudit(input: AuditInput): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${AUDIT_LOCK})`);
      const [last] = await tx
        .select({ hash: auditEvents.hash })
        .from(auditEvents)
        .orderBy(desc(auditEvents.seq))
        .limit(1);
      const prevHash = last?.hash ?? GENESIS_HASH;
      const at = new Date();
      const hash = rowDigest(prevHash, { ...input, at });
      await tx.insert(auditEvents).values({
        at,
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        ip: input.ip ?? null,
        data: input.data ?? null,
        prevHash,
        hash,
      });
    });
  } catch (err) {
    console.error("[audit] append failed", input.action, err);
  }
}

export type ChainReport = { ok: boolean; checked: number; brokenAtSeq?: number; reason?: string };

/** Re-walk the chain and recompute every hash. Any edit, deletion or reordering breaks it. */
export async function verifyAuditChain(): Promise<ChainReport> {
  let prevHash = GENESIS_HASH;
  let checked = 0;
  let cursor = 0;
  for (;;) {
    const rows = await db
      .select()
      .from(auditEvents)
      .where(gt(auditEvents.seq, cursor))
      .orderBy(asc(auditEvents.seq))
      .limit(1000);
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.prevHash !== prevHash) {
        return { ok: false, checked, brokenAtSeq: r.seq, reason: "prev_hash does not match previous row" };
      }
      const expected = rowDigest(prevHash, {
        at: r.at,
        actorId: r.actorId,
        actorRole: r.actorRole,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        ip: r.ip,
        data: (r.data as Record<string, unknown> | null) ?? null,
      });
      if (expected !== r.hash) {
        return { ok: false, checked, brokenAtSeq: r.seq, reason: "row contents changed" };
      }
      prevHash = r.hash;
      checked++;
      cursor = r.seq;
    }
  }
  return { ok: true, checked };
}
