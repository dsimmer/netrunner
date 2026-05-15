/**
 * Core access functions
 * Ported from Clojure core/access.clj to TypeScript
 */

import type { GameState } from "./state.js";
import type { Card } from "./card.js";
import type { EID } from "./eid.js";
import type { Ability } from "./types.js";
import * as coreAgendas from "./agendas.js";
import * as coreBoard from "./board.js";
import * as coreCard from "./card.js";
import * as coreTypes from "./types.js";
import * as coreCostFns from "./cost_fns.js";
import * as coreEffects from "./effects.js";
import * as coreEid from "./eid.js";
import * as coreEngine from "./engine.js";
import * as coreFinding from "./finding.js";
import * as coreFlags from "./flags.js";
import * as coreMoving from "./moving.js";
import * as corePayment from "./payment.js";
import * as coreProps from "./props.js";
import * as coreRevealing from "./revealing.js";
import * as coreRuns from "./runs.js";
import * as coreSay from "./say.js";
import * as coreServers from "./servers.js";
import * as coreUpdating from "./update.js";
import * as utils from "../utils.js";
import { req, wait_for, continue_ability, forms } from "../macros.js";

function toC(type: string, value: number): any {
  return corePayment.toC(type, value);
}

// --- noTrashOrSteal --------------------------------------------------------

/** Increments the no-trash-or-steal counter. */
export function noTrashOrSteal(state: GameState): void {
  const runner = state.runner;
  runner.register = runner.register || {};
  runner.register["no-trash-or-steal"] =
    (runner.register["no-trash-or-steal"] || 0) + 1;
}

// --- accessBonusCount ------------------------------------------------------

/** Returns the sum of :access-bonus effects for the given side and keyword. */
export function accessBonusCount(state: GameState, side: string, kw: string): number {
  return coreEffects.sumEffects(state, side, ":access-bonus", kw);
}

// --- accessEnd -------------------------------------------------------------

/** Trigger events involving the end of the access phase. */
export function accessEnd(state: GameState, side: string, eid: EID, c: Card, opts?: { trashed?: boolean; stolen?: boolean }): void {
  const trashed = opts?.trashed ?? false;
  const stolen = opts?.stolen ?? false;

  if (!trashed) {
    coreEngine.triggerEventSync(state, side, eid, ":no-trash", { "accessed-card": c });
  }

  if (!trashed && !stolen && !coreCard.inDiscard(c)) {
    noTrashOrSteal(state);
  }

  const accessedCard = (state as any).access as Card | undefined;
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (state as any).access;

  coreEngine.triggerEventSync(state, side, eid, ":post-access-card", {
    "accessed-card": c,
    "accessed-card-snapshot": accessedCard,
  });
}

// --- Interaction helpers ---------------------------------------------------

/** Get interaction metadata from card definition. */
export function interactions(card: Card, abilityKey: string): any {
  const cdef = coreTypes.getCardDef(card);
  return cdef?.interactions?.[abilityKey];
}

/** Get the access ability of a card. */
export function accessAb(card: Card): any {
  return interactions(card, ":access-ability");
}

/** Build the label string for an access ability. */
export function accessAbLabel(state: GameState, card: Card): string {
  const title = (card.title || "").split(":")[0];
  const accessAbility = accessAb(card);
  const abilityCost = coreCostFns.cardAbilityCost(state, "runner", accessAbility, card);
  const ability = corePayment.addCostLabelToAbility(accessAbility, abilityCost);
  const label = corePayment.addCostToLabel(ability);
  return `[${title}] ${label}`;
}

// --- accessNonAgenda -------------------------------------------------------

/** Access a non-agenda. Show a prompt to trash for trashable cards. */
export function accessNonAgenda(
  state: GameState,
  side: string,
  eid: EID,
  c: Card,
  opts?: { skipTriggerEvent?: boolean },
): void {
  const skipTriggerEvent = opts?.skipTriggerEvent ?? false;

  // Trigger :pre-trash
  if (!skipTriggerEvent) {
    coreEngine.triggerEventSync(state, side, eid, ":pre-trash", { "accessed-card": c });
  }

  // Increment access card count
  const stats = state.stats;
  (stats as any).runner = (stats as any).runner || {};
  (stats as any).runner.access = ((stats as any).runner.access || {});
  (stats as any).runner.access.cards = (((stats as any).runner.access.cards || 0) + 1);

  // Check if we should skip the prompt
  const seenInArchives = coreCard.inDiscard(c) && c.seen;
  const edwardKimTrash = coreCard.isOperation(c) && coreFlags.cardFlag(c, ":can-trash-operation", true);
  const alreadyTrashed = !coreCard.inDiscard(c) && coreFinding.findCID(c.cid, state.corp.discard);

  if (seenInArchives || edwardKimTrash || alreadyTrashed) {
    accessEnd(state, side, eid, c);
    return;
  }

  const card = { ...c, seen: true };
  const trashCostVal = !coreCard.inDiscard(c) ? coreCostFns.trashCost(state, side, card) : undefined;
  const trashEid = { ...eid, source: card, sourceType: ":runner-trash-corp-cards" };
  const canTrash = coreFlags.canTrash(state, side, c);
  const canPay = trashCostVal
    ? corePayment.canPay(state, "runner", trashEid as EID, card, null, [toC("credit", trashCostVal)])
    : false;
  const trashCostStr = canPay ? [`Pay ${trashCostVal} [Credits] to trash`] : undefined;

  const runnerReg = state.runner.register || {};
  const mustTrashWithCredits = canPay && runnerReg["must-trash-with-credits"];

  let accessAbCards: Card[] = [];
  if (!mustTrashWithCredits) {
    const activeCards = coreBoard.allActive(state, "runner");
    accessAbCards = activeCards.filter((ac) => {
      const ability = accessAb(ac);
      return (
        ability &&
        coreEngine.canTrigger(state, "runner", eid, ability, ac, [card]) &&
        corePayment.canPay(state, "runner", eid, ac, null, coreCostFns.cardAbilityCost(state, side, ability, ac, [card]))
      );
    });
  }

  const { trashAbCards, nonTrashAbCards } = accessAbCards.reduce(
    (acc, card) => {
      const ability = accessAb(card);
      const isTrash = ability?.["trash?"] === true;
      return isTrash
        ? { ...acc, trashAbCards: [...acc.trashAbCards, card] }
        : { ...acc, nonTrashAbCards: [...acc.nonTrashAbCards, card] };
    },
    { trashAbCards: [] as Card[], nonTrashAbCards: [] as Card[] },
  );

  const mustTrash = !mustTrashWithCredits && ((canTrash && trashAbCards.length > 0) && coreFlags.cardFlagFn(state, side, c, ":must-trash", true));

  const abilityCards = mustTrash ? trashAbCards : !canTrash ? nonTrashAbCards : accessAbCards;
  const abilityStrs = abilityCards.map((ac) => ({ cid: ac.cid, title: accessAbLabel(state, ac) }));

  const forcedToTrash = mustTrash || mustTrashWithCredits;
  const noActionStr = !canTrash || !forcedToTrash ? ["No action"] : undefined;
  const choices = [...abilityStrs, ...(trashCostStr || []), ...(noActionStr || [])];

  const promptFn = req((s, sid, e, cd, tgt) => {
    const target = forms.context(s, cd, tgt);

    if (target === (noActionStr?.[0] || "No action")) {
      accessEnd(s, sid, e, cd);
      return null;
    }

    if (trashCostStr && target === trashCostStr[0]) {
      const updatedCard = coreUpdating.update!(s, sid, { ...cd, seen: true });
      const payEid = { ...coreEid.makeEID(s), ...trashEid };
      coreEngine.pay(s, sid, payEid, updatedCard, [toC("credit", trashCostVal)]);
      accessEnd(s, sid, e, updatedCard, { trashed: true });
      return null;
    }

    const abilityCard = abilityCards.find((ac) => accessAbLabel(s, ac) === target);
    if (abilityCard) {
      const abilityEid = { ...eid, source: abilityCard, sourceType: ":ability" };
      const ability = accessAb(abilityCard);
      if (ability?.["trash?"] === true) {
        s.runner.register = s.runner.register || {};
        s.runner.register["trashed-accessed-card"] = true;
      }
      coreEngine.resolveAbility(s, sid, { ...coreEid.makeEID(s), ...abilityEid }, abilityCard, [cd]);
      return null;
    }

    accessEnd(s, sid, e, cd);
    return null;
  });

  continue_ability(state, "runner", { async: true, prompt: `You accessed ${card.title}.`, choices, effect: promptFn }, card, null);
}

