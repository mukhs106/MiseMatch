// Pantry: the single ingredient state, shared by every recipe and the list.
//
// Keyed by catalog item id, or "free:<name>" for free-text items, which are
// kept but can't feed calculations until the person matches them to an ingredient.
// Entry: { qty?, unit?, some?: true, out?: true, also?: [{ qty, unit }], atLeast?: true, free?: true, name? }
//   not in the pantry   not checked: nothing is known either way
//   out, or qty 0       don't have it
//   no qty, no `some`   have it, amount unknown
//   `some`, no qty      have some, amount not entered yet
//   qty + unit          that amount
//   also                measured amounts in a unit that can't compare with qty; kept, never lost
//   atLeast             a measured purchase added to stock whose earlier amount was unknown

import { ITEMS } from "../data/items.js";
import { convert, compatible, unitFamily, formatQty } from "./units.js";
import { exactIngredient } from "./search.js";

export const isOut = (e) => !!e && (e.out === true || e.qty === 0);

/** What a recipe row shows: { status: "unchecked" | "out" | "have" | "some", qty?, unit? }. */
export function availability(pantry, item) {
  const e = pantry[item];
  if (!e || e.free) return { status: "unchecked" };
  if (isOut(e)) return { status: "out", unit: e.unit };
  if (e.qty != null || e.some) return { status: "some", qty: e.qty, unit: e.unit };
  return { status: "have" };
}

/**
 * Read a typed amount. Number inputs hand back strings; nothing here coerces
 * blank to zero, and exponents and signs are rejected rather than reinterpreted.
 * @returns {{ kind: "blank" } | { kind: "zero" } | { kind: "amount", value } | { kind: "invalid", reason }}
 */
export function parseAmount(text) {
  const t = String(text ?? "").trim();
  if (!t) return { kind: "blank" };
  if (!/^\d*[.,]?\d+$/.test(t)) return { kind: "invalid", reason: "Use a plain number, such as 250 or 1.5." };
  const value = Number(t.replace(",", "."));
  if (!Number.isFinite(value)) return { kind: "invalid", reason: "Use a plain number, such as 250 or 1.5." };
  if (value === 0) return { kind: "zero" };
  if (value > 1e6) return { kind: "invalid", reason: "That amount is too large to be right." };
  return { kind: "amount", value };
}

/**
 * Apply a typed pantry amount. Zero means out of stock; invalid input and an
 * unintended blank keep the last valid value and report why.
 * @returns {{ pantry, error?: string }}
 */
export function applyAmountInput(pantry, key, text, unit) {
  const parsed = parseAmount(text);
  const e = pantry[key] ?? {};
  if (parsed.kind === "invalid") return { pantry, error: parsed.reason };
  if (parsed.kind === "blank") {
    if (e.qty == null) return { pantry };
    return { pantry, error: "To mark the amount as unknown, use Clear amount. Your last amount is kept." };
  }
  const { some, out, atLeast, ...rest } = e;
  if (parsed.kind === "zero") return { pantry: { ...pantry, [key]: { ...rest, qty: 0, unit } } };
  return { pantry: { ...pantry, [key]: { ...rest, qty: parsed.value, unit } } };
}

/** Explicitly clear an amount: have it, amount unknown. The one path that makes blank mean unknown. */
export function clearAmount(pantry, key) {
  const e = pantry[key];
  if (!e) return pantry;
  const next = { ...pantry };
  next[key] = e.unit ? { unit: e.unit } : {};
  return next;
}

/**
 * Change an entry's unit. Compatible units convert so the physical amount stays
 * the same (500 g never becomes 500 kg). Incompatible units ask for a new amount.
 * @returns {{ pantry, error?: string }}
 */
export function changeUnit(pantry, key, unit) {
  const e = pantry[key];
  if (!e) return { pantry };
  if (e.qty == null || e.qty === 0) return { pantry: { ...pantry, [key]: { ...e, unit } } };
  const converted = convert(e.qty, e.unit, unit);
  if (converted == null) return { pantry, error: `${e.unit || "A count"} can't convert to ${unit || "a count"}. Clear the amount first, then enter a new one.` };
  return { pantry: { ...pantry, [key]: { ...e, qty: Number(converted.toFixed(4)), unit } } };
}

