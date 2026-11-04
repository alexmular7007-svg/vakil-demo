"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setActTracked } from "@/app/admin/library/actions";
import { Switch } from "@/components/ui/overlay";

/** India Code tracking toggle for one act (44px tap area on phones). */
export function TrackedSwitch({ actId, title, tracked }: { actId: string; title: string; tracked: boolean }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(tracked);
  return (
    // The label widens the tap area: clicking it activates the switch inside.
    <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 px-1.5">
      <span className="hidden text-xs text-muted md:inline" aria-hidden>
        {value ? "Tracked" : "Not tracked"}
      </span>
      <Switch
        checked={value}
        disabled={pending}
        label={`Track India Code updates for ${title}`}
        onChange={(next) =>
          start(async () => {
            setValue(next);
            const res = await setActTracked({ actId, tracked: next });
            if (res.ok) toast.success(next ? `${title} is tracked.` : `${title} is no longer tracked.`);
            else toast.error(res.error);
          })
        }
      />
    </label>
  );
}
