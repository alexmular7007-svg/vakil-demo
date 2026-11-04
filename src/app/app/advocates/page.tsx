import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  MessageSquareText,
  Scale,
  Search,
  UsersRound,
} from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { searchListedAdvocates, type AdvocateFilters } from "@/lib/directory/advocates";
import { LANGUAGES, PRACTICE_AREAS } from "@/lib/directory/constants";
import { Alert, EmptyState, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { AdvocateCard } from "@/components/directory/advocate-card";
import { BciNotice } from "@/components/directory/bci-notice";

export const metadata: Metadata = { title: "Advocates" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(v: string | string[] | undefined, max = 80) {
  const s = (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  return s.slice(0, max);
}

export default async function AdvocatesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser("/app/advocates");
  const sp = await searchParams;
  const filters: AdvocateFilters = {
    q: one(sp.q) || undefined,
    area: (PRACTICE_AREAS as readonly string[]).includes(one(sp.area)) ? one(sp.area) : undefined,
    language: (LANGUAGES as readonly string[]).includes(one(sp.language)) ? one(sp.language) : undefined,
    city: one(sp.city) || undefined,
    court: one(sp.court) || undefined,
  };
  const page = Math.min(200, Math.max(1, Number.parseInt(one(sp.page, 4), 10) || 1));
  const chatParam = one(sp.chat, 40);
  const chatId = UUID_RE.test(chatParam) ? chatParam : null;

  const [{ rows, hasMore }, linkedChat] = await Promise.all([
    searchListedAdvocates(user.id, filters, page),
    chatId
      ? withUser(user.id, (tx) => tx.select({ id: chats.id, title: chats.title }).from(chats).where(eq(chats.id, chatId)).limit(1)).then(
          (r) => r[0] ?? null,
        )
      : Promise.resolve(null),
  ]);

  const activeFilters = Object.values(filters).some(Boolean);
  const qs = (extra: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, chat: linkedChat?.id ?? null, ...extra })) {
      if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const profileHref = (id: string) => `/app/advocates/${encodeURIComponent(id)}${linkedChat ? `?chat=${linkedChat.id}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Network" icon={Scale}
        title="Advocates"
        description="Find a verified advocate by practice area, city, language or court, and send a consultation request."
        actions={
          <Button asChild variant="outline">
            <Link href="/app/advocates/inbox">
              <Inbox /> Consultations
            </Link>
          </Button>
        }
      />

      {linkedChat ? (
        <Alert tone="info" title="Your conversation will be linked">
          <span className="inline-flex items-center gap-1.5">
            <MessageSquareText className="size-4" aria-hidden /> {linkedChat.title}
          </span>
          . Choose an advocate below to send a request that references it.
        </Alert>
      ) : null}

      <form method="get" className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Search advocates">
        {linkedChat ? <input type="hidden" name="chat" value={linkedChat.id} /> : null}
        <Field label="Name or enrolment no." htmlFor="q" className="lg:col-span-2">
          <Input id="q" name="q" defaultValue={filters.q ?? ""} placeholder="e.g. Sharma or D/1234/2015" maxLength={80} />
        </Field>
        <Field label="Practice area" htmlFor="area" className="lg:col-span-2">
          <Select id="area" name="area" defaultValue={filters.area ?? ""}>
            <option value="">Any</option>
            {PRACTICE_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Language" htmlFor="language" className="lg:col-span-2">
          <Select id="language" name="language" defaultValue={filters.language ?? ""}>
            <option value="">Any</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City" htmlFor="city" className="lg:col-span-2">
          <Input id="city" name="city" defaultValue={filters.city ?? ""} placeholder="e.g. Lucknow" maxLength={80} />
        </Field>
        <Field label="Court" htmlFor="court" className="lg:col-span-2">
          <Input id="court" name="court" defaultValue={filters.court ?? ""} placeholder="e.g. Allahabad High Court" maxLength={80} />
        </Field>
        <div className="flex items-end gap-2 lg:col-span-2">
          <Button type="submit" className="flex-1">
            <Search /> Search
          </Button>
          {activeFilters ? (
            <Button asChild variant="ghost">
              <Link href={`/app/advocates${linkedChat ? `?chat=${linkedChat.id}` : ""}`}>Clear</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <BciNotice />

      {rows.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={activeFilters ? "No listed advocates match these filters" : "No advocates are listed yet"}
          description={
            activeFilters
              ? "Try fewer filters or a nearby city. Only verified advocates who chose to be listed appear here."
              : "Verified advocates who opt in will appear here in alphabetical order."
          }
          action={
            user.role !== "admin" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/app/settings/advocate">Are you an advocate? Apply for verification</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            Showing {(page - 1) * 24 + 1}–{(page - 1) * 24 + rows.length} in alphabetical order
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((a) => (
              <AdvocateCard
                key={a.userId}
                advocate={a}
                href={profileHref(a.userId)}
                actionLabel={a.userId === user.id ? "This is you" : a.acceptsConsultations ? "Request a consultation" : "View profile"}
              />
            ))}
          </div>
          {page > 1 || hasMore ? (
            <nav aria-label="Pagination" className="flex items-center justify-between">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/advocates${qs({ page: page - 1 })}`}>
                    <ChevronLeft /> Previous
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted">Page {page}</span>
              {hasMore ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/advocates${qs({ page: page + 1 })}`}>
                    Next <ChevronRight />
                  </Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
