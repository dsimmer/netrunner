// Player-initiated actions: ability play, card movement, advance, score, etc.
// Mirrors: src/clj/game/core/actions.clj

import type { GameState, Prompt } from "./state";
import { CORP_SIDE, RUNNER_SIDE, getPlayer, getSidePrompt } from "./state";
import type { Card } from "./card";
import {
  getCard,
  getAdvancementRequirement,
  getAgendaPoints,
  getCounters,
} from "./card";
import type { EID } from "./eid";
import { makeEID, makeEIDFrom, effectCompleted } from "./eid";
import type { Ability } from "./types";
import type { CostData } from "./payment";
import {
  updateAdvancementRequirement,
  updateAllAdvancementRequirements,
  updateAllAgendaPoints,
} from "./agendas";
import { badPublicityAvailable } from "./bad_publicity";
import { installableServers } from "./board";
import { cardDef } from "./card_defs";
import {
  breakSubAbilityCost,
  cardAbilityCost,
  scoreAdditionalCostBonus,
} from "./cost_fns";
import { anyEffects, isDisabledReg } from "./effects";
import {
  abilityAsHandler,
  checkpoint,
  registerOnce,
  registerPendingEvent,
  pay,
  queueEvent,
  resolveAbility,
  triggerEventSimult,
} from "./engine";
import { canAdvance, canScore } from "./flags";
import {
  breakSubroutine,
  getCurrentIce,
  getPumpStrength,
  getStrength,
  pump,
  resolveSubroutine,
  resolveUnbrokenSubsEx as resolveUnbrokenSubs,
  substituteXCreditCosts,
} from "./ice";
const breakSubsEventContext: (...args: unknown[]) => unknown = (..._a: unknown[]) => undefined;

interface HeapBreakerAbility extends Ability {
  "heap-breaker-pump"?: number | "x";
  "heap-breaker-break"?: number | "x";
}

interface AutoBreakAbility extends Ability {
  "auto-pump-ignore"?: boolean;
  "auto-pump-sort"?: number;
  "auto-break-sort"?: number;
  "auto-break-creds-per-sub"?: number;
  "break-req"?: AbilityFn;
  "additional-ability"?: Ability;
  pump?: number;
  break?: number;
  once?: string;
}

import type { AbilityFn, Subroutine } from "./types";
import { cardInit } from "./initializing";
import { move, trash } from "./moving";
import { buildSpendMsg, canPay, mergeCosts, buildCostString } from "./payment";
import { playInstant } from "./play_instants";
import { expend, expendable } from "./expend";
import { removeFromPromptQueue } from "./prompt_state";
import {
  resolveSelect,
  firstPromptByEid,
  firstSelectionByEid,
} from "./prompts";
import { addCounter, addProp, setProp } from "./props";
import { runContinue as continueRun, getRunnableZones } from "./runs";
import { playSfx, systemMsg, implementationMsg, nLastLogs } from "./say";
import { nameZone, zonesToSortedNames } from "./servers";
import { cardStr } from "./to_string";
import { toast } from "./toasts";
import { update } from "./update";
import { continue_ability, req, wait_for } from "../macros";
import {
  dissocIn,
  quantify,
  removeOnce,
  sameCard,
  sameSide,
  serverCards,
  toKeyword,
} from "../utils";

import {
  c,
  doPlayAbility,
  makeAbilityEID,
  noBlockingOrPreventPrompt,
  play,
  playAbility,
  playAutoPump,
  playHeapBreakerAutoPumpAndBreakImpl,
  side_,
  sumCostAmount,
} from "./actions_1";

