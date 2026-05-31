// Card moving: move, trash, swap, forfeit, mill, flip.
// Mirrors: src/clj/game/core/moving.clj

import type { GameState } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import type { Ability, ReqFn } from "./types";
import {
  isAgenda,
  isAsset,
  isCorp,
  isRunner,
  isICE,
  isProgram,
  isResource,
  isInstalled,
  isRezzed,
  isFacedown,
  hasSubtype,
  getZone,
  getTitle,
  inHand,
  TYPE_AGENDA,
  TYPE_COUNTER,
} from "./card";
import { getCardDef } from "./types";
import { updateAllAgendaPoints } from "./agendas";
import { allActiveInstalled } from "./board";
import {
  triggerEvent,
  triggerEventSync,
  registerEvents,
  registerDefaultEvents,
  unregisterEvents,
  registerPendingEvent,
  queueEvent,
  dissocReq,
} from "./engine";
import { registerStaticAbilities, unregisterStaticAbilities } from "./effects";
import { isDisabledReg } from "./effects";
import {
  effectCompleted,
  completeWithResult,
  makeEID,
  makeEIDFrom,
  makeResult,
} from "./eid";
import { fakeCheckpoint } from "./checkpoint";
import { getCard, getScoringOwner } from "./finding";
import {
  canTrash,
  cardFlag,
  untrashableWhileResources,
  untrashableWhileRezzed,
  zoneLocked,
} from "./flags";
import { remove as removeFromHost } from "./hosting";
import { getCurrentIce, setCurrentIce, updateBreakerStrength } from "./ice";
import { cardInit, deactivate, resetCard } from "./initializing";
import { initMuCost } from "./memory";
import { resolveTrashPrevention } from "./prevention";
import { showPrompt, showWaitPrompt, clearWaitPrompt } from "./prompts";
import { systemMsg } from "./say";
import { update as updateCard } from "./update";
import { checkWinByAgenda } from "./winning";
import { wait_for } from "../macros";
import {
  dissocIn,
  makeCID,
  makeTimestamp,
  removeOnce,
  sameCard,
  sameSide,
  toKeyword,
} from "../utils";

import {
  cardIndex,
  convertToAgenda,
  inPlayArea,
  move,
  peek,
  pop,
  registerMoveStar,
  sameServer,
  shouldTrigger,
  trimCauseCard,
  typeToRigZone,
  updateCurrentIceToTrash,
  updateInstalledCardIndices,
} from "./moving_1";

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
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  args: TrashEffectArgs,
): Ability | null {
  const cdef = getCardDef(card);
  const trashEffect = cdef["on-trash"] as Ability | undefined;
  if (!card || card.disabled) return null;

  const okRunnerInstalled =
    isRunner(card) && isInstalled(card) && !isFacedown(card);
  const okRezzedNotHost = isRezzed(card) && !args.hostTrashed;
  const okWhenInactive =
    !!trashEffect?.["when-inactive"] && !args.hostTrashed;
  const okPlayArea = inPlayArea(card);

  if (!(okRunnerInstalled || okRezzedNotHost || okWhenInactive || okPlayArea))
    return null;

  const triggers = shouldTrigger(
    state,
    side,
    eid,
    card,
    [
      {
        card,
        cause: args.cause,
        "cause-card": trimCauseCard(args.causeCard),
        accessed: args.accessed,
      },
    ],
    trashEffect,
  );
  if (!triggers) return null;

  const out: Ability = {
    ...(trashEffect as Ability),
    "once-per-instance": true,
    condition: "inactive",
  };
  return dissocReq(out);
}

// ---------------------------------------------------------------------------
// set-duration-on-trash-events
// ---------------------------------------------------------------------------

