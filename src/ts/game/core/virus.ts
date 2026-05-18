import type { GameState } from "./state";
import type { Card } from "./card";
import { allActiveInstalled, getAllInstalled, allInstalled } from "./board";
import { virusProgram, getCounters } from "./card";
import { RUNNER_SIDE } from "./state";

/**
 * Calculate the number of virus counters on the given card, taking Hivemind into account.
 */
export function getVirusCounters(state: GameState, card: Card): number {
  const hiveminds = virusProgram(card)
    ? allActiveInstalled(state, RUNNER_SIDE).filter(
        (c) => c.title === "Hivemind",
      )
    : [];
  const cards = [card, ...hiveminds];
  return cards.reduce((sum, c) => sum + getCounters(c, "virus"), 0);
}

/**
 * Calculate the number of virus programs in play
 */
export function countVirusPrograms(state: GameState): number {
  return allActiveInstalled(state, RUNNER_SIDE).filter(virusProgram).length;
}

/**
 * Returns number of actual virus counters (excluding virtual counters from Hivemind)
 */
export function numberOfVirusCounters(state: GameState): number {
  return getAllInstalled(state).reduce(
    (sum, c) => sum + getCounters(c, "virus"),
    0,
  );
}

/**
 * Returns the number of actual virus counters on Runner cards (excluding virtual counters from Hivemind)
 */
export function numberOfRunnerVirusCounters(state: GameState): number {
  return allInstalled(state, RUNNER_SIDE).reduce(
    (sum, c) => sum + getCounters(c, "virus"),
    0,
  );
}

import { addCounter } from "./props";

/** Add n virus counters to a card. */
export function addVirusCounter(state: any, side: any, eid: any, card: any, n: number): void {
  addCounter(state, side, eid, card, ":virus", n);
}

/** Count virus counters on a card. */
export function countVirusCounter(card: Card): number;
export function countVirusCounter(state: GameState, card: Card): number;
export function countVirusCounter(...args: any[]): number {
  if (args.length === 1) {
    // shorthand: just count counters directly on the card (no Hivemind lookup)
    return getCounters(args[0] as Card, "virus") ?? 0;
  }
  return getVirusCounters(args[0] as GameState, args[1] as Card);
}
