// Ingredient catalog: the traceable records that recipes, rules, the pantry,
// nutrition and the grocery list all refer to by id.
//
// Data status: IMPLEMENTATION FIXTURES. Nutrition values are rounded typical
// figures in the style of USDA FoodData Central, entered by hand for this
// prototype. They have not been checked against a specific database record
// and must not be presented as verified food data (see NUTRITION_SOURCE).
//
// Fields
//   name        display name
//   aliases     regional names and transliterations that mean THIS item only.
//               A name that could mean several items goes in AMBIGUOUS below,
//               so different ingredients are never collapsed into one.
//   state       what the nutrition values describe: "raw" | "dry" | "cooked" |
//               "canned-drained" | "as-sold"
//   nutrition   per 100 g of that state: { protein, fiber, fat, kcal }.
//               null = no reliable value (shown as unknown, never zero).
//   negligible  small-quantity seasonings left out of estimates on purpose
//   gPerUnit    grams per counted unit, gPerMl grams per millilitre
//   contains    allergen and ingredient-family tags used by constraints:
//               dairy, egg, gluten, peanut, tree-nut, soy, sesame, mustard, coconut
//   animal      "dairy" | "egg" | "meat": used for vegetarian and vegan checks
//   labelCheck  products whose composition depends on the brand. We can't see
//               the label, so the app asks you to check it instead of guessing.
//   key         a main thing you'd shop for (used by pantry suggestions)
//   aisle       grocery list grouping

export const NUTRITION_SOURCE = {
  status: "fixture",
  label: "Prototype fixture values",
  detail: "Rounded typical values per 100 g in the style of USDA FoodData Central, entered by hand for this prototype. Not checked against a specific database record.",
};

