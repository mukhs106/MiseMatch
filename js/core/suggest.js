// "What can I cook?": recipe suggestions that say why they're relevant.
// Each recipe is represented by its best eligible supported version under the
// person's constraints (core/engine.js), so a suggestion never breaks a hard
// requirement. Reasons are concrete: which of your ingredients it uses, how
// many things you'd buy, and whether it reaches a target you set.

import { ITEMS, shortName } from "../data/items.js";
import { swapsForRecipe } from "../data/swaps.js";
import { candidates } from "./engine.js";
import { isOut } from "./pantry.js";

// In the pantry and not marked as out (any amount, or amount unknown). Free-text items never match.
const onHand = (pantry, item) => pantry[item] != null && !pantry[item].free && !isOut(pantry[item]);

/** Key ingredients: the main things you'd shop for, not spices or staples. */
export function keyLines(recipe) {
  return recipe.ingredients.filter((i) => ITEMS[i.item]?.key && (i.group === "main" || i.group === "serve"));
}

/**
 * @param focus  item ids the person wants to use up (optional)
 * @returns [{ recipe, option, uses: string[], focusUsed: string[], purchases, reasons: string[], targetStatus }]
 */
export function suggest(recipes, pantry, constraints, { focus = [], servings = null } = {}) {
  const out = [];
  for (const recipe of recipes) {
    if (recipe.course === "drink" && !focus.length) continue;
    const g = candidates(recipe, servings ?? recipe.servings, constraints, pantry);
    if (!g.eligible.length) continue;
    // Prefer the version that buys least among those that reach the targets as well as the best one does.
    const top = g.eligible[0].targetStatus;
    const option = g.eligible.filter((c) => c.targetStatus === top).sort((a, b) => a.ev.purchases - b.ev.purchases || a.applied.length - b.applied.length)[0];
    const items = new Set(option.ev.derived.ingredients.flatMap((l) => l.entries.map((e) => e.item)));
    const uses = [...items].filter((id) => ITEMS[id]?.key && onHand(pantry, id));
    const focusUsed = focus.filter((id) => items.has(id));
    if (focus.length && !focusUsed.length) continue;
    const reasons = [];
    if (focusUsed.length) reasons.push(`Uses your ${focusUsed.map(shortName).join(" and ")}`);
    else if (uses.length) reasons.push(`Uses your ${uses.slice(0, 2).map(shortName).join(" and ")}${uses.length > 2 ? ` and ${uses.length - 2} more` : ""}`);
    reasons.push(option.ev.purchases ? `${option.ev.purchases} ${option.ev.purchases === 1 ? "thing" : "things"} to buy` : "Nothing to buy");
    if (option.kind !== "original") reasons.push(`With: ${option.label.charAt(0).toLowerCase()}${option.label.slice(1)}`);
    for (const [n, t] of Object.entries(option.ev.targets)) {
      if (t.status === "meets") reasons.push(`Likely reaches your ${n} target`);
      else if (t.status === "maybe") reasons.push(`May reach your ${n} target`);
    }
    out.push({ recipe, option, uses, focusUsed, purchases: option.ev.purchases, reasons, targetStatus: option.targetStatus });
  }
  return out.sort((a, b) => b.focusUsed.length - a.focusUsed.length || a.purchases - b.purchases || b.uses.length - a.uses.length);
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
