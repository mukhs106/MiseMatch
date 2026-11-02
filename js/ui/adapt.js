// The adaptation flow: one recipe, four steps, one working session.
//   1 Portions and needs   servings and today's requirements (with clarifying questions)
//   2 Options              supported versions that fit, or an explanation of why none do
//   3 Compare              original and your version side by side: ingredients,
//                          expected changes, method, nutrition, requirement check
//   4 Pantry and shopping  check quantities, confirm unknown amounts, add shortfalls
// Every change autosaves to the session with undo. Saving to the collection is separate.

import { html, plural } from "./html.js";
import { icon } from "./icons.js";
import { ITEMS, shortName } from "../data/items.js";
import { getSwap, swapsForRecipe } from "../data/swaps.js";
import { getBundle, bundlesForRecipe } from "../data/bundles.js";
import { formatQty } from "../core/units.js";
import { formatRange } from "../core/nutrition.js";
import { evaluate } from "../core/engine.js";
import { deriveRecipe } from "../core/adapt.js";
import { availability } from "../core/pantry.js";
import { hasUnsavedChanges } from "../core/versions.js";
import { constraintsForm, constraintsSummary, questionRow, stepper, evidence, expectedChanges, nutritionCompare, requirementCheck, capitalize } from "./parts.js";

export const STEPS = [
  ["needs", "Portions and needs"],
  ["options", "Options"],
  ["compare", "Compare"],
  ["shop", "Pantry and shopping"],
];

export function adaptView(ctx, recipe, step) {
  const s = ctx.working(recipe.id);
  const base = s.baseVersion ? ctx.state.versions[s.baseVersion] : null;
  const unsaved = hasUnsavedChanges(s, ctx.state.versions);
  const body = step === "options" ? optionsStep(ctx, recipe, s)
    : step === "compare" ? compareStep(ctx, recipe, s)
      : step === "shop" ? shopStep(ctx, recipe, s)
        : needsStep(ctx, recipe, s);
  const i = STEPS.findIndex(([k]) => k === step);
  return html`
    <div class="page page--wide adapt-page">
      <a class="back-link" href="#/recipe/${recipe.id}">${icon("back")} ${recipe.title}</a>
      <header class="adapt-head">
        <p class="eyebrow">Adapting</p>
        <h1 tabindex="-1" data-route-focus>${recipe.title}</h1>
        <p class="small muted session-status">
          ${base ? html`From your “${base.name}”. ` : "From the original recipe. "}
          ${unsaved ? "Changes are kept as you go, but aren't in your collection until you save." : base ? "Matches your saved version." : "No changes yet."}
        </p>
      </header>
      <nav class="steps-nav" aria-label="Adaptation steps">
        <ol>
          ${STEPS.map(([k, label], n) => html`
            <li><button class="step-link" data-action="go-step" data-id="${recipe.id}" data-step="${k}" ${k === step ? html`aria-current="step"` : ""}>
              <span class="step-n" aria-hidden="true">${n + 1}</span><span class="step-label">${label}</span></button></li>`)}
        </ol>
      </nav>
      ${body}
      <div class="action-bar" role="region" aria-label="Session actions">
        <button class="btn btn--quiet" data-action="session-undo" data-id="${recipe.id}" ${s.history.length ? "" : "disabled"}>${icon("undo")} Undo</button>
        <button class="btn btn--secondary btn--small" data-action="save-version" data-id="${recipe.id}" ${unsaved ? "" : "disabled"}>${base ? "Save…" : "Save version"}</button>
        ${i < STEPS.length - 1
          ? html`<button class="btn btn--primary btn--small" data-action="go-step" data-id="${recipe.id}" data-step="${STEPS[i + 1][0]}">${i === 0 ? "See options" : STEPS[i + 1][1]} ${icon("next")}</button>`
          : html`<a class="btn btn--primary btn--small" href="#/cook/${recipe.id}">Cook now</a>`}
      </div>
    </div>`;
}

// ---------------------------------------------------------------- 1. Portions and needs

