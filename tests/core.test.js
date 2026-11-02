import { test } from "node:test";
import assert from "node:assert/strict";

import { getRecipe, RECIPES } from "../js/data/recipes.js";
import { SWAPS, getSwap } from "../js/data/swaps.js";
import { ITEMS } from "../js/data/items.js";
import { convert, formatQty, practical, purchaseQty } from "../js/core/units.js";
import { deriveRecipe, defaultAdaptation, applySwap, removeSwap, setServings, checkSwap, servingDescription, renderEffect, scalingNotes } from "../js/core/adapt.js";
import { estimate, direction, formatRange, rawWeightChange, RANGE_NOTE } from "../js/core/nutrition.js";
import {
  needsFor, allocateNeeds, syncRecipe, emptyList, setOverride, deleteLine, addManual, resolveConflict,
  isListCurrent, displayQty, clearChecked, toggleChecked, undismiss, reconcile, recordTransfer, boughtDefault,
  dismissedReview, listStatus, needsSignature, recordConfirmation, computedQty,
} from "../js/core/shopping.js";
import { suggest } from "../js/core/suggest.js";
import * as pantryCore from "../js/core/pantry.js";
import { BUNDLES } from "../js/data/bundles.js";
import { comboStatus, evaluate, candidates, resolve, groupByFit, timingFor } from "../js/core/engine.js";
import { defaultConstraints, openQuestions, checkItems, relevantQuestions, hasFilterCriteria } from "../js/core/constraints.js";
import { parseLine, matchItem, validateDraft, resolveLine, draftAsDerived, resetLine, isCalculable } from "../js/core/normalize.js";
import { extractJsonLd, parsePastedText, extractFromLink, buildDraft, DEMO_LINKS, parseServings, parseYield, combineExtracted, findDuplicateDraft } from "../js/core/importer.js";
import { searchIngredients, exactIngredient } from "../js/core/search.js";
import { addRecovery, applyRecovery } from "../js/core/recovery.js";
import * as V from "../js/core/versions.js";

const chana = getRecipe("chana-palak");
const dal = getRecipe("masoor-dal");
const bhurji = getRecipe("paneer-bhurji");
const pbm = getRecipe("paneer-butter-masala");
const masalaRecipe = getRecipe("chana-masala");
const line = (d, slot) => d.ingredients.find((l) => l.slot === slot);

test("seed data references only known items, slots and steps", () => {
  for (const r of RECIPES) {
    for (const i of r.ingredients) assert.ok(ITEMS[i.item], `${r.id}: unknown item ${i.item}`);
  }
  for (const s of SWAPS) {
    const r = getRecipe(s.recipe);
    assert.ok(r, `${s.id}: unknown recipe`);
    const slots = new Set(r.ingredients.map((i) => i.slot));
    if (s.replace) assert.ok(slots.has(s.replace.slot), `${s.id}: unknown slot`);
    for (const w of [...(s.replace?.with ?? []), ...(s.add ?? [])]) assert.ok(ITEMS[w.item], `${s.id}: unknown item ${w.item}`);
    for (const a of s.adjust ?? []) assert.ok(slots.has(a.slot), `${s.id}: unknown adjust slot`);
    for (const id of Object.keys(s.steps ?? {})) assert.ok(r.steps.some((st) => st.id === id), `${s.id}: unknown step ${id}`);
    const fx = Object.entries(s.effects);
    assert.ok(fx.length > 0, `${s.id}: no effects`);
    for (const [k, v] of fx) {
      assert.ok(["texture", "richness", "aroma", "acidity", "cooking", "quantity", "unchanged"].includes(k), `${s.id}: unknown effect ${k}`);
      assert.doesNotMatch(v, /^(No change|No real change|No meaningful change|Nothing to replace)\.?$/, `${s.id}: generic ${k}`);
    }
  }
  // every rule states its evidence honestly: nothing claims to be tested
  for (const s of SWAPS) assert.ok(!s.evidence || s.evidence === "suggested", `${s.id}: evidence`);
  for (const s of SWAPS) for (const b of s.balance ?? []) assert.ok(b.why.length > 20, `${s.id}: balance needs a reason`);
  for (const s of SWAPS) for (const id of s.combinesWith ?? []) assert.equal(getSwap(id)?.recipe, s.recipe, `${s.id}: combinesWith ${id}`);
  // bundles only reference rules of their own recipe, and form supported combinations
  for (const b of BUNDLES) {
    for (const id of b.swaps) assert.equal(getSwap(id)?.recipe, b.recipe, `${b.id}: ${id}`);
    assert.equal(comboStatus(b.recipe, b.swaps).status, "supported", `${b.id}: not a supported combination`);
  }
  // 8 to 12 supported recipes, each with an image or an explicit null and a serving definition
  assert.ok(RECIPES.length >= 8 && RECIPES.length <= 12);
  for (const r of RECIPES) assert.ok(r.servingDef && r.source && "image" in r, `${r.id}: metadata`);
  // every rendered step resolves all tokens, with every swap applied alone
  for (const s of SWAPS) {
    const d = deriveRecipe(getRecipe(s.recipe), applySwap(defaultAdaptation(getRecipe(s.recipe)), s.id));
    for (const st of d.steps) assert.ok(!/[{}]/.test(st.text), `${s.id}: unresolved token in ${st.text}`);
  }
});

test("units convert within a family only and format practically", () => {
  assert.equal(Math.round(convert(1, "tbsp", "tsp") * 100) / 100, 3);
  assert.equal(convert(100, "g", "ml"), null);
  assert.equal(convert(2, "cloves", ""), null);
  assert.equal(formatQty(0.5, "tsp"), "½ tsp");
  assert.equal(formatQty(1.5, ""), "1½");
  assert.equal(formatQty(127, "g"), "125 g");
  assert.equal(formatQty(1240, "g"), "1.24 kg");
});

test("portions scale linearly, pan fat at half rate, source untouched", () => {
  const before = JSON.stringify(chana);
  const d = deriveRecipe(chana, setServings(defaultAdaptation(chana), 2));
  assert.equal(line(d, "chickpeas").entries[0].qty, 240);
  assert.equal(line(d, "oil").entries[0].qty, 1.5); // 2 tbsp * (1 + (0.5 - 1) * 0.5)
  assert.equal(JSON.stringify(chana), before);
  assert.equal(setServings(defaultAdaptation(chana), 40).servings, 12);
  assert.equal(setServings(defaultAdaptation(chana), 0).servings, 1);
});

test("a swap replaces the ingredient, rewrites its step, and undo restores the original", () => {
  const base = defaultAdaptation(chana);
  const swapped = applySwap(base, "cp-frozen-spinach");
  const d = deriveRecipe(chana, swapped);
  assert.equal(line(d, "spinach").entries[0].item, "spinach-frozen");
  assert.deepEqual(line(d, "spinach").changedBy, ["cp-frozen-spinach"]);
  assert.match(d.steps.find((s) => s.id === "s7").text, /frozen spinach/);
  const undone = removeSwap(swapped, "cp-frozen-spinach");
  assert.deepEqual(deriveRecipe(chana, undone).ingredients, deriveRecipe(chana, base).ingredients);
  assert.equal(line(deriveRecipe(chana, base), "spinach").entries[0].item, "spinach-fresh");
});

test("swaps compose: adjustments apply to whatever fills the slot, then portions", () => {
  let a = applySwap(defaultAdaptation(dal), "md-moong");
  a = applySwap(a, "md-more-dal");
  a = applySwap(a, "md-brown-rice");
  a = setServings(a, 2);
  const d = deriveRecipe(dal, a);
  assert.equal(line(d, "lentils").entries[0].item, "moong-dal");
  assert.equal(line(d, "lentils").entries[0].qty, 150); // 200 * 1.5 * 0.5
  assert.equal(line(d, "rice").entries[0].item, "brown-basmati");
  assert.equal(Math.round(line(d, "rice").entries[0].qty), 100); // 300 * 2/3 * 0.5
});

test("added ingredients get their own line and inserted step", () => {
  const d = deriveRecipe(chana, applySwap(defaultAdaptation(chana), "cp-paneer"));
  const paneer = line(d, "paneer");
  assert.equal(paneer.addedBy, "cp-paneer");
  const i = d.steps.findIndex((s) => s.id === "cp-paneer-step");
  assert.equal(d.steps[i - 1].id, "s6");
  assert.match(d.steps[i].text, /paneer/);
});

test("conflicts: same ingredient and declared incompatibilities are blocked with a reason", () => {
  const a = applySwap(defaultAdaptation(chana), "cp-frozen-spinach");
  const kale = checkSwap(chana, a, "cp-kale");
  assert.equal(kale.ok, false);
  assert.equal(kale.blockers[0].swap.id, "cp-frozen-spinach");
  const switched = applySwap(a, "cp-kale", ["cp-frozen-spinach"]);
  assert.deepEqual(switched.applied, ["cp-kale"]);

  const c = applySwap(defaultAdaptation(pbm), "pbm-coconut");
  const oat = checkSwap(pbm, c, "pbm-oat");
  assert.equal(oat.ok, false);
  assert.match(oat.blockers[0].reason, /replace the cream/);
  assert.equal(checkSwap(pbm, c, "pbm-tofu").ok, true);
  assert.ok(checkSwap(chana, defaultAdaptation(chana), "pbm-tofu").unsupported);
});

test("omitting an ingredient removes it and the steps no longer mention it", () => {
  const d = deriveRecipe(pbm, applySwap(defaultAdaptation(pbm), "pbm-no-cashew"));
  assert.equal(line(d, "cashews").omitted, true);
  assert.doesNotMatch(d.steps.map((s) => s.text).join(" "), /cashew|left out/);
});

test("nutrition: ranges move with nutrition swaps; missing data is reported, not zero", () => {
  const base = estimate(deriveRecipe(dal, defaultAdaptation(dal)));
  const more = estimate(deriveRecipe(dal, applySwap(defaultAdaptation(dal), "md-more-dal")));
  assert.equal(direction(base.protein, more.protein), "more");
  assert.equal(direction(base.fiber, more.fiber), "more");
  assert.ok(base.protein.low < base.protein.mid && base.protein.mid < base.protein.high);
  const moong = estimate(deriveRecipe(dal, applySwap(defaultAdaptation(dal), "md-moong")));
  assert.deepEqual(moong.missing.fiber, ["Split yellow moong dal"]);
  assert.equal(moong.fiber.incomplete, true);
  assert.equal(formatRange(moong.fiber), "can't estimate");
  assert.equal(direction(base.fiber, moong.fiber), "can't compare");
  assert.equal(moong.protein.incomplete, false);
  // per-serving values don't change with portions
  const half = estimate(deriveRecipe(dal, setServings(defaultAdaptation(dal), 2)));
  assert.equal(Math.round(half.protein.mid), Math.round(base.protein.mid));
});

test("shopping needs subtract pantry amounts and flag incompatible units", () => {
  const d = deriveRecipe(chana, defaultAdaptation(chana));
  const pantry = {
    chickpeas: {}, // have it, amount unknown
    "spinach-fresh": { qty: 120, unit: "g" },
    garlic: { qty: 1, unit: "head" },
  };
  const needs = needsFor(d, pantry);
  const spinach = needs.find((n) => n.item === "spinach-fresh");
  assert.equal(spinach.qty, 80);
  // Have it, amount unknown: not assumed to be enough; it asks for a confirmation
  const chick = needs.find((n) => n.item === "chickpeas");
  assert.equal(chick.check, true);
  assert.equal(chick.qty, 480);
  assert.equal(needs.find((n) => n.item === "garlic").uncertain, true);
  // more than enough means nothing to buy
  assert.ok(!needsFor(d, { "spinach-fresh": { qty: 0.5, unit: "kg" } }).some((n) => n.item === "spinach-fresh"));
  // "Some" with no amount yet: also a confirmation, never treated as enough
  assert.equal(needsFor(d, { onion: { some: true } }).find((n) => n.item === "onion").check, true);
  // free-text pantry items never feed calculations
  assert.ok(needsFor(d, { "free:onion": { free: true, name: "onion" } }).some((n) => n.item === "onion"));
  // water is never shopped for
  assert.ok(!needsFor(deriveRecipe(dal, defaultAdaptation(dal)), {}).some((n) => n.item === "water"));
});

test("shopping needs follow the adapted recipe", () => {
  let a = applySwap(defaultAdaptation(chana), "cp-frozen-spinach");
  a = setServings(a, 2);
  const needs = needsFor(deriveRecipe(chana, a), {});
  assert.ok(!needs.some((n) => n.item === "spinach-fresh"));
  assert.equal(needs.find((n) => n.item === "spinach-frozen").qty, 65);
  assert.equal(needs.find((n) => n.item === "chickpeas").qty, 240);
});

test("list regeneration keeps manual items, flags edited amounts, respects deletions", () => {
  let list = addManual(emptyList(), "Mango", "2");
  let a = defaultAdaptation(chana);
  let needs = needsFor(deriveRecipe(chana, a), {});
  ({ list } = syncRecipe(list, chana, needs));
  assert.ok(isListCurrent(list, chana.id, needs));
  const chick = list.lines.find((l) => l.item === "chickpeas");
  list = setOverride(list, chick.id, 500);
  const rice = list.lines.find((l) => l.item === "basmati");
  list = deleteLine(list, rice.id);

  a = setServings(a, 2);
  needs = needsFor(deriveRecipe(chana, a), {});
  assert.equal(isListCurrent(list, chana.id, needs), false);
  let report;
  ({ list, report } = syncRecipe(list, chana, needs));
  const chick2 = list.lines.find((l) => l.item === "chickpeas");
  assert.equal(chick2.override.qty, 500);
  assert.equal(chick2.conflict.type, "changed");
  assert.equal(displayQty(chick2), "500 g");
  assert.ok(list.lines.some((l) => l.manual && l.name === "Mango"));
  assert.ok(!list.lines.some((l) => l.item === "basmati"));
  assert.equal(report.stillDismissed[0].item, "basmati");

  list = resolveConflict(list, chick2.id, "recipe");
  assert.equal(displayQty(list.lines.find((l) => l.item === "chickpeas")), "240 g");

  list = undismiss(list, chana.id, report.stillDismissed[0].key);
  ({ list } = syncRecipe(list, chana, needs));
  assert.ok(list.lines.some((l) => l.item === "basmati"));
});

