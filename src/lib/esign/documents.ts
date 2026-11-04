import "server-only";
import { sha256 } from "@/lib/crypto";
import { getFile } from "@/lib/files/storage";
import { EsignError } from "./errors";

// Every read of a stored e-sign PDF goes through here, so a missing or altered
// file is reported clearly (and never served or signed) instead of crashing.

export type StoredDocKind = "original" | "final";
export type StoredDocCheck = "ok" | "missing" | "mismatch" | "unavailable";

function isMissing(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "NoSuchKey" || code === "NotFound";
}

const LABEL: Record<StoredDocKind, string> = { original: "document", final: "signed copy" };

export class StoredDocumentMismatchError extends EsignError {
  constructor(
    public kind: StoredDocKind,
    public actualSha256: string,
  ) {
    super(`The stored ${LABEL[kind]} no longer matches its recorded SHA-256 fingerprint, so it will not be used. The sender can see this in the audit trail.`, 409);
    this.name = "StoredDocumentMismatchError";
  }
}

/**
 * Read a stored PDF and confirm it still has the recorded SHA-256. Throws an
 * EsignError with status 410 when the file is gone and 409 when it changed.
 */
export async function readStoredDocument(key: string, expectedSha256: string | null, kind: StoredDocKind): Promise<Buffer> {
  let bytes: Buffer;
  try {
    bytes = await getFile(key);
  } catch (err) {
    if (isMissing(err)) {
      throw new EsignError(`The stored ${LABEL[kind]} could not be found. Contact the sender; the audit trail and fingerprints are kept.`, 410);
    }
    throw err;
  }
  if (expectedSha256) {
    const actual = sha256(bytes);
    if (actual !== expectedSha256.toLowerCase()) throw new StoredDocumentMismatchError(kind, actual);
  }
  return bytes;
}

/** Non-throwing variant for status displays (e.g. the public verification page). */
export async function checkStoredDocument(key: string | null, expectedSha256: string | null): Promise<StoredDocCheck> {
  if (!key || !expectedSha256) return "missing";
  try {
    const bytes = await getFile(key);
    return sha256(bytes) === expectedSha256.toLowerCase() ? "ok" : "mismatch";
  } catch (err) {
    if (isMissing(err)) return "missing";
    console.error("[esign] stored document check failed", err);
    return "unavailable";
  }
}
