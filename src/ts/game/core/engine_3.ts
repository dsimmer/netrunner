// Core game engine: ability resolution, event registration/triggering,
// checkpoints, and payment processing.
// Mirrors: src/clj/game/core/engine.clj

import { randomUUID } from "node:crypto";
import type { GameState, Prompt } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import type {
  Ability, ReqFn, MsgFn, AbilityFn, NumberFn, Cost, ChoicesSpec,
} from "./types.ts";
import type { Effect, RegisteredEvent } from "./state";
import { CORP_SIDE, RUNNER_SIDE, getPlayer } from "./state";
import {
  getTitle, getType, getSide, isCorp, isRunner, isInstalled,
  isRezzed, isFacedown, isFaceup, isAgenda, isICE, isUpgrade,
  isAsset, isCounter, isEvent, isOperation, isHardware, isProgram,
  isResource, isIdentity, isBasicAction, inHand, inDiscard, inRFG,
  getZone, inZone, printedTitle,
} from "./card";
import { getCardDef } from "./types.ts";
import {
  getEffectMaps, unregisterLingeringEffects, isDisabled,
  isDisabledReg, updateDisabledCards,
} from "./effects";
import {
  makeEID, makeEIDFrom, effectCompleted, completeWithResult,
} from "./eid";
import { getCard, findCID, getAllCards } from "./finding";
import {
  canPay, buildSpendMsg,
} from "./payment";
import {
  handler as payHandler,
} from "./costs";
import { addToPromptQueue } from "./prompt_state";
import {
  showPrompt, showSelect, showWaitPrompt, clearWaitPrompt,
} from "./prompts";
import { systemMsg, multiMsg, systemSay, nLastLogs } from "./say";
import { update } from "./update";
import { checkWinByAgenda } from "./winning";
import { updateMU } from "./memory";
import { cardStr } from "./to_string";
import { otherSide } from "../../jinteki/utils";
import {
  sameCard, sideStr, toKeyword, removeOnce, distinctBy,
  enumerateStr, inColl,
} from "../utils";
import {
  allActiveInstalled, allInstalled, allInstalledRunner,
  allInstalledRunnerType, clearEmptyRemotes,
} from "./board";
import { continue_ability, req, wait_for } from "../macros";
import { move as moveAction } from "./moving";
import { checkpoint } from "./checkpoint";
import type { CostData } from "./payment";
import { toC } from "./payment";

import { canTrigger, dissocReq, registerOnce, resolveAbility } from './engine_1';
import { automaticPriority, buildEventAbility, cardForAbility, gatherEvents, getAbilitySide, handlerSkippable, isActivePlayer, logEvent, triggerEventSyncNext, triggerSuppress, unregisterEventByUUID } from './engine_2';

/**
 * Trigger event synchronously.
 * Mirrors `trigger-event-sync`.
 */
export function triggerEventSync(
  state: GameState,
  side: string | null,
  eid: EID,
  event: string | null,
  ...targets: unknown[]
): void {
  side = side ?? "";
  if (!event) {
    effectCompleted(state, side, eid);
    return;
  }

  logEvent(state, event, targets);
  const activePlayer = state.activePlayer;
  const opponent = otherSide(activePlayer) ?? "";

  const isPlayer = (player: string, ability: any): boolean => {
    const s = getSide((ability as any).card ?? ability.card);
    const as2 = getAbilitySide(ability);
    return s === player || as2 === player;
  };

  const handlers = gatherEvents(state, side, eid, event, targets);
  const activePlayerEvents = handlers.filter((h) => isPlayer(activePlayer, h));
  const opponentEvents = handlers.filter((h) => isPlayer(opponent, h));

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _binds: any) {
        triggerEventSyncNext(s, opponent, eid, opponentEvents, event, targets);
      },
    ],
    [triggerEventSyncNext, state, activePlayer, makeEID(state), activePlayerEvents, event, targets],
    { eid },
  );
}

// ---------------------------------------------------------------------------
// Simultaneous event resolution
// ---------------------------------------------------------------------------

