# mise & match

Recipe adaptation app. Core: adapt familiar Indian and South Asian dishes to someone's pantry, portions, dietary requirements and optional nutrition goals, and explain the consequences before they cook. Saving, planning and the shopping list support that. Primary destinations: Today, Recipes, Pantry (on hand + shopping list), Saved; avatar → Requirements and settings. The adaptation flow is `#/adapt/:id/needs|options|compare|shop`. Detailed product and design decisions live in `docs/product-context.md` (v0.6 section first); read it before changing scope, data or visual language.

Queued work lives in docs/queue/QUEUE.md; run one task per session with /next and log results in docs/build-log.md.

## Commands (verified)

- `npm start` serves the app at http://localhost:8080 and prints a LAN address for testing on a phone on the same Wi-Fi (Node 18+, no dependencies). Opening `index.html` directly from disk does not work because of ES modules.
- `npm test` runs the core tests (`node --test`, no dependencies).
- Review evidence: `cd tools/review && npm install` once, then `node capture.mjs --label before|after [--video] --out ../../reviews/YYYY-MM-DD-topic`. Also `node acceptance.mjs` (connected scenarios) and `node matrix.mjs` (widths, text size, keyboard, large data). Uses installed Chrome, falling back to Playwright's Chromium; set `FFMPEG=/path/to/ffmpeg` to use a system ffmpeg. Dependencies live only in `tools/review/`.

## Structure

- `js/data/` seed data only: `items.js` (catalog: aliases, allergen tags, fixture nutrition, ambiguous names), `recipes.js` (10 dishes), `swaps.js` (authored rules), `bundles.js` (authored rule combinations).
- `js/core/` pure logic, no DOM: `adapt.js` (derive a version), `engine.js` (combination check, evaluation, candidates, resolve), `constraints.js` (hard exclusions, questions, limits, targets, preferences), `normalize.js` (ingredient lines, matching, per-action validation), `importer.js` (JSON-LD, pasted text, demo link fixtures, drafts), `versions.js` (sessions, saved versions, plan entries, cook records), `units.js`, `nutrition.js`, `pantry.js`, `shopping.js`, `suggest.js`, `search.js` (one alias-aware ingredient search), `recovery.js` (narrow undo records).
- `js/store.js` localStorage persistence (key `mise-match:v1`, state `version: 3`; v1 and v2 migrate; unreadable or future data is quarantined and never overwritten; `save` reports failure and refuses to overwrite another tab).
- `js/ui/` views as functions of state returning escaped HTML via `html```; `js/app.js` owns state, actions, routing, focus and the dialog. Shared pieces in `ui/parts.js`. Screen styles for the current flow are in `css/flow.css`; `css/screens.css` still holds older shared styles (list, pantry, sheet).
- `css/tokens.css` is the only place for raw colors, type, spacing and control sizes.
- The wordmark is typographic (`.wordmark` in `index.html` and `css/base.css`), a working identity, not a final logo. `assets/icons/*.svg` are placeholder icons for Suhani's drawings, used via `icon(name)` at one size (20px); `assets/accents/*.svg` are temporary placeholder accents. Don't inline new SVGs or add per-context icon sizes.

## Rules

