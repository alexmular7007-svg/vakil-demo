import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenText, WifiOff } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Offline", robots: { index: false, follow: false } };

/** Served by the service worker when there is no connection. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="flex items-center gap-2.5">
        <LogoMark className="size-10" />
        <Wordmark />
      </div>
      <span className="mt-10 inline-flex size-16 items-center justify-center rounded-2xl bg-(--tile-slate) text-(--tile-slate-fg)">
        <WifiOff className="size-7" />
      </span>
      <h1 className="mt-5 font-serif text-3xl font-semibold text-ink">You are offline</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Court corridors often have weak signal. Bare acts and tools you opened earlier still work; your workspace comes back when the connection does.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <RetryButton />
        <Button asChild variant="outline">
          <Link href="/law">
            <BookOpenText /> Bare acts
          </Link>
        </Button>
      </div>
    </main>
  );
}
