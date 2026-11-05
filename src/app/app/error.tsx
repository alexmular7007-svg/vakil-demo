"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertCircle className="size-6" />
      </div>
      <h2 className="mt-4 font-serif text-2xl font-semibold tracking-tight text-ink">
        Failed to load this section
      </h2>
      <p className="mt-2 text-sm text-muted">
        An error occurred while loading this page. Your workspace session is still active.
      </p>
      {error.digest ? (
        <p className="mt-1 font-mono text-xs text-muted">Error ID: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex gap-3">
        <Button onClick={() => reset()} variant="primary" size="sm">
          <RotateCcw className="mr-1.5 size-4" /> Try again
        </Button>
      </div>
    </div>
  );
}
