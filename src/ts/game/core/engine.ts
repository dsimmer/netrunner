export * from './engine_1';
export * from './engine_2';
export * from './engine_3';

export { checkpoint } from "./checkpoint";
export { canPay } from "./payment";
export { continueAbility, takeCredits } from "./def_helpers_1";
export { getAutoresolve, setAutoresolve } from "./optional";
export { firstEvent } from "./events";
export { shouldTrigger } from "./moving_1";

import { notUsedOnce } from "./engine_1";

/**
 * Returns true if a :once ability has already fired.
 * Inverse of notUsedOnce.
 */
export function usedOnce(state: any, ability: any, card: any): boolean {
  return !notUsedOnce(state, ability, card);
}

/** Unregister an event handler by uuid. Mirrors `unregister-event-by-uuid`. */
export function unregisterEventByUuid(state: any, uuid: string): void {
  const events = state?.events ?? [];
  state.events = events.filter((e: any) => e?.uuid !== uuid);
}

/** Unregister a suppress handler by uuid. Mirrors `unregister-suppress-by-uuid`. */
export function unregisterSuppressByUuid(state: any, uuidOrSide: string, maybeUuid?: string): void {
  const uuid = maybeUuid !== undefined ? maybeUuid : uuidOrSide;
  const suppress = state?.suppress ?? [];
  state.suppress = suppress.filter((e: any) => e?.uuid !== uuid);
}
