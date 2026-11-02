// Constraints, kept in four separate kinds that are never traded against each other:
//
//   hard exclusions  diet (vegetarian, vegan) and things you avoid (allergens or
//                    ingredient families). A result that conflicts is not eligible,
//                    whatever else it scores. Never relaxed silently.
//   limits           user-designated ceilings, such as a time limit. Results over a
//                    limit are not eligible until you change the limit yourself.
//   targets          flexible nutrition minimums per serving (protein, fiber).
//                    Used for ranking and for explaining when nothing reaches them.
//   preferences      dislikes. Ranking only.
//
// Ambiguous terms are clarified, not assumed: "nut-free" asks whether it means
// tree nuts, peanuts or both; vegetarian asks about eggs; and once any
// restriction is set, soy, sesame (and coconut, when avoiding tree nuts) are
// asked about rather than assumed acceptable.
//
// Nothing here can say a dish is safe. It reports identified conflicts and the
// product labels it cannot see.

import { ITEMS, ALLERGEN_LABEL } from "../data/items.js";

export const AVOID_OPTIONS = ["dairy", "egg", "gluten", "nuts", "soy", "sesame", "mustard"];
export const NUT_SCOPES = {
  both: { label: "Tree nuts and peanuts", tags: ["tree-nut", "peanut"] },
  tree: { label: "Tree nuts only", tags: ["tree-nut"] },
  peanut: { label: "Peanuts only", tags: ["peanut"] },
};
// Asked about, not assumed, once any restriction is set.
export const ASKED = ["soy", "sesame"];

export function defaultConstraints() {
  return {
    diet: null, // null | "vegetarian" | "vegan"
    eggs: null, // vegetarian only: null (not answered) | "yes" | "no"
    avoid: [], // values from AVOID_OPTIONS
    nutScope: null, // when "nuts" is avoided: null (not clarified) | "both" | "tree" | "peanut"
    answers: {}, // soy | sesame | coconut: "ok" | "avoid"
    timeLimit: null, // minutes
    targets: { protein: null, fiber: null }, // grams per serving, minimums
    dislikes: [], // item ids
  };
}

export function normalizeConstraints(c = {}) {
  const d = defaultConstraints();
  return { ...d, ...c, targets: { ...d.targets, ...(c.targets ?? {}) }, answers: { ...(c.answers ?? {}) }, avoid: [...(c.avoid ?? [])], dislikes: [...(c.dislikes ?? [])] };
}

export function hasRestrictions(c) {
  return !!c.diet || c.avoid.length > 0;
}

/** Hard exclusions as tags and animal categories, each with the reason shown to the person. */
export function exclusions(c) {
  const tags = new Map();
  const animal = new Map();
  if (c.diet === "vegan") {
    animal.set("dairy", "you chose plant-based (vegan)");
    animal.set("egg", "you chose plant-based (vegan)");
    animal.set("meat", "you chose plant-based (vegan)");
  } else if (c.diet === "vegetarian") {
    animal.set("meat", "you chose vegetarian");
    if (c.eggs === "no") animal.set("egg", "you said you don't eat eggs");
  }
  for (const a of c.avoid) {
    if (a === "nuts") {
      const scope = NUT_SCOPES[c.nutScope ?? "both"];
      for (const t of scope.tags) tags.set(t, `you avoid ${ALLERGEN_LABEL[t]}`);
    } else tags.set(a, `you avoid ${ALLERGEN_LABEL[a]}`);
  }
  for (const [k, v] of Object.entries(c.answers)) if (v === "avoid") tags.set(k, `you avoid ${ALLERGEN_LABEL[k]}`);
  return { tags, animal };
}

