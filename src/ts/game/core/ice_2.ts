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
import { req, effect, msg } from "./macros";
import { sameCard, pluralize, quantify, removeOnce } from "../utils";
import { makeLabel } from "../../jinteki/utils";
import { allActiveInstalled, allInstalled, cardToServer } from "./board";
import { getCard } from "./finding";

import {
  breakableSubroutinesChoice,
  buildSub,
  getCurrentIce,
  getPumpStrength,
  getStrength,
  iceStrength,
  isActiveIce,
  reconcileSubroutines,
  updateIceStrength,
} from "./ice_1";
import type { RuntimeSubroutine } from "./ice_1";

/**
 * Builds any unbuilt subroutine definitions.
 * Mirrors: build-unbuilt-subs
 */
function buildUnbuiltSubs(sub: RuntimeSubroutine): RuntimeSubroutine {
  if (sub.variable !== undefined || sub.fromCid) {
    return sub;
  }
  return {
    ...buildSub(sub, sub.fromCid ?? ""),
    variable: sub.variable,
    printed: sub.printed,
  };
}

/**
 * Gets the expected subroutines for an ice based on card def and effects.
 * Mirrors: get-expected-subroutines
 */
export function getExpectedSubroutines(
  state: GameState,
  side: string,
  ice: Card,
): RuntimeSubroutine[] {
  const cdef = getCardDef(ice);

  if (isDisabledReg(state, ice) || !isRezzed(ice)) {
    // If disabled or unrezzed, only printed subs
    return ((cdef.subroutines as any[]) ?? []).map((s) =>
      buildSub(s as any, ice.cid ?? "", { printed: true }),
    );
  }

  const printedSubsToLose =
    sumEffects(state, side, "lose-printed-subroutines", ice, []) ?? 0;
  const basePrintedSubs = ((cdef.subroutines as any[]) ?? []).map((s) =>
    buildSub(s as any, ice.cid ?? "", { printed: true }),
  );
  const printedSubroutines = basePrintedSubs.slice(printedSubsToLose);

  // Additional subroutines from effects
  const appliedSubs = getEffects(
    state,
    side,
    "additional-subroutines",
    ice,
    [],
  );
  const appliedFront: RuntimeSubroutine[] = [];
  const appliedEnd: RuntimeSubroutine[] = [];
  for (const ap of appliedSubs) {
    if ((ap as any)?.position === "front") {
      const subs = ((ap as any).subroutines as any[]) ?? [];
      const uuid = (ap as any).uuid;
      const cid = (ap as any).cid;
      for (const s of subs) {
        appliedFront.push({
          ...s,
          source: uuid,
          fromCid: cid,
        } as RuntimeSubroutine);
      }
    } else {
      const subs = ((ap as any).subroutines as any[]) ?? [];
      const uuid = (ap as any).uuid;
      const cid = (ap as any).cid;
      for (const s of subs) {
        appliedEnd.push({
          ...s,
          source: uuid,
          fromCid: cid,
        } as RuntimeSubroutine);
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
export function updateIceSubroutines(
  state: GameState,
  side: string,
  ice: Card,
): boolean {
  const resolved = getCard(state, ice);
  if (!resolved) return false;

  const expected = getExpectedSubroutines(state, side, resolved);
  const active = (resolved.subroutines as RuntimeSubroutine[]) ?? [];

  const expectedKeys = expected.map((s) => ({
    source: s.source,
    label: s.label,
  }));
  const activeKeys = active.map((s) => ({ source: s.source, label: s.label }));

  const keysMatch =
    expectedKeys.length === activeKeys.length &&
    expectedKeys.every(
      (k, i) =>
        k.source === activeKeys[i].source && k.label === activeKeys[i].label,
    );

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
export function updateIceInServer(
  state: GameState,
  side: string,
  server: ServerZone,
): boolean {
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
export function breakerStrength(
  state: GameState,
  side: string,
  card: Card,
): number | null {
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
    req: req(
      (state, side, eid, card, targets) =>
        sameCard(card, (targets as Card[])[0]) &&
        reqFn(state, side, eid, card, targets),
    ),
    value: typeof bonus === "function" ? bonus : () => bonus,
  } as unknown as Ability;
}

/**
 * Updates a breaker's current strength.
 * Mirrors: update-breaker-strength
 */
export function updateBreakerStrength(
  state: GameState,
  side: string,
  breaker: Card,
): boolean {
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
  for (const ib of allActiveInstalled(state, RUNNER_SIDE).filter((c) =>
    hasSubtype(c, "Icebreaker"),
  )) {
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
  for (const ib of allActiveInstalled(state, RUNNER_SIDE).filter((c) =>
    hasSubtype(c, "Icebreaker"),
  )) {
    pump(state, side, ib, n, duration);
  }
}

// ---------------------------------------------------------------------------
// Break subroutine ability implementation
// ---------------------------------------------------------------------------

function addStealthToLabel(
  cost: Record<string, unknown>[] | undefined,
): string | null {
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
  const costData =
    typeof cost === "number" ? [toC("credit", cost)] : (cost as any[]);
  const subtypeSet: Set<string> = (() => {
    if (typeof subtypes === "string") return new Set([subtypes]);
    if (Array.isArray(subtypes)) return new Set(subtypes);
    return new Set(["All"]);
  })();

  const mergedArgs = { ...args, subtype: subtypeSet, break: n };
  const hasTrashCan = mergeCosts([costData]).some(
    (c) => (c as any)?.type === "trash-can",
  );

  return {
    ...(hasTrashCan ? { fakeCost: [toC("trash-can", 1)] } : {}),
    async: true,
    req: req((state, side, eid, card, targets) => {
      const currentIce = getCurrentIce(state);
      if (!currentIce) return false;
      if (!state.encounters[state.encounters.length - 1]) return false;
      if (!isActiveIce(state, currentIce)) return false;
      if (
        !subtypeSet.has("All") &&
        ![...subtypeSet].some((st) => hasSubtype(currentIce, st))
      )
        return false;
      const breakable = breakableSubroutinesChoice(
        state,
        side,
        eid,
        card,
        currentIce,
      );
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
      const subTypeStr = !subtypeSet.has("All")
        ? ` ${[...subtypeSet].sort().join(" or ")}`
        : "";
      const nStr = n > 1 ? `up to ` : "";
      const countStr = n > 0 ? String(n) : "any number of";
      return `break ${nStr}${countStr}${subTypeStr}${pluralize(" subroutine", typeof n === "number" ? n : 1)}${stealthSuffix}`;
    })(),
    effect: effect(
      (
        state: GameState,
        side: string,
        eid: EID,
        card: Card,
        targets: Card[],
      ) => {
        const currentIce = getCurrentIce(state);
        if (!currentIce) return null;
        const resolvedN =
          typeof n === "function" ? n(state, side, eid, card, null) : n;
        const subs = (currentIce.subroutines as RuntimeSubroutine[]) ?? [];
        const mockBroken = subs.slice(
          0,
          typeof resolvedN === "number" ? resolvedN : subs.length,
        );
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
        getPumpStrength(
          s,
          sid,
          { ...args, pump: strength } as unknown as Ability,
          card,
        ),
      durationString,
    ),
    effect: effect(
      (
        state: GameState,
        side: string,
        eid: EID,
        card: Card,
        targets: Card[],
      ) => {
        pump(
          state,
          side,
          card,
          getPumpStrength(
            state,
            side,
            { ...args, pump: strength } as unknown as Ability,
            card,
          ),
          duration,
        );
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
  if (x === undefined || x === null || scale === undefined || scale === null)
    return cost;
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
      (a) =>
        (a as any).dynamic !== "auto-pump" &&
        (a as any).dynamic !== "auto-pump-and-break",
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
          const cost = cardAbilityCost(state, side, ability, card, [
            currentIce,
          ]);
          return { ability, cost };
        }
        return null;
      })
      .filter(Boolean) as {
      ability: Ability;
      cost: Record<string, unknown>[];
    }[];

    const pumpAbilityEntry =
      pumpCandidates.length > 0
        ? pumpCandidates.reduce((best, entry) => {
            const bestCost = best.cost ?? [];
            const entryCost = entry.cost ?? [];
            const bestTotal = (bestCost as any[]).reduce(
              (s: number, c: any) => s + ((c as any)?.amount ?? 0),
              0,
            );
            const entryTotal = (entryCost as any[]).reduce(
              (s: number, c: any) => s + ((c as any)?.amount ?? 0),
              0,
            );
            return entryTotal <= bestTotal ? entry : best;
          }, pumpCandidates[0])
        : null;

    const pumpAbility = pumpAbilityEntry?.ability ?? null;
    const pumpCost = pumpAbilityEntry?.cost ?? null;

    const pumpStrengthVal = pumpAbility
      ? getPumpStrength(state, side, pumpAbility, card)
      : 0;
    const iceStrength = getStrength(currentIce);
    const cardStrength = getStrength(card);
    const strengthDiff =
      iceStrength > 0 && cardStrength > 0
        ? Math.max(0, iceStrength - cardStrength)
        : 0;

    const timesPump =
      strengthDiff > 0 && pumpStrengthVal > 0
        ? Math.ceil(strengthDiff / pumpStrengthVal)
        : 0;

    const totalPumpCost =
      pumpAbility && timesPump > 0 ? Array(timesPump).fill(pumpCost) : null;

    // Break ability
    const canBreak = (ability: Ability) => {
      if (!(ability as any).breakReq) return false;
      return (ability as any).breakReq(state, side, eid, card, []);
    };

    const breakAbility = defAbilities.find(canBreak) ?? null;
    const breakCost = breakAbility
      ? breakSubAbilityCost(state, side, breakAbility, card, [currentIce])
      : null;
    const subsBrokenAtOnce = breakAbility
      ? ((breakAbility as any).break ?? 1)
      : 0;

    const subs = (currentIce.subroutines as RuntimeSubroutine[]) ?? [];
    const unbrokenSubs = subs.filter((s) => !s.broken).length;

    // Check for unbreakable subs
    const noUnbreakableSubs =
      subs.filter((s) => {
        const breakable = s.breakable;
        if (typeof breakable === "function") {
          return (
            isDisabledReg(state, currentIce) ||
            breakable(state, side, eid, currentIce, [card])
          );
        }
        return breakable ?? true;
      }).length === subs.length;

    const canAutoBreak = !anyEffects(
      state,
      side,
      "cannot-auto-break-subs-on-ice",
      (v) => v === true,
      currentIce,
      [card],
    );

    const timesBreak =
      unbrokenSubs > 0 && subsBrokenAtOnce > 0
        ? subsBrokenAtOnce > 0
          ? Math.ceil(unbrokenSubs / subsBrokenAtOnce)
          : 1
        : 0;

    const adjustedBreakCost = breakCost
      ? substituteXCreditCosts(
          breakCost,
          unbrokenSubs,
          (breakAbility as any)?.autoBreakCredsPerSub ?? 1,
        )
      : null;

    const totalBreakCost =
      adjustedBreakCost && timesBreak > 0
        ? Array(timesBreak).fill(adjustedBreakCost)
        : null;

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
