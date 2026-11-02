// Dialogs: single-change options and preview, saving versions, session
// replacement, planned-meal updates, cooking feedback and demo reset.
// Nothing changes until the person confirms in the dialog.

import { html, plural } from "./html.js";
import { icon, doodle } from "./icons.js";
import { ITEMS, shortName } from "../data/items.js";
import { getSwap, swapsForRecipe } from "../data/swaps.js";
import { getRecipe } from "../data/recipes.js";
import { formatQty } from "../core/units.js";
import { deriveRecipe, applySwap, removeSwap, checkSwap } from "../core/adapt.js";
import { estimate, formatRange, direction, RANGE_NOTE } from "../core/nutrition.js";
import { checkItems } from "../core/constraints.js";
import { recordStatus, ruleLabels } from "../core/versions.js";
import { amountText, cookPantryReview } from "../core/pantry.js";
import { constraintsSummary, evidence, expectedChanges, capitalize } from "./parts.js";

export function sheetView(ctx, dialog) {
  switch (dialog.type) {
    case "slot": return slotSheet(ctx, dialog);
    case "compare": return compareSheet(ctx, dialog);
    case "save-version": return saveSheet(ctx, dialog);
    case "rename-version": return renameSheet(ctx, dialog);
    case "replace-session": return replaceSheet(ctx, dialog);
    case "discard-session": return discardSheet(ctx, dialog);
    case "plan-unsaved": return planUnsavedSheet(ctx, dialog);
    case "plan-update": return planUpdateSheet(ctx, dialog);
    case "plan-duplicate": return planDuplicateSheet(ctx, dialog);
    case "plan-linked": return planLinkedSheet(ctx, dialog);
    case "feedback": return feedbackSheet(ctx, dialog);
    case "cook-pantry": return cookPantrySheet(ctx, dialog);
    case "import-duplicate": return importDuplicateSheet(ctx, dialog);
    case "other-tab": return otherTabSheet(ctx, dialog);
    case "reset": return resetSheet();
    default: return "";
  }
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

const REASON_LABEL = { missing: "If you're out", preference: "Preference", protein: "More protein", fiber: "More fiber", dietary: "For a diet or allergy" };

function slotSheet(ctx, { recipeId, slot }) {
  const recipe = getRecipe(recipeId);
  const original = recipe.ingredients.find((i) => i.slot === slot);
  const name = shortName(original.item);
  const options = swapsForRecipe(recipeId).filter((s) => s.replace?.slot === slot || s.omit === slot);
  const s = ctx.working(recipeId);
  const reason = recipe.noSwap?.[slot];
  return html`
    ${head("Thyme for a swap.", recipe.title)}
    <div class="sheet-body">
      ${options.length ? html`
        <p class="muted">Options for ${name}, written for this dish only. Pick one to see what changes before applying it.</p>
        <ul class="option-list">
          ${options.map((x) => html`
            <li><button class="option" data-action="preview-swap" data-id="${recipeId}" data-swap="${x.id}" data-from="slot" aria-label="Preview ${x.label} for ${name}">
              <span class="option-text">
                <span class="option-label">${x.label}${s.applied.includes(x.id) ? html` <span class="tag tag--yolk">${icon("check")} Applied</span>` : ""}</span>
                <span class="small muted">${x.summary}</span>
                <span class="idea-tags">${x.reasons.map((r) => html`<span class="tag tag--cool">${REASON_LABEL[r]}</span>`)}</span>
              </span>${icon("next")}</button></li>`)}
        </ul>` : html`
        <div class="notice notice--cool"><p><strong>No tested swap for ${name} in this recipe.</strong></p><p>${reason ?? "We haven't written one, and we won't guess."}</p></div>`}
      ${options.length && reason ? html`<p class="small muted">${reason}</p>` : ""}
      ${(recipe.unsupported?.[slot] ?? []).map((u) => html`<div class="notice notice--cool"><p><strong>${u.label} instead? Not supported here.</strong></p><p>${u.reason}</p></div>`)}
    </div>`;
}

function entriesText(line) {
  if (!line || line.omitted || !line.entries.length) return "Left out";
  return line.entries.map((e) => `${formatQty(e.qty, e.unit, e.step)} ${ITEMS[e.item].name.toLowerCase()}`).join(" + ");
}

function compareSheet(ctx, { recipeId, swapId, from }) {
  const recipe = getRecipe(recipeId);
  const swap = getSwap(swapId);
  const s = ctx.working(recipeId);
  const applied = s.applied.includes(swapId);
  const check = applied ? { ok: true, blockers: [], untested: [] } : checkSwap(recipe, s, swapId);
  const removeIds = check.blockers.map((b) => b.swap.id);
  const before = deriveRecipe(recipe, applied ? removeSwap(s, swapId) : s);
  const after = deriveRecipe(recipe, applied ? s : applySwap(s, swapId, removeIds));
  const slots = new Set([...before.ingredients, ...after.ingredients].map((l) => l.slot));
  const rows = [...slots].map((slot) => {
    const b = before.ingredients.find((l) => l.slot === slot);
    const a = after.ingredients.find((l) => l.slot === slot);
    return { before: b ? entriesText(b) : null, after: a ? entriesText(a) : null };
  }).filter((r) => r.before !== r.after);
  const nb = estimate(before);
  const na = estimate(after);
  const c = ctx.constraintsFor(recipeId);
  const req = checkItems(after.ingredients.flatMap((l) => l.entries.map((e) => e.item)), c);
  const newConflicts = req.conflicts.filter((x) => !before.ingredients.some((l) => l.entries.some((e) => e.item === x.item)));

  return html`
    ${head(swap.label, applied ? "Applied to your version" : `Preview · ${recipe.title}`, from === "slot" ? "back-to-options" : null)}
    <div class="sheet-body">
      <p>${swap.summary} ${evidence("suggested")}</p>
      ${check.blockers.length ? html`
        <div class="notice" role="status">
          ${check.blockers.map((b) => html`<p><strong>Can't combine with “${b.swap.label}”.</strong> ${b.reason}</p>`)}
          <p>Applying this removes “${check.blockers.map((b) => b.swap.label).join("”, “")}”. The preview shows that result.</p>
        </div>` : ""}
      ${check.untested.length ? html`
        <div class="notice" role="status"><p><strong>Untested combination.</strong> This hasn't been written to go with ${check.untested.map((x) => `“${x.label}”`).join(" or ")}. Each works on its own; together is a guess, and it will be labelled that way.</p></div>` : check.wholeSetUntested ? html`
        <div class="notice" role="status"><p><strong>Untested combination.</strong> These pair up one at a time, but all ${s.applied.length + 1} together were never written as a set. Together is a guess, and it will be labelled that way.</p></div>` : ""}
      ${newConflicts.length ? html`<div class="notice" role="status">${newConflicts.map((x) => html`<p>${icon("info")} ${x.reason}.</p>`)}</div>` : ""}

      <section aria-labelledby="cmp-qty">
        <h3 id="cmp-qty" class="eyebrow">Ingredients, for ${after.servings}</h3>
        <ul class="diff">${rows.map((r) => html`
          <li class="diff-row"><span class="diff-before"><span class="eyebrow diff-label">Before</span>${r.before ? html`<s>${r.before}</s>` : "Not in the recipe"}</span><span class="diff-arrow">${doodle.arrow}<span class="visually-hidden">becomes</span></span><span class="diff-after"><span class="eyebrow diff-label">After</span>${r.after ?? "Removed"}</span></li>`)}</ul>
      </section>
      <section aria-labelledby="cmp-fx">
        <h3 id="cmp-fx" class="eyebrow">What changes in the dish</h3>
        ${expectedChanges([swapId], { derived: after })}
        <p class="small nut-compare">${["protein", "fiber"].map((n) => html`<span>${capitalize(n)} per serving: ${formatRange(nb[n], n)} → ${formatRange(na[n], n)} (${direction(nb[n], na[n])})</span>`)}<span class="muted">Rough estimates from prototype fixture values. ${RANGE_NOTE}</span></p>
      </section>
      ${Object.keys(swap.steps ?? {}).length || (swap.addSteps ?? []).length ? html`
        <section aria-labelledby="cmp-steps">
          <h3 id="cmp-steps" class="eyebrow">Method changes</h3>
          <ul class="step-diff">
            ${after.steps.map((st, i) => {
              const b = before.steps.find((x) => x.id === st.id);
              if (b && b.text === st.text) return "";
              return html`<li><span class="tag tag--yolk">Step ${i + 1} · ${b ? "Changed" : "Added"}</span><p>${st.text}</p>${b ? html`<p class="small muted"><span class="visually-hidden">Before: </span><s>${b.text}</s></p>` : ""}</li>`;
            })}
          </ul>
        </section>` : ""}
    </div>
    <footer class="sheet-foot">
      ${applied
        ? html`<button class="btn btn--secondary btn--block" data-action="remove-swap" data-id="${recipeId}" data-swap="${swapId}" data-close="1">${icon("undo")} Remove this change</button>`
        : html`<button class="btn btn--primary btn--block" data-action="apply-swap" data-id="${recipeId}" data-swap="${swapId}" data-remove="${removeIds.join(",")}">
            ${removeIds.length ? "Switch to this change" : check.untested.length || check.wholeSetUntested ? "Apply, untested" : "Apply to your version"}</button>`}
      <button class="btn btn--quiet" data-action="close-dialog">${applied ? "Close" : "Not now"}</button>
    </footer>`;
}

function saveSheet(ctx, { recipeId }) {
  const recipe = getRecipe(recipeId);
  const s = ctx.working(recipeId);
  const base = s.baseVersion ? ctx.state.versions[s.baseVersion] : null;
  const count = Object.values(ctx.state.versions).filter((v) => v.recipeId === recipeId).length;
  const suggested = base ? base.name : count ? `Your version ${count + 1}` : "Your version";
  return html`
    ${head("Save to your collection", recipe.title)}
    <form class="sheet-body" data-action="save-form">
      <p>Saves ${plural(s.servings, "serving")} with ${s.applied.length ? s.applied.map((id) => getSwap(id).label).join(", ") : "no ingredient changes"}. The original recipe stays as it is.</p>
      <p class="small muted">A version saves the recipe, not today's requirements. It's checked against whatever your requirements are when you cook it.</p>
      <label class="field"><span class="field-label">Name</span><input class="input" name="version-name" value="${suggested}" autocomplete="off"></label>
      ${base ? html`<p class="small muted">Saving as new with the same name gives it a numbered name instead.</p>` : ""}
      <p class="small muted">Saved in this browser on this device only, with no backup. Sharing publicly isn't part of this prototype.</p>
    </form>
    <footer class="sheet-foot">
      ${base ? html`
        <button class="btn btn--primary btn--block" data-action="confirm-save-version" data-id="${recipeId}" data-mode="update">Update “${base.name}”</button>
        <button class="btn btn--secondary btn--block" data-action="confirm-save-version" data-id="${recipeId}" data-mode="new">Save as a new version</button>
        <p class="small muted">Updating changes the version everywhere it's used. Planned meals will offer the update for review.</p>`
        : html`<button class="btn btn--primary btn--block" data-action="confirm-save-version" data-id="${recipeId}" data-mode="new">Save version</button>`}
      <button class="btn btn--quiet" data-action="close-dialog">Cancel</button>
    </footer>`;
}

function renameSheet(ctx, { versionId }) {
  const v = ctx.state.versions[versionId];
  return html`
    ${head("Rename version", getRecipe(v.recipeId).title)}
    <form class="sheet-body" data-action="rename-form">
      <label class="field"><span class="field-label">Name</span><input class="input" name="version-name" value="${v.name}" autocomplete="off"></label>
    </form>
    <footer class="sheet-foot">
      <button class="btn btn--primary btn--block" data-action="confirm-rename-version" data-vid="${versionId}">Rename</button>
      <button class="btn btn--quiet" data-action="close-dialog">Cancel</button>
    </footer>`;
}

function replaceSheet(ctx, { recipeId, from, proposal }) {
  const recipe = getRecipe(recipeId);
  const v = from ? ctx.state.versions[from] : null;
  const target = proposal ? (proposal.scenario ? "the preview" : "this proposal") : v ? `“${v.name}”` : "the original";
  return html`
    ${head("You have unsaved changes", recipe.title)}
    <div class="sheet-body">
      <p>Your current adaptation of ${recipe.title} has changes that aren't saved. Starting from ${target} replaces them. You can put them back from Saved.</p>
    </div>
    <footer class="sheet-foot">
      <a class="btn btn--primary btn--block" href="#/adapt/${recipeId}/${ctx.working(recipeId).step ?? "needs"}">Continue my changes</a>
      <button class="btn btn--secondary btn--block" data-action="confirm-replace-session" data-id="${recipeId}" data-from="${from ?? ""}">Start over from ${proposal ? target : v ? "that version" : "the original"}</button>
      <button class="btn btn--quiet" data-action="close-dialog">Cancel</button>
    </footer>`;
}

function discardSheet(ctx, { recipeId }) {
  return html`
    ${head("Discard unsaved changes?", getRecipe(recipeId).title)}
    <div class="sheet-body"><p>Your saved versions and the original aren't affected. You can put this back from Saved.</p></div>
    <footer class="sheet-foot">
      <button class="btn btn--primary btn--block" data-action="confirm-discard-session" data-id="${recipeId}">Discard changes</button>
      <button class="btn btn--quiet" data-action="close-dialog">Keep them</button>
    </footer>`;
}

function planUnsavedSheet(ctx, { recipeId }) {
  return html`
    ${head("Save before adding?", getRecipe(recipeId).title)}
    <div class="sheet-body">
      <p>Your changes aren't saved. You can save them as a version, or add this exact copy to your shopping list without saving.</p>
      <p class="small muted">Either way, the list keeps to what you add now. Later edits won't change it without asking.</p>
    </div>
    <footer class="sheet-foot">
      <button class="btn btn--primary btn--block" data-action="plan-save-and-add" data-id="${recipeId}">Save version and add</button>
      <button class="btn btn--secondary btn--block" data-action="plan-add-copy" data-id="${recipeId}">Add without saving</button>
      <button class="btn btn--quiet" data-action="close-dialog">Cancel</button>
    </footer>`;
}

function planDuplicateSheet(ctx, { planId, recipeId, intent }) {
  const entry = ctx.state.plan.find((p) => p.id === planId);
  return html`
    ${head("Already on your list", getRecipe(recipeId).title)}
    <div class="sheet-body">
      <p>This exact version, ${plural(entry.servings, "serving")}, is already a planned meal, so adding it again would double the shopping.</p>
    </div>
    <footer class="sheet-foot">
      <a class="btn btn--primary btn--block" href="#/list">View shopping list</a>
      <button class="btn btn--secondary btn--block" data-action="plan-add-another" data-intent="${JSON.stringify(intent)}">Add another meal</button>
      <button class="btn btn--quiet" data-action="close-dialog">Cancel</button>
    </footer>`;
}

function planLinkedSheet(ctx, { planId, recipeId, intent }) {
  const entry = ctx.state.plan.find((p) => p.id === planId);
  const s = ctx.working(recipeId);
  const labels = ruleLabels(entry);
  return html`
    ${head("Update your planned meal?", getRecipe(recipeId).title)}
    <div class="sheet-body">
      <p>Planned: ${labels.length ? labels.join(", ") : "as written"}, ${plural(entry.servings, "serving")}.</p>
      <p>Now: ${s.applied.length ? s.applied.map((id) => getSwap(id)?.label).join(", ") : "as written"}, ${plural(s.servings, "serving")}.</p>
      <p class="small muted">Updating recalculates this meal's lines. Edited or checked lines are flagged, not overwritten.</p>
    </div>
    <footer class="sheet-foot">
      <button class="btn btn--primary btn--block" data-action="plan-replace" data-plan="${planId}" data-id="${recipeId}">Update the planned meal</button>
      <button class="btn btn--secondary btn--block" data-action="plan-add-another" data-intent="${JSON.stringify(intent)}">Add as another meal</button>
      <button class="btn btn--quiet" data-action="close-dialog">Cancel</button>
    </footer>`;
}

function planUpdateSheet(ctx, { planId }) {
  const entry = ctx.state.plan.find((p) => p.id === planId);
  const v = ctx.state.versions[entry.versionId];
  const recipe = getRecipe(entry.recipeId);
  const label = (ids) => (ids.length ? ids.map((id) => getSwap(id).label).join(", ") : "no ingredient changes");
  const added = v.applied.filter((id) => !entry.applied.includes(id));
  const removed = entry.applied.filter((id) => !v.applied.includes(id));
  return html`
    ${head(`“${v.name}” was updated`, recipe.title)}
    <div class="sheet-body">
      <p>Planned: ${label(entry.applied)}, ${plural(entry.servings, "serving")}.</p>
      <p>Now saved as: ${label(v.applied)}.</p>
      <ul class="small">${added.map((id) => html`<li>Adds: ${getSwap(id).label}</li>`)}${removed.map((id) => html`<li>Removes: ${getSwap(id).label}</li>`)}</ul>
      <p class="small muted">Taking the update keeps your planned ${plural(entry.servings, "serving")} and recalculates this meal's shopping lines. Edited or checked lines are flagged, not overwritten.</p>
    </div>
    <footer class="sheet-foot">
      <button class="btn btn--primary btn--block" data-action="plan-accept-update" data-plan="${planId}">Use the update</button>
      <button class="btn btn--secondary btn--block" data-action="plan-keep-copy" data-plan="${planId}">Keep what I planned</button>
      <button class="btn btn--quiet" data-action="close-dialog">Decide later</button>
    </footer>`;
}

function feedbackSheet(ctx, { cookId }) {
  const rec = ctx.state.cooks.find((c) => c.id === cookId);
  const recipe = getRecipe(rec.recipeId);
  const v = rec.versionId ? ctx.state.versions[rec.versionId] : null;
  const radios = (name, opts) => html`<div class="chips radio-chips">${opts.map(([val, label]) => html`<label class="chip"><input type="radio" name="${name}" value="${val}"> ${label}</label>`)}</div>`;
  return html`
    ${head("How did it go?", `${recipe.title} · ${v ? v.name : rec.applied.length ? "unsaved version" : "as written"}`)}
    <form class="sheet-body feedback-form">
      <p class="small muted">Optional. Saved with the exact version and ${plural(rec.servings, "serving")} you cooked.</p>
      <fieldset><legend>Would you make it again?</legend>${radios("again", [["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"]])}</fieldset>
      <fieldset><legend>How close was it to the dish you know?</legend><p class="small muted">Separate from whether you liked it.</p>${radios("familiar", [["very", "Very close"], ["somewhat", "Somewhat"], ["not", "Not really"], ["na", "I don't know this dish"]])}</fieldset>
      <label class="field"><span class="field-label">What turned out differently from what you expected?</span><textarea class="input" name="differed" rows="2" placeholder="Optional"></textarea></label>
      <fieldset><legend>Did you change any ingredients beyond this version?</legend>${radios("changed", [["no", "No"], ["yes", "Yes"]])}</fieldset>
      <fieldset><legend>Did you follow the method?</legend>${radios("followed", [["yes", "Yes"], ["mostly", "Mostly"], ["no", "No"]])}</fieldset>
      ${!v && rec.applied.length ? html`<p class="small muted">This wasn't a saved version. If you'd make it again, you'll find it under Make it again, exactly as cooked.</p>` : ""}
    </form>
    <footer class="sheet-foot">
      <button class="btn btn--primary btn--block" data-action="save-feedback" data-cook="${cookId}">Save</button>
      <button class="btn btn--quiet" data-action="skip-feedback" data-cook="${cookId}">Skip</button>
    </footer>`;
}

function cookPantrySheet(ctx, { cookId }) {
  const rec = ctx.state.cooks.find((c) => c.id === cookId);
  const recipe = getRecipe(rec.recipeId);
  const rows = cookPantryReview(rec.snapshot.ingredients, ctx.state.pantry);
  const deduct = rows.filter((r) => r.action === "deduct");
  const unknown = rows.filter((r) => r.action === "unknown");
  const incomparable = rows.filter((r) => r.action === "incomparable");
  const plan = rec.planId ? ctx.state.plan.find((p) => p.id === rec.planId) : null;
  return html`
    ${head("Update pantry after cooking", `${recipe.title} · ${plural(rec.servings, "serving")}`)}
    <form class="sheet-body cook-pantry-form">
      <p>Optional. This uses exactly what you cooked. Nothing changes unless you apply it, and you can undo it.</p>
      ${deduct.length ? html`
        <fieldset><legend>Take out of your pantry</legend>
          <ul class="plain-list">${deduct.map((r) => html`<li><label class="check-row"><input type="checkbox" name="deduct" value="${r.item}" checked>
            <span><strong>${r.name}</strong>: ${amountText(r.before)} now, ${amountText(r.after)} after (used ${formatQty(r.used.qty, r.used.unit)}).</span></label></li>`)}</ul>
        </fieldset>` : html`<p class="small muted">None of the ingredients have a measured amount in your pantry, so there's nothing to take out.</p>`}
      ${unknown.length ? html`<p class="small muted"><strong>Stays unknown:</strong> ${unknown.map((r) => r.name).join(", ")}. No amount was entered, so nothing is subtracted.</p>` : ""}
      ${incomparable.length ? html`<p class="small muted"><strong>Left as is:</strong> ${incomparable.map((r) => r.name).join(", ")}. Measured in a way that can't be compared.</p>` : ""}
      ${plan ? html`<label class="check-row"><input type="checkbox" name="complete-plan" checked> <span>Mark this planned meal as cooked and take it off your plan.</span></label>` : ""}
    </form>
    <footer class="sheet-foot">
      <button class="btn btn--primary btn--block" data-action="apply-cook-pantry" data-cook="${cookId}">Update pantry</button>
      <button class="btn btn--quiet" data-action="close-dialog">Not now</button>
    </footer>`;
}

function importDuplicateSheet(ctx, { draftId, index }) {
  const d = ctx.state.drafts[draftId];
  return html`
    ${head("Already imported", d.title)}
    <div class="sheet-body"><p>You already have a ${d.status === "reference" ? "reference" : "draft"} that looks the same. Importing again makes a second, separate copy.</p></div>
    <footer class="sheet-foot">
      <a class="btn btn--primary btn--block" href="#/draft/${draftId}">Open the one I have</a>
      <button class="btn btn--secondary btn--block" data-action="import-pick" data-index="${index}" data-force="1">Import a second copy</button>
      <button class="btn btn--quiet" data-action="close-dialog">Cancel</button>
    </footer>`;
}

function otherTabSheet(ctx, { diff }) {
  return html`
    ${head("Changed in another tab", "Your saved data")}
    <div class="sheet-body">
      <p>Another tab saved changes after this one last read them. Nothing has been overwritten. Choose which to keep.</p>
      <table class="cmp-table">
        <caption class="visually-hidden">What's in this tab and in the other tab</caption>
        <thead><tr><th scope="col">In this tab</th><th scope="col">In the other tab</th></tr></thead>
        <tbody>${diff.map((d) => html`<tr class="${d.mine === d.theirs ? "" : "is-changed"}"><td>${d.label}: ${d.mine}</td><td>${d.label}: ${d.theirs}</td></tr>`)}</tbody>
      </table>
    </div>
    <footer class="sheet-foot">
      <button class="btn btn--primary btn--block" data-action="tab-use-theirs">Use the other tab's</button>
      <button class="btn btn--secondary btn--block" data-action="tab-keep-mine">Keep this tab's and replace the other's</button>
      <button class="btn btn--quiet" data-action="close-dialog">Decide later</button>
    </footer>`;
}

function resetSheet() {
  return html`
    ${head("Reset the demo?", "About this prototype")}
    <div class="sheet-body">
      <p>This clears your sessions, saved versions, imported drafts, pantry, plan, shopping list and cooking notes, then restores the demo starting state.</p>
      <p class="small muted">It only affects this browser and can't be undone.</p>
    </div>
    <footer class="sheet-foot">
      <button class="btn btn--primary btn--block" data-action="confirm-reset">Reset demo</button>
      <button class="btn btn--quiet" data-action="close-dialog">Cancel</button>
    </footer>`;
}
