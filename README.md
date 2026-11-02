# mise & match

A recipe adaptation app for familiar Indian and South Asian comfort food. It fits a dish to your pantry, portions, dietary requirements and optional nutrition goals, and shows what changes in the dish before you cook it. Saving, planning and the shopping list support that.

**Status:** class MVP prototype. The 10 recipes and their adaptation rules are written for this prototype and not kitchen-tested; nutrition values are hand-entered fixtures, not verified food data; link import works only with labelled demo pages. See `docs/product-context.md`, section "Version 0.6".

## Run it locally

You need [Node.js](https://nodejs.org) 18 or newer. There is nothing to install.

**In VS Code:** File → Open Folder… → choose `MiseMatch`. Open the integrated terminal (Terminal → New Terminal, or Ctrl + `) and run:

```bash
npm start
```

It prints two addresses, for example:

```
mise & match running at http://localhost:8080
  on your network:  http://10.0.0.139:8080
```

Open http://localhost:8080 in Chrome. Leave the terminal running while you test; press Ctrl + C in it to stop. Save a file and reload the page to see the change (the server sends no-cache headers). Opening `index.html` straight from Finder won't work, because the app uses JavaScript modules.

To run the tests:

```bash
npm test
```

### Phone size in Chrome (simulation)

1. With the app open in Chrome, press Cmd + Option + I to open DevTools.
2. Press Cmd + Shift + M (or click the phone-and-tablet icon at the top left of DevTools) to turn on the device toolbar.
3. In the toolbar's device menu choose **Dimensions: Responsive**, then type **430** and **932** in the width and height boxes. To keep it, choose Edit… → Add custom device, name it "Phone 430", 430 × 932, device pixel ratio 3, type Mobile.
4. Reload the page. Also try 360 × 740 for a small phone.

This simulates a phone's screen size and touch input in desktop Chrome. It does not reproduce a real phone's browser, fonts, keyboard, safe areas or performance.

### On your actual phone

1. Connect the phone to the same Wi-Fi as the Mac.
2. Run `npm start` and type the "on your network" address (for example `http://10.0.0.139:8080`) into the phone's browser. If macOS asks whether to allow incoming connections for `node`, choose Allow.
3. Saved data on the phone is separate from the Mac's (it lives in each browser).

If it doesn't load, check both devices are on the same network (guest or office Wi-Fi often blocks this), or use the GitHub Pages link below once your changes are pushed.

### Local changes vs the live site

- **Local** (`npm start`): shows the files on your Mac right now, including unsaved-to-git edits. Only you see it.
- **GitHub Pages** (https://mukhs106.github.io/MiseMatch/): shows whatever was last pushed to the `feature/first-working-mvp` branch on GitHub. Commits that haven't been pushed don't appear there, and Pages can take a minute or two to update after a push. Anyone with the link sees it.

## Try this (the demo path)

1. On **Today**, choose **Start here: Chana masala for 2, with no fresh tomatoes**, then **Adapt this dish**.
2. **Portions and needs**: set servings to 2. Requirements are optional.
3. **Options**: under **Change one thing**, choose **Tomatoes**, preview **Canned tomatoes** (texture, acidity, cooking, method, all labelled as a suggestion we haven't cooked) and apply it. Try **Undo** in the bottom bar.
4. **Compare**: original and your version side by side at the same servings: ingredients, expected changes, method, and the optional nutrition estimate.
5. **Pantry and shopping**: set rice to **Have this much… 100 g** and onion to **Have, amount unknown**. Onion asks whether you have enough instead of assuming. Choose **Add to shopping list**, then **Save version and add** or **Add without saving**.
6. Open **Pantry → Shopping list**: rice is 50 g (150 − 100). Then **Saved → Make again**, add frozen spinach, **Save… → Update**: the shopping list offers the update for review instead of changing.
7. **Cook now**, then **I cooked this** to leave optional feedback on that exact version.
8. Conflicting needs: open **Paneer butter masala → Adapt**, choose **Plant-based (vegan)** and **Nuts**, answer the questions, set protein to 30 g, and see **Options** explain the gap with real choices. Avoid soy too and it says no supported version fits.
9. **Import**: Today → Import a recipe → Link → a demo link. The draft keeps original wording and blocks only the actions an issue affects.
10. Reload at any point: your session resumes from **Today → Pick up where you left off**. **Reset demo** is under the avatar.

## Replacing placeholder art

- Wordmark: typographic, set in `index.html` and styled by `.wordmark` in `css/base.css`.
- Icons: replace any file in `assets/icons/` with a drawing of the same name (shown at 20 × 20 px).

## Review evidence

Substantive UI changes get before/after screenshots and a recorded walkthrough:

```bash
cd tools/review
npm install
node capture.mjs --label after --video --out ../../reviews/2026-10-29-visual-refresh
```

It uses your installed Google Chrome (or Playwright's Chromium) and saves PNGs at 430, 393, 360 and 1280 px wide, an MP4 walkthrough and `results.json` (viewport, revision, scenario, pass/fail) under `reviews/`, which git ignores.

## Docs

- `CLAUDE.md`: project rules and commands for development.
- `docs/product-context.md`: product and design decision record, scope, limitations and next priorities.

## Credits

Photos: Pexels (free license). Individual page links are pending and are tracked in `assets/images/manifest.json` and `docs/image-sources.md`; web-sized copies are in `assets/images/web/`.

Apfel Grotezk by Collletttivo (Luigi Gorlero), SIL Open Font License 1.1. See `fonts/OFL-ApfelGrotezk.txt`.
