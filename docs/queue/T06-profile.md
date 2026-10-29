# T06: Profile and Settings

Goal: A small, honest Profile with settings that do something, or that say clearly when they do not yet.

Structure, saved locally with no account: Food preferences (cuisines you enjoy, ingredients you dislike); Dietary pattern (for example vegetarian, vegan, no pork, no beef); Allergies and intolerances, in their own visually distinct group; Nutrition goals, optional (more protein, more fiber), sharing state with the existing goal toggles so there is one source; Settings (reset demo, a note on what demo data means, "Saved on this device only").

Effects: Tag the existing ingredient catalog with dietary and common allergen tags where the demo data supports it. Dietary pattern and allergies flag recipes and swaps that contain a tagged ingredient. Disliked ingredients rank swaps that contain them lower. Nutrition goals rank swaps as the goal toggles already do. Flag; never hide. Cuisine preferences do not affect anything yet, and the group must say so in one line.

Allergy honesty: The allergies group and every allergy flag say this is based on demo ingredient data, may be incomplete, and cannot confirm a dish is safe; check labels and your own needs. Never show "safe", "allergen-free", or a green check for allergies. The absence of a flag means nothing was flagged, not that the dish is safe, and the copy says so.

Out of scope: accounts, sign-in, sync, photos, notifications.

Done when:
- Each group saves and survives a reload
- Each setting either visibly changes a flag or ranking, or says it does not yet
- A test covers allergen flagging on the chana masala paneer swap (dairy)
- Checked at 430px and 1280px, npm test passes, and the work is committed and pushed
