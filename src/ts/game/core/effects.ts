// Static and lingering effect registration and query.
// Mirrors: src/clj/game/core/effects.clj + src/go/game/core/effects.go

import { randomUUID } from "crypto";
import type { GameState, Effect } from "./state.js";
import type { Card } from "./card.js";
import type { EID } from "./eid.js";
import type { StaticAbility, ValueFn, ReqFn } from "./types.js";
import { CORP_SIDE, RUNNER_SIDE } from "./state.js";
import { isCorp, isRunner, isFacedown } from "./card.js";
import { makeEID } from "./eid.js";
import { getAllCards, getCard } from "./finding.js";
import { getCardDef } from "./types.js";
import { sameCard } from "../utils.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isDisabledReg(state: GameState, card: Card | null): boolean {
  if (!card) return false;
  return state.disabledCardReg.has(card.cid);
}

/**
 * Returns all registered effects of a given type, with the active player's
 * effects last (mirrors Clojure sort order).
 */
function gatherEffects(state: GameState, effectType: string): Effect[] {
  const stable: Effect[] = [];
  const active: Effect[] = [];
  for (const e of state.effects) {
    if (e.type !== effectType) continue;
    if (e.static && isDisabledReg(state, e.card)) continue;
    const cardSide = e.card
      ? isCorp(e.card)
        ? CORP_SIDE
        : isRunner(e.card)
          ? RUNNER_SIDE
          : ""
      : "";
    if (cardSide && cardSide === state.activePlayer) {
      active.push(e);
    } else {
      stable.push(e);
    }
  }
  return [...stable, ...active];
}

function effectPred(
  state: GameState,
  side: string,
  eid: EID,
  targets: Card[],
  e: Effect,
): boolean {
  if (!e.req) return true;
  return e.req(state, side, eid, e.card, targets);
}

// ---------------------------------------------------------------------------
// Public query API
// ---------------------------------------------------------------------------

/**
 * Returns filtered Effect objects (with refreshed card pointers).
 * Mirrors: get-effect-maps in effects.clj
 */
export function getEffectMaps(
  state: GameState,
  side: string,
  effectType: string,
  eid: EID,
  targets: Card[],
): Effect[] {
  const raw = gatherEffects(state, effectType);
  const out: Effect[] = [];
  for (const e of raw) {
    const e2: Effect = { ...e };
    if (e.card) e2.card = getCard(state, e.card) ?? e.card;
    if (effectPred(state, side, eid, targets, e2)) out.push(e2);
  }
  return out;
}

function getEffectValue(
  state: GameState,
  side: string,
  eid: EID,
  targets: Card[],
  e: Effect,
): unknown {
  if (!e.value) return null;
  return e.value(state, side, eid, e.card, targets);
}

/**
 * Returns the resolved values of all matching effects.
 * Mirrors: get-effects in effects.clj
 */
export function getEffects(
  state: GameState,
  side: string,
  effectType: string,
  target: Card | null,
  extraTargets: Card[],
): unknown[] {
  const eid = makeEID(state);
  const targets: Card[] = target ? [target, ...extraTargets] : [...extraTargets];
  const maps = getEffectMaps(state, side, effectType, eid, targets);
  return maps.map((e) => getEffectValue(state, side, eid, targets, e));
}

/**
 * Sums all numeric effects of a given type.
 * Mirrors: sum-effects in effects.clj
 */
export function sumEffects(
  state: GameState,
  side: string,
  effectType: string,
  target: Card | null,
  extraTargets: Card[],
): number {
  return getEffects(state, side, effectType, target, extraTargets).reduce(
    (sum, v) => (typeof v === "number" ? sum + v : sum),
    0,
  );
}

/**
 * Returns true if any effect satisfies pred.
 * Mirrors: any-effects in effects.clj
 */
export function anyEffects(
  state: GameState,
  side: string,
  effectType: string,
  pred: (v: unknown) => boolean,
  target: Card | null,
  extraTargets: Card[],
): boolean {
  return getEffects(state, side, effectType, target, extraTargets).some(pred);
}

/**
 * Checks if a card is disabled via the effect system.
 * Mirrors: is-disabled? in effects.clj
 */