/**
 * Triggers simultaneous event handlers for a player.
 * Mirrors `trigger-event-simult-player`.
 */
function triggerEventSimultPlayer(
  state: GameState,
  side: string,
  eid: EID,
  handlers: RegisteredEvent[],
  cancelFn: ((state: GameState) => boolean) | null,
  eventTargets: unknown[],
): void {
  if (handlers.length === 0) {
    effectCompleted(state, side, eid);
    return;
  }

  const chooseHandler = (remaining: RegisteredEvent[], done?: boolean): Ability => {
    const filtered = (cancelFn && cancelFn(state))
      ? remaining
      : remaining.filter(
          (h) => {
            const card = cardForAbility(state, h);
            return card && !card.disabled;
          },
        );

    // Non-silent handlers
    const nonSilent = filtered.filter((h) => {
      const silent = (h.ability as any)?.silent;
      const card = cardForAbility(state, h);
      if (!silent) return true;
      if (silent === true) return false;
      return !(silent as ReqFn)(state, side, makeEID(state), card, eventTargets as Card[]);
    });

    const interactive = nonSilent.filter((h) => {
      const interactiveFn = (h.ability as any)?.interactive as ReqFn | undefined;
      const card = cardForAbility(state, h);
      return interactiveFn ? interactiveFn(state, side, makeEID(state), card, eventTargets as Card[]) : false;
    });

    // If only 1 handler or no interactive ones, auto-resolve
    if (filtered.length <= 1 || interactive.length === 0 || nonSilent.length <= 1) {
      const toResolve = nonSilent.length === 1 ? nonSilent[0] : filtered[0];
      const card = cardForAbility(state, toResolve);
      if (!card) {
        return {
          async: true,
          effect: req(() => {
            if (shouldContinue(state, handlers)) {
              continue_ability(state, side, chooseHandler(filtered.slice(1)), null, eventTargets);
            } else {
              effectCompleted(state, side, eid);
            }
          }),
        };
      }

      const remaining = nonSilent.length === 1
        ? filtered.filter((h) => !sameCard(card, cardForAbility(state, h)))
        : filtered.slice(1);

      return {
        async: true,
        effect: req(() => {
          if (toResolve.unregisterOnceResolved) {
            unregisterEventByUUID(state, side, toResolve.uuid);
          }
          const newEid = makeEID(state);
          newEid.source = card;
          newEid.sourceType = "ability";
          const cardSide = toKeyword(getSide(card) ?? side);
          wait_for(
            state,
            [
              { asyncResult: "result" },
              function (s: GameState, _e: EID, _b: any) {
                if (shouldContinue(s, handlers)) {
                  continue_ability(s, side, chooseHandler(remaining), null, eventTargets);
                } else {
                  effectCompleted(s, side, eid);
                }
              },
            ],
            [resolveAbility, state, cardSide, newEid, dissocReq(toResolve), card, eventTargets],
            { eid },
          );
        }),
      };
    }

    // Show prompt for manual ordering
    const titles = nonSilent.map((h) => {
      const abiName = (h.ability as any)?.abilityName as string | undefined;
      const card = cardForAbility(state, h);
      return abiName ?? card ?? ({ title: "unknown" } as Card);
    });
    const choices = [...titles.map((c) => (typeof c === "string" ? c : (getTitle(c) ?? ""))), "Done"];

    return {
      prompt: "Choose a trigger to resolve",
      choices,
      async: true,
      effect: req(() => {
        const target = (eventTargets[0] as string) ?? "";
        if (target === "Done") {
          // Resolve remaining handlers automatically
          for (const { handler: handlerAny } of handlers.filter(handlerSkippable) as any[]) {
            const handler: any = handlerAny;
            if (handler.unregisterOnceResolved) {
              unregisterEventByUUID(state, side, handler.uuid);
            }
            registerOnce(state, "", handler, handler.card);
          }
          const autoHandlers = handlers
            .filter((h) => !handlerSkippable(h))
            .sort((a, b) => (printedTitle((a as any).card) ?? "").localeCompare(printedTitle((b as any).card) ?? ""))
            .sort((a, b) => {
              const pa = (a.ability as any)?.automatic;
              const pb = (b.ability as any)?.automatic;
              return (automaticPriority[pa ?? true] ?? 10) - (automaticPriority[pb ?? true] ?? 10);
            })
            .map((h: any) => ({
              ...h,
              ability: { ...(h.ability as object), silent: true, interactive: undefined },
            }));

          if (autoHandlers.length > 0) {
            continue_ability(state, side, chooseHandler(autoHandlers as any, true), null, eventTargets);
          } else {
            effectCompleted(state, side, eid);
          }
        } else {
          // Find selected handler
          const toResolve = handlers.find((h) => {
            const card = cardForAbility(state, h);
            const abiName = (h.ability as any)?.abilityName;
            if (abiName) return abiName === target;
            return sameCard({ cid: (target as any)?.cid }, card);
          });
          if (!toResolve) {
            effectCompleted(state, side, eid);
            return;
          }
          const card = cardForAbility(state, toResolve);
          if (toResolve.unregisterOnceResolved) {
            unregisterEventByUUID(state, side, toResolve.uuid);
          }
          const newEid = makeEID(state);
          newEid.source = card;
          newEid.sourceType = "ability";

          wait_for(
            state,
            [
              { asyncResult: "result" },
              function (s: GameState, _e: EID, _b: any) {
                const remaining = handlers.filter((h) => h !== toResolve);
                if (shouldContinue(s, handlers)) {
                  continue_ability(s, side, chooseHandler(remaining), null, eventTargets);
                } else {
                  effectCompleted(s, side, eid);
                }
              },
            ],
            [resolveAbility, state, toKeyword(getSide(card) ?? side), newEid, dissocReq(toResolve), card, eventTargets],
            { eid },
          );
        }
      }),
    };
  };

  continue_ability(state, side, chooseHandler(handlers), null, eventTargets);
}

