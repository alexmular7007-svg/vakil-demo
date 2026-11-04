import {
  BookOpenText,
  Bot,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  Contact,
  FilePen,
  FileSearch,
  House,
  Newspaper,
  ReceiptIndianRupee,
  Scale,
  Settings,
  ShieldCheck,
  Signature,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { TileTone } from "@/components/ui/display";

export type NavItem = { href: string; label: string; icon: LucideIcon; short?: string; tone: TileTone };
export type NavGroup = { label: string; items: NavItem[] };

export const home: NavItem = { href: "/app", label: "Home", icon: House, tone: "navy" };
export const askAi: NavItem = { href: "/app/chat", label: "Ask AI", icon: Sparkles, short: "Ask AI", tone: "gold" };
export const research: NavItem = { href: "/app/research", label: "Research", icon: BookOpenText, tone: "navy" };
export const updates: NavItem = { href: "/app/updates", label: "Legal updates", icon: Newspaper, short: "Updates", tone: "maroon" };
export const assistants: NavItem = { href: "/app/assistants", label: "My assistants", icon: Bot, short: "Assistants", tone: "slate" };
export const drafting: NavItem = { href: "/app/drafts", label: "Drafting", icon: FilePen, short: "Drafts", tone: "teal" };
export const documents: NavItem = { href: "/app/documents", label: "Documents", icon: FileSearch, short: "Docs", tone: "slate" };
export const esign: NavItem = { href: "/app/sign", label: "E-Sign", icon: Signature, short: "Sign", tone: "maroon" };
export const diary: NavItem = { href: "/app/diary", label: "Case diary", icon: CalendarDays, short: "Diary", tone: "green" };
export const matters: NavItem = { href: "/app/matters", label: "Matters", icon: Briefcase, tone: "navy" };
export const clients: NavItem = { href: "/app/clients", label: "Clients", icon: Contact, tone: "teal" };
export const fees: NavItem = { href: "/app/fees", label: "Fee book", icon: ReceiptIndianRupee, short: "Fees", tone: "gold" };
export const tools: NavItem = { href: "/app/tools", label: "Calculators", icon: Calculator, short: "Tools", tone: "maroon" };
export const advocates: NavItem = { href: "/app/advocates", label: "Advocates", icon: Scale, tone: "navy" };
export const companies: NavItem = { href: "/app/companies", label: "Companies", icon: Building2, tone: "slate" };
export const settings: NavItem = { href: "/app/settings", label: "Settings", icon: Settings, tone: "slate" };
export const adminNav: NavItem = { href: "/admin", label: "Admin", icon: ShieldCheck, tone: "maroon" };

export const navGroups: NavGroup[] = [
  { label: "", items: [home] },
  { label: "AI & research", items: [askAi, research, updates, assistants] },
  { label: "Drafting & signing", items: [drafting, documents, esign] },
  { label: "Practice", items: [diary, matters, clients, fees, tools] },
  { label: "Network", items: [advocates, companies] },
];

/** Every destination, for the phone "All services" sheet and the search palette. */
export const allNav: NavItem[] = navGroups.flatMap((g) => g.items).concat(settings);

// Bottom tab bar on phones: two tabs, the raised Ask AI button, one tab, More.
export const mobileTabsLeft: NavItem[] = [home, diary];
export const mobileTabsRight: NavItem[] = [drafting];

export function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}
