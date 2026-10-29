// Review evidence: screenshots of the main screens at several viewports, a
// recorded walkthrough of the demo journey, and machine-checked results.
//
//   node capture.mjs --label before|after --out ../../reviews/<dated-folder> [--video] [--base http://localhost:8080] [--revision <sha>]
//
// Uses the installed Google Chrome (channel "chrome"), so no browser download is needed.
// Set CHROME_PATH to use another Chrome or Chromium binary instead (for example in a cloud container).
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

// Pantry quick-add chips toggle an item in or out; the group can close once the pantry has items.
async function quickToggle(page, item) {
  const group = page.locator("details.quick-add");
  if (!(await group.evaluate((d) => d.open))) await group.locator("summary").click();
  await tap(page, `[data-action="pantry-toggle"][data-item="${item}"]`);
}

// Click after centering, so the fixed tab bar never covers the target.
async function tap(page, sel) {
  const el = page.locator(sel).first();
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await el.click();
}

// Cumulative layout shift, collected from page load (see newContext below).
const CLS_INIT = () => {
  window.__cls = 0;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
};

// Every photo and supporting image on the page: loaded, framed at the right ratio,
// not stretched (object-fit: cover), and with the alt text its role calls for.
async function imageChecks(page, vp, scenario, { frame, ratio }) {
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll(".photo picture img, img.supporting")) {
      img.dataset.loadingWas ??= img.getAttribute("loading");
      img.loading = "eager";
      await img.decode().catch(() => {});
    }
  });
  const imgs = await page.evaluate(() => [...document.querySelectorAll(".photo picture img, img.supporting")].map((img) => {
    const box = (img.closest(".photo") ?? img).getBoundingClientRect();
    return {
      src: img.currentSrc.split("/").pop(), natural: img.naturalWidth, alt: img.getAttribute("alt"), supporting: img.classList.contains("supporting"),
      fit: getComputedStyle(img).objectFit, w: box.width, h: box.height, loading: img.dataset.loadingWas,
      hasSize: img.hasAttribute("width") && img.hasAttribute("height"), frame: img.closest(".photo")?.className ?? "",
    };
  }));
  record(`${scenario}: images present`, vp.name, imgs.length > 0, `${imgs.length}`);
  record(`${scenario}: every image loaded (no broken or blocked variant)`, vp.name, imgs.every((i) => i.natural > 0), imgs.filter((i) => !i.natural).map((i) => i.src).join(", "));
  record(`${scenario}: width and height attributes on every image`, vp.name, imgs.every((i) => i.hasSize));
  record(`${scenario}: photos cover their frame (not stretched)`, vp.name, imgs.filter((i) => !i.supporting).every((i) => i.fit === "cover"));
  const framed = imgs.filter((i) => i.frame.includes(frame));
  const bad = framed.filter((i) => Math.abs(i.w / i.h - ratio(vp)) > 0.02);
  record(`${scenario}: ${frame} frame ratio`, vp.name, framed.length > 0 && !bad.length, framed.map((i) => `${i.src} ${Math.round(i.w)}x${Math.round(i.h)}`).join("; "));
  record(`${scenario}: alt text (photo describes the dish, supporting image empty)`, vp.name,
    imgs.every((i) => (i.supporting ? i.alt === "" : i.alt && i.alt.length > 10)), imgs.map((i) => `${i.src}: "${i.alt}"`).join(" | "));
  return imgs;
}

async function shoot(page, dir, name, fullPage = true) {
  await page.waitForTimeout(350); // let sheet/toast animations settle
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage });
}