test("list: removed ingredients disappear unless edited or checked; recipes merge by item", () => {
  let list = emptyList();
  const base = defaultAdaptation(chana);
  ({ list } = syncRecipe(list, chana, needsFor(deriveRecipe(chana, base), {})));
  ({ list } = syncRecipe(list, dal, needsFor(deriveRecipe(dal, defaultAdaptation(dal)), {})));
  const rice = list.lines.find((l) => l.item === "basmati");
  assert.equal(Object.keys(rice.sources).length, 2);
  assert.equal(displayQty(rice), "600 g");

  const onion = list.lines.find((l) => l.item === "onion");
  list = toggleChecked(list, onion.id);
  const swapped = applySwap(base, "cp-frozen-spinach");
  let report;
  const onionFp = allocateNeeds([{ id: chana.id, derived: deriveRecipe(chana, swapped) }], { onion: {} }).get(chana.id).find((n) => n.item === "onion").fingerprint;
  const confirmed = allocateNeeds([{ id: chana.id, derived: deriveRecipe(chana, swapped) }], { onion: {} }, { onion: { [onionFp]: "enough" } }).get(chana.id);
  ({ list, report } = syncRecipe(list, chana, confirmed));
  assert.ok(!list.lines.some((l) => l.item === "spinach-fresh"));
  assert.ok(list.lines.some((l) => l.item === "spinach-frozen"));
  assert.equal(list.lines.find((l) => l.item === "onion").conflict.type, "orphan");
  assert.ok(report.conflicts >= 1);

  list = clearChecked(list);
  assert.ok(!list.lines.some((l) => l.item === "onion"));
});

test("suggestions explain relevance and respect hard constraints", () => {
  const pantry = { chickpeas: { qty: 480, unit: "g" }, "spinach-frozen": { qty: 200, unit: "g" }, "canned-tomatoes": { qty: 400, unit: "g" }, onion: { qty: 3, unit: "" }, basmati: { qty: 500, unit: "g" } };
  const results = suggest(RECIPES, pantry, defaultConstraints());
  const masala = results.find((r) => r.recipe.id === "chana-masala");
  assert.ok(masala.reasons.some((x) => /Uses your/.test(x)));
  assert.ok(masala.reasons.some((x) => /to buy|Nothing to buy/.test(x)));
  // the version picked for the suggestion buys the least: canned tomatoes you have instead of fresh ones
  assert.ok(masala.option.applied.includes("cm-canned-tomatoes"));
  // using up an ingredient filters to recipes that use it
  const focus = suggest(RECIPES, pantry, defaultConstraints(), { focus: ["spinach-frozen"] });
  assert.ok(focus.length > 0 && focus.every((r) => r.focusUsed.includes("spinach-frozen")));
  // vegan: nothing suggested contains dairy, whatever it would save
  const vegan = suggest(RECIPES, pantry, { ...defaultConstraints(), diet: "vegan", answers: { soy: "ok", sesame: "ok" } });
  for (const r of vegan) {
    const items = r.option.ev.derived.ingredients.flatMap((l) => l.entries.map((e) => e.item));
    assert.ok(!items.some((i) => ["paneer", "ghee", "butter", "cream", "yogurt", "milk"].includes(i)), `${r.recipe.id} has dairy`);
  }
  assert.ok(!vegan.some((r) => r.recipe.id === "punjabi-kadhi"));
});

test("state survives a save and reload", async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const { load, save, clear, initialState } = await import("../js/store.js");
  const s = initialState();
  s.sessions["chana-palak"] = V.changeSession(V.startSession(chana, null, 1), { servings: 2, applied: ["cp-frozen-spinach"] }, 2);
  s.pantry.onion = {};
  s.pantry.basmati = { qty: 100, unit: "g" };
  s.list = addManual(s.list, "Mango");
  save(s);
  const reloaded = load();
  assert.deepEqual(reloaded, s);
  assert.deepEqual(clear(), initialState());
  assert.deepEqual(load(), initialState());
});

test("chana masala: dried chickpeas add a first step; swaps compose at 2 servings", () => {
  const masala = getRecipe("chana-masala");
  let a = setServings(defaultAdaptation(masala), 2);
  a = applySwap(a, "cm-dried-chickpeas");
  a = applySwap(a, "cm-canned-tomatoes");
  a = applySwap(a, "cm-spinach");
  const d = deriveRecipe(masala, a);
  assert.equal(d.steps[0].id, "cm-soak-step");
  assert.match(d.steps[0].text, /soak/);
  assert.equal(line(d, "chickpeas").entries[0].qty, 100);
  assert.equal(line(d, "tomatoes").entries[0].qty, 200);
  assert.equal(line(d, "spinach-frozen").entries[0].qty, 65);
  const needs = needsFor(d, { "canned-tomatoes": { qty: 150, unit: "g" } });
  assert.equal(needs.find((n) => n.item === "canned-tomatoes").qty, 50);
  assert.equal(checkSwap(masala, applySwap(a, "cm-paneer"), "cm-tofu").ok, false);
  assert.ok(masala.unsupported.chickpeas[0].reason.length > 0);
});

test("pantry is the single ingredient state: recipe marks read from it and write back to it", () => {
  let pantry = {};
  assert.equal(pantryCore.availability(pantry, "basmati").status, "unchecked");
  pantry = pantryCore.setAvailability(pantry, "basmati", "some");
  assert.deepEqual(pantryCore.availability(pantry, "basmati"), { status: "some", qty: undefined, unit: undefined });
  pantry = pantryCore.setAvailability(pantry, "basmati", "some", { qty: 100, unit: "g" });
  assert.deepEqual(pantry.basmati, { qty: 100, unit: "g" });
  // Any recipe reading the pantry sees the same amount
  assert.deepEqual(pantryCore.availability(pantry, "basmati"), { status: "some", qty: 100, unit: "g" });
  pantry = pantryCore.setAvailability(pantry, "basmati", "have");
  assert.deepEqual(pantry.basmati, {}); // have it, amount unknown
  assert.equal(pantryCore.availability(pantry, "basmati").status, "have");
  pantry = pantryCore.setAvailability(pantry, "basmati", "need");
  assert.ok(!("basmati" in pantry));
  // Free text is kept but never counts as an ingredient
  pantry = pantryCore.addFree(pantry, "Mango pickle", "1 jar");
  assert.equal(pantryCore.availability(pantry, "free:mango pickle").status, "unchecked");
  // Add to pantry from a bought list item adds to a comparable amount
  pantry = pantryCore.addBought({ basmati: { qty: 100, unit: "g" } }, "basmati", 0.5, "kg");
  assert.deepEqual(pantry.basmati, { qty: 600, unit: "g" });
  assert.deepEqual(pantryCore.addBought({}, "onion", 1, "").onion, { qty: 1, unit: "" });
  // A measured purchase on unknown stock is recorded, never discarded
  assert.deepEqual(pantryCore.addBought({ onion: {} }, "onion", 1, "").onion, { qty: 1, unit: "", atLeast: true });
});

test("shopping subtracts each pantry amount once across the list, in list order", () => {
  const masala = getRecipe("chana-masala");
  const twoServings = setServings(defaultAdaptation(masala), 2); // 150 g rice
  const entries = [
    { id: "chana-masala", derived: deriveRecipe(masala, twoServings) },
    { id: "chana-palak", derived: deriveRecipe(chana, defaultAdaptation(chana)) }, // 300 g rice
  ];
  const pantry = { basmati: { qty: 100, unit: "g" } };
  const rice = (m, id) => m.get(id).find((n) => n.item === "basmati")?.qty;
  const forward = allocateNeeds(entries, pantry);
  assert.equal(rice(forward, "chana-masala"), 50);
  assert.equal(rice(forward, "chana-palak"), 300);
  const backward = allocateNeeds([...entries].reverse(), pantry);
  assert.equal(rice(backward, "chana-palak"), 200);
  assert.equal(rice(backward, "chana-masala"), 150);
  // Either order: 450 needed − 100 on hand, counted once
  let list = emptyList();
  ({ list } = syncRecipe(list, masala, forward.get("chana-masala")));
  ({ list } = syncRecipe(list, chana, forward.get("chana-palak")));
  assert.equal(displayQty(list.lines.find((l) => l.item === "basmati")), "350 g");
  // A large pantry amount covers both
  const plenty = allocateNeeds(entries, { basmati: { qty: 1, unit: "kg" } });
  assert.equal(rice(plenty, "chana-masala"), undefined);
  assert.equal(rice(plenty, "chana-palak"), undefined);
});

