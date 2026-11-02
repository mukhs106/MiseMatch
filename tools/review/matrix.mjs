// Responsive, text size, long content, keyboard and large-collection checks across
// the T10 audit's widths. Measures rendered pages; it certifies nothing.
//
//   node matrix.mjs [--base http://localhost:8080] [--out ../../reviews/<dated-folder>/matrix]

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const base = args.base ?? "http://localhost:8080";
const out = resolve(args.out ?? join(here, "../../reviews/matrix"));
mkdirSync(out, { recursive: true });
const WIDTHS = [320, 360, 390, 430, 540, 719, 720, 959, 960, 1024, 1440];
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const results = [];
const check = (group, name, pass, detail = "") => {
  results.push({ group, name, pass: !!pass, detail });
  if (!pass) console.log(` FAIL [${group}] ${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
};

const LONG_TITLE = "Grandmother's very particular Sunday chana masala with slow-cooked tomatoes, extra ginger and a long explanatory note xx";
const LONG_LINE = `2 tablespoons ${"finely-chopped-and-then-lightly-toasted-".repeat(4)}ginger and a further note about where to buy it from the corner shop near the station`.slice(0, 200);
const LONG_URL = `https://www.example.org/${"really-long-unbroken-path-segment-".repeat(8)}`;

/** A realistic state with long content, built by the app's own modules inside the page. */
async function seed(page, { big = false } = {}) {
  await page.goto(`${base}/#/`);
  await page.waitForFunction(() => window.__miseBooted === true);
  await page.evaluate(async ({ LONG_TITLE, LONG_LINE, LONG_URL, big }) => {
    const V = await import("/js/core/versions.js");
    const S = await import("/js/core/shopping.js");
    const I = await import("/js/core/importer.js");
    const { initialState } = await import("/js/store.js");
    const { getRecipe, RECIPES } = await import("/js/data/recipes.js");
    const { ITEMS } = await import("/js/data/items.js");
    const st = initialState();
    const masala = getRecipe("chana-masala");
    const session = V.changeSession(V.startSession(masala), { servings: 2, applied: ["cm-canned-tomatoes", "cm-paneer"] });
    st.sessions["chana-masala"] = { ...session, step: "compare" };
    const v = V.saveSession({}, session, { name: LONG_TITLE });
    st.versions = v.versions;
    st.pantry = { onion: {}, basmati: { qty: 100, unit: "g" }, "free:a really long free text pantry item name that goes on and on and on": { free: true, name: "a really long free text pantry item name that goes on and on and on" } };
    const count = big ? 20 : 2;
    for (let i = 0; i < count; i++) {
      const r = RECIPES[i % RECIPES.length];
      st.plan.push(V.planEntry({ recipeId: r.id, snapshot: { servings: r.servings, applied: [] }, servings: r.servings }));
    }
    const needs = S.allocateNeeds(st.plan.map((p) => ({ id: p.id, title: getRecipe(p.recipeId).title, derived: V.derivedForRecord(p) })), st.pantry);
    st.list = S.reconcile(st.list, st.plan.map((p) => ({ id: p.id, title: getRecipe(p.recipeId).title, needs: needs.get(p.id) }))).list;
    st.list = S.addManual(st.list, LONG_LINE, "a very long amount description here");
    if (st.list.lines[0]) st.list.lines[0].checked = true;
    const draft = I.buildDraft({ title: LONG_TITLE, ingredients: [LONG_LINE, "1 tbsp ginger garlic paste", "2 (400 g) cans chickpeas, drained", "100 g paneer"], steps: [LONG_LINE], servings: 4, servingsText: "Serves 4", yield: { servings: 4, text: "Serves 4", issue: null }, url: LONG_URL }, { method: "paste", url: LONG_URL, raw: LONG_LINE });
    st.drafts[draft.id] = draft;
    st.cooks.push({ ...V.cookRecord({ recipeId: "chana-masala", snapshot: session }), feedback: { again: "yes", differed: LONG_LINE } });
    if (big) {
      const ids = Object.keys(ITEMS);
      for (let i = 0; i < 100; i++) {
        const res = V.saveSession(st.versions, V.changeSession(V.startSession(RECIPES[i % RECIPES.length]), { servings: 2 }), { name: `Version ${i}` });
        st.versions = res.versions;
        st.pantry[i < ids.length ? ids[i] : `free:thing ${i}`] = i < ids.length ? { qty: i + 1, unit: "g" } : { free: true, name: `thing ${i}` };
      }
      for (let i = 0; i < 180; i++) st.list = S.addManual(st.list, `Extra line ${i}`, "1");
    }
    localStorage.setItem("mise-match:v1", JSON.stringify(st));
    localStorage.setItem("mise-match:v1:rev", String((Number(localStorage.getItem("mise-match:v1:rev")) || 0) + 1));
  }, { LONG_TITLE, LONG_LINE, LONG_URL, big });
  await page.reload();
  await page.waitForFunction(() => window.__miseBooted === true);
  return page.evaluate(() => Object.keys(window.__mise.state.drafts)[0]);
}

const measure = (page) => page.evaluate(() => {
  const doc = document.documentElement;
  const small = [];
  const clipped = [];
  for (const el of document.querySelectorAll("#app a, #app button, #app input, #app select, #app textarea, #app summary, #nav a, .avatar, .wordmark")) {
    if (el.closest(".visually-hidden") || !el.offsetParent) continue;
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
    if (!inline && el.type !== "checkbox" && el.type !== "radio" && r.height < 40) small.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}[${el.dataset.action ?? ""}] ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (r.right > doc.clientWidth + 1 || r.left < -1) clipped.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} right ${Math.round(r.right)}`);
  }
  const overflowers = [...document.querySelectorAll("#app *")].filter((el) => el.offsetParent && el.getBoundingClientRect().right > doc.clientWidth + 1 && getComputedStyle(el).position !== "fixed").slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`);
  return { overflow: doc.scrollWidth - doc.clientWidth, small: [...new Set(small)], clipped: [...new Set(clipped)].slice(0, 6), overflowers };
});

