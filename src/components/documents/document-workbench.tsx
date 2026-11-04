"use client";

import { useState, useTransition } from "react";
import { Copy, FileText, GitCompareArrows, ListChecks, Loader2, MessageSquareText, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  askDocument,
  compareDocumentsWithAi,
  diffDocuments,
  reviewDocumentRisks,
  summarizeDocument,
  type DocAiResult,
  type LineDiffResult,
} from "@/app/app/documents/actions";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Markdown } from "@/components/drafting/markdown";
import { site } from "@/lib/site";
import { istDate as formatDate } from "@/lib/drafting/format";
import { cn } from "@/lib/utils";
import { DiffStatsRow, DiffView } from "./diff-view";

type Tab = "text" | "summary" | "risks" | "ask" | "compare";

const ROLE_SUGGESTIONS = [
  "the first party",
  "the second party",
  "the Licensor (owner)",
  "the Licensee (occupant)",
  "the Employer",
  "the Employee",
  "the Buyer",
  "the Seller",
  "the Service Provider",
  "the Client",
  "the Lender",
  "the Borrower",
  "the Company",
  "the Vendor",
];

export function DocumentWorkbench({
  doc,
  text,
  textTruncated,
  totalChars,
  others,
  aiEnabled,
}: {
  doc: { id: string; name: string };
  text: string;
  textTruncated: boolean;
  totalChars: number;
  others: { id: string; name: string; createdAt: Date }[];
  aiEnabled: boolean;
}) {
  const [tab, setTab] = useState<Tab>("text");
  const tabs: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "text", label: "Text", icon: FileText },
    { value: "summary", label: "Summary", icon: ListChecks },
    { value: "risks", label: "Risks", icon: ShieldAlert },
    { value: "ask", label: "Ask", icon: MessageSquareText },
    { value: "compare", label: "Compare", icon: GitCompareArrows },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Document tools" className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1 sm:w-fit">
        {tabs.map((t) => (
          <button
            key={t.value}
            id={`tab-${t.value}`}
            role="tab"
            type="button"
            aria-selected={tab === t.value}
            aria-controls={`panel-${t.value}`}
            onClick={() => setTab(t.value)}
            className={cn(
              "inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted transition-colors sm:flex-none",
              tab === t.value ? "bg-surface text-ink shadow-sm" : "hover:text-ink",
            )}
          >
            <t.icon className="hidden size-4 sm:block" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {/* Panels stay mounted so results survive switching tabs. */}
      <div id="panel-text" role="tabpanel" aria-labelledby="tab-text" hidden={tab !== "text"}>
        <TextPanel text={text} truncated={textTruncated} totalChars={totalChars} />
      </div>
      <div id="panel-summary" role="tabpanel" aria-labelledby="tab-summary" hidden={tab !== "summary"}>
        <SummaryPanel docId={doc.id} aiEnabled={aiEnabled} />
      </div>
      <div id="panel-risks" role="tabpanel" aria-labelledby="tab-risks" hidden={tab !== "risks"}>
        <RiskPanel docId={doc.id} aiEnabled={aiEnabled} />
      </div>
      <div id="panel-ask" role="tabpanel" aria-labelledby="tab-ask" hidden={tab !== "ask"}>
        <AskPanel docId={doc.id} aiEnabled={aiEnabled} />
      </div>
      <div id="panel-compare" role="tabpanel" aria-labelledby="tab-compare" hidden={tab !== "compare"}>
        <ComparePanel doc={doc} others={others} aiEnabled={aiEnabled} />
      </div>
    </div>
  );
}

function AiOff() {
  return (
    <Alert tone="warning" title="AI review is not switched on">
      An administrator needs to add an Anthropic or Google AI key to the server. The extracted text and the line-by-line comparison work without it.
    </Alert>
  );
}

function AiOutput({ result, onRerun, pending }: { result: DocAiResult; onRerun?: () => void; pending?: boolean }) {
  return (
    <Card className="p-4 sm:p-6">
      {result.notes.length ? (
        <div className="mb-4 space-y-2">
          {result.notes.map((n) => (
            <Alert key={n} tone="info">
              {n}
            </Alert>
          ))}
        </div>
      ) : null}
      <Markdown>{result.text}</Markdown>
      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">AI analysis: check it against the document before relying on it. {site.disclaimer}</p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(result.text).then(() => toast.success("Copied"))}
          >
            <Copy /> Copy
          </Button>
          {onRerun ? (
            <Button variant="outline" size="sm" onClick={onRerun} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Run again
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function Working({ label }: { label: string }) {
  return (
    <Card className="flex items-center gap-3 p-5 text-sm text-muted" aria-live="polite">
      <Loader2 className="size-5 animate-spin text-primary" aria-hidden /> {label}
    </Card>
  );
}

/* --------------------------------- text --------------------------------- */

function TextPanel({ text, truncated, totalChars }: { text: string; truncated: boolean; totalChars: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-sm text-muted">
        <span>{totalChars.toLocaleString("en-IN")} characters extracted</span>
        <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success("Text copied"))}>
          <Copy /> Copy text
        </Button>
      </div>
      {truncated ? (
        <p className="border-b border-border bg-info-soft px-4 py-2 text-sm text-ink-2">
          Showing the first {text.length.toLocaleString("en-IN")} characters. AI tools and comparison use the full text.
        </p>
      ) : null}
      <div className="max-h-[70vh] overflow-y-auto scrollbar-thin px-4 py-4 sm:px-6">
        <pre className="font-sans text-[15px] leading-relaxed break-words whitespace-pre-wrap text-ink">{text}</pre>
      </div>
    </Card>
  );
}

/* -------------------------------- summary ------------------------------- */

function SummaryPanel({ docId, aiEnabled }: { docId: string; aiEnabled: boolean }) {
  const [result, setResult] = useState<DocAiResult | null>(null);
  const [pending, start] = useTransition();
  if (!aiEnabled) return <AiOff />;
  const run = () =>
    start(async () => {
      const res = await summarizeDocument({ documentId: docId });
      if (!res.ok) toast.error(res.error);
      else setResult(res.data);
    });
  return (
    <div className="space-y-4">
      {!result && !pending ? (
        <Card className="p-5">
          <p className="text-sm text-ink-2">Parties, key dates and deadlines, each party&apos;s obligations, money terms, termination, and governing law.</p>
          <Button className="mt-4" onClick={run}>
            <Sparkles /> Summarise document
          </Button>
        </Card>
      ) : null}
      {pending ? <Working label="Reading the document and preparing a summary…" /> : null}
      {result && !pending ? <AiOutput result={result} onRerun={run} pending={pending} /> : null}
    </div>
  );
}

/* --------------------------------- risks -------------------------------- */

function RiskPanel({ docId, aiEnabled }: { docId: string; aiEnabled: boolean }) {
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocAiResult | null>(null);
  const [pending, start] = useTransition();
  if (!aiEnabled) return <AiOff />;
  const run = () => {
    if (role.trim().length < 2) {
      setError("Say whom you represent, for example the Licensee.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await reviewDocumentRisks({ documentId: docId, role });
      if (!res.ok) toast.error(res.error);
      else setResult(res.data);
    });
  };
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <Field label="I represent…" htmlFor="risk-role" error={error} hint="Pick a suggestion or type the party's role." className="flex-1">
            <Input id="risk-role" list="risk-roles" value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} placeholder="e.g. the Licensee" />
          </Field>
          <datalist id="risk-roles">
            {ROLE_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <Button type="submit" disabled={pending} className="sm:mb-[1.375rem]">
            {pending ? <Loader2 className="animate-spin" /> : <ShieldAlert />} Review risks
          </Button>
        </form>
        <p className="mt-3 text-[13px] text-muted">Lists one-sided, missing and unusual clauses from your client&apos;s side, with suggested redlines.</p>
      </Card>
      {pending ? <Working label="Reviewing clauses from your client's side…" /> : null}
      {result && !pending ? <AiOutput result={result} onRerun={run} pending={pending} /> : null}
    </div>
  );
}

/* ---------------------------------- ask --------------------------------- */

function AskPanel({ docId, aiEnabled }: { docId: string; aiEnabled: boolean }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<{ q: string; a: DocAiResult }[]>([]);
  const [pending, start] = useTransition();
  if (!aiEnabled) return <AiOff />;
  const run = () => {
    const q = question.trim();
    if (q.length < 3) {
      toast.error("Type a question first.");
      return;
    }
    start(async () => {
      const res = await askDocument({ documentId: docId, question: q });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setHistory((h) => [{ q, a: res.data }, ...h]);
      setQuestion("");
    });
  };
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
          className="space-y-3"
        >
          <Field label="Ask a question about this document" htmlFor="doc-question" hint="Answers come only from the document, with quotations.">
            <Textarea
              id="doc-question"
              rows={3}
              value={question}
              maxLength={2000}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  run();
                }
              }}
              placeholder="e.g. What is the notice period for termination, and who can terminate?"
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <MessageSquareText />} Ask
          </Button>
        </form>
      </Card>
      {pending ? <Working label="Searching the document…" /> : null}
      {history.map((h, i) => (
        <div key={history.length - i} className="space-y-2">
          <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-ink">{h.q}</p>
          <AiOutput result={h.a} />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- compare ------------------------------- */

function ComparePanel({ doc, others, aiEnabled }: { doc: { id: string; name: string }; others: { id: string; name: string; createdAt: Date }[]; aiEnabled: boolean }) {
  const [otherId, setOtherId] = useState(others[0]?.id ?? "");
  const [diff, setDiff] = useState<LineDiffResult | null>(null);
  const [ai, setAi] = useState<DocAiResult | null>(null);
  const [diffPending, startDiff] = useTransition();
  const [aiPending, startAi] = useTransition();

  if (others.length === 0) {
    return (
      <Alert tone="info" title="Nothing to compare yet">
        Upload another document (for example the other side&apos;s version) to compare it with this one.
      </Alert>
    );
  }

  const runDiff = () =>
    startDiff(async () => {
      const res = await diffDocuments({ documentId: doc.id, otherId });
      if (!res.ok) toast.error(res.error);
      else setDiff(res.data);
    });
  const runAi = () =>
    startAi(async () => {
      const res = await compareDocumentsWithAi({ documentId: doc.id, otherId });
      if (!res.ok) toast.error(res.error);
      else setAi(res.data);
    });

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <Field label="Compare with" htmlFor="compare-other" className="flex-1">
            <Select
              id="compare-other"
              value={otherId}
              onChange={(e) => {
                setOtherId(e.target.value);
                setDiff(null);
                setAi(null);
              }}
            >
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({formatDate(o.createdAt)})
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={runDiff} disabled={diffPending || !otherId}>
              {diffPending ? <Loader2 className="animate-spin" /> : <GitCompareArrows />} Line differences
            </Button>
            <Button onClick={runAi} disabled={!aiEnabled || aiPending || !otherId} title={aiEnabled ? undefined : "AI is not switched on"}>
              {aiPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Compare with AI
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Line differences are computed exactly, without AI. The AI comparison explains what the changes mean.
        </p>
      </Card>

      {!aiEnabled ? <AiOff /> : null}

      {diffPending ? <Working label="Comparing line by line…" /> : null}
      {diff && !diffPending ? (
        <section aria-label="Line differences" className="space-y-3">
          <h3 className="font-serif text-base font-semibold text-ink">Line differences</h3>
          <DiffStatsRow stats={diff.stats} />
          {diff.ok ? (
            diff.stats.added + diff.stats.removed === 0 ? (
              <Alert tone="success">The two documents have the same text, line for line (ignoring spacing).</Alert>
            ) : (
              <>
                <DiffView hunks={diff.hunks} leftName={doc.name} rightName={diff.otherName} />
                {diff.truncated ? <p className="text-sm text-muted">Only the first 4,000 changed or context lines are shown.</p> : null}
              </>
            )
          ) : (
            <Alert tone="warning" title="Too different for a line-by-line view">
              These documents share very few lines, so a line diff would not be useful. The counts above show lines found in only one of them.
              {aiEnabled ? " Try the AI comparison instead." : null}
            </Alert>
          )}
        </section>
      ) : null}

      {aiPending ? <Working label="Comparing the documents with AI…" /> : null}
      {ai && !aiPending ? (
        <section aria-label="AI comparison" className="space-y-3">
          <h3 className="font-serif text-base font-semibold text-ink">AI comparison</h3>
          <AiOutput result={ai} onRerun={runAi} pending={aiPending} />
        </section>
      ) : null}
    </div>
  );
}
