import Link from "next/link";
import { ArrowLeftRight, Gavel, Library, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ResearchTab = "search" | "case" | "convert" | "browse";

const TABS: { value: ResearchTab; label: string; short: string; icon: typeof Search }[] = [
  { value: "search", label: "Search bare acts", short: "Search", icon: Search },
  { value: "case", label: "Case law", short: "Cases", icon: Gavel },
  { value: "convert", label: "Convert old ↔ new", short: "Convert", icon: ArrowLeftRight },
  { value: "browse", label: "Browse acts", short: "Browse", icon: Library },
];

/** Tab bar driven by ?tab=, so every view has a shareable URL and works without JavaScript. */
export function ResearchTabs({ active }: { active: ResearchTab }) {
  return (
    <nav aria-label="Research views" className="-mx-4 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0">
      <ul className="inline-flex min-w-full gap-1 rounded-lg bg-surface-2 p-1 sm:min-w-0">
        {TABS.map((t) => (
          <li key={t.value} className="flex-1 sm:flex-none">
            <Link
              href={`/app/research?tab=${t.value}`}
              aria-current={active === t.value ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-md px-2.5 sm:min-h-10 sm:px-3 text-sm font-medium whitespace-nowrap transition-colors",
                active === t.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              <t.icon className="size-4 max-sm:hidden" aria-hidden />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.short}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
