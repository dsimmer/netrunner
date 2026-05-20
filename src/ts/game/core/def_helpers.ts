export * from './def_helpers_1';
export * from './def_helpers_2';

export { setAutoresolve, getAutoresolve } from "./optional";
export { successfulRunReplaceBreach } from "./runs";
export { addCounter } from "./props";
export { autoIcebreaker } from "./ice_2";
export { installedAccessTrigger } from "./access_1";
export { shuffleIntoRdEffect } from "./shuffling";
export { gainTagsAbility } from "./tags";

import { quantify } from "../utils";
import { req } from "../macros";
import type { Ability, Card, EID, Side, State } from './types';


/**
 * Shorthand ability that draws x cards. Mirrors `draw-abi` in clj.
 */
export function drawAbility(x: number, drawArgs?: any, abBase?: any): any {
  return {
    msg: `draw ${quantify(x, "card")}`,
    label: `Draw ${quantify(x, "card")}`,
    async: true,
    effect: req(function* (state: State, side: Side, eid: EID) {
      const { draw } = require("./drawing");
      yield draw(state, side, eid, x, drawArgs);
    }),
    ...(abBase ?? {}),
  };
}

/**
 * Ability to install up to n corp cards from HQ.
 * Mirrors `corp-install-up-to-n-cards` in clj.
 */
export function corpInstallUpToN(n: number, args?: any): any {
  return {
    prompt: `install a card from HQ${n > 1 ? ` (${n} remaining)` : ""}`,
    choices: {
      card: (c: any) => {
        const { corp, inHand, operation } = require("./card");
        return corp(c) && inHand(c) && !operation(c);
      },
    },
    async: true,
    effect: req(function* (state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const { corpInstall } = require("./installing");
      const { continueAbility } = require("./def_helpers_1");
      const { effectCompleted } = require("./eid");
      yield corpInstall(
        state,
        side,
        targets[0],
        null,
        { ...(args ?? {}), msgKeys: { installSource: card } },
      );
      if (n > 1) {
        yield continueAbility(state, side, corpInstallUpToN(n - 1, args), card, null);
      } else {
        effectCompleted(state, side, eid);
      }
    }),
  };
}
