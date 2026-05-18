// Pick counters / credit-providing cards.
// Mirrors: src/clj/game/core/pick_counters.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types.ts";
import {
  getCard,
  getCounters,
  hasSubtype,
  isInstalled,
  isRunner,
} from "./card";
import { cardDef } from "./card_defs";
import {
  completeWithResult,
  effectCompleted,
  makeEID,
  makeEIDFrom,
  registerEIDCallback,
} from "./eid";
import { anyEffects } from "./effects";
import { queueEvent, resolveAbility } from "./engine";
import { lose } from "./gaining";
import { addCounter } from "./props";
import { update } from "./update";
import { spendBadPublicity } from "./bad_publicity";
import { enumerateStr, inColl, quantify, sameCard } from "../utils";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Mirrors Clojure (wait-for ...). */
function waitFor(
  state: GameState,
  parentEid: EID,
  start: (innerEid: EID) => void,
  next: (asyncResult: unknown, innerEid: EID) => void,
): void {
  const inner = makeEIDFrom(state, parentEid);
  registerEIDCallback(state, inner, (_s: any, _side: any, completed: any) => {
    next((completed as EID).result, completed as EID);
  });
  start(inner);
}

/** continue-ability shorthand — fresh resolve at current eid. */
function continueAbility(
  state: GameState,
  side: string,
  eid: EID,
  ability: any,
  card: Card | null,
  targets: any[],
): void {
  resolveAbility(state, side, { ...ability, eid } as Ability, card, targets);
}

// ---------------------------------------------------------------------------
// pick-counter-triggers
// ---------------------------------------------------------------------------

type SelectedEntry = { card: Card; number: number };
type SelectedMap = Record<string, SelectedEntry>;

/**
 * Recursive event-firing pass: for every selected card, queue a :counter-added
 * event, then complete the eid with the result map. Mirrors `pick-counter-triggers`.
 */
function pickCounterTriggers(
  state: GameState,
  side: string,
  eid: EID,
  current: SelectedMap,
  selectedCards: SelectedMap,
  counterType: string,
  counterCount: number,
  message: string,
  credits: number,
): void {
  const entries = Object.entries(current);
  if (entries.length > 0) {
    const [headKey, selected] = entries[0];
    const rest: SelectedMap = {};
    for (const [k, v] of entries.slice(1)) rest[k] = v;
    if (selected) {
      const { card, number } = selected;
      queueEvent(state, "counter-added", {
        card: getCard(state, card),
        "counter-type": counterType,
        amount: number,
      });
    }
    pickCounterTriggers(
      state,
      side,
      eid,
      rest,
      selectedCards,
      counterType,
      counterCount,
      message,
      credits,
    );
    return;
  }
  const targets: Card[] = [];
  for (const [, v] of Object.entries(selectedCards)) {
    if (v && v.card) targets.push(v.card);
  }
  completeWithResult(state, side, eid, {
    number: counterCount,
    msg: message,
    "credits-spent-from-pool": credits,
    targets,
  });
}

// ---------------------------------------------------------------------------
// pick-virus-counters-to-spend
// ---------------------------------------------------------------------------

/**
 * Pick virus counters to spend. For use with Freedom Khumalo and virus breakers,
 * and any other relevant cards. Returns an ability map for use with
 * resolve-ability or continue-ability. The ability triggered returns either
 * `{ number: n, msg }` on completed effect, or "cancel" on a cancel.
 *
 * Calling with no `targetCount` (or null) lets the user select as many
 * counters as they like until 'Cancel' is pressed.
 *
 * Mirrors `pick-virus-counters-to-spend`.
 */
