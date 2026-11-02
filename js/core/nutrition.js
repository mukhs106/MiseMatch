// Rough nutrition per serving from the catalog's fixture values.
// Results are ranges, not point values. An ingredient without usable data
// (no value, unknown weight, unknown quantity) makes that nutrient
// incomplete; it is never counted as zero or silently left out.
// Comparisons are only made per serving of the same serving definition, and
// a change in how much food one serving holds is reported, not hidden.

import { ITEMS } from "../data/items.js";
import { convert, unitFamily } from "./units.js";

export const NUTRIENTS = ["protein", "fiber", "fat", "kcal"];
export const NUTRIENT_LABEL = { protein: "Protein", fiber: "Fiber", fat: "Fat", kcal: "Energy" };
const UNIT = { protein: "g", fiber: "g", fat: "g", kcal: "kcal" };
const SPREAD = 0.15; // ±15% band around the estimate to reflect typical variation

export function grams(entry, item) {
  if (entry.qty == null) return null;
  const fam = unitFamily(entry.unit);
  if (fam === "mass") return convert(entry.qty, entry.unit, "g");
  if (fam === "volume" && item.gPerMl) return convert(entry.qty, entry.unit, "ml") * item.gPerMl;
  if (fam.startsWith("count:") && entry.unit === "" && item.gPerUnit) return entry.qty * item.gPerUnit;
  return null;
}

/**
 * @param derived { servings, ingredients: [{ entries: [{ item, qty, unit }] }] }
 * @returns {{ [nutrient]: { low, high, mid, incomplete }, missing: { [nutrient]: string[] }, servingGrams: { value, incomplete } }}
 */
export function estimate(derived) {
  const totals = Object.fromEntries(NUTRIENTS.map((n) => [n, 0]));
  const missing = Object.fromEntries(NUTRIENTS.map((n) => [n, []]));
  let mass = 0;
  let massIncomplete = false;
  const servings = derived.servings;
  for (const line of derived.ingredients) {
    for (const entry of line.entries) {
      const item = ITEMS[entry.item];
      if (!item) {
        for (const n of NUTRIENTS) missing[n].push(entry.label ?? entry.item);
        massIncomplete = true;
        continue;
      }
      if (item.negligible) continue;
      const g = grams(entry, item);
      if (g == null) massIncomplete = true;
      else mass += g;
      for (const n of NUTRIENTS) {
        const per100 = item.nutrition?.[n];
        if (per100 == null || g == null) {
          if (!missing[n].includes(item.name)) missing[n].push(item.name);
          continue;
        }
        totals[n] += (g * per100) / 100;
      }
    }
  }
  const result = { missing, servingGrams: { value: servings ? mass / servings : null, incomplete: massIncomplete || !servings } };
  for (const n of NUTRIENTS) {
    const mid = servings ? totals[n] / servings : null;
    const incomplete = missing[n].length > 0 || !servings;
    result[n] = {
      mid,
      low: mid == null ? null : Math.max(0, Math.floor(mid * (1 - SPREAD))),
      high: mid == null ? null : Math.ceil(mid * (1 + SPREAD)),
      incomplete,
    };
  }
  return result;
}

export function formatRange(r, nutrient = "protein") {
  if (r.incomplete) return "can't estimate";
  const u = UNIT[nutrient];
  if (nutrient === "kcal") {
    const lo = Math.round(r.low / 10) * 10;
    const hi = Math.round(r.high / 10) * 10;
    return lo === hi ? `about ${lo} ${u}` : `${lo}–${hi} ${u}`;
  }
  if (r.high <= 1) return `under 1 ${u}`;
  if (r.low === r.high) return `about ${r.low} ${u}`;
  return `${r.low}–${r.high} ${u}`;
}

/** "more", "less" or "about the same", with a tolerance so noise doesn't read as change. */
export function direction(before, after) {
  if (before.incomplete || after.incomplete) return "can't compare";
  const diff = after.mid - before.mid;
  const tolerance = Math.max(1, before.mid * 0.08);
  if (diff > tolerance) return "more";
  if (diff < -tolerance) return "less";
  return "about the same";
}

/**
 * Whether one serving holds noticeably more or less food than the original's,
 * so a per-serving comparison can say so instead of hiding it.
 * @returns {null | { before, after, change: "larger" | "smaller" }}
 */
export function servingSizeChange(before, after) {
  const b = before.servingGrams;
  const a = after.servingGrams;
  if (b.incomplete || a.incomplete || !b.value) return null;
  const ratio = a.value / b.value;
  if (ratio > 1.1) return { before: b.value, after: a.value, change: "larger" };
  if (ratio < 0.9) return { before: b.value, after: a.value, change: "smaller" };
  return null;
}

/**
 * Against a minimum per-serving target: "meets" (whole range at or above),
 * "maybe" (range straddles it), "misses", or "unknown" (incomplete data).
 */
export function targetStatus(range, target) {
  if (target == null) return null;
  if (range.incomplete) return "unknown";
  if (range.low >= target) return "meets";
  if (range.high >= target) return "maybe";
  return "misses";
}
