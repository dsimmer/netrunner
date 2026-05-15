// Card moving: move, trash, swap, forfeit, mill, flip.
// Mirrors: src/clj/game/core/moving.clj

import type { GameState } from "./state.js";
import type { Card, Zone } from "./card.js";
import type { EID } from "./eid.js";
import type { Ability, ReqFn } from "./types.js";

import {
  isAgenda, isAsset, isCorp, isRunner, isICE, isProgram, isResource,
  isInstalled, isRezzed, isFacedown, hasSubtype, getZone, getTitle, inHand,
  TYPE_AGENDA, TYPE_COUNTER,
} from "./card.js";
import { getCardDef } from "./types.js";
import { updateAllAgendaPoints } from "./agendas.js";
import { allActiveInstalled } from "./board.js";
import {
  triggerEvent, triggerEventSync, registerEvents, registerDefaultEvents,
  unregisterEvents, registerStaticAbilities, unregisterStaticAbilities,
  registerPendingEvent, queueEvent, dissocReq,
} from "./engine.js";
import { isDisabledReg } from "./effects.js";
import {
  effectCompleted, completeWithResult, makeEID, makeEIDFrom, makeResult,
} from "./eid.js";
import { fakeCheckpoint } from "./checkpoint.js";
import { getCard, getScoringOwner } from "./finding.js";
import {
  canTrash, cardFlag, untrashableWhileResources, untrashableWhileRezzed,
  zoneLocked,
} from "./flags.js";
import { remove as removeFromHost } from "./hosting.js";
import { getCurrentIce, setCurrentIce, updateBreakerStrength } from "./ice.js";
import { cardInit, deactivate, resetCard } from "./initializing.js";
import { initMuCost } from "./memory.js";
import { resolveTrashPrevention } from "./prevention.js";
import { showPrompt, showWaitPrompt, clearWaitPrompt } from "./prompts.js";
import { systemMsg } from "./say.js";
import { update as updateCard } from "./update.js";
import { clearWin as checkWinByAgenda } from "./winning.js";
import { wait_for } from "../macros.js";
import {
  dissocIn, makeCID, makeTimestamp, removeOnce, sameCard, sameSide, toKeyword,
} from "../utils.js";

import { cardIndex, convertToAgenda, inPlayArea, move, peek, registerMoveStar, sameServer, shouldTrigger, trimCauseCard, typeToRigZone, updateCurrentIceToTrash, updateInstalledCardIndices } from './moving_1';

function getCardKeepSeen(state: GameState, c: Card): Card | null {
  const found = getCard(state, c);
  if (!found) return null;
  return { ...found, seen: c.seen };
}

interface TrashEffectArgs {
  accessed?: boolean;
  cause?: string;
  causeCard?: Card | null;
  hostTrashed?: boolean;
}

export function getTrashEffect(
  state: GameState, side: string, eid: EID, card: Card,
  args: TrashEffectArgs,
): Ability | null {
  const cdef = getCardDef(card);
  const trashEffect = (cdef as any)["on-trash"] as Ability | undefined;
  if (!card || card.disabled) return null;

  const okRunnerInstalled = isRunner(card) && isInstalled(card) && !isFacedown(card);
  const okRezzedNotHost = isRezzed(card) && !args.hostTrashed;
  const okWhenInactive = !!(trashEffect as any)?.["when-inactive"] && !args.hostTrashed;
  const okPlayArea = inPlayArea(card);

  if (!(okRunnerInstalled || okRezzedNotHost || okWhenInactive || okPlayArea)) return null;

  const triggers = shouldTrigger(state, side, eid, card,
    [{ card, cause: args.cause, "cause-card": trimCauseCard(args.causeCard), accessed: args.accessed }],
    trashEffect);
  if (!triggers) return null;

  const out: Ability = {
    ...(trashEffect as Ability),
    ...({ "once-per-instance": true, condition: "inactive" } as any),
  };
  return dissocReq(out);
}

