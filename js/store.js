// Local persistence. Everything lives in this browser's localStorage under one
// key, with a separate revision counter for detecting other tabs.
//
// Version 3 adds revisions and reproducible snapshots to saved, planned and
// cooked records, persisted cook mode, recovery records and requirement-bound
// confirmations. Older saves migrate explicitly: version 1 keeps the person's
// work as versions and planned meals; version 2 gains snapshots marked
// basis: "migrated" (written from the catalogue at migration, not at the time),
// and a copy of the original save is kept beside it.
//
// Nothing readable is ever lost silently:
//   unreadable or future-version data is copied aside and left in place, and the
//     app won't write over it until the person chooses (`protectedData`);
//   bad records in a readable save are skipped one by one, with an explanation,
//     and kept in `skipped` for export.

import { emptyList } from "./core/shopping.js";
import { migrate as migratePantry } from "./core/pantry.js";
import { defaultConstraints, normalizeConstraints } from "./core/constraints.js";
import { deriveSnapshot } from "./core/versions.js";
import { getRecipe } from "./data/recipes.js";
import { getSwap } from "./data/swaps.js";
import { ITEMS } from "./data/items.js";

const KEY = "mise-match:v1"; // key kept so older saves are found; the shape carries its own version
const REV_KEY = "mise-match:v1:rev";
const QUARANTINE_KEY = "mise-match:quarantine";
const BACKUP_V2_KEY = "mise-match:backup:v2";
export const STATE_VERSION = 3;

let revision = 0; // this tab's view of the stored revision
let protectedData = null; // { kind: "corrupt" | "future", raw, version? }
let lastReport = { skipped: [], migratedFrom: null };

export function initialState() {
  return {
    version: STATE_VERSION,
    profile: defaultConstraints(), // standing requirements; each session can adjust them for today
    saved: ["chana-palak", "masoor-dal"], // bookmarked originals (demo starting state)
    sessions: {}, // recipeId -> working session (core/versions.js), autosaved
    versions: {}, // versionId -> saved version, only on an explicit Save
    drafts: {}, // draftId -> imported draft (core/importer.js)
    pantry: {}, // key -> entry (core/pantry.js)
    pantryRevisions: {}, // key -> counter, bumped whenever that entry changes
    plan: [], // planned meals, in list order (core/versions.js planEntry)
    list: emptyList(), // grocery list; sources keyed by planned meal id
    confirmations: {}, // item -> { fingerprint: "enough" | "buy" } (core/shopping.js)
    cooks: [], // cooking records with optional feedback
    cooking: {}, // cook mode visits in progress, by route key (core/versions.js)
    recovery: [], // narrow undo records (core/recovery.js)
    skipped: [], // records a load couldn't use, kept for export
    lastSession: null, // recipeId of the most recently touched session
  };
}

/** Version 1 → 2: adapted recipes become saved versions (their work is kept), list recipes become planned meals. */
export function migrateV1(data) {
  const base = { ...initialState(), version: 2 };
  const { pantry, adaptations } = migratePantry(data.pantry, data.adaptations);
  const versions = {};
  const versionFor = {};
  const now = Date.now();
  for (const [recipeId, a] of Object.entries(adaptations ?? {})) {
    const recipe = getRecipe(recipeId);
    if (!recipe) continue;
    const applied = (a.applied ?? []).filter((id) => getSwap(id)?.recipe === recipeId);
    if (a.servings === recipe.servings && !applied.length) continue;
    const id = `v-migrated-${recipeId}`;
    versions[id] = { id, recipeId, name: "Your version", servings: a.servings, applied, parent: null, source: recipe.source, rev: 1, createdAt: now, updatedAt: now, visibility: "private", migrated: true };
    versionFor[recipeId] = versions[id];
  }
  const oldList = { ...base.list, ...(data.list ?? {}) };
  const plan = [];
  for (const recipeId of Object.keys(oldList.synced ?? {})) {
    const recipe = getRecipe(recipeId);
    if (!recipe) continue;
    const v = versionFor[recipeId];
    plan.push({ id: recipeId, recipeId, versionId: v?.id ?? null, rev: v ? 1 : null, label: v ? v.name : "Original", applied: v ? [...v.applied] : [], servings: v ? v.servings : recipe.servings, addedAt: now });
  }
  // Lines for recipes that are no longer in the collection are kept as plain lines.
  const keep = new Set(plan.map((p) => p.id));
  const list = { ...oldList, lines: oldList.lines.map((l) => (l.manual || Object.keys(l.sources ?? {}).every((k) => keep.has(k)) ? l : { ...l, sources: Object.fromEntries(Object.entries(l.sources).filter(([k]) => keep.has(k))) })) };
  return { ...base, saved: (data.saved ?? base.saved).filter(getRecipe), versions, pantry, plan, list };
}

/**
 * Version 2 → 3. Snapshots are written from today's catalogue and marked as such.
 * Rules that no longer exist stay on the record, so nothing is rewritten silently.
 * Old per-meal confirmations aren't bound to any requirement, so they're asked again.
 */
