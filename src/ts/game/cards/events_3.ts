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
  drainCredits,
  drawAbi,
  gainCreditsAbility,
  runAnyServerAbility,
  runServerAbility,
  runServerFromChoicesAbility,
} from "./events_1";
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

export function deepDiveAccess(cards: Card[]): any {
  return {
    prompt: "Choose a card to access",
    waitingPrompt: true,
    notDistinct: true,
    choices: cards.map((c: Card) => c.title),
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
        [{ asyncResult: "result" }, coreAccess.accessCard(state, side, msg)],
        [],
      );
      const remaining = cards.filter((c: Card) => !utils.sameCard(c, msg));
      return coreEid.makeResult(eid, remaining);
    }),
  };
}

// Déjà Vu
export const dejaVu: CardDef = {
  title: "Déjà Vu",
  onPlay: {
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          (state as any).runner?.discard?.length > 0 &&
          !coreCard.zoneLocked(state, "runner", "discard")
        );
      }),
    },
    prompt: "Choose a card to add to Grip",
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
      " to [their] Grip",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.move(state, side, msg, "hand");
        continue_ability(
          coreCard.hasSubtype(msg, "Virus")
            ? {
                prompt: "Choose a virus to add to Grip",
                onChangeGameState: {
                  silent: true,
                  req: req(function* (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ): Generator<any, any, any> {
                    return (state as any).runner?.discard?.some((c: Card) =>
                      coreCard.hasSubtype(c, "Virus"),
                    );
                  }),
                },
                msg: msg(
                  "add ",
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) => msg,
                  " to [their] Grip",
                ),
                choices: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  const disc = (state as any).runner?.discard || [];
                  return corePrompts.cancellable(
                    disc.filter((c: Card) => coreCard.hasSubtype(c, "Virus")),
                    "sorted",
                  );
                }),
                effect: effect(coreMoving.move(state, side, msg, "hand")),
              }
            : null,
          card,
          null,
        );
      },
    ),
  },
};

// Demolition Run
export const demolitionRun: CardDef = {
  title: "Demolition Run",
  makesRun: true,
  onPlay: runServerFromChoicesAbility(["HQ", "R&D"]),
  interactions: {
    "access-ability": {
      label: "Trash card",
      trash: true,
      msg: msg(
        "trash ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
        " at no cost",
      ),
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        return coreFlags.canTrash(state, "runner", t) && !coreCard.inDiscard(t);
      }),
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreMoving.trash(eid, { ...msg, seen: true }, { causeCard: card });
        },
      ),
    },
  },
};

// Deuces Wild
export const deucesWild: CardDef = {
  title: "Deuces Wild",
  onPlay: {
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          (() => {
            const all = [
              {
                effect: effect(coreGaining.gainCredits(eid, 3)),
                async: true,
                msg: "gain 3 [Credits]",
              },
              {
                async: true,
                effect: effect(coreDrawing.draw(eid, 2)),
                msg: "draw 2 cards",
              },
              {
                async: true,
                effect: effect(coreTags.loseTags(eid, 1)),
                msg: "remove 1 tag",
              },
              {
                prompt: "Choose 1 piece of ice to expose",
                msg: "expose 1 ice and make a run",
                choices: {
                  card: (c: Card) => coreCard.installed(c) && coreCard.ice(c),
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
                      coreExpose.expose(state, side, eid, [msg]),
                    ],
                    [],
                  );
                  yield continue_ability(
                    state,
                    side,
                    runAnyServerAbility(),
                    card,
                    null,
                  );
                }),
                cancel: runAnyServerAbility(),
              },
            ];
            const choice = (abis: any[]) => ({
              prompt: "Choose an ability to resolve",
              choices: abis.map(
                (a: any) => a.msg.charAt(0).toUpperCase() + a.msg.slice(1),
              ),
              waitingPrompt: true,
              async: true,
              effect: req(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                const chosen = abis.find(
                  (a: any) =>
                    msg === a.msg.charAt(0).toUpperCase() + a.msg.slice(1),
                );
                yield wait_for(
                  state,
                  [
                    { asyncResult: "result" },
                    coreEngine.resolveAbility(state, side, chosen, card, null),
                  ],
                  [],
                );
                if (abis.length === 4) {
                  yield continue_ability(
                    state,
                    side,
                    choice(abis.filter((a: any) => a !== chosen)),
                    card,
                    null,
                  );
                } else {
                  return coreEid.effectCompleted(state, side, eid);
                }
              }),
            });
            return choice(all);
          })(),
          card,
          null,
        );
      },
    ),
  },
};

