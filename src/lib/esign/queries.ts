import "server-only";
import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db, withUser } from "@/lib/db";
import { envelopes, events, recipients } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { ESIGN_RATE_LIMITS, IN_FLIGHT_STATUSES, TERMINAL_STATUSES, type EnvelopeStatus } from "./constants";
import { checkStoredDocument, type StoredDocCheck } from "./documents";
import { verifyEnvelopeChain } from "./events";
import { expireDueForOwner, expireIfDue } from "./service";
import { isActionable, isDone } from "./workflow";

// Owner reads go through withUser(): row-level security limits them to the
// signed-in user's envelopes. Token hashes and drawn signature images are never selected.
// Every read first applies expiry, so an envelope past its deadline is never shown
// (or acted on) as still out for signature.

export const LIST_FILTERS = {
  all: null,
  draft: ["DRAFT"],
  active: IN_FLIGHT_STATUSES,
  completed: ["COMPLETED"],
  closed: TERMINAL_STATUSES.filter((s) => s !== "COMPLETED"),
} as const satisfies Record<string, readonly EnvelopeStatus[] | null>;
export type ListFilter = keyof typeof LIST_FILTERS;

export function parseFilter(v: unknown): ListFilter {
  return typeof v === "string" && v in LIST_FILTERS ? (v as ListFilter) : "all";
}

export async function listEnvelopes(userId: string, filter: ListFilter) {
  const statuses = LIST_FILTERS[filter];
  await expireDueForOwner(userId);
  return withUser(userId, async (tx) => {
    const where: SQL | undefined = statuses ? inArray(envelopes.status, [...statuses]) : undefined;
    const rows = await tx
      .select({
        id: envelopes.id,
        title: envelopes.title,
        status: envelopes.status,
        signatureType: envelopes.signatureType,
        expiresAt: envelopes.expiresAt,
        completedAt: envelopes.completedAt,
        updatedAt: envelopes.updatedAt,
        createdAt: envelopes.createdAt,
      })
      .from(envelopes)
      .where(where)
      .orderBy(desc(envelopes.updatedAt))
      .limit(200);
    const ids = rows.map((r) => r.id);
    const people = ids.length
      ? await tx
          .select({ envelopeId: recipients.envelopeId, action: recipients.action, status: recipients.status, name: recipients.name })
          .from(recipients)
          .where(inArray(recipients.envelopeId, ids))
          .orderBy(asc(recipients.routingOrder))
      : [];
    const counts = await tx.select({ status: envelopes.status, n: count() }).from(envelopes).groupBy(envelopes.status);
    return {
      rows: rows.map((r) => {
        const mine = people.filter((p) => p.envelopeId === r.id);
        const actionable = mine.filter(isActionable);
        return {
          ...r,
          names: mine.map((p) => p.name),
          done: actionable.filter(isDone).length,
          total: actionable.length,
        };
      }),
      counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Partial<Record<EnvelopeStatus, number>>,
    };
  });
}

export async function getEnvelopeDetail(userId: string, envelopeId: string) {
  await expireIfDue(envelopeId);
  return withUser(userId, async (tx) => {
    const [envelope] = await tx.select().from(envelopes).where(eq(envelopes.id, envelopeId)).limit(1);
    if (!envelope || envelope.ownerId !== userId) return null;
    const people = await tx
      .select({
        id: recipients.id,
        name: recipients.name,
        email: recipients.email,
        roleLabel: recipients.roleLabel,
        action: recipients.action,
        routingOrder: recipients.routingOrder,
        status: recipients.status,
        authMethod: recipients.authMethod,
        advocateUserId: recipients.advocateUserId,
        signatureKind: recipients.signatureKind,
        signatureText: recipients.signatureText,
        signedSha256: recipients.signedSha256,
        actedAt: recipients.actedAt,
        ip: recipients.ip,
        declineReason: recipients.declineReason,
      })
      .from(recipients)
      .where(eq(recipients.envelopeId, envelopeId))
      .orderBy(asc(recipients.routingOrder), asc(recipients.createdAt), asc(recipients.id));
    const trail = await tx
      .select({
        seq: events.seq,
        type: events.type,
        recipientId: events.recipientId,
        documentSha256: events.documentSha256,
        ip: events.ip,
        data: events.data,
        createdAt: events.createdAt,
        hash: events.hash,
        prevHash: events.prevHash,
      })
      .from(events)
      .where(eq(events.envelopeId, envelopeId))
      .orderBy(asc(events.seq));
    return { envelope, recipients: people, events: trail };
  });
}

