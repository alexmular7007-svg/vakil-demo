"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { consents } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";

/** Records the consents ticked at sign-up. Identity comes from the verified session only. */
export async function recordSignupConsent(marketing: boolean) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const purposes = ["service", "ai_processing", ...(marketing ? ["marketing"] : [])];
  await withUser(user.id, (tx) =>
    tx.insert(consents).values(purposes.map((purpose) => ({ userId: user.id, purpose, noticeVersion: PRIVACY_NOTICE_VERSION }))),
  );
  await appendAudit({ action: "privacy.consent_granted", actorId: user.id, entityType: "user", entityId: user.id, data: { purposes } });
  return { ok: true };
}
