"use client";

import { useSyncExternalStore } from "react";
import { todayInIndia } from "@/lib/calculators/dates";

// Re-check once a minute so an open tab rolls over at midnight IST.
function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}

/**
 * Today's date in IST, or null while prerendering and hydrating. Reading the
 * clock only on the client keeps public calculator pages fully static.
 */
export function useTodayInIndia(): string | null {
  return useSyncExternalStore(subscribe, todayInIndia, () => null);
}
