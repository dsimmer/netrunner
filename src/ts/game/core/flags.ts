// Flag system: card flags, run/turn/persistent flag stacks, and game-action gating.
// Mirrors: src/clj/game/core/flags.clj

import type { GameState, FlagEntry } from "./state";
import type { Card } from "./card";
import type { ReqFn } from "./types";
import { CORP_SIDE } from "./state";
import { isAgenda, isInstalled, isRezzed, inScored, getCounters as getCounter } from "./card";
import { allActive, allInstalled } from "./board";
import { cardDef } from "./card_defs";
import { anyEffects } from "./effects";
import { makeEID } from "./eid";
import { cardStr } from "./to_string";
import { toast } from "./toasts";
import { enumerateStr, sameCard, sameSide } from "../utils";

// ---------------------------------------------------------------------------
// Flag stack types
// ---------------------------------------------------------------------------

export type FlagType = "currentRun" | "currentTurn" | "persistent";

const ALL_FLAG_TYPES: FlagType[] = ["currentRun", "currentTurn", "persistent"];

function getFlagBucket(
  state: GameState,
  flagType: FlagType,
): Record<string, FlagEntry[]> {
  return state.flagStack[flagType];
}

// ---------------------------------------------------------------------------
// Card flag map (static :flags entry on card-def)
// ---------------------------------------------------------------------------

/**
 * Returns true if the card-def has a :flags entry for the given key.
 * If `value` is supplied, returns true only when the entry equals it.
 * Mirrors: card-flag? in flags.clj
 */
export function cardFlag(
  card: Card,
  flagKey: string,
  value?: unknown,
): boolean {
  const cdef = cardDef(card);
  const entry = (cdef as any).flags?.[flagKey];
  if (value !== undefined) return entry === value;
  return entry != null;
}

/**
 * Calls the card-def's flag function for the given key and compares it to value
 * (or returns its raw boolean result if value is omitted).
 * Mirrors: card-flag-fn? in flags.clj
 */
export function cardFlagFn(
  state: GameState,
  side: string,
  card: Card,
  flagKey: string,
  value?: unknown,
): boolean {
  const cdef = cardDef(card);
  const fn = (cdef as any).flags?.[flagKey] as ReqFn | undefined;
  if (!fn) return false;
  const result = typeof fn === "function"
    ? (fn as (...a: any[]) => any)(state, side, makeEID(state), card, [])
    : fn;
  if (value !== undefined) return result === value;
  return result as unknown as boolean;
}

/**
 * Returns true if any card in `cards` (default `all-active`) has a flag-fn
 * matching the value.
 * Mirrors: any-flag-fn? in flags.clj
 */
export function anyFlagFn(
  state: GameState,
  side: string,
  flagKey: string,
  value: unknown,
  cards?: Card[],
): boolean {
  const list = cards ?? allActive(state, side);
  return list.some((c: any) => cardFlagFn(state, side, c, flagKey, value));
}

// ---------------------------------------------------------------------------
// Generic flag stack helpers
// ---------------------------------------------------------------------------

function registerFlag(
  state: GameState,
  card: Card,
  flagType: FlagType,
  flag: string,
  condition: ReqFn,
): void {
  const bucket = getFlagBucket(state, flagType);
  const list = bucket[flag] ?? [];
  list.unshift({ card, condition });
  bucket[flag] = list;
}

/**
 * Returns true when every condition for the given flag returns true (or no
 * conditions are registered).
 * Mirrors: check-flag? in flags.clj
 */
function checkFlag(
  state: GameState,
  side: string,
  card: Card,
  flagType: FlagType,
  flag: string,
): boolean {
  const conditions = getFlagBucket(state, flagType)[flag] ?? [];
  const eid = makeEID(state);
  return conditions.every((c: any) => typeof c.condition === "function" ? (c.condition as any)(state, side, eid, card, []) : !!c.condition);
}

/**
 * Returns true if every flag-type permits the given flag.
 * Mirrors: check-flag-types? in flags.clj
 */
export function checkFlagTypes(
  state: GameState,
  side: string,
  card: Card,
  flag: string,
  flagTypes: FlagType[],
): boolean {
  return flagTypes.every((ft: any) => checkFlag(state, side, card, ft, flag));
}

/**
 * Returns the cards from any flag-type that are *preventing* the given flag.
 * Mirrors: get-preventing-cards in flags.clj
 */
export function getPreventingCards(
  state: GameState,
  side: string,
  card: Card,
  flag: string,
  flagTypes: FlagType[],
): Card[] {
  const out: Card[] = [];
  const eid = makeEID(state);
  for (const ft of flagTypes) {
    for (const entry of getFlagBucket(state, ft)[flag] ?? []) {
      const cond = entry.condition;
      const ok = typeof cond === "function" ? (cond as any)(state, side, eid, card, []) : !!cond;
      if (!ok) out.push(entry.card);
    }
  }
  return out;
}

