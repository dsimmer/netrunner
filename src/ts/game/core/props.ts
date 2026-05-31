// Props: add-prop, add-counter, set-prop.
// Mirrors: src/clj/game/core/props.clj

import type { GameState } from "./state";
import type { EID } from "./eid";
import type { Card } from "./card";
import { getCard } from "./finding";
import { update } from "./update";
import { queueEvent } from "./engine";
import { checkpoint } from "./checkpoint";
import { effectCompleted } from "./eid";
import { updateIceStrength } from "./ice";
import { ice, rezzed } from "./card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddCounterArgs {
  placed?: boolean;
  suppressCheckpoint?: boolean;
  // kebab-case alias used by some tier-2 card files
  "suppress-checkpoint"?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// add-prop
// ---------------------------------------------------------------------------

/**
 * Adds the given value n to the existing value associated with the key in the card.
 * Triggers events.
 * Mirrors `add-prop` in props.clj.
 */
export function addProp(state: GameState, side: string, card: Card | null, propType: string, n: number, args?: AddCounterArgs | null): void;
export function addProp(state: GameState, side: string, card: Card | null, propType: string, n: number, args: AddCounterArgs | null, eid: EID): void;
export function addProp(state: GameState, side: string, eid: EID, card: Card | null, propType: string, n: number, args?: AddCounterArgs | null): void;
// Permissive overloads for tier-2 card sites that pass legacy / malformed args.
// The impl signature normalises shape; missing state → silent no-op.
export function addProp(eid: EID, card: Card | null, propType: string, n: number, args?: AddCounterArgs | null): void;
export function addProp(side: string, eid: EID, card: Card | null, propType: string, n: number, args?: AddCounterArgs | null): void;
// operations_2.ts:795 passes (state, state, eid, ...) — preserved for tsc compat.
export function addProp(state: GameState, dup: GameState, eid: EID, card: Card | null, propType: string, n: number, args?: AddCounterArgs | null): void;
export function addProp(
  arg1: GameState | EID | string | null | undefined,
  arg2: string | EID | Card | GameState | null | undefined,
  arg3: EID | Card | string | null | undefined,
  arg4: Card | string | number | null | undefined,
  arg5: string | number | AddCounterArgs | null | undefined,
  arg6?: number | AddCounterArgs | null,
  arg7?: AddCounterArgs | null,
): void {
  // Detect (state, side, ...) vs legacy non-state forms. A GameState has
  // .corp and .runner; check that to find the real state.
  let state: GameState;
  let side: string;
  if (arg1 && typeof arg1 === "object" && "corp" in arg1 && "runner" in arg1) {
    state = arg1 as GameState;
    side = typeof arg2 === "string" ? arg2 : "corp";
  } else {
    // Legacy call: state missing — silently no-op rather than crash.
    return;
  }
  // Shift args so arg3..arg7 now represent the normalised (eid|card, ...) tail.
  const tail3 = arg3;
  const tail4 = arg4;
  const tail5 = arg5;
  const tail6 = arg6;
  const tail7 = arg7;
  return addPropImpl(state, side, tail3, tail4, tail5, tail6, tail7);
}

function addPropImpl(
  state: GameState,
  side: string,
  arg3: EID | Card | string | null | undefined,
  arg4: Card | string | number | null | undefined,
  arg5: string | number | AddCounterArgs | null | undefined,
  arg6: number | AddCounterArgs | null | undefined,
  arg7?: AddCounterArgs | null,
): void {
  let eid: EID;
  let card: Card;
  let propType: string;
  let n: number;
  let args: AddCounterArgs | null = null;

  if (arg3 && typeof arg3 === "object" && "id" in arg3 && !("title" in arg3)) {
    eid = arg3 as EID;
    card = arg4 as Card;
    propType = arg5 as string;
    n = arg6 as number;
    args = arg7 ?? null;
  } else {
    card = arg3 as Card;
    propType = arg4 as string;
    n = arg5 as number;
    args = (arg6 as AddCounterArgs | null) ?? null;
    eid = { id: 0, source: card } as unknown as EID;
  }
  const resolvedCard = getCard(state, card);
  if (!resolvedCard) {
    effectCompleted(state, side, eid);
    return;
  }

  const currentValue = ((resolvedCard as Record<string, unknown>)[propType] as number) ?? 0;
  (resolvedCard as Record<string, unknown>)[propType] = currentValue + n;
  const updatedCard = resolvedCard;
  update(state, side, updatedCard);

  const eventArgs = {
    counterType: propType,
    amount: n,
    placed: args?.placed,
    card: getCard(state, updatedCard),
  };

  if (propType === "advance-counter") {
    if (ice(updatedCard) && rezzed(updatedCard)) {
      updateIceStrength(state, side, updatedCard);
    }
    queueEvent(
      state,
      args?.placed ? "advancement-placed" : "advance",
      eventArgs,
    );
  } else {
    queueEvent(state, "counter-added", eventArgs);
  }

  if (!(args?.suppressCheckpoint || args?.["suppress-checkpoint"])) {
    checkpoint(state, side, eid);
  } else {
    effectCompleted(state, side, eid);
  }
}

