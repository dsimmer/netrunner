// Turmoil: card replacement / shuffling for the turmoil game mode.
// Mirrors: src/clj/game/core/turmoil.clj

import type { Card } from "./card";
import {
  agenda,
  asset,
  event,
  hasSubtype,
  hardware,
  resource,
  program,
  upgrade,
  ice,
  operation,
  identity,
  corp,
  runner,
} from "./card";
import { lobbyCommand } from "./commands";
import { disableIdentity, disableCard } from "./identities";
import { cardInit, makeCard } from "./initializing";
import { host } from "./hosting";
import { move } from "./moving";
import { systemMsg } from "./say";
import { buildCard } from "./set_up";
import type { GameState } from "./state";
import { getPlayer } from "./state";
import { serverCards, serverCard, toKeyword } from "../utils";

// ---------------------------------------------------------------------------
// Cached card indexes (populated lazily — mirrors defonce atoms)
// ---------------------------------------------------------------------------

interface CachedIndexes {
  agendaByPoints: Record<number, Record<string, unknown>[]>;
  identityBySide: Record<string, Record<string, unknown>[]>;
  programByIcebreaker: Record<string, Record<string, unknown>[]>;
  cardsByType: Record<
    string,
    | Record<string, unknown>[]
    | { economy: Record<string, unknown>[]; regular: Record<string, unknown>[] }
  >;
}

let cachedIndexes: CachedIndexes | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Is a card an economy card?
 * Something like: gain x credits, take x/all host/ed credits.
 * Mirrors is-econ?
 */
function isEcon(card: Record<string, unknown>): boolean {
  const title = (card.title as string | undefined) ?? "";
  const cardDef = serverCard(title);
  const text = (cardDef?.text as string) ?? "";
  return /.(ain|ake) (\d+|(.? host.*)).?.?.?redit/.test(text);
}

/** Types whose cards are split into economy / regular buckets. Mirrors filter-by-econ-types. */
const filterByEconTypes = new Set(["asset", "operation", "resource", "event"]);

/**
 * Populate cached card indexes. Called lazily on first use.
 * Mirrors set-cards!
 */
function setCards(): void {
  if (cachedIndexes) return;

  const allCards = serverCards();

  // agenda-by-points
  const agendaByPoints: Record<number, Record<string, unknown>[]> = {};
  for (const card of allCards) {
    if (agenda(card as unknown as Card)) {
      const pts = (card.agendapoints as number) ?? 0;
      if (!agendaByPoints[pts]) agendaByPoints[pts] = [];
      agendaByPoints[pts].push(card);
    }
  }

  // identity-by-side
  const identityBySide: Record<string, Record<string, unknown>[]> = {
    corp: allCards.filter((c) => identity(c as Card) && corp(c as Card)),
    runner: allCards.filter((c) => identity(c as Card) && runner(c as Card)),
  };

  // program-by-icebreaker
  const programByIcebreaker: Record<string, Record<string, unknown>[]> = {
    icebreaker: allCards.filter(
      (c) => program(c as Card) && hasSubtype(c as Card, "Icebreaker") !== undefined,
    ),
    regular: allCards.filter(
      (c) => program(c as Card) && hasSubtype(c as Card, "Icebreaker") === undefined,
    ),
  };

  // cards-by-type
  const typePredicates: Record<string, (c: Card) => boolean> = {
    asset: (c: Card) => asset(c),
    event: (c: Card) => event(c),
    hardware: (c: Card) => hardware(c),
    resource: (c: Card) => resource(c),
    program: (c: Card) => program(c),
    upgrade: (c: Card) => upgrade(c),
    ice: (c: Card) => ice(c),
    operation: (c: Card) => operation(c),
  };
  const keysSorted = Object.keys(typePredicates).sort();
  const cardsByType: CachedIndexes["cardsByType"] = {};
  for (const key of keysSorted) {
    const pred = typePredicates[key];
    if (filterByEconTypes.has(key)) {
      cardsByType[key] = {
        economy: allCards.filter((c) => pred(c as Card) && isEcon(c)),
        regular: allCards.filter((c) => pred(c as Card) && !isEcon(c)),
      };
    } else {
      cardsByType[key] = allCards.filter((c) => pred(c as Card));
    }
  }

  cachedIndexes = {
    agendaByPoints,
    identityBySide,
    programByIcebreaker,
    cardsByType,
  };
}

