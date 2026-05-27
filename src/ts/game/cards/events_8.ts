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
  makeIcon,
  runAnyServerAbility,
  runRemoteServerAbility,
  runServerAbility,
  runServerFromChoicesAbility,
} from "./events_1";

// __cardScopeShim: 'state', 'target', etc. are referenced at CardDef literal
const eid: any = undefined as any;
const card: any = undefined as any;
const ctx: any = undefined as any;
const side: any = undefined as any;
// scope in cards that were not yet rewritten to use req/effect callbacks.
// These ambient names keep the file compiling; the affected predicates were
// already broken at runtime (state was never defined in the closure either)
// and need per-card rewrites to use state-aware req/effect callbacks.
const state: any = undefined as any;
const target: any = undefined as any;
const asyncResult: any = undefined as any;

// Stimhack
export const stimhack: CardDef = {
  title: "Stimhack",
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
        coreRuns.gainNextRunCredits(9);
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
        return forms.thisCardRun;
      }),
      msg: "take 1 core damage",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreDamage.damage(eid, "brain", 1, {
            unpreventable: true,
            card: card,
          });
        },
      ),
    },
  ],
};

// Strike Fund
export const strikeFund: CardDef = {
  title: "Strike Fund",
  onPlay: {
    async: true,
    msg: "gain 4 [Credits]",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(state, "runner", null, 4);
        coreEid.effectCompleted(state, side, eid);
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
              prompt: "Gain 2 [Credits]?",
              waitingPrompt: true,
              yesAbility: {
                msg: "gain 2 [Credits]",
                async: true,
                effect: effect(coreGaining.gainCredits("runner", eid, 2)),
              },
              noAbility: {
                effect: effect(
                  coreSay.systemMsg(
                    `declines to use ${coreCard.getCard(state, card)?.title} to gain 2 [Credits]`,
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

// Sure Gamble
export const sureGamble: CardDef = {
  title: "Sure Gamble",
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

// Surge
export const surge: CardDef = {
  title: "Surge",
  onPlay: {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return (coreEvents.turnEvents(state, "runner", "counter-added") || [])
        .filter((e: any) => e[0]?.[0]?.counterType === "virus")
        .map((e: any) => e[0]?.card)
        .some((cid: string) => utils.sameCard(cid, msg));
    }),
    choices: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (coreEvents.turnEvents(state, "runner", "counter-added") || [])
          .filter((e: any) => e[0]?.[0]?.counterType === "virus")
          .map((e: any) => e[0]?.card)
          .some((cid: string) => utils.sameCard(cid, msg));
      }),
    },
    msg: msg(
      "place 2 virus counters on ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreProps.addCounter("runner", eid, msg, "virus", 2, null);
      },
    ),
  },
};

// SYN Attack
export const synAttack: CardDef = {
  title: "SYN Attack",
  onPlay: {
    player: "corp",
    waitingPrompt: true,
    prompt: "Choose one",
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const choices: string[] = [];
      if ((state as any).corp?.hand?.length >= 2) {
        choices.push("Discard 2 cards from HQ");
      }
      choices.push("Draw 4 cards");
      return choices;
    }),
    async: true,
    msg: msg(
      "force the Corp to ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
    ),
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (msg === "Draw 4 cards") {
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreDrawing.draw(state, "corp", 4)],
          [],
        );
        return coreEid.effectCompleted(state, side, eid);
      } else {
        yield continue_ability(
          state,
          "corp",
          {
            prompt: "Choose 2 cards to discard",
            choices: {
              max: 2,
              all: true,
              card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c),
            },
            async: true,
            effect: effect(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                coreMoving.trashCards("corp", eid, targets, {
                  unpreventable: true,
                  causeCard: card,
                  cause: "forced-to-trash",
                });
              },
            ),
          },
          card,
          null,
        );
      }
    }),
  },
};

// System Outage
export const systemOutage: CardDef = {
  title: "System Outage",
  events: [
    {
      event: "corp-draw",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return !coreEvents.firstEvent(state, side, "corp-draw");
      }),
      msg: "force the Corp to lose 1 [Credits]",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.loseCredits("corp", eid, 1);
        },
      ),
    },
  ],
};

