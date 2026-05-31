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
import type { Ability, AbilityFn, State } from "./types";
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
    const def = cardDef(card) as { onPlay?: { playCostBonus?: AbilityFn } };
    const playFn = def.onPlay?.playCostBonus;
    if (playFn) {
      return playFn(state, side, makeEID(state), card, []);
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
  const def = cardDef(card) as { onPlay?: { basePlayCost?: CostData[]; playCostBonus?: AbilityFn } };
  const specialCost = def.onPlay?.basePlayCost;

  if (specialCost) {
    const costBonus = args?.costBonus ?? 0;
    const playCostBonus = (() => {
      const playFn = def.onPlay?.playCostBonus;
      if (playFn) {
        return playFn(state, side, makeEID(state), card, []);
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
  const def = cardDef(card) as { onPlay?: { additionalCost?: CostData[] } };
  return mergeCosts([
    def.onPlay?.additionalCost ?? [],
    getEffects(state, side, "play-additional-cost", card, []) as CostData[],
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
  args?: { costBonus?: number; "cost-bonus"?: number; [k: string]: unknown },
): number | undefined {
  if (!card) return undefined;
  const { cost } = card;
  if (cost === undefined) return undefined;

  const costBonus = args?.costBonus ?? 0;

  const rezCostBonus = (() => {
    if (isDisabledReg(state, card)) return undefined;
    const def = cardDef(card) as { rezCostBonus?: AbilityFn };
    const rezFn = def.rezCostBonus;
    if (rezFn) {
      return rezFn(state, side, makeEID(state), card, []);
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
      : ((cardDef(card) as { additionalCost?: CostData[] }).additionalCost ?? []),
    getEffects(state, side, "rez-additional-cost", card, []) as CostData[],
  ]);
  return costs.filter(pred ?? ((_c) => true));
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
  const def = cardDef(card) as { additionalCost?: CostData[] };
  return mergeCosts([
    def.additionalCost ?? [],
    getEffects(state, side, "score-additional-cost", card, []) as CostData[],
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
    const def = cardDef(card) as { trashCostBonus?: AbilityFn };
    const trashFn = def.trashCostBonus;
    if (trashFn) {
      return trashFn(state, side, makeEID(state), card, []);
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
  args?: { costBonus?: number; "cost-bonus"?: number; [k: string]: unknown },
  targets?: Card[],
): number {
  const costBonus = args?.costBonus ?? 0;
  const t = targets ?? [];

  const cardCost = isRunner(card) ? (card.cost ?? undefined) : undefined;

  const installCostBonus = (() => {
    const def = cardDef(card) as { installCostBonus?: AbilityFn };
    const instFn = def.installCostBonus;
    if (instFn) {
      return instFn(state, side, makeEID(state), card, []);
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
  const def = cardDef(card) as { additionalCost?: CostData[] };
  return mergeCosts([
    def.additionalCost ?? [],
    getEffects(state, side, "install-additional-cost", card, []) as CostData[],
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
  const def = cardDef(card) as {
    abilities?: Ability[];
    prevention?: { ability?: Ability }[];
    interactions?: { accessAbility?: Ability };
    events?: Ability[];
  };
  const abilities = def.abilities ?? [];
  const prevents = (def.prevention ?? []).map((p) => p.ability);
  const accessAb = [def.interactions?.accessAbility];
  const events = def.events ?? [];

  const allCosts = mergeCosts(
    [...abilities, ...prevents, ...accessAb, ...events].flatMap((ab: Ability | undefined) => [
      ab?.cost as CostData | CostData[] | undefined,
      (ab as { fakeCost?: CostData | CostData[] } | undefined)?.fakeCost,
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
    const costBonusFn = (ability as { costBonus?: AbilityFn }).costBonus;
    if (costBonusFn) {
      return costBonusFn(state, side, makeEID(state), card, t);
    }
    return undefined;
  })();

  const effectsCost = getEffects(state, side, "card-ability-cost", card, t);

  const baseCost = [ability.cost as CostData | CostData[] | undefined, costBonus, ...(effectsCost as CostData[])];

  const additionalEffects = getEffects(
    state,
    side,
    "card-ability-additional-cost",
    card,
    t,
  );

  const additionalCost = [
    ability.additionalCost as CostData | CostData[] | undefined,
    ...(additionalEffects as CostData[]),
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
    const breakFn = (ability as { breakCostBonus?: AbilityFn }).breakCostBonus;
    if (breakFn) {
      return breakFn(state, side, makeEID(state), card, t);
    }
    return undefined;
  })();

  return mergeCosts([
    ability.breakCost as CostData | CostData[] | undefined,
    ability.additionalCost as CostData | CostData[] | undefined,
    breakCostBonus,
    getEffects(state, side, "break-sub-additional-cost", card, t) as CostData[],
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
  const def = cardDef(card) as { stealCostBonus?: AbilityFn };
  const costFun = def.stealCostBonus;

  let stealCost: CostData[] | CostData | undefined;
  if (costFun) {
    const result = costFun(state, side, eid, card, []) as CostData[] | CostData | undefined;
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
  interface EffectMap {
    value?: AbilityFn;
    card?: Card | null;
  }
  const ev = (e: EffectMap): unknown => {
    if (!e.value) return null;
    return e.value(state, side, eid, e.card ?? null, [card]);
  };

  // Gather additional costs from effects
  const maps = getEffectMaps(state, side, "steal-additional-cost", eid, [card]);

  const effectCosts = (maps as EffectMap[]).reduce((acc: unknown[], e: EffectMap) => {
    const cost = ev(e);
    if (!cost) return acc;

    const annotated = Array.isArray(cost)
      ? cost.map((c: CostData) => ({
          ...c,
          args: { ...(c.args ?? {}), source: e.card },
        }))
      : { ...(cost as CostData), args: { ...((cost as CostData).args ?? {}), source: e.card } };

    return [...acc, annotated];
  }, []);

  return [...effectCosts.flat(), annotatedStealCost]
    .flat()
    .filter((c): c is CostData => !!c)
    .map((c: CostData) => ({
      ...c,
      additional: true,
      args: {
        ...(c.args ?? {}),
        sourceType: "ability",
      },
    }));
}