function shouldContinue(state: GameState, handlers: RegisteredEvent[]): boolean {
  return handlers.length > 1;
}

/**
 * Wrap a card ability as an event handler.
 * Mirrors `ability-as-handler`.
 */
export function abilityAsHandler(card: Card, ability: Ability): RegisteredEvent {
  return buildEventAbility({ ...ability, duration: (ability as any).duration ?? "pending" }, card);
}

/**
 * String description of internal event keyword.
 * Mirrors `event-title`.
 */
function eventTitle(event: string): string {
  return event.replace(/^:/, "");
}

/**
 * Trigger event simultaneously (manual ordering).
 * Mirrors `trigger-event-simult`.
 */
export function triggerEventSimult(
  state: GameState,
  side: string,
  eid: EID,
  event: string | null,
  opts: {
    firstAbility?: Ability;
    cardAbilities?: any[] | any;
    afterActivePlayer?: Ability;
    cancelFn?: (state: GameState) => boolean;
  },
  ...targets: unknown[]
): void {
  if (!event) {
    effectCompleted(state, side, eid);
    return;
  }

  logEvent(state, event, targets);
  const activePlayer = state.activePlayer;
  const opponent = otherSide(activePlayer) ?? "";
  const { firstAbility, cardAbilities, afterActivePlayer, cancelFn } = opts;

  const caList = cardAbilities
    ? Array.isArray(cardAbilities) ? cardAbilities : [cardAbilities]
    : [];

  const handlers = gatherEvents(state, side, eid, event, targets, caList);
  const activePlayerEvents = handlers.filter((h) => {
    const s = getSide(h.card);
    return s === activePlayer || getAbilitySide(h) === activePlayer;
  });
  const opponentEvents = handlers.filter((h) => {
    const s = getSide(h.card);
    return s === opponent || getAbilitySide(h) === opponent;
  });

  const cancelFunc = cancelFn ?? null;

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        showWaitPrompt(s, opponent, `${sideStr(activePlayer)} to resolve ${eventTitle(event)} triggers`);

        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: any) {
              if (afterActivePlayer) {
                (resolveAbility as any)(s2, side, eid, afterActivePlayer, null, []);
              }
              clearWaitPrompt(s2, opponent);
              showWaitPrompt(s2, activePlayer, `${sideStr(opponent)} to resolve ${eventTitle(event)} triggers`);

              wait_for(
                s2,
                [
                  { asyncResult: "result" },
                  function (s3: GameState, _e3: EID, _b3: any) {
                    clearWaitPrompt(s3, activePlayer);
                    effectCompleted(s3, side, eid);
                  },
                ],
                [triggerEventSimultPlayer, s2, opponent, makeEID(state), opponentEvents, cancelFunc, targets],
                { eid },
              );
            },
          ],
          [triggerEventSimultPlayer, s, activePlayer, makeEID(state), activePlayerEvents, cancelFunc, targets],
          { eid },
        );
      },
    ],
    firstAbility ? [resolveAbility, state, side, makeEID(state), firstAbility, null, []] : [],
    { eid },
  );
}

