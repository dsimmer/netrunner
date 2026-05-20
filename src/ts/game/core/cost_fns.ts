// State-aware cost-generating functions.
// Mirrors: src/clj/game/core/cost_fns.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import { isRunner } from "./card";
import { cardDef } from "./card_defs";
import { getEffects, sumEffects, anyEffects, getEffectMaps } from "./effects";
import { makeEID } from "./eid";
import { mergeCosts } from "./payment";
import type { CostData } from "./payment";
import type { EID } from "./eid";
import type { Ability, State } from "./types.ts";
export type { CostData } from "./payment";

// ---------------------------------------------------------------------------
// Internal helper – mirrors is-disabled-reg? from effects (private there)
// ---------------------------------------------------------------------------

function isDisabledReg(state: GameState, card: Card | null): boolean {
  if (!card) return false;
  return state.disabledCardReg.has(card.cid);
}

// ---------------------------------------------------------------------------
// play-cost
// ---------------------------------------------------------------------------

/**
 * Combines all relevant effects and costs to play a given card.
 * Returns the total numeric play cost (minimum 0).
 */
export function playCost(
  state: GameState,
  side: string,
  card: Card,
  args?: { costBonus?: number },
): number | undefined {
  const { cost } = card;
  if (cost === undefined) return undefined;

  const costBonus = args?.costBonus ?? 0;

  const playCostBonus = (() => {
    const def = cardDef(card);
    const playFn = (def as any).onPlay?.playCostBonus;
    if (playFn) {
      return playFn(state, side, makeEID(state), card, null);
    }
    return undefined;
  })();

  const effectsSum = sumEffects(state, side, "play-cost", card, []);

  const total = [cost, costBonus, playCostBonus, effectsSum].reduce(
    (sum, v) => sum + (typeof v === "number" ? v : 0),
    0,
  );

  return Math.max(0, total);
}

// ---------------------------------------------------------------------------
// base-play-cost
// ---------------------------------------------------------------------------

/**
 * The play cost for an event or operation, taking into account an X as a cost.
 * Returns a cost vector (CostData[]).
 */
export function basePlayCost(
  state: GameState,
  side: string,
  card: Card,
  args?: { costBonus?: number },
): CostData[] {
  const def = cardDef(card);
  const specialCost = (def as any).onPlay?.basePlayCost;

  if (specialCost) {
    const costBonus = args?.costBonus ?? 0;
    const playCostBonus = (() => {
      const playFn = (def as any).onPlay?.playCostBonus;
      if (playFn) {
        return playFn(state, side, makeEID(state), card, null);
      }
      return 0;
    })();
    const effectsSum = sumEffects(state, side, "play-cost", card, []);
    const modifications = costBonus + playCostBonus + effectsSum;

    if (modifications === 0) {
      return specialCost;
    }

    const hasXCredits = specialCost.some(
      (c: CostData) => c.type === "x-credits",
    );

    if (hasXCredits) {
      return specialCost.map((c: CostData) =>
        c.type === "x-credits" ? { ...c, offset: modifications } : c,
      );
    }

    return mergeCosts([
      ...specialCost,
      { type: "credit", amount: modifications },
    ]);
  }

  const numericCost = playCost(state, side, card, args);
  return [{ type: "credit", amount: numericCost ?? 0 }];
}

// ---------------------------------------------------------------------------
// play-additional-cost-bonus
// ---------------------------------------------------------------------------

/**
 * Returns additional costs for playing a card (merged card-def and effects).
 */
export function playAdditionalCostBonus(
  state: GameState,
  side: string,
  card: Card,
): CostData[] {
  const def = cardDef(card);
  return mergeCosts([
    (def as any).onPlay?.additionalCost ?? [],
    getEffects(state, side, "play-additional-cost", card, []),
  ]);
}

// ---------------------------------------------------------------------------
// rez-cost
// ---------------------------------------------------------------------------

/**
 * Combines all rez effects and costs into a single number, not a cost vector.
 */
export function rezCost(
  state: GameState,
  side: string,
  card: Card | null,
  args?: { costBonus?: number; "cost-bonus"?: number; [k: string]: any },
): number | undefined {
  if (!card) return undefined;
  const { cost } = card;
  if (cost === undefined) return undefined;

  const costBonus = args?.costBonus ?? 0;

  const rezCostBonus = (() => {
    if (isDisabledReg(state, card)) return undefined;
    const def = cardDef(card);
    const rezFn = (def as any).rezCostBonus;
    if (rezFn) {
      return rezFn(state, side, makeEID(state), card, null);
    }
    return undefined;
  })();

  const effectsSum = sumEffects(state, side, "rez-cost", card, []);

  const total = [cost, costBonus, rezCostBonus, effectsSum].reduce(
    (sum, v) => sum + (typeof v === "number" ? v : 0),
    0,
  );

  return Math.max(0, total);
}

