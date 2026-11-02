// Saved: your private collection. Versions you chose to save (with what they
// came from), bookmarked originals, imported drafts and references, and what
// you've cooked with your notes. Publishing publicly is a later phase and is
// not shown as if it existed.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { getRecipe } from "../data/recipes.js";
import { lineage, ruleLabels, recordStatus } from "../core/versions.js";
import { recipeImage } from "./parts.js";

const AGAIN = { yes: "Would make again", maybe: "Maybe again", no: "Wouldn't make again" };
const FAMILIAR = { very: "very close to the dish they know", somewhat: "somewhat close", not: "not close", na: "new to them" };

export function savedView(ctx) {
  const { state } = ctx;
  const versions = Object.values(state.versions).sort((a, b) => b.updatedAt - a.updatedAt);
  const drafts = Object.values(state.drafts).sort((a, b) => b.source.importedAt - a.source.importedAt);
  const bookmarks = state.saved.map(getRecipe).filter(Boolean);
  const cooks = [...state.cooks].sort((a, b) => b.cookedAt - a.cookedAt).slice(0, 8);
  const empty = !versions.length && !drafts.length && !bookmarks.length && !cooks.length && !(state.recovery ?? []).length;
  return html`
    <div class="page saved-page">
      <header class="list-head">
        <h1 tabindex="-1" data-route-focus>Saved</h1>
        <p class="muted">Kept in this browser on this device only. There's no account or backup, so clearing browser data removes it.</p>
      </header>
      ${empty ? html`<div class="empty"><p>Nothing saved yet. Adapt a recipe and choose Save version, or bookmark a recipe.</p><a class="btn btn--secondary" href="#/recipes">Browse recipes</a></div>` : ""}

      ${versions.length ? html`
        <section class="adapt-section" aria-labelledby="sv-h">
          <h2 id="sv-h">Your versions</h2>
          <ul class="row-list">${versions.map((v) => {
            const r = getRecipe(v.recipeId);
            const cooked = state.cooks.filter((c) => c.versionId === v.id);
            const last = cooked.sort((a, b) => b.cookedAt - a.cookedAt)[0];
            return html`
              <li class="saved-version">
                ${recipeImage(r, { size: "thumb", credit: false })}
                <div class="row-text">
                  <span class="row-title">${v.name}</span>
                  <span class="small">${r.title} · ${plural(v.servings, "serving")}</span>
                  <span class="small muted">${v.applied.length ? ruleLabels(v).join(", ") : "No ingredient changes"}</span>
                  ${!recordStatus(v).intact ? html`<span class="small warn">The catalogue changed since this was saved. Its saved record is unchanged.</span>` : ""}
                  <span class="small muted">${lineage(v, state.versions)}${v.rev > 1 ? ` · updated ${v.rev - 1}×` : ""}${cooked.length ? ` · cooked ${plural(cooked.length, "time")}` : ""}${last?.feedback?.again ? ` · ${AGAIN[last.feedback.again].toLowerCase()}` : ""}</span>
                  <span class="row-actions">
                    <button class="btn btn--secondary btn--small" data-action="start-adapt" data-id="${r.id}" data-from="${v.id}" aria-label="Make ${v.name} again">Make again</button>
                    <button class="btn btn--quiet" data-action="plan-add-version" data-vid="${v.id}" aria-label="Add ${v.name} to your shopping list">Add to list</button>
                    <button class="btn btn--quiet" data-action="rename-version" data-vid="${v.id}" aria-label="Rename ${v.name}">Rename</button>
                    <button class="btn btn--quiet" data-action="delete-version" data-vid="${v.id}" aria-label="Remove ${v.name}">Remove</button>
                  </span>
                </div>
              </li>`;
          })}</ul>
        </section>` : ""}

      ${drafts.length ? html`
        <section class="adapt-section" aria-labelledby="dr-h">
          <h2 id="dr-h">Imported</h2>
          <ul class="row-list">${drafts.map((d) => html`
            <li><a class="row-link" href="#/draft/${d.id}">
              <span class="row-text">
                <span class="row-title">${d.title}</span>
                <span class="small muted break">${d.status === "reference" ? "Reference" : "Draft"}${d.source.creator ? ` · by ${d.source.creator}` : ""}${d.source.url ? ` · ${d.source.url.replace(/^https?:\/\//, "")}` : " · pasted text"}</span>
              </span>${icon("next")}</a></li>`)}</ul>
        </section>` : ""}

      ${bookmarks.length ? html`
        <section class="adapt-section" aria-labelledby="bm-h">
          <h2 id="bm-h">Bookmarked recipes</h2>
          <ul class="row-list">${bookmarks.map((r) => html`
            <li><a class="row-link" href="#/recipe/${r.id}">${recipeImage(r, { size: "thumb", credit: false })}<span class="row-text"><span class="row-title">${r.title}</span><span class="small muted">${r.subtitle}</span></span>${icon("next")}</a></li>`)}</ul>
        </section>` : ""}

      ${cooks.length ? html`
        <section class="adapt-section" aria-labelledby="ck-h">
          <h2 id="ck-h">Cooked</h2>
          <ul class="row-list">${cooks.map((c) => {
            const r = getRecipe(c.recipeId);
            const v = c.versionId ? state.versions[c.versionId] : null;
            const f = c.feedback;
            return html`<li class="cook-log">
              <span class="row-title">${r.title}</span>
              <span class="small">${v ? v.name : c.applied.length ? `Unsaved: ${ruleLabels(c).join(", ")}` : "As written"} · ${plural(c.servings, "serving")} · ${new Date(c.cookedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              ${v && c.applied.length ? html`<span class="small muted">${ruleLabels(c).join(", ")}</span>` : ""}
              ${f ? html`<span class="small muted">${[f.again && AGAIN[f.again], f.familiar && `Felt ${FAMILIAR[f.familiar]}`, f.changedIngredients === "yes" && "Changed ingredients", f.followedMethod && f.followedMethod !== "yes" && `Followed the method ${f.followedMethod === "mostly" ? "mostly" : "loosely"}`].filter(Boolean).join(" · ")}</span>
                ${f.differed ? html`<span class="small">“${f.differed}”</span>` : ""}` : html`<span class="small muted">No notes</span>`}
              ${c.madeUnder ? html`<span class="small muted">Made under: ${c.madeUnder}</span>` : ""}
              <span class="row-actions">
                <button class="btn btn--secondary btn--small" data-action="repeat-cook" data-cook="${c.id}" aria-label="Make ${r.title} again, ${plural(c.servings, "serving")}">Make again</button>
                ${c.pantryUpdate ? html`<span class="small muted">Pantry updated</span>` : html`<button class="btn btn--quiet" data-action="review-cook-pantry" data-cook="${c.id}" aria-label="Update pantry after cooking ${r.title}">Update pantry</button>`}
              </span>
            </li>`;
          })}</ul>
        </section>` : ""}

      ${(state.recovery ?? []).length ? html`
        <section class="adapt-section" aria-labelledby="rec-h">
          <h2 id="rec-h">Recently removed</h2>
          <p class="small muted">Put back anything here, whenever you like. Each one restores only that item, so nothing done since is undone.</p>
          <ul class="row-list recovery-list">${state.recovery.map((r) => html`
            <li class="row-split"><span class="row-text"><span class="small">${r.label}</span><span class="small muted">${new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></span>
              <button class="btn btn--quiet" data-action="recover" data-rid="${r.id}" aria-label="Put back: ${r.label}">Put back</button></li>`)}</ul>
        </section>` : ""}

      ${(state.skipped ?? []).length ? html`
        <section class="adapt-section" aria-labelledby="skip-h">
          <h2 id="skip-h">Records we couldn't open</h2>
          <p class="small muted">These couldn't be used when your saved data was read. They're kept here, not deleted.</p>
          <ul class="plain-list small">${state.skipped.map((x) => html`<li><strong>${x.kind}</strong>${x.id && x.id !== x.kind ? ` (${x.id})` : ""}: ${x.reason}.</li>`)}</ul>
          <a class="btn btn--quiet" href="#/recovery">See the recovery text</a>
        </section>` : ""}
    </div>`;
}