export function setDurationOnTrashEvents(
  state: GameState,
  card: Card,
  trashEvent: string,
): void {
  state.events = state.events.map((cur) => {
    if (
      sameCard(card, cur.card) &&
      cur.event === trashEvent &&
      !isDisabledReg(state, card)
    ) {
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
  "suppress-checkpoint"?: boolean;
  duringInstallation?: boolean;
  unpreventable?: boolean;
}

interface TrashListEntry {
  card: Card;
  destination?: string;
  "shuffle-rd"?: boolean;
}

type DynamicStats = Record<string, Record<string, number>>;
interface DynamicRun {
  "shuffled-during-access"?: { rd?: boolean; hq?: boolean; [k: string]: unknown };
  [k: string]: unknown;
}
interface DynamicState {
  access?: Card | null;
  stats?: DynamicStats;
  breach?: Record<string, unknown>;
  trash?: { "trash-list"?: { card?: Record<string, unknown> }; [k: string]: unknown };
}

export function trashCards(state: GameState, side: string, eid: EID, cards: (Card | null | undefined)[], args?: TrashCardsArgs): void;
export function trashCards(...rawArgs: unknown[]): void;
export function trashCards(...rawArgs: unknown[]): void {
  let state: GameState, side: string, eid: EID;
  let cards: (Card | null | undefined)[];
  let args: TrashCardsArgs = {};
  const arg2 = rawArgs[2] as { id?: unknown } | null | undefined;
  const arg0 = rawArgs[0] as { id?: unknown } | null | undefined;
  if (rawArgs.length >= 4 && typeof arg2 === "object" && arg2 !== null && "id" in arg2) {
    [state, side, eid, cards] = rawArgs as [GameState, string, EID, (Card | null | undefined)[]];
    args = (rawArgs[4] as TrashCardsArgs | undefined) ?? {};
  } else if (typeof arg0 === "object" && arg0 !== null && "id" in arg0) {
    // (eid, cards, opts) — legacy short form
    eid = rawArgs[0] as EID;
    cards = rawArgs[1] as (Card | null | undefined)[];
    args = (rawArgs[2] as TrashCardsArgs | undefined) ?? {};
    state = {} as GameState;
    side = "corp";
  } else {
    // (state, side, cards, opts) — legacy no-eid form
    state = rawArgs[0] as GameState;
    side = rawArgs[1] as string;
    cards = rawArgs[2] as (Card | null | undefined)[];
    args = (rawArgs[3] as TrashCardsArgs | undefined) ?? {};
    eid = { id: 0, source: null } as unknown as EID;
  }
  args = args ?? {};
  const filtered = (cards ?? []).filter(Boolean) as Card[];
  if (!filtered.length) {
    effectCompleted(state, side, eid);
    return;
  }

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: { asyncResult?: { remaining?: TrashListEntry[] } }) {
        const trashlist: TrashListEntry[] = binds.asyncResult?.remaining ?? [];

        updateCurrentIceToTrash(
          s,
          trashlist.map((t: TrashListEntry) => t.card),
        );

        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID) {
              const trashEvent = getTrashEvent(side, args.gameTrash);
              const moveCard = (card: Card, dest?: string) =>
                move(s2, toKeyword(card.side ?? ""), card, dest ?? "discard", {
                  keepServerAlive: args.keepServerAlive,
                });

              const shouldShuffleRD = trashlist.some((t: TrashListEntry) => t["shuffle-rd"]);

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

              const sExt = s2 as DynamicState;
              if (shouldShuffleRD) {
                if (sExt.access && s2.run) {
                  const runExt = s2.run as unknown as DynamicRun;
                  runExt["shuffled-during-access"] = {
                    ...(runExt["shuffled-during-access"] ?? {}),
                    rd: true,
                  };
                }
                const stats = (sExt.stats ??= {} as DynamicStats);
                const corpStats = (stats.corp ??= {} as Record<string, number>);
                corpStats["shuffle-count"] =
                  (corpStats["shuffle-count"] ?? 0) + 1;
                const deck = (s2.corp.deck ?? []).slice();
                for (let i = deck.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [deck[i], deck[j]] = [deck[j], deck[i]];
                }
                s2.corp.deck = deck;
                triggerEvent(s2, side, "corp-shuffle-deck", null);
              }

              const accessed = sExt.access;
              if (
                accessed &&
                trashlist.some((t: TrashListEntry) => sameCard(accessed, t.card)) &&
                side === "runner"
              ) {
                const reg = (s2.runner.register ??= {}) as Record<string, unknown>;
                reg["trashed-accessed-card"] = true;
              }
              if (
                sExt.breach &&
                accessed &&
                trashlist.some((t: TrashListEntry) => sameCard(accessed, t.card)) &&
                side === "runner"
              ) {
                (sExt.breach as Record<string, unknown>)["did-trash"] = true;
              }
              const trashList = (sExt.trash ??= {});
              const trashListMap = (trashList["trash-list"] ??= {}) as { card?: Record<string, unknown> };
              const trashListCard = (trashListMap.card ??= {});
              delete trashListCard[String(eid.id)];

              if (side) {
                const otherSides = trashlist
                  .map((t: TrashListEntry) => toKeyword(t.card.side ?? ""))
                  .filter((sd: string) => sd !== side);
                if (otherSides.length) {
                  const sidePlayer = s2[side === "corp" ? "corp" : "runner"];
                  const reg = (sidePlayer.register ??= {}) as Record<string, unknown>;
                  reg["trashed-card"] = true;
                  if (args.accessed) reg["trashed-accessed-card"] = true;
                }
              }

              // Pseudo-shuffle archives: keep seen cards in play order, shuffle unseen.
              const discard = (s2.corp.discard ?? []).slice();
              discard.sort(
                (a, b) =>
                  ((a as Card & { seen?: boolean }).seen ? -1 : 1) - ((b as Card & { seen?: boolean }).seen ? -1 : 1),
              );
              s2.corp.discard = discard;

              const completionEid = makeResult(
                eid,
                movedCards.map((m: MovedEntry) => m.movedCard).filter(Boolean),
              );

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
                });
              }

              if (args.suppressCheckpoint) {
                effectCompleted(s2, "", completionEid);
              } else {
                fakeCheckpoint(s2);
                effectCompleted(s2, "", completionEid);
              }
            },
          ],
          [
            triggerEventSync,
            s,
            side,
            makeEID(state),
            "pre-trash-interrupt",
            trashlist.map((t: TrashListEntry) => t.card),
          ],
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

