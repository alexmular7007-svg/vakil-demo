import "server-only";
import { and, asc, eq, inArray, lte, or } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { advocateProfiles, envelopes, events, recipients, user as users } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/dal";
import { randomToken, sha256 } from "@/lib/crypto";
import type { Email } from "@/lib/email";
import { env, features } from "@/lib/env";
import { deleteFile, putFile } from "@/lib/files/storage";
import { cleanFilename, maxUploadBytes, sniffFile } from "@/lib/files/validate";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  AADHAAR_UNAVAILABLE,
  CONSENT_VERSION,
  ESIGN_RATE_LIMITS,
  EXCLUDED_EXPLANATION,
  EXPIRY_SWEEP_BATCH,
  IN_FLIGHT_STATUSES,
  MAX_EXPIRY_DAYS,
  MAX_RECIPIENTS,
  MIN_EXPIRY_DAYS,
  actionLabels,
  actionRule,
  findCategory,
  isExcludedCategory,
  recipientStatusLabels,
  roleLabels,
  roleRule,
  type RecipientAction,
  type RecipientStatus,
  type RoleLabel,
} from "./constants";
import type { RequestMeta } from "./context";
import { StoredDocumentMismatchError, readStoredDocument } from "./documents";
import { EsignError } from "./errors";
import { appendEnvelopeEvent, chainHead, lockEnvelope, type EnvelopeRow } from "./events";
import { formatIst, maskEmail } from "./format";
import {
  completedEmail,
  declinedEmail,
  deliver,
  expiredEmail,
  inviteEmail,
  ownerLink,
  signerLink,
  verifyLink,
  voidedEmail,
  type LinkReason,
} from "./notify";
import { UnsupportedTextError, buildFinalPdf, hasUnsupportedChars, inspectPdf, renderTextPdf, type CertificateRecipient } from "./pdf";
import { getProvider } from "./provider";
import { getDraftForSigning } from "@/lib/drafting/queries";
import type { EnvelopeInput } from "./schemas";
import { changeEnvelopeStatus, changeRecipientStatus } from "./state";
import {
  allActionableDone,
  currentOrder,
  initialRecipientsToNotify,
  isActionable,
  isDone,
  isExpiredAt,
  isInFlight,
  validateRouting,
} from "./workflow";

const DAY = 86_400_000;

export type { EnvelopeRow };
export type RecipientRow = typeof recipients.$inferSelect;

export type IssuedLink = { recipient: RecipientRow; token: string; reason: LinkReason };

const limit = (key: string, l: { limit: number; windowSeconds: number }) => enforceRateLimit(key, l.limit, l.windowSeconds);

const clampDays = (days: number) => Math.min(MAX_EXPIRY_DAYS, Math.max(MIN_EXPIRY_DAYS, Math.round(days)));

/* ------------------------------------------------------------------ */
/* Shared helpers (transaction-scoped)                                 */
/* ------------------------------------------------------------------ */

export async function loadEnvelopeTx(tx: Tx, envelopeId: string): Promise<EnvelopeRow | undefined> {
  const [row] = await tx.select().from(envelopes).where(eq(envelopes.id, envelopeId)).limit(1);
  return row;
}

/** Lock the owner's envelope row. Explicit ownership check: this runs on the owner connection, outside RLS. */
async function lockOwnedTx(tx: Tx, envelopeId: string, ownerId: string): Promise<EnvelopeRow> {
  const row = await lockEnvelope(tx, envelopeId, { ownerId });
  if (!row) throw new EsignError("Envelope not found.", 404);
  return row;
}

export async function loadRecipientsTx(tx: Tx, envelopeId: string): Promise<RecipientRow[]> {
  return tx
    .select()
    .from(recipients)
    .where(eq(recipients.envelopeId, envelopeId))
    .orderBy(asc(recipients.routingOrder), asc(recipients.createdAt), asc(recipients.id));
}

/**
 * Issue a fresh personal link for one recipient. Only the SHA-256 of the token is
 * stored; the token itself goes into the email and is never shown anywhere else.
 * Issuing a new link invalidates the previous one.
 */
