// Memory unit (MU) tracking and effect helpers.
// Mirrors: src/clj/game/core/memory.clj

import type { GameState, Effect, MemoryBucket } from "./state";
import type { Card } from "./card";
import type { EID, ReqFn, Side, State, StaticAbility, ValueFn } from "./types.ts";
import { hasSubtype, isProgram } from "./card";
import { cardDef } from "./card_defs";
import { makeEID } from "./eid";
import { getEffectMaps, getEffects, registerLingeringEffect } from "./effects";
import { toast } from "./toasts";

// ---------------------------------------------------------------------------
// MU types
// ---------------------------------------------------------------------------

/** [mu-type, amount] pair, e.g. ["regular", 4] or ["virus", 2]. */
export type MuPair = [string, number];

/** Resolved value of a :available-mu effect: a tuple, a number, or a fn returning a tuple. */
export type MuValue =
  | MuPair
  | number
  | ((
      state: GameState,
      side: string,
      eid: ReturnType<typeof makeEID>,
      card: Card | null,
      targets: Card[],
    ) => MuPair);

const REGULAR: string = "regular";
const CAISSA: string = "caissa";
const VIRUS: string = "virus";

/** Predicates for non-regular mu types. Mirrors type-preds in memory.clj. */
const typePreds: Record<string, (card: Card | null) => boolean> = {
  [CAISSA]: (card) => !!hasSubtype(card, "Caïssa"),
  [VIRUS]: (card) => isProgram(card) && !!hasSubtype(card, "Virus"),
};

// ---------------------------------------------------------------------------
// Effect-map builders
// ---------------------------------------------------------------------------

function isMuPair(v: unknown): v is MuPair {
  return Array.isArray(v) && v.length === 2 && typeof v[1] === "number";
}

/**
 * For use in :static-abilities and register-lingering-effect.
 * Returns an effect map for :available-mu.
 * Takes either the mu value or a :req fn and the value.
 * The value may be a number (regular MU), a [type, amount] tuple, or a fn returning a tuple.
 * Mirrors: mu+ in memory.clj
 */
export function muPlus(value: MuValue): StaticAbility;
export function muPlus(req: ReqFn, value: MuValue): StaticAbility;
export function muPlus(
  reqOrValue: ReqFn | MuValue,
  maybeValue?: MuValue,
): StaticAbility {
  let req: ReqFn;
  let value: MuValue;
  if (maybeValue === undefined) {
    req = () => true;
    value = reqOrValue as MuValue;
  } else {
    req = reqOrValue as ReqFn;
    value = maybeValue;
  }

  let resolved: ValueFn;
  if (typeof value === "function") {
    resolved = value as unknown as ValueFn;
  } else if (isMuPair(value)) {
    const pair = value;
    resolved = () => pair;
  } else if (typeof value === "number") {
    const n = value;
    resolved = () => [REGULAR, n] as MuPair;
  } else {
    throw new Error(
      `muPlus needs a tuple, number, or function: ${JSON.stringify(value)}`,
    );
  }

  return {
    type: "available-mu",
    req,
    value: resolved,
  };
}

/**
 * Wrapper around muPlus for fixed virus-only MU.
 * Mirrors: virus-mu+ in memory.clj
 */
export function virusMuPlus(amount: number): StaticAbility;
export function virusMuPlus(req: ReqFn, amount: number): StaticAbility;
export function virusMuPlus(
  reqOrAmount: ReqFn | number,
  maybeAmount?: number,
): StaticAbility {
  if (maybeAmount === undefined) {
    return muPlus([VIRUS, reqOrAmount as number]);
  }
  return muPlus(reqOrAmount as ReqFn, [VIRUS, maybeAmount]);
}

/**
 * Wrapper around muPlus for fixed Caissa-only MU.
 * Mirrors: caissa-mu+ in memory.clj
 */
export function caissaMuPlus(amount: number): StaticAbility;
export function caissaMuPlus(req: ReqFn, amount: number): StaticAbility;
export function caissaMuPlus(
  reqOrAmount: ReqFn | number,
  maybeAmount?: number,
): StaticAbility {
  if (maybeAmount === undefined) {
    return muPlus([CAISSA, reqOrAmount as number]);
  }
  return muPlus(reqOrAmount as ReqFn, [CAISSA, maybeAmount]);
}

// ---------------------------------------------------------------------------
// Available MU
// ---------------------------------------------------------------------------

/**
 * Returns the runner's currently unused regular MU
 * (after accounting for overflow from typed pools).
 * Mirrors: available-mu in memory.clj
 */
