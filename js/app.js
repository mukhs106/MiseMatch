// App controller: routing, actions, rendering and persistence.
// Views are pure functions of (ctx); every action updates state, saves, and re-renders.
// Working sessions autosave on every change; saved versions change only on an explicit Save.

import { getRecipe, RECIPES } from "./data/recipes.js";
import { getSwap } from "./data/swaps.js";
import { ITEMS } from "./data/items.js";
import { load, save, clear } from "./store.js";
import { deriveRecipe, applySwap, removeSwap, setServings } from "./core/adapt.js";
import { resolve, evaluate } from "./core/engine.js";
import { normalizeConstraints } from "./core/constraints.js";
import * as shop from "./core/shopping.js";
import * as pantryCore from "./core/pantry.js";
import * as V from "./core/versions.js";
import * as importer from "./core/importer.js";
import { resolveLine } from "./core/normalize.js";
import { html, plural } from "./ui/html.js";
import { icon } from "./ui/icons.js";
import { todayView } from "./ui/today.js";
import { recipesView } from "./ui/recipes.js";
import { overviewView } from "./ui/overview.js";
import { adaptView } from "./ui/adapt.js";
import { cookView } from "./ui/cook.js";
import { pantryView } from "./ui/pantry.js";
import { listView } from "./ui/list.js";
import { planView } from "./ui/plan.js";
import { savedView } from "./ui/saved.js";
import { importView, draftView } from "./ui/import.js";
import { profileView } from "./ui/profile.js";
import { sheetView } from "./ui/swapSheet.js";

let state = load();
const ui = {
  route: { name: "today" },
  open: {}, // disclosure open state by data-open-key, for this session
  query: "", // Recipes search
  filter: "all", // Recipes: "all" | "fits" | "saved"
  pantryQuery: "",
  focus: [], // Plan: ingredients to use up
  importTab: "paste",
  importText: "",
  importUrl: "",
  importResult: null, // { recipes, problem, url, method }
  cookChecks: {}, // cook mode: step/ingredient checkboxes, this visit only
  bought: {},
  dialog: null,
  toast: null,
};

const root = document.getElementById("app");
const sheet = document.getElementById("sheet");
const toastRegion = document.getElementById("toast");
const nav = document.getElementById("nav");

// ---------- read helpers handed to views ----------

const memo = new Map();
function cached(key, fn) {
  const hit = memo.get(key);
  if (hit && hit.state === state) return hit.value;
  const value = fn();
  memo.set(key, { state, value });
  return value;
}

const ctx = {
  get state() {
    return state;
  },
  ui,
  recipe: getRecipe,
  session: (id) => state.sessions[id] ?? null,
  /** The session if there is one, else the original at its own servings. */
  working: (id) => state.sessions[id] ?? V.startSession(getRecipe(id)),
  constraintsFor: (id) => normalizeConstraints(state.sessions[id]?.constraints ?? state.profile),
  evalFor: (id) => cached(`eval:${id}`, () => evaluate(getRecipe(id), ctx.working(id), ctx.constraintsFor(id), state.pantry)),
  resolveFor: (id) => cached(`resolve:${id}`, () => resolve(getRecipe(id), ctx.working(id).servings, ctx.constraintsFor(id), state.pantry)),
  derivedOf: (recipeId, snap) => deriveRecipe(getRecipe(recipeId), snap),
  /** Shopping needs for every planned meal, pantry allocated once in plan order. */
  planNeeds: () => cached("plan", () => shop.allocateNeeds(state.plan.map((p) => ({ id: p.id, derived: deriveRecipe(getRecipe(p.recipeId), p) })), state.pantry, state.confirmations)),
  /** Needs for the working session, as if it were added after the planned meals. */
  sessionNeeds: (id) => cached(`sneeds:${id}`, () => {
    const entries = state.plan.map((p) => ({ id: p.id, derived: deriveRecipe(getRecipe(p.recipeId), p) }));
    entries.push({ id: `session:${id}`, derived: deriveRecipe(getRecipe(id), ctx.working(id)) });
    return shop.allocateNeeds(entries, state.pantry, state.confirmations).get(`session:${id}`);
  }),
};

// ---------- state changes ----------

function commit(next, { keepFocus = true } = {}) {
  state = next;
  save(state);
  render({ keepFocus });
}

function setSession(id, session, message, { undoable = true } = {}) {
  commit({ ...state, sessions: { ...state.sessions, [id]: session }, lastSession: id });
  if (message) toast(message, undoable ? { label: "Undo", run: () => actions["session-undo"]({ id }) } : null);
}

/** Change the working session (autosaved, with undo). Starts one from the original if needed. */
function changeSession(id, patch, message) {
  const s = state.sessions[id] ?? V.startSession(getRecipe(id));
  setSession(id, V.changeSession(s, patch), message);
}

