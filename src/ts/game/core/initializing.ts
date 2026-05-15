// Card initialization: subroutines, abilities, recurring credits,
// deactivation, card-implemented checks, and full card construction.
// Mirrors: src/clj/game/core/initializing.clj

import type { GameState } from "./state.js";
import type { Card } from "./card.js";
import type { EID } from "./eid.js";
import type { CardDef, Ability, AbilityFn, Subroutine } from "./types.js";
import {
  isRunner,
  isProgram,
  isInstalled,
  isRezzed,
  isFacedown,
  getZone,
} from "./card.js";
import { cardDef } from "./card_defs.js";
import { makeEID, makeEIDFrom, effectCompleted } from "./eid.js";
import {
  registerStaticAbilities,
  unregisterStaticAbilities,
} from "./effects.js";
import {
  registerDefaultEvents,
  registerEvents,
  unregisterEvents,
  isAbility,
  resolveAbility,
} from "./engine.js";
import { findCID, getCard } from "./finding.js";
import { gain, lose } from "./gaining.js";
import { initMuCost } from "./memory.js";
import { addCostLabelToAbility } from "./payment.js";
import { addCounter } from "./props.js";

import { allActive, allActiveInstalled } from "./board.js";
import { makeLabel } from "../../jinteki/utils.js";
import { makeCID, makeTimestamp, serverCard, toKeyword } from "../utils.js";
import { addSub } from "./ice.js";
import { CORP_SIDE, RUNNER_SIDE } from "./state.js";
import { breakSubAbilityCost, cardAbilityCost } from "./cost_fns.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Merge properties from src onto dest (in-place mutation).
 * Mirrors Clojure's (merge dest src).
 */
function mergeProps(dest: Record<string, unknown>, src: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(src)) {
    if (v !== undefined) {
      dest[k] = v;
    }
  }
}

/**
 * Delete keys from a card object (in-place).
 * Mirrors Clojure's dissoc for multiple keys.
 */
function dissocKeys(card: Card, ...keys: string[]): void {
  for (const k of keys) {
    delete (card as Record<string, unknown>)[k];
  }
}

/**
 * Update a card in the game state by locating it in its zone and merging props.
 * Mirrors Clojure's (update! state side card).
 */
function updateInState(state: GameState, side: string, card: Card): void {
  const z = card.zone ?? [];
  if (z.length === 0) return;

  const player = side === RUNNER_SIDE ? state.runner : state.corp;
  const zoneName = z[0];

  // Facedown cards live in rig.facedown
  if (zoneName === "rig" && isFacedown(card)) {
    const idx = player.rig.facedown.findIndex((c) => c.cid === card.cid);
    if (idx !== -1) mergeProps(player.rig.facedown[idx], card);
    return;
  }

  // Rig sub-zones
  if (zoneName === "rig" && z.length >= 2) {
    const subzone = z[1];
    const arr = (player.rig as Record<string, Card[]>)[subzone];
    if (arr) {
      const idx = arr.findIndex((c) => c.cid === card.cid);
      if (idx !== -1) mergeProps(arr[idx], card);
      return;
    }
  }

  // Server zones
  if (zoneName === "servers" && z.length >= 2) {
    const serverName = z[1];
    let server: { content: Card[]; ices: Card[] } | undefined;
    if (serverName === "hq") server = state.corp.servers.hq;
    else if (serverName === "rd") server = state.corp.servers.rd;
    else if (serverName === "archives") server = state.corp.servers.archives;
    else server = state.corp.servers.remote[serverName];

    if (server) {
      const isIce = z.length >= 3 && z[2] === "ices";
      const arr = isIce ? server.ices : server.content;
      const idx = arr.findIndex((c) => c.cid === card.cid);
      if (idx !== -1) mergeProps(arr[idx], card);
      return;
    }
  }

  // Named zones on the player object
  const zoneKey = zoneName as
    | "hand"
    | "deck"
    | "discard"
    | "scored"
    | "rfg"
    | "play-area"
    | "current"
    | "set-aside";
  const arr = (player as Record<string, Card[]>)[zoneKey];
  if (arr && Array.isArray(arr)) {
    const idx = arr.findIndex((c) => c.cid === card.cid);
    if (idx !== -1) mergeProps(arr[idx], card);
  }
}

// ---------------------------------------------------------------------------
// Subroutine initialization
// ---------------------------------------------------------------------------

/**
 * Initialise the subroutines associated with the card. These work as abilities.
 * When state is provided, uses addSub from ice.ts for full initialization.
 * When state is not available (e.g. makeCard), creates basic subroutine wrappers.
 * Mirrors: subroutines-init
 */
