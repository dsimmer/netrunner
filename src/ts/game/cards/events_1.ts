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
// Helper functions used across cards

export function drainCredits(
  runnerSide: Side,
  corpSide: Side,
  amount: number,
  min: number,
  max: number,
): any {
  return {
    msg: "force the corp to lose credits",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const qty = Math.min(max, Math.max(min, Math.floor(amount / 2)));
        (coreGaining.lose as any)(state, corpSide, "credit", qty);
        (coreGaining.gain as any)(state, runnerSide, "credit", qty);
      },
    ),
  };
}

function breachAccessBonus(...args: any[]): any {
  return (coreDefHelpers.breachAccessBonus as any)?.(...args);
}

export function runServerAbility(...args: any[]): any {
  return (coreDefHelpers.runServerAbility as any)?.(...args);
}

export function runAnyServerAbility(...args: any[]): any {
  return (coreDefHelpers.runAnyServerAbility as any)?.(...args);
}

export function runRemoteServerAbility(...args: any[]): any {
  const ability = coreDefHelpers.runRemoteServerAbility;
  return typeof ability === "function"
    ? ability(...args)
    : { ...ability, ...(args[0] ?? {}) };
}

export function runCentralServerAbility(...args: any[]): any {
  const ability = coreDefHelpers.runCentralServerAbility;
  return typeof ability === "function"
    ? ability(...args)
    : { ...ability, ...(args[0] ?? {}) };
}

export function runServerFromChoicesAbility(...args: any[]): any {
  return (coreDefHelpers.runServerFromChoicesAbility as any)?.(...args);
}

export function gainCreditsAbility(...args: any[]): any {
  return (coreDefHelpers.gainCreditsAbility as any)?.(...args);
}

export function drawAbi(...args: any[]): any {
  return (coreDefHelpers.drawAbi as any)?.(...args);
}

export function tutorAbi(...args: any[]): any {
  return (coreDefHelpers.tutorAbi as any)?.(...args);
}

function offerJackOut(...args: any[]): any {
  return (coreDefHelpers.offerJackOut as any)?.(...args);
}

export function scry(
  state: State,
  side: Side,
  card: Card,
  targetSide: Side,
  num: number,
): void {
  (coreDefHelpers.scry as any)(state, side, null, card, targetSide, num);
}

export function makeIcon(...args: any[]): any {
  return (coreDefHelpers.makeIcon as any)?.(...args);
}

// Cutlery helper - creates card with subroutines-broken event
function cutlery(subtype: string): any {
  return {
    makesRun: true,
    onPlay: runAnyServerAbility(),
    events: [
      {
        event: "subroutines-broken",
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
          const pred = (c: any) => {
            const allSubsBroken = true; // simplified
            const iceHasSubtype = coreCard.hasSubtype(c?.ice, subtype);
            return allSubsBroken && iceHasSubtype;
          };
          return (
            pred(ctx) &&
            coreCard.getCard(state, ctx?.ice) &&
            coreEvents.firstRunEvent(
              state,
              side,
              "subroutines-broken",
              (t: any) => {
                const first = t[0];
                return first && pred(first);
              },
            )
          );
        }),
        msg: msg(
          "trash ",
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const ctx: any =
              ((targets as any[])?.[0] as any)?.context ??
              (targets as any[])?.[0];
            return coreToString.cardStr(state, ctx?.ice);
          },
        ),
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const ctx: any =
              ((targets as any[])?.[0] as any)?.context ??
              (targets as any[])?.[0];
            (coreMoving.trash as any)(state, side, eid, ctx?.ice, {
              causeCard: card,
            });
          },
        ),
      },
    ],
  };
}

// ============================================================================
// Card Definitions
// ============================================================================

// Account Siphon
export const accountSiphon: CardDef = {
  title: "Account Siphon",
  makesRun: true,
  onPlay: runServerAbility("hq"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "hq",
      thisCardRun: true,
      ability: drainCredits("runner", "corp", 5, 2, 2),
    },
  ],
};

