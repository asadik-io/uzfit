import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container-page flex max-w-3xl flex-col gap-4 py-6">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}
