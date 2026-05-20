// Card moving: move, trash, swap, forfeit, mill, flip.
// Mirrors: src/clj/game/core/moving.clj

import type { GameState } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import type { Ability, Counter, ReqFn } from "./types.ts";
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
import { getCardDef } from "./types.ts";
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
import { isDisabledReg, registerStaticAbilities, unregisterStaticAbilities } from "./effects";
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
import { clearWin as checkWinByAgenda } from "./winning";
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

import { trash } from "./moving_2";

// ---------------------------------------------------------------------------
// Local helpers (analogues of Clojure utilities not yet in TS modules)
// ---------------------------------------------------------------------------

/** Returns the card's zone, treating a hosted card as if its host's zone is its zone. */
function effectiveZone(card: Card): Zone {
  if (card.host) {
    const hz = card.host.zone ?? [];
    return hz.map((s: any) => toKeyword(s));
  }
  return card.zone ?? [];
}

/** Returns the zero-based index of the card in its server's content/ices.
 *  Mirrors `card-index` in card.cljc. */
export function cardIndex(state: GameState, card: Card): number | null {
  if (typeof card.index === "number") return card.index;
  const z = getZone(card);
  // Get-in (cons :corp z)
  let cur: any = state.corp;
  for (const k of z) cur = cur?.[k];
  if (!Array.isArray(cur)) return null;
  const idx = cur.findIndex((c: Card) => sameCard(c, card));
  return idx === -1 ? null : idx;
}

/** Mirrors `medley.core/insert-nth`. Returns a new array with `value` inserted at `idx`. */
function insertNth<T>(idx: number, value: T, coll: T[]): T[] {
  const out = coll.slice();
  out.splice(idx, 0, value);
  return out;
}

/** Mirrors `condition-counter?`. */
function isConditionCounter(card: Card | null): boolean {
  return card?.type === TYPE_COUNTER;
}

/** Mirrors `fake-identity?`. */
function isFakeIdentity(card: Card | null): boolean {
  return card?.type === "Fake-Identity";
}

/** Mirrors `in-play-area?`. */
export function inPlayArea(card: Card | null): boolean {
  return getZone(card)[0] === "play-area";
}

/** Mirrors `convert-to-agenda` from card.cljc. */
export function convertToAgenda(card: Card, n: number): Card {
  return {
    cid: card.cid,
    code: card.code,
    host: card.host,
    hosted: card.hosted,
    implementation: card.implementation,
    printedTitle: card.title,
    side: card.side,
    type: TYPE_AGENDA,
    zone: card.zone,
    agendapoints: n,
  } as Card;
}

/** Mirrors `target-server` for the active run (returns the server name as kw). */
function targetServer(
  run: { server?: string[] } | null | undefined,
): string | null {
  return run?.server?.[0] ?? null;
}

/** Mirrors `same-server?` — true if both cards live in the same Corp server. */
export function sameServer(a: Card, b: Card): boolean {
  const za = a.zone ?? [];
  const zb = b.zone ?? [];
  if (za.length < 2 || zb.length < 2) return false;
  return za[0] === zb[0] && za[1] === zb[1];
}

/** Mirrors `is-remote?` — a zone is remote if it starts with [:servers, :remoteN]. */
function isRemoteZone(zone: Zone): boolean {
  if (zone.length < 2) return false;
  return zone[0] === "servers" && /^remote/i.test(String(zone[1]));
}

/** Mirrors `type->rig-zone` from servers.clj — maps card type to rig sub-zone. */
export function typeToRigZone(cardType: string | undefined): Zone {
  switch (cardType) {
    case "Hardware":
      return ["rig", "hardware"];
    case "Program":
      return ["rig", "program"];
    case "Resource":
      return ["rig", "resource"];
    default:
      return ["rig", "facedown"];
  }
}

/** Local should-trigger? helper — engine.ts only exports canTrigger which adds the once-check.
 *  For trash-effect filtering we want a pure :req gate without :once. */
