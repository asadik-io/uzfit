/**
 * Venue media locations. Seed artwork is served as static files from /public; photos uploaded
 * through the partner editor live in the demo's memory and are served by /media/[...path].
 * Seed image ids start with a recognisable marker so the two can be told apart without a lookup.
 */
export const SEED_IMAGE_MARKER = "5eed";

export function venueMediaUrl(path: string): string {
  const safePath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.startsWith(SEED_IMAGE_MARKER) ? `/demo/media/${safePath}` : `/media/${safePath}`;
}
