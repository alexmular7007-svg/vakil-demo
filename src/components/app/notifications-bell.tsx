"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CalendarDays, MessageCircleQuestion, Newspaper, ReceiptIndianRupee, Signature } from "lucide-react";
import { IconTile, type TileTone } from "@/components/ui/display";
import { Menu } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

type Notice = { id: string; kind: "hearing" | "signature" | "consultation" | "invoice" | "update"; title: string; detail: string; href: string; at: string; urgent: boolean };

const kinds: Record<Notice["kind"], { icon: React.ComponentType<{ className?: string }>; tone: TileTone }> = {
  hearing: { icon: CalendarDays, tone: "green" },
  signature: { icon: Signature, tone: "maroon" },
  consultation: { icon: MessageCircleQuestion, tone: "navy" },
  invoice: { icon: ReceiptIndianRupee, tone: "gold" },
  update: { icon: Newspaper, tone: "navy" },
};

export function NotificationsBell() {
  const [notices, setNotices] = useState<Notice[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) setNotices(((await res.json()) as { notices: Notice[] }).notices);
    } catch {
      /* offline: keep what we have */
    }
  }, []);

  useEffect(() => {
    // Fetch once on mount; the panel refreshes on every open.
    let live = true;
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { notices: Notice[] } | null) => {
        if (live && d) setNotices(d.notices);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const count = notices?.length ?? 0;
  const urgent = notices?.some((n) => n.urgent);

  return (
    <Menu
      // Phones: pinned under the top bar, full width; larger screens: anchored to the bell.
      className="w-[22rem] p-0 max-sm:fixed max-sm:inset-x-3 max-sm:top-[calc(env(safe-area-inset-top)+3.75rem)] max-sm:mt-0 max-sm:w-auto"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={() => {
            if (!open) void load();
            toggle();
          }}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={count ? `Notifications, ${count} need attention` : "Notifications"}
          className="relative inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
        >
          <Bell className="size-5" />
          {count ? (
            <span
              className={cn(
                "absolute top-1 right-1 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] leading-[18px] font-bold ring-2 ring-bg",
                urgent ? "bg-danger text-white" : "bg-primary text-primary-ink",
              )}
            >
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-bold text-ink">Notifications</p>
            <span className="text-xs text-muted">{count ? `${count} need attention` : "All caught up"}</span>
          </div>
          {notices === null ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Loading…</p>
          ) : notices.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold text-ink">You are all caught up</p>
              <p className="mt-1 text-xs text-muted">Upcoming hearings, pending signatures and unpaid invoices appear here.</p>
            </div>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {notices.map((n) => {
                const k = kinds[n.kind];
                return (
                  <li key={n.id}>
                    <Link href={n.href} onClick={close} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
                      <IconTile icon={k.icon} tone={k.tone} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{n.title}</span>
                        <span className={cn("block text-xs", n.urgent ? "font-semibold text-danger" : "text-muted")}>{n.detail}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Menu>
  );
}
