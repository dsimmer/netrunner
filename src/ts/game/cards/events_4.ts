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
  gainCreditsAbility,
  runAnyServerAbility,
  runServerAbility,
} from "./events_1";
import { intoTheDepthsAll, intoTheDepthsChoice } from "./events_5";
import * as coreUtils from "../utils";

// __cardScopeShim — placeholders for legacy literal-scope references
const state: any = undefined as any;
const side: any = undefined as any;
const eid: any = undefined as any;
const card: any = undefined as any;
const target: any = undefined as any;
const targets: any = undefined as any;
const ctx: any = undefined as any;
const asyncResult: any = undefined as any;

// Stub helpers (to be ported from clj cards/*.clj)
function cutlery(_subtype: string): any {
  return {};
}

// Finality
export const finality: CardDef = {
  title: "Finality",
  makesRun: true,
  onPlay: runServerAbility("rd", {
    additionalCost: [corePayment.toC("brain", 1)],
  }),
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
        return ctx.server === "rd" && forms.thisCardRun;
      }),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreEngine.registerEvents(card, [
            coreDefHelpers.breachAccessBonus("rd", 3, {
              duration: "end-of-run",
            }),
          ]);
        },
      ),
    },
  ],
};

// Fisk Investment Seminar
export const fiskInvestmentSeminar: CardDef = {
  title: "Fisk Investment Seminar",
  onPlay: {
    msg: "make each player draw 3 cards",
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
          (state as any).corp?.deck?.length > 0
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
          coreDrawing.draw(state, "runner", 3, { suppressCheckpoint: true }),
        ],
        [],
      );
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreDrawing.draw(state, "corp", eid, 3)],
        [],
      );
    }),
  },
};

// Forged Activation Orders
export const forgedActivationOrders: CardDef = {
  title: "Forged Activation Orders",
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c) },
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
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const ice = msg;
      const serv = coreServers.zoneToName(coreCard.getZone(ice)?.[1]);
      yield continue_ability(
        state,
        "corp",
        {
          prompt: "Choose one",
          choices: [
            coreFlags.canRez(state, "corp", ice) &&
            corePayment.canPay(state, "corp", eid, ice, null, coreRezzing.getRezCost(state, "corp", ice))
              ? `Rez ${coreToString.cardStr(state, ice)}`
              : null,
            `Trash ${coreToString.cardStr(state, ice)}`,
          ].filter(Boolean),
          async: true,
          msg: msg(
            "force the Corp to ",
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              msg,
          ),
          waitingPrompt: true,
          effect: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            if (msg.startsWith("Rez")) {
              yield wait_for(
                state,
                [
                  { asyncResult: "result" },
                  coreRezzing.rez(state, "corp", eid, ice),
                ],
                [],
              );
            } else {
              yield wait_for(
                state,
                [
                  { asyncResult: "result" },
                  coreMoving.trash(state, "corp", eid, ice, {
                    causeCard: card,
                    cause: "forced-to-trash",
                  }),
                ],
                [],
              );
            }
          }),
        },
        card,
        null,
      );
    }),
  },
};

// Forked
export const forked: CardDef = {
  title: "Forked",
  ...cutlery("Sentry"),
};

// Frame Job
export const frameJob: CardDef = {
  title: "Frame Job",
  onPlay: {
    prompt: "Choose an agenda to forfeit",
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (state as any).runner?.scored?.length > 0;
      }),
    },
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return (state as any).runner?.scored || [];
    }),
    msg: msg(
      "forfeit ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
      " and give the Corp 1 bad publicity",
    ),
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
          coreMoving.forfeit(state, side, coreEid.makeEid(state, eid), msg, {
            msg: false,
          }),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreBadPublicity.gainBadPublicity(state, "corp", eid, 1),
        ],
        [],
      );
    }),
  },
};

