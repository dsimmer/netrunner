// Statistics and replay management. Mirrors: src/clj/web/stats.clj

import { Db, ObjectId, WithId, Document } from "mongodb";
import { dissocIn } from "../game/utils";
import { AllCards } from "../jinteki/cards";
import { chskSend } from "./ws";
import { activeUser } from "./user";
import { response, jsonResponse, mongoTimeToUtcString } from "./utils";

// ---- Types ----

interface PlayerRecord {
  side?: string;
  uid?: string;
  user?: {
    _id?: string;
    username?: string;
    emailhash?: string;
    email?: string;
    options?: {
      deckstats?: boolean;
      gamestats?: boolean;
      "save-replay"?: boolean;
    };
  };
  deck?: {
    _id?: string;
    name?: string;
    identity?: {
      title?: string;
    };
  };
}

interface GameData {
  gameid?: string;
  date?: Date;
  "start-date"?: Date;
  title?: string;
  room?: string;
  players?: PlayerRecord[];
  format?: string;
  state?: { state: Record<string, unknown> } | any;
  "original-players"?: PlayerRecord[];
  "ending-players"?: PlayerRecord[];
  precon?: unknown;
}

interface GameLogDoc {
  gameid: string;
  title?: string;
  room?: string;
  "creation-date"?: Date;
  "start-date"?: Date;
  format?: string;
  corp?: {
    player?: { username?: string; emailhash?: string };
    "deck-name"?: string;
    identity?: string;
  };
  runner?: {
    player?: { username?: string; emailhash?: string };
    "deck-name"?: string;
    identity?: string;
  };
  winner?: string;
  reason?: string;
  "end-date"?: Date;
  stats?: Record<string, unknown>;
  turn?: number;
  "corp.agenda-points"?: number;
  "runner.agenda-points"?: number;
  "bug-reported"?: boolean;
  replay?: string;
  "has-replay"?: boolean;
  "replay-shared"?: boolean;
  log?: unknown[];
  annotations?: Annotation[];
}

export interface Annotation {
  username?: string;
  date?: Date | string;
  turns?: {
    corp?: Record<string, unknown>;
    runner?: Record<string, unknown>;
  };
  clicks?: Record<string, unknown>;
}

export interface RequestLike {
  system?: {
    db?: Db;
  };
  user?: Record<string, unknown>;
  "path-params"?: Record<string, string>;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  scheme?: string | "http" | "https";
  headers?: Record<string, string>;
  url?: string;
  originalUrl?: string;
}

// ---- Constants ----

const GAME_LOG_COLL = "game-logs";

// ---- Helpers ----

/**
 * Convert an id to ObjectId if it's a string, otherwise return as-is.
 * Mirrors: ->object-id
 */
export function toObjectId(id?: string | ObjectId | null): ObjectId | undefined {
  if (!id) return undefined;
  if (id instanceof ObjectId) return id;
  return new ObjectId(id as string);
}

/**
 * Take a stats prefix and add a side to it.
 * Mirrors: build-stats-kw
 */
function buildStatsKw(prefix: string, side?: string | null): string {
  return `${prefix}${(side || "Corp").toLowerCase()}`;
}

/**
 * Get the state deref from a state atom-like wrapper.
 */
function derefState(state: any): Record<string, unknown> {
  if (state && typeof state === "object") {
    // If it's a direct object (not a wrapper), use it
    if ("history" in state || "corp" in state) return state;
    // If it has a .deref or is a JS wrapper
    if (typeof (state as any).deref === "function") return (state as any).deref();
    if (state.value) return state.value;
  }
  return state || {};
}

// ---- Deck Stats ----

/**
 * Update deck stats for a given counter.
 * Mirrors: inc-deck-stats
 */
async function incDeckStats(
  db: Db,
  deckId: string | undefined,
  record: Record<string, number>
): Promise<void> {
  if (!record || !deckId) return;
  const objId = toObjectId(deckId);
  if (!objId) return;
  await db.collection("decks").updateOne({ _id: objId }, { $inc: record as any });
}

/**
 * Build stats record for a player at game end.
 * Mirrors: deck-record-end
 */
