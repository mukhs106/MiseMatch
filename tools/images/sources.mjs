// Writes docs/image-sources.md from assets/images/manifest.json.
//
//   node sources.mjs
//
// Edit the manifest (source URL, license, status), then rerun this; never edit the doc by hand.

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const manifest = JSON.parse(readFileSync(join(repo, "assets/images/manifest.json"), "utf8"));
const images = manifest.images;

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const credit = (e) => {
  const parts = [];
  if (e.metadata.creator) parts.push(`Creator: ${e.metadata.creator}`);
  if (e.metadata.copyright) parts.push(`Copyright: ${e.metadata.copyright}`);
  return parts.length ? parts.join("; ") : "Unknown (no creator or copyright in the file)";
};
const used = (e) => ({
  "recipe:chana-masala": "Chana masala card and recipe hero",
  "brand:recipes": "Recipes screen, supporting image",
  "header:pantry": "Pantry screen, supporting image",
  held: "Held for a future matching recipe",
  "near-duplicate": `Not processed; near-duplicate of ${e.nearDuplicateOf}`,
  excluded: "Never used",
})[e.use] ?? e.use;

const count = (s) => images.filter((e) => e.status === s).length;
const rows = images.map((e) => `| \`${e.file.trim() === e.file ? e.file : `"${e.file}"`}\` | ${e.cleanName ? `\`${e.cleanName}\`` : "none"} | ${cell(e.shows)} | **${e.status}** | ${cell(credit(e))} | ${e.sourceUrl ? `<${e.sourceUrl}>` : "Unknown"} | ${cell(e.license || "Unknown")} | ${cell(used(e))} |`);

const doc = `# Image sources

Generated from \`assets/images/manifest.json\` by \`tools/images/sources.mjs\`. Do not edit by hand: update the manifest and rerun.

Reviewed ${manifest.reviewed}. Every file was opened and looked at; "Shows" describes the picture, not the filename. Credits are whatever the file's embedded metadata says, which proves nothing about who owns it.

Status: ${count("cleared")} cleared, ${count("unverified")} unverified, ${count("excluded")} excluded.

- **cleared**: source and license confirmed by the owner. Safe to publish with the credit shown.
- **unverified**: no confirmed source or license. Fine for local work, **not for publishing**: do not push variants of unverified images to the public site.
- **excluded**: never used and never processed.

The originals in \`assets/images/\` are git-ignored and are never edited, renamed, moved or deleted. Web variants live in \`assets/img/\` (\`tools/images/build.mjs\`).

| Original | Variant name | Shows | Status | Credit (from metadata) | Source | License | Used for |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}

## To clear an image

1. Find where it came from and record the page URL in \`sourceUrl\` and the license in \`license\` (for example "Pexels License" or "Unsplash License", or "written permission from <name>, <date>").
2. Check that the credit in the manifest matches the source page.
3. Set \`status\` to \`cleared\` and rerun \`node sources.mjs\` in \`tools/images\`.
`;

writeFileSync(join(repo, "docs/image-sources.md"), doc);
console.log(`docs/image-sources.md: ${images.length} images`);
