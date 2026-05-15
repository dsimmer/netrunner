// Game internal view helpers for stripping private server information.
// Mirrors: src/clj/web/diffs.clj

// ---- Types ----

interface UserMap {
  _id?: unknown;
  username?: string;
  emailhash?: string;
  stats?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DeckMap {
  _id?: unknown;
  name?: unknown;
  date?: unknown;
  identity?: unknown;
  status?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PlayerMap {
  uid?: string;
  user?: UserMap;
  deck?: DeckMap;
  [key: string]: unknown;
}

interface FullGameLike {
  started?: boolean;
  format?: string;
  [key: string]: unknown;
}

interface GameUpdate {
  state?: unknown;
  "last-update"?: unknown;
  "on-close"?: unknown;
  password?: unknown;
  players?: PlayerMap[];
  "original-players"?: PlayerMap[];
  spectators?: PlayerMap[];
  "ending-players"?: PlayerMap[];
  [key: string]: unknown;
}

// ---- Helpers ----

/**
 * Only take keys that are useful in the lobby from a user map.
 * Mirrors: (filter-lobby-user user)
 */
function filterLobbyUser(user: Record<string, unknown>): Record<string, unknown> {
  const stats = (user.stats as Record<string, unknown>) || {};
  const filteredStats: Record<string, unknown> = {
    "games-started": stats["games-started"],
    "games-completed": stats["games-completed"],
  };
  return {
    _id: user._id,
    username: user.username,
    emailhash: user.emailhash,
    stats: filteredStats,
  };
}

/**
 * Strips private server information from a player map.
 * Mirrors: (user-public-view full-game player)
 */
function userPublicView(
  fullGame: FullGameLike,
  player: PlayerMap
): PlayerMap {
  const { started, format } = fullGame;

  // Dissoc :uid
  const { uid: _uid, ...rest } = player;

  // Update :user with filter-lobby-user
  const updatedPlayer = {
    ...rest,
    user: filterLobbyUser((player.user as Record<string, unknown>) || {}),
  } as PlayerMap;

  // Handle deck
  const deck = player.deck;
  if (deck && deck._id !== undefined && deck._id !== null) {
    const status = (deck.status as Record<string, unknown>) || {};
    const legal = format ? (status[format] as any)?.legal : undefined;

    const statusObj: Record<string, unknown> = { format };
    if (format) {
      statusObj[format] = { legal };
    }

    let strippedDeck: Record<string, unknown>;
    if (started) {
      strippedDeck = {
        name: deck.name,
        date: deck.date,
        identity: deck.identity,
      };
    } else {
      strippedDeck = {
        name: deck.name,
        date: deck.date,
      };
    }

    strippedDeck._id = String(deck._id);
    strippedDeck.status = statusObj;

    (updatedPlayer as Record<string, unknown>).deck = strippedDeck;
  }

  return updatedPlayer;
}

/**
 * Update a map at a key only if the key is present.
 * Mirrors: (update-if-contains m ks f & args)
 */
function updateIfContains<T extends Record<string, unknown>>(
  m: T,
  key: string,
  f: (val: any, ...args: unknown[]) => any,
  ...args: unknown[]
): T {
  if (key in m && m[key] !== undefined) {
    return { ...m, [key]: f(m[key], ...args) };
  }
  return m;
}

/**
 * Strips private server information from a game map, preparing to send the game to clients.
 * Mirrors: (game-internal-view full-game game-update)
 */
export function gameInternalView(
  fullGame: FullGameLike,
  gameUpdate: GameUpdate
): GameUpdate {
  // Dissoc :state :last-update :on-close
  const { state: _state, "last-update": _lastUpdate, "on-close": _onClose, ...rest } = gameUpdate;

  let result = rest as GameUpdate;

  // Update password to true if present
  result = updateIfContains(result, "password", () => true);

  // Update players collections with user-public-view
  result = updateIfContains(
    result,
    "players",
    (players: PlayerMap[]) => players.map((p) => userPublicView(fullGame, p))
  );
  result = updateIfContains(
    result,
    "original-players",
    (players: PlayerMap[]) => players.map((p) => userPublicView(fullGame, p))
  );
  result = updateIfContains(
    result,
    "spectators",
    (players: PlayerMap[]) => players.map((p) => userPublicView(fullGame, p))
  );
  result = updateIfContains(
    result,
    "ending-players",
    (players: PlayerMap[]) => players.map((p) => userPublicView(fullGame, p))
  );

  return result;
}
