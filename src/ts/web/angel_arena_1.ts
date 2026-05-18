// Angel Arena module. Mirrors: src/clj/web/angel_arena.clj
//
// Handles competitive matchmaking: queueing, matching, run tracking,
// inactivity detection, and victory claims.

import { Db } from "mongodb";
import {
  getAppState,
  getLobby,
  getLobbies,
  Lobby,
  swapAppState,
} from "./app_state";
import { chskSend, registerMsgHandler, WSMessage } from "./ws";
import {
  createNewLobby,
  registerLobby,
  handleSetLastUpdate,
  sendLobbyState,
  broadcastLobbyList,
  closeLobby,
} from "./lobby";
import { gameStarted } from "./stats";
import { sendStateDiffs, updateAndSendDiffs } from "./game";
import { publicDiffs, publicStates } from "../game/core/diffs";
import { makeSystemMessage, systemMsg } from "../game/core/say";
import { win } from "../game/core/winning";
import { inColl } from "../game/utils";
import { otherSide } from "../jinteki/utils";
import {
  getRuns,
  getDeckFromId,
  SUPPORTED_FORMATS,
  INACTIVE_PERIOD_WARNING,
  INACTIVE_PERIOD_COUNTDOWN,
  MAX_INACTIVITY_COUNT,
  Runs,
} from "./angel_arena/utils";
import { startRun, finishRun, addNewMatch } from "./angel_arena/runs";

import { average, selectState } from './angel_arena_2';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WSMessageWithReq extends WSMessage {
  "ring-req"?: {
    system?: { db?: Db };
    user?: Record<string, unknown>;
  };
}

interface QueueEntry {
  user: Record<string, unknown>;
  uid: string;
  format: string;
  side: string;
  deck: Record<string, unknown> | unknown;
  "run-info": Record<string, unknown> | unknown;
  "queue-start": Date;
}

// ---------------------------------------------------------------------------
// State (mirrors defonce arena-queue and arena-queue-times)
// ---------------------------------------------------------------------------

export let arenaQueue: QueueEntry[] = [];

export let arenaQueueTimes: Record<
  string,
  { corp: number[]; runner: number[] }
> = {};
for (const form of SUPPORTED_FORMATS) {
  arenaQueueTimes[form] = { corp: [], runner: [] };
}

// ---------------------------------------------------------------------------
// WS Message Handlers
// ---------------------------------------------------------------------------

/** :angel-arena/fetch-runs */
registerMsgHandler("angel-arena/fetch-runs", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const replyFn = (msg as any).replyFn;

  if (!user || !db) return;
  const username = (user.username as string) ?? "";
  if (!username) return;

  const runs = await getRuns(db, username);
  if (runs && replyFn) {
    replyFn(runs);
  }
});

/** :angel-arena/fetch-history */
registerMsgHandler("angel-arena/fetch-history", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const replyFn = (msg as any).replyFn;

  if (!user || !db) return;
  const username = (user.username as string) ?? "";
  if (!username) return;

  const runs = await db
    .collection<any>("angel-arena")
    .find({ username })
    .sort({ "run-finished": -1 })
    .limit(5)
    .toArray();

  if (replyFn) replyFn(runs);
});

/** :angel-arena/fetch-queue-times */
registerMsgHandler("angel-arena/fetch-queue-times", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const user = ringReq?.user;
  const replyFn = (msg as any).replyFn;

  if (!user) return;

  const response: Record<string, { corp: number; runner: number }> = {};
  for (const form of SUPPORTED_FORMATS) {
    const corpTimes = arenaQueueTimes[form]?.corp ?? [];
    const runnerTimes = arenaQueueTimes[form]?.runner ?? [];
    response[form] = {
      corp: Math.floor(average(corpTimes) / 1000),
      runner: Math.floor(average(runnerTimes) / 1000),
    };
  }

  if (replyFn) replyFn(response);
});