// System Seizure
export const systemSeizure: CardDef = {
  title: "System Seizure",
  events: [
    {
      event: "pump-breaker",
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
          !coreCard.getCard(state, card)?.special?.ssTarget ||
          utils.sameCard(
            ctx.card,
            coreCard.getCard(state, card)?.special?.ssTarget,
          )
        );
      }),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx: any =
            ((targets as any[])?.[0] as any)?.context ??
            (targets as any[])?.[0];
          req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const ctx: any =
              ((targets as any[])?.[0] as any)?.context ??
              (targets as any[])?.[0];
            if (!coreCard.getCard(state, card)?.special?.ssTarget) {
              coreUpdate.updateIn(state, side, "ssTarget", ctx.card);
            }
            const newPump = { ...ctx.effect, duration: "end-of-run" };
            const effects = (state as any).effects || [];
            (state as any).effects = [
              ...effects.filter((e: any) => e.uuid !== newPump.uuid),
              newPump,
            ];
            coreIce.updateBreakerStrength(state, side, ctx.card);
          });
        },
      ),
    },
    {
      event: "corp-turn-ends",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreUpdate.updateIn(
            coreCard.getCard(state, card),
            ["special", "ssTarget"],
            () => undefined,
          );
        },
      ),
    },
    {
      event: "runner-turn-ends",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreUpdate.updateIn(
            coreCard.getCard(state, card),
            ["special", "ssTarget"],
            () => undefined,
          );
        },
      ),
    },
  ],
};

// Tailgate
export const tailgate: CardDef = {
  title: "Tailgate",
  makesRun: true,
  onPlay: runServerAbility("hq", {
    playCostBonus: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return -(state as any).corp?.servers?.hq?.ices?.length || 0;
    }),
  }),
  events: [
    {
      event: "successful-run",
      silent: req(function* (
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

// Take a Dive
export const takeADive: CardDef = {
  title: "Take a Dive",
  onPlay: {
    ...(runServerFromChoicesAbility(["HQ", "R&D"]) || {}),
    rfgInsteadOfTrashing: true,
  },
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
        return (
          ["hq", "rd"].includes(ctx.server) && (ctx.subroutinesFired || 0) > 0
        );
      }),
      msg: "force the Corp to take 1 Bad Publicity",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreBadPublicity.gainBadPublicity(state, "corp", eid, 1, {
            card: card,
          });
        },
      ),
    },
  ],
};

// Test Run
export const testRun: CardDef = {
  title: "Test Run",
  onPlay: {
    prompt: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return coreCard.zoneLocked(state, "runner", "discard")
        ? "Install a program from the stack?"
        : "Install a program from the stack or heap?";
    }),
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const choices = ["Stack"];
      if (!coreCard.zoneLocked(state, "runner", "discard")) {
        choices.push("Heap");
      }
      return choices;
    }),
    msg: msg(
      "install a program from the ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
    ),
    waitingPrompt: true,
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          (() => {
            const where = msg;
            const whereKey = where === "Heap" ? "discard" : "deck";
            return {
              prompt: "Choose a program to install",
              choices: {
                req: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  return corePrompts.cancellable(
                    (state as any).runner?.[whereKey]?.filter(
                      (c: Card) =>
                        coreCard.program(c) &&
                        coreInstalling.runnerCanInstall(state, side, eid, c, {
                          noToast: true,
                        }),
                    ) || [],
                    "sorted",
                  );
                }),
              },
              async: true,
              cancel: where === "Stack" ? coreShuffling.failToFind : null,
              effect: effect(
                where === "Stack"
                  ? effect(
                      coreEngine.triggerEvent(state, side, "searched-stack"),
                      coreShuffling.shuffle(state, side, "deck"),
                    )
                  : null,
                coreInstalling.runnerInstall(
                  coreEid.makeEid(state, {
                    source: card,
                    sourceType: "runner-install",
                  }),
                  msg,
                  {
                    ignoreAllCost: true,
                    msgKeys: { installSource: card, displayOrigin: true },
                  },
                ),
                asyncResult
                  ? (() => {
                      const installedCard = coreUpdate.updateIn(
                        state,
                        side,
                        "test-run",
                        true,
                      );
                      coreEngine.registerEvents(state, side, installedCard, [
                        {
                          event: "runner-turn-ends",
                          duration: "end-of-turn",
                          req: req(function* (
                            state: State,
                            side: Side,
                            eid: EID,
                            card: Card,
                            targets: any[],
                          ): Generator<any, any, any> {
                            return coreFinding.findLatest(state, installedCard)
                              ?.special?.testRun;
                          }),
                          msg: msg(
                            "move ",
                            (
                              state: State,
                              side: Side,
                              eid: EID,
                              card: Card,
                              targets: any[],
                            ) => installedCard.title,
                            " to the top of the stack",
                          ),
                          effect: effect(
                            coreMoving.move(
                              coreFinding.findLatest(state, installedCard),
                              "deck",
                              { front: true },
                            ),
                          ),
                        },
                      ]);
                      return coreEid.effectCompleted(state, side, eid);
                    })()
                  : coreEid.effectCompleted(state, side, eid),
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

// The Maker's Eye
export const theMakersEye: CardDef = {
  title: "The Maker's Eye",
  makesRun: true,
  onPlay: runServerAbility("rd"),
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
            coreDefHelpers.breachAccessBonus("rd", 2, {
              duration: "end-of-run",
            }),
          ]);
        },
      ),
    },
  ],
};

