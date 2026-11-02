// Import: creates a draft, not a finished recipe. Paste text (works), a link
// (demo links only, since this static prototype can't fetch other sites), or a
// screenshot (not available: no text recognition is connected). Every
// fallback keeps what was entered and says what to do next.
// The draft review shows original wording beside the proposed match and asks
// only about uncertainties that block what you want to do.

import { html, plural } from "./html.js";
import { icon, checkNote } from "./icons.js";
import { ITEMS } from "../data/items.js";
import { getRecipe } from "../data/recipes.js";
import { DEMO_LINKS, FALLBACK_TEXT } from "../core/importer.js";
import { validateDraft, draftAsDerived, ISSUE_TEXT } from "../core/normalize.js";
import { estimate, formatRange } from "../core/nutrition.js";

export function importView(ctx) {
  const { ui } = ctx;
  const tab = ui.importTab;
  return html`
    <div class="page import-page">
      <a class="back-link" href="#/">${icon("back")} Today</a>
      <header class="list-head">
        <h1 tabindex="-1" data-route-focus>Import a recipe</h1>
        <p class="muted">An import makes a draft for you to check. Nothing missing gets filled in for you.</p>
      </header>
      <div class="view-toggle" role="group" aria-label="Import from">
        ${[["paste", "Paste text"], ["link", "Link"], ["photo", "Screenshot"]].map(([k, l]) => html`<button class="view-btn" aria-pressed="${tab === k}" data-action="import-tab" data-tab="${k}">${l}</button>`)}
      </div>
      ${tab === "paste" ? html`
        <form class="import-form" data-action="import-paste">
          ${ui.importResult?.keptUrl ? html`<p class="small">Source link kept: ${ui.importResult.keptUrl}</p>` : ""}
          <label class="field"><span class="field-label">Recipe text</span>
            <textarea class="input" rows="10" data-action="import-text" placeholder="Title&#10;Serves 4&#10;Ingredients&#10;2 onions, chopped&#10;…&#10;Method&#10;1. …">${ui.importText}</textarea></label>
          <p class="small muted">Include an “Ingredients” line above the list and “Method” above the steps.</p>
          <button class="btn btn--primary" type="submit">Make a draft</button>
        </form>` : tab === "link" ? html`
        <form class="import-form" data-action="import-link">
          <label class="field"><span class="field-label">Recipe link</span><input class="input" type="url" data-action="import-url" value="${ui.importUrl}" placeholder="https://" autocomplete="off"></label>
          <button class="btn btn--primary" type="submit">Read link</button>
          <div class="demo-links">
            <p class="small"><strong>Demo links.</strong> This prototype can't open real websites, so these fictional example.com pages show how each case is handled:</p>
            <ul>${Object.entries(DEMO_LINKS).map(([url, d]) => html`<li><button type="button" class="btn btn--quiet" data-action="import-demo" data-url="${url}">${d.label}</button></li>`)}</ul>
          </div>
        </form>` : html`
        <div class="import-form">
          <div class="status status--none"><p>${FALLBACK_TEXT.screenshot}</p></div>
          <button class="btn btn--secondary" data-action="import-tab" data-tab="paste">Paste text instead</button>
        </div>`}
      ${ui.importResult ? resultView(ui.importResult) : ""}
    </div>`;
}

function resultView(res) {
  if (res.keptUrl && !res.recipes?.length && !res.problem) return "";
  if (res.problem) {
    return html`
      <div id="import-result" class="status status--none" tabindex="-1" role="status">
        <p>${FALLBACK_TEXT[res.problem] ?? FALLBACK_TEXT["no-recipe"]}</p>
        ${res.url ? html`<button class="btn btn--secondary btn--small" data-action="import-to-paste">Paste the text instead</button>` : ""}
      </div>`;
  }
  if (res.recipes.length > 1) {
    return html`
      <div id="import-result" class="status status--ask" tabindex="-1" role="status">
        <p><strong>${plural(res.recipes.length, "recipe")} found.</strong> Which one do you want as a draft?</p>
        <ul class="choices">${res.recipes.map((r, i) => html`<li><button class="btn btn--secondary btn--small" data-action="import-pick" data-index="${i}">${r.title}</button> <span class="small muted">${plural(r.ingredients.length, "ingredient line")}</span></li>`)}</ul>
      </div>`;
  }
  const r = res.recipes[0];
  return html`
    <div id="import-result" class="status status--ok" tabindex="-1" role="status">
      <p><strong>Found “${r.title}”</strong>${res.method === "structured" ? " in the page's structured recipe data" : ""}: ${plural(r.ingredients.length, "ingredient line")}, ${plural(r.steps.length, "step")}, ${r.servings ? plural(r.servings, "serving") : "servings not stated"}.</p>
      <button class="btn btn--primary btn--small" data-action="import-pick" data-index="0">Review the draft</button>
    </div>`;
}

