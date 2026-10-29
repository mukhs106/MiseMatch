# Product context: mise & match (working name)

Version: 0.5, October 29, 2026. Merges the owner's decision record v0.4 with the implementation record kept in this repository.
Owner: Suhani
Audience: Claude Code and anyone working in this repository
Status: living document. Provisional decisions are expected to change.

## How to use this file

Read this before changing product behavior, data structure, copy, or visual styling. Parts 1 to 6 are the decision record (from v0.4): what the product is for, which decisions are confirmed versus provisional, and the behavior rules that keep adaptation trustworthy. Part 7 records what is actually built, including contrast checks, limitations and verification. Part 8 records how the contradictions found during the v0.4 merge (C1 to C10) were resolved by T04.

Statuses used throughout: **Confirmed** (explicit owner decision), **Working** (accepted, still refinable), **Provisional** (a default chosen so the build can proceed; expect revision), **Proposed** (a recommendation awaiting owner approval), **Superseded** or **Rejected** (kept so the project does not loop back), **Open** (unresolved).

A requirement in this file is not evidence that it has been built. Verify against the code before reporting anything as done.

### Evidence gaps

Not inspected by anyone working in the repository: the Figma file and its eight screens, the Google Stitch screens, the original October 22 test notes, the En Clair script font files and license, and the drafted recipe-mvp-design skill. The repository, its code and the Apfel Grotezk license have been inspected (Part 7).

### Decision log

| Date | Decision | Status |
| --- | --- | --- |
| Oct 28 | mise & match selected as name | Working, retained for MVP |
| Oct 29 | Move to a working coded MVP; brand refined in later iterations | Confirmed |
| Oct 29 | First build started from the Appendix A prompt | Confirmed; built, see Part 7 |
| Oct 29 | Chana masala is the first demo meal and adaptation scenario | Confirmed; built as the hero recipe |
| Oct 29 | Pantry model: light shared "on hand" list, no maintained inventory | Confirmed |
| Oct 29 | Visual personality drawn from four owner references (Section 2) | Confirmed direction |
| Oct 29 | En Clair Regular script as wordmark candidate | Working, license unverified |
| Oct 29 | Outlined pill buttons from the We Spirit reference dropped | Confirmed; secondary button restyled as a tonal fill (C1) |
| Oct 29 | Build efficiently: prioritize the demo path over breadth | Confirmed |
| Oct 29 | Pantry stays a light shared list; no lasting pantry or review prompt for the MVP | Confirmed (answers Claude Code question 1) |
| Oct 29 | One adapted version per recipe is enough for the MVP; named versions deferred | Confirmed (answers question 2; v0.4 listed it as Proposed, the owner confirmed it in the Claude Code session) |
| Oct 29 | Keep the surface split: white for working content, `#F3F2E7` for adaptation controls and panels | Confirmed (answers question 3; v0.4 listed it as Proposed, the owner confirmed it in the Claude Code session) |
| Oct 29 | Apfel Grotezk confirmed usable: SIL OFL 1.1, glyphs checked by Claude Code | Working |
| Oct 29 | October 22 testing entry recorded (see below); next test: comprehension and trust of swaps plus portions | Confirmed |
| Oct 29 | Build queue set up: tasks in docs/queue, run one at a time with /next, no automated merging | Confirmed |
| Oct 29 | Light visual pass: placeholder black icons at one size, a wordmark image slot (no script web font), at most one burgundy or yellow color block per screen | Confirmed; built |
| Oct 29 | Keep the "Start here" chana masala block on My Recipes rather than landing directly on the recipe, because pantry suggestions on home are part of what is being tested | Confirmed |
| Oct 29 | Selected kitchen chips are control states, not color blocks, so their yellow fill stays, provided the selected state is also shown without color (check icon and `aria-pressed`). Verified in code: both are present. | Confirmed |
| Oct 29 | The demo's partial amount goes on rice (a partial on fresh tomatoes stops counting once the canned tomato swap is applied) | Confirmed |
| Oct 29 | C8: partial amounts move into each recipe's adaptation state; the shared on-hand list keeps presence only | Confirmed (T04) |
| Oct 29 | C1: secondary button becomes a tonal fill with ink text and no outline (`#F3F2E7` on white surfaces, white on `#F3F2E7` surfaces); primary stays burgundy | Confirmed (T04) |
| Oct 29 | C3: the four drawn accents stay as temporary placeholders, each a swappable SVG in assets/accents/; placeholder accents are allowed if swappable and recorded as temporary | Confirmed (T04) |
| Oct 29 | C4: canned tomato copy is "more concentrated, cooked flavor, can be slightly more acidic, less fresh brightness"; the earlier record wording was wrong | Confirmed (T04) |
| Oct 29 | C5: ground ginger stays with the garlic step; the record changes to match | Confirmed (T04) |
| Oct 29 | C6: paneer carries a plain "contains dairy" note, stated as fact, not allergy guidance | Confirmed (T04) |
| Oct 29 | C2: the build's colors win; the record's color table follows the tokens | Confirmed (T04) |
| Oct 29 | C7: swap entry points appear only where swaps exist; no dead-end buttons | Confirmed (T04) |
| Oct 29 | C9: no generic "No change." text; a consequence dimension shows only when the data says something about it | Confirmed (T04) |
| Oct 29 | C10: when servings differ from the original, one short note says cooking times, pan size and oil may need adjusting; no per-ingredient logic | Confirmed (T04) |
| Oct 29 | Page and main content surfaces are pure white. The large `#F3F2E7` panels (adapt, kitchen, nutrition, add-item) are replaced by spacing, alignment and hairline rules; `#F3F2E7` stays only for small tonal controls (secondary buttons, tags, toggle track, before/after rows). Supersedes the earlier "`#F3F2E7` for adaptation controls and panels" split. | Confirmed (visual refresh) |
| Oct 29 | Working wordmark is typographic: "mise & match" in Apfel Grotezk Bold with a regular-weight ampersand, in burgundy. Replaces the placeholder image and the yellow ampersand badge. Editable working identity, not a final logo; En Clair remains an unverified candidate. | Confirmed direction (visual refresh); details Provisional |
| Oct 29 | Home hierarchy: a quiet "Start here" card instead of the burgundy banner, "Cook from what you have" as an optional disclosure, saved recipes on the first screen | Confirmed (visual refresh) |
| Oct 29 | Recipe page shows "Ways to adapt" (one entry per swappable ingredient, plus a jump to protein and fiber ideas) above the ingredient list | Confirmed (visual refresh) |
| Oct 29 | Focus moved by script (page titles on navigation, dialog title, skip-link target) shows a ring only for keyboard users; nothing is focused on first load | Confirmed (bug fix) |
| Oct 29 | Visual evidence (before/after PNGs, recorded walkthrough, noted viewport, revision, scenario, results, ZIP) is required for substantive UI reviews | Confirmed |

