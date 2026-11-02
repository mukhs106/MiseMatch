// Importing creates a DRAFT, never an assurance of a complete recipe.
//
// Stage 1, extraction (this file): get title, ingredient lines, steps, servings
//   and attribution out of a source, in this order of preference:
//     1. structured recipe metadata (schema.org Recipe JSON-LD) in page HTML
//     2. supported page extraction (demo fixtures only; see below)
//     3. pasted text with Ingredients / Method sections
//     4. screenshots: NOT available. There is no OCR integration, so the app says so.
// Stage 2, normalization and validation: core/normalize.js
// Stage 3, adaptation: only for drafts linked to a supported recipe (core/engine.js)
//
// This is a static site with no server, so it cannot fetch other websites
// (browsers block cross-site reads). Link import therefore only works for the
// clearly labelled demo links in DEMO_LINKS; any other link gets an honest
// fallback that keeps what was entered. A real importer needs a server-side
// fetcher, permission checks and per-site extraction (documented as deferred).

import { parseLine, INPUT_LIMITS } from "./normalize.js";
import { RECIPES } from "../data/recipes.js";
import { uid } from "./versions.js";

const ATTRIBUTION_NOTE = "Imported for your private use. Keep the creator's credit, and don't republish their recipe without permission.";

// ---------- structured metadata ----------

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function isRecipe(node) {
  return asArray(node?.["@type"]).some((t) => String(t).toLowerCase() === "recipe");
}

function collectRecipes(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((n) => collectRecipes(n, out));
  if (isRecipe(node)) out.push(node);
  if (node["@graph"]) collectRecipes(node["@graph"], out);
}

function text(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  if (typeof v === "object" && "name" in v) return text(v.name);
  return String(v);
}

function instructions(v) {
  const out = [];
  for (const step of asArray(v)) {
    if (typeof step === "string") out.push(...step.split(/\n+/).map(text).filter(Boolean));
    else if (step?.["@type"] === "HowToSection") out.push(...instructions(step.itemListElement));
    else if (step?.text) out.push(text(step.text));
    else if (step?.name) out.push(text(step.name));
  }
  return out;
}

const MAX_YIELD = 100;

/**
 * Read a stated yield without silently truncating it.
 * @returns {{ servings: number|null, text: string|null, issue: null|"range"|"fraction"|"too-large", range?: [low, high], value?: number }}
 *   Ranges, fractions and implausible values stay as unresolved source data; the
 *   person says which number calculations should use.
 */
export function parseYield(v) {
  for (const y of asArray(v)) {
    const s = String(y).trim();
    // "Makes 12 parathas" is a yield, not a serving count.
    if (!/\d/.test(s)) continue;
    if (/\b(makes|pieces|parathas|rotis|cookies|cups?)\b/i.test(s) && !/serv/i.test(s)) continue;
    const range = s.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:[.,]\d+)?)/i);
    if (range) return { servings: null, text: s, issue: "range", range: [Number(range[1].replace(",", ".")), Number(range[2].replace(",", "."))] };
    const fraction = s.match(/(\d+[.,]\d+|\d+\s*\d*\/\d+|\d*[½¼¾⅓⅔])/);
    if (fraction) return { servings: null, text: s, issue: "fraction", value: Number(fraction[1].replace(",", ".")) || null };
    const n = Number(s.match(/\d+/)[0]);
    if (!(n >= 1) || n > MAX_YIELD) return { servings: null, text: s, issue: "too-large", value: n };
    return { servings: n, text: s, issue: null };
  }
  return { servings: null, text: null, issue: null };
}

/** The usable serving count from a stated yield, or null when it's absent or unresolved. */
export function parseServings(v) {
  return parseYield(v).servings;
}

/**
 * Find schema.org Recipe objects in page HTML.
 * @returns [{ title, ingredients: string[], steps: string[], servings, servingsText, creator, site, url }]
 */
export function extractJsonLd(html, url = null) {
  const found = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      collectRecipes(JSON.parse(m[1].trim()), found);
    } catch {
      /* malformed block: skip it, other blocks may still parse */
    }
  }
  return found.map((r) => ({
    title: text(r.name) || "Untitled recipe",
    ingredients: asArray(r.recipeIngredient ?? r.ingredients).map(text).filter(Boolean),
    steps: instructions(r.recipeInstructions),
    servings: parseServings(r.recipeYield),
    yield: parseYield(r.recipeYield),
    servingsText: asArray(r.recipeYield).map(String).join(", ") || null,
    creator: asArray(r.author).map(text).filter(Boolean).join(", ") || null,
    site: text(r.publisher) || null,
    url: r.url ?? url,
  }));
}

