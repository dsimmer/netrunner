//
/**
 * ICE Cards
 * Ported from Clojure cards/ice.clj to TypeScript
 *
 * Contains ~317 card definitions with their abilities and events.
 */

import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreBadPublicity from "../core/bad_publicity";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCardDefs from "../core/card_defs";
import * as coreCheckpoint from "../core/checkpoint";
import * as coreChooseOne from "../core/choose_one";
import * as coreDamage from "../core/damage";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEid from "../core/eid";
import * as coreEngine from "../core/engine";
import * as coreEvents from "../core/events";
import * as coreFinding from "../core/finding";
import * as coreFlags from "../core/flags";
import * as coreGaining from "../core/gaining";
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreMoving from "../core/moving";
import * as corePayment from "../core/payment";
import * as coreProps from "../core/props";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreServers from "../core/servers";
import * as coreTags from "../core/tags";
import * as coreThreat from "../core/threat";
import * as coreToString from "../core/to_string";
import * as coreToasts from "../core/toasts";
import * as coreUpdate from "../core/update";
import * as utils from "../utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";
import {
  bioraidBreak,
  doPsi,
  endTheRun,
  endTheRunIfTagged,
  gainCreditsSub,
  runnerLosesClick,
  runnerLosesCredits,
  runnerTrashInstalledSub,
  subtypeIceCount,
  tagOrPayCredits,
  tagTrace,
  traceAbility,
  trashProgramSub,
  wonderSub,
} from "./ice_1";

// Stub helpers (to be ported from clj cards/*.clj)
function wallIce(_subs?: any): any {
  return {};
}
function grailIce(_args?: any): any {
  return {};
}
function variableSubsIce(_count?: any, _sub?: any): any {
  return {};
}

// Heimdall 2.0
export const heimdall20: CardDef = {
  title: "Heimdall 2.0",
  subroutines: [
    coreDefHelpers.doBrainDamage(1),
    {
      msg: "do 1 core damage and end the run",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreDamage.damage(
              state,
              side,
              coreEid.makeEid(state, eid),
              ":brain",
              1,
              { card },
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreRuns.endRun(state, side, eid, card)],
          [],
        );
      }),
    },
    endTheRun,
  ],
  "runner-abilities": [bioraidBreak(2, 2)],
};

// Herald
export const herald: CardDef = {
  title: "Herald",
  flags: {
    "rd-reveal": req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  subroutines: [
    gainCreditsSub(2),
    {
      async: true,
      label: "Pay up to 2 [Credits] to place up to 2 advancement counters",
      prompt: "How many advancement counters do you want to place?",
      choices: req(function* (state: State): Generator<any, any, any> {
        const credits = (state as any).corp?.credit ?? 0;
        return Array.from({ length: Math.min(2, credits) + 1 }, (_, i) =>
          String(i),
        );
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const c = parseInt(targets[0], 10);
        const newEid = coreEid.makeEid(state, {
          source: card,
          sourceType: ":subroutine",
        });
        if (
          corePayment.canPay(
            state,
            side,
            Object.assign({}, eid, { source: card, sourceType: ":subroutine" }),
            card,
            (card as any).title,
            [corePayment.toC("credit", c)],
          )
        ) {
          const result: any = yield wait_for(
            state,
            [
              { asyncResult: "result" },
              corePayment.pay(state, ":corp", newEid, card, [
                corePayment.toC("credit", c),
              ]),
            ],
            [],
          );
          coreSay.systemMsg(state, ":corp", result?.msg ?? "");
          const placeAbility = {
            msg: msg(function (
              s: State,
              sd: Side,
              e: EID,
              ca: Card,
              tgts2: any[],
            ) {
              return `pay ${c} [Credits] and place ${utils.quantify(c, "advancement counter")} on ${coreToString.cardStr(s, tgts2[0])}`;
            }),
            choices: {
              req: req(function* (
                s: State,
                sd: Side,
                e: EID,
                ca: Card,
                tgts2: any[],
              ): Generator<any, any, any> {
                return coreCard.canBeAdvanced(s, tgts2[0]);
              }),
            },
            async: true,
            effect: effect(function* (
              s: State,
              sd: Side,
              e: EID,
              ca: Card,
              tgts2: any[],
            ): Generator<any, any, any> {
              yield wait_for(
                s,
                [
                  { asyncResult: "result" },
                  coreProps.addProp(s, sd, e, tgts2[0], ":advance-counter", c, {
                    placed: true,
                  }),
                ],
                [],
              );
            }),
          };
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreEngine.resolveAbility(state, side, placeAbility, card, null),
            ],
            [],
          );
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
  "on-access": {
    async: true,
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return !coreCard.inDiscard(card);
    }),
    msg: "force the Runner to encounter Herald",
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreRuns.forceIceEncounter(state, side, eid, card),
        ],
        [],
      );
    }),
  },
};