function deckRecordEnd(
  state: Record<string, unknown>,
  player: PlayerRecord
): Record<string, number> {
  const enableDeckstats = player.user?.options?.deckstats;
  const deckId = player.deck?._id;
  const winningDeck = state["winning-deck-id"] as string | undefined;
  const losingDeck = state["losing-deck-id"] as string | undefined;

  const record: Record<string, number> = {};
  if (enableDeckstats && deckId) {
    record["stats.games-completed"] = 1;
  }
  if (enableDeckstats && deckId && winningDeck === deckId) {
    record["stats.wins"] = 1;
  }
  if (enableDeckstats && deckId && losingDeck === deckId) {
    record["stats.loses"] = 1;
  }
  return record;
}

/**
 * Update stats for player decks on game ending.
 * Mirrors: update-deck-stats
 */
export async function updateDeckStats(
  db: Db,
  gameData: GameData
): Promise<void> {
  if (gameData.precon) return;

  const originalPlayers = gameData["original-players"] || [];
  for (const player of originalPlayers) {
    const enableDeckstats = player.user?.options?.deckstats;
    const deckId = player.deck?._id;
    if (enableDeckstats && deckId) {
      await incDeckStats(db, deckId, { "stats.games-started": 1 });
    }
  }

  const endingPlayers = gameData["ending-players"] || [];
  for (const player of endingPlayers) {
    const state = derefState(gameData.state);
    const record = deckRecordEnd(state, player);
    const deckId = player.deck?._id;
    await incDeckStats(db, deckId, record);
  }
}

// ---- Game (User) Stats ----

/**
 * Update user's game stats for a given counter.
 * Mirrors: inc-game-stats
 */
async function incGameStats(
  db: Db,
  userId: string | undefined,
  record: Record<string, number>
): Promise<void> {
  if (!record || !userId) return;
  const objId = toObjectId(userId);
  if (!objId) return;
  await db.collection("users").updateOne({ _id: objId }, { $inc: record as any });
}

/**
 * Build stats record for a player at game start.
 * Mirrors: game-record-start
 */
function gameRecordStart(player: PlayerRecord): Record<string, number> {
  const record: Record<string, number> = {
    "stats.games-started": 1,
  };
  const sideKey = buildStatsKw("stats.games-started-", player.side);
  record[sideKey] = 1;
  return record;
}

/**
 * Build stats record for a player at game end.
 * Mirrors: game-record-end
 */
function gameRecordEnd(
  state: Record<string, unknown>,
  player: PlayerRecord
): Record<string, number> {
  const username = player.user?.username;
  const enableUserstats = player.user?.options?.gamestats;
  const winningUser = state["winning-user"] as string | undefined;
  const losingUser = state["losing-user"] as string | undefined;
  const sideStr = player.side || "";

  const record: Record<string, number> = {
    "stats.games-completed": 1,
  };
  const completedKey = buildStatsKw("stats.games-completed-", sideStr);
  record[completedKey] = 1;

  if (username === winningUser && enableUserstats) {
    record["stats.wins"] = 1;
    const winsKey = buildStatsKw("stats.wins-", sideStr);
    record[winsKey] = 1;
  }
  if (username === losingUser && enableUserstats) {
    record["stats.loses"] = 1;
    const losesKey = buildStatsKw("stats.loses-", sideStr);
    record[losesKey] = 1;
  }

  return record;
}

/**
 * Update game stats for users on game ending.
 * Mirrors: update-game-stats
 */
export async function updateGameStats(
  db: Db,
  gameData: GameData
): Promise<void> {
  const originalPlayers = gameData["original-players"] || [];
  for (const player of originalPlayers) {
    if (player.side) {
      const userId = player.user?._id;
      await incGameStats(db, userId, gameRecordStart(player));
    } else {
      console.error(`NULL start player side in stats for gameid ${gameData.gameid}`);
    }
  }

  const endingPlayers = gameData["ending-players"] || [];
  for (const player of endingPlayers) {
    if (player.side) {
      const userId = player.user?._id;
      const state = derefState(gameData.state);
      await incGameStats(db, userId, gameRecordEnd(state, player));
    } else {
      console.error(`NULL end player side in stats for gameid ${gameData.gameid}`);
    }
  }
}

