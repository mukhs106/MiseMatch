// Ingredient normalization and validation for imported drafts.
//
// Extraction (core/importer.js) produces raw text lines. This module turns
// each line into a structured proposal WITHOUT discarding the original
// wording: quantity, unit, preparation, raw/cooked state, a proposed catalog
// match (or candidates when a name is ambiguous), and the issues that matter.
// Validation then decides, per requested action, which issues block it.
// Nothing here fills in a missing quantity, instruction or serving count.
//
// Quantities are validated at this boundary and again after repair: only finite,
// positive amounts pass. Package, net and drained weights are tracked separately,
// and a drained amount is asked for rather than computed with a universal factor.
// "Excluded" means left out of calculations and stays in the recipe; "removed"
// is a separate, explicit edit.

import { ITEMS, AMBIGUOUS } from "../data/items.js";

const UNIT_WORDS = {
  g: "g", gram: "g", grams: "g", gm: "g", gms: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", millilitre: "ml", milliliter: "ml", millilitres: "ml", milliliters: "ml",
  l: "l", litre: "l", liter: "l", litres: "l", liters: "l",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", t: "tsp",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp", tbl: "tbsp",
  cup: "cup", cups: "cup",
  clove: "cloves", cloves: "cloves",
};
// Units people use that can't be measured consistently. Kept as written, flagged.
const VAGUE_UNITS = ["handful", "handfuls", "katori", "bowl", "bowls", "glass", "pinch", "pinches", "dash", "bunch", "sprig", "sprigs", "inch", "piece", "pieces", "can", "cans", "packet", "packets", "tin", "tins"];
const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };
const STATE_WORDS = { cooked: "cooked", boiled: "cooked", canned: "cooked", drained: "cooked", tinned: "cooked", uncooked: "dry", dry: "dry", dried: "dry", raw: "raw" };
// Items whose nutrition differs a lot between raw/dry and cooked, so the state must be known.
const STATE_SENSITIVE = new Set(["basmati", "brown-basmati", "red-lentils", "moong-dal", "chana-dal", "kala-chana", "dried-chickpeas", "chickpeas", "kidney-beans"]);
// The catalog entry that actually describes this state, where we have one.
const STATE_ALTERNATIVE = { "chickpeas|dry": "dried-chickpeas", "dried-chickpeas|cooked": "chickpeas" };
const stateMatches = (catalog, state) => (catalog === "dry" ? state === "dry" : catalog === "canned-drained" ? state === "cooked" : true);

/** Another catalog item that does describe this state, if one exists. */
export function stateAlternative(item, state) {
  return STATE_ALTERNATIVE[`${item}|${state}`] ?? null;
}
const TO_TASTE = /\b(to taste|as needed|as required|optional|for garnish|to serve)\b/i;

const MAX_QTY = 100000; // past this, a typed number is a typo, not an amount
export const INPUT_LIMITS = { text: 40000, url: 2048, title: 200, line: 500, lines: 150, steps: 100 };

export const ISSUE_TEXT = {
  "invalid-quantity": "This amount can't be used as written.",
  "signed-quantity": "This amount has a minus sign. We won't guess what was meant.",
  "drained-unknown": "This gives the can or packet weight, not the drained amount. Enter what you'd actually use.",
  compound: "This combines more than one ingredient, in proportions we don't know.",
  "no-quantity": "No quantity given.",
  "vague-unit": "The amount isn't a standard measure.",
  unmatched: "Not matched to an ingredient we know.",
  ambiguous: "This name could mean more than one ingredient.",
  state: "Raw or cooked isn't stated, and it changes the amount a lot.",
  "state-mismatch": "Our values describe a different state of this ingredient, and the weight is very different, so it can't be estimated from this amount.",
  range: "A range was given; the larger amount is used for shopping.",
};

// Which actions each issue blocks. An optional line's issues never block.
const BLOCKS = {
  "invalid-quantity": ["nutrition", "shopping", "scale"],
  "signed-quantity": ["nutrition", "shopping", "scale"],
  "drained-unknown": ["nutrition", "shopping", "scale"],
  compound: ["nutrition", "shopping"],
  "no-quantity": ["nutrition", "shopping"],
  "vague-unit": ["nutrition", "shopping"],
  unmatched: ["nutrition", "adapt"],
  ambiguous: ["nutrition", "shopping", "adapt"],
  state: ["nutrition"],
  "state-mismatch": ["nutrition"],
  range: [],
};