// Diana's Hunt
export const dianasHunt: CardDef = {
  title: "Diana's Hunt",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: "encounter-ice",
      skippable: true,
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (
            coreDefHelpers.allCardsInHandStar(state, "runner") || []
          ).some((c: Card) => coreCard.program(c));
        }),
        prompt: "Install a program from the grip?",
        yesAbility: {
          prompt: "Choose a program to install",
          async: true,
          choices: {
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              const t = targets[0];
              return coreCard.inHandStar(state, t) && coreCard.program(t);
            }),
          },
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreInstalling.runnerInstall(
                eid,
                { ...msg, special: { ...msg?.special, dianaInstalled: true } },
                {
                  ignoreAllCost: true,
                  msgKeys: { installSource: card, displayOrigin: true },
                },
              );
            },
          ),
        },
      },
    },
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
        const installedCards = (
          coreBoard.allActiveInstalled(state, "runner") || []
        ).filter((c: Card) => c.special?.dianaInstalled);
        if (installedCards.length > 0) {
          coreSay.systemMsg(
            state,
            "runner",
            `trashes ${installedCards.length} card (${installedCards.map((c: Card) => c.title).join(", ")}) at the end of the run from Diana's Hunt`,
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.trashCards(state, "runner", eid, installedCards, {
                causeCard: card,
              }),
            ],
            [],
          );
        } else {
          return coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};

// Diesel
export const diesel: CardDef = {
  title: "Diesel",
  onPlay: drawAbi(3),
};

// Direct Access
export const directAccess: CardDef = {
  title: "Direct Access",
  makesRun: true,
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
        const corp = (state as any).corp;
        const runner = (state as any).runner;
        return (
          utils.sameCard(msg, corp?.identity) ||
          utils.sameCard(msg, runner?.identity)
        );
      }),
      value: true,
    },
  ],
  onPlay: {
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      coreCheckpoint.fakeCheckpoint(state);
      yield continue_ability(
        state,
        side,
        {
          async: true,
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
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreRuns.makeRun(eid, msg, card);
            },
          ),
        },
        card,
        null,
      );
    }),
  },
  events: [
    {
      event: "run-ends",
      unregisterOnceResolved: true,
      async: true,
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
          {
            optional: {
              prompt: "Shuffle Direct Access into the Stack?",
              yesAbility: {
                msg: "shuffle itself into the Stack",
                effect: effect(
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) => {
                    coreMoving.move(coreCard.getCard(state, card), "deck");
                    coreShuffling.shuffle(state, side, "deck");
                  },
                ),
              },
            },
          },
          card,
          null,
        );
      }),
    },
  ],
};

// Dirty Laundry
export const dirtyLaundry: CardDef = {
  title: "Dirty Laundry",
  makesRun: true,
  onPlay: runAnyServerAbility(),
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
      msg: "gain 5 [Credits]",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits("runner", eid, 5);
        },
      ),
    },
  ],
};

// Diversion of Funds
export const diversionOfFunds: CardDef = {
  title: "Diversion of Funds",
  makesRun: true,
  onPlay: runServerAbility("hq"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "hq",
      thisCardRun: true,
      ability: drainCredits("runner", "corp", 5, 1),
    },
  ],
};