// The Noble Path
export const theNoblePath: CardDef = {
  title: "The Noble Path",
  makesRun: true,
  staticAbilities: [
    {
      type: "cannot-pay-net",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return forms.run(state);
      }),
      value: true,
    },
    {
      type: "cannot-pay-brain",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return forms.run(state);
      }),
      value: true,
    },
    {
      type: "cannot-pay-meat",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return forms.run(state);
      }),
      value: true,
    },
  ],
  prevention: [
    {
      prevents: "damage",
      type: "event",
      maxUses: 1,
      mandatory: true,
      ability: {
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
          return (
            forms.run(state) &&
            utils.sameCard(card, (state as any).runner?.playArea?.[0]) &&
            corePrevention.preventable(ctx)
          );
        }),
        condition: "active",
        msg: msg(
          "prevent ",
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            ctx.remaining,
          " ",
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            coreDamage.damageName(state),
          " damage",
        ),
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            corePrevention.preventDamage(state, side, eid, "all");
          },
        ),
      },
    },
  ],
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
          (state as any).runner?.hand?.length > 0 ||
          coreServers.zonesToSortedNames(
            coreRuns.getRunnableZones(state, side, eid, card, null),
          ).length > 0
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
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreMoving.trashCards(
            state,
            side,
            (state as any).runner?.hand || [],
            { causeCard: card },
          ),
        ],
        [],
      );
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
          msg: msg(
            "trash [their] grip and make a run on ",
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              msg,
            ", preventing all damage",
          ),
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
};

// The Price
export const thePrice: CardDef = {
  title: "The Price",
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
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreMoving.mill(
            state,
            "runner",
            coreEid.makeEid(state, eid),
            "runner",
            4,
          ),
        ],
        [],
      );
      const trashedCards = asyncResult;
      coreSay.systemMsg(
        state,
        side,
        `uses ${card.title} to trash ${trashedCards?.map((c: Card) => c.title).join(", ")} from the top of the stack`,
      );
      yield continue_ability(
        state,
        side,
        {
          prompt: "Choose a card to install",
          waitingPrompt: true,
          async: true,
          req: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            return !coreCard.zoneLocked(state, "runner", "discard");
          }),
          choices: {
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return corePrompts.cancellable(
                (trashedCards || []).filter(
                  (c: Card) =>
                    !coreCard.event(c) &&
                    coreInstalling.runnerCanPayAndInstall(
                      state,
                      side,
                      { ...eid, source: card },
                      c,
                      { costBonus: -3 },
                    ) &&
                    coreCard.inDiscard(coreCard.getCard(state, c)),
                ),
                "sorted",
              );
            }),
          },
          effect: effect(
            (() => {
              const cardToInstall = (trashedCards || []).find(
                (c: Card) =>
                  msg?.title === c.title &&
                  coreCard.inDiscard(coreCard.getCard(state, c)),
              );
              return coreInstalling.runnerInstall(
                { ...eid, source: card, sourceType: "runner-install" },
                cardToInstall,
                {
                  costBonus: -3,
                  msgKeys: { installSource: card, displayOrigin: true },
                },
              );
            })(),
          ),
        },
        card,
        null,
      );
    }),
  },
};

