import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, type Db, type Tx } from "@/lib/db";
import { envelopes, events } from "@/lib/db/schema";
import { GENESIS_HASH, computeEventHash, verifyChainRows, type ChainFields, type ChainVerification } from "./chain";

export type EnvelopeRow = typeof envelopes.$inferSelect;

/**
 * Lock the envelope row (SELECT ... FOR UPDATE) for the rest of the transaction
 * and return its current state. Every status change, signer action and event
 * append takes this lock first, so two signers acting at the same moment are
 * serialised: the second one waits, then sees the first one's result. Row locks
 * are re-entrant within a transaction, so calling this twice is harmless.
 * With `ownerId`, a row of another owner is neither locked nor returned.
 */
export async function lockEnvelope(tx: Tx, envelopeId: string, opts: { ownerId?: string } = {}): Promise<EnvelopeRow | undefined> {
  const where = opts.ownerId ? and(eq(envelopes.id, envelopeId), eq(envelopes.ownerId, opts.ownerId)) : eq(envelopes.id, envelopeId);
  const [row] = await tx.select().from(envelopes).where(where).limit(1).for("update");
  return row;
}

export type EnvelopeEventInput = {
  envelopeId: string;
  type: string;
  recipientId?: string | null;
  documentSha256?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  data?: Record<string, unknown> | null;
};

/** JSONB round-trip safe copy: drops undefined, turns Dates into ISO strings. */
function jsonSafe(data: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!data) return null;
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}

/**
 * Append one event to the envelope's hash chain inside the caller's transaction,
 * so the event commits (or rolls back) together with the state change it records.
 */
export async function appendEnvelopeEvent(tx: Tx, input: EnvelopeEventInput): Promise<{ hash: string; seq: number }> {
  // The row lock serialises appends, so every event links to the true previous hash.
  await tx.select({ id: envelopes.id }).from(envelopes).where(eq(envelopes.id, input.envelopeId)).limit(1).for("update");
  const [last] = await tx
    .select({ hash: events.hash })
    .from(events)
    .where(eq(events.envelopeId, input.envelopeId))
    .orderBy(desc(events.seq))
    .limit(1);
  const prevHash = last?.hash ?? GENESIS_HASH;
  const fields: ChainFields = {
    envelopeId: input.envelopeId,
    recipientId: input.recipientId ?? null,
    type: input.type,
    documentSha256: input.documentSha256 ?? null,
    ip: input.ip ? input.ip.slice(0, 64) : null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 400) : null,
    data: jsonSafe(input.data),
    createdAt: new Date(),
  };
  const hash = computeEventHash(prevHash, fields);
  const [row] = await tx
    .insert(events)
    .values({ ...fields, prevHash, hash })
    .returning({ seq: events.seq });
  return { hash, seq: row.seq };
}

/** Hash of the newest event (the chain head), or GENESIS_HASH when there are none. */
export async function chainHead(tx: Tx, envelopeId: string): Promise<{ hash: string; count: number }> {
  const rows = await tx
    .select({ hash: events.hash })
    .from(events)
    .where(eq(events.envelopeId, envelopeId))
    .orderBy(desc(events.seq));
  return { hash: rows[0]?.hash ?? GENESIS_HASH, count: rows.length };
}

export type EnvelopeChainReport = ChainVerification & {
  /** Cross-checks between the chain and the envelope row. */
  documentChecks: { label: string; ok: boolean }[];
};

/**
 * Recompute an envelope's whole event chain and cross-check the hashes it
 * records against the envelope row. Server-only: callers must authorise first,
 * or pass a withUser() transaction so row-level security limits what is read.
 */
export async function verifyEnvelopeChain(envelopeId: string, executor: Db | Tx = db): Promise<EnvelopeChainReport> {
  const [env] = await executor
    .select({ lockedSha256: envelopes.lockedSha256, finalSha256: envelopes.finalSha256, status: envelopes.status })
    .from(envelopes)
    .where(eq(envelopes.id, envelopeId))
    .limit(1);
  const rows = await executor.select().from(events).where(eq(events.envelopeId, envelopeId)).orderBy(asc(events.seq));
  const report = verifyChainRows(
    envelopeId,
    rows.map((r) => ({ ...r, data: (r.data as Record<string, unknown> | null) ?? null })),
  );
  const documentChecks: { label: string; ok: boolean }[] = [];
  if (env?.lockedSha256) {
    const sent = rows.find((r) => r.type === "envelope.sent");
    documentChecks.push({ label: "Locked document hash matches the 'sent' event", ok: sent?.documentSha256 === env.lockedSha256 });
    const signed = rows.filter((r) => r.type === "recipient.signed" || r.type === "recipient.approved");
    if (signed.length) {
      documentChecks.push({
        label: "Every approval and signature was made over the locked document",
        ok: signed.every((r) => r.documentSha256 === env.lockedSha256),
      });
    }
  }
  if (env?.finalSha256) {
    const done = rows.find((r) => r.type === "envelope.completed");
    documentChecks.push({ label: "Final document hash matches the 'completed' event", ok: done?.documentSha256 === env.finalSha256 });
  }
  return { ...report, ok: report.ok && documentChecks.every((c) => c.ok), documentChecks };
}