// Himitsu-Bako
export const himitsuBako: CardDef = {
  title: "Himitsu-Bako",
  abilities: [
    {
      msg: "add itself to HQ",
      cost: [corePayment.toC("credit", 1)],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        coreMoving.move(state, side, card, ":hand");
      }),
    },
  ],
  subroutines: [endTheRun],
};

// Hive
export const hive: CardDef = {
  title: "Hive",
  "static-abilities": [
    {
      type: ":lose-printed-subroutines",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreCard.sameCard(card, targets[0]);
      }),
      value: req(function* (state: State): Generator<any, any, any> {
        return Math.max(0, (state as any).corp?.agendaPoint ?? 0);
      }),
    },
  ],
  subroutines: [endTheRun, endTheRun, endTheRun, endTheRun, endTheRun],
};

// Holmegaard
export const holmegaard: CardDef = {
  title: "Holmegaard",
  subroutines: [
    traceAbility(4, {
      label: "Runner cannot access any cards this run",
      msg: "stop the Runner from accessing any cards this run",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        coreRuns.preventAccess(state);
      }),
    }),
    {
      label: "Trash an icebreaker",
      prompt: "Choose an icebreaker to trash",
      msg: msg(function (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ) {
        return `trash ${(targets[0] as any)?.title}`;
      }),
      "change-in-game-state": {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return coreBoard
            .allInstalled(state, ":runner")
            .some((c: Card) => coreCard.hasSubtype(c, "Icebreaker"));
        }),
      },
      choices: {
        card: (c: Card) =>
          coreCard.installed(c) && coreCard.hasSubtype(c, "Icebreaker"),
      },
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreRuns.clearWaitPrompt(state, ":runner");
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.trash(state, side, eid, targets[0], {
              cause: ":subroutine",
            }),
          ],
          [],
        );
      }),
    },
  ],
};

// Hortum
export const hortum: CardDef = (() => {
  function hort(
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    n: number,
  ): any {
    return {
      prompt: "Choose a card to add to HQ",
      async: true,
      choices: req(function* (s: State): Generator<any, any, any> {
        return coreCard.cancellable((s as any).corp?.deck ?? [], {
          sorted: true,
        });
      }),
      msg: "add 1 card to HQ from R&D",
      cancel: coreMoving.shuffleMyDeck,
      effect: req(function* (
        s: State,
        sd: Side,
        e: EID,
        c: Card,
        tgts: any[],
      ): Generator<any, any, any> {
        coreMoving.move(s, sd, tgts[0], ":hand");
        if (n < 2) {
          yield wait_for(
            s,
            [
              { asyncResult: "result" },
              coreEngine.resolveAbility(
                s,
                sd,
                hort(s, sd, e, c, n + 1),
                c,
                null,
              ),
            ],
            [],
          );
        } else {
          coreMoving.shuffle(s, sd, ":deck");
          coreSay.systemMsg(s, sd, "shuffles R&D");
          coreEid.effectCompleted(s, sd, e);
        }
      }),
    };
  }
  const breakableFn = req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    if (
      coreCard.getCounters(card, ":advancement") < 3 ||
      !coreCard.hasSubtype(targets[0], "AI") ||
      (card as any).title !== "Hortum" ||
      coreEffects.isDisabledReg(state, card)
    ) {
      return ":unrestricted";
    }
    return false;
  });
  return {
    title: "Hortum",
    advanceable: ":always",
    subroutines: [
      {
        label: "Gain 1 [Credits] (Gain 4 [Credits])",
        breakable: breakableFn,
        msg: msg(function (state: State, side: Side, eid: EID, card: Card) {
          return `gain ${wonderSub(card, 3) ? "4" : "1"} [Credits]`;
        }),
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreGaining.gainCredits(
                state,
                ":corp",
                eid,
                wonderSub(card, 3) ? 4 : 1,
              ),
            ],
            [],
          );
        }),
      },
      {
        label:
          "End the run (Search R&D for up to 2 cards and add them to HQ, shuffle R&D, end the run)",
        async: true,
        breakable: breakableFn,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          if (wonderSub(card, 3)) {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreEngine.resolveAbility(
                  state,
                  side,
                  hort(state, side, eid, card, 1),
                  card,
                  null,
                ),
              ],
              [],
            );
            coreSay.systemMsg(
              state,
              side,
              `uses ${(card as any).title} to add 2 cards to HQ from R&D, shuffle R&D, and end the run`,
            );
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreRuns.endRun(state, side, eid, card),
              ],
              [],
            );
          } else {
            coreSay.systemMsg(
              state,
              side,
              `uses ${(card as any).title} to end the run`,
            );
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreRuns.endRun(state, side, eid, card),
              ],
              [],
            );
          }
        }),
      },
    ],
  };
})();

