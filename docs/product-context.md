# mise & match: product and design decision record

Updated 2026-10-29, demo polish pass (branch `feature/first-working-mvp`).

> **Pending: v0.3 merge.** The brief asked to merge an attached `product-context.md` v0.3 (decision log, visual personality, pantry model, chana masala scenario, behavior rules). That file was not available to this session: the only context files found were the original `recipe-app-project-context.md` (and an identical copy) and `recipe-app-claude-handoff.md`. Nothing from v0.3 has been merged or guessed. Once the file is in the repo or Downloads, merge it here and flag any contradiction with the implementation below rather than changing code silently.

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
| Hero recipe: chana masala, 4 servings | Confirmed (2026-10-29) | First in the demo collection, and a "Start here" block at the top of My Recipes opens it. The app still opens on My Recipes rather than jumping into the recipe; see Open questions. |
| Priority is a polished, stable demo path over breadth | Confirmed (2026-10-29) | No new features beyond the hero recipe and the visual pass. |

### Decision log

| Date | Decision | Status |
| --- | --- | --- |
| 2026-10-29 | Keep "what you have" light and shared across recipes. No lasting pantry and no review prompt. | Confirmed |
| 2026-10-29 | One adapted version per recipe is enough for the MVP. Named versions deferred. | Confirmed |
| 2026-10-29 | Keep the surface split: white for working content, `#F3F2E7` for adaptation controls and panels. | Confirmed |
| 2026-10-29 | Chana masala is the hero demo recipe with five labeled demo swaps, plus an explained unsupported request (lentils). | Confirmed |
| 2026-10-29 | Light visual pass: placeholder black icons at one size, a wordmark image slot for a script logo (no script web font), at most one burgundy or yellow color block per screen, no new outlined button styles. | Confirmed |

## 2. Visual foundations

All values live in `css/tokens.css`. They are implementation defaults for this iteration, not final brand approvals.

### Color roles (Provisional)

| Role | Value | Use |
| --- | --- | --- |
| Working surface | `#FFFFFF` | Page background, cards, inputs. |
| Supporting surface | `#F3F2E7` | Adapt panel, kitchen panel, nutrition, add-item form, before/after rows. |
| Brand / action | `#59000E` | Primary buttons, links, recipe titles, focus ring, and the one color block on My Recipes (the chana masala hero). |
| Highlight | `#FEBD02` | Selected chips, "changed by you" dots and step numbers, the ampersand in the placeholder wordmark. Fill only. |
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
| `#FFFFFF` on `#59000E` (button and hero text) | 14.67 | Passes |
| `#F3F2E7` on `#59000E` (hero eyebrow) | 13.04 | Passes |
| `#1F1A17` on `#FEBD02` | 10.25 | Passes; used for text on yolk |
| `#1F1A17` on `#A0B9C4` | 8.40 | Passes; selected availability |
| `#5E5650` on `#FFFFFF` / `#F3F2E7` | 7.18 / 6.39 | Passes for muted text |
| `#7A5200` on `#FFF3C4` | 6.22 | Passes for warning text |
| `#8A8178` on `#FFFFFF` | 3.82 | Passes 3:1 for control borders |
| `#FEBD02` on `#FFFFFF` | 1.68 | **Fails**: never used as text or as a sole boundary |
| `#A0B9C4` on `#FFFFFF` | 2.05 | **Fails**: never used as text |

Selected and changed states always pair color with a check icon, a text label, a border change or strikethrough.

### Typography (Provisional)

Apfel Grotezk by Collletttivo, SIL Open Font License 1.1 (license verified in the downloaded package; copy in `fonts/OFL-ApfelGrotezk.txt`). Bundled weights: Regular 400, Mittel 500, Fett 700. Brukt was removed when the wordmark became an image slot. No fallback font was needed. The stack falls back to Helvetica Neue / Arial / system sans if the files fail to load.

Checked in the browser: the font has its own glyphs for ½ ¼ ¾ → – · and curly quotes, so quantities render in the same face. Scale: 13 / 15 / 17 (body) / 20 / 26 / 34 / 44 px. Quantities use tabular figures.

