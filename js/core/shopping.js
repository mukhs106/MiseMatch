// Shopping needs and the grocery list.
//
// Needs = adapted, scaled quantities minus what's in the pantry. Pantry amounts
// are allocated once across the recipes on the list, in list order, so two
// recipes never subtract the same amount.
// Three amounts stay separate: what a meal needs (exact), what to buy (rounded up,
// units.purchaseQty) and what was actually bought (confirmed by the person, and
// the only amount that reaches the pantry).
// The list keeps, per line, how much each recipe contributed (`sources`), so a
// recipe can be regenerated without touching manual items or other recipes.
// Reconciliation computes every contribution first, then compares each line's
// final total once. Precedence:
//   manual lines stay as typed; generated lines recalculate;
//   an edited amount or a checked line is never silently changed: a changed total
//   becomes a conflict to review, and a checked line is never unchecked by itself;
//   a line with no remaining source goes away unless edited or checked, which keeps
//   it as an orphan to review; a line already moved to the pantry is finished.

import { ITEMS } from "../data/items.js";
import { convert, unitFamily, baseUnit, formatQty, compatible, purchaseQty } from "./units.js";
import { isOut, observations } from "./pantry.js";

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
      if (prev) {
        prev.qty += convert(e.qty, e.unit, prev.unit);
        prev.optional = prev.optional && !!e.optional;
      } else required.set(key, { key, item: e.item, name: item.name, qty: e.qty, unit: e.unit, aisle: item.aisle, step: e.step, optional: !!e.optional });
    }
  }
  return [...required.values()];
}

/**
 * What an "I have enough" answer is about: this item's combined requirement across
 * the entries, plus the revision of its pantry entry. Portions, rules, plan changes
 * and stock changes all change the fingerprint, which makes earlier answers stale.
 */
export function confirmationFingerprint(item, family, total, entry, revision = 0) {
  return `${item}|${family}|${Number(total.toFixed(3))}|${JSON.stringify(entry ?? null)}|r${revision}`;
}

/** Record an answer for one fingerprint. Older fingerprints stay briefly, so going back to the same requirement doesn't ask again. */
export function recordConfirmation(confirmations, item, fingerprint, answer) {
  const prior = Object.entries(confirmations[item] ?? {}).filter(([fp]) => fp !== fingerprint).slice(-5);
  return { ...confirmations, [item]: { ...Object.fromEntries(prior), [fingerprint]: answer } };
}

/**
 * @param entries        [{ id, derived, title?, includeOptional?: string[] }] in list order (id: a planned meal)
 * @param pantry         { [itemId]: entry } (see core/pantry.js)
 * @param confirmations  { [item]: { [fingerprint]: "enough" | "buy" } } answers about the combined requirement
 * @param opts           { revisions } pantry entry revisions
 * @returns Map(id -> [{ key, item, name, qty, unit, aisle, note, uncertain, check, optional, included, unchecked, stale, fingerprint, combined }])
 *   check: you have it but no amount is entered. Not treated as enough: it needs
 *   one confirmation of the combined requirement across meals ("I have enough" or
 *   "Buy it"), which goes stale as soon as that requirement or the stock changes.
 *   optional: a garnish or extra the dish works without. Not a purchase unless included.
 *   unchecked: not in the pantry at all, so it's to check, not a known absence.
 */
