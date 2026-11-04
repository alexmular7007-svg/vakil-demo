"use client";

import { useTransition } from "react";
import { Laptop, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { revokeOtherSessions, revokeSession } from "@/app/app/settings/security/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";

export type SessionView = {
  id: string;
  device: string;
  mobile: boolean;
  ip: string | null;
  createdAt: string;
  lastActive: string;
  current: boolean;
};

export function SessionsList({ sessions }: { sessions: SessionView[] }) {
  const [pending, start] = useTransition();
  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted" aria-hidden>
              {s.mobile ? <Smartphone className="size-5" /> : <Laptop className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                {s.device}
                {s.current ? <Badge tone="success">This device</Badge> : null}
              </p>
              <p className="text-sm text-muted">
                {s.ip ? `${s.ip} · ` : ""}Signed in {s.createdAt} · Last active {s.lastActive}
              </p>
            </div>
            {!s.current ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await revokeSession(s.id);
                    if (res.ok) toast.success("Session signed out.");
                    else toast.error(res.error);
                  })
                }
              >
                Sign out
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {others > 0 ? (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await revokeOtherSessions();
                if (res.ok) toast.success("Signed out of all other devices.");
                else toast.error(res.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            Sign out of all other devices
          </Button>
        </div>
      ) : null}
    </div>
  );
}
