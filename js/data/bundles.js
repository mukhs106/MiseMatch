// Authored adaptation bundles: combinations of rules that were written to be
// used together, with notes on how they interact. The engine treats a set of
// three or more rules as supported only when it is exactly one of these bundles;
// a pair needs a bundle or `combinesWith`. Declared pairs alone never make a
// larger set supported, so anything else is untested.
//
// Every bundle is a suggested, untested combination (evidence: "suggested").

export const BUNDLES = [
  // Chana masala
  {
    id: "cm-b-canned-paneer",
    recipe: "chana-masala",
    label: "No fresh tomatoes, more protein",
    swaps: ["cm-canned-tomatoes", "cm-paneer"],
    notes: "The canned tomatoes make a smoother sauce that coats the paneer evenly. Nothing else in the method changes.",
  },
  {
    id: "cm-b-canned-tofu",
    recipe: "chana-masala",
    label: "No fresh tomatoes, more protein without dairy",
    swaps: ["cm-canned-tomatoes", "cm-tofu"],
    notes: "Fry the tofu while the canned-tomato masala reduces, so the total time barely changes.",
  },
  {
    id: "cm-b-tofu-spinach",
    recipe: "chana-masala",
    label: "More protein and fiber without dairy",
    swaps: ["cm-tofu", "cm-spinach"],
    notes: "Add the spinach before the tofu so the tofu's crust stays intact. The pot is fuller, so use your widest pan.",
  },

  // Chana palak
  {
    id: "cp-b-protein-fiber",
    recipe: "chana-palak",
    label: "More protein and fiber",
    swaps: ["cp-paneer", "cp-peas"],
    notes: "Peas and paneer both go in for the last few minutes; add the peas first.",
  },

  // Masoor dal
  {
    id: "md-b-plant-protein",
    recipe: "masoor-dal",
    label: "Plant-based, more dal",
    swaps: ["md-oil", "md-more-dal"],
    notes: "A larger pot of dal finished with an oil tadka. The tadka quantity stays the same, so its aroma is spread a little thinner.",
  },

  // Paneer butter masala
  {
    id: "pbm-b-vegan-nutfree",
    recipe: "paneer-butter-masala",
    label: "Plant-based, nut-free, with coconut",
    swaps: ["pbm-tofu", "pbm-coconut", "pbm-oil", "pbm-sunflower"],
    notes: "Every rich element changes at once: no butter, no cream, no paneer, no cashews. Expect a lighter, coconut-leaning tomato curry with browned tofu. It is a different dish in character, not a copy.",
  },
  {
    id: "pbm-b-vegan-nutfree-protein",
    recipe: "paneer-butter-masala",
    label: "Plant-based, nut-free, with coconut, more tofu",
    swaps: ["pbm-tofu", "pbm-coconut", "pbm-oil", "pbm-sunflower", "pbm-more-protein"],
    notes: "As the coconut version, with half as much tofu again. The sauce is stretched over more pieces, so it's less saucy.",
  },
  {
    id: "pbm-b-vegan-nutfree-oat",
    recipe: "paneer-butter-masala",
    label: "Plant-based, nut-free, no coconut",
    swaps: ["pbm-tofu", "pbm-oat", "pbm-oil", "pbm-no-cashew"],
    notes: "The lightest version: no butter, cream, paneer, cashews or coconut. The sauce relies on reduction for body, so cook it down patiently.",
  },
  {
    id: "pbm-b-vegan-nutfree-oat-protein",
    recipe: "paneer-butter-masala",
    label: "Plant-based, nut-free, no coconut, more tofu",
    swaps: ["pbm-tofu", "pbm-oat", "pbm-oil", "pbm-no-cashew", "pbm-more-protein"],
    notes: "As the no-coconut version, with half as much tofu again and less sauce around each piece.",
  },
  {
    id: "pbm-b-vegan-cashew",
    recipe: "paneer-butter-masala",
    label: "Plant-based, keeping the cashews",
    swaps: ["pbm-tofu", "pbm-oat", "pbm-oil"],
    notes: "The cashew paste does a lot of the work cream did, so this stays closer to the original's body than the nut-free versions.",
  },

  // Pav bhaji
  {
    id: "pv-b-plant-fiber",
    recipe: "pav-bhaji",
    label: "Plant-based, more vegetables",
    swaps: ["pv-oil", "pv-more-peas"],
    notes: "Without butter the extra peas' sweetness stands out more. The pav itself still needs a label check.",
  },
];

export function bundlesForRecipe(recipeId) {
  return BUNDLES.filter((b) => b.recipe === recipeId);
}

export function getBundle(id) {
  return BUNDLES.find((b) => b.id === id) ?? null;
}
