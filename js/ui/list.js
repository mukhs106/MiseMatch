// Grocery list: grouped, editable, with conflicts surfaced on the line they affect.

import { html, plural } from "./html.js";
import { icon, doodle } from "./icons.js";
import { getRecipe } from "../data/recipes.js";
import { computedQty, displayQty, formatShopQty, isListCurrent } from "../core/shopping.js";
import { practical, unitFamily } from "../core/units.js";

const AISLES = ["Produce", "Frozen", "Refrigerated", "Dairy & eggs", "Pantry", "Bakery", "Spices", "Added by you"];

export function listView(ctx) {
  const { list } = ctx.state;
  const open = list.lines.filter((l) => !l.checked).length;
  const checked = list.lines.length - open;
  const groups = AISLES.map((aisle) => [aisle, list.lines.filter((l) => l.aisle === aisle)]).filter(([, ls]) => ls.length);
  const other = list.lines.filter((l) => !AISLES.includes(l.aisle));
  if (other.length) groups.push(["Other", other]);

  return html`
    <div class="page list-page">
      <header class="list-head">
        <h1 tabindex="-1" data-route-focus>Grocery list</h1>
        <p class="muted">${list.lines.length ? `${plural(open, "item")} to get` : "Built from your recipes, editable by you."}</p>
      </header>
      ${listNotices(ctx)}
      <form class="add-item" data-action="list-add" aria-label="Add an item">
        <label class="field add-name">
          <span class="field-label">Add an item</span>
          <input class="input" name="name" autocomplete="off" placeholder="e.g. Yogurt" required>
        </label>
        <label class="field add-qty">
          <span class="field-label">Amount</span>
          <input class="input" name="qty" autocomplete="off" placeholder="optional">
        </label>
        <button class="btn btn--secondary" type="submit">${icon("plus")} Add</button>
      </form>
      ${list.lines.length ? html`
        <div class="aisles">
          ${groups.map(([aisle, lines]) => html`
            <section class="aisle" aria-label="${aisle}">
              <h2 class="eyebrow">${aisle}</h2>
              <ul class="lines">${lines.map((l) => lineView(l))}</ul>
            </section>`)}
        </div>
        ${checked ? html`<button class="btn btn--secondary" data-action="list-clear-checked">Clear ${plural(checked, "checked item")}</button>` : ""}
      ` : html`
        <div class="empty">
          ${doodle.pot}
          <p>Nothing on your list yet. Open a recipe, mark what you have, and add what you still need.</p>
          <a class="btn btn--primary" href="#/">Go to My Recipes</a>
        </div>`}
    </div>`;
}

function listNotices(ctx) {
  const { list } = ctx.state;
  const stale = [];
  const removed = [];
  for (const recipeId of Object.keys(list.synced)) {
    const recipe = getRecipe(recipeId);
    if (!recipe) continue;
    const needs = ctx.needs(recipeId);
    if (!isListCurrent(list, recipeId, needs)) stale.push(recipe);
    for (const n of needs) if (list.dismissed[recipeId]?.[n.key]) removed.push({ recipe, need: n });
  }
  return html`
    ${stale.map((r) => html`
      <div class="notice" role="status">
        <p><strong>${r.title} changed</strong> since it was added. The list still shows the earlier amounts.</p>
        <div class="actions">
          <button class="btn btn--primary btn--small" data-action="sync-list" data-id="${r.id}">Update from recipe</button>
          <a class="btn btn--quiet" href="#/recipe/${r.id}">Open recipe</a>
        </div>
      </div>`)}
    ${removed.length ? html`
      <details class="notice notice--cool removed">
        <summary>${plural(removed.length, "item")} you removed ${removed.length === 1 ? "is" : "are"} still in your recipes</summary>
        <ul>
          ${removed.map(({ recipe, need }) => html`
            <li>
              <span>${need.name} <span class="muted">for ${recipe.title}</span></span>
              <button class="btn btn--quiet" data-action="list-addback" data-id="${recipe.id}" data-key="${need.key}">Add back</button>
            </li>`)}
        </ul>
      </details>` : ""}`;
}

