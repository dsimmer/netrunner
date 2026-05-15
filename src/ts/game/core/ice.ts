// Ice mechanics: subroutines, strength, break abilities, pump, auto-pump.
// Mirrors: src/clj/game/core/ice.clj

import type { GameState, ServerZone, Encounter } from "./state.js";
import type { Card, Zone } from "./card.js";
import type { EID } from "./eid.js";
import type { Ability, Subroutine, ValueFn, ReqFn, CardDef, AbilityFn, NumberFn } from "./types.js";
import { CORP_SIDE, RUNNER_SIDE } from "./state.js";
import {
  isICE, isInstalled, isRezzed, hasSubtype, getTitle,
} from "./card.js";
import { getCardDef } from "./types.js";
import { breakSubAbilityCost, cardAbilityCost } from "./cost_fns.js";
import {
  makeEID, makeEIDFrom, effectCompleted, completeWithResult,
} from "./eid.js";
import {
  getEffects, sumEffects, anyEffects, isDisabledReg,
  registerLingeringEffect,
} from "./effects.js";
import {
  resolveAbility, triggerEventSimult, triggerEvent, abilityAsHandler,
} from "./engine.js";
import { canPay, mergeCosts, buildCostLabel, toC } from "./payment.js";
import { stealthValue } from "./costs.js";
import { systemMsg } from "./say.js";
import { update } from "./update.js";
import { req, effect, msg } from "./macros.js";
import { sameCard, pluralize, quantify, removeOnce } from "../utils.js";
import { makeLabel } from "../../jinteki/utils.js";
import {
  allActiveInstalled, allInstalled, cardToServer,
} from "./board.js";
import { getCard } from "./finding.js";

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
  const zone = cardToServer(state, { zone: ["servers", serverName, "ices"] } as Card);
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
  const currentIceCid = run?.currentIce as string | undefined;
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
function buildSub(
  sub: Record<string, unknown>,
  cid: string,
  opts?: { front?: boolean; back?: boolean; printed?: boolean; variable?: boolean },
): RuntimeSubroutine {
  const { front, back, printed, variable } = opts ?? {};
  return {
    label: makeLabel(sub as unknown as Ability),
    fromCid: cid,
    subEffect: (sub as any).subEffect ?? (sub as any).effect ?? (Object.assign({}, sub) as any),
    variable: variable ?? false,
    printed: printed ?? false,
    source: (sub as any).source ?? (printed ? "printed" : null),
    breakable: (sub as any).breakable !== undefined ? (sub as any).breakable : true,
  };
}

/**
 * Adds a subroutine to an ice card.
 * Mirrors: add-sub
 */
