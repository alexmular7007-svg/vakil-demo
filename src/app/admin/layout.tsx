import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand";
import { AdminNav } from "@/components/admin/admin-nav";
import { Badge, Skeleton } from "@/components/ui/display";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Vaakil AI" },
  robots: { index: false, follow: false, nocache: true },
};

function AdminFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

/** Reads the session inside Suspense so the layout shell itself stays static. */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}

async function AdminWho() {
  const admin = await requireAdminPage();
  return <span className="hidden max-w-48 truncate text-sm text-muted sm:inline">{admin.email}</span>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Logo href="/admin" />
          <Badge tone="accent">Admin</Badge>
          <div className="ml-auto flex items-center gap-3">
            <Suspense fallback={null}>
              <AdminWho />
            </Suspense>
            <Link href="/app" className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">Workspace</span>
              <span className="sr-only sm:hidden">Back to workspace</span>
            </Link>
          </div>
        </div>
        <AdminNav variant="tabs" />
      </header>
      <div className="mx-auto flex max-w-[1400px] gap-8 px-4 sm:px-6 lg:px-8">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto py-6 lg:block">
          <AdminNav variant="side" />
        </aside>
        <main id="main" className="min-w-0 flex-1 py-6 pb-16 lg:py-8">
          <Suspense fallback={<AdminFallback />}>
            <AdminGate>{children}</AdminGate>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