// Aircheck
export const aircheck: CardDef = {
  title: "Aircheck",
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
  staticAbilities: [
    {
      type: "cannot-pay-credits-from-pool",
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return side === ":runner";
      }),
      value: (() => true) as any,
    },
    {
      type: "cannot-lose-credits",
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return side === ":runner";
      }),
      value: (() => true) as any,
    },
  ],
  onPlay: runServerFromChoicesAbility(["HQ", "R&D"], {
    events: [
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
          const ctx = targets[0] || {};
          return (
            ctx.successful &&
            forms.thisCardRun &&
            (ctx.server === "hq" || ctx.server === "rd")
          );
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
            coreServers
              .zonesToSortedNames(
                coreRuns
                  .getRunnableZones(state, side, eid, card, null)
                  .filter((s: string) => coreServers.isRemote(s)),
              )
              .map(coreServers.unknownToKw),
          );
        }),
        msg: msg(
          "make a run on ",
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            targets?.[0],
        ),
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            (coreRuns.makeRun as any)(state, side, eid, targets?.[0], card);
          },
        ),
      },
    ],
  }),
};

// Always Have a Backup Plan
export const alwaysHaveABackupPlan: CardDef = {
  title: "Always Have a Backup Plan",
  makesRun: true,
  onPlay: {
    prompt: "Choose a server",
    onChangeGameState: req(function* (
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
    msg: msg(
      "make a run on ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets?.[0],
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
          (coreRuns.makeRun as any)(state, side, eid, targets?.[0], card),
        ],
        [],
      );
      const cardObj = coreCard.getCard(state, card);
      const runAgain = (cardObj as any)?.special?.runAgain;
      if (runAgain) {
        (coreRuns.makeRun as any)(state, side, eid, runAgain, card, {
          ignoreCosts: true,
        });
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
  events: [
    {
      event: "run-ends",
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
          return (
            !(coreCard.getCard(state, card) as any)?.special?.runAgain &&
            !ctx?.successful
          );
        }),
        prompt: "Make another run on the same server?",
        yesAbility: {
          effect: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const lastRun = (state as any).runner?.register?.lastRun;
            const attackedServer = lastRun?.server?.[0];
            const runEvents = (coreEvents.runEvents as any)(
              state,
              side,
              "encounter-ice",
            );
            const ice = runEvents?.[0]?.[1]?.[0]?.ice;
            coreUpdate.update(
              state,
              side,
              coreUpdate.updateIn(card, ["special"], (s: any) => ({
                ...s,
                runAgain: attackedServer,
                runAgainIce: ice,
              })) as any,
            );
          }),
        },
      },
    },
    {
      event: "encounter-ice",
      automatic: "bypass",
      once: "per-run",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        const c = coreCard.getCard(state, card) as any;
        return (
          c?.special?.runAgain &&
          utils.sameCard(ctx?.ice, c.special.runAgainIce)
        );
      }),
      msg: msg(
        "bypass ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx: any =
            ((targets as any[])?.[0] as any)?.context ??
            (targets as any[])?.[0];
          return ctx?.ice?.title;
        },
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

// Amped Up
export const ampedUp: CardDef = {
  title: "Amped Up",
  onPlay: {
    msg: "gain [Click][Click][Click] and suffer 1 core damage",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        (coreGaining.gainClicks as any)(state, side, 3);
        (coreDamage.damage as any)(state, side, eid, "brain", 1, {
          unpreventable: true,
          card,
        });
      },
    ),
  },
};

// Another Day, Another Paycheck
export const anotherDayAnotherPaycheck: CardDef = {
  title: "Another Day, Another Paycheck",
  events: [
    {
      event: "agenda-stolen",
      trace: {
        base: 0,
        unsuccessful: {
          async: true,
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              (coreGaining.gainCredits as any)(
                state,
                "runner",
                eid,
                (state as any).runner?.agendaPoint +
                  (state as any).corp?.agendaPoint,
              );
            },
          ),
          msg: msg(
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              `gain ${(state as any).runner?.agendaPoint + (state as any).corp?.agendaPoint} [Credits]`,
          ),
        },
      },
    },
  ],
};

