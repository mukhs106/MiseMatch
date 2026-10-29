// My Recipes: a way in to the demo recipe, optional "cook from what you have"
// suggestions, saved recipes, then the demo collection.

import { html, plural } from "./html.js";
import { icon, doodle } from "./icons.js";
import { RECIPES, getRecipe, HERO_RECIPE_ID } from "../data/recipes.js";
import { shortName } from "../data/items.js";
import { suggest, pantryChipItems } from "../core/suggest.js";
import { isAdapted } from "../core/adapt.js";

export function homeView(ctx) {
  const { state } = ctx;
  const saved = state.saved.map(getRecipe).filter(Boolean);
  const others = RECIPES.filter((r) => !state.saved.includes(r.id));
  return html`
    <div class="page home">
      <header class="home-intro">
        <h1 tabindex="-1" data-route-focus>My Recipes</h1>
        <p class="muted">Recipes that work with what you have and what you need.</p>
      </header>
      ${startCard(ctx)}
      ${kitchenSection(ctx)}
      <section class="home-section" aria-labelledby="saved-h">
        <div class="section-head">
          <h2 id="saved-h">Saved</h2>
          <span class="muted small">${plural(saved.length, "recipe")}</span>
        </div>
        ${saved.length
          ? html`<ul class="recipe-cards">${saved.map((r) => html`<li>${recipeCard(ctx, r)}</li>`)}</ul>`
          : html`<div class="empty">${doodle.pot}<p>Nothing saved yet. Save a recipe from the collection below and it'll live here.</p></div>`}
      </section>
      ${others.length ? html`
        <section class="home-section" aria-labelledby="demo-h">
          <div class="section-head">
            <h2 id="demo-h">Demo collection</h2>
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
        </section>` : ""}
      ${aboutSection()}
    </div>`;
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

function kitchenSection(ctx) {
  const { state } = ctx;
  const chips = pantryChipItems(RECIPES);
  // Chips show shared presence. An item with a partial amount in some recipe shows as "some".
  const inRecipe = (id) => Object.values(state.adaptations).some((a) => a.partial?.[id]);
  const marked = chips.filter((id) => state.pantry[id]?.status === "have" || inRecipe(id));
  const results = suggest(RECIPES, state.pantry, state.adaptations).slice(0, 3);
  // Optional: collapsed until used. Open state is remembered for the session.
  const open = ctx.ui.open.kitchen ?? marked.length > 0;
  return html`
    <details class="kitchen" data-open-key="kitchen" ${open ? "open" : ""}>
      <summary>
        <h2 id="kitchen-h">Cook from what you have</h2>
        <span class="small muted">${marked.length ? `${marked.length} on hand · see what you could make` : "Optional · tap what's in your kitchen"}</span>
      </summary>
      <div class="kitchen-body">
      <p class="small muted kitchen-hint">Mark what you have today. Suggestions and recipes both use it, and nothing needs upkeep.</p>
      <div class="chips" role="group" aria-label="Ingredients you have">
        ${chips.map((id) => {
          const on = state.pantry[id]?.status === "have";
          const status = on ? "have" : inRecipe(id) ? "some" : "";
          return html`<button class="chip" aria-pressed="${on}" data-state="${status}" data-action="pantry-toggle" data-item="${id}">
            ${on ? icon("check") : ""}${capitalize(shortName(id))}${status === "some" ? html`<span class="visually-hidden">, some in a recipe</span><span aria-hidden="true" class="chip-some">some</span>` : ""}
          </button>`;
        })}
      </div>
      ${marked.length ? html`<button class="btn btn--quiet kitchen-clear" data-action="pantry-clear">Clear all</button>` : ""}
      ${marked.length ? suggestions(results) : ""}
      </div>
    </details>`;
}

function suggestions(results) {
  if (!results.length) {
    return html`<p class="suggest-empty small">None of the recipes use these yet. Try marking a few more.</p>`;
  }
  return html`
    <div class="suggest">
      <h3 class="eyebrow">You could make</h3>
      <ol class="suggest-list">
        ${results.map((r) => {
          const fixes = r.missing.filter((m) => m.fix);
          const gaps = r.missing.filter((m) => !m.fix);
          return html`
            <li>
              <a class="suggest-item" href="#/recipe/${r.recipe.id}">
                <span class="suggest-title">${r.recipe.title}</span>
                <span class="suggest-status ${r.ready ? "is-ready" : ""}">
                  ${r.ready
                    ? fixes.length ? `Ready with ${plural(fixes.length, "swap")}` : "You have the key ingredients"
                    : `${r.have + fixes.length} of ${r.total} key ingredients${fixes.length ? `, using ${plural(fixes.length, "swap")}` : ""}`}
                </span>
                ${fixes.map((m) => html`<span class="small">Swap: ${swapLabel(m)}</span>`)}
                ${gaps.length ? html`<span class="small muted">Still need: ${gaps.map((m) => shortName(m.item)).join(", ")}</span>` : ""}
              </a>
            </li>`;
        })}
      </ol>
    </div>`;
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

function aboutSection() {
  return html`
    <section class="about" aria-labelledby="about-h">
      <h2 id="about-h" class="eyebrow">About this prototype</h2>
      <p class="small muted">
        The recipes and swaps are demo data written for this prototype, not tested sources.
        Nutrition figures are rough ranges from typical values, and swaps are not checked for allergy safety.
        Your changes are saved in this browser only.
      </p>
      <p class="small muted">Not built yet: importing from links or video, accounts, live AI suggestions, onboarding.</p>
      <button class="btn btn--secondary btn--small" data-action="reset-demo">Reset demo</button>
    </section>`;
}

export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
