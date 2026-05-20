/**
 * Core access functions (part 1)
 * Ported from Clojure core/access.clj to TypeScript
 */

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types";
import * as coreAgendas from "./agendas";
import * as coreBoard from "./board";
import * as coreCard from "./card";
import * as coreTypes from "./types";
import * as coreCostFns from "./cost_fns";
import * as coreEffects from "./effects";
import * as coreEid from "./eid";
import * as coreEngine from "./engine";
import * as coreFinding from "./finding";
import * as coreFlags from "./flags";
import * as coreMoving from "./moving";
import * as corePayment from "./payment";
import * as coreRevealing from "./revealing";
import * as coreSay from "./say";
import * as coreServers from "./servers";
import * as coreUpdating from "./update";
import * as utils from "../utils";
import { req, wait_for, continue_ability, forms } from "../macros";
import * as coreToString from "./to_string";

import {
  accessCardsFromRd,
  accessHelperRemote,
  accessHelperRd,
  accessHelperHq,
  accessHelperArchives,
  maxAccess,
} from "./access_2";

function toC(type: string, value: number): corePayment.CostData {
  return corePayment.toC(type, value);
}

/** Increments the no-trash-or-steal counter. */
export function noTrashOrSteal(state: GameState): void {
  const runner = state.runner;
  runner.register = runner.register || {};
  runner.register["no-trash-or-steal"] =
    ((runner.register["no-trash-or-steal"] as number | undefined) || 0) + 1;
}

/** Returns the sum of :access-bonus effects for the given side and keyword. */
export function accessBonusCount(
  state: GameState,
  side: string,
  kw: string,
): number {
  return coreEffects.sumEffects(state, side, ":access-bonus", null, [kw as unknown as Card]);
}

/**
 * Trigger events involving the end of the access phase, including :no-trash and :post-access-card.
 */
export function accessEnd(
  state: GameState,
  side: string,
  eid: EID,
  c: Card,
  opts?: { trashed?: boolean; stolen?: boolean },
): void {
  const trashed = opts?.trashed ?? false;
  const stolen = opts?.stolen ?? false;

  const noTrashEvent = !trashed ? ":no-trash" : null;
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: unknown) {
        if (!trashed && !stolen && !coreCard.inDiscard(c)) {
          noTrashOrSteal(s);
        }
        const accessedCard = (s as unknown as Record<string, unknown>).access as Card | undefined;
        delete (s as unknown as Record<string, unknown>).access;
        coreEngine.triggerEventSync(s, side, eid, ":post-access-card", {
          "accessed-card": c,
          "accessed-card-snapshot": accessedCard,
        });
      },
    ],
    [coreEngine.triggerEventSync, state, side, eid, noTrashEvent, { "accessed-card": c }],
    { eid },
  );
}

export function interactions(card: Card, abilityKey: string): Ability | undefined {
  const cdef = coreTypes.getCardDef(card);
  const interactionsMap = cdef?.interactions as Record<string, Ability> | undefined;
  return interactionsMap?.[abilityKey];
}

export function accessAb(card: Card): Ability | undefined {
  return interactions(card, ":access-ability");
}

export function accessAbLabel(state: GameState, card: Card): string {
  const title = (card.title || "").split(":")[0];
  const accessAbility = accessAb(card);
  if (!accessAbility) return `[${title}] `;
  const abilityCost = coreCostFns.cardAbilityCost(
    state,
    "runner",
    accessAbility,
    card,
  );
  corePayment.addCostLabelToAbility(accessAbility, abilityCost);
  const label = corePayment.buildCostLabel(abilityCost);
  return `[${title}] ${label}`;
}

/**
 * Access a non-agenda. Show a prompt to trash for trashable cards.
 */