// Frantic Coding
export const franticCoding: CardDef = {
  title: "Frantic Coding",
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
        continue_ability(
          (() => {
            const topTen = (state as any).runner?.deck?.slice(0, 10) || [];
            return {
              prompt: `The top cards of the stack are (top->bottom): ${topTen.map((c: Card) => c.title).join(", ")}`,
              choices: ["OK"],
              async: true,
              effect: effect(
                continue_ability(
                  {
                    prompt: "Install a program?",
                    choices: [
                      ...topTen
                        .filter(
                          (c: Card) =>
                            coreCard.program(c) &&
                            coreInstalling.runnerCanPayAndInstall(
                              state,
                              side,
                              { ...eid, source: card },
                              c,
                              { costBonus: -5 },
                            ),
                        )
                        .sort((a: Card, b: Card) =>
                          (a.title || "").localeCompare(b.title || ""),
                        )
                        .map((c: Card) => c.title),
                      "Done",
                    ],
                    async: true,
                    effect: req(function* (
                      state: State,
                      side: Side,
                      eid: EID,
                      card: Card,
                      targets: any[],
                    ): Generator<any, any, any> {
                      const numberShuffles = (
                        coreEvents.turnEvents(
                          state,
                          "runner",
                          "runner-shuffle-deck",
                        ) || []
                      ).length;
                      yield wait_for(
                        state,
                        [
                          { asyncResult: "result" },
                          coreInstalling.runnerInstall(
                            coreEid.makeEid(state, {
                              source: card,
                              sourceType: "runner-install",
                            }),
                            msg,
                            {
                              costBonus: -5,
                              msgKeys: {
                                displayOrigin: true,
                                installSource: card,
                              },
                            },
                          ),
                        ],
                        [],
                      );
                      const newShuffles = (
                        coreEvents.turnEvents(
                          state,
                          "runner",
                          "runner-shuffle-deck",
                        ) || []
                      ).length;
                      if (numberShuffles === newShuffles) {
                        coreSay.systemMsg(
                          state,
                          side,
                          `uses ${card.title} to trash ${topTen.map((c: Card) => c.title).join(", ")} from the top of the stack`,
                        );
                        yield wait_for(
                          state,
                          [
                            { asyncResult: "result" },
                            coreMoving.trashCards(
                              state,
                              side,
                              eid,
                              topTen.filter(
                                (c: Card) => !utils.sameCard(c, msg),
                              ),
                              { unpreventable: true, causeCard: card },
                            ),
                          ],
                          [],
                        );
                      } else {
                        coreSay.systemMsg(
                          state,
                          side,
                          "does not have to trash cards because the stack was shuffled",
                        );
                      }
                      return coreEid.effectCompleted(state, side, eid);
                    }),
                  },
                  card,
                  null,
                ),
              ),
            };
          })(),
          card,
          null,
        );
      },
    ),
  },
};

// "Freedom Through Equality"
export const freedomThroughEquality: CardDef = {
  title: '"Freedom Through Equality"',
  events: [
    {
      event: "agenda-stolen",
      msg: "add itself to [their] score area as an agenda worth 1 agenda point",
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
            coreMoving.asAgenda(state, "runner", card, 1),
          ],
          [],
        );
      }),
    },
  ],
};

// Freelance Coding Contract
export const freelanceCodingContract: CardDef = {
  title: "Freelance Coding Contract",
  onPlay: {
    choices: {
      max: 5,
      card: (c: Card) => coreCard.program(c) && coreCard.inHand(c),
    },
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (state as any).runner?.hand?.length > 0;
      }),
    },
    msg: msg(
      "trash ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (targets || []).map((c: Card) => c.title).join(", "),
      " and gain ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (targets || []).length * 2,
      " [Credits]",
    ),
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
          coreMoving.trashCards(state, side, targets, {
            unpreventable: true,
            causeCard: card,
          }),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreGaining.gainCredits(state, side, eid, (targets || []).length * 2),
        ],
        [],
      );
    }),
  },
};

// Game Day
export const gameDay: CardDef = {
  title: "Game Day",
  onPlay: {
    msg: msg(
      "draw ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreUtils.quantify(
          coreHandSize.handSize(state, "runner") -
            ((state as any).runner?.hand?.length || 0),
          "card",
        ),
    ),
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          coreHandSize.handSize(state, "runner") -
            ((state as any).runner?.hand?.length || 0) >
          0
        );
      }),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDrawing.draw(
          eid,
          coreHandSize.handSize(state, "runner") -
            ((state as any).runner?.hand?.length || 0),
        );
      },
    ),
  },
};