function inputValue(line) {
  const q = line.override ?? computedQty(line);
  if (!q) return "";
  if (unitFamily(q.unit).startsWith("count:")) return Math.ceil(q.qty - 0.01);
  return practical(q.qty, q.unit, q.step);
}

function lineView(line) {
  const computed = line.manual ? null : computedQty(line);
  const titles = Object.values(line.sources ?? {}).map((s) => s.title);
  const uncertain = Object.values(line.sources ?? {}).some((s) => s.uncertain);
  const id = line.id;
  return html`
    <li class="line ${line.checked ? "is-checked" : ""} ${line.conflict ? "has-conflict" : ""}">
      <div class="line-row">
        <label class="check">
          <input type="checkbox" ${line.checked ? "checked" : ""} data-action="list-check" data-line="${id}">
          <span class="visually-hidden">Got ${line.name}</span>
        </label>
        <div class="line-body">
          ${line.manual
            ? html`<input class="input line-name" value="${line.name}" aria-label="Item name" data-action="list-name" data-line="${id}">`
            : html`<span class="line-name">${line.name}</span>`}
          <span class="line-meta small muted">
            ${titles.length ? `For ${titles.join(", ")}` : line.manual ? "Added by you" : "No longer in a recipe"}
            ${line.override && !line.conflict ? html` · <span class="edited">edited</span>
              <button class="btn btn--quiet line-reset" data-action="list-resolve" data-line="${id}" data-choice="recipe">Use recipe amount</button>` : ""}
          </span>
          ${uncertain ? html`<span class="line-meta small warn">You marked some at home in a different unit. Check before buying.</span>` : ""}
        </div>
        <label class="line-qty">
          <span class="visually-hidden">Amount of ${line.name}${computed?.unit ? ` in ${computed.unit}` : ""}</span>
          ${line.manual
            ? html`<input class="input input--num" value="${line.qtyText ?? ""}" placeholder="—" data-action="list-qty" data-line="${id}"><span class="line-unit"></span>`
            : html`<input class="input input--num" type="number" inputmode="decimal" min="0" step="any" value="${inputValue(line)}" data-action="list-qty" data-line="${id}">
                   <span class="line-unit">${(line.override ?? computed)?.unit ?? ""}</span>`}
        </label>
        <button class="icon-btn" data-action="list-delete" data-line="${id}" aria-label="Remove ${line.name}">${icon("close")}</button>
      </div>
      ${line.conflict ? conflictView(line) : ""}
    </li>`;
}

function conflictView(line) {
  const id = line.id;
  if (line.conflict.type === "orphan") {
    return html`
      <div class="notice line-conflict" role="status">
        <p>No recipe needs this anymore. You ${line.checked ? "checked it off" : "edited it"}, so it's still here.</p>
        <div class="actions">
          <button class="btn btn--secondary btn--small" data-action="list-resolve" data-line="${id}" data-choice="remove">Remove</button>
          <button class="btn btn--quiet" data-action="list-resolve" data-line="${id}" data-choice="mine">Keep it</button>
        </div>
      </div>`;
  }
  const now = line.conflict.current;
  const nowText = formatShopQty(now.qty, now.unit, now.step);
  const mine = line.override ? displayQty(line) : null;
  return html`
    <div class="notice line-conflict" role="status">
      <p>Your recipes now need <strong>${nowText}</strong>.
        ${mine ? `You set ${mine}.` : "You had already checked this off."}</p>
      <div class="actions">
        <button class="btn btn--secondary btn--small" data-action="list-resolve" data-line="${id}" data-choice="recipe">Use ${nowText}</button>
        <button class="btn btn--quiet" data-action="list-resolve" data-line="${id}" data-choice="mine">${mine ? `Keep ${mine}` : "Keep as checked"}</button>
      </div>
    </div>`;
}
