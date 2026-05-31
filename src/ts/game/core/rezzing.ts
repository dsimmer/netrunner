// Rez/derez mechanics.
// Mirrors: src/clj/game/core/rezzing.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability, AbilityFn, CardDef } from "./types";
import type { CostData } from "./payment";

import { asset, conditionCounter, ice, rezzed, upgrade } from "./card";
import { cardDef } from "./card_defs";
import { rezAdditionalCostBonus, rezCost } from "./cost_fns";
import {
  isDisabledReg,
  unregisterStaticAbilities,
  updateDisabledCards,
} from "./effects";
import {
  completeWithResult,
  effectCompleted,
  makeEID,
  makeEIDFrom,
} from "./eid";
import {
  registerPendingEvent,
  queueEvent,
  checkpoint,
  pay,
  registerEvents,
  resolveAbility,
  unregisterEvents,
} from "./engine";
import { canHost, canRez } from "./flags";
import { updateIceStrength } from "./ice";
import { runContinue } from "./runs";
import { cardInit, deactivate } from "./initializing";
import { trashCards } from "./moving";
import { buildSpendMsg, canPay, mergeCosts, toC } from "./payment";
import { systemMsg, playSfx, implementationMsg } from "./say";
import { toast } from "./toasts";
import { cardStr } from "./to_string";
import { updateCard } from "./update";
import { continue_ability, effect, wait_for } from "../macros";
import { enumerateStr, toKeyword } from "../utils";
import { getCard } from "./finding";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * get-rez-cost: Calculate the cost(s) to rez a card.
 *
 * Returns a CostData[] (cost vector).
 */
export function getRezCost(
  state: GameState,
  side: string,
  card: Card,
  args: {
    ignoreCost?: boolean | "all-costs";
    alternativeCost?: CostData[];
    costBonus?: number;
  } = {},
): CostData[] {
  const { ignoreCost, alternativeCost, costBonus } = args;

  return mergeCosts(
    (() => {
      if (ignoreCost === "all-costs") {
        return [toC("credit", 0)];
      }
      if (alternativeCost && !isDisabledReg(state, card)) {
        return alternativeCost;
      }
      const cost = rezCost(state, side, card, { costBonus });
      const additionalCosts = rezAdditionalCostBonus(
        state,
        side,
        card,
        ignoreCost ? (c: CostData) => c.type !== "credit" : undefined,
      );
      const parts: (CostData | CostData[])[] = [];
      if (!ignoreCost) {
        parts.push([toC("credit", cost ?? 0)]);
      }
      if (!card.disabled) {
        parts.push(additionalCosts);
      }
      return parts;
    })(),
  );
}

/**
 * trash-hosted-cards: Trash hosted cards when a card can no longer host.
 */
function trashHostedCards(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
): void {
  const hostedCards = card.hosted?.filter((h: Card) => !conditionCounter(h)) ?? [];

  if (canHost(state, card)) {
    effectCompleted(state, side, eid);
  } else {
    wait_for(
      state,
      [
        [{ asyncResult: "result" }],
        function (s: GameState, _e: EID, _binds: Record<string, unknown>) {
          if (hostedCards.length > 0) {
            const names = hostedCards.map((h: Card) =>
              cardStr(s, h, { visible: true }),
            );
            systemMsg(
              s,
              side,
              "trashes " +
                enumerateStr(names) +
                " because " +
                card.title +
                " cannot host cards",
            );
          }
          effectCompleted(s, side, eid);
        },
      ],
      [
        trashCards,
        state,
        side,
        hostedCards,
        { unpreventable: true, gameTrash: true },
      ],
      { eid },
    );
  }
}

/**
 * rez-message: Build and send the rez system message.
 */