// Glut Cipher
export const glutCipher: CardDef = {
  title: "Glut Cipher",
  makesRun: true,
  onPlay: runServerAbility("archives"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "archives",
      thisCardRun: true,
      mandatory: true,
      ability: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (state as any).corp?.discard?.length >= 5;
        }),
        showDiscard: true,
        async: true,
        player: "corp",
        waitingPrompt: true,
        prompt: "Choose 5 cards from Archives to add to HQ",
        choices: {
          max: 5,
          all: true,
          card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c),
        },
        msg: msg(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const seen = (targets || []).filter((c: Card) => c.seen);
          const m = (targets || []).filter((c: Card) => !c.seen).length;
          return `move ${seen.map((c: Card) => c.title).join(", ")}${m > 0 ? (seen.length > 0 ? " and " : "") + coreUtils.quantify(m, "unseen card") : ""} into HQ, then trash 5 cards`;
        }),
        effect: req(function* (
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
          const corpHand = (state as any).corp?.hand || [];
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.trashCards(
                state,
                "corp",
                eid,
                (corpHand || []).slice(0, 5).sort(() => Math.random() - 0.5),
                { causeCard: card },
              ),
            ],
            [],
          );
        }),
      },
    },
  ],
};

// Government Investigations
export const governmentInvestigations: CardDef = {
  title: "Government Investigations",
  flags: { "prevent-secretly-spend": req(2) },
};

// Guinea Pig
export const guineaPig: CardDef = {
  title: "Guinea Pig",
  onPlay: {
    msg: "trash all cards in the grip and gain 10 [Credits]",
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
          coreMoving.trashCards(
            state,
            side,
            (state as any).runner?.hand || [],
            { unpreventable: true, causeCard: card },
          ),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreGaining.gainCredits(state, "runner", eid, 10),
        ],
        [],
      );
    }),
  },
};

// Hacktivist Meeting
export const hacktivistMeeting: CardDef = {
  title: "Hacktivist Meeting",
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
        return msg;
      }),
      value: [corePayment.toC("randomly-trash-from-hand", 1)],
    },
  ],
};

// Harmony AR Therapy
export const harmonyArTherapy: CardDef = {
  title: "Harmony AR Therapy",
  onPlay: {
    rfgInsteadOfTrashing: true,
    waitingPrompt: true,
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (
        !coreCard.zoneLocked(state, "runner", "discard") &&
        (state as any).runner?.discard?.length > 0
      ) {
        yield continue_ability(
          state,
          side,
          harmonyChooseNext(
            [],
            null,
            (state as any).runner?.discard?.map((c: Card) => c.title) || [],
          ),
          card,
          null,
        );
      } else {
        coreSay.systemMsg(
          state,
          "runner",
          `uses ${card.title} to shuffle the stack`,
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreShuffling.shuffle(state, "runner", "deck"),
          ],
          [],
        );
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

function harmonyChooseNext(
  toShuffle: string[],
  target: any,
  remaining: string[],
): any {
  remaining =
    msg === "Done" ? remaining : remaining.filter((x: string) => x !== msg);
  const toShuffleArr =
    msg === "Done" ? toShuffle : target ? [...toShuffle, target] : [];
  const remainingChoices = 5 - toShuffleArr.length;
  const finished =
    msg === "Done" || remainingChoices === 0 || remaining.length === 0;
  return {
    prompt: finished
      ? `Shuffling: ${toShuffleArr.join(", ")}`
      : `Choose up to ${remainingChoices} more cards.${toShuffleArr.length > 0 ? "[br]Shuffling: " + toShuffleArr.join(", ") : ""}`,
    async: true,
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return finished
        ? ["OK", "Start over"]
        : [...remaining, ...(toShuffleArr.length > 0 ? ["Done"] : [])];
    }),
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (finished) {
        if (msg === "OK") {
          yield continue_ability(
            state,
            side,
            harmonyChooseEnd(toShuffleArr),
            card,
            null,
          );
        } else {
          yield continue_ability(
            state,
            side,
            harmonyChooseNext([], null, [
              ...new Set(
                ((state as any).runner?.discard?.map((c: Card) => c.title) ?? []) as string[],
              ),
            ]),
            card,
            null,
          );
        }
      } else {
        yield continue_ability(
          state,
          side,
          harmonyChooseNext(toShuffleArr, msg, remaining),
          card,
          null,
        );
      }
    }),
  };
}

