// Charge ability: place power counters on cards that have at least one power counter.
// Mirrors: src/clj/game/core/charge.clj

import type { Ability, Card, EID, GameState, Targets } from "./types";
import { allInstalled } from "./board";
import { getCard } from "./finding";
import { effectCompleted } from "./eid";
import { req, msg } from "../macros";
import { addCounter } from "./props";
import { getCounters } from "./card";

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
    return c ? getCounters(c, "power") > 0 : false;
  }
  return allInstalled(state, side).some((c) => canCharge(state, side, c));
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
  count = 1,
): void {
  if (canCharge(state, side, target)) {
    addCounter(state, side, eid, target, "power", count, { placed: true });
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
  n = 1,
): Ability | null {
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
        _state: GameState,
        _side: string,
        _eid: EID,
        _card: Card,
        targets: Targets,
      ) => (targets?.[0] as Card | undefined)?.title ?? "",
      n > 1 ? ` ${n} times` : "",
    ),
    effect: req(
      (
        s: GameState,
        sd: string,
        e: EID,
        _card: Card,
        targets: Targets,
      ) => {
        const target = targets?.[0] as Card | undefined;
        if (target) chargeCard(s, sd, e, target, n);
      },
    ),
  };
}
