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

## Try this

1. On **My Recipes**, tap a few ingredients under "What's in your kitchen?" (for example Chickpeas, Frozen spinach, Canned tomatoes, Onion) and see the suggestions.
2. Open **Chana palak**, set servings to 2, and use **Swap** on fresh spinach. Compare frozen spinach with kale, then apply one.
3. Turn on **More protein** under Ideas, preview **Add paneer**, and check the rough nutrition ranges before and after.
4. Mark ingredients as Have, Some (enter an amount) or Need, then **Add to list**.
5. On the **Grocery list**, edit an amount, delete an item and add your own. Go back, change servings, and choose **Update list** to see how edits and deletions are kept.
6. Switch between **My version** and **Original**, use **Undo**, and reload the page: everything persists. **Reset demo** at the bottom of My Recipes restores the starting state.

## Docs

- `CLAUDE.md`: project rules and commands for development.
- `docs/product-context.md`: product and design decision record, scope, limitations and next priorities.

## Credits

Apfel Grotezk by Collletttivo (Luigi Gorlero), SIL Open Font License 1.1. See `fonts/OFL-ApfelGrotezk.txt`.