function setConstraints(scope, fn) {
  if (scope === "profile") {
    commit({ ...state, profile: fn(normalizeConstraints(state.profile)) });
  } else {
    const id = scope.slice("session:".length);
    changeSession(id, { constraints: fn(ctx.constraintsFor(id)) });
  }
}

function syncPlanEntry(list, entry, needs) {
  return shop.syncRecipe(list, { id: entry.id, title: planTitle(entry) }, needs);
}

function planTitle(entry) {
  return getRecipe(entry.recipeId).title;
}

/** Regenerate the grocery list for every planned meal together (pantry is shared out in plan order). */
function syncList({ quiet = false } = {}) {
  const map = ctx.planNeeds();
  let list = state.list;
  const report = { added: 0, updated: 0, conflicts: 0 };
  for (const entry of state.plan) {
    const r = syncPlanEntry(list, entry, map.get(entry.id));
    list = r.list;
    for (const k of Object.keys(report)) report[k] += r.report[k];
  }
  commit({ ...state, list });
  if (quiet) return;
  const parts = [];
  if (report.added) parts.push(`${plural(report.added, "item")} added`);
  if (report.updated) parts.push(`${report.updated} updated`);
  if (report.conflicts) parts.push(`${report.conflicts} to review`);
  toast(parts.length ? `List: ${parts.join(", ")}` : "List is up to date", { label: "View list", href: "#/list" });
}

function addToPlan(recipeId, { version = null, snapshot }) {
  const entry = V.planEntry({ recipeId, version, snapshot, servings: snapshot.servings });
  // Carry over answers given while checking the pantry for this session.
  const confirmations = { ...state.confirmations };
  for (const [k, v] of Object.entries(state.confirmations)) {
    if (k.startsWith(`session:${recipeId}|`)) confirmations[`${entry.id}|${k.split("|")[1]}`] = v;
  }
  state = { ...state, plan: [...state.plan, entry], confirmations };
  syncList();
  return entry;
}

function startFrom(recipeId, versionId = null) {
  const v = versionId ? state.versions[versionId] : null;
  setSession(recipeId, V.startSession(getRecipe(recipeId), v), null);
  location.hash = `#/adapt/${recipeId}/needs`;
}

