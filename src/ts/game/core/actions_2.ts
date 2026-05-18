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
import type { Ability } from "./types.ts";
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
const breakSubsEventContext: any = (..._a: any[]) => undefined;
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

  const canPump = (ability: Ability): boolean => {
    if (!(ability as any)["heap-breaker-pump"]) return false;
    if (
      anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
        ability as any,
      ])
    ) {
      return false;
    }
    const reqFn = (ability as any).req ?? (() => true);
    return reqFn(state, side, eid, card, null);
  };

  const breakerAbility = ((cardDef(card) as any).abilities ?? []).find(
    canPump,
  ) as Ability | undefined;
  const pumpStrengthAtOnce = breakerAbility
    ? (breakerAbility as any)["heap-breaker-pump"]
    : null;
  const subsBrokenAtOnce = breakerAbility
    ? (breakerAbility as any)["heap-breaker-break"]
    : null;

  const ciStrength = getStrength(currentIce);
  const cardStrength = getStrength(card);
  const strengthDiff =
    ciStrength != null && cardStrength != null
      ? Math.max(0, ciStrength - cardStrength)
      : null;
  const subroutines: any[] = (currentIce as any).subroutines ?? [];
  const unbrokenSubs = subroutines.filter((s) => !s.broken).length;
  const xNumber =
    strengthDiff != null && unbrokenSubs != null
      ? Math.max(strengthDiff, unbrokenSubs)
      : null;
  const xBreaker = pumpStrengthAtOnce === "x";

  const pumpsNeeded =
    strengthDiff != null && pumpStrengthAtOnce != null
      ? xBreaker
        ? 1
        : Math.ceil(strengthDiff / pumpStrengthAtOnce)
      : null;
  const breaksNeeded =
    unbrokenSubs != null && subsBrokenAtOnce != null
      ? xBreaker
        ? 1
        : Math.ceil(unbrokenSubs / subsBrokenAtOnce)
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
        : new Array(abilityUsesNeeded).fill((breakerAbility as any).cost).flat()
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
      function (s: GameState, _e: EID, binds: any) {
        if (xBreaker) {
          pump(s, side, getCard(s, card) as Card, xNumber as number);
        } else {
          pump(
            s,
            side,
            getCard(s, card) as Card,
            pumpStrengthAtOnce * (abilityUsesNeeded as number),
          );
        }
        const paymentStr = (binds.asyncResult as any)?.msg as string;
        const subGroupsToBreak: any[][] =
          typeof subsBrokenAtOnce === "number" && subsBrokenAtOnce > 0
            ? partition(
                subsBrokenAtOnce,
                subroutines.filter((x) => !x.broken),
              )
            : [subroutines.filter((x) => !x.broken)];
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: any) {
              systemMsg(
                s2,
                side,
                `${buildSpendMsg(paymentStr, "increase")}the strength of ${card.title} to ${getStrength(getCard(s2, card))} and break all subroutines on ${(currentIce as any).title}`,
              );
              continueRun(s2, side, null as any);
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
  subGroupsToBreak: any[][],
  currentIce: Card,
  breakAbility: Ability,
): Ability {
  return {
    async: true,
    effect: function (s: any, _side: any, eid: any, card: any, _targets: any) {
      const subsToBreak = subGroupsToBreak[0];
      const rest = subGroupsToBreak.slice(1);
      for (const sub of subsToBreak) {
        breakSubroutine(getCard(s, currentIce) as Card, sub, card);
      }
      const ice = getCard(s, currentIce);
      const onBreakSubs = ice
        ? (cardDef(currentIce) as any)["on-break-subs"]
        : null;
      const eventArgs = onBreakSubs
        ? { "card-abilities": abilityAsHandler(ice as Card, onBreakSubs) }
        : null;
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e2: EID, _b: any) {
            wait_for(
              s2,
              [
                { asyncResult: "result" },
                function (s3: GameState, _e3: EID, _b3: any) {
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
                      null as any,
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
            ...(breakAbility as any)["additional-ability"],
            eid: makeEIDFrom(s, paymentEid),
          } as Ability,
          getCard(s, card),
          null,
        ],
        { eid },
      );
    },
  } as any;
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
  const baseAbilities: Ability[] = ((cardDef(baseCard) as any).abilities ??
    []) as Ability[];
  if (baseAbilities.some((a) => (a as any)["heap-breaker-break"])) {
    playHeapBreakerAutoPumpAndBreak(state, side, args);
    return;
  }

  const card = baseCard;
  const eid = makeAbilityEID(state, card);
  const currentIce = getCurrentIce(state);
  if (!currentIce) return;

  // Pump
  const canPump = (ability: Ability): boolean => {
    if (!(ability as any).pump) return false;
    return ((ability as any).req as Function)(state, side, eid, card, null);
  };
  const pumpCandidates = baseAbilities
    .filter((a) => !(a as any)["auto-pump-ignore"])
    .flatMap((a) => {
      if (!canPump(a)) return [];
      return [
        [a, cardAbilityCost(state, side, a, card, currentIce as any)] as [
          Ability,
          CostData[],
        ],
      ];
    });
  let pumpAbility: Ability | undefined;
  let pumpCost: CostData[] | undefined;
  if (pumpCandidates.length > 0) {
    pumpCandidates.sort(
      (a: any, b: any) =>
        ((a[0] as any)["auto-pump-sort"] ?? 0) -
        ((b[0] as any)["auto-pump-sort"] ?? 0),
    );
    const best = pumpCandidates.reduce((acc: any, cur: any) =>
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
  const canBreak = (ability: Ability): boolean => {
    if (!(ability as any)["break-req"]) return false;
    if (
      anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
        ability as any,
      ])
    ) {
      return false;
    }
    return ((ability as any)["break-req"] as Function)(
      state,
      side,
      eid,
      card,
      null,
    );
  };
  const breakCandidates = baseAbilities.flatMap((a) => {
    if (!canBreak(a)) return [];
    return [
      [a, breakSubAbilityCost(state, side, a, card, currentIce ? [currentIce] : [])] as [
        Ability,
        CostData[],
      ],
    ];
  });
  let breakAbility: Ability | undefined;
  let breakCost: CostData[] | undefined;
  if (breakCandidates.length > 0) {
    breakCandidates.sort(
      (a: any, b: any) =>
        ((a[0] as any)["auto-break-sort"] ?? 0) -
        ((b[0] as any)["auto-break-sort"] ?? 0),
    );
    const best = breakCandidates.reduce((acc: any, cur: any) =>
      sumCostAmount(cur[1]) < sumCostAmount(acc[1]) ? cur : acc,
    );
    breakAbility = best[0];
    breakCost = best[1];
  }
  const onceKey = breakAbility ? (breakAbility as any).once : undefined;
  const subsBrokenAtOnce = breakAbility
    ? ((breakAbility as any).break ?? 1)
    : null;
  const subroutines: any[] = (currentIce as any).subroutines ?? [];
  const unbrokenSubsCount =
    subroutines.length > 0 ? subroutines.filter((s) => !s.broken).length : null;
  const someAlreadyBroken = unbrokenSubsCount !== subroutines.length;
  const timesBreak =
    unbrokenSubsCount != null && subsBrokenAtOnce != null
      ? subsBrokenAtOnce > 0
        ? Math.ceil(unbrokenSubsCount / subsBrokenAtOnce)
        : 1
      : null;
  const adjustedBreakCost = substituteXCreditCosts(
    breakCost as any,
    unbrokenSubsCount as any,
    breakAbility ? (breakAbility as any)["auto-break-creds-per-sub"] : null,
  );
  const totalBreakCost: CostData[] | null =
    adjustedBreakCost && timesBreak != null
      ? new Array(timesBreak).fill(adjustedBreakCost).flat()
      : null;
  const totalCost = mergeCosts([
    ...(totalPumpCost ?? []),
    ...(totalBreakCost ?? []),
  ] as any);

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
      function (s: GameState, _e: EID, binds: any) {
        for (let i = 0; i < timesPump; i++) {
          const ab = { ...(pumpAbility as Ability) };
          delete (ab as any).cost;
          delete (ab as any).msg;
          resolveAbility(s, side, ab, getCard(s, card), null as any);
        }
        const paymentEid = binds.asyncResult as EID;
        const paymentStr = (paymentEid as any)?.msg as string;
        const subGroupsToBreak: any[][] =
          (subsBrokenAtOnce as number) > 0
            ? partition(
                subsBrokenAtOnce as number,
                subroutines.filter((x) => !x.broken),
              )
            : [subroutines.filter((x) => !x.broken)];
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: any) {
              if (timesPump > 0) {
                systemMsg(
                  s2,
                  side,
                  `${buildSpendMsg(paymentStr, "increase")}the strength of ${card.title} to ${getStrength(getCard(s2, card))} and break all ${(unbrokenSubsCount as number) > 1 ? unbrokenSubsCount : ""} subroutines on ${(currentIce as any).title}`,
                );
              } else {
                systemMsg(
                  s2,
                  side,
                  `${buildSpendMsg(paymentStr, "use")}${card.title} to break ${someAlreadyBroken ? "the remaining " : "all "}${unbrokenSubsCount} subroutines on ${(currentIce as any).title}`,
                );
              }
              if (onceKey)
                registerOnce(s2, side, { once: onceKey } as any, card);
              continueRun(s2, side, null as any);
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
  (state: GameState, side: string, args: any) => void
> = {
  "auto-pump": playAutoPump,
  "auto-pump-and-break": playAutoPumpAndBreak,
};

/** Mirrors `play-dynamic-ability`. */
export function playDynamicAbility(
  state: GameState,
  side: string,
  args: { dynamic: string } & Record<string, unknown>,
): void {
  if (noBlockingOrPreventPrompt(state, side)) {
    const fn = dynamicAbilities[args.dynamic];
    if (fn) fn(state, toKeyword(side), args);
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
  const cdef = cardDef(card) as any;
  const abilityIdx = args.ability;
  const ability = (cdef.corpAbilities ?? cdef["corp-abilities"] ?? [])[
    abilityIdx
  ] as Ability;
  const cannotPlay =
    card.disabled === true ||
    anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
      ability as any,
      abilityIdx as any,
    ]);
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
  const cdef = cardDef(card) as any;
  const abilityIdx = args.ability;
  const ability = (cdef.runnerAbilities ?? cdef["runner-abilities"] ?? [])[
    abilityIdx
  ] as Ability;
  const cannotPlay =
    card.disabled === true ||
    anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
      ability as any,
      abilityIdx as any,
    ]);
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

