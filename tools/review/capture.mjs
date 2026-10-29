// Review evidence: screenshots of the main screens at several viewports, a
// recorded walkthrough of the demo journey, and machine-checked results.
//
//   node capture.mjs --label before|after --out ../../reviews/<dated-folder> [--video] [--base http://localhost:8080]
//
// Uses the installed Google Chrome (channel "chrome"), so no browser download is needed.
// Each viewport runs in a fresh browser context, i.e. fresh localStorage.

import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, renameSync, rmSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
    return acc;
  }, []),
);
const label = args.label ?? "after";
const out = resolve(args.out ?? join(repo, "reviews", `${new Date().toISOString().slice(0, 10)}-review`));
const base = args.base ?? "http://localhost:8080";
const VIEWPORTS = [
  { name: "phone-430x932", width: 430, height: 932, mobile: true },
  { name: "small-360x740", width: 360, height: 740, mobile: true },
  { name: "desktop-1280x860", width: 1280, height: 860, mobile: false },
];

const git = (...a) => execFileSync("git", a, { cwd: repo }).toString().trim();
// The tested revision: HEAD, flagged if the app itself (not this tooling) has uncommitted changes.
const revision = `${git("rev-parse", "--short", "HEAD")}${git("status", "--porcelain", "--", ".", ":!reviews", ":!tools", ":!.gitignore") ? " + uncommitted app changes" : ""}`;

async function ensureServer() {
  try {
    await fetch(base);
    return null;
  } catch {
    const child = spawn("node", ["scripts/serve.mjs"], { cwd: repo, stdio: "ignore" });
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150));
      try {
        await fetch(base);
        return child;
      } catch {}
    }
    throw new Error(`No server at ${base}`);
  }
}

const results = [];
const record = (scenario, viewport, pass, detail = "") => results.push({ scenario, viewport, pass, detail });

async function pageChecks(page, vp, scenario, errors) {
  const c = await page.evaluate(() => {
    const doc = document.documentElement;
    const a = document.activeElement;
    const cs = a ? getComputedStyle(a) : null;
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      focused: a ? `${a.tagName.toLowerCase()}${a.id ? "#" + a.id : ""}` : "",
      focusOutline: cs ? `${cs.outlineStyle} ${cs.outlineWidth}` : "",
      fontLoaded: document.fonts.check('16px "Apfel Grotezk"') && [...document.fonts].some((f) => f.family.includes("Apfel") && f.status === "loaded"),
    };
  });
  record(`${scenario}: no horizontal overflow`, vp.name, c.overflowX <= 1, `overflow ${c.overflowX}px`);
  record(`${scenario}: Apfel Grotezk loaded`, vp.name, c.fontLoaded);
  if (c.focusOutline && !c.focusOutline.startsWith("none") && c.focused !== "body") {
    record(`${scenario}: no visible focus ring without keyboard use`, vp.name, false, `${c.focused} has outline ${c.focusOutline}`);
  } else {
    record(`${scenario}: no visible focus ring without keyboard use`, vp.name, true, c.focused ? `active: ${c.focused}` : "");
  }
  record(`${scenario}: no console errors`, vp.name, errors.length === 0, errors.join(" | "));
}

const visible = (page, sel) => page.locator(sel).locator("visible=true").first();

async function shoot(page, dir, name, fullPage = true) {
  await page.waitForTimeout(350); // let sheet/toast animations settle
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage });
}