/** Mirrors `play-heap-breaker-auto-pump-and-break`. */
export function playHeapBreakerAutoPumpAndBreak(
  state: GameState,
  side: string,
  args: { card: Card },
): void {
  const card = getCard(state, args.card);
  if (!card) return;
  const eid = makeAbilityEID(state, card);
  const currentIce = getCurrentIce(state);
  if (!currentIce) return;

  const canPump = (ability: HeapBreakerAbility): boolean => {
    if (!ability["heap-breaker-pump"]) return false;
    if (
      anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
        ability,
      ] as unknown as Card[])
    ) {
      return false;
    }
    const reqFn = ability.req;
    if (typeof reqFn === "function") {
      return reqFn(state, side, eid, card, null);
    }
    return reqFn !== false;
  };

  const breakerAbility = ((cardDef(card).abilities ?? []) as HeapBreakerAbility[]).find(
    canPump,
  );
  const pumpStrengthAtOnce = breakerAbility?.["heap-breaker-pump"] ?? null;
  const subsBrokenAtOnce = breakerAbility?.["heap-breaker-break"] ?? null;

  const ciStrength = getStrength(currentIce);
  const cardStrength = getStrength(card);
  const strengthDiff =
    ciStrength != null && cardStrength != null
      ? Math.max(0, ciStrength - cardStrength)
      : null;
  const subroutines: Subroutine[] = (currentIce.subroutines as Subroutine[] | undefined) ?? [];
  const unbrokenSubs = subroutines.filter((s: Subroutine) => !s.broken).length;
  const xNumber =
    strengthDiff != null && unbrokenSubs != null
      ? Math.max(strengthDiff, unbrokenSubs)
      : null;
  const xBreaker = pumpStrengthAtOnce === "x";

  const pumpsNeeded =
    strengthDiff != null && pumpStrengthAtOnce != null
      ? xBreaker
        ? 1
        : Math.ceil(strengthDiff / (pumpStrengthAtOnce as number))
      : null;
  const breaksNeeded =
    unbrokenSubs != null && subsBrokenAtOnce != null
      ? xBreaker
        ? 1
        : Math.ceil(unbrokenSubs / (subsBrokenAtOnce as number))
      : null;
  const abilityUsesNeeded =
    pumpsNeeded != null && breaksNeeded != null
      ? xBreaker
        ? 1
        : pumpsNeeded + breaksNeeded + (pumpsNeeded > 0 ? -1 : 0)
      : null;

  const totalCost: CostData[] | null =
    breakerAbility && abilityUsesNeeded != null
      ? xBreaker
        ? [c("credit", xNumber as number)]
        : new Array(abilityUsesNeeded).fill(breakerAbility.cost).flat()
      : null;

  if (
    !breakerAbility ||
    !canPay(state, side, eid, card, card.title ?? "", totalCost)
  )
    return;

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: { asyncResult?: { msg?: string } }) {
        if (xBreaker) {
          pump(s, side, getCard(s, card) as Card, xNumber as number);
        } else {
          pump(
            s,
            side,
            getCard(s, card) as Card,
            (pumpStrengthAtOnce as number) * (abilityUsesNeeded as number),
          );
        }
        const paymentStr = binds.asyncResult?.msg as string;
        const subGroupsToBreak: Subroutine[][] =
          typeof subsBrokenAtOnce === "number" && subsBrokenAtOnce > 0
            ? partition(
                subsBrokenAtOnce,
                subroutines.filter((x: Subroutine) => !x.broken),
              ) as Subroutine[][]
            : [subroutines.filter((x: Subroutine) => !x.broken)];
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: unknown) {
              systemMsg(
                s2,
                side,
                `${buildSpendMsg(paymentStr, "increase")}the strength of ${card.title} to ${getStrength(getCard(s2, card))} and break all subroutines on ${currentIce.title}`,
              );
              continueRun(s2, side, null);
            },
          ],
          [
            resolveAbility,
            s,
            side,
            playHeapBreakerAutoPumpAndBreakImpl(
              s,
              side,
              subGroupsToBreak,
              currentIce,
            ),
            card,
            null,
          ],
          { eid },
        );
      },
    ],
    [pay, state, side, makeEIDFrom(state, eid), card, totalCost],
    { eid },
  );
}