// ---------------------------------------------------------------------------
// Replacement factor — how often should we replace these cards?
// Mirrors replacement-factor
// ---------------------------------------------------------------------------

const replacementFactor: Record<string, number> = {
  hand: 4,
  deck: 8,
  discard: 3,
  id: 4,
  side: 50,
  "card-type-cross-contam": 10,
  icebreakerCrossContam: 10,
  econCrossContam: 10,
};

/**
 * Random replacement check. Returns true with probability 1/n.
 * Mirrors should-replace?
 */
function shouldReplace(key: string, extra?: number): boolean {
  const base = replacementFactor[key] ?? 25;
  if (extra === undefined) {
    return Math.floor(Math.random() * base) === 0;
  }
  const n = Math.max(1, Math.min(base, extra));
  return Math.floor(Math.random() * n) === 0;
}

const corpCardTypes = new Set(["asset", "upgrade", "ice", "operation"]);
const runnerCardTypes = new Set(["resource", "hardware", "program", "event"]);

// ---------------------------------------------------------------------------
// pick-replacement-card
// ---------------------------------------------------------------------------

/**
 * Given a card, pick a suitable replacement card at random.
 * Agendas maintain point value.
 * Programs maintain if they are/aren't icebreakers.
 * Everything else is random.
 * Mirrors pick-replacement-card.
 */
