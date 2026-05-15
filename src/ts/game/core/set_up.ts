// Game initialization and set-up.
// Mirrors: src/clj/game/core/set_up.clj

import type { Card } from "./card";
import { cardDef } from "./card_defs";
import { fakeCheckpoint } from "./checkpoint";
import { publicStates } from "./diffs";
import { draw } from "./drawing";
import type { EID } from "./eid";
import {
  effectCompleted,
  makeEID,
  makeEIDFrom,
  registerEIDCallback,
} from "./eid";
import { triggerEvent, triggerEventSync } from "./engine";
import { cardInit, makeCard } from "./initializing";
import type { GameState } from "./state";
import { newCorp, newRunner, newGameState, getPlayer } from "./state";
import { clearWaitPrompt, showPrompt, showWaitPrompt } from "./prompts";
import { checkQuickDraft } from "./quick_draft";
import { implementationMsg, systemMsg } from "./say";
import { shuffleIntoDeck } from "./shuffling";
import { makeQuote } from "../quotes";
import { serverCard } from "../utils";

// ---------------------------------------------------------------------------
// build-card / create-deck
// ---------------------------------------------------------------------------

/**
 * Builds a Card instance from server data, preserving the :art field.
 * Mirrors: build-card
 */
export function buildCard(card: Record<string, unknown>): Card {
  const sCard = serverCard(card.title as string) ?? card;
  const built = makeCard(sCard);
  built.art = card.art as string | undefined;
  return built;
}

/**
 * Creates a shuffled draw deck (R&D/Stack) from the given deck definition.
 * Loads card data from the server-card map if available.
 * Mirrors: create-deck
 */
function createDeck(deck: {
  cards?: { card: Record<string, unknown>; qty?: number; art?: string }[];
}): Card[] {
  const cards = deck.cards ?? [];
  const expanded: Card[] = [];
  for (const entry of cards) {
    const qty = entry.qty ?? 1;
    const cardData = { ...entry.card, art: entry.art };
    for (let i = 0; i < qty; i++) {
      expanded.push(buildCard(cardData));
    }
  }
  // Shuffle using Fisher-Yates
  for (let i = expanded.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [expanded[i], expanded[j]] = [expanded[j], expanded[i]];
  }
  return expanded;
}

// ---------------------------------------------------------------------------
// mulligan / keep-hand
// ---------------------------------------------------------------------------

/**
 * Mulligan starting hand.
 * Mirrors: mulligan
 */
export function mulligan(
  state: GameState,
  side: string,
  _eid: EID | null,
): void {
  shuffleIntoDeck(state, side, "hand");
  const eid = makeEID(state);
  draw(state, side, eid, 5, { suppressEvent: true, noUpdateDrawStats: true });
  const card = getPlayer(state, side).identity;
  if (card) {
    const cdef = cardDef(card);
    const mul = (cdef as unknown as Record<string, unknown>).mulligan as
      | ((s: GameState, sd: string, e: EID, c: Card, t: unknown) => void)
      | undefined;
    if (mul) {
      mul(state, side, eid, card, null);
    }
  }
  (getPlayer(state, side) as any).keep = "mulligan";
  systemMsg(state, side, "takes a mulligan");
  triggerEvent(state, side, "pre-first-turn", null, null);
  if (side === "corp" && state.runner.identity?.title) {
    clearWaitPrompt(state, "runner");
    showWaitPrompt(state, "corp", "Runner to keep hand or mulligan");
  }
  if (side === "runner" && state.corp.identity?.title) {
    clearWaitPrompt(state, "corp");
  }
}

/**
 * Choose not to mulligan.
 * Mirrors: keep-hand
 */
export function keepHand(
  state: GameState,
  side: string,
  _eid: EID | null,
): void {
  (getPlayer(state, side) as any).keep = "keep";
  systemMsg(state, side, "keeps [their] hand");
  triggerEvent(state, side, "pre-first-turn", null, null);
  if (side === "corp" && state.runner.identity?.title) {
    clearWaitPrompt(state, "runner");
    showWaitPrompt(state, "corp", "Runner to keep hand or mulligan");
  }
  if (side === "runner" && state.corp.identity?.title) {
    clearWaitPrompt(state, "corp");
  }
}