export function accessNonAgenda(
  state: GameState,
  side: string,
  eid: EID,
  c: Card,
  opts?: { skipTriggerEvent?: boolean },
): void {
  const skipTriggerEvent = opts?.skipTriggerEvent ?? false;
  const preTrashEvent = !skipTriggerEvent ? ":pre-trash" : null;

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: unknown) {
        type AccessStats = { cards?: number; [k: string]: unknown };
        type RunnerStats = { access?: AccessStats; [k: string]: unknown };
        type Stats = { runner?: RunnerStats; [k: string]: unknown };
        const stats = s.stats as Stats;
        stats.runner = stats.runner || {};
        stats.runner.access = stats.runner.access || {};
        stats.runner.access.cards = (stats.runner.access.cards || 0) + 1;

        const seenInArchives = coreCard.inDiscard(c) && c.seen;
        const edwardKimTrash =
          coreCard.isOperation(c) &&
          coreFlags.cardFlag(c, ":can-trash-operation", true);
        const alreadyTrashed =
          !coreCard.inDiscard(c) &&
          coreFinding.findCID(c.cid, s.corp.discard);

        if (seenInArchives || edwardKimTrash || alreadyTrashed) {
          accessEnd(s, side, eid, c);
          return;
        }

        const card = { ...c, seen: true };
        const trashCostVal = !coreCard.inDiscard(c)
          ? coreCostFns.trashCost(s, side, card)
          : undefined;
        const trashEid: EID = {
          ...eid,
          source: card,
          sourceType: ":runner-trash-corp-cards",
        };
        const canTrash = coreFlags.canTrash(s, side, c);
        const canPayTrash = trashCostVal
          ? corePayment.canPay(s, "runner", trashEid, card, null, [
              toC("credit", trashCostVal),
            ])
          : false;
        const trashCostStr = canPayTrash
          ? [`Pay ${trashCostVal} [Credits] to trash`]
          : undefined;

        const runnerReg = s.runner.register || {};
        const mustTrashWithCredits = canPayTrash && runnerReg["must-trash-with-credits"];

        let accessAbCards: Card[] = [];
        if (!mustTrashWithCredits) {
          const activeCards = coreBoard.allActive(s, "runner");
          accessAbCards = activeCards.filter((ac: Card) => {
            const ability = accessAb(ac);
            return (
              ability &&
              coreEngine.canTrigger(s, "runner", eid, ability, ac, [card]) &&
              corePayment.canPay(
                s,
                "runner",
                eid,
                ac,
                null,
                coreCostFns.cardAbilityCost(s, side, ability, ac, [card]),
              )
            );
          });
        }

        const { trashAbCards, nonTrashAbCards } = accessAbCards.reduce(
          (acc, ac) => {
            const ability = accessAb(ac);
            const isTrash = ability?.["trash?"] === true;
            return isTrash
              ? { ...acc, trashAbCards: [...acc.trashAbCards, ac] }
              : { ...acc, nonTrashAbCards: [...acc.nonTrashAbCards, ac] };
          },
          { trashAbCards: [] as Card[], nonTrashAbCards: [] as Card[] },
        );

        const mustTrash =
          !mustTrashWithCredits &&
          (canTrash || trashAbCards.length > 0) &&
          coreFlags.cardFlagFn(s, side, c, ":must-trash", true);

        const abilityCards = mustTrash
          ? trashAbCards
          : !canTrash
            ? nonTrashAbCards
            : accessAbCards;
        const abilityStrs = abilityCards.map((ac: Card) => ({
          cid: ac.cid,
          title: accessAbLabel(s, ac),
        }));

        const forcedToTrash = mustTrash || mustTrashWithCredits;
        const noActionStr = !canTrash || !forcedToTrash ? ["No action"] : undefined;
        const choices = [
          ...abilityStrs,
          ...(trashCostStr || []),
          ...(noActionStr || []),
        ];

        const promptFn = req((s2: GameState, sid: string, _e2: EID, cd: Card, tgt: unknown[]) => {
          const target = forms.context(s2, cd, tgt);

          // No action
          if (target === (noActionStr?.[0] || "No action")) {
            accessEnd(s2, sid, eid, cd);
            return null;
          }

          // Pay credits to trash
          if (trashCostStr && target === trashCostStr[0]) {
            const updatedCard: Card = { ...cd, seen: true };
            coreUpdating.update!(s2, sid, updatedCard);
            const payEid: EID = {
              ...coreEid.makeEID(s2),
              ...trashEid,
            };
            wait_for(
              s2,
              [
                { asyncResult: "result" },
                function (s3: GameState, _e3: EID, binds: { asyncResult?: unknown }) {
                  const paymentStr = (binds.asyncResult as { msg?: string })?.msg;
                  if (s3.breach) (s3.breach as Record<string, unknown>)["did-trash"] = true;
                  if (s3.run) {
                    (s3.run as unknown as Record<string, unknown>)["did-trash"] = true;
                    if (mustTrash) (s3.run as unknown as Record<string, unknown>)["did-access"] = true;
                  }
                  s3.runner.register = s3.runner.register || {};
                  s3.runner.register["trashed-card"] = true;
                  s3.runner.register["trashed-accessed-card"] = true;
                  coreSay.systemMsg(
                    s3,
                    sid,
                    `${paymentStr || "Paid"} to trash ${updatedCard.title} from ${coreServers.nameZone("corp", coreCard.getZone(updatedCard))}`,
                  );
                  wait_for(
                    s3,
                    [
                      { asyncResult: "result" },
                      function (s4: GameState, _e4: EID, binds2: { asyncResult?: unknown }) {
                        accessEnd(s4, sid, eid, (binds2.asyncResult as Card[] | undefined)?.[0] || updatedCard, { trashed: true });
                      },
                    ],
                    [coreMoving.trash, s3, sid, coreEid.makeEID(s3), updatedCard],
                  );
                },
              ],
              [coreEngine.pay, s2, sid, payEid, updatedCard, [toC("credit", trashCostVal!)]],
            );
            return null;
          }

          // Use access ability
          const abilityCard = abilityCards.find(
            (ac) => accessAbLabel(s2, ac) === target,
          );
          if (abilityCard) {
            const abilityEid: EID = {
              ...eid,
              source: abilityCard,
              sourceType: ":ability",
            };
            const ability = accessAb(abilityCard);
            if (ability?.["trash?"] === true) {
              s2.runner.register = s2.runner.register || {};
              s2.runner.register["trashed-accessed-card"] = true;
            }
            if (s2.breach && ability?.["trash?"] === true) (s2.breach as Record<string, unknown>)["did-trash"] = true;
            if (s2.run && ability?.["trash?"] === true) (s2.run as unknown as Record<string, unknown>)["did-trash"] = true;
            wait_for(
              s2,
              [
                { asyncResult: "result" },
                function (s4: GameState, _e4: EID, binds: { asyncResult?: unknown }) {
                  const resultCard = (binds.asyncResult as { msg?: string } & Card[])?.[0] || cd;
                  accessEnd(s4, sid, eid, resultCard, { trashed: coreCard.inDiscard(resultCard) });
                },
              ],
              [coreEngine.resolveAbility, s2, sid, { ...ability, eid: { ...coreEid.makeEID(s2), ...abilityEid } } as Ability, abilityCard, [cd]],
            );
            return null;
          }

          // Fallback
          accessEnd(s2, sid, eid, cd);
          return null;
        });

        continue_ability(
          s,
          "runner",
          {
            async: true,
            prompt: `You accessed ${card.title}.`,
            choices,
            effect: promptFn,
          },
          card,
          null,
        );
      },
    ],
    [coreEngine.triggerEventSync, state, side, eid, preTrashEvent, { "accessed-card": c }],
    { eid },
  );
}