/** Bump the revision of every entry that changed, so a confirmation can tell its stock changed. */
export function bumpRevisions(before, after, revisions = {}) {
  const next = { ...revisions };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) next[key] = (next[key] ?? 0) + 1;
  }
  return next;
}

/** Every measured observation of an item, in the primary unit first. */
export function observations(entry) {
  if (!entry || entry.free || entry.qty == null) return [];
  return [{ qty: entry.qty, unit: entry.unit }, ...(entry.also ?? [])];
}

/** How the pantry describes an entry, in words, for rows and reviews. */
export function amountText(entry) {
  if (!entry) return "Not checked";
  if (isOut(entry)) return "Don't have";
  if (entry.qty == null) return entry.some ? "Have some, amount not entered" : "Have it, amount unknown";
  const main = `${entry.atLeast ? "At least " : ""}${formatQty(entry.qty, entry.unit)}`;
  const also = (entry.also ?? []).map((x) => formatQty(x.qty, x.unit));
  return also.length ? `${main}, plus ${also.join(", ")} that can't be compared` : main;
}

/**
 * Write an availability mark back to the pantry.
 * "have" records the item with amount unknown (an explicit choice, so it does
 * reset a measured amount), "some" keeps or sets an amount,
 * "out" records don't have, "unchecked" or "need" removes it.
 */
export function setAvailability(pantry, item, status, amount = {}) {
  const next = { ...pantry };
  if (status === "have") next[item] = {};
  else if (status === "out") next[item] = { out: true };
  else if (status === "some") {
    const prev = pantry[item] ?? {};
    const qty = "qty" in amount ? amount.qty : prev.qty;
    const unit = "unit" in amount ? amount.unit : prev.unit;
    next[item] = qty != null ? { qty, unit } : { some: true, unit };
  } else delete next[item];
  return next;
}

/**
 * "Add to pantry" from a bought list item, with the amount actually bought. Adds
 * to a comparable amount. A purchase in a unit that can't compare is kept beside
 * the measured amount, never replacing it. On unknown stock the measured purchase
 * is recorded as "at least" that much.
 */
export function addBought(pantry, item, qty, unit) {
  const next = { ...pantry };
  const prev = pantry[item];
  if (qty == null || !(qty > 0)) {
    if (!prev || isOut(prev)) next[item] = {};
    return next;
  }
  if (!prev || isOut(prev)) {
    next[item] = { qty, unit };
    return next;
  }
  if (prev.qty == null) {
    next[item] = { qty, unit, atLeast: true };
    return next;
  }
  const add = convert(qty, unit, prev.unit);
  if (add != null) {
    next[item] = { ...prev, qty: Number((prev.qty + add).toFixed(4)) };
    return next;
  }
  const also = [...(prev.also ?? [])];
  const same = also.find((x) => compatible(x.unit, unit));
  if (same) same.qty = same.qty + convert(qty, unit, same.unit);
  else also.push({ qty, unit });
  next[item] = { ...prev, also };
  return next;
}

/**
 * Match a free-text item to a catalog ingredient, only on the person's say-so.
 * A typed amount that parses plainly carries over; otherwise the wording stays as a note.
 */
export function matchFree(pantry, key, item) {
  const e = pantry[key];
  if (!e?.free || !ITEMS[item]) return pantry;
  const next = { ...pantry };
  delete next[key];
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|tsp|tbsp|cup|)\s*$/i.exec(e.qtyText ?? "");
  const parsed = m ? { qty: Number(m[1].replace(",", ".")), unit: m[2].toLowerCase() } : {};
  const fromFree = { name: e.name, qtyText: e.qtyText };
  if (next[item]) next[item] = { ...next[item], fromFree };
  else next[item] = { ...parsed, fromFree };
  return next;
}

/** A free-text name that exactly names a catalog item, for offering a match. */
export function suggestMatch(name) {
  return exactIngredient(name);
}

