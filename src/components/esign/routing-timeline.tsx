import { Check, Circle, CircleDot, Minus } from "lucide-react";
import { actionLabels, roleLabels, type RecipientAction, type RoleLabel } from "@/lib/esign/constants";
import { groupByOrder, stepState, type RecipientState, type StepState } from "@/lib/esign/workflow";
import { cn } from "@/lib/utils";
import { RecipientStatusBadge } from "./status-badge";

type Person = RecipientState & { name: string; roleLabel: string };

const stepIcon: Record<StepState, React.ComponentType<{ className?: string }>> = {
  done: Check,
  current: CircleDot,
  waiting: Circle,
  stopped: Minus,
};

const stepText: Record<StepState, string> = {
  done: "Finished",
  current: "In progress",
  waiting: "Waiting",
  stopped: "Stopped",
};

/** Progress by routing order: equal orders run in parallel, higher orders wait. */
export function RoutingTimeline({ recipients, status }: { recipients: Person[]; status: string }) {
  const groups = groupByOrder(recipients);
  return (
    <ol className="relative space-y-0">
      {groups.map((g, i) => {
        const state = stepState(g.order, recipients, status);
        const Icon = stepIcon[state];
        const last = i === groups.length - 1;
        return (
          <li key={String(g.order)} className="relative flex gap-3 pb-5 last:pb-0">
            {!last ? <span className="absolute top-8 bottom-0 left-[15px] w-px bg-border" aria-hidden /> : null}
            <span
              className={cn(
                "relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full border",
                state === "done" && "border-success bg-success text-primary-ink",
                state === "current" && "border-primary bg-primary-soft text-primary",
                state === "waiting" && "border-border-strong bg-surface text-muted",
                state === "stopped" && "border-border bg-surface-2 text-muted",
              )}
              aria-hidden
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm font-medium text-ink">
                {g.order === "CC" ? "Copies at completion" : `Step ${g.order}`}
                <span className="ml-2 text-xs font-normal text-muted">
                  {stepText[state]}
                  {g.order !== "CC" && g.items.length > 1 ? " · in parallel" : ""}
                </span>
              </p>
              <ul className="mt-2 space-y-1.5">
                {g.items.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="min-w-0 truncate text-ink-2">{r.name}</span>
                    <span className="text-xs text-muted">
                      {roleLabels[r.roleLabel as RoleLabel] ?? r.roleLabel} · {actionLabels[r.action as RecipientAction] ?? r.action}
                    </span>
                    <RecipientStatusBadge status={r.status} action={r.action} />
                  </li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
