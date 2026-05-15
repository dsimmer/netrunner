// Identity enable/disable.
// Mirrors: src/clj/game/core/identities.clj

import type { GameState } from "./state.js";
import type { Card } from "./card.js";
import {
  isBasicAction,
  isIdentity,
  isFacedown,
  isCorp,
  isRunner,
  isInstalled,
  isRezzed,
  inScored,
  inZone,
  getType,
  TYPE_COUNTER,
} from "./card.js";
import { getPlayer } from "./state.js";
import type { Corp, Runner } from "./state.js";
import { getCardDef } from "./types.js";
import { registerStaticAbilities, unregisterStaticAbilities } from "./effects.js";
import { makeEID } from "./eid.js";
import { registerDefaultEvents, resolveAbility, unregisterEvents } from "./engine.js";
import { cardInit, deactivate } from "./initializing.js";
import { update } from "./update.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPlayerState(state: GameState, side: string): Corp | Runner {
  return getPlayer(state, side);
}

function updateIdentity(state: GameState, side: string, card: Card): Card {
  const player = getPlayerState(state, side);
  player.identity = card;
  return card;
}

function getIdentity(state: GameState, side: string): Card | null {
  return getPlayerState(state, side).identity;
}

/**
 * Checks if the card is active and should receive game events/triggers.
 * Mirrors active? in game.core.card (src/cljc/game/core/card.cljc)
 */
function active(card: Card): boolean {
  return (
    isBasicAction(card) ||
    (isIdentity(card) && !isFacedown(card)) ||
    inZone(card, "play-area") ||
    inZone(card, "current") ||
    inScored(card) ||
    getType(card) === TYPE_COUNTER ||
    (isCorp(card) && isInstalled(card) && isRezzed(card)) ||
    (isRunner(card) && isInstalled(card) && !isFacedown(card))
  );
}

// ---------------------------------------------------------------------------
// Identity enable/disable
// ---------------------------------------------------------------------------

/** Actually disables the side's identity. */
function actualDisableIdentity(state: GameState, side: string): void {
  const id = updateIdentity(state, side, { ...getIdentity(state, side)!, disabled: true });
  unregisterEvents(state, side, id);
  unregisterStaticAbilities(state, side, id);
  const cdef = getCardDef(id);
  if (cdef.leavePlay) {
    cdef.leavePlay(state, side, makeEID(state), id, []);
  }
}

/**
 * Disables the side's identity, tracking disable count.
 * Mirrors disable-identity.
 */
export function disableIdentity(state: GameState, side: string): void {
  const identity = getIdentity(state, side);
  if (!identity) return;
  const disableCount = (identity.numDisables ?? 0) + 1;
  const id = updateIdentity(state, side, { ...identity, numDisables: disableCount });
  if (disableCount === 1) {
    actualDisableIdentity(state, side);
  }
}

/**
 * Disables a card.
 * Mirrors disable-card.
 */
export function disableCard(state: GameState, side: string, card: Card): void {
  deactivate(state, side, card);
  const c = update(state, side, (c) => ({ ...c, disabled: true }), card);
  const cdef = getCardDef(c);
  if (cdef.disable) {
    cdef.disable(state, side, makeEID(state), c, []);
  }
}

/** Actually enables the side's identity. */
function actualEnableIdentity(state: GameState, side: string): void {
  const id = updateIdentity(state, side, { ...getIdentity(state, side)!, disabled: false });
  const cdef = getCardDef(id);
  if (cdef.effect) {
    cdef.effect(state, side, makeEID(state), id, []);
  }
  registerDefaultEvents(state, side, id);
  registerStaticAbilities(state, side, id);
}

/**
 * Enables the side's identity, tracking disable count.
 * Mirrors enable-identity.
 */
export function enableIdentity(state: GameState, side: string): void {
  const identity = getIdentity(state, side);
  if (!identity) return;
  const disableCount = (identity.numDisables ?? 1) - 1;
  const id = updateIdentity(state, side, { ...identity, numDisables: disableCount });
  if (disableCount === 0) {
    actualEnableIdentity(state, side);
  }
}

/**
 * Enables a disabled card.
 * Mirrors enable-card.
 */
export function enableCard(state: GameState, side: string, card: Card): void {
  if (!card.disabled) return;
  const c = update(state, side, (c) => {
    const { disabled, ...rest } = c;
    return rest;
  }, card);
  if (active(card)) {
    cardInit(state, side, c, { resolveEffect: false });
  }
}
