// Recipe detail: the adaptation workspace. Everything shown in "My version"
// is derived from the source recipe plus the stored adaptation state.

import { html, plural } from "./html.js";
import { icon, doodle } from "./icons.js";
import { ITEMS } from "../data/items.js";
import { swapsForRecipe, getSwap } from "../data/swaps.js";
import { formatQty, unitFamily } from "../core/units.js";
import { estimate, formatRange, direction } from "../core/nutrition.js";
import { isListCurrent } from "../core/shopping.js";
import { defaultAdaptation, deriveRecipe, isAdapted } from "../core/adapt.js";
import { capitalize } from "./home.js";

export const REASON_LABEL = {
  missing: "If you're out",
  preference: "Preference",
  protein: "More protein",
  fiber: "More fiber",
};

const GROUPS = [
  ["main", "Main ingredients"],
  ["serve", "To serve"],
  ["spices", "Spices"],
  ["staples", "Staples"],
];

export function recipeView(ctx, recipe) {
  const view = ctx.ui.view[recipe.id] ?? "mine";
  const saved = ctx.state.saved.includes(recipe.id);
  const adaptation = ctx.adaptation(recipe.id);
  const changes = adaptation.applied.length + (adaptation.servings !== recipe.servings ? 1 : 0);
  return html`
    <div class="page page--wide recipe">
      <a class="back-link" href="#/">${icon("back")} My Recipes</a>
      <header class="recipe-head">
        <p class="eyebrow">${recipe.cuisine} · ${recipe.minutes} min</p>
        <h1 tabindex="-1" data-route-focus>${recipe.title}</h1>
        <p class="recipe-sub">${recipe.subtitle}</p>
        ${doodle.squiggle}
        <p class="recipe-blurb muted">${recipe.blurb} <span class="tag tag--demo">Demo recipe</span></p>
        <div class="recipe-actions">
          <button class="btn btn--secondary btn--small" data-action="${saved ? "unsave-recipe" : "save-recipe"}" data-id="${recipe.id}" aria-pressed="${saved}">
            ${icon(saved ? "bookmark-filled" : "bookmark")} ${saved ? "Saved" : "Save recipe"}
          </button>
          <div class="view-toggle" role="group" aria-label="Which version to show">
            <button class="view-btn" aria-pressed="${view === "mine"}" data-action="set-view" data-id="${recipe.id}" data-view="mine">
              My version${changes ? html` <span class="count">${changes}</span>` : ""}
            </button>
            <button class="view-btn" aria-pressed="${view === "original"}" data-action="set-view" data-id="${recipe.id}" data-view="original">Original</button>
          </div>
        </div>
      </header>
      ${view === "original" ? originalView(recipe) : mineView(ctx, recipe, adaptation)}
    </div>`;
}

function originalView(recipe) {
  const d = deriveRecipe(recipe, defaultAdaptation(recipe));
  return html`
    <div class="notice notice--cool original-note">
      <p>This is the source recipe as written, for ${plural(recipe.servings, "serving")}. Your version keeps its changes separately, so this never changes.</p>
    </div>
    <div class="recipe-grid">
      <section class="ingredients" aria-labelledby="ing-h">
        <div class="section-head"><h2 id="ing-h">Ingredients</h2><span class="muted small">for ${recipe.servings}</span></div>
        ${GROUPS.map(([g, label]) => {
          const lines = d.ingredients.filter((l) => l.group === g);
          if (!lines.length) return "";
          return html`<h3 class="group-label eyebrow">${label}</h3>
            <ul class="ing-list ing-list--plain">${lines.map((l) => l.entries.map((e) => html`
              <li class="ing"><div class="ing-text"><span class="qty">${formatQty(e.qty, e.unit, e.step)}</span>
              <span class="ing-name">${ITEMS[e.item].name}${e.prep ? html`<span class="prep">, ${e.prep}</span>` : ""}</span></div></li>`))}</ul>`;
        })}
      </section>
      <section class="method" aria-labelledby="method-h">
        <h2 id="method-h">Method</h2>
        <ol class="steps">${d.steps.map((s) => html`<li class="step"><p>${s.text}</p></li>`)}</ol>
      </section>
    </div>`;
}