export const ITEMS = {
  // Fats
  "neutral-oil": { name: "Neutral oil", aliases: ["vegetable oil", "sunflower oil", "canola oil"], aisle: "Pantry", state: "as-sold", nutrition: { protein: 0, fiber: 0, fat: 100, kcal: 884 }, gPerMl: 0.92 },
  "mustard-oil": { name: "Mustard oil", aliases: ["sarson ka tel"], aisle: "Pantry", state: "as-sold", nutrition: { protein: 0, fiber: 0, fat: 100, kcal: 884 }, gPerMl: 0.92, contains: ["mustard"] },
  "ghee": { name: "Ghee", aliases: ["clarified butter", "desi ghee"], aisle: "Dairy & eggs", state: "as-sold", nutrition: { protein: 0, fiber: 0, fat: 99, kcal: 880 }, gPerMl: 0.9, contains: ["dairy"], animal: "dairy" },
  "butter": { name: "Butter", aliases: ["makhan", "makkhan"], aisle: "Dairy & eggs", state: "as-sold", nutrition: { protein: 0.9, fiber: 0, fat: 81, kcal: 717 }, gPerMl: 0.95, contains: ["dairy"], animal: "dairy", key: true },

  // Spices and seasonings
  "cumin-seeds": { name: "Cumin seeds", aliases: ["jeera", "zeera"], aisle: "Spices", negligible: true },
  "mustard-seeds": { name: "Black mustard seeds", aliases: ["rai", "sarson"], aisle: "Spices", negligible: true, contains: ["mustard"] },
  "fenugreek-seeds": { name: "Fenugreek seeds", aliases: ["methi dana"], aisle: "Spices", negligible: true },
  "kasuri-methi": { name: "Dried fenugreek leaves", aliases: ["kasuri methi"], aisle: "Spices", negligible: true },
  "ground-coriander": { name: "Ground coriander", aliases: ["dhania powder", "dhaniya powder"], aisle: "Spices", negligible: true },
  "turmeric": { name: "Ground turmeric", aliases: ["haldi"], aisle: "Spices", negligible: true },
  "garam-masala": { name: "Garam masala", aisle: "Spices", negligible: true, labelCheck: "Blends vary by brand. Check the label if you avoid an allergen." },
  "pav-bhaji-masala": { name: "Pav bhaji masala", aisle: "Spices", negligible: true, labelCheck: "Blends vary by brand. Check the label if you avoid an allergen." },
  "chili-powder": { name: "Kashmiri chili powder", aliases: ["lal mirch", "kashmiri mirch"], aisle: "Spices", negligible: true },
  "dried-red-chili": { name: "Dried red chilies", aliases: ["sukhi lal mirch"], aisle: "Spices", negligible: true },
  "asafoetida": { name: "Asafoetida", aliases: ["hing"], aisle: "Spices", negligible: true, labelCheck: "Ground asafoetida is often blended with wheat flour. Check the label if you avoid gluten." },
  "cardamom": { name: "Green cardamom pods", aliases: ["elaichi"], aisle: "Spices", negligible: true },
  "black-tea": { name: "Black tea leaves", aliases: ["chai patti"], aisle: "Pantry", negligible: true },
  "salt": { name: "Salt", aliases: ["namak"], aisle: "Spices", negligible: true },
  "sugar": { name: "Sugar", aliases: ["cheeni", "chini"], aisle: "Pantry", state: "as-sold", nutrition: { protein: 0, fiber: 0, fat: 0, kcal: 387 }, gPerMl: 0.85 },
  "water": { name: "Water", aisle: "Pantry", negligible: true, noShop: true },

  // Produce
  "onion": { name: "Onion", aliases: ["pyaz", "pyaaz", "kanda"], aisle: "Produce", state: "raw", nutrition: { protein: 1.1, fiber: 1.7, fat: 0.1, kcal: 40 }, gPerUnit: 150, key: true },
  "garlic": { name: "Garlic", aliases: ["lehsun", "lasun"], aisle: "Produce", negligible: true },
  "ginger": { name: "Fresh ginger", aliases: ["adrak", "ginger"], aisle: "Produce", negligible: true },
  "ground-ginger": { name: "Ground ginger", aliases: ["saunth", "sonth"], aisle: "Spices", negligible: true },
  "green-chili": { name: "Green chili", aliases: ["hari mirch", "green chilli", "green chilly", "green chile"], aisle: "Produce", negligible: true },
  "lemon": { name: "Lemon", aliases: ["nimbu", "lime"], aisle: "Produce", negligible: true },
  "cilantro": { name: "Cilantro", aliases: ["coriander leaves", "fresh coriander", "hara dhania"], aisle: "Produce", negligible: true },
  "spinach-fresh": { name: "Fresh spinach", aliases: ["palak"], aisle: "Produce", state: "raw", nutrition: { protein: 2.9, fiber: 2.2, fat: 0.4, kcal: 23 }, key: true },
  "kale": { name: "Kale, stems removed", short: "kale", aisle: "Produce", state: "raw", nutrition: { protein: 2.9, fiber: 4.1, fat: 1.5, kcal: 43 }, key: true },
  "fresh-tomatoes": { name: "Tomatoes, medium", short: "tomatoes", aliases: ["tamatar"], aisle: "Produce", state: "raw", nutrition: { protein: 0.9, fiber: 1.2, fat: 0.2, kcal: 18 }, gPerUnit: 120, key: true },
  "potato": { name: "Potatoes, medium", short: "potatoes", aliases: ["aloo", "alu", "batata"], aisle: "Produce", state: "raw", nutrition: { protein: 2, fiber: 2.2, fat: 0.1, kcal: 77 }, gPerUnit: 200, key: true },
  "cauliflower": { name: "Cauliflower", aliases: ["gobi", "phool gobi"], aisle: "Produce", state: "raw", nutrition: { protein: 1.9, fiber: 2, fat: 0.3, kcal: 25 }, key: true },
  "bell-pepper": { name: "Green bell pepper", short: "bell pepper", aliases: ["capsicum", "shimla mirch"], aisle: "Produce", state: "raw", nutrition: { protein: 0.9, fiber: 1.7, fat: 0.2, kcal: 20 }, gPerUnit: 150, key: true },

  // Frozen
  "spinach-frozen": { name: "Frozen spinach", aisle: "Frozen", state: "as-sold", nutrition: { protein: 3.6, fiber: 2.9, fat: 0.5, kcal: 29 }, key: true },
  "frozen-peas": { name: "Frozen peas", aliases: ["matar", "mattar"], aisle: "Frozen", state: "as-sold", nutrition: { protein: 5.2, fiber: 4.5, fat: 0.4, kcal: 77 }, key: true },

  // Pantry
  "canned-tomatoes": { name: "Canned tomatoes", aisle: "Pantry", state: "as-sold", nutrition: { protein: 0.8, fiber: 1.0, fat: 0.3, kcal: 32 }, key: true },
  "tomato-puree": { name: "Tomato purée (passata)", short: "tomato purée", aliases: ["passata"], aisle: "Pantry", state: "as-sold", nutrition: { protein: 1.6, fiber: 1.5, fat: 0.2, kcal: 38 }, key: true },
  // Kabuli chana. Not the same as chana dal (split Bengal gram) or kala chana (brown chickpeas).
  "dried-chickpeas": { name: "Dried chickpeas", short: "dried chickpeas", aliases: ["dried kabuli chana"], aisle: "Pantry", state: "dry", nutrition: { protein: 19, fiber: 17, fat: 6, kcal: 378 }, key: true },
  "chickpeas": { name: "Chickpeas, cooked or canned", short: "chickpeas", aliases: ["kabuli chana", "chole", "garbanzo beans"], aisle: "Pantry", state: "canned-drained", nutrition: { protein: 8, fiber: 7, fat: 2.6, kcal: 140 }, key: true },
  "chana-dal": { name: "Chana dal (split Bengal gram)", short: "chana dal", aisle: "Pantry", state: "dry", nutrition: { protein: 21, fiber: 12, fat: 5, kcal: 360 }, key: true },
  "kala-chana": { name: "Kala chana (brown chickpeas), dried", short: "kala chana", aliases: ["black chickpeas", "brown chickpeas"], aisle: "Pantry", state: "dry", nutrition: { protein: 19, fiber: 17, fat: 5, kcal: 360 }, key: true },
  "red-lentils": { name: "Red lentils (masoor dal)", short: "red lentils", aliases: ["masoor dal", "masoor"], aisle: "Pantry", state: "dry", nutrition: { protein: 24, fiber: 11, fat: 2.2, kcal: 358 }, key: true },
  // Split moong fiber figures vary widely between sources, so it is left unknown.
  "moong-dal": { name: "Split yellow moong dal", short: "moong dal", aliases: ["yellow moong dal", "mung dal"], aisle: "Pantry", state: "dry", nutrition: { protein: 24, fiber: null, fat: 1.2, kcal: 350 }, key: true },
  "besan": { name: "Gram flour (besan)", short: "gram flour", aliases: ["besan", "chickpea flour"], aisle: "Pantry", state: "dry", nutrition: { protein: 22, fiber: 10, fat: 6.7, kcal: 387 }, key: true },
  "atta": { name: "Whole wheat flour (atta)", short: "atta", aliases: ["atta", "chapati flour"], aisle: "Pantry", state: "dry", nutrition: { protein: 13, fiber: 11, fat: 2.5, kcal: 340 }, contains: ["gluten"], key: true },
  "basmati": { name: "White basmati rice", short: "basmati rice", aliases: ["chawal"], aisle: "Pantry", state: "dry", nutrition: { protein: 7, fiber: 1, fat: 0.6, kcal: 360 }, key: true },
  "brown-basmati": { name: "Brown basmati rice", short: "brown rice", aisle: "Pantry", state: "dry", nutrition: { protein: 7.5, fiber: 3.5, fat: 2.7, kcal: 360 }, key: true },
  "coconut-milk": { name: "Canned coconut milk, full fat", short: "coconut milk", aisle: "Pantry", state: "as-sold", nutrition: { protein: 2, fiber: null, fat: 21, kcal: 200 }, gPerMl: 1, contains: ["coconut"], key: true, labelCheck: "Some brands add thickeners or other ingredients. Check the label." },
  "cashews": { name: "Raw cashews", short: "cashews", aliases: ["kaju"], aisle: "Pantry", state: "raw", nutrition: { protein: 18, fiber: 3.3, fat: 44, kcal: 553 }, contains: ["tree-nut"], key: true },
  "sunflower-seeds": { name: "Hulled sunflower seeds", short: "sunflower seeds", aisle: "Pantry", state: "raw", nutrition: { protein: 21, fiber: 8.6, fat: 51, kcal: 584 }, key: true, labelCheck: "Often packed alongside nuts. Check the label for a may-contain warning if you avoid nuts." },

  // Bakery
  "roti": { name: "Whole wheat rotis", short: "rotis", aliases: ["chapati", "phulka"], aisle: "Bakery", state: "as-sold", nutrition: { protein: 9, fiber: 6, fat: 7, kcal: 297 }, gPerUnit: 40, contains: ["gluten"], key: true, labelCheck: "Store-bought rotis can contain dairy, oil blends or other ingredients. Check the label." },
  "pav": { name: "Soft bread rolls (pav)", short: "pav", aliases: ["ladi pav", "dinner rolls"], aisle: "Bakery", state: "as-sold", nutrition: { protein: 9, fiber: 2.7, fat: 4, kcal: 270 }, gPerUnit: 40, contains: ["gluten"], key: true, labelCheck: "Bread rolls often contain milk, butter, egg, soy or sesame depending on the bakery. Check the label." },

  // Dairy, eggs and alternatives
  "paneer": { name: "Paneer", aisle: "Dairy & eggs", state: "as-sold", nutrition: { protein: 18, fiber: 0, fat: 21, kcal: 320 }, contains: ["dairy"], animal: "dairy", key: true },
  "cream": { name: "Heavy cream", short: "cream", aliases: ["fresh cream", "double cream", "whipping cream"], aisle: "Dairy & eggs", state: "as-sold", nutrition: { protein: 2.8, fiber: 0, fat: 36, kcal: 340 }, gPerMl: 1, contains: ["dairy"], animal: "dairy", key: true },
  "yogurt": { name: "Plain whole-milk yogurt", short: "yogurt", aliases: ["dahi", "curd"], aisle: "Dairy & eggs", state: "as-sold", nutrition: { protein: 3.5, fiber: 0, fat: 3.3, kcal: 61 }, gPerMl: 1.03, contains: ["dairy"], animal: "dairy", key: true },
  "milk": { name: "Whole milk", short: "milk", aliases: ["doodh"], aisle: "Dairy & eggs", state: "as-sold", nutrition: { protein: 3.3, fiber: 0, fat: 3.3, kcal: 61 }, gPerMl: 1.03, contains: ["dairy"], animal: "dairy", key: true },
  "oat-milk": { name: "Oat milk, unsweetened", short: "oat milk", aisle: "Refrigerated", state: "as-sold", nutrition: { protein: 1, fiber: null, fat: 2, kcal: 45 }, gPerMl: 1.03, key: true, labelCheck: "Oats are often processed with wheat, and protein and fat vary a lot by brand. Check the label." },
  "soy-milk": { name: "Soy milk, unsweetened", short: "soy milk", aisle: "Refrigerated", state: "as-sold", nutrition: { protein: 3.3, fiber: 0.5, fat: 1.8, kcal: 40 }, gPerMl: 1.03, contains: ["soy"], key: true },
  "soy-yogurt": { name: "Plain soy yogurt, unsweetened", short: "soy yogurt", aisle: "Refrigerated", state: "as-sold", nutrition: { protein: 4, fiber: 0.5, fat: 2, kcal: 50 }, gPerMl: 1.03, contains: ["soy"], key: true, labelCheck: "Plain soy yogurts differ in tang and thickness. Check that it is unsweetened." },
  "eggs": { name: "Eggs, large", short: "eggs", aliases: ["anda", "ande"], aisle: "Dairy & eggs", state: "raw", nutrition: { protein: 12.6, fiber: 0, fat: 9.5, kcal: 143 }, gPerUnit: 50, contains: ["egg"], animal: "egg", key: true },
  // Tofu protein varies a lot by brand and firmness; ranges absorb some of that.
  "tofu": { name: "Extra-firm tofu", short: "tofu", aliases: ["bean curd"], aisle: "Refrigerated", state: "as-sold", nutrition: { protein: 14, fiber: 2, fat: 8, kcal: 145 }, contains: ["soy"], key: true },

  // Meat. "Mutton" means goat in most of South Asia and sheep elsewhere, so it is ambiguous (see AMBIGUOUS).
  // Bone-in weight includes bone, so nutrition per serving can't be estimated honestly from it.
  "goat-bone-in": { name: "Goat meat, bone-in curry cut", short: "goat", aliases: ["bakra", "goat curry cut"], aisle: "Meat", state: "raw", nutrition: { protein: null, fiber: 0, fat: null, kcal: null }, contains: [], animal: "meat", key: true },
  "lamb-bone-in": { name: "Lamb, bone-in curry cut", short: "lamb", aisle: "Meat", state: "raw", nutrition: { protein: null, fiber: 0, fat: null, kcal: null }, animal: "meat", key: true },
};

