# Mise & match: iteration audit and Claude Project handoff

Audit date: November 2, 2026
Live prototype: https://mukhs106.github.io/MiseMatch/

## Scope, evidence, and limits

This is a bounded audit of the deployed prototype, its publicly served JavaScript and CSS, the project requirements visible in this conversation, and the existing recipe-app-project-context.md and recipe-app-claude-handoff.md references. No separate new specification, current Figma file, GitHub branch, repository test suite, or private backend was supplied. The older documents are historical context; the latest user request takes precedence. This report does not certify that every possible defect has been found or that the iteration is complete.

Evidence labels: **L** = observed in the live interface; **S** = identified in published source; **T** = reproduced by executing downloaded pure calculation modules; **V** = verification requirement, not a confirmed failure. Mixed labels distinguish implementation evidence from consequences that still need interactive reproduction. Priorities: **P0** incorrect quantities, lost work, or misleading core decisions; **P1** core usability and accessibility; **P2** polish or bounded follow-up. These priorities are implementation recommendations, not historical approvals.

Live inspection covered Today, Chana masala, portions and nutrition goals, options, comparison, pantry reconciliation, pantry management, settings, and the demo link-import/draft path. Published-source inspection used a downloaded dependency set of 31 transitively imported JavaScript modules and five stylesheets, with focused review of the controller, state, calculations, import, view, and style code relevant to the findings. Focused calculation probes reproduced fraction rounding, can/drained-weight parsing, invalid numeric acceptance, serving-count parsing, and stale availability confirmations. No mobile-device, odd-viewport, keyboard/screen-reader, offline, storage-failure, or cross-browser certification is claimed. Those remain explicit tests below.

The earlier critique's accessible-name finding remains valid: the option's internal `data-label` is not an accessible label. A temporary progress update incorrectly treated it as one; inspection of the published button markup corrected that interpretation. The code already has tokens, some focus management, migrations, empty states, conflict handling, unsupported-combination messaging, and image fallbacks. Do not rebuild these as though absent; repair their specific gaps and verify existing behavior.

## Non-negotiable direction for this iteration

Adapt familiar Indian and South Asian comfort food to ingredients, portions, dietary exclusions, and optional nutrition goals while retaining flavor and explaining changes. Saving and shopping support that value. Do not introduce mandatory onboarding, accounts, AI generation, medical claims, or a full weekly-planning product to solve these findings.

**Restore natural full color to food photography throughout the app.** The deployed `css/tokens.css` defines `--photo-filter: grayscale(1)` and `.photo img` consumes it in `css/flow.css`. Set the image token to `none`, check other media-specific overrides, and verify cards, thumbnails, heroes, saved versions, and cooking-related imagery. Do not remove icon inversion used for black icons on filled controls. This request authorizes image color, not a wholesale palette redesign. Retain the current interface identity and white working surfaces for this pass. Food supplies visual energy; functional information must remain readable without relying on image color.

## A. Entry, adaptation, and decision architecture

| ID | Priority / evidence | Loose end and consequence | Concrete resolution and acceptance condition |
| --- | --- | --- | --- |
| A01 | P1 L/S | First-use pantry input arrives after options and comparison. Rankings therefore precede information essential to pantry-driven adaptation. | Add a lightweight “What needs changing?” entry with missing ingredients and relevant on-hand items before ranking. Reuse saved pantry data. Allow skip; no full-inventory prerequisite. The no-tomato scenario must influence the first recommendations. |
| A02 | P1 L/S | Today promises “Chana masala for 2, with no fresh tomatoes” but opens the original four-serving recipe. | Either open a clearly previewed two-serving canned-tomato scenario without overwriting an existing session, or change the entry copy to match its actual destination. Test with and without existing work. |
| A03 | P1 L/S | An unrecorded pantry item means “Don't have.” Unchecked inventory is presented as known absence. | Distinguish not checked, have unknown amount, have measured amount, and don't have. Label preliminary shopping counts as “to check” where appropriate. Do not require every item to be inventoried. |
| A04 | P0 L/S | “Versions that fit” includes options below or only possibly reaching the selected nutrition target. | Keep hard-constraint eligibility distinct from target attainment. Group or label meets, may meet, closest available, and cannot estimate. Never imply an optional target has been achieved when it has not. |
| A05 | P1 L/S | “Your goal and requirements pull in different directions” appears with no dietary or time restrictions. | Use cause-specific copy: no supported option reaches the target, insufficient data, dietary conflict, or time conflict. Show which input actually blocks the outcome. |
| A06 | P0 S/V | The resolver derives lower protein and fiber targets from independently best ranges. Those maxima can belong to different versions. | Suggest a lower target set tied to one eligible candidate and evaluate the entire set together. Test competing protein/fiber targets; never promise joint feasibility from separate maxima. |
| A07 | P1 S | Accompaniment/other-dish suggestions evaluate a particular adapted option but link to the generic source recipe. | Carry the proposed option and servings into a reviewable destination, or label the link as exploratory. Adding a side must account for combined quantities, pantry allocation, time, and nutrition. |
| A08 | P1 S | Time is base recipe minutes plus fixed swap deltas, irrespective of portions, equipment, or overnight preparation. | Separate active, elapsed, and advance preparation where relevant. Use authored serving ranges and equipment caveats. An overnight soak cannot qualify as a quick dinner solely because active time is short. |
| A09 | P1 S | Selecting a dietary restriction generates soy/sesame and sometimes other clarification questions even before their relevance to the selected dish is established. | Ask clarifications when a candidate actually depends on the answer. Preserve explicit hard exclusions. Do not require unrelated answers to proceed. |
| A10 | P1 S/V | Recipe filtering decides whether to evaluate fit from `describe(profile)`; time-only and nutrition-only goals may not activate the same fit behavior. | Define filter semantics explicitly. Evaluate time limits even without dietary exclusions, and label whether optional goals affect ranking or inclusion. Verify time-only, protein-only, and empty profiles. |
| A11 | P1 S/V | Existing sessions can have session requirements while the global profile changes. Planned and saved versions have no complete requirement snapshot. | Keep today's requirements separate from global defaults. Re-evaluate results under the current applicable requirements, show the scope, and flag relevant changes before cooking. Preserve a concise “made under these requirements” record if needed; do not imply permanence. |
| A12 | P0 S/V | Pairwise swap compatibility can mark a three-rule combination supported even when no whole-combination recipe exists. | Require explicit whole-combination support for reliable recommendations. Pairwise support alone must not upgrade the full combination's evidence. Keep untested combinations clearly separate and never describe authored support as kitchen validation. |

## B. Quantities, portions, nutrition, and cooking logic

