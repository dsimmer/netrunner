// Effect ID (EID) management.
// Mirrors: src/clj/game/core/eid.clj + src/go/game/core/eid.go

import type { GameState } from "./state";
import type { Card } from "./card";
import type { AbilityFn } from "./types";
// ---------------------------------------------------------------------------
// EID type
// ---------------------------------------------------------------------------

export interface EID {
  id?: number;
  source?: Card | null;
  sourceType?: string;
  "source-type"?: string;
  sourceInfo?: Record<string, unknown>;
  "source-info"?: Record<string, unknown>;
  result?: unknown;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// EID factory helpers
// ---------------------------------------------------------------------------

/** Allocates a new EID from the game state. Mirrors (make-eid state). */
export function makeEID(state: GameState, existing?: EID | null): EID {
  state.eidCounter += 1;
  const eid: EID = { id: state.eidCounter };
  if (existing) {
    eid.source = existing.source;
    eid.sourceType = existing.sourceType;
    eid.sourceInfo = existing.sourceInfo;
  }
  return eid;
}

// Alias for compatibility with card effect code. Accepts an optional
// existing-eid argument to mirror Clojure's (make-eid state existing-eid).
export function makeEid(state: GameState, existing?: EID | null): EID {
  if (existing) return makeEIDFrom(state, existing);
  return makeEID(state);
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
export function isBasicAdvanceAction(eid: EID | null): boolean;
export function isBasicAdvanceAction(eid: EID | null, isBasicAction: (c: Card) => boolean): boolean;
export function isBasicAdvanceAction(
  eid: EID | null,
  isBasicActionFn?: (c: Card) => boolean,
): boolean {
  if (!eid?.source || !eid?.sourceInfo) return false;
  if (isBasicActionFn && !isBasicActionFn(eid.source)) return false;
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
  const eidId = eid.id;
  if (eidId === undefined) return;
  if (state.eidCallbacks.has(eidId)) return; // skip duplicate (mirrors Clojure throw)
  state.eidCallbacks.set(eidId, callback);
}

// Alias for compatibility with card effect code
export const registerEffectCompleted = registerEIDCallback;

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

export const clearEidWaitPrompt = clearEIDWaitPrompt;

/**
 * Fires the registered callback for the given EID.
 * Mirrors effect-completed in eid.clj.
 */
export function effectCompleted(stateOrEid: any, sideOrUndef?: any, eidOrUndef?: any): void {
  // Permissive: accept (state, side, eid) or (state, eid) or (eid)
  let state: any = stateOrEid;
  let side: any = sideOrUndef;
  let eid: any = eidOrUndef;
  if (eid === undefined) {
    if (side && typeof side === 'object' && 'id' in side) {
      eid = side; side = undefined;
    } else if (state && typeof state === 'object' && 'id' in state && !state.eidCounter) {
      eid = state; state = undefined;
    }
  }
  if (!eid) return;
  if (state && state.eidCallbacks) {
    try { clearEIDWaitPrompt(state, "corp", eid); } catch {}
    try { clearEIDWaitPrompt(state, "runner", eid); } catch {}
    const callback = state.eidCallbacks.get(eid.id);
    if (callback) {
      state.eidCallbacks.delete(eid.id);
      callback(state, side, eid, null, []);
    }
  }
}

/**
 * Calls effectCompleted with a result value attached to the EID.
 * Mirrors complete-with-result in eid.clj.
 */
export function completeWithResult(eid: EID, result: unknown): void;
export function completeWithResult(state: GameState, side: string, eid: EID, result: unknown): void;
export function completeWithResult(...args: any[]): void {
  if (args.length === 2) {
    // shorthand (eid, result): can't fire callback without state — no-op.
    return;
  }
  const state = args[0] as GameState;
  const side = args[1] as string;
  const eid = args[2] as EID;
  const result = args[3];
  effectCompleted(state, side, makeResult(eid, result));
}

/** Accessor for the source card on an EID. */
export function source(eid: EID | null): Card | null | undefined {
  return eid?.source ?? null;
}

/** Accessor for source-type on an EID. */
export function sourceType(eid: EID | null): string | undefined {
  return eid?.sourceType ?? eid?.["source-type"];
}