// Divide and Conquer
export const divideAndConquer: CardDef = {
  title: "Divide and Conquer",
  makesRun: true,
  onPlay: runServerAbility("archives"),
  events: [
    {
      event: "end-breach-server",
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
        return ctx.server === "archives" && ctx.successful;
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
            coreAccess.breachServer(state, side, eid, ["hq"], { noRoot: true }),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreAccess.breachServer(state, side, eid, ["rd"], { noRoot: true }),
          ],
          [],
        );
      }),
    },
  ],
};

// Drive By
export const driveBy: CardDef = {
  title: "Drive By",
  onPlay: {
    choices: {
      card: (c: Card) => {
        const topmost = coreCard.getNestedHost(c);
        if (!topmost) return false;
        const zone = coreCard.getZone(topmost);
        return (
          zone &&
          coreServers.isRemote(zone[1]) &&
          zone[zone.length - 1] === "content" &&
          !topmost.rezzed
        );
      },
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
        [{ asyncResult: "result" }, coreExpose.expose(state, side, eid, [msg])],
        [],
      );
      const exposedCard = msg;
      if (coreCard.asset(exposedCard) || coreCard.upgrade(exposedCard)) {
        coreSay.systemMsg(
          state,
          "runner",
          `uses ${card.title} to trash ${exposedCard.title}`,
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.trash(
              state,
              "runner",
              eid,
              { ...exposedCard, seen: true },
              { causeCard: card },
            ),
          ],
          [],
        );
      }
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Early Bird
export const earlyBird: CardDef = {
  title: "Early Bird",
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
    msg: msg(
      "make a run on ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
      " and gain [Click]",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainClicks(1);
        coreRuns.makeRun(eid, msg, card);
      },
    ),
  },
};

// Easy Mark
export const easyMark: CardDef = {
  title: "Easy Mark",
  onPlay: gainCreditsAbility(3),
};

// Embezzle
export const embezzle: CardDef = {
  title: "Embezzle",
  makesRun: true,
  onPlay: runServerAbility("hq"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "hq",
      thisCardRun: true,
      mandatory: true,
      ability: {
        prompt: "Choose a card type",
        choices: ["Asset", "Upgrade", "Operation", "ICE"],
        msg: msg(
          "reveal 2 cards from HQ and trash all ",
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            msg,
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            msg !== "ICE" ? "s" : "",
        ),
        async: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const corpHand = (state as any).corp?.hand || [];
          const cardsToReveal = corpHand
            .slice(0, 2)
            .sort(() => Math.random() - 0.5);
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreRevealing.revealLoud(state, side, card, null, cardsToReveal),
            ],
            [],
          );
          const cardsToTrash = cardsToReveal.filter((c: Card) =>
            coreCard.isType(c, msg),
          );
          const credits = cardsToTrash.length * 4;
          if (credits > 0) {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreMoving.trashCards(
                  state,
                  "runner",
                  cardsToTrash.map((c: Card) => ({ ...c, seen: true })),
                  { causeCard: card },
                ),
              ],
              [],
            );
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreGaining.gainCredits(state, "runner", eid, credits),
              ],
              [],
            );
            coreSay.systemMsg(
              state,
              side,
              `uses ${card.title} to trash ${cardsToTrash.map((c: Card) => c.title).join(", ")} from HQ and gain ${credits} [Credits]`,
            );
          }
          return coreEid.effectCompleted(state, side, eid);
        }),
      },
    },
  ],
};

// Emergency Shutdown
export const emergencyShutdown: CardDef = {
  title: "Emergency Shutdown",
  onPlay: {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes("hq");
    }),
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (coreBoard.allInstalled(state, "corp") || []).some(
          (c: Card) => coreCard.ice(c) && coreCard.rezzed(c),
        );
      }),
    },
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
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
        [{ asyncResult: "result" }, coreRezzing.derez(state, side, eid, msg)],
        [],
      );
    }),
  },
};