/** Questions whose answer changes what is eligible. */
export function openQuestions(c) {
  const q = [];
  if (c.avoid.includes("nuts") && !c.nutScope) q.push({ key: "nutScope", text: "Does nut-free mean tree nuts, peanuts, or both?" });
  if (c.diet === "vegetarian" && !c.eggs) q.push({ key: "eggs", text: "Do you eat eggs?" });
  if (hasRestrictions(c)) {
    for (const t of ASKED) if (!c.avoid.includes(t) && !c.answers[t]) q.push({ key: t, text: `Is ${ALLERGEN_LABEL[t]} OK for you?` });
    if (exclusions(c).tags.has("tree-nut") && !c.answers.coconut) q.push({ key: "coconut", text: "Is coconut OK for you? Some people who avoid tree nuts also avoid coconut." });
  }
  return q;
}

/**
 * Open questions that matter for these ingredients. A question is only asked
 * when a candidate depends on the answer. Hard exclusions already chosen stay in force.
 */
export function relevantQuestions(c, itemIds) {
  const items = [...new Set(itemIds)].map((id) => ITEMS[id]).filter(Boolean);
  const contains = (tag) => items.some((it) => (it.contains ?? []).includes(tag));
  return openQuestions(c).filter((q) => {
    if (q.key === "nutScope") return contains("tree-nut") || contains("peanut");
    if (q.key === "eggs") return items.some((it) => it.animal === "egg");
    return contains(q.key);
  });
}

/**
 * Check a set of ingredients against the constraints.
 * @returns {{ conflicts: [{ item, reason }], questions: [{ item, key, text }], labelChecks: [{ item, text }], dislikes: string[] }}
 */
export function checkItems(itemIds, c) {
  const ex = exclusions(c);
  const open = new Map(openQuestions(c).map((q) => [q.key, q]));
  const conflicts = [];
  const questions = [];
  const labelChecks = [];
  const dislikes = [];
  for (const id of new Set(itemIds)) {
    const item = ITEMS[id];
    if (!item) continue;
    const reasons = [];
    if (item.animal && ex.animal.has(item.animal)) reasons.push(`${item.name} is ${item.animal === "meat" ? "meat" : item.animal === "egg" ? "egg" : "dairy"}, and ${ex.animal.get(item.animal)}`);
    for (const t of item.contains ?? []) {
      if (ex.tags.has(t)) reasons.push(`${item.name} contains ${ALLERGEN_LABEL[t]}, and ${ex.tags.get(t)}`);
    }
    if (reasons.length) conflicts.push({ item: id, reason: reasons[0] });
    else {
      for (const t of item.contains ?? []) if (open.has(t)) questions.push({ item: id, key: t, text: `${item.name} contains ${ALLERGEN_LABEL[t]}. ${open.get(t).text}` });
      if (item.animal === "egg" && open.has("eggs")) questions.push({ item: id, key: "eggs", text: `${item.name}: ${open.get("eggs").text}` });
    }
    if (item.labelCheck && hasRestrictions(c)) labelChecks.push({ item: id, text: item.labelCheck });
    if (c.dislikes.includes(id)) dislikes.push(id);
  }
  return { conflicts, questions, labelChecks, dislikes };
}

/**
 * Whether a profile sets anything a "fits" filter can act on. Hard exclusions and
 * time limits decide inclusion; nutrition targets and dislikes only rank and label.
 */
export function hasFilterCriteria(c) {
  return hasRestrictions(c) || c.timeLimit != null || Object.values(c.answers).includes("avoid");
}

/** Short description of the hard constraints, for headings and explanations. */
export function describe(c) {
  const parts = [];
  if (c.diet === "vegan") parts.push("plant-based");
  if (c.diet === "vegetarian") parts.push(c.eggs === "no" ? "vegetarian, no eggs" : "vegetarian");
  for (const a of c.avoid) parts.push(a === "nuts" ? `no ${NUT_SCOPES[c.nutScope ?? "both"].label.toLowerCase()}` : `no ${ALLERGEN_LABEL[a]}`);
  for (const [k, v] of Object.entries(c.answers)) if (v === "avoid" && !c.avoid.includes(k)) parts.push(`no ${ALLERGEN_LABEL[k]}`);
  return parts;
}
