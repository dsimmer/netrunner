// Card type, zone helpers, and card predicate functions.
// Mirrors: src/cljc/game/core/card.cljc

import type { Ability, Subroutine } from "./types.ts";
import type { GameState } from "./state";

// ---------------------------------------------------------------------------
// Zone
// ---------------------------------------------------------------------------

/** Zone represents a card's location, e.g. ["hand"] or ["servers","hq","content"]. */
export type Zone = string[];

// ---------------------------------------------------------------------------
// Counter
// ---------------------------------------------------------------------------

export type Counter = Record<string, number>;

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface Card {
  abilities?: unknown[];
  advanceCounter?: number;
  advanceable?: string;
  advancementcost?: number;
  agendapoints?: number;
  art?: string;
  baselink?: number;
  cardTarget?: unknown;
  cid: string;
  code?: string;
  corpAbilities?: unknown[];
  cost?: number;
  counter?: Counter;
  counters?: Record<string, number>;
  currentAdvancementRequirement?: number;
  currentPoints?: number;
  currentStrength?: number;
  cycleCode?: string;
  deckLimit?: number;
  disabled?: boolean;
  extraAdvanceCounter?: number;
  face?: string;
  facedown?: boolean;
  faces?: unknown[];
  faction?: string;
  format?: string;
  host?: Card | null;
  hosted?: Card[];
  icon?: unknown;
  images?: unknown;
  implementation?: string;
  index?: number;
  installed?: boolean;
  memoryunits?: number;
  minimumdecksize?: number;
  new?: boolean;
  normalizedtitle?: string;
  playable?: boolean;
  previousVersions?: unknown[];
  previousZone?: Zone;
  printedTitle?: string;
  quantity?: number;
  rezzed?: boolean;
  rotated?: boolean;
  runnerAbilities?: unknown[];
  seen?: boolean;
  selected?: boolean;
  setCode?: string;
  side?: string;
  special?: Record<string, unknown>;
  strength?: number;
  subroutines?: Subroutine[];
  subtype?: string;
  subtypeTarget?: string;
  subtypes?: string[];
  title?: string;
  trash?: number;
  type?: string;
  uniqueness?: boolean;
  zone?: Zone;

  // Runtime / extra fields
  setAsideVisibility?: Record<string, boolean>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// cid / title helpers  (get-cid, get-title)
// ---------------------------------------------------------------------------

/** Gets the cid of a given card when wrapped in an effect-handler map.
 *  Mirrors `(get-in card [:card :cid])`. */
export function getCid(
  card: { card?: Card | null } | null,
): string | undefined {
  return card?.card?.cid;
}

/** Title or printed title if the card is a counter or fake agenda. */
export function getTitle(card: Card | null): string | undefined {
  return card?.title ?? card?.printedTitle;
}

/** Get the type of a card (e.g. "Program", "Asset"). Mirrors Clojure card/type. */
export function getType(card: Card | null): string | undefined {
  return card?.type;
}

/** Get the side of a card ("Corp" or "Runner"). Mirrors Clojure card/side. */
export function getSide(card: Card | null): string | undefined {
  return card?.side;
}

// ---------------------------------------------------------------------------
// Hosting / zone helpers
// ---------------------------------------------------------------------------

/** Recursively searches upward to find the 'root' card of a hosting chain. */
export function getNestedHost(card: Card | null | undefined): Card | null {
  if (!card) return null;
  return card.host ? getNestedHost(card.host) : card;
}

/** Returns the zone of the 'root' card of a hosting chain. */
export function getZone(card: Card | null | undefined): Zone {
  const root = getNestedHost(card);
  return root?.zone ?? [];
}

// ---------------------------------------------------------------------------
// Zone predicates (in-*)
// ---------------------------------------------------------------------------

/** Checks if the specified card is installed in -- and not PROTECTING -- a server. */
export function inServer(card: Card | null): boolean {
  const z = getZone(card);
  return z[z.length - 1] === "content";
}

/** Checks if the specified card is in the hand. */
export function inHand(card: Card | null): boolean {
  return zoneEquals(card, ["hand"]);
}

/** Checks if the specified card is in the discard pile. */
export function inDiscard(card: Card | null): boolean {
  return zoneEquals(card, ["discard"]);
}

/** Checks if the specified card is in the draw deck. */
export function inDeck(card: Card | null): boolean {
  return zoneEquals(card, ["deck"]);
}

/** Checks if the card is in the archives root content. */
export function inArchivesRoot(card: Card | null): boolean {
  return zoneEquals(card, ["servers", "archives", "content"]);
}

/** Checks if the card is in the HQ root content. */
export function inHqRoot(card: Card | null): boolean {
  return zoneEquals(card, ["servers", "hq", "content"]);
}

/** Checks if the card is in the R&D root content. */
export function inRdRoot(card: Card | null): boolean {
  return zoneEquals(card, ["servers", "rd", "content"]);
}

/** Checks if the card is in a remote server root content. */
export function inRemoteRoot(card: Card | null, remote: string): boolean {
  return zoneEquals(card, ["servers", remote, "content"]);
}

/** Checks if the card is in a root server (archives, HQ, or R&D). */
export function inRoot(card: Card | null): boolean {
  return inArchivesRoot(card) || inHqRoot(card) || inRdRoot(card);
}

/** Internal helper: accept either `(card)` or `(state, card)` and return the card.
 *  The clj source takes only `[card]`; some callers in this codebase still
 *  pass a leading state argument, so both forms are accepted. */
function pickCard(
  stateOrCard: GameState | Card | null,
  cardArg?: Card | null,
): Card | null {
  return cardArg !== undefined ? cardArg : (stateOrCard as Card | null);
}

/** Checks if the card is protecting the archives. */
export function protectingArchives(card: Card | null): boolean;
export function protectingArchives(state: GameState | null, card: Card | null): boolean;
export function protectingArchives(
  stateOrCard: GameState | Card | null,
  cardArg?: Card | null,
): boolean {
  return zoneEquals(pickCard(stateOrCard, cardArg), ["servers", "archives", "ices"]);
}

/** Checks if the card is protecting HQ. */
export function protectingHq(card: Card | null): boolean;
export function protectingHq(state: GameState | null, card: Card | null): boolean;
export function protectingHq(
  stateOrCard: GameState | Card | null,
  cardArg?: Card | null,
): boolean {
  return zoneEquals(pickCard(stateOrCard, cardArg), ["servers", "hq", "ices"]);
}

/** Checks if the card is protecting R&D. */
export function protectingRd(card: Card | null): boolean;
export function protectingRd(state: GameState | null, card: Card | null): boolean;
export function protectingRd(
  stateOrCard: GameState | Card | null,
  cardArg?: Card | null,
): boolean {
  return zoneEquals(pickCard(stateOrCard, cardArg), ["servers", "rd", "ices"]);
}

/** Checks if the card is protecting any central. */
export function protectingACentral(card: Card | null): boolean;
export function protectingACentral(state: GameState | null, card: Card | null): boolean;
export function protectingACentral(
  stateOrCard: GameState | Card | null,
  cardArg?: Card | null,
): boolean {
  const card = pickCard(stateOrCard, cardArg);
  return protectingArchives(card) || protectingHq(card) || protectingRd(card);
}

/** Checks if the specified card is in the play area. */
export function inPlayArea(card: Card | null): boolean {
  return zoneEquals(card, ["play-area"]);
}

/** Checks if the specific card is in a set-aside area (destroyed). */
export function inDestroyed(card: Card | null): boolean {
  return zoneEquals(card, ["destroyed"]);
}

/** Checks if the specific card is in a set-aside area. */
export function inSetAside(card: Card | null): boolean {
  return zoneEquals(card, ["set-aside"]);
}

/** Checks if the specific card is in set aside and visible to this side. */
export function setAsideVisible(card: Card | null, side: string): boolean {
  if (!inSetAside(card)) return false;
  const vis = card?.setAsideVisibility;
  if (!vis) return false;
  if (side === "corp") return vis["corpCanSee"] === true;
  return vis["runnerCanSee"] === true;
}

/** Checks if the specified card is in the 'current' zone. */
export function inCurrent(card: Card | null): boolean {
  return zoneEquals(card, ["current"]);
}

/** Checks if the specified card is in a score area. */
export function inScored(card: Card | null): boolean {
  return zoneEquals(card, ["scored"]);
}

/** Checks if the specified card is in the 'remove from game' zone. */
export function inRfg(card: Card | null): boolean {
  return zoneEquals(card, ["rfg"]);
}

/** Internal helper: compare zone arrays for equality. */
function zoneEquals(card: Card | null, expected: string[]): boolean {
  const z = getZone(card);
  if (z.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (z[i] !== expected[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Type / side predicates
// ---------------------------------------------------------------------------

/**
 * Checks the property of the card to see if it is equal to the given value,
 * as either a string or a keyword.
 */
function cardIs(
  card: Card | null,
  property: keyof Card,
  value: string,
): boolean {
  if (!card) return false;
  const cv = card[property];
  if (cv === undefined || cv === null) return false;
  // In TS everything is a string (no keywords), so direct comparison
  return String(cv) === value;
}

export function runner(card: Card | null): boolean {
  return cardIs(card, "side", "Runner");
}

export function corp(card: Card | null): boolean {
  return cardIs(card, "side", "Corp");
}

/** Checks if the card is of the specified type (string). */
export function isType(card: Card | null, type: string): boolean {
  return cardIs(card, "type", type);
}

export function agenda(card: Card | null): boolean {
  return isType(card, "Agenda");
}

export function asset(card: Card | null): boolean {
  return isType(card, "Asset");
}

export function event(card: Card | null): boolean {
  return !facedown(card) && isType(card, "Event");
}

export function hardware(card: Card | null): boolean {
  return !facedown(card) && isType(card, "Hardware");
}

export function ice(card: Card | null): boolean {
  return isType(card, "ICE");
}

export function fakeIdentity(card: Card | null): boolean {
  return isType(card, "Fake-Identity");
}

export function identity(card: Card | null): boolean {
  return isType(card, "Identity") || fakeIdentity(card);
}

export function operation(card: Card | null): boolean {
  return isType(card, "Operation");
}

export function program(card: Card | null): boolean {
  return !facedown(card) && isType(card, "Program");
}

export function resource(card: Card | null): boolean {
  return !facedown(card) && isType(card, "Resource");
}

export function upgrade(card: Card | null): boolean {
  return isType(card, "Upgrade");
}

export function conditionCounter(card: Card | null): boolean {
  return isType(card, "Counter");
}

export function basicAction(card: Card | null): boolean {
  return isType(card, "Basic Action");
}

// ---------------------------------------------------------------------------
// Subtype helpers
// ---------------------------------------------------------------------------

/**
 * Checks if the specified subtype is present in the card, ignoring case.
 * Mirrors find-first with = comparison on subtypes array.
 */
export function hasSubtype(
  card: Card | null,
  subtype: string,
): string | undefined {
  if (!card || !card.subtypes) return undefined;
  return card.subtypes.find((s) => s === subtype);
}

/** Checks if any of the provided subtypes is present on the card. */
export function hasAnySubtype(card: Card | null, subtypes: string[]): boolean {
  return subtypes.some((s) => hasSubtype(card, s) !== undefined);
}

/** Checks if all of the provided subtypes are present on the card. */
export function hasAllSubtypes(card: Card | null, subtypes: string[]): boolean {
  return subtypes.every((s) => hasSubtype(card, s) !== undefined);
}

export function virusProgram(card: Card | null): boolean {
  return program(card) !== false && hasSubtype(card, "Virus") !== undefined;
}

export function consoleCard(card: Card | null): boolean {
  return hardware(card) !== false && hasSubtype(card, "Console") !== undefined;
}

// ---------------------------------------------------------------------------
// Property accessors
// ---------------------------------------------------------------------------

export function unique(card: Card | null): boolean | undefined {
  return card?.uniqueness;
}

/** Is the card of an acceptable type to be installed in a server. */
export function corpInstallableType(card: Card | null): boolean {
  return asset(card) || agenda(card) || ice(card) || upgrade(card);
}

export function rezzed(card: Card | null): boolean {
  return card?.rezzed === true;
}

export function faceup(card: Card | null): boolean {
  return card?.seen === true || rezzed(card);
}

export function installed(card: Card | null): boolean {
  if (card?.installed) return true;
  const z = getZone(card);
  return z[0] === "servers";
}

export function facedown(card: Card | null): boolean {
  if (!card) return false;
  // Non-counter cards in rig/facedown zone are facedown
  if (!conditionCounter(card)) {
    const z = getZone(card);
    if (z[0] === "rig" && z[1] === "facedown") return true;
  }
  return card.facedown === true;
}

// ---------------------------------------------------------------------------
// Active
// ---------------------------------------------------------------------------

/** Checks if the card is active and should receive game events/triggers. */
export function active(card: Card | null): boolean {
  if (!card) return false;
  return (
    basicAction(card) ||
    (identity(card) && !facedown(card)) ||
    inPlayArea(card) ||
    inCurrent(card) ||
    inScored(card) ||
    conditionCounter(card) ||
    (corp(card) && installed(card) && rezzed(card)) ||
    (runner(card) && installed(card) && !facedown(card))
  );
}

// ---------------------------------------------------------------------------
// Advancement / counters
// ---------------------------------------------------------------------------

export function getAdvancementRequirement(
  card: Card | null,
): number | undefined {
  if (!agenda(card)) return undefined;
  return card?.currentAdvancementRequirement ?? card?.advancementcost;
}

export function getAgendaPoints(card: Card | null): number {
  return card?.currentPoints ?? card?.agendapoints ?? 0;
}

/**
 * Returns true if the card can be advanced.
 * Single-arity version (no state).
 */
export function canBeAdvanced(card: Card | null): boolean;
/**
 * Two-arity version: also checks the disabled-card registry.
 */
export function canBeAdvanced(
  state: GameState | null,
  card: Card | null,
): boolean;
export function canBeAdvanced(
  stateOrCard: GameState | Card | null,
  card?: Card | null,
): boolean {
  // Determine arity
  let c: Card | null;
  let state: GameState | null = null;
  if (card === undefined) {
    // single-arity call
    c = stateOrCard as Card | null;
  } else {
    // two-arity call
    state = stateOrCard as GameState | null;
    c = card;
  }

  if (!c) return false;

  // Base advanceable check
  const advanceableVal = c.advanceable;
  const baseCanAdvance =
    advanceableVal === "always" ||
    (advanceableVal === "while-rezzed" && rezzed(c)) ||
    (advanceableVal === "while-unrezzed" && !rezzed(c)) ||
    (agenda(c) && installed(c));

  if (!baseCanAdvance) return false;

  // Two-arity: also check disabled registry
  if (state !== null && !agenda(c)) {
    // Only agendas are implicitly advanceable; other advanceable cards
    // must not have their ability disabled.
    if (state.disabledCardReg?.has(c.cid)) return false;
  }

  return true;
}

/**
 * Get number of counters of specified type.
 * "advancement" returns advanceCounter + extraAdvanceCounter.
 */
export function getCounters(card: Card | null | undefined, counter: string): number {
  if (!card) return 0;
  if (counter === "advancement") {
    return (card.advanceCounter ?? 0) + (card.extraAdvanceCounter ?? 0);
  }
  return card.counter?.[counter] ?? 0;
}

// ---------------------------------------------------------------------------
// same-card?
// ---------------------------------------------------------------------------

/**
 * Checks if the two cards are the same by cid. Returns false if both cards
 * do not have cid. Alternatively specify a function to use to check the card.
 */
export function sameCard(card1: Card | null, card2: Card | null): boolean;
export function sameCard<T>(
  func: (card: Card | null) => T | undefined,
  card1: Card | null,
  card2: Card | null,
): boolean;
export function sameCard<T>(
  card1OrFunc: Card | ((card: Card | null) => T | undefined) | null,
  card2: Card | null,
  card3?: Card | null,
): boolean {
  if (card3 !== undefined) {
    // three-arg: func, card1, card2
    const func = card1OrFunc as (card: Card | null) => T | undefined;
    const r1 = func(card2);
    const r2 = func(card3);
    return r1 !== undefined && r2 !== undefined && r1 === r2;
  }
  // two-arg: card1, card2 -> compare by cid
  const c1 = card1OrFunc as Card | null;
  const c2 = card2 as Card | null;
  if (!c1?.cid || !c2?.cid) return false;
  return c1.cid === c2.cid;
}

// ---------------------------------------------------------------------------
// card-index / verbal-card-index
// ---------------------------------------------------------------------------

/** Get the zero-based index of the given card in its server's list of content.
 *  Mirrors `(get-in @state (cons :corp (get-zone card)))`. */
export function cardIndex(
  state: GameState,
  card: Card | null,
): number | undefined {
  if (!card) return undefined;
  if (card.index !== undefined) return card.index;
  const z = getZone(card);
  let collection: unknown = state.corp;
  for (const seg of z) {
    if (collection && typeof collection === "object") {
      collection = (collection as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  if (!Array.isArray(collection)) return undefined;
  const cards = collection as Card[];
  const idx = cards.findIndex((c) => sameCard(c, card));
  return idx >= 0 ? idx : undefined;
}

/** Get the verbal (ordinal word) index of the given card in its server's content. */
export function verbalCardIndex(
  state: GameState,
  card: Card | null,
): string | undefined {
  const idx = cardIndex(state, card);
  if (idx === undefined) return undefined;
  return ordinalWord(idx + 1);
}

/** Convert a number (1-based) to its English ordinal suffix string.
 *  Mirrors Common Lisp's `~:R` format directive used by the clj source. */
function ordinalWord(n: number): string {
  const small: Record<number, string> = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    5: "fifth",
    6: "sixth",
    7: "seventh",
    8: "eighth",
    9: "ninth",
    10: "tenth",
    11: "eleventh",
    12: "twelfth",
    13: "thirteenth",
    14: "fourteenth",
    15: "fifteenth",
    16: "sixteenth",
    17: "seventeenth",
    18: "eighteenth",
    19: "nineteenth",
    20: "twentieth",
  };
  if (n in small) return small[n];
  // Fall back to numeric ordinal (21st, 22nd, 23rd, 24th, ...)
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// ---------------------------------------------------------------------------
// is-public?
// ---------------------------------------------------------------------------

/**
 * Returns if a given card should be visible to the opponent.
 * Single-arity: side is derived from card.side.
 * Two-arity: explicit side.
 */
export function isPublic(card: Card | null): boolean;
export function isPublic(card: Card | null, side: string): boolean;
export function isPublic(card: Card | null, side?: string): boolean {
  if (!card) return false;
  const viewingSide = side ?? card.side ?? "";

  // Public cards for both sides:
  // * basic action
  // * identity
  // * in a public zone: score area, current, play area, remove from game
  if (
    basicAction(card) ||
    identity(card) ||
    inScored(card) ||
    inCurrent(card) ||
    inPlayArea(card) ||
    inRfg(card) ||
    inDestroyed(card) ||
    setAsideVisible(card, viewingSide)
  ) {
    return true;
  }

  if (viewingSide === "corp") {
    // Public runner cards when viewed by corp:
    // * installed/hosted and not facedown
    // * in heap (discard)
    // * corp cards not in set-aside
    if (corp(card) && !inSetAside(card)) return true;
    if ((installed(card) || card.host) && (faceup(card) || !facedown(card)))
      return true;
    if (inDiscard(card)) return true;
  } else {
    // Public corp cards when viewed by runner:
    // * installed and rezzed (or operation/counter/faceup)
    // * in discard and faceup
    // * runner cards not in set-aside
    if (runner(card) && !inSetAside(card)) return true;
    if (
      (installed(card) || card.host) &&
      (operation(card) || conditionCounter(card) || faceup(card))
    ) {
      return true;
    }
    if (inDiscard(card) && faceup(card)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Conversion helpers (CR 1.8 10.1.3 / 10.1.4)
// ---------------------------------------------------------------------------

/**
 * Convert a card to an agenda (CR 1.8 10.1.3).
 * The card loses all previous properties and gains only those specified.
 */
export function convertToAgenda(card: Card, agendaPoints: number): Card {
  return {
    agendapoints: agendaPoints,
    cid: card.cid,
    code: card.code,
    host: card.host,
    hosted: card.hosted,
    implementation: card.implementation,
    printedTitle: card.title ?? card.printedTitle,
    side: card.side,
    type: "Agenda",
    zone: card.zone,
  };
}

/**
 * Convert a card to a condition counter (CR 1.8 10.1.4).
 * The card loses all previous properties and gains only those specified.
 */
export function convertToConditionCounter(card: Card): Card {
  return {
    cid: card.cid,
    code: card.code,
    implementation: card.implementation,
    printedTitle: card.title ?? card.printedTitle,
    side: card.side,
    type: "Counter",
    zone: card.zone,
  };
}

// ---------------------------------------------------------------------------
// Backward-compatibility aliases (is* prefixed names)
// ---------------------------------------------------------------------------

export const isRezzed = rezzed;
export const isCorp = corp;
export const isRunner = runner;
export const isICE = ice;
export const isAgenda = agenda;
export const isAsset = asset;
export const isUpgrade = upgrade;
export const isOperation = operation;
export const isEvent = event;
export const isHardware = hardware;
export const isProgram = program;
export const isResource = resource;
export const isIdentity = identity;
export const isBasicAction = basicAction;
export const isConditionCounter = conditionCounter;
export const isFacedown = facedown;
export const isInstalled = installed;
export const isFaceup = faceup;
export const inRFG = inRfg;
export function isCounter(card: Card | null): boolean {
  return card?.type === "Counter";
}
export function printedTitle(card: Card | null): string | undefined {
  return card?.printedTitle ?? card?.title;
}

// Type constants
export const TYPE_IDENTITY = "Identity";

/** Returns true if card is in the given zone. */
export function inZone(card: Card | null, ...zones: string[]): boolean {
  const z = getZone(card);
  for (let i = 0; i < zones.length; i++) {
    if (z[i] !== zones[i]) return false;
  }
  return zones.length <= z.length;
}

// Re-export `getCard` here so callers using `coreCard.getCard(...)` (a common
// shape inherited from the clj API surface) resolve. Definition lives in
// finding.ts to avoid a cycle in card.ts itself.
export { getCard, findCard } from "./finding";
export { zoneLocked, inCorpScored } from "./flags";
export { inHandStar, allCardsInHandStar } from "./def_helpers_1";
export { updateCard } from "./update";
export { getCardDef } from "./types";
export { cardDef } from "./card_defs";
export { asAgenda, forfeit, swapInstalled } from "./moving_2";
export { swapCardsAsync } from "./installing_2";
export { cancellable } from "./prompts";
export { host } from "./hosting";

export const isIce = ice;

/** Credit cost of a card. */
export function cost(card: Card | null): number {
  return card?.cost ?? 0;
}

/**
 * True when a card is installed in a server that has no ICE protecting it.
 * Mirrors the `unprotected` binding from clj's req-macro.
 */
export function unprotected(state: GameState, card: Card | null): boolean;
export function unprotected(state: GameState, side: string | null, card: Card | null): boolean;
export function unprotected(
  state: GameState,
  arg2: Card | string | null,
  arg3?: Card | null,
): boolean {
  // Accept (state, side, card) or (state, card)
  const card: Card | null = arg3 !== undefined ? arg3 : (arg2 as Card | null);
  if (!card) return false;
  const z = getZone(card);
  const server = z[1];
  if (!server) return false;
  const servers = state.corp.servers;
  let ices: Card[] = [];
  if (server === "hq") ices = servers.hq.ices;
  else if (server === "rd") ices = servers.rd.ices;
  else if (server === "archives") ices = servers.archives.ices;
  else ices = servers.remote[server]?.ices ?? [];
  return ices.length === 0;
}

/** True if `card` has subtype `keyword`. */
export function hasKeyword(card: Card | null, keyword: string): boolean {
  return hasSubtype(card, keyword) !== undefined;
}

/** Number of times `keyword` appears in the subtype list. */
export function getKeyword(card: Card | null, keyword: string): number {
  if (!card || !card.subtypes) return 0;
  let n = 0;
  for (const s of card.subtypes) if (s === keyword) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Constant exports referenced from cards / barrel module
// ---------------------------------------------------------------------------

export const SIDE_CORP = "Corp";
export const SIDE_RUNNER = "Runner";

export const TYPE_AGENDA = "Agenda";
export const TYPE_ASSET = "Asset";
export const TYPE_BASIC_ACT = "Basic Action";
export const TYPE_COUNTER = "Counter";
export const TYPE_EVENT = "Event";
export const TYPE_FAKE_ID = "Fake-Identity";
export const TYPE_HARDWARE = "Hardware";
export const TYPE_ICE = "ICE";
export const TYPE_OPERATION = "Operation";
export const TYPE_PROGRAM = "Program";
export const TYPE_RESOURCE = "Resource";
export const TYPE_UPGRADE = "Upgrade";

// Aliases for naming variants used elsewhere
export const getCounter = getCounters;
export const inRig = installed;
export const inServers = inServer;
export const isCorpInstallable = corpInstallableType;
export const isUnique = unique;
export const isInstallable = isInstalled;

export function getRootZoneIndex(card: Card | null): number {
  const z = getZone(card);
  return z && z.length > 1 ? (typeof z[1] === "number" ? z[1] : 0) : 0;
}

export function isDisabled(card: Card | null): boolean {
  return !!card?.disabled;
}

export function isHosted(card: Card | null): boolean {
  if (!card) return false;
  const z = getZone(card);
  return z[0] === "hosted" || !!card.host;
}

export function isPlayable(card: Card | null): boolean {
  return !!card?.playable;
}
