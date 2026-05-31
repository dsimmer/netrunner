// Core game engine: ability resolution, event registration/triggering,
// checkpoints, and payment processing.
// Mirrors: src/clj/game/core/engine.clj

import { randomUUID } from "crypto";
import type { GameState, Prompt } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import type { Ability, AbilityFn, ChoicesSpec, Cost, MsgFn, NumberFn, ReqFn } from "./types";
import type { Effect, RegisteredEvent } from "./state";
import { CORP_SIDE, RUNNER_SIDE, getPlayer } from "./state";
import {
  getTitle,
  getType,
  getSide,
  isCorp,
  isRunner,
  isInstalled,
  isRezzed,
  isFacedown,
  isFaceup,
  isAgenda,
  isICE,
  isUpgrade,
  isAsset,
  isCounter,
  isEvent,
  isOperation,
  isHardware,
  isProgram,
  isResource,
  isIdentity,
  isBasicAction,
  inHand,
  inDiscard,
  inRFG,
  getZone,
  inZone,
  printedTitle,
} from "./card";
import { getCardDef } from "./types";
import {
  getEffectMaps,
  unregisterLingeringEffects,
  isDisabled,
  isDisabledReg,
  updateDisabledCards,
} from "./effects";
import {
  makeEID,
  makeEIDFrom,
  effectCompleted,
  completeWithResult,
} from "./eid";
import { getCard, findCID, getAllCards } from "./finding";
import { canPay, buildSpendMsg } from "./payment";
import { handler as payHandler } from "./costs";
import { addToPromptQueue } from "./prompt_state";
import {
  showPrompt,
  showSelect,
  showWaitPrompt,
  clearWaitPrompt,
} from "./prompts";
import { systemMsg, multiMsg, systemSay, nLastLogs } from "./say";
import { update } from "./update";
import { checkWinByAgenda } from "./winning";
import { updateMU } from "./memory";
import { cardStr } from "./to_string";
import { otherSide } from "../../jinteki/utils";
import {
  sameCard,
  sideStr,
  toKeyword,
  removeOnce,
  distinctBy,
  enumerateStr,
  inColl,
} from "../utils";
import {
  allActiveInstalled,
  allInstalled,
  allInstalledRunner,
  allInstalledRunnerType,
  clearEmptyRemotes,
} from "./board";
import { continue_ability, req, wait_for } from "../macros";
import { move as moveAction } from "./moving";
import { checkpoint } from "./checkpoint";
import type { CostData } from "./payment";
import { toC } from "./payment";

import {
  canTrigger,
  dissocReq,
  inSetAside,
  isActive,
  isFaceupCard,
  resolveAbility,
} from "./engine_1";