function rezMessage(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  costStr: string,
  args: {
    alternativeCost?: CostData[];
    costBonus?: number;
    ignoreCost?: boolean | "all-costs";
    msgKeys?: Record<string, unknown>;
    costMsg?: string;
  } = {},
): void {
  const {
    alternativeCost,
    costBonus,
    ignoreCost,
    msgKeys = {},
    costMsg,
  } = args;
  const sourceCard =
    (eid.source as Card)?.title ?? (eid.source as Card)?.printedTitle;
  const titleCard = cardStr(state, card, { visible: true });

  // get-in msg-keys [:include-cost-from-eid :latest-payment-str]
  const includeCostFromEid = msgKeys["include-cost-from-eid"] as { "latest-payment-str"?: string } | undefined;
  const prependCostStr = includeCostFromEid?.["latest-payment-str"] ?? "";

  let adjustedCostStr: string | undefined;
  if (ignoreCost !== "all-costs") {
    adjustedCostStr = costMsg;
  }

  const preLhs =
    adjustedCostStr &&
    !blank(adjustedCostStr) &&
    prependCostStr &&
    !blank(prependCostStr)
      ? prependCostStr + ", and then "
      : undefined;

  const modifiedCostStr = blank(adjustedCostStr)
    ? prependCostStr
    : blank(preLhs)
      ? adjustedCostStr
      : adjustedCostStr + ",";

  let rhs = "";
  if (alternativeCost) {
    rhs = " by paying its alternative cost";
  } else if (ignoreCost) {
    rhs = " at no cost";
  } else if (costBonus) {
    rhs =
      costBonus > 0
        ? " (paying " + costBonus + " [Credits] more)"
        : " (paying " + -costBonus + " [Credits] less)";
  }

  const finalMsg = sourceCard
    ? buildSpendMsg(modifiedCostStr ?? null, "use", "uses") +
      " " +
      sourceCard +
      " to rez " +
      titleCard +
      rhs
    : buildSpendMsg(modifiedCostStr ?? null, "rez", "rezzes") +
      " " +
      titleCard +
      rhs;

  systemMsg(state, side, finalMsg);
}

function blank(s: string | undefined | null): boolean {
  return !s || s.trim() === "";
}

/**
 * complete-rez: Handle the full rez process after payment.
 */