// Emergent Creativity
export const emergentCreativity: CardDef = {
  title: "Emergent Creativity",
  onPlay: {
    prompt: "Choose pieces of hardware and/or programs to trash",
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
          (state as any).runner?.hand?.length > 0
        );
      }),
    },
    choices: {
      card: (c: Card) =>
        (coreCard.hardware(c) || coreCard.program(c)) && coreCard.inHand(c),
      max: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (state as any).runner?.hand?.length || 0;
      }),
    },
    cancel: {
      msg: "trash no cards and shuffle the stack",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreEngine.triggerEvent(state, side, "searched-stack");
          coreShuffling.shuffle(state, side, "deck");
        },
      ),
    },
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const trashCost = (targets || []).reduce(
        (sum: number, c: Card) => sum + (c.cost || 0),
        0,
      );
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
      yield continue_ability(
        state,
        side,
        {
          async: true,
          prompt: "Choose a piece of hardware or program to install",
          msg: msg(
            "trash ",
            targets?.length > 0
              ? targets.map((c: Card) => c.title).join(", ")
              : "no cards",
            " and install ",
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              msg,
            " from the Stack, lowering the cost by ",
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              trashCost,
          ),
          choices: {
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return corePrompts.cancellable(
                (state as any).runner?.deck?.filter(
                  (c: Card) =>
                    (coreCard.program(c) || coreCard.hardware(c)) &&
                    coreInstalling.runnerCanPayAndInstall(
                      state,
                      side,
                      { ...eid, source: card },
                      c,
                      { costBonus: -trashCost },
                    ),
                ) || [],
                "sorted",
              );
            }),
          },
          cancel: {
            msg:
              "trash " +
              (targets?.length > 0
                ? targets.map((c: Card) => c.title).join(", ")
                : "no cards") +
              " and shuffle the stack",
            effect: effect(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                coreEngine.triggerEvent(state, side, "searched-stack");
                coreShuffling.shuffle(state, side, "deck");
              },
            ),
          },
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreEngine.triggerEvent(state, side, "searched-stack");
              coreShuffling.shuffle(state, side, "deck");
              coreInstalling.runnerInstall(
                { ...eid, source: card, sourceType: "runner-install" },
                msg,
                { costBonus: -trashCost },
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

// Employee Strike
export const employeeStrike: CardDef = {
  title: "Employee Strike",
  onPlay: {
    msg: "disable the Corp's identity",
  },
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
        return utils.sameCard(msg, (state as any).corp?.identity);
      }),
      value: true,
    },
  ],
};

// En Passant
export const enPassant: CardDef = {
  title: "En Passant",
  onPlay: {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return (state as any).runner?.register?.successfulRun;
    }),
    prompt: "Choose an unrezzed piece of ice that you passed on your last run",
    choices: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const lastRun = (state as any).runner?.register?.lastRun;
        if (!lastRun) return false;
        const events = lastRun.events || [];
        return events
          .filter((e: [string, any]) => e[0] === "pass-ice")
          .map((e: [string, any]) => e[1])
          .map((e: any) => coreCard.getCard(state, e.ice))
          .filter((c: Card) => c && !coreCard.rezzed(c))
          .some((c: Card) => utils.sameCard(msg, c));
      }),
    },
    msg: msg(
      "trash ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, msg),
    ),
    async: true,
    cancel: { msg: "do nothing" },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.trash(eid, msg, { causeCard: card });
      },
    ),
  },
};

// Encore
export const encore: CardDef = {
  title: "Encore",
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
        reg?.successfulRun?.includes("hq") &&
        reg?.successfulRun?.includes("rd") &&
        reg?.successfulRun?.includes("archives")
      );
    }),
    rfgInsteadOfTrashing: true,
    msg: "take an additional turn after this one",
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const s = coreUpdate.updateIn(
        state,
        ["runner", "extra-turns"],
        (n: number) => (n || 0) + 1,
      );
      coreSay.systemMsg(state, side, "take an additional turn after this one");
    }),
  },
};