// --- stealCostBonus --------------------------------------------------------

/** Applies a cost to the next steal attempt. */
export function stealCostBonus(state: GameState, _side: string, costs: any[], source: Card | null): void {
  const bonus = (state.bonus as Record<string, unknown>) || {};
  const stealCosts = (bonus["steal-cost"] as any[]) || [];
  (state.bonus as any) = { ...bonus, "steal-cost": [...stealCosts, [costs, source]] };
}

// --- steal -----------------------------------------------------------------

/** Moves a card to the runner's :scored area. */
export function steal(state: GameState, side: string, eid: EID, card: Card): void {
  const c = coreMoving.move(state, "runner", { ...card, "advance-counter": undefined, "new": undefined }, "scored", { force: true });
  coreUpdating.update!(state, side, c);

  if (coreFlags.cardFlag(c, ":has-events-when-stolen", true)) {
    coreEngine.registerDefaultEvents(state, side, c);
    coreEffects.registerStaticAbilities(state, side, c);
  }

  coreAgendas.updateAllAdvancementRequirements(state);
  coreAgendas.updateAllAgendaPoints(state);

  const updatedC = coreFinding.getCard(state, c);
  const points = coreCard.getAgendaPoints(updatedC);

  coreSay.systemMsg(state, "runner", `steals ${updatedC?.title} and gains ${utils.quantify(points, "agenda point")}`);

  const runnerReg = state.runner.register || {};
  runnerReg["stole-agenda"] = (runnerReg["stole-agenda"] || 0) + (updatedC?.agendapoints || 0);

  coreSay.playSfx(state, side, "agenda-steal");

  if (state.breach) (state as any).breach["did-steal"] = true;
  if (state.run) (state as any).run["did-steal"] = true;

  const cdef = coreTypes.getCardDef(updatedC);
  const onStolen = cdef?.stolen;
  if (onStolen) coreEngine.registerPendingEvent(state, ":agenda-stolen", updatedC, onStolen);

  coreEngine.queueEvent(state, ":agenda-stolen", { card: updatedC, points });

  coreEngine.checkpoint(state, null, { ...coreEid.makeEID(state), ...eid }, { duration: ":agenda-stolen" });
  // accessEnd will be called after checkpoint completes
}

// --- stealAgenda -----------------------------------------------------------

/** Trigger the stealing of an agenda, now that costs have been paid. */
export function stealAgenda(state: GameState, side: string, eid: EID, card: Card): void {
  const cdef = coreTypes.getCardDef(card);
  const stealReq = cdef?.["steal-req"];

  if (!stealReq || !stealReq(state, "runner", eid, card, null)) {
    steal(state, "runner", eid, card);
  } else {
    accessEnd(state, side, eid, card);
  }
}

// --- accessAgenda ----------------------------------------------------------

/** Rules interactions for accessing an agenda. */
export function accessAgenda(state: GameState, side: string, eid: EID, card: Card): void {
  const stats = state.stats;
  (stats as any).runner = (stats as any).runner || {};
  (stats as any).runner.access = ((stats as any).runner.access || {});
  (stats as any).runner.access.cards = (((stats as any).runner.access.cards || 0) + 1);

  const cost = corePayment.mergeCosts(coreCostFns.stealCost(state, side, eid, card));
  const costStrs = corePayment.buildCostString(cost);
  const eidWithCosts = { ...eid, additionalCosts: cost };
  const canPay = corePayment.canPay(state, side, { ...coreEid.makeEID(state), ...eidWithCosts }, card, card.title, cost);
  const canSteal = coreFlags.canSteal(state, side, card);

  let accessAbCards: Card[] = [];
  if (!coreCard.inDiscard(card)) {
    const activeCards = coreBoard.allActive(state, "runner");
    accessAbCards = activeCards.filter((ac) => {
      const ability = accessAb(ac);
      return (
        ability &&
        coreEngine.canTrigger(state, "runner", eid, ability, ac, [card]) &&
        corePayment.canPay(state, "runner", eid, ac, null, coreCostFns.cardAbilityCost(state, side, ability, ac, [card]))
      );
    });
  }

  const abilityStrs = accessAbCards.map((ac) => ({ cid: ac.cid, title: accessAbLabel(state, ac) }));
  const stealStr = canSteal && canPay ? (costStrs.length > 0 ? ["Pay to steal"] : ["Steal"]) : undefined;
  const noActionStr = stealStr && stealStr[0] !== "Steal" ? ["No action"] : undefined;
  const promptStr = costStrs.length > 0
    ? `You accessed ${card.title}. ${costStrs} to steal?`
    : `You accessed ${card.title}.`;
  const choices = [...abilityStrs, ...(stealStr || []), ...(noActionStr || [])];

  const promptFn = req((s, sid, e, cd, tgt) => {
    const target = forms.context(s, cd, tgt);

    if (target === "No action") {
      if (!coreFinding.findCID(cd.cid, s.corp.deck)) {
        coreSay.systemMsg(s, sid, `decides to not pay to steal ${cd.title}`);
      }
      accessEnd(s, sid, e, cd);
      return null;
    }

    if (target === "Steal") {
      stealAgenda(s, sid, e, cd);
      return null;
    }

    if (target === "Pay to steal") {
      const payEid = { ...coreEid.makeEID(s), ...eid, additionalCosts: cost, source: cd, sourceType: ":runner-steal", action: ":steal-cost" };
      coreEngine.pay(s, sid, payEid, null, null, cost);
      coreSay.systemMsg(s, sid, `to steal ${cd.title} from ${coreServers.nameZone("corp", coreCard.getZone(cd))}`);
      stealAgenda(s, sid, e, cd);
      return null;
    }

    const abilityCard = accessAbCards.find((ac) => accessAbLabel(s, ac) === target);
    if (abilityCard) {
      const abilityEid = { ...eid, source: abilityCard, sourceType: ":ability" };
      const ability = accessAb(abilityCard);
      if (s.breach && ability?.["trash?"] === true) (s as any).breach["did-trash"] = true;
      if (s.run && ability?.["trash?"] === true) (s as any).run["did-trash"] = true;
      coreEngine.resolveAbility(s, sid, { ...coreEid.makeEID(s), ...abilityEid }, abilityCard, [cd]);
      return null;
    }

    accessEnd(s, sid, e, cd, { stolen: coreCard.inScored(cd) });
    return null;
  });

  continue_ability(state, "runner", { async: true, prompt: promptStr, choices, effect: promptFn }, card, null);
}

// --- revealAccess ----------------------------------------------------------

/** Check if the card should be revealed on access. */
export function revealAccess(state: GameState, side: string, card: Card): boolean {
  const cdef = coreTypes.getCardDef(card);
  const zone = coreCard.getZone(card);

  const revealKw = zone[0] === "deck" ? ":rd-reveal"
    : zone[0] === "hand" ? ":hq-reveal"
    : zone[0] === "discard" ? ":archives-reveal"
    : ":reveal";

  const revealFn = cdef?.flags?.[revealKw];
  if (!revealFn) return false;

  const eid = coreEid.makeEID(state);
  return revealFn(state, side, eid, card, null);
}