### Spacing and controls (Provisional)

4px base scale (4–64px). Touch targets are at least 44px; primary controls are 48px. Pill buttons are primary (wine fill), secondary (ink outline) or quiet (underlined link style). Cards with an ink border and a 2px offset shadow mark the main objects (saved recipes, swap options, shopping bar), giving a tactile, printed feel. Plain lists separated by rules handle ingredients, the list and the collection, so the page isn't a stack of identical boxes.

### Wordmark, icons and color blocks (Confirmed direction, placeholder assets)

- **Wordmark slot:** the header shows `assets/brand/wordmark.svg` at a fixed 32px height with width auto. It is a placeholder (sans text with a yolk ampersand). Replace the file with the script logo; if it's a PNG, change the `src` in `index.html`. No script web font is loaded.
- **Icons:** 14 plain black stroke SVGs in `assets/icons/<name>.svg`, all rendered at 20 × 20 px through `icon(name)` in `js/ui/icons.js`. Replace any file with an ink drawing of the same name. No icon sits on a burgundy fill, so black always has contrast.
- **Color blocks:** a block here means a large filled `#59000E` or `#FEBD02` area, not a control state. My Recipes has one (the burgundy hero). The recipe page, list and sheet have none. The recipe page now has a single burgundy action ("Add to list"); Save uses the existing secondary style.
- **Not changed:** the servings control was already a minus/plus stepper, and no component styles were added or reworked beyond removing per-context icon sizes and tightening the availability segment's padding to fit the 20px check.

### Drawing accents (Provisional)

Sparse hand-drawn SVGs: a squiggle under recipe titles, a drawn arrow in before/after comparisons, a pot for empty states, a small spark next to Ideas. They are placeholders for Suhani's own drawings. **Open:** the illustration style.

## 3. Screens and what each does

| Screen | Purpose | What changes there |
| --- | --- | --- |
| My Recipes (`#/`) | Decide what to cook; return to saved recipes. | "Start here" chana masala block (becomes "Pick up where you left off" once adapted), quick "what's in your kitchen" chips with suggestions (including when a supported swap covers a gap), saved recipe cards showing adapted status and list status, demo collection with Save, About and Reset demo. |
| Recipe (`#/recipe/:id`) | The adaptation workspace. | Servings, your changes (undo each, undo last, restore original), availability per ingredient (Have / Some with amount / Need; staples as a single check), Swap per ingredient, Ideas with optional goals, rough nutrition, method with changed steps marked, a shopping bar, and a toggle between My version and Original. |
| Swap sheet (dialog) | Compare before committing. | Options for one ingredient, then a before/after preview: quantity diff at current servings, flavor, texture, quantities, prep, nutrition range change, method changes with the old text, cautions, and conflict handling. Bottom sheet on mobile, side panel at 720px and up. |
| Grocery list (`#/list`) | Shop from adapted needs. | Grouped by aisle, check off, edit amounts, remove, add your own, resolve conflicts, add back removed items, update when a recipe changed. |

The Reset demo confirmation reuses the sheet.

## 4. Behavior decisions (current implementation)