// Escher
export const escher: CardDef = {
  title: "Escher",
  makesRun: true,
  onPlay: runServerAbility("hq"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "hq",
      thisCardRun: true,
      mandatory: true,
      ability: {
        async: true,
        msg: "rearrange installed ice",
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            continue_ability(
              (() => ({
                async: true,
                prompt: "Choose 2 pieces of ice to swap positions",
                choices: {
                  card: (c: Card) => coreCard.installed(c) && coreCard.ice(c),
                  max: 2,
                },
                effect: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  if ((targets || []).length === 2) {
                    yield wait_for(
                      state,
                      [
                        { asyncResult: "result" },
                        coreMoving.swapIce(state, side, targets[0], targets[1]),
                      ],
                      [],
                    );
                    yield continue_ability(
                      state,
                      side,
                      escherAbility(),
                      card,
                      null,
                    );
                  } else {
                    coreSay.systemMsg(
                      state,
                      side,
                      "has finished rearranging ice",
                    );
                    return coreEid.effectCompleted(state, side, eid);
                  }
                }),
              }))(),
              card,
              null,
            );
          },
        ),
      },
    },
  ],
};

function escherAbility(): any {
  return {
    async: true,
    prompt: "Choose 2 pieces of ice to swap positions",
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.ice(c),
      max: 2,
    },
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if ((targets || []).length === 2) {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.swapIce(state, side, targets[0], targets[1]),
          ],
          [],
        );
        yield continue_ability(state, side, escherAbility(), card, null);
      } else {
        coreSay.systemMsg(state, side, "has finished rearranging ice");
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Eureka!
export const eureka: CardDef = {
  title: "Eureka!",
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
      const topCard = (state as any).runner?.deck?.[0];
      const canInstall =
        topCard &&
        (coreCard.hardware(topCard) ||
          coreCard.program(topCard) ||
          coreCard.resource(topCard)) &&
        coreInstalling.runnerCanPayAndInstall(
          state,
          side,
          { ...eid, source: card },
          topCard,
          { costBonus: -10 },
        );
      if (canInstall) {
        yield continue_ability(
          state,
          side,
          {
            optional: {
              prompt: msg(
                "Install ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => msg,
                "?",
              ),
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
                    coreInstalling.runnerInstall(eid, topCard, {
                      msgKeys: { displayOrigin: true, installSource: card },
                      costBonus: -10,
                    });
                  },
                ),
              },
              noAbility: {
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
                      coreRevealing.reveal(state, side, topCard),
                    ],
                    [],
                  );
                  coreSay.systemMsg(
                    state,
                    side,
                    `reveals ${topCard.title} from the top of the stack and trashes it`,
                  );
                  yield wait_for(
                    state,
                    [
                      { asyncResult: "result" },
                      coreMoving.trash(eid, topCard, {
                        unpreventable: true,
                        causeCard: card,
                      }),
                    ],
                    [],
                  );
                }),
              },
            },
          },
          card,
          null,
        );
      } else {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreRevealing.reveal(state, side, topCard),
          ],
          [],
        );
        coreSay.systemMsg(
          state,
          side,
          `reveals ${topCard.title} from the top of the stack and trashes it`,
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.trash(state, side, eid, topCard, {
              unpreventable: true,
              causeCard: card,
            }),
          ],
          [],
        );
      }
    }),
  },
};

// Exclusive Party
export const exclusiveParty: CardDef = {
  title: "Exclusive Party",
  onPlay: {
    msg: msg(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const discard = (state as any).runner?.discard || [];
      const count = discard.filter((c: Card) => c.title === card.title).length;
      return `draw 1 card and gain ${count} [Credits]`;
    }),
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
        [{ asyncResult: "result" }, coreDrawing.draw(state, side, 1)],
        [],
      );
      const discard = (state as any).runner?.discard || [];
      const count = discard.filter((c: Card) => c.title === card.title).length;
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreGaining.gainCredits(state, side, eid, count),
        ],
        [],
      );
    }),
  },
};

