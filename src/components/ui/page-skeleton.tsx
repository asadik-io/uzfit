import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";
import { ListSkeleton } from "./states";

/** Generic route loading state: a heading and a list of content blocks. */
export function PageSkeleton({ rows = 4, contained = true }: { rows?: number; contained?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-4", contained ? "container-page py-6" : "")}>
      <Skeleton className="h-9 w-56 max-w-full" />
      <Skeleton className="h-5 w-80 max-w-full" />
      <ListSkeleton rows={rows} />
    </div>
  );
}