| ID | Priority / evidence | Loose end and consequence | Concrete resolution and acceptance condition |
| --- | --- | --- | --- |
| B01 | P0 L/S | Two-serving comparison mixes “100 g paneer,” “200 g for 4,” and “a quarter of the curry.” | Derive dynamic amount and serving copy from the active recipe state. At two servings say half of the finished curry, or avoid fractional prose entirely. Keep an explicitly labeled source basis only where useful. |
| B02 | P0 L/S | Method text contains literal water quantities such as “about 250 ml water” while ingredient quantities scale. | Put scalable method quantities into structured data and render them using the same recipe state. Classify non-linear water, pan size, and timing rules separately; do not blindly multiply all literals. |
| B03 | P0 T | `formatQty(0.25, '')` produces `½`. Counted ingredients can double at small portions. | Preserve supported count fractions, with ingredient-specific practicality. Show ¼ lemon when required; round shopping purchases separately. Check every ingredient at one, two, four, and maximum supported servings. |
| B04 | P0 T | `formatQty(0.125, 'tsp')` produces `¼ tsp`. | Support eighth-teaspoon display or an authored practical equivalent. Label deliberate measurement approximations and use them consistently. Never silently double a dose. |
| B05 | P0 T | `formatQty(0.2, 'g')` produces `1 g`. | Use sensible decimal precision or a trusted ingredient-specific measure below one gram. Avoid a universal one-gram floor. Verify seasoning and concentrated ingredient cases. |
| B06 | P0 S/V | Nutrition uses unrounded quantities while cooking can show substantially rounded amounts. | Distinguish exact derived quantities from approved cooking quantities. Use the actual recommended amounts for estimates, or disclose the approximation. Compare displayed recipe, method, shopping, and nutrition from the same state. |
| B07 | P0 S | “About 375 g of food” is calculated from input ingredient mass, including uncooked rice, without cooked yield, added water, or evaporation. | Remove the cooked-portion-weight claim until supported by a cooked-yield model. If retaining raw ingredient mass for internal comparison, label it accurately and do not present it as plated serving weight. |
| B08 | P0 L/S | A blanket ±15% fixture band resembles quantified uncertainty but is not calibrated from source data. | Label these as illustrative demo ranges, not confidence bounds. Record provenance and state for nutrient data. Do not fabricate database IDs or claim uncertainty has been measured. |
| B09 | P1 S/V | The global pan-fat formula `1 + (factor - 1) * 0.5` substitutes a generic scaling assumption for equipment-dependent behavior. | Restrict it to authored dishes/ranges with a pan-size note. Flag unsupported batch sizes; show the practical oil amount and its effect on estimates. |
| B10 | P1 S/V | Servings are globally bounded at 1–12, but individual swaps may have narrower authored ranges. | Surface dish-specific supported ranges beside the portion control. Revalidate already-applied swaps when portions change and explain which rule becomes unsupported. Test boundaries without generating an invalid recipe. |
| B11 | P1 L/S | Optional cilantro appears as a required purchase, and source optionality is not clearly retained in the derived shopping entry. | Carry optionality through ingredients, method, nutrition, and shopping. Exclude optional garnish by default or let the user include it explicitly; distinguish omission from unknown data. |
| B12 | P1 V | Brand-specific nutrition, dry/cooked/drained states, count weight, regional cup sizes, and incompatible volume/mass measures can invalidate estimates. | Keep item state and measurement convention explicit. Permit conversions only with validated item-specific factors. Unknown must stay unknown. Test cooked versus dry rice, drained cans, yogurt cups, cloves versus grams, and US versus metric measures. |

## C. Pantry lifecycle

| ID | Priority / evidence | Loose end and consequence | Concrete resolution and acceptance condition |
| --- | --- | --- | --- |
| C01 | P0 S | Entering zero, a negative amount, or an invalid amount takes the `pantry-qty` fallback to “have, amount unknown.” Zero stock can become positive presence. | Treat zero as out of stock; reject invalid/negative input inline while preserving the last valid value. Blank means unknown only after an explicit clear. Test zero, blank, negative, decimal, and exponent input. |
| C02 | P0 S | Changing pantry units replaces the unit string without converting the stored number. 500 g can become 500 kg. | Convert compatible units while preserving physical quantity, or ask for a new amount when units are incompatible. Test g↔kg and ml↔l with editing and reload. |
| C03 | P0 T/S | “I have enough” is keyed by meal/session and item, not required quantity or pantry revision. A probe increasing need from 100 g to 1,000 g still produces no shopping need. | Bind confirmations to a requirement fingerprint and pantry revision. Invalidate after portions, swaps, relevant inventory, or planned allocations change. |
| C04 | P0 S/V | Unknown-quantity stock can be confirmed enough independently for several meals without an aggregate check. | Ask whether it covers the combined requirement, or allocate explicit per-meal confirmations with a visible warning. Do not infer finite stock from repeated yes answers. |
| C05 | P0 S | Finishing a meal writes a cooking record without deducting pantry stock or completing the associated planned meal. | Offer one reviewable “Update pantry after cooking” step using the exact cooked snapshot. Deduct known comparable stock once; prompt or retain uncertainty for unknown amounts. Complete only the intended plan entry. Allow undo. |
| C06 | P0 S | “Added to pantry” is tracked in ephemeral `ui.bought`. After reload the same purchase can be transferred again. | Persist a receipt/transfer marker with the list item or purchase event. Make transfer idempotent; provide a distinct action for intentionally buying another amount. |
| C07 | P0 S | Adding a purchase with an incompatible unit can replace measured pantry stock with unknown stock, discarding the prior quantity. | Preserve both observations or request reconciliation. Never silently lose a known amount. Explicitly distinguish measured stock and unconverted purchase units. |
| C08 | P1 S | Toggling a quick-add item off removes its quantity; toggling it back recreates unknown stock without undo. | Use a recoverable removal or a clear state transition. Preserve quantities when merely changing presence status, unless the user explicitly resets them. |
| C09 | P1 S | Free-text pantry items cannot participate in calculations and have no visible matching/reconciliation path in the inspected flow. | Keep the warning but add an explicit “Match ingredient” path using existing catalogue data. Preserve free text and quantities until the user confirms a match. |
| C10 | P1 S | Pantry search uses names and short names but not the richer alias index available to recipe import. Regional searches can differ across screens. | Reuse one ingredient search index with aliases, singular/plural handling, and documented matches. Verify chana/chickpeas, palak/spinach, and regional spelling variants. |
| C11 | P1 S | Pressing Enter on pantry search automatically adds the first substring match. | Only auto-add an unambiguous exact match. Otherwise require an explicit candidate selection, with a free-text fallback. Test overlapping matches and keyboard-only use. |

## D. Planning and shopping

| ID | Priority / evidence | Loose end and consequence | Concrete resolution and acceptance condition |
| --- | --- | --- | --- |
| D01 | P1 S/V | Repeating Add to shopping list creates another planned-meal ID and adds another meal's quantities. | Make repeated submission idempotent for the same action. If another meal is intended, use explicit “Add another meal.” Disable/reconcile rapid double taps. |
| D02 | P0 S | Shopping can round ½ lemon to one purchasable lemon, while Add to pantry uses the raw computed requirement, not the displayed purchase amount. | Separate amount needed, amount to buy, and amount actually purchased. Transfer the user-confirmed purchased amount to inventory. Test half-count produce and package-size purchases. |
| D03 | P1 S/V | A session's shopping preview allocates pantry after all planned meals, including a previous copy of the same dish. | Distinguish editing an existing planned meal from adding a new one. Replace the relevant allocation in edit mode instead of counting both. Label preview scope. |
| D04 | P0 S | When all remaining needs are unresolved “have enough?” checks, the list can also say “Nothing to buy for your planned meals.” | Use separate empty states for confirmed nothing needed, pending checks, all checked, dismissed items, and no meals. Pending checks must never read as completion. |
| D05 | P1 S/V | Dismissed generated items stay dismissed even if portions increase dramatically. | Preserve the dismissal but show it prominently when its underlying requirement changes. Offer add back and display the new quantity. Never silently equate deletion with enough inventory. |
| D06 | P1 S/V | Removing one meal removes its contributions but does not immediately regenerate remaining meals against newly available pantry stock. | Reallocate the entire remaining plan transactionally, then review changes to edited/checked lines. A stale-list notice is an interim safeguard, not a final result. |
| D07 | P1 S/V | List synchronization fingerprints formatted quantities, so some underlying changes are invisible after rounding. | Fingerprint canonical values, units, state, and uncertainty, with a defined numeric tolerance. Use formatting only for display. |
| D08 | P1 S/V | Synchronizing contributions sequentially can compare intermediate totals rather than the final aggregate when flagging edited-line conflicts. | Compute final contributions and aggregate totals first, then reconcile each user-edited line once. Test adding, removing, and changing two meals sharing the same ingredient. |
| D09 | P1 S | Clearing a generated list quantity passes an empty string to `Number`, producing zero. | Treat blank as an unfinished edit or explicit reset, not zero. Keep zero as a deliberate user choice with a clear consequence. Commit after valid input or on a labeled action. |
| D10 | P1 V | Manual lines, generated lines, edited lines, checked lines, orphan lines, and duplicate names can converge during regeneration. | Define precedence once: manual text stays; generated sources recalculate; overrides require conflict review; checked purchases are not silently unchecked; orphaned edits can be kept as manual. Test every pairwise transition with two shared-ingredient meals. |

