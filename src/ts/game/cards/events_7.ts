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
  runCentralServerAbility,
  runServerAbility,
  tutorAbi,
} from "./events_1";
import * as coreUtils from "../utils";

// __cardScopeShim: ambient placeholders for legacy patterns.
const eid: any = undefined as any;
const card: any = undefined as any;
const ctx: any = undefined as any;
const side: any = undefined as any;
const state: any = undefined as any;
const target: any = undefined as any;
const asyncResult: any = undefined as any;

// Stub helpers (to be ported from clj cards/*.clj)
function cutlery(_subtype: string): any {
  return {};
}

export function rejigPickUp(): any {
  return {
    async: true,
    prompt: "Choose a program or piece of hardware to add to the grip",
    choices: {
      card: (c: Card) =>
        coreCard.runner(c) &&
        (coreCard.program(c) || coreCard.hardware(c)) &&
        coreCard.installed(c),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.move(state, side, msg, "hand");
        coreEid.completeWithResult(state, side, eid, msg.cost);
      },
    ),
  };
}

export function rejigPutDown(bonus: number): any {
  return {
    async: true,
    prompt: "Choose a program or piece of hardware to install",
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
          coreCard.runner(t) &&
          (coreCard.program(t) || coreCard.hardware(t)) &&
          coreCard.inHandStar(state, t) &&
          coreInstalling.runnerCanPayAndInstall(
            state,
            side,
            { ...eid, source: card },
            t,
            { costBonus: -bonus },
          )
        );
      }),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreInstalling.runnerInstall(
          { ...eid, source: card, sourceType: "runner-install" },
          msg,
          {
            costBonus: -bonus,
            msgKeys: { installSource: card, displayOrigin: true },
          },
        );
      },
    ),
  };
}

// Reprise
export const reprise: CardDef = {
  title: "Reprise",
  makesRun: true,
  onPlay: {
    async: true,
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return (state as any).runner?.register?.stoleAgenda;
    }),
    prompt: "Choose an installed Corp card to add to HQ",
    waitingPrompt: true,
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.corp(c) },
    msg: msg(
      "add ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, msg),
      " to HQ",
    ),
    cancel: repriseOptRun(),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.move("corp", msg, "hand");
        continue_ability(repriseOptRun(), card, null);
      },
    ),
  },
};

function repriseOptRun(): any {
  return {
    optional: {
      prompt: "Run a server?",
      yesAbility: runAnyServerAbility(),
      noAbility: {
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreSay.systemMsg(
              `declines to use ${coreCard.getCard(state, card)?.title || "this card"} to make a run`,
            );
          },
        ),
      },
    },
  };
}

// Reshape
export const reshape: CardDef = {
  title: "Reshape",
  onPlay: {
    prompt: "Choose 2 unrezzed pieces of ice to swap positions",
    choices: {
      card: (c: Card) =>
        coreCard.installed(c) && !coreCard.rezzed(c) && coreCard.ice(c),
      max: 2,
      all: true,
    },
    msg: msg(
      "swap the positions of ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, targets?.[0]),
      " and ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, targets?.[1]),
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.swapIce(targets?.[0], targets?.[1]);
      },
    ),
  },
};

// Retrieval Run
export const retrievalRun: CardDef = {
  title: "Retrieval Run",
  makesRun: true,
  onPlay: runServerAbility("archives"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "archives",
      thisCardRun: true,
      ability: {
        async: true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (
            !coreCard.zoneLocked(state, "runner", "discard") &&
            (state as any).runner?.discard?.some(
              (c: Card) =>
                coreCard.program(c) &&
                coreInstalling.runnerCanInstall(state, side, eid, c, {
                  noToast: true,
                }),
            )
          );
        }),
        prompt: "Choose a program to install",
        waitingPrompt: true,
        choices: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (state as any).runner?.discard?.filter(
            (c: Card) =>
              coreCard.program(c) &&
              coreInstalling.runnerCanInstall(state, side, eid, c, {
                noToast: true,
              }),
          );
        }),
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreInstalling.runnerInstall(state, side, eid, msg, {
              msgKeys: { installSource: card, displayOrigin: true },
              ignoreAllCost: true,
            });
          },
        ),
      },
    },
  ],
};

