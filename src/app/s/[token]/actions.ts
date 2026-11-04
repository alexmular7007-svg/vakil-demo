"use server";

import { fail, ok, type ActionResult } from "@/lib/action";
import { requestMeta } from "@/lib/esign/context";
import { toEsignActionError } from "@/lib/esign/errors";
import { approveSubmitSchema, declineSchema, otpCodeSchema, signSubmitSchema, tokenSchema } from "@/lib/esign/schemas";
import { approveAsReviewer, declineEnvelope, requestOtp, signDocument, verifyOtp } from "@/lib/esign/signer";

// Public signer actions. There is no account: every call re-resolves the
// recipient from the link token (compared only as a SHA-256), and every action
// after the code step also requires the OTP-bound signer cookie.

function badToken(): ActionResult<never> {
  return fail("This signing link is not valid.");
}

export async function requestOtpAction(token: string): Promise<ActionResult<{ maskedEmail: string }>> {
  if (!tokenSchema.safeParse(token).success) return badToken();
  try {
    return ok(await requestOtp(token, await requestMeta()));
  } catch (err) {
    return toEsignActionError(err);
  }
}

export async function verifyOtpAction(token: string, code: string): Promise<ActionResult> {
  if (!tokenSchema.safeParse(token).success) return badToken();
  const parsed = otpCodeSchema.safeParse(code);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Enter the 6-digit code.");
  try {
    await verifyOtp(token, parsed.data, await requestMeta());
    return ok(undefined);
  } catch (err) {
    return toEsignActionError(err);
  }
}

export async function approveAction(token: string, input: unknown): Promise<ActionResult<{ completed: boolean }>> {
  if (!tokenSchema.safeParse(token).success) return badToken();
  const parsed = approveSubmitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please agree to the consent text.");
  try {
    return ok(await approveAsReviewer(token, await requestMeta()));
  } catch (err) {
    return toEsignActionError(err);
  }
}

export async function signAction(token: string, input: unknown): Promise<ActionResult<{ completed: boolean }>> {
  if (!tokenSchema.safeParse(token).success) return badToken();
  const parsed = signSubmitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check your signature.");
  try {
    return ok(await signDocument(token, parsed.data.signature, await requestMeta()));
  } catch (err) {
    return toEsignActionError(err);
  }
}

export async function declineAction(token: string, input: unknown): Promise<ActionResult> {
  if (!tokenSchema.safeParse(token).success) return badToken();
  const parsed = declineSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Give a reason.");
  try {
    await declineEnvelope(token, parsed.data.reason, await requestMeta());
    return ok(undefined);
  } catch (err) {
    return toEsignActionError(err);
  }
}