function harmonyChooseEnd(toShuffle: string[]): any {
  toShuffle = [...new Set(toShuffle)];
  return {
    msg: msg(
      "shuffle ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreUtils.quantify(toShuffle.length, "card"),
      " back into the stack: ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        toShuffle.join(", "),
    ),
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      for (const cTitle of toShuffle) {
        const c = (state as any).runner?.discard?.find(
          (x: Card) => x.title === cTitle,
        );
        if (c) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.move(state, side, c, "deck"),
            ],
            [],
          );
        }
      }
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreShuffling.shuffle(state, side, "deck")],
        [],
      );
    }),
  };
}

// High-Stakes Job
export const highStakesJob: CardDef = {
  title: "High-Stakes Job",
  makesRun: true,
  onPlay: {
    prompt: "Choose a server",
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const unrezzedIce = (server: string) =>
        (state as any).corp?.servers?.[server]?.ices?.some(
          (c: Card) => !coreCard.rezzed(c),
        );
      const badZones = Object.keys((state as any).corp?.servers || {}).filter(
        (s: string) => !unrezzedIce(s),
      );
      return (
        coreServers.zonesToSortedNames(
          coreRuns.getRunnableZones(state, side, eid, card, null),
        ) || []
      ).filter((s: string) => !badZones.includes(s));
    }),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreRuns.makeRun(eid, msg, card);
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
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return ctx.successful && forms.thisCardRun;
      }),
      msg: "gain 12 [Credits]",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits("runner", eid, 12);
        },
      ),
    },
  ],
};

// Hostage
export const hostage: CardDef = {
  title: "Hostage",
  onPlay: {
    prompt: "Choose a Connection",
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
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const deck = (state as any).runner?.deck || [];
      return corePrompts.cancellable(
        deck.filter((c: Card) => coreCard.hasSubtype(c, "Connection")),
        "sorted",
      );
    }),
    msg: msg(
      "add ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
      " from the stack to the grip and shuffle the stack",
    ),
    async: true,
    cancel: coreShuffling.failToFind,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEngine.triggerEvent("searched-stack");
        continue_ability(
          (() => {
            const connection = msg;
            if (
              coreInstalling.runnerCanPayAndInstall(
                state,
                side,
                { ...eid, source: card },
                connection,
              )
            ) {
              return {
                optional: {
                  prompt: msg(
                    "Install ",
                    (
                      state: State,
                      side: Side,
                      eid: EID,
                      card: Card,
                      targets: any[],
                    ) => connection.title,
                    "?",
                  ),
                  yesAbility: {
                    async: true,
                    effect: effect(
                      coreInstalling.runnerInstall(
                        { ...eid, source: card, sourceType: "runner-install" },
                        connection,
                        null,
                      ),
                      coreShuffling.shuffle(state, side, "deck"),
                    ),
                  },
                  noAbility: {
                    effect: effect(
                      coreMoving.move(state, side, connection, "hand"),
                      coreShuffling.shuffle(state, side, "deck"),
                    ),
                  },
                },
              };
            }
            return {
              effect: effect(
                coreMoving.move(state, side, connection, "hand"),
                coreShuffling.shuffle(state, side, "deck"),
              ),
            };
          })(),
          card,
          null,
        );
      },
    ),
  },
};

// Hot Pursuit
export const hotPursuit: CardDef = {
  title: "Hot Pursuit",
  makesRun: true,
  onPlay: runServerAbility("hq"),
  events: [
    {
      event: "successful-run",
      automatic: "gain-credits",
      async: true,
      msg: "gain 9 [Credits] and take 1 tag",
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
            coreTags.gainTags(state, "runner", 1, { suppressCheckpoint: true }),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(state, "runner", eid, 9),
          ],
          [],
        );
      }),
    },
  ],
};

// I've Had Worse
export const iveHadWorse: CardDef = {
  title: "I've Had Worse",
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
      return ["meat", "net"].includes(ctx.cause);
    }),
    msg: "draw 3 cards",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDrawing.draw("runner", eid, 3);
      },
    ),
  },
};