function needsStep(ctx, recipe, s) {
  const c = ctx.constraintsFor(recipe.id);
  const custom = !!ctx.session(recipe.id)?.constraints;
  return html`
    <section class="adapt-section" aria-labelledby="servings-h">
      <div class="servings-row">
        <div>
          <h2 id="servings-h">How many are you feeding?</h2>
          <p class="small muted">One serving: ${recipe.servingDef.replace(/^1 of \d+: /, "")}.</p>
        </div>
        ${stepper({ label: "servings", value: s.servings, action: "servings", data: { id: recipe.id }, labelId: "servings-h" })}
      </div>
      ${s.servings !== recipe.servings ? html`<p class="small scale-note">The recipe makes ${recipe.servings}. Quantities scale; cooking times, pan size and oil may need adjusting, and spices are marked to taste.</p>` : ""}
    </section>
    <section class="adapt-section" aria-labelledby="req-h">
      <div class="section-head">
        <h2 id="req-h">Requirements for today</h2>
      </div>
      <p class="small muted">${custom ? "Adjusted for this dish." : "Your usual requirements."} ${constraintsSummary(c)}.
        ${custom ? html`<button class="btn btn--quiet" data-action="c-save-profile" data-id="${recipe.id}">Make these my usual</button> <button class="btn btn--quiet" data-action="c-use-profile" data-id="${recipe.id}">Use my usual</button>` : ""}</p>
      ${constraintsForm(c, `session:${recipe.id}`)}
    </section>`;
}

// ---------------------------------------------------------------- 2. Options

function optionsStep(ctx, recipe, s) {
  const res = ctx.resolveFor(recipe.id);
  const c = ctx.constraintsFor(recipe.id);
  const selected = s.applied.join(",");
  const all = [...res.eligible];
  const top = all.slice(0, 3);
  const rest = all.slice(3);
  const own = s.applied.length && ![...res.eligible, ...res.needsAnswer, ...res.notEligible].some((o) => o.applied.join(",") === selected);
  return html`
    ${statusCard(ctx, recipe, res, c)}
    ${own ? ownCombination(ctx, recipe, s) : ""}
    ${all.length ? html`
      <section class="adapt-section" aria-labelledby="opts-h">
        <div class="section-head"><h2 id="opts-h">Versions that fit</h2><span class="small muted">${plural(all.length, "option")} for ${plural(s.servings, "serving")}</span></div>
        <p class="small muted">Best match first: goals, then fewer purchases, then less time. Every option is a suggestion we haven't cooked yet.</p>
        <ul class="option-cards">${top.map((o) => optionCard(recipe, o, selected))}</ul>
        ${rest.length ? html`
          <details class="more" data-open-key="opts-${recipe.id}" ${ctx.ui.open[`opts-${recipe.id}`] ? "open" : ""}>
            <summary>${plural(rest.length, "more option")}</summary>
            <ul class="option-cards">${rest.map((o) => optionCard(recipe, o, selected))}</ul>
          </details>` : ""}
      </section>` : ""}
    ${singleChanges(recipe, s)}
    ${res.notEligible.length ? html`
      <details class="more not-eligible" data-open-key="ne-${recipe.id}" ${ctx.ui.open[`ne-${recipe.id}`] ? "open" : ""}>
        <summary>${plural(res.notEligible.length, "option")} that don't fit your requirements</summary>
        <ul class="ne-list">${res.notEligible.map((o) => html`<li><strong>${o.label}</strong><ul class="small">${o.blockers.map((b) => html`<li>${b.text}</li>`)}</ul></li>`)}</ul>
      </details>` : ""}`;
}