- Never mutate source recipes. Every displayed version, step, nutrition figure and shopping need is derived from `{ servings, applied }`. Amounts in method text and effects use tokens (`{=key}`, `{q:slot}`, `{n}`), never literals. Keep needed, cooking (`practical`) and purchase (`purchaseQty`) amounts separate. Portions stay within each dish's `servingsRange`.
- Working sessions autosave with undo; a saved version changes only on an explicit Save. Saved, planned and cooked records store recipe and rule revisions and a reproducible snapshot; a later version edit is offered as a reviewable update, never applied silently. Bump `rev` when changing a recipe or rule. Cook mode freezes its snapshot at entry. Undo goes through `recovery.js`, never whole-state snapshots.
- Rules are recipe-specific and labelled as suggestions (`evidence: suggested`). Never present a rule, bundle or recipe as team-tested or community-verified; none are. Effects use texture, richness, aroma, acidity, cooking, quantity, unchanged, only where there is something to say. Every balancing adjustment needs a recipe-specific `why`. No numeric flavor scores.
- A pair is supported if it is in `combinesWith` or an exact bundle; three or more rules only if they are exactly an authored bundle. Anything else is labelled untested. Declared conflicts and same-slot rules are blocked.
- Hard exclusions (diet, allergens) and limits filter; they are never weighed against targets or preferences. Clarify ambiguous terms (nut scope, eggs for vegetarians) and ask about soy, sesame and coconut rather than assuming, but only when a candidate depends on the answer. Never claim a dish is safe or allergen-free; list identified conflicts and label checks.
- Imports create drafts. Keep original wording, never fill in missing quantities, instructions or servings, and block only the actions an issue affects. Every blocking issue needs a real action. Source yield and target portions stay separate; package, net and drained weights stay separate; compounds stay compound; excluded from calculations is not removed from the recipe. Link import works only for the labelled example.com demo links; there is no OCR or transcription.
- Pantry amounts are allocated once across planned meals in plan order (`allocateNeeds`). Not checked, don't have, have unknown and measured are distinct; zero is out of stock. "Have it, amount unknown" asks about the combined requirement, and the answer goes stale when requirement or stock changes. Transfers are once-only and use the amount bought. Never auto-add bought items, and pantry updates after cooking are optional and reviewed.
- Missing nutrition data is unknown, never zero. Illustrative ranges only (a fixed band, not measured uncertainty), per serving of the same serving definition, built from measured amounts. Report raw ingredient weight added per serving; never claim a cooked or plated weight (there is no yield model). A state confirmation never applies dry values to a cooked amount. Nutrition values are fixtures (`NUTRITION_SOURCE`), not verified data. Nutrition stays optional and collapsed unless a goal is set.
- Never convert between mass, volume and count. List regeneration keeps manual items and edits; changed edited/checked lines get a conflict; deleted lines are remembered.
- Photos: only from `assets/images/web/` with the "Photo: Pexels, page link pending" credit until page links are recorded in `assets/images/manifest.json`. Never show a different dish as a stand-in; recipes without a suitable photo use the typographic tile.
- Don't claim a durable save unless `save` succeeded.
- Black and white stage (`docs/product-context.md` Part 9): every color token is black or white, one typeface, no greys or reduced opacity in the interface, including no dimmed modal backdrop (owner decision pending; modals rely on inertness, focus containment and the 2 px border). Hierarchy, state and emphasis come from size, weight, spacing, rules, borders, position and wording. Reserved color values are kept beside the tokens; color may return only as an addition, and nothing may depend on it. Food photos show in natural color (`--photo-filter: none`) and carry no meaning; the interface around them stays black and white.
- Reuse `.btn--primary/--secondary/--quiet`. Secondary is outlined for this stage only (temporarily overrides C1, which returns with color).
- Reserved rule for when color returns: `#FEBD02` and `#A0B9C4` are fills behind dark text only.
- Chana masala (`HERO_RECIPE_ID`) is the demo's hero recipe; keep the demo path in README working.
- Touch targets ≥ 44px, visible focus, labeled controls. Mobile first: check 430 (iPhone 14/15 Pro Max), 393, 360 and 1280. White surfaces.
- Focus: script-moved focus (page titles, dialog title, `main`) shows a ring only for keyboard users; never remove `:focus-visible` from controls.
- Visual evidence is required for substantive UI work: `tools/review/capture.mjs` into a dated `reviews/` folder (git-ignored). If capture is unavailable, say so.
- Add a test in `tests/core.test.js` for any change to `js/core/` or the seed data.
- Prose style: concise, no em dashes in product copy, neutral food language (nothing implies traditional food needs correcting). At most one line of wordplay per screen; navigation, buttons, quantities, consequences, errors and allergy text stay plain.
