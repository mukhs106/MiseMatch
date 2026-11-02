# mise & match

Recipe adaptation app. Core: adapt familiar Indian and South Asian dishes to someone's pantry, portions, dietary requirements and optional nutrition goals, and explain the consequences before they cook. Saving, planning and the shopping list support that. Primary destinations: Today, Recipes, Pantry (on hand + shopping list), Saved; avatar → Requirements and settings. The adaptation flow is `#/adapt/:id/needs|options|compare|shop`. Detailed product and design decisions live in `docs/product-context.md` (v0.6 section first); read it before changing scope, data or visual language.

Queued work lives in docs/queue/QUEUE.md; run one task per session with /next and log results in docs/build-log.md.

## Commands (verified)

- `npm start` serves the app at http://localhost:8080 and prints a LAN address for testing on a phone on the same Wi-Fi (Node 18+, no dependencies). Opening `index.html` directly from disk does not work because of ES modules.
- `npm test` runs the core tests (`node --test`, no dependencies).
- Review evidence: `cd tools/review && npm install` once, then `node capture.mjs --label before|after [--video] --out ../../reviews/YYYY-MM-DD-topic`. Uses installed Chrome, falling back to Playwright's Chromium; set `FFMPEG=/path/to/ffmpeg` to use a system ffmpeg. Dependencies live only in `tools/review/`.

## Structure

- `js/data/` seed data only: `items.js` (catalog: aliases, allergen tags, fixture nutrition, ambiguous names), `recipes.js` (10 dishes), `swaps.js` (authored rules), `bundles.js` (authored rule combinations).
- `js/core/` pure logic, no DOM: `adapt.js` (derive a version), `engine.js` (combination check, evaluation, candidates, resolve), `constraints.js` (hard exclusions, questions, limits, targets, preferences), `normalize.js` (ingredient lines, matching, per-action validation), `importer.js` (JSON-LD, pasted text, demo link fixtures, drafts), `versions.js` (sessions, saved versions, plan entries, cook records), `units.js`, `nutrition.js`, `pantry.js`, `shopping.js`, `suggest.js`.
- `js/store.js` localStorage persistence (key `mise-match:v1`, state `version: 2`; v1 saves migrate).
- `js/ui/` views as functions of state returning escaped HTML via `html```; `js/app.js` owns state, actions, routing, focus and the dialog. Shared pieces in `ui/parts.js`. Screen styles for the current flow are in `css/flow.css`; `css/screens.css` still holds older shared styles (list, pantry, sheet).
- `css/tokens.css` is the only place for raw colors, type, spacing and control sizes.
- The wordmark is typographic (`.wordmark` in `index.html` and `css/base.css`), a working identity, not a final logo. `assets/icons/*.svg` are placeholder icons for Suhani's drawings, used via `icon(name)` at one size (20px); `assets/accents/*.svg` are temporary placeholder accents. Don't inline new SVGs or add per-context icon sizes.

## Rules

- Never mutate source recipes. Every displayed version, step, nutrition figure and shopping need is derived from `{ servings, applied }`.
- Working sessions autosave with undo; a saved version changes only on an explicit Save. Planned meals and cook records store their own copy (rules, servings, version id and revision); a later version edit is offered as a reviewable update, never applied silently.
- Rules are recipe-specific and labelled as suggestions (`evidence: suggested`). Never present a rule, bundle or recipe as team-tested or community-verified; none are. Effects use texture, richness, aroma, acidity, cooking, quantity, unchanged, only where there is something to say. Every balancing adjustment needs a recipe-specific `why`. No numeric flavor scores.
- A combination is supported only if it is an authored bundle or every pair is in `combinesWith`; otherwise it is labelled untested. Declared conflicts and same-slot rules are blocked.
- Hard exclusions (diet, allergens) and limits filter; they are never weighed against targets or preferences. Clarify ambiguous terms (nut scope, eggs for vegetarians) and ask about soy, sesame and coconut rather than assuming. Never claim a dish is safe or allergen-free; list identified conflicts and label checks.
- Imports create drafts. Keep original wording, never fill in missing quantities, instructions or servings, and block only the actions an issue affects. Link import works only for the labelled example.com demo links; there is no OCR or transcription.
- Pantry amounts are allocated once across planned meals in plan order (`allocateNeeds`). "Have it, amount unknown" asks for confirmation; it is never treated as enough. Never auto-add bought items.
- Missing nutrition data is unknown, never zero. Ranges only, per serving of the same serving definition; report serving-size changes. Nutrition values are fixtures (`NUTRITION_SOURCE`), not verified data. Nutrition stays optional and collapsed unless a goal is set.
- Never convert between mass, volume and count. List regeneration keeps manual items and edits; changed edited/checked lines get a conflict; deleted lines are remembered.
- Photos: only from `assets/images/web/` with the "Photo: Pexels, page link pending" credit until page links are recorded in `assets/images/manifest.json`. Never show a different dish as a stand-in; recipes without a suitable photo use the typographic tile.
- Black and white stage (`docs/product-context.md` Part 9): every color token is black or white, one typeface, no greys or reduced opacity in the interface. Hierarchy, state and emphasis come from size, weight, spacing, rules, borders, position and wording. Reserved color values are kept beside the tokens; color may return only as an addition, and nothing may depend on it. Food photos show in natural color (`--photo-filter: none`) and carry no meaning; the interface around them stays black and white.
- Reuse `.btn--primary/--secondary/--quiet`. Secondary is outlined for this stage only (temporarily overrides C1, which returns with color).
- Reserved rule for when color returns: `#FEBD02` and `#A0B9C4` are fills behind dark text only.
- Chana masala (`HERO_RECIPE_ID`) is the demo's hero recipe; keep the demo path in README working.
- Touch targets ≥ 44px, visible focus, labeled controls. Mobile first: check 430 (iPhone 14/15 Pro Max), 393, 360 and 1280. White surfaces.
- Focus: script-moved focus (page titles, dialog title, `main`) shows a ring only for keyboard users; never remove `:focus-visible` from controls.
- Visual evidence is required for substantive UI work: `tools/review/capture.mjs` into a dated `reviews/` folder (git-ignored). If capture is unavailable, say so.
- Add a test in `tests/core.test.js` for any change to `js/core/` or the seed data.
- Prose style: concise, no em dashes in product copy, neutral food language (nothing implies traditional food needs correcting). At most one line of wordplay per screen; navigation, buttons, quantities, consequences, errors and allergy text stay plain.