export function pickVirusCountersToSpend(targetCount: number | null): Ability;
export function pickVirusCountersToSpend(
  specificCard: Card | null,
  targetCount: number | null,
): Ability;
export function pickVirusCountersToSpend(
  specificCard: Card | null,
  targetCount: number | null,
  selectedCards: SelectedMap,
  counterCount: number,
): Ability;
export function pickVirusCountersToSpend(
  arg1: number | Card | null,
  arg2?: number | null,
  selectedCards: SelectedMap = {},
  counterCount: number = 0,
): Ability {
  let specificCard: Card | null;
  let targetCount: number | null;
  if (arguments.length === 1) {
    specificCard = null;
    targetCount = arg1 as number | null;
  } else {
    specificCard = arg1 as Card | null;
    targetCount = (arg2 ?? null) as number | null;
  }

  return {
    async: true,
    prompt: `Choose a card with virus counters (${counterCount}${
      targetCount != null ? ` of ${targetCount}` : ""
    } virus counters)`,
    choices: {
      card: (c: Card) =>
        (specificCard
          ? sameCard(c, specificCard) || c.title === "Hivemind"
          : true) &&
        isInstalled(c) &&
        isRunner(c) &&
        getCounters(c, "virus") > 0,
    },
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: any[],
    ) => {
      const target = (update as any)(
        state,
        "runner",
        (t: Card) => {
          const counter = { ...(t.counter ?? {}) };
          counter["virus"] = (counter["virus"] ?? 0) - 1;
          return { ...t, counter } as Card;
        },
        targets[0] as Card,
      ) ?? (targets[0] as Card);
      const newSelected: SelectedMap = { ...selectedCards };
      const prev = newSelected[target.cid] ?? { card: target, number: 0 };
      newSelected[target.cid] = {
        ...prev,
        card: target,
        number: (prev.number ?? 0) + 1,
      };
      const newCount = counterCount + 1;
      if (targetCount == null || newCount < targetCount) {
        continueAbility(
          state,
          side,
          eid,
          pickVirusCountersToSpend(
            specificCard,
            targetCount,
            newSelected,
            newCount,
          ),
          card,
          null as any,
        );
      } else {
        const message = enumerateStr(
          Object.values(newSelected).map((s) => {
            const { card: c, number } = s;
            return `${quantify(number, "virus counter")} from ${c.title ?? ""}`;
          }),
        );
        pickCounterTriggers(
          state,
          side,
          eid,
          newSelected,
          newSelected,
          "virus",
          newCount,
          message,
          0,
        );
      }
    },
    cancel: {
      async: true,
      effect: (
        state: GameState,
        side: string,
        eid: EID,
        _card: Card | null,
        _targets: any[],
      ) => {
        if (targetCount != null) {
          // Refund counters
          for (const { card: c, number } of Object.values(selectedCards)) {
            (update as any)(
              state,
              "runner",
              (t: Card) => {
                const counter = { ...(t.counter ?? {}) };
                counter["virus"] = (counter["virus"] ?? 0) + number;
                return { ...t, counter } as Card;
              },
              getCard(state, c) as Card,
            );
          }
          completeWithResult(state, side, eid, "cancel");
        } else {
          const message = enumerateStr(
            Object.values(selectedCards).map((s) => {
              const { card: c, number } = s;
              return `${quantify(number, "virus counter")} from ${c.title ?? ""}`;
            }),
          );
          completeWithResult(state, side, eid, {
            number: counterCount,
            msg: message,
          });
        }
      },
    },
  } as unknown as Ability;
}

// ---------------------------------------------------------------------------
// trigger-spend-credits-from-cards
// ---------------------------------------------------------------------------

/** Recursively queues `:spent-credits-from-card` events for each card. */
function triggerSpendCreditsFromCards(
  state: GameState,
  side: string,
  eid: EID,
  cards: Card[],
): void {
  if (cards.length > 0) {
    queueEvent(state, "spent-credits-from-card", { card: cards[0] });
    triggerSpendCreditsFromCards(state, side, eid, cards.slice(1));
    return;
  }
  effectCompleted(state, side, eid);
}

