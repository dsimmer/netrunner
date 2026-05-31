// Playing Events and Operations (instants).
// Mirrors: src/clj/game/core/play_instants.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability, Zone } from "./types";
import type { CostData } from "./payment";

import { getZone, getTitle, hasSubtype } from "./card";
import { cardDef } from "./card_defs";
import { basePlayCost, playAdditionalCostBonus } from "./cost_fns";
import { unregisterStaticAbilities } from "./effects";
import { makeEID, completeWithResult } from "./eid";
import {
  checkpoint,
  dissocReq,
  queueEvent,
  resolveAbility,
  pay as payFn,
  unregisterEvents,
} from "./engine";
import { canRun, zoneLocked } from "./flags";
import { lose } from "./gaining";
import { cardInit } from "./initializing";
import { move, trash } from "./moving";
import { buildSpendMsg, canPay, mergeCosts, toC } from "./payment";
import { reveal } from "./revealing";
import { playSfx, systemMsg, implementationMsg } from "./say";
import { update } from "./update";
import { wait_for, continue_ability, req, msg } from "../macros";
import { sameCard, toKeyword } from "../utils";
import { getCard } from "./finding";

// ---------------------------------------------------------------------------
// Play-instant args
// ---------------------------------------------------------------------------

export interface PlayInstantArgs {
  ignoreCost?: boolean;
  "ignore-cost"?: boolean;
  baseCost?: CostData | CostData[];
  "base-cost"?: CostData | CostData[];
  noAdditionalCost?: boolean;
  "no-additional-cost"?: boolean;
  cachedCosts?: CostData[];
  "cached-costs"?: CostData[];
  costBonus?: number;
  "cost-bonus"?: number;
  targets?: Card[];
  silent?: boolean;
  asFlashback?: boolean;
  "as-flashback"?: boolean;
  "no-toast"?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// async-rfg
// ---------------------------------------------------------------------------

/**
 * Move a card to RFG asynchronously.
 * Mirrors async-rfg in play_instants.clj.
 */
export function asyncRfg(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  _opts?: unknown,
): void {
  const movedCard = move(state, toKeyword(card.side ?? side), card, "rfg");
  completeWithResult(state, side, eid, movedCard);
}

// ---------------------------------------------------------------------------
// current-handler
// ---------------------------------------------------------------------------

/**
 * If the card has the "Current" subtype, move it to the current zone.
 * Mirrors current-handler in play_instants.clj.
 */
function currentHandler(state: GameState, side: string, card: Card): Card {
  if (hasSubtype(card, "Current")) {
    return move(state, toKeyword(card.side ?? side), card, "current") ?? card;
  }
  return card;
}

// ---------------------------------------------------------------------------
// complete-play-instant
// ---------------------------------------------------------------------------

/**
 * Completes the play of the event / operation that the player can play for.
 * Mirrors complete-play-instant in play_instants.clj.
 */
function completePlayInstant(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  paymentStr: string,
  ignoreCost: boolean,
  asFlashback: boolean,
): void {
  const playMsg = ignoreCost ? "play " : buildSpendMsg(paymentStr, "play");

  const flashbackSuffix = asFlashback
    ? " from " + (side === "corp" ? "Archives" : "the heap")
    : "";
  const ignoreCostSuffix = ignoreCost ? " at no cost" : "";

  systemMsg(
    state,
    side,
    playMsg + getTitle(card) + flashbackSuffix + ignoreCostSuffix,
  );
  implementationMsg(state, card);

  const def = cardDef(card) as { playSound?: string; onPlay?: Ability; trashAfterResolving?: boolean };
  const sfx = def.playSound;
  if (sfx) {
    playSfx(state, side, sfx);
  } else {
    playSfx(state, side, "play-instant");
  }

  // Select the "on the table" version of the card
  const handledCard = currentHandler(state, side, card);
  const onPlay: Ability = def.onPlay ?? {};
  const cdef = dissocReq({
    ...onPlay,
    cost: undefined,
    additionalCost: undefined,
  }) as Ability & { rfgInsteadOfTrashing?: boolean; trashAfterResolving?: boolean };

  const initializedCard = cardInit(
    state,
    side,
    cdef.rfgInsteadOfTrashing
      ? { ...handledCard, rfgInsteadOfTrashing: true }
      : handledCard,
    { resolveEffect: true, initData: true },
  );

  const playEvent = side === "corp" ? "play-operation" : "play-event";
  const resolvedEvent =
    side === "corp" ? "play-operation-resolved" : "play-event-resolved";

  queueEvent(state, playEvent, { card: initializedCard, event: playEvent });

  // Increment stats
  const playerState = side === "corp" ? state.corp : state.runner;
  const playerRec = playerState as unknown as { stats?: { cardsPlayed?: Record<string, number> } };
  const stats = playerRec.stats ?? {};
  const cardsPlayed: Record<string, number> = stats.cardsPlayed ?? {};
  const prevCount = cardsPlayed.playInstant ?? 0;
  cardsPlayed.playInstant = prevCount + 1;
  stats.cardsPlayed = cardsPlayed;
  playerRec.stats = stats;

  // Wait for the play-event checkpoint
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID) {
        // Resolve the :on-play ability
        resolveAbility(s, side, cdef, initializedCard, []);

        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID) {
              const playArea = (side === "corp" ? s2.corp : s2.runner).playArea ?? [];
              const c = playArea.find((c2: Card) => sameCard(initializedCard, c2));
              const trashAfterResolving = cdef.trashAfterResolving ?? true;
              const zone = (c as { rfgInsteadOfTrashing?: boolean } | undefined)?.rfgInsteadOfTrashing ? "rfg" : "discard";

              if (c && trashAfterResolving) {
                const trashOrMove = zone === "rfg" ? asyncRfg : trash;

                wait_for(
                  s2,
                  [
                    { asyncResult: "result" },
                    function (s3: GameState, _e3: EID) {
                      unregisterEvents(s3, side, c);
                      unregisterStaticAbilities(s3, side, c);

                      if (zone === "rfg") {
                        systemMsg(
                          s3,
                          side,
                          "removes " +
                            getTitle(c) +
                            " from the game instead of trashing it",
                        );
                      }

                      if (hasSubtype(c, "Terminal")) {
                        const clicks = (side === "corp" ? s3.corp : s3.runner).click;
                        lose(s3, side, "click", clicks);
                        if (side === "corp" && s3.corp.register) {
                          (s3.corp.register as Record<string, unknown>).terminal = true;
                        }
                      }

                      // Queue the resolved event (e.g., for Nuvem)
                      queueEvent(s3, resolvedEvent, {
                        card: initializedCard,
                        event: resolvedEvent,
                      });
                      checkpoint(s3, null, eid, { duration: resolvedEvent });
                    },
                  ],
                  [trashOrMove, s2, side, c, { unpreventable: true }],
                );
              } else {
                if (hasSubtype(initializedCard, "Terminal")) {
                  const clicks = (side === "corp" ? s2.corp : s2.runner).click;
                  lose(s2, side, "click", clicks);
                  if (side === "corp" && s2.corp.register) {
                    (s2.corp.register as Record<string, unknown>).terminal = true;
                  }
                }

                queueEvent(s2, resolvedEvent, {
                  card: initializedCard,
                  event: resolvedEvent,
                });
                checkpoint(s2, null, eid, { duration: resolvedEvent });
              }
            },
          ],
          [
            resolveAbility,
            s,
            side,
            makeEID(s, eid),
            cdef,
            initializedCard,
            null,
          ],
        );
      },
    ],
    [checkpoint, state, null, makeEID(state, eid), { duration: playEvent }],
  );
}

