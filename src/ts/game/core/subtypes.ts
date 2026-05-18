// Subtype computation and update helpers.
// Mirrors: src/clj/game/core/subtypes.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import { getEffects } from "./effects";
import { updateCard } from "./update";
import { getCard, getAllCards } from "./finding";
import { serverCard, toKeyword } from "../utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flatten<T>(arr: unknown[]): T[] {
  const out: T[] = [];
  for (const item of arr) {
    if (Array.isArray(item)) {
      out.push(...flatten<T>(item));
    } else if (item !== undefined && item !== null) {
      out.push(item as T);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// subtypes-for-card
// ---------------------------------------------------------------------------

/**
 * Computes a sorted list of subtypes for a card, taking into account
 * printed subtypes, gained subtypes, and lost subtypes from effects.
 * Returns null for cards without a title (counters, fake agendas).
 *
 * Mirrors: game.core.subtypes/subtypes-for-card
 */
export function subtypesForCard(state: GameState, card: Card): string[] | null {
  if (!card.title) return null;

  const printedSubtypes: string[] =
    (serverCard(card.title)?.subtypes as string[]) ?? [];
  const rawGained = getEffects(state, null as any, "gain-subtype", card, []);
  const rawLost = getEffects(state, null as any, "lose-subtype", card, []);

  const gainedSubtypes: string[] = flatten(rawGained);
  const lostSubtypes: string[] = flatten(rawLost);

  // frequencies of printed + gained
  const printedAndGained = [...printedSubtypes, ...gainedSubtypes];
  const gainedCounts = new Map<string, number>();
  for (const st of printedAndGained) {
    gainedCounts.set(st, (gainedCounts.get(st) ?? 0) + 1);
  }

  // frequencies of lost
  const lostCounts = new Map<string, number>();
  for (const st of lostSubtypes) {
    lostCounts.set(st, (lostCounts.get(st) ?? 0) + 1);
  }

  // subtract lost from gained, keep only positive counts
  const total = new Map<string, number>();
  for (const [subtype, count] of gainedCounts) {
    const lost = lostCounts.get(subtype) ?? 0;
    const net = count - lost;
    if (net > 0) {
      total.set(subtype, net);
    }
  }

  return [...total.keys()].sort();
}

// ---------------------------------------------------------------------------
// update-subtypes-for-card
// ---------------------------------------------------------------------------

/**
 * Recomputes the subtypes for a single card and updates state if changed.
 * Returns true if subtypes were updated.
 *
 * Mirrors: game.core.subtypes/update-subtypes-for-card
 */
export function updateSubtypesForCard(
  state: GameState,
  _side: unknown,
  card: Card,
): boolean {
  const current = getCard(state, card);
  if (!current) return false;

  const oldSubtypes = current.subtypes ?? [];
  const newSubtypes = subtypesForCard(state, current);

  const oldSorted = [...oldSubtypes].sort();
  const newSorted = newSubtypes ? [...newSubtypes].sort() : [];
  const changed = JSON.stringify(oldSorted) !== JSON.stringify(newSorted);

  if (changed) {
    const updatedCard = { ...current, subtypes: newSubtypes };
    updateCard(state, toKeyword(current.side ?? ""), updatedCard as Card);
  }

  return changed;
}

// ---------------------------------------------------------------------------
// update-all-subtypes
// ---------------------------------------------------------------------------

/**
 * Recomputes subtypes for every card in the game.
 * Returns true if any card's subtypes were updated.
 *
 * Mirrors: game.core.subtypes/update-all-subtypes
 */
export function updateAllSubtypes(state: GameState, _side?: unknown): boolean {
  let changed = false;
  for (const card of getAllCards(state)) {
    if (updateSubtypesForCard(state, null, card)) {
      changed = true;
    }
  }
  return changed;
}
