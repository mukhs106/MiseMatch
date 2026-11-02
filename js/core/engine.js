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
import { deriveRecipe, servingsBounds } from "./adapt.js";
import { estimate, targetStatus } from "./nutrition.js";
import { checkItems, describe, relevantQuestions } from "./constraints.js";
import { needsFor } from "./shopping.js";

const TARGETS = ["protein", "fiber"];
const STATUS_ORDER = { meets: 0, maybe: 1, unknown: 2, misses: 3 };

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Supported, untested or blocked, with the pairs that make it so. Support needs
 * the whole set to be authored: a declared pair for two rules, an exact bundle
 * for three or more. Declared pairs alone keep a larger set untested
 * (wholeSetUntested), and support is never a claim of kitchen testing.
 */
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
      else if (!((a.combinesWith ?? []).includes(b.id) || (b.combinesWith ?? []).includes(a.id) || bundles.some((x) => sameSet(x.swaps, [a.id, b.id])))) {
        untested.push({ a, b });
      }
    }
  }
  const authored = bundles.some((x) => sameSet(x.swaps, applied));
  if (authored && !blocked.length) return { status: "supported", blocked, untested: [], wholeSetUntested: false };
  const wholeSetUntested = !blocked.length && !untested.length && swaps.length >= 3;
  return { status: blocked.length ? "blocked" : untested.length || wholeSetUntested ? "untested" : "supported", blocked, untested, wholeSetUntested };
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
 * Active, elapsed and advance time for a version. Times describe the written
 * batch and are never scaled by portions, because nothing here has evidence for it.
 */
export function timingFor(recipe, applied) {
  const swaps = applied.map(getSwap).filter(Boolean);
  const elapsed = totalMinutes(recipe, applied);
  const active = (recipe.timing?.active ?? recipe.minutes) + swaps.reduce((sum, s) => sum + (s.activeDelta ?? 0), 0);
  const advance = swaps.reduce((sum, s) => sum + (s.advanceMinutes ?? 0), 0);
  return { active: Math.min(active, elapsed), elapsed, advance };
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
  const [minServings, maxServings] = servingsBounds(recipe);
  const portionIssue = adaptation.servings < minServings || adaptation.servings > maxServings
    ? `This dish is written for ${minServings} to ${maxServings} servings, so ${adaptation.servings} isn't a supported batch size.` : null;
  const timing = timingFor(recipe, adaptation.applied);
  const minutes = timing.elapsed;
  // An overnight soak can't qualify as a quick dinner because its hands-on time is short.
  const overTime = constraints.timeLimit != null && minutes + timing.advance > constraints.timeLimit;
  const nutrition = estimate(derived);
  const targets = {};
  for (const n of TARGETS) {
    const t = constraints.targets?.[n];
    if (t != null) targets[n] = { target: t, status: targetStatus(nutrition[n], t) };
  }
  const needs = needsFor(derived, pantry).filter((n) => !n.optional);
  const purchases = needs.filter((n) => !n.check).length;
  const toCheck = needs.filter((n) => n.unchecked).length;
  const missing = [...new Set(derived.ingredients.flatMap((l) => (l.optional ? [] : l.entries.map((e) => e.item))))].filter((id) => pantry[id]?.out || pantry[id]?.qty === 0);
  const planAhead = adaptation.applied.map(getSwap).filter((s) => s?.planAhead).map((s) => s.planAhead);
  return { recipe, adaptation, derived, check, combo, qtyIssues, portionIssue, minutes, timing, overTime, nutrition, targets, purchases, toCheck, missing, planAhead };
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
  if (ev.portionIssue) out.push({ kind: "quantity", text: ev.portionIssue });
  if (ev.overTime) out.push({ kind: "limit", text: ev.timing.advance ? `Needs preparation ahead (${ev.planAhead.join(" ")}), over your ${ev.constraints.timeLimit}-minute limit.` : `About ${ev.minutes} minutes, over your ${ev.constraints.timeLimit}-minute limit.` });
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
    || a.ev.missing.length - b.ev.missing.length // what you said is missing shapes the first recommendations
    || a.ev.check.dislikes.length - b.ev.check.dislikes.length
    || (focus.length && a.targetStatus !== "meets" ? reach(b) - reach(a) : 0)
    || a.ev.purchases - b.ev.purchases
    || a.applied.length - b.applied.length
    || a.ev.minutes - b.ev.minutes;
  eligible.sort(rank);
  needsAnswer.sort(rank);
  notEligible.sort((a, b) => a.blockers.length - b.blockers.length || rank(a, b));
  return { eligible, needsAnswer, notEligible };
}

