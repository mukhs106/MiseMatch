// Demo seed recipes. Written for this prototype from common home-style
// versions of each dish; not kitchen-tested sources. Treat them as demo data.
//
// Ingredient fields:
//   slot     stable id used by swaps, steps and availability history
//   item     id in ITEMS
//   qty/unit quantity at the recipe's base servings ("" unit = count)
//   group    "main" | "spices" | "staples" | "serve"
//   scaling  "linear" (default) | "taste" (scales, flagged to taste) | "pan" (scales at half rate)
//   prep     optional preparation note
// Steps use {slot} tokens, rendered with the slot's current ingredient name.
// noSwap:      { slot: reason } when an ingredient has no tested swap at all.
// unsupported: { slot: [{ label, reason }] } swaps people ask for that we explain instead of offering.
// image:       optional, only when a photo actually shows this dish (see assets/images/manifest.json).
//              { name: variant name in assets/img, alt: what the photo shows,
//                focal: { card, hero } object-position for the 4:3 card and 4:5 hero crops }.
//              Recipes without one get the designed fallback tile; never substitute another dish.

export const HERO_RECIPE_ID = "chana-masala";

export const RECIPES = [
  {
    id: "chana-masala",
    title: "Chana masala",
    subtitle: "Chickpeas in a spiced onion-tomato masala",
    cuisine: "North Indian, home style",
    minutes: 45,
    servings: 4,
    blurb: "The familiar weeknight chickpea curry. A good place to see what a swap changes before you commit to it.",
    image: {
      name: "chana-masala-bowl",
      alt: "Chickpea curry over rice in a ceramic bowl, topped with herbs and diced cucumber",
      focal: { card: "50% 52%", hero: "50% 50%" },
    },
    ingredients: [
      { slot: "chickpeas", item: "chickpeas", qty: 480, unit: "g", group: "main", prep: "drained; a 400 g can gives about 240 g" },
      { slot: "tomatoes", item: "fresh-tomatoes", qty: 3, unit: "", group: "main", prep: "finely chopped" },
      { slot: "onion", item: "onion", qty: 2, unit: "", group: "main", prep: "finely chopped" },
      { slot: "garlic", item: "garlic", qty: 4, unit: "cloves", group: "main", prep: "grated" },
      { slot: "ginger", item: "ginger", qty: 1, unit: "tbsp", group: "main", prep: "grated" },
      { slot: "chili", item: "green-chili", qty: 1, unit: "", group: "main", scaling: "taste", prep: "slit" },
      { slot: "cilantro", item: "cilantro", qty: 2, unit: "tbsp", group: "main", prep: "chopped, optional" },
      { slot: "cumin", item: "cumin-seeds", qty: 1, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "coriander", item: "ground-coriander", qty: 2, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "chilipowder", item: "chili-powder", qty: 1, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "turmeric", item: "turmeric", qty: 0.5, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "garam", item: "garam-masala", qty: 1, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "salt", item: "salt", qty: 1, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "oil", item: "neutral-oil", qty: 3, unit: "tbsp", group: "staples", scaling: "pan" },
      { slot: "lemon", item: "lemon", qty: 0.5, unit: "", group: "staples" },
      { slot: "rice", item: "basmati", qty: 300, unit: "g", group: "serve", prep: "uncooked" },
    ],
    steps: [
      { id: "s1", text: "Rinse the {rice} and cook it with 1.5 times its volume of water, about 15 minutes. Rest it covered for 5 minutes." },
      { id: "s2", text: "Heat the {oil} in a wide pan over medium heat. Add the {cumin} and let it sizzle for about 30 seconds." },
      { id: "s3", text: "Add the {onion} and cook, stirring often, until deep golden, 10 to 12 minutes." },
      { id: "s4", text: "Stir in the {garlic}, {ginger} and {chili}. Cook for 1 minute until fragrant." },
      { id: "s5", text: "Add the {coriander}, {chilipowder} and {turmeric} for 30 seconds, then the {tomatoes} and {salt}. Cook until thick and the oil separates, 10 to 12 minutes." },
      { id: "s6", text: "Add the {chickpeas} and about 250 ml water. Simmer for 10 to 15 minutes, mashing a few chickpeas to thicken the sauce." },
      { id: "s7", text: "Finish with the {garam}, a squeeze of {lemon} and the {cilantro}." },
    ],
    noSwap: {
      garam: "There is no reliable single replacement. Leaving it out keeps the dish edible but flatter, and we won't guess a blend.",
    },
    unsupported: {
      chickpeas: [
        {
          label: "Lentils",
          reason: "Lentils cook down into a soft dal in 20 to 30 minutes instead of staying whole, so the texture, sauce and timing all change. That's a different dish (see Masoor dal tadka), so it isn't offered as a swap here.",
        },
      ],
    },
  },
  {
    id: "chana-palak",
    title: "Chana palak",
    subtitle: "Chickpea and spinach curry",
    cuisine: "North Indian, home style",
    minutes: 40,
    servings: 4,
    blurb: "A weeknight curry where the onion-tomato masala does most of the work and spinach goes in at the end.",
    ingredients: [
      { slot: "chickpeas", item: "chickpeas", qty: 480, unit: "g", group: "main", prep: "drained; a 400 g can gives about 240 g" },
      { slot: "spinach", item: "spinach-fresh", qty: 200, unit: "g", group: "main", prep: "roughly chopped" },
      { slot: "tomatoes", item: "canned-tomatoes", qty: 400, unit: "g", group: "main", prep: "crushed" },
      { slot: "onion", item: "onion", qty: 1, unit: "", group: "main", prep: "finely chopped" },
      { slot: "garlic", item: "garlic", qty: 4, unit: "cloves", group: "main", prep: "grated" },
      { slot: "ginger", item: "ginger", qty: 1, unit: "tbsp", group: "main", prep: "grated" },
      { slot: "chili", item: "green-chili", qty: 1, unit: "", group: "main", scaling: "taste", prep: "slit" },
      { slot: "cumin", item: "cumin-seeds", qty: 1, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "coriander", item: "ground-coriander", qty: 2, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "turmeric", item: "turmeric", qty: 0.5, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "garam", item: "garam-masala", qty: 1, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "salt", item: "salt", qty: 1, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "oil", item: "neutral-oil", qty: 2, unit: "tbsp", group: "staples", scaling: "pan" },
      { slot: "lemon", item: "lemon", qty: 0.5, unit: "", group: "staples" },
      { slot: "rice", item: "basmati", qty: 300, unit: "g", group: "serve", prep: "uncooked" },
    ],
    steps: [
      { id: "s1", text: "Rinse the {rice} and cook it with 1.5 times its volume of water, about 15 minutes. Rest it covered for 5 minutes." },
      { id: "s2", text: "Heat the {oil} in a wide pan over medium heat. Add the {cumin} and let it sizzle for about 30 seconds." },
      { id: "s3", text: "Add the {onion} and cook, stirring, until soft and golden, 8 to 10 minutes." },
      { id: "s4", text: "Stir in the {garlic}, {ginger} and {chili}. Cook for 1 minute until fragrant." },
      { id: "s5", text: "Add the {tomatoes}, {coriander}, {turmeric} and {salt}. Simmer until the oil starts to separate from the masala, 8 to 10 minutes." },
      { id: "s6", text: "Add the {chickpeas} with a splash of water. Simmer for 5 minutes, mashing a few against the pan to thicken." },
      { id: "s7", text: "Stir in the {spinach} a handful at a time until wilted, about 2 minutes." },
      { id: "s8", text: "Finish with the {garam} and a squeeze of {lemon}. Taste and adjust the salt." },
    ],
    noSwap: {
      chickpeas: "Chickpeas are the body of this dish. Another bean makes a different curry (kidney beans lean toward rajma), so no swap is listed here.",
      garam: "There is no reliable single replacement. Leaving it out keeps the dish edible but flatter, and we won't guess a blend.",
    },
  },
  {
    id: "paneer-bhurji",
    title: "Paneer bhurji",
    subtitle: "Spiced scrambled paneer",
    cuisine: "North Indian, home style",
    minutes: 25,
    servings: 2,
    blurb: "Crumbled paneer cooked quickly in a tomato masala. Good with rotis, fast enough for a weeknight.",
    ingredients: [
      { slot: "paneer", item: "paneer", qty: 200, unit: "g", group: "main", prep: "crumbled" },
      { slot: "tomatoes", item: "fresh-tomatoes", qty: 2, unit: "", group: "main", prep: "chopped" },
      { slot: "onion", item: "onion", qty: 1, unit: "", group: "main", prep: "finely chopped" },
      { slot: "chili", item: "green-chili", qty: 1, unit: "", group: "main", scaling: "taste", prep: "finely chopped" },
      { slot: "ginger", item: "ginger", qty: 1, unit: "tsp", group: "main", prep: "grated" },
      { slot: "cilantro", item: "cilantro", qty: 2, unit: "tbsp", group: "main", prep: "chopped, optional" },
      { slot: "cumin", item: "cumin-seeds", qty: 1, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "turmeric", item: "turmeric", qty: 0.25, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "chilipowder", item: "chili-powder", qty: 0.5, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "garam", item: "garam-masala", qty: 0.5, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "salt", item: "salt", qty: 0.5, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "oil", item: "neutral-oil", qty: 1, unit: "tbsp", group: "staples", scaling: "pan" },
      { slot: "roti", item: "roti", qty: 4, unit: "", group: "serve" },
    ],
    steps: [
      { id: "s1", text: "Heat the {oil} in a pan over medium heat. Add the {cumin} and let it sizzle." },
      { id: "s2", text: "Add the {onion} and {chili}. Cook until soft, about 5 minutes, adding the {ginger} for the last minute." },
      { id: "s3", text: "Add the {tomatoes}, {turmeric}, {chilipowder} and {salt}. Cook until the tomatoes collapse, 4 to 5 minutes." },
      { id: "s4", text: "Crumble in the {paneer}, stir to coat, and cook for 2 to 3 minutes. Stop before it turns rubbery." },
      { id: "s5", text: "Finish with the {garam} and {cilantro}. Serve with warm {roti}." },
    ],
    noSwap: {
      garam: "There is no reliable single replacement. Leaving it out keeps the dish edible but flatter, and we won't guess a blend.",
      roti: "Rice or any bread works on the side. It doesn't change the bhurji, so there's nothing to adapt here.",
    },
  },
  {
    id: "masoor-dal",
    title: "Masoor dal tadka",
    subtitle: "Red lentils with a garlic and cumin tadka",
    cuisine: "Indian, everyday",
    minutes: 35,
    servings: 4,
    blurb: "Soft red lentils finished with sizzling spiced ghee. Mostly hands-off while the lentils simmer.",
    ingredients: [
      { slot: "lentils", item: "red-lentils", qty: 200, unit: "g", group: "main", prep: "rinsed" },
      { slot: "water", item: "water", qty: 900, unit: "ml", group: "main" },
      { slot: "tomato", item: "fresh-tomatoes", qty: 1, unit: "", group: "main", prep: "chopped" },
      { slot: "garlic", item: "garlic", qty: 4, unit: "cloves", group: "main", prep: "thinly sliced" },
      { slot: "cilantro", item: "cilantro", qty: 2, unit: "tbsp", group: "main", prep: "chopped, optional" },
      { slot: "turmeric", item: "turmeric", qty: 0.5, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "cumin", item: "cumin-seeds", qty: 1, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "redchili", item: "dried-red-chili", qty: 2, unit: "", group: "spices", scaling: "taste" },
      { slot: "salt", item: "salt", qty: 1, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "ghee", item: "ghee", qty: 2, unit: "tbsp", group: "staples", scaling: "pan" },
      { slot: "lemon", item: "lemon", qty: 0.5, unit: "", group: "staples" },
      { slot: "rice", item: "basmati", qty: 300, unit: "g", group: "serve", prep: "uncooked" },
    ],
    steps: [
      { id: "s1", text: "Rinse the {lentils} until the water runs mostly clear." },
      { id: "s2", text: "Simmer the {lentils} with the {water}, {turmeric} and {tomato} until completely soft, 20 to 25 minutes. Whisk, add the {salt}, and loosen with water if needed." },
      { id: "s3", text: "Meanwhile, rinse the {rice} and cook it with 1.5 times its volume of water, about 15 minutes." },
      { id: "s4", text: "For the tadka, heat the {ghee} in a small pan. Add the {cumin}, then the {garlic} and {redchili}. Cook until the garlic is golden, about 1 minute." },
      { id: "s5", text: "Pour the tadka over the dal and finish with {lemon} and {cilantro}." },
    ],
    noSwap: {
      water: "Water is adjusted by the recipe itself, not swapped.",
    },
  },
  {
    id: "tomato-egg",
    title: "Tomato and egg stir-fry",
    subtitle: "Fānqié chǎo dàn",
    cuisine: "Chinese, home style",
    minutes: 20,
    servings: 2,
    blurb: "Soft egg curds in a sweet-sour tomato sauce over rice. Few ingredients, very forgiving.",
    ingredients: [
      { slot: "eggs", item: "eggs", qty: 4, unit: "", group: "main", step: 1 },
      { slot: "tomatoes", item: "fresh-tomatoes", qty: 3, unit: "", group: "main", prep: "cut into wedges" },
      { slot: "scallions", item: "scallions", qty: 2, unit: "", group: "main", prep: "sliced" },
      { slot: "sugar", item: "sugar", qty: 1, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "salt", item: "salt", qty: 0.5, unit: "tsp", group: "spices", scaling: "taste" },
      { slot: "oil", item: "neutral-oil", qty: 2, unit: "tbsp", group: "staples", scaling: "pan" },
      { slot: "rice", item: "jasmine", qty: 150, unit: "g", group: "serve", prep: "uncooked" },
    ],
    steps: [
      { id: "s1", text: "Rinse the {rice} and simmer it with 1.25 times its volume of water for 12 minutes, then rest it covered." },
      { id: "s2", text: "Beat the {eggs} with a pinch of the {salt}." },
      { id: "s3", text: "Heat half the {oil} over medium-high heat. Add the eggs and push them into large soft curds. Take them out while still a little wet." },
      { id: "s4", text: "Add the rest of the oil and the {tomatoes}. Cook until they slump and release their juice, 3 to 4 minutes." },
      { id: "s5", text: "Add the {sugar}, the remaining salt and a splash of water. Simmer for 1 minute to make a loose sauce." },
      { id: "s6", text: "Return the eggs, fold gently, and scatter with the {scallions}. Serve over the rice." },
    ],
    noSwap: {
      sugar: "The sugar balances the tomato's acidity. Taste and adjust it rather than swapping it.",
    },
  },
];

export function getRecipe(id) {
  return RECIPES.find((r) => r.id === id) ?? null;
}
