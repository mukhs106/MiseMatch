// The T10 connected acceptance scenarios, end to end in a real browser, plus
// resilience checks that capture.mjs doesn't cover. Each check records what it saw.
//
//   node acceptance.mjs [--base http://localhost:8080] [--out ../../reviews/<dated-folder>] [--only 1,2,3]
//
// These are software checks. They aren't kitchen validation, and they don't stand
// in for a screen reader or a physical device.

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
const out = resolve(args.out ?? join(here, "../../reviews/acceptance"));
const only = args.only ? String(args.only).split(",") : null;
mkdirSync(out, { recursive: true });

const results = [];
let current = "";
const check = (name, pass, detail = "") => {
  results.push({ scenario: current, name, pass: !!pass, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
  console.log(`${pass ? "  ok  " : " FAIL "} [${current}] ${name}${pass ? "" : ` :: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
};

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const version = browser.version();

async function fresh(opts = {}) {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.errors = errors;
  return { context, page };
}
const go = async (page, hash) => {
  await page.goto(`${base}/${hash}`);
  await page.waitForFunction(() => window.__miseBooted === true);
};
const reloadAt = async (page, h) => {
  await page.evaluate((x) => { history.replaceState(null, "", x); }, h);
  await page.reload();
  await page.waitForFunction(() => window.__miseBooted === true);
};
const hash = (page, h) => page.evaluate((x) => { location.hash = x; }, h).then(() => page.waitForTimeout(40));
const S = (page) => page.evaluate(() => window.__mise.state);
const text = (page, sel = "#app") => page.locator(sel).first().innerText();
const click = (page, sel) => page.locator(sel).locator("visible=true").first().click();
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
const scenario = async (id, title, fn) => {
  if (only && !only.includes(String(id))) return;
  current = `${id}. ${title}`;
  console.log(`\n${current}`);
  try {
    await fn();
  } catch (e) {
    check("scenario ran to the end", false, e.message.split("\n").slice(0, 3).join(" "));
  }
};

await scenario(1, "Fresh browser: chana masala for two, no fresh tomatoes", async () => {
  const { context, page } = await fresh();
  await go(page, "#/");
  await click(page, '[data-action="start-scenario"]');
  await page.waitForFunction(() => location.hash === "#/adapt/chana-masala/options");
  let s = await S(page);
  const session = s.sessions["chana-masala"];
  check("the start row opens what it promises: 2 servings, canned tomatoes", session.servings === 2 && session.applied.join() === "cm-canned-tomatoes", session);
  check("nothing written to the pantry or the collection", !Object.keys(s.pantry).length && !Object.keys(s.versions).length);
  await shot(page, "s1-preview");
  check("preview is labelled", /Preview/.test(await text(page)));
  // Top recommendation reflects the missing tomatoes
  const first = await page.locator(".option-card h3").first().innerText();
  check("first recommendation avoids the missing fresh tomatoes", /canned/i.test(first), first);
  await page.goto(`${base}/#/adapt/chana-masala/needs`);
  await page.waitForFunction(() => window.__miseBooted === true);
  check("step 1 reads what's missing", (await page.locator('[data-action="mark-missing"][data-item="fresh-tomatoes"]').getAttribute("aria-pressed")) === "true");
  await click(page, '[data-action="mark-have"][data-item="onion"]');
  await page.waitForTimeout(50);
  s = await S(page);
  check("relevant pantry information is recorded", !!s.pantry.onion && Object.keys(s.pantry).length === 1, Object.keys(s.pantry));
  // Compare: every amount and instruction agrees
  await hash(page, "#/adapt/chana-masala/compare");
  const cmp = await text(page);
  await shot(page, "s1-compare");
  check("compare: scaled amounts, not base amounts", /200 g canned tomatoes/i.test(cmp) && !/400 g canned/.test(cmp.replace(/As written, one 400 g can/, "")), cmp.slice(0, 200));
  check("consequences shown with the active serving count", /for 2 servings/.test(cmp) && /As written/.test(cmp));
  check("no raw weight claim as a plated weight", !/of food instead/.test(cmp));
  check("nutrition says ranges are illustrative", /illustrative/.test(await page.locator("details.nutrition").textContent()));
  // Save
  await click(page, '[data-action="save-version"]');
  await page.locator('#sheet [data-action="confirm-save-version"]').first().click();
  await page.waitForTimeout(100);
  s = await S(page);
  const v = Object.values(s.versions)[0];
  check("saved with a snapshot and revisions", v?.snapshot?.rules[0].id === "cm-canned-tomatoes" && v.recipeRev === 1, v?.snapshot?.rules);
  // Remaining needs only
  await hash(page, "#/adapt/chana-masala/shop");
  const shop = await text(page);
  await shot(page, "s1-shop");
  check("shop: rice 150 g, chickpeas 240 g", /150 g[\s\S]*White basmati/.test(shop) && /240 g[\s\S]*Chickpeas/.test(shop));
  check("onion in pantry without amount asks, doesn't subtract", /Do you have enough/.test(shop) && /Onion/.test(await page.locator(".confirm-list").innerText()));
  check("optional cilantro isn't a purchase", /Optional/i.test(shop) && !(await page.locator(".short-list").first().innerText()).includes("Cilantro"));
  check("preliminary counts say 'to check'", /to check/.test(shop));
  await click(page, '[data-action="confirm"][data-item="onion"][data-value="enough"]');
  await click(page, '[data-action="add-plan"]');
  await page.waitForTimeout(100);
  await hash(page, "#/list");
  await shot(page, "s1-list");
  const list = await text(page);
  s = await S(page);
  const lineOf = (i) => s.list.lines.find((l) => l.item === i);
  check("list has only remaining needs", !lineOf("onion") && !lineOf("cilantro") && lineOf("canned-tomatoes") && !lineOf("fresh-tomatoes"), s.list.lines.map((l) => l.item));
  const qty = await page.locator(".line", { hasText: "Canned tomatoes" }).locator('input[data-action="list-qty"]').inputValue();
  check("list amount matches the recipe", qty === "200", qty);
  check("no errors in the browser", !page.errors.length, page.errors);
  await context.close();
});

await scenario("1b", "The start row with existing work, and proposals", async () => {
  const { context, page } = await fresh();
  await go(page, "#/adapt/chana-masala/needs");
  await click(page, '[data-action="servings"][data-delta="1"]');
  await page.waitForTimeout(30);
  await hash(page, "#/");
  await page.waitForTimeout(30);
  check("with work in progress, it offers that work and no scenario row", (await page.locator('[data-action="start-scenario"]').count()) === 0 && /Pick up where you left off/.test(await text(page)));
  const direct = await page.evaluate(async () => { document.body.insertAdjacentHTML("beforeend", '<button id="t" data-action="start-scenario" data-id="chana-masala"></button>'); document.getElementById("t").click(); await new Promise((r) => setTimeout(r, 60)); return { title: document.getElementById("sheet-title")?.textContent, servings: window.__mise.state.sessions["chana-masala"].servings }; });
  check("even if triggered, it asks and doesn't overwrite", direct.title === "You have unsaved changes" && direct.servings === 5, direct);
  await page.keyboard.press("Escape");
  // A7: a suggestion carries its option and portions
  await hash(page, "#/adapt/paneer-butter-masala/needs");
  await page.selectOption('[data-action="c-target"][data-nutrient="protein"]', "35");
  await hash(page, "#/adapt/paneer-butter-masala/options");
  await page.waitForTimeout(40);
  const prop = page.locator('[data-action="review-proposal"][data-id="masoor-dal"]').first();
  const data = await prop.evaluate((e) => ({ applied: e.dataset.applied, servings: e.dataset.servings }));
  await prop.click();
  await page.waitForFunction(() => location.hash === "#/adapt/masoor-dal/compare");
  const ms = (await S(page)).sessions["masoor-dal"];
  check("a proposed side opens that option at those portions, for review", ms.applied.join(",") === data.applied && ms.servings === Number(data.servings), { ms: ms.applied, data });
  // C8: quick add off and back is recoverable, amount and all
  await hash(page, "#/pantry");
  await page.fill('[data-action="pantry-search"]', "paneer");
  await click(page, '[data-action="pantry-add"][data-item="paneer"]');
  await page.fill('[data-action="pantry-qty"][data-key="paneer"]', "200");
  await page.press('[data-action="pantry-qty"][data-key="paneer"]', "Tab");
  await page.waitForTimeout(30);
  await page.locator('[data-action="pantry-toggle"][data-item="paneer"]').click();
  await page.waitForTimeout(30);
  await page.locator("#toast [data-toast-action]").click();
  await page.waitForTimeout(30);
  check("quick-add off keeps the amount recoverable", (await S(page)).pantry.paneer.qty === 200);
  // G9: offline refresh
  await context.setOffline(true);
  const loaded = await page.reload({ timeout: 8000 }).then(() => true).catch(() => false);
  check("offline refresh fails at the browser, as the settings copy says it can", !loaded);
  await context.setOffline(false);
  await page.goto(`${base}/#/profile`);
  await page.waitForFunction(() => window.__miseBooted === true);
  check("settings state the local-only limits", /isn't set up to work offline/.test(await text(page)) && /no backup/.test(await text(page)));
  check("data survives the failed refresh", (await S(page)).pantry.paneer.qty === 200);
  check("no errors", !page.errors.length, page.errors);
  await context.close();
});

await scenario(2, "Protein target with no restrictions, then a competing fiber target", async () => {
  const { context, page } = await fresh();
  await go(page, "#/adapt/chana-masala/needs");
  await page.selectOption('[data-action="c-target"][data-nutrient="protein"]', "30");
  await hash(page, "#/adapt/chana-masala/options");
  await shot(page, "s2-protein");
  const t = await text(page);
  check("no blame on restrictions that don't exist", !/requirements pull|different directions|Within your requirements|Your requirements rule out/.test(t), t.slice(0, 300));
  check("states no version reaches it", /No (supported )?version/.test(t) && /30 g target/.test(t));
  check("groups by fit: closest or may, and no 'Versions that fit'", (/Closest supported/.test(t) || /May meet/.test(t)) && !/Versions that fit/.test(t));
  const lowerBtn = page.locator('[data-action="c-lower-target"]').first();
  const lowerLabel = await lowerBtn.innerText();
  check("offers a lower goal", /Lower the protein goal/.test(lowerLabel), lowerLabel);
  await lowerBtn.click();
  await page.waitForTimeout(50);
  const after = await text(page);
  check("the lower goal is then met by a real version", /Meets your goals/.test(after));
  // Competing targets: bhurji with eggs vs peas
  await hash(page, "#/adapt/paneer-bhurji/needs");
  await page.selectOption('[data-action="c-target"][data-nutrient="protein"]', "25");
  await page.waitForTimeout(30);
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mise-match:v1"));
    st.sessions["paneer-bhurji"].constraints = { ...st.sessions["paneer-bhurji"].constraints, targets: { protein: 28, fiber: 8 } };
    localStorage.setItem("mise-match:v1", JSON.stringify(st));
  });
  await page.reload();
  await page.waitForFunction(() => window.__miseBooted === true);
  await hash(page, "#/adapt/paneer-bhurji/options");
  await shot(page, "s2-competing");
  const c = await text(page);
  check("explains no single version reaches both", /No single version reaches both/.test(c), c.slice(0, 400));
  check("names which version reaches which", /reaches protein/.test(c) && /reaches fiber/.test(c));
  const set = await page.locator('[data-action="c-lower-target"]').first().innerText();
  check("offers lower goals as one set", /protein/.test(set) && /fiber/.test(set) || /Lower the/.test(set), set);
  await page.locator('[data-action="c-lower-target"]').first().click();
  await page.waitForTimeout(50);
  check("that set is achieved by one candidate", /Meets your goals/.test(await text(page)));
  check("no errors", !page.errors.length, page.errors);
  await context.close();
});

await scenario(3, "Portions at 1, 2, 4 and the upper limit", async () => {
  const { context, page } = await fresh();
  const dishes = await page.goto(`${base}/#/`).then(() => page.waitForFunction(() => window.__miseBooted === true)).then(() => page.evaluate(() => window.__mise.RECIPES.map((r) => ({ id: r.id, range: r.servingsRange, base: r.servings }))));
  let problems = [];
  for (const d of dishes) {
    await hash(page, `#/adapt/${d.id}/needs`);
    await page.waitForTimeout(20);
    // Walk down to the minimum and up to the maximum, checking the method and ingredients on the way.
    const down = page.locator('[data-action="servings"][data-delta="-1"]').first();
    const up = page.locator('[data-action="servings"][data-delta="1"]').first();
    while (!(await down.isDisabled())) await down.click();
    const min = Number(await page.locator(".stepper output").first().innerText());
    if (min !== d.range[0]) problems.push(`${d.id}: min ${min}`);
    for (let i = 0; i < 20 && !(await up.isDisabled()); i++) {
      const servings = Number(await page.locator(".stepper output").first().innerText());
      if ([1, 2, 4].includes(servings)) {
        await hash(page, `#/adapt/${d.id}/compare`);
        const t = await text(page);
        if (/\{|\}/.test(t) || /undefined|NaN|Infinity/.test(t)) problems.push(`${d.id}@${servings}: token or NaN`);
        await hash(page, `#/adapt/${d.id}/needs`);
      }
      await up.click();
    }
    const max = Number(await page.locator(".stepper output").first().innerText());
    if (max !== d.range[1]) problems.push(`${d.id}: max ${max}`);
    if (!new RegExp(`written for ${d.range[0]} to ${d.range[1]} servings`).test(await text(page))) problems.push(`${d.id}: range not shown`);
    if (d.base !== max && !/aren't scaled/.test(await text(page))) problems.push(`${d.id}: no time note`);
  }
  check("every dish walks its supported range with no tokens, NaN or unsupported step", !problems.length, problems);
  // Specifics at 2 servings
  await hash(page, "#/adapt/chana-masala/needs");
  const s = await S(page);
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mise-match:v1"));
    st.sessions["chana-masala"].servings = 2;
    localStorage.setItem("mise-match:v1", JSON.stringify(st));
  });
  await page.reload();
  await page.waitForFunction(() => window.__miseBooted === true);
  const needs = await text(page);
  check("serving description follows portions", /half of the curry with 75 g uncooked rice/.test(needs), needs.slice(0, 500));
  await hash(page, "#/cook/chana-masala");
  await page.waitForTimeout(40);
  const cook = await text(page);
  await shot(page, "s3-cook-2");
  check("method water follows portions, not literal", !/250 ml/.test(cook) && /about 1[5-6]\d ml water/.test(cook), cook.match(/about [^ ]+ ml water/)?.[0] ?? "no match");
  check("½ lemon at 4 became ¼ at 2", /¼[\s\S]{0,5}Lemon/.test(cook));
  check("pan fat follows the half-rate rule", /2¼ tbsp[\s\S]{0,10}Neutral oil/.test(cook));
  // Undo
  await hash(page, "#/adapt/chana-masala/needs");
  await click(page, '[data-action="servings"][data-delta="1"]');
  await click(page, '[data-action="session-undo"]');
  await page.waitForTimeout(40);
  check("undo restores portions", (await S(page)).sessions["chana-masala"].servings === 2);
  // Rule out of range when portions change
  await hash(page, "#/adapt/paneer-butter-masala/needs");
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mise-match:v1"));
    st.sessions["paneer-butter-masala"].applied = ["pbm-sunflower"];
    st.sessions["paneer-butter-masala"].servings = 2;
    localStorage.setItem("mise-match:v1", JSON.stringify(st));
  });
  await page.reload();
  await page.waitForFunction(() => window.__miseBooted === true);
  await click(page, '[data-action="servings"][data-delta="-1"]');
  await page.waitForTimeout(40);
  check("an applied rule outside its range is named with the reason", /Sunflower seeds for cashews doesn't fit 1 serving/.test(await text(page)));
  check("no errors", !page.errors.length, page.errors);
  await context.close();
});

