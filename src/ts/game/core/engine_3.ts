// Core game engine: ability resolution, event registration/triggering,
// checkpoints, and payment processing.
// Mirrors: src/clj/game/core/engine.clj

import { randomUUID } from "node:crypto";
import type { GameState, Prompt, GameEvent } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import type { Ability, AbilityFn, ChoicesSpec, Cost, MsgFn, NumberFn, ReqFn } from "./types";
import type { Effect, RegisteredEvent } from "./state";
import { CORP_SIDE, RUNNER_SIDE, getPlayer } from "./state";
import {
  getTitle, getType, getSide, isCorp, isRunner, isInstalled,
  isRezzed, isFacedown, isFaceup, isAgenda, isICE, isUpgrade,
  isAsset, isCounter, isEvent, isOperation, isHardware, isProgram,
  isResource, isIdentity, isBasicAction, inHand, inDiscard, inRFG,
  getZone, inZone, printedTitle,
} from "./card";
import { getCardDef } from "./types";
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

  const isPlayer = (player: string, ability: RegisteredEvent): boolean => {
    const s = getSide(ability.card);
    const as2 = getAbilitySide(ability);
    return s === player || as2 === player;
  };

  const handlers = gatherEvents(state, side, eid, event, targets);
  const activePlayerEvents = handlers.filter((h: RegisteredEvent) => isPlayer(activePlayer, h));
  const opponentEvents = handlers.filter((h: RegisteredEvent) => isPlayer(opponent, h));

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _binds: Record<string, unknown>) {
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
    const nonSilent = filtered.filter((h: RegisteredEvent) => {
      const silent = (h.ability as Ability | undefined)?.silent;
      const card = cardForAbility(state, h);
      if (!silent) return true;
      if (silent === true) return false;
      if (typeof silent !== "function") return !silent;
      return !(silent as AbilityFn)(state, side, makeEID(state), card, eventTargets as Card[]);
    });

    const interactive = nonSilent.filter((h: RegisteredEvent) => {
      const interactiveFn = (h.ability as Ability | undefined)?.interactive as ReqFn | undefined;
      const card = cardForAbility(state, h);
      if (!interactiveFn) return false;
      if (typeof interactiveFn !== "function") return !!interactiveFn;
      return (interactiveFn as AbilityFn)(state, side, makeEID(state), card, eventTargets as Card[]);
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
        ? filtered.filter((h: RegisteredEvent) => !sameCard(card, cardForAbility(state, h)))
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
              function (s: GameState, _e: EID, _b: Record<string, unknown>) {
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
    const titles = nonSilent.map((h: RegisteredEvent) => {
      const abiName = (h.ability as Ability | undefined)?.abilityName as string | undefined;
      const card = cardForAbility(state, h);
      return abiName ?? card ?? ({ title: "unknown" } as Card);
    });
    const choices = [
      ...titles.map((c) => (typeof c === "string" ? c : (getTitle(c) ?? ""))),
      "Done",
    ];

    return {
      prompt: "Choose a trigger to resolve",
      choices,
      async: true,
      effect: req(() => {
        const target = (eventTargets[0] as string) ?? "";
        if (target === "Done") {
          // Resolve remaining handlers automatically
          for (const handler of handlers.filter(handlerSkippable)) {
            if (handler.unregisterOnceResolved) {
              unregisterEventByUUID(state, side, handler.uuid);
            }
            registerOnce(state, "", handler.ability ?? {}, handler.card);
          }
          const autoHandlers = handlers
            .filter((h: RegisteredEvent) => !handlerSkippable(h))
            .sort((a: RegisteredEvent, b: RegisteredEvent) =>
              (printedTitle(a.card) ?? "").localeCompare(printedTitle(b.card) ?? ""),
            )
            .sort((a: RegisteredEvent, b: RegisteredEvent) => {
              const pa = (a.ability as Ability | undefined)?.automatic;
              const pb = (b.ability as Ability | undefined)?.automatic;
              return (automaticPriority[(pa as string) ?? "true"] ?? 10) - (automaticPriority[(pb as string) ?? "true"] ?? 10);
            })
            .map((h: RegisteredEvent) => ({
              ...h,
              ability: { ...((h.ability as object) ?? {}), silent: true, interactive: undefined },
            }));

          if (autoHandlers.length > 0) {
            continue_ability(state, side, chooseHandler(autoHandlers, true), null, eventTargets);
          } else {
            effectCompleted(state, side, eid);
          }
        } else {
          // Find selected handler
          const toResolve = handlers.find((h: RegisteredEvent) => {
            const card = cardForAbility(state, h);
            const abiName = (h.ability as Ability | undefined)?.abilityName;
            if (abiName) return abiName === target;
            const tgt = target as unknown as { cid?: string };
            return sameCard({ cid: tgt?.cid ?? "" }, card);
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
              function (s: GameState, _e: EID, _b: Record<string, unknown>) {
                const remaining = handlers.filter((h: RegisteredEvent) => h !== toResolve);
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
  return buildEventAbility({ ...ability, duration: ability.duration ?? "pending" }, card);
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
interface TriggerEventSimultOpts {
  firstAbility?: Ability;
  cardAbilities?: RegisteredEvent[] | RegisteredEvent | null;
  afterActivePlayer?: Ability;
  cancelFn?: (state: GameState) => boolean;
}

export function triggerEventSimult(state: GameState, side: string, event: string | null, opts: TriggerEventSimultOpts | null, ...targets: unknown[]): void;
export function triggerEventSimult(state: GameState, side: string, eid: EID, event: string | null, opts: TriggerEventSimultOpts | null, ...targets: unknown[]): void;
export function triggerEventSimult(
  state: GameState,
  side: string,
  arg3: EID | string | null,
  arg4: TriggerEventSimultOpts | string | null,
  arg5?: unknown,
  ...rest: unknown[]
): void {
  let eid: EID;
  let event: string | null;
  let opts: TriggerEventSimultOpts;
  let targets: unknown[];

  if (typeof arg3 === "string" || arg3 === null) {
    // 4-arg form: (state, side, event, opts, ...targets)
    eid = makeEID(state);
    event = arg3;
    opts = (arg4 as TriggerEventSimultOpts) ?? {};
    targets = arg5 !== undefined ? [arg5, ...rest] : [];
  } else {
    // 5-arg form: (state, side, eid, event, opts, ...targets)
    eid = arg3;
    event = (arg4 as string | null) ?? null;
    opts = (arg5 as TriggerEventSimultOpts) ?? {};
    targets = rest;
  }
  return _triggerEventSimult(state, side, eid, event, opts, ...targets);
}
function _triggerEventSimult(
  state: GameState,
  side: string,
  eid: EID,
  event: string | null,
  opts: TriggerEventSimultOpts,
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
  const activePlayerEvents = handlers.filter((h: RegisteredEvent) => {
    const s = getSide(h.card);
    return s === activePlayer || getAbilitySide(h) === activePlayer;
  });
  const opponentEvents = handlers.filter((h: RegisteredEvent) => {
    const s = getSide(h.card);
    return s === opponent || getAbilitySide(h) === opponent;
  });

  const cancelFunc = cancelFn ?? null;

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: Record<string, unknown>) {
        showWaitPrompt(s, opponent, `${sideStr(activePlayer)} to resolve ${eventTitle(event)} triggers`);

        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: Record<string, unknown>) {
              if (afterActivePlayer) {
                resolveAbility(s2, side, eid, afterActivePlayer, null, []);
              }
              clearWaitPrompt(s2, opponent);
              showWaitPrompt(s2, activePlayer, `${sideStr(opponent)} to resolve ${eventTitle(event)} triggers`);

              wait_for(
                s2,
                [
                  { asyncResult: "result" },
                  function (s3: GameState, _e3: EID, _b3: Record<string, unknown>) {
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
  const queued = (state.queuedEvents ?? {}) as unknown as Record<string, Record<string, unknown>[]>;
  if (!Array.isArray(queued[event])) {
    queued[event] = [];
  }
  queued[event].push({ ...contextMap, event });
  state.queuedEvents = queued as unknown as GameEvent[];
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
      handlers: state.events.filter((e: RegisteredEvent) => e.event === event),
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
    if (handler.oncePerInstance) {
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
interface HandlerCtx {
  handler: RegisteredEvent;
  context: unknown[];
}

function createHandlers(
  state: GameState,
  eid: EID,
  eventMaps: Record<string, unknown[][]>,
): HandlerCtx[] {
  const entries = gatherQueuedEventHandlers(state, eventMaps);
  const instances = entries.flatMap(createInstances);

  const valid = instances.filter(({ handler, context }) => {
    const card = cardForAbility(state, handler);
    if (!card) return false;
    if (triggerSuppress(state, toKeyword(getSide(card) ?? ""), handler.event, card, ...context)) return false;
    return canTrigger(state, toKeyword(getSide(card) ?? ""), eid, handler, card, context);
  });

  // Sort: non-active player first
  valid.sort((a: HandlerCtx, b: HandlerCtx) => {
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
  handlers: HandlerCtx[],
  args: PendingAbilitiesArgs | null | undefined,
): void {
  if (handlers.length === 0) {
    effectCompleted(state, "", eid);
    return;
  }

  const cancelFn = args?.cancelFn ?? null;
  const filtered = (cancelFn && cancelFn(state))
    ? handlers
    : handlers.filter((h: HandlerCtx) => {
        const card = cardForAbility(state, h.handler);
        if (!card || card.disabled) return false;
        return !triggerSuppress(state, toKeyword(getSide(card) ?? ""), h.handler.event, card, ...h.context);
      });

  const nonSilent = filtered.filter((h: HandlerCtx) => {
    const silent = (h.handler.ability as Ability | undefined)?.silent;
    if (!silent) return true;
    const card = cardForAbility(state, h.handler);
    if (silent === true) return false;
    if (typeof silent !== "function") return !silent;
    return !(silent as AbilityFn)(state, side, makeEID(state), card, h.context as Card[]);
  });

  const interactive = nonSilent.filter((h: HandlerCtx) => {
    const interactiveFn = (h.handler.ability as Ability | undefined)?.interactive as ReqFn | undefined;
    const card = cardForAbility(state, h.handler);
    if (!interactiveFn) return false;
    if (typeof interactiveFn !== "function") return !!interactiveFn;
    return (interactiveFn as AbilityFn)(state, side, makeEID(state), card, h.context as Card[]);
  });

  if (filtered.length <= 1 || interactive.length === 0 || nonSilent.length <= 1) {
    const h = nonSilent.length === 1 ? nonSilent[0] : filtered[0];
    if (!h) {
      effectCompleted(state, side, eid);
      return;
    }
    const toResolve = h.handler;
    const context = h.context;
    const abilityCard = cardForAbility(state, toResolve);
    const remaining = nonSilent.length === 1
      ? filtered.filter((fh: HandlerCtx) => !sameCard(abilityCard, cardForAbility(state, fh.handler)))
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
          function (s: GameState, _e: EID, _b: Record<string, unknown>) {
            triggerQueuedEventPlayer(s, side, eid, remaining, args);
          },
        ],
        [resolveAbility, state, toKeyword(getSide(abilityCard) ?? ""), newEid, dissocReq(toResolve.ability ?? {}), abilityCard, context],
        { eid },
      );
    } else {
      triggerQueuedEventPlayer(state, side, eid, remaining, args);
    }
  } else {
    // Show prompt
    const choicesMap: Array<[Card | string, HandlerCtx]> = filtered.map((h: HandlerCtx) => {
      const card = cardForAbility(state, h.handler);
      const abiName = (h.handler.ability as Ability | undefined)?.abilityName as string | undefined;
      const entry: Card | string = abiName ?? card ?? ({ title: "unknown", cid: "" } as Card);
      return [entry, h];
    });
    const choicesTitles = [
      ...choicesMap.map(([c]) => (typeof c === "string" ? c : (getTitle(c) ?? ""))),
      "Done",
    ];

    continue_ability(
      state,
      side,
      {
        async: true,
        prompt: "Choose a trigger to resolve",
        choices: choicesTitles,
        effect: req((_st: GameState, _sd: string, _eid: EID, _c: Card | null, eventTargets: unknown[]) => {
          const target = (eventTargets[0] as string) ?? "";
          if (target === "Done") {
            for (const skippable of filtered.filter(handlerSkippable)) {
              const h = skippable.handler;
              if (h.unregisterOnceResolved) unregisterEventByUUID(state, side, h.uuid);
              registerOnce(state, "", h.ability ?? {}, h.card);
            }
            const autoHandlers = filtered
              .filter((h: HandlerCtx) => !handlerSkippable(h))
              .sort((a: HandlerCtx, b: HandlerCtx) =>
                (printedTitle(a.handler.card) ?? "").localeCompare(printedTitle(b.handler.card) ?? ""),
              )
              .sort((a: HandlerCtx, b: HandlerCtx) => {
                const pa = (a.handler.ability as Ability | undefined)?.automatic as string | undefined;
                const pb = (b.handler.ability as Ability | undefined)?.automatic as string | undefined;
                return (automaticPriority[pa ?? "true"] ?? 10) - (automaticPriority[pb ?? "true"] ?? 10);
              })
              .map((h: HandlerCtx): HandlerCtx => ({
                ...h,
                handler: { ...h.handler, ability: { ...((h.handler.ability as object) ?? {}), silent: true, interactive: undefined } },
              }));
            if (autoHandlers.length > 0) {
              triggerQueuedEventPlayer(state, side, eid, autoHandlers, args);
            } else {
              effectCompleted(state, side, eid);
            }
          } else {
            const match = choicesMap.find(([c]) => {
              if (typeof c === "string") return c === target;
              return getTitle(c) === target || sameCard(target as unknown as Card, c);
            });
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
                function (s: GameState, _e: EID, _b: Record<string, unknown>) {
                  const remaining = filtered.filter((h: HandlerCtx) => h !== handler);
                  triggerQueuedEventPlayer(s, side, eid, remaining, args);
                },
              ],
              [resolveAbility, state, toKeyword(getSide(card) ?? ""), newEid, dissocReq(toResolve.ability ?? {}), card, handler.context],
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
interface PendingAbilitiesArgs {
  cancelFn?: (state: GameState) => boolean;
  duration?: string;
  durations?: string[];
  [key: string]: unknown;
}

export function markPendingAbilities(
  state: GameState,
  eid: EID,
  _args: PendingAbilitiesArgs | null | undefined,
): { handlers: HandlerCtx[]; contextMaps: unknown[] } {
  const eventMaps = (state.queuedEvents ?? {}) as unknown as Record<string, unknown[][]>;
  for (const [event, contextMaps] of Object.entries(eventMaps)) {
    logEvent(state, event, contextMaps as unknown[]);
  }
  if (Object.keys(eventMaps).length === 0) {
    return { handlers: [], contextMaps: [] };
  }
  const handlers = createHandlers(state, eid, eventMaps);
  state.queuedEvents = {} as unknown as GameEvent[];
  state.events = state.events.filter((e: RegisteredEvent) => e.duration !== "pending");
  return { handlers, contextMaps: Object.values(eventMaps).flat() as unknown[] };
}

/**
 * Trigger pending abilities at checkpoint.
 * Mirrors `trigger-pending-abilities`.
 */
export function triggerPendingAbilities(
  state: GameState,
  eid: EID,
  handlers: HandlerCtx[],
  args: PendingAbilitiesArgs | null | undefined,
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

  const activePlayerHandlers = handlers.filter((h: HandlerCtx) => isPlayer(activePlayer, h));
  const opponentHandlers = handlers.filter((h: HandlerCtx) => isPlayer(opponent, h));

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: Record<string, unknown>) {
        showWaitPrompt(s, opponent, `${sideStr(activePlayer)} to resolve pending triggers`);

        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: Record<string, unknown>) {
              clearWaitPrompt(s2, opponent);
              showWaitPrompt(s2, activePlayer, `${sideStr(opponent)} to resolve pending triggers`);

              wait_for(
                s2,
                [
                  { asyncResult: "result" },
                  function (s3: GameState, _e3: EID, _b3: Record<string, unknown>) {
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
