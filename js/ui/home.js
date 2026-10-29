// Recipes: search scoped to the demo collection, All recipes / Use what you have /
// Saved, a one-line pantry summary, a slim way in to the demo recipe, then cards.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { recipePhoto, supportingImage } from "./photo.js";
import { RECIPES, getRecipe, HERO_RECIPE_ID } from "../data/recipes.js";
import { shortName } from "../data/items.js";
import { suggest } from "../core/suggest.js";
import { matchesQuery } from "../core/search.js";
import { isAdapted } from "../core/adapt.js";

export const MODES = [
  ["all", "All recipes"],
  ["have", "Use what you have"],
  ["saved", "Saved"],
];

export function homeView(ctx) {
  const { state, ui } = ctx;
  // One line of wordplay per screen: "Dinner, off-script." takes the slot when
  // Use what you have has nothing to show (with or without a search).
  const offScript = ui.mode === "have" && !viewEntries(ctx).length;
  return html`
    <div class="page page--wide home">
      <header class="home-intro">
        <div class="home-intro-text">
          <h1 tabindex="-1" data-route-focus>Recipes</h1>
          ${offScript ? "" : html`<p class="muted">Blend the rules.</p>`}
        </div>
        ${supportingImage("thali-cutout", { width: 1440, height: 1400, sizes: "(min-width: 720px) 200px, 112px", className: "home-brand" })}
      </header>
      <div class="recipe-tools">
        <label class="field search-field">
          <span class="field-label">Search our collection (${plural(RECIPES.length, "demo recipe")})</span>
          <span class="search-box">
            ${icon("search")}
            <input class="input" type="search" data-action="recipe-search" value="${ui.query}" autocomplete="off" spellcheck="false" aria-describedby="search-hint">
          </span>
          <span id="search-hint" class="small muted">Names, ingredients and cuisine, in the view below.</span>
        </label>
        <div class="view-toggle mode-toggle" role="group" aria-label="Which recipes to show">
          ${MODES.map(([id, label]) => html`
            <button class="view-btn" aria-pressed="${ui.mode === id}" data-action="set-mode" data-mode="${id}">${label}</button>`)}
        </div>
      </div>
      ${pantryRow(state)}
      <section class="discover" aria-labelledby="results-status">
        <p id="results-status" class="small muted" role="status">${resultsStatus(ctx)}</p>
        <div id="recipe-results">${resultsView(ctx)}</div>
      </section>
      <p class="small muted home-note">Recipes, swaps and nutrition figures are demo data. Settings and Reset demo are in Profile and settings.</p>
    </div>`;
}

// The recipes in the current view, before search. Use what you have entries carry their suggestion.
function viewEntries(ctx) {
  const { state, ui } = ctx;
  if (ui.mode === "have") return suggest(RECIPES, state.pantry).map((s) => ({ recipe: s.recipe, suggestion: s }));
  if (ui.mode === "saved") {
    const adapted = RECIPES.filter((r) => !state.saved.includes(r.id) && isAdapted(r, state.adaptations[r.id]));
    return [...state.saved.map(getRecipe).filter(Boolean), ...adapted].map((recipe) => ({ recipe }));
  }
  return RECIPES.map((recipe) => ({ recipe }));
}

const modeName = (ctx) => MODES.find(([id]) => id === ctx.ui.mode)[1];

export function resultsStatus(ctx) {
  const all = viewEntries(ctx);
  const q = ctx.ui.query.trim();
  if (!q) return `${modeName(ctx)}: ${plural(all.length, "recipe")}`;
  const shown = all.filter((e) => matchesQuery(e.recipe, q));
  return `${modeName(ctx)}: ${shown.length} of ${plural(all.length, "recipe")} match “${q}”`;
}

export function resultsView(ctx) {
  const { state, ui } = ctx;
  const all = viewEntries(ctx);
  const q = ui.query.trim();
  if (!all.length) {
    if (ui.mode === "have") {
      return html`
        <div class="empty">
          <p class="empty-lead">Dinner, off-script.</p>
          <p>${Object.keys(state.pantry).length
            ? "None of the recipes use what's in your pantry yet. Add a few more ingredients, or browse all recipes."
            : "Add what's in your kitchen to your pantry, and recipes that use it will show here."}</p>
          <a class="btn btn--secondary" href="#/pantry">Go to Pantry</a>
        </div>`;
    }
    return html`<div class="empty"><p>Nothing saved yet. Save a recipe from All recipes, or adapt one, and it shows here.</p></div>`;
  }
  const shown = all.filter((e) => matchesQuery(e.recipe, q));
  if (!shown.length) {
    return html`
      <div class="empty">
        <p>No recipes in ${modeName(ctx)} match “${q}”. Try an ingredient, like chickpeas or paneer${ui.mode === "all" ? "" : ", or search All recipes"}.</p>
        <button class="btn btn--secondary" data-action="clear-search">Clear search</button>
      </div>`;
  }
  return html`
    ${ui.mode === "all" && !q ? startRow(ctx) : ""}
    <ul class="rcards">${shown.map((e) => html`<li>${recipeCard(ctx, e.recipe, e.suggestion)}</li>`)}</ul>`;
}

function pantryRow(state) {
  const n = Object.keys(state.pantry).length;
  return html`
    <div class="pantry-row">
      ${icon("jar")}
      <span>${n ? `${plural(n, "ingredient")} in your pantry` : "Your pantry is empty"}</span>
      <a class="btn btn--quiet" href="#/pantry">${n ? "Edit" : "Add ingredients"}</a>
    </div>`;
}

// A slim way in to the hero demo recipe.
function startRow(ctx) {
  const r = getRecipe(HERO_RECIPE_ID);
  const adapted = isAdapted(r, ctx.state.adaptations[r.id]);
  return html`
    <a class="start-row" href="#/recipe/${r.id}">
      <span class="eyebrow">${adapted ? "Pick up where you left off" : "Start here"}</span>
      <span class="start-title">${r.title}</span>
      <span class="start-arrow" aria-hidden="true">${icon("next")}</span>
    </a>`;
}

const STATUS = ["Can make now", "One swap away"];

// Why a recipe is suggested, from the suggestion data only.
function reasons(s) {
  const fixes = s.missing.filter((m) => m.fix);
  const gaps = s.missing.filter((m) => !m.fix);
  return html`
    <div class="rcard-reasons">
      ${STATUS[s.rank] ? html`<p class="suggest-status ${s.rank === 0 ? "is-ready" : ""}">${STATUS[s.rank]}</p>` : ""}
      <p class="small">${s.have === s.total ? `You have all ${s.total} key ingredients.` : `You have ${s.have} of ${s.total} key ingredients.`}</p>
      ${fixes.map((m) => html`<p class="small">Supported swap: ${swapLabel(m)}.</p>`)}
      ${gaps.length ? html`<p class="small muted">Still need ${gaps.map((m) => shortName(m.item)).join(", ")}.</p>` : ""}
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
        <button class="btn btn--secondary btn--small rcard-save" data-action="${saved ? "unsave-recipe" : "save-recipe"}" data-id="${recipe.id}" aria-pressed="${saved}">
          ${icon(saved ? "bookmark-filled" : "bookmark")} ${saved ? "Saved" : "Save"}<span class="visually-hidden"> ${recipe.title}</span>
        </button>
      </div>
    </article>`;
}

export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
