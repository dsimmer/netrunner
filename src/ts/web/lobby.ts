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

interface PoolInfo {
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
function filterLobbyList(lobbies: Lobby[], user: Record<string, unknown>): Lobby[] {
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
function prepareLobbyList(
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

/**
 * Add a message to a lobby's messages.
 * Mirrors: (send-message lobby message)
 */
export function sendMessage(lobby: Lobby, message: Record<string, unknown>): Lobby {
  const messages = lobby.messages ?? [];
  return { ...lobby, messages: [...messages, message] };
}

// ---- Try create lobby ----

/**
 * Create and register a new lobby.
 * Mirrors: (try-create-lobby uid user ?data)
 */
export function tryCreateLobby(
  uid: string,
  user: Record<string, unknown>,
  data: Record<string, unknown> | undefined,
): void {
  const lobbyData = data || {};
  const lobby = createNewLobby({
    uid,
    user,
    gameid: lobbyData.gameid as string | undefined,
    now: lobbyData.now as Date | undefined,
    allowSpectator: lobbyData["allow-spectator"] as boolean | undefined,
    apiAccess: lobbyData["api-access"] as boolean | undefined,
    format: lobbyData.format as string | undefined,
    muteSpectators: lobbyData["mute-spectators"] as boolean | undefined,
    password: lobbyData.password as string | undefined,
    room: lobbyData.room as string | undefined,
    saveReplay: lobbyData["save-replay"] as boolean | undefined,
    precon: lobbyData.precon as string | undefined,
    gatewayType: lobbyData["gateway-type"] as string | undefined,
    side: lobbyData.side as string | undefined,
    singleton: lobbyData.singleton as boolean | undefined,
    spectatorhands: lobbyData.spectatorhands as boolean | undefined,
    timer: lobbyData.timer,
    title: lobbyData.title as string | undefined,
    openDecklists: lobbyData["open-decklists"] as boolean | undefined,
    description: lobbyData.description as string | undefined,
  });

  const systemMsg = makeSystemMessage(`${user.username} has created the game.`);
  const lobbyWithMsg = sendMessage(lobby, systemMsg);

  const newAppState = swapAppState((state) => ({
    ...state,
    lobbies: registerLobby(state.lobbies, lobbyWithMsg, uid),
  }));

  const lobbyExists = newAppState.lobbies[lobby.gameid as string];
  if (lobbyExists) {
    assignTournamentProperties(lobbyExists);
    sendLobbyState(lobbyExists);
    broadcastLobbyList();
  }
}

// ---- WS handler: :lobby/create ----

registerMsgHandler("lobby/create", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const user = (msg as any).ringReq?.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/create";

  lobbyThread(() => {
    const appState = getAppState();
    if (appState["block-game-creation"]) {
      chskSend(uid, [
        "lobby/toast",
        { message: "lobby_creation-paused", type: "error" },
      ]);
    } else {
      tryCreateLobby(uid, user, data);
    }
  });
  logDelay(timestamp, id);
});

// ---- Clear lobby state / send lobby list to single user ----

/**
 * Clear lobby state for a uid.
 * Mirrors: (clear-lobby-state uid)
 */
export function clearLobbyState(uid: string | undefined): void {
  if (!uid) return;
  chskSend(uid, ["lobby/state"]);
}

/**
 * Send lobby list and state to a single user.
 * Mirrors: (send-lobby-list uid)
 */
export function sendLobbyList(uid: string): void {
  const user = getAppState().users[uid];
  if (!user) return;

  const lobbies = getLobbies();
  const [[_uid, ev]] = prepareLobbyList(lobbies, [user]);
  chskSend(uid, ev);

  const lobby = uidToLobby(uid);
  if (lobby) {
    sendLobbyState(lobby);
  } else {
    clearLobbyState(uid);
  }
}

// ---- WS handler: :lobby/list ----

registerMsgHandler("lobby/list", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/list";

  lobbyThread(() => {
    sendLobbyList(uid);
    const appState = getAppState();
    chskSend(uid, ["lobby/block-game-creation", appState["block-game-creation"]]);
  });
  logDelay(timestamp, id);
});

// ---- WS handler: :lobby/block-game-creation ----

registerMsgHandler("lobby/block-game-creation", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/block-game-creation";

  lobbyThread(() => {
    const appState = getAppState();
    chskSend(uid, ["lobby/block-game-creation", appState["block-game-creation"]]);
  });
  logDelay(timestamp, id);
});

// ---- Player / spectator lookup helpers ----

/**
 * Check if uid is a player in a given lobby. Returns player if found.
 * Mirrors: (player? uid lobby)
 */
