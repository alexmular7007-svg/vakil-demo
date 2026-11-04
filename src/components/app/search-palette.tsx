"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, Briefcase, CornerDownLeft, FilePen, FileSearch, Loader2, MessageSquareText, Search } from "lucide-react";
import { IconTile } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import { allNav } from "./nav";

type Hit = { group: string; title: string; detail: string; href: string };
type Row = Hit & { icon: React.ComponentType<{ className?: string }> };

const groupIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Matters: Briefcase,
  Drafts: FilePen,
  Documents: FileSearch,
  Conversations: MessageSquareText,
  "Bare acts": BookOpenText,
};

/** Ctrl K palette: jump to any screen, or search the user's records and the bare acts. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Palette onClose={onClose} />;
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { hits?: Hit[] };
        setHits(data.hits ?? []);
        setCursor(0);
      } catch {
        /* aborted or offline: keep the previous results */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const screens = allNav
      .filter((n) => !term || n.label.toLowerCase().includes(term))
      .slice(0, term ? 4 : 8)
      .map((n) => ({ group: "Go to", title: n.label, detail: "Screen", href: n.href, icon: n.icon }));
    const found = term.length >= 2 ? hits.map((h) => ({ ...h, icon: groupIcons[h.group] ?? Search })) : [];
    return [...screens, ...found];
  }, [q, hits]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && rows[cursor]) {
      e.preventDefault();
      go(rows[cursor].href);
    }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 animate-fade-in bg-brand/50 backdrop-blur-[3px]" onClick={onClose} />
      <div
        className="absolute inset-0 flex animate-slide-up flex-col bg-surface md:glass md:inset-x-auto md:top-[10vh] md:bottom-auto md:left-1/2 md:max-h-[72vh] md:w-[640px] md:-translate-x-1/2 md:rounded-xl md:shadow-lg"
        onKeyDown={onKeyDown}
      >
        <div className="safe-top flex items-center gap-2 border-b border-border px-3 md:px-4">
          <button type="button" onClick={onClose} className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-ink-2 md:hidden" aria-label="Close search">
            <ArrowLeft className="size-5" />
          </button>
          <Search className="hidden size-5 text-muted md:block" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search matters, drafts, documents, BNS 103…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={rows[cursor] ? `sr-${cursor}` : undefined}
          />
          {loading ? <Loader2 className="size-4 animate-spin text-muted" /> : null}
          <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted md:block">Esc</kbd>
        </div>
        <ul id="search-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {rows.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <li key={`${r.group}-${r.href}-${i}`} role="presentation">
                {header ? <p className="px-3 pt-3 pb-1.5 text-[11px] font-bold tracking-[0.12em] text-muted uppercase">{header}</p> : null}
                <button
                  id={`sr-${i}`}
                  role="option"
                  aria-selected={i === cursor}
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r.href)}
                  className={cn("flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left", i === cursor ? "bg-primary-soft" : "hover:bg-surface-2")}
                >
                  <IconTile icon={r.icon} tone={r.group === "Go to" ? "slate" : "navy"} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                    <span className="block truncate text-xs text-muted">{r.detail}</span>
                  </span>
                  {i === cursor ? <CornerDownLeft className="hidden size-4 text-muted md:block" /> : null}
                </button>
              </li>
            );
          })}
          {q.trim().length >= 2 && !loading && hits.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted">Nothing found for “{q.trim()}”.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
