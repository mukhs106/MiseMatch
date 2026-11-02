// Pantry: the single ingredient state. Review, add (catalog search or free text),
// set an optional amount, remove. Recipes read and write the same entries.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { ITEMS, shortName } from "../data/items.js";
import { RECIPES } from "../data/recipes.js";
import { SWAPS } from "../data/swaps.js";
import { pantryChipItems } from "../core/suggest.js";
import { displayName, freeKey, amountText, isOut, suggestMatch } from "../core/pantry.js";
import { searchIngredients } from "../core/search.js";
import { unitFamily } from "../core/units.js";
import { capitalize, fieldError } from "./parts.js";

/** Pantry and shopping list share one tab: what you have, and what you still need. */
export function kitchenTabs(current, open) {
  return html`
    <div class="view-toggle kitchen-tabs" role="group" aria-label="Pantry or shopping list">
      <a class="view-btn" href="#/pantry" ${current === "pantry" ? html`aria-current="page"` : ""}>On hand</a>
      <a class="view-btn" href="#/list" ${current === "list" ? html`aria-current="page"` : ""}>Shopping list${open ? ` (${open})` : ""}</a>
    </div>`;
}

const FAMILY_UNITS = { mass: ["g", "kg"], volume: ["ml", "l", "tsp", "tbsp", "cup"] };

/** Units an item is measured in by the recipes and swaps, plus their convertible siblings. */
function unitsFor(item) {
  const used = new Set();
  for (const r of RECIPES) for (const i of r.ingredients) if (i.item === item) used.add(i.unit);
  for (const s of SWAPS) for (const w of [...(s.replace?.with ?? []), ...(s.add ?? [])]) if (w.item === item) used.add(w.unit);
  const out = [];
  for (const u of used) for (const v of FAMILY_UNITS[unitFamily(u)] ?? [u]) if (!out.includes(v)) out.push(v);
  return out.length ? out : ["", "g"];
}

const unitLabel = (u) => (u === "" ? "count" : u);

