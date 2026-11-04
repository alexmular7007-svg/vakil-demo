import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { admin, twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import { account, authRateLimit, session, twoFactor as twoFactorTable, user, verification } from "@/lib/db/schema";
import { env, features } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { appendAudit } from "@/lib/audit";
import { maskEmail } from "@/lib/utils";

const AUDITED_FAILURES = new Set(["/sign-in/email", "/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

export const auth = betterAuth({
  appName: "Vaakil AI",
  baseURL: env.APP_URL,
  secret: env.authSecret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, twoFactor: twoFactorTable, rateLimit: authRateLimit },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    requireEmailVerification: env.isProd,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Vaakil AI password",
        text: `Hello ${user.name},\n\nUse this link to set a new password (valid for 1 hour):\n${url}\n\nIf you did not ask for this, ignore this email.\n\n— Vaakil AI`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your email for Vaakil AI",
        text: `Hello ${user.name},\n\nConfirm your email address:\n${url}\n\n— Vaakil AI`,
      });
    },
  },
  // "Continue with Google" when an OAuth client is configured. Redirect URI to register
  // in Google Cloud Console: <APP_URL>/api/auth/callback/google
  socialProviders: features.googleSignIn
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
        },
      }
    : {},
  account: {
    // Signing in with Google using the same (Google-verified) email links to the existing account.
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  user: {
    additionalFields: {
      phone: { type: "string", required: false, input: true },
      locale: { type: "string", required: false, defaultValue: "en", input: true },
      persona: { type: "string", required: false, defaultValue: "advocate", input: true },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: {
    enabled: true,
    // Shared across server instances (app.auth_rate_limit), not per-process memory.
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 3600, max: 10 },
      "/request-password-reset": { window: 3600, max: 5 },
      "/two-factor/verify-totp": { window: 60, max: 5 },
      "/two-factor/verify-backup-code": { window: 60, max: 5 },
      "/sign-in/social": { window: 60, max: 10 },
    },
  },
  advanced: {
    useSecureCookies: env.isProd,
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
  },
  // Failed sign-ins and two-factor checks go to the audit log (email masked), so
  // password-guessing shows up in the admin console.
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (!AUDITED_FAILURES.has(ctx.path)) return;
      const returned = ctx.context.returned;
      if (!isAPIError(returned)) return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : null;
      await appendAudit({
        action: ctx.path.startsWith("/two-factor") ? "auth.two_factor_failed" : "auth.sign_in_failed",
        actorRole: "anonymous",
        entityType: "auth",
        entityId: email ? maskEmail(email) : null,
        ip: ctx.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        data: { path: ctx.path, status: returned.statusCode, code: (returned.body as { code?: string } | undefined)?.code ?? null },
      });
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (u) => {
          await appendAudit({ action: "user.created", actorId: u.id, entityType: "user", entityId: u.id });
        },
      },
    },
    session: {
      create: {
        after: async (s) => {
          await appendAudit({
            action: "auth.session_created",
            actorId: s.userId,
            entityType: "session",
            entityId: s.id,
            ip: s.ipAddress ?? null,
          });
        },
      },
    },
  },
  plugins: [
    twoFactor({ issuer: "Vaakil AI" }),
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
