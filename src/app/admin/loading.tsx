import { Skeleton } from "@/components/ui/display";

export default function AdminLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-72" />
    </div>
  );
}
