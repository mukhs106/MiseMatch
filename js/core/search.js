// Recipe search: plain word matching over a recipe's name, subtitle, cuisine and
// ingredient names. Every word in the query has to appear somewhere.

import { ITEMS } from "../data/items.js";

const normalize = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function searchText(recipe) {
  const ingredients = recipe.ingredients.map((i) => ITEMS[i.item]?.name ?? i.item);
  return normalize([recipe.title, recipe.subtitle, recipe.cuisine, ...ingredients].join(" "));
}

export function matchesQuery(recipe, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = searchText(recipe);
  return words.every((w) => text.includes(w));
}