// Hourglass
export const hourglass: CardDef = {
  title: "Hourglass",
  subroutines: [runnerLosesClick, runnerLosesClick, runnerLosesClick],
};

// Howler
export const howler: CardDef = {
  title: "Howler",
  subroutines: [
    {
      label: "Install and rez a piece of Bioroid ice from HQ or Archives",
      req: req(function* (state: State): Generator<any, any, any> {
        const pool = [
          ...((state as any).corp?.hand ?? []),
          ...((state as any).corp?.discard ?? []),
        ];
        return pool.some(
          (c: Card) => coreCard.corp(c) && coreCard.hasSubtype(c, "Bioroid"),
        );
      }),
      async: true,
      prompt: "Choose a piece of Bioroid ice in HQ or Archives to install",
      "show-discard": true,
      choices: {
        card: (c: Card) =>
          coreCard.corp(c) &&
          (coreCard.inHand(c) || coreCard.inDiscard(c)) &&
          coreCard.hasSubtype(c, "Bioroid"),
      },
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const result: any = yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreInstalling.corpInstall(
              state,
              side,
              eid,
              targets[0],
              coreServers.zoneName(coreRuns.targetServer(state)),
              {
                ignoreAllCost: true,
                installState: ":rezzed-no-cost",
                msgKeys: { installSource: card, displayOrigin: true },
                index: coreIce.cardIndex(state, card),
              },
            ),
          ],
          [],
        );
        const newIce = result?.card;
        coreEvents.registerEvents(state, side, card, [
          {
            event: ":run-ends",
            duration: ":end-of-run",
            async: true,
            effect: req(function* (
              s: State,
              sd: Side,
              e: EID,
              c: Card,
            ): Generator<any, any, any> {
              yield wait_for(
                s,
                [
                  { asyncResult: "result" },
                  coreRezzing.derez(s, sd, coreEid.makeEid(s, e), newIce, {
                    suppressCheckpoint: true,
                    msgKeys: { andThen: " and trash itself" },
                  }),
                ],
                [],
              );
              yield wait_for(
                s,
                [
                  { asyncResult: "result" },
                  coreMoving.trash(s, sd, e, c, { cause: ":subroutine" }),
                ],
                [],
              );
            }),
          },
        ]);
        coreEid.effectCompleted(state, side, eid);
      }),
    },
  ],
};

// Hudson 1.0
export const hudson10: CardDef = (() => {
  const sub: any = {
    msg: "prevent the Runner from accessing more than 1 card during this run",
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      coreRuns.maxAccess(state, 1);
    }),
  };
  return {
    title: "Hudson 1.0",
    subroutines: [sub, sub],
    "runner-abilities": [bioraidBreak(1, 1)],
  };
})();

// Hunter
export const hunter: CardDef = {
  title: "Hunter",
  subroutines: [tagTrace(3)],
};

// Hydra
export const hydra: CardDef = (() => {
  function otherwiseTag(message: string, abilityEffect: any): any {
    return {
      msg: msg(function (state: State) {
        return utils.isTagged(state) ? message : "give the Runner 1 tag";
      }),
      label: `${utils.capitalize(message)} if the Runner is tagged; otherwise, give the Runner 1 tag`,
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        if (utils.isTagged(state)) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreEngine.resolveAbility(
                state,
                ":runner",
                abilityEffect,
                card,
                null,
              ),
            ],
            [],
          );
        } else {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreTags.gainTags(state, ":runner", eid, 1),
            ],
            [],
          );
        }
      }),
    };
  }
  return {
    title: "Hydra",
    subroutines: [
      otherwiseTag("do 3 net damage", {
        async: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreDamage.damage(state, ":runner", eid, ":net", 3, { card }),
            ],
            [],
          );
        }),
      }),
      otherwiseTag("gain 5 [Credits]", {
        async: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreGaining.gainCredits(state, ":corp", eid, 5),
            ],
            [],
          );
        }),
      }),
      otherwiseTag("end the run", {
        async: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreRuns.endRun(state, side, eid, card),
            ],
            [],
          );
        }),
      }),
    ],
  };
})();