// ---------- pasted text ----------

const clean = (l) => l.replace(/^#+\s*/, "").replace(/^\*\*(.*)\*\*$/, "$1").replace(/^__(.*)__$/, "$1").trim();
const ING_HEAD = /^\s*(ingredients?|you(?:'|’)ll need|what you need)\s*:?\s*$/i;
const STEP_HEAD = /^\s*(method|instructions?|directions?|steps?|preparation|how to make( it)?)\s*:?\s*$/i;
const SERVES = /\b(?:serves|servings?|for|yield)\s*:?\s*\d/i;
// "For the tadka:" or "Masala:" inside an ingredient list names a part of the recipe, not an ingredient.
const SUBHEAD = /^(?:for (?:the )?[^\d,]{2,40}|[A-Za-z][^\d,]{1,30}):$/;

/**
 * Split pasted text into recipes. Each recipe needs an Ingredients heading; more
 * than one heading means more than one recipe or more than one part of a recipe,
 * and the person chooses from a preview. The raw text is kept with the result.
 * @returns { recipes: [...same shape as extractJsonLd], raw, problem?: string, truncated?: boolean }
 */
export function parsePastedText(input) {
  const truncated = input.length > INPUT_LIMITS.text;
  const raw = input.slice(0, INPUT_LIMITS.text);
  const lines = raw.replace(/\r/g, "").split("\n").map((l) => clean(l));
  const heads = lines.map((l, i) => (ING_HEAD.test(l) ? i : -1)).filter((i) => i >= 0);
  if (!lines.some(Boolean)) return { recipes: [], raw, problem: "empty" };
  if (!heads.length) return { recipes: [], raw, problem: "no-sections" };
  const recipes = heads.map((h, k) => {
    const end = heads[k + 1] ?? lines.length;
    // Title: the last non-empty line before the heading that isn't a serves line.
    let title = null;
    let yieldInfo = { servings: null, text: null, issue: null };
    const prevEnd = heads[k - 1] ?? -1;
    const prevSteps = prevEnd >= 0 ? lines.slice(prevEnd + 1, h).findIndex((l) => STEP_HEAD.test(l)) : -1;
    // Only look back to the blank line that starts this recipe, so a previous method isn't taken for a title.
    for (let i = h - 1; i > prevEnd; i--) {
      if (!lines[i]) {
        if (title) break;
        if (prevSteps >= 0) continue;
        continue;
      }
      if (SERVES.test(lines[i]) && !yieldInfo.text) {
        yieldInfo = parseYield(lines[i]);
        continue;
      }
      if (!title && !STEP_HEAD.test(lines[i])) {
        title = lines[i];
        if (prevEnd >= 0) break;
      }
    }
    const body = lines.slice(h + 1, end);
    let stepAt = body.findIndex((l) => STEP_HEAD.test(l));
    // The next recipe's title and serves line belong to the next recipe, not this method.
    let bodyEnd = body.length;
    if (k + 1 < heads.length) {
      const blank = body.lastIndexOf("");
      if (blank >= 0 && blank > stepAt) bodyEnd = blank;
    }
    const ingRaw = (stepAt >= 0 ? body.slice(0, stepAt) : body.slice(0, bodyEnd)).filter(Boolean);
    const stepLines = stepAt >= 0 ? body.slice(stepAt + 1, bodyEnd).filter(Boolean) : [];
    // A serves line may also sit inside the body.
    for (const l of body) if (!yieldInfo.text && SERVES.test(l) && !/\d+\s*(g|ml|tsp|tbsp|cup)/i.test(l)) yieldInfo = parseYield(l);
    let section = null;
    const ingredients = [];
    const sections = [];
    for (const l of ingRaw) {
      if (SUBHEAD.test(l)) {
        section = l.replace(/:$/, "");
        sections.push(section);
        continue;
      }
      if (SERVES.test(l) && !/\d+\s*(g|ml|tsp|tbsp|cup)/i.test(l)) continue;
      ingredients.push({ raw: l, section });
    }
    return {
      title: (title ?? "Untitled recipe").slice(0, INPUT_LIMITS.title),
      ingredients: ingredients.slice(0, INPUT_LIMITS.lines),
      steps: stepLines.map((l) => l.replace(/^(\d+[.)]|step\s*\d+:?)\s*/i, "")).slice(0, INPUT_LIMITS.steps),
      sections,
      servings: yieldInfo.servings,
      yield: yieldInfo,
      servingsText: yieldInfo.text,
      creator: null,
      site: null,
      url: null,
    };
  });
  return { recipes, raw, ...(truncated ? { truncated: true } : {}) };
}

/** When a paste's several "Ingredients" headings were parts of one recipe, not separate recipes. */
export function combineExtracted(recipes) {
  const first = recipes[0];
  return {
    ...first,
    ingredients: recipes.flatMap((r) => r.ingredients.map((i) => (typeof i === "string" ? { raw: i, section: r.title } : { ...i, section: i.section ?? r.title }))),
    steps: recipes.flatMap((r) => r.steps),
    sections: recipes.map((r) => r.title),
  };
}

// ---------- demo link fixtures ----------
// Clearly fictional pages on example.com (a domain reserved for examples), so
// the fallback paths can be demonstrated without fetching anything.

const RAJMA_PAGE = `<!doctype html><html><head><title>Weeknight rajma</title>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Weeknight rajma",
  author: { "@type": "Person", name: "Example Kitchen (demo creator)" },
  publisher: { "@type": "Organization", name: "example.com demo" },
  recipeYield: ["4", "4 servings"],
  recipeIngredient: [
    "2 (400 g) cans kidney beans, drained",
    "2 tbsp ghee",
    "1 tsp jeera",
    "2 onions, finely chopped",
    "1 tbsp ginger garlic paste",
    "3 tomatoes, pureed",
    "1 tsp kashmiri mirch",
    "1 tsp garam masala",
    "Fresh cream, to finish",
    "Salt to taste",
    "Handful of coriander leaves, for garnish",
    "2 cups rice",
  ],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Heat the ghee and add the jeera." },
    { "@type": "HowToStep", text: "Cook the onions until golden, then the ginger garlic paste." },
    { "@type": "HowToStep", text: "Add the tomatoes and spices and cook until thick." },
    { "@type": "HowToStep", text: "Add the beans and a cup of water and simmer for 20 minutes." },
    { "@type": "HowToStep", text: "Finish with cream and coriander. Serve with rice." },
  ],
})}</script></head><body>…</body></html>`;

const CHANA_PAGE = `<!doctype html><html><head><title>Chana masala</title>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [{ "@type": "WebPage", name: "Chana masala" }, {
    "@type": "Recipe",
    name: "Punjabi chana masala",
    author: { "@type": "Person", name: "Example Kitchen (demo creator)" },
    recipeYield: "Serves 4",
    recipeIngredient: [
      "2 (400 g) cans chickpeas, drained",
      "3 tomatoes, finely chopped",
      "2 onions, finely chopped",
      "4 cloves garlic, grated",
      "1 tbsp ginger, grated",
      "1 green chilli, slit",
      "1 tsp jeera",
      "2 tsp dhania powder",
      "1 tsp kashmiri mirch",
      "1/2 tsp haldi",
      "1 tsp garam masala",
      "Salt to taste",
      "3 tbsp oil",
      "1/2 lemon",
    ],
    recipeInstructions: "Heat oil, sizzle jeera.\nCook onions until deep golden.\nAdd garlic, ginger and chilli.\nAdd spices and tomatoes; cook until thick.\nAdd chickpeas and water; simmer 15 minutes.\nFinish with garam masala and lemon.",
  }],
})}</script></head><body>…</body></html>`;

export const DEMO_LINKS = {
  "https://example.com/demo/weeknight-rajma": { kind: "structured", html: RAJMA_PAGE, label: "Recipe page with structured data" },
  "https://example.com/demo/chana-masala": { kind: "structured", html: CHANA_PAGE, label: "A supported dish, with structured data" },
  "https://example.com/demo/two-recipes": { kind: "multiple", text: "Jeera rice\nServes 2\nIngredients\n1 cup basmati rice, uncooked\n1 tbsp ghee\n1 tsp jeera\nSalt to taste\nMethod\nRinse the rice.\nFry the jeera in ghee, add rice and 2 cups water, cook 15 minutes.\n\nBoondi raita\nIngredients\n1 cup dahi\nHandful of boondi\nMethod\nWhisk the dahi and stir in the boondi.", label: "A page with two recipes" },
  "https://example.com/demo/private-post": { kind: "private", label: "A private social post" },
  "https://example.com/demo/video-no-caption": { kind: "no-caption", label: "A video with no recipe in the caption" },
};

export const FALLBACK_TEXT = {
  "not-fetchable": "This prototype can't open web links, because it runs entirely in your browser with no server. Paste the recipe text instead; your link is kept as the source.",
  private: "That post is private or needs a login, so nothing can be read from it. If you can see it, copy the caption or recipe text and paste it here.",
  "no-caption": "The video has no recipe written in its caption. Spoken recipes need transcription, which isn't connected in this prototype. Type the ingredients and steps you know, and leave gaps as gaps.",
  "no-structured": "No structured recipe data was found on that page. Paste the recipe text instead.",
  screenshot: "Reading text from images isn't connected in this prototype, so we won't guess what a photo says. Type or paste the text instead. Handwritten cards are best typed by someone who can read them.",
  "no-sections": "We couldn't find an Ingredients heading. Add a line that says Ingredients above the list (and Method above the steps), then try again.",
  empty: "There's nothing to import yet.",
  "no-recipe": "No recipe was found.",
};

/**
 * Extract from a link. Only demo links resolve; others return a fallback that
 * keeps the URL so it can travel with a pasted version.
 */
export function extractFromLink(url) {
  const address = url.trim().slice(0, INPUT_LIMITS.url);
  if (!/^https?:\/\//i.test(address)) return { recipes: [], problem: "not-fetchable", url: address };
  const demo = DEMO_LINKS[address];
  if (!demo) return { recipes: [], problem: "not-fetchable", url: address };
  if (demo.kind === "structured") {
    const recipes = extractJsonLd(demo.html, address);
    return recipes.length ? { recipes, method: "structured", url: address, demo: true } : { recipes: [], problem: "no-structured", url: address, demo: true };
  }
  if (demo.kind === "multiple") return { ...parsePastedText(demo.text), method: "page", url: address, demo: true };
  return { recipes: [], problem: demo.kind, url: address, demo: true };
}

// ---------- drafts ----------

/** Supported recipe this draft appears to be, by title. Only a suggestion. */
export function suggestSupported(title) {
  const t = title.toLowerCase();
  return RECIPES.find((r) => t.includes(r.title.toLowerCase()) || r.title.toLowerCase().split(" (")[0] === t)?.id ?? null;
}

/** An earlier import of the same thing, so importing twice is a choice rather than an accident. */
export function findDuplicateDraft(drafts, extracted, url = null) {
  const lines = (r) => r.map((x) => (typeof x === "string" ? x : x.raw)).join("|").toLowerCase();
  return Object.values(drafts).find((d) => (url && d.source.url === url) || (d.title.toLowerCase() === extracted.title.toLowerCase() && lines(d.lines.map((l) => l.raw)) === lines(extracted.ingredients))) ?? null;
}

/** Build a draft from one extracted recipe. Missing pieces stay missing. */
export function buildDraft(extracted, { method, url = null, raw = null, now = Date.now() } = {}) {
  return {
    id: uid("d"),
    title: extracted.title,
    servings: extracted.servings ?? null, // the source yield: the denominator for scaling
    targetServings: null, // portions to make; never changes the source yield
    yield: extracted.yield ?? { servings: extracted.servings ?? null, text: extracted.servingsText ?? null, issue: null },
    servingsText: extracted.servingsText ?? null,
    lines: extracted.ingredients.map((ing, i) => (typeof ing === "string"
      ? parseLine(ing, { section: "Ingredients", source: method, index: i })
      : parseLine(ing.raw, { section: ing.section ?? "Ingredients", source: method, index: i }))),
    steps: extracted.steps,
    rawText: raw,
    source: {
      method, // "structured" | "page" | "paste"
      url: url ?? extracted.url ?? null,
      creator: extracted.creator ?? null,
      site: extracted.site ?? null,
      importedAt: now,
      note: ATTRIBUTION_NOTE,
    },
    supportedRecipe: suggestSupported(extracted.title),
    status: "draft", // "draft" while being reviewed, "reference" once saved
  };
}
