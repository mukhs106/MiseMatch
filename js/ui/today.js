// Today: what you can cook now. Continue an unfinished adaptation, repeat a
// version that worked, or pick something that uses what you have, each with
// the reason it's suggested. Planning, shopping and importing stay reachable
// without taking over the screen.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { RECIPES, getRecipe, HERO_RECIPE_ID } from "../data/recipes.js";
import { getSwap } from "../data/swaps.js";
import { suggest } from "../core/suggest.js";
import { hasUnsavedChanges, isAdaptedSnapshot, repeatable, ruleLabels } from "../core/versions.js";
import { normalizeConstraints } from "../core/constraints.js";
import { recipeImage, constraintsSummary } from "./parts.js";
import { STEPS } from "./adapt.js";

export function todayView(ctx) {
  const { state } = ctx;
  const profile = normalizeConstraints(state.profile);
  const sessions = Object.values(state.sessions)
    .filter((s) => getRecipe(s.recipeId) && (hasUnsavedChanges(s, state.versions) || isAdaptedSnapshot(getRecipe(s.recipeId), s)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const again = repeatable(state.cooks, state.versions).slice(0, 3);
  const versions = Object.values(state.versions).sort((a, b) => b.updatedAt - a.updatedAt);
  const pantryCount = Object.keys(state.pantry).length;
  const ideas = suggest(RECIPES, state.pantry, profile).slice(0, 3);
  const openItems = state.list.lines.filter((l) => !l.checked).length;
  return html`
    <div class="page today">
      <header class="today-head">
        <h1 tabindex="-1" data-route-focus>What are we cooking?</h1>
        <p class="muted">Familiar dishes, fitted to your kitchen and your needs.</p>
      </header>

      ${sessions.length ? html`
        <section class="today-section" aria-labelledby="cont-h">
          <h2 id="cont-h" class="section-title">Pick up where you left off</h2>
          <ul class="row-list">${sessions.slice(0, 2).map((s) => continueRow(ctx, s))}</ul>
        </section>` : ""}

      ${!sessions.length && !versions.length ? startRow() : ""}

      ${again.length || versions.length ? html`
        <section class="today-section" aria-labelledby="again-h">
          <h2 id="again-h" class="section-title">Make it again</h2>
          <p class="small muted">Start from something you made or saved, then change only what's different today.</p>
          <ul class="row-list">
            ${again.length
              ? again.map((c) => (c.versionId && state.versions[c.versionId] ? againRow(ctx, state.versions[c.versionId], true) : againCookRow(c)))
              : versions.slice(0, 2).map((v) => againRow(ctx, v, false))}
          </ul>
        </section>` : ""}

      <section class="today-section" aria-labelledby="have-h">
        <div class="section-head">
          <h2 id="have-h" class="section-title">Cook from what you have</h2>
          <a class="btn btn--quiet" href="#/pantry">${pantryCount ? `Pantry: ${plural(pantryCount, "item")}` : "Add to pantry"}</a>
        </div>
        ${profile && constraintsSummary(profile) !== "No requirements set" ? html`<p class="small muted">Fits your requirements: ${constraintsSummary(profile)}. <a href="#/profile">Change</a></p>` : ""}
        ${!pantryCount ? html`<p class="small muted">Add a few ingredients to your pantry and these get more specific. Until then, they're the dishes with the fewest things to buy.</p>` : ""}
        <ul class="idea-cards">${ideas.map((r) => ideaCard(r))}</ul>
        <div class="today-links">
          <a class="btn btn--secondary" href="#/plan">${icon("list")} Plan a few meals</a>
          <a class="btn btn--quiet" href="#/recipes">All recipes</a>
        </div>
      </section>

      <section class="today-section today-quiet" aria-label="Shopping and importing">
        <a class="quiet-row" href="#/list">${icon("list")}<span>${openItems ? `${plural(openItems, "item")} on your shopping list` : "Your shopping list is empty"}</span>${icon("next")}</a>
        <a class="quiet-row" href="#/import">${icon("plus")}<span>Import a recipe as a draft</span>${icon("next")}</a>
      </section>
      <details class="more home-note" data-open-key="about-data">
        <summary class="small">About this content</summary>
        <p class="small muted">Recipes and adaptations are demo content written for this prototype and not yet kitchen-tested. Nutrition figures are rough estimates from fixture values. Everything you do stays on this device.</p>
      </details>
    </div>`;
}

// A way into the demo scenario until there's something of your own to continue.
// It opens a real preview: two servings, canned tomatoes chosen, fresh tomatoes marked missing for today.
function startRow() {
  const r = getRecipe(HERO_RECIPE_ID);
  return html`
    <section class="today-section" aria-labelledby="start-h">
      <h2 id="start-h" class="section-title">Start here</h2>
      <ul class="row-list"><li><button class="row-link row-link--button" data-action="start-scenario" data-id="${r.id}">
        ${recipeImage(r, { size: "thumb", credit: false })}
        <span class="row-text"><span class="row-title">${r.title} for 2, with no fresh tomatoes</span>
          <span class="small muted">Opens a preview with canned tomatoes chosen, to see what a swap changes. Nothing is saved.</span></span>${icon("next")}</button></li></ul>
    </section>`;
}

function continueRow(ctx, s) {
  const r = getRecipe(s.recipeId);
  const step = STEPS.find(([k]) => k === s.step)?.[1] ?? "Portions and needs";
  const changes = s.applied.map((id) => getSwap(id)?.label).filter(Boolean);
  return html`
    <li><a class="row-link" href="#/adapt/${r.id}/${s.step ?? "needs"}">
      ${recipeImage(r, { size: "thumb", credit: false })}
      <span class="row-text">
        <span class="row-title">${r.title}</span>
        <span class="small muted">${plural(s.servings, "serving")}${changes.length ? ` · ${changes.join(", ")}` : ""}</span>
        <span class="small">Next: ${step}${hasUnsavedChanges(s, ctx.state.versions) ? " · not saved" : ""}</span>
      </span>${icon("next")}</a></li>`;
}

function againRow(ctx, v, liked) {
  const r = getRecipe(v.recipeId);
  return html`
    <li class="row-split">
      <div class="row-link row-link--static">
        ${recipeImage(r, { size: "thumb", credit: false })}
        <span class="row-text">
          <span class="row-title">${v.name}</span>
          <span class="small muted">${r.title} · ${plural(v.servings, "serving")}${liked ? " · you'd make it again" : ""}</span>
        </span>
      </div>
      <button class="btn btn--secondary btn--small" data-action="start-adapt" data-id="${r.id}" data-from="${v.id}" aria-label="Make ${v.name} again">Make again</button>
    </li>`;
}

// A meal you'd make again that was never saved keeps a real way back: its own record.
function againCookRow(c) {
  const r = getRecipe(c.recipeId);
  const labels = ruleLabels(c);
  return html`
    <li class="row-split">
      <div class="row-link row-link--static">
        ${recipeImage(r, { size: "thumb", credit: false })}
        <span class="row-text">
          <span class="row-title">${r.title}</span>
          <span class="small muted">${plural(c.servings, "serving")}${labels.length ? ` · ${labels.join(", ")}` : " · as written"} · you'd make it again</span>
        </span>
      </div>
      <button class="btn btn--secondary btn--small" data-action="repeat-cook" data-cook="${c.id}" aria-label="Make ${r.title} again, ${plural(c.servings, "serving")}">Make again</button>
    </li>`;
}

function ideaCard(s) {
  const r = s.recipe;
  return html`
    <li><a class="idea-card" href="#/recipe/${r.id}">
      ${recipeImage(r, { size: "card", credit: false })}
      <span class="idea-body">
        <span class="idea-title">${r.title}</span>
        <span class="small muted">${r.minutes} min · ${r.cuisine}</span>
        <ul class="reasons small">${s.reasons.map((x) => html`<li>${x}</li>`)}</ul>
      </span></a></li>`;
}