## E. Sessions, saved versions, and cook mode

| ID | Priority / evidence | Loose end and consequence | Concrete resolution and acceptance condition |
| --- | --- | --- | --- |
| E01 | P0 S | Saved versions, plans, and cooking records store swap IDs and servings, not immutable source/rule revisions. A later rule edit changes historical results. | Persist recipe/rule revision IDs and a reproducible derived snapshot for saved/planned/cooked records. Migrate older saves explicitly; never silently rewrite the meal someone recorded. |
| E02 | P1 S | Save detection compares servings and applied rules but excludes session constraints. Users can change requirements while Save remains disabled or saved versions omit that context. | Decide that versions save the recipe outcome, not the profile; explain that distinction. If requirements are part of the version, include them consistently in dirty checking and persistence. |
| E03 | P1 S/V | Version IDs use timestamp plus per-recipe count, which can collide across different recipes at the same timestamp; cook IDs use timestamp alone. | Use collision-resistant IDs already supported by the target browsers, with a fallback. Test two creations at identical supplied timestamps. |
| E04 | P1 S | Make it again selects positive cooking records, then drops records without saved version IDs. An unsaved meal marked “make again” can yield an empty repeat section. | Render a repeatable cook snapshot directly or provide a save action for it. A positive feedback record must have a usable repeat destination. |
| E05 | P1 S | Cook check keys use generic step IDs/ingredient slots without a recipe/version namespace. | Namespace progress by exact cooking session and recipe revision. Switching recipes must not transfer completed steps. |
| E06 | P1 S | Cook progress exists only in `ui.cookChecks`, so a reload loses it. | Persist lightweight in-progress cooking state. Offer resume or restart; clear it on explicit completion. Ensure checking off a step does not trigger unnecessary page-wide re-rendering. |
| E07 | P1 S/V | Cook mode derives from a live working session or current saved version instead of freezing a cook-session snapshot. | Freeze the chosen recipe and servings when cooking begins. Changes elsewhere must not silently alter instructions halfway through cooking. |
| E08 | P1 S | “Back to the recipe as written” resets both swaps and servings. | Separate “Remove ingredient changes” from “Reset everything,” or explicitly name both effects. Preserve current portions by default when removing swaps. |
| E09 | P0 S/V | Some Undo handlers restore an entire previous state/list/pantry object, potentially erasing edits made after the original action. | Implement narrow inverse operations against current state, scoped to the affected entity and revision. Test remove → edit another item → undo. Do not roll back unrelated work. |
| E10 | P1 S/V | Cook links can bypass adaptation review; an invalid or newly conflicting saved state may enter cook mode without a current evaluation. | Re-evaluate the exact snapshot at entry. Clearly show known conflicts and unsupported portions; offer review or the explicitly selected source recipe. Never label an unresolved result as fitting the user's requirements. |

## F. Import, normalization, and draft repair

| ID | Priority / evidence | Loose end and consequence | Concrete resolution and acceptance condition |
| --- | --- | --- | --- |
| F01 | P1 L/S | Link and Screenshot look available before their limitations are revealed. Real URL extraction and OCR are not connected. | Mark Link as demo and Screenshot as unavailable before selection. Keep working paste import prominent. Preserve entered text/source URL on fallback. Do not build a backend/OCR service during this repair pass. |
| F02 | P0 T | “2 (400 g) cans chickpeas, drained” becomes 800 g with no issues, although the app's own source recipe says a 400 g can gives about 240 g drained. | Track package/net/drained mass separately. Ask for a drained amount or a validated product-specific yield; do not apply a universal drain factor. Preserve original text. |
| F03 | P0 S/L | Ginger-garlic paste is repaired by choosing garlic or ginger, dropping the other component from calculations. | Model a compound ingredient or explicitly leave its composition unknown. Offer split-with-amounts only on confirmed proportions. Never call a single-component match a resolved mixture. |
| F04 | P0 T | A malformed fraction such as `1/0 cup rice` produces non-finite numeric data without a numeric issue; zero amounts can pass without an issue. | Validate finite positive quantities at the parser boundary and again after user repair. Keep raw text, identify the specific line, and block affected calculations. |
| F05 | P1 T | A leading negative sign is stripped as a list marker: `-2 g paneer` becomes positive 2 g. | Distinguish bullet syntax from signed numbers. Flag suspicious signed quantities rather than silently changing the value. |
| F06 | P1 T | Serving parsing silently selects 4 from “4–6 servings,” 1 from “1.5 servings,” and accepts huge values. | Preserve ranges and fractional yield as unresolved source data. Ask for the intended servings used in calculations; bound calculations and explain limits. Never truncate silently. |
| F07 | P1 L/S | Drafts claim “Scale portions. Ready.” without providing a distinct target-portion action; editing Servings changes the source denominator. | Separate source yield from target yield. Add a real scaling control and derived display, or remove the capability claim until implemented. Never alter source yield to simulate scaling. |
| F08 | P0 S/V | Raw/cooked state resolution can confirm a cooked item against a dry catalogue entry without a valid cooked-weight mapping. | Require state-compatible ingredient IDs/data. State confirmation cannot by itself authorize a dry-to-cooked nutrient conversion. Test both rice directions and legumes. |
| F09 | P1 S | Resolved rows lack a general correction path for an incorrect auto-match or amount; controls mainly appear for blocking issues. | Provide Edit on every normalized row, including name, amount, unit, state, optionality, and omission. Show source text alongside changes; support undo. |
| F10 | P1 S | `state-mismatch` can block validation without the same repair control offered for `state`; unknown ingredient catalogue coverage can be impossible to resolve honestly. | Give every blocking issue a viable action: correct mapping/state, keep as unknown, exclude from a named calculation, or save as reference. Do not force a false match. |
| F11 | P1 L/S | “Leave out” means left out of calculations in draft review, but draft cook mode filters that ingredient out entirely. Method text may still require it. | Separate exclude from calculations from remove from recipe. Cooking should retain original ingredients unless an actual recipe edit is confirmed and reflected in the method. |
| F12 | P1 S/V | Pasted multi-recipe sections, repeated Ingredients headings, Markdown headings, section names, source notes, and long instructions can be mis-grouped. | Preserve raw import and present an extraction preview before creating the draft. Test two recipes, subcomponents, missing headings, no instructions, blank input, and mixed-language text. Provide correction rather than silent loss. |
| F13 | P1 L/S | The demo rajma cannot match kidney beans, and matching a familiar title only offers adapting the app's own recipe. | Keep the reference/adaptation boundary explicit. Add essential ingredient coverage only with appropriate data. Never imply that adapting the app's version preserves the imported author's ratios or method. |
| F14 | P1 V | Duplicate imports, huge pastes, very long URLs/titles, unsupported units, repeated ingredient lines, and Unicode fractions lack an established acceptance contract. | Set documented input limits, detect possible duplicates with user choice, preserve usable text on error, and consolidate only with clear matching/unit rules. Test valid multilingual content and literal HTML as harmless text. |

## G. Persistence, routing, and resilience

