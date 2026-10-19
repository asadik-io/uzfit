/**
 * Renders the demo venue artwork (original abstract shapes, no photography) into
 * public/demo/media so the seed's venue_images rows resolve to static files.
 *
 * Usage: pnpm demo:media
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { venueArtSvg } from "./lib/demo-art";

const MARKER = "5eed";
const venueId = (n: number) => `e1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const imageId = (venue: number, index: number) =>
  `${MARKER}0000-0000-4000-8000-${String(venue * 10 + index).padStart(12, "0")}`;

/** Category artwork per venue, in seed order (the ninth venue is the unpublished draft). */
const VENUE_CATEGORIES: string[][] = [
  ["gym", "functional"],
  ["gym", "boxing"],
  ["gym", "functional"],
  ["boxing", "functional"],
  ["yoga", "yoga"],
  ["dance", "yoga"],
  ["functional", "gym"],
  ["swimming", "swimming"],
  ["gym"],
];

async function main() {
  let written = 0;
  for (const [index, categories] of VENUE_CATEGORIES.entries()) {
    const venue = index + 1;
    const dir = join("public", "demo", "media", "venues", venueId(venue));
    mkdirSync(dir, { recursive: true });
    for (const [imageIndex, category] of categories.entries()) {
      const webp = await sharp(Buffer.from(venueArtSvg(category, index * 97 + imageIndex * 13 + 7)))
        .webp({ quality: 78 })
        .toBuffer();
      writeFileSync(join(dir, `${imageId(venue, imageIndex)}.webp`), webp);
      written++;
    }
  }
  console.log(`Wrote ${written} demo images to public/demo/media`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
