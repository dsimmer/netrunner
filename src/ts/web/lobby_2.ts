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

import { assignTournamentProperties, broadcastLobbyList, createNewLobby, getPlayersAndSpectators, leavePool, lobbyThread, logDelay, prepareLobbyList, registerLobby, sendLobbyState } from './lobby_1';
import type { PoolInfo } from './lobby_1';

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
export function checkPassword(lobby: Lobby, user: Record<string, unknown>, password: string | undefined): boolean {
  if (!lobby.password) return true; // No password set
  if (superuser(user)) return true;
  return bcrypt.compareSync(password || "", lobby.password as string);
}