function subroutinesInit(card: Card, cdef: CardDef, state?: GameState): Subroutine[] {
  const subroutinesDef = cdef.subroutines ?? [];
  if (!state) {
    // No state available (e.g. during makeCard) - create basic wrappers
    return subroutinesDef.map((sub) => ({
      ...sub,
      printed: true,
      broken: false,
      fired: false,
      sourceCard: card,
    }));
  }
  // Full initialization with state
  const baseCard = { ...card, subroutines: undefined };
  return subroutinesDef.map((sub) =>
    addSub(state, sub, baseCard),
  );
}

// ---------------------------------------------------------------------------
// Ability initialization
// ---------------------------------------------------------------------------

/**
 * Gets abilities associated with the card (ICE abilities).
 * Mirrors: ability-init
 */
function abilityInit(cdef: CardDef): Ability[] {
  const abilities = cdef.abilities ?? [];
  return abilities.map((ab) => {
    const withLabel = { ...ab, label: makeLabel(ab) };
    return addCostLabelToAbility(withLabel);
  });
}

/**
 * Gets corp abilities associated with the card.
 * Mirrors: corp-ability-init
 */
function corpAbilityInit(cdef: CardDef): Ability[] {
  const abilities = cdef.corpAbilities ?? [];
  return abilities.map((ab) => {
    const withCost = { cost: ab.cost, label: makeLabel(ab) };
    return addCostLabelToAbility(withCost);
  });
}

/**
 * Gets runner abilities associated with the card.
 * Mirrors: runner-ability-init
 */
function runnerAbilityInit(cdef: CardDef): Ability[] {
  const abilities = cdef.runnerAbilities ?? [];
  return abilities.map((ab) => {
    const cost = ab.breakCost ?? ab.cost;
    const withCost = { cost: ab.cost, breakCost: ab.breakCost, label: makeLabel(ab) };
    return addCostLabelToAbility(withCost, cost);
  });
}

// ---------------------------------------------------------------------------
// Dissoc-card / deactivate
// ---------------------------------------------------------------------------

/**
 * Remove irrelevant keys from a card, initialising subroutines and abilities.
 * Mirrors: dissoc-card (private)
 */
function dissocCard(card: Card, keepCounter: boolean, state?: GameState): Card {
  const cdef = cardDef(card);
  // Remove irrelevant keys
  dissocKeys(
    card,
    "currentStrength",
    "currentAdvancementRequirement",
    "currentPoints",
    "runnerAbilities",
    "corpAbilities",
    "rezzed",
    "new",
    "subtypeTarget",
    "cardTarget",
    "extraAdvanceCounter",
    "special",
  );

  // Initialise subroutines and abilities
  card.subroutines = subroutinesInit(card, cdef, state);
  card.abilities = abilityInit(cdef);

  // Optionally remove counters
  if (!keepCounter) {
    delete card.counter;
    delete card.advanceCounter;
  }

  return card;
}

/**
 * Triggers leave effects for specified card if relevant.
 * Mirrors: trigger-leave-effect (private)
 */
function triggerLeaveEffect(
  state: GameState,
  side: string,
  card: Card,
): void {
  const cdef = cardDef(card);
  const leaveEffect = cdef.leavePlay;
  if (!leaveEffect) return;

  const zone = card.zone ?? [];
  const nestedZone = card.host ? getZone(card.host) : zone;

  // Check activation conditions
  if (card.disabled) return;
  if (isRunner(card) && card.host && !isInstalled(card) && !isFacedown(card)) return;

  const isActive =
    (isRunner(card) && isInstalled(card) && !isFacedown(card)) ||
    isRezzed(card) ||
    (card.host && !isFacedown(card)) ||
    nestedZone[0] === "servers" ||
    nestedZone[0] === "scored";

  if (!isActive) return;

  const eid = makeEID(state);
  leaveEffect(state, side, eid, card, []);
}

// ---------------------------------------------------------------------------
// Deactivate
// ---------------------------------------------------------------------------

/**
 * Deactivates a card, unregistering its events, removing certain attribute keys,
 * and triggering some events.
 * Mirrors: deactivate
 */
export function deactivate(
  state: GameState,
  side: string,
  card: Card,
  keepCounter?: boolean,
): Card {
  unregisterEvents(state, side, card);
  unregisterStaticAbilities(state, side, card);
  triggerLeaveEffect(state, side, card);

  // Lose :in-play resources if card was active-installed
  const activeInstalled = allActiveInstalled(state, side);
  const found = findCID(card.cid, activeInstalled);
  if (
    found &&
    !card.disabled &&
    (isRezzed(card) || isInstalled(card))
  ) {
    const cdef = cardDef(card);
    const inPlay = cdef.inPlay;
    if (inPlay && Array.isArray(inPlay)) {
      // inPlay is a flat vector like [:credit 2 :click 1]
      for (let i = 0; i < inPlay.length; i += 2) {
        const resource = toKeyword(inPlay[i]);
        const amount = inPlay[i + 1] as number;
        lose(state, side, resource, amount);
      }
    }
  }

  return dissocCard(card, !!keepCounter, state);
}

