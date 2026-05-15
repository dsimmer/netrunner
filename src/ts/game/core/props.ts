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
}

// ---------------------------------------------------------------------------
// add-prop
// ---------------------------------------------------------------------------

/**
 * Adds the given value n to the existing value associated with the key in the card.
 * Triggers events.
 * Mirrors `add-prop` in props.clj.
 */
export function addProp(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  propType: string,
  n: number,
  args?: AddCounterArgs | null,
): void {
  const resolvedCard = getCard(state, card);
  if (!resolvedCard) {
    effectCompleted(state, side, eid);
    return;
  }

  const currentValue = (resolvedCard[propType] as number) ?? 0;
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

  if (!args?.suppressCheckpoint) {
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
export function addCounter(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  propType: string,
  n: number,
  args?: AddCounterArgs | null,
): void {
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

  if (!args?.suppressCheckpoint) {
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
  ...pairs: (string | number)[]
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
