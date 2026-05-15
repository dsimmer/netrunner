// Lobby module. Mirrors: src/clj/web/lobby.clj
// Manages game lobby creation, joining, leaving, messaging, deck selection,
// spectator watching, side swapping, and lobby broadcasting.

import bcrypt from "bcryptjs";
import { Db, ObjectId } from "mongodb";
import {
  getAppState,
  getLobby,
  getLobbies,
  Lobby,
  swapAppState,
  receiveLobbyUpdatesCheck,
  pauseLobbyUpdates,
  continueLobbyUpdates,
  tournamentState,
} from "./app_state";
import { connectedUids, chskSend, registerMsgHandler, WSMessage } from "./ws";
import { makeSystemMessage } from "../game/core/say";
import { serverCard } from "../game/utils";
import { selectNonNilKeys, sideFromStr, superuser, tournamentOrganizer } from "../jinteki/utils";
import { allMatchups } from "../jinteki/preconstructed";
import { calculateDeckStatus, legalDeck } from "../jinteki/validator";
import { gameFinished, updateDeckStats, updateGameStats, pushStatsUpdate } from "./stats";

// ---- Telemetry (mirrors telemetry-buckets) ----

const telemetryBuckets: Map<string, number[]> = new Map();

/**
 * Log a delay for telemetry purposes.
 * Mirrors: (log-delay! timestamp id)
 */
export function logDelay(timestamp: number, id: string): void {
  const now = Date.now();
  const diff = now - timestamp;
  const key = id || "unknown";
  const existing = telemetryBuckets.get(key) ?? [];
  telemetryBuckets.set(key, [...existing, diff]);
}

/**
 * Fetch and clear telemetry buckets.
 * Mirrors: (fetch-delay-log!)
 */
export function fetchDelayLog(): Map<string, number[]> {
  const result = new Map(telemetryBuckets);
  telemetryBuckets.clear();
  return result;
}

// ---- Thread pool helpers (mirrors game-pools, join-pool!, leave-pool!) ----
// In Node.js we don't need thread pools for simple async operations.
// These are stubs for compatibility with the Clojure macro pattern.

export interface PoolInfo {
  pool: string;
  occupants: Set<string>;
}

// Oracle guidance for active threads is ~cores+2
const poolSize = 2 + require("os").cpus().length;

const gamePools: PoolInfo[] = [];
for (let i = 0; i < poolSize; i++) {
  gamePools.push({ pool: `game-thread-${i}`, occupants: new Set() });
}

/**
 * Get pool occupants info (counts per pool).
 * Mirrors: (pool-occupants-info)
 */
export function poolOccupantsInfo(): Set<string>[] {
  return gamePools.map((p) => new Set(p.occupants));
}

/**
 * Returns one of the pools with the least occupants (random among tied).
 * Mirrors: (join-pool! gameid)
 */
export function joinPool(gameid: string): PoolInfo {
  // Shuffle game-pools then sort by occupant count
  const shuffled = [...gamePools].sort(() => Math.random() - 0.5);
  shuffled.sort((a, b) => a.occupants.size - b.occupants.size);
  const pool = shuffled[0];
  pool.occupants.add(gameid);
  return pool;
}

/**
 * Leave a pool. This just removes the gameid from occupants.
 * Mirrors: (leave-pool! pool gameid)
 */
export function leavePool(pool: PoolInfo, gameid: string): void {
  pool.occupants.delete(gameid);
}

// ---- Pool cleaning (mirrors clean-pools go loop) ----

const poolCleaningFrequency = 30 * 60 * 1000; // 30 minutes in ms
let poolCleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startPoolCleanup(): void {
  if (poolCleanupTimer) return;
  poolCleanupTimer = setInterval(() => {
    let cleaned = 0;
    const lobbyIds = new Set(getLobbies().map((l) => l.gameid).filter((id): id is string => !!id));
    for (const pool of gamePools) {
      const stale = [...pool.occupants].filter((oid) => !lobbyIds.has(oid));
      if (stale.length > 0) {
        cleaned += stale.length;
        for (const s of stale) {
          pool.occupants.delete(s);
        }
      }
    }
    if (cleaned > 0) {
      console.info(`cleaned up ${cleaned} stale pool occupants!`);
    } else {
      console.info("all pools are tidy!");
    }
  }, poolCleaningFrequency);
}

