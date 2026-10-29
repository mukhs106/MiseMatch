// Pantry-based suggestions: which recipes you can make now, or with a
// supported swap, from what you've marked as on hand.

import { ITEMS } from "../data/items.js";
import { swapsForRecipe } from "../data/swaps.js";

// On hand for a recipe: shared presence, or a partial amount entered in that recipe.
const onHand = (pantry, partial, item) => pantry[item]?.status === "have" || partial[item] != null;

/** Key ingredients: the main things you'd shop for, not spices or staples. */
export function keyLines(recipe) {
  return recipe.ingredients.filter((i) => ITEMS[i.item]?.key && (i.group === "main" || i.group === "serve"));
}

/**
 * @returns [{ recipe, have, total, missing: [{ slot, item, fix }], ready }]
 * `fix` is a supported "missing" swap whose replacement is on hand, if one exists.
 */
export function suggest(recipes, pantry, adaptations = {}) {
  const results = [];
  for (const recipe of recipes) {
    const partial = adaptations[recipe.id]?.partial ?? {};
    const lines = keyLines(recipe);
    const swaps = swapsForRecipe(recipe.id).filter((s) => s.reasons.includes("missing"));
    let have = 0;
    const missing = [];
    for (const line of lines) {
      if (onHand(pantry, partial, line.item)) {
        have++;
        continue;
      }
      const fix = swaps.find((s) =>
        (s.replace?.slot === line.slot && s.replace.with.every((w) => onHand(pantry, partial, w.item)))
        || s.omit === line.slot);
      missing.push({ slot: line.slot, item: line.item, fix: fix ?? null });
    }
    const unresolved = missing.filter((m) => !m.fix).length;
    results.push({ recipe, have, total: lines.length, missing, ready: unresolved === 0, unresolved });
  }
  return results
    .filter((r) => r.have > 0)
    .sort((a, b) => a.unresolved - b.unresolved || b.have / b.total - a.have / a.total);
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