// Names that could refer to more than one catalog item. Matching never picks
// one silently; the import review asks which was meant.
export const AMBIGUOUS = {
  "chana": { candidates: ["chickpeas", "kala-chana", "chana-dal"], why: "“Chana” can mean white chickpeas, brown kala chana or split chana dal." },
  "dal": { candidates: ["red-lentils", "moong-dal", "chana-dal"], why: "“Dal” covers many split pulses." },
  "mutton": { candidates: ["goat-bone-in", "lamb-bone-in"], why: "“Mutton” usually means goat in South Asia and sheep in the UK and elsewhere." },
  "cottage cheese": { candidates: ["paneer"], why: "Western cottage cheese is a different, wetter product from paneer." },
  "rice": { candidates: ["basmati", "brown-basmati"], why: "Which rice, and is the amount cooked or uncooked?" },
  "methi": { candidates: ["fenugreek-seeds", "kasuri-methi"], why: "“Methi” can mean the seeds or the leaves." },
};

export const ALLERGEN_LABEL = {
  dairy: "dairy",
  egg: "egg",
  gluten: "wheat or gluten",
  peanut: "peanuts",
  "tree-nut": "tree nuts",
  soy: "soy",
  sesame: "sesame",
  mustard: "mustard",
  coconut: "coconut",
};

export function itemName(id) {
  return ITEMS[id]?.name ?? id;
}

export function shortName(id) {
  const item = ITEMS[id];
  if (!item) return id;
  return item.short ?? item.name.toLowerCase();
}