const routes = (did) => ["#/", "#/recipes", "#/recipe/chana-masala", "#/recipe/masoor-dal", "#/adapt/chana-masala/needs", "#/adapt/chana-masala/options", "#/adapt/chana-masala/compare", "#/adapt/chana-masala/shop", "#/cook/chana-masala", "#/pantry", "#/list", "#/plan", "#/saved", "#/import", `#/draft/${did}`, "#/profile", "#/no-such-page"];

async function sweep(group, ctxOpts, prepare, { shots = false, targets = true } = {}) {
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const did = await seed(page);
  if (prepare) await prepare(page);
  const smallAll = new Set();
  for (const r of routes(did)) {
    await page.evaluate((x) => { location.hash = x; }, r);
    await page.waitForTimeout(50);
    if (prepare) await prepare(page);
    await page.waitForTimeout(30);
    const m = await measure(page);
    check(group, `${r}: no horizontal page overflow`, m.overflow <= 1, { overflow: m.overflow, overflowers: m.overflowers });
    check(group, `${r}: no control pushed off screen`, !m.clipped.length, m.clipped);
    check(group, `${r}: has one h1`, (await page.locator("#app h1").count()) === 1);
    if (targets) for (const x of m.small) smallAll.add(`${r} ${x}`);
    if (shots) await page.screenshot({ path: join(out, `${group}-${r.replace(/[^a-z0-9]+/gi, "_").slice(0, 30)}.png`), fullPage: true });
  }
  if (targets) check(group, "touch targets at least 40 px tall in main content (44 is the token)", !smallAll.size, [...smallAll].slice(0, 12));
  check(group, "no script errors", !errors.length, errors);
  await context.close();
}