function mineView(ctx, recipe, adaptation) {
  const d = ctx.derived(recipe.id);
  return html`
    ${adaptPanel(ctx, recipe, adaptation, d)}
    <div class="recipe-grid">
      <div class="col">
        ${ingredientsSection(ctx, recipe, d)}
        ${ideasSection(ctx, recipe, adaptation)}
      </div>
      <div class="col">
        ${shopBar(ctx, recipe, d, "side")}
        ${nutritionSection(ctx, recipe, adaptation, d)}
        ${methodSection(d)}
      </div>
    </div>
    ${shopBar(ctx, recipe, d, "bottom")}`;
}

function adaptPanel(ctx, recipe, adaptation, d) {
  const canUndo = (ctx.ui.undo[recipe.id] ?? []).length > 0;
  const adapted = isAdapted(recipe, adaptation);
  return html`
    <section class="panel adapt" aria-label="Adjust this recipe">
      <div class="adapt-row">
        <div>
          <h2 class="adapt-label" id="servings-label">Servings</h2>
          <p class="small muted">${adaptation.servings === recipe.servings ? "As written" : `Recipe makes ${recipe.servings}`}</p>
        </div>
        <div class="stepper" role="group" aria-labelledby="servings-label">
          <button data-action="servings" data-id="${recipe.id}" data-delta="-1" aria-label="Fewer servings" ${adaptation.servings <= 1 ? "disabled" : ""}>${icon("minus")}</button>
          <output aria-live="polite" aria-label="${plural(adaptation.servings, "serving")}">${adaptation.servings}</output>
          <button data-action="servings" data-id="${recipe.id}" data-delta="1" aria-label="More servings" ${adaptation.servings >= 12 ? "disabled" : ""}>${icon("plus")}</button>
        </div>
      </div>

      <div class="adapt-changes">
        <h2 class="adapt-label">Your changes</h2>
        ${d.applied.length
          ? html`<ul class="change-list">${d.applied.map((s) => html`
              <li>
                <span class="change-dot" aria-hidden="true"></span>
                <span class="change-text"><strong>${s.label}</strong> <span class="muted small">${s.summary}</span></span>
                <button class="btn btn--quiet" data-action="remove-swap" data-id="${recipe.id}" data-swap="${s.id}" aria-label="Undo ${s.label}">Undo</button>
              </li>`)}</ul>`
          : html`<p class="small muted">No swaps yet. Use <strong>Swap</strong> on an ingredient, or try an idea below.</p>`}
        ${adapted || canUndo ? html`
          <div class="change-actions">
            ${canUndo ? html`<button class="btn btn--quiet" data-action="undo" data-id="${recipe.id}">${icon("undo")} Undo last change</button>` : ""}
            ${adapted ? html`<button class="btn btn--quiet" data-action="restore-original" data-id="${recipe.id}">Restore original</button>` : ""}
          </div>` : ""}
      </div>
    </section>`;
}

function goalChips(goals) {
  return html`
    <div class="goals">
      <p class="small" id="goals-label"><strong>Optional goals</strong> <span class="muted">· highlights matching ideas and opens rough estimates. Nothing is tracked.</span></p>
      <div class="chips" role="group" aria-labelledby="goals-label">
        ${["protein", "fiber"].map((g) => html`
          <button class="chip" aria-pressed="${goals.includes(g)}" data-action="goal-toggle" data-goal="${g}">
            ${goals.includes(g) ? icon("check") : ""}${REASON_LABEL[g]}
          </button>`)}
      </div>
    </div>`;
}