// Rigged Results
export const riggedResults: CardDef = {
  title: "Rigged Results",
  onPlay: {
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const allAmounts = Array.from(
        { length: Math.min(3, (state as any).runner?.credit + 1) },
        (_, i) => i,
      );
      const validAmounts = allAmounts.filter(
        (n: number) =>
          !coreFlags.anyFlagFn(state, "corp", "prevent-secretly-spend", n) &&
          !coreFlags.anyFlagFn(state, "runner", "prevent-secretly-spend", n),
      );
      const choices = validAmounts.map(String);
      yield continue_ability(
        state,
        side,
        riggedResultsRunnerChoice(choices),
        card,
        null,
      );
    }),
  },
};

function riggedResultsRunnerChoice(choices: string[]): any {
  return {
    waitingPrompt: true,
    prompt: "How many credits do you want to spend?",
    choices: choices,
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          riggedResultsCorpChoice(choices, parseInt(msg, 10)),
          card,
          null,
        );
      },
    ),
  };
}

function riggedResultsCorpChoice(choices: string[], spent: number): any {
  return {
    player: "corp",
    waitingPrompt: true,
    prompt: "How many credits were spent?",
    choices: choices,
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
        [
          { asyncResult: "result" },
          coreGaining.loseCredits(
            state,
            "runner",
            coreEid.makeEid(state, eid),
            spent,
          ),
        ],
        [],
      );
      coreSay.systemMsg(state, "runner", `spends ${spent} [Credit]`);
      coreSay.systemMsg(state, "corp", `guesses ${msg} [Credit]`);
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreEngine.triggerEventSimult(
            state,
            side,
            "reveal-spent-credits",
            null,
            { runnerCredits: spent },
          ),
        ],
        [],
      );
      if (spent !== parseInt(msg, 10)) {
        yield continue_ability(
          state,
          "runner",
          riggedResultsChooseIce(),
          card,
          null,
        );
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

function riggedResultsChooseIce(): any {
  return {
    waitingPrompt: true,
    prompt: "Choose a piece of ice to bypass",
    choices: { card: (c: Card) => coreCard.ice(c) },
    msg: msg(
      "make a run and bypass ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, msg),
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        coreEngine.registerEvents(card, [
          {
            event: "encounter-ice",
            automatic: "bypass",
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
              return utils.sameCard(msg, ctx.ice);
            }),
            msg: msg(
              "bypass ",
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => ctx.ice?.title,
            ),
            effect: effect(coreRuns.bypassIce(state)),
          },
        ]);
        coreRuns.makeRun(eid, (coreCard.getZone(msg) as string[])[1], card);
      },
    ),
  };
}

// Rigging Up
export const riggingUp: CardDef = {
  title: "Rigging Up",
  onPlay: {
    prompt: "Choose a program or piece of hardware to install",
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
          (coreCard.hardware(t) || coreCard.program(t)) &&
          coreCard.inHandStar(state, t) &&
          coreInstalling.runnerCanPayAndInstall(
            state,
            side,
            { ...eid, source: card },
            t,
            { costBonus: -3 },
          )
        );
      }),
    },
    onChangeGameState: {
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
        [
          { asyncResult: "result" },
          coreInstalling.runnerInstall(
            state,
            side,
            coreEid.makeEid(state, {
              source: card,
              sourceType: "runner-install",
            }),
            msg,
            {
              costBonus: -3,
              msgKeys: { installSource: card, displayOrigin: true },
            },
          ),
        ],
        [],
      );
      const rigTarget = asyncResult;
      yield continue_ability(
        state,
        side,
        {
          optional: {
            prompt: msg(
              "Charge ",
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => rigTarget?.title,
              "?",
            ),
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return coreCharge.canCharge(state, side, rigTarget);
            }),
            yesAbility: {
              async: true,
              effect: effect(
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => {
                  coreCharge.chargeCard(eid, rigTarget);
                },
              ),
              msg: msg(
                "charge ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => rigTarget?.title,
              ),
            },
          },
        },
        card,
        null,
      );
    }),
  },
};

// Rip Deal
export const ripDeal: CardDef = {
  title: "Rip Deal",
  makesRun: true,
  onPlay: { ...(runServerAbility("hq") || {}), rfgInsteadOfTrashing: true },
  events: [
    {
      event: "successful-run",
      automatic: "draw-cards",
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
          const ctx: any =
            ((targets as any[])?.[0] as any)?.context ??
            (targets as any[])?.[0];
          coreEngine.registerEvents(card, [
            {
              event: "candidates-determined",
              duration: "end-of-run",
              async: true,
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
                return ctx === "hq";
              }),
              effect: effect(
                continue_ability(ripDealAddCardsFromHeap(), card, null),
              ),
            },
          ]);
        },
      ),
    },
  ],
};

