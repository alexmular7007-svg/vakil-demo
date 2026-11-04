"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    // The login form handles the two-factor redirect itself (with the ?next= target).
    twoFactorClient(),
    adminClient(),
  ],
});
