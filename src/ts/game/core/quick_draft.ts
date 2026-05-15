// Quick draft format handling.
// Mirrors: src/clj/game/core/quick_draft.clj
// TODO: full quick-draft implementation

import type { GameState } from "./state";
import type { EID } from "./eid";
import { effectCompleted } from "./eid";

/**
 * Entry point for quick-draft format initialization.
 * When format is not "quick-draft", immediately completes the eid.
 * Mirrors: check-quick-draft
 */
export function checkQuickDraft(
  state: GameState,
  format: string,
  eid: EID,
): void {
  if (format !== "quick-draft") {
    effectCompleted(state, null, eid);
    return;
  }
  // TODO: implement full quick-draft flow
  // For now, treat it as a normal game
  effectCompleted(state, null, eid);
}