function ripDealAddCardsFromHeap(): any {
  return {
    optional: {
      prompt: "Add cards from heap to grip?",
      waitingPrompt: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          forms.run &&
          (state as any).corp?.hand?.length > 0 &&
          (state as any).runner?.discard?.length > 0 &&
          !coreCard.zoneLocked(state, "runner", "discard")
        );
      }),
      yesAbility: {
        async: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const randomAccessLimit =
            coreAccess.numCardsToAccess(state, side, "hq", null)
              ?.randomAccessLimit || 0;
          const cardsToMove = Math.min(
            (state as any).corp?.hand?.length,
            randomAccessLimit,
            (state as any).runner?.discard?.length,
          );
          yield continue_ability(
            state,
            side,
            {
              async: true,
              showDiscard: true,
              prompt: msg(
                "Choose ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => coreUtils.quantify(cardsToMove, "card"),
                " to add from the heap to the grip",
              ),
              msg: msg(
                "add ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => (targets || []).map((c: Card) => c.title).join(", "),
                " from the heap to the grip",
              ),
              choices: {
                max: cardsToMove,
                all: true,
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
                        coreMoving.move(state, side, c, "hand"),
                      ],
                      [],
                    );
                  }
                },
                coreUpdate.updateIn(state, "run", "prevent-hand-access", true),
                coreEid.effectCompleted(state, side, eid),
              ),
            },
            card,
            null,
          );
        }),
      },
    },
  };
}

// Ritual
export const ritual: CardDef = {
  title: "Ritual",
  onPlay: {
    async: true,
    onChangeGameState: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return (
        (state as any).runner?.deck?.length > 0 &&
        (state as any).runner?.click > 0
      );
    }),
    msg: msg(
      "draw ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreUtils.quantify((state as any).runner?.click || 0, "card"),
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDrawing.draw(state, side, eid, (state as any).runner?.click || 0);
      },
    ),
  },
};

// Rumor Mill
export const rumorMill: CardDef = {
  title: "Rumor Mill",
  staticAbilities: [
    {
      type: "disable-card",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return rumorMillEligible(msg);
      }),
      value: true,
    },
  ],
};

function rumorMillEligible(card: Card): boolean {
  return (
    card.uniqueness &&
    (coreCard.asset(card) || coreCard.upgrade(card)) &&
    !coreCard.hasSubtype(card, "Region")
  );
}

// Run Amok
export const runAmok: CardDef = {
  title: "Run Amok",
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
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreUpdate.updateIn(card, ["special", "runAmok"], () =>
          runAmokGetRezzedCids(coreBoard.allInstalled(state, "corp")),
        );
        coreRuns.makeRun(eid, msg, coreCard.getCard(state, card));
      },
    ),
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
        return forms.thisCardRun;
      }),
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const newCids = new Set(
          runAmokGetRezzedCids(coreBoard.allInstalled(state, "corp")),
        );
        const oldCids = new Set(
          coreCard.getCard(state, card)?.special?.runAmok || [],
        );
        const diff = [...newCids].filter((c: string) => !oldCids.has(c));
        const diffCards = diff.map((cid: string) =>
          coreFinding.findCid(cid, coreBoard.allInstalled(state, "corp")),
        );
        yield continue_ability(
          state,
          "runner",
          diffCards.length > 0
            ? {
                async: true,
                prompt: "Choose an ice to trash",
                choices: {
                  card: (c: Card) =>
                    diffCards.some((d: Card) => utils.sameCard(c, d)),
                  all: true,
                },
                effect: effect(
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) => {
                    coreMoving.trash(eid, msg, { causeCard: card });
                  },
                ),
              }
            : null,
          card,
          null,
        );
      }),
    },
  ],
};

function runAmokGetRezzedCids(ice: Card[]): string[] {
  return ice
    .filter((c: Card) => coreCard.rezzed(c) && coreCard.ice(c))
    .map((c: Card) => c.cid);
}

// Running Hot
export const runningHot: CardDef = {
  title: "Running Hot",
  onPlay: {
    msg: "gain [Click][Click][Click]",
    additionalCost: [corePayment.toC("brain", 1)],
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainClicks(3);
        coreEid.effectCompleted(eid);
      },
    ),
  },
};

