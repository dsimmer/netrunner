// Run mechanics.
// Mirrors: src/clj/game/core/runs.clj

import type { GameState } from "./state.js";
import type { EID } from "./eid.js";

// ---------------------------------------------------------------------------
// check-for-empty-server
// Returns true if the current server has no ice, assets, or upgrades.
// Mirrors: check-for-empty-server in runs.clj
// ---------------------------------------------------------------------------
export function checkForEmptyServer(state: GameState): boolean {
  // Stub: returns false until full run machinery is ported
  return false;
}

// ---------------------------------------------------------------------------
// handle-end-run
// Mirrors: handle-end-run in runs.clj
// ---------------------------------------------------------------------------
export function handleEndRun(state: GameState, side: string, eid: EID | null): void {
  // Stub: full implementation pending run machinery port
}

// ---------------------------------------------------------------------------
// start-next-phase
// Mirrors: start-next-phase in runs.clj (defmulti)
// ---------------------------------------------------------------------------
export function startNextPhase(state: GameState, side: string, eid: EID | null): void {
  // Stub: full implementation pending run machinery port
}

// ---------------------------------------------------------------------------
// continue (renamed to `runContinue` to avoid TS reserved word conflict)
// Press continue for the current run phase.
// Mirrors: continue in runs.clj (defmulti)
// ---------------------------------------------------------------------------
export function runContinue(state: GameState, side: string, eid: EID | null): void {
  // Stub: full implementation pending run machinery port
}

// ---------------------------------------------------------------------------
// toggle-auto-no-action
// Mirrors: toggle-auto-no-action in runs.clj
// ---------------------------------------------------------------------------
export function toggleAutoNoAction(state: GameState, side: string, eid: EID | null): void {
  // Stub: full implementation pending run machinery port
}

// ---------------------------------------------------------------------------
// end-run
// Mirrors: end-run in runs.clj (defmulti)
// ---------------------------------------------------------------------------
export function endRun(state: GameState, side: string, eid: EID, opts: unknown): void {
  // Stub: full implementation pending run machinery port
}

// ---------------------------------------------------------------------------
// get-current-encounter
// Mirrors: get-current-encounter in runs.clj
// ---------------------------------------------------------------------------
export function getCurrentEncounter(state: GameState): unknown { return null; }

// ---------------------------------------------------------------------------
// jack-out
// Mirrors: jack-out in runs.clj
// ---------------------------------------------------------------------------
export function jackOut(state: GameState, side: string, eid: EID): void {
  // Stub: full implementation pending run machinery port
}
