"use server";

import { z } from "zod";
import { requestIp } from "@/lib/auth/dal";
import { features } from "@/lib/env";
import { appendAudit } from "@/lib/audit";
import { adminForAction, NOT_ADMIN } from "@/lib/admin/guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { generateAadhaarOtp, verifyAadhaarOtp, verifyBankAccount, verifyPan, type KycResult } from "@/lib/kyc/cgpey";
import { AADHAAR_RE, IFSC_RE, PAN_RE, maskAccount, maskAadhaar, maskPan } from "@/lib/kyc/mask";

// Each call can deduct CGPEY wallet balance. Admin only, rate limited, inputs
// validated before anything leaves the server, and only masked numbers are audited.

async function guard(kind: string) {
  const admin = await adminForAction();
  if (!admin) return { error: NOT_ADMIN } as const;
  if (!features.cgpeyKyc) return { error: "CGPEY KYC is not configured on this server." } as const;
  await enforceRateLimit(`kyc:${admin.id}`, 10, 60);
  await enforceRateLimit(`kyc-${kind}:${admin.id}`, 30, 3600);
  return { admin } as const;
}

async function audit(adminId: string, action: string, masked: Record<string, string>, r: KycResult) {
  await appendAudit({
    action,
    actorId: adminId,
    actorRole: "admin",
    entityType: "kyc_test",
    ip: await requestIp(),
    data: { ...masked, success: r.ok, httpStatus: r.httpStatus },
  });
}

const panSchema = z.object({
  pan: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/\s+/g, ""))
    .refine((v) => PAN_RE.test(v), "Enter a valid 10-character PAN, e.g. ABCDE1234F."),
});

export async function kycVerifyPan(input: z.input<typeof panSchema>): Promise<ActionResult<KycResult>> {
  try {
    const g = await guard("pan");
    if ("error" in g) return fail(g.error ?? NOT_ADMIN);
    const parsed = panSchema.safeParse(input);
    if (!parsed.success) return toActionError(parsed.error);
    const r = await verifyPan(parsed.data.pan);
    await audit(g.admin.id, "kyc.pan_verification", { pan: maskPan(parsed.data.pan) }, r);
    return ok(r);
  } catch (err) {
    return toActionError(err);
  }
}

const bankSchema = z.object({
  accountNo: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ""))
    .refine((v) => /^\d{6,20}$/.test(v), "Enter the account number (6–20 digits)."),
  ifscCode: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => IFSC_RE.test(v), "Enter a valid 11-character IFSC, e.g. HDFC0001234."),
  name: z.string().trim().min(2, "Enter the account holder's name.").max(100),
});

export async function kycVerifyBank(input: z.input<typeof bankSchema>): Promise<ActionResult<KycResult>> {
  try {
    const g = await guard("bank");
    if ("error" in g) return fail(g.error ?? NOT_ADMIN);
    const parsed = bankSchema.safeParse(input);
    if (!parsed.success) return toActionError(parsed.error);
    const r = await verifyBankAccount(parsed.data);
    await audit(g.admin.id, "kyc.bank_verification", { accountNo: maskAccount(parsed.data.accountNo), ifscCode: parsed.data.ifscCode }, r);
    return ok(r);
  } catch (err) {
    return toActionError(err);
  }
}

const aadhaar = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => AADHAAR_RE.test(v), "Enter a valid 12-digit Aadhaar number.");

export async function kycAadhaarGenerateOtp(input: { aadhaarNumber: string }): Promise<ActionResult<KycResult>> {
  try {
    const g = await guard("aadhaar");
    if ("error" in g) return fail(g.error ?? NOT_ADMIN);
    const parsed = z.object({ aadhaarNumber: aadhaar }).safeParse(input);
    if (!parsed.success) return toActionError(parsed.error);
    const r = await generateAadhaarOtp(parsed.data.aadhaarNumber);
    await audit(g.admin.id, "kyc.aadhaar_otp_generated", { aadhaar: maskAadhaar(parsed.data.aadhaarNumber) }, r);
    return ok(r);
  } catch (err) {
    return toActionError(err);
  }
}

export async function kycAadhaarVerifyOtp(input: { aadhaarNumber: string; otp: string }): Promise<ActionResult<KycResult>> {
  try {
    const g = await guard("aadhaar");
    if ("error" in g) return fail(g.error ?? NOT_ADMIN);
    const parsed = z
      .object({ aadhaarNumber: aadhaar, otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit OTP.") })
      .safeParse(input);
    if (!parsed.success) return toActionError(parsed.error);
    const r = await verifyAadhaarOtp(parsed.data.aadhaarNumber, parsed.data.otp);
    await audit(g.admin.id, "kyc.aadhaar_otp_verified", { aadhaar: maskAadhaar(parsed.data.aadhaarNumber) }, r);
    return ok(r);
  } catch (err) {
    return toActionError(err);
  }
}
