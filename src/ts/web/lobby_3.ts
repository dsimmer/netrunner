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
import { makeSystemMessage, type Message } from "../game/core/say";
import { serverCard } from "../game/utils";
import { selectNonNilKeys, sideFromStr, superuser, tournamentOrganizer } from "../jinteki/utils";
import { allMatchups } from "../jinteki/preconstructed";
import { calculateDeckStatus, legalDeck } from "../jinteki/validator";
import { gameFinished, updateDeckStats, updateGameStats, pushStatsUpdate } from "./stats";

import { broadcastLobbyList, filterLobbyList, getPlayersAndSpectators, lobbyThread, logDelay, sendLobbyState, sendLobbyTing } from './lobby_1';
import { checkPassword, closeLobby, firstPlayerInLobby, handleSetLastUpdate, inLobby, playerInLobby, sendLobbyList, sendMessage } from './lobby_2';
import type { Side } from '../types';


/**
 * Check if user is allowed in a lobby (not blocked).
 * Mirrors: (allowed-in-lobby user lobby)
 */
export function allowedInLobby(user: Record<string, unknown>, lobby: Lobby): boolean {
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
  joinMessage: Record<string, unknown> | Message,
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
export function handleWatchLobby(
  lobbies: Record<string, Lobby>,
  gameid: string,
  uid: string,
  user: Record<string, unknown>,
  correctPassword: boolean,
  watchMessage: Record<string, unknown> | Message,
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
