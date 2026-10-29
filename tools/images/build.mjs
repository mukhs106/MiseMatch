// Builds web variants of the reviewed photos in assets/images.
//
//   node build.mjs
//
// Reads assets/images/manifest.json and, for every entry that is not excluded and
// not a near-duplicate of a kept file, writes resized copies into assets/img:
// WebP plus a JPEG fallback for photos, WebP with alpha for cutouts, at 480, 960
// and 1440 px wide, named <cleanName>-<width>.<ext>. Originals are only read.
// Creator and copyright fields found in an original are written back into its
// variants; everything else (camera data, GPS, XMP) is stripped.
// Also writes assets/img/variants.json and prints the size savings.

import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const srcDir = join(repo, "assets/images");
const outDir = join(repo, "assets/img");
const WIDTHS = [480, 960, 1440];

const manifest = JSON.parse(readFileSync(join(srcDir, "manifest.json"), "utf8"));
const todo = manifest.images.filter((e) => e.status !== "excluded" && !e.nearDuplicateOf && e.cleanName);
mkdirSync(outDir, { recursive: true });

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const pct = (a, b) => `${(100 - (b / a) * 100).toFixed(1)}%`;

const variants = {};
let totalOriginal = 0;
let totalLargest = 0;
let totalAll = 0;
const rows = [];

for (const e of todo) {
  const src = join(srcDir, e.file);
  const ifd0 = {};
  if (e.metadata.creator) ifd0.Artist = e.metadata.creator;
  if (e.metadata.copyright) ifd0.Copyright = e.metadata.copyright;
  const files = [];
  for (const w of WIDTHS) {
    const base = () => {
      const img = sharp(src).rotate().resize({ width: w, withoutEnlargement: true });
      return Object.keys(ifd0).length ? img.withExif({ IFD0: ifd0 }) : img;
    };
    const webp = join(outDir, `${e.cleanName}-${w}.webp`);
    const info = await base().webp(e.alpha ? { quality: 78, alphaQuality: 90, effort: 5 } : { quality: 72, effort: 5 }).toFile(webp);
    files.push({ width: info.width, height: info.height, format: "webp", file: `assets/img/${e.cleanName}-${w}.webp`, bytes: statSync(webp).size });
    if (!e.alpha) {
      const jpg = join(outDir, `${e.cleanName}-${w}.jpg`);
      await base().jpeg({ quality: 74, progressive: true, mozjpeg: true }).toFile(jpg);
      files.push({ width: info.width, height: info.height, format: "jpeg", file: `assets/img/${e.cleanName}-${w}.jpg`, bytes: statSync(jpg).size });
    }
  }
  const largestWebp = files.filter((f) => f.format === "webp").at(-1).bytes;
  const all = files.reduce((s, f) => s + f.bytes, 0);
  totalOriginal += e.bytes;
  totalLargest += largestWebp;
  totalAll += all;
  variants[e.cleanName] = { source: e.file, alpha: e.alpha, files };
  rows.push([e.cleanName, mb(e.bytes), kb(largestWebp), pct(e.bytes, largestWebp), kb(all)]);
}

writeFileSync(join(outDir, "variants.json"), `${JSON.stringify({ generated: "tools/images/build.mjs", widths: WIDTHS, variants }, null, 2)}\n`);

const head = ["image", "original", "1440 webp", "saved", "all variants"];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (r) => r.map((c, i) => c.padEnd(widths[i])).join("  ");
console.log(line(head));
for (const r of rows) console.log(line(r));
console.log(`\n${todo.length} originals: ${mb(totalOriginal)}`);
console.log(`Largest WebP of each: ${mb(totalLargest)} (${pct(totalOriginal, totalLargest)} smaller)`);
console.log(`Every variant (3 widths, WebP + JPEG fallback): ${mb(totalAll)} (${pct(totalOriginal, totalAll)} smaller)`);
