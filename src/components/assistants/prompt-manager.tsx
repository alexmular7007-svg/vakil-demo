"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Loader2, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { copyLibraryPrompt, deletePrompt, savePrompt } from "@/app/app/assistants/actions";
import { useConfirm } from "@/components/ui/confirm";

type Prompt = { id: string; title: string; body: string; category: string; mine: boolean };

export function PromptManager({ prompts }: { prompts: Prompt[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Prompt | "new" | null>(null);
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  const mine = prompts.filter((p) => p.mine);
  const library = prompts.filter((p) => !p.mine);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Failed");
      else {
        toast.success(msg);
        router.refresh();
      }
    });

  const card = (p: Prompt) => (
    <Card key={p.id} className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-ink">{p.title}</p>
        <Badge>{p.category}</Badge>
      </div>
      <p className="mt-1.5 line-clamp-3 flex-1 text-sm text-muted" lang={/[ऀ-ॿ]/.test(p.body) ? "hi" : undefined}>
        {p.body}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/chat?prompt=${p.id}`}>
            <Play /> Use
          </Link>
        </Button>
        {p.mine ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
              <Pencil /> Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:text-danger"
              disabled={pending}
              onClick={async () => {
                if (await confirm({ title: "Delete this prompt?", tone: "danger" })) run(() => deletePrompt(p.id), "Prompt deleted");
              }}
            >
              <Trash2 />
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => copyLibraryPrompt(p.id), "Copied to My prompts")}>
            <Copy /> Copy to mine
          </Button>
        )}
      </div>
    </Card>
  );

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink">My prompts</h2>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> New prompt
          </Button>
        </div>
        {mine.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-muted">
            Save prompts you reuse, with placeholders in {"{braces}"}. They appear in the Prompts menu in Ask AI.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{mine.map(card)}</div>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-semibold text-ink">Vaakil library</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{library.map(card)}</div>
      </section>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New prompt" : "Edit prompt"}
        className="w-[min(100%-2rem,36rem)]"
      >
        {editing !== null ? (
          <form
            action={(fd) =>
              start(async () => {
                const r = await savePrompt(editing === "new" ? null : editing.id, fd);
                if (!r.ok) return void toast.error(r.error);
                setEditing(null);
                toast.success("Prompt saved");
                router.refresh();
              })
            }
            className="grid gap-4"
          >
            <Field label="Title" htmlFor="p-title" required>
              <Input id="p-title" name="title" defaultValue={editing === "new" ? "" : editing.title} maxLength={120} required />
            </Field>
            <Field label="Category" htmlFor="p-cat">
              <Input id="p-cat" name="category" defaultValue={editing === "new" ? "General" : editing.category} maxLength={40} />
            </Field>
            <Field label="Prompt" htmlFor="p-body" required hint="Use {braces} for the parts you fill in each time.">
              <Textarea id="p-body" name="body" defaultValue={editing === "new" ? "" : editing.body} rows={7} maxLength={4000} required />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null} Save
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