/** Mirrors `play-auto-pump-and-break-impl` (returns ability map). */
function playAutoPumpAndBreakImpl(
  state: GameState,
  side: string,
  paymentEid: EID,
  subGroupsToBreak: Subroutine[][],
  currentIce: Card,
  breakAbility: AutoBreakAbility,
): Ability {
  return {
    async: true,
    effect: function (s: GameState, _side: string, eid: EID, card: Card | null, _targets: unknown[]) {
      const subsToBreak = subGroupsToBreak[0];
      const rest = subGroupsToBreak.slice(1);
      for (const sub of subsToBreak) {
        breakSubroutine(getCard(s, currentIce) as Card, sub, card);
      }
      const ice = getCard(s, currentIce);
      const onBreakSubs = ice
        ? (cardDef(currentIce)["on-break-subs"] as Ability | undefined)
        : null;
      const eventArgs = onBreakSubs
        ? { "card-abilities": abilityAsHandler(ice as Card, onBreakSubs) }
        : null;
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e2: EID, _b: unknown) {
            wait_for(
              s2,
              [
                { asyncResult: "result" },
                function (s3: GameState, _e3: EID, _b3: unknown) {
                  if (rest.length === 0) {
                    effectCompleted(s3, side, eid);
                  } else {
                    continue_ability(
                      s3,
                      side,
                      playAutoPumpAndBreakImpl(
                        s3,
                        side,
                        paymentEid,
                        rest,
                        currentIce,
                        breakAbility,
                      ),
                      card,
                      null,
                    );
                  }
                },
              ],
              [
                triggerEventSimult,
                s2,
                side,
                "subroutines-broken",
                eventArgs,
                breakSubsEventContext(s2, ice as Card, subsToBreak, card),
              ],
              { eid },
            );
          },
        ],
        [
          resolveAbility,
          s,
          side,
          {
            ...breakAbility["additional-ability"],
            eid: makeEIDFrom(s, paymentEid),
          } as Ability,
          getCard(s, card),
          null,
        ],
        { eid },
      );
    },
  };
}

/** Returns successive subsequences of size n. Mirrors `(partition n n nil coll)`. */
function partition<T>(n: number, coll: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < coll.length; i += n) out.push(coll.slice(i, i + n));
  return out;
}