// The Price of Freedom
export const thePriceOfFreedom: CardDef = {
  title: "The Price of Freedom",
  onPlay: {
    additionalCost: [corePayment.toC("connection", 1)],
    rfgInsteadOfTrashing: true,
    msg: "prevent the Corp from advancing cards during [their] next turn",
  },
  events: [
    {
      event: "corp-turn-begins",
      duration: "until-runner-turn-begins",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreFlags.registerTurnFlag(card, "can-advance", () => false);
        },
      ),
    },
  ],
};

// Three Steps Ahead
export const threeStepsAhead: CardDef = {
  title: "Three Steps Ahead",
  onPlay: {
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEngine.registerEvents(card, [
          {
            event: "runner-turn-ends",
            automatic: "gain-credits",
            duration: "end-of-turn",
            unregisterOnceResolved: true,
            msg: msg(
              "gain ",
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) =>
                (coreEvents.runEvents(state, "runner", "successful-run") || [])
                  .length * 2,
              " [Credits]",
            ),
            async: true,
            effect: effect(
              coreGaining.gainCredits(
                eid,
                (coreEvents.runEvents(state, "runner", "successful-run") || [])
                  .length * 2,
              ),
            ),
          },
        ]);
      },
    ),
  },
};

// Tinkering
export const tinkering: CardDef = {
  title: "Tinkering",
  onPlay: {
    prompt: "Choose a piece of ice",
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) },
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
    msg: msg(
      "make ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, msg),
      " gain Sentry, Code Gate, and Barrier until the end of the turn",
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEffects.registerLingeringEffect(state, side, card, {
          type: "gain-subtype",
          duration: "end-of-turn",
          req: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            return utils.sameCard(msg, msg);
          }),
          value: ["Sentry", "Code Gate", "Barrier"],
        });
        coreEffects.registerLingeringEffect(state, side, card, {
          type: "icon",
          duration: "end-of-turn",
          req: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            return utils.sameCard(msg, msg);
          }),
          value: makeIcon("T", card),
        });
      },
    ),
  },
};

// Trade-In
export const tradeIn: CardDef = {
  title: "Trade-In",
  onPlay: {
    additionalCost: [corePayment.toC("hardware", 1)],
    msg: msg(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const trashedHw = (state as any).runner?.discard?.slice(-1)[0];
      return `trash ${trashedHw?.title} and gain ${Math.floor((trashedHw?.cost || 0) / 2)} [Credits]`;
    }),
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const trashedHw = (state as any).runner?.discard?.slice(-1)[0];
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreGaining.gainCredits(
            state,
            "runner",
            Math.floor((trashedHw?.cost || 0) / 2),
          ),
        ],
        [],
      );
      yield continue_ability(
        state,
        "runner",
        {
          prompt: "Choose a piece of hardware to add to the grip",
          choices: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            return (state as any).runner?.deck?.filter((c: Card) =>
              coreCard.hardware(c),
            );
          }),
          msg: msg(
            "add ",
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              msg,
            " from the stack to the Grip and shuffle the stack",
          ),
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreEngine.triggerEvent("searched-stack");
              coreShuffling.shuffle(state, side, "deck");
              coreMoving.move(state, side, msg, "hand");
            },
          ),
        },
        card,
        null,
      );
    }),
  },
};

// Traffic Jam
export const trafficJam: CardDef = {
  title: "Traffic Jam",
  staticAbilities: [
    {
      type: "advancement-requirement",
      value: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return ((state as any).corp?.scored || []).filter(
          (c: Card) => c.title === msg.title,
        ).length;
      }),
    },
  ],
};

// Transfer of Wealth
export const transferOfWealth: CardDef = {
  title: "Transfer of Wealth",
  onPlay: runServerAbility("hq"),
  makesRun: true,
  events: [
    {
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
      automatic: "drain-credits",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return forms.thisCardRun && ctx.server === "hq";
      }),
      msg: "take 1 tag",
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
          [{ asyncResult: "result" }, coreTags.gainTags(state, "runner", 1)],
          [],
        );
        yield continue_ability(
          state,
          side,
          drainCredits("runner", "corp", 3, 2),
          card,
          null,
        );
      }),
    },
  ],
};