### October 22 testing: observations, revisions, and next question

**Date of testing:** October 22, 2026. **Entry written:** October 29, 2026.
**Evidence status:** observations as summarized by the owner. Original test notes, participant count, and quotes were not inspected for this entry.

#### What we observed

Participants' attention and interest centered on swapping ingredients. They wanted to see how a swap changes the recipe, not only that a swap exists. Changing portions and getting recipe and swap recommendations based on what is already in the pantry were the other needs that stood out.

#### What this changed

The earlier direction treated saving recipes and building lists as the main flow, with adaptation as a later phase. Testing confirmed the owner's correction: adaptation is the product, and saving and lists support it.

#### Two highest-priority issues and revisions

**Issue 1: Swaps were not central, and their effect on the recipe was not visible.**
Revision: every ingredient on the recipe page has a swap entry point. Swapping opens a comparison of the original and the replacement before anything changes: quantity, flavor, texture, preparation, the affected method step shown with the old text struck through, and rough nutrition ranges, with unknown data stated as unknown. Applying is explicit. Changes are then marked in place with the old amount, and each change can be undone, with "restore original" and an Original view always available.

**Issue 2: The recipe did not respond to the person's situation, meaning portions and pantry.**
Revision: a servings control scales quantities with practical rounding and notes for ingredients that do not scale linearly. Each ingredient can be marked Have, Some (with an amount), or Need. On My Recipes, tapping what is on hand produces suggestions, including recipes that are "one swap away." Protein and fiber Ideas offer goal-based adjustments without making tracking mandatory. The grocery list is derived from the adapted amounts minus what you have, and preserves manual edits.

Build note (C7, confirmed Oct 29): swap entry points appear only on ingredients that have written swaps. Ingredients with a recorded reason show an inline "No tested swap" disclosure; others show nothing. There are no dead-end buttons.

#### Next question to test

When someone changes portions and applies a swap, can they explain what changed in the dish and in their shopping list, and do they trust it enough to cook from it?

Planned task: "Make chana masala for 2 tonight with no fresh tomatoes." Success means the participant finds the swap without help, states one consequence before applying it, identifies what changed in the recipe afterward, and correctly predicts the grocery list. Secondary question: do pantry suggestions get used to choose what to cook?

## 1. Brief

### Vision

Make everyday cooking feel flexible, personal, and enjoyable, with less effort spent working out how to make a meal fit your day.

### Product description

mise & match helps you adapt a recipe to the ingredients you have, the number of people you are feeding, and your tastes or optional nutrition goals. Before you commit a change, it tells you what the change does to the dish. Once you apply it, the recipe and your shopping list update together, so there is nothing left to reconcile by hand.

### Problem

A saved recipe is a starting point, not a fit. Ingredients run out, portions change, and the meal you want does not always match what you have or need. The work of finding a replacement, recalculating quantities, wondering whether it will still taste right, and figuring out what to buy happens before cooking begins, and it is often the reason cooking feels like a chore. Existing tools either store recipes without helping you change them, or suggest substitutions without explaining their effect on the dish.

### Brand story

You can love food and still be tired of figuring out dinner. The recipe never quite matches your fridge, your plans, or what your body needs that week. mise & match works in that gap. It shows you what is possible with what you have, explains what each change will do to the food you actually enjoy, and keeps the practical details connected so you do not have to hold them in your head. Constraints are not a lesser version of cooking; they are where a lot of good cooking comes from.

### Who it is for

Confirmed direction: Gen Z and young adults cooking for themselves alongside the rest of adult life. Groups to investigate, not yet validated personas: people for whom planning and executive function make cooking harder, and people working toward nutrition goals who refuse to give up flavor or culturally familiar food. The product makes no clinical claims.

### Jobs to be done

1. **Adapt to what I have.** When a recipe needs something I do not have, show me a workable replacement and what it will change, so I can still make this meal instead of starting my search over.
2. **Fit the meal to me.** When I want a familiar dish for fewer people or with more protein or fiber, help me adjust it while keeping what I love about it, and tell me the effect on taste, texture, quantities, and preparation.
3. **Decide what to cook.** When I am choosing, show me which of my saved recipes I can make now or with one or two changes, so choosing takes less effort.
4. **Know what to buy.** Once I have adapted a recipe, give me an editable list of what I still need, so the changes carry through without extra work.

