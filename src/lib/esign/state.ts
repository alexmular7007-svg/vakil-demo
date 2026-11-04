import "server-only";
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { envelopes, recipients } from "@/lib/db/schema";
import type { EnvelopeStatus, RecipientStatus } from "./constants";
import { EsignError } from "./errors";
import { assertRecipientTransition, assertTransition } from "./workflow";

// The only code that writes esign.envelopes.status and esign.recipients.status.
// Each function checks the transition against the maps in workflow.ts (a clear
// WorkflowError for an illegal one) and updates the row only if it still has the
// status the caller read, so a change made by a concurrent request is detected
// instead of overwritten. Callers hold the envelope row lock (lockEnvelope).
// A unit test fails if any other e-sign file sets a status column.

type EnvelopeRow = typeof envelopes.$inferSelect;
type RecipientRow = typeof recipients.$inferSelect;

/** Columns that may change together with an envelope's status. */
export type EnvelopePatch = Partial<
  Pick<EnvelopeRow, "lockedSha256" | "lockedAt" | "expiresAt" | "providerRef" | "finalStorageKey" | "finalSha256" | "completedAt">
>;

/** Columns that may change together with a recipient's status. */
export type RecipientPatch = Partial<
  Pick<
    RecipientRow,
    "accessTokenHash" | "actedAt" | "ip" | "userAgent" | "signedSha256" | "signatureKind" | "signatureText" | "signatureImage" | "declineReason"
  >
>;

const STALE = "This envelope changed while your request was being handled. Reload the page and try again.";

export async function changeEnvelopeStatus(
  tx: Tx,
  envelope: Pick<EnvelopeRow, "id" | "status">,
  to: EnvelopeStatus,
  patch: EnvelopePatch = {},
): Promise<void> {
  assertTransition(envelope.status as EnvelopeStatus, to);
  const rows = await tx
    .update(envelopes)
    .set({ ...patch, status: to, updatedAt: new Date() })
    .where(and(eq(envelopes.id, envelope.id), eq(envelopes.status, envelope.status)))
    .returning({ id: envelopes.id });
  if (rows.length !== 1) throw new EsignError(STALE, 409);
}

export async function changeRecipientStatus(
  tx: Tx,
  recipient: Pick<RecipientRow, "id" | "status" | "action">,
  to: RecipientStatus,
  patch: RecipientPatch = {},
): Promise<void> {
  assertRecipientTransition(recipient, to);
  const rows = await tx
    .update(recipients)
    .set({ ...patch, status: to })
    .where(and(eq(recipients.id, recipient.id), eq(recipients.status, recipient.status)))
    .returning({ id: recipients.id });
  if (rows.length !== 1) throw new EsignError(STALE, 409);
}
