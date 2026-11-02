// Local persistence. Everything lives in this browser's localStorage under one
// key; storage failures (private mode, blocked storage) fall back to memory.
// Version 2 adds working sessions, saved versions, planned meals, drafts and
// cooking records. Version 1 saves are migrated, keeping the person's work.

import { emptyList } from "./core/shopping.js";
import { migrate as migratePantry } from "./core/pantry.js";
import { defaultConstraints, normalizeConstraints } from "./core/constraints.js";
import { getRecipe } from "./data/recipes.js";
import { getSwap } from "./data/swaps.js";

const KEY = "mise-match:v1"; // key kept so older saves are found; the shape carries its own version

export function initialState() {
  return {
    version: 2,
    profile: defaultConstraints(), // standing requirements; each session can adjust them for today
    saved: ["chana-palak", "masoor-dal"], // bookmarked originals (demo starting state)
    sessions: {}, // recipeId -> working session (core/versions.js), autosaved
    versions: {}, // versionId -> saved version, only on an explicit Save
    drafts: {}, // draftId -> imported draft (core/importer.js)
    pantry: {}, // key -> { qty?, unit?, some?, free?, name? } (core/pantry.js)
    plan: [], // planned meals, in list order (core/versions.js planEntry)
    list: emptyList(), // grocery list; sources keyed by planned meal id
    confirmations: {}, // "<planId>|<item>" -> "enough" | "buy"
    cooks: [], // cooking records with optional feedback
    lastSession: null, // recipeId of the most recently touched session
  };
}

/** Version 1 → 2: adapted recipes become saved versions (their work is kept), list recipes become planned meals. */
export function migrateV1(data) {
  const base = initialState();
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

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const data = JSON.parse(raw);
    if (data?.version === 1) return migrateV1(data);
    if (data?.version !== 2) return initialState();
    const base = initialState();
    return {
      ...base,
      ...data,
      profile: normalizeConstraints(data.profile),
      list: { ...base.list, ...data.list },
    };
  } catch {
    return initialState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  return initialState();
}