export async function issueLinkTx(tx: Tx, envelopeId: string, r: RecipientRow, reason: LinkReason): Promise<IssuedLink> {
  const token = randomToken();
  const accessTokenHash = sha256(token);
  let status = r.status;
  if (r.status === "PENDING") {
    await changeRecipientStatus(tx, r, "SENT", { accessTokenHash });
    status = "SENT";
  } else {
    // A replacement link: the recipient's status does not change.
    await tx.update(recipients).set({ accessTokenHash }).where(eq(recipients.id, r.id));
  }
  await appendEnvelopeEvent(tx, {
    envelopeId,
    recipientId: r.id,
    type: "recipient.notified",
    data: { reason, routingOrder: r.routingOrder, action: r.action, roleLabel: r.roleLabel, email: maskEmail(r.email) },
  });
  return { recipient: { ...r, status, accessTokenHash }, token, reason };
}

async function ownerOf(ownerId: string): Promise<{ name: string; email: string }> {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, ownerId)).limit(1);
  return u ?? { name: "The sender", email: "" };
}

/* ------------------------------------------------------------------ */
/* Email delivery with failure reporting                               */
/* ------------------------------------------------------------------ */

/** What an outgoing email is for; recorded with failures so the owner can act on them. */
export type EmailKind = LinkReason | "voided" | "declined_notice" | "expired_notice" | "completed_notice";
type Outgoing = { email: Email; kind: EmailKind; recipientId: string | null };

/**
 * Send the emails and record every failure in the envelope's audit chain as an
 * "email.failed" event, so the owner sees it on the envelope page (with the
 * recipient whose link did not arrive) instead of it being lost in a log.
 */
async function deliverAndRecord(envelopeId: string, items: Outgoing[]): Promise<{ sent: number; failed: number }> {
  if (items.length === 0) return { sent: 0, failed: 0 };
  const res = await deliver(items.map((i) => i.email));
  const failures = items.filter((_, i) => !res.delivered[i]);
  if (failures.length > 0) {
    try {
      await db.transaction(async (tx) => {
        for (const f of failures) {
          await appendEnvelopeEvent(tx, {
            envelopeId,
            recipientId: f.recipientId,
            type: "email.failed",
            data: { kind: f.kind, to: f.recipientId ? maskEmail(f.email.to) : "owner" },
          });
        }
      });
    } catch (err) {
      console.error("[esign] could not record email failures", envelopeId, err);
    }
  }
  return { sent: res.sent, failed: res.failed };
}

function inviteFor(link: IssuedLink, envelope: Pick<EnvelopeRow, "title" | "message" | "expiresAt">, ownerName: string): Outgoing {
  return {
    kind: link.reason,
    recipientId: link.recipient.id,
    email: inviteEmail({
      to: link.recipient.email,
      recipientName: link.recipient.name,
      ownerName,
      title: envelope.title,
      message: envelope.message,
      roleLabel: link.recipient.roleLabel,
      action: link.recipient.action,
      link: signerLink(link.token),
      expiresAt: envelope.expiresAt,
      reason: link.reason === "final_copy" ? "initial" : link.reason,
    }),
  };
}

function expiredError(envelope: Pick<EnvelopeRow, "expiresAt">): EsignError {
  return new EsignError(`This envelope expired at ${formatIst(envelope.expiresAt)} before everyone finished.`, 409);
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export type NewDocument = { kind: "upload"; bytes: Uint8Array; filename: string } | { kind: "draft"; draftId: string };

type AdvocateLink = { userId: string; email: string; displayName: string };

/** Linked advocates must be verified and visible to the owner (listed, or the owner themself). */
async function resolveAdvocates(ownerId: string, list: EnvelopeInput["recipients"]): Promise<Map<string, AdvocateLink>> {
  const ids = [...new Set(list.map((r) => r.advocateUserId).filter((v): v is string => Boolean(v)))];
  const map = new Map<string, AdvocateLink>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ userId: advocateProfiles.userId, displayName: advocateProfiles.displayName, email: users.email })
    .from(advocateProfiles)
    .innerJoin(users, eq(users.id, advocateProfiles.userId))
    .where(
      and(
        inArray(advocateProfiles.userId, ids),
        eq(advocateProfiles.verificationStatus, "verified"),
        or(eq(advocateProfiles.isListed, true), eq(advocateProfiles.userId, ownerId)),
      ),
    );
  for (const r of rows) map.set(r.userId, r);
  if (map.size !== ids.length) {
    throw new EsignError("A linked advocate is no longer a verified, listed advocate. Remove the link and enter their email instead.");
  }
  return map;
}

