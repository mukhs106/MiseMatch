// Working sessions, saved versions, planned meals and cooking records.
//
//   session   one per recipe: the adaptation you're working on. Autosaved on
//             every change, resumable, with an undo history. Never appears in
//             your saved collection until you choose Save.
//   version   a saved adaptation in your collection. The original recipe is
//             never changed; a version records which recipe (or which earlier
//             version) it came from, so the relationship stays readable.
//             Updating a version bumps its revision.
//   plan      planned meals reference an exact version + revision and serving
//             count, with a copy of its rules, so a later edit to the version
//             is offered as a reviewable update instead of changing the list.
//   cook      a record of what was actually cooked (exact rules and servings),
//             with optional feedback attached to that exact version.
//   cooking   a cook mode visit in progress: frozen at entry, with its own checklist.
//
// Saved, planned and cooked records carry recipe and rule revisions and a
// reproducible snapshot of the derived result. While the catalogue still matches,
// the live derivation is identical. If a rule is renamed or changed later, the
// record's snapshot still says exactly what was saved, planned or cooked.

import { getRecipe } from "../data/recipes.js";
import { getSwap } from "../data/swaps.js";
import { ITEMS } from "../data/items.js";
import { deriveRecipe } from "./adapt.js";

const HISTORY = 20;
const REVISION_DEFAULT = 1;

/** Collision-resistant id, with a fallback for browsers without crypto.randomUUID. */
export function uid(prefix) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export const recipeRev = (recipe) => recipe?.rev ?? REVISION_DEFAULT;
export const ruleRev = (swap) => swap?.rev ?? REVISION_DEFAULT;

/** A reproducible copy of what this adaptation derives to right now. */
export function deriveSnapshot(recipe, adaptation, now = Date.now(), basis = "recorded") {
  const d = deriveRecipe(recipe, adaptation);
  return {
    recipeId: recipe.id,
    recipeRev: recipeRev(recipe),
    title: recipe.title,
    servings: adaptation.servings,
    basis, // "recorded" when it happened; "migrated" when written during a later store migration
    takenAt: now,
    rules: adaptation.applied.map((id) => {
      const swap = getSwap(id);
      return { id, rev: swap ? ruleRev(swap) : null, label: swap?.label ?? id };
    }),
    ingredients: d.ingredients.map((l) => ({
      slot: l.slot,
      group: l.group,
      scaling: l.scaling,
      optional: !!l.optional,
      omitted: l.omitted,
      added: !!l.addedBy,
      changed: l.changedBy.length > 0,
      entries: l.entries.map((e) => ({ item: e.item, name: ITEMS[e.item]?.name ?? e.item, qty: e.qty, unit: e.unit, prep: e.prep ?? null, step: e.step ?? null, optional: !!e.optional })),
    })),
    steps: d.steps.map((st) => ({ id: st.id, text: st.text, changed: st.changedBy.length > 0, added: st.added })),
  };
}

/**
 * Whether a record still matches the catalogue. `intact` means deriving it live
 * reproduces its snapshot; otherwise the snapshot is the truth and the differences are named.
 */
export function recordStatus(rec) {
  const recipe = getRecipe(rec.recipeId);
  const missingRules = (rec.applied ?? []).filter((id) => !getSwap(id));
  const stored = rec.snapshot?.rules ?? [];
  const changedRules = stored.filter((r) => r.rev != null && getSwap(r.id) && ruleRev(getSwap(r.id)) !== r.rev).map((r) => r.id);
  const recipeChanged = !!rec.snapshot && recipeRev(recipe) !== rec.snapshot.recipeRev;
  return { intact: !!recipe && !missingRules.length && !changedRules.length && !recipeChanged, missingRules, changedRules, recipeChanged };
}

/** A derived-recipe shaped view of a stored snapshot. */
export function hydrateSnapshot(snap) {
  return {
    recipe: getRecipe(snap.recipeId),
    servings: snap.servings,
    factor: 1,
    fromSnapshot: true,
    ingredients: snap.ingredients.map((l) => ({ ...l, changedBy: l.changed ? ["snapshot"] : [], addedBy: l.added ? "snapshot" : null, entries: l.entries.map((e) => ({ ...e, prep: e.prep ?? undefined, step: e.step ?? undefined })) })),
    steps: snap.steps.map((st) => ({ ...st, changedBy: st.changed ? ["snapshot"] : [] })),
    method: {},
    applied: snap.rules.map((r) => ({ id: r.id, label: r.label })),
    cautions: [],
  };
}

