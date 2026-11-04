import "server-only";
import { createHmac } from "node:crypto";
import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { envelopes, otpCodes, recipients, user as users } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { randomCode, safeEqual, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  CONSENT_TEXT,
  CONSENT_VERSION,
  ESIGN_RATE_LIMITS,
  MAX_SIGNATURE_PNG_BYTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_SECONDS,
  OTP_TTL_MINUTES,
  actionRule,
  type EnvelopeStatus,
} from "./constants";
import type { RequestMeta } from "./context";
import { StoredDocumentMismatchError, readStoredDocument } from "./documents";
import { EsignError } from "./errors";
import { appendEnvelopeEvent, lockEnvelope } from "./events";
import { maskEmail } from "./format";
import { deliver, otpEmail } from "./notify";
import type { SignatureInput } from "./schemas";
import {
  afterExpired,
  completeEnvelope,
  expireIfDue,
  expireLockedTx,
  issueLinkTx,
  loadRecipientsTx,
  recordIntegrityFailure,
  sendDeclinedNotice,
  sendNextOrderInvites,
  type EnvelopeRow,
  type IssuedLink,
  type RecipientRow,
} from "./service";
import { changeEnvelopeStatus, changeRecipientStatus } from "./state";
import { currentSignerSession, hasSignerSession, setSignerSession } from "./signer-session";
import { allActionableDone, canRecipientAct, completedStatusFor, currentOrder, isActionable, isDone, isInFlight, planAfterAction } from "./workflow";

// The public signer portal. There is no account: every call re-resolves the
// recipient from the link token (only its SHA-256 is stored and compared), runs on
// the owner connection with these explicit checks, and takes the envelope row
// lock before reading the state it acts on. Nothing about the envelope beyond the
// sender's name and the signer's own role is returned before the email OTP.

export type SignerContext = {
  tokenHash: string;
  recipient: RecipientRow;
  envelope: EnvelopeRow;
};

const limit = (key: string, l: { limit: number; windowSeconds: number }) => enforceRateLimit(key, l.limit, l.windowSeconds);

/** Find the recipient behind a link token. Only the token's SHA-256 is ever compared (in constant time). */
export async function resolveSigner(token: string): Promise<SignerContext | null> {
  const tokenHash = sha256(token);
  const [row] = await db
    .select({ recipient: recipients, envelope: envelopes })
    .from(recipients)
    .innerJoin(envelopes, eq(envelopes.id, recipients.envelopeId))
    .where(eq(recipients.accessTokenHash, tokenHash))
    .limit(1);
  if (!row || !safeEqual(row.recipient.accessTokenHash, tokenHash)) return null;
  // Drafts never have live links; refuse defensively.
  if (row.envelope.status === "DRAFT") return null;
  return { tokenHash, recipient: row.recipient, envelope: row.envelope };
}

/** Resolve, then apply expiry on access and return fresh state. */
export async function resolveSignerFresh(token: string): Promise<SignerContext | null> {
  const ctx = await resolveSigner(token);
  if (!ctx) return null;
  if (await expireIfDue(ctx.envelope.id)) return resolveSigner(token);
  return ctx;
}

/** What a verified email is good for right now: the signer's own step, or the final copy. */
type OtpPurpose = "act" | "final_copy";

function finalReady(envelope: Pick<EnvelopeRow, "status" | "finalStorageKey">): boolean {
  return envelope.status === "COMPLETED" && Boolean(envelope.finalStorageKey);
}

async function recipientsOf(envelopeId: string): Promise<RecipientRow[]> {
  return db.select().from(recipients).where(eq(recipients.envelopeId, envelopeId));
}

async function otpPurpose(ctx: SignerContext): Promise<OtpPurpose | null> {
  if (finalReady(ctx.envelope)) return "final_copy";
  return canRecipientAct(ctx.recipient, await recipientsOf(ctx.envelope.id), ctx.envelope.status) ? "act" : null;
}