function statusCard(ctx, recipe, res, c) {
  if (res.status === "ok") {
    const hasT = Object.values(c.targets).some((v) => v != null);
    const restricted = hasT || c.diet || c.avoid.length || c.timeLimit;
    return html`<div class="status status--ok" role="status"><p>${restricted
      ? html`<strong>${hasT ? "These versions reach your goals." : "These versions fit your requirements."}</strong> Pick one to compare it with the original.`
      : html`<strong>No requirements set, so nothing has to change.</strong> Pick a version below, change one ingredient, or <button class="btn btn--quiet" data-action="go-step" data-id="${recipe.id}" data-step="needs">add requirements or a goal</button>.`}</p></div>`;
  }
  if (res.status === "needs-answer") {
    return html`
      <div class="status status--ask" role="status">
        <p><strong>One question first.</strong> ${res.explanation}</p>
        ${res.questions.map((q) => questionRow(q, c, `session:${recipe.id}`))}
      </div>`;
  }
  const choices = res.choices;
  const lower = choices.find((x) => x.type === "lower-target");
  const sides = choices.filter((x) => x.type === "accompaniment");
  const others = choices.filter((x) => x.type === "other-dish");
  return html`
    <div class="status ${res.status === "no-supported" ? "status--none" : "status--conflict"}" role="status">
      <p><strong>${res.status === "no-supported" ? "No supported version fits." : "Your goal and requirements pull in different directions."}</strong> ${res.explanation}</p>
      <p class="small">Your requirements stay as they are unless you change them.</p>
      ${lower || sides.length || others.length ? html`<h3 class="eyebrow">What you could do</h3><ul class="choices">
        ${lower ? Object.entries(lower.values).map(([n, v]) => html`<li><button class="btn btn--secondary btn--small" data-action="c-lower-target" data-id="${recipe.id}" data-nutrient="${n}" data-value="${v}">Lower the ${n} goal to ${v} g</button> <span class="small muted">A flexible goal you set; the best version then qualifies.</span></li>`) : ""}
        ${sides.map((a) => html`<li><a class="btn btn--secondary btn--small" href="#/recipe/${a.recipe.id}">Serve with ${a.recipe.title}</a> <span class="small muted">${a.option.kind === "original" ? "As written" : a.option.label}, which fits your requirements: adds about ${formatRange(a.adds.protein, "protein")} protein per serving.</span></li>`)}
        ${others.map((o) => html`<li><a class="btn btn--secondary btn--small" href="#/recipe/${o.recipe.id}">${o.recipe.title}</a> <span class="small muted">${o.option.kind === "original" ? "As written" : o.option.label}${o.meets ? ", reaches your goals" : ", fits your requirements"}.</span></li>`)}
      </ul>` : ""}
      ${res.status === "no-supported" ? html`<button class="btn btn--quiet" data-action="go-step" data-id="${recipe.id}" data-step="needs">Review requirements</button>` : ""}
    </div>`;
}

