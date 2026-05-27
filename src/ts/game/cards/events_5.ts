//
/**
 * Event Cards - Runner and Corp event card definitions
 * Ported from Clojure cards/events.clj to TypeScript
 *
 * This file contains ~224 card definitions with their abilities and events.
 * Each card has properties like makes-run, on-play, events, static-abilities, etc.
 */

import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreAgendas from "../core/agendas";
import * as coreBadPublicity from "../core/bad_publicity";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCharge from "../core/charge";
import * as coreCheckpoint from "../core/checkpoint";
import * as coreChooseOne from "../core/choose_one";
import * as coreCostFns from "../core/cost_fns";
import * as coreDamage from "../core/damage";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEid from "../core/eid";
import * as coreEngine from "../core/engine";
import * as coreEvents from "../core/events";
import * as coreExpose from "../core/expose";
import * as coreFinding from "../core/finding";
import * as coreFlags from "../core/flags";
import * as coreGaining from "../core/gaining";
import * as coreHandSize from "../core/hand_size";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreIdentities from "../core/identities";
import * as coreInstalling from "../core/installing";
import * as coreLink from "../core/link";
import * as coreMark from "../core/mark";
import * as coreMemory from "../core/memory";
import * as coreMoving from "../core/moving";
import * as corePayment from "../core/payment";
import * as corePlayInstants from "../core/play_instants";
import * as corePrevention from "../core/prevention";
import * as corePrompts from "../core/prompts";
import * as coreProps from "../core/props";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSabotage from "../core/sabotage";
import * as coreSay from "../core/say";
import * as coreServers from "../core/servers";
import * as coreSetAside from "../core/set_aside";
import * as coreShuffling from "../core/shuffling";
import * as coreTags from "../core/tags";
import * as coreThreat from "../core/threat";
import * as coreToString from "../core/to_string";
import * as coreToasts from "../core/toasts";
import * as coreUpdate from "../core/update";
import * as coreVirus from "../core/virus";
import * as utils from "../utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";

// Import defcard helper - each card is a card definition object
import { defcard } from "../core/def_helpers";
import {
  runAnyServerAbility,
  runRemoteServerAbility,
  runServerAbility,
  runServerFromChoicesAbility,
} from "./events_1";
import * as coreUtils from "../utils";

// __cardScopeShim: ambient placeholders for legacy patterns.
const state: any = undefined as any;
const target: any = undefined as any;
const asyncResult: any = undefined as any;

// Stub helpers (to be ported from clj cards/*.clj)
function cutlery(_subtype: string): any {
  return {};
}

export const intoTheDepthsAll = [
  {
    msg: "gain 4 [Credits]",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(eid, 4);
      },
    ),
  },
  {
    msg: "install a program from the stack",
    async: true,
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return !coreInstalling.installLocked(state, side);
    }),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          {
            prompt: "Choose a program to install",
            msg: msg(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) =>
                msg === "Done"
                  ? "shuffle the stack"
                  : `install ${msg} from the stack`,
            ),
            choices: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return [
                ...(
                  (state as any).runner?.deck?.filter(
                    (c: Card) =>
                      coreCard.program(c) &&
                      coreInstalling.runnerCanPayAndInstall(
                        state,
                        side,
                        { ...eid, source: card },
                        c,
                      ),
                  ) ?? []
                )
                  .sort((a: Card, b: Card) =>
                    (a.title || "").localeCompare(b.title || ""),
                  )
                  .map((c: Card) => c.title),
                "Done",
              ];
            }),
            async: true,
            effect: effect(
              coreEngine.triggerEvent(state, side, "searched-stack"),
              coreShuffling.shuffle(state, side, "deck"),
              msg === "Done"
                ? coreEid.effectCompleted(state, side, eid)
                : coreInstalling.runnerInstall(
                    { ...eid, source: card, sourceType: "runner-install" },
                    msg,
                    { msgKeys: { installSource: card, displayOrigin: true } },
                  ),
            ),
          },
          card,
          null,
        );
      },
    ),
  },
  {
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          state,
          side,
          coreCharge.chargeAbility(state, side),
          card,
          null,
        );
      },
    ),
    msg: "charge a card",
  },
];

