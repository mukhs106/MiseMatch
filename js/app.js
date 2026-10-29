// App controller: routing, actions, undo, rendering and persistence.
// Views are pure functions of (state, ui); every action updates state, saves, and re-renders.

import { getRecipe } from "./data/recipes.js";
import { getSwap } from "./data/swaps.js";
import { ITEMS } from "./data/items.js";
import { load, save, clear } from "./store.js";
import { defaultAdaptation, deriveRecipe, applySwap, removeSwap, setServings } from "./core/adapt.js";
import * as shop from "./core/shopping.js";
import * as pantryCore from "./core/pantry.js";
import { html, plural } from "./ui/html.js";
import { icon } from "./ui/icons.js";
import { homeView } from "./ui/home.js";
import { pantryView } from "./ui/pantry.js";
import { profileView } from "./ui/profile.js";
import { recipeView } from "./ui/recipe.js";
import { listView } from "./ui/list.js";
import { sheetView } from "./ui/swapSheet.js";

let state = load();
const ui = {
  route: { name: "home" },
  view: {}, // recipeId -> "mine" | "original"
  open: {}, // disclosure open state by data-open-key, for this session
  query: "", // Recipes search
  mode: "all", // Recipes: "all" | "have"
  pantryQuery: "", // Pantry add-by-search
  bought: {}, // list line id -> true once "Add to pantry" was used, for this session
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
  // Pantry amounts are allocated once across the list, in list order. A recipe not on
  // the list is costed as if added after the ones that are.
  needs: (id) => {
    const order = listOrder();
    return allocation(order.includes(id) ? order : [...order, id]).get(id);
  },
};

function listOrder() {
  return Object.keys(state.list.synced).filter((id) => getRecipe(id));
}

let allocCache = { key: null, map: null };
function allocation(order) {
  const key = order.join(",");
  if (allocCache.state === state && allocCache.key === key) return allocCache.map;
  const map = shop.allocateNeeds(order.map((id) => ({ id, derived: ctx.derived(id) })), state.pantry);
  allocCache = { state, key, map };
  return map;
}

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
  commit({ ...state, adaptations: { ...state.adaptations, [id]: prev } });
  toast("Change undone");
}

/** Every availability mark, from a recipe or the Pantry screen, writes to the one pantry. */
function setAvailability(item, status, amount) {
  commit({ ...state, pantry: pantryCore.setAvailability(state.pantry, item, status, amount) });
}

/**
 * Update the list for one recipe. Because pantry amounts are shared out in list
 * order, every recipe already on the list is recalculated with it.
 */
function syncList(id) {
  const order = listOrder();
  if (id && !order.includes(id)) order.push(id);
  const map = allocation(order);
  let list = state.list;
  const report = { added: 0, updated: 0, conflicts: 0 };
  for (const rid of order) {
    const r = shop.syncRecipe(list, getRecipe(rid), map.get(rid));
    list = r.list;
    for (const k of Object.keys(report)) report[k] += r.report[k];
  }
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
    toast("Saved to Recipes");
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
  "restore-original": ({ id }) => changeAdaptation(id, defaultAdaptation(getRecipe(id)), "Back to the original recipe"),
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
  "clear-search": () => {
    ui.query = "";
    render({ keepFocus: false });
    document.querySelector('[data-action="recipe-search"]')?.focus();
  },
  "set-mode": ({ mode }) => {
    ui.mode = mode;
    render();
  },
  // Quick chips on the Pantry screen: in the pantry (amount unknown) or not.
  "pantry-toggle": ({ item }) => setAvailability(item, state.pantry[item] ? "need" : "have"),
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
    for (const line of ctx.derived(id).ingredients.filter((l) => l.group === group)) {
      for (const e of line.entries) if (!ITEMS[e.item].noShop) pantry = pantryCore.setAvailability(pantry, e.item, "have");
    }
    commit({ ...state, pantry });
  },
  // Offered on a checked-off list item; never automatic.
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
    ui.query = "";
    ui.mode = "all";
    ui.bought = {};
    location.hash = "#/";
    render({ keepFocus: false });
    toast("Demo reset");
  },
  "close-dialog": () => closeDialog(),
};

