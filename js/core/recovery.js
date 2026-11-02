// Undo as narrow inverse operations. Each meaningful removal leaves one record
// that restores only the thing removed, against the state as it is now, so
// undoing never erases edits made in between. Records persist (the Saved screen
// lists them), so recovering work never depends on a timed toast.

import { uid } from "./versions.js";
import { convert, compatible } from "./units.js";
import { addBought } from "./pantry.js";

const KEEP = 20;

export function addRecovery(state, record, now = Date.now()) {
  const entry = { id: uid("r"), at: now, ...record };
  return { state: { ...state, recovery: [entry, ...(state.recovery ?? [])].slice(0, KEEP) }, id: entry.id };
}

function dropRecord(state, id) {
  return { ...state, recovery: (state.recovery ?? []).filter((r) => r.id !== id) };
}

function subtractStock(pantry, item, qty, unit, wasEntry) {
  const now = pantry[item];
  if (!now) return pantry;
  if (now.qty != null && compatible(now.unit, unit)) {
    const left = now.qty - convert(qty, unit, now.unit);
    if (left <= 0.0001 && !wasEntry) {
      const next = { ...pantry };
      delete next[item];
      return next;
    }
    if (wasEntry && wasEntry.qty == null && left <= 0.0001) return { ...pantry, [item]: wasEntry };
    return { ...pantry, [item]: { ...now, qty: Math.max(0, Number(left.toFixed(4))) } };
  }
  const also = (now.also ?? []).map((o) => (compatible(o.unit, unit) ? { ...o, qty: o.qty - convert(qty, unit, o.unit) } : o)).filter((o) => o.qty > 0.0001);
  return { ...pantry, [item]: { ...now, also } };
}

const INVERSE = {
  "pantry-entry": (s, r) => ({ state: { ...s, pantry: { ...s.pantry, [r.key]: r.entry } } }),
  "bookmark": (s, r) => ({ state: { ...s, saved: [...s.saved.filter((x) => x !== r.recipeId), r.recipeId] } }),
  "list-line": (s, r) => {
    if (s.list.lines.some((l) => l.id === r.line.id)) return { state: s };
    const dismissed = { ...s.list.dismissed };
    for (const mealId of Object.keys(r.line.sources ?? {})) {
      if (dismissed[mealId]?.[r.line.key]) {
        dismissed[mealId] = { ...dismissed[mealId] };
        delete dismissed[mealId][r.line.key];
      }
    }
    const lines = [...s.list.lines];
    lines.splice(Math.min(r.index ?? lines.length, lines.length), 0, r.line);
    return { state: { ...s, list: { ...s.list, lines, dismissed } }, resync: true };
  },
  "list-lines": (s, r) => {
    const ids = new Set(s.list.lines.map((l) => l.id));
    const dismissed = { ...s.list.dismissed };
    for (const line of r.lines) {
      for (const mealId of Object.keys(line.sources ?? {})) {
        if (dismissed[mealId]?.[line.key]) {
          dismissed[mealId] = { ...dismissed[mealId] };
          delete dismissed[mealId][line.key];
        }
      }
    }
    return { state: { ...s, list: { ...s.list, lines: [...s.list.lines, ...r.lines.filter((l) => !ids.has(l.id))], dismissed } }, resync: true };
  },
  "plan-meal": (s, r) => {
    if (s.plan.some((p) => p.id === r.entry.id)) return { state: s };
    const plan = [...s.plan];
    plan.splice(Math.min(r.index ?? plan.length, plan.length), 0, r.entry);
    return { state: { ...s, plan }, resync: true };
  },
  "version": (s, r) => {
    const sessions = { ...s.sessions };
    for (const key of r.sessions ?? []) if (sessions[key] && !sessions[key].baseVersion) sessions[key] = { ...sessions[key], baseVersion: r.version.id };
    return { state: { ...s, versions: { ...s.versions, [r.version.id]: r.version }, sessions } };
  },
  "draft": (s, r) => ({ state: { ...s, drafts: { ...s.drafts, [r.draft.id]: r.draft } } }),
  "draft-line": (s, r) => {
    const d = s.drafts[r.draftId];
    if (!d) return { state: s };
    return { state: { ...s, drafts: { ...s.drafts, [r.draftId]: { ...d, lines: d.lines.map((l) => (l.id === r.line.id ? r.line : l)) } } } };
  },
  "session": (s, r) => {
    // A newer session for this dish is someone's newer work. It isn't overwritten.
    if (s.sessions[r.recipeId]) return { state: s, blocked: "A newer adaptation of this dish is in progress, so the older one wasn't restored." };
    return { state: { ...s, sessions: { ...s.sessions, [r.recipeId]: r.session } } };
  },
  "transfer": (s, r) => {
    const lines = s.list.lines.map((l) => {
      if (l.id !== r.lineId) return l;
      const { transfer, ...rest } = l;
      return rest;
    });
    const pantry = r.free ? (() => { const p = { ...s.pantry }; delete p[r.free]; return p; })() : r.qty != null ? subtractStock(s.pantry, r.item, r.qty, r.unit, r.before) : (r.before ? { ...s.pantry, [r.item]: r.before } : (() => { const p = { ...s.pantry }; delete p[r.item]; return p; })());
    return { state: { ...s, list: { ...s.list, lines }, pantry }, resync: true };
  },
  "cook-pantry": (s, r) => {
    let pantry = s.pantry;
    for (const t of r.takes) {
      const now = pantry[t.item];
      if (now?.qty === 0) pantry = { ...pantry, [t.item]: { ...now, qty: t.qty, unit: t.unit } };
      else pantry = addBought(pantry, t.item, t.qty, t.unit);
    }
    const cooks = s.cooks.map((c) => (c.id === r.cookId ? { ...c, pantryUpdate: null } : c));
    let plan = s.plan;
    if (r.planEntry && !plan.some((p) => p.id === r.planEntry.id)) {
      plan = [...plan];
      plan.splice(Math.min(r.planIndex ?? plan.length, plan.length), 0, r.planEntry);
    }
    return { state: { ...s, pantry, cooks, plan }, resync: true };
  },
};

/**
 * Restore one record against the current state.
 * @returns {{ state, resync?: boolean, blocked?: string }} state with the record used up (unless blocked)
 */
export function applyRecovery(state, id) {
  const record = (state.recovery ?? []).find((r) => r.id === id);
  if (!record) return { state };
  const fn = INVERSE[record.kind];
  if (!fn) return { state: dropRecord(state, id) };
  const result = fn(state, record);
  if (result.blocked) return result;
  return { ...result, state: dropRecord(result.state, id) };
}
