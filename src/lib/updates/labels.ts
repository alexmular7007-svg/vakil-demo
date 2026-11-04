// Kind labels and feed filters without icons, so server-only code and scripts can use
// them without loading React. Safe for client and server.
import type { UpdateKind } from "./types";

export const KIND_LABEL: Record<UpdateKind, string> = {
  bill: "Bill",
  act: "Act",
  amendment: "Amendment",
  ordinance: "Ordinance",
  notification: "Notification",
  judgment: "Judgment",
  news: "News",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind as UpdateKind] ?? "Update";
}

/** Filter chips on /app/updates. */
export const UPDATE_FILTERS = [
  { value: "all", label: "All", kinds: null },
  { value: "bills", label: "Bills & acts", kinds: ["bill", "act", "ordinance", "notification"] },
  { value: "amendments", label: "Amendments", kinds: ["amendment"] },
  { value: "judgments", label: "Judgments", kinds: ["judgment"] },
  { value: "news", label: "News", kinds: ["news"] },
] as const satisfies readonly { value: string; label: string; kinds: readonly UpdateKind[] | null }[];

export type UpdateFilter = (typeof UPDATE_FILTERS)[number]["value"];

export function parseFilter(v: string | string[] | undefined): UpdateFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return UPDATE_FILTERS.some((f) => f.value === s) ? (s as UpdateFilter) : "all";
}

