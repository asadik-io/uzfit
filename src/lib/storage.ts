/** Public URL of an object in the venue-media bucket (the bucket is public; paths are UUIDs). */
export function venueMediaUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const safePath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/storage/v1/object/public/venue-media/${safePath}`;
}
