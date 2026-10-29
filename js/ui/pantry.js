// Pantry: the single ingredient state. Review, add (catalog search or free text),
// set an optional amount, remove. Recipes read and write the same entries.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { ITEMS, shortName } from "../data/items.js";
import { RECIPES } from "../data/recipes.js";
import { SWAPS } from "../data/swaps.js";
import { pantryChipItems } from "../core/suggest.js";
import { searchCatalog, displayName, freeKey } from "../core/pantry.js";
import { unitFamily } from "../core/units.js";
import { capitalize } from "./home.js";

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
  const matches = searchCatalog(q);
  const exact = matches.some((id) => ITEMS[id].name.toLowerCase() === q.trim().toLowerCase());
  const entries = Object.entries(state.pantry).sort(([a, ea], [b, eb]) => displayName(a, ea).localeCompare(displayName(b, eb)));
  const chips = pantryChipItems(RECIPES);
  return html`
    <div class="page pantry-page">
      <header class="list-head">
        <h1 tabindex="-1" data-route-focus>Pantry</h1>
        <p class="muted">Turn ‘what’s left?’ into ‘what’s next.’</p>
      </header>

      <form class="pantry-add" data-action="pantry-add-form" role="search" aria-label="Add to your pantry">
        <label class="field">
          <span class="field-label">Add an ingredient</span>
          <input class="input" type="search" data-action="pantry-search" value="${q}" placeholder="Search, for example chickpeas" autocomplete="off" aria-describedby="pantry-help">
        </label>
        <p id="pantry-help" class="small muted">Amounts are optional. With no amount, recipes count it as “have it, amount unknown.”</p>
        ${q.trim() ? html`
          <ul class="pantry-matches" aria-label="Matching ingredients">
            ${matches.map((id) => html`
              <li>
                ${state.pantry[id]
                  ? html`<span class="small muted">${ITEMS[id].name}: already in your pantry</span>`
                  : html`<button type="button" class="btn btn--secondary btn--small" data-action="pantry-add" data-item="${id}">${icon("plus")} ${ITEMS[id].name}</button>`}
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
              const on = !!state.pantry[id];
              return html`<button class="chip" aria-pressed="${on}" data-action="pantry-toggle" data-item="${id}">
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
          ? html`<ul class="lines">${entries.map(([key, e]) => pantryRow(key, e))}</ul>`
          : html`<div class="empty"><p>Nothing here yet. Search above or use Quick add. Recipes also add to it when you mark Have or Some.</p></div>`}
      </section>
    </div>`;
}

function pantryRow(key, e) {
  const name = displayName(key, e);
  if (e.free) {
    return html`
      <li class="line pantry-line">
        <div class="line-row">
          <div class="line-body">
            <span class="line-name">${name}</span>
            <span class="line-meta small muted">Not matched to recipes yet</span>
          </div>
          <label class="line-qty">
            <span class="visually-hidden">Amount of ${name}</span>
            <input class="input input--num" value="${e.qtyText ?? ""}" placeholder="amount" data-action="pantry-free-qty" data-key="${key}">
          </label>
          <button class="icon-btn" data-action="pantry-remove" data-key="${key}" aria-label="Remove ${name}">${icon("close")}</button>
        </div>
      </li>`;
  }
  const units = unitsFor(key);
  const unit = e.unit ?? units[0];
  return html`
    <li class="line pantry-line">
      <div class="line-row">
        <div class="line-body">
          <span class="line-name">${name}</span>
          <span class="line-meta small muted">${e.qty != null ? "Shared by every recipe, counted once on your list" : e.some ? "Some, amount not entered" : "Have it, amount unknown"}</span>
        </div>
        <div class="line-qty">
          <label>
            <span class="visually-hidden">Amount of ${name}${unit ? ` in ${unit}` : ""}, optional</span>
            <input class="input input--num" type="number" inputmode="decimal" min="0" step="any" value="${e.qty ?? ""}" placeholder="any"
              data-action="pantry-qty" data-key="${key}" data-unit="${unit}">
          </label>
          ${units.length > 1
            ? html`<select class="select pantry-unit" aria-label="Unit for ${name}" data-action="pantry-unit" data-key="${key}">
                ${units.map((u) => html`<option value="${u}" ${u === unit ? "selected" : ""}>${unitLabel(u)}</option>`)}</select>`
            : html`<span class="line-unit">${unitLabel(unit)}</span>`}
        </div>
        <button class="icon-btn" data-action="pantry-remove" data-key="${key}" aria-label="Remove ${name}">${icon("close")}</button>
      </div>
    </li>`;
}