await scenario(4, "Two meals share a measured pantry ingredient", async () => {
  const { context, page } = await fresh();
  await go(page, "#/pantry");
  await page.fill('[data-action="pantry-search"]', "basmati");
  await click(page, '[data-action="pantry-add"][data-item="basmati"]');
  await page.fill('[data-action="pantry-qty"][data-key="basmati"]', "400");
  await page.press('[data-action="pantry-qty"][data-key="basmati"]', "Tab");
  for (const id of ["chana-masala", "masoor-dal"]) {
    await hash(page, `#/adapt/${id}/shop`);
    await click(page, '[data-action="add-plan"]');
    await page.waitForTimeout(60);
  }
  await hash(page, "#/list");
  let s = await S(page);
  const rice = () => s.list.lines.find((l) => l.item === "basmati" && !l.transfer);
  const riceQty = (x) => Object.values(x.sources).reduce((sum, v) => sum + v.qty, 0);
  check("pantry counted once: 600 - 400 = 200 g", riceQty(rice()) === 200, rice());
  // Manual edit and a checked line, then change the first meal
  await page.fill('.line:has-text("Red lentils") input[data-action="list-qty"]', "999");
  await page.press('.line:has-text("Red lentils") input[data-action="list-qty"]', "Tab");
  await page.waitForTimeout(40);
  await page.locator('.line:has-text("Garlic") input[data-action="list-check"]').check({ force: true });
  await page.waitForTimeout(40);
  await page.locator('.planned-row:has-text("Chana masala") [data-action="plan-servings"][data-delta="-1"]').click();
  await page.waitForTimeout(40);
  await page.locator('.planned-row:has-text("Chana masala") [data-action="plan-servings"][data-delta="-1"]').click();
  await page.waitForTimeout(60);
  s = await S(page);
  check("edit first meal: rice reconciles", riceQty(rice()) === 50, riceQty(rice()));
  const garlic = s.list.lines.find((l) => l.item === "garlic");
  check("checked line stays checked and gets one conflict", garlic.checked && garlic.conflict?.type === "changed", garlic.conflict);
  check("manual edit preserved", s.list.lines.find((l) => l.item === "red-lentils").override?.qty === 999);
  await shot(page, "s4-edited");
  // Remove the first meal
  await page.locator('.planned-row:has-text("Chana masala") [data-action="plan-remove"]').first().click();
  await page.waitForTimeout(80);
  s = await S(page);
  check("remove first meal: second reallocates against freed pantry", !rice(), rice());
  check("edited line survives regeneration", s.list.lines.find((l) => l.item === "red-lentils").override?.qty === 999);
  // Undo the removal (narrow)
  await page.locator('#toast [data-toast-action]').click();
  await page.waitForTimeout(80);
  s = await S(page);
  check("undo puts the meal back and reallocates", s.plan.length === 2 && riceQty(rice()) === 50, s.plan.length);
  // D01: duplicate
  await hash(page, "#/adapt/masoor-dal/shop");
  await click(page, '[data-action="add-plan"]');
  await page.waitForTimeout(60);
  check("adding the same meal again asks instead of doubling", (await page.locator("#sheet-title").innerText()) === "Already on your list" && (await S(page)).plan.length === 2);
  await page.keyboard.press("Escape");
  check("no errors", !page.errors.length, page.errors);
  await context.close();
});

