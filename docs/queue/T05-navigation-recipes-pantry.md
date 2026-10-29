# T05: Navigation, Recipes, and Pantry

Goal: Make navigation clear and consistent, restore the useful parts of the earlier recipe collection, and give Pantry its own screen as the single source of ingredient state. The adaptation journey must keep working end to end.

Navigation: On mobile, a bottom tab bar with Recipes, Grocery list, and Pantry, with labels and icons, shows the current tab without relying on color alone. An avatar button at the top right of every primary screen opens Profile and Settings and is labeled for screen readers. Recipe detail and Profile open as pushed screens with a back button and no tab bar. The swap sheet stays a modal dialog with focus trapped, Escape to close, and focus returned to its trigger. At wide widths, the same three destinations move into the header. Keep the route structure simple and hash-based.

Recipes: Rename My Recipes to Recipes everywhere. Add a search field that filters by recipe name and ingredient. Add a two-option control for All recipes and Use what you have. Use what you have reuses the existing suggestion logic, ordered by "can make now" then "one swap away", with a short reason on each card. Shrink the chana masala "Start here" banner to a slim card or row that does not dominate the screen. Remove the large pantry chip interface from this screen and replace it with one compact row, for example "8 ingredients in your pantry" with an Edit link to Pantry.

Pantry: Users can review, add, edit, and remove ingredients. Add by searching the existing ingredient catalog. Free-text items are allowed but labeled "not matched to recipes yet" because they cannot feed calculations. Quantity is optional: an item with no quantity means "have it, amount unknown". Move the quick staple chips here for fast adding. Pantry is the single ingredient state. Recipe availability marks read from it, and setting Have, Some with an amount, or Need on a recipe writes back to it. Shopping needs subtract each pantry amount once across all recipes on the list, allocated in list order, so two recipes never count the same amount. If a pantry unit cannot be converted to the recipe's unit, treat it as amount unknown and flag it rather than subtracting. Checking off a bought list item offers "Add to pantry" but never adds automatically. No expiry dates, categories, or reminders.

Copy: Use at most one line of wordplay per screen. Recipes header: "Blend the rules." Swap sheet title: "Thyme for a swap." Pantry header: "Turn 'what's left?' into 'what's next.'" Empty grocery list: "Nacho average grocery list." All list items checked: "Bean there, done that." Use what you have with no matches: "Dinner, off-script." followed by a plain sentence on what to do next. Navigation, buttons, quantities, consequences, errors, and allergy text stay plain.

Out of scope: Profile (T06), visual restyling beyond what the new structure needs, and anything in your previous task.

Done when:
- All three tabs, the avatar entry, recipe detail, and the swap sheet behave as described at 430px and 1280px, with keyboard and focus order checked
- The demo path works from Recipes: search or Use what you have, open chana masala, scale to 2, set rice to Some 100 g, see it in Pantry, apply a swap, generate the list, check off an item and add it to pantry
- Tests cover pantry-to-recipe sync, the single-allocation shopping calculation, and unconvertible units
- npm test passes, and the work is committed and pushed
