// Deterministic adaptation engine. Separate steps, separate functions:
//
//   1. comboStatus     is this set of rules a supported combination?
//   2. evaluate        derive the result and check it: hard constraints, open
//                      questions, label checks, limits, quantity ranges,
//                      nutrition against targets, purchases from the pantry
//   3. candidates      evaluate the original, every single rule and every
//                      authored bundle; sort into eligible / needs an answer /
//                      not eligible. Hard constraints filter; they are never
//                      weighed against anything.
//   4. resolve         rank eligible candidates (targets, then dislikes, then
//                      purchases, then time) and, when nothing reaches a target
//                      or nothing is eligible, explain why and list real options.
//
// Nothing here calls an extraction tool or a model. The same inputs always
// give the same result.

import { RECIPES, getRecipe } from "../data/recipes.js";
import { getSwap, swapsForRecipe } from "../data/swaps.js";
import { bundlesForRecipe } from "../data/bundles.js";
import { deriveRecipe } from "./adapt.js";
import { estimate, targetStatus } from "./nutrition.js";
import { checkItems, openQuestions } from "./constraints.js";
import { needsFor } from "./shopping.js";

const TARGETS = ["protein", "fiber"];
const STATUS_ORDER = { meets: 0, maybe: 1, unknown: 2, misses: 3 };

/** Supported, untested or blocked, with the pairs that make it so. */
export function comboStatus(recipeId, applied) {
  const swaps = applied.map(getSwap).filter(Boolean);
  const bundles = bundlesForRecipe(recipeId);
  const blocked = [];
  const untested = [];
  for (let i = 0; i < swaps.length; i++) {
    for (let j = i + 1; j < swaps.length; j++) {
      const a = swaps[i];
      const b = swaps[j];
      const slotA = a.replace?.slot ?? a.omit;
      const slotB = b.replace?.slot ?? b.omit;
      const declared = (a.conflicts ?? []).find((c) => c.swap === b.id) ?? (b.conflicts ?? []).find((c) => c.swap === a.id);
      if (declared) blocked.push({ a, b, reason: declared.reason });
      else if (slotA && slotA === slotB) blocked.push({ a, b, reason: "Both change the same ingredient. Only one rule per ingredient at a time." });
      else if (!((a.combinesWith ?? []).includes(b.id) || (b.combinesWith ?? []).includes(a.id) || bundles.some((x) => x.swaps.includes(a.id) && x.swaps.includes(b.id)))) {
        untested.push({ a, b });
      }
    }
  }
  return { status: blocked.length ? "blocked" : untested.length ? "untested" : "supported", blocked, untested };
}

/** Rules whose authored quantity range doesn't cover this many servings. */
export function servingsIssues(applied, servings) {
  return applied.map(getSwap).filter((s) => s?.servingsRange && (servings < s.servingsRange[0] || servings > s.servingsRange[1]))
    .map((s) => ({ swap: s, reason: s.servingsReason ?? `Written for ${s.servingsRange[0]} to ${s.servingsRange[1]} servings.` }));
}

export function totalMinutes(recipe, applied) {
  return recipe.minutes + applied.map(getSwap).reduce((sum, s) => sum + (s?.minutesDelta ?? 0), 0);
}

/**
 * Evaluate one adaptation against the constraints.
 * @returns an object with everything the UI needs to explain the result.
 */
export function evaluate(recipe, adaptation, constraints, pantry = {}) {
  const derived = deriveRecipe(recipe, adaptation);
  const items = derived.ingredients.flatMap((l) => l.entries.map((e) => e.item));
  const check = checkItems(items, constraints);
  const combo = comboStatus(recipe.id, adaptation.applied);
  const qtyIssues = servingsIssues(adaptation.applied, adaptation.servings);
  const minutes = totalMinutes(recipe, adaptation.applied);
  const overTime = constraints.timeLimit != null && minutes > constraints.timeLimit;
  const nutrition = estimate(derived);
  const targets = {};
  for (const n of TARGETS) {
    const t = constraints.targets?.[n];
    if (t != null) targets[n] = { target: t, status: targetStatus(nutrition[n], t) };
  }
  const purchases = needsFor(derived, pantry).filter((n) => !n.check).length;
  const planAhead = adaptation.applied.map(getSwap).filter((s) => s?.planAhead).map((s) => s.planAhead);
  return { recipe, adaptation, derived, check, combo, qtyIssues, minutes, overTime, nutrition, targets, purchases, planAhead };
}

