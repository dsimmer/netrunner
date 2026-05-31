// Set-aside zone management.
// Mirrors: src/clj/game/core/set_aside.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import { CORP_SIDE, RUNNER_SIDE } from "./state";
import { inSetAside } from "./card";
import { move, swapCards } from "./moving";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getPlayer(state: GameState, side: string): Record<string, unknown> {
  return (side === CORP_SIDE ? state.corp : state.runner) as unknown as Record<string, unknown>;
}

function getSetAsideTracking(
  state: GameState,
  side: string,
): Record<string, string[]> {
  const player = getPlayer(state, side);
  return (player["setAsideTracking"] as Record<string, string[]>) ?? {};
}

function setSetAsideTracking(
  state: GameState,
  side: string,
  tracking: Record<string, string[]>,
): void {
  const player = getPlayer(state, side);
  player["setAsideTracking"] = tracking;
}

// ---------------------------------------------------------------------------
// set-aside
// Move a group of cards to the set-aside zone. Does not call effectCompleted on the eid.
// Mirrors: set-aside in set_aside.clj
// ---------------------------------------------------------------------------

export function setAside(
  state: GameState,
  side: string,
  eid: EID,
  cards: Card[],
  corpVis: boolean | null = true,
  runnerVis: boolean | null = true,
): Card[] {
  const tracking = getSetAsideTracking(state, side);
  tracking[String(eid.id)] = cards.map((c: Card) => c.cid);
  setSetAsideTracking(state, side, tracking);

  const results: Card[] = [];
  for (const card of cards) {
    const cardWithMeta = {
      ...card,
      setAsideVisibility: { corpCanSee: corpVis, runnerCanSee: runnerVis },
      setAsideEid: eid.id,
    };
    const moved = move(state, side, cardWithMeta as Card, "set-aside");
    if (moved) {
      results.push(moved);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// set-aside-for-me
// Sets aside cards visible only to the player setting them aside.
// Mirrors: set-aside-for-me in set_aside.clj
// ---------------------------------------------------------------------------

export function setAsideForMe(
  state: GameState,
  side: string,
  eid: EID,
  cards: Card[],
): Card[] {
  if (side === RUNNER_SIDE) {
    return setAside(state, side, eid, cards, null, true);
  }
  return setAside(state, side, eid, cards, true, null);
}

// ---------------------------------------------------------------------------
// get-set-aside
// Gets all the cards currently set aside in the given player's set-aside zone tracked with this eid.
// Mirrors: get-set-aside in set_aside.clj
// ---------------------------------------------------------------------------

export function getSetAside(state: GameState, side: string, eid: EID): Card[] {
  const eidStr = String(eid.id);
  const tracking = getSetAsideTracking(state, side);
  const cids = new Set(tracking[eidStr] ?? []);
  const player = getPlayer(state, side);
  const setAsideZone = (player["set-aside"] as Card[]) ?? [];
  return setAsideZone.filter((c: Card) => cids.has(c.cid));
}

// ---------------------------------------------------------------------------
// clean-set-aside!
// Cleans stale entries out of the set aside tracker.
// Mirrors: clean-set-aside! in set_aside.clj
// ---------------------------------------------------------------------------

export function cleanSetAside(state: GameState, side: string): void {
  const tracking = getSetAsideTracking(state, side);
  const toClear: string[] = [];
  for (const eid of Object.keys(tracking)) {
    if (getSetAside(state, side, { id: Number(eid) } as EID).length === 0) {
      toClear.push(eid);
    }
  }
  for (const eid of toClear) {
    delete tracking[eid];
  }
  setSetAsideTracking(state, side, tracking);
}

// ---------------------------------------------------------------------------
// add-to-set-aside
// Adds a card into an existing set-aside eid tracker.
// Mirrors: add-to-set-aside in set_aside.clj
// ---------------------------------------------------------------------------

export function addToSetAside(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  visibility: { corpCanSee: boolean | null; runnerCanSee: boolean | null },
): Card[] {
  const existing = getSetAside(state, side, eid);
  const combined = [...existing, card];
  return setAside(
    state,
    side,
    eid,
    combined,
    visibility.corpCanSee,
    visibility.runnerCanSee,
  );
}

// ---------------------------------------------------------------------------
// swap-set-aside-cards
// Swaps two cards when one or both aren't installed.
// Mirrors: swap-set-aside-cards in set_aside.clj
// ---------------------------------------------------------------------------

export function swapSetAsideCards(
  state: GameState,
  side: string,
  a: Card,
  b: Card,
): [Card | null, Card | null] | null {
  const swappedCards = swapCards(state, side, a, b);
  if (!swappedCards) return null;
  const [aMoved, bMoved] = swappedCards;

  if (inSetAside(a)) {
    const vis =
      (a.setAsideVisibility as {
        corpCanSee: boolean | null;
        runnerCanSee: boolean | null;
      }) ?? {};
    addToSetAside(
      state,
      side,
      { id: String(a.setAsideEid) } as unknown as EID,
      bMoved!,
      vis,
    );
  }
  if (inSetAside(b)) {
    const vis =
      (b.setAsideVisibility as {
        corpCanSee: boolean | null;
        runnerCanSee: boolean | null;
      }) ?? {};
    addToSetAside(
      state,
      side,
      { id: String(b.setAsideEid) } as unknown as EID,
      aMoved!,
      vis,
    );
  }

  return swappedCards;
}

export { removeFromCurrentlyDrawing } from "./moving_2";