async function screens(browser, vp) {
  const dir = join(out, label, vp.name);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: vp.mobile, hasTouch: vp.mobile });
  await context.addInitScript(CLS_INIT);
  const page = await context.newPage();
  const errors = [];
  const missing = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && missing.push(`${r.status()} ${r.url().replace(base, "")}`));

  await page.goto(`${base}/#/`);
  await page.waitForSelector("h1");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  record("home: layout shift while loading (CLS < 0.02)", vp.name, (await page.evaluate(() => window.__cls)) < 0.02, `CLS ${(await page.evaluate(() => window.__cls)).toFixed(4)}`);
  await shoot(page, dir, "01-home-fresh");
  await pageChecks(page, vp, "home, fresh storage", errors);
  if (label !== "before") {
    const cards = await imageChecks(page, vp, "home cards", { frame: "photo--card", ratio: () => 4 / 3 });
    record("home: lazy loading on cards", vp.name, cards.filter((i) => !i.supporting).every((i) => i.loading === "lazy"));
    const tiles = await page.evaluate(() => [...document.querySelectorAll(".rcard .photo")].filter((p) => !p.querySelector("picture")).map((p) => p.innerText.trim()));
    record("home: recipes without a matching photo show the tile with their name", vp.name, tiles.length === 4 && tiles.every(Boolean), tiles.join(", "));
    record("home: All recipes shows the whole collection with Saved marks", vp.name,
      (await page.locator(".rcard").count()) === 5 && (await page.locator('.rcard-save[aria-pressed="true"]').count()) === 2);

    // Search within the current view.
    const search = page.locator('input[data-action="recipe-search"]');
    const searchLabel = await page.locator(".search-field .field-label").innerText();
    record("search: label states scope (our collection, count, demo)", vp.name, /our collection/i.test(searchLabel) && /5 demo recipes/.test(searchLabel), searchLabel);
    await search.fill("chickpea");
    const hits = await page.locator(".rcard-title").allInnerTexts();
    record("search: ingredient match in All recipes", vp.name, hits.join() === "Chana masala,Chana palak", `${hits.join(", ")} | ${await page.locator("#results-status").innerText()}`);
    await search.fill("chinese");
    record("search: cuisine match", vp.name, (await page.locator(".rcard-title").allInnerTexts()).join() === "Tomato and egg stir-fry");
    await search.fill("lasagna");
    const none = await page.locator("#recipe-results .empty").innerText().catch(() => "");
    record("search: plain no-results message", vp.name, /No recipes in All recipes match “lasagna”/.test(none), none.replace(/\n/g, " "));
    await shoot(page, dir, "01b-search-no-results");
    await search.fill("");

    // Saved view, then Use what you have (empty pantry first, then four ingredients added in Pantry).
    await tap(page, '[data-action="set-mode"][data-mode="saved"]');
    record("views: Saved shows saved recipes", vp.name, (await page.locator(".rcard-title").allInnerTexts()).join() === "Chana palak,Masoor dal tadka");
    await search.fill("dal");
    record("search: limited to the current view", vp.name, (await page.locator(".rcard-title").allInnerTexts()).join() === "Masoor dal tadka");
    await search.fill("");
    await tap(page, '[data-action="set-mode"][data-mode="have"]');
    const offScript = await page.evaluate(() => ({ lead: document.querySelector("#recipe-results .empty-lead")?.innerText, tagline: !!document.querySelector(".home-intro p") }));
    record("views: Use what you have with an empty pantry says what to do, one wordplay line", vp.name,
      offScript.lead === "Dinner, off-script." && !offScript.tagline && (await page.locator('#recipe-results a[href="#/pantry"]').count()) === 1, JSON.stringify(offScript));
    const have = ["chickpeas", "onion", "canned-tomatoes", "basmati"];
    await page.goto(`${base}/#/pantry`);
    await page.waitForFunction(() => document.title.startsWith("Pantry"));
    for (const item of have) await quickToggle(page, item);
    await page.goto(`${base}/#/`);
    await page.waitForFunction(() => document.title === "mise & match");
    const reasons = await page.locator(".rcard").evaluateAll((els) => els.map((el) => el.querySelector(".rcard-title").innerText + ": " + el.querySelector(".rcard-reasons")?.innerText.replace(/\n+/g, " / ")));
    record("views: Use what you have orders can make now / one swap away first, each card states its reason", vp.name,
      reasons.length === 4 && reasons[0].startsWith("Chana masala: One swap away / You have 3 of 4 key ingredients. / Supported swap: canned tomatoes for tomatoes.")
        && reasons.every((r) => /key ingredients/.test(r)), reasons.join(" || "));
    await page.locator(".discover").scrollIntoViewIfNeeded();
    await shoot(page, dir, "01c-use-what-you-have");
    await page.goto(`${base}/#/pantry`);
    await page.waitForFunction(() => document.title.startsWith("Pantry"));
    for (const item of have) await quickToggle(page, item);
    record("pantry: cleared again for the demo path", vp.name, (await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("mise-match:v1")).pantry).length)) === 0);
    await page.goto(`${base}/#/`);
    await page.waitForFunction(() => document.title === "mise & match");
    await tap(page, '[data-action="set-mode"][data-mode="all"]');
  }

  await page.goto(`${base}/#/recipe/chana-masala`);
  await page.waitForSelector("h1");
  await page.waitForLoadState("networkidle");
  record("recipe: layout shift while loading (CLS < 0.02)", vp.name, (await page.evaluate(() => window.__cls)) < 0.02, `CLS ${(await page.evaluate(() => window.__cls)).toFixed(4)}`);
  await shoot(page, dir, "02-recipe-top", false);
  await pageChecks(page, vp, "recipe, after navigation", errors);
  if (label !== "before") {
    // Hero: 4:5 on phones unless capped by height (then wider), 4:3 from 720px.
    const hero = await imageChecks(page, vp, "recipe hero", {
      frame: "photo--hero",
      ratio: (v) => (v.width >= 720 ? 4 / 3 : Math.max(4 / 5, (v.width - 32) / Math.min(0.38 * v.height, 400))),
    });
    record("recipe: hero loads eagerly as WebP", vp.name, hero[0]?.loading === "eager" && hero[0]?.src.endsWith(".webp"), hero[0]?.src);
    const heroBottom = await page.locator(".photo--hero").evaluate((el) => el.getBoundingClientRect().bottom);
    record("recipe: hero leaves room for the recipe in the first screen", vp.name, heroBottom < vp.height * 0.6, `hero ends at ${Math.round(heroBottom)} of ${vp.height}px`);
  }

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
  if (label !== "before") {
    // Saved view now includes the adapted (unsaved) chana masala as Your version.
    await page.goto(`${base}/#/`);
    await page.waitForFunction(() => document.title === "mise & match"); // a hash change: wait for the new render
    await tap(page, '[data-action="set-mode"][data-mode="saved"]');
    const savedCards = await page.locator(".rcard").evaluateAll((els) => els.map((el) => el.innerText.replace(/\n/g, " ")));
    record("views: Saved includes adapted versions labeled Your version", vp.name,
      savedCards.some((t) => t.includes("Chana masala") && t.includes("Your version")), savedCards.map((t) => t.slice(0, 60)).join(" || "));
    await shoot(page, dir, "05b-saved-your-version");
    record("no 404s or other failed requests", vp.name, missing.length === 0, missing.join(", "));
  }

  await context.close();

  if (label !== "before") {
    // Fallback: block the chana masala photo; its card and hero should show the tile, no broken image.
    const blocked = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: vp.mobile, hasTouch: vp.mobile });
    await blocked.route("**/assets/img/chana-masala-bowl-*", (r) => r.abort());
    const p3 = await blocked.newPage();
    for (const [url, sel, shot] of [["#/", ".rcard .photo", "10-fallback-home"], ["#/recipe/chana-masala", ".photo--hero", "11-fallback-recipe"]]) {
      await p3.goto(`${base}/${url}`);
      await p3.waitForSelector("h1");
      await p3.waitForTimeout(400);
      const f = await p3.locator(sel).first().evaluate((el) => ({
        failed: el.classList.contains("is-failed"),
        picture: getComputedStyle(el.querySelector("picture")).display,
        tile: el.querySelector(".photo-tile").innerText.trim(),
      }));
      record(`fallback: blocked photo shows the tile (${url})`, vp.name, f.failed && f.picture === "none" && f.tile === "Chana masala", JSON.stringify(f));
      await shoot(p3, dir, shot, false);
    }
    await blocked.close();
  }

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
  const found = await page.locator(".rcard-title").allInnerTexts();
  record("search: 'chickpea' finds the chickpea recipes", vp.name, found.includes("Chana masala") && found.includes("Chana palak") && !found.includes("Tomato and egg stir-fry"), found.join(", "));
  await page.locator('[data-action="set-mode"][data-mode="have"]').click();
  await pause(1200);
  await page.locator('[data-action="set-mode"][data-mode="saved"]').click();
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
  // Use what you have with a few things in the pantry: every card says why.
  await page.locator(".back-link").click();
  await page.waitForFunction(() => document.title === "mise & match");
  await page.locator('nav a[href="#/pantry"]').click();
  await page.waitForFunction(() => document.title.startsWith("Pantry"));
  for (const item of ["chickpeas", "canned-tomatoes"]) {
    await quickToggle(page, item);
    await pause(500);
  }
  await page.locator('nav a[href="#/"]').click();
  await page.waitForFunction(() => document.title === "mise & match");
  await tap(page, '[data-action="set-mode"][data-mode="have"]');
  await page.locator(".discover").evaluate((e) => e.scrollIntoView({ behavior: "smooth", block: "start" }));
  await pause(2500);
  const firstReason = await page.locator(".rcard-reasons").first().innerText();
  record("walkthrough: Use what you have shows a reason on each card", vp.name,
    /key ingredients/.test(firstReason) && (await page.locator(".rcard").count()) === (await page.locator(".rcard-reasons").count()), firstReason.replace(/\n+/g, " / "));
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
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
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
