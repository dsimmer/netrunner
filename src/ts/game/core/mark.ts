// Runner mark (the randomly-identified central server each turn).
// Mirrors: src/clj/game/core/mark.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { Ability, EID } from "./types";
import { RUNNER_SIDE } from "./state";
import { getCard } from "./finding";
import { registerEvents, triggerEvent } from "./engine";
import { systemMsg } from "./say";
import { centralToName } from "./servers";
import { updateCard } from "./update";

const CENTRAL_SERVERS = ["hq", "rd", "archives"] as const;

export function setMark(state: GameState, newMark: string): void {
  state.mark = newMark;
  triggerEvent(state, RUNNER_SIDE, "mark-changed");
}

export function isMark(state: GameState, s: string): boolean {
  return s === state.mark;
}

export function identifyMark(state: GameState): void {
  const newMark =
    CENTRAL_SERVERS[Math.floor(Math.random() * CENTRAL_SERVERS.length)];
  setMark(state, newMark);
  systemMsg(
    state,
    RUNNER_SIDE,
    `identifies [their] mark to be ${centralToName(newMark)}`,
  );
}

export const identifyMarkAbility: Ability = {
  effect: (state: GameState) => {
    if (state.mark == null) identifyMark(state);
  },
};

export const markChangedEvent: Ability = {
  event: "mark-changed",
  silent: true,
  interactive: () => false,
  effect: (state: GameState, side: string, _eid: EID, card: Card) => {
    if (!card) return;
    updateCard(state, RUNNER_SIDE, {
      ...card,
      cardTarget: centralToName(state.mark ?? "") ?? "",
    });
    registerEvents(state, side, card, [
      {
        event: "post-runner-turn-ends",
        silent: true,
        unregisterOnceResolved: true,
        effect: (state2: GameState) => {
          const fresh = getCard(state2, card);
          if (fresh) {
            const { cardTarget: _drop, ...rest } = fresh;
            updateCard(state2, RUNNER_SIDE, rest as Card);
          }
        },
      } as Ability,
    ]);
  },
};