// Inputs that commit on change (not on every keystroke, so typing isn't interrupted).
const changeActions = {
  avail: ({ item }, el) => setAvailability(item, el.value),
  "avail-toggle": ({ item }, el) => setAvailability(item, el.checked ? "have" : "need"),
  // Amounts (recipe "Some" rows and Pantry rows): empty means amount unknown.
  "avail-qty": ({ item, unit }, el) => {
    const n = parseFloat(el.value);
    const valid = Number.isFinite(n) && n > 0;
    setAvailability(item, "some", { qty: valid ? n : undefined, unit });
  },
  "avail-unit": ({ item }, el) => {
    setAvailability(item, "some", { unit: el.value });
    // Keep the chosen unit on the amount input too.
    document.querySelectorAll(`[data-action="avail-qty"][data-item="${CSS.escape(item)}"]`).forEach((i) => (i.dataset.unit = el.value));
  },
  "pantry-qty": ({ key }, el) => {
    // Pantry rows: an empty amount means "have it, amount unknown".
    const n = parseFloat(el.value);
    const unit = el.dataset.unit;
    setAvailability(key, Number.isFinite(n) && n > 0 ? "some" : "have", Number.isFinite(n) && n > 0 ? { qty: n, unit } : undefined);
  },
  "pantry-unit": ({ key }, el) => {
    const e = state.pantry[key];
    if (e) commit({ ...state, pantry: { ...state.pantry, [key]: { ...e, unit: el.value } } });
  },
  "pantry-free-qty": ({ key }, el) => {
    const e = state.pantry[key];
    if (e) commit({ ...state, pantry: { ...state.pantry, [key]: { ...e, qtyText: el.value.trim() || undefined } } });
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

// Primary screens have the tab bar; recipe detail and profile are pushed screens with a back link.
const PUSHED = new Set(["recipe", "profile"]);
const TITLES = { home: "Recipes", list: "Grocery list", pantry: "Pantry", profile: "Profile and settings" };

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [name, id] = hash.split("/");
  if (name === "recipe" && getRecipe(id)) return { name: "recipe", id };
  if (name === "list" || name === "pantry" || name === "profile") return { name };
  return { name: "home" };
}

function focusSignature(el) {
  if (!el || el === document.body || !root.contains(el)) return null;
  const attrs = ["data-action", "data-id", "data-item", "data-key", "data-line", "data-slot", "data-swap", "data-delta", "data-goal", "data-view", "data-mode", "data-group", "data-place", "value"];
  // `value` identifies a radio or checkbox option; on text fields it changes as you type.
  const choice = el.type === "radio" || el.type === "checkbox";
  return attrs.filter((a) => el.hasAttribute(a) && (a !== "value" || choice)).map((a) => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join("");
}

/**
 * routeChanged: scroll to top and move focus to the new page's heading so screen
 * readers announce it. Not done on first load (focus starts at the top of the
 * document, where the skip link is). See the focus-target rules in base.css.
 */
function render({ keepFocus = true, routeChanged = false, initial = false } = {}) {
  const active = document.activeElement;
  const sig = keepFocus ? focusSignature(active) : null;
  // Typing in a search field re-renders; keep the caret where it was.
  const caret = sig && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
  const r = ui.route;
  let view;
  if (r.name === "recipe") view = recipeView(ctx, getRecipe(r.id));
  else if (r.name === "list") view = listView(ctx);
  else if (r.name === "pantry") view = pantryView(ctx);
  else if (r.name === "profile") view = profileView(ctx);
  else view = homeView(ctx);
  root.innerHTML = String(view);
  document.body.dataset.screen = PUSHED.has(r.name) ? "pushed" : "primary";
  document.body.dataset.route = r.name;
  renderNav();
  if (ui.dialog && sheet.open) renderSheet();

  if (routeChanged) {
    window.scrollTo(0, 0);
    if (!initial) root.querySelector("[data-route-focus]")?.focus({ preventScroll: true });
    const title = r.name === "recipe" ? getRecipe(r.id).title : TITLES[r.name];
    document.title = r.name === "home" ? "mise & match" : `${title} · mise & match`;
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
  const tab = (href, name, iconName, label, extra = "") => html`
    <a href="${href}" ${r === name ? html`aria-current="page"` : ""}>${icon(iconName)}<span class="tab-label">${label}</span>${extra}</a>`;
  nav.innerHTML = String(html`
    ${tab("#/", "home", "book", "Recipes")}
    ${tab("#/list", "list", "list", "Grocery list", open ? html`<span class="count" aria-label="${plural(open, "item")} to get">${open}</span>` : "")}
    ${tab("#/pantry", "pantry", "jar", "Pantry")}`);
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

// Search fields filter as you type.
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset?.action === "recipe-search") ui.query = el.value;
  else if (el.dataset?.action === "pantry-search") ui.pantryQuery = el.value;
  else return;
  render();
});

document.addEventListener("submit", (e) => {
  const pantryForm = e.target.closest('[data-action="pantry-add-form"]');
  if (pantryForm) {
    // Enter adds the best catalog match, or the text as a free-text item.
    e.preventDefault();
    const q = ui.pantryQuery.trim();
    if (!q) return;
    const [match] = pantryCore.searchCatalog(q, 1);
    if (match) actions["pantry-add"]({ item: match });
    else actions["pantry-add-free"]({ name: q });
    return;
  }
  const form = e.target.closest('[data-action="list-add"]');
  if (!form) return;
  e.preventDefault();
  const data = new FormData(form);
  const list = shop.addManual(state.list, String(data.get("name") ?? ""), String(data.get("qty") ?? ""));
  if (list === state.list) return;
  commit({ ...state, list }, { keepFocus: false });
  document.querySelector('.add-item [name="name"]')?.focus();
});

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