/** Applies a cost to the next steal attempt. */
export function stealCostBonus(
  state: GameState,
  _side: string,
  costs: corePayment.CostData[],
  source: Card | null,
): void {
  const bonus = (state.bonus as Record<string, unknown>) || {};
  const stealCosts = (bonus["steal-cost"] as unknown[]) || [];
  (state.bonus as unknown as Record<string, unknown>) = {
    ...bonus,
    "steal-cost": [...stealCosts, [costs, source]],
  };
}

/**
 * Moves a card to the runner's :scored area, triggering events from the completion of the steal.
 */
export function steal(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
): void {
  const moved = coreMoving.move(
    state,
    "runner",
    { ...card, "advance-counter": undefined, new: undefined },
    "scored",
    { force: true },
  );
  if (!moved) {
    coreEid.effectCompleted(state, side, eid);
    return;
  }
  const c: Card = moved;

  if (coreFlags.cardFlag(c, ":has-events-when-stolen", true)) {
    coreEngine.registerDefaultEvents(state, side, c);
    coreEffects.registerStaticAbilities(state, side, c);
  }

  coreAgendas.updateAllAdvancementRequirements(state);
  coreAgendas.updateAllAgendaPoints(state);

  const updatedC: Card = coreFinding.getCard(state, c) ?? c;
  const points = coreCard.getAgendaPoints(updatedC);

  coreSay.systemMsg(
    state,
    "runner",
    `steals ${updatedC.title} and gains ${utils.quantify(points, "agenda point")}`,
  );

  const runnerReg = state.runner.register || {};
  runnerReg["stole-agenda"] =
    ((runnerReg["stole-agenda"] as number | undefined) || 0) +
    ((updatedC.agendapoints as number | undefined) || 0);

  coreSay.playSfx(state, side, "agenda-steal");

  if (state.breach) (state.breach as Record<string, unknown>)["did-steal"] = true;
  if (state.run) (state.run as unknown as Record<string, unknown>)["did-steal"] = true;

  const cdef = coreTypes.getCardDef(updatedC);
  const onStolen = cdef?.stolen;
  if (onStolen)
    coreEngine.registerPendingEvent(
      state,
      ":agenda-stolen",
      updatedC,
      onStolen,
    );

  coreEngine.queueEvent(state, ":agenda-stolen", { card: updatedC, points });

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: unknown) {
        accessEnd(s, side, eid, c, { stolen: true });
      },
    ],
    [coreEngine.checkpoint, state, null, { ...coreEid.makeEID(state), ...eid }, { duration: ":agenda-stolen" }],
  );
}

/**
 * Trigger the stealing of an agenda, now that costs have been paid.
 * Clojure: (if (or (not (:steal-req cdef)) ((:steal-req cdef) state :runner eid card nil))
 *   (steal state :runner eid card)
 *   (access-end state side eid card))
 */
export function stealAgenda(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
): void {
  const cdef = coreTypes.getCardDef(card);
  const stealReq = cdef?.["steal-req"];

  if (!stealReq || stealReq(state, "runner", eid, card, null)) {
    steal(state, "runner", eid, card);
  } else {
    accessEnd(state, side, eid, card);
  }
}

/**
 * Rules interactions for a runner that has accessed an agenda and may be able to steal it.
 */