for (const w of WIDTHS) await sweep(`w${w}`, { viewport: { width: w, height: 800 }, hasTouch: w < 720 }, null, { shots: [320, 430, 720, 960, 1440].includes(w) });
const large = async (page) => page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
await sweep("text-200pct-430", { viewport: { width: 430, height: 800 } }, large, { shots: true, targets: false });
await sweep("text-200pct-1024", { viewport: { width: 1024, height: 800 } }, large, { targets: false });
// 400% zoom of a 1280 px window is a 320 px wide, 200 px tall layout viewport.
await sweep("zoom-400pct", { viewport: { width: 320, height: 200 } }, null, { shots: true, targets: false });
const spacing = async (page) => page.evaluate(() => {
  if (document.getElementById("spacing-test")) return;
  const s = document.createElement("style");
  s.id = "spacing-test";
  s.textContent = "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";
  document.head.append(s);
});
await sweep("text-spacing-360", { viewport: { width: 360, height: 800 } }, spacing, { targets: false });
await sweep("landscape-short", { viewport: { width: 740, height: 340 } }, null, { shots: true, targets: false });

// Reduced motion
{
  const context = await browser.newContext({ viewport: { width: 430, height: 800 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await seed(page);
  const t = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--t-med").trim());
  check("reduced-motion", "motion tokens drop to zero", t === "0ms", t);
  await context.close();
}

// Forced colors
{
  const context = await browser.newContext({ viewport: { width: 430, height: 800 }, forcedColors: "active" });
  const page = await context.newPage();
  await seed(page);
  for (const [r, name] of [["#/adapt/chana-masala/needs", "needs"], ["#/adapt/chana-masala/options", "options"], ["#/list", "list"]]) {
    await page.evaluate((x) => { location.hash = x; }, r);
    await page.waitForTimeout(60);
    await page.screenshot({ path: join(out, `forced-colors-${name}.png`), fullPage: true });
  }
  await page.evaluate(() => { location.hash = "#/adapt/chana-masala/needs"; });
  await page.waitForTimeout(60);
  const v = await page.evaluate(() => {
    const pressed = document.querySelector('.chip[aria-pressed="true"]');
    return { pressedBorder: pressed ? getComputedStyle(pressed).borderTopWidth : null, btns: [...document.querySelectorAll(".btn, .chip")].filter((b) => b.offsetParent && b.textContent.trim()).every((b) => getComputedStyle(b).color !== getComputedStyle(b).backgroundColor) };
  });
  check("forced-colors", "selected chips show a heavier border; button text stays distinct from its background", v.pressedBorder === "3px" && v.btns, v);
  await context.close();
}

// Keyboard and dialogs
{
  const context = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const page = await context.newPage();
  await seed(page);
  await page.evaluate(() => { location.hash = "#/adapt/chana-masala/options"; });
  await page.waitForTimeout(80);
  // Tab from the top: every stop has a visible outline
  await page.keyboard.press("Tab");
  let bad = [];
  for (let i = 0; i < 40; i++) {
    const f = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { tag: a.tagName, name: a.getAttribute("aria-label") ?? a.textContent.trim().slice(0, 30), o: cs.outlineStyle, w: parseFloat(cs.outlineWidth) }; });
    if (f.tag !== "BODY" && (f.o === "none" || f.w < 1)) bad.push(f);
    await page.keyboard.press("Tab");
  }
  check("keyboard", "every tab stop in the first 40 has a visible focus ring", !bad.length, bad.slice(0, 6));
  // Choose buttons have contextual names
  const names = await page.$$eval('[data-action="choose-option"]', (els) => els.map((e) => e.getAttribute("aria-label")));
  check("keyboard", "Choose buttons have contextual, distinct names", names.length > 0 && new Set(names).size === names.length && names.every((n) => n.startsWith("Choose") && /Chana masala/.test(n)), names.slice(0, 3));
  // Modal: containment, Escape, return focus, inert background, close control
  await page.focus('[data-action="open-swaps"][data-slot="tomatoes"]');
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const modal = await page.evaluate(() => {
    const d = document.getElementById("sheet");
    const backdrop = getComputedStyle(d, "::backdrop").backgroundColor;
    const r = d.getBoundingClientRect();
    return { open: d.open, modal: d.matches(":modal"), border: getComputedStyle(d).borderTopWidth, close: !!d.querySelector('[data-action="close-dialog"]'), backdrop, focused: document.activeElement.id, topEl: document.elementFromPoint(5, 5)?.tagName };
  });
  check("dialog", "showModal: top layer, focus inside, a visible close control, 2 px border", modal.modal && modal.focused === "sheet-title" && modal.close && modal.border === "2px", modal);
  check("dialog", "no dimmed backdrop, per Part 9", modal.backdrop === "rgba(0, 0, 0, 0)", modal.backdrop);
  let inside = true;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const ok = await page.evaluate(() => document.getElementById("sheet").contains(document.activeElement) || document.activeElement === document.body);
    inside = inside && ok;
  }
  check("dialog", "Tab stays inside the modal", inside);
  const clickThrough = await page.evaluate(() => { const b = document.querySelector('#app [data-action="go-step"]'); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.x + 2, r.y + 2); return !b.contains(top); });
  check("dialog", "the page behind can't be clicked", clickThrough);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
  check("dialog", "Escape closes and restores focus to the trigger by identity", await page.evaluate(() => document.activeElement.dataset.slot === "tomatoes"));
  // The trigger node is replaced by a render during the dialog: still restored
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  await page.locator('.option[data-swap="cm-canned-tomatoes"]').click();
  await page.waitForTimeout(100);
  await page.locator(".sheet-foot .btn--secondary, .sheet-foot .btn--primary").first().click();
  await page.waitForTimeout(150);
  check("dialog", "after apply, focus lands on the trigger or the heading, never lost", await page.evaluate(() => document.activeElement !== document.body && document.activeElement.isConnected), await page.evaluate(() => document.activeElement.tagName));
  // Toast pauses and has a close control; recovery beyond the toast
  await page.evaluate(() => { location.hash = "#/pantry"; });
  await page.waitForTimeout(60);
  await page.locator('[data-action="pantry-remove"]').first().click();
  await page.waitForTimeout(50);
  await page.locator("#toast .toast").hover();
  await page.waitForTimeout(10500);
  check("toast", "stays while hovered, past its timer", (await page.locator("#toast .toast").count()) === 1);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(10300);
  check("toast", "goes after it's left alone", (await page.locator("#toast .toast").count()) === 0);
  await page.evaluate(() => { location.hash = "#/saved"; });
  await page.waitForTimeout(60);
  await page.locator('[data-action="recover"]').first().click();
  await page.waitForTimeout(60);
  check("toast", "a removal is recoverable long after the toast", !(await page.evaluate(() => window.__mise.state.recovery.some((r) => r.kind === "pantry-entry"))));
  // Reactive inputs keep focus and caret
  await page.evaluate(() => { location.hash = "#/recipes"; });
  await page.waitForTimeout(60);
  await page.focus('[data-action="recipe-search"]');
  await page.keyboard.type("chana");
  await page.waitForTimeout(40);
  const caret = await page.evaluate(() => { const a = document.activeElement; return { action: a.dataset.action, value: a.value, start: a.selectionStart }; });
  check("re-render", "typing search keeps focus and caret", caret.action === "recipe-search" && caret.value === "chana" && caret.start === 5, caret);
  // Unfinished input survives a redraw
  await page.evaluate(() => { location.hash = "#/list"; });
  await page.waitForTimeout(60);
  await page.fill('.add-item [name="name"]', "half typed");
  await page.locator('[data-action="plan-servings"][data-delta="1"]').first().click();
  await page.waitForTimeout(80);
  check("re-render", "an unfinished field survives a redraw", (await page.inputValue('.add-item [name="name"]')) === "half typed");
  // IME composition: no redraw until it ends
  await page.evaluate(() => { location.hash = "#/recipes"; });
  await page.waitForTimeout(60);
  const ime = await page.evaluate(() => {
    const el = document.querySelector('[data-action="recipe-search"]');
    el.focus();
    el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    el.value = "चन";
    el.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
    const same = document.querySelector('[data-action="recipe-search"]') === el;
    el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    return { same, value: document.querySelector('[data-action="recipe-search"]').value };
  });
  check("re-render", "composition isn't interrupted by a redraw (simulated events)", ime.same && ime.value === "चन", ime);
  // Disclosure state survives a redraw; scroll position kept
  await page.evaluate(() => { location.hash = "#/adapt/chana-masala/compare"; });
  await page.waitForTimeout(80);
  await page.locator("details.nutrition > summary").click();
  await page.locator("details.more-nut > summary").click();
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.evaluate(() => document.querySelector('[data-action="session-undo"]')?.click());
  await page.waitForTimeout(80);
  const kept = await page.evaluate(() => ({ open: document.querySelector("details.more-nut")?.open, y: window.scrollY }));
  check("re-render", "disclosures and scroll survive", kept.open && kept.y > 300, kept);
  // Browser Back returns to the route
  await page.goBack();
  await page.waitForTimeout(80);
  check("re-render", "browser Back restores the route with an h1", (await page.locator("#app h1").count()) === 1);
  await context.close();
}