test("unconvertible pantry units are amount unknown: flagged, never subtracted", () => {
  const entries = [
    { id: "chana-palak", derived: deriveRecipe(chana, defaultAdaptation(chana)) }, // 4 cloves garlic
    { id: "masoor-dal", derived: deriveRecipe(dal, defaultAdaptation(dal)) }, // 4 cloves garlic
  ];
  const out = allocateNeeds(entries, { garlic: { qty: 1, unit: "head" } });
  for (const id of ["chana-palak", "masoor-dal"]) {
    const garlic = out.get(id).find((n) => n.item === "garlic");
    assert.equal(garlic.qty, 4);
    assert.equal(garlic.uncertain, true);
    assert.match(garlic.note, /can't be compared/);
  }
});

test("version 1 saves migrate: pantry, adapted recipes become saved versions, list recipes become planned meals", async () => {
  const old = {
    version: 1,
    saved: ["chana-palak", "tomato-egg"],
    pantry: { onion: { status: "have" }, garlic: { status: "need" }, basmati: { status: "some", qty: 100, unit: "g" } },
    adaptations: { "chana-masala": { servings: 2, applied: ["cm-canned-tomatoes"], partial: { "canned-tomatoes": { qty: 150, unit: "g" } } }, "masoor-dal": { servings: 4, applied: [] } },
    list: { lines: [], dismissed: {}, synced: { "chana-masala": "x" }, nextId: 1 },
  };
  const mem = new Map([["mise-match:v1", JSON.stringify(old)]]);
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const { load } = await import("../js/store.js");
  const s = load();
  assert.equal(s.version, 3);
  assert.deepEqual(s.pantry, { onion: {}, "canned-tomatoes": { qty: 150, unit: "g" } });
  const versions = Object.values(s.versions);
  assert.equal(versions.length, 1); // unchanged masoor dal isn't a version
  assert.deepEqual([versions[0].recipeId, versions[0].servings, versions[0].applied], ["chana-masala", 2, ["cm-canned-tomatoes"]]);
  assert.equal(s.plan[0].versionId, versions[0].id);
  assert.deepEqual(s.saved, ["chana-palak"]); // recipes no longer in the collection drop out
});

// ---------------------------------------------------------------- engine and constraints

test("portion scaling keeps per-serving nutrition and serving size equal", () => {
  const four = evaluate(pbm, { servings: 4, applied: [] }, defaultConstraints());
  const two = evaluate(pbm, { servings: 2, applied: [] }, defaultConstraints());
  assert.equal(Math.round(four.nutrition.protein.mid), Math.round(two.nutrition.protein.mid));
  assert.equal(line(two.derived, "paneer").entries[0].qty, 200);
  assert.equal(line(two.derived, "butter").entries[0].qty, 1.5); // pan fat at half rate
  // adding paneer adds raw ingredient weight per serving, and that is reported as raw weight
  const more = evaluate(masalaRecipe, { servings: 4, applied: ["cm-paneer"] }, defaultConstraints());
  const base = evaluate(masalaRecipe, { servings: 4, applied: [] }, defaultConstraints());
  assert.ok(more.nutrition.rawGrams.value > base.nutrition.rawGrams.value * 1.1);
});

test("combined rules: supported, blocked or untested, never assumed", () => {
  assert.equal(comboStatus("chana-masala", ["cm-canned-tomatoes", "cm-paneer"]).status, "supported");
  assert.equal(comboStatus("chana-masala", ["cm-paneer", "cm-tofu"]).status, "blocked");
  // dried chickpeas were never written to combine with paneer
  const u = comboStatus("chana-masala", ["cm-dried-chickpeas", "cm-paneer"]);
  assert.equal(u.status, "untested");
  const check = checkSwap(masalaRecipe, { servings: 4, applied: ["cm-dried-chickpeas"] }, "cm-paneer");
  assert.equal(check.ok, true);
  assert.equal(check.untested[0].id, "cm-dried-chickpeas");
  // a bundle evaluates every component together, including step changes
  const ev = evaluate(pbm, { servings: 4, applied: ["pbm-tofu", "pbm-coconut", "pbm-oil", "pbm-sunflower"] }, defaultConstraints());
  const items = ev.derived.ingredients.flatMap((l) => l.entries.map((e) => e.item));
  assert.ok(items.includes("tofu") && items.includes("coconut-milk") && items.includes("sunflower-seeds") && !items.includes("butter"));
  assert.ok(ev.derived.steps.some((s) => s.id === "pbm-tofu-step"));
  assert.equal(line(ev.derived, "sugar").entries[0].qty, 0.5); // coconut halves the sugar, with a stated reason
});

test("quantity ranges: a rule outside its authored servings range is not eligible", () => {
  const g = candidates(pbm, 1, defaultConstraints());
  const seeds = g.notEligible.find((c) => c.id === "pbm-sunflower");
  assert.ok(seeds && seeds.blockers.some((b) => b.kind === "quantity"));
  assert.ok(candidates(pbm, 2, defaultConstraints()).eligible.some((c) => c.id === "pbm-sunflower"));
});

test("ambiguous terms are clarified, and soy and sesame are not assumed acceptable", () => {
  const c = { ...defaultConstraints(), diet: "vegan", avoid: ["nuts"] };
  const keys = openQuestions(c).map((q) => q.key);
  assert.deepEqual(keys.sort(), ["coconut", "nutScope", "sesame", "soy"]);
  const tofu = checkItems(["tofu"], c);
  assert.equal(tofu.conflicts.length, 0);
  assert.equal(tofu.questions[0].key, "soy");
  // vegetarian asks about eggs
  assert.ok(openQuestions({ ...defaultConstraints(), diet: "vegetarian" }).some((q) => q.key === "eggs"));
  // nothing is ever called safe: label checks are listed for brand-dependent products
  assert.ok(checkItems(["garam-masala", "asafoetida"], c).labelChecks.length === 2);
});

test("vegan, nut-free, high-protein paneer dish: only eligible combinations, honest conflicts", () => {
  const base = { ...defaultConstraints(), diet: "vegan", avoid: ["nuts"], nutScope: "both", targets: { protein: 30, fiber: null } };
  // unanswered soy/coconut: the supported versions wait for an answer instead of assuming
  const pending = resolve(pbm, 4, base);
  assert.equal(pending.status, "needs-answer");
  assert.equal(pending.eligible.length, 0);

  const answered = { ...base, answers: { soy: "ok", sesame: "ok", coconut: "ok" } };
  const r = resolve(pbm, 4, answered);
  for (const c of r.eligible) {
    const items = c.ev.derived.ingredients.flatMap((l) => l.entries.map((e) => e.item));
    for (const bad of ["paneer", "butter", "cream", "cashews"]) assert.ok(!items.includes(bad), `${c.id} has ${bad}`);
  }
  // the vegan version keeping cashews is excluded, never traded off for protein
  assert.ok(r.notEligible.some((c) => c.id === "pbm-b-vegan-cashew"));
  assert.equal(r.status, "target-conflict");
  assert.match(r.explanation, /30 g target/);
  assert.ok(r.choices.some((c) => c.type === "lower-target"));
  assert.ok(r.choices.some((c) => c.type === "accompaniment" && c.recipe.id === "masoor-dal"));
  // the accompaniment is evaluated under the same constraints: an oil tadka, not ghee
  const side = r.choices.find((c) => c.type === "accompaniment");
  assert.ok(!side.option.ev.derived.ingredients.some((l) => l.entries.some((e) => e.item === "ghee")));

  // with a lower target the more-tofu bundles qualify
  assert.equal(resolve(pbm, 4, { ...answered, targets: { protein: 25 } }).status, "ok");

  // avoiding soy: no supported replacement for paneer, said plainly, with other dishes offered
  const noSoy = resolve(pbm, 4, { ...answered, answers: { ...answered.answers, soy: "avoid" } });
  assert.equal(noSoy.status, "no-supported");
  assert.match(noSoy.explanation, /soy/);
  assert.ok(noSoy.choices.every((c) => c.type === "other-dish"));
  // without coconut, only the oat version remains
  const noCoconut = resolve(pbm, 4, { ...answered, targets: { protein: 25 }, answers: { ...answered.answers, coconut: "avoid" } });
  assert.ok(noCoconut.eligible.every((c) => !c.applied.includes("pbm-coconut")));
});

test("a time limit is a user-designated limit, not a ranking weight", () => {
  const c = { ...defaultConstraints(), timeLimit: 60 };
  const g = candidates(masalaRecipe, 4, c);
  const dried = g.notEligible.find((x) => x.id === "cm-dried-chickpeas");
  assert.ok(dried.blockers.some((b) => b.kind === "limit"));
});

// ---------------------------------------------------------------- import, normalization, validation

test("normalization keeps original wording and never collapses different ingredients", () => {
  assert.equal(matchItem("kabuli chana").item, "chickpeas");
  assert.equal(matchItem("chana dal").item, "chana-dal");
  assert.equal(matchItem("kala chana").item, "kala-chana");
  assert.equal(matchItem("chana").confidence, "ambiguous");
  assert.equal(matchItem("mutton").confidence, "ambiguous");
  assert.equal(matchItem("dahi").item, "yogurt");
  const l = parseLine("1 (400 g) can chickpeas, drained");
  assert.deepEqual([l.raw, l.qty, l.unit, l.match.item, l.state, l.prep], ["1 (400 g) can chickpeas, drained", null, "g", "chickpeas", "cooked", "drained"]);
  assert.equal(l.pack.netTotal, 400);
  assert.ok(l.issues.includes("drained-unknown"));
  assert.deepEqual(parseLine("Fresh cream").issues, ["no-quantity"]);
  assert.ok(parseLine("2 cups rice").issues.includes("ambiguous"));
  assert.ok(parseLine("1 cup cooked basmati rice").issues.includes("state-mismatch"));
  assert.ok(parseLine("200 g red lentils").issues.includes("state"));
  assert.ok(parseLine("Handful of coriander leaves, for garnish").optional);
});

test("validation blocks only the actions an issue affects", () => {
  const ex = extractJsonLd(DEMO_LINKS["https://example.com/demo/weeknight-rajma"].html)[0];
  const draft = buildDraft(ex, { method: "structured", now: 1 });
  assert.equal(draft.servings, 4);
  assert.equal(draft.source.creator, "Example Kitchen (demo creator)");
  assert.equal(validateDraft(draft, "reference").ok, true); // always savable as a reference
  const nut = validateDraft(draft, "nutrition");
  assert.equal(nut.ok, false);
  const cream = draft.lines.find((x) => /cream/i.test(x.raw));
  assert.ok(nut.blocking.some((b) => b.line === cream.id && b.kind === "no-quantity"));
  // the garnish doesn't block anything
  const garnish = draft.lines.find((x) => /coriander/i.test(x.raw));
  assert.ok(!nut.blocking.some((b) => b.line === garnish.id));
  assert.ok(validateDraft(draft, "cook").ok);
  assert.equal(validateDraft(draft, "adapt").ok, false); // not a supported dish
  // leaving out the cream removes that blocker; a missing serving count blocks scaling
  const lines = draft.lines.map((x) => (x.id === cream.id ? resolveLine(x, { omitted: true }) : x));
  assert.ok(!validateDraft({ ...draft, lines }, "nutrition").blocking.some((b) => b.line === cream.id));
  assert.equal(validateDraft({ ...draft, servings: null }, "scale").ok, false);
  // unknown quantities stay unknown in the estimate; nothing is filled in
  assert.equal(draftAsDerived(draft).ingredients.find((x) => x.slot === cream.id).entries[0].qty, null);
});

test("pasted text, multiple recipes and inaccessible sources", () => {
  const two = extractFromLink("https://example.com/demo/two-recipes");
  assert.equal(two.recipes.length, 2);
  assert.deepEqual(two.recipes.map((r) => r.title), ["Jeera rice", "Boondi raita"]);
  assert.equal(two.recipes[0].servings, 2);
  assert.equal(two.recipes[1].servings, null); // not invented
  assert.equal(extractFromLink("https://example.com/demo/private-post").problem, "private");
  assert.equal(extractFromLink("https://www.instagram.com/p/abc").problem, "not-fetchable");
  assert.equal(parsePastedText("just some words").problem, "no-sections");
  const p = parsePastedText("Aloo gobi\nServes 3\nIngredients\n2 aloo\n1 cauliflower\nMethod\n1. Fry.\n2. Simmer.");
  assert.deepEqual([p.recipes[0].title, p.recipes[0].servings, p.recipes[0].steps], ["Aloo gobi", 3, ["Fry.", "Simmer."]]);
  const chanaDraft = buildDraft(extractFromLink("https://example.com/demo/chana-masala").recipes[0], { method: "structured" });
  assert.equal(chanaDraft.supportedRecipe, "chana-masala");
});

// ---------------------------------------------------------------- sessions, versions, plan

test("sessions autosave with undo; saving a version is explicit and keeps the original", () => {
  const before = JSON.stringify(masalaRecipe);
  let s = V.startSession(masalaRecipe, null, 1);
  s = V.changeSession(s, { servings: 2 }, 2);
  s = V.changeSession(s, { applied: ["cm-canned-tomatoes"] }, 3);
  assert.equal(V.hasUnsavedChanges(s, {}), true);
  s = V.undoSession(s, 4);
  assert.deepEqual(s.applied, []);
  assert.equal(s.servings, 2);
  s = V.changeSession(s, { applied: ["cm-canned-tomatoes"] }, 5);
  let versions = {};
  ({ versions, session: s } = V.saveSession(versions, s, { now: 10 }));
  const v = Object.values(versions)[0];
  assert.deepEqual([v.name, v.servings, v.applied, v.parent, v.rev, v.visibility], ["Your version", 2, ["cm-canned-tomatoes"], null, 1, "private"]);
  assert.equal(V.hasUnsavedChanges(s, versions), false);
  // a session started from the version and saved as new records its parent
  let s2 = V.startSession(masalaRecipe, v, 11);
  s2 = V.changeSession(s2, { applied: ["cm-canned-tomatoes", "cm-paneer"] }, 12);
  const saved2 = V.saveSession(versions, s2, { now: 20, name: "With paneer" });
  const child = saved2.versions[saved2.id];
  assert.equal(child.parent, v.id);
  assert.match(V.lineage(child, saved2.versions), /Your version/);
  // update bumps the revision
  const upd = V.saveSession(versions, V.changeSession(V.startSession(masalaRecipe, v), { servings: 3 }), { mode: "update", now: 30 });
  assert.equal(upd.versions[v.id].rev, 2);
  assert.equal(JSON.stringify(masalaRecipe), before);
});

test("planned meals reference exact versions; an edited version offers a reviewable update", () => {
  let versions = {};
  let s = V.changeSession(V.startSession(masalaRecipe), { servings: 2, applied: ["cm-canned-tomatoes"] });
  ({ versions } = V.saveSession(versions, s, { now: 1 }));
  const v = Object.values(versions)[0];
  const entry = V.planEntry({ recipeId: masalaRecipe.id, version: v, snapshot: v, servings: 2, now: 2 });
  let list = emptyList();
  const derive = (e) => deriveRecipe(masalaRecipe, { servings: e.servings, applied: e.applied });
  ({ list } = syncRecipe(list, { id: entry.id, title: "Chana masala" }, needsFor(derive(entry), {})));
  const tomatoes = () => list.lines.find((l) => l.item === "canned-tomatoes");
  assert.equal(displayQty(tomatoes()), "200 g");
  // edit the saved version: the planned meal and list do not change by themselves
  const upd = V.saveSession(versions, V.changeSession(V.startSession(masalaRecipe, v), { applied: ["cm-canned-tomatoes", "cm-paneer"] }), { mode: "update", now: 3 });
  const notice = V.planUpdate(entry, upd.versions);
  assert.equal(notice.kind, "updated");
  assert.deepEqual(entry.applied, ["cm-canned-tomatoes"]);
  assert.ok(!list.lines.some((l) => l.item === "paneer"));
  // accepting the update keeps the planned servings and regenerates that meal's lines
  const accepted = V.acceptPlanUpdate(entry, notice.version);
  assert.equal(accepted.servings, 2);
  ({ list } = syncRecipe(list, { id: entry.id, title: "Chana masala" }, needsFor(derive(accepted), {})));
  assert.equal(displayQty(list.lines.find((l) => l.item === "paneer")), "100 g");
  assert.equal(V.planUpdate(accepted, upd.versions), null);
  // a removed version keeps the meal's own copy
  assert.equal(V.planUpdate(entry, {}).kind, "removed");
});

test("pantry allocation across planned meals, with unknown amounts confirmed per meal", () => {
  const a = { id: "p1", derived: deriveRecipe(masalaRecipe, { servings: 4, applied: [] }) }; // 300 g rice, 2 onions
  const b = { id: "p2", derived: deriveRecipe(dal, { servings: 4, applied: [] }) }; // 300 g rice
  const pantry = { basmati: { qty: 400, unit: "g" }, onion: {} };
  let m = allocateNeeds([a, b], pantry);
  assert.equal(m.get("p1").find((n) => n.item === "basmati"), undefined);
  assert.equal(m.get("p2").find((n) => n.item === "basmati").qty, 200);
  assert.equal(m.get("p1").find((n) => n.item === "onion").check, true);
  const fp = m.get("p1").find((n) => n.item === "onion").fingerprint;
  m = allocateNeeds([a, b], pantry, { onion: { [fp]: "enough" } });
  assert.equal(m.get("p1").find((n) => n.item === "onion"), undefined);
  m = allocateNeeds([a, b], pantry, { onion: { [fp]: "buy" } });
  assert.equal(m.get("p1").find((n) => n.item === "onion").check, undefined);
  // check lines are asked about, never added to the list as purchases
  let list = emptyList();
  ({ list } = syncRecipe(list, { id: "p1", title: "Chana masala" }, allocateNeeds([a], pantry).get("p1")));
  assert.ok(!list.lines.some((l) => l.item === "onion"));
});

test("cooking feedback attaches to the exact version, and repeatable versions come from it", () => {
  const rec = V.cookRecord({ recipeId: "chana-masala", versionId: "v1", rev: 2, snapshot: { servings: 2, applied: ["cm-paneer"] }, now: 5 });
  assert.deepEqual([rec.versionId, rec.rev, rec.servings, rec.applied], ["v1", 2, 2, ["cm-paneer"]]);
  const cooks = [{ ...rec, feedback: { again: "yes", familiar: "somewhat" } }, { ...rec, id: "c2", versionId: "v2", feedback: { again: "no" } }];
  assert.deepEqual(V.repeatable(cooks, { v1: {}, v2: {} }).map((c) => c.versionId), ["v1"]);
});

test("combined ingredients like ginger garlic paste are not collapsed into one", () => {
  const m = matchItem("ginger garlic paste");
  assert.equal(m.item, null);
  assert.equal(m.confidence, "compound");
  assert.deepEqual(m.components.sort(), ["garlic", "ginger"]);
  assert.equal(matchItem("ground ginger").item, "ground-ginger");
});

// ---------------------------------------------------------------- T10 integrity audit

test("B03 B04 B05: small amounts keep their real size; purchases round separately", () => {
  assert.equal(formatQty(0.25, ""), "¼");
  assert.equal(formatQty(0.125, "tsp"), "⅛ tsp");
  assert.equal(formatQty(0.2, "g"), "0.2 g");
  assert.equal(formatQty(0.0625, "tsp"), "a pinch"); // smaller than a measure, never rounded up to double
  assert.equal(formatQty(0.25, "tbsp"), "¾ tsp"); // no one owns a quarter tablespoon
  // Never silently doubles: the measured amount stays within a third of the exact amount
  for (const unit of ["", "tsp", "tbsp", "cup", "g", "ml"]) {
    for (const q of [0.125, 0.2, 0.25, 0.3, 0.5, 0.75, 1.1, 2.4, 7, 19, 33, 212]) {
      const measured = practical(q, unit);
      assert.ok(measured / q < 1.5 && measured / q > 0.6, `${q} ${unit} became ${measured}`);
    }
  }
  // Half a lemon to cook with; a whole lemon to buy
  assert.equal(formatQty(0.5, ""), "½");
  assert.equal(purchaseQty(0.5, ""), 1);
  assert.equal(displayQty({ sources: { a: { qty: 0.5, unit: "", title: "x" } } }), "1");
  assert.ok(purchaseQty(127, "g") >= 127, "a purchase is never less than the need");
});

test("B02 B09: method amounts follow the same state, and water doesn't scale linearly", () => {
  const masala = masalaRecipe;
  const at = (n) => deriveRecipe(masala, { servings: n, applied: [] });
  assert.match(at(4).steps.find((s) => s.id === "s6").text, /about 250 ml water/);
  const two = at(2).steps.find((s) => s.id === "s6").text;
  assert.doesNotMatch(two, /250 ml/);
  assert.match(two, /about 155 ml water|about 160 ml water/); // 250 * (1 + (0.5 - 1) * 0.75), not a blind 125 ml
  assert.equal(at(1).method.simmer.qty < 125 && at(1).method.simmer.qty > 62.5, true);
  // pieces scale linearly in the method text
  const paratha = getRecipe("aloo-paratha");
  assert.match(deriveRecipe(paratha, { servings: 2, applied: [] }).steps.find((s) => s.id === "s3").text, /into 4 each/);
  // every method amount in every recipe and rule renders; no literal water or oil amounts remain in steps
  for (const r of RECIPES) {
    for (const n of [r.servingsRange[0], 2, 4, r.servingsRange[1]]) {
      if (n < r.servingsRange[0] || n > r.servingsRange[1]) continue;
      for (const st of deriveRecipe(r, { servings: n, applied: [] }).steps) assert.ok(!/[{}]/.test(st.text), `${r.id}@${n}: ${st.text}`);
    }
  }
  for (const s of [...RECIPES.flatMap((r) => r.steps.map((x) => x.text)), ...SWAPS.flatMap((x) => [...Object.values(x.steps ?? {}), ...(x.addSteps ?? []).map((y) => y.text)])]) {
    assert.doesNotMatch(s, /\b\d+ ?(ml|l)\b/, `literal liquid amount in: ${s}`);
  }
  // pan and liquid rules are named at other portions, and absent at the written yield
  assert.deepEqual(scalingNotes(at(4)), []);
  const kinds = scalingNotes(at(2)).map((n) => n.kind);
  assert.ok(kinds.includes("pan") && kinds.includes("liquid") && kinds.includes("time"));
  assert.match(scalingNotes(at(2)).find((n) => n.kind === "pan").text, /2 tbsp|2¼ tbsp/);
});

test("B01: serving descriptions follow the active portions", () => {
  const at = (n, applied = []) => deriveRecipe(masalaRecipe, { servings: n, applied });
  assert.equal(servingDescription(at(4)), "a quarter of the curry with 75 g uncooked rice");
  assert.equal(servingDescription(at(2)), "half of the curry with 75 g uncooked rice");
  assert.equal(servingDescription(at(1)), "all of the curry with 75 g uncooked rice");
  assert.equal(servingDescription(deriveRecipe(getRecipe("aloo-paratha"), { servings: 3, applied: [] })), "2 parathas");
  // Effect text uses the same state: no "200 g for 4" at two servings
  const d = at(2, ["cm-paneer"]);
  const text = renderEffect(getSwap("cm-paneer").effects.quantity, d);
  assert.match(text, /100 g/);
  assert.match(text, /2 servings/);
  assert.doesNotMatch(text, /200 g|4 servings/);
  // Every effect token resolves
  for (const s of SWAPS) for (const v of Object.values(s.effects)) {
    const r = getRecipe(s.recipe);
    assert.ok(!/[{}]/.test(renderEffect(v, deriveRecipe(r, { servings: r.servings, applied: [s.id] }))), `${s.id}: ${v}`);
    assert.doesNotMatch(renderEffect(v, deriveRecipe(r, { servings: r.servings, applied: [s.id] })), /The amount/, `${s.id}: unresolved amount`);
  }
});

test("portions at one, two, four and each dish's maximum: ingredients, method, nutrition and list agree", () => {
  for (const r of RECIPES) {
    const [min, max] = r.servingsRange;
    assert.ok(min >= 1 && max <= 12 && min <= r.servings && r.servings <= max, `${r.id}: range`);
    for (const n of [...new Set([min, 1, 2, 4, max])].filter((x) => x >= min && x <= max)) {
      const d = deriveRecipe(r, { servings: n, applied: [] });
      for (const l of d.ingredients) for (const e of l.entries) {
        assert.ok(e.qty > 0, `${r.id}@${n}: ${e.item}`);
        const text = formatQty(e.qty, e.unit, e.step);
        assert.ok(text && !/^0( |$)/.test(text), `${r.id}@${n}: ${e.item} shows ${text}`);
        if (e.unit === "" && !e.step) assert.ok(practical(e.qty, e.unit) / e.qty < 1.5, `${r.id}@${n}: ${e.item} doubled`);
      }
      const needs = needsFor(d, {});
      for (const need of needs.filter((x) => !x.optional)) {
        const ing = d.ingredients.flatMap((l) => l.entries).filter((e) => e.item === need.item);
        const total = ing.reduce((s, e) => s + convert(e.qty, e.unit, need.unit), 0);
        assert.ok(Math.abs(total - need.qty) < 0.001, `${r.id}@${n}: list ${need.item}`);
      }
      assert.ok(estimate(d).kcal.incomplete || estimate(d).kcal.mid > 0);
      assert.equal(timingFor(r, []).elapsed, r.minutes, "time doesn't scale with portions");
    }
    assert.equal(setServings({ servings: r.servings, applied: [] }, 99, r).servings, max);
    assert.equal(setServings({ servings: r.servings, applied: [] }, 0, r).servings, min);
  }
  // Tiny quantities at one serving keep their size
  const kadhi = deriveRecipe(getRecipe("punjabi-kadhi"), { servings: 1, applied: [] });
  assert.equal(formatQty(line(kadhi, "hing").entries[0].qty, "tsp"), "a pinch");
  assert.equal(formatQty(line(deriveRecipe(dal, { servings: 1, applied: [] }), "lemon").entries[0].qty, ""), "⅛");
});

test("B06: nutrition uses the amounts a cook measures", () => {
  const d = deriveRecipe(dal, { servings: 3, applied: [] });
  const lentils = line(d, "lentils").entries[0];
  const est = estimate(d);
  const proteinFromMeasured = (practical(lentils.qty, "g") * 24) / 100;
  assert.ok(est.protein.mid * 3 >= proteinFromMeasured, "the estimate is built from measured amounts");
  assert.ok(RANGE_NOTE.includes("illustrative") && RANGE_NOTE.includes("not measured"));
});

test("B07: raw weight per serving is labelled as raw, with no plated weight claim", () => {
  const base = estimate(deriveRecipe(masalaRecipe, { servings: 4, applied: [] }));
  const more = estimate(deriveRecipe(masalaRecipe, { servings: 4, applied: ["cm-paneer"] }));
  assert.equal(base.servingGrams, undefined);
  const change = rawWeightChange(base, more);
  assert.equal(change.change, "more");
  assert.equal(Math.round(change.delta), 50);
});

test("B10 A08: portions revalidate against authored ranges; time separates active, elapsed and advance", () => {
  const atOne = evaluate(pbm, { servings: 1, applied: ["pbm-sunflower"] }, defaultConstraints());
  assert.equal(atOne.qtyIssues[0].swap.id, "pbm-sunflower");
  assert.equal(evaluate(pbm, { servings: 2, applied: ["pbm-sunflower"] }, defaultConstraints()).qtyIssues.length, 0);
  // A dish's own range also applies
  assert.match(evaluate(getRecipe("goat-curry"), { servings: 1, applied: [] }, defaultConstraints()).portionIssue, /2 to 8/);
  // An overnight soak can't count as quick because hands-on time is short
  const t = timingFor(masalaRecipe, ["cm-dried-chickpeas"]);
  assert.ok(t.active < t.elapsed);
  assert.equal(t.advance, 480);
  const quick = candidates(masalaRecipe, 4, { ...defaultConstraints(), timeLimit: 120 });
  assert.ok(quick.notEligible.find((c) => c.id === "cm-dried-chickpeas").blockers.some((b) => b.kind === "limit"));
  assert.ok(quick.eligible.some((c) => c.id === "original"));
});

test("B11: optional garnish isn't a default purchase, and can be included", () => {
  const d = deriveRecipe(masalaRecipe, { servings: 4, applied: [] });
  const out = allocateNeeds([{ id: "p", derived: d }], {});
  const cilantro = out.get("p").find((n) => n.item === "cilantro");
  assert.equal(cilantro.optional, true);
  assert.equal(cilantro.included, false);
  let list = emptyList();
  ({ list } = syncRecipe(list, { id: "p", title: "x" }, out.get("p")));
  assert.ok(!list.lines.some((l) => l.item === "cilantro"));
  const withIt = allocateNeeds([{ id: "p", derived: d, includeOptional: ["cilantro"] }], {});
  ({ list } = syncRecipe(list, { id: "p", title: "x" }, withIt.get("p")));
  assert.ok(list.lines.some((l) => l.item === "cilantro"));
  assert.match(d.steps.find((s) => s.id === "s7").text, /cilantro \(optional\)/);
  // Optional ingredients with real nutrition are disclosed in the estimate
  assert.deepEqual(estimate(deriveRecipe(getRecipe("masala-chai"), { servings: 2, applied: [] })).optionalIncluded, ["Sugar"]);
});

test("A12: declared pairs alone don't make a larger set supported; exact bundles do", () => {
  const set = ["cm-canned-tomatoes", "cm-paneer", "cm-spinach"];
  // Every pair here is declared, but the three together were never written
  const status = comboStatus("chana-masala", set);
  assert.equal(status.status, "untested");
  assert.equal(status.wholeSetUntested, true);
  assert.equal(status.untested.length, 0);
  assert.equal(checkSwap(masalaRecipe, { servings: 4, applied: ["cm-canned-tomatoes", "cm-paneer"] }, "cm-spinach").wholeSetUntested, true);
  // Order doesn't matter for an authored bundle
  assert.equal(comboStatus("paneer-butter-masala", ["pbm-oil", "pbm-tofu", "pbm-coconut", "pbm-sunflower"]).status, "supported");
  assert.equal(comboStatus("chana-masala", ["cm-canned-tomatoes", "cm-paneer"]).status, "supported");
  assert.equal(comboStatus("chana-masala", []).status, "supported");
});

test("A04 A05 A06: eligibility stays apart from targets; competing protein and fiber targets are explained", () => {
  // Protein target with no hard restrictions: never blames requirements that don't exist
  const c = { ...defaultConstraints(), targets: { protein: 30, fiber: null } };
  const r = resolve(masalaRecipe, 4, c);
  assert.equal(r.status, "target-conflict");
  assert.doesNotMatch(r.explanation, /Within your requirements/);
  assert.match(r.explanation, /30 g target/);
  assert.ok(["may-meet", "out-of-reach"].includes(r.cause));
  assert.equal(r.fit.meets.length, 0);
  const g = groupByFit(r.eligible);
  assert.equal(g.may.length + g.closest.length + g.unknown.length, r.eligible.length);
  // The lower goal is achieved by one eligible candidate, as a set
  const lower = r.choices.find((x) => x.type === "lower-target");
  const check = resolve(masalaRecipe, 4, { ...c, targets: { protein: lower.values.protein, fiber: null } });
  assert.ok(check.fit.meets.some((x) => x.id === lower.option.id));
  // Two targets no single candidate reaches: maxima belong to different versions, and it says so
  const twoT = { ...defaultConstraints(), targets: { protein: 30, fiber: 15 } };
  const dish = getRecipe("chana-palak");
  const res = resolve(dish, 4, twoT);
  const setLower = res.choices.find((x) => x.type === "lower-target");
  assert.ok(setLower, "a lower set is offered");
  const verify = resolve(dish, 4, { ...twoT, targets: { ...twoT.targets, ...setLower.values } });
  assert.ok(verify.fit.meets.some((x) => x.id === setLower.option.id), "the same candidate meets the whole lower set");
  // A real competing pair: eggs reach the protein goal, peas reach the fiber goal, nothing reaches both
  const competing = resolve(bhurji, 2, { ...defaultConstraints(), targets: { protein: 28, fiber: 8 } });
  assert.equal(competing.status, "target-conflict");
  assert.equal(competing.cause, "competing");
  assert.equal(competing.competing.protein.id, "pb-eggs");
  assert.match(competing.explanation, /No single version reaches both/);
  const competingLower = competing.choices.find((x) => x.type === "lower-target");
  const lowered = resolve(bhurji, 2, { ...defaultConstraints(), targets: { protein: 28, fiber: 8, ...competingLower.values } });
  assert.ok(lowered.fit.meets.some((x) => x.id === competingLower.option.id), "one candidate meets the lowered set");
});

test("A05: causes are specific: requirements, data, time", () => {
  // Only a dietary exclusion stands between you and the goal
  const noDairy = { ...defaultConstraints(), avoid: ["dairy"], answers: { soy: "avoid" }, targets: { protein: 21, fiber: null } };
  const r = resolve(masalaRecipe, 4, noDairy);
  if (r.status === "target-conflict") assert.match(r.explanation, /Within your requirements/);
  // Goat: nutrition can't be estimated from bone-in weight
  const goat = resolve(getRecipe("goat-curry"), 4, { ...defaultConstraints(), targets: { protein: 20, fiber: null } });
  assert.equal(goat.cause, "no-data");
  assert.match(goat.explanation, /can't be estimated/);
  // A time limit that excludes every version says time, not diet
  const timed = resolve(getRecipe("goat-curry"), 4, { ...defaultConstraints(), timeLimit: 30 });
  assert.equal(timed.status, "no-supported");
  assert.equal(timed.cause, "time");
});

test("A09 A10: questions depend on the dish; time-only and protein-only profiles are evaluated", () => {
  const vegan = { ...defaultConstraints(), diet: "vegan" };
  const items = (r) => [...new Set([...r.ingredients.map((i) => i.item), ...SWAPS.filter((s) => s.recipe === r.id).flatMap((s) => [...(s.replace?.with ?? []), ...(s.add ?? [])].map((w) => w.item))])];
  // Chai can use soy milk, so soy matters; sesame doesn't appear in any option
  assert.deepEqual(relevantQuestions(vegan, items(getRecipe("masala-chai"))).map((q) => q.key), ["soy"]);
  // Aloo paratha has no soy, sesame, nut or egg in any option, so nothing is asked
  assert.deepEqual(relevantQuestions(vegan, items(getRecipe("aloo-paratha"))), []);
  assert.deepEqual(relevantQuestions({ ...defaultConstraints(), diet: "vegetarian" }, items(getRecipe("paneer-bhurji"))).map((q) => q.key).sort(), ["eggs", "soy"]);
  // Hard exclusions are preserved regardless of questions
  assert.ok(checkItems(["paneer"], vegan).conflicts.length === 1);
  assert.equal(resolve(getRecipe("aloo-paratha"), 4, vegan).questions.length, 0);
  // Filter semantics
  assert.equal(hasFilterCriteria(defaultConstraints()), false);
  assert.equal(hasFilterCriteria({ ...defaultConstraints(), timeLimit: 30 }), true);
  assert.equal(hasFilterCriteria({ ...defaultConstraints(), targets: { protein: 30 } }), false, "targets rank, they don't filter");
  // Time-only: filters without any dietary exclusion
  const timed = candidates(getRecipe("goat-curry"), 4, { ...defaultConstraints(), timeLimit: 30 });
  assert.equal(timed.eligible.length, 0);
});

test("A01: what's missing shapes the first recommendations", () => {
  const plain = candidates(masalaRecipe, 2, defaultConstraints(), {});
  assert.equal(plain.eligible[0].id, "original");
  const noTomato = candidates(masalaRecipe, 2, defaultConstraints(), { "fresh-tomatoes": { out: true } });
  assert.equal(noTomato.eligible[0].id, "cm-canned-tomatoes");
  assert.deepEqual(noTomato.eligible.find((c) => c.id === "original").ev.missing, ["fresh-tomatoes"]);
  // Zero in stock is out of stock too
  assert.equal(candidates(masalaRecipe, 2, defaultConstraints(), { "fresh-tomatoes": { qty: 0, unit: "" } }).eligible[0].id, "cm-canned-tomatoes");
});

test("C01 D09: zero, blank, invalid and exponent input", () => {
  let p = { onion: { qty: 2, unit: "" } };
  assert.deepEqual(pantryCore.applyAmountInput(p, "onion", "0", "").pantry.onion, { qty: 0, unit: "" });
  assert.equal(pantryCore.availability(pantryCore.applyAmountInput(p, "onion", "0", "").pantry, "onion").status, "out");
  for (const bad of ["-2", "abc", "1e3", "2 3", "∞"]) {
    const r = pantryCore.applyAmountInput(p, "onion", bad, "");
    assert.ok(r.error, `${bad} rejected`);
    assert.deepEqual(r.pantry.onion, { qty: 2, unit: "" }, `${bad} keeps the last valid value`);
  }
  // Blank doesn't turn a measured amount into unknown unless it's an explicit clear
  assert.ok(pantryCore.applyAmountInput(p, "onion", "", "").error);
  assert.deepEqual(pantryCore.clearAmount(p, "onion").onion, {});
  assert.deepEqual(pantryCore.applyAmountInput(p, "onion", "1.5", "").pantry.onion, { qty: 1.5, unit: "" });
  // Blank on an unknown amount stays unknown, quietly
  assert.equal(pantryCore.applyAmountInput({ onion: {} }, "onion", "", "").error, undefined);
  // Zero stock isn't positive presence: it counts as needed, and isn't a "have" check
  const d = deriveRecipe(masalaRecipe, { servings: 4, applied: [] });
  const need = needsFor(d, { onion: { qty: 0, unit: "" } }).find((n) => n.item === "onion");
  assert.equal(need.check, undefined);
  assert.equal(need.qty, 2);
  // List quantities: blank is unfinished, zero is deliberate
  let list = emptyList();
  ({ list } = syncRecipe(list, { id: "p", title: "x" }, needsFor(d, {})));
  const chick = list.lines.find((l) => l.item === "chickpeas");
  assert.equal(setOverride(list, chick.id, "  "), list);
  assert.equal(setOverride(list, chick.id, "0").lines.find((l) => l.id === chick.id).override.qty, 0);
});

test("C02 C07: units convert and never relabel; incompatible purchases keep the measured amount", () => {
  const p = { basmati: { qty: 500, unit: "g" } };
  assert.deepEqual(pantryCore.changeUnit(p, "basmati", "kg").pantry.basmati, { qty: 0.5, unit: "kg" });
  assert.deepEqual(pantryCore.changeUnit(pantryCore.changeUnit(p, "basmati", "kg").pantry, "basmati", "g").pantry.basmati, { qty: 500, unit: "g" });
  assert.deepEqual(pantryCore.changeUnit({ milk: { qty: 1, unit: "l" } }, "milk", "ml").pantry.milk, { qty: 1000, unit: "ml" });
  const bad = pantryCore.changeUnit(p, "basmati", "ml");
  assert.ok(bad.error);
  assert.deepEqual(bad.pantry, p);
  // A purchase that can't compare is kept beside the measured amount
  const bought = pantryCore.addBought({ garlic: { qty: 50, unit: "g" } }, "garlic", 4, "cloves");
  assert.equal(bought.garlic.qty, 50);
  assert.deepEqual(bought.garlic.also, [{ qty: 4, unit: "cloves" }]);
  // Both observations count, each only against its own kind of amount
  const d = deriveRecipe(masalaRecipe, { servings: 4, applied: [] });
  assert.equal(needsFor(d, bought).find((n) => n.item === "garlic"), undefined);
  assert.match(pantryCore.amountText(bought.garlic), /can't be compared/);
});

test("C03 C04: an enough answer is bound to the combined requirement and goes stale", () => {
  const meal = (n, id = "p1") => ({ id, title: id, derived: deriveRecipe(masalaRecipe, { servings: n, applied: [] }) });
  const pantry = { onion: {} };
  const first = allocateNeeds([meal(2)], pantry).get("p1").find((n) => n.item === "onion");
  assert.equal(first.check, true);
  let conf = recordConfirmation({}, "onion", first.fingerprint, "enough");
  assert.equal(allocateNeeds([meal(2)], pantry, conf).get("p1").find((n) => n.item === "onion"), undefined);
  // Growing the requirement asks again: 2 → 12 servings can't reuse the answer
  const grown = allocateNeeds([meal(10)], pantry, conf).get("p1").find((n) => n.item === "onion");
  assert.equal(grown.check, true);
  assert.equal(grown.stale, true);
  // Stock changing asks again
  const revised = allocateNeeds([meal(2)], pantry, conf, { revisions: { onion: 1 } }).get("p1").find((n) => n.item === "onion");
  assert.equal(revised.check, true);
  // Two meals: one question about the combined total, not a yes per meal
  const both = allocateNeeds([meal(2, "p1"), meal(4, "p2")], pantry, {});
  const q1 = both.get("p1").find((n) => n.item === "onion");
  const q2 = both.get("p2").find((n) => n.item === "onion");
  assert.equal(q1.fingerprint, q2.fingerprint);
  assert.equal(q1.combined.qty, 3);
  assert.deepEqual(q1.combined.meals, ["p1", "p2"]);
  // Adding a meal makes an answer about one meal stale
  const one = recordConfirmation({}, "onion", allocateNeeds([meal(2, "p1")], pantry).get("p1")[0].fingerprint ?? first.fingerprint, "enough");
  assert.equal(allocateNeeds([meal(2, "p1"), meal(4, "p2")], pantry, one).get("p1").find((n) => n.item === "onion").check, true);
  // Back to the same requirement doesn't ask again
  assert.equal(allocateNeeds([meal(2)], pantry, conf).get("p1").find((n) => n.item === "onion"), undefined);
});

test("C06 D02: transfers are idempotent, persisted and use the bought amount", async () => {
  const d = deriveRecipe(masalaRecipe, { servings: 4, applied: [] }); // ½ lemon
  let list = emptyList();
  ({ list } = syncRecipe(list, { id: "p", title: "x" }, needsFor(d, { lemon: { out: true } })));
  const lemon = list.lines.find((l) => l.item === "lemon");
  assert.equal(computedQty(lemon).qty, 0.5);
  assert.equal(displayQty(lemon), "1");
  assert.deepEqual(boughtDefault(lemon), { qty: 1, unit: "" });
  const first = recordTransfer(list, lemon.id, { qty: 1, unit: "" }, { now: 1 });
  assert.equal(first.ok, true);
  const again = recordTransfer(JSON.parse(JSON.stringify(first.list)), lemon.id, { qty: 1, unit: "" }, { now: 2 });
  assert.equal(again.ok, false);
  assert.equal(again.already, true);
  // "Bought more" is a separate, explicit action
  assert.equal(recordTransfer(first.list, lemon.id, { qty: 1, unit: "" }, { more: true }).ok, true);
  // The transferred amount reaches the pantry, not the raw requirement
  const pantry = pantryCore.addBought({ lemon: { out: true } }, "lemon", 1, "");
  assert.deepEqual(pantry.lemon, { qty: 1, unit: "" });
  // A finished line survives regeneration untouched, and a new shortfall gets its own line
  const twelve = deriveRecipe(masalaRecipe, { servings: 10, applied: [] });
  const { list: after } = syncRecipe(first.list, { id: "p", title: "x" }, needsFor(twelve, pantry));
  const lemons = after.lines.filter((l) => l.item === "lemon");
  assert.equal(lemons.length, 2);
  assert.ok(lemons[0].transfer);
  assert.equal(lemons[0].conflict, null);
  assert.equal(computedQty(lemons[1]).qty, 0.25);
});

test("A03: not checked, have unknown, have measured and don't have stay distinct", () => {
  const d = deriveRecipe(masalaRecipe, { servings: 4, applied: [] });
  assert.equal(pantryCore.availability({}, "onion").status, "unchecked");
  assert.equal(pantryCore.availability({ onion: {} }, "onion").status, "have");
  assert.equal(pantryCore.availability({ onion: { qty: 1, unit: "" } }, "onion").status, "some");
  assert.equal(pantryCore.availability({ onion: { out: true } }, "onion").status, "out");
  assert.equal(needsFor(d, {}).find((n) => n.item === "onion").unchecked, true);
  assert.equal(needsFor(d, { onion: { out: true } }).find((n) => n.item === "onion").unchecked, undefined);
  const ev = evaluate(masalaRecipe, { servings: 4, applied: [] }, defaultConstraints(), { onion: { out: true } });
  assert.ok(ev.toCheck > 0 && ev.toCheck < ev.purchases);
});

test("C09 C10 C11: one alias-aware search; Enter adds only an exact match; free text can be matched", () => {
  for (const [q, id] of [["palak", "spinach-fresh"], ["chole", "chickpeas"], ["kabuli channa", "chickpeas"], ["rajma", "kidney-beans"], ["garbanzo", "chickpeas"], ["tomatoes", "fresh-tomatoes"], ["jeera", "cumin-seeds"]]) {
    assert.equal(searchIngredients(q)[0].id, id, q);
  }
  assert.equal(searchIngredients("palak")[0].via, "palak");
  // Ambiguous and regional spellings return every candidate
  for (const q of ["chana", "channa"]) assert.ok(["chickpeas", "kala-chana", "chana-dal"].every((id) => searchIngredients(q).some((h) => h.id === id)), q);
  // Enter: unambiguous exact match only
  assert.equal(exactIngredient("paneer"), "paneer");
  assert.equal(exactIngredient("palak"), "spinach-fresh");
  assert.equal(exactIngredient("chana"), null);
  assert.equal(exactIngredient("rice"), null);
  assert.equal(exactIngredient("chick"), null, "a substring is never an exact match");
  assert.equal(exactIngredient("tomato purée"), "tomato-puree");
  // Free text keeps its wording until matched, then carries a plain amount over
  let p = pantryCore.addFree({}, "Kabuli chana from the big jar", "500 g");
  p = pantryCore.matchFree(p, "free:kabuli chana from the big jar", "chickpeas");
  assert.equal(p.chickpeas.qty, 500);
  assert.equal(p.chickpeas.fromFree.name, "Kabuli chana from the big jar");
  assert.equal(p["free:kabuli chana from the big jar"], undefined);
  // An unparseable amount stays as a note instead of being invented
  const q2 = pantryCore.matchFree(pantryCore.addFree({}, "Rice", "a big bag"), "free:rice", "basmati");
  assert.equal(q2.basmati.qty, undefined);
  assert.equal(q2.basmati.fromFree.qtyText, "a big bag");
});

test("C05: the post-cooking review deducts known stock once, keeps unknown unknown, and undoes narrowly", () => {
  const snap = V.deriveSnapshot(masalaRecipe, { servings: 2, applied: ["cm-canned-tomatoes"] });
  const pantry = { basmati: { qty: 400, unit: "g" }, onion: {}, garlic: { qty: 1, unit: "head" }, "canned-tomatoes": { qty: 100, unit: "g" }, cilantro: { out: true } };
  const rows = pantryCore.cookPantryReview(snap.ingredients, pantry);
  const by = (item) => rows.find((r) => r.item === item);
  assert.equal(by("basmati").action, "deduct");
  assert.equal(by("basmati").after.qty, 250);
  assert.equal(by("onion").action, "unknown");
  assert.equal(by("garlic").action, "incomparable");
  assert.equal(by("cilantro").action, "none");
  assert.equal(by("canned-tomatoes").after.qty, 0, "can't go negative");
  const { pantry: after, inverse } = pantryCore.applyCookReview(pantry, rows);
  assert.equal(after.basmati.qty, 250);
  assert.deepEqual(after.onion, {}, "unknown stays unknown");
  assert.deepEqual(after.garlic, { qty: 1, unit: "head" });
  assert.equal(inverse.length, 2);
  // Undo adds back what was taken, against the current state: a later edit survives
  const base = { ...initialState3(), pantry: { ...after, basmati: { qty: 300, unit: "g" }, paneer: { qty: 200, unit: "g" } }, cooks: [{ id: "c1", pantryUpdate: { at: 1 } }] };
  const { state: s, id } = addRecovery(base, { kind: "cook-pantry", label: "x", cookId: "c1", takes: rows.filter((r) => r.action === "deduct").map((r) => ({ item: r.item, ...r.take })) });
  const undone = applyRecovery(s, id).state;
  assert.equal(undone.pantry.basmati.qty, 450);
  assert.deepEqual(undone.pantry.paneer, { qty: 200, unit: "g" });
  assert.equal(undone.cooks[0].pantryUpdate, null);
  assert.equal(undone.recovery.length, 0);
});

function initialState3() {
  return { version: 3, pantry: {}, saved: [], sessions: {}, versions: {}, drafts: {}, plan: [], list: emptyList(), cooks: [], recovery: [] };
}

test("E09: undo is a narrow inverse, so later edits survive", () => {
  // remove an item → edit another → undo restores the first and keeps the edit
  let s = { ...initialState3(), pantry: { onion: { qty: 2, unit: "" }, paneer: { qty: 100, unit: "g" } } };
  const { onion, ...rest } = s.pantry;
  const r1 = addRecovery({ ...s, pantry: rest }, { kind: "pantry-entry", key: "onion", entry: onion, label: "onion" });
  s = { ...r1.state, pantry: { ...r1.state.pantry, paneer: { qty: 900, unit: "g" } } };
  s = applyRecovery(s, r1.id).state;
  assert.deepEqual(s.pantry, { paneer: { qty: 900, unit: "g" }, onion: { qty: 2, unit: "" } });

  // list line: remove → check another → undo keeps the check and clears the dismissal
  let list = emptyList();
  ({ list } = syncRecipe(list, { id: "p", title: "x" }, needsFor(deriveRecipe(masalaRecipe, { servings: 4, applied: [] }), {})));
  const rice = list.lines.find((l) => l.item === "basmati");
  const idx = list.lines.indexOf(rice);
  let afterDel = deleteLine(list, rice.id);
  const other = afterDel.lines.find((l) => l.item === "onion");
  const r2 = addRecovery({ ...initialState3(), list: afterDel }, { kind: "list-line", line: rice, index: idx, label: "rice" });
  afterDel = toggleChecked(afterDel, other.id);
  const restored = applyRecovery({ ...r2.state, list: afterDel }, r2.id).state;
  assert.ok(restored.list.lines.find((l) => l.id === other.id).checked);
  assert.ok(restored.list.lines.some((l) => l.id === rice.id));
  assert.equal(restored.list.dismissed.p?.[rice.key], undefined);

  // A session isn't restored over newer work
  const r3 = addRecovery({ ...initialState3(), sessions: { "chana-masala": { newer: true } } }, { kind: "session", recipeId: "chana-masala", session: { older: true }, label: "x" });
  const blocked = applyRecovery(r3.state, r3.id);
  assert.ok(blocked.blocked);
  assert.equal(blocked.state.sessions["chana-masala"].newer, true);

  // A removed version comes back without disturbing what happened since
  const v = { id: "v1", recipeId: "chana-masala", name: "Mine" };
  const r4 = addRecovery({ ...initialState3(), versions: { v2: { id: "v2" } } }, { kind: "version", version: v, label: "x" });
  assert.deepEqual(Object.keys(applyRecovery(r4.state, r4.id).state.versions).sort(), ["v1", "v2"]);
});

test("D01 D06 D07 D08 D10: two meals sharing an ingredient reconcile together, once", () => {
  const mealA = { id: "a", title: "A" };
  const mealB = { id: "b", title: "B" };
  const dA = (n = 4) => ({ id: "a", title: "A", derived: deriveRecipe(masalaRecipe, { servings: n, applied: [] }) }); // 300 g rice
  const dB = (n = 4) => ({ id: "b", title: "B", derived: deriveRecipe(dal, { servings: n, applied: [] }) }); // 300 g rice
  const pantry = { basmati: { qty: 400, unit: "g" } };
  const plan = (entries) => {
    const m = allocateNeeds(entries, pantry);
    return entries.map((e) => ({ id: e.id, title: e.title, needs: m.get(e.id) }));
  };
  let list = emptyList();
  let report;
  ({ list } = reconcile(list, plan([dA(), dB()])));
  const rice = () => list.lines.find((l) => l.item === "basmati" && !l.transfer);
  assert.equal(computedQty(rice()).qty, 200); // 600 - 400, counted once

  // Edited and checked lines survive; each gets exactly one conflict from the final total
  const garlicId = list.lines.find((l) => l.item === "garlic").id; // shared by both meals
  list = setOverride(list, rice().id, "250");
  list = toggleChecked(list, garlicId);
  ({ list, report } = reconcile(list, plan([dA(2), dB()])));
  assert.equal(computedQty(rice()).qty, 50); // 150 + 300 - 400
  assert.equal(rice().override.qty, 250);
  assert.equal(rice().conflict.type, "changed");
  assert.equal(rice().conflict.current.qty, 50, "compared with the final aggregate, not an intermediate one");
  assert.equal(report.conflicts, 2);
  const garlic = () => list.lines.find((l) => l.id === garlicId);
  assert.equal(garlic().checked, true, "a checked purchase is never silently unchecked");

  // Removing the first meal reallocates the second against the freed pantry, in one transaction
  list = resolveConflict(list, rice().id, "recipe");
  ({ list, report } = reconcile(list, plan([dB()]), { removed: ["a"] }));
  assert.equal(rice(), undefined, "300 g needed, 400 g on hand: nothing to buy");
  assert.equal(list.synced.a, undefined);
  assert.equal(garlic().conflict?.type ?? null, "changed");

  // Manual lines stay through every regeneration
  list = addManual(list, "Mango", "2");
  ({ list } = reconcile(list, plan([dA(), dB()])));
  assert.ok(list.lines.some((l) => l.manual && l.name === "Mango"));

  // An orphaned edit is kept for review, an untouched line just goes
  let l2 = emptyList();
  ({ list: l2 } = reconcile(l2, [{ ...mealA, needs: needsFor(dA().derived, {}) }, { ...mealB, needs: needsFor(dB().derived, {}) }]));
  const chick = l2.lines.find((l) => l.item === "chickpeas").id;
  const onionId = l2.lines.find((l) => l.item === "onion").id;
  l2 = setOverride(l2, chick, "500");
  ({ list: l2 } = reconcile(l2, [], { removed: ["a"] }));
  assert.equal(l2.lines.find((l) => l.id === chick).conflict.type, "orphan");
  assert.equal(l2.lines.find((l) => l.id === onionId), undefined);

  // D07: a change smaller than the display's rounding is still seen
  const sigA = needsSignature([{ key: "x", qty: 126, unit: "g" }]);
  const sigB = needsSignature([{ key: "x", qty: 127, unit: "g" }]);
  assert.equal(formatQty(126, "g"), formatQty(127, "g"));
  assert.notEqual(sigA, sigB);

  // D01: the same dish, rules and portions are the same planned meal
  const e1 = V.planEntry({ recipeId: "chana-masala", snapshot: { servings: 2, applied: ["cm-paneer"] }, servings: 2 });
  const e2 = V.planEntry({ recipeId: "chana-masala", snapshot: { servings: 2, applied: ["cm-paneer"] }, servings: 2 });
  assert.equal(V.samePlanned(e1, e2), true);
  assert.notEqual(e1.id, e2.id);
  assert.equal(V.samePlanned(e1, { ...e2, servings: 4 }), false);
});

test("D04 D05: list states stay separate; a dismissal shows again when its requirement changes", () => {
  const d = deriveRecipe(masalaRecipe, { servings: 4, applied: [] });
  let list = emptyList();
  assert.equal(listStatus(list, [], 0, 0), "no-meals");
  assert.equal(listStatus(list, [{}], 0, 0), "nothing-needed");
  assert.equal(listStatus(list, [{}], 2, 0), "pending", "pending checks never read as completion");
  assert.equal(listStatus(list, [{}], 0, 1), "dismissed");
  ({ list } = syncRecipe(list, { id: "p", title: "x" }, needsFor(d, {})));
  assert.equal(listStatus(list, [{}], 0, 0), "open");
  const allChecked = { ...list, lines: list.lines.map((l) => ({ ...l, checked: true })) };
  assert.equal(listStatus(allChecked, [{}], 0, 0), "all-checked");
  const rice = list.lines.find((l) => l.item === "basmati");
  list = deleteLine(list, rice.id);
  const needsNow = (n) => new Map([["p", needsFor(deriveRecipe(masalaRecipe, { servings: n, applied: [] }), {})]]);
  const same = dismissedReview(list, [{ id: "p" }], needsNow(4)).find((x) => x.need.item === "basmati");
  assert.equal(same.changed, false);
  const grown = dismissedReview(list, [{ id: "p" }], needsNow(8)).find((x) => x.need.item === "basmati");
  assert.equal(grown.changed, true);
  assert.equal(grown.need.qty, 600);
  assert.equal(grown.was.qty, 300);
});

test("E01 G07: a rule change doesn't rewrite history; snapshots reproduce what was recorded", () => {
  const swap = getSwap("cm-paneer");
  let versions = {};
  const session = V.changeSession(V.startSession(masalaRecipe), { servings: 2, applied: ["cm-paneer"] });
  ({ versions } = V.saveSession(versions, session, { now: 1 }));
  const v = Object.values(versions)[0];
  const entry = V.planEntry({ recipeId: masalaRecipe.id, version: v, snapshot: v, servings: 2 });
  const cook = V.cookRecord({ recipeId: masalaRecipe.id, versionId: v.id, rev: v.rev, snapshot: v, now: 2 });
  const live = (rec) => deriveRecipe(masalaRecipe, rec).ingredients.map((l) => l.entries.map((e) => [e.item, e.qty]));
  const fromSnap = (rec) => V.hydrateSnapshot(rec.snapshot).ingredients.map((l) => l.entries.map((e) => [e.item, e.qty]));
  // While the catalogue matches, the snapshot equals the live derivation
  for (const rec of [v, entry, cook]) {
    assert.deepEqual(fromSnap(rec), live(rec));
    assert.equal(V.recordStatus(rec).intact, true);
    assert.equal(rec.snapshot.rules[0].rev, 1);
    assert.equal(rec.recipeRev, masalaRecipe.rev);
  }
  // Later edit to the rule: revision changes, records keep what they recorded
  const label = swap.label;
  const qty = swap.add[0].qty;
  swap.rev = 2;
  swap.add[0].qty = 999;
  swap.label = "Renamed paneer";
  try {
    assert.deepEqual(V.recordStatus(cook).changedRules, ["cm-paneer"]);
    const d = V.derivedForRecord(cook);
    assert.equal(d.fromSnapshot, true);
    assert.equal(d.ingredients.find((l) => l.slot === "paneer").entries[0].qty, 100);
    assert.equal(V.ruleLabels(cook)[0], "Renamed paneer");
    assert.equal(cook.snapshot.rules[0].label, label);
    assert.equal(V.planUpdate(entry, versions).kind, "catalogue");
  } finally {
    swap.rev = undefined;
    delete swap.rev;
    swap.add[0].qty = qty;
    swap.label = label;
  }
  // A removed rule ID is named, never silently dropped
  const gone = { recipeId: masalaRecipe.id, servings: 2, applied: ["cm-removed"], snapshot: { ...entry.snapshot, rules: [{ id: "cm-removed", rev: 1, label: "An old rule" }] } };
  assert.deepEqual(V.recordStatus(gone).missingRules, ["cm-removed"]);
  assert.equal(V.derivedForRecord(gone).fromSnapshot, true);
  assert.equal(V.ruleLabels(gone)[0], "An old rule");
  const started = V.startSession(masalaRecipe, { ...gone, id: "x", snapshot: gone.snapshot });
  assert.deepEqual(started.applied, []);
  assert.deepEqual(started.droppedRules, ["An old rule"]);
});

test("E03: ids don't collide at identical timestamps", () => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) {
    const a = V.saveSession({}, V.startSession(masalaRecipe), { now: 1000 });
    const b = V.saveSession({}, V.startSession(dal), { now: 1000 });
    ids.add(a.id).add(b.id);
    ids.add(V.cookRecord({ recipeId: "chana-masala", snapshot: { servings: 2, applied: [] }, now: 1000 }).id);
    ids.add(V.planEntry({ recipeId: "chana-masala", snapshot: { servings: 2, applied: [] }, servings: 2, now: 1000 }).id);
  }
  assert.equal(ids.size, 200);
});

test("E04 E05 E07: an unsaved positive cook is repeatable; cook visits freeze and namespace progress", () => {
  const rec = { ...V.cookRecord({ recipeId: "chana-masala", snapshot: { servings: 2, applied: ["cm-spinach"] }, now: 5 }), feedback: { again: "yes" } };
  assert.equal(rec.versionId, null);
  const again = V.repeatable([rec], {});
  assert.equal(again.length, 1);
  assert.deepEqual([again[0].servings, again[0].applied], [2, ["cm-spinach"]]);
  // A saved version that was removed later still has a repeat path through its record
  assert.equal(V.repeatable([{ ...rec, versionId: "gone" }], {}).length, 1);
  // Frozen at entry: what's displayed doesn't follow later edits, and checks have their own session
  const a = V.beginCooking({ key: "session:chana-masala", recipeId: "chana-masala", label: "x", adaptation: { servings: 2, applied: ["cm-paneer"] } });
  const b = V.beginCooking({ key: "session:masoor-dal", recipeId: "masoor-dal", label: "y", adaptation: { servings: 4, applied: [] } });
  assert.notEqual(a.id, b.id);
  assert.deepEqual(a.checks, {});
  assert.equal(a.snapshot.ingredients.find((l) => l.slot === "paneer").entries[0].qty, 100);
});

test("F02 F04 F05: quantities are validated at the parser boundary and after repair", () => {
  const can = parseLine("2 (400 g) cans chickpeas, drained");
  assert.equal(can.qty, null);
  assert.deepEqual([can.pack.count, can.pack.size, can.pack.netTotal, can.pack.basis], [2, 400, 800, "package"]);
  assert.ok(can.issues.includes("drained-unknown"));
  assert.equal(can.raw, "2 (400 g) cans chickpeas, drained");
  // Nothing is computed from it, and no universal drain factor is applied
  const draft = { servings: 4, steps: [], lines: [can] };
  assert.equal(draftAsDerived(draft).ingredients[0].entries[0].qty, null);
  // The person gives the drained amount
  const fixed = resolveLine(can, { qty: 480, unit: "g", drainedConfirmed: true });
  assert.equal(fixed.qty, 480);
  assert.equal(fixed.pack.basis, "drained");
  assert.deepEqual(fixed.issues.filter((i) => i === "drained-unknown"), []);
  // A plain can keeps its net weight
  assert.equal(parseLine("1 (400 g) can chopped tomatoes").qty, 400);
  assert.equal(parseLine("1 (400 g) can chopped tomatoes").pack.basis, "net");
  assert.equal(parseLine("1 (400 g) can chopped tomatoes").match.item, "canned-tomatoes");

  const inf = parseLine("1/0 cup rice");
  assert.equal(inf.qty, null);
  assert.ok(inf.issues.includes("invalid-quantity"));
  assert.ok(!Number.isNaN(inf.qty));
  const zero = parseLine("0 g paneer");
  assert.equal(zero.qty, null);
  assert.ok(zero.issues.includes("invalid-quantity"));
  const neg = parseLine("-2 g paneer");
  assert.equal(neg.qty, null);
  assert.ok(neg.issues.includes("signed-quantity"));
  assert.equal(neg.raw, "-2 g paneer");
  assert.equal(neg.match.item, "paneer");
  // A bullet is not a sign
  for (const b of ["- 2 g paneer", "• 2 g paneer", "* 2 g paneer"]) assert.equal(parseLine(b).qty, 2, b);
  assert.ok(!parseLine(`${"9".repeat(12)} g paneer`).qty);
  // Validation blocks what it affects, and repair is validated again
  assert.ok(validateDraft({ servings: 4, steps: [], lines: [neg] }, "nutrition").blocking.some((x) => x.kind === "signed-quantity"));
  assert.equal(resolveLine(neg, { qty: -5 }).qty, null);
  assert.equal(resolveLine(neg, { qty: Infinity }).qty, null);
  const ok = resolveLine(neg, { qty: 2, unit: "g" });
  assert.equal(ok.qty, 2);
  assert.ok(!ok.issues.includes("signed-quantity"));
});

test("F06 F07: yields stay unresolved rather than truncated; target portions never change the source yield", () => {
  assert.equal(parseServings("4–6 servings"), null);
  assert.deepEqual(parseYield("4–6 servings").range, [4, 6]);
  assert.equal(parseServings("1.5 servings"), null);
  assert.equal(parseYield("1.5 servings").issue, "fraction");
  assert.equal(parseServings("Serves 999999999"), null);
  assert.equal(parseYield("Serves 999999999").issue, "too-large");
  assert.equal(parseServings("Serves 4"), 4);
  assert.equal(parseServings(["4", "4 servings"]), 4);
  assert.equal(parseServings("Makes 12 parathas"), null);
  const p = parsePastedText("Dal\nServes 4-6\nIngredients\n100 g paneer\nMethod\nCook.");
  assert.equal(p.recipes[0].servings, null);
  assert.equal(p.recipes[0].yield.issue, "range");
  const draft = buildDraft(parsePastedText("Dal\nServes 4\nIngredients\n100 g paneer\nMethod\nCook.").recipes[0], { method: "paste" });
  assert.equal(draft.servings, 4);
  assert.equal(draftAsDerived(draft).ingredients[0].entries[0].qty, 100);
  const scaled = { ...draft, targetServings: 2 };
  assert.equal(draftAsDerived(scaled).ingredients[0].entries[0].qty, 50);
  assert.equal(draftAsDerived(scaled).servings, 2);
  assert.equal(scaled.servings, 4, "the source yield stays the denominator");
  assert.equal(scaled.lines[0].qty, 100);
});

test("F03 F08 F10 B12: compounds, states and catalogue gaps each have an honest action", () => {
  // Ginger garlic paste stays compound; choosing a component isn't offered as resolving it
  const paste = parseLine("1 tbsp ginger garlic paste");
  assert.equal(paste.match.confidence, "compound");
  assert.ok(paste.issues.includes("compound"));
  const drafted = (line) => ({ servings: 4, steps: ["x"], lines: [line] });
  assert.ok(validateDraft(drafted(paste), "nutrition").blocking.some((b) => b.kind === "compound"));
  // Keeping it as unknown is honest: nothing blocks, and the estimate says it can't count it
  const kept = resolveLine(paste, { calc: "unknown" });
  assert.equal(validateDraft(drafted(kept), "nutrition").ok, true);
  assert.equal(draftAsDerived(drafted(kept)).ingredients[0].entries[0].qty, null);
  // Splitting requires amounts the person states
  const split = resolveLine(paste, { split: [{ item: "ginger", qty: 0.5, unit: "tbsp" }, { item: "garlic", qty: 0.5, unit: "tbsp" }] });
  assert.ok(!split.issues.includes("compound"));
  assert.equal(draftAsDerived(drafted(split)).ingredients[0].entries.length, 2);

  // Rice, both directions: confirming a state never applies dry values to a cooked amount
  const cooked = parseLine("200 g cooked basmati rice");
  assert.ok(cooked.issues.includes("state-mismatch"));
  assert.equal(isCalculable(cooked), false);
  assert.equal(estimate(draftAsDerived(drafted(cooked))).protein.incomplete, true);
  const dry = parseLine("200 g basmati rice");
  assert.ok(dry.issues.includes("state"));
  const answeredCooked = resolveLine(dry, { state: "cooked" });
  assert.ok(answeredCooked.issues.includes("state-mismatch"));
  assert.equal(estimate(draftAsDerived(drafted(answeredCooked))).protein.incomplete, true);
  const answeredDry = resolveLine(dry, { state: "dry" });
  assert.deepEqual(answeredDry.issues, []);
  assert.equal(estimate(draftAsDerived(drafted(answeredDry))).protein.incomplete, false);
  // Legumes: dried chickpeas against the canned record is a mismatch, with a real alternative
  const legume = resolveLine(parseLine("200 g chickpeas"), { state: "dry" });
  assert.ok(legume.issues.includes("state-mismatch"));
  // Unknown ingredients can stay unknown
  const mystery = parseLine("1 cup kokum extract");
  assert.ok(mystery.issues.includes("unmatched"));
  assert.ok(validateDraft(drafted(mystery), "nutrition").blocking.some((b) => b.kind === "unmatched"));
  assert.equal(validateDraft(drafted(resolveLine(mystery, { calc: "unknown" })), "nutrition").ok, true);
  // Every issue that blocks anything has a repair, by construction of the review UI: covered in the browser run
  // Count weights only apply to counted units; a volume without a validated density is unknown
  assert.equal(estimate({ servings: 1, ingredients: [{ entries: [{ item: "basmati", qty: 1, unit: "cup" }] }] }).protein.incomplete, true);
  assert.equal(estimate({ servings: 1, ingredients: [{ entries: [{ item: "yogurt", qty: 1, unit: "cup" }] }] }).protein.incomplete, false);
  assert.equal(estimate({ servings: 1, ingredients: [{ entries: [{ item: "onion", qty: 100, unit: "ml" }] }] }).protein.incomplete, true);
});

test("F11 F09: excluding from calculations keeps the ingredient; every row can be repaired and reset", () => {
  const line1 = parseLine("Fresh cream, to finish");
  const excluded = resolveLine(line1, { excluded: true });
  const draft = { servings: 4, steps: ["Finish with cream."], lines: [excluded, parseLine("100 g paneer", { index: 1 })] };
  assert.equal(draftAsDerived(draft).ingredients.length, 1);
  assert.equal(draft.lines.filter((l) => !l.removed).length, 2, "it's still in the recipe");
  assert.equal(validateDraft(draft, "nutrition").blocking.length, 0);
  const removed = resolveLine(line1, { removed: true });
  assert.equal(removed.removed, true);
  // Reset restores the imported reading from the original wording
  const edited = resolveLine(parseLine("100 g paneer", { index: 3 }), { qty: 250, unit: "g", item: "tofu", optional: true, state: "raw" });
  assert.equal(edited.match.item, "tofu");
  const reset = resetLine(edited);
  assert.deepEqual([reset.id, reset.qty, reset.match.item, reset.optional], [edited.id, 100, "paneer", false]);
  assert.equal(reset.raw, "100 g paneer");
});

test("F12 F14: extraction handles headings, parts, limits and literal HTML as text", () => {
  // Markdown headings and repeated sections
  const md = parsePastedText("## Jeera rice\nServes 2\n**Ingredients**\n1 cup basmati rice, uncooked\nFor the tadka:\n1 tbsp ghee\n### Method\nRinse.\nCook.\n\nRaita\nIngredients\n1 cup dahi\nMethod\nWhisk.");
  assert.deepEqual(md.recipes.map((r) => r.title), ["Jeera rice", "Raita"]);
  assert.deepEqual(md.recipes[0].steps, ["Rinse.", "Cook."]);
  assert.equal(md.recipes[0].ingredients[1].section, "For the tadka");
  assert.equal(md.recipes[0].ingredients.length, 2);
  // Parts of one recipe can be combined
  const one = combineExtracted(md.recipes);
  assert.equal(one.ingredients.length, 3);
  assert.equal(one.steps.length, 3);
  // Raw text is kept for the draft
  assert.ok(md.raw.includes("## Jeera rice"));
  const d = buildDraft(md.recipes[0], { method: "paste", raw: md.raw });
  assert.equal(d.rawText, md.raw);
  // No instructions, no headings, blank
  assert.deepEqual(parsePastedText("Dal\nIngredients\n100 g paneer").recipes[0].steps, []);
  assert.equal(parsePastedText("").problem, "empty");
  assert.equal(parsePastedText("words only").raw, "words only", "text survives a failed parse");
  // Mixed language keeps the wording, unmatched
  const hindi = parsePastedText("दाल\nIngredients\n२ कप पानी\n1 tsp हल्दी (haldi)\nMethod\nपकाएं");
  assert.equal(hindi.recipes[0].title, "दाल");
  const hl = buildDraft(hindi.recipes[0], { method: "paste" });
  assert.equal(hl.lines[0].raw, "२ कप पानी");
  // Limits
  const huge = parsePastedText(`T\nIngredients\n${"1 cup rice\n".repeat(5000)}`);
  assert.ok(huge.truncated);
  assert.ok(huge.recipes[0].ingredients.length <= 150);
  assert.ok(parseLine(`200 g ${"x".repeat(2000)}`).raw.length <= 500);
  // Literal HTML stays text at this layer; the view escapes it
  const html = parseLine('<img src=x onerror=alert(1)> 2 g paneer');
  assert.ok(html.raw.startsWith("<img"));
  // Duplicates are noticed
  const ex = parsePastedText("Dal\nIngredients\n100 g paneer\nMethod\nCook.").recipes[0];
  const first = buildDraft(ex, { method: "paste" });
  assert.equal(findDuplicateDraft({ [first.id]: first }, ex).id, first.id);
  assert.equal(findDuplicateDraft({ [first.id]: first }, { ...ex, title: "Other" }), null);
  // Demo rajma now matches kidney beans, with a package question rather than a guess
  const rajma = buildDraft(extractJsonLd(DEMO_LINKS["https://example.com/demo/weeknight-rajma"].html)[0], { method: "structured" });
  const beans = rajma.lines.find((l) => /kidney/.test(l.raw));
  assert.equal(beans.match.item, "kidney-beans");
  assert.ok(beans.issues.includes("drained-unknown"));
  assert.equal(ITEMS["kidney-beans"].nutrition.protein > 0, true);
});

// ---------- persistence

function memoryStorage(initial = {}) {
  const mem = new Map(Object.entries(initial));
  const api = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), mem };
  globalThis.localStorage = api;
  return api;
}

