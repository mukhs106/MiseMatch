// The adaptation flow: one recipe, four steps, one working session.
//   1 Portions and needs   servings, what's missing or on hand, and today's requirements
//   2 Options              supported versions that fit, or an explanation of why none do
//   3 Compare              original and your version side by side: ingredients,
//                          expected changes, method, nutrition, requirement check
//   4 Pantry and shopping  check quantities, confirm unknown amounts, add shortfalls
// Every change autosaves to the session with undo. Saving to the collection is separate.

import { html, plural } from "./html.js";
import { icon, checkNote } from "./icons.js";
import { ITEMS, shortName } from "../data/items.js";
import { getSwap, swapsForRecipe } from "../data/swaps.js";
import { bundlesForRecipe } from "../data/bundles.js";
import { formatQty } from "../core/units.js";
import { formatRange } from "../core/nutrition.js";
import { evaluate } from "../core/engine.js";
import { deriveRecipe, servingsBounds, servingDescription, scalingNotes, approximations } from "../core/adapt.js";
import { availability, amountText } from "../core/pantry.js";
import { formatShopQty } from "../core/shopping.js";
import { hasUnsavedChanges } from "../core/versions.js";
import { constraintsForm, constraintsSummary, questionRow, stepper, evidence, expectedChanges, nutritionCompare, requirementCheck, capitalize, timeText, fieldError } from "./parts.js";

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
      ${s.scenario ? html`<div class="status" role="status"><p><strong>Preview: ${recipe.title} for ${s.servings}, no fresh tomatoes.</strong> This is a worked example with canned tomatoes chosen for you. Nothing is saved to your collection or pantry, and you can change anything. <button class="btn btn--quiet" data-action="confirm-discard-session" data-id="${recipe.id}">Leave the preview</button></p></div>` : ""}
      ${s.droppedRules?.length ? html`<div class="status status--conflict" role="status"><p><strong>Not carried over:</strong> ${s.droppedRules.join(", ")}. That change is no longer in the catalogue. Your saved version still records it.</p></div>` : ""}
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
            <li><button class="step-link" data-action="go-step" data-id="${recipe.id}" data-step="${k}" aria-label="Step ${n + 1}: ${label}" ${k === step ? html`aria-current="step"` : ""}>
              <span class="step-n" aria-hidden="true">${n + 1}</span><span class="step-label">${label}</span></button></li>`)}
        </ol>
      </nav>
      ${body}
      <div class="action-bar" role="region" aria-label="Session actions">
        <button class="btn btn--quiet" data-action="session-undo" data-id="${recipe.id}" ${s.history.length ? "" : "disabled"}>${icon("undo")} Undo</button>
        <button class="btn btn--secondary btn--small" data-action="save-version" data-id="${recipe.id}" ${unsaved ? "" : html`disabled aria-describedby="save-why"`}>${base ? "Save…" : "Save version"}</button>
        ${unsaved ? "" : html`<span id="save-why" class="visually-hidden">Nothing to save yet: this matches ${base ? "your saved version" : "the original"}.</span>`}
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
  const [min, max] = servingsBounds(recipe);
  const d = deriveRecipe(recipe, s);
  const notes = scalingNotes(d);
  const res = ctx.resolveFor(recipe.id);
  const ev = ctx.evalFor(recipe.id);
  return html`
    <section class="adapt-section" aria-labelledby="servings-h">
      <div class="servings-row">
        <div>
          <h2 id="servings-h">How many are you feeding?</h2>
          <p class="small muted">One serving: ${servingDescription(d)}. This dish is written for ${min} to ${max} servings.</p>
        </div>
        ${stepper({ label: "servings", value: s.servings, min, max, action: "servings", data: { id: recipe.id }, labelId: "servings-h" })}
      </div>
      ${s.servings !== recipe.servings ? html`
        <div class="small scale-note"><p>The recipe makes ${recipe.servings}. Quantities scale from that.</p>
          <ul>${notes.map((n) => html`<li>${n.text}</li>`)}</ul></div>` : ""}
      ${portionProblems(ev)}
    </section>
    ${missingStep(ctx, recipe, s)}
    <section class="adapt-section" aria-labelledby="req-h">
      <div class="section-head">
        <h2 id="req-h">Requirements for today</h2>
      </div>
      <p class="small muted">${custom ? "Adjusted for this dish, for today. Your usual requirements stay as they are." : "Your usual requirements, as a starting point. Changes here apply to this dish only."} ${constraintsSummary(c)}.
        ${custom ? html`<button class="btn btn--quiet" data-action="c-save-profile" data-id="${recipe.id}">Make these my usual</button> <button class="btn btn--quiet" data-action="c-use-profile" data-id="${recipe.id}">Use my usual</button>` : ""}</p>
      ${constraintsForm(c, `session:${recipe.id}`, { questions: res.questions })}
    </section>`;
}

/** Applied rules or portions outside what's written, named with the reason. */
function portionProblems(ev) {
  if (!ev.portionIssue && !ev.qtyIssues.length) return "";
  return html`<div class="notice" role="status">
    ${ev.portionIssue ? html`<p><strong>Unsupported batch size.</strong> ${ev.portionIssue}</p>` : ""}
    ${ev.qtyIssues.map((q) => html`<p><strong>${q.swap.label} doesn't fit ${plural(ev.adaptation.servings, "serving")}.</strong> ${q.reason} <button class="btn btn--quiet" data-action="remove-swap" data-id="${ev.recipe.id}" data-swap="${q.swap.id}" aria-label="Remove ${q.swap.label}">Remove this change</button></p>`)}
  </div>`;
}

// Key ingredients and the ready alternatives to them. Reads the pantry, and writes
// only what you say. Skipping leaves everything as not checked.
function relevantItems(recipe) {
  const main = recipe.ingredients.filter((i) => ITEMS[i.item]?.key && i.group !== "serve" && !i.optional).map((i) => i.item);
  const alternatives = swapsForRecipe(recipe.id).filter((x) => x.reasons.includes("missing")).flatMap((x) => (x.replace?.with ?? []).map((w) => w.item)).filter((id) => ITEMS[id]?.key);
  return { main: [...new Set(main)], alternatives: [...new Set(alternatives)].filter((id) => !main.includes(id)) };
}

function missingStep(ctx, recipe, s) {
  const { main, alternatives } = relevantItems(recipe);
  const missing = s.missing ?? [];
  const row = (id) => {
    const a = availability(ctx.state.pantry, id);
    const isMissing = missing.includes(id) || a.status === "out";
    const has = a.status === "have" || a.status === "some";
    const name = ITEMS[id].name;
    return html`
      <li class="need-row">
        <span class="need-name">${name}${has ? html` <span class="small muted">${amountText(ctx.state.pantry[id])}</span>` : ""}</span>
        <span class="need-btns" role="group" aria-label="${name}">
          <button class="chip" aria-pressed="${has}" data-action="mark-have" data-id="${recipe.id}" data-item="${id}" aria-label="I have ${name}">${has ? icon("check") : ""}Have it</button>
          <button class="chip" aria-pressed="${isMissing}" data-action="mark-missing" data-id="${recipe.id}" data-item="${id}" aria-label="${name} is missing">${isMissing ? icon("check") : ""}Missing</button>
        </span>
      </li>`;
  };
  const key = `needs-alt-${recipe.id}`;
  return html`
    <section class="adapt-section" aria-labelledby="missing-h">
      <h2 id="missing-h">What needs changing?</h2>
      <p class="small muted">Optional. Mark what's missing or on hand, and the options change to suit. Anything you skip stays not checked. "Missing" applies to today only.</p>
      <ul class="need-list">${main.map(row)}</ul>
      ${alternatives.length ? html`
        <details class="more" data-open-key="${key}" ${alternatives.some((id) => ctx.state.pantry[id]) ? "open" : ""}>
          <summary class="small">Have any of the alternatives?</summary>
          <ul class="need-list">${alternatives.map(row)}</ul>
        </details>` : ""}
    </section>`;
}

// ---------------------------------------------------------------- 2. Options

const FIT_GROUPS = [
  ["meets", "Meets your goals", "The whole estimated range reaches every goal you set."],
  ["may", "May meet your goals", "The estimated range straddles a goal, so it might or might not reach it."],
  ["closest", "Closest supported", "These don't reach a goal you set. They fit your other requirements and come nearest."],
  ["unknown", "Can't estimate", "Our data can't estimate a goal you set for these, so there's nothing to compare."],
];

function optionsStep(ctx, recipe, s) {
  const res = ctx.resolveFor(recipe.id);
  const c = ctx.constraintsFor(recipe.id);
  const selected = s.applied.join(",");
  const hasT = Object.values(c.targets).some((v) => v != null);
  const own = s.applied.length && ![...res.eligible, ...res.needsAnswer, ...res.notEligible].some((o) => o.applied.join(",") === selected);
  const list = (items, key) => {
    const top = items.slice(0, 3);
    const rest = items.slice(3);
    return html`
      <ul class="option-cards">${top.map((o) => optionCard(recipe, o, selected, s.servings))}</ul>
      ${rest.length ? html`
        <details class="more" data-open-key="${key}" ${ctx.ui.open[key] ? "open" : ""}>
          <summary>${plural(rest.length, "more option")}</summary>
          <ul class="option-cards">${rest.map((o) => optionCard(recipe, o, selected, s.servings))}</ul>
        </details>` : ""}`;
  };
  return html`
    ${statusCard(ctx, recipe, res, c)}
    ${portionProblems(ctx.evalFor(recipe.id))}
    ${own ? ownCombination(ctx, recipe, s) : ""}
    ${res.eligible.length && !hasT ? html`
      <section class="adapt-section" aria-labelledby="opts-h">
        <div class="section-head"><h2 id="opts-h">Versions that fit</h2><span class="small muted">${plural(res.eligible.length, "option")} for ${plural(s.servings, "serving")}</span></div>
        <p class="small muted">${optionsOrder(s, ctx)} These are suggestions we haven't cooked yet.</p>
        ${list(res.eligible, `opts-${recipe.id}`)}
      </section>` : ""}
    ${res.eligible.length && hasT ? FIT_GROUPS.filter(([k]) => res.fit[k].length).map(([k, title, why]) => html`
      <section class="adapt-section" aria-labelledby="opts-${k}-h">
        <div class="section-head"><h2 id="opts-${k}-h">${title}</h2><span class="small muted">${plural(res.fit[k].length, "option")} for ${plural(s.servings, "serving")}</span></div>
        <p class="small muted">${why} ${optionsOrder(s, ctx)}</p>
        ${list(res.fit[k], `opts-${k}-${recipe.id}`)}
      </section>`) : ""}
    ${res.needsAnswer.length && res.eligible.length ? html`
      <details class="more" data-open-key="na-${recipe.id}">
        <summary>${plural(res.needsAnswer.length, "option")} waiting on an answer</summary>
        <ul class="ne-list">${res.needsAnswer.map((o) => html`<li><strong>${o.label}</strong><ul class="small">${o.ev.check.questions.map((q) => html`<li>${q.text}</li>`)}</ul></li>`)}</ul>
        ${res.questions.map((q) => questionRow(q, c, `session:${recipe.id}`))}
      </details>` : ""}
    ${singleChanges(recipe, s)}
    ${res.notEligible.length ? html`
      <details class="more not-eligible" data-open-key="ne-${recipe.id}" ${ctx.ui.open[`ne-${recipe.id}`] ? "open" : ""}>
        <summary>${plural(res.notEligible.length, "option")} that ${res.notEligible.length === 1 ? "doesn't" : "don't"} fit</summary>
        <ul class="ne-list">${res.notEligible.map((o) => html`<li><strong>${o.label}</strong><ul class="small">${o.blockers.map((b) => html`<li>${b.text}</li>`)}</ul></li>`)}</ul>
      </details>` : ""}`;
}

function optionsOrder(s, ctx) {
  const missing = missingNames(s, ctx);
  return missing.length ? `Avoiding ${missing.join(" and ")} comes first, then fewer purchases and less time.` : "Fewer purchases and less time come first.";
}

function missingNames(s, ctx) {
  return (s.missing ?? []).concat(Object.entries(ctx.state.pantry).filter(([k, e]) => ITEMS[k] && (e.out || e.qty === 0)).map(([k]) => k)).filter((v, i, a) => a.indexOf(v) === i).filter((id) => ctx.recipe(s.recipeId)?.ingredients.some((i) => i.item === id)).map(shortName);
}

const STATUS_LEAD = {
  "may-meet": "No version is certain to reach your goal.",
  "out-of-reach": "No supported version reaches your goal.",
  requirements: "Your requirements rule out the versions that would reach your goal.",
  "no-data": "We can't estimate this goal for these versions.",
  competing: "No single version reaches both goals.",
};

function statusCard(ctx, recipe, res, c) {
  if (res.status === "ok") {
    const hasT = Object.values(c.targets).some((v) => v != null);
    const restricted = hasT || c.diet || c.avoid.length || c.timeLimit;
    const missing = missingNames(ctx.working(recipe.id), ctx);
    return html`<div class="status status--ok" role="status"><p>${!restricted && missing.length
      ? html`<strong>You marked ${missing.join(" and ")} missing, so versions without ${missing.length === 1 ? "it" : "them"} come first.</strong> Pick one to compare it with the original.`
      : restricted
      ? html`<strong>${hasT ? `${plural(res.fit.meets.length, "version")} ${res.fit.meets.length === 1 ? "reaches" : "reach"} your goals.` : "These versions fit your requirements."}</strong> Pick one to compare it with the original.`
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
  const lead = res.status === "no-supported" ? (res.cause === "time" ? "No supported version fits your time limit." : res.cause === "portions" ? "No supported version fits these portions." : "No supported version fits.") : STATUS_LEAD[res.cause];
  const lowerText = lower ? Object.entries(lower.values).map(([n, v]) => `${n} ${v} g`).join(" and ") : "";
  const proposal = (o, label) => html`<button class="btn btn--secondary btn--small" data-action="review-proposal" data-id="${o.recipe.id}" data-applied="${o.option.applied.join(",")}" data-servings="${o.servings}">${label}</button>`;
  return html`
    <div class="status ${res.status === "no-supported" ? "status--none" : "status--conflict"}" role="status">
      <p><strong>${lead}</strong> ${res.explanation}</p>
      ${c.diet || c.avoid.length || c.timeLimit ? html`<p class="small">Your requirements stay as they are unless you change them.</p>` : ""}
      ${lower || sides.length || others.length ? html`<h3 class="eyebrow">What you could do</h3><ul class="choices">
        ${lower ? html`<li><button class="btn btn--secondary btn--small" data-action="c-lower-target" data-id="${recipe.id}" data-values="${JSON.stringify(lower.values)}">${Object.keys(lower.values).length === 1 ? `Lower the ${Object.keys(lower.values)[0]} goal to ${Object.values(lower.values)[0]} g` : `Lower the goals to ${lowerText}`}</button> <span class="small muted">A flexible goal you set. “${lower.option.kind === "original" ? "As written" : lower.option.label}” then reaches ${Object.keys(lower.values).length === 1 ? "it" : "all of them"} on its own.</span></li>` : ""}
        ${sides.map((a) => html`<li>${proposal(a, `Review ${a.recipe.title} for ${a.servings}`)} <span class="small muted">A separate dish to serve alongside: ${a.option.kind === "original" ? "as written" : a.option.label}, about ${formatRange(a.adds.protein, "protein")} protein per serving on its own. Quantities and time aren't combined until you plan both.</span></li>`)}
        ${others.map((o) => html`<li>${proposal(o, `Review ${o.recipe.title} for ${o.servings}`)} <span class="small muted">${o.option.kind === "original" ? "As written" : o.option.label}${o.meets ? ", reaches your goals" : ", fits your requirements"}.</span></li>`)}
      </ul>` : ""}
      ${res.status === "no-supported" ? html`<button class="btn btn--quiet" data-action="go-step" data-id="${recipe.id}" data-step="needs">Review requirements</button>` : ""}
    </div>`;
}

