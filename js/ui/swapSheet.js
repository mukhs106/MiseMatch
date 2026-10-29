// The swap sheet: options for one ingredient, then a before/after comparison
// with consequences. Nothing changes until the person presses Apply.

import { html } from "./html.js";
import { icon, doodle } from "./icons.js";
import { ITEMS, shortName } from "../data/items.js";
import { getSwap, swapsForRecipe } from "../data/swaps.js";
import { formatQty } from "../core/units.js";
import { deriveRecipe, applySwap, removeSwap, checkSwap } from "../core/adapt.js";
import { estimate, formatRange, direction } from "../core/nutrition.js";
import { REASON_LABEL } from "./recipe.js";
import { capitalize } from "./home.js";

export function sheetView(ctx, dialog) {
  if (dialog.type === "slot") return slotSheet(ctx, dialog);
  if (dialog.type === "compare") return compareSheet(ctx, dialog);
  if (dialog.type === "reset") return resetSheet();
  return "";
}

function head(title, eyebrow, backAction) {
  return html`
    <header class="sheet-head">
      ${backAction ? html`<button class="icon-btn" data-action="${backAction}" aria-label="Back to options">${icon("back")}</button>` : ""}
      <div class="sheet-title">
        ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ""}
        <h2 id="sheet-title" tabindex="-1">${title}</h2>
      </div>
      <button class="icon-btn" data-action="close-dialog" aria-label="Close">${icon("close")}</button>
    </header>`;
}

function slotSheet(ctx, { recipeId, slot }) {
  const recipe = ctx.recipe(recipeId);
  const original = recipe.ingredients.find((i) => i.slot === slot);
  const name = shortName(original.item);
  const options = swapsForRecipe(recipeId).filter((s) => s.replace?.slot === slot || s.omit === slot);
  const adaptation = ctx.adaptation(recipeId);
  const reason = recipe.noSwap?.[slot];
  return html`
    ${head(`Swap ${name}`, recipe.title)}
    <div class="sheet-body">
      ${options.length ? html`
        <p class="muted">Written for this dish only. Pick one to see what changes before applying it.</p>
        <ul class="option-list">
          ${options.map((s) => {
            const applied = adaptation.applied.includes(s.id);
            return html`
              <li>
                <button class="option" data-action="preview-swap" data-id="${recipeId}" data-swap="${s.id}" data-from="slot">
                  <span class="option-text">
                    <span class="option-label">${s.label}${applied ? html` <span class="tag tag--yolk">${icon("check")} Applied</span>` : ""}</span>
                    <span class="small muted">${s.summary}</span>
                    <span class="idea-tags">${s.reasons.map((r) => html`<span class="tag tag--cool">${REASON_LABEL[r]}</span>`)}</span>
                  </span>
                  ${icon("next")}
                </button>
              </li>`;
          })}
        </ul>` : html`
        <div class="notice notice--cool">
          <p><strong>No tested swap for ${name} in this recipe.</strong></p>
          <p>${reason ?? "We haven't written a swap for this ingredient in this recipe yet, and we won't guess one."}</p>
        </div>`}
      ${options.length && reason ? html`<p class="small muted">${reason}</p>` : ""}
    </div>`;
}

/** Text for a line's entries, e.g. "130 g frozen spinach". */
function entriesText(line) {
  if (!line || line.omitted || !line.entries.length) return "Left out";
  return line.entries.map((e) => `${formatQty(e.qty, e.unit, e.step)} ${ITEMS[e.item].name.toLowerCase()}`).join(" + ");
}

function diffLines(before, after) {
  const slots = new Set([...before.ingredients, ...after.ingredients].map((l) => l.slot));
  const rows = [];
  for (const slot of slots) {
    const b = before.ingredients.find((l) => l.slot === slot);
    const a = after.ingredients.find((l) => l.slot === slot);
    const bt = b ? entriesText(b) : null;
    const at = a ? entriesText(a) : null;
    if (bt !== at) rows.push({ before: bt, after: at });
  }
  return rows;
}

function diffSteps(before, after) {
  const rows = [];
  after.steps.forEach((s, i) => {
    const b = before.steps.find((x) => x.id === s.id);
    if (!b) rows.push({ n: i + 1, kind: "Added", text: s.text });
    else if (b.text !== s.text) rows.push({ n: i + 1, kind: "Changed", text: s.text, was: b.text });
  });
  for (const b of before.steps) {
    if (!after.steps.some((s) => s.id === b.id)) rows.push({ kind: "Removed", text: b.text });
  }
  return rows;
}