/**
 * Returns true if the flag-type has any condition registered for the flag.
 * Mirrors: has-flag? in flags.clj
 */
export function hasFlag(
  state: GameState,
  flagType: FlagType,
  flag: string,
): boolean {
  const list = getFlagBucket(state, flagType)[flag];
  return !!list && list.length > 0;
}

function clearAllFlags(state: GameState, flagType: FlagType): void {
  state.flagStack[flagType] = {};
}

function clearFlagForCard(
  state: GameState,
  card: Card,
  flagType: FlagType,
  flag: string,
): void {
  const bucket = getFlagBucket(state, flagType);
  const list = bucket[flag];
  if (!list) return;
  bucket[flag] = list.filter((e: any) => e.card.cid !== card.cid);
}

/**
 * Removes every flag entry whose card matches the given card across all flag types.
 * Mirrors: clear-all-flags-for-card! in flags.clj
 */
export function clearAllFlagsForCard(
  state: GameState,
  _side: string,
  card: Card,
): Card {
  for (const ft of ALL_FLAG_TYPES) {
    const bucket = getFlagBucket(state, ft);
    for (const flag of Object.keys(bucket)) {
      clearFlagForCard(state, card, ft, flag);
    }
  }
  return card;
}

// ---------------------------------------------------------------------------
// Run flag (cleared at end of run)
// ---------------------------------------------------------------------------

export function registerRunFlag(card: Card, flag: string, condition: ReqFn): void;
export function registerRunFlag(state: GameState, side: string, card: Card, flag: string, condition: ReqFn): void;
export function registerRunFlag(...args: any[]): void {
  if (args.length === 3) {
    // shorthand without state — no-op
    return;
  }
  const state = args[0] as GameState;
  const card = args[2] as Card;
  const flag = args[3] as string;
  const condition = args[4] as ReqFn;
  registerFlag(state, card, "currentRun", flag, condition);
}

export function runFlag(
  state: GameState,
  side: string,
  card: Card,
  flag: string,
): boolean {
  return checkFlag(state, side, card, "currentRun", flag);
}

export function clearRunRegister(state: GameState): void {
  clearAllFlags(state, "currentRun");
}

export function clearRunFlag(
  state: GameState,
  _side: string,
  card: Card,
  flag: string,
): void {
  clearFlagForCard(state, card, "currentRun", flag);
}

// ---------------------------------------------------------------------------
// Turn flag (cleared at end of turn)
// ---------------------------------------------------------------------------

export function registerTurnFlag(card: Card, flag: string, condition: ReqFn | null): void;
export function registerTurnFlag(state: GameState, side: string, card: Card, flag: string, condition: ReqFn | null): void;
export function registerTurnFlag(...args: any[]): void {
  if (args.length === 3) {
    // shorthand (card, flag, condition) — used inside effect() lambdas.
    // No state available — best-effort no-op.
    return;
  }
  const state = args[0] as GameState;
  const card = args[2] as Card;
  const flag = args[3] as string;
  const condition = (args[4] as ReqFn | null) ?? (() => false);
  registerFlag(state, card, "currentTurn", flag, condition);
}

export function turnFlag(
  state: GameState,
  side: string,
  card: Card,
  flag: string,
): boolean {
  return checkFlag(state, side, card, "currentTurn", flag);
}

export function clearTurnRegister(state: GameState): void {
  clearAllFlags(state, "currentTurn");
}

export function clearTurnFlag(
  state: GameState,
  _side: string,
  card: Card,
  flag: string,
): void {
  clearFlagForCard(state, card, "currentTurn", flag);
}

// ---------------------------------------------------------------------------
// Persistent flag (cleared manually)
// ---------------------------------------------------------------------------

export function registerPersistentFlag(
  state: GameState,
  _side: string,
  card: Card,
  flag: string,
  condition: ReqFn,
): void {
  registerFlag(state, card, "persistent", flag, condition);
}

export function persistentFlag(
  state: GameState,
  side: string,
  card: Card,
  flag: string,
): boolean {
  return checkFlag(state, side, card, "persistent", flag);
}

export function clearPersistentFlag(
  state: GameState,
  _side: string,
  card: Card,
  flag: string,
): void {
  clearFlagForCard(state, card, "persistent", flag);
}

// ---------------------------------------------------------------------------
// Specific game-action register/locks
// ---------------------------------------------------------------------------

function ensureRegister(side: {
  register?: Record<string, unknown>;
}): Record<string, unknown> {
  if (!side.register) side.register = {};
  return side.register;
}

export function preventDraw(state: GameState, _side?: string): void {
  ensureRegister(state.runner)["cannot-draw"] = true;
}

