# mise & match

Recipe adaptation app for young adults. Core: adapt a recipe to what you have, portions, and optional protein/fiber goals, and explain what each change does to the dish. Saving, My Recipes and the grocery list are supporting features. Detailed product and design decisions live in `docs/product-context.md`; read it before changing scope, data or visual language.

Queued work lives in docs/queue/QUEUE.md; run one task per session with /next and log results in docs/build-log.md.

## Commands (verified)

- `npm start` serves the app at http://localhost:8080 (Node 18+, no dependencies). Opening `index.html` directly from disk does not work because of ES modules.
- `npm test` runs the core tests (`node --test`, no dependencies).

## Structure

- `js/data/` seed data only: `items.js` (catalog, typical nutrition), `recipes.js`, `swaps.js` (recipe-specific rules with effects).
- `js/core/` pure logic, no DOM: `adapt.js` (derive displayed recipe), `units.js`, `nutrition.js`, `shopping.js` (needs + list regeneration), `suggest.js`.
- `js/store.js` localStorage persistence (one key, `mise-match:v1`).
- `js/ui/` views as functions of state returning escaped HTML via `html```; `js/app.js` owns state, actions, routing, focus and the dialog.
- `css/tokens.css` is the only place for raw colors, type, spacing and control sizes.
- `assets/brand/wordmark.svg` is the logo slot; `assets/icons/*.svg` are placeholder icons for Suhani's drawings, used via `icon(name)` at one size (20px); `assets/accents/*.svg` are temporary placeholder accents. Don't inline new SVGs or add per-context icon sizes.

## Rules

- Never mutate source recipes. The displayed recipe, steps, nutrition and shopping needs are all derived from `{ servings, applied }` per recipe.
- Swaps are recipe-specific. Include an `effects` dimension only when there is something to say; never generic "No change." Unsupported combinations need an explicit reason (`conflicts`, `noSwap` or `unsupported`), not a silent result. Swap buttons appear only where swaps exist; no dead-end buttons.
- Shared on-hand state is presence only (`have` / `need`); partial amounts belong to each recipe's adaptation (`partial`).
- Missing nutrition data is unknown, never zero. Show ranges only and label them as rough estimates. No moralizing food labels; nutrition stays optional.
- Never convert between mass, volume and count. Incompatible amounts get flagged.
- List regeneration must keep manual items and user edits; edited or checked lines that change get a conflict, deleted lines are remembered.
- Label demo data as demo data. Don't claim allergy safety.
- `#FEBD02` and `#A0B9C4` are fills behind dark text only; they fail as text on white. Meaning is never carried by color alone.
- At most one large burgundy or yellow color block per screen. No outlined buttons; reuse `.btn--primary/--secondary/--quiet` (secondary is a tonal fill).
- Chana masala (`HERO_RECIPE_ID`) is the demo's hero recipe; keep the demo path in README working.
- Touch targets ≥ 44px, visible focus, labeled controls. Mobile first around 430px; check 960px+ too.
- Add a test in `tests/core.test.js` for any change to `js/core/` or the seed data.
- Prose style for docs and copy: concise, no em dashes in product copy.
