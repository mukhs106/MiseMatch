// Rough protein and fiber per serving from typical catalog values.
// Results are ranges, not point values, and anything without data is listed
// as missing rather than counted as zero.

import { ITEMS } from "../data/items.js";
import { convert, unitFamily } from "./units.js";

export const NUTRIENTS = ["protein", "fiber"];
const SPREAD = 0.15; // ±15% band around the estimate to reflect typical variation

function grams(entry, item) {
  const fam = unitFamily(entry.unit);
  if (fam === "mass") return convert(entry.qty, entry.unit, "g");
  if (fam === "volume" && item.gPerMl) return convert(entry.qty, entry.unit, "ml") * item.gPerMl;
  if (fam.startsWith("count:") && item.gPerUnit) return entry.qty * item.gPerUnit;
  return null;
}

/**
 * @returns {{ protein: {low, high, mid}, fiber: {...}, missing: { protein: string[], fiber: string[] } }}
 */
export function estimate(derived) {
  const totals = { protein: 0, fiber: 0 };
  const missing = { protein: [], fiber: [] };
  for (const line of derived.ingredients) {
    for (const entry of line.entries) {
      const item = ITEMS[entry.item];
      if (!item || item.negligible) continue;
      const g = grams(entry, item);
      for (const n of NUTRIENTS) {
        const per100 = item.nutrition?.[n];
        if (per100 == null || g == null) {
          missing[n].push(item.name);
          continue;
        }
        totals[n] += (g * per100) / 100;
      }
    }
  }
  const result = { missing };
  for (const n of NUTRIENTS) {
    const mid = totals[n] / derived.servings;
    result[n] = {
      mid,
      low: Math.max(0, Math.floor(mid * (1 - SPREAD))),
      high: Math.ceil(mid * (1 + SPREAD)),
      // A missing ingredient could be a major source, so the total isn't shown as if complete.
      incomplete: missing[n].length > 0,
    };
  }
  return result;
}

export function formatRange(r) {
  if (r.incomplete) return "can't estimate";
  if (r.high <= 1) return "under 1 g";
  if (r.low === r.high) return `about ${r.low} g`;
  return `${r.low}–${r.high} g`;
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