// Illumination
export const illumination: CardDef = {
  title: "Illumination",
  makesRun: true,
  playSound: "illumination",
  onPlay: runServerAbility("rd"),
  events: [illuminationInstallFn(3)],
};

function illuminationInstallFn(remaining: number): any {
  return {
    ...illuminationInstallChoice(remaining),
    event: "successful-run",
    interactive: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const ctx: any =
        ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
      return forms.thisCardRun && ctx.server === "rd";
    }),
  };
}

function illuminationInstallChoice(remaining: number): any {
  return {
    prompt: `install a card from the Grip, paying 1 [Credits] less (${remaining} remaining)`,
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
          coreCard.inHandStar(state, t) &&
          (coreCard.hardware(t) ||
            coreCard.resource(t) ||
            coreCard.program(t)) &&
          coreInstalling.runnerCanPayAndInstall(
            state,
            side,
            { ...eid, source: card },
            t,
            { costBonus: -1 },
          )
        );
      }),
    },
    async: true,
    waitingPrompt: true,
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
          coreInstalling.runnerInstall(state, side, msg, {
            costBonus: -1,
            msgKeys: { installSource: card, displayOrigin: true },
          }),
        ],
        [],
      );
      if (remaining > 1) {
        yield continue_ability(
          state,
          side,
          illuminationInstallChoice(remaining - 1),
          card,
          null,
        );
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Immolation Script
export const immolationScript: CardDef = {
  title: "Immolation Script",
  makesRun: true,
  onPlay: runServerAbility("archives"),
  events: [
    {
      event: "breach-server",
      automatic: "pre-breach",
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
        return (
          ctx.server === "archives" &&
          (
            [
              ...(state.corp?.discard
                ?.filter((c: Card) => coreCard.ice(c))
                .map((c: Card) => c.title) ?? []),
              ...(coreBoard.allInstalled(state, "corp") || [])
                .filter((c: Card) => coreCard.rezzed(c))
                .map((c: Card) => c.title),
            ] as string[]
          ).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i)
            .length > 0
        );
      }),
      prompt: "Choose a piece of ice in Archives",
      choices: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          (state as any).corp?.discard?.filter((c: Card) => coreCard.ice(c)) ||
          []
        );
      }),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          continue_ability(
            {
              async: true,
              prompt: msg(
                "Choose a rezzed copy of ",
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
                  coreCard.rezzed(c) &&
                  utils.sameCard((x: Card) => x.title, c, msg as unknown as Card),
              },
              msg: msg(
                "trash ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => coreToString.cardStr(state, msg),
              ),
              effect: effect(coreMoving.trash(eid, msg, { causeCard: card })),
            },
            card,
            null,
          );
        },
      ),
    },
  ],
};

// In the Groove
export const inTheGroove: CardDef = {
  title: "In the Groove",
  events: [
    {
      event: "runner-install",
      duration: "end-of-turn",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return (ctx.card?.cost || 0) >= 1 && !ctx.facedown;
      }),
      interactive: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return (
          coreCard.hasSubtype(ctx.card, "Cybernetic") ||
          coreEvents.firstEvent(state, side, "runner-install")
        );
      }),
      async: true,
      prompt: "Choose one",
      waitingPrompt: true,
      choices: ["Draw 1 card", "Gain 1 [Credits]"],
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
      ),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (msg === "Draw 1 card") {
          yield wait_for(
            state,
            [{ asyncResult: "result" }, coreDrawing.draw(state, side, eid, 1)],
            [],
          );
        } else {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreGaining.gainCredits(state, side, eid, 1),
            ],
            [],
          );
        }
      }),
    },
  ],
};

// Independent Thinking
export const independentThinking: CardDef = {
  title: "Independent Thinking",
  onPlay: {
    prompt: "Choose up to 5 installed cards to trash",
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (coreBoard.allInstalled(state, "runner") || []).length > 0;
      }),
    },
    choices: {
      max: 5,
      card: (c: Card) => coreCard.installed(c) && coreCard.runner(c),
    },
    msg: msg(
      "trash ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (targets || []).map((c: Card) => c.title).join(", "),
      " and draw ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreUtils.quantify(
          (targets || []).length *
            ((targets || []).some(
              (c: Card) => !c.facedown && coreCard.hasSubtype(c, "Directive"),
            )
              ? 2
              : 1),
          "card",
        ),
    ),
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const cardsToDraw =
        (targets || []).length *
        ((targets || []).some(
          (c: Card) => !c.facedown && coreCard.hasSubtype(c, "Directive"),
        )
          ? 2
          : 1);
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreMoving.trashCards(state, side, targets, { causeCard: card }),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreDrawing.draw(state, "runner", eid, cardsToDraw),
        ],
        [],
      );
    }),
  },
};