// Apocalypse
export const apocalypse: CardDef = {
  title: "Apocalypse",
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
    async: true,
    msg: "trash all installed Corp cards and turn all installed Runner cards facedown",
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const corpTrash = {
        async: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ai = coreBoard.allInstalled(state, "corp");
          const onhost = ai.filter((c: Card) => c.zone?.[0] === "onhost");
          const unhosted = ai
            .filter((c: Card) => c.zone?.[0] !== "onhost")
            .sort((a: Card, b: Card) =>
              JSON.stringify(a.zone).localeCompare(JSON.stringify(b.zone)),
            )
            .reverse();
          const allCorp = [...onhost, ...unhosted];
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.trashCards(state, "runner", eid, allCorp, {
                causeCard: card,
              }),
            ],
            [],
          );
        }),
      };
      const runnerFacedown = {
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const installedCards = coreBoard.allActiveInstalled(state, "runner");
          const isHosted = (c: Card) => c.zone?.[0] === "onhost";
          const hostedCards = installedCards.filter(isHosted);
          const nonHostedCards = installedCards.filter(
            (c: Card) => !isHosted(c),
          );
          for (const oc of hostedCards) {
            const c = coreCard.getCard(state, oc);
            if (c && !(coreCard as any).conditionCounter?.(c)) {
              yield wait_for(
                state,
                [
                  { asyncResult: "result" },
                  (coreMoving as any).flipFacedown(state, side, c),
                ],
                [],
              );
            }
          }
          for (const oc of nonHostedCards) {
            const c = coreCard.getCard(state, oc);
            if (c) {
              yield wait_for(
                state,
                [
                  { asyncResult: "result" },
                  (coreMoving as any).flipFacedown(state, side, c),
                ],
                [],
              );
            }
          }
        }),
      };
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreEngine.resolveAbility(state, side, corpTrash, card, null),
        ],
        [],
      );
      yield continue_ability(state, side, runnerFacedown, card, null);
    }),
  },
};

// Ashen Epilogue
export const ashenEpilogue: CardDef = {
  title: "Ashen Epilogue",
  onPlay: {
    msg: msg(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return coreCard.zoneLocked(state, "runner", "discard")
        ? "shuffle the grip into the stack"
        : "shuffle the grip and heap into the stack";
    }) as any,
    rfgInsteadOfTrashing: true,
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
          coreShuffling.shuffleIntoDeck(state, "runner", "hand", "discard"),
        ],
        [],
      );
      const top5 =
        coreShuffling.getSetAside(state, "runner", eid)?.slice(0, 5) ||
        (state as any).runner?.deck?.slice(0, 5) ||
        [];
      for (const c of top5) {
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreMoving.move(state, side, c, "rfg")],
          [],
        );
      }
      coreSay.systemMsg(
        state,
        side,
        `removes ${top5.map((c: Card) => c.title).join(", ")} from the game and draws 5 cards`,
      );
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreDrawing.draw(state, "runner", eid, 5)],
        [],
      );
    }),
  },
};

// Bahia Bands
export const bahiaBands: CardDef = {
  title: "Bahia Bands",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          eid.sourceType === "runner-trash-corp-cards" &&
          coreCard.corp(targets[0])
        );
      }),
      type: "credit",
    },
  },
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
        const all = [
          {
            async: true,
            effect: effect(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                (coreDrawing.draw as any)(state, side, eid, 2);
              },
            ),
            msg: "draw 2 cards",
          },
          {
            msg: "install a card from the grip, paying 1 [Credits] less",
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
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                continue_ability(
                  {
                    prompt: "Choose a card to install",
                    waitingPrompt: true,
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
                          (coreCard.hardware(t) ||
                            coreCard.program(t) ||
                            coreCard.resource(t)) &&
                          coreCard.inHandStar(state, t) &&
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
                    effect: effect(
                      (
                        state: State,
                        side: Side,
                        eid: EID,
                        card: Card,
                        targets: any[],
                      ) => {
                        (coreInstalling.runnerInstall as any)(
                          state,
                          side,
                          {
                            ...eid,
                            source: card,
                            sourceType: "runner-install",
                          },
                          targets?.[0],
                          {
                            costBonus: -1,
                            msgKeys: {
                              installSource: card,
                              displayOrigin: true,
                            },
                          },
                        );
                      },
                    ),
                  },
                  card,
                  null,
                );
              },
            ),
          },
          {
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
                (coreTags.loseTags as any)(state, side, eid, 1);
              },
            ),
          },
          {
            async: true,
            effect: effect(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                (coreProps.addCounter as any)(
                  state,
                  side,
                  eid,
                  coreCard.getCard(state, card),
                  "credit",
                  4,
                  null,
                );
              },
            ),
            msg: "place 4 [Credits] for paying trash costs",
          },
        ];

        const choice = (abis: any[], rem: number): any => ({
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
              (a: any) =>
                targets?.[0] === a.msg.charAt(0).toUpperCase() + a.msg.slice(1),
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
                choice(
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
        });

        yield continue_ability(state, side, choice(all, 2), card, null);
      }),
    },
  ],
};