test("G01: a failed write is reported, not treated as saved", async () => {
  const { save, load, initialState } = await import("../js/store.js");
  const store = memoryStorage();
  load();
  assert.deepEqual(save(initialState()), { ok: true });
  store.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.deepEqual(save(initialState()), { ok: false, reason: "storage" });
  // Blocked storage: reading throws
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const s = load();
  assert.equal(s.version, 3);
  assert.equal(save(s).ok, false);
});

test("G02: corrupt and future-version data is quarantined and never overwritten", async () => {
  const { save, load, protectedState, acceptFresh, initialState } = await import("../js/store.js");
  const store = memoryStorage({ "mise-match:v1": "{not json" });
  const s = load();
  assert.equal(protectedState().kind, "corrupt");
  assert.deepEqual(s.plan, []);
  assert.equal(store.getItem("mise-match:quarantine:corrupt"), "{not json");
  assert.deepEqual(save(s), { ok: false, reason: "protected" });
  assert.equal(store.getItem("mise-match:v1"), "{not json", "the original stays in place");
  // Only an explicit choice lifts protection, and the copy remains
  const fresh = acceptFresh();
  assert.deepEqual(fresh, initialState());
  assert.equal(store.getItem("mise-match:quarantine:corrupt"), "{not json");
  assert.equal(save(fresh).ok, true);

  const future = JSON.stringify({ version: 99, plan: [{ precious: true }] });
  const store2 = memoryStorage({ "mise-match:v1": future });
  load();
  assert.equal(protectedState().kind, "future");
  assert.equal(protectedState().version, 99);
  assert.equal(save(initialState()).ok, false);
  assert.equal(store2.getItem("mise-match:v1"), future);
  // Non-object JSON and a missing version are unreadable too
  for (const raw of ["[1,2]", "null", "42", '{"plan":[]}']) {
    memoryStorage({ "mise-match:v1": raw });
    load();
    assert.equal(protectedState()?.kind, "corrupt", raw);
  }
  memoryStorage();
  load();
  assert.equal(protectedState(), null);
});