The anchoring example, in the owner's words: "I'm Indian, love Indian food, but I want more fiber and protein and nutrients. How do I alter it to fit my needs?" Cultural familiarity and enjoyment sit at the center. This is not a diet app and should never read like one.

### Brand principles (Proposed)

1. **Make possibility visible.** Lead with what someone can make, not what they lack.
2. **Keep the food worth wanting.** Flavor, culture, and enjoyment are never traded silently for efficiency or nutrition.
3. **Explain enough to choose.** Consequences appear at the moment of decision, in plain language, short enough to read in a few seconds.
4. **Do not create upkeep.** No feature should cost more effort to maintain than it saves.
5. **Energy with refinement.** Personality lives in type, color, drawing, and voice; quantities and actions stay calm and unmistakable.

### Voice (Proposed)

Warm, direct, a little playful, never patronizing. Speak like a friend who cooks well and does not make you feel behind. Name tradeoffs honestly ("a little tangier, ready 10 minutes sooner") rather than reassuring ("works great!"). Avoid diet and moralizing language: no "guilt free," "clean," "cheat," "no refined sugar" style badges, or calorie-first framing.

## 2. Brand decisions

### Visual personality (Confirmed direction, October 29)

The owner supplied four references. Together they describe a calm, white, legible working interface with real character at its edges: ink drawings with personality, warm color blocks in brand moments, and a handwritten wordmark. The references are direction, not material to copy; all illustration will be original.

| Reference | What to take | What not to take |
| --- | --- | --- |
| En Clair Regular script, "Mise & Match" | A handwritten, personal wordmark that feels like a note in a family recipe book. Warmth and culture without stereotype. | Script anywhere in the interface. It is a logo and occasional brand-moment face only. |
| Black ink vegetable drawings (bold fills, white inner detail) | The working illustration language: monochrome ink, confident line weight, cross-sections that show what food is made of. Suits icons, ingredient marks, and empty states, and prints well at small sizes. | Overly intricate detail at icon sizes. |
| Oil-pastel food drawings with hand lettering | An expressive second mode for rare moments (hero, empty My Recipes, celebration when a list is done). Proves color can feel tactile rather than digital. | Using it as the everyday UI style; it competes with quantities. |
| Feastio food site | Color blocking in deep burgundy, forest green, cream, and saturated yellow; food shown on patterned, colorful surfaces; pill-shaped filter chips; generous display type. Cultural warmth and appetite. | Moralizing nutrition badges ("No Refined Sugar"), stock luxury-dining tone, dense hero photography in the working flow. |
| We Spirit wine app | Stark white surfaces, black type, the "- 2 +" quantity stepper, and hand-drawn characters with faces that give a plain layout humor. Proof that restraint plus one playful drawing is enough. | Outlined pill buttons (dropped by the owner Oct 29); all-caps body text, which hurts readability of ingredient lists. |

Resulting rule of thumb: the interface is white and ink; personality comes from drawing, the wordmark, and one color block per screen at most. This resolves the earlier "kitchen notebook versus lively market" question as a notebook interface with market moments.

Open: both the Feastio and We Spirit references use a serif or condensed serif for large headlines. Adding a display serif would make three typefaces with the script. Test Apfel Grotezk at headline sizes first; revisit a serif only if headlines feel flat.

### Name: mise & match

Status: **Working name for the MVP.** Selected October 28, reopened for review, retained so implementation is not blocked.

Strengths (interpretation): it joins preparation (mise en place) and adaptation (matching what you have) in two short words with a rhythm people can say aloud. The ampersand gives the script wordmark a natural centerpiece, as the reference shows.

Risks to test (not findings): whether the audience reads "mise" correctly ("meez") and can spell it after hearing it once. Spoken aloud it sounds like "mix and match," which helps recall but hurts search. Handles and domains will likely need "miseandmatch." Domain, app store, and trademark availability have not been checked. A five-person hear-it, spell-it, explain-it test is recommended before public use.

Open: casing. The wordmark reference uses "Mise & Match"; the project has written "mise & match" in running text. The working typographic wordmark is lowercase, matching running text and the browser title.

Rejected naming territory: names implying portions or abundance (Feast, Potluck, Helpings, Little Feast, Another Helping). Individual rejection reasons were not recorded. Earlier assistant candidates (Stirnote, Stirfolk, Cookleaf, Pantrykin, Mingle, Tinker) were never selected.

### Typography

**Apfel Grotezk (Working)** for all interface text and headings. Rationale (interpretation): a grotesk with quirks gives energy and warmth without decoration, and keeps the system small. Build check results are in Part 7: license verified (SIL OFL 1.1), fraction and arrow glyphs present, tabular figures used for quantities. Small annotations (13 px) and long titles have been seen in the build but not formally reviewed.

**En Clair Regular (Working, wordmark only).** Use as an SVG or image wordmark, not a loaded web font in the interface. Its foundry and commercial license have not been verified; the project requires commercially free fonts, so confirm before any public use. The image slot was removed on Oct 29 in favor of a typographic working wordmark; an En Clair image can replace it later if the license checks out.

Earlier explorations (Source Serif, Lastik, Instrument Serif) were references, not an approved pairing.

### Color (Provisional; the build's tokens are the record, C2)

The build prompt's defaults, as implemented in `css/tokens.css`. They are not final brand approvals. Measured contrast for every pair in use is in Part 7.

