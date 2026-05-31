// Card hosting.
// Mirrors: src/clj/game/core/hosting.clj

import type { GameState } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";

import { isCorp, isProgram, isRezzed, isRunner } from "./card";
import { cardDef } from "./card_defs";
import { registerStaticAbilities, unregisterStaticAbilities } from "./effects";
import { makeEID } from "./eid";
import {
  registerDefaultEvents,
  registerEvents,
  unregisterEvents,
} from "./engine";
import { cardInit } from "./initializing";
import { getCard } from "./finding";
import { initMuCost } from "./memory";
import { update } from "./update";
import { makeTimestamp, removeOnce, sameCard } from "../utils";
import type { Counter } from './types';


// ---------------------------------------------------------------------------
// Type aliases for hosted-gained / hosted-lost callbacks
// ---------------------------------------------------------------------------

type HostedGainedCallback = (
  state: GameState,
  side: string,
  eid: EID,
  hostCard: Card,
  hostedCards: Card[],
) => void;

type HostedLostCallback = (
  state: GameState,
  side: string,
  eid: EID,
  hostCard: Card,
  hostedCard: Card,
) => void;

type LeavePlayFn = (
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  targets: unknown[],
) => void;

// ---------------------------------------------------------------------------
// remove-from-host
// ---------------------------------------------------------------------------

/**
 * Removes a card from its host.
 * Mirrors: remove-from-host
 */
export function removeFromHost(state: GameState, side: string, card: Card): void {
  return remove(state, side, card);
}

export function remove(state: GameState, side: string, card: Card): void {
  const hostCard = getCard(state, (card.host as Card | null | undefined) ?? null);
  if (!hostCard) return;

  const newHost: Card = {
    ...hostCard,
    hosted: removeOnce((c: Card) => c.cid === card.cid, hostCard.hosted ?? []) as Card[],
  };
  update(state, side, newHost);
  const updatedHost = newHost;

  const cdef = cardDef(updatedHost) as { hostedLost?: HostedLostCallback };
  const hostedLost = cdef.hostedLost;
  if (hostedLost) {
    const cardWithoutHost: Card = { ...card, host: undefined };
    hostedLost(
      state,
      side,
      makeEID(state),
      (getCard(state, updatedHost as Card) ?? updatedHost) as Card,
      cardWithoutHost,
    );
  }
}

// ---------------------------------------------------------------------------
// has-ancestor?
// ---------------------------------------------------------------------------

/**
 * Determines if the target is an ancestor of the given card (a card is its own ancestor).
 * Mirrors: has-ancestor?
 */
export function hasAncestor(
  card: Card | null | undefined,
  target: Card | null | undefined,
): boolean {
  if (!card || !target) return false;
  return sameCard(card, target) || hasAncestor(card.host, target);
}

// ---------------------------------------------------------------------------
// handle-card-is-uninstalled
// ---------------------------------------------------------------------------

/**
 * If a card is hosted (uninstalled) from being installed and active, then call its `leave-play` fn.
 * Mirrors: handle-card-is-uninstalled
 */
function handleCardIsUninstalled(
  state: GameState,
  side: string,
  _hostCard: Card,
  target: Card,
): void {
  const tdef = cardDef(target) as { leavePlay?: LeavePlayFn };
  const leavePlay = tdef.leavePlay;
  if (!leavePlay) return;

  const currentCard = getCard(state, target);
  if (!currentCard) return;

  const wasInstalled = currentCard.installed === true;
  // Check if the card was active (in-play-area or installed+rezzed/visible)
  const wasActive = isCardActive(currentCard);

  if (!target.installed && wasInstalled && wasActive) {
    leavePlay(
      state,
      (target.side ?? side).toLowerCase(),
      makeEID(state),
      target,
      [],
    );
  }
}

/**
 * Checks if the card is active and should receive game events/triggers.
 * Mirrors: active? in card.cljc
 */