export function playerInLobby(
  uid: string,
  lobby: Lobby,
): Record<string, unknown> | undefined {
  return (lobby.players ?? []).find((p: any) => p.uid === uid);
}

/**
 * Check if uid is the first player in a lobby.
 * Mirrors: (first-player? uid lobby)
 */
export function firstPlayerInLobby(
  uid: string,
  lobby: Lobby,
): Record<string, unknown> | undefined {
  const first = (lobby.players ?? [])[0];
  if (first && (first as any).uid === uid) {
    return first;
  }
  return undefined;
}

/**
 * Check if uid is a spectator in the given lobby.
 * Mirrors: (spectator? uid lobby)
 */
function spectatorInLobby(
  uid: string,
  lobby: Lobby,
): Record<string, unknown> | undefined {
  return (lobby.spectators ?? []).find((p: any) => p.uid === uid);
}

/**
 * Check if uid is a player or spectator in the given lobby.
 * Mirrors: (in-lobby? uid lobby)
 */
export function inLobby(uid: string, lobby: Lobby): boolean {
  return !!playerInLobby(uid, lobby) || !!spectatorInLobby(uid, lobby);
}

// ---- Lobby lookup helpers ----

/**
 * Find the lobby containing uid as a player or spectator.
 * Mirrors: (uid->lobby uid)
 */
export function uidToLobby(uid: string): Lobby | undefined {
  const lobbies = getAppState().lobbies;
  for (const lobby of Object.values(lobbies)) {
    const allUsers = [...(lobby.players ?? []), ...(lobby.spectators ?? [])];
    if (allUsers.some((user: any) => user.uid === uid)) {
      return lobby;
    }
  }
  return undefined;
}

/**
 * Find the lobby containing uid as a player.
 * Mirrors: (uid-player->lobby uid)
 */
export function uidPlayerToLobby(uid: string): Lobby | undefined {
  const lobbies = getAppState().lobbies;
  for (const lobby of Object.values(lobbies)) {
    if ((lobby.players ?? []).some((user: any) => user.uid === uid)) {
      return lobby;
    }
  }
  return undefined;
}

/**
 * Check if uid is in a lobby as a player.
 * Mirrors: (uid-in-lobby-as-player? uid)
 */
export function uidInLobbyAsPlayer(uid: string): Lobby | undefined {
  return uidPlayerToLobby(uid);
}

// ---- Handle set-last-update ----

/**
 * Update the last-update timestamp on a lobby if uid is in it.
 * Mirrors: (handle-set-last-update lobbies gameid uid)
 */
export function handleSetLastUpdate(
  lobbies: Record<string, Lobby>,
  gameid: string,
  uid: string,
): Record<string, Lobby> {
  const lobby = lobbies[gameid];
  if (!lobby || !inLobby(uid, lobby)) return lobbies;
  return {
    ...lobbies,
    [gameid]: { ...lobby, "last-update": new Date() },
  };
}

// ---- Handle leave lobby ----

/**
 * Handle user leaving a lobby. Removes from players/spectators or closes lobby.
 * Mirrors: (handle-leave-lobby lobbies uid leave-message)
 */
function handleLeaveLobby(
  lobbies: Record<string, Lobby>,
  uid: string,
  leaveMessage: Record<string, unknown>,
): Record<string, Lobby> {
  const appState = getAppState();
  const lobby = (appState.lobbies as any)[uid]?.__lobby ?? undefined;
  if (!lobby) {
    // Try to find the lobby the uid belongs to
    const foundLobby = uidToLobby(uid);
    if (!foundLobby) return lobbies;

    const gameid = foundLobby.gameid as string;
    const players = (foundLobby.players ?? []).filter((p: any) => p.uid !== uid);
    const spectators = (foundLobby.spectators ?? []).filter((p: any) => p.uid !== uid);
    const corpSpectators = (foundLobby["corp-spectators"] ?? []).filter((p: any) => p.uid !== uid);
    const runnerSpectators = (foundLobby["runner-spectators"] ?? []).filter((p: any) => p.uid !== uid);

    if (players.length > 0) {
      return {
        ...lobbies,
        [gameid]: {
          ...foundLobby,
          messages: [...(foundLobby.messages ?? []), leaveMessage],
          players,
          spectators,
          "runner-spectators": runnerSpectators,
          "corp-spectators": corpSpectators,
        },
      };
    }
    const newLobbies = { ...lobbies };
    delete newLobbies[gameid];
    return newLobbies;
  }

  const gameid = lobby.gameid as string;
  const players = (lobby.players ?? []).filter((p: any) => p.uid !== uid);
  const spectators = (lobby.spectators ?? []).filter((p: any) => p.uid !== uid);
  const corpSpectators = (lobby["corp-spectators"] ?? []).filter((p: any) => p.uid !== uid);
  const runnerSpectators = (lobby["runner-spectators"] ?? []).filter((p: any) => p.uid !== uid);

  if (players.length > 0) {
    return {
      ...lobbies,
      [gameid]: {
        ...lobby,
        messages: [...(lobby.messages ?? []), leaveMessage],
        players,
        spectators,
        "runner-spectators": runnerSpectators,
        "corp-spectators": corpSpectators,
      },
    };
  }
  const newLobbies = { ...lobbies };
  delete newLobbies[gameid];
  return newLobbies;
}