| ID | Priority / evidence | Loose end and consequence | Concrete resolution and acceptance condition |
| --- | --- | --- | --- |
| G01 | P0 S | `save()` returns false on failure, but `commit()` ignores it and continues displaying saved-state language. | Propagate persistence status. Show a persistent, unobtrusive “Changes are temporary on this device” notice, permit retry, and never announce durable save after failure. Test blocked/quota-exhausted storage. |
| G02 | P0 S | `load()` returns initial demo data after corrupt JSON or an unknown version. A later write can overwrite recoverable user work. | Preserve/quarantine unreadable raw data before recovery; offer reset or export recovery text. Never auto-overwrite an unsupported future version. Validate schema before rendering. |
| G03 | P0 S | Version-2 load shallow-merges most collections without structural validation. Bad references and wrong value types can crash views. | Validate every top-level shape and referenced recipe, item, rule, and version; recover valid records individually and explain skipped records. Test missing arrays, unknown IDs, null objects, and malformed profile data. |
| G04 | P0 S/V | No storage-event/concurrency reconciliation is present in the inspected controller. Two tabs can overwrite each other's full state. | Add a revision check and detect external updates. Reload/reconcile before writing or show a reviewable conflict; do not silently use last-write-wins for unrelated edits. |
| G05 | P1 S | Imported draft screens have no h1 and no title-map entry, producing `undefined · mise & match` in the observed tab title. | Add a semantic page heading and a title derived from the draft. Provide a focus target for route changes, including deleted/missing drafts and cook views. |
| G06 | P0 S/V | A cook route checks whether a version exists but not whether it belongs to the recipe ID in the URL. | Validate recipe/version relationships and revision availability. Missing or mismatched IDs should show a recoverable error, never a hybrid recipe or silent session fallback. |
| G07 | P1 S/V | Plans and historical versions resolve current catalogue recipes directly. Removed recipes/rules can invalidate references throughout views. | Migrate catalogue revisions and retain snapshots. Route missing records to a recovery state that preserves the user's saved content where possible. |
| G08 | P1 S/V | Module load/render failures have no user-visible recovery boundary; the static app can leave only its shell. | Provide a minimal startup/loading/error state, catch recoverable route/render failures, offer reload/back, and preserve stored data. Test failed module, failed font, and a malformed record. |
| G09 | P1 V | Local-only behavior can be mistaken for account backup or offline support. | Keep on-device persistence copy near saving/settings and make limitations discoverable. Do not claim cross-device or offline operation. Test offline refresh and explain failure; offline caching can remain deferred. |
| G10 | P1 S/V | Full root replacement on input can discard focus, caret, composition, disclosure state, scroll position, or unfinished form fields. | Patch narrowly where practical; otherwise preserve stable IDs, focus, selection, expanded state, and user input. Test IME composition, rapid search, editing one field then clicking an action, browser Back, and route restoration. |

## H. Accessibility and interaction

| ID | Priority / evidence | Loose end and consequence | Concrete resolution and acceptance condition |
| --- | --- | --- | --- |
| H01 | P1 L/S | Recommendation buttons repeat “Choose” and “Compare” without a distinctive accessible name. | Use labels such as “Choose chana masala with paneer” and “Compare selected paneer version.” Preserve concise visible text if desired. Test button navigation without visual card context. |
| H02 | P1 S | The dialog backdrop token is transparent, so an inert background can look available. | Use a restrained overlay for modal separation while retaining white surfaces. Confirm background inertness, focus containment, Escape, dismissal, and a visible close action. |
| H03 | P1 S/V | Dialog content is re-rendered and trigger restoration depends on the original DOM node still being connected. | Restore focus via a stable entity/action identifier when the node was replaced. If deleted, move to the nearest meaningful control or heading. Test apply, cancel, delete, and nested swap previews. |
| H04 | P1 S | Undo actions disappear after a fixed six-second toast timer. | Pause while hovered/focused and provide a persistent recovery path for meaningful removals. Do not make a timed toast the only way to recover work. Keep status announcements concise. |
| H05 | P1 S/V | Several candidate-specific actions, “I have enough,” “Leave out,” “Add back,” and manual item-name fields repeat labels. | Associate each with the ingredient/meal/version using accessible naming or description. Announce the consequence and preserve the user's location after updates. |
| H06 | P1 V | Focus indicators, 44px control tokens, and skip-link code exist, but rendered focus visibility and every actual target remain unverified. | Inspect actual interactive bounds and focus at narrow widths, keyboard-only, high contrast, and zoom. Correct exceptions; do not certify based on the token's existence. |
| H07 | P1 V | Dynamic search, fit counts, empty states, constraints, and changed shopping totals may not announce updates predictably. | Provide small live status summaries for relevant changes, avoid announcing the whole page, and ensure disabled controls have nearby reasons. Test with one real screen reader. |
| H08 | P1 V | Comparison tables, custom checkboxes, disclosures, status labels, and icon-only actions require semantic verification. | Verify headers, captions/context, accessible expanded/selected states, source-versus-adapted reading order, and icon labels. Retain existing aria-current and pressed states. |
| H09 | P1 S/V | Monochrome tokens collapse muted text, warning text, and many borders to the same black. Hierarchy relies heavily on small size and repeated rules. | Clarify semantic type/weight/spacing and status language. Use non-color cues. Keep warning, selected, edited, disabled, and neutral states distinct without adding more badges. |
| H10 | P1 V | Motion reduction exists, but text enlargement, text spacing overrides, forced colors, and native error announcements are not verified. | Test 200% text size, 400% browser zoom/reflow, user text-spacing overrides, reduced motion, and forced colors. Fix clipping and lost controls; preserve native semantics. |

## I. Responsive layout and extreme content

These are acceptance requirements, not claims of observed layout failure. Source inspection found fixed/flex/grid layouts and nowrap controls that warrant these checks; the current browser interface did not provide a supported viewport-emulation control.

| ID | Priority / evidence | Loose end and consequence | Concrete resolution and acceptance condition |
| --- | --- | --- | --- |
| I01 | P1 V | Only the design target around 430px has historical emphasis; intermediate widths are unspecified. | Inspect 320, 360, 390, 430, 540, 719/720, 959/960, 1024, and 1440px. No unintended horizontal page scrolling, overlap, or inaccessible action. Retain fluid layouts. |
| I02 | P1 S/V | Four step columns remain side by side, including long “Pantry and shopping.” | Test label wrapping at 320px and large text. Use compact accessible step navigation or a two-row layout when needed, preserving current-step meaning. |
| I03 | P1 S/V | Sticky action bars combine several nowrap buttons and automatic margins. | Allow wrapping or stack a primary action with secondary controls at constrained widths. Test Undo + Save + long next-step labels with 200% text. |
| I04 | P1 S/V | Header/bottom navigation, sticky actions, and toast offsets use several separate height assumptions. | Consolidate shell heights/layers into semantic tokens. Test safe-area devices and narrow landscape so no final row, control, or toast is covered. |
| I05 | P1 V | On-screen keyboards reduce available height around bottom actions, number fields, and dialogs. | Test short landscape and keyboard-open editing. Use dynamic viewport sizing, scrollable dialog bodies, and focus scrolling. Keep save/cancel reachable. |
| I06 | P1 V | Long dish/version names, regional names, unbroken URLs, and ingredient strings can stretch grids and pills. | Test 120-character titles, 200-character ingredient lines, and long unbroken URLs. Wrap full critical content, use min-width:0/minmax(0,1fr), and avoid information-losing truncation. |
| I07 | P1 V | Two-column comparisons can become unreadable before their breakpoint, especially with enlarged text. | Stack related before/after values with explicit labels at constrained widths. Preserve table relationships for assistive technology. |
| I08 | P1 V | Large pantry, saved, plan, and list collections can create heavy rendering and long unstructured pages. | Test 100 saved versions, 100 pantry entries, 20 meals, and 200 shopping lines. Bound expensive recomputation, group meaningfully, and retain search/filter position. Avoid adding virtualization unless measurement warrants it. |
| I09 | P2 V | Photo crops can cut off the dish, while thumbnail srcset sizes may request unnecessarily large assets. | Set focal points for approved photos, correct sizes to actual layouts, and verify portrait/landscape assets at high pixel density. Do not stretch or recolor imagery. |
| I10 | P1 V | Browser support for dialog, :has(), dvh, focus behavior, and safe-area calculations is not established. | Run the supported browser matrix, including iOS Safari and Android Chrome. Provide narrow fallbacks where needed and record actual versions checked. |

## J. Images, components, tokens, and content finish