// Ice Wall
export const iceWall: CardDef = {
  title: "Ice Wall",
  ...wallIce([endTheRun]),
};

// Ichi 1.0
export const ichi10: CardDef = {
  title: "Ichi 1.0",
  subroutines: [
    trashProgramSub,
    trashProgramSub,
    traceAbility(1, {
      label: "Give the Runner 1 tag and do 1 core damage",
      msg: "give the Runner 1 tag and do 1 core damage",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreDamage.damage(
              state,
              ":runner",
              coreEid.makeEid(state, eid),
              ":brain",
              1,
              { card, suppressCheckpoint: true },
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreTags.gainTags(state, ":corp", eid, 1),
          ],
          [],
        );
      }),
    }),
  ],
  "runner-abilities": [bioraidBreak(1, 1)],
};

// Ichi 2.0
export const ichi20: CardDef = {
  title: "Ichi 2.0",
  subroutines: [
    trashProgramSub,
    trashProgramSub,
    traceAbility(3, {
      label: "Give the Runner 1 tag and do 1 core damage",
      msg: "give the Runner 1 tag and do 1 core damage",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreDamage.damage(
              state,
              ":runner",
              coreEid.makeEid(state, eid),
              ":brain",
              1,
              { card },
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreTags.gainTags(state, ":corp", eid, 1),
          ],
          [],
        );
      }),
    }),
  ],
  "runner-abilities": [bioraidBreak(2, 2)],
};

// Inazuma
export const inazuma: CardDef = {
  title: "Inazuma",
  subroutines: [
    {
      msg: "prevent the Runner from breaking subroutines on the next piece of ice they encounter this run",
      "change-in-game-state": {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return !!(state as any).run;
        }),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        coreEvents.registerEvents(state, side, card, [
          {
            event: ":encounter-ice",
            duration: ":end-of-run",
            "unregister-once-resolved": true,
            msg: msg(function (
              s: State,
              sd: Side,
              e: EID,
              c: Card,
              tgts: any[],
            ) {
              return `prevent the runner from breaking subroutines on ${(tgts[0]?.ice as any)?.title}`;
            }),
            effect: effect(function* (
              s: State,
              sd: Side,
              e: EID,
              c: Card,
              tgts: any[],
            ): Generator<any, any, any> {
              const encounteredIce = tgts[0]?.ice;
              coreEffects.registerLingeringEffect(s, sd, c, {
                type: ":cannot-break-subs-on-ice",
                duration: ":end-of-encounter",
                req: req(function* (
                  s2: State,
                  sd2: Side,
                  e2: EID,
                  c2: Card,
                  tgts2: any[],
                ): Generator<any, any, any> {
                  return coreCard.sameCard(encounteredIce, tgts2[0]?.ice);
                }),
                value: true,
              });
            }),
          },
        ]);
      }),
    },
    {
      msg: "prevent the Runner from jacking out until after the next piece of ice",
      "change-in-game-state": {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return !!(state as any).run;
        }),
      },
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const lingering = coreEffects.registerLingeringEffect(
          state,
          side,
          card,
          {
            type: ":cannot-jack-out",
            value: true,
            duration: ":end-of-run",
          },
        );
        coreEvents.registerEvents(state, side, card, [
          {
            event: ":encounter-ice",
            duration: ":end-of-run",
            "unregister-once-resolved": true,
            effect: req(function* (
              s: State,
              sd: Side,
            ): Generator<any, any, any> {
              coreEffects.unregisterEffectByUuid(s, sd, (lingering as unknown as { uuid: string }).uuid);
            }),
          },
        ]);
      }),
    },
  ],
};

// Information Overload
export const informationOverload: CardDef = {
  title: "Information Overload",
  ...variableSubsIce(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      utils.countTags(state),
    runnerTrashInstalledSub,
  ),
  "on-encounter": tagTrace(1),
};

// Interrupt 0
export const interrupt0: CardDef = (() => {
  const sub: any = {
    label: "Make the Runner pay 1 [Credits] to use icebreaker",
    msg: "make the Runner pay 1 [Credits] to use icebreakers to break subroutines during this run",
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ":break-sub-additional-cost",
        duration: ":end-of-run",
        req: req(function* (
          s: State,
          sd: Side,
          e: EID,
          c: Card,
          tgts: any[],
        ): Generator<any, any, any> {
          const context = tgts[0];
          return (
            coreCard.hasSubtype(context?.card, "Icebreaker") &&
            context?.ability?.break != null &&
            (context?.ability?.break ?? 0) > 0
          );
        }),
        value: corePayment.toC("credit", 1),
      });
    }),
  };
  return { title: "Interrupt 0", subroutines: [sub, sub] };
})();

