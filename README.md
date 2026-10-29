# mise & match

A first working version of a recipe app that helps you adapt recipes to the ingredients you have, how many people you're feeding, and optional protein or fiber goals, while explaining what each change does to the dish.

**Status:** class MVP prototype. Recipes, swaps and nutrition values are demo data.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer. There is nothing to install.

```bash
npm start
```

Then open http://localhost:8080. (Opening `index.html` directly from your file system won't work, because the app uses JavaScript modules. VS Code's Live Server extension also works.)

To run the tests:

```bash
npm test
```

## Try this (the demo path)

1. On **My Recipes**, choose **Open and adapt it** on Chana masala.
2. Set servings to 2. Mark chickpeas and onion as **Have**, use **I have all of these** for spices, and set rice to **Some** with 100 g.
3. Use **Swap** on tomatoes, compare canned tomatoes, then apply it.
4. Under Ideas, preview and apply **Add paneer** (or **Add frozen spinach**), then **Undo** one change.
5. Try **Swap** on chickpeas to see dried chickpeas (soak and longer cooking) and why lentils aren't offered.
6. Reload: your version is kept. Then **Add to list**, open the **Grocery list** and edit an amount.

**Reset demo** at the bottom of My Recipes restores the starting state.

## Replacing placeholder art

- Logo: replace `assets/brand/wordmark.svg` (shown 32px tall).
- Icons: replace any file in `assets/icons/` with a drawing of the same name (shown at 20 × 20 px).

## Docs

- `CLAUDE.md`: project rules and commands for development.
- `docs/product-context.md`: product and design decision record, scope, limitations and next priorities.

## Credits

Apfel Grotezk by Collletttivo (Luigi Gorlero), SIL Open Font License 1.1. See `fonts/OFL-ApfelGrotezk.txt`.