export function accessAgenda(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
): void {
  type AccessStats = { cards?: number; "unique-cards"?: string[]; [k: string]: unknown };
  type RunnerStats = { access?: AccessStats; [k: string]: unknown };
  type Stats = { runner?: RunnerStats; [k: string]: unknown };
  const stats = state.stats as Stats;
  stats.runner = stats.runner || {};
  stats.runner.access = stats.runner.access || {};
  stats.runner.access.cards = (stats.runner.access.cards || 0) + 1;

  const cost = corePayment.mergeCosts(
    coreCostFns.stealCost(state, side, eid, card),
  );
  const costStrs = corePayment.buildCostString(cost);
  const eidWithCosts: EID = { ...eid, additionalCosts: cost } as EID;
  const canPay = corePayment.canPay(
    state,
    side,
    { ...coreEid.makeEID(state), ...eidWithCosts } as EID,
    card,
    card.title ?? null,
    cost,
  );
  const canSteal = coreFlags.canSteal(state, side, card);

  let accessAbCards: Card[] = [];
  if (!coreCard.inDiscard(card)) {
    const activeCards = coreBoard.allActive(state, "runner");
    accessAbCards = activeCards.filter((ac: Card) => {
      const ability = accessAb(ac);
      return (
        ability &&
        coreEngine.canTrigger(state, "runner", eid, ability, ac, [card]) &&
        corePayment.canPay(
          state,
          "runner",
          eid,
          ac,
          null,
          coreCostFns.cardAbilityCost(state, side, ability, ac, [card]),
        )
      );
    });
  }

  const abilityStrs = accessAbCards.map((ac: Card) => ({
    cid: ac.cid,
    title: accessAbLabel(state, ac),
  }));
  const costStrsStr = costStrs ?? "";
  const stealStr =
    canSteal && canPay
      ? costStrsStr.length > 0
        ? ["Pay to steal"]
        : ["Steal"]
      : undefined;
  const noActionStr =
    stealStr && stealStr[0] !== "Steal" ? ["No action"] : undefined;
  const promptStr =
    costStrsStr.length > 0
      ? `You accessed ${card.title}. ${costStrsStr} to steal?`
      : `You accessed ${card.title}.`;
  const choices = [...abilityStrs, ...(stealStr || []), ...(noActionStr || [])];

  const promptFn = req((s: GameState, sid: string, e: EID, cd: Card, tgt: unknown[]) => {
    const target = forms.context(s, cd, tgt);

    // Can't steal or pay, or won't pay
    if (target === "No action") {
      if (!coreFinding.findCID(cd.cid, s.corp.deck)) {
        coreSay.systemMsg(s, sid, `decides to not pay to steal ${cd.title}`);
      }
      accessEnd(s, sid, e, cd);
      return null;
    }

    // Steal normally (free)
    if (target === "Steal") {
      stealAgenda(s, sid, e, cd);
      return null;
    }

    // Pay additional costs to steal
    if (target === "Pay to steal") {
      const payEid: EID = {
        ...coreEid.makeEID(s),
        ...eid,
        additionalCosts: cost,
        source: cd,
        sourceType: ":runner-steal",
        action: ":steal-cost",
      } as EID;
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e2: EID, binds: { asyncResult?: unknown }) {
            const paymentStr = (binds.asyncResult as { msg?: string })?.msg;
            coreSay.systemMsg(
              s2,
              sid,
              `${paymentStr || "Paid"} to steal ${cd.title} from ${coreServers.nameZone("corp", coreCard.getZone(cd))}`,
            );
            stealAgenda(s2, sid, e, cd);
          },
        ],
        [coreEngine.pay, s, sid, payEid, null, cost],
      );
      return null;
    }

    // Use access ability
    const abilityCard = accessAbCards.find(
      (ac) => accessAbLabel(s, ac) === target,
    );
    if (abilityCard) {
      const abilityEid: EID = {
        ...eid,
        source: abilityCard,
        sourceType: ":ability",
      } as EID;
      const ability = accessAb(abilityCard);
      if (s.breach && ability?.["trash?"] === true) (s.breach as Record<string, unknown>)["did-trash"] = true;
      if (s.run && ability?.["trash?"] === true) (s.run as unknown as Record<string, unknown>)["did-trash"] = true;
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e3: EID, binds: { asyncResult?: unknown }) {
            const resultCard = (binds.asyncResult as { msg?: string } & Card[])?.[0] || cd;
            accessEnd(s2, sid, e, resultCard, { stolen: coreCard.inScored(resultCard) });
          },
        ],
        [coreEngine.resolveAbility, s, sid, { ...ability, eid: { ...coreEid.makeEID(s), ...abilityEid } } as Ability, abilityCard, [cd]],
      );
      return null;
    }

    accessEnd(s, sid, e, cd, { stolen: coreCard.inScored(cd) });
    return null;
  });

  continue_ability(
    state,
    "runner",
    { async: true, prompt: promptStr, choices, effect: promptFn },
    card,
    null,
  );
}

/**
 * Check if the card should be revealed on access.
 * Uses keyword-style zone checks as in Clojure.
 */
export function revealAccess(
  state: GameState,
  side: string,
  card: Card,
): boolean {
  const cdef = coreTypes.getCardDef(card);
  const zone = coreCard.getZone(card);

  const revealKw =
    zone[0] === ":deck"
      ? ":rd-reveal"
      : zone[0] === ":hand"
        ? ":hq-reveal"
        : zone[0] === ":discard"
          ? ":archives-reveal"
          : ":reveal";

  const revealFn = cdef?.flags?.[revealKw];
  if (!revealFn) return false;

  const eid = coreEid.makeEID(state);
  if (typeof revealFn !== "function") return !!revealFn;
  return !!(revealFn as (...a: unknown[]) => unknown)(state, side, eid, card, []);
}

export function joinCostStrs(
  ...costs: Array<string | string[] | null | undefined>
): string {
  const flat = costs.flat(Infinity).filter((c) => c != null);
  return flat.join(" and ");
}

/**
 * Generate the message from the access.
 */
