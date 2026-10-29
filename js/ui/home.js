// Recipes: a way in to the demo recipe, the compact "what you have" row, then
// one discovery list with search and three views: All recipes, Use what you
// have (pantry suggestions with a reason on each card) and Saved.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { recipePhoto, supportingImage } from "./photo.js";
import { RECIPES, getRecipe, HERO_RECIPE_ID } from "../data/recipes.js";
import { shortName } from "../data/items.js";
import { suggest, pantryChipItems } from "../core/suggest.js";
import { matchesQuery } from "../core/search.js";
import { isAdapted } from "../core/adapt.js";

export const RECIPE_VIEWS = [
  ["all", "All recipes"],
  ["have", "Use what you have"],
  ["saved", "Saved"],
];

export function homeView(ctx) {
  const view = ctx.ui.recipesView;
  return html`
    <div class="page page--wide home">
      <header class="home-intro">
        <div class="home-intro-text">
          <h1 tabindex="-1" data-route-focus>Recipes</h1>
          <p class="muted">Recipes that work with what you have and what you need.</p>
        </div>
        ${supportingImage("thali-cutout", { width: 1440, height: 1400, sizes: "(min-width: 720px) 200px, 112px", className: "home-brand" })}
      </header>
      ${startCard(ctx)}
      ${kitchenSection(ctx)}
      <section class="discover" aria-labelledby="discover-h">
        <h2 id="discover-h" class="visually-hidden">Browse recipes</h2>
        <label class="field search">
          <span class="field-label">Search our collection (${plural(RECIPES.length, "demo recipe")})</span>
          <input class="input" type="search" data-action="recipe-search" value="${ctx.ui.query}"
            autocomplete="off" spellcheck="false" aria-describedby="search-hint">
          <span id="search-hint" class="small muted">Matches names, ingredients and cuisine in the view below.</span>
        </label>
        <div class="view-toggle recipe-views" role="group" aria-label="Which recipes to show">
          ${RECIPE_VIEWS.map(([id, label]) => html`
            <button class="view-btn" aria-pressed="${view === id}" data-action="recipes-view" data-view="${id}">${label}</button>`)}
        </div>
        <p id="results-status" class="small muted" role="status">${resultsStatus(ctx)}</p>
        <div id="recipe-results">${resultsView(ctx)}</div>
      </section>
      ${aboutSection()}
    </div>`;
}

// The recipes in the current view, before search. Each entry may carry a pantry suggestion.
function viewEntries(ctx) {
  const { state, ui } = ctx;
  if (ui.recipesView === "have") {
    return suggest(RECIPES, state.pantry, state.adaptations).map((s) => ({ recipe: s.recipe, suggestion: s }));
  }
  if (ui.recipesView === "saved") {
    const adapted = RECIPES.filter((r) => !state.saved.includes(r.id) && isAdapted(r, state.adaptations[r.id]));
    return [...state.saved.map(getRecipe).filter(Boolean), ...adapted].map((recipe) => ({ recipe }));
  }
  return RECIPES.map((recipe) => ({ recipe }));
}

function results(ctx) {
  const all = viewEntries(ctx);
  return { all, shown: all.filter((e) => matchesQuery(e.recipe, ctx.ui.query)) };
}

const viewName = (ctx) => RECIPE_VIEWS.find(([id]) => id === ctx.ui.recipesView)[1];

export function resultsStatus(ctx) {
  const { all, shown } = results(ctx);
  if (!ctx.ui.query.trim()) return `${viewName(ctx)}: ${plural(all.length, "recipe")}`;
  return `${viewName(ctx)}: ${shown.length} of ${plural(all.length, "recipe")} match "${ctx.ui.query.trim()}"`;
}

export function resultsView(ctx) {
  const { state, ui } = ctx;
  const { all, shown } = results(ctx);
  const query = ui.query.trim();
  if (ui.recipesView === "have" && !markedCount(state)) {
    return html`
      <div class="results-empty">
        <p>Mark what you have and the recipes that use it show here, with what you'd still need.</p>
        <button class="btn btn--secondary btn--small" data-action="open-kitchen">Mark what you have</button>
      </div>`;
  }
  if (!all.length) {
    return ui.recipesView === "have"
      ? html`<div class="results-empty"><p class="results-empty-line">Dinner, off-script.</p>
          <p>None of these recipes use what you've marked yet. Mark a few more ingredients, or look through All recipes.</p></div>`
      : html`<div class="results-empty"><p>Nothing saved yet. Save a recipe from All recipes, or adapt one, and it shows here.</p></div>`;
  }
  if (!shown.length) {
    return html`<div class="results-empty"><p>No recipes in ${viewName(ctx)} match "${query}".</p>
      <p class="small muted">Check the spelling or try an ingredient${ui.recipesView === "all" ? "" : ", or search All recipes"}.</p></div>`;
  }
  return html`<ul class="rcards">${shown.map((e) => html`<li>${recipeCard(ctx, e.recipe, e.suggestion)}</li>`)}</ul>`;
}

function markedCount(state) {
  const inRecipe = (id) => Object.values(state.adaptations).some((a) => a.partial?.[id]);
  return pantryChipItems(RECIPES).filter((id) => state.pantry[id]?.status === "have" || inRecipe(id)).length;
}