export function pantryView(ctx) {
  const { state, ui } = ctx;
  const q = ui.pantryQuery;
  const matches = searchIngredients(q, { limit: 6 });
  const exact = matches.some((m) => m.exact);
  const entries = Object.entries(state.pantry).sort(([a, ea], [b, eb]) => displayName(a, ea).localeCompare(displayName(b, eb)));
  const chips = pantryChipItems(RECIPES);
  return html`
    <div class="page pantry-page">
      <header class="list-head">
        <h1 tabindex="-1" data-route-focus>Pantry</h1>
        <p class="muted">Turn ‘what’s left?’ into ‘what’s next.’</p>
      </header>
      ${kitchenTabs("pantry", state.list.lines.filter((l) => !l.checked).length)}

      <form class="pantry-add" data-action="pantry-add-form" role="search" aria-label="Add to your pantry">
        <label class="field">
          <span class="field-label">Add an ingredient</span>
          <input class="input" type="search" data-action="pantry-search" value="${q}" placeholder="Search, for example chickpeas" autocomplete="off" aria-describedby="pantry-help">
        </label>
        <p id="pantry-help" class="small muted">Regional names work too, like palak or chole. Amounts are optional. Without one, you'll be asked whether you have enough when you plan a meal.</p>
        ${ui.pantryHint ? html`<p class="small field-error" role="alert">${ui.pantryHint}</p>` : ""}
        ${q.trim() ? html`
          <ul class="pantry-matches" aria-label="Matching ingredients">
            ${matches.map(({ id, via }) => html`
              <li>
                ${state.pantry[id]
                  ? html`<span class="small muted">${ITEMS[id].name}: already in your pantry</span>`
                  : html`<button type="button" class="btn btn--secondary btn--small" data-action="pantry-add" data-item="${id}" aria-label="Add ${ITEMS[id].name} to your pantry">${icon("plus")} ${ITEMS[id].name}${via ? html` <span class="small">(${via})</span>` : ""}</button>`}
              </li>`)}
            ${exact || state.pantry[freeKey(q)] ? "" : html`
              <li class="pantry-free">
                <button type="button" class="btn btn--quiet" data-action="pantry-add-free" data-name="${q.trim()}">Add “${q.trim()}” as your own item</button>
                <span class="small muted">Not matched to recipes yet</span>
              </li>`}
          </ul>` : ""}
      </form>

      <details class="kitchen quick-add" data-open-key="quick" ${ui.open.quick ?? !entries.length ? "open" : ""}>
        <summary>
          <h2>Quick add</h2>
          <span class="small muted">Common ingredients from the recipes</span>
        </summary>
        <div class="kitchen-body">
          <div class="chips" role="group" aria-label="Quick add ingredients">
            ${chips.map((id) => {
              const on = !!state.pantry[id] && !isOut(state.pantry[id]);
              return html`<button class="chip" aria-pressed="${on}" data-action="pantry-toggle" data-item="${id}" aria-label="${shortName(id)}: ${on ? "in your pantry" : "not added"}">
                ${on ? icon("check") : ""}${capitalize(shortName(id))}</button>`;
            })}
          </div>
        </div>
      </details>

      <section class="pantry-items" aria-labelledby="pantry-items-h">
        <div class="section-head">
          <h2 id="pantry-items-h">In your pantry</h2>
          <span class="muted small">${plural(entries.length, "item")}</span>
        </div>
        ${entries.length
          ? html`<ul class="lines">${entries.map(([key, e]) => pantryRow(key, e, ui))}</ul>`
          : html`<div class="empty"><p>Nothing checked yet. You don't need a full inventory: search above, use Quick add, or mark items while adapting a dish. Anything not here counts as not checked, not as missing.</p></div>`}
      </section>
    </div>`;
}

function pantryRow(key, e, ui) {
  const name = displayName(key, e);
  const errKey = `pantry:${key}`;
  const err = ui.fieldErrors[errKey];
  const errId = `pantry-err-${key.replace(/[^a-z0-9-]/gi, "_")}`;
  if (e.free) {
    const suggestion = suggestMatch(name);
    const options = Object.keys(ITEMS).filter((k) => !ITEMS[k].noShop).sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name));
    const candidates = searchIngredients(name, { limit: 5 }).map((m) => m.id);
    const openKey = `match-${key}`;
    return html`
      <li class="line pantry-line">
        <div class="line-row">
          <div class="line-body">
            <span class="line-name">${name}</span>
            <span class="line-meta small muted">Your own item. Not counted in recipes until it's matched.</span>
          </div>
          <label class="line-qty">
            <span class="visually-hidden">Amount of ${name}</span>
            <input class="input input--num" value="${e.qtyText ?? ""}" placeholder="amount" data-action="pantry-free-qty" data-key="${key}">
          </label>
          <button class="icon-btn" data-action="pantry-remove" data-key="${key}" aria-label="Remove ${name}">${icon("close")}</button>
        </div>
        <details class="more line-match" data-open-key="${openKey}" ${ui.open[openKey] ? "open" : ""}>
          <summary class="small">Match to an ingredient${suggestion ? `: looks like ${ITEMS[suggestion].name}` : ""}</summary>
          <label class="field"><span class="field-label small">Which ingredient is “${name}”?</span>
            <select class="select" data-action="pantry-match-free" data-key="${key}">
              <option value="">Choose…</option>
              ${candidates.length ? html`<optgroup label="Likely">${candidates.map((id) => html`<option value="${id}">${ITEMS[id].name}</option>`)}</optgroup>` : ""}
              <optgroup label="All ingredients">${options.map((id) => html`<option value="${id}">${ITEMS[id].name}</option>`)}</optgroup>
            </select></label>
          <p class="small muted">Your wording and amount stay until you choose.</p>
        </details>
      </li>`;
  }
  const units = unitsFor(key);
  const unit = e.unit ?? units[0];
  const measured = e.qty != null && e.qty !== 0;
  return html`
    <li class="line pantry-line ${isOut(e) ? "is-out" : ""}">
      <div class="line-row">
        <div class="line-body">
          <span class="line-name">${name}</span>
          <span class="line-meta small muted">${isOut(e) ? "Don't have" : e.qty != null ? `${amountText(e)}. Shared by every meal, counted once` : amountText(e)}</span>
          ${e.fromFree ? html`<span class="line-meta small muted">Matched from “${e.fromFree.name}”${e.fromFree.qtyText ? `, ${e.fromFree.qtyText}` : ""}</span>` : ""}
          ${measured ? html`<button class="btn btn--quiet line-reset" data-action="pantry-clear" data-key="${key}" aria-label="Clear the amount of ${name}. It becomes amount unknown.">Clear amount</button>` : ""}
          ${isOut(e) || e.qty == null ? "" : ""}
        </div>
        <div class="line-qty">
          <label>
            <span class="visually-hidden">Amount of ${name}${unit ? ` in ${unit}` : ""}, optional. Zero means you're out.</span>
            <input class="input input--num" type="text" inputmode="decimal" value="${err?.value ?? e.qty ?? ""}" placeholder="any"
              data-action="pantry-qty" data-key="${key}" data-unit="${unit}" ${err ? html`aria-invalid="true" aria-describedby="${errId}"` : ""}>
          </label>
          ${units.length > 1
            ? html`<select class="select pantry-unit" aria-label="Unit for ${name}" data-action="pantry-unit" data-key="${key}">
                ${units.map((u) => html`<option value="${u}" ${u === unit ? "selected" : ""}>${unitLabel(u)}</option>`)}</select>`
            : html`<span class="line-unit">${unitLabel(unit)}</span>`}
        </div>
        <button class="icon-btn" data-action="pantry-remove" data-key="${key}" aria-label="Remove ${name}">${icon("close")}</button>
      </div>
      ${err ? fieldError(err.message, errId) : ""}
    </li>`;
}
