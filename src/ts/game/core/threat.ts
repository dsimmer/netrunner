// Threat level management.
// Mirrors: src/clj/game/core/threat.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types.ts";
import { effectCompleted } from "./eid";
import { req, continue_ability } from "../macros";

/**
 * Returns whether the threat level meets or exceeds the given threshold.
 * Mirrors `threat-level` in threat.clj.
 */
export function threatLevel(threshold: number, state: GameState): boolean {
  const runnerAp = state.runner?.agendaPoint ?? 0;
  const corpAp = state.corp?.agendaPoint ?? 0;
  return threshold <= runnerAp || threshold <= corpAp;
}

/**
 * Returns the current threat level (max of runner and corp agenda points).
 * Mirrors `get-threat-level` in threat.clj.
 */
export function getThreatLevel(state: GameState): number {
  const runnerAp = state.runner?.agendaPoint ?? 0;
  const corpAp = state.corp?.agendaPoint ?? 0;
  return Math.max(runnerAp, corpAp);
}

/**
 * Threat ability builder. Returns an ability map that checks the threat level
 * and branches to either the accept or reject ability.
 *
 * Two-argument form: (threat threshold accept-ab) — no reject branch.
 * Three-argument form: (threat threshold accept-ab reject-ab) — reject branch
 *   is followed when threat level is below threshold.
 *
 * Mirrors `threat` in threat.clj.
 */
export function threat(
  threshold: number,
  acceptAb: Ability,
  rejectAb?: Ability | null,
): Ability {
  return {
    req: req(() => true),
    async: true,
    effect: req(
      (
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        targets: Card[],
      ) => {
        if (threatLevel(threshold, state)) {
          continue_ability(state, side, acceptAb, card, targets);
        } else if (rejectAb == null) {
          effectCompleted(state, side, eid);
        } else {
          continue_ability(state, side, rejectAb, card, targets);
        }
      },
    ),
  };
}