// Tread Lightly
export const treadLightly: CardDef = {
  title: "Tread Lightly",
  onPlay: runAnyServerAbility(),
  makesRun: true,
  staticAbilities: [
    {
      type: "rez-cost",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return forms.run(state) && coreCard.ice(msg);
      }),
      value: 3,
    },
  ],
};

// Trick Shot
export const trickShot: CardDef = {
  title: "Trick Shot",
  makesRun: true,
  data: { counter: { credit: 4 } },
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return forms.run(state);
      }),
      type: "credit",
    },
  },
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
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreUpdate.updateIn(state, side, "runEid", eid);
        coreRuns.makeRun(state, side, eid, "rd", card);
      },
    ),
  },
  events: [
    {
      event: "successful-run",
      automatic: "gain-credits",
      unregisterOnceResolved: true,
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
        const c = coreCard.getCard(state, card);
        return (
          ctx.server === "rd" &&
          forms.thisCardRun &&
          c?.special?.runEid?.eid === (state as any).run?.eid?.eid
        );
      }),
      msg: "place 2 [Credits] on itself and access 1 additional card from R&D",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreEngine.registerEvents(card, [
            coreDefHelpers.breachAccessBonus("rd", 1, {
              duration: "end-of-run",
            }),
          ]);
          coreProps.addCounter(eid, card, "credit", 2, { placed: true });
        },
      ),
    },
    {
      event: "run-ends",
      unregisterOnceResolved: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return forms.thisCardRun;
      }),
      prompt: "Choose a remote server to run",
      choices: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return corePrompts.cancellable(
          (
            coreServers.zonesToSortedNames(
              coreRuns.getRunnableZones(state, side, eid, card, null),
            ) || []
          )
            .filter((s: string) => coreServers.isRemote(s))
            .map(coreServers.unknownToKw)
            .map(coreServers.remoteToName),
        );
      }),
      msg: msg(
        "make a run on ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
      ),
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreRuns.makeRun(eid, msg, card);
        },
      ),
    },
  ],
};

// Uninstall
export const uninstall: CardDef = {
  title: "Uninstall",
  onPlay: {
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (coreBoard.allActiveInstalled(state, "runner") || []).some(
          (c: Card) =>
            !c.facedown && (coreCard.hardware(c) || coreCard.program(c)),
        );
      }),
    },
    choices: {
      card: (c: Card) =>
        coreCard.installed(c) &&
        !c.facedown &&
        (coreCard.hardware(c) || coreCard.program(c)),
    },
    msg: msg(
      "move ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg,
      " to [their] Grip",
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.move(state, side, msg, "hand");
      },
    ),
  },
};

// Unscheduled Maintenance
export const unscheduledMaintenance: CardDef = {
  title: "Unscheduled Maintenance",
  events: [
    {
      event: "corp-install",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return coreCard.ice(ctx.card);
      }),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreFlags.registerTurnFlag(
            card,
            "can-install-ice",
            function* (
              state: State,
              side: Side,
              card: Card,
            ): Generator<any, any, any> {
              if (coreCard.ice(card)) {
                coreToasts.toast(
                  state,
                  "corp",
                  "Cannot install ice the rest of this turn due to Unscheduled Maintenance",
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
  leavePlay: effect((state: State, side: Side, eid: EID, card: Card) => {
    coreFlags.clearTurnFlag(state, side, card, "can-install-ice");
  }),
};

// Vamp
export const vamp: CardDef = {
  title: "Vamp",
  makesRun: true,
  onPlay: runServerAbility("hq"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "hq",
      thisCardRun: true,
      ability: {
        cost: [corePayment.toC("x-credits")],
        async: true,
        onChangeGameState: {
          req: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            return corePayment.costValue(eid, "x-credits") > 0;
          }),
        },
        msg: msg(
          "make the corp lose ",
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            corePayment.costValue(eid, "x-credits"),
          " [Credits]",
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
              coreGaining.loseCredits(
                state,
                "corp",
                corePayment.costValue(eid, "x-credits"),
              ),
            ],
            [],
          );
          yield continue_ability(
            state,
            side,
            coreTags.gainTagsAbility(1),
            card,
            null,
          );
        }),
      },
    },
  ],
};

