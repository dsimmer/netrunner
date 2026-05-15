// Revealing cards: hand reveal/conceal, reveal events, and loud reveal with logging.
// Mirrors: src/clj/game/core/revealing.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import { effectCompleted } from "./eid";
import { queueEvent } from "./engine";
import { checkpoint } from "./checkpoint";
import { systemMsg } from "./say";
import { nameZone } from "./servers";
import { enumerateCards, enumerateStr } from "../utils";
import { otherSide } from "../../jinteki/utils";

/**
 * Reveal a side's hand to the opponent and spectators.
 * Mirrors reveal-hand.
 */
export function revealHand(state: GameState, side: string): void {
  (state as any)[side].openhand = true;
}

/**
 * Conceal a side's previously revealed hand from the opponent and spectators.
 * Mirrors conceal-hand.
 */
export function concealHand(state: GameState, side: string): void {
  delete (state as any)[side].openhand;
}

/**
 * Flatten a nested array of cards into a single flat array.
 */
function flattenCards(targets: (Card | Card[])[]): Card[] {
  const result: Card[] = [];
  for (const t of targets) {
    if (Array.isArray(t)) {
      result.push(...t);
    } else {
      result.push(t);
    }
  }
  return result;
}

/**
 * Reveal cards and queue the appropriate reveal event.
 * Mirrors reveal-and-queue-event.
 */
export function revealAndQueueEvent(
  state: GameState,
  side: string,
  ...targets: (Card | Card[])[]
): void {
  const cards = flattenCards(targets);
  state.lastRevealed = cards;
  queueEvent(state, side === "corp" ? "corp-reveal" : "runner-reveal", {
    cards,
  });
}

/**
 * Trigger the event for revealing one or more cards.
 * Mirrors reveal.
 */
export function reveal(
  state: GameState,
  side: string,
  eid: EID,
  ...targets: (Card | Card[])[]
): void {
  revealAndQueueEvent(state, side, targets);
  checkpoint(state, side, eid);
}

interface RevealLoudArgs {
  forced?: boolean;
  andThen?: string;
  noEvent?: boolean;
}

/**
 * Trigger the event for revealing one or more cards, and also handle the log printout.
 * Mirrors reveal-loud.
 */
export function revealLoud(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  args: RevealLoudArgs,
  ...targets: (Card | Card[])[]
): void {
  const { forced, andThen, noEvent } = args;
  const flatCards = flattenCards(targets);

  // Group cards by { side, zone }
  const cardsByZone = new Map<string, Card[]>();
  for (const c of flatCards) {
    const key = `${c.side}:${JSON.stringify(c.zone)}`;
    const existing = cardsByZone.get(key);
    if (existing) {
      existing.push(c);
    } else {
      cardsByZone.set(key, [c]);
    }
  }

  // Build enumerate strings per zone group
  const strs: string[] = [];
  for (const [key, zoneCards] of cardsByZone) {
    const [sideStr] = key.split(":");
    const zone = JSON.parse(key.split(":")[1]);
    const sorted = false;
    strs.push(
      enumerateCards(zoneCards, sorted) + " from " + nameZone(sideStr, zone),
    );
  }

  // Plural handling: "[it]" vs "[them]"
  const pluralRepr = flatCards.length > 1 ? "them" : "it";
  const followUp = andThen
    ? andThen.replace(/\[it\]|\[them\]/g, pluralRepr)
    : "";

  if (forced) {
    systemMsg(
      state,
      otherSide(side) ?? side,
      `uses ${card.title} to force the ${
        side === "corp" ? "Corp" : "Runner"
      } to reveal ${enumerateStr(strs)}${followUp}`,
    );
  } else {
    systemMsg(
      state,
      side,
      `uses ${card.title} to reveal ${enumerateStr(strs)}${followUp}`,
    );
  }

  if (!noEvent) {
    reveal(state, side, eid, ...targets);
  } else {
    effectCompleted(state, side, eid);
  }
}