export type SignerView = {
  /** Always shown: enough to tell the signer who sent it and what state it is in. */
  envelope: {
    status: EnvelopeStatus;
    signatureType: string;
    expiresAt: Date;
    ownerName: string;
  };
  /** Envelope contents: only after the signer confirmed their email with the one-time code. */
  details: {
    id: string;
    title: string;
    message: string | null;
    originalName: string;
    lockedSha256: string | null;
    finalSha256: string | null;
    completedAt: Date | null;
    progress: { done: number; total: number };
  } | null;
  me: {
    name: string;
    maskedEmail: string;
    roleLabel: string;
    action: string;
    routingOrder: number;
    status: string;
    actedAt: Date | null;
    signatureKind: string | null;
  };
  canAct: boolean;
  /** A one-time code can be requested now (their step is open, or the final copy is ready). */
  canVerify: boolean;
  waitingForEarlier: boolean;
  verified: boolean;
};

export async function getSignerView(token: string): Promise<SignerView | null> {
  const ctx = await resolveSignerFresh(token);
  if (!ctx) return null;
  const { envelope, recipient } = ctx;
  const all = await recipientsOf(envelope.id);
  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, envelope.ownerId)).limit(1);
  const actionable = all.filter(isActionable);
  const order = currentOrder(all);
  const canAct = canRecipientAct(recipient, all, envelope.status);
  const canVerify = canAct || finalReady(envelope);
  const verified = canVerify ? await hasSignerSession(recipient.id, ctx.tokenHash) : false;
  return {
    envelope: {
      status: envelope.status as EnvelopeStatus,
      signatureType: envelope.signatureType,
      expiresAt: envelope.expiresAt,
      ownerName: owner?.name ?? "The sender",
    },
    details: verified
      ? {
          id: envelope.id,
          title: envelope.title,
          message: envelope.message,
          originalName: envelope.originalName,
          lockedSha256: envelope.lockedSha256,
          finalSha256: envelope.finalSha256,
          completedAt: envelope.completedAt,
          progress: { done: actionable.filter(isDone).length, total: actionable.length },
        }
      : null,
    me: {
      name: recipient.name,
      maskedEmail: maskEmail(recipient.email),
      roleLabel: recipient.roleLabel,
      action: recipient.action,
      routingOrder: recipient.routingOrder,
      status: recipient.status,
      actedAt: recipient.actedAt,
      signatureKind: recipient.signatureKind,
    },
    canAct,
    canVerify,
    waitingForEarlier: !canAct && isActionable(recipient) && !isDone(recipient) && order !== null && order < recipient.routingOrder,
    verified,
  };
}

const INVALID_LINK = "This signing link is not valid or has been replaced by a newer one. Use the latest email you received.";

function requireActive(ctx: SignerContext | null): asserts ctx is SignerContext {
  if (!ctx) throw new EsignError(INVALID_LINK, 404);
}

const nothingToDo = () => new EsignError("There is nothing for you to do on this envelope right now.", 409);

/** Why an open step is no longer open, in the signer's words. */
function closedError(status: string): EsignError {
  const reasons: Record<string, string> = {
    EXPIRED: "This envelope has expired, so it can no longer be signed.",
    VOIDED: "The sender cancelled this envelope, so it can no longer be signed.",
    DECLINED: "This envelope was declined, so it is closed.",
    COMPLETED: "Everyone has already finished this envelope.",
  };
  return new EsignError(reasons[status] ?? "This step is no longer open.", 409);
}

type Locked = { kind: "ok"; envelope: EnvelopeRow; all: RecipientRow[]; me: RecipientRow };
type LockOutcome = Locked | { kind: "expired"; envelope: EnvelopeRow } | { kind: "replaced" };

/**
 * Inside a transaction: lock the envelope row, then re-read the envelope, every
 * recipient and this signer, confirm the link was not replaced meanwhile, and
 * expire the envelope if its deadline passed. All decisions use this fresh state.
 */
async function lockSignerTx(tx: Tx, ctx: SignerContext): Promise<LockOutcome> {
  const envelope = await lockEnvelope(tx, ctx.envelope.id);
  if (!envelope) return { kind: "replaced" };
  const all = await loadRecipientsTx(tx, envelope.id);
  const me = all.find((r) => r.id === ctx.recipient.id);
  if (!me || !safeEqual(me.accessTokenHash, ctx.tokenHash)) return { kind: "replaced" };
  if (await expireLockedTx(tx, envelope, all)) return { kind: "expired", envelope };
  return { kind: "ok", envelope, all, me };
}

