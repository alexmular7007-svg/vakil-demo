import "server-only";
import { and, count, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import { advocateProfiles, envelopes, payments, rightsRequests, usageLedger, user } from "@/lib/db/schema";

/** YYYY-MM-DD in Asia/Kolkata (the usage ledger's day boundary). */
export function istDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

/** Admin overview figures. Owner connection: call only after requireAdmin(). */
export async function adminOverview() {
  const today = istDay();
  const from30 = istDay(new Date(Date.now() - 29 * 24 * 3600 * 1000));
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const now = new Date();

  const [
    [users],
    [banned],
    [pending],
    [verified],
    [aiToday],
    [ai30],
    envelopeRows,
    [rightsOpen],
    [rightsOverdue],
    [revenue30],
  ] = await Promise.all([
    db.select({ n: count() }).from(user),
    db.select({ n: count() }).from(user).where(eq(user.banned, true)),
    db.select({ n: count() }).from(advocateProfiles).where(eq(advocateProfiles.verificationStatus, "pending")),
    db.select({ n: count() }).from(advocateProfiles).where(eq(advocateProfiles.verificationStatus, "verified")),
    db
      .select({ cost: sum(usageLedger.costMicros), queries: sum(usageLedger.queries), users: count() })
      .from(usageLedger)
      .where(eq(usageLedger.day, today)),
    db
      .select({ cost: sum(usageLedger.costMicros), queries: sum(usageLedger.queries), users: sql<number>`count(distinct ${usageLedger.userId})` })
      .from(usageLedger)
      .where(gte(usageLedger.day, from30)),
    db.select({ status: envelopes.status, n: count() }).from(envelopes).groupBy(envelopes.status),
    db.select({ n: count() }).from(rightsRequests).where(inArray(rightsRequests.status, ["open", "in_progress"])),
    db
      .select({ n: count() })
      .from(rightsRequests)
      .where(and(inArray(rightsRequests.status, ["open", "in_progress"]), lt(rightsRequests.dueAt, now))),
    db
      .select({ paise: sum(payments.amountPaise), n: count() })
      .from(payments)
      .where(and(eq(payments.status, "paid"), gte(payments.paidAt, since30))),
  ]);

  return {
    users: Number(users?.n ?? 0),
    banned: Number(banned?.n ?? 0),
    pendingVerifications: Number(pending?.n ?? 0),
    verifiedAdvocates: Number(verified?.n ?? 0),
    aiToday: { costMicros: Number(aiToday?.cost ?? 0), queries: Number(aiToday?.queries ?? 0), users: Number(aiToday?.users ?? 0) },
    ai30: { costMicros: Number(ai30?.cost ?? 0), queries: Number(ai30?.queries ?? 0), users: Number(ai30?.users ?? 0) },
    envelopes: envelopeRows.map((r) => ({ status: r.status, n: Number(r.n) })).sort((a, b) => b.n - a.n),
    rightsOpen: Number(rightsOpen?.n ?? 0),
    rightsOverdue: Number(rightsOverdue?.n ?? 0),
    revenue30: { paise: Number(revenue30?.paise ?? 0), payments: Number(revenue30?.n ?? 0) },
  };
}

/** micro-USD -> "$1.23" */
export function formatUsdMicros(micros: number) {
  const usd = micros / 1_000_000;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: usd < 10 ? 4 : 2 }).format(usd);
}
