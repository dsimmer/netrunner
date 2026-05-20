/**
 * Basic Action Cards - Corp and Runner basic actions
 * Ported from Clojure cards/basic.clj to TypeScript
 */

import type { Card, EID, Side, State } from "../../types";
import * as coreAgendas from "../core/agendas";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreDrawing from "../core/drawing";
import * as coreEid from "../core/eid";
import * as coreEffects from "../core/effects";
import * as coreEngine from "../core/engine";
import * as coreFlags from "../core/flags";
import * as coreGaining from "../core/gaining";
import * as coreInstalling from "../core/installing";
import * as coreMoving from "../core/moving";
import * as corePayment from "../core/payment";
import * as corePlayInstants from "../core/play_instants";
import * as coreProps from "../core/props";
import * as corePurging from "../core/purging";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreTags from "../core/tags";
import * as coreToString from "../core/to_string";
import * as utils from "../utils";
import { req, effect, msg, wait_for } from "../macros";

// Helper to build cost string
function buildCostString(...args: any[]): string {
  return (corePayment.buildCostString as any)?.(...args);
}

// Helper to check if can pay
function canPay(...args: any[]): boolean {
  return (corePayment.canPay as any)?.(...args);
}

// Helper to merge costs
function mergeCosts(...args: any[]): any[] {
  return (corePayment.mergeCosts as any)?.(...args);
}

// Helper to create credit cost
function toC(...args: any[]): any {
  return (corePayment.toC as any)?.(...args);
}

// Helper to get effects
function getEffects(...args: any[]): any[] {
  return (coreEffects.getEffects as any)?.(...args);
}

// Helper to get installed cards
function allActiveInstalled(...args: any[]): Card[] {
  return (coreBoard.allActiveInstalled as any)?.(...args);
}

// Helper to get installable servers
function installableServers(...args: any[]): string[] {
  return (coreBoard.installableServers as any)?.(...args);
}

// Helper for in-hand check
function inHandStar(state: State, card: Card): boolean {
  return coreCard.inHandStar
    ? coreCard.inHandStar(state, card)
    : coreCard.inHand(card);
}

// Helper for tagged check
function isTagged(state: State): boolean {
  return utils.isTagged?.(state) ?? false;
}

// Helper to check if untrashable while resources
function untrashableWhileResources(card: Card): boolean {
  return coreFlags.untrashableWhileResources?.(card) ?? false;
}

