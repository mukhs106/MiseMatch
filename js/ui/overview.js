// Recipe overview: the source recipe as written, with its attribution, a clear
// way into adapting it, cooking it as written, and your saved versions of it.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { ITEMS } from "../data/items.js";
import { getSwap, swapsForRecipe } from "../data/swaps.js";
import { formatQty } from "../core/units.js";
import { deriveRecipe, defaultAdaptation, servingDescription, servingsBounds } from "../core/adapt.js";
import { hasUnsavedChanges, isAdaptedSnapshot, lineage, ruleLabels } from "../core/versions.js";
import { recipeImage, timeText } from "./parts.js";
import { timingFor } from "../core/engine.js";

const GROUPS = [["main", "Main ingredients"], ["serve", "To serve"], ["spices", "Spices and seasonings"], ["staples", "Staples"]];

export function overviewView(ctx, recipe) {
  const { state } = ctx;
  const saved = state.saved.includes(recipe.id);
  const session = ctx.session(recipe.id);
  const active = session && (hasUnsavedChanges(session, state.versions) || isAdaptedSnapshot(recipe, session));
  const versions = Object.values(state.versions).filter((v) => v.recipeId === recipe.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const d = deriveRecipe(recipe, defaultAdaptation(recipe));
  const ruleCount = swapsForRecipe(recipe.id).length;
  return html`
    <div class="page page--wide overview">
      <a class="back-link" href="#/recipes">${icon("back")} Recipes</a>
      <div class="overview-top">
        ${recipeImage(recipe, { size: "hero" })}
        <header class="overview-head">
          <p class="eyebrow">${recipe.cuisine}</p>
          <h1 tabindex="-1" data-route-focus>${recipe.title}</h1>
          <p class="recipe-sub">${recipe.subtitle}</p>
          <p class="meta-line small">${timeText(timingFor(recipe, []))} · makes ${plural(recipe.servings, "serving")} · written for ${servingsBounds(recipe).join(" to ")} servings</p>
          <p class="recipe-blurb">${recipe.blurb}</p>
          <div class="cta-stack">
            ${active
              ? html`<a class="btn btn--primary" href="#/adapt/${recipe.id}/${session.step ?? "needs"}">Continue adapting</a>`
              : html`<button class="btn btn--primary" data-action="start-adapt" data-id="${recipe.id}">Adapt this dish</button>`}
            <a class="btn btn--secondary" href="#/cook/${recipe.id}/original">Cook as written</a>
            <button class="btn btn--quiet" data-action="${saved ? "unsave-recipe" : "save-recipe"}" data-id="${recipe.id}" aria-pressed="${saved}">
              ${icon(saved ? "bookmark-filled" : "bookmark")} ${saved ? "Bookmarked" : "Bookmark"}</button>
          </div>
          <p class="small muted">${ruleCount ? `${plural(ruleCount, "supported change")} for portions, missing ingredients, diets and goals.` : "Portions can be adjusted; no ingredient changes are written for this dish yet."}</p>
          ${active ? html`<p class="small">You have an adaptation in progress${hasUnsavedChanges(session, state.versions) ? " with unsaved changes" : ""}: ${plural(session.servings, "serving")}${session.applied.length ? `, ${session.applied.map((id) => getSwap(id)?.label).join(", ")}` : ""}. <button class="btn btn--quiet" data-action="session-discard" data-id="${recipe.id}">Discard</button></p>` : ""}
        </header>
      </div>

      ${versions.length ? html`
        <section class="overview-section" aria-labelledby="yv-h">
          <h2 id="yv-h">Your versions</h2>
          <ul class="row-list">${versions.map((v) => html`
            <li class="row-split">
              <div class="row-text">
                <span class="row-title">${v.name}</span>
                <span class="small muted">${plural(v.servings, "serving")} · ${v.applied.length ? ruleLabels(v).join(", ") : "no ingredient changes"}</span>
                <span class="small muted">${lineage(v, state.versions)}</span>
              </div>
              <div class="row-actions">
                <button class="btn btn--secondary btn--small" data-action="start-adapt" data-id="${recipe.id}" data-from="${v.id}" aria-label="Make ${v.name} again">Make again</button>
                <a class="btn btn--quiet" href="#/cook/${recipe.id}/v/${v.id}" aria-label="Cook ${v.name}">Cook</a>
              </div>
            </li>`)}</ul>
        </section>` : ""}

      <section class="overview-section source" aria-labelledby="src-h">
        <div class="section-head"><h2 id="src-h">The original</h2><span class="small muted">for ${recipe.servings}</span></div>
        <p class="small muted">${recipe.source.label}. ${recipe.source.detail} One serving: ${servingDescription(d)}.</p>
        <div class="recipe-grid">
          <div>
            ${GROUPS.map(([g, label]) => {
              const lines = d.ingredients.filter((l) => l.group === g);
              if (!lines.length) return "";
              return html`<h3 class="group-label eyebrow">${label}</h3>
                <ul class="ing-list ing-list--plain">${lines.flatMap((l) => l.entries.map((e) => html`
                  <li class="ing"><span class="qty num">${formatQty(e.qty, e.unit, e.step)}</span>
                  <span class="ing-name">${ITEMS[e.item].name}${e.prep ? html`<span class="prep">, ${e.prep}</span>` : ""}${l.original?.optional ? html` <span class="muted small">(optional)</span>` : ""}</span></li>`))}</ul>`;
            })}
          </div>
          <div>
            <h3 class="group-label eyebrow">Method</h3>
            <ol class="steps">${d.steps.map((s) => html`<li class="step"><p>${s.text}</p></li>`)}</ol>
          </div>
        </div>
      </section>
    </div>`;
}