// ---------------------------------------------------------------------------
// rez-additional-cost-bonus
// ---------------------------------------------------------------------------

/**
 * Returns additional costs for rez, optionally filtered by predicate.
 */
export function rezAdditionalCostBonus(
  state: GameState,
  side: string,
  card: Card,
  pred?: (c: CostData) => boolean,
): CostData[] {
  const costs = mergeCosts([
    isDisabledReg(state, card)
      ? []
      : ((cardDef(card) as any).additionalCost ?? []),
    getEffects(state, side, "rez-additional-cost", card, []),
  ]);
  return costs.filter(pred ?? ((c) => c));
}

// ---------------------------------------------------------------------------
// score-additional-cost-bonus
// ---------------------------------------------------------------------------

/**
 * Returns additional costs for scoring an agenda.
 */
export function scoreAdditionalCostBonus(
  state: GameState,
  side: string,
  card: Card,
): CostData[] {
  const def = cardDef(card);
  return mergeCosts([
    (def as any).additionalCost ?? [],
    getEffects(state, side, "score-additional-cost", card, []),
  ]);
}

// ---------------------------------------------------------------------------
// trash-cost
// ---------------------------------------------------------------------------

/**
 * Returns the number of credits required to trash the given card.
 */
export function trashCost(
  state: GameState,
  side: string,
  card: Card,
  args?: { costBonus?: number },
): number | undefined {
  const { trash } = card;
  if (trash === undefined) return undefined;

  const costBonus = args?.costBonus ?? 0;

  const trashCostBonus = (() => {
    const def = cardDef(card);
    const trashFn = (def as any).trashCostBonus;
    if (trashFn) {
      return trashFn(state, side, makeEID(state), card, null);
    }
    return undefined;
  })();

  const effectsSum = sumEffects(state, side, "trash-cost", card, []);

  const total = [trash, costBonus, trashCostBonus, effectsSum].reduce(
    (sum, v) => sum + (typeof v === "number" ? v : 0),
    0,
  );

  return Math.max(0, total);
}

// ---------------------------------------------------------------------------
// install-cost
// ---------------------------------------------------------------------------

/**
 * Returns the number of credits required to install the given card.
 */
export function installCost(
  state: GameState,
  side: string,
  card: Card,
  args?: { costBonus?: number; "cost-bonus"?: number; [k: string]: any },
  targets?: Card[],
): number {
  const costBonus = args?.costBonus ?? 0;
  const t = targets ?? [];

  const cardCost = isRunner(card) ? (card.cost ?? undefined) : undefined;

  const installCostBonus = (() => {
    const def = cardDef(card);
    const instFn = (def as any).installCostBonus;
    if (instFn) {
      return instFn(state, side, makeEID(state), card, null);
    }
    return undefined;
  })();

  const effectsSum = sumEffects(state, side, "install-cost", card, t);

  const total = [cardCost, costBonus, installCostBonus, effectsSum].reduce(
    (sum, v) => sum + (typeof v === "number" ? v : 0),
    0,
  );

  return Math.max(0, total);
}

// ---------------------------------------------------------------------------
// install-additional-cost-bonus
// ---------------------------------------------------------------------------

/**
 * Returns additional costs for installing a card.
 */
export function installAdditionalCostBonus(
  state: GameState,
  side: string,
  card: Card,
): CostData[] {
  const def = cardDef(card);
  return mergeCosts([
    (def as any).additionalCost ?? [],
    getEffects(state, side, "install-additional-cost", card, []),
  ]);
}

// ---------------------------------------------------------------------------
// ignore-install-cost?
// ---------------------------------------------------------------------------

/**
 * Returns true if any effect ignores install cost for the given card.
 */
export function ignoreInstallCost(
  state: GameState,
  side: string,
  card: Card,
): boolean {
  return anyEffects(
    state,
    side,
    "ignore-install-cost",
    (v) => v === true,
    card,
    [],
  );
}

// ---------------------------------------------------------------------------
// run-cost
// ---------------------------------------------------------------------------

/**
 * Get total cost (credits) required to run a server.
 */
export function runCost(
  state: GameState,
  side: string,
  card: Card,
  args?: { costBonus?: number },
  targets?: Card[],
): number | undefined {
  const costBonus = args?.costBonus ?? 0;
  const t = targets ?? [];

  const effectsSum = sumEffects(state, side, "run-cost", card, t);

  const total = [costBonus, effectsSum].reduce(
    (sum, v) => sum + (typeof v === "number" ? v : 0),
    0,
  );

  return Math.max(0, total);
}

// ---------------------------------------------------------------------------
// run-additional-cost-bonus
// ---------------------------------------------------------------------------

/**
 * Returns additional costs for running a server.
 */
