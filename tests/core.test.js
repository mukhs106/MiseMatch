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
import { matchesQuery } from "../js/core/search.js";
import { existsSync, readFileSync } from "node:fs";
import * as pantryCore from "../js/core/pantry.js";

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
    const fx = Object.entries(s.effects);
    assert.ok(fx.length > 0, `${s.id}: no effects`);
    for (const [k, v] of fx) {
      assert.ok(["flavor", "texture", "quantity", "prep", "nutrition"].includes(k), `${s.id}: unknown effect ${k}`);
      assert.doesNotMatch(v, /^(No change|No real change|No meaningful change|Nothing to replace)\.?$/, `${s.id}: generic ${k}`);
    }
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
  assert.ok(!needs.some((n) => n.item === "chickpeas"));
  assert.equal(needs.find((n) => n.item === "garlic").uncertain, true);
  // more than enough means nothing to buy
  assert.ok(!needsFor(d, { "spinach-fresh": { qty: 0.5, unit: "kg" } }).some((n) => n.item === "spinach-fresh"));
  // "Some" with no amount yet: buy the full amount, flagged
  assert.equal(needsFor(d, { onion: { some: true } }).find((n) => n.item === "onion").uncertain, true);
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
  ({ list, report } = syncRecipe(list, chana, needsFor(deriveRecipe(chana, swapped), { onion: {} })));
  assert.ok(!list.lines.some((l) => l.item === "spinach-fresh"));
  assert.ok(list.lines.some((l) => l.item === "spinach-frozen"));
  assert.equal(list.lines.find((l) => l.item === "onion").conflict.type, "orphan");
  assert.ok(report.conflicts >= 1);

  list = clearChecked(list);
  assert.ok(!list.lines.some((l) => l.item === "onion"));
});

test("suggestions use on-hand items and supported swaps", () => {
  const pantry = {
    chickpeas: {},
    "spinach-frozen": {},
    "canned-tomatoes": {},
    onion: {},
    basmati: { qty: 200, unit: "g" },
  };
  const results = suggest(RECIPES, pantry);
  // Chana masala (fresh tomatoes → canned) and chana palak (fresh spinach → frozen) are each one swap away.
  assert.deepEqual(results.slice(0, 2).map((r) => r.rank), [1, 1]);
  const palak = results.find((r) => r.recipe.id === "chana-palak");
  assert.equal(palak.ready, true);
  assert.equal(palak.missing[0].fix.id, "cp-frozen-spinach");
  // Can make now ranks above one swap away
  const now = suggest(RECIPES, { ...pantry, "spinach-fresh": {} });
  assert.equal(now[0].recipe.id, "chana-palak");
  assert.equal(now[0].rank, 0);
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
  s.pantry.onion = {};
  s.pantry.basmati = { qty: 100, unit: "g" };
  s.list = addManual(s.list, "Mango");
  save(s);
  const reloaded = load();
  assert.deepEqual(reloaded, s);
  assert.deepEqual(clear(), initialState());
  assert.deepEqual(load(), initialState());
  assert.ok(getSwap("cp-frozen-spinach"));
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

test("older saves migrate to the single pantry state", async () => {
  const old = {
    version: 1,
    pantry: { onion: { status: "have" }, garlic: { status: "need" }, basmati: { status: "some", qty: 100, unit: "g" } },
    adaptations: { "chana-masala": { servings: 2, applied: [], partial: { "canned-tomatoes": { qty: 150, unit: "g" } } } },
  };
  const mem = new Map([["mise-match:v1", JSON.stringify(old)]]);
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const { load } = await import("../js/store.js");
  const s = load();
  assert.deepEqual(s.pantry, { onion: {}, "canned-tomatoes": { qty: 150, unit: "g" } });
  assert.deepEqual(s.adaptations["chana-masala"], { servings: 2, applied: [] });
});

test("search matches names, ingredients and cuisine; every word must match", () => {
  const masala = getRecipe("chana-masala");
  assert.ok(matchesQuery(masala, "chana"));
  assert.ok(matchesQuery(masala, "  CHICKPEAS ")); // ingredient, any case
  assert.ok(matchesQuery(masala, "north indian"));
  assert.ok(matchesQuery(masala, ""));
  assert.ok(!matchesQuery(masala, "chana egg"));
  assert.ok(matchesQuery(eggs, "chinese"));
  assert.ok(matchesQuery(eggs, "fanqie")); // accents ignored
  assert.deepEqual(RECIPES.filter((r) => matchesQuery(r, "paneer")).map((r) => r.id), ["paneer-bhurji"]);
});

test("recipe photos: only reviewed, non-excluded photos of that dish, with every variant present", () => {
  const manifest = JSON.parse(readFileSync(new URL("../assets/images/manifest.json", import.meta.url), "utf8"));
  const byName = Object.fromEntries(manifest.images.filter((e) => e.cleanName).map((e) => [e.cleanName, e]));
  const withImage = RECIPES.filter((r) => r.image);
  assert.deepEqual(withImage.map((r) => r.id), ["chana-masala"]); // no photo fits the others; they get the tile
  for (const r of withImage) {
    const entry = byName[r.image.name];
    assert.ok(entry, `${r.id}: ${r.image.name} is not in the manifest`);
    assert.notEqual(entry.status, "excluded");
    assert.equal(entry.use, `recipe:${r.id}`, `${r.id}: the manifest must record the photo as showing this dish`);
    assert.ok(r.image.alt.length > 10 && !/image|photo|picture/i.test(r.image.alt), `${r.id}: alt should plainly describe the dish`);
    for (const f of ["card", "hero"]) assert.match(r.image.focal[f], /^\d+% \d+%$/);
    for (const w of [480, 960, 1440]) {
      for (const ext of ["webp", "jpg"]) {
        assert.ok(existsSync(new URL(`../assets/img/${r.image.name}-${w}.${ext}`, import.meta.url)), `${r.image.name}-${w}.${ext} missing`);
      }
    }
  }
  for (const e of manifest.images.filter((x) => x.status === "excluded")) {
    assert.ok(!withImage.some((r) => r.image.name === e.cleanName), `${e.file} is excluded`);
  }
});