function queueSpendFromBadPub(
  state: GameState,
  _side: string,
  spent: number | null | undefined,
): void {
  if (spent != null && spent > 0) {
    queueEvent(state, "bad-publicity-spent", { value: spent });
  }
}

// ---------------------------------------------------------------------------
// take-counters-of-type
// ---------------------------------------------------------------------------

type EffectFn = (
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: any[],
) => void;

/**
 * Builds an effect that decrements a single counter of the given type and
 * completes the eid with `1`. Does not fire any events.
 */
function takeCountersOfType(counterType: string): EffectFn {
  return (state, side, eid, card, _targets) => {
    if (card) {
      const counter = { ...(card.counter ?? {}) };
      counter[counterType] = getCounters(card, counterType) - 1;
      const updated = { ...card, counter } as Card;
      (update as any)(state, side, () => updated, card);
    }
    completeWithResult(state, side, eid, 1);
  };
}

// ---------------------------------------------------------------------------
// use-card
// ---------------------------------------------------------------------------

type UsesMap = Record<string, { used: number; "max-uses": number }>;

function useCard(uses: UsesMap, card: Card, asyncRes: unknown): UsesMap {
  if (typeof asyncRes === "number" && asyncRes > 0) {
    if (uses[card.cid]) {
      return {
        ...uses,
        [card.cid]: { ...uses[card.cid], used: uses[card.cid].used + 1 },
      };
    }
    const cdef = cardDef(card) as any;
    const maxUses = cdef?.interactions?.["pay-credits"]?.["max-uses"] ?? 99;
    return {
      ...uses,
      [card.cid]: { used: 1, "max-uses": maxUses },
    };
  }
  return uses;
}

// ---------------------------------------------------------------------------
// pick-credit-reducers
// ---------------------------------------------------------------------------

type ProviderFunc = () => Card[];

/**
 * Similar to `pick-credit-providing-cards`, but happens first and is currently
 * only used for Patchwork. Mirrors `pick-credit-reducers`.
 */