async function screens(browser, vp) {
  const dir = join(out, label, vp.name);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: vp.mobile, hasTouch: vp.mobile });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${base}/#/`);
  await page.waitForSelector("h1");
  await page.evaluate(() => document.fonts.ready);
  await shoot(page, dir, "01-home-fresh");
  await pageChecks(page, vp, "home, fresh storage", errors);

  await page.goto(`${base}/#/recipe/chana-masala`);
  await page.waitForSelector("h1");
  await shoot(page, dir, "02-recipe-top", false);
  await pageChecks(page, vp, "recipe, after navigation", errors);

  // Adapt: portions, availability with a partial amount, swap preview, apply.
  await visible(page, '[data-action="servings"][data-delta="-1"]').click();
  await visible(page, '[data-action="servings"][data-delta="-1"]').click();
  await page.locator('input[data-action="avail"][data-item="chickpeas"][value="have"]').check({ force: true });
  await page.locator('input[data-action="avail"][data-item="basmati"][value="some"]').check({ force: true });
  const qty = page.locator('input[data-action="avail-qty"][data-item="basmati"]');
  await qty.fill("100");
  await qty.press("Tab");
  await visible(page, '[data-action="open-swaps"][data-slot="tomatoes"]').click();
  await page.locator('.option[data-swap="cm-canned-tomatoes"]').click();
  await shoot(page, dir, "03-swap-preview", false);
  await page.locator(".sheet-foot .btn--primary").click();
  await visible(page, '[data-action="preview-swap"][data-swap="cm-paneer"]').click();
  await page.locator(".sheet-foot .btn--primary").click();
  await page.waitForTimeout(6500); // let the toast clear
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, dir, "04-recipe-adapted");
  await pageChecks(page, vp, "recipe, adapted", errors);

  await visible(page, '[data-action="sync-list"]').click();
  await page.goto(`${base}/#/list`);
  await page.waitForSelector("h1");
  const rice = page.locator(".line", { hasText: "basmati" }).locator('input[data-action="list-qty"]');
  await rice.fill("100");
  await rice.press("Tab");
  await page.locator('.add-item input[name="name"]').fill("Mango");
  await page.locator('.add-item input[name="qty"]').fill("2");
  await page.locator('.add-item button[type="submit"]').click();
  await page.waitForTimeout(6500);
  await page.evaluate(() => document.activeElement?.blur()); // the Tab above was intentional keyboard use
  await shoot(page, dir, "05-list-populated");
  await pageChecks(page, vp, "grocery list, populated", errors);

  await context.close();

  const empty = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: vp.mobile, hasTouch: vp.mobile });
  const p2 = await empty.newPage();
  const errors2 = [];
  p2.on("pageerror", (e) => errors2.push(e.message));
  await p2.goto(`${base}/#/list`);
  await p2.waitForSelector("h1");
  await shoot(p2, dir, "06-list-empty");
  await pageChecks(p2, vp, "grocery list, empty", errors2);
  await empty.close();
}