export function msgHandleAccess(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  title: string,
  args?: { costMsg?: string | string[]; noMsg?: boolean },
): void {
  const costMsg = args?.costMsg || [];
  const noMsg = args?.noMsg ?? false;
  const costStr = joinCostStrs(costMsg);

  if (!noMsg) {
    const publicMsg = `${costStr ? `${costStr} to access ` : ""}accesses ${title}${card ? ` from ${coreServers.nameZone("corp", coreCard.getZone(card))}` : ""}`;
    const runnerMsg = card
      ? `${costStr ? `${costStr} to access ` : ""}accesses ${card.title}${card ? ` from ${coreServers.nameZone("corp", coreCard.getZone(card))}` : ""}`
      : publicMsg;

    if (title === "an unseen card") {
      coreSay.systemMsg(state, side, publicMsg, {
        logSide: ["public", "corp"],
      });
      coreSay.systemMsg(state, side, runnerMsg, { logSide: "runner" });
    } else {
      coreSay.systemMsg(state, side, publicMsg);
    }
  }

  if (card && revealAccess(state, side, card)) {
    coreSay.systemMsg(state, side, `must reveal they accessed ${card.title}`);
    coreRevealing.reveal(state, "runner", eid, card);
  } else {
    coreEid.effectCompleted(state, side, eid);
  }
}

export function accessAbility(card: Card, cdef: Record<string, unknown> | undefined): Ability | null {
  const onAccess = cdef?.["on-access"];
  if (!onAccess) return null;
  return {
    ...coreEngine.abilityAsHandler(card, onAccess),
    condition: ":accessed",
  };
}

/**
 * Effect for triggering ambush on access.
 * Clojure has two arities: ([cost ability] ...) and ([cost ability prompt] ...)
 */
export function installedAccessTrigger(
  cost: number | corePayment.CostData[],
  ability: Ability,
  prompt?: Ability["prompt"],
): Record<string, unknown> {
  if (prompt === undefined) {
    const ab =
      typeof cost === "number" && cost > 0
        ? { ...ability, cost: [toC("credit", cost)] }
        : ability;
    const pr =
      typeof cost === "number" && cost > 0
        ? req((st, _si, _ei, ca, _tg) =>
            `Pay ${cost} [Credits] to use ${ca.title} ability?`,
          )
        : req((_st, _si, _ei, ca, _tg) => `Use ${ca.title} ability?`);
    return installedAccessTrigger(cost, ab, pr);
  }

  const costArr = typeof cost === "number" ? [toC("credit", cost)] : cost;
  return {
    "on-access": {
      optional: {
        req: req((state: GameState, _side: string, eid: EID, card: Card, _targets: unknown[]) => {
          const installed =
            card.zone && (card.zone[0] === ":rig" || card.zone[0] === ":servers");
          return (
            installed &&
            corePayment.canPay(state, "corp", eid, card, null, costArr)
          );
        }),
        "waiting-prompt": ability["waiting-prompt"],
        prompt: prompt,
        "yes-ability": (() => {
          const keys = Object.keys(ability);
          const result: Record<string, unknown> = {};
          for (const k of keys) {
            if (k !== "waiting-prompt") result[k] = ability[k];
          }
          return result;
        })(),
      },
    },
  };
}

/**
 * Trigger access effects, then move into trash/steal choice.
 */
export function accessTriggerEvents(
  state: GameState,
  side: string,
  eid: EID,
  c: Card,
  title: string,
  args: { noMsg?: boolean; costMsg?: string | string[] },
): void {
  const cdef = coreTypes.getCardDef(c);
  const cUpdated: Card = {
    ...c,
    "was-seen": c.seen,
    seen: c.seen || !coreCard.inDiscard(c),
  } as Card;
  const accessEffect = accessAbility(cUpdated, cdef);

  state.runner.register = {
    ...(state.runner.register || {}),
    "accessed-cards": true,
  };

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e1: EID, _b1: unknown) {
        const cancelFn = () =>
          !coreFinding.getCard(s, c) || !(s as unknown as Record<string, unknown>).access;

        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: unknown) {
              const currentCard = coreFinding.getCard(s2, c);
              const accessedCard = (s2 as unknown as Record<string, unknown>).access as Card | undefined;

              if (currentCard && utils.sameCard(c, accessedCard ?? null)) {
                const card = currentCard;
                if (coreCard.isAgenda(card)) {
                  accessAgenda(s2, side, eid, card);
                } else {
                  accessNonAgenda(s2, side, eid, card);
                }
              } else {
                const trashed = !!coreFinding.findCID(c.cid, s2.corp.discard);
                const stolen =
                  coreCard.isAgenda(c) &&
                  !!coreFinding.findCID(c.cid, s2.runner.scored);
                accessEnd(s2, side, eid, c, { trashed, stolen });
              }
            },
          ],
          [coreEngine.triggerEventSimult, s, side, ":access", { "card-abilities": accessEffect, "cancel-fn": cancelFn }, { "accessed-card": cUpdated }],
        );
      },
    ],
    [msgHandleAccess, state, side, eid, cUpdated, title, args],
  );
}

/**
 * Applies a cost to the next access.
 */
