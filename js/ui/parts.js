// Shared view pieces: photos with credits, evidence labels, the constraints
// form, expected changes, nutrition comparison and label checks.

import { html, plural, raw } from "./html.js";
import { icon } from "./icons.js";
import { ITEMS, ALLERGEN_LABEL, NUTRITION_SOURCE, shortName } from "../data/items.js";
import { getSwap, EVIDENCE } from "../data/swaps.js";
import { AVOID_OPTIONS, NUT_SCOPES, openQuestions, describe } from "../core/constraints.js";
import { NUTRIENT_LABEL, formatRange, direction, servingSizeChange } from "../core/nutrition.js";

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** A recipe photo with its credit. Credits stay honest: page links are still pending. */
export function photo(image, { size = "card", credit = true } = {}) {
  if (!image) return "";
  const base = `assets/images/web/${image.file}`;
  const sizes = size === "hero" ? "(min-width: 960px) 480px, 100vw" : size === "thumb" ? "96px" : "(min-width: 720px) 320px, 50vw";
  return html`
    <figure class="photo photo--${size}">
      <img src="${base}-480.jpg" srcset="${base}-480.jpg 480w, ${base}-960.jpg 960w" sizes="${sizes}" alt="${image.alt}" loading="${size === "hero" ? "eager" : "lazy"}" decoding="async"
        onerror="this.closest('.photo').classList.add('is-missing')">
      ${credit ? html`<figcaption class="credit">Photo: Pexels, page link pending</figcaption>` : ""}
    </figure>`;
}

/** A recipe's photo, or a plain typographic tile when there's no suitable photo (never a stand-in dish). */
export function recipeImage(recipe, opts = {}) {
  if (recipe.image) return photo(recipe.image, opts);
  const initials = recipe.title.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  return html`<span class="photo photo--${opts.size ?? "card"} photo--none" aria-hidden="true"><span class="tile-initials">${initials}</span></span>`;
}

export function evidence(kind = "suggested") {
  const e = EVIDENCE[kind];
  return html`<span class="evidence evidence--${kind}" title="${e.detail}">${kind === "suggested" ? "Suggested, not yet cooked by our team" : e.label}</span>`;
}