export function shouldTrigger(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: unknown[],
  ability: Ability | undefined,
): boolean {
  if (!ability) return false;
  if (ability.req) {
    if (typeof ability.req !== "function") return !!ability.req;
    return (ability.req as (...a: any[]) => any)(state, side, eid, card, targets as Card[]);
  }
  return true;
}

/** Mirrors `active?` from card.cljc — a card receives events. */
function isActive(card: Card | null): boolean {
  if (!card) return false;
  if (card.type === "Basic Action") return true;
  if (
    (card.type === "Identity" || card.type === "Fake-Identity") &&
    !isFacedown(card)
  )
    return true;
  const z = getZone(card);
  if (z[0] === "play-area" || z[0] === "current" || z[0] === "scored")
    return true;
  if (card.type === "Counter") return true;
  if (isCorp(card) && isInstalled(card) && isRezzed(card)) return true;
  if (isRunner(card) && isInstalled(card) && !isFacedown(card)) return true;
  return false;
}

/** Setter on side.register.currentlyDrawing (last element of the queue). */
export function pop<T>(arr: T[]): T[] {
  return arr.slice(0, -1);
}
export function peek<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

// ---------------------------------------------------------------------------
// trim-cause-card
// ---------------------------------------------------------------------------

/** Strips cause-card down to just keys used by its handlers. */
export function trimCauseCard(
  card: Card | null | undefined,
): Partial<Card> | null {
  if (!card) return null;
  return { cid: card.cid, name: (card as any).name, side: card.side };
}

// ---------------------------------------------------------------------------
// Helpers for move
// ---------------------------------------------------------------------------

/** Removes the old pre-move card from the game state, for use in move. */
function removeOldCard(state: GameState, side: string, card: Card): void {
  const zone = card.zone ?? [];
  for (const s of ["runner", "corp"] as const) {
    if (card.host) {
      removeFromHost(state, side, card);
    } else {
      const path = [s as string, ...zone.map((z: any) => String(z))];
      // Walk into state with a mutable reference and replace the leaf list.
      let cur: any = state;
      for (let i = 0; i < path.length - 1; i++) {
        if (cur == null) break;
        cur = cur[path[i]];
      }
      if (cur && Array.isArray(cur[path[path.length - 1]])) {
        cur[path[path.length - 1]] = removeOnce(
          (c: Card) => sameCard(c, card),
          cur[path[path.length - 1]],
        );
      }
    }
  }
}

/** Triggers :uninstall effects. */
export function uninstall(
  state: GameState,
  side: string,
  card: Card,
  oldCard: Card,
): Card {
  const cdef = getCardDef(card);
  const uninstallEffect = (cdef as any).uninstall as
    | ((s: GameState, sd: string, eid: EID, c: Card, t: unknown[]) => void)
    | undefined;
  if (uninstallEffect && !card.disabled) {
    uninstallEffect(state, side, makeEID(state), card, [
      { "old-card": oldCard },
    ]);
  }
  return card;
}

/** Mirrors `should-moved-card-be-known?`. */
function shouldMovedCardBeKnown(
  state: GameState,
  side: string,
  card: Card,
  to: string | Zone,
): boolean {
  const target = Array.isArray(to) ? to[0] : to;
  if (target !== "discard" || side !== "corp") return false;
  if (sameCard(card, (state as any).access)) return true;

  const z = getZone(card);
  const top = z[0];
  const fromZone =
    top === "discard" || top === "deck" || top === "hand" ? top : z[1];
  const known = (state as any).breach?.["known-cids"]?.[fromZone];
  if (!Array.isArray(known)) return false;
  return known.includes(card.cid);
}

// ---------------------------------------------------------------------------
// get-moved-card
// ---------------------------------------------------------------------------

interface MoveCardOpts {
  front?: boolean;
  index?: number;
  keepServerAlive?: boolean;
  force?: boolean;
  suppressEvent?: boolean;
  shuffled?: boolean;
  swap?: boolean;
}

