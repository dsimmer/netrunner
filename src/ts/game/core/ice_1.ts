// Ice mechanics: subroutines, strength, break abilities, pump, auto-pump.
// Mirrors: src/clj/game/core/ice.clj

import type { GameState, ServerZone, Encounter } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import type {
  Ability,
  Subroutine,
  ValueFn,
  ReqFn,
  CardDef,
  AbilityFn,
  NumberFn,
} from "./types.ts";
import { CORP_SIDE, RUNNER_SIDE } from "./state";
import { isICE, isInstalled, isRezzed, hasSubtype, getTitle } from "./card";
import { getCardDef } from "./types.ts";
import { breakSubAbilityCost, cardAbilityCost } from "./cost_fns";
import {
  makeEID,
  makeEIDFrom,
  effectCompleted,
  completeWithResult,
} from "./eid";
import {
  getEffects,
  sumEffects,
  anyEffects,
  isDisabledReg,
  registerLingeringEffect,
} from "./effects";
import {
  resolveAbility,
  triggerEventSimult,
  triggerEvent,
  abilityAsHandler,
} from "./engine";
import { canPay, mergeCosts, buildCostLabel, toC } from "./payment";
import { stealthValue } from "./costs";
import { systemMsg } from "./say";
import { update } from "./update";
import { req, effect, msg } from "../macros";
import { sameCard, pluralize, quantify, removeOnce } from "../utils";
import { makeLabel } from "../../jinteki/utils";
import { allActiveInstalled, allInstalled, cardToServer } from "./board";
import { getCard } from "./finding";

import { pump } from "./ice_2";

// ---------------------------------------------------------------------------
// Extended runtime subroutine type (mirrors Clojure build-sub output)
// ---------------------------------------------------------------------------

export interface RuntimeSubroutine extends Subroutine {
  subEffect?: Ability;
  fromCid?: string;
  variable?: boolean;
  source?: string | null;
  breakable?: boolean | ReqFn;
  position?: number;
  resolve?: boolean;
  externalTrigger?: boolean;
  breakerSubtypes?: string[];
}

// ---------------------------------------------------------------------------
// Run / encounter accessors
// ---------------------------------------------------------------------------

/**
 * Returns the ice installed on the server the runner is currently running.
 * Mirrors: get-run-ices
 */
export function getRunIces(state: GameState): Card[] | undefined {
  const run = state.run;
  if (!run) return undefined;
  const server = run.server;
  if (!server || server.length === 0) return undefined;
  // server is [serverName] e.g. ["hq"] or ["remote0"]
  const serverName = server[0];
  const zone = cardToServer(state, {
    zone: ["servers", serverName, "ices"],
  } as Card);
  return zone?.ices;
}

/**
 * Returns the current ice being encountered.
 * Mirrors: get-current-ice
 */
export function getCurrentIce(state: GameState): Card | null {
  const encounters = state.encounters;
  const topEncounter = encounters[encounters.length - 1] ?? null;
  const encounterIce = topEncounter?.ice ?? null;
  const resolved = encounterIce ? getCard(state, encounterIce) : null;
  if (resolved) return resolved;

  const run = state.run;
  const currentIceCid = (run as any)?.currentIce as string | undefined;
  if (currentIceCid) {
    // Try to find card by cid
    const all = allActiveInstalled(state, CORP_SIDE);
    return all.find((c) => c.cid === currentIceCid) ?? null;
  }
  return null;
}

/**
 * Returns the top encounter from the stack.
 * Mirrors: get-current-encounter
 */
export function getCurrentEncounter(state: GameState): Encounter | null {
  return state.encounters[state.encounters.length - 1] ?? null;
}

/**
 * Updates a key on the top encounter.
 * Mirrors: update-current-encounter
 */
export function updateCurrentEncounter(
  state: GameState,
  key: string,
  value: unknown,
): void {
  const encounter = getCurrentEncounter(state);
  if (!encounter) return;
  (encounter as any)[key] = value;
}

/**
 * Sets the current ice for the run.
 * Mirrors: set-current-ice
 */