export function pickCreditReducers(
  providerFunc: ProviderFunc,
  outerEid: EID,
): Ability;
export function pickCreditReducers(
  providerFunc: ProviderFunc,
  outerEid: EID,
  targetCount: number | null,
): Ability;
export function pickCreditReducers(
  providerFunc: ProviderFunc,
  outerEid: EID,
  targetCount: number | null,
  stealthTarget: number,
): Ability;
export function pickCreditReducers(
  providerFunc: ProviderFunc,
  outerEid: EID,
  targetCount: number | null,
  stealthTarget: number,
  selectedCards: SelectedMap,
): Ability;
export function pickCreditReducers(
  providerFunc: ProviderFunc,
  outerEid: EID,
  targetCount: number | null,
  stealthTarget: number,
  selectedCards: SelectedMap,
  uses: UsesMap,
): Ability;
export function pickCreditReducers(
  providerFunc: ProviderFunc,
  outerEid: EID,
  targetCount: number | null = null,
  stealthTarget: number = 0,
  selectedCards: SelectedMap = {},
  uses: UsesMap = {},
): Ability {
  const counterCount = Object.values(selectedCards).reduce(
    (acc, s) => acc + (s?.number ?? 0),
    0,
  );
  let providerCards = providerFunc();
  const allUsedUp = (cid: string): boolean =>
    (uses[cid]?.used ?? 0) >= (uses[cid]?.["max-uses"] ?? 1);
  providerCards = providerCards.filter((c) => !allUsedUp(c.cid));
  const discountProvider = providerCards.filter((c) => {
    const cdef = cardDef(c) as any;
    return cdef?.interactions?.["pay-credits"]?.["cost-reduction"];
  });

  if (discountProvider.length === 0) {
    return {
      async: true,
      effect: (
        state: GameState,
        side: string,
        eid: EID,
        _card: Card | null,
        _targets: any[],
      ) => {
        const targets: Card[] = [];
        for (const v of Object.values(selectedCards)) {
          if (v?.card) targets.push(v.card);
        }
        completeWithResult(state, side, eid, {
          reduction: counterCount,
          targets,
        });
      },
    } as unknown as Ability;
  }

  return {
    async: true,
    prompt: "Choose a cost-reducing card",
    choices: {
      card: (c: Card) =>
        inColl(
          discountProvider.map((p) => p.cid),
          c.cid,
        ),
    },
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: any[],
    ) => {
      const target = targets[0] as Card;
      const cdef = cardDef(target) as any;
      const payCreditsType = cdef?.interactions?.["pay-credits"]?.type;
      const payFunction: EffectFn =
        payCreditsType === "custom"
          ? cdef.interactions["pay-credits"].custom
          : takeCountersOfType(payCreditsType);
      const customAbility = {
        async: true,
        effect: payFunction,
      } as unknown as Ability;
      const neweid = makeEIDFrom(state, outerEid);
      const providingCard = target;
      waitFor(
        state,
        eid,
        (_inner) =>
          resolveAbility(
            state,
            side,
            { ...customAbility, eid: neweid } as Ability,
            providingCard,
            [card],
          ),
        (asyncResult) => {
          const newSelected: SelectedMap = { ...selectedCards };
          const prev = newSelected[providingCard.cid] ?? {
            card: providingCard,
            number: 0,
          };
          newSelected[providingCard.cid] = {
            ...prev,
            card: providingCard,
            number:
              (prev.number ?? 0) +
              (typeof asyncResult === "number" ? asyncResult : 0),
          };
          continueAbility(
            state,
            side,
            eid,
            pickCreditReducers(
              providerFunc,
              eid,
              targetCount,
              stealthTarget,
              newSelected,
              useCard(uses, providingCard, asyncResult),
            ),
            card,
            targets,
          );
        },
      );
    },
    cancel: {
      async: true,
      effect: (
        state: GameState,
        side: string,
        eid: EID,
        _card: Card | null,
        _targets: any[],
      ) => {
        const targets: Card[] = [];
        for (const v of Object.values(selectedCards)) {
          if (v?.card) targets.push(v.card);
        }
        completeWithResult(state, side, eid, {
          reduction: counterCount,
          targets,
        });
      },
    },
  } as unknown as Ability;
}

// ---------------------------------------------------------------------------
// pick-credit-providing-cards
// ---------------------------------------------------------------------------

/**
 * Similar to `pick-virus-counters-to-spend`. Works on `:recurring` and normal
 * credits. Mirrors `pick-credit-providing-cards`.
 */