// Executive Wiretaps
export const executiveWiretaps: CardDef = {
  title: "Executive Wiretaps",
  onPlay: {
    msg: msg(
      "reveal ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (state as any).corp?.hand?.map((c: Card) => c.title).join(", "),
      " from HQ",
    ),
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (state as any).corp?.hand?.length > 0;
      }),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreRevealing.reveal(state, side, eid, (state as any).corp?.hand || []);
      },
    ),
  },
};

// Exploit
export const exploit: CardDef = {
  title: "Exploit",
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
        reg?.successfulRun?.includes("hq") &&
        reg?.successfulRun?.includes("rd") &&
        reg?.successfulRun?.includes("archives")
      );
    }),
    prompt: "Choose up to 3 pieces of ice to derez",
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (coreBoard.allInstalled(state, "corp") || []).some(
          (c: Card) => coreCard.ice(c) && coreCard.rezzed(c),
        );
      }),
    },
    choices: {
      max: 3,
      card: (c: Card) => coreCard.rezzed(c) && coreCard.ice(c),
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
          coreRezzing.derez(state, side, eid, targets),
        ],
        [],
      );
    }),
  },
};

// Exploratory Romp
export const exploratoryRomp: CardDef = {
  title: "Exploratory Romp",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: "successful-run-replace-breach",
      mandatory: true,
      thisCardRun: true,
      ability: {
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
          return (coreBoard.allInstalled(state, "corp") || []).some(
            (c: Card) => {
              const adv = coreCard.getCounters(c, "advancement");
              const server = coreCard.getZone(c);
              return (
                adv > 0 &&
                server &&
                coreRuns.targetServer(ctx) === (server as string[])[1]
              );
            },
          );
        }),
        prompt: "How many advancements counters do you want to remove?",
        choices: ["0", "1", "2", "3"],
        async: true,
        waitingPrompt: true,
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
          const n = parseInt(msg, 10);
          yield continue_ability(
            state,
            side,
            {
              choices: {
                card: (c: Card) => {
                  const adv = coreCard.getCounters(c, "advancement");
                  const server = coreCard.getZone(c);
                  return (
                    adv > 0 &&
                    server &&
                    coreRuns.targetServer(ctx) === (server as string[])[1]
                  );
                },
              },
              msg: msg(
                "remove ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => coreUtils.quantify(n, "advancement counter"),
                " from ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => coreToString.cardStr(state, msg),
              ),
              async: true,
              effect: req(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                const toRemove = Math.min(
                  n,
                  coreCard.getCounters(msg, "advancement"),
                );
                coreProps.addProp(
                  state,
                  "corp",
                  eid,
                  msg,
                  "advance-counter",
                  -toRemove,
                );
              }),
            },
            card,
            null,
          );
        }),
      },
    },
  ],
};

// Express Delivery
export const expressDelivery: CardDef = {
  title: "Express Delivery",
  onPlay: {
    prompt: "Choose a card to add to the grip",
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
      return (state as any).runner?.deck?.slice(0, 4) || [];
    }),
    msg: "look at the top 4 cards of the stack and add 1 of them to the grip",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.move(state, side, msg, "hand");
        coreShuffling.shuffle(state, side, "deck");
      },
    ),
  },
};

