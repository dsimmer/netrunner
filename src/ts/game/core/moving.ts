export * from './moving_1';
export * from './moving_2';

export { shuffle, shuffleMyDeck } from "./shuffling";
export { swapICE as swapIce } from "./moving_2";

import { move as moveFn } from "./moving_1";
import type { MoveCardOpts } from "./moving_1";
import type { Card } from "./card";
import type { GameState } from "./state";

/** Move a card to the rfg zone. Mirrors `move-to-rfg` / `rfg` callsites. */
export function rfg(
  state: GameState,
  side: string,
  card: Card,
  args?: MoveCardOpts,
): Card | null {
  return moveFn(state, side, card, ":rfg", args);
}
