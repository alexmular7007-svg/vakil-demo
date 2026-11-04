"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "./button";
import { IconTile } from "./display";
import { Dialog } from "./overlay";

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = destructive (red button); default = neutral confirmation. */
  tone?: "danger" | "default";
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * In-app confirmation (a bottom sheet on phones, a dialog on larger screens) in
 * place of the browser's window.confirm. Usage:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete this hearing?", tone: "danger" }))) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    resolver.current?.(false);
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOpts(null);
  };

  const danger = opts?.tone === "danger";
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={opts !== null}
        onClose={() => close(false)}
        title={
          <span className="flex items-center gap-3">
            <IconTile icon={danger ? AlertTriangle : ShieldCheck} tone={danger ? "maroon" : "navy"} size="sm" />
            {opts?.title}
          </span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {opts?.cancelLabel ?? "Cancel"}
            </Button>
            <Button variant={danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
              {opts?.confirmLabel ?? (danger ? "Delete" : "Confirm")}
            </Button>
          </>
        }
      >
        {opts?.description ? <div className="text-sm leading-relaxed text-ink-2">{opts.description}</div> : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  // Outside the provider (e.g. an isolated test), fall back to the browser prompt.
  return ctx ?? (async (o) => window.confirm(o.title));
}
