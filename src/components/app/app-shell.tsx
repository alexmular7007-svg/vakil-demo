"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { LayoutGrid, Search, ShieldCheck } from "lucide-react";
import { Logo, LogoMark, Wordmark } from "@/components/brand";
import { IconTile } from "@/components/ui/display";
import { Sheet } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { InstallAppButton } from "./install-app";
import { NewMenu } from "./new-menu";
import { NotificationsBell } from "./notifications-bell";
import { PrivacyBoot } from "./privacy-toggle";
import { UpdatesPopup } from "@/components/updates/updates-popup";
import { SearchPalette } from "./search-palette";
import { askAi, isActive, mobileTabsLeft, mobileTabsRight, navGroups, settings, type NavItem } from "./nav";

/* ----------------------------------------------------------------------------
   Desktop sidebar (lg) and tablet rail (md): court-navy panel, gold active mark.
   usePathname() is runtime data, so the active state renders inside <Suspense>;
   the fallback is the same navigation without a highlight.
   ------------------------------------------------------------------------- */

function SideLink({ item, pathname, rail }: { item: NavItem; pathname: string; rail: boolean }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={rail ? item.label : undefined}
      className={cn(
        "group relative flex items-center rounded-md font-semibold transition-colors",
        rail ? "flex-col gap-1 px-1 py-2 text-[10.5px]" : "gap-3 px-3 py-2 text-[13.5px]",
        active ? "bg-white/10 text-white" : "text-on-brand-muted hover:bg-white/5 hover:text-on-brand",
      )}
    >
      {active ? (
        <span className={cn("absolute rounded-full bg-gold-bright", rail ? "inset-x-5 -bottom-px h-0.5" : "inset-y-2 -left-3 w-1")} aria-hidden />
      ) : null}
      <item.icon className={cn("shrink-0", rail ? "size-5" : "size-[18px]", active ? "text-gold-bright" : "text-on-brand-muted group-hover:text-on-brand")} />
      <span className={cn(rail && "max-w-full truncate")}>{rail ? item.short ?? item.label : item.label}</span>
    </Link>
  );
}

function SideNav({ pathname, rail }: { pathname: string; rail: boolean }) {
  return (
    <nav aria-label="App" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4 scrollbar-none">
      {navGroups.map((g) => (
        <div key={g.label || "top"} className="grid gap-0.5">
          {g.label && !rail ? (
            <p className="px-3 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-on-brand-muted/70 uppercase">{g.label}</p>
          ) : null}
          {g.label && rail ? <span className="mx-auto mb-1 h-px w-8 bg-white/10" aria-hidden /> : null}
          {g.items.map((i) => (
            <SideLink key={i.href} item={i} pathname={pathname} rail={rail} />
          ))}
        </div>
      ))}
      <div className="grid gap-0.5">
        {!rail ? <p className="px-3 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-on-brand-muted/70 uppercase">Account</p> : null}
        <SideLink item={settings} pathname={pathname} rail={rail} />
      </div>
    </nav>
  );
}

function ActiveSideNav({ rail }: { rail: boolean }) {
  const pathname = usePathname();
  return <SideNav pathname={pathname} rail={rail} />;
}

function SideNavWithActive({ rail }: { rail: boolean }) {
  return (
    <Suspense fallback={<SideNav pathname="" rail={rail} />}>
      <ActiveSideNav rail={rail} />
    </Suspense>
  );
}

/* ----------------------------------------------------------------------------
   Phone bottom tab bar with a raised centre "Ask AI" button.
   ------------------------------------------------------------------------- */

function TabLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold", active ? "text-primary" : "text-muted")}
    >
      <span className={cn("inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary-soft")}>
        <item.icon className="size-[21px]" />
      </span>
      {item.short ?? item.label}
    </Link>
  );
}

function BottomTabs({ pathname, onMore }: { pathname: string; onMore: () => void }) {
  const askActive = isActive(pathname, askAi.href);
  return (
    <>
      {mobileTabsLeft.map((i) => (
        <TabLink key={i.href} item={i} pathname={pathname} />
      ))}
      <Link
        href={askAi.href}
        aria-current={askActive ? "page" : undefined}
        className="flex h-16 flex-col items-center justify-end gap-1 pb-1.5 text-[11px] font-bold text-ink"
      >
        <span className="pressable -mt-7 inline-flex size-[58px] items-center justify-center rounded-full bg-linear-to-br from-brand-2 to-brand text-gold-bright shadow-brand ring-4 ring-bg">
          <askAi.icon className="size-6" />
        </span>
        {askAi.label}
      </Link>
      {mobileTabsRight.map((i) => (
        <TabLink key={i.href} item={i} pathname={pathname} />
      ))}
      <button type="button" onClick={onMore} className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted">
        <span className="inline-flex h-7 w-12 items-center justify-center rounded-full">
          <LayoutGrid className="size-[21px]" />
        </span>
        More
      </button>
    </>
  );
}