/** Map a non-ok lock outcome to the error the signer sees (after the transaction has committed). */
async function throwLockOutcome(outcome: Exclude<LockOutcome, Locked>): Promise<never> {
  if (outcome.kind === "expired") {
    await afterExpired(outcome.envelope);
    throw new EsignError("This envelope has expired, so it can no longer be signed.", 409);
  }
  throw new EsignError("This link has been replaced by a newer one. Use the latest email you received.", 409);
}

/* ------------------------------------------------------------------ */
/* OTP                                                                 */
/* ------------------------------------------------------------------ */

let otpKey: Buffer | null = null;
/**
 * Codes are stored as an HMAC keyed with a server secret (not a plain hash), so a
 * copy of the database alone cannot be used to recover the 6-digit codes.
 */
function otpHash(recipientId: string, code: string): string {
  otpKey ??= createHmac("sha256", env.authSecret).update("vaakil-esign-otp-v2").digest();
  return createHmac("sha256", otpKey).update(`${recipientId}:${code}`).digest("hex");
}

async function enforceOtpLimits(kind: "send" | "verify", recipientId: string, ip: string | null) {
  const L = ESIGN_RATE_LIMITS;
  if (ip) await limit(`esign:otp:${kind}:ip:${ip}`, kind === "send" ? L.otpSendPerIp : L.otpVerifyPerIp);
  await limit(`esign:otp:${kind}:r:${recipientId}`, kind === "send" ? L.otpSendPerRecipient : L.otpVerifyPerRecipient);
  await limit(`esign:otp:${kind}:day:${recipientId}`, kind === "send" ? L.otpSendPerRecipientDaily : L.otpVerifyPerRecipientDaily);
}

/**
 * Email a one-time code. A second request within OTP_RESEND_SECONDS keeps the
 * code already sent (double click), and a code whose email failed is cancelled
 * so the retry sends a fresh one.
 */
export async function requestOtp(token: string, meta: RequestMeta): Promise<{ maskedEmail: string }> {
  const ctx = await resolveSignerFresh(token);
  requireActive(ctx);
  const purpose = await otpPurpose(ctx);
  if (!purpose) throw nothingToDo();
  await enforceOtpLimits("send", ctx.recipient.id, meta.ip);

  const code = randomCode(6);
  const outcome = await db.transaction(async (tx) => {
    if (purpose === "act") {
      const locked = await lockSignerTx(tx, ctx);
      if (locked.kind !== "ok") return locked;
      if (!canRecipientAct(locked.me, locked.all, locked.envelope.status)) return { kind: "closed" as const, status: locked.envelope.status };
    }
    const now = new Date();
    const [recent] = await tx
      .select({ id: otpCodes.id })
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.recipientId, ctx.recipient.id),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.createdAt, new Date(now.getTime() - OTP_RESEND_SECONDS * 1000)),
          gt(otpCodes.expiresAt, now),
          lt(otpCodes.attempts, OTP_MAX_ATTEMPTS),
        ),
      )
      .limit(1);
    if (recent) return { kind: "recent" as const };
    // Any earlier unused code stops working (expiresAt = now marks it as replaced, not used).
    await tx
      .update(otpCodes)
      .set({ consumedAt: now, expiresAt: now })
      .where(and(eq(otpCodes.recipientId, ctx.recipient.id), isNull(otpCodes.consumedAt)));
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);
    const [row] = await tx
      .insert(otpCodes)
      .values({ recipientId: ctx.recipient.id, codeHash: otpHash(ctx.recipient.id, code), expiresAt })
      .returning({ id: otpCodes.id });
    if (purpose === "act") {
      await appendEnvelopeEvent(tx, {
        envelopeId: ctx.envelope.id,
        recipientId: ctx.recipient.id,
        type: "otp.sent",
        ip: meta.ip,
        userAgent: meta.userAgent,
        data: { channel: "email", email: maskEmail(ctx.recipient.email), expiresAt: expiresAt.toISOString() },
      });
    }
    return { kind: "issued" as const, id: row.id };
  });

  if (outcome.kind === "expired" || outcome.kind === "replaced") return throwLockOutcome(outcome);
  if (outcome.kind === "closed") throw isInFlight(outcome.status) ? nothingToDo() : closedError(outcome.status);
  if (outcome.kind === "issued") {
    const mail = await deliver([otpEmail({ to: ctx.recipient.email, code, title: ctx.envelope.title })]);
    if (mail.failed) {
      const now = new Date();
      await db.update(otpCodes).set({ consumedAt: now, expiresAt: now }).where(eq(otpCodes.id, outcome.id));
      throw new EsignError("We could not send the code just now. Try again in a minute.", 503);
    }
    if (purpose === "final_copy") {
      // The envelope's chain closed at completion; later access is in the platform audit log.
      await appendAudit({
        action: "esign.final_otp_sent",
        actorRole: "signer",
        entityType: "esign.envelope",
        entityId: ctx.envelope.id,
        ip: meta.ip,
        data: { recipientId: ctx.recipient.id },
      });
    }
  }
  return { maskedEmail: maskEmail(ctx.recipient.email) };
}