function compareSheet(ctx, { recipeId, swapId, from }) {
  const recipe = ctx.recipe(recipeId);
  const swap = getSwap(swapId);
  const adaptation = ctx.adaptation(recipeId);
  const applied = adaptation.applied.includes(swapId);
  const check = applied ? { ok: true, blockers: [] } : checkSwap(recipe, adaptation, swapId);
  const removeIds = check.blockers.map((b) => b.swap.id);

  const beforeState = applied ? removeSwap(adaptation, swapId) : adaptation;
  const afterState = applied ? adaptation : applySwap(adaptation, swapId, removeIds);
  const before = deriveRecipe(recipe, beforeState);
  const after = deriveRecipe(recipe, afterState);
  const lines = diffLines(before, after);
  const steps = diffSteps(before, after);
  const nb = estimate(before);
  const na = estimate(after);
  const fx = swap.effects;

  return html`
    ${head(swap.label, applied ? "Applied to your version" : `Preview · ${recipe.title}`, from === "slot" ? "back-to-options" : null)}
    <div class="sheet-body">
      <p>${swap.summary}</p>

      ${check.blockers.length ? html`
        <div class="notice" role="status">
          ${check.blockers.map((b) => html`<p><strong>Can't combine with “${b.swap.label}”.</strong> ${b.reason}</p>`)}
          <p>Applying this will undo “${check.blockers.map((b) => b.swap.label).join("”, “")}”. The preview below shows that result.</p>
        </div>` : ""}

      <section aria-labelledby="cmp-qty">
        <h3 id="cmp-qty" class="eyebrow">Ingredients, for ${after.servings}</h3>
        <ul class="diff">
          ${lines.map((r) => html`
            <li class="diff-row">
              <span class="diff-before">${r.before ?? "Not in the recipe"}</span>
              <span class="diff-arrow">${doodle.arrow}<span class="visually-hidden">becomes</span></span>
              <span class="diff-after">${r.after ?? "Removed"}</span>
            </li>`)}
        </ul>
      </section>

      <section aria-labelledby="cmp-fx">
        <h3 id="cmp-fx" class="eyebrow">What changes in the dish</h3>
        <dl class="effects">
          <div><dt>Flavor</dt><dd>${fx.flavor}</dd></div>
          <div><dt>Texture</dt><dd>${fx.texture}</dd></div>
          <div><dt>Quantities</dt><dd>${fx.quantity}</dd></div>
          <div><dt>Prep</dt><dd>${fx.prep}</dd></div>
          <div><dt>Nutrition</dt><dd>${fx.nutrition}
            <span class="nut-compare small">
              ${["protein", "fiber"].map((n) => html`<span>${capitalize(n)} per serving: ${formatRange(nb[n])} → ${formatRange(na[n])} <span class="muted">(${direction(nb[n], na[n])})</span></span>`)}
              <span class="muted">Rough estimate from typical values.</span>
            </span>
          </dd></div>
        </dl>
      </section>

      ${steps.length ? html`
        <section aria-labelledby="cmp-steps">
          <h3 id="cmp-steps" class="eyebrow">Method changes</h3>
          <ul class="step-diff">
            ${steps.map((s) => html`
              <li>
                <span class="tag ${s.kind === "Removed" ? "" : "tag--yolk"}">${s.n ? `Step ${s.n} · ` : ""}${s.kind}</span>
                <p>${s.text}</p>
                ${s.was ? html`<p class="small muted"><span class="visually-hidden">Before: </span><s>${s.was}</s></p>` : ""}
              </li>`)}
          </ul>
        </section>` : ""}

      ${swap.caution ? html`<div class="notice">${icon("info")}<p>${swap.caution}</p></div>` : ""}
    </div>
    <footer class="sheet-foot">
      ${applied
        ? html`<button class="btn btn--secondary btn--block" data-action="remove-swap" data-id="${recipeId}" data-swap="${swapId}" data-close="1">${icon("undo")} Undo this swap</button>`
        : html`<button class="btn btn--primary btn--block" data-action="apply-swap" data-id="${recipeId}" data-swap="${swapId}" data-remove="${removeIds.join(",")}">
            ${removeIds.length ? "Switch to this swap" : "Apply to my version"}</button>`}
      <button class="btn btn--quiet" data-action="close-dialog">${applied ? "Close" : "Not now"}</button>
    </footer>`;
}

function resetSheet() {
  return html`
    ${head("Reset the demo?", "About this prototype")}
    <div class="sheet-body">
      <p>This clears your saved recipes, adapted versions, what you marked as on hand, and your grocery list, then restores the demo starting state.</p>
      <p class="small muted">It only affects this browser and can't be undone.</p>
    </div>
    <footer class="sheet-foot">
      <button class="btn btn--primary btn--block" data-action="confirm-reset">Reset demo</button>
      <button class="btn btn--quiet" data-action="close-dialog">Cancel</button>
    </footer>`;
}