await scenario(5, "Unknown stock goes stale; zero, blank, invalid, g to kg", async () => {
  const { context, page } = await fresh();
  await go(page, "#/adapt/chana-masala/shop");
  await page.selectOption("#have-onion", "have");
  await page.waitForTimeout(30);
  await click(page, '[data-action="confirm"][data-item="onion"][data-value="enough"]');
  await page.waitForTimeout(30);
  check("answered: onion no longer asked", !(await page.locator(".confirm-list").count()));
  await hash(page, "#/adapt/chana-masala/needs");
  await click(page, '[data-action="servings"][data-delta="1"]');
  await hash(page, "#/adapt/chana-masala/shop");
  await shot(page, "s5-stale");
  const stale = await text(page);
  check("raising portions reconfirms", /Do you have enough/.test(stale) && /changed since you last answered/.test(stale), stale.slice(0, 200));
  // Plan change also reconfirms
  await click(page, '[data-action="confirm"][data-item="onion"][data-value="enough"]');
  await click(page, '[data-action="add-plan"]');
  await page.locator('#sheet [data-action="plan-add-copy"]').click();
  await page.waitForTimeout(60);
  await hash(page, "#/adapt/pav-bhaji/shop");
  await page.waitForTimeout(30);
  check("adding a meal that shares it asks about the total", /in total across/.test(await page.locator(".confirm-list").innerText()), await page.locator(".confirm-list").innerText());
  // Pantry input
  await hash(page, "#/pantry");
  await page.fill('[data-action="pantry-search"]', "basmati");
  await click(page, '[data-action="pantry-add"][data-item="basmati"]');
  const qty = '[data-action="pantry-qty"][data-key="basmati"]';
  await page.fill(qty, "500");
  await page.press(qty, "Tab");
  await page.waitForTimeout(30);
  const entry = async () => (await S(page)).pantry.basmati;
  check("500 g stored", (await entry()).qty === 500);
  for (const bad of ["-5", "abc", "1e3"]) {
    await page.fill(qty, bad);
    await page.press(qty, "Tab");
    await page.waitForTimeout(30);
    check(`rejects ${bad} inline, keeps 500`, (await entry()).qty === 500 && (await page.locator(".field-error").count()) > 0 && (await page.locator(qty).getAttribute("aria-invalid")) === "true");
  }
  await shot(page, "s5-invalid");
  await page.fill(qty, "");
  await page.press(qty, "Tab");
  await page.waitForTimeout(30);
  check("blank alone doesn't discard the amount", (await entry()).qty === 500 && /Clear amount/.test(await text(page, ".field-error")));
  await page.fill(qty, "500");
  await page.press(qty, "Tab");
  await page.waitForTimeout(30);
  check("error clears on valid input", !(await page.locator(".field-error").count()));
  await page.selectOption('[data-action="pantry-unit"][data-key="basmati"]', "kg");
  await page.waitForTimeout(30);
  let e = await entry();
  check("g to kg converts: 0.5 kg, not 500 kg", e.qty === 0.5 && e.unit === "kg", e);
  await page.reload();
  await page.waitForFunction(() => window.__miseBooted === true);
  e = await entry();
  check("conversion survives reload", e.qty === 0.5 && e.unit === "kg" && (await page.locator(qty).inputValue()) === "0.5");
  await page.selectOption('[data-action="pantry-unit"][data-key="basmati"]', "g");
  await page.waitForTimeout(30);
  check("kg back to g: 500", (await entry()).qty === 500);
  await page.fill(qty, "0");
  await page.press(qty, "Tab");
  await page.waitForTimeout(30);
  check("zero is out of stock, not positive presence", /Don't have/.test(await page.locator('.line:has-text("White basmati")').innerText()), await page.locator('.line:has-text("White basmati")').innerText());
  await page.fill(qty, "250");
  await page.press(qty, "Tab");
  await page.waitForTimeout(30);
  await click(page, '[data-action="pantry-clear"][data-key="basmati"]');
  await page.waitForTimeout(30);
  check("explicit clear makes it unknown", (await entry()).qty == null && /amount unknown/.test(await page.locator('.line:has-text("White basmati")').innerText()));
  await page.locator('#toast [data-toast-action]').click();
  await page.waitForTimeout(30);
  check("clear can be undone", (await entry()).qty === 250);
  check("no errors", !page.errors.length, page.errors);
  await context.close();
});

await scenario(6, "Buy, transfer once, reload; finish cooking; deduct once with undo", async () => {
  const { context, page } = await fresh();
  await go(page, "#/adapt/chana-masala/shop");
  await click(page, '[data-action="add-plan"]');
  await page.waitForTimeout(60);
  await hash(page, "#/list");
  const lemon = page.locator('.line:has-text("Lemon")');
  check("½ lemon needed, 1 to buy", (await lemon.locator('input[data-action="list-qty"]').inputValue()) === "1" && /Recipes use ½/.test(await lemon.innerText()), await lemon.innerText());
  await lemon.locator('input[data-action="list-check"]').check({ force: true });
  await page.waitForTimeout(40);
  await shot(page, "s6-bought");
  check("bought amount defaults to the purchase", (await page.locator('.line:has-text("Lemon") input[id^="bought-"]').inputValue()) === "1");
  await page.locator('.line:has-text("Lemon") [data-action="list-to-pantry"]').click();
  await page.waitForTimeout(60);
  let s = await S(page);
  check("the bought amount reaches the pantry, not the raw requirement", s.pantry.lemon.qty === 1, s.pantry.lemon);
  await page.reload();
  await page.waitForFunction(() => window.__miseBooted === true);
  const lemonRow = page.locator('.line:has-text("Lemon")').first();
  check("after reload it still says it's in the pantry, and offers no second transfer", /added to your pantry/.test(await lemonRow.innerText()) && !(await lemonRow.locator('[data-action="list-to-pantry"]:not([data-more])').count()), await lemonRow.innerText());
  s = await S(page);
  check("no duplicate inventory", s.pantry.lemon.qty === 1);
  // Set up a measured item, cook from the plan, deduct.
  await hash(page, "#/pantry");
  await page.fill('[data-action="pantry-search"]', "basmati");
  await click(page, '[data-action="pantry-add"][data-item="basmati"]');
  await page.fill('[data-action="pantry-qty"][data-key="basmati"]', "1000");
  await page.press('[data-action="pantry-qty"][data-key="basmati"]', "Tab");
  await page.waitForTimeout(40);
  const planId = (await S(page)).plan[0].id;
  await hash(page, `#/cook/chana-masala/p/${planId}`);
  await page.waitForTimeout(60);
  await click(page, '[data-action="finish-cooking"]');
  await page.waitForTimeout(60);
  await page.locator('#sheet [data-action="skip-feedback"]').click();
  await page.waitForTimeout(60);
  await shot(page, "s6-pantry-review");
  const review = await text(page, "#sheet");
  check("offers one reviewable pantry update", /Update pantry after cooking/.test(review) && /White basmati/.test(review), review.slice(0, 300));
  check("nothing changed before applying", (await S(page)).pantry.basmati.qty === 1000);
  await page.locator('#sheet [data-action="apply-cook-pantry"]').click();
  await page.waitForTimeout(80);
  s = await S(page);
  check("deducted exactly the cooked amount", s.pantry.basmati.qty === 700, s.pantry.basmati);
  check("completed only the intended plan entry", s.plan.length === 0);
  const rec = s.cooks.at(-1);
  check("recorded on the cooking record", !!rec.pantryUpdate);
  await hash(page, "#/saved");
  check("can't be applied twice", !(await page.locator(`[data-action="review-cook-pantry"][data-cook="${rec.id}"]`).count()));
  await page.locator('#toast [data-toast-action]').click().catch(() => {});
  await page.waitForTimeout(80);
  s = await S(page);
  if (s.pantry.basmati.qty !== 1000) {
    // The toast may have gone. The persistent path works either way.
    await page.locator('[data-action="recover"]').first().click();
    await page.waitForTimeout(80);
    s = await S(page);
  }
  check("undo restores stock and the planned meal", s.pantry.basmati.qty === 1000 && s.plan.length === 1, { q: s.pantry.basmati, plan: s.plan.length });
  check("no errors", !page.errors.length, page.errors);
  await context.close();
});

await scenario(7, "Save, plan a revision, modify, accept or reject; history reproducible", async () => {
  const { context, page } = await fresh();
  await go(page, "#/adapt/chana-masala/needs");
  await click(page, '[data-action="servings"][data-delta="-1"]');
  await hash(page, "#/adapt/chana-masala/options");
  await page.locator('[data-action="choose-option"][data-applied="cm-canned-tomatoes"]').first().click();
  await click(page, '[data-action="save-version"]');
  await page.locator('#sheet [data-action="confirm-save-version"]').first().click();
  await page.waitForTimeout(60);
  await hash(page, "#/adapt/chana-masala/shop");
  await click(page, '[data-action="add-plan"]');
  await page.waitForTimeout(60);
  await hash(page, "#/cook/chana-masala");
  await page.waitForTimeout(40);
  await click(page, '[data-action="finish-cooking"]');
  await page.waitForTimeout(40);
  await page.locator('#sheet [data-action="skip-feedback"]').click();
  await page.keyboard.press("Escape");
  // Modify the version
  await hash(page, "#/adapt/chana-masala/options");
  await page.locator('[data-action="preview-swap"][data-swap="cm-paneer"]').first().click();
  await page.locator(".sheet-foot .btn--primary").click();
  await click(page, '[data-action="save-version"]');
  await page.locator('#sheet [data-action="confirm-save-version"][data-mode="update"]').click();
  await page.waitForTimeout(60);
  await hash(page, "#/list");
  let s = await S(page);
  check("list unchanged until reviewed", !s.list.lines.some((l) => l.item === "paneer"));
  check("offers the update", /changed since you planned it/.test(await text(page)));
  await click(page, '[data-action="plan-review-update"]');
  await shot(page, "s7-update");
  await page.locator('#sheet [data-action="plan-keep-copy"]').click();
  await page.waitForTimeout(60);
  s = await S(page);
  check("rejecting keeps what was planned", !s.plan[0].applied.includes("cm-paneer") && !s.list.lines.some((l) => l.item === "paneer"));
  // Accept path: edit again
  await hash(page, "#/adapt/chana-masala/options");
  await page.locator('[data-action="preview-swap"][data-swap="cm-paneer"]').first().click().catch(() => {});
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mise-match:v1"));
    const v = Object.values(st.versions)[0];
    v.rev += 1;
    localStorage.setItem("mise-match:v1", JSON.stringify(st));
  });
  await reloadAt(page, "#/list");
  await click(page, '[data-action="plan-review-update"]');
  await page.locator('#sheet [data-action="plan-accept-update"]').click();
  await page.waitForTimeout(80);
  s = await S(page);
  check("accepting takes the update and regenerates", s.plan[0].applied.includes("cm-paneer") && s.list.lines.some((l) => l.item === "paneer"));
  const paneerSnapshot = s.plan[0].snapshot.ingredients.find((l) => l.slot === "paneer");
  check("the plan's snapshot was refreshed", paneerSnapshot?.entries[0].qty === 150, paneerSnapshot);
  // Historical record stays reproducible after a catalogue change
  const cook = s.cooks[0];
  check("the cooking record keeps its rules and amounts", cook.applied.join() === "cm-canned-tomatoes" && cook.snapshot.ingredients.find((l) => l.slot === "tomatoes").entries[0].qty === 300, cook.snapshot.ingredients.find((l) => l.slot === "tomatoes"));
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mise-match:v1"));
    st.cooks[0].applied = ["cm-retired"];
    st.cooks[0].snapshot.rules = [{ id: "cm-retired", rev: 1, label: "A retired rule" }];
    localStorage.setItem("mise-match:v1", JSON.stringify(st));
  });
  await reloadAt(page, "#/saved");
  check("a retired rule still shows its recorded name", /A retired rule/.test(await text(page)));
  await page.locator('[data-action="repeat-cook"]').first().click();
  await page.waitForTimeout(60);
  const c = await text(page);
  check("repeating it uses the recorded amounts, labelled", /catalogue changed since this was recorded/.test(c) && /A retired rule/.test(c), c.slice(0, 300));
  check("no errors", !page.errors.length, page.errors);
  await context.close();
});