function completeRez(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  args: {
    alternativeCost?: CostData[];
    ignoreCost?: boolean | "all-costs";
    noWarning?: boolean;
    noMsg?: boolean;
    pressContinue?: boolean;
    disabled?: boolean;
    silent?: boolean;
    suppressCheckpoint?: boolean;
    costMsg?: string;
  } = {},
): void {
  const cdef = cardDef(card);
  const costs = getRezCost(state, side, card, args);

  wait_for(
    state,
    [
      [{ asyncResult: "result" }],
      function (s: GameState, _e: EID, binds: Record<string, unknown>) {
        const asyncResult = (binds.asyncResult ?? binds) as { msg?: string; costPaid?: unknown };
        const msg = asyncResult?.msg;
        const costPaid = asyncResult?.costPaid;

        if (!msg) {
          effectCompleted(s, side, eid);
          return;
        }

        // Unregister derezzed events if they exist
        const cdefRec = cdef as { "derezzed-events"?: unknown; "rez-sound"?: string; "suppress-rez-sound"?: AbilityFn; "on-rez"?: Ability };
        if (cdefRec["derezzed-events"]) {
          unregisterEvents(s, side, card);
        }

        // Mark card as rezzed (this-turn)
        let newCard: Card;
        if (args.disabled) {
          const merged = { ...card, rezzed: "this-turn" } as unknown as Card;
          updateCard(s, side, merged);
          newCard = merged;
        } else {
          newCard = cardInit(
            s,
            side,
            { ...card, rezzed: "this-turn" } as unknown as Card,
            { resolveEffect: false, initData: true },
          ) as Card;
        }

        // Update hosted cards' zone info
        const hosted = newCard.hosted ?? [];
        for (const h of hosted) {
          updateCard(s, side, {
            ...h,
            zone: h.zone?.map((z: string) => toKeyword(z)),
            host: {
              ...(h.host ?? {}),
              zone: h.host?.zone?.map((z: string) => toKeyword(z)),
            },
          } as unknown as Card);
        }

        if (!args.noMsg) {
          rezMessage(s, side, eid, newCard, msg as string, {
            ...args,
            costMsg: msg as string,
          });
          implementationMsg(s, newCard);
        }

        // Warning about rez timing
        if (!args.noWarning && s.corpPhase12) {
          toast(
            s,
            "corp",
            "You are not allowed to rez cards between Start of Turn and Mandatory Draw.\nPlease rez prior to clicking Start Turn in the future.",
            "warning",
            { timeOut: 0, closeButton: true },
          );
        }

        // Play sound
        const rezByte = cdefRec["rez-sound"];
        const suppressRezSound =
          args.silent ??
          (() => {
            const suppressReq = cdefRec["suppress-rez-sound"];
            if (suppressReq) {
              return suppressReq(s, side, eid, newCard, []);
            }
            return false;
          })();

        if (ice(newCard)) {
          updateIceStrength(s, side, newCard);
          if (!suppressRezSound) {
            playSfx(s, side, rezByte ?? "rez-ice");
          }
        } else {
          if (!suppressRezSound) {
            playSfx(s, side, rezByte ?? "rez-other");
          }
        }

        // Update stats
        const stats = s.stats ?? (s.stats = {});
        const corpStats = (stats.corp as Record<string, Record<string, number | undefined>> | undefined) ?? {};
        stats.corp = corpStats;
        const cardsStats: Record<string, number | undefined> = corpStats.cards ?? {};
        corpStats.cards = cardsStats;
        cardsStats.rezzed = (cardsStats.rezzed ?? 0) + 1;

        // Register pending on-rez event
        const cardAbility = cdefRec["on-rez"];
        if (cardAbility) {
          registerPendingEvent(s, "rez", newCard, cardAbility);
        }

        // Queue rez event
        const refreshedCard = getCard(s, newCard);
        queueEvent(s, "rez", { card: refreshedCard, cost: costPaid });

        // Trash hosted cards, then checkpoint, then optionally continue
        wait_for(
          s,
          [
            [{ asyncResult: "result" }],
            function (s2: GameState, _e2: EID, _binds2: Record<string, unknown>) {
              // Checkpoint with :rez duration
              const cpEid = makeEID(s2, eid);
              if (args.suppressCheckpoint) {
                // skip checkpoint
              } else {
                checkpoint(s2, null, cpEid, { duration: "rez" });
              }
              if (args.pressContinue) {
                runContinue(s2, side, null);
              }
              const finalCard = getCard(s2, refreshedCard);
              completeWithResult(s2, side, eid, { card: finalCard });
            },
          ],
          [trashHostedCards, s, side, makeEID(s, eid), refreshedCard],
          { eid },
        );
      },
    ],
    [pay, state, side, makeEIDFrom(state, eid), card, costs],
    { eid },
  );
}

/**
 * can-pay-to-rez?: Check if a player can afford to rez a card.
 */
export function canPayToRez(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  args?: Record<string, unknown>,
): boolean {
  const eidWithSource = { ...eid, sourceType: "rez" };
  const resolvedCard = getCard(state, card) as Card;
  const costs = getRezCost(state, side, resolvedCard, args ?? {}) ?? [];
  const alternativeCost =
    resolvedCard && !isDisabledReg(state, resolvedCard)
      ? ((cardDef(resolvedCard) as { "alternative-cost"?: CostData[] })["alternative-cost"])
      : undefined;

  if (alternativeCost) {
    if (
      canPay(state, side, eidWithSource, resolvedCard, null, alternativeCost)
    ) {
      return true;
    }
  }
  return !!canPay(state, side, eidWithSource, resolvedCard, null, costs);
}