// --- joinCostStrs ----------------------------------------------------------

export function joinCostStrs(...costs: any[][]): string {
  const flat = costs.flat(Infinity).filter((c: any) => c != null);
  return flat.join(" and ");
}

// --- msgHandleAccess -------------------------------------------------------

/** Generate the message from the access. */
export function msgHandleAccess(state: GameState, side: string, eid: EID, card: Card, title: string, args?: { costMsg?: string[]; noMsg?: boolean }): void {
  const costMsg = args?.costMsg || [];
  const noMsg = args?.noMsg ?? false;
  const costStr = joinCostStrs(costMsg);

  if (!noMsg) {
    const publicMsg = `${costStr ? `${costStr} to access ` : ""}accesses ${title}${card ? ` from ${coreServers.nameZone("corp", coreCard.getZone(card))}` : ""}`;
    const runnerMsg = `${costStr ? `${costStr} to access ` : ""}accesses ${card.title}${card ? ` from ${coreServers.nameZone("corp", coreCard.getZone(card))}` : ""}`;

    if (title === "an unseen card") {
      coreSay.systemMsg(state, side, publicMsg, { "log-side": ["public", "corp"] });
      coreSay.systemMsg(state, side, runnerMsg, { "log-side": "runner" });
    } else {
      coreSay.systemMsg(state, side, publicMsg);
    }
  }

  if (revealAccess(state, side, card)) {
    coreSay.systemMsg(state, side, `must reveal they accessed ${card.title}`);
    coreRevealing.reveal(state, "runner", eid, card);
  } else {
    coreEid.effectCompleted(state, side, eid);
  }
}

// --- accessAbility ---------------------------------------------------------

export function accessAbility(card: Card, cdef: any): Ability | null {
  const onAccess = cdef?.["on-access"];
  if (!onAccess) return null;
  return { ...coreEngine.abilityAsHandler(card, onAccess), condition: ":accessed" };
}

// --- installedAccessTrigger ------------------------------------------------

/** Effect for triggering ambush on access. */
export function installedAccessTrigger(cost: number | any[], ability: any, prompt?: any): any {
  if (prompt === undefined) {
    const ab = (typeof cost === "number" && cost > 0)
      ? { ...ability, cost: [toC("credit", cost)] }
      : ability;
    const pr = (typeof cost === "number" && cost > 0)
      ? req((st, si, ei, ca, tg) => `Pay ${cost} [Credits] to use ${ca.title} ability?`)
      : req((st, si, ei, ca, tg) => `Use ${ca.title} ability?`);
    return installedAccessTrigger(cost, ab, pr);
  }

  const costArr = typeof cost === "number" ? [toC("credit", cost)] : cost;
  return {
    "on-access": {
      optional: {
        req: req((state, side, eid, card, targets) => {
          const installed = card.zone && ["rig", "servers"].includes(card.zone[0]);
          return installed && corePayment.canPay(state, "corp", eid, card, null, costArr);
        }),
        "waiting-prompt": ability["waiting-prompt"],
        prompt: prompt,
        "yes-ability": (() => {
          const keys = Object.keys(ability);
          const result: any = {};
          for (const k of keys) {
            if (k !== "waiting-prompt") result[k] = ability[k];
          }
          return result;
        })(),
      },
    },
  };
}

// --- accessTriggerEvents ---------------------------------------------------

export function accessTriggerEvents(state: GameState, side: string, eid: EID, c: Card, title: string, args: { noMsg?: boolean; costMsg?: string[] }): void {
  const cdef = coreTypes.getCardDef(c);
  const cUpdated = { ...c, "was-seen": c.seen, seen: c.seen || !coreCard.inDiscard(c) };
  const accessEffect = accessAbility(cUpdated, cdef);

  state.runner.register = { ...(state.runner.register || {}), "accessed-cards": true };

  coreEid.registerEIDCallback(state, coreEid.makeEID(state), () => {
    msgHandleAccess(state, side, eid, cUpdated, title, args);
  });

  const cancelFn = () => !coreFinding.getCard(state, c) || !(state as any).access;

  coreEid.registerEIDCallback(state, coreEid.makeEID(state), () => {
    const currentCard = coreFinding.getCard(state, c);
    const accessedCard = (state as any).access as Card | undefined;

    if (currentCard && utils.sameCard(c, accessedCard)) {
      const card = currentCard;
      if (coreCard.isAgenda(card)) {
        accessAgenda(state, side, eid, card);
      } else {
        const trashed = !!coreFinding.findCID(card.cid, state.corp.discard);
        const stolen = coreCard.isAgenda(card) && !!coreFinding.findCID(card.cid, state.runner.scored);
        accessEnd(state, side, eid, card, { trashed, stolen });
      }
    } else {
      const trashed = !!coreFinding.findCID(c.cid, state.corp.discard);
      const stolen = coreCard.isAgenda(c) && !!coreFinding.findCID(c.cid, state.runner.scored);
      accessEnd(state, side, eid, c, { trashed, stolen });
    }
  });

  coreEngine.triggerEventSimult(state, side, ":access", { "card-abilities": accessEffect, "cancel-fn": cancelFn }, { "accessed-card": c });
}

// --- accessCostBonus -------------------------------------------------------

/** Applies a cost to the next access. */
export function accessCostBonus(state: GameState, _side: string, costs: any[]): void {
  const bonus = (state.bonus as Record<string, unknown>) || {};
  const accessCost = (bonus["access-cost"] as any[]) || [];
  (state.bonus as any) = { ...bonus, "access-cost": corePayment.mergeCosts([...accessCost, ...costs]) };
}

// --- accessCost ------------------------------------------------------------

export function accessCost(state: GameState, _side: string): any[] {
  return corePayment.mergeCosts((state.bonus as Record<string, unknown>)?.["access-cost"] || []);
}

// --- refusedAccessCost -----------------------------------------------------

export function refusedAccessCost(state: GameState, side: string, eid: EID): void {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (state as any).access;
  coreEid.effectCompleted(state, side, eid);
}

// --- accessPay -------------------------------------------------------------

export function accessPay(state: GameState, side: string, eid: EID, card: Card, title: string, args: { noMsg?: boolean; costMsg?: string[] }): void {
  const cost = accessCost(state, side);
  const costStr = corePayment.buildCostString(cost);
  const canPay = Object.keys(cost).length > 0 ? corePayment.canPay(state, side, coreEid.makeEID(state), null, null, cost) : true;

  const promptStr = canPay ? `${costStr} to access this card?` : "You can't pay the cost to access this card.";
  const choices = canPay ? ["Pay to access", "No action"] : ["OK"];

  if (!coreFinding.getCard(state, card)) {
    accessEnd(state, side, eid, card);
    return;
  }

  if (Object.keys(cost).length > 0) {
    const promptFn = req((s, sid, e, cd, tgt) => {
      const target = forms.context(s, cd, tgt);

      if (target === "OK" || target === "No action") {
        refusedAccessCost(s, sid, e);
        return null;
      }

      coreEngine.pay(s, sid, cd, cost);
      coreSay.systemMsg(s, sid, `paid to access ${cd.title}`);
      accessTriggerEvents(s, sid, e, cd, title, { ...args, costMsg: [`Paid`] });
      return null;
    });

    continue_ability(state, "runner", { async: true, prompt: promptStr, choices, effect: promptFn }, null, null);
  } else {
    accessTriggerEvents(state, side, eid, card, title, args);
  }
}

// --- getOnlyCardToAccess ---------------------------------------------------

export function getOnlyCardToAccess(state: GameState): Card | null {
  const run = state.run as Record<string, unknown>;
  if (!run?.["only-card-to-access"]) return null;
  const cid = (run["only-card-to-access"] as any)?.cid;
  if (!cid) return null;
  const allCards = coreFinding.getAllCards(state);
  return allCards.find((c) => c.cid === cid) || null;
}

