// Rough nutrition per serving from the catalog's fixture values, computed from
// the amounts a cook would actually measure (units.practical), so the estimate
// and the displayed recipe describe the same food.
// Results are illustrative ranges: a fixed band around fixture values, not
// measured uncertainty. An ingredient without usable data (no value, unknown
// weight, unknown quantity) makes that nutrient incomplete; it is never counted
// as zero or silently left out. Comparisons are only made per serving of the
// same serving definition. There is no cooked-yield model, so the only weight
// reported is the raw weight of ingredients added per serving, never a plated
// or cooked serving weight.

import { ITEMS } from "../data/items.js";
import { convert, unitFamily, practical } from "./units.js";

export const RANGE_NOTE = "Ranges are illustrative: a fixed ±15% band around fixture values, not measured uncertainty.";

export const NUTRIENTS = ["protein", "fiber", "fat", "kcal"];
export const NUTRIENT_LABEL = { protein: "Protein", fiber: "Fiber", fat: "Fat", kcal: "Energy" };
const UNIT = { protein: "g", fiber: "g", fat: "g", kcal: "kcal" };
const SPREAD = 0.15; // illustrative fixed band, not calibrated from source data (RANGE_NOTE)

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
 * @returns {{ [nutrient]: { low, high, mid, incomplete }, missing: { [nutrient]: string[] }, rawGrams: { value, incomplete }, optionalIncluded: string[] }}
 */
export function estimate(derived) {
  const totals = Object.fromEntries(NUTRIENTS.map((n) => [n, 0]));
  const missing = Object.fromEntries(NUTRIENTS.map((n) => [n, []]));
  let mass = 0;
  let massIncomplete = false;
  const optionalIncluded = [];
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
      if (entry.optional && !optionalIncluded.includes(item.name)) optionalIncluded.push(item.name);
      const g = grams(entry.qty == null ? entry : { ...entry, qty: practical(entry.qty, entry.unit, entry.step) }, item);
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
  const result = { missing, rawGrams: { value: servings ? mass / servings : null, incomplete: massIncomplete || !servings }, optionalIncluded };
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
 * Raw ingredient weight added or removed per serving against the original, when
 * it's noticeable. This is uncooked input weight (rice before it absorbs water,
 * nothing for evaporation), not the weight of a plated serving.
 * @returns {null | { before, after, delta, change: "more" | "less" }}
 */
export function rawWeightChange(before, after) {
  const b = before.rawGrams;
  const a = after.rawGrams;
  if (b.incomplete || a.incomplete || !b.value) return null;
  const ratio = a.value / b.value;
  if (ratio > 1.1) return { before: b.value, after: a.value, delta: a.value - b.value, change: "more" };
  if (ratio < 0.9) return { before: b.value, after: a.value, delta: b.value - a.value, change: "less" };
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