/** View deck. Mirrors `view-deck`. */
export function viewDeck(state: GameState, side: string, _: unknown): void {
  systemMsg(state, side, "looks at [their] deck");
  (side_(state, side) as any).viewDeck = true;
}

/** Close deck view. Mirrors `close-deck`. */
export function closeDeck(state: GameState, side: string, _: unknown): void {
  systemMsg(state, side, "stops looking at [their] deck");
  delete (side_(state, side) as any).viewDeck;
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
  if (card) {
    if (expendable(state, card)) {
      (state.corp as any).installList = [
        ...installableServers(state, card),
        "Expend",
      ];
    } else {
      (state.corp as any).installList = installableServers(state, card);
    }
  } else {
    delete (state.corp as any).installList;
  }
}

/** Mirrors `generate-runnable-zones`. */
export function generateRunnableZones(
  state: GameState,
  _side: unknown,
  _args: unknown,
): void {
  (state.runner as any).runnableList = zonesToSortedNames(
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
  (eid as any).sourceType = "advance";

  if (canAdvance(state, side, card)) {
    const payEid = makeEIDFrom(state, eid);
    (payEid as any).action = "corp-advance";
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _e: EID, binds: any) {
          const paymentStr = (binds.asyncResult as any)?.msg as string;
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
                function (s2: GameState, _e2: EID, _b2: any) {
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
  } as any) as unknown as Card;
  updateAllAdvancementRequirements(state);
  updateAllAgendaPoints(state);
  const c2 = getCard(state, initialised) as Card;
  const points = getAgendaPoints(c2);

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        systemMsg(
          s,
          CORP_SIDE,
          `scores ${c2.title} and gains ${quantify(points, "agenda point")}`,
        );
        implementationMsg(s, card);
        setProp(s, CORP_SIDE, getCard(s, c2) as Card, "advance-counter", 0);
        const reg = (s.corp.register ?? {}) as any;
        reg["scored-agenda"] = (reg["scored-agenda"] ?? 0) + points;
        s.corp.register = reg;
        playSfx(s, side, "agenda-score");
        const onScore =
          (cardDef(c2) as any)["on-score"] ?? (cardDef(c2) as any).onScore;
        if (onScore) registerPendingEvent(s, "agenda-scored", c2, onScore);
        queueEvent(s, "agenda-scored", {
          card: c2,
          "scored-card": card,
          "advancement-requirement": advancementRequirement,
          "advancement-tokens": advancementTokens,
          points,
        } as any);
        checkpoint(s, null, eid, { duration: "agenda-scored" } as any);
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

/** Score an agenda. Mirrors `score`. */
export function score(eid: EID, card: Card | null, opts?: any): void;
export function score(state: GameState, side: string, eid: EID, card: Card): void;
export function score(state: GameState, side: string, eid: EID, card: Card, opts: { noReq?: boolean; ignoreTurn?: boolean; ignoreAdv?: boolean; [k: string]: any } | null): void;
export function score(...rawArgs: any[]): void {
  // shorthand (eid, card, opts?) — no state, no-op
  if (rawArgs.length <= 3 && rawArgs[0] && "id" in (rawArgs[0] as any) && !("title" in (rawArgs[0] as any))) {
    return;
  }
  const state = rawArgs[0] as GameState;
  const side = rawArgs[1] as string;
  const eid = rawArgs[2] as EID;
  const card = rawArgs[3] as Card;
  const opts = (rawArgs[4] as any) ?? undefined;
  if (!card) return;
  void opts;
  const noReq = opts?.noReq ?? false;
  const ignoreTurn = opts?.ignoreTurn ?? false;
  const ignoreAdv = opts?.ignoreAdv ?? false;

  if (!canScore(state, side, card, { noReq, ignoreTurn, ignoreAdv } as any)) {
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
  } as any);
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

  const payEid = makeEIDFrom(state, eid);
  (payEid as any).additionalCosts = cost;
  (payEid as any).source = card;
  (payEid as any).sourceType = "corp-score";
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: any) {
        const paymentResult = binds.asyncResult as any;
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