/** Mirrors `play-auto-pump-and-break`. */
export function playAutoPumpAndBreak(
  state: GameState,
  side: string,
  args: { card: Card },
): void {
  const baseCard = getCard(state, args.card);
  if (!baseCard) return;
  const baseAbilities: AutoBreakAbility[] = (cardDef(baseCard).abilities ?? []) as AutoBreakAbility[];
  if (baseAbilities.some((a: AutoBreakAbility) => (a as HeapBreakerAbility)["heap-breaker-break"])) {
    playHeapBreakerAutoPumpAndBreak(state, side, args);
    return;
  }

  const card = baseCard;
  const eid = makeAbilityEID(state, card);
  const currentIce = getCurrentIce(state);
  if (!currentIce) return;

  type CandidatePair = [AutoBreakAbility, CostData[]];

  // Pump
  const canPump = (ability: AutoBreakAbility): boolean => {
    if (!ability.pump) return false;
    const reqFn = ability.req;
    if (typeof reqFn === "function") return reqFn(state, side, eid, card, null);
    return reqFn !== false;
  };
  const pumpCandidates: CandidatePair[] = baseAbilities
    .filter((a: AutoBreakAbility) => !a["auto-pump-ignore"])
    .flatMap((a: AutoBreakAbility) => {
      if (!canPump(a)) return [];
      return [[a, cardAbilityCost(state, side, a, card, currentIce ? [currentIce] : [])] as CandidatePair];
    });
  let pumpAbility: Ability | undefined;
  let pumpCost: CostData[] | undefined;
  if (pumpCandidates.length > 0) {
    pumpCandidates.sort(
      (a: CandidatePair, b: CandidatePair) =>
        (a[0]["auto-pump-sort"] ?? 0) - (b[0]["auto-pump-sort"] ?? 0),
    );
    const best = pumpCandidates.reduce((acc: CandidatePair, cur: CandidatePair) =>
      sumCostAmount(cur[1]) < sumCostAmount(acc[1]) ? cur : acc,
    );
    pumpAbility = best[0];
    pumpCost = best[1];
  }
  const pumpStrength = pumpAbility
    ? getPumpStrength(state, side, pumpAbility, card)
    : 0;
  const ciStrength = getStrength(currentIce);
  const cardStrength = getStrength(card);
  const strengthDiff =
    ciStrength != null && cardStrength != null
      ? Math.max(0, ciStrength - cardStrength)
      : null;
  const timesPump =
    strengthDiff != null && pumpStrength > 0
      ? Math.ceil(strengthDiff / pumpStrength)
      : 0;
  const totalPumpCost: CostData[] | null =
    pumpAbility && timesPump > 0
      ? new Array(timesPump).fill(pumpCost).flat()
      : null;

  // Break
  const canBreak = (ability: AutoBreakAbility): boolean => {
    if (!ability["break-req"]) return false;
    if (
      anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
        ability,
      ] as unknown as Card[])
    ) {
      return false;
    }
    const breakReq = ability["break-req"]!;
    return breakReq(state, side, eid, card, null);
  };
  const breakCandidates: CandidatePair[] = baseAbilities.flatMap((a: AutoBreakAbility) => {
    if (!canBreak(a)) return [];
    return [[a, breakSubAbilityCost(state, side, a, card, currentIce ? [currentIce] : [])] as CandidatePair];
  });
  let breakAbility: AutoBreakAbility | undefined;
  let breakCost: CostData[] | undefined;
  if (breakCandidates.length > 0) {
    breakCandidates.sort(
      (a: CandidatePair, b: CandidatePair) =>
        (a[0]["auto-break-sort"] ?? 0) - (b[0]["auto-break-sort"] ?? 0),
    );
    const best = breakCandidates.reduce((acc: CandidatePair, cur: CandidatePair) =>
      sumCostAmount(cur[1]) < sumCostAmount(acc[1]) ? cur : acc,
    );
    breakAbility = best[0];
    breakCost = best[1];
  }
  const onceKey = breakAbility?.once;
  const subsBrokenAtOnce = breakAbility ? (breakAbility.break ?? 1) : null;
  const subroutines: Subroutine[] = (currentIce.subroutines as Subroutine[] | undefined) ?? [];
  const unbrokenSubsCount =
    subroutines.length > 0 ? subroutines.filter((s: Subroutine) => !s.broken).length : null;
  const someAlreadyBroken = unbrokenSubsCount !== subroutines.length;
  const timesBreak =
    unbrokenSubsCount != null && subsBrokenAtOnce != null
      ? subsBrokenAtOnce > 0
        ? Math.ceil(unbrokenSubsCount / subsBrokenAtOnce)
        : 1
      : null;
  const adjustedBreakCost = substituteXCreditCosts(
    (breakCost ?? []) as unknown as (Record<string, unknown> | undefined)[],
    unbrokenSubsCount ?? undefined,
    breakAbility ? (breakAbility["auto-break-creds-per-sub"] ?? undefined) : undefined,
  );
  const totalBreakCost: CostData[] | null =
    adjustedBreakCost && timesBreak != null
      ? new Array(timesBreak).fill(adjustedBreakCost).flat()
      : null;
  const totalCost = mergeCosts([
    ...(totalPumpCost ?? []),
    ...(totalBreakCost ?? []),
  ]);

  if (
    !breakAbility ||
    !canPay(state, side, eid, card, card.title ?? "", totalCost)
  ) {
    return;
  }

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: { asyncResult?: EID & { msg?: string } }) {
        for (let i = 0; i < timesPump; i++) {
          const ab = { ...(pumpAbility as Ability) } as Ability & Record<string, unknown>;
          delete ab.cost;
          delete ab.msg;
          resolveAbility(s, side, ab, getCard(s, card), null);
        }
        const paymentEid = binds.asyncResult as EID & { msg?: string };
        const paymentStr = paymentEid?.msg as string;
        const subGroupsToBreak: Subroutine[][] =
          (subsBrokenAtOnce as number) > 0
            ? (partition(
                subsBrokenAtOnce as number,
                subroutines.filter((x: Subroutine) => !x.broken),
              ) as Subroutine[][])
            : [subroutines.filter((x: Subroutine) => !x.broken)];
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: unknown) {
              if (timesPump > 0) {
                systemMsg(
                  s2,
                  side,
                  `${buildSpendMsg(paymentStr, "increase")}the strength of ${card.title} to ${getStrength(getCard(s2, card))} and break all ${(unbrokenSubsCount as number) > 1 ? unbrokenSubsCount : ""} subroutines on ${currentIce.title}`,
                );
              } else {
                systemMsg(
                  s2,
                  side,
                  `${buildSpendMsg(paymentStr, "use")}${card.title} to break ${someAlreadyBroken ? "the remaining " : "all "}${unbrokenSubsCount} subroutines on ${currentIce.title}`,
                );
              }
              if (onceKey)
                registerOnce(s2, side, { once: onceKey }, card);
              continueRun(s2, side, null);
            },
          ],
          [
            resolveAbility,
            s,
            side,
            playAutoPumpAndBreakImpl(
              s,
              side,
              paymentEid,
              subGroupsToBreak,
              currentIce,
              breakAbility as Ability,
            ),
            card,
            null,
          ],
          { eid },
        );
      },
    ],
    [pay, state, side, makeEIDFrom(state, eid), card, totalCost],
    { eid },
  );
}