// --- setOnlyCardToAccess ---------------------------------------------------

/** Set the only card that can be accessed. */
export function setOnlyCardToAccess(state: GameState, _side: string, card: Card | null): void {
  const run = state.run as Record<string, unknown>;
  if (!run) return;

  if (card && run["only-card-to-access"] && !utils.sameCard(card, run["only-card-to-access"] as Card)) {
    run["max-access"] = 0;
  }

  run["only-card-to-access"] = card;
}

// --- accessContinue --------------------------------------------------------

export function accessContinue(state: GameState, side: string, eid: EID, card: Card, title: string, args: { noMsg?: boolean; costMsg?: string[] }): void {
  if (!coreCard.inDiscard(card)) {
    const stats = state.stats;
    (stats as any).runner = (stats as any).runner || {};
    (stats as any).runner.access = ((stats as any).runner.access || {});
    const uniqueCards = ((stats as any).runner.access["unique-cards"] || []) as string[];
    (stats as any).runner.access["unique-cards"] = [...new Set([...uniqueCards, card.cid])];
  }

  (state as any).access = card;

  const bonus = state.bonus as Record<string, unknown> || {};
  delete (bonus as any).trash;
  delete (bonus as any)["steal-cost"];
  delete (bonus as any)["access-cost"];
  (state.bonus as any) = bonus;

  if (state.breach) {
    const zone = [":discard", ":deck", ":hand"].includes(coreCard.getZone(card)[0]) ? coreCard.getZone(card)[0] : coreCard.getZone(card)[1];
    const breach = state.breach as Record<string, unknown>;
    breach["known-cids"] = breach["known-cids"] || {};
    (breach["known-cids"] as Record<string, string[]>)[zone] = [...((breach["known-cids"] as Record<string, string[]>)[zone] || []), card.cid];
    breach["cards-accessed"] = breach["cards-accessed"] || {};
    (breach["cards-accessed"] as Record<string, number>)[zone] = (((breach["cards-accessed"] as Record<string, number>)[zone] || 0) + 1);
  }

  if (state.run) {
    const zone = [":discard", ":deck", ":hand"].includes(coreCard.getZone(card)[0]) ? coreCard.getZone(card)[0] : coreCard.getZone(card)[1];
    const run = state.run as Record<string, unknown>;
    run["cards-accessed"] = run["cards-accessed"] || {};
    (run["cards-accessed"] as Record<string, number>)[zone] = (((run["cards-accessed"] as Record<string, number>)[zone] || 0) + 1);
  }

  coreEngine.triggerEventSync(state, side, eid, ":pre-access-card", { "accessed-card": card });
  accessPay(state, side, eid, card, title, args);
}

// --- accessCard ------------------------------------------------------------

export function accessCard(state: GameState, side: string, eid: EID, card: Card, title?: string, args?: { noMsg?: boolean; costMsg?: string[] }): void {
  const cardTitle = title || card.title;
  const accessArgs = args || {};
  const onlyCard = getOnlyCardToAccess(state);

  if (onlyCard && !utils.sameCard(onlyCard, card)) {
    coreEid.effectCompleted(state, side, eid);
    return;
  }

  const breachInstalled = (state.breach as any)?.installed as Set<string> | undefined;
  if (breachInstalled?.has(card.cid)) {
    continue_ability(state, side, {
      optional: true,
      prompt: `Proceed to access ${coreProps.cardStr(state, card)}?`,
      "waiting-prompt": true,
      "yes-ability": {
        async: true,
        effect: req(() => { accessContinue(state, side, eid, card, cardTitle, accessArgs); return null; }),
      },
      "no-ability": {
        effect: req((s, sid, e, cd, tgt) => {
          coreSay.systemMsg(s, sid, `does not access ${coreProps.cardStr(s, cd)}`);
          return null;
        }),
      },
    }, null, null);
    return;
  }

  accessContinue(state, side, eid, card, cardTitle, accessArgs);
}

// --- getAllHosted / getAllContent ------------------------------------------

export function getAllHosted(hosts: Card[]): Card[] {
  const hostedCards = hosts.flatMap((h) => h.hosted || []);
  if (hostedCards.length === 0) return hostedCards;
  return [...hostedCards, ...getAllHosted(hostedCards)];
}

/** Remove condition counters from content. */
export function getAllContent(content: Card[]): Card[] {
  const allHosted = getAllHosted(content);
  return content.filter(c => !c.counter?.condition)
    .concat(allHosted.filter(c => !c.counter?.condition));
}

// --- rootContent -----------------------------------------------------------

export function rootContent(state: GameState, server: string, alreadyAccessedFn?: (card: Card) => boolean): Card[] {
  const content = (state.corp.servers as any)[server]?.content || [];
  let filtered = getAllContent(content).filter((c) => coreFlags.canAccess(state, "runner", c));
  filtered = filtered.filter((c) => !coreEffects.anyEffects(state, "runner", ":disable-access-candidacy", true, c, [c]));
  if (alreadyAccessedFn) filtered = filtered.filter((c) => !alreadyAccessedFn(c));
  return filtered;
}

// --- Server type helpers ---------------------------------------------------

export function getServerType(server: string[]): string {
  return coreServers.getServerType(server);
}

// --- mustContinue (multi-method) -------------------------------------------

type MustContinueFn = (state: GameState, alreadyAccessedFn: (card: Card) => boolean, accessAmount: { chosen: number; totalMod?: number }, args: Record<string, unknown>) => boolean;

const mustContinueMap: Record<string, MustContinueFn> = {};

export function registerMustContinue(serverType: string, fn: MustContinueFn): void {
  mustContinueMap[serverType] = fn;
}

export function mustContinue(state: GameState, alreadyAccessedFn: (card: Card) => boolean, accessAmount: { chosen: number; totalMod?: number }, args: Record<string, unknown>): boolean {
  const server = (args.server as string[]) || [];
  const serverType = server.length ? getServerType(server) : "remote";
  const fn = mustContinueMap[serverType] || mustContinueMap["remote"];
  return fn ? fn(state, alreadyAccessedFn, accessAmount, args) : false;
}

// Remote
registerMustContinue("remote", (state, alreadyAccessedFn, accessAmount, args) => {
  const maxAccess = (state.run as any)?.["max-access"];
  const totalMod = accessAmount.totalMod || 0;
  const limitReached = maxAccess !== undefined && maxAccess + totalMod <= accessAmount.chosen;
  if ((state.run as any)?.["prevent-access"]) return false;
  if (limitReached) return false;
  const server = (args.server as string[]) || [];
  const content = (state.corp.servers as any)?.[server[0]]?.content || [];
  const remaining = getAllContent(content).filter((c) => coreFlags.canAccess(state, "runner", c) && !alreadyAccessedFn(c));
  return remaining.length + totalMod > 0;
});

// RD
registerMustContinue("rd", (state, alreadyAccessedFn, accessAmount, args) => {
  const maxAccess = (state.run as any)?.["max-access"];
  const totalMod = accessAmount.totalMod || 0;
  const limitReached = maxAccess !== undefined && maxAccess + totalMod <= accessAmount.chosen;
  if ((state.run as any)?.["prevent-access"]) return false;
  if (limitReached) return false;
  const noRoot = args["no-root"];
  const deck = accessCardsFromRd(state);
  const cardToSee = deck.find((c) => !alreadyAccessedFn(c));
  const randomLimit = accessAmount["random-access-limit"] || 1;
  const deckCount = cardToSee ? randomLimit : 0;
  const rootCount = noRoot ? 0 : rootContent(state, "rd", alreadyAccessedFn).length;
  return deckCount + rootCount + totalMod > 0;
});

