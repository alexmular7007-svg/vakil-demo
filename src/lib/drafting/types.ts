// Shared drafting types. Safe for client and server (no server-only imports).

export type FieldType = "text" | "textarea" | "date" | "number" | "select";

export type FieldOption = {
  value: string;
  /** Text inserted into English drafts and shown in the form. */
  label: string;
  /** Text inserted into Hindi drafts (falls back to `label`). */
  hi?: string;
};

export type TemplateField = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: FieldOption[];
  help?: string;
  placeholder?: string;
  /** Wizard step this field belongs to. Fields without a group go to "Details". */
  group?: string;
  /** Inserted when an optional field is left empty (English draft). */
  fallback?: string;
  /** Inserted when an optional field is left empty (Hindi draft). */
  fallbackHi?: string;
  /** Pre-filled value in the wizard (the user can change it). */
  defaultValue?: string;
  /** Date fields: pre-fill with today's date in the wizard. */
  defaultToday?: boolean;
  min?: number;
  max?: number;
};

export const templateCategories = [
  "Notices",
  "Criminal",
  "Family",
  "Consumer",
  "Property",
  "Contracts",
  "Employment",
  "Affidavits",
  "RTI",
  "Wills & POA",
] as const;

export type TemplateCategory = (typeof templateCategories)[number];

export type DraftTemplate = {
  slug: string;
  title: string;
  titleHi: string;
  category: TemplateCategory;
  summary: string;
  /** Who usually files or sends it, and when. Shown on the public page. */
  useWhen: string;
  fields: TemplateField[];
  bodyEn: string;
  bodyHi?: string | null;
  lawRefs: string[];
  esignAllowed: boolean;
  /** Why e-sign is not available, shown instead of the "Send for signature" action. */
  esignNote?: string;
  /** Practical points to check before use (stamp duty, registration, local rules). */
  checks: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type DraftLanguage = "en" | "hi";

/** The light shape sent to client components (bodies stay on the server). */
export type TemplateSummary = Pick<
  DraftTemplate,
  "slug" | "title" | "titleHi" | "category" | "summary" | "fields" | "lawRefs" | "esignAllowed" | "reviewedBy"
> & { hasHindi: boolean };

export function toTemplateSummary(t: DraftTemplate, reviewedBy?: string | null): TemplateSummary {
  return {
    slug: t.slug,
    title: t.title,
    titleHi: t.titleHi,
    category: t.category,
    summary: t.summary,
    fields: t.fields,
    lawRefs: t.lawRefs,
    esignAllowed: t.esignAllowed,
    reviewedBy: reviewedBy === undefined ? t.reviewedBy : reviewedBy,
    hasHindi: Boolean(t.bodyHi),
  };
}

/** Wizard steps derived from field groups, in first-seen order. */
export function fieldGroups(fields: TemplateField[]): { name: string; fields: TemplateField[] }[] {
  const out: { name: string; fields: TemplateField[] }[] = [];
  for (const f of fields) {
    const name = f.group ?? "Details";
    let g = out.find((x) => x.name === name);
    if (!g) {
      g = { name, fields: [] };
      out.push(g);
    }
    g.fields.push(f);
  }
  return out;
}