// ---------------------------------------------------------------------------
// Dynamic abilities
// ---------------------------------------------------------------------------

const dynamicAbilities: Record<
  string,
  (state: GameState, side: string, args: { card: Card } & Record<string, unknown>) => void
> = {
  "auto-pump": playAutoPump as (state: GameState, side: string, args: { card: Card } & Record<string, unknown>) => void,
  "auto-pump-and-break": playAutoPumpAndBreak as (state: GameState, side: string, args: { card: Card } & Record<string, unknown>) => void,
};

/** Mirrors `play-dynamic-ability`. */
export function playDynamicAbility(
  state: GameState,
  side: string,
  args: { dynamic: string } & Record<string, unknown>,
): void {
  if (noBlockingOrPreventPrompt(state, side)) {
    const fn = dynamicAbilities[args.dynamic];
    if (fn) fn(state, toKeyword(side), args as unknown as { card: Card } & Record<string, unknown>);
  } else {
    toast(
      state,
      side,
      "You cannot play abilities while other abilities are resolving.",
      "warning",
    );
  }
}

// ---------------------------------------------------------------------------
// corp/runner card cross-side abilities
// ---------------------------------------------------------------------------

/** Mirrors `play-corp-ability`. */
export function playCorpAbility(
  state: GameState,
  side: string,
  args: { card: Card; ability: number },
): void;
export function playCorpAbility(
  state: GameState,
  side: string,
  eid: EID | null,
  args: { card: Card; ability: number },
): void;
export function playCorpAbility(
  state: GameState,
  side: string,
  eidOrArgs: EID | null | { card: Card; ability: number },
  maybeArgs?: { card: Card; ability: number },
): void {
  const eid = (maybeArgs ? eidOrArgs : null) as EID | null;
  const args = (maybeArgs ?? eidOrArgs) as { card: Card; ability: number };
  const card = getCard(state, args.card);
  if (!card) return;
  const cdef = cardDef(card);
  const abilityIdx = args.ability;
  const corpAbs = (cdef.corpAbilities ?? cdef["corp-abilities"] ?? []) as Ability[];
  const ability = corpAbs[abilityIdx];
  const cannotPlay =
    card.disabled === true ||
    anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
      ability,
      abilityIdx,
    ] as unknown as Card[]);
  if (cannotPlay) return;
  doPlayAbility(state, side, eid, {
    ability,
    card,
    abilityIdx,
    targets: null,
  });
}

/** Mirrors `play-runner-ability`. */
export function playRunnerAbility(
  state: GameState,
  side: string,
  args: { card: Card; ability: number; targets?: unknown[] },
): void;
export function playRunnerAbility(
  state: GameState,
  side: string,
  eid: EID | null,
  args: { card: Card; ability: number; targets?: unknown[] },
): void;
export function playRunnerAbility(
  state: GameState,
  side: string,
  eidOrArgs: EID | null | { card: Card; ability: number; targets?: unknown[] },
  maybeArgs?: { card: Card; ability: number; targets?: unknown[] },
): void {
  const eid = (maybeArgs ? eidOrArgs : null) as EID | null;
  const args = (maybeArgs ?? eidOrArgs) as {
    card: Card;
    ability: number;
    targets?: unknown[];
  };
  const card = getCard(state, args.card);
  if (!card) return;
  const cdef = cardDef(card);
  const abilityIdx = args.ability;
  const runnerAbs = (cdef.runnerAbilities ?? cdef["runner-abilities"] ?? []) as Ability[];
  const ability = runnerAbs[abilityIdx];
  const cannotPlay =
    card.disabled === true ||
    anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
      ability,
      abilityIdx,
    ] as unknown as Card[]);
  if (cannotPlay) return;
  doPlayAbility(state, side, eid, {
    card,
    ability,
    abilityIdx,
    targets: args.targets ?? null,
  });
}