const STATE_LABEL = { dry: "dry or uncooked", cooked: "cooked", raw: "raw" };
const ACTIONS = [
  ["nutrition", "Estimate nutrition"],
  ["scale", "Scale portions"],
  ["cook", "Cook from it"],
  ["adapt", "Supported adaptations"],
];

export function draftView(ctx, draft) {
  const checks = Object.fromEntries(ACTIONS.map(([a]) => [a, validateDraft(draft, a)]));
  const blockingIds = new Set(Object.values(checks).flatMap((c) => c.blocking.map((b) => b.line)).filter(Boolean));
  const supported = draft.supportedRecipe ? getRecipe(draft.supportedRecipe) : null;
  const est = checks.nutrition.ok ? estimate(draftAsDerived(draft)) : null;
  return html`
    <div class="page page--wide draft-page">
      <a class="back-link" href="#/saved">${icon("back")} Saved</a>
      <header class="list-head">
        <p class="eyebrow">${draft.status === "reference" ? "Saved reference" : "Imported draft"}</p>
        <label class="field"><span class="visually-hidden">Title</span><input class="input input--title" value="${draft.title}" data-action="draft-title" data-draft="${draft.id}"></label>
        <p class="small muted">${draft.source.creator ? `By ${draft.source.creator}. ` : "Creator not given. "}${draft.source.url ? html`From <span class="break">${draft.source.url}</span>${draft.source.url.includes("example.com") ? " (demo page)" : ""}. ` : "From pasted text. "}${draft.source.note}</p>
      </header>

      <section class="adapt-section draft-can" aria-labelledby="can-h">
        <h2 id="can-h">What you can do with it</h2>
        <ul class="can-list">
          <li class="can-ok">${icon("check")} <span><strong>Save as a reference.</strong> Always available, even with gaps.</span>
            ${draft.status === "reference" ? html`<span class="small muted">Saved</span>` : html`<button class="btn btn--secondary btn--small" data-action="draft-save-reference" data-draft="${draft.id}">Save</button>`}</li>
          ${ACTIONS.map(([a, label]) => {
            const c = checks[a];
            return html`<li class="${c.ok ? "can-ok" : "can-no"}">${icon(c.ok ? "check" : "info")} <span><strong>${label}.</strong>
              ${c.ok ? (a === "nutrition" && est ? ` Protein ${formatRange(est.protein)}, fiber ${formatRange(est.fiber, "fiber")} per serving (rough).` : a === "cook" ? html` <a href="#/cook/draft/${draft.id}">Open in cook mode</a>` : " Ready.")
                : ` Needs: ${[...new Set(c.blocking.map((b) => b.kind === "servings" ? "the number of servings" : b.kind === "unsupported" ? "a supported dish" : b.kind === "steps" ? "instructions" : ISSUE_TEXT[b.kind].replace(/\.$/, "").toLowerCase()))].join("; ")}.`}</span></li>`;
          })}
        </ul>
        ${supported ? html`<p class="small">This looks like <strong>${supported.title}</strong>, which has supported adaptations. <a href="#/recipe/${supported.id}">Adapt our version</a>; your import stays here as a reference.</p>` : ""}
      </section>

      <section class="adapt-section" aria-labelledby="sv-h">
        <h2 id="sv-h">Servings</h2>
        <label class="field field--inline"><span class="field-label">${draft.servingsText ? `The source says “${draft.servingsText}”.` : "The source doesn't say how many it serves."}</span>
          <input class="input input--num" type="number" min="1" step="1" inputmode="numeric" value="${draft.servings ?? ""}" placeholder="?" data-action="draft-servings" data-draft="${draft.id}"></label>
        ${!draft.servings ? html`<p class="small warn">${checkNote("without a serving count, portions can't be scaled and nutrition can't be given per serving.")}</p>` : ""}
      </section>

      <section class="adapt-section" aria-labelledby="ln-h">
        <h2 id="ln-h">Ingredients as imported</h2>
        <p class="small muted">Original wording on the left, our proposed reading on the right. Only the issues that block something are highlighted.</p>
        <ul class="draft-lines">${draft.lines.map((l) => lineRow(draft, l, blockingIds.has(l.id)))}</ul>
      </section>

      <section class="adapt-section" aria-labelledby="st-h">
        <h2 id="st-h">Method as imported</h2>
        ${draft.steps.length ? html`<ol class="steps">${draft.steps.map((s) => html`<li class="step"><p>${s}</p></li>`)}</ol>` : html`<p class="warn small">${checkNote("They aren't written in for you.", "No instructions were found.")}</p>`}
      </section>
      <button class="btn btn--quiet" data-action="draft-delete" data-draft="${draft.id}">Delete this import</button>
    </div>`;
}

