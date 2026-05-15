// Charge ability: place power counters on cards that have at least one power counter.
// Mirrors: src/clj/game/core/charge.clj

import type { GameState, EID, Card, Ability } from "./types.ts";
import { allInstalled } from "./board";
import { getCard } from "./finding";
import { effectCompleted } from "./eid";
import { req, msg } from "../macros";
import { queueEvent } from "./engine";

/**
 * Check if a card can be charged (has at least one power counter).
 * Mirrors: can-charge in charge.clj
 */
export function canCharge(state: GameState, side: string, card: Card): boolean;
/**
 * Check if any installed card on the given side can be charged.
 * Mirrors: can-charge (multi-arity) in charge.clj
 */
export function canCharge(state: GameState, side: string): boolean;
export function canCharge(
  state: GameState,
  side: string,
  card?: Card,
): boolean {
  if (card) {
    const c = getCard(state, card);
    return (c?.counter?.power || 0) > 0;
  }
  const cards = allInstalled(state, side);
  return cards.some((c) => canCharge(state, side, c));
}

/**
 * Charge a card: place power counters on it (only if it already has at least one).
 * Mirrors: charge-card in charge.clj
 */
export function chargeCard(
  state: GameState,
  side: string,
  eid: EID,
  target: Card,
): void;
/**
 * Charge a card with a specific count of power counters.
 * Mirrors: charge-card (multi-arity with count) in charge.clj
 */
export function chargeCard(
  state: GameState,
  side: string,
  eid: EID,
  target: Card,
  count: number,
): void;
export function chargeCard(
  state: GameState,
  side: string,
  eid: EID,
  target: Card,
  count?: number,
): void {
  const c = count || 1;
  if (canCharge(state, side, target)) {
    const card = getCard(state, target);
    if (card) {
      if (!card.counter) card.counter = {};
      card.counter.power = (card.counter.power || 0) + c;
      queueEvent(state, ":counter-added", {
        card: getCard(state, card),
        "counter-type": "power",
        amount: c,
        placed: true,
      });
    }
  } else {
    effectCompleted(state, side, eid);
  }
}

/**
 * Creates a charge prompt to charge an installed card.
 * Mirrors: charge-ability in charge.clj
 */
export function chargeAbility(
  state: GameState,
  side: string,
  n?: number,
): Ability | null {
  const num = n || 1;
  if (!canCharge(state, side)) {
    return null;
  }
  return {
    waitingPrompt: true,
    prompt: "Choose an installed card",
    choices: {
      card: (c: Card) => canCharge(state, side, c),
    },
    async: true,
    msg: msg(
      "charge ",
      (
        state: GameState,
        _side: string,
        _eid: EID,
        card: Card,
        _targets: Card[],
      ) => card?.title || "",
      (
        _state: GameState,
        _side: string,
        _eid: EID,
        _card: Card,
        _targets: Card[],
      ) => {
        return num > 1 ? `${num} times` : "";
      },
    ),
    effect: req(
      (
        state: GameState,
        side: string,
        eid: EID,
        card: Card,
        targets: Card[],
      ) => {
        chargeCard(state, side, eid, card, num);
      },
    ),
  };
}
