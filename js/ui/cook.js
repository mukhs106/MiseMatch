// Cook mode: the exact version and serving count, ingredients to tick off and
// steps in order. Cooking an unsaved session doesn't save anything to the
// collection; the cooking record keeps the exact rules and servings used.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { ITEMS } from "../data/items.js";
import { getSwap } from "../data/swaps.js";
import { getRecipe } from "../data/recipes.js";
import { formatQty } from "../core/units.js";
import { deriveRecipe } from "../core/adapt.js";
import { hasUnsavedChanges } from "../core/versions.js";
import { validateDraft } from "../core/normalize.js";

export function cookView(ctx, route) {
  if (route.draft) return draftCook(ctx, ctx.state.drafts[route.draft]);
  const recipe = getRecipe(route.id);
  let snap;
  let label;
  let back = `#/recipe/${recipe.id}`;
  if (route.kind === "original") {
    snap = { servings: recipe.servings, applied: [] };
    label = "As written";
  } else if (route.kind === "version") {
    const v = ctx.state.versions[route.vid];
    snap = v;
    label = v.name;
  } else {
    snap = ctx.working(recipe.id);
    const base = snap.baseVersion ? ctx.state.versions[snap.baseVersion] : null;
    label = hasUnsavedChanges(snap, ctx.state.versions) ? "Your unsaved version" : base ? base.name : "As written";
    back = `#/adapt/${recipe.id}/${snap.step ?? "compare"}`;
  }
  const d = deriveRecipe(recipe, snap);
  const checks = ctx.ui.cookChecks;
  const unsaved = route.kind === "session" && hasUnsavedChanges(snap, ctx.state.versions);
  return html`
    <div class="page cook-page">
      <a class="back-link" href="${back}">${icon("back")} Back</a>
      <header class="cook-head">
        <p class="eyebrow">Cooking</p>
        <h1 tabindex="-1" data-route-focus>${recipe.title}</h1>
        <p class="meta-line">${label} · ${plural(snap.servings, "serving")}</p>
        ${snap.applied.length ? html`<p class="small muted">${snap.applied.map((id) => getSwap(id)?.label).join(" · ")}</p>` : ""}
        ${unsaved ? html`<p class="small">This won't be saved to your collection. Your changes stay in your working session.</p>` : ""}
      </header>
      <div class="recipe-grid">
        <section aria-labelledby="ck-ing">
          <h2 id="ck-ing">Ingredients</h2>
          <ul class="cook-list">${d.ingredients.flatMap((l) => l.entries.map((e) => {
            const key = `i:${l.slot}:${e.item}`;
            return html`<li><label class="check-row"><input type="checkbox" ${checks[key] ? "checked" : ""} data-action="cook-check" data-key="${key}">
              <span><span class="qty num">${formatQty(e.qty, e.unit, e.step)}</span> ${ITEMS[e.item].name}${e.prep ? html`<span class="prep">, ${e.prep}</span>` : ""}
              ${l.scaling === "taste" && snap.servings !== recipe.servings ? html` <span class="taste">to taste</span>` : ""}${l.changedBy.length ? html` <span class="changed-by">${l.addedBy ? "added" : "changed"}</span>` : ""}</span></label></li>`;
          }))}</ul>
        </section>
        <section aria-labelledby="ck-steps">
          <h2 id="ck-steps">Method</h2>
          <ol class="cook-steps">${d.steps.map((s, i) => {
            const key = `s:${s.id}`;
            return html`<li class="${checks[key] ? "is-done" : ""}"><label class="check-row"><input type="checkbox" ${checks[key] ? "checked" : ""} data-action="cook-check" data-key="${key}">
              <span><span class="step-num">${i + 1}</span> ${s.text}${s.changedBy.length ? html` <span class="changed-by">${s.added ? "added" : "changed"}</span>` : ""}</span></label></li>`;
          })}</ol>
        </section>
      </div>
      <div class="action-bar">
        <a class="btn btn--quiet" href="${back}">Not now</a>
        <button class="btn btn--primary" data-action="finish-cooking" data-id="${recipe.id}" data-kind="${route.kind}" data-vid="${route.vid ?? ""}">I cooked this</button>
      </div>
    </div>`;
}

function draftCook(ctx, draft) {
  const v = validateDraft(draft, "cook");
  return html`
    <div class="page cook-page">
      <a class="back-link" href="#/draft/${draft.id}">${icon("back")} Back to draft</a>
      <header class="cook-head">
        <p class="eyebrow">Cooking an imported recipe</p>
        <h1 tabindex="-1" data-route-focus>${draft.title}</h1>
        <p class="meta-line">${draft.servings ? plural(draft.servings, "serving") : "Servings not stated"}${draft.source.creator ? ` · by ${draft.source.creator}` : ""}</p>
        <p class="small muted">Shown as imported. Quantities that weren't given are left blank, not guessed.</p>
      </header>
      <div class="recipe-grid">
        <section aria-labelledby="ck-ing"><h2 id="ck-ing">Ingredients</h2>
          <ul class="cook-list">${draft.lines.filter((l) => !l.omitted).map((l) => html`<li><span>${l.raw}</span></li>`)}</ul></section>
        <section aria-labelledby="ck-steps"><h2 id="ck-steps">Method</h2>
          ${v.ok ? html`<ol class="cook-steps">${draft.steps.map((s, i) => html`<li><span class="step-num">${i + 1}</span> ${s}</li>`)}</ol>` : html`<p class="warn">${v.blocking.map((b) => b.text).join(" ")}</p>`}</section>
      </div>
    </div>`;
}