const actions = {
  // ----- recipes and sessions
  "save-recipe": ({ id }) => {
    commit({ ...state, saved: [...state.saved.filter((x) => x !== id), id] });
    toast("Bookmarked in Saved");
  },
  "unsave-recipe": ({ id }) => {
    commit({ ...state, saved: state.saved.filter((x) => x !== id) });
    toast("Removed the bookmark. Your versions are kept.", { label: "Undo", run: () => commit({ ...state, saved: [...state.saved, id] }) });
  },
  "start-adapt": ({ id, from }) => {
    const existing = state.sessions[id];
    if (existing && V.hasUnsavedChanges(existing, state.versions) && (existing.baseVersion ?? "") !== (from ?? "")) {
      openDialog({ type: "replace-session", recipeId: id, from: from ?? null });
      return;
    }
    // Same starting point with unsaved changes: continue them rather than starting over.
    if (existing && (existing.baseVersion ?? "") === (from ?? "") && V.hasUnsavedChanges(existing, state.versions)) {
      location.hash = `#/adapt/${id}/${existing.step ?? "needs"}`;
      return;
    }
    startFrom(id, from ?? null);
  },
  "confirm-replace-session": ({ id, from }) => {
    closeDialog();
    startFrom(id, from || null);
  },
  "session-undo": ({ id }) => {
    const s = state.sessions[id];
    if (!s?.history.length) return;
    setSession(id, V.undoSession(s), "Change undone", { undoable: false });
  },
  "session-discard": ({ id }) => openDialog({ type: "discard-session", recipeId: id }),
  "confirm-discard-session": ({ id }) => {
    closeDialog();
    const before = state.sessions[id];
    const sessions = { ...state.sessions };
    delete sessions[id];
    commit({ ...state, sessions, lastSession: state.lastSession === id ? null : state.lastSession });
    location.hash = `#/recipe/${id}`;
    toast("Unsaved changes discarded", { label: "Undo", run: () => commit({ ...state, sessions: { ...state.sessions, [id]: before } }) });
  },
  servings: ({ id, delta }) => {
    const s = ctx.working(id);
    const next = setServings(s, s.servings + Number(delta));
    if (next.servings !== s.servings) changeSession(id, { servings: next.servings });
  },
  "go-step": ({ id, step }) => {
    const s = state.sessions[id];
    if (s) state = { ...state, sessions: { ...state.sessions, [id]: { ...s, step } } };
    save(state);
    location.hash = `#/adapt/${id}/${step}`;
  },
  "choose-option": ({ id, applied, label }) => {
    const list = applied ? applied.split(",") : [];
    changeSession(id, { applied: list }, list.length ? `Selected: ${label}` : "Back to the recipe as written");
  },
  "open-swaps": ({ id, slot }) => openDialog({ type: "slot", recipeId: id, slot }),
  "preview-swap": ({ id, swap, from }) => openDialog({ type: "compare", recipeId: id, swapId: swap, from, returnSlot: ui.dialog?.slot }),
  "back-to-options": () => openDialog({ type: "slot", recipeId: ui.dialog.recipeId, slot: ui.dialog.returnSlot }),
  "apply-swap": ({ id, swap, remove }) => {
    const removeIds = remove ? remove.split(",") : [];
    closeDialog();
    changeSession(id, { applied: applySwap(ctx.working(id), swap, removeIds).applied }, `Applied: ${getSwap(swap).label}`);
  },
  "remove-swap": ({ id, swap, close }) => {
    if (close) closeDialog();
    changeSession(id, { applied: removeSwap(ctx.working(id), swap).applied }, `Removed: ${getSwap(swap).label}`);
  },
  "restore-original": ({ id }) => changeSession(id, { applied: [], servings: getRecipe(id).servings }, "Back to the recipe as written"),

  // ----- saving versions (explicit)
  "save-version": ({ id }) => openDialog({ type: "save-version", recipeId: id }),
  "confirm-save-version": ({ id, mode }) => {
    const s = state.sessions[id];
    const typed = sheet.querySelector('[name="version-name"]')?.value?.trim();
    const base = s.baseVersion ? state.versions[s.baseVersion] : null;
    // A new version needs its own name; reusing the base's name would make two look identical.
    const name = mode === "new" && base && typed === base.name ? undefined : typed;
    const res = V.saveSession(state.versions, s, { mode, name });
    closeDialog();
    commit({ ...state, versions: res.versions, sessions: { ...state.sessions, [id]: res.session } });
    const v = res.versions[res.id];
    const affected = state.plan.filter((p) => p.versionId === v.id && V.planUpdate(p, res.versions));
    toast(mode === "update" ? `Updated “${v.name}”${affected.length ? ". Your list has an update to review." : ""}` : `Saved “${v.name}”`, { label: "View in Saved", href: "#/saved" });
  },
  "rename-version": ({ vid }) => openDialog({ type: "rename-version", versionId: vid }),
  "confirm-rename-version": ({ vid }) => {
    const name = sheet.querySelector('[name="version-name"]')?.value?.trim();
    closeDialog();
    if (!name) return;
    commit({ ...state, versions: { ...state.versions, [vid]: { ...state.versions[vid], name } } });
  },
  "delete-version": ({ vid }) => {
    const before = state;
    const versions = { ...state.versions };
    const v = versions[vid];
    delete versions[vid];
    const sessions = Object.fromEntries(Object.entries(state.sessions).map(([k, s]) => [k, s.baseVersion === vid ? { ...s, baseVersion: null } : s]));
    commit({ ...state, versions, sessions }, { keepFocus: false });
    toast(`Removed “${v.name}”. Planned meals keep their own copy.`, { label: "Undo", run: () => commit(before) });
  },

  // ----- constraints
  "c-diet": ({ scope, value }) => setConstraints(scope, (c) => ({ ...c, diet: value || null, eggs: value === "vegetarian" ? c.eggs : null })),
  "c-avoid": ({ scope, value }) => setConstraints(scope, (c) => ({ ...c, avoid: c.avoid.includes(value) ? c.avoid.filter((x) => x !== value) : [...c.avoid, value], nutScope: value === "nuts" && c.avoid.includes("nuts") ? null : c.nutScope })),
  "c-nutscope": ({ scope, value }) => setConstraints(scope, (c) => ({ ...c, nutScope: value })),
  "c-eggs": ({ scope, value }) => setConstraints(scope, (c) => ({ ...c, eggs: value })),
  "c-answer": ({ scope, key, value }) => setConstraints(scope, (c) => ({ ...c, answers: { ...c.answers, [key]: value } })),
  "c-dislike": ({ scope, value }) => setConstraints(scope, (c) => ({ ...c, dislikes: c.dislikes.includes(value) ? c.dislikes.filter((x) => x !== value) : [...c.dislikes, value] })),
  "c-lower-target": ({ id, nutrient, value }) => setConstraints(`session:${id}`, (c) => ({ ...c, targets: { ...c.targets, [nutrient]: Number(value) } })),
  "c-save-profile": ({ id }) => {
    commit({ ...state, profile: ctx.constraintsFor(id) });
    toast("Saved as your usual requirements");
  },
  "c-use-profile": ({ id }) => changeSession(id, { constraints: null }, "Using your usual requirements"),

  // ----- cooking
  "finish-cooking": ({ id, kind, vid }) => {
    let snapshot;
    let version = null;
    if (kind === "version") {
      version = state.versions[vid];
      snapshot = version;
    } else if (kind === "original") snapshot = { servings: getRecipe(id).servings, applied: [] };
    else {
      snapshot = ctx.working(id);
      // A session that matches its saved version counts as cooking that version.
      const s = state.sessions[id];
      if (s?.baseVersion && !V.hasUnsavedChanges(s, state.versions)) version = state.versions[s.baseVersion];
    }
    const rec = V.cookRecord({ recipeId: id, versionId: version?.id ?? null, rev: version?.rev ?? null, snapshot });
    ui.cookChecks = {};
    commit({ ...state, cooks: [...state.cooks, rec] });
    openDialog({ type: "feedback", cookId: rec.id });
  },
  "save-feedback": ({ cook }) => {
    const form = sheet.querySelector("form");
    const data = new FormData(form);
    const feedback = {
      again: data.get("again") || null,
      familiar: data.get("familiar") || null,
      differed: String(data.get("differed") ?? "").trim() || null,
      changedIngredients: data.get("changed") || null,
      followedMethod: data.get("followed") || null,
    };
    closeDialog();
    commit({ ...state, cooks: state.cooks.map((c) => (c.id === cook ? { ...c, feedback } : c)) });
    toast("Thanks. Saved with the version you cooked.");
  },
  "skip-feedback": () => closeDialog(),

  // ----- pantry
  "pantry-toggle": ({ item }) => commit({ ...state, pantry: pantryCore.setAvailability(state.pantry, item, state.pantry[item] ? "need" : "have") }),
  "pantry-add": ({ item }) => {
    ui.pantryQuery = "";
    commit({ ...state, pantry: { ...state.pantry, [item]: state.pantry[item] ?? {} } }, { keepFocus: false });
    document.querySelector('[data-action="pantry-search"]')?.focus();
    toast(`Added ${ITEMS[item].name}`);
  },
  "pantry-add-free": ({ name }) => {
    ui.pantryQuery = "";
    commit({ ...state, pantry: pantryCore.addFree(state.pantry, name) }, { keepFocus: false });
    document.querySelector('[data-action="pantry-search"]')?.focus();
    toast(`Added ${name}. Not matched to recipes yet.`);
  },
  "pantry-remove": ({ key }) => {
    const before = state.pantry;
    const name = pantryCore.displayName(key, before[key]);
    commit({ ...state, pantry: pantryCore.remove(before, key) }, { keepFocus: false });
    toast(`Removed ${name}`, { label: "Undo", run: () => commit({ ...state, pantry: before }) });
  },
  "group-have": ({ id, group }) => {
    let pantry = state.pantry;
    for (const line of deriveRecipe(getRecipe(id), ctx.working(id)).ingredients.filter((l) => l.group === group)) {
      for (const e of line.entries) if (!ITEMS[e.item].noShop && !pantry[e.item]) pantry = pantryCore.setAvailability(pantry, e.item, "have");
    }
    commit({ ...state, pantry });
  },
  confirm: ({ key, value }) => {
    commit({ ...state, confirmations: { ...state.confirmations, [key]: value } });
    if (!key.startsWith("session:")) syncList({ quiet: true });
  },

  // ----- plan and list
  "add-plan": ({ id }) => {
    const s = ctx.working(id);
    if (state.sessions[id] && V.hasUnsavedChanges(s, state.versions) && V.isAdaptedSnapshot(getRecipe(id), s)) {
      openDialog({ type: "plan-unsaved", recipeId: id });
      return;
    }
    const version = s.baseVersion ? state.versions[s.baseVersion] : null;
    addToPlan(id, { version, snapshot: s });
  },
  "plan-save-and-add": ({ id }) => {
    closeDialog();
    const res = V.saveSession(state.versions, state.sessions[id], {});
    state = { ...state, versions: res.versions, sessions: { ...state.sessions, [id]: res.session } };
    addToPlan(id, { version: res.versions[res.id], snapshot: res.versions[res.id] });
  },
  "plan-add-copy": ({ id }) => {
    closeDialog();
    addToPlan(id, { version: null, snapshot: ctx.working(id) });
  },
  "plan-add-option": ({ id, applied, servings }) => {
    addToPlan(id, { version: null, snapshot: { servings: Number(servings), applied: applied ? applied.split(",") : [] } });
  },
  "plan-add-version": ({ vid }) => {
    const v = state.versions[vid];
    addToPlan(v.recipeId, { version: v, snapshot: v });
  },
  "plan-remove": ({ plan }) => {
    const before = state;
    const entry = state.plan.find((p) => p.id === plan);
    let list = shop.unsyncRecipe(state.list, { id: plan, title: "" });
    commit({ ...state, plan: state.plan.filter((p) => p.id !== plan), list }, { keepFocus: false });
    toast(`Removed ${getRecipe(entry.recipeId).title} from your plan`, { label: "Undo", run: () => commit(before) });
  },
  "plan-servings": ({ plan, delta }) => {
    const p = state.plan.find((x) => x.id === plan);
    const servings = Math.min(12, Math.max(1, p.servings + Number(delta)));
    state = { ...state, plan: state.plan.map((x) => (x.id === plan ? { ...x, servings } : x)) };
    syncList({ quiet: true });
  },
  "plan-review-update": ({ plan }) => openDialog({ type: "plan-update", planId: plan }),
  "plan-accept-update": ({ plan }) => {
    closeDialog();
    const entry = state.plan.find((p) => p.id === plan);
    const v = state.versions[entry.versionId];
    state = { ...state, plan: state.plan.map((p) => (p.id === plan ? V.acceptPlanUpdate(p, v) : p)) };
    syncList();
  },
  "plan-keep-copy": ({ plan }) => {
    closeDialog();
    const entry = state.plan.find((p) => p.id === plan);
    commit({ ...state, plan: state.plan.map((p) => (p.id === plan ? { ...p, rev: state.versions[entry.versionId]?.rev ?? p.rev, keptCopy: true } : p)) });
    toast("Kept the planned copy. Your list is unchanged.");
  },
  "plan-focus": ({ item }) => {
    ui.focus = ui.focus.includes(item) ? ui.focus.filter((x) => x !== item) : [...ui.focus, item];
    render();
  },
  "sync-list": () => syncList(),
  "list-to-pantry": ({ line }) => {
    const l = state.list.lines.find((x) => x.id === line);
    if (!l) return;
    let pantry;
    if (l.manual) pantry = pantryCore.addFree(state.pantry, l.name, l.qtyText ?? "");
    else {
      const q = l.override ?? shop.computedQty(l);
      pantry = pantryCore.addBought(state.pantry, l.item, q?.qty, q?.unit);
    }
    ui.bought[line] = true;
    commit({ ...state, pantry });
    toast(`Added ${l.name} to your pantry`, { label: "View pantry", href: "#/pantry" });
  },
  "list-delete": ({ line }) => {
    const before = state.list;
    const name = before.lines.find((l) => l.id === line)?.name;
    commit({ ...state, list: shop.deleteLine(before, line) }, { keepFocus: false });
    toast(`Removed ${name}`, { label: "Undo", run: () => commit({ ...state, list: before }) });
  },
  "list-resolve": ({ line, choice }) => commit({ ...state, list: shop.resolveConflict(state.list, line, choice) }),
  "list-addback": ({ id, key }) => {
    state = { ...state, list: shop.undismiss(state.list, id, key) };
    syncList();
  },
  "list-clear-checked": () => {
    const before = state.list;
    commit({ ...state, list: shop.clearChecked(before) }, { keepFocus: false });
    toast("Cleared checked items", { label: "Undo", run: () => commit({ ...state, list: before }) });
  },

  // ----- import
  "import-tab": ({ tab }) => {
    ui.importTab = tab;
    ui.importResult = null;
    render();
  },
  "import-demo": ({ url }) => {
    ui.importUrl = url;
    ui.importResult = importer.extractFromLink(url);
    render();
  },
  "import-pick": ({ index }) => {
    const res = ui.importResult;
    const draft = importer.buildDraft(res.recipes[Number(index)], { method: res.method ?? "paste", url: res.url ?? null });
    ui.importResult = null;
    ui.importText = "";
    commit({ ...state, drafts: { ...state.drafts, [draft.id]: draft } });
    location.hash = `#/draft/${draft.id}`;
  },
  "import-to-paste": () => {
    ui.importTab = "paste";
    ui.importResult = { ...ui.importResult, keptUrl: ui.importUrl };
    render();
  },
  "draft-omit": ({ draft, line }) => updateDraftLine(draft, line, { omitted: true }),
  "draft-unomit": ({ draft, line }) => updateDraftLine(draft, line, { omitted: false }),
  "draft-optional": ({ draft, line }) => updateDraftLine(draft, line, { optional: true }),
  "draft-state": ({ draft, line, value }) => updateDraftLine(draft, line, { state: value }),
  "draft-save-reference": ({ draft }) => {
    const d = state.drafts[draft];
    commit({ ...state, drafts: { ...state.drafts, [draft]: { ...d, status: "reference" } } });
    toast("Saved as a reference in Saved", { label: "View", href: "#/saved" });
  },
  "draft-delete": ({ draft }) => {
    const before = state;
    const drafts = { ...state.drafts };
    delete drafts[draft];
    commit({ ...state, drafts });
    location.hash = "#/saved";
    toast("Draft deleted", { label: "Undo", run: () => commit(before) });
  },

  // ----- misc
  jump: ({ target }) => {
    const el = document.getElementById(target);
    el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  },
  "clear-search": () => {
    ui.query = "";
    render({ keepFocus: false });
    document.querySelector('[data-action="recipe-search"]')?.focus();
  },
  "set-filter": ({ value }) => {
    ui.filter = value;
    render();
  },
  "reset-demo": () => openDialog({ type: "reset" }),
  "confirm-reset": () => {
    closeDialog();
    state = clear();
    save(state);
    Object.assign(ui, { query: "", filter: "all", focus: [], bought: {}, cookChecks: {}, importResult: null, importText: "", importUrl: "" });
    location.hash = "#/";
    render({ keepFocus: false });
    toast("Demo reset");
  },
  "close-dialog": () => closeDialog(),
};

