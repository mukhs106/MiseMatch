# mise & match: product and design decision record

Updated 2026-10-29, first working build (branch `feature/first-working-mvp`).

This is the living record for product, design and implementation decisions. The background history is in the earlier project context file (`recipe-app-project-context.md`, kept outside this repo). Statuses follow that file: **Confirmed** (explicit user decision), **Provisional** (implementation default for this iteration, open to change), **Proposed** (my recommendation, not yet approved), **Open** (needs a decision or evidence).

What this build did not have access to: earlier chats, the Figma file, Google Stitch screens and any testing records. Nothing here is based on them.

## 1. Product focus

| Decision | Status | Notes |
| --- | --- | --- |
| Core is personalization and transparent ingredient adaptation | Confirmed | Most design and build effort went to swaps, portions, availability and consequences. |
| Saving, My Recipes and grocery list use familiar patterns, built efficiently | Confirmed | Bookmark-style save, card list, checklist-style list. |
| Reference scenario: a familiar Indian meal adapted for more protein or fiber | Confirmed | Chana palak (add paneer, peas, brown basmati), masoor dal (more dal, less rice; add spinach), paneer bhurji (add eggs or peas). |
| Nutrition tracking is optional; no moralizing labels | Confirmed | Goals are toggles that highlight ideas and open estimates. Nothing is logged. Copy says "more protein", never "healthy". |
| No onboarding | Confirmed | App opens on My Recipes in a demo starting state. |
| Name "mise & match" | Provisional | Brief asked to use it provisionally. Recognition, pronunciation and availability are unchecked. |
| Audience: young adults cooking for themselves | Confirmed direction | Not validated with research. |

## 2. Visual foundations

All values live in `css/tokens.css`. They are implementation defaults for this iteration, not final brand approvals.

### Color roles (Provisional)

| Role | Value | Use |
| --- | --- | --- |
| Working surface | `#FFFFFF` | Page background, cards, inputs. |
| Supporting surface | `#F3F2E7` | Adapt panel, kitchen panel, nutrition, add-item form, before/after rows. |
| Brand / action | `#59000E` | Primary buttons, links, recipe titles, focus ring, wordmark. |
| Highlight | `#FEBD02` | Selected chips, "changed by you" dots and step numbers, wordmark ampersand. Fill only. |
| Highlight soft | `#FFF3C4` | Changed ingredient rows, applied ideas, notices. |
| Cool counterpoint | `#A0B9C4` | Selected availability segment. Fill only. |
| Cool soft | `#E6EEF1` | Partial-amount panel, informational notices, tags. |
| Ink | `#1F1A17` | Body text, card borders. Added for this build. |
| Muted text | `#5E5650` | Secondary text. Added for this build. |
| Control border | `#8A8178` | Input, chip and segment borders. |
| Warning text | `#7A5200` | "Changed" labels, data warnings. |

Measured contrast (WCAG 2.x), from a script run during the build:

| Pair | Ratio | Result |
| --- | --- | --- |
| `#59000E` on `#FFFFFF` | 14.67 | Passes AA/AAA for text |
| `#59000E` on `#F3F2E7` | 13.04 | Passes |
| `#FFFFFF` on `#59000E` (button text) | 14.67 | Passes |
| `#1F1A17` on `#FEBD02` | 10.25 | Passes; used for text on yolk |
| `#1F1A17` on `#A0B9C4` | 8.40 | Passes; selected availability |
| `#5E5650` on `#FFFFFF` / `#F3F2E7` | 7.18 / 6.39 | Passes for muted text |
| `#7A5200` on `#FFF3C4` | 6.22 | Passes for warning text |
| `#8A8178` on `#FFFFFF` | 3.82 | Passes 3:1 for control borders |
| `#FEBD02` on `#FFFFFF` | 1.68 | **Fails**: never used as text or as a sole boundary |
| `#A0B9C4` on `#FFFFFF` | 2.05 | **Fails**: never used as text |

Selected and changed states always pair color with a check icon, a text label, a border change or strikethrough.

### Typography (Provisional)

Apfel Grotezk by Collletttivo, SIL Open Font License 1.1 (license verified in the downloaded package; copy in `fonts/OFL-ApfelGrotezk.txt`). Bundled weights: Regular 400, Mittel 500, Fett 700, and Brukt (a roughened cut) for the wordmark only. No fallback font was needed. The stack falls back to Helvetica Neue / Arial / system sans if the files fail to load.