test("G03: bad records are skipped one by one with an explanation; good ones survive", async () => {
  const { load, loadReport, initialState } = await import("../js/store.js");
  const good = initialState();
  const data = {
    ...good,
    sessions: {
      "chana-masala": { recipeId: "chana-masala", servings: 2, applied: [], history: [] },
      gone: { recipeId: "no-such-dish", servings: 2, applied: [] },
      nullish: null,
      badServings: { recipeId: "chana-masala", servings: "many", applied: [] },
    },
    versions: { v1: { id: "v1", recipeId: "masoor-dal", servings: 4, applied: [], name: "Mine", rev: 1 }, v2: { id: "v2", recipeId: "masoor-dal", servings: 4, applied: "nope" } },
    pantry: { onion: { qty: 2, unit: "" }, "not-an-item": {}, paneer: { qty: "lots" }, "free:pickle": { free: true, name: "pickle" }, garlic: null },
    plan: [{ id: "p1", recipeId: "masoor-dal", servings: 4, applied: [] }, { id: "p2", recipeId: "gone", servings: 4, applied: [] }, 7],
    drafts: { d1: { title: "x" } },
    cooks: "not an array",
    list: { lines: [{ id: "l1", name: "Mango", manual: true }, { id: "l2", name: "x", sources: { a: { qty: "many" } } }, null] },
    profile: { diet: "vegan", avoid: "everything", targets: { protein: "high" }, timeLimit: "soon" },
  };
  memoryStorage({ "mise-match:v1": JSON.stringify(data) });
  const s = load();
  assert.deepEqual(Object.keys(s.sessions), ["chana-masala"]);
  assert.deepEqual(Object.keys(s.versions), ["v1"]);
  assert.deepEqual(Object.keys(s.pantry).sort(), ["free:pickle", "onion"]);
  assert.deepEqual(s.plan.map((p) => p.id), ["p1"]);
  assert.deepEqual(s.drafts, {});
  assert.deepEqual(s.cooks, []);
  assert.deepEqual(s.list.lines.map((l) => l.id), ["l1"]);
  assert.equal(s.profile.diet, "vegan");
  assert.deepEqual(s.profile.avoid, []);
  assert.equal(s.profile.timeLimit, null);
  const skipped = loadReport().skipped;
  assert.ok(skipped.length >= 10);
  assert.ok(skipped.every((x) => x.kind && x.reason));
  assert.ok(s.skipped.some((x) => x.raw?.recipeId === "no-such-dish"), "the bad record is kept for export");
  // Missing arrays and null sections load as empty
  memoryStorage({ "mise-match:v1": JSON.stringify({ version: 3 }) });
  assert.deepEqual(load().plan, []);
});