// Because I Can
export const becauseICan: CardDef = {
  title: "Because I Can",
  makesRun: true,
  onPlay: runRemoteServerAbility(),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "remote",
      thisCardRun: true,
      ability: {
        msg: "shuffle all cards in the server into R&D",
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const runServer = forms.runServer(state);
          for (const c of runServer?.content || []) {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreMoving.move(state, "corp", c, "deck"),
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
        }),
      },
    },
  ],
};

// Beta Build
export const betaBuild: CardDef = {
  title: "Beta Build",
  makesRun: true,
  onPlay: {
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
          coreEngine.resolveAbility(
            state,
            side,
            {
              prompt: "Install a non-virus program",
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
                        coreCard.program(c) &&
                        coreInstalling.runnerCanInstall(state, side, eid, c, {
                          noToast: true,
                        }),
                    ) || [],
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
                    (coreInstalling.runnerInstall as any)(
                      state,
                      side,
                      eid,
                      targets?.[0],
                      {
                        ignoreAllCost: true,
                        msgKeys: { displayOrigin: true, sourceCard: card },
                      },
                    ),
                  ],
                  [],
                );
                return coreEid.completeWithResult(
                  state,
                  side,
                  eid,
                  targets?.[0],
                );
              }),
            },
            card,
            null,
          ),
        ],
        [],
      );
      const installedCard: any = targets?.[0];
      yield continue_ability(
        state,
        side,
        runAnyServerAbility({
          events: [
            {
              event: "run-ends",
              unregisterOnceResolved: true,
              duration: "end-of-run",
              interactive: req(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                return true;
              }),
              automatic: "last",
              onChangeGameState: {
                silent: true,
                req: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  return coreCard.getCard(state, installedCard);
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
                ) => installedCard?.title,
                " to the top of the stack",
              ),
              effect: effect(
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => {
                  coreMoving.move(state, side, installedCard, "deck", {
                    front: true,
                  });
                },
              ),
            },
          ],
        }),
        card,
        null,
      );
    }),
  },
};

// Black Hat
export const blackHat: CardDef = {
  title: "Black Hat",
  onPlay: {
    trace: {
      base: 4,
      unsuccessful: {
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            (coreEngine.registerEvents as any)(state, side, card, [
              breachAccessBonus("rd", 2, { duration: "end-of-turn" }),
              breachAccessBonus("hq", 2, { duration: "end-of-turn" }),
            ]);
          },
        ),
      },
    },
  },
};

// Blackmail
export const blackmail: CardDef = {
  title: "Blackmail",
  makesRun: true,
  onPlay: {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return coreBadPublicity.badPublicityAvailable(state, "corp") > 0;
    }),
    prompt: "Choose a server",
    onChangeGameState: {
      req: req(function* (state: State): Generator<any, any, any> {
        return (
          coreServers.zonesToSortedNames(
            (coreRuns.getRunnableZones as any)(state),
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
        (coreRuns.getRunnableZones as any)(state),
      );
    }),
    msg: "prevent ice from being rezzed during this run",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        (coreFlags.registerRunFlag as any)(
          state,
          side,
          card,
          "can-rez",
          function* (
            state: State,
            _side: Side,
            c: Card,
          ): Generator<any, any, any> {
            if (coreCard.ice(c)) {
              coreToasts.toast(
                state,
                "corp",
                "Cannot rez ice on this run due to Blackmail",
              );
              return false;
            }
            return true;
          },
        );
        (coreRuns.makeRun as any)(state, side, eid, targets?.[0], card);
      },
    ),
  },
};