/** Server-side re-check of the limits and routing rules (the zod schema is the first line). */
function assertEnvelopeRules(input: EnvelopeInput): void {
  if (input.recipients.length === 0 || input.recipients.length > MAX_RECIPIENTS) {
    throw new EsignError(`An envelope needs between 1 and ${MAX_RECIPIENTS} recipients.`, 400, { recipients: "Check the number of recipients." });
  }
  if (!Number.isInteger(input.expiryDays) || input.expiryDays < MIN_EXPIRY_DAYS || input.expiryDays > MAX_EXPIRY_DAYS) {
    const message = `Choose an expiry from ${MIN_EXPIRY_DAYS} to ${MAX_EXPIRY_DAYS} days.`;
    throw new EsignError(message, 400, { expiryDays: message });
  }
  const fieldErrors: Record<string, string> = {};
  input.recipients.forEach((r, i) => {
    if (r.advocateUserId && !roleRule(r.roleLabel)?.canLinkAdvocate) {
      fieldErrors[`recipients.${i}.roleLabel`] ??= "This role cannot be linked to an advocate profile.";
    }
  });
  const issues = validateRouting(input.recipients);
  for (const issue of issues) {
    const key = issue.index === null ? "recipients" : `recipients.${issue.index}.${issue.field ?? "routingOrder"}`;
    fieldErrors[key] ??= issue.message;
  }
  const first = Object.values(fieldErrors)[0];
  if (first) throw new EsignError(first, 400, fieldErrors);
}

export async function createEnvelope(owner: CurrentUser, input: EnvelopeInput, doc: NewDocument, meta: RequestMeta): Promise<{ id: string }> {
  if (input.signatureType === "aadhaar" && !features.aadhaarEsign) throw new EsignError(AADHAAR_UNAVAILABLE);
  if (isExcludedCategory(input.docCategory) || !findCategory(input.docCategory)) {
    throw new EsignError(EXCLUDED_EXPLANATION, 400, { docCategory: EXCLUDED_EXPLANATION });
  }
  assertEnvelopeRules(input);

  let bytes: Uint8Array;
  let originalName: string;
  if (doc.kind === "upload") {
    if (doc.bytes.byteLength === 0) throw new EsignError("The file is empty.");
    if (doc.bytes.byteLength > maxUploadBytes()) throw new EsignError(`The PDF is larger than ${env.MAX_UPLOAD_MB} MB.`, 413);
    if (sniffFile(doc.bytes, doc.filename)?.kind !== "pdf") {
      throw new EsignError("Upload a PDF file. Other file types cannot be sent for signature.", 415);
    }
    await inspectPdf(doc.bytes);
    bytes = doc.bytes;
    const name = cleanFilename(doc.filename);
    originalName = /\.pdf$/i.test(name) ? name : `${name}.pdf`;
  } else {
    const draft = await getDraftForSigning(owner.id, doc.draftId);
    if (!draft) throw new EsignError("That draft was not found.", 404);
    // Server-side guard: wills, powers of attorney and similar templates can never be e-signed.
    if (!draft.esignAllowed) {
      throw new EsignError(draft.esignNote ?? EXCLUDED_EXPLANATION, 422);
    }
    if (!draft.body.trim()) throw new EsignError("That draft is empty. Write it first, then send it for signature.");
    if (hasUnsupportedChars(draft.title) || hasUnsupportedChars(draft.body)) throw new UnsupportedTextError();
    bytes = await renderTextPdf({ title: draft.title, body: draft.body });
    originalName = cleanFilename(`${draft.title}.pdf`);
  }

  const advocates = await resolveAdvocates(owner.id, input.recipients);
  const stored = await putFile(bytes, { prefix: "esign", ext: "pdf" });
  const expiresAt = new Date(Date.now() + input.expiryDays * DAY);

  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(envelopes)
        .values({
          ownerId: owner.id,
          title: input.title,
          message: input.message ? input.message : null,
          docCategory: input.docCategory,
          status: "DRAFT",
          signatureType: input.signatureType,
          provider: input.signatureType === "aadhaar" ? env.ESIGN_PROVIDER : "internal",
          originalName,
          originalStorageKey: stored.key,
          originalSha256: stored.sha256,
          expiresAt,
        })
        .returning({ id: envelopes.id });
      await tx.insert(recipients).values(
        input.recipients.map((r) => {
          const adv = r.advocateUserId ? advocates.get(r.advocateUserId) : undefined;
          return {
            envelopeId: row.id,
            name: r.name,
            email: adv ? adv.email.toLowerCase() : r.email,
            roleLabel: r.roleLabel,
            action: r.action,
            routingOrder: r.routingOrder,
            authMethod: actionRule(r.action)?.authMethod ?? "email_otp",
            // Placeholder: an unusable random hash until the recipient's link is issued.
            accessTokenHash: sha256(randomToken()),
            advocateUserId: adv?.userId ?? null,
          };
        }),
      );
      return row.id;
    });
  } catch (err) {
    await deleteFile(stored.key).catch(() => undefined);
    throw err;
  }

  // Drafts have no esign.events (only DRAFT envelopes may be deleted, and events
  // are permanent), so draft creation is recorded in the platform audit log.
  await appendAudit({
    action: "esign.envelope_created",
    actorId: owner.id,
    entityType: "esign.envelope",
    entityId: id,
    ip: meta.ip,
    data: { source: doc.kind, originalSha256: stored.sha256, docCategory: input.docCategory, recipients: input.recipients.length },
  });
  return { id };
}