/** The derived result for a saved, planned or cooked record. Never silently drops a changed rule. */
export function derivedForRecord(rec) {
  if (rec.snapshot && !recordStatus(rec).intact) return hydrateSnapshot(rec.snapshot);
  return deriveRecipe(getRecipe(rec.recipeId), rec);
}

/** Labels for a record's rules, from its own snapshot when the catalogue no longer has them. */
export function ruleLabels(rec) {
  return (rec.applied ?? []).map((id) => getSwap(id)?.label ?? rec.snapshot?.rules.find((r) => r.id === id)?.label ?? `${id} (no longer in the catalogue)`);
}

export function snapshotOf(x) {
  return { servings: x.servings, applied: [...x.applied] };
}

/** The session's adaptation plus the optional items you chose, for planning. */
export function snapshotWithOptional(x) {
  return { ...snapshotOf(x), includeOptional: [...(x.includeOptional ?? [])] };
}

export function sameSnapshot(a, b) {
  return a.servings === b.servings && a.applied.length === b.applied.length && a.applied.every((id, i) => id === b.applied[i]);
}

/** Start a session from the original or from a saved version. */
export function startSession(recipe, version = null, now = Date.now()) {
  const base = version ? snapshotOf(version) : { servings: recipe.servings, applied: [] };
  // A rule that no longer exists can't be worked with; it's named, and the saved version keeps it.
  const droppedRules = base.applied.filter((id) => !getSwap(id)).map((id) => version?.snapshot?.rules.find((r) => r.id === id)?.label ?? id);
  base.applied = base.applied.filter((id) => getSwap(id));
  return { recipeId: recipe.id, baseVersion: version?.id ?? null, ...base, history: [], step: "needs", updatedAt: now, constraints: null, missing: [], ...(droppedRules.length ? { droppedRules } : {}) };
}

/** Record a change; the previous state goes on the undo history. */
export function changeSession(session, patch, now = Date.now()) {
  const prev = { servings: session.servings, applied: [...session.applied], constraints: session.constraints, missing: [...(session.missing ?? [])] };
  return { ...session, ...patch, history: [...session.history, prev].slice(-HISTORY), updatedAt: now };
}

export function undoSession(session, now = Date.now()) {
  if (!session.history.length) return session;
  const prev = session.history[session.history.length - 1];
  return { ...session, ...prev, history: session.history.slice(0, -1), updatedAt: now };
}

/** What the session started from: the base version's snapshot or the original. */
export function baseSnapshot(session, versions) {
  const v = session.baseVersion && versions[session.baseVersion];
  if (v) return snapshotOf(v);
  const r = getRecipe(session.recipeId);
  return { servings: r.servings, applied: [] };
}

/** Changed since it was started (and not yet saved). */
export function hasUnsavedChanges(session, versions) {
  return !sameSnapshot(session, baseSnapshot(session, versions));
}

/** Differs from the original recipe at all (servings or rules). */
export function isAdaptedSnapshot(recipe, snap) {
  return snap.servings !== recipe.servings || snap.applied.length > 0;
}

/**
 * Save the session. mode "new" adds a version (whose parent is the version the
 * session started from, if any); mode "update" overwrites the base version and
 * bumps its revision. Returns { versions, session, id }.
 */
export function saveSession(versions, session, { mode = "new", name, now = Date.now() } = {}) {
  const recipe = getRecipe(session.recipeId);
  const next = { ...versions };
  if (mode === "update" && session.baseVersion && next[session.baseVersion]) {
    const v = next[session.baseVersion];
    next[v.id] = { ...v, ...snapshotOf(session), name: name ?? v.name, rev: v.rev + 1, updatedAt: now, recipeRev: recipeRev(recipe), snapshot: deriveSnapshot(recipe, session, now) };
    return { versions: next, session: { ...session, history: [], updatedAt: now }, id: v.id };
  }
  const count = Object.values(versions).filter((v) => v.recipeId === recipe.id).length;
  const id = uid("v");
  next[id] = {
    id,
    recipeId: recipe.id,
    name: name?.trim() || (count ? `Your version ${count + 1}` : "Your version"),
    ...snapshotOf(session),
    parent: session.baseVersion ?? null,
    source: recipe.source,
    rev: 1,
    createdAt: now,
    updatedAt: now,
    visibility: "private", // publishing is a separate, later action
    recipeRev: recipeRev(recipe),
    snapshot: deriveSnapshot(recipe, session, now),
  };
  return { versions: next, session: { ...session, baseVersion: id, history: [], updatedAt: now }, id };
}