// Running Interference
export const runningInterference: CardDef = {
  title: "Running Interference",
  makesRun: true,
  staticAbilities: [
    {
      type: "rez-additional-cost",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return forms.run(state) && coreCard.ice(msg);
      }),
      value: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return [corePayment.toC("credit", msg.cost)];
      }),
    },
  ],
  onPlay: runAnyServerAbility(),
};

// S-Dobrado
export const sDobrado: CardDef = {
  title: "S-Dobrado",
  makesRun: true,
  onPlay: runCentralServerAbility(),
  events: [
    {
      event: "encounter-ice",
      automatic: "bypass",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreEvents.firstRunEvent(state, side, "encounter-ice");
      }),
      once: "per-run",
      msg: msg(
        "bypass ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreToString.cardStr(state, forms.currentIce),
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreRuns.bypassIce(state);
        },
      ),
    },
    {
      event: "encounter-ice",
      skippable: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          coreEvents.runEvents(state, side, "encounter-ice").length === 2 &&
          coreThreat.threatLevel(4, state)
        );
      }),
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          continue_ability(
            {
              optional: {
                prompt: msg(
                  "Spend [Click] to bypass ",
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) => coreToString.cardStr(state, forms.currentIce),
                  "?",
                ),
                waitingPrompt: true,
                yesAbility: {
                  msg: msg(
                    "bypass ",
                    (
                      state: State,
                      side: Side,
                      eid: EID,
                      card: Card,
                      targets: any[],
                    ) => coreToString.cardStr(state, forms.currentIce),
                  ),
                  cost: [corePayment.toC("click", 1)],
                  effect: effect(coreRuns.bypassIce(state)),
                },
              },
            },
            card,
            null,
          );
        },
      ),
    },
  ],
};

// Satellite Uplink
export const satelliteUplink: CardDef = {
  title: "Satellite Uplink",
  onPlay: {
    choices: {
      max: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return Math.min(
          2,
          (coreBoard.allInstalled(state, "corp") || []).filter(
            (c: Card) => !coreCard.faceup(c),
          ).length,
        );
      }),
      card: (c: Card) =>
        coreCard.corp(c) && coreCard.installed(c) && !coreCard.rezzed(c),
    },
    async: true,
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (coreBoard.allInstalled(state, "corp") || []).some(
          (c: Card) => !coreCard.faceup(c),
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
      if ((targets || []).length > 0) {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreExpose.expose(state, side, eid, targets),
          ],
          [],
        );
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

// Scavenge
export const scavenge: CardDef = {
  title: "Scavenge",
  onPlay: {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return (coreBoard.allActiveInstalled(state, "runner") || []).some(
        (c: Card) => coreCard.program(c) && coreCard.installed(c),
      );
    }),
    prompt: "Choose an installed program to trash",
    choices: {
      card: (c: Card) => coreCard.program(c) && coreCard.installed(c),
    },
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const trashed = msg;
      const tcost = trashed?.cost || 0;
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreMoving.trash(state, side, trashed, {
            unpreventable: true,
            causeCard: card,
          }),
        ],
        [],
      );
      yield continue_ability(
        state,
        side,
        {
          async: true,
          prompt: coreCard.zoneLocked(state, "runner", "discard")
            ? "Choose a program to install"
            : "Choose a program to install from the grip or heap",
          showDiscard: !coreCard.zoneLocked(state, "runner", "discard"),
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
                (coreCard.inHandStar(state, t) ||
                  (!coreCard.zoneLocked(state, "runner", "discard") &&
                    coreCard.inDiscard(t))) &&
                coreInstalling.runnerCanPayAndInstall(
                  state,
                  side,
                  { ...eid, source: card },
                  t,
                  { costBonus: -tcost },
                )
              );
            }),
          },
          msg: msg(
            "trash ",
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              trashed?.title,
            " and install ",
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              msg,
            ", lowering the cost by ",
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              tcost,
            " [Credits]",
          ),
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreInstalling.runnerInstall(
                { ...eid, source: card, sourceType: "runner-install" },
                msg,
                { costBonus: -tcost },
              );
            },
          ),
        },
        card,
        null,
      );
    }),
  },
};