export function trash(state: GameState, side: string, eid: EID, card: Card, args?: TrashCardsArgs): void;
export function trash(...rawArgs: unknown[]): void;
export function trash(...rawArgs: unknown[]): void {
  let state: GameState, side: string, eid: EID, card: Card;
  let args: TrashCardsArgs = {};
  const arg2 = rawArgs[2] as { id?: unknown; cid?: unknown } | null | undefined;
  if (rawArgs.length >= 4 && typeof arg2 === "object" && arg2 !== null && "id" in arg2) {
    [state, side, eid, card] = rawArgs as [GameState, string, EID, Card];
    args = (rawArgs[4] as TrashCardsArgs | undefined) ?? {};
  } else if (rawArgs.length >= 3 && typeof arg2 === "object" && arg2 !== null && "cid" in arg2) {
    // (state, side, card, opts)
    state = rawArgs[0] as GameState;
    side = rawArgs[1] as string;
    card = rawArgs[2] as Card;
    args = (rawArgs[3] as TrashCardsArgs | undefined) ?? {};
    eid = { id: 0, source: card } as unknown as EID;
  } else {
    [state, side, eid, card] = rawArgs as [GameState, string, EID, Card];
    args = (rawArgs[4] as TrashCardsArgs | undefined) ?? {};
  }
  args = args ?? {};
  trashCards(state, side, eid, [card], args);
}

// :trash
registerMoveStar("trash", (state, side, eid, _action, card, args) => {
  trashCards(state, side, eid, [card], args);
});

// ---------------------------------------------------------------------------
// mill / discard-from-hand
// ---------------------------------------------------------------------------

