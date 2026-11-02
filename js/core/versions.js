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

import { getRecipe } from "../data/recipes.js";

const HISTORY = 20;

export function snapshotOf(x) {
  return { servings: x.servings, applied: [...x.applied] };
}

export function sameSnapshot(a, b) {
  return a.servings === b.servings && a.applied.length === b.applied.length && a.applied.every((id, i) => id === b.applied[i]);
}

/** Start a session from the original or from a saved version. */
export function startSession(recipe, version = null, now = Date.now()) {
  const base = version ? snapshotOf(version) : { servings: recipe.servings, applied: [] };
  return { recipeId: recipe.id, baseVersion: version?.id ?? null, ...base, history: [], step: "needs", updatedAt: now, constraints: null };
}

/** Record a change; the previous state goes on the undo history. */
export function changeSession(session, patch, now = Date.now()) {
  const prev = { servings: session.servings, applied: [...session.applied], constraints: session.constraints };
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
    next[v.id] = { ...v, ...snapshotOf(session), name: name ?? v.name, rev: v.rev + 1, updatedAt: now };
    return { versions: next, session: { ...session, history: [], updatedAt: now }, id: v.id };
  }
  const count = Object.values(versions).filter((v) => v.recipeId === recipe.id).length;
  const id = `v${now.toString(36)}${count}`;
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

export function planEntry({ recipeId, version = null, snapshot, servings, now = Date.now() }) {
  return {
    id: `p${now.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    recipeId,
    versionId: version?.id ?? null,
    rev: version?.rev ?? null,
    label: version ? version.name : snapshot.applied.length ? "Unsaved changes" : "Original",
    applied: [...snapshot.applied],
    servings,
    addedAt: now,
  };
}

/**
 * Whether the saved version behind a planned meal changed after it was planned.
 * @returns null | { kind: "updated", version } | { kind: "removed" }
 */
export function planUpdate(entry, versions) {
  if (!entry.versionId) return null;
  const v = versions[entry.versionId];
  if (!v) return { kind: "removed" };
  if (v.rev !== entry.rev) return { kind: "updated", version: v };
  return null;
}

/** Accept a reviewed update: take the version's current rules; keep the planned servings. */
export function acceptPlanUpdate(entry, version) {
  return { ...entry, applied: [...version.applied], rev: version.rev, label: version.name };
}

// ---------- cooking records ----------

export function cookRecord({ recipeId, versionId = null, rev = null, snapshot, now = Date.now() }) {
  return {
    id: `c${now.toString(36)}`,
    recipeId,
    versionId,
    rev,
    servings: snapshot.servings,
    applied: [...snapshot.applied],
    cookedAt: now,
    feedback: null, // { again: "yes"|"maybe"|"no", familiar: "very"|"somewhat"|"not", differed, changedIngredients, followedMethod }
  };
}

/** Versions you said you'd make again, most recent first. */
export function repeatable(cooks, versions) {
  const seen = new Set();
  const out = [];
  for (const c of [...cooks].sort((a, b) => b.cookedAt - a.cookedAt)) {
    if (c.feedback?.again !== "yes") continue;
    const key = c.versionId ?? `${c.recipeId}:${c.applied.join("+")}:${c.servings}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (c.versionId && !versions[c.versionId]) continue;
    out.push(c);
  }
  return out;
}
