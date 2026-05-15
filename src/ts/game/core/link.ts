// Runner link strength calculations.
// Mirrors: src/clj/game/core/link.clj + src/go/game/core/link.go

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { ReqFn, ValueFn, StaticAbility } from "./types.ts";
import { RUNNER_SIDE } from "./state";
import { sumEffects } from "./effects";

/**
 * Returns the runner's current link strength.
 * Mirrors: get-link in link.clj
 */
export function getLink(state: GameState): number {
  return state.runner.link;
}

function sumLinkEffects(state: GameState): number {
  const identity = state.runner.identity;
  const baselink = identity?.baselink ?? 0;
  return (
    baselink +
    sumEffects(state, RUNNER_SIDE, "user-link", null, []) +
    sumEffects(state, RUNNER_SIDE, "link", null, [])
  );
}

/**
 * Recalculates and stores the runner's link strength.
 * Returns true if the value changed.
 * Mirrors: update-link in link.clj
 */
export function updateLink(state: GameState): boolean {
  const oldLink = getLink(state);
  const newLink = sumLinkEffects(state);
  if (oldLink === newLink) return false;
  state.runner.link = newLink;
  return true;
}

/**
 * Creates a StaticAbility that grants +value link.
 * Mirrors: link+ in link.clj
 */
export function linkPlus(req: ReqFn | null, value: ValueFn): StaticAbility {
  return {
    type: "link",
    req: req ?? undefined,
    value,
  };
}
