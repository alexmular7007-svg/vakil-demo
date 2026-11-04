"use client";

import Form from "next/form";
import { useRef } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";

/** GET filter form: works without JavaScript; with it, the status select applies immediately. */
export function DraftFilters({ q, status }: { q: string; status: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <Form ref={formRef} action="/app/drafts" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <label htmlFor="draft-q" className="sr-only">
          Search drafts by title
        </label>
        <Input id="draft-q" name="q" type="search" defaultValue={q} placeholder="Search by title" className="pl-9" />
      </div>
      <div className="flex gap-2">
        <label htmlFor="draft-status" className="sr-only">
          Status
        </label>
        <Select
          id="draft-status"
          name="status"
          defaultValue={status}
          className="sm:w-40"
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="">All statuses</option>
          <option value="draft">In progress</option>
          <option value="final">Final</option>
        </Select>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </div>
    </Form>
  );
}
