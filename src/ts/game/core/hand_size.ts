// Hand size calculations.
// Mirrors: src/clj/game/core/hand_size.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type {
  ReqFn,
  StaticAbility,
  Targets,
  ValueFn,
} from "./types";
import { CORP_SIDE, RUNNER_SIDE } from "./state";
import { sumEffects } from "./effects";

function sumHandSizeEffects(state: GameState, side: string): number {
  let base: number;
  let brainDamage = 0;
  if (side === CORP_SIDE) {
    base = state.corp.handSize.base || 5;
  } else {
    base = state.runner.handSize.base || 5;
    brainDamage = state.runner.brainDamage;
  }
  return (
    base -
    brainDamage +
    sumEffects(state, side, "hand-size", null, []) +
    sumEffects(state, side, "user-hand-size", null, [])
  );
}

/**
 * Returns the current total hand size for the given side.
 * Mirrors: hand-size in hand_size.clj
 */
export function handSizeTotal(state: GameState, side: string): number {
  if (side === CORP_SIDE) {
    return state.corp.handSize.total || 5;
  }
  return state.runner.handSize.total || 5;
}

export const handSize = handSizeTotal;

/**
 * Recalculates and stores the hand size total for the given side.
 * Returns true if the value changed.
 * Mirrors: update-hand-size in hand_size.clj
 */
export function updateHandSize(state: GameState, side: string): boolean {
  const oldTotal =
    side === CORP_SIDE
      ? state.corp.handSize.total
      : state.runner.handSize.total;
  const newTotal = sumHandSizeEffects(state, side);
  if (oldTotal === newTotal) return false;
  if (side === CORP_SIDE) {
    state.corp.handSize.total = newTotal;
  } else {
    state.runner.handSize.total = newTotal;
  }
  return true;
}

/**
 * Returns the live effective hand size including all active static effects.
 */
export function handSizeEffective(state: GameState, side: string): number {
  return sumHandSizeEffects(state, side);
}

/**
 * Creates a StaticAbility that grants +value hand size.
 * Mirrors: hand-size+ in hand_size.clj
 */
export function handSizePlus(value: ValueFn): StaticAbility;
export function handSizePlus(req: ReqFn | null, value: ValueFn): StaticAbility;
export function handSizePlus(
  reqOrValue: ReqFn | ValueFn | null,
  value?: ValueFn,
): StaticAbility {
  if (value === undefined) {
    return { type: "hand-size", value: reqOrValue as ValueFn };
  }
  return {
    type: "hand-size",
    req: (reqOrValue as ReqFn | null) ?? undefined,
    value,
  };
}

function sideGuardedReq(
  expectedSide: string,
  inner: ReqFn | null,
): ReqFn {
  return (
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: Targets,
  ) => {
    if (side !== expectedSide) return false;
    if (inner == null) return true;
    if (typeof inner === "function") {
      return !!inner(state, side, eid, card, targets);
    }
    return !!inner;
  };
}

/**
 * Creates a Corp-only hand-size+ StaticAbility.
 * Mirrors: corp-hand-size+ in hand_size.clj
 */
export function corpHandSizePlus(value: ValueFn): StaticAbility;
export function corpHandSizePlus(
  req: ReqFn | null,
  value: ValueFn,
): StaticAbility;
export function corpHandSizePlus(
  reqOrValue: ReqFn | ValueFn | null,
  value?: ValueFn,
): StaticAbility {
  if (value === undefined) {
    return handSizePlus(sideGuardedReq(CORP_SIDE, null), reqOrValue as ValueFn);
  }
  return handSizePlus(
    sideGuardedReq(CORP_SIDE, reqOrValue as ReqFn | null),
    value,
  );
}

/**
 * Creates a Runner-only hand-size+ StaticAbility.
 * Mirrors: runner-hand-size+ in hand_size.clj
 */
export function runnerHandSizePlus(value: ValueFn): StaticAbility;
export function runnerHandSizePlus(
  req: ReqFn | null,
  value: ValueFn,
): StaticAbility;
export function runnerHandSizePlus(
  reqOrValue: ReqFn | ValueFn | null,
  value?: ValueFn,
): StaticAbility {
  if (value === undefined) {
    return handSizePlus(
      sideGuardedReq(RUNNER_SIDE, null),
      reqOrValue as ValueFn,
    );
  }
  return handSizePlus(
    sideGuardedReq(RUNNER_SIDE, reqOrValue as ReqFn | null),
    value,
  );
}