// ---------------------------------------------------------------------------
// Card initialization
// ---------------------------------------------------------------------------

/**
 * Initializes the abilities and events of the given card.
 * Mirrors: card-init
 */
export function cardInit(
  state: GameState,
  side: string,
  card: Card,
  args?: { resolveEffect?: boolean; initData?: boolean; noMu?: boolean },
): Card {
  const opts = {
    resolveEffect: true,
    initData: true,
    noMu: false,
    ...args,
  };

  const eid = makeEID(state);
  const cdef = cardDef(card);
  const recurring = cdef.recurring;
  const runAbs = runnerAbilityInit(cdef);
  const corpAbs = corpAbilityInit(cdef);
  const special = { ...cdef.special, ...card.special };

  // Update card with abilities and special
  card.runnerAbilities = runAbs;
  card.corpAbilities = corpAbs;
  card.special = special;
  updateInState(state, side, card);

  // Initialise loading flag
  if (opts.initData && card.special) {
    card.special.skippedLoading = true;
  }

  // Build counter data from card-def
  const counterData: Record<string, number> = {};
  if (opts.initData && cdef.data?.counter) {
    for (const [k, v] of Object.entries(cdef.data.counter as Record<string, number>)) {
      counterData[k] = v;
    }
  }

  // Handle recurring credits
  if (recurring !== undefined && recurring !== null) {
    let recurringValue: number;
    if (typeof recurring === "function") {
      recurringValue = recurring(state, side, eid, card, []) as number;
    } else if (typeof recurring === "number") {
      recurringValue = recurring;
    } else {
      throw new Error(`${card.title ?? "unknown"} - Recurring isn't number or fn`);
    }
    counterData.recurring = recurringValue;
  }

  // Set recurring counter to 0
  if (recurring !== undefined && recurring !== null) {
    if (!card.counter) card.counter = {};
    card.counter.recurring = 0;
    updateInState(state, side, card);
  }

  // Add counters from data
  for (const [counterType, counterNum] of Object.entries(counterData)) {
    addCounter(
      state,
      side,
      makeEIDFrom(state, eid),
      card,
      counterType,
      counterNum,
      { placed: true, suppressCheckpoint: true },
    );
  }

  // Refresh card reference after counter changes
  const refreshedCard = getCard(state, card);
  const c = refreshedCard ?? card;

  // Register recurring credit event
  if (recurring !== undefined && recurring !== null) {
    const recurringFn: AbilityFn = (s, s2, e, cd, targets) => {
      // Reset recurring counter
      if (cd) {
        if (!cd.counter) cd.counter = {};
        cd.counter.recurring = 0;
        updateInState(s, s2, cd);
      }
      // Calculate recurring amount
      let n: number;
      if (typeof recurring === "number") {
        n = recurring;
      } else {
        n = recurring(s, s2, e, cd ?? c, targets) as number;
      }
      // Add recurring counter
      addCounter(s, s2, e, cd ?? c, "recurring", n, { placed: true });
    };

    const eventName = side === CORP_SIDE ? "corp-phase-12" : "runner-phase-12";
    registerEvents(state, side, c, [
      {
        event: eventName,
        req: (_s, _s2, _e, cd) => !cd?.disabled,
        async: true,
        effect: recurringFn,
      },
    ]);
  }

  registerDefaultEvents(state, side, c);
  registerStaticAbilities(state, side, c);

  // Facedown cards can't be initialized for MU
  if (isProgram(card) && !opts.noMu) {
    initMuCost(state, c);
  }

  // Resolve :in-play effect or ability
  if (opts.resolveEffect && isAbility(cdef as unknown as Ability)) {
    const abilityEid = { ...eid, sourceType: "ability" };
    // Dissoc :cost and :additional-cost from cdef for ability resolution
    const { cost, additionalCost, ...cdefWithoutCost } = cdef as Record<string, unknown>;
    resolveAbility(state, side, cdefWithoutCost as Ability, c, []);
  } else {
    effectCompleted(state, side, eid);
  }

  // Gain :in-play resources
  const inPlay = cdef.inPlay;
  if (inPlay && Array.isArray(inPlay)) {
    for (let i = 0; i < inPlay.length; i += 2) {
      const resource = toKeyword(inPlay[i]);
      const amount = inPlay[i + 1] as number;
      gain(state, side, resource, amount);
    }
  }

  return getCard(state, c) ?? c;
}

// ---------------------------------------------------------------------------
// Ability cost string updates
// ---------------------------------------------------------------------------

/**
 * Update cost strings for a single ability category on a card.
 * Mirrors: update-ability-cost-str
 */
