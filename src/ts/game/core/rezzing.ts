// Rez/derez mechanics.
// Mirrors: src/clj/game/core/rezzing.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { CardDef, Ability } from "./types.ts";
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
  const hostedCards = card.hosted?.filter((h) => !conditionCounter(h)) ?? [];

  if (canHost(state, card)) {
    effectCompleted(state, side, eid);
  } else {
    wait_for(
      state,
      [
        [{ asyncResult: "result" }],
        function (s: GameState, _e: EID, _binds: any) {
          if (hostedCards.length > 0) {
            const names = hostedCards.map((h) =>
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
  const prependCostStr = (msgKeys["include-cost-from-eid"] as any)
    ? ((msgKeys["include-cost-from-eid"] as any)["latest-payment-str"] ?? "")
    : "";

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
      function (s: GameState, _e: EID, binds: any) {
        const asyncResult = (binds as any).asyncResult ?? binds;
        const msg = asyncResult?.msg;
        const costPaid = asyncResult?.costPaid;

        if (!msg) {
          effectCompleted(s, side, eid);
          return;
        }

        // Unregister derezzed events if they exist
        if ((cdef as any)["derezzed-events"]) {
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
            zone: (h.zone as any[])?.map((z: unknown) => toKeyword(z)),
            host: {
              ...((h as any).host ?? {}),
              zone: ((h as any).host?.zone as any[])?.map((z: unknown) =>
                toKeyword(z),
              ),
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
        if (!args.noWarning && (s as any).corpPhase12) {
          toast(
            s,
            "corp",
            "You are not allowed to rez cards between Start of Turn and Mandatory Draw.\nPlease rez prior to clicking Start Turn in the future.",
            "warning",
            { timeOut: 0, closeButton: true },
          );
        }

        // Play sound
        const rezByte = (cdef as any)["rez-sound"];
        const suppressRezSound =
          args.silent ??
          (() => {
            const suppressReq = (cdef as any)["suppress-rez-sound"];
            if (suppressReq) {
              return suppressReq(s, side, eid, newCard, null);
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
        const stats = (s as any).stats ?? {};
        if (!stats.corp) stats.corp = {};
        if (!stats.corp.cards) stats.corp.cards = {};
        stats.corp.cards.rezzed = (stats.corp.cards.rezzed ?? 0) + 1;
        (s as any).stats = stats;

        // Register pending on-rez event
        const cardAbility = (cdef as any)["on-rez"];
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
            function (s2: GameState, _e2: EID, _binds2: any) {
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
      ? ((cardDef(resolvedCard) as any)["alternative-cost"] as
          | CostData[]
          | undefined)
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
export function rez(
  state: any,
  side?: any,
  eid?: any,
  card?: any,
  args?: any,
): any;
export function rez(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  args?: {
    ignoreCost?: boolean | "all-costs";
    force?: boolean;
    declinedAlternativeCost?: boolean;
    alternativeCost?: CostData[];
    noWarning?: boolean;
    noMsg?: boolean;
    pressContinue?: boolean;
    disabled?: boolean;
    silent?: boolean;
    suppressCheckpoint?: boolean;
  },
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
    effectiveAlternativeCost = (cardDef(resolvedCard) as any)[
      "alternative-cost"
    ];
  }

  const isRezEligible =
    resolvedCard &&
    (opts.force || canRez(state, side, resolvedCard)) &&
    (asset(resolvedCard) ||
      ice(resolvedCard) ||
      upgrade(resolvedCard) ||
      !!(cardDef(resolvedCard) as any)["install-rezzed"]);

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
    completeRez(state, side, eid, resolvedCard, opts);
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
  const costStr = (msgKeys["include-cost-from-eid"] as any)
    ? ((msgKeys["include-cost-from-eid"] as any)["latest-payment-str"] ?? "")
    : "";

  const titles = cards.map((c) => cardStr(state, c, { visible: true }));
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
        function (s: GameState, _e: EID, _binds: any) {
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
  const cardStrs = cards.map((c) => cardStr(state, c, { visible: true }));
  const enumerate = enumerateStr(cardStrs);

  // get-in msg-keys [:include-cost-from-eid :latest-payment-str]
  const prependCostStr = (msgKeys["include-cost-from-eid"] as any)
    ? ((msgKeys["include-cost-from-eid"] as any)["latest-payment-str"] ?? "")
    : "";

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
export function derez(state: GameState, side: string, cards: Card | Card[], args?: any): void;
export function derez(state: GameState, side: string, eid: EID, cards: Card | Card[], args?: any): void;
export function derez(
  state: GameState,
  side: string,
  eidOrCards: EID | Card | Card[],
  cardsOrArgs?: Card | Card[] | any,
  args?: {
    suppressCheckpoint?: boolean;
    noEvent?: boolean;
    noMsg?: boolean;
    msgKeys?: Record<string, unknown>;
    [k: string]: any;
  },
): void {
  let eid: EID, cards: Card | Card[];
  if (eidOrCards && typeof eidOrCards === "object" && "id" in (eidOrCards as any) && !("title" in (eidOrCards as any)) && !Array.isArray(eidOrCards)) {
    eid = eidOrCards as EID;
    cards = cardsOrArgs as Card | Card[];
  } else {
    eid = makeEID(state);
    cards = eidOrCards as Card | Card[];
    args = cardsOrArgs as any;
  }
  const opts = args ?? {};

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
    .map((c) => {
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

    const cdef = cardDef(c);

    // derez-effect: currently only for lycian fixing subtypes on derez
    const derezEffect = (cdef as any)["derez-effect"];
    if (derezEffect) {
      resolveAbility(state, "corp", derezEffect, getCard(state, c), cdef as any);
    }

    // Register derezzed events
    const derezzedEvents = (cdef as any)["derezzed-events"];
    if (derezzedEvents) {
      registerEvents(
        state,
        "corp",
        c,
        derezzedEvents.map((ev: any) => ({ ...ev, condition: "derezzed" })),
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