/** Ownership check for route handlers and actions (RLS-scoped read). */
export async function ownsEnvelope(userId: string, envelopeId: string) {
  const [row] = await withUser(userId, (tx) =>
    tx
      .select({
        id: envelopes.id,
        ownerId: envelopes.ownerId,
        status: envelopes.status,
        originalName: envelopes.originalName,
        originalStorageKey: envelopes.originalStorageKey,
        originalSha256: envelopes.originalSha256,
        finalStorageKey: envelopes.finalStorageKey,
        finalSha256: envelopes.finalSha256,
      })
      .from(envelopes)
      .where(and(eq(envelopes.id, envelopeId), eq(envelopes.ownerId, userId)))
      .limit(1),
  );
  return row ?? null;
}

/** Public verification data: no names, no emails, no IPs. Drafts are not public. */
export async function getPublicVerification(envelopeId: string) {
  await expireIfDue(envelopeId);
  const [envelope] = await db
    .select({
      id: envelopes.id,
      title: envelopes.title,
      status: envelopes.status,
      signatureType: envelopes.signatureType,
      lockedAt: envelopes.lockedAt,
      lockedSha256: envelopes.lockedSha256,
      completedAt: envelopes.completedAt,
      finalSha256: envelopes.finalSha256,
    })
    .from(envelopes)
    .where(eq(envelopes.id, envelopeId))
    .limit(1);
  if (!envelope || envelope.status === "DRAFT") return null;
  const people = await db
    .select({
      roleLabel: recipients.roleLabel,
      action: recipients.action,
      routingOrder: recipients.routingOrder,
      status: recipients.status,
      actedAt: recipients.actedAt,
    })
    .from(recipients)
    .where(eq(recipients.envelopeId, envelopeId))
    .orderBy(asc(recipients.routingOrder), asc(recipients.createdAt), asc(recipients.id));
  return { envelope, recipients: people };
}

export type PublicIntegrity = {
  /** The envelope's hash-chained audit trail re-verified now. */
  chain: { ok: boolean; checked: number };
  /** Whether Vaakil's stored copy of the signed PDF still has the published fingerprint (null until completed). */
  storedFinal: StoredDocCheck | null;
};

/**
 * Integrity status for the public verification page: no names, emails or hashes
 * beyond what the page already shows. Re-hashing the stored PDF reads the file,
 * so it is rate-limited per IP and reported as "unavailable" when limited.
 */
export async function getPublicIntegrity(envelopeId: string, opts: { ip?: string | null } = {}): Promise<PublicIntegrity | null> {
  const [envelope] = await db
    .select({ status: envelopes.status, finalStorageKey: envelopes.finalStorageKey, finalSha256: envelopes.finalSha256 })
    .from(envelopes)
    .where(eq(envelopes.id, envelopeId))
    .limit(1);
  if (!envelope || envelope.status === "DRAFT") return null;
  const report = await verifyEnvelopeChain(envelopeId);
  let storedFinal: StoredDocCheck | null = null;
  if (envelope.status === "COMPLETED") {
    const allowed = opts.ip
      ? (await rateLimit(`esign:verify-file:${opts.ip}`, ESIGN_RATE_LIMITS.publicIntegrityPerIp.limit, ESIGN_RATE_LIMITS.publicIntegrityPerIp.windowSeconds)).ok
      : true;
    storedFinal = allowed ? await checkStoredDocument(envelope.finalStorageKey, envelope.finalSha256) : "unavailable";
  }
  return { chain: { ok: report.ok, checked: report.checked }, storedFinal };
}