function pickReplacementCard(
  card: Record<string, unknown>,
): Record<string, unknown> {
  setCards();
  if (!cachedIndexes) throw new Error("Cached indexes not initialized");

  const cType = toKeyword((card.type as string) ?? "");

  // agenda (x points) -> agenda (x points)
  if (cType === "agenda") {
    const targetPoints = (card.agendapoints as number) ?? 0;
    const pool = cachedIndexes.agendaByPoints[targetPoints] ?? [];
    if (pool.length === 0) return card;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // identity -> identity (same side)
  if (cType === "identity") {
    const targetSide = toKeyword((card.side as string) ?? "");
    const pool = cachedIndexes.identityBySide[targetSide] ?? [];
    if (pool.length === 0) return card;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // program: maintain icebreaker / regular classification (with cross-contamination)
  if (cType === "program") {
    const hasIcebreaker = !!hasSubtype(card as Card, "Icebreaker");
    // 10% chance of cross-contamination for icebreakers
    const choice = shouldReplace("icebreakerCrossContam")
      ? hasIcebreaker
        ? "regular"
        : "icebreaker"
      : hasIcebreaker
        ? "icebreaker"
        : "regular";
    const pool = cachedIndexes.programByIcebreaker[choice] ?? [];
    if (pool.length === 0) return card;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // economy / regular split types
  if (filterByEconTypes.has(cType)) {
    const cardIsEcon = isEcon(card);
    // 10% cross-contamination for econ
    const choice = shouldReplace("econCrossContam")
      ? cardIsEcon
        ? "regular"
        : "economy"
      : cardIsEcon
        ? "economy"
        : "regular";
    const bucket = cachedIndexes.cardsByType[cType];
    if (
      typeof bucket === "object" &&
      !Array.isArray(bucket) &&
      "economy" in bucket
    ) {
      const pool = (bucket as Record<string, Record<string, unknown>[]>)[choice] ?? [];
      if (pool.length === 0) return card;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    // fallback to regular array
    const pool =
      (cachedIndexes.cardsByType[cType] as Record<string, unknown>[]) ?? [];
    if (pool.length === 0) return card;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // everything else: random from type pool
  const pool =
    (cachedIndexes.cardsByType[cType] as Record<string, unknown>[]) ?? [];
  if (pool.length === 0) return card;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------------------------------------------------------------------
// Replace functions
// ---------------------------------------------------------------------------

/** Mirrors replace-hand */
function replaceHand(state: GameState, side: string): void {
  const player = getPlayer(state, side);
  const hand = player.hand ?? [];
  const newHand = hand.map((card: Card) => {
    if (shouldReplace("hand", hand.length)) {
      disableCard(state, side, card);
      const replacement = pickReplacementCard(card);
      return { ...buildCard(replacement), zone: ["hand"] };
    }
    return card;
  });
  player.hand = newHand;
}

/** Mirrors replace-discard */
function replaceDiscard(state: GameState, side: string): void {
  const player = getPlayer(state, side);
  const discard = player.discard ?? [];
  const newDiscard = discard.map((card: Card) => {
    if (shouldReplace("discard")) {
      disableCard(state, side, card);
      const replacement = pickReplacementCard(card);
      return { ...buildCard(replacement), zone: ["discard"], seen: card.seen };
    }
    return card;
  });
  player.discard = newDiscard;
}

/** Mirrors replace-deck */
function replaceDeck(state: GameState, side: string): void {
  const player = getPlayer(state, side);
  const deck = player.deck ?? [];
  const newDeck = deck.map((card: Card) => {
    if (shouldReplace("deck")) {
      disableCard(state, side, card);
      const replacement = pickReplacementCard(card);
      return { ...buildCard(replacement), zone: ["deck"] };
    }
    return card;
  });
  player.deck = newDeck;
}

/** Mirrors replace-id */
function replaceId(state: GameState, side: string): void {
  if (!shouldReplace("id")) return;

  const player = getPlayer(state, side);
  const oldId = player.identity;
  if (!oldId) return;

  const newIdData = pickReplacementCard({ type: "Identity", side });

  // Handle hosted cards (Ayla) - Part 1: collect hosted cards
  const hostedCards = oldId.hosted ? [...oldId.hosted] : [];
  for (const c of hostedCards) {
    move(state, side, c, "temp-hosted");
  }

  // Disable old identity
  disableIdentity(state, side);

  // Set new identity
  const newId = {
    ...makeCard(newIdData),
    zone: ["identity"],
  };
  const numOldBlanks = (oldId.numDisables as number | undefined) ?? 0;

  player.identity = newId;
  cardInit(state, side, newId);

  // Re-apply disables from old identity
  for (let i = 0; i < numOldBlanks; i++) {
    disableIdentity(state, side);
  }

  // Handle hosted cards (Ayla) - Part 2: re-host on new identity
  const currentId = player.identity;
  if (currentId) {
    // Get cards from temp-hosted zone
    const tempHosted: Card[] = [];
    try {
      // temp-hosted is dynamically created by move; traverse state to find it
      const path = (side === "corp" || side === ":corp" ? state.corp : state.runner) as unknown as Record<string, Card[] | undefined>;
      if (path && Array.isArray(path.tempHosted)) {
        tempHosted.push(...path.tempHosted);
      } else if (path && Array.isArray(path["temp-hosted"])) {
        tempHosted.push(...path["temp-hosted"]);
      }
    } catch {
      // ignore errors accessing temp-hosted
    }

    for (const c of tempHosted) {
      // Currently assumes all hosted cards are hosted facedown (Ayla)
      host(state, side, currentId, c, { facedown: true });
    }
  }
}

/**
 * Transpose sides — swap corp and runner.
 * Mirrors transpose-sides.
 */
function transposeSides(state: GameState, side: string): void {
  systemMsg(state, side, "FINUKA TRANSPOSES");
  lobbyCommand({ command: "swap-sides", gameid: state.gameId });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Shuffle/replace cards for a side. Applies random card replacements
 * across hand, deck, discard and identity. May also transpose sides
 * (Finuka effect).
 *
 * Mirrors shuffle-cards-for-side.
 */
export function shuffleCardsForSide(state: GameState, side: string): void {
  replaceHand(state, side);
  replaceDeck(state, side);
  replaceDiscard(state, side);
  replaceId(state, side);

  // 1 in 50 chance at the start of each turn to swap the sides you're playing on
  if (shouldReplace("side")) {
    transposeSides(state, side);
  }
}
