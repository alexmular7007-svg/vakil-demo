"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Newspaper } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge, IconTile } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import type { UnseenUpdate } from "@/lib/updates/types";

const KIND_TONE: Record<string, "info" | "primary" | "warning" | "neutral"> = {
  bill: "info",
  act: "primary",
  amendment: "warning",
  ordinance: "warning",
  notification: "neutral",
  judgment: "primary",
  news: "neutral",
};

// Items closed in this browser session, in case marking them seen on the server failed.
const SESSION_KEY = "vaakil:updates-popup-closed";

function closedIds(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function rememberClosed(ids: string[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...new Set([...closedIds(), ...ids])].slice(-50)));
  } catch {
    /* storage blocked: the server receipt still applies */
  }
}

/**
 * "New legal update" card: shows the newest high-importance update the user has not
 * seen (bottom-right on tablet and desktop; on phones a sheet above the tab bar and
 * its raised Ask AI button). Read or Dismiss marks everything up to now as seen, so
 * the same items never pop up again. Mounted once in
 * the app shell; renders nothing when there is nothing new or the user has no access.
 */
export function UpdatesPopup() {
  const router = useRouter();
  const [items, setItems] = useState<UnseenUpdate[]>([]);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    // Wait for the page to settle before asking; the pop-up is never urgent.
    const timer = setTimeout(() => {
      fetch("/api/updates/unseen", { signal: ctrl.signal, cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ items: UnseenUpdate[] }>) : null))
        .then((d) => {
          const closed = closedIds();
          const fresh = (d?.items ?? []).filter((i) => !closed.has(i.id));
          if (fresh.length) {
            setItems(fresh);
            setOpen(true);
          }
        })
        .catch(() => {
          /* offline or signed out: no pop-up */
        });
    }, 2500);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    rememberClosed(items.map((i) => i.id));
    // keepalive: the request survives the tab switching to the source page.
    fetch("/api/updates/seen", { method: "POST", keepalive: true }).catch(() => {});
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && cardRef.current?.contains(document.activeElement)) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open || !items.length) return null;
  const top = items[0];
  const more = items.length - 1;

  return (
    <div
      ref={cardRef}
      role="region"
      aria-labelledby={titleId}
      aria-live="polite"
      className={cn(
        "glass fixed inset-x-3 z-40 rounded-lg p-4 motion-safe:animate-slide-up",
        "bottom-[calc(6.25rem+env(safe-area-inset-bottom))] md:inset-x-auto md:right-6 md:bottom-6 md:w-[24rem]",
      )}
    >
      <div className="flex items-start gap-3">
        <IconTile icon={Newspaper} tone="maroon" size="sm" />
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-[11px] font-bold tracking-[0.14em] text-accent uppercase">
            New legal update
          </p>
          <p className="mt-1 line-clamp-3 font-semibold text-ink">{top.title}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Badge tone={KIND_TONE[top.kind] ?? "neutral"}>{top.kindLabel}</Badge>
            <span>{top.sourceName}</span>
          </p>
        </div>
      </div>

      {more > 0 ? (
        <Link href="/app/updates" onClick={close} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline sm:min-h-0">
          {more} more important {more === 1 ? "update" : "updates"}
        </Link>
      ) : null}

      <div className="mt-3 flex gap-2">
        {top.href ? (
          <button
            type="button"
            onClick={() => {
              close();
              router.push(top.href!);
            }}
            className={cn(buttonVariants({ variant: "primary" }), "flex-1")}
          >
            Read <ArrowUpRight aria-hidden />
          </button>
        ) : (
          <a
            href={top.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className={cn(buttonVariants({ variant: "primary" }), "flex-1")}
          >
            Read <ArrowUpRight aria-hidden />
            <span className="sr-only">(opens {top.sourceName} in a new tab)</span>
          </a>
        )}
        <button
          type="button"
          onClick={close}
          className={cn(buttonVariants({ variant: "ghost" }), "flex-1")}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