function ingredientsSection(ctx, recipe, d) {
  const swaps = swapsForRecipe(recipe.id);
  return html`
    <section class="ingredients" aria-labelledby="ing-h">
      <div class="section-head">
        <h2 id="ing-h">Ingredients</h2>
        <span class="muted small">for ${d.servings}</span>
      </div>
      <p class="small muted ing-hint">Mark what you have. Anything unmarked counts as needed.</p>
      ${d.cautions.map((c) => html`<div class="notice">${icon("info")}<p>${c}</p></div>`)}
      ${GROUPS.map(([g, label]) => {
        const lines = d.ingredients.filter((l) => l.group === g);
        if (!lines.length) return "";
        const compact = g === "spices" || g === "staples";
        const items = lines.flatMap((l) => l.entries.map((e) => e.item)).filter((id) => !ITEMS[id].noShop);
        const allHave = items.every((id) => ctx.state.pantry[id]?.status === "have");
        return html`
          <div class="group">
            <div class="group-head">
              <h3 class="group-label eyebrow">${label}</h3>
              ${compact && items.length ? html`<button class="btn btn--quiet" data-action="group-have" data-id="${recipe.id}" data-group="${g}" ${allHave ? "disabled" : ""}>
                ${allHave ? "All marked" : "I have all of these"}</button>` : ""}
            </div>
            <ul class="ing-list">
              ${lines.map((line) => ingredientLine(ctx, recipe, line, swaps, compact))}
            </ul>
          </div>`;
      })}
    </section>`;
}

function ingredientLine(ctx, recipe, line, swaps, compact) {
  const slotSwaps = swaps.filter((s) => s.replace?.slot === line.slot || s.omit === line.slot);
  const noSwap = recipe.noSwap?.[line.slot];
  const changed = line.changedBy.length > 0;
  const by = line.changedBy.map((id) => getSwap(id)?.label).join(", ");
  const original = line.original;
  const wasText = original && changed && !line.addedBy
    ? `was ${formatQty(original.qty * d_factor(line, ctx, recipe), original.unit, original.step)} ${ITEMS[original.item].name.toLowerCase()}`
    : null;
  const swapBtn = line.addedBy
    ? ""
    : slotSwaps.length
      ? html`<button class="btn btn--secondary btn--small swap-btn" data-action="open-swaps" data-id="${recipe.id}" data-slot="${line.slot}"
          aria-label="Swap options for ${line.omitted ? ITEMS[original.item].name : line.entries.map((e) => ITEMS[e.item].name).join(" and ")}">
          ${icon("swap")} Swap</button>`
      : noSwap
        ? html`<button class="btn btn--quiet swap-none" data-action="open-swaps" data-id="${recipe.id}" data-slot="${line.slot}"
            aria-label="Why there's no swap for ${ITEMS[original.item].name}">No swap</button>`
        : "";

  if (line.omitted) {
    return html`
      <li class="ing is-changed is-omitted">
        <div class="ing-text">
          <span class="qty">—</span>
          <span class="ing-name"><s>${ITEMS[original.item].name}</s> <span class="muted">left out</span>
            <span class="changed-by">${icon("swap")} ${by}</span></span>
        </div>
        <div class="ing-controls">${swapBtn}</div>
      </li>`;
  }

  return line.entries.map((e, i) => {
    const item = ITEMS[e.item];
    const shop = !item.noShop;
    return html`
      <li class="ing ${changed ? "is-changed" : ""} ${compact ? "ing--compact" : ""}">
        <div class="ing-text">
          <span class="qty">${formatQty(e.qty, e.unit, e.step)}</span>
          <span class="ing-name">${item.name}${e.prep ? html`<span class="prep">, ${e.prep}</span>` : ""}
            ${line.scaling === "taste" && d_scaled(ctx, recipe) ? html`<span class="taste">to taste</span>` : ""}
            ${changed && i === 0 ? html`<span class="changed-by">${icon("swap")} ${line.addedBy ? "Added" : "Changed"}: ${by}</span>` : ""}
            ${wasText && i === 0 ? html`<span class="was">${wasText}</span>` : ""}
          </span>
        </div>
        <div class="ing-controls">
          ${shop ? (compact ? haveToggle(ctx, e) : availability(ctx, e)) : html`<span class="small muted">From the tap</span>`}
          ${i === 0 ? swapBtn : ""}
        </div>
        ${shop && !compact && ctx.state.pantry[e.item]?.status === "some" ? partialInput(ctx, e) : ""}
      </li>`;
  });
}

