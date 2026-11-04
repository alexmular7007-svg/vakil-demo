// Labels, icons and tones for legal updates. Safe for client and server.
import { Bell, FilePenLine, Gavel, Landmark, Newspaper, ScrollText, Stamp, type LucideIcon } from "lucide-react";
import { ACT_INFO, isActId } from "@/lib/corpus/acts";
import type { TileTone } from "@/components/ui/display";
import { KIND_LABEL } from "./labels";
import type { UpdateKind } from "./types";

export { KIND_LABEL, parseFilter, UPDATE_FILTERS, type UpdateFilter } from "./labels";

type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "accent";

export const KIND_META: Record<UpdateKind, { label: string; icon: LucideIcon; tile: TileTone; badge: BadgeTone }> = {
  bill: { label: KIND_LABEL.bill, icon: ScrollText, tile: "teal", badge: "info" },
  act: { label: KIND_LABEL.act, icon: Landmark, tile: "navy", badge: "primary" },
  amendment: { label: KIND_LABEL.amendment, icon: FilePenLine, tile: "gold", badge: "warning" },
  ordinance: { label: KIND_LABEL.ordinance, icon: Stamp, tile: "maroon", badge: "warning" },
  notification: { label: KIND_LABEL.notification, icon: Bell, tile: "slate", badge: "neutral" },
  judgment: { label: KIND_LABEL.judgment, icon: Gavel, tile: "maroon", badge: "primary" },
  news: { label: KIND_LABEL.news, icon: Newspaper, tile: "slate", badge: "neutral" },
};

export function kindMeta(kind: string) {
  return KIND_META[(kind in KIND_META ? kind : "news") as UpdateKind];
}

/** "BNS", "CrPC"…, for act chips; unknown ids are shown as they are. */
export function actLabel(id: string): string {
  return isActId(id) ? ACT_INFO[id].abbr : id;
}

/** Research page of a corpus act, or null when the act has no page. */
export function actResearchHref(id: string): string | null {
  return isActId(id) ? `/app/research/${ACT_INFO[id].slug}` : null;
}

const IST = "Asia/Kolkata";

/** Calendar day in IST, "2026-11-03". */
export function istDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "Today", "Yesterday", or "Tuesday, 3 November 2026". */
export function dayLabel(day: string, now: Date): string {
  const today = istDay(now);
  const yesterday = istDay(new Date(now.getTime() - 86_400_000));
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${day}T12:00:00+05:30`));
}

export function timeLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit" }).format(d);
}

/** Vercel Cron runs the job at 00:00, 06:00, 12:00 and 18:00 UTC (see vercel.json). */
export function nextScheduledSync(now: Date): Date {
  const h = now.getUTCHours();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Math.floor(h / 6) * 6 + 6));
  return next;
}