async function walkthrough(browser) {
  const dir = join(out, label, "video");
  mkdirSync(dir, { recursive: true });
  const size = { width: 430, height: 932 };
  const context = await browser.newContext({ viewport: size, recordVideo: { dir, size }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const pause = (ms = 900) => page.waitForTimeout(ms);
  const vp = { name: "walkthrough-430x932" };

  await page.goto(`${base}/#/`);
  await page.waitForSelector("h1");
  await pause(1500);
  // Keyboard: the first Tab should land on the skip link, visibly.
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => ({ cls: document.activeElement.className, outline: getComputedStyle(document.activeElement).outlineStyle, top: document.activeElement.getBoundingClientRect().top }));
  record("keyboard: first Tab shows skip link", vp.name, skip.cls.includes("skip-link") && skip.top >= 0, JSON.stringify(skip));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  const skipped = await page.evaluate(() => ({ id: document.activeElement.id, outline: getComputedStyle(document.activeElement).outlineStyle, hash: location.hash }));
  record("keyboard: skip link moves focus to content, keeps the route, no ring on main", vp.name,
    skipped.id === "app" && skipped.outline === "none" && skipped.hash === "#/", JSON.stringify(skipped));
  await pause();

  // Keyboard navigation: the new page's title takes focus and shows a compact ring.
  await page.focus(`a[href="#/recipe/chana-masala"]`);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.title.startsWith("Chana masala"));
  const kb = await page.evaluate(() => ({ tag: document.activeElement.tagName, outline: getComputedStyle(document.activeElement).outlineStyle }));
  record("keyboard navigation: title focused with visible ring", vp.name, kb.tag === "H1" && kb.outline === "solid", JSON.stringify(kb));
  await pause();

  // Pointer navigation: focus still moves to the title for screen readers, with no ring.
  await page.locator('nav a[href="#/"]').click();
  await page.waitForSelector("h1");
  await pause(600);
  await page.locator(`a[href="#/recipe/chana-masala"]`).first().click();
  await page.waitForFunction(() => document.title.startsWith("Chana masala")); // wait for the route render, not the old page's h1
  const pt = await page.evaluate(() => ({ tag: document.activeElement.tagName, outline: getComputedStyle(document.activeElement).outlineStyle }));
  record("pointer navigation: title focused, no ring", vp.name, pt.tag === "H1" && pt.outline === "none", JSON.stringify(pt));
  await pause();
  await visible(page, '[data-action="servings"][data-delta="-1"]').click();
  await pause(500);
  await visible(page, '[data-action="servings"][data-delta="-1"]').click();
  await pause();
  const servings = await visible(page, ".stepper output").textContent();
  record("portions: 4 → 2", vp.name, servings.trim() === "2", `shows ${servings.trim()}`);

  await page.locator('input[data-action="avail"][data-item="basmati"][value="some"]').scrollIntoViewIfNeeded();
  await page.locator('input[data-action="avail"][data-item="basmati"][value="some"]').check({ force: true });
  const qty = page.locator('input[data-action="avail-qty"][data-item="basmati"]');
  await qty.fill("100");
  await qty.press("Tab");
  await pause();

  await visible(page, '[data-action="open-swaps"][data-slot="tomatoes"]').click();
  await pause();
  await page.locator('.option[data-swap="cm-canned-tomatoes"]').click();
  await pause(1500);
  const preview = await page.locator(".sheet-body").innerText();
  record("swap preview shows quantity, flavor, texture, prep and method", vp.name,
    ["Flavor", "Texture", "Prep", "Step"].every((w) => preview.includes(w)) && /200 g canned tomatoes/.test(preview), "");
  await page.locator(".sheet-body").evaluate((el) => el.scrollTo({ top: 400, behavior: "smooth" }));
  await pause(1200);
  // Dismiss with Escape, focus should return to the Swap button.
  await page.keyboard.press("Escape");
  await pause(600);
  const back = await page.evaluate(() => document.activeElement?.dataset?.slot ?? "");
  record("dialog: Escape closes and focus returns to trigger", vp.name, back === "tomatoes", `focus on slot ${back}`);
  await visible(page, '[data-action="open-swaps"][data-slot="tomatoes"]').click();
  await page.locator('.option[data-swap="cm-canned-tomatoes"]').click();
  await pause();
  await page.locator(".sheet-foot .btn--primary").click();
  await pause(1200);

  await visible(page, '[data-action="preview-swap"][data-swap="cm-paneer"]').scrollIntoViewIfNeeded();
  await pause(600);
  await visible(page, '[data-action="preview-swap"][data-swap="cm-paneer"]').click();
  await pause(1200);
  await page.locator(".sheet-foot .btn--primary").click();
  await pause(1000);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await pause(1000);
  const before = await page.locator(".change-list li").count();
  await visible(page, '[data-action="remove-swap"][data-swap="cm-paneer"]').click();
  await pause(1200);
  const after = await page.locator(".change-list li").count();
  record("undo: removing Add paneer leaves the tomato swap", vp.name, before === 2 && after === 1, `${before} → ${after} changes`);

  await visible(page, '[data-action="sync-list"]').click();
  await pause(1200);
  await page.locator('nav a[href="#/list"]').click();
  await page.waitForSelector("h1");
  await pause();
  const riceLine = page.locator(".line", { hasText: "basmati" });
  const riceQty = await riceLine.locator('input[data-action="list-qty"]').inputValue();
  record("list: rice is 150 − 100 = 50 g", vp.name, riceQty === "50", `rice ${riceQty}`);
  await riceLine.locator('input[data-action="list-qty"]').fill("100");
  await riceLine.locator('input[data-action="list-qty"]').press("Tab");
  await pause();
  await page.locator('.add-item input[name="name"]').fill("Mango");
  await page.locator('.add-item button[type="submit"]').click();
  await pause(1200);

  await page.reload();
  await page.waitForSelector("h1");
  await pause(1200);
  const persisted = await page.evaluate(() => ({
    rice: [...document.querySelectorAll(".line")].find((l) => l.innerText.includes("basmati"))?.querySelector('input[data-action="list-qty"]').value,
    mango: document.body.innerText.includes("Mango"),
  }));
  record("reload: list edit and manual item persist", vp.name, persisted.rice === "100" && persisted.mango, JSON.stringify(persisted));
  await page.locator('nav a[href="#/"]').click();
  await page.waitForSelector("h1");
  await pause();
  await page.locator(`a[href="#/recipe/chana-masala"]`).first().click();
  await page.waitForSelector("h1");
  await pause(1200);
  const kept = await page.evaluate(() => ({
    servings: [...document.querySelectorAll(".stepper output")].find((o) => o.offsetParent)?.textContent,
    changes: [...document.querySelectorAll(".change-list li")].map((l) => l.innerText.split("\n")[0]),
  }));
  record("reload: adapted version persists", vp.name, kept.servings === "2" && kept.changes.length === 1, JSON.stringify(kept));
  await pageChecks(page, vp, "walkthrough end", errors);

  const video = page.video();
  await context.close();
  const webm = await video.path();
  const mp4 = join(dir, "walkthrough-430x932.mp4");
  execFileSync(ffmpegPath, ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  renameSync(webm, join(dir, "walkthrough-430x932.webm"));
  for (const f of readdirSync(dir)) if (f.endsWith(".webm") && f !== "walkthrough-430x932.webm") rmSync(join(dir, f));
  return mp4;
}

const server = await ensureServer();
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const vp of VIEWPORTS) await screens(browser, vp);
  if (args.video) await walkthrough(browser);
} finally {
  await browser.close();
  server?.kill();
}

const summary = { label, revision, base, capturedAt: new Date().toISOString(), viewports: VIEWPORTS, results };
mkdirSync(join(out, label), { recursive: true });
writeFileSync(join(out, label, "results.json"), JSON.stringify(summary, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`${label} @ ${revision}: ${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`  FAIL [${f.viewport}] ${f.scenario}: ${f.detail}`);
