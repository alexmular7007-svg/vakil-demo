"use client";

import { useId, useState, useTransition } from "react";
import { CalendarPlus, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Dialog, Tabs } from "@/components/ui/overlay";
import { readOrder, type OrderReading } from "@/app/app/diary/actions";
import { formatDayDate } from "@/lib/diary/dates";
import { draftFromProposal } from "@/lib/diary/drafts";
import { useDiary } from "./diary-provider";

export type OrderDoc = { id: string; name: string; matterId: string | null };

/**
 * "Read an order": AI proposes the next date, purpose and court from a pasted
 * order or an uploaded document. The proposal opens in the hearing form; nothing
 * is saved until the advocate checks it and taps "Add to diary".
 */
export function ReadOrderDialog({ open, onClose, docs, aiEnabled }: { open: boolean; onClose: () => void; docs: OrderDoc[]; aiEnabled: boolean }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Read an order"
      description="AI suggests the next date from the order. You check it before anything is saved."
      className="w-[min(100%-2rem,40rem)]"
    >
      {open ? <ReadOrderForm docs={docs} aiEnabled={aiEnabled} onClose={onClose} /> : null}
    </Dialog>
  );
}

function ReadOrderForm({ docs, aiEnabled, onClose }: { docs: OrderDoc[]; aiEnabled: boolean; onClose: () => void }) {
  const { newHearing, matters, today } = useDiary();
  const [source, setSource] = useState<"paste" | "document">("paste");
  const [text, setText] = useState("");
  const [docId, setDocId] = useState(docs[0]?.id ?? "");
  const [reading, setReading] = useState<OrderReading | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const uid = useId();

  if (!aiEnabled) {
    return (
      <div className="grid gap-4">
        <Alert tone="warning" title="AI is not configured">
          Reading orders needs an Anthropic or Google AI key on the server, and none is set. You can still add the next date yourself.
        </Alert>
        <div className="flex justify-end">
          <Button
            onClick={() => {
              onClose();
              newHearing();
            }}
          >
            <CalendarPlus /> Add hearing
          </Button>
        </div>
      </div>
    );
  }

  const run = () =>
    start(async () => {
      setError(undefined);
      const r = await readOrder(source === "document" ? { documentId: docId } : { text });
      if (!r.ok) {
        setError(r.fieldErrors?.text ?? r.error);
        if (!r.fieldErrors) toast.error(r.error);
        return;
      }
      setReading(r.data);
    });

  const review = () => {
    if (!reading) return;
    const matter = matters.find((m) => m.id === reading.matterId) ?? null;
    const draft = draftFromProposal(reading.proposal, matter, today);
    onClose();
    newHearing(draft, { evidence: reading.proposal.evidence, evidenceFound: reading.evidenceFound, notes: reading.notes });
  };

  if (reading) {
    const p = reading.proposal;
    const rows: [string, string | null][] = [
      ["Next date", p.nextDate ? formatDayDate(p.nextDate) : null],
      ["Purpose", p.purpose],
      ["Court", p.court],
      ["Bench / hall", p.bench],
      ["Item no.", p.itemNo],
      ["Case", p.caseTitle],
      ["Case no.", p.caseNo],
    ];
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            <Sparkles /> AI draft
          </Badge>
          <span className="text-sm text-muted">Not saved. Check it against the order.</span>
        </div>
        <dl className="divide-y divide-border rounded-[14px] border border-border">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-start gap-3 px-3.5 py-2.5">
              <dt className="w-24 shrink-0 text-[13px] text-muted">{label}</dt>
              <dd className={value ? "min-w-0 flex-1 text-sm font-semibold text-ink tabular" : "min-w-0 flex-1 text-sm text-muted"}>{value ?? "Not stated"}</dd>
            </div>
          ))}
        </dl>
        {p.evidence ? (
          <Alert tone={reading.evidenceFound ? "success" : "warning"} title={reading.evidenceFound ? "Found in the order" : "Quote not found word for word"}>
            <q className="italic">{p.evidence}</q>
          </Alert>
        ) : null}
        {reading.notes.length ? (
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
            {reading.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
        <div className="sticky -bottom-4 -mx-5 -mb-4 flex items-center justify-between gap-2 border-t border-border bg-surface px-5 py-3">
          <Button variant="ghost" onClick={() => setReading(null)}>
            <RotateCcw /> Start over
          </Button>
          <Button onClick={review}>
            <CalendarPlus /> Review and add
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {docs.length ? (
        <Tabs
          value={source}
          onChange={(v) => setSource(v as "paste" | "document")}
          tabs={[
            { value: "paste", label: "Paste text" },
            { value: "document", label: "Uploaded document" },
          ]}
        />
      ) : null}
      {source === "paste" || docs.length === 0 ? (
        <Field
          label="Order or roznama text"
          htmlFor={`${uid}-text`}
          error={error}
          hint="Copy the order from the court website or your scanned copy and paste it here."
        >
          <Textarea
            id={`${uid}-text`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            maxLength={200_000}
            placeholder="e.g. Present: counsel for both sides. Reply not filed. Last opportunity granted. List on 15.12.2026 for arguments."
          />
        </Field>
      ) : (
        <Field label="Document" htmlFor={`${uid}-doc`} error={error} hint="Only documents with extracted text are listed.">
          <Select id={`${uid}-doc`} value={docId} onChange={(e) => setDocId(e.target.value)}>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <p className="text-xs text-muted">AI can misread dates. Whatever it suggests opens in the hearing form for you to check and save.</p>
      <div className="sticky -bottom-4 -mx-5 -mb-4 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={run} disabled={pending || (source === "paste" || docs.length === 0 ? text.trim().length < 40 : !docId)}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Read order
        </Button>
      </div>
    </div>
  );
}