// ---------------------------------------------------------------------------
// Event queueing
// ---------------------------------------------------------------------------

/**
 * Queue an event for checkpoint processing.
 * Mirrors `queue-event`.
 */
export function queueEvent(
  state: GameState,
  event: string,
  contextMap?: Record<string, unknown> | null,
): void {
  if (!event) return;
  const queued = (state as any).queuedEvents ?? {};
  if (!Array.isArray(queued[event])) {
    queued[event] = [];
  }
  queued[event].push({ ...contextMap, event });
  (state as any).queuedEvents = queued;
}

/**
 * Gather queued event handlers.
 * Mirrors `gather-queued-event-handlers`.
 */
function gatherQueuedEventHandlers(
  state: GameState,
  eventMaps: Record<string, unknown[][]>,
): Array<{ handlers: RegisteredEvent[]; contextMaps: unknown[][] }> {
  const result: Array<{ handlers: RegisteredEvent[]; contextMaps: unknown[][] }> = [];
  for (const [event, contextMaps] of Object.entries(eventMaps)) {
    result.push({
      handlers: state.events.filter((e) => e.event === event),
      contextMaps: [...(contextMaps as unknown[][])],
    });
  }
  return result;
}

/**
 * Create handler-context instances.
 * Mirrors `create-instances`.
 */
function createInstances(
  entry: { handlers: RegisteredEvent[]; contextMaps: unknown[][] },
): Array<{ handler: RegisteredEvent; context: unknown[] }> {
  const out: Array<{ handler: RegisteredEvent; context: unknown[] }> = [];
  for (const handler of entry.handlers) {
    if ((handler as any).oncePerInstance) {
      out.push({ handler, context: entry.contextMaps });
    } else {
      for (const context of entry.contextMaps) {
        out.push({ handler, context: [context] });
      }
    }
  }
  return out;
}

/**
 * Create and filter handlers from queued events.
 * Mirrors `create-handlers`.
 */
function createHandlers(
  state: GameState,
  eid: EID,
  eventMaps: Record<string, unknown[][]>,
): Array<{ handler: RegisteredEvent; context: unknown[] }> {
  const entries = gatherQueuedEventHandlers(state, eventMaps);
  const instances = entries.flatMap(createInstances);

  const valid = instances.filter(({ handler, context }) => {
    const card = cardForAbility(state, handler);
    if (!card) return false;
    if (triggerSuppress(state, toKeyword(getSide(card) ?? ""), handler.event, card, ...context)) return false;
    return canTrigger(state, toKeyword(getSide(card) ?? ""), eid, handler, card, context);
  });

  // Sort: non-active player first
  valid.sort((a, b) => {
    const aActive = isActivePlayer(state, a.handler) ? 1 : 0;
    const bActive = isActivePlayer(state, b.handler) ? 1 : 0;
    return aActive - bActive;
  });

  return valid;
}

/**
 * Trigger queued events for a player.
 * Mirrors `trigger-queued-event-player`.
 */
