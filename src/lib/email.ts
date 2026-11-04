import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db";
import { outbox } from "@/lib/db/schema";
import { env, features } from "@/lib/env";

export type Email = { to: string; subject: string; text: string };

let smtp: Transporter | null = null;
function smtpTransport(): Transporter {
  // Port 465 uses TLS from the start; 587 upgrades with STARTTLS.
  smtp ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return smtp;
}

/**
 * Delivers to any address (Gmail, Outlook, company mail...) through Resend when
 * RESEND_API_KEY is set, otherwise through SMTP when SMTP_* is set (e.g. a Gmail
 * account with an app password). In development without either, the email is stored
 * in the local outbox (viewable at /dev/outbox) so OTP and verification flows can be
 * tested. Production without a provider fails loudly.
 */
export async function sendEmail(email: Email): Promise<void> {
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text }),
    });
    if (!res.ok) throw new Error(`Email provider error ${res.status}`);
    return;
  }
  if (features.smtp) {
    // Gmail rejects a From address the account does not own, so default to the login.
    const from = env.EMAIL_FROM.includes(env.SMTP_USER ?? "\u0000") ? env.EMAIL_FROM : `Vaakil AI <${env.SMTP_USER}>`;
    await smtpTransport().sendMail({ from, to: email.to, subject: email.subject, text: email.text });
    return;
  }
  if (env.isProd) {
    throw new Error("No email provider configured (RESEND_API_KEY or SMTP_*).");
  }
  await db.insert(outbox).values(email);
  console.info(`[dev-outbox] to=${email.to} subject="${email.subject}"`);
}