export async function verifyOtp(token: string, code: string, meta: RequestMeta): Promise<void> {
  const ctx = await resolveSignerFresh(token);
  requireActive(ctx);
  const purpose = await otpPurpose(ctx);
  if (!purpose) throw nothingToDo();
  await enforceOtpLimits("verify", ctx.recipient.id, meta.ip);

  type Verdict = { kind: "verified" } | { kind: "replay" } | { kind: "closed"; status: string } | { kind: "wrong"; message: string; attempt?: number };
  const outcome = await db.transaction(async (tx): Promise<Verdict | Exclude<LockOutcome, Locked>> => {
    let me = ctx.recipient;
    if (purpose === "act") {
      const locked = await lockSignerTx(tx, ctx);
      if (locked.kind !== "ok") return locked;
      if (!canRecipientAct(locked.me, locked.all, locked.envelope.status)) return { kind: "closed", status: locked.envelope.status };
      me = locked.me;
    }
    const now = new Date();
    const hash = otpHash(me.id, code);
    const [otp] = await tx.select().from(otpCodes).where(eq(otpCodes.recipientId, me.id)).orderBy(desc(otpCodes.createdAt)).limit(1);
    if (!otp) return { kind: "wrong", message: "Request a code first." };
    if (otp.consumedAt) {
      // Used by a successful check moments ago (double submit): nothing more to do,
      // and no second session is granted for an already used code.
      if (otp.expiresAt.getTime() > now.getTime() && safeEqual(otp.codeHash, hash)) return { kind: "replay" };
      return { kind: "wrong", message: "This code has expired. Request a new one." };
    }
    if (otp.expiresAt.getTime() <= now.getTime()) return { kind: "wrong", message: "This code has expired. Request a new one." };
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return { kind: "wrong", message: "Too many incorrect attempts. Request a new code." };
    const attempts = otp.attempts + 1;
    const match = safeEqual(otp.codeHash, hash);
    await tx
      .update(otpCodes)
      .set({ attempts, ...(match ? { consumedAt: now } : {}) })
      .where(eq(otpCodes.id, otp.id));
    if (!match) {
      if (purpose === "act") {
        await appendEnvelopeEvent(tx, {
          envelopeId: ctx.envelope.id,
          recipientId: me.id,
          type: "otp.failed",
          ip: meta.ip,
          userAgent: meta.userAgent,
          data: { attempt: attempts },
        });
      }
      const left = OTP_MAX_ATTEMPTS - attempts;
      return {
        kind: "wrong",
        attempt: attempts,
        message: left > 0 ? `That code is not right. ${left} ${left === 1 ? "attempt" : "attempts"} left.` : "Too many incorrect attempts. Request a new code.",
      };
    }
    if (purpose === "act") {
      if (me.status === "SENT") await changeRecipientStatus(tx, me, "VIEWED");
      await appendEnvelopeEvent(tx, {
        envelopeId: ctx.envelope.id,
        recipientId: me.id,
        type: "otp.verified",
        ip: meta.ip,
        userAgent: meta.userAgent,
        data: { channel: "email", email: maskEmail(me.email) },
      });
    }
    return { kind: "verified" };
  });

  if (outcome.kind === "expired" || outcome.kind === "replaced") return throwLockOutcome(outcome);
  if (outcome.kind === "closed") throw isInFlight(outcome.status) ? nothingToDo() : closedError(outcome.status);
  if (purpose === "final_copy" && (outcome.kind === "verified" || (outcome.kind === "wrong" && outcome.attempt))) {
    await appendAudit({
      action: outcome.kind === "verified" ? "esign.final_otp_verified" : "esign.final_otp_failed",
      actorRole: "signer",
      entityType: "esign.envelope",
      entityId: ctx.envelope.id,
      ip: meta.ip,
      data: { recipientId: ctx.recipient.id },
    });
  }
  if (outcome.kind === "wrong") throw new EsignError(outcome.message, 400);
  if (outcome.kind === "verified") await setSignerSession(token, ctx.recipient.id, ctx.tokenHash);
}