// VRcation
export const vrcation: CardDef = {
  title: "VRcation",
  onPlay: {
    msg: msg(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      let result = "draw 4 cards";
      if ((state as any).runner?.click > 0) {
        result += " and lose [Click]";
      }
      return result;
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
          (state as any).runner?.deck?.length > 0 ||
          (state as any).runner?.click > 0
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
      if ((state as any).runner?.click > 0) {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.loseClicks(state, "runner", 1),
          ],
          [],
        );
      }
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreDrawing.draw(state, "runner", eid, 4)],
        [],
      );
    }),
  },
};

// Wanton Destruction
export const wantonDestruction: CardDef = {
  title: "Wanton Destruction",
  makesRun: true,
  onPlay: runServerAbility("hq"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "hq",
      thisCardRun: true,
      ability: {
        msg: msg(
          "force the Corp to discard ",
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            msg,
          " card from HQ at random",
        ),
        prompt: "How many [Click] do you want to spend?",
        choices: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return Array.from(
            { length: (state as any).runner?.click + 1 },
            (_, i) => String(i),
          );
        }),
        async: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const n = parseInt(msg, 10);
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreEngine.pay(
                state,
                "runner",
                coreEid.makeEid(state, eid),
                card,
                corePayment.toC("click", n),
              ),
            ],
            [],
          );
          coreSay.systemMsg(state, "runner", asyncResult?.msg);
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.trashCards(
                state,
                "corp",
                eid,
                (state as any).corp?.hand
                  ?.slice(0, n)
                  .sort(() => Math.random() - 0.5),
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

// Watch the World Burn
export const watchTheWorldBurn: CardDef = {
  title: "Watch the World Burn",
  makesRun: true,
  onPlay: runRemoteServerAbility(),
  events: [
    {
      event: "pre-access-card",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return !coreCard.agenda(ctx.accessedCard) && ctx.successful;
      }),
      once: "per-run",
      msg: msg(
        "remove ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          ctx.accessedCard?.title,
        " from the game, and watch for other copies of ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          ctx.accessedCard?.title,
        " to burn",
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx: any =
            ((targets as any[])?.[0] as any)?.context ??
            (targets as any[])?.[0];
          coreMoving.move("corp", ctx.accessedCard, "rfg");
          coreEngine.registerEvents(
            card,
            watchTheWorldBurnRfgCardEvent(ctx.accessedCard),
          );
        },
      ),
    },
  ],
};

function watchTheWorldBurnRfgCardEvent(burnedCard: Card): any[] {
  return [
    {
      event: "pre-access-card",
      duration: "end-of-game",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return utils.sameCard("title", burnedCard, ctx.accessedCard);
      }),
      msg: msg(
        "remove ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          burnedCard.title,
        " from the game",
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx: any =
            ((targets as any[])?.[0] as any)?.context ??
            (targets as any[])?.[0];
          coreMoving.move("corp", ctx.accessedCard, "rfg");
        },
      ),
    },
  ];
}

// White Hat
export const whiteHat: CardDef = {
  title: "White Hat",
  onPlay: {
    trace: {
      base: 3,
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
      unsuccessful: coreDefHelpers.withRevealedHand(
        "corp",
        { eventSide: "corp", forced: true },
        {
          prompt: "Shuffle up to 2 cards into R&D",
          player: "runner",
          choices: {
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return targets?.some(
                (c: Card) => coreCard.corp(c) && coreCard.inHand(c),
              );
            }),
            max: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return Math.min(2, (state as any).corp?.hand?.length || 0);
            }),
          },
          msg: msg(
            "shuffle ",
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              (targets || []).map((c: Card) => c.title).join(", "),
            " into R&D",
          ),
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            for (const t of targets || []) {
              yield wait_for(
                state,
                [
                  { asyncResult: "result" },
                  coreMoving.move(state, "corp", t, "deck"),
                ],
                [],
              );
            }
            coreShuffling.shuffle(state, "corp", "deck");
          }),
        },
      ),
    },
  },
};

