// Zod schemas for every e-sign input. Shared by the client form (early feedback)
// and the server (authoritative validation).

import { z } from "zod";
import {
  CONSENT_VERSION,
  EXCLUDED_EXPLANATION,
  MAX_EXPIRY_DAYS,
  MAX_RECIPIENTS,
  MAX_ROUTING_ORDER,
  MAX_SIGNATURE_PNG_BYTES,
  MIN_EXPIRY_DAYS,
  RECIPIENT_ACTIONS,
  ROLE_LABELS,
  SIGNATURE_TYPES,
  findCategory,
  roleRule,
} from "./constants";
import { validateRouting } from "./workflow";

const emailFormat = z.email();

// Postgres text columns reject NUL; strip other control characters except newlines and tabs.
const clean = (v: string) => Array.from(v).filter((ch) => ch === "\n" || ch === "\t" || ch.charCodeAt(0) >= 0x20).join("");
const text = () => z.string().transform(clean).pipe(z.string().trim());

export const recipientInputSchema = z.object({
  name: text().pipe(z.string().min(2, "Enter the person's full name.").max(120, "Keep the name under 120 characters.")),
  // Empty only when the recipient is linked to a verified advocate: the server
  // then uses that advocate's registered email.
  email: z.string().trim().toLowerCase().max(254, "That email address is too long."),
  roleLabel: z.enum(ROLE_LABELS, { error: "Choose a role." }),
  action: z.enum(RECIPIENT_ACTIONS, { error: "Choose an action." }),
  routingOrder: z.coerce
    .number({ error: "Enter an order number." })
    .int("Use a whole number.")
    .min(1, "Order starts at 1.")
    .max(MAX_ROUTING_ORDER, `Order can be at most ${MAX_ROUTING_ORDER}.`),
  advocateUserId: z.string().trim().min(1).max(64).nullish(),
});
export type RecipientInput = z.infer<typeof recipientInputSchema>;

export const envelopeInputSchema = z
  .object({
    title: text().pipe(z.string().min(3, "Give the envelope a title of at least 3 characters.").max(200, "Keep the title under 200 characters.")),
    message: text().pipe(z.string().max(2000, "Keep the message under 2,000 characters.")).default(""),
    docCategory: z.string().trim().min(1, "Choose the kind of document."),
    expiryDays: z.coerce
      .number({ error: "Enter the number of days." })
      .int("Use a whole number of days.")
      .min(MIN_EXPIRY_DAYS, `At least ${MIN_EXPIRY_DAYS} day.`)
      .max(MAX_EXPIRY_DAYS, `At most ${MAX_EXPIRY_DAYS} days.`),
    signatureType: z.enum(SIGNATURE_TYPES),
    draftId: z.uuid("That draft link is not valid.").nullish(),
    recipients: z
      .array(recipientInputSchema)
      .min(1, "Add at least one recipient.")
      .max(MAX_RECIPIENTS, `An envelope can have at most ${MAX_RECIPIENTS} recipients.`),
  })
  .superRefine((v, ctx) => {
    const category = findCategory(v.docCategory);
    if (!category) {
      ctx.addIssue({ code: "custom", path: ["docCategory"], message: "Choose a document category from the list." });
    } else if (category.excluded) {
      ctx.addIssue({ code: "custom", path: ["docCategory"], message: EXCLUDED_EXPLANATION });
    }
    v.recipients.forEach((r, i) => {
      if (r.advocateUserId && !roleRule(r.roleLabel)?.canLinkAdvocate) {
        ctx.addIssue({ code: "custom", path: ["recipients", i, "roleLabel"], message: "Only a Lawyer can be linked to an advocate profile." });
      }
      if (!r.advocateUserId && !emailFormat.safeParse(r.email).success) {
        ctx.addIssue({ code: "custom", path: ["recipients", i, "email"], message: "Enter a valid email address." });
      }
    });
    for (const issue of validateRouting(v.recipients)) {
      ctx.addIssue({
        code: "custom",
        path: issue.index === null ? ["recipients"] : ["recipients", issue.index, issue.field ?? "routingOrder"],
        message: issue.message,
      });
    }
  });
export type EnvelopeInput = z.infer<typeof envelopeInputSchema>;

export const envelopeIdSchema = z.uuid("Unknown envelope.");

export const voidSchema = z.object({
  envelopeId: envelopeIdSchema,
  reason: text().pipe(z.string().min(3, "Give a short reason (at least 3 characters).").max(500, "Keep the reason under 500 characters.")),
});

/** Signer link tokens are 32 random bytes in base64url (43 characters). */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "This signing link is not valid.");

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.");

export const declineSchema = z.object({
  reason: text().pipe(z.string().min(3, "Tell the sender why (at least 3 characters).").max(1000, "Keep the reason under 1,000 characters.")),
});

const PNG_PREFIX = "data:image/png;base64,";
// Base64 inflates by 4/3; allow for the prefix.
const MAX_DATA_URL_CHARS = PNG_PREFIX.length + Math.ceil((MAX_SIGNATURE_PNG_BYTES * 4) / 3) + 4;

export const signatureSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("typed"),
    text: text().pipe(z.string().min(2, "Type your full name.").max(120, "Keep the name under 120 characters.")),
  }),
  z.object({
    kind: z.literal("drawn"),
    image: z
      .string()
      .startsWith(PNG_PREFIX, "The drawn signature must be a PNG image.")
      .max(MAX_DATA_URL_CHARS, "The drawn signature is too large. Clear it and draw again."),
  }),
]);
export type SignatureInput = z.infer<typeof signatureSchema>;

export const consentSchema = z.object({
  consentVersion: z.literal(CONSENT_VERSION, { error: "The consent text has changed. Reload the page and read it again." }),
  consentAccepted: z.literal(true, { error: "Tick the box to agree to sign electronically." }),
});

export const signSubmitSchema = consentSchema.extend({ signature: signatureSchema });
export const approveSubmitSchema = consentSchema;

export const advocateQuerySchema = z.string().trim().min(2, "Type at least 2 characters.").max(80);
