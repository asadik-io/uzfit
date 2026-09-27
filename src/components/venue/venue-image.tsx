import Image from "next/image";
import { venueMediaUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./icons";

/**
 * Venue photo from the public media bucket, or a branded placeholder when a venue has none.
 * Images are served directly from Supabase Storage (`unoptimized`), so no image-optimization
 * quota or remote-pattern configuration is needed.
 */
export function VenueImage({
  path,
  alt,
  category,
  className,
  priority = false,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
}: {
  path: string | null | undefined;
  alt: string;
  category?: string | null;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (!path) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-primary to-emerald-900 text-accent",
          className,
        )}
        role="img"
        aria-label={alt}
      >
        <CategoryIcon slug={category} className="size-12 opacity-80" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <Image
        src={venueMediaUrl(path)}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized
        className="object-cover"
      />
    </div>
  );
}
