// Plan a few meals around ingredients you want to use. Each suggestion is the
// best supported version under your requirements; planned meals share the
// pantry, counted once, and the shopping list is the consolidated shortfall.

import { html, plural } from "./html.js";
import { icon, checkNote } from "./icons.js";
import { RECIPES, getRecipe } from "../data/recipes.js";
import { ITEMS, shortName } from "../data/items.js";
import { getSwap } from "../data/swaps.js";
import { formatQty } from "../core/units.js";
import { suggest, pantryChipItems } from "../core/suggest.js";
import { normalizeConstraints } from "../core/constraints.js";
import { deriveRecipe } from "../core/adapt.js";
import { constraintsSummary, capitalize } from "./parts.js";

export function planView(ctx) {
  const { state, ui } = ctx;
  const profile = normalizeConstraints(state.profile);
  const inPantry = Object.keys(state.pantry).filter((k) => ITEMS[k]?.key);
  const chips = inPantry.length ? inPantry : pantryChipItems(RECIPES).slice(0, 10);
  const ideas = ui.focus.length ? suggest(RECIPES, state.pantry, profile, { focus: ui.focus, servings: 2 }) : [];
  return html`
    <div class="page plan-page">
      <a class="back-link" href="#/">${icon("back")} Today</a>
      <header class="list-head">
        <h1 tabindex="-1" data-route-focus>Plan a few meals</h1>
        <p class="muted">Choose ingredients you want to use up. We'll find supported dishes that use them and total what to buy.</p>
      </header>

      <section class="adapt-section" aria-labelledby="use-h">
        <h2 id="use-h">Use up</h2>
        ${!inPantry.length ? html`<p class="small muted">Your pantry is empty, so these are common ingredients from the recipes. <a href="#/pantry">Add yours</a> for better matches.</p>` : ""}
        <div class="chips" role="group" aria-labelledby="use-h">
          ${chips.map((id) => html`<button class="chip" aria-pressed="${ui.focus.includes(id)}" data-action="plan-focus" data-item="${id}">${ui.focus.includes(id) ? icon("check") : ""}${capitalize(shortName(id))}</button>`)}
        </div>
        <p class="small muted">Requirements: ${constraintsSummary(profile)}. <a href="#/profile">Change</a></p>
      </section>

      ${ui.focus.length ? html`
        <section class="adapt-section" aria-labelledby="sug-h">
          <h2 id="sug-h">Dishes that use them</h2>
          ${ideas.length ? html`<ul class="plan-ideas">${ideas.slice(0, 5).map((s) => html`
            <li class="plan-idea">
              <div class="row-text">
                <a class="row-title" href="#/recipe/${s.recipe.id}">${s.recipe.title}</a>
                <span class="small">${s.option.kind === "original" ? "As written" : s.option.label} · 2 servings</span>
                <ul class="reasons small">${s.reasons.map((x) => html`<li>${x}</li>`)}</ul>
              </div>
              <button class="btn btn--secondary btn--small" data-action="plan-add-option" data-id="${s.recipe.id}" data-applied="${s.option.applied.join(",")}" data-servings="2">${icon("plus")} Plan it</button>
            </li>`)}</ul>`
            : html`<p class="small">No supported dish uses ${ui.focus.map(shortName).join(" and ")} within your requirements. Try fewer ingredients at once.</p>`}
        </section>` : ""}

      <section class="adapt-section" aria-labelledby="planned-h">
        <div class="section-head"><h2 id="planned-h">Planned</h2><span class="small muted">${plural(state.plan.length, "meal")}</span></div>
        ${state.plan.length ? html`
          ${plannedList(ctx)}
          ${sharedUse(ctx)}
          <div class="actions"><a class="btn btn--primary" href="#/list">${icon("list")} Shopping list</a></div>`
          : html`<p class="small muted">Nothing planned yet. Plan a dish above, or add one from its Pantry and shopping step.</p>`}
      </section>
    </div>`;
}

export function plannedList(ctx) {
  return html`<ul class="planned">${ctx.state.plan.map((p) => {
    const r = getRecipe(p.recipeId);
    const v = p.versionId ? ctx.state.versions[p.versionId] : null;
    const updated = v && v.rev !== p.rev;
    return html`
      <li class="planned-row">
        <div class="row-text">
          <a class="row-title" href="#/recipe/${r.id}">${r.title}</a>
          <span class="small muted">${p.label}${p.applied.length ? `: ${p.applied.map((id) => getSwap(id)?.label).join(", ")}` : ""}</span>
          ${updated ? html`<span class="small warn">${checkNote(html`“${v.name}” changed since you planned it. <button class="btn btn--quiet" data-action="plan-review-update" data-plan="${p.id}">Review update</button>`)}</span>` : ""}
          ${p.versionId && !v ? html`<span class="small muted">That saved version was removed; this meal keeps its own copy.</span>` : ""}
        </div>
        <div class="planned-ctl">
          <div class="stepper stepper--small" role="group" aria-label="Servings for ${r.title}">
            <button data-action="plan-servings" data-plan="${p.id}" data-delta="-1" aria-label="Fewer servings" ${p.servings <= 1 ? "disabled" : ""}>${icon("minus")}</button>
            <output>${p.servings}</output>
            <button data-action="plan-servings" data-plan="${p.id}" data-delta="1" aria-label="More servings" ${p.servings >= 12 ? "disabled" : ""}>${icon("plus")}</button>
          </div>
          <button class="icon-btn" data-action="plan-remove" data-plan="${p.id}" aria-label="Remove ${r.title} from your plan">${icon("close")}</button>
        </div>
      </li>`;
  })}</ul>`;
}

/** Ingredients used by more than one planned meal, with what the pantry covers. */
function sharedUse(ctx) {
  const totals = new Map();
  for (const p of ctx.state.plan) {
    const d = deriveRecipe(getRecipe(p.recipeId), p);
    for (const l of d.ingredients) for (const e of l.entries) {
      const it = ITEMS[e.item];
      if (!it?.key) continue;
      const t = totals.get(`${e.item}|${e.unit}`) ?? { item: e.item, unit: e.unit, qty: 0, meals: new Set() };
      t.qty += e.qty;
      t.meals.add(p.id);
      totals.set(`${e.item}|${e.unit}`, t);
    }
  }
  const shared = [...totals.values()].filter((t) => t.meals.size > 1);
  if (!shared.length) return "";
  return html`
    <div class="shared">
      <h3 class="eyebrow">Shared between meals</h3>
      <ul class="small">${shared.map((t) => {
        const have = ctx.state.pantry[t.item];
        return html`<li><strong>${ITEMS[t.item].name}</strong>: ${formatQty(t.qty, t.unit)} across ${t.meals.size} meals. ${have?.qty != null ? `You have ${formatQty(have.qty, have.unit)}, counted once.` : have ? "In your pantry without an amount; you'll be asked to confirm." : "Not in your pantry."}</li>`;
      })}</ul>
    </div>`;
}