| ID | Priority / evidence | Loose end and consequence | Concrete resolution and acceptance condition |
| --- | --- | --- | --- |
| J01 | P1 S/user | Food is forcibly grayscale. | Set `--photo-filter: none`; audit food-media selectors only. Verify source files are genuinely colored and that default, hover, selected, and disabled contexts do not desaturate them again. |
| J02 | P2 S | Missing images with a configured path hide the image and leave an outlined empty photo region; the initial-letter fallback is only used when no image exists. | Render the same labeled, intentional fallback for load failures. Preserve aspect ratio and dish identity; prevent layout jump. Retry only on explicit action or a changed source. |
| J03 | P2 L/S | Several recipes have typographic initials rather than photos, while others have food imagery. | Use consistent fallback composition and dimensions. Replace only with an accurate licensed photo of the dish; never substitute a visually similar but wrong dish. |
| J04 | P1 L/S | Credits say “Pexels, page link pending” and do not identify individual assets. | Record original page, creator, retrieval/license reference, asset filename, and dish in a small media manifest. Replace pending copy with accurate verified credit. Do not fabricate attribution or licensing. |
| J05 | P1 S/V | Hero image dimensions rely on CSS aspect ratio, with no explicit source width/height in generated img markup. | Add intrinsic dimensions matching prepared assets and verify stable loading, correct alt text, and LCP behavior. Keep hero eager and offscreen photos lazy; avoid blanket preloads. |
| J06 | P1 S/V | Existing tokens have no undefined references in the five inspected stylesheets, but shared state/component contracts are undocumented. | Preserve the token system. Document applied tokens for controls, focus, warnings, changed/selected states, density, media ratios, shell layers, and responsive behavior. Remove duplicate overrides only after checking visual regressions. |
| J07 | P1 S/V | Fixed layer offsets, raw z-index values, and one-off dimensions exist outside the token layer. | Add only necessary semantic tokens for shell/navigation/action/toast heights, layer order, and responsive component constraints. Do not tokenize every isolated pixel. |
| J08 | P2 V | Long unit labels, quantity numerals, glyphs, font loading, and fallback metrics need visual confirmation in Apfel Grotezk. | Check fractions, tabular numbers, diacritics, long ingredient names, and fallback loading. Verify the actual font license from bundled provenance before claiming commercial clearance. |
| J09 | P2 L/S | Repeated prototype warnings, evidence labels, playful copy, and dense explanatory sections can drown the immediate cooking decision. | Keep factual uncertainty at the decision it changes, with details disclosed on demand. Use direct empty-state actions before playful secondary copy. Never remove the underlying limitation merely to simplify the page. |
| J10 | P1 V | No complete component-state inventory is available in the supplied specification. | Inventory existing buttons, chips, inputs, steppers, rows, cards, tables, sheets, notices, toasts, disclosures, and navigation across default/hover/focus/pressed/disabled/error/loading/empty/long-content states. Mark inapplicable states instead of inventing unnecessary components. |

## Reproduced calculation probes

These checks ran against copies of the deployed pure modules, not a repository test suite. They expose current behavior; they are not passing product acceptance tests.

| Probe | Actual current result | Required result |
| --- | --- | --- |
| formatQty(0.25, '') | ½ | Preserve ¼ where ingredient supports it. |
| formatQty(0.125, 'tsp') | ¼ tsp | Preserve ⅛ tsp or an explicit authored practical measure. |
| formatQty(0.2, 'g') | 1 g | Preserve a usable subgram measure. |
| parseLine('2 (400 g) cans chickpeas, drained') | qty 800, cooked chickpeas, no issues | Flag unconfirmed drained yield rather than equating package mass to drained mass. |
| parseLine('1/0 cup rice') | Non-finite quantity; numeric issue absent | Invalid fraction, calculation blocked until repaired. |
| parseLine('0 g paneer') | qty 0, no issues | Explicit exclusion or invalid positive-quantity input, according to action. |
| parseLine('-2 g paneer') | qty +2, no issues | Flag suspicious signed quantity; preserve raw line. |
| parseServings('4–6 servings') | 4 | Preserve range and ask for calculation yield. |
| parseServings('1.5 servings') | 1 | Preserve fraction or reject explicitly, never truncate. |
| parseServings('Serves 999999999') | 999999999 | Bounded usable yield or a clearly unsupported value. |
| Unknown pantry stock, “enough” for 100 g, then requirement raised to 1,000 g | Still zero shopping need | Reconfirmation required. |
| CSS var reference scan over five stylesheets | No undefined variable references | Retain this check after edits; it does not establish that every needed component token exists. |

## Implementation order and completion gates

**First: protect recipe truth and work.** Fix quantity formatting, can/drained parsing, source-versus-target servings, dynamic method quantities, stale confirmations, zero/unit pantry handling, immutable recipe references, and truthful persistence status. Distinguish plausible estimates from verified data. Remove unsupported cooked-weight claims.

**Second: repair the connected journey.** Put relevant pantry constraints before ranking without imposing inventory upkeep. Fix scenario entry, target-fit messaging, recommendation destinations, repeatable snapshots, duplicate planning, transactional shopping reconciliation, and reviewable pantry updates after cooking. Keep unsupported imports as honest references.

**Third: visual and interaction pass.** Restore full-color photos, repair failed-photo tiles and credit records, address contextual action labels and modal separation, then run the full responsive/keyboard/content matrix. Color restoration is a small independent change and can be delivered early; it is not blocked by the calculation work.

For every audit row, Claude Code must record fixed, verified already working, or explicitly deferred with reason and user impact. P0 findings cannot remain silently deferred while calling the iteration complete. A pending real-kitchen test remains pending regardless of how many software tests pass. Production-ready import, clinically reliable nutrition, and allergy safety are not completion claims available to this prototype.

Minimum connected acceptance scenarios:

1. Fresh browser, chana masala for two, no fresh tomatoes. Record only relevant pantry information, choose canned tomatoes, review consequences, save, and generate only remaining needs. Every amount and instruction agrees.
2. Protein target 30 g, no hard restrictions. Show meets/maybe/closest truthfully, including no exact match, and never blame nonexistent restrictions. Add a second fiber target that cannot be achieved by the same candidate and explain that fact.
3. Portions one, two, four, and each dish's upper supported limit. Verify tiny quantities, water, oil, rice, seasoning, instructions, nutrition basis, list, and undo. Do not scale time linearly without evidence.
4. Two meals share a measured pantry ingredient. Allocate it once, edit/remove the first meal, and correctly reconcile the second. Preserve a manually edited and a checked line through regeneration.
5. Mark unknown stock enough, then raise portions or change the plan. Reconfirm. Enter zero, blank, invalid values, and change g to kg. No invented stock or physical-quantity change.
6. Buy one displayed purchasable amount, transfer it once, reload, and try again. No duplicate inventory. Finish cooking and review a single deduction with undo and plan completion.
7. Save an adaptation, plan a revision, modify the version, then accept or reject the update. Historical cooking records remain reproducible after a rule/catalogue change.
8. Make an unsaved version, cook it, mark make again, and repeat its exact snapshot. Switch recipes midway through cook checklists and reload without mixing or losing progress.
9. Paste an import with missing yield, a fraction, a compound paste, drained cans, cooked rice, optional garnish, and an unknown ingredient. Every blocking issue has an honest repair/fallback. Excluding something from calculations does not erase it from the cooking recipe.
10. Test empty collection/filter/no-match, all pantry unknown, all shopping pending confirmation, all checked, deleted referenced version, malformed route, unavailable image/font/module, failed storage, corrupt stored data, and concurrent tabs. Each has a usable next action and preserves recoverable work.
11. Run narrow/intermediate/wide, enlarged text, long-content, keyboard, reduced-motion, and supported mobile-browser checks listed above. Record tested environment and limitations.
12. Verify full-color photos across every existing media component, accurate fallbacks, no broken photo credits, and legible unchanged functional controls.

## Prompt to paste into Claude Project

Attach this complete file to the Claude Project message below. The requested output from Claude Project is a prioritized implementation brief and one execution prompt for Claude Code. It is not a claim that implementation has already happened.

