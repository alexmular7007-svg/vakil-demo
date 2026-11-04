import "server-only";
import { env } from "@/lib/env";
import { sendEmail, type Email } from "@/lib/email";
import {
  LEGAL_FRAMING_SHORT,
  OTP_TTL_MINUTES,
  actionLabels,
  actionRule,
  roleLabels,
  type RecipientAction,
  type RoleLabel,
} from "./constants";
import { formatIst } from "./format";

const base = () => env.APP_URL.replace(/\/+$/, "");

export const signerLink = (token: string) => `${base()}/s/${token}`;
export const verifyLink = (envelopeId: string) => `${base()}/verify/${envelopeId}`;
export const ownerLink = (envelopeId: string) => `${base()}/app/sign/${envelopeId}`;

const FOOTER = `About this signature: ${LEGAL_FRAMING_SHORT}\n\nVaakil AI provides legal information and drafting tools. It is not a law firm.`;

function roleAction(role: string, action: string) {
  return `${actionLabels[action as RecipientAction] ?? action} as ${roleLabels[role as RoleLabel] ?? role}`;
}

export type LinkReason = "initial" | "next_order" | "reminder" | "final_copy";

function subjectVerb(action: string): string {
  const rule = actionRule(action);
  if (rule?.verb === "approve") return "review";
  return rule?.phase === "after_signers" ? "witness" : "sign";
}

export function inviteEmail(p: {
  to: string;
  recipientName: string;
  ownerName: string;
  title: string;
  message: string | null;
  roleLabel: string;
  action: string;
  link: string;
  expiresAt: Date;
  reason: Exclude<LinkReason, "final_copy">;
}): Email {
  const reminder = p.reason === "reminder";
  const intro =
    p.reason === "next_order"
      ? `The earlier steps are finished, and it is now your turn on "${p.title}", sent by ${p.ownerName} on Vaakil AI.`
      : reminder
        ? `This is a reminder: "${p.title}", sent by ${p.ownerName} on Vaakil AI, is waiting for you.`
        : `${p.ownerName} has sent you "${p.title}" on Vaakil AI.`;
  const lines = [
    `Hello ${p.recipientName},`,
    "",
    intro,
    `Your part: ${roleAction(p.roleLabel, p.action)}.`,
    "",
    ...(p.message ? [`Message from ${p.ownerName}:`, p.message, ""] : []),
    "Open your personal link:",
    p.link,
    "",
    "Do not forward this link. Before you can open the document you will confirm your email address with a one-time code.",
    ...(reminder ? ["This link replaces any earlier link we sent you for this document."] : []),
    `The link stops working at ${formatIst(p.expiresAt)}.`,
    "",
    "If you were not expecting this, you can ignore this email.",
    "",
    FOOTER,
  ];
  return {
    to: p.to,
    subject: reminder ? `Reminder: "${p.title}" is waiting for you` : `Please ${subjectVerb(p.action)}: ${p.title}`,
    text: lines.join("\n"),
  };
}

export function otpEmail(p: { to: string; code: string; title: string }): Email {
  return {
    to: p.to,
    subject: `Your Vaakil AI signing code: ${p.code}`,
    text: [
      `Your one-time code for "${p.title}" is:`,
      "",
      `    ${p.code}`,
      "",
      `It expires in ${OTP_TTL_MINUTES} minutes and works once. Vaakil AI will never ask you for this code by phone or chat; do not share it.`,
      "",
      "If you did not ask for a code, ignore this email.",
      "",
      FOOTER,
    ].join("\n"),
  };
}

export function declinedEmail(p: {
  to: string;
  ownerName: string;
  title: string;
  recipientName: string;
  roleLabel: string;
  action: string;
  reason: string;
  envelopeId: string;
}): Email {
  return {
    to: p.to,
    subject: `Declined: ${p.title}`,
    text: [
      `Hello ${p.ownerName},`,
      "",
      `${p.recipientName} (${roleAction(p.roleLabel, p.action)}) declined "${p.title}".`,
      "",
      "Their reason:",
      p.reason,
      "",
      "The envelope is now closed and no one else can act on it. To try again, correct the document and create a new envelope.",
      "",
      `View the audit trail: ${ownerLink(p.envelopeId)}`,
      "",
      FOOTER,
    ].join("\n"),
  };
}

export function voidedEmail(p: { to: string; recipientName: string; ownerName: string; title: string; reason: string }): Email {
  return {
    to: p.to,
    subject: `Cancelled: ${p.title}`,
    text: [
      `Hello ${p.recipientName},`,
      "",
      `${p.ownerName} has cancelled (voided) "${p.title}". No further action is needed, and earlier links no longer work.`,
      "",
      `Reason given: ${p.reason}`,
      "",
      FOOTER,
    ].join("\n"),
  };
}

export function expiredEmail(p: { to: string; ownerName: string; title: string; envelopeId: string; expiresAt: Date }): Email {
  return {
    to: p.to,
    subject: `Expired: ${p.title}`,
    text: [
      `Hello ${p.ownerName},`,
      "",
      `"${p.title}" expired at ${formatIst(p.expiresAt)} before every recipient finished. Signing links no longer work.`,
      "To continue, create a new envelope.",
      "",
      `View the audit trail: ${ownerLink(p.envelopeId)}`,
      "",
      FOOTER,
    ].join("\n"),
  };
}

export function completedEmail(p: {
  to: string;
  name: string;
  title: string;
  link: string;
  envelopeId: string;
  finalSha256: string;
  forOwner?: boolean;
}): Email {
  return {
    to: p.to,
    subject: `Completed: ${p.title}`,
    text: [
      `Hello ${p.name},`,
      "",
      `Everyone has finished "${p.title}". The final PDF includes a signature page and certificate of completion.`,
      "",
      p.forOwner ? "Download the final PDF and audit trail:" : "Download your copy (personal link, do not forward):",
      p.link,
      "",
      `Final document SHA-256: ${p.finalSha256}`,
      `Anyone can check a copy against this fingerprint at ${verifyLink(p.envelopeId)}`,
      "",
      FOOTER,
    ].join("\n"),
  };
}

/**
 * Send emails one by one; a failure is logged and counted, never thrown.
 * `delivered[i]` says whether emails[i] went out, so callers can record which
 * ones failed (see recordEmailFailures in service.ts).
 */
export async function deliver(emails: Email[]): Promise<{ sent: number; failed: number; delivered: boolean[] }> {
  let sent = 0;
  let failed = 0;
  const delivered: boolean[] = [];
  for (const e of emails) {
    try {
      await sendEmail(e);
      sent++;
      delivered.push(true);
    } catch (err) {
      failed++;
      delivered.push(false);
      console.error("[esign] email failed", e.subject, err);
    }
  }
  return { sent, failed, delivered };
}
