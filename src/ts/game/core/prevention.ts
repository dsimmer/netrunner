export * from './prevention_1';
export * from './prevention_2';

import { req as reqFn, wait_for } from "../macros";
import { sameCard } from "./card";
import { canPay } from "./payment";
import type { PreventionContext } from "./prevention_1";
import type { Ability, Cost } from "./types";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { GameState } from "./state";

interface TrashRemainingEntry {
  card: Card | null | undefined;
}

/**
 * Prevention ability: prevent trashing of an installed card by type.
 * Mirrors `prevent-trash-installed-by-type` in prevention.clj.
 */
export function preventTrashInstalledByType(
  label: string,
  types: Set<string> | string[],
  cost: Cost[],
  validContext: (ctx: PreventionContext) => boolean,
): Ability {
  const typeSet = types instanceof Set ? types : new Set(types);
  const isTrashCanCost =
    cost.length === 1 && (cost[0]?.cost === ":trash-can" || cost[0]?.type === ":trash-can");
  const relevant = (state: GameState, card: Card): Card[] => {
    const prevent = state.prevent as { trash?: { remaining?: TrashRemainingEntry[] } } | undefined;
    const remaining: TrashRemainingEntry[] = prevent?.trash?.remaining ?? [];
    return remaining
      .map((entry: TrashRemainingEntry) => entry?.card)
      .filter((c: Card | null | undefined): c is Card => {
        if (!c) return false;
        if (!c.type || !typeSet.has(c.type)) return false;
        if (isTrashCanCost && sameCard(card, c)) return false;
        return !!c.installed;
      });
  };
  return {
    prevents: ":trash",
    type: ":ability",
    label,
    ability: {
      req: reqFn(function* (state: GameState, side: string, eid: EID, card: Card, targets: unknown[]) {
        const ctx = (targets as Array<PreventionContext | undefined>)?.[0];
        if (!ctx || ctx.unpreventable) return false;
        if (!validContext(ctx)) return false;
        if (relevant(state, card).length === 0) return false;
        return canPay(state, side, eid, card, null, cost) !== null;
      }),
      async: true,
      "fake-cost": cost,
      effect: reqFn(function* (state: GameState, side: string, eid: EID, card: Card) {
        const targetsList = relevant(state, card);
        if (targetsList.length === 1) {
          yield wait_for(state, [{ asyncResult: "result" }, () => {
            const prevent = state.prevent as { trash?: { remaining?: TrashRemainingEntry[] } } | undefined;
            if (prevent?.trash) prevent.trash.remaining = [];
          }], []);
        }
      }),
    },
  };
}