export function intoTheDepthsChoice(abis: any[], rem: number): any {
  return {
    prompt: `Choose an ability to resolve (${rem} remaining)`,
    waitingPrompt: true,
    choices: abis.map(
      (a: any) => a.msg.charAt(0).toUpperCase() + a.msg.slice(1),
    ),
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const chosen = abis.find(
        (a: any) => msg === a.msg.charAt(0).toUpperCase() + a.msg.slice(1),
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreEngine.resolveAbility(state, side, chosen, card, null),
        ],
        [],
      );
      if (rem > 1) {
        yield continue_ability(
          state,
          side,
          intoTheDepthsChoice(
            abis.filter((a: any) => a !== chosen),
            rem - 1,
          ),
          card,
          null,
        );
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Isolation
export const isolation: CardDef = {
  title: "Isolation",
  onPlay: {
    additionalCost: [corePayment.toC("resource", 1)],
    msg: "gain 7 [Credits]",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(eid, 7);
      },
    ),
  },
};

// Itinerant Protesters
export const itinerantProtesters: CardDef = {
  title: "Itinerant Protesters",
  onPlay: {
    msg: "reduce the Corp's maximum hand size by 1 for each bad publicity",
  },
  staticAbilities: [
    coreHandSize.corpHandSizePlus(
      req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return -(state as any).corp?.badPublicity?.additional || 0;
      }),
    ),
  ],
};

// Jailbreak
export const jailbreak: CardDef = {
  title: "Jailbreak",
  makesRun: true,
  onPlay: runServerFromChoicesAbility(["HQ", "R&D"]),
  events: [
    {
      event: "successful-run",
      automatic: "draw-cards",
      silent: true,
      async: true,
      msg: "draw 1 card",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return ["hq", "rd"].includes(ctx.server) && forms.thisCardRun;
      }),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx: any =
            ((targets as any[])?.[0] as any)?.context ??
            (targets as any[])?.[0];
          coreEngine.registerEvents(card, [
            coreDefHelpers.breachAccessBonus(ctx.server, 1, {
              duration: "end-of-run",
            }),
          ]);
          coreDrawing.draw(eid, 1);
        },
      ),
    },
  ],
};

// Joy Ride
export const joyRide: CardDef = {
  title: "Joy Ride",
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          coreServers.zonesToSortedNames(
            coreRuns.getRunnableZones(state, side, eid, card, null),
          ) || []
        ).includes("rd");
      }),
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
          coreRuns.makeRun(state, side, eid, "rd", card),
        ],
        [],
      );
    }),
  },
  events: [
    {
      event: "successful-run",
      automatic: "draw-cards",
      silent: true,
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return ctx.server === "rd" && forms.thisCardRun;
      }),
      msg: "draw 5 cards",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreDrawing.draw(eid, 5);
        },
      ),
    },
  ],
};

// Katorga Breakout
export const katorgaBreakout: CardDef = {
  title: "Katorga Breakout",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: "successful-run",
      automatic: "draw-cards",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          forms.thisCardRun && !coreCard.zoneLocked(state, "runner", "discard")
        );
      }),
      prompt: "Choose 1 card to add to the grip",
      waitingPrompt: true,
      choices: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return corePrompts.cancellable(
          (state as any).runner?.discard || [],
          "sorted",
        );
      }),
      msg: msg(
        "add ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
        " to the grip",
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreMoving.move(state, side, msg, "hand");
        },
      ),
    },
  ],
};

// Khusyuk
export const khusyuk: CardDef = {
  title: "Khusyuk",
  makesRun: true,
  onPlay: runServerAbility("rd"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "rd",
      thisCardRun: true,
      mandatory: true,
      ability: {
        async: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const installCost = khusyukSelectInstallCost(state);
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreEngine.resolveAbility(state, side, installCost, card, null),
            ],
            [],
          );
          const revealed =
            (state as any).corp?.deck?.slice(0, asyncResult?.[1] || 0) || [];
          coreSay.systemMsg(
            state,
            "runner",
            `uses ${card.title} to choose an install cost of ${asyncResult?.[0]} [Credit] and reveals ${revealed.map((c: Card) => c.title).join(", ")} from the top of R&D (top->bottom)`,
          );
          if (revealed.length > 0 && !coreAccess.getOnlyCardToAccess(state)) {
            yield wait_for(
              state,
              [{ asyncResult: "result" }, coreRevealing.reveal(state, side, eid, revealed)],
              [],
            );
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreEngine.resolveAbility(
                  state,
                  side,
                  khusyukAccessRevealed(revealed),
                  card,
                  null,
                ),
              ],
              [],
            );
          }
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreShuffling.shuffle(state, "corp", "deck"),
            ],
            [],
          );
          coreSay.systemMsg(state, "runner", "shuffles R&D");
          return coreEid.effectCompleted(state, side, eid);
        }),
      },
    },
  ],
};

