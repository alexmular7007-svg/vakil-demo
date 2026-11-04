"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const options = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-md bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={mounted && theme === o.value}
          aria-label={o.label}
          onClick={() => setTheme(o.value)}
          className={cn(
            "inline-flex size-7 cursor-pointer items-center justify-center rounded text-muted transition-colors hover:text-ink",
            mounted && theme === o.value && "bg-surface text-ink shadow-sm",
          )}
        >
          <o.icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
