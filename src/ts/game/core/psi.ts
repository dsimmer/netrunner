// PSI game.
// Mirrors: src/clj/game/core/psi.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability, PsiAbility, Side } from "./types";
import { corp } from "./card";
import { totalAvailableCredits } from "./costs";
import { makeEIDFrom, effectCompleted, registerEIDCallback } from "./eid";
import {
  canTrigger,
  pay,
  registerAbilityType,
  registerOnce,
  resolveAbility,
  triggerEventSimult,
} from "./engine";
import { anyFlagFn } from "./flags";
import { clearWaitPrompt, showPromptWithDice, showWaitPrompt } from "./prompts";
import { systemMsg } from "./say";
import { continue_ability, effect } from "../macros";
import { strToInt } from "../../jinteki/utils";
import { toC } from "./payment";

/**
 * Convert a bet number to a stats key.
 * Mirrors: bet-to-keyword
 */
function betToKeyword(bet: number): string {
  return `bet-${bet}`;
}

/**
 * Update stats for psi games. Mirrors the swap! update-in calls in Clojure.
 */
type PsiStatsMap = Record<string, number>;
type SideStatsMap = Record<string, PsiStatsMap | Record<string, unknown>>;
type StatsMap = Record<string, SideStatsMap>;

function updatePsiStats(state: GameState, side: string, bet: number): void {
  const stats: StatsMap = (state.stats ?? {}) as StatsMap;
  const sideStats: SideStatsMap = (stats[side] ?? {}) as SideStatsMap;
  const psiGame = (sideStats["psi-game"] ?? {}) as PsiStatsMap;
  psiGame[betToKeyword(bet)] = (psiGame[betToKeyword(bet)] ?? 0) + 1;
  psiGame["games-played"] = (psiGame["games-played"] ?? 0) + 1;
  sideStats["psi-game"] = psiGame;
  stats[side] = sideStats;
  state.stats = stats;
}

/**
 * Update psi win stats for a given side.
 */
function updatePsiWinStats(state: GameState, winningSide: string): void {
  const stats: StatsMap = (state.stats ?? {}) as StatsMap;
  const sideStats: SideStatsMap = (stats[winningSide] ?? {}) as SideStatsMap;
  const psiGame = (sideStats["psi-game"] ?? {}) as PsiStatsMap;
  psiGame.wins = (psiGame.wins ?? 0) + 1;
  sideStats["psi-game"] = psiGame;
  stats[winningSide] = sideStats;
  state.stats = stats;
}

/**
 * Resolves a psi game by charging credits to both sides and invoking the
 * appropriate resolution ability.
 * Mirrors: resolve-psi
 */
function resolvePsi(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  psi: PsiAbility,
  bet: number,
  targets: unknown[],
): void {
  updatePsiStats(state, side, bet);

  // Store the bet — mirrors (swap! state assoc-in [:psi side] bet)
  if (!state.psi) {
    state.psi = { bet: {} };
  }
  state.psi.bet[side] = bet;

  const opponent = side === "corp" ? "runner" : "corp";
  const opponentBet = state.psi.bet[opponent];

  if (opponentBet != null) {
    // Both sides have bet — resolve the psi game
    //
    // Mirrors the nested wait-for chain:
    // (wait-for (pay opponent ...) (system-msg opponent ...)
    //   (wait-for (pay side ...) (system-msg side ...)
    //     (clear-wait-prompt opponent)
    //     (wait-for (trigger-event-simult ...) ...)))
    //
    // We chain using EID callbacks to replicate the async sequencing.

    const resolveEid = makeEIDFrom(state, eid);

    // Register the full resolution chain as a callback on resolveEid
    registerEIDCallback(
      state,
      resolveEid,
      (s: GameState, _side: string, _resultEid: EID) => {
        // At this point both payments are done

        systemMsg(s, side, "psi-resolved");
        clearWaitPrompt(s, opponent);

        const corpCredits = s.psi?.bet.corp ?? 0;
        const runnerCredits = s.psi?.bet.runner ?? 0;

        triggerEventSimult(
          s,
          side,
          makeEIDFrom(s, eid),
          "reveal-spent-credits",
          {
            firstAbility: {
              async: true,
              effect: effect(function (
                st: GameState,
                _s: string,
                _e: EID,
                _c: Card,
                _t: unknown[],
              ) {
                const cardSide = corp(card) ? "corp" : "runner";
                // Clojure: (if (= bet opponent-bet) (:equal psi) (:not-equal psi))
                const ability =
                  bet === opponentBet
                    ? (psi.equal ?? psi.notEqual ?? psi["not-equal"])
                    : (psi.notEqual ?? psi["not-equal"] ?? psi.unequal);

                if (ability) {
                  updatePsiWinStats(st, cardSide);
                  continue_ability(
                    st,
                    cardSide,
                    { ...ability, async: true },
                    card,
                    targets,
                  );
                } else {
                  const loserSide = cardSide === "corp" ? "runner" : "corp";
                  updatePsiWinStats(st, loserSide);
                  effectCompleted(st, side, eid);
                }
              }),
            },
          },
          { corpCredits, runnerCredits },
        );
      },
    );

    // Pay opponent first, then pay side, then fire resolveEid callback
    const sidePayEid = makeEIDFrom(state, eid);
    registerEIDCallback(state, sidePayEid, () => {
      // Side payment done — trigger the resolution
      effectCompleted(state, side, resolveEid);
    });

    const opponentPayEid = makeEIDFrom(state, eid);
    registerEIDCallback(state, opponentPayEid, () => {
      systemMsg(state, opponent, "psi-resolved");
      // Now pay the initiating side
      pay(state, side, sidePayEid, card, [toC("credit", bet)]);
    });

    // Pay opponent
    pay(state, opponent, opponentPayEid, card, [toC("credit", opponentBet)]);
  } else {
    // Opponent hasn't bet yet — show wait prompt
    // Mirrors: (show-wait-prompt state side (str (string/capitalize (name opponent)) " to choose psi game credits"))
    showWaitPrompt(
      state,
      side,
      `${opponent.charAt(0).toUpperCase() + opponent.slice(1)} to choose psi game credits`,
    );
  }
}

