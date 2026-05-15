import type { GameState } from "./state.js";
import type { Card } from "./card.js";
import { allActiveInstalled, getAllInstalled, allInstalled } from "./board.js";
import { virusProgram, getCounters } from "./card.js";
import { RUNNER_SIDE } from "./state.js";

/**
 * Calculate the number of virus counters on the given card, taking Hivemind into account.
 */
export function getVirusCounters(state: GameState, card: Card): number {
  const hiveminds = virusProgram(card)
    ? allActiveInstalled(state, RUNNER_SIDE).filter((c) => c.title === "Hivemind")
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
    0
  );
}

/**
 * Returns the number of actual virus counters on Runner cards (excluding virtual counters from Hivemind)
 */
export function numberOfRunnerVirusCounters(state: GameState): number {
  return allInstalled(state, RUNNER_SIDE).reduce(
    (sum, c) => sum + getCounters(c, "virus"),
    0
  );
}