export function stopPoolCleanup(): void {
  if (poolCleanupTimer) {
    clearInterval(poolCleanupTimer);
    poolCleanupTimer = null;
  }
}

// ---- Lobby-thread / game-thread helpers ----
// In Node.js we use the event loop instead of thread pools.
// These are identity wrappers for compatibility with the Clojure macro pattern.

/**
 * Execute a function on the lobby thread pool.
 * Mirrors: (lobby-thread ...) -> (cp/future lobby-pool ...)
 * In TypeScript/Node.js this is synchronous since we use event loop.
 */
export function lobbyThread(fn: () => void): void {
  fn();
}

/**
 * Execute a function on a lobby's game thread pool.
 * Mirrors: (game-thread lobby ...) -> (cp/future (get-in lobby [:pool :pool] lobby-pool) ...)
 * In TypeScript/Node.js this is synchronous since we use event loop.
 */
export function gameThread(lobby: Lobby | undefined, fn: () => void): void {
  fn();
}

// ---- Tournament property assignment (mirrors defmulti assign-tournament-properties) ----

interface TournamentPropertyHandler {
  (lobby: Lobby): void;
}

const tournamentPropertyHandlers = new Map<string, TournamentPropertyHandler>();

/**
 * Register a handler for a lobby type's tournament property assignment.
 * Mirrors: (defmethod assign-tournament-properties :room-type ...)
 */
export function registerTournamentPropertyHandler(room: string, handler: TournamentPropertyHandler): void {
  tournamentPropertyHandlers.set(room, handler);
}

/**
 * Dispatch tournament property assignment based on lobby room type.
 * Mirrors: (assign-tournament-properties lobby)
 */
export function assignTournamentProperties(lobby: Lobby): void {
  const room = lobby.room ?? "default";
  const handler = tournamentPropertyHandlers.get(room) ?? tournamentPropertyHandlers.get("default");
  if (handler) {
    handler(lobby);
  }
}

// ---- Preconstructed validation ----

/**
 * Validate a preconstructed deck choice.
 * Mirrors: (validate-precon format client-precon client-gateway-type)
 */
export function validatePrecon(
  format: string | undefined,
  clientPrecon: string | undefined,
  clientGatewayType: string | undefined,
): string | null {
  const target = format === "system-gateway" ? clientGatewayType : clientPrecon;
  if (!target) return null;
  const precon = target.toLowerCase();

  if (format === "system-gateway" && (precon === "beginner" || precon === "intermediate")) {
    return precon;
  }
  if (format === "preconstructed" && allMatchups.has(precon as any)) {
    return precon;
  }
  return null;
}

// ---- Lobby creation ----

/**
 * Create a new lobby.
 * Mirrors: (create-new-lobby ...)
 */
export function createNewLobby(options: {
  uid: string;
  user: Record<string, unknown>;
  gameid?: string;
  now?: Date;
  allowSpectator?: boolean;
  apiAccess?: boolean;
  format?: string;
  muteSpectators?: boolean;
  password?: string;
  room?: string;
  saveReplay?: boolean;
  precon?: string;
  gatewayType?: string;
  side?: string;
  singleton?: boolean;
  spectatorhands?: boolean;
  timer?: unknown;
  title?: string;
  openDecklists?: boolean;
  description?: string;
}): Lobby {
  const {
    uid,
    user,
    gameid = crypto.randomUUID(),
    now = new Date(),
    allowSpectator,
    apiAccess,
    format,
    muteSpectators,
    password,
    room,
    saveReplay,
    precon,
    gatewayType,
    side,
    singleton,
    spectatorhands,
    timer,
    title,
    openDecklists,
    description,
  } = options;

  const player = { user, uid, side };

  const validatedPrecon = validatePrecon(format, precon, gatewayType);

  const singletonFormats = ["standard", "startup", "casual", "eternal"];
  const finalSingleton = singletonFormats.includes(format || "") ? singleton : undefined;

  return {
    gameid,
    date: now,
    "last-update": now,
    players: [player],
    spectators: [],
    "corp-spectators": [],
    "runner-spectators": [],
    messages: [],
    pool: joinPool(gameid),
    precon: validatedPrecon,
    "open-decklists": openDecklists ?? (validatedPrecon ? true : undefined),
    "allow-spectator": allowSpectator,
    "api-access": apiAccess,
    format,
    description,
    "mute-spectators": muteSpectators,
    password: password && password.length > 0 ? bcrypt.hashSync(password, 10) : undefined,
    room,
    "save-replay": saveReplay,
    spectatorhands,
    singleton: finalSingleton,
    timer,
    title,
  };
}

