// Sabotage ability.
// Mirrors: src/clj/game/core/sabotage.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability, AbilityFn, ReqFn } from "./types.ts";
import { corp, inHand } from "./card";
import { effectCompleted } from "./eid";
import { resolveAbility } from "./engine";
import { trashCards } from "./moving";
import { multiMsg } from "./say";
import { enumerateStr, enumerateCards, pluralize, quantify } from "../utils";

// ---------------------------------------------------------------------------
// choosing-prompt-req
// ---------------------------------------------------------------------------

/**
 * Returns a ReqFn that produces the prompt text for the sabotage card-selection
 * step.  Mirrors `choosing-prompt-req`.
 */
export function choosingPromptReq(n: number): any {
  return (state: GameState) => {
    const cardsRd = (state.corp.deck ?? []).length;
    const forcedHq = n - cardsRd;
    return (
      "Choose" +
      (forcedHq > 0
        ? ` at least ${forcedHq} ${pluralize("card", forcedHq)} and`
        : "") +
      ` up to ${n} ${pluralize("card", n)} to trash from HQ. Remainder will be trashed from top of R&D.`
    );
  };
}

// ---------------------------------------------------------------------------
// cards-str
// ---------------------------------------------------------------------------

/**
 * Formats a string describing known and unknown cards being trashed.
 * Mirrors `cards-str`.
 */
function cardsStr(
  known: Card[],
  unknown: Card[],
  from: string,
  public_?: boolean,
): string {
  const unknownStr =
    `${quantify(unknown.length, known.length > 0 ? "unknown card" : "card")}` +
    (public_ ? ` (${enumerateCards(unknown)})` : "");

  if (known.length > 0) {
    const parts: string[] = known.map((c: any) => c.title ?? "");
    if (unknown.length > 0) parts.push(unknownStr);
    return ` ${enumerateStr(parts)} from ${from}`;
  }
  return `${unknownStr} from ${from}`;
}

// ---------------------------------------------------------------------------
// trash-selected-req
// ---------------------------------------------------------------------------

/**
 * Returns a ReqFn (used as an effect) that trashes the cards selected by the
 * corp (targets) plus any remainder from the top of R&D.  Mirrors
 * `trash-selected-req`.
 */
export function trashSelectedReq(n: number): AbilityFn {
  return (
    state: GameState,
    side: string,
    eid: EID,
    _card: Card | null,
    targets: unknown[],
  ) => {
    // catch cancel-effect that gives [null] as targets
    const targetCards: Card[] = (targets ?? [])
      .filter((t): t is Card => t != null)
      .slice();

    const selectedHq = targetCards.length;
    const deck = state.corp.deck ?? [];
    const selectedRd = Math.min(deck.length, n - selectedHq);
    const rndToTrash = deck.slice(0, selectedRd);
    const toTrash: Card[] = [...targetCards, ...rndToTrash];

    const knownHandCids = new Set(
      (state.breach as any)?.["known-cids"]?.hand ?? [],
    );
    const knownDeckCids = new Set(
      (state.breach as any)?.["known-cids"]?.deck ?? [],
    );

    const knownHqCards = toTrash.filter((c: any) => knownHandCids.has(c.cid));
    const knownRdCards = toTrash.filter((c: any) => knownDeckCids.has(c.cid));
    const unknownHqCards = targetCards.filter((c: any) => !knownHandCids.has(c.cid));
    const unknownRdCards = rndToTrash.filter((c: any) => !knownDeckCids.has(c.cid));

    let publicMsg = "trashes";
    if (selectedHq > 0) {
      publicMsg += cardsStr(knownHqCards, unknownHqCards, "HQ", undefined);
    }
    if (selectedHq > 0 && selectedRd > 0) publicMsg += " and ";
    if (selectedRd > 0) {
      publicMsg += cardsStr(
        knownRdCards,
        unknownRdCards,
        "the top of R&D",
        undefined,
      );
    }

    let privateMsg = "trashes";
    if (selectedHq > 0) {
      privateMsg += cardsStr(knownHqCards, unknownHqCards, "hq", true);
    }
    if (selectedHq > 0 && selectedRd > 0) privateMsg += " and ";
    if (selectedRd > 0) {
      privateMsg += cardsStr(
        knownRdCards,
        unknownRdCards,
        "the top of R&D",
        true,
      );
    }

    multiMsg(state, side, { corp: privateMsg, public: publicMsg });
    trashCards(state, side, eid, toTrash, { unpreventable: true });
    effectCompleted(state, side, eid);
  };
}

// ---------------------------------------------------------------------------
// sabotage-ability
// ---------------------------------------------------------------------------

/**
 * Returns an Ability representing the sabotage ability with the given number
 * of cards.  Mirrors `sabotage-ability`.
 */
export function sabotageAbility(n: number): Ability {
  const choosingAb = (forcedHq: number): Ability => ({
    waitingPrompt: true,
    player: "corp",
    prompt: choosingPromptReq(n),
    choices: {
      min: forcedHq,
      max: n,
      card: (c: Card) => corp(c) && inHand(c),
    },
    async: true,
    cancel: {
      async: true,
      effect: trashSelectedReq(n),
    },
    effect: trashSelectedReq(n),
  });

  const checkForcingAb: Ability = {
    async: true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) => {
      const cardsRd = (state.corp.deck ?? []).length;
      const cardsHq = (state.corp.hand ?? []).length;
      const forcedHq = n - cardsRd;

      if (n >= cardsRd + cardsHq) {
        // Trashes everything directly — no choice needed
        resolveAbility(
          state,
          side,
          { effect: trashSelectedReq(n) },
          card,
          state.corp.hand ?? [],
        );
      } else {
        // Continue to the choosing prompt
        const ability = choosingAb(forcedHq);
        resolveAbility(state, side, ability, card, []);
      }
    },
  };

  return {
    req: (
      state: GameState,
      _side: string,
      _eid: EID,
      _card: Card | null,
      _targets: unknown[],
    ) => {
      return n > 0;
    },
    msg: `sabotage ${n}`,
    async: true,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      _targets: unknown[],
    ) => {
      // Update stats
      const stats = (state.stats ??= {} as any);
      const runnerStats = (stats.runner ??= {} as any);
      runnerStats["cards-sabotaged"] =
        (runnerStats["cards-sabotaged"] ?? 0) + n;

      // Continue to the check-forcing ability
      resolveAbility(state, side, checkForcingAb, card, []);
    },
  };
}