export function accessCostBonus(costs: corePayment.CostData[]): void;
export function accessCostBonus(
  state: GameState,
  side: string,
  costs: corePayment.CostData[],
): void;
export function accessCostBonus(
  ...args:
    | [corePayment.CostData[]]
    | [GameState, string, corePayment.CostData[]]
): void {
  if (args.length === 1) return; // no state — no-op
  const state = args[0];
  const costs = args[2];
  const bonus = (state.bonus as Record<string, unknown>) || {};
  const accessCostArr = (bonus["access-cost"] as corePayment.CostData[]) || [];
  (state.bonus as unknown as Record<string, unknown>) = {
    ...bonus,
    "access-cost": corePayment.mergeCosts([...accessCostArr, ...costs]),
  };
}

export function accessCost(
  state: GameState,
  _side: string,
): corePayment.CostData[] {
  const arr =
    ((state.bonus as Record<string, unknown>)?.["access-cost"] as
      | corePayment.CostData[]
      | undefined) || [];
  return corePayment.mergeCosts(arr);
}

export function refusedAccessCost(
  state: GameState,
  side: string,
  eid: EID,
): void {
  delete (state as unknown as Record<string, unknown>).access;
  coreEid.effectCompleted(state, side, eid);
}

/**
 * Force the runner to pay any costs to access this card, if any, before proceeding with access.
 */
export function accessPay(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  title: string,
  args: { noMsg?: boolean; costMsg?: string | string[] },
): void {
  const cost = accessCost(state, side);
  const costStr = corePayment.buildCostString(cost);
  const hasCost = cost && Object.keys(cost).length > 0;
  const canPayVal = hasCost
    ? corePayment.canPay(
        state,
        side,
        coreEid.makeEID(state),
        null,
        null,
        cost,
      )
    : true;

  const promptStr = canPayVal
    ? `${costStr} to access this card?`
    : "You can't pay the cost to access this card.";
  const choices = canPayVal ? ["Pay to access", "No action"] : ["OK"];

  // Did a pre-access-card effect trash the card?
  if (!coreFinding.getCard(state, card)) {
    accessEnd(state, side, eid, card);
    return;
  }

  if (hasCost) {
    const accessedCard = card;
    const promptFn = req((s: GameState, sid: string, e: EID, _cd: Card, tgt: unknown[]) => {
      const target = forms.context(s, _cd, tgt);

      if (target === "OK" || target === "No action") {
        refusedAccessCost(s, sid, e);
        return null;
      }

      // Pay to access - use wait_for around pay
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e2: EID, binds: { asyncResult?: unknown }) {
            const paymentStr = (binds.asyncResult as { msg?: string })?.msg;
            if (paymentStr) {
              accessTriggerEvents(s2, sid, e, accessedCard, title, {
                ...args,
                costMsg: paymentStr,
              });
            } else {
              refusedAccessCost(s2, sid, e);
            }
          },
        ],
        [coreEngine.pay, s, sid, coreEid.makeEID(s), accessedCard, cost],
      );
      return null;
    });

    continue_ability(
      state,
      "runner",
      { async: true, prompt: promptStr, choices, effect: promptFn },
      null as unknown as Card,
      null,
    );
  } else {
    accessTriggerEvents(state, side, eid, card, title, args);
  }
}

export function getOnlyCardToAccess(state: GameState): Card | null {
  const run = state.run as unknown as Record<string, unknown> | null | undefined;
  if (!run?.["only-card-to-access"]) return null;
  const cardRef = run["only-card-to-access"] as Card;
  return coreFinding.getCard(state, cardRef) || null;
}

export function setOnlyCardToAccess(card: Card | null): void;
export function setOnlyCardToAccess(state: GameState, side: string, card: Card | null): void;
export function setOnlyCardToAccess(
  ...args: [Card | null] | [GameState, string, Card | null]
): void {
  if (args.length === 1) return; // no state — no-op
  const state = args[0];
  const card = args[2];
  const run = state.run as unknown as Record<string, unknown> | null | undefined;
  if (!run) return;

  if (
    card &&
    run["only-card-to-access"] &&
    !utils.sameCard(card, run["only-card-to-access"] as Card)
  ) {
    run["max-access"] = 0;
  }

  run["only-card-to-access"] = card;
}

/**
 * Continue the access process for a given card.
 */