function khusyukSelectInstallCost(state: State): any {
  return {
    async: true,
    prompt: "Choose an install cost from among your installed cards",
    choices: ["1 [Credit]"],
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEid.completeWithResult(eid, [1, 1]);
      },
    ),
  };
}

function khusyukAccessRevealed(revealed: Card[]): any {
  return {
    async: true,
    prompt: "Choose a card to access",
    waitingPrompt: true,
    notDistinct: true,
    choices: revealed.map((c: Card) => c.title),
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const ctx: any =
        ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
      return ctx.maxAccess !== 0;
    }),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target = revealed.find((c: Card) => c.title === targets?.[0]);
        coreAccess.accessCard(state, side, eid, target ?? null);
      },
    ),
  };
}

// Knifed
export const knifed: CardDef = {
  title: "Knifed",
  ...cutlery("Barrier"),
};

// Kompromat
export const kompromat: CardDef = {
  title: "Kompromat",
  makesRun: true,
  onPlay: {
    async: true,
    rfgInsteadOfTrashing: true,
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return kompromatIcedServers(state, side, eid, card).length > 0;
      }),
    },
    prompt: "Choose an iced server",
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return kompromatIcedServers(state, side, eid, card);
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
          coreRuns.makeRun(state, side, eid, msg, card),
        ],
        [],
      );
    }),
  },
  events: [
    {
      event: "run-ends",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return forms.thisCardRun && ctx.successful;
      }),
      async: true,
      interactive: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        const validIce = (coreBoard.allInstalled(state, "corp") || []).filter(
          (c: Card) =>
            coreCard.ice(c) &&
            coreCard.rezzed(c) &&
            ctx.server === (coreCard.getZone(c) as string[])[1],
        );
        if (validIce.length > 0) {
          yield continue_ability(
            state,
            side,
            {
              prompt:
                "Derez an ice? (if you click done, you take a bad publicity)",
              player: "corp",
              waitingPrompt: true,
              choices: {
                req: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  return validIce.some((c: Card) => utils.sameCard(c, msg));
                }),
              },
              cancel: {
                displaySide: "runner",
                msg: "give the Corp 1 bad publicity",
                async: true,
                effect: effect(
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) => {
                    coreBadPublicity.gainBadPublicity(state, "runner", eid, 1);
                  },
                ),
              },
              msg: msg(
                "derez ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => coreToString.cardStr(state, msg),
              ),
              displaySide: "corp",
              async: true,
              effect: effect(
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => {
                  coreRezzing.derez(state, side, eid, msg, { noMsg: true });
                },
              ),
            },
            card,
            null,
          );
        } else {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreBadPublicity.gainBadPublicity(state, "runner", eid, 1),
            ],
            [],
          );
        }
      }),
    },
  ],
};

function kompromatIcedServers(
  state: State,
  side: Side,
  eid: EID,
  card: Card,
): string[] {
  return (
    coreServers.zonesToSortedNames(
      coreRuns.getRunnableZones(state, side, eid, card, null),
    ) || []
  ).filter((s: string) => {
    const server = (state as any).corp?.servers?.[
      coreBoard.serverToZone(state, s)?.[1]
    ];
    return server?.ices?.length > 0;
  });
}

