// App controller: routing, actions, rendering and persistence.
// Views are pure functions of (ctx); every action updates state, saves, and re-renders.
// Working sessions autosave on every change; saved versions change only on an explicit Save.
// Nothing claims a durable save unless the write succeeded. Undo goes through narrow
// recovery records (core/recovery.js), never whole-state snapshots.

import { getRecipe, RECIPES } from "./data/recipes.js";
import { getSwap } from "./data/swaps.js";
import { ITEMS } from "./data/items.js";
import { load, save, clear, loadReport, protectedState, acceptFresh, hasExternalChange, peekStored } from "./store.js";
import { deriveRecipe, applySwap, removeSwap, setServings, servingsBounds } from "./core/adapt.js";
import { resolve, evaluate } from "./core/engine.js";
import { normalizeConstraints } from "./core/constraints.js";
import * as shop from "./core/shopping.js";
import * as pantryCore from "./core/pantry.js";
import * as V from "./core/versions.js";
import * as importer from "./core/importer.js";
import { addRecovery, applyRecovery } from "./core/recovery.js";
import { exactIngredient, searchIngredients } from "./core/search.js";
import { resolveLine, resetLine, validRepair } from "./core/normalize.js";
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
import { constraintsSummary, photoTile } from "./ui/parts.js";

let state = load();
const ui = {
  route: { name: "today" },
  open: {}, // disclosure open state by data-open-key, for this session
  query: "", // Recipes search
  filter: "all", // Recipes: "all" | "fits" | "saved"
  pantryQuery: "",
  pantryHint: null,
  fieldErrors: {}, // field key -> { message, value }: rejected input, shown inline; the last valid value stays in state
  focus: [], // Plan: ingredients to use up
  importTab: "paste",
  importText: "",
  importUrl: "",
  importKeptUrl: null, // a link that couldn't be read travels with the pasted version
  importResult: null, // { recipes, problem, url, method, raw }
  dialog: null,
  toast: null,
  persist: { ok: true }, // result of the last write
  tabConflict: false,
};

const root = document.getElementById("app");
const sheet = document.getElementById("sheet");
const toastRegion = document.getElementById("toast");
const nav = document.getElementById("nav");
const noticesEl = document.getElementById("notices");
const liveEl = document.getElementById("live");

// ---------- read helpers handed to views ----------

const memo = new Map();
function cached(key, fn) {
  const hit = memo.get(key);
  if (hit && hit.state === state) return hit.value;
  const value = fn();
  memo.set(key, { state, value });
  return value;
}

/** The pantry as this dish sees it today: what you said is missing today counts as out. */
function effectivePantry(id) {
  const missing = state.sessions[id]?.missing ?? [];
  if (!missing.length) return state.pantry;
  return { ...state.pantry, ...Object.fromEntries(missing.filter((item) => !state.pantry[item]?.qty).map((item) => [item, { out: true }])) };
}

const planEntries = (plan = state.plan) => plan.map((p) => ({ id: p.id, title: getRecipe(p.recipeId).title, derived: V.derivedForRecord(p), includeOptional: p.includeOptional ?? [] }));

/** The planned meal this session was added as, if any: editing it replaces it instead of adding a second. */
const linkedPlan = (id) => state.plan.find((p) => p.recipeId === id && p.fromSession) ?? null;

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
  evalFor: (id) => cached(`eval:${id}`, () => evaluate(getRecipe(id), ctx.working(id), ctx.constraintsFor(id), effectivePantry(id))),
  resolveFor: (id) => cached(`resolve:${id}`, () => resolve(getRecipe(id), ctx.working(id).servings, ctx.constraintsFor(id), effectivePantry(id))),
  derivedOf: (recipeId, snap) => deriveRecipe(getRecipe(recipeId), snap),
  /** Shopping needs for every planned meal, pantry allocated once in plan order. */
  planNeeds: () => cached("plan", () => shop.allocateNeeds(planEntries(), state.pantry, state.confirmations, { revisions: state.pantryRevisions })),
  /** Needs for the working session, after the other planned meals. If it's already planned, it stands in for that meal. */
  sessionNeeds: (id) => cached(`sneeds:${id}`, () => {
    const replacing = linkedPlan(id);
    const entries = planEntries(state.plan.filter((p) => p.id !== replacing?.id));
    const s = ctx.working(id);
    entries.push({ id: `session:${id}`, title: getRecipe(id).title, derived: deriveRecipe(getRecipe(id), s), includeOptional: s.includeOptional ?? [] });
    return { needs: shop.allocateNeeds(entries, effectivePantry(id), state.confirmations, { revisions: state.pantryRevisions }).get(`session:${id}`), replacing };
  }),
};

// ---------- state changes ----------

/** Adopt the next state. Pantry entries that changed get a new revision, which makes earlier answers about them stale. */
function assign(next) {
  state = next.pantry === state.pantry ? next : { ...next, pantryRevisions: pantryCore.bumpRevisions(state.pantry, next.pantry, next.pantryRevisions ?? {}) };
}

function persist(options) {
  ui.persist = save(state, options);
  if (!ui.persist.ok && ui.persist.reason === "conflict") ui.tabConflict = true;
  renderNotices();
  return ui.persist.ok;
}

function commit(next, { keepFocus = true } = {}) {
  assign(next);
  persist();
  render({ keepFocus });
}

/** Say a thing was saved only if the write worked. */
const durable = (message) => (ui.persist.ok ? message : `${message} for this visit only. It couldn't be saved on this device.`);

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
    const r = ctx.resolveFor(id);
    announce(r.eligible.length ? `${plural(r.eligible.length, "version")} fit${r.eligible.length === 1 ? "s" : ""} these requirements.` : "No version fits these requirements yet.");
  }
}

function planTitle(entry) {
  return getRecipe(entry.recipeId).title;
}

/**
 * Regenerate the grocery list for every planned meal together, as one transaction:
 * the pantry is shared out in plan order, then each line is reconciled once.
 */
function syncList({ quiet = false, removed = [] } = {}) {
  const map = shop.allocateNeeds(planEntries(), state.pantry, state.confirmations, { revisions: state.pantryRevisions });
  const meals = state.plan.map((p) => ({ id: p.id, title: planTitle(p), needs: map.get(p.id) ?? [] }));
  const { list, report } = shop.reconcile(state.list, meals, { removed });
  commit({ ...state, list });
  const parts = [];
  if (report.added) parts.push(`${plural(report.added, "item")} added`);
  if (report.updated) parts.push(`${report.updated} updated`);
  if (report.conflicts) parts.push(`${report.conflicts} to review`);
  if (parts.length) announce(`Shopping list: ${parts.join(", ")}.`);
  if (quiet) return;
  toast(parts.length ? `List: ${parts.join(", ")}` : "List is up to date", { label: "View list", href: "#/list" });
}

function addToPlan(recipeId, { version = null, snapshot, fromSession = false }) {
  const entry = V.planEntry({ recipeId, version, snapshot, servings: snapshot.servings, fromSession });
  assign({ ...state, plan: [...state.plan, entry] });
  syncList();
  return entry;
}

/** Plan this unless the exact same meal is already planned or this session is already planned as something else. */
function planOrAsk(intent) {
  const { recipeId, snapshot, versionId = null, fromSession = false } = intent;
  const same = state.plan.find((p) => V.samePlanned(p, { recipeId, ...snapshot }));
  if (same) {
    openDialog({ type: "plan-duplicate", planId: same.id, recipeId, intent });
    return;
  }
  const linked = fromSession ? linkedPlan(recipeId) : null;
  if (linked) {
    openDialog({ type: "plan-linked", planId: linked.id, recipeId, intent });
    return;
  }
  addToPlan(recipeId, { version: versionId ? state.versions[versionId] : null, snapshot, fromSession });
}

function startFrom(recipeId, versionId = null) {
  const v = versionId ? state.versions[versionId] : null;
  setSession(recipeId, V.startSession(getRecipe(recipeId), v), null);
  location.hash = `#/adapt/${recipeId}/needs`;
}