export function runAdditionalCostBonus(
  state: GameState,
  side: string,
  card: Card,
  targets?: Card[],
): CostData[] {
  const t = targets ?? [];
  return mergeCosts(
    getEffects(state, side, "run-additional-cost", card, t) as (
      | CostData
      | CostData[]
      | null
      | undefined
    )[],
  );
}

// ---------------------------------------------------------------------------
// has-trash-ability?
// ---------------------------------------------------------------------------

/**
 * Returns true if the card has a trash-can cost ability.
 */
export function hasTrashAbility(card: Card): boolean {
  const def = cardDef(card);
  const abilities = (def as any).abilities ?? [];
  const prevents = ((def as any).prevention ?? []).map((p: any) => p.ability);
  const accessAb = [(def as any).interactions?.accessAbility];
  const events = (def as any).events ?? [];

  const allCosts = mergeCosts(
    [...abilities, ...prevents, ...accessAb, ...events].map((ab: any) => [
      ab?.cost,
      ab?.fakeCost,
    ]),
  );

  return allCosts.some((c: CostData) => c?.type === "trash-can");
}

// ---------------------------------------------------------------------------
// card-ability-cost
// ---------------------------------------------------------------------------

/**
 * Returns a list of all costs (printed and additional) required to use a given ability.
 */
export function cardAbilityCost(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card,
  targets?: Card[],
): CostData[] {
  const t = targets ?? [];

  const costBonus = (() => {
    const costBonusFn = (ability as any).costBonus;
    if (costBonusFn) {
      return costBonusFn(state, side, makeEID(state), card, t);
    }
    return undefined;
  })();

  const effectsCost = getEffects(state, side, "card-ability-cost", card, t);

  const baseCost = [(ability as any).cost, costBonus, ...effectsCost];

  const additionalEffects = getEffects(
    state,
    side,
    "card-ability-additional-cost",
    card,
    t,
  );

  const additionalCost = [
    (ability as any).additionalCost,
    ...additionalEffects,
  ].flat();

  return mergeCosts([...baseCost, ...additionalCost]);
}

// ---------------------------------------------------------------------------
// break-sub-ability-cost
// ---------------------------------------------------------------------------

/**
 * Returns costs for breaking a subroutine ability.
 */
export function breakSubAbilityCost(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card,
  targets?: Card[],
): CostData[] {
  const t = targets ?? [];

  const breakCostBonus = (() => {
    const breakFn = (ability as any).breakCostBonus;
    if (breakFn) {
      return breakFn(state, side, makeEID(state), card, t);
    }
    return undefined;
  })();

  return mergeCosts([
    (ability as any).breakCost,
    (ability as any).additionalCost,
    breakCostBonus,
    getEffects(state, side, "break-sub-additional-cost", card, t),
  ]);
}

// ---------------------------------------------------------------------------
// jack-out-cost
// ---------------------------------------------------------------------------

/**
 * Returns additional costs for jacking out.
 */
export function jackOutCost(state: GameState, side: string): CostData[] {
  return mergeCosts(
    getEffects(state, side, "jack-out-additional-cost", null, []) as (
      | CostData
      | CostData[]
      | null
      | undefined
    )[],
  );
}

// ---------------------------------------------------------------------------
// steal-cost
// ---------------------------------------------------------------------------

/**
 * Gets a vector of costs and their sources for stealing the given agenda.
 */
export function stealCost(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
): CostData[] {
  const def = cardDef(card);
  const costFun = (def as any).stealCostBonus;

  let stealCost: CostData[] | CostData | undefined;
  if (costFun) {
    const result = costFun(state, side, eid, card, null);
    stealCost = result;
  }

  // Attach source info to card-def steal costs
  const annotatedStealCost = stealCost
    ? Array.isArray(stealCost)
      ? stealCost.map((c: CostData) => ({
          ...c,
          args: { ...(c.args ?? {}), source: card },
        }))
      : { ...stealCost, args: { ...(stealCost.args ?? {}), source: card } }
    : undefined;

  // Build an effect value resolver for the agenda
  const ev = (e: any): any => {
    if (!e.value) return null;
    return e.value(state, side, eid, e.card, [card]);
  };

  // Gather additional costs from effects
  const maps = getEffectMaps(state, side, "steal-additional-cost", eid, [card]);

  const effectCosts = maps.reduce((acc: any[], e: any) => {
    const cost = ev(e);
    if (!cost) return acc;

    const annotated = Array.isArray(cost)
      ? cost.map((c: CostData) => ({
          ...c,
          args: { ...(c.args ?? {}), source: e.card },
        }))
      : { ...cost, args: { ...(cost.args ?? {}), source: e.card } };

    return [...acc, annotated];
  }, []);

  return [...effectCosts.flat(), annotatedStealCost]
    .flat()
    .filter((c: any) => c)
    .map((c: CostData) => ({
      ...c,
      additional: true,
      args: {
        ...(c.args ?? {}),
        sourceType: "ability",
      },
    }));
}