function addSub(
  ice: Card,
  sub: Record<string, unknown>,
  cid?: string,
  opts?: { front?: boolean; back?: boolean; printed?: boolean; variable?: boolean },
): Card {
  const targetCid = cid ?? ice.cid;
  const { front, back } = opts ?? {};
  const currentSubs = (ice.subroutines as RuntimeSubroutine[]) ?? [];
  const position = back ? 1 : front ? -1 : 0;
  const newSub: RuntimeSubroutine = {
    ...buildSub(sub, targetCid, opts),
    position,
  };
  const updated = [...currentSubs, newSub].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
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
  update(state, CORP_SIDE, (c: Card) => updated, updated);
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
export function breakAllSubroutinesEx(state: GameState, ice: Card, breaker?: Card | null): void {
  const resolved = getCard(state, ice);
  if (!resolved) return;
  const updated = breakAllSubroutines(resolved, breaker);
  update(state, CORP_SIDE, (c: Card) => updated, updated);
}

/**
 * Returns true if any subroutine is broken.
 * Mirrors: any-subs-broken?
 */
export function anySubsBroken(ice: Card): boolean {
  const subs = (ice.subroutines as RuntimeSubroutine[]) ?? [];
  return subs.some((s) => s.broken);
}

/**
 * Returns true if all subroutines are broken.
 * Mirrors: all-subs-broken?
 */
export function allSubsBroken(ice: Card): boolean {
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
  return subs.length > 0 && subs.every((s) => s.broken && s.breakerCid === card.cid);
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
export function dontResolveSubroutineEx(state: GameState, ice: Card, sub: RuntimeSubroutine): void {
  const resolved = getCard(state, ice);
  if (!resolved) return;
  const updated = dontResolveSubroutine(resolved, sub);
  update(state, CORP_SIDE, (c: Card) => updated, updated);
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
  update(state, CORP_SIDE, (c: Card) => updated, updated);
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
  update(state, CORP_SIDE, (c: Card) => updated, updated);
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
  if (anyEffects(state, side, "cannot-break-subs-on-ice", (v) => v === true, ice, [])) {
    return null;
  }
  const subs = (ice.subroutines as RuntimeSubroutine[]) ?? [];
  return subs
    .filter((s) => {
      if (s.broken) return false;
      const breakable = s.breakable;
      if (typeof breakable === "function") {
        return isDisabledReg(state, ice) || breakable(state, side, eid, ice, [card]);
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
      update(state, CORP_SIDE, (c: Card) => resolveSubroutineData(c, sub), resolved);
    }
  }

  // Check for replacement / prevention from encounter
  const encounter = getCurrentEncounter(state);
  const replacement = (encounter as any)?.replaceSubroutine as RuntimeSubroutine | undefined;
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
    (state.run as any).subroutinesFired = ((state.run as any).subroutinesFired ?? 0) + 1;
  }

  const resolvedIce = getCard(state, ice) ?? ice;
  resolveAbility(state, side, (finalSub.subEffect as Ability) ?? ({} as Ability), resolvedIce, []);
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
  resolveNextUnbrokenSub(
    state, side, eid, refreshedIce, subroutines.slice(1), [...msgs, sub],
  );
}

/**
 * Resolves all unbroken subroutines that haven't been manually resolved.
 * Mirrors: resolve-unbroken-subs!
 * NOTE: Do not resolve subroutines that players have already manually resolved.
 * This has led to game loses - do not change this.
 */
export function resolveUnbrokenSubsEx(state: GameState, side: string, ice: Card): void {
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
    'resolves ' + quantify(subs.length, 'unbroken subroutine') + ' on ' + getTitle(ice) + '("[subroutine] ' + subLabels + '")',
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
  const pumpFn = (ability as any).pumpBonus as ((s: GameState, sid: string, eid: EID, c: Card, t: Card[]) => number) | undefined;
  const bonus = pumpFn ? pumpFn(state, side, makeEID(state), card, targets ?? []) : 0;
  return base + bonus;
}

/**
 * Creates an ice strength bonus static ability.
 * Mirrors: ice-strength-bonus
 */
export function iceStrengthBonus(
  reqFn: ReqFn,
  bonus: number | ValueFn,
): Ability {
  return {
    type: "ice-strength" as any,
    req: req((state, side, eid, card, targets) =>
      sameCard(card, (targets as Card[])[0]) && reqFn(state, side, eid, card, targets),
    ),
    value: typeof bonus === "function" ? bonus : () => bonus,
  } as unknown as Ability;
}

/**
 * Sums ice strength effects from effects system.
 * Mirrors: sum-ice-strength-effects
 */
export function sumIceStrengthEffects(state: GameState, side: string, ice: Card): number {
  const canLower = !anyEffects(state, side, "cannot-lower-strength", (v) => v === true, ice, []);
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
export function iceStrength(state: GameState, side: string, ice: Card): number | null {
  if (!isICE(ice)) return null;
  const cdef = getCardDef(ice);
  const strengthBonusFn = cdef.strengthBonus as NumberFn | undefined;
  const strengthBonus = strengthBonusFn ? strengthBonusFn(state, side, null, ice, []) : 0;
  const effectsBonus = sumIceStrengthEffects(state, side, ice);
  return (ice.strength ?? 0) + strengthBonus + effectsBonus;
}

/**
 * Updates the given ice's strength by triggering events and updating the card.
 * Mirrors: update-ice-strength
 */
export function updateIceStrength(state: GameState, side: string, ice: Card): boolean {
  const resolved = getCard(state, ice);
  if (!resolved) return false;
  const oldStrength = getStrength(resolved);
  const newStrength = iceStrength(state, side, resolved);
  if (newStrength === null) return false;
  const changed = oldStrength !== newStrength;

  if (isActiveIce(state, resolved)) {
    const updated = { ...resolved, currentStrength: newStrength };
    update(state, side, (c: Card) => updated, updated);
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
function reconcileSubroutines(
  newSubs: RuntimeSubroutine[],
  oldSubs: RuntimeSubroutine[],
): RuntimeSubroutine[] {
  function sameSub(a: RuntimeSubroutine, b: RuntimeSubroutine): boolean {
    return (
      (a.label ?? "") === (b.label ?? "") && (a.source ?? null) === (b.source ?? null)
    );
  }

  function preserveStatus(newSub: RuntimeSubroutine, oldSub: RuntimeSubroutine): RuntimeSubroutine {
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
    const matchIdx = remainingOld.findIndex((oldSub) => sameSub(newSub, oldSub));

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

/**
 * Builds any unbuilt subroutine definitions.
 * Mirrors: build-unbuilt-subs
 */
function buildUnbuiltSubs(sub: RuntimeSubroutine): RuntimeSubroutine {
  if (sub.variable !== undefined || sub.fromCid) {
    return sub;
  }
  return { ...buildSub(sub, sub.fromCid ?? ""), variable: sub.variable, printed: sub.printed };
}

/**
 * Gets the expected subroutines for an ice based on card def and effects.
 * Mirrors: get-expected-subroutines
 */
export function getExpectedSubroutines(state: GameState, side: string, ice: Card): RuntimeSubroutine[] {
  const cdef = getCardDef(ice);

  if (isDisabledReg(state, ice) || !isRezzed(ice)) {
    // If disabled or unrezzed, only printed subs
    return ((cdef.subroutines as any[]) ?? []).map((s) =>
      buildSub(s as any, ice.cid ?? "", { printed: true }),
    );
  }

  const printedSubsToLose = sumEffects(state, side, "lose-printed-subroutines", ice, []) ?? 0;
  const basePrintedSubs = ((cdef.subroutines as any[]) ?? []).map((s) =>
    buildSub(s as any, ice.cid ?? "", { printed: true }),
  );
  const printedSubroutines = basePrintedSubs.slice(printedSubsToLose);

  // Additional subroutines from effects
  const appliedSubs = getEffects(state, side, "additional-subroutines", ice, []);
  const appliedFront: RuntimeSubroutine[] = [];
  const appliedEnd: RuntimeSubroutine[] = [];
  for (const ap of appliedSubs) {
    if ((ap as any)?.position === "front") {
      const subs = ((ap as any).subroutines as any[]) ?? [];
      const uuid = (ap as any).uuid;
      const cid = (ap as any).cid;
      for (const s of subs) {
        appliedFront.push({ ...s, source: uuid, fromCid: cid } as RuntimeSubroutine);
      }
    } else {
      const subs = ((ap as any).subroutines as any[]) ?? [];
      const uuid = (ap as any).uuid;
      const cid = (ap as any).cid;
      for (const s of subs) {
        appliedEnd.push({ ...s, source: uuid, fromCid: cid } as RuntimeSubroutine);
      }
    }
  }

  // TDLR effect: repeat subroutines
  const tldrEffect = sumEffects(state, CORP_SIDE, "tldr-effect", ice, []) ?? 0;
  const subRepeats = Math.min(4, Math.max(0, tldrEffect));
  const repeatCount = Math.pow(2, subRepeats);

  let expected = [...appliedFront, ...printedSubroutines, ...appliedEnd];
  if (repeatCount > 1) {
    const repeated: RuntimeSubroutine[] = [];
    for (const s of expected) {
      for (let i = 0; i < repeatCount; i++) {
        repeated.push({ ...s });
      }
    }
    expected = repeated;
  }

  return expected;
}

/**
 * Updates the given ice's subroutines by checking what it should have.
 * Mirrors: update-ice-subroutines
 */
export function updateIceSubroutines(state: GameState, side: string, ice: Card): boolean {
  const resolved = getCard(state, ice);
  if (!resolved) return false;

  const expected = getExpectedSubroutines(state, side, resolved);
  const active = (resolved.subroutines as RuntimeSubroutine[]) ?? [];

  const expectedKeys = expected.map((s) => ({ source: s.source, label: s.label }));
  const activeKeys = active.map((s) => ({ source: s.source, label: s.label }));

  const keysMatch =
    expectedKeys.length === activeKeys.length &&
    expectedKeys.every((k, i) => k.source === activeKeys[i].source && k.label === activeKeys[i].label);

  if (keysMatch) return false;

  const newSubs = reconcileSubroutines(expected, active)
    .map(buildUnbuiltSubs)
    .map((sub, idx) => ({ ...sub, index: idx }));

  const updated = { ...resolved, subroutines: newSubs };
  update(state, side, (c: Card) => updated, updated);
  triggerEvent(state, side, "subroutines-changed", getCard(state, resolved));
  return true;
}

/**
 * Updates all ice in a given server.
 * Mirrors: update-ice-in-server
 */
export function updateIceInServer(state: GameState, side: string, server: ServerZone): boolean {
  let changed = false;
  for (const ice of server.ices) {
    if (updateIceStrength(state, side, ice)) changed = true;
    const resolved = getCard(state, ice);
    if (resolved && updateIceSubroutines(state, side, resolved)) changed = true;
  }
  return changed;
}

/**
 * Updates all installed ice.
 * Mirrors: update-all-ice
 */
export function updateAllIce(state: GameState, side: string): boolean {
  let changed = false;
  const servers = state.corp.servers;
  for (const sv of [servers.hq, servers.rd, servers.archives]) {
    if (updateIceInServer(state, side, sv)) changed = true;
  }
  for (const sv of Object.values(servers.remote)) {
    if (updateIceInServer(state, side, sv)) changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Pump (ice)
// ---------------------------------------------------------------------------

/**
 * Changes a piece of ice's strength by n for a given duration.
 * Mirrors: pump-ice
 */
export function pumpIce(
  state: GameState,
  side: string,
  card: Card,
  n: number,
  duration: string = "end-of-encounter",
): void {
  const resolved = getCard(state, card);
  registerLingeringEffect(
    state,
    side,
    resolved,
    "ice-strength",
    duration,
    req((s, sid, eid, c, targets) => sameCard(c, targets[0])),
    () => n,
  );
  updateIceStrength(state, side, resolved);
}

/**
 * Pumps all active installed ice.
 * Mirrors: pump-all-ice
 */
export function pumpAllIce(
  state: GameState,
  side: string,
  n: number,
  duration: string = "end-of-encounter",
): void {
  for (const ice of allActiveInstalled(state, CORP_SIDE).filter(isICE)) {
    pumpIce(state, side, ice, n, duration);
  }
}

// ---------------------------------------------------------------------------
// Icebreaker strength
// ---------------------------------------------------------------------------

/**
 * Gets the modified strength of the given icebreaker.
 * Mirrors: breaker-strength
 */
export function breakerStrength(state: GameState, side: string, card: Card): number | null {
  if (card.strength === undefined || card.strength === null) return null;
  const cdef = getCardDef(card);
  const strengthBonusFn = cdef.strengthBonus as NumberFn | undefined;
  const strengthBonus = strengthBonusFn
    ? strengthBonusFn(state, side, makeEID(state), card, [])
    : 0;
  const effectsBonus = sumEffects(state, side, "breaker-strength", card, []);
  return (card.strength ?? 0) + strengthBonus + effectsBonus;
}

/**
 * Creates a breaker strength bonus static ability.
 * Mirrors: breaker-strength-bonus
 */
export function breakerStrengthBonus(
  reqFn: ReqFn,
  bonus: number | ValueFn,
): Ability {
  return {
    type: "breaker-strength" as any,
    req: req((state, side, eid, card, targets) =>
      sameCard(card, (targets as Card[])[0]) && reqFn(state, side, eid, card, targets),
    ),
    value: typeof bonus === "function" ? bonus : () => bonus,
  } as unknown as Ability;
}

/**
 * Updates a breaker's current strength.
 * Mirrors: update-breaker-strength
 */
export function updateBreakerStrength(state: GameState, side: string, breaker: Card): boolean {
  const resolved = getCard(state, breaker);
  if (!resolved) return false;
  const oldStrength = getStrength(resolved);
  const newStrength = breakerStrength(state, side, resolved);
  if (newStrength === null) return false;
  const changed = oldStrength !== newStrength;

  const updated = { ...resolved, currentStrength: newStrength };
  update(state, side, (c: Card) => updated, updated);
  triggerEvent(state, side, "breaker-strength-changed", {
    card: getCard(state, resolved),
    oldStrength,
    strength: newStrength,
  });
  return changed;
}

/**
 * Updates all active installed icebreakers.
 * Mirrors: update-all-icebreakers
 */
export function updateAllIcebreakers(state: GameState, side: string): boolean {
  let changed = false;
  for (const ib of allActiveInstalled(state, RUNNER_SIDE).filter((c) => hasSubtype(c, "Icebreaker"))) {
    if (updateBreakerStrength(state, side, ib)) changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Pump (breaker)
// ---------------------------------------------------------------------------

/**
 * Changes a breaker's strength by n for a given duration.
 * Mirrors: pump
 */
export function pump(
  state: GameState,
  side: string,
  card: Card,
  n: number,
  duration: string = "end-of-encounter",
): void {
  const resolved = getCard(state, card);
  const floatingEffect = registerLingeringEffect(
    state,
    side,
    resolved,
    "breaker-strength",
    duration,
    req((s, sid, eid, c, targets) => sameCard(c, targets[0])),
    () => n,
  );
  updateBreakerStrength(state, side, resolved);
  triggerEvent(state, side, "pump-breaker", {
    card: getCard(state, resolved),
    effect: floatingEffect,
  });
}

/**
 * Pumps all active installed icebreakers.
 * Mirrors: pump-all-icebreakers
 */
export function pumpAllIcebreakers(
  state: GameState,
  side: string,
  n: number,
  duration: string = "end-of-encounter",
): void {
  for (const ib of allActiveInstalled(state, RUNNER_SIDE).filter((c) => hasSubtype(c, "Icebreaker"))) {
    pump(state, side, ib, n, duration);
  }
}

// ---------------------------------------------------------------------------
// Break subroutine ability implementation
// ---------------------------------------------------------------------------

function addStealthToLabel(cost: (Record<string, unknown>)[] | undefined): string | null {
  if (!cost) return null;
  const flat = cost.flat();
  const creditCost = flat.find((c) => (c as any)?.type === "credit");
  if (!creditCost) return null;
  const sv = stealthValue(creditCost as any);
  if (sv > 0) {
    return ` (using at least ${sv} stealth [Credits])`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// break-sub
// ---------------------------------------------------------------------------

/**
 * Creates a break subroutine ability.
 * Mirrors: break-sub
 *
 * cost: A number (for credits) or a cost vector.
 * n: Number of subs to break. 0 = any number.
 * subtypes: String, string[], or null (any/AI).
 * args: Additional options (:label, :additional-ability, :req).
 */
export function breakSub(
  cost: number | Record<string, unknown>[],
  n: number | NumberFn,
  subtypes?: string | string[] | null,
  args?: Record<string, unknown>,
): Ability {
  const costData = typeof cost === "number" ? [toC("credit", cost)] : (cost as any[]);
  const subtypeSet: Set<string> = (() => {
    if (typeof subtypes === "string") return new Set([subtypes]);
    if (Array.isArray(subtypes)) return new Set(subtypes);
    return new Set(["All"]);
  })();

  const mergedArgs = { ...args, subtype: subtypeSet, break: n };
  const hasTrashCan = mergeCosts([costData]).some((c) => (c as any)?.type === "trash-can");

  return {
    ...(hasTrashCan ? { fakeCost: [toC("trash-can", 1)] } : {}),
    async: true,
    req: req((state, side, eid, card, targets) => {
      const currentIce = getCurrentIce(state);
      if (!currentIce) return false;
      if (!state.encounters[state.encounters.length - 1]) return false;
      if (!isActiveIce(state, currentIce)) return false;
      if (!subtypeSet.has("All") && ![...subtypeSet].some((st) => hasSubtype(currentIce, st))) return false;
      const breakable = breakableSubroutinesChoice(state, side, eid, card, currentIce);
      if (!breakable || breakable.length === 0) return false;
      if (args?.req && typeof (args.req as ReqFn) === "function") {
        return (args.req as ReqFn)(state, side, eid, card, targets);
      }
      return true;
    }),
    break: n,
    breaks: [...subtypeSet],
    breakCost: costData,
    additionalAbility: (args as any)?.additionalAbility,
    autoBreakSort: (args as any)?.autoBreakSort,
    breakCostBonus: (args as any)?.breakCostBonus,
    label: (() => {
      const customLabel = (args as any)?.label;
      if (customLabel) return customLabel;
      const stealthSuffix = addStealthToLabel(costData) ?? "";
      const subTypeStr =
        !subtypeSet.has("All")
          ? ` ${[...subtypeSet].sort().join(" or ")}`
          : "";
      const nStr = n > 1 ? `up to ` : "";
      const countStr = n > 0 ? String(n) : "any number of";
      return `break ${nStr}${countStr}${subTypeStr}${pluralize(" subroutine", typeof n === "number" ? n : 1)}${stealthSuffix}`;
    })(),
    effect: effect(
      (state: GameState, side: string, eid: EID, card: Card, targets: Card[]) => {
        const currentIce = getCurrentIce(state);
        if (!currentIce) return null;
        const resolvedN = typeof n === "function" ? n(state, side, eid, card, null) : n;
        const subs = (currentIce.subroutines as RuntimeSubroutine[]) ?? [];
        const mockBroken = subs.slice(0, typeof resolvedN === "number" ? resolvedN : subs.length);
        const abilityCost = breakSubAbilityCost(
          state,
          side,
          { ...mergedArgs, breakCost: costData } as unknown as Ability,
          card,
          [currentIce],
        );
        // In full async implementation, this would use continue-ability pattern
        return {
          type: "break-subroutines",
          ice: currentIce,
          breaker: card,
          cost: costData,
          n: resolvedN,
          args: mergedArgs,
        };
      },
    ),
  } as unknown as Ability;
}

// ---------------------------------------------------------------------------
// strength-pump
// ---------------------------------------------------------------------------

/**
 * Creates a strength pump ability.
 * Mirrors: strength-pump
 */
export function strengthPump(
  cost: number | Record<string, unknown>[],
  strength: number,
  duration: string = "end-of-encounter",
  args?: Record<string, unknown>,
): Ability {
  const costData = typeof cost === "number" ? toC("credit", cost) : cost;
  const durationString =
    duration === "end-of-run"
      ? " for the remainder of the run"
      : duration === "end-of-turn"
        ? " for the remainder of the turn"
        : "";
  const stealthSuffix = addStealthToLabel([costData as any]) ?? "";

  return {
    label:
      (args as any)?.label ??
      `add ${strength} strength${durationString}${stealthSuffix}`,
    req: req((state, side, eid, card, targets) => {
      const strReq = (args as any)?.req as ReqFn | undefined;
      if (strReq) return strReq(state, side, eid, card, targets);
      return true;
    }),
    cost: [costData],
    pump: strength,
    pumpBonus: (args as any)?.pumpBonus,
    costBonus: (args as any)?.costBonus,
    autoPumpSort: (args as any)?.autoBreakSort,
    autoPumpIgnore: (args as any)?.autoPumpIgnore,
    msg: msg(
      "increase its strength from ",
      (s: GameState, sid: string, eid: EID, card: Card) => getStrength(card),
      " to ",
      (s: GameState, sid: string, eid: EID, card: Card) =>
        getStrength(card) +
        getPumpStrength(s, sid, { ...args, pump: strength } as unknown as Ability, card),
      durationString,
    ),
    effect: effect(
      (state: GameState, side: string, eid: EID, card: Card, targets: Card[]) => {
        pump(state, side, card, getPumpStrength(state, side, { ...args, pump: strength } as unknown as Ability, card), duration);
      },
    ),
  } as unknown as Ability;
}

// ---------------------------------------------------------------------------
// substitute-x-credit-costs
// ---------------------------------------------------------------------------

/**
 * Substitute out the 'x-credits' part of a cost when the credit count is known.
 * Mirrors: substitute-x-credit-costs
 */
export function substituteXCreditCosts(
  cost: (Record<string, unknown> | undefined)[],
  x: number | undefined,
  scale: number | undefined,
): (Record<string, unknown> | undefined)[] {
  if (x === undefined || x === null || scale === undefined || scale === null) return cost;
  const adjusted = cost.filter((c) => (c as any)?.type !== "x-credits");
  if (adjusted.length === cost.length) return cost;
  return [...adjusted, toC("credit", x * scale)];
}

// ---------------------------------------------------------------------------
// breaker-auto-pump
// ---------------------------------------------------------------------------

/**
 * Returns an ability that auto-pumps and auto-breaks icebreakers.
 * Mirrors: breaker-auto-pump (the def value, not the defn)
 */
export const breakerAutoPump: Ability = {
  silent: true,
  effect: req((state, side, eid, card, targets) => {
    const cdef = getCardDef(card);
    const abilities = (card.abilities as Ability[]) ?? [];
    const abs = abilities.filter(
      (a) => (a as any).dynamic !== "auto-pump" && (a as any).dynamic !== "auto-pump-and-break",
    );
    const currentIce = getCurrentIce(state);
    if (!currentIce) return;

    // Find pump ability
    const defAbilities = (cdef.abilities as Ability[]) ?? [];
    const canPump = (ability: Ability) => {
      if (!(ability as any).pump) return false;
      const reqFn = (ability as any).req as ReqFn | undefined;
      if (reqFn) return reqFn(state, side, eid, card, []);
      return true;
    };

    const pumpCandidates = defAbilities
      .filter((a) => !(a as any).autoPumpIgnore)
      .map((ability) => {
        if (canPump(ability)) {
          const cost = cardAbilityCost(state, side, ability, card, [currentIce]);
          return { ability, cost };
        }
        return null;
      })
      .filter(Boolean) as { ability: Ability; cost: Record<string, unknown>[] }[];

    const pumpAbilityEntry =
      pumpCandidates.length > 0
        ? pumpCandidates.reduce((best, entry) => {
            const bestCost = best.cost ?? [];
            const entryCost = entry.cost ?? [];
            const bestTotal = (bestCost as any[]).reduce((s: number, c: any) => s + ((c as any)?.amount ?? 0), 0);
            const entryTotal = (entryCost as any[]).reduce((s: number, c: any) => s + ((c as any)?.amount ?? 0), 0);
            return entryTotal <= bestTotal ? entry : best;
          }, pumpCandidates[0])
        : null;

    const pumpAbility = pumpAbilityEntry?.ability ?? null;
    const pumpCost = pumpAbilityEntry?.cost ?? null;

    const pumpStrengthVal = pumpAbility ? getPumpStrength(state, side, pumpAbility, card) : 0;
    const iceStrength = getStrength(currentIce);
    const cardStrength = getStrength(card);
    const strengthDiff =
      iceStrength > 0 && cardStrength > 0 ? Math.max(0, iceStrength - cardStrength) : 0;

    const timesPump =
      strengthDiff > 0 && pumpStrengthVal > 0
        ? Math.ceil(strengthDiff / pumpStrengthVal)
        : 0;

    const totalPumpCost = pumpAbility && timesPump > 0 ? Array(timesPump).fill(pumpCost) : null;

    // Break ability
    const canBreak = (ability: Ability) => {
      if (!(ability as any).breakReq) return false;
      return (ability as any).breakReq(state, side, eid, card, []);
    };

    const breakAbility = defAbilities.find(canBreak) ?? null;
    const breakCost = breakAbility ? breakSubAbilityCost(state, side, breakAbility, card, [currentIce]) : null;
    const subsBrokenAtOnce = breakAbility ? ((breakAbility as any).break ?? 1) : 0;

    const subs = (currentIce.subroutines as RuntimeSubroutine[]) ?? [];
    const unbrokenSubs = subs.filter((s) => !s.broken).length;

    // Check for unbreakable subs
    const noUnbreakableSubs = subs.filter((s) => {
      const breakable = s.breakable;
      if (typeof breakable === "function") {
        return isDisabledReg(state, currentIce) || breakable(state, side, eid, currentIce, [card]);
      }
      return breakable ?? true;
    }).length === subs.length;

    const canAutoBreak = !anyEffects(state, side, "cannot-auto-break-subs-on-ice", (v) => v === true, currentIce, [card]);

    const timesBreak =
      unbrokenSubs > 0 && subsBrokenAtOnce > 0
        ? subsBrokenAtOnce > 0
          ? Math.ceil(unbrokenSubs / subsBrokenAtOnce)
          : 1
        : 0;

    const adjustedBreakCost = breakCost
      ? substituteXCreditCosts(breakCost, unbrokenSubs, (breakAbility as any)?.autoBreakCredsPerSub ?? 1)
      : null;

    const totalBreakCost =
      adjustedBreakCost && timesBreak > 0 ? Array(timesBreak).fill(adjustedBreakCost) : null;

    const totalCost = mergeCosts([totalPumpCost, totalBreakCost]);

    const hasEncounter = state.encounters.length > 0;
    const iceActive = isActiveIce(state, currentIce);
    const hasBreakOrPump = !!(breakAbility || pumpAbility);

    if (totalCost.length > 0 && hasEncounter && iceActive && hasBreakOrPump) {
      const autoBreakAbility =
        breakAbility &&
        (!cardStrength || pumpAbility || strengthDiff === 0) &&
        noUnbreakableSubs &&
        canAutoBreak &&
        unbrokenSubs > 0 &&
        canPay(state, side, eid, card, null, totalCost)
          ? {
              dynamic: "auto-pump-and-break",
              cost: totalCost,
              costLabel: buildCostLabel(totalCost),
              label: `${pumpAbility && timesPump > 0 ? "Match strength and fully break " : "Fully break "}${getTitle(currentIce)}`,
            }
          : null;

      const autoPumpAbility =
        pumpAbility &&
        timesPump > 0 &&
        canPay(state, side, eid, card, null, totalPumpCost)
          ? {
              dynamic: "auto-pump",
              cost: totalPumpCost,
              costLabel: buildCostLabel(totalPumpCost ?? []),
              label: `Match strength of ${getTitle(currentIce)}`,
            }
          : null;

      const newAbs = [...abs];
      if (autoBreakAbility) newAbs.push(autoBreakAbility);
      if (autoPumpAbility) newAbs.push(autoPumpAbility);

      update(state, side, (c: Card) => ({ ...c, abilities: newAbs }), card);
    } else {
      update(state, side, (c: Card) => ({ ...c, abilities: abs }), card);
    }
  }),
} as unknown as Ability;

// ---------------------------------------------------------------------------
// auto-icebreaker
// ---------------------------------------------------------------------------

/**
 * Takes a card definition and returns a new one with breaker-auto-pump
 * hooked to the necessary events.
 * Mirrors: auto-icebreaker
 */
export function autoIcebreaker(cdef: CardDef): CardDef {
  const events = [
    "run",
    "approach-ice",
    "encounter-ice",
    "pass-ice",
    "run-ends",
    "ice-strength-changed",
    "ice-subtype-changed",
    "breaker-strength-changed",
    "subroutines-changed",
  ].map((event) => ({ ...breakerAutoPump, event }) as any);

  return {
    ...cdef,
    events: [...events, ...(cdef.events ?? [])],
  };
}
