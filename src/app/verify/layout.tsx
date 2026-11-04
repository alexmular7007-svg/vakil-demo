import type { Metadata } from "next";
import { Logo } from "@/components/brand";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Verify a signed document",
  robots: { index: false, follow: false },
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-3xl px-4 py-5 text-xs text-muted sm:px-6">{site.disclaimer}</p>
      </footer>
    </div>
  );
}