Read the attached misematch-audit-and-claude-handoff.md in full, along with the project context, decision history, and recent messages you can actually access. We are refining the existing mise & match MVP at https://mukhs106.github.io/MiseMatch/, not starting over. Act as my senior product designer and systems partner, then write one precise implementation prompt for Claude Code to carry out this iteration. Do not claim access to earlier chats, Figma files, a browser tab, or repository files unless available. The audit inspected the deployed prototype and public source; distinguish confirmed findings from verification requirements and check them against the current repository before prescribing changes.

Keep the product centered on adapting familiar Indian and South Asian comfort food to pantry constraints, portions, dietary exclusions, and optional nutrition goals while explaining effects on flavor, texture, preparation, quantities, and nutrition. Saving, importing references, and shopping support that experience. Do not expand this repair pass into onboarding, accounts, live AI, automated web/OCR import, or an unrelated redesign. Retain the current typography and interface identity. One confirmed visual change is to restore natural full color to food photographs everywhere. The deployed cause is --photo-filter: grayscale(1) in css/tokens.css, consumed by .photo img in css/flow.css. Instruct Claude Code to set the food-photo treatment to none and check all media contexts without removing icon inversion or rebuilding the palette.

Prioritize calculation and state integrity. The current prototype mixes two-serving ingredients with four-serving explanatory copy, contains literal method quantities that do not follow scaling, rounds a quarter count to a half and an eighth teaspoon to a quarter, treats packaged can weight as drained food weight, and keeps “I have enough” confirmations after requirements grow. Zero pantry quantities can become unknown positive presence, unit changes relabel rather than convert amounts, and purchase transfers are only marked in temporary UI state. Specify one consistent derived recipe model, deliberate precision rules, source versus target yield, state-aware ingredients and conversions, invalid-input recovery, requirement-bound confirmations, repeat-safe purchase transfers, and a reviewable pantry update after cooking. Remove unsupported cooked-portion-weight claims and keep fixture nutrition visibly illustrative.

Repair the journey so relevant pantry constraints inform the first recommendations without requiring full pantry setup. Match the home scenario's promise to its actual destination. Separate hard-constraint eligibility from nutrition target achievement and distinguish meets, may meet, closest supported, and insufficient data. Do not describe missing catalogue coverage as conflicting user requirements or lower multiple targets using incompatible candidates. Keep recommendation destinations attached to the proposed adaptation. Preserve source recipes, saved versions, planned revisions, and cooked snapshots across catalogue changes. Make shopping reconciliation transactional, prevent accidental duplicate planned meals, preserve manual edits and checked purchases, distinguish pending pantry checks from a completed empty list, and retain repeatable unsaved cooking snapshots.

Keep imports honest and repairable. Distinguish demo links and unavailable screenshot import before users invest effort. Preserve raw source text and attribution, provide editing for every normalized row, and handle missing quantities/yield, invalid fractions, compound ingredients, raw/cooked/drained states, optional ingredients, unknown matches, and unsupported combinations explicitly. Do not resolve ginger-garlic paste by discarding half its identity, simulate portion scaling by changing source yield, or remove an ingredient from cooking merely because it was excluded from calculations. Unsupported imports may remain saved references with clear limitations.

Translate all audit rows into an implementation checklist with IDs, priorities, affected behavior, and acceptance checks. Have Claude Code inspect and reuse existing modules, tokens, conflict handling, migrations, accessibility states, and tests. It must address storage failures and recoverable corruption, stale or mismatched routes, cross-tab conflicts, contextual accessible action names, modal backdrop/focus, timed Undo recovery, failed-image fallbacks, credits, long content, and responsive shell/action layouts. Require meaningful tests for calculations, migrations, shopping allocation, version history, and state transitions, plus rendered checks at the audit's listed widths and on supported mobile browsers where available. Do not invent passed checks, missing tokens, licensed assets, kitchen validation, or allergy safety. Each item must finish as fixed, verified already working, or explicitly deferred with reason and impact.

First give me a concise synthesis of what changes and why, including any necessary compromises. Then provide one self-contained Claude Code prompt in concise connected paragraphs, with the audit attached as the detailed acceptance contract. Tell Claude Code to read its available project instructions, inspect the working tree, preserve unrelated work, use the existing stack, implement in connected increments, and continue through verification rather than stopping at a plan. Update the existing product-context and decision records instead of creating competing specifications. Do not carry forward old merge or publication authorization from historical handoff documents; this request is to prepare and verify the implementation. Finish with the actual changes, checks run, unresolved limits, and remaining blockers. The iteration must not be declared complete with unresolved P0 defects or unreported verification gaps.


## T10 status (November 2, 2026, branch `claude/t10-integrity-refinement`)

Evidence: "Test" is `tests/core.test.js`; "S" is a scenario in `tools/review/acceptance.mjs`; "Matrix" is `tools/review/matrix.mjs`. All browser evidence is desktop Chrome 156 on macOS. Evidence files are in `reviews/2026-11-02-t10/` (git-ignored).