export function allocateNeeds(entries, pantry = {}, confirmations = {}, { revisions = {} } = {}) {
  const left = new Map(); // item|family -> { qty, unit } of the pantry amount not yet used
  const out = new Map();
  const reqs = entries.map(({ derived }) => requirements(derived));

  // Combined requirement for stock with no amount, asked once across meals.
  const combined = new Map();
  entries.forEach((entry, i) => {
    for (const req of reqs[i]) {
      const have = pantry[req.item];
      if (!have || have.free || isOut(have) || have.qty != null) continue;
      if (req.optional && !entry.includeOptional?.includes(req.item)) continue;
      const c = combined.get(req.key) ?? { qty: 0, unit: req.unit, meals: [], step: req.step };
      c.qty += convert(req.qty, req.unit, c.unit);
      c.meals.push(entry.title ?? entry.id);
      combined.set(req.key, c);
    }
  });

  entries.forEach((entry, i) => {
    const { id } = entry;
    const needs = [];
    for (const req of reqs[i]) {
      if (req.optional && !entry.includeOptional?.includes(req.item)) {
        needs.push({ ...req, optional: true, included: false, note: "Optional. Not on your list unless you add it." });
        continue;
      }
      const base = req.optional ? { ...req, included: true } : req;
      const have = pantry[req.item];
      if (!have || have.free) {
        needs.push({ ...base, unchecked: true, note: "Not checked in your pantry yet" });
        continue;
      }
      if (isOut(have)) {
        needs.push({ ...base, note: "You marked this as out" });
        continue;
      }
      if (have.qty == null) {
        const c = combined.get(req.key);
        const fingerprint = confirmationFingerprint(req.item, unitFamily(req.unit), c.qty, have, revisions[req.item] ?? 0);
        const answers = confirmations[req.item];
        const answer = answers?.[fingerprint];
        if (answer === "enough") continue;
        if (answer === "buy") {
          needs.push({ ...base, note: "You chose to buy this" });
          continue;
        }
        const stale = !!answers && Object.keys(answers).length > 0;
        needs.push({
          ...base,
          check: true,
          stale,
          fingerprint,
          combined: { qty: c.qty, unit: c.unit, step: c.step, meals: [...new Set(c.meals)] },
          note: stale ? "What this needs, or your stock, has changed since you last answered."
            : have.some ? "You have some, but no amount is entered." : "You have this, but no amount is entered.",
        });
        continue;
      }
      if (!left.has(req.key)) {
        const family = unitFamily(req.unit);
        const comparable = observations(have).filter((o) => unitFamily(o.unit) === family);
        left.set(req.key, comparable.length
          ? { qty: comparable.reduce((sum, o) => sum + convert(o.qty, o.unit, comparable[0].unit), 0), unit: comparable[0].unit }
          : { qty: null, unit: have.unit });
      }
      const pool = left.get(req.key);
      if (pool.qty == null) {
        // Not comparable: treat as amount unknown and flag; never subtract.
        needs.push({ ...base, uncertain: true, note: `Your pantry has ${formatQty(have.qty, have.unit)}, which can't be compared with ${req.unit || "a count"}. Check before buying.` });
        continue;
      }
      const available = convert(pool.qty, pool.unit, req.unit);
      const use = Math.min(Math.max(available, 0), req.qty);
      pool.qty -= convert(use, req.unit, pool.unit);
      const rest = req.qty - use;
      if (rest <= EPS) continue;
      needs.push({ ...base, qty: rest, note: use > EPS ? `After ${formatQty(use, req.unit)} from your pantry` : "Your pantry amount is used by a meal earlier on the list" });
    }
    out.set(id, needs);
  });
  return out;
}

/** Needs for one recipe on its own (as if it were the only recipe on the list). */
export function needsFor(derived, pantry = {}) {
  return allocateNeeds([{ id: "_", derived }], pantry).get("_");
}

/** Rounded canonical amount in the base unit, so a change is seen whatever the display rounds it to. */
function canonical(qty, unit) {
  const base = baseUnit(unit);
  return Number((convert(qty, unit, base) ?? qty).toFixed(2));
}

/** A stable fingerprint of canonical values and uncertainty, used to tell whether the list is out of date. */
export function needsSignature(needs) {
  return needs
    .filter((n) => !n.optional || n.included)
    .map((n) => `${n.key}:${canonical(n.qty, n.unit)}${n.uncertain ? "?" : ""}${n.check ? "!" : ""}`)
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
  return line.override ? formatQty(q.qty, q.unit) : formatShopQty(q.qty, q.unit, q.step);
}

/** The amount to buy, as text. Rounds up: you can't buy half a lemon. */
export function formatShopQty(qty, unit, step) {
  const buy = purchaseQty(qty, unit, step);
  if (unitFamily(unit).startsWith("count:")) return formatQty(buy, unit, 1);
  return formatQty(buy, unit, step);
}

function sameQty(a, b) {
  if (!a || !b) return !a && !b;
  const conv = convert(b.qty, b.unit, a.unit);
  return conv != null && Math.abs(a.qty - conv) <= EPS;
}

function sourceFrom(need, title) {
  return { qty: need.qty, unit: need.unit, step: need.step, title, uncertain: !!need.uncertain, unchecked: !!need.unchecked };
}

/**
 * Regenerate meals' contributions together. Every new contribution is placed
 * first, then each line's final total is compared with its total before, once, so
 * two meals sharing an ingredient can't produce intermediate conflicts.
 * @param meals  [{ id, title, needs }] meals to recalculate
 * @param opts   { removed: [mealId] } meals that no longer exist
 * @returns {{ list, report: { added, updated, removed, conflicts, stillDismissed } }}
 */
