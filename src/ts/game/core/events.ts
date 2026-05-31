// Functions for event parsing (turn-level and run-level).
// Mirrors: src/clj/game/core/events.clj

import { isInstalled } from "./card";
import type { Card } from "./card";
import type { GameState } from "./state";
import { sideStr } from "../utils";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** A single turn-event entry as stored in state.turnEvents: [eventName, targets]. */
type TurnEventEntry = [string, unknown[]];

/** Predicate used to filter event entries. The `any` here is intentional —
 *  card-side callers pass narrower `(t: any[]) => any` lambdas; this matches
 *  the codebase's `AnyFn` escape-hatch convention (see types.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventPred = (entry: any) => unknown;

// ---------------------------------------------------------------------------
// Turn-level event helpers
// ---------------------------------------------------------------------------

/**
 * Returns the targets of each event with the given key that was triggered this turn.
 *
 * Clojure: (mapcat rest (filter #(= ev (first %)) (:turn-events @state)))
 */
export function turnEvents(
  state: GameState,
  _side: unknown,
  ev: string,
): unknown[] {
  const entries = (state.turnEvents as unknown as TurnEventEntry[]) ?? [];
  return entries
    .filter(([event]) => event === ev)
    .flatMap(([_event, targets]) => targets ?? []);
}

/**
 * Returns whether `event` occurred in the previous turn for the given side.
 *
 * Clojure: (get-in @state [side :register-last-turn event])
 */
export function lastTurn(
  state: GameState,
  side: string,
  event: string,
): unknown {
  const player = side === "corp" ? state.corp : state.runner;
  const register = player.registerLastTurn as Record<string, unknown> | undefined;
  if (!register) return undefined;
  return register[event];
}

/**
 * Returns true unless `event` occurred in the previous turn (or there was no previous turn).
 *
 * Clojure:
 *   (cond
 *     (-> @state side :register-last-turn nil?) false
 *     (-> @state side :register-last-turn event) false
 *     :else true)
 */
export function notLastTurn(
  state: GameState,
  side: string,
  event: string,
): boolean {
  const player = side === "corp" ? state.corp : state.runner;
  const register = player.registerLastTurn as Record<string, unknown> | undefined;
  if (!register) return false;
  if (register[event]) return false;
  return true;
}

/**
 * Returns true if the given event has not happened yet this turn.
 * Filters on events satisfying `pred(targets)` if given.
 *
 * Clojure: (empty? (filter pred (turn-events state side ev)))
 */
export function noEvent(
  state: GameState,
  side: unknown,
  ev: string,
  pred: EventPred = () => true,
): boolean {
  return turnEvents(state, side, ev).filter(pred).length === 0;
}

/**
 * Returns the number of times `ev` occurred this turn, filtered by `pred`.
 *
 * Clojure: (count (filter pred (turn-events state side ev)))
 */
export function eventCount(
  state: GameState,
  side: unknown,
  ev: string,
  pred: EventPred = () => true,
): number {
  return turnEvents(state, side, ev).filter(pred).length;
}

/**
 * Returns true if the given event has only occurred once this turn.
 *
 * Clojure: (= 1 (event-count state side ev pred))
 */
export function firstEvent(ev: string, pred?: EventPred): boolean;
export function firstEvent(state: GameState, side: unknown, ev: string, pred?: EventPred): boolean;
export function firstEvent(
  arg1: string | GameState,
  arg2?: string | unknown | ((entry: unknown) => unknown),
  arg3?: string,
  arg4?: (entry: unknown) => unknown,
): boolean {
  if (typeof arg1 === "string") {
    // shorthand (event, pred) — no state, return false (event hasn't occurred without state context)
    return false;
  }
  const state = arg1;
  const side = arg2;
  const ev = arg3 ?? "";
  const pred = arg4;
  return eventCount(state, side, ev, pred ?? (() => true)) === 1;
}

/**
 * Returns true if the given event has occurred twice this turn.
 *
 * Clojure: (= 2 (event-count state side ev pred))
 */
export function secondEvent(
  state: GameState,
  side: unknown,
  ev: string,
  pred: EventPred = () => true,
): boolean {
  return eventCount(state, side, ev, pred) === 2;
}

/**
 * Returns true if the active run is the first successful run on the given server.
 *
 * Clojure: (first-event? state :runner :successful-run #(= [server] (:server (first %))))
 */
export function firstSuccessfulRunOnServer(
  state: GameState,
  server: unknown,
): boolean {
  return firstEvent(state, "runner", "successful-run", (entry: unknown) => {
    const targets = entry as unknown[];
    const first = targets?.[0] as Record<string, unknown> | undefined;
    const entryServer = first?.server;
    // Handle both array and scalar server values
    if (Array.isArray(entryServer) && Array.isArray(server)) {
      return entryServer.length === 1 && entryServer[0] === server[0];
    }
    return entryServer === server;
  });
}

/**
 * Returns true if cards have been trashed by either player only once this turn.
 * Counts runner-trash, corp-trash, and game-trash events.
 *
 * Clojure:
 *   (= 1 (+ (event-count state nil :runner-trash pred)
 *           (event-count state nil :corp-trash pred)
 *           (event-count state nil :game-trash pred)))
 */
export function firstTrash(
  state: GameState,
  pred: EventPred = () => true,
): boolean {
  return (
    eventCount(state, null, "runner-trash", pred) +
      eventCount(state, null, "corp-trash", pred) +
      eventCount(state, null, "game-trash", pred) ===
    1
  );
}