function isCardActive(card: Card): boolean {
  // Basic actions are always active
  if (card.type === "Basic Action") return true;
  // Identity is active if not facedown
  if (card.type === "Identity" && card.facedown !== true) return true;
  // In-play-area cards (ICE in a server with content, etc.)
  if (isInPlayArea(card)) return true;
  // In current
  if (card.zone?.[0] === "runner" && card.zone?.[1] === "server") return true;
  // Scored
  if (card.zone?.[0] === "scored") return true;
  // Condition counters
  if (card.type === "Counter") return true;
  // Corp installed and rezzed
  if (isCorp(card) && card.installed === true && card.rezzed === true)
    return true;
  // Runner installed and not facedown
  if (isRunner(card) && card.installed === true && card.facedown !== true)
    return true;
  return false;
}

/**
 * Checks if card is in the play area (Corp: ICE on server, Asset; Runner: hardware, program, resource installed).
 */
function isInPlayArea(card: Card): boolean {
  const zone = card.zone ?? [];
  // Corp ICE on a server
  if (card.type === "ICE" && zone[0] === "corp" && zone[1] === "servers")
    return true;
  // Corp Asset
  if (card.type === "Asset" && card.installed === true) return true;
  // Runner installed cards
  if (card.side === "runner" && card.installed === true) {
    const t = card.type;
    if (t === "Hardware" || t === "Program" || t === "Resource") return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// host
// ---------------------------------------------------------------------------

interface HostOpts {
  facedown?: boolean;
  noMu?: boolean;
}

/**
 * Host the target onto the card.
 * Mirrors: host
 */
export function host(card: Card, target: Card, opts?: HostOpts | null): Card | null;
export function host(state: GameState, side: string, card: Card, target: Card, opts?: HostOpts | null): Card | null;
export function host(card: Card, target: Card, opts?: HostOpts | null): Card | null;
export function host(
  arg1: GameState | Card,
  arg2: string | Card,
  arg3: Card | HostOpts | null | undefined,
  arg4?: Card,
  arg5?: HostOpts | null,
): Card | null {
  // Shorthand form: (card, target, opts?) — used inside effect() lambdas.
  // No state/side available — best-effort no-op returning null.
  if (arg1 && typeof arg1 === "object" && "title" in (arg1 as object)) {
    return null;
  }
  const state = arg1 as GameState;
  const side = arg2 as string;
  const card = arg3 as Card;
  const target = arg4 as Card;
  const opts = arg5 ?? {};
  return hostInternal(state, side, card, target, opts);
}

function hostInternal(
  state: GameState,
  side: string,
  card: Card,
  target: Card,
  opts: HostOpts,
): Card | null {
  const { facedown, noMu } = opts;

  if (target.cid === card.cid) return null;

  handleCardIsUninstalled(state, side, card, target);

  unregisterEvents(state, side, target);
  unregisterStaticAbilities(state, side, target);

  const cid = target.cid;
  const zone = target.zone ?? [];
  const existingHost = target.host;

  // Remove target from its previous location on both sides
  for (const s of ["runner", "corp"] as const) {
    if (existingHost) {
      const hostCard = getCard(state, existingHost);
      if (hostCard) {
        const newHost: Card = {
          ...hostCard,
          hosted: removeOnce((c: Card) => c.cid === cid, hostCard.hosted ?? []) as Card[],
        };
        update(state, side, newHost);
      }
    } else {
      const path = [s, ...zone.map((z: string) => String(z))];
      removeFromZone(state, path, cid);
    }
  }

  // Also remove from the side's zone
  const sidePath = [side, ...zone.map((z: string) => String(z))];
  removeFromZone(state, sidePath, cid);

  // Get the current version of the host card and ensure zones are proper
  const hostCard = getCard(state, card);
  if (!hostCard) return null;

  const updatedHost = assocHostZones(hostCard);

  // Build the new target card
  const newHost = removeHostedFromCard(updatedHost);
  const newTarget: Card = {
    ...target,
    host: newHost,
    facedown: facedown,
    zone: ["onhost"] as Zone, // hosted cards should not be in :discard or :hand etc
    timestamp: makeTimestamp(),
    previousZone: target.zone,
  };

  // Update any cards hosted by the target, so their :host has the updated zone.
  if (newTarget.hosted && newTarget.hosted.length > 0) {
    newTarget.hosted = newTarget.hosted.map((h: Card) => ({
      ...h,
      host: newTarget,
    }));
  }

  // Add target to host card's hosted array
  const updatedHostWithNew: Card = {
    ...updatedHost,
    hosted: [...(updatedHost.hosted ?? []), newTarget],
  };
  update(state, side, updatedHostWithNew);

  const cdef = cardDef(updatedHostWithNew) as { hostedGained?: HostedGainedCallback };
  const tdef = cardDef(newTarget);

  // Check if the target should be fully initialized (active)
  const shouldBeActive =
    newTarget.installed === true &&
    (isRunner(newTarget) || (isCorp(newTarget) && isRezzed(newTarget)));

  if (shouldBeActive) {
    if (
      tdef.recurring ||
      (tdef as { prevent?: unknown }).prevent ||
      tdef.corpAbilities ||
      tdef.runnerAbilities
    ) {
      // Initialize the whole card
      cardInit(state, side, newTarget, {
        resolveEffect: false,
        initData: true,
        noMu: noMu ?? false,
      });
    } else {
      // Otherwise just register events and static abilities
      registerDefaultEvents(state, side, newTarget);
      registerStaticAbilities(state, side, newTarget);
      if (isProgram(newTarget) && !noMu) {
        initMuCost(state, newTarget);
      }
    }
  } else if (newTarget.installed !== true) {
    // Not installed - only register hosted-location events
    const events = (tdef.events ?? []).filter(
      (e) => (e as { location?: string }).location === "hosted",
    );
    if (events.length > 0) {
      registerEvents(
        state,
        side,
        getCard(state, newTarget) ?? newTarget,
        events,
      );
    }
  }

  // Call hosted-gained callback on the host card def
  const hostedGained = cdef.hostedGained;
  if (hostedGained) {
    hostedGained(
      state,
      side,
      makeEID(state),
      (getCard(state, updatedHost) ?? updatedHost),
      [newTarget],
    );
  }

  // Update all static abilities and floating effects to reflect the new target
  const effects = state.effects ?? [];
  state.effects = effects.map((currentEffect) => {
    const effectCard = currentEffect.card;
    if (effectCard && effectCard.cid === cid) {
      return { ...currentEffect, card: newTarget };
    }
    return currentEffect;
  });

  return getCard(state, newTarget);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Removes the card from a zone identified by the given path in state.
 * Path is like ["runner", "hand"] or ["corp", "discard"].
 */
function removeFromZone(state: GameState, path: string[], cid: string): void {
  let cur: unknown = state;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur == null || typeof cur !== "object") return;
    cur = (cur as Record<string, unknown>)[path[i]];
  }
  if (cur == null || typeof cur !== "object") return;
  const leafKey = path[path.length - 1];
  const arr = (cur as Record<string, unknown>)[leafKey];
  if (Array.isArray(arr)) {
    (cur as Record<string, unknown>)[leafKey] = removeOnce(
      (c: Card) => c.cid === cid,
      arr,
    );
  }
}

/**
 * Associates a new zone onto a card and its host(s).
 * Mirrors: assoc-host-zones
 */
function assocHostZones(card: Card): Card {
  const newZone = card.zone
    ? card.zone.map((z: string) => String(z))
    : card.zone;
  const updated = { ...card, zone: newZone };
  if (updated.host) {
    updated.host = assocHostZones(updated.host);
  }
  return updated;
}

/**
 * Creates a copy of the card with :hosted removed (for use as :host reference).
 */
function removeHostedFromCard(card: Card): Card {
  const { hosted, ...rest } = card;
  return rest;
}

/** The host card that this card is currently hosted on, looked up in state. */
export function getHost(state: GameState, card: Card | null | undefined): Card | null {
  const cardEffects = (state as GameState & { cardEffects?: Record<string, { host?: Card }> }).cardEffects;
  const cur = cardEffects?.[card?.cid ?? ""]?.host ?? card?.host;
  return cur ?? null;
}

/** All cards hosted on the given card. */
export function getHosts(_state: GameState, card: Card | null | undefined): Card[] {
  return card?.hosted ?? [];
}

/** Remove `card` from its host. Mirrors `unhost`. */
export function unhost(state: GameState, side: string, card: Card, _opts?: Record<string, unknown> | null): void {
  removeFromHost(state, side, card);
}
