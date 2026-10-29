# mise & match

A first working version of a recipe app that helps you adapt recipes to the ingredients you have, how many people you're feeding, and optional protein or fiber goals, while explaining what each change does to the dish.

**Status:** class MVP prototype. Recipes, swaps and nutrition values are demo data.

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

1. On **Recipes**, search for an ingredient (for example "chickpea"), or switch to **Use what you have**.
2. Open **Chana masala** (the "Start here" row). Set servings to 2 and set rice to **Some** with 100 g.
3. Go back and open the **Pantry** tab: rice shows 100 g. Recipes and Pantry share it.
4. Back in the recipe, under **Ways to adapt**, choose **Tomatoes**, compare canned tomatoes, then apply it. Try **Undo** on a change.
5. Choose **Add to list**, then open the **Grocery list**: rice is 50 g (150 − 100). Check off an item and choose **Add to pantry**.
6. Reload: everything is kept. **Reset demo** is under the avatar (Profile and settings).

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

It uses your installed Google Chrome and saves PNGs, an MP4 walkthrough and `results.json` (viewport, revision, scenario, pass/fail) under `reviews/`, which git ignores.

## Docs

- `CLAUDE.md`: project rules and commands for development.
- `docs/product-context.md`: product and design decision record, scope, limitations and next priorities.

## Credits

Apfel Grotezk by Collletttivo (Luigi Gorlero), SIL Open Font License 1.1. See `fonts/OFL-ApfelGrotezk.txt`.