// ---- Player / spectator helpers ----

/**
 * Get all players and spectators from a lobby.
 * Mirrors: (get-players-and-spectators lobby)
 */
export function getPlayersAndSpectators(lobby: Lobby): Record<string, unknown>[] {
  return [...(lobby.players ?? []), ...(lobby.spectators ?? [])];
}

/**
 * Prepare lobby ting events for all users.
 * Mirrors: (lobby-ting lobby)
 */
function lobbyTing(lobby: Lobby): Array<[string, [string, string]]> {
  const result: Array<[string, [string, string]]> = [];
  for (const user of getPlayersAndSpectators(lobby)) {
    const uid = (user as any).uid as string;
    result.push([uid, ["lobby/notification", "ting"]]);
  }
  return result;
}

/**
 * Send lobby ting to all users in the lobby.
 * Mirrors: (send-lobby-ting lobby)
 */
export function sendLobbyTing(lobby: Lobby | undefined): void {
  if (!lobby) return;
  for (const [uid, ev] of lobbyTing(lobby)) {
    if (uid) {
      chskSend(uid, ev);
    }
  }
}

// ---- User filtering / public view ----

/**
 * Only take keys that are useful in the lobby from a user map.
 * Mirrors: (filter-lobby-user user)
 */
function filterLobbyUser(user: Record<string, unknown>): Record<string, unknown> {
  const stats = (user.stats as Record<string, unknown>) || {};
  return {
    _id: (user._id as any) ? String(user._id) : undefined,
    username: user.username,
    emailhash: user.emailhash,
    stats: {
      "games-started": stats["games-started"],
      "games-completed": stats["games-completed"],
    },
  };
}

/**
 * Strip deck info from a player based on lobby state.
 * Mirrors: (strip-deck player lobby)
 */
function stripDeck(
  player: Record<string, unknown>,
  lobby: Lobby,
): Record<string, unknown> {
  const deck = player.deck as Record<string, unknown> | undefined;
  if (!deck) return player;

  const fmt = lobby.format as string | undefined;
  const fmtKw = fmt ? `_${fmt}` : undefined;
  const deckStatus = (deck.status as Record<string, unknown>) || {};
  const legal = fmtKw ? (deckStatus[fmtKw] as any)?.legal : undefined;

  const statusObj: Record<string, unknown> = { format: fmt };
  if (fmtKw) {
    statusObj[fmtKw] = { legal };
  }

  const started = lobby.started;
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

  strippedDeck._id = String((deck._id as any) || "");
  strippedDeck.status = statusObj;

  return { ...player, deck: strippedDeck };
}

/**
 * Strip private server information from a player map.
 * Mirrors: (user-public-view lobby player)
 */
function userPublicView(
  lobby: Lobby,
  player: Record<string, unknown>,
): Record<string, unknown> {
  const { uid: _, ...rest } = player as any;
  return {
    ...rest,
    user: filterLobbyUser(player.user as Record<string, unknown>),
  };
}

/**
 * Prepare players list for public view.
 * Mirrors: (prepare-players lobby players)
 */
function preparePlayers(
  lobby: Lobby,
  players: Record<string, unknown>[] | undefined,
): Record<string, unknown>[] | undefined {
  if (!players || players.length === 0) return undefined;
  return players.map((p) => userPublicView(lobby, p));
}

/**
 * Prepare original players for public view.
 * Mirrors: (prepare-original-players players)
 */
function prepareOriginalPlayers(
  players: Record<string, unknown>[] | undefined,
): Record<string, unknown>[] | undefined {
  if (!players) return undefined;
  return players.map((p) => ({
    user: {
      username: (p.user as any)?.username,
      emailhash: (p.user as any)?.emailhash,
    },
  }));
}