export function isDisabled(
  state: GameState,
  side: string,
  target: Card,
): boolean {
  return anyEffects(
    state,
    side,
    "disable-card",
    (v) => v === true,
    target,
    [],
  );
}

/**
 * Rebuilds the disabled-card registry.
 * Mirrors: all-disabled-cards in effects.clj
 */
export function allDisabledCards(state: GameState): Map<string, Card> {
  const all = getAllCards(state);
  const m = new Map<string, Card>();
  for (const c of all) {
    if (isDisabled(state, "", c) || (isRunner(c) && isFacedown(c))) {
      m.set(c.cid, c);
    }
  }
  return m;
}

/**
 * Rebuilds and stores the disabled registry.
 * Mirrors: update-disabled-cards in effects.clj
 */
export function updateDisabledCards(state: GameState): Map<string, Card> {
  state.disabledCardReg = allDisabledCards(state);
  return state.disabledCardReg;
}

// ---------------------------------------------------------------------------
// Effect registration
// ---------------------------------------------------------------------------

/**
 * Registers all static abilities from a card's CardDef.
 * Mirrors: register-static-abilities in effects.clj
 */
export function registerStaticAbilities(
  state: GameState,
  _side: string,
  card: Card,
): Effect[] {
  const cdef = getCardDef(card);
  if (!cdef.staticAbilities?.length) return [];
  const registered: Effect[] = [];
  for (const sa of cdef.staticAbilities) {
    const e: Effect = {
      uuid: randomUUID(),
      type: sa.type,
      req: sa.req,
      value: sa.value,
      duration: "while-active",
      static: true,
      card,
    };
    state.effects.push(e);
    registered.push(e);
  }
  updateDisabledCards(state);
  return registered;
}

/**
 * Removes all while-active effects for a card.
 * Mirrors: unregister-static-abilities in effects.clj
 */
export function unregisterStaticAbilities(
  state: GameState,
  _side: string,
  card: Card,
): void {
  state.effects = state.effects.filter(
    (e) => !(sameCard(card, e.card) && e.duration === "while-active"),
  );
  updateDisabledCards(state);
}

/**
 * Registers a lingering (duration-bound) effect.
 * Mirrors: register-lingering-effect in effects.clj
 */
export function registerLingeringEffect(
  state: GameState,
  _side: string,
  card: Card,
  effectType: string,
  duration: string,
  req: ReqFn | null,
  value: ValueFn,
): Effect {
  const e: Effect = {
    uuid: randomUUID(),
    type: effectType,
    req: req ?? undefined,
    value,
    duration: duration || "true",
    lingering: true,
    card,
  };
  state.effects.push(e);
  updateDisabledCards(state);
  return e;
}

/**
 * Removes a single effect by UUID.
 * Mirrors: unregister-effect-by-uuid in effects.clj
 */
export function unregisterEffectByUUID(state: GameState, uuid: string): void {
  state.effects = state.effects.filter((e) => e.uuid !== uuid);
}

/**
 * Renames a duration key on all effects.
 * Mirrors: update-lingering-effect-durations in effects.clj
 */
export function updateLingeringEffectDurations(
  state: GameState,
  fromKey: string,
  toKey: string,
): void {
  for (const e of state.effects) {
    if (e.duration === fromKey) e.duration = toKey;
  }
  updateDisabledCards(state);
}

/**
 * Removes all effects with a given duration.
 * Mirrors: unregister-lingering-effects in effects.clj
 */
export function unregisterLingeringEffects(
  state: GameState,
  duration: string,
): void {
  state.effects = state.effects.filter((e) => e.duration !== duration);
}

/**
 * Removes all effects registered to a card (optional pred filter).
 * Mirrors: unregister-effects-for-card in effects.clj
 */
export function unregisterEffectsForCard(
  state: GameState,
  _side: string,
  card: Card,
  pred?: (e: Effect) => boolean,
): void {
  const p = pred ?? (() => true);
  state.effects = state.effects.filter(
    (e) => !(sameCard(card, e.card) && p(e)),
  );
  updateDisabledCards(state);
}