// IP Block
export const ipBlock: CardDef = {
  title: "IP Block",
  "on-encounter": Object.assign({}, coreDefHelpers.giveTags(1), {
    req: req(function* (state: State): Generator<any, any, any> {
      return coreBoard
        .allActiveInstalled(state, ":runner")
        .some((c: Card) => coreCard.hasSubtype(c, "AI"));
    }),
    msg: "give the runner 1 tag because there is an installed AI",
  }),
  subroutines: [tagTrace(3), endTheRunIfTagged],
};

// IQ
export const iq: CardDef = {
  title: "IQ",
  subroutines: [endTheRun],
  "static-abilities": [
    coreIce.iceStrengthBonus(
      req(function* (state: State): Generator<any, any, any> {
        return (state as any).corp?.hand?.length ?? 0;
      }),
    ),
  ],
  "rez-cost-bonus": req(function* (state: State): Generator<any, any, any> {
    return (state as any).corp?.hand?.length ?? 0;
  }),
};

// Ireress
export const ireress: CardDef = {
  title: "Ireress",
  ...variableSubsIce(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      utils.countBadPub(state),
    runnerLosesCredits(1),
  ),
};

// It's a Trap!
export const itsATrap: CardDef = {
  title: "It's a Trap!",
  "on-expose": {
    msg: "do 2 net damage",
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreDamage.damage(state, side, eid, ":net", 2, { card }),
        ],
        [],
      );
    }),
  },
  subroutines: [
    Object.assign({}, runnerTrashInstalledSub, {
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.trash(
              state,
              side,
              coreEid.makeEid(state, eid),
              targets[0],
              { cause: ":subroutine" },
            ),
          ],
          [],
        );
        coreSay.systemMsg(
          state,
          ":corp",
          `uses ${(card as any).title} to trash itself`,
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.trash(
              state,
              ":corp",
              coreEid.makeEid(state, eid),
              card,
              { cause: ":subroutine" },
            ),
          ],
          [],
        );
        coreRuns.encounterEnds(state, side, eid);
      }),
    }),
  ],
};

// Ivik
export const ivik: CardDef = {
  title: "Ivik",
  subroutines: [coreDefHelpers.doNetDamage(2), endTheRun],
  "rez-cost-bonus": req(function* (state: State): Generator<any, any, any> {
    return -subtypeIceCount((state as any).corp, "Code Gate");
  }),
};

// Jaguarundi
export const jaguarundi: CardDef = {
  title: "Jaguarundi",
  "on-encounter": {
    req: req(function* (state: State): Generator<any, any, any> {
      return coreThreat.threatLevel(4, state);
    }),
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      const canSpendClick = corePayment.canPay(
        state,
        ":runner",
        eid,
        card,
        null,
        [corePayment.toC("click", 1)],
      );
      const ability = {
        player: ":runner",
        prompt: "Choose one",
        choices: req(function* (
          state: State,
          side?: Side,
          eid?: EID,
          card?: Card,
          targets?: any[],
        ): Generator<any, any, any> {
          return ["Take 1 tag", canSpendClick ? "Spend [Click]" : null].filter(
            Boolean,
          );
        }),
        "waiting-prompt": true,
        async: true,
        msg: msg(function (s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return tgts[0] === "Take 1 tag"
            ? "give the Runner 1 tag"
            : `force the runner to ${utils.decapitalize(tgts[0])} on encountering it`;
        }),
        effect: req(function* (
          s: State,
          sd: Side,
          e: EID,
          c: Card,
          tgts: any[],
        ): Generator<any, any, any> {
          if (tgts[0] === "Take 1 tag") {
            yield wait_for(
              s,
              [
                { asyncResult: "result" },
                coreTags.gainTags(s, ":runner", e, 1),
              ],
              [],
            );
          } else {
            const result: any = yield wait_for(
              s,
              [
                { asyncResult: "result" },
                corePayment.pay(s, ":runner", coreEid.makeEid(s, e), c, [
                  corePayment.toC("click", 1),
                ]),
              ],
              [],
            );
            coreSay.systemMsg(s, sd, result?.msg ?? "");
            coreEid.effectCompleted(s, ":runner", e);
          }
        }),
      };
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreEngine.resolveAbility(state, side, ability, card, null),
        ],
        [],
      );
    }),
  },
  subroutines: [
    coreDefHelpers.giveTags(1),
    {
      label: "Do 1 core damage if the Runner is tagged",
      "change-in-game-state": {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return utils.isTagged(state);
        }),
      },
      msg: "do 1 core damage",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreDamage.damage(state, side, eid, ":brain", 1, { card }),
          ],
          [],
        );
      }),
    },
  ],
};

