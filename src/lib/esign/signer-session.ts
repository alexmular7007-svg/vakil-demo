import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { SIGNER_SESSION_MINUTES } from "./constants";

// After a correct OTP the signer gets a short-lived, HMAC-signed cookie scoped to
// their own link path (/s/<token>). It is bound to the recipient and to the hash
// of the current link token, so a reissued link or another recipient cannot reuse it.
//
// Cookie attributes: httpOnly (no script access), Secure in production (with the
// __Secure- name prefix so the browser enforces it), SameSite=Strict (every use
// after the OTP step is a same-site request from our own pages: server actions,
// router refreshes and the "open document" links), path-scoped and expiring after
// SIGNER_SESSION_MINUTES both in the browser and in the signed value.

const COOKIE = env.isProd ? "__Secure-vk_signer" : "vk_signer";

let cachedKey: Buffer | null = null;
function key(): Buffer {
  cachedKey ??= createHmac("sha256", env.authSecret).update("vaakil-esign-signer-session-v1").digest();
  return cachedKey;
}

function mac(recipientId: string, exp: number, tokenHash: string): string {
  return createHmac("sha256", key()).update(`${recipientId}.${exp}.${tokenHash}`).digest("base64url");
}

export function signerCookieOptions(token: string, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "strict" as const,
    path: `/s/${token}`,
    maxAge: maxAgeSeconds,
  };
}

export async function setSignerSession(token: string, recipientId: string, tokenHash: string): Promise<void> {
  const exp = Date.now() + SIGNER_SESSION_MINUTES * 60_000;
  const jar = await cookies();
  jar.set(COOKIE, `${recipientId}.${exp}.${mac(recipientId, exp, tokenHash)}`, signerCookieOptions(token, SIGNER_SESSION_MINUTES * 60));
}

/** The recipient id a session value was issued for (with this token), or null if it is invalid or expired. */
export function signerSessionRecipient(value: string | undefined, tokenHash: string): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [rid, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!rid || !Number.isFinite(exp) || exp < Date.now()) return null;
  return safeEqual(sig, mac(rid, exp, tokenHash)) ? rid : null;
}

export function checkSignerSessionValue(value: string | undefined, recipientId: string, tokenHash: string): boolean {
  return signerSessionRecipient(value, tokenHash) === recipientId;
}

export async function hasSignerSession(recipientId: string, tokenHash: string): Promise<boolean> {
  const jar = await cookies();
  return checkSignerSessionValue(jar.get(COOKIE)?.value, recipientId, tokenHash);
}

/** Recipient id of the current request's signer session for this link token, if any. */
export async function currentSignerSession(tokenHash: string): Promise<string | null> {
  const jar = await cookies();
  return signerSessionRecipient(jar.get(COOKIE)?.value, tokenHash);
}

export async function clearSignerSession(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, "", signerCookieOptions(token, 0));
}