// ---- Close lobby ----

/**
 * Close a game lobby, booting all players and updating stats.
 * Mirrors: (close-lobby! db lobby skip-on-close)
 */
export async function closeLobby(
  db: Db,
  lobby: Lobby,
  skipOnClose = false,
): Promise<void> {
  if (lobby.started) {
    await gameFinished(db, lobby as any);
    await updateDeckStats(db, lobby as any);
    await updateGameStats(db, lobby as any);
    await pushStatsUpdate(db, lobby as any);
  }

  const gameid = lobby.gameid as string;
  swapAppState((state) => {
    const newLobbies = { ...state.lobbies };
    delete newLobbies[gameid];
    return { ...state, lobbies: newLobbies };
  });

  for (const user of getPlayersAndSpectators(lobby)) {
    const uid = (user as any).uid as string | undefined;
    if (uid) clearLobbyState(uid);
  }

  const pool = lobby.pool as PoolInfo | undefined;
  if (pool) {
    leavePool(pool, gameid);
  }

  const onClose = (lobby as any)["on-close"];
  if (!skipOnClose && onClose) {
    onClose(lobby);
  }
}

// ---- Leave lobby ----

/**
 * Handle user leaving a lobby.
 * Mirrors: (leave-lobby! db user uid ?reply-fn lobby)
 */
export function leaveLobby(
  db: Db,
  user: Record<string, unknown>,
  uid: string,
  replyFn: ((val: boolean) => void) | undefined,
  lobby: Lobby,
): Lobby | undefined {
  const leaveMessage = makeSystemMessage(`${user.username} left the game.`);

  const newAppState = swapAppState((state) => ({
    ...state,
    lobbies: handleLeaveLobby(state.lobbies, uid, leaveMessage),
  }));

  const gameid = lobby.gameid as string;
  const lobbyExists = newAppState.lobbies[gameid];

  if (lobbyExists) {
    const state = (lobbyExists as any).state;
    if (state) {
      const player = playerInLobby(uid, lobby);
      if (player) {
        const side = sideFromStr(String((player as any).side ?? ""));
        // Dissoc :user from state[side]
        const newState = { ...state };
        const sideData = { ...newState[side] };
        delete sideData.user;
        newState[side] = sideData;
      }
    }
  } else {
    // Close lobby if no more players
    closeLobby(db, lobby);
  }

  sendLobbyState(lobbyExists);
  broadcastLobbyList();
  if (replyFn) replyFn(true);

  return lobbyExists;
}

// ---- WS handler: :lobby/leave ----

registerMsgHandler("lobby/leave", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const db = ringReq.system?.db as Db | undefined;
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const replyFn = (msg as any).replyFn;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/leave";

  lobbyThread(() => {
    const lobby = getLobby(gameid as string);
    if (lobby && inLobby(uid, lobby)) {
      leaveLobby(db!, user, uid, replyFn, lobby);
    }
  });
  logDelay(timestamp, id);
});

// ---- Deck handling ----

/**
 * Find a deck in the database.
 * Mirrors: (find-deck db opts)
 */
export async function findDeck(
  db: Db,
  opts: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  if (!opts._id) {
    throw new Error(":_id is required");
  }
  return db.collection("decks").findOne(opts as any);
}

/**
 * Find a deck for a specific user.
 * Mirrors: (find-deck-for-user db deck-id user)
 */
export async function findDeckForUser(
  db: Db,
  deckId: string,
  user: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const username = user.username as string;
  const objId = new ObjectId(deckId);
  return db.collection("decks").findOne({ _id: objId, username });
}

/**
 * Process a raw deck, resolving card data and calculating status.
 * Mirrors: (process-deck raw-deck)
 */
