// Review evidence: screenshots of the main screens at several viewports, a
// recorded walkthrough of the demo journey, and machine-checked results.
//
//   node capture.mjs --label before|after --out ../../reviews/<dated-folder> [--video] [--base http://localhost:8080] [--revision <sha>]
//
// Uses the installed Google Chrome (channel "chrome"), so no browser download is needed.
// Each viewport runs in a fresh browser context, i.e. fresh localStorage.

import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
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
// --revision names it explicitly when --base serves another checkout (e.g. a worktree of an older commit).
const revision = args.revision ?? `${git("rev-parse", "--short", "HEAD")}${git("status", "--porcelain", "--", ".", ":!reviews", ":!tools", ":!.gitignore") ? " + uncommitted app changes" : ""}`;

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
  if (label !== "before") {
    // Pushed screen: no tab bar on small screens; header navigation stays on wide ones.
    const navShown = await page.locator("#nav").isVisible();
    record("recipe is a pushed screen (tab bar hidden on small, header nav on wide)", vp.name, navShown === !vp.mobile, `nav visible: ${navShown}`);
  }

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
  if (label !== "before") {
    await page.locator(".line", { hasText: "Onion" }).locator('input[type="checkbox"]').check();
    await page.waitForTimeout(300);
  }
  await shoot(page, dir, "05-list-populated");
  await pageChecks(page, vp, "grocery list, populated", errors);

  if (label !== "before") {
    await page.goto(`${base}/#/pantry`);
    await page.waitForSelector("h1");
    await shoot(page, dir, "07-pantry");
    await pageChecks(page, vp, "pantry", errors);
    await page.goto(`${base}/#/`);
    await page.waitForSelector("h1");
    await page.locator('[data-action="set-mode"][data-mode="have"]').click();
    await page.waitForTimeout(300);
    await shoot(page, dir, "08-use-what-you-have");
    await pageChecks(page, vp, "recipes, use what you have", errors);
    await page.locator(".avatar").click();
    await page.waitForFunction(() => document.title.startsWith("Profile"));
    await shoot(page, dir, "09-profile");
    await pageChecks(page, vp, "profile and settings", errors);
  }

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
  // Recorded as timed page screenshots rather than Playwright's recordVideo: with
  // installed Chrome, recordVideo scaled frames into a smaller area with a grey band.
  const context = await browser.newContext({ viewport: size });
  const page = await context.newPage();
  const framesDir = join(dir, "frames");
  mkdirSync(framesDir, { recursive: true });
  const frames = [];
  let recording = true;
  const recorder = (async () => {
    while (recording) {
      const file = join(framesDir, `${String(frames.length).padStart(5, "0")}.jpg`);
      try {
        await page.screenshot({ path: file, type: "jpeg", quality: 85 });
        frames.push({ file, t: Date.now() });
      } catch {
        await new Promise((r) => setTimeout(r, 50)); // e.g. mid-reload
      }
    }
  })();
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
  await page.locator('.back-link').click();
  await page.waitForFunction(() => document.title === "mise & match");
  await pause(600);
  // Keyboard order on a primary screen: skip link, wordmark, the three tabs, avatar, then content.
  await page.evaluate(() => document.activeElement.blur());
  const order = [];
  await page.focus(".skip-link");
  for (let i = 0; i < 6; i++) {
    order.push(await page.evaluate(() => {
      const a = document.activeElement;
      return a.getAttribute("aria-label") ?? a.textContent.trim().replace(/\s+/g, " ");
    }));
    await page.keyboard.press("Tab");
  }
  order.push(await page.evaluate(() => document.activeElement.dataset.action ?? document.activeElement.tagName));
  record("keyboard: focus order skip link, wordmark, tabs, avatar, search", vp.name,
    order.join(" > ") === "Skip to content > mise & match, Recipes > Recipes > Grocery list > Pantry > Profile and settings > recipe-search", order.join(" > "));
  await page.mouse.click(5, 300);

  // Find it: search by ingredient, then Use what you have (empty pantry says what to do next).
  await page.locator('[data-action="recipe-search"]').pressSequentially("chickpea", { delay: 60 });
  await pause();
  const found = await page.locator(".recipe-card-title, .collection-title").allInnerTexts();
  record("search: 'chickpea' finds the chickpea recipes", vp.name, found.includes("Chana masala") && found.includes("Chana palak") && !found.includes("Tomato and egg stir-fry"), found.join(", "));
  await page.locator('[data-action="set-mode"][data-mode="have"]').click();
  await pause(1200);
  await page.locator('[data-action="set-mode"][data-mode="all"]').click();
  await page.locator('[data-action="recipe-search"]').fill("");
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

  // See it in Pantry, then come back to the recipe.
  await page.locator(".back-link").click();
  await page.waitForFunction(() => document.title === "mise & match");
  await page.locator('nav a[href="#/pantry"]').click();
  await page.waitForFunction(() => document.title.startsWith("Pantry"));
  await pause(1500);
  const riceRow = await page.locator(".pantry-line", { hasText: "basmati" }).locator('input[data-action="pantry-qty"]').inputValue();
  record("pantry: rice Some 100 g from the recipe shows in Pantry", vp.name, riceRow === "100", `rice ${riceRow}`);
  await page.locator('nav a[href="#/"]').click();
  await page.waitForFunction(() => document.title === "mise & match");
  await page.locator(`a[href="#/recipe/chana-masala"]`).first().click();
  await page.waitForFunction(() => document.title.startsWith("Chana masala"));
  await pause();

  await visible(page, '[data-action="open-swaps"][data-slot="tomatoes"]').click();
  await pause();
  const sheetTitle = await page.locator("#sheet-title").innerText();
  record("swap sheet title", vp.name, sheetTitle === "Thyme for a swap.", sheetTitle);
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
  await page.locator(".back-link").click();
  await page.waitForFunction(() => document.title === "mise & match");
  await page.locator('nav a[href="#/list"]').click();
  await page.waitForFunction(() => document.title.startsWith("Grocery list"));
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

  // Check off a bought item: Add to pantry is offered, never automatic.
  const onion = page.locator(".line", { hasText: "Onion" });
  await onion.locator('input[type="checkbox"]').check();
  await pause();
  const autoAdded = await page.evaluate(() => "onion" in JSON.parse(localStorage.getItem("mise-match:v1")).pantry);
  await page.locator(".line", { hasText: "Onion" }).locator('[data-action="list-to-pantry"]').click();
  await pause(1200);
  const added = await page.evaluate(() => JSON.parse(localStorage.getItem("mise-match:v1")).pantry.onion);
  record("list: checking off offers Add to pantry; it adds only when chosen", vp.name, !autoAdded && added?.qty === 1, JSON.stringify({ autoAdded, added }));

  // Avatar opens Profile and settings as a pushed screen with a way back.
  await page.locator(".avatar").click();
  await page.waitForFunction(() => document.title.startsWith("Profile"));
  await pause(1200);
  const profile = await page.evaluate(() => ({ tabbar: getComputedStyle(document.getElementById("nav")).display, back: !!document.querySelector(".back-link") }));
  record("avatar: Profile and settings opens as a pushed screen", vp.name, profile.tabbar === "none" && profile.back, JSON.stringify(profile));
  await page.locator(".back-link").click();
  await page.waitForFunction(() => document.title === "mise & match");
  await page.locator('nav a[href="#/list"]').click();
  await page.waitForFunction(() => document.title.startsWith("Grocery list"));

  await page.reload();
  await page.waitForSelector("h1");
  await pause(1200);
  const persisted = await page.evaluate(() => ({
    rice: [...document.querySelectorAll(".line")].find((l) => l.innerText.includes("basmati"))?.querySelector('input[data-action="list-qty"]').value,
    mango: document.body.innerText.includes("Mango"),
  }));
  record("reload: list edit and manual item persist", vp.name, persisted.rice === "100" && persisted.mango, JSON.stringify(persisted));
  await page.locator('nav a[href="#/"]').click();
  await page.waitForFunction(() => document.title === "mise & match");
  await pause();
  await page.locator(`a[href="#/recipe/chana-masala"]`).first().click();
  await page.waitForFunction(() => document.title.startsWith("Chana masala"));
  await pause(1200);
  const kept = await page.evaluate(() => ({
    servings: [...document.querySelectorAll(".stepper output")].find((o) => o.offsetParent)?.textContent,
    changes: [...document.querySelectorAll(".change-list li")].map((l) => l.innerText.split("\n")[0]),
  }));
  record("reload: adapted version persists", vp.name, kept.servings === "2" && kept.changes.length === 1, JSON.stringify(kept));
  await pageChecks(page, vp, "walkthrough end", errors);

  await page.waitForTimeout(1200);
  recording = false;
  await recorder;
  await context.close();

  // Each frame is shown for as long as it was current, so playback runs in real time.
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? f.t + 1000) - f.t) / 1000}`);
  list.push(`file '${frames.at(-1).file}'`);
  const listFile = join(framesDir, "frames.txt");
  writeFileSync(listFile, list.join("\n"));
  const mp4 = join(dir, "walkthrough-430x932.mp4");
  execFileSync(ffmpegPath, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", "fps=25,format=yuv420p", "-c:v", "libx264", "-movflags", "+faststart", mp4]);
  rmSync(framesDir, { recursive: true });
  record("walkthrough recorded", vp.name, frames.length > 20, `${frames.length} frames`);
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