export function pickCreditProvidingCards(
  providerFunc: ProviderFunc,
  outerEid: EID,
  targetCount?: number | null,
  stealthTarget?: number,
  selectedCards?: SelectedMap,
  preChosen?: Card | "bad-publicity" | null,
  uses?: UsesMap,
  badPubAvailable?: number,
  badPubSpent?: number,
): Ability {
  const tc = targetCount ?? null;
  const st = stealthTarget ?? 0;
  const sel: SelectedMap = selectedCards ?? {};
  const pc = preChosen ?? null;
  const us: UsesMap = uses ?? {};
  const bpa = badPubAvailable ?? 0;
  const bps = badPubSpent ?? 0;

  const counterCount =
    Object.values(sel).reduce((acc, s) => acc + (s?.number ?? 0), 0) +
    (bps || 0);
  const selectedStealth = Object.values(sel).filter((s) =>
    hasSubtype(s.card, "Stealth"),
  );
  const stealthCount = selectedStealth.reduce(
    (acc, s) => acc + (s?.number ?? 0),
    0,
  );
  let provCards =
    tc != null && counterCount - tc === stealthCount - st
      ? providerFunc().filter((c) => hasSubtype(c, "Stealth"))
      : providerFunc();
  const allUsedUp = (cid: string): boolean =>
    (us[cid]?.used ?? 0) >= (us[cid]?.["max-uses"] ?? 99);
  provCards = provCards.filter((c) => !allUsedUp(c.cid));
  provCards = provCards.filter((c) => {
    const cdef = cardDef(c) as any;
    return !cdef?.interactions?.["pay-credits"]?.["cost-reduction"];
  });
  const canUseBadPub = bpa > 0 && st !== tc;
  const canUseCredits = (state: GameState, side: string): boolean =>
    !anyEffects(
      state,
      side,
      "cannot-pay-credits-from-pool",
      (v) => v === true,
      null,
      [],
    );
  // Allows holding shift while clicking a card to keep picking that card while possible
  const shouldAutoRepeat = (state: GameState, side: string): boolean =>
    !!(state as any)[side]?.["shift-key-select"];

  const payRest: EffectFn = (state, side, eid, card, _targets) => {
    const sidePool = canUseCredits(state, side)
      ? ((state as any)[side]?.credit ?? 0)
      : 0;
    if (tc != null && tc - counterCount <= sidePool && st <= stealthCount) {
      const remainder = Math.max(0, tc - counterCount);
      const remainderStr = remainder > 0 ? `${remainder} [Credits]` : "";
      const haveCardStrs = Object.keys(sel).length > 0 || bps > 0;
      const cardStrs = haveCardStrs
        ? enumerateStr([
            ...Object.values(sel).map((s) => {
              const { card: c, number } = s;
              return `${number} [Credits] from ${c.title ?? ""}`;
            }),
            ...(bps > 0 ? [`${bps}[Credits] from bad publicity`] : []),
          ])
        : "";
      const message =
        cardStrs +
        (cardStrs && remainderStr ? " and " : "") +
        remainderStr +
        (cardStrs && remainderStr ? " from [their] credit pool" : "");
      if (bps > 0) {
        spendBadPublicity(state, side, bps);
      }
      lose(state, side, "credit", remainder);
      const cards = Object.values(sel)
        .map((s) => s.card)
        .filter((c) => {
          const cdef = cardDef(c) as any;
          return !cdef?.interactions?.["pay-credits"]?.["cost-reduction"];
        });
      waitFor(
        state,
        eid,
        (inner) => triggerSpendCreditsFromCards(state, side, inner, cards),
        () => {
          queueSpendFromBadPub(state, side, bps);
          // Now we trigger all of the :counter-added events we'd neglected previously
          pickCounterTriggers(
            state,
            side,
            eid,
            sel,
            sel,
            "credit",
            tc as number,
            message,
            remainder,
          );
        },
      );
    } else {
      continueAbility(
        state,
        side,
        eid,
        pickCreditProvidingCards(
          providerFunc,
          eid,
          tc,
          st,
          sel,
          pc,
          us,
          bpa,
          bps,
        ),
        card,
        null as any,
      );
    }
  };

  if (
    tc == null ||
    tc <= 0 ||
    tc <= counterCount ||
    (provCards.length === 0 && !canUseBadPub)
  ) {
    return { async: true, effect: payRest } as unknown as Ability;
  }

  if (
    pc &&
    ((pc !== "bad-publicity" &&
      inColl(
        provCards.map((c) => c.cid),
        pc.cid,
      )) ||
      pc === "bad-publicity")
  ) {
    return {
      async: true,
      effect: (
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        targets: any[],
      ) => {
        const target = targets[0];
        if (target === "bad-publicity" || pc === "bad-publicity") {
          continueAbility(
            state,
            side,
            eid,
            pickCreditProvidingCards(
              providerFunc,
              eid,
              tc,
              st,
              sel,
              shouldAutoRepeat(state, side) && bpa > 1
                ? (target as Card | "bad-publicity")
                : null,
              us,
              bpa - 1,
              bps + 1,
            ),
            card,
            targets,
          );
        } else {
          const tgt = pc as Card;
          const cdef = cardDef(tgt) as any;
          const payCreditsType = cdef?.interactions?.["pay-credits"]?.type;
          const payFunction: EffectFn =
            payCreditsType === "custom"
              ? cdef.interactions["pay-credits"].custom
              : takeCountersOfType(payCreditsType);
          const customAbility = {
            async: true,
            effect: payFunction,
          } as unknown as Ability;
          const neweid = makeEIDFrom(state, outerEid);
          const providingCard = tgt;
          waitFor(
            state,
            eid,
            (_inner) =>
              resolveAbility(
                state,
                side,
                { ...customAbility, eid: neweid } as Ability,
                providingCard,
                [card],
              ),
            (asyncResult) => {
              const newSel: SelectedMap = { ...sel };
              const prev = newSel[providingCard.cid] ?? {
                card: providingCard,
                number: 0,
              };
              newSel[providingCard.cid] = {
                ...prev,
                card: providingCard,
                number:
                  (prev.number ?? 0) +
                  (typeof asyncResult === "number" ? asyncResult : 0),
              };
              continueAbility(
                state,
                side,
                eid,
                pickCreditProvidingCards(
                  providerFunc,
                  eid,
                  tc,
                  st,
                  newSel,
                  pc,
                  us,
                  bpa,
                  bps,
                ),
                card,
                targets,
              );
            },
          );
        }
      },
    } as unknown as Ability;
  }

  return {
    async: true,
    prompt: `Choose a credit providing card (${counterCount}${
      tc != null && tc > 0 ? ` of ${tc}` : ""
    } [Credits]${
      st > 0 ? `, ${Math.min(stealthCount, st)} of ${st} stealth` : ""
    })`,
    "offer-bad-pub": canUseBadPub ? bpa : null,
    choices: {
      card: (c: Card) =>
        inColl(
          provCards.map((p) => p.cid),
          c.cid,
        ),
    },
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: any[],
    ) => {
      const target = targets[0];
      if (target === "bad-publicity") {
        continueAbility(
          state,
          side,
          eid,
          pickCreditProvidingCards(
            providerFunc,
            eid,
            tc,
            st,
            sel,
            shouldAutoRepeat(state, side) ? "bad-publicity" : null,
            us,
            bpa - 1,
            bps + 1,
          ),
          card,
          targets,
        );
      } else {
        const tgt = target as Card;
        const cdef = cardDef(tgt) as any;
        const payCreditsType = cdef?.interactions?.["pay-credits"]?.type;
        const payFunction: EffectFn =
          payCreditsType === "custom"
            ? cdef.interactions["pay-credits"].custom
            : takeCountersOfType(payCreditsType);
        const customAbility = {
          async: true,
          effect: payFunction,
        } as unknown as Ability;
        const neweid = makeEIDFrom(state, outerEid);
        const providingCard = tgt;
        waitFor(
          state,
          eid,
          (_inner) =>
            resolveAbility(
              state,
              side,
              { ...customAbility, eid: neweid } as Ability,
              providingCard,
              [card],
            ),
          (asyncResult) => {
            const newSel: SelectedMap = { ...sel };
            const prev = newSel[providingCard.cid] ?? {
              card: providingCard,
              number: 0,
            };
            newSel[providingCard.cid] = {
              ...prev,
              card: providingCard,
              number:
                (prev.number ?? 0) +
                (typeof asyncResult === "number" ? asyncResult : 0),
            };
            continueAbility(
              state,
              side,
              eid,
              pickCreditProvidingCards(
                providerFunc,
                eid,
                tc,
                st,
                newSel,
                shouldAutoRepeat(state, side) ? tgt : null,
                useCard(us, providingCard, asyncResult),
                bpa,
                bps,
              ),
              card,
              targets,
            );
          },
        );
      }
    },
    cancel: {
      async: true,
      effect: payRest,
    },
  } as unknown as Ability;
}