export function availableMu(state: GameState): number {
  const memory = state.runner.memory;
  let total = memory.available ?? 0;
  for (const bucket of Object.values(memory.onlyFor ?? {})) {
    total += bucket?.available ?? 0;
  }
  return total - (memory.used ?? 0);
}

/** Uppercase alias used by some callers. */
export const availableMU = availableMu;

/**
 * Returns [mu-type, value] pairs for all sources of available MU.
 * Mirrors: get-available-mu (private) in memory.clj
 */
function getAvailableMu(state: GameState): MuPair[] {
  const base = state.runner.memory?.base ?? 0;
  const out: MuPair[] = [[REGULAR, base]];
  const collect = (effectType: string) => {
    const vals = getEffects(state, "runner", effectType, null, []);
    for (const v of vals) {
      if (isMuPair(v)) {
        out.push(v);
      } else if (typeof v === "number") {
        out.push([REGULAR, v]);
      }
    }
  };
  collect("user-available-mu");
  collect("available-mu");
  return out;
}

/** Zero-filled map of all mu-type buckets. */
function zeroedTypeMap(): Record<string, number> {
  const m: Record<string, number> = { [REGULAR]: 0 };
  for (const k of Object.keys(typePreds)) m[k] = 0;
  return m;
}

/**
 * Folds a list of [mu-type, amount] pairs into a per-type total.
 * Mirrors: merge-available-memory (private) in memory.clj
 */
function mergeAvailableMemory(muList: MuPair[]): Record<string, number> {
  const acc = zeroedTypeMap();
  for (const [muType, amount] of muList) {
    acc[muType] = (acc[muType] ?? 0) + amount;
  }
  return acc;
}

/**
 * For each :used-mu effect, attribute its value to the most specific bucket
 * its card matches, falling back to :regular.
 * Mirrors: merge-used-memory (private) in memory.clj
 */
function mergeUsedMemory(
  state: GameState,
  usedMuEffects: Effect[],
): Record<string, number> {
  const acc = zeroedTypeMap();
  const eid = makeEID(state);
  const targets: Card[] = [];
  for (const eff of usedMuEffects) {
    let attributed = false;
    for (const [muType, pred] of Object.entries(typePreds)) {
      if (pred(eff.card)) {
        acc[muType] =
          (acc[muType] ?? 0) + readEffectValue(state, eid, targets, eff);
        attributed = true;
        break;
      }
    }
    if (!attributed) {
      acc[REGULAR] =
        (acc[REGULAR] ?? 0) + readEffectValue(state, eid, targets, eff);
    }
  }
  return acc;
}

function readEffectValue(
  state: GameState,
  eid: ReturnType<typeof makeEID>,
  targets: Card[],
  eff: Effect,
): number {
  const v = eff.value ? eff.value(state, "runner", eid, eff.card, targets) : 0;
  return typeof v === "number" ? v : 0;
}

/**
 * Returns the total used MU once typed-bucket overflow is folded into regular.
 * Mirrors: combine-used-mu in memory.clj
 */
export function combineUsedMu(
  availableByType: Record<string, number>,
  usedByType: Record<string, number>,
): number {
  let totalUsed = usedByType[REGULAR] ?? 0;
  for (const muType of Object.keys(typePreds)) {
    const available = availableByType[muType] ?? 0;
    const used = usedByType[muType] ?? 0;
    const diff = available - used;
    if (diff < 0) totalUsed += -diff;
  }
  return totalUsed;
}

interface NewMu {
  onlyFor: Record<string, MemoryBucket>;
  available: number;
  used: number;
}

/**
 * Builds a fresh memory snapshot from the current effect state.
 * Mirrors: build-new-mu in memory.clj
 */
export function buildNewMu(state: GameState): NewMu {
  const muList = getAvailableMu(state);
  const availableByType = mergeAvailableMemory(muList);
  const eid = makeEID(state);
  const usedMuEffects = getEffectMaps(state, "runner", "used-mu", eid, []);
  const usedByType = mergeUsedMemory(state, usedMuEffects);

  const onlyFor: Record<string, MemoryBucket> = {};
  for (const muType of Object.keys(typePreds)) {
    onlyFor[muType] = {
      available: availableByType[muType] ?? 0,
      used: usedByType[muType] ?? 0,
    };
  }

  return {
    onlyFor,
    available: availableByType[REGULAR] ?? 0,
    used: combineUsedMu(availableByType, usedByType),
  };
}