await scenario(8, "Unsaved cook, make again; checklists don't mix and survive reload", async () => {
  const { context, page } = await fresh();
  await go(page, "#/adapt/chana-masala/options");
  await page.locator('[data-action="preview-swap"][data-swap="cm-spinach"]').first().click();
  await page.locator(".sheet-foot .btn--primary").click();
  await hash(page, "#/cook/chana-masala");
  await page.waitForTimeout(50);
  const box = (key) => page.locator(`[data-action="cook-check"][data-key="${key}"]`);
  await box("s:s1").check({ force: true });
  await box("s:s2").check({ force: true });
  await hash(page, "#/cook/masoor-dal");
  await page.waitForTimeout(50);
  check("switching recipes doesn't carry steps over", !(await box("s:s1").isChecked()) && !(await box("s:s2").isChecked()));
  await box("s:s3").check({ force: true });
  await page.reload();
  await page.waitForFunction(() => window.__miseBooted === true);
  check("reload keeps this recipe's progress", await box("s:s3").isChecked());
  await hash(page, "#/cook/chana-masala");
  await page.waitForTimeout(50);
  check("and the other recipe's", (await box("s:s1").isChecked()) && (await box("s:s2").isChecked()) && !(await box("s:s3").isChecked()));
  await shot(page, "s8-resume");
  check("says it resumed", /Resumed/.test(await text(page)));
  // Freeze: a change to the session doesn't alter what's being cooked
  await hash(page, "#/adapt/chana-masala/needs");
  await click(page, '[data-action="servings"][data-delta="-1"]');
  await hash(page, "#/cook/chana-masala");
  await page.waitForTimeout(50);
  const frozen = await text(page);
  check("cook mode is frozen at entry and says the version changed", /4 servings/.test(frozen) && /changed since you started cooking/.test(frozen), frozen.slice(0, 300));
  await click(page, '[data-action="finish-cooking"]');
  await page.waitForTimeout(50);
  await page.locator('#sheet input[name="again"][value="yes"]').check({ force: true });
  await page.locator('#sheet [data-action="save-feedback"]').click();
  await page.waitForTimeout(50);
  await page.keyboard.press("Escape");
  await hash(page, "#/");
  await page.waitForTimeout(40);
  const today = await text(page);
  await shot(page, "s8-make-again");
  check("an unsaved positive meal has a repeat destination", /Make it again/.test(today) && /Add frozen spinach/.test(today), today.slice(0, 300));
  // Discard the session, then repeat the exact snapshot
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mise-match:v1"));
    delete st.sessions["chana-masala"];
    localStorage.setItem("mise-match:v1", JSON.stringify(st));
  });
  await page.reload();
  await page.waitForFunction(() => window.__miseBooted === true);
  await page.locator('[data-action="repeat-cook"]').first().click();
  await page.waitForTimeout(60);
  const s = await S(page);
  check("repeat restores the exact rules and portions", s.sessions["chana-masala"].applied.join() === "cm-spinach" && s.sessions["chana-masala"].servings === 4, s.sessions["chana-masala"]);
  check("no errors", !page.errors.length, page.errors);
  await context.close();
});