// ---- Stats Push (WebSocket) ----

/**
 * Get statistics for a given deck id.
 * Mirrors: stats-for-deck
 */
async function statsForDeck(db: Db, deckId: string | undefined): Promise<Document | null> {
  if (!deckId) return null;
  const objId = toObjectId(deckId);
  if (!objId) return null;
  return db.collection("decks").findOne({ _id: objId }, { projection: { stats: 1 } });
}

/**
 * Get statistics for a given user id.
 * Mirrors: stats-for-user
 */
async function statsForUser(db: Db, userId: string | undefined): Promise<Document | null> {
  if (!userId) return null;
  const objId = toObjectId(userId);
  if (!objId) return null;
  return db.collection("users").findOne({ _id: objId }, { projection: { stats: 1 } });
}

/**
 * Gather updated deck and user stats and send via web socket to clients.
 * Mirrors: push-stats-update
 */
export async function pushStatsUpdate(
  db: Db,
  gameData: GameData
): Promise<void> {
  const endingPlayers = gameData["ending-players"] || [];
  for (const player of endingPlayers) {
    const userId = player.user?._id;
    const deckId = player.deck?._id;
    const userStats = (await statsForUser(db, userId))?.stats;
    const deckStats = (await statsForDeck(db, deckId))?.stats;

    const uid = player.uid;
    if (uid) {
      chskSend(uid, [
        "stats/update",
        {
          userstats: userStats,
          "deck-id": deckId ? String(deckId) : "",
          deckstats: deckStats,
        },
      ]);
    }
  }
}

// ---- Game Logs ----

/**
 * Log a game start.
 * Mirrors: game-started
 */
export async function gameStarted(
  db: Db,
  gameData: GameData
): Promise<void> {
  const players = gameData.players || [];
  const corp = players.find((p) => p.side === "Corp");
  const runner = players.find((p) => p.side === "Runner");

  const logDoc: Record<string, unknown> = {
    gameid: String(gameData.gameid),
    title: gameData.title,
    room: gameData.room,
    "creation-date": gameData.date,
    "start-date": gameData["start-date"],
    format: gameData.format,
    corp: {
      player: {
        username: corp?.user?.username,
        emailhash: corp?.user?.emailhash,
      },
      "deck-name": corp?.deck?.name,
      identity: corp?.deck?.identity?.title,
    },
    runner: {
      player: {
        username: runner?.user?.username,
        emailhash: runner?.user?.emailhash,
      },
      "deck-name": runner?.deck?.name,
      identity: runner?.deck?.identity?.title,
    },
  };

  await db.collection("game-logs").insertOne(logDoc);
}

// ---- Replay Helpers ----

/**
 * Generate replay JSON from game state.
 * Mirrors: generate-replay
 */
function generateReplay(state: any): string {
  const derefed = derefState(state);
  const stats = (derefed.stats as Record<string, unknown> | undefined) || {};
  const cleanedStats = dissocIn(dissocIn(stats, ["time", "started"]), ["time", "ended"]);

  const replay = {
    metadata: {
      winner: derefed.winner,
      reason: derefed.reason,
      "end-date": new Date(),
      stats: cleanedStats,
      turn: derefed.turn,
      "corp.agenda-points": (derefed.corp as any)?.["agenda-point"],
      "runner.agenda-points": (derefed.runner as any)?.["agenda-point"],
    },
    history: derefed.history,
  };
  return JSON.stringify(replay);
}

/**
 * Filter log entries for a given side.
 * Mirrors: filter-log-for-side
 */
export function filterLogForSide(
  log: unknown[] | undefined,
  side: "corp" | "runner"
): unknown[] {
  if (!Array.isArray(log)) return [] as unknown[];
  const result: unknown[] = [];
  for (const entry of log) {
    if ((entry as any).user) {
      // old format: message object directly
      result.push(entry);
    } else {
      // new format: side-keyed map
      const sideEntry = (entry as any)[side];
      const publicEntry = (entry as any).public;
      if (sideEntry) {
        result.push(sideEntry);
      } else if (publicEntry) {
        result.push(publicEntry);
      }
    }
  }
  return result;
}