/** :angel-arena/start-run */
registerMsgHandler("angel-arena/start-run", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const data = msg.data as Record<string, unknown> | undefined;
  const deckId = data?.["deck-id"] as string | undefined;

  if (!user || !db) return;
  const username = (user.username as string) ?? "";
  if (!username) return;

  try {
    const runs = await getRuns(db, username);
    const deck = await getDeckFromId(db, username, deckId);
    if (!deck) return;

    const format = ((deck as any).status?.format ?? "").toLowerCase();
    const side = ((deck as any).identity?.side ?? "").toLowerCase();

    // when not already running on this side and format
    if (runs && !runs[format]?.[side]) {
      await startRun(db, username, runs, deck as any);
    }
  } catch (e: any) {
    console.log("Caught exception while starting a new run: " + e.message);
  }
});

/** :angel-arena/abandon-run */
registerMsgHandler("angel-arena/abandon-run", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const uid = msg.uid as string;
  const data = msg.data as Record<string, unknown> | undefined;
  const deckId = data?.["deck-id"] as string | undefined;

  if (!user || !db) return;
  const username = (user.username as string) ?? "";
  if (!username) return;

  try {
    const runs = await getRuns(db, username);
    const deck = await getDeckFromId(db, username, deckId);
    if (!deck || !runs) return;

    const format = ((deck as any).status?.format ?? "").toLowerCase();
    const side = ((deck as any).identity?.side ?? "").toLowerCase();

    // there's a run in this side and format
    if (runs[format]?.[side]) {
      await finishRun(db, username, runs, deck as any);
      chskSend(uid, ["angel-arena/run-update"]);
    }
  } catch (e: any) {
    console.log("Caught exception while abandoning run: " + e.message);
  }
});

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

/**
 * Remove a user from the arena queue.
 * Mirrors: remove-from-queue!
 */
function removeFromQueue(username: string): void {
  arenaQueue = arenaQueue.filter(
    (entry) => entry.user.username !== username,
  );
}

/**
 * Add queue time for a player, keeping the latest 5 wait times.
 * Mirrors: add-queue-time!
 */
function addQueueTime(player: QueueEntry): void {
  const side = (player.side ?? "").toLowerCase();
  const format = player.format;
  const queueTime = Date.now() - player["queue-start"].getTime();

  const existing = arenaQueueTimes[format]?.[side as "corp" | "runner"] ?? [];
  if (existing.length >= 5) {
    arenaQueueTimes[format] = {
      ...arenaQueueTimes[format],
      [side]: [...existing.slice(1), queueTime],
    };
  } else {
    arenaQueueTimes[format] = {
      ...arenaQueueTimes[format],
      [side]: [...existing, queueTime],
    };
  }
}

// ---------------------------------------------------------------------------
// System messages
// ---------------------------------------------------------------------------

const angelArenaCreatedMessage = makeSystemMessage(
  "Angel Arena lobby has been created.",
);

const angelArenaIntroMessage = makeSystemMessage(
  [
    "This game is played in the Angel Arena, a competitive matchmaking system.",
    "Wins and losses of your run are being tracked.",
    "If by any error, the game should prematurely register a win, please use the",
    "/clear-win command to continue playing the game.",
    "Good luck and have fun!",
  ].join(" "),
);

// ---------------------------------------------------------------------------
// Lobby creation
// ---------------------------------------------------------------------------

/**
 * Create a new Angel Arena lobby.
 * Mirrors: create-new-angel-arena-lobby
 */
