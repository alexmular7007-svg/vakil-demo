"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { BadgeCheck, Bot, FileClock, Fingerprint, Landmark, LayoutDashboard, Newspaper, Scale, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

export const adminLinks = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: UsersRound },
  { href: "/admin/verifications", label: "Advocate verification", icon: BadgeCheck },
  { href: "/admin/ai", label: "AI", icon: Bot },
  { href: "/admin/library", label: "Law library", icon: Landmark },
  { href: "/admin/updates", label: "Legal updates", icon: Newspaper },
  { href: "/admin/audit", label: "Audit log", icon: FileClock },
  { href: "/admin/rights", label: "Rights requests", icon: Scale },
  { href: "/admin/kyc", label: "CGPEY KYC tester", icon: Fingerprint },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sidebar on desktop, horizontally scrolling tabs on phones and tablets.
 * usePathname() is runtime data on dynamic routes (e.g. /admin/library/acts/[id]),
 * so the highlighted version renders inside <Suspense>; the fallback is the same
 * navigation without a highlight.
 */
export function AdminNav({ variant }: { variant: "side" | "tabs" }) {
  return (
    <Suspense fallback={<NavLinks variant={variant} pathname="" />}>
      <ActiveNavLinks variant={variant} />
    </Suspense>
  );
}

function ActiveNavLinks({ variant }: { variant: "side" | "tabs" }) {
  const pathname = usePathname();
  return <NavLinks variant={variant} pathname={pathname} />;
}

function NavLinks({ variant, pathname }: { variant: "side" | "tabs"; pathname: string }) {
  if (variant === "tabs") {
    return (
      <nav aria-label="Admin" className="border-b border-border bg-surface lg:hidden">
        <ul className="scrollbar-thin flex gap-1 overflow-x-auto px-4 sm:px-6">
          {adminLinks.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <li key={l.href} className="shrink-0">
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap",
                    active ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  <l.icon className="size-4" aria-hidden />
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label="Admin" className="grid gap-0.5">
      {adminLinks.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <l.icon className="size-[18px] shrink-0" aria-hidden />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