// HQ
registerMustContinue("hq", (state, alreadyAccessedFn, accessAmount, args) => {
  const maxAccess = (state.run as any)?.["max-access"];
  const totalMod = accessAmount.totalMod || 0;
  const limitReached = maxAccess !== undefined && maxAccess + totalMod <= accessAmount.chosen;
  if ((state.run as any)?.["prevent-access"]) return false;
  if (limitReached) return false;
  const noRoot = args["no-root"];
  const preventHandAccess = (state.run as any)?.["prevent-hand-access"];
  let handCount = 0;
  if (!preventHandAccess) {
    const hand = state.corp.hand;
    const candidates = hand.filter((c) => !alreadyAccessedFn(c));
    const randomLimit = accessAmount["random-access-limit"] || 1;
    handCount = Math.min(randomLimit, candidates.length);
  }
  const rootCount = noRoot ? 0 : rootContent(state, "hq", alreadyAccessedFn).length;
  return handCount + rootCount + totalMod > 0;
});

// Archives
registerMustContinue("archives", (state, alreadyAccessedFn, accessAmount, args) => {
  const maxAccess = (state.run as any)?.["max-access"];
  const totalMod = accessAmount.totalMod || 0;
  const limitReached = maxAccess !== undefined && maxAccess + totalMod <= accessAmount.chosen;
  if ((state.run as any)?.["prevent-access"]) return false;
  if (limitReached) return false;
  const noRoot = args["no-root"];
  const discard = state.corp.discard;
  const archivesContent = noRoot ? [] : rootContent(state, "archives", alreadyAccessedFn);
  const allCards = [...discard, ...archivesContent].filter((c) => !alreadyAccessedFn(c));
  return allCards.length + totalMod > 0;
});

// --- chooseAccess (multi-method) -------------------------------------------

type ChooseAccessFn = (accessAmount: Record<string, unknown>, server: string | string[], args: Record<string, unknown>) => any;

const chooseAccessMap: Record<string, ChooseAccessFn> = {};

export function registerChooseAccess(serverType: string, fn: ChooseAccessFn): void {
  chooseAccessMap[serverType] = fn;
}

export function chooseAccess(accessAmount: Record<string, unknown>, server: string | string[], args: Record<string, unknown>): any {
  const serverArr = Array.isArray(server) ? server : [server];
  const serverType = serverArr.length ? getServerType(serverArr) : "remote";
  const fn = chooseAccessMap[serverType] || chooseAccessMap["remote"];
  return fn ? fn(accessAmount, server, args) : null;
}

// --- accessHelperRemote ----------------------------------------------------

export function accessHelperRemote(state: GameState, side: string, eid: EID, accessAmount: { chosen: number; totalMod?: number }, alreadyAccessed: Set<string>, args: { server: string[] }): any {
  const server = (args.server as string[]) || [];
  const available = rootContent(state, server[0], (c) => alreadyAccessed.has(c.cid));

  if (available.length === 0 || !mustContinue(state, (c) => alreadyAccessed.has(c.cid), accessAmount, args)) return null;

  if (available.length === 1) {
    return {
      async: true,
      effect: req(() => {
        accessCard(state, side, eid, available[0]);
        continue_ability(state, side, accessHelperRemote(state, side, eid, { totalMod: accessBonusCount(state, side, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, available[0].cid]), args), null, null);
        return null;
      }),
    };
  }

  return {
    prompt: "Click a card to access it. You must access all cards in this server.",
    choices: { card: (card: Card) => available.some((c) => utils.sameCard(c, card)), all: true },
    async: true,
    effect: req((s, sid, e, cd, tgt) => {
      const target = forms.context(s, cd, tgt);
      accessCard(s, sid, e, target);
      continue_ability(s, sid, accessHelperRemote(s, sid, e, { totalMod: accessBonusCount(s, sid, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, (target as Card).cid]), args), target, null);
      return null;
    }),
  };
}

// --- accessHelperRd --------------------------------------------------------

/** Helper for R&D access. */
export function accessHelperRd(state: GameState, side: string, eid: EID, accessAmount: { chosen: number; randomAccessLimit?: number; totalMod?: number }, alreadyAccessed: Set<string>, args: Record<string, unknown>): any {
  const alreadyAccessedFn = (card: Card) => alreadyAccessed.has(card.cid);
  const deck = accessCardsFromRd(state);
  const cardToAccess = deck.find((c) => !alreadyAccessedFn(c));
  const randomLimit = accessAmount["random-access-limit"] || 1;

  const cardFrom = "Card from deck";
  const cardFromButton = randomLimit > 0 && !coreEffects.anyEffects(state, "runner", ":disable-random-accesses", true) && cardToAccess ? [cardFrom] : [];

  const root = rootContent(state, "rd", alreadyAccessedFn);
  const upgradeButtons = (args["no-root"] ? [] : root.filter(coreCard.isRezzed).map((c) => c.title));

  const unrezzedCard = "Unrezzed upgrade";
  const unrezzedCardsButton = args["no-root"]
    ? undefined
    : root.filter((c) => !coreCard.isRezzed(c)).length > 0 ? [unrezzedCard] : undefined;

  const choices = [...(cardFromButton || []), ...upgradeButtons, ...(unrezzedCardsButton || [])];

  if (choices.length === 0 || !mustContinue(state, alreadyAccessedFn, accessAmount, args)) return null;

  // Card from deck function
  const cardFromDeckFn = req(() => {
    accessCard(state, side, eid, cardToAccess!, "an unseen card");
    continue_ability(state, side, accessHelperRd(state, side, eid, { "random-access-limit": randomLimit - 1, totalMod: accessBonusCount(state, side, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, cardToAccess!.cid]), args), null, null);
    return null;
  });

  // Unrezzed cards function
  const unrezzedCardsFn = req(() => {
    const unrezzed = root.filter((c) => !coreCard.isRezzed(c));
    if (unrezzed.length === 1) {
      accessCard(state, side, eid, unrezzed[0]);
      continue_ability(state, side, accessHelperRd(state, side, eid, { "random-access-limit": randomLimit, totalMod: accessBonusCount(state, side, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, unrezzed[0].cid]), args), null, null);
    } else {
      continue_ability(state, side, {
        async: true,
        prompt: "Choose an upgrade in root of R&D to access",
        choices: { card: (card: Card) => unrezzed.some((c) => utils.sameCard(c, card)) },
        effect: req((s, sid, e, cd, tgt) => {
          const target = forms.context(s, cd, tgt);
          accessCard(s, sid, e, target);
          continue_ability(s, sid, accessHelperRd(s, sid, e, { "random-access-limit": randomLimit, totalMod: accessBonusCount(s, sid, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, (target as Card).cid]), args), target, null);
          return null;
        }),
      }, null, null);
    }
    return null;
  });

  return {
    async: true,
    prompt: "Choose a card to access",
    choices,
    effect: req((s, sid, e, cd, tgt) => {
      const target = forms.context(s, cd, tgt);
      if (target === cardFrom) return cardFromDeckFn();
      if (target === unrezzedCard) return unrezzedCardsFn();

      const accessed = root.find((c) => c.title === target);
      if (accessed) {
        accessCard(s, sid, e, accessed);
        continue_ability(s, sid, accessHelperRd(s, sid, e, { "random-access-limit": randomLimit, totalMod: accessBonusCount(s, sid, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, accessed.cid]), args), accessed, null);
      }
      return null;
    }),
  };
}

// --- accessCardsFromRd / accessCardsFromHq ---------------------------------

export function accessCardsFromRd(state: GameState): Card[] {
  const fn = (state.runner as any)?.["rd-access-fn"];
  return fn ? fn(state.corp.deck) : state.corp.deck;
}

export function accessCardsFromHq(state: GameState): Card[] {
  const fn = (state.runner as any)?.["hq-access-fn"];
  return fn ? fn(state.corp.hand) : state.corp.hand;
}

// --- accessHelperHq --------------------------------------------------------