/**
 * Delete old replays for a user, keeping only the 15 most recent.
 * Mirrors: delete-old-replay
 */
export async function deleteOldReplay(
  db: Db,
  username: string
): Promise<void> {
  const games = await db
    .collection("game-logs")
    .find({
      $and: [
        {
          $or: [
            { "corp.player.username": username },
            { "runner.player.username": username },
          ],
        },
        { replay: { $exists: true } },
        { "replay-shared": false },
      ],
    })
    .project({ gameid: 1 })
    .sort({ "start-date": -1 })
    .skip(15)
    .toArray();

  for (const game of games) {
    await db.collection("game-logs").updateOne(
      { gameid: game.gameid },
      { $unset: { replay: null }, $set: { "has-replay": false } }
    );
  }
}

/**
 * Mark a game as finished — save winner, stats, replay, log, etc.
 * Mirrors: game-finished
 */
export async function gameFinished(
  db: Db,
  gameData: GameData
): Promise<void> {
  const state = derefState(gameData.state);
  if (!state) return;

  const shouldSaveReplay =
    (state.options as any)?.["save-replay"] || (state["bug-reported"] as boolean);
  const shouldShareReplay = state["bug-reported"] as boolean;

  try {
    const stats = (state.stats as Record<string, unknown> | undefined) || {};
    const cleanedStats = dissocIn(dissocIn(stats, ["time", "started"]), ["time", "ended"]);

    const updateDoc: Record<string, unknown> = {
      $set: {
        winner: state.winner,
        reason: state.reason,
        "end-date": new Date(),
        stats: cleanedStats,
        turn: state.turn,
        "corp.agenda-points": (state.corp as any)?.["agenda-point"],
        "runner.agenda-points": (state.runner as any)?.["agenda-point"],
        "bug-reported": state["bug-reported"],
        replay: shouldSaveReplay ? generateReplay(gameData.state) : undefined,
        "has-replay": (state.options as any)?.["save-replay"] ?? false,
        "replay-shared": shouldShareReplay,
        log: state.log,
      },
    };

    // Remove undefined replay field
    if (!shouldSaveReplay) {
      delete (updateDoc.$set as any).replay;
    }

    await db.collection("game-logs").updateOne(
      { gameid: String(gameData.gameid) },
      updateDoc
    );

    if (shouldSaveReplay && !shouldShareReplay) {
      const corpUser = (state.corp as any)?.user || {};
      const runnerUser = (state.corp as any)?.runner || {};
      if (corpUser.username) {
        await deleteOldReplay(db, corpUser.username);
      }
      if (runnerUser.username) {
        await deleteOldReplay(db, runnerUser.username);
      }
    }
  } catch (e) {
    console.error("Caught exception saving game stats:", state.stats, e);
  }
}

/**
 * Strip opponent's deck name from a game log entry.
 * Mirrors: strip-opponent-deck-name
 */
export function stripOpponentDeckName(
  game: Record<string, unknown>,
  username: string
): Record<string, unknown> {
  const corpUsername = (game.corp as any)?.player?.username;
  if (username === corpUsername) {
    const runner = { ...(game.runner as Record<string, unknown>) };
    delete runner["deck-name"];
    return { ...game, runner };
  } else {
    const corp = { ...(game.corp as Record<string, unknown>) };
    delete corp["deck-name"];
    return { ...game, corp };
  }
}

// ---- Handlers ----

/**
 * Clear user stats.
 * Mirrors: clear-userstats-handler
 */
export async function clearUserstatsHandler(
  req: RequestLike
): Promise<{ status: number; body: Record<string, string> }> {
  const db = req.system?.db;
  const userId = (req.user as any)?._id;
  if (!db || !userId) {
    return response(403, { message: "Forbidden" });
  }

  const objId = toObjectId(userId);
  if (!objId) {
    return response(403, { message: "Forbidden" });
  }

  const result = await db
    .collection("users")
    .updateOne({ _id: objId }, { $unset: { stats: "" } });

  if (result.acknowledged) {
    return response(200, { message: "Deleted" });
  }
  return response(403, { message: "Forbidden" });
}
