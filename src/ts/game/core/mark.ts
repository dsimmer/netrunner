// Runner mark (the randomly-identified central server each turn).
// Mirrors: src/clj/game/core/mark.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { Ability } from "./types";
import { RUNNER_SIDE } from "./state";
import { getCard } from "./finding";
import { registerEvents, triggerEvent } from "./engine";
import { systemMsg } from "./say";
import { centralToName } from "./servers";
import { update } from "./update";

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
  effect: (state: any) => {
    if (state.mark == null) identifyMark(state);
  },
};

export const markChangedEvent: Ability = {
  event: "mark-changed",
  silent: true,
  interactive: () => false,
  effect: (state: any, side: any, _eid: any, card: any) => {
    if (!card) return;
    (update as any)(
      state,
      RUNNER_SIDE,
      (c: Card) => {
        (c as any).cardTarget = centralToName(state.mark);
        return c;
      },
      card,
    );
    registerEvents(state, side, card, [
      {
        event: "post-runner-turn-ends",
        silent: true,
        unregisterOnceResolved: true,
        effect: (state2: any) => {
          const fresh = getCard(state2, card);
          if (fresh) {
            (update as any)(
              state2,
              RUNNER_SIDE,
              (c: Card) => {
                delete (c as any).cardTarget;
                return c;
              },
              fresh,
            );
          }
        },
      } as Ability,
    ]);
  },
} as Ability;
