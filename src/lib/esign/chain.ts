// Per-envelope hash chain for esign.events. Pure functions (no database), so the
// hashing can be unit-tested and re-run by anyone holding an export of the events.
//
//   prev_hash = hash of the envelope's previous event (GENESIS_HASH for the first)
//   hash      = SHA-256(prev_hash + canonicalJson(event fields))

import { GENESIS_HASH, canonicalJson, sha256 } from "@/lib/crypto";

export type ChainFields = {
  envelopeId: string;
  recipientId: string | null;
  type: string;
  documentSha256: string | null;
  ip: string | null;
  userAgent: string | null;
  data: Record<string, unknown> | null;
  createdAt: Date;
};

export type ChainRow = ChainFields & { seq: number; prevHash: string; hash: string };

/** The exact object that is hashed. Field names are part of the format: do not rename. */
export function chainPayload(f: ChainFields) {
  return {
    envelopeId: f.envelopeId,
    recipientId: f.recipientId ?? null,
    type: f.type,
    documentSha256: f.documentSha256 ?? null,
    ip: f.ip ?? null,
    userAgent: f.userAgent ?? null,
    data: f.data ?? null,
    createdAt: f.createdAt.toISOString(),
  };
}

export function computeEventHash(prevHash: string, fields: ChainFields): string {
  return sha256(prevHash + canonicalJson(chainPayload(fields)));
}

export type ChainVerification = {
  ok: boolean;
  checked: number;
  headHash: string;
  brokenAtSeq?: number;
  reason?: string;
};

/** Re-walk an envelope's events in seq order and recompute every link. */
export function verifyChainRows(envelopeId: string, rows: readonly ChainRow[]): ChainVerification {
  let prev = GENESIS_HASH;
  let checked = 0;
  let lastSeq = -Infinity;
  for (const r of rows) {
    if (r.envelopeId !== envelopeId) {
      return { ok: false, checked, headHash: prev, brokenAtSeq: r.seq, reason: "event belongs to another envelope" };
    }
    if (r.seq <= lastSeq) {
      return { ok: false, checked, headHash: prev, brokenAtSeq: r.seq, reason: "events are out of order" };
    }
    if (r.prevHash !== prev) {
      return { ok: false, checked, headHash: prev, brokenAtSeq: r.seq, reason: "prev_hash does not match the previous event (an event was removed or reordered)" };
    }
    const expected = computeEventHash(prev, r);
    if (expected !== r.hash) {
      return { ok: false, checked, headHash: prev, brokenAtSeq: r.seq, reason: "event contents changed after it was written" };
    }
    prev = r.hash;
    lastSeq = r.seq;
    checked++;
  }
  return { ok: true, checked, headHash: prev };
}

export { GENESIS_HASH };