/* ------------------------------------------------------------------ */
/* Document access                                                     */
/* ------------------------------------------------------------------ */

const NEEDS_OTP = "Confirm your email with the one-time code first.";

async function readOrRecord(ctx: SignerContext, key: string, expected: string | null, kind: "original" | "final", meta: RequestMeta) {
  try {
    return await readStoredDocument(key, expected, kind);
  } catch (err) {
    if (err instanceof StoredDocumentMismatchError && kind === "original") {
      await recordIntegrityFailure(ctx.envelope.id, err, { ...meta, recipientId: ctx.recipient.id, expected });
    }
    throw err;
  }
}

/** Original (locked) PDF for a verified signer whose turn it is. */
export async function openLockedDocument(token: string, meta: RequestMeta): Promise<{ bytes: Buffer; name: string }> {
  const ctx = await resolveSignerFresh(token);
  requireActive(ctx);
  if (!(await hasSignerSession(ctx.recipient.id, ctx.tokenHash))) throw new EsignError(NEEDS_OTP, 401);
  if ((await otpPurpose(ctx)) !== "act") throw nothingToDo();
  await limit(`esign:doc:${ctx.recipient.id}`, ESIGN_RATE_LIMITS.documentPerRecipient);
  const bytes = await readOrRecord(ctx, ctx.envelope.originalStorageKey, ctx.envelope.lockedSha256, "original", meta);
  await db.transaction(async (tx) => {
    await appendEnvelopeEvent(tx, {
      envelopeId: ctx.envelope.id,
      recipientId: ctx.recipient.id,
      type: "document.opened",
      documentSha256: ctx.envelope.lockedSha256,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  });
  return { bytes, name: ctx.envelope.originalName };
}

/** Final PDF for any party of a completed envelope, after the email OTP on the link from the completion email. */
export async function openFinalDocument(token: string, meta: RequestMeta): Promise<{ bytes: Buffer; name: string }> {
  const ctx = await resolveSigner(token);
  requireActive(ctx);
  if (!finalReady(ctx.envelope) || !ctx.envelope.finalStorageKey) {
    throw new EsignError("The signed copy is available once everyone has finished.", 409);
  }
  if (!(await hasSignerSession(ctx.recipient.id, ctx.tokenHash))) {
    throw new EsignError(`${NEEDS_OTP} Open your link and ask for a code.`, 401);
  }
  await limit(`esign:final:${ctx.recipient.id}`, ESIGN_RATE_LIMITS.documentPerRecipient);
  const bytes = await readOrRecord(ctx, ctx.envelope.finalStorageKey, ctx.envelope.finalSha256, "final", meta);
  await appendAudit({
    action: "esign.final_downloaded",
    actorRole: "signer",
    entityType: "esign.envelope",
    entityId: ctx.envelope.id,
    ip: meta.ip,
    data: { recipientId: ctx.recipient.id },
  });
  const base = ctx.envelope.originalName.replace(/\.pdf$/i, "");
  return { bytes, name: `${base} (signed).pdf` };
}

/* ------------------------------------------------------------------ */
/* Approve, sign, decline                                              */
/* ------------------------------------------------------------------ */

type Act =
  | { kind: "approve" }
  | { kind: "sign"; signature: SignatureInput }
  | { kind: "decline"; reason: string };

function decodeSignature(sig: SignatureInput): { kind: "typed" | "drawn"; text: string | null; image: string | null; digest: string } {
  if (sig.kind === "typed") return { kind: "typed", text: sig.text, image: null, digest: sha256(sig.text) };
  const b64 = sig.image.slice("data:image/png;base64,".length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new EsignError("The drawn signature could not be read. Clear it and draw again.");
  const png = Buffer.from(b64, "base64");
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 64 || !magic.every((b, i) => png[i] === b)) {
    throw new EsignError("The drawn signature must be a PNG image. Clear it and draw again.");
  }
  if (png.length > MAX_SIGNATURE_PNG_BYTES) throw new EsignError("The drawn signature is too large. Clear it and draw a simpler one.");
  return { kind: "drawn", text: null, image: sig.image, digest: sha256(png) };
}

function targetStatus(action: Act, recipientAction: string) {
  return action.kind === "decline" ? "DECLINED" : completedStatusFor(recipientAction);
}

/**
 * A repeat of an action that already succeeded, sent with a link that has since
 * been replaced (the final signature completes the envelope, which issues every
 * party a fresh download link). The signer session cookie, bound to this exact
 * token, proves the request comes from the verified signer, so the same outcome
 * is reported again instead of an "invalid link" error.
 */
async function replayedAct(token: string, action: Act): Promise<{ completed: boolean } | null> {
  const recipientId = await currentSignerSession(sha256(token));
  if (!recipientId) return null;
  const [row] = await db
    .select({ status: recipients.status, action: recipients.action, envelopeStatus: envelopes.status })
    .from(recipients)
    .innerJoin(envelopes, eq(envelopes.id, recipients.envelopeId))
    .where(eq(recipients.id, recipientId))
    .limit(1);
  if (!row || !actionRule(row.action)?.actionable) return null;
  return row.status === targetStatus(action, row.action) ? { completed: row.envelopeStatus === "COMPLETED" } : null;
}

async function finishIfAllDone(envelopeId: string): Promise<boolean> {
  try {
    return Boolean(await completeEnvelope(envelopeId));
  } catch (err) {
    // The signature itself is saved; the owner can retry completion from their page.
    console.error("[esign] completion failed", envelopeId, err);
    return false;
  }
}

/**
 * Approve, sign or decline. Idempotent: repeating the same action (double click,
 * network retry) returns the recorded outcome without a second record. Two
 * signers acting at once are serialised by the envelope row lock, so only one of
 * them can finish a routing step or complete the envelope, and no one can act
 * before the earlier steps are done.
 */
async function act(token: string, action: Act, meta: RequestMeta): Promise<{ completed: boolean }> {
  const ctx = await resolveSignerFresh(token);
  if (!ctx) {
    const replay = await replayedAct(token, action);
    if (replay) return replay;
  }
  requireActive(ctx);
  await limit(`esign:act:${ctx.recipient.id}`, ESIGN_RATE_LIMITS.signerActPerRecipient);
  if (!(await hasSignerSession(ctx.recipient.id, ctx.tokenHash))) {
    throw new EsignError("Your verification has timed out. Request a new code to continue.", 401);
  }
  const verb = actionRule(ctx.recipient.action)?.verb;
  if (action.kind !== "decline" && verb !== action.kind) {
    throw new EsignError(verb === "approve" ? "Your part is to review and approve, not sign." : verb === "sign" ? "Your part is to sign, not approve." : "Copy recipients do not act on the document.");
  }
  const signature = action.kind === "sign" ? decodeSignature(action.signature) : null;

  // The bytes being approved or signed must be exactly the locked bytes.
  let documentSha256: string | null = null;
  if (action.kind !== "decline") {
    await readOrRecord(ctx, ctx.envelope.originalStorageKey, ctx.envelope.lockedSha256, "original", meta);
    documentSha256 = ctx.envelope.lockedSha256;
  }

  const result = await db.transaction(async (tx) => {
    const locked = await lockSignerTx(tx, ctx);
    if (locked.kind !== "ok") return locked;
    const { envelope, all: before, me } = locked;
    // Same action already recorded: report it again, record nothing new.
    if (me.status === targetStatus(action, me.action)) return { kind: "repeat" as const, envelope, allDone: allActionableDone(before) };
    if (!canRecipientAct(me, before, envelope.status)) return { kind: "closed" as const, status: envelope.status };
    const now = new Date();
    const base = { actedAt: now, ip: meta.ip, userAgent: meta.userAgent };
    let updated: RecipientRow;

    if (action.kind === "decline") {
      await changeRecipientStatus(tx, me, "DECLINED", { ...base, declineReason: action.reason });
      updated = { ...me, ...base, status: "DECLINED", declineReason: action.reason };
      await appendEnvelopeEvent(tx, {
        envelopeId: envelope.id,
        recipientId: me.id,
        type: "recipient.declined",
        ip: meta.ip,
        userAgent: meta.userAgent,
        data: { action: me.action, roleLabel: me.roleLabel, routingOrder: me.routingOrder, reason: action.reason },
      });
    } else {
      await appendEnvelopeEvent(tx, {
        envelopeId: envelope.id,
        recipientId: me.id,
        type: "consent.accepted",
        documentSha256,
        ip: meta.ip,
        userAgent: meta.userAgent,
        data: { consentVersion: CONSENT_VERSION, consentSha256: sha256(CONSENT_TEXT) },
      });
      const status = completedStatusFor(me.action);
      const patch = {
        ...base,
        signedSha256: documentSha256,
        signatureKind: signature?.kind ?? null,
        signatureText: signature?.text ?? null,
        signatureImage: signature?.image ?? null,
      };
      await changeRecipientStatus(tx, me, status, patch);
      updated = { ...me, ...patch, status };
      await appendEnvelopeEvent(tx, {
        envelopeId: envelope.id,
        recipientId: me.id,
        type: status === "APPROVED" ? "recipient.approved" : "recipient.signed",
        documentSha256,
        ip: meta.ip,
        userAgent: meta.userAgent,
        data: {
          action: me.action,
          roleLabel: me.roleLabel,
          routingOrder: me.routingOrder,
          authMethod: "email_otp",
          ...(signature ? { signatureKind: signature.kind, signatureSha256: signature.digest, typedName: signature.text } : {}),
        },
      });
    }

    const after = before.map((r) => (r.id === me.id ? updated : r));
    const plan = planAfterAction(before, after, envelope.status as EnvelopeStatus);
    if (plan.envelopeStatus !== envelope.status) {
      await changeEnvelopeStatus(tx, envelope, plan.envelopeStatus);
    } else {
      await tx.update(envelopes).set({ updatedAt: now }).where(eq(envelopes.id, envelope.id));
    }
    if (plan.orderCompleted !== null) {
      await appendEnvelopeEvent(tx, { envelopeId: envelope.id, type: "order.completed", data: { routingOrder: plan.orderCompleted } });
    }
    const links: IssuedLink[] = [];
    for (const r of plan.notify) links.push(await issueLinkTx(tx, envelope.id, r, "next_order"));
    return { kind: "done" as const, envelope: { ...envelope, status: plan.envelopeStatus }, me: updated, plan, links };
  });

  if (result.kind === "expired" || result.kind === "replaced") return throwLockOutcome(result);
  if (result.kind === "closed") throw closedError(result.status);
  if (result.kind === "repeat") {
    // A retry also heals a completion that failed after the last signature.
    if (result.allDone && isInFlight(result.envelope.status)) return { completed: await finishIfAllDone(result.envelope.id) };
    return { completed: result.envelope.status === "COMPLETED" };
  }

  await appendAudit({
    action: `esign.recipient_${action.kind === "decline" ? "declined" : action.kind === "approve" ? "approved" : "signed"}`,
    actorRole: "signer",
    entityType: "esign.envelope",
    entityId: result.envelope.id,
    ip: meta.ip,
    data: { recipientId: result.me.id, documentSha256 },
  });
  if (action.kind === "decline") {
    await sendDeclinedNotice(result.envelope, result.me, action.reason);
    return { completed: false };
  }
  await sendNextOrderInvites(result.envelope, result.links);
  if (result.plan.allDone) return { completed: await finishIfAllDone(result.envelope.id) };
  return { completed: false };
}

export const approveAsReviewer = (token: string, meta: RequestMeta) => act(token, { kind: "approve" }, meta);
export const signDocument = (token: string, signature: SignatureInput, meta: RequestMeta) => act(token, { kind: "sign", signature }, meta);
export const declineEnvelope = (token: string, reason: string, meta: RequestMeta) => act(token, { kind: "decline", reason }, meta);