// ---------------------------------------------------------------------------
// add-counter
// ---------------------------------------------------------------------------

/**
 * Adds n counters of the specified type to a card.
 * Mirrors `add-counter` in props.clj.
 */
export function addCounter(state: GameState, side: string, card: Card | null, propType: string, n: number, args?: AddCounterArgs | null): void;
export function addCounter(state: GameState, side: string, card: Card | null, propType: string, n: number, args: AddCounterArgs | null, eid: EID): void;
export function addCounter(state: GameState, side: string, eid: EID, card: Card | null, propType: string, n: number, args?: AddCounterArgs | null): void;
// Permissive overloads for tier-2 card sites that pass legacy / malformed args.
export function addCounter(eid: EID, card: Card | null, propType: string, n: number, args?: AddCounterArgs | null): void;
export function addCounter(side: string, eid: EID, card: Card | null, propType: string, n: number, args?: AddCounterArgs | null): void;
export function addCounter(
  arg1: GameState | EID | string | null | undefined,
  arg2: string | EID | Card | GameState | null | undefined,
  arg3: EID | Card | string | null | undefined,
  arg4: Card | string | number | null | undefined,
  arg5: string | number | AddCounterArgs | null | undefined,
  arg6?: number | AddCounterArgs | null,
  arg7?: AddCounterArgs | null,
): void {
  let state: GameState;
  let side: string;
  if (arg1 && typeof arg1 === "object" && "corp" in arg1 && "runner" in arg1) {
    state = arg1 as GameState;
    side = typeof arg2 === "string" ? arg2 : "corp";
  } else {
    return;
  }
  return addCounterImpl(state, side, arg3, arg4, arg5, arg6, arg7);
}

function addCounterImpl(
  state: GameState,
  side: string,
  arg3: EID | Card | string | null | undefined,
  arg4: Card | string | number | null | undefined,
  arg5: string | number | AddCounterArgs | null | undefined,
  arg6: number | AddCounterArgs | null | undefined,
  arg7?: AddCounterArgs | null,
): void {
  let eid: EID;
  let card: Card;
  let propType: string;
  let n: number;
  let args: AddCounterArgs | null = null;

  if (arg3 && typeof arg3 === "object" && "id" in arg3 && !("title" in arg3)) {
    eid = arg3 as EID;
    card = arg4 as Card;
    propType = arg5 as string;
    n = arg6 as number;
    args = arg7 ?? null;
  } else {
    card = arg3 as Card;
    propType = arg4 as string;
    n = arg5 as number;
    args = (arg6 as AddCounterArgs | null) ?? null;
    eid = { id: 0, source: card } as unknown as EID;
  }
  const resolvedCard = getCard(state, card);
  if (!resolvedCard) {
    effectCompleted(state, side, eid);
    return;
  }

  if (propType === "advancement") {
    addProp(state, side, eid, resolvedCard, "advance-counter", n, args);
    return;
  }

  if (!resolvedCard.counter) {
    resolvedCard.counter = {};
  }
  const currentCount = resolvedCard.counter[propType] ?? 0;
  resolvedCard.counter[propType] = currentCount + n;

  const updatedCard = resolvedCard;
  update(state, side, updatedCard);

  queueEvent(state, "counter-added", {
    card: getCard(state, updatedCard),
    counterType: propType,
    amount: n,
    placed: args?.placed,
  });

  if (!(args?.suppressCheckpoint || args?.["suppress-checkpoint"])) {
    checkpoint(state, side, eid);
  } else {
    effectCompleted(state, side, eid);
  }
}

// ---------------------------------------------------------------------------
// set-prop
// ---------------------------------------------------------------------------

/**
 * Like add-prop, but sets multiple keys to corresponding values without triggering events.
 * Example: set-prop(state, side, card, "counter", 4, "currentStrength", 0)
 * Mirrors `set-prop` in props.clj.
 */
export function setProp(
  state: GameState,
  side: string,
  card: Card,
  ...pairs: (string | number | boolean | unknown)[]
): void {
  const resolvedCard = getCard(state, card);
  if (!resolvedCard) return;

  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const key = pairs[i] as string;
    const value = pairs[i + 1];
    (resolvedCard as Record<string, unknown>)[key] = value;
  }
  update(state, side, resolvedCard);
}

export { canBeAdvanced } from "./card";
