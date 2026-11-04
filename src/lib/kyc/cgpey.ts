import "server-only";
import { env, features } from "@/lib/env";
import { maskDeep } from "./mask";

/**
 * CGPEY KYC API, exactly as documented on https://docs.cgpey.com/kyc-api-docs
 * (read 2026-11-02). Every call is a JSON POST from the server only, with headers
 * x-api-key / x-api-secret and `merchantId` in the body:
 *
 *   POST {base}/api/kyc/aadhaar/generate-otp   { merchantId, aadhaarNumber }
 *   POST {base}/api/kyc/aadhaar/verify-otp     { merchantId, aadhaarNumber, otp }   (deducts wallet balance)
 *   POST {base}/api/kyc/pan-verification       { merchantId, pan }
 *   POST {base}/api/kyc/bank-verification      { merchantId, accountNo, ifscCode, name }
 *
 * {base} is CGPEY_BASE_URL. CGPEY's docs page shows https://docs.cgpey.com as the
 * host; confirm the production host with CGPEY before going live.
 *
 * Responses are returned with identity numbers masked. Nothing here invents a
 * result: any provider or network failure is reported as a failure.
 */

export type KycResult = {
  ok: boolean;
  httpStatus: number | null;
  message: string;
  /** Provider response with PAN / Aadhaar / account numbers masked. */
  data: unknown;
};

export class KycNotConfiguredError extends Error {
  constructor() {
    super("CGPEY KYC is not configured on this server.");
  }
}

export function kycBaseHost() {
  try {
    return new URL(env.CGPEY_BASE_URL).host;
  } catch {
    return "invalid CGPEY_BASE_URL";
  }
}

async function call(path: string, body: Record<string, string>): Promise<KycResult> {
  if (!features.cgpeyKyc || !env.CGPEY_API_KEY || !env.CGPEY_API_SECRET || !env.CGPEY_MERCHANT_ID) {
    throw new KycNotConfiguredError();
  }
  const url = `${env.CGPEY_BASE_URL.replace(/\/+$/, "")}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": env.CGPEY_API_KEY,
        "x-api-secret": env.CGPEY_API_SECRET,
      },
      body: JSON.stringify({ merchantId: env.CGPEY_MERCHANT_ID, ...body }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    console.error("[kyc] network error", path, err instanceof Error ? err.message : err);
    return { ok: false, httpStatus: null, message: "CGPEY could not be reached.", data: null };
  }
  const json = (await res.json().catch(() => null)) as { success?: boolean; message?: unknown; data?: unknown } | null;
  const message =
    typeof json?.message === "string" && json.message.trim()
      ? json.message.trim().slice(0, 300)
      : res.ok
        ? "No message returned."
        : `HTTP ${res.status}`;
  return {
    ok: res.ok && json?.success === true,
    httpStatus: res.status,
    message,
    data: maskDeep(json?.data ?? null),
  };
}

export function verifyPan(pan: string) {
  return call("/api/kyc/pan-verification", { pan });
}

export function verifyBankAccount(input: { accountNo: string; ifscCode: string; name: string }) {
  return call("/api/kyc/bank-verification", input);
}

export function generateAadhaarOtp(aadhaarNumber: string) {
  return call("/api/kyc/aadhaar/generate-otp", { aadhaarNumber });
}

export function verifyAadhaarOtp(aadhaarNumber: string, otp: string) {
  return call("/api/kyc/aadhaar/verify-otp", { aadhaarNumber, otp });
}