export function mill(fromSide: string, eid: EID, toSide: string, n: number): void;
export function mill(state: GameState, fromSide: string, toSide: string, n: number): void;
export function mill(state: GameState, fromSide: string, eid: EID, n: number): void;
export function mill(state: GameState, fromSide: string, eid: EID, toSide: string, n: number, args?: TrashCardsArgs): void;
export function mill(...rawArgs: unknown[]): void {
  let state: GameState, fromSide: string, eid: EID, toSide: string, n: number;
  let args: TrashCardsArgs = {};
  // 4-arg w/o state: (fromSide, eid, toSide, n) — no-op
  if (rawArgs.length === 4 && typeof rawArgs[0] === "string") {
    return;
  }
  // 4-arg w/ state and without eid: (state, fromSide, toSide, n) — synthesize eid
  // OR (state, fromSide, eid, n) — derive toSide from fromSide
  if (rawArgs.length === 4 && typeof rawArgs[0] === "object") {
    state = rawArgs[0] as GameState;
    fromSide = rawArgs[1] as string;
    const third = rawArgs[2];
    if (typeof third === "string") {
      toSide = third;
      n = rawArgs[3] as number;
      eid = makeEID(state);
    } else {
      // third is eid
      eid = third as EID;
      n = rawArgs[3] as number;
      toSide = fromSide;
    }
  } else {
    state = rawArgs[0] as GameState;
    fromSide = rawArgs[1] as string;
    eid = rawArgs[2] as EID;
    toSide = rawArgs[3] as string;
    n = rawArgs[4] as number;
    args = (rawArgs[5] as TrashCardsArgs | undefined) ?? {};
  }
  const sideKey: "corp" | "runner" = toSide === "corp" ? "corp" : "runner";
  const deck = state[sideKey]?.deck ?? [];
  const cards = deck.slice(0, n);
  trashCards(state, fromSide, eid, cards as Card[], { ...args, unpreventable: true });
}

export function discardFromHand(
  state: GameState,
  fromSide: string,
  eid: EID,
  toSide: string,
  n: number,
  args: TrashCardsArgs = {},
): void {
  const sideKey: "corp" | "runner" = toSide === "corp" ? "corp" : "runner";
  const hand: Card[] = (state[sideKey]?.hand ?? []).slice();
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
  state: GameState,
  _side: string,
  a: Card,
  b: Card,
): boolean {
  const pred = (c: Card) => isCorp(c) && isInstalled(c);
  const xor = (af: boolean, bf: boolean) => (af && !bf) || (bf && !af);

  if (!(pred(a) && pred(b))) return false;

  const walkToList = (path: Array<string | number | string[]>): Card[] => {
    let cur: unknown = state;
    for (const k of path) cur = (cur as Record<string, unknown> | null)?.[String(k)];
    return Array.isArray(cur) ? (cur as Card[]) : [];
  };

  // No two assets/agendas in the same server
  if (xor(isAsset(a) || isAgenda(a), isAsset(b) || isAgenda(b))) {
    const asset = isAsset(a) || isAgenda(a) ? a : b;
    const nonAsset = isAsset(a) || isAgenda(a) ? b : a;
    if (sameServer(asset, nonAsset)) return true;
    const list = walkToList(["corp", ...(nonAsset.zone ?? [])]);
    return !list.some((c: Card) => isAsset(c) || isAgenda(c));
  }

  // No two regions in the same server
  const aRegion = !!hasSubtype(a, "Region");
  const bRegion = !!hasSubtype(b, "Region");
  if (xor(aRegion, bRegion)) {
    const region = aRegion ? a : b;
    const nonRegion = aRegion ? b : a;
    if (sameServer(region, nonRegion)) return true;
    const list = walkToList(["corp", ...(nonRegion.zone ?? [])]);
    return !list.some((c: Card) => hasSubtype(c, "Region"));
  }

  // Cannot swap ICE with a non-ICE card
  if (xor(isICE(a), isICE(b))) return false;

  return true;
}

