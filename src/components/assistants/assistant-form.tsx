"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, MessageSquareText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { deleteAssistant, saveAssistant } from "@/app/app/assistants/actions";
import { useConfirm } from "@/components/ui/confirm";

type Assistant = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  modelTier: string;
  knowledgeDocumentIds: string[];
};

const starter = `You help me prepare bail applications in Sessions Courts in Uttar Pradesh.
- Ask for the FIR number, sections, date of offence and custody period if missing.
- Structure arguments under: grounds, parity, custody period, antecedents, proposed conditions.
- Write in formal court English. Keep each ground to a short paragraph.`;

export function AssistantForm({
  assistant,
  documents,
  allowedTiers,
}: {
  assistant?: Assistant;
  documents: { id: string; name: string }[];
  allowedTiers: string[];
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>();
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  const selected = new Set(assistant?.knowledgeDocumentIds ?? []);

  return (
    <form
      action={(fd) =>
        start(async () => {
          const r = await saveAssistant(assistant?.id ?? null, fd);
          if (!r.ok) {
            setErrors(r.fieldErrors);
            toast.error(r.error);
            return;
          }
          toast.success(assistant ? "Assistant updated" : "Assistant created");
          router.push(`/app/assistants/${r.data.id}`);
          router.refresh();
        })
      }
      className="grid gap-5"
    >
      <Field label="Name" htmlFor="name" required error={errors?.name}>
        <Input id="name" name="name" defaultValue={assistant?.name} maxLength={80} placeholder="e.g. Bail drafting helper" required />
      </Field>
      <Field label="Short description" htmlFor="description" error={errors?.description}>
        <Input id="description" name="description" defaultValue={assistant?.description} maxLength={300} placeholder="What it helps with" />
      </Field>
      <Field
        label="Instructions"
        htmlFor="instructions"
        required
        error={errors?.instructions}
        hint="How it should work: tone, structure, what to ask for. Vaakil's citation and safety rules always apply on top."
      >
        <Textarea id="instructions" name="instructions" defaultValue={assistant?.instructions ?? starter} rows={10} maxLength={6000} required />
      </Field>
      <Field label="Model" htmlFor="modelTier" hint="Deep uses the strongest model and more of your fair-use allowance.">
        <Select id="modelTier" name="modelTier" defaultValue={assistant?.modelTier ?? "standard"}>
          <option value="fast">Fast: quick lookups</option>
          <option value="standard">Standard: most work</option>
          <option value="pro" disabled={!allowedTiers.includes("pro")}>
            Deep: hardest analysis{allowedTiers.includes("pro") ? "" : " (Pro plan)"}
          </option>
        </Select>
      </Field>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-ink">Knowledge files</legend>
        <p className="text-[13px] text-muted">The assistant searches these documents when answering. Only your own processed documents can be added.</p>
        {documents.length === 0 ? (
          <p className="text-sm text-muted">
            No documents yet. <Link href="/app/documents" className="text-primary underline">Upload one</Link>.
          </p>
        ) : (
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
            {documents.map((d) => (
              <label key={d.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2">
                <Checkbox name="knowledgeDocumentIds" value={d.id} defaultChecked={selected.has(d.id)} />
                <span className="truncate">{d.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <Alert tone="info">Assistants are private to you. Anything in instructions or knowledge files is sent to the AI provider with your questions.</Alert>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} {assistant ? "Save changes" : "Create assistant"}
        </Button>
        {assistant ? (
          <>
            <Button asChild variant="outline">
              <Link href={`/app/chat?assistant=${assistant.id}`}>
                <MessageSquareText /> Chat with it
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="ml-auto text-danger hover:text-danger"
              onClick={async () => {
                if (!(await confirm({ title: `Delete "${assistant.name}"?`, description: "Conversations that used it are kept.", tone: "danger" }))) return;
                start(async () => {
                  const r = await deleteAssistant(assistant.id);
                  if (!r.ok) toast.error(r.error);
                  else router.push("/app/assistants");
                });
              }}
            >
              <Trash2 /> Delete
            </Button>
          </>
        ) : null}
      </div>
    </form>
  );
}
