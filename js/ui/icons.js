// Functional icons and a few hand-drawn accents. Accents are decorative and
// hidden from assistive tech.

import { raw } from "./html.js";

// Placeholder icons: plain black SVG files in assets/icons/, all shown at one
// size (20px). Replace a file with a drawing of the same name to restyle it.
export function icon(name, label) {
  return raw(
    `<img class="icon" src="assets/icons/${name}.svg" width="20" height="20" alt="${label ?? ""}"${label ? "" : ' aria-hidden="true"'}>`,
  );
}

export const doodle = {
  squiggle: raw(
    '<svg class="doodle" viewBox="0 0 120 14" width="120" height="14" aria-hidden="true" focusable="false"><path d="M2 9c8-6 14-6 20 0s13 5 19-1 14-6 20 0 13 6 19 0 14-5 20 1 12 4 18-1" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  ),
  arrow: raw(
    '<svg class="doodle" viewBox="0 0 48 24" width="40" height="20" aria-hidden="true" focusable="false"><path d="M3 13c9-4 21-5 38-1M33 5c3 3 6 5 9 7-3 2-6 5-8 8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ),
  pot: raw(
    '<svg class="doodle" viewBox="0 0 120 96" width="120" height="96" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 44c26-3 58-3 84 1-1 20-6 37-14 42-17 4-39 4-56-1-8-6-13-22-14-42z"/><path d="M8 47c4-2 7-2 10-2M102 46c4 0 7 1 10 3"/><path d="M50 32c-3-7 4-10 1-18M62 30c-3-6 3-9 0-15M73 33c-2-6 3-8 1-13"/></g><circle cx="44" cy="62" r="4" fill="#febd02"/><circle cx="68" cy="68" r="5" fill="#a0b9c4"/></svg>',
  ),
  spark: raw(
    '<svg class="doodle" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v5M4.5 7.5l3.5 3M19.5 7.5l-3.5 3M7 17h-4M21 17h-4"/></g></svg>',
  ),
};
