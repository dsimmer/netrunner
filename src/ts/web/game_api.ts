// Game API handlers for external API access.
// Mirrors: src/clj/web/game_api.clj

import { Db } from "mongodb";
import { toObjectId } from "./mongodb";
import { response } from "./utils";
import { updateDeck } from "./decks";
import { uidPlayerToLobby } from "./lobby";

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface CardImages {
  en?: {
    default?: {
      stock?: string;
    };
  };
}

interface Card {
  _id?: unknown;
  images?: CardImages;
  quantity?: number;
  format?: string;
  rotated?: boolean;
  normalizedtitle?: string;
  previousVersions?: unknown[];
  title?: string;
  [key: string]: unknown;
}

interface DeckCard {
  qty?: number;
  card?: Card;
  [key: string]: unknown;
}

interface Deck {
  name?: string;
  identity?: Card;
  cards?: DeckCard[];
  [key: string]: unknown;
}

interface ApiRecord {
  username?: string;
  [key: string]: unknown;
}

interface GameStateSide {
  user?: {
    username?: string;
  };
  deckId?: string;
  deck?: unknown[];
  hand?: unknown[];
  discard?: unknown[];
  [key: string]: unknown;
}

interface GameState {
  corp?: GameStateSide;
  runner?: GameStateSide;
  options?: {
    apiAccess?: boolean;
    [key: string]: unknown;
  };
  log?: unknown[];
  [key: string]: unknown;
}

interface GamePlayer {
  user?: {
    username?: string;
  };
  deck?: {
    _id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface Game {
  started?: boolean;
  state?: {
    deref(): GameState;
    [key: string]: unknown;
  };
  apiAccess?: boolean;
  players?: GamePlayer[];
  deck?: {
    _id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface RequestContext {
  system?: {
    db?: Db;
    [key: string]: unknown;
  };
  scheme?: string;
  headers?: Record<string, string | undefined>;
  [key: string]: unknown;
}

type ActionFn = (username: string, game: Game, ctx: RequestContext) => Promise<any>;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function makeLink(host: string, path: string): string {
  return host + path;
}

function makeCardDetails(host: string, card: Card | undefined): Record<string, unknown> {
  if (!card) return {};
  const {
    _id,
    images,
    quantity,
    format,
    rotated,
    normalizedtitle,
    previousVersions,
    ...rest
  } = card;
  const stockPath = (images?.en?.default?.stock as string) || "";
  return {
    ...rest,
    image: makeLink(host, stockPath),
  };
}

function makeCardInfo(host: string, card: DeckCard): Record<string, unknown> {
  return {
    qty: card.qty,
    title: (card.card as Card | undefined)?.title,
    details: makeCardDetails(host, card.card),
  };
}

function getDeckId(username: string, game: Game): string | undefined {
  if (game.started) {
    const state = game.state?.deref();
    const side =
      username === state?.runner?.user?.username ? "runner" : "corp";
    return (side === "runner" ? state?.runner : state?.corp)?.deckId;
  }
  const player = game.players?.find(
    (p: GamePlayer) => p.user?.username === username,
  );
  return player?.deck?._id;
}

async function getDeck(
  db: Db,
  username: string,
  game: Game,
): Promise<Deck | null> {
  const deckId = getDeckId(username, game);
  if (!deckId) return null;
  const deckDoc = await db
    .collection<Deck>("decks")
    .findOne({ _id: toObjectId(deckId), username: username });
  if (deckDoc) {
    return updateDeck(deckDoc);
  }
  return null;
}

function tryParseUuid(str: string): string | null {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) {
    return str;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core API handler
// ---------------------------------------------------------------------------

async function apiHandler(
  ctx: RequestContext,
  action: ActionFn,
): Promise<any> {
  const apiKey = ctx.headers?.["x-jnet-api"];
  if (!apiKey) {
    return response(400, { message: "No X-JNet-API header specified" });
  }

  const apiUuid = tryParseUuid(apiKey);
  const db = ctx.system?.db;
  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const apiRecord = await db
    .collection<ApiRecord>("api-keys")
    .findOne(
      { "api-key": apiUuid },
      { projection: { username: 1 } },
    );

  if (!apiRecord?.username) {
    return response(404, { message: "Unknown X-JNet-API key" });
  }

  const username = apiRecord.username;
  const game = uidPlayerToLobby(username) as Game | undefined;
  const state = game?.state?.deref();
  const inGameOptions = state?.options;
  const allowAccess = game?.apiAccess || inGameOptions?.apiAccess;

  if (!game || !allowAccess) {
    return response(403, {
      message: "No game for key or API Access not enabled",
    });
  }

  return action(username, game, ctx);
}

// ---------------------------------------------------------------------------
// Public handler functions
// ---------------------------------------------------------------------------

export async function decklistHandler(ctx: RequestContext): Promise<any> {
  return apiHandler(ctx, async (username, game, _ctx) => {
    const db = ctx.system?.db;
    if (!db) {
      return response(500, { message: "Database not available" });
    }
    const deck = await getDeck(db, username, game);
    if (!deck) {
      return response(204, { message: "No deck selected" });
    }

    const host = `${ctx.scheme}://${ctx.headers?.host}`;
    return response(200, {
      name: deck.name,
      identity: {
        title: (deck.identity as Card | undefined)?.title,
        details: makeCardDetails(host, deck.identity),
      },
      cards: (deck.cards || []).map((card) => makeCardInfo(host, card)),
    });
  });
}

function getSide(username: string, state: GameState): "corp" | "runner" | null {
  if (username === state.corp?.user?.username) return "corp";
  if (username === state.runner?.user?.username) return "runner";
  return null;
}

async function areaHandler(
  ctx: RequestContext,
  area: keyof Pick<GameStateSide, "deck" | "hand" | "discard">,
): Promise<any> {
  return apiHandler(ctx, async (username, game, _ctx) => {
    const state = game.state?.deref();
    const side = getSide(username, state);
    if (!side) {
      return response(204, { message: "No deck selected" });
    }

    const areaCards = state[side]?.[area] || [];
    const stack = (areaCards as { code?: string }[])
      .map((c) => c.code)
      .filter((c): c is string => c !== undefined)
      .sort();
    return response(200, { cards: stack });
  });
}

export async function deckHandler(ctx: RequestContext): Promise<any> {
  return areaHandler(ctx, "deck");
}

export async function handHandler(ctx: RequestContext): Promise<any> {
  return areaHandler(ctx, "hand");
}

export async function discardHandler(ctx: RequestContext): Promise<any> {
  return areaHandler(ctx, "discard");
}

export async function logHandler(ctx: RequestContext): Promise<any> {
  return apiHandler(ctx, async (username, game, _ctx) => {
    const state = game.state?.deref();
    return response(200, { messages: state.log || [] });
  });
}