export function reconcile(list, meals, { removed = [] } = {}) {
  const next = structuredClone(list);
  const report = { added: 0, updated: 0, removed: 0, conflicts: 0, stillDismissed: [] };
  const touched = new Set([...meals.map((m) => m.id), ...removed]);
  const before = new Map(next.lines.filter((l) => !l.manual && !l.transfer).map((l) => [l.id, computedQty(l)]));

  // Amounts waiting for a confirmation are asked about, and optional extras aren't purchases.
  const wanted = new Map();
  for (const meal of meals) {
    const dismissed = next.dismissed[meal.id] ?? {};
    for (const need of meal.needs) {
      if (need.check || (need.optional && !need.included)) continue;
      if (dismissed[need.key]) {
        report.stillDismissed.push(need);
        continue;
      }
      const w = wanted.get(need.key) ?? { need, sources: {} };
      w.sources[meal.id] = sourceFrom(need, meal.title);
      wanted.set(need.key, w);
    }
    next.synced[meal.id] = needsSignature(meal.needs);
  }
  for (const id of removed) {
    delete next.synced[id];
    delete next.dismissed[id];
  }

  for (const line of next.lines) {
    if (line.manual || line.transfer) continue;
    const kept = Object.fromEntries(Object.entries(line.sources).filter(([id]) => !touched.has(id)));
    const w = wanted.get(line.key);
    line.sources = { ...kept, ...(w?.sources ?? {}) };
    wanted.delete(line.key);
    const after = computedQty(line);
    const prior = before.get(line.id);
    if (sameQty(prior, after)) continue;
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
      line.conflict = { type: "changed", previous: prior, current: after };
      report.conflicts++;
    } else {
      line.conflict = null;
    }
  }
  next.lines = next.lines.filter((l) => !l.remove);

  for (const { need, sources } of wanted.values()) {
    next.lines.push({
      id: `l${next.nextId++}`,
      key: need.key,
      item: need.item,
      name: need.name,
      aisle: need.aisle,
      sources,
      override: null,
      checked: false,
      conflict: null,
    });
    report.added++;
  }
  return { list: next, report };
}

/** Regenerate one recipe's contribution to the list. */
export function syncRecipe(list, recipe, needs) {
  return reconcile(list, [{ id: recipe.id, title: recipe.title, needs }]);
}

/** Take a recipe out of the list entirely (its contributions and memory). */
export function unsyncRecipe(list, recipe) {
  return reconcile(list, [], { removed: [recipe.id] }).list;
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
  // Blank is an unfinished edit, never zero. Zero is a deliberate choice: buy none of it.
  if (String(qty).trim() === "") return list;
  const num = Number(qty);
  if (!computed || !Number.isFinite(num) || num < 0) return list;
  const buy = purchaseQty(computed.qty, computed.unit, computed.step);
  line.override = Math.abs(num - buy) < EPS ? null : { qty: num, unit: computed.unit };
  line.conflict = null;
  return next;
}

/** What to offer as the bought amount: the edited amount, else the amount to buy. */
export function boughtDefault(line) {
  const q = line.override ?? computedQty(line);
  if (!q) return null;
  return { qty: line.override ? q.qty : purchaseQty(q.qty, q.unit, q.step), unit: q.unit };
}

/**
 * Record that a bought line went to the pantry, once. A second call is refused
 * unless it is an explicit "bought more". The line is finished: reconciliation
 * leaves it alone, and any new shortfall gets its own line.
 * @returns {{ list, ok, already? }}
 */
export function recordTransfer(list, lineId, amount, { more = false, now = Date.now() } = {}) {
  const next = structuredClone(list);
  const line = next.lines.find((l) => l.id === lineId);
  if (!line) return { list, ok: false };
  if (line.transfer && !more) return { list, ok: false, already: true };
  const entry = { qty: amount?.qty ?? null, unit: amount?.unit ?? null, at: now };
  line.transfer = line.transfer ? { ...line.transfer, more: [...(line.transfer.more ?? []), entry] } : entry;
  line.checked = true;
  line.conflict = null;
  return { list: next, ok: true };
}

/** A dismissed line's requirement now, shown again when it changed. */
export function dismissedReview(list, plan, needsMap) {
  const out = [];
  for (const p of plan) {
    for (const need of needsMap.get(p.id) ?? []) {
      const d = list.dismissed[p.id]?.[need.key];
      if (!d || need.check || (need.optional && !need.included)) continue;
      const was = typeof d === "object" ? d : null;
      const conv = was ? convert(was.qty, was.unit, need.unit) : null;
      out.push({ planId: p.id, need, was, changed: !!was && conv != null && Math.abs(conv - need.qty) > EPS });
    }
  }
  return out;
}

/**
 * The list's overall state. Pending confirmations never read as completion.
 * @returns "no-meals" | "pending" | "open" | "all-checked" | "dismissed" | "nothing-needed"
 */
export function listStatus(list, plan, pendingChecks, dismissedCount) {
  const open = list.lines.filter((l) => !l.checked).length;
  if (pendingChecks > 0) return "pending";
  if (open) return "open";
  if (list.lines.length) return "all-checked";
  if (!plan.length) return "no-meals";
  return dismissedCount ? "dismissed" : "nothing-needed";
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
  for (const [recipeId, src] of Object.entries(line.sources ?? {})) {
    next.dismissed[recipeId] = { ...(next.dismissed[recipeId] ?? {}), [line.key]: { qty: src.qty, unit: src.unit } };
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