function createNewAngelArenaLobby(
  player1: QueueEntry,
  player2: QueueEntry,
  form: string,
): Lobby {
  const title = `Match between ${player1.user.username} and ${player2.user.username}`;

  const lobby = createNewLobby({
    uid: player1.uid,
    user: player1.user,
    allowSpectator: true,
    apiAccess: true,
    format: form,
    muteSpectators: true,
    password: undefined,
    room: "angel-arena",
    saveReplay: true,
    spectatorhands: false,
    timer: false,
    title,
  });

  // Add both players
  const p1 = {
    user: player1.user,
    uid: player1.uid,
    side: player1.side,
    deck: player1.deck,
    "run-info": player1["run-info"],
  };
  const p2 = {
    user: player2.user,
    uid: player2.uid,
    side: player2.side,
    deck: player2.deck,
    "run-info": player2["run-info"],
  };

  lobby.players = [p1, p2];
  lobby["original-players"] = [p1, p2];

  // Add system messages
  lobby.messages = [angelArenaCreatedMessage, angelArenaIntroMessage];

  return lobby;
}

// ---------------------------------------------------------------------------
// Player matching
// ---------------------------------------------------------------------------

/**
 * Find an eligible opponent from the queue.
 * Mirrors: find-eligible-player
 */
function findEligiblePlayer(
  player: QueueEntry,
  form: string,
): QueueEntry | undefined {
  const side = player.side;
  const username = player.user.username as string;
  const otherSideName = side === "Corp" ? "Runner" : "Corp";

  const playedThemFn = (otherPlayer: QueueEntry): boolean => {
    const games = (player["run-info"] as any)?.games ?? [];
    const winningGames = games.filter((g: any) => g.winner);
    const opponentUsernames = winningGames.map(
      (g: any) => g.opponent?.username,
    );
    return inColl(opponentUsernames, otherPlayer.user.username as string);
  };

  const theyPlayedUsFn = (otherPlayer: QueueEntry): boolean => {
    const games = (otherPlayer["run-info"] as any)?.games ?? [];
    const winningGames = games.filter((g: any) => g.winner);
    const opponentUsernames = winningGames.map(
      (g: any) => g.opponent?.username,
    );
    return inColl(opponentUsernames, username);
  };

  // Filter eligible players from queue
  const eligiblePlayers = arenaQueue.filter((otherPlayer) => {
    // Same format, other side
    if (otherPlayer.format !== form) return false;
    if (otherPlayer.side !== otherSideName) return false;

    // Haven't already played each other (as winner)
    if (playedThemFn(otherPlayer)) return false;
    if (theyPlayedUsFn(otherPlayer)) return false;

    // Block list checks
    const theirBlocked = (otherPlayer.user as any)?.options?.["blocked-users"] ?? [];
    if (inColl(theirBlocked as string[], username)) return false;

    const myBlocked = (player.user as any)?.options?.["blocked-users"] ?? [];
    if (
      inColl(myBlocked as string[], otherPlayer.user.username as string)
    )
      return false;

    return true;
  });

  return eligiblePlayers[0];
}

// ---------------------------------------------------------------------------
// DB update helpers
// ---------------------------------------------------------------------------

/**
 * Update the angel arena DB when a match is found.
 * Mirrors: update-angel-arena-db!
 */
async function updateAngelArenaDb(
  db: Db,
  player: QueueEntry,
  opponent: QueueEntry,
  gameId: string,
): Promise<void> {
  removeFromQueue(opponent.user.username as string);
  addQueueTime(player);
  addQueueTime(opponent);
  await addNewMatch(
    db,
    {
      user: player.user,
      format: player.format,
      side: player.side,
      deck: player.deck as any,
    } as any,
    {
      user: opponent.user,
      format: opponent.format,
      side: opponent.side,
      deck: opponent.deck as any,
    } as any,
    gameId,
  );
  await addNewMatch(
    db,
    {
      user: opponent.user,
      format: opponent.format,
      side: opponent.side,
      deck: opponent.deck as any,
    } as any,
    {
      user: player.user,
      format: player.format,
      side: player.side,
      deck: player.deck as any,
    } as any,
    gameId,
  );
}

// ---------------------------------------------------------------------------
// :angel-arena/queue
// ---------------------------------------------------------------------------

