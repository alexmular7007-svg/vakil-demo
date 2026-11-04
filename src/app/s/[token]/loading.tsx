import { Skeleton } from "@/components/ui/display";

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-36" />
      <Skeleton className="h-44" />
    </div>
  );
}
