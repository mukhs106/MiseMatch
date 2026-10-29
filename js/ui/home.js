// Recipes: search, All recipes / Use what you have, a one-line pantry summary,
// a slim way in to the demo recipe, then saved recipes and the rest of the collection.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { RECIPES, getRecipe, HERO_RECIPE_ID } from "../data/recipes.js";
import { ITEMS, shortName } from "../data/items.js";
import { suggest } from "../core/suggest.js";
import { isAdapted } from "../core/adapt.js";

/** Matches a recipe by name, description, cuisine or any ingredient name. */
function matches(recipe, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const words = [recipe.title, recipe.subtitle, recipe.cuisine, ...recipe.ingredients.map((i) => ITEMS[i.item]?.name ?? "")];
  return words.some((w) => w.toLowerCase().includes(q));
}

export function homeView(ctx) {
  const { state, ui } = ctx;
  const query = ui.query;
  const haveMode = ui.mode === "have";
  const results = haveMode ? suggest(RECIPES, state.pantry).filter((r) => matches(r.recipe, query)) : null;
  // One line of wordplay per screen: the empty "Use what you have" state takes the slot.
  const offScript = haveMode && !results.length;
  return html`
    <div class="page home">
      <header class="home-intro">
        <h1 tabindex="-1" data-route-focus>Recipes</h1>
        ${offScript ? "" : html`<p class="muted">Blend the rules.</p>`}
      </header>
      <div class="recipe-tools">
        <label class="field search-field">
          <span class="visually-hidden">Search recipes or ingredients</span>
          ${icon("search")}
          <input class="input" type="search" data-action="recipe-search" value="${query}" placeholder="Search recipes or ingredients" autocomplete="off">
        </label>
        <div class="view-toggle mode-toggle" role="group" aria-label="Which recipes to show">
          <button class="view-btn" aria-pressed="${!haveMode}" data-action="set-mode" data-mode="all">All recipes</button>
          <button class="view-btn" aria-pressed="${haveMode}" data-action="set-mode" data-mode="have">Use what you have</button>
        </div>
      </div>
      ${pantryRow(state)}
      ${haveMode ? useWhatYouHave(results, query, state) : allRecipes(ctx, query)}
      <p class="small muted home-note">Recipes, swaps and nutrition figures are demo data. Settings and Reset demo are in Profile and settings.</p>
    </div>`;
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

function allRecipes(ctx, query) {
  const { state } = ctx;
  const saved = state.saved.map(getRecipe).filter(Boolean).filter((r) => matches(r, query));
  const others = RECIPES.filter((r) => !state.saved.includes(r.id) && matches(r, query));
  if (!saved.length && !others.length) {
    return html`
      <div class="empty">
        <p>No recipes match “${query.trim()}”. Try an ingredient, like chickpeas or paneer.</p>
        <button class="btn btn--secondary" data-action="clear-search">Clear search</button>
      </div>`;
  }
  return html`
    ${query.trim() ? "" : startRow(ctx)}
    ${saved.length ? html`
      <section class="home-section" aria-labelledby="saved-h">
        <div class="section-head">
          <h2 id="saved-h">Saved</h2>
          <span class="muted small">${plural(saved.length, "recipe")}</span>
        </div>
        <ul class="recipe-cards">${saved.map((r) => html`<li>${recipeCard(ctx, r)}</li>`)}</ul>
      </section>` : ""}
    ${others.length ? html`
      <section class="home-section" aria-labelledby="more-h">
        <div class="section-head">
          <h2 id="more-h">${saved.length ? "More recipes" : "Recipes"}</h2>
          <span class="tag tag--demo">Demo data</span>
        </div>
        <ul class="collection">
          ${others.map((r) => html`
            <li class="collection-row">
              <a href="#/recipe/${r.id}">
                <span class="collection-title">${r.title}</span>
                <span class="muted small">${r.subtitle} · ${r.minutes} min</span>
              </a>
              <button class="btn btn--secondary btn--small" data-action="save-recipe" data-id="${r.id}" aria-label="Save ${r.title}">
                ${icon("bookmark")} Save
              </button>
            </li>`)}
        </ul>
      </section>` : ""}`;
}

const STATUS = ["Can make now", "One swap away"];

function useWhatYouHave(results, query, state) {
  if (!results.length) {
    const empty = !Object.keys(state.pantry).length;
    return html`
      <div class="empty">
        <p class="empty-lead">Dinner, off-script.</p>
        <p>${empty
          ? "Add what's in your kitchen to your pantry, and recipes that use it will show here."
          : query.trim()
            ? `Nothing you can make matches “${query.trim()}”. Clear the search, or add more to your pantry.`
            : "None of the recipes use what's in your pantry yet. Add a few more ingredients, or browse all recipes."}</p>
        <a class="btn btn--secondary" href="#/pantry">Go to Pantry</a>
      </div>`;
  }
  return html`
    <ol class="suggest-list" aria-label="Recipes you can make, best match first">
      ${results.map((r) => html`
        <li>
          <a class="suggest-item" href="#/recipe/${r.recipe.id}">
            <span class="suggest-status ${r.rank === 0 ? "is-ready" : ""}">${STATUS[r.rank] ?? `${r.have} of ${r.total} key ingredients`}</span>
            <span class="suggest-title">${r.recipe.title}</span>
            <span class="small">${reason(r)}</span>
          </a>
        </li>`)}
    </ol>`;
}

/** One short reason per card. */
function reason(r) {
  if (r.rank === 0) return "You have the key ingredients.";
  const fixes = r.missing.filter((m) => m.fix);
  const gaps = r.missing.filter((m) => !m.fix);
  if (!gaps.length) return `Swap: ${fixes.map(swapLabel).join("; ")}.`;
  return `Still need ${gaps.map((m) => shortName(m.item)).join(", ")}.`;
}

function swapLabel(m) {
  if (m.fix.omit) return `skip the ${shortName(m.item)}`;
  return `${m.fix.replace.with.map((w) => shortName(w.item)).join(" and ")} for ${shortName(m.item)}`;
}

function recipeCard(ctx, recipe) {
  const a = ctx.state.adaptations[recipe.id];
  const adapted = isAdapted(recipe, a);
  const listed = ctx.state.list.synced[recipe.id] != null;
  return html`
    <a class="card recipe-card" href="#/recipe/${recipe.id}">
      <span class="eyebrow">${recipe.cuisine}</span>
      <span class="recipe-card-title">${recipe.title}</span>
      <span class="muted small">${recipe.subtitle}</span>
      <span class="recipe-card-meta">
        <span class="tag">${icon("clock")} ${recipe.minutes} min</span>
        ${adapted
          ? html`<span class="tag tag--yolk">Your version · ${plural(a.servings, "serving")}${a.applied.length ? ` · ${plural(a.applied.length, "change")}` : ""}</span>`
          : html`<span class="tag">${plural(recipe.servings, "serving")}</span>`}
        ${listed ? html`<span class="tag tag--cool">${icon("list")} On your list</span>` : ""}
      </span>
    </a>`;
}

export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