export function setCurrentIce(state: GameState, card?: Card | null): void {
  if (!state.run) return;
  if (card) {
    const resolved = getCard(state, card);
    (state.run as any).currentIce = resolved ?? card;
  } else {
    const runIce = getRunIces(state);
    const pos = state.run.position;
    if (pos && pos > 0 && runIce && pos <= runIce.length) {
      const ice = runIce[pos - 1];
      if (ice) setCurrentIce(state, ice);
    }
  }
}

/**
 * Ice is active when installed and rezzed or is the current encounter.
 * Mirrors: active-ice?
 */
export function isActiveIce(state: GameState, ice?: Card | null): boolean {
  const targetIce = ice ?? getCurrentIce(state);
  if (!targetIce) return false;

  const encounter = getCurrentEncounter(state);
  const encounterIce = encounter?.ice ? getCard(state, encounter.ice) : null;

  if (isInstalled(targetIce)) {
    return isRezzed(targetIce);
  }
  return sameCard(targetIce, encounterIce);
}

// ---------------------------------------------------------------------------
// Subroutine building / manipulation
// ---------------------------------------------------------------------------

/**
 * Builds a runtime subroutine from a card-def subroutine.
 * Mirrors: build-sub
 */
export function buildSub(
  sub: Record<string, unknown>,
  cid: string,
  opts?: {
    front?: boolean;
    back?: boolean;
    printed?: boolean;
    variable?: boolean;
  },
): RuntimeSubroutine {
  const { front, back, printed, variable } = opts ?? {};
  return {
    label: makeLabel(sub as unknown as Ability),
    fromCid: cid,
    subEffect:
      (sub as any).subEffect ??
      (sub as any).effect ??
      (Object.assign({}, sub) as any),
    variable: variable ?? false,
    printed: printed ?? false,
    source: (sub as any).source ?? (printed ? "printed" : null),
    breakable:
      (sub as any).breakable !== undefined ? (sub as any).breakable : true,
  };
}

/**
 * Adds a subroutine to an ice card.
 * Mirrors: add-sub
 */
export function addSub(
  ice: Card,
  sub: Record<string, unknown>,
  cid?: string,
  opts?: {
    front?: boolean;
    back?: boolean;
    printed?: boolean;
    variable?: boolean;
  },
): Card {
  const targetCid = cid ?? ice.cid;
  const { front, back } = opts ?? {};
  const currentSubs = (ice.subroutines as RuntimeSubroutine[]) ?? [];
  const position = back ? 1 : front ? -1 : 0;
  const newSub: RuntimeSubroutine = {
    ...buildSub(sub, targetCid, opts),
    position,
  };
  const updated = [...currentSubs, newSub].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const indexed = updated.map((sub, idx) => ({ ...sub, index: idx }));
  return { ...ice, subroutines: indexed };
}

// ---------------------------------------------------------------------------
// Break subroutines
// ---------------------------------------------------------------------------

/**
 * Marks a given subroutine as broken.
 * Mirrors: break-subroutine
 */
export function breakSubroutine(
  ice: Card,
  sub: RuntimeSubroutine,
  breaker?: Card | null,
): Card {
  const replacementSub: RuntimeSubroutine = {
    ...sub,
    broken: true,
    ...(breaker
      ? { breakerCid: breaker.cid, breakerSubtypes: breaker.subtypes }
      : {}),
  };
  const subs = [...((ice.subroutines as RuntimeSubroutine[]) ?? [])];
  if (sub.index !== undefined) {
    subs[sub.index] = replacementSub;
  }
  return { ...ice, subroutines: subs };
}

/**
 * Marks a given subroutine as broken, updates state.
 * Mirrors: break-subroutine!
 */
export function breakSubroutineEx(
  state: GameState,
  ice: Card,
  sub: RuntimeSubroutine,
  breaker?: Card | null,
): void {
  const resolved = getCard(state, ice);
  if (!resolved) return;
  const updated = breakSubroutine(resolved, sub, breaker);
  (update as any)(state, CORP_SIDE, (_c: Card) => updated, updated);
}

/**
 * Breaks all subroutines on an ice.
 * Mirrors: break-all-subroutines
 */
export function breakAllSubroutines(ice: Card, breaker?: Card | null): Card {
  const subs = (ice.subroutines as RuntimeSubroutine[]) ?? [];
  let result = ice;
  for (const sub of subs) {
    result = breakSubroutine(result, sub, breaker);
  }
  return result;
}