function getMovedCard(
  state: GameState,
  side: string,
  card: Card,
  to: string | Zone,
): Card {
  const zone = card.host
    ? (card.host.zone ?? []).map((z: any) => toKeyword(z))
    : (card.zone ?? []);
  const srcZone = zone[0];
  const targetZone = Array.isArray(to) ? to[0] : to;
  const sameZone = srcZone === targetZone;
  const dest: Zone = Array.isArray(to) ? to.slice() : [to];
  const toFacedown =
    dest.length === 2 && dest[0] === "rig" && dest[1] === "facedown";
  const toInstalled = dest[0] === "servers" || dest[0] === "rig";
  const fromInstalled = srcZone === "servers" || srcZone === "rig";

  const trashHosted = (h: Card): null => {
    moveStar(
      state,
      "" as any,
      makeEID(state),
      "trash" as any,
      { ...h, zone: (h.zone ?? []).map((z: any) => toKeyword(z)) },
      {
        unpreventable: true,
        suppressCheckpoint: true,
        hostTrashed: true,
        gameTrash: true,
      },
    );
    return null;
  };

  const updateHostedCard = (h: Card): Card[] => {
    const newz = ([] as string[]).concat(
      ...dest.map((d: any) => (Array.isArray(d) ? d : [d])),
    );
    const newh: Card = {
      ...h,
      zone: ["onhost"],
      host: { ...(h.host as Card), zone: newz },
    };
    updateCard(state, side, newh);
    if (isActive(newh)) {
      unregisterEvents(state, side, h);
      registerDefaultEvents(state, side, newh);
      unregisterStaticAbilities(state, side, h);
      registerStaticAbilities(state, side, newh);
      if (isProgram(newh)) {
        (initMuCost as any)?.(state, newh);
      }
    }
    return [newh];
  };

  const hostedRaw = card.hosted ?? [];
  const hostedFn = sameZone ? updateHostedCard : trashHosted;
  const hosted: Card[] = [];
  for (const h of hostedRaw) {
    const result = hostedFn(h);
    if (Array.isArray(result)) hosted.push(...result);
  }

  // Set :seen correctly
  let c: Card = card;
  if (side === "corp") {
    if (dest[0] === "discard" && (isRezzed(card) || isConditionCounter(card))) {
      c = { ...c, seen: true };
    } else if (dest[0] === "hand" || dest[0] === "deck") {
      const { seen, ...rest } = c;
      c = rest as Card;
    } else if (shouldMovedCardBeKnown(state, side, card, dest[0])) {
      c = { ...c, seen: true };
    }
  }

  // Deactivate when leaving installed/active zones to inactive ones
  const stolenAgendaCase =
    getScoringOwner(state, card) === "runner" &&
    srcZone === "scored" &&
    (targetZone === "hand" ||
      targetZone === "deck" ||
      targetZone === "discard" ||
      targetZone === "rfg");

  const goingInactive =
    targetZone === "hand" ||
    targetZone === "deck" ||
    targetZone === "discard" ||
    targetZone === "rfg" ||
    toFacedown;

  const wasActiveZone =
    card.installed ||
    card.host ||
    srcZone === "servers" ||
    srcZone === "scored" ||
    srcZone === "current" ||
    srcZone === "play-area";

  if (!stolenAgendaCase && wasActiveZone && goingInactive && !isFacedown(c)) {
    c = deactivate(state, side, c);
  }

  if (fromInstalled && !isFacedown(c)) {
    c = uninstall(state, side, c, card);
  }

  if (toInstalled) {
    c = { ...c, installed: true, installedThisTurn: true } as Card;
    (c as any).installed = "this-turn";
  } else {
    const { installed, ...rest } = c;
    c = rest as Card;
  }

  if (toFacedown) {
    c = { ...c, facedown: true };
  } else {
    const { facedown, ...rest } = c;
    c = rest as Card;
  }

  if (dest[0] === "scored") {
    (c as any)["scored-side"] = side;
  }

  const isHubZone = (z: string | undefined) =>
    z === "deck" || z === "hand" || z === "discard";

  const isFromHub = isHubZone(srcZone);
  const isToHub = isHubZone(targetZone);

  const cid = !isFromHub && isToHub ? makeCID() : c.cid;
  const timestamp =
    (!isFromHub && isToHub) || (!card.installed && toInstalled)
      ? makeTimestamp().getTime()
      : c.timestamp;

  let movedCard: Card = {
    ...c,
    zone: dest,
    host: null,
    hosted,
    cid,
    timestamp,
    previousZone: c.zone,
  };

  // Set up abilities for stolen agendas
  if (
    dest[0] === "scored" &&
    cardFlag(movedCard, "has-abilities-when-stolen", true)
  ) {
    const cdef = getCardDef(movedCard);
    movedCard = { ...movedCard, abilities: cdef.abilities };
  }

  return movedCard;
}