// Scrounge
export const scrounge: CardDef = {
  title: "Scrounge",
  onPlay: {
    prompt: "Choose a program to install",
    label: "Install program from the heap",
    showDiscard: true,
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (state as any).runner?.discard?.some((c: Card) =>
          coreCard.program(c),
        );
      }),
    },
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
          coreCard.inDiscard(t) &&
          coreInstalling.runnerCanPayAndInstall(
            state,
            side,
            { ...eid, source: card },
            t,
          )
        );
      }),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreInstalling.runnerInstall(state, side, msg, {
          msgKeys: {
            installSource: card,
            displayOrigin: true,
            includeCostFromEid: eid,
          },
        });
        continue_ability(scroungeBottomOneProgram(), card, null);
      },
    ),
    cancel: scroungeBottomOneProgram(),
  },
};

function scroungeBottomOneProgram(): any {
  return {
    prompt: "Put a program on the bottom of the stack?",
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return (state as any).runner?.discard?.some((c: Card) =>
        coreCard.program(c),
      );
    }),
    choices: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        return coreCard.program(t) && coreCard.inDiscard(t);
      }),
    },
    showDiscard: true,
    msg: msg(
      "put ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
      " on the bottom of the stack",
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.move(state, side, msg, "deck");
      },
    ),
  };
}

// Scrubbed
export const scrubbed: CardDef = {
  title: "Scrubbed",
  events: [
    {
      event: "encounter-ice",
      once: "per-turn",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx: any =
            ((targets as any[])?.[0] as any)?.context ??
            (targets as any[])?.[0];
          coreEffects.registerLingeringEffect(card, {
            type: "ice-strength",
            duration: "end-of-run",
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
              return utils.sameCard(msg, ctx.ice);
            }),
            value: -2,
          });
          coreIce.updateAllIce(state, side);
        },
      ),
    },
  ],
};

// Security Leak
export const securityLeak: CardDef = {
  title: "Security Leak",
  staticAbilities: [
    {
      type: "card-ability-additional-cost",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return (
          utils.sameCard(ctx.card, (state as any).corp?.basicActionCard) &&
          ctx.ability?.label === "Advance 1 installed card"
        );
      }),
      value: corePayment.toC("credit", 1),
    },
  ],
};

// Sell Out
export const sellOut: CardDef = {
  title: "Sell Out",
  onPlay: {
    additionalCost: [corePayment.toC("resource", 1)],
    async: true,
    msg: "gain 4 [Credits] and draw 2 cards",
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
          coreGaining.gainCredits(state, side, 4, { suppressCheckpoint: true }),
        ],
        [],
      );
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreDrawing.draw(state, side, eid, 2)],
        [],
      );
    }),
  },
};

// Shred
export const shred: CardDef = {
  title: "Shred",
  onPlay: runAnyServerAbility(),
  makesRun: true,
  staticAbilities: [
    {
      type: "prevention",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          forms.run(state) &&
          coreEvents.firstRunEvent(state, side, "end-run-interrupt")
        );
      }),
      value: {
        prevents: "end-run",
        type: "floating",
        maxUses: 1,
        mandatory: true,
        ability: {
          async: true,
          condition: "floating",
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
            return corePrevention.preventable(ctx);
          }),
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const ctx: any =
                ((targets as any[])?.[0] as any)?.context ??
                (targets as any[])?.[0];
              continue_ability(
                state,
                side,
                (() => {
                  const cardsInServer =
                    (ctx.runServer || {}).content?.length || 0;
                  if (cardsInServer > 0) {
                    return coreChooseOne.chooseOneHelper({ player: "corp" }, [
                      {
                        option: "Reveal and randomly trash cards",
                        ability: coreChooseOne.costOption(
                          [
                            corePayment.toC(
                              "reveal-and-randomly-trash-from-hand",
                              cardsInServer,
                            ),
                          ],
                          "corp",
                        ),
                      },
                      {
                        option: "The run does not end",
                        ability: {
                          displaySide: "runner",
                          async: true,
                          msg: "prevent the run from ending",
                          effect: effect(
                            corePrevention.preventEndRun(state, side, eid),
                          ),
                        },
                      },
                    ]);
                  }
                  return null;
                })(),
                card,
                null,
              );
            },
          ),
        },
      },
    },
  ],
};

