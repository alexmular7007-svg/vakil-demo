import type { Metadata } from "next";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app/app-shell";
import { UserMenu } from "@/components/app/user-menu";
import { Skeleton } from "@/components/ui/display";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { advocateProfiles } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · Vaakil AI" },
  robots: { index: false, follow: false },
};

async function UserSlot() {
  const user = await requireUser("/app");
  const [adv] = await db
    .select({ status: advocateProfiles.verificationStatus })
    .from(advocateProfiles)
    .where(eq(advocateProfiles.userId, user.id))
    .limit(1);
  return (
    <UserMenu
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
        advocateVerified: adv?.status === "verified",
      }}
    />
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      userSlot={
        <Suspense fallback={<Skeleton className="size-9 rounded-full" />}>
          <UserSlot />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