/** Start a session from a proposal: a specific set of rules and portions, to review before anything is saved. */
function startProposal({ recipeId, applied, servings, step = "compare", missing = [], scenario = false }) {
  const session = { ...V.startSession(getRecipe(recipeId)), applied, servings, step, missing, scenario };
  setSession(recipeId, session, null);
  location.hash = `#/adapt/${recipeId}/${step}`;
}

function requestProposal(proposal) {
  const existing = state.sessions[proposal.recipeId];
  if (existing && V.hasUnsavedChanges(existing, state.versions)) {
    openDialog({ type: "replace-session", recipeId: proposal.recipeId, proposal });
    return;
  }
  startProposal(proposal);
}

/** Do something removable, leaving one narrow record to put it back. */
function withRecovery(record, next, { keepFocus = false, message, resync = false } = {}) {
  const { state: withRecord, id } = addRecovery(next, record);
  commit(withRecord, { keepFocus });
  if (resync) syncList({ quiet: true });
  if (message) toast(message, { label: "Undo", run: () => actions.recover({ rid: id }) });
  return id;
}

function setFieldError(key, message, value) {
  if (message) ui.fieldErrors[key] = { message, value };
  else delete ui.fieldErrors[key];
}

const actions = {
  // ----- recipes and sessions
  "save-recipe": ({ id }) => {
    commit({ ...state, saved: [...state.saved.filter((x) => x !== id), id] });
    toast(durable("Bookmarked in Saved"));
  },
  "unsave-recipe": ({ id }) => {
    withRecovery({ kind: "bookmark", recipeId: id, label: `Bookmark: ${getRecipe(id).title}` }, { ...state, saved: state.saved.filter((x) => x !== id) }, { keepFocus: true, message: "Removed the bookmark. Your versions are kept." });
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
    const proposal = ui.dialog?.proposal;
    closeDialog();
    const before = state.sessions[id];
    if (before) {
      const sessions = { ...state.sessions };
      delete sessions[id];
      const { state: withRecord } = addRecovery({ ...state, sessions }, { kind: "session", recipeId: id, session: before, label: `Unsaved changes to ${getRecipe(id).title}` });
      assign(withRecord);
    }
    if (proposal) startProposal(proposal);
    else startFrom(id, from || null);
  },
  "start-scenario": ({ id }) => requestProposal({ recipeId: id, applied: ["cm-canned-tomatoes"], servings: 2, step: "options", missing: ["fresh-tomatoes"], scenario: true }),
  "review-proposal": ({ id, applied, servings }) => requestProposal({ recipeId: id, applied: applied ? applied.split(",") : [], servings: Number(servings) }),
  "repeat-cook": ({ cook }) => {
    const rec = state.cooks.find((c) => c.id === cook);
    if (!rec) return;
    const status = V.recordStatus(rec);
    if (!status.intact) {
      location.hash = `#/cook/${rec.recipeId}/c/${rec.id}`;
      return;
    }
    requestProposal({ recipeId: rec.recipeId, applied: [...rec.applied], servings: rec.servings });
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
    withRecovery({ kind: "session", recipeId: id, session: before, label: `Unsaved changes to ${getRecipe(id).title}` }, { ...state, sessions, lastSession: state.lastSession === id ? null : state.lastSession }, { message: "Unsaved changes discarded" });
    location.hash = `#/recipe/${id}`;
  },
  servings: ({ id, delta }) => {
    const s = ctx.working(id);
    const next = setServings(s, s.servings + Number(delta), getRecipe(id));
    if (next.servings !== s.servings) {
      changeSession(id, { servings: next.servings });
      announce(plural(next.servings, "serving"));
    }
  },
  "go-step": ({ id, step }) => {
    const s = state.sessions[id];
    if (s) assign({ ...state, sessions: { ...state.sessions, [id]: { ...s, step } } });
    persist();
    location.hash = `#/adapt/${id}/${step}`;
  },
  "choose-option": ({ id, applied, label }) => {
    const list = applied ? applied.split(",") : [];
    changeSession(id, { applied: list }, list.length ? `Selected: ${label}` : "Back to no ingredient changes");
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
  "remove-changes": ({ id }) => changeSession(id, { applied: [] }, "Removed the ingredient changes. Your portions are unchanged."),
  "restore-original": ({ id }) => changeSession(id, { applied: [], servings: getRecipe(id).servings, missing: [] }, "Back to the recipe as written"),
  "mark-have": ({ id, item }) => {
    const s = state.sessions[id] ?? V.startSession(getRecipe(id));
    const entry = state.pantry[item];
    const missing = (s.missing ?? []).filter((x) => x !== item);
    // A measured amount stays. Tapping again takes the mark off.
    let pantry = state.pantry;
    if (entry && !pantryCore.isOut(entry)) pantry = entry.qty ? pantry : pantryCore.setAvailability(pantry, item, "unchecked");
    else pantry = pantryCore.setAvailability(pantry, item, "have");
    assign({ ...state, pantry });
    setSession(id, V.changeSession(s, { missing }));
  },
  "mark-missing": ({ id, item }) => {
    const s = state.sessions[id] ?? V.startSession(getRecipe(id));
    const was = (s.missing ?? []).includes(item) || pantryCore.isOut(state.pantry[item]);
    let pantry = state.pantry;
    if (pantryCore.isOut(pantry[item])) pantry = pantryCore.setAvailability(pantry, item, "unchecked");
    assign({ ...state, pantry });
    setSession(id, V.changeSession(s, { missing: was ? (s.missing ?? []).filter((x) => x !== item) : [...(s.missing ?? []), item] }));
  },
  "include-optional": ({ id, item }) => {
    const s = state.sessions[id] ?? V.startSession(getRecipe(id));
    const on = s.includeOptional ?? [];
    setSession(id, { ...s, includeOptional: on.includes(item) ? on.filter((x) => x !== item) : [...on, item] });
  },
  "plan-include-optional": ({ plan, item }) => {
    assign({ ...state, plan: state.plan.map((p) => (p.id === plan ? { ...p, includeOptional: [...new Set([...(p.includeOptional ?? []), item])] } : p)) });
    syncList({ quiet: true });
  },

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
    commit({ ...state, versions: res.versions, sessions: { ...state.sessions, [id]: { ...res.session, scenario: false } } });
    const v = res.versions[res.id];
    const affected = state.plan.filter((p) => p.versionId === v.id && V.planUpdate(p, res.versions));
    toast(durable(mode === "update" ? `Updated “${v.name}”${affected.length ? ". Your list has an update to review." : ""}` : `Saved “${v.name}”`), ui.persist.ok ? { label: "View in Saved", href: "#/saved" } : null);
  },
  "rename-version": ({ vid }) => openDialog({ type: "rename-version", versionId: vid }),
  "confirm-rename-version": ({ vid }) => {
    const name = sheet.querySelector('[name="version-name"]')?.value?.trim();
    closeDialog();
    if (!name) return;
    commit({ ...state, versions: { ...state.versions, [vid]: { ...state.versions[vid], name } } });
  },
  "delete-version": ({ vid }) => {
    const versions = { ...state.versions };
    const v = versions[vid];
    delete versions[vid];
    const linked = Object.entries(state.sessions).filter(([, s]) => s.baseVersion === vid).map(([k]) => k);
    const sessions = Object.fromEntries(Object.entries(state.sessions).map(([k, s]) => [k, s.baseVersion === vid ? { ...s, baseVersion: null } : s]));
    withRecovery({ kind: "version", version: v, sessions: linked, label: `Version: ${v.name}` }, { ...state, versions, sessions }, { message: `Removed “${v.name}”. Planned meals keep their own copy.` });
  },

  // ----- constraints
  "c-diet": ({ scope, value }) => setConstraints(scope, (c) => ({ ...c, diet: value || null, eggs: value === "vegetarian" ? c.eggs : null })),
  "c-avoid": ({ scope, value }) => setConstraints(scope, (c) => ({ ...c, avoid: c.avoid.includes(value) ? c.avoid.filter((x) => x !== value) : [...c.avoid, value], nutScope: value === "nuts" && c.avoid.includes("nuts") ? null : c.nutScope })),
  "c-nutscope": ({ scope, value }) => setConstraints(scope, (c) => ({ ...c, nutScope: value })),
  "c-eggs": ({ scope, value }) => setConstraints(scope, (c) => ({ ...c, eggs: value })),
  "c-answer": ({ scope, key, value }) => setConstraints(scope, (c) => ({ ...c, answers: { ...c.answers, [key]: value } })),
  "c-dislike": ({ scope, value }) => setConstraints(scope, (c) => ({ ...c, dislikes: c.dislikes.includes(value) ? c.dislikes.filter((x) => x !== value) : [...c.dislikes, value] })),
  "c-lower-target": ({ id, values }) => setConstraints(`session:${id}`, (c) => ({ ...c, targets: { ...c.targets, ...JSON.parse(values) } })),
  "c-save-profile": ({ id }) => {
    commit({ ...state, profile: ctx.constraintsFor(id) });
    toast(durable("Saved as your usual requirements"));
  },
  "c-use-profile": ({ id }) => changeSession(id, { constraints: null }, "Using your usual requirements"),

  // ----- cooking
  "cook-restart": ({ key }) => {
    const cooking = { ...state.cooking };
    delete cooking[key];
    assign({ ...state, cooking });
    ensureCooking(ui.route);
    persist();
    render({ keepFocus: false });
    root.querySelector("[data-route-focus]")?.focus({ preventScroll: true });
    toast("Started again from the current version");
  },
  "finish-cooking": ({ id, key }) => {
    const cs = state.cooking[key];
    if (!cs) return;
    const rec = V.cookRecord({ recipeId: id, versionId: cs.versionId, rev: cs.rev, planId: cs.planId, snapshot: cs, derived: cs.snapshot, madeUnder: constraintsSummary(ctx.constraintsFor(id)) });
    const cooking = { ...state.cooking };
    delete cooking[key];
    commit({ ...state, cooks: [...state.cooks, rec], cooking });
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
    commit({ ...state, cooks: state.cooks.map((c) => (c.id === cook ? { ...c, feedback } : c)) });
    toast(durable("Thanks. Saved with the version you cooked."));
    afterFeedback(cook);
  },
  "skip-feedback": ({ cook }) => afterFeedback(cook),
  "review-cook-pantry": ({ cook }) => openDialog({ type: "cook-pantry", cookId: cook }),
  "apply-cook-pantry": ({ cook }) => {
    const rec = state.cooks.find((c) => c.id === cook);
    if (!rec || rec.pantryUpdate) return closeDialog();
    const form = sheet.querySelector("form");
    const data = new FormData(form);
    const rows = pantryCore.cookPantryReview(rec.snapshot.ingredients, state.pantry);
    const chosen = data.getAll("deduct");
    const { pantry } = pantryCore.applyCookReview(state.pantry, rows, chosen);
    const takes = rows.filter((r) => r.action === "deduct" && chosen.includes(r.item)).map((r) => ({ item: r.item, ...r.take }));
    const planEntry = data.get("complete-plan") ? state.plan.find((p) => p.id === rec.planId) : null;
    const planIndex = planEntry ? state.plan.indexOf(planEntry) : null;
    closeDialog();
    assign({ ...state, pantry, plan: planEntry ? state.plan.filter((p) => p.id !== planEntry.id) : state.plan, cooks: state.cooks.map((c) => (c.id === cook ? { ...c, pantryUpdate: { at: Date.now(), takes, planId: planEntry?.id ?? null } } : c)) });
    const rid = addRecovery(state, { kind: "cook-pantry", cookId: cook, takes, planEntry, planIndex, label: `Pantry update after cooking ${getRecipe(rec.recipeId).title}` });
    assign(rid.state);
    syncList({ quiet: true, removed: planEntry ? [planEntry.id] : [] });
    toast(durable(`Pantry updated${planEntry ? ", and the meal is off your plan" : ""}`), { label: "Undo", run: () => actions.recover({ rid: rid.id }) });
  },

  // ----- pantry
  "pantry-toggle": ({ item }) => {
    const entry = state.pantry[item];
    if (entry && !pantryCore.isOut(entry)) {
      // Turning a chip off keeps the amount recoverable.
      withRecovery({ kind: "pantry-entry", key: item, entry, label: `Pantry: ${ITEMS[item].name}${entry.qty ? `, ${pantryCore.amountText(entry)}` : ""}` }, { ...state, pantry: pantryCore.remove(state.pantry, item) }, { keepFocus: true, message: `Removed ${ITEMS[item].name}` });
    } else commit({ ...state, pantry: pantryCore.setAvailability(state.pantry, item, "have") });
  },
  "pantry-add": ({ item }) => {
    ui.pantryQuery = "";
    ui.pantryHint = null;
    commit({ ...state, pantry: { ...state.pantry, [item]: state.pantry[item] && !pantryCore.isOut(state.pantry[item]) ? state.pantry[item] : {} } }, { keepFocus: false });
    document.querySelector('[data-action="pantry-search"]')?.focus();
    toast(`Added ${ITEMS[item].name}`);
  },
  "pantry-add-free": ({ name }) => {
    ui.pantryQuery = "";
    ui.pantryHint = null;
    commit({ ...state, pantry: pantryCore.addFree(state.pantry, name) }, { keepFocus: false });
    document.querySelector('[data-action="pantry-search"]')?.focus();
    toast(`Added ${name}. Match it to an ingredient to count it in recipes.`);
  },
  "pantry-remove": ({ key }) => {
    const entry = state.pantry[key];
    const name = pantryCore.displayName(key, entry);
    setFieldError(`pantry:${key}`, null);
    withRecovery({ kind: "pantry-entry", key, entry, label: `Pantry: ${name}${entry.qty ? `, ${pantryCore.amountText(entry)}` : ""}` }, { ...state, pantry: pantryCore.remove(state.pantry, key) }, { message: `Removed ${name}` });
  },
  "pantry-clear": ({ key }) => {
    setFieldError(`pantry:${key}`, null);
    const entry = state.pantry[key];
    withRecovery({ kind: "pantry-entry", key, entry, label: `Amount of ${pantryCore.displayName(key, entry)}: ${pantryCore.amountText(entry)}` }, { ...state, pantry: pantryCore.clearAmount(state.pantry, key) }, { keepFocus: true, message: "Amount cleared. It's now amount unknown." });
  },
  "group-have": ({ id, group }) => {
    let pantry = state.pantry;
    for (const line of deriveRecipe(getRecipe(id), ctx.working(id)).ingredients.filter((l) => l.group === group)) {
      for (const e of line.entries) if (!ITEMS[e.item].noShop && !pantry[e.item]) pantry = pantryCore.setAvailability(pantry, e.item, "have");
    }
    commit({ ...state, pantry });
  },
  confirm: ({ item, fp, value }) => {
    assign({ ...state, confirmations: shop.recordConfirmation(state.confirmations, item, fp, value) });
    persist();
    syncList({ quiet: true });
  },

  // ----- plan and list
  "add-plan": ({ id }) => {
    const s = ctx.working(id);
    if (state.sessions[id] && V.hasUnsavedChanges(s, state.versions) && V.isAdaptedSnapshot(getRecipe(id), s) && !state.plan.some((p) => V.samePlanned(p, { recipeId: id, ...s }))) {
      openDialog({ type: "plan-unsaved", recipeId: id });
      return;
    }
    planOrAsk({ recipeId: id, snapshot: V.snapshotWithOptional(s), versionId: s.baseVersion ?? null, fromSession: true });
  },
  "plan-save-and-add": ({ id }) => {
    closeDialog();
    const res = V.saveSession(state.versions, state.sessions[id], {});
    assign({ ...state, versions: res.versions, sessions: { ...state.sessions, [id]: res.session } });
    planOrAsk({ recipeId: id, snapshot: V.snapshotWithOptional(state.sessions[id]), versionId: res.id, fromSession: true });
  },
  "plan-add-copy": ({ id }) => {
    closeDialog();
    planOrAsk({ recipeId: id, snapshot: V.snapshotWithOptional(ctx.working(id)), fromSession: true });
  },
  "plan-add-another": ({ intent }) => {
    closeDialog();
    const i = JSON.parse(intent);
    addToPlan(i.recipeId, { version: i.versionId ? state.versions[i.versionId] : null, snapshot: i.snapshot, fromSession: false });
  },
  "plan-replace": ({ plan, id }) => {
    closeDialog();
    const s = ctx.working(id);
    const version = s.baseVersion && !V.hasUnsavedChanges(s, state.versions) ? state.versions[s.baseVersion] : null;
    const fresh = V.planEntry({ recipeId: id, version, snapshot: V.snapshotWithOptional(s), servings: s.servings, fromSession: true });
    assign({ ...state, plan: state.plan.map((p) => (p.id === plan ? { ...fresh, id: p.id, addedAt: p.addedAt } : p)) });
    syncList();
  },
  "plan-add-option": ({ id, applied, servings }) => planOrAsk({ recipeId: id, snapshot: { servings: Number(servings), applied: applied ? applied.split(",") : [] } }),
  "plan-add-version": ({ vid }) => {
    const v = state.versions[vid];
    planOrAsk({ recipeId: v.recipeId, snapshot: { servings: v.servings, applied: v.applied.filter((id) => getSwap(id)) }, versionId: vid });
  },
  "plan-remove": ({ plan }) => {
    const entry = state.plan.find((p) => p.id === plan);
    const index = state.plan.indexOf(entry);
    const { state: withRecord, id } = addRecovery({ ...state, plan: state.plan.filter((p) => p.id !== plan) }, { kind: "plan-meal", entry, index, label: `Planned meal: ${planTitle(entry)}, ${plural(entry.servings, "serving")}` });
    assign(withRecord);
    // The remaining meals reallocate against the pantry this one no longer uses.
    syncList({ quiet: true, removed: [plan] });
    toast(`Removed ${planTitle(entry)} from your plan`, { label: "Undo", run: () => actions.recover({ rid: id }) });
  },
  "plan-servings": ({ plan, delta }) => {
    const p = state.plan.find((x) => x.id === plan);
    const [min, max] = servingsBounds(getRecipe(p.recipeId));
    const servings = Math.min(max, Math.max(min, p.servings + Number(delta)));
    assign({ ...state, plan: state.plan.map((x) => (x.id === plan ? V.setPlanServings(x, servings) : x)) });
    syncList({ quiet: true });
  },
  "plan-review-update": ({ plan }) => openDialog({ type: "plan-update", planId: plan }),
  "plan-accept-update": ({ plan }) => {
    closeDialog();
    const entry = state.plan.find((p) => p.id === plan);
    const v = state.versions[entry.versionId];
    assign({ ...state, plan: state.plan.map((p) => (p.id === plan ? V.acceptPlanUpdate(p, v) : p)) });
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
  "list-to-pantry": ({ line, more }) => {
    const l = state.list.lines.find((x) => x.id === line);
    if (!l) return;
    if (l.transfer && !more) {
      toast(`${l.name} is already in your pantry`);
      return;
    }
    if (l.manual) {
      const key = pantryCore.freeKey(l.name);
      const { list } = shop.recordTransfer(state.list, line, null);
      withRecovery({ kind: "transfer", lineId: line, free: key, label: `Pantry: ${l.name}, from your list` }, { ...state, list, pantry: pantryCore.addFree(state.pantry, l.name, l.qtyText ?? "") }, { keepFocus: true, message: `Added ${l.name} to your pantry` });
      return;
    }
    // The amount actually bought, as confirmed here. Never the raw requirement.
    const input = root.querySelector(`#bought-${CSS.escape(line)}`);
    const parsed = pantryCore.parseAmount(input?.value ?? "");
    const unit = (l.override ?? shop.computedQty(l) ?? shop.boughtDefault(l))?.unit ?? "";
    if (parsed.kind !== "amount") {
      setFieldError(`list:${line}`, parsed.kind === "invalid" ? parsed.reason : "Enter how much you bought, to add it to your pantry.", input?.value ?? "");
      render();
      return;
    }
    setFieldError(`list:${line}`, null);
    const res = shop.recordTransfer(state.list, line, { qty: parsed.value, unit }, { more: !!more });
    if (!res.ok) return;
    const before = state.pantry[l.item] ?? null;
    const pantry = pantryCore.addBought(state.pantry, l.item, parsed.value, unit);
    const { state: withRecord, id } = addRecovery({ ...state, list: res.list, pantry }, { kind: "transfer", lineId: line, item: l.item, qty: parsed.value, unit, before, label: `Bought: ${l.name}, ${parsed.value} ${unit}` });
    assign(withRecord);
    syncList({ quiet: true });
    toast(durable(`Added ${l.name} to your pantry`), { label: "Undo", run: () => actions.recover({ rid: id }) });
  },
  "list-delete": ({ line }) => {
    const l = state.list.lines.find((x) => x.id === line);
    const index = state.list.lines.indexOf(l);
    setFieldError(`list:${line}`, null);
    withRecovery({ kind: "list-line", line: l, index, label: `List item: ${l.name}` }, { ...state, list: shop.deleteLine(state.list, line) }, { message: `Removed ${l.name}` });
  },
  "list-resolve": ({ line, choice }) => {
    if (choice === "remove") {
      const l = state.list.lines.find((x) => x.id === line);
      withRecovery({ kind: "list-line", line: l, index: state.list.lines.indexOf(l), label: `List item: ${l.name}` }, { ...state, list: shop.resolveConflict(state.list, line, choice) }, { message: `Removed ${l.name}` });
      return;
    }
    commit({ ...state, list: shop.resolveConflict(state.list, line, choice) });
  },
  "list-addback": ({ id, key }) => {
    assign({ ...state, list: shop.undismiss(state.list, id, key) });
    syncList();
  },
  "list-clear-checked": () => {
    const lines = state.list.lines.filter((l) => l.checked);
    withRecovery({ kind: "list-lines", lines, label: `${plural(lines.length, "checked item")} from your list` }, { ...state, list: shop.clearChecked(state.list) }, { message: "Cleared checked items" });
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
  "import-pick": ({ index, force }) => {
    const res = ui.importResult;
    const extracted = res.recipes[Number(index)];
    const url = res.url ?? ui.importKeptUrl ?? null;
    const dup = force ? null : importer.findDuplicateDraft(state.drafts, extracted, url);
    if (dup) {
      openDialog({ type: "import-duplicate", draftId: dup.id, index });
      return;
    }
    closeDialog();
    const draft = importer.buildDraft(extracted, { method: res.method ?? "paste", url, raw: res.raw ?? null });
    ui.importResult = null;
    ui.importText = "";
    ui.importKeptUrl = null;
    commit({ ...state, drafts: { ...state.drafts, [draft.id]: draft } });
    location.hash = `#/draft/${draft.id}`;
  },
  "import-combine": () => {
    const res = ui.importResult;
    ui.importResult = { ...res, recipes: [importer.combineExtracted(res.recipes)] };
    render({ keepFocus: false });
    root.querySelector("#import-result")?.focus();
  },
  "import-to-paste": () => {
    ui.importTab = "paste";
    ui.importKeptUrl = ui.importResult?.url ?? ui.importUrl;
    ui.importResult = null;
    render({ keepFocus: false });
    root.querySelector('[data-action="import-text"]')?.focus();
  },
  "draft-omit": ({ draft, line }) => updateDraftLine(draft, line, { excluded: true }, "Left out of calculations. It's still in the recipe."),
  "draft-unomit": ({ draft, line }) => updateDraftLine(draft, line, { excluded: false, omitted: false }),
  "draft-keep-unknown": ({ draft, line }) => updateDraftLine(draft, line, { calc: "unknown" }),
  "draft-unknown-off": ({ draft, line }) => updateDraftLine(draft, line, { calc: null }),
  "draft-remove": ({ draft, line }) => updateDraftLine(draft, line, { removed: true }, "Removed from the recipe. The method text is unchanged."),
  "draft-restore": ({ draft, line }) => updateDraftLine(draft, line, { removed: false }),
  "draft-reset": ({ draft, line }) => {
    const d = state.drafts[draft];
    const before = d.lines.find((l) => l.id === line);
    setFieldError(`draft:${draft}:${line}`, null);
    withRecovery({ kind: "draft-line", draftId: draft, line: before, label: `Your edits to “${before.raw}”` }, { ...state, drafts: { ...state.drafts, [draft]: { ...d, lines: d.lines.map((l) => (l.id === line ? resetLine(l) : l)) } } }, { keepFocus: true, message: "Back to how it was imported" });
  },
  "draft-state": ({ draft, line, value }) => updateDraftLine(draft, line, { state: value }),
  "draft-state-alt": ({ draft, line, item }) => updateDraftLine(draft, line, { item }, `Now matched to ${ITEMS[item].name}`),
  "draft-yield": ({ draft, value }) => {
    const d = state.drafts[draft];
    commit({ ...state, drafts: { ...state.drafts, [draft]: { ...d, servings: Number(value), targetServings: null } } });
  },
  "draft-target": ({ draft, delta }) => {
    const d = state.drafts[draft];
    const current = d.targetServings ?? d.servings;
    const next = Math.min(100, Math.max(1, current + Number(delta)));
    commit({ ...state, drafts: { ...state.drafts, [draft]: { ...d, targetServings: next } } });
    announce(plural(next, "serving"));
  },
  "draft-save-reference": ({ draft }) => {
    const d = state.drafts[draft];
    commit({ ...state, drafts: { ...state.drafts, [draft]: { ...d, status: "reference" } } });
    toast(durable("Saved as a reference in Saved"), ui.persist.ok ? { label: "View", href: "#/saved" } : null);
  },
  "draft-delete": ({ draft }) => {
    const d = state.drafts[draft];
    const drafts = { ...state.drafts };
    delete drafts[draft];
    withRecovery({ kind: "draft", draft: d, label: `Import: ${d.title}` }, { ...state, drafts }, { message: "Import deleted" });
    location.hash = "#/saved";
  },

  // ----- recovery
  recover: ({ rid }) => {
    const result = applyRecovery(state, rid);
    if (result.blocked) {
      toast(result.blocked);
      return;
    }
    assign(result.state);
    if (result.resync) syncList({ quiet: true });
    else commit(state);
    toast(durable("Put back"));
  },

  // ----- other tabs and unreadable data
  "tab-review": () => {
    const theirs = peekStored();
    if (!theirs) return;
    const count = (s) => [
      ["Saved versions", Object.keys(s.versions).length],
      ["Adaptations in progress", Object.keys(s.sessions).length],
      ["Planned meals", s.plan.length],
      ["Shopping lines", s.list.lines.length],
      ["Pantry items", Object.keys(s.pantry).length],
      ["Imports", Object.keys(s.drafts).length],
      ["Cooked", s.cooks.length],
    ];
    const mine = count(state);
    openDialog({ type: "other-tab", diff: count(theirs).map(([label, n], i) => ({ label, theirs: n, mine: mine[i][1] })) });
  },
  "tab-use-theirs": () => {
    closeDialog();
    state = load();
    ui.persist = { ok: true };
    ui.tabConflict = false;
    ui.route = parseRoute();
    render({ keepFocus: false });
    renderNotices();
    toast("Loaded the other tab's changes");
  },
  "tab-keep-mine": () => {
    closeDialog();
    ui.tabConflict = false;
    persist({ force: true });
    render();
    toast(durable("Kept this tab's version"));
  },
  "retry-save": () => {
    if (persist()) toast("Saved on this device");
  },
  "accept-fresh": () => {
    state = acceptFresh();
    ui.persist = { ok: true };
    location.hash = "#/";
    render({ keepFocus: false });
    renderNotices();
    toast("Started fresh. A copy of the unreadable data is kept separately in this browser.");
  },
  "copy-recovery": async () => {
    const box = root.querySelector("#recovery-text");
    box?.select();
    try {
      await navigator.clipboard.writeText(box.value);
      toast("Copied");
    } catch {
      toast("Select the text and copy it");
    }
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
    persist();
    Object.assign(ui, { query: "", filter: "all", focus: [], importResult: null, importText: "", importUrl: "", importKeptUrl: null, fieldErrors: {} });
    location.hash = "#/";
    render({ keepFocus: false });
    toast("Demo reset");
  },
  "close-dialog": () => closeDialog(),
};

function afterFeedback(cook) {
  closeDialog();
  const rec = state.cooks.find((c) => c.id === cook);
  if (!rec) return;
  const rows = pantryCore.cookPantryReview(rec.snapshot.ingredients, state.pantry);
  if (rows.some((r) => r.action !== "none") || rec.planId) openDialog({ type: "cook-pantry", cookId: cook });
}

function updateDraftLine(draftId, lineId, answer, message) {
  const d = state.drafts[draftId];
  const before = d.lines.find((l) => l.id === lineId);
  const lines = d.lines.map((l) => (l.id === lineId ? resolveLine(l, answer) : l));
  const next = { ...state, drafts: { ...state.drafts, [draftId]: { ...d, lines } } };
  if (message) withRecovery({ kind: "draft-line", draftId, line: before, label: `Your edit to “${before.raw}”` }, next, { keepFocus: true, message });
  else commit(next);
}

/** The cook mode visit for a route, frozen at entry. Coming back resumes it. */
function ensureCooking(route) {
  if (route.name !== "cook" || route.draft || !route.cookKey || state.cooking[route.cookKey]) return;
  const recipe = getRecipe(route.id);
  let adaptation;
  let label;
  let version = null;
  let derived = null;
  let planId = null;
  if (route.kind === "original") {
    adaptation = { servings: recipe.servings, applied: [] };
    label = "As written";
  } else if (route.kind === "version") {
    version = state.versions[route.vid];
    adaptation = { servings: version.servings, applied: version.applied };
    label = version.name;
    if (version.snapshot && !V.recordStatus(version).intact) derived = version.snapshot;
  } else if (route.kind === "plan") {
    const p = state.plan.find((x) => x.id === route.planId);
    adaptation = { servings: p.servings, applied: p.applied };
    label = p.label;
    planId = p.id;
    if (p.versionId) version = state.versions[p.versionId] ?? null;
    if (p.snapshot && !V.recordStatus(p).intact) derived = p.snapshot;
  } else if (route.kind === "record") {
    const c = state.cooks.find((x) => x.id === route.cookId);
    adaptation = { servings: c.servings, applied: c.applied };
    label = "As you cooked it before";
    derived = c.snapshot;
  } else {
    const s = ctx.working(recipe.id);
    adaptation = { servings: s.servings, applied: s.applied };
    const base = s.baseVersion ? state.versions[s.baseVersion] : null;
    const unsaved = V.hasUnsavedChanges(s, state.versions);
    label = unsaved ? "Your unsaved version" : base ? base.name : "As written";
    if (base && !unsaved) version = base;
  }
  const visit = V.beginCooking({ key: route.cookKey, recipeId: recipe.id, versionId: version?.id ?? null, rev: version?.rev ?? null, planId, label, adaptation, derived });
  state = { ...state, cooking: { ...state.cooking, [route.cookKey]: visit } };
}

// Inputs that commit on change (not on every keystroke, so typing isn't interrupted).
const changeActions = {
  // Ticking a step only touches this visit's checklist and its one row. The page isn't redrawn.
  "cook-check": ({ cook, key }, el) => {
    const cs = state.cooking[cook];
    if (!cs) return;
    state = { ...state, cooking: { ...state.cooking, [cook]: { ...cs, checks: { ...cs.checks, [key]: el.checked } } } };
    persist();
    el.closest("li")?.classList.toggle("is-done", el.checked);
  },
  "c-target": ({ scope, nutrient }, el) => setConstraints(scope, (c) => ({ ...c, targets: { ...c.targets, [nutrient]: el.value ? Number(el.value) : null } })),
  "c-time": ({ scope }, el) => setConstraints(scope, (c) => ({ ...c, timeLimit: el.value ? Number(el.value) : null })),
  "pantry-qty": ({ key, unit }, el) => {
    const { pantry, error } = pantryCore.applyAmountInput(state.pantry, key, el.value, unit);
    setFieldError(`pantry:${key}`, error, el.value);
    if (error) {
      render();
      announce(error);
      return;
    }
    commit({ ...state, pantry });
  },
  "pantry-unit": ({ key }, el) => {
    const { pantry, error } = pantryCore.changeUnit(state.pantry, key, el.value);
    setFieldError(`pantry:${key}`, error, state.pantry[key]?.qty);
    if (error) {
      render();
      return;
    }
    commit({ ...state, pantry });
  },
  "pantry-free-qty": ({ key }, el) => {
    const e = state.pantry[key];
    if (e) commit({ ...state, pantry: { ...state.pantry, [key]: { ...e, qtyText: el.value.trim() || undefined } } });
  },
  "pantry-match-free": ({ key }, el) => {
    if (!el.value) return;
    const entry = state.pantry[key];
    withRecovery({ kind: "pantry-entry", key, entry, label: `Your own item: ${entry.name}` }, { ...state, pantry: pantryCore.matchFree(state.pantry, key, el.value) }, { message: `Matched to ${ITEMS[el.value].name}` });
  },
  "pantry-mark": ({ item }, el) => {
    setFieldError(`pantry:${item}`, null);
    const entry = state.pantry[item];
    const next = pantryCore.setAvailability(state.pantry, item, el.value);
    if (entry?.qty && el.value !== "some") withRecovery({ kind: "pantry-entry", key: item, entry, label: `Pantry: ${ITEMS[item].name}, ${pantryCore.amountText(entry)}` }, { ...state, pantry: next }, { keepFocus: true, message: `${ITEMS[item].name}: amount cleared` });
    else commit({ ...state, pantry: next });
  },
  "list-qty": ({ line }, el) => {
    const l = state.list.lines.find((x) => x.id === line);
    if (!l?.manual) {
      const parsed = pantryCore.parseAmount(el.value);
      if (parsed.kind === "blank" || parsed.kind === "invalid") {
        setFieldError(`list:${line}`, parsed.kind === "invalid" ? parsed.reason : "Enter an amount, or 0 to buy none. Your last amount is kept.", el.value);
        render();
        return;
      }
    }
    setFieldError(`list:${line}`, null);
    commit({ ...state, list: shop.setOverride(state.list, line, el.value) });
  },
  "list-name": ({ line }, el) => commit({ ...state, list: shop.renameManual(state.list, line, el.value) }),
  "list-check": ({ line }) => commit({ ...state, list: shop.toggleChecked(state.list, line) }),
  "draft-title": ({ draft }, el) => {
    const d = state.drafts[draft];
    commit({ ...state, drafts: { ...state.drafts, [draft]: { ...d, title: el.value.trim().slice(0, 200) || d.title } } });
    document.title = `${state.drafts[draft].title} · mise & match`;
  },
  // This is what the source yields, the denominator for scaling. It never scales anything by itself.
  "draft-servings": ({ draft }, el) => {
    const d = state.drafts[draft];
    const t = el.value.trim();
    const n = Number(t);
    const key = `draft-servings:${draft}`;
    if (t && !(Number.isInteger(n) && n >= 1 && n <= 100)) {
      setFieldError(key, "Use a whole number from 1 to 100. Your last value is kept.", el.value);
      render();
      return;
    }
    setFieldError(key, null);
    commit({ ...state, drafts: { ...state.drafts, [draft]: { ...d, servings: t ? n : null, targetServings: t ? d.targetServings : null } } });
  },
  "draft-match": ({ draft, line }, el) => updateDraftLine(draft, line, { item: el.value || null }),
  "draft-qty": ({ draft, line }, el) => {
    const key = `draft:${draft}:${line}`;
    const parsed = pantryCore.parseAmount(el.value);
    if (parsed.kind === "invalid" || parsed.kind === "zero" || (parsed.kind === "amount" && !validRepair(parsed.value))) {
      setFieldError(key, parsed.reason ?? "Use an amount above zero, or leave it out of calculations.", el.value);
      render();
      return;
    }
    setFieldError(key, null);
    if (parsed.kind === "blank") return;
    updateDraftLine(draft, line, { qty: parsed.value, qtyMax: null, unit: state.drafts[draft].lines.find((l) => l.id === line).unit ?? "" });
  },
  "draft-drained": ({ draft, line }, el) => {
    const parsed = pantryCore.parseAmount(el.value);
    const key = `draft:${draft}:${line}`;
    if (parsed.kind !== "amount") {
      setFieldError(key, parsed.reason ?? "Enter the drained amount you'd use.", el.value);
      render();
      return;
    }
    setFieldError(key, null);
    const l = state.drafts[draft].lines.find((x) => x.id === line);
    updateDraftLine(draft, line, { qty: parsed.value, unit: l.pack?.unit ?? l.unit, drainedConfirmed: true });
  },
  "draft-unit": ({ draft, line }, el) => updateDraftLine(draft, line, { unit: el.value, vagueUnit: null, unitConfirmed: true }),
  "draft-state-select": ({ draft, line }, el) => updateDraftLine(draft, line, { state: el.value || null }),
  "draft-optional": ({ draft, line }, el) => updateDraftLine(draft, line, { optional: el.checked }),
};

// ---------- dialog and toast ----------

// Where focus goes when the dialog closes, as a stable description of the trigger:
// a render may have replaced the element itself.
let triggerSig = null;

function openDialog(dialog) {
  if (!sheet.open) triggerSig = focusSignature(document.activeElement);
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
  const target = (triggerSig && root.querySelector(triggerSig)) || root.querySelector("[data-route-focus]");
  target?.focus({ preventScroll: true });
  triggerSig = null;
});

sheet.addEventListener("click", (e) => {
  if (e.target === sheet) closeDialog();
});

function renderSheet() {
  sheet.innerHTML = ui.dialog ? String(sheetView(ctx, ui.dialog)) : "";
  sheet.setAttribute("aria-labelledby", "sheet-title");
}

// A status message that stays long enough to act on, and waits while you're on it.
const TOAST_MS = 10000;
let toastTimer;
function clearToast() {
  clearTimeout(toastTimer);
  toastRegion.innerHTML = "";
  ui.toast = null;
}
function armToast() {
  clearTimeout(toastTimer);
  toastTimer = setTimeout(clearToast, TOAST_MS);
}
function toast(message, action) {
  ui.toast = { message, action };
  toastRegion.innerHTML = String(html`
    <div class="toast">
      <span>${message}</span>
      ${action ? action.href
        ? html`<a class="btn btn--quiet" href="${action.href}">${action.label}</a>`
        : html`<button class="btn btn--quiet" data-toast-action>${action.label}</button>` : ""}
      <button class="icon-btn toast-close" data-toast-close aria-label="Dismiss this message">${icon("close")}</button>
    </div>`);
  armToast();
}

toastRegion.addEventListener("click", (e) => {
  if (e.target.closest("[data-toast-close]")) clearToast();
  else if (e.target.closest("[data-toast-action]") && ui.toast?.action?.run) {
    const run = ui.toast.action.run;
    clearToast();
    run();
  } else if (e.target.closest("a")) {
    clearToast();
  }
});
for (const type of ["pointerenter", "focusin"]) toastRegion.addEventListener(type, () => clearTimeout(toastTimer));
for (const type of ["pointerleave", "focusout"]) toastRegion.addEventListener(type, () => ui.toast && armToast());

function announce(message) {
  liveEl.textContent = "";
  requestAnimationFrame(() => (liveEl.textContent = message));
}

// ---------- notices that stay until they're resolved ----------

function renderNotices() {
  const prot = protectedState();
  const report = loadReport();
  const parts = [];
  if (prot) {
    parts.push(html`
      <div class="notice" role="alert">
        <p><strong>${prot.kind === "future" ? "Your saved data is from a newer version of this app." : "Your saved data couldn't be read."}</strong> It's untouched and a copy is set aside. Changes here are temporary until you decide.</p>
        <div class="actions"><a class="btn btn--secondary btn--small" href="#/recovery">See and copy the data</a> <button class="btn btn--quiet" data-action="accept-fresh">Start fresh</button></div>
      </div>`);
  } else if (ui.tabConflict) {
    parts.push(html`
      <div class="notice" role="alert">
        <p><strong>Changed in another tab.</strong> Nothing has been overwritten. Changes here are temporary until you choose.</p>
        <div class="actions"><button class="btn btn--secondary btn--small" data-action="tab-review">Review</button></div>
      </div>`);
  } else if (!ui.persist.ok) {
    parts.push(html`
      <div class="notice" role="alert">
        <p><strong>Changes are temporary on this device.</strong> They couldn't be saved because browser storage is blocked or full, and will be lost when you close this tab.</p>
        <div class="actions"><button class="btn btn--secondary btn--small" data-action="retry-save">Try again</button> <a class="btn btn--quiet" href="#/profile">Copy my data</a></div>
      </div>`);
  } else if (report.skipped.length && !ui.skippedSeen) {
    parts.push(html`
      <div class="notice notice--cool" role="status">
        <p><strong>${plural(report.skipped.length, "saved record")} couldn't be used and ${report.skipped.length === 1 ? "was" : "were"} set aside.</strong> Everything else loaded. <a href="#/saved">See what and why</a></p>
      </div>`);
  }
  noticesEl.innerHTML = String(html`${parts}`);
}

// ---------- routing and rendering ----------

const PRIMARY = { today: "Today", recipes: "Recipes", pantry: "Pantry", list: "Shopping list", saved: "Saved" };
const PUSHED_TITLES = { plan: "Plan a few meals", import: "Import a recipe", profile: "Requirements and settings", missing: "Not found", problem: "Can't open that", recovery: "Your saved data" };

const STEP_NAMES = ["needs", "options", "compare", "shop"];

function parseCookRoute(id, a, b) {
  const recipe = getRecipe(id);
  if (!recipe) return { name: "missing" };
  const problem = (message) => ({ name: "problem", message, recipeId: id });
  if (a == null) return { name: "cook", id, kind: "session", cookKey: `session:${id}` };
  if (a === "original") return { name: "cook", id, kind: "original", cookKey: `original:${id}` };
  if (a === "v") {
    const v = state.versions[b];
    if (!v) return problem("That saved version isn't here. It may have been removed.");
    if (v.recipeId !== id) return problem(`That saved version belongs to ${getRecipe(v.recipeId).title}, not ${recipe.title}, so it wasn't opened.`);
    return { name: "cook", id, kind: "version", vid: b, cookKey: `version:${b}:${v.rev}` };
  }
  if (a === "p") {
    const p = state.plan.find((x) => x.id === b);
    if (!p) return problem("That planned meal isn't on your plan anymore.");
    if (p.recipeId !== id) return problem(`That planned meal is ${getRecipe(p.recipeId).title}, not ${recipe.title}, so it wasn't opened.`);
    return { name: "cook", id, kind: "plan", planId: b, cookKey: `plan:${b}` };
  }
  if (a === "c") {
    const c = state.cooks.find((x) => x.id === b);
    if (!c || c.recipeId !== id) return problem("That cooking record isn't for this recipe, so it wasn't opened.");
    return { name: "cook", id, kind: "record", cookId: b, cookKey: `record:${b}` };
  }
  return problem("That cook link isn't one this app recognizes.");
}

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [name, id, a, b] = hash.split("/");
  if (name === "recipe" && getRecipe(id)) return { name: "recipe", id };
  if (name === "adapt" && getRecipe(id)) return { name: "adapt", id, step: STEP_NAMES.includes(a) ? a : "needs" };
  if (name === "cook" && id === "draft" && state.drafts[a]) return { name: "cook", draft: a };
  if (name === "cook" && id) return parseCookRoute(id, a, b);
  if (name === "draft" && state.drafts[id]) return { name: "draft", id };
  if (["recipes", "pantry", "list", "saved", "plan", "import", "profile", "recovery"].includes(name)) return { name };
  if (name === "missing") return { name: "missing" };
  return hash && name !== "" ? { name: "missing" } : { name: "today" };
}

