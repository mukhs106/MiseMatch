// App controller: routing, actions, undo, rendering and persistence.
// Views are pure functions of (state, ui); every action updates state, saves, and re-renders.

import { getRecipe } from "./data/recipes.js";
import { getSwap } from "./data/swaps.js";
import { ITEMS } from "./data/items.js";
import { load, save, clear } from "./store.js";
import { defaultAdaptation, deriveRecipe, applySwap, removeSwap, setServings } from "./core/adapt.js";
import * as shop from "./core/shopping.js";
import { html, plural } from "./ui/html.js";
import { icon } from "./ui/icons.js";
import { homeView, resultsView, resultsStatus } from "./ui/home.js";
import { recipeView } from "./ui/recipe.js";
import { listView } from "./ui/list.js";
import { sheetView } from "./ui/swapSheet.js";

let state = load();
const ui = {
  route: { name: "home" },
  recipesView: "all", // Recipes: "all" | "have" | "saved", for this session
  query: "", // Recipes search, for this session
  view: {}, // recipeId -> "mine" | "original"
  open: {}, // disclosure open state by data-open-key, for this session
  undo: {}, // recipeId -> [previous adaptation], in-memory only
  dialog: null,
  toast: null,
};

const root = document.getElementById("app");
const sheet = document.getElementById("sheet");
const toastRegion = document.getElementById("toast");
const nav = document.getElementById("nav");

// Context handed to views: read-only helpers over the current state.
const ctx = {
  get state() {
    return state;
  },
  ui,
  recipe: getRecipe,
  adaptation: (id) => state.adaptations[id] ?? defaultAdaptation(getRecipe(id)),
  derived: (id) => deriveRecipe(getRecipe(id), ctx.adaptation(id)),
  needs: (id) => shop.needsFor(ctx.derived(id), state.pantry, ctx.adaptation(id).partial),
};

// ---------- state changes ----------

function commit(next, { keepFocus = true } = {}) {
  state = next;
  save(state);
  render({ keepFocus });
}

function changeAdaptation(id, next, message) {
  const prev = ctx.adaptation(id);
  ui.undo[id] = [...(ui.undo[id] ?? []), prev].slice(-20);
  commit({ ...state, adaptations: { ...state.adaptations, [id]: next } });
  if (message) toast(message, { label: "Undo", run: () => undo(id) });
}

function undo(id) {
  const stack = ui.undo[id] ?? [];
  if (!stack.length) return;
  const prev = stack.pop();
  // Undo covers servings and swaps; partial amounts aren't part of the undo history.
  const partial = ctx.adaptation(id).partial;
  commit({ ...state, adaptations: { ...state.adaptations, [id]: { ...prev, partial } } });
  toast("Change undone");
}

/** Shared presence only: "have", "need", or null to unmark. */
function setPantry(item, status) {
  const pantry = { ...state.pantry };
  if (status) pantry[item] = { status };
  else delete pantry[item];
  commit({ ...state, pantry });
}

/**
 * Availability from inside a recipe. "have" / "need" are shared presence;
 * "some" is a partial amount that belongs to this recipe only.
 */
function setAvailability(id, item, status, amount = {}) {
  const a = ctx.adaptation(id);
  const partial = { ...(a.partial ?? {}) };
  const pantry = { ...state.pantry };
  if (status === "some") {
    partial[item] = { ...(partial[item] ?? {}), ...amount };
  } else {
    delete partial[item];
    if (status) pantry[item] = { status };
    else delete pantry[item];
  }
  commit({ ...state, pantry, adaptations: { ...state.adaptations, [id]: { ...a, partial } } });
}

function syncList(id) {
  const recipe = getRecipe(id);
  const { list, report } = shop.syncRecipe(state.list, recipe, ctx.needs(id));
  commit({ ...state, list });
  const parts = [];
  if (report.added) parts.push(`${plural(report.added, "item")} added`);
  if (report.updated) parts.push(`${report.updated} updated`);
  if (report.conflicts) parts.push(`${report.conflicts} to review`);
  toast(parts.length ? `List: ${parts.join(", ")}` : "List already matches this recipe", { label: "View list", href: "#/list" });
}

