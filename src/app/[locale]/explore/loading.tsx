import { Skeleton } from "@/components/ui/skeleton";
import { GridSkeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="container-page py-6">
      <Skeleton className="mb-2 h-9 w-56" />
      <Skeleton className="mb-6 h-5 w-80 max-w-full" />
      <Skeleton className="mb-6 h-28 w-full rounded-2xl" />
      <GridSkeleton />
    </div>
  );
}
