"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Accessible modal built on the native <dialog> element (focus trap and Esc for free). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        // Phones: a bottom sheet. Larger screens: a centred dialog.
        "m-auto w-[min(100%-2rem,32rem)] rounded-xl border border-border bg-surface p-0 text-ink shadow-lg backdrop:bg-brand/50 backdrop:backdrop-blur-[3px] open:animate-slide-up",
        "max-sm:mb-0 max-sm:w-full max-sm:max-w-full max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)] max-sm:open:animate-sheet-up",
        className,
      )}
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden />
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        <button type="button" onClick={onClose} className="-m-1.5 inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto px-5 py-4">{children}</div>
      {footer ? <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
    </dialog>
  );
}

/** Slide-in panel for mobile navigation and side tools. */
export function Sheet({
  open,
  onClose,
  side = "left",
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right" | "bottom";
  children: React.ReactNode;
  label: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const content = (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-label={label}>
      <div className="fixed inset-0 animate-fade-in bg-black/60 backdrop-blur-[3px]" onClick={onClose} />
      {side === "bottom" ? (
        <div className="fixed inset-x-0 bottom-0 z-10 flex max-h-[88dvh] animate-sheet-up flex-col rounded-t-2xl border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl">
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" aria-hidden />
          {children}
        </div>
      ) : (
        <div
          className={cn(
            "fixed top-0 bottom-0 z-10 flex h-dvh w-[min(86vw,20rem)] animate-slide-up flex-col border-border bg-surface shadow-2xl",
            side === "left" ? "left-0 border-r" : "right-0 border-l",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}

/** Lightweight dropdown menu: click to open, closes on outside click or Esc. */
export function Menu({
  trigger,
  children,
  align = "end",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open ? (
        <div
          role="menu"
          className={cn(
            "glass absolute z-40 mt-2 min-w-52 animate-slide-up rounded-lg p-1.5 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      role="menuitem"
      type="button"
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2.5 text-left text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink [&_svg]:size-4 [&_svg]:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: string; label: React.ReactNode }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full overflow-x-auto rounded-md bg-surface-2 p-1 scrollbar-none", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "cursor-pointer rounded-sm px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-muted transition-colors",
            value === t.value ? "bg-surface text-ink shadow-sm" : "hover:text-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-border-strong",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}