function worstTarget(ev) {
  const statuses = Object.values(ev.targets).map((t) => t.status);
  if (!statuses.length) return "meets";
  return statuses.reduce((w, s) => (STATUS_ORDER[s] > STATUS_ORDER[w] ? s : w), "meets");
}

/** Why a candidate isn't eligible. Hard reasons only; targets and preferences never appear here. */
function blockers(ev) {
  const out = [];
  for (const c of ev.check.conflicts) out.push({ kind: "conflict", text: c.reason, item: c.item });
  for (const b of ev.combo.blocked) out.push({ kind: "combo", text: `${b.a.label} and ${b.b.label}: ${b.reason}` });
  for (const q of ev.qtyIssues) out.push({ kind: "quantity", text: `${q.swap.label}: ${q.reason}` });
  if (ev.overTime) out.push({ kind: "limit", text: `About ${ev.minutes} minutes, over your ${ev.constraints.timeLimit}-minute limit.` });
  return out;
}

/**
 * Every supported option for a recipe at these servings: the original, each
 * single rule, and each authored bundle, sorted into three groups.
 */
export function candidates(recipe, servings, constraints, pantry = {}) {
  const options = [{ id: "original", kind: "original", label: "As written", applied: [] }];
  for (const s of swapsForRecipe(recipe.id)) options.push({ id: s.id, kind: "rule", label: s.label, applied: [s.id] });
  for (const b of bundlesForRecipe(recipe.id)) options.push({ id: b.id, kind: "bundle", label: b.label, applied: [...b.swaps], bundle: b });
  const eligible = [];
  const needsAnswer = [];
  const notEligible = [];
  for (const o of options) {
    const ev = evaluate(recipe, { servings, applied: o.applied }, constraints, pantry);
    ev.constraints = constraints;
    const block = blockers(ev);
    const entry = { ...o, ev, blockers: block, targetStatus: worstTarget(ev) };
    if (block.length) notEligible.push(entry);
    else if (ev.check.questions.length) needsAnswer.push(entry);
    else eligible.push(entry);
  }
  const focus = TARGETS.filter((n) => constraints.targets?.[n] != null);
  const reach = (c) => focus.reduce((sum, n) => sum + (c.ev.nutrition[n].incomplete ? 0 : c.ev.nutrition[n].mid / constraints.targets[n]), 0);
  const rank = (a, b) =>
    STATUS_ORDER[a.targetStatus] - STATUS_ORDER[b.targetStatus]
    || a.ev.check.dislikes.length - b.ev.check.dislikes.length
    || (focus.length && a.targetStatus !== "meets" ? reach(b) - reach(a) : 0)
    || 0
    || a.ev.check.dislikes.length - b.ev.check.dislikes.length
    || a.ev.purchases - b.ev.purchases
    || a.ev.minutes - b.ev.minutes
    || a.applied.length - b.applied.length;
  eligible.sort(rank);
  needsAnswer.sort(rank);
  notEligible.sort((a, b) => a.blockers.length - b.blockers.length || rank(a, b));
  return { eligible, needsAnswer, notEligible };
}

/** Best eligible result's per-serving range for a nutrient, for "the closest we can get". */
function bestRange(list, n) {
  return list.map((c) => c.ev.nutrition[n]).filter((r) => !r.incomplete).sort((a, b) => b.mid - a.mid)[0] ?? null;
}

/**
 * Resolve a request into an answer the UI can explain.
 * status: "ok" | "target-conflict" | "needs-answer" | "no-supported"
 */