export function accessHelperHq(state: GameState, side: string, eid: EID, accessAmount: { chosen: number; randomAccessLimit?: number; totalMod?: number }, alreadyAccessed: Set<string>, args: { server: string[]; noRoot?: boolean; accessFirst?: Card[] }): any {
  const preventHandAccess = (state.run as any)?.["prevent-hand-access"];
  const hand = !preventHandAccess && !coreEffects.anyEffects(state, "runner", ":disable-random-accesses", true) ? state.corp.hand : [];
  const alreadyAccessedFn = (card: Card) => alreadyAccessed.has(card.cid);
  const randomLimit = accessAmount["random-access-limit"] || 1;

  const cardFrom = "Card from hand";
  const cardFromButton = randomLimit > 0 && hand.filter((c) => !alreadyAccessedFn(c)).length > 0 ? [cardFrom] : [];

  const server = (args.server as string[]) || [];
  const root = args["no-root"] ? [] : rootContent(state, server[0], alreadyAccessedFn);
  const upgradeButtons = root.filter(coreCard.isRezzed).map((c) => c.title);

  const unrezzedCard = "Unrezzed upgrade";
  const unrezzedCardsButton = args["no-root"]
    ? undefined
    : root.filter((c) => !coreCard.isRezzed(c)).filter((c) => !alreadyAccessedFn(c)).length > 0 ? [unrezzedCard] : undefined;

  const choices = [...(cardFromButton || []), ...upgradeButtons, ...(unrezzedCardsButton || [])];

  if (choices.length === 0 || !mustContinue(state, alreadyAccessedFn, accessAmount, args)) return null;

  const cardFromHandFn = req(() => {
    const corpChooseHq = coreEffects.anyEffects(state, side, ":corp-choose-hq-access");
    if (corpChooseHq) {
      continue_ability(state, "corp", {
        async: true,
        prompt: "Choose a card in HQ for the Runner to access (clicking done will randomly choose a candidate)",
        "waiting-prompt": true,
        choices: { card: (card: Card) => coreCard.inHand(card) && coreCard.isCorp(card) && !alreadyAccessedFn(card) },
        effect: req((s, sid, e, cd, tgt) => {
          const selected = forms.context(s, cd, tgt);
          accessCard(s, "runner", e, selected);
          continue_ability(s, "runner", accessHelperHq(s, sid, e, { "random-access-limit": randomLimit - 1, totalMod: accessBonusCount(s, sid, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, selected.cid]), args), selected, null);
          return null;
        }),
        cancel: {
          async: true,
          effect: req((s, sid, e, cd, tgt) => {
            const accessed = accessCardsFromHq(s).find((c) => !alreadyAccessedFn(c));
            if (accessed) {
              coreSay.systemMsg(s, sid, `randomly chooses ${accessed.title} to be accessed`);
              accessCard(s, sid, e, accessed, accessed.title);
              continue_ability(s, sid, accessHelperHq(s, sid, e, { "random-access-limit": randomLimit - 1, totalMod: accessBonusCount(s, sid, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, accessed.cid]), args), accessed, null);
            }
            return null;
          }),
        },
      }, cd, null);
      return null;
    }

    const accessed = accessCardsFromHq(state).find((c) => !alreadyAccessedFn(c));
    if (accessed) {
      accessCard(state, side, eid, accessed, accessed.title);
      continue_ability(state, side, accessHelperHq(state, side, eid, { "random-access-limit": randomLimit - 1, totalMod: accessBonusCount(state, side, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, accessed.cid]), args), accessed, null);
    }
    return null;
  });

  const unrezzedCardsFn = req(() => {
    const unrezzed = root.filter((c) => !coreCard.isRezzed(c));
    if (unrezzed.length === 1) {
      accessCard(state, side, eid, unrezzed[0]);
      continue_ability(state, side, accessHelperHq(state, side, eid, { "random-access-limit": randomLimit, totalMod: accessBonusCount(state, side, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, unrezzed[0].cid]), args), null, null);
    } else {
      continue_ability(state, side, {
        async: true,
        prompt: "Choose an upgrade in root of HQ to access",
        choices: { card: (card: Card) => unrezzed.some((c) => utils.sameCard(c, card)) },
        effect: req((s, sid, e, cd, tgt) => {
          const target = forms.context(s, cd, tgt);
          accessCard(s, sid, e, target);
          continue_ability(s, sid, accessHelperHq(s, sid, e, { "random-access-limit": randomLimit, totalMod: accessBonusCount(s, sid, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, (target as Card).cid]), args), target, null);
          return null;
        }),
      }, null, null);
    }
    return null;
  });

  const accessFirst = args["access-first"];
  if (accessFirst && Array.isArray(accessFirst) && accessFirst.length > 0) {
    const [firstCard, ...rest] = accessFirst;
    return {
      async: true,
      effect: req(() => {
        accessCard(state, side, eid, firstCard, firstCard.title);
        continue_ability(state, side, accessHelperHq(state, side, eid, { "random-access-limit": randomLimit - 1, totalMod: accessBonusCount(state, side, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, firstCard.cid]), { ...args, "access-first": rest }), firstCard, null);
        return null;
      }),
    };
  }

  return {
    async: true,
    prompt: "Choose a card to access",
    choices,
    effect: req((s, sid, e, cd, tgt) => {
      const target = forms.context(s, cd, tgt);
      if (target === cardFrom) return cardFromHandFn();
      if (target === unrezzedCard) return unrezzedCardsFn();

      const accessed = root.find((c) => c.title === target);
      if (accessed) {
        accessCard(s, sid, e, accessed);
        continue_ability(s, sid, accessHelperHq(s, sid, e, { "random-access-limit": randomLimit, totalMod: accessBonusCount(s, sid, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, accessed.cid]), args), accessed, null);
      }
      return null;
    }),
  };
}

// --- choose-access :remote -------------------------------------------------

registerChooseAccess("remote", (accessAmount, server, args) => {
  const onlyCard = getOnlyCardToAccess(state);
  const maxAccess = (state.run as any)?.["max-access"];
  const content = (state.corp.servers as any)?.[server]?.content || [];
  const totalCards = onlyCard ? [onlyCard] : getAllContent(content).filter((c) => coreFlags.canAccessLoud(state, side, c));
  const totalCardsCount = totalCards.length;
  const totalMod = accessAmount.totalMod || 0;
  const posMax = maxAccess ? totalMod + maxAccess > 0 : true;
  const posTotal = totalCardsCount + totalMod > 0;

  if (posMax && posTotal && onlyCard) {
    if (coreCard.inZone(onlyCard, "servers", (server as string[])?.[0] || "")) {
      accessCard(state, side, coreEid.makeEID(state), onlyCard);
    }
  } else if (posMax && posTotal) {
    continue_ability(state, side, accessHelperRemote(state, side, coreEid.makeEID(state), { totalMod, chosen: 0 }, new Set(), { server: server as string[] || [] }), null, null);
  }
  return { async: true };
});

// --- choose-access :rd -----------------------------------------------------

registerChooseAccess("rd", (accessAmount, server, args) => {
  const onlyCard = getOnlyCardToAccess(state);
  const maxAccess = (state.run as any)?.["max-access"];
  const totalCards = onlyCard
    ? [onlyCard]
    : [...(take(accessAmount["random-access-limit"] || 1, accessCardsFromRd(state))), ...(args["no-root"] ? [] : (state.corp.servers as any)?.rd?.content || [])];
  const totalCardsCount = totalCards.length;
  const totalMod = accessAmount.totalMod || 0;
  const posMax = maxAccess ? totalMod + maxAccess > 0 : true;
  const posTotal = totalCardsCount + totalMod > 0;

  if (posMax && posTotal && onlyCard) {
    if (coreCard.inDeck(onlyCard) || coreCard.inZone(onlyCard, "servers", "rd")) {
      accessCard(state, side, coreEid.makeEID(state), onlyCard);
    }
  } else if (posMax && posTotal) {
    continue_ability(state, side, accessHelperRd(state, side, coreEid.makeEID(state), { ...accessAmount, chosen: 0 }, new Set(), args || {}), null, null);
  }
  return { async: true };
});