// Indexing
export const indexing: CardDef = {
  title: "Indexing",
  makesRun: true,
  onPlay: runServerAbility("rd"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "rd",
      thisCardRun: true,
      ability: {
        msg: "rearrange the top 5 cards of R&D",
        waitingPrompt: true,
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            continue_ability(
              (() => {
                const from = (state as any).corp?.deck?.slice(0, 5) || [];
                if (from.length > 0) {
                  return coreDefHelpers.reorderChoice(
                    "corp",
                    "corp",
                    from,
                    [],
                    from.length,
                    from,
                  );
                }
              })(),
              card,
              null,
            );
          },
        ),
      },
    },
  ],
};

// Infiltration
export const infiltration: CardDef = {
  title: "Infiltration",
  onPlay: coreChooseOne.chooseOneHelper([
    { option: "Gain 2 [Credits]", ability: gainCreditsAbility(2) },
    {
      option: "Expose a card",
      ability: {
        choices: {
          card: (c: Card) => coreCard.installed(c) && !coreCard.rezzed(c),
        },
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreExpose.expose(state, side, eid, [msg]);
          },
        ),
      },
    },
  ]),
};

// Information Sifting
export const informationSifting: CardDef = {
  title: "Information Sifting",
  makesRun: true,
  onPlay: runServerAbility("hq"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "hq",
      thisCardRun: true,
      mandatory: true,
      ability: {
        player: "corp",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (state as any).corp?.hand?.length >= 1;
        }),
        async: true,
        waitingPrompt: true,
        prompt: msg(
          "Choose up to ",
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            coreUtils.quantify(
              (state as any).corp?.hand?.length - 1 || 0,
              "card",
            ),
          " for the first pile",
        ),
        choices: {
          card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c),
          max: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            return (state as any).corp?.hand?.length - 1 || 0;
          }),
        },
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          yield continue_ability(
            state,
            "runner",
            informationSiftingWhichPile(
              targets || [],
              (state as any).corp?.hand || [],
            ).filter((c: Card) => !targets.includes(c)),
            card,
            null,
          );
        }),
      },
    },
  ],
};

function informationSiftingWhichPile(p1: Card[], p2: Card[]): any {
  return {
    waitingPrompt: true,
    prompt: msg("Choose a pile to access"),
    choices: ["Pile 1", "Pile 2"],
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          {
            player: "corp",
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return (state as any).corp?.hand?.length >= 1;
            }),
            async: true,
            waitingPrompt: true,
            prompt: msg(
              "Choose up to ",
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) =>
                coreUtils.quantify(
                  (state as any).corp?.hand?.length - 1 || 0,
                  "card",
                ),
              " for the first pile",
            ),
            choices: {
              card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c),
              max: req(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                return (state as any).corp?.hand?.length - 1 || 0;
              }),
            },
            effect: effect(
              continue_ability(
                state,
                "runner",
                informationSiftingWhichPile(
                  targets || [],
                  (state as any).corp?.hand || [],
                ).filter((c: Card) => !targets.includes(c)),
                card,
                null,
              ),
            ),
          },
          card,
          null,
        );
      },
    ),
  };
}

