// Saved: your private collection. Versions you chose to save (with what they
// came from), bookmarked originals, imported drafts and references, and what
// you've cooked with your notes. Publishing publicly is a later phase and is
// not shown as if it existed.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { getRecipe } from "../data/recipes.js";
import { getSwap } from "../data/swaps.js";
import { lineage } from "../core/versions.js";
import { recipeImage } from "./parts.js";

const AGAIN = { yes: "Would make again", maybe: "Maybe again", no: "Wouldn't make again" };
const FAMILIAR = { very: "very close to the dish they know", somewhat: "somewhat close", not: "not close", na: "new to them" };

export function savedView(ctx) {
  const { state } = ctx;
  const versions = Object.values(state.versions).sort((a, b) => b.updatedAt - a.updatedAt);
  const drafts = Object.values(state.drafts).sort((a, b) => b.source.importedAt - a.source.importedAt);
  const bookmarks = state.saved.map(getRecipe).filter(Boolean);
  const cooks = [...state.cooks].sort((a, b) => b.cookedAt - a.cookedAt).slice(0, 8);
  const empty = !versions.length && !drafts.length && !bookmarks.length && !cooks.length;
  return html`
    <div class="page saved-page">
      <header class="list-head">
        <h1 tabindex="-1" data-route-focus>Saved</h1>
        <p class="muted">Private to this device.</p>
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
                  <span class="small muted">${v.applied.length ? v.applied.map((id) => getSwap(id)?.label).join(", ") : "No ingredient changes"}</span>
                  <span class="small muted">${lineage(v, state.versions)}${v.rev > 1 ? ` · updated ${v.rev - 1}×` : ""}${cooked.length ? ` · cooked ${plural(cooked.length, "time")}` : ""}${last?.feedback?.again ? ` · ${AGAIN[last.feedback.again].toLowerCase()}` : ""}</span>
                  <span class="row-actions">
                    <button class="btn btn--secondary btn--small" data-action="start-adapt" data-id="${r.id}" data-from="${v.id}">Make again</button>
                    <button class="btn btn--quiet" data-action="plan-add-version" data-vid="${v.id}">Add to list</button>
                    <button class="btn btn--quiet" data-action="rename-version" data-vid="${v.id}">Rename</button>
                    <button class="btn btn--quiet" data-action="delete-version" data-vid="${v.id}">Remove</button>
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
                <span class="small muted">${d.status === "reference" ? "Reference" : "Draft"}${d.source.creator ? ` · by ${d.source.creator}` : ""}${d.source.url ? ` · ${d.source.url.replace(/^https?:\/\//, "")}` : " · pasted text"}</span>
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
              <span class="small">${v ? v.name : c.applied.length ? "An unsaved version" : "As written"} · ${plural(c.servings, "serving")} · ${new Date(c.cookedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              ${f ? html`<span class="small muted">${[f.again && AGAIN[f.again], f.familiar && `Felt ${FAMILIAR[f.familiar]}`, f.changedIngredients === "yes" && "Changed ingredients", f.followedMethod && f.followedMethod !== "yes" && `Followed the method ${f.followedMethod === "mostly" ? "mostly" : "loosely"}`].filter(Boolean).join(" · ")}</span>
                ${f.differed ? html`<span class="small">“${f.differed}”</span>` : ""}` : html`<span class="small muted">No notes</span>`}
            </li>`;
          })}</ul>
        </section>` : ""}
    </div>`;
}
