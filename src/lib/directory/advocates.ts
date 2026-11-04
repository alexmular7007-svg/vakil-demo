import "server-only";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, withUser } from "@/lib/db";
import { advocateProfiles, user as userTable } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";

export const PUBLIC_ADVOCATES_TAG = "public-advocates";

/** Columns that are safe to show in the directory (verified + listed profiles only). */
const listedColumns = {
  userId: advocateProfiles.userId,
  displayName: advocateProfiles.displayName,
  enrolmentNo: advocateProfiles.enrolmentNo,
  stateBarCouncil: advocateProfiles.stateBarCouncil,
  enrolmentYear: advocateProfiles.enrolmentYear,
  practiceAreas: advocateProfiles.practiceAreas,
  courts: advocateProfiles.courts,
  languages: advocateProfiles.languages,
  city: advocateProfiles.city,
  state: advocateProfiles.state,
  bio: advocateProfiles.bio,
  acceptsConsultations: advocateProfiles.acceptsConsultations,
};

export type ListedAdvocate = {
  userId: string;
  displayName: string;
  enrolmentNo: string;
  stateBarCouncil: string;
  enrolmentYear: number | null;
  practiceAreas: string[];
  courts: string[];
  languages: string[];
  city: string | null;
  state: string | null;
  bio: string | null;
  acceptsConsultations: boolean;
};

export type AdvocateFilters = {
  q?: string;
  area?: string;
  city?: string;
  language?: string;
  court?: string;
};

const PAGE_SIZE = 24;

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Directory search for signed-in users. Runs through withUser, so row-level security
 * already limits rows to verified + listed profiles (plus the caller's own); the
 * explicit filters below keep the caller's own unverified profile out of the list.
 * Order is alphabetical and stable: the list is never ranked.
 */
export async function searchListedAdvocates(userId: string, filters: AdvocateFilters, page = 1) {
  const conds: SQL[] = [eq(advocateProfiles.verificationStatus, "verified"), eq(advocateProfiles.isListed, true)];
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    const nameOrEnrolment = or(ilike(advocateProfiles.displayName, like), ilike(advocateProfiles.enrolmentNo, like));
    if (nameOrEnrolment) conds.push(nameOrEnrolment);
  }
  if (filters.area) conds.push(sql`${filters.area} = any(${advocateProfiles.practiceAreas})`);
  if (filters.language) conds.push(sql`${filters.language} = any(${advocateProfiles.languages})`);
  if (filters.city) conds.push(ilike(advocateProfiles.city, `%${escapeLike(filters.city)}%`));
  if (filters.court) {
    const like = `%${escapeLike(filters.court)}%`;
    conds.push(sql`exists (select 1 from unnest(${advocateProfiles.courts}) as c(name) where c.name ilike ${like})`);
  }
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;
  const rows = await withUser(userId, (tx) =>
    tx
      .select(listedColumns)
      .from(advocateProfiles)
      .where(and(...conds))
      .orderBy(asc(sql`lower(${advocateProfiles.displayName})`), asc(advocateProfiles.userId))
      .limit(PAGE_SIZE + 1)
      .offset(offset),
  );
  return { rows: rows.slice(0, PAGE_SIZE) as ListedAdvocate[], hasMore: rows.length > PAGE_SIZE, pageSize: PAGE_SIZE };
}

/** One listed advocate, read through RLS (null if not verified + listed). */
export async function getListedAdvocate(viewerId: string, advocateUserId: string): Promise<ListedAdvocate | null> {
  const [row] = await withUser(viewerId, (tx) =>
    tx
      .select(listedColumns)
      .from(advocateProfiles)
      .where(
        and(
          eq(advocateProfiles.userId, advocateUserId),
          eq(advocateProfiles.verificationStatus, "verified"),
          eq(advocateProfiles.isListed, true),
        ),
      )
      .limit(1),
  );
  return (row as ListedAdvocate | undefined) ?? null;
}

/**
 * Public marketing directory. Owner connection inside a cache scope, but the query
 * only ever returns verified + listed profiles and public columns.
 */
export async function publicListedAdvocates(): Promise<ListedAdvocate[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_ADVOCATES_TAG);
  const rows = await db
    .select(listedColumns)
    .from(advocateProfiles)
    .where(and(eq(advocateProfiles.verificationStatus, "verified"), eq(advocateProfiles.isListed, true)))
    .orderBy(asc(sql`lower(${advocateProfiles.displayName})`), asc(advocateProfiles.userId))
    .limit(500);
  return rows as ListedAdvocate[];
}

/**
 * Service action (owner connection). It can only move a profile back to `pending`
 * and clear the reviewer fields; it can never verify. Used when an advocate changes
 * the enrolment number or State Bar Council after review, or resubmits after a
 * rejection. The 'advocate' role granted on approval is withdrawn until re-review.
 */
export async function resetAdvocateVerificationToPending(userId: string, reason: "enrolment_changed" | "resubmitted") {
  const [row] = await db
    .update(advocateProfiles)
    .set({ verificationStatus: "pending", verifiedBy: null, verifiedAt: null, rejectionReason: null, updatedAt: new Date() })
    .where(eq(advocateProfiles.userId, userId))
    .returning({ userId: advocateProfiles.userId });
  if (!row) return false;
  await db
    .update(userTable)
    .set({ role: "user", updatedAt: new Date() })
    .where(and(eq(userTable.id, userId), eq(userTable.role, "advocate")));
  await appendAudit({
    action: "advocate.verification_reset",
    actorId: userId,
    entityType: "advocate_profile",
    entityId: userId,
    data: { reason },
  });
  return true;
}
