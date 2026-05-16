#!/usr/bin/env node
/**
 * Regenerate PWA / favicon variants from the 1200×1200 master logo.
 *
 *   node scripts/generate-icons.mjs
 *
 * Outputs land in web/public/img/ (kept out of git only if you choose;
 * by default they're committed so prod builds don't need sharp on the host).
 */

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");
const SRC = resolve(WEB_ROOT, "public", "wingman-ai.png");
const OUT = resolve(WEB_ROOT, "public", "img");

/** Plain square PNG at the given pixel size — for `any` purpose icons. */
async function makeAny(size, filename) {
  const file = resolve(OUT, filename);
  await sharp(SRC)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`  → ${filename} (${size}×${size})`);
}

/**
 * Maskable variant — Android adaptive icons crop a circle/squircle inside
 * the canvas. The logo must sit inside the "safe zone" (inner 80% radius).
 * We render onto a solid dark canvas matching the app background so the
 * masked corners blend in instead of going transparent → white.
 */
async function makeMaskable(size, filename) {
  const file = resolve(OUT, filename);
  // 20% padding around the logo (safe zone = inner 80%)
  const inner = Math.round(size * 0.8);
  const offset = Math.round((size - inner) / 2);

  const logo = await sharp(SRC).resize(inner, inner, { fit: "contain" }).toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      // Matches --background in .dark (hsl(220 13% 7%) ≈ #0f1115)
      background: { r: 15, g: 17, b: 21, alpha: 1 },
    },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`  → ${filename} (${size}×${size}, maskable, 20% safe-zone)`);
}

/**
 * Apple touch icon — iOS doesn't honour the maskable hint and renders a
 * rounded square automatically. So we ship the logo on the same dark
 * background but without the extra safe-zone padding.
 */
async function makeAppleTouch(size, filename) {
  const file = resolve(OUT, filename);
  const inner = Math.round(size * 0.9);
  const offset = Math.round((size - inner) / 2);
  const logo = await sharp(SRC).resize(inner, inner, { fit: "contain" }).toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 15, g: 17, b: 21, alpha: 1 },
    },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`  → ${filename} (${size}×${size}, Apple touch icon)`);
}

/**
 * Minimal multi-resolution favicon.ico containing 16, 32, 48 PNGs.
 * Written by hand because we don't want a `png-to-ico` dep just for this.
 *
 * .ico format: ICONDIR (6 bytes) + N × ICONDIRENTRY (16 bytes) + PNG payloads.
 */
async function makeFavicon(filename) {
  const file = resolve(OUT, filename);
  const sizes = [16, 32, 48];
  const buffers = await Promise.all(
    sizes.map((s) =>
      sharp(SRC)
        .resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    ),
  );

  const headerSize = 6 + sizes.length * 16;
  let offset = headerSize;
  const dir = Buffer.alloc(headerSize);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // type = icon
  dir.writeUInt16LE(sizes.length, 4); // count

  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i];
    const buf = buffers[i];
    const base = 6 + i * 16;
    dir.writeUInt8(s === 256 ? 0 : s, base); // width (0 = 256)
    dir.writeUInt8(s === 256 ? 0 : s, base + 1); // height
    dir.writeUInt8(0, base + 2); // palette
    dir.writeUInt8(0, base + 3); // reserved
    dir.writeUInt16LE(1, base + 4); // colour planes
    dir.writeUInt16LE(32, base + 6); // bpp
    dir.writeUInt32LE(buf.length, base + 8); // image size
    dir.writeUInt32LE(offset, base + 12); // image offset
    offset += buf.length;
  }

  await writeFile(file, Buffer.concat([dir, ...buffers]));
  console.log(`  → ${filename} (${sizes.join(", ")} multi-res)`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(`Generating icons from ${SRC} → ${OUT}`);
  await makeAny(192, "icon-192.png");
  await makeAny(512, "icon-512.png");
  await makeMaskable(512, "icon-maskable-512.png");
  await makeAppleTouch(180, "apple-touch-icon.png");
  await makeFavicon("favicon.ico");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
