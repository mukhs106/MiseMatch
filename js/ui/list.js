// Shopping list: planned meals at the top (each tied to an exact version and
// serving count), amounts to confirm, then lines grouped by aisle. Edits are
// kept; changes underneath them are flagged, never applied silently.

import { html, plural } from "./html.js";
import { icon, doodle, checkNote } from "./icons.js";
import { getRecipe } from "../data/recipes.js";
import { computedQty, displayQty, formatShopQty, isListCurrent, boughtDefault, dismissedReview, listStatus } from "../core/shopping.js";
import { formatQty, purchaseQty } from "../core/units.js";
import { kitchenTabs } from "./pantry.js";
import { plannedList } from "./plan.js";
import { confirmRow, uniqueChecks } from "./adapt.js";
import { fieldError } from "./parts.js";

const AISLES = ["Produce", "Frozen", "Refrigerated", "Dairy & eggs", "Meat", "Pantry", "Bakery", "Spices", "Added by you"];

export function listView(ctx) {
  const { list, plan } = ctx.state;
  const open = list.lines.filter((l) => !l.checked).length;
  const checked = list.lines.length - open;
  const groups = AISLES.map((aisle) => [aisle, list.lines.filter((l) => l.aisle === aisle)]).filter(([, ls]) => ls.length);
  const other = list.lines.filter((l) => !AISLES.includes(l.aisle));
  if (other.length) groups.push(["Other", other]);
  const needs = ctx.planNeeds();
  const pending = plan.flatMap((p) => (needs.get(p.id) ?? []).filter((n) => n.check));
  const checks = uniqueChecks(pending);
  const optional = plan.flatMap((p) => (needs.get(p.id) ?? []).filter((n) => n.optional && !n.included).map((n) => ({ p, n })));
  const dismissed = dismissedReview(list, plan, needs);
  const status = listStatus(list, plan, checks.length, dismissed.length);
  const unchecked = list.lines.filter((l) => !l.checked && Object.values(l.sources ?? {}).some((src) => src.unchecked)).length;
  const HEAD = {
    "no-meals": "Nacho average grocery list.",
    pending: `${plural(checks.length, "pantry check")} waiting on you${open ? `, ${plural(open, "item")} to get` : ""}. This list isn't final yet.`,
    open: `${plural(open, "item")} to get${unchecked ? ` (${unchecked} still to check in your pantry)` : ""}${checked ? `, ${checked} checked off` : ""}`,
    "all-checked": "Bean there, done that.",
    dismissed: "Everything left was removed by you. See below to add anything back.",
    "nothing-needed": "Your planned meals are covered by your pantry.",
  };

  return html`
    <div class="page list-page">
      <header class="list-head">
        <h1 tabindex="-1" data-route-focus>Shopping list</h1>
        <p class="muted">${HEAD[status]}</p>
      </header>
      ${kitchenTabs("list", open)}
      ${plan.length ? html`
        <section class="list-meals" aria-labelledby="meals-h">
          <div class="section-head"><h2 id="meals-h" class="h3">For ${plural(plan.length, "meal")}</h2><a class="btn btn--quiet" href="#/plan">Plan more</a></div>
          ${plannedList(ctx)}
        </section>` : ""}
      ${listNotices(ctx, dismissed)}
      ${checks.length ? html`
        <section class="list-confirm" aria-labelledby="conf-h">
          <h2 id="conf-h" class="h3">Do you have enough?</h2>
          <p class="small muted">In your pantry without an amount, so not assumed to be enough. Each question covers every planned meal that uses it. Or <a href="#/pantry">enter an amount</a>.</p>
          <ul class="confirm-list">${checks.map((n) => confirmRow(n))}</ul>
        </section>` : ""}
      <form class="add-item" data-action="list-add" aria-label="Add an item">
        <label class="field add-name">
          <span class="field-label">Add an item</span>
          <input class="input" name="name" autocomplete="off" placeholder="e.g. Yogurt" required data-keep="list-add-name">
        </label>
        <label class="field add-qty">
          <span class="field-label">Amount</span>
          <input class="input" name="qty" autocomplete="off" placeholder="optional" data-keep="list-add-qty">
        </label>
        <button class="btn btn--secondary" type="submit">${icon("plus")} Add</button>
      </form>
      ${list.lines.length ? html`
        <div class="aisles">
          ${groups.map(([aisle, lines]) => html`
            <section class="aisle" aria-label="${aisle}">
              <h2 class="eyebrow">${aisle}</h2>
              <ul class="lines">${lines.map((l) => lineView(l, ctx))}</ul>
            </section>`)}
        </div>
        ${checked ? html`<button class="btn btn--secondary" data-action="list-clear-checked">Clear ${plural(checked, "checked item")}</button>` : ""}
      ` : html`
        <div class="empty">
          ${doodle.pot}
          <p>${{
            "no-meals": "Nothing to buy yet. Adapt a recipe and add it from the Pantry and shopping step, or plan a few meals. Anything you add here yourself stays put.",
            pending: "Nothing on the list yet, because your answers above decide what goes on it.",
            dismissed: "You removed everything these meals still need.",
            "nothing-needed": "Nothing to buy for your planned meals: your pantry covers what's measured and what you confirmed.",
          }[status] ?? ""}</p>
          ${plan.length ? "" : html`<a class="btn btn--primary" href="#/plan">Plan a few meals</a>`}
        </div>`}
      ${optional.length ? html`
        <details class="more" data-open-key="list-optional">
          <summary>${plural(optional.length, "optional item")} not on your list</summary>
          <ul class="plain-list small">${optional.map(({ p, n }) => html`<li>${formatQty(n.qty, n.unit, n.step)} ${n.name} <span class="muted">for ${getRecipe(p.recipeId).title}</span> <button class="btn btn--quiet" data-action="plan-include-optional" data-plan="${p.id}" data-item="${n.item}" aria-label="Add optional ${n.name} for ${getRecipe(p.recipeId).title}">Add</button></li>`)}</ul>
        </details>` : ""}
    </div>`;
}

