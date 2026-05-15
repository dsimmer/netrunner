// Card definition registry and lookup.
// Mirrors: src/clj/game/core/card_defs.clj

import type { Card } from "./card";
import type { CardDef } from "./types.ts";
import { cardDefRegistry } from "./types.ts";

export type { CardDef };

/**
 * Retrieves a card's ability definition map.
 * Tries title first, then printedTitle. Throws if neither exists.
 * Mirrors: card-def in card_defs.clj
 */
export function cardDef(card: Card): CardDef {
  if (card.title) {
    return cardDefRegistry.get(card.title) ?? {};
  }
  if (card.printedTitle) {
    return cardDefRegistry.get(card.printedTitle) ?? {};
  }
  throw new Error(
    `Tried to select card-def for non-existent card: ${JSON.stringify(card)}`,
  );
}