/**
 * Breaks all subroutines, updates state.
 * Mirrors: break-all-subroutines!
 */
export function breakAllSubroutinesEx(
  state: GameState,
  ice: Card,
  breaker?: Card | null,
): void {
  const resolved = getCard(state, ice);
  if (!resolved) return;
  const updated = breakAllSubroutines(resolved, breaker);
  (update as any)(state, CORP_SIDE, (_c: Card) => updated, updated);
}

/**
 * Returns true if any subroutine is broken.
 * Mirrors: any-subs-broken?
 */
export function anySubsBroken(ice: Card | null): boolean {
  if (!ice) return false;
  const subs = (ice.subroutines as RuntimeSubroutine[]) ?? [];
  return subs.some((s) => s.broken);
}

/**
 * Returns true if all subroutines are broken.
 * Mirrors: all-subs-broken?
 */
export function allSubsBroken(ice: Card | null): boolean {
  if (!ice) return false;
  const subs = (ice.subroutines as RuntimeSubroutine[]) ?? [];
  return subs.length > 0 && subs.every((s) => s.broken);
}

/**
 * Returns true if any subroutine was broken by the given card.
 * Mirrors: any-subs-broken-by-card?
 */
export function anySubsBrokenByCard(ice: Card, card: Card): boolean {
  const subs = (ice.subroutines as RuntimeSubroutine[]) ?? [];
  return subs.some((s) => s.broken && s.breakerCid === card.cid);
}

/**
 * Returns true if all subroutines were broken by the given card.
 * Mirrors: all-subs-broken-by-card?
 */
export function allSubsBrokenByCard(ice: Card, card: Card): boolean {
  const subs = (ice.subroutines as RuntimeSubroutine[]) ?? [];
  return (
    subs.length > 0 && subs.every((s) => s.broken && s.breakerCid === card.cid)
  );
}

// ---------------------------------------------------------------------------
// Resolve / prevent subroutines
// ---------------------------------------------------------------------------

/**
 * Marks a subroutine as not resolving (e.g. Mass-Driver).
 * Mirrors: dont-resolve-subroutine
 */
export function dontResolveSubroutine(ice: Card, sub: RuntimeSubroutine): Card {
  const subs = [...((ice.subroutines as RuntimeSubroutine[]) ?? [])];
  if (sub.index !== undefined) {
    subs[sub.index] = { ...subs[sub.index], resolve: false };
  }
  return { ...ice, subroutines: subs };
}

/**
 * Marks a subroutine as not resolving, updates state.
 * Mirrors: dont-resolve-subroutine!
 */
export function dontResolveSubroutineEx(
  state: GameState,
  ice: Card,
  sub: RuntimeSubroutine,
): void {
  const resolved = getCard(state, ice);
  if (!resolved) return;
  const updated = dontResolveSubroutine(resolved, sub);
  (update as any)(state, CORP_SIDE, (_c: Card) => updated, updated);
}

/**
 * Marks all subroutines as not resolving.
 * Mirrors: dont-resolve-all-subroutines
 */
export function dontResolveAllSubroutines(ice: Card): Card {
  let result = ice;
  for (const sub of (ice.subroutines as RuntimeSubroutine[]) ?? []) {
    result = dontResolveSubroutine(result, sub);
  }
  return result;
}

/**
 * Marks all subroutines as not resolving, updates state.
 * Mirrors: dont-resolve-all-subroutines!
 */
export function dontResolveAllSubroutinesEx(state: GameState, ice: Card): void {
  const resolved = getCard(state, ice);
  if (!resolved) return;
  const updated = dontResolveAllSubroutines(resolved);
  (update as any)(state, CORP_SIDE, (_c: Card) => updated, updated);
}

/**
 * Resets all broken/fired subroutines to unbroken/unfired.
 * Mirrors: reset-all-subs
 */
export function resetAllSubs(ice: Card): Card {
  const subs = ((ice.subroutines as RuntimeSubroutine[]) ?? []).map((sub) => {
    const { broken, fired, resolve, ...rest } = sub;
    return rest as RuntimeSubroutine;
  });
  return { ...ice, subroutines: subs };
}

