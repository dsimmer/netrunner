/**
 * Core access functions
 * Ported from Clojure core/access.clj to TypeScript
 */

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types.ts";
import * as coreAgendas from "./agendas";
import * as coreBoard from "./board";
import * as coreCard from "./card";
import * as coreTypes from "./types.ts";
import * as coreCostFns from "./cost_fns";
import * as coreEffects from "./effects";
import * as coreEid from "./eid";
import * as coreEngine from "./engine";
import * as coreFinding from "./finding";
import * as coreFlags from "./flags";
import * as coreMoving from "./moving";
import * as corePayment from "./payment";
import * as coreProps from "./props";
import * as coreRevealing from "./revealing";
import * as coreRuns from "./runs";
import * as coreSay from "./say";
import * as coreServers from "./servers";
import * as coreUpdating from "./update";
import * as utils from "../utils";
import { req, wait_for, continue_ability, forms } from "../macros";

import { accessCardsFromRd, maxAccess } from "./access_2";

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
export function accessBonusCount(
  state: GameState,
  side: string,
  kw: string,
): number {
  return coreEffects.sumEffects(state, side, ":access-bonus", kw);
}

// --- accessEnd -------------------------------------------------------------

/** Trigger events involving the end of the access phase. */
export function accessEnd(
  state: GameState,
  side: string,
  eid: EID,
  c: Card,
  opts?: { trashed?: boolean; stolen?: boolean },
): void {
  const trashed = opts?.trashed ?? false;
  const stolen = opts?.stolen ?? false;

  if (!trashed) {
    coreEngine.triggerEventSync(state, side, eid, ":no-trash", {
      "accessed-card": c,
    });
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
  const abilityCost = coreCostFns.cardAbilityCost(
    state,
    "runner",
    accessAbility,
    card,
  );
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
    coreEngine.triggerEventSync(state, side, eid, ":pre-trash", {
      "accessed-card": c,
    });
  }

  // Increment access card count
  const stats = state.stats;
  (stats as any).runner = (stats as any).runner || {};
  (stats as any).runner.access = (stats as any).runner.access || {};
  (stats as any).runner.access.cards =
    ((stats as any).runner.access.cards || 0) + 1;

  // Check if we should skip the prompt
  const seenInArchives = coreCard.inDiscard(c) && c.seen;
  const edwardKimTrash =
    coreCard.isOperation(c) &&
    coreFlags.cardFlag(c, ":can-trash-operation", true);
  const alreadyTrashed =
    !coreCard.inDiscard(c) && coreFinding.findCID(c.cid, state.corp.discard);

  if (seenInArchives || edwardKimTrash || alreadyTrashed) {
    accessEnd(state, side, eid, c);
    return;
  }

  const card = { ...c, seen: true };
  const trashCostVal = !coreCard.inDiscard(c)
    ? coreCostFns.trashCost(state, side, card)
    : undefined;
  const trashEid = {
    ...eid,
    source: card,
    sourceType: ":runner-trash-corp-cards",
  };
  const canTrash = coreFlags.canTrash(state, side, c);
  const canPay = trashCostVal
    ? corePayment.canPay(state, "runner", trashEid as EID, card, null, [
        toC("credit", trashCostVal),
      ])
    : false;
  const trashCostStr = canPay
    ? [`Pay ${trashCostVal} [Credits] to trash`]
    : undefined;

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

  const mustTrash =
    !mustTrashWithCredits &&
    canTrash &&
    trashAbCards.length > 0 &&
    coreFlags.cardFlagFn(state, side, c, ":must-trash", true);

  const abilityCards = mustTrash
    ? trashAbCards
    : !canTrash
      ? nonTrashAbCards
      : accessAbCards;
  const abilityStrs = abilityCards.map((ac) => ({
    cid: ac.cid,
    title: accessAbLabel(state, ac),
  }));

  const forcedToTrash = mustTrash || mustTrashWithCredits;
  const noActionStr = !canTrash || !forcedToTrash ? ["No action"] : undefined;
  const choices = [
    ...abilityStrs,
    ...(trashCostStr || []),
    ...(noActionStr || []),
  ];

  const promptFn = req((s, sid, e, cd, tgt) => {
    const target = forms.context(s, cd, tgt);

    if (target === (noActionStr?.[0] || "No action")) {
      accessEnd(s, sid, e, cd);
      return null;
    }

    if (trashCostStr && target === trashCostStr[0]) {
      const updatedCard = coreUpdating.update!(s, sid, { ...cd, seen: true });
      const payEid = { ...coreEid.makeEID(s), ...trashEid };
      coreEngine.pay(s, sid, payEid, updatedCard, [
        toC("credit", trashCostVal),
      ]);
      accessEnd(s, sid, e, updatedCard, { trashed: true });
      return null;
    }

    const abilityCard = abilityCards.find(
      (ac) => accessAbLabel(s, ac) === target,
    );
    if (abilityCard) {
      const abilityEid = {
        ...eid,
        source: abilityCard,
        sourceType: ":ability",
      };
      const ability = accessAb(abilityCard);
      if (ability?.["trash?"] === true) {
        s.runner.register = s.runner.register || {};
        s.runner.register["trashed-accessed-card"] = true;
      }
      coreEngine.resolveAbility(
        s,
        sid,
        { ...coreEid.makeEID(s), ...abilityEid },
        abilityCard,
        [cd],
      );
      return null;
    }

    accessEnd(s, sid, e, cd);
    return null;
  });

  continue_ability(
    state,
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
}

// --- stealCostBonus --------------------------------------------------------

/** Applies a cost to the next steal attempt. */
export function stealCostBonus(
  state: GameState,
  _side: string,
  costs: any[],
  source: Card | null,
): void {
  const bonus = (state.bonus as Record<string, unknown>) || {};
  const stealCosts = (bonus["steal-cost"] as any[]) || [];
  (state.bonus as any) = {
    ...bonus,
    "steal-cost": [...stealCosts, [costs, source]],
  };
}

// --- steal -----------------------------------------------------------------

/** Moves a card to the runner's :scored area. */
export function steal(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
): void {
  const c = coreMoving.move(
    state,
    "runner",
    { ...card, "advance-counter": undefined, new: undefined },
    "scored",
    { force: true },
  );
  coreUpdating.update!(state, side, c);

  if (coreFlags.cardFlag(c, ":has-events-when-stolen", true)) {
    coreEngine.registerDefaultEvents(state, side, c);
    coreEffects.registerStaticAbilities(state, side, c);
  }

  coreAgendas.updateAllAdvancementRequirements(state);
  coreAgendas.updateAllAgendaPoints(state);

  const updatedC = coreFinding.getCard(state, c);
  const points = coreCard.getAgendaPoints(updatedC);

  coreSay.systemMsg(
    state,
    "runner",
    `steals ${updatedC?.title} and gains ${utils.quantify(points, "agenda point")}`,
  );

  const runnerReg = state.runner.register || {};
  runnerReg["stole-agenda"] =
    (runnerReg["stole-agenda"] || 0) + (updatedC?.agendapoints || 0);

  coreSay.playSfx(state, side, "agenda-steal");

  if (state.breach) (state as any).breach["did-steal"] = true;
  if (state.run) (state as any).run["did-steal"] = true;

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

  coreEngine.checkpoint(
    state,
    null,
    { ...coreEid.makeEID(state), ...eid },
    { duration: ":agenda-stolen" },
  );
  // accessEnd will be called after checkpoint completes
}

// --- stealAgenda -----------------------------------------------------------

/** Trigger the stealing of an agenda, now that costs have been paid. */
export function stealAgenda(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
): void {
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
export function accessAgenda(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
): void {
  const stats = state.stats;
  (stats as any).runner = (stats as any).runner || {};
  (stats as any).runner.access = (stats as any).runner.access || {};
  (stats as any).runner.access.cards =
    ((stats as any).runner.access.cards || 0) + 1;

  const cost = corePayment.mergeCosts(
    coreCostFns.stealCost(state, side, eid, card),
  );
  const costStrs = corePayment.buildCostString(cost);
  const eidWithCosts = { ...eid, additionalCosts: cost };
  const canPay = corePayment.canPay(
    state,
    side,
    { ...coreEid.makeEID(state), ...eidWithCosts },
    card,
    card.title,
    cost,
  );
  const canSteal = coreFlags.canSteal(state, side, card);

  let accessAbCards: Card[] = [];
  if (!coreCard.inDiscard(card)) {
    const activeCards = coreBoard.allActive(state, "runner");
    accessAbCards = activeCards.filter((ac) => {
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

  const abilityStrs = accessAbCards.map((ac) => ({
    cid: ac.cid,
    title: accessAbLabel(state, ac),
  }));
  const stealStr =
    canSteal && canPay
      ? costStrs.length > 0
        ? ["Pay to steal"]
        : ["Steal"]
      : undefined;
  const noActionStr =
    stealStr && stealStr[0] !== "Steal" ? ["No action"] : undefined;
  const promptStr =
    costStrs.length > 0
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
      const payEid = {
        ...coreEid.makeEID(s),
        ...eid,
        additionalCosts: cost,
        source: cd,
        sourceType: ":runner-steal",
        action: ":steal-cost",
      };
      coreEngine.pay(s, sid, payEid, null, null, cost);
      coreSay.systemMsg(
        s,
        sid,
        `to steal ${cd.title} from ${coreServers.nameZone("corp", coreCard.getZone(cd))}`,
      );
      stealAgenda(s, sid, e, cd);
      return null;
    }

    const abilityCard = accessAbCards.find(
      (ac) => accessAbLabel(s, ac) === target,
    );
    if (abilityCard) {
      const abilityEid = {
        ...eid,
        source: abilityCard,
        sourceType: ":ability",
      };
      const ability = accessAb(abilityCard);
      if (s.breach && ability?.["trash?"] === true)
        (s as any).breach["did-trash"] = true;
      if (s.run && ability?.["trash?"] === true)
        (s as any).run["did-trash"] = true;
      coreEngine.resolveAbility(
        s,
        sid,
        { ...coreEid.makeEID(s), ...abilityEid },
        abilityCard,
        [cd],
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

// --- revealAccess ----------------------------------------------------------

/** Check if the card should be revealed on access. */
export function revealAccess(
  state: GameState,
  side: string,
  card: Card,
): boolean {
  const cdef = coreTypes.getCardDef(card);
  const zone = coreCard.getZone(card);

  const revealKw =
    zone[0] === "deck"
      ? ":rd-reveal"
      : zone[0] === "hand"
        ? ":hq-reveal"
        : zone[0] === "discard"
          ? ":archives-reveal"
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
export function msgHandleAccess(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  title: string,
  args?: { costMsg?: string[]; noMsg?: boolean },
): void {
  const costMsg = args?.costMsg || [];
  const noMsg = args?.noMsg ?? false;
  const costStr = joinCostStrs(costMsg);

  if (!noMsg) {
    const publicMsg = `${costStr ? `${costStr} to access ` : ""}accesses ${title}${card ? ` from ${coreServers.nameZone("corp", coreCard.getZone(card))}` : ""}`;
    const runnerMsg = `${costStr ? `${costStr} to access ` : ""}accesses ${card.title}${card ? ` from ${coreServers.nameZone("corp", coreCard.getZone(card))}` : ""}`;

    if (title === "an unseen card") {
      coreSay.systemMsg(state, side, publicMsg, {
        "log-side": ["public", "corp"],
      });
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
  return {
    ...coreEngine.abilityAsHandler(card, onAccess),
    condition: ":accessed",
  };
}

// --- installedAccessTrigger ------------------------------------------------

/** Effect for triggering ambush on access. */
export function installedAccessTrigger(
  cost: number | any[],
  ability: any,
  prompt?: any,
): any {
  if (prompt === undefined) {
    const ab =
      typeof cost === "number" && cost > 0
        ? { ...ability, cost: [toC("credit", cost)] }
        : ability;
    const pr =
      typeof cost === "number" && cost > 0
        ? req(
            (st, si, ei, ca, tg) =>
              `Pay ${cost} [Credits] to use ${ca.title} ability?`,
          )
        : req((st, si, ei, ca, tg) => `Use ${ca.title} ability?`);
    return installedAccessTrigger(cost, ab, pr);
  }

  const costArr = typeof cost === "number" ? [toC("credit", cost)] : cost;
  return {
    "on-access": {
      optional: {
        req: req((state, side, eid, card, targets) => {
          const installed =
            card.zone && ["rig", "servers"].includes(card.zone[0]);
          return (
            installed &&
            corePayment.canPay(state, "corp", eid, card, null, costArr)
          );
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

export function accessTriggerEvents(
  state: GameState,
  side: string,
  eid: EID,
  c: Card,
  title: string,
  args: { noMsg?: boolean; costMsg?: string[] },
): void {
  const cdef = coreTypes.getCardDef(c);
  const cUpdated = {
    ...c,
    "was-seen": c.seen,
    seen: c.seen || !coreCard.inDiscard(c),
  };
  const accessEffect = accessAbility(cUpdated, cdef);

  state.runner.register = {
    ...(state.runner.register || {}),
    "accessed-cards": true,
  };

  coreEid.registerEIDCallback(state, coreEid.makeEID(state), () => {
    msgHandleAccess(state, side, eid, cUpdated, title, args);
  });

  const cancelFn = () =>
    !coreFinding.getCard(state, c) || !(state as any).access;

  coreEid.registerEIDCallback(state, coreEid.makeEID(state), () => {
    const currentCard = coreFinding.getCard(state, c);
    const accessedCard = (state as any).access as Card | undefined;

    if (currentCard && utils.sameCard(c, accessedCard)) {
      const card = currentCard;
      if (coreCard.isAgenda(card)) {
        accessAgenda(state, side, eid, card);
      } else {
        const trashed = !!coreFinding.findCID(card.cid, state.corp.discard);
        const stolen =
          coreCard.isAgenda(card) &&
          !!coreFinding.findCID(card.cid, state.runner.scored);
        accessEnd(state, side, eid, card, { trashed, stolen });
      }
    } else {
      const trashed = !!coreFinding.findCID(c.cid, state.corp.discard);
      const stolen =
        coreCard.isAgenda(c) &&
        !!coreFinding.findCID(c.cid, state.runner.scored);
      accessEnd(state, side, eid, c, { trashed, stolen });
    }
  });

  coreEngine.triggerEventSimult(
    state,
    side,
    ":access",
    { "card-abilities": accessEffect, "cancel-fn": cancelFn },
    { "accessed-card": c },
  );
}

// --- accessCostBonus -------------------------------------------------------

/** Applies a cost to the next access. */
export function accessCostBonus(
  state: GameState,
  _side: string,
  costs: any[],
): void {
  const bonus = (state.bonus as Record<string, unknown>) || {};
  const accessCost = (bonus["access-cost"] as any[]) || [];
  (state.bonus as any) = {
    ...bonus,
    "access-cost": corePayment.mergeCosts([...accessCost, ...costs]),
  };
}

// --- accessCost ------------------------------------------------------------

export function accessCost(state: GameState, _side: string): any[] {
  return corePayment.mergeCosts(
    (state.bonus as Record<string, unknown>)?.["access-cost"] || [],
  );
}

// --- refusedAccessCost -----------------------------------------------------

export function refusedAccessCost(
  state: GameState,
  side: string,
  eid: EID,
): void {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (state as any).access;
  coreEid.effectCompleted(state, side, eid);
}

// --- accessPay -------------------------------------------------------------

export function accessPay(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  title: string,
  args: { noMsg?: boolean; costMsg?: string[] },
): void {
  const cost = accessCost(state, side);
  const costStr = corePayment.buildCostString(cost);
  const canPay =
    Object.keys(cost).length > 0
      ? corePayment.canPay(
          state,
          side,
          coreEid.makeEID(state),
          null,
          null,
          cost,
        )
      : true;

  const promptStr = canPay
    ? `${costStr} to access this card?`
    : "You can't pay the cost to access this card.";
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

    continue_ability(
      state,
      "runner",
      { async: true, prompt: promptStr, choices, effect: promptFn },
      null,
      null,
    );
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
export function setOnlyCardToAccess(
  state: GameState,
  _side: string,
  card: Card | null,
): void {
  const run = state.run as Record<string, unknown>;
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

// --- accessContinue --------------------------------------------------------

export function accessContinue(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  title: string,
  args: { noMsg?: boolean; costMsg?: string[] },
): void {
  if (!coreCard.inDiscard(card)) {
    const stats = state.stats;
    (stats as any).runner = (stats as any).runner || {};
    (stats as any).runner.access = (stats as any).runner.access || {};
    const uniqueCards = ((stats as any).runner.access["unique-cards"] ||
      []) as string[];
    (stats as any).runner.access["unique-cards"] = [
      ...new Set([...uniqueCards, card.cid]),
    ];
  }

  (state as any).access = card;

  const bonus = (state.bonus as Record<string, unknown>) || {};
  delete (bonus as any).trash;
  delete (bonus as any)["steal-cost"];
  delete (bonus as any)["access-cost"];
  (state.bonus as any) = bonus;

  if (state.breach) {
    const zone = [":discard", ":deck", ":hand"].includes(
      coreCard.getZone(card)[0],
    )
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
    const zone = [":discard", ":deck", ":hand"].includes(
      coreCard.getZone(card)[0],
    )
      ? coreCard.getZone(card)[0]
      : coreCard.getZone(card)[1];
    const run = state.run as Record<string, unknown>;
    run["cards-accessed"] = run["cards-accessed"] || {};
    (run["cards-accessed"] as Record<string, number>)[zone] =
      ((run["cards-accessed"] as Record<string, number>)[zone] || 0) + 1;
  }

  coreEngine.triggerEventSync(state, side, eid, ":pre-access-card", {
    "accessed-card": card,
  });
  accessPay(state, side, eid, card, title, args);
}

// --- accessCard ------------------------------------------------------------

export function accessCard(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  title?: string,
  args?: { noMsg?: boolean; costMsg?: string[] },
): void {
  const cardTitle = title || card.title;
  const accessArgs = args || {};
  const onlyCard = getOnlyCardToAccess(state);

  if (onlyCard && !utils.sameCard(onlyCard, card)) {
    coreEid.effectCompleted(state, side, eid);
    return;
  }

  const breachInstalled = (state.breach as any)?.installed as
    | Set<string>
    | undefined;
  if (breachInstalled?.has(card.cid)) {
    continue_ability(
      state,
      side,
      {
        optional: true,
        prompt: `Proceed to access ${coreProps.cardStr(state, card)}?`,
        "waiting-prompt": true,
        "yes-ability": {
          async: true,
          effect: req(() => {
            accessContinue(state, side, eid, card, cardTitle, accessArgs);
            return null;
          }),
        },
        "no-ability": {
          effect: req((s, sid, e, cd, tgt) => {
            coreSay.systemMsg(
              s,
              sid,
              `does not access ${coreProps.cardStr(s, cd)}`,
            );
            return null;
          }),
        },
      },
      null,
      null,
    );
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
  return content
    .filter((c) => !c.counter?.condition)
    .concat(allHosted.filter((c) => !c.counter?.condition));
}

// --- rootContent -----------------------------------------------------------

export function rootContent(
  state: GameState,
  server: string,
  alreadyAccessedFn?: (card: Card) => boolean,
): Card[] {
  const content = (state.corp.servers as any)[server]?.content || [];
  let filtered = getAllContent(content).filter((c) =>
    coreFlags.canAccess(state, "runner", c),
  );
  filtered = filtered.filter(
    (c) =>
      !coreEffects.anyEffects(
        state,
        "runner",
        ":disable-access-candidacy",
        true,
        c,
        [c],
      ),
  );
  if (alreadyAccessedFn)
    filtered = filtered.filter((c) => !alreadyAccessedFn(c));
  return filtered;
}

// --- Server type helpers ---------------------------------------------------

export function getServerType(server: string[]): string {
  return coreServers.getServerType(server);
}

// --- mustContinue (multi-method) -------------------------------------------

type MustContinueFn = (
  state: GameState,
  alreadyAccessedFn: (card: Card) => boolean,
  accessAmount: { chosen: number; totalMod?: number },
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
  accessAmount: { chosen: number; totalMod?: number },
  args: Record<string, unknown>,
): boolean {
  const server = (args.server as string[]) || [];
  const serverType = server.length ? getServerType(server) : "remote";
  const fn = mustContinueMap[serverType] || mustContinueMap["remote"];
  return fn ? fn(state, alreadyAccessedFn, accessAmount, args) : false;
}

// Remote
registerMustContinue(
  "remote",
  (state, alreadyAccessedFn, accessAmount, args) => {
    const maxAccess = (state.run as any)?.["max-access"];
    const totalMod = accessAmount.totalMod || 0;
    const limitReached =
      maxAccess !== undefined && maxAccess + totalMod <= accessAmount.chosen;
    if ((state.run as any)?.["prevent-access"]) return false;
    if (limitReached) return false;
    const server = (args.server as string[]) || [];
    const content = (state.corp.servers as any)?.[server[0]]?.content || [];
    const remaining = getAllContent(content).filter(
      (c) => coreFlags.canAccess(state, "runner", c) && !alreadyAccessedFn(c),
    );
    return remaining.length + totalMod > 0;
  },
);

// RD
registerMustContinue("rd", (state, alreadyAccessedFn, accessAmount, args) => {
  const maxAccess = (state.run as any)?.["max-access"];
  const totalMod = accessAmount.totalMod || 0;
  const limitReached =
    maxAccess !== undefined && maxAccess + totalMod <= accessAmount.chosen;
  if ((state.run as any)?.["prevent-access"]) return false;
  if (limitReached) return false;
  const noRoot = args["no-root"];
  const deck = accessCardsFromRd(state);
  const cardToSee = deck.find((c) => !alreadyAccessedFn(c));
  const randomLimit = accessAmount["random-access-limit"] || 1;
  const deckCount = cardToSee ? randomLimit : 0;
  const rootCount = noRoot
    ? 0
    : rootContent(state, "rd", alreadyAccessedFn).length;
  return deckCount + rootCount + totalMod > 0;
});

// HQ
registerMustContinue("hq", (state, alreadyAccessedFn, accessAmount, args) => {
  const maxAccess = (state.run as any)?.["max-access"];
  const totalMod = accessAmount.totalMod || 0;
  const limitReached =
    maxAccess !== undefined && maxAccess + totalMod <= accessAmount.chosen;
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
  const rootCount = noRoot
    ? 0
    : rootContent(state, "hq", alreadyAccessedFn).length;
  return handCount + rootCount + totalMod > 0;
});

// Archives
registerMustContinue(
  "archives",
  (state, alreadyAccessedFn, accessAmount, args) => {
    const maxAccess = (state.run as any)?.["max-access"];
    const totalMod = accessAmount.totalMod || 0;
    const limitReached =
      maxAccess !== undefined && maxAccess + totalMod <= accessAmount.chosen;
    if ((state.run as any)?.["prevent-access"]) return false;
    if (limitReached) return false;
    const noRoot = args["no-root"];
    const discard = state.corp.discard;
    const archivesContent = noRoot
      ? []
      : rootContent(state, "archives", alreadyAccessedFn);
    const allCards = [...discard, ...archivesContent].filter(
      (c) => !alreadyAccessedFn(c),
    );
    return allCards.length + totalMod > 0;
  },
);
