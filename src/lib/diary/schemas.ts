// Zod schemas for diary server actions. Field names match the form inputs so
// errors map straight back onto fields.
import { z } from "zod";
import { isHhmm, isYmd } from "./dates";
import { isCnr, normaliseCnr } from "./links";

const optText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be under ${max} characters`)
    .nullish()
    .transform((v) => v || null);

const optDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || isYmd(v), "Use a valid date");

const optTime = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || isHhmm(v), "Use a valid time");

const optUuid = (message: string) =>
  z
    .union([z.uuid({ message }), z.literal("")])
    .nullish()
    .transform((v) => v || null);

export const HearingInput = z.object({
  matterId: optUuid("Pick a valid matter"),
  caseTitle: z.string().trim().min(2, "Enter the case title").max(200, "Keep the title under 200 characters"),
  court: optText(200, "Court"),
  bench: optText(120, "Bench / court hall"),
  caseNo: optText(120, "Case number"),
  cnr: z
    .string()
    .nullish()
    .transform((v) => (v ? normaliseCnr(v) : null))
    .refine((v) => v === null || isCnr(v), "A CNR has 16 letters and digits, e.g. DLCT010012342024"),
  itemNo: optText(20, "Item number"),
  hearingDate: z.string().trim().refine(isYmd, "Pick the hearing date"),
  hearingTime: optTime,
  purpose: optText(120, "Purpose"),
  notes: optText(2000, "Notes"),
});
export type HearingInputValues = z.input<typeof HearingInput>;

export const OutcomeInput = z.object({
  id: z.uuid({ message: "Invalid hearing" }),
  status: z.enum(["done", "adjourned", "cancelled"], { message: "Choose what happened" }),
  outcome: optText(2000, "Outcome"),
  nextDate: optDate,
  nextTime: optTime,
  nextPurpose: optText(120, "Purpose"),
});
export type OutcomeInputValues = z.input<typeof OutcomeInput>;

export const TaskInput = z.object({
  title: z.string().trim().min(2, "Describe the task").max(300, "Keep the task under 300 characters"),
  dueDate: optDate,
  matterId: optUuid("Pick a valid matter"),
});
export type TaskInputValues = z.input<typeof TaskInput>;

export const OrderInput = z
  .object({
    text: z.string().max(200_000, "That order is too long. Paste only the relevant page.").nullish(),
    documentId: optUuid("Pick a valid document"),
  })
  .refine((v) => Boolean(v.documentId) || (v.text ?? "").trim().length >= 40, {
    message: "Paste the order text (at least a few lines) or pick a document",
    path: ["text"],
  });
export type OrderInputValues = z.input<typeof OrderInput>;