export function swapInstalled(
  state: GameState,
  side: string,
  a: Card,
  b: Card,
): void {
  const pred = (c: Card) => isCorp(c) && isInstalled(c);
  if (!(pred(a) && pred(b) && swapLegal(state, side, a, b))) return;

  const aIndex = cardIndex(state, a) ?? 0;
  const bIndex = cardIndex(state, b) ?? 0;
  const aNew: Card = { ...a, zone: b.zone };
  const bNew: Card = { ...b, zone: a.zone };

  const setAt = (zone: Zone, idx: number, card: Card) => {
    const path = ["corp", ...zone.map(String)];
    let cur: Record<string, unknown> = state as unknown as Record<string, unknown>;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] as Record<string, unknown>;
    const key = path[path.length - 1];
    if (Array.isArray(cur[key])) (cur[key] as Card[])[idx] = card;
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
      const dre = getCardDef(newCard)["derezzed-events"] as
        | Ability[]
        | undefined;
      if (dre?.length) {
        registerEvents(
          state,
          side,
          newCard,
          dre.map((d: Ability) => ({ ...d, condition: "derezzed" })),
        );
      }
    }
    for (const h of newCard.hosted ?? []) {
      const newh: Card = {
        ...h,
        zone: ["onhost"],
        host: { ...(h.host as Card), zone: newCard.zone },
      };
      updateCard(state, side, newh);
      unregisterEvents(state, side, h);
      registerDefaultEvents(state, side, newh);
      unregisterStaticAbilities(state, side, h);
      registerStaticAbilities(state, side, newh);
      if (isProgram(newh)) {
        const initFn = initMuCost as ((s: GameState, c: Card) => void) | undefined;
        initFn?.(state, newh);
      }
    }
  }

  triggerEvent(state, side, "swap", {
    "swap-type": "installed",
    card1: aNew,
    card2: bNew,
  });
}

export function swapICE(a: Card, b: Card): void;
export function swapICE(state: GameState, side: string, a: Card, b: Card): void;
export function swapICE(
  stateOrA?: GameState | Card,
  sideOrB?: string | Card,
  a?: Card,
  b?: Card,
): void {
  let state: GameState, side: string, ac: Card, bc: Card;
  if (a === undefined) {
    // 2-arg form: no state, no-op
    return;
  } else {
    state = stateOrA as GameState;
    side = sideOrB as string;
    ac = a;
    bc = b as Card;
  }
  const pred = (c: Card) => isCorp(c) && isInstalled(c) && isICE(c);
  if (!(pred(ac) && pred(bc))) return;
  swapInstalled(state, side, ac, bc);
  setCurrentIce(state);
}

// ---------------------------------------------------------------------------
// remove-from-currently-drawing / add-to-currently-drawing
// ---------------------------------------------------------------------------

export function removeFromCurrentlyDrawing(
  state: GameState,
  side: string,
  card: Card,
): void {
  const sidePlayer = state[side === "corp" ? "corp" : "runner"];
  const reg = (sidePlayer.register ??= {}) as Record<string, unknown>;
  const mrd: Card[][] = (reg["currently-drawing"] as Card[][]) ?? [];
  if (!mrd.length) return;
  const tail = peek(mrd) ?? [];
  const newTail = removeOnce((c: Card) => c.cid === card.cid, tail);
  reg["currently-drawing"] = [...pop(mrd), newTail];
}

export function addToCurrentlyDrawing(
  state: GameState,
  side: string,
  card: Card,
): void {
  const sidePlayer = state[side === "corp" ? "corp" : "runner"];
  const reg = (sidePlayer.register ??= {}) as Record<string, unknown>;
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
  state: GameState,
  side: string,
  a: Card,
  b: Card,
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
      const dre = cdef["derezzed-events"] as Ability[] | undefined;
      updateCard(state, side, {
        ...moved,
        advanceable: cdef.advanceable as Card["advanceable"],
      });
      if (dre?.length) {
        registerEvents(
          state,
          side,
          moved,
          dre.map((d: Ability) => ({ ...d, condition: "derezzed" })),
        );
      }
    }
  }

  if (state.run && (isICE(aRefreshed) || isICE(bRefreshed))) {
    setCurrentIce(state);
  }

  const sidePlayer = state[side === "corp" ? "corp" : "runner"];
  const reg = sidePlayer?.register;
  const drawing: Card[][] | undefined = reg?.["currently-drawing"] as Card[][] | undefined;
  if (drawing && peek(drawing)) {
    if (inHand(aRefreshed))
      removeFromCurrentlyDrawing(state, aSide, aRefreshed);
    if (inHand(bRefreshed))
      removeFromCurrentlyDrawing(state, bSide, bRefreshed);
    if (movedA && inHand(movedA)) addToCurrentlyDrawing(state, aSide, movedA);
    if (movedB && inHand(movedB)) addToCurrentlyDrawing(state, bSide, movedB);
  }

  return [getCard(state, movedA!), getCard(state, movedB!)];
}

