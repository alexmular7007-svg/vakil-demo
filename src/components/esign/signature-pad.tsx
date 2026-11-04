"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_SIGNATURE_PNG_BYTES } from "@/lib/esign/constants";

type Point = { x: number; y: number };
type Stroke = Point[];

// Export size is fixed so every drawn signature has the same shape in the PDF.
const EXPORT_W = 600;
const EXPORT_H = 200;
const EXPORT_INK = "#0e1726";
const MAX_DATA_URL = Math.ceil((MAX_SIGNATURE_PNG_BYTES * 4) / 3) + 32;

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number, color: string) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1.6, w / 260);
  for (const s of strokes) {
    if (s.length === 0) continue;
    const pts = s.map((p) => ({ x: p.x * w, y: p.y * h }));
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
}

function exportPng(strokes: Stroke[]): string | null {
  if (strokes.length === 0) return null;
  const c = document.createElement("canvas");
  c.width = EXPORT_W;
  c.height = EXPORT_H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  drawStrokes(ctx, strokes, EXPORT_W, EXPORT_H, EXPORT_INK);
  const url = c.toDataURL("image/png");
  return url.length <= MAX_DATA_URL ? url : null;
}

/**
 * Accessible signature canvas: pointer events cover mouse, pen and touch; the
 * canvas does not scroll the page while drawing. Keyboard-only users can type
 * their signature instead (the parent offers a "Type" option).
 */
export function SignaturePad({ onChange, disabled }: { onChange: (dataUrl: string | null) => void; disabled?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState("");
  const hintId = useId();

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ink = getComputedStyle(canvas).getPropertyValue("--ink").trim() || EXPORT_INK;
    drawStrokes(ctx, strokesRef.current, w, h, ink);
  }, []);

  // Size the canvas to its container (3:1) and redraw on resize or theme change.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = Math.round(w / 3);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [redraw]);

  const commit = useCallback(() => {
    const url = exportPng(strokesRef.current);
    if (strokesRef.current.length > 0 && !url) {
      setMessage("That signature is too detailed to store. Clear it and draw a simpler one.");
      onChange(null);
      return;
    }
    setMessage(url ? "Signature captured." : "");
    onChange(url);
  }, [onChange]);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    strokesRef.current = [...strokesRef.current, [pointFrom(e)]];
    redraw();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    const rect = e.currentTarget.getBoundingClientRect();
    for (const ev of events.length ? events : [e.nativeEvent]) {
      stroke.push({
        x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
      });
    }
    redraw();
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setCount(strokesRef.current.length);
    commit();
  }

  function clear() {
    strokesRef.current = [];
    setCount(0);
    redraw();
    setMessage("Signature cleared.");
    onChange(null);
  }

  function undo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setCount(strokesRef.current.length);
    redraw();
    commit();
  }

  return (
    <div className="grid gap-2">
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-lg border border-dashed border-border-strong bg-surface"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Signature drawing area. Draw with a mouse, pen or finger."
          aria-describedby={hintId}
          className="block touch-none select-none"
          style={{ cursor: disabled ? "not-allowed" : "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />
        <span className="pointer-events-none absolute right-4 bottom-[22%] left-4 border-b border-border-strong" aria-hidden />
        {count === 0 ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted" aria-hidden>
            Sign here
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={hintId} className="text-[13px] text-muted">
          Draw inside the box. Can’t draw? Choose “Type” instead.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={undo} disabled={disabled || count === 0}>
            <Undo2 aria-hidden /> Undo
          </Button>
          <Button type="button" variant="outline" onClick={clear} disabled={disabled || count === 0}>
            <Eraser aria-hidden /> Clear
          </Button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
      {message && message.startsWith("That signature") ? (
        <p className="text-[13px] text-danger" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