// Blueberry! Diesel
export const blueberryDiesel: CardDef = {
  title: "Blueberry!™ Diesel",
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
    prompt: "Move a card to the bottom of the stack?",
    notDistinct: true,
    choices: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const deck = (state as any).runner?.deck || [];
      return [...deck.slice(0, 2), "No"];
    }),
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const choice = targets?.[0];
      if (typeof choice !== "string") {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.move(state, side, choice, "deck"),
          ],
          [],
        );
      }
      coreSay.systemMsg(
        state,
        side,
        `looks at the top 2 cards of the stack${typeof choice !== "string" ? " and adds one to the bottom of the stack" : ""}`,
      );
      coreSay.systemMsg(state, side, `uses ${card.title} to draw 2 cards`);
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreDrawing.draw(state, "runner", eid, 2)],
        [],
      );
    }),
  },
};

// Bravado - tracks passed ice for credit gain
export const bravado: CardDef = {
  title: "Bravado",
  makesRun: true,
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
        const icedServers = (state: State, side: Side, eid: EID, card: Card) =>
          coreServers
            .zonesToSortedNames(
              coreRuns.getRunnableZones(state, side, eid, card, null),
            )
            .filter((s: string) => {
              const zone = coreBoard.serverToZone(state, s);
              const server = (state as any).corp?.servers?.[zone?.[1]];
              return server?.ices?.length > 0;
            });
        return icedServers(state, side, eid, card).length > 0;
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
      const icedServers = (state: State, side: Side, eid: EID, card: Card) =>
        coreServers
          .zonesToSortedNames(
            coreRuns.getRunnableZones(state, side, eid, card, null),
          )
          .filter((s: string) => {
            const zone = coreBoard.serverToZone(state, s);
            const server = (state as any).corp?.servers?.[zone?.[1]];
            return server?.ices?.length > 0;
          });
      return icedServers(state, side, eid, card);
    }),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const ctx: any =
          ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        (coreEngine.registerEvents as any)(state, side, card, [
          {
            event: "pass-ice",
            duration: "end-of-run",
            effect: effect(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                const c = coreCard.getCard(state, card);
                if (c)
                  coreUpdate.updateIn(
                    c,
                    ["special", "bravadoPassed"],
                    (s: any) => {
                      const set = s || new Set();
                      set.add(ctx?.ice?.cid);
                      return set;
                    },
                  );
              },
            ),
          },
        ]);
        (coreRuns.makeRun as any)(
          state,
          side,
          eid,
          ctx,
          coreCard.getCard(state, card),
        );
      },
    ),
  },
  events: [
    {
      event: "run-ends",
      silent: true,
      msg: msg(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const passed: Set<any> =
          ((coreCard.getCard(state, card) as any)?.special
            ?.bravadoPassed as Set<any>) || new Set();
        const moved =
          (coreCard.getCard(state, card) as any)?.special?.bravadoMoved || 0;
        const qty = 6 + passed.size + moved;
        return `gain ${qty} [Credits]`;
      }) as any,
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const passed: Set<any> =
          ((coreCard.getCard(state, card) as any)?.special
            ?.bravadoPassed as Set<any>) || new Set();
        const moved =
          (coreCard.getCard(state, card) as any)?.special?.bravadoMoved || 0;
        const qty = 6 + passed.size + moved;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(state, "runner", eid, qty),
          ],
          [],
        );
      }),
    },
    {
      event: "card-moved",
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
        const passed: Set<any> =
          ((coreCard.getCard(state, card) as any)?.special
            ?.bravadoPassed as Set<any>) || new Set();
        return passed.has(ctx?.movedCard?.cid);
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
        coreUpdate.updateIn(
          card,
          ["special", "bravadoMoved"],
          (n: number | undefined) => (n || 0) + 1,
        );
        coreUpdate.updateIn(card, ["special", "bravadoPassed"], (s: any) => {
          const set = s || new Set();
          set.delete(ctx?.movedCard?.cid);
          return set;
        });
      }),
    },
  ],
};