// ---------------------------------------------------------------------------
// update-effects
// ---------------------------------------------------------------------------

/** If a card's cid is unchanged, update its reference inside any matching :effects;
 *  otherwise drop while-active effects bound to the old card. */
function updateEffects(state: GameState, card: Card, movedCard: Card): void {
  if (card.cid === movedCard.cid) {
    state.effects = state.effects.map((eff: any) => {
      if (eff.card?.cid === card.cid) {
        return { ...eff, card: movedCard };
      }
      return eff;
    });
  } else {
    state.effects = state.effects.filter(
      (eff) => !(sameCard(card, eff.card) && eff.duration === "while-active"),
    );
  }
}

// ---------------------------------------------------------------------------
// update-installed-card-indices
// ---------------------------------------------------------------------------

export function updateInstalledCardIndices(
  state: GameState,
  side: string,
  server: Zone,
): void {
  const path = [side, ...server.map(String)];
  let parent: any = state;
  for (let i = 0; i < path.length - 1; i++) {
    parent = parent?.[path[i]];
    if (parent == null) return;
  }
  const key = path[path.length - 1];
  const list = parent?.[key];
  if (!Array.isArray(list) || list.length === 0) return;
  parent[key] = list.map((c: Card, idx: number) => ({ ...c, index: idx }));
}

// ---------------------------------------------------------------------------
// update-run-position
// ---------------------------------------------------------------------------

/** If there is an active run, update Runner's position when ICE moves to/from
 *  an inward position. */
function updateRunPosition(
  state: GameState,
  oldCard: Card,
  movedCard: Card,
): void {
  const run = state.run;
  if (!run) return;
  const position = run.position;
  if (typeof position !== "number" || position <= 0) return;

  const protectingRunServer = (c: Card): boolean => {
    if (!isICE(c)) return false;
    const z = c.zone ?? [];
    return z[1] === targetServer(run as any) && z[z.length - 1] === "ices";
  };
  const inward = (c: Card): boolean =>
    typeof c.index === "number" && c.index < position;

  if (protectingRunServer(oldCard) && inward(oldCard)) {
    state.run!.position = position - 1;
  } else if (protectingRunServer(movedCard) && inward(movedCard)) {
    state.run!.position = position + 1;
  }
}

// ---------------------------------------------------------------------------
// move
// ---------------------------------------------------------------------------