// ---------------------------------------------------------------------------
// set-duration-on-trash-events
// ---------------------------------------------------------------------------

export function setDurationOnTrashEvents(
  state: GameState, card: Card, trashEvent: string,
): void {
  state.events = state.events.map((cur) => {
    if (sameCard(card, cur.card) && cur.event === trashEvent &&
        !isDisabledReg(state, card)) {
      return { ...cur, duration: trashEvent };
    }
    return cur;
  });
}

// ---------------------------------------------------------------------------
// get-trash-event
// ---------------------------------------------------------------------------

export function getTrashEvent(side: string, gameTrash?: boolean): string {
  if (gameTrash) return "game-trash";
  if (side === "corp") return "corp-trash";
  return "runner-trash";
}

// ---------------------------------------------------------------------------
// trash-cards
// ---------------------------------------------------------------------------

interface TrashCardsArgs extends TrashEffectArgs {
  keepServerAlive?: boolean;
  gameTrash?: boolean;
  suppressCheckpoint?: boolean;
  duringInstallation?: boolean;
  unpreventable?: boolean;
}

export function trashCards(
  state: GameState, side: string, eid: EID,
  cards: (Card | null | undefined)[],
  args: TrashCardsArgs = {},
): void {
  const filtered = (cards ?? []).filter(Boolean) as Card[];
  if (!filtered.length) {
    effectCompleted(state, side, eid);
    return;
  }

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: any) {
        const trashlist: Array<{ card: Card; destination?: string; "shuffle-rd"?: boolean }> =
          binds.asyncResult?.remaining ?? [];

        updateCurrentIceToTrash(s, trashlist.map((t) => t.card));

        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID) {
              const trashEvent = getTrashEvent(side, args.gameTrash);
              const moveCard = (card: Card, dest?: string) =>
                move(s2, toKeyword(card.side ?? ""), card, dest ?? "discard",
                  { keepServerAlive: args.keepServerAlive });

              const shouldShuffleRD = trashlist.some((t) => t["shuffle-rd"]);

              type MovedEntry = {
                movedCard?: Card | null;
                trashEffect?: Ability | null;
                oldCard: Card;
              };

              const movedCards: MovedEntry[] = [];
              for (const { card: rawCard, destination } of trashlist) {
                const card = getCardKeepSeen(s2, rawCard);
                if (!card) {
                  movedCards.push({ oldCard: rawCard });
                  continue;
                }
                setDurationOnTrashEvents(s2, card, trashEvent);
                const movedCard = moveCard(card, destination);
                const trashEffect = getTrashEffect(s2, side, eid, card, args);
                if (isInstalled(card)) {
                  updateInstalledCardIndices(s2, side, card.zone ?? []);
                }
                movedCards.push({ movedCard, trashEffect, oldCard: card });
              }

              if (shouldShuffleRD) {
                if ((s2 as any).access && s2.run) {
                  ((s2 as any).run as any)["shuffled-during-access"] = {
                    ...(((s2 as any).run as any)["shuffled-during-access"] ?? {}),
                    rd: true,
                  };
                }
                const stats = ((s2 as any).stats ??= {});
                const corpStats = (stats.corp ??= {});
                corpStats["shuffle-count"] = (corpStats["shuffle-count"] ?? 0) + 1;
                const deck = (s2.corp.deck ?? []).slice();
                for (let i = deck.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [deck[i], deck[j]] = [deck[j], deck[i]];
                }
                s2.corp.deck = deck;
                triggerEvent(s2, side, "corp-shuffle-deck", null);
              }

              const accessed = (s2 as any).access;
              if (accessed && trashlist.some((t) => sameCard(accessed, t.card)) && side === "runner") {
                ((s2.runner.register ??= {}) as any)["trashed-accessed-card"] = true;
              }
              if ((s2 as any).breach && accessed &&
                  trashlist.some((t) => sameCard(accessed, t.card)) && side === "runner") {
                ((s2 as any).breach as any)["did-trash"] = true;
              }
              const trashList = ((s2 as any).trash ??= {});
              const trashListCard = ((trashList["trash-list"] ??= {}) as any).card ??= {};
              delete trashListCard[eid.id];

              if (side) {
                const otherSides = trashlist
                  .map((t) => toKeyword(t.card.side ?? ""))
                  .filter((sd) => sd !== side);
                if (otherSides.length) {
                  const reg = ((s2 as any)[side].register ??= {});
                  reg["trashed-card"] = true;
                  if (args.accessed) reg["trashed-accessed-card"] = true;
                }
              }

              // Pseudo-shuffle archives: keep seen cards in play order, shuffle unseen.
              const discard = (s2.corp.discard ?? []).slice();
              discard.sort((a, b) => ((a as any).seen ? -1 : 1) - ((b as any).seen ? -1 : 1));
              s2.corp.discard = discard;

              const completionEid = makeResult(eid,
                movedCards.map((m) => m.movedCard).filter(Boolean));

              for (const { movedCard, trashEffect } of movedCards) {
                if (movedCard && trashEffect) {
                  registerPendingEvent(s2, trashEvent, movedCard, trashEffect);
                }
              }
              for (const { oldCard, movedCard } of movedCards) {
                queueEvent(s2, trashEvent, {
                  card: oldCard,
                  "moved-card": movedCard,
                  "during-installation": args.duringInstallation,
                  cause: args.cause,
                  "cause-card": trimCauseCard(args.causeCard),
                  accessed: args.accessed,
                } as any);
              }

              if (args.suppressCheckpoint) {
                effectCompleted(s2, "" as any, completionEid);
              } else {
                fakeCheckpoint(s2);
                effectCompleted(s2, "" as any, completionEid);
              }
            },
          ],
          [triggerEventSync, s, side, makeEID(state),
           "pre-trash-interrupt", trashlist.map((t) => t.card)],
          { eid },
        );
      },
    ],
    [resolveTrashPrevention, state, side, filtered, args],
    { eid },
  );
}