function focusSignature(el) {
  if (!el || el === document.body || !root.contains(el)) return null;
  const attrs = ["id", "data-action", "data-id", "data-item", "data-key", "data-line", "data-slot", "data-swap", "data-delta", "data-value", "data-scope", "data-nutrient", "data-step", "data-plan", "data-vid", "data-draft", "data-tab", "data-index", "data-cook", "data-rid", "data-keep", "value"];
  const choice = el.type === "radio" || el.type === "checkbox";
  const sig = attrs.filter((a) => el.hasAttribute(a) && (a !== "value" || choice)).map((a) => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join("");
  return sig || null;
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
    case "recovery": return recoveryView();
    case "problem": return html`<div class="page"><h1 tabindex="-1" data-route-focus>Can't open that</h1><p>${r.message}</p><p class="actions"><a class="btn btn--secondary" href="#/recipe/${r.recipeId}">Go to ${getRecipe(r.recipeId).title}</a> <a class="btn btn--quiet" href="#/saved">Saved</a></p></div>`;
    case "missing": return html`<div class="page"><h1 tabindex="-1" data-route-focus>Not found</h1><p>That page doesn't exist, or the item was removed.</p><p class="actions"><a class="btn btn--secondary" href="#/">Go to Today</a> <a class="btn btn--quiet" href="#/saved">Saved</a></p></div>`;
    default: return todayView(ctx);
  }
}

