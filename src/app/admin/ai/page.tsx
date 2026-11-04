import type { Metadata } from "next";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/guard";
import { aiStatus } from "@/lib/ai/gateway";
import { aiConfig } from "@/lib/ai/config";
import { EFFORT, MODELS, type Provider, type Tier } from "@/lib/ai/models";
import { fairUsePolicy, plans } from "@/lib/plans";
import { Alert, Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";

export const metadata: Metadata = { title: "AI" };

const tiers: Tier[] = ["fast", "standard", "pro"];
const providers: Provider[] = ["anthropic", "google"];
const providerLabel: Record<Provider, string> = { anthropic: "Anthropic (Claude)", google: "Google (Gemini)" };
const tierUse: Record<Tier, string> = {
  fast: "Titles, query rewriting, simple lookups, fair-use overflow",
  standard: "Most questions",
  pro: "Drafting, case bundles, hard analysis",
};

function Status({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1.5 text-success">
      <CheckCircle2 className="size-4" aria-hidden /> Key set
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <CircleSlash className="size-4" aria-hidden /> No key
    </span>
  );
}

export default async function AdminAiPage() {
  await requireAdminPage();
  const status = aiStatus();

  return (
    <div className="space-y-8">
      <PageHeader title="AI" description="Provider status, model routing, resilience and fair-use caps. Defaults live in src/lib/ai/config.ts (override with the AI_* env vars in .env.example); caps in src/lib/plans.ts." />

      {!status.enabled ? (
        <Alert tone="warning" title="AI is switched off">
          Neither ANTHROPIC_API_KEY nor GOOGLE_GENERATIVE_AI_API_KEY is set, so Ask AI, AI drafting and document review show a
          “not configured” message.
        </Alert>
      ) : null}

      <section aria-labelledby="prov-heading" className="space-y-3">
        <h2 id="prov-heading" className="text-base font-semibold text-ink">
          Providers
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm text-muted">Anthropic</p>
            <p className="mt-1 text-sm">
              <Status on={status.anthropic} />
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted">Google</p>
            <p className="mt-1 text-sm">
              <Status on={status.google} />
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted">Requests route to</p>
            <p className="mt-1 font-medium text-ink">{status.provider ? providerLabel[status.provider] : "Nothing (AI off)"}</p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="route-heading" className="space-y-3">
        <h2 id="route-heading" className="text-base font-semibold text-ink">
          Model routing
        </h2>
        <Table>
          <thead>
            <tr>
              <Th>Tier</Th>
              {providers.map((p) => (
                <Th key={p}>
                  {providerLabel[p]}
                  {status.provider === p ? (
                    <Badge tone="success" className="ml-2 normal-case">
                      active
                    </Badge>
                  ) : null}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t}>
                <Td>
                  <p className="font-medium text-ink capitalize">{t}</p>
                  <p className="text-xs text-muted">{tierUse[t]}</p>
                  <p className="text-xs text-muted">Claude effort: {EFFORT[t]}</p>
                </Td>
                {providers.map((p) => (
                  <Td key={p}>
                    <p className="font-mono text-xs text-ink">{MODELS[p][t].id}</p>
                    <p className="text-xs text-muted">
                      ${MODELS[p][t].inputPerM} in / ${MODELS[p][t].outputPerM} out per 1M tokens
                    </p>
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section aria-labelledby="resilience-heading" className="space-y-3">
        <h2 id="resilience-heading" className="text-base font-semibold text-ink">
          Resilience
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm text-muted">Failover</p>
            <p className="mt-1 font-medium text-ink">{status.failover ? "On: the other provider takes over" : "Off"}</p>
            <p className="mt-1 text-xs text-muted">Needs AI_PROVIDER=auto and both keys.</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted">Timeouts and retries</p>
            <p className="mt-1 text-sm text-ink tabular">
              {aiConfig.timeouts.idleMs / 1000} s idle, {aiConfig.timeouts.deadlineMs / 1000} s total
            </p>
            <p className="mt-1 text-xs text-muted tabular">
              {aiConfig.retry.maxRetries} retries, {aiConfig.retry.baseDelayMs}–{aiConfig.retry.maxDelayMs} ms backoff
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted">Circuit (this server)</p>
            {providers.map((p) => (
              <p key={p} className="mt-1 text-sm text-ink">
                {providerLabel[p]}:{" "}
                <Badge tone={status.circuits[p].state === "closed" ? "success" : status.circuits[p].state === "open" ? "danger" : "warning"}>
                  {status.circuits[p].state.replace("_", "-")}
                </Badge>
              </p>
            ))}
            <p className="mt-1 text-xs text-muted tabular">
              Opens after {aiConfig.breaker.failureThreshold} failures for {aiConfig.breaker.cooldownMs / 1000} s.
            </p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="caps-heading" className="space-y-3">
        <h2 id="caps-heading" className="text-base font-semibold text-ink">
          Fair-use caps by plan
        </h2>
        <Table>
          <thead>
            <tr>
              <Th>Plan</Th>
              <Th className="text-right">Soft cap / day</Th>
              <Th className="text-right">Hard cap / day</Th>
              <Th className="text-right">Heavy credits / month</Th>
              <Th>Model tiers</Th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <Td className="font-medium text-ink">{p.name}</Td>
                <Td className="text-right tabular-nums">{p.limits.dailySoftCap}</Td>
                <Td className="text-right tabular-nums">{p.limits.dailyHardCap}</Td>
                <Td className="text-right tabular-nums">{p.limits.monthlyCredits}</Td>
                <Td>{p.limits.modelTiers.join(", ")}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="text-sm text-muted">{fairUsePolicy}</p>
      </section>
    </div>
  );
}