export function processDeck(rawDeck: Record<string, unknown>): Record<string, unknown> {
  const identityTitle = ((rawDeck as any).identity as any)?.title;
  const identityCard = serverCard(identityTitle, false) ?? null;

  const cards = (rawDeck.cards as any[] | undefined) ?? [];
  const processedCards = cards
    .map((line) => {
      const cardTitle = (line as any).card;
      const card = serverCard(cardTitle, false);
      if (card) {
        return { ...line, card };
      }
      return null;
    })
    .filter(Boolean);

  const deck = {
    ...rawDeck,
    identity: identityCard,
    cards: processedCards,
  };

  const status = calculateDeckStatus(deck as any);

  return {
    ...deck,
    status,
    parsed: undefined,
  };
}

/**
 * Check if a deck is valid for a lobby's format.
 * Mirrors: (valid-deck-for-lobby? lobby deck)
 */
function validDeckForLobby(lobby: Lobby, deck: Record<string, unknown>): boolean {
  if (!(deck as any).identity) return false;
  const format = lobby.format as string | undefined;
  if (format === "casual") return true;
  return legalDeck(deck as any, format);
}

/**
 * Update deck for a player in the players list.
 * Mirrors: (update-deck-for-player-in-lobby players uid deck)
 */
function updateDeckForPlayerInLobby(
  players: Record<string, unknown>[],
  uid: string,
  deck: Record<string, unknown>,
): Record<string, unknown>[] {
  return players.map((p) => {
    if ((p as any).uid === uid) {
      return { ...p, deck };
    }
    return p;
  });
}

/**
 * Handle deck selection in a lobby.
 * Mirrors: (handle-select-deck lobbies uid deck)
 */
function handleSelectDeck(
  lobbies: Record<string, Lobby>,
  uid: string,
  deck: Record<string, unknown>,
): Record<string, Lobby> {
  const lobbiesState = getAppState().lobbies;
  const lobby = Object.values(lobbiesState).find((l) =>
    (l.players ?? []).some((p: any) => p.uid === uid),
  );
  if (!lobby) return lobbies;

  const gameid = lobby.gameid as string;
  if (validDeckForLobby(lobby, deck)) {
    const players = (lobbies[gameid]?.players ?? lobby.players ?? []);
    return {
      ...lobbies,
      [gameid]: {
        ...lobbies[gameid],
        players: updateDeckForPlayerInLobby(players, uid, deck),
      },
    };
  }
  return lobbies;
}

// ---- WS handler: :lobby/deck ----

registerMsgHandler("lobby/deck", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const db = ringReq.system?.db as Db | undefined;
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const deckId = data?.deckId ?? data?.["deck-id"];
  const replyFn = (msg as any).replyFn;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/deck";

  lobbyThread(async () => {
    const lobby = getLobby(gameid as string);
    if (lobby && inLobby(uid, lobby)) {
      const rawDeck = await findDeckForUser(db!, String(deckId), user);
      const processedDeck = processDeck(rawDeck!);
      const newAppState = swapAppState((state) => ({
        ...state,
        lobbies: handleSelectDeck(state.lobbies, uid, processedDeck),
      }));
      const lobbyExists = newAppState.lobbies[gameid as string];
      sendLobbyState(lobbyExists);
      if (replyFn) {
        const hasDeck = (lobbyExists?.players ?? []).some(
          (p: any) => p.deck === processedDeck,
        );
        replyFn(hasDeck);
      }
    } else {
      if (replyFn) replyFn(false);
    }
  });
  logDelay(timestamp, id);
});

// ---- Handle send message ----

/**
 * Handle sending a message in a lobby. Returns updated lobbies map.
 * Mirrors: (handle-send-message lobbies gameid message)
 */
export function handleSendMessage(
  lobbies: Record<string, Lobby>,
  gameid: string,
  message: Record<string, unknown>,
): Record<string, Lobby> {
  const lobby = lobbies[gameid];
  if (!lobby) return lobbies;
  const updatedLobby = sendMessage(lobby, message);
  return { ...lobbies, [gameid]: updatedLobby };
}

// ---- WS handler: :lobby/say ----

registerMsgHandler("lobby/say", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const text = data?.text as string | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/say";

  if (typeof text !== "string") {
    console.error("Message must be a string");
    return;
  }

  lobbyThread(() => {
    const lobby = getLobby(gameid as string);
    if (lobby && inLobby(uid, lobby)) {
      const messageObj = makeSystemMessage(text);
      messageObj.user = {
        username: (user as any).username,
        emailhash: (user as any).emailhash,
      };
      const newAppState = swapAppState((state) => ({
        ...state,
        lobbies: handleSetLastUpdate(
          handleSendMessage(state.lobbies, gameid as string, messageObj),
          gameid as string,
          uid,
        ),
      }));
      const lobbyExists = newAppState.lobbies[gameid as string];
      sendLobbyState(lobbyExists);
    }
  });
  logDelay(timestamp, id);
});