// Wildcat Strike
export const wildcatStrike: CardDef = {
  title: "Wildcat Strike",
  onPlay: coreChooseOne.chooseOneHelper({ player: "corp" }, [
    {
      option: "Runner gains 6 [Credits]",
      ability: {
        msg: "force the Runner to gain 6 [Credits]",
        displaySide: "corp",
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreGaining.gainCredits(state, "runner", eid, 6);
          },
        ),
      },
    },
    {
      option: "Runner draws 4 cards",
      ability: {
        msg: "force the Runner to draw 4 cards",
        displaySide: "corp",
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreDrawing.draw(state, "runner", eid, 4);
          },
        ),
      },
    },
  ]),
};

// Windfall
export const windfall: CardDef = {
  title: "Windfall",
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
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreShuffling.shuffle(state, side, "deck")],
        [],
      );
      const topCard = (state as any).runner?.deck?.[0];
      const cost = topCard?.cost || 0;
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreMoving.trash(state, side, topCard, { causeCard: card }),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreGaining.gainCredits(
            state,
            side,
            coreCard.event(topCard) ? 0 : cost,
          ),
        ],
        [],
      );
      coreSay.systemMsg(
        state,
        side,
        `shuffles the stack and trashes ${topCard.title}${!coreCard.event(topCard) ? ` to gain ${cost} [Credits]` : ""}`,
      );
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Window of Opportunity
export const windowOfOpportunity: CardDef = {
  title: "Window of Opportunity",
  makesRun: true,
  events: [
    {
      event: "run",
      async: true,
      unregisterOnceResolved: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        const rezzedTargets = (
          coreBoard.allActiveInstalled(state, "corp") || []
        ).filter(
          (c: Card) =>
            coreCard.ice(c) &&
            coreRuns.targetServer(ctx) === (coreCard.getZone(c) as string[])[1],
        );
        if (rezzedTargets.length > 0) {
          yield continue_ability(
            state,
            side,
            {
              prompt: "Choose a piece of ice protecting this server to derez",
              waitingPrompt: true,
              choices: {
                req: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  return rezzedTargets.some((c: Card) =>
                    utils.sameCard(msg, c),
                  );
                }),
              },
              async: true,
              effect: effect(
                (() => {
                  const chosenIce = msg;
                  return effect(
                    coreEngine.registerEvents(state, side, card, [
                      {
                        event: "run-ends",
                        duration: "end-of-run",
                        optional: {
                          player: "corp",
                          waitingPrompt: true,
                          req: req(function* (
                            state: State,
                            side: Side,
                            eid: EID,
                            card: Card,
                            targets: any[],
                          ): Generator<any, any, any> {
                            return (
                              coreCard.installed(
                                coreCard.getCard(state, chosenIce),
                              ) &&
                              !coreCard.rezzed(
                                coreCard.getCard(state, chosenIce),
                              )
                            );
                          }),
                          prompt: msg(
                            "Rez ",
                            (
                              state: State,
                              side: Side,
                              eid: EID,
                              card: Card,
                              targets: any[],
                            ) => coreToString.cardStr(state, chosenIce),
                            ", ignoring all costs?",
                          ),
                          yesAbility: {
                            async: true,
                            effect: effect(
                              coreRezzing.rez(state, "corp", eid, chosenIce, {
                                ignoreCost: "all-costs",
                              }),
                            ),
                          },
                        },
                      },
                    ]),
                    coreRezzing.derez(state, side, eid, msg),
                  );
                })(),
              ),
            },
            card,
            null,
          );
        } else {
          return coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
  onPlay: {
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
            side,
            windowOfOpportunityInstallAbi(),
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
          coreRuns.makeRun(state, side, eid, msg, card),
        ],
        [],
      );
    }),
  },
};

function windowOfOpportunityInstallAbi(): any {
  return {
    prompt: "Choose 1 program or piece of hardware to install",
    waitingPrompt: true,
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
          (coreCard.hardware(t) || coreCard.program(t)) &&
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
        coreInstalling.runnerInstall(
          { ...eid, source: card, sourceType: "runner-install" },
          msg,
          { msgKeys: { installSource: card, displayOrigin: true } },
        );
      },
    ),
  };
}