function parseNumber(token) {
  if (token in FRACTIONS) return FRACTIONS[token];
  const mixed = token.match(/^(\d+)([½¼¾⅓⅔⅛])$/);
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]];
  const frac = token.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  const n = Number(token.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Alias index: every name, short name and alias that means exactly one item.
const INDEX = (() => {
  const list = [];
  for (const [id, it] of Object.entries(ITEMS)) {
    for (const name of [it.name, it.short, ...(it.aliases ?? [])]) {
      if (name) list.push({ term: name.toLowerCase().replace(/\(.*?\)/g, "").trim(), id });
    }
  }
  for (const term of Object.keys(AMBIGUOUS)) list.push({ term, ambiguous: term });
  return list.filter((x) => x.term).sort((a, b) => b.term.length - a.term.length);
})();

const singular = (w) => w.replace(/(ies)$/, "y").replace(/(oes)$/, "o").replace(/([^s])s$/, "$1");

function containsTerm(text, term) {
  const re = new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
  return re.test(text) || re.test(text.split(" ").map(singular).join(" "));
}

/**
 * Propose a catalog match for an ingredient name. The longest known term wins,
 * so "kabuli chana" beats "chana" and "chana dal" beats "dal". A bare
 * ambiguous term returns candidates, never a guess.
 * @returns {{ item: string|null, candidates: string[], confidence: "exact"|"alias"|"ambiguous"|"none", why?: string }}
 */
export function matchItem(name) {
  const text = name.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return { item: null, candidates: [], confidence: "none" };
  for (const entry of INDEX) {
    if (!containsTerm(text, entry.term)) continue;
    if (entry.ambiguous) {
      const a = AMBIGUOUS[entry.ambiguous];
      return { item: null, candidates: a.candidates, confidence: "ambiguous", why: a.why, term: entry.ambiguous };
    }
    // "Ginger garlic paste" names two ingredients; picking one would quietly drop the other.
    const rest = text.replace(entry.term, " ");
    const other = INDEX.find((x) => !x.ambiguous && x.id !== entry.id && x.term.length > 3 && containsTerm(rest, x.term));
    if (other) {
      return { item: null, candidates: [entry.id, other.id], components: [entry.id, other.id], confidence: "compound", why: "This combines more than one ingredient, and its proportions aren't known. Keep it as unknown, or split it if you know the amounts.", term: entry.term };
    }
    const exact = ITEMS[entry.id].name.toLowerCase() === text || ITEMS[entry.id].short === text;
    return { item: entry.id, candidates: [entry.id], confidence: exact ? "exact" : "alias", term: entry.term };
  }
  return { item: null, candidates: [], confidence: "none" };
}

/**
 * Parse one ingredient line, keeping the original wording.
 * @returns NormalizedLine
 */
export function parseLine(raw, { section = null, source = null, index = 0 } = {}) {
  // A bullet is a marker followed by a space (or a non-minus marker); "-2 g" is a signed number.
  const original = raw.replace(/^\s*(?:[•*–·]+\s*|-+\s+)+/, "").trim().slice(0, INPUT_LIMITS.line);
  let rest = original;
  let qty = null;
  let qtyMax = null;
  let unit = null;
  let vagueUnit = null;
  let invalid = null;
  let pack = null;

  const signed = rest.match(/^[-−]\s*\d/);
  // "1 (400 g) can chickpeas": the bracket is the package, not what goes in the pot.
  const bracket = rest.match(/^(\d+(?:[.,]\d+)?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(g|ml|kg|l)\s*\)\s*(cans?|tins?|packets?)?\s*/i);
  if (signed) {
    invalid = "signed-quantity";
    rest = rest.replace(/^[-−]\s*\d+(?:[.,/]\d+)?\s*(?:(?:g|kg|ml|l|tsp|tbsp|cups?)\b\.?\s*)?/i, "");
  } else if (bracket) {
    const count = Number(bracket[1]);
    const size = Number(bracket[2].replace(",", "."));
    pack = { count, size, unit: bracket[3].toLowerCase(), label: (bracket[4] ?? "package").toLowerCase().replace(/s$/, ""), netTotal: count * size };
    qty = pack.netTotal;
    unit = pack.unit;
    rest = rest.slice(bracket[0].length);
  } else {
    const num = rest.match(/^(\d+\s+\d+\/\d+|\d+[½¼¾⅓⅔⅛]|\d+\/\d+|[½¼¾⅓⅔⅛]|\d+(?:[.,]\d+)?)(\s*(?:-|–|to)\s*(\d+(?:[.,]\d+)?|\d+\/\d+))?\s*/);
    if (num) {
      const parts = num[1].split(/\s+/).map(parseNumber);
      qty = parts.includes(null) ? null : parts.reduce((sum, p) => sum + p, 0);
      if (qty == null || !(qty > 0) || qty > MAX_QTY) {
        invalid = "invalid-quantity";
        qty = null;
      }
      if (num[3]) {
        qtyMax = parseNumber(num[3]);
      }
      rest = rest.slice(num[0].length);
      const u = rest.match(/^([a-zA-Z]+)\.?\s+/);
      if (u && UNIT_WORDS[u[1].toLowerCase()]) {
        unit = UNIT_WORDS[u[1].toLowerCase()];
        rest = rest.slice(u[0].length);
      } else if (u && VAGUE_UNITS.includes(u[1].toLowerCase())) {
        vagueUnit = u[1].toLowerCase();
        rest = rest.slice(u[0].length);
      } else {
        const glued = rest.match(/^(g|kg|ml|l)\b\s*/i);
        if (glued) {
          unit = glued[1].toLowerCase();
          rest = rest.slice(glued[0].length);
        } else unit = "";
      }
    } else {
      const lead = rest.match(/^(?:(?:a|an|one|few|some|a few)\s+)?([a-zA-Z]+)\s+of\s+/i) ?? rest.match(/^(?:a|an|one|few|some|a few)\s+([a-zA-Z]+)\s+/i);
      if (lead && VAGUE_UNITS.includes(lead[1].toLowerCase())) {
        vagueUnit = lead[1].toLowerCase();
        rest = rest.slice(lead[0].length);
      }
    }
  }

  const optional = TO_TASTE.test(original);
  // Name and preparation: "onion, finely chopped" / "paneer (cubed)".
  let name = rest.replace(TO_TASTE, "").trim();
  let prep = null;
  const paren = name.match(/\(([^)]*)\)/);
  if (paren) {
    prep = paren[1].trim();
    name = name.replace(paren[0], " ").trim();
  }
  const comma = name.indexOf(",");
  if (comma > 0) {
    prep = [name.slice(comma + 1).trim(), prep].filter(Boolean).join("; ");
    name = name.slice(0, comma).trim();
  }
  name = name.replace(/^of\s+/i, "").replace(/\s+/g, " ").replace(/[.;:]+$/, "").trim();

  let state = null;
  for (const [w, s] of Object.entries(STATE_WORDS)) if (new RegExp(`\\b${w}\\b`, "i").test(`${name} ${prep ?? ""}`)) state = s;

  let match = matchItem(name);
  // "A can of chopped tomatoes" is canned, whatever the name alone suggests.
  if (pack && /can|tin/.test(pack.label) && match.item === "fresh-tomatoes") match = { item: "canned-tomatoes", candidates: ["canned-tomatoes"], confidence: "alias", term: match.term };
  // Package weight isn't what goes in the pot once a can is drained. Keep the
  // package separately and ask, whatever this particular can's yield happens to be.
  const drainedWord = /\b(drained|rinsed)\b/i.test(original);
  const drainedItem = match.item && ITEMS[match.item].state === "canned-drained";
  const needsDrained = !!pack && (drainedWord || drainedItem);
  if (pack) {
    pack.basis = needsDrained ? "package" : "net";
    if (needsDrained) qty = null;
  }
  const line = {
    id: `line-${index}`,
    raw: original,
    name,
    section,
    source,
    qty,
    qtyMax,
    unit: unit ?? (qty != null ? "" : null),
    vagueUnit,
    invalid,
    pack,
    needsDrained,
    prep,
    state,
    optional,
    match,
    issues: [],
  };
  line.issues = lineIssues(line);
  return line;
}

