// Effect ID (EID) management.
// Mirrors: src/clj/game/core/eid.clj + src/go/game/core/eid.go

import type { GameState } from "./state";
import type { Card } from "./card";
import type { AbilityFn } from "./types";
import { basicAction } from "./card";
import { removeFromPromptQueue } from "./prompt_state";
// ---------------------------------------------------------------------------
// EID type
// ---------------------------------------------------------------------------

export interface EID {
  id?: number;
  source?: Card | null;
  sourceType?: string;
  /** kebab-case mirror for code that walks `eid["source-type"]` directly */
  "source-type"?: string;
  sourceInfo?: Record<string, unknown>;
  "source-info"?: Record<string, unknown>;
  result?: unknown;
  /** kebab-case keys used by some card-side cost machinery */
  "cost-paid"?: { length?: number } & Record<string, unknown>;
  "x-cost"?: unknown;
  /** Open-ended bag for additional clj-style kw fields. Use a narrowing
   * predicate when consuming so we don't slip back into `any`. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// EID factory helpers
// ---------------------------------------------------------------------------

/**
 * Allocates a new EID from the game state.
 * Mirrors `(make-eid state)` and `(make-eid state existing-eid)` in eid.clj —
 * when an `existing` EID is supplied, its fields are preserved and only the
 * `:eid` (here `id`) is bumped to the freshly-allocated counter.
 */
export function makeEID(state: GameState, existing?: EID | null): EID {
  state.eidCounter += 1;
  if (existing) {
    return { ...existing, id: state.eidCounter };
  }
  return { id: state.eidCounter };
}

// Alias for compatibility with card effect code.
export const makeEid = makeEID;

/**
 * Creates a new EID inheriting source info from an existing EID.
 * Equivalent to `(make-eid state existing-eid)`.
 */
export function makeEIDFrom(state: GameState, existing: EID | null): EID {
  return makeEID(state, existing);
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
 * Mirrors is-basic-advance-action? in eid.clj — both the source-card check
 * (`basic-action?`) and the ability-idx check (4) are required.
 */
export function isBasicAdvanceAction(eid: EID | null): boolean {
  if (!eid?.source || !eid?.sourceInfo) return false;
  if (!basicAction(eid.source)) return false;
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
 * Mirrors clear-eid-wait-prompt in eid.clj — iterates every matching prompt
 * (a single eid can stack multiple wait prompts) and removes each via
 * removeFromPromptQueue so the active prompt state is refreshed.
 */
export function clearEIDWaitPrompt(
  state: GameState,
  side: string,
  eid: EID,
): void {
  const queue = side === "corp" ? state.corpPrompt : state.runnerPrompt;
  const matching = queue.filter(
    (p) => p.eid?.id === eid.id && p.promptType === "waiting",
  );
  for (const prompt of matching) {
    removeFromPromptQueue(state, side, prompt);
  }
}

export const clearEidWaitPrompt = clearEIDWaitPrompt;

/**
 * Type-narrowing predicate distinguishing an EID from a GameState.
 * A GameState always has an `eidCounter` numeric field; an EID never does.
 */
function isEID(v: unknown): v is EID {
  return (
    typeof v === "object" &&
    v !== null &&
    !("eidCounter" in v) &&
    "id" in v
  );
}

/**
 * Fires the registered callback for the given EID.
 * Mirrors effect-completed in eid.clj — clears any wait prompts on both sides
 * for this eid, then invokes (and dequeues) the registered handler.
 *
 * Accepts either the canonical (state, side, eid) shape or a 1-arg (eid)
 * shorthand used by a handful of legacy call sites where state has already
 * leaked out of scope (handler is then unable to fire; we just no-op).
 */
export function effectCompleted(eid: EID | null | undefined): void;
export function effectCompleted(
  state: GameState | null | undefined,
  side: string | null | undefined,
  eid: EID | null | undefined,
): void;
export function effectCompleted(
  stateOrEid: GameState | EID | null | undefined,
  side?: string | null,
  maybeEid?: EID | null,
): void {
  let state: GameState | null = null;
  let s: string | null = null;
  let eid: EID | null = null;
  if (maybeEid !== undefined) {
    state = (stateOrEid as GameState | null) ?? null;
    s = side ?? null;
    eid = maybeEid ?? null;
  } else if (isEID(stateOrEid)) {
    eid = stateOrEid;
  } else {
    return;
  }
  if (!eid) return;
  if (!state || !state.eidCallbacks) return;
  clearEIDWaitPrompt(state, "corp", eid);
  clearEIDWaitPrompt(state, "runner", eid);
  const eidId = eid.id;
  if (eidId === undefined) return;
  const callback = state.eidCallbacks.get(eidId);
  if (callback) {
    state.eidCallbacks.delete(eidId);
    // TS adaptation: clj calls (handler eid) with one arg, but TS callsites
    // are written as (state, side, eid) => ... (consistent with AbilityFn).
    callback(state, s ?? null, eid, null, []);
  }
}

/**
 * Calls effectCompleted with a result value attached to the EID.
 * Mirrors complete-with-result in eid.clj — `(complete-with-result state side eid result)`.
 *
 * The 2-arg `(eid, result)` shorthand is retained for legacy call sites where
 * state has already gone out of scope; with no state we cannot fire the
 * registered callback, so the call is a documented no-op. New code should use
 * the 4-arg form.
 */
export function completeWithResult(eid: EID, result: unknown): void;
export function completeWithResult(
  state: GameState,
  side: string,
  eid: EID,
  result: unknown,
): void;
export function completeWithResult(
  stateOrEid: GameState | EID,
  sideOrResult: string | unknown,
  maybeEid?: EID,
  maybeResult?: unknown,
): void {
  if (maybeEid === undefined) {
    // 2-arg shorthand — no state in scope, cannot dispatch callback.
    return;
  }
  const state = stateOrEid as GameState;
  const side = sideOrResult as string;
  effectCompleted(state, side, makeResult(maybeEid, maybeResult));
}

/** Accessor for the source card on an EID. */
export function source(eid: EID | null): Card | null | undefined {
  return eid?.source ?? null;
}

/** Accessor for source-type on an EID. */
export function sourceType(eid: EID | null): string | undefined {
  return eid?.sourceType ?? eid?.["source-type"];
}
