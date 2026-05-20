// Expend: reveal a card from hand and trash it as a cost to gain its ability.
// Mirrors: src/clj/game/core/expend.clj

import type { Ability, Card, EID, GameState } from "./types";
import { cardDef } from "./card_defs";
import { checkpoint } from "./checkpoint";
import { queueEvent, resolveAbility } from "./engine";
import { toC, mergeCosts, canPay } from "./payment";
import { req, wait_for } from "../macros";

/**
 * Can a card be expended? (disabled cards will not retain the ability)
 * Mirrors: expendable? in expend.clj
 */
export function expendable(state: GameState, card: Card): boolean {
  return !!(cardDef(card).expend && !state.disabledCardReg.has(card.cid));
}

/**
 * Build the ability object for expending a card.
 * Mirrors: expend in expend.clj
 */
export function expend(ex: Ability | undefined): Ability {
  const expCost = [toC("click", 1), toC("expend")];
  const mergedCost = ex?.cost
    ? mergeCosts([...(ex.cost as any[]), ...expCost])
    : mergeCosts(expCost);

  return {
    req: req(
      (
        state: GameState,
        side: string,
        eid: EID,
        card: Card,
        targets: any[],
      ) => {
        const eidWithSource = { ...eid, source: card, sourceType: "ability" };
        const canPayResult = canPay(
          state,
          side,
          eidWithSource,
          card,
          null,
          mergedCost,
        );
        const exReqOk = ex?.req
          ? (ex.req as any)(state, side, eid, card, targets)
          : true;
        return !!(canPayResult && exReqOk);
      },
    ),
    async: true,
    action: true,
    effect: req(
      (
        state: GameState,
        _side: string,
        eid: EID,
        card: Card,
        _targets: any[],
      ) => {
        wait_for(
          state,
          [
            () => queueEvent(state, "expend-resolved", { card }),
            () => checkpoint(state, null, eid, undefined),
          ],
          [
            resolveAbility,
            state,
            "corp",
            { ...ex, cost: mergedCost },
            card,
            null,
          ],
          { eid },
        );
      },
    ),
  };
}