// ---------------------------------------------------------------------------
// swap-agendas
// ---------------------------------------------------------------------------

export function swapAgendas(scored: Card, stolen: Card): [Card | null, Card | null];
export function swapAgendas(state: GameState, side: string, scored: Card, stolen: Card): [Card | null, Card | null];
export function swapAgendas(...args: unknown[]): [Card | null, Card | null] {
  if (args.length === 2) {
    // shorthand (scored, stolen) — no state, return cards unchanged
    return [args[0] as Card, args[1] as Card];
  }
  const state = args[0] as GameState;
  const side = args[1] as string;
  const scored = args[2] as Card;
  const stolen = args[3] as Card;
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
  state: GameState,
  side: string,
  card: Card | null,
  n: number,
): Card | null {
  if (!card) return null;
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

interface ForfeitOpts {
  msg?: boolean;
  suppressCheckpoint?: boolean;
  'suppress-checkpoint'?: boolean;
  [k: string]: unknown;
}

export function forfeit(state: GameState, side: string, card: Card): void;
export function forfeit(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  opts?: ForfeitOpts,
): void;
export function forfeit(...args: unknown[]): void {
  let state: GameState, side: string, eid: EID, card: Card;
  let opts: ForfeitOpts = { msg: true };
  if (args.length === 3) {
    [state, side, card] = args as [GameState, string, Card];
    eid = makeEID(state);
  } else {
    [state, side, eid, card] = args as [GameState, string, EID, Card];
    opts = (args[4] as ForfeitOpts | undefined) ?? { msg: true };
  }
  const { msg = true } = opts;
  const suppressCheckpoint = opts.suppressCheckpoint ?? opts['suppress-checkpoint'];
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID) {
        const refreshed = getCard(s, card) ?? card;
        const forfeitEv =
          side === "corp" ? "corp-forfeit-agenda" : "runner-forfeit-agenda";
        const movedCard = move(
          s,
          toKeyword(refreshed.side ?? ""),
          refreshed,
          "rfg",
        );
        if (msg) systemMsg(s, side, `forfeits ${getTitle(refreshed)}`);
        updateAllAgendaPoints(s);
        checkWinByAgenda(s);
        queueEvent(s, forfeitEv, { card: refreshed });
        const onForfeit = getCardDef(refreshed)["on-forfeit"] as
          | Ability
          | undefined;
        if (onForfeit && movedCard) {
          registerPendingEvent(s, forfeitEv, movedCard, {
            ...onForfeit,
            location: "rfg",
          });
        }
        if (suppressCheckpoint) {
          completeWithResult(s, side, eid, movedCard);
        } else {
          fakeCheckpoint(s);
          completeWithResult(s, side, eid, movedCard);
        }
      },
    ],
    [
      trashCards,
      state,
      side,
      makeEIDFrom(state, eid),
      refreshHosted(state, card),
      {
        gameTrash: true,
        suppressCheckpoint: true,
        unpreventable: true,
      },
    ],
    { eid },
  );
}

function refreshHosted(state: GameState, card: Card): Card[] {
  return card.hosted ?? [];
}

// ---------------------------------------------------------------------------
// flip-facedown / flip-faceup
// ---------------------------------------------------------------------------

export function flipFacedown(state: GameState, side: string, card: Card): void {
  if (card.host) {
    const c = deactivate(state, side, card);
    const c2 = { ...c, facedown: true } as Card;
    updateCard(state, side, c2);
  } else {
    move(state, side, card, ["rig", "facedown"]);
  }
}

export function flipFaceup(state: GameState, side: string, card: Card): void {
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