const actions = {
  "save-recipe": ({ id }) => {
    commit({ ...state, saved: [...state.saved.filter((x) => x !== id), id] });
    toast("Saved. Find it under Saved in Recipes.");
  },
  "unsave-recipe": ({ id }) => {
    commit({ ...state, saved: state.saved.filter((x) => x !== id) });
    toast("Removed from Saved. Your version is kept.", {
      label: "Undo",
      run: () => commit({ ...state, saved: [...state.saved, id] }),
    });
  },
  "set-view": ({ id, view }) => {
    ui.view[id] = view;
    render();
  },
  servings: ({ id, delta }) => {
    const a = ctx.adaptation(id);
    const next = setServings(a, a.servings + Number(delta));
    if (next.servings !== a.servings) changeAdaptation(id, next);
  },
  "open-swaps": ({ id, slot }) => openDialog({ type: "slot", recipeId: id, slot }),
  "preview-swap": ({ id, swap, from }) => openDialog({ type: "compare", recipeId: id, swapId: swap, from, returnSlot: ui.dialog?.slot }),
  "back-to-options": () => openDialog({ type: "slot", recipeId: ui.dialog.recipeId, slot: ui.dialog.returnSlot }),
  "apply-swap": ({ id, swap, remove }) => {
    const removeIds = remove ? remove.split(",") : [];
    closeDialog();
    changeAdaptation(id, applySwap(ctx.adaptation(id), swap, removeIds), `Applied: ${getSwap(swap).label}`);
  },
  "remove-swap": ({ id, swap, close }) => {
    if (close) closeDialog();
    changeAdaptation(id, removeSwap(ctx.adaptation(id), swap), `Undid: ${getSwap(swap).label}`);
  },
  "restore-original": ({ id }) =>
    changeAdaptation(id, { ...defaultAdaptation(getRecipe(id)), partial: ctx.adaptation(id).partial }, "Back to the original recipe"),
  undo: ({ id }) => undo(id),
  // In-page jump. Hash links would be read as routes, so this scrolls and moves focus instead.
  jump: ({ target }) => {
    const el = document.getElementById(target);
    el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  },
  "goal-toggle": ({ goal }) => {
    const goals = state.goals.includes(goal) ? state.goals.filter((g) => g !== goal) : [...state.goals, goal];
    commit({ ...state, goals });
  },
  "pantry-toggle": ({ item }) => {
    setPantry(item, state.pantry[item]?.status === "have" ? null : "have");
  },
  "pantry-clear": () => {
    const pantry = state.pantry;
    commit({ ...state, pantry: {} });
    toast("Cleared what's on hand", { label: "Undo", run: () => commit({ ...state, pantry }) });
  },
  "group-have": ({ id, group }) => {
    const pantry = { ...state.pantry };
    const a = ctx.adaptation(id);
    const partial = { ...(a.partial ?? {}) };
    for (const line of ctx.derived(id).ingredients.filter((l) => l.group === group)) {
      for (const e of line.entries) {
        if (ITEMS[e.item].noShop) continue;
        pantry[e.item] = { status: "have" };
        delete partial[e.item];
      }
    }
    commit({ ...state, pantry, adaptations: { ...state.adaptations, [id]: { ...a, partial } } });
  },
  "sync-list": ({ id }) => syncList(id),
  "list-delete": ({ line }) => {
    const before = state.list;
    const name = before.lines.find((l) => l.id === line)?.name;
    commit({ ...state, list: shop.deleteLine(before, line) }, { keepFocus: false });
    toast(`Removed ${name}`, { label: "Undo", run: () => commit({ ...state, list: before }) });
  },
  "list-resolve": ({ line, choice }) => commit({ ...state, list: shop.resolveConflict(state.list, line, choice) }),
  "list-addback": ({ id, key }) => {
    const list = shop.undismiss(state.list, id, key);
    state = { ...state, list };
    syncList(id);
  },
  "list-clear-checked": () => {
    const before = state.list;
    commit({ ...state, list: shop.clearChecked(before) }, { keepFocus: false });
    toast("Cleared checked items", { label: "Undo", run: () => commit({ ...state, list: before }) });
  },
  "reset-demo": () => openDialog({ type: "reset" }),
  "confirm-reset": () => {
    closeDialog();
    ui.undo = {};
    ui.view = {};
    state = clear();
    save(state);
    location.hash = "#/";
    render({ keepFocus: false });
    toast("Demo reset");
  },
  "close-dialog": () => closeDialog(),
  "recipes-view": ({ view }) => {
    ui.recipesView = view;
    render();
  },
  // From Use what you have with nothing marked: open the "What you have" row and focus it.
  "open-kitchen": () => {
    ui.open.kitchen = true;
    render({ keepFocus: false });
    const summary = root.querySelector("#kitchen summary");
    summary?.scrollIntoView({ block: "start" });
    summary?.focus({ preventScroll: true });
  },
};

