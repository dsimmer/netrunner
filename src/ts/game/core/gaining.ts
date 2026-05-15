// Credit/click/resource gain and lose functions.
// Mirrors: src/clj/game/core/gaining.clj + src/go/game/core/gaining.go

import type { GameState } from "./state.js";
import type { Card } from "./card.js";
import type { EID } from "./eid.js";
import { CORP_SIDE, RUNNER_SIDE } from "./state.js";
import { systemMsg } from "./say.js";
// Engine functions are imported lazily to avoid circular deps
import { queueEvent } from "./engine.js";
import { checkpoint } from "./checkpoint.js";
import { effectCompleted } from "./eid.js";

// ---------------------------------------------------------------------------
// Types for gain/deduct amounts
// ---------------------------------------------------------------------------

/** Amount specifier: a plain number or a sub-attr map (e.g. { base: n }). */
export type GainAmount = number | { base?: number; mod?: number; used?: number };

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
export function gain(
  state: GameState,
  side: string,
  resource: string,
  amount: GainAmount,
): void {
  // Handle map-style amounts: iterate sub-attrs
  if (typeof amount === "object" && amount !== null) {
    for (const [subattr, val] of Object.entries(amount)) {
      if (typeof val !== "number") continue;
      gainSubAttr(state, side, resource, subattr, val);
    }
    return;
  }

  // Numeric amounts — default subattr for tag / bad-publicity is "base"
  const subattr = (resource === "tag" || resource === "bad-publicity") ? "base" : "";
  if (subattr) {
    gainSubAttr(state, side, resource, subattr, amount as number);
    return;
  }

  // Flat numeric gain
  if (side === CORP_SIDE) {
    const c = state.corp;
    switch (resource) {
      case "credit": c.credit += amount; break;
      case "click": c.click += amount; break;
      case "agenda-point": c.agendaPoint += amount; break;
      case "click-per-turn": c.clickPerTurn += amount; break;
    }
  } else {
    const r = state.runner;
    switch (resource) {
      case "credit": r.credit += amount; break;
      case "click": r.click += amount; break;
      case "link": r.link += amount; break;
      case "agenda-point": r.agendaPoint += amount; break;
      case "click-per-turn": r.clickPerTurn += amount; break;
      case "brain-damage":
        r.brainDamage += amount;
        r.handSize.total -= amount;
        break;
    }
  }
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
        (c.badPublicity as Record<string, number>)[subattr] = ((c.badPublicity as Record<string, number>)[subattr] ?? 0) + val;
        break;
      case "hand-size":
        (c.handSize as Record<string, number>)[subattr] = ((c.handSize as Record<string, number>)[subattr] ?? 0) + val;
        break;
    }
  } else {
    const r = state.runner;
    switch (resource) {
      case "tag":
        (r.tag as Record<string, number>)[subattr] = ((r.tag as Record<string, number>)[subattr] ?? 0) + val;
        break;
      case "memory":
        (r.memory as Record<string, number>)[subattr] = ((r.memory as Record<string, number>)[subattr] ?? 0) + val;
        break;
      case "hand-size":
        (r.handSize as Record<string, number>)[subattr] = ((r.handSize as Record<string, number>)[subattr] ?? 0) + val;
        break;
    }
  }
}

/**
 * Reduces a resource (clamped at 0 for credits/clicks/link).
 * Mirrors: lose in gaining.clj
 */
export function lose(
  state: GameState,
  side: string,
  resource: string,
  amount: number,
): void {
  if (side === CORP_SIDE) {
    const c = state.corp;
    switch (resource) {
      case "credit": c.credit = Math.max(0, c.credit - amount); break;
      case "click": c.click = Math.max(0, c.click - amount); break;
      case "bad-publicity": c.badPublicity.base = Math.max(0, c.badPublicity.base - amount); break;
      case "hand-size":
        c.handSize.total -= amount;
        c.handSize.base -= amount;
        break;
    }
  } else {
    const r = state.runner;
    switch (resource) {
      case "credit": r.credit = Math.max(0, r.credit - amount); break;
      case "click": r.click = Math.max(0, r.click - amount); break;
      case "link": r.link = Math.max(0, r.link - amount); break;
      case "hand-size":
        r.handSize.total -= amount;
        r.handSize.base -= amount;
        break;
    }
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
  resource: string,
  amount: GainAmount,
): void {
  // Map-style: iterate sub-attrs
  if (typeof amount === "object" && amount !== null) {
    for (const [subattr, val] of Object.entries(amount)) {
      if (typeof val !== "number") continue;
      deductSubAttr(state, side, resource, subattr, val);
    }
    return;
  }

  // Numeric: default subattr for tag / bad-publicity is "base"
  const subattr = (resource === "tag" || resource === "bad-publicity") ? "base" : "";
  if (subattr) {
    deductSubAttr(state, side, resource, subattr, amount as number);
    return;
  }

  // Flat numeric deduct
  if (side === CORP_SIDE) {
    const c = state.corp;
    switch (resource) {
      case "credit": c.credit = Math.max(0, c.credit - amount); break;
      case "click": c.click = Math.max(0, c.click - amount); break;
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
      case "click": r.click = Math.max(0, r.click - amount); break;
      case "link": r.link = Math.max(0, r.link - amount); break;
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
  const fn = (current: number) => isSigned ? current - val : Math.max(0, current - val);

  if (side === CORP_SIDE) {
    const c = state.corp;
    switch (resource) {
      case "bad-publicity": {
        const obj = c.badPublicity as Record<string, number>;
        obj[subattr] = fn(obj[subattr] ?? 0);
        break;
      }
    }
  } else {
    const r = state.runner;
    switch (resource) {
      case "tag": {
        const obj = r.tag as Record<string, number>;
        obj[subattr] = fn(obj[subattr] ?? 0);
        break;
      }
      case "memory": {
        const obj = r.memory as Record<string, number>;
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
  eid: EID,
  amount: number,
  card: Card | null,
): void {
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
export function loseCredits(
  state: GameState,
  side: string,
  eid: EID,
  amount: number,
  card: Card | null,
): void {
  if (amount <= 0) {
    effectCompleted(state, side, eid);
    return;
  }
  lose(state, side, "credit", amount);
  queueEvent(state, "credit-lost", { card, amount, side });
  checkpoint(state, side, eid);
}

/** Gives clicks to the given side. */
export function gainClicks(state: GameState, side: string, amount: number): void {
  gain(state, side, "click", amount);
}

/** Removes clicks (clamped at 0). */
export function loseClicks(state: GameState, side: string, amount: number): void {
  lose(state, side, "click", amount);
}

/** Returns the current credit total for the given side. */
export function getCredits(state: GameState, side: string): number {
  return side === CORP_SIDE ? state.corp.credit : state.runner.credit;
}

/** Returns the current click total for the given side. */
export function getClicks(state: GameState, side: string): number {
  return side === CORP_SIDE ? state.corp.click : state.runner.click;
}