export function move(card: any, to: any, opts?: any): any;
export function move(
  state: any,
  side: any,
  card: any,
  to?: any,
  opts?: any,
): any;
export function move(
  stateArg: GameState | Card,
  sideArg: string | Card | string | Zone,
  cardArg?: Card | string | Zone,
  toArg?: string | Zone | MoveCardOpts | null,
  optsArg: MoveCardOpts | null = {},
): Card | null {
  // 2/3-arg shorthand (card, to, opts?): no state, no-op
  if (cardArg === undefined || (typeof (stateArg as any)?.cid === "string")) {
    return null;
  }
  // 4-5 arg standard form
  const state = stateArg as GameState;
  const side = sideArg as string;
  const card = cardArg as Card;
  const to = toArg as string | Zone;
  const opts: MoveCardOpts = (optsArg ?? {}) as MoveCardOpts;
  const {
    front,
    index,
    keepServerAlive,
    force,
    suppressEvent,
    shuffled,
    swap,
  } = opts;
  const zone = card.host
    ? (card.host.zone ?? []).map((z: any) => toKeyword(z))
    : (card.zone ?? []);

  if (isFakeIdentity(card)) {
    deactivate(state, side, card);
    removeOldCard(state, side, card);
    return null;
  }

  // Card must exist either as hosted or in a known zone slot.
  const corpZone = (() => {
    let cur: any = state;
    for (const k of ["corp", ...zone.map(String)]) cur = cur?.[k];
    return Array.isArray(cur) ? cur : [];
  })();
  const runnerZone = (() => {
    let cur: any = state;
    for (const k of ["runner", ...zone.map(String)]) cur = cur?.[k];
    return Array.isArray(cur) ? cur : [];
  })();

  const presentSomewhere =
    !!card.host ||
    runnerZone.some((c: Card) => sameCard(c, card)) ||
    corpZone.some((c: Card) => sameCard(c, card));

  const cardSideKw = toKeyword(card.side ?? "");
  const lockOk = force || !zoneLocked(state, cardSideKw, getZone(card)[0]);

  if (!presentSomewhere || !lockOk) return null;

  const cdef = getCardDef(card);
  const dest: Zone = Array.isArray(to) ? to.slice() : [to];
  const destReplacementFn = (cdef as any)["move-zone-replacement"] as
    | ((
        s: GameState,
        sd: string,
        eid: EID,
        c: Card,
        t: unknown[],
      ) => Zone | null | undefined)
    | undefined;
  const destReplacement = destReplacementFn
    ? destReplacementFn(state, side, makeEID(state), card, [
        { card, "target-zone": dest, shuffled },
      ])
    : null;
  const finalDest: Zone = destReplacement ?? dest;
  const moveTarget = destReplacement ? finalDest[finalDest.length - 1] : to;

  const movedCard = getMovedCard(state, side, card, moveTarget);
  updateEffects(state, card, movedCard);
  removeOldCard(state, side, card);

  // Splice the moved card into its new zone slot
  const sidePath = [side, ...finalDest.map(String)];
  let parent: any = state;
  for (let i = 0; i < sidePath.length - 1; i++) parent = parent[sidePath[i]];
  const key = sidePath[sidePath.length - 1];
  const list: Card[] = Array.isArray(parent[key]) ? parent[key] : [];
  const posToMoveTo =
    typeof index === "number" ? index : front ? 0 : list.length;
  parent[key] = insertNth(posToMoveTo, movedCard, list);

  if (zone.length) updateInstalledCardIndices(state, side, zone);
  updateInstalledCardIndices(state, side, finalDest);

  if (!swap)
    updateRunPosition(state, card, getCard(state, movedCard) ?? movedCard);

  // Clean up empty remote server records
  const z2: Zone = ["corp", ...zone.slice(0, -1).map(String)];
  if (
    !keepServerAlive &&
    isRemoteZone(zone) &&
    Array.isArray(state.corp?.servers)
  ) {
    /* fall-through; no-op for malformed */
  }
  if (!keepServerAlive) {
    // Walk to (corp + butlast(zone)) and remove if both :content and :ices empty
    const path = ["corp", ...zone.slice(0, -1).map(String)];
    let cur: any = state;
    for (let i = 0; i < path.length - 1; i++) cur = cur?.[path[i]];
    const k = path[path.length - 1];
    const node = cur?.[k];
    if (
      isRemoteZone(["servers", String(k)] as Zone) &&
      node &&
      Array.isArray(node.content) &&
      Array.isArray(node.ices) &&
      node.content.length === 0 &&
      node.ices.length === 0
    ) {
      delete cur[k];
    }
  }

  // :move-zone hook on the moved card definition
  const movedCdef = getCardDef(movedCard);
  const moveZoneFn = (movedCdef as any)["move-zone"] as
    | ((s: GameState, sd: string, eid: EID, mc: Card, oc: Card) => void)
    | undefined;
  if (moveZoneFn) {
    moveZoneFn(state, side, makeEID(state), movedCard, card);
  }

  if (!suppressEvent) {
    triggerEvent(state, side, "card-moved", {
      card,
      "moved-card": getCard(state, movedCard),
    });
  }

  // After move-zone-fn and event, refresh and rewire location-bound events
  const refreshed = getCard(state, movedCard) ?? movedCard;
  const previousFirst = refreshed.previousZone?.[0];
  const oldEvents = ((movedCdef as any).events ?? []).filter(
    (e: any) =>
      previousFirst &&
      (e.location === previousFirst ||
        (Array.isArray(e.location) && e.location.includes(previousFirst))),
  );
  if (oldEvents.length) {
    unregisterEvents(state, side, refreshed, { events: oldEvents } as any);
  }
  const newFirst = refreshed.zone?.[0];
  const newEvents = ((movedCdef as any).events ?? []).filter(
    (e: any) =>
      newFirst &&
      (e.location === newFirst ||
        (Array.isArray(e.location) && e.location.includes(newFirst))),
  );
  if (newEvents.length) {
    registerEvents(state, side, refreshed, newEvents);
  }

  // Default a card when moved to inactive zones (except :persistent key)
  const inactiveZones = new Set(["discard", "hand", "deck", "rfg"]);
  if (finalDest.some((d: any) => inactiveZones.has(String(d)))) {
    resetCard(state, side, refreshed);
  }

  return getCard(state, refreshed) ?? refreshed;
}