// Kraken
export const kraken: CardDef = {
  title: "Kraken",
  onPlay: {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return (state as any).runner?.register?.stoleAgenda;
    }),
    prompt: "Choose a server",
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (coreBoard.allInstalled(state, "corp") || []).some((c: Card) =>
          coreCard.ice(c),
        );
      }),
    },
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return coreServers.zonesToSortedNames(coreBoard.getZones(state));
    }),
    msg: msg(
      "force the Corp to trash a piece of ice protecting ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          {
            player: "corp",
            async: true,
            prompt: msg(
              "Choose a piece of ice in ",
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => msg,
              " to trash",
            ),
            choices: {
              card: (c: Card) =>
                coreCard.ice(c) &&
                coreBoard.serverToZone(state, msg)?.[1] ===
                  (coreCard.getZone(c) as string[])[1],
            },
            effect: effect(
              coreSay.systemMsg(`trashes ${coreToString.cardStr(state, msg)}`),
              coreMoving.trash("corp", eid, msg, { causeCard: card }),
            ),
          },
          card,
          null,
        );
      },
    ),
  },
};

// Labor Rights
export const laborRights: CardDef = {
  title: "Labor Rights",
  onPlay: {
    rfgInsteadOfTrashing: true,
    async: true,
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          (state as any).runner?.deck?.length > 0 ||
          ((state as any).runner?.discard?.length > 0 &&
            !coreCard.zoneLocked(state, "runner", "discard"))
        );
      }),
    },
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const millCount = Math.min(3, (state as any).runner?.deck?.length || 0);
      const topNMsg = (state as any).runner?.deck?.slice(0, millCount) || [];
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreMoving.mill(state, "runner", "runner", millCount),
        ],
        [],
      );
      if (topNMsg.length > 0) {
        coreSay.systemMsg(
          state,
          "runner",
          `trashes ${topNMsg.map((c: Card) => c.title).join(", ")} from the top of the stack`,
        );
      } else {
        coreSay.systemMsg(
          state,
          "runner",
          "trashes no cards from the top of the stack",
        );
      }
      const heapCount = Math.min(
        3,
        (state as any).runner?.discard?.length || 0,
      );
      yield continue_ability(
        state,
        side,
        !coreCard.zoneLocked(state, "runner", "discard")
          ? {
              prompt: msg(
                "Choose ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => coreUtils.quantify(heapCount, "card"),
                " to shuffle into the stack",
              ),
              showDiscard: true,
              async: true,
              choices: {
                max: heapCount,
                all: true,
                "not-self": true,
                card: (c: Card) => coreCard.runner(c) && coreCard.inDiscard(c),
              },
              effect: effect(
                function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  for (const c of targets || []) {
                    yield wait_for(
                      state,
                      [
                        { asyncResult: "result" },
                        coreMoving.move(state, side, c, "deck"),
                      ],
                      [],
                    );
                  }
                },
                coreSay.systemMsg(
                  state,
                  "runner",
                  `shuffles ${targets?.map((c: Card) => c.title).join(", ")} from the heap into the stack, and draws 1 card`,
                ),
                coreShuffling.shuffle(state, "runner", "deck"),
                coreDrawing.draw(state, "runner", eid, 1),
              ),
            }
          : {
              async: true,
              effect: effect(
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => {
                  coreSay.systemMsg(
                    state,
                    "runner",
                    "shuffles the stack and draws 1 card",
                  );
                  coreShuffling.shuffle(state, "runner", "deck");
                  coreDrawing.draw(state, "runner", eid, 1);
                },
              ),
            },
        card,
        null,
      );
    }),
  },
};

// Lawyer Up
export const lawyerUp: CardDef = {
  title: "Lawyer Up",
  onPlay: {
    msg: "remove 2 tags and draw 3 cards",
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return utils.isTagged(state) || (state as any).runner?.deck?.length > 0;
      }),
    },
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreTags.loseTags(state, side, 2)],
        [],
      );
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreDrawing.draw(state, side, eid, 3)],
        [],
      );
    }),
  },
};