// ---------------------------------------------------------------------------
// remove-negative-costs
// ---------------------------------------------------------------------------

/**
 * Filter out negative credit costs (clamp to 0) and remove non-positive costs,
 * keeping x-costs. Mirrors remove-negative-costs in play_instants.clj.
 */
function removeNegativeCosts(costVec: CostData[]): CostData[] {
  return costVec.filter((c: CostData) => {
    if (!c) return false;
    if (c.type === "credit") {
      c.amount = Math.max(c.amount ?? 0, 0);
      return true;
    }
    if ((c.amount ?? 0) > 0) return true;
    if (["x-credits", "x-tags", "x-power"].includes(c.type)) return true;
    return false;
  });
}

// ---------------------------------------------------------------------------
// play-instant-additional-costs
// ---------------------------------------------------------------------------

/**
 * Calculate additional costs for playing an instant.
 * Mirrors play-instant-additional-costs in play_instants.clj.
 */
function playInstantAdditionalCosts(
  state: GameState,
  side: string,
  card: Card,
  args: PlayInstantArgs,
): CostData[] {
  const { ignoreCost, noAdditionalCost } = args;
  if (ignoreCost || noAdditionalCost) return [];

  const additionalCosts = mergeCosts([
    playAdditionalCostBonus(state, side, card),
    hasSubtype(card, "Triple") ? [toC("click", 2)] : [],
    hasSubtype(card, "Double") &&
    !((side === "corp" ? state.corp : state.runner).register as Record<string, unknown> | undefined)?.doubleIgnoreAdditional
      ? [toC("click", 1)]
      : [],
  ]);

  return removeNegativeCosts(additionalCosts);
}