function optionCard(recipe, o, selected, servings) {
  const chosen = o.applied.join(",") === selected;
  const ev = o.ev;
  const swaps = o.applied.map(getSwap);
  const name = o.kind === "original" ? "The recipe as written" : o.label;
  const firstEffects = swaps.flatMap((x) => ["richness", "texture", "aroma"].map((k) => x.effects?.[k]).filter(Boolean)).slice(0, 2);
  const tStatus = Object.entries(ev.targets).map(([n, t]) => ({ n, ...t }));
  const STATUS_TEXT = { meets: "reaches your goal", maybe: "may reach your goal", misses: "below your goal", unknown: "can't estimate" };
  const buy = ev.purchases - ev.toCheck;
  return html`
    <li class="option-card ${chosen ? "is-chosen" : ""}">
      <div class="oc-head">
        <h3>${name}</h3>
        ${chosen ? html`<span class="tag tag--yolk">${icon("check")} Chosen</span>` : ""}
      </div>
      ${swaps.length > 1 ? html`<p class="oc-rules small">${swaps.map((x) => x.label).join(" · ")}</p>` : swaps.length ? html`<p class="oc-rules small">${swaps[0].summary}</p>` : html`<p class="small muted">No ingredient changes.</p>`}
      ${o.bundle?.notes ? html`<p class="small">${o.bundle.notes}</p>` : firstEffects.length ? html`<ul class="oc-effects small">${firstEffects.map((t) => html`<li>${t}</li>`)}</ul>` : ""}
      <p class="oc-meta small">
        ${tStatus.map((t) => html`<span>${capitalize(t.n)} ${formatRange(ev.nutrition[t.n], t.n)}, ${STATUS_TEXT[t.status]}</span>`)}
        <span>${!ev.purchases ? "Nothing to buy" : [buy ? `${buy} to buy` : "", ev.toCheck ? `${ev.toCheck} to check` : ""].filter(Boolean).join(", ")}</span>
        <span>${timeText(ev.timing)}</span>
        ${ev.planAhead.length ? html`<span>${icon("clock")} Plan ahead</span>` : ""}
      </p>
      ${ev.missing.length ? html`<p class="small warn">${checkNote(`this still uses ${ev.missing.map(shortName).join(", ")}, which you marked missing.`)}</p>` : ""}
      ${ev.check.dislikes.length ? html`<p class="small warn">${checkNote(`includes ${ev.check.dislikes.map(shortName).join(", ")}, which you'd rather avoid.`)}</p>` : ""}
      <div class="oc-foot">
        ${swaps.length ? evidence("suggested") : html`<span class="small muted">${recipe.source.label}</span>`}
        ${chosen
          ? html`<button class="btn btn--secondary btn--small" data-action="go-step" data-id="${recipe.id}" data-step="compare" aria-label="Compare selected: ${name}">Compare</button>`
          : html`<button class="btn btn--secondary btn--small" data-action="choose-option" data-id="${recipe.id}" data-applied="${o.applied.join(",")}" data-label="${o.label}" aria-label="Choose ${name} for ${recipe.title}, ${plural(servings, "serving")}">Choose</button>`}
      </div>
    </li>`;
}