// Lean and Mean
export const leanAndMean: CardDef = {
  title: "Lean and Mean",
  makesRun: true,
  onPlay: {
    prompt: "Choose a server",
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          coreServers.zonesToSortedNames(
            coreRuns.getRunnableZones(state, side, eid, card, null),
          ).length > 0
        );
      }),
    },
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return coreServers.zonesToSortedNames(
        coreRuns.getRunnableZones(state, side, eid, card, null),
      );
    }),
    msg: msg(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      let result = `make a run on ${msg}`;
      if (
        (coreBoard.allActiveInstalled(state, "runner") || []).filter(
          (c: Card) => coreCard.program(c),
        ).length <= 3
      ) {
        result += ", giving +2 strength to all icebreakers";
      }
      return result;
    }),
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (
        (coreBoard.allActiveInstalled(state, "runner") || []).filter(
          (c: Card) => coreCard.program(c),
        ).length <= 3
      ) {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreIce.pumpAllIcebreakers(state, side, 2, "end-of-run"),
          ],
          [],
        );
      }
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreRuns.makeRun(state, side, eid, msg, card),
        ],
        [],
      );
    }),
  },
};

// Leave No Trace
export const leaveNoTrace: CardDef = {
  title: "Leave No Trace",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: "run-ends",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const rezzedIce = (coreEvents.runEvents(targets[0], "rez") || [])
          .map((entry: unknown) => {
            const e = entry as [any, any];
            const cardData = e[0]?.card;
            return cardData && coreCard.ice(cardData)
              ? coreCard.getCard(state, cardData)
              : null;
          })
          .filter((c: Card | null): c is Card => !!c && coreCard.rezzed(c));
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreRezzing.derez(state, "runner", eid, rezzedIce),
          ],
          [],
        );
      }),
    },
  ],
};

// Legwork
export const legwork: CardDef = {
  title: "Legwork",
  makesRun: true,
  onPlay: runServerAbility("hq"),
  events: [
    {
      event: "successful-run",
      silent: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return ctx.server === "hq" && forms.thisCardRun;
      }),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreEngine.registerEvents(card, [
            coreDefHelpers.breachAccessBonus("hq", 2, {
              duration: "end-of-run",
            }),
          ]);
        },
      ),
    },
  ],
};

// Leverage
export const leverage: CardDef = {
  title: "Leverage",
  onPlay: {
    optional: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (state as any).runner?.register?.successfulRun?.includes("hq");
      }),
      player: "corp",
      prompt: "Take 2 bad publicity?",
      waitingPrompt: true,
      yesAbility: {
        player: "corp",
        msg: "takes 2 bad publicity",
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreBadPublicity.gainBadPublicity("corp", 2);
          },
        ),
      },
      noAbility: {
        player: "runner",
        msg: "is immune to damage until the beginning of the Runner's next turn",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx: any =
            ((targets as any[])?.[0] as any)?.context ??
            (targets as any[])?.[0];
          coreEffects.registerLingeringEffect(state, side, card, {
            type: "prevention",
            duration: "until-runner-turn-begins",
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return side === "runner";
            }),
            value: {
              prevents: "damage",
              type: "floating",
              maxUses: 1,
              card: card,
              mandatory: true,
              ability: {
                async: true,
                card: card,
                condition: "floating",
                req: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  return corePrevention.preventable(ctx);
                }),
                msg: msg(
                  "prevent ",
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) => ctx.remaining,
                  " ",
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) => coreDamage.damageName("damage"),
                  " damage",
                ),
                effect: effect(
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) => {
                    corePrevention.preventDamage(state, side, eid, "all");
                  },
                ),
              },
            },
          });
        }),
      },
    },
  },
};

// Levy AR Lab Access
export const levyArLabAccess: CardDef = {
  title: "Levy AR Lab Access",
  onPlay: {
    msg: msg(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return coreCard.zoneLocked(state, "runner", "discard")
        ? "shuffle the grip into the stack and draw 5 cards"
        : "shuffle the grip and heap into the stack and draw 5 cards";
    }),
    rfgInsteadOfTrashing: true,
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreShuffling.shuffleIntoDeck("hand", "discard");
        coreDrawing.draw(eid, 5);
      },
    ),
  },
};

