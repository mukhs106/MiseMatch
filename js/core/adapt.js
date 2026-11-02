// Derives the displayed recipe from the untouched source recipe plus one
// adaptation state: { servings, applied: [swapId, ...] }.
// The source recipe object is never mutated.

import { getSwap } from "../data/swaps.js";
import { comboStatus } from "./engine.js";
import { shortName } from "../data/items.js";

export function defaultAdaptation(recipe) {
  return { servings: recipe.servings, applied: [] };
}

function scaleFactor(scaling, factor) {
  // Pan-based fat doesn't need to double when the food does.
  if (scaling === "pan") return 1 + (factor - 1) * 0.5;
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
    entries: [{ item: ing.item, qty: ing.qty, unit: ing.unit, prep: ing.prep, step: ing.step }],
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
      line.entries = swap.replace.with.map((w) => ({ ...w }));
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
        entries: [{ item: add.item, qty: add.qty, unit: add.unit, prep: add.prep, step: add.step }],
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
  steps = steps.map((s) => ({ ...s, text: renderTemplate(s.template, bySlot) }));

  return {
    recipe,
    servings: state.servings,
    factor,
    ingredients: lines,
    steps,
    applied,
    cautions: applied.filter((s) => s.caution).map((s) => s.caution),
  };
}

function renderTemplate(text, bySlot) {
  return text.replace(/\{([\w-]+)\}/g, (_, key) => {
    const line = bySlot.get(key);
    if (!line) return key;
    if (line.omitted || !line.entries.length) return "(left out)";
    return line.entries.map((e) => shortName(e.item)).join(" and ");
  });
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
  for (const otherId of adaptation.applied) {
    const other = getSwap(otherId);
    if (!other) continue;
    const pair = comboStatus(recipe.id, [otherId, swapId]);
    if (pair.blocked.length) blockers.push({ swap: other, reason: pair.blocked[0].reason });
    else if (pair.untested.length) untested.push(other);
  }
  return { ok: blockers.length === 0, blockers, untested: untested.filter((u) => !blockers.some((b) => b.swap.id === u.id)) };
}

/** Apply a swap, optionally removing named blockers first. Returns a new state. */
export function applySwap(adaptation, swapId, removeIds = []) {
  const applied = adaptation.applied.filter((id) => !removeIds.includes(id) && id !== swapId);
  return { ...adaptation, applied: [...applied, swapId] };
}

export function removeSwap(adaptation, swapId) {
  return { ...adaptation, applied: adaptation.applied.filter((id) => id !== swapId) };
}

export function setServings(adaptation, servings) {
  const n = Math.min(12, Math.max(1, Math.round(servings)));
  return { ...adaptation, servings: n };
}

export function isAdapted(recipe, adaptation) {
  if (!adaptation) return false;
  return adaptation.servings !== recipe.servings || adaptation.applied.length > 0;
}
