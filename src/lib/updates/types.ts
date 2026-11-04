// Shared types for the legal-updates module. Safe for client and server.

import { UPDATE_IMPORTANCE, UPDATE_KINDS } from "@/lib/db/schema/enums";

// Allowed values live in the schema (enforced by CHECK constraints in the database).
export { UPDATE_KINDS };
export type UpdateKind = (typeof UPDATE_KINDS)[number];

/** high = pop-up and bell; normal = list only; hidden = removed by an admin. */
export const IMPORTANCE = UPDATE_IMPORTANCE;
export type Importance = (typeof IMPORTANCE)[number];

/** One entry found at a source, before classification and storage. */
export type RawEntry = {
  title: string;
  url: string;
  /** Plain text, already clipped to at most 200 characters. */
  summary: string | null;
  publishedAt: Date | null;
  /** Source-provided categories or labels (feed <category>, bill status…). */
  categories: string[];
  /** A kind the parser knows for certain (e.g. a bill record); otherwise the source default applies. */
  kind?: UpdateKind;
  /** Corpus act ids the source knows the entry is about (India Code amendments). */
  acts?: string[];
};

/** A classified entry, ready to insert into corpus.legal_updates. */
export type UpdateCandidate = {
  sourceKey: string;
  sourceName: string;
  kind: UpdateKind;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: Date | null;
  importance: Exclude<Importance, "hidden">;
  acts: string[];
  tags: string[];
};

/** Acts the classifier should recognise (the corpus, from the database). */
export type KnownAct = { id: string; shortTitle: string; tracked: boolean };

/** Tag on items stored by a source's first run (its recent history, not news): never a pop-up. */
export const INITIAL_IMPORT_TAG = "initial-import";

/** Tag on India Code amendments that changed the bare-act text in the corpus. */
export const CORPUS_UPDATED_TAG = "corpus-updated";

/** What /api/updates/unseen returns for the pop-up. */
export type UnseenUpdate = {
  id: string;
  title: string;
  sourceName: string;
  kind: string;
  kindLabel: string;
  url: string;
  /** Internal page to open instead of the source (amendments that changed a bare act). */
  href: string | null;
  at: string;
};
