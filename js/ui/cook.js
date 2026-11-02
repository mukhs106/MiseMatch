// Cook mode: the exact version and serving count, ingredients to tick off and
// steps in order. Cooking an unsaved session doesn't save anything to the
// collection; the cooking record keeps the exact rules and servings used.

import { html, plural } from "./html.js";
import { icon, checkNote } from "./icons.js";
import { getRecipe } from "../data/recipes.js";
import { formatQty } from "../core/units.js";
import { evaluate } from "../core/engine.js";
import { servingsBounds, scalingNotes } from "../core/adapt.js";
import { hydrateSnapshot, recordStatus, sameSnapshot } from "../core/versions.js";
import { validateDraft, draftAsDerived } from "../core/normalize.js";
import { untestedText } from "./adapt.js";

export function cookView(ctx, route) {
  if (route.draft) return draftCook(ctx, ctx.state.drafts[route.draft]);
  const recipe = getRecipe(route.id);
  const cs = ctx.state.cooking[route.cookKey];
  // No visit here means it was just finished; opening this route again starts a new one.
  if (!cs) return html`<div class="page"><h1 tabindex="-1" data-route-focus>${recipe.title}</h1><p>Recorded as cooked. You'll find it under Saved.</p><p class="actions"><a class="btn btn--secondary" href="#/saved">Saved</a> <a class="btn btn--quiet" href="#/">Today</a></p></div>`;
  const d = hydrateSnapshot(cs.snapshot);
  d.recipe = recipe;
  const back = route.kind === "session" ? `#/adapt/${recipe.id}/${ctx.session(recipe.id)?.step ?? "compare"}` : route.kind === "plan" ? "#/list" : route.kind === "record" ? "#/saved" : `#/recipe/${recipe.id}`;
  const checks = cs.checks;
  const done = Object.values(checks).filter(Boolean).length;
  const ev = evaluate(recipe, { servings: cs.servings, applied: cs.applied }, ctx.constraintsFor(recipe.id), ctx.state.pantry);
  const stale = recordStatus(cs);
  const work = route.kind === "session" ? ctx.working(recipe.id) : null;
  const drifted = work && !sameSnapshot(work, cs);
  const [min, max] = servingsBounds(recipe);
  const labels = cs.snapshot.rules.map((r) => r.label);
  const notes = scalingNotes({ ...d, recipe }).filter((n) => n.kind !== "pan");
  return html`
    <div class="page cook-page">
      <a class="back-link" href="${back}">${icon("back")} Back</a>
      <header class="cook-head">
        <p class="eyebrow">Cooking</p>
        <h1 tabindex="-1" data-route-focus>${recipe.title}</h1>
        <p class="meta-line">${cs.label} · ${plural(cs.servings, "serving")}</p>
        ${labels.length ? html`<p class="small muted">${labels.join(" · ")}</p>` : ""}
        ${route.kind === "session" ? html`<p class="small">This doesn't save anything to your collection.</p>` : ""}
        <p class="small muted">${done ? `Resumed: ${plural(done, "item")} ticked. ` : ""}Ingredients and steps are fixed from when you started cooking. <button class="btn btn--quiet" data-action="cook-restart" data-key="${route.cookKey}" aria-label="Start cooking ${recipe.title} again from the beginning">Start again</button></p>
      </header>
      ${drifted ? html`<div class="notice" role="status"><p><strong>Your working version changed since you started cooking.</strong> You're still looking at what you started with: ${plural(cs.servings, "serving")}.</p><div class="actions"><button class="btn btn--secondary btn--small" data-action="cook-restart" data-key="${route.cookKey}">Use the current version</button></div></div>` : ""}
      ${!stale.intact ? html`<div class="notice notice--cool" role="status"><p><strong>The catalogue changed since this was recorded.</strong> This shows the amounts and steps as they were recorded, not the current rule.</p></div>` : ""}
      ${cookChecks(ev, recipe, min, max)}
      ${notes.length && cs.servings !== recipe.servings ? html`<ul class="small scale-note">${notes.map((n) => html`<li>${n.text}</li>`)}</ul>` : ""}
      <div class="recipe-grid">
        <section aria-labelledby="ck-ing">
          <h2 id="ck-ing">Ingredients</h2>
          <ul class="cook-list">${d.ingredients.flatMap((l) => l.entries.map((e) => {
            const key = `i:${l.slot}:${e.item}`;
            return html`<li><label class="check-row"><input type="checkbox" ${checks[key] ? "checked" : ""} data-action="cook-check" data-cook="${route.cookKey}" data-key="${key}">
              <span><span class="qty num">${formatQty(e.qty, e.unit, e.step)}</span> ${e.name}${e.prep ? html`<span class="prep">, ${e.prep}</span>` : ""}${e.optional ? html` <span class="small muted">(optional)</span>` : ""}
              ${l.scaling === "taste" && cs.servings !== recipe.servings ? html` <span class="taste">to taste</span>` : ""}${l.changedBy.length ? html` <span class="changed-by">${l.addedBy ? "added" : "changed"}</span>` : ""}</span></label></li>`;
          }))}</ul>
        </section>
        <section aria-labelledby="ck-steps">
          <h2 id="ck-steps">Method</h2>
          <ol class="cook-steps">${d.steps.map((s, i) => {
            const key = `s:${s.id}`;
            return html`<li class="${checks[key] ? "is-done" : ""}"><label class="check-row"><input type="checkbox" ${checks[key] ? "checked" : ""} data-action="cook-check" data-cook="${route.cookKey}" data-key="${key}">
              <span><span class="step-num">${i + 1}</span> ${s.text}${s.changedBy.length ? html` <span class="changed-by">${s.added ? "added" : "changed"}</span>` : ""}</span></label></li>`;
          })}</ol>
        </section>
      </div>
      <div class="action-bar">
        <a class="btn btn--quiet" href="${back}">Not now</a>
        <button class="btn btn--primary" data-action="finish-cooking" data-id="${recipe.id}" data-key="${route.cookKey}">I cooked this</button>
      </div>
    </div>`;
}

/** Re-evaluated at entry against current requirements. A conflict is shown as one, never as a fit. */
function cookChecks(ev, recipe, min, max) {
  const conflicts = ev.check.conflicts;
  const out = [];
  if (conflicts.length) out.push(html`<p><strong>Conflicts with your current requirements:</strong> ${conflicts.map((x) => x.reason).join("; ")}.</p>`);
  if (ev.check.questions.length) out.push(html`<p><strong>Open question:</strong> ${ev.check.questions.map((q) => q.text).join(" ")}</p>`);
  if (ev.portionIssue) out.push(html`<p><strong>Unsupported batch size.</strong> ${ev.portionIssue}</p>`);
  for (const q of ev.qtyIssues) out.push(html`<p><strong>${q.swap.label}:</strong> ${q.reason}</p>`);
  if (ev.combo.status === "untested") out.push(html`<p>${untestedText(ev.combo)}</p>`);
  if (ev.combo.status === "blocked") out.push(html`<p><strong>These changes don't work together:</strong> ${ev.combo.blocked.map((b) => b.reason).join(" ")}</p>`);
  if (!out.length) return "";
  return html`<div class="notice" role="status">${out}<div class="actions"><a class="btn btn--secondary btn--small" href="#/adapt/${recipe.id}/compare">Review the adaptation</a> <a class="btn btn--quiet" href="#/cook/${recipe.id}/original">Cook the recipe as written</a></div></div>`;
}