export function resolve(recipe, servings, constraints, pantry = {}) {
  const groups = candidates(recipe, servings, constraints, pantry);
  const questions = openQuestions(constraints);
  const hasTargets = TARGETS.some((n) => constraints.targets?.[n] != null);
  const meeting = groups.eligible.filter((c) => c.targetStatus === "meets" || (!hasTargets));
  const result = { ...groups, questions, status: "ok", explanation: null, choices: [] };

  if (!groups.eligible.length) {
    if (groups.needsAnswer.length) {
      result.status = "needs-answer";
      const keys = [...new Set(groups.needsAnswer.flatMap((c) => c.ev.check.questions.map((q) => q.key)))];
      result.explanation = `The supported versions depend on an answer you haven't given yet: ${keys.map((k) => questions.find((q) => q.key === k)?.text ?? k).join(" ")}`;
    } else {
      result.status = "no-supported";
      const closest = groups.notEligible[0];
      result.explanation = closest
        ? `No supported version of ${recipe.title} fits. The closest one still has: ${closest.blockers.map((b) => b.text).join("; ")}.`
        : `There are no supported versions of ${recipe.title}.`;
    }
    result.choices = otherDishes(recipe, constraints, pantry);
    return result;
  }

  if (hasTargets && !meeting.length) {
    result.status = "target-conflict";
    const parts = [];
    const lower = {};
    for (const n of TARGETS) {
      const t = constraints.targets?.[n];
      if (t == null) continue;
      const best = bestRange(groups.eligible, n);
      if (!best) parts.push(`${n} can't be estimated for the eligible versions`);
      else if (best.low < t) {
        parts.push(`the most ${n} any eligible version reaches is about ${best.low}–${best.high} g per serving, against your ${t} g target`);
        lower[n] = best.low;
      }
    }
    result.explanation = `Within your requirements, ${parts.join(", and ")}.`;
    if (Object.keys(lower).length) result.choices.push({ type: "lower-target", values: lower });
    for (const acc of accompaniments(recipe, servings, constraints, pantry)) result.choices.push(acc);
    result.choices.push(...otherDishes(recipe, constraints, pantry, { requireTarget: true }));
  }
  return result;
}

/** Supported side dishes and what they'd add per serving, evaluated under the same constraints. */
export function accompaniments(recipe, servings, constraints, pantry) {
  const out = [];
  for (const id of recipe.accompaniments ?? []) {
    const side = getRecipe(id);
    if (!side) continue;
    const g = candidates(side, servings, { ...constraints, targets: {} }, pantry);
    const pick = g.eligible[0];
    if (!pick) continue;
    out.push({ type: "accompaniment", recipe: side, option: pick, adds: { protein: pick.ev.nutrition.protein, fiber: pick.ev.nutrition.fiber } });
  }
  return out;
}

/**
 * Other supported dishes that fit the hard constraints. Dishes whose best
 * eligible version meets the targets come first; when `requireTarget` is set,
 * only those are returned.
 */
export function otherDishes(recipe, constraints, pantry, { limit = 3, requireTarget = false } = {}) {
  const out = [];
  const hasTargets = TARGETS.some((n) => constraints.targets?.[n] != null);
  for (const r of RECIPES) {
    if (r.id === recipe.id || r.course === "drink") continue;
    const g = candidates(r, r.servings, constraints, pantry);
    const pick = g.eligible[0];
    if (!pick) continue;
    const meets = !hasTargets || pick.targetStatus === "meets";
    if (requireTarget && !meets) continue;
    out.push({ type: "other-dish", recipe: r, option: pick, meets });
  }
  const focus = TARGETS.find((n) => constraints.targets?.[n] != null);
  const mid = (o) => (focus && !o.option.ev.nutrition[focus].incomplete ? o.option.ev.nutrition[focus].mid : 0);
  return out.sort((a, b) => Number(b.meets) - Number(a.meets) || mid(b) - mid(a) || a.option.ev.purchases - b.option.ev.purchases).slice(0, limit);
}