export function migrateV2(data, now = Date.now()) {
  const snap = (rec) => {
    const recipe = getRecipe(rec.recipeId);
    if (!recipe || !Array.isArray(rec.applied) || !Number.isFinite(rec.servings)) return null;
    return deriveSnapshot(recipe, { servings: rec.servings, applied: rec.applied.filter((id) => getSwap(id)) }, now, "migrated");
  };
  const withSnap = (rec) => (rec && typeof rec === "object" && !rec.snapshot ? { ...rec, snapshot: snap(rec) } : rec);
  const versions = data.versions && typeof data.versions === "object" ? Object.fromEntries(Object.entries(data.versions).map(([k, v]) => [k, withSnap(v)])) : data.versions;
  const next = {
    ...data,
    version: STATE_VERSION,
    versions,
    plan: Array.isArray(data.plan) ? data.plan.map(withSnap) : data.plan,
    cooks: Array.isArray(data.cooks) ? data.cooks.map(withSnap) : data.cooks,
    confirmations: {},
    pantryRevisions: {},
    cooking: {},
    recovery: [],
    skipped: [],
  };
  return next;
}

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isCount = (v) => Number.isFinite(v) && v >= 1;
const stringList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Validate a save's shape and every reference, record by record. Good records
 * survive; bad ones are set aside with a reason instead of crashing a view.
 * @returns {{ state, skipped: [{ kind, id, reason, raw }] }}
 */
export function validateState(data) {
  const base = initialState();
  const skipped = [];
  const skip = (kind, id, reason, raw) => skipped.push({ kind, id: String(id), reason, raw });
  const recordProblem = (r) => {
    if (!isObject(r)) return "not a record";
    if (!getRecipe(r.recipeId)) return `it refers to a recipe that isn't in the collection (${r.recipeId})`;
    if (!isCount(r.servings)) return "its serving count isn't valid";
    if (!stringList(r.applied)) return "its list of changes isn't valid";
    return null;
  };
  const pick = (kind, value) => {
    const out = {};
    if (value == null) return out;
    if (!isObject(value)) {
      skip(kind, kind, "this section wasn't in the expected shape", value);
      return out;
    }
    for (const [id, r] of Object.entries(value)) {
      const problem = recordProblem(r);
      if (problem) skip(kind, id, problem, r);
      else out[id] = r;
    }
    return out;
  };
  const pickList = (kind, value) => {
    if (value == null) return [];
    if (!Array.isArray(value)) {
      skip(kind, kind, "this section wasn't in the expected shape", value);
      return [];
    }
    return value.filter((r, i) => {
      const problem = recordProblem(r);
      if (problem) skip(kind, r?.id ?? i, problem, r);
      return !problem;
    });
  };

  const sessions = {};
  for (const [id, r] of Object.entries(pick("session", data.sessions))) sessions[id] = { ...r, history: Array.isArray(r.history) ? r.history : [] };
  const versions = pick("version", data.versions);
  const plan = pickList("planned meal", data.plan);
  const cooks = pickList("cooking record", data.cooks);

  const drafts = {};
  if (isObject(data.drafts)) {
    for (const [id, d] of Object.entries(data.drafts)) {
      if (!isObject(d) || !Array.isArray(d.lines) || !Array.isArray(d.steps) || !isObject(d.source) || !d.lines.every((l) => isObject(l) && typeof l.raw === "string" && isObject(l.match))) skip("draft", id, "its contents couldn't be read", d);
      else drafts[id] = d;
    }
  } else if (data.drafts != null) skip("draft", "drafts", "this section wasn't in the expected shape", data.drafts);

  const pantry = {};
  if (isObject(data.pantry)) {
    for (const [key, e] of Object.entries(data.pantry)) {
      if (!isObject(e)) skip("pantry item", key, "it wasn't in the expected shape", e);
      else if (!key.startsWith("free:") && !ITEMS[key]) skip("pantry item", key, "it refers to an ingredient that isn't in the catalogue", e);
      else if (e.qty != null && !(Number.isFinite(e.qty) && e.qty >= 0)) skip("pantry item", key, "its amount isn't a valid number", e);
      else pantry[key] = e;
    }
  } else if (data.pantry != null) skip("pantry item", "pantry", "this section wasn't in the expected shape", data.pantry);

  const listIn = isObject(data.list) ? data.list : {};
  const lines = (Array.isArray(listIn.lines) ? listIn.lines : []).filter((l, i) => {
    const ok = isObject(l) && typeof l.id === "string" && typeof l.name === "string" && (l.manual || (isObject(l.sources) && Object.values(l.sources).every((s) => isObject(s) && Number.isFinite(s.qty))));
    if (!ok) skip("shopping line", l?.id ?? i, "it wasn't in the expected shape", l);
    return ok;
  });
  const list = { ...base.list, ...listIn, lines, dismissed: isObject(listIn.dismissed) ? listIn.dismissed : {}, synced: isObject(listIn.synced) ? listIn.synced : {}, nextId: Number.isFinite(listIn.nextId) ? listIn.nextId : lines.length + 1 };

  const profile = isObject(data.profile) ? data.profile : {};
  const cleanProfile = normalizeConstraints({
    ...profile,
    avoid: stringList(profile.avoid) ? profile.avoid : [],
    dislikes: stringList(profile.dislikes) ? profile.dislikes : [],
    targets: isObject(profile.targets) ? Object.fromEntries(Object.entries(profile.targets).filter(([, v]) => v == null || Number.isFinite(v))) : {},
    answers: isObject(profile.answers) ? profile.answers : {},
    timeLimit: Number.isFinite(profile.timeLimit) ? profile.timeLimit : null,
  });
  if (data.profile != null && !isObject(data.profile)) skip("requirements", "profile", "they weren't in the expected shape, so defaults are in use", data.profile);

  const cooking = {};
  if (isObject(data.cooking)) {
    for (const [key, r] of Object.entries(data.cooking)) {
      const problem = recordProblem(r);
      if (problem || !isObject(r.snapshot)) skip("cook mode visit", key, problem ?? "it had no record of what was being cooked", r);
      else cooking[key] = { ...r, checks: isObject(r.checks) ? r.checks : {} };
    }
  }

  const state = {
    ...base,
    ...data,
    version: STATE_VERSION,
    profile: cleanProfile,
    saved: stringList(data.saved) ? data.saved.filter(getRecipe) : base.saved,
    sessions,
    versions,
    drafts,
    pantry,
    pantryRevisions: isObject(data.pantryRevisions) ? data.pantryRevisions : {},
    plan,
    list,
    confirmations: isObject(data.confirmations) ? data.confirmations : {},
    cooks,
    cooking,
    recovery: Array.isArray(data.recovery) ? data.recovery.filter(isObject) : [],
    skipped: [...(Array.isArray(data.skipped) ? data.skipped : []), ...skipped],
    lastSession: typeof data.lastSession === "string" && sessions[data.lastSession] ? data.lastSession : null,
  };
  return { state, skipped };
}