// ---------------------------------------------------------------------------
// Subroutines
// ---------------------------------------------------------------------------

/** Mirrors `play-subroutine`. */
export function playSubroutine(
  state: GameState,
  side: string,
  args: { card: Card; subroutine: number },
): void {
  if (noBlockingOrPreventPrompt(state, side)) {
    const card = getCard(state, args.card);
    const sub = card
      ? ((card.subroutines ?? [])[args.subroutine] ?? null)
      : null;
    if (card && sub) resolveSubroutine(card, sub);
  } else {
    toast(
      state,
      side,
      "You cannot fire subroutines while abilities are being resolved.",
      "warning",
    );
  }
}

/** Mirrors `play-unbroken-subroutines`. */
export function playUnbrokenSubroutines(
  state: GameState,
  side: string,
  args: { card: Card },
): void {
  if (noBlockingOrPreventPrompt(state, side)) {
    const card = getCard(state, args.card);
    if (card) resolveUnbrokenSubs(state, side, card);
  } else {
    toast(
      state,
      side,
      "You cannot fire subroutines while abilities are being resolved.",
      "warning",
    );
  }
}

// ---------------------------------------------------------------------------
// Corp actions
// ---------------------------------------------------------------------------

/** Click to trash a resource. Mirrors `trash-resource`. */
export function trashResource(
  state: GameState,
  side: string,
  _: unknown,
): void {
  const basic = state.corp.basicActionCard;
  if (!basic) return;
  playAbility(state, side, { card: basic, ability: 5 });
}

/** Purge viruses. Mirrors `do-purge`. */
export function doPurge(state: GameState, side: string, _: unknown): void {
  const basic = state.corp.basicActionCard;
  if (!basic) return;
  playAbility(state, side, { card: basic, ability: 6 });
}

/** Click to advance an installed card. Mirrors `click-advance`. */
export function clickAdvance(
  state: GameState,
  side: string,
  ctx: { card: Card } & Record<string, unknown>,
): void {
  const card = getCard(state, ctx.card);
  if (!card) return;
  const context = { ...ctx, card };
  if (canAdvance(state, side, card)) {
    const basic = state.corp.basicActionCard;
    if (!basic) return;
    playAbility(state, side, { card: basic, ability: 4, targets: [context] });
  } else {
    toast(state, CORP_SIDE, "Cannot advance cards this turn.", "warning");
  }
}

// ---------------------------------------------------------------------------
// Runner actions
// ---------------------------------------------------------------------------

/** Click to start a run. Mirrors `click-run`. */
export function clickRun(state: GameState, side: string, ctx: unknown): void {
  const basic = state.runner.basicActionCard;
  if (!basic) return;
  playAbility(state, side, { card: basic, ability: 4, targets: [ctx] });
}

/** Click to remove a tag. Mirrors `remove-tag`. */
export function removeTag(state: GameState, side: string, _: unknown): void {
  const basic = state.runner.basicActionCard;
  if (!basic) return;
  playAbility(state, side, { card: basic, ability: 5 });
}

interface SideViewBag {
  viewDeck?: boolean;
}

interface CorpInstallBag {
  installList?: string[];
}

interface RunnerRunnableBag {
  runnableList?: string[];
}

/** View deck. Mirrors `view-deck`. */
export function viewDeck(state: GameState, side: string, _: unknown): void {
  systemMsg(state, side, "looks at [their] deck");
  (side_(state, side) as unknown as SideViewBag).viewDeck = true;
}

/** Close deck view. Mirrors `close-deck`. */
export function closeDeck(state: GameState, side: string, _: unknown): void {
  systemMsg(state, side, "stops looking at [their] deck");
  delete (side_(state, side) as unknown as SideViewBag).viewDeck;
}

// ---------------------------------------------------------------------------
// Install / runnable lists
// ---------------------------------------------------------------------------

