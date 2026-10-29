// Pantry: the single ingredient state, shared by every recipe and the list.
//
// Keyed by catalog item id, or "free:<name>" for free-text items, which are
// kept but can't feed calculations ("not matched to recipes yet").
// Entry: { qty?, unit?, some?: true, free?: true, name? }
//   no qty, no `some`   have it, amount unknown
//   `some`, no qty      have some, amount not entered yet
//   qty + unit          that amount
// Not in the pantry means "need".

import { ITEMS } from "../data/items.js";
import { convert } from "./units.js";

/** What a recipe row shows for an item: { status: "have" | "some" | "need", qty?, unit? }. */
export function availability(pantry, item) {
  const e = pantry[item];
  if (!e || e.free) return { status: "need" };
  if (e.qty != null || e.some) return { status: "some", qty: e.qty, unit: e.unit };
  return { status: "have" };
}

/**
 * Write a recipe's availability mark back to the pantry.
 * "have" keeps the item with amount unknown, "some" keeps or sets an amount,
 * "need" (or null) removes it.
 */
export function setAvailability(pantry, item, status, amount = {}) {
  const next = { ...pantry };
  if (status === "have") next[item] = {};
  else if (status === "some") {
    const prev = pantry[item] ?? {};
    const qty = "qty" in amount ? amount.qty : prev.qty;
    const unit = "unit" in amount ? amount.unit : prev.unit;
    next[item] = qty != null ? { qty, unit } : { some: true, unit };
  } else delete next[item];
  return next;
}

/** "Add to pantry" from a bought list item. Adds to an existing amount when the units compare. */
export function addBought(pantry, item, qty, unit) {
  const next = { ...pantry };
  const prev = pantry[item];
  if (!prev) {
    next[item] = qty != null ? { qty, unit } : {};
    return next;
  }
  if (prev.qty == null) return pantry; // already "have it, amount unknown"
  const add = qty != null ? convert(qty, unit, prev.unit) : null;
  next[item] = add == null ? {} : { qty: prev.qty + add, unit: prev.unit };
  return next;
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

/** Catalog items whose name matches the query (shoppable items only). */
export function searchCatalog(query, limit = 6) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.entries(ITEMS)
    .filter(([, it]) => !it.noShop && (it.name.toLowerCase().includes(q) || it.short?.includes(q)))
    .sort(([, a], [, b]) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(([id]) => id);
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