// Inputs that commit on change (not on every keystroke, so typing isn't interrupted).
const changeActions = {
  avail: ({ id, item }, el) => setAvailability(id, item, el.value),
  "avail-toggle": ({ id, item }, el) => setAvailability(id, item, el.checked ? "have" : null),
  "avail-qty": ({ id, item, unit }, el) => {
    const n = parseFloat(el.value);
    const valid = Number.isFinite(n) && n > 0;
    setAvailability(id, item, "some", { qty: valid ? n : undefined, unit: valid ? unit : undefined });
  },
  "avail-unit": ({ id, item }, el) => {
    const current = ctx.adaptation(id).partial?.[item] ?? {};
    setAvailability(id, item, "some", { unit: current.qty != null ? el.value : undefined });
    // Keep the selected unit for the qty input even before an amount is entered.
    const input = document.querySelector(`[data-action="avail-qty"][data-item="${item}"]`);
    if (input) input.dataset.unit = el.value;
  },
  "list-qty": ({ line }, el) => commit({ ...state, list: shop.setOverride(state.list, line, el.value) }),
  "list-name": ({ line }, el) => commit({ ...state, list: shop.renameManual(state.list, line, el.value) }),
  "list-check": ({ line }) => commit({ ...state, list: shop.toggleChecked(state.list, line) }),
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
  // The close event can arrive after another sheet has already opened; leave that one alone.
  if (sheet.open) return;
  ui.dialog = null;
  sheet.innerHTML = "";
  if (lastTrigger?.isConnected) lastTrigger.focus();
  lastTrigger = null;
});

// Clicking the backdrop closes the sheet.
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

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [name, id] = hash.split("/");
  if (name === "recipe" && getRecipe(id)) return { name: "recipe", id };
  if (name === "list") return { name: "list" };
  return { name: "home" };
}