function ownCombination(ctx, recipe, s) {
  const ev = ctx.evalFor(recipe.id);
  const untested = ev.combo.status === "untested";
  return html`
    <div class="status ${untested ? "status--conflict" : ""}" role="status">
      <p><strong>Your own combination:</strong> ${s.applied.map((id) => getSwap(id).label).join(" · ")}.</p>
      ${untested ? html`<p class="small">${untestedText(ev.combo)}</p>` : ""}
      ${ev.check.conflicts.length ? html`<p class="small warn">${checkNote(`${ev.check.conflicts.map((x) => x.reason).join("; ")}.`, "It conflicts with your requirements:")}</p>` : ""}
    </div>`;
}

export function untestedText(combo) {
  if (combo.wholeSetUntested && !combo.untested.length) return "Untested combination: these were each written to pair with one another, but never written together as a set. Each rule's prediction stands on its own; together, the result is a guess.";
  return `Untested combination: ${combo.untested.map((p) => `${p.a.label} with ${p.b.label}`).join("; ")} ${combo.untested.length === 1 ? "hasn't" : "haven't"} been written to go together. Each rule is supported on its own; together, the result is a guess.`;
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
      <div class="actions">
        ${s.applied.length ? html`<button class="btn btn--quiet" data-action="remove-changes" data-id="${recipe.id}">Remove ingredient changes</button>` : ""}
        ${s.applied.length && s.servings !== recipe.servings ? html`<button class="btn btn--quiet" data-action="restore-original" data-id="${recipe.id}">Reset everything, including portions</button>` : ""}
      </div>
    </section>`;
}

// ---------------------------------------------------------------- 3. Compare

function entriesText(line) {
  if (!line || line.omitted || !line.entries.length) return null;
  return line.entries.map((e) => `${formatQty(e.qty, e.unit, e.step)} ${ITEMS[e.item].name.toLowerCase()}${e.prep ? `, ${e.prep}` : ""}${e.optional ? " (optional)" : ""}`).join(" + ");
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
      <div><span class="eyebrow">Original</span><strong>${plural(s.servings, "serving")}</strong><span class="small muted">${timeText(orig.timing)}</span></div>
      <div><span class="eyebrow">Your version</span><strong>${plural(s.servings, "serving")}</strong><span class="small muted">${timeText(ev.timing, ev.planAhead)}</span></div>
    </div>
    <p class="small muted compare-basis">${s.servings !== recipe.servings ? `The original makes ${recipe.servings}; it's scaled to ${s.servings} here so both sides compare like for like. Times are for the written batch. ` : ""}<a href="#/recipe/${recipe.id}">See the source recipe as written</a>.</p>
    ${portionProblems(ev)}
    ${ev.combo.status === "untested" ? html`<div class="status status--conflict" role="status"><p><strong>Untested combination.</strong> ${ev.combo.wholeSetUntested && !ev.combo.untested.length ? "These weren't written together as a set." : `${ev.combo.untested.map((p) => `${p.a.label} and ${p.b.label}`).join("; ")} weren't written to go together.`} The changes below are each rule's own prediction, not a prediction for the combination.</p></div>` : ""}
    ${ev.combo.status === "blocked" ? html`<div class="status status--none" role="status"><p><strong>These changes don't work together:</strong> ${ev.combo.blocked.map((b) => b.reason).join(" ")}</p></div>` : ""}

    <div class="compare-grid">
      <section class="adapt-section" aria-labelledby="chg-h">
        <div class="section-head"><h2 id="chg-h">What changes in the dish</h2>${s.applied.length ? evidence("suggested") : ""}</div>
        ${expectedChanges(s.applied, { bundle, derived: ev.derived })}
      </section>

      <section class="adapt-section" aria-labelledby="ingcmp-h">
        <h2 id="ingcmp-h">Ingredients</h2>
        ${changed.length ? html`
          <table class="cmp-table">
            <caption class="visually-hidden">Ingredients that change, original and your version, for ${plural(s.servings, "serving")}</caption>
            <thead><tr><th scope="col">Original</th><th scope="col">Your version</th></tr></thead>
            <tbody>${changed.map((r) => html`<tr class="is-changed"><td>${r.before ? html`<s>${r.before}</s>` : html`<span class="muted">Not in the recipe</span>`}</td><td>${r.after ?? html`<span class="muted">Left out</span>`}</td></tr>`)}</tbody>
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

    ${approximations(ev.derived).length ? html`<p class="small muted">Rounded to what you can measure: ${approximations(ev.derived).join(", ")}. Estimates use the rounded amounts.</p>` : ""}
    ${nutritionCompare(orig.nutrition, ev.nutrition, { servings: s.servings, recipe, derived: ev.derived, open: hasT, targets: c.targets })}
    ${requirementCheck(ev.check, c)}`;
}

// ---------------------------------------------------------------- 4. Pantry and shopping

const GROUPS = [["main", "Main ingredients"], ["serve", "To serve"], ["spices", "Spices and seasonings"], ["staples", "Staples"]];

function shopStep(ctx, recipe, s) {
  const d = deriveRecipe(recipe, s);
  const { needs, replacing } = ctx.sessionNeeds(recipe.id);
  const optional = needs.filter((n) => n.optional && !n.included);
  const real = needs.filter((n) => !n.optional || n.included);
  const buy = real.filter((n) => !n.check);
  const check = real.filter((n) => n.check);
  const unchecked = buy.filter((n) => n.unchecked).length;
  const known = buy.length - unchecked;
  const planned = ctx.state.plan.filter((p) => p.recipeId === recipe.id);
  const others = ctx.state.plan.filter((p) => p.id !== replacing?.id);
  return html`
    <section class="adapt-section" aria-labelledby="have-h">
      <h2 id="have-h">What do you have?</h2>
      <p class="small muted">Amounts go to your pantry and are shared by every meal you plan, counted once. You don't have to check everything.</p>
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
                <summary class="small">${entries.length} items · ${have ? `${have} checked` : "not checked yet"}. Mark one by one</summary>
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
        <ul class="confirm-list">${uniqueChecks(check).map((n) => confirmRow(n))}</ul>
      </section>` : ""}
    <section class="adapt-section" aria-labelledby="short-h">
      <div class="section-head"><h2 id="short-h">${!buy.length ? (check.length ? "Waiting on your answers" : "Nothing to buy") : [known ? `${plural(known, "thing")} to buy` : "", unchecked ? `${unchecked} to check` : ""].filter(Boolean).join(", ")}</h2></div>
      <p class="small muted">${replacing ? `Worked out as if this replaces your planned ${recipe.title}, after your other planned meals.` : others.length ? `Worked out after your ${plural(others.length, "planned meal")}, which use the pantry first.` : "For this dish alone."}${unchecked ? " “To check” means it isn't in your pantry yet, so you may already have it." : ""}</p>
      ${buy.length ? html`<ul class="short-list">${buy.map((n) => html`<li><span class="num">${formatShopQty(n.qty, n.unit, n.step)}</span> <span>${n.name}</span>${n.note ? html`<span class="small muted">${n.note}${formatQty(n.qty, n.unit, n.step) !== formatShopQty(n.qty, n.unit, n.step) ? `. Uses ${formatQty(n.qty, n.unit, n.step)}.` : ""}</span>` : ""}${n.uncertain ? html`<span class="small warn">${checkNote("", "Check before buying")}</span>` : ""}</li>`)}</ul>` : ""}
      ${optional.length ? html`
        <div class="optional-list">
          <h3 class="eyebrow">Optional</h3>
          <p class="small muted">The dish works without these, so they aren't on your list unless you add them.</p>
          <ul class="short-list">${optional.map((n) => html`<li><span class="num">${formatQty(n.qty, n.unit, n.step)}</span> <span>${n.name}</span> <button class="btn btn--quiet" data-action="include-optional" data-id="${recipe.id}" data-item="${n.item}" aria-label="Add optional ${n.name} to the list">Add</button></li>`)}</ul>
        </div>` : ""}
      ${(s.includeOptional ?? []).length ? html`<p class="small">Including: ${s.includeOptional.map((id) => html`${ITEMS[id]?.name} <button class="btn btn--quiet" data-action="include-optional" data-id="${recipe.id}" data-item="${id}" aria-label="Leave ${ITEMS[id]?.name} off the list">Leave off</button> `)}</p>` : ""}
      ${planned.length ? html`<p class="small">${icon("list")} Already planned: ${planned.map((p) => `${p.label}, ${plural(p.servings, "serving")}`).join("; ")}. <a href="#/list">Shopping list</a></p>` : ""}
      <div class="actions">
        <button class="btn btn--secondary" data-action="add-plan" data-id="${recipe.id}">${icon("list")} Add to shopping list</button>
        <a class="btn btn--quiet" href="#/cook/${recipe.id}">Cook without saving</a>
      </div>
    </section>`;
}

export function uniqueChecks(checks) {
  const seen = new Set();
  return checks.filter((n) => (seen.has(n.fingerprint) ? false : seen.add(n.fingerprint)));
}

function haveRow(ctx, e, compact) {
  const item = ITEMS[e.item];
  const a = availability(ctx.state.pantry, e.item);
  const id = `have-${e.item}`;
  const err = ctx.ui.fieldErrors[`pantry:${e.item}`];
  const errId = `have-err-${e.item}`;
  return html`
    <li class="have-row">
      <div class="have-text"><span class="qty num">${formatQty(e.qty, e.unit, e.step)}</span> <span>${item.name}${e.optional ? html` <span class="small muted">(optional)</span>` : ""}</span></div>
      <div class="have-ctl">
        <label class="visually-hidden" for="${id}">Do you have ${item.name}?</label>
        <select id="${id}" class="select select--small" data-action="pantry-mark" data-item="${e.item}">
          <option value="unchecked" ${a.status === "unchecked" ? "selected" : ""}>Not checked</option>
          <option value="out" ${a.status === "out" ? "selected" : ""}>Don't have</option>
          <option value="have" ${a.status === "have" ? "selected" : ""}>Have, amount unknown</option>
          ${compact ? "" : html`<option value="some" ${a.status === "some" ? "selected" : ""}>Have this much…</option>`}
        </select>
        ${a.status === "some" && !compact ? html`
          <label class="have-qty"><span class="visually-hidden">Amount of ${item.name}${e.unit ? ` in ${e.unit}` : ""}</span>
            <input class="input input--num" type="text" inputmode="decimal" value="${err?.value ?? a.qty ?? ""}" placeholder="amount" data-action="pantry-qty" data-key="${e.item}" data-unit="${a.unit ?? e.unit}" ${err ? html`aria-invalid="true" aria-describedby="${errId}"` : ""}>
            <span class="small">${(a.unit ?? e.unit) || "count"}</span></label>` : ""}
        ${err ? fieldError(err.message, errId) : ""}
      </div>
    </li>`;
}

/** One question about the combined requirement across meals, not a yes per meal. */
export function confirmRow(n) {
  const c = n.combined;
  const across = c && c.meals.length > 1;
  return html`
    <li class="confirm-row">
      <span><strong>${n.name}</strong> <span class="small muted">${across ? `${formatQty(c.qty, c.unit, c.step)} in total across ${c.meals.join(" and ")}` : `need ${formatQty((c ?? n).qty, (c ?? n).unit, (c ?? n).step)}`}. ${n.note}</span></span>
      <span class="confirm-btns">
        <button class="btn btn--secondary btn--small" data-action="confirm" data-item="${n.item}" data-fp="${n.fingerprint}" data-value="enough" aria-label="I have enough ${n.name}${across ? " for all of these meals" : ""}">I have enough</button>
        <button class="btn btn--quiet" data-action="confirm" data-item="${n.item}" data-fp="${n.fingerprint}" data-value="buy" aria-label="Buy ${n.name}">Buy it</button>
      </span>
    </li>`;
}