/**
 * Starts a psi game by showing the psi prompt to both players. psi is a map
 * containing :equal and :not-equal abilities which will be triggered in
 * resolve-psi accordingly.
 * Mirrors: psi-game
 */
export function psiGame(
  state: GameState,
  side: string,
  card: Card,
  psi: PsiAbility,
  targets?: unknown[],
): void {
  const eid = makeEIDFrom(state, null);
  eid.sourceType = "psi";

  // Mirrors: (swap! state assoc :psi {})
  state.psi = { bet: {} };

  // Mirrors: (register-once state side psi card)
  registerOnce(state, side, psi as unknown as Ability, card);

  const eidForPrompts: EID = { ...eid, sourceType: "psi" };

  for (const s of ["corp", "runner"] as const) {
    // Mirrors: (total-available-credits state s eid card)
    const maxCredits = totalAvailableCredits(state, s, eidForPrompts, card);

    // Mirrors: (range (min 3 (inc (total-available-credits ...))))
    const allAmounts: number[] = [];
    for (let i = 0; i <= Math.min(3, maxCredits); i++) {
      allAmounts.push(i);
    }

    // Mirrors: (remove #(or (any-flag-fn? state :corp :prevent-secretly-spend %)
    //                      (any-flag-fn? state :runner :prevent-secretly-spend %))
    //                     all-amounts)
    const validAmounts = allAmounts.filter((amount: number) => {
      return !(
        anyFlagFn(state, "corp", "prevent-secretly-spend", amount) ||
        anyFlagFn(state, "runner", "prevent-secretly-spend", amount)
      );
    });

    // Mirrors: (map #(str % " [Credits]") valid-amounts)
    const choices = validAmounts.map((n: number) => `${n} [Credits]`);

    showPromptWithDice(
      state,
      s,
      card,
      `Choose an amount to spend for ${card.title ?? "card"}`,
      choices,
      (choice: string) => {
        // Mirrors: (str->int (first (string/split (:value %) #" ")))
        const bet = strToInt(choice.split(" ")[0]);
        resolvePsi(state, s, eidForPrompts, card, psi, bet, targets ?? []);
      },
      { eid: eidForPrompts, promptType: "psi" },
    );
  }
}

/**
 * Checks if a psi-game is to be resolved.
 * Mirrors: check-psi
 */
function checkPsi(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
): void {
  if (!card) {
    const eid = (ability.eid as EID | undefined) ?? makeEIDFrom(state, null);
    effectCompleted(state, side, eid as EID);
    return;
  }
  const psi = ability.psi as PsiAbility | undefined;
  if (!psi) {
    const eid = (ability.eid as EID | undefined) ?? makeEIDFrom(state, null);
    effectCompleted(state, side, eid as EID);
    return;
  }

  // Mirrors: (assert (not (contains? psi :async)) "Put :async in the :equal/:not-equal.")
  if ((psi as { async?: boolean }).async) {
    throw new Error("Put :async in the :equal/:not-equal.");
  }

  const eid = (ability.eid as EID | undefined) ?? makeEIDFrom(state, null);

  if (canTrigger(state, side, eid as EID, ability, card, targets)) {
    // Mirrors: (resolve-ability state side
    //   (-> ability (dissoc :psi :once :req)
    //       (assoc :async true :effect (effect (psi-game eid card psi targets))))
    //   card targets)
    const { psi: _psi, once: _once, req: _req, ...restAbility } = ability;
    resolveAbility(
      state,
      side,
      {
        ...restAbility,
        async: true,
        effect: effect(function (
          s: GameState,
          _side: string,
          e: EID,
          c: Card,
          t: unknown[],
        ) {
          psiGame(s, side, c, psi!, t);
        }),
      },
      card,
      targets,
    );
  } else {
    effectCompleted(state, side, eid as EID);
  }
}

registerAbilityType("psi", checkPsi);