await scenario(9, "Paste an import with everything awkward", async () => {
  const { context, page } = await fresh();
  await go(page, "#/import");
  const paste = "My dal\nIngredients\n1½ cups red lentils\n1 tbsp ginger garlic paste\n2 (400 g) cans chickpeas, drained\n200 g cooked basmati rice\n1/0 cup milk\nCoriander leaves, for garnish\n1 tsp kokum extract\nMethod\nCook the lentils.\nFinish with the kokum extract and coriander.";
  await page.fill('[data-action="import-text"]', paste);
  await page.click('[data-action="import-paste"] button[type="submit"]').catch(() => page.locator('form[data-action="import-paste"] button[type="submit"]').click());
  await page.waitForTimeout(40);
  await shot(page, "s9-preview");
  check("extraction preview before a draft exists", /Found “My dal”/.test(await text(page)) && !Object.keys((await S(page)).drafts).length);
  await click(page, '[data-action="import-pick"]');
  await page.waitForFunction(() => location.hash.startsWith("#/draft/"));
  await page.waitForTimeout(40);
  check("the draft has an h1 and a real title", (await page.locator("h1").innerText()) === "My dal" && (await page.title()) === "My dal · mise & match", await page.title());
  await shot(page, "s9-draft");
  const t = await text(page);
  check("missing yield isn't filled in", /doesn't say/.test(t) && /Needs: the number of servings/.test(t));
  check("original wording kept, including the invalid line", /1\/0 cup milk/.test(t));
  const did = page.url().split("/").pop();
  const lineOf = async (needle) => (await S(page)).drafts[did].lines.find((l) => l.raw.includes(needle));
  const row = (needle) => page.locator(".draft-line", { hasText: needle });
  // Yield
  await page.fill('[data-action="draft-servings"]', "4");
  await page.press('[data-action="draft-servings"]', "Tab");
  await page.waitForTimeout(30);
  // Compound: no way to resolve by picking one
  const compound = await lineOf("ginger garlic");
  check("compound stays compound", compound.match.confidence === "compound" && compound.issues.includes("compound"));
  check("compound offers no single-ingredient resolution", !(await row("ginger garlic").locator('select[data-action="draft-match"]').first().locator("option", { hasText: "Fresh ginger" }).count()) || /Keep as unknown/.test(await row("ginger garlic").innerText()));
  await row("ginger garlic").locator('[data-action="draft-keep-unknown"]').click();
  await page.waitForTimeout(30);
  // Drained
  const can = await lineOf("cans chickpeas");
  check("drained can asks instead of using 800 g", can.qty == null && can.pack.netTotal === 800 && can.issues.includes("drained-unknown"));
  await row("cans chickpeas").locator('[data-action="draft-drained"]').fill("480");
  await row("cans chickpeas").locator('[data-action="draft-drained"]').press("Tab");
  await page.waitForTimeout(30);
  const can2 = await lineOf("cans chickpeas");
  check("drained amount used once given", can2.qty === 480 && can2.pack.basis === "drained");
  // Cooked rice: state confirmation alone can't authorize dry values
  const rice = await lineOf("cooked basmati");
  check("cooked rice is a state mismatch", rice.issues.includes("state-mismatch"));
  check("mismatch has real actions", /Keep as unknown/.test(await row("cooked basmati").innerText()) && /Leave out of calculations/.test(await row("cooked basmati").innerText()));
  await row("cooked basmati").locator('[data-action="draft-keep-unknown"]').click();
  await page.waitForTimeout(30);
  // Invalid fraction
  check("invalid fraction flagged", (await lineOf("1/0")).issues.includes("invalid-quantity"));
  await row("1/0").locator('[data-action="draft-qty"]').first().fill("-3");
  await row("1/0").locator('[data-action="draft-qty"]').first().press("Tab");
  await page.waitForTimeout(30);
  check("repair is validated again", (await lineOf("1/0")).qty == null && (await page.locator(".field-error").count()) > 0);
  await row("1/0").locator('[data-action="draft-omit"]').first().click();
  await page.waitForTimeout(30);
  // Lentils state
  await row("red lentils").locator('[data-action="draft-state"][data-value="dry"]').first().click();
  await page.waitForTimeout(30);
  // Unknown ingredient
  await row("kokum").locator('[data-action="draft-keep-unknown"]').click();
  await page.waitForTimeout(30);
  // Garnish
  check("optional garnish doesn't block", (await lineOf("Coriander")).optional);
  const end = await text(page);
  await shot(page, "s9-repaired");
  check("nutrition is available but says it can't count unknown lines", /Estimate nutrition\.\s*Protein can't estimate/.test(end), end.match(/Estimate nutrition[^\n]*/)?.[0]);
  check("scaling is real and doesn't change the source yield", /Make for/.test(end));
  await click(page, '[data-action="draft-target"][data-delta="-1"]');
  await page.waitForTimeout(30);
  const d = (await S(page)).drafts[did];
  check("source yield stays 4 when target changes", d.servings === 4 && d.targetServings === 3, d.servings);
  check("scaled amounts are shown", /360 g for 3 servings/.test(await text(page)) || /360 g/.test(await row("cans chickpeas").innerText()), await row("cans chickpeas").innerText());
  // Edit path on a resolved row, with undo
  await row("cans chickpeas").locator('details summary:has-text("Edit")').click();
  await row("cans chickpeas").locator('[data-action="draft-remove"]').click();
  await page.waitForTimeout(30);
  check("every row has an edit path; removal is recoverable", (await lineOf("cans chickpeas")).removed === true);
  await page.locator('#toast [data-toast-action]').click();
  await page.waitForTimeout(30);
  check("undo puts it back", !(await lineOf("cans chickpeas")).removed);
  // Excluded stays in cook mode
  await hash(page, `#/cook/draft/${did}`);
  await page.waitForTimeout(40);
  const cook = await text(page);
  await shot(page, "s9-cook");
  check("left out of calculations stays in the recipe to cook", /1\/0 cup milk/.test(cook) && /not counted in estimates/.test(cook));
  // A draft saved as a reference survives
  await hash(page, `#/draft/${did}`);
  await click(page, '[data-action="draft-save-reference"]');
  await page.waitForTimeout(40);
  check("saved as a reference", (await S(page)).drafts[did].status === "reference");
  // Duplicate
  await hash(page, "#/import");
  await page.fill('[data-action="import-text"]', "Short\nIngredients\n100 g paneer\nMethod\nCook.");
  await page.locator('form[data-action="import-paste"] button[type="submit"]').click();
  await click(page, '[data-action="import-pick"]');
  await page.waitForFunction(() => location.hash.startsWith("#/draft/"));
  await hash(page, "#/import");
  await page.fill('[data-action="import-text"]', "Short\nIngredients\n100 g paneer\nMethod\nCook.");
  await page.locator('form[data-action="import-paste"] button[type="submit"]').click();
  await click(page, '[data-action="import-pick"]');
  await page.waitForTimeout(40);
  check("a duplicate import is a choice", (await page.locator("#sheet-title").innerText()) === "Already imported");
  await page.keyboard.press("Escape");
  // Literal HTML is harmless
  await page.fill('[data-action="import-text"]', 'X<img src=x onerror="window.__xss=1">\nIngredients\n<b>2 g paneer</b><script>window.__xss=1</script>\nMethod\n<img src=x onerror="window.__xss=1">');
  await page.locator('form[data-action="import-paste"] button[type="submit"]').click();
  await click(page, '[data-action="import-pick"]');
  await page.waitForFunction(() => location.hash.startsWith("#/draft/"));
  await page.waitForTimeout(100);
  check("literal HTML is text", !(await page.evaluate(() => window.__xss)) && /<img src=x/.test(await text(page)));
  // Link fallback keeps the URL; labels before selection
  await hash(page, "#/import");
  const tabs = await page.locator(".view-toggle").innerText();
  check("limits labelled before selection", /Link \(demo only\)/.test(tabs) && /Screenshot \(unavailable\)/.test(tabs));
  await click(page, '[data-action="import-tab"][data-tab="link"]');
  await page.fill('[data-action="import-url"]', "https://www.example.org/really/long/recipe");
  await page.locator('form[data-action="import-link"] button[type="submit"]').click();
  await page.waitForTimeout(30);
  await click(page, '[data-action="import-to-paste"]');
  await page.waitForTimeout(30);
  check("a link that can't be read is kept", /Source link kept: https:\/\/www\.example\.org/.test(await text(page)));
  check("no errors", !page.errors.length, page.errors);
  await context.close();
});

await scenario(10, "Empty, failed, corrupt and concurrent states all have a next action", async () => {
  // Empties
  {
    const { context, page } = await fresh();
    await go(page, "#/recipes");
    await page.fill('[data-action="recipe-search"]', "zzzzz");
    await page.waitForTimeout(30);
    check("no-match search has a next action", /Clear search/.test(await text(page)));
    await page.fill('[data-action="recipe-search"]', "palak");
    await page.waitForTimeout(30);
    check("recipe search uses the shared aliases", /Chana palak/.test(await text(page)));
    await hash(page, "#/pantry");
    check("all-not-checked pantry explains itself", /not as missing/.test(await text(page)));
    await page.fill('[data-action="pantry-search"]', "chana");
    await page.press('[data-action="pantry-search"]', "Enter");
    await page.waitForTimeout(30);
    check("Enter doesn't add an ambiguous match", !Object.keys((await S(page)).pantry).length && /Choose one/.test(await text(page)));
    await page.fill('[data-action="pantry-search"]', "palak");
    await page.waitForTimeout(30);
    check("regional search finds it", /Fresh spinach/.test(await text(page)));
    await page.press('[data-action="pantry-search"]', "Enter");
    await page.waitForTimeout(30);
    check("Enter adds an exact alias", !!(await S(page)).pantry["spinach-fresh"]);
    await page.fill('[data-action="pantry-search"]', "my special pickle");
    await page.waitForTimeout(30);
    await page.press('[data-action="pantry-search"]', "Enter");
    await page.waitForTimeout(30);
    check("Enter doesn't turn free text into an item", !(await S(page)).pantry["free:my special pickle"]);
    await click(page, '[data-action="pantry-add-free"]');
    await page.waitForTimeout(30);
    await page.locator('.line:has-text("my special pickle") summary').click();
    check("free text has a match path", (await page.locator('[data-action="pantry-match-free"]').count()) === 1);
    await hash(page, "#/saved");
    const emptyish = await text(page);
    check("saved says it's on this device only", /this device only/.test(emptyish));
    // All shopping pending confirmation
    await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("mise-match:v1"));
      localStorage.setItem("mise-match:v1", JSON.stringify(st));
    });
    await hash(page, "#/adapt/masala-chai/shop");
    for (const item of ["milk", "black-tea", "ginger"]) await page.selectOption(`#have-${item}`, "have").catch(() => {});
    await page.waitForTimeout(30);
    await click(page, '[data-action="add-plan"]');
    await page.waitForTimeout(60);
    await hash(page, "#/list");
    const pending = await text(page);
    await shot(page, "s10-pending");
    check("pending checks never read as complete", /isn't final/.test(pending) && !/Nothing to buy for your planned meals/.test(pending), pending.slice(0, 200));
    for (const b of await page.locator('[data-action="confirm"][data-value="enough"]').all()) await page.locator('[data-action="confirm"][data-value="enough"]').first().click().catch(() => {});
    await page.waitForTimeout(60);
    check("no errors", !page.errors.length, page.errors);
    await context.close();
  }
  // Deleted version route, malformed routes
  {
    const { context, page } = await fresh();
    await go(page, "#/cook/chana-masala/v/does-not-exist");
    check("missing version: recoverable error", /Can't open that/.test(await text(page)) && (await page.title()).includes("Can't open"));
    await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("mise-match:v1") ?? "null") ?? {};
      st.versions = { v1: { id: "v1", recipeId: "masoor-dal", servings: 4, applied: [], name: "Dal", rev: 1 } };
      st.version = 3;
      localStorage.setItem("mise-match:v1", JSON.stringify(st));
    });
    await page.goto(`${base}/#/cook/chana-masala/v/v1`);
    await page.reload();
    await page.waitForFunction(() => window.__miseBooted === true);
    const msg = await text(page);
    check("mismatched recipe and version: no hybrid, says why", /belongs to Masoor dal tadka/.test(msg), msg.slice(0, 200));
    for (const bad of ["#/cook/nope", "#/cook/chana-masala/whatever/x", "#/draft/nope", "#/adapt/nope", "#/%%%", "#/recipe/"]) {
      await page.goto(`${base}/${bad}`).catch(() => {});
      await page.reload();
      await page.waitForFunction(() => window.__miseBooted === true);
      check(`malformed route ${bad} has an h1 and a way back`, (await page.locator("h1").count()) === 1 && (await page.locator("#app a").count()) > 0);
    }
    check("no errors", !page.errors.length, page.errors);
    await context.close();
  }
  // Failed image
  {
    const { context, page } = await fresh();
    await page.route(/channa-masala-01/, (r) => r.abort());
    await go(page, "#/recipe/chana-masala");
    await page.waitForTimeout(150);
    check("failed image becomes the same tile", (await page.locator(".photo--none .tile-initials").count()) === 1 && !(await page.locator(".credit").count()));
    const box = await page.locator(".photo--hero").boundingBox();
    check("tile keeps its ratio", box.height > 100, box);
    await shot(page, "s10-failed-image");
    await context.close();
  }
  // Failed font
  {
    const { context, page } = await fresh();
    await page.route(/\.woff2/, (r) => r.abort());
    await go(page, "#/");
    await page.waitForTimeout(100);
    check("failed font falls back and the page still works", (await page.locator("h1").isVisible()) && (await page.evaluate(() => getComputedStyle(document.body).fontFamily)).includes("Helvetica"));
    await context.close();
  }
  // Failed module
  {
    const { context, page } = await fresh();
    await page.route(/js\/core\/units\.js/, (r) => r.abort());
    await page.goto(`${base}/#/`);
    await page.waitForTimeout(600);
    await shot(page, "s10-failed-module");
    const t = await text(page);
    check("failed module shows a recoverable message", /couldn't load/.test(t) && (await page.locator('#app a').count()) === 1, t);
    await context.close();
  }
  // Blocked storage
  {
    const { context, page } = await fresh();
    await page.addInitScript(() => {
      const fail = () => { throw new DOMException("denied", "SecurityError"); };
      Object.defineProperty(window, "localStorage", { get: fail });
    });
    await go(page, "#/adapt/chana-masala/needs");
    await click(page, '[data-action="servings"][data-delta="-1"]');
    await page.waitForTimeout(30);
    await shot(page, "s10-blocked");
    const n = await text(page, "#notices");
    check("blocked storage: persistent, unobtrusive notice with retry", /temporary on this device/.test(n) && /Try again/.test(n), n);
    await click(page, '[data-action="save-version"]');
    await page.locator('#sheet [data-action="confirm-save-version"]').first().click();
    await page.waitForTimeout(50);
    const toast = await text(page, "#toast");
    check("never announces a durable save after failure", /for this visit only/.test(toast) && !/^Saved “[^”]*”$/.test(toast.trim()), toast);
    check("no crash", !page.errors.length, page.errors);
    await context.close();
  }
  // Quota
  {
    const { context, page } = await fresh();
    await go(page, "#/");
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException("full", "QuotaExceededError"); }; });
    await hash(page, "#/adapt/chana-masala/needs");
    await click(page, '[data-action="servings"][data-delta="-1"]');
    await page.waitForTimeout(30);
    check("full storage: same notice", /temporary on this device/.test(await text(page, "#notices")));
    await context.close();
  }
  // Corrupt and future
  for (const [kind, raw] of [["corrupt", "{oops"], ["future", JSON.stringify({ version: 99, plan: [{ precious: 1 }] })]]) {
    const { context, page } = await fresh();
    await page.goto(`${base}/#/`);
    await page.evaluate((r) => localStorage.setItem("mise-match:v1", r), raw);
    await page.reload();
    await page.waitForFunction(() => window.__miseBooted === true);
    await shot(page, `s10-${kind}`);
    const n = await text(page, "#notices");
    check(`${kind} data: says so, offers recovery`, /See and copy the data/.test(n) && /Start fresh/.test(n), n);
    await hash(page, "#/adapt/chana-masala/needs");
    await click(page, '[data-action="servings"][data-delta="-1"]');
    await page.waitForTimeout(30);
    check(`${kind} data isn't overwritten by using the app`, (await page.evaluate(() => localStorage.getItem("mise-match:v1"))) === raw);
    await hash(page, "#/recovery");
    await page.waitForTimeout(30);
    check(`${kind}: the original text can be exported`, (await page.locator("#recovery-text").inputValue()) === raw);
    check(`${kind}: quarantined copy exists`, (await page.evaluate((k) => localStorage.getItem(`mise-match:quarantine:${k}`), kind)) === raw);
    await click(page, '[data-action="accept-fresh"]');
    await page.waitForTimeout(40);
    check(`${kind}: start fresh is explicit and keeps the copy`, (await page.evaluate((k) => localStorage.getItem(`mise-match:quarantine:${k}`), kind)) === raw && !(await text(page, "#notices")).includes("Start fresh"));
    check("no errors", !page.errors.length, page.errors);
    await context.close();
  }
  // Bad records
  {
    const { context, page } = await fresh();
    await page.goto(`${base}/#/`);
    await page.evaluate(() => localStorage.setItem("mise-match:v1", JSON.stringify({ version: 2, sessions: { x: { recipeId: "gone", servings: 2, applied: [] } }, plan: [{ id: "p", recipeId: "chana-masala", servings: 4, applied: [] }, null], pantry: { onion: {}, ghost: {} }, cooks: 5 })));
    await page.reload();
    await page.waitForFunction(() => window.__miseBooted === true);
    const n = await text(page, "#notices");
    check("malformed records are skipped with an explanation", /couldn't be used/.test(n), n);
    const s = await S(page);
    check("good records survive", s.plan.length === 1 && !!s.pantry.onion);
    for (const r of ["#/", "#/recipes", "#/pantry", "#/list", "#/saved", "#/plan", "#/profile"]) {
      await hash(page, r);
      if (await page.locator("h1").innerText() === "Something went wrong on this screen") check(`route ${r} rendered`, false);
    }
    await hash(page, "#/saved");
    check("skipped records are listed", /Records we couldn't open/.test(await text(page)));
    check("no errors", !page.errors.length, page.errors);
    await context.close();
  }
  // Two tabs
  {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const a = await context.newPage();
    const b = await context.newPage();
    await go(a, "#/pantry");
    await go(b, "#/pantry");
    await a.fill('[data-action="pantry-search"]', "paneer");
    await click(a, '[data-action="pantry-add"][data-item="paneer"]');
    await a.waitForTimeout(100);
    await b.waitForTimeout(200);
    const notice = await text(b, "#notices");
    check("other tab sees the change", /Changed in another tab/.test(notice), notice);
    // b tries to write
    await b.fill('[data-action="pantry-search"]', "onion");
    await click(b, '[data-action="pantry-add"][data-item="onion"]');
    await b.waitForTimeout(60);
    const stored = await a.evaluate(() => JSON.parse(localStorage.getItem("mise-match:v1")).pantry);
    check("b didn't overwrite a's change", !!stored.paneer && !stored.onion, Object.keys(stored));
    await click(b, '[data-action="tab-review"]');
    await b.waitForTimeout(60);
    await b.screenshot({ path: join(out, "s10-tabs.png"), fullPage: true });
    check("the conflict is reviewable", /Pantry items/.test(await text(b, "#sheet")));
    await b.locator('#sheet [data-action="tab-use-theirs"]').click();
    await b.waitForTimeout(60);
    check("using the other tab's loads it", !!(await S(b)).pantry.paneer && !(await S(b)).pantry.onion);
    await b.fill('[data-action="pantry-search"]', "onion");
    await click(b, '[data-action="pantry-add"][data-item="onion"]');
    await b.waitForTimeout(100);
    const merged = await a.evaluate(() => JSON.parse(localStorage.getItem("mise-match:v1")).pantry);
    check("saving works again after choosing", !!merged.paneer && !!merged.onion);
    await context.close();
  }
});