function lineRow(draft, l, blocking) {
  const m = l.match;
  const qtyText = l.qty != null ? `${l.qty}${l.qtyMax ? `–${l.qtyMax}` : ""}${l.unit ? ` ${l.unit}` : ""}` : l.vagueUnit ? `“${l.vagueUnit}”` : "no amount";
  const options = m.confidence === "ambiguous" ? m.candidates : Object.keys(ITEMS).filter((k) => !ITEMS[k].noShop).sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name));
  return html`
    <li class="draft-line ${blocking ? "is-blocking" : ""} ${l.omitted ? "is-omitted" : ""}">
      <div class="dl-orig"><span class="dl-raw">${l.raw}</span>${l.optional ? html`<span class="tag">optional</span>` : ""}</div>
      <div class="dl-read small">
        ${l.omitted ? html`<span class="muted">Left out of calculations.</span> <button class="btn btn--quiet" data-action="draft-unomit" data-draft="${draft.id}" data-line="${l.id}">Include</button>` : html`
          <span>${qtyText} · ${m.item ? ITEMS[m.item].name : m.confidence === "ambiguous" ? "which one?" : "not matched"}${l.state ? ` · ${STATE_LABEL[l.state]}` : ""}${l.prep ? ` · ${l.prep}` : ""}</span>
          ${l.issues.filter((i) => i !== "range").map((i) => html`<span class="dl-issue ${blocking ? "warn" : "muted"}">${blocking ? checkNote(i === "ambiguous" && m.why ? m.why : ISSUE_TEXT[i]) : i === "ambiguous" && m.why ? m.why : ISSUE_TEXT[i]}</span>`)}
          ${l.issues.includes("range") ? html`<span class="muted">${ISSUE_TEXT.range}</span>` : ""}
          ${blocking ? html`
            <div class="dl-fix">
              ${l.issues.includes("ambiguous") || l.issues.includes("unmatched") ? html`
                <label><span class="visually-hidden">Match for ${l.raw}</span><select class="select select--small" data-action="draft-match" data-draft="${draft.id}" data-line="${l.id}">
                  <option value="">${m.confidence === "ambiguous" ? "Choose which" : "Not in our list"}</option>
                  ${options.map((k) => html`<option value="${k}" ${m.item === k ? "selected" : ""}>${ITEMS[k].name}</option>`)}</select></label>` : ""}
              ${l.issues.includes("no-quantity") || l.issues.includes("vague-unit") ? html`
                <label class="have-qty"><span class="visually-hidden">Amount for ${l.raw}</span><input class="input input--num" type="number" min="0" step="any" value="${l.qty ?? ""}" placeholder="amount" data-action="draft-qty" data-draft="${draft.id}" data-line="${l.id}"></label>
                <label><span class="visually-hidden">Unit for ${l.raw}</span><select class="select select--small" data-action="draft-unit" data-draft="${draft.id}" data-line="${l.id}">
                  ${["", "g", "kg", "ml", "l", "tsp", "tbsp", "cup"].map((u) => html`<option value="${u}" ${(l.unit ?? "") === u && !l.vagueUnit ? "selected" : ""}>${u || "count"}</option>`)}</select></label>` : ""}
              ${l.issues.includes("state") ? html`${["dry", "cooked"].map((st) => html`<button class="btn btn--quiet" data-action="draft-state" data-draft="${draft.id}" data-line="${l.id}" data-value="${st}">${st === "dry" ? "Uncooked" : "Cooked"}</button>`)}` : ""}
              <button class="btn btn--quiet" data-action="draft-omit" data-draft="${draft.id}" data-line="${l.id}">Leave out</button>
            </div>` : ""}`}
      </div>
    </li>`;
}