// ---- Password checking ----

/**
 * Check if password is correct for a lobby.
 * Mirrors: (check-password lobby user password)
 */
function checkPassword(lobby: Lobby, user: Record<string, unknown>, password: string | undefined): boolean {
  if (!lobby.password) return true; // No password set
  if (superuser(user)) return true;
  return bcrypt.compareSync(password || "", lobby.password as string);
}

/**
 * Check if user is allowed in a lobby (not blocked).
 * Mirrors: (allowed-in-lobby user lobby)
 */
function allowedInLobby(user: Record<string, unknown>, lobby: Lobby): boolean {
  if (superuser(user)) return true;
  return filterLobbyList([lobby], user).length > 0;
}

/**
 * Check if a user with the given username is already in the game.
 * Mirrors: (already-in-game? user lobby)
 */
function alreadyInGame(user: Record<string, unknown>, lobby: Lobby): boolean {
  const username = user.username as string;
  return getPlayersAndSpectators(lobby).some((p) => {
    return (p as any).user?.username === username;
  });
}

// ---- Player side determination ----

/**
 * Determine the side of a player based on their side and a requested side.
 * Mirrors: (determine-player-side player request-side)
 */
function determinePlayerSide(player: Record<string, unknown>, requestSide: string | undefined): string {
  const side = (player as any).side;
  if (side && side !== "Any Side") {
    return side;
  }
  switch (requestSide) {
    case "Corp":
      return "Runner";
    case "Runner":
      return "Corp";
    default:
      return Math.random() < 0.5 ? "Corp" : "Runner";
  }
}

/**
 * Insert a user as a player in a lobby.
 * Mirrors: (insert-user-as-player lobby uid user request-side)
 */
function insertUserAsPlayer(
  lobby: Lobby,
  uid: string,
  user: Record<string, unknown>,
  requestSide: string | undefined,
): Lobby {
  const playerCount = (lobby.players ?? []).length;
  if (playerCount !== 1 || alreadyInGame(user, lobby)) {
    return lobby;
  }

  const existingPlayer = (lobby.players ?? [])[0];
  const existingPlayerSide = determinePlayerSide(existingPlayer, requestSide);
  const userSide = existingPlayerSide === "Corp" ? "Runner" : "Corp";

  return {
    ...lobby,
    players: [
      { ...existingPlayer, side: existingPlayerSide },
      { uid, user, side: userSide },
    ],
  };
}

// ---- Handle join lobby ----

/**
 * Handle user joining a lobby as a player.
 * Mirrors: (handle-join-lobby lobbies ?data uid user correct-password? join-message)
 */
function handleJoinLobby(
  lobbies: Record<string, Lobby>,
  data: Record<string, unknown>,
  uid: string,
  user: Record<string, unknown>,
  correctPassword: boolean,
  joinMessage: Record<string, unknown>,
): Record<string, Lobby> {
  const gameid = data.gameid as string;
  const requestSide = data["request-side"] as string | undefined;
  const lobby = lobbies[gameid];

  if (!user || !lobby || !allowedInLobby(user, lobby) || !correctPassword) {
    return lobbies;
  }

  const updatedLobby = insertUserAsPlayer(lobby, uid, user, requestSide);
  const withMessage = sendMessage(updatedLobby, joinMessage);
  return { ...lobbies, [gameid]: withMessage };
}

/**
 * Join a lobby as a player.
 * Mirrors: (join-lobby! user uid ?data ?reply-fn lobby)
 */
export function joinLobby(
  user: Record<string, unknown>,
  uid: string,
  data: Record<string, unknown>,
  replyFn: ((code: number) => void) | undefined,
  lobby: Lobby,
): Lobby | null | undefined {
  const correctPassword = checkPassword(lobby, user, data.password as string | undefined);
  const joinMessage = makeSystemMessage(`${user.username} joined the game.`);

  const newAppState = swapAppState((state) => ({
    ...state,
    lobbies: handleJoinLobby(state.lobbies, data, uid, user, correctPassword, joinMessage),
  }));

  const gameid = data.gameid as string;
  const lobbyExists = newAppState.lobbies[gameid];

  if (lobbyExists && correctPassword) {
    const player = playerInLobby(uid, lobbyExists);
    if (player) {
      const side = sideFromStr(String((player as any).side ?? ""));
      const state = (lobbyExists as any).state;
      if (state) {
        const newState = { ...state };
        const sideData = { ...newState[side] };
        sideData.user = user;
        newState[side] = sideData;
      }
    }
    sendLobbyState(lobbyExists);
    sendLobbyTing(lobbyExists);
    broadcastLobbyList();
    if (replyFn) replyFn(200);
    return lobbyExists;
  }

  if (!correctPassword) {
    if (replyFn) replyFn(403);
    return null;
  }

  if (replyFn) replyFn(404);
  return null;
}