/**
 * Resets all broken subroutines, updates state.
 * Mirrors: reset-all-subs!
 */
export function resetAllSubsEx(state: GameState, ice: Card): void {
  const resolved = getCard(state, ice);
  if (!resolved) return;
  const updated = resetAllSubs(resolved);
  (update as any)(state, CORP_SIDE, (_c: Card) => updated, updated);
}

/**
 * Resets all installed ice.
 * Mirrors: reset-all-ice
 */
export function resetAllIce(state: GameState, _side: string): void {
  for (const ice of allInstalled(state, CORP_SIDE).filter(isICE)) {
    resetAllSubsEx(state, ice);
  }
}

// ---------------------------------------------------------------------------
// Choice helpers
// ---------------------------------------------------------------------------

/**
 * Returns unbroken subroutines for a choices prompt.
 * Mirrors: unbroken-subroutines-choice
 */
export function unbrokenSubroutinesChoice(ice: Card): string[] {
  const subs = (ice.subroutines as RuntimeSubroutine[]) ?? [];
  return subs
    .filter((s) => !s.broken && (s.resolve ?? true))
    .map((s) => makeLabel((s.subEffect as Ability) ?? ({} as Ability)));
}

/**
 * Returns breakable subroutines for a choices prompt.
 * Mirrors: breakable-subroutines-choice
 */
export function breakableSubroutinesChoice(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  ice: Card,
): string[] | null {
  if (
    anyEffects(
      state,
      side,
      "cannot-break-subs-on-ice",
      (v) => v === true,
      ice,
      [],
    )
  ) {
    return null;
  }
  const subs = (ice.subroutines as RuntimeSubroutine[]) ?? [];
  return subs
    .filter((s) => {
      if (s.broken) return false;
      const breakable = s.breakable;
      if (typeof breakable === "function") {
        return (
          isDisabledReg(state, ice) || breakable(state, side, eid, ice, [card])
        );
      }
      return breakable ?? true;
    })
    .map((s) => makeLabel((s.subEffect as Ability) ?? ({} as Ability)));
}

// ---------------------------------------------------------------------------
// Resolve subroutine
// ---------------------------------------------------------------------------

/**
 * Marks a subroutine as fired.
 * Mirrors: resolve-subroutine (data transform)
 */
export function resolveSubroutine(ice: Card, sub: RuntimeSubroutine): Card {
  return resolveSubroutineData(ice, sub);
}

function resolveSubroutineData(ice: Card, sub: RuntimeSubroutine): Card {
  const subs = [...((ice.subroutines as RuntimeSubroutine[]) ?? [])];
  if (sub.index !== undefined) {
    subs[sub.index] = { ...subs[sub.index], fired: true };
  }
  return { ...ice, subroutines: subs };
}

/**
 * Resolves a subroutine: triggers pre-resolve event, fires the sub effect.
 * Mirrors: resolve-subroutine!
 */
export function resolveSubroutineEx(
  state: GameState,
  side: string,
  eid: EID,
  ice: Card,
  sub: RuntimeSubroutine,
): void {
  // Mark as resolved (for cards like Marcus Batty)
  if (!sub.externalTrigger) {
    const resolved = getCard(state, ice);
    if (resolved) {
      (update as any)(
        state,
        CORP_SIDE,
        (c: Card) => resolveSubroutineData(c, sub),
        resolved,
      );
    }
  }

  // Check for replacement / prevention from encounter
  const encounter = getCurrentEncounter(state);
  const replacement = (encounter as any)?.replaceSubroutine as
    | RuntimeSubroutine
    | undefined;
  const prevent = (encounter as any)?.preventSubroutine as boolean | undefined;

  if (encounter) {
    (encounter as any).replaceSubroutine = null;
    (encounter as any).preventSubroutine = null;
  }

  const finalSub = replacement ? { ...replacement, index: sub.index } : sub;

  if (prevent) {
    // Checkpoint - subroutine prevented
    return;
  }

  // Fire the subroutine
  if (state.run) {
    (state.run as any).subroutinesFired =
      ((state.run as any).subroutinesFired ?? 0) + 1;
  }

  const resolvedIce = getCard(state, ice) ?? ice;
  resolveAbility(
    state,
    side,
    (finalSub.subEffect as Ability) ?? ({} as Ability),
    resolvedIce,
    [],
  );
}

