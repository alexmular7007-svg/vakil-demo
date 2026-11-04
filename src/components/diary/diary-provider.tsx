"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { blankDraft } from "@/lib/diary/drafts";
import type { HearingDraft, HearingItem, MatterOption } from "@/lib/diary/types";
import { HearingDetailDialog, type DetailMode } from "./hearing-detail";
import { HearingFormDialog, type AiNote, type FormState } from "./hearing-form";

type DiaryApi = {
  today: string;
  /** Opens the hearing sheet (details and actions, or straight to "record outcome"). */
  openHearing: (h: HearingItem, mode?: DetailMode) => void;
  /** Opens the add-hearing form, optionally prefilled. */
  newHearing: (prefill?: Partial<HearingDraft>, ai?: AiNote) => void;
  editHearing: (h: HearingItem) => void;
  /** Call after a write: refreshes server data (and on the diary page, jumps to `date`). */
  afterSave: (date?: string | null) => void;
  matters: MatterOption[];
};

const DiaryContext = createContext<DiaryApi | null>(null);

export function useDiary(): DiaryApi {
  const ctx = useContext(DiaryContext);
  if (!ctx) throw new Error("useDiary must be used inside <DiaryProvider>");
  return ctx;
}

/**
 * Owns the diary's dialogs (hearing sheet and hearing form) so every list on a
 * screen can open them. On /app/diary it also reacts to ?new=1 (the global
 * "New" menu) and ?hearing=<id> (notifications).
 */
export function DiaryProvider({
  children,
  today,
  defaultDate,
  matters,
  fixedMatter,
  selectedDate,
  jumpToDate = false,
  focus = null,
  watchUrl = false,
}: {
  children: React.ReactNode;
  today: string;
  /** Date prefilled on a new hearing. */
  defaultDate: string;
  matters: MatterOption[];
  /** Matter page: new hearings belong to this matter. */
  fixedMatter?: MatterOption;
  selectedDate?: string;
  jumpToDate?: boolean;
  focus?: HearingItem | null;
  watchUrl?: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<{ hearing: HearingItem; mode: DetailMode } | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const openCount = useRef(0);

  const openHearing = useCallback((hearing: HearingItem, mode: DetailMode = "view") => {
    setForm(null);
    setDetail({ hearing, mode });
  }, []);

  const newHearing = useCallback(
    (prefill?: Partial<HearingDraft>, ai?: AiNote) => {
      setDetail(null);
      openCount.current += 1;
      const base = fixedMatter ? { matterId: fixedMatter.id } : {};
      setForm({ key: openCount.current, mode: "new", draft: blankDraft(defaultDate, { ...base, ...prefill }), ai });
    },
    [defaultDate, fixedMatter],
  );

  const editHearing = useCallback((hearing: HearingItem) => {
    setDetail(null);
    openCount.current += 1;
    setForm({ key: openCount.current, mode: "edit", hearing });
  }, []);

  const afterSave = useCallback(
    (date?: string | null) => {
      if (jumpToDate && date && date !== selectedDate) router.push(`/app/diary?date=${date}`, { scroll: false });
      else router.refresh();
    },
    [jumpToDate, selectedDate, router],
  );

  const api = useMemo<DiaryApi>(
    () => ({ today, openHearing, newHearing, editHearing, afterSave, matters }),
    [today, openHearing, newHearing, editHearing, afterSave, matters],
  );

  return (
    <DiaryContext.Provider value={api}>
      {children}
      {watchUrl ? (
        <Suspense fallback={null}>
          <UrlIntents focus={focus} onNew={() => newHearing()} onFocus={(h) => openHearing(h)} />
        </Suspense>
      ) : null}
      <HearingDetailDialog
        state={detail}
        today={today}
        onClose={() => setDetail(null)}
        onMode={(mode) => setDetail((d) => (d ? { ...d, mode } : d))}
        onEdit={editHearing}
        afterSave={afterSave}
      />
      <HearingFormDialog state={form} matters={matters} fixedMatter={fixedMatter} onClose={() => setForm(null)} afterSave={afterSave} />
    </DiaryContext.Provider>
  );
}

/** Opens dialogs requested through the URL, then removes the parameter so a refresh does not reopen them. */
function UrlIntents({ focus, onNew, onFocus }: { focus: HearingItem | null; onNew: () => void; onFocus: (h: HearingItem) => void }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const wantsNew = params.get("new") === "1";
  const hearingId = params.get("hearing");

  useEffect(() => {
    if (!wantsNew && !hearingId) return;
    if (wantsNew) onNew();
    else if (focus && focus.id === hearingId) onFocus(focus);
    const next = new URLSearchParams(params.toString());
    next.delete("new");
    next.delete("hearing");
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    // Runs once per URL intent; the callbacks are stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew, hearingId, focus?.id]);

  return null;
}