// ---- WS handler: :lobby/join ----

registerMsgHandler("lobby/join", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const replyFn = (msg as any).replyFn;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/join";

  lobbyThread(() => {
    const lobby = getLobby(gameid as string);
    if (lobby) {
      joinLobby(user, uid, data || {}, replyFn, lobby);
    }
  });
  logDelay(timestamp, id);
});

// ---- Side swapping ----

/**
 * Return a new player map with the player's side switched.
 * Mirrors: (swap-side player)
 */
function swapSide(player: Record<string, unknown>): Record<string, unknown> {
  const side = (player as any).side;
  return {
    ...player,
    side: side === "Corp" ? "Runner" : "Corp",
    deck: undefined,
  };
}

/**
 * Return a new player map with the player's side set to a new side.
 * Mirrors: (change-side player side)
 */
function changeSide(player: Record<string, unknown>, side: string): Record<string, unknown> {
  return {
    ...player,
    side,
    deck: undefined,
  };
}

/**
 * Update sides for players in a lobby.
 * Mirrors: (update-sides lobby uid side)
 */
function updateSides(lobby: Lobby, uid: string, side: string | undefined): Lobby {
  const firstPlayer = (lobby.players ?? [])[0];
  if (!firstPlayer || (firstPlayer as any).uid !== uid) {
    return lobby;
  }

  if (side) {
    return {
      ...lobby,
      players: (lobby.players ?? []).map((p) => changeSide(p, side)),
    };
  } else {
    return {
      ...lobby,
      players: (lobby.players ?? []).map((p) => swapSide(p)),
    };
  }
}

/**
 * Handle swapping sides in a lobby.
 * Mirrors: (handle-swap-sides lobbies gameid uid side swap-message)
 */
function handleSwapSides(
  lobbies: Record<string, Lobby>,
  gameid: string,
  uid: string,
  side: string | undefined,
  swapMessage: Record<string, unknown>,
): Record<string, Lobby> {
  const lobby = lobbies[gameid];
  if (!lobby) return lobbies;

  const updatedLobby = updateSides(lobby, uid, side);
  const withMessage = sendMessage(updatedLobby, swapMessage);
  return { ...lobbies, [gameid]: withMessage };
}

/**
 * Generate swap side message text.
 * Mirrors: (swap-text players player1-side)
 */
function swapText(players: Record<string, unknown>[], player1Side: string | undefined): string {
  const swappedPlayers = players.length > 1
    ? players.map((p) => swapSide(p))
    : [changeSide(players[0], player1Side || "Corp")];

  const player1Username = ((swappedPlayers[0] as any).user as any)?.username || "";
  const player2Username = swappedPlayers.length > 1
    ? ((swappedPlayers[1] as any).user as any)?.username : null;

  let msg = `${player1Username} has swapped sides. `;
  if (player1Side === "Any Side") {
    msg += "Waiting for opponent.";
  } else {
    msg += `${player1Username} is now ${(swappedPlayers[0] as any).side}. `;
  }
  if (player2Username) {
    msg += `${player2Username} is now ${(swappedPlayers[1] as any).side}.`;
  }
  return msg;
}

// ---- WS handler: :lobby/swap ----

registerMsgHandler("lobby/swap", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const side = data?.side as string | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/swap";

  lobbyThread(() => {
    const lobby = getLobby(gameid as string);
    if (lobby && firstPlayerInLobby(uid, lobby)) {
      const swapMessage = {
        user: { username: (user as any).username, emailhash: (user as any).emailhash },
        text: swapText(lobby.players ?? [], side),
      };
      const newAppState = swapAppState((state) => ({
        ...state,
        lobbies: handleSetLastUpdate(
          handleSwapSides(state.lobbies, gameid as string, uid, side, swapMessage),
          gameid as string,
          uid,
        ),
      }));
      const lobbyExists = newAppState.lobbies[gameid as string];
      sendLobbyState(lobbyExists);
      broadcastLobbyList();
    }
  });
  logDelay(timestamp, id);
});

// ---- WS handler: :lobby/shift-game ----

