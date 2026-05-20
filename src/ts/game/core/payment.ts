// Payment / cost creation, merging, and helpers.
// Mirrors: src/clj/game/core/payment.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability, Cost } from "./types.ts";
import { isICE } from "./card";
import { makeEID } from "./eid";
import { anyEffects } from "./effects";
import { toast } from "./toasts";
import { capitalize } from "../../jinteki/utils";
import { label, payable, value } from "./costs";

// ---------------------------------------------------------------------------
// Cost data type
// ---------------------------------------------------------------------------

export interface CostData {
  type: string;
  amount?: number;
  additional?: boolean;
  stealth?: number | "all-stealth";
  maximum?: number;
  offset?: number;
  args?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Cost constructor — mirrors (->c type n args) in payment.clj
// ---------------------------------------------------------------------------

interface ToCArgs {
  additional?: boolean;
  stealth?: number | "all-stealth";
  maximum?: number;
  offset?: number;
  [k: string]: unknown;
}

export function toC(type: string, n: number = 1, args?: ToCArgs): CostData {
  const { additional, stealth, maximum, offset, ...rest } = args ?? {};
  const restEntries = Object.entries(rest).filter(([, v]) => v !== undefined);
  return {
    type,
    amount: n,
    additional: !!additional,
    stealth,
    maximum,
    offset,
    args: restEntries.length > 0 ? Object.fromEntries(restEntries) : undefined,
  };
}

/** Backwards-compatible thin wrappers around toC. */
export function createCreditCost(
  amount: number,
  additional: boolean,
  source: Card | null,
): CostData {
  return toC("credit", amount, { additional, source });
}
export function createClickCost(
  amount: number,
  additional: boolean,
  source: Card | null,
): CostData {
  return toC("click", amount, { additional, source });
}
export function createTagCost(
  amount: number,
  additional: boolean,
  source: Card | null,
): CostData {
  return toC("tag", amount, { additional, source });
}

// ---------------------------------------------------------------------------
// merge-costs
// ---------------------------------------------------------------------------

function mergeCostImpl(acc: CostData | null, cur: CostData): CostData {
  const accStealth = acc?.stealth;
  const curStealth = cur.stealth;

  let stealth: CostData["stealth"];
  if (accStealth === "all-stealth" || curStealth === "all-stealth") {
    stealth = "all-stealth";
  } else if (accStealth || curStealth) {
    stealth =
      (typeof accStealth === "number" ? accStealth : 0) +
      (typeof curStealth === "number" ? curStealth : 0);
  }

  const mergedArgs = { ...acc?.args, ...cur.args };

  return {
    type: cur.type,
    amount: (acc?.amount ?? 0) + (cur.amount ?? 0),
    additional: cur.additional,
    maximum: cur.maximum ?? acc?.maximum,
    offset: cur.offset ?? acc?.offset,
    stealth,
    args: Object.keys(mergedArgs).length > 0 ? mergedArgs : undefined,
  };
}

let xCounter = 0;
function groupCosts(costs: CostData[]): CostData[][] {
  const groups = new Map<string, CostData[]>();
  for (const cost of costs) {
    // Don't group :x-credits — each gets its own key
    const key = cost.type === "x-credits" ? `x-${++xCounter}` : cost.type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(cost);
  }
  return Array.from(groups.values());
}

const IMPL_RANK: Record<string, number> = {
  click: 1,
  "lose-click": 2,
  credit: 3,
  advancement: 4,
  power: 4,
  virus: 4,
  "trash-can": 5,
  "remove-from-game": 5,
};

const DISPLAY_RANK: Record<string, number> = {
  click: 1,
  "lose-click": 2,
  credit: 3,
  "trash-can": 4,
  "remove-from-game": 4,
};

function implCostRank(c: CostData): number {
  return IMPL_RANK[c.type] ?? 6;
}

function displayCostRank(c: CostData): number {
  return DISPLAY_RANK[c.type] ?? 5;
}

/**
 * Combines disparate costs into a single cost per type.
 * Mirrors: merge-costs in payment.clj
 */
export function mergeCosts(
  costs:
    | Array<CostData | CostData[] | null | undefined>
    | CostData
    | CostData[]
    | null
    | undefined,
  removeZeroCreditCost?: boolean,
): CostData[] {
  // Flatten one level and drop nulls (mirrors (filterv some? (flatten [costs])))
  const wrapped = Array.isArray(costs) ? costs : [costs];
  const flat: CostData[] = [];
  const flatten = (item: unknown): void => {
    if (item == null) return;
    if (Array.isArray(item)) {
      for (const x of item) flatten(x);
    } else {
      flat.push(item as CostData);
    }
  };
  for (const item of wrapped) flatten(item);

  // Separate into real and additional
  const real: CostData[] = [];
  const additional: CostData[] = [];
  for (const c of flat) {
    if (c.additional) additional.push(c);
    else real.push(c);
  }

  const realGroups = groupCosts(real);
  const additionalGroups = groupCosts(additional);

  const merged = [...realGroups, ...additionalGroups]
    .map((group: any) => group.reduce(mergeCostImpl, null as CostData | null))
    .filter((c): c is CostData => c != null)
    .filter((c: any) => {
      if (removeZeroCreditCost && c.type === "credit" && (c.amount ?? 0) === 0)
        return false;
      return true;
    });

  return merged.sort((a: any, b: any) => implCostRank(a) - implCostRank(b));
}

// ---------------------------------------------------------------------------
// can-pay?
// ---------------------------------------------------------------------------

function anyEffectStopsPay(
  state: GameState,
  side: string,
  cost: CostData,
): boolean {
  const kw = `cannot-pay-${cost.type}`;
  return anyEffects(state, side, kw, (v) => v === true, null, []);
}

function isCorpInstallSource(eid: EID | null): boolean {
  const t = (eid as any)?.sourceType ?? (eid as any)?.["source-type"];
  return t === "corp-install" || t === ":corp-install";
}

/**
 * Returns the merged costs if the player can pay them, otherwise null.
 * If `title` is non-empty, posts a toast on failure.
 * Mirrors: can-pay? in payment.clj
 */
export function canPay(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  title: string | null,
  ...args: Array<CostData | CostData[] | null | undefined>
): CostData[] | null {
  const removeZeroCreditCost = isCorpInstallSource(eid) && !isICE(card);
  const costs = mergeCosts(
    args.filter((c: any) => c != null),
    removeZeroCreditCost,
  );

  const ok = costs.every(
    (c) =>
      !anyEffectStopsPay(state, side, c) &&
      payable(c as any, state, side, eid, card),
  );

  if (ok) return costs;
  if (title) toast(state, side, `Unable to pay for ${title}.`);
  return null;
}

// ---------------------------------------------------------------------------
// cost-paid accessors
// ---------------------------------------------------------------------------

function costPaidEntry(eid: EID | null, costType: string): any {
  return (eid as any)?.["cost-paid"]?.[costType];
}

export function costTargets(eid: EID | null, costType: string): unknown[] {
  return costPaidEntry(eid, costType)?.["paid/targets"] ?? [];
}

export function costTarget(eid: EID | null, costType: string): unknown {
  return costTargets(eid, costType)[0];
}

export function costValue(eid: EID | null, costType: string): unknown {
  return costPaidEntry(eid, costType)?.["paid/value"];
}

export function xCostValue(eid: EID | null): number {
  return costPaidEntry(eid, "x-credits")?.["paid/x-value"] ?? 0;
}

// (the function `pay` lives in engine.ts, alongside resolveAbility)

// ---------------------------------------------------------------------------
// cost labels and messages
// ---------------------------------------------------------------------------

/** Gets the complete cost-label for the specified costs. */
export function buildCostLabel(
  costs: Array<CostData | CostData[] | null | undefined>,
): string | null {
  const parts = mergeCosts(costs)
    .slice()
    .sort((a: any, b: any) => displayCostRank(a) - displayCostRank(b))
    .map((c: any) => label(c as any));
  const cost = parts.join(", ");
  if (!cost.trim()) return null;
  return capitalize(cost);
}

interface AbilityWithCost extends Omit<Ability, "cost"> {
  cost?: CostData | CostData[] | null;
  "fake-cost"?: CostData | CostData[] | null;
  "cost-label"?: string;
}

/**
 * Returns a copy of the ability with a :cost-label assoc'd in.
 * Mirrors: add-cost-label-to-ability in payment.clj
 */
export function addCostLabelToAbility(
  ability: AbilityWithCost,
  costArg?: CostData | CostData[] | null,
): AbilityWithCost {
  const baseCost = costArg !== undefined ? costArg : (ability.cost ?? null);
  const fakeCost = ability["fake-cost"];
  const costs = fakeCost ? mergeCosts([baseCost, fakeCost]) : baseCost;
  return {
    ...ability,
    "cost-label":
      buildCostLabel(Array.isArray(costs) ? costs : [costs]) ?? undefined,
  } as AbilityWithCost;
}

/** Converts a cost (or first of a vec) to a printable string. */
export function costToString(cost: CostData | CostData[]): string | null {
  if (Array.isArray(cost)) {
    return cost.length > 0 ? costToString(cost[0]) : null;
  }
  if (!cost?.type) return null;
  if (value(cost as any) < 0) return null;
  const costType = cost.type;
  const costString = label(cost as any);
  if (costType === "click" || costType === "lose-click")
    return `spend ${costString}`;
  if (costType === "credit") return `pay ${costString}`;
  return costString;
}

/** Joins multiple costs into one human-readable phrase. */
export function buildCostString(
  costs: Array<CostData | CostData[] | null | undefined>,
): string | null {
  const parts = mergeCosts(costs)
    .map((c: any) => costToString(c))
    .filter((s): s is string => !!s);
  const result = parts.join(" and ");
  if (!result.trim()) return null;
  return capitalize(result);
}

/**
 * Constructs the spend message for the given cost-string and verb(s).
 * Mirrors: build-spend-msg in payment.clj
 */
export function buildSpendMsg(
  costStr: string | null | undefined,
  verb: string,
  verb2?: string,
): string {
  if (!costStr || !costStr.trim()) {
    return `${verb2 ?? `${verb}s`} `;
  }
  return `${costStr} to ${verb} `;
}

export { pay } from "./engine_1";
export { totalAvailableCredits } from "./costs_1";