/**
 * Review of what cooking used, from the exact cooked snapshot. Known comparable
 * stock can be deducted; unknown stays unknown; nothing here changes the pantry.
 * @returns [{ item, name, used: { qty, unit }, before, after, action: "deduct" | "unknown" | "incomparable" | "none" }]
 */
export function cookPantryReview(ingredients, pantry) {
  const totals = new Map();
  for (const line of ingredients) {
    for (const e of line.entries) {
      if (!ITEMS[e.item] || ITEMS[e.item].noShop || e.qty == null) continue;
      const key = `${e.item}|${unitFamily(e.unit)}`;
      const t = totals.get(key);
      if (t) t.qty += convert(e.qty, e.unit, t.unit);
      else totals.set(key, { item: e.item, qty: e.qty, unit: e.unit });
    }
  }
  const rows = [];
  for (const t of totals.values()) {
    const entry = pantry[t.item];
    const name = ITEMS[t.item].name;
    const base = { item: t.item, name, used: { qty: t.qty, unit: t.unit } };
    if (!entry || isOut(entry)) { rows.push({ ...base, action: "none" }); continue; }
    if (entry.qty == null) { rows.push({ ...base, action: "unknown" }); continue; }
    const obs = observations(entry).find((o) => compatible(o.unit, t.unit));
    if (!obs) { rows.push({ ...base, action: "incomparable" }); continue; }
    const take = Math.min(obs.qty, convert(t.qty, t.unit, obs.unit));
    rows.push({ ...base, action: "deduct", take: { qty: take, unit: obs.unit }, before: entry, after: deductFrom(entry, obs.unit, take) });
  }
  return rows;
}

function deductFrom(entry, unit, take) {
  if (compatible(entry.unit, unit)) return { ...entry, qty: Number((entry.qty - convert(take, unit, entry.unit)).toFixed(4)) };
  return { ...entry, also: entry.also.map((o) => (compatible(o.unit, unit) ? { ...o, qty: Number((o.qty - convert(take, unit, o.unit)).toFixed(4)) } : o)) };
}

/**
 * Apply the reviewed deductions to whatever the pantry holds now. Returns the
 * pantry and the narrow inverse (each entry's value before), for Undo.
 */
export function applyCookReview(pantry, rows, chosen = null) {
  const next = { ...pantry };
  const inverse = [];
  for (const row of rows) {
    if (row.action !== "deduct" || (chosen && !chosen.includes(row.item))) continue;
    const current = next[row.item];
    if (!current || current.qty == null) continue;
    inverse.push({ item: row.item, before: current });
    next[row.item] = deductFrom(current, row.take.unit, Math.min(row.take.qty, observations(current).find((o) => compatible(o.unit, row.take.unit))?.qty ?? 0));
  }
  return { pantry: next, inverse };
}

export function freeKey(name) {
  return `free:${name.trim().toLowerCase()}`;
}

export function addFree(pantry, name, qtyText = "") {
  const clean = name.trim();
  if (!clean) return pantry;
  return { ...pantry, [freeKey(clean)]: { free: true, name: clean, qtyText: qtyText.trim() || undefined } };
}

export function remove(pantry, key) {
  const next = { ...pantry };
  delete next[key];
  return next;
}

export function displayName(key, entry) {
  return entry?.free ? entry.name : ITEMS[key]?.name ?? key;
}

/** Older saves: shared presence ({ status }) plus per-recipe partial amounts. */
export function migrate(pantry = {}, adaptations = {}) {
  const next = {};
  for (const [k, v] of Object.entries(pantry)) {
    if (v && "status" in v) {
      if (v.status === "have") next[k] = {};
    } else if (v) next[k] = v;
  }
  const cleaned = {};
  for (const [id, a] of Object.entries(adaptations)) {
    const { partial, ...rest } = a;
    for (const [item, p] of Object.entries(partial ?? {})) {
      if (next[item]?.qty == null) next[item] = p.qty != null ? { qty: p.qty, unit: p.unit } : { some: true };
    }
    cleaned[id] = rest;
  }
  return { pantry: next, adaptations: cleaned };
}
