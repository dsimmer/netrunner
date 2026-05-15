// Value change helper.
// Mirrors: src/clj/game/core/change-vals.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { ReqFn, ValueFn } from "./types.ts";
import { RUNNER_SIDE, CORP_SIDE } from "./state";
import { updateAllAgendaPoints } from "./agendas";
import { registerLingeringEffect } from "./effects";
import { gain, lose } from "./gaining";
import { handSizeTotal, updateHandSize } from "./hand_size";
import { getLink, updateLink } from "./link";
import { availableMu, updateMu } from "./memory";
import { systemMsg } from "./say";
import { updateTagStatus } from "./tags";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Send a system message indicating the property change.
 * Mirrors: change-msg in change-vals.clj
 */
function changeMsg(
  state: GameState,
  side: string,
  key: string,
  newVal: number,
  delta: number,
): void {
  const displayKey =
    key === "brain-damage" ? "core damage" : key.replace(/-/g, " ");
  systemMsg(
    state,
    side,
    `sets ${displayKey} to ${newVal} (${delta > 0 ? `+${delta}` : delta})`,
  );
}

/**
 * Convert a camelCase state property key to the kebab-case string used
 * by gain/lose for resource identification.
 */
function toResourceKey(key: string): string {
  return key.replace(/([A-Z])/g, "-$1").toLowerCase();
}

// ---------------------------------------------------------------------------
// Property-specific change implementations
// ---------------------------------------------------------------------------

/**
 * Change a player's property using the :mod system (gain + message).
 * Mirrors: change-map in change-vals.clj
 */
function changeMap(
  state: GameState,
  side: string,
  key: string,
  delta: number,
): void {
  // Mirrors: (gain state side key {:mod delta})
  // In TS, gain adds flat to the resource. The effect system handles :mod tracking.
  if (delta >= 0) {
    gain(state, side, toResourceKey(key), delta);
  } else {
    lose(state, side, toResourceKey(key), Math.abs(delta));
  }
  // base-mod-size equivalent: read current value from state
  const sideObj: Record<string, unknown> =
    side === CORP_SIDE ? state.corp : state.runner;
  const current =
    typeof sideObj[key] === "number" ? (sideObj[key] as number) : 0;
  changeMsg(state, side, key, current, delta);
}

/**
 * Change the runner's available memory using a lingering effect.
 * Mirrors: change-mu in change-vals.clj
 */
function changeMu(state: GameState, side: string, delta: number): void {
  const valueFn: ValueFn = () => delta;
  registerLingeringEffect(
    state,
    side,
    null as unknown as Card,
    "user-available-mu",
    "true",
    null,
    valueFn,
  );
  updateMu(state);
  systemMsg(
    state,
    side,
    `sets unused [mu] to ${availableMu(state)} (${delta > 0 ? `+${delta}` : delta})`,
  );
}

/**
 * Change the runner's tag count.
 * Mirrors: change-tags in change-vals.clj
 */
function changeTags(state: GameState, delta: number): void {
  gain(state, RUNNER_SIDE, "tag", delta);
  // Clamp tags at 0 (gain doesn't clamp, so we do it manually for negative)
  state.runner.tag.base = Math.max(0, state.runner.tag.base);
  // Update total to match base
  state.runner.tag.total = state.runner.tag.base;
  updateTagStatus(state, RUNNER_SIDE);
  systemMsg(
    state,
    RUNNER_SIDE,
    `sets Tags to ${state.runner.tag.total} (${delta > 0 ? `+${delta}` : delta})`,
  );
}

/**
 * Change corp's base bad publicity count.
 * Mirrors: change-bad-pub in change-vals.clj
 */
function changeBadPub(state: GameState, delta: number): void {
  if (delta < 0) {
    lose(state, CORP_SIDE, "bad-publicity", Math.abs(delta));
  } else {
    gain(state, CORP_SIDE, "bad-publicity", delta);
  }
  systemMsg(
    state,
    CORP_SIDE,
    `sets Bad Publicity to ${state.corp.badPublicity.base} (${delta > 0 ? `+${delta}` : delta})`,
  );
}

/**
 * Change a player's agenda points using a lingering effect.
 * Mirrors: change-agenda-points in change-vals.clj
 */
function changeAgendaPoints(
  state: GameState,
  side: string,
  delta: number,
): void {
  const userSide = side;
  const reqFn: ReqFn = (_s, targetSide) => targetSide === userSide;
  const valueFn: ValueFn = () => delta;
  registerLingeringEffect(
    state,
    side,
    null as unknown as Card,
    "user-agenda-points",
    "true",
    reqFn,
    valueFn,
  );
  updateAllAgendaPoints(state);
  systemMsg(
    state,
    side,
    `sets [their] agenda points to ${side === CORP_SIDE ? state.corp.agendaPoint : state.runner.agendaPoint} (${delta > 0 ? `+${delta}` : delta})`,
  );
}

/**
 * Change the runner's link using a lingering effect.
 * Mirrors: change-link in change-vals.clj
 */
function changeLink(state: GameState, side: string, delta: number): void {
  const valueFn: ValueFn = () => delta;
  registerLingeringEffect(
    state,
    side,
    null as unknown as Card,
    "user-link",
    "true",
    null,
    valueFn,
  );
  updateLink(state);
  systemMsg(
    state,
    side,
    `sets [their] [link] to ${getLink(state)} (${delta > 0 ? `+${delta}` : delta})`,
  );
}

/**
 * Change a player's hand size using a lingering effect.
 * Mirrors: change-hand-size in change-vals.clj
 */
function changeHandSize(state: GameState, side: string, delta: number): void {
  const userSide = side;
  const reqFn: ReqFn = (_s, targetSide) => targetSide === userSide;
  const valueFn: ValueFn = () => delta;
  registerLingeringEffect(
    state,
    side,
    null as unknown as Card,
    "user-hand-size",
    "true",
    reqFn,
    valueFn,
  );
  updateHandSize(state, side);
  systemMsg(
    state,
    side,
    `sets [their] hand size to ${handSizeTotal(state, side)} (${delta > 0 ? `+${delta}` : delta})`,
  );
}

/**
 * Change a player's base generic property (credits, clicks, etc.).
 * Mirrors: change-generic in change-vals.clj
 */
function changeGeneric(
  state: GameState,
  side: string,
  key: string,
  delta: number,
): void {
  const sideObj: Record<string, number> =
    side === CORP_SIDE ? (state.corp as any) : (state.runner as any);

  if (delta < 0) {
    lose(state, side, toResourceKey(key), Math.abs(delta));
  } else {
    sideObj[key] = (sideObj[key] ?? 0) + delta;
  }
  changeMsg(state, side, key, sideObj[key] ?? 0, delta);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Increase/decrease a player's property (clicks, credits, MU, etc.) by delta.
 * Mirrors: change in change-vals.clj
 */
export function change(
  state: GameState,
  side: string,
  opts: { key: string; delta: number },
): void {
  const { key, delta } = opts;
  switch (key) {
    case "memory":
      changeMu(state, side, delta);
      break;
    case "hand-size":
      changeHandSize(state, side, delta);
      break;
    case "tag":
      changeTags(state, delta);
      break;
    case "bad-publicity":
      changeBadPub(state, delta);
      break;
    case "agenda-point":
      changeAgendaPoints(state, side, delta);
      break;
    case "link":
      changeLink(state, side, delta);
      break;
    default:
      changeGeneric(state, side, key, delta);
      break;
  }
}
