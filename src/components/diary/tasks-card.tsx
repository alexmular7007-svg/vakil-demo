"use client";

import { useRouter } from "next/navigation";
import { useId, useOptimistic, useState, useTransition } from "react";
import { Check, ListTodo, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Card, CardHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { createTask, deleteTask, toggleTask } from "@/app/app/diary/actions";
import { taskDueChip } from "@/lib/diary/format";
import type { MatterOption, TaskItem } from "@/lib/diary/types";
import { cn } from "@/lib/utils";

type Change = { type: "toggle"; id: string; done: boolean } | { type: "delete"; id: string } | { type: "add"; task: TaskItem };

function applyChange(list: TaskItem[], c: Change): TaskItem[] {
  if (c.type === "add") return [c.task, ...list];
  if (c.type === "delete") return list.filter((t) => t.id !== c.id);
  return list.map((t) => (t.id === c.id ? { ...t, done: c.done } : t));
}

/** Tasks with optional due date and matter; tick to complete. */
export function TasksCard({
  tasks,
  today,
  matters = [],
  fixedMatterId,
  title = "Tasks",
  className,
}: {
  tasks: TaskItem[];
  today: string;
  matters?: MatterOption[];
  /** Matter page: new tasks belong to this matter and the matter name is not repeated. */
  fixedMatterId?: string;
  title?: string;
  className?: string;
}) {
  const router = useRouter();
  const [list, change] = useOptimistic(tasks, applyChange);
  const [adding, startAdd] = useTransition();
  const [, start] = useTransition();
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [matterId, setMatterId] = useState("");
  const [error, setError] = useState<string>();
  const uid = useId();
  const open = list.filter((t) => !t.done);
  const done = list.filter((t) => t.done);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const title = text.trim();
    if (!title) return;
    const chosen = fixedMatterId ?? matterId;
    startAdd(async () => {
      change({
        type: "add",
        task: { id: `pending-${title}`, title, dueDate: due || null, matterId: chosen || null, matterTitle: matters.find((m) => m.id === chosen)?.title ?? null, done: false },
      });
      const r = await createTask({ title, dueDate: due, matterId: chosen });
      if (!r.ok) {
        setError(r.fieldErrors?.title ?? r.fieldErrors?.dueDate ?? r.error);
        toast.error(r.error);
        return;
      }
      setError(undefined);
      setText("");
      setDue("");
      router.refresh();
    });
  };

  const toggle = (t: TaskItem) =>
    start(async () => {
      change({ type: "toggle", id: t.id, done: !t.done });
      const r = await toggleTask(t.id, !t.done);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });

  const remove = (t: TaskItem) =>
    start(async () => {
      change({ type: "delete", id: t.id });
      const r = await deleteTask(t.id);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });

  return (
    <Card id="tasks" className={cn("scroll-mt-24 overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-tight text-ink">{title}</h2>
        <span className="text-xs font-semibold text-muted tabular">{open.length ? `${open.length} open` : "All done"}</span>
      </CardHeader>

      <form onSubmit={add} className="grid gap-3 px-4 pb-4 sm:px-5">
        <div className="flex gap-2">
          <Label htmlFor={`${uid}-title`} className="sr-only">
            New task
          </Label>
          <Input
            id={`${uid}-title`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            autoComplete="off"
            placeholder="Add a task, e.g. File vakalatnama"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${uid}-err` : undefined}
          />
          <Button type="submit" disabled={adding || !text.trim()} aria-label="Add task" className="px-4">
            {adding ? <Loader2 className="animate-spin" /> : <Plus />}
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
        <div className={cn("grid gap-2", !fixedMatterId && matters.length ? "grid-cols-2" : "grid-cols-1 sm:max-w-56")}>
          <div className="grid gap-1">
            <Label htmlFor={`${uid}-due`} className="text-xs text-muted">
              Due date
            </Label>
            <Input id={`${uid}-due`} type="date" value={due} onChange={(e) => setDue(e.target.value)} className="min-w-0" />
          </div>
          {!fixedMatterId && matters.length ? (
            <div className="grid min-w-0 gap-1">
              <Label htmlFor={`${uid}-matter`} className="text-xs text-muted">
                Matter
              </Label>
              <Select id={`${uid}-matter`} value={matterId} onChange={(e) => setMatterId(e.target.value)}>
                <option value="">None</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
        {error ? (
          <p id={`${uid}-err`} className="text-[13px] text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {list.length === 0 ? (
        <div className="flex items-center gap-3 border-t border-border px-4 py-5 text-sm text-muted sm:px-5">
          <ListTodo className="size-5 shrink-0" aria-hidden />
          No tasks. Add filing deadlines, papers to collect or calls to make.
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {[...open, ...done].map((t) => (
            <TaskRow key={t.id} t={t} today={today} showMatter={!fixedMatterId} onToggle={() => toggle(t)} onDelete={() => remove(t)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function TaskRow({ t, today, showMatter, onToggle, onDelete }: { t: TaskItem; today: string; showMatter: boolean; onToggle: () => void; onDelete: () => void }) {
  const chip = taskDueChip(t.dueDate, t.done, today);
  const saving = t.id.startsWith("pending-");
  return (
    <li className="flex min-h-14 items-center gap-1 pr-2 pl-2 sm:pl-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={t.done}
        aria-label={t.done ? `Mark as not done: ${t.title}` : `Mark as done: ${t.title}`}
        onClick={onToggle}
        disabled={saving}
        className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full disabled:opacity-50"
      >
        <span
          className={cn(
            "inline-flex size-[22px] items-center justify-center rounded-full border-2 transition-colors",
            t.done ? "border-success bg-success text-surface" : "border-border-input hover:border-primary",
          )}
        >
          {t.done ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
      </button>
      <div className="min-w-0 flex-1 py-2">
        <p className={cn("text-[15px] leading-snug font-medium break-words", t.done ? "text-muted line-through" : "text-ink")} data-private>
          {t.title}
        </p>
        {chip || (showMatter && t.matterTitle) ? (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            {chip ? (
              <Badge tone={chip.tone} dot={chip.tone === "danger" || chip.tone === "warning"} className="tabular">
                {chip.label}
              </Badge>
            ) : null}
            {showMatter && t.matterTitle ? (
              <span className="min-w-0 truncate text-xs text-muted" data-private>
                {t.matterTitle}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={saving}
        aria-label={`Delete task: ${t.title}`}
        className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-50 sm:size-9"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}
