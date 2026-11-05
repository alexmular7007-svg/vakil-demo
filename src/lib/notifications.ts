import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { hearingNotices } from "@/lib/diary/queries";
import { invoiceNotices } from "@/lib/fees/queries";
import { updateNotices } from "@/lib/updates/queries";
import { consultations, envelopes } from "@/lib/db/schema";

export type Notice = {
  id: string;
  kind: "hearing" | "signature" | "consultation" | "invoice" | "update";
  title: string;
  detail: string;
  href: string;
  /** ISO date-time the notice is about (hearing date, last update…). */
  at: string;
  urgent: boolean;
};

const DAY = 86_400_000;

/**
 * Things that need the user's attention, computed from their own rows (RLS applies).
 * Each source returns at most a handful of items.
 */
export async function getNotices(user: { id: string; role?: string | null }): Promise<Notice[]> {
  const [own, hearing, invoice, update] = await Promise.all([
    signatureAndConsultationNotices(user.id),
    hearingNotices(user.id).catch(() => []),
    invoiceNotices(user.id).catch(() => []),
    // Paid feature: empty without a trial or subscription.
    updateNotices(user).catch(() => []),
  ]);
  return [...hearing, ...own, ...update, ...invoice].sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

async function signatureAndConsultationNotices(userId: string): Promise<Notice[]> {
  return withUser(userId, async (tx) => {
    const now = Date.now();
    const out: Notice[] = [];

    const open = await tx
      .select({ id: envelopes.id, title: envelopes.title, status: envelopes.status, updatedAt: envelopes.updatedAt, expiresAt: envelopes.expiresAt })
      .from(envelopes)
      .where(and(eq(envelopes.ownerId, userId), inArray(envelopes.status, ["OUT_FOR_SIGNATURE", "PARTIALLY_SIGNED"])))
      .orderBy(asc(envelopes.expiresAt))
      .limit(5);
    for (const e of open) {
      const daysLeft = Math.ceil((e.expiresAt.getTime() - now) / DAY);
      out.push({
        id: `env-${e.id}`,
        kind: "signature",
        title: e.title,
        detail: e.status === "PARTIALLY_SIGNED" ? `Partly signed · expires in ${daysLeft} days` : `Awaiting signatures · expires in ${daysLeft} days`,
        href: `/app/sign/${e.id}`,
        at: e.updatedAt.toISOString(),
        urgent: daysLeft <= 3,
      });
    }

    const asks = await tx
      .select({ id: consultations.id, subject: consultations.subject, status: consultations.status, updatedAt: consultations.updatedAt })
      .from(consultations)
      .where(and(eq(consultations.advocateId, userId), eq(consultations.status, "requested")))
      .orderBy(desc(consultations.updatedAt))
      .limit(5);
    for (const c of asks) {
      out.push({
        id: `con-${c.id}`,
        kind: "consultation",
        title: c.subject,
        detail: "New consultation request",
        href: "/app/advocates/inbox",
        at: c.updatedAt.toISOString(),
        urgent: false,
      });
    }

    return out;
  });
}