// Janus 1.0
export const janus10: CardDef = {
  title: "Janus 1.0",
  subroutines: [
    coreDefHelpers.doBrainDamage(1),
    coreDefHelpers.doBrainDamage(1),
    coreDefHelpers.doBrainDamage(1),
    coreDefHelpers.doBrainDamage(1),
  ],
  "runner-abilities": [bioraidBreak(1, 1)],
};

// Jua
export const jua: CardDef = {
  title: "Jua",
  "on-encounter": {
    msg: "prevent the Runner from installing cards for the rest of the turn",
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      coreFlags.registerTurnFlag(
        state,
        side,
        card,
        ":runner-lock-install",
        () => true,
      );
    }),
  },
  subroutines: [
    {
      label:
        "Choose 2 installed Runner cards, if able. The Runner must add 1 of those to the top of the Stack",
      "change-in-game-state": {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return coreBoard.allInstalled(state, ":runner").length >= 2;
        }),
      },
      async: true,
      prompt: "Choose 2 installed Runner cards",
      choices: {
        card: (c: Card) => coreCard.runner(c) && coreCard.installed(c),
        max: 2,
        all: true,
      },
      msg: msg(function (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ) {
        return `add either ${coreToString.cardStr(state, targets[0])} or ${coreToString.cardStr(state, targets[1])} to the top of the Stack`;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (targets.length === 2) {
          const pickAbility = {
            player: ":runner",
            "waiting-prompt": true,
            prompt: "Choose a card to move to the top of the Stack",
            choices: {
              card: (c: Card) =>
                targets.some((t: Card) => coreCard.sameCard(t, c)),
            },
            effect: req(function* (
              s: State,
              sd: Side,
              e: EID,
              c: Card,
              tgts: any[],
            ): Generator<any, any, any> {
              coreMoving.move(s, ":runner", tgts[0], ":deck", { front: true });
              coreSay.systemMsg(
                s,
                ":runner",
                `selected ${coreToString.cardStr(s, tgts[0])} to move to the top of the Stack`,
              );
            }),
          };
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreEngine.resolveAbility(state, side, pickAbility, card, null),
            ],
            [],
          );
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};

// Kakugo
export const kakugo: CardDef = {
  title: "Kakugo",
  events: [
    {
      event: ":pass-ice",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreCard.sameCard(targets[0]?.ice, card);
      }),
      msg: "do 1 net damage",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreDamage.damage(state, side, eid, ":net", 1, { card }),
          ],
          [],
        );
      }),
    },
  ],
  subroutines: [endTheRun],
};

// Kamali 1.0
export const kamali10: CardDef = (() => {
  function brainDamageUnlessRunnerPays(cost: any[], text: string): any {
    return {
      player: ":runner",
      async: true,
      label: `Do 1 core damage unless the Runner trashes 1 installed ${text}`,
      prompt: "Choose one",
      "waiting-prompt": true,
      choices: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return [
          "Take 1 core damage",
          corePayment.canPay(state, ":runner", eid, card, null, cost)
            ? utils.capitalize(corePayment.costToString(cost) ?? "")
            : null,
        ].filter(Boolean);
      }),
      msg: msg(function (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ) {
        return targets[0] === "Take 1 core damage"
          ? "do 1 core damage"
          : `force the runner to ${utils.decapitalize(targets[0])}`;
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (targets[0] === "Take 1 core damage") {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreDamage.damage(state, side, eid, ":brain", 1, { card }),
            ],
            [],
          );
        } else {
          const result: any = yield wait_for(
            state,
            [
              { asyncResult: "result" },
              corePayment.pay(
                state,
                ":runner",
                coreEid.makeEid(state, eid),
                card,
                cost,
              ),
            ],
            [],
          );
          if (result?.msg)
            coreSay.systemMsg(
              state,
              ":runner",
              `${result.msg} due to ${(card as any).title}`,
            );
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    };
  }
  return {
    title: "Kamali 1.0",
    subroutines: [
      brainDamageUnlessRunnerPays([corePayment.toC("resource", 1)], "resource"),
      brainDamageUnlessRunnerPays(
        [corePayment.toC("hardware", 1)],
        "piece of hardware",
      ),
      brainDamageUnlessRunnerPays([corePayment.toC("program", 1)], "program"),
    ],
    "runner-abilities": [bioraidBreak(1, 1)],
  };
})();

