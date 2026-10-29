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

## 2026-10-29 · Photography and discovery pass (owner request, run before the queue)
- Changed: reviewed all 22 photos by eye into `assets/images/manifest.json` (2 excluded for third-party copyright notices, 20 unverified, 0 cleared); originals git-ignored, never modified. `tools/images` (sharp) builds 102 WebP/JPEG variants at 480/960/1440 into `assets/img/` and generates `docs/image-sources.md`. Chana masala gets the only recipe photo (card 4:3, hero 4:5 capped / 4:3 wide); the other four recipes get the `#F3F2E7` tile, which also covers failed loads. Thali cutout as the Recipes supporting image; spice box reserved for Pantry. My Recipes renamed Recipes; search with an honest scope label; All recipes / Use what you have / Saved with reasons from `suggest()`. T05 trimmed to tabs, avatar and Pantry. Decision log: discovery (Confirmed), image rules and recipe sourcing (Proposed). Dev server sends image MIME types; `capture.mjs` takes `CHROME_PATH` and checks images, search, views and the fallback.
- Verified: `npm test` 20 pass (2 new). Review capture before 60/60, after 170/170 at 430, 360 and 1280, plus a 430 walkthrough MP4; all 102 variant URLs 200.
- Evidence: `reviews/2026-10-29-photography-discovery/` and `reviews/2026-10-29-photography-discovery.zip` (git-ignored).
- Size: 61.3 MB of originals → 4.1 MB for the largest WebP of each (93.4% smaller); 14.2 MB for all variants (76.8% smaller).
- Not checked: Safari, Firefox, a physical phone, a screen reader.
- Not pushed: every used image is unverified. The originals were already pushed in `2b76443` (see the handoff).
- Follow-up: owner to fill `sourceUrl` and `license` and set statuses; decide on butter-paneer-01 (Pixytales copyright notice) and on "Blend the rules." for the Recipes header.