await scenario(12, "Photos in color across every media context; controls unchanged", async () => {
  const { context, page } = await fresh();
  await go(page, "#/");
  const scan = () => page.evaluate(() => [...document.querySelectorAll("img:not(.icon)")].map((i) => ({ src: i.src.split("/").pop(), filter: getComputedStyle(i).filter, opacity: getComputedStyle(i).opacity, parent: getComputedStyle(i.closest(".photo") ?? i).filter, w: i.getAttribute("width"), h: i.getAttribute("height") })));
  const all = [];
  const routes = ["#/", "#/recipes", "#/recipe/chana-masala", "#/recipe/paneer-butter-masala", "#/saved"];
  for (const r of routes) {
    await hash(page, r);
    await page.waitForTimeout(40);
    all.push(...await scan());
  }
  check("every photo has no filter, full opacity and intrinsic dimensions", all.length > 5 && all.every((x) => x.filter === "none" && x.opacity === "1" && x.parent === "none" && x.w && x.h), all.filter((x) => x.filter !== "none" || !x.w));
  // Hover, saved, selected and disabled contexts don't desaturate
  await hash(page, "#/recipes");
  await page.locator(".recipe-row").first().hover();
  check("hover doesn't filter", (await scan()).every((x) => x.filter === "none"));
  // Saved and continuing contexts
  await page.goto(`${base}/#/adapt/chana-masala/needs`);
  await page.waitForFunction(() => window.__miseBooted === true);
  await click(page, '[data-action="servings"][data-delta="-1"]');
  await click(page, '[data-action="save-version"]');
  await page.locator('#sheet [data-action="confirm-save-version"]').first().click();
  await page.waitForTimeout(50);
  for (const r of ["#/saved", "#/"]) {
    await hash(page, r);
    await page.waitForTimeout(100);
    const seen = await scan();
    check(`${r}: version thumbnails stay in color`, seen.length > 0 && seen.every((x) => x.filter === "none"), seen.length);
    await shot(page, `s12${r === "#/" ? "-today" : "-saved"}`);
  }
  // Rendered pixels are actually colored
  await hash(page, "#/recipe/chana-masala");
  await page.waitForTimeout(250);
  const spread = await page.evaluate(() => { const i = document.querySelector(".photo img"); const c = document.createElement("canvas"); c.width = c.height = 32; const x = c.getContext("2d"); x.drawImage(i, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += Math.max(d[k], d[k + 1], d[k + 2]) - Math.min(d[k], d[k + 1], d[k + 2]); return s / (d.length / 4); });
  check("source pixels are in color", spread > 15, Math.round(spread));
  // Icon inversion stays
  const inv = await page.evaluate(() => { const p = document.querySelector(".btn--primary .icon"); return p ? getComputedStyle(p).filter : getComputedStyle(document.documentElement).getPropertyValue("--icon-on-fill"); });
  check("icon inversion kept", /invert/.test(inv), inv);
  // Fallback tile and credit
  await hash(page, "#/recipe/masoor-dal");
  await page.waitForTimeout(30);
  check("a dish with no photo shows the tile, with no credit", (await page.locator(".photo--none").count()) === 1 && !(await page.locator(".credit").count()));
  await hash(page, "#/recipe/chana-masala");
  await page.waitForTimeout(30);
  check("credit stays honest", (await text(page, ".credit")) === "Photo: Pexels, page link pending");
  // Interface colors remain black and white
  const nonBW = await page.evaluate(() => {
    const bad = new Set();
    const ok = /^rgba?\((0, 0, 0|255, 255, 255)(, (1|0))?\)$|^rgba\(0, 0, 0, 0\)$/;
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest("figure,img")) continue;
      const cs = getComputedStyle(el);
      for (const p of ["color", "backgroundColor", "borderTopColor"]) if (!ok.test(cs[p])) bad.add(`${el.tagName}.${el.className}:${p}:${cs[p]}`);
    }
    return [...bad].slice(0, 10);
  });
  check("everything else is still black and white", !nonBW.length, nonBW);
  await context.close();
});

await browser.close();
const failed = results.filter((r) => !r.pass);
writeFileSync(join(out, "acceptance.json"), JSON.stringify({ base, browser: `Chrome ${version}`, at: new Date().toISOString(), results }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} checks passed (Chrome ${version})`);
for (const f of failed) console.log(`  FAIL [${f.scenario}] ${f.name}: ${f.detail}`);