// Karunā
export const karuna: CardDef = {
  title: "Karunā",
  subroutines: [
    {
      label: "Do 2 net damage. The Runner may jack out",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              coreDefHelpers.doNetDamage(2),
              card,
              null,
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              coreRuns.offerJackOut(),
              card,
              null,
            ),
          ],
          [],
        );
      }),
    },
    coreDefHelpers.doNetDamage(2),
  ],
};

// Kessleroid
export const kessleroid: CardDef = {
  title: "Kessleroid",
  "static-abilities": [
    {
      type: ":cannot-be-trashed",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreCard.sameCard(card, targets[0]) && side === ":runner";
      }),
      value: true,
    },
  ],
  subroutines: [endTheRun, endTheRun],
};

// Kitsune
export const kitsune: CardDef = {
  title: "Kitsune",
  subroutines: [
    {
      label: "Force the Runner to access a card in HQ",
      optional: {
        req: req(function* (state: State): Generator<any, any, any> {
          return ((state as any).corp?.hand?.length ?? 0) > 0;
        }),
        prompt: "Force the Runner to access a card in HQ?",
        "yes-ability": {
          async: true,
          prompt: "Choose a card in HQ",
          choices: {
            card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c),
            all: true,
          },
          label: "Force the Runner to breach HQ and access a card",
          msg: msg(function (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ) {
            return `force the Runner to breach HQ and access ${(targets[0] as any)?.title}`;
          }),
          effect: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreRuns.breachServer(
                  state,
                  ":runner",
                  coreEid.makeEid(state, eid),
                  [":hq"],
                  { noRoot: true, accessFirst: targets[0] },
                ),
              ],
              [],
            );
            coreSay.systemMsg(
              state,
              ":corp",
              `uses ${(card as any).title} to trash itself`,
            );
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreMoving.trash(
                  state,
                  ":corp",
                  coreEid.makeEid(state, eid),
                  card,
                  { cause: ":subroutine" },
                ),
              ],
              [],
            );
            coreRuns.encounterEnds(state, side, eid);
          }),
        },
      },
    },
  ],
};

// Klevetnik
export const klevetnik: CardDef = (() => {
  const onRezAbility: any = {
    prompt: "Choose an installed resource",
    "waiting-prompt": true,
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.resource(c),
    },
    async: true,
    msg: msg(function (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ) {
      return `let the Runner gain 2 [Credits] to blank the text box of ${(targets[0] as any)?.title} until the Corp next turn ends`;
    }),
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const t = targets[0];
      const activePlayer = state.activePlayer;
      const duration =
        activePlayer === ":corp"
          ? ":until-next-corp-turn-ends"
          : ":until-corp-turn-ends";
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreGaining.gainCredits(
            state,
            ":runner",
            coreEid.makeEid(state, eid),
            2,
          ),
        ],
        [],
      );
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ":disable-card",
        req: req(function* (
          s: State,
          sd: Side,
          e: EID,
          c: Card,
          tgts: any[],
        ): Generator<any, any, any> {
          return coreCard.sameCard(t, tgts[0]);
        }),
        duration,
        value: true,
      });
      coreEid.effectCompleted(state, side, eid);
    }),
  };
  return {
    title: "Klevetnik",
    subroutines: [endTheRun],
    "on-rez": {
      optional: {
        prompt: "Let the Runner gain 2 [Credits]?",
        "waiting-prompt": true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          return (
            !!(state as any).run &&
            forms.thisServer(state, card) &&
            coreBoard
              .allInstalled(state, ":runner")
              .some((c: Card) => coreCard.resource(c))
          );
        }),
        "yes-ability": {
          async: true,
          effect: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
          ): Generator<any, any, any> {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreEngine.resolveAbility(
                  state,
                  side,
                  onRezAbility,
                  card,
                  null,
                ),
              ],
              [],
            );
          }),
        },
        "no-ability": {
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
          ): Generator<any, any, any> {
            coreSay.systemMsg(
              state,
              ":corp",
              `declines to use ${(card as any).title}`,
            );
          }),
        },
      },
    },
  };
})();

