import type { GameState } from "./state";
import type { Card } from "./card";
import type { Side } from "./types";
import type { EID } from "./eid";
import { allActiveInstalled, getAllInstalled, allInstalled } from "./board";
import { virusProgram, getCounters } from "./card";
import { RUNNER_SIDE } from "./state";
import { addCounter } from "./props";

/**
 * Calculate the number of virus counters on the given card, taking Hivemind into account.
 */
export function getVirusCounters(state: GameState, card: Card): number {
  const hiveminds = virusProgram(card)
    ? allActiveInstalled(state, RUNNER_SIDE).filter(
        (c) => c.title === "Hivemind",
      )
    : [];
  const cards: Card[] = [card, ...hiveminds];
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

/** Add n virus counters to a card. Thin wrapper used by card definitions. */
export function addVirusCounter(
  state: GameState,
  side: Side,
  eid: EID,
  card: Card,
  n: number,
): void {
  addCounter(state, side, eid, card, "virus", n);
}

/** Count virus counters on a card directly (no Hivemind expansion). */
export function countVirusCounter(
  cardOrState: Card | GameState,
  maybeCard?: Card,
): number {
  if (maybeCard === undefined) {
    return getCounters(cardOrState as Card, "virus") ?? 0;
  }
  return getVirusCounters(cardOrState as GameState, maybeCard);
}