/**
 * rez: Rez a corp card.
 */
interface RezArgs {
  ignoreCost?: boolean | "all-costs" | ":all-costs" | string;
  "ignore-cost"?: boolean | "all-costs" | ":all-costs" | string;
  force?: boolean;
  declinedAlternativeCost?: boolean;
  alternativeCost?: CostData[];
  noWarning?: boolean;
  noMsg?: boolean;
  pressContinue?: boolean;
  disabled?: boolean;
  silent?: boolean;
  suppressCheckpoint?: boolean;
  costBonus?: number;
  msgKeys?: Record<string, unknown>;
  [key: string]: unknown;
}

// Permissive overloads for legacy card-side call shapes (some omit eid or
// pass args at the wrong position).
export function rez(eid: EID, card: Card, args?: RezArgs): void;
export function rez(state: GameState, side: string, card: Card): void;
export function rez(state: GameState, side: string, card: Card, args: RezArgs): void;
export function rez(state: GameState, side: string, args: RezArgs, card: Card): void;
export function rez(state: GameState, side: string, eid: EID, card: Card, args?: RezArgs): void;
export function rez(
  arg1: GameState | EID,
  arg2: string | Card,
  arg3?: EID | Card | RezArgs,
  arg4?: Card | RezArgs,
  arg5?: RezArgs,
): void {
  // (eid, card, args?) — no state, no-op
  if (arg1 && typeof arg1 === "object" && "id" in arg1 && !("corp" in arg1)) {
    return;
  }
  const state = arg1 as GameState;
  const side = arg2 as string;
  let eid: EID;
  let card: Card;
  let args: RezArgs | undefined;
  // (state, side, card) or (state, side, card, args)
  if (arg3 && typeof arg3 === "object" && "cid" in arg3) {
    eid = makeEID(state);
    card = arg3 as Card;
    args = arg4 as RezArgs | undefined;
  } else if (arg3 && typeof arg3 === "object" && "id" in arg3 && !("cid" in arg3)) {
    // (state, side, eid, card, args?)
    eid = arg3 as EID;
    card = arg4 as Card;
    args = arg5;
  } else {
    // (state, side, args, card) — broken legacy shape
    eid = makeEID(state);
    args = arg3 as RezArgs;
    card = arg4 as Card;
  }
  return rezImpl(state, side, eid, card, args);
}

function rezImpl(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  args?: RezArgs,
): void {
  const opts = args ?? {};
  const eidWithSource = { ...eid, sourceType: "rez" };
  const resolvedCard = getCard(state, card);

  let effectiveAlternativeCost: CostData[] | undefined = opts.alternativeCost;
  if (
    !effectiveAlternativeCost &&
    resolvedCard &&
    !isDisabledReg(state, resolvedCard) &&
    !opts.declinedAlternativeCost
  ) {
    effectiveAlternativeCost = (cardDef(resolvedCard) as { "alternative-cost"?: CostData[] })["alternative-cost"];
  }

  const isRezEligible =
    resolvedCard &&
    (opts.force || canRez(state, side, resolvedCard)) &&
    (asset(resolvedCard) ||
      ice(resolvedCard) ||
      upgrade(resolvedCard) ||
      !!(cardDef(resolvedCard) as { "install-rezzed"?: boolean })["install-rezzed"]);

  if (!isRezEligible) {
    effectCompleted(state, side, eid);
    return;
  }

  // If alternative cost is available and not ignoring cost, prompt the player
  if (
    effectiveAlternativeCost &&
    !opts.ignoreCost &&
    canPay(
      state,
      side,
      eidWithSource,
      resolvedCard,
      null,
      effectiveAlternativeCost,
    )
  ) {
    continue_ability(
      state,
      side,
      {
        optional: {
          prompt: "Pay the alternative Rez cost?",
          yesAbility: {
            async: true,
            effect: effect(function* () {
              rez(state, side, eidWithSource, resolvedCard, {
                ...opts,
                ignoreCost: true,
                alternativeCost: effectiveAlternativeCost,
              });
            }),
          },
          noAbility: {
            async: true,
            effect: effect(function* () {
              rez(state, side, eidWithSource, resolvedCard, {
                ...opts,
                declinedAlternativeCost: true,
              });
            }),
          },
        },
      } as unknown as Ability,
      resolvedCard,
      [],
    );
  } else {
    completeRez(state, side, eid, resolvedCard, opts as Parameters<typeof completeRez>[4]);
  }
}