/** Which fit group an eligible candidate belongs to, from its worst target. */
export function fitGroup(candidate) {
  return { meets: "meets", maybe: "may", unknown: "unknown", misses: "closest" }[candidate.targetStatus];
}

/** Eligible candidates grouped by target achievement. Eligibility itself is already settled. */
export function groupByFit(eligible) {
  const groups = { meets: [], may: [], closest: [], unknown: [] };
  for (const c of eligible) groups[fitGroup(c)].push(c);
  return groups;
}

const estimable = (c, focus) => focus.every((n) => !c.ev.nutrition[n].incomplete);

/**
 * A lower target set achieved by one eligible candidate, evaluated as a set, so
 * it never promises joint feasibility from maxima that belong to different versions.
 */
function lowerTargetSet(eligible, focus, targets) {
  const usable = eligible.filter((c) => estimable(c, focus));
  if (!usable.length) return null;
  const worstReach = (c) => Math.min(...focus.map((n) => c.ev.nutrition[n].low / targets[n]));
  const pick = [...usable].sort((a, b) => worstReach(b) - worstReach(a))[0];
  const values = {};
  for (const n of focus) {
    const low = pick.ev.nutrition[n].low;
    if (low < targets[n]) values[n] = low;
  }
  if (!Object.keys(values).length || Object.values(values).some((v) => v < 1)) return null;
  return { type: "lower-target", values, option: pick };
}

/**
 * Resolve a request into an answer the UI can explain.
 * status: "ok" | "target-conflict" | "needs-answer" | "no-supported"
 * cause (why, so copy never blames something that isn't set):
 *   "may-meet" | "out-of-reach" | "requirements" | "no-data" | "competing"
 *   | "diet" | "time" | "portions" | "answer"
 */