/* ------------------------------------------------------------------ */
/* Send                                                                */
/* ------------------------------------------------------------------ */

export async function sendEnvelope(owner: CurrentUser, envelopeId: string, meta: RequestMeta) {
  await limit(`esign:send:${owner.id}`, ESIGN_RATE_LIMITS.ownerSend);
  const result = await db.transaction(async (tx) => {
    const envelope = await lockOwnedTx(tx, envelopeId, owner.id);
    if (envelope.status !== "DRAFT") throw new EsignError("This envelope has already been sent.", 409);
    // IT Act First Schedule: checked again at the point of no return.
    if (isExcludedCategory(envelope.docCategory) || !findCategory(envelope.docCategory)) throw new EsignError(EXCLUDED_EXPLANATION, 422);
    if (envelope.signatureType === "aadhaar" && !features.aadhaarEsign) throw new EsignError(AADHAAR_UNAVAILABLE);
    if (env.isProd && !features.email) {
      throw new EsignError("Email delivery is not configured (RESEND_API_KEY), so signing links cannot be sent. Nothing was locked or sent.", 503);
    }
    const rs = await loadRecipientsTx(tx, envelopeId);
    const issues = validateRouting(rs);
    if (issues.length > 0) throw new EsignError(issues[0].message);

    // Lock: hash the exact bytes that will be signed and confirm they are the upload.
    let bytes: Buffer;
    try {
      bytes = await readStoredDocument(envelope.originalStorageKey, envelope.originalSha256, "original");
    } catch (err) {
      if (err instanceof StoredDocumentMismatchError) {
        throw new EsignError("The stored document no longer matches the fingerprint taken at upload, so it cannot be sent. Delete this draft and upload the file again.", 409);
      }
      throw err;
    }
    const lockedSha256 = sha256(bytes);
    const now = new Date();
    const days = clampDays((envelope.expiresAt.getTime() - envelope.createdAt.getTime()) / DAY);
    const expiresAt = new Date(now.getTime() + days * DAY);

    const provider = getProvider(envelope.signatureType);
    const ref = await provider.createEnvelope(
      bytes,
      rs.map((r) => ({ id: r.id, name: r.name, email: r.email, roleLabel: r.roleLabel, action: r.action, routingOrder: r.routingOrder })),
      { envelopeId, title: envelope.title, documentSha256: lockedSha256, expiresAt },
    );

    await changeEnvelopeStatus(tx, envelope, "OUT_FOR_SIGNATURE", { lockedSha256, lockedAt: now, expiresAt, providerRef: ref.ref });
    await appendEnvelopeEvent(tx, {
      envelopeId,
      type: "envelope.sent",
      documentSha256: lockedSha256,
      ip: meta.ip,
      userAgent: meta.userAgent,
      data: {
        title: envelope.title,
        docCategory: envelope.docCategory,
        signatureType: envelope.signatureType,
        provider: ref.provider,
        originalSha256: envelope.originalSha256,
        lockedSha256,
        draftCreatedAt: envelope.createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        recipients: rs.map((r) => ({
          id: r.id,
          roleLabel: r.roleLabel,
          action: r.action,
          routingOrder: r.routingOrder,
          email: maskEmail(r.email),
        })),
      },
    });
    const links: IssuedLink[] = [];
    for (const r of initialRecipientsToNotify(rs)) links.push(await issueLinkTx(tx, envelopeId, r, "initial"));
    return { envelope: { ...envelope, expiresAt }, links, lockedSha256 };
  });

  const mail = await deliverAndRecord(
    envelopeId,
    result.links.map((l) => inviteFor(l, result.envelope, owner.name)),
  );
  await appendAudit({
    action: "esign.envelope_sent",
    actorId: owner.id,
    entityType: "esign.envelope",
    entityId: envelopeId,
    ip: meta.ip,
    data: { lockedSha256: result.lockedSha256, notified: result.links.length, emailFailures: mail.failed },
  });
  return { notified: result.links.length, emailFailures: mail.failed };
}