// ---------------------------------------------------------------------------
// init-hands
// ---------------------------------------------------------------------------

/**
 * Draw initial hands and show mulligan prompts.
 * Mirrors: init-hands
 */
function initHands(state: GameState): void {
  const eid = makeEID(state);
  draw(state, "corp", eid, 5, { suppressEvent: true });
  draw(state, "runner", eid, 5, { suppressEvent: true });

  for (const side of ["corp", "runner"]) {
    if (getPlayer(state, side).identity?.title) {
      showPrompt(
        state,
        side,
        null,
        "Keep hand?",
        ["Keep", "Mulligan"],
        (data: { value?: string }) => {
          if (data.value === "Keep") {
            keepHand(state, side, null);
          } else {
            mulligan(state, side, null);
          }
        },
        { promptType: "mulligan" },
      );
    }
  }

  if (state.corp.identity?.title && state.runner.identity?.title) {
    showWaitPrompt(state, "runner", "Corp to keep hand or mulligan");
  }
}

// ---------------------------------------------------------------------------
// init-game-state
// ---------------------------------------------------------------------------

interface PlayerData {
  user: Record<string, unknown>;
  deck: {
    _id?: string;
    cards?: { card: Record<string, unknown>; qty?: number; art?: string }[];
    identity?: Record<string, unknown>;
  };
  options?: Record<string, unknown>;
  side?: string;
}

interface GameData {
  players: PlayerData[];
  gameid?: string;
  timer?: unknown;
  spectatorhands?: boolean;
  apiAccess?: boolean;
  saveReplay?: boolean;
  room?: string;
  format?: string;
  messages?: string[];
  openDecklists?: boolean;
}

/**
 * Initialises the game state.
 * Mirrors: init-game-state
 */
function initGameState(game: GameData): GameState {
  const players = game.players ?? [];
  const corpPlayer = players.find((p) => p.side === "Corp") ?? null;
  const runnerPlayer = players.find((p) => p.side === "Runner") ?? null;

  const corpDeck = createDeck(corpPlayer?.deck ?? {});
  const runnerDeck = createDeck(runnerPlayer?.deck ?? {});

  const corpDeckId = corpPlayer?.deck?._id ?? "";
  const runnerDeckId = runnerPlayer?.deck?._id ?? "";

  const corpOptions = corpPlayer?.options ?? {};
  const runnerOptions = runnerPlayer?.options ?? {};

  const corpIdentity = buildCard(
    corpPlayer?.deck?.identity ?? {
      side: "Corp",
      type: "Identity",
      title: "Custom Biotics: Engineered for Success",
    },
  );

  const runnerIdentity = buildCard(
    runnerPlayer?.deck?.identity ?? {
      side: "Runner",
      type: "Identity",
      title: "The Professor: Keeper of Knowledge",
    },
  );

  const corpQuote = makeQuote(corpIdentity, runnerIdentity);
  const runnerQuote = makeQuote(runnerIdentity, corpIdentity);

  const corp = newCorp(
    corpPlayer?.user ?? {},
    corpIdentity,
    corpOptions,
    corpDeck.map((c) => ({ ...c, zone: ["deck"] }) as Card),
    corpDeckId,
    corpQuote,
  );

  const runner = newRunner(
    runnerPlayer?.user ?? {},
    runnerIdentity,
    runnerOptions,
    runnerDeck.map((c) => ({ ...c, zone: ["deck"] }) as Card),
    runnerDeckId,
    runnerQuote,
  );

  const options: Record<string, unknown> = {
    timer: game.timer,
    spectatorhands: game.spectatorhands,
    apiAccess: game.apiAccess,
    saveReplay: game.saveReplay,
  };

  return newGameState(
    game.gameid ?? "",
    game.room ?? "",
    game.format ?? "",
    new Date(),
    options,
    corp,
    runner,
  );
}

// ---------------------------------------------------------------------------
// create-basic-action-cards
// ---------------------------------------------------------------------------

/**
 * Create basic action cards for both players.
 * Mirrors: create-basic-action-cards
 */
