// Deterministic line diff (Myers' O(ND) algorithm). Works without AI.
// Pure functions, safe for client and server.

export type DiffOp = "equal" | "add" | "remove";
export type DiffLine = { op: DiffOp; text: string; a?: number; b?: number };
export type DiffStats = { added: number; removed: number; unchanged: number };

export type DiffResult =
  | { ok: true; lines: DiffLine[]; stats: DiffStats }
  | { ok: false; reason: "too-different"; stats: DiffStats };

/** Lines compared after collapsing whitespace; blank lines are ignored. */
export function toDiffLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Diff two arrays of lines. `maxEdits` bounds the work: past it, the inputs are
 * reported as too different for a line-by-line view (with set-based counts).
 */
export function diffLines(a: string[], b: string[], maxEdits = 2500): DiffResult {
  // Trim the common prefix and suffix first; most revisions differ in a few places.
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);

  const middle = myers(A, B, maxEdits);
  if (!middle) {
    const setB = new Set(b);
    const setA = new Set(a);
    const removed = a.filter((l) => !setB.has(l)).length;
    const added = b.filter((l) => !setA.has(l)).length;
    return { ok: false, reason: "too-different", stats: { added, removed, unchanged: a.length - removed } };
  }

  const lines: DiffLine[] = [];
  for (let i = 0; i < pre; i++) lines.push({ op: "equal", text: a[i], a: i + 1, b: i + 1 });
  for (const m of middle) {
    lines.push({
      op: m.op,
      text: m.text,
      ...(m.a !== undefined ? { a: m.a + pre + 1 } : {}),
      ...(m.b !== undefined ? { b: m.b + pre + 1 } : {}),
    });
  }
  for (let i = 0; i < suf; i++) {
    const ai = a.length - suf + i;
    const bi = b.length - suf + i;
    lines.push({ op: "equal", text: a[ai], a: ai + 1, b: bi + 1 });
  }
  const stats = { added: 0, removed: 0, unchanged: 0 };
  for (const l of lines) {
    if (l.op === "add") stats.added++;
    else if (l.op === "remove") stats.removed++;
    else stats.unchanged++;
  }
  return { ok: true, lines, stats };
}

type RawOp = { op: DiffOp; text: string; a?: number; b?: number };

function myers(a: string[], b: string[], maxEdits: number): RawOp[] | null {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((text, j) => ({ op: "add", text, b: j }));
  if (m === 0) return a.map((text, i) => ({ op: "remove", text, a: i }));
  const max = Math.min(n + m, maxEdits);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] holds the frontier before step d, restricted to k in [-d-1, d+1]
  // (index k + d + 1), so memory grows with D² rather than D·(N+M).
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    if (found !== -1) break;
  }
  if (found === -1) return null;

  // Backtrack through the saved frontiers.
  const ops: RawOp[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const t = trace[d];
    const at = (k: number) => t[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ op: "equal", text: a[x - 1], a: x - 1, b: y - 1 });
      x--;
      y--;
    }
    if (x === prevX) ops.push({ op: "add", text: b[y - 1], b: y - 1 });
    else ops.push({ op: "remove", text: a[x - 1], a: x - 1 });
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    ops.push({ op: "equal", text: a[x - 1], a: x - 1, b: y - 1 });
    x--;
    y--;
  }
  return ops.reverse();
}

export type DiffHunk = { kind: "lines"; lines: DiffLine[] } | { kind: "skip"; count: number };

/** Collapse long unchanged runs, keeping `context` lines around each change. */
export function toHunks(lines: DiffLine[], context = 2): DiffHunk[] {
  const keep = new Uint8Array(lines.length);
  lines.forEach((l, i) => {
    if (l.op === "equal") return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = 1;
  });
  const hunks: DiffHunk[] = [];
  let i = 0;
  while (i < lines.length) {
    if (keep[i]) {
      const group: DiffLine[] = [];
      while (i < lines.length && keep[i]) group.push(lines[i++]);
      hunks.push({ kind: "lines", lines: group });
    } else {
      let count = 0;
      while (i < lines.length && !keep[i]) {
        count++;
        i++;
      }
      hunks.push({ kind: "skip", count });
    }
  }
  return hunks;
}