test("E01 G07: version 2 migrates explicitly and history isn't rewritten", async () => {
  const { load, loadReport, save } = await import("../js/store.js");
  const v2 = {
    version: 2,
    profile: {},
    saved: [],
    sessions: {},
    versions: { v1: { id: "v1", recipeId: "chana-masala", name: "Mine", servings: 2, applied: ["cm-paneer", "cm-retired-rule"], rev: 3, parent: null } },
    drafts: {},
    pantry: { onion: {} },
    plan: [{ id: "p1", recipeId: "chana-masala", versionId: "v1", rev: 3, label: "Mine", applied: ["cm-paneer"], servings: 2 }],
    list: { lines: [], dismissed: { p1: { "basmati|mass": true } }, synced: {}, nextId: 1 },
    confirmations: { "p1|onion": "enough" },
    cooks: [{ id: "c1", recipeId: "chana-masala", versionId: "v1", rev: 2, servings: 2, applied: ["cm-paneer"], cookedAt: 5, feedback: { again: "yes" } }],
    lastSession: null,
  };
  const store = memoryStorage({ "mise-match:v1": JSON.stringify(v2) });
  const s = load();
  assert.equal(s.version, 3);
  assert.equal(loadReport().migratedFrom, 2);
  // The original is kept beside it
  assert.equal(JSON.parse(store.getItem("mise-match:backup:v2")).version, 2);
  // Rules and revisions on the record are unchanged, including one that no longer exists
  assert.deepEqual(s.versions.v1.applied, ["cm-paneer", "cm-retired-rule"]);
  assert.equal(s.versions.v1.rev, 3);
  assert.equal(s.cooks[0].rev, 2);
  // Snapshots say they were written at migration, not at the time
  assert.equal(s.cooks[0].snapshot.basis, "migrated");
  assert.equal(s.versions.v1.snapshot.basis, "migrated");
  assert.deepEqual(V.recordStatus(s.versions.v1).missingRules, ["cm-retired-rule"]);
  // Old answers aren't bound to any requirement, so they're asked again
  assert.deepEqual(s.confirmations, {});
  // And the migration is durable and stable
  assert.equal(save(s).ok, true);
  assert.deepEqual(load(), s);
});

