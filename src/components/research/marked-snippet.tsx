// Renders a ts_headline snippet whose matches are wrapped in ⟪ ⟫ (see search.ts).
export function MarkedSnippet({ text }: { text: string }) {
  const parts = text.split(/(⟪[^⟫]*⟫)/);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("⟪") ? (
          <mark key={i} className="rounded-sm bg-accent-soft px-0.5 font-medium text-ink">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
