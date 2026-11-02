// Derives the displayed recipe from the untouched source recipe plus one
// adaptation state: { servings, applied: [swapId, ...] }.
// The source recipe object is never mutated.

import { getSwap } from "../data/swaps.js";
import { comboStatus } from "./engine.js";
import { ITEMS, shortName } from "../data/items.js";
import { formatQty, isApproximated } from "./units.js";

export function defaultAdaptation(recipe) {
  return { servings: recipe.servings, applied: [] };
}

/** Portions a dish is written to scale across. Outside it, the result isn't derived as supported. */
export function servingsBounds(recipe) {
  return recipe?.servingsRange ?? [1, 12];
}

function scaleFactor(scaling, factor) {
  // Pan-based fat doesn't need to double when the food does. Only within the
  // dish's authored range, with its pan note shown beside the amount.
  if (scaling === "pan") return 1 + (factor - 1) * 0.5;
  // Evaporation follows the pan, not the amount of food, so water moves more slowly than food.
  if (scaling === "liquid") return 1 + (factor - 1) * 0.75;
  if (scaling === "fixed") return 1;
  return factor;
}

/**
 * @returns {{ servings, factor, ingredients: Line[], steps: Step[], applied: Swap[], cautions: string[] }}
 * Line: { slot, group, scaling, entries: [{item, qty, unit, prep, step}], original, changedBy: [swapId], addedBy, omitted }
 */
export function deriveRecipe(recipe, adaptation) {
  const state = adaptation ?? defaultAdaptation(recipe);
  const factor = state.servings / recipe.servings;
  const applied = state.applied.map(getSwap).filter((s) => s && s.recipe === recipe.id);

  const lines = recipe.ingredients.map((ing) => ({
    slot: ing.slot,
    group: ing.group,
    scaling: ing.scaling ?? "linear",
    optional: !!ing.optional,
    entries: [{ item: ing.item, qty: ing.qty, unit: ing.unit, prep: ing.prep, step: ing.step, optional: !!ing.optional }],
    original: ing,
    changedBy: [],
    addedBy: null,
    omitted: false,
  }));
  const bySlot = new Map(lines.map((l) => [l.slot, l]));

  // Replacements, omissions and additions first, then quantity adjustments,
  // so an adjustment always applies to whatever currently fills the slot.
  for (const swap of applied) {
    if (swap.replace) {
      const line = bySlot.get(swap.replace.slot);
      line.entries = swap.replace.with.map((w) => ({ ...w, optional: line.optional }));
      line.changedBy.push(swap.id);
    }
    if (swap.omit) {
      const line = bySlot.get(swap.omit);
      line.entries = [];
      line.omitted = true;
      line.changedBy.push(swap.id);
    }
    for (const add of swap.add ?? []) {
      const line = {
        slot: add.item,
        group: add.group ?? "main",
        scaling: "linear",
        optional: !!add.optional,
        entries: [{ item: add.item, qty: add.qty, unit: add.unit, prep: add.prep, step: add.step, optional: !!add.optional }],
        original: null,
        changedBy: [swap.id],
        addedBy: swap.id,
        omitted: false,
      };
      lines.push(line);
      bySlot.set(line.slot, line);
    }
  }
  for (const swap of applied) {
    for (const adj of swap.adjust ?? []) {
      const line = bySlot.get(adj.slot);
      if (!line) continue;
      line.entries = line.entries.map((e) => ({ ...e, qty: e.qty * adj.factor }));
      line.changedBy.push(swap.id);
    }
  }
  for (const line of lines) {
    const f = scaleFactor(line.scaling, factor);
    line.entries = line.entries.map((e) => ({ ...e, qty: e.qty * f }));
  }

  // Steps: start from the source, apply edits in order (later swaps win), then insertions.
  let steps = recipe.steps.map((s) => ({ id: s.id, template: s.text, changedBy: [], added: false }));
  for (const swap of applied) {
    for (const [id, text] of Object.entries(swap.steps ?? {})) {
      const step = steps.find((s) => s.id === id);
      if (!step) continue;
      step.template = text;
      step.changedBy.push(swap.id);
    }
    for (const ins of swap.addSteps ?? []) {
      const step = { id: ins.id, template: ins.text, changedBy: [swap.id], added: true };
      const at = ins.after === "start" ? -1 : steps.findIndex((s) => s.id === ins.after);
      steps.splice(ins.after === "start" ? 0 : at === -1 ? steps.length : at + 1, 0, step);
    }
  }
  const method = {};
  for (const [key, def] of Object.entries(recipe.methodQty ?? {})) {
    method[key] = { qty: def.qty * scaleFactor(def.scaling ?? "linear", factor), unit: def.unit, step: def.step, scaling: def.scaling ?? "linear" };
  }
  steps = steps.map((s) => ({ ...s, text: renderTemplate(s.template, bySlot, method) }));

  return {
    recipe,
    servings: state.servings,
    factor,
    ingredients: lines,
    steps,
    method,
    applied,
    cautions: applied.filter((s) => s.caution).map((s) => s.caution),
  };
}

function renderTemplate(text, bySlot, method) {
  return text
    .replace(/\{=([\w-]+)\}/g, (_, key) => (method[key] ? formatQty(method[key].qty, method[key].unit, method[key].step) : "some"))
    .replace(/\{([\w-]+)\}/g, (_, key) => {
      const line = bySlot.get(key);
      if (!line) return key;
      if (line.omitted || !line.entries.length) return "(left out)";
      return `${line.entries.map((e) => shortName(e.item)).join(" and ")}${line.optional ? " (optional)" : ""}`;
    });
}