// Knowledge Seeker
export const knowledgeSeeker: CardDef = {
  title: "Knowledge Seeker",
  events: [
    {
      event: ":end-of-encounter",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          coreCard.sameCard(targets[0]?.ice, card) &&
          coreCard.getCounters(card, ":virus") >= 3
        );
      }),
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      async: true,
      msg: "purge virus counters and derez itself",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreRezzing.derez(state, side, coreEid.makeEid(state, eid), card),
          ],
          [],
        );
        coreSay.playSfx(state, side, "virus-purge");
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreEffects.purge(state, side, eid)],
          [],
        );
      }),
    },
  ],
  subroutines: [
    {
      label: "Place 1 virus counter on this card",
      msg: "place 1 virus counter on itself",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreProps.addCounter(state, side, eid, card, ":virus", 1, null),
          ],
          [],
        );
      }),
      async: true,
    },
    {
      label: "Rearrange the top 4 cards of R&D",
      async: true,
      "waiting-prompt": true,
      "change-in-game-state": {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return ((state as any).corp?.deck?.length ?? 0) > 0;
        }),
      },
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const top4 = ((state as any).corp?.deck ?? []).slice(0, 4);
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              coreIce.reorderChoice(":corp", top4),
              card,
              targets,
            ),
          ],
          [],
        );
      }),
    },
    endTheRun,
  ],
};

// Komainu
export const komainu: CardDef = {
  title: "Komainu",
  "on-encounter": {
    interactive: req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      const subCount = (state as any).runner?.hand?.length ?? 0;
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ":additional-subroutines",
        req: req(function* (
          s: State,
          sd: Side,
          e: EID,
          c: Card,
          tgts: any[],
        ): Generator<any, any, any> {
          return coreCard.sameCard(card, tgts[0]);
        }),
        duration: ":end-of-run",
        value: req(function* (
          state: State,
          side?: Side,
          eid?: EID,
          card?: Card,
          targets?: any[],
        ): Generator<any, any, any> {
          return {
            subroutines: Array(subCount).fill(coreDefHelpers.doNetDamage(1)),
          };
        }),
      });
    }),
  },
};

// Konjin
export const konjin: CardDef = {
  title: "Konjin",
  "on-encounter": doPsi({
    async: true,
    label: "Force the runner to encounter another ice",
    prompt: "Choose a piece of ice",
    choices: {
      card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c),
      "not-self": true,
    },
    msg: msg(function (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ) {
      return `force the Runner to encounter ${coreToString.cardStr(state, targets[0])}`;
    }),
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreRuns.forceIceEncounter(state, side, eid, targets[0]),
        ],
        [],
      );
    }),
  }),
};

// Lab Dog
export const labDog: CardDef = {
  title: "Lab Dog",
  subroutines: [
    {
      label: "Force the Runner to trash an installed piece of hardware",
      player: ":runner",
      async: true,
      msg: msg(function (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ) {
        return `force the Runner to trash ${(targets[0] as any)?.title} and trash itself`;
      }),
      prompt: "Choose a piece of hardware to trash",
      choices: {
        card: (c: Card) => coreCard.installed(c) && coreCard.hardware(c),
      },
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.trash(
              state,
              side,
              coreEid.makeEid(state, eid),
              targets[0],
              { cause: ":subroutine" },
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.trash(
              state,
              ":corp",
              coreEid.makeEid(state, eid),
              card,
              { cause: ":subroutine" },
            ),
          ],
          [],
        );
        coreRuns.encounterEnds(state, side, eid);
      }),
    },
  ],
};

// Lamplighter
export const lamplighter: CardDef = (() => {
  const trashSelf: any = {
    async: true,
    interactive: req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    automatic: ":pre-draw-cards",
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const context = targets[0];
      let targetZone =
        context?.card?.previousZone?.[1] ?? context?.card?.previousZone?.[0];
      if (targetZone === ":deck") targetZone = ":rd";
      else if (targetZone === ":hand") targetZone = ":hq";
      else if (targetZone === ":discard") targetZone = ":archives";
      return targetZone === (coreCard.getZone(card) as string[])?.[1];
    }),
    msg: "trash itself",
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreMoving.trash(state, ":corp", eid, card, {
            causeCard: card,
            cause: ":effect",
          }),
        ],
        [],
      );
    }),
  };
  return {
    title: "Lamplighter",
    subroutines: [tagOrPayCredits(3), endTheRunIfTagged],
    events: [
      Object.assign({}, trashSelf, { event: ":agenda-scored" }),
      Object.assign({}, trashSelf, { event: ":agenda-stolen" }),
    ],
  };
})();

// Lancelot
export const lancelot: CardDef = {
  title: "Lancelot",
  ...grailIce(trashProgramSub),
};