function optionCard(recipe, o, selected) {
  const chosen = o.applied.join(",") === selected;
  const ev = o.ev;
  const swaps = o.applied.map(getSwap);
  const firstEffects = swaps.flatMap((x) => ["richness", "texture", "aroma"].map((k) => x.effects?.[k]).filter(Boolean)).slice(0, 2);
  const tStatus = Object.entries(ev.targets).map(([n, t]) => ({ n, ...t }));
  const STATUS_TEXT = { meets: "reaches your goal", maybe: "may reach your goal", misses: "below your goal", unknown: "can't estimate" };
  return html`
    <li class="option-card ${chosen ? "is-chosen" : ""}">
      <div class="oc-head">
        <h3>${o.kind === "original" ? "The recipe as written" : o.label}</h3>
        ${chosen ? html`<span class="tag tag--yolk">${icon("check")} Chosen</span>` : ""}
      </div>
      ${swaps.length > 1 ? html`<p class="oc-rules small">${swaps.map((x) => x.label).join(" · ")}</p>` : swaps.length ? html`<p class="oc-rules small">${swaps[0].summary}</p>` : html`<p class="small muted">No ingredient changes.</p>`}
      ${o.bundle?.notes ? html`<p class="small">${o.bundle.notes}</p>` : firstEffects.length ? html`<ul class="oc-effects small">${firstEffects.map((t) => html`<li>${t}</li>`)}</ul>` : ""}
      <p class="oc-meta small">
        ${tStatus.map((t) => html`<span>${capitalize(t.n)} ${formatRange(ev.nutrition[t.n], t.n)}, ${STATUS_TEXT[t.status]}</span>`)}
        <span>${ev.purchases ? `${ev.purchases} to buy` : "Nothing to buy"}</span>
        <span>About ${ev.minutes} min</span>
        ${ev.planAhead.length ? html`<span>${icon("clock")} Plan ahead</span>` : ""}
      </p>
      ${ev.check.dislikes.length ? html`<p class="small warn">Includes ${ev.check.dislikes.map(shortName).join(", ")}, which you'd rather avoid.</p>` : ""}
      <div class="oc-foot">
        ${swaps.length ? evidence("suggested") : html`<span class="small muted">${recipe.source.label}</span>`}
        ${chosen
          ? html`<button class="btn btn--secondary btn--small" data-action="go-step" data-id="${recipe.id}" data-step="compare">Compare</button>`
          : html`<button class="btn btn--secondary btn--small" data-action="choose-option" data-id="${recipe.id}" data-applied="${o.applied.join(",")}" data-label="${o.label}">Choose</button>`}
      </div>
    </li>`;
}

function ownCombination(ctx, recipe, s) {
  const ev = ctx.evalFor(recipe.id);
  const untested = ev.combo.status === "untested";
  return html`
    <div class="status ${untested ? "status--conflict" : ""}" role="status">
      <p><strong>Your own combination:</strong> ${s.applied.map((id) => getSwap(id).label).join(" · ")}.</p>
      ${untested ? html`<p class="small">Untested combination: ${ev.combo.untested.map((p) => `${p.a.label} with ${p.b.label}`).join("; ")} ${ev.combo.untested.length === 1 ? "hasn't" : "haven't"} been written to go together. Each rule is supported on its own; together, the result is a guess.</p>` : ""}
      ${ev.check.conflicts.length ? html`<p class="small warn">It conflicts with your requirements: ${ev.check.conflicts.map((x) => x.reason).join("; ")}.</p>` : ""}
    </div>`;
}

function singleChanges(recipe, s) {
  const swaps = swapsForRecipe(recipe.id);
  const slots = recipe.ingredients.filter((i) => swaps.some((x) => x.replace?.slot === i.slot || x.omit === i.slot));
  const adds = swaps.filter((x) => !x.replace && !x.omit);
  if (!slots.length && !adds.length) return "";
  return html`
    <section class="adapt-section" aria-labelledby="single-h">
      <h2 id="single-h">Change one thing</h2>
      <p class="small muted">Missing an ingredient, or want a single change? Each one shows what changes before you apply it.</p>
      <div class="ways" role="group" aria-labelledby="single-h">
        ${slots.map((i) => html`<button class="btn btn--secondary btn--small" data-action="open-swaps" data-id="${recipe.id}" data-slot="${i.slot}" aria-label="Options for ${shortName(i.item)}">${icon("swap")} ${capitalize(shortName(i.item))}</button>`)}
        ${adds.map((x) => html`<button class="btn btn--secondary btn--small" data-action="preview-swap" data-id="${recipe.id}" data-swap="${x.id}">${s.applied.includes(x.id) ? icon("check") : icon("plus")} ${x.label}</button>`)}
      </div>
      ${s.applied.length ? html`<button class="btn btn--quiet" data-action="restore-original" data-id="${recipe.id}">Back to the recipe as written</button>` : ""}
    </section>`;
}

// ---------------------------------------------------------------- 3. Compare

function entriesText(line) {
  if (!line || line.omitted || !line.entries.length) return null;
  return line.entries.map((e) => `${formatQty(e.qty, e.unit, e.step)} ${ITEMS[e.item].name.toLowerCase()}${e.prep ? `, ${e.prep}` : ""}`).join(" + ");
}

function compareStep(ctx, recipe, s) {
  const c = ctx.constraintsFor(recipe.id);
  const ev = ctx.evalFor(recipe.id);
  const orig = evaluate(recipe, { servings: s.servings, applied: [] }, c, ctx.state.pantry);
  const bundle = bundlesForRecipe(recipe.id).find((b) => b.swaps.join(",") === s.applied.join(","));
  const slots = [...new Set([...orig.derived.ingredients, ...ev.derived.ingredients].map((l) => l.slot))];
  const rows = slots.map((slot) => {
    const b = orig.derived.ingredients.find((l) => l.slot === slot);
    const a = ev.derived.ingredients.find((l) => l.slot === slot);
    return { slot, before: entriesText(b), after: entriesText(a), changed: entriesText(b) !== entriesText(a) || (a?.changedBy.length ?? 0) > 0 };
  });
  const changed = rows.filter((r) => r.changed);
  const same = rows.filter((r) => !r.changed);
  const stepRows = [];
  ev.derived.steps.forEach((st, i) => {
    const b = orig.derived.steps.find((x) => x.id === st.id);
    if (!b) stepRows.push({ n: i + 1, kind: "Added", text: st.text });
    else if (b.text !== st.text) stepRows.push({ n: i + 1, kind: "Changed", text: st.text, was: b.text });
  });
  const hasT = Object.values(c.targets).some((v) => v != null);
  return html`
    <div class="compare-summary">
      <div><span class="eyebrow">Original</span><strong>${plural(s.servings, "serving")}</strong><span class="small muted">About ${orig.minutes} min</span></div>
      <div><span class="eyebrow">Your version</span><strong>${plural(s.servings, "serving")}</strong><span class="small muted">About ${ev.minutes} min${ev.planAhead.length ? " · plan ahead" : ""}</span></div>
    </div>
    <p class="small muted compare-basis">${s.servings !== recipe.servings ? `The original makes ${recipe.servings}; it's scaled to ${s.servings} here so both sides compare like for like. ` : ""}<a href="#/recipe/${recipe.id}">See the source recipe as written</a>.</p>
    ${ev.combo.status === "untested" ? html`<div class="status status--conflict" role="status"><p><strong>Untested combination.</strong> ${ev.combo.untested.map((p) => `${p.a.label} and ${p.b.label}`).join("; ")} weren't written to go together. The changes below are each rule's own prediction, not a prediction for the combination.</p></div>` : ""}
    ${ev.combo.status === "blocked" ? html`<div class="status status--none" role="status"><p><strong>These changes don't work together:</strong> ${ev.combo.blocked.map((b) => b.reason).join(" ")}</p></div>` : ""}

    <div class="compare-grid">
      <section class="adapt-section" aria-labelledby="chg-h">
        <div class="section-head"><h2 id="chg-h">What changes in the dish</h2>${s.applied.length ? evidence("suggested") : ""}</div>
        ${expectedChanges(s.applied, { bundle })}
      </section>

      <section class="adapt-section" aria-labelledby="ingcmp-h">
        <h2 id="ingcmp-h">Ingredients</h2>
        ${changed.length ? html`
          <table class="cmp-table">
            <thead><tr><th scope="col">Original</th><th scope="col">Your version</th></tr></thead>
            <tbody>${changed.map((r) => html`<tr class="is-changed"><td>${r.before ?? html`<span class="muted">Not in the recipe</span>`}</td><td>${r.after ?? html`<span class="muted">Left out</span>`}</td></tr>`)}</tbody>
          </table>` : html`<p class="small muted">No ingredient changes${s.servings !== recipe.servings ? ", only scaled quantities" : ""}.</p>`}
        ${same.length ? html`
          <details class="more" data-open-key="same-${recipe.id}" ${ctx.ui.open[`same-${recipe.id}`] ? "open" : ""}>
            <summary>${plural(same.length, "unchanged ingredient")}</summary>
            <ul class="plain-list small">${same.map((r) => html`<li>${r.after}</li>`)}</ul>
          </details>` : ""}
      </section>
    </div>

    <section class="adapt-section" aria-labelledby="mcmp-h">
      <h2 id="mcmp-h">Method changes</h2>
      ${stepRows.length ? html`<ul class="step-diff">${stepRows.map((r) => html`
        <li><span class="tag tag--yolk">Step ${r.n} · ${r.kind}</span><p>${r.text}</p>${r.was ? html`<p class="small muted"><span class="visually-hidden">Before: </span><s>${r.was}</s></p>` : ""}</li>`)}</ul>`
        : html`<p class="small muted">The method is the same.</p>`}
    </section>

    ${nutritionCompare(orig.nutrition, ev.nutrition, { servings: s.servings, recipe, open: hasT, targets: c.targets })}
    ${requirementCheck(ev.check, c)}`;
}

// ---------------------------------------------------------------- 4. Pantry and shopping

const GROUPS = [["main", "Main ingredients"], ["serve", "To serve"], ["spices", "Spices and seasonings"], ["staples", "Staples"]];

function shopStep(ctx, recipe, s) {
  const d = deriveRecipe(recipe, s);
  const needs = ctx.sessionNeeds(recipe.id);
  const buy = needs.filter((n) => !n.check);
  const check = needs.filter((n) => n.check);
  const planned = ctx.state.plan.filter((p) => p.recipeId === recipe.id);
  return html`
    <section class="adapt-section" aria-labelledby="have-h">
      <h2 id="have-h">What do you have?</h2>
      <p class="small muted">Amounts go to your pantry and are shared by every meal you plan, counted once.</p>
      ${GROUPS.map(([g, label]) => {
        const entries = d.ingredients.filter((l) => l.group === g).flatMap((l) => l.entries).filter((e) => !ITEMS[e.item].noShop);
        if (!entries.length) return "";
        const compact = g === "spices" || g === "staples";
        const have = entries.filter((e) => ctx.state.pantry[e.item]).length;
        const allHave = have === entries.length;
        if (compact) {
          const key = `grp-${recipe.id}-${g}`;
          return html`
            <div class="group group--compact">
              <div class="group-head"><h3 class="group-label eyebrow">${label}</h3>
                <button class="btn btn--quiet" data-action="group-have" data-id="${recipe.id}" data-group="${g}" ${allHave ? "disabled" : ""}>${allHave ? "All in your pantry" : "I have all of these"}</button></div>
              <details class="more" data-open-key="${key}" ${ctx.ui.open[key] ? "open" : ""}>
                <summary class="small">${entries.length} items · ${have ? `${have} in your pantry` : "none in your pantry yet"}. Mark one by one</summary>
                <ul class="have-list">${entries.map((e) => haveRow(ctx, e, true))}</ul>
              </details>
            </div>`;
        }
        return html`
          <div class="group">
            <div class="group-head"><h3 class="group-label eyebrow">${label}</h3></div>
            <ul class="have-list">${entries.map((e) => haveRow(ctx, e, false))}</ul>
          </div>`;
      })}
    </section>
    ${check.length ? html`
      <section class="adapt-section" aria-labelledby="confirm-h">
        <h2 id="confirm-h">Do you have enough?</h2>
        <p class="small muted">These are in your pantry without an amount, so we don't assume you have enough.</p>
        <ul class="confirm-list">${check.map((n) => confirmRow(`session:${recipe.id}|${n.item}`, n))}</ul>
      </section>` : ""}
    <section class="adapt-section" aria-labelledby="short-h">
      <div class="section-head"><h2 id="short-h">${buy.length ? `${plural(buy.length, "thing")} to buy` : "Nothing to buy"}</h2></div>
      ${buy.length ? html`<ul class="short-list">${buy.map((n) => html`<li><span class="num">${formatQty(n.qty, n.unit, n.step)}</span> <span>${n.name}</span>${n.note ? html`<span class="small muted">${n.note}</span>` : ""}${n.uncertain ? html`<span class="small warn">Check before buying</span>` : ""}</li>`)}</ul>` : ""}
      ${planned.length ? html`<p class="small">${icon("list")} Already planned: ${planned.map((p) => `${p.label}, ${plural(p.servings, "serving")}`).join("; ")}. <a href="#/list">Shopping list</a></p>` : ""}
      <div class="actions">
        <button class="btn btn--secondary" data-action="add-plan" data-id="${recipe.id}" ${buy.length || check.length ? "" : ""}>${icon("list")} Add to shopping list</button>
        <a class="btn btn--quiet" href="#/cook/${recipe.id}">Cook without saving</a>
      </div>
    </section>`;
}

function haveRow(ctx, e, compact) {
  const item = ITEMS[e.item];
  const a = availability(ctx.state.pantry, e.item);
  const id = `have-${e.item}`;
  return html`
    <li class="have-row">
      <div class="have-text"><span class="qty num">${formatQty(e.qty, e.unit, e.step)}</span> <span>${item.name}</span></div>
      <div class="have-ctl">
        <label class="visually-hidden" for="${id}">Do you have ${item.name}?</label>
        <select id="${id}" class="select select--small" data-action="pantry-mark" data-item="${e.item}">
          <option value="need" ${a.status === "need" ? "selected" : ""}>Don't have</option>
          <option value="have" ${a.status === "have" ? "selected" : ""}>Have, amount unknown</option>
          ${compact ? "" : html`<option value="some" ${a.status === "some" ? "selected" : ""}>Have this much…</option>`}
        </select>
        ${a.status === "some" && !compact ? html`
          <label class="have-qty"><span class="visually-hidden">Amount of ${item.name}${e.unit ? ` in ${e.unit}` : ""}</span>
            <input class="input input--num" type="number" inputmode="decimal" min="0" step="any" value="${a.qty ?? ""}" placeholder="amount" data-action="pantry-qty" data-key="${e.item}" data-unit="${a.unit ?? e.unit}">
            <span class="small">${(a.unit ?? e.unit) || "count"}</span></label>` : ""}
      </div>
    </li>`;
}

export function confirmRow(key, n) {
  return html`
    <li class="confirm-row">
      <span><strong>${n.name}</strong> <span class="small muted">need ${formatQty(n.qty, n.unit, n.step)}. ${n.note}</span></span>
      <span class="confirm-btns">
        <button class="btn btn--secondary btn--small" data-action="confirm" data-key="${key}" data-value="enough">I have enough</button>
        <button class="btn btn--quiet" data-action="confirm" data-key="${key}" data-value="buy">Buy it</button>
      </span>
    </li>`;
}
