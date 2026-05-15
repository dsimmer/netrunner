// Agenda management: advancement requirements, agenda points.
// Mirrors: src/clj/game/core/agendas.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import { isAgenda } from "./card";
import { CORP_SIDE } from "./state";
import { cardDef } from "./card_defs";
import { sumEffects } from "./effects";
import { makeEID } from "./eid";
import { getAllCards, getCard } from "./finding";
import { getScoringOwner } from "./finding";
import { toKeyword } from "../utils";

// ---------------------------------------------------------------------------
// update! — Card update helper
// Mirrors: update! in update.clj
// ---------------------------------------------------------------------------

/**
 * Updates the state so that its copy of the given card matches the argument given.
 * Mirrors: update! in update.clj
 */
export function updateCard(
  state: GameState,
  side: string,
  card: Card,
): Card | null {
  // Identity cards
  if (card.type === "Identity") {
    if (side === toKeyword(card.side ?? "")) {
      (state as any)[side].identity = card;
    }
    return card;
  }

  // Hosted cards
  if (card.host) {
    return updateHostedCard(state, side, card);
  }

  // Regular cards: find in zone and replace
  const scoringOwner = getScoringOwner(state, card);
  const effectiveSide = scoringOwner || side;
  const z = [toKeyword(effectiveSide), ...(card.zone ?? [])];
  const zoneArr = z as any;

  // Navigate to the zone array
  let zoneRef: Card[] | null = null;
  let current: any = state;
  for (let i = 0; i < zoneArr.length; i++) {
    if (i === 0) {
      // First element is side - get corp or runner
      current = current[zoneArr[i]];
    } else if (i === 1 && zoneArr[0] === CORP_SIDE) {
      // Second element is a zone name under corp/runner
      if (zoneArr[1] === "servers") {
        // Navigate into servers -> server name -> ices/content
        if (zoneArr.length > 2) {
          const serverName = zoneArr[2] as string;
          const server = current.servers?.[serverName];
          if (!server) return card;
          if (zoneArr[3] === "ices") {
            zoneRef = server.ices;
          } else {
            zoneRef = server.content;
          }
        }
      } else {
        zoneRef = current[zoneArr[1]];
      }
    } else if (i >= 2 && zoneArr[0] === CORP_SIDE) {
      // Handle nested server paths
      const serverName = zoneArr[1];
      const server = current.servers?.[serverName];
      if (zoneArr[2] === "ices") {
        zoneRef = server?.ices;
      } else {
        zoneRef = server?.content;
      }
    } else {
      zoneRef = current[zoneArr[i]];
    }
  }

  if (!zoneRef) return card;

  const cid = card.cid;
  const idx = zoneRef.findIndex((c: Card) => c.cid === cid);
  if (idx !== -1) {
    zoneRef[idx] = card;
  }

  return getCard(state, card);
}

/**
 * Updates a card that is hosted on another, by recursively updating the host card's
 * :hosted vector.
 * Mirrors: update-hosted! in update.clj
 */
function updateHostedCard(
  state: GameState,
  side: string,
  card: Card,
): Card | null {
  const hostCard = getCard(state, card.host);
  if (hostCard) {
    const cid = card.cid;
    const hosted = hostCard.hosted ?? [];
    const idx = hosted.findIndex((c: Card) => c.cid === cid);
    if (idx !== -1) {
      // Update the hosted card in place
      const newHosted = [...hosted];
      newHosted[idx] = card;
      hostCard.hosted = newHosted;
      return getCard(state, card);
    }
    // Recurse: try updating on the host
    return updateHostedCard(state, side, { ...card, host: hostCard });
  }
  // If no host found and no host card exists, fall back to regular update
  if (!card.host) {
    return updateCard(state, side, card);
  }
  return card;
}

// ---------------------------------------------------------------------------
// Advancement requirement
// ---------------------------------------------------------------------------

/**
 * Calculates the current advancement requirement for an agenda.
 * Mirrors: advancement-requirement in agendas.clj
 */
function advancementRequirement(state: GameState, card: Card): number | null {
  if (!isAgenda(card)) return null;

  const advancementCost = (card as any).advancementcost ?? 0;

  // Get advancement-requirement function from card def
  const cdef = cardDef(card);
  const advanceFn = (cdef as any)["advancement-requirement"];

  let advanceResult = 0;
  if (advanceFn) {
    advanceResult = advanceFn(state, CORP_SIDE, makeEID(state), card, []);
  }

  // Sum effects for :advancement-requirement
  const effectsSum = sumEffects(
    state,
    CORP_SIDE,
    ":advancement-requirement",
    card,
    [],
  );

  // Sum all values, treating null/undefined as 0
  const total = [advancementCost, advanceResult, effectsSum].reduce(
    (sum: number, v: unknown) => sum + (typeof v === "number" ? v : 0),
    0,
  );

  return Math.max(total, 0);
}

// ---------------------------------------------------------------------------
// Update advancement requirement for a single agenda
// ---------------------------------------------------------------------------

/**
 * Recalculates the advancement requirement for the given agenda.
 * Mirrors: update-advancement-requirement in agendas.clj
 */
export function updateAdvancementRequirement(
  state: GameState,
  agenda: Card,
): boolean;
/**
 * Recalculates the advancement requirement for the given agenda.
 * (side parameter is ignored, mirrors Clojure multi-arities).
 * Mirrors: update-advancement-requirement in agendas.clj
 */