// Showing Off
export const showingOff: CardDef = {
  title: "Showing Off",
  makesRun: true,
  onPlay: runServerAbility("rd"),
  events: [
    {
      event: "successful-run",
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
      silent: true,
      msg: "access cards from the bottom of R&D",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreUpdate.updateIn(state, "runner", "rdAccessFn", "reverse");
        },
      ),
    },
    {
      event: "run-ends",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreUpdate.updateIn(state, "runner", "rdAccessFn", "seq");
        },
      ),
    },
  ],
};

// Singularity
export const singularity: CardDef = {
  title: "Singularity",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "remote",
      thisCardRun: true,
      mandatory: true,
      ability: {
        async: true,
        msg: "trash all cards in the server at no cost",
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const ctx: any =
              ((targets as any[])?.[0] as any)?.context ??
              (targets as any[])?.[0];
            coreMoving.trashCards(eid, (ctx.runServer || {}).content, {
              causeCard: card,
            });
          },
        ),
      },
    },
  ],
};

// Social Engineering
export const socialEngineering: CardDef = {
  title: "Social Engineering",
  onPlay: {
    prompt: "Choose an unrezzed piece of ice",
    choices: {
      card: (c: Card) =>
        !coreCard.rezzed(c) && coreCard.installed(c) && coreCard.ice(c),
    },
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (coreBoard.allInstalled(state, "corp") || []).some(
          (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c),
        );
      }),
    },
    msg: msg(
      "select ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, msg),
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        coreEngine.registerEvents(card, [
          {
            event: "rez",
            duration: "end-of-turn",
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
              return utils.sameCard(ctx.card, msg);
            }),
            msg: msg(
              "gain ",
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) =>
                coreCostFns.rezCost(
                  state,
                  side,
                  coreCard.getCard(state, ctx.card),
                ),
              " [Credits]",
            ),
            async: true,
            effect: effect(
              coreGaining.gainCredits(
                "runner",
                eid,
                coreCostFns.rezCost(
                  state,
                  side,
                  coreCard.getCard(state, ctx.card),
                ) || 0,
              ),
            ),
          },
        ]);
      },
    ),
  },
};

// Spark of Inspiration
export const sparkOfInspiration: CardDef = {
  title: "Spark of Inspiration",
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
        return (state as any).runner?.deck?.length > 0;
      }),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        sparkOfInspirationSearch(
          state,
          side,
          eid,
          card,
          (state as any).runner?.deck || [],
          [],
        );
      },
    ),
  },
};

function sparkOfInspirationSearch(
  state: State,
  side: Side,
  eid: EID,
  card: Card,
  remainder: Card[],
  revealedCards: Card[],
): any {
  if (remainder.length > 0) {
    const revealedCard = remainder[0];
    const restOfDeck = remainder.slice(1);
    const newRevealed = [...revealedCards, revealedCard];
    if (coreCard.program(revealedCard)) {
      return sparkOfInspirationInstallProgram(
        state,
        side,
        eid,
        card,
        revealedCard,
        newRevealed,
      );
    }
    return sparkOfInspirationSearch(
      state,
      side,
      eid,
      card,
      restOfDeck,
      newRevealed,
    );
  }
  return effect(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      continue_ability(
        sparkOfInspirationShuffleBack(revealedCards),
        card,
        null,
      );
    },
  );
}

function sparkOfInspirationInstallProgram(
  state: State,
  side: Side,
  eid: EID,
  card: Card,
  revealedCard: Card,
  revealedCards: Card[],
): any {
  if (
    coreInstalling.runnerCanPayAndInstall(
      state,
      side,
      { ...eid, source: card },
      revealedCard,
      { costBonus: -10 },
    )
  ) {
    return continue_ability(
      state,
      side,
      {
        optional: {
          prompt: msg(
            "Install ",
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              revealedCard.title,
            " paying 10 [Credits] less?",
          ),
          waitingPrompt: true,
          yesAbility: {
            async: true,
            effect: effect(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                coreRevealing.revealLoud(
                  state,
                  side,
                  card,
                  { andThen: "shuffle the Stack" },
                  revealedCards,
                );
                coreInstalling.runnerInstall(
                  coreEid.makeEid(state, {
                    source: card,
                    sourceType: "runner-install",
                  }),
                  revealedCard,
                  {
                    costBonus: -10,
                    msgKeys: { installSource: card, displayOrigin: true },
                  },
                );
                coreShuffling.shuffle(state, side, "deck");
                coreSay.systemMsg(state, side, "shuffles the Stack");
                coreEid.effectCompleted(state, side, eid);
              },
            ),
          },
          noAbility: sparkOfInspirationShuffleBack(revealedCards),
        },
      },
      card,
      null,
    );
  }
  return continue_ability(
    state,
    side,
    sparkOfInspirationShuffleBack(revealedCards),
    card,
    null,
  );
}