/** Get sorted card titles from server (card registry). */
export function serverCardTitles(
  state: GameState,
  predicate: (
    s: GameState,
    sid: string,
    e: EID,
    c: Card | null,
    t: unknown[],
  ) => boolean,
): string[] {
  const allCardsList = getAllCards(state);
  return [
    ...new Set(
      allCardsList
        .filter((c: Card) => predicate(state, "", makeEID(state), null, [c]))
        .map((c: Card) => getTitle(c) ?? ""),
    ),
  ].sort();
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/**
 * Shows a prompt with the given message and choices.
 * Mirrors `prompt!`.
 */
export function promptFn(
  state: GameState,
  side: string,
  card: Card | null,
  message: string | MsgFn | undefined,
  choices: ChoicesSpec,
  ability: Ability,
  args: Record<string, unknown>,
): void {
  const eid = ability.eid as EID | undefined;
  const f: AbilityFn = (s: GameState, s2: string, _e: EID, c: Card | null, t: unknown[]) => {
    resolveAbility(s, s2, ability, c, t);
  };

  let cancelFn: AbilityFn | undefined;
  const cancelArg = args.cancel as Ability | undefined;
  if (cancelArg) {
    cancelFn = (s: GameState, s2: string, _e: EID, c: Card | null, t: unknown[]) => {
      resolveAbility(s, s2, cancelArg, c, t);
    };
  }

  const promptArgs = cancelFn ? { ...args, cancel: cancelFn } : args;

  showPrompt(state, side, card, message ?? "", choices as unknown, f, { ...promptArgs, eid });
}

// ---------------------------------------------------------------------------
// Event suppression registration
// ---------------------------------------------------------------------------

interface SuppressEntry {
  event: string;
  ability: Ability;
  card: Card;
  uuid: string;
  req?: ReqFn;
}

interface StateWithSuppress {
  suppress?: SuppressEntry[];
}

function stateWithSuppress(state: GameState): StateWithSuppress {
  return state as GameState & StateWithSuppress;
}

/**
 * Registers each suppression handler in the given card definition.
 * Mirrors `register-suppress`.
 */
export function registerSuppress(
  state: GameState,
  side: string,
  card: Card,
): SuppressEntry[] {
  const cdef = getCardDef(card) as { suppress?: Ability[] } | undefined;
  const events = cdef?.suppress;
  if (!events || !events.length) return [];
  return registerSuppressInternal(state, side, card, events);
}

function registerSuppressInternal(
  state: GameState,
  _side: string,
  card: Card,
  events: Ability[],
): SuppressEntry[] {
  const abilities: SuppressEntry[] = events.map((ability: Ability) => ({
    event: ability.event ?? "",
    ability: { ...ability, event: undefined },
    card,
    uuid: randomUUID(),
  }));

  const sws = stateWithSuppress(state);
  const existing = sws.suppress ?? [];
  sws.suppress = [...existing, ...abilities];
  return abilities;
}

/**
 * Removes all event handler suppression effects as defined for the given card.
 * Mirrors `unregister-suppress`.
 */
export function unregisterSuppress(
  state: GameState,
  side: string,
  card: Card,
): void {
  const cdef = getCardDef(card) as { suppress?: Ability[] } | undefined;
  const events = cdef?.suppress;
  if (!events) return;
  unregisterSuppressInternal(state, side, card, events);
}

function unregisterSuppressInternal(
  state: GameState,
  _side: string,
  card: Card,
  events: Ability[],
): void {
  const eventNames = new Set(events.map((e: Ability) => e.event ?? ""));
  const sws = stateWithSuppress(state);
  const existing = sws.suppress ?? [];
  sws.suppress = existing.filter(
    (entry: SuppressEntry) =>
      !(sameCard(card, entry.card) && eventNames.has(entry.event)),
  );
}

/**
 * Removes a single event handler with matching uuid.
 * Mirrors `unregister-suppress-by-uuid`.
 */
export function unregisterSuppressByUUID(
  state: GameState,
  _side: string,
  uuid: string,
): void {
  const sws = stateWithSuppress(state);
  const existing = sws.suppress ?? [];
  sws.suppress = existing.filter(
    (entry: SuppressEntry) => entry.uuid !== uuid,
  );
}

// ---------------------------------------------------------------------------
// Event registration
// ---------------------------------------------------------------------------

/**
 * Default locations for a card type.
 * Mirrors `default-locations`.
 */
function defaultLocations(card: Card | null): Set<string> {
  if (!card) return new Set();
  const type = toKeyword(card.type ?? "");
  switch (type) {
    case "agenda":
      return new Set(["scored"]);
    case "asset":
    case "ice":
    case "upgrade":
      return new Set(["servers"]);
    case "counter":
      return new Set(["hosted"]);
    case "event":
    case "operation":
      return new Set(["current", "play-area"]);
    case "hardware":
    case "program":
    case "resource":
      return new Set(["rig"]);
    case "identity":
    case "fake-identity":
      return new Set(["identity"]);
    default:
      return new Set();
  }
}

/**
 * Build location set from ability. Mirrors `build-location`.
 */
function buildLocation(card: Card | null, ability: Ability): Set<string> {
  const location = ability.location;
  if (!location) return defaultLocations(card);
  if (Array.isArray(location)) return new Set(location);
  if (typeof location === "string") return new Set([location]);
  return defaultLocations(card);
}

/**
 * Build condition keyword. Mirrors `build-condition`.
 */
function buildCondition(ability: Ability): string {
  const condition = ability.condition as string | undefined;
  if (condition) return condition;
  const location = ability.location;
  if (location) return "in-location";
  return "active";
}

/**
 * Build an event handler entry. Mirrors `build-event-ability`.
 */
export function buildEventAbility(
  ability: Ability,
  card: Card,
): RegisteredEvent {
  return {
    event: ability.event ?? "",
    location: buildLocation(card, ability),
    duration: ability.duration ?? "default-duration",
    condition: buildCondition(ability),
    unregisterOnceResolved: ability.unregisterOnceResolved ?? false,
    oncePerInstance: ability.oncePerInstance ?? false,
    ability: {
      ...ability,
      event: undefined,
      duration: undefined,
      condition: undefined,
    },
    card,
    uuid: randomUUID(),
    side: getSide(card) ?? "",
    effect: ability.effect,
  };
}

/**
 * Registers each event handler defined in the given card definition.
 * Mirrors `register-events`.
 */
// Card-side callers sometimes pass (card, events) or (state, card, events).
// We accept these shapes via permissive overloads and normalise internally.
export function registerEvents(card: Card, events: Ability[]): RegisteredEvent[];
export function registerEvents(state: GameState, card: Card, events: Ability[]): RegisteredEvent[];
export function registerEvents(state: GameState, side: string, card: Card, events: Ability[]): RegisteredEvent[];
export function registerEvents(
  arg1: GameState | Card,
  arg2: Card | string | Ability[],
  arg3?: Card | Ability[],
  arg4?: Ability[],
): RegisteredEvent[] {
  let state: GameState;
  let card: Card;
  let events: Ability[];

  // Detect (card, events) — first arg is a Card-shaped object (has cid).
  if (
    typeof arg1 === "object" &&
    arg1 !== null &&
    "cid" in arg1 &&
    Array.isArray(arg2)
  ) {
    // 2-arg form: no state, no-op.
    return [];
  }
  state = arg1 as GameState;

  if (Array.isArray(arg3)) {
    // 3-arg form: (state, card, events)
    card = arg2 as Card;
    events = arg3;
  } else {
    // 4-arg form: (state, side, card, events)
    card = arg3 as Card;
    events = arg4 ?? [];
  }

  if (!events.length) return [];
  const abilities = events.map((ability: Ability) => buildEventAbility(ability, card));
  state.events = [...state.events, ...abilities];
  return abilities;
}

/**
 * Registers default (non-location-specific) events for a card.
 * Mirrors `register-default-events`.
 */
export function registerDefaultEvents(
  state: GameState,
  side: string,
  card: Card,
): void {
  registerSuppress(state, side, card);
  const cdef = getCardDef(card) as { events?: Ability[]; derezzedEvents?: Ability[] } | undefined;
  const allEvents = [cdef?.events, cdef?.derezzedEvents]
    .flat()
    .filter((e: Ability | undefined): e is Ability => !!e && !e.location);
  registerEvents(state, side, card, allEvents);
}

/**
 * Registers a pending event (fires once at next checkpoint).
 * Mirrors `register-pending-event`.
 */
export function registerPendingEvent(
  state: GameState,
  event: string,
  card: Card,
  ability: Ability,
): void {
  const pending: Ability = {
    ...ability,
    event,
    duration: ability.duration ?? "pending",
    unregisterOnceResolved: true,
    oncePerInstance: ability.oncePerInstance ?? false,
  };
  registerEvents(state, "", card, [pending]);
}

/**
 * Removes all event handlers defined for the given card.
 * Mirrors `unregister-events`.
 */
interface CardDefEvents {
  events?: Ability[];
  derezzedEvents?: Ability[];
}

export function unregisterEvents(state: GameState, side: string, card: Card, cdef?: CardDefEvents): void;
export function unregisterEvents(card: Card): void;
export function unregisterEvents(
  arg1: GameState | Card,
  arg2?: string,
  arg3?: Card,
  arg4?: CardDefEvents,
): void {
  let state: GameState;
  let side: string;
  let card: Card;
  let cdef: CardDefEvents | undefined;
  if (arg2 === undefined) {
    // 1-arg form (legacy): card only — no state, so no-op
    return;
  }
  state = arg1 as GameState;
  side = arg2;
  card = arg3 as Card;
  cdef = arg4;
  if (!state || !state.effects) return;
  const events: (Ability | undefined)[] = cdef
    ? [cdef.events, cdef.derezzedEvents].flat()
    : (() => {
        const def = getCardDef(card) as CardDefEvents | undefined;
        return [def?.events, def?.derezzedEvents].flat();
      })();

  const eventNames = new Set(events.map((e) => e?.event ?? ""));

  state.events = state.events.filter(
    (entry) =>
      !(
        sameCard(card, entry.card) &&
        eventNames.has(entry.event) &&
        entry.duration === "default-duration"
      ),
  );

  unregisterSuppress(state, side, card);
}

/**
 * Updates floating event durations.
 * Mirrors `update-floating-event-durations`.
 */
export function updateFloatingEventDurations(
  state: GameState,
  _side: string,
  fromKey: string,
  toKey: string,
): void {
  state.events = state.events.map((e: RegisteredEvent) =>
    e.duration === fromKey ? { ...e, duration: toKey } : e,
  );
}

/**
 * Removes all event handlers with a non-persistent duration.
 * Mirrors `unregister-floating-events`.
 */
export function unregisterFloatingEvents(
  state: GameState,
  _side: string,
  duration: string,
): void {
  if (duration === "default-duration") return;
  state.events = state.events.filter((e: RegisteredEvent) => e.duration !== duration);
}

/**
 * Removes a single event handler by uuid.
 * Mirrors `unregister-event-by-uuid`.
 */
export function unregisterEventByUUID(
  state: GameState,
  _side: string,
  uuid: string,
): void {
  state.events = state.events.filter((e: RegisteredEvent) => e.uuid !== uuid);
}

// ---------------------------------------------------------------------------
// Event triggering
// ---------------------------------------------------------------------------

/** Handler is skippable? Mirrors `handler-skippable?`.
 *  Accepts `unknown` because card-side callers pass a variety of shapes
 *  (RegisteredEvent, raw ability map, wrapped {handler, context} tuple). */
export function handlerSkippable(handler: unknown): boolean {
  if (!handler || typeof handler !== "object") return false;
  const h = handler as { handler?: { ability?: Ability }; ability?: Ability };
  const ability = h.handler?.ability ?? h.ability;
  return (ability?.skippable as boolean | undefined) ?? false;
}

/**
 * Priority ordering for automatic resolution.
 * Mirrors `automatic-priority`.
 */
export const automaticPriority: Record<string, number> = {
  "pre-bypass": 1,
  "corp-damage": 1,
  "force-discard": 1,
  "lose-clicks": 1,
  "gain-clicks": 2,
  "drain-credits": 4,
  bypass: 4,
  "lose-credits": 4,
  "pre-gain-credits": 5,
  "gain-credits": 6,
  "pre-draw-cards": 7,
  "draw-cards": 8,
  "post-draw-cards": 9,
  "pre-breach": 9,
  true: 10,
  trace: 11,
  "corp-lose-tag": 11,
  last: 999,
};

export function getAbilitySide(ability: RegisteredEvent): string {
  const inner = ability.ability as { side?: string } | undefined;
  return inner?.side ?? "";
}

export function isActivePlayer(
  state: GameState,
  ability: RegisteredEvent,
): boolean {
  return state.activePlayer === getSide(ability.card);
}

/**
 * Check condition for event handler. Mirrors `valid-condition?`.
 */
function validCondition(
  state: GameState,
  card: Card | null,
  ability: Ability,
): Card | null {
  if (!card) return null;
  const condition = ability.condition as string | undefined;
  const location = ability.location as Set<string> | undefined;

  const condOk = (() => {
    switch (condition) {
      case "accessed":
        return sameCard(card, (state.run as { access?: Card | null } | undefined)?.access ?? null);
      case "active":
        return isActive(card);
      case "derezzed":
        return isInstalled(card) && !isRezzed(card);
      case "installed":
        return isInstalled(card);
      case "facedown":
        return isInstalled(card) && isFacedown(card);
      case "faceup":
        return isFaceupCard(card);
      case "hosted":
        return !!card.host;
      case "floating":
        return true;
      case "inactive":
        return !isActive(card);
      case "in-location": {
        if (!location) return false;
        if (location.has("discard")) return inDiscard(card);
        if (location.has("set-aside")) return inSetAside(card);
        if (location.has("hosted")) {
          const z = getZone(card);
          return z && z.length > 0 && z[0] === "onhost";
        }
        if (location.has("rfg")) return inRFG(card);
        if (location.has("hand")) return inHand(card);
        return false;
      }
      case "test-condition":
        return true;
      default:
        return true;
    }
  })();

  if (!condOk) return null;
  if (isDisabled(state, "", card)) return null;
  if (isDisabledReg(state, card)) return null;
  return card;
}

/**
 * Get the (possibly refreshed) card for an event handler.
 * Mirrors `card-for-ability`.
 */
export function cardForAbility(
  state: GameState,
  ability: RegisteredEvent,
): Card | null {
  const duration = ability.duration;
  if (duration === "default-duration" || duration === "pending") {
    const found = getCard(state, ability.card);
    if (found) return validCondition(state, found, ability);
    // Ice that's swapped still triggers events when passed
    if (isInstalled(ability.card)) {
      const side = getSide(ability.card);
      const installed = allInstalled(state, side ?? "");
      const cid = ability.card.cid;
      const swapped = installed.find((c: Card) => c.cid === cid) ?? null;
      if (swapped) return validCondition(state, swapped, ability);
    }
  }
  return ability.card;
}

/**
 * Check if event should be suppressed.
 * Mirrors `trigger-suppress`.
 */
export function triggerSuppress(
  state: GameState,
  side: string,
  event: string,
  ...targets: unknown[]
): boolean {
  const suppressList = stateWithSuppress(state).suppress ?? [];
  const matching = suppressList.filter((e: SuppressEntry) => e.event === event);
  for (const entry of matching) {
    const ability = entry.ability;
    const card = cardForAbility(state, entry as unknown as RegisteredEvent);
    if (ability.req) {
      try {
        if (typeof ability.req !== "function") {
          if (ability.req) return true;
        } else if (ability.req(state, side, makeEID(state), card, targets as Card[])) {
          return true;
        }
      } catch (_e) {
        /* ignore */
      }
    }
  }
  return false;
}

/**
 * Gather all event handlers for the given player/event.
 * Mirrors `gather-events`.
 */
export function gatherEvents(
  state: GameState,
  side: string,
  eid: EID,
  event: string,
  targets: unknown[],
  cardAbilities?: RegisteredEvent[] | null,
): RegisteredEvent[] {
  const matching = state.events.filter((e: RegisteredEvent) => e.event === event);
  const all = cardAbilities
    ? [...matching, ...cardAbilities.filter(Boolean)]
    : matching;

  const valid: RegisteredEvent[] = [];
  for (const ability of all) {
    const card = cardForAbility(state, ability);
    if (!card) continue;
    if (triggerSuppress(state, side, event, card, ...targets)) continue;
    if (!canTrigger(state, side, eid, ability.ability ?? {}, card, targets)) continue;
    valid.push(ability);
  }

  // Active player's handlers last (non-active first)
  valid.sort((a: RegisteredEvent, b: RegisteredEvent) => {
    const aActive = isActivePlayer(state, a) ? 1 : 0;
    const bActive = isActivePlayer(state, b) ? 1 : 0;
    return aActive - bActive;
  });

  return valid;
}

/**
 * Log an event to turn/run events.
 * Mirrors `log-event`.
 */
export function logEvent(
  state: GameState,
  event: string,
  targets: unknown[],
): void {
  state.turnEvents = [
    { type: event, targets: targets as Card[] },
    ...(state.turnEvents ?? []),
  ];
  if (state.run) {
    const runWithEvents = state.run as { events?: Array<{ event: string; targets: unknown[] }> };
    runWithEvents.events = [
      { event, targets },
      ...(runWithEvents.events ?? []),
    ];
  }
}

/**
 * Resolve all handlers for an event (async, no ordering).
 * Mirrors `trigger-event`.
 */
// Card-side callers sometimes pass fewer args: (state, event) or (event).
// We accept both via permissive overloads and normalise internally — the
// missing side defaults to the active player.
export function triggerEvent(event: string): void;
export function triggerEvent(state: GameState, event: string): void;
export function triggerEvent(state: GameState, event: string, context: Record<string, unknown> | null): void;
export function triggerEvent(state: GameState, side: string, event: string | null, context?: Record<string, unknown> | null): void;
// Permissive 4-arg overload: accepts unknown state for callers whose state is
// a wider union (e.g. shuffling.ts where state is `GameState | string` pre-narrowing).
export function triggerEvent(state: unknown, side: string, event: string | null, context: Record<string, unknown> | null): void;
// Permissive impl signature — accepts unknown to tolerate callers that haven't
// narrowed their state/side types (e.g. shuffling.ts overload bodies).
export function triggerEvent(
  arg1: unknown,
  arg2?: unknown,
  arg3?: unknown,
  arg4?: Record<string, unknown> | null,
): void {
  let state: GameState;
  let side: string;
  let event: string | null;
  let context: Record<string, unknown> | null | undefined;

  if (typeof arg1 === "string" || !arg1 || typeof arg1 !== "object") {
    // 1-arg form: just an event name. No state available — silently no-op.
    return;
  }
  state = arg1 as GameState;

  if (typeof arg2 === "string" && typeof arg3 === "string") {
    // (state, side, event[, context])
    side = arg2;
    event = arg3;
    context = arg4;
  } else if (typeof arg2 === "string") {
    // (state, event[, context])
    side = state.activePlayer ?? "corp";
    event = arg2;
    context = arg3 as Record<string, unknown> | null | undefined;
  } else {
    side = state.activePlayer ?? "corp";
    event = null;
    context = undefined;
  }

  if (!event) return;

  logEvent(state, event, [context]);
  const handlers = gatherEvents(state, side, makeEID(state), event, [context]);

  for (const toResolve of handlers) {
    const card = cardForAbility(state, toResolve);
    if (!card) continue;

    if (toResolve.unregisterOnceResolved) {
      unregisterEventByUUID(state, side, toResolve.uuid);
    }

    const eid = makeEID(state);
    eid.source = card;
    eid.sourceType = "ability";

    resolveAbility(state, side, eid, dissocReq(toResolve.ability ?? {}), card, [context]);
  }
}

/**
 * Trigger event synchronously — each handler must complete before the next.
 * Mirrors `trigger-event-sync-next`.
 */
export function triggerEventSyncNext(
  state: GameState,
  side: string,
  eid: EID,
  handlers: RegisteredEvent[],
  event: string,
  targets: unknown[],
): void {
  if (handlers.length === 0) {
    effectCompleted(state, side, eid);
    return;
  }

  const [toResolve, ...rest] = handlers;
  const card = cardForAbility(state, toResolve);
  if (!card) {
    triggerEventSyncNext(state, side, eid, rest, event, targets);
    return;
  }

  if (toResolve.unregisterOnceResolved) {
    unregisterEventByUUID(state, side, toResolve.uuid);
  }

  const newEid = makeEID(state);
  newEid.source = card;
  newEid.sourceType = "ability";

  // Use wait-for pattern for async sequencing
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _binds: Record<string, unknown>) {
        triggerEventSyncNext(s, side, eid, rest, event, targets);
      },
    ],
    [resolveAbility, state, side, newEid, dissocReq(toResolve), card, targets],
    { eid },
  );
}