export function updateAdvancementRequirement(
  state: GameState,
  _side: unknown,
  agenda: Card,
): boolean;
export function updateAdvancementRequirement(
  state: GameState,
  sideOrAgenda: unknown,
  agenda?: Card,
): boolean {
  // Handle multi-arities: (update-advancement-requirement state agenda) and (update-advancement-requirement state _ agenda)
  let a: Card;
  if (
    typeof sideOrAgenda === "string" ||
    sideOrAgenda === null ||
    sideOrAgenda === undefined
  ) {
    a = agenda!;
  } else {
    a = sideOrAgenda as Card;
  }

  const prevReq = (a as any).currentAdvancementRequirement;
  const newReq = advancementRequirement(state, a);
  const changed = prevReq !== newReq;

  if (changed) {
    (a as any).currentAdvancementRequirement = newReq;
    updateCard(state, CORP_SIDE, a);
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Update all advancement requirements
// ---------------------------------------------------------------------------

/**
 * Updates advancement requirements for all agendas.
 * Mirrors: update-all-advancement-requirements in agendas.clj
 */
export function updateAllAdvancementRequirements(state: GameState): boolean;
/**
 * Updates advancement requirements for all agendas.
 * (side parameter is ignored, mirrors Clojure multi-arities).
 * Mirrors: update-all-advancement-requirements in agendas.clj
 */
export function updateAllAdvancementRequirements(
  state: GameState,
  _side: unknown,
): boolean;
export function updateAllAdvancementRequirements(
  state: GameState,
  side?: unknown,
): boolean {
  const agendas = getAllCards(state).filter(isAgenda);
  let changed = false;
  for (const agenda of agendas) {
    if (updateAdvancementRequirement(state, agenda)) {
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Agenda points
// ---------------------------------------------------------------------------

/**
 * Applies agenda-point modifications to calculate the number of points this card is worth
 * to the given player.
 * Mirrors: agenda-points in agendas.clj
 */
export function agendaPoints(
  state: GameState,
  side: string,
  card: Card | null,
): number {
  if (!card) return 0;

  const basePoints = (card as any).agendapoints ?? 0;
  const cdef = cardDef(card);

  // Get the points function based on side
  const pointsFn =
    side === CORP_SIDE
      ? (cdef as any)["agendapoints-corp"]
      : (cdef as any)["agendapoints-runner"];

  if (typeof pointsFn === "function") {
    const fnResult = pointsFn(state, side, null, card, []);
    return fnResult + sumEffects(state, side, ":agenda-value", card, []);
  }

  return basePoints + sumEffects(state, side, ":agenda-value", card, []);
}

// ---------------------------------------------------------------------------
// Update agenda points for a single card
// ---------------------------------------------------------------------------

/**
 * Updates agenda points for a single card on a side.
 * Mirrors: update-agenda-points-card in agendas.clj
 */
function updateAgendaPointsCard(
  state: GameState,
  side: string,
  card: Card,
): boolean {
  const prevPoints = (card as any).currentPoints;
  const newPoints = agendaPoints(state, side, card);
  const changed = prevPoints !== newPoints;

  if (changed) {
    (card as any).currentPoints = newPoints;
    updateCard(state, side, card);
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Sum side agenda points
// ---------------------------------------------------------------------------

/**
 * Calculates and sums all agenda points for a side.
 * Mirrors: sum-side-agenda-points in agendas.clj
 */
function sumSideAgendaPoints(state: GameState, side: string): boolean {
  const currentPlayer = side === CORP_SIDE ? state.corp : state.runner;
  const currentPoints = currentPlayer.agendaPoint ?? 0;
  const scored = currentPlayer.scored ?? [];

  const scoredPoints = scored.reduce(
    (sum: number, card: Card) => sum + ((card as any).currentPoints ?? 0),
    0,
  );

  const userAdjustedPoints = sumEffects(
    state,
    side,
    ":user-agenda-points",
    null,
    [...(side === CORP_SIDE ? ([state.corp] as any) : ([state.runner] as any))],
  );

  const totalPoints = userAdjustedPoints + scoredPoints;
  const changed = currentPoints !== totalPoints;

  if (changed) {
    currentPlayer.agendaPoint = totalPoints;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Update side agenda points
// ---------------------------------------------------------------------------

/**
 * Updates agenda points for all scored cards on a side, then recalculates totals.
 * Mirrors: update-side-agenda-points in agendas.clj
 */
function updateSideAgendaPoints(state: GameState, side: string): boolean {
  const currentPlayer = side === CORP_SIDE ? state.corp : state.runner;
  const scored = currentPlayer.scored ?? [];

  let cardPointsChanged = false;
  for (const agenda of scored) {
    if (updateAgendaPointsCard(state, side, agenda)) {
      cardPointsChanged = true;
    }
  }

  return sumSideAgendaPoints(state, side) || cardPointsChanged;
}

// ---------------------------------------------------------------------------
// Update all agenda points
// ---------------------------------------------------------------------------

/**
 * Updates agenda points for both sides.
 * Mirrors: update-all-agenda-points in agendas.clj
 */
export function updateAllAgendaPoints(state: GameState): boolean;
/**
 * Updates agenda points for both sides.
 * (side parameter is ignored, mirrors Clojure multi-arities).
 * Mirrors: update-all-agenda-points in agendas.clj
 */
export function updateAllAgendaPoints(
  state: GameState,
  _side: unknown,
): boolean;
export function updateAllAgendaPoints(
  state: GameState,
  side?: unknown,
): boolean {
  const corpChanged = updateSideAgendaPoints(state, CORP_SIDE);
  const runnerChanged = updateSideAgendaPoints(state, "runner");
  return corpChanged || runnerChanged;
}
