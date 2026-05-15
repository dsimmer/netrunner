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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WSMessageWithReq extends WSMessage {
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
  deck: Record<string, unknown>;
  "run-info": Record<string, unknown>;
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
      await startRun(db, username, runs, deck);
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
      await finishRun(db, username, runs, deck);
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

  const existing = arenaQueueTimes[format]?.[side] ?? [];
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
          publicStates(state),
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

/**
 * Select the correct state view for a uid + side.
 * Mirrors: (select-state uid lobby side diffs)
 */
function selectState(
  uid: string,
  lobby: Lobby,
  side: string | undefined,
  diffs: Record<string, unknown>,
): string {
  const corpSpectators = (lobby["corp-spectators"] ?? []) as Record<string, unknown>[];
  const runnerSpectators = (lobby["runner-spectators"] ?? []) as Record<string, unknown>[];

  let selected: Record<string, unknown>;
  if (side === "Corp") {
    selected = diffs["corp-state"];
  } else if (side === "Runner") {
    selected = diffs["runner-state"];
  } else if (corpSpectators.some((p) => (p as any).uid === uid)) {
    selected = diffs["corp-spect-state"];
  } else if (runnerSpectators.some((p) => (p as any).uid === uid)) {
    selected = diffs["runner-spect-state"];
  } else {
    selected = diffs["spect-state"];
  }

  return JSON.stringify(selected);
}

// ---------------------------------------------------------------------------
// Inactivity detection
// ---------------------------------------------------------------------------

/**
 * Check if a player is maybe inactive (past warning period).
 * Mirrors: is-maybe-inactive?
 */
function isMaybeInactive(lastUpdate: Date): boolean {
  return new Date() > new Date(lastUpdate.getTime() + INACTIVE_PERIOD_WARNING * 1000);
}

/**
 * Check if a player is inactive (past countdown period).
 * Mirrors: is-inactive?
 */
function isInactive(lastUpdate: Date): boolean {
  return new Date() > new Date(lastUpdate.getTime() + INACTIVE_PERIOD_COUNTDOWN * 1000);
}

/**
 * Strip user to just username and emailhash.
 * Mirrors: strip-user
 */
function stripUser(user: Record<string, unknown>): Record<string, unknown> {
  return {
    username: user.username,
    emailhash: user.emailhash,
  };
}

/**
 * Set inactivity warning to :inactive-left stage.
 * Mirrors: set-inactive-left
 */
function setInactiveLeft(
  state: Record<string, unknown>,
  user: Record<string, unknown>,
  side: string,
  now: Date,
): void {
  const arenaInfo = (state["angel-arena-info"] as Record<string, unknown>) ?? {};
  arenaInfo["inactivity-warning"] = {
    stage: "inactive-left",
    "inactive-user": stripUser(user),
    "inactive-side": side,
    "warning-time": now,
  };
  state["angel-arena-info"] = arenaInfo;
}

/**
 * Set inactivity warning to :inactive-pre-start stage.
 * Mirrors: set-inactive-pre-start
 */
function setInactivePreStart(
  state: Record<string, unknown>,
  now: Date,
): void {
  const arenaInfo = (state["angel-arena-info"] as Record<string, unknown>) ?? {};
  arenaInfo["inactivity-warning"] = {
    stage: "inactive-pre-start",
    "inactive-side": null,
    "inactive-user": null,
    "warning-time": now,
    "period-to-react": -1,
  };
  state["angel-arena-info"] = arenaInfo;
}

/**
 * Set inactivity warning to :inactive-warning stage.
 * Mirrors: set-inactive-start
 */
function setInactiveStart(
  state: Record<string, unknown>,
  user: Record<string, unknown>,
  side: string,
  now: Date,
): void {
  const arenaInfo = (state["angel-arena-info"] as Record<string, unknown>) ?? {};
  arenaInfo["inactivity-warning"] = {
    stage: "inactive-warning",
    "inactive-user": stripUser(user),
    "inactive-side": side,
    "warning-time": now,
    "period-to-react": INACTIVE_PERIOD_COUNTDOWN,
  };
  state["angel-arena-info"] = arenaInfo;
}

/**
 * Set inactivity warning to :inactive-countdown stage.
 * Mirrors: set-inactive-countdown
 */
function setInactiveCountdown(state: Record<string, unknown>): void {
  const arenaInfo = state["angel-arena-info"] as Record<string, unknown>;
  if (arenaInfo && arenaInfo["inactivity-warning"]) {
    (arenaInfo["inactivity-warning"] as Record<string, unknown>).stage =
      "inactive-countdown";
  }
}

/**
 * Reset inactivity warning.
 * Mirrors: reset-inactive
 */
function resetInactive(state: Record<string, unknown>): void {
  const arenaInfo = state["angel-arena-info"] as Record<string, unknown> | undefined;
  if (arenaInfo) {
    delete arenaInfo["inactivity-warning"];
    state["angel-arena-info"] = arenaInfo;
  }
}

// ---------------------------------------------------------------------------
// Player left lobby handling
// ---------------------------------------------------------------------------

/**
 * Handle a player leaving the lobby during inactivity.
 * Mirrors: player-left-lobby
 */
function playerLeftLobby(lobby: Lobby): void {
  const originalPlayers = (lobby["original-players"] as Record<string, unknown>[]) ?? [];
  const players = (lobby.players as Record<string, unknown>[]) ?? [];
  const activeUsername = (players[0]?.user as Record<string, unknown>)?.username;

  const inactivePlayer = originalPlayers.find(
    (p) => (p.user as Record<string, unknown>)?.username !== activeUsername,
  );
  if (!inactivePlayer) return;

  const inactiveUser = inactivePlayer.user as Record<string, unknown>;
  let inactiveSide = (inactivePlayer.side as string) ?? "";
  inactiveSide = inactiveSide.toLowerCase();

  updateAndSendDiffs(
    setInactiveLeft,
    lobby,
    inactiveUser,
    inactiveSide,
    new Date(),
  );
}

// ---------------------------------------------------------------------------
// Inactivity checking (background thread)
// ---------------------------------------------------------------------------

/**
 * Called by a background thread to notify lobbies without activity.
 * Mirrors: check-for-inactivity
 */
export function checkForInactivity(): void {
  let changed = false;

  const arenaLobbies = getLobbies().filter(
    (lobby) => lobby.room === "angel-arena",
  );

  for (const lobby of arenaLobbies) {
    const state = (lobby.state as Record<string, unknown>) ?? {};
    const gameid = lobby.gameid as string | undefined;
    const lastUpdate = (lobby["last-update"] as Date) ?? new Date();
    const players = lobby.players as Record<string, unknown>[] | undefined;

    const activePlayer = (state["active-player"] as string) ?? "";
    const endTurn = state["end-turn"] as boolean | undefined;
    const inactiveSide = endTurn
      ? otherSide(activePlayer) ?? ""
      : activePlayer;
    const inactiveUser = (state[inactiveSide] as Record<string, unknown>)?.user;

    if (players && players.length === 1) {
      // Player leaves
      if (isInactive(lastUpdate)) {
        changed = true;
        playerLeftLobby(lobby);
      }
    } else if (players && players.length > 1) {
      // Player inactive
      const run = state["run"] as boolean | undefined;
      if (!gameid || run) continue;

      const turn = (state["turn"] as number) ?? 0;
      if (turn === 0) {
        // Pre-game inactivity
        if (isInactive(lastUpdate)) {
          updateAndSendDiffs(setInactivePreStart, lobby, new Date());
        }
      } else {
        // In-game inactivity
        const arenaInfo = state["angel-arena-info"] as
          | Record<string, unknown>
          | undefined;
        const warning = arenaInfo?.["inactivity-warning"] as
          | Record<string, unknown>
          | undefined;
        const stage = (warning?.stage as string) ?? "inactive-start";

        switch (stage) {
          case "inactive-start":
            if (isMaybeInactive(lastUpdate)) {
              updateAndSendDiffs(
                setInactiveStart,
                lobby,
                inactiveUser ?? {},
                inactiveSide,
                new Date(),
              );
            }
            break;

          case "inactive-warning": {
            const warningTime = new Date(
              warning?.["warning-time"] as string | number | Date,
            );
            const periodToReact = warning?.["period-to-react"] as
              | number
              | undefined;
            if (lastUpdate > warningTime) {
              // There was an action after the warning
              updateAndSendDiffs(resetInactive, lobby);
            } else if (
              periodToReact != null &&
              new Date() >
                new Date(warningTime.getTime() + periodToReact * 1000)
            ) {
              // Reaction period over
              updateAndSendDiffs(setInactiveCountdown, lobby);
            }
            break;
          }

          default: {
            const warningTime = warning?.["warning-time"]
              ? new Date(warning["warning-time"] as string | number | Date)
              : null;
            if (warningTime && lastUpdate > warningTime) {
              // There was an action after the warning
              updateAndSendDiffs(resetInactive, lobby);
            }
            break;
          }
        }
      }
    }
  }

  if (changed) {
    broadcastLobbyList();
  }
}

// ---------------------------------------------------------------------------
// Request more time
// ---------------------------------------------------------------------------

/**
 * Handle player requesting more time.
 * Mirrors: request-more-time
 */
function requestMoreTime(
  state: Record<string, unknown>,
  inactiveSide: string,
): void {
  const arenaInfo = state["angel-arena-info"] as Record<string, unknown>;
  if (!arenaInfo) return;

  delete arenaInfo["inactivity-warning"];

  const counter = arenaInfo["inactivity-counter"] as
    | Record<string, number>
    | undefined;
  if (!counter) {
    arenaInfo["inactivity-counter"] = { [inactiveSide]: MAX_INACTIVITY_COUNT - 1 };
  } else {
    const current = counter[inactiveSide] ?? MAX_INACTIVITY_COUNT;
    counter[inactiveSide] = Math.max(current - 1, 0);
    arenaInfo["inactivity-counter"] = counter;
  }

  state["angel-arena-info"] = arenaInfo;
}

/** :angel-arena/more-time */
registerMsgHandler("angel-arena/more-time", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const user = ringReq?.user;
  const uid = msg.uid as string;
  const data = msg.data as Record<string, unknown> | undefined;
  const gameId = data?.gameid as string | undefined;

  if (!user || !gameId) return;
  const username = (user.username as string) ?? "";

  const lobby = getLobby(gameId);
  if (!lobby) return;
  const state = lobby.state as Record<string, unknown> | undefined;
  if (!state) return;

  const arenaInfo = state["angel-arena-info"] as
    | Record<string, unknown>
    | undefined;
  const inactiveState = arenaInfo?.["inactivity-warning"] as
    | Record<string, unknown>
    | undefined;

  if (!inactiveState) return;

  const inactiveSide = inactiveState["inactive-side"] as string | undefined;
  const inactiveUser = inactiveState["inactive-user"] as
    | Record<string, unknown>
    | undefined;

  const corpUsername = (state.corp as Record<string, unknown>)?.user?.username;
  const runnerUsername = (state.runner as Record<string, unknown>)?.user?.username;

  // Check user is in the game
  if (
    username !== corpUsername &&
    username !== runnerUsername
  )
    return;

  // Check user is the inactive user
  if (username !== inactiveUser?.username) return;

  // Check remaining time requests
  const counter = arenaInfo?.["inactivity-counter"] as
    | Record<string, number>
    | undefined;
  const remaining = counter?.[inactiveSide ?? ""] ?? 1;
  if (remaining <= 0) return;

  systemMsg(
    state as any,
    inactiveSide ?? "",
    `has asked for more time (${remaining} remaining)`,
  );

  // Update last-update timestamp
  swapAppState((appState) => ({
    ...appState,
    lobbies: handleSetLastUpdate(appState.lobbies, gameId, uid),
  }));

  updateAndSendDiffs(requestMoreTime, lobby, inactiveSide ?? "");
});

