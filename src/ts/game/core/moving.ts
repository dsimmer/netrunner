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

// ---------------------------------------------------------------------------
// Local helpers (analogues of Clojure utilities not yet in TS modules)
// ---------------------------------------------------------------------------

/** Returns the card's zone, treating a hosted card as if its host's zone is its zone. */
function effectiveZone(card: Card): Zone {
  if (card.host) {
    const hz = card.host.zone ?? [];
    return hz.map((s) => toKeyword(s));
  }
  return card.zone ?? [];
}

/** Returns the zero-based index of the card in its server's content/ices.
 *  Mirrors `card-index` in card.cljc. */
function cardIndex(state: GameState, card: Card): number | null {
  if (typeof card.index === "number") return card.index;
  const z = getZone(card);
  // Get-in (cons :corp z)
  let cur: any = (state as any).corp;
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
function inPlayArea(card: Card | null): boolean {
  return getZone(card)[0] === "play-area";
}

/** Mirrors `convert-to-agenda` from card.cljc. */
function convertToAgenda(card: Card, n: number): Card {
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
function targetServer(run: { server?: string[] } | null | undefined): string | null {
  return run?.server?.[0] ?? null;
}

/** Mirrors `same-server?` — true if both cards live in the same Corp server. */
function sameServer(a: Card, b: Card): boolean {
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
function typeToRigZone(cardType: string | undefined): Zone {
  switch (cardType) {
    case "Hardware": return ["rig", "hardware"];
    case "Program": return ["rig", "program"];
    case "Resource": return ["rig", "resource"];
    default: return ["rig", "facedown"];
  }
}

/** Local should-trigger? helper — engine.ts only exports canTrigger which adds the once-check.
 *  For trash-effect filtering we want a pure :req gate without :once. */
function shouldTrigger(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: unknown[],
  ability: Ability | undefined,
): boolean {
  if (!ability) return false;
  if (ability.req) return ability.req(state, side, eid, card, targets as Card[]);
  return true;
}

/** Mirrors `active?` from card.cljc — a card receives events. */
function isActive(card: Card | null): boolean {
  if (!card) return false;
  if (card.type === "Basic Action") return true;
  if ((card.type === "Identity" || card.type === "Fake-Identity") && !isFacedown(card)) return true;
  const z = getZone(card);
  if (z[0] === "play-area" || z[0] === "current" || z[0] === "scored") return true;
  if (card.type === "Counter") return true;
  if (isCorp(card) && isInstalled(card) && isRezzed(card)) return true;
  if (isRunner(card) && isInstalled(card) && !isFacedown(card)) return true;
  return false;
}

/** Setter on side.register.currentlyDrawing (last element of the queue). */
function pop<T>(arr: T[]): T[] { return arr.slice(0, -1); }
function peek<T>(arr: T[]): T | undefined { return arr[arr.length - 1]; }

// ---------------------------------------------------------------------------
// trim-cause-card
// ---------------------------------------------------------------------------

/** Strips cause-card down to just keys used by its handlers. */
function trimCauseCard(card: Card | null | undefined): Partial<Card> | null {
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
      const path = [s as string, ...zone.map((z) => String(z))];
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
  state: GameState, side: string, card: Card, oldCard: Card,
): Card {
  const cdef = getCardDef(card);
  const uninstallEffect = (cdef as any).uninstall as
    | ((s: GameState, sd: string, eid: EID, c: Card, t: unknown[]) => void)
    | undefined;
  if (uninstallEffect && !card.disabled) {
    uninstallEffect(state, side, makeEID(state), card, [{ "old-card": oldCard }]);
  }
  return card;
}

/** Mirrors `should-moved-card-be-known?`. */
function shouldMovedCardBeKnown(
  state: GameState, side: string, card: Card, to: string | Zone,
): boolean {
  const target = Array.isArray(to) ? to[0] : to;
  if (target !== "discard" || side !== "corp") return false;
  if (sameCard(card, (state as any).access)) return true;

  const z = getZone(card);
  const top = z[0];
  const fromZone = (top === "discard" || top === "deck" || top === "hand") ? top : z[1];
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
  state: GameState, side: string, card: Card, to: string | Zone,
): Card {
  const zone = card.host ? (card.host.zone ?? []).map((z) => toKeyword(z)) : (card.zone ?? []);
  const srcZone = zone[0];
  const targetZone = Array.isArray(to) ? to[0] : to;
  const sameZone = srcZone === targetZone;
  const dest: Zone = Array.isArray(to) ? to.slice() : [to];
  const toFacedown = dest.length === 2 && dest[0] === "rig" && dest[1] === "facedown";
  const toInstalled = dest[0] === "servers" || dest[0] === "rig";
  const fromInstalled = srcZone === "servers" || srcZone === "rig";

  const trashHosted = (h: Card): null => {
    moveStar(state, "" as any, makeEID(state), "trash" as any,
      { ...h, zone: (h.zone ?? []).map((z) => toKeyword(z)) },
      {
        unpreventable: true,
        suppressCheckpoint: true,
        hostTrashed: true,
        gameTrash: true,
      });
    return null;
  };

  const updateHostedCard = (h: Card): Card[] => {
    const newz = ([] as string[]).concat(...dest.map((d) => Array.isArray(d) ? d : [d]));
    const newh: Card = {
      ...h,
      zone: ["onhost"],
      host: { ...(h.host as Card), zone: newz },
    };
    updateCard(state, side, (c: any) => c, newh);
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
    (targetZone === "hand" || targetZone === "deck" || targetZone === "discard" || targetZone === "rfg");

  const goingInactive = (targetZone === "hand" || targetZone === "deck" ||
                        targetZone === "discard" || targetZone === "rfg") || toFacedown;

  const wasActiveZone = card.installed || card.host ||
    srcZone === "servers" || srcZone === "scored" ||
    srcZone === "current" || srcZone === "play-area";

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

  const cid = (!isFromHub && isToHub) ? makeCID() : c.cid;
  const timestamp = ((!isFromHub && isToHub) || (!card.installed && toInstalled))
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
  if (dest[0] === "scored" && cardFlag(movedCard, "has-abilities-when-stolen", true)) {
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
    state.effects = state.effects.map((eff) => {
      if (eff.card?.cid === card.cid) {
        return { ...eff, card: movedCard };
      }
      return eff;
    });
  } else {
    state.effects = state.effects.filter((eff) =>
      !(sameCard(card, eff.card) && eff.duration === "while-active"),
    );
  }
}

// ---------------------------------------------------------------------------
// update-installed-card-indices
// ---------------------------------------------------------------------------

export function updateInstalledCardIndices(
  state: GameState, side: string, server: Zone,
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
function updateRunPosition(state: GameState, oldCard: Card, movedCard: Card): void {
  const run = state.run;
  if (!run) return;
  const position = run.position;
  if (typeof position !== "number" || position <= 0) return;

  const protectingRunServer = (c: Card): boolean => {
    if (!isICE(c)) return false;
    const z = c.zone ?? [];
    return z[1] === targetServer(run as any) && z[z.length - 1] === "ices";
  };
  const inward = (c: Card): boolean => typeof c.index === "number" && c.index < position;

  if (protectingRunServer(oldCard) && inward(oldCard)) {
    state.run!.position = position - 1;
  } else if (protectingRunServer(movedCard) && inward(movedCard)) {
    state.run!.position = position + 1;
  }
}

// ---------------------------------------------------------------------------
// move
// ---------------------------------------------------------------------------

export function move(
  state: GameState, side: string, card: Card, to: string | Zone,
  opts: MoveCardOpts = {},
): Card | null {
  const { front, index, keepServerAlive, force, suppressEvent, shuffled, swap } = opts;
  const zone = card.host ? (card.host.zone ?? []).map((z) => toKeyword(z)) : (card.zone ?? []);

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
    | ((s: GameState, sd: string, eid: EID, c: Card, t: unknown[]) => Zone | null | undefined)
    | undefined;
  const destReplacement = destReplacementFn
    ? destReplacementFn(state, side, makeEID(state), card,
      [{ card, "target-zone": dest, shuffled }])
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
    typeof index === "number" ? index :
    front ? 0 : list.length;
  parent[key] = insertNth(posToMoveTo, movedCard, list);

  if (zone.length) updateInstalledCardIndices(state, side, zone);
  updateInstalledCardIndices(state, side, finalDest);

  if (!swap) updateRunPosition(state, card, getCard(state, movedCard) ?? movedCard);

  // Clean up empty remote server records
  const z2: Zone = ["corp", ...zone.slice(0, -1).map(String)];
  if (!keepServerAlive && isRemoteZone(zone) &&
      Array.isArray((state as any).corp?.servers)
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
      node && Array.isArray(node.content) && Array.isArray(node.ices) &&
      node.content.length === 0 && node.ices.length === 0
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
    triggerEvent(state, side, "card-moved",
      { card, "moved-card": getCard(state, movedCard) });
  }

  // After move-zone-fn and event, refresh and rewire location-bound events
  const refreshed = getCard(state, movedCard) ?? movedCard;
  const previousFirst = refreshed.previousZone?.[0];
  const oldEvents = ((movedCdef as any).events ?? []).filter(
    (e: any) => previousFirst && (e.location === previousFirst ||
      (Array.isArray(e.location) && e.location.includes(previousFirst))),
  );
  if (oldEvents.length) {
    unregisterEvents(state, side, refreshed, { events: oldEvents } as any);
  }
  const newFirst = refreshed.zone?.[0];
  const newEvents = ((movedCdef as any).events ?? []).filter(
    (e: any) => newFirst && (e.location === newFirst ||
      (Array.isArray(e.location) && e.location.includes(newFirst))),
  );
  if (newEvents.length) {
    registerEvents(state, side, refreshed, newEvents);
  }

  // Default a card when moved to inactive zones (except :persistent key)
  const inactiveZones = new Set(["discard", "hand", "deck", "rfg"]);
  if (finalDest.some((d) => inactiveZones.has(String(d)))) {
    resetCard(state, side, refreshed);
  }

  return getCard(state, refreshed) ?? refreshed;
}

// ---------------------------------------------------------------------------
// engine/move* multimethod dispatch
// ---------------------------------------------------------------------------

type MoveStarFn = (
  state: GameState, side: string, eid: EID, action: string,
  cardOrCards: any, args: any,
) => void;

const moveStarMethods = new Map<string, MoveStarFn>();

export function registerMoveStar(action: string, fn: MoveStarFn): void {
  moveStarMethods.set(action, fn);
}

export function moveStar(
  state: GameState, side: string, eid: EID, action: string,
  cardOrCards: any, args: any,
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
  state: GameState, side: string, server: string, to: string | Zone,
): void {
  if (zoneLocked(state, side, server)) return;
  const sideRef = (state as any)[side];
  const cards: Card[] = sideRef?.[server] ?? [];
  for (const card of cards) move(state, side, card, to);
}

// ---------------------------------------------------------------------------
// Trashing
// ---------------------------------------------------------------------------

export function updateCurrentIceToTrash(state: GameState, trashlist: Card[]): void {
  const currentIce = getCurrentIce(state);
  if (!currentIce) return;
  const match = trashlist.find((c) => sameCard(c, currentIce));
  if (match) {
    setCurrentIce(state, getCard(state, match) ?? match);
  }
}

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