/** Mirrors `generate-install-list`. */
export function generateInstallList(
  state: GameState,
  _side: unknown,
  args: { card: Card | null },
): void {
  const card = args.card ? getCard(state, args.card) : null;
  const corpExt = state.corp as unknown as CorpInstallBag;
  if (card) {
    if (expendable(state, card)) {
      corpExt.installList = [
        ...installableServers(state, card),
        "Expend",
      ];
    } else {
      corpExt.installList = installableServers(state, card);
    }
  } else {
    delete corpExt.installList;
  }
}

/** Mirrors `generate-runnable-zones`. */
export function generateRunnableZones(
  state: GameState,
  _side: unknown,
  _args: unknown,
): void {
  (state.runner as unknown as RunnerRunnableBag).runnableList = zonesToSortedNames(
    getRunnableZones(state),
  );
}

// ---------------------------------------------------------------------------
// Advance / score
// ---------------------------------------------------------------------------

/**
 * Advance a corp card that can be advanced. If no-cost is truthy, advances
 * for free (used by the card Success). Mirrors `advance`.
 */
export function advance(
  state: GameState,
  side: string,
  args: { card: Card },
): void;
export function advance(
  state: GameState,
  side: string,
  card: Card,
  noCost: boolean,
): void;
export function advance(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  noCost: boolean,
): void;
export function advance(
  state: GameState,
  side: string,
  a: { card: Card } | EID | Card,
  b?: Card | boolean,
  c2?: boolean,
): void {
  let eid: EID;
  let card: Card | null;
  let noCost: boolean | undefined;
  if (b === undefined) {
    eid = makeEID(state);
    card = getCard(state, (a as { card: Card }).card);
    noCost = false;
  } else if (c2 === undefined) {
    eid = makeEID(state);
    card = getCard(state, a as Card);
    noCost = b as boolean;
  } else {
    eid = a as EID;
    card = getCard(state, b as Card);
    noCost = c2;
  }
  if (!card) {
    effectCompleted(state, side, eid);
    return;
  }
  (eid as EID & { sourceType?: string }).sourceType = "advance";

  if (canAdvance(state, side, card)) {
    const payEid = makeEIDFrom(state, eid) as EID & { action?: string };
    payEid.action = "corp-advance";
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _e: EID, binds: { asyncResult?: { msg?: string } }) {
          const paymentStr = binds.asyncResult?.msg as string;
          if (paymentStr) {
            systemMsg(
              s,
              side,
              `${buildSpendMsg(paymentStr, "advance")}${cardStr(s, card)}`,
            );
            updateAdvancementRequirement(s, card as Card);
            wait_for(
              s,
              [
                { asyncResult: "result" },
                function (s2: GameState, _e2: EID, _b2: unknown) {
                  playSfx(s2, side, "click-advance");
                  effectCompleted(s2, side, eid);
                },
              ],
              [
                addProp,
                s,
                side,
                getCard(s, card as Card),
                "advance-counter",
                1,
              ],
              { eid },
            );
          } else {
            effectCompleted(s, side, eid);
          }
        },
      ],
      [
        pay,
        state,
        side,
        payEid,
        card,
        c("click", noCost ? 0 : 1),
        c("credit", noCost ? 0 : 1),
      ],
      { eid },
    );
  } else {
    effectCompleted(state, side, eid);
  }
}

/** Mirrors `resolve-score`. */
export function resolveScore(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  args: {
    advancementTokens?: number;
    advancementRequirement?: number;
    "advancement-tokens"?: number;
    "advancement-requirement"?: number;
  },
): void {
  const advancementTokens =
    args.advancementTokens ?? args["advancement-tokens"];
  const advancementRequirement =
    args.advancementRequirement ?? args["advancement-requirement"];

  const moved = move(state, CORP_SIDE, card, "scored") as unknown as Card;
  const initialised = cardInit(state, CORP_SIDE, moved, {
    "resolve-effect": false,
    "init-data": true,
  } as unknown as Parameters<typeof cardInit>[3]) as unknown as Card;
  updateAllAdvancementRequirements(state);
  updateAllAgendaPoints(state);
  const c2 = getCard(state, initialised) as Card;
  const points = getAgendaPoints(c2);

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: unknown) {
        systemMsg(
          s,
          CORP_SIDE,
          `scores ${c2.title} and gains ${quantify(points, "agenda point")}`,
        );
        implementationMsg(s, card);
        setProp(s, CORP_SIDE, getCard(s, c2) as Card, "advance-counter", 0);
        const reg = (s.corp.register ?? {}) as Record<string, unknown>;
        reg["scored-agenda"] = ((reg["scored-agenda"] as number) ?? 0) + points;
        s.corp.register = reg;
        playSfx(s, side, "agenda-score");
        const onScore =
          (cardDef(c2)["on-score"] ?? cardDef(c2).onScore) as Ability | undefined;
        if (onScore) registerPendingEvent(s, "agenda-scored", c2, onScore);
        queueEvent(s, "agenda-scored", {
          card: c2,
          "scored-card": card,
          "advancement-requirement": advancementRequirement,
          "advancement-tokens": advancementTokens,
          points,
        });
        checkpoint(s, null, eid, { duration: "agenda-scored" } as unknown as Parameters<typeof checkpoint>[3]);
      },
    ],
    [
      triggerEventSimult,
      state,
      side,
      "pre-agenda-scored",
      null,
      {
        card: c2,
        "scored-card": card,
        "advancement-requirement": advancementRequirement,
        "advancement-tokens": advancementTokens,
        points,
      },
    ],
    { eid },
  );
}

