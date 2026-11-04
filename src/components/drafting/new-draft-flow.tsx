"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Languages, Loader2, Search, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { createBlankDraft } from "@/app/app/drafts/actions";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import type { MatterOption } from "@/lib/drafting/queries";
import { templateCategories, type DraftLanguage, type TemplateSummary } from "@/lib/drafting/types";
import { cn } from "@/lib/utils";
import { IntakeWizard } from "./intake-wizard";
import { ReviewBadge } from "./review-badge";
import { Segmented } from "./segmented";

export function NewDraftFlow({
  templates,
  initialSlug,
  matters,
  today,
  defaultLanguage,
}: {
  templates: TemplateSummary[];
  initialSlug: string | null;
  matters: MatterOption[];
  today: string;
  defaultLanguage: DraftLanguage;
}) {
  const [selected, setSelected] = useState<string | null>(initialSlug);
  const [language, setLanguage] = useState<DraftLanguage>(defaultLanguage);
  const template = templates.find((t) => t.slug === selected) ?? null;

  function select(slug: string | null) {
    setSelected(slug);
    // Keep ?template= in the address bar so a refresh or shared link reopens it.
    const url = slug ? `/app/drafts/new?template=${encodeURIComponent(slug)}` : "/app/drafts/new";
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (template) {
    return (
      <IntakeWizard
        key={template.slug}
        template={template}
        initialLanguage={language === "hi" && template.hasHindi ? "hi" : "en"}
        matters={matters}
        today={today}
        onBack={() => select(null)}
      />
    );
  }
  return (
    <TemplateGallery templates={templates} language={language} onLanguage={setLanguage} onSelect={select} matters={matters} />
  );
}

function TemplateGallery({
  templates,
  language,
  onLanguage,
  onSelect,
  matters,
}: {
  templates: TemplateSummary[];
  language: DraftLanguage;
  onLanguage: (l: DraftLanguage) => void;
  onSelect: (slug: string) => void;
  matters: MatterOption[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [blankOpen, setBlankOpen] = useState(false);

  const categories = useMemo(() => ["All", ...templateCategories.filter((c) => templates.some((t) => t.category === c))], [templates]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!q) return true;
      return [t.title, t.titleHi, t.summary, t.category, ...t.lawRefs].some((s) => s.toLowerCase().includes(q));
    });
  }, [templates, query, category]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="tpl-search" className="sr-only">
            Search templates
          </label>
          <Input
            id="tpl-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates, e.g. bail, notice, 138"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Languages className="size-4 text-muted" aria-hidden />
          <Segmented
            label="Draft language"
            value={language}
            onChange={onLanguage}
            options={[
              { value: "en", label: "English" },
              { value: "hi", label: "हिन्दी", lang: "hi" },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "h-9 cursor-pointer rounded-full border px-3.5 text-sm font-medium transition-colors",
              category === c ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {language === "hi" ? (
        <Alert tone="info">
          Templates marked <span lang="hi">हिन्दी</span> have a Hindi version. Others open in English; with AI switched on you can translate the draft
          in the editor.
        </Alert>
      ) : null}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <li>
          <button
            type="button"
            onClick={() => setBlankOpen(true)}
            className="flex h-full min-h-44 w-full cursor-pointer flex-col items-start gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-5 text-left transition-colors hover:border-primary hover:bg-primary-soft/40"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <FilePlus2 className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-medium text-ink">Blank draft</span>
              <span className="mt-1 block text-sm text-muted">Start from an empty page and write or paste your own text.</span>
            </span>
          </button>
        </li>
        {visible.map((t) => (
          <li key={t.slug}>
            <button
              type="button"
              onClick={() => onSelect(t.slug)}
              className="group flex h-full min-h-44 w-full min-w-0 cursor-pointer flex-col gap-3 rounded-lg border border-border bg-surface p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone="primary">{t.category}</Badge>
                {t.hasHindi ? (
                  <Badge tone="accent" lang="hi">
                    हिन्दी
                  </Badge>
                ) : language === "hi" ? (
                  <Badge tone="outline">English only</Badge>
                ) : null}
                {!t.esignAllowed ? (
                  <Badge tone="neutral" title="Cannot be e-signed">
                    <ShieldOff aria-hidden /> No e-sign
                  </Badge>
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-ink group-hover:text-primary">
                  {language === "hi" ? <span lang="hi">{t.titleHi}</span> : t.title}
                </span>
                <span className="mt-1 line-clamp-3 block text-sm text-muted">{t.summary}</span>
              </span>
              <span className="mt-auto flex min-w-0 flex-col gap-2">
                {t.lawRefs.length ? <span className="block truncate text-xs text-ink-2">{t.lawRefs.slice(0, 2).join(" · ")}</span> : null}
                <ReviewBadge reviewedBy={t.reviewedBy} className="w-fit" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {visible.length === 0 ? <p className="py-8 text-center text-sm text-muted">No templates match “{query}”. Try another word or start a blank draft.</p> : null}

      <BlankDraftDialog open={blankOpen} onClose={() => setBlankOpen(false)} matters={matters} defaultLanguage={language} />
    </div>
  );
}

function BlankDraftDialog({
  open,
  onClose,
  matters,
  defaultLanguage,
}: {
  open: boolean;
  onClose: () => void;
  matters: MatterOption[];
  defaultLanguage: DraftLanguage;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<DraftLanguage>(defaultLanguage);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const matterId = String(fd.get("matterId") ?? "") || null;
    if (!title) {
      setError("Give the draft a title.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await createBlankDraft({ title, language: lang, matterId });
      if (!res.ok) {
        setError(res.fieldErrors?.title ?? res.error);
        return;
      }
      toast.success("Blank draft created");
      router.push(`/app/drafts/${res.data.id}`);
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Blank draft" description="Start with an empty page. You can paste or type any text.">
      <form id="blank-draft-form" onSubmit={submit} className="grid gap-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Title" htmlFor="blank-title" required>
          <Input id="blank-title" name="title" maxLength={200} required autoFocus placeholder="e.g. Written statement, Civil Suit 120/2026" />
        </Field>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium text-ink">Language</span>
          <Segmented
            label="Language"
            value={lang}
            onChange={setLang}
            options={[
              { value: "en", label: "English" },
              { value: "hi", label: "हिन्दी", lang: "hi" },
            ]}
            className="w-fit"
          />
        </div>
        <Field label="Matter (optional)" htmlFor="blank-matter">
          <Select id="blank-matter" name="matterId" defaultValue="">
            <option value="">No matter</option>
            {matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
                {m.status === "closed" ? " (closed)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null} Create draft
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
