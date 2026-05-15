// Checkpoint logic: update all cards and clear empty remotes.
// Mirrors: src/clj/game/core/checkpoint.clj

import type { GameState } from "./state";
import type { EID } from "./eid";
import { clearEmptyRemotes } from "./board";

// These functions need to be implemented in their respective modules
// Mirrors the clojure defn signatures.
import { updateAllIce } from "./ice";
import { updateAllIcebreakers } from "./ice";
import {
  updateAllAdvancementRequirements,
  updateAllAgendaPoints,
} from "./agendas";
import { updateAllCardLabels } from "./initializing";
import { updateMu } from "./memory";
import { updateAllSubtypes } from "./subtypes.ts";
import { updateTagStatus } from "./tags";
import { updateHandSize } from "./hand_size";
import { updateLink } from "./link";
import { generateRunnableZones } from "./actions";
import { effectCompleted } from "./eid";
import { checkWinByAgenda } from "./winning";
import { updateDisabledCards } from "./effects";

/**
 * fake-checkpoint: iteratively update all cards until no more changes,
 * then clear empty remotes and generate runnable zones.
 * Mirrors: fake-checkpoint in checkpoint.clj
 */
export function fakeCheckpoint(state: GameState): void {
  for (let i = 0; i < 10; i++) {
    const changed: boolean[] = [
      updateAllIce(state, "Corp"),
      updateAllIcebreakers(state, "Runner"),
      updateAllCardLabels(state),
      updateAllAdvancementRequirements(state),
      updateAllAgendaPoints(state),
      updateLink(state),
      updateMu(state),
      updateHandSize(state, "Corp"),
      updateHandSize(state, "Runner"),
      updateAllSubtypes(state),
      updateTagStatus(state),
    ];

    if (!changed.some(Boolean)) break;
  }

  clearEmptyRemotes(state);
  generateRunnableZones(state, null, null);
}

/**
 * checkpoint: A CHECKPOINT is a process wherein objects that have entered an
 * illegal state are corrected, expired effects are removed, and other important
 * conditions are checked.
 * Mirrors: checkpoint in engine.clj
 *
 * Stub implementation pending full port of pending ability machinery.
 */
export function checkpoint(
  state: GameState,
  _side: string | null,
  eid: EID,
  args?: { duration?: string; durations?: string[] },
): void {
  // Run iterative updates
  for (let i = 0; i < 10; i++) {
    const changed: boolean[] = [
      updateAllIce(state, "corp"),
      updateAllIcebreakers(state, "runner"),
      updateAllCardLabels(state),
      updateAllAdvancementRequirements(state),
      updateAllAgendaPoints(state),
      updateLink(state),
      updateMu(state),
      updateHandSize(state, "corp"),
      updateHandSize(state, "runner"),
      updateAllSubtypes(state),
      updateTagStatus(state),
    ];

    if (!changed.some(Boolean)) break;
  }

  updateDisabledCards(state);

  if (checkWinByAgenda(state) && !(state as any).winnerDeclared) {
    (state as any).winnerDeclared = true;
  }

  clearEmptyRemotes(state);

  // TODO: port mark-pending-abilities, unregister-expired-durations,
  // check-unique-and-consoles, check-restrictions, trigger-pending-abilities

  effectCompleted(state, "", eid);
}