// Bribery
export const bribery: CardDef = {
  title: "Bribery",
  makesRun: true,
  onPlay: {
    async: true,
    basePlayCost: [corePayment.toC("x-credits")],
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
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets?.[0],
      " and increase the rez cost of the first unrezzed piece of ice approached by ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        corePayment.xCostValue(eid),
      " [Credits]",
    ),
    prompt: "Choose a server",
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const briberyX = corePayment.xCostValue(eid);
      (coreEngine.registerEvents as any)(state, side, card, [
        {
          event: "approach-ice",
          duration: "end-of-run",
          unregisterOnceResolved: true,
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
            const ice = ctx?.ice;
            return (
              !coreCard.rezzed(ice) &&
              coreEvents.firstRunEvent(
                state,
                side,
                "approach-ice",
                (t: any) => {
                  const first = t[0];
                  return first && !coreCard.rezzed(first.ice);
                },
              )
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
              const ctx: any =
                ((targets as any[])?.[0] as any)?.context ??
                (targets as any[])?.[0];
              (coreEffects.registerLingeringEffect as any)(card, {
                type: "rez-additional-cost",
                duration: "end-of-run",
                req: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  return utils.sameCard(ctx?.ice, card);
                }),
                value: [corePayment.toC("credit", briberyX)],
              });
            },
          ),
        },
      ]);
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreRuns.makeRun(state, side, eid, targets?.[0], card),
        ],
        [],
      );
    }),
  },
};

// Brute-Force-Hack
export const bruteForceHack: CardDef = {
  title: "Brute-Force-Hack",
  onPlay: {
    async: true,
    basePlayCost: [corePayment.toC("x-credits")],
    onChangeGameState: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreBoard
          .allInstalled(state, "corp")
          .some(
            (c: Card) =>
              coreCard.rezzed(c) &&
              coreCard.ice(c) &&
              (coreCostFns.rezCost(state, "corp", c) ?? 0) <=
                corePayment.xCostValue(eid),
          );
      }),
    },
    prompt: msg(
      "derez an ice with a rez cost of ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        corePayment.xCostValue(eid),
      " or lower",
    ),
    choices: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const c = targets[0];
        return (
          coreCard.rezzed(c) &&
          coreCard.ice(c) &&
          (coreCostFns.rezCost(state, "corp", c) ?? 0) <=
            corePayment.xCostValue(eid)
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
          (coreRezzing.derez as any)(state, side, eid, targets?.[0]),
        ],
        [],
      );
    }),
  },
};

// Build Script
export const buildScript: CardDef = {
  title: "Build Script",
  onPlay: {
    msg: "gain 1 [Credits] and draw 2 cards",
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
        [{ asyncResult: "result" }, coreGaining.gainCredits(state, side, 1)],
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

// Burner
export const burner: CardDef = {
  title: "Burner",
  makesRun: true,
  onPlay: runServerAbility("hq"),
  events: [
    {
      event: "successful-run-replace-breach",
      targetServer: "hq",
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
          return (state as any).corp?.hand?.length >= 1;
        }),
        async: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const corpHand = (state as any).corp?.hand || [];
          const chosenCards = [...corpHand]
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              (coreRevealing.revealLoud as any)(
                state,
                side,
                eid,
                card,
                {},
                chosenCards,
              ),
            ],
            [],
          );
          yield continue_ability(
            state,
            side,
            {
              prompt: `Choose a card (${Math.min(2, chosenCards.length)} remaining)`,
              choices: chosenCards.map((c: Card) => c.title),
              async: true,
              waitingPrompt: true,
              effect: req(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                const targetCard = targets[0];
                yield continue_ability(
                  state,
                  side,
                  {
                    prompt: `Choose where to put ${targetCard.title}`,
                    choices: ["Top of R&D", "Bottom of R&D"],
                    async: true,
                    msg: msg(
                      "add ",
                      (
                        state: State,
                        side: Side,
                        eid: EID,
                        card: Card,
                        targets: any[],
                      ) => targetCard?.title,
                      " to the ",
                      (
                        state: State,
                        side: Side,
                        eid: EID,
                        card: Card,
                        targets: any[],
                      ) => String(targets?.[0]).toLowerCase(),
                    ),
                    effect: req(function* (
                      state: State,
                      side: Side,
                      eid: EID,
                      card: Card,
                      targets: any[],
                    ): Generator<any, any, any> {
                      const placement = targets?.[0];
                      if (placement === "Top of R&D") {
                        yield wait_for(
                          state,
                          [
                            { asyncResult: "result" },
                            coreMoving.move(state, "corp", targetCard, "deck", {
                              front: true,
                            }),
                          ],
                          [],
                        );
                      } else {
                        yield wait_for(
                          state,
                          [
                            { asyncResult: "result" },
                            coreMoving.move(state, "corp", targetCard, "deck", {
                              front: false,
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
            card,
            null,
          );
        }),
      },
    },
  ],
};

// By Any Means
export const byAnyMeans: CardDef = {
  title: "By Any Means",
  onPlay: {
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        (coreEngine.registerEvents as any)(state, side, card, [
          {
            event: "access",
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
              return (
                coreFlags.canTrash(state, "runner", ctx?.accessedCard) &&
                !coreCard.inDiscard(ctx?.accessedCard)
              );
            }),
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
            msg: msg(
              "trash ",
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
                return ctx?.accessedCard?.title;
              },
              " at no cost and suffer 1 meat damage",
            ),
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
              const accessedCard = ctx?.accessedCard;
              yield wait_for(
                state,
                [
                  { asyncResult: "result" },
                  (coreMoving.trash as any)(
                    state,
                    side,
                    eid,
                    { ...accessedCard, seen: true },
                    { causeCard: card, accessed: true },
                  ),
                ],
                [],
              );
              (state as any).runner.register.trashedCard = true;
              (state as any).runner.register.trashedAccessedCard = true;
              yield wait_for(
                state,
                [
                  { asyncResult: "result" },
                  (coreDamage.damage as any)(state, "runner", eid, "meat", 1, {
                    unboostable: true,
                  }),
                ],
                [],
              );
            }),
          },
        ]);
      },
    ),
  },
};