function focusSignature(el) {
  if (!el || el === document.body || !root.contains(el)) return null;
  const attrs = ["data-action", "data-id", "data-item", "data-line", "data-slot", "data-swap", "data-delta", "data-goal", "data-view", "data-group", "data-place", "value"];
  return attrs.filter((a) => el.hasAttribute(a)).map((a) => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join("");
}

/**
 * routeChanged: scroll to top and move focus to the new page's heading so screen
 * readers announce it. Not done on first load (focus starts at the top of the
 * document, where the skip link is). See the focus-target rules in base.css.
 */
function render({ keepFocus = true, routeChanged = false, initial = false } = {}) {
  const sig = keepFocus ? focusSignature(document.activeElement) : null;
  const r = ui.route;
  let view;
  if (r.name === "recipe") view = recipeView(ctx, getRecipe(r.id));
  else if (r.name === "list") view = listView(ctx);
  else view = homeView(ctx);
  root.innerHTML = String(view);
  checkImages(root);
  renderNav();
  if (ui.dialog && sheet.open) renderSheet();

  if (routeChanged) {
    window.scrollTo(0, 0);
    if (!initial) root.querySelector("[data-route-focus]")?.focus({ preventScroll: true });
    document.title = r.name === "recipe" ? `${getRecipe(r.id).title} · mise & match` : r.name === "list" ? "Grocery list · mise & match" : "Recipes · mise & match";
  } else if (sig) {
    root.querySelector(sig)?.focus({ preventScroll: true });
  }
}

function renderNav() {
  const open = state.list.lines.filter((l) => !l.checked).length;
  const r = ui.route.name;
  nav.innerHTML = String(html`
    <a href="#/" ${r !== "list" ? html`aria-current="page"` : ""}>${icon("book")} Recipes</a>
    <a href="#/list" ${r === "list" ? html`aria-current="page"` : ""}>${icon("list")} Grocery list
      ${open ? html`<span class="count" aria-label="${plural(open, "item")}">${open}</span>` : ""}</a>`);
}

window.addEventListener("hashchange", () => {
  ui.route = parseRoute();
  if (sheet.open) closeDialog();
  render({ keepFocus: false, routeChanged: true });
});

// ---------- events ----------

document.addEventListener("click", (e) => {
  // The skip link's "#app" would be read as a route by the hash router; move focus directly instead.
  if (e.target.closest(".skip-link")) {
    e.preventDefault();
    root.focus();
    return;
  }
  const el = e.target.closest("[data-action]");
  if (!el || el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "FORM") return;
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

document.addEventListener("submit", (e) => {
  const form = e.target.closest('[data-action="list-add"]');
  if (!form) return;
  e.preventDefault();
  const data = new FormData(form);
  const list = shop.addManual(state.list, String(data.get("name") ?? ""), String(data.get("qty") ?? ""));
  if (list === state.list) return;
  commit({ ...state, list }, { keepFocus: false });
  document.querySelector('.add-item [name="name"]')?.focus();
});

// Search updates only the results, so typing is never interrupted by a full render.
document.addEventListener("input", (e) => {
  if (!e.target.matches?.('[data-action="recipe-search"]')) return;
  ui.query = e.target.value;
  const results = root.querySelector("#recipe-results");
  if (!results) return;
  results.innerHTML = String(resultsView(ctx));
  root.querySelector("#results-status").textContent = resultsStatus(ctx);
  checkImages(results);
});

// A recipe photo that fails shows its designed tile instead; a supporting image just goes away.
// Error events don't bubble, so this listens in the capture phase.
function imageFailed(img) {
  const frame = img.closest("picture") && img.closest(".photo");
  if (frame) frame.classList.add("is-failed");
  else if (img.classList.contains("supporting")) img.hidden = true;
}
document.addEventListener("error", (e) => {
  if (e.target instanceof HTMLImageElement) imageFailed(e.target);
}, true);
// Images that already failed (for example from the cache) before the listener saw them.
function checkImages(scope) {
  for (const img of scope.querySelectorAll(".photo picture img, img.supporting")) {
    if (img.complete && img.currentSrc && img.naturalWidth === 0) imageFailed(img);
  }
}

// <details> elements survive re-renders by remembering their open state.
document.addEventListener("toggle", (e) => {
  const key = e.target.dataset?.openKey;
  if (key) ui.open[key] = e.target.open;
}, true);

// Input modality, so focus moved by script is only drawn for keyboard users.
const setInput = (mode) => () => (document.documentElement.dataset.input = mode);
document.addEventListener("keydown", (e) => {
  if (!e.metaKey && !e.ctrlKey && !e.altKey) setInput("keyboard")();
}, true);
document.addEventListener("pointerdown", setInput("pointer"), true);

ui.route = parseRoute();
render({ keepFocus: false, routeChanged: true, initial: true });
