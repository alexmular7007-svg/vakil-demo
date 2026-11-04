import { CalendarClock, CalendarRange, Hourglass, IndianRupee, type LucideIcon } from "lucide-react";
import type { TileTone } from "@/components/ui/display";

export type CalculatorSlug = "limitation" | "cheque-bounce" | "interest" | "days";

export type CalculatorInfo = {
  slug: CalculatorSlug;
  title: string;
  body: string;
  icon: LucideIcon;
  tone: TileTone;
  /** Free public page, if there is one. */
  publicPath?: string;
};

export const CALCULATORS: CalculatorInfo[] = [
  {
    slug: "limitation",
    title: "Limitation",
    body: "Last day for a suit, appeal or application, with s. 4 and s. 12 applied",
    icon: Hourglass,
    tone: "maroon",
    publicPath: "/tools/limitation-calculator",
  },
  {
    slug: "cheque-bounce",
    title: "Cheque bounce (s. 138)",
    body: "Presentation, notice, 15 days to pay and the one-month complaint deadline",
    icon: CalendarClock,
    tone: "navy",
    publicPath: "/tools/cheque-bounce-timeline",
  },
  {
    slug: "interest",
    title: "Interest",
    body: "Simple or compound interest between two dates, with a breakdown",
    icon: IndianRupee,
    tone: "gold",
  },
  {
    slug: "days",
    title: "Days and dates",
    body: "Days between dates, or a date plus or minus days, months or years",
    icon: CalendarRange,
    tone: "teal",
  },
];

export function calculatorInfo(slug: CalculatorSlug): CalculatorInfo {
  return CALCULATORS.find((c) => c.slug === slug)!;
}

export const appToolHref = (slug: CalculatorSlug) => `/app/tools/${slug}`;