function draftCook(ctx, draft) {
  const v = validateDraft(draft, "cook");
  const target = draft.targetServings ?? draft.servings;
  const scaled = draft.servings && target && target !== draft.servings;
  const derived = scaled ? draftAsDerived(draft, target) : null;
  const amount = (l) => {
    const entry = derived?.ingredients.find((i) => i.slot === l.id)?.entries[0];
    return entry?.qty != null ? formatQty(entry.qty, entry.unit) : null;
  };
  return html`
    <div class="page cook-page">
      <a class="back-link" href="#/draft/${draft.id}">${icon("back")} Back to draft</a>
      <header class="cook-head">
        <p class="eyebrow">Cooking an imported recipe</p>
        <h1 tabindex="-1" data-route-focus>${draft.title}</h1>
        <p class="meta-line">${target ? plural(target, "serving") : "Servings not stated"}${scaled ? ` (source says ${draft.servings})` : ""}${draft.source.creator ? ` · by ${draft.source.creator}` : ""}</p>
        <p class="small muted">Shown as imported. Quantities that weren't given are left blank, not guessed. ${scaled ? "The method text is the source's own, for its stated servings." : ""}</p>
      </header>
      <div class="recipe-grid">
        <section aria-labelledby="ck-ing"><h2 id="ck-ing">Ingredients</h2>
          <ul class="cook-list">${draft.lines.filter((l) => !l.removed).map((l) => html`<li><span>${amount(l) ? html`<span class="qty num">${amount(l)}</span> ` : ""}${l.raw}${l.excluded || l.omitted ? html` <span class="small muted">(not counted in estimates)</span>` : ""}</span></li>`)}</ul></section>
        <section aria-labelledby="ck-steps"><h2 id="ck-steps">Method</h2>
          ${v.ok ? html`<ol class="cook-steps">${draft.steps.map((s, i) => html`<li><span class="step-num">${i + 1}</span> ${s}</li>`)}</ol>` : html`<p class="warn">${checkNote(v.blocking.map((b) => b.text).join(" "))}</p>`}</section>
      </div>
    </div>`;
}