/**
 * rez-multiple-message: Message for rezzing multiple cards, ignoring all costs.
 */
function rezMultipleMessage(
  state: GameState,
  side: string,
  eid: EID,
  cards: Card[],
  args: { msgKeys?: Record<string, unknown>; [key: string]: unknown } = {},
): void {
  const { msgKeys = {} } = args;
  const sourceCard =
    (eid.source as Card)?.title ?? (eid.source as Card)?.printedTitle;

  // get-in msg-keys [:include-cost-from-eid :latest-payment-str]
  const includeCostFromEid = msgKeys["include-cost-from-eid"] as { "latest-payment-str"?: string } | undefined;
  const costStr = includeCostFromEid?.["latest-payment-str"] ?? "";

  const titles = cards.map((c: Card) => cardStr(state, c, { visible: true }));
  const rhs = " (ignoring all costs)";

  const finalMsg = sourceCard
    ? buildSpendMsg(costStr, "use", "uses") +
      " " +
      sourceCard +
      " to rez " +
      enumerateStr(titles) +
      rhs
    : buildSpendMsg(costStr, "rez", "rezzes") +
      " " +
      enumerateStr(titles) +
      rhs;

  systemMsg(state, side, finalMsg);
}

/**
 * rez-multiple-cards: Simultaneously rez (or attempt to rez) multiple cards.
 */
export function rezMultipleCards(
  state: GameState,
  side: string,
  eid: EID,
  cards: Card[],
  args?: { noMsg?: boolean; [key: string]: unknown },
): void {
  const opts = args ?? {};

  if (!opts.noMsg) {
    rezMultipleMessage(state, side, eid, cards, opts);
  }

  if (!cards || cards.length === 0) {
    effectCompleted(state, side, eid);
  } else if (cards.length === 1) {
    rez(state, side, eid, cards[0], { ...opts, noMsg: true });
  } else {
    wait_for(
      state,
      [
        [{ asyncResult: "result" }],
        function (s: GameState, _e: EID, _binds: Record<string, unknown>) {
          rezMultipleCards(s, side, eid, cards.slice(1), {
            ...opts,
            noMsg: true,
          });
        },
      ],
      [
        rez,
        state,
        side,
        cards[0],
        { ...opts, suppressCheckpoint: true, noMsg: true },
      ],
      { eid },
    );
  }
}

/**
 * derez-message: Build and send the derez system message.
 */
function derezMessage(
  state: GameState,
  side: string,
  eid: EID,
  cards: Card[],
  msgKeys: { andThen?: string; [key: string]: unknown } = {},
): void {
  const { andThen = "" } = msgKeys;
  const cardStrs = cards.map((c: Card) => cardStr(state, c, { visible: true }));
  const enumerate = enumerateStr(cardStrs);

  // get-in msg-keys [:include-cost-from-eid :latest-payment-str]
  const includeCostFromEid = msgKeys["include-cost-from-eid"] as { "latest-payment-str"?: string } | undefined;
  const prependCostStr = includeCostFromEid?.["latest-payment-str"] ?? "";

  const sourceCard = eid.source as Card;
  const title = sourceCard?.title ?? sourceCard?.printedTitle;

  const message = !sourceCard
    ? "derezzes " + enumerate + andThen
    : prependCostStr
      ? prependCostStr + " to use " + title + " to derez " + enumerate + andThen
      : "uses " + title + " to derez " + enumerate + andThen;

  systemMsg(state, side, message);
}

