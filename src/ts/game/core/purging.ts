// Purging virus counters.
// Mirrors: src/clj/game/core/purging.clj

import type { GameState } from "./state";
import type { EID } from "./eid";
import type { Card } from "./card";
import { getAllInstalled } from "./board";
import { getCounters } from "./card";
import { effectCompleted } from "./eid";
import { getEffects } from "./effects";
import { queueEvent } from "./engine";
import { checkpoint } from "./checkpoint";
import { updateAllIce } from "./ice";
import { addCounter } from "./props";
import { wait_for } from "../macros";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PurgeEntry {
  card: Card;
  quantity: number;
}

interface PurgePrevention {
  card: Card;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively remove virus counters from a list of cards, one at a time.
 * Mirrors `remove-virus-counters` in purging.clj.
 */
function removeVirusCounters(
  state: GameState,
  side: string,
  eid: EID,
  entries: PurgeEntry[],
): void {
  if (entries.length === 0) {
    effectCompleted(state, side, eid);
    return;
  }

  const [current, ...remainder] = entries;
  wait_for(
    state,
    [() => removeVirusCounters(state, side, eid, remainder)],
    [
      addCounter,
      state,
      "runner",
      current.card,
      "virus",
      -current.quantity,
      null,
    ],
    { eid },
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Purges virus counters from all installed cards.
 * Mirrors `purge` in purging.clj.
 */
export function purge(state: GameState, side: string, eid: EID): void {
  // Build a map of cid -> purge prevention effect
  const purgePreventions: Record<string, PurgePrevention> = {};
  const preventionEffects = getEffects(
    state,
    side,
    "prevent-purge-virus-counters",
    null,
    [],
  );
  for (const eff of preventionEffects) {
    if (eff && typeof eff === "object") {
      const card = (eff as Record<string, unknown>).card as Card | undefined;
      const quantity = (eff as Record<string, unknown>).quantity as
        | number
        | undefined;
      if (card?.cid) {
        purgePreventions[card.cid] = { card, quantity: quantity ?? 0 };
      }
    }
  }

  // Determine which cards to purge and how many counters to remove
  const cardsToPurge: PurgeEntry[] = [];
  for (const card of getAllInstalled(state)) {
    let qty = getCounters(card, "virus");
    const pp = purgePreventions[card.cid];
    if (pp) {
      qty = qty - pp.quantity;
    }
    if (qty > 0) {
      cardsToPurge.push({ card, quantity: qty });
    }
  }

  wait_for(
    state,
    [
      () => {
        updateAllIce(state, side);
        const totalPurgedCounters = cardsToPurge.reduce(
          (sum, e) => sum + e.quantity,
          0,
        );
        queueEvent(state, "purge", {
          totalPurgedCounters,
          purges: cardsToPurge,
        });
        checkpoint(state, side, eid);
      },
    ],
    [removeVirusCounters, state, side, eid, cardsToPurge],
    { eid },
  );
}