// ---------------------------------------------------------------------------
// play-instant-costs
// ---------------------------------------------------------------------------

/**
 * Calculate the full cost to play an instant (base + additional).
 * Mirrors play-instant-costs in play_instants.clj.
 */
export function playInstantCosts(
  state: GameState,
  side: string,
  card: Card,
  args: PlayInstantArgs = {},
): CostData[] {
  const { ignoreCost, baseCost, noAdditionalCost, cachedCosts, costBonus } =
    args;

  if (cachedCosts) return cachedCosts;

  const cost = basePlayCost(state, side, card, { costBonus });
  const additionalCosts = playInstantAdditionalCosts(state, side, card, args);

  const costs = mergeCosts([
    !ignoreCost ? ([baseCost, cost] as unknown as CostData[]) : [],
    !(noAdditionalCost || ignoreCost) ? (additionalCosts as unknown as CostData[]) : [],
  ]);

  return removeNegativeCosts(costs);
}

// ---------------------------------------------------------------------------
// can-decline-instant?
// ---------------------------------------------------------------------------

/**
 * Returns true if the player can choose to decline playing due to additional costs.
 * Mirrors can-decline-instant? in play_instants.clj.
 */
function canDeclineInstant(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  args: PlayInstantArgs,
): boolean {
  const { ignoreCost, noAdditionalCost } = args;
  if (noAdditionalCost || ignoreCost) return false;
  return playInstantAdditionalCosts(state, side, card, args).length > 0;
}

// ---------------------------------------------------------------------------
// should-trigger? (local helper, mirrors engine.should-trigger?)
// ---------------------------------------------------------------------------

/**
 * Check the :req on an ability definition (recursively through ability keyword).
 * Mirrors the internal should-trigger? in engine.clj.
 */
function shouldTrigger(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  targets: Card[],
  ability: Ability | undefined,
): boolean {
  if (!ability) return false;

  // Handle nested ability keywords (e.g., :optional, :psi)
  const nestedKw = (() => {
    for (const key of Object.keys(ability)) {
      if (
        ["optional", "psi", "trace", "choose-one"].includes(key) &&
        typeof (ability as Record<string, unknown>)[key] === "object" &&
        (ability as Record<string, unknown>)[key] !== null
      ) {
        return key;
      }
    }
    return null;
  })();

  if (nestedKw) {
    return shouldTrigger(
      state,
      side,
      eid,
      card,
      targets,
      (ability as Record<string, Ability>)[nestedKw],
    );
  }

  if (ability.req) {
    const reqFn = ability.req;
    if (typeof reqFn !== "function") return !!reqFn;
    return reqFn(state, side, eid, card, targets);
  }
  return true;
}

// ---------------------------------------------------------------------------
// can-play-instant?
// ---------------------------------------------------------------------------