// Lie Low
export const lieLow: CardDef = {
  title: "Lie Low",
  onPlay: coreChooseOne.chooseOneHelper(
    {
      onChangeGameState: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (
            (state as any).runner?.deck?.length > 0 || utils.isTagged(state)
          );
        }),
      },
    },
    [
      {
        option: "Draw 4 cards",
        ability: {
          msg: "draw 4 cards",
          async: true,
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              req(function* (
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
                    coreDrawing.draw(state, side, eid, 4),
                  ],
                  [],
                );
              });
            },
          ),
        },
      },
      {
        option: "Remove up to 2 tags",
        ability: coreChooseOne.chooseOneHelper([
          {
            option: "Remove 0 tags",
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return (state as any).runner?.tags >= 0;
            }),
            ability: {
              msg: "remove 0 tags",
              async: true,
              effect: effect(
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => {
                  req(function* (
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
                        coreTags.loseTags(state, side, eid, 0),
                      ],
                      [],
                    );
                  });
                },
              ),
            },
          },
          {
            option: "Remove 1 tag",
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return (state as any).runner?.tags >= 1;
            }),
            ability: {
              msg: "remove 1 tag",
              async: true,
              effect: effect(
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => {
                  req(function* (
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
                        coreTags.loseTags(state, side, eid, 1),
                      ],
                      [],
                    );
                  });
                },
              ),
            },
          },
          {
            option: "Remove 2 tags",
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return (state as any).runner?.tags >= 2;
            }),
            ability: {
              msg: "remove 2 tags",
              async: true,
              effect: effect(
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => {
                  req(function* (
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
                        coreTags.loseTags(state, side, eid, 2),
                      ],
                      [],
                    );
                  });
                },
              ),
            },
          },
        ]),
      },
    ],
  ),
};

// Lucky Find
export const luckyFind: CardDef = {
  title: "Lucky Find",
  onPlay: {
    msg: "gain 9 [Credits]",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(eid, 9);
      },
    ),
  },
};

// Mad Dash
export const madDash: CardDef = {
  title: "Mad Dash",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: "run-ends",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return forms.thisCardRun;
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        if (ctx.didSteal) {
          coreSay.systemMsg(
            state,
            "runner",
            `adds Mad Dash to [their] score area as an agenda worth 1 agenda point`,
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.asAgenda(
                state,
                "runner",
                coreCard.getCard(state, card),
                1,
              ),
            ],
            [],
          );
          return coreEid.effectCompleted(state, side, eid);
        } else {
          coreSay.systemMsg(
            state,
            "runner",
            "suffers 1 meat damage from Mad Dash",
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreDamage.damage(state, side, eid, "meat", { card: card }),
            ],
            [],
          );
        }
      }),
    },
  ],
};

// Maintenance Access
export const maintenanceAccess: CardDef = {
  title: "Maintenance Access",
  makesRun: true,
  events: [
    {
      event: "pre-approach-server",
      unregisterOnceResolved: true,
      interactive: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      msg: "change the attacked server to HQ",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return ctx.server?.[0] === "archives";
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const s = coreUpdate.updateIn(state, ["run", "server"], () => ["hq"]);
        coreSay.systemMsg(state, side, "change the attacked server to HQ");
      }),
    },
  ],
  onPlay: runServerAbility("archives"),
};

// Making an Entrance
export const makingAnEntrance: CardDef = {
  title: "Making an Entrance",
  onPlay: {
    msg: "look at and trash or rearrange the top 6 cards of the stack",
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (state as any).runner?.deck?.length > 0;
      }),
    },
    async: true,
    waitingPrompt: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          makingAnEntranceTrash((state as any).runner?.deck?.slice(0, 6) || []),
          card,
          null,
        );
      },
    ),
  },
};

function makingAnEntranceTrash(cards: Card[]): any {
  return {
    prompt: "Choose a card to trash",
    choices: [...cards.map((c: Card) => c.title), "Done"],
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (msg === "Done") {
        if (cards.length > 0) {
          yield continue_ability(
            state,
            side,
            coreDefHelpers.reorderChoice(
              "runner",
              "corp",
              cards,
              [],
              cards.length,
              cards,
            ),
            card,
            null,
          );
        }
      } else {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.trash(state, side, msg, {
              unpreventable: true,
              causeCard: card,
            }),
          ],
          [],
        );
        coreSay.systemMsg(state, side, `trashes ${msg.title}`);
        const remaining = cards.filter((c: Card) => !utils.sameCard(c, msg));
        if (remaining.length > 0) {
          yield continue_ability(
            state,
            side,
            makingAnEntranceTrash(remaining),
            card,
            null,
          );
        }
      }
    }),
  };
}

