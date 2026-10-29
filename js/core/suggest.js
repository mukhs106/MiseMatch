// "Use what you have": which recipes you can make now, or one swap away,
// from what's in the pantry.

import { ITEMS } from "../data/items.js";
import { swapsForRecipe } from "../data/swaps.js";

// In the pantry at all (any amount, or amount unknown). Free-text items never match.
const onHand = (pantry, item) => pantry[item] != null && !pantry[item].free;

/** Key ingredients: the main things you'd shop for, not spices or staples. */
export function keyLines(recipe) {
  return recipe.ingredients.filter((i) => ITEMS[i.item]?.key && (i.group === "main" || i.group === "serve"));
}

/**
 * @returns [{ recipe, have, total, missing: [{ slot, item, fix }], ready, fixes, rank }], ordered
 *          can make now, then one swap away, then the rest by how much is on hand.
 * `fix` is a supported "missing" swap whose replacement is on hand, if one exists.
 */
export function suggest(recipes, pantry) {
  const results = [];
  for (const recipe of recipes) {
    const lines = keyLines(recipe);
    const swaps = swapsForRecipe(recipe.id).filter((s) => s.reasons.includes("missing"));
    let have = 0;
    const missing = [];
    for (const line of lines) {
      if (onHand(pantry, line.item)) {
        have++;
        continue;
      }
      const fix = swaps.find((s) =>
        (s.replace?.slot === line.slot && s.replace.with.every((w) => onHand(pantry, w.item)))
        || s.omit === line.slot);
      missing.push({ slot: line.slot, item: line.item, fix: fix ?? null });
    }
    const unresolved = missing.filter((m) => !m.fix).length;
    const fixes = missing.length - unresolved;
    // 0: can make now, 1: one swap away, 2: anything else with something on hand
    const rank = unresolved > 0 ? 2 : fixes === 0 ? 0 : fixes === 1 ? 1 : 2;
    results.push({ recipe, have, total: lines.length, missing, ready: unresolved === 0, unresolved, fixes, rank });
  }
  return results
    .filter((r) => r.have > 0)
    .sort((a, b) => a.rank - b.rank || a.unresolved - b.unresolved || b.have / b.total - a.have / a.total);
}

/** Items worth offering as quick pantry chips: key items across recipes and their swaps. */
export function pantryChipItems(recipes) {
  const ids = new Set();
  for (const r of recipes) {
    for (const l of keyLines(r)) ids.add(l.item);
    for (const s of swapsForRecipe(r.id)) {
      if (!s.reasons.includes("missing")) continue;
      for (const w of s.replace?.with ?? []) if (ITEMS[w.item]?.key) ids.add(w.item);
    }
  }
  return [...ids];
}