// ---------------------------------------------------------------------------
// Resolve unbroken subroutines (auto-resolution during encounter)
// ---------------------------------------------------------------------------

/**
 * Recursively resolves the next unbroken subroutine.
 * Mirrors: resolve-next-unbroken-sub
 */
function resolveNextUnbrokenSub(
  state: GameState,
  side: string,
  eid: EID,
  ice: Card,
  subroutines: RuntimeSubroutine[],
  msgs: RuntimeSubroutine[],
): void {
  if (
    subroutines.length === 0 ||
    !state.run ||
    !state.encounters[state.encounters.length - 1] ||
    !isActiveIce(state, ice) ||
    (state as any).endRun?.ended
  ) {
    completeWithResult(state, side, eid, msgs.reverse());
    return;
  }

  const sub = subroutines[0];
  resolveSubroutineEx(state, side, makeEID(state), ice, sub);
  // In a real async implementation this would chain via callbacks.
  // For now we process synchronously.
  const refreshedIce = getCard(state, ice) ?? ice;
  resolveNextUnbrokenSub(state, side, eid, refreshedIce, subroutines.slice(1), [
    ...msgs,
    sub,
  ]);
}

/**
 * Resolves all unbroken subroutines that haven't been manually resolved.
 * Mirrors: resolve-unbroken-subs!
 * NOTE: Do not resolve subroutines that players have already manually resolved.
 * This has led to game loses - do not change this.
 */
export function resolveUnbrokenSubsEx(
  state: GameState,
  side: string,
  ice: Card,
): void {
  const subs = ((ice.subroutines as RuntimeSubroutine[]) ?? []).filter(
    (s) => !s.broken && !s.fired && s.resolve !== false,
  );

  if (subs.length === 0) {
    const eid = makeEID(state);
    effectCompleted(state, side, eid);
    return;
  }

  const eid = makeEID(state);
  resolveNextUnbrokenSub(state, side, eid, ice, subs, []);

  const subLabels = subs
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((s) => s.label ?? "")
    .join('" and "[subroutine] ');
  systemMsg(
    state,
    CORP_SIDE,
    "resolves " +
      quantify(subs.length, "unbroken subroutine") +
      " on " +
      getTitle(ice) +
      '("[subroutine] ' +
      subLabels +
      '")',
  );

  effectCompleted(state, side, eid);
}

// ---------------------------------------------------------------------------
// Ice strength
// ---------------------------------------------------------------------------

/**
 * Gets the base strength of an ice or icebreaker.
 * Mirrors: get-strength
 */
export function getStrength(card: Card | null): number {
  if (!card) return 0;
  if (!isICE(card) && !hasSubtype(card, "Icebreaker")) return 0;
  return card.currentStrength ?? card.strength ?? 0;
}

/**
 * Gets the pump amount from an ability.
 * Mirrors: get-pump-strength
 */
export function getPumpStrength(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card,
  targets?: Card[],
): number {
  const base = (ability as any).pump ?? 0;
  const pumpFn = (ability as any).pumpBonus as
    | ((s: GameState, sid: string, eid: EID, c: Card, t: Card[]) => number)
    | undefined;
  const bonus = pumpFn
    ? pumpFn(state, side, makeEID(state), card, targets ?? [])
    : 0;
  return base + bonus;
}

/**
 * Creates an ice strength bonus static ability.
 * Mirrors: ice-strength-bonus
 */
export function iceStrengthBonus(
  reqFnOrBonus: ReqFn | number | ValueFn,
  bonus?: number | ValueFn,
): Ability {
  // Single-arg form: the lone arg is a function that returns the bonus value
  // (and the req is just "is this the ice being evaluated").
  const isSingleArg = bonus === undefined;
  const effectiveReq: ReqFn = isSingleArg
    ? (() => true) as ReqFn
    : (reqFnOrBonus as ReqFn);
  const effectiveBonus: number | ValueFn = isSingleArg
    ? (reqFnOrBonus as number | ValueFn)
    : (bonus as number | ValueFn);
  return {
    type: "ice-strength" as any,
    req: req(
      (state, side, eid, card, targets) =>
        sameCard(card, (targets as Card[])[0]) &&
        effectiveReq(state, side, eid, card, targets),
    ),
    value: typeof effectiveBonus === "function" ? effectiveBonus : () => effectiveBonus,
  } as unknown as Ability;
}

