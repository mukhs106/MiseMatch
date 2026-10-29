// Shopping needs and the grocery list.
//
// Needs = adapted, scaled quantities minus what's in the pantry. Pantry amounts
// are allocated once across the recipes on the list, in list order, so two
// recipes never subtract the same amount.
// The list keeps, per line, how much each recipe contributed (`sources`), so a
// recipe can be regenerated without touching manual items or other recipes.
// A user edit (`override`) is never silently replaced: if the recipe's amount
// changes underneath it, the line is flagged with a conflict instead.

import { ITEMS } from "../data/items.js";
import { convert, unitFamily, baseUnit, formatQty, compatible } from "./units.js";

const EPS = 0.01;

export function itemKey(item, unit) {
  return `${item}|${unitFamily(unit)}`;
}

/** One recipe's requirements, merged per item and unit family. */
function requirements(derived) {
  const required = new Map();
  for (const line of derived.ingredients) {
    for (const e of line.entries) {
      const item = ITEMS[e.item];
      if (!item || item.noShop) continue;
      const key = itemKey(e.item, e.unit);
      const prev = required.get(key);
      if (prev) prev.qty += convert(e.qty, e.unit, prev.unit);
      else required.set(key, { key, item: e.item, name: item.name, qty: e.qty, unit: e.unit, aisle: item.aisle, step: e.step });
    }
  }
  return [...required.values()];
}

/**
 * @param entries  [{ id, derived }] in list order
 * @param pantry   { [itemId]: { qty?, unit?, some? } } (see core/pantry.js)
 * @returns Map(id -> [{ key, item, name, qty, unit, aisle, note, uncertain }])
 */
export function allocateNeeds(entries, pantry = {}) {
  const left = new Map(); // item -> { qty, unit } of the pantry amount not yet used
  const out = new Map();
  for (const { id, derived } of entries) {
    const needs = [];
    for (const req of requirements(derived)) {
      const have = pantry[req.item];
      if (!have || have.free) {
        needs.push(req);
        continue;
      }
      if (have.qty == null) {
        // Have it, amount unknown: nothing to buy. "Some" without an amount stays on the list, flagged.
        if (have.some) needs.push({ ...req, uncertain: true, note: "You have some, but no amount is entered. Check before buying." });
        continue;
      }
      if (!left.has(req.item)) left.set(req.item, { qty: have.qty, unit: have.unit });
      const pool = left.get(req.item);
      const available = convert(pool.qty, pool.unit, req.unit);
      if (available == null) {
        // Not comparable: treat as amount unknown and flag; never subtract.
        needs.push({ ...req, uncertain: true, note: `Your pantry has ${formatQty(have.qty, have.unit)}, which can't be compared with ${req.unit || "a count"}. Check before buying.` });
        continue;
      }
      const use = Math.min(Math.max(available, 0), req.qty);
      pool.qty -= convert(use, req.unit, pool.unit);
      const rest = req.qty - use;
      if (rest <= EPS) continue;
      needs.push({ ...req, qty: rest, note: use > EPS ? `After ${formatQty(use, req.unit)} from your pantry` : "Your pantry amount is used by a recipe earlier on the list" });
    }
    out.set(id, needs);
  }
  return out;
}

/** Needs for one recipe on its own (as if it were the only recipe on the list). */
export function needsFor(derived, pantry = {}) {
  return allocateNeeds([{ id: "_", derived }], pantry).get("_");
}

/** A stable fingerprint of needs, used to tell whether the list is out of date. */
export function needsSignature(needs) {
  return needs
    .map((n) => `${n.key}:${formatQty(n.qty, n.unit, n.step)}${n.uncertain ? "?" : ""}`)
    .sort()
    .join(",");
}

export function emptyList() {
  return { lines: [], dismissed: {}, synced: {}, nextId: 1 };
}

/** Quantity of a line as computed from its recipe sources. */
export function computedQty(line) {
  const sources = Object.values(line.sources ?? {});
  if (!sources.length) return null;
  const units = new Set(sources.map((s) => s.unit));
  const unit = units.size === 1 ? sources[0].unit : baseUnit(sources[0].unit);
  const qty = sources.reduce((sum, s) => sum + convert(s.qty, s.unit, unit), 0);
  return { qty, unit, step: sources[0].step };
}

/** What the list shows: the user's override if present, else the computed amount. */
export function displayQty(line) {
  if (line.manual) return line.qtyText ?? "";
  const q = line.override ?? computedQty(line);
  if (!q) return "";
  return formatShopQty(q.qty, q.unit, q.step);
}

/** Shopping rounds counts up: you can't buy half a lemon. */
export function formatShopQty(qty, unit, step) {
  if (unitFamily(unit).startsWith("count:")) return formatQty(Math.ceil(qty - EPS), unit, 1);
  return formatQty(qty, unit, step);
}

function sameQty(a, b) {
  if (!a || !b) return !a && !b;
  const conv = convert(b.qty, b.unit, a.unit);
  return conv != null && formatShopQty(a.qty, a.unit, a.step) === formatShopQty(conv, a.unit, a.step);
}