// :trash-cards
registerMoveStar("trash-cards", (state, side, eid, _action, cards, args) => {
  trashCards(state, side, eid, cards, args);
});

// ---------------------------------------------------------------------------
// trash (single)
// ---------------------------------------------------------------------------

export function trash(
  state: GameState, side: string, eid: EID, card: Card,
  args: TrashCardsArgs = {},
): void {
  trashCards(state, side, eid, [card], args);
}

// :trash
registerMoveStar("trash", (state, side, eid, _action, card, args) => {
  trashCards(state, side, eid, [card], args);
});

// ---------------------------------------------------------------------------
// mill / discard-from-hand
// ---------------------------------------------------------------------------

export function mill(
  state: GameState, fromSide: string, eid: EID, toSide: string, n: number,
  args: TrashCardsArgs = {},
): void {
  const deck = (state as any)[toSide]?.deck ?? [];
  const cards = deck.slice(0, n);
  trashCards(state, fromSide, eid, cards, { ...args, unpreventable: true });
}

export function discardFromHand(
  state: GameState, fromSide: string, eid: EID, toSide: string, n: number,
  args: TrashCardsArgs = {},
): void {
  const hand = ((state as any)[toSide]?.hand ?? []).slice();
  // shuffle
  for (let i = hand.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hand[i], hand[j]] = [hand[j], hand[i]];
  }
  const cards = hand.slice(0, n);
  trashCards(state, fromSide, eid, cards, { ...args, unpreventable: true });
}

// ---------------------------------------------------------------------------
// swap-legal? / swap-installed / swap-ice
// ---------------------------------------------------------------------------