// Original quantity at the current servings, so "was" compares like with like.
function d_factor(line, ctx, recipe) {
  const factor = ctx.adaptation(recipe.id).servings / recipe.servings;
  return line.scaling === "pan" ? 1 + (factor - 1) * 0.5 : factor;
}

function d_scaled(ctx, recipe) {
  return ctx.adaptation(recipe.id).servings !== recipe.servings;
}

function availability(ctx, entry) {
  const status = ctx.state.pantry[entry.item]?.status ?? "";
  const name = ITEMS[entry.item].name;
  const opts = [["have", "Have"], ["some", "Some"], ["need", "Need"]];
  return html`
    <fieldset class="seg" aria-label="Do you have ${name}?">
      ${opts.map(([v, label]) => html`
        <label>
          <input type="radio" name="avail-${entry.item}" value="${v}" ${status === v ? "checked" : ""} data-action="avail" data-item="${entry.item}">
          ${icon("check")}${label}
        </label>`)}
    </fieldset>`;
}

function haveToggle(ctx, entry) {
  const have = ctx.state.pantry[entry.item]?.status === "have";
  return html`
    <label class="check have-check">
      <input type="checkbox" ${have ? "checked" : ""} data-action="avail-toggle" data-item="${entry.item}">
      <span class="small">Have</span>
      <span class="visually-hidden">${ITEMS[entry.item].name}</span>
    </label>`;
}

const UNIT_CHOICES = { mass: ["g", "kg"], volume: ["ml", "tsp", "tbsp", "cup"] };

