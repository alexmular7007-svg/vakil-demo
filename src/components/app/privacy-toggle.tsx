"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "vaakil:privacy";

function read() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Re-applies privacy mode after a reload; rendered once by the app shell. */
export function PrivacyBoot() {
  useEffect(() => {
    document.documentElement.classList.toggle("privacy-on", read());
  }, []);
  return null;
}

/**
 * Blurs client names and amounts marked `data-private`, like hiding a bank
 * balance, for when the screen is visible to others in court.
 */
export function PrivacyToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // Sync with the stored preference after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(read());
  }, []);
  const toggle = () => {
    const next = !on;
    setOn(next);
    document.documentElement.classList.toggle("privacy-on", next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* storage blocked: the toggle still works for this page view */
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Show client names" : "Hide client names"}
      title={on ? "Show client names" : "Hide client names"}
      className={cn("inline-flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-on-brand transition-colors hover:bg-white/15", className)}
    >
      {on ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
    </button>
  );
}
