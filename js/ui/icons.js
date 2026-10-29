// Functional icons (consistent 2px rounded strokes) and a few hand-drawn
// accents. Accents are decorative and hidden from assistive tech.

import { raw } from "./html.js";

const PATHS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  undo: '<path d="M9 7L5 11l4 4"/><path d="M5 11h9a5 5 0 010 10h-2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>',
  book: '<path d="M5 4.5h9.5a3 3 0 013 3V20H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h9.5"/>',
  bookmark: '<path d="M7 4h10v16l-5-4-5 4z"/>',
  bookmarkFilled: '<path d="M7 4h10v16l-5-4-5 4z" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

export function icon(name, label) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  return raw(
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${PATHS[name]}</svg>`,
  );
}

// Hand-drawn accents. Slightly irregular paths read as drawn rather than set.
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
