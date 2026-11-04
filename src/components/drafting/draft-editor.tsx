"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlignCenter,
  AlignRight,
  ArrowLeft,
  Bold,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  FileDown,
  FileSignature,
  Heading1,
  Heading2,
  History,
  Languages,
  ListChecks,
  Loader2,
  Lock,
  MoreHorizontal,
  Printer,
  RotateCcw,
  Save,
  SeparatorHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Unlock,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  aiAssistDraft,
  deleteDraft,
  getDraftVersion,
  linkDraftMatter,
  restoreDraftVersion,
  saveDraft,
  setDraftStatus,
  type DraftAiResult,
} from "@/app/app/drafts/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/display";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Dialog, Menu, MenuItem } from "@/components/ui/overlay";
import { findPlaceholders, humanizePlaceholder } from "@/lib/drafting/fill";
import { wordCount } from "@/lib/drafting/markup";
import type { MatterOption } from "@/lib/drafting/queries";
import { site } from "@/lib/site";
import { istDateTime as formatDateTime } from "@/lib/drafting/format";
import { cn } from "@/lib/utils";
import { DraftDocument } from "./draft-document";
import { Markdown } from "./markdown";
import { ReviewBadge } from "./review-badge";
import { Segmented } from "./segmented";

type Lang = "en" | "hi";
type VersionRow = { version: number; sha256: string; createdAt: Date };
type AiAction = "improve" | "translate" | "expand" | "check";

export type DraftEditorProps = {
  draft: {
    id: string;
    title: string;
    body: string;
    language: Lang;
    status: "draft" | "final";
    version: number;
    matterId: string | null;
    updatedAt: Date;
  };
  template: { slug: string; title: string; esignAllowed: boolean; esignNote: string | null; reviewedBy: string | null } | null;
  versions: VersionRow[];
  matters: MatterOption[];
  aiEnabled: boolean;
};