/**
 * Sums ice strength effects from effects system.
 * Mirrors: sum-ice-strength-effects
 */
export function sumIceStrengthEffects(
  state: GameState,
  side: string,
  ice: Card,
): number {
  const canLower = !anyEffects(
    state,
    side,
    "cannot-lower-strength",
    (v) => v === true,
    ice,
    [],
  );
  const effects = getEffects(state, side, "ice-strength", ice, []);
  return effects.reduce((sum: number, v: unknown) => {
    if (typeof v === "number") {
      if (canLower || v > 0) return sum + v;
    }
    return sum;
  }, 0);
}

/**
 * Gets the modified strength of the given ice.
 * Mirrors: ice-strength
 */
export function iceStrength(
  state: GameState,
  side: string,
  ice: Card,
): number | null {
  if (!isICE(ice)) return null;
  const cdef = getCardDef(ice);
  const strengthBonusFn = cdef.strengthBonus as ((...a: any[]) => number) | undefined;
  const strengthBonus = strengthBonusFn
    ? strengthBonusFn(state, side, null, ice, [])
    : 0;
  const effectsBonus = sumIceStrengthEffects(state, side, ice);
  return (ice.strength ?? 0) + strengthBonus + effectsBonus;
}

/**
 * Updates the given ice's strength by triggering events and updating the card.
 * Mirrors: update-ice-strength
 */
export function updateIceStrength(
  state: GameState,
  side: string,
  ice: Card | null,
): boolean {
  if (!ice) return false;
  const resolved = getCard(state, ice);
  if (!resolved) return false;
  const oldStrength = getStrength(resolved);
  const newStrength = iceStrength(state, side, resolved);
  if (newStrength === null) return false;
  const changed = oldStrength !== newStrength;

  if (isActiveIce(state, resolved)) {
    const updated = { ...resolved, currentStrength: newStrength };
    (update as any)(state, side, (_c: Card) => updated, updated);
    triggerEvent(state, side, "ice-strength-changed", {
      card: getCard(state, resolved),
      strength: newStrength,
      oldStrength,
    });
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Subroutine reconciliation
// ---------------------------------------------------------------------------

const RELEVANT_SUB_KEYS = ["source", "label"];

/**
 * Reconciles new expected subroutines with old active subroutines,
 * preserving broken/fired status.
 * Mirrors: reconcile-subroutines
 */
export function reconcileSubroutines(
  newSubs: RuntimeSubroutine[],
  oldSubs: RuntimeSubroutine[],
): RuntimeSubroutine[] {
  function sameSub(a: RuntimeSubroutine, b: RuntimeSubroutine): boolean {
    return (
      (a.label ?? "") === (b.label ?? "") &&
      (a.source ?? null) === (b.source ?? null)
    );
  }

  function preserveStatus(
    newSub: RuntimeSubroutine,
    oldSub: RuntimeSubroutine,
  ): RuntimeSubroutine {
    return {
      ...newSub,
      ...(oldSub.broken !== undefined ? { broken: oldSub.broken } : {}),
      ...(oldSub.fired !== undefined ? { fired: oldSub.fired } : {}),
    };
  }

  const remainingOld = [...oldSubs];
  const result: RuntimeSubroutine[] = [];
  const toAdd = [...newSubs];

  while (remainingOld.length > 0 && toAdd.length > 0) {
    const newSub = toAdd[0];
    const matchIdx = remainingOld.findIndex((oldSub) =>
      sameSub(newSub, oldSub),
    );

    if (matchIdx >= 0) {
      const matched = remainingOld[matchIdx];
      result.push(preserveStatus(newSub, matched));
      remainingOld.splice(matchIdx, 1);
      toAdd.shift();
    } else {
      result.push(newSub);
      toAdd.shift();
    }
  }

  return [...result, ...toAdd];
}