// ---------------------------------------------------------------------------
// engine/move* multimethod dispatch
// ---------------------------------------------------------------------------

type MoveStarFn = (
  state: GameState,
  side: string,
  eid: EID,
  action: string,
  cardOrCards: any,
  args: any,
) => void;

const moveStarMethods = new Map<string, MoveStarFn>();

export function registerMoveStar(action: string, fn: MoveStarFn): void {
  moveStarMethods.set(action, fn);
}

export function moveStar(
  state: GameState,
  side: string,
  eid: EID,
  action: string,
  cardOrCards: any,
  args: any,
): void {
  const fn = moveStarMethods.get(action);
  if (!fn) {
    throw new Error(`Wrong move action called: ${action}`);
  }
  fn(state, side, eid, action, cardOrCards, args);
}

// :move
registerMoveStar("move", (state, side, _eid, _action, card, args) => {
  move(state, side, card, args?.to, args);
});

// ---------------------------------------------------------------------------
// move-zone — moves all cards in a zone to another (Chronos Project).
// ---------------------------------------------------------------------------

export function moveZone(
  state: any,
  side?: any,
  server?: any,
  to?: any,
): any;
export function moveZone(
  state: GameState,
  side: string,
  server: string,
  to: string | Zone,
): void {
  if (zoneLocked(state, side, server)) return;
  const sideRef = (state as any)[side];
  const cards: Card[] = sideRef?.[server] ?? [];
  for (const card of cards) move(state, side, card, to);
}

// ---------------------------------------------------------------------------
// Trashing
// ---------------------------------------------------------------------------

export function updateCurrentIceToTrash(
  state: GameState,
  trashlist: Card[],
): void {
  const currentIce = getCurrentIce(state);
  if (!currentIce) return;
  const match = trashlist.find((c: any) => sameCard(c, currentIce));
  if (match) {
    setCurrentIce(state, getCard(state, match) ?? match);
  }
}
