"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/dal";
import { defineAction } from "@/lib/define-action";
import { advocateProfiles, envelopes } from "@/lib/db/schema";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ESIGN_RATE_LIMITS } from "@/lib/esign/constants";
import { requestMeta, type RequestMeta } from "@/lib/esign/context";
import { EsignError, toEsignActionError } from "@/lib/esign/errors";
import { verifyEnvelopeChain, type EnvelopeChainReport } from "@/lib/esign/events";
import { advocateQuerySchema, envelopeIdSchema, voidSchema } from "@/lib/esign/schemas";
import {
  deleteDraftEnvelope,
  remindRecipients,
  retryCompletion,
  sendEnvelope,
  voidEnvelope,
} from "@/lib/esign/service";

// Owner-side e-sign actions.
//
// Reads use defineAction(): the query runs inside withUser(), so row-level
// security limits it to the signed-in owner's envelopes.
//
// Writes cannot: app_user may only SELECT from esign.* (security.sql keeps every
// envelope write on the owner connection, behind explicit ownership checks and
// the envelope row lock in src/lib/esign/service.ts). ownerMutation() below runs
// the same steps as defineAction in the same order (session, zod, rate limit,
// call, revalidate, safe error mapping); the service writes its own audit records.

const paths = (id?: string) => ["/app/sign", id ? `/app/sign/${id}` : null];

type Limit = { limit: number; windowSeconds: number };

async function ownerMutation<S extends z.ZodType, R>(opts: {
  input: S;
  raw: unknown;
  rateLimit?: { name: string } & Limit;
  run: (user: CurrentUser, input: z.output<S>, meta: RequestMeta) => Promise<R>;
  revalidate: (input: z.output<S>) => (string | null)[];
  invalid: string;
}): Promise<ActionResult<R>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  const parsed = opts.input.safeParse(opts.raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? opts.invalid);
  try {
    if (opts.rateLimit) await enforceRateLimit(`${opts.rateLimit.name}:${user.id}`, opts.rateLimit.limit, opts.rateLimit.windowSeconds);
    const result = await opts.run(user, parsed.data as z.output<S>, await requestMeta());
    for (const p of new Set(opts.revalidate(parsed.data as z.output<S>))) if (p) revalidatePath(p);
    return ok(result);
  } catch (err) {
    return toEsignActionError(err);
  }
}

export async function sendEnvelopeAction(envelopeId: string): Promise<ActionResult<{ notified: number; emailFailures: number }>> {
  // sendEnvelope applies its own per-owner rate limit.
  return ownerMutation({
    input: envelopeIdSchema,
    raw: envelopeId,
    invalid: "Unknown envelope.",
    run: (user, id, meta) => sendEnvelope(user, id, meta),
    revalidate: (id) => paths(id),
  });
}

export async function voidEnvelopeAction(input: { envelopeId: string; reason: string }): Promise<ActionResult> {
  return ownerMutation({
    input: voidSchema,
    raw: input,
    invalid: "Check the reason.",
    rateLimit: { name: "esign:void", ...ESIGN_RATE_LIMITS.ownerVoid },
    run: async (user, v, meta) => {
      await voidEnvelope(user, v.envelopeId, v.reason, meta);
      return undefined;
    },
    revalidate: (v) => paths(v.envelopeId),
  });
}

export async function deleteDraftAction(envelopeId: string): Promise<ActionResult> {
  return ownerMutation({
    input: envelopeIdSchema,
    raw: envelopeId,
    invalid: "Unknown envelope.",
    rateLimit: { name: "esign:delete", ...ESIGN_RATE_LIMITS.ownerDelete },
    run: async (user, id, meta) => {
      await deleteDraftEnvelope(user, id, meta);
      return undefined;
    },
    revalidate: () => paths(),
  });
}

export async function remindAction(envelopeId: string): Promise<ActionResult<{ reminded: number; emailFailures: number }>> {
  // remindRecipients applies its own per-envelope rate limit.
  return ownerMutation({
    input: envelopeIdSchema,
    raw: envelopeId,
    invalid: "Unknown envelope.",
    run: (user, id, meta) => remindRecipients(user, id, meta),
    revalidate: (id) => paths(id),
  });
}

export async function retryCompletionAction(envelopeId: string): Promise<ActionResult> {
  return ownerMutation({
    input: envelopeIdSchema,
    raw: envelopeId,
    invalid: "Unknown envelope.",
    rateLimit: { name: "esign:complete", ...ESIGN_RATE_LIMITS.ownerComplete },
    run: async (user, id) => {
      await retryCompletion(user, id);
      return undefined;
    },
    revalidate: (id) => paths(id),
  });
}

const verifyChain = defineAction({
  input: envelopeIdSchema,
  rateLimit: { name: "esign:verify-chain", ...ESIGN_RATE_LIMITS.ownerVerifyChain },
  run: async ({ tx, input }): Promise<EnvelopeChainReport> => {
    // RLS: another owner's envelope is simply not visible here.
    const [own] = await tx.select({ id: envelopes.id }).from(envelopes).where(eq(envelopes.id, input)).limit(1);
    if (!own) throw new EsignError("Envelope not found.", 404);
    return verifyEnvelopeChain(input, tx);
  },
});

export async function verifyChainAction(envelopeId: string): Promise<ActionResult<EnvelopeChainReport>> {
  return verifyChain(envelopeId);
}

export type AdvocateHit = {
  userId: string;
  displayName: string;
  enrolmentNo: string;
  stateBarCouncil: string;
  city: string | null;
};

const searchAdvocates = defineAction({
  // Short or empty queries return no hits rather than an error.
  input: z.string().max(200),
  rateLimit: { name: "esign:advocates", ...ESIGN_RATE_LIMITS.advocateSearch },
  run: async ({ tx, input }): Promise<AdvocateHit[]> => {
    const q = advocateQuerySchema.safeParse(input);
    if (!q.success) return [];
    const pattern = `%${q.data.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return tx
      .select({
        userId: advocateProfiles.userId,
        displayName: advocateProfiles.displayName,
        enrolmentNo: advocateProfiles.enrolmentNo,
        stateBarCouncil: advocateProfiles.stateBarCouncil,
        city: advocateProfiles.city,
      })
      .from(advocateProfiles)
      .where(
        and(
          eq(advocateProfiles.verificationStatus, "verified"),
          or(ilike(advocateProfiles.displayName, pattern), ilike(advocateProfiles.enrolmentNo, pattern)),
        ),
      )
      .limit(8);
  },
});

/** Verified advocates the user can see (listed ones, plus their own profile). Emails are never returned. */
export async function searchAdvocatesAction(query: string): Promise<ActionResult<AdvocateHit[]>> {
  if (typeof query !== "string" || query.trim().length < 2) return ok([]);
  return searchAdvocates(query);
}