| Role | Color | Use | Contrast |
| --- | --- | --- | --- |
| Working surface | `#FFFFFF` | Page background, recipe body, lists, cards, inputs | Base |
| Supporting surface | `#F3F2E7` | Small tonal controls only: secondary button fill, tags, view-toggle track, before/after rows, active tab. Not used for large panels (Oct 29). | Ink on it 15.3:1 |
| Text | `#1F1A17` ink | Body and headings | 17.2:1 on white |
| Muted text | `#5E5650` | Secondary text | 7.2:1 on white, 6.4:1 on `#F3F2E7` |
| Brand and primary action | `#59000E` burgundy | Primary buttons with white text, links, recipe titles, focus ring, one color block per screen | 14.7:1 with white |
| Highlight | `#FEBD02` yellow | Fills only: selected chips, adapted markers, changed step numbers | Ink on it 10.3:1; never as text or thin lines on white (1.7:1) |
| Highlight soft | `#FFF3C4` | Changed rows, applied ideas, notices | Warning text `#7A5200` on it 6.2:1 |
| Cool counterpoint | `#A0B9C4` blue | Fill only: selected availability segment | Ink on it 8.4:1; never text on white (2.1:1) |
| Cool soft | `#E6EEF1` | Partial-amount panel, informational notices, tags | |
| Control border | `#8A8178` | Inputs, chips, segments | 3.8:1 on white |

Rationale: burgundy carries brand and action and connects directly to the Feastio reference; yellow is the energy, used sparingly so it stays meaningful; blue gives the eye a cool place to rest, matching the owner's preference for warm accents balanced by cooler color. Color never carries meaning alone: adapted items also carry a label or icon.

Candidate for a later iteration: forest green `#004A3C` (from the earlier color pool, echoed in the Feastio reference) as a second brand block or the "have it" state. It passes with white text at 10.3:1. Not part of the first build.

Superseded: warm ivory `#FAF7F0` main background; the October 29 assistant palette in version 0.1 of this file (ink `#232820`, burgundy `#570D24`, orange `#FF6B35`, yellow `#F2CC4D`, blue `#DDE8EC`), replaced by the build prompt defaults.

### Illustration

**Confirmed direction.** The owner draws icons, shapes, and patterns by hand, in two modes: black ink for everyday interface use, and color pastel for rare expressive moments. For the MVP, use simple placeholder SVGs with consistent size and stroke so hand-drawn replacements drop in without layout changes. Do not generate imitation hand-drawn art or trace the references. Placeholder accents are allowed if they are swappable and recorded as temporary (C3, confirmed Oct 29): the four current accents (squiggle, arrow, pot, spark) are temporary placeholders, each its own file in `assets/accents/`.

### Directions moved away from

| Direction | Status | Reason |
| --- | --- | --- |
| Build saving and lists first, adaptation later | Superseded | Owner correction: adaptation is the main build |
| Generic, repetitive, "vibecodey" UI | Rejected | Owner wants refined, justified decisions |
| Bright everything | Rejected | Owner: more color does not mean everything bright |
| Onboarding flow | Excluded | Explicit owner instruction |
| Full maintained pantry with quantities | Not committed | Adds upkeep before value is proven; replaced by the light on-hand list |
| Moralizing nutrition labels | Excluded | Build prompt instruction; conflicts with the not-a-diet-app intent |
| Dashboards, decorative badges, repeated gray cards, gradients | Cautioned | Assistant guidance responding to the generic-design critique |
| Brand pass fully complete before any code | Superseded Oct 29 | Owner moved to a working MVP |
| Named adapted versions per recipe | Deferred Oct 29 | One version is enough for the MVP |

## 3. MVP scope

### In scope

Per the build prompt: a working web app in organized HTML, CSS, and modular JavaScript, with local persistence and an explicit demo reset. A small labeled seed collection with hand-authored, deterministic swap and consequence data. Recipe data, substitution rules, calculations, UI, and storage kept in separate modules without an elaborate framework.

Core: recipe detail with servings scaling; availability marking including partial quantities; swap alternatives with consequences compared before applying; explicit apply and undo; a retained adapted version; an editable shopping list derived from one adaptation state. Supporting: lightweight saving, My Recipes with pantry-based suggestions, optional nutrition-oriented swaps.

Deferred: social and video imports, accounts, live AI, onboarding, budgets, restaurants, ratings, weekly planning, social features, named versions.

### First demo scenario: chana masala (Confirmed)

Chana masala is the hero recipe and the scenario used to judge whether adaptation works. Path: the user opens it at 4 servings from the "Start here" block on My Recipes, scales to 2, marks what is on hand (with the partial amount on rice), finds fresh tomatoes missing and compares canned tomatoes, then applies a "more protein" or "more fiber" adjustment, sees the adapted recipe with changes marked, and generates a list.

Candidate swaps from v0.4, all demonstration content to be labeled as such and written with honest, non-precise consequences. How each was built is noted in brackets; disagreements are in Part 8.

