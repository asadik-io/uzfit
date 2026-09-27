import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="container-page py-6">
      <Skeleton className="mb-2 h-9 w-48" />
      <Skeleton className="mb-6 h-5 w-72 max-w-full" />
      <Skeleton className="mb-5 h-12 w-64 rounded-xl" />
      <ListSkeleton rows={4} />
    </div>
  );
}