function lineIssues(l) {
  const issues = [];
  if (l.invalid) issues.push(l.invalid);
  else if (l.needsDrained && l.qty == null) issues.push("drained-unknown");
  else if (l.qty == null && !l.vagueUnit) issues.push("no-quantity");
  if (l.vagueUnit && l.qty == null) issues.push("vague-unit");
  if (l.vagueUnit && l.qty != null && !l.unitConfirmed) issues.push("vague-unit");
  if (l.match.confidence === "compound") {
    if (!l.split?.length) issues.push("compound");
  } else if (!l.match.item && l.match.confidence !== "ambiguous") issues.push("unmatched");
  if (l.match.confidence === "ambiguous") issues.push("ambiguous");
  if (l.match.item && STATE_SENSITIVE.has(l.match.item)) {
    const catalog = ITEMS[l.match.item].state;
    if (!l.state) issues.push("state");
    else if (!stateMatches(catalog, l.state)) issues.push("state-mismatch");
  }
  if (l.qtyMax != null) issues.push("range");
  return issues;
}

/** The amount as read, in words. Separate from any repair. */
export function isCalculable(line) {
  if (line.calc === "unknown" || line.excluded) return false;
  return line.qty != null && !line.issues.some((i) => ["state-mismatch", "invalid-quantity", "signed-quantity", "drained-unknown", "compound"].includes(i));
}