function createBasicActionCards(state: GameState): void {
  state.corp.basicActionCard = makeCard({
    side: "Corp",
    type: "Basic Action",
    title: "Corp Basic Action Card",
  });
  state.runner.basicActionCard = makeCard({
    side: "Runner",
    type: "Basic Action",
    title: "Runner Basic Action Card",
  });
}

// ---------------------------------------------------------------------------
// sort-deck-for-display / set-deck-lists
// ---------------------------------------------------------------------------

/**
 * Sorts deck cards by type then title for display in decklist with type dividers.
 * Mirrors: sort-deck-for-display
 */
function sortDeckForDisplay(deck: Card[]): Array<[string, string | number]> {
  // Group by title
  const byTitle = new Map<string, Card[]>();
  for (const card of deck) {
    const title = card.title ?? "Unknown";
    const group = byTitle.get(title) ?? [];
    group.push(card);
    byTitle.set(title, group);
  }

  // Build entries: [title, qty, type]
  type Entry = [string, number, string];
  const entries: Entry[] = [];
  for (const [title, cards] of byTitle) {
    const cardType = cards[0].type ?? "Unknown";
    entries.push([title, cards.length, cardType]);
  }

  // Sort by [type, title]
  entries.sort((a, b) => {
    if (a[2] < b[2]) return -1;
    if (a[2] > b[2]) return 1;
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });

  // Partition by type and add dividers
  const result: Array<[string, string | number]> = [];
  let currentType: string | null = null;
  for (const [title, qty, cardType] of entries) {
    if (cardType !== currentType) {
      result.push([cardType, "divider"]);
      currentType = cardType;
    }
    result.push([title, qty]);
  }

  return result;
}

/**
 * Set deck lists for open decklists mode.
 * Mirrors: set-deck-lists
 */
function setDeckLists(state: GameState): void {
  const runnerCards = sortDeckForDisplay(state.runner.deck);
  const corpCards = sortDeckForDisplay(state.corp.deck);
  state.decklists = { corp: corpCards, runner: runnerCards };
}

// ---------------------------------------------------------------------------
// init-game
// ---------------------------------------------------------------------------

/**
 * Initializes a new game with the given players vector.
 * Mirrors: init-game
 */
export function initGame(game: GameData): GameState {
  const state = initGameState(game);

  const corpIdentity = state.corp.identity;
  const runnerIdentity = state.runner.identity;

  if (game.messages && game.messages.length > 0) {
    state.log.public = game.messages.map((m) => ({
      user: "__system__",
      text: m,
    }));
    state.log.public.push({ user: "__system__", text: "[hr]" });
  } else {
    state.log.public = [];
  }

  if (game.openDecklists) {
    setDeckLists(state);
  }

  if (corpIdentity) {
    cardInit(state, "corp", corpIdentity);
    implementationMsg(state, corpIdentity);
  }
  if (runnerIdentity) {
    cardInit(state, "runner", runnerIdentity);
    implementationMsg(state, runnerIdentity);
  }

  createBasicActionCards(state);
  fakeCheckpoint(state);

  const eid = makeEID(state);

  // wait-for chain mirrors Clojure:
  //   (wait-for (check-quick-draft ...)
  //     (wait-for (trigger-event-sync :corp ...)
  //       (wait-for (trigger-event-sync :runner ...)
  //         (init-hands ...)
  //         (fake-checkpoint ...)
  //         (effect-completed ...))))
  const innerEid1 = makeEIDFrom(state, eid);
  registerEIDCallback(state, innerEid1, () => {
    const innerEid2 = makeEIDFrom(state, innerEid1);
    registerEIDCallback(state, innerEid2, () => {
      const innerEid3 = makeEIDFrom(state, innerEid2);
      registerEIDCallback(state, innerEid3, () => {
        initHands(state);
        fakeCheckpoint(state);
        effectCompleted(state, null, eid);
      });
      triggerEventSync(state, "runner", innerEid3, "pre-start-game", null);
    });
    triggerEventSync(state, "corp", innerEid2, "pre-start-game", null);
  });
  checkQuickDraft(state, game.format ?? "", innerEid1);

  const ps = publicStates(state);
  const histState = ps["hist-state"];
  state.history = [histState];

  return state;
}