const WIDE = "(min-width: 1024px)";
function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const LINE_PREFIX = /^(#{1,3} |\^\^ ?|>> ?)/;

export function DraftEditor({ draft, template, versions: initialVersions, matters, aiEnabled }: DraftEditorProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [language, setLanguage] = useState<Lang>(draft.language);
  const [saved, setSaved] = useState({ title: draft.title, body: draft.body, language: draft.language, version: draft.version, updatedAt: draft.updatedAt });
  const [status, setStatus] = useState(draft.status);
  const [versions, setVersions] = useState<VersionRow[]>(initialVersions);
  const [matterId, setMatterId] = useState(draft.matterId ?? "");
  const [modeChoice, setModeChoice] = useState<"edit" | "preview" | "split" | null>(null);

  const [saving, startSave] = useTransition();
  const [busy, startBusy] = useTransition();
  const [aiPending, startAi] = useTransition();
  const [aiRunning, setAiRunning] = useState<AiAction | null>(null);
  const [aiResult, setAiResult] = useState<(DraftAiResult & { action: AiAction }) | null>(null);
  const [aiView, setAiView] = useState<"preview" | "text">("preview");
  const [factsOpen, setFactsOpen] = useState(false);
  const [facts, setFacts] = useState("");
  const [viewing, setViewing] = useState<{ version: number; body: string; sha256: string; createdAt: Date } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isWide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const mode = modeChoice === "split" && !isWide ? "edit" : (modeChoice ?? (isWide ? "split" : "edit"));

  const final = status === "final";
  const dirty = body !== saved.body || title.trim() !== saved.title || language !== saved.language;
  const deferredBody = useDeferredValue(body);
  const remaining = useMemo(() => findPlaceholders(body), [body]);
  const words = useMemo(() => wordCount(deferredBody), [deferredBody]);

  // Warn before leaving with unsaved changes (browser navigation, refresh, close).
  useBeforeUnload(dirty);

  /* ------------------------------ saving ------------------------------ */

  function save() {
    if (final || saving) return;
    const t = title.trim();
    if (!t) {
      toast.error("Give the draft a title before saving.");
      return;
    }
    if (!dirty) {
      toast.message("No changes to save.");
      return;
    }
    const snapshot = { title: t, body, language };
    startSave(async () => {
      const res = await saveDraft({ draftId: draft.id, ...snapshot, expectedVersion: saved.version });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSaved({ ...snapshot, version: res.data.version, updatedAt: res.data.updatedAt });
      const created = res.data.created;
      if (created) setVersions((v) => [created, ...v]);
      toast.success(created ? `Saved as version ${created.version}` : "Title saved");
    });
  }

  function discard() {
    setBody(saved.body);
    setTitle(saved.title);
    setLanguage(saved.language);
    toast.message("Changes discarded");
  }

  function onEditorKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    }
  }

  /* --------------------------- markup helpers --------------------------- */

  function withSelection(fn: (text: string, start: number, end: number) => { text: string; start: number; end: number }) {
    const ta = textareaRef.current;
    if (!ta || final) return;
    const r = fn(body, ta.selectionStart, ta.selectionEnd);
    setBody(r.text);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(r.start, r.end);
    });
  }

  function toggleLinePrefix(prefix: string) {
    withSelection((text, start, end) => {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const lineEndIdx = text.indexOf("\n", end);
      const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
      const lines = text.slice(lineStart, lineEnd).split("\n");
      const allHave = lines.every((l) => l.startsWith(prefix));
      const next = lines.map((l) => (allHave ? l.slice(prefix.length) : prefix + l.replace(LINE_PREFIX, ""))).join("\n");
      return { text: text.slice(0, lineStart) + next + text.slice(lineEnd), start: lineStart, end: lineStart + next.length };
    });
  }

  function toggleBold() {
    withSelection((text, start, end) => {
      const sel = text.slice(start, end) || "bold text";
      if (sel.startsWith("**") && sel.endsWith("**") && sel.length > 4) {
        const inner = sel.slice(2, -2);
        return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
      }
      const wrapped = `**${sel}**`;
      return { text: text.slice(0, start) + wrapped + text.slice(end), start: start + 2, end: start + 2 + sel.length };
    });
  }

  function insertPageBreak() {
    withSelection((text, start) => {
      const insert = `${start > 0 && text[start - 1] !== "\n" ? "\n" : ""}\n===\n\n`;
      const pos = start + insert.length;
      return { text: text.slice(0, start) + insert + text.slice(start), start: pos, end: pos };
    });
  }

  function jumpToPlaceholder(name: string) {
    if (mode === "preview") setModeChoice("edit");
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const m = new RegExp(`\\{\\{\\s*${name}\\s*(\\|[a-z]+\\s*)?\\}\\}`).exec(body);
      if (!m) return;
      ta.focus();
      ta.setSelectionRange(m.index, m.index + m[0].length);
      const line = body.slice(0, m.index).split("\n").length;
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 24;
      ta.scrollTop = Math.max(0, (line - 4) * lh);
    });
  }

  /* -------------------------------- AI -------------------------------- */

  function runAi(action: AiAction, extra: { facts?: string } = {}) {
    if (!body.trim()) {
      toast.error("The draft is empty. Add some text first.");
      return;
    }
    setAiRunning(action);
    startAi(async () => {
      const res = await aiAssistDraft({
        draftId: draft.id,
        action,
        body,
        language,
        targetLanguage: action === "translate" ? (language === "hi" ? "en" : "hi") : undefined,
        facts: extra.facts,
      });
      setAiRunning(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setAiView("preview");
      setAiResult({ ...res.data, action });
      if (action === "expand") setFactsOpen(false);
    });
  }

  function acceptAi() {
    if (!aiResult || aiResult.kind !== "document") return;
    setBody(aiResult.text);
    if (aiResult.language !== language) setLanguage(aiResult.language);
    setAiResult(null);
    toast.success("AI text placed in the editor. Review it, then save a version.");
  }

  /* ------------------------- versions, status ------------------------- */

  function viewVersion(version: number) {
    startBusy(async () => {
      const res = await getDraftVersion({ draftId: draft.id, version });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setViewing(res.data);
    });
  }

  function restore(version: number) {
    if (dirty) {
      toast.error("Save or discard your changes before restoring a version.");
      return;
    }
    startBusy(async () => {
      const res = await restoreDraftVersion({ draftId: draft.id, version, expectedVersion: saved.version });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setBody(res.data.body);
      setSaved((s) => ({ ...s, body: res.data.body, version: res.data.version, updatedAt: res.data.created.createdAt }));
      setVersions((v) => [res.data.created, ...v]);
      setViewing(null);
      toast.success(`Version ${version} restored as version ${res.data.version}`);
    });
  }

  function changeStatus(next: "draft" | "final") {
    if (next === "final" && dirty) {
      toast.error("Save your changes before marking the draft final.");
      return;
    }
    startBusy(async () => {
      const res = await setDraftStatus({ draftId: draft.id, status: next });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setStatus(res.data.status);
      toast.success(next === "final" ? "Marked final. Editing is locked until you reopen it." : "Reopened for editing");
    });
  }

  function changeMatter(next: string) {
    const prev = matterId;
    setMatterId(next);
    startBusy(async () => {
      const res = await linkDraftMatter({ draftId: draft.id, matterId: next || null });
      if (!res.ok) {
        setMatterId(prev);
        toast.error(res.error);
        return;
      }
      toast.success(next ? "Linked to matter" : "Matter link removed");
    });
  }

  function remove() {
    startBusy(async () => {
      const res = await deleteDraft({ draftId: draft.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDeleteOpen(false);
      toast.success("Draft deleted");
      router.push("/app/drafts");
    });
  }

  const esignAllowed = template ? template.esignAllowed : true;
  const latest = versions[0]?.version;

  /* ------------------------------ render ------------------------------ */

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Link href="/app/drafts" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Drafts
        </Link>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="draft-title" className="sr-only">
              Draft title
            </label>
            <input
              id="draft-title"
              value={title}
              maxLength={200}
              readOnly={final}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={onEditorKey}
              lang={language === "hi" ? "hi" : undefined}
              className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 -ml-1 font-serif text-2xl font-semibold tracking-tight text-ink hover:border-border focus-visible:border-ring focus-visible:outline-none sm:text-[28px]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {final ? (
                <Badge tone="success">
                  <Lock aria-hidden /> Final
                </Badge>
              ) : (
                <Badge>In progress</Badge>
              )}
              <Badge tone="outline">Version {saved.version}</Badge>
              <Badge tone="outline" lang={language === "hi" ? "hi" : undefined}>
                {language === "hi" ? "हिन्दी" : "English"}
              </Badge>
              {template ? <ReviewBadge reviewedBy={template.reviewedBy} /> : null}
              <span className="text-muted" aria-live="polite">
                {saving ? "Saving…" : dirty ? "Unsaved changes" : `Saved ${formatDateTime(saved.updatedAt)}`}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {dirty && !final ? (
              <Button variant="ghost" onClick={discard} disabled={saving}>
                <Undo2 /> Discard
              </Button>
            ) : null}
            <Button onClick={save} disabled={final || saving || !dirty} title="Save as a new version (Ctrl/⌘ + S)">
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Save version
            </Button>
            <Menu
              trigger={({ toggle, open }) => (
                <Button variant="outline" onClick={toggle} aria-expanded={open} aria-haspopup="menu" disabled={dirty} title={dirty ? "Save first: exports use the saved version" : undefined}>
                  <FileDown /> Export <ChevronDown />
                </Button>
              )}
            >
              {(close) => (
                <>
                  <a
                    role="menuitem"
                    href={`/api/drafts/${draft.id}/docx`}
                    onClick={close}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink [&_svg]:size-4 [&_svg]:text-muted"
                  >
                    <FileDown /> Word document (.docx)
                  </a>
                  <Link
                    role="menuitem"
                    href={`/app/drafts/${draft.id}/print`}
                    onClick={close}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink [&_svg]:size-4 [&_svg]:text-muted"
                  >
                    <Printer /> Print or save as PDF
                  </Link>
                </>
              )}
            </Menu>
            {esignAllowed ? (
              dirty ? (
                <Button variant="outline" disabled title="Save first: the saved version is sent for signature">
                  <FileSignature /> Send for signature
                </Button>
              ) : (
                <Link href={`/app/sign/new?draft=${draft.id}`} className={buttonVariants({ variant: "outline" })}>
                  <FileSignature /> Send for signature
                </Link>
              )
            ) : null}
            <Menu
              trigger={({ toggle, open }) => (
                <Button variant="ghost" size="icon" onClick={toggle} aria-expanded={open} aria-haspopup="menu" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              )}
            >
              {(close) => (
                <>
                  {final ? (
                    <MenuItem
                      onClick={() => {
                        close();
                        changeStatus("draft");
                      }}
                    >
                      <Unlock /> Reopen for editing
                    </MenuItem>
                  ) : (
                    <MenuItem
                      onClick={() => {
                        close();
                        changeStatus("final");
                      }}
                    >
                      <CheckCircle2 /> Mark as final
                    </MenuItem>
                  )}
                  <MenuItem
                    onClick={() => {
                      close();
                      setDeleteOpen(true);
                    }}
                    className="text-danger hover:text-danger [&_svg]:text-danger"
                  >
                    <Trash2 /> Delete draft
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        </div>
      </div>

      {final ? (
        <Alert tone="success" title="This draft is marked final">
          Editing is locked so the final text stays as saved in version {saved.version}. Reopen it from the ⋯ menu to make changes.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Editor and preview */}
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4">
            <Segmented
              label="View"
              size="sm"
              value={mode}
              onChange={setModeChoice}
              options={[
                { value: "edit", label: "Edit" },
                { value: "preview", label: <><Eye aria-hidden /> Preview</> },
                { value: "split", label: "Split", className: "hidden lg:inline-flex" },
              ]}
            />
            {mode !== "preview" && !final ? (
              <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Formatting">
                <ToolButton label="Bold" onClick={toggleBold} icon={Bold} />
                <ToolButton label="Centred title" onClick={() => toggleLinePrefix("# ")} icon={Heading1} />
                <ToolButton label="Centred heading" onClick={() => toggleLinePrefix("## ")} icon={Heading2} />
                <ToolButton label="Centre line" onClick={() => toggleLinePrefix("^^ ")} icon={AlignCenter} />
                <ToolButton label="Right-align line" onClick={() => toggleLinePrefix(">> ")} icon={AlignRight} />
                <ToolButton label="Page break" onClick={insertPageBreak} icon={SeparatorHorizontal} />
              </div>
            ) : null}
          </div>

          {remaining.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-warning-soft/50 px-3 py-2 text-[13px] sm:px-4">
              <span className="font-medium text-ink">Still to fill ({remaining.length}):</span>
              {remaining.slice(0, 12).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => jumpToPlaceholder(p)}
                  className="cursor-pointer rounded-sm bg-surface px-1.5 py-0.5 text-warning ring-1 ring-warning/30 hover:bg-warning-soft"
                >
                  {humanizePlaceholder(p)}
                </button>
              ))}
              {remaining.length > 12 ? <span className="text-muted">+{remaining.length - 12} more</span> : null}
            </div>
          ) : null}

          <div className={cn("grid grid-cols-1", mode === "split" && "lg:grid-cols-2 lg:divide-x lg:divide-border")}>
            {mode !== "preview" ? (
              <div className="min-w-0">
                <label htmlFor="draft-body" className="sr-only">
                  Draft text
                </label>
                <textarea
                  id="draft-body"
                  ref={textareaRef}
                  value={body}
                  readOnly={final}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={onEditorKey}
                  spellCheck
                  lang={language === "hi" ? "hi" : "en-IN"}
                  placeholder={"Type or paste your draft here.\n\n# IN THE COURT OF ...\n## VERSUS\n>> Advocate for the Applicant"}
                  className="block h-[62vh] min-h-80 w-full resize-y bg-surface px-4 py-4 font-sans text-[15px] leading-relaxed text-ink outline-none placeholder:text-muted/70 focus-visible:bg-surface sm:px-5"
                />
              </div>
            ) : null}
            {mode !== "edit" ? (
              <div className="h-[62vh] min-h-80 overflow-y-auto bg-bg/40 px-4 py-5 sm:px-8" aria-label="Formatted preview" role="region">
                <div className="mx-auto max-w-[46rem] rounded-md border border-border bg-surface px-5 py-6 shadow-sm sm:px-10 sm:py-10">
                  <DraftDocument body={deferredBody} language={language} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted sm:px-4">
            <span>
              {words.toLocaleString("en-IN")} words · {body.length.toLocaleString("en-IN")} characters
            </span>
            <details className="group">
              <summary className="cursor-pointer select-none text-primary hover:underline">Formatting help</summary>
              <div className="mt-2 grid max-w-md grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-2">
                <code># TEXT</code> <span>Centred bold title</span>
                <code>## TEXT</code> <span>Centred heading (VERSUS, PRAYER)</span>
                <code>### TEXT</code> <span>Bold side heading</span>
                <code>^^ TEXT</code> <span>Centred line</span>
                <code>&gt;&gt; TEXT</code> <span>Right-aligned line (signatures)</span>
                <code>**words**</code> <span>Bold</span>
                <code>---</code> <span>Blank line</span>
                <code>===</code> <span>Page break</span>
                <code>{"{{name}}"}</code> <span>Placeholder still to fill</span>
              </div>
            </details>
          </div>
        </Card>

        {/* Side panel */}
        <div className="grid min-w-0 grid-cols-1 content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden /> AI assist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!aiEnabled ? (
                <Alert tone="warning" title="AI drafting is not switched on">
                  An administrator needs to add an Anthropic or Google AI key to the server. Templates, editing, versions and exports work
                  without it.
                </Alert>
              ) : (
                <>
                  <div className="grid gap-2">
                    <AiButton icon={WandSparkles} label="Improve wording" running={aiRunning === "improve"} disabled={aiPending || final} onClick={() => runAi("improve")} />
                    <AiButton
                      icon={Languages}
                      label={language === "hi" ? "Translate to English" : "हिन्दी में अनुवाद करें"}
                      lang={language === "hi" ? undefined : "hi"}
                      running={aiRunning === "translate"}
                      disabled={aiPending || final}
                      onClick={() => runAi("translate")}
                    />
                    <AiButton icon={Sparkles} label="Expand from facts" running={aiRunning === "expand"} disabled={aiPending || final} onClick={() => setFactsOpen(true)} />
                    <AiButton icon={ListChecks} label="Check for missing clauses" running={aiRunning === "check"} disabled={aiPending} onClick={() => runAi("check")} />
                  </div>
                  {aiPending ? (
                    <p className="text-[13px] text-muted" aria-live="polite">
                      Working on it. Long drafts can take up to a minute.
                    </p>
                  ) : (
                    <p className="text-[13px] text-muted">Suggestions open as a preview. Nothing changes until you accept.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Field label="Matter" htmlFor="draft-matter" hint={matters.length === 0 ? "No matters yet. Create one under Matters to link it." : undefined}>
                <Select id="draft-matter" value={matterId} onChange={(e) => changeMatter(e.target.value)} disabled={busy}>
                  <option value="">No matter</option>
                  {matters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                      {m.status === "closed" ? " (closed)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
                <dt className="text-muted">Template</dt>
                <dd className="text-ink">
                  {template ? (
                    <Link href={`/templates/${template.slug}`} className="hover:text-primary hover:underline">
                      {template.title}
                    </Link>
                  ) : (
                    "Blank draft"
                  )}
                </dd>
                <dt className="text-muted">E-sign</dt>
                <dd className="text-ink">{esignAllowed ? "Allowed" : "Not available"}</dd>
              </dl>
              {!esignAllowed && template?.esignNote ? <p className="text-[13px] text-muted">{template.esignNote}</p> : null}
            </CardContent>
          </Card>

          <Card className="md:col-span-2 xl:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4 text-muted" aria-hidden /> Version history
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-[13px] text-muted">Every save is kept unchanged with its SHA-256 fingerprint. Restoring saves the old text as a new version.</p>
              <ol className="max-h-80 divide-y divide-border overflow-y-auto scrollbar-thin rounded-md border border-border">
                {versions.map((v) => (
                  <li key={v.version} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">
                        Version {v.version}
                        {v.version === latest ? <span className="ml-1.5 text-xs font-normal text-primary">current</span> : null}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {formatDateTime(v.createdAt)} · <span className="font-mono">{v.sha256.slice(0, 10)}</span>
                      </p>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => viewVersion(v.version)} disabled={busy} aria-label={`View version ${v.version}`}>
                      <Eye />
                    </Button>
                    {v.version !== latest ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => restore(v.version)}
                        disabled={busy || final || dirty}
                        aria-label={`Restore version ${v.version}`}
                        title={dirty ? "Save or discard your changes first" : final ? "Reopen the draft first" : "Restore as a new version"}
                      >
                        <RotateCcw />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Expand from facts */}
      <Dialog
        open={factsOpen}
        onClose={() => setFactsOpen(false)}
        title="Expand from facts"
        description="AI fills placeholders and drafts the factual paragraphs using only what you write here."
        className="w-[min(100%-2rem,40rem)]"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFactsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => runAi("expand", { facts })} disabled={aiPending || !facts.trim()}>
              {aiRunning === "expand" ? <Loader2 className="animate-spin" /> : <Sparkles />} Expand draft
            </Button>
          </>
        }
      >
        <Field label="Facts" htmlFor="ai-facts" hint="Names, dates, amounts and events in your own words. Nothing beyond these facts will be added.">
          <Textarea id="ai-facts" rows={8} value={facts} maxLength={20000} onChange={(e) => setFacts(e.target.value)} />
        </Field>
      </Dialog>

      {/* AI result */}
      <Dialog
        open={aiResult !== null}
        onClose={() => setAiResult(null)}
        title={aiResult ? aiTitle(aiResult.action) : ""}
        description={aiResult?.kind === "document" ? "Review the suggestion. Accept to place it in the editor; your saved versions are not changed." : "AI review of your draft."}
        className="w-[min(100%-2rem,56rem)]"
        footer={
          aiResult?.kind === "document" ? (
            <>
              <Button variant="ghost" onClick={() => setAiResult(null)}>
                Discard
              </Button>
              <Button onClick={acceptAi}>
                <CheckCircle2 /> Accept into editor
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  if (aiResult) void navigator.clipboard.writeText(aiResult.text).then(() => toast.success("Copied"));
                }}
              >
                <Copy /> Copy
              </Button>
              <Button onClick={() => setAiResult(null)}>Close</Button>
            </>
          )
        }
      >
        {aiResult ? (
          <div className="space-y-3">
            {aiResult.notes.map((n) => (
              <Alert key={n} tone="warning">
                {n}
              </Alert>
            ))}
            {aiResult.kind === "document" ? (
              <>
                <Segmented
                  label="Suggestion view"
                  size="sm"
                  value={aiView}
                  onChange={setAiView}
                  options={[
                    { value: "preview", label: "Formatted" },
                    { value: "text", label: "Text" },
                  ]}
                />
                {aiView === "preview" ? (
                  <div className="rounded-md border border-border bg-surface px-4 py-4 sm:px-8">
                    <DraftDocument body={aiResult.text} language={aiResult.language} />
                  </div>
                ) : (
                  <pre lang={aiResult.language === "hi" ? "hi" : undefined} className="rounded-md border border-border bg-surface-2 p-4 font-sans text-sm whitespace-pre-wrap text-ink">
                    {aiResult.text}
                  </pre>
                )}
              </>
            ) : (
              <Markdown>{aiResult.text}</Markdown>
            )}
            <p className="text-xs text-muted">AI suggestions can be wrong. Check every fact, section and citation before use. {site.disclaimer}</p>
          </div>
        ) : null}
      </Dialog>

      {/* Version viewer */}
      <Dialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `Version ${viewing.version}` : ""}
        description={viewing ? `Saved ${formatDateTime(viewing.createdAt)}` : undefined}
        className="w-[min(100%-2rem,52rem)]"
        footer={
          viewing && viewing.version !== latest ? (
            <>
              <Button variant="ghost" onClick={() => setViewing(null)}>
                Close
              </Button>
              <Button onClick={() => restore(viewing.version)} disabled={busy || final || dirty}>
                <RotateCcw /> Restore as new version
              </Button>
            </>
          ) : (
            <Button onClick={() => setViewing(null)}>Close</Button>
          )
        }
      >
        {viewing ? (
          <>
            <p className="mb-3 text-xs break-all text-muted">
              SHA-256 <span className="font-mono text-ink-2">{viewing.sha256}</span>
            </p>
            <div className="rounded-md border border-border bg-surface px-4 py-4 sm:px-8">
              <DraftDocument body={viewing.body} language={language} />
            </div>
          </>
        ) : null}
        {viewing && dirty && viewing.version !== latest ? (
          <p className="mt-3 text-sm text-warning">Save or discard your unsaved changes before restoring.</p>
        ) : null}
      </Dialog>

      {/* Delete */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this draft?"
        description="The draft and all its saved versions will be permanently removed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete draft
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          “{saved.title}” has {versions.length} saved version{versions.length === 1 ? "" : "s"}. This cannot be undone.
        </p>
      </Dialog>
    </div>
  );
}

function aiTitle(a: AiAction) {
  return { improve: "Improved wording", translate: "Translation", expand: "Expanded draft", check: "Missing clauses check" }[a];
}

function ToolButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      <Icon className="size-4" />
    </button>
  );
}

function AiButton({
  icon: Icon,
  label,
  running,
  disabled,
  onClick,
  lang,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  running: boolean;
  disabled: boolean;
  onClick: () => void;
  lang?: string;
}) {
  return (
    <Button variant="outline" className="justify-start" onClick={onClick} disabled={disabled}>
      {running ? <Loader2 className="animate-spin" /> : <Icon />}
      <span lang={lang}>{label}</span>
    </Button>
  );
}

function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
