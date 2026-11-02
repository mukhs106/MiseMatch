// Recipes: the supported collection. Search by dish or ingredient (including
// regional names), filter to what fits your requirements, and start adapting.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { RECIPES } from "../data/recipes.js";
import { candidates } from "../core/engine.js";
import { normalizeConstraints, hasFilterCriteria } from "../core/constraints.js";
import { searchIngredients } from "../core/search.js";
import { swapsForRecipe } from "../data/swaps.js";
import { recipeImage, constraintsSummary } from "./parts.js";

// One ingredient search everywhere: the same aliases and plurals as the pantry.
function matches(recipe, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if ([recipe.title, recipe.subtitle, recipe.cuisine].some((w) => w.toLowerCase().includes(q))) return true;
  const hits = searchIngredients(q, { limit: 50, shoppable: false }).map((h) => h.id);
  const items = new Set([...recipe.ingredients.map((i) => i.item), ...swapsForRecipe(recipe.id).flatMap((s) => [...(s.replace?.with ?? []), ...(s.add ?? [])].map((w) => w.item))]);
  return hits.some((id) => items.has(id));
}


function fitLabel({ g, fits, pending, goals }) {
  if (!fits) return pending ? "Needs an answer" : "No supported version fits";
  const top = g.eligible[0];
  if (!goals.length) return top.kind === "original" ? "Fits as written" : "Fits with changes";
  return { meets: top.kind === "original" ? "Reaches your goal as written" : "Reaches your goal with changes", maybe: "May reach your goal", unknown: "Can't estimate your goal", misses: "Below your goal" }[top.targetStatus];
}

export function recipesView(ctx) {
  const { state, ui } = ctx;
  const profile = normalizeConstraints(state.profile);
  // Hard exclusions and time limits decide what "fits". Nutrition goals rank and label, they never hide a dish.
  const filters = hasFilterCriteria(profile);
  const goals = Object.entries(profile.targets).filter(([, v]) => v != null).map(([n]) => n);
  const evaluateFit = filters || goals.length > 0;
  const fit = (r) => candidates(r, r.servings, profile, state.pantry);
  let list = RECIPES.filter((r) => matches(r, ui.query));
  if (ui.filter === "saved") list = list.filter((r) => state.saved.includes(r.id) || Object.values(state.versions).some((v) => v.recipeId === r.id));
  const rows = list.map((r) => {
    const g = evaluateFit ? fit(r) : null;
    return { r, g, fits: !g || g.eligible.length > 0, pending: g && !g.eligible.length && g.needsAnswer.length > 0 };
  });
  const shown = ui.filter === "fits" ? rows.filter((x) => x.fits) : rows;
  return html`
    <div class="page recipes-page">
      <header class="list-head">
        <h1 tabindex="-1" data-route-focus>Recipes</h1>
        <p class="muted">Blend the rules.</p>
      </header>
      <div class="recipe-tools">
        <label class="field search-field">
          <span class="visually-hidden">Search recipes or ingredients</span>
          ${icon("search")}
          <input class="input" type="search" data-action="recipe-search" value="${ui.query}" placeholder="Search a dish or ingredient, e.g. chana or palak" autocomplete="off">
        </label>
        <div class="chips" role="group" aria-label="Filter recipes">
          ${[["all", "All"], ["fits", filters ? "Fits my requirements" : "Fits my requirements (none set)"], ["saved", "Saved or adapted"]].map(([v, l]) => html`
            <button class="chip" aria-pressed="${ui.filter === v}" data-action="set-filter" data-value="${v}">${ui.filter === v ? icon("check") : ""}${l}</button>`)}
        </div>
      </div>
      ${ui.filter === "fits" ? html`<p class="small muted">${filters ? `Checks hard requirements and your time limit: ${constraintsSummary({ ...profile, targets: {} })}.` : "No requirements are set, so every dish is shown."}${goals.length ? " Nutrition goals are labelled but don't hide a dish." : ""}</p>` : ""}
      ${shown.length ? html`
        <ul class="recipe-rows">${shown.map(({ r, g, fits, pending }) => html`
          <li><a class="recipe-row" href="#/recipe/${r.id}">
            ${recipeImage(r, { size: "thumb", credit: false })}
            <span class="row-text">
              <span class="row-title">${r.title}</span>
              <span class="small muted">${r.subtitle}</span>
              <span class="small meta-line">${r.minutes} min · makes ${r.servings}
                ${g ? html` · <span class="${fits ? "" : "warn-inline"}">${fitLabel({ g, fits, pending, goals })}</span>` : ""}
                ${Object.values(state.versions).some((v) => v.recipeId === r.id) ? html` · <span>Your versions</span>` : ""}</span>
            </span>${icon("next")}</a></li>`)}
        </ul>` : html`
        <div class="empty">
          <p>${ui.query.trim() ? `No recipes match “${ui.query.trim()}”. Try an ingredient, like chickpeas, or a regional name, like palak.` : "Nothing here yet."}</p>
          ${ui.query.trim() ? html`<button class="btn btn--secondary" data-action="clear-search">Clear search</button>` : ""}
        </div>`}
      <p class="small muted home-note"><a href="#/import">Import a recipe</a> to keep one of your own as a draft.</p>
      <details class="more home-note" data-open-key="about-collection">
        <summary class="small">About this collection</summary>
        <p class="small muted">A starting collection of ${RECIPES.length} Indian and South Asian home-style dishes, written for this prototype and not kitchen-tested. It isn't a claim of complete regional coverage.</p>
      </details>
    </div>`;
}