/**
 * Check whether a player can play the given instant card.
 * Mirrors can-play-instant? in play_instants.clj.
 */
export function canPlayInstant(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  args: PlayInstantArgs = {},
): boolean {
  const { targets, silent } = args;

  const eidWithSource = { ...eid, sourceType: "play" };
  const def = cardDef(card) as { onPlay?: Ability; makesRun?: boolean };
  const onPlay: Ability = def.onPlay ?? {};
  const costs = playInstantCosts(state, side, card, args);

  // Card still exists
  if (!getCard(state, card)) return false;

  // Req is satisfied
  if (!shouldTrigger(state, side, eidWithSource, card, targets ?? [], onPlay))
    return false;

  // Can pay all costs
  if (!canPay(state, side, eidWithSource, card, null, costs)) return false;

  // Zone isn't locked
  const zone = getZone(card);
  if (zone.length > 0 && zoneLocked(state, side, zone[0])) return false;

  // Current subtype check
  const playerReg = ((side === "corp" ? state.corp : state.runner).register as Record<string, unknown> | undefined);

  if (
    hasSubtype(card, "Current") &&
    playerReg?.cannotPlayCurrent
  )
    return false;

  // Run event / makes-run check
  const makesRun = def.makesRun;
  if ((makesRun || hasSubtype(card, "Run")) && !canRun(state, "runner", silent))
    return false;

  // Priority subtype check
  if (
    hasSubtype(card, "Priority") &&
    playerReg?.spentClick
  )
    return false;

  return true;
}

// ---------------------------------------------------------------------------
// continue-play-instant
// ---------------------------------------------------------------------------

/**
 * Handle the payment and then complete the instant play.
 * Mirrors continue-play-instant in play_instants.clj.
 */
function continuePlayInstant(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  costs: CostData[],
  args: PlayInstantArgs = {},
): void {
  const { ignoreCost, asFlashback } = args;

  const originalZone = card.zone ?? [];
  const movedCard = move(state, side, { ...card, seen: true }, "play-area");
  if (!movedCard) return;

  const payEid = makeEID(state) as EID & { action?: string };
  payEid.action = "play-instant";
  if (eid.source) payEid.source = eid.source;
  if (eid.sourceType) payEid.sourceType = eid.sourceType;

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: Record<string, unknown>) {
        const asyncResult = binds.asyncResult as { msg?: string; costPaid?: Record<string, unknown> } | undefined;
        const paymentStr = asyncResult?.msg;
        const eidCostPaid = (eid as EID & { costPaid?: Record<string, unknown> }).costPaid ?? {};
        const resultCostPaid = asyncResult?.costPaid ?? {};

        const mergedCostPaid: Record<string, unknown> = { ...eidCostPaid };
        for (const [k, v] of Object.entries(resultCostPaid)) {
          if (v) mergedCostPaid[k] = v;
        }

        const newEid = {
          ...eid,
          costPaid: mergedCostPaid,
          sourceType: "ability",
        };

        if (paymentStr) {
          // Payment succeeded
          const def = cardDef(movedCard) as { special?: Record<string, unknown> };
          const special = def.special;
          update(s, side, { ...movedCard, special });

          completePlayInstant(
            s,
            side,
            newEid,
            movedCard,
            paymentStr,
            !!ignoreCost,
            !!asFlashback,
          );
        } else {
          // Could not pay — return card to original zone
          const returnedCard = move(s, side, movedCard, originalZone);
          if (!returnedCard) return;

          continue_ability(
            s,
            side,
            {
              msg: msg("reveal that they are unable to play " + getTitle(card)),
              cost: args.baseCost ? ([args.baseCost] as CostData[]) : undefined,
              async: true,
              effect: req(
                function (
                  s2: GameState,
                  _sid: string,
                  _eid: EID,
                  _card: Card,
                  _targets: Card[],
                ) {
                  update(s2, side, {
                    ...returnedCard,
                    seen: undefined,
                    cid: card.cid,
                    previousZone: card.previousZone,
                  });
                },
                function (
                  s2: GameState,
                  _sid: string,
                  _eid: EID,
                  _card: Card,
                  _targets: Card[],
                ) {
                  reveal(s2, side, makeEID(s2), card);
                },
              ),
            },
            card,
            [],
          );
        }
      },
    ],
    [payFn, state, side, payEid, movedCard, costs],
  );
}