function updateDraftLine(draftId, lineId, answer) {
  const d = state.drafts[draftId];
  const lines = d.lines.map((l) => (l.id === lineId ? resolveLine(l, answer) : l));
  commit({ ...state, drafts: { ...state.drafts, [draftId]: { ...d, lines } } });
}

// Inputs that commit on change (not on every keystroke, so typing isn't interrupted).
const changeActions = {
  "cook-check": ({ key }, el) => {
    ui.cookChecks[key] = el.checked;
    render();
  },
  "c-target": ({ scope, nutrient }, el) => setConstraints(scope, (c) => ({ ...c, targets: { ...c.targets, [nutrient]: el.value ? Number(el.value) : null } })),
  "c-time": ({ scope }, el) => setConstraints(scope, (c) => ({ ...c, timeLimit: el.value ? Number(el.value) : null })),
  "pantry-qty": ({ key }, el) => {
    const n = parseFloat(el.value);
    const ok = Number.isFinite(n) && n > 0;
    commit({ ...state, pantry: pantryCore.setAvailability(state.pantry, key, ok ? "some" : "have", ok ? { qty: n, unit: el.dataset.unit } : undefined) });
  },
  "pantry-unit": ({ key }, el) => {
    const e = state.pantry[key];
    if (e) commit({ ...state, pantry: { ...state.pantry, [key]: { ...e, unit: el.value } } });
  },
  "pantry-free-qty": ({ key }, el) => {
    const e = state.pantry[key];
    if (e) commit({ ...state, pantry: { ...state.pantry, [key]: { ...e, qtyText: el.value.trim() || undefined } } });
  },
  "pantry-mark": ({ item }, el) => commit({ ...state, pantry: pantryCore.setAvailability(state.pantry, item, el.value) }),
  "list-qty": ({ line }, el) => commit({ ...state, list: shop.setOverride(state.list, line, el.value) }),
  "list-name": ({ line }, el) => commit({ ...state, list: shop.renameManual(state.list, line, el.value) }),
  "list-check": ({ line }) => commit({ ...state, list: shop.toggleChecked(state.list, line) }),
  "draft-title": ({ draft }, el) => {
    const d = state.drafts[draft];
    commit({ ...state, drafts: { ...state.drafts, [draft]: { ...d, title: el.value.trim() || d.title } } });
  },
  "draft-servings": ({ draft }, el) => {
    const n = parseInt(el.value, 10);
    const d = state.drafts[draft];
    commit({ ...state, drafts: { ...state.drafts, [draft]: { ...d, servings: Number.isFinite(n) && n > 0 ? n : null } } });
  },
  "draft-match": ({ draft, line }, el) => updateDraftLine(draft, line, { item: el.value || null }),
  "draft-qty": ({ draft, line }, el) => {
    const n = parseFloat(el.value);
    updateDraftLine(draft, line, { qty: Number.isFinite(n) && n > 0 ? n : null, qtyMax: null });
  },
  "draft-unit": ({ draft, line }, el) => updateDraftLine(draft, line, { unit: el.value, vagueUnit: null, unitConfirmed: true }),
};

