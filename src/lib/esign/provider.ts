import "server-only";
import { createHmac } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { envelopes, events } from "@/lib/db/schema";
import { env, features } from "@/lib/env";
import { getFile } from "@/lib/files/storage";
import { safeEqual, sha256 } from "@/lib/crypto";

// One interface for every way Vaakil can collect a signature, so an Aadhaar eSign
// aggregator (or, later, direct ASP registration with a licensed ESP) can be
// added without touching the workflow.

export type ProviderRecipient = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  action: string;
  routingOrder: number;
};

export type EnvelopeOpts = {
  envelopeId: string;
  title: string;
  documentSha256: string;
  expiresAt: Date;
};

export type ProviderRef = { provider: string; ref: string };

/** Provider events, already mapped from the aggregator's own vocabulary to Vaakil's. */
export const PROVIDER_EVENT_TYPES = [
  "recipient.viewed",
  "recipient.signed",
  "recipient.declined",
  "envelope.completed",
  "envelope.expired",
  "envelope.voided",
  "unknown",
] as const;
export type ProviderEventType = (typeof PROVIDER_EVENT_TYPES)[number];

export type ProviderEvent = {
  provider: string;
  type: ProviderEventType;
  /** The provider's envelope reference (ProviderRef.ref). */
  ref: string | null;
  /** The Vaakil recipient id the provider echoed back, if any. */
  recipientRef: string | null;
  occurredAt: Date | null;
};

/**
 * The contract every signing back end implements. The e-sign workflow (routing,
 * state machine, audit chain) stays in Vaakil; a provider only creates, cancels
 * and returns signed documents.
 *
 * - createEnvelope must be idempotent per opts.envelopeId (send it as the
 *   aggregator's client reference), because a send that fails after the
 *   provider call is retried with the same id.
 * - handleWebhook must verify the signature over the raw body before parsing.
 * - Methods throw ProviderNotConfiguredError when the provider cannot be used,
 *   and ProviderUnsupportedError for an operation it does not offer.
 */
export interface SignatureProvider {
  readonly id: string;
  readonly label: string;
  createEnvelope(doc: Buffer, recipients: ProviderRecipient[], opts: EnvelopeOpts): Promise<ProviderRef>;
  /** Cancel at the provider when the owner voids the envelope. */
  voidEnvelope(ref: ProviderRef, reason: string): Promise<void>;
  getSigningUrl(ref: ProviderRef, recipientId: string): Promise<string>;
  handleWebhook(rawBody: string, signature: string): Promise<ProviderEvent>; // verify first
  downloadSignedPdf(ref: ProviderRef): Promise<Buffer>;
  downloadAuditTrail(ref: ProviderRef): Promise<Buffer>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnsupportedError";
  }
}

/**
 * Tier-2 electronic signatures handled entirely by Vaakil: email OTP, consent,
 * typed or drawn signature and a hash-chained audit trail (src/lib/esign).
 */
export class InternalElectronicProvider implements SignatureProvider {
  readonly id = "internal";
  readonly label = "Vaakil AI Tier-2 electronic signature";

  async createEnvelope(doc: Buffer, _recipients: ProviderRecipient[], opts: EnvelopeOpts): Promise<ProviderRef> {
    // Documents stay in Vaakil's private storage; the only job here is to confirm
    // that the bytes being sent are exactly the bytes that will be locked.
    if (sha256(doc) !== opts.documentSha256) {
      throw new Error("Document bytes do not match the hash being locked.");
    }
    return { provider: this.id, ref: opts.envelopeId };
  }

  async voidEnvelope(): Promise<void> {
    // Nothing to cancel elsewhere: voiding the envelope row disables every link.
  }

  async getSigningUrl(): Promise<string> {
    // Internal signing links carry a single-use secret that is generated when the
    // link is emailed and stored only as a hash, so it cannot be looked up later.
    throw new ProviderUnsupportedError(
      "Internal signing links are emailed once and stored only as a hash. Use “Resend reminder” to issue a fresh link.",
    );
  }

  async handleWebhook(): Promise<ProviderEvent> {
    throw new ProviderUnsupportedError("The internal provider does not receive webhooks.");
  }

  async downloadSignedPdf(ref: ProviderRef): Promise<Buffer> {
    const [row] = await db
      .select({ key: envelopes.finalStorageKey, sha: envelopes.finalSha256, status: envelopes.status })
      .from(envelopes)
      .where(eq(envelopes.id, ref.ref))
      .limit(1);
    if (!row?.key || row.status !== "COMPLETED") throw new Error("The envelope is not completed.");
    const bytes = await getFile(row.key);
    // Never hand on a signed copy that differs from the fingerprint on the certificate.
    if (!row.sha || sha256(bytes) !== row.sha) throw new Error("The signed copy does not match its recorded fingerprint.");
    return bytes;
  }

  async downloadAuditTrail(ref: ProviderRef): Promise<Buffer> {
    const rows = await db.select().from(events).where(eq(events.envelopeId, ref.ref)).orderBy(asc(events.seq));
    return Buffer.from(JSON.stringify(rows, null, 2));
  }
}

const AGGREGATOR_NAMES: Record<string, string> = {
  leegality: "Leegality",
  digio: "Digio",
  signdesk: "SignDesk",
  emsigner: "emSigner",
  zoho: "Zoho Sign",
  setu: "Setu",
};

/**
 * Aadhaar eSign through a licensed aggregator. The aggregator's ESP (a licensed
 * Certifying Authority) authenticates the signer and issues the one-time
 * certificate; Vaakil never creates certificates itself. No aggregator API is
 * wired in yet, so every call fails with a clear, honest error.
 */
export class AadhaarAggregatorProvider implements SignatureProvider {
  readonly id: string;
  readonly label: string;

  constructor() {
    this.id = env.ESIGN_PROVIDER;
    this.label = `Aadhaar eSign via ${AGGREGATOR_NAMES[env.ESIGN_PROVIDER] ?? "a licensed aggregator"}`;
  }

  private fail(): never {
    if (!features.aadhaarEsign) {
      throw new ProviderNotConfiguredError(
        "Aadhaar eSign is not configured. It needs a contract with a licensed eSign aggregator (such as Leegality, Digio, SignDesk, emSigner, Zoho Sign or Setu) and its API key set on the server (ESIGN_PROVIDER and ESIGN_API_KEY).",
      );
    }
    throw new ProviderNotConfiguredError(
      `Aadhaar eSign through ${AGGREGATOR_NAMES[env.ESIGN_PROVIDER] ?? env.ESIGN_PROVIDER} is configured, but the integration with its API has not been built yet. No Aadhaar eSign can be created until it is. Use the Tier-2 electronic signature, or send this document from the aggregator directly.`,
    );
  }

  async createEnvelope(): Promise<ProviderRef> {
    return this.fail();
  }
  async voidEnvelope(): Promise<void> {
    return this.fail();
  }
  async getSigningUrl(): Promise<string> {
    return this.fail();
  }
  async handleWebhook(): Promise<ProviderEvent> {
    return this.fail();
  }
  async downloadSignedPdf(): Promise<Buffer> {
    return this.fail();
  }
  async downloadAuditTrail(): Promise<Buffer> {
    return this.fail();
  }
}

export function getProvider(signatureType: string): SignatureProvider {
  return signatureType === "aadhaar" ? new AadhaarAggregatorProvider() : new InternalElectronicProvider();
}

/** HMAC-SHA256 (hex) check for provider webhooks, constant-time. */
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const provided = signature.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(provided, expected);
}