registerMsgHandler("lobby/shift-game", (msg: WSMessage) => {
  const ringReq = (msg as any).ringReq ?? {};
  const db = ringReq.system?.db as Db | undefined;
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const room = data?.room as string | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/shift-game";

  lobbyThread(() => {
    const lobby = getLobby(gameid as string);
    if (lobby && (superuser(user) || tournamentOrganizer(user))) {
      const playerName = (((lobby as any)["original-players"] ?? [])[0]?.user as any)?.username;
      const gameName = lobby.title;

      swapAppState((state) => ({
        ...state,
        lobbies: {
          ...state.lobbies,
          [gameid as string]: { ...lobby, room },
        },
      }));

      const updatedLobby = getAppState().lobbies[gameid as string];
      sendLobbyState(updatedLobby);
      broadcastLobbyList();
      broadcastLobbyList([{ uid: id, username: (user as any).username } as any]);

      if (db) {
        db.collection("moderator_actions").insertOne({
          moderator: (user as any).username,
          action: "shift-game",
          "game-name": gameName,
          "first-player": playerName,
          "target-room": room,
          date: new Date(),
        });
      }
    }
  });
  logDelay(timestamp, id);
});

// ---- WS handler: :lobby/rename-game ----

registerMsgHandler("lobby/rename-game", (msg: WSMessage) => {
  const ringReq = (msg as any).ringReq ?? {};
  const db = ringReq.system?.db as Db | undefined;
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/rename-game";

  lobbyThread(() => {
    const lobby = getLobby(gameid as string);
    if (lobby && superuser(user)) {
      const playerName = (((lobby as any)["original-players"] ?? [])[0]?.user as any)?.username;
      const badName = lobby.title;

      swapAppState((state) => ({
        ...state,
        lobbies: {
          ...state.lobbies,
          [gameid as string]: { ...lobby, title: `${playerName}'s game` },
        },
      }));

      const updatedLobby = getAppState().lobbies[gameid as string];
      sendLobbyState(updatedLobby);
      broadcastLobbyList();
      broadcastLobbyList([{ uid: id, username: (user as any).username } as any]);

      if (db) {
        db.collection("moderator_actions").insertOne({
          moderator: (user as any).username,
          action: "rename-game",
          "game-name": badName,
          "first-player": playerName,
          date: new Date(),
        });
      }
    }
  });
  logDelay(timestamp, id);
});

// ---- WS handler: :lobby/delete-game ----

registerMsgHandler("lobby/delete-game", (msg: WSMessage) => {
  const ringReq = (msg as any).ringReq ?? {};
  const db = ringReq.system?.db as Db | undefined;
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/delete-game";

  lobbyThread(async () => {
    const lobby = getLobby(gameid as string);
    if (lobby && superuser(user)) {
      const playerName = (((lobby as any)["original-players"] ?? [])[0]?.user as any)?.username;
      const badName = lobby.title;

      await closeLobby(db!, lobby);
      broadcastLobbyList();
      broadcastLobbyList([{ uid: id, username: (user as any).username } as any]);

      if (db) {
        await db.collection("moderator_actions").insertOne({
          moderator: (user as any).username,
          action: "delete-game",
          "game-name": badName,
          "first-player": playerName,
          date: new Date(),
        });
      }
    }
  });
  logDelay(timestamp, id);
});

// ---- Clear inactive lobbies ----

/**
 * Called by a background thread to close lobbies inactive for some time.
 * Mirrors: (clear-inactive-lobbies db time-inactive)
 */
export async function clearInactiveLobbies(
  db: Db,
  timeInactive: number,
): Promise<void> {
  let changed = false;
  const lobbies = getLobbies();

  for (const lobby of lobbies) {
    const gameid = lobby.gameid as string | undefined;
    const lastUpdate = lobby["last-update"] as Date | undefined;
    const started = lobby.started;
    if (!gameid || !lastUpdate) continue;

    const now = new Date();
    const warningThreshold = new Date(lastUpdate.getTime() + (timeInactive - 30) * 1000);
    const timeoutThreshold = new Date(lastUpdate.getTime() + timeInactive * 1000);

    // Send timeout-soon warning (within 1 second window)
    if (now > warningThreshold && now <= new Date(lastUpdate.getTime() + (timeInactive - 29) * 1000)) {
      for (const user of getPlayersAndSpectators(lobby)) {
        const uid = (user as any).uid as string | undefined;
        if (uid) chskSend(uid, ["game/timeout-soon", gameid]);
      }
    }

    // Actually timeout
    if (now > timeoutThreshold) {
      changed = true;
      const uids = getPlayersAndSpectators(lobby).map((u) => (u as any).uid).filter(Boolean);

      if (started) {
        await gameFinished(db, lobby as any);
      }

      for (const uid of uids) {
        if (started) {
          chskSend(uid as string, ["game/timeout", gameid]);
        }
      }

      await closeLobby(db, lobby);

      for (const uid of uids) {
        sendLobbyList(uid as string);
      }
    }
  }

  if (changed) {
    broadcastLobbyList();
  }
}