/**
 * Regenerate one recipe's contribution to the list.
 * @returns {{ list, report: { added, updated, removed, conflicts, stillDismissed } }}
 */
export function syncRecipe(list, recipe, needs) {
  const next = structuredClone(list);
  const report = { added: 0, updated: 0, removed: 0, conflicts: 0, stillDismissed: [] };
  const byKey = new Map(needs.map((n) => [n.key, n]));
  const dismissed = next.dismissed[recipe.id] ?? {};

  for (const line of next.lines) {
    if (line.manual) continue;
    const had = line.sources[recipe.id];
    const need = byKey.get(line.key);
    if (!had && !need) continue;
    const before = computedQty(line);
    if (need) {
      line.sources[recipe.id] = { qty: need.qty, unit: need.unit, step: need.step, title: recipe.title, uncertain: !!need.uncertain };
      byKey.delete(line.key);
    } else {
      delete line.sources[recipe.id];
    }
    const after = computedQty(line);
    if (sameQty(before, after)) continue;
    report.updated++;
    if (!after) {
      if (line.override || line.checked) {
        line.conflict = { type: "orphan" };
        report.conflicts++;
      } else {
        line.remove = true;
        report.removed++;
      }
    } else if (line.override || line.checked) {
      line.conflict = { type: "changed", previous: before, current: after };
      report.conflicts++;
    }
  }
  next.lines = next.lines.filter((l) => !l.remove);

  for (const need of byKey.values()) {
    if (dismissed[need.key]) {
      report.stillDismissed.push(need);
      continue;
    }
    next.lines.push({
      id: `l${next.nextId++}`,
      key: need.key,
      item: need.item,
      name: need.name,
      aisle: need.aisle,
      sources: { [recipe.id]: { qty: need.qty, unit: need.unit, step: need.step, title: recipe.title, uncertain: !!need.uncertain } },
      override: null,
      checked: false,
      conflict: null,
    });
    report.added++;
  }
  next.synced[recipe.id] = needsSignature(needs);
  return { list: next, report };
}

/** Take a recipe out of the list entirely (its contributions and memory). */
export function unsyncRecipe(list, recipe) {
  const { list: next } = syncRecipe(list, recipe, []);
  delete next.synced[recipe.id];
  delete next.dismissed[recipe.id];
  return next;
}

export function setOverride(list, lineId, qty) {
  const next = structuredClone(list);
  const line = next.lines.find((l) => l.id === lineId);
  if (!line) return list;
  if (line.manual) {
    line.qtyText = String(qty);
    return next;
  }
  const computed = computedQty(line);
  const num = Number(qty);
  if (!computed || !Number.isFinite(num) || num < 0) return list;
  line.override = Math.abs(num - computed.qty) < EPS ? null : { qty: num, unit: computed.unit };
  line.conflict = null;
  return next;
}

export function toggleChecked(list, lineId) {
  const next = structuredClone(list);
  const line = next.lines.find((l) => l.id === lineId);
  if (line) line.checked = !line.checked;
  return next;
}

/** Delete a line. Generated lines are remembered so regeneration doesn't re-add them silently. */
export function deleteLine(list, lineId) {
  const next = structuredClone(list);
  const line = next.lines.find((l) => l.id === lineId);
  if (!line) return list;
  for (const recipeId of Object.keys(line.sources ?? {})) {
    next.dismissed[recipeId] = { ...(next.dismissed[recipeId] ?? {}), [line.key]: true };
  }
  next.lines = next.lines.filter((l) => l.id !== lineId);
  return next;
}

export function addManual(list, name, qtyText = "") {
  const clean = name.trim();
  if (!clean) return list;
  const next = structuredClone(list);
  next.lines.push({ id: `l${next.nextId++}`, manual: true, name: clean, qtyText: qtyText.trim(), aisle: "Added by you", checked: false });
  return next;
}

export function renameManual(list, lineId, name) {
  const next = structuredClone(list);
  const line = next.lines.find((l) => l.id === lineId && l.manual);
  if (line && name.trim()) line.name = name.trim();
  return next;
}

/** choice: "recipe" uses the recipe's amount, "mine" keeps the edit, "remove" drops an orphan. */
export function resolveConflict(list, lineId, choice) {
  const next = structuredClone(list);
  const line = next.lines.find((l) => l.id === lineId);
  if (!line) return list;
  if (choice === "remove") {
    next.lines = next.lines.filter((l) => l.id !== lineId);
    return next;
  }
  if (choice === "recipe") {
    line.override = null;
    line.checked = false;
  }
  line.conflict = null;
  return next;
}

/** Un-dismiss a recipe's item so the next sync adds it again. */
export function undismiss(list, recipeId, key) {
  const next = structuredClone(list);
  if (next.dismissed[recipeId]) delete next.dismissed[recipeId][key];
  return next;
}

/** Clearing bought items works like deleting them, so a later regenerate won't re-add them silently. */
export function clearChecked(list) {
  return list.lines.filter((l) => l.checked).reduce((acc, l) => deleteLine(acc, l.id), list);
}

export function isListCurrent(list, recipeId, needs) {
  return list.synced[recipeId] === needsSignature(needs);
}

export { compatible };