/** "From the original" or "From <parent name>", for showing relationships in plain words. */
export function lineage(version, versions) {
  if (!version.parent) return "Based on the original recipe";
  const p = versions[version.parent];
  return p ? `Based on your “${p.name}”` : "Based on a version you've since removed";
}

// ---------- planned meals ----------

export function planEntry({ recipeId, version = null, snapshot, servings, fromSession = false, now = Date.now() }) {
  const recipe = getRecipe(recipeId);
  return {
    id: uid("p"),
    recipeId,
    versionId: version?.id ?? null,
    rev: version?.rev ?? null,
    label: version ? version.name : snapshot.applied.length ? "Unsaved changes" : "Original",
    applied: [...snapshot.applied],
    servings,
    addedAt: now,
    fromSession,
    includeOptional: [...(snapshot.includeOptional ?? [])],
    recipeRev: recipeRev(recipe),
    snapshot: deriveSnapshot(recipe, { servings, applied: snapshot.applied }, now),
  };
}

/** Same dish, same rules, same portions: adding it again is the same action, not another meal. */
export function samePlanned(a, b) {
  return a.recipeId === b.recipeId && a.servings === b.servings && a.applied.length === b.applied.length && a.applied.every((id) => b.applied.includes(id));
}

/** Change a planned meal's portions, refreshing its snapshot. */
export function setPlanServings(entry, servings, now = Date.now()) {
  return { ...entry, servings, snapshot: deriveSnapshot(getRecipe(entry.recipeId), { servings, applied: entry.applied }, now) };
}

/**
 * Whether the saved version behind a planned meal changed after it was planned.
 * @returns null | { kind: "updated", version } | { kind: "removed" }
 */
export function planUpdate(entry, versions) {
  const status = recordStatus(entry);
  if (entry.snapshot && !status.intact) return { kind: "catalogue", status };
  if (!entry.versionId) return null;
  const v = versions[entry.versionId];
  if (!v) return { kind: "removed" };
  if (v.rev !== entry.rev) return { kind: "updated", version: v };
  return null;
}

/** Accept a reviewed update: take the version's current rules; keep the planned servings. */
export function acceptPlanUpdate(entry, version) {
  const applied = version.applied.filter((id) => getSwap(id));
  return { ...entry, applied, rev: version.rev, label: version.name, keptCopy: false, snapshot: deriveSnapshot(getRecipe(entry.recipeId), { servings: entry.servings, applied }) };
}

// ---------- cooking records ----------

export function cookRecord({ recipeId, versionId = null, rev = null, snapshot, derived = null, planId = null, madeUnder = null, now = Date.now() }) {
  return {
    id: uid("c"),
    recipeId,
    versionId,
    rev,
    planId,
    madeUnder, // a short "made under these requirements" note. Not a claim about today's.
    servings: snapshot.servings,
    applied: [...snapshot.applied],
    cookedAt: now,
    recipeRev: derived?.recipeRev ?? recipeRev(getRecipe(recipeId)),
    snapshot: derived ?? deriveSnapshot(getRecipe(recipeId), snapshot, now),
    pantryUpdate: null, // { at, takes } once the optional pantry review was applied
    feedback: null, // { again: "yes"|"maybe"|"no", familiar: "very"|"somewhat"|"not", differed, changedIngredients, followedMethod }
  };
}

// ---------- cook mode in progress ----------

/**
 * Freeze what's being cooked at entry. Later edits elsewhere don't change it, and
 * its checklist belongs to this visit alone, so switching recipes can't mix progress.
 */
export function beginCooking({ key, recipeId, versionId = null, rev = null, planId = null, label, adaptation, derived = null, now = Date.now() }) {
  const recipe = getRecipe(recipeId);
  return {
    id: uid("k"),
    key,
    recipeId,
    versionId,
    rev,
    planId,
    label,
    servings: adaptation.servings,
    applied: [...adaptation.applied],
    snapshot: derived ?? deriveSnapshot(recipe, adaptation, now),
    checks: {},
    startedAt: now,
  };
}

/** Versions you said you'd make again, most recent first. Unsaved meals stay repeatable from their own record. */
export function repeatable(cooks, versions) {
  const seen = new Set();
  const out = [];
  for (const c of [...cooks].sort((a, b) => b.cookedAt - a.cookedAt)) {
    if (c.feedback?.again !== "yes") continue;
    const key = c.versionId ?? `${c.recipeId}:${c.applied.join("+")}:${c.servings}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