// Define Corp Basic Action Card
export const corpBasicActionCard = {
  title: "Corp Basic Action Card",
  abilities: [
    // Gain 1 [Credits]
    {
      action: true,
      label: "Gain 1 [Credits]",
      cost: [toC("click")],
      msg: "gain 1 [Credits]",
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
            coreGaining.gainCredits(state, side, 1, {
              action: ":corp-click-credit",
            }),
          ],
          [coreSay.playSfx, state, side, "click-credit"],
        );
        const stats = state.stats ?? (state.stats = {});
        const sideStats = (stats[side] ??= {});
        const clickStats = (sideStats.click ??= {});
        clickStats.credit = (clickStats.credit ?? 0) + 1;
        coreSay.playSfx(state, side, "click-credit");
        return coreEid.effectCompleted(state, side, eid);
      }),
    },
    // Draw 1 card
    {
      action: true,
      label: "Draw 1 card",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const deck = (state as any)[side].deck;
        return deck && deck.length > 0;
      }),
      cost: [toC("click")],
      msg: "draw 1 card",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const deck = (state as any)[side].deck;
        const firstCard = deck[0];
        coreEngine.triggerEvent(state, side, ":corp-click-draw", {
          card: firstCard,
        });
        const stats1 = state.stats ?? (state.stats = {});
        const sideStats1 = (stats1[side] ??= {});
        const clickStats1 = (sideStats1.click ??= {});
        clickStats1.draw = (clickStats1.draw ?? 0) + 1;
        coreSay.playSfx(state, side, "click-card");
        coreDrawing.draw(state, side, eid, 1);
      }),
    },
    // Install 1 agenda, asset, upgrade, or piece of ice from HQ
    {
      action: true,
      label: "Install 1 agenda, asset, upgrade, or piece of ice from HQ",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = targets[0] || {};
        const targetCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        const server = context.server;
        const corp = (state as any).corp;

        if (!corp.hand || corp.hand.length === 0) return false;
        if (!targetCard || !coreCard.inHand(targetCard)) return false;
        if (
          !coreCard.agenda(targetCard) &&
          !coreCard.asset(targetCard) &&
          !coreCard.ice(targetCard) &&
          !coreCard.upgrade(targetCard)
        )
          return false;

        if (server) {
          return coreInstalling.corpCanPayAndInstall(
            state,
            side,
            eid,
            targetCard,
            server,
            {
              baseCost: [toC("click", 1)],
              ignoreIceCost: true,
              action: ":corp-click-install",
              noToast: true,
            },
          );
        } else {
          const servers = installableServers(state, targetCard);
          for (const srv of servers) {
            if (
              coreInstalling.corpCanPayAndInstall(
                state,
                side,
                eid,
                targetCard,
                srv,
                {
                  baseCost: [toC("click", 1)],
                  ignoreIceCost: true,
                  action: ":corp-click-install",
                  noToast: true,
                },
              )
            ) {
              return true;
            }
          }
          return false;
        }
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = targets[0] || {};
        const targetCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        const server = context.server;
        coreInstalling.corpInstall(state, side, eid, targetCard, server, {
          baseCost: [toC("click", 1)],
          action: ":corp-click-install",
        });
      }),
    },
    // Play 1 operation
    {
      action: true,
      label: "Play 1 operation",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = targets[0] || {};
        const targetCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        const corp = (state as any).corp;

        if (!corp.hand || corp.hand.length === 0) return false;
        if (!targetCard || !coreCard.inHand(targetCard)) return false;
        if (!coreCard.operation(targetCard)) return false;
        return corePlayInstants.canPlayInstant(
          state,
          ":corp",
          eid,
          targetCard,
          { baseCost: [toC("click", 1)] },
        );
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = targets[0] || {};
        const targetCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        corePlayInstants.playInstant(state, ":corp", eid, targetCard, {
          baseCost: [toC("click", 1)],
        });
      }),
    },
    // Advance 1 installed card
    {
      action: true,
      label: "Advance 1 installed card",
      cost: [toC("click", 1), toC("credit", 1)],
      async: true,
      msg: function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = targets[0] || {};
        const targetCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        return (
          "advance " +
          (targetCard ? coreToString.cardStr(state, targetCard) : "")
        );
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = targets[0] || {};
        const targetCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        coreAgendas.updateAdvancementRequirement(targetCard);
        coreSay.playSfx("click-advance");
        coreProps.addProp(eid, targetCard, ":advance-counter", 1);
      }),
    },
    // Trash 1 resource if the Runner is tagged
    {
      action: true,
      label: "Trash 1 resource if the Runner is tagged",
      cost: [toC("click", 1), toC("credit", 2)],
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return isTagged(state);
      }),
      prompt: "Choose a resource to trash",
      msg: function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target = targets[0];
        const targetCard =
          typeof target === "object" && target.uuid
            ? coreCard.getCard(state, target)
            : target;
        return "trash " + (targetCard ? targetCard.title || target : "");
      },
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target = targets[0];
          const targetCard =
            typeof target === "object" && target.uuid
              ? coreCard.getCard(state, target)
              : target;

          const runnerResources = allActiveInstalled(state, ":runner").filter(
            (c: Card) => coreCard.resource(c),
          );
          const resourceCount = runnerResources.length;

          const isUntrashable = untrashableWhileResources(targetCard);
          if (isUntrashable && resourceCount < 2) {
            return true; // Allow even if untrashable when resources are few
          }
          if (isUntrashable) return false;
          if (!coreCard.resource(targetCard)) return false;

          const additionalCosts = mergeCosts([
            ...(getEffects(
              state,
              side,
              ":basic-ability-additional-trash-cost",
              targetCard,
            ) || []),
            ...(getEffects(state, side, ":additional-trash-cost", targetCard) ||
              []),
          ]);

          const eidWithCosts = coreEid.makeEid(state, {
            ...eid,
            additionalCosts,
          });
          return (
            !additionalCosts.length ||
            canPay(
              state,
              side,
              eidWithCosts,
              targetCard,
              targetCard.title || "",
              additionalCosts,
            )
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
        const target = targets[0];
        const targetCard =
          typeof target === "object" && target.uuid
            ? coreCard.getCard(state, target)
            : target;

        const additionalCosts = mergeCosts(
          getEffects(
            state,
            side,
            ":basic-ability-additional-trash-cost",
            targetCard,
          ) || [],
        );
        const costStrs = buildCostString(additionalCosts);
        const canPayCost = canPay(
          state,
          side,
          coreEid.makeEid(state, { ...eid, additionalCosts }),
          targetCard,
          targetCard.title || "",
          additionalCosts,
        );

        if (additionalCosts.length === 0) {
          coreMoving.trash(state, side, eid, targetCard, null);
        } else {
          const promptAbility: any = {
            prompt: `Pay the additional cost to trash ${targetCard.title}?`,
            choices: [canPayCost ? costStrs : null, "No"].filter(Boolean),
            async: true,
            effect: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              if (target === "No") {
                coreSay.systemMsg(
                  state,
                  side,
                  `declines to pay the additional cost to trash ${targetCard.title}`,
                );
                return coreEid.effectCompleted(state, side, eid);
              } else {
                yield wait_for(
                  state,
                  [
                    { asyncResult: "result" },
                    coreEngine.pay(
                      state,
                      side,
                      coreEid.makeEid(state, {
                        ...eid,
                        additionalCosts,
                        sourceType: ":trash-card",
                      }),
                      null,
                      additionalCosts,
                    ),
                  ],
                  [
                    coreSay.systemMsg,
                    state,
                    side,
                    "[[msg]] as an additional cost to trash " +
                      targetCard.title,
                  ],
                );
                return coreEid.completeWithResult(state, side, eid, target);
              }
            }),
          };

          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreEngine.resolveAbility(
                state,
                side,
                promptAbility,
                card,
                targets,
              ),
            ],
            [],
          );
          if (targets[0] !== "No") {
            coreMoving.trash(state, side, eid, targetCard, null);
          }
        }
      }),
    },
    // Purge virus counters
    {
      action: true,
      label: "Purge virus counters",
      cost: [toC("click", 3)],
      msg: "purge all virus counters",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreSay.playSfx(state, side, "virus-purge");
        corePurging.purge(state, side, eid);
      }),
    },
  ],
};

