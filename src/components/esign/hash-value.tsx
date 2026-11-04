"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** A SHA-256 shown in full (wrapping on small screens) with a copy button. */
export function HashValue({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className={cn("flex items-center gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2", className)}>
      <code className="min-w-0 flex-1 font-mono text-[12px] leading-relaxed break-all text-ink-2" aria-label={label}>
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="-my-1.5 -mr-2 inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink"
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
      >
        {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