// Inject
export const inject: CardDef = {
  title: "Inject",
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
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const cards = (state as any).runner?.deck?.slice(0, 4) || [];
      const programs = cards.filter((c: Card) => coreCard.program(c));
      const others = cards.filter((c: Card) => !coreCard.program(c));
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreRevealing.reveal(state, side, cards)],
        [],
      );
      if (programs.length > 0) {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.trashCards(state, side, programs, {
              unpreventable: true,
              causeCard: card,
            }),
          ],
          [],
        );
        coreSay.systemMsg(
          state,
          side,
          `reveals ${programs.map((c: Card) => c.title).join(", ")} from the top of the stack, trashes them, and gains ${programs.length} [Credits]`,
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(state, side, programs.length),
          ],
          [],
        );
        for (const c of others) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.move(state, side, c, "hand"),
            ],
            [],
          );
          coreSay.systemMsg(state, side, `adds ${c.title} to the grip`);
        }
      } else {
        for (const c of others) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.move(state, side, c, "hand"),
            ],
            [],
          );
          coreSay.systemMsg(state, side, `adds ${c.title} to the grip`);
        }
      }
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Injection Attack
export const injectionAttack: CardDef = {
  title: "Injection Attack",
  makesRun: true,
  onPlay: {
    prompt: "Choose a server",
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
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          {
            prompt: "Choose an icebreaker",
            choices: {
              card: (c: Card) =>
                coreCard.installed(c) && coreCard.hasSubtype(c, "Icebreaker"),
            },
            async: true,
            effect: effect(
              coreIce.pump(msg, 2, "end-of-run"),
              coreRuns.makeRun(eid, msg, card),
            ),
          },
          card,
          null,
        );
      },
    ),
  },
};

// Inside Job
export const insideJob: CardDef = {
  title: "Inside Job",
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
        return (
          coreEvents.firstRunEvent(state, side, "encounter-ice") &&
          forms.thisCardIsRunSource
        );
      }),
      msg: msg(
        "bypass ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          ctx.ice?.title,
      ),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreRuns.bypassIce(state)],
          [],
        );
      }),
    },
  ],
};

// Insight
export const insight: CardDef = {
  title: "Insight",
  onPlay: {
    async: true,
    player: "corp",
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (state as any).corp?.deck?.length > 0;
      }),
    },
    waitingPrompt: true,
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
          coreEngine.resolveAbility(
            state,
            "corp",
            coreDefHelpers.reorderChoice(
              "corp",
              (state as any).corp?.deck?.slice(0, 4) || [],
            ),
            card,
            targets,
          ),
        ],
        [],
      );
      const top4 = (state as any).corp?.deck?.slice(0, 4) || [];
      coreSay.systemMsg(
        state,
        "runner",
        `reveals ${top4.map((c: Card) => c.title).join(", ")} from the top of R&D (top->bottom)`,
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreRevealing.reveal(state, "runner", eid, top4),
        ],
        [],
      );
    }),
  },
};

// Interdiction
export const interdiction: CardDef = {
  title: "Interdiction",
  onPlay: {
    msg: "prevent the Corp from rezzing non-ice cards on the Runner's turn",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreFlags.registerTurnFlag(
          card,
          "can-rez",
          function* (
            state: State,
            _side: Side,
            card: Card,
          ): Generator<any, any, any> {
            if (state.activePlayer === "runner" && !coreCard.ice(card)) {
              coreToasts.toast(
                state,
                "corp",
                "Cannot rez non-ice on the Runner's turn due to Interdiction",
              );
              return false;
            }
            return true;
          },
        );
      },
    ),
  },
  events: [
    {
      event: "runner-turn-begins",
      silent: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreFlags.registerTurnFlag(
            card,
            "can-rez",
            function* (
              state: State,
              _side: Side,
              card: Card,
            ): Generator<any, any, any> {
              if (state.activePlayer === "runner" && !coreCard.ice(card)) {
                coreToasts.toast(
                  state,
                  "corp",
                  "Cannot rez non-ice on the Runner's turn due to Interdiction",
                );
                return false;
              }
              return true;
            },
          );
        },
      ),
    },
  ],
  leavePlay: req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    coreFlags.clearAllFlagsForCard(state, side, card);
  }),
};

// Into the Depths
export const intoTheDepths: CardDef = {
  title: "Into the Depths",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: "successful-run",
      automatic: "gain-credits",
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
        return forms.thisCardRun;
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const icePassed =
          coreEvents.runEventCount(state, side, "pass-ice") || 0;
        const numChoices = Math.max(0, Math.min(3, icePassed));
        if (numChoices > 0) {
          yield continue_ability(
            state,
            side,
            intoTheDepthsChoice(intoTheDepthsAll, numChoices),
            card,
            null,
          );
        } else {
          return coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};