function sparkOfInspirationShuffleBack(revealedCards: Card[]): any {
  return {
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreRevealing.revealLoud(
          state,
          side,
          card,
          { andThen: "shuffle the Stack" },
          revealedCards,
        );
        coreShuffling.shuffle(state, side, "deck");
        coreEid.effectCompleted(state, side, eid);
      },
    ),
  };
}

// Spear Phishing
export const spearPhishing: CardDef = {
  title: "Spear Phishing",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: "encounter-ice",
      automatic: "bypass",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return forms.runPosition === 1;
      }),
      msg: msg(
        "bypass ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          ctx.ice?.title,
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreRuns.bypassIce(state);
        },
      ),
    },
  ],
};

// Spec Work
export const specWork: CardDef = {
  title: "Spec Work",
  onPlay: {
    additionalCost: [corePayment.toC("program", 1)],
    msg: "gain 4 [Credits] and draw 2 cards",
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
        [{ asyncResult: "result" }, coreGaining.gainCredits(state, side, 4)],
        [],
      );
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreDrawing.draw(state, side, eid, 2)],
        [],
      );
    }),
  },
};

// Special Order
export const specialOrder: CardDef = {
  title: "Special Order",
  onPlay: tutorAbi(true, (c: Card) => coreCard.hasSubtype(c, "Icebreaker")),
};

// Spooned
export const spooned: CardDef = {
  title: "Spooned",
  ...cutlery("Code Gate"),
};

// Spot the Prey
export const spotThePrey: CardDef = {
  title: "Spot the Prey",
  makesRun: true,
  onPlay: {
    prompt: "Choose 1 non-ice card to expose",
    msg: "expose 1 card and make a run",
    choices: {
      card: (c: Card) =>
        coreCard.installed(c) && !coreCard.ice(c) && coreCard.corp(c),
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
        [{ asyncResult: "result" }, coreExpose.expose(state, side, [msg])],
        [],
      );
      yield continue_ability(state, side, runAnyServerAbility(), card, null);
    }),
  },
};

// Spree
export const spree: CardDef = {
  title: "Spree",
  data: { counter: { power: 3 } },
  makesRun: true,
  onPlay: runAnyServerAbility(),
  abilities: [
    {
      cost: [corePayment.toC("power", 1)],
      label:
        "Host an installed trojan on a piece of ice protecting this server",
      prompt: "Choose an installed trojan",
      waitingPrompt: true,
      choices: {
        card: (c: Card) =>
          coreCard.hasSubtype(c, "Trojan") &&
          coreCard.program(c) &&
          coreCard.installed(c),
      },
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        const trojan = msg;
        yield continue_ability(
          state,
          side,
          {
            prompt: "Choose a piece of ice protecting this server",
            choices: {
              card: (c: Card) =>
                coreCard.ice(c) &&
                coreRuns.targetServer(ctx) ===
                  (coreCard.getZone(c) as string[])[1],
            },
            msg: msg(
              "host ",
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => trojan.title,
              " on ",
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => coreToString.cardStr(state, msg),
            ),
            effect: effect(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                coreHosting.host(state, side, msg, trojan);
                coreIce.updateAllIce(state, side);
              },
            ),
          },
          card,
          null,
        );
      }),
    },
  ],
};

// Steelskin Scarring
export const steelskinScarring: CardDef = {
  title: "Steelskin Scarring",
  onPlay: {
    async: true,
    msg: "draw 3 cards",
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
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDrawing.draw(eid, 3);
      },
    ),
  },
  onTrash: {
    whenInactive: true,
    interactive: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
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
      return ["hand", "deck"].includes(coreCard.getZone(ctx.card)?.[0]);
    }),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          {
            optional: {
              prompt: "Draw 2 cards?",
              waitingPrompt: true,
              yesAbility: {
                msg: "draw 2 cards",
                async: true,
                effect: effect(coreDrawing.draw("runner", eid, 2)),
              },
              noAbility: {
                effect: effect(
                  coreSay.systemMsg(
                    `declines to use ${coreCard.getCard(state, card)?.title} to draw 2 cards`,
                  ),
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