function listNotices(ctx, dismissed) {
  const { list, plan } = ctx.state;
  const needs = ctx.planNeeds();
  const stale = plan.filter((p) => !isListCurrent(list, p.id, needs.get(p.id) ?? []));
  const changed = dismissed.filter((d) => d.changed);
  return html`
    ${stale.length ? html`
      <div class="notice" role="status">
        <p><strong>Your pantry or a planned meal changed</strong> since the list was made. The list still shows the earlier amounts.</p>
        <div class="actions"><button class="btn btn--primary btn--small" data-action="sync-list">Update list</button></div>
      </div>` : ""}
    ${changed.length ? html`
      <div class="notice" role="status">
        <p><strong>What you removed has changed.</strong></p>
        <ul class="plain-list">${changed.map(({ planId, need, was }) => html`
          <li>${need.name} for ${getRecipe(plan.find((p) => p.id === planId).recipeId).title}: was ${formatQty(was.qty, was.unit)}, now ${formatShopQty(need.qty, need.unit, need.step)}.
            <button class="btn btn--quiet" data-action="list-addback" data-id="${planId}" data-key="${need.key}" aria-label="Add ${need.name} back to the list">Add back</button></li>`)}</ul>
      </div>` : ""}
    ${dismissed.length > changed.length ? html`
      <details class="notice notice--cool removed" data-open-key="list-removed">
        <summary>${plural(dismissed.length - changed.length, "item")} you removed ${dismissed.length - changed.length === 1 ? "is" : "are"} still in your planned meals</summary>
        <ul>
          ${dismissed.filter((d) => !d.changed).map(({ planId, need }) => html`
            <li>
              <span>${need.name} <span class="muted">for ${getRecipe(plan.find((p) => p.id === planId).recipeId).title}</span></span>
              <button class="btn btn--quiet" data-action="list-addback" data-id="${planId}" data-key="${need.key}" aria-label="Add ${need.name} back to the list">Add back</button>
            </li>`)}
        </ul>
      </details>` : ""}`;
}

function inputValue(line) {
  if (line.override) return line.override.qty;
  const q = computedQty(line);
  if (!q) return "";
  return purchaseQty(q.qty, q.unit, q.step);
}

/** Buying step on a checked line: confirm the amount actually bought, once. */
function boughtRow(line) {
  const id = line.id;
  if (line.manual) {
    return line.transfer
      ? html`<span class="line-meta small">${icon("check")} In your pantry</span>`
      : html`<button class="btn btn--quiet line-to-pantry" data-action="list-to-pantry" data-line="${id}" aria-label="Add ${line.name} to your pantry">Add to pantry</button>`;
  }
  if (line.transfer) {
    const all = [line.transfer, ...(line.transfer.more ?? [])];
    return html`
      <span class="line-meta small">${icon("check")} ${all.map((t) => (t.qty != null ? formatQty(t.qty, t.unit ?? "") : "Some")).join(" + ")} added to your pantry</span>
      <details class="more line-match" data-open-key="more-${id}">
        <summary class="small">Bought more?</summary>
        <label class="have-qty"><span class="field-label small">Extra ${line.unit ?? ""} of ${line.name}</span>
          <input class="input input--num" id="bought-${id}" type="text" inputmode="decimal" placeholder="amount"></label>
        <button class="btn btn--quiet" data-action="list-to-pantry" data-line="${id}" data-more="1">Add this amount too</button>
      </details>`;
  }
  const d = boughtDefault(line);
  return html`
    <span class="line-bought small">
      <label class="have-qty"><span class="field-label small">Bought</span>
        <input class="input input--num" id="bought-${id}" type="text" inputmode="decimal" value="${d?.qty ?? ""}" aria-label="How much ${line.name} you bought${d?.unit ? `, in ${d.unit}` : ""}" data-keep="bought-${id}">
        <span>${d?.unit || "count"}</span></label>
      <button class="btn btn--quiet line-to-pantry" data-action="list-to-pantry" data-line="${id}" aria-label="Add the amount of ${line.name} you bought to your pantry">Add to pantry</button>
    </span>`;
}