function quarantine(raw, kind) {
  try {
    localStorage.setItem(`${QUARANTINE_KEY}:${kind}`, raw);
  } catch {
    /* no room: the original stays in place, and the app won't write over it */
  }
}

function readRevision() {
  try {
    return Number(localStorage.getItem(REV_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function load() {
  protectedData = null;
  lastReport = { skipped: [], migratedFrom: null };
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    lastReport.storageBlocked = true;
    return initialState();
  }
  revision = readRevision();
  if (!raw) return initialState();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = undefined;
  }
  if (!isObject(data) || !Number.isFinite(data.version)) {
    protectedData = { kind: "corrupt", raw };
    quarantine(raw, "corrupt");
    return initialState();
  }
  if (data.version > STATE_VERSION) {
    protectedData = { kind: "future", raw, version: data.version };
    quarantine(raw, "future");
    return initialState();
  }
  try {
    if (data.version === 1) {
      lastReport.migratedFrom = 1;
      data = migrateV2(migrateV1(data));
    } else if (data.version === 2) {
      lastReport.migratedFrom = 2;
      try {
        if (!localStorage.getItem(BACKUP_V2_KEY)) localStorage.setItem(BACKUP_V2_KEY, raw);
      } catch {
        /* the backup is a courtesy; the migration doesn't depend on it */
      }
      data = migrateV2(data);
    } else if (data.version !== STATE_VERSION) {
      protectedData = { kind: "corrupt", raw };
      quarantine(raw, "corrupt");
      return initialState();
    }
    const { state, skipped } = validateState(data);
    lastReport.skipped = skipped;
    return state;
  } catch {
    protectedData = { kind: "corrupt", raw };
    quarantine(raw, "corrupt");
    return initialState();
  }
}

/** What the last load found: { skipped, migratedFrom, storageBlocked? }. */
export const loadReport = () => lastReport;
/** Unreadable or future-version data waiting for a decision, or null. */
export const protectedState = () => protectedData;

/**
 * Write the state, unless another tab has written since this one last read it, or
 * data is protected. Reports what happened; the caller must not claim a durable save otherwise.
 * @returns {{ ok: true } | { ok: false, reason: "protected" | "conflict" | "storage" }}
 */
export function save(state, { force = false } = {}) {
  if (protectedData) return { ok: false, reason: "protected" };
  try {
    if (!force && readRevision() !== revision) return { ok: false, reason: "conflict" };
    localStorage.setItem(KEY, JSON.stringify(state));
    revision = (force ? Math.max(readRevision(), revision) : revision) + 1;
    localStorage.setItem(REV_KEY, String(revision));
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage" };
  }
}

/** Another tab has written since this one last read or wrote. */
export const hasExternalChange = () => readRevision() !== revision;

/** Read what another tab stored, without adopting it, for review. */
export function peekStored() {
  try {
    const { state } = validateState(JSON.parse(localStorage.getItem(KEY)));
    return state;
  } catch {
    return null;
  }
}

/** The person chose to start fresh: the protected copy stays under the quarantine key. */
export function acceptFresh() {
  const kept = protectedData;
  protectedData = null;
  if (kept) {
    quarantine(kept.raw, kept.kind);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing stored */
    }
  }
  revision = readRevision();
  return initialState();
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
    revision = readRevision();
  } catch {
    /* nothing stored */
  }
  return initialState();
}
