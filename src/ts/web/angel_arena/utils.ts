// Angel Arena utilities.
// Mirrors: src/clj/web/angel_arena/utils.clj

import { Db, Document } from "mongodb";
import { toObjectId } from "../mongodb";
import { AllCards } from "../../jinteki/cards";
import {
  calculateDeckStatus,
  Deck,
  DeckLine,
  CardData,
} from "../../jinteki/validator";
import { registerMsgHandler, chskSend, type WSMessage } from "../ws";

export const SUPPORTED_FORMATS = ["standard", "startup", "eternal"];

registerMsgHandler("angel-arena/formats", async (msg: WSMessage) => {
  if (msg.uid) {
    chskSend(msg.uid, ["angel-arena/formats", SUPPORTED_FORMATS]);
  }
});

export const INACTIVE_PERIOD_WARNING = 30;

export const INACTIVE_PERIOD_COUNTDOWN = 5;

export const MAX_INACTIVITY_COUNT = 3;

export interface SideRun {
  "deck-id"?: string;
  format?: string;
  side?: string;
  games?: Array<{
    "game-id"?: string;
    winner?: string | null;
    reason?: string | null;
    opponent?: {
      username?: string;
      pronouns?: string;
      identity?: string;
    };
  }>;
  "run-started"?: string;
}

export interface Runs {
  [form: string]: {
    [side: string]: SideRun;
  };
}

/**
 * Retrieve the angel-arena-runs field from a user document.
 * Mirrors: get-runs
 */
export async function getRuns(
  db: Db,
  username: string
): Promise<Runs | undefined> {
  try {
    const user = await db.collection<Document>("users").findOne(
      { username },
      { projection: { "angel-arena-runs": 1 } }
    );
    return (user?.["angel-arena-runs"] as Runs) ?? undefined;
  } catch (e: any) {
    console.log("Caught exception searching for run: " + e.message);
  }
}

/**
 * Retrieve a deck by ID, resolving card data and computing deck status.
 * Mirrors: get-deck-from-id
 */
export async function getDeckFromId(
  db: Db,
  username: string,
  deckId?: string
): Promise<Deck | undefined> {
  try {
    if (!deckId) return undefined;

    const mapCard = (c: Document): Document => {
      const title = c.card?.title as string | undefined;
      return { ...c, card: title ? AllCards[title] : undefined };
    };

    const unknownCard = (c: Document): boolean => !c.card;

    let deck = (await db.collection<Document>("decks").findOne({
      _id: toObjectId(deckId),
      username,
    })) as Document | null;

    if (!deck) return undefined;

    // Update cards with resolved card data, remove unknown cards
    const cards = (deck.cards as Document[] | undefined)
      ?.map(mapCard)
      .filter((c: Document) => !unknownCard(c));
    deck = {
      ...deck,
      cards: cards as DeckLine[],
    };

    // Resolve identity card data
    const identityTitle = (deck.identity as CardData | undefined)?.title;
    if (identityTitle) {
      deck = {
        ...deck,
        identity: AllCards[identityTitle] as CardData,
      };
    }

    // Calculate deck status
    deck = {
      ...deck,
      status: calculateDeckStatus(deck as Deck),
    };

    return deck as Deck;
  } catch (e: any) {
    console.log(
      "Caught exception searching for a deck from deck-id: " + e.message
    );
  }
}

/**
 * Get the current deck for a given format and side from the user's runs.
 * Mirrors: get-current-deck
 */
export async function getCurrentDeck(
  db: Db,
  username: string,
  form: string,
  side: string
): Promise<Deck | undefined> {
  const runs = await getRuns(db, username);
  const deckId = runs?.[form]?.[side]?.["deck-id"];
  return getDeckFromId(db, username, deckId);
}

/**
 * Count the number of wins in a run's game history.
 * Mirrors: get-wins
 */
export function getWins(runInfo: SideRun): number {
  const games = runInfo.games ?? [];
  const side = runInfo.side ?? "";
  return games.filter((g) => g.winner === side).length;
}

/**
 * Count the number of losses in a run's game history.
 * Mirrors: get-losses
 */
export function getLosses(runInfo: SideRun): number {
  const games = runInfo.games ?? [];
  const decidedGames = games.filter((g) => g.winner != null);
  return decidedGames.length - getWins(runInfo);
}