// ---------- dialog and toast ----------

let lastTrigger = null;

function openDialog(dialog) {
  if (!sheet.open) lastTrigger = document.activeElement;
  ui.dialog = dialog;
  renderSheet();
  if (!sheet.open) sheet.showModal();
  sheet.querySelector("#sheet-title")?.focus();
}

function closeDialog() {
  ui.dialog = null;
  if (sheet.open) sheet.close();
}

sheet.addEventListener("close", () => {
  if (sheet.open) return;
  ui.dialog = null;
  sheet.innerHTML = "";
  if (lastTrigger?.isConnected) lastTrigger.focus();
  lastTrigger = null;
});

sheet.addEventListener("click", (e) => {
  if (e.target === sheet) closeDialog();
});

function renderSheet() {
  sheet.innerHTML = ui.dialog ? String(sheetView(ctx, ui.dialog)) : "";
  sheet.setAttribute("aria-labelledby", "sheet-title");
}

let toastTimer;
function toast(message, action) {
  ui.toast = { message, action };
  clearTimeout(toastTimer);
  toastRegion.innerHTML = String(html`
    <div class="toast">
      <span>${message}</span>
      ${action ? action.href
        ? html`<a class="btn btn--quiet" href="${action.href}">${action.label}</a>`
        : html`<button class="btn btn--quiet" data-toast-action>${action.label}</button>` : ""}
    </div>`);
  toastTimer = setTimeout(() => {
    toastRegion.innerHTML = "";
    ui.toast = null;
  }, 6000);
}

