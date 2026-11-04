"use client";

import { useState } from "react";
import { BadgeCheck, Link2Off, Plus, RotateCcw, Search, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import {
  MAX_RECIPIENTS,
  MAX_ROUTING_ORDER,
  RECIPIENT_ACTIONS,
  ROLE_LABELS,
  ROLE_RULES,
  actionLabels,
  roleLabels,
  type RecipientAction,
  type RoleLabel,
} from "@/lib/esign/constants";
import { groupByOrder } from "@/lib/esign/workflow";
import type { AdvocateHit } from "@/app/app/sign/actions";
import { AdvocateSearch } from "./advocate-search";

export type EditableRecipient = {
  key: string;
  name: string;
  email: string;
  roleLabel: RoleLabel;
  action: RecipientAction;
  routingOrder: number;
  advocateUserId: string | null;
  advocate?: { enrolmentNo: string; stateBarCouncil: string } | null;
};

let seq = 0;
export const newKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export function makeRecipient(p: Partial<EditableRecipient> & Pick<EditableRecipient, "roleLabel" | "action" | "routingOrder">): EditableRecipient {
  return { key: newKey(), name: "", email: "", advocateUserId: null, advocate: null, ...p };
}

export function RecipientsEditor({
  value,
  onChange,
  errors,
  onReset,
}: {
  value: EditableRecipient[];
  onChange: (next: EditableRecipient[]) => void;
  errors: Record<string, string>;
  onReset: () => void;
}) {
  const [searching, setSearching] = useState<string | null>(null);

  const update = (key: string, patch: Partial<EditableRecipient>) => onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => onChange(value.filter((r) => r.key !== key));
  const hasWitness = value.some((r) => r.action === "WITNESS");
  const maxSignOrder = Math.max(0, ...value.filter((r) => r.action === "SIGN").map((r) => r.routingOrder));

  function pick(key: string, a: AdvocateHit) {
    update(key, {
      advocateUserId: a.userId,
      name: a.displayName,
      email: "",
      roleLabel: "LAWYER",
      advocate: { enrolmentNo: a.enrolmentNo, stateBarCouncil: a.stateBarCouncil },
    });
    setSearching(null);
  }

  const groups = groupByOrder(value.map((r) => ({ ...r, id: r.key, status: "PENDING" })));

  return (
    <div className="space-y-4">
      {errors.recipients ? (
        <p className="text-[13px] text-danger" role="alert">
          {errors.recipients}
        </p>
      ) : null}
      <ol className="space-y-3">
        {value.map((r, i) => {
          const err = (f: string) => errors[`recipients.${i}.${f}`];
          const linked = Boolean(r.advocateUserId);
          return (
            <li key={r.key} className="rounded-lg border border-border bg-surface p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">
                  Recipient {i + 1}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {roleLabels[r.roleLabel]} · {actionLabels[r.action]}
                    {r.action !== "CC" ? ` · step ${r.routingOrder}` : ""}
                  </span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(r.key)}
                  disabled={value.length <= 1}
                  aria-label={`Remove recipient ${i + 1}`}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
                <Field label="Full name" htmlFor={`${r.key}-name`} error={err("name")} required className="lg:col-span-4">
                  <Input
                    id={`${r.key}-name`}
                    value={r.name}
                    onChange={(e) => update(r.key, { name: e.target.value })}
                    autoComplete="off"
                    maxLength={120}
                    aria-invalid={Boolean(err("name")) || undefined}
                  />
                </Field>
                <Field
                  label="Email"
                  htmlFor={`${r.key}-email`}
                  error={err("email")}
                  required={!linked}
                  hint={linked ? "Uses the advocate’s registered email." : undefined}
                  className="lg:col-span-4"
                >
                  <Input
                    id={`${r.key}-email`}
                    type="email"
                    inputMode="email"
                    value={linked ? "" : r.email}
                    placeholder={linked ? "Registered email (hidden)" : "name@example.com"}
                    onChange={(e) => update(r.key, { email: e.target.value })}
                    disabled={linked}
                    autoComplete="off"
                    maxLength={254}
                    aria-invalid={Boolean(err("email")) || undefined}
                  />
                </Field>
                <Field label="Role" htmlFor={`${r.key}-role`} error={err("roleLabel")} className="lg:col-span-2">
                  <Select
                    id={`${r.key}-role`}
                    value={r.roleLabel}
                    onChange={(e) => {
                      const roleLabel = e.target.value as RoleLabel;
                      update(r.key, ROLE_RULES[roleLabel].canLinkAdvocate ? { roleLabel } : { roleLabel, advocateUserId: null, advocate: null });
                    }}
                  >
                    {ROLE_LABELS.map((v) => (
                      <option key={v} value={v}>
                        {roleLabels[v]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Action" htmlFor={`${r.key}-action`} error={err("action")} className="lg:col-span-2">
                  <Select id={`${r.key}-action`} value={r.action} onChange={(e) => update(r.key, { action: e.target.value as RecipientAction })}>
                    {RECIPIENT_ACTIONS.map((v) => (
                      <option key={v} value={v}>
                        {actionLabels[v]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {r.action !== "CC" ? (
                  <Field
                    label="Order"
                    htmlFor={`${r.key}-order`}
                    error={err("routingOrder")}
                    hint="Same number = at the same time"
                    className="sm:col-span-2 lg:col-span-12 lg:max-w-56"
                  >
                    <Input
                      id={`${r.key}-order`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_ROUTING_ORDER}
                      value={Number.isFinite(r.routingOrder) ? r.routingOrder : ""}
                      onChange={(e) => update(r.key, { routingOrder: e.target.value === "" ? NaN : Number(e.target.value) })}
                      aria-invalid={Boolean(err("routingOrder")) || undefined}
                    />
                  </Field>
                ) : (
                  <p className="text-[13px] text-muted sm:col-span-2 lg:col-span-12">Copy recipients do not act; they get the final PDF when everyone has finished.</p>
                )}
              </div>
              {ROLE_RULES[r.roleLabel].canLinkAdvocate ? (
                <div className="mt-3">
                  {linked ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">
                        <BadgeCheck aria-hidden /> Verified advocate · {r.advocate?.enrolmentNo ?? "linked"}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10"
                        onClick={() => update(r.key, { advocateUserId: null, advocate: null })}
                      >
                        <Link2Off aria-hidden /> Unlink
                      </Button>
                    </div>
                  ) : searching === r.key ? (
                    <AdvocateSearch onPick={(a) => pick(r.key, a)} onCancel={() => setSearching(null)} />
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setSearching(r.key)}>
                      <Search aria-hidden /> Link a verified advocate
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={value.length >= MAX_RECIPIENTS}
          onClick={() => onChange([...value, makeRecipient({ roleLabel: "OTHER", action: "SIGN", routingOrder: Math.max(1, maxSignOrder) })])}
        >
          <Plus aria-hidden /> Add recipient
        </Button>
        {!hasWitness ? (
          <Button
            type="button"
            variant="outline"
            disabled={value.length >= MAX_RECIPIENTS}
            onClick={() =>
              onChange([...value, makeRecipient({ roleLabel: "LAWYER", action: "WITNESS", routingOrder: Math.min(MAX_ROUTING_ORDER, maxSignOrder + 1) })])
            }
          >
            <UserPlus aria-hidden /> Add lawyer as witness
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onReset}>
          <RotateCcw aria-hidden /> Reset to default
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-surface-2/60 p-3 text-sm">
        <p className="mb-2 font-medium text-ink">Signing order</p>
        <ol className="space-y-1 text-ink-2">
          {groups.map((g) => (
            <li key={String(g.order)} className="flex gap-2">
              <span className="w-16 shrink-0 text-muted">{g.order === "CC" ? "At end" : `Step ${Number.isFinite(g.order) ? g.order : "?"}`}</span>
              <span className="min-w-0">
                {g.items
                  .map((r) => `${r.name.trim() || roleLabels[r.roleLabel]} (${actionLabels[r.action].toLowerCase()})`)
                  .join(g.order === "CC" ? ", " : " + ")}
                {g.order !== "CC" && g.items.length > 1 ? <span className="text-muted"> · at the same time</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
