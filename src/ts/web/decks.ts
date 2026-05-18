// Decks management module. Mirrors: src/clj/web/decks.clj
//
// Handles CRUD operations for user decklists and NRDB deck imports via WebSocket.

import { Db, ObjectId } from "mongodb";
import { slugify } from "../jinteki/utils";
import { AllCards } from "../jinteki/cards";
import { calculateDeckStatus, type Deck } from "../jinteki/validator";
import { toObjectId, createObjectId } from "./mongodb";
import { downloadPublicDecklist } from "./nrdb";
import { response, mongoTimeToUtcString, type HttpResponse } from "./utils";
import { broadcastTo, registerMsgHandler, type WSMessage } from "./ws";
import { logDelay } from "./lobby";

// ---- Types ----

interface WSMessageWithReq extends WSMessage {
  "ring-req"?: {
    system?: {
      db?: Db;
    };
    user?: Record<string, unknown>;
  };
}

interface DeckCardLine {
  qty: number;
  card: string | Record<string, unknown>;
  id?: string;
  art?: string;
  [key: string]: unknown;
}

interface DeckWithId {
  _id?: ObjectId | string;
  username?: string;
  status?: Record<string, unknown>;
  identity?: { title: string } | Record<string, unknown>;
  cards?: DeckCardLine[];
  [key: string]: unknown;
}

// ---- HTTP handler helpers ----

/**
 * Update a single card entry by resolving card data from the global card registry.
 * Mirrors: (defn update-card [card] (update card :card @all-cards))
 */
function updateCard(card: DeckCardLine): DeckCardLine {
  const cardTitle = typeof card.card === "string" ? card.card : "";
  return { ...card, card: AllCards[cardTitle] };
}

/**
 * Update a deck by resolving all card data and identity from the global card registry.
 * Mirrors: (defn update-deck [deck] ...)
 */
export function updateDeck(deck: Record<string, unknown>): Record<string, unknown> {
  const cards = (deck.cards as DeckCardLine[]) ?? [];
  const identity = deck.identity as { title?: string } | undefined;
  return {
    ...deck,
    cards: cards.map(updateCard),
    identity: identity?.title ? AllCards[identity.title] : undefined,
  };
}

/**
 * Prepare a deck document for database storage, selecting only relevant card fields
 * and attaching username and status.
 * Mirrors: (defn prepare-deck-for-db [deck username status] ...)
 */
function prepareDeckForDb(
  deck: Record<string, unknown>,
  username: string,
  status: Record<string, unknown>,
): DeckWithId {
  const cards = ((deck.cards as DeckCardLine[]) ?? []).map((card) => ({
    qty: card.qty,
    card: card.card,
    id: card.id,
    art: card.art,
  }));

  return {
    ...deck,
    cards,
    username,
    status,
  } as DeckWithId;
}

/**
 * Check if a deck is locked in the database.
 * Mirrors: (defn- deck-locked? [db deck-id] ...)
 */
async function deckLocked(db: Db, deckId: string): Promise<boolean> {
  const deck = await db.collection("decks").findOne({
    _id: toObjectId(deckId),
  });
  return deck?.locked === true;
}

/**
 * Create a salt byte array from a deck name using slugify.
 * Mirrors: (defn make-salt [deck-name] ...)
 */
function makeSalt(deckName: string): Uint8Array {
  const slug = slugify(deckName);
  const salt = slug
    ? Uint8Array.from(slug.split("").map((c) => c.charCodeAt(0)))
    : Uint8Array.from("default-salt".split("").map((c) => c.charCodeAt(0)));
  return salt;
}

// ---- HTTP Handlers ----

/**
 * List all decks for the current user.
 * Mirrors: (defn decks-handler ...)
 */
export async function decksHandler(
  db: Db,
  user: Record<string, unknown>,
): Promise<HttpResponse> {
  const uname = (user.username as string) ?? "__demo__";
  const decks = await db.collection("decks").find({ username: uname }).toArray();
  const result = decks.map((deck) => ({
    ...deck,
    date:
      typeof deck.date === "string"
        ? deck.date
        : mongoTimeToUtcString(deck.date as Date | null | undefined),
  }));
  return response(200, result);
}

/**
 * Create a new deck.
 * Mirrors: (defn decks-create-handler ...)
 */
export async function decksCreateHandler(
  db: Db,
  user: Record<string, unknown>,
  deck: Record<string, unknown>,
): Promise<HttpResponse> {
  const username = user.username as string | undefined;
  if (!username || !deck) {
    return response(401, { message: "Unauthorized" });
  }

  const updatedDeck = updateDeck(deck);
  const status = calculateDeckStatus(updatedDeck as unknown as Deck) as unknown as Record<string, unknown>;
  const deckForDb = prepareDeckForDb(deck, username, status);

  const result = await db.collection("decks").insertOne(deckForDb as any);
  const inserted = { ...deckForDb, _id: result.insertedId };
  return response(200, inserted);
}

/**
 * Save (update) an existing deck.
 * Mirrors: (defn decks-save-handler ...)
 */
