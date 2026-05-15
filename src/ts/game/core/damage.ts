// Damage resolution: net, meat, core/brain damage with prevention/boost.
// Mirrors: src/clj/game/core/damage.clj

import type { GameState } from "./state.js";
import type { Card } from "./card.js";
import type { EID } from "./eid.js";
import {
  completeWithResult, effectCompleted, makeEIDFrom,
} from "./eid.js";
import {
  checkpoint, queueEvent, triggerEvent, triggerEventSimult,
} from "./engine.js";
import { trashCards, getTrashEvent } from "./moving.js";
import { resolveDamagePrevention } from "./prevention.js";
import { systemMsg, nLastLogs } from "./say.js";
import { flatline } from "./winning.js";
import { wait_for } from "../macros.js";
import { enumerateCards } from "../utils.js";

/** Mirrors damage-name. */
export function damageName(damageType: string): string {
  switch (damageType) {
    case "net": return "net";
    case "meat": return "meat";
    case "core": return "core";
    case "brain": return "core";
    default: return "[UNKNOWN DAMAGE TYPE]";
  }
}

/** Mirrors enable-runner-damage-choice. */
export function enableRunnerDamageChoice(state: GameState, _side: string): void {
  state.damage.damageChooseRunner = true;
}

/** Mirrors enable-corp-damage-choice. */
export function enableCorpDamageChoice(state: GameState, _side: string): void {
  state.damage.damageChooseCorp = true;
}

/** Mirrors runner-can-choose-damage?. */
export function runnerCanChooseDamage(state: GameState): boolean {
  return !!state.damage.damageChooseRunner;
}

/** Mirrors corp-can-choose-damage?. */
export function corpCanChooseDamage(state: GameState): boolean {
  return !!state.damage.damageChooseCorp;
}

/** Mirrors chosen-damage. Appends flattened targets to chosen-damage list. */
export function chosenDamage(state: GameState, _side: string, ...targets: unknown[]): void {
  const flat = targets.flat(Infinity) as Card[];
  state.damage.chosenDamage = [...(state.damage.chosenDamage ?? []), ...flat];
}

function getChosenDamage(state: GameState): Card[] {
  return state.damage.chosenDamage ?? [];
}

/**
 * Determines which side acts if both can choose damage cards.
 * Currently only Chronos Protocol vs Titanium Ribs.
 * Mirrors damage-choice-priority.
 */
function damageChoicePriority(state: GameState): void {
  const activePlayer = state.activePlayer;
  if (corpCanChooseDamage(state) && runnerCanChooseDamage(state)) {
    if (activePlayer === "corp") {
      state.damage.damageChooseRunner = false;
    } else {
      state.damage.damageChooseCorp = false;
    }
  }
}

interface DamageOpts {
  card?: Card | null;
  cause?: string;
  unpreventable?: boolean;
  suppressCheckpoint?: boolean;
}

/**
 * Resolves the attempt to do n damage after both sides have acted.
 * Mirrors resolve-damage.
 */
function resolveDamage(
  state: GameState,
  side: string,
  eid: EID,
  dmgType: string,
  n: number,
  args: DamageOpts,
): void {
  const { card, cause, suppressCheckpoint } = args;

  state.damage.chosenDamage = [];
  damageChoicePriority(state);

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        if (!(n > 0)) {
          // shouldn't be possible, should be handled before getting here
          console.error(`attempted to resolve 0 damage: \n${nLastLogs(s, 5)}\n`);
          effectCompleted(s, side, eid);
          return;
        }

        const hand = s.runner.hand;
        const chosenCards = getChosenDamage(s);
        const chosenCids = new Set(chosenCards.map((c) => c.cid));
        const leftovers = hand.filter((c) => !chosenCids.has(c.cid));
        const shuffled = [...leftovers].sort(() => Math.random() - 0.5);
        const cardsTrashed = [
          ...chosenCards,
          ...shuffled.slice(0, n - chosenCards.length),
        ];

        if (dmgType === "brain") {
          s.runner.brainDamage += n;
        }

        const trashedMsg = enumerateCards(cardsTrashed, true);
        if (!trashedMsg) {
          effectCompleted(s, side, eid);
          return;
        }

        systemMsg(s, side, `trashes ${trashedMsg} due to ${damageName(dmgType)} damage`);

        const stats = (s as any).stats ?? {};
        stats.corp = stats.corp ?? {};
        stats.corp.damage = stats.corp.damage ?? {};
        stats.corp.damage.all = (stats.corp.damage.all ?? 0) + n;
        stats.corp.damage[dmgType] = (stats.corp.damage[dmgType] ?? 0) + n;
        (s as any).stats = stats;

        if (hand.length < n) {
          flatline(s);
          triggerEvent(s, side, "win", { winner: "corp" });
          trashCards(s, side, eid, cardsTrashed, { unpreventable: true });
          return;
        }

        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: any) {
              queueEvent(s2, "damage", {
                amount: n,
                card,
                "damage-type": dmgType,
                "from-side": side,
                cause,
                "cards-trashed": cardsTrashed,
              });

              if (suppressCheckpoint) {
                completeWithResult(s2, side, eid, cardsTrashed);
                return;
              }

              const trashEvent = getTrashEvent(side, false);
              const cpArgs = { durations: ["damage", trashEvent] };

              wait_for(
                s2,
                [
                  { asyncResult: "result" },
                  function (s3: GameState, _e3: EID, _b3: any) {
                    completeWithResult(s3, side, eid, cardsTrashed);
                  },
                ],
                [checkpoint, s2, null, makeEIDFrom(s2, eid), cpArgs],
                { eid },
              );
            },
          ],
          [
            trashCards, s, side, cardsTrashed,
            {
              unpreventable: true,
              cause: dmgType,
              suppressCheckpoint: true,
              suppressEvent: true,
            },
          ],
          { eid },
        );
      },
    ],
    [
      triggerEventSimult, state, side, "pre-resolve-damage", null,
      { "damage-type": dmgType, amount: n },
    ],
    { eid },
  );
}

/**
 * Attempts to deal n damage of the given type to the runner. Starts the
 * prevention/boosting process and eventually resolves the damage.
 * Mirrors damage.
 */
export function damage(
  state: GameState,
  side: string,
  eid: EID,
  type: string,
  n: number,
  args: DamageOpts = {},
): void {
  const { suppressCheckpoint } = args;

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: any) {
        const result = binds.asyncResult ?? {};
        const remaining = result.remaining as number | undefined;
        const resolvedType = (result.type as string) ?? type;
        const sourceCard = result["source-card"] as Card | null | undefined;

        if (typeof remaining === "number" && remaining > 0) {
          resolveDamage(s, side, eid, resolvedType, remaining, { ...args, card: sourceCard });
        } else {
          queueEvent(s, "all-damage-was-prevented", {
            side,
            type: resolvedType,
            "cause-card": sourceCard,
          });
          if (suppressCheckpoint) {
            effectCompleted(s, side, eid);
          } else {
            checkpoint(s, side, eid);
          }
        }
      },
    ],
    [resolveDamagePrevention, state, side, type, n, args],
    { eid },
  );
}