/**
 * Recomputes memory and writes any changes back to the runner.
 * Warns when usage exceeds availability.
 * Mirrors: update-mu in memory.clj
 */
export function updateMu(state: GameState): boolean {
  const mem = state.runner.memory;
  const oldMu = {
    available: mem.available,
    used: mem.used,
    onlyFor: mem.onlyFor,
  };
  const newMu = buildNewMu(state);
  const changed = !shallowEqualMu(oldMu, newMu);
  if (changed) {
    if (newMu.available - newMu.used < 0) {
      toast(state, "runner", "You have exceeded your memory units!");
    }
    mem.available = newMu.available;
    mem.used = newMu.used;
    mem.onlyFor = newMu.onlyFor;
  }
  return changed;
}

/** Uppercase alias used by some callers. */
export const updateMU = updateMu;

function shallowEqualMu(
  a: { available: number; used: number; onlyFor: Record<string, MemoryBucket> },
  b: NewMu,
): boolean {
  if (a.available !== b.available) return false;
  if (a.used !== b.used) return false;
  const ak = Object.keys(a.onlyFor ?? {});
  const bk = Object.keys(b.onlyFor ?? {});
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    const av = a.onlyFor[k];
    const bv = b.onlyFor[k];
    if (!av || !bv) return false;
    if (av.available !== bv.available || av.used !== bv.used) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Per-card MU inspection
// ---------------------------------------------------------------------------

/**
 * Returns the MU a card's first :used-mu static ability would consume right now.
 * Mirrors: some-mu-effect? in memory.clj
 */
export function someMuEffect(state: GameState, card: Card): number {
  const def = cardDef(card);
  const ab = def.staticAbilities?.find((a: any) => a.type === "used-mu");
  if (!ab) return 0;
  const eid = makeEID(state);
  if (ab.req) {
    const ok = typeof ab.req === "function" ? (ab.req as any)(state, "runner", eid, card, []) : !!ab.req;
    if (!ok) return 0;
  }
  if (!ab.value) return 0;
  const v = typeof ab.value === "function" ? (ab.value as any)(state, "runner", eid, card, []) : ab.value;
  return typeof v === "number" ? v : 0;
}

/**
 * Returns the MU cost of installing the given program (printed + static effects).
 * Mirrors: expected-mu in memory.clj
 */
export function expectedMu(state: GameState, card: Card): number {
  if (!isProgram(card)) return 0;
  return (card.memoryunits ?? 0) + someMuEffect(state, card);
}

/** Uppercase alias used by some callers. */
export const expectedMU = expectedMu;

/**
 * Would installing this card keep the runner within their MU limit?
 * Returns undefined for non-program cards (mirrors Clojure's nil).
 * Mirrors: sufficient-mu? in memory.clj
 */
export function sufficientMu(
  state: GameState,
  card: Card,
): boolean | undefined {
  if (!isProgram(card)) return undefined;
  const muCost = expectedMu(state, card);
  const muList = getAvailableMu(state);
  const availableByType = mergeAvailableMemory(muList);
  const eid = makeEID(state);
  const liveEffects = getEffectMaps(state, "runner", "used-mu", eid, []);
  const hypothetical: Effect = {
    uuid: "",
    type: "used-mu",
    duration: "while-active",
    card,
    value: () => muCost,
  };
  const usedByType = mergeUsedMemory(state, [...liveEffects, hypothetical]);
  const totalAvailable = availableByType[REGULAR] ?? 0;
  const totalUsed = combineUsedMu(availableByType, usedByType);
  return totalAvailable - totalUsed >= 0;
}

/** Uppercase alias used by some callers. */
export const sufficientMU = sufficientMu;

/**
 * (Re)establish a lingering :used-mu effect for an installed program.
 * Mirrors: init-mu-cost in memory.clj
 */
export function initMuCost(state: GameState, card: Card): void {
  const cost = card.memoryunits ?? 0;
  const valueFn: ValueFn = () => cost;
  registerLingeringEffect(
    state,
    "runner",
    card,
    "used-mu",
    "while-active",
    null,
    valueFn,
  );
  updateMu(state);
}

import { getXFn } from "./def_helpers_2";

/** Resolved get-x-fn — see clojure `get-x-fn`. */
export const getxFn = (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
  getXFn()(state, side, eid, card, targets);

/** Returns total MU. Alias for availableMu summing. */
export function getMemory(state: any): number {
  return availableMu(state as any);
}

/** Returns MU value on a card. */
export function getMu(card: any): number {
  return card?.memoryunits ?? card?.memoryUnits ?? 0;
}