- Fresh tomatoes to canned crushed tomatoes: more concentrated, cooked flavor, can be slightly more acidic, less fresh brightness; less chopping. [Built. The earlier record wording, "brighter", was wrong (C4).]
- Canned chickpeas to dried: same dish, but adds overnight soaking and longer cooking; a preparation consequence, not a flavor one. [Built: 200 g dried, a soaking and simmering step inserted first. The written flavor note mentions a nuttier taste and a fuller sauce, so it is not purely a preparation consequence.]
- Fresh ginger to ground ginger: milder and less bright, added with the garlic and chili for about 30 seconds so it doesn't scorch. [Built (C5).]
- More protein: add paneer or firm tofu; changes texture, adds a step, and paneer contains dairy. [Built as two additions that can't be combined. Paneer carries a plain "Contains dairy." note wherever it appears (C6).]
- More fiber: stir in spinach (fresh or frozen; frozen must be thawed and squeezed); changes color and adds a leafy note. [Built with frozen spinach only, per the build instruction.]
- An unsupported request (for example swapping chickpeas for lentils) should explain that the dish changes too much to adapt reliably rather than produce an answer. [Built: shown in the chickpeas swap sheet with a reason.]

### Pantry model (Confirmed)

A light shared "on hand" list across recipes, with no maintained inventory. Each ingredient is either on hand or not, and that presence powers the "can make now" and "one change away" suggestions in My Recipes. When a specific recipe needs a quantity, the user can optionally enter a partial amount in that recipe ("I have 1 of 2 cans"), which reduces that recipe's shopping need. Partial amounts belong to the recipe and do not become inventory. Buying something on the list does not mark it as permanently on hand unless the user says so.

Build note (C8, confirmed Oct 29): implemented this way. The shared list stores presence only (`have` / `need`); "Some" with an amount is stored in that recipe's adaptation state, so two recipes never subtract the same amount.

### Screen purposes (from the build prompt's compact flow, Proposed detail)

1. **My Recipes.** Choose what to cook. Saved recipes with pantry-based suggestions from the on-hand list. Changes here: saving, unsaving, filtering, editing the on-hand list. (Built without filtering.)
2. **Recipe detail with adaptation controls.** Fit the meal to today and trust the result. Original recipe, servings stepper, availability marks with optional partial amounts, and swap entry points per ingredient. After changes, it shows the adapted version with changes marked in place, a short "what changed" summary, per-change undo, and reset to original.
3. **Swap panel (inline panel or dialog).** Decide on a change. Alternatives for one ingredient with consequences side by side (flavor, texture, quantity, preparation, nutrition when known). Nothing changes until Apply. (Built as a sheet: options listed first, then one option's before/after comparison at a time, not side by side.)
4. **Grocery list.** Know what to buy. Derived needs grouped sensibly, each linked to its recipe, fully editable, with conflicts flagged when regenerating.

## 4. Behavior rules

**Originals are immutable.** Source recipe data is never modified. An adaptation is an ordered list of changes applied on top of the original, so any change can be undone and the original restored exactly.

**One adaptation state.** The displayed recipe, the consequence summary, and shopping quantities all derive from the same state. Nothing is calculated twice in different places.

**Consequences come before commitment.** Every swap shows its effect before Apply. If the data has no consequence for a dimension, say nothing rather than implying "no change." Generic "No change." text is not used (C9).

**Unknown is not zero.** Missing nutrition data displays as unknown. Estimates are labeled. Nutrition is per serving with the basis stated, and never presented with false precision.

**Scaling is practical.** Round to kitchen-friendly amounts. Spices, salt and chiles are marked "to taste" when servings change, and one short note says cooking times, pan size and oil may need adjusting. There is no further per-ingredient logic (C10).

**Swaps can touch instructions.** If a swap changes a step, the step updates and is marked as adapted.

**Shopping needs follow the adapted recipe.** Need equals adjusted quantity minus available amount. Never convert between incompatible units. Manual list edits are preserved; conflicts on regeneration are flagged, not overwritten.

**On hand is not inventory.** See the pantry model above.

**Unsupported means say so.** When the data cannot support a swap or a combination of swaps, explain the limitation.

**Swap entry points only where swaps exist.** No dead-end buttons. Where an ingredient has a recorded reason for having no swap, show it inline (C7).

**Meaning never rests on color alone.** Adapted items carry a label or icon. Controls have visible focus, at least 44 px touch targets, labels, and keyboard support.

**Nutrition stays optional and kind.** No mandatory tracking, no moralizing labels, no streaks or scores. When in doubt, show less nutrition, not more.

## 5. Unresolved questions

1. How combined consequences are summarized when several swaps are applied.
2. Combining the same ingredient across recipes on one list (built: merged per item and unit family; partial amounts are per recipe, so nothing is double counted).
3. Nutrition depth: goal-ranked swaps only, or per-serving estimates too (built: both, estimates collapsed unless a goal is on).
4. Whether Apfel Grotezk holds up on small text; En Clair's license.
5. Whether headlines need a display serif (see Visual personality).
6. Wordmark casing.
7. Name testing: pronunciation, spelling, availability.
8. Whether forest green joins the palette in a later iteration.

## 6. Next priorities

Queued work lives in `docs/queue/QUEUE.md` (T01 revision evidence, T02 test kit, T03 review and pull request). T01's "after" screenshots should be retaken after this visual refresh. Beyond the queue:

1. Later: Safari and phone check, hand-drawn icon swap-in, En Clair license, name test.

## 7. Implementation record (as built)

Branch `feature/first-working-mvp`, pushed to `origin`. Plain HTML, CSS and ES modules with localStorage; `npm start` serves it at http://localhost:8080 (Node 18+), `npm test` runs the core tests. Not merged.

### Color roles as built (Provisional)

All values live in `css/tokens.css`.

| Role | Value | Use |
| --- | --- | --- |
| Working surface | `#FFFFFF` | Page background, cards, inputs. |
| Supporting surface | `#F3F2E7` | Secondary buttons, tags, view-toggle track, before/after rows, active tab, start-card hover. Large sections are white with `--rule` hairlines. |
| Brand / action | `#59000E` | Primary buttons, links, recipe titles, focus ring, and the one color block on My Recipes (the chana masala hero). |
| Highlight | `#FEBD02` | Selected chips, "changed by you" dots and step numbers, the ampersand in the placeholder wordmark. Fill only. |
| Highlight soft | `#FFF3C4` | Changed ingredient rows, applied ideas, notices. |
| Cool counterpoint | `#A0B9C4` | Selected availability segment. Fill only. |
| Cool soft | `#E6EEF1` | Partial-amount panel, informational notices, tags. |
| Ink | `#1F1A17` | Body text, card borders. |
| Muted text | `#5E5650` | Secondary text. |
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

### Typography as built

Apfel Grotezk by Collletttivo, SIL Open Font License 1.1 (license verified in the downloaded package; copy in `fonts/OFL-ApfelGrotezk.txt`). Bundled weights: Regular 400, Mittel 500, Fett 700. The stack falls back to Helvetica Neue / Arial / system sans if the files fail to load. Checked in the browser: the font has its own glyphs for ½ ¼ ¾ → – · and curly quotes. Scale: 13 / 15 / 17 (body) / 20 / 26 / 34 / 44 px; page titles use `--fs-title` (36 px at 360 wide, up to 44 px); prose is capped at `--measure` (60ch). Quantities use tabular figures. Loading is checked by the review script (`document.fonts`), and passed at every captured viewport.

### Spacing, controls, wordmark, icons, color blocks

- 4px base scale (4–64px). Touch targets at least 44px; primary controls 48px. Buttons: primary (burgundy fill, white text), secondary (tonal fill with ink text and no outline: `#F3F2E7` on white surfaces, white on `#F3F2E7` panels and on the burgundy hero) and quiet (underlined link style). The servings control is a "– 2 +" stepper.
- **Wordmark:** typographic, in the header link: "mise", a regular-weight "&", "match", Apfel Grotezk Bold at 22 px (24 px from 720 px wide), tracking −0.035em, burgundy. Its accessible name is "mise & match, My Recipes". No script web font is loaded.
- **Focus:** controls keep the 3 px `:focus-visible` ring. Elements focused by script (`[tabindex="-1"]`: page titles, dialog title, `main`) show no ring for pointer users and a 2 px ring, sized to the text, for keyboard users (`html[data-input="keyboard"]`, set by keydown/pointerdown listeners). Nothing is focused on first load; in-app navigation focuses the new title for screen readers.
- **Icons:** 14 plain black stroke SVGs in `assets/icons/<name>.svg`, all rendered at 20 × 20 px through `icon(name)` in `js/ui/icons.js`. Replace any file with an ink drawing of the same name. No icon sits on a burgundy fill.
- **Color blocks:** none at the moment; the burgundy hero became a quiet white "Start here" card. Each screen has at most one burgundy action button.
- **Drawn accents (temporary placeholders):** `assets/accents/squiggle.svg` under recipe titles, `arrow.svg` in comparisons, `pot.svg` for empty states, `spark.svg` next to Ideas. Each loads as an image with its colors baked in; replace a file with a drawing of the same name.

### Screens as built

| Screen | What it does |
| --- | --- |
| My Recipes (`#/`) | Title and one-line purpose, a quiet "Start here" card for chana masala ("Pick up where you left off" once adapted), "Cook from what you have" as an optional disclosure (collapsed until something is marked; holds the on-hand chips and suggestions, including "one swap away"), saved recipe cards with adapted and list status, demo collection with Save, About and Reset demo. |
| Recipe (`#/recipe/:id`) | Servings stepper with a scaling note when servings differ, "Ways to adapt" (a button per swappable ingredient that opens its swap sheet, plus a jump to the protein and fiber ideas), your changes (undo each, undo last, restore original), Have / Some (amount for this recipe) / Need per ingredient with staples as a single check, Swap where swaps exist and an inline "No tested swap" note where a reason is recorded, "Contains dairy." on paneer, Ideas with optional protein/fiber goals, rough nutrition, method with changed steps marked, shopping bar, My version / Original toggle. |
| Swap sheet (dialog) | Options for one ingredient plus any explained unsupported requests, then a before/after preview: quantity diff at current servings, notes on added ingredients ("Paneer: contains dairy."), only the effect dimensions the data covers (flavor, texture, quantities, prep, nutrition with ranges), method changes with old text struck through, cautions, conflict handling. Bottom sheet on mobile, side panel at 720px and up. |
| Grocery list (`#/list`) | Same header and add form in both states. Populated: grouped by aisle; check off, edit amounts, remove, add your own, resolve conflicts, add back removed items, update when a recipe changed. Empty: "Nothing to get yet", one sentence on how items arrive, and a way back to My Recipes. |

### Behavior as built

- **One adaptation state per recipe** (`{ servings, applied }`) drives ingredients, steps, nutrition and shopping needs (`js/core/adapt.js`). The source recipe is never mutated (tested). "Original" renders the source as written.
- **Adapted version is retained** automatically and persists; unsaving keeps it. One version per recipe.
- **Swaps are explicit:** preview, then "Apply to my version". Each applied swap can be undone individually; an in-memory undo stack also covers servings and "Restore original". The undo stack resets on reload; applied swaps persist.
- **Composition order:** replacements, omissions and additions, then quantity adjustments (to whatever fills the slot), then portion scaling. Steps can be inserted at the start (`after: "start"`, used by the dried chickpeas soak).
- **Unsupported:** same-ingredient swaps and declared incompatibilities (paneer with tofu in chana masala; extra egg with tofu) show the reason and offer an explicit "Switch to this swap". Asked-for swaps we don't support (`recipe.unsupported`, e.g. lentils for chickpeas) and ingredients with no tested swap (`noSwap`) explain why.
- **Scaling:** linear by default; pan fat scales at half rate (no visible note); spices, salt and chiles scale and are marked "to taste" when servings change. Display rounds to measurable amounts; the list rounds counts up.
- **Availability:** shared presence keyed by ingredient (`have` / `need`) in `state.pantry`, used by every recipe and the home chips. "Some" with an amount lives in that recipe's adaptation state (`adaptation.partial`) and overrides shared presence for that recipe only; the home chip shows "some" when any recipe has a partial amount. Partial amounts are kept through restore original and aren't part of the undo history. Older saves with shared partial amounts drop them on load. Unmarked counts as needed, and the UI says so. Without an amount, or with an incomparable unit, the full amount stays on the list, flagged.
- **Shopping needs** = adjusted quantity minus available amount in the same unit family. Mass, volume and count never convert into each other.
- **List regeneration** tracks each recipe's contribution per line. Manual items are untouched. Edited or checked lines whose amount changes get a conflict ("Use 300 g / Keep 400 g"). Lines no recipe needs are removed unless edited or checked, which flags them instead. Deleted or cleared generated lines are remembered and offered as "Add back", never re-added silently. The same item in the same unit family merges across recipes. Checking an item off does not mark it as on hand.
- **Out-of-date detection:** each synced recipe stores a signature of its needs; the recipe and the list both say when a recipe changed since it was added.
- **Nutrition:** protein and fiber only, per serving, as ±15% ranges from typical per-100 g values, collapsed unless a goal is on. Seasonings excluded as negligible. If a meaningful ingredient has no reliable value (split moong dal fiber), the nutrient shows "can't estimate" and comparisons "can't compare".
- **Persistence:** localStorage key `mise-match:v1`, written on every change. Reset demo restores the starting state (two saved recipes, nothing marked, empty list).

### Seed data (demo)

Five recipes written for the prototype from common home-style versions, not tested: Chana masala (hero), Chana palak, Paneer bhurji, Masoor dal tadka, Tomato and egg stir-fry. 27 recipe-specific swaps in total. Chana masala (4 servings): canned tomatoes (3 medium → 400 g); dried chickpeas (200 g, soak and simmer step first); ground ginger (1 tbsp → ¼ tsp); add paneer or add firm tofu (200 g each, not combinable); add frozen spinach (130 g, thaw and squeeze); lentils for chickpeas explained as unsupported. The other recipes cover missing-ingredient swaps (frozen spinach, kale, fresh or canned tomatoes, tofu, half paneer half tofu, moong dal, oil for ghee, skip scallions), a preference swap (tofu instead of eggs) and nutrition-oriented ones (add paneer, peas, eggs, spinach or edamame; brown basmati; more dal, less rice; one more egg each). Dairy-free-related swaps carry a caution that they don't make the meal dairy-free, and paneer carries a plain "Contains dairy." note. Effects include a dimension only when there is something to say about it. Nutrition figures are rounded typical values in the style of USDA FoodData Central, not lab data.

### Known limitations

- Generated list lines can't be renamed (only manual ones). Amount edits keep the line's unit.
- The undo stack resets on reload.
- Nutrition covers only protein and fiber, and the catalog is small.
- Swaps are hand-written per recipe, which is slow but credible.
- The placeholder wordmark SVG uses Helvetica/Arial (images can't use the page's web font).
- Verified in Chrome (Playwright, and the in-app browser) at 430 × 932, 360 × 740 and 1280 × 860. Not checked in Safari or Firefox, on a physical phone, or with a screen reader. The UI relies on `:has()` and `<dialog>`.

### Verification log

**T04, align build with decision record (2026-10-29).** `npm test`: 18 pass (new: per-recipe partial amounts with no double count across two recipes; old shared partial amounts dropped on load; effects never use generic "no change" text). Browser at 430 × 932 and 1280 × 860 from a fresh Reset demo: rice Some 100 g in chana masala at 2 servings stays out of chana palak; the list shows rice 350 g (50 + 300) with no double-count note; the shared onion Have carries across; tonal secondary buttons (oat on white, white on panels and hero); "Contains dairy." in the paneer row and in the preview sheet; ground ginger preview shows only Flavor, Quantities and Prep; the servings note appears when servings differ; "No tested swap" shows inline with no dead-end buttons. No console errors. Fixed during the pass: the servings note took its own grid cell at 1280px.

**Decision record merge and build queue (2026-10-29).** Documentation and queue files only, no app code changed. `npm test` re-run.

**Demo polish pass (2026-10-29).** `npm test`: 16 pass (new: chana masala soak-step insertion, composition at 2 servings, partial canned tomato subtraction, paneer/tofu block). Demo path checked by driving the real controls at 430 × 932 and 1280 × 860 from a fresh Reset demo: open chana masala from the hero → servings 2 → chickpeas and onion Have, spices "I have all of these", rice Some 100 g → compare and apply canned tomatoes → apply Add paneer → apply and then undo Add frozen spinach → lentils explanation → reload (state persists) → Add to list → rice 50 g (150 − 100), paneer 100 g, canned tomatoes 200 g, oil 2¼ tbsp → edit rice to 100 g (marked edited). No console errors. Fixed during the pass: a duplicate "Chickpeas" chip, an awkward step sentence, and the check icon wrapping the Swap button at 430px.

**First build.** 15 tests covering seed-data integrity, units, scaling, source immutability, swap apply/undo/compose/omit, added steps, conflicts, nutrition with missing data, partial availability and incompatible units, list regeneration, suggestions, and save/reload/reset. Browser walkthrough at 430px and 1280px. Fixed during verification: `aria-pressed` booleans not rendering, a late dialog `close` event emptying a newly opened sheet, a `pagehide` save that could overwrite newer storage, duplicate "Rice" chips, a prep note that didn't scale, missing nutrition data shown as a low number, and toast and shopping bar overlaps.

## 8. Contradictions resolved (T04, October 29)

Found while merging v0.4; each decision is in the decision log and is now reflected in both this record and the code.

| ID | Resolution |
| --- | --- |
| C1 | Secondary button is a tonal fill with ink text and no outline (`#F3F2E7` on white, white on `#F3F2E7`); primary stays burgundy. |
| C2 | The build's colors are the record; the color table follows `css/tokens.css`. |
| C3 | The four drawn accents stay as temporary placeholders in `assets/accents/`; placeholder accents are allowed if swappable and recorded as temporary. |
| C4 | Canned tomato copy: more concentrated, cooked flavor, can be slightly more acidic, less fresh brightness. |
| C5 | Ground ginger stays with the garlic step; the record now matches. |
| C6 | Paneer shows "Contains dairy." as a plain fact, in ingredient rows and in the swap preview. |
| C7 | Swap entry points only where swaps exist; recorded reasons show inline; no dead-end buttons. |
| C8 | Partial amounts are per recipe; shared presence only. The double-counting limitation and its list note are gone. |
| C9 | No generic "No change." text; a dimension shows only when the data says something. |
| C10 | One short note when servings differ: cooking times, pan size and oil may need adjusting. |

## Root CLAUDE.md guidance

Keep CLAUDE.md under about 40 lines: the stack and verified run commands, the non-negotiable behavior rules in one short paragraph, and a pointer such as "Read docs/product-context.md before changing product behavior, data, copy, or visual styling. Ask before changing brand decisions." A plain pointer is preferred over an `@docs/product-context.md` import, which would load this whole file into every session.

## Appendix A: Claude Code build prompt (exact, as issued October 29)

Build the first working version of my recipe app using recipe-app-project-context.md as background. This instruction authorizes starting now while branding continues to evolve. Read the available project instructions, inspect the repository and supplied assets, and briefly confirm the product focus, usable existing work, and provisional assumptions before implementing. Do not claim access to earlier chats or Figma files you cannot inspect. Preserve unrelated work, use a feature branch, and continue through implementation and verification without stopping at a plan. Work in one session without subagents.

The app helps young adults make recipes work with their available ingredients, portions, preferences, and optional nutrition goals, reducing the decisions around cooking while preserving flavor, cultural familiarity, and enjoyment. Personalization and transparent ingredient adaptation are the core. Build saving, My Recipes, and shopping lists efficiently using familiar patterns, then concentrate on the adaptation experience. A useful reference is adapting a familiar Indian meal for more protein or fiber while understanding what changes in the dish. Avoid making nutrition tracking mandatory or using moralizing food labels.

Use mise & match as the provisional name. Keep the identity energetic, tactile, refined, and slightly playful. Use Apfel Grotezk if suitable licensed files are available, otherwise use a clearly documented temporary sans-serif fallback. For this iteration, use white working surfaces, #F3F2E7 supporting surfaces, #59000E as the dark brand/action candidate, and restrained #FEBD02 highlights with #A0B9C4 as an optional cool counterpoint. These are implementation defaults, not final brand approvals. Check actual contrast combinations. Establish shared tokens for color, type, spacing, and controls, with clear hierarchy, intentional composition, and sparse expressive drawing accents. Use cards where they help group content rather than repeating identical containers everywhere. Design mobile first around 430px, with responsive layouts, readable quantities, labeled controls, visible focus, and usable touch targets.

Build a compact flow through My Recipes with pantry-based suggestions, recipe detail with adaptation controls, and an editable grocery list. Use inline panels or dialogs where a separate screen adds no value. Include a small credible seed collection with several supported swaps covering missing ingredients and nutrition-oriented adjustments. Label demonstration data and estimates accurately. Let users save a recipe, change portions, mark ingredient availability including partial quantities, inspect alternatives, compare consequences, explicitly apply or undo swaps, retain an adapted version, and generate shopping needs. Explain relevant changes to flavor, texture, quantities, preparation, and nutrition. Preserve the source recipe and derive the displayed recipe and shopping quantities from one consistent adaptation state. Avoid inventing nutritional precision, universal substitutions, or validated allergy safety. Unsupported combinations should explain the limitation rather than silently produce an answer.

Prefer the existing stack; for an empty repository, use organized HTML, CSS, and modular JavaScript with local persistence. Keep recipe data, substitution rules, calculations, UI, and storage separate without building an elaborate framework. Add working lightweight recipe saving, and clearly defer automated social/video imports, accounts, live AI, and onboarding. Derive shopping needs from adjusted quantities minus available amounts, avoid incompatible unit conversions, and preserve manual list edits or flag conflicts when regenerating. Persist meaningful progress across reloads and provide an explicit demo reset.

Implement in connected increments: tokens and reusable controls, recipe/list foundations, then the complete adaptation journey. Verify meaningful calculations and state transitions, including portions, swaps, partial availability, undo, original preservation, list regeneration, reload, and navigation. Inspect the rendered flow on mobile and wider screens, fix observed issues, and state any checks you could not run. Keep CLAUDE.md concise with project rules and verified development commands; keep docs/product-context.md as the detailed product/design decision record with confirmed choices, provisional defaults, scope, current implementation, limitations, and next priorities. Finish with a runnable build, concise setup instructions, verification results, and a clear handoff. Ask only genuinely blocking questions during the build, then ask up to three focused product/design questions after delivering the working version.