function lineView(line, ctx) {
  const computed = line.manual ? null : computedQty(line);
  const titles = Object.values(line.sources ?? {}).map((s) => s.title);
  const uncertain = Object.values(line.sources ?? {}).some((s) => s.uncertain);
  const unchecked = !line.checked && Object.values(line.sources ?? {}).some((s) => s.unchecked);
  const id = line.id;
  const err = ctx.ui.fieldErrors[`list:${id}`];
  return html`
    <li class="line ${line.checked ? "is-checked" : ""} ${line.conflict ? "has-conflict" : ""}">
      <div class="line-row">
        <label class="check">
          <input type="checkbox" ${line.checked ? "checked" : ""} data-action="list-check" data-line="${id}">
          <span class="visually-hidden">Got ${line.name}</span>
        </label>
        <div class="line-body">
          ${line.manual
            ? html`<input class="input line-name" value="${line.name}" aria-label="Name of your item: ${line.name}" data-action="list-name" data-line="${id}">`
            : html`<span class="line-name">${line.name}</span>`}
          <span class="line-meta small muted">
            ${titles.length ? `For ${titles.join("; ")}` : line.manual ? "Added by you" : "No longer in a planned meal"}
            ${line.override && !line.conflict ? html` · <span class="edited">edited</span>
              <button class="btn btn--quiet line-reset" data-action="list-resolve" data-line="${id}" data-choice="recipe" aria-label="Use the recipe amount of ${line.name}">Use recipe amount</button>` : ""}
            ${unchecked ? " · to check in your pantry" : ""}
          </span>
          ${computed && !line.override && formatQty(computed.qty, computed.unit, computed.step) !== formatShopQty(computed.qty, computed.unit, computed.step) ? html`<span class="line-meta small muted">Recipes use ${formatQty(computed.qty, computed.unit, computed.step)}</span>` : ""}
          ${line.override?.qty === 0 ? html`<span class="line-meta small muted">Set to 0: you don't plan to buy any.</span>` : ""}
          ${uncertain ? html`<span class="line-meta small warn">${checkNote("your pantry amount couldn't be counted here.", "Check before buying:")}</span>` : ""}
          ${line.checked ? boughtRow(line) : ""}
        </div>
        <label class="line-qty">
          <span class="visually-hidden">Amount of ${line.name}${computed?.unit ? ` in ${computed.unit}` : ""}</span>
          ${line.manual
            ? html`<input class="input input--num" value="${line.qtyText ?? ""}" placeholder="—" data-action="list-qty" data-line="${id}"><span class="line-unit"></span>`
            : html`<input class="input input--num" type="text" inputmode="decimal" value="${err?.value ?? inputValue(line)}" data-action="list-qty" data-line="${id}" ${err ? html`aria-invalid="true" aria-describedby="list-err-${id}"` : ""} ${line.transfer ? "disabled" : ""}>
                   <span class="line-unit">${(line.override ?? computed)?.unit ?? ""}</span>`}
        </label>
        <button class="icon-btn" data-action="list-delete" data-line="${id}" aria-label="Remove ${line.name}">${icon("close")}</button>
      </div>
      ${err ? fieldError(err.message, `list-err-${id}`) : ""}
      ${line.conflict ? conflictView(line) : ""}
    </li>`;
}

function conflictView(line) {
  const id = line.id;
  if (line.conflict.type === "orphan") {
    return html`
      <div class="notice line-conflict" role="status">
        <p><strong>No planned meal needs this anymore.</strong> You ${line.checked ? "checked it off" : "edited it"}, so it's still here.</p>
        <div class="actions">
          <button class="btn btn--secondary btn--small" data-action="list-resolve" data-line="${id}" data-choice="remove">Remove</button>
          <button class="btn btn--quiet" data-action="list-resolve" data-line="${id}" data-choice="mine">Keep it</button>
        </div>
      </div>`;
  }
  const now = line.conflict.current;
  const nowText = formatShopQty(now.qty, now.unit, now.step);
  const mine = line.override ? displayQty(line) : null;
  const name = line.name;
  return html`
    <div class="notice line-conflict" role="status">
      <p>Your planned meals now need <strong>${nowText}</strong>.
        ${mine ? `You set ${mine}.` : "You had already checked this off."}</p>
      <div class="actions">
        <button class="btn btn--secondary btn--small" data-action="list-resolve" data-line="${id}" data-choice="recipe" aria-label="Use ${nowText} of ${name}">Use ${nowText}</button>
        <button class="btn btn--quiet" data-action="list-resolve" data-line="${id}" data-choice="mine" aria-label="${mine ? `Keep ${mine} of ${name}` : `Keep ${name} as checked`}">${mine ? `Keep ${mine}` : "Keep as checked"}</button>
      </div>
    </div>`;
}