test("G04: a write from another tab is detected before overwriting", async () => {
  const { load, save, hasExternalChange, peekStored, initialState } = await import("../js/store.js");
  const store = memoryStorage();
  const s = load();
  assert.equal(save({ ...s, saved: ["chana-masala"] }).ok, true);
  assert.equal(hasExternalChange(), false);
  // Another tab writes
  store.setItem("mise-match:v1:rev", String(Number(store.getItem("mise-match:v1:rev")) + 1));
  store.setItem("mise-match:v1", JSON.stringify({ ...initialState(), saved: ["pav-bhaji"] }));
  assert.equal(hasExternalChange(), true);
  assert.deepEqual(save({ ...s, saved: ["masoor-dal"] }), { ok: false, reason: "conflict" });
  assert.deepEqual(peekStored().saved, ["pav-bhaji"], "the other tab's work wasn't overwritten");
  // Keeping this tab's version is an explicit force; loading adopts the other tab's
  assert.equal(save({ ...s, saved: ["masoor-dal"] }, { force: true }).ok, true);
  assert.equal(hasExternalChange(), false);
  assert.deepEqual(load().saved, ["masoor-dal"]);
});

test("D10: line transitions through regeneration, with two meals sharing an ingredient", () => {
  const d = (r, n) => deriveRecipe(r, { servings: n, applied: [] });
  const meals = (a, b) => [{ id: "a", title: "A", needs: needsFor(d(masalaRecipe, a), {}) }, { id: "b", title: "B", needs: needsFor(d(dal, b), {}) }];
  const rice = (l) => l.lines.find((x) => x.item === "basmati" && !x.transfer);
  const base = () => reconcile(addManual(emptyList(), "White basmati rice", "1 bag"), meals(4, 4)).list;
  // A manual line with the same name stays separate from the generated line
  let l = base();
  assert.equal(l.lines.filter((x) => x.manual).length, 1);
  assert.equal(computedQty(rice(l)).qty, 600);
  // generated + edited → conflict once; edited value kept
  l = setOverride(l, rice(l).id, "1000");
  l = reconcile(l, meals(2, 4)).list;
  assert.equal(rice(l).conflict.type, "changed");
  assert.equal(rice(l).override.qty, 1000);
  // edited + checked, resolved to recipe: the override goes and the check is reset by that explicit choice only
  l = toggleChecked(l, rice(l).id);
  assert.equal(rice(l).checked, true);
  l = reconcile(l, meals(4, 4)).list;
  assert.equal(rice(l).checked, true);
  l = resolveConflict(l, rice(l).id, "recipe");
  assert.equal(rice(l).override, null);
  // keeping the edit keeps it
  l = setOverride(l, rice(l).id, "700");
  l = reconcile(l, meals(2, 2)).list;
  l = resolveConflict(l, rice(l).id, "mine");
  assert.equal(rice(l).override.qty, 700);
  assert.equal(rice(l).conflict, null);
  // orphan: edited line whose meals both go stays for review, and "remove" drops it
  l = reconcile(l, [], { removed: ["a", "b"] }).list;
  assert.equal(rice(l).conflict.type, "orphan");
  l = resolveConflict(l, rice(l).id, "remove");
  assert.equal(rice(l), undefined);
  assert.equal(l.lines.filter((x) => x.manual).length, 1, "the manual line survives everything");
  // checked orphan
  let c = base();
  c = toggleChecked(c, rice(c).id);
  c = reconcile(c, [], { removed: ["a", "b"] }).list;
  assert.equal(rice(c).conflict.type, "orphan");
  assert.equal(rice(c).checked, true);
  // a dismissed line stays dismissed for its meal, and comes back from the other meal's need only by choice
  let x = base();
  x = deleteLine(x, rice(x).id);
  x = reconcile(x, meals(4, 4)).list;
  assert.equal(rice(x), undefined);
  // a finished transfer is left alone by every later regeneration
  let t = base();
  t = recordTransfer(t, rice(t).id, { qty: 600, unit: "g" }).list;
  const frozen = t.lines.find((y) => y.transfer);
  t = reconcile(t, meals(2, 2)).list;
  assert.deepEqual(t.lines.find((y) => y.id === frozen.id).sources, frozen.sources);
});