export function preventCurrent(state: GameState, _side?: string): void {
  ensureRegister(state.runner)["cannot-play-current"] = true;
}

type LockedHolder = { locked?: Record<string, string[]> };

function ensureLocked(holder: LockedHolder): Record<string, string[]> {
  if (!holder.locked) holder.locked = {};
  return holder.locked;
}

export function lockZone(state: GameState, cid: string, tside: string, tzone: string): void;
export function lockZone(state: GameState, side: string, cid: string, tside: string, tzone: string): void;
export function lockZone(...args: any[]): void {
  let state: GameState, cid: string, tside: string, tzone: string;
  if (args.length === 4) {
    [state, cid, tside, tzone] = args as [GameState, string, string, string];
  } else {
    state = args[0]; cid = args[2]; tside = args[3]; tzone = args[4];
  }
  const holder = (state as any)[tside] as LockedHolder;
  const locked = ensureLocked(holder);
  locked[tzone] = [cid, ...(locked[tzone] ?? [])];
}

export function releaseZone(state: GameState, cid: string, tside: string, tzone: string): void;
export function releaseZone(state: GameState, side: string, cid: string, tside: string, tzone: string): void;
export function releaseZone(...args: any[]): void {
  let state: GameState, cid: string, tside: string, tzone: string;
  if (args.length === 4) {
    [state, cid, tside, tzone] = args as [GameState, string, string, string];
  } else {
    state = args[0]; cid = args[2]; tside = args[3]; tzone = args[4];
  }
  const holder = (state as any)[tside] as LockedHolder;
  const locked = ensureLocked(holder);
  locked[tzone] = (locked[tzone] ?? []).filter((c: any) => c !== cid);
}

export function zoneLocked(
  state: GameState,
  side: string,
  zone: string,
): boolean {
  const locked = ((state as any)[side] as LockedHolder)?.locked?.[zone];
  return !!locked && locked.length > 0;
}

// ---------------------------------------------------------------------------
// Trash flags
// ---------------------------------------------------------------------------

export function untrashableWhileRezzed(
  state: GameState,
  side: string,
  card: Card,
): boolean {
  return anyEffects(
    state,
    side,
    "cannot-be-trashed",
    (v) => v === true,
    card,
    [],
  );
}

export function untrashableWhileResources(card: Card): boolean {
  return (
    cardFlag(card, "untrashable-while-resources", true) && isInstalled(card)
  );
}

// ---------------------------------------------------------------------------
// can-rez?
// ---------------------------------------------------------------------------

type RezReason =
  | true
  | "side"
  | "run-flag"
  | "turn-flag"
  | "persistent-flag"
  | "unique"
  | "req";

function canRezReason(state: GameState, side: string, card: Card): RezReason {
  const uniqueness = card.uniqueness === true;
  const cdef = cardDef(card);
  const rezReq = (cdef as any)["rez-req"] as ReqFn | undefined;

  if (!sameSide(side, card.side ?? "")) return "side";
  if (!runFlag(state, side, card, "can-rez")) return "run-flag";
  if (!turnFlag(state, side, card, "can-rez")) return "turn-flag";
  if (!persistentFlag(state, side, card, "can-rez")) return "persistent-flag";
  if (
    uniqueness &&
    allInstalled(state, "corp").some((c: any) => isRezzed(c) && c.code === card.code)
  ) {
    return "unique";
  }
  if (rezReq) {
    const ok = typeof rezReq === "function" ? (rezReq as any)(state, side, makeEID(state), card, []) : !!rezReq;
    if (!ok) return "req";
  }
  return true;
}

/**
 * Returns true if the card can be rezzed; toasts the reason if not.
 * Mirrors: can-rez? in flags.clj
 */
export function canRez(
  state: GameState,
  side: string,
  card: Card,
  opts?: { ignoreUnique?: boolean },
): boolean {
  const reason = canRezReason(state, side, card);
  const title = card.title ?? "";
  const reasonToast = (msg: string): boolean => {
    toast(state, side, msg);
    return false;
  };
  switch (reason) {
    case true:
      return true;
    case "side":
    case "run-flag":
    case "turn-flag":
    case "persistent-flag":
      return false;
    case "unique":
      return (
        !!opts?.ignoreUnique ||
        reasonToast(
          `Cannot rez a second copy of ${title} since it is unique. Please trash the other copy first`,
        )
      );
    case "req":
      return reasonToast(`Rez requirements for ${title} are not fulfilled`);
  }
}

// ---------------------------------------------------------------------------
// can-steal? / can-trash? / can-run? / can-access? / can-advance? / can-score?
// ---------------------------------------------------------------------------