- **One adaptation state per recipe** (`{ servings, applied }`) drives everything shown: ingredients, steps, nutrition and shopping needs (`js/core/adapt.js`). The source recipe is never mutated (tested). "Original" renders the source as written.
- **Adapted version is retained** automatically and persists. Unsaving a recipe keeps its version. There is one version per recipe (confirmed for the MVP; named versions deferred).
- **Swaps are explicit**: preview first, then "Apply to my version". Each applied swap can be undone individually. An in-memory undo stack covers servings changes too, and "Restore original" is undoable. The undo stack is not persisted across reloads; individual swaps still can be removed after a reload.
- **Composition order:** replacements, omissions and additions first, then quantity adjustments (applied to whatever fills the slot), then portion scaling. Example: moong dal + "more dal, less rice" + 2 servings = 150 g moong.
- **Asked-for but unsupported swaps** (`recipe.unsupported`) appear in the swap sheet with a reason, alongside the supported options. Chana masala: lentils for chickpeas.
- **Steps can be inserted at the start** (`after: "start"`), used by the dried chickpeas soaking step.
- **Unsupported combinations** are explained rather than resolved silently. Two swaps on one ingredient, or declared incompatibilities such as "extra egg" with "tofu instead of eggs", show the reason and offer an explicit "Switch to this swap". Ingredients with no tested swap say so, with a reason where we have one (chickpeas in chana palak, garam masala).
- **Scaling:** linear by default; pan fat scales at half rate; spices and salt scale but are marked "to taste" when servings change. Display rounds to measurable amounts (¼ tsp, 5 g or 10 g steps, ½ counts). The shopping list rounds counts up.
- **Availability ("what you have")** is one light record shared across recipes and the home chips, not a maintained inventory. Unmarked counts as needed, and the UI says so. "Some" accepts an amount in a compatible unit. Without an amount, or with an incomparable unit, the full amount stays on the list, flagged.
- **Shopping needs** = adjusted quantity minus available amount in the same unit family. Mass, volume and count never convert into each other.
- **List regeneration** (`syncRecipe`) tracks each recipe's contribution per line. Manual items are untouched. Lines whose amount changed after you edited or checked them get a conflict ("Use 300 g / Keep 400 g"). Lines no recipe needs are removed unless edited or checked, in which case they're flagged. Deleted or cleared generated lines are remembered and shown as "removed but still in your recipes" with "Add back", never re-added silently. Same item and unit family merges across recipes ("For Chana palak, Masoor dal tadka").
- **Out-of-date detection:** each synced recipe stores a signature of its needs. The recipe and the list both say when a recipe changed since it was added.
- **Nutrition:** protein and fiber only, per serving, as ±15% ranges from typical per-100 g values. Seasonings are deliberately excluded as negligible. If a meaningful ingredient has no reliable value (split moong dal fiber), the nutrient shows "can't estimate" and comparisons show "can't compare", rather than a misleading low number.
- **Persistence:** localStorage key `mise-match:v1`, written on every change. Reset demo clears it and restores the starting state (two saved recipes, nothing marked, empty list).

## 5. Seed data (demo)

Five recipes written for the prototype from common home-style versions, not tested: Chana masala (hero), Chana palak, Paneer bhurji, Masoor dal tadka, Tomato and egg stir-fry.

