import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);
}

// Always format in IST so server-rendered and browser-rendered dates match.
/** Short Indian amount for tight spaces: ₹45,000 · ₹1.2L · ₹3.5Cr. */
export function formatINRCompact(paise: number) {
  const rupees = paise / 100;
  const short = (n: number) => n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, "");
  if (Math.abs(rupees) >= 1e7) return `₹${short(rupees / 1e7)}Cr`;
  if (Math.abs(rupees) >= 1e5) return `₹${short(rupees / 1e5)}L`;
  return formatINR(paise);
}

export function formatDate(d: Date | string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...(opts ?? { day: "numeric", month: "short", year: "numeric" }) }).format(
    typeof d === "string" ? new Date(d) : d,
  );
}

export function formatDateTime(d: Date | string | null | undefined) {
  return formatDate(d, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "asha.verma@gmail.com" -> "a***a@gmail.com": enough to spot patterns, not to identify. */
export function maskEmail(email: string) {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : "";
  return `${head}***${tail}@${domain}`;
}
