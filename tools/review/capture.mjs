// Review evidence: screenshots of the main screens at several viewports, a
// recorded walkthrough of the demo journey, and machine-checked results.
//
//   node capture.mjs --label before|after --out ../../reviews/<dated-folder> [--video] [--base http://localhost:8080] [--revision <sha>]
//
// Uses the installed Google Chrome (channel "chrome"), so no browser download is needed.
// Each viewport runs in a fresh browser context, i.e. fresh localStorage.

import { chromium } from "playwright";
import ffmpegStatic from "ffmpeg-static";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ffmpegPath = process.env.FFMPEG ?? ffmpegStatic;
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
  { name: "phone-430x932", width: 430, height: 932, mobile: true }, // iPhone 14/15 Pro Max class
  { name: "phone-393x852", width: 393, height: 852, mobile: true }, // iPhone 14/15 Pro class
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
  const go = async (hash) => {
    await page.goto(`${base}/${hash}`);
    await page.waitForSelector("h1");
  };

  await go("#/");
  await page.evaluate(() => document.fonts.ready);
  await shoot(page, dir, "01-today-fresh");
  await pageChecks(page, vp, "today, fresh storage", errors);
  record("today: start-here row for the demo recipe on a fresh start", vp.name, await page.locator('a.row-link[href="#/recipe/chana-masala"]').count() === 1);

  await go("#/recipe/chana-masala");
  await shoot(page, dir, "02-overview", false);
  await pageChecks(page, vp, "recipe overview", errors);
  const navShown = await page.locator("#nav").isVisible();
  record("recipe is a pushed screen (tab bar hidden on small, header nav on wide)", vp.name, navShown === !vp.mobile, `nav visible: ${navShown}`);
  const img = await page.evaluate(() => { const i = document.querySelector(".photo img"); return i ? { ok: i.complete && i.naturalWidth > 0, alt: i.alt } : null; });
  record("overview photo loads with alt text and a credit", vp.name, !!img?.ok && !!img.alt && (await page.locator(".credit").count()) > 0, JSON.stringify(img));

  // Adapt: portions, one swap, compare, pantry, list
  await visible(page, '[data-action="start-adapt"]').click();
  await page.waitForFunction(() => location.hash.startsWith("#/adapt/chana-masala"));
  await visible(page, '[data-action="servings"][data-delta="-1"]').click();
  await visible(page, '[data-action="servings"][data-delta="-1"]').click();
  await shoot(page, dir, "03-adapt-needs");
  await visible(page, '.action-bar [data-action="go-step"]').click();
  await visible(page, '[data-action="open-swaps"][data-slot="tomatoes"]').click();
  await page.locator('.option[data-swap="cm-canned-tomatoes"]').click();
  await shoot(page, dir, "04-swap-preview", false);
  const preview = await page.locator(".sheet-body").innerText();
  record("swap preview: quantities, texture, acidity, cooking, method, evidence label", vp.name,
    ["Texture", "Acidity", "Cooking", "Step", "not yet cooked by our team"].every((w) => preview.includes(w)) && /200 g canned tomatoes/.test(preview));
  await page.locator(".sheet-foot .btn--primary").click();
  await page.waitForTimeout(6500);
  await visible(page, '.action-bar [data-action="go-step"]').click();
  await shoot(page, dir, "05-compare");
  await pageChecks(page, vp, "compare", errors);
  const cmp = await page.locator(".cmp-table").innerText();
  record("compare: original and your version side by side at the same servings", vp.name, /tomatoes, medium/i.test(cmp) && /200 g canned tomatoes/i.test(cmp));
  await visible(page, '.action-bar [data-action="go-step"]').click();
  await page.selectOption("#have-basmati", "some");
  await page.fill('[data-action="pantry-qty"][data-key="basmati"]', "100");
  await page.press('[data-action="pantry-qty"][data-key="basmati"]', "Tab");
  await page.selectOption("#have-onion", "have");
  await page.evaluate(() => document.activeElement?.blur());
  await shoot(page, dir, "06-pantry-and-shopping");
  record("unknown pantry amount asks for confirmation instead of counting as enough", vp.name, await page.locator('.confirm-row', { hasText: "Onion" }).count() === 1);
  await visible(page, '[data-action="add-plan"]').click();
  await page.locator('#sheet [data-action="plan-add-copy"]').click();
  await go("#/list");
  await page.waitForTimeout(6500);
  await shoot(page, dir, "07-list");
  await pageChecks(page, vp, "shopping list", errors);
  const rice = await page.locator(".line", { hasText: "basmati" }).locator('input[data-action="list-qty"]').inputValue();
  record("list: rice is 150 − 100 = 50 g", vp.name, rice === "50", `rice ${rice}`);
  record("list: onion waits for a confirmation, not added", vp.name, !(await page.locator(".line .line-name").allInnerTexts()).includes("Onion"));

  // Requirements that conflict: vegan, nut-free, protein 30 g on paneer butter masala
  await go("#/adapt/paneer-butter-masala/needs");
  await visible(page, '[data-action="c-diet"][data-value="vegan"]').click();
  await visible(page, '[data-action="c-avoid"][data-value="nuts"]').click();
  await shoot(page, dir, "08-requirements-questions");
  for (const [a, k, v] of [["c-nutscope", null, "both"], ["c-answer", "soy", "ok"], ["c-answer", "sesame", "ok"], ["c-answer", "coconut", "ok"]]) {
    await visible(page, `[data-action="${a}"]${k ? `[data-key="${k}"]` : ""}[data-value="${v}"]`).click();
  }
  await page.selectOption('[data-action="c-target"][data-nutrient="protein"]', "30");
  await visible(page, '.action-bar [data-action="go-step"]').click();
  await shoot(page, dir, "09-target-conflict");
  const status = await page.locator(".status").first().innerText();
  record("conflict: explains the protein gap and offers real choices, requirements unchanged", vp.name, /30 g target/.test(status) && /Lower the protein goal/.test(status) && /Masoor dal/.test(status));
  await go("#/adapt/paneer-butter-masala/needs");
  await visible(page, '[data-action="c-avoid"][data-value="soy"]').click();
  await go("#/adapt/paneer-butter-masala/options");
  await shoot(page, dir, "10-no-supported");
  record("no supported result says why and offers other dishes", vp.name, /No supported version fits/.test(await page.locator(".status").first().innerText()));

  // Import: structured demo page, then the draft
  await go("#/import");
  await visible(page, '[data-action="import-tab"][data-tab="link"]').click();
  await visible(page, '[data-action="import-demo"][data-url="https://example.com/demo/weeknight-rajma"]').click();
  await visible(page, '[data-action="import-pick"]').click();
  await page.waitForFunction(() => location.hash.startsWith("#/draft/"));
  await shoot(page, dir, "11-draft");
  await pageChecks(page, vp, "imported draft", errors);
  const draft = await page.locator(".draft-page").innerText();
  record("draft: original wording kept, cream quantity blocks nutrition, saving as reference allowed", vp.name, draft.includes("Fresh cream, to finish") && /No quantity given/.test(draft) && /Save as a reference/.test(draft));

  for (const [hash, name] of [["#/saved", "12-saved"], ["#/pantry", "13-pantry"], ["#/plan", "14-plan"], ["#/profile", "15-profile"]]) {
    await go(hash);
    await shoot(page, dir, name);
    await pageChecks(page, vp, name.slice(3), errors);
  }
  await context.close();

  // Empty and error states, in fresh storage
  const empty = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: vp.mobile, hasTouch: vp.mobile });
  const p2 = await empty.newPage();
  const errors2 = [];
  p2.on("pageerror", (e) => errors2.push(e.message));
  await p2.goto(`${base}/#/list`);
  await p2.waitForSelector("h1");
  await shoot(p2, dir, "16-list-empty");
  await pageChecks(p2, vp, "shopping list, empty", errors2);
  await p2.goto(`${base}/#/no-such-page`);
  await p2.waitForSelector("h1");
  record("unknown route shows Not found with a way back", vp.name, (await p2.locator("h1").innerText()) === "Not found");
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
        await new Promise((r) => setTimeout(r, 50));
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
  // Keyboard: skip link first, then the wordmark, four tabs and the avatar.
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => document.activeElement.className);
  record("keyboard: first Tab shows skip link", vp.name, skip.includes("skip-link"), skip);
  const order = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    order.push(await page.evaluate(() => document.activeElement.getAttribute("aria-label") ?? document.activeElement.textContent.trim().replace(/\s+/g, " ")));
  }
  record("keyboard: wordmark, Today, Recipes, Pantry, Saved, avatar", vp.name, order.join(" > ") === "mise & match, Today > Today > Recipes > Pantry > Saved > Requirements and settings", order.join(" > "));

  // Keyboard through the adaptation flow
  await page.focus('a.row-link[href="#/recipe/chana-masala"]');
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.title.startsWith("Chana masala"));
  const kb = await page.evaluate(() => ({ tag: document.activeElement.tagName, outline: getComputedStyle(document.activeElement).outlineStyle }));
  record("keyboard navigation: title focused with visible ring", vp.name, kb.tag === "H1" && kb.outline === "solid", JSON.stringify(kb));
  await pause();
  await page.focus('[data-action="start-adapt"]');
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.hash.startsWith("#/adapt/"));
  await pause();
  await page.focus('[data-action="servings"][data-delta="-1"]');
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await pause();
  const servings = await page.locator(".stepper output").first().textContent();
  record("keyboard: servings 4 → 2 with Enter, focus kept on the control", vp.name, servings.trim() === "2" && (await page.evaluate(() => document.activeElement.dataset.delta)) === "-1", servings);
  await visible(page, '.action-bar [data-action="go-step"]').click();
  await pause();
  await page.focus('[data-action="open-swaps"][data-slot="tomatoes"]');
  await page.keyboard.press("Enter");
  await pause();
  record("swap sheet title", vp.name, (await page.locator("#sheet-title").innerText()) === "Thyme for a swap.");
  await page.keyboard.press("Escape");
  await pause(600);
  const back = await page.evaluate(() => document.activeElement?.dataset?.slot ?? "");
  record("dialog: Escape closes and focus returns to trigger", vp.name, back === "tomatoes", `focus on slot ${back}`);
  await page.keyboard.press("Enter");
  await page.locator('.option[data-swap="cm-canned-tomatoes"]').click();
  await pause(1500);
  await page.locator(".sheet-foot .btn--primary").click();
  await pause(1200);
  await visible(page, '[data-action="preview-swap"][data-swap="cm-paneer"]').click();
  await pause(1200);
  await page.locator(".sheet-foot .btn--primary").click();
  await pause();
  await visible(page, '[data-action="session-undo"]').click();
  await pause();
  const applied = await page.evaluate(() => window.__mise.state.sessions["chana-masala"].applied);
  record("undo: removes Add paneer, keeps canned tomatoes", vp.name, applied.join() === "cm-canned-tomatoes", applied.join());
  await visible(page, '.action-bar [data-action="go-step"]').click();
  await pause(1500);
  await page.mouse.wheel(0, 900);
  await pause(1200);
  await page.evaluate(() => window.scrollTo(0, 0));

  // Explicit save, then resume after reload
  await visible(page, '[data-action="save-version"]').click();
  await pause();
  await page.locator('#sheet [data-action="confirm-save-version"]').click();
  await pause(1200);
  const versions = await page.evaluate(() => Object.values(window.__mise.state.versions).length);
  record("save: version added only on an explicit save", vp.name, versions === 1, `${versions} version`);
  await visible(page, '[data-action="choose-option"], [data-action="go-step"][data-step="options"]').click().catch(() => {});
  await page.goto(`${base}/#/adapt/chana-masala/options`);
  await visible(page, '[data-action="preview-swap"][data-swap="cm-spinach"]').click();
  await page.locator(".sheet-foot .btn--primary").click();
  await pause();
  await page.reload();
  await page.waitForSelector("h1");
  await page.goto(`${base}/#/`);
  await pause(1200);
  const resume = await page.locator("#cont-h").count();
  record("reload: unfinished adaptation offered under Pick up where you left off", vp.name, resume === 1);
  await pause();

  // Cook without saving, then feedback on the exact version cooked
  await page.goto(`${base}/#/cook/chana-masala`);
  await page.waitForSelector("h1");
  await pause();
  await visible(page, '[data-action="finish-cooking"]').click();
  await pause();
  await page.locator('#sheet input[name="again"][value="yes"]').check();
  await page.locator('#sheet input[name="familiar"][value="somewhat"]').check();
  await pause(600);
  await page.locator('#sheet [data-action="save-feedback"]').click();
  await pause();
  const cook = await page.evaluate(() => window.__mise.state.cooks.at(-1));
  record("cook: record keeps the exact rules and servings, versions unchanged", vp.name, cook.applied.includes("cm-spinach") && cook.servings === 2 && cook.versionId === null && cook.feedback.again === "yes", JSON.stringify({ applied: cook.applied, versionId: cook.versionId }));
  await pageChecks(page, vp, "walkthrough end", errors);

  await page.waitForTimeout(1200);
  recording = false;
  await recorder;
  await context.close();

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
// Installed Chrome when available (no download needed); otherwise Playwright's own Chromium.
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
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
