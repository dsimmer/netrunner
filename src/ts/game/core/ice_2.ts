// Ice mechanics: subroutines, strength, break abilities, pump, auto-pump.
// Mirrors: src/clj/game/core/ice.clj

import type { GameState, ServerZone, Encounter } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import type { Ability, AbilityFn, CardDef, NumberFn, ReqFn, Side, State, Subroutine, ValueFn } from "./types";
import type { Cost as Costs1Cost } from "./costs_1";
import { CORP_SIDE, RUNNER_SIDE } from "./state";
import { isICE, isInstalled, isRezzed, hasSubtype, getTitle } from "./card";
import { getCardDef } from "./types";
import { breakSubAbilityCost, cardAbilityCost } from "./cost_fns";
import {
  makeEID,
  makeEIDFrom,
  effectCompleted,
  completeWithResult,
} from "./eid";
import {
  getEffects,
  getTaggedEffects,
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
import type { CostData } from "./payment";
import { stealthValue } from "./costs";
import { systemMsg } from "./say";
import { update } from "./update";
import { req, effect, msg } from "../macros";
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

  type RawSub = Record<string, unknown>;
  interface AppliedSubsEffect {
    position?: string;
    subroutines?: RawSub[];
    uuid?: string;
    cid?: string;
  }

  if (isDisabledReg(state, ice) || !isRezzed(ice)) {
    // If disabled or unrezzed, only printed subs
    return ((cdef.subroutines as RawSub[] | undefined) ?? []).map((s: RawSub) =>
      buildSub(s, ice.cid ?? "", { printed: true }),
    );
  }

  const printedSubsToLose =
    sumEffects(state, side, "lose-printed-subroutines", ice, []) ?? 0;
  const basePrintedSubs = ((cdef.subroutines as RawSub[] | undefined) ?? []).map((s: RawSub) =>
    buildSub(s, ice.cid ?? "", { printed: true }),
  );
  const printedSubroutines = basePrintedSubs.slice(printedSubsToLose);

  // Additional subroutines from effects
  const appliedSubs = getTaggedEffects(
    state,
    side,
    "additional-subroutines",
    ice,
    [],
  );
  const appliedFront: RuntimeSubroutine[] = [];
  const appliedEnd: RuntimeSubroutine[] = [];
  for (const ap of appliedSubs as unknown as AppliedSubsEffect[]) {
    const subs = (ap?.subroutines ?? []) as RawSub[];
    const uuid = ap?.uuid;
    const cid = ap?.cid;
    const target = ap?.position === "front" ? appliedFront : appliedEnd;
    for (const s of subs) {
      target.push({
        ...s,
        source: uuid,
        fromCid: cid,
      } as RuntimeSubroutine);
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

  const expectedKeys = expected.map((s: RuntimeSubroutine) => ({
    source: s.source,
    label: s.label,
  }));
  const activeKeys = active.map((s: RuntimeSubroutine) => ({ source: s.source, label: s.label }));

  const keysMatch =
    expectedKeys.length === activeKeys.length &&
    expectedKeys.every(
      (k, i) =>
        k.source === activeKeys[i].source && k.label === activeKeys[i].label,
    );

  if (keysMatch) return false;

  const newSubs = reconcileSubroutines(expected, active)
    .map(buildUnbuiltSubs)
    .map((sub: RuntimeSubroutine, idx: number) => ({ ...sub, index: idx }));

  const updated = { ...resolved, subroutines: newSubs };
  update(state, side, updated);
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
export function pumpIce(card: Card, n: number, duration?: string): void;
export function pumpIce(state: GameState, side: string, card: Card, n: number, duration?: string): void;
export function pumpIce(...args: unknown[]): void {
  if (typeof args[1] === "number") {
    // shorthand (card, n, duration?) — no state, no-op
    return;
  }
  const state = args[0] as GameState;
  const side = args[1] as string;
  const card = args[2] as Card;
  const n = args[3] as number;
  const duration = (args[4] as string) ?? "end-of-encounter";
  const resolved = getCard(state, card) as Card;
  registerLingeringEffect(
    state,
    side,
    resolved,
    "ice-strength",
    duration,
    req((s: State, sid: Side, eid: EID, c: Card, targets: unknown[]) => sameCard(c, (targets as Card[])[0])),
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
  const strengthBonusFn = cdef.strengthBonus as ((...a: unknown[]) => number) | undefined;
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
    type: "breaker-strength",
    req: req(
      (state, side, eid, card, targets) =>
        sameCard(card, (targets as Card[])[0]) &&
        (typeof reqFn === "function" ? reqFn(state, side, eid, card, targets) : !!reqFn),
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
  update(state, side, updated);
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
export function updateAllIcebreakers(): (state: GameState, side: string) => boolean;
export function updateAllIcebreakers(state: GameState, side: string): boolean;
export function updateAllIcebreakers(
  state?: GameState,
  side?: string,
): boolean | ((s: GameState, sd: string) => boolean) {
  if (state === undefined) {
    return (s: GameState, sd: string) => _updateAllIcebreakers(s, sd);
  }
  return _updateAllIcebreakers(state, side!);
}
function _updateAllIcebreakers(state: GameState, side: string): boolean {
  let changed = false;
  for (const ib of allActiveInstalled(state, RUNNER_SIDE).filter((c: Card) =>
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
 * Mirrors: pump. Accepts either (state, side, card, n, duration?) or
 * the shorthand (card, n, duration?) for use inside effect() lambdas
 * where state/side are not available at call time.
 */
export function pump(card: Card, n: number, duration?: string): void;
export function pump(state: GameState, side: string, card: Card, n: number, duration?: string): void;
export function pump(...args: unknown[]): void {
  let state: GameState, side: string, card: Card, n: number, duration: string;
  if (typeof args[1] === "number") {
    // shorthand: (card, n, duration?) — no state, no-op
    return;
  }
  state = args[0] as GameState;
  side = args[1] as string;
  card = args[2] as Card;
  n = args[3] as number;
  duration = (args[4] as string) ?? "end-of-encounter";
  const resolved = getCard(state, card) as Card;
  const floatingEffect = registerLingeringEffect(
    state,
    side,
    resolved,
    "breaker-strength",
    duration,
    req((s: State, sid: Side, eid: EID, c: Card, targets: unknown[]) => sameCard(c, (targets as Card[])[0])),
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
  for (const ib of allActiveInstalled(state, RUNNER_SIDE).filter((c: Card) =>
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
  if (!Array.isArray(cost)) return null;
  const flat = cost.flat();
  const creditCost = flat.find((c: Record<string, unknown> | undefined) => c?.type === "credit");
  if (!creditCost) return null;
  const sv = stealthValue(creditCost as unknown as Costs1Cost);
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
interface BreakSubArgs {
  additionalAbility?: Ability;
  autoBreakSort?: number;
  breakCostBonus?: number | AbilityFn;
  label?: string;
  req?: ReqFn;
  [k: string]: unknown;
}

export function breakSub(
  cost: number | CostData[] | Record<string, unknown>[] | null,
  n: number | NumberFn,
  subtypes?: string | string[] | null,
  args?: BreakSubArgs,
): Ability {
  const costData: Record<string, unknown>[] =
    cost == null
      ? []
      : typeof cost === "number"
        ? [toC("credit", cost) as unknown as Record<string, unknown>]
        : (cost as unknown as Record<string, unknown>[]);
  const subtypeSet: Set<string> = (() => {
    if (typeof subtypes === "string") return new Set([subtypes]);
    if (Array.isArray(subtypes)) return new Set(subtypes);
    return new Set(["All"]);
  })();

  const mergedArgs = { ...args, subtype: subtypeSet, break: n };
  const hasTrashCan = mergeCosts([costData as unknown as CostData[]]).some(
    (c) => (c as unknown as Record<string, unknown> | undefined)?.type === "trash-can",
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
        ![...subtypeSet].some((st: string) => hasSubtype(currentIce, st))
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
      if (args?.req && typeof args.req === "function") {
        return args.req(state, side, eid, card, targets);
      }
      return true;
    }),
    break: n,
    breaks: [...subtypeSet],
    breakCost: costData,
    additionalAbility: args?.additionalAbility,
    autoBreakSort: args?.autoBreakSort,
    breakCostBonus: args?.breakCostBonus,
    label: (() => {
      const customLabel = args?.label;
      if (customLabel) return customLabel;
      const stealthSuffix = addStealthToLabel(costData) ?? "";
      const subTypeStr = !subtypeSet.has("All")
        ? ` ${[...subtypeSet].sort().join(" or ")}`
        : "";
      const nNum = typeof n === "number" ? n : 0;
      const nStr = nNum > 1 ? `up to ` : "";
      const countStr = nNum > 0 ? String(nNum) : "any number of";
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
  const stealthSuffix = addStealthToLabel([costData as unknown as Record<string, unknown>]) ?? "";

  interface StrengthPumpArgs {
    label?: string;
    req?: ReqFn;
    pumpBonus?: number;
    costBonus?: number;
    autoBreakSort?: number;
    autoPumpIgnore?: boolean;
    [k: string]: unknown;
  }
  const sArgs = args as StrengthPumpArgs | undefined;

  return {
    label:
      sArgs?.label ??
      `add ${strength} strength${durationString}${stealthSuffix}`,
    req: req((state, side, eid, card, targets) => {
      const strReq = sArgs?.req;
      if (strReq) {
        if (typeof strReq !== "function") return !!strReq;
        return strReq(state, side, eid, card, targets);
      }
      return true;
    }),
    cost: [costData],
    pump: strength,
    pumpBonus: sArgs?.pumpBonus,
    costBonus: sArgs?.costBonus,
    autoPumpSort: sArgs?.autoBreakSort,
    autoPumpIgnore: sArgs?.autoPumpIgnore,
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
  const adjusted = cost.filter((c) => c?.type !== "x-credits");
  if (adjusted.length === cost.length) return cost;
  return [...adjusted, toC("credit", x * scale) as unknown as Record<string, unknown>];
}

// ---------------------------------------------------------------------------
// breaker-auto-pump
// ---------------------------------------------------------------------------

/**
 * Returns an ability that auto-pumps and auto-breaks icebreakers.
 * Mirrors: breaker-auto-pump (the def value, not the defn)
 */
interface IcebreakerAbility extends Ability {
  dynamic?: string;
  pump?: number;
  break?: number;
  breakReq?: (s: GameState, sd: string, e: EID, c: Card, t: Card[]) => boolean;
  autoPumpIgnore?: boolean;
  autoBreakCredsPerSub?: number;
}

interface PumpCandidate {
  ability: IcebreakerAbility;
  cost: CostData[];
}

export const breakerAutoPump: Ability = {
  silent: true,
  effect: req((state, side, eid, card, targets) => {
    const cdef = getCardDef(card);
    const abilities = (card.abilities as IcebreakerAbility[]) ?? [];
    const abs = abilities.filter(
      (a: IcebreakerAbility) =>
        a.dynamic !== "auto-pump" &&
        a.dynamic !== "auto-pump-and-break",
    );
    const currentIce = getCurrentIce(state);
    if (!currentIce) return;

    // Find pump ability
    const defAbilities = (cdef.abilities as IcebreakerAbility[]) ?? [];
    const canPump = (ability: IcebreakerAbility) => {
      if (!ability.pump) return false;
      const reqFn = ability.req;
      if (reqFn) {
        if (typeof reqFn !== "function") return !!reqFn;
        return reqFn(state, side, eid, card, []);
      }
      return true;
    };

    const pumpCandidates: PumpCandidate[] = defAbilities
      .filter((a: IcebreakerAbility) => !a.autoPumpIgnore)
      .map((ability: IcebreakerAbility): PumpCandidate | null => {
        if (canPump(ability)) {
          const cost = cardAbilityCost(state, side, ability, card, [
            currentIce,
          ]);
          return { ability, cost };
        }
        return null;
      })
      .filter((x): x is PumpCandidate => x !== null);

    const sumCost = (cs: CostData[]): number =>
      cs.reduce((s: number, c: CostData) => s + ((c as unknown as { amount?: number })?.amount ?? 0), 0);

    const pumpAbilityEntry =
      pumpCandidates.length > 0
        ? pumpCandidates.reduce((best: PumpCandidate, entry: PumpCandidate) => {
            return sumCost(entry.cost ?? []) <= sumCost(best.cost ?? []) ? entry : best;
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
    const canBreak = (ability: IcebreakerAbility) => {
      if (!ability.breakReq) return false;
      return ability.breakReq(state, side, eid, card, []);
    };

    const breakAbility = defAbilities.find(canBreak) ?? null;
    const breakCost = breakAbility
      ? breakSubAbilityCost(state, side, breakAbility, card, [currentIce])
      : null;
    const subsBrokenAtOnce = breakAbility ? (breakAbility.break ?? 1) : 0;

    const subs = (currentIce.subroutines as RuntimeSubroutine[]) ?? [];
    const unbrokenSubs = subs.filter((s: RuntimeSubroutine) => !s.broken).length;

    // Check for unbreakable subs
    const noUnbreakableSubs =
      subs.filter((s: RuntimeSubroutine) => {
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
          breakCost as unknown as (Record<string, unknown> | undefined)[],
          unbrokenSubs,
          breakAbility?.autoBreakCredsPerSub ?? 1,
        )
      : null;

    const totalBreakCost =
      adjustedBreakCost && timesBreak > 0
        ? Array(timesBreak).fill(adjustedBreakCost)
        : null;

    const totalCost = mergeCosts([totalPumpCost, totalBreakCost].filter(Boolean) as unknown as CostData[][]);

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

      const newAbs: IcebreakerAbility[] = [...abs];
      if (autoBreakAbility) newAbs.push(autoBreakAbility as IcebreakerAbility);
      if (autoPumpAbility) newAbs.push(autoPumpAbility as IcebreakerAbility);

      update(state, side, { ...card, abilities: newAbs });
    } else {
      update(state, side, { ...card, abilities: abs });
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
  ].map((event: string) => ({ ...breakerAutoPump, event } as Ability));

  return {
    ...cdef,
    events: [...events, ...(cdef.events ?? [])],
  };
}