export function accessContinue(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  title: string,
  args: { noMsg?: boolean; costMsg?: string | string[] },
): void {
  if (!coreCard.inDiscard(card)) {
    const stats = state.stats;
    (stats as Record<string, Record<string, Record<string, unknown>>>).runner = (stats as Record<string, Record<string, Record<string, unknown>>>).runner || {};
    (stats as Record<string, Record<string, Record<string, unknown>>>).runner.access = (stats as Record<string, Record<string, Record<string, unknown>>>).runner.access || {};
    const uniqueCards = ((stats as Record<string, Record<string, Record<string, unknown>>>).runner.access["unique-cards"] || []) as string[];
    (stats as Record<string, Record<string, Record<string, unknown>>>).runner.access["unique-cards"] = [
      ...new Set([...uniqueCards, card.cid]),
    ];
  }

  (state as unknown as Record<string, unknown>).access = card;

  const bonus = (state.bonus as Record<string, unknown>) || {};
  delete (bonus as Record<string, unknown>).trash;
  delete (bonus as Record<string, unknown>)["steal-cost"];
  delete (bonus as Record<string, unknown>)["access-cost"];
  (state.bonus as unknown as Record<string, unknown>) = bonus;

  if (state.breach) {
    const zone =
      [":discard", ":deck", ":hand"].includes(coreCard.getZone(card)[0])
        ? coreCard.getZone(card)[0]
        : coreCard.getZone(card)[1];
    const breach = state.breach as Record<string, unknown>;
    breach["known-cids"] = breach["known-cids"] || {};
    (breach["known-cids"] as Record<string, string[]>)[zone] = [
      ...((breach["known-cids"] as Record<string, string[]>)[zone] || []),
      card.cid,
    ];
    breach["cards-accessed"] = breach["cards-accessed"] || {};
    (breach["cards-accessed"] as Record<string, number>)[zone] =
      ((breach["cards-accessed"] as Record<string, number>)[zone] || 0) + 1;
  }

  if (state.run) {
    const zone =
      [":discard", ":deck", ":hand"].includes(coreCard.getZone(card)[0])
        ? coreCard.getZone(card)[0]
        : coreCard.getZone(card)[1];
    const run = state.run as unknown as Record<string, unknown>;
    run["cards-accessed"] = run["cards-accessed"] || {};
    (run["cards-accessed"] as Record<string, number>)[zone] =
      ((run["cards-accessed"] as Record<string, number>)[zone] || 0) + 1;
  }

  // First trigger pre-access-card, then move to determining if we can trash or steal.
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: unknown) {
        accessPay(s, side, eid, card, title, args);
      },
    ],
    [coreEngine.triggerEventSync, state, side, eid, ":pre-access-card", { "accessed-card": card }],
    { eid },
  );
}

/**
 * Apply game rules for accessing the given card.
 * 3 arities: ([state side eid card] ...) ([state side eid card title] ...) ([state side eid card title args] ...)
 */
export function accessCard(state: GameState, side: string, card: Card | null): void;
export function accessCard(state: GameState, side: string, eid: EID, card: Card | null, title?: string, args?: { noMsg?: boolean; costMsg?: string | string[] }): void;
export function accessCard(
  state: GameState,
  side: string,
  eidOrCard: EID | Card | null,
  cardArg?: Card | null,
  title?: string,
  args?: { noMsg?: boolean; costMsg?: string | string[] },
): void {
  // Detect 3-arg shorthand vs 4+ form by checking if 3rd arg looks like an EID
  let eid: EID;
  let card: Card | null;
  if (eidOrCard && typeof eidOrCard === "object" && "id" in (eidOrCard as object) && !("title" in (eidOrCard as object))) {
    eid = eidOrCard as EID;
    card = cardArg ?? null;
  } else {
    card = (eidOrCard as Card | null) ?? null;
    eid = coreEid.makeEID(state);
  }
  if (!card) {
    coreEid.effectCompleted(state, side, eid);
    return;
  }
  const cardTitle: string = title ?? card.title ?? "";
  const accessArgs = args || {};
  const onlyCard = getOnlyCardToAccess(state);

  if (onlyCard && !utils.sameCard(onlyCard, card)) {
    coreEid.effectCompleted(state, side, eid);
    return;
  }

  const breachInstalled = (state.breach as Record<string, unknown>)?.installed as Set<string> | undefined;
  if (breachInstalled?.has(card.cid)) {
    continue_ability(
      state,
      side,
      {
        optional: {
          prompt: `Proceed to access ${coreToString.cardStr(state, card)}?`,
          "waiting-prompt": true,
          "yes-ability": {
            async: true,
            effect: req((s: GameState, _sid: string, e: EID, cd: Card, _tgt: unknown[]) => {
              accessContinue(s, _sid, e, cd, cardTitle, accessArgs);
              return null;
            }),
          },
          "no-ability": {
            effect: req((s: GameState, _sid: string, _e: EID, cd: Card, _tgt: unknown[]) => {
              coreSay.systemMsg(
                s,
                _sid,
                `does not access ${coreToString.cardStr(s, cd)}`,
              );
              return null;
            }),
          },
        },
      },
      null as unknown as Card,
      null,
    );
    return;
  }

  accessContinue(state, side, eid, card, cardTitle, accessArgs);
}

export function getAllHosted(hosts: Card[]): Card[] {
  const hostedCards = hosts.flatMap((h: Card) => h.hosted || []);
  if (hostedCards.length === 0) return hostedCards;
  return [...hostedCards, ...getAllHosted(hostedCards)];
}

export function getAllContent(content: Card[]): Card[] {
  const allHosted = getAllHosted(content);
  return content
    .filter((c: Card) => !c.counter?.condition)
    .concat(allHosted.filter((c: Card) => !c.counter?.condition));
}

/**
 * Get accessible content in root of a server.
 */