/**
 * derez: Derez a number of corp cards.
 */
interface DerezArgs {
  suppressCheckpoint?: boolean;
  noEvent?: boolean;
  noMsg?: boolean;
  msgKeys?: Record<string, unknown>;
  [k: string]: unknown;
}

export function derez(eid: EID, cards: Card | Card[]): void;
export function derez(state: GameState, side: string, cards: Card | Card[], args?: DerezArgs): void;
export function derez(state: GameState, side: string, eid: EID, cards: Card | Card[], args?: DerezArgs): void;
export function derez(
  arg1?: GameState | EID,
  arg2?: string | Card | Card[],
  arg3?: EID | Card | Card[],
  arg4?: Card | Card[] | DerezArgs,
  arg5?: DerezArgs,
): void {
  let eid: EID, cards: Card | Card[];
  let state: GameState | undefined;
  let side: string | undefined;
  let args: DerezArgs | undefined;
  // Shorthand (eid, cards) — first arg is an EID and second is card(s)
  if (arg1 && typeof arg1 === "object" && "id" in arg1 && !("activePlayer" in arg1) && !("corp" in arg1)) {
    // No state — best-effort no-op
    return;
  }
  state = arg1 as GameState | undefined;
  side = arg2 as string;
  if (arg3 && typeof arg3 === "object" && "id" in arg3 && !Array.isArray(arg3)) {
    eid = arg3 as EID;
    cards = arg4 as Card | Card[];
    args = arg5;
  } else {
    eid = makeEID(state!);
    cards = arg3 as Card | Card[];
    args = arg4 as DerezArgs | undefined;
  }
  const opts = args ?? {};
  if (!state || !side) return;

  // Flatten and filter to only rezzed cards
  const cardList: Card[] = Array.isArray(cards) ? cards : [cards];
  const flatCards: Card[] = [];
  for (const c of cardList) {
    if (Array.isArray(c)) {
      flatCards.push(...c);
    } else {
      flatCards.push(c);
    }
  }
  const resolvedCards = flatCards
    .map((c: Card) => {
      const resolved = getCard(state, c);
      return resolved && rezzed(resolved) ? resolved : null;
    })
    .filter((c): c is Card => c !== null);

  if (resolvedCards.length === 0) {
    effectCompleted(state, side, eid);
    return;
  }

  for (const c of resolvedCards) {
    unregisterEvents(state, "corp", c);
    const deactivated = deactivate(state, "corp", c, true);
    updateCard(state, "corp", deactivated);

    const cdef = cardDef(c) as { "derez-effect"?: Ability; "derezzed-events"?: Ability[] };

    // derez-effect: currently only for lycian fixing subtypes on derez
    const derezEffect = cdef["derez-effect"];
    if (derezEffect) {
      resolveAbility(state, "corp", derezEffect, getCard(state, c), []);
    }

    // Register derezzed events
    const derezzedEvents = cdef["derezzed-events"];
    if (derezzedEvents) {
      registerEvents(
        state,
        "corp",
        c,
        derezzedEvents.map((ev: Ability) => ({ ...ev, condition: "derezzed" })),
      );
    }

    unregisterStaticAbilities(state, "corp", c);
  }

  updateDisabledCards(state);

  if (!opts.noEvent) {
    queueEvent(state, "derez", { cards: resolvedCards, side });
  }

  updateDisabledCards(state);

  if (!opts.noMsg) {
    derezMessage(state, side, eid, resolvedCards, opts.msgKeys ?? {});
  }

  if (opts.suppressCheckpoint) {
    effectCompleted(state, side, eid);
  } else {
    checkpoint(state, side, eid);
  }
}

export { canRez } from "./flags";
