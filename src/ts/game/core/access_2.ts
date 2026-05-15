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

import { accessBonusCount, accessCard, getAllContent, getOnlyCardToAccess, getServerType, mustContinue, rootContent } from './access_1';

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