toastRegion.addEventListener("click", (e) => {
  if (e.target.closest("[data-toast-action]") && ui.toast?.action?.run) {
    const run = ui.toast.action.run;
    toastRegion.innerHTML = "";
    ui.toast = null;
    run();
  } else if (e.target.closest("a")) {
    toastRegion.innerHTML = "";
  }
});

// ---------- routing and rendering ----------

const PRIMARY = { today: "Today", recipes: "Recipes", pantry: "Pantry", list: "Shopping list", saved: "Saved" };
const PUSHED_TITLES = { plan: "Plan a few meals", import: "Import a recipe", profile: "Requirements and settings" };

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [name, id, a, b] = hash.split("/");
  if (name === "recipe" && getRecipe(id)) return { name: "recipe", id };
  if (name === "adapt" && getRecipe(id)) return { name: "adapt", id, step: ["needs", "options", "compare", "shop"].includes(a) ? a : "needs" };
  if (name === "cook" && id === "draft" && state.drafts[a]) return { name: "cook", draft: a };
  if (name === "cook" && getRecipe(id)) return { name: "cook", id, kind: a === "original" ? "original" : a === "v" && state.versions[b] ? "version" : "session", vid: b };
  if (name === "draft" && state.drafts[id]) return { name: "draft", id };
  if (["recipes", "pantry", "list", "saved", "plan", "import", "profile"].includes(name)) return { name };
  if (name === "missing") return { name: "missing" };
  return hash && name !== "" ? { name: "missing" } : { name: "today" };
}