// Eye for an Eye
export const eyeForAnEye: CardDef = {
  title: "Eye for an Eye",
  makesRun: true,
  onPlay: {
    ...(runServerAbility("hq") || {}),
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return !utils.isTagged(state);
    }),
  },
  interactions: {
    "access-ability": {
      label: "Trash card",
      trash: true,
      cost: [corePayment.toC("trash-from-hand", 1)],
      msg: msg(
        "trash ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
        " from HQ",
      ),
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreMoving.trash(
            eid,
            { ...msg, seen: true },
            { accessed: true, causeCard: card },
          );
        },
      ),
    },
  },
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
      async: true,
      msg: "take 1 tag and access 1 additional card from HQ",
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
            coreTags.gainTags(state, "runner", 1, { unpreventable: true }),
          ],
          [],
        );
        coreEngine.registerEvents(state, side, card, [
          coreDefHelpers.breachAccessBonus("hq", 1, { duration: "end-of-run" }),
        ]);
        return coreEid.effectCompleted(state, side, eid);
      }),
    },
  ],
};

// Falsified Credentials
export const falsifiedCredentials: CardDef = {
  title: "Falsified Credentials",
  onPlay: {
    prompt: "Choose one",
    choices: ["Agenda", "Asset", "Upgrade"],
    msg: msg(
      "guess ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          (() => {
            const chosenType = msg;
            return {
              choices: {
                card: (c: Card) => {
                  const topmost = coreCard.getNestedHost(c);
                  if (!topmost) return false;
                  const zone = coreCard.getZone(topmost);
                  return (
                    zone &&
                    coreServers.isRemote(zone[1]) &&
                    zone[zone.length - 1] === "content" &&
                    !topmost.rezzed
                  );
                },
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
                    coreExpose.expose(state, side, eid, [msg]),
                  ],
                  [],
                );
                if (msg && chosenType === msg?.type) {
                  yield continue_ability(
                    state,
                    "runner",
                    {
                      msg: "gain 5 [Credits]",
                      async: true,
                      effect: effect(coreGaining.gainCredits(eid, 5)),
                    },
                    card,
                    null,
                  );
                }
              }),
            };
          })(),
          card,
          null,
        );
      },
    ),
  },
};

// Fear the Masses
export const fearTheMasses: CardDef = {
  title: "Fear the Masses",
  makesRun: true,
  onPlay: runServerAbility("hq"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "hq",
      thisCardRun: true,
      mandatory: true,
      ability: {
        async: true,
        msg: "force the Corp to trash the top card of R&D",
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
              coreMoving.mill(state, "corp", "corp", 1),
            ],
            [],
          );
          const n =
            (state as any).runner?.hand?.filter((c: Card) =>
              utils.sameCard((x: Card) => x.title, card, c),
            ).length || 0;
          yield continue_ability(
            state,
            side,
            {
              async: true,
              prompt: msg(
                "How many copies of ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => card.title,
                " do you want to reveal?",
              ),
              choices: {
                card: (c: Card) =>
                  coreCard.inHand(c) && utils.sameCard((x: Card) => x.title, card, c),
                max: n,
              },
              msg: msg(
                "reveal ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) =>
                  coreUtils.quantify((targets || []).length, "cop", "y", "ies"),
                " of itself, forcing the Corp to trash ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) =>
                  coreUtils.quantify((targets || []).length, "additional card"),
                " from the top of R&D",
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
                  [
                    { asyncResult: "result" },
                    coreRevealing.reveal(state, "runner", targets || []),
                  ],
                  [],
                );
                yield wait_for(
                  state,
                  [
                    { asyncResult: "result" },
                    coreMoving.mill(state, "corp", eid, (targets || []).length),
                  ],
                  [],
                );
              }),
            },
            card,
            null,
          );
        }),
      },
    },
  ],
};

// Feint
export const feint: CardDef = {
  title: "Feint",
  makesRun: true,
  onPlay: runServerAbility("hq"),
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
        const count = ((coreCard.getCard(state, card)?.special as any)?.bypassCount as number) || 0;
        return count < 2;
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
        const c = coreUpdate.updateIn(
          card,
          ["special", "bypassCount"],
          (n: number) => (n || 0) + 1,
        );
      }),
    },
    {
      event: "successful-run",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreAccess.preventAccess(state, side);
        },
      ),
    },
  ],
};