/* ------------------------------------------------------------------ */
/* Void, delete, remind                                                */
/* ------------------------------------------------------------------ */

/** Void an envelope. Repeating it (double click, retry) is harmless. */
export async function voidEnvelope(owner: CurrentUser, envelopeId: string, reason: string, meta: RequestMeta) {
  const result = await db.transaction(async (tx) => {
    const envelope = await lockOwnedTx(tx, envelopeId, owner.id);
    if (envelope.status === "DRAFT") throw new EsignError("A draft has not been sent. Delete it instead.");
    if (envelope.status === "VOIDED") return { kind: "already" as const };
    if (await expireLockedTx(tx, envelope)) return { kind: "expired" as const, envelope };
    await changeEnvelopeStatus(tx, envelope, "VOIDED");
    await getProvider(envelope.signatureType).voidEnvelope({ provider: envelope.provider, ref: envelope.providerRef ?? envelope.id }, reason);
    await appendEnvelopeEvent(tx, {
      envelopeId,
      type: "envelope.voided",
      ip: meta.ip,
      userAgent: meta.userAgent,
      data: { reason, previousStatus: envelope.status },
    });
    const rs = await loadRecipientsTx(tx, envelopeId);
    // Everyone who has received a link hears that it no longer works.
    return { kind: "voided" as const, envelope, informed: rs.filter((r) => r.status !== "PENDING") };
  });
  if (result.kind === "already") return;
  if (result.kind === "expired") {
    await afterExpired(result.envelope);
    throw expiredError(result.envelope);
  }
  await deliverAndRecord(
    envelopeId,
    result.informed.map((r) => ({
      kind: "voided" as const,
      recipientId: r.id,
      email: voidedEmail({ to: r.email, recipientName: r.name, ownerName: owner.name, title: result.envelope.title, reason }),
    })),
  );
  await appendAudit({ action: "esign.envelope_voided", actorId: owner.id, entityType: "esign.envelope", entityId: envelopeId, ip: meta.ip, data: { reason } });
}

/** Delete a draft. Deleting one that is already gone is a no-op (double click). */
export async function deleteDraftEnvelope(owner: CurrentUser, envelopeId: string, meta: RequestMeta) {
  const key = await db.transaction(async (tx) => {
    const envelope = await lockEnvelope(tx, envelopeId, { ownerId: owner.id });
    if (!envelope) return null;
    if (envelope.status !== "DRAFT") throw new EsignError("Only drafts can be deleted. Void a sent envelope instead.", 409);
    await tx.delete(envelopes).where(and(eq(envelopes.id, envelopeId), eq(envelopes.status, "DRAFT")));
    return envelope.originalStorageKey;
  });
  if (!key) return;
  await deleteFile(key).catch(() => undefined);
  await appendAudit({ action: "esign.draft_deleted", actorId: owner.id, entityType: "esign.envelope", entityId: envelopeId, ip: meta.ip });
}

export async function remindRecipients(owner: CurrentUser, envelopeId: string, meta: RequestMeta) {
  await limit(`esign:remind:${owner.id}:${envelopeId}`, ESIGN_RATE_LIMITS.remindPerEnvelope);
  const result = await db.transaction(async (tx) => {
    const envelope = await lockOwnedTx(tx, envelopeId, owner.id);
    if (await expireLockedTx(tx, envelope)) return { kind: "expired" as const, envelope };
    if (!isInFlight(envelope.status)) throw new EsignError("Reminders can only be sent while the envelope is out for signature.", 409);
    const rs = await loadRecipientsTx(tx, envelopeId);
    const order = currentOrder(rs);
    const due = rs.filter((r) => isActionable(r) && !isDone(r) && r.status !== "DECLINED" && r.routingOrder === order);
    const links: IssuedLink[] = [];
    for (const r of due) links.push(await issueLinkTx(tx, envelopeId, r, "reminder"));
    return { kind: "reminded" as const, envelope, links };
  });
  if (result.kind === "expired") {
    await afterExpired(result.envelope);
    throw expiredError(result.envelope);
  }
  const mail = await deliverAndRecord(
    envelopeId,
    result.links.map((l) => inviteFor(l, result.envelope, owner.name)),
  );
  await appendAudit({
    action: "esign.reminders_sent",
    actorId: owner.id,
    entityType: "esign.envelope",
    entityId: envelopeId,
    ip: meta.ip,
    data: { count: result.links.length, emailFailures: mail.failed },
  });
  return { reminded: result.links.length, emailFailures: mail.failed };
}