export function swapLegal(
  state: GameState, _side: string, a: Card, b: Card,
): boolean {
  const pred = (c: Card) => isCorp(c) && isInstalled(c);
  const xor = (af: boolean, bf: boolean) => (af && !bf) || (bf && !af);

  if (!(pred(a) && pred(b))) return false;

  // No two assets/agendas in the same server
  if (xor(isAsset(a) || isAgenda(a), isAsset(b) || isAgenda(b))) {
    const asset = (isAsset(a) || isAgenda(a)) ? a : b;
    const nonAsset = (isAsset(a) || isAgenda(a)) ? b : a;
    if (sameServer(asset, nonAsset)) return true;
    const path = ["corp", ...(nonAsset.zone ?? [])];
    let cur: any = state;
    for (const k of path) cur = cur?.[k];
    const list: Card[] = Array.isArray(cur) ? cur : [];
    return !list.some((c) => isAsset(c) || isAgenda(c));
  }

  // No two regions in the same server
  const aRegion = hasSubtype(a, "Region");
  const bRegion = hasSubtype(b, "Region");
  if (xor(aRegion, bRegion)) {
    const region = aRegion ? a : b;
    const nonRegion = aRegion ? b : a;
    if (sameServer(region, nonRegion)) return true;
    const path = ["corp", ...(nonRegion.zone ?? [])];
    let cur: any = state;
    for (const k of path) cur = cur?.[k];
    const list: Card[] = Array.isArray(cur) ? cur : [];
    return !list.some((c) => hasSubtype(c, "Region"));
  }

  // Cannot swap ICE with a non-ICE card
  if (xor(isICE(a), isICE(b))) return false;

  return true;
}

export function swapInstalled(
  state: GameState, side: string, a: Card, b: Card,
): void {
  const pred = (c: Card) => isCorp(c) && isInstalled(c);
  if (!(pred(a) && pred(b) && swapLegal(state, side, a, b))) return;

  const aIndex = cardIndex(state, a) ?? 0;
  const bIndex = cardIndex(state, b) ?? 0;
  const aNew: Card = { ...a, zone: b.zone };
  const bNew: Card = { ...b, zone: a.zone };

  const setAt = (zone: Zone, idx: number, card: Card) => {
    const path = ["corp", ...zone.map(String)];
    let cur: any = state;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
    const key = path[path.length - 1];
    if (Array.isArray(cur[key])) cur[key][idx] = card;
  };
  setAt(a.zone ?? [], aIndex, bNew);
  setAt(b.zone ?? [], bIndex, aNew);

  updateInstalledCardIndices(state, "corp", a.zone ?? []);
  updateInstalledCardIndices(state, "corp", b.zone ?? []);

  for (const newCard of [aNew, bNew]) {
    unregisterEvents(state, side, newCard);
    unregisterStaticAbilities(state, side, newCard);
    if (isRezzed(newCard)) {
      registerDefaultEvents(state, side, newCard);
      registerStaticAbilities(state, side, newCard);
    } else {
      const dre = (getCardDef(newCard) as any)["derezzed-events"] as Ability[] | undefined;
      if (dre?.length) {
        registerEvents(state, side, newCard,
          dre.map((d) => ({ ...d, condition: "derezzed" } as any)));
      }
    }
    for (const h of (newCard.hosted ?? [])) {
      const newh: Card = {
        ...h,
        zone: ["onhost"],
        host: { ...(h.host as Card), zone: newCard.zone },
      };
      updateCard(state, side, (c: any) => c, newh);
      unregisterEvents(state, side, h);
      registerDefaultEvents(state, side, newh);
      unregisterStaticAbilities(state, side, h);
      registerStaticAbilities(state, side, newh);
      if (isProgram(newh)) (initMuCost as any)?.(state, newh);
    }
  }

  triggerEvent(state, side, "swap", {
    "swap-type": "installed",
    card1: aNew,
    card2: bNew,
  });
}

