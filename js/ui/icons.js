// Functional icons and placeholder drawn accents, both loaded from asset files.

import { html, raw } from "./html.js";

// Placeholder icons: plain black SVG files in assets/icons/, all shown at one
// size (20px). Replace a file with a drawing of the same name to restyle it.
export function icon(name, label) {
  return raw(
    `<img class="icon" src="assets/icons/${name}.svg" width="20" height="20" alt="${label ?? ""}"${label ? "" : ' aria-hidden="true"'}>`,
  );
}

// A note to check, carried by the icon and the bold lead word, never by color.
export function checkNote(text, lead = "Check:") {
  return html`${icon("info")}<span><strong>${lead}</strong> ${text}</span>`;
}

// Drawn accents: temporary placeholders, each its own file in assets/accents/
// so the owner's drawings can replace them without code changes. Decorative only.
const accent = (name, w, h) =>
  raw(`<img class="doodle" src="assets/accents/${name}.svg" width="${w}" height="${h}" alt="" aria-hidden="true">`);

export const doodle = {
  squiggle: accent("squiggle", 120, 14),
  arrow: accent("arrow", 40, 20),
  pot: accent("pot", 120, 96),
  spark: accent("spark", 22, 22),
};
