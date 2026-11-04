import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/ui/display";
import { SettingsNav } from "@/components/settings/settings-nav";

export const metadata: Metadata = { title: { default: "Settings", template: "%s · Settings · Vaakil AI" } };

// Static shell only: each settings page reads the session itself (inside the
// loading boundary below), so this layout never blocks on request data.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader eyebrow="Account" icon={Settings} title="Settings" description="Your profile, sign-in security, advocate verification, plan and privacy." className="mb-4" />
      <SettingsNav />
      {children}
    </div>
  );
}
