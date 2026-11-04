"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, requestIp } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { BILLING_INTERVALS } from "@/lib/db/schema/enums";
import { PAID_PLAN_IDS } from "@/lib/plans";
import { isPurchasable } from "@/lib/payments/pricing";
import { beginCheckout } from "@/lib/payments/checkout";
import {
  PaymentProviderError,
  PaymentsNotConfiguredError,
  getPaymentProvider,
  paymentsConfigured,
} from "@/lib/payments/provider";

const checkoutSchema = z
  .object({
    // Validated against the catalogue: only plans with a price can be bought.
    planId: z.enum(PAID_PLAN_IDS, "Choose a plan."),
    interval: z.enum(BILLING_INTERVALS, "Choose monthly or yearly."),
    mobile: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+91/, "").replace(/^0/, ""))
      .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a 10-digit Indian mobile number."),
  })
  .refine((v) => isPurchasable(v.planId, v.interval), { message: "That plan is not available.", path: ["planId"] });

export type CheckoutResult = { redirectUrl: string | null; upiIntent: string | null; orderId: string };

/**
 * Starts a checkout. It only creates a pending payment (or hands back the one started
 * in the last few minutes for the same plan) and returns the provider's payment link;
 * the plan changes when the signed webhook confirms the payment.
 *
 * Not built on defineAction on purpose: defineAction runs its body inside withUser()'s
 * app_user transaction, but billing tables are written on the owner connection and the
 * provider call can take seconds, which must not hold a user transaction open. The same
 * discipline is kept by hand, in the same order: session -> configured -> zod ->
 * rate limit -> work (src/lib/payments/checkout.ts) -> audit -> revalidate -> safe errors.
 */
export async function startCheckout(input: z.input<typeof checkoutSchema>): Promise<ActionResult<CheckoutResult>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  if (!paymentsConfigured()) return fail("Online payments are not configured yet.");
  try {
    const { planId, interval, mobile } = checkoutSchema.parse(input);
    await enforceRateLimit(`checkout:${user.id}`, 5, 10 * 60);
    const provider = await getPaymentProvider();
    const started = await beginCheckout({
      user,
      planId,
      interval,
      mobile,
      provider,
      returnUrl: (orderId) => `${env.APP_URL}/app/settings/billing?checkout=returned&order=${encodeURIComponent(orderId)}`,
      ip: await requestIp().catch(() => null),
    });
    revalidatePath("/app/settings/billing");
    return ok({ redirectUrl: started.redirectUrl, upiIntent: started.upiIntent, orderId: started.orderId });
  } catch (err) {
    if (err instanceof PaymentsNotConfiguredError || err instanceof PaymentProviderError) return fail(err.message);
    return toActionError(err);
  }
}
