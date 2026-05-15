// NRDB decklist download module. Mirrors: src/clj/web/nrdb.clj

import { Db } from "mongodb";
import type { CardData, DeckLine } from "../jinteki/validator";

const NRDB_DECKLIST_URL = "https://netrunnerdb.com/api/2.0/public/";
const NRDB_BASE_URL = "https://netrunnerdb.com/en/";

const PRIVATE_ENDPOINT = "deck/";
const PUBLIC_ENDPOINT = "decklist/";

// ---- Types ----

type Endpoint = "public" | "private" | "unknown";

interface NrdbApiDeck {
  name: string;
  id: string | number;
  cards: Record<string, number>;
}

interface NrdbApiResponse {
  success?: boolean;
  total?: number;
  data?: NrdbApiDeck[];
}

// ---- Helpers ----

/**
 * Want to handle an NRDB URL or just a deck/decklist id number
 * returns: [endpoint, id]
 * Mirrors: (parse-input input)
 */
function parseInput(input: string): [Endpoint, string] {
  let id: string;
  if (input.includes("/")) {
    const parts = input.split(/decklist\/|deck\/view\/|deck\//);
    const frame = parts[1] ?? "";
    id = frame.split("/")[0];
  } else {
    id = input;
  }
  const endpoint: Endpoint = input.includes("/decklist/")
    ? "public"
    : input.includes("/deck/")
      ? "private"
      : "unknown";
  return [endpoint, id];
}

/**
 * Mirrors: (lookup-card db id)
 */
async function lookupCard(db: Db, id: string): Promise<CardData | null> {
  let card = (await db
    .collection("cards")
    .findOne({ code: id })) as CardData | null;
  if (!card) {
    card = (await db.collection("cards").findOne({
      "previous-versions": { $elemMatch: { code: id } },
    })) as CardData | null;
  }
  return card;
}

/**
 * Mirrors: (reduce-card db) / (parse-cards db cards)
 * Returns a map with the identity and the cards in a deck separated.
 */
async function parseCards(
  db: Db,
  cards: Record<string, number>,
): Promise<{ identity: CardData | null; cards: DeckLine[] }> {
  const result: { identity: CardData | null; cards: DeckLine[] } = {
    identity: null,
    cards: [],
  };

  for (const [code, qty] of Object.entries(cards)) {
    const card = await lookupCard(db, code);
    if (!card) continue;
    if (card.type === "Identity") {
      result.identity = { title: card.title, side: card.side };
    } else {
      result.cards.push({ card: { title: card.title }, qty });
    }
  }

  return result;
}

/**
 * Mirrors: (readable-url endpoint id)
 */
function readableUrl(endpoint: Endpoint, id: string | number): string {
  if (endpoint === "private") {
    return `${NRDB_BASE_URL}deck/view/${id}`;
  }
  return `${NRDB_BASE_URL}decklist/${id}`;
}

/**
 * Mirrors: (parse-nrdb-deck endpoint db deck)
 */
function parseNrdbDeck(
  endpoint: Endpoint,
  deck: NrdbApiDeck,
): {
  name: string;
  notes: string;
  identity: CardData | null;
  cards: DeckLine[];
} | null {
  const readable = readableUrl(endpoint, deck.id);
  return {
    name: deck.name,
    notes: `imported from ${readable}`,
    identity: null,
    cards: [],
  };
}

/**
 * Mirrors: (parse-response endpoint db body)
 */
async function parseResponse(
  endpoint: Endpoint,
  db: Db,
  body: string,
): Promise<{
  name: string;
  notes: string;
  identity: CardData | null;
  cards: DeckLine[];
} | null> {
  let parsed: NrdbApiResponse;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.log("NRDB Query did not return valid JSON");
    return null;
  }

  if (!parsed.success) {
    console.log("NRDB Query did not return success using endpoint:", endpoint);
    return null;
  }
  if (parsed.total !== 1) {
    console.log("NRDB Query did not return one element");
    return null;
  }
  if (!parsed.data || !parsed.data.length) {
    console.log("NRDB Query does not have a data field");
    return null;
  }

  const deck = parsed.data[0];
  const baseDeck = parseNrdbDeck(endpoint, deck);
  if (!baseDeck) return null;

  const parsedCards = await parseCards(db, deck.cards);
  baseDeck.identity = parsedCards.identity;
  baseDeck.cards = parsedCards.cards;

  return baseDeck;
}

/**
 * Try to download a public decklist given a specific endpoint.
 * If the endpoint is unknown, try public first, then private.
 * Mirrors: (try-download-public-decklist db deck-id endpoint)
 */
async function tryDownloadPublicDecklist(
  db: Db,
  deckId: string,
  endpoint: Endpoint,
): Promise<Record<string, unknown> | null> {
  const chosen: string =
    endpoint === "private" ? PRIVATE_ENDPOINT : PUBLIC_ENDPOINT;
  const url = `${NRDB_DECKLIST_URL}${chosen}${deckId}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (e) {
    console.log(`Failed to download deck ${deckId}: ${(e as Error).message}`);
    return null;
  }

  if (!response.ok) {
    console.log(
      `Failed to download deck ${deckId} using endpoint ${endpoint}, status: ${response.status}`,
    );
    if (endpoint === "unknown") {
      return tryDownloadPublicDecklist(db, deckId, "private");
    }
    return null;
  }

  const body = await response.text();
  const maybeParsed = await parseResponse(endpoint, db, body);

  if (maybeParsed) {
    return maybeParsed;
  }

  if (endpoint === "unknown") {
    return tryDownloadPublicDecklist(db, deckId, "private");
  }

  return null;
}

/**
 * Mirrors: (download-public-decklist db input)
 */
export async function downloadPublicDecklist(
  db: Db,
  input: string,
): Promise<Record<string, unknown> | null> {
  const [endpoint, deckId] = parseInput(input);
  if (!deckId) return null;
  return tryDownloadPublicDecklist(db, deckId, endpoint);
}
