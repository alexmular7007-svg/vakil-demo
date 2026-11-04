import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getCurrentUser, requestIp } from "@/lib/auth/dal";
import { db, withUser } from "@/lib/db";
import {
  advocateProfiles,
  assistants,
  chats,
  consents,
  consultations,
  documents,
  draftVersions,
  drafts,
  envelopes,
  events as esignEvents,
  feedback,
  matters,
  messages,
  payments,
  prompts,
  recipients,
  rightsRequests,
  subscriptions,
  usageLedger,
  user as userTable,
} from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";
import { site } from "@/lib/site";

/**
 * "Download my data" (DPDP Act s.11 right to access). Every table is read through
 * withUser, so row-level security limits the export to the caller's own rows.
 * Internal storage paths and signer token hashes are left out.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const rl = await rateLimit(`privacy-export:${user.id}`, 5, 3600);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "You can download your data 5 times an hour. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } },
    );
  }

  // The account row itself (app_user cannot read app.user): own id only, no secrets.
  const [account] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      emailVerified: userTable.emailVerified,
      phone: userTable.phone,
      locale: userTable.locale,
      persona: userTable.persona,
      role: userTable.role,
      twoFactorEnabled: userTable.twoFactorEnabled,
      createdAt: userTable.createdAt,
      updatedAt: userTable.updatedAt,
    })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1);

  const data = await withUser(user.id, async (tx) => {
    const envelopeRows = await tx
      .select({
        id: envelopes.id,
        title: envelopes.title,
        message: envelopes.message,
        docCategory: envelopes.docCategory,
        status: envelopes.status,
        signatureType: envelopes.signatureType,
        provider: envelopes.provider,
        originalName: envelopes.originalName,
        originalSha256: envelopes.originalSha256,
        lockedSha256: envelopes.lockedSha256,
        finalSha256: envelopes.finalSha256,
        expiresAt: envelopes.expiresAt,
        lockedAt: envelopes.lockedAt,
        completedAt: envelopes.completedAt,
        createdAt: envelopes.createdAt,
        updatedAt: envelopes.updatedAt,
      })
      .from(envelopes)
      .orderBy(asc(envelopes.createdAt));
    return {
      advocateProfile: (await tx.select().from(advocateProfiles).where(eq(advocateProfiles.userId, user.id)))[0] ?? null,
      matters: await tx.select().from(matters).orderBy(asc(matters.createdAt)),
      documents: await tx
        .select({
          id: documents.id,
          matterId: documents.matterId,
          name: documents.name,
          mime: documents.mime,
          size: documents.size,
          sha256: documents.sha256,
          pageCount: documents.pageCount,
          status: documents.status,
          textContent: documents.textContent,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
        })
        .from(documents)
        .orderBy(asc(documents.createdAt)),
      chats: await tx.select().from(chats).orderBy(asc(chats.createdAt)),
      messages: await tx.select().from(messages).orderBy(asc(messages.createdAt)),
      drafts: await tx.select().from(drafts).orderBy(asc(drafts.createdAt)),
      draftVersions: await tx.select().from(draftVersions).orderBy(asc(draftVersions.createdAt)),
      prompts: await tx.select().from(prompts).where(eq(prompts.ownerId, user.id)).orderBy(asc(prompts.createdAt)),
      assistants: await tx.select().from(assistants).orderBy(asc(assistants.createdAt)),
      consultations: await tx.select().from(consultations).orderBy(asc(consultations.createdAt)),
      esignEnvelopes: envelopeRows,
      esignRecipients: await tx
        .select({
          id: recipients.id,
          envelopeId: recipients.envelopeId,
          name: recipients.name,
          email: recipients.email,
          phone: recipients.phone,
          roleLabel: recipients.roleLabel,
          action: recipients.action,
          routingOrder: recipients.routingOrder,
          status: recipients.status,
          authMethod: recipients.authMethod,
          signatureKind: recipients.signatureKind,
          signatureText: recipients.signatureText,
          signedSha256: recipients.signedSha256,
          actedAt: recipients.actedAt,
          declineReason: recipients.declineReason,
          createdAt: recipients.createdAt,
        })
        .from(recipients),
      esignEvents: await tx.select().from(esignEvents).orderBy(asc(esignEvents.seq)),
      aiUsage: await tx.select().from(usageLedger).orderBy(asc(usageLedger.day)),
      aiFeedback: await tx.select().from(feedback).orderBy(asc(feedback.createdAt)),
      consents: await tx.select().from(consents).orderBy(asc(consents.grantedAt)),
      rightsRequests: await tx.select().from(rightsRequests).orderBy(asc(rightsRequests.createdAt)),
      subscriptions: await tx.select().from(subscriptions).orderBy(asc(subscriptions.createdAt)),
      payments: await tx.select().from(payments).orderBy(asc(payments.createdAt)),
    };
  });

  await appendAudit({
    action: "privacy.data_exported",
    actorId: user.id,
    entityType: "user",
    entityId: user.id,
    ip: await requestIp(),
  });

  const now = new Date();
  const body = JSON.stringify(
    {
      exportedAt: now.toISOString(),
      service: site.name,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      note: "Uploaded files are listed with their extracted text and SHA-256 hash; download originals from the Documents page.",
      account: account ?? null,
      ...data,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="vaakil-ai-data-${now.toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