interface ScoreOpts {
  noReq?: boolean;
  ignoreTurn?: boolean;
  ignoreAdv?: boolean;
  [k: string]: unknown;
}

/** Score an agenda. Mirrors `score`. */
export function score(eid: EID, card: Card | null, opts?: ScoreOpts): void;
export function score(state: GameState, side: string, eid: EID, card: Card): void;
export function score(state: GameState, side: string, eid: EID, card: Card, opts: ScoreOpts | null): void;
export function score(...rawArgs: unknown[]): void {
  // shorthand (eid, card, opts?) — no state, no-op
  const arg0 = rawArgs[0] as { id?: unknown; title?: unknown } | null;
  if (rawArgs.length <= 3 && arg0 && "id" in arg0 && !("title" in arg0)) {
    return;
  }
  const state = rawArgs[0] as GameState;
  const side = rawArgs[1] as string;
  const eid = rawArgs[2] as EID;
  const card = rawArgs[3] as Card;
  const opts = (rawArgs[4] as ScoreOpts | null | undefined) ?? undefined;
  if (!card) return;
  void opts;
  const noReq = opts?.noReq ?? false;
  const ignoreTurn = opts?.ignoreTurn ?? false;
  const ignoreAdv = opts?.ignoreAdv ?? false;

  if (!canScore(state, side, card, { noReq, ignoreTurn } as { noReq?: boolean; ignoreTurn?: boolean })) {
    effectCompleted(state, side, eid);
    return;
  }

  const cost = scoreAdditionalCostBonus(state, side, card);
  const advCost =
    noReq || ignoreAdv ? 0 : (getAdvancementRequirement(card) ?? 0);
  const advTokens = getCounters(card, "advancement");
  const costStrs = buildCostString(cost);
  const additionalEid = makeEIDFrom(state, {
    ...eid,
    additionalCosts: cost,
  } as EID & { additionalCosts?: CostData[] });
  const canPayResult = canPay(
    state,
    side,
    additionalEid,
    card,
    card.title ?? "",
    cost,
  );

  if (!costStrs || costStrs.trim() === "") {
    resolveScore(state, side, eid, card, {
      advancementRequirement: advCost,
      advancementTokens: advTokens,
    });
    return;
  }
  if (!canPayResult) {
    effectCompleted(state, side, eid);
    return;
  }

  const payEid = makeEIDFrom(state, eid) as EID & {
    additionalCosts?: CostData[];
    source?: Card;
    sourceType?: string;
  };
  payEid.additionalCosts = cost;
  payEid.source = card;
  payEid.sourceType = "corp-score";
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: { asyncResult?: { msg?: string } }) {
        const paymentResult = binds.asyncResult;
        const msg = paymentResult?.msg as string;
        if (!msg || msg.trim() === "") {
          effectCompleted(s, side, eid);
        } else {
          systemMsg(s, side, `${msg} to score ${card.title}`);
          resolveScore(s, side, eid, card, {
            advancementRequirement: advCost,
            advancementTokens: advTokens,
          });
        }
      },
    ],
    [pay, state, side, payEid, card, cost],
    { eid },
  );
}
