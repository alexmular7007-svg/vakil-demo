// Outbound links from a hearing: official eCourts search, Google Calendar and
// WhatsApp share. Plain links only: no scraping, no APIs, nothing sent by us.
import { addDays, isHhmm } from "./dates";
import { hearingDescription, hearingLocation, hearingSummary, whatsappMessage } from "./format";

/** Official eCourts Services portal (eCommittee, Supreme Court of India; hosted by NIC).
 *  Its home page is the "Search by CNR number" form for district and taluka courts. */
export const ECOURTS_CNR_URL = "https://services.ecourts.gov.in/ecourtindia_v6/?p=home/index";
/** Official eCourts High Court services portal (has its own CNR search). */
export const ECOURTS_HC_URL = "https://hcservices.ecourts.gov.in/";

/** Strips spaces and hyphens and upper-cases a CNR as typed. */
export function normaliseCnr(s: string): string {
  return s.replace(/[\s-]/g, "").toUpperCase();
}

/** A CNR (Case Number Record) is 16 letters and digits, e.g. DLCT010012342024. */
export function isCnr(s: string | null | undefined): boolean {
  return typeof s === "string" && /^[A-Z0-9]{16}$/.test(s);
}

/** High Court CNRs carry "HC" in the establishment code (e.g. DLHC01…, HCBM01…). */
export function isHighCourtCase(cnr: string | null | undefined, court?: string | null): boolean {
  if (court && /high\s*court/i.test(court)) return true;
  return typeof cnr === "string" && /^(HC[A-Z]{2}|[A-Z]{2}HC)/.test(cnr);
}

/** The official eCourts page where this CNR can be searched (the user pastes it and fills the captcha). */
export function ecourtsUrl(cnr: string | null | undefined, court?: string | null): string {
  return isHighCourtCase(cnr, court) ? ECOURTS_HC_URL : ECOURTS_CNR_URL;
}

type CalendarHearing = {
  caseTitle: string;
  court: string | null;
  bench: string | null;
  itemNo: string | null;
  hearingTime: string | null;
  hearingDate: string;
  purpose: string | null;
  caseNo: string | null;
  cnr: string | null;
};

const compactDate = (ymd: string) => ymd.replaceAll("-", "");

/** Local wall-clock start/end ("20261104T103000") for a timed hearing, one hour long. */
export function timedRange(ymd: string, hhmm: string, minutes = 60): { start: string; end: string } {
  const [h, m] = hhmm.split(":").map(Number);
  const startMin = h * 60 + m;
  const endMin = startMin + minutes;
  const endDate = addDays(ymd, Math.floor(endMin / 1440));
  const fmt = (total: number) => {
    const t = ((total % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, "0")}${String(t % 60).padStart(2, "0")}00`;
  };
  return { start: `${compactDate(ymd)}T${fmt(startMin)}`, end: `${compactDate(endDate)}T${fmt(endMin)}` };
}

/** "Add to Google Calendar" template link. Times are IST wall-clock; untimed hearings are all-day. */
export function googleCalendarUrl(h: CalendarHearing): string {
  const dates = isHhmm(h.hearingTime)
    ? (({ start, end }) => `${start}/${end}`)(timedRange(h.hearingDate, h.hearingTime))
    : `${compactDate(h.hearingDate)}/${compactDate(addDays(h.hearingDate, 1))}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: hearingSummary(h),
    dates,
    ctz: "Asia/Kolkata",
    details: hearingDescription(h),
  });
  const location = hearingLocation(h);
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** WhatsApp share link with a prefilled message; the user picks the contact. */
export function whatsappUrl(h: CalendarHearing): string {
  return `https://wa.me/?text=${encodeURIComponent(whatsappMessage(h))}`;
}