// ---------------------------------------------------------------------------
// :angel-arena/claim-victory
// ---------------------------------------------------------------------------

/** :angel-arena/claim-victory */
registerMsgHandler(
  "angel-arena/claim-victory",
  async (msg: WSMessageWithReq) => {
    const ringReq = msg["ring-req"];
    const db = ringReq?.system?.db;
    const user = ringReq?.user;
    const data = msg.data as Record<string, unknown> | undefined;
    const gameId = data?.gameid as string | undefined;

    if (!user || !db || !gameId) return;
    const username = (user.username as string) ?? "";

    const lobby = getLobby(gameId);
    if (!lobby) return;
    const state = lobby.state as Record<string, unknown> | undefined;
    if (!state) return;

    const arenaInfo = state["angel-arena-info"] as
      | Record<string, unknown>
      | undefined;
    const inactiveState = arenaInfo?.["inactivity-warning"] as
      | Record<string, unknown>
      | undefined;

    if (!inactiveState) return;

    const stage = inactiveState.stage as string;
    const inactiveSide = inactiveState["inactive-side"] as string | undefined;

    const corpUsername = (state.corp as Record<string, unknown>)?.user?.username;
    const runnerUsername = (state.runner as Record<string, unknown>)?.user?.username;

    // Check user is in the game
    if (username !== corpUsername && username !== runnerUsername) return;

    // Check eligibility: inactive-left stage OR (inactive-countdown AND other player)
    const otherSideName = otherSide(inactiveSide ?? "") ?? "";
    const otherUsername =
      inactiveSide === "corp" ? runnerUsername : corpUsername;

    if (
      !(
        stage === "inactive-left" ||
        (stage === "inactive-countdown" && username === otherUsername)
      )
    )
      return;

    const oldState = { ...state };

    systemMsg(state as any, otherSideName, "claims a victory");
    win(state as any, otherSideName, "Claim");

    await closeLobby(db, lobby);
    sendStateDiffs(lobby, publicDiffs(oldState as any, state as any, false, false, false));
  },
);