export function rootContent(
  state: GameState,
  server: string,
  alreadyAccessedFn?: (card: Card) => boolean,
): Card[] {
  const content = (state.corp.servers as unknown as Record<string, { content?: Card[]; ices?: Card[] }>)?.[server]?.content || [];
  let filtered = getAllContent(content).filter((c: Card) =>
    coreFlags.canAccess(state, "runner", c),
  );
  filtered = filtered.filter(
    (c) =>
      !coreEffects.anyEffects(
        state,
        "runner",
        ":disable-access-candidacy",
        (v) => v === true,
        c,
        [c],
      ),
  );
  if (alreadyAccessedFn)
    filtered = filtered.filter((c: Card) => !alreadyAccessedFn(c));
  return filtered;
}

export function getServerType(server: string[]): string {
  return coreServers.getServerType(server) ?? "";
}

// --- mustContinue (multi-method) -------------------------------------------

type MustContinueFn = (
  state: GameState,
  alreadyAccessedFn: (card: Card) => boolean,
  accessAmount: { chosen: number; totalMod?: number; "random-access-limit"?: number },
  args: Record<string, unknown>,
) => boolean;

const mustContinueMap: Record<string, MustContinueFn> = {};

export function registerMustContinue(
  serverType: string,
  fn: MustContinueFn,
): void {
  mustContinueMap[serverType] = fn;
}

export function mustContinue(
  state: GameState,
  alreadyAccessedFn: (card: Card) => boolean,
  accessAmount: { chosen: number; totalMod?: number; "random-access-limit"?: number },
  args: Record<string, unknown>,
): boolean {
  const server = (args.server as string[]) || [];
  const serverType = server.length ? getServerType(server) : "remote";
  const fn = mustContinueMap[serverType] || mustContinueMap["remote"];
  return fn ? fn(state, alreadyAccessedFn, accessAmount, args) : false;
}

// Remote
registerMustContinue("remote", (state, alreadyAccessedFn, accessAmount, args) => {
  const maxAccessVal = (state.run as unknown as Record<string, unknown>)?.["max-access"] as number | undefined;
  const totalMod = accessAmount.totalMod || 0;
  const limitReached =
    maxAccessVal !== undefined && maxAccessVal + totalMod <= accessAmount.chosen;
  if ((state.run as unknown as Record<string, unknown>)?.["prevent-access"]) return false;
  if (limitReached) return false;
  const server = (args.server as string[]) || [];
  const content = (state.corp.servers as unknown as Record<string, { content?: Card[]; ices?: Card[] }>)?.[server[0]]?.content || [];
  const remaining = getAllContent(content).filter(
    (c) => coreFlags.canAccess(state, "runner", c) && !alreadyAccessedFn(c),
  );
  return remaining.length > accessAmount.chosen;
});

// R&D
registerMustContinue("rd", (state, alreadyAccessedFn, accessAmount, args) => {
  const preventAccess = (state.run as unknown as Record<string, unknown>)?.["prevent-access"];
  if (preventAccess) return false;

  const accessFn = (state.runner as unknown as Record<string, unknown>)["rd-access-fn"] as
    | ((deck: Card[]) => Card[])
    | undefined;
  const deckCards = state.corp.deck;
  const available: Card[] = accessFn ? accessFn(deckCards) : deckCards;

  const maxAccessVal = (state.run as unknown as Record<string, unknown>)?.["max-access"] as number | undefined;
  const totalMod = accessAmount.totalMod || 0;
  const randomLimit = accessAmount["random-access-limit"];

  if (
    maxAccessVal !== undefined &&
    maxAccessVal + totalMod <= accessAmount.chosen &&
    (randomLimit === undefined || maxAccessVal + totalMod <= randomLimit)
  ) {
    return false;
  }

  const remaining = available.filter(
    (c: Card) => coreFlags.canAccess(state, "runner", c) && !alreadyAccessedFn(c),
  );
  return remaining.length > accessAmount.chosen;
});

// HQ
registerMustContinue("hq", (state, alreadyAccessedFn, accessAmount, args) => {
  const preventAccess = (state.run as unknown as Record<string, unknown>)?.["prevent-access"];
  if (preventAccess) return false;

  const accessFn = (state.runner as unknown as Record<string, unknown>)["hq-access-fn"] as
    | ((hand: Card[]) => Card[])
    | undefined;
  const hand = state.corp.hand;
  const available: Card[] = accessFn ? accessFn(hand) : hand;

  const maxAccessVal = (state.run as unknown as Record<string, unknown>)?.["max-access"] as number | undefined;
  const totalMod = accessAmount.totalMod || 0;
  const randomLimit = accessAmount["random-access-limit"];

  if (
    maxAccessVal !== undefined &&
    maxAccessVal + totalMod <= accessAmount.chosen &&
    (randomLimit === undefined || maxAccessVal + totalMod <= randomLimit)
  ) {
    return false;
  }

  const remaining = available.filter(
    (c: Card) => coreFlags.canAccess(state, "runner", c) && !alreadyAccessedFn(c),
  );
  return remaining.length > accessAmount.chosen;
});

// Archives
registerMustContinue("archives", (state, alreadyAccessedFn, accessAmount, args) => {
  const preventAccess = (state.run as unknown as Record<string, unknown>)?.["prevent-access"];
  if (preventAccess) return false;

  const archiveCards = state.corp.discard;
  const available = archiveCards.filter(
    (c: Card) => coreFlags.canAccess(state, "runner", c) && !alreadyAccessedFn(c),
  );
  return available.length > accessAmount.chosen;
});
