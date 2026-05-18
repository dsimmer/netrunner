export * from './moving_1';
export * from './moving_2';

export { shuffle, shuffleMyDeck } from "./shuffling";
export { swapICE as swapIce } from "./moving_2";

import { move as moveFn } from "./moving_1";

/** Move a card to the rfg zone. Mirrors `move-to-rfg` / `rfg` callsites. */
export function rfg(state: any, side: any, card: any, args?: any): any {
  return moveFn(state, side, card, ":rfg", args);
}