// Define Runner Basic Action Card
export const runnerBasicActionCard = {
  title: "Runner Basic Action Card",
  abilities: [
    // Gain 1 [Credits]
    {
      action: true,
      label: "Gain 1 [Credits]",
      cost: [toC("click")],
      msg: "gain 1 [Credits]",
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
            coreGaining.gainCredits(state, side, 1, {
              action: ":runner-click-credit",
            }),
          ],
          [coreSay.playSfx, state, side, "click-credit"],
        );
        const stats = state.stats ?? (state.stats = {});
        const sideStats = (stats[side] ??= {});
        const clickStats = (sideStats.click ??= {});
        clickStats.credit = (clickStats.credit ?? 0) + 1;
        coreSay.playSfx(state, side, "click-credit");
        return coreEid.effectCompleted(state, side, eid);
      }),
    },
    // Draw 1 card
    {
      action: true,
      label: "Draw 1 card",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const deck = (state as any).runner.deck;
        return deck && deck.length > 0;
      }),
      cost: [toC("click")],
      msg: "draw 1 card",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const deck = (state as any).runner.deck;
        const firstCard = deck[0];
        coreEngine.triggerEvent(state, side, ":runner-click-draw", {
          card: firstCard,
        });
        const stats2 = state.stats ?? (state.stats = {});
        const sideStats2 = (stats2[side] ??= {});
        const clickStats2 = (sideStats2.click ??= {});
        clickStats2.draw = (clickStats2.draw ?? 0) + 1;
        coreSay.playSfx(state, side, "click-card");
        const bonusDraws = coreDrawing.useBonusClickDraws
          ? coreDrawing.useBonusClickDraws(state)
          : 0;
        coreDrawing.draw(state, side, eid, 1 + bonusDraws);
      }),
    },
    // Install 1 program, resource, or piece of hardware from the grip
    {
      action: true,
      label: "Install 1 program, resource, or piece of hardware from the grip",
      async: true,
      req: req(function* (
        state: State,
        Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = targets[0] || {};
        const targetCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;

        if (
          !targetCard ||
          (!coreCard.hardware(targetCard) &&
            !coreCard.program(targetCard) &&
            !coreCard.resource(targetCard))
        )
          return false;
        if (!inHandStar(state, targetCard)) return false;
        return coreInstalling.runnerCanPayAndInstall(
          state,
          ":runner",
          { ...eid, sourceType: ":runner-install" },
          targetCard,
          { baseCost: [toC("click", 1)] },
        );
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = targets[0] || {};
        const targetCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        coreInstalling.runnerInstall(state, ":runner", { ...eid }, targetCard, {
          baseCost: [toC("click", 1)],
          noToast: true,
        });
      }),
    },
    // Play 1 event
    {
      action: true,
      label: "Play 1 event",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = targets[0] || {};
        const targetCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;

        if (!targetCard || !coreCard.inHand(targetCard)) return false;
        if (!coreCard.event(targetCard)) return false;
        return corePlayInstants.canPlayInstant(
          state,
          ":runner",
          { ...eid, sourceType: ":play" },
          targetCard,
          { baseCost: [toC("click", 1)] },
        );
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = targets[0] || {};
        const targetCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        corePlayInstants.playInstant(
          state,
          ":runner",
          { ...eid, sourceType: ":play" },
          targetCard,
          { baseCost: [toC("click", 1)] },
        );
      }),
    },
    // Run any server
    {
      action: true,
      label: "Run any server",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = targets[0] || {};
        coreRuns.makeRun(eid, context.server, null, { clickRun: true });
      }),
    },
    // Remove 1 tag
    {
      action: true,
      label: "Remove 1 tag",
      cost: [toC("click", 1), toC("credit", 2)],
      msg: "remove 1 tag",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return isTagged(state);
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreSay.playSfx("click-remove-tag");
        coreTags.loseTags(eid, 1);
      }),
    },
  ],
};