export function swapICE(
  state: GameState, side: string, a: Card, b: Card,
): void {
  const pred = (c: Card) => isCorp(c) && isInstalled(c) && isICE(c);
  if (!(pred(a) && pred(b))) return;
  swapInstalled(state, side, a, b);
  setCurrentIce(state);
}

// ---------------------------------------------------------------------------
// remove-from-currently-drawing / add-to-currently-drawing
// ---------------------------------------------------------------------------

export function removeFromCurrentlyDrawing(
  state: GameState, side: string, card: Card,
): void {
  const reg = (((state as any)[side].register ??= {}) as Record<string, unknown>);
  const mrd: Card[][] = (reg["currently-drawing"] as Card[][]) ?? [];
  if (!mrd.length) return;
  const tail = peek(mrd) ?? [];
  const newTail = removeOnce((c: Card) => c.cid === card.cid, tail);
  reg["currently-drawing"] = [...pop(mrd), newTail];
}

export function addToCurrentlyDrawing(
  state: GameState, side: string, card: Card,
): void {
  const reg = (((state as any)[side].register ??= {}) as Record<string, unknown>);
  const mrd: Card[][] = (reg["currently-drawing"] as Card[][]) ?? [];
  if (!mrd.length) {
    reg["currently-drawing"] = [[card]];
    return;
  }
  const tail = peek(mrd) ?? [];
  reg["currently-drawing"] = [...pop(mrd), [...tail, card]];
}

// ---------------------------------------------------------------------------
// swap-cards (one or both cards uninstalled)
// ---------------------------------------------------------------------------

export function swapCards(
  state: GameState, side: string, a: Card, b: Card,
): [Card | null, Card | null] | null {
  if (!sameSide(a.side ?? "", b.side ?? "")) return null;
  const aRefreshed = getCard(state, a) ?? a;
  const bRefreshed = getCard(state, b) ?? b;
  const aSide = toKeyword(aRefreshed.side ?? "");
  const bSide = toKeyword(bRefreshed.side ?? "");

  const movedA = move(state, aSide, aRefreshed, getZone(bRefreshed), {
    keepServerAlive: true,
    index: cardIndex(state, bRefreshed) ?? undefined,
    suppressEvent: true,
    swap: true,
  });
  const movedB = move(state, bSide, bRefreshed, getZone(aRefreshed), {
    keepServerAlive: true,
    index: cardIndex(state, aRefreshed) ?? undefined,
    suppressEvent: true,
    swap: true,
  });

  triggerEvent(state, side, "swap", {
    "swap-type": "not-installed",
    card1: movedA,
    card2: movedB,
  });

  for (const moved of [movedA, movedB]) {
    if (moved && isInstalled(moved)) {
      const cdef = getCardDef(moved);
      const dre = (cdef as any)["derezzed-events"] as Ability[] | undefined;
      updateCard(state, side, (c: any) => c, {
        ...moved, advanceable: (cdef as any).advanceable,
      });
      if (dre?.length) {
        registerEvents(state, side, moved,
          dre.map((d) => ({ ...d, condition: "derezzed" } as any)));
      }
    }
  }

  if (state.run && (isICE(aRefreshed) || isICE(bRefreshed))) {
    setCurrentIce(state);
  }

  const reg = (state as any)[side]?.register;
  const drawing: Card[][] | undefined = reg?.["currently-drawing"];
  if (drawing && peek(drawing)) {
    if (inHand(aRefreshed)) removeFromCurrentlyDrawing(state, aSide, aRefreshed);
    if (inHand(bRefreshed)) removeFromCurrentlyDrawing(state, bSide, bRefreshed);
    if (movedA && inHand(movedA)) addToCurrentlyDrawing(state, aSide, movedA);
    if (movedB && inHand(movedB)) addToCurrentlyDrawing(state, bSide, movedB);
  }

  return [getCard(state, movedA!), getCard(state, movedB!)];
}

// ---------------------------------------------------------------------------
// swap-agendas
// ---------------------------------------------------------------------------

