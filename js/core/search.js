// One alias-aware ingredient search, used by the pantry, import repair and recipe
// search, so a regional name finds the same ingredient on every screen.
// Handles case, diacritics and singular/plural. A name that could mean several
// items (chana, dal, rice) returns every candidate and is never an exact match.

import { ITEMS, AMBIGUOUS } from "../data/items.js";

export function normalizeTerm(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const singular = (w) => (w.length > 3 ? w.replace(/ies$/, "y").replace(/oes$/, "o").replace(/([^s])s$/, "$1") : w);
const stem = (text) => normalizeTerm(text).split(" ").map(singular).join(" ");

const INDEX = (() => {
  const out = [];
  for (const [id, it] of Object.entries(ITEMS)) {
    for (const term of [it.name, it.short, ...(it.aliases ?? [])]) {
      if (term) out.push({ id, term, stem: stem(term) });
    }
  }
  return out;
})();

/**
 * @returns [{ id, via, exact }] best first. `via` is the alias that matched when
 *   it isn't the display name, so "palak" can say why it found fresh spinach.
 */
export function searchIngredients(query, { limit = 8, shoppable = true } = {}) {
  const q = stem(query);
  if (!q) return [];
  const best = new Map();
  const ambiguous = AMBIGUOUS[normalizeTerm(query)]?.candidates ?? [];
  for (const e of INDEX) {
    if (shoppable && ITEMS[e.id].noShop) continue;
    const at = e.stem.indexOf(q);
    if (at < 0) continue;
    const exact = e.stem === q;
    const score = (exact ? 0 : at === 0 ? 1 : 2) * 100 + at;
    const prev = best.get(e.id);
    if (!prev || score < prev.score) best.set(e.id, { id: e.id, via: e.term === ITEMS[e.id].name ? null : e.term, exact, score });
  }
  for (const id of ambiguous) {
    if (shoppable && ITEMS[id]?.noShop) continue;
    if (!best.has(id)) best.set(id, { id, via: normalizeTerm(query), exact: false, score: 50 });
    else best.get(id).exact = false;
  }
  return [...best.values()]
    .sort((a, b) => a.score - b.score || ITEMS[a.id].name.localeCompare(ITEMS[b.id].name))
    .slice(0, limit);
}

/** The one item this text names exactly, or null. Enter only adds on an unambiguous exact match. */
export function exactIngredient(query) {
  if (AMBIGUOUS[normalizeTerm(query)]) return null;
  const hits = searchIngredients(query, { limit: 50 }).filter((h) => h.exact);
  return hits.length === 1 ? hits[0].id : null;
}