export function resolve(recipe, servings, constraints, pantry = {}) {
  const groups = candidates(recipe, servings, constraints, pantry);
  const allItems = [...groups.eligible, ...groups.needsAnswer, ...groups.notEligible].flatMap((c) => c.ev.derived.ingredients.flatMap((l) => l.entries.map((e) => e.item)));
  const questions = relevantQuestions(constraints, allItems);
  const focus = TARGETS.filter((n) => constraints.targets?.[n] != null);
  const hasTargets = focus.length > 0;
  const restricted = describe(constraints).length > 0 || constraints.timeLimit != null;
  const meeting = groups.eligible.filter((c) => c.targetStatus === "meets" || !hasTargets);
  const result = { ...groups, fit: groupByFit(groups.eligible), questions, status: "ok", cause: null, explanation: null, choices: [] };

  if (!groups.eligible.length) {
    if (groups.needsAnswer.length) {
      result.status = "needs-answer";
      result.cause = "answer";
      const keys = [...new Set(groups.needsAnswer.flatMap((c) => c.ev.check.questions.map((q) => q.key)))];
      result.explanation = `The supported versions depend on an answer you haven't given yet: ${keys.map((k) => questions.find((q) => q.key === k)?.text ?? k).join(" ")}`;
    } else {
      result.status = "no-supported";
      const kinds = new Set(groups.notEligible.flatMap((c) => c.blockers.map((b) => b.kind)));
      result.cause = kinds.has("conflict") ? "diet" : kinds.has("limit") ? "time" : "portions";
      const closest = groups.notEligible[0];
      result.explanation = closest
        ? `No supported version of ${recipe.title} fits. The closest one still has: ${closest.blockers.map((b) => b.text).join("; ")}.`
        : `There are no supported versions of ${recipe.title}.`;
    }
    result.choices = otherDishes(recipe, constraints, pantry, { servings });
    return result;
  }

  if (hasTargets && !meeting.length) {
    result.status = "target-conflict";
    const parts = [];
    for (const n of focus) {
      const t = constraints.targets[n];
      const best = groups.eligible.map((c) => c.ev.nutrition[n]).filter((r) => !r.incomplete).sort((a, b) => b.mid - a.mid)[0];
      if (!best) parts.push(`${n} can't be estimated for these versions`);
      else if (best.low < t) parts.push(`the most ${n} any version reaches is about ${best.low}–${best.high} g per serving, against your ${t} g target`);
    }
    const lead = restricted ? "Within your requirements, " : `Across the supported versions of ${recipe.title}, `;
    result.explanation = `${lead}${parts.join(", and ")}.`;
    // Each target can be reached by some version, but no version reaches them together.
    const reachedBy = Object.fromEntries(focus.map((n) => [n, groups.eligible.find((c) => c.ev.targets[n]?.status === "meets") ?? null]));
    const competing = focus.length > 1 && focus.every((n) => reachedBy[n]);
    if (competing) {
      result.competing = reachedBy;
      result.explanation = `No single version reaches both goals. ${focus.map((n) => `“${reachedBy[n].kind === "original" ? "As written" : reachedBy[n].label}” reaches ${n}`).join("; ")}, but neither reaches both.`;
    }
    const excludedWouldMeet = groups.notEligible.some((c) => c.targetStatus === "meets");
    result.cause = groups.eligible.every((c) => c.targetStatus === "unknown") ? "no-data"
      : competing ? "competing"
        : result.fit.may.length ? "may-meet"
          : excludedWouldMeet && restricted ? "requirements" : "out-of-reach";
    const lower = lowerTargetSet(groups.eligible, focus, constraints.targets);
    if (lower) result.choices.push(lower);
    for (const acc of accompaniments(recipe, servings, constraints, pantry)) result.choices.push(acc);
    result.choices.push(...otherDishes(recipe, constraints, pantry, { requireTarget: true, servings }));
  }
  return result;
}

/** Supported side dishes and what they'd add per serving, evaluated under the same constraints. */
export function accompaniments(recipe, servings, constraints, pantry) {
  const out = [];
  for (const id of recipe.accompaniments ?? []) {
    const side = getRecipe(id);
    if (!side) continue;
    const [min, max] = servingsBounds(side);
    const proposed = Math.min(max, Math.max(min, servings));
    const g = candidates(side, proposed, { ...constraints, targets: {} }, pantry);
    const pick = g.eligible[0];
    if (!pick) continue;
    out.push({ type: "accompaniment", recipe: side, option: pick, servings: proposed, adds: { protein: pick.ev.nutrition.protein, fiber: pick.ev.nutrition.fiber } });
  }
  return out;
}

/**
 * Other supported dishes that fit the hard constraints. Dishes whose best
 * eligible version meets the targets come first; when `requireTarget` is set,
 * only those are returned.
 */
export function otherDishes(recipe, constraints, pantry, { limit = 3, requireTarget = false, servings = null } = {}) {
  const out = [];
  const hasTargets = TARGETS.some((n) => constraints.targets?.[n] != null);
  for (const r of RECIPES) {
    if (r.id === recipe.id || r.course === "drink") continue;
    const [min, max] = servingsBounds(r);
    const proposed = Math.min(max, Math.max(min, servings ?? r.servings));
    const g = candidates(r, proposed, constraints, pantry);
    const pick = g.eligible[0];
    if (!pick) continue;
    const meets = !hasTargets || pick.targetStatus === "meets";
    if (requireTarget && !meets) continue;
    out.push({ type: "other-dish", recipe: r, option: pick, meets, servings: proposed });
  }
  const focus = TARGETS.find((n) => constraints.targets?.[n] != null);
  const mid = (o) => (focus && !o.option.ev.nutrition[focus].incomplete ? o.option.ev.nutrition[focus].mid : 0);
  return out.sort((a, b) => Number(b.meets) - Number(a.meets) || mid(b) - mid(a) || a.option.ev.purchases - b.option.ev.purchases).slice(0, limit);
}