function focusSignature(el) {
  if (!el || el === document.body || !root.contains(el)) return null;
  const attrs = ["data-action", "data-id", "data-item", "data-key", "data-line", "data-slot", "data-swap", "data-delta", "data-value", "data-scope", "data-nutrient", "data-step", "data-plan", "data-vid", "data-draft", "data-tab", "data-index", "value"];
  const choice = el.type === "radio" || el.type === "checkbox";
  return attrs.filter((a) => el.hasAttribute(a) && (a !== "value" || choice)).map((a) => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join("");
}

function renderView(r) {
  switch (r.name) {
    case "recipes": return recipesView(ctx);
    case "recipe": return overviewView(ctx, getRecipe(r.id));
    case "adapt": return adaptView(ctx, getRecipe(r.id), r.step);
    case "cook": return cookView(ctx, r);
    case "pantry": return pantryView(ctx);
    case "list": return listView(ctx);
    case "plan": return planView(ctx);
    case "saved": return savedView(ctx);
    case "import": return importView(ctx);
    case "draft": return draftView(ctx, state.drafts[r.id]);
    case "profile": return profileView(ctx);
    case "missing": return html`<div class="page"><h1 tabindex="-1" data-route-focus>Not found</h1><p>That page doesn't exist, or the item was removed.</p><p><a class="btn btn--secondary" href="#/">Go to Today</a></p></div>`;
    default: return todayView(ctx);
  }
}

function render({ keepFocus = true, routeChanged = false, initial = false } = {}) {
  const active = document.activeElement;
  const sig = keepFocus ? focusSignature(active) : null;
  const caret = sig && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
  const r = ui.route;
  root.innerHTML = String(renderView(r));
  const pushed = !(r.name in PRIMARY);
  document.body.dataset.screen = pushed ? "pushed" : "primary";
  document.body.dataset.route = r.name;
  renderNav();
  if (ui.dialog && sheet.open) renderSheet();

  if (routeChanged) {
    window.scrollTo(0, 0);
    if (!initial) root.querySelector("[data-route-focus]")?.focus({ preventScroll: true });
    const title = r.name === "recipe" || r.name === "adapt" ? getRecipe(r.id).title : PRIMARY[r.name] ?? PUSHED_TITLES[r.name] ?? root.querySelector("h1")?.textContent;
    document.title = r.name === "today" ? "mise & match" : `${title} · mise & match`;
  } else if (sig) {
    const el = root.querySelector(sig);
    el?.focus({ preventScroll: true });
    if (caret && el?.setSelectionRange) el.setSelectionRange(...caret);
  }
}

// Current tab: aria-current plus an indicator bar and heavier label, not color alone.
function renderNav() {
  const open = state.list.lines.filter((l) => !l.checked).length;
  const r = ui.route.name;
  const current = (names) => (names.includes(r) ? html`aria-current="page"` : "");
  const tab = (href, names, iconName, label, extra = "") => html`
    <a href="${href}" ${current(names)}>${icon(iconName)}<span class="tab-label">${label}</span>${extra}</a>`;
  nav.innerHTML = String(html`
    ${tab("#/", ["today"], "pot", "Today")}
    ${tab("#/recipes", ["recipes", "recipe", "adapt"], "book", "Recipes")}
    ${tab("#/pantry", ["pantry", "list"], "jar", "Pantry", open ? html`<span class="count" aria-label="${plural(open, "item")} on your shopping list">${open}</span>` : "")}
    ${tab("#/saved", ["saved", "draft"], "bookmark", "Saved")}`);
}

window.addEventListener("hashchange", () => {
  ui.route = parseRoute();
  if (sheet.open) closeDialog();
  // Visiting a step records it on the session so Continue returns there.
  if (ui.route.name === "adapt") {
    const s = state.sessions[ui.route.id];
    if (!s) state = { ...state, sessions: { ...state.sessions, [ui.route.id]: { ...V.startSession(getRecipe(ui.route.id)), step: ui.route.step } }, lastSession: ui.route.id };
    else if (s.step !== ui.route.step) state = { ...state, sessions: { ...state.sessions, [ui.route.id]: { ...s, step: ui.route.step } } };
    save(state);
  }
  render({ keepFocus: false, routeChanged: true });
});

// ---------- events ----------

document.addEventListener("click", (e) => {
  if (e.target.closest(".skip-link")) {
    e.preventDefault();
    root.focus();
    return;
  }
  const el = e.target.closest("[data-action]");
  if (!el || el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "FORM" || el.tagName === "TEXTAREA") return;
  const fn = actions[el.dataset.action];
  if (!fn || el.disabled) return;
  e.preventDefault();
  fn({ ...el.dataset });
});

document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const fn = changeActions[el.dataset.action];
  if (fn) fn({ ...el.dataset }, el);
});

