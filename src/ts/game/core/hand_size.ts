// Hand size calculations.
// Mirrors: src/clj/game/core/hand_size.clj + src/go/game/core/hand_size.go

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { ReqFn, ValueFn, StaticAbility } from "./types.ts";
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
 * Mirrors: hand-size in hand_size.clj (the computed version)
 */
export function handSizeEffective(state: GameState, side: string): number {
  return sumHandSizeEffects(state, side);
}

/**
 * Creates a StaticAbility that grants +value hand size.
 * Mirrors: hand-size+ in hand_size.clj
 */
export function handSizePlus(req: ReqFn | null, value: ValueFn): StaticAbility {
  return { type: "hand-size", req: req ?? undefined, value };
}

/**
 * Creates a Corp-only hand-size+ StaticAbility.
 * Mirrors: corp-hand-size+ in hand_size.clj
 */
export function corpHandSizePlus(
  req: ReqFn | null,
  value: ValueFn,
): StaticAbility {
  const corpReq: ReqFn = (state, side, eid, card, targets) => {
    if (side !== CORP_SIDE) return false;
    return req ? req(state, side, eid, card, targets) : true;
  };
  return handSizePlus(corpReq, value);
}

/**
 * Creates a Runner-only hand-size+ StaticAbility.
 * Mirrors: runner-hand-size+ in hand_size.clj
 */
export function runnerHandSizePlus(
  req: ReqFn | null,
  value: ValueFn,
): StaticAbility {
  const runnerReq: ReqFn = (state, side, eid, card, targets) => {
    if (side !== RUNNER_SIDE) return false;
    return req ? req(state, side, eid, card, targets) : true;
  };
  return handSizePlus(runnerReq, value);
}