function triggerQueuedEventPlayer(
  state: GameState,
  side: string,
  eid: EID,
  handlers: Array<{ handler: RegisteredEvent; context: unknown[] }>,
  args: { cancelFn?: (state: GameState) => boolean },
): void {
  if (handlers.length === 0) {
    effectCompleted(state, "", eid);
    return;
  }

  const cancelFn = args.cancelFn ?? null;
  const filtered = (cancelFn && cancelFn(state))
    ? handlers
    : handlers.filter((h) => {
        const card = cardForAbility(state, h.handler);
        if (!card || card.disabled) return false;
        return !triggerSuppress(state, toKeyword(getSide(card) ?? ""), h.handler.event, card, ...h.context);
      });

  const nonSilent = filtered.filter((h) => {
    const silent = (h.handler.ability as any)?.silent;
    if (!silent) return true;
    const card = cardForAbility(state, h.handler);
    if (silent === true) return false;
    return !(silent as ReqFn)(state, side, makeEID(state), card, h.context as Card[]);
  });

  const interactive = nonSilent.filter((h) => {
    const interactiveFn = (h.handler.ability as any)?.interactive as ReqFn | undefined;
    const card = cardForAbility(state, h.handler);
    return interactiveFn ? interactiveFn(state, side, makeEID(state), card, h.context as Card[]) : false;
  });

  if (filtered.length <= 1 || interactive.length === 0 || nonSilent.length <= 1) {
    const h = nonSilent.length === 1 ? nonSilent[0] : filtered[0];
    const toResolve = h.handler;
    const ability = toResolve;
    const context = h.context;
    const abilityCard = cardForAbility(state, toResolve);
    const remaining = nonSilent.length === 1
      ? filtered.filter((fh) => !sameCard(abilityCard, cardForAbility(state, fh.handler)))
      : filtered.slice(1);

    if (abilityCard) {
      if (toResolve.unregisterOnceResolved) {
        unregisterEventByUUID(state, side, toResolve.uuid);
      }
      const newEid = makeEID(state);
      newEid.source = abilityCard;
      newEid.sourceType = "ability";

      wait_for(
        state,
        [
          { asyncResult: "result" },
          function (s: GameState, _e: EID, _b: any) {
            triggerQueuedEventPlayer(s, side, eid, remaining, args);
          },
        ],
        [resolveAbility, state, toKeyword(getSide(abilityCard) ?? ""), newEid, dissocReq(ability), abilityCard, context],
        { eid },
      );
    } else {
      triggerQueuedEventPlayer(state, side, eid, remaining, args);
    }
  } else {
    // Show prompt
    const choicesMap = filtered.map((h) => {
      const card = cardForAbility(state, h.handler);
      const abiName = (h.handler.ability as any)?.abilityName;
      return [abiName ?? card ?? { title: "unknown" } as Card, h];
    });
    const choicesTitles = [...choicesMap.map(([c]) => getTitle(c) ?? ""), "Done"];

    continue_ability(
      state,
      side,
      {
        async: true,
        prompt: "Choose a trigger to resolve",
        choices: choicesTitles,
        effect: req((_st: any, _sd: any, _eid: any, _c: any, eventTargets: any[]) => {
          const target = (eventTargets[0] as string) ?? "";
          if (target === "Done") {
            for (const { handler: h } of filtered.filter(handlerSkippable)) {
              if (h.unregisterOnceResolved) unregisterEventByUUID(state, side, h.uuid);
              registerOnce(state, "", h, h.card);
            }
            const autoHandlers = filtered
              .filter((h) => !handlerSkippable(h))
              .sort((a, b) => (printedTitle(a.handler.card) ?? "").localeCompare(printedTitle(b.handler.card) ?? ""))
              .sort((a, b) => {
                const pa = (a.handler.ability as any)?.automatic;
                const pb = (b.handler.ability as any)?.automatic;
                return (automaticPriority[pa ?? true] ?? 10) - (automaticPriority[pb ?? true] ?? 10);
              })
              .map((h: any) => ({
                ...h,
                handler: { ...h.handler, ability: { ...(h.handler.ability as object), silent: true, interactive: undefined } },
              }));
            if (autoHandlers.length > 0) {
              triggerQueuedEventPlayer(state, side, eid, autoHandlers as any, args);
            } else {
              effectCompleted(state, side, eid);
            }
          } else {
            const match = choicesMap.find(([c]) => getTitle(c) === target || sameCard(target as any, c));
            const handler = match?.[1];
            if (!handler) {
              effectCompleted(state, side, eid);
              return;
            }
            const toResolve = handler.handler;
            const card = cardForAbility(state, toResolve);
            if (toResolve.unregisterOnceResolved) unregisterEventByUUID(state, side, toResolve.uuid);
            const newEid = makeEID(state);
            newEid.source = card;
            newEid.sourceType = "ability";

            wait_for(
              state,
              [
                { asyncResult: "result" },
                function (s: GameState, _e: EID, _b: any) {
                  const remaining = filtered.filter((h) => h !== handler);
                  triggerQueuedEventPlayer(s, side, eid, remaining, args);
                },
              ],
              [resolveAbility, state, toKeyword(getSide(card) ?? ""), newEid, dissocReq(toResolve), card, handler.context],
              { eid },
            );
          }
        }),
      },
      null,
      null,
    );
  }
}

