import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="container-page py-4">
      <Skeleton className="mb-4 h-5 w-24" />
      <Skeleton className="aspect-[16/10] w-full rounded-2xl sm:aspect-[21/9]" />
      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-14 w-full" />
          <ListSkeleton rows={4} />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
