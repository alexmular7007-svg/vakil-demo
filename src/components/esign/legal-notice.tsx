import { ShieldCheck } from "lucide-react";
import { LEGAL_FRAMING, TIER2_NAME } from "@/lib/esign/constants";
import { cn } from "@/lib/utils";

/** The required Tier-2 framing. Use wherever the signature is described. */
export function Tier2Notice({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex gap-3 rounded-lg border border-border bg-surface-2/60 p-4 text-sm", className)}>
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-ink">{TIER2_NAME}</p>
        <p className={cn("text-ink-2", compact && "text-[13px]")}>{LEGAL_FRAMING}</p>
      </div>
    </div>
  );
}
