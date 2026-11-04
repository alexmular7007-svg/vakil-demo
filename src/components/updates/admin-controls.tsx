"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { setUpdateImportance, syncUpdatesNow } from "@/app/admin/updates/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";

/** "Sync now" and "Full India Code check" for /admin/updates. */
export function SyncNowButtons() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"quick" | "deep" | null>(null);

  const run = (deep: boolean) => {
    setWhich(deep ? "deep" : "quick");
    start(async () => {
      const res = await syncUpdatesNow({ deep });
      setWhich(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const r = res.data;
      const parts = [`${r.newItems} new item${r.newItems === 1 ? "" : "s"}`];
      if (r.actsUpdated.length) parts.push(`bare acts updated: ${r.actsUpdated.join(", ")}`);
      if (r.skipped.length) parts.push(`skipped ${r.skipped.join(", ")}`);
      if (r.errors) toast.warning(`Sync finished with ${r.errors} error${r.errors === 1 ? "" : "s"}: ${parts.join("; ")}.`);
      else toast.success(`Sync finished: ${parts.join("; ")}.`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => run(false)} disabled={pending}>
        {pending && which === "quick" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
      </Button>
      <Button variant="outline" onClick={() => run(true)} disabled={pending} title="Re-reads the section text of every tracked act on India Code (slower)">
        {pending && which === "deep" ? <Loader2 className="animate-spin" /> : <ScanSearch />} Full India Code check
      </Button>
    </div>
  );
}

const LABELS = { high: "High (pop-up)", normal: "Normal", hidden: "Hidden" } as const;

/** Importance picker on each admin row. */
export function ImportanceSelect({ id, value, title }: { id: string; value: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState(value);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={`imp-${id}`} className="sr-only">
        Importance of {title}
      </label>
      <Select
        id={`imp-${id}`}
        value={current}
        disabled={pending}
        className="h-11 w-40 text-sm sm:h-9"
        onChange={(e) => {
          const next = e.target.value as keyof typeof LABELS;
          const prev = current;
          setCurrent(next);
          start(async () => {
            const res = await setUpdateImportance({ id, importance: next });
            if (res.ok) {
              toast.success(`Marked ${LABELS[next].toLowerCase()}.`);
              router.refresh();
            } else {
              setCurrent(prev);
              toast.error(res.error);
            }
          });
        }}
      >
        {Object.entries(LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
      {pending ? <Loader2 className="size-4 animate-spin text-muted" aria-label="Saving" /> : null}
    </div>
  );
}