/** Owner retry when every action is done but completion failed (e.g. PDF build error). Idempotent. */
export async function retryCompletion(owner: CurrentUser, envelopeId: string) {
  const status = async () =>
    (await db.select({ ownerId: envelopes.ownerId, status: envelopes.status }).from(envelopes).where(eq(envelopes.id, envelopeId)).limit(1))[0];
  const envelope = await status();
  if (!envelope || envelope.ownerId !== owner.id) throw new EsignError("Envelope not found.", 404);
  if (envelope.status === "COMPLETED") return;
  if (!isInFlight(envelope.status)) throw new EsignError("This envelope cannot be completed.", 409);
  if (await completeEnvelope(envelopeId)) return;
  if ((await status())?.status === "COMPLETED") return;
  throw new EsignError("Not everyone has finished yet, so the envelope cannot be completed.", 409);
}

/* ------------------------------------------------------------------ */
/* Expiry                                                              */
/* ------------------------------------------------------------------ */

/**
 * Inside a transaction that holds the envelope row lock: mark an overdue
 * in-flight envelope EXPIRED and record it. An envelope whose recipients all
 * finished in time is never expired (it is completed instead). Returns true if
 * it expired; the caller runs afterExpired() once the transaction commits.
 */
export async function expireLockedTx(tx: Tx, envelope: EnvelopeRow, rs?: readonly RecipientRow[]): Promise<boolean> {
  if (!isInFlight(envelope.status) || !isExpiredAt(envelope.expiresAt, new Date())) return false;
  const list = rs ?? (await loadRecipientsTx(tx, envelope.id));
  if (allActionableDone(list)) return false;
  await changeEnvelopeStatus(tx, envelope, "EXPIRED");
  await appendEnvelopeEvent(tx, { envelopeId: envelope.id, type: "envelope.expired", data: { expiresAt: envelope.expiresAt.toISOString() } });
  return true;
}

/** After an expiry has committed: tell the owner and write the platform audit. */
export async function afterExpired(envelope: Pick<EnvelopeRow, "id" | "ownerId" | "title" | "expiresAt">): Promise<void> {
  const owner = await ownerOf(envelope.ownerId);
  if (owner.email) {
    await deliverAndRecord(envelope.id, [
      {
        kind: "expired_notice",
        recipientId: null,
        email: expiredEmail({ to: owner.email, ownerName: owner.name, title: envelope.title, envelopeId: envelope.id, expiresAt: envelope.expiresAt }),
      },
    ]);
  }
  await appendAudit({ action: "esign.envelope_expired", actorRole: "system", entityType: "esign.envelope", entityId: envelope.id });
}

/** Mark an in-flight envelope EXPIRED if it is past expiresAt. Returns true if it changed. */
export async function expireIfDue(envelopeId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: envelopes.status, expiresAt: envelopes.expiresAt })
    .from(envelopes)
    .where(eq(envelopes.id, envelopeId))
    .limit(1);
  if (!row || !isInFlight(row.status) || !isExpiredAt(row.expiresAt, new Date())) return false;
  const changed = await db.transaction(async (tx) => {
    const envelope = await lockEnvelope(tx, envelopeId);
    if (!envelope) return null;
    return (await expireLockedTx(tx, envelope)) ? envelope : null;
  });
  if (!changed) return false;
  await afterExpired(changed);
  return true;
}

/** Expire every overdue envelope of one owner (used when they open their list). */
export async function expireDueForOwner(ownerId: string): Promise<void> {
  const due = await db
    .select({ id: envelopes.id })
    .from(envelopes)
    .where(and(eq(envelopes.ownerId, ownerId), inArray(envelopes.status, [...IN_FLIGHT_STATUSES]), lte(envelopes.expiresAt, new Date())))
    .limit(50);
  for (const d of due) await expireIfDue(d.id);
}

export type ExpirySweepResult = { checked: number; expired: number; completed: number; failed: number };

/**
 * Expire every in-flight envelope whose expiresAt has passed, oldest first and
 * at most `limit` per run (default EXPIRY_SWEEP_BATCH). Envelopes whose
 * recipients all finished before the deadline are completed instead. Each
 * envelope is re-checked under its row lock, so overlapping runs and signers
 * acting at the same moment are safe; one failure does not stop the sweep.
 * Intended for a scheduler.
 */