/**
 * Mark pending abilities (from queued events).
 * Mirrors `mark-pending-abilities`.
 */
export function markPendingAbilities(
  state: GameState,
  eid: EID,
  _args: any,
): { handlers: Array<{ handler: RegisteredEvent; context: unknown[] }>; contextMaps: unknown[] } {
  const eventMaps = (state as any).queuedEvents ?? {};
  for (const [event, contextMaps] of Object.entries(eventMaps)) {
    logEvent(state, event, contextMaps as unknown[]);
  }
  if (Object.keys(eventMaps).length === 0) {
    return { handlers: [], contextMaps: [] };
  }
  const handlers = createHandlers(state, eid, eventMaps);
  (state as any).queuedEvents = {};
  state.events = state.events.filter((e) => e.duration !== "pending");
  return { handlers, contextMaps: Object.values(eventMaps).flat() as unknown[] };
}

/**
 * Trigger pending abilities at checkpoint.
 * Mirrors `trigger-pending-abilities`.
 */
export function triggerPendingAbilities(
  state: GameState,
  eid: EID,
  handlers: Array<{ handler: RegisteredEvent; context: unknown[] }>,
  args: any,
): void {
  if (handlers.length === 0) {
    effectCompleted(state, "", eid);
    return;
  }

  const activePlayer = state.activePlayer;
  const opponent = otherSide(activePlayer) ?? "";

  const isPlayer = (player: string, h: { handler: RegisteredEvent }) => {
    const s = getSide(h.handler.card);
    const as2 = getAbilitySide(h.handler);
    return s === player || as2 === player;
  };

  const activePlayerHandlers = handlers.filter((h) => isPlayer(activePlayer, h));
  const opponentHandlers = handlers.filter((h) => isPlayer(opponent, h));

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        showWaitPrompt(s, opponent, `${sideStr(activePlayer)} to resolve pending triggers`);

        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: any) {
              clearWaitPrompt(s2, opponent);
              showWaitPrompt(s2, activePlayer, `${sideStr(opponent)} to resolve pending triggers`);

              wait_for(
                s2,
                [
                  { asyncResult: "result" },
                  function (s3: GameState, _e3: EID, _b3: any) {
                    clearWaitPrompt(s3, activePlayer);
                    effectCompleted(s3, "", eid);
                  },
                ],
                [triggerQueuedEventPlayer, s2, opponent, makeEID(state, eid), opponentHandlers, args],
                { eid },
              );
            },
          ],
          [triggerQueuedEventPlayer, s, activePlayer, makeEID(state, eid), activePlayerHandlers, args],
          { eid },
        );
      },
    ],
    [],
    { eid },
  );
}
