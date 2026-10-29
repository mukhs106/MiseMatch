# T05: Navigation and Pantry

Goal: Make navigation clear and consistent and give Pantry its own screen as the single source of ingredient state. The adaptation journey must keep working end to end.

Scope change (2026-10-29): this task keeps only the tabs, the avatar entry, and Pantry. Its Recipes part (rename, search, views, reasons, slim Start here, compact pantry row) was built with T05 and then replaced by the photography and discovery pass, which owns the Recipes screen; see the build log.

Navigation: On mobile, a bottom tab bar with Recipes, Grocery list, and Pantry, with labels and icons, shows the current tab without relying on color alone. An avatar button at the top right of every primary screen opens Profile and Settings and is labeled for screen readers. Recipe detail and Profile open as pushed screens with a back button and no tab bar. The swap sheet stays a modal dialog with focus trapped, Escape to close, and focus returned to its trigger. At wide widths, the same three destinations move into the header. Keep the route structure simple and hash-based.

Pantry: Users can review, add, edit, and remove ingredients. Add by searching the existing ingredient catalog. Free-text items are allowed but labeled "not matched to recipes yet" because they cannot feed calculations. Quantity is optional: an item with no quantity means "have it, amount unknown". Move the quick staple chips here for fast adding; Recipes keeps a one-line summary with an Edit link to Pantry. Pantry is the single ingredient state. Recipe availability marks read from it, and setting Have, Some with an amount, or Need on a recipe writes back to it. Shopping needs subtract each pantry amount once across all recipes on the list, allocated in list order, so two recipes never count the same amount. If a pantry unit cannot be converted to the recipe's unit, treat it as amount unknown and flag it rather than subtracting. Checking off a bought list item offers "Add to pantry" but never adds automatically. No expiry dates, categories, or reminders. Header image: the `spice-box-grid` variants in `assets/img/` (from spices-06; empty alt, the only supporting image on the screen), added in the photography and discovery pass.

Copy: Use at most one line of wordplay per screen. Swap sheet title: "Thyme for a swap." Pantry header: "Turn 'what's left?' into 'what's next.'" Empty grocery list: "Nacho average grocery list." All list items checked: "Bean there, done that." Navigation, buttons, quantities, consequences, errors, and allergy text stay plain.

Recipes copy, kept by the discovery pass: header "Blend the rules.", replaced by "Dinner, off-script." when Use what you have has nothing to show, so the screen never has two wordplay lines.

Out of scope: Profile (T06), the Recipes screen, visual restyling beyond what the new structure needs, and anything in your previous task.

Done when:
- All three tabs, the avatar entry, recipe detail, and the swap sheet behave as described at 430px and 1280px, with keyboard and focus order checked
- The demo path still works from Recipes: open chana masala, scale to 2, set rice to Some 100 g, see it in Pantry, apply a swap, generate the list, check off an item and add it to pantry
- Tests cover pantry-to-recipe sync, the single-allocation shopping calculation, and unconvertible units
- npm test passes, and the work is committed and pushed