document.addEventListener("input", (e) => {
  const el = e.target;
  const a = el.dataset?.action;
  if (a === "recipe-search") ui.query = el.value;
  else if (a === "pantry-search") ui.pantryQuery = el.value;
  else if (a === "import-text") {
    ui.importText = el.value;
    return; // no re-render while typing a long paste
  } else if (a === "import-url") {
    ui.importUrl = el.value;
    return;
  } else return;
  render();
});

document.addEventListener("submit", (e) => {
  const form = e.target;
  const kind = form.dataset.action;
  if (kind === "pantry-add-form") {
    e.preventDefault();
    const q = ui.pantryQuery.trim();
    if (!q) return;
    const [match] = pantryCore.searchCatalog(q, 1);
    if (match) actions["pantry-add"]({ item: match });
    else actions["pantry-add-free"]({ name: q });
  } else if (kind === "list-add") {
    e.preventDefault();
    const data = new FormData(form);
    const list = shop.addManual(state.list, String(data.get("name") ?? ""), String(data.get("qty") ?? ""));
    if (list === state.list) return;
    commit({ ...state, list }, { keepFocus: false });
    document.querySelector('.add-item [name="name"]')?.focus();
  } else if (kind === "import-paste") {
    e.preventDefault();
    ui.importResult = { ...importer.parsePastedText(ui.importText), method: "paste", url: ui.importResult?.keptUrl ?? null };
    render({ keepFocus: false });
    root.querySelector("#import-result")?.focus();
  } else if (kind === "import-link") {
    e.preventDefault();
    ui.importResult = importer.extractFromLink(ui.importUrl);
    render({ keepFocus: false });
    root.querySelector("#import-result")?.focus();
  } else if (kind === "rename-form" || kind === "save-form") {
    e.preventDefault();
  }
});

document.addEventListener("toggle", (e) => {
  const key = e.target.dataset?.openKey;
  if (key) ui.open[key] = e.target.open;
}, true);

const setInput = (mode) => () => (document.documentElement.dataset.input = mode);
document.addEventListener("keydown", (e) => {
  if (!e.metaKey && !e.ctrlKey && !e.altKey) setInput("keyboard")();
}, true);
document.addEventListener("pointerdown", setInput("pointer"), true);

ui.route = parseRoute();
render({ keepFocus: false, routeChanged: true, initial: true });

// For the review script and debugging only: no app logic depends on this.
window.__mise = { get state() { return state; }, RECIPES };