/**
 * Returns the total damage taken this turn.
 *
 * Clojure: (apply + (keep #(:amount (first %)) (turn-events state :runner :damage)))
 */
export function getTurnDamage(state: GameState, _side: unknown): number {
  const entries = turnEvents(state, "runner", "damage");
  let sum = 0;
  for (const entry of entries) {
    const targets = entry as unknown[];
    const first = targets?.[0] as Record<string, unknown> | undefined;
    const amount = first?.amount as number | undefined;
    if (typeof amount === "number") sum += amount;
  }
  return sum;
}

/**
 * Returns list of cards trashed this turn owned by `side` that were installed.
 *
 * Clojure:
 *   (->> (turn-events state side (if (= :corp side) :corp-trash :runner-trash))
 *        (mapcat (fn [targets] (filter #(installed? (:card %)) targets))))
 */
export function getInstalledTrashed(state: GameState, side: string): Card[] {
  const ev = side === "corp" ? "corp-trash" : "runner-trash";
  const entries = turnEvents(state, side, ev);
  const results: Card[] = [];
  for (const entry of entries) {
    const targets = entry as Record<string, unknown>[];
    for (const target of targets) {
      const card = target.card as Card | null | undefined;
      if (card && isInstalled(card)) {
        results.push(card);
      }
    }
  }
  return results;
}

/**
 * Returns true if this is the first trash of an installed card this turn by this side.
 *
 * Clojure: (= 1 (count (get-installed-trashed state side)))
 */
export function firstInstalledTrash(state: GameState, side: string): boolean {
  return getInstalledTrashed(state, side).length === 1;
}

/**
 * Returns true if this is the first trash of an owned installed card this turn by this side.
 *
 * Clojure:
 *   (= 1 (count (filter #(= (:side (:card %)) (side-str side))
 *                       (get-installed-trashed state side))))
 */
export function firstInstalledTrashOwn(
  state: GameState,
  side: string,
): boolean {
  const trashed = getInstalledTrashed(state, side);
  const sideString = sideStr(side);
  const owned = trashed.filter((c: Card) => c.side === sideString);
  return owned.length === 1;
}

// ---------------------------------------------------------------------------
// Run-level event helpers
// ---------------------------------------------------------------------------

/**
 * Returns the targets of each run event with the given key that was triggered this run.
 * Accepts either (state, side, ev) or (run, ev).
 *
 * Clojure:
 *   ([state _ ev] (when (:run @state) (run-events (:run @state) ev)))
 *   ([run ev]    (mapcat rest (filter #(= ev (first %)) (:events run))))
 */
export function runEvents(
  stateOrRun: GameState | unknown,
  sideOrEv: unknown,
  ev?: string,
): unknown[] {
  interface RunWithEvents { events?: TurnEventEntry[] }
  let run: RunWithEvents | undefined;
  let event: string;
  if (ev === undefined) {
    run = stateOrRun as RunWithEvents;
    event = sideOrEv as string;
  } else {
    run = (stateOrRun as GameState).run as unknown as RunWithEvents;
    event = ev;
  }
  if (!run) return [];
  const events = run.events;
  if (!events) return [];
  return events
    .filter(([e]) => e === event)
    .flatMap(([_event, targets]) => targets ?? []);
}

/**
 * Returns true if the given run event has not happened yet this run.
 * Filters on run events satisfying `pred(targets)` if given.
 *
 * Clojure: (empty? (filter pred (run-events state side ev)))
 */
export function noRunEvent(
  state: GameState,
  _side: unknown,
  ev: string,
  pred: EventPred = () => true,
): boolean {
  return runEvents(state, _side, ev).filter(pred).length === 0;
}

/**
 * Returns the number of times a run event has happened this run.
 *
 * Clojure: (count (filter pred (run-events state side ev)))
 */
export function runEventCount(
  state: GameState,
  _side: unknown,
  ev: string,
  pred: EventPred = () => true,
): number {
  return runEvents(state, _side, ev).filter(pred).length;
}

/**
 * Returns true if the given run event has only occurred once this run.
 *
 * Clojure: (= 1 (run-event-count state side ev pred))
 */
export function firstRunEvent(
  state: GameState,
  _side: unknown,
  ev: string,
  pred: EventPred = () => true,
): boolean {
  return runEventCount(state, _side, ev, pred) === 1;
}

export { registerEvents } from "./engine_2";

export { queueEvent } from "./engine_3";
export { triggerEvent } from "./engine_2";

import { event as cardEvent } from "./card";
/**
 * Polymorphic `event`:
 *  - 1-arg (card): predicate from card.ts asking "is this card an event?"
 *  - 4-arg (state, side, eventName, pred): "has any matching event occurred this turn?"
 *    (Convenience used by card files to wrap eventCount > 0.)
 */
export function event(card: Card | null): boolean;
export function event(state: GameState, side: unknown, ev: string, pred?: EventPred): boolean;
export function event(
  arg1: Card | GameState | null,
  arg2?: unknown,
  arg3?: string,
  arg4?: (entry: unknown) => unknown,
): boolean {
  if (arg2 === undefined) return !!cardEvent(arg1 as Card | null);
  const state = arg1 as GameState;
  const side = arg2;
  const ev = arg3 ?? "";
  return eventCount(state, side, ev, arg4 ?? (() => true)) > 0;
}