| ID | Priority | Status | What was done, or why not | User impact and limits | Evidence |
| --- | --- | --- | --- | --- | --- |
| A01 | P1 | fixed | Step 1 has an optional "What needs changing?": Have it / Missing for key ingredients and alternatives. Missing is today-only; ranking puts avoiding it first. | The no-tomato case shapes the first recommendation. | Test A01; S1 |
| A02 | P1 | fixed | Start row opens a previewed 2-serving canned tomato session, labelled, without touching pantry or collection. With unsaved work it asks; the row is hidden once work exists. | The promise matches the destination. | S1, S1b |
| A03 | P1 | fixed | Not checked, don't have, have unknown, have measured are distinct. Unchecked needs count as "to check". | No false claim of absence, no inventory required. | Test A03; S1 |
| A04 | P0 | fixed | `groupByFit`: Meets, May meet, Closest supported, Can't estimate; eligibility is settled separately. | A goal isn't implied to be met. | Test A04-06; S2 |
| A05 | P1 | fixed | `resolve` returns a `cause`; copy follows it. "Within your requirements" only appears when requirements exist. | No blame on requirements that don't exist. | Tests A04-06, A05; S2 |
| A06 | P0 | fixed | Lower targets come from one eligible candidate, as a set; competing goals are named per version. | No promise of joint feasibility from separate maxima. | Test A04-06; S2 |
| A07 | P1 | fixed | Sides and other dishes open a session with the proposed option and portions, for review. Combined totals are stated as not computed until both are planned. | Links keep the proposal. Limit: no combined quantity, time or nutrition view for two dishes before planning them. | S1b |
| A08 | P1 | fixed | `timingFor`: active, elapsed, advance. Advance time counts against limits; times don't scale with portions. | A soak can't pass as a quick dinner. | Test B10 A08 |
| A09 | P1 | fixed | `relevantQuestions`: asked only when a candidate depends on the answer. Settings show only nut scope and eggs; explicit exclusions unchanged. | No unrelated questions before proceeding. | Test A09 A10; capture |
| A10 | P1 | fixed | Semantics documented: hard exclusions and time filter; goals rank and label, never hide. Time-only and protein-only profiles are evaluated. | The filter means what it says. | Test A09 A10 |
| A11 | P1 | fixed | Today's requirements are labelled as dish-only; cook mode re-evaluates under current requirements; records keep a short "made under" note. | Scope is visible; earlier requirements aren't implied to be permanent. | S8; Saved view |
| A12 | P0 | fixed | `comboStatus` needs an exact bundle for 3+ rules; `wholeSetUntested` is labelled everywhere. Pairs from inside larger bundles no longer count. | Pairwise authoring doesn't upgrade a set. | Test A12 |
| B01 | P0 | fixed | `servingDescription` and `{q:slot}`/`{n}` effect tokens render from active state. | No mixed serving bases. | Test B01; S1, S3 |
| B02 | P0 | fixed | `methodQty` with `{=key}` tokens; no literal liquid amounts remain in steps (enforced by test). | Method and ingredients agree. | Test B02 B09; S3 |
| B03 | P0 | fixed | Counts keep ⅛ and ¼ steps; ¼ count shows ¼. | Counted ingredients don't double. | Test B03-05 |
| B04 | P0 | fixed | Eighth-teaspoon display; below that, "a pinch". | Doses don't double. | Test B03-05; S3 |
| B05 | P0 | fixed | Sub-gram amounts show one decimal. | No one-gram floor. | Test B03-05 |
| B06 | P0 | fixed | `estimate` uses `practical` amounts; large roundings are named on Compare. | Estimate and recipe describe the same food. | Test B06 |
| B07 | P0 | fixed | Serving-weight claim removed; `rawWeightChange` says uncooked weight going in, not on the plate. | No unsupported cooked weight. | Test B07; S1 |
| B08 | P0 | fixed | `RANGE_NOTE` next to estimates: illustrative band around fixtures, not measured uncertainty. | Band no longer reads as a confidence bound. | Test B06; S1 |
| B09 | P1 | fixed | Pan fat stays within the authored range with a dish pan note showing the amount; liquids get a three-quarter rate; both are authored assumptions, not measured. | Scaling assumptions are visible. Rates are not kitchen-tested. | Test B02 B09 |
| B10 | P1 | fixed | `servingsRange` per dish, shown beside the control; stepper bounded; out-of-range rules named with a remove action. | No invalid batch without explanation. | Tests B10, portions; S3 |
| B11 | P1 | fixed | `optional` carried through lines, method, needs and estimates; not a purchase unless added. | Garnish isn't a default buy. | Test B11; S1 |
| B12 | P1 | fixed | State mismatches keep estimates unknown; cup-to-mass only with an item density; counted weights only for counted units. | Unknown stays unknown. Regional cup sizes aren't modelled: a cup is 240 ml. | Test F03 F08 F10 B12 |
| C01 | P0 | fixed | `parseAmount`, `applyAmountInput`: zero is out, invalid and exponent rejected inline, blank needs Clear amount. | No invented stock. | Test C01 D09; S5 |
| C02 | P0 | fixed | `changeUnit` converts; incompatible units ask. | 500 g never becomes 500 kg. | Test C02 C07; S5 |
| C03 | P0 | fixed | Answers are keyed by fingerprint of combined requirement, entry and pantry revision. | A stale yes can't hide a shortfall. | Test C03 C04; S5 |
| C04 | P0 | fixed | One question about the combined total across meals. | Repeated yeses can't imply finite stock. | Test C03 C04; S5 |
| C05 | P0 | fixed | Optional "Update pantry after cooking" from the exact snapshot; once per record; unknown stays unknown; only the intended plan entry; Undo. Never automatic. | Light-pantry decision kept. | Test C05; S6 |
| C06 | P0 | fixed | `line.transfer` persisted; repeat refused; "Bought more" is separate. | No double inventory after reload. | Test C06 D02; S6 |
| C07 | P0 | fixed | Incompatible purchases go in `also`; on unknown stock, `atLeast`. | No measured amount lost. | Test C02 C07 |
| C08 | P1 | fixed | Quick-add off leaves a recovery record with the amount. | Removal is recoverable. | S1b |
| C09 | P1 | fixed | Free text has a Match path with likely candidates; wording and amount stay until chosen. | Free text can join calculations. | Test C09-11; S10 |
| C10 | P1 | fixed | `core/search.js` used by pantry, import repair and recipe search. | Regional names work everywhere. | Test C09-11; S10 |
| C11 | P1 | fixed | Enter adds only an unambiguous exact match. | No accidental first-substring adds. | Test C09-11; S10 |
| D01 | P1 | fixed | `samePlanned` asks instead of doubling; "Add another meal" is explicit. | No accidental double shopping. | Test D01 etc; S4 |
| D02 | P0 | fixed | Needed, to buy and bought are separate; the bought amount is confirmed and transferred. | ½ lemon needed, 1 bought, 1 stored. | Test C06 D02; S6 |
| D03 | P1 | fixed | Preview states its scope; a session already planned stands in for that meal; update vs add another is a choice. | No double-counting in preview. | Shop view; S1 |
| D04 | P0 | fixed | `listStatus` with separate states and copy. | Pending checks never read as done. | Test D04 D05; S10 |
| D05 | P1 | fixed | `dismissedReview` shows was and now, with Add back. | Dismissal isn't silently treated as enough. | Test D04 D05 |
| D06 | P1 | fixed | Removal reconciles all remaining meals together. | Freed stock applies at once. | Test D01 etc; S4 |
| D07 | P1 | fixed | Signatures use canonical amounts with a 0.01 tolerance. | Small changes are seen. | Test D01 etc |
| D08 | P1 | fixed | `reconcile` places every contribution, then compares each line once. | One conflict from the final total. | Test D01 etc; S4 |
| D09 | P1 | fixed | Blank is an unfinished edit; 0 is deliberate and labelled. | Blank isn't zero. | Test C01 D09 |
| D10 | P1 | fixed | Precedence defined in `shopping.js`; transitions tested with two shared-ingredient meals. | Edits and checks survive. Covers the main transitions, not an exhaustive pair matrix. | Test D10; S4 |
| E01 | P0 | fixed | Revisions and `deriveSnapshot` on saved, planned and cooked records; changed rules read from the snapshot. | History isn't rewritten. | Test E01 G07; S7 |
| E02 | P1 | fixed | Decision: a version saves the recipe outcome, not requirements; stated in the save sheet; dirty check stays recipe-only. | No false impression either way. | Save sheet |
| E03 | P1 | fixed | `uid` via crypto.randomUUID with fallback. | No collisions at one timestamp. | Test E03 |
| E04 | P1 | fixed | `repeatable` keeps unsaved records; `repeat-cook` restores them, or opens the record if rules changed. | A positive meal has a destination. | Test E04; S8 |
| E05 | P1 | fixed | Checks live on a per-visit `cooking` record. | Progress can't transfer between recipes. | S8 |
| E06 | P1 | fixed | Persisted; resume or Start again; ticking patches one row. | Reload keeps progress. | S8 |
| E07 | P1 | fixed | Snapshot frozen at entry, with a notice if the working version moved. | Instructions don't change mid-cook. | S8 |
| E08 | P1 | fixed | Remove ingredient changes keeps portions; Reset everything is separate. | Portions aren't lost by accident. | Options view |
| E09 | P0 | fixed | `core/recovery.js` narrow inverses replace whole-state snapshots. | Undo doesn't erase later work. | Test E09; S4, S6 |
| E10 | P1 | fixed | Entry re-evaluates; conflicts, questions, unsupported portions and untested sets are shown with Review or as written. | An unresolved result is never labelled as fitting. | `cookChecks`; S7 |
| F01 | P1 | fixed | Tabs say Link (demo only), Screenshot (unavailable); paste first; text and URL kept. | No effort wasted before the limit shows. | S9 |
| F02 | P0 | fixed | `pack` tracks package, net and drained; a drained amount is asked for. | No 800 g from two cans. | Test F02-05; S9 |
| F03 | P0 | fixed | `compound` stays compound; keep unknown, exclude, or split with stated amounts. | No half-identity resolution. | Test F03 etc; S9 |
| F04 | P0 | fixed | Finite-positive check at parse and repair. | No infinite or zero amounts. | Test F02-05; S9 |
| F05 | P1 | fixed | Bullets need a space; signed numbers are flagged. | "-2 g" isn't 2 g. | Test F02-05 |
| F06 | P1 | fixed | `parseYield` keeps ranges, fractions and implausible values unresolved; picks offered. | No silent truncation. | Test F06 F07 |
| F07 | P1 | fixed | `targetServings` separate from source yield, with a Make for control. | Scaling is real. | Test F06 F07; S9 |
| F08 | P0 | fixed | State answers can't clear a mismatch; such lines stay unknown in estimates. | No dry values on cooked amounts. | Test F03 etc; S9 |
| F09 | P1 | fixed | Edit on every row: match, amount, unit, state, optional, exclude, remove, reset. Undo and recovery. | Wrong readings can be corrected. | Test F11 F09; S9 |
| F10 | P1 | fixed | Every blocking issue has actions; `calc: unknown` is an honest answer. | No forced false match. | Test F03 etc; S9 |
| F11 | P1 | fixed | `excluded` vs `removed`; cook mode keeps excluded lines, labelled. | Cooking keeps the recipe intact. | Test F11 F09; S9 |
| F12 | P1 | fixed | Preview before a draft; raw text kept; Markdown, parts, combine; no instructions and blank handled. | No silent mis-grouping. Grouping is heuristic: odd pastes can still need Combine or editing. | Test F12 F14; S9 |
| F13 | P1 | fixed | Kidney beans added with fixture data; the adaptation boundary is stated on the draft. | Reference and our version stay distinct. | Test F12 F14 |
| F14 | P1 | fixed | `INPUT_LIMITS`; duplicate choice; long content and literal HTML harmless. | Bad input is contained. Repeated lines aren't consolidated. | Test F12 F14; S9; matrix |
| G01 | P0 | fixed | `save` reports; persistent notice with Try again; `durable()` copy. | No false durable-save claim. | Test G01; S10 |
| G02 | P0 | fixed | Quarantine and protect; recovery route with export; Start fresh is explicit. | Unreadable data is never overwritten. | Test G02; S10 |
| G03 | P0 | fixed | `validateState` per record; skipped kept and explained. | A bad record can't crash views. | Test G03; S10 |
| G04 | P0 | fixed | Revision key, storage event, conflict review. | No silent last-write-wins. The choice is whole-state, not a per-record merge. | Test G04; S10 |
| G05 | P1 | fixed | Draft h1 and title; `titleFor` on all routes. | No undefined tab titles. | S9, S10; matrix |
| G06 | P0 | fixed | `parseCookRoute` validates relationships and shows a recoverable error. | No hybrid recipes. | S10 |
| G07 | P1 | fixed | Snapshots and migration; records with unknown recipes go to Saved with explanation. | Saved content is preserved. A record for a removed recipe can't be opened as a recipe, only exported. | Tests E01; G03 |
| G08 | P1 | fixed | Render try/catch, action guard, boot-failure message, loading state. | No blank shell. | S10 |
| G09 | P1 | fixed | Local-only copy near Save, Saved and Settings; offline stated as not supported. | Not mistaken for backup. Offline caching stays out of scope. | S1b |
| G10 | P1 | fixed | Stable focus signatures, kept inputs, disclosures, scroll, composition guard. Still full-root rendering, not patching, except cook ticks. | State survives redraws. IME checked with simulated events only. | Matrix |
| H01 | P1 | fixed | Contextual aria-labels on Choose and Compare. | Buttons make sense out of context. | Matrix |
| H02 | P1 | fixed | Native modal: inert background, focus containment, Escape, visible close, 2 px border. Backdrop stays transparent per Part 9. **Dimming is the owner's decision.** | Works without dimming; the page behind is still visible. | Matrix |
| H03 | P1 | fixed | Trigger stored as a signature; falls back to the page heading. | Focus isn't lost. | Matrix |
| H04 | P1 | fixed | 10 s, pauses on hover and focus, has a close control; Saved lists Recently removed. | Recovery doesn't depend on a timer. | Matrix |
| H05 | P1 | fixed | Item, meal and version in repeated action names. | Clear in a screen reader's list of controls. Not verified with a real screen reader. | Matrix (names only) |
| H06 | P1 | fixed | Measured at all widths; exceptions fixed. Native checkboxes and radios are excluded from that measure. | Targets and focus rings measured. | Matrix |
| H07 | P1 | deferred | Live region added for portions, search counts, fit counts and list changes, but no real screen reader was available. | Announcements are unverified for screen reader users. | Code only; needs VoiceOver or NVDA |
| H08 | P1 | fixed | Captions, scoped headers, names and labels checked on every route; aria states kept. | DOM semantics hold. Real screen reader reading order not verified (see H07). | Matrix |
| H09 | P1 | verified already working | Part 9 treatments measured as distinct for selected, neutral, disabled, edited, changed. Warnings use icon and lead word. Nothing had collapsed. | No color needed. | Matrix: states |
| H10 | P1 | fixed | Reflow fixes, then 200% text, 400% zoom layout, text spacing, reduced motion, forced colors pass. Zoom is a 320×200 viewport, not browser zoom UI. | No clipped or lost controls in Chrome. | Matrix; screenshots |
| I01 | P1 | fixed | All 11 widths, 17 routes: no overflow, off-screen control or missing h1. | Layouts hold. | Matrix; capture |
| I02 | P1 | fixed | Step grid uses auto-fit, so it wraps at large text. | Long labels fit. | Matrix |
| I03 | P1 | fixed | Action bar and controls wrap. | All actions reachable. | Matrix |
| I04 | P1 | fixed | `--h-tabbar`, `--h-actionbar`, `--safe-bottom`, `--z-*`. Safe areas not seen on a real device. | Offsets come from one place. | Matrix: landscape |
| I05 | P1 | deferred | Short landscape handled and measured (bars stop being sticky; dialog body scrolls), but a real on-screen keyboard wasn't available. | Keyboard-open editing on phones is unverified. | Matrix: landscape; needs a device |
| I06 | P1 | fixed | 120-character titles, 200-character lines and long URLs wrap. | No stretched grids. Long text in a single-line input scrolls inside it. | Matrix |
| I07 | P1 | fixed | Comparison tables fixed-layout with wrapping; labels kept. | Readable at large text. Columns stay side by side, not stacked. | Matrix; screenshots |
| I08 | P1 | verified already working | 100 versions, 100+ pantry, 20 meals, ~200 lines: routes draw in about 25-45 ms; no virtualization needed. | Fast on this Mac; not measured on a phone. | Matrix: large |
| I09 | P2 | fixed | `sizes` corrected; `focal` added for two crops. | Dish stays in frame. Reviewed at thumbnail size on a 430 layout. | Screenshots |
| I10 | P1 | deferred | Only desktop Chrome 156 was available. iOS Safari, Android Chrome, Safari and Firefox weren't run. | `:has()`, `dvh`, safe areas and dialog behavior there are unverified. | Needs those browsers |
| J01 | P1 | fixed | `--photo-filter: none`; the single consumer checked; hover, saved and cook contexts scanned; sources verified colored. | Food is in color. | S12 |
| J02 | P2 | fixed | Error listener swaps a failed photo for the same tile. | Intentional fallback, no layout jump. | S10 |
| J03 | P2 | fixed | Tile also on overview heroes. **Owner check:** the aloo paratha photo shows plain layered parathas with chai, and the chana palak photo shows no visible spinach. Alt text corrected; photos kept pending your decision. | Consistent fallback. Two photos may breach the no-stand-in rule. | S12; visual review |
| J04 | P1 | deferred | No verified page links exist. Fields added as null; "page link pending" stays; nothing invented. | Photos still aren't cleared for use beyond the prototype. | Manifest; needs the page links from the owner |
| J05 | P1 | fixed | width and height on img; hero eager, others lazy. LCP not measured. | Stable loading. | S12; matrix |
| J06 | P1 | fixed | State contract in Part 9; undefined-variable scan repeated. | Contract recorded. | Part 9 |
| J07 | P1 | fixed | Shell tokens only. | Offsets and layers named. | `css/tokens.css` |
| J08 | P2 | verified already working | Fraction glyphs measured as present in the font by width comparison; fallback font works. OFL 1.1 license file present. | Fractions render in the brand face. | Matrix: fonts; S10 |
| J09 | P2 | fixed | Repeated prototype notes moved to disclosures; limits stay at the decision and in settings. | Less noise, limits kept. | Today, Recipes |
| J10 | P1 | fixed | Inventory in Part 9, marking what's inapplicable. | Contract recorded. | Part 9 |

Totals: 102 fixed, 3 verified already working, 4 deferred. No P0 row is deferred. No real kitchen test has happened: amounts, scaling rates, times and rules remain untested suggestions. Nutrition values remain fixtures. Nothing here is an allergy-safety, accessibility or production-import claim.