function partialInput(ctx, entry) {
  const have = ctx.state.pantry[entry.item];
  const fam = unitFamily(entry.unit);
  const units = UNIT_CHOICES[fam] ?? [entry.unit];
  const unit = have.unit ?? entry.unit;
  const mismatch = have.unit != null && unitFamily(have.unit) !== fam;
  const id = `partial-${entry.item}`;
  return html`
    <div class="partial">
      <label for="${id}" class="small">How much do you have?</label>
      <div class="partial-row">
        <input id="${id}" class="input input--num" type="number" inputmode="decimal" min="0" step="any"
          value="${have.qty ?? ""}" placeholder="amount" data-action="avail-qty" data-item="${entry.item}" data-unit="${mismatch ? entry.unit : unit}">
        ${units.length > 1
          ? html`<select class="select" aria-label="Unit" data-action="avail-unit" data-item="${entry.item}">
              ${units.map((u) => html`<option value="${u}" ${u === unit ? "selected" : ""}>${u}</option>`)}</select>`
          : html`<span class="small">${entry.unit || "count"}</span>`}
      </div>
      ${have.qty == null ? html`<p class="small muted">Without an amount, the full quantity stays on your list.</p>` : ""}
      ${mismatch ? html`<p class="small warn">You entered this as ${have.unit}, which can't be compared with ${entry.unit || "a count"}. Enter it again here.</p>` : ""}
    </div>`;
}

function ideasSection(ctx, recipe, adaptation) {
  const goals = ctx.state.goals;
  const ideas = swapsForRecipe(recipe.id).filter((s) => s.reasons.includes("protein") || s.reasons.includes("fiber"));
  if (!ideas.length) return "";
  const score = (s) => (goals.some((g) => s.reasons.includes(g)) ? 0 : 1);
  ideas.sort((a, b) => score(a) - score(b));
  return html`
    <section class="ideas" aria-labelledby="ideas-h">
      <div class="section-head">
        <h2 id="ideas-h">${doodle.spark} Ideas for this dish</h2>
      </div>
      <p class="small muted">Ways to shift protein or fiber that keep the dish recognizable. Preview first; nothing changes until you apply.</p>
      ${goalChips(goals)}
      <ul class="idea-list">
        ${ideas.map((s) => {
          const applied = adaptation.applied.includes(s.id);
          const match = goals.some((g) => s.reasons.includes(g));
          return html`
            <li class="idea ${applied ? "is-applied" : ""} ${match ? "is-match" : ""}">
              <div class="idea-text">
                <h3>${s.label}</h3>
                <p class="small">${s.summary}</p>
                <p class="idea-tags">${s.reasons.filter((r) => r !== "missing").map((r) => html`<span class="tag ${goals.includes(r) ? "tag--yolk" : "tag--cool"}">${REASON_LABEL[r]}</span>`)}
                  ${applied ? html`<span class="tag">${icon("check")} Applied</span>` : ""}</p>
              </div>
              <button class="btn btn--secondary btn--small" data-action="preview-swap" data-id="${recipe.id}" data-swap="${s.id}">
                ${applied ? "Review" : "See what changes"}
              </button>
            </li>`;
        })}
      </ul>
    </section>`;
}

function nutritionSection(ctx, recipe, adaptation, d) {
  const goals = ctx.state.goals;
  const now = estimate(d);
  const base = isAdapted(recipe, adaptation) && adaptation.applied.length ? estimate(deriveRecipe(recipe, defaultAdaptation(recipe))) : null;
  const rows = ["protein", "fiber"].map((n) => {
    const missing = now.missing[n];
    return html`
      <div class="nut-row">
        <dt>${capitalize(n)} <span class="muted small">per serving</span></dt>
        <dd>
          <span class="nut-value num">${formatRange(now[n])}</span>
          ${base ? html`<span class="small muted">Original ${formatRange(base[n])} · ${direction(base[n], now[n])}</span>` : ""}
          ${missing.length ? html`<span class="small warn">No reliable ${n} data for ${missing.join(", ")}, which could be a main source here.</span>` : ""}
        </dd>
      </div>`;
  });
  return html`
    <section class="nutrition" aria-labelledby="nut-h">
      <details ${goals.length ? "open" : ""}>
        <summary><h2 id="nut-h">Rough nutrition estimate</h2><span class="tag">Optional</span></summary>
        <dl class="nut">${rows}</dl>
        <p class="small muted">Worked out from typical values for each ingredient, shown as a ±15% range. Brands, cooking and portions vary. Not dietary or medical advice.</p>
      </details>
    </section>`;
}

function methodSection(d) {
  return html`
    <section class="method" aria-labelledby="method-h">
      <h2 id="method-h">Method</h2>
      <ol class="steps">
        ${d.steps.map((s) => html`
          <li class="step ${s.changedBy.length ? "is-changed" : ""}">
            <p>${s.text}</p>
            ${s.changedBy.length ? html`<span class="changed-by">${icon("swap")} ${s.added ? "Added" : "Changed"}: ${s.changedBy.map((id) => getSwap(id)?.label).join(", ")}</span>` : ""}
          </li>`)}
      </ol>
    </section>`;
}

// Rendered twice: a bottom bar on small screens, a sticky side card on wide ones. CSS shows one.
function shopBar(ctx, recipe, d, placement) {
  const needs = ctx.needs(recipe.id);
  const listed = ctx.state.list.synced[recipe.id] != null;
  const current = listed && isListCurrent(ctx.state.list, recipe.id, needs);
  const unmarked = d.ingredients.flatMap((l) => l.entries)
    .filter((e) => !ITEMS[e.item].noShop && !ctx.state.pantry[e.item]?.status).length;
  let action;
  if (current) action = html`<a class="btn btn--secondary btn--small" href="#/list">${icon("check")} On your list</a>`;
  else if (listed) action = html`<button class="btn btn--primary btn--small" data-action="sync-list" data-id="${recipe.id}" data-place="${placement}">Update list</button>`;
  else action = html`<button class="btn btn--primary btn--small" data-action="sync-list" data-id="${recipe.id}" data-place="${placement}" ${needs.length ? "" : "disabled"}>Add to list</button>`;
  return html`
    <div class="shop-bar shop-bar--${placement}" role="region" aria-label="Shopping for this recipe">
      <p class="shop-text">
        <strong>${needs.length ? `${plural(needs.length, "thing")} to buy` : "Nothing to buy"}</strong>
        <span class="small muted">${listed && !current ? "Recipe changed since you added it" : unmarked ? `${unmarked} unmarked, counted as needed` : "Based on what you marked"}</span>
      </p>
      ${action}
    </div>`;
}