**Chana masala (4 servings), demo swaps:** fresh to canned tomatoes (3 medium → 400 g); canned to dried chickpeas (200 g dried, an added overnight soak and 60–90 minute simmer step, cooking liquid in the sauce); fresh to ground ginger (1 tbsp → ¼ tsp, added briefly so it doesn't scorch); add paneer or add firm tofu for protein (200 g each; choosing both is blocked with a reason); add frozen spinach for fiber (130 g, thaw-and-squeeze step). Lentils for chickpeas is explained as unsupported. It reuses the catalog, the chana palak structure and its frozen spinach rule; it adds only two catalog items (dried chickpeas, ground ginger).

The other recipes have 21 recipe-specific swaps (27 in total): missing-ingredient swaps (frozen spinach, kale, fresh or canned tomatoes, tofu, half paneer half tofu, moong dal, oil for ghee, skip scallions), a preference swap (tofu instead of eggs), and nutrition-oriented ones (add paneer, peas, eggs, spinach or edamame; brown basmati; more dal, less rice; one more egg each). Each has flavor, texture, quantity, prep and nutrition notes. Dairy-related swaps carry a caution that they don't make the meal dairy-free. Nutrition figures are rounded typical values in the style of USDA FoodData Central, not lab data.

## 6. Deferred (not in this build)

Importing from links, social posts or video; handwritten capture; accounts and sync; live AI suggestions or generated swaps; onboarding; a persistent pantry inventory; budget, ratings, restaurant and seasonal features; cuisine, taste and allergy profiles; multiple named versions per recipe; meal planning.

## 7. Known limitations

- On-hand amounts are subtracted per recipe, so two recipes on the list can both count the same partial amount you have. Fixing it properly means allocating amounts across recipes inside list syncing, out-of-date detection and conflict checks, which isn't a small change. For now the list shows a note ("Check frozen spinach. You marked 50 g at home, and Chana palak and Chana masala each counted it…") whenever a partial amount is shared by two or more recipes on the list.
- Generated list lines can't be renamed (only manual ones). Amount edits keep the line's unit.
- The undo stack resets on reload.
- Nutrition covers only protein and fiber, and the catalog is small.
- Swaps are hand-written per recipe. Adding recipes means writing rules, which is intentional for credibility but slow.
- Verified in a Chromium-based browser pane at 430 × 932 and 1280 × 860. Not checked in Safari or Firefox, on a physical phone, or with a screen reader. The UI relies on `:has()` and `<dialog>` (supported in current Safari, Chrome and Firefox).
- The placeholder wordmark SVG uses Helvetica/Arial (images can't use the page's web font).
- In the scripted demo, a partial amount marked on fresh tomatoes stops mattering once the canned tomato swap is applied (availability belongs to the ingredient, not the slot). Mark the partial amount on rice instead.

## 8. Verification log

**Demo polish pass (2026-10-29).** `npm test`: 16 pass (new: chana masala dried chickpeas start-step insertion, composition at 2 servings, partial canned tomato subtraction, paneer/tofu block). Demo path checked by driving the real controls at 430 × 932 and 1280 × 860 from a fresh Reset demo: open chana masala from the hero → servings 2 → chickpeas and onion Have, spices "I have all of these", rice Some 100 g → compare and apply canned tomatoes (1½ medium → 200 g) → apply Add paneer → apply and then undo Add frozen spinach → lentils explanation shown → reload (2 servings, both swaps, paneer step persist) → Add to list → list shows rice 50 g (150 − 100), paneer 100 g, canned tomatoes 200 g, oil 2¼ tbsp → edit rice to 100 g (marked edited). Side sheet and two-column layout checked at 1280. No console errors. Fixed during the pass: duplicate "Chickpeas" chip, an awkward "cooked dried chickpeas" step, and the wider check icon wrapping the Swap button at 430px.

**First build.**

- `npm test`: 15 tests pass. They cover seed-data integrity (every slot, item and step reference resolves; every swap renders without leftover tokens), unit conversion and formatting, portion scaling including pan fat, source immutability, swap apply, undo, compose and omit, added steps, conflicts, nutrition direction and missing data, partial availability and incompatible units, needs following the adapted recipe, list regeneration (manual kept, edits flagged, deletions remembered, add back, orphans, cross-recipe merge, clear checked), suggestions, and save/reload/reset.
- Browser walkthrough at 430px: swap preview → apply → focus returns to trigger; partial availability (65 g needed, 50 g on hand → 15 g on list); spices marked via "I have all of these"; add to list; list edit, delete and manual add; servings change → "Update list" → conflict on the edited line, manual item kept, deleted item offered as "Add back"; same-ingredient and declared conflicts; unsupported explanation; goals reorder ideas; undo; original view; reload persists; Reset demo. Also checked at 1280px (two columns, side shopping card). No console errors.
- Fixed during verification: booleans not rendering in `aria-pressed`, a stale dialog `close` event emptying a newly opened sheet, a `pagehide` save that could overwrite newer storage, duplicate "Rice" chips, a prep note that didn't scale with servings, missing nutrition data showing as a low number, toast covering the shopping bar, the shopping bar covering controls on wide screens.

## 9. Next priorities (Proposed)

1. Merge v0.3 once available (see the note at the top).
2. Put the swap comparison in front of 3–5 target users with the chana masala scenario: do they understand the consequences, and do they trust the estimates?
3. Replace the placeholder icons, wordmark and doodles with Suhani's drawings and logo.
4. Expand the seed set carefully (each recipe needs written swaps), and consider letting people add their own recipes by hand before any import automation.
5. Cross-browser and screen reader pass; real-device check at 430px.

## 10. Open questions

- Should "opens toward chana masala" mean a hero block on My Recipes (built), or should a first visit land directly on the recipe?
- Selected kitchen chips use a `#FEBD02` fill. They're control states, not blocks, so they were left alone; confirm that reading of the one-block rule.
