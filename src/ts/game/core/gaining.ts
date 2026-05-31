// Credit/click/resource gain and lose functions.
// Mirrors: src/clj/game/core/gaining.clj + src/go/game/core/gaining.go

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import { CORP_SIDE, RUNNER_SIDE } from "./state";
import { systemMsg } from "./say";
// Engine functions are imported lazily to avoid circular deps
import { queueEvent } from "./engine";
import { checkpoint } from "./checkpoint";
import { effectCompleted } from "./eid";

// ---------------------------------------------------------------------------
// Types for gain/deduct amounts
// ---------------------------------------------------------------------------

/** Amount specifier: a plain number or a sub-attr map (e.g. { base: n }). */
export type GainAmount =
  | number
  | { base?: number; mod?: number; used?: number };

/**
 * Returns an updater that safely increments a nullable value by n.
 * Mirrors: safe-inc-n.
 */
export function safeIncN(n: number): (value: number | null | undefined) => number {
  return (value: number | null | undefined) => (value ?? 0) + n;
}

/**
 * Returns an updater that subtracts n, clamped at 0.
 * Mirrors: sub->0.
 */
export function subTo0(n: number): (value: number | null | undefined) => number {
  return (value: number | null | undefined) => Math.max(0, (value ?? 0) - n);
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

/**
 * Bumps a nested stat counter at state.stats[side][...path] by delta.
 * Creates intermediate objects as needed.
 */
function bumpStat(
  state: GameState,
  side: string,
  path: string[],
  delta: number,
): void {
  const root = state.stats ?? (state.stats = {});
  type Node = Record<string, unknown>;
  let cur: Node = (root[side] as Node | undefined) ?? {};
  root[side] = cur;
  for (let i = 0; i < path.length - 1; i++) {
    const step = path[i];
    const next: Node = (cur[step] as Node | undefined) ?? {};
    cur[step] = next;
    cur = next;
  }
  const last = path[path.length - 1];
  cur[last] = ((cur[last] as number | undefined) ?? 0) + delta;
}

/** Get current value of a resource for the given side. */
function getResourceValue(state: GameState, side: string, resource: string): number {
  const player = side === CORP_SIDE ? state.corp : state.runner;
  const rec = player as unknown as Record<string, number | undefined>;
  return rec[resource] ?? 0;
}

// ---------------------------------------------------------------------------
// gain / lose / deduct (flat mutations)
// ---------------------------------------------------------------------------

/**
 * Applies a resource gain to a player side.
 * Mirrors: gain in gaining.clj
 *
 * When `amount` is a number the flat value is added.
 * When `amount` is a map the individual sub-attrs are added.
 */
export function gain(...args: unknown[]): void;
export function gain(state: GameState, side: string, resource: string, amount: GainAmount): void;
export function gain(
  stateArg: unknown,
  sideArg?: unknown,
  resourceArg?: unknown,
  amountArg?: unknown,
): void {
  if (!stateArg || typeof stateArg !== "object" || !("corp" in (stateArg as object))) return;
  const state = stateArg as GameState;
  const side = sideArg as string;
  const resource = resourceArg as string;
  const amount = amountArg as GainAmount | undefined;
  if (amount === undefined) return;
  // Handle map-style amounts: iterate sub-attrs
  if (typeof amount === "object" && amount !== null) {
    for (const [subattr, val] of Object.entries(amount)) {
      if (typeof val !== "number") continue;
      gainSubAttr(state, side, resource, subattr, val);
    }
    return;
  }

  // Numeric amounts — default subattr for tag / bad-publicity is "base"
  const subattr =
    resource === "tag" || resource === "bad-publicity" ? "base" : "";
  if (subattr) {
    gainSubAttr(state, side, resource, subattr, amount as number);
    return;
  }

  // Flat numeric gain
  if (side === CORP_SIDE) {
    const c = state.corp;
    switch (resource) {
      case "credit":
        c.credit += amount;
        break;
      case "click":
        c.click += amount;
        break;
      case "agenda-point":
        c.agendaPoint += amount;
        break;
      case "click-per-turn":
        c.clickPerTurn += amount;
        break;
    }
  } else {
    const r = state.runner;
    switch (resource) {
      case "credit":
        r.credit += amount;
        break;
      case "click":
        r.click += amount;
        break;
      case "link":
        r.link += amount;
        break;
      case "agenda-point":
        r.agendaPoint += amount;
        break;
      case "click-per-turn":
        r.clickPerTurn += amount;
        break;
      case "brain-damage":
        r.brainDamage += amount;
        r.handSize.total -= amount;
        break;
    }
  }

  // Track stats: [:stats side :gain resource]
  bumpStat(state, side, ["gain", resource], amount as number);
}

function gainSubAttr(
  state: GameState,
  side: string,
  resource: string,
  subattr: string,
  val: number,
): void {
  if (side === CORP_SIDE) {
    const c = state.corp;
    switch (resource) {
      case "bad-publicity":
        (c.badPublicity as unknown as Record<string, number>)[subattr] =
          ((c.badPublicity as unknown as Record<string, number>)[subattr] ?? 0) + val;
        break;
      case "hand-size":
        (c.handSize as unknown as Record<string, number>)[subattr] =
          ((c.handSize as unknown as Record<string, number>)[subattr] ?? 0) + val;
        break;
    }
  } else {
    const r = state.runner;
    switch (resource) {
      case "tag":
        (r.tag as unknown as Record<string, number>)[subattr] =
          ((r.tag as unknown as Record<string, number>)[subattr] ?? 0) + val;
        break;
      case "memory":
        (r.memory as unknown as Record<string, number>)[subattr] =
          ((r.memory as unknown as Record<string, number>)[subattr] ?? 0) + val;
        break;
      case "hand-size":
        (r.handSize as unknown as Record<string, number>)[subattr] =
          ((r.handSize as unknown as Record<string, number>)[subattr] ?? 0) + val;
        break;
    }
  }

  // Track stats: [:stats side :gain resource subattr]
  bumpStat(state, side, ["gain", resource, subattr], val);
}

/**
 * Reduces a resource (clamped at 0 for credits/clicks/link).
 * Mirrors: lose in gaining.clj
 * 
 * When `amount` is the string "all", loses the entire current value of the resource.
 */
export function lose(...args: unknown[]): void;
export function lose(state: GameState, side: string, resource: string, amount: number | "all"): void;
export function lose(
  stateArg: unknown,
  sideArg?: unknown,
  resourceArg?: unknown,
  amountArg?: unknown,
): void {
  if (!stateArg || typeof stateArg !== "object" || !("corp" in (stateArg as object))) return;
  const state = stateArg as GameState;
  const side = sideArg as string;
  const resource = resourceArg as string;
  const amount = amountArg as number | "all" | undefined;
  if (amount === undefined) return;
  const loseAmount: number =
    amount === "all" ? getResourceValue(state, side, resource) : amount;

  if (side === CORP_SIDE) {
    const c = state.corp;
    switch (resource) {
      case "credit":
        c.credit = Math.max(0, c.credit - loseAmount);
        break;
      case "click":
        c.click = Math.max(0, c.click - loseAmount);
        break;
      case "bad-publicity":
        c.badPublicity.base = Math.max(0, c.badPublicity.base - loseAmount);
        break;
      case "hand-size":
        c.handSize.total -= loseAmount;
        c.handSize.base -= loseAmount;
        break;
    }
  } else {
    const r = state.runner;
    switch (resource) {
      case "credit":
        r.credit = Math.max(0, r.credit - loseAmount);
        break;
      case "click":
        r.click = Math.max(0, r.click - loseAmount);
        break;
      case "link":
        r.link = Math.max(0, r.link - loseAmount);
        break;
      case "hand-size":
        r.handSize.total -= loseAmount;
        r.handSize.base -= loseAmount;
        break;
    }
  }

  // Track stats: [:stats side :lose resource]
  if (typeof amount === "number") {
    bumpStat(state, side, ["lose", resource], amount);
  }
}

/**
 * Deduct a value from the player's attribute.
 * Mirrors: deduct in gaining.clj
 *
 * Supports both flat numbers and map-style amounts with sub-attrs.
 * Sub-attr "mod" and "used" are subtracted (may go negative);
 * all others are clamped to a minimum of 0.
 */
export function deduct(
  state: GameState,
  side: string,
  resourceOrPair: string | [string, GainAmount],
  amount?: GainAmount,
): void {
  // Allow deduct(state, side, [resource, amount]) variant
  let resource: string;
  if (Array.isArray(resourceOrPair)) {
    resource = resourceOrPair[0];
    amount = resourceOrPair[1];
  } else {
    resource = resourceOrPair;
  }
  if (amount === undefined) return;
  // Map-style: iterate sub-attrs
  if (typeof amount === "object" && amount !== null) {
    for (const [subattr, val] of Object.entries(amount)) {
      if (typeof val !== "number") continue;
      deductSubAttr(state, side, resource, subattr, val);
    }
    return;
  }

  // Numeric: default subattr for tag / bad-publicity is "base"
  const subattr =
    resource === "tag" || resource === "bad-publicity" ? "base" : "";
  if (subattr) {
    deductSubAttr(state, side, resource, subattr, amount as number);
    return;
  }

  // Flat numeric deduct
  if (side === CORP_SIDE) {
    const c = state.corp;
    switch (resource) {
      case "credit":
        c.credit = Math.max(0, c.credit - amount);
        break;
      case "click":
        c.click = Math.max(0, c.click - amount);
        break;
    }
  } else {
    const r = state.runner;
    switch (resource) {
      case "credit":
        r.credit = Math.max(0, r.credit - amount);
        if (r.runCredit > 0) {
          r.runCredit = Math.max(0, r.runCredit - amount);
        }
        break;
      case "click":
        r.click = Math.max(0, r.click - amount);
        break;
      case "link":
        r.link = Math.max(0, r.link - amount);
        break;
    }
  }
}

function deductSubAttr(
  state: GameState,
  side: string,
  resource: string,
  subattr: string,
  val: number,
): void {
  const isSigned = subattr === "mod" || subattr === "used";
  const fn = (current: number) =>
    isSigned ? current - val : Math.max(0, current - val);

  if (side === CORP_SIDE) {
    const c = state.corp;
    switch (resource) {
      case "bad-publicity": {
        const obj = c.badPublicity as unknown as Record<string, number>;
        obj[subattr] = fn(obj[subattr] ?? 0);
        break;
      }
    }
  } else {
    const r = state.runner;
    switch (resource) {
      case "tag": {
        const obj = r.tag as unknown as Record<string, number>;
        obj[subattr] = fn(obj[subattr] ?? 0);
        break;
      }
      case "memory": {
        const obj = r.memory as unknown as Record<string, number>;
        obj[subattr] = fn(obj[subattr] ?? 0);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Event-driven variants
// ---------------------------------------------------------------------------

/**
 * Gives credits to the given side and queues a :credit-gained event.
 * Mirrors: gain-credits in gaining.clj
 */
export function gainCredits(
  state: GameState,
  side: string,
  amount: number,
  card?: Card | Record<string, unknown> | null,
): void;
export function gainCredits(
  state: GameState,
  side: string,
  eid: EID,
  amount: number,
  card?: Card | Record<string, unknown> | null,
): void;
export function gainCredits(...args: unknown[]): void;
export function gainCredits(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: unknown,
  arg4?: unknown,
  arg5?: unknown,
): void {
  // Detect (side, eid, amount) legacy shape — no state available, no-op.
  if (typeof arg1 === "string") return;
  if (!arg1 || typeof arg1 !== "object" || !("corp" in (arg1 as object))) return;
  const state = arg1 as GameState;
  const side = (arg2 as string) ?? "corp";
  let eid: EID;
  let amount: number;
  let card: Card | null = null;
  if (arg3 && typeof arg3 === "object" && "id" in arg3) {
    eid = arg3 as EID;
    amount = arg4 as number;
    if (arg5 && typeof arg5 === "object" && "cid" in arg5) card = arg5 as Card;
  } else {
    amount = (arg3 as number) ?? 0;
    eid = { id: 0, source: null } as unknown as EID;
    if (arg4 && typeof arg4 === "object" && "cid" in arg4) card = arg4 as Card;
  }
  if (amount <= 0) {
    effectCompleted(state, side, eid);
    return;
  }
  gain(state, side, "credit", amount);
  queueEvent(state, "credit-gained", { card, amount, side });
  systemMsg(state, side, `gains ${amount} [credit]`);
  checkpoint(state, side, eid);
}

/**
 * Removes credits and queues a :credit-lost event.
 * Mirrors: lose-credits in gaining.clj
 */
export function loseCredits(state: GameState, side: string, amount: number, card?: Card | Record<string, unknown> | null): void;
export function loseCredits(state: GameState, side: string, eid: EID, amount: number | "all" | ":all", card?: Card | Record<string, unknown> | null): void;
export function loseCredits(...args: unknown[]): void;
export function loseCredits(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: unknown,
  arg4?: unknown,
  arg5?: unknown,
): void {
  if (typeof arg1 === "string") return;
  if (!arg1 || typeof arg1 !== "object" || !("corp" in (arg1 as object))) return;
  const state = arg1 as GameState;
  const side = (arg2 as string) ?? "corp";
  let eid: EID;
  let amount: number;
  let card: Card | null = null;
  if (arg3 && typeof arg3 === "object" && "id" in arg3) {
    eid = arg3 as EID;
    amount = arg4 as number;
    if (arg5 && typeof arg5 === "object" && "cid" in arg5) card = arg5 as Card;
  } else {
    amount = (arg3 as number) ?? 0;
    eid = { id: 0, source: null } as unknown as EID;
    if (arg4 && typeof arg4 === "object" && "cid" in arg4) card = arg4 as Card;
  }
  // Normalise legacy ":all" string keyword to numeric all-of-credit
  if ((amount as unknown as string) === "all" || (amount as unknown as string) === ":all") {
    amount = state.corp.credit;
    if (side !== CORP_SIDE) amount = state.runner.credit;
  }
  if (amount <= 0) {
    effectCompleted(state, side, eid);
    return;
  }
  lose(state, side, "credit", amount);
  queueEvent(state, "credit-lost", { card, amount, side });
  checkpoint(state, side, eid);
}

/** Gives clicks to the given side. */
export function gainClicks(state: unknown, side?: unknown, amount?: unknown): void;
export function gainClicks(
  state: GameState,
  side: string,
  amount: number,
): void;
export function gainClicks(
  stateArg?: unknown,
  sideArg?: unknown,
  amountArg?: unknown,
): void {
  if (!stateArg || typeof stateArg !== "object") return;
  gain(stateArg as GameState, sideArg as string, "click", amountArg as number);
}

/** Removes clicks (clamped at 0). */
export function loseClicks(state: unknown, side?: unknown, amount?: unknown): void;
export function loseClicks(
  state: GameState,
  side: string,
  amount: number,
): void;
export function loseClicks(
  stateArg?: unknown,
  sideArg?: unknown,
  amountArg?: unknown,
): void {
  if (!stateArg || typeof stateArg !== "object") return;
  lose(stateArg as GameState, sideArg as string, "click", amountArg as number);
}

/** Returns the current credit total for the given side. */
export function getCredits(state: GameState, side: string): number {
  return side === CORP_SIDE ? state.corp.credit : state.runner.credit;
}

/** Returns the current click total for the given side. */
export function getClicks(state: GameState, side: string): number {
  return side === CORP_SIDE ? state.corp.click : state.runner.click;
}

/**
 * Returns the value of properties using the `base` and `mod` system.
 * Mirrors: base-mod-size in gaining.clj
 */
export function baseModSize(
  state: GameState,
  side: string,
  prop: string,
): number {
  const player = side === CORP_SIDE ? state.corp : state.runner;
  const obj = (player as unknown as Record<string, { base?: number; mod?: number } | undefined>)[prop];
  if (obj && typeof obj === "object") {
    return (obj.base ?? 0) + (obj.mod ?? 0);
  }
  return 0;
}
