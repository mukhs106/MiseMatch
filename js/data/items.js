// Ingredient catalog shared by recipes, swaps, pantry and the grocery list.
//
// nutrition: typical protein/fiber in grams per 100 g, rounded from common
// reference values (USDA FoodData Central style figures). Used only for rough
// ranges. `null` for a nutrient means "no reliable value", which is shown as
// missing, never as zero. `negligible: true` marks small-quantity seasonings
// that are left out of estimates on purpose.
// gPerUnit / gPerMl let count and volume quantities join the estimate.
// aisle: grouping on the grocery list.

export const ITEMS = {
  "neutral-oil": { name: "Neutral oil", aisle: "Pantry", nutrition: { protein: 0, fiber: 0 }, gPerMl: 0.92 },
  "ghee": { name: "Ghee", aisle: "Dairy & eggs", nutrition: { protein: 0, fiber: 0 }, gPerMl: 0.9 },
  "cumin-seeds": { name: "Cumin seeds", aisle: "Spices", negligible: true },
  "ground-coriander": { name: "Ground coriander", aisle: "Spices", negligible: true },
  "turmeric": { name: "Ground turmeric", aisle: "Spices", negligible: true },
  "garam-masala": { name: "Garam masala", aisle: "Spices", negligible: true },
  "chili-powder": { name: "Kashmiri chili powder", aisle: "Spices", negligible: true },
  "dried-red-chili": { name: "Dried red chilies", aisle: "Spices", negligible: true },
  "salt": { name: "Salt", aisle: "Spices", negligible: true },
  "sugar": { name: "Sugar", aisle: "Pantry", negligible: true },
  "water": { name: "Water", aisle: "Pantry", negligible: true, noShop: true },

  "onion": { name: "Onion", aisle: "Produce", nutrition: { protein: 1.1, fiber: 1.7 }, gPerUnit: 150, key: true },
  "garlic": { name: "Garlic", aisle: "Produce", negligible: true },
  "ginger": { name: "Fresh ginger", aisle: "Produce", negligible: true },
  "green-chili": { name: "Green chili", aisle: "Produce", negligible: true },
  "lemon": { name: "Lemon", aisle: "Produce", negligible: true },
  "cilantro": { name: "Cilantro", aisle: "Produce", negligible: true },
  "scallions": { name: "Scallions", aisle: "Produce", negligible: true },
  "spinach-fresh": { name: "Fresh spinach", aisle: "Produce", nutrition: { protein: 2.9, fiber: 2.2 }, key: true },
  "kale": { name: "Kale, stems removed", short: "kale", aisle: "Produce", nutrition: { protein: 2.9, fiber: 4.1 }, key: true },
  "fresh-tomatoes": { name: "Tomatoes, medium", short: "tomatoes", aisle: "Produce", nutrition: { protein: 0.9, fiber: 1.2 }, gPerUnit: 120, key: true },

  "spinach-frozen": { name: "Frozen spinach", aisle: "Frozen", nutrition: { protein: 3.6, fiber: 2.9 }, key: true },
  "frozen-peas": { name: "Frozen peas", aisle: "Frozen", nutrition: { protein: 5.2, fiber: 4.5 }, key: true },
  "edamame": { name: "Shelled edamame, frozen", short: "edamame", aisle: "Frozen", nutrition: { protein: 11, fiber: 5 }, key: true },

  "canned-tomatoes": { name: "Canned tomatoes", aisle: "Pantry", nutrition: { protein: 0.8, fiber: 1.0 }, key: true },
  "chickpeas": { name: "Chickpeas, cooked or canned", short: "chickpeas", aisle: "Pantry", nutrition: { protein: 8, fiber: 7 }, key: true },
  "red-lentils": { name: "Red lentils (masoor dal)", short: "red lentils", aisle: "Pantry", nutrition: { protein: 24, fiber: 11 }, key: true },
  // Split moong fiber figures vary widely between sources, so it is left unknown.
  "moong-dal": { name: "Split yellow moong dal", short: "moong dal", aisle: "Pantry", nutrition: { protein: 24, fiber: null }, key: true },
  "basmati": { name: "White basmati rice", short: "basmati rice", aisle: "Pantry", nutrition: { protein: 7, fiber: 1 }, key: true },
  "brown-basmati": { name: "Brown basmati rice", short: "brown rice", aisle: "Pantry", nutrition: { protein: 7.5, fiber: 3.5 }, key: true },
  "jasmine": { name: "Jasmine rice", short: "jasmine rice", aisle: "Pantry", nutrition: { protein: 7, fiber: 1 }, key: true },
  "roti": { name: "Whole wheat rotis", short: "rotis", aisle: "Bakery", nutrition: { protein: 9, fiber: 6 }, gPerUnit: 40, key: true },

  "paneer": { name: "Paneer", aisle: "Dairy & eggs", nutrition: { protein: 18, fiber: 0 }, key: true },
  "eggs": { name: "Eggs, large", short: "eggs", aisle: "Dairy & eggs", nutrition: { protein: 12.6, fiber: 0 }, gPerUnit: 50, key: true },
  // Tofu protein varies a lot by brand and firmness; ranges absorb some of that.
  "tofu": { name: "Extra-firm tofu", short: "tofu", aisle: "Refrigerated", nutrition: { protein: 14, fiber: 2 }, key: true },
};

export function itemName(id) {
  return ITEMS[id]?.name ?? id;
}

export function shortName(id) {
  const item = ITEMS[id];
  if (!item) return id;
  return item.short ?? item.name.toLowerCase();
}
