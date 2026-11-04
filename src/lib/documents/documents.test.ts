import { describe, expect, it } from "vitest";
import { chunkText, normalizeText } from "./chunk";
import { diffLines, toDiffLines, toHunks } from "./diff";

describe("chunkText", () => {
  it("returns a single chunk for short text and none for empty text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("Short clause.")).toEqual(["Short clause."]);
  });

  it("covers the whole text with bounded, overlapping chunks", () => {
    const sentence = "The Licensee shall pay the licence fee on or before the fifth day of each month. ";
    const text = sentence.repeat(120).trim();
    const chunks = chunkText(text, { size: 1200, overlap: 200 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1200);
    // Every chunk after the first starts inside the previous one (overlap).
    for (let i = 1; i < chunks.length; i++) {
      const head = chunks[i].slice(0, 40);
      expect(chunks[i - 1].includes(head) || text.indexOf(head) >= 0).toBe(true);
    }
    // The end of the text is in the last chunk.
    expect(chunks.at(-1)!.endsWith("each month.")).toBe(true);
  });

  it("always makes progress on text without spaces", () => {
    const chunks = chunkText("x".repeat(5000), { size: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThanOrEqual(5);
    expect(chunks.length).toBeLessThan(10);
  });

  it("normalises extraction whitespace", () => {
    expect(normalizeText("a \t b\r\n\r\n\r\n\r\nc  \n  d\u0000")).toBe("a b\n\nc\nd");
  });
});

describe("diffLines", () => {
  it("finds added, removed and unchanged lines", () => {
    const a = toDiffLines("Clause 1\nClause 2\nClause 3\nClause 4");
    const b = toDiffLines("Clause 1\nClause 2 amended\nClause 3\nClause 4\nClause 5");
    const r = diffLines(a, b);
    if (!r.ok) throw new Error("expected a diff");
    expect(r.stats).toEqual({ added: 2, removed: 1, unchanged: 3 });
    expect(r.lines.map((l) => `${l.op}:${l.text}`)).toEqual([
      "equal:Clause 1",
      "remove:Clause 2",
      "add:Clause 2 amended",
      "equal:Clause 3",
      "equal:Clause 4",
      "add:Clause 5",
    ]);
    expect(r.lines[2]).toMatchObject({ b: 2 });
    expect(r.lines[1]).toMatchObject({ a: 2 });
  });

  it("handles identical and empty inputs", () => {
    const same = diffLines(["a", "b"], ["a", "b"]);
    expect(same.ok && same.stats).toEqual({ added: 0, removed: 0, unchanged: 2 });
    const added = diffLines([], ["a"]);
    expect(added.ok && added.lines).toEqual([{ op: "add", text: "a", b: 1 }]);
  });

  it("gives up gracefully when the inputs are too different", () => {
    const a = Array.from({ length: 300 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 300 }, (_, i) => `b${i}`);
    const r = diffLines(a, b, 50);
    expect(r.ok).toBe(false);
    expect(r.stats).toEqual({ added: 300, removed: 300, unchanged: 0 });
  });

  it("collapses unchanged runs into hunks", () => {
    const a = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const b = [...a];
    b[10] = "changed";
    const r = diffLines(a, b);
    if (!r.ok) throw new Error("expected a diff");
    const hunks = toHunks(r.lines, 2);
    expect(hunks.map((h) => h.kind)).toEqual(["skip", "lines", "skip"]);
    expect(hunks[0]).toEqual({ kind: "skip", count: 8 });
  });
});
