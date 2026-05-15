// Effect ID (EID) management.
// Mirrors: src/clj/game/core/eid.clj + src/go/game/core/eid.go

import type { GameState } from "./state";
import type { Card } from "./card";
import type { AbilityFn } from "./types.ts";

// ---------------------------------------------------------------------------
// EID type
// ---------------------------------------------------------------------------

export interface EID {
  id: number;
  source?: Card | null;
  sourceType?: string;
  sourceInfo?: Record<string, unknown>;
  result?: unknown;
}

// ---------------------------------------------------------------------------
// EID factory helpers
// ---------------------------------------------------------------------------

/** Allocates a new EID from the game state. Mirrors (make-eid state). */
export function makeEID(state: GameState): EID {
  state.eidCounter += 1;
  return { id: state.eidCounter };
}

/**
 * Creates a new EID inheriting source info from an existing EID.
 * Mirrors (make-eid state existing-eid).
 */
export function makeEIDFrom(state: GameState, existing: EID | null): EID {
  const eid = makeEID(state);
  if (existing) {
    eid.source = existing.source;
    eid.sourceType = existing.sourceType;
    eid.sourceInfo = existing.sourceInfo;
  }
  return eid;
}

/**
 * Attaches a result value to a copy of the EID.
 * Mirrors make-result in eid.clj.
 */
export function makeResult(eid: EID, result: unknown): EID {
  return { ...eid, result };
}

/**
 * Returns the first ability target from EID source-info.
 * Mirrors get-ability-targets in eid.clj.
 */
export function getAbilityTargets(eid: EID | null): unknown {
  if (!eid?.sourceInfo) return null;
  const targets = eid.sourceInfo["ability-targets"] as unknown[];
  return targets?.[0] ?? null;
}

/**
 * Returns true if the EID represents the basic advance action.
 * Mirrors is-basic-advance-action? in eid.clj.
 */
export function isBasicAdvanceAction(
  eid: EID | null,
  isBasicAction: (c: Card) => boolean,
): boolean {
  if (!eid?.source || !eid?.sourceInfo) return false;
  if (!isBasicAction(eid.source)) return false;
  return eid.sourceInfo["ability-idx"] === 4;
}

// ---------------------------------------------------------------------------
// EID callback management (lives on GameState, implemented here for co-location)
// ---------------------------------------------------------------------------

/**
 * Registers a callback to invoke when the EID is completed.
 * Mirrors register-effect-completed in eid.clj.
 */
export function registerEIDCallback(
  state: GameState,
  eid: EID,
  callback: AbilityFn,
): void {
  if (state.eidCallbacks.has(eid.id)) return; // skip duplicate (mirrors Clojure throw)
  state.eidCallbacks.set(eid.id, callback);
}

/**
 * Removes any :waiting prompts associated with this EID on the given side.
 * Mirrors clear-eid-wait-prompt in eid.clj.
 */
export function clearEIDWaitPrompt(
  state: GameState,
  side: string,
  eid: EID,
): void {
  const queue = side === "corp" ? state.corpPrompt : state.runnerPrompt;
  const filtered = queue.filter(
    (p) => !(p.eid?.id === eid.id && p.promptType === "waiting"),
  );
  if (side === "corp") {
    state.corpPrompt = filtered;
  } else {
    state.runnerPrompt = filtered;
  }
}

/**
 * Fires the registered callback for the given EID.
 * Mirrors effect-completed in eid.clj.
 */
export function effectCompleted(
  state: GameState,
  side: string,
  eid: EID,
): void {
  clearEIDWaitPrompt(state, "corp", eid);
  clearEIDWaitPrompt(state, "runner", eid);
  const callback = state.eidCallbacks.get(eid.id);
  if (callback) {
    state.eidCallbacks.delete(eid.id);
    callback(state, side, eid, null, []);
  }
}

/**
 * Calls effectCompleted with a result value attached to the EID.
 * Mirrors complete-with-result in eid.clj.
 */
export function completeWithResult(
  state: GameState,
  side: string,
  eid: EID,
  result: unknown,
): void {
  effectCompleted(state, side, makeResult(eid, result));
}
