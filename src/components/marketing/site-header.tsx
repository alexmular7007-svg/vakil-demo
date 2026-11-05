"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu as MenuIcon, X } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/overlay";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/templates", label: "Templates" },
  { href: "/tools/ipc-to-bns", label: "IPC → BNS" },
  { href: "/pricing", label: "Pricing" },
  { href: "/advocates", label: "Advocates" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="glass sticky top-0 z-40 rounded-none border-x-0 border-t-0 shadow-none">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-ink-2 hover:bg-surface-2 hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-3 sm:flex">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Start free</Link>
            </Button>
          </div>
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <ThemeToggle className="sm:hidden" />
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex size-10 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2"
              aria-label="Open menu"
            >
              <MenuIcon className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <Sheet open={open} onClose={() => setOpen(false)} side="right" label="Menu">
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Logo />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav aria-label="Mobile" className="grid gap-1 p-3">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-[15px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto grid gap-3 border-t border-border p-4">
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-medium text-ink-2">Appearance</span>
            <ThemeToggle />
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login" onClick={() => setOpen(false)}>Sign in</Link>
          </Button>
          <Button asChild className="w-full">
            <Link href="/signup" onClick={() => setOpen(false)}>Start free</Link>
          </Button>
        </div>
      </Sheet>
    </>
  );
}
