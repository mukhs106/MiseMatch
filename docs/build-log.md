# Build log

## 2026-10-29 · T04 Align build with decision record
- Changed: partial amounts now live in each recipe's adaptation (shared on-hand list is presence only; old shared partials dropped on load); removed the double-count list note and limitation. Secondary button is a tonal fill with no outline. Accents moved to `assets/accents/` as temporary placeholders. Canned tomato copy (chana masala), "Contains dairy." on paneer, generic "No change." effects removed, one scaling note when servings differ, "No swap" buttons replaced by an inline "No tested swap" disclosure. Record and CLAUDE.md updated for C1 to C10.
- Verified: `npm test` 18 pass (2 new). Browser at 430 and 1280 from Reset demo: rice 100 g in chana masala only, list rice 350 g (50 + 300); tonal buttons; dairy note in row and sheet; ground ginger shows only Flavor, Quantities, Prep; scaling note; no console errors.
- Not checked: Safari, Firefox, a physical phone, a screen reader.
- Follow-up: C4's new copy applies to chana masala only; the canned tomato swaps in paneer bhurji and tomato-egg still say "deeper, more cooked". C7 interpretation: the existing "No swap" buttons counted as dead ends, so recorded reasons now show inline.

## 2026-10-29 · Visual refresh, route-focus fix, mobile workflow (owner request, not a queued task)
- Changed: white page and section surfaces (cream only for small tonal controls); typographic wordmark replaces the image and ampersand badge; My Recipes leads with a quiet start card, optional "Cook from what you have" disclosure, then saved recipes; recipe pages show "Ways to adapt" above the ingredients; list empty and populated states share one shape. Fixed the title outline (script focus on load) and the skip link (read as a route). `npm start` prints a LAN URL; README has VS Code, Chrome device mode, phone and Pages steps. Review tooling in `tools/review/`; evidence rule added to CLAUDE.md.
- Verified: `npm test` 18 pass; Playwright before 48/60, after 76/76 at 430 × 932, 360 × 740, 1280 × 860 plus a recorded 430 × 932 walkthrough; returning-session load in the in-app browser.
- Evidence: `reviews/2026-10-29-visual-refresh/` and `reviews/2026-10-29-visual-refresh.zip` (git-ignored).
- Not checked: Safari, Firefox, a physical phone, a screen reader. Not pushed (pushing updates GitHub Pages).
- Follow-up: T01's after screenshots should be retaken on this design; En Clair remains an unverified wordmark candidate.
