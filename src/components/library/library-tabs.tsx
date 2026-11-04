import Link from "next/link";
import { BookOpenText, Gavel, History } from "lucide-react";
import { cn } from "@/lib/utils";

export type LibraryTab = "judgments" | "acts" | "history";

const TABS: { value: LibraryTab; label: string; icon: typeof Gavel }[] = [
  { value: "judgments", label: "Judgments", icon: Gavel },
  { value: "acts", label: "Acts", icon: BookOpenText },
  { value: "history", label: "History", icon: History },
];

/** Segmented tabs driven by ?tab=, so each view has its own URL and works without JavaScript. */
export function LibraryTabs({ active }: { active: LibraryTab }) {
  return (
    <nav aria-label="Law library views">
      <ul className="grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1 sm:inline-grid">
        {TABS.map((t) => (
          <li key={t.value}>
            <Link
              href={`/admin/library?tab=${t.value}`}
              aria-current={active === t.value ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors sm:min-h-10",
                active === t.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              <t.icon className="size-4" aria-hidden />
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
