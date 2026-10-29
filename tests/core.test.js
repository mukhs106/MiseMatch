import { test } from "node:test";
import assert from "node:assert/strict";

import { getRecipe, RECIPES } from "../js/data/recipes.js";
import { SWAPS, getSwap } from "../js/data/swaps.js";
import { ITEMS } from "../js/data/items.js";
import { convert, formatQty } from "../js/core/units.js";
import { deriveRecipe, defaultAdaptation, applySwap, removeSwap, setServings, checkSwap } from "../js/core/adapt.js";
import { estimate, direction } from "../js/core/nutrition.js";
import {
  needsFor, syncRecipe, emptyList, setOverride, deleteLine, addManual, resolveConflict,
  isListCurrent, displayQty, clearChecked, toggleChecked, undismiss,
} from "../js/core/shopping.js";
import { suggest } from "../js/core/suggest.js";

const chana = getRecipe("chana-palak");
const dal = getRecipe("masoor-dal");
const eggs = getRecipe("tomato-egg");
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
    for (const k of ["flavor", "texture", "quantity", "prep", "nutrition"]) assert.ok(s.effects[k], `${s.id}: missing ${k}`);
  }
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

  const t = applySwap(defaultAdaptation(eggs), "te-tofu");
  const extra = checkSwap(eggs, t, "te-extra-egg");
  assert.equal(extra.ok, false);
  assert.match(extra.blockers[0].reason, /still uses eggs/);
  assert.equal(checkSwap(eggs, t, "te-edamame").ok, true);
  assert.ok(checkSwap(chana, defaultAdaptation(chana), "te-tofu").unsupported);
});

test("omitting an ingredient removes it and the step no longer mentions it", () => {
  const d = deriveRecipe(eggs, applySwap(defaultAdaptation(eggs), "te-no-scallions"));
  assert.equal(line(d, "scallions").omitted, true);
  assert.doesNotMatch(d.steps.map((s) => s.text).join(" "), /scallion|left out/);
});

test("nutrition: ranges move with nutrition swaps; missing data is reported, not zero", () => {
  const base = estimate(deriveRecipe(dal, defaultAdaptation(dal)));
  const more = estimate(deriveRecipe(dal, applySwap(defaultAdaptation(dal), "md-more-dal")));
  assert.equal(direction(base.protein, more.protein), "more");
  assert.equal(direction(base.fiber, more.fiber), "more");
  assert.ok(base.protein.low < base.protein.mid && base.protein.mid < base.protein.high);
  const moong = estimate(deriveRecipe(dal, applySwap(defaultAdaptation(dal), "md-moong")));
  assert.deepEqual(moong.fiber.missing ?? moong.missing.fiber, ["Split yellow moong dal"]);
  // per-serving values don't change with portions
  const half = estimate(deriveRecipe(dal, setServings(defaultAdaptation(dal), 2)));
  assert.equal(Math.round(half.protein.mid), Math.round(base.protein.mid));
});

test("shopping needs subtract partial amounts and flag incompatible units", () => {
  const d = deriveRecipe(chana, defaultAdaptation(chana));
  const pantry = {
    "spinach-fresh": { status: "some", qty: 120, unit: "g" },
    chickpeas: { status: "have" },
    garlic: { status: "some", qty: 1, unit: "head" },
  };
  const needs = needsFor(d, pantry);
  const spinach = needs.find((n) => n.item === "spinach-fresh");
  assert.equal(spinach.qty, 80);
  assert.ok(!needs.some((n) => n.item === "chickpeas"));
  assert.equal(needs.find((n) => n.item === "garlic").uncertain, true);
  // more than enough means nothing to buy
  assert.ok(!needsFor(d, { "spinach-fresh": { status: "some", qty: 0.5, unit: "kg" } }).some((n) => n.item === "spinach-fresh"));
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
  ({ list, report } = syncRecipe(list, chana, needsFor(deriveRecipe(chana, swapped), { onion: { status: "have" } })));
  assert.ok(!list.lines.some((l) => l.item === "spinach-fresh"));
  assert.ok(list.lines.some((l) => l.item === "spinach-frozen"));
  assert.equal(list.lines.find((l) => l.item === "onion").conflict.type, "orphan");
  assert.ok(report.conflicts >= 1);

  list = clearChecked(list);
  assert.ok(!list.lines.some((l) => l.item === "onion"));
});

test("suggestions use on-hand items and supported swaps", () => {
  const pantry = {
    chickpeas: { status: "have" },
    "spinach-frozen": { status: "have" },
    "canned-tomatoes": { status: "have" },
    onion: { status: "have" },
    basmati: { status: "some", qty: 200, unit: "g" },
  };
  const results = suggest(RECIPES, pantry);
  const top = results[0];
  assert.equal(top.recipe.id, "chana-palak");
  assert.equal(top.ready, true);
  assert.equal(top.missing[0].fix.id, "cp-frozen-spinach");
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
  s.adaptations["chana-palak"] = applySwap(setServings(defaultAdaptation(chana), 2), "cp-frozen-spinach");
  s.pantry.onion = { status: "have" };
  s.list = addManual(s.list, "Mango");
  save(s);
  const reloaded = load();
  assert.deepEqual(reloaded, s);
  assert.deepEqual(clear(), initialState());
  assert.deepEqual(load(), initialState());
  assert.ok(getSwap("cp-frozen-spinach"));
});