function recoveryView() {
  const prot = protectedState();
  const text = prot ? prot.raw : JSON.stringify(state.skipped ?? [], null, 1);
  return html`
    <div class="page">
      <a class="back-link" href="#/">${icon("back")} Today</a>
      <h1 tabindex="-1" data-route-focus>Your saved data</h1>
      ${prot ? html`<p>${prot.kind === "future" ? `This was saved by a newer version of the app (version ${prot.version}), which this one can't read safely.` : "This couldn't be read. It may be damaged."} It stays in this browser, untouched, until you start fresh, and a copy stays after that. Keep the text below somewhere safe if it matters to you.</p>` : html`<p>These records couldn't be used when your data was loaded. Everything else is working normally.</p>`}
      <label class="field"><span class="field-label">Recovery text</span><textarea id="recovery-text" class="input" rows="10" readonly>${text}</textarea></label>
      <div class="actions">
        <button class="btn btn--secondary" data-action="copy-recovery">Copy</button>
        ${prot ? html`<button class="btn btn--quiet" data-action="accept-fresh">Start fresh</button>` : ""}
      </div>
    </div>`;
}

// A view that throws gets a way forward, and stored data isn't touched.
function errorView(error) {
  console.error(error);
  return html`
    <div class="page">
      <h1 tabindex="-1" data-route-focus>Something went wrong on this screen</h1>
      <p>Your saved data hasn't been changed. Try again, or go somewhere else.</p>
      <p class="actions"><button class="btn btn--secondary" data-action="try-again">Try again</button> <a class="btn btn--quiet" href="#/">Go to Today</a> <a class="btn btn--quiet" href="#/recovery">See saved data</a></p>
    </div>`;
}

actions["try-again"] = () => render({ keepFocus: false, routeChanged: true });

function titleFor(r) {
  if (r.name === "today") return "mise & match";
  if (r.name === "recipe" || r.name === "adapt") return `${getRecipe(r.id).title} · mise & match`;
  if (r.name === "cook") return `Cooking ${r.draft ? state.drafts[r.draft].title : getRecipe(r.id).title} · mise & match`;
  if (r.name === "draft") return `${state.drafts[r.id].title} · mise & match`;
  return `${PRIMARY[r.name] ?? PUSHED_TITLES[r.name] ?? root.querySelector("h1")?.textContent ?? "mise & match"} · mise & match`;
}

function render({ keepFocus = true, routeChanged = false, initial = false } = {}) {
  const active = document.activeElement;
  const sig = keepFocus ? focusSignature(active) : null;
  const caret = sig && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
  const scrollY = window.scrollY;
  // Values typed but not yet committed survive a redraw.
  const typed = new Map([...root.querySelectorAll("[data-keep]")].map((el) => [el.dataset.keep, el.value]));
  const r = ui.route;
  try {
    root.innerHTML = String(renderView(r));
  } catch (error) {
    root.innerHTML = String(errorView(error));
  }
  for (const el of root.querySelectorAll("[data-keep]")) if (typed.has(el.dataset.keep)) el.value = typed.get(el.dataset.keep);
  for (const d of root.querySelectorAll("details[data-open-key]")) if (d.dataset.openKey in ui.open) d.open = ui.open[d.dataset.openKey];
  const pushed = !(r.name in PRIMARY);
  document.body.dataset.screen = pushed ? "pushed" : "primary";
  document.body.dataset.route = r.name;
  renderNav();
  if (ui.dialog && sheet.open) renderSheet();
  document.title = titleFor(r);

  if (routeChanged) {
    window.scrollTo(0, 0);
    if (!initial) root.querySelector("[data-route-focus]")?.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, scrollY);
    if (sig) {
      const el = root.querySelector(sig);
      el?.focus({ preventScroll: true });
      if (caret && el?.setSelectionRange) el.setSelectionRange(...caret);
    }
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

function enterRoute() {
  ui.route = parseRoute();
  // Visiting a step records it on the session so Continue returns there.
  if (ui.route.name === "adapt") {
    const s = state.sessions[ui.route.id];
    if (!s) state = { ...state, sessions: { ...state.sessions, [ui.route.id]: { ...V.startSession(getRecipe(ui.route.id)), step: ui.route.step } }, lastSession: ui.route.id };
    else if (s.step !== ui.route.step) state = { ...state, sessions: { ...state.sessions, [ui.route.id]: { ...s, step: ui.route.step } } };
    persist();
  }
  if (ui.route.name === "cook" && ui.route.cookKey && !state.cooking[ui.route.cookKey]) {
    ensureCooking(ui.route);
    persist();
  }
}

window.addEventListener("hashchange", () => {
  if (sheet.open) closeDialog();
  enterRoute();
  render({ keepFocus: false, routeChanged: true });
});

// Another tab wrote: say so, and don't overwrite it until there's a choice.
window.addEventListener("storage", (e) => {
  if (e.key && !e.key.startsWith("mise-match:v1")) return;
  if (hasExternalChange()) {
    ui.tabConflict = true;
    renderNotices();
  }
});

// A photo that fails to load becomes the same tile as a dish with no photo.
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img?.tagName !== "IMG") return;
  const fig = img.closest("figure.photo");
  if (!fig) return;
  const tile = document.createElement("template");
  tile.innerHTML = String(photoTile(fig.dataset.tile || img.alt, fig.dataset.size, img.alt));
  fig.replaceWith(tile.content);
}, true);

// ---------- events ----------

function run(fn, ...args) {
  try {
    const result = fn(...args);
    if (result?.catch) result.catch((error) => console.error(error));
  } catch (error) {
    // A failed action never leaves a half-drawn screen; state stays what it was before the action finished.
    console.error(error);
    toast("That didn't work. Nothing else has changed.");
  }
}

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
  run(fn, { ...el.dataset });
});

document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const fn = changeActions[el.dataset.action];
  if (fn) run(fn, { ...el.dataset }, el);
});

// Redrawing during IME composition would throw the composition away.
let composing = false;
document.addEventListener("compositionstart", () => (composing = true));
document.addEventListener("compositionend", (e) => {
  composing = false;
  e.target.dispatchEvent(new Event("input", { bubbles: true }));
});

document.addEventListener("input", (e) => {
  const el = e.target;
  const a = el.dataset?.action;
  if (a === "import-text") {
    ui.importText = el.value;
    return; // no re-render while typing a long paste
  }
  if (a === "import-url") {
    ui.importUrl = el.value;
    return;
  }
  if (a !== "recipe-search" && a !== "pantry-search") return;
  if (a === "recipe-search") ui.query = el.value;
  else {
    ui.pantryQuery = el.value;
    ui.pantryHint = null;
  }
  if (composing || e.isComposing) return;
  render();
  if (a === "pantry-search" && el.value.trim()) {
    const n = searchIngredients(el.value, { limit: 6 }).length;
    announce(n ? `${plural(n, "match", "matches")}.` : "No matches. You can add it as your own item.");
  } else if (a === "recipe-search") {
    announce(`${plural(root.querySelectorAll(".recipe-row").length, "recipe")} shown.`);
  }
});

document.addEventListener("submit", (e) => {
  const form = e.target;
  const kind = form.dataset.action;
  if (kind === "pantry-add-form") {
    e.preventDefault();
    const q = ui.pantryQuery.trim();
    if (!q) return;
    // Enter only adds an unambiguous exact match. Anything else stays a choice.
    const match = exactIngredient(q);
    if (match) {
      if (state.pantry[match]) {
        ui.pantryHint = `${ITEMS[match].name} is already in your pantry.`;
        render();
      } else actions["pantry-add"]({ item: match });
    } else {
      ui.pantryHint = searchIngredients(q, { limit: 1 }).length ? "Choose one of the matches below, or add it as your own item." : "No match. Add it as your own item below.";
      render();
    }
  } else if (kind === "list-add") {
    e.preventDefault();
    const data = new FormData(form);
    const list = shop.addManual(state.list, String(data.get("name") ?? ""), String(data.get("qty") ?? ""));
    if (list === state.list) return;
    form.reset();
    commit({ ...state, list }, { keepFocus: false });
    document.querySelector('.add-item [name="name"]')?.focus();
  } else if (kind === "import-paste") {
    e.preventDefault();
    ui.importResult = { ...importer.parsePastedText(ui.importText), method: "paste", url: ui.importKeptUrl };
    render({ keepFocus: false });
    root.querySelector("#import-result")?.focus();
  } else if (kind === "import-link") {
    e.preventDefault();
    ui.importResult = importer.extractFromLink(ui.importUrl);
    render({ keepFocus: false });
    root.querySelector("#import-result")?.focus();
  } else if (kind === "draft-split-form") {
    e.preventDefault();
    const { draft, line } = form.dataset;
    const data = new FormData(form);
    const l = state.drafts[draft].lines.find((x) => x.id === line);
    const parts = l.match.components.map((id) => ({ item: id, qty: pantryCore.parseAmount(data.get(`qty-${id}`)), unit: data.get("unit") }));
    if (!parts.every((p) => p.qty.kind === "amount")) {
      setFieldError(`draft:${draft}:${line}`, "Enter an amount for each, or keep it as unknown.", "");
      render();
      return;
    }
    setFieldError(`draft:${draft}:${line}`, null);
    updateDraftLine(draft, line, { split: parts.map((p) => ({ item: p.item, qty: p.qty.value, unit: p.unit })), calc: null }, "Split into the amounts you gave");
  } else if (kind === "rename-form" || kind === "save-form" || form.closest("#sheet")) {
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

enterRoute();
render({ keepFocus: false, routeChanged: true, initial: true });
renderNotices();
window.__miseBooted = true;

// For the review script and debugging only: no app logic depends on this.
window.__mise = { get state() { return state; }, RECIPES };
