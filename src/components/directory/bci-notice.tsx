import { Scale } from "lucide-react";
import { BCI_RULE_36_NOTICE } from "@/lib/directory/constants";
import { cn } from "@/lib/utils";

export function BciNotice({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Bar Council of India Rule 36 notice"
      className={cn("flex gap-3 rounded-lg border border-border bg-surface-2/60 p-4 text-sm text-ink-2", className)}
    >
      <Scale className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <p>{BCI_RULE_36_NOTICE}</p>
    </aside>
  );
}
