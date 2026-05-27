export * from './prevention_1';
export * from './prevention_2';

import { req as reqFn, wait_for } from "../macros";
import { sameCard } from "./card";
import { canPay } from "./payment";
import type { Card, EID, Side, State } from './types';


/**
 * Prevention ability: prevent trashing of an installed card by type.
 * Mirrors `prevent-trash-installed-by-type` in prevention.clj.
 */
export function preventTrashInstalledByType(
  label: string,
  types: Set<string> | string[],
  cost: any[],
  validContext: (ctx: any) => boolean,
): any {
  const typeSet = types instanceof Set ? types : new Set(types);
  const isTrashCanCost =
    cost.length === 1 && (cost[0]?.cost === ":trash-can" || cost[0]?.type === ":trash-can");
  const relevant = (state: any, card: any): any[] => {
    const remaining = state?.prevent?.trash?.remaining ?? [];
    return remaining
      .map((entry: any) => entry?.card)
      .filter((c: any) => {
        if (!c) return false;
        if (!typeSet.has(c.type)) return false;
        if (isTrashCanCost && sameCard(card, c)) return false;
        return !!c.installed;
      });
  };
  return {
    prevents: ":trash",
    type: ":ability",
    label,
    ability: {
      req: reqFn(function* (state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = targets?.[0];
        if (!ctx || ctx.unpreventable) return false;
        if (!validContext(ctx)) return false;
        if (relevant(state, card).length === 0) return false;
        return canPay(state, side, eid, card, null, cost) !== null;
      }),
      async: true,
      "fake-cost": cost,
      effect: reqFn(function* (state: State, side: Side, eid: EID, card: Card) {
        const targetsList = relevant(state, card);
        if (targetsList.length === 1) {
          yield wait_for(state, [{ asyncResult: "result" }, () => {
            if (state?.prevent?.trash) state.prevent.trash.remaining = [];
          }], []);
        }
      }),
    },
  };
}