function ActiveBottomTabs({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  return <BottomTabs pathname={pathname} onMore={onMore} />;
}

/* ----------------------------------------------------------------------------
   "All services" sheet: every destination as a banking-style icon grid.
   ------------------------------------------------------------------------- */

function ServicesSheet({ open, onClose, onSearch }: { open: boolean; onClose: () => void; onSearch: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} side="bottom" label="All services">
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <h2 className="font-serif text-xl font-semibold text-ink">All services</h2>
        <button
          type="button"
          onClick={() => {
            onClose();
            onSearch();
          }}
          className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full bg-surface-2 text-ink-2"
          aria-label="Search"
        >
          <Search className="size-[18px]" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-5">
        {navGroups
          .filter((g) => g.label)
          .map((g) => (
          <section key={g.label}>
            <p className="mb-2 px-1 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">{g.label}</p>
            <div className="grid grid-cols-4 gap-y-3">
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} onClick={onClose} className="pressable flex flex-col items-center gap-1.5 rounded-md px-1 py-1 text-center">
                  <IconTile icon={i.icon} tone={i.tone} />
                  <span className="text-[11.5px] leading-tight font-semibold text-ink-2">{i.short ?? i.label}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
        <section className="grid gap-2 border-t border-border pt-4">
          <Link href={settings.href} onClick={onClose} className="flex items-center gap-3 rounded-md px-1 py-1.5 text-sm font-semibold text-ink-2">
            <IconTile icon={settings.icon} tone="slate" size="sm" /> Settings, security and privacy
          </Link>
          <InstallAppButton variant="row" />
        </section>
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------------------------------
   Shell
   ------------------------------------------------------------------------- */

export function AppShell({ children, userSlot }: { children: React.ReactNode; userSlot: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="ambient-bg min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>

      {/* Tablet rail (md) and desktop sidebar (lg) */}
      <aside className="brand-surface fixed inset-y-0 left-0 z-30 hidden flex-col md:flex md:w-[84px] lg:w-[264px]">
        <div className="flex h-[72px] shrink-0 items-center justify-center px-5 lg:justify-start">
          <Link href="/app" aria-label="Vaakil AI home" className="inline-flex items-center gap-2.5 rounded-md">
            <LogoMark className="size-10" />
            <span className="hidden flex-col lg:flex">
              <Wordmark tone="onBrand" />
              <span className="-mt-0.5 text-[10px] font-semibold tracking-[0.18em] text-on-brand-muted uppercase">Legal workspace</span>
            </span>
          </Link>
        </div>
        <div className="hidden min-h-0 flex-1 flex-col lg:flex">
          <SideNavWithActive rail={false} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col lg:hidden">
          <SideNavWithActive rail />
        </div>
        <div className="hidden shrink-0 p-4 lg:block">
          <div className="glass-on-brand rounded-md p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-on-brand">
              <ShieldCheck className="size-4 text-gold-bright" /> Secure workspace
            </p>
            <p className="mt-1 text-[11px] leading-snug text-on-brand-muted">Row-level data isolation, two-factor login and a tamper-evident audit trail.</p>
          </div>
        </div>
      </aside>

      <div className="md:pl-[84px] lg:pl-[264px]">
        {/* Tablet and desktop top bar */}
        <header className="glass sticky top-0 z-20 hidden h-16 items-center gap-3 rounded-none border-x-0 border-t-0 px-6 shadow-none md:flex lg:px-10">
          <button
            type="button"
            onClick={openSearch}
            className="flex h-10 w-full max-w-md cursor-pointer items-center gap-2.5 rounded-full border border-border bg-surface/80 px-4 text-sm text-muted shadow-sm transition-colors hover:border-border-strong"
          >
            <Search className="size-4" />
            <span className="flex-1 truncate text-left">Search matters, drafts, bare acts…</span>
            <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <NewMenu />
            <NotificationsBell />
            <div className="ml-1">{userSlot}</div>
          </div>
        </header>

        {/* Phone top app bar */}
        <header className="glass safe-top sticky top-0 z-30 rounded-none border-x-0 border-t-0 shadow-none md:hidden">
          <div className="flex h-14 items-center gap-1 px-3">
            <Logo href="/app" className="mr-auto" />
            <button
              type="button"
              onClick={openSearch}
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
              aria-label="Search"
            >
              <Search className="size-5" />
            </button>
            <NotificationsBell />
            <div className="ml-1">{userSlot}</div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1320px] px-4 pt-5 pb-32 sm:px-6 md:pb-14 lg:px-10 lg:pt-8">
          {children}
        </main>
      </div>

      {/* Phone bottom tabs */}
      <nav
        aria-label="Primary"
        className="glass safe-bottom fixed inset-x-0 bottom-0 z-30 rounded-none border-x-0 border-b-0 shadow-[0_-8px_24px_-12px_rgb(12_22_49/0.18)] md:hidden"
      >
        <div className="grid grid-cols-5">
          <Suspense fallback={<BottomTabs pathname="" onMore={() => setMoreOpen(true)} />}>
            <ActiveBottomTabs onMore={() => setMoreOpen(true)} />
          </Suspense>
        </div>
      </nav>

      <ServicesSheet open={moreOpen} onClose={() => setMoreOpen(false)} onSearch={openSearch} />
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <PrivacyBoot />
      <UpdatesPopup />
    </div>
  );
}