// A compact way in to the hero demo recipe. Deliberately quieter than the collection.
function startCard(ctx) {
  const r = getRecipe(HERO_RECIPE_ID);
  const adapted = isAdapted(r, ctx.state.adaptations[r.id]);
  return html`
    <a class="start-card" href="#/recipe/${r.id}">
      <span class="eyebrow">${adapted ? "Pick up where you left off" : "Start here"} · Demo recipe</span>
      <span class="start-title">${r.title}</span>
      <span class="small muted">${adapted ? "Open your adapted version." : "Swap an ingredient and see what changes before you commit."}</span>
      <span class="start-arrow" aria-hidden="true">${icon("next")}</span>
    </a>`;
}

// What you have: one row until opened. The chips are shared presence, used by
// Use what you have and by every recipe.
function kitchenSection(ctx) {
  const { state } = ctx;
  const chips = pantryChipItems(RECIPES);
  // An item with a partial amount in some recipe shows as "some".
  const inRecipe = (id) => Object.values(state.adaptations).some((a) => a.partial?.[id]);
  const marked = markedCount(state);
  const open = ctx.ui.open.kitchen ?? false;
  return html`
    <details class="kitchen" id="kitchen" data-open-key="kitchen" ${open ? "open" : ""}>
      <summary>
        <h2 id="kitchen-h">What you have</h2>
        <span class="small muted">${marked ? `${plural(marked, "ingredient")} on hand · Edit` : "Nothing marked yet · Tap to add"}</span>
      </summary>
      <div class="kitchen-body">
      <p class="small muted kitchen-hint">Mark what you have today. Use what you have and every recipe read it, and nothing needs upkeep.</p>
      <div class="chips" role="group" aria-label="Ingredients you have">
        ${chips.map((id) => {
          const on = state.pantry[id]?.status === "have";
          const status = on ? "have" : inRecipe(id) ? "some" : "";
          return html`<button class="chip" aria-pressed="${on}" data-state="${status}" data-action="pantry-toggle" data-item="${id}">
            ${on ? icon("check") : ""}${capitalize(shortName(id))}${status === "some" ? html`<span class="visually-hidden">, some in a recipe</span><span aria-hidden="true" class="chip-some">some</span>` : ""}
          </button>`;
        })}
      </div>
      ${marked ? html`<button class="btn btn--quiet kitchen-clear" data-action="pantry-clear">Clear all</button>` : ""}
      </div>
    </details>`;
}

// Why a recipe is suggested, from the suggestion data only.
function reasons(s) {
  const fixes = s.missing.filter((m) => m.fix);
  const gaps = s.missing.filter((m) => !m.fix);
  const status = s.ready
    ? fixes.length ? `Ready with ${plural(fixes.length, "swap")}` : `You have all ${s.total} key ingredients`
    : `You have ${s.have} of ${s.total} key ingredients`;
  return html`
    <div class="rcard-reasons">
      <p class="suggest-status ${s.ready ? "is-ready" : ""}">${status}</p>
      ${fixes.map((m) => html`<p class="small">Supported swap: ${swapLabel(m)}</p>`)}
      ${gaps.length ? html`<p class="small muted">Still need: ${gaps.map((m) => shortName(m.item)).join(", ")}</p>` : ""}
    </div>`;
}

function swapLabel(m) {
  if (m.fix.omit) return `skip the ${shortName(m.item)}`;
  return `${m.fix.replace.with.map((w) => shortName(w.item)).join(" and ")} for ${shortName(m.item)}`;
}

function recipeCard(ctx, recipe, suggestion) {
  const a = ctx.state.adaptations[recipe.id];
  const adapted = isAdapted(recipe, a);
  const saved = ctx.state.saved.includes(recipe.id);
  const listed = ctx.state.list.synced[recipe.id] != null;
  return html`
    <article class="rcard">
      ${recipePhoto(recipe, "card")}
      <div class="rcard-body">
        <p class="eyebrow">${recipe.cuisine}</p>
        <h3 class="rcard-title"><a class="rcard-link" href="#/recipe/${recipe.id}">${recipe.title}</a></h3>
        <p class="muted small">${recipe.subtitle}</p>
        ${suggestion ? reasons(suggestion) : ""}
        <p class="rcard-meta">
          <span class="tag">${icon("clock")} ${recipe.minutes} min</span>
          ${adapted
            ? html`<span class="tag tag--yolk">Your version · ${plural(a.servings, "serving")}${a.applied.length ? ` · ${plural(a.applied.length, "change")}` : ""}</span>`
            : html`<span class="tag">${plural(recipe.servings, "serving")}</span>`}
          ${listed ? html`<span class="tag tag--cool">${icon("list")} On your list</span>` : ""}
        </p>
        <button class="btn btn--secondary btn--small rcard-save" data-action="${saved ? "unsave-recipe" : "save-recipe"}" data-id="${recipe.id}"
          aria-pressed="${saved}">
          ${icon(saved ? "bookmark-filled" : "bookmark")} ${saved ? "Saved" : "Save"}<span class="visually-hidden"> ${recipe.title}</span>
        </button>
      </div>
    </article>`;
}

function aboutSection() {
  return html`
    <section class="about" aria-labelledby="about-h">
      <h2 id="about-h" class="eyebrow">About this prototype</h2>
      <p class="small muted">
        The recipes and swaps are demo data written for this prototype, not tested sources.
        Nutrition figures are rough ranges from typical values, and swaps are not checked for allergy safety.
        Your changes are saved in this browser only.
      </p>
      <p class="small muted">Not built yet: importing recipes from links or video, accounts, live AI suggestions, onboarding.</p>
      <button class="btn btn--secondary btn--small" data-action="reset-demo">Reset demo</button>
    </section>`;
}

export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