/** :angel-arena/queue */
registerMsgHandler("angel-arena/queue", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const uid = msg.uid as string;
  const data = msg.data as Record<string, unknown> | undefined;
  const deckId = data?.["deck-id"] as string | undefined;

  if (!user || !db) return;
  const username = (user.username as string) ?? "";
  if (!username) return;

  const runs = await getRuns(db, username);
  const deck = await getDeckFromId(db, username, deckId);
  if (!runs || !deck) return;

  const format = ((deck as any).status?.format ?? "").toLowerCase();
  const side = ((deck as any).identity?.side ?? "").toLowerCase();
  const runInfo = runs[format]?.[side];

  // Check that player isn't already queueing
  const alreadyQueued = arenaQueue.some(
    (entry) => entry.user.username === username,
  );
  if (!format || !side || alreadyQueued) return;

  const player: QueueEntry = {
    user,
    uid,
    format,
    side: side === "corp" ? "Corp" : "Runner",
    deck,
    "run-info": runInfo ?? {},
    "queue-start": new Date(),
  };

  const opponent = findEligiblePlayer(player, format);
  console.log(username, opponent?.uid);

  if (opponent) {
    // Found an opponent, create lobby and start game
    const lobby = createNewAngelArenaLobby(player, opponent, format);
    const gameId = lobby.gameid as string;

    const players: Record<string, unknown>[] = [
      { ...player, "queue-start": undefined },
      { ...opponent, "queue-start": undefined },
    ];

    // Register lobby, start game, set last-update
    const newAppState = swapAppState((state) => {
      let lobbies = registerLobby(state.lobbies, lobby, uid);
      // Handle start game - init state
      const gameLobby = lobbies[gameId];
      if (gameLobby) {
        gameLobby.started = true;
        gameLobby["original-players"] = players;
        gameLobby["ending-players"] = players;
        gameLobby["start-date"] = lobby.date as Date;
        gameLobby["last-update"] = new Date();
        gameLobby.state = gameLobby.state ?? {};
      }
      lobbies = handleSetLastUpdate(lobbies, gameId, uid);
      return { ...state, lobbies };
    });

    const lobbyExists = newAppState.lobbies[gameId];
    if (lobbyExists) {
      await updateAngelArenaDb(db, player, opponent, gameId);
      gameStarted(db, lobbyExists as any);
      sendLobbyState(lobbyExists);
      broadcastLobbyList();
      const state = (lobbyExists as any).state;
      if (state) {
        sendStateToParticipants(
          "game/start",
          lobbyExists,
          publicStates(state) as unknown as Record<string, unknown>,
        );
      }
    } else {
      // Lobby creation failed, enqueue player
      arenaQueue = [...arenaQueue, player];
    }
  } else {
    // No opponent found, enqueue and wait
    arenaQueue = [...arenaQueue, player];
  }
});

// ---------------------------------------------------------------------------
// :angel-arena/dequeue
// ---------------------------------------------------------------------------

/** :angel-arena/dequeue */
registerMsgHandler("angel-arena/dequeue", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const user = ringReq?.user;

  if (!user) return;
  const username = (user.username as string) ?? "";
  if (!username) return;

  removeFromQueue(username);
});

// ---------------------------------------------------------------------------
// Send full states to participants
// ---------------------------------------------------------------------------

/**
 * Sends full states generated by public-states to all connected clients in lobby.
 * Mirrors: (send-state-to-participants event lobby diffs)
 */
function sendStateToParticipants(
  event: string,
  lobby: Lobby,
  diffs: Record<string, unknown>,
): void {
  const allUsers = [
    ...(lobby.players ?? []),
    ...(lobby.spectators ?? []),
  ];
  for (const user of allUsers) {
    const uid = (user as any).uid as string | undefined;
    if (!uid) continue;
    const side = (user as any).side as string | undefined;
    const selectedState = selectState(uid, lobby, side, diffs);
    chskSend(uid, [event, selectedState]);
  }
}
