"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { recordSignupConsent } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { Checkbox } from "@/components/ui/form";

/** Shown until the user has an active "service" consent (DPDP: consent before processing). */
export function ConsentGate({ name }: { name: string }) {
  const router = useRouter();
  const [agree, setAgree] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="mx-auto max-w-lg py-10">
      <Card className="p-6 sm:p-8">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
          <ShieldCheck className="size-5" />
        </span>
        <h1 className="mt-4 font-serif text-2xl font-semibold text-ink">Before we start, {name.split(" ")[0]}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Vaakil AI stores your matters, drafts and documents, and sends the questions and documents you choose to our AI
          providers to generate answers. You can withdraw consent or ask for your data to be deleted at any time from
          Settings → Privacy.
        </p>
        <label className="mt-5 flex items-start gap-2.5 text-sm text-ink-2">
          <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
          <span>
            I agree to the <Link href="/legal/terms" className="text-primary underline">Terms</Link> and the processing
            described in the <Link href="/legal/privacy" className="text-primary underline">Privacy notice</Link>.
          </span>
        </label>
        <label className="mt-3 flex items-start gap-2.5 text-sm text-ink-2">
          <Checkbox checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5" />
          <span>Send me product updates (optional).</span>
        </label>
        <Button
          className="mt-6 w-full"
          disabled={!agree || pending}
          onClick={() =>
            start(async () => {
              await recordSignupConsent(marketing);
              router.refresh();
            })
          }
        >
          Continue to workspace
        </Button>
      </Card>
    </div>
  );
}
