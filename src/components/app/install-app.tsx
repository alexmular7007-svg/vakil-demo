"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { IconTile } from "@/components/ui/display";
import { cn } from "@/lib/utils";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * "Install app" for Chrome, Edge and Android (beforeinstallprompt). Renders nothing
 * where the browser does not offer installation or the app is already installed.
 */
export function InstallAppButton({ variant = "button", className }: { variant?: "button" | "row"; className?: string }) {
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!event) return null;
  const install = async () => {
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  };

  if (variant === "row") {
    return (
      <button type="button" onClick={install} className={cn("flex cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 text-left text-sm font-semibold text-ink-2", className)}>
        <IconTile icon={Download} tone="gold" size="sm" /> Install Vaakil AI on this device
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={install}
      className={cn("inline-flex cursor-pointer items-center gap-2 rounded-md bg-gold-bright/15 px-3 py-2 text-xs font-bold text-gold-bright", className)}
    >
      <Download className="size-4" /> Install app
    </button>
  );
}