// --- choose-access :hq -----------------------------------------------------

registerChooseAccess("hq", (accessAmount, server, args) => {
  const onlyCard = getOnlyCardToAccess(state);
  const maxAccess = (state.run as any)?.["max-access"];
  const preventHandAccess = (state.run as any)?.["prevent-hand-access"];
  const totalCards = onlyCard
    ? [onlyCard]
    : [
        ...(preventHandAccess ? [] : state.corp.hand),
        ...(args["no-root"] ? [] : rootContent(state, "hq")),
      ];
  const totalCardsCount = totalCards.length;
  const totalMod = accessAmount.totalMod || 0;
  const posMax = maxAccess ? totalMod + maxAccess > 0 : true;
  const posTotal = totalCardsCount + totalMod > 0;

  if (posMax && posTotal && onlyCard) {
    if (coreCard.inHand(onlyCard) || coreCard.inZone(onlyCard, "servers", (server as string[])?.[0] || "")) {
      accessCard(state, side, coreEid.makeEID(state), onlyCard);
    }
  } else if (posMax && posTotal) {
    continue_ability(state, side, accessHelperHq(state, side, coreEid.makeEID(state), { ...accessAmount, chosen: 0 }, new Set(), { server: server as string[] || [], ...args }), null, null);
  }
  return { async: true };
});

// --- choose-access :archives -----------------------------------------------

registerChooseAccess("archives", (accessAmount, server, args) => {
  const onlyCard = getOnlyCardToAccess(state);
  const maxAccess = (state.run as any)?.["max-access"];
  const totalCards = onlyCard
    ? [onlyCard]
    : [...state.corp.discard, ...(args["no-root"] ? [] : rootContent(state, "archives"))];
  const totalCardsCount = totalCards.length;
  const totalMod = accessAmount.totalMod || 0;
  const posMax = maxAccess ? totalMod + maxAccess > 0 : true;
  const posTotal = totalCardsCount + totalMod > 0;

  if (posMax && posTotal && onlyCard) {
    if (coreCard.inDiscard(onlyCard) || coreCard.inZone(onlyCard, "servers", "archives")) {
      accessCard(state, side, coreEid.makeEID(state), onlyCard);
    }
  } else if (posMax && posTotal) {
    continue_ability(state, side, accessHelperArchives(state, side, coreEid.makeEID(state), { totalMod, chosen: 0 }, new Set(), args || {}), null, null);
  }
  return { async: true };
});

// --- accessHelperArchives --------------------------------------------------

export function accessHelperArchives(state: GameState, side: string, eid: EID, accessAmount: { chosen: number; totalMod?: number }, alreadyAccessed: Set<string>, args: { server?: string[]; noRoot?: boolean }): any {
  const alreadyAccessedFn = (card: Card) => alreadyAccessed.has(card.cid);

  const currentAvailable = new Set([...state.corp.discard, ...rootContent(state, "archives", alreadyAccessedFn)].map((c) => c.cid));
  const filteredAlreadyAccessed = new Set([...alreadyAccessed].filter((cid) => currentAvailable.has(cid)));

  const faceupCardsButtons = faceupAccessible(state, alreadyAccessedFn).map((c) => c.title);
  const unrezzedCard = "Unrezzed upgrade";

  const root = rootContent(state, "archives", alreadyAccessedFn);
  const unrezzedCardsButton = args["no-root"]
    ? undefined
    : root.filter((c) => !coreCard.isRezzed(c)).length > 0 ? [unrezzedCard] : undefined;

  const upgradeButtons = args["no-root"] ? [] : root.filter(coreCard.isRezzed).map((c) => c.title);

  const facedownCard = "Facedown card in Archives";
  const facedownCardsButton = facedownCards(state, alreadyAccessedFn).length > 0 ? [facedownCard] : undefined;

  const everythingElse = "Everything else";
  const everythingElseButton = archivesInactive(state, alreadyAccessedFn).length > 0 ? [everythingElse] : undefined;

  const choices = [...faceupCardsButtons, ...upgradeButtons, ...(facedownCardsButton || []), ...(unrezzedCardsButton || []), ...(everythingElseButton || [])];

  if (choices.length === 0 || !mustContinue(state, alreadyAccessedFn, accessAmount, args)) return null;

  // Unrezzed cards function
  const unrezzedCardsFn = req(() => {
    const unrezzed = root.filter((c) => !coreCard.isRezzed(c));
    if (unrezzed.length === 1) {
      accessCard(state, side, eid, unrezzed[0]);
      continue_ability(state, side, accessHelperArchives(state, side, eid, { totalMod: accessBonusCount(state, side, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, unrezzed[0].cid]), args), null, null);
    } else {
      continue_ability(state, side, {
        async: true,
        prompt: "Choose an upgrade in Archives to access",
        choices: { card: (card: Card) => coreCard.getZone(card)[0] === "servers" && coreCard.getZone(card)[1] === "archives" && !alreadyAccessedFn(card) },
        effect: req((s, sid, e, cd, tgt) => {
          const target = forms.context(s, cd, tgt);
          const newAlreadyAccessed = new Set([...alreadyAccessed, (target as Card).cid]);
          accessCard(s, sid, e, target);
          continue_ability(s, sid, accessHelperArchives(s, sid, e, { totalMod: accessBonusCount(s, sid, ":total"), chosen: accessAmount.chosen + 1 }, newAlreadyAccessed, args), target, null);
          return null;
        }),
      }, null, null);
    }
    return null;
  });

  // Facedown cards function
  const facedownCardsFn = req(() => {
    const facedown = facedownCards(state, alreadyAccessedFn);
    const accessed = facedown[Math.floor(Math.random() * facedown.length)];
    accessCard(state, side, eid, accessed);
    continue_ability(state, side, accessHelperArchives(state, side, eid, { totalMod: accessBonusCount(state, side, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, accessed.cid]), args), null, null);
    return null;
  });

  // Everything else function
  const everythingElseFn = req(() => {
    const inactive = archivesInactive(state, alreadyAccessedFn);
    coreSay.systemMsg(state, side, "accesses everything else in Archives");
    for (const card of inactive) {
      accessCard(state, side, eid, card);
    }
    continue_ability(state, side, accessHelperArchives(state, side, eid, { totalMod: accessBonusCount(state, side, ":total"), chosen: accessAmount.chosen + inactive.length }, new Set([...alreadyAccessed, ...inactive.map((c) => c.cid)]), args), null, null);
    return null;
  });

  return {
    async: true,
    prompt: "Choose a card to access. You must access all cards",
    choices,
    effect: req((s, sid, e, cd, tgt) => {
      const target = forms.context(s, cd, tgt);

      if (target === unrezzedCard) return unrezzedCardsFn();
      if (target === facedownCard) return facedownCardsFn();
      if (target === everythingElse) return everythingElseFn();

      // Access a faceup card or rezzed upgrade
      const allAvailable = [...faceupAccessible(state, alreadyAccessedFn), ...root];
      const accessed = allAvailable.find((c) => c.title === target);
      if (accessed) {
        accessCard(s, sid, e, accessed);
        continue_ability(s, sid, accessHelperArchives(s, sid, e, { totalMod: accessBonusCount(s, sid, ":total"), chosen: accessAmount.chosen + 1 }, new Set([...alreadyAccessed, accessed.cid]), args), accessed, null);
      }
      return null;
    }),
  };
}

// --- accessInactiveArchivesCards -------------------------------------------