// Marathon
export const marathon: CardDef = {
  title: "Marathon",
  makesRun: true,
  onPlay: runRemoteServerAbility(),
  events: [
    {
      event: "run-ends",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return forms.thisCardRun;
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        const blockedServer = (ctx.server || [])[0];
        coreEffects.registerLingeringEffect(state, side, card, {
          type: "cannot-run-on-server",
          req: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            return true;
          }),
          value: [blockedServer],
          duration: "end-of-turn",
        });
        if (ctx.successful) {
          coreSay.systemMsg(
            state,
            "runner",
            `gains [Click] and adds Marathon to [their] grip`,
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreGaining.gainClicks(state, "runner", 1),
            ],
            [],
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.move(state, "runner", card, "hand"),
            ],
            [],
          );
          coreEngine.unregisterEvents(state, side, card);
        }
      }),
    },
  ],
};

// Mars for Martians
export const marsForMartians: CardDef = {
  title: "Mars for Martians",
  onPlay: {
    msg: msg(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const clanCount = (
        coreBoard.allActiveInstalled(state, "runner") || []
      ).filter(
        (c: Card) => coreCard.hasSubtype(c, "Clan") && coreCard.resource(c),
      ).length;
      return `draw ${coreUtils.quantify(clanCount, "card")} and gain ${coreTags.countTags(state)} [Credits]`;
    }),
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const clanCount = (
        coreBoard.allActiveInstalled(state, "runner") || []
      ).filter(
        (c: Card) => coreCard.hasSubtype(c, "Clan") && coreCard.resource(c),
      ).length;
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreDrawing.draw(state, side, clanCount)],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreGaining.gainCredits(state, side, eid, coreTags.countTags(state)),
        ],
        [],
      );
    }),
  },
};

// Mass Install
export const massInstall: CardDef = {
  title: "Mass Install",
  onPlay: {
    async: true,
    onChangeGameState: {
      silent: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          (coreDefHelpers.allCardsInHandStar(state, "runner") || []).length > 0
        );
      }),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(massInstallHelper(0), card, null);
      },
    ),
  },
};

function massInstallHelper(n: number): any {
  if (n < 3) {
    return {
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (coreDefHelpers.allCardsInHandStar(state, "runner") || []).some(
          (c: Card) =>
            coreCard.program(c) &&
            coreInstalling.runnerCanPayAndInstall(
              state,
              side,
              { ...eid, source: card, sourceType: "runner-install" },
              c,
            ),
        );
      }),
      prompt: "Choose a program to install",
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const t = targets[0];
          return (
            coreCard.program(t) &&
            coreCard.inHandStar(state, t) &&
            coreInstalling.runnerCanPayAndInstall(
              state,
              side,
              { ...eid, source: card, sourceType: "runner-install" },
              t,
            )
          );
        }),
      },
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreInstalling.runnerInstall(state, side, msg, {
            msgKeys: { installSource: card, displayOrigin: true },
          });
          continue_ability(state, side, massInstallHelper(n + 1), card, null);
        },
      ),
    };
  }
  return null;
}

// Meeting of Minds
export const meetingOfMinds: CardDef = {
  title: "Meeting of Minds",
  onPlay: {
    prompt: "Choose one",
    async: true,
    waitingPrompt: true,
    choices: ["Connection", "Virtual"],
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          {
            optional: {
              prompt: msg(
                "Search the stack for a ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => msg.toLowerCase(),
                " resource?",
              ),
              yesAbility: {
                async: true,
                msg: msg(
                  "search the stack for a ",
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) => msg.toLowerCase(),
                  " resource",
                ),
                effect: effect(
                  continue_ability(meetingOfMindsTutor(msg), card, null),
                ),
              },
              noAbility: {
                async: true,
                effect: effect(
                  continue_ability(meetingOfMindsCreditGain(msg), card, null),
                ),
              },
            },
          },
          card,
          null,
        );
      },
    ),
  },
};

