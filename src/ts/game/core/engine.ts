export * from './engine_1';
export * from './engine_2';
export * from './engine_3';

export { checkpoint } from "./checkpoint";
export { canPay } from "./payment";
export { continueAbility, takeCredits } from "./def_helpers_1";
export { getAutoresolve, setAutoresolve } from "./optional";
export { firstEvent } from "./events";
export { shouldTrigger } from "./moving_1";

import type { GameState, RegisteredEvent } from "./state";
import type { Ability } from "./types";
import type { Card } from "./card";
import { notUsedOnce } from "./engine_1";

/**
 * Returns true if a :once ability has already fired.
 * Inverse of notUsedOnce.
 */
export function usedOnce(state: GameState, ability: Ability, card: Card | null): boolean {
  return !notUsedOnce(state, ability, card);
}

interface SuppressEntry {
  uuid: string;
  [key: string]: unknown;
}

interface StateWithSuppress extends GameState {
  suppress?: SuppressEntry[];
}

/** Unregister an event handler by uuid. Mirrors `unregister-event-by-uuid`. */
export function unregisterEventByUuid(state: GameState, uuid: string): void {
  const events = state.events ?? [];
  state.events = events.filter((e: RegisteredEvent) => e.uuid !== uuid);
}

/** Unregister a suppress handler by uuid. Mirrors `unregister-suppress-by-uuid`. */
export function unregisterSuppressByUuid(
  state: StateWithSuppress,
  uuidOrSide: string,
  maybeUuid?: string,
): void {
  const uuid = maybeUuid !== undefined ? maybeUuid : uuidOrSide;
  const suppress = state.suppress ?? [];
  state.suppress = suppress.filter((e: SuppressEntry) => e.uuid !== uuid);
}