export async function decksSaveHandler(
  db: Db,
  user: Record<string, unknown>,
  deck: DeckWithId,
): Promise<HttpResponse> {
  const username = user.username as string | undefined;
  if (!username || !deck) {
    return response(401, { message: "Unauthorized" });
  }

  const updatedDeck = updateDeck(deck);
  const status = calculateDeckStatus(updatedDeck as unknown as Deck) as unknown as Record<string, unknown>;
  const deckForDb = prepareDeckForDb(deck, username, status);

  const deckId = deck._id;
  if (!deckId) {
    return response(409, { message: "Deck is missing _id" });
  }

  if (await deckLocked(db, String(deckId))) {
    return response(403, { message: "Deck is locked" });
  }

  if (!deck.identity) {
    return response(409, { message: "Deck is missing identity" });
  }

  const { _id, ...deckWithoutId } = deckForDb;
  await db.collection("decks").updateOne(
    { _id: toObjectId(String(deckId)), username },
    { $set: deckWithoutId },
  );

  return response(200, { message: "OK", _id: toObjectId(String(deckId)) });
}

/**
 * Delete a deck by id.
 * Mirrors: (defn decks-delete-handler ...)
 */
export async function decksDeleteHandler(
  db: Db,
  user: Record<string, unknown>,
  id: string,
): Promise<HttpResponse> {
  const username = user.username as string | undefined;
  try {
    if (!username || !id) {
      return response(401, { message: "Unauthorized" });
    }

    if (await deckLocked(db, id)) {
      return response(403, { message: "Locked" });
    }

    const result = await db.collection("decks").deleteOne({
      _id: toObjectId(id),
      username,
    });

    if (result.deletedCount > 0) {
      return response(200, { message: "Deleted" });
    }
    return response(403, { message: "Forbidden" });
  } catch (e) {
    // Deleting a deck that was never saved throws an exception
    console.info(e, "failed to delete a decklist");
    return response(409, { message: "Unknown deck id" });
  }
}

/**
 * Bulk delete multiple decks with per-deck status reporting.
 * Mirrors: (defn decks-bulk-delete-handler ...)
 */
export async function decksBulkDeleteHandler(
  db: Db,
  user: Record<string, unknown>,
  body: { deck_ids?: string[] },
): Promise<HttpResponse> {
  const username = user.username as string | undefined;
  const deckIds = body.deck_ids;
  try {
    if (!username || !deckIds || !Array.isArray(deckIds)) {
      return response(401, { message: "Unauthorized or invalid request" });
    }

    if (deckIds.length === 0) {
      return response(200, []);
    }

    // Convert deck IDs to object IDs for MongoDB queries
    const deckObjectIds = deckIds.map(toObjectId).filter((id): id is ObjectId => !!id);

    // Perform atomic deletion: only delete decks that exist and are owned by user
    await db.collection("decks").deleteMany({
      _id: { $in: deckObjectIds },
      username,
    });

    // Query for remaining decks after deletion to determine which failed
    const remainingDecks = await db
      .collection("decks")
      .find({ _id: { $in: deckObjectIds }, username }, { projection: { _id: 1 } })
      .toArray();

    // Create map from string ID to deck for O(1) lookup
    const remainingDecksById = new Map(
      remainingDecks.map((deck) => [String((deck as any)._id), deck]),
    );

    // Generate per-deck status results
    const results = deckIds.map((deckId) => {
      if (remainingDecksById.has(deckId)) {
        // Deck still exists, so deletion failed
        return { id: deckId, status: "not deleted", error: "Deck could not be deleted" };
      }
      // Deck no longer exists, so deletion succeeded (or deck never existed, which is also success)
      return { id: deckId, status: "deleted" };
    });

    return response(200, results);
  } catch (e) {
    console.info(e, "Failed to bulk delete decks");
    return response(500, { message: "Internal server error" });
  }
}

// ---- WebSocket message handlers ----

/**
 * Import a deck from NRDB (NetRunner Database).
 * Mirrors: (defmethod ws/-msg-handler :decks/import decks--import ...)
 */
registerMsgHandler("decks/import", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const uid = msg.uid;
  const data = msg.data as { input?: string } | undefined;
  const input = data?.input;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "decks/import";

  const username = (user?.username as string) ?? "__demo__";

  try {
    if (!db || !input) {
      await broadcastTo(uid ? [uid] : [], "decks/import-failure", "Failed to import deck.");
      logDelay(timestamp, id);
      return;
    }

    const deck = await downloadPublicDecklist(db, input);
    if (!deck || !deck.name || !deck.identity || !deck.cards) {
      await broadcastTo(uid ? [uid] : [], "decks/import-failure", "Failed to parse imported deck.");
      logDelay(timestamp, id);
      return;
    }

    const dbDeck: Record<string, unknown> = {
      ...deck,
      _id: createObjectId(),
      date: new Date(),
      format: "standard",
    };

    const updatedDeck = updateDeck(dbDeck);
    const status = calculateDeckStatus(updatedDeck as unknown as Deck) as unknown as Record<string, unknown>;
    const deckForDb = prepareDeckForDb(dbDeck, username, status);

    await db.collection("decks").insertOne(deckForDb as any);
    await broadcastTo(uid ? [uid] : [], "decks/import-success", "Imported");
  } catch (e) {
    console.info(e, "failed to import decklist");
    await broadcastTo(uid ? [uid] : [], "decks/import-failure", "Failed to import deck.");
  }

  logDelay(timestamp, id);
});
