"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export type PublicTemplateCard = {
  slug: string;
  title: string;
  titleHi: string;
  category: string;
  summary: string;
  lawRefs: string[];
  hasHindi: boolean;
};

/** Search and category filter over the static template list (all cards are in the HTML for crawlers). */
export function PublicTemplateBrowser({ templates, categories }: { templates: PublicTemplateCard[]; categories: string[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter(
      (t) =>
        (category === "All" || t.category === category) &&
        (!q || [t.title, t.titleHi, t.summary, t.category, ...t.lawRefs].some((s) => s.toLowerCase().includes(q))),
    );
  }, [templates, query, category]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="public-tpl-search" className="sr-only">
            Search templates
          </label>
          <Input
            id="public-tpl-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. bail, rent, 138"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {["All", ...categories].map((c) => (
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
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/templates/${t.slug}`}
              className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
            >
              <span className="flex flex-wrap gap-1.5">
                <Badge tone="primary">{t.category}</Badge>
                {t.hasHindi ? (
                  <Badge tone="accent" lang="hi">
                    हिन्दी
                  </Badge>
                ) : null}
              </span>
              <span>
                <span className="block font-serif text-lg leading-snug font-semibold text-ink group-hover:text-primary">{t.title}</span>
                <span lang="hi" className="mt-0.5 block text-sm text-muted">
                  {t.titleHi}
                </span>
              </span>
              <span className="line-clamp-3 text-sm text-ink-2">{t.summary}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                View format <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {visible.length === 0 ? <p className="py-10 text-center text-sm text-muted">No templates match your search.</p> : null}
    </div>
  );
}