function updateAbilityCostStr(
  state: GameState,
  side: string,
  card: Card,
  abilityKw: keyof Pick<Card, "abilities" | "corpAbilities" | "runnerAbilities">,
): Ability[] {
  const abilities = card[abilityKw] ?? [];
  return abilities.map((ab) => {
    let abCost: Ability;
    if (ab.breakCost) {
      abCost = { ...ab, cost: breakSubAbilityCost(state, side, ab, card) as any };
    } else {
      abCost = ab;
    }
    const computedCost = cardAbilityCost(state, side, abCost, card);
    return addCostLabelToAbility(abCost, computedCost as any);
  });
}

/**
 * Update cost strings for all ability categories on a card.
 * Mirrors: update-abilities-cost-str
 */
function updateAbilitiesCostStr(state: GameState, side: string, card: Card): Card {
  return {
    ...card,
    abilities: updateAbilityCostStr(state, side, card, "abilities"),
    corpAbilities: updateAbilityCostStr(state, side, card, "corpAbilities"),
    runnerAbilities: updateAbilityCostStr(state, side, card, "runnerAbilities"),
  };
}

/**
 * Update cost labels on all active cards in the game.
 * Mirrors: update-all-card-labels
 */
export function updateAllCardLabels(state: GameState): boolean {
  let changed = false;
  const allCorpCards = allActive(state, CORP_SIDE);
  const allRunnerCards = allActive(state, RUNNER_SIDE);
  const allCards = [...allCorpCards, ...allRunnerCards];

  for (const card of allCards) {
    const side = toKeyword(card.side ?? "");
    const newCard = updateAbilitiesCostStr(state, side, card);
    if (newCard !== card) {
      updateInState(state, side, newCard);
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Card implementation check
// ---------------------------------------------------------------------------

/**
 * Checks if the card is implemented. Looks for a valid return from `cardDef`.
 * If implemented also looks for `:implementation` key which may contain special notes.
 * Returns:
 *   null - not implemented
 *   "full" - implemented fully
 *   string - with implementation notes
 * Mirrors: card-implemented
 */
export function cardImplemented(card: Card): string | null {
  const cdef = cardDef(card);
  if (!cdef || Object.keys(cdef).length === 0) return null;

  const impl = cdef.implementation;
  const hasRecurring = cdef.recurring !== undefined && cdef.recurring !== null;

  if (impl) {
    if (hasRecurring) return `${impl}. Recurring credits usage not restricted`;
    return impl;
  }
  if (hasRecurring) return "Recurring credits usage not restricted";
  return "full";
}

// ---------------------------------------------------------------------------
// Make card
// ---------------------------------------------------------------------------

/**
 * Makes or remakes (with current cid) a proper card from a server card.
 * Mirrors: make-card
 */
export function makeCard(cardData: Record<string, unknown>, cid?: string): Card {
  const cardCid = cid ?? makeCID();
  const cdef = cardDef({ ...cardData, cid: cardCid } as Card);

  // Remove unwanted keys from source data
  const removeKeys = [
    "setname", "text", "_id", "influence", "number", "influencelimit",
    "images", "previous-versions", "rotated",
    "image_url", "factioncost", "format", "quantity",
  ];
  const cleaned: Record<string, unknown> = { ...cardData };
  for (const k of removeKeys) {
    delete cleaned[k];
  }

  const newCard: Card = {
    ...cleaned,
    cid: cardCid,
    implementation: cardImplemented({ ...cardData, cid: cardCid } as Card) ?? undefined,
    subroutines: subroutinesInit({ ...cardData, cid: cardCid } as Card, cdef),
    abilities: abilityInit(cdef),
    xFn: cdef.xFn,
    timestamp: makeTimestamp(),
    poison: cdef.poison,
    highlightInDiscard: cdef.highlightInDiscard,
    printedTitle: cardData.title as string | undefined,
  };

  return newCard;
}

// ---------------------------------------------------------------------------
// Reset card
// ---------------------------------------------------------------------------

/**
 * Resets a card back to its original state - retaining any data in the :persistent key.
 * Mirrors: reset-card
 */
export function resetCard(
  state: GameState,
  side: string,
  card: Card,
): Card {
  // Remove from per-turn registry
  if (state.perTurn && card.cid) {
    delete (state.perTurn as Record<string, unknown>)[card.cid];
  }

  const title = card.printedTitle ?? card.title;
  const sCard = serverCard(title ?? "", false) ?? {};
  const newCard = makeCard(sCard, card.cid);

  newCard.persistent = card.persistent;
  newCard.previousZone = card.previousZone;
  newCard.seen = card.seen;
  newCard.zone = card.zone;

  updateInState(state, side, newCard);

  return newCard;
}

// Expose subroutinesInit for external use if needed
export { subroutinesInit as subroutinesInit };