const SHARE_WORD = { 1: "all of", 2: "half of", 3: "a third of", 4: "a quarter of", 5: "a fifth of", 6: "a sixth of", 8: "an eighth of", 10: "a tenth of" };

/** What one serving is at the active portions, from the same state as the ingredients. */
export function servingDescription(derived) {
  const def = derived.recipe?.servingDef;
  if (!def) return "";
  if (def.fixed) return def.fixed;
  const n = derived.servings;
  const parts = [`${SHARE_WORD[n] ?? `1/${n} of`} ${def.of}`];
  const side = def.side && derived.ingredients.find((l) => l.slot === def.side.slot);
  if (side && !side.omitted && side.entries.length) {
    const e = side.entries[0];
    parts.push(`${formatQty(e.qty / n, e.unit, e.step)} ${def.side.label}`);
  }
  return parts.join(" with ");
}

/** Effect text with {q:slot} and {n} rendered from the active state, so it never mixes serving bases. */
export function renderEffect(text, derived) {
  if (!derived) return text.replace(/\{q:[\w-]+\} ?|\{n\}/g, "");
  const n = derived.servings;
  return text
    .replace(/\{n\}/g, `${n} ${n === 1 ? "serving" : "servings"}`)
    .replace(/\{q:([\w-]+)\}/g, (_, slot) => {
      const line = derived.ingredients.find((l) => l.slot === slot);
      if (!line || !line.entries.length) return "The amount";
      return line.entries.map((e) => formatQty(e.qty, e.unit, e.step)).join(" + ");
    });
}

/**
 * Plain notes for what does not scale in step with the food. Empty at the
 * written yield. Names the practical amount of each pan-scaled fat.
 */
export function scalingNotes(derived) {
  const recipe = derived.recipe;
  if (!recipe || derived.servings === recipe.servings) return [];
  const notes = [];
  const pan = derived.ingredients.filter((l) => l.scaling === "pan" && l.entries.length);
  if (pan.length) {
    const amounts = pan.flatMap((l) => l.entries.map((e) => `${formatQty(e.qty, e.unit, e.step)} ${shortName(e.item)}`)).join(", ");
    notes.push({ kind: "pan", text: `${amounts}. ${recipe.panNote ?? "Fat in the pan scales at half rate."}` });
  }
  if (derived.ingredients.some((l) => l.scaling === "liquid") || Object.values(derived.method ?? {}).some((m) => m.scaling === "liquid")) {
    notes.push({ kind: "liquid", text: "Water and simmering liquid scale at about three-quarter rate, because evaporation follows the pan and not the food. Adjust by eye." });
  }
  notes.push({ kind: "time", text: `Cooking times are for the written ${recipe.servings} servings and aren't scaled. Go by the cues in each step.` });
  if (derived.ingredients.some((l) => l.scaling === "taste")) notes.push({ kind: "taste", text: "Spices and salt are scaled as a starting point. Season to taste." });
  return notes;
}

/** Ingredients whose measurable amount differs noticeably from the exact derived amount. */
export function approximations(derived) {
  return derived.ingredients.flatMap((l) => l.entries.filter((e) => e.qty != null && isApproximated(e.qty, e.unit, e.step)).map((e) => ITEMS[e.item]?.name ?? e.item));
}

/**
 * Whether a rule can be added to the current adaptation.
 * blockers: applied rules it can't be combined with (declared conflict or same ingredient).
 * untested: applied rules it has never been written to combine with. Allowed only
 * with an explicit "try it untested" choice, and labelled as such everywhere.
 * @returns {{ ok: boolean, blockers: [{ swap, reason }], untested: Swap[] }}
 */
export function checkSwap(recipe, adaptation, swapId) {
  const swap = getSwap(swapId);
  if (!swap || swap.recipe !== recipe.id) {
    return { ok: false, blockers: [], untested: [], unsupported: "This change isn't available for this recipe." };
  }
  if (adaptation.applied.includes(swapId)) return { ok: false, blockers: [], untested: [], already: true };
  const blockers = [];
  const untested = [];
  const whole = comboStatus(recipe.id, [...adaptation.applied, swapId]);
  for (const otherId of adaptation.applied) {
    const other = getSwap(otherId);
    if (!other) continue;
    const pair = comboStatus(recipe.id, [otherId, swapId]);
    if (pair.blocked.length) blockers.push({ swap: other, reason: pair.blocked[0].reason });
    else if (pair.untested.length) untested.push(other);
  }
  return { ok: blockers.length === 0, blockers, untested: untested.filter((u) => !blockers.some((b) => b.swap.id === u.id)), wholeSetUntested: !!whole.wholeSetUntested };
}

/** Apply a swap, optionally removing named blockers first. Returns a new state. */
export function applySwap(adaptation, swapId, removeIds = []) {
  const applied = adaptation.applied.filter((id) => !removeIds.includes(id) && id !== swapId);
  return { ...adaptation, applied: [...applied, swapId] };
}

export function removeSwap(adaptation, swapId) {
  return { ...adaptation, applied: adaptation.applied.filter((id) => id !== swapId) };
}

export function setServings(adaptation, servings, recipe = null) {
  const [min, max] = servingsBounds(recipe);
  const n = Math.min(max, Math.max(min, Math.round(servings)));
  return { ...adaptation, servings: n };
}

export function isAdapted(recipe, adaptation) {
  if (!adaptation) return false;
  return adaptation.servings !== recipe.servings || adaptation.applied.length > 0;
}