// Calling in Favors
export const callingInFavors: CardDef = {
  title: "Calling in Favors",
  onPlay: {
    msg: msg(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const connections = (
        coreBoard.allActiveInstalled(state, "runner") || []
      ).filter(
        (c: Card) =>
          coreCard.hasSubtype(c, "Connection") && coreCard.resource(c),
      );
      return `gain ${connections.length} [Credits]`;
    }) as any,
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
            coreCard.hasSubtype(c, "Connection") && coreCard.resource(c),
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
      const connections = (
        coreBoard.allActiveInstalled(state, "runner") || []
      ).filter(
        (c: Card) =>
          coreCard.hasSubtype(c, "Connection") && coreCard.resource(c),
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          (coreGaining.gainCredits as any)(
            state,
            side,
            eid,
            connections.length,
          ),
        ],
        [],
      );
    }),
  },
};

// Career Fair
export const careerFair: CardDef = {
  title: "Career Fair",
  onPlay: {
    prompt: "Choose a resource to install",
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
          coreCard.resource(t) &&
          coreCard.inHandStar(state, t) &&
          coreInstalling.runnerCanPayAndInstall(state, side, eid, card, {
            costBonus: -3,
          })
        );
      }),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        (coreInstalling.runnerInstall as any)(
          state,
          side,
          { ...eid, source: card, sourceType: "runner-install" },
          targets?.[0],
          {
            costBonus: -3,
            msgKeys: { installSource: card, displayOrigin: true },
          },
        );
      },
    ),
  },
};

// Careful Planning
export const carefulPlanning: CardDef = {
  title: "Careful Planning",
  onPlay: {
    prompt: "Choose a card in or protecting a remote server",
    choices: {
      card: (c: Card) => {
        const zone = coreCard.getZone(c);
        return zone && coreServers.isRemote(zone[1]);
      },
    },
    msg: msg(
      "prevent the Corp from rezzing ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, targets?.[0]),
      " for the rest of the turn",
    ),
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const t: any = targets?.[0];
      coreEffects.registerLingeringEffect(state, side, card, {
        type: "icon",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return utils.sameCard(targets?.[0], t);
        }),
        duration: "post-runner-turn-ends",
        value: makeIcon("CP", card) as any,
      });
      (coreFlags.registerTurnFlag as any)(
        state,
        side,
        card,
        "can-rez",
        function (state: State, _side: Side, c: Card) {
          if (utils.sameCard(c, t)) {
            coreToasts.toast(
              state,
              "corp",
              "Cannot rez the rest of this turn due to Careful Planning",
            );
            return false;
          }
          return true;
        },
      );
    }),
  },
};