export function canSteal(
  state: GameState,
  side: string,
  agenda: Card,
): boolean {
  return (
    !anyEffects(state, side, "cannot-steal", (v) => v === true, agenda, []) &&
    checkFlagTypes(state, side, agenda, "can-steal", [
      "currentTurn",
      "currentRun",
    ]) &&
    checkFlagTypes(state, side, agenda, "can-steal", [
      "currentTurn",
      "persistent",
    ])
  );
}

export function canTrash(state: GameState, side: string, card: Card): boolean {
  return (
    checkFlagTypes(state, side, card, "can-trash", [
      "currentTurn",
      "currentRun",
    ]) &&
    checkFlagTypes(state, side, card, "can-trash", [
      "currentTurn",
      "persistent",
    ])
  );
}

export function canRun(
  state: GameState,
  side: string,
  silent = false,
): boolean {
  const entries = state.flagStack.currentTurn["can-run"] ?? [];
  if (entries.length === 0) return true;
  if (!silent) {
    const titles = entries.map((e: any) => e.card.title ?? "");
    toast(state, side, `Cannot run due to ${enumerateStr(titles)}`);
  }
  return false;
}

export function canAccess(state: GameState, side: string, card: Card): boolean {
  return checkFlagTypes(state, side, card, "can-access", [
    "currentRun",
    "currentTurn",
    "persistent",
  ]);
}

/**
 * Like canAccess but toasts the cards that prevent access.
 * Mirrors: can-access-loud in flags.clj
 */
export function canAccessLoud(
  state: GameState,
  side: string,
  card: Card,
): boolean {
  const blockers = getPreventingCards(state, side, card, "can-access", [
    "currentRun",
    "currentTurn",
    "persistent",
  ]);
  if (blockers.length === 0) return true;
  const titles = blockers.map((c: any) => c.title ?? "");
  toast(
    state,
    side,
    `Cannot access ${cardStr(state, card)} because of ${enumerateStr(titles)}`,
    "info",
  );
  return false;
}

export function canAdvance(
  state: GameState,
  side: string,
  card: Card,
): boolean {
  return checkFlagTypes(state, side, card, "can-advance", [
    "currentTurn",
    "persistent",
  ]);
}

export function canScore(
  state: GameState,
  side: string,
  card: Card,
  opts?: { noReq?: boolean; ignoreTurn?: boolean },
): boolean {
  const noReq = !!opts?.noReq;
  const ignoreTurn = !!opts?.ignoreTurn;

  if (!(state.activePlayer === CORP_SIDE || ignoreTurn)) return false;
  if (!isAgenda(card)) return false;
  if (inScored(card)) return false;

  if (!noReq) {
    const cost = (card as any).currentAdvancementRequirement as
      | number
      | undefined;
    if (cost == null || cost > getCounter(card, "advancement")) return false;
  }

  if (
    cardFlag(card, "can-score") &&
    !cardFlagFn(state, side, card, "can-score")
  ) {
    return false;
  }

  if (
    !checkFlagTypes(state, side, card, "can-score", [
      "currentTurn",
      "persistent",
    ])
  ) {
    return false;
  }

  if (anyEffects(state, side, "cannot-score", (v) => v === true, card, []))
    return false;

  const corpRegister = state.corp.register ?? {};
  if (corpRegister["terminal"]) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Score-area queries
// ---------------------------------------------------------------------------

/**
 * Returns true if `card` is in the given side's scored area.
 * Mirrors: is-scored? in flags.clj
 */
export function isScored(state: GameState, side: string, card: Card): boolean {
  const scored = side === CORP_SIDE ? state.corp.scored : state.runner.scored;
  return scored.some((c: any) => sameCard(c, card));
}

export function inCorpScored(
  state: GameState,
  _side: string,
  card: Card,
): boolean {
  return isScored(state, CORP_SIDE, card);
}

export function inRunnerScored(
  state: GameState,
  _side: string,
  card: Card,
): boolean {
  return isScored(state, "runner", card);
}

// ---------------------------------------------------------------------------
// Hosting / when-scored
// ---------------------------------------------------------------------------

function isDisabledRegInternal(state: GameState, card: Card | null): boolean {
  if (!card) return false;
  return state.disabledCardReg.has(card.cid);
}

/**
 * Returns true if the card may host other cards.
 * Mirrors: can-host? in flags.clj
 */
export function canHost(state: GameState, card: Card): boolean {
  return (
    !isRezzed(card) ||
    !(cardDef(card) as any)["cannot-host"] ||
    isDisabledRegInternal(state, card)
  );
}

/**
 * Returns the card-def's :on-score handler, if any.
 * Mirrors: when-scored? in flags.clj
 */
export function whenScored(card: Card): unknown {
  return (cardDef(card) as any)["on-score"];
}

export { isTagged as tagged, countBadPub, countTags } from "../../jinteki/utils";
export { unprotected } from "./card";
