// Local persistence. Everything lives in this browser's localStorage under one
// key; storage failures (private mode, blocked storage) fall back to memory.

import { emptyList } from "./core/shopping.js";

const KEY = "mise-match:v1";

export function initialState() {
  return {
    version: 1,
    saved: ["chana-palak", "masoor-dal"], // demo starting state
    adaptations: {}, // recipeId -> { servings, applied: [swapId] }
    pantry: {}, // itemId -> { status: "have" | "some" | "need", qty?, unit? }
    list: emptyList(),
    goals: [], // optional: "protein", "fiber"
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const data = JSON.parse(raw);
    if (data?.version !== 1) return initialState();
    const base = initialState();
    return {
      ...base,
      ...data,
      list: { ...base.list, ...data.list },
    };
  } catch {
    return initialState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  return initialState();
}
