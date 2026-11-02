import { test } from "node:test";
import assert from "node:assert/strict";

import { getRecipe, RECIPES } from "../js/data/recipes.js";
import { SWAPS, getSwap } from "../js/data/swaps.js";
import { ITEMS } from "../js/data/items.js";
import { convert, formatQty } from "../js/core/units.js";
import { deriveRecipe, defaultAdaptation, applySwap, removeSwap, setServings, checkSwap } from "../js/core/adapt.js";
import { estimate, direction, formatRange } from "../js/core/nutrition.js";
import {
  needsFor, allocateNeeds, syncRecipe, emptyList, setOverride, deleteLine, addManual, resolveConflict,
  isListCurrent, displayQty, clearChecked, toggleChecked, undismiss,
} from "../js/core/shopping.js";
import { suggest } from "../js/core/suggest.js";
import * as pantryCore from "../js/core/pantry.js";
import { BUNDLES } from "../js/data/bundles.js";
import { comboStatus, evaluate, candidates, resolve } from "../js/core/engine.js";
import { defaultConstraints, openQuestions, checkItems } from "../js/core/constraints.js";
import { parseLine, matchItem, validateDraft, resolveLine, draftAsDerived } from "../js/core/normalize.js";
import { extractJsonLd, parsePastedText, extractFromLink, buildDraft, DEMO_LINKS } from "../js/core/importer.js";
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
  const confirmed = allocateNeeds([{ id: chana.id, derived: deriveRecipe(chana, swapped) }], { onion: {} }, { [`${chana.id}|onion`]: "enough" }).get(chana.id);
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
  assert.equal(pantryCore.availability(pantry, "basmati").status, "need");
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
  assert.equal(pantryCore.availability(pantry, "free:mango pickle").status, "need");
  // Add to pantry from a bought list item adds to a comparable amount
  pantry = pantryCore.addBought({ basmati: { qty: 100, unit: "g" } }, "basmati", 0.5, "kg");
  assert.deepEqual(pantry.basmati, { qty: 600, unit: "g" });
  assert.deepEqual(pantryCore.addBought({}, "onion", 1, "").onion, { qty: 1, unit: "" });
  assert.deepEqual(pantryCore.addBought({ onion: {} }, "onion", 1, "").onion, {});
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
  assert.equal(s.version, 2);
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
  // adding paneer makes each serving larger, and that is reported, not hidden
  const more = evaluate(masalaRecipe, { servings: 4, applied: ["cm-paneer"] }, defaultConstraints());
  const base = evaluate(masalaRecipe, { servings: 4, applied: [] }, defaultConstraints());
  assert.ok(more.nutrition.servingGrams.value > base.nutrition.servingGrams.value * 1.1);
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
  assert.deepEqual([l.raw, l.qty, l.unit, l.match.item, l.state, l.prep], ["1 (400 g) can chickpeas, drained", 400, "g", "chickpeas", "cooked", "drained"]);
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
  m = allocateNeeds([a, b], pantry, { "p1|onion": "enough" });
  assert.equal(m.get("p1").find((n) => n.item === "onion"), undefined);
  m = allocateNeeds([a, b], pantry, { "p1|onion": "buy" });
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