export async function expireOverdueEnvelopes(opts: { limit?: number } = {}): Promise<ExpirySweepResult> {
  const batch = Math.max(1, Math.min(Math.floor(opts.limit ?? EXPIRY_SWEEP_BATCH), 1000));
  const rows = await db
    .select({ id: envelopes.id })
    .from(envelopes)
    .where(and(inArray(envelopes.status, [...IN_FLIGHT_STATUSES]), lte(envelopes.expiresAt, new Date())))
    .orderBy(asc(envelopes.expiresAt))
    .limit(batch);
  const result: ExpirySweepResult = { checked: rows.length, expired: 0, completed: 0, failed: 0 };
  for (const { id } of rows) {
    try {
      if (await expireIfDue(id)) {
        result.expired++;
        continue;
      }
      if (await completeEnvelope(id)) result.completed++;
    } catch (err) {
      result.failed++;
      console.error("[esign] expiry sweep failed for", id, err);
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Completion                                                          */
/* ------------------------------------------------------------------ */

function decodePng(dataUrl: string | null): Uint8Array | null {
  if (!dataUrl?.startsWith("data:image/png;base64,")) return null;
  try {
    return new Uint8Array(Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
  } catch {
    return null;
  }
}

/** Record that a stored file failed its fingerprint check (separate transaction: the failing one rolls back). */
export async function recordIntegrityFailure(envelopeId: string, err: StoredDocumentMismatchError, meta: Partial<RequestMeta> & { recipientId?: string | null; expected?: string | null }) {
  try {
    await db.transaction(async (tx) => {
      await appendEnvelopeEvent(tx, {
        envelopeId,
        recipientId: meta.recipientId ?? null,
        type: "document.integrity_failed",
        documentSha256: err.actualSha256,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        data: { file: err.kind, expected: meta.expected ?? null },
      });
    });
  } catch (e) {
    console.error("[esign] could not record integrity failure", envelopeId, e);
  }
}

/**
 * Build the final PDF (original pages + signature page and certificate of
 * completion), store it, record its SHA-256, mark the envelope COMPLETED and
 * send every party (including CC) a personal download link. Idempotent: returns
 * null when there is nothing (left) to complete.
 */
export async function completeEnvelope(envelopeId: string): Promise<{ finalSha256: string } | null> {
  const stored: { key?: string } = {};
  let result: { envelope: EnvelopeRow; links: IssuedLink[]; finalSha256: string } | null;
  try {
    result = await db.transaction(async (tx) => {
      const envelope = await lockEnvelope(tx, envelopeId);
      if (!envelope || !isInFlight(envelope.status)) return null;
      const rs = await loadRecipientsTx(tx, envelopeId);
      if (!allActionableDone(rs)) return null;
      if (!envelope.lockedSha256) throw new Error("Envelope has no locked hash.");

      const original = await readStoredDocument(envelope.originalStorageKey, envelope.lockedSha256, "original");

      const head = await chainHead(tx, envelopeId);
      const consentRows = await tx
        .select({ recipientId: events.recipientId, data: events.data })
        .from(events)
        .where(and(eq(events.envelopeId, envelopeId), eq(events.type, "consent.accepted")));
      const consentBy = new Map<string, string>();
      for (const c of consentRows) {
        const v = (c.data as { consentVersion?: string } | null)?.consentVersion;
        if (c.recipientId && v) consentBy.set(c.recipientId, v);
      }
      const owner = await tx.select({ name: users.name }).from(users).where(eq(users.id, envelope.ownerId)).limit(1);
      const now = new Date();
      const certRecipients: CertificateRecipient[] = rs.map((r) => {
        const png = r.signatureKind === "drawn" ? decodePng(r.signatureImage) : null;
        const actionable = isActionable(r);
        return {
          roleLabel: roleLabels[r.roleLabel as RoleLabel] ?? r.roleLabel,
          actionLabel: actionLabels[r.action as RecipientAction] ?? r.action,
          routingOrder: r.routingOrder,
          name: r.name,
          maskedEmail: maskEmail(r.email),
          authMethod: actionable ? "Link sent to email + email one-time code (OTP)" : "None (receives a copy only)",
          outcome: actionable ? (recipientStatusLabels[r.status as RecipientStatus] ?? r.status) : "Receives the final copy",
          actedAtIst: r.actedAt ? formatIst(r.actedAt) : "",
          ip: r.ip ?? "",
          userAgent: r.userAgent ?? "",
          consentVersion: consentBy.get(r.id) ?? (actionable ? CONSENT_VERSION : null),
          signatureKind: r.signatureKind === "typed" || r.signatureKind === "drawn" ? r.signatureKind : null,
          signatureText: r.signatureKind === "typed" ? r.signatureText : null,
          signaturePng: png,
          signatureSha256:
            r.signatureKind === "drawn" && png ? sha256(png) : r.signatureKind === "typed" && r.signatureText ? sha256(r.signatureText) : null,
        };
      });
      const finalBytes = await buildFinalPdf(new Uint8Array(original), {
        envelopeId,
        title: envelope.title,
        category: findCategory(envelope.docCategory)?.label ?? envelope.docCategory,
        ownerName: owner[0]?.name ?? "—",
        createdAtIst: formatIst(envelope.createdAt),
        sentAtIst: formatIst(envelope.lockedAt),
        completedAtIst: formatIst(now),
        originalSha256: envelope.originalSha256,
        lockedSha256: envelope.lockedSha256,
        chainHeadHash: head.hash,
        chainEventCount: head.count,
        verifyUrl: verifyLink(envelopeId),
        recipients: certRecipients,
      });
      const file = await putFile(finalBytes, { prefix: "esign-final", ext: "pdf" });
      stored.key = file.key;

      await changeEnvelopeStatus(tx, envelope, "COMPLETED", { finalStorageKey: file.key, finalSha256: file.sha256, completedAt: now });
      await appendEnvelopeEvent(tx, {
        envelopeId,
        type: "envelope.completed",
        documentSha256: file.sha256,
        data: {
          lockedSha256: envelope.lockedSha256,
          finalSha256: file.sha256,
          certificateChainHead: head.hash,
          certificateEventCount: head.count,
        },
      });
      const links: IssuedLink[] = [];
      for (const r of rs) links.push(await issueLinkTx(tx, envelopeId, r, "final_copy"));
      return { envelope: { ...envelope, status: "COMPLETED", completedAt: now }, links, finalSha256: file.sha256 };
    });
  } catch (err) {
    if (stored.key) await deleteFile(stored.key).catch(() => undefined);
    if (err instanceof StoredDocumentMismatchError) await recordIntegrityFailure(envelopeId, err, {});
    throw err;
  }
  if (!result) return null;

  const { envelope, links, finalSha256 } = result;
  const owner = await ownerOf(envelope.ownerId);
  const mails: Outgoing[] = links.map((l) => ({
    kind: "final_copy" as const,
    recipientId: l.recipient.id,
    email: completedEmail({ to: l.recipient.email, name: l.recipient.name, title: envelope.title, link: signerLink(l.token), envelopeId, finalSha256 }),
  }));
  if (owner.email) {
    mails.push({
      kind: "completed_notice",
      recipientId: null,
      email: completedEmail({ to: owner.email, name: owner.name, title: envelope.title, link: ownerLink(envelopeId), envelopeId, finalSha256, forOwner: true }),
    });
  }
  await deliverAndRecord(envelopeId, mails);
  await appendAudit({ action: "esign.envelope_completed", actorRole: "system", entityType: "esign.envelope", entityId: envelopeId, data: { finalSha256 } });
  return { finalSha256 };
}

/* ------------------------------------------------------------------ */
/* Notifications used by the signer flow                               */
/* ------------------------------------------------------------------ */

export async function sendNextOrderInvites(envelope: EnvelopeRow, links: IssuedLink[]) {
  if (links.length === 0) return { sent: 0, failed: 0 };
  const owner = await ownerOf(envelope.ownerId);
  return deliverAndRecord(
    envelope.id,
    links.map((l) => inviteFor(l, envelope, owner.name)),
  );
}

export async function sendDeclinedNotice(envelope: EnvelopeRow, r: RecipientRow, reason: string) {
  const owner = await ownerOf(envelope.ownerId);
  if (!owner.email) return;
  await deliverAndRecord(envelope.id, [
    {
      kind: "declined_notice",
      recipientId: null,
      email: declinedEmail({
        to: owner.email,
        ownerName: owner.name,
        title: envelope.title,
        recipientName: r.name,
        roleLabel: r.roleLabel,
        action: r.action,
        reason,
        envelopeId: envelope.id,
      }),
    },
  ]);
}

export { ownerOf };