/** Validate a repaired amount. Same rule as the parser: finite and positive, or nothing changes. */
export function validRepair(value) {
  return Number.isFinite(value) && value > 0 && value <= MAX_QTY;
}

/**
 * Apply a person's answer to a line: { item } for a match, { qty, unit }, { state },
 * { optional }, { excluded } (left out of calculations, kept in the recipe),
 * { removed } (taken out of the recipe), { calc: "unknown" } (keep it, amount
 * unusable for estimates), or { split: [{ item, qty, unit }] } with confirmed amounts.
 * A state answer never makes dry nutrient values apply to a cooked amount; the
 * mismatch stays until the item or the amount changes.
 */
export function resolveLine(line, answer) {
  const next = { ...line, ...answer };
  if ("item" in answer) {
    next.match = { item: answer.item, candidates: [answer.item], confidence: answer.item ? "confirmed" : "none" };
    next.split = null;
  }
  if ("qty" in answer) {
    if (answer.qty != null && !validRepair(answer.qty)) {
      next.qty = line.qty;
    } else if (answer.qty != null) {
      next.vagueUnit = null;
      next.invalid = null;
      next.needsDrained = line.needsDrained && !!line.pack && !answer.drainedConfirmed ? line.needsDrained : false;
      if (answer.drainedConfirmed && next.pack) next.pack = { ...next.pack, basis: "drained", drained: { qty: answer.qty, unit: answer.unit ?? next.unit } };
    }
  }
  next.issues = lineIssues(next);
  return next;
}

/** Put a line back to how the import read it, keeping its id and original wording. */
export function resetLine(line) {
  const fresh = parseLine(line.raw, { section: line.section, source: line.source });
  return { ...fresh, id: line.id };
}

/**
 * Which issues block a requested action. Optional lines (garnish, to taste)
 * never block; their issues stay visible as notes.
 * actions: "reference" | "scale" | "nutrition" | "shopping" | "adapt" | "cook"
 * @returns {{ ok: boolean, blocking: [{ line?, kind, text }], notes: [{ line, kind, text }] }}
 */
export function validateDraft(draft, action) {
  const blocking = [];
  const notes = [];
  if (action === "reference") return { ok: true, blocking, notes };
  if ((action === "scale" || action === "nutrition") && !draft.servings) {
    blocking.push({ kind: "servings", text: "The number of servings isn't known." });
  }
  if (action === "cook" && !draft.steps.length) blocking.push({ kind: "steps", text: "There are no instructions to cook from." });
  if (action === "adapt" && !draft.supportedRecipe) {
    blocking.push({ kind: "unsupported", text: "Adaptations are written for specific supported dishes. This imported recipe isn't one of them yet." });
  }
  for (const line of draft.lines) {
    if (line.excluded || line.omitted || line.removed) continue;
    // Seasonings and garnishes don't block anything. An optional ingredient that
    // would change the estimate (cream, say) still blocks a precise nutrition figure
    // until it's given an amount or left out.
    const negligible = !!(line.match.item && ITEMS[line.match.item]?.negligible);
    const minor = negligible || (line.optional && action !== "nutrition");
    for (const kind of line.issues) {
      const entry = { line: line.id, kind, text: ISSUE_TEXT[kind] };
      // "Keep as unknown" is an honest answer: the estimate says it can't count this line, and nothing else stops.
      if (!minor && !(line.calc === "unknown" && kind !== "range") && (BLOCKS[kind] ?? []).includes(action)) blocking.push(entry);
      else notes.push(entry);
    }
  }
  return { ok: blocking.length === 0, blocking, notes };
}

/**
 * A derived-recipe shaped view of a draft for nutrition and shopping, at a target
 * portion count. The source yield stays the denominator; changing the target never
 * changes it. Unusable lines stay in as unknowns, so they show as "can't estimate".
 */
export function draftAsDerived(draft, servings = draft.targetServings ?? draft.servings) {
  const factor = draft.servings && servings ? servings / draft.servings : 1;
  const ingredients = [];
  for (const l of draft.lines) {
    if (l.excluded || l.omitted || l.removed) continue;
    if (l.split?.length) {
      ingredients.push({ slot: l.id, group: "main", entries: l.split.map((p) => ({ item: p.item, label: l.raw, qty: p.qty * factor, unit: p.unit ?? "", optional: !!l.optional })) });
      continue;
    }
    const usable = isCalculable(l);
    ingredients.push({
      slot: l.id,
      group: "main",
      entries: [{ item: l.match.item ?? `?${l.name}`, label: l.raw, qty: usable ? (l.qtyMax ?? l.qty) * factor : null, unit: l.unit ?? "", optional: !!l.optional }],
    });
  }
  return { servings, ingredients };
}