Checked in the browser: the font has its own glyphs for ½ ¼ ¾ → – · and curly quotes, so quantities render in the same face. Scale: 13 / 15 / 17 (body) / 20 / 26 / 34 / 44 px. Quantities use tabular figures.

### Spacing and controls (Provisional)

4px base scale (4–64px). Touch targets are at least 44px; primary controls are 48px. Pill buttons are primary (wine fill), secondary (ink outline) or quiet (underlined link style). Cards with an ink border and a 2px offset shadow mark the main objects (saved recipes, swap options, shopping bar), giving a tactile, printed feel. Plain lists separated by rules handle ingredients, the list and the collection, so the page isn't a stack of identical boxes.

### Drawing accents (Provisional)

Sparse hand-drawn SVGs: a squiggle under recipe titles, a drawn arrow in before/after comparisons, a pot for empty states, a small spark next to Ideas. They are placeholders for Suhani's own drawings. **Open:** the illustration style.

## 3. Screens and what each does

| Screen | Purpose | What changes there |
| --- | --- | --- |
| My Recipes (`#/`) | Decide what to cook; return to saved recipes. | Quick "what's in your kitchen" chips with suggestions (including when a supported swap covers a gap), saved recipe cards showing adapted status and list status, demo collection with Save, About and Reset demo. |
| Recipe (`#/recipe/:id`) | The adaptation workspace. | Servings, your changes (undo each, undo last, restore original), availability per ingredient (Have / Some with amount / Need; staples as a single check), Swap per ingredient, Ideas with optional goals, rough nutrition, method with changed steps marked, a shopping bar, and a toggle between My version and Original. |
| Swap sheet (dialog) | Compare before committing. | Options for one ingredient, then a before/after preview: quantity diff at current servings, flavor, texture, quantities, prep, nutrition range change, method changes with the old text, cautions, and conflict handling. Bottom sheet on mobile, side panel at 720px and up. |
| Grocery list (`#/list`) | Shop from adapted needs. | Grouped by aisle, check off, edit amounts, remove, add your own, resolve conflicts, add back removed items, update when a recipe changed. |

The Reset demo confirmation reuses the sheet.

## 4. Behavior decisions (current implementation)

- **One adaptation state per recipe** (`{ servings, applied }`) drives everything shown: ingredients, steps, nutrition and shopping needs (`js/core/adapt.js`). The source recipe is never mutated (tested). "Original" renders the source as written.
- **Adapted version is retained** automatically and persists. Unsaving a recipe keeps its version. There is one version per recipe. **Open:** whether people want several named versions.
- **Swaps are explicit**: preview first, then "Apply to my version". Each applied swap can be undone individually. An in-memory undo stack covers servings changes too, and "Restore original" is undoable. The undo stack is not persisted across reloads; individual swaps still can be removed after a reload.
- **Composition order:** replacements, omissions and additions first, then quantity adjustments (applied to whatever fills the slot), then portion scaling. Example: moong dal + "more dal, less rice" + 2 servings = 150 g moong.
- **Unsupported combinations** are explained rather than resolved silently. Two swaps on one ingredient, or declared incompatibilities such as "extra egg" with "tofu instead of eggs", show the reason and offer an explicit "Switch to this swap". Ingredients with no tested swap say so, with a reason where we have one (chickpeas in chana palak, garam masala).
- **Scaling:** linear by default; pan fat scales at half rate; spices and salt scale but are marked "to taste" when servings change. Display rounds to measurable amounts (¼ tsp, 5 g or 10 g steps, ½ counts). The shopping list rounds counts up.
- **Availability ("what you have")** is one light record shared across recipes and the home chips, not a maintained inventory. Unmarked counts as needed, and the UI says so. "Some" accepts an amount in a compatible unit. Without an amount, or with an incomparable unit, the full amount stays on the list, flagged.
- **Shopping needs** = adjusted quantity minus available amount in the same unit family. Mass, volume and count never convert into each other.
- **List regeneration** (`syncRecipe`) tracks each recipe's contribution per line. Manual items are untouched. Lines whose amount changed after you edited or checked them get a conflict ("Use 300 g / Keep 400 g"). Lines no recipe needs are removed unless edited or checked, in which case they're flagged. Deleted or cleared generated lines are remembered and shown as "removed but still in your recipes" with "Add back", never re-added silently. Same item and unit family merges across recipes ("For Chana palak, Masoor dal tadka").
- **Out-of-date detection:** each synced recipe stores a signature of its needs. The recipe and the list both say when a recipe changed since it was added.
- **Nutrition:** protein and fiber only, per serving, as ±15% ranges from typical per-100 g values. Seasonings are deliberately excluded as negligible. If a meaningful ingredient has no reliable value (split moong dal fiber), the nutrient shows "can't estimate" and comparisons show "can't compare", rather than a misleading low number.
- **Persistence:** localStorage key `mise-match:v1`, written on every change. Reset demo clears it and restores the starting state (two saved recipes, nothing marked, empty list).

