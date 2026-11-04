"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, CreditCard, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/app/settings", label: "Profile", icon: UserRound },
  { href: "/app/settings/security", label: "Security", icon: KeyRound },
  { href: "/app/settings/advocate", label: "Advocate verification", icon: BadgeCheck },
  { href: "/app/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings/privacy", label: "Privacy", icon: ShieldCheck },
] as const;

/** Horizontal tabs that scroll sideways on phones instead of wrapping. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="-mx-4 mb-6 border-b border-border sm:-mx-6 lg:mx-0">
      <ul className="scrollbar-thin flex gap-1 overflow-x-auto px-4 sm:px-6 lg:px-0">
        {items.map((item) => {
          const active = item.href === "/app/settings" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
