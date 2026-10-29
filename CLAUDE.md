# mise & match

Recipe adaptation app for young adults. Core: adapt a recipe to what you have, portions, and optional protein/fiber goals, and explain what each change does to the dish. Saving, My Recipes and the grocery list are supporting features. Detailed product and design decisions live in `docs/product-context.md`; read it before changing scope, data or visual language.

## Commands (verified)

- `npm start` serves the app at http://localhost:8080 (Node 18+, no dependencies). Opening `index.html` directly from disk does not work because of ES modules.
- `npm test` runs the core tests (`node --test`, no dependencies).

## Structure

- `js/data/` seed data only: `items.js` (catalog, typical nutrition), `recipes.js`, `swaps.js` (recipe-specific rules with effects).
- `js/core/` pure logic, no DOM: `adapt.js` (derive displayed recipe), `units.js`, `nutrition.js`, `shopping.js` (needs + list regeneration), `suggest.js`.
- `js/store.js` localStorage persistence (one key, `mise-match:v1`).
- `js/ui/` views as functions of state returning escaped HTML via `html```; `js/app.js` owns state, actions, routing, focus and the dialog.
- `css/tokens.css` is the only place for raw colors, type, spacing and control sizes.

## Rules

- Never mutate source recipes. The displayed recipe, steps, nutrition and shopping needs are all derived from `{ servings, applied }` per recipe.
- Swaps are recipe-specific and must fill every `effects` field. Unsupported combinations need an explicit reason (`conflicts` or `noSwap`), not a silent result.
- Missing nutrition data is unknown, never zero. Show ranges only and label them as rough estimates. No moralizing food labels; nutrition stays optional.
- Never convert between mass, volume and count. Incompatible amounts get flagged.
- List regeneration must keep manual items and user edits; edited or checked lines that change get a conflict, deleted lines are remembered.
- Label demo data as demo data. Don't claim allergy safety.
- `#FEBD02` and `#A0B9C4` are fills behind dark text only; they fail as text on white. Meaning is never carried by color alone.
- Touch targets ≥ 44px, visible focus, labeled controls. Mobile first around 430px; check 960px+ too.
- Add a test in `tests/core.test.js` for any change to `js/core/` or the seed data.
- Prose style for docs and copy: concise, no em dashes in product copy.
