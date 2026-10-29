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

const FRACTIONS = [
  [0.25, "¼"],
  [0.5, "½"],
  [0.75, "¾"],
];

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

/** Round a quantity to something you could actually measure. */
export function practical(qty, unit, step) {
  if (qty <= 0) return 0;
  if (step) return Math.max(step, roundTo(qty, step));
  const fam = unitFamily(unit);
  if (fam === "mass" || fam === "volume") {
    if (unit === "tsp" || unit === "tbsp" || unit === "cup") return Math.max(0.25, roundTo(qty, 0.25));
    if (qty < 20) return Math.max(1, Math.round(qty));
    if (qty < 200) return roundTo(qty, 5);
    return roundTo(qty, 10);
  }
  return Math.max(0.5, roundTo(qty, 0.5));
}

function fractionText(value) {
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  const frac = FRACTIONS.find(([v]) => Math.abs(v - rest) < 0.01);
  if (rest < 0.01) return String(whole);
  if (frac) return whole ? `${whole}${frac[1]}` : frac[1];
  return String(Number(value.toFixed(2)));
}

/** "1½ tsp", "130 g", "1.2 kg", "3". Applies practical rounding first. */
export function formatQty(qty, unit, step) {
  const value = practical(qty, unit, step);
  if (unit === "g" && value >= 1000) return `${Number((value / 1000).toFixed(2))} kg`;
  if (unit === "ml" && value >= 1000) return `${Number((value / 1000).toFixed(2))} l`;
  const num = unit === "g" || unit === "ml" ? String(value) : fractionText(value);
  return unit ? `${num} ${unit}` : num;
}
