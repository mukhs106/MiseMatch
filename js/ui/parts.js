// Shared view pieces: photos with credits, evidence labels, the constraints
// form, expected changes, nutrition comparison and label checks.

import { html, plural, raw } from "./html.js";
import { icon, checkNote } from "./icons.js";
import { ITEMS, ALLERGEN_LABEL, NUTRITION_SOURCE, shortName } from "../data/items.js";
import { getSwap, EVIDENCE } from "../data/swaps.js";
import { AVOID_OPTIONS, NUT_SCOPES, openQuestions, describe } from "../core/constraints.js";
import { NUTRIENT_LABEL, RANGE_NOTE, formatRange, direction, rawWeightChange } from "../core/nutrition.js";
import { renderEffect, servingDescription } from "../core/adapt.js";

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Each photo is a 4:3 web copy at 480 and 960 px wide (docs/image-sources.md).
const PHOTO_SIZES = { hero: "(min-width: 960px) 400px, (min-width: 720px) 45vw, 100vw", thumb: "64px", card: "(min-width: 720px) 240px, 40vw" };

/** The intentional tile for a dish with no photo, or a photo that failed to load. Same dimensions either way. */
export function photoTile(title, size = "card", label = null) {
  const initials = title.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  return html`<span class="photo photo--${size} photo--none" ${label ? html`role="img" aria-label="${label}"` : html`aria-hidden="true"`}><span class="tile-initials">${initials}</span></span>`;
}

/** A recipe photo with its credit. Credits stay honest: page links are still pending. */
export function photo(image, { size = "card", credit = true, title = "" } = {}) {
  if (!image) return "";
  const base = `assets/images/web/${image.file}`;
  return html`
    <figure class="photo photo--${size}" data-tile="${title}" data-size="${size}">
      <img src="${base}-480.jpg" srcset="${base}-480.jpg 480w, ${base}-960.jpg 960w" sizes="${PHOTO_SIZES[size]}" width="960" height="720" alt="${image.alt}" ${image.focal ? html`style="object-position: ${image.focal}"` : ""} loading="${size === "hero" ? "eager" : "lazy"}" decoding="async">
      ${credit ? html`<figcaption class="credit">Photo: Pexels, page link pending</figcaption>` : ""}
    </figure>`;
}

/** A recipe's photo, or a plain typographic tile when there's no suitable photo (never a stand-in dish). */
export function recipeImage(recipe, opts = {}) {
  if (recipe.image) return photo(recipe.image, { ...opts, title: recipe.title });
  return photoTile(recipe.title, opts.size ?? "card", opts.size === "hero" ? `${recipe.title}: no photo yet` : null);
}

/** "About 45 min, 30 hands-on, plus soaking ahead". Times are for the written batch. */
export function timeText(timing, planAhead = []) {
  const parts = [`About ${timing.elapsed} min`];
  if (timing.active < timing.elapsed) parts.push(`${timing.active} hands-on`);
  return `${parts.join(", ")}${timing.advance ? `, plus time ahead${planAhead.length ? `: ${planAhead.join(" ")}` : ""}` : ""}`;
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
export function constraintsForm(c, scope, { compact = false, questions = openQuestions(c) } = {}) {
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
export function expectedChanges(applied, { bundle = null, derived = null } = {}) {
  const swaps = applied.map(getSwap).filter(Boolean);
  if (!swaps.length) return html`<p class="small muted">Nothing changes. This is the recipe as written.</p>`;
  const rows = DIMS.map(([k, label]) => [label, swaps.filter((s) => s.effects?.[k]).map((s) => ({ s, text: renderEffect(s.effects[k], derived) }))]).filter(([, v]) => v.length);
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

/** Per-serving comparison of the same serving definition; reports raw weight added, never a plated weight. */
export function nutritionCompare(before, after, { servings, recipe, derived, open = false, targets = {} }) {
  const raw = rawWeightChange(before, after);
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
      <p class="small muted">Per serving (${servingDescription(derived)}). Both columns use the same serving definition at ${plural(servings, "serving")}.</p>
      ${raw ? html`<p class="small notice-inline">${icon("info")} ${raw.change === "more" ? `Adds about ${Math.round(raw.delta)} g of raw ingredients per serving` : `Takes out about ${Math.round(raw.delta)} g of raw ingredients per serving`}, compared with the original. That's uncooked weight going in, not the weight on the plate.</p>` : ""}
      <table class="nut-table">
        <caption class="visually-hidden">Protein and fiber per serving, original and your version</caption>
        <thead><tr><th scope="col"><span class="visually-hidden">Nutrient</span></th><th scope="col">Original</th><th scope="col">Your version</th><th scope="col"><span class="visually-hidden">Change</span></th></tr></thead>
        <tbody>${row("protein")}${row("fiber")}</tbody>
      </table>
      <details class="more-nut" data-open-key="morenut-${recipe.id}">
        <summary class="small">Fat and energy</summary>
        <table class="nut-table"><caption class="visually-hidden">Fat and energy per serving, original and your version</caption><thead class="visually-hidden"><tr><th scope="col">Nutrient</th><th scope="col">Original</th><th scope="col">Your version</th><th scope="col">Change</th></tr></thead><tbody>${row("fat")}${row("kcal")}</tbody></table>
      </details>
      ${missing.length ? html`<p class="small warn">${checkNote(`${missing.join(", ")}. These are left as unknown, not counted as zero.`, "Can't estimate where data is missing:")}</p>` : ""}
      ${after.optionalIncluded?.length ? html`<p class="small muted">Includes optional ${after.optionalIncluded.join(", ").toLowerCase()}. Leave it out and these figures would be lower.</p>` : ""}
      <p class="small muted">${NUTRITION_SOURCE.label}: ${NUTRITION_SOURCE.detail} ${RANGE_NOTE} Built from the rounded amounts shown. Not dietary or medical advice.</p>
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

/** One row of inline validation: what's wrong, and that the last valid value is kept. */
export function fieldError(message, id) {
  return message ? html`<span class="field-error small" id="${id}" role="alert">${checkNote(message, "Check:")}</span>` : "";
}

export function itemList(ids) {
  return ids.map(shortName).join(", ");
}
