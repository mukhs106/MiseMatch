// Derives the displayed recipe from the untouched source recipe plus one
// adaptation state: { servings, applied: [swapId, ...] }.
// The source recipe object is never mutated.

import { getSwap, swapSlot } from "../data/swaps.js";
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
      const at = steps.findIndex((s) => s.id === ins.after);
      const step = { id: ins.id, template: ins.text, changedBy: [swap.id], added: true };
      steps.splice(at === -1 ? steps.length : at + 1, 0, step);
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
 * Whether a swap can be added to the current adaptation.
 * @returns {{ ok: boolean, blockers: [{ swap, reason }] }}
 */
export function checkSwap(recipe, adaptation, swapId) {
  const swap = getSwap(swapId);
  if (!swap || swap.recipe !== recipe.id) {
    return { ok: false, blockers: [], unsupported: "This change isn't available for this recipe." };
  }
  const applied = adaptation.applied.map(getSwap).filter(Boolean);
  if (applied.some((s) => s.id === swapId)) return { ok: false, blockers: [], already: true };
  const blockers = [];
  const slot = swapSlot(swap);
  for (const other of applied) {
    if (slot && swapSlot(other) === slot) {
      blockers.push({ swap: other, reason: "Both change the same ingredient. Only one swap per ingredient at a time." });
      continue;
    }
    const declared = (swap.conflicts ?? []).find((c) => c.swap === other.id)
      ?? (other.conflicts ?? []).find((c) => c.swap === swap.id);
    if (declared) blockers.push({ swap: other, reason: declared.reason });
  }
  return { ok: blockers.length === 0, blockers };
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
