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

import { parseLine } from "./normalize.js";
import { RECIPES } from "../data/recipes.js";

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

/** Servings from "4", 4, "Serves 4", ["4", "4 servings"]. null when absent or not a serving count. */
export function parseServings(v) {
  for (const y of asArray(v)) {
    const s = String(y);
    const m = s.match(/(\d+)/);
    if (!m) continue;
    // "Makes 12 parathas" is a yield, not a serving count.
    if (/\b(makes|pieces|parathas|rotis|cookies|cups?)\b/i.test(s) && !/serv/i.test(s)) continue;
    return Number(m[1]);
  }
  return null;
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
    servingsText: asArray(r.recipeYield).map(String).join(", ") || null,
    creator: asArray(r.author).map(text).filter(Boolean).join(", ") || null,
    site: text(r.publisher) || null,
    url: r.url ?? url,
  }));
}

// ---------- pasted text ----------

const ING_HEAD = /^\s*(ingredients?|you(?:'|’)ll need|what you need)\s*:?\s*$/i;
const STEP_HEAD = /^\s*(method|instructions?|directions?|steps?|preparation|how to make( it)?)\s*:?\s*$/i;
const SERVES = /\b(?:serves|servings?|for|yield)\s*:?\s*(\d+)/i;

/**
 * Split pasted text into recipes. Each recipe needs an Ingredients heading;
 * more than one heading means more than one recipe, and the person chooses.
 * @returns { recipes: [...same shape as extractJsonLd], problem?: string }
 */
export function parsePastedText(input) {
  const lines = input.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const heads = lines.map((l, i) => (ING_HEAD.test(l) ? i : -1)).filter((i) => i >= 0);
  if (!lines.some(Boolean)) return { recipes: [], problem: "empty" };
  if (!heads.length) return { recipes: [], problem: "no-sections" };
  const recipes = heads.map((h, k) => {
    const end = heads[k + 1] ?? lines.length;
    // Title: the last non-empty line before the heading that isn't a serves line.
    let title = null;
    let servings = null;
    let servingsText = null;
    for (let i = h - 1; i >= (heads[k - 1] ?? -1) + 1; i--) {
      if (!lines[i]) continue;
      if (SERVES.test(lines[i]) && servings == null) {
        servings = Number(lines[i].match(SERVES)[1]);
        servingsText = lines[i];
        continue;
      }
      if (!title && !STEP_HEAD.test(lines[i])) title = lines[i].replace(/^#+\s*/, "");
    }
    const body = lines.slice(h + 1, end);
    const stepAt = body.findIndex((l) => STEP_HEAD.test(l));
    const ingLines = (stepAt >= 0 ? body.slice(0, stepAt) : body).filter(Boolean);
    const stepLines = stepAt >= 0 ? body.slice(stepAt + 1).filter(Boolean) : [];
    // A serves line may also sit inside the body.
    for (const l of body) if (servings == null && SERVES.test(l) && !/\d+\s*(g|ml|tsp|tbsp|cup)/i.test(l)) {
      servings = Number(l.match(SERVES)[1]);
      servingsText = l;
    }
    return {
      title: title ?? "Untitled recipe",
      ingredients: ingLines.filter((l) => !SERVES.test(l) || /\d+\s*(g|ml|tsp|tbsp|cup)/i.test(l)),
      steps: stepLines.map((l) => l.replace(/^(\d+[.)]|step\s*\d+:?)\s*/i, "")),
      servings,
      servingsText,
      creator: null,
      site: null,
      url: null,
    };
  });
  return { recipes };
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
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) return { recipes: [], problem: "not-fetchable", url: clean };
  const demo = DEMO_LINKS[clean];
  if (!demo) return { recipes: [], problem: "not-fetchable", url: clean };
  if (demo.kind === "structured") {
    const recipes = extractJsonLd(demo.html, clean);
    return recipes.length ? { recipes, method: "structured", url: clean, demo: true } : { recipes: [], problem: "no-structured", url: clean, demo: true };
  }
  if (demo.kind === "multiple") return { ...parsePastedText(demo.text), method: "page", url: clean, demo: true };
  return { recipes: [], problem: demo.kind, url: clean, demo: true };
}

// ---------- drafts ----------

/** Supported recipe this draft appears to be, by title. Only a suggestion. */
export function suggestSupported(title) {
  const t = title.toLowerCase();
  return RECIPES.find((r) => t.includes(r.title.toLowerCase()) || r.title.toLowerCase().split(" (")[0] === t)?.id ?? null;
}

let seq = 0;
/** Build a draft from one extracted recipe. Missing pieces stay missing. */
export function buildDraft(extracted, { method, url = null, now = Date.now() } = {}) {
  const id = `d${now.toString(36)}${(seq++).toString(36)}`;
  return {
    id,
    title: extracted.title,
    servings: extracted.servings ?? null,
    servingsText: extracted.servingsText ?? null,
    lines: extracted.ingredients.map((raw, i) => parseLine(raw, { section: "Ingredients", source: method, index: i })),
    steps: extracted.steps,
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