function accessInactiveArchivesCards(state: GameState, side: string, eid: EID, cards: Card[], accessAmount: { chosen: number; totalMod?: number }, accessedCards: Card[] = []): void {
  if (cards.length === 0) {
    coreEid.completeWithResult(state, side, eid, accessedCards);
    return;
  }

  accessCard(state, side, eid, cards[0], undefined, { noMsg: true });
  const nextAccessAmount = { totalMod: accessBonusCount(state, side, ":total"), chosen: accessAmount.chosen + 1 };
  accessInactiveArchivesCards(state, side, eid, cards.slice(1), nextAccessAmount, [...accessedCards, cards[0]]);
}

// --- faceupAccessible / facedownCards / archivesInactive -------------------

function accessible(state: GameState, card: Card): boolean {
  return coreCard.isAgenda(card) || coreEngine.shouldTrigger(state, "corp", coreEid.makeEID(state), card, null, coreTypes.getCardDef(card)?.["on-access"]);
}

function getArchivesAccessible(state: GameState): Card[] {
  return state.corp.discard.filter((c) => c.seen && accessible(state, c));
}

function getArchivesInactive(state: GameState): Card[] {
  return state.corp.discard.filter((c) => c.seen && !accessible(state, c));
}

export function faceupAccessible(state: GameState, alreadyAccessedFn: (card: Card) => boolean): Card[] {
  const onlyCard = getOnlyCardToAccess(state);
  const cards = onlyCard ? [onlyCard] : getArchivesAccessible(state);
  return cards.filter((c) => !alreadyAccessedFn(c));
}

export function facedownCards(state: GameState, alreadyAccessedFn: (card: Card) => boolean): Card[] {
  const onlyCard = getOnlyCardToAccess(state);
  const cards = onlyCard ? [onlyCard] : state.corp.discard;
  return cards.filter((c) => !c.seen && !alreadyAccessedFn(c));
}

export function archivesInactive(state: GameState, alreadyAccessedFn: (card: Card) => boolean): Card[] {
  return getArchivesInactive(state).filter((c) => !alreadyAccessedFn(c));
}

// --- maxAccess -------------------------------------------------------------

/** Put an upper limit on the number of cards that can be accessed in this run. */
export function maxAccess(state: GameState, n: number): void {
  const run = state.run as Record<string, unknown>;
  if (!run) return;
  const currentMax = run["max-access"];
  run["max-access"] = currentMax ? Math.min(currentMax, n) : n;
}

// --- accessBonus -----------------------------------------------------------

/** Increase the number of cards to be accessed in server during this run. */
export function accessBonus(state: GameState, side: string, server: string, bonus: number, duration: string = ":end-of-run"): void {
  coreEffects.registerLingeringEffect(state, side, null, {
    type: ":access-bonus",
    duration,
    req: req((s, si, e, ca, tg) => server === tg),
    value: bonus,
  });
}

// --- numCardsToAccess (multi-method) ---------------------------------------

type NumCardsFn = (state: GameState, side: string, server: string, accessAmount: number | null) => Record<string, number>;

const numCardsToAccessMap: Record<string, NumCardsFn> = {};

export function registerNumCardsToAccess(serverType: string, fn: NumCardsFn): void {
  numCardsToAccessMap[serverType] = fn;
}

export function numCardsToAccess(state: GameState, side: string, server: string, accessAmount: number | null): Record<string, number> {
  const onlyCard = getOnlyCardToAccess(state);
  const serverType = onlyCard ? "only" : getServerType([server]);
  const fn = numCardsToAccessMap[serverType] || numCardsToAccessMap[serverType];
  return fn ? fn(state, side, server, accessAmount) : { totalMod: 0, chosen: 0 };
}

// Default: only
numCardsToAccessMap["only"] = (state, side, _server, _amount) => ({
  totalMod: accessBonusCount(state, side, ":total"),
  chosen: 0,
});

// Default: remote
numCardsToAccessMap["remote"] = (state, side, _server, _amount) => ({
  totalMod: accessBonusCount(state, side, ":total"),
  chosen: 0,
});

// Central servers (HQ, RD)
function numCardsCentral(state: GameState, side: string, base: number, accessKey: string, accessAmount: number | null): Record<string, number> {
  const mod = accessBonusCount(state, side, accessKey);
  const randomAccessLimit = base + mod;
  return {
    "random-access-limit": accessAmount ?? randomAccessLimit,
    totalMod: accessBonusCount(state, side, ":total"),
    chosen: 0,
  };
}

numCardsToAccessMap["rd"] = (state, side, _server, accessAmount) => numCardsCentral(state, side, 1, "rd", accessAmount);
numCardsToAccessMap["hq"] = (state, side, _server, accessAmount) => numCardsCentral(state, side, 1, "hq", accessAmount);

// Archives
numCardsToAccessMap["archives"] = (state, side, _server, _amount) => ({
  totalMod: accessBonusCount(state, side, ":total"),
  chosen: 0,
});

// --- turnArchivesFaceup ----------------------------------------------------

/** Flip all cards in archives face-up. */
export function turnArchivesFaceup(state: GameState, side: string, eid: EID, server: string[]): void {
  if (getServerType(server) === "archives") {
    const discard = state.corp.discard;
    const known = discard.filter((c) => c.seen).map((c) => ({ ...c, new: undefined }));
    const unknown = discard.filter((c) => !c.seen).map((c) => ({ ...c, seen: true, new: true }));

    // Shuffle unknown cards
    const shuffled = unknown.sort(() => Math.random() - 0.5);
    state.corp.discard = [...known, ...shuffled];

    if (shuffled.length > 0) {
      coreEngine.triggerEventSimult(state, side, eid, ":archives-flipped", null, { count: shuffled.length });
    } else {
      coreEid.effectCompleted(state, side, eid);
    }
  } else {
    coreEid.effectCompleted(state, side, eid);
  }
}

// --- cleanAccessArgs -------------------------------------------------------

export function cleanAccessArgs(args: Record<string, unknown>): Record<string, unknown> {
  const accessFirst = args["access-first"];
  if (accessFirst) {
    return { ...args, "access-first": Array.isArray(accessFirst) ? accessFirst : [accessFirst] };
  }
  return args;
}

// --- accessNCards ----------------------------------------------------------

/** Access a specific number of cards from a server. */
export function accessNCards(state: GameState, side: string, eid: EID, server: string[], n: number): void {
  const accessAmount = numCardsToAccess(state, side, server[0], n);
  if (state.run) {
    (state.run as Record<string, unknown>)["did-access"] = true;
    maxAccess(state, n);
  }

  coreEffects.unregisterLingeringEffects(state, side, ":end-of-access");
  coreEngine.unregisterFloatingEvents(state, side, ":end-of-access");
  coreEid.effectCompleted(state, side, eid);
}

// --- breachServer ----------------------------------------------------------

/** Starts the breach routines for the run's server. */
export function breachServer(state: GameState, side: string, eid: EID, server: string[], args?: Record<string, unknown>): void {
  const accessArgs = cleanAccessArgs(args || {});
  const accessAmount = numCardsToAccess(state, side, server[0], null);

  coreSay.systemMsg(state, side, `breaches ${coreServers.zoneToName(server[0])}`);

  coreEngine.triggerEventSimult(state, side, null, ":breach-server", { server: server[0] });
  state.breach = { "breach-server": server[0], "from-server": server[0] } as any;

  if (state.run) {
    (state.run as Record<string, unknown>)["did-access"] = true;
  }

  turnArchivesFaceup(state, side, coreEid.makeEID(state), server);

  coreEngine.triggerEventSync(state, side, coreEid.makeEID(state), ":end-breach-server", state.breach);
  state.breach = undefined;

  coreEffects.unregisterLingeringEffects(state, side, ":end-of-access");
  coreEngine.unregisterFloatingEvents(state, side, ":end-of-access");
  coreEid.effectCompleted(state, side, eid);
}