export function swapAgendas(
  state: GameState, side: string, scored: Card, stolen: Card,
): [Card | null, Card | null] {
  const newStolen = move(state, "runner", scored, "scored");
  const newScored = move(state, "corp", stolen, "scored");
  unregisterEvents(state, side, stolen);
  unregisterStaticAbilities(state, side, stolen);
  if (newScored) {
    registerDefaultEvents(state, side, newScored);
    registerStaticAbilities(state, side, newScored);
  }
  if (!cardFlag(scored, "has-events-when-stolen", true) && newStolen) {
    deactivate(state, "corp", newStolen);
  }
  triggerEvent(state, side, "swap", {
    "swap-type": "agendas",
    card1: newStolen,
    card2: newScored,
  });
  updateAllAgendaPoints(state);
  checkWinByAgenda(state);
  return [getCard(state, newStolen!), getCard(state, newScored!)];
}

// ---------------------------------------------------------------------------
// as-agenda
// ---------------------------------------------------------------------------

export function asAgenda(
  state: GameState, side: string, card: Card, n: number,
): Card | null {
  let c = deactivate(state, side, card);
  c = convertToAgenda(c, n);
  const movedCard = move(state, side, c, "scored", { force: true });
  updateAllAgendaPoints(state);
  checkWinByAgenda(state);
  return movedCard;
}

// ---------------------------------------------------------------------------
// forfeit
// ---------------------------------------------------------------------------

export function forfeit(
  state: GameState, side: string, eid: EID, card: Card,
  opts: { msg?: boolean; suppressCheckpoint?: boolean } = { msg: true },
): void {
  const { msg = true, suppressCheckpoint } = opts;
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID) {
        const refreshed = getCard(s, card) ?? card;
        const forfeitEv = side === "corp" ? "corp-forfeit-agenda" : "runner-forfeit-agenda";
        const movedCard = move(s, toKeyword(refreshed.side ?? ""), refreshed, "rfg");
        if (msg) systemMsg(s, side, `forfeits ${getTitle(refreshed)}`);
        updateAllAgendaPoints(s);
        checkWinByAgenda(s);
        queueEvent(s, forfeitEv, { card: refreshed } as any);
        const onForfeit = (getCardDef(refreshed) as any)["on-forfeit"] as Ability | undefined;
        if (onForfeit && movedCard) {
          registerPendingEvent(s, forfeitEv, movedCard, { ...onForfeit, location: "rfg" } as any);
        }
        if (suppressCheckpoint) {
          completeWithResult(s, side, eid, movedCard);
        } else {
          fakeCheckpoint(s);
          completeWithResult(s, side, eid, movedCard);
        }
      },
    ],
    [trashCards, state, side, makeEIDFrom(state, eid),
     refreshHosted(state, card), {
       gameTrash: true,
       suppressCheckpoint: true,
       unpreventable: true,
     }],
    { eid },
  );
}

function refreshHosted(state: GameState, card: Card): Card[] {
  return (card.hosted ?? []);
}

// ---------------------------------------------------------------------------
// flip-facedown / flip-faceup
// ---------------------------------------------------------------------------

export function flipFacedown(
  state: GameState, side: string, card: Card,
): void {
  if (card.host) {
    const c = deactivate(state, side, card);
    const c2 = { ...c, facedown: true } as Card;
    updateCard(state, side, (x: any) => x, c2);
  } else {
    move(state, side, card, ["rig", "facedown"]);
  }
}

export function flipFaceup(
  state: GameState, side: string, card: Card,
): void {
  let c: Card | null;
  if (card.host) {
    const { facedown, ...rest } = card;
    c = rest as Card;
  } else {
    c = move(state, side, card, typeToRigZone(card.type));
  }
  if (!c) return;
  cardInit(state, side, c, { resolveEffect: false, initData: false });
  if (hasSubtype(c, "Icebreaker")) {
    updateBreakerStrength(state, side, c);
  }
}