// ---- Watch / spectator ----

/**
 * Add a user as a spectator to a lobby.
 * Mirrors: (watch-lobby lobby uid user request-side)
 */
function watchLobby(
  lobby: Lobby,
  uid: string,
  user: Record<string, unknown>,
  requestSide: string | undefined,
): Lobby {
  if (alreadyInGame(user, lobby)) return lobby;

  let updated = {
    ...lobby,
    spectators: [...(lobby.spectators ?? []), { uid, user }],
  };

  if (requestSide === "Corp") {
    updated = {
      ...updated,
      "corp-spectators": [...(updated["corp-spectators"] ?? []), { uid, user }],
    };
  } else if (requestSide === "Runner") {
    updated = {
      ...updated,
      "runner-spectators": [...(updated["runner-spectators"] ?? []), { uid, user }],
    };
  }

  return updated;
}

/**
 * Handle watching a lobby.
 * Mirrors: (handle-watch-lobby lobbies gameid uid user correct-password? watch-message request-side)
 */
function handleWatchLobby(
  lobbies: Record<string, Lobby>,
  gameid: string,
  uid: string,
  user: Record<string, unknown>,
  correctPassword: boolean,
  watchMessage: Record<string, unknown>,
  requestSide: string | undefined,
): Record<string, Lobby> {
  const lobby = lobbies[gameid];
  if (!user || !lobby || !allowedInLobby(user, lobby) || !correctPassword) {
    return lobbies;
  }

  const updatedLobby = watchLobby(lobby, uid, user, requestSide);
  const withMessage = sendMessage(updatedLobby, watchMessage);
  return { ...lobbies, [gameid]: withMessage };
}

// ---- WS handler: :lobby/watch ----

registerMsgHandler("lobby/watch", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const password = data?.password as string | undefined;
  const requestSide = data?.["request-side"] as string | undefined;
  const replyFn = (msg as any).replyFn;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/watch";

  lobbyThread(() => {
    const lobby = getLobby(gameid as string);
    if (!lobby || !allowedInLobby(user, lobby)) return;

    const correctPassword = checkPassword(lobby, user, password);
    const sideText = requestSide ? ` (${requestSide} perspective)` : "";
    const watchMessage = makeSystemMessage(
      `${user.username} joined the game as a spectator${sideText}.`,
    );

    const newAppState = swapAppState((state) => ({
      ...state,
      lobbies: handleSetLastUpdate(
        handleWatchLobby(
          state.lobbies,
          gameid as string,
          uid,
          user,
          correctPassword,
          watchMessage,
          requestSide,
        ),
        gameid as string,
        uid,
      ),
    }));

    const lobbyExists = newAppState.lobbies[gameid as string];

    if (lobbyExists && correctPassword && allowedInLobby(user, lobbyExists)) {
      sendLobbyState(lobbyExists);
      sendLobbyTing(lobbyExists);
      broadcastLobbyList();
      if (replyFn) replyFn(200);
    } else if (!correctPassword) {
      if (replyFn) replyFn(403);
    } else {
      if (replyFn) replyFn(404);
    }
  });
  logDelay(timestamp, id);
});

// ---- WS handler: :lobby/pause-updates ----

registerMsgHandler("lobby/pause-updates", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/pause-updates";

  lobbyThread(() => {
    pauseLobbyUpdates(uid);
  });
  logDelay(timestamp, id);
});

// ---- WS handler: :lobby/continue-updates ----

registerMsgHandler("lobby/continue-updates", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/continue-updates";

  lobbyThread(() => {
    continueLobbyUpdates(uid);
    sendLobbyList(uid);
  });
  logDelay(timestamp, id);
});

// ---- WS handler: :lobby/mute-spectators ----

registerMsgHandler("lobby/mute-spectators", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "lobby/mute-spectators";

  lobbyThread(() => {
    const lobby = getLobby(gameid as string);
    if (lobby && inLobby(uid, lobby)) {
      swapAppState((state) => {
        const l = state.lobbies[gameid as string];
        if (l) {
          return {
            ...state,
            lobbies: {
              ...state.lobbies,
              [gameid as string]: { ...l, "mute-spectators": !l["mute-spectators"] },
            },
          };
        }
        return state;
      });
      const updatedLobby = getAppState().lobbies[gameid as string];
      sendLobbyState(updatedLobby);
    }
  });
  logDelay(timestamp, id);
});
