/**
 * Generates UzFit's original icon set from the vector mark (see src/components/brand/logo.tsx):
 *   src/app/icon.svg                     favicon (SVG)
 *   src/app/favicon.ico                  32×32 favicon for browsers that request /favicon.ico
 *   src/app/apple-icon.png               180×180 Apple touch icon (full bleed)
 *   public/icons/icon-192.png            PWA icon
 *   public/icons/icon-512.png            PWA icon
 *   public/icons/icon-maskable-512.png   PWA maskable icon (mark inside the safe zone)
 *
 * Run with `pnpm assets:generate`. The output is committed; sharp is a dev dependency only.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const EMERALD = "#047857";
const LIME = "#BEF264";
const WHITE = "#FFFFFF";

/** The mark on a 32×32 grid: a lime "U" that doubles as a pulse line, with a white dot. */
const MARK = `<path d="M9 8.5v7.5a7 7 0 0 0 14 0V8.5" fill="none" stroke="${LIME}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="8.5" r="2.3" fill="${WHITE}"/>`;

/** Rounded tile, as used in the app header. */
function tileSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="${EMERALD}"/>${MARK}</svg>`;
}

/**
 * Full-bleed square with the mark scaled into the maskable safe zone (the central 80% circle),
 * so launchers can crop it to any shape.
 */
function fullBleedSvg(size: number, markScale: number): string {
  const offset = (32 - 32 * markScale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" fill="${EMERALD}"/><g transform="translate(${offset} ${offset + 0.6}) scale(${markScale})">${MARK}</g></svg>`;
}

async function png(svg: string, size: number, file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg), { density: 72 * (size / 32) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

/** ICO container with one embedded 32×32 PNG (supported by all current browsers). */
async function ico(svg: string, file: string): Promise<void> {
  const image = await sharp(Buffer.from(svg), { density: 72 }).resize(32, 32).png({ compressionLevel: 9 }).toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  header.writeUInt8(32, 6); // width
  header.writeUInt8(32, 7); // height
  header.writeUInt8(0, 8); // palette size
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(image.length, 14); // image size
  header.writeUInt32LE(22, 18); // image offset
  await writeFile(file, Buffer.concat([header, image]));
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

async function main() {
  const root = process.cwd();
  await writeFile(path.join(root, "src/app/icon.svg"), `${tileSvg(32)}\n`);
  console.log("wrote src/app/icon.svg");
  await ico(tileSvg(32), path.join(root, "src/app/favicon.ico"));
  await png(fullBleedSvg(180, 0.8), 180, path.join(root, "src/app/apple-icon.png"));
  await png(tileSvg(192), 192, path.join(root, "public/icons/icon-192.png"));
  await png(tileSvg(512), 512, path.join(root, "public/icons/icon-512.png"));
  await png(fullBleedSvg(512, 0.62), 512, path.join(root, "public/icons/icon-maskable-512.png"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