// ---------------------------------------------------------------------------
// :angel-arena/cancel-match
// ---------------------------------------------------------------------------

/** :angel-arena/cancel-match */
registerMsgHandler("angel-arena/cancel-match", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const data = msg.data as Record<string, unknown> | undefined;
  const gameId = data?.gameid as string | undefined;

  if (!user || !db || !gameId) return;
  const username = (user.username as string) ?? "";

  const lobby = getLobby(gameId);
  if (!lobby) return;
  const state = lobby.state as Record<string, unknown> | undefined;
  if (!state) return;

  const arenaInfo = state["angel-arena-info"] as
    | Record<string, unknown>
    | undefined;
  const inactiveState = arenaInfo?.["inactivity-warning"] as
    | Record<string, unknown>
    | undefined;

  if (!inactiveState) return;

  const stage = inactiveState.stage as string;
  const inactiveSide = inactiveState["inactive-side"] as string | undefined;

  const corpUsername = (state.corp as Record<string, unknown>)?.user?.username;
  const runnerUsername = (state.runner as Record<string, unknown>)?.user?.username;

  // Check user is in the game
  if (username !== corpUsername && username !== runnerUsername) return;

  // Check eligibility: inactive-pre-start, inactive-left, OR (inactive-countdown AND other player)
  const otherSideName = otherSide(inactiveSide ?? "") ?? "";
  const otherUsername =
    inactiveSide === "corp" ? runnerUsername : corpUsername;

  if (
    !(
      stage === "inactive-pre-start" ||
      stage === "inactive-left" ||
      (stage === "inactive-countdown" && username === otherUsername)
    )
  )
    return;

  const oldState = { ...state };

  systemMsg(state as any, otherSideName, "cancels the match");

  await closeLobby(db, lobby);
  sendStateDiffs(lobby, publicDiffs(oldState as any, state as any, false, false, false));
});

// ---------------------------------------------------------------------------
// Utility: average (mirrors web.utils/average)
// ---------------------------------------------------------------------------

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}