// ---- Lobby keys and summary ----

const lobbyKeys = [
  "allow-spectator",
  "api-access",
  "date",
  "format",
  "gameid",
  "precon",
  "messages",
  "mute-spectators",
  "original-players",
  "open-decklists",
  "password",
  "players",
  "room",
  "save-replay",
  "singleton",
  "spectators",
  "corp-spectators",
  "runner-spectators",
  "spectatorhands",
  "started",
  "timer",
  "title",
  "old",
  "description",
  // for tournament system
  "time-extension",
  "excluded",
  "round-end-time",
] as const;

/**
 * Get round end time for competitive rooms.
 * Mirrors: (maybe-round-end-time lobby)
 */
function maybeRoundEndTime(lobby: Lobby): Date | undefined | null {
  if (lobby.room === "competitive") {
    const tState = tournamentState();
    return tState?.["round-end"] ?? null;
  }
  return undefined;
}

/**
 * Strip private server information from a game map, preparing to send to clients.
 * Mirrors: (lobby-summary lobby participating?)
 */
export function lobbySummary(lobby: Lobby, includeMessages = false): Record<string, unknown> {
  const messages = lobby.messages ?? [];
  const hasManyMessages = messages.length > 10;

  const processed = {
    ...lobby,
    old: hasManyMessages,
    password: !!lobby.password,
    players: preparePlayers(lobby, lobby.players),
    spectators: preparePlayers(lobby, lobby.spectators),
    "corp-spectators": preparePlayers(lobby, lobby["corp-spectators"]),
    "runner-spectators": preparePlayers(lobby, lobby["runner-spectators"]),
    "original-players": prepareOriginalPlayers(lobby["original-players"]),
    messages: includeMessages ? messages : undefined,
    "round-end-time": maybeRoundEndTime(lobby),
  };

  return selectNonNilKeys(processed, lobbyKeys as string[]);
}

// ---- Blocked list / lobby filtering ----

/**
 * Get the blocked users list for a user.
 * Mirrors: (get-blocked-list user)
 */
function getBlockedList(user: Record<string, unknown>): string[] {
  const blockedUsers = (user as any).options?.["blocked-users"] ?? [];
  return blockedUsers.map((u: any) => String(u).toLowerCase());
}

/**
 * Filter lobby list based on user's blocked list.
 * Mirrors: (filter-lobby-list lobbies user)
 */
export function filterLobbyList(lobbies: Lobby[], user: Record<string, unknown>): Lobby[] {
  const userBlockList = new Set(getBlockedList(user));

  return lobbies.filter((lobby) => {
    const playerUsernames = new Set(
      (lobby.players ?? [])
        .map((p) => ((p as any).user?.username as string | undefined))
        .filter((u): u is string => !!u)
        .map((u) => u.toLowerCase()),
    );

    // Check if user has blocked any player
    let userBlockedPlayers = false;
    if (userBlockList.size > 0) {
      for (const uname of playerUsernames) {
        if (userBlockList.has(uname)) {
          userBlockedPlayers = true;
          break;
        }
      }
    }

    // Check if any player has blocked the user
    const username = String((user as any).username ?? "").toLowerCase();
    let playersBlockedUser = false;
    for (const player of lobby.players ?? []) {
      const pUser = (player as any).user;
      if (pUser) {
        const pBlocked = getBlockedList(pUser);
        if (pBlocked.map((u: string) => u.toLowerCase()).includes(username)) {
          playersBlockedUser = true;
          break;
        }
      }
    }

    return !(userBlockedPlayers || playersBlockedUser);
  });
}

// ---- Lobby categorization / sorting ----

/**
 * Categorize a lobby into one of: open-recent, open-old, allowing-spectators, no-spectators.
 * Mirrors: (categorize-lobby lobby)
 */
function categorizeLobby(lobby: Lobby): string {
  if (!lobby.started) {
    return (lobby as any).old ? "open-old" : "open-recent";
  }
  return (lobby as any)["allow-spectator"] ? "allowing-spectators" : "no-spectators";
}

/**
 * Sort lobbies: opened games on top, other games below.
 * Open games sorted oldest to newest, other games newest to oldest.
 * Mirrors: (sorted-lobbies lobbies)
 */