function meetingOfMindsTutor(type: string): any {
  return {
    prompt: msg(
      "Choose a ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        msg.toLowerCase(),
      " resource",
    ),
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const deck = (state as any).runner?.deck || [];
      return corePrompts.cancellable(
        deck.filter((c: Card) => coreCard.hasSubtype(c, type)),
        "sorted",
      );
    }),
    cancel: {
      async: true,
      msg: "shuffle the stack",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreEngine.triggerEvent(state, side, "searched-stack");
          coreShuffling.shuffle(state, side, "deck");
          continue_ability(
            state,
            side,
            meetingOfMindsCreditGain(type),
            card,
            null,
          );
        },
      ),
    },
    msg: msg(
      "add ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
      " from the stack to the grip and shuffle the stack",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEngine.triggerEvent("searched-stack");
        coreMoving.move(state, side, msg, "hand");
        coreShuffling.shuffle(state, side, "deck");
        continue_ability(meetingOfMindsCreditGain(type), card, null);
      },
    ),
  };
}

function meetingOfMindsCreditGain(type: string): any {
  return {
    choices: {
      max: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (state as any).runner?.hand?.length || 0;
      }),
      card: (c: Card) =>
        coreCard.runner(c) &&
        coreCard.inHand(c) &&
        coreCard.hasSubtype(c, type),
    },
    prompt: msg(
      "Choose any number of ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        msg.toLowerCase(),
      " resources to reveal",
    ),
    msg: msg(
      "reveal ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (targets || []).map((c: Card) => c.title).join(", "),
      " from the Grip and gain ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets?.length || 0,
      " [Credits]",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreRevealing.reveal(state, side, targets || []);
        coreGaining.gainCredits(state, side, eid, (targets || []).length);
      },
    ),
  };
}

// Mining Accident
export const miningAccident: CardDef = {
  title: "Mining Accident",
  onPlay: {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const reg = (state as any).runner?.register;
      return (
        reg?.successfulRun?.includes("hq") ||
        reg?.successfulRun?.includes("rd") ||
        reg?.successfulRun?.includes("archives")
      );
    }),
    rfgInsteadOfTrashing: true,
    msg: msg(
      "force the corp to ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
    ),
    waitingPrompt: true,
    player: "corp",
    prompt: "Choose one",
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const choices: string[] = [];
      if (
        corePayment.canPay(state, "corp", eid, card, null, [
          corePayment.toC("credit", 5),
        ])
      ) {
        choices.push("Pay 5 [Credits]");
      }
      choices.push("Take 1 bad publicity");
      return choices;
    }),
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (msg === "Pay 5 [Credits]") {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.pay(
              state,
              "corp",
              coreEid.makeEid(state, eid),
              card,
              corePayment.toC("credit", 5),
            ),
          ],
          [],
        );
        coreSay.systemMsg(state, "corp", asyncResult?.msg);
        return coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreBadPublicity.gainBadPublicity(state, "corp", 1),
          ],
          [],
        );
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

// Möbius
export const mobius: CardDef = {
  title: "Möbius",
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          coreServers.zonesToSortedNames(
            coreRuns.getRunnableZones(state, side, eid, card, null),
          ) || []
        ).includes("rd");
      }),
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
        [{ asyncResult: "result" }, coreRuns.makeRun(state, side, eid, "rd", card)],
        [],
      );
      const c = coreCard.getCard(state, card);
      if (c?.special?.runAgain) {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreRuns.makeRun(state, side, eid, "rd", card),
          ],
          [],
        );
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
  events: [
    {
      event: "successful-run",
      automatic: "gain-credits",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        const c = coreCard.getCard(state, card);
        return c?.special?.runAgain && ctx.server === "rd";
      }),
      msg: "gain 4 [Credits]",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits(eid, 4);
        },
      ),
    },
    {
      event: "run-ends",
      interactive: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx: any =
            ((targets as any[])?.[0] as any)?.context ??
            (targets as any[])?.[0];
          const c = coreCard.getCard(state, card);
          return ctx.successful && !c?.special?.runAgain && ctx.server === "rd";
        }),
        prompt: "Make another run on R&D?",
        yesAbility: {
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              corePrompts.clearWaitPrompt("corp");
              coreUpdate.updateIn(card, ["special", "runAgain"], () => true);
            },
          ),
        },
      },
    },
  ],
};
