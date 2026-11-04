import { Skeleton } from "@/components/ui/display";

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-40" />
      <Skeleton className="h-32" />
    </div>
  );
}