function sortedLobbies(lobbies: Lobby[]): Lobby[] {
  const withSummaries = lobbies
    .map(lobbySummary)
    .sort((a, b) => {
      const dateA = (a.date as Date)?.getTime() ?? 0;
      const dateB = (b.date as Date)?.getTime() ?? 0;
      return dateA - dateB;
    });

  const groups: Record<string, Lobby[]> = {};
  for (const lobby of withSummaries as Lobby[]) {
    const cat = categorizeLobby(lobby);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(lobby);
  }

  const openRecent = groups["open-recent"] ?? [];
  const openOld = groups["open-old"] ?? [];
  const allowingSpectators = [...(groups["allowing-spectators"] ?? [])].reverse();
  const noSpectators = [...(groups["no-spectators"] ?? [])].reverse();

  return [...openRecent, ...openOld, ...allowingSpectators, ...noSpectators];
}

// ---- Lobby list preparation / broadcasting ----

/**
 * Prepare lobby list events for given users.
 * Mirrors: (prepare-lobby-list lobbies users)
 */
export function prepareLobbyList(
  lobbies: Lobby[],
  users: Record<string, unknown>[],
): Array<[string, [string, unknown[]]]> {
  const inOrderLobbies = sortedLobbies(lobbies);
  const result: Array<[string, [string, unknown[]]]> = [];
  for (const user of users) {
    const uid = (user as any).uid as string;
    const filteredLobbies = filterLobbyList(inOrderLobbies, user);
    result.push([uid, ["lobby/list", filteredLobbies]]);
  }
  return result;
}

/**
 * Get list of uids that receive lobby updates.
 * Mirrors: (lobby-update-uids)
 */
function lobbyUpdateUids(): string[] {
  return connectedUids().filter((uid) => receiveLobbyUpdatesCheck(uid));
}

/**
 * Send the lobby list to all users or a given list of users.
 * Filters the list per each user's block list.
 * Mirrors: (broadcast-lobby-list) / (broadcast-lobby-list users)
 */
export function broadcastLobbyList(users?: Record<string, unknown>[]): void {
  if (users) {
    if (!Array.isArray(users) && users !== null) {
      throw new Error(`Users must be a sequence: ${JSON.stringify(users)}`);
    }
    const lobbies = getLobbies();
    for (const [uid, ev] of prepareLobbyList(lobbies, users)) {
      if (uid) {
        chskSend(uid, ev);
      }
    }
  } else {
    const userCache = getAppState().users;
    const uids = lobbyUpdateUids();
    const usersList = uids.map((uid) => userCache[uid]).filter(Boolean);
    broadcastLobbyList(usersList);
  }
}

// ---- Lobby state sending ----

/**
 * Prepare lobby state events for all users in the lobby.
 * Mirrors: (prepare-lobby-state lobby)
 */
function prepareLobbyState(lobby: Lobby): Array<[string, [string, Record<string, unknown>]]> {
  const lobbyState = lobbySummary(lobby, true);
  const events: Array<[string, [string, Record<string, unknown>]]> = [];
  for (const user of getPlayersAndSpectators(lobby)) {
    const uid = (user as any).uid as string;
    if (uid) {
      events.push([uid, ["lobby/state", lobbyState]]);
    }
  }
  return events;
}

/**
 * Send lobby state to all players and spectators in the lobby.
 * Mirrors: (send-lobby-state lobby)
 */
export function sendLobbyState(lobby: Lobby | undefined): void {
  if (!lobby) return;
  for (const [uid, ev] of prepareLobbyState(lobby)) {
    if (uid) {
      chskSend(uid, ev);
    }
  }
}

// ---- Lobby registration / messaging ----

/**
 * Register a lobby into the lobbies map.
 * Mirrors: (register-lobby lobbies lobby uid)
 */
export function registerLobby(
  lobbies: Record<string, Lobby>,
  lobby: Lobby,
  uid: string,
): Record<string, Lobby> {
  const gameid = lobby.gameid as string;
  // Only register if uid is not already a player in another lobby
  for (const existing of Object.values(lobbies)) {
    if ((existing.players ?? []).some((p: any) => p.uid === uid)) {
      return lobbies;
    }
  }
  return { ...lobbies, [gameid]: lobby };
}