// ---------------------------------------------------------------------------
// play-instant
// ---------------------------------------------------------------------------

/**
 * Plays an Event or Operation.
 * Mirrors play-instant in play_instants.clj.
 */
export function playInstant(eid: EID, card: Card | null, args?: PlayInstantArgs | null): void;
export function playInstant(state: GameState, side: string, eid: EID, card: Card | null, args?: PlayInstantArgs | null): void;
export function playInstant(
  arg1: GameState | EID,
  arg2: string | Card | null,
  arg3: EID | PlayInstantArgs | null | undefined,
  arg4?: Card | null,
  arg5?: PlayInstantArgs | null,
): void {
  // shorthand (eid, card, args?) — no state, no-op
  if (arg1 && typeof arg1 === "object" && !("activePlayer" in arg1) && !("corp" in arg1)) {
    return;
  }
  const state = arg1 as GameState;
  const side = arg2 as string;
  const eid = arg3 as EID;
  const card = arg4 as Card | null;
  let args = (arg5 as PlayInstantArgs | null | undefined) ?? null;
  if (!card) return;
  args = args ?? {};
  const eidWithSource = { ...eid, source: card, sourceType: "play" };
  const costs = playInstantCosts(state, side, card, {
    ...args,
    cachedCosts: undefined,
  });
  const c = card;

  if (
    canPlayInstant(state, side, eidWithSource, card, {
      ...args,
      cachedCosts: costs,
    })
  ) {
    // Wait on pay to finish before triggering instant-effect
    if (
      canDeclineInstant(state, side, eidWithSource, card, args) &&
      !args.baseCost
    ) {
      continue_ability(
        state,
        side,
        {
          optional: {
            prompt: "Pay the additional costs to play " + getTitle(card) + "?",
            yesAbility: {
              async: true,
              req: function (
                s: GameState,
                _sid: string,
                _eid: EID,
                _card: Card,
                _targets: Card[],
              ) {
                const liveCard = getCard(s, card);
                return canPay(
                  s,
                  side,
                  eidWithSource,
                  liveCard ?? card,
                  null,
                  costs,
                );
              },
              effect: function (
                s: GameState,
                _sid: string,
                _eid: EID,
                _card: Card,
                _targets: Card[],
              ) {
                continuePlayInstant(
                  s,
                  side,
                  { ...eidWithSource, source: card, sourceType: "play" },
                  c,
                  costs,
                  args,
                );
              },
            },
            noAbility: {
              cost: args.baseCost ? ([args.baseCost] as CostData[]) : undefined,
              async: true,
              effect: function (
                s: GameState,
                _sid: string,
                _eid: EID,
                _card: Card,
                _targets: Card[],
              ) {
                // Matches the Clojure reveal path; reveal-explicit is not a core helper.
                reveal(s, side, makeEID(s), card);
              },
              msg: msg(
                "reveal " +
                  getTitle(card) +
                  ", and refuse to pay the additional cost to play " +
                  getTitle(card),
              ),
            },
          },
        },
        card,
        [],
      );
    } else {
      continuePlayInstant(state, side, eidWithSource, card, costs, args);
    }
  } else {
    // Cannot play the instant
    continue_ability(
      state,
      side,
      {
        msg: msg("reveal that they are unable to play " + getTitle(card)),
        cost: args.baseCost ? ([args.baseCost] as CostData[]) : undefined,
        async: true,
        // Matches the Clojure reveal path; reveal-explicit is not a core helper.
        effect: function (
          s: GameState,
          _sid: string,
          _eid: EID,
          _card: Card,
          _targets: Card[],
        ) {
          reveal(s, side, makeEID(s), card);
        },
      },
      card,
      [],
    );
  }
}