## 5. Seed data (demo)

Four recipes written for the prototype from common home-style versions, not tested: Chana palak, Paneer bhurji, Masoor dal tadka, Tomato and egg stir-fry. There are 21 recipe-specific swaps: missing-ingredient swaps (frozen spinach, kale, fresh or canned tomatoes, tofu, half paneer half tofu, moong dal, oil for ghee, skip scallions), a preference swap (tofu instead of eggs), and nutrition-oriented ones (add paneer, peas, eggs, spinach or edamame; brown basmati; more dal, less rice; one more egg each). Each has flavor, texture, quantity, prep and nutrition notes. Dairy-related swaps carry a caution that they don't make the meal dairy-free. Nutrition figures are rounded typical values in the style of USDA FoodData Central, not lab data.

## 6. Deferred (not in this build)

Importing from links, social posts or video; handwritten capture; accounts and sync; live AI suggestions or generated swaps; onboarding; a persistent pantry inventory; budget, ratings, restaurant and seasonal features; cuisine, taste and allergy profiles; multiple named versions per recipe; meal planning.

## 7. Known limitations

- Pantry amounts are subtracted per recipe. Two recipes on the list can both count the same 100 g you have.
- Generated list lines can't be renamed (only manual ones). Amount edits keep the line's unit.
- The undo stack resets on reload.
- Nutrition covers only protein and fiber, and the catalog is small.
- Swaps are hand-written per recipe. Adding recipes means writing rules, which is intentional for credibility but slow.
- Verified in a Chromium-based browser pane at 430 × 932 and 1280 × 860. Not checked in Safari or Firefox, on a physical phone, or with a screen reader. The UI relies on `:has()` and `<dialog>` (supported in current Safari, Chrome and Firefox).
- The wordmark uses the Brukt cut at small size; its legibility at very small sizes is unreviewed.

## 8. Verification log (this build)

- `npm test`: 15 tests pass. They cover seed-data integrity (every slot, item and step reference resolves; every swap renders without leftover tokens), unit conversion and formatting, portion scaling including pan fat, source immutability, swap apply, undo, compose and omit, added steps, conflicts, nutrition direction and missing data, partial availability and incompatible units, needs following the adapted recipe, list regeneration (manual kept, edits flagged, deletions remembered, add back, orphans, cross-recipe merge, clear checked), suggestions, and save/reload/reset.
- Browser walkthrough at 430px: swap preview → apply → focus returns to trigger; partial availability (65 g needed, 50 g on hand → 15 g on list); spices marked via "I have all of these"; add to list; list edit, delete and manual add; servings change → "Update list" → conflict on the edited line, manual item kept, deleted item offered as "Add back"; same-ingredient and declared conflicts; unsupported explanation; goals reorder ideas; undo; original view; reload persists; Reset demo. Also checked at 1280px (two columns, side shopping card). No console errors.
- Fixed during verification: booleans not rendering in `aria-pressed`, a stale dialog `close` event emptying a newly opened sheet, a `pagehide` save that could overwrite newer storage, duplicate "Rice" chips, a prep note that didn't scale with servings, missing nutrition data showing as a low number, toast covering the shopping bar, the shopping bar covering controls on wide screens.

## 9. Next priorities (Proposed)

1. Put the swap comparison in front of 3–5 target users with the dal and chana palak scenarios: do they understand the consequences, and do they trust the estimates?
2. Decide whether "what you have" should stay light or become a persistent pantry with a light review prompt.
3. Replace placeholder doodles with Suhani's drawings and settle white vs `#F3F2E7` roles after seeing them in use.
4. Expand the seed set carefully (each recipe needs written swaps), and consider letting people add their own recipes by hand before any import automation.
5. Cross-browser and screen reader pass; real-device check at 430px.