export function stepper({ label, value, min = 1, max = 12, action, data = {}, labelId }) {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${String(v).replace(/"/g, "&quot;")}"`).join(" ");
  return html`
    <div class="stepper" role="group" aria-labelledby="${labelId}">
      <button data-action="${action}" data-delta="-1" ${raw(attrs)} aria-label="Fewer ${label}" ${value <= min ? "disabled" : ""}>${icon("minus")}</button>
      <output aria-live="polite" aria-label="${plural(value, label.replace(/s$/, ""))}">${value}</output>
      <button data-action="${action}" data-delta="1" ${raw(attrs)} aria-label="More ${label}" ${value >= max ? "disabled" : ""}>${icon("plus")}</button>
    </div>`;
}

// ---------- constraints ----------

const AVOID_LABEL = { dairy: "Dairy", egg: "Egg", gluten: "Wheat or gluten", nuts: "Nuts", soy: "Soy", sesame: "Sesame", mustard: "Mustard" };

/**
 * The four kinds of requirement, each in its own group so they read differently:
 * hard exclusions, clarifying questions, a limit, flexible targets.
 */
export function constraintsForm(c, scope, { compact = false } = {}) {
  const questions = openQuestions(c);
  const chip = (action, value, on, label, extra = "") => html`
    <button type="button" class="chip" aria-pressed="${on}" data-action="${action}" data-scope="${scope}" data-value="${value}" ${raw(extra)}>${on ? icon("check") : ""}${label}</button>`;
  return html`
    <div class="req">
      <fieldset class="req-group">
        <legend class="req-legend">Must not include <span class="req-kind">never traded away</span></legend>
        <div class="chips" role="group" aria-label="Diet">
          ${chip("c-diet", "", !c.diet, "No diet")}
          ${chip("c-diet", "vegetarian", c.diet === "vegetarian", "Vegetarian")}
          ${chip("c-diet", "vegan", c.diet === "vegan", "Plant-based (vegan)")}
        </div>
        <div class="chips" role="group" aria-label="Avoid">
          ${AVOID_OPTIONS.map((a) => chip("c-avoid", a, c.avoid.includes(a), AVOID_LABEL[a]))}
        </div>
      </fieldset>
      ${questions.length ? html`
        <div class="req-questions" role="group" aria-label="Questions that change which versions fit">
          ${questions.map((q) => questionRow(q, c, scope))}
        </div>` : ""}
      ${compact ? "" : html`
        <fieldset class="req-group req-row">
          <legend class="req-legend">Time limit <span class="req-kind">a limit you set</span></legend>
          <label class="field field--inline"><span class="visually-hidden">Time limit in minutes</span>
            <select class="select" data-action="c-time" data-scope="${scope}">
              ${[null, 30, 45, 60, 90].map((m) => html`<option value="${m ?? ""}" ${c.timeLimit === m ? "selected" : ""}>${m ? `Up to ${m} minutes` : "No limit"}</option>`)}
            </select></label>
        </fieldset>`}
      <fieldset class="req-group req-row">
        <legend class="req-legend">Nutrition goals <span class="req-kind">optional, flexible</span></legend>
        <div class="req-targets">
          ${[["protein", [15, 20, 25, 30, 35]], ["fiber", [6, 8, 10, 12]]].map(([n, opts]) => html`
            <label class="field field--inline"><span class="field-label">${capitalize(n)}, per serving</span>
              <select class="select" data-action="c-target" data-scope="${scope}" data-nutrient="${n}">
                <option value="" ${c.targets[n] == null ? "selected" : ""}>No goal</option>
                ${[...new Set([...opts, ...(c.targets[n] != null ? [c.targets[n]] : [])])].sort((a, b) => a - b).map((v) => html`<option value="${v}" ${c.targets[n] === v ? "selected" : ""}>At least ${v} g</option>`)}
              </select></label>`)}
        </div>
        <p class="small muted">Goals rank versions and explain trade-offs. Estimates are ranges; nothing is tracked.</p>
      </fieldset>
    </div>`;
}

export function questionRow(q, c, scope) {
  if (q.key === "nutScope") {
    return html`
      <div class="req-q"><p class="small"><strong>${q.text}</strong></p>
        <div class="chips">${Object.entries(NUT_SCOPES).map(([k, s]) => html`<button type="button" class="chip" aria-pressed="${c.nutScope === k}" data-action="c-nutscope" data-scope="${scope}" data-value="${k}">${s.label}</button>`)}</div>
        <p class="small muted">Until you choose, both are avoided.</p></div>`;
  }
  if (q.key === "eggs") {
    return html`
      <div class="req-q"><p class="small"><strong>${q.text}</strong></p>
        <div class="chips">${[["yes", "Yes, eggs are fine"], ["no", "No eggs"]].map(([v, l]) => html`<button type="button" class="chip" aria-pressed="${c.eggs === v}" data-action="c-eggs" data-scope="${scope}" data-value="${v}">${l}</button>`)}</div></div>`;
  }
  return html`
    <div class="req-q"><p class="small"><strong>${q.text}</strong></p>
      <div class="chips">
        <button type="button" class="chip" data-action="c-answer" data-scope="${scope}" data-key="${q.key}" data-value="ok">${capitalize(ALLERGEN_LABEL[q.key])} is OK</button>
        <button type="button" class="chip" data-action="c-answer" data-scope="${scope}" data-key="${q.key}" data-value="avoid">Avoid ${ALLERGEN_LABEL[q.key]}</button>
      </div></div>`;
}

export function constraintsSummary(c) {
  const parts = describe(c);
  if (c.timeLimit) parts.push(`up to ${c.timeLimit} min`);
  for (const [n, v] of Object.entries(c.targets)) if (v != null) parts.push(`${n} ${v} g+`);
  return parts.length ? parts.join(" · ") : "No requirements set";
}

// ---------- expected changes ----------

const DIMS = [["texture", "Texture"], ["richness", "Richness"], ["aroma", "Aroma and taste"], ["acidity", "Acidity"], ["cooking", "Cooking"], ["quantity", "Quantities"]];

/** Concrete expected changes for a set of rules, grouped by what changes, plus what stays the same. */
export function expectedChanges(applied, { bundle = null } = {}) {
  const swaps = applied.map(getSwap).filter(Boolean);
  if (!swaps.length) return html`<p class="small muted">Nothing changes. This is the recipe as written.</p>`;
  const rows = DIMS.map(([k, label]) => [label, swaps.filter((s) => s.effects?.[k]).map((s) => ({ s, text: s.effects[k] }))]).filter(([, v]) => v.length);
  const unchanged = swaps.map((s) => s.effects?.unchanged).filter(Boolean);
  const balance = swaps.flatMap((s) => (s.balance ?? []).map((b) => ({ ...b, s })));
  const needs = swaps.flatMap((s) => s.requires ?? []);
  const ahead = swaps.map((s) => s.planAhead).filter(Boolean);
  const multi = swaps.length > 1;
  return html`
    ${bundle?.notes ? html`<p class="combo-note">${bundle.notes}</p>` : ""}
    <dl class="effects">
      ${rows.map(([label, items]) => html`<div><dt>${label}</dt><dd>${items.map((x) => html`<p>${multi ? html`<span class="effect-src">${x.s.label}:</span> ` : ""}${x.text}</p>`)}</dd></div>`)}
      ${unchanged.length ? html`<div class="effects-same"><dt>Stays the same</dt><dd>${unchanged.map((t) => html`<p>${t}</p>`)}</dd></div>` : ""}
    </dl>
    ${balance.length ? html`
      <div class="balance">
        <h4 class="eyebrow">Balancing adjustments, and why</h4>
        <ul>${balance.map((b) => html`<li><strong>${b.change}.</strong> ${b.why}</li>`)}</ul>
      </div>` : ""}
    ${needs.length || ahead.length ? html`<ul class="needs-list small">${[...ahead.map((t) => html`<li>${icon("clock")} ${t}</li>`), ...needs.map((t) => html`<li>${icon("info")} ${t}</li>`)]}</ul>` : ""}`;
}

// ---------- nutrition ----------

/** Per-serving comparison of the same serving definition; discloses serving size changes. */
export function nutritionCompare(before, after, { servings, recipe, open = false, targets = {} }) {
  const size = servingSizeChange(before, after);
  const row = (n) => html`
    <tr>
      <th scope="row">${NUTRIENT_LABEL[n]}${targets[n] != null ? html` <span class="muted small">goal ${targets[n]} g+</span>` : ""}</th>
      <td class="num">${formatRange(before[n], n)}</td>
      <td class="num">${formatRange(after[n], n)}</td>
      <td class="small">${direction(before[n], after[n])}</td>
    </tr>`;
  const missing = [...new Set(["protein", "fiber", "fat", "kcal"].flatMap((n) => after.missing[n]))];
  return html`
    <details class="nutrition" ${open ? "open" : ""} data-open-key="nut-${recipe.id}">
      <summary><span class="h3">Nutrition estimate</span><span class="tag">Optional</span></summary>
      <p class="small muted">Per serving (${recipe.servingDef.replace(/^1 of \d+: /, "")}). Both columns use the same serving definition at ${plural(servings, "serving")}.</p>
      ${size ? html`<p class="small notice-inline">${icon("info")} Each serving holds about ${Math.round(size.after)} g of food instead of ${Math.round(size.before)} g, because ingredients were ${size.change === "larger" ? "added" : "taken out"}. Compare with that in mind.</p>` : ""}
      <table class="nut-table">
        <thead><tr><th scope="col"><span class="visually-hidden">Nutrient</span></th><th scope="col">Original</th><th scope="col">Your version</th><th scope="col"><span class="visually-hidden">Change</span></th></tr></thead>
        <tbody>${row("protein")}${row("fiber")}</tbody>
      </table>
      <details class="more-nut" data-open-key="morenut-${recipe.id}">
        <summary class="small">Fat and energy</summary>
        <table class="nut-table"><tbody>${row("fat")}${row("kcal")}</tbody></table>
      </details>
      ${missing.length ? html`<p class="small warn">Can't estimate where data is missing: ${missing.join(", ")}. These are left as unknown, not counted as zero.</p>` : ""}
      <p class="small muted">${NUTRITION_SOURCE.label}: ${NUTRITION_SOURCE.detail} Shown as ±15% ranges. Not dietary or medical advice.</p>
    </details>`;
}

// ---------- requirement check ----------

export function requirementCheck(check, c) {
  const restricted = describe(c).length > 0;
  if (!restricted && !check.conflicts.length) return "";
  return html`
    <section class="req-check" aria-labelledby="req-check-h">
      <h3 id="req-check-h" class="eyebrow">Your requirements</h3>
      ${check.conflicts.length
        ? html`<ul class="conflicts">${check.conflicts.map((x) => html`<li>${icon("close")} ${x.reason}.</li>`)}</ul>`
        : html`<p class="small">No conflicts found with ${describe(c).join(", ")} in our ingredient data. This is not a safety check.</p>`}
      ${check.questions.length ? html`<ul class="conflicts">${check.questions.map((q) => html`<li>${icon("info")} ${q.text}</li>`)}</ul>` : ""}
      ${check.labelChecks.length ? html`
        <div class="label-checks">
          <p class="small"><strong>Check these labels.</strong> Their ingredients depend on the brand, and we can't see them:</p>
          <ul class="small">${check.labelChecks.map((l) => html`<li><strong>${ITEMS[l.item].name}</strong>: ${l.text}</li>`)}</ul>
        </div>` : ""}
    </section>`;
}

export function itemList(ids) {
  return ids.map(shortName).join(", ");
}
