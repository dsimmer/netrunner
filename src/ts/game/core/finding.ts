// Card lookup functions.
// Mirrors: src/clj/game/core/finding.clj + src/go/game/core/finding.go

import type { GameState } from "./state";
import type { Card, Zone } from "./card";
import { CORP_SIDE, RUNNER_SIDE } from "./state";
import { isType, TYPE_IDENTITY, isCorp, isRunner } from "./card";
import { sameCard } from "../utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServerZone(state: GameState, serverName: string) {
  const { corp } = state;
  switch (serverName) {
    case "hq":
      return corp.servers.hq;
    case "rd":
      return corp.servers.rd;
    case "archives":
      return corp.servers.archives;
    default:
      return corp.servers.remote[serverName] ?? null;
  }
}

/** Returns the card slice at a zone path for the given side. */
function zoneCards(state: GameState, side: string, zone: Zone): Card[] {
  if (!zone.length) return [];
  if (side === CORP_SIDE || side === "corp") {
    const c = state.corp;
    switch (zone[0]) {
      case "hand":
        return c.hand;
      case "deck":
        return c.deck;
      case "discard":
        return c.discard;
      case "scored":
        return c.scored;
      case "rfg":
        return c.rfg;
      case "play-area":
        return c.playArea;
      case "current":
        return c.current;
      case "set-aside":
        return c.setAside;
      case "servers": {
        if (zone.length < 3) return [];
        const sv = getServerZone(state, zone[1]);
        if (!sv) return [];
        return zone[2] === "ices" ? sv.ices : sv.content;
      }
    }
  } else {
    const r = state.runner;
    switch (zone[0]) {
      case "hand":
        return r.hand;
      case "deck":
        return r.deck;
      case "discard":
        return r.discard;
      case "scored":
        return r.scored;
      case "rfg":
        return r.rfg;
      case "play-area":
        return r.playArea;
      case "current":
        return r.current;
      case "set-aside":
        return r.setAside;
      case "rig":
        if (zone.length < 2) return [];
        switch (zone[1]) {
          case "hardware":
            return r.rig.hardware;
          case "program":
            return r.rig.program;
          case "resource":
            return r.rig.resource;
          case "facedown":
            return r.rig.facedown;
        }
    }
  }
  return [];
}

function findCIDInSlice(cid: string, cards: Card[]): Card | null {
  return cards.find((c: any) => c.cid === cid) ?? null;
}

function searchHosted(root: Card | null, target: Card): Card | null {
  if (!root) return null;
  for (const hosted of root.hosted ?? []) {
    if (sameCard(hosted, target)) return hosted;
    const found = searchHosted(hosted, target);
    if (found) return found;
  }
  return null;
}

function getCardHosted(state: GameState, card: Card): Card | null {
  const rootCard = getCard(state, getNestedHost(card));
  return searchHosted(rootCard, card);
}

function getNestedHost(card: Card | null): Card | null {
  if (!card) return null;
  return card.host ? getNestedHost(card.host) : card;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the most recent copy of a card from the current game state.
 * Mirrors: get-card in card.cljc
 */
export function getCard(state: GameState, card: Card | null): Card | null {
  if (!card) return null;
  if (isType(card, TYPE_IDENTITY)) {
    const side = (card.side ?? "").toLowerCase();
    return side === CORP_SIDE ? state.corp.identity : state.runner.identity;
  }
  if (card.host) return getCardHosted(state, card);
  const zone = card.zone ?? [];
  if (!zone.length) return card;

  // Scored cards can be in either side's scored area
  if (zone.length === 1 && zone[0] === "scored") {
    return (
      findCIDInSlice(card.cid, state.corp.scored) ??
      findCIDInSlice(card.cid, state.runner.scored)
    );
  }

  const side = (card.side ?? "").toLowerCase();
  const cards = zoneCards(state, side, zone);
  return findCIDInSlice(card.cid, cards);
}

/**
 * Returns the first card with the given CID from a slice.
 * Mirrors: find-cid in finding.clj
 */
export function findCID(cid: string, cards: Card[]): Card | null {
  return findCIDInSlice(cid, cards);
}

/**
 * Returns the first card with a matching title from a slice.
 * Mirrors: find-card in finding.clj
 */
export function findCard(title: string, cards: Card[]): Card | null {
  return cards.find((c: any) => c.title === title) ?? null;
}

/**
 * Returns the newest version of a card wherever it may be.
 * Mirrors: find-latest in finding.clj
 */
export function findLatest(state: GameState, card: Card | null): Card | null {
  if (!card) return null;
  const allC = getAllCards(state);
  return findCIDInSlice(card.cid, allC);
}

/**
 * Returns which side owns the scored area a card is in.
 * Mirrors: get-scoring-owner in finding.clj
 */
export function getScoringOwner(state: GameState, card: Card): string {
  if (findCIDInSlice(card.cid, state.corp.scored)) return CORP_SIDE;
  if (findCIDInSlice(card.cid, state.runner.scored)) return RUNNER_SIDE;
  return "";
}

// ---------------------------------------------------------------------------
// Board-level: must import board lazily to avoid circular issues
// These are re-exported from board.ts; imported here for convenience.
// ---------------------------------------------------------------------------

/** Returns all cards in the game (installed, hand, scored, etc.). */
export function getAllCards(state: GameState): Card[] {
  const checked: Card[] = [];
  const { corp: c, runner: r } = state;
  const unchecked: Card[] = [];

  // Corp servers
  for (const sv of [c.servers.hq, c.servers.rd, c.servers.archives]) {
    unchecked.push(...sv.content, ...sv.ices);
  }
  for (const sv of Object.values(c.servers.remote)) {
    unchecked.push(...sv.content, ...sv.ices);
  }
  // Runner rig
  const rig = r.rig;
  unchecked.push(
    ...rig.facedown,
    ...rig.hardware,
    ...rig.program,
    ...rig.resource,
  );
  // Zones
  for (const zone of [
    c.deck,
    c.hand,
    c.discard,
    c.current,
    c.scored,
    c.playArea,
    c.rfg,
    c.setAside,
    r.deck,
    r.hand,
    r.discard,
    r.current,
    r.scored,
    r.playArea,
    r.rfg,
    r.setAside,
  ]) {
    unchecked.push(...zone);
  }
  if (c.identity) unchecked.push(c.identity);
  if (r.identity) unchecked.push(r.identity);

  while (unchecked.length) {
    const card = unchecked.shift()!;
    checked.push(card);
    if (card.hosted?.length) unchecked.push(...card.hosted);
  }
  return checked;
}

export { allInstalled, allActiveInstalled, allInstalledRunnerType } from "./board";

/** Find a card anywhere in state by its cid. Mirrors `find-cid`. */
export function findCid(cid: string, state: GameState): Card | null {
  return findCIDInSlice(cid, getAllCards(state));
}