// Icon-only and repeated controls have names; tables have headers
{
  const context = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const page = await context.newPage();
  const did = await seed(page);
  const missing = [];
  const unnamedInputs = [];
  for (const r of routes(did)) {
    await page.evaluate((x) => { location.hash = x; }, r);
    await page.waitForTimeout(40);
    const res = await page.evaluate(() => {
      const name = (el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim() || el.querySelector("img[alt]")?.alt;
      const btns = [...document.querySelectorAll("#app button, #app a")].filter((b) => !name(b)).map((b) => b.outerHTML.slice(0, 80));
      const inputs = [...document.querySelectorAll("#app input, #app select, #app textarea")].filter((i) => !i.getAttribute("aria-label") && !i.labels?.length).map((i) => i.outerHTML.slice(0, 80));
      const tables = [...document.querySelectorAll("#app table")].filter((t) => !t.querySelector("caption") || !t.querySelector('th[scope="col"]')).map((t) => t.className);
      const headings = [...document.querySelectorAll("#app h1, #app h2, #app h3, #app h4")].map((h) => Number(h.tagName[1]));
      return { btns, inputs, tables, jump: headings.some((h, i) => i && h - headings[i - 1] > 1) };
    });
    missing.push(...res.btns.map((x) => `${r} ${x}`));
    unnamedInputs.push(...res.inputs.map((x) => `${r} ${x}`));
    check("semantics", `${r}: tables have captions and column headers`, !res.tables.length, res.tables);
  }
  check("semantics", "every button and link has a name", !missing.length, missing.slice(0, 8));
  check("semantics", "every field has a label", !unnamedInputs.length, unnamedInputs.slice(0, 8));
  await page.evaluate(() => { location.hash = "#/recipe/chana-masala"; });
  await page.waitForTimeout(250);
  const img = await page.evaluate(() => { const i = document.querySelector(".photo--hero img"); return { src: i.currentSrc.split("/").pop(), w: i.clientWidth, h: i.clientHeight, natural: i.naturalWidth, sizes: i.sizes, ratio: Math.round((i.parentElement.clientWidth / i.parentElement.clientHeight) * 100) / 100, loading: i.loading }; });
  check("images", "hero is eager, with a sensible source", img.loading === "eager" && img.natural >= img.w, img);
  await context.close();
}

// State treatments stay distinct without color (H09), and fraction glyphs exist in the font (J08)
{
  const context = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const page = await context.newPage();
  await seed(page);
  await page.evaluate(() => { location.hash = "#/adapt/chana-masala/needs"; });
  await page.waitForTimeout(80);
  const look = (sel) => page.evaluate((x) => {
    const el = document.querySelector(x);
    if (!el) return null;
    const c = getComputedStyle(el);
    return { fill: c.backgroundColor, text: c.color, weight: c.fontWeight, border: `${c.borderTopWidth} ${c.borderTopStyle}`, left: `${c.borderLeftWidth} ${c.borderLeftStyle}`, deco: c.textDecorationLine };
  }, sel);
  const selected = await look('.chip[aria-pressed="true"]');
  const neutral = await look('.chip[aria-pressed="false"]');
  await page.evaluate(() => { location.hash = "#/recipe/chana-masala"; });
  await page.waitForTimeout(40);
  await page.evaluate(() => { location.hash = "#/adapt/masoor-dal/needs"; });
  await page.waitForTimeout(40);
  const disabled = await look(".btn[disabled]");
  const primary = await look(".action-bar .btn--primary");
  check("states", "selected differs from neutral by fill and weight", selected && neutral && selected.fill !== neutral.fill && selected.weight !== neutral.weight, { selected, neutral });
  check("states", "disabled differs by a dashed border and regular weight", disabled?.border.includes("dashed"), disabled);
  check("states", "primary is a black fill", primary?.fill === "rgb(0, 0, 0)", primary);
  await page.evaluate(() => { location.hash = "#/list"; });
  await page.waitForTimeout(60);
  await page.fill('.line:has-text("Onion") input[data-action="list-qty"], .line input[data-action="list-qty"]:not([disabled])', "99").catch(() => {});
  await page.keyboard.press("Tab");
  await page.waitForTimeout(60);
  const edited = await page.evaluate(() => { const e = document.querySelector(".edited"); return e ? { text: e.textContent, weight: getComputedStyle(e).fontWeight } : null; });
  check("states", "edited says so in words, at a heavier weight", edited?.text === "edited" && Number(edited.weight) >= 500, edited);
  await page.evaluate(() => { location.hash = "#/adapt/chana-masala/compare"; });
  await page.waitForTimeout(60);
  const warn = await page.evaluate(() => { const c = document.querySelector("tr.is-changed s"); return c ? getComputedStyle(c).textDecorationLine : null; });
  check("states", "changed values are struck through", warn === "line-through", warn);
  const glyphs = await page.evaluate(async () => {
    await document.fonts.ready;
    const c = document.createElement("canvas").getContext("2d");
    return [..."⅛¼⅜½⅝¾⅞⅓⅔–·×"].filter((g) => { c.font = '40px "Apfel Grotezk", monospace'; const a = c.measureText(g).width; c.font = "40px monospace"; return a === c.measureText(g).width; });
  });
  results.push({ group: "fonts", name: "glyphs that fall back from Apfel Grotezk", pass: true, detail: glyphs });
  console.log("glyphs falling back:", glyphs.join(" ") || "none");
  await context.close();
}

// Large collections
{
  const context = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const page = await context.newPage();
  await seed(page, { big: true });
  const counts = await page.evaluate(() => { const s = window.__mise.state; return { versions: Object.keys(s.versions).length, pantry: Object.keys(s.pantry).length, plan: s.plan.length, lines: s.list.lines.length }; });
  check("large", "seeded 100 versions, 100 pantry items, 20 meals, about 200 lines", counts.versions >= 100 && counts.pantry >= 100 && counts.plan === 20 && counts.lines >= 190, counts);
  const size = await page.evaluate(() => localStorage.getItem("mise-match:v1").length);
  const timings = {};
  for (const r of ["#/", "#/recipes", "#/pantry", "#/list", "#/saved", "#/plan"]) {
    const ms = await page.evaluate(async (x) => { const t = performance.now(); location.hash = x; await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); return performance.now() - t; }, r);
    timings[r] = Math.round(ms);
    check("large", `${r} draws in under 1500 ms`, ms < 1500, Math.round(ms));
  }
  const m = await measure(page);
  check("large", "no overflow with a full collection", m.overflow <= 1, m.overflow);
  await page.evaluate(() => { location.hash = "#/list"; });
  await page.waitForTimeout(100);
  const action = await page.evaluate(async () => { const t = performance.now(); document.querySelector('[data-action="plan-servings"][data-delta="1"]:not([disabled])').click(); await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); return performance.now() - t; });
  check("large", "changing a planned meal regenerates in under 1500 ms", action < 1500, Math.round(action));
  console.log("large collection timings", timings, "action", Math.round(action), "ms, stored", Math.round(size / 1024), "KB");
  results.push({ group: "large", name: "timings", pass: true, detail: { timings, action: Math.round(action), storedKB: Math.round(size / 1024) } });
  await context.close();
}

const version = browser.version();
await browser.close();
const failed = results.filter((r) => !r.pass);
writeFileSync(join(out, "matrix.json"), JSON.stringify({ base, browser: `Chrome ${version}`, widths: WIDTHS, at: new Date().toISOString(), results }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} checks passed (Chrome ${version})`);
