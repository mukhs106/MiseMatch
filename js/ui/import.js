// Import: creates a draft, not a finished recipe. Paste text (works), a link
// (demo links only, since this static prototype can't fetch other sites), or a
// screenshot (not available: no text recognition is connected). Every
// fallback keeps what was entered and says what to do next.
// The draft review shows original wording beside the proposed reading. Every row
// can be edited, and every issue that blocks something has a real action: correct
// it, keep it as unknown, leave it out of calculations, or save the import as a reference.

import { html, plural } from "./html.js";
import { icon, checkNote } from "./icons.js";
import { ITEMS } from "../data/items.js";
import { getRecipe } from "../data/recipes.js";
import { DEMO_LINKS, FALLBACK_TEXT } from "../core/importer.js";
import { validateDraft, draftAsDerived, ISSUE_TEXT, INPUT_LIMITS, stateAlternative } from "../core/normalize.js";
import { searchIngredients } from "../core/search.js";
import { estimate, formatRange, RANGE_NOTE } from "../core/nutrition.js";
import { formatQty } from "../core/units.js";
import { fieldError, stepper } from "./parts.js";

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
        ${[["paste", "Paste text"], ["link", "Link (demo only)"], ["photo", "Screenshot (unavailable)"]].map(([k, l]) => html`<button class="view-btn" aria-pressed="${tab === k}" data-action="import-tab" data-tab="${k}">${l}</button>`)}
      </div>
      ${tab === "paste" ? html`
        <form class="import-form" data-action="import-paste">
          ${ui.importKeptUrl ? html`<p class="small break">Source link kept: ${ui.importKeptUrl}</p>` : ""}
          <label class="field"><span class="field-label">Recipe text</span>
            <textarea class="input" rows="10" data-action="import-text" maxlength="${INPUT_LIMITS.text}" placeholder="Title&#10;Serves 4&#10;Ingredients&#10;2 onions, chopped&#10;…&#10;Method&#10;1. …">${ui.importText}</textarea></label>
          <p class="small muted">Include an “Ingredients” line above the list and “Method” above the steps. Up to ${INPUT_LIMITS.text.toLocaleString()} characters and ${INPUT_LIMITS.lines} ingredient lines.</p>
          <button class="btn btn--primary" type="submit">Preview the draft</button>
        </form>` : tab === "link" ? html`
        <form class="import-form" data-action="import-link">
          <p class="small"><strong>This prototype can't open real websites.</strong> A real link is kept as the source, and you paste the text. The demo links below are fictional example.com pages showing how each case is handled.</p>
          <label class="field"><span class="field-label">Recipe link</span><input class="input" type="url" data-action="import-url" value="${ui.importUrl}" maxlength="${INPUT_LIMITS.url}" placeholder="https://" autocomplete="off"></label>
          <button class="btn btn--primary" type="submit">Read link</button>
          <div class="demo-links">
            <p class="small"><strong>Demo links</strong></p>
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

function preview(r) {
  const lines = r.ingredients.map((i) => (typeof i === "string" ? i : i.raw));
  return html`
    <details class="more" data-open-key="import-preview-${r.title}">
      <summary class="small">See what was found</summary>
      <p class="small"><strong>Ingredients</strong>${r.sections?.length ? ` (parts: ${r.sections.join(", ")})` : ""}</p>
      <ul class="plain-list small">${lines.map((l) => html`<li class="break">${l}</li>`)}</ul>
      <p class="small"><strong>Method</strong></p>
      ${r.steps.length ? html`<ol class="small">${r.steps.map((t) => html`<li class="break">${t}</li>`)}</ol>` : html`<p class="small muted">No instructions were found. They won't be written in for you.</p>`}
    </details>`;
}

function resultView(res) {
  if (res.problem) {
    return html`
      <div id="import-result" class="status status--none" tabindex="-1" role="status">
        <p>${FALLBACK_TEXT[res.problem] ?? FALLBACK_TEXT["no-recipe"]}</p>
        ${res.url ? html`<button class="btn btn--secondary btn--small" data-action="import-to-paste">Paste the text instead</button>` : ""}
      </div>`;
  }
  const truncated = res.truncated ? html`<p class="small warn">${checkNote(`only the first ${INPUT_LIMITS.text.toLocaleString()} characters were read.`)}</p>` : "";
  if (res.recipes.length > 1) {
    return html`
      <div id="import-result" class="status status--ask" tabindex="-1" role="status">
        ${truncated}
        <p><strong>${plural(res.recipes.length, "recipe")} found, or one recipe in ${res.recipes.length} parts.</strong> Which one do you want as a draft?</p>
        <ul class="choices">${res.recipes.map((r, i) => html`<li><button class="btn btn--secondary btn--small" data-action="import-pick" data-index="${i}" aria-label="Make a draft of ${r.title}">${r.title}</button> <span class="small muted">${plural(r.ingredients.length, "ingredient line")}, ${plural(r.steps.length, "step")}</span>${preview(r)}</li>`)}</ul>
        <button class="btn btn--quiet" data-action="import-combine">These are parts of one recipe</button>
      </div>`;
  }
  const r = res.recipes[0];
  return html`
    <div id="import-result" class="status status--ok" tabindex="-1" role="status">
      ${truncated}
      <p><strong>Found “${r.title}”</strong>${res.method === "structured" ? " in the page's structured recipe data" : ""}: ${plural(r.ingredients.length, "ingredient line")}, ${plural(r.steps.length, "step")}, ${r.yield?.text ? `“${r.yield.text}”` : "servings not stated"}.</p>
      ${preview(r)}
      <button class="btn btn--primary btn--small" data-action="import-pick" data-index="0">Make the draft</button>
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
  const target = draft.targetServings ?? draft.servings;
  const derived = draft.servings ? draftAsDerived(draft, target) : null;
  const est = checks.nutrition.ok && derived ? estimate(derived) : null;
  const scaled = draft.servings && target !== draft.servings;
  const y = draft.yield ?? {};
  return html`
    <div class="page page--wide draft-page">
      <a class="back-link" href="#/saved">${icon("back")} Saved</a>
      <header class="list-head">
        <p class="eyebrow">${draft.status === "reference" ? "Saved reference" : "Imported draft"}</p>
        <h1 tabindex="-1" data-route-focus class="break">${draft.title}</h1>
        <label class="field"><span class="field-label small">Edit the title</span><input class="input" value="${draft.title}" maxlength="${INPUT_LIMITS.title}" data-action="draft-title" data-draft="${draft.id}"></label>
        <p class="small muted break">${draft.source.creator ? `By ${draft.source.creator}. ` : "Creator not given. "}${draft.source.url ? html`From <span class="break">${draft.source.url}</span>${draft.source.url.includes("example.com") ? " (demo page)" : ""}. ` : "From pasted text. "}${draft.source.note}</p>
        ${draft.rawText ? html`<details class="more" data-open-key="raw-${draft.id}"><summary class="small">Original text as pasted</summary><pre class="raw-text small break">${draft.rawText}</pre></details>` : ""}
      </header>

      <section class="adapt-section draft-can" aria-labelledby="can-h">
        <h2 id="can-h">What you can do with it</h2>
        <ul class="can-list">
          <li class="can-ok">${icon("check")} <span><strong>Save as a reference.</strong> Always available, even with gaps.</span>
            ${draft.status === "reference" ? html`<span class="small muted">Saved</span>` : html`<button class="btn btn--secondary btn--small" data-action="draft-save-reference" data-draft="${draft.id}">Save</button>`}</li>
          ${ACTIONS.map(([a, label]) => {
            const c = checks[a];
            return html`<li class="${c.ok ? "can-ok" : "can-no"}">${icon(c.ok ? "check" : "info")} <span><strong>${label}.</strong>
              ${c.ok ? (a === "nutrition" && est ? ` Protein ${formatRange(est.protein)}, fiber ${formatRange(est.fiber, "fiber")} per serving at ${plural(target, "serving")}. ${RANGE_NOTE}${est.protein.incomplete || est.fiber.incomplete ? " “Can't estimate” means a line is kept as unknown." : ""}` : a === "cook" ? html` <a href="#/cook/draft/${draft.id}">Open in cook mode</a>` : a === "scale" ? " Use Make for, under Servings." : " Ready.")
                : ` Needs: ${[...new Set(c.blocking.map((b) => b.kind === "servings" ? "the number of servings" : b.kind === "unsupported" ? "a supported dish" : b.kind === "steps" ? "instructions" : ISSUE_TEXT[b.kind].replace(/\.$/, "").toLowerCase()))].join("; ")}.`}</span></li>`;
          })}
        </ul>
        ${supported ? html`<p class="small">This looks like <strong>${supported.title}</strong>, which has supported adaptations. Adapting uses our own recipe, ratios and method, not this import's. <a href="#/recipe/${supported.id}">See our version</a>; your import stays here unchanged.</p>` : ""}
      </section>

      <section class="adapt-section" aria-labelledby="sv-h">
        <h2 id="sv-h">Servings</h2>
        <label class="field field--inline"><span class="field-label">How many the source makes${draft.servingsText ? html` (it says “${draft.servingsText}”)` : " (it doesn't say)"}</span>
          <input class="input input--num" type="text" inputmode="numeric" value="${ctx.ui.fieldErrors[`draft-servings:${draft.id}`]?.value ?? draft.servings ?? ""}" placeholder="?" data-action="draft-servings" data-draft="${draft.id}"></label>
        ${fieldError(ctx.ui.fieldErrors[`draft-servings:${draft.id}`]?.message, `sv-err-${draft.id}`)}
        ${y.issue === "range" && !draft.servings ? html`<p class="small">The source gives a range. Which should calculations use? ${y.range.map((n) => html`<button class="btn btn--quiet" data-action="draft-yield" data-draft="${draft.id}" data-value="${n}">${n}</button>`)}</p>` : ""}
        ${y.issue === "fraction" && !draft.servings ? html`<p class="small">The source gives a fractional yield. Enter a whole number of servings for calculations.</p>` : ""}
        ${y.issue === "too-large" && !draft.servings ? html`<p class="small">That isn't a usable serving count, so it isn't used. Up to 100 servings can be calculated.</p>` : ""}
        ${!draft.servings ? html`<p class="small warn">${checkNote("without a serving count, portions can't be scaled and nutrition can't be given per serving.")}</p>` : html`
          <div class="servings-row">
            <div><h3 id="target-h" class="h3">Make for</h3>
              <p class="small muted">This scales the amounts here. It doesn't change what the source says it makes.</p></div>
            ${stepper({ label: "servings", value: target, min: 1, max: 100, action: "draft-target", data: { draft: draft.id }, labelId: "target-h" })}
          </div>`}
      </section>

      <section class="adapt-section" aria-labelledby="ln-h">
        <h2 id="ln-h">Ingredients as imported</h2>
        <p class="small muted">Original wording first, then our reading. Every row can be edited, and your import's wording stays as it was.</p>
        <ul class="draft-lines">${draft.lines.map((l) => lineRow(ctx, draft, l, blockingIds.has(l.id), scaled ? derived : null))}</ul>
      </section>

      <section class="adapt-section" aria-labelledby="st-h">
        <h2 id="st-h">Method as imported</h2>
        ${draft.steps.length ? html`<ol class="steps">${draft.steps.map((s) => html`<li class="step"><p class="break">${s}</p></li>`)}</ol>` : html`<p class="warn small">${checkNote("They aren't written in for you.", "No instructions were found.")}</p>`}
      </section>
      <button class="btn btn--quiet" data-action="draft-delete" data-draft="${draft.id}">Delete this import</button>
    </div>`;
}

const UNITS = ["", "g", "kg", "ml", "l", "tsp", "tbsp", "cup", "cloves"];
const allItems = () => Object.keys(ITEMS).filter((k) => !ITEMS[k].noShop).sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name));

function readQty(l) {
  if (l.split?.length) return l.split.map((p) => `${p.qty} ${p.unit} ${ITEMS[p.item]?.name.toLowerCase()}`).join(" + ");
  if (l.pack && l.needsDrained && l.qty == null) return `${l.pack.count} × ${l.pack.size} ${l.pack.unit} ${l.pack.label}, drained amount not given`;
  if (l.qty != null) return `${l.qty}${l.qtyMax ? `–${l.qtyMax}` : ""}${l.unit ? ` ${l.unit}` : ""}${l.pack?.basis === "drained" ? " drained" : ""}`;
  return l.vagueUnit ? `“${l.vagueUnit}”` : "no amount";
}

function lineRow(ctx, draft, l, blocking, scaledDerived) {
  const m = l.match;
  const label = l.raw;
  const excluded = l.excluded || l.omitted;
  const data = { draft: draft.id, line: l.id };
  const openKey = `edit-${draft.id}-${l.id}`;
  const err = ctx.ui.fieldErrors[`draft:${draft.id}:${l.id}`];
  const errId = `dl-err-${l.id}`;
  const alt = l.issues.includes("state-mismatch") ? stateAlternative(m.item, l.state) : null;
  const scaled = scaledDerived?.ingredients.find((i) => i.slot === l.id)?.entries;
  const matchOptions = m.confidence === "ambiguous" || m.confidence === "compound" ? m.candidates : [...new Set([...searchIngredients(l.name, { limit: 5 }).map((h) => h.id), ...allItems()])];
  const matchSelect = (placeholder) => html`
    <label><span class="visually-hidden">Match for ${label}</span><select class="select select--small" data-action="draft-match" data-draft="${draft.id}" data-line="${l.id}">
      <option value="">${placeholder}</option>
      ${matchOptions.map((k) => html`<option value="${k}" ${m.item === k ? "selected" : ""}>${ITEMS[k].name}</option>`)}</select></label>`;
  const qtyControls = html`
    <label class="have-qty"><span class="visually-hidden">Amount for ${label}</span><input class="input input--num" type="text" inputmode="decimal" value="${err?.value ?? l.qty ?? ""}" placeholder="amount" data-action="draft-qty" data-draft="${draft.id}" data-line="${l.id}" ${err ? html`aria-invalid="true" aria-describedby="${errId}"` : ""}></label>
    <label><span class="visually-hidden">Unit for ${label}</span><select class="select select--small" data-action="draft-unit" data-draft="${draft.id}" data-line="${l.id}">
      ${UNITS.map((u) => html`<option value="${u}" ${(l.unit ?? "") === u && !l.vagueUnit ? "selected" : ""}>${u || "count"}</option>`)}</select></label>`;
  const keepUnknown = html`<button class="btn btn--quiet" data-action="draft-keep-unknown" data-draft="${draft.id}" data-line="${l.id}" aria-label="Keep ${label} as unknown in estimates">Keep as unknown</button>`;
  const omit = html`<button class="btn btn--quiet" data-action="draft-omit" data-draft="${draft.id}" data-line="${l.id}" aria-label="Leave ${label} out of calculations">Leave out of calculations</button>`;
  return html`
    <li class="draft-line ${blocking ? "is-blocking" : ""} ${excluded ? "is-omitted" : ""} ${l.removed ? "is-removed" : ""}">
      <div class="dl-orig"><span class="dl-raw break">${l.removed ? html`<s>${l.raw}</s>` : l.raw}</span>${l.optional ? html`<span class="tag">optional</span>` : ""}${l.section && l.section !== "Ingredients" ? html`<span class="small muted">${l.section}</span>` : ""}</div>
      <div class="dl-read small">
        ${l.removed ? html`<span class="muted">Removed from the recipe. The method may still mention it.</span> <button class="btn btn--quiet" data-action="draft-restore" data-draft="${draft.id}" data-line="${l.id}" aria-label="Put ${label} back in the recipe">Put back</button>` : excluded ? html`<span class="muted">Left out of calculations. Still in the recipe and in cook mode.</span> <button class="btn btn--quiet" data-action="draft-unomit" data-draft="${draft.id}" data-line="${l.id}" aria-label="Count ${label} in calculations">Include</button>` : html`
          <span>${readQty(l)} · ${m.item ? ITEMS[m.item].name : m.confidence === "ambiguous" ? "which one?" : m.confidence === "compound" ? "a mixture" : "not matched"}${l.state ? ` · ${STATE_LABEL[l.state]}` : ""}${l.prep ? ` · ${l.prep}` : ""}${scaled?.[0]?.qty != null ? html` · <strong>${formatQty(scaled[0].qty, scaled[0].unit)} for ${plural(scaledDerived.servings, "serving")}</strong>` : ""}</span>
          ${l.calc === "unknown" ? html`<span class="muted">Kept as unknown: estimates say they can't count this line. <button class="btn btn--quiet" data-action="draft-unknown-off" data-draft="${draft.id}" data-line="${l.id}" aria-label="Stop keeping ${label} as unknown">Undo</button></span>` : ""}
          ${l.issues.filter((i) => i !== "range" && l.calc !== "unknown").map((i) => html`<span class="dl-issue ${blocking ? "warn" : "muted"}">${blocking ? checkNote((i === "ambiguous" || i === "compound") && m.why ? m.why : ISSUE_TEXT[i]) : (i === "ambiguous" || i === "compound") && m.why ? m.why : ISSUE_TEXT[i]}</span>`)}
          ${l.issues.includes("range") ? html`<span class="muted">${ISSUE_TEXT.range}</span>` : ""}
          ${blocking ? html`
            <div class="dl-fix">
              ${l.issues.includes("ambiguous") || l.issues.includes("unmatched") ? matchSelect(m.confidence === "ambiguous" ? "Choose which" : "Not in our list") : ""}
              ${l.issues.includes("compound") ? splitForm(l, data) : ""}
              ${l.issues.includes("drained-unknown") ? html`
                <label class="have-qty"><span class="field-label small">Drained amount for ${label}</span><input class="input input--num" type="text" inputmode="decimal" placeholder="amount" data-action="draft-drained" data-draft="${draft.id}" data-line="${l.id}"></label>
                <span>${l.pack.unit}</span>` : ""}
              ${l.issues.includes("no-quantity") || l.issues.includes("vague-unit") || l.issues.includes("invalid-quantity") || l.issues.includes("signed-quantity") ? qtyControls : ""}
              ${l.issues.includes("state") ? html`${["dry", "cooked"].map((st) => html`<button class="btn btn--quiet" data-action="draft-state" data-draft="${draft.id}" data-line="${l.id}" data-value="${st}" aria-label="${label}: ${st === "dry" ? "the amount is uncooked" : "the amount is cooked"}">${st === "dry" ? "Uncooked" : "Cooked"}</button>`)}` : ""}
              ${l.issues.includes("state-mismatch") ? html`
                ${alt ? html`<button class="btn btn--quiet" data-action="draft-state-alt" data-draft="${draft.id}" data-line="${l.id}" data-item="${alt}">Use ${ITEMS[alt].name}</button>` : ""}
                ${matchSelect("Match a different ingredient")}
                <label class="have-qty"><span class="field-label small">Or the amount uncooked, if you know it</span>${qtyControls}</label>
                <button class="btn btn--quiet" data-action="draft-state" data-draft="${draft.id}" data-line="${l.id}" data-value="dry">That amount is uncooked</button>` : ""}
              ${keepUnknown}
              ${omit}
            </div>` : ""}
          ${err ? fieldError(err.message, errId) : ""}
          <details class="more line-match" data-open-key="${openKey}" ${ctx.ui.open[openKey] ? "open" : ""}>
            <summary class="small">Edit<span class="visually-hidden"> ${label}</span></summary>
            <div class="dl-fix">
              ${matchSelect("Not in our list")}
              ${qtyControls}
              <label><span class="visually-hidden">State of ${label}</span><select class="select select--small" data-action="draft-state-select" data-draft="${draft.id}" data-line="${l.id}">
                ${[["", "State not stated"], ["raw", "Raw"], ["dry", "Dry or uncooked"], ["cooked", "Cooked"]].map(([v, t]) => html`<option value="${v}" ${(l.state ?? "") === v ? "selected" : ""}>${t}</option>`)}</select></label>
              <label class="check-row"><input type="checkbox" ${l.optional ? "checked" : ""} data-action="draft-optional" data-draft="${draft.id}" data-line="${l.id}"> <span>Optional</span></label>
              ${blocking ? "" : omit}
              <button class="btn btn--quiet" data-action="draft-remove" data-draft="${draft.id}" data-line="${l.id}" aria-label="Remove ${label} from the recipe">Remove from recipe</button>
              <button class="btn btn--quiet" data-action="draft-reset" data-draft="${draft.id}" data-line="${l.id}" aria-label="Reset ${label} to how it was imported">Reset to import</button>
            </div>
          </details>`}
      </div>
    </li>`;
}

// Splitting a mixture takes amounts the person states. Without them it stays unknown.
function splitForm(l, data) {
  return html`
    <details class="more line-match" data-open-key="split-${data.draft}-${data.line}">
      <summary class="small">I know the amounts of each</summary>
      <form class="dl-fix" data-action="draft-split-form" data-draft="${data.draft}" data-line="${data.line}">
        ${l.match.components.map((id) => html`
          <label class="have-qty"><span class="field-label small">${ITEMS[id].name}</span><input class="input input--num" name="qty-${id}" type="text" inputmode="decimal" placeholder="amount"></label>`)}
        <label><span class="visually-hidden">Unit for both</span><select class="select select--small" name="unit">${UNITS.filter(Boolean).map((u) => html`<option value="${u}" ${l.unit === u ? "selected" : ""}>${u}</option>`)}</select></label>
        <button class="btn btn--secondary btn--small" type="submit">Split it</button>
      </form>
    </details>`;
}


