// Units, conversion within a family, and practical rounding for display.
// Mass and volume never convert into each other, and count units ("", "cloves")
// only match the exact same unit.

const UNITS = {
  g: { family: "mass", base: 1 },
  kg: { family: "mass", base: 1000 },
  ml: { family: "volume", base: 1 },
  l: { family: "volume", base: 1000 },
  tsp: { family: "volume", base: 4.93 },
  tbsp: { family: "volume", base: 14.79 },
  cup: { family: "volume", base: 240 },
};

export function unitFamily(unit) {
  return UNITS[unit]?.family ?? `count:${unit}`;
}

export function compatible(a, b) {
  return unitFamily(a) === unitFamily(b);
}

/** Convert qty between units of the same family; null if incompatible. */
export function convert(qty, from, to) {
  if (from === to) return qty;
  const a = UNITS[from];
  const b = UNITS[to];
  if (!a || !b || a.family !== b.family) return null;
  return (qty * a.base) / b.base;
}

/** Base unit for a family when quantities in different units are summed. */
export function baseUnit(unit) {
  const fam = unitFamily(unit);
  if (fam === "mass") return "g";
  if (fam === "volume") return "ml";
  return unit;
}

// Fractions a cook can actually measure. Anything smaller than the smallest
// measure is called a pinch or shown in decimals, never rounded up to a measure
// that would double the dose.
const FRACTIONS = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [0.75, "¾"],
  [0.875, "⅞"],
];
const EIGHTH = 0.125;
const TSP_PER_TBSP = 3;

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

/**
 * The amount to measure when cooking. Rounds to something measurable without
 * doubling a small dose: spoons and cups to the nearest eighth, counts to the
 * nearest quarter (eighth below a half), sub-gram amounts to one decimal.
 * Counts with an authored `step` (eggs, say) stay in whole steps.
 */
export function practical(qty, unit, step) {
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return 0;
  if (step) return Math.max(step, roundTo(qty, step));
  const fam = unitFamily(unit);
  if (unit === "tsp") return qty < EIGHTH ? qty : roundTo(qty, EIGHTH);
  if (unit === "tbsp" || unit === "cup") return qty < EIGHTH ? qty : roundTo(qty, qty < 0.5 ? EIGHTH : 0.25);
  if (fam === "mass" || fam === "volume") {
    if (qty < 1) return Math.max(0.1, Math.round(qty * 10) / 10);
    if (qty < 5) return roundTo(qty, 0.5);
    if (qty < 20) return Math.round(qty);
    if (qty < 200) return roundTo(qty, 5);
    return roundTo(qty, 10);
  }
  return qty < 0.5 ? Math.max(EIGHTH, roundTo(qty, EIGHTH)) : roundTo(qty, 0.25);
}

/**
 * The amount to buy: rounded up, never down, and separate from the cooking
 * amount. Whole units for counts (you can't buy half a lemon).
 */
export function purchaseQty(qty, unit, step) {
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return 0;
  if (unitFamily(unit).startsWith("count:")) return Math.ceil(qty - 1e-6);
  const rounded = practical(qty, unit, step);
  if (rounded >= qty - 1e-6) return rounded;
  const grain = rounded < 1 ? 0.1 : rounded < 5 ? 0.5 : rounded < 20 ? 1 : rounded < 200 ? 5 : 10;
  if (unit === "tsp" || unit === "tbsp" || unit === "cup") return rounded + (rounded < 0.5 || unit === "tsp" ? EIGHTH : 0.25);
  return rounded + grain;
}

function fractionText(value) {
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  if (rest < 0.01) return String(whole);
  const frac = FRACTIONS.find(([v]) => Math.abs(v - rest) < 0.01);
  if (frac) return whole ? `${whole}${frac[1]}` : frac[1];
  return String(Number(value.toFixed(2)));
}

/** "1½ tsp", "130 g", "1.2 kg", "3", "⅛ tsp", "0.2 g", "a pinch". Applies practical rounding first. */
export function formatQty(qty, unit, step) {
  const value = practical(qty, unit, step);
  if (unit === "tsp" && value < EIGHTH && value > 0) return "a pinch";
  // A quarter tablespoon isn't a spoon anyone owns; say it in teaspoons.
  if (unit === "tbsp" && value > 0 && value < 0.5) return formatQty(value * TSP_PER_TBSP, "tsp");
  if (unit === "g" && value >= 1000) return `${Number((value / 1000).toFixed(2))} kg`;
  if (unit === "ml" && value >= 1000) return `${Number((value / 1000).toFixed(2))} l`;
  const num = unit === "g" || unit === "ml" || unit === "kg" || unit === "l" ? String(Number(value.toFixed(2))) : fractionText(value);
  return unit ? `${num} ${unit}` : num;
}

/** Whether the shown cooking amount differs noticeably from the exact derived amount. */
export function isApproximated(qty, unit, step) {
  if (qty == null || qty <= 0) return false;
  return Math.abs(practical(qty, unit, step) - qty) / qty > 0.1;
}
