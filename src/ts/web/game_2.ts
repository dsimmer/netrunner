// Game module. Mirrors: src/clj/web/game.clj
// Manages game lifecycle: start, leave, rejoin, concede, action, resync,
// watch (spectator), chat, side-swapping, and state/diff broadcasting.

import { Db } from "mongodb";
import {
  getAppState,
  getLobby,
  swapAppState,
  Lobby,
} from "./app_state";
import { chskSend, registerMsgHandler, WSMessage } from "./ws";
import {
  lobbyThread,
  gameThread,
  playerInLobby,
  spectatorInLobby as spectatorInLobbyCheck,
  inLobby,
  firstPlayerInLobby,
  sendLobbyState,
  sendLobbyTing,
  broadcastLobbyList,
  sendLobbyList,
  uidToLobby,
  joinLobby,
  leaveLobby,
  handleSetLastUpdate,
  handleWatchLobby,
  processDeck,
  logDelay,
  checkPassword,
  allowedInLobby,
} from "./lobby";
import { gameStarted } from "./stats";
import { parseCommand } from "../game/core/commands";
import {
  publicDiffs,
  publicStates,
  messageDiffs,
  type PublicDiffs,
  type MessageDiffs,
} from "../game/core/diffs";
import { makeSystemMessage } from "../game/core/say";
import { findLatest } from "../game/core/finding";
import * as main from "../game/main";
import { matchupByKey } from "../jinteki/preconstructed";
import { makeCorpDeck, makeRunnerDeck } from "../jinteki/chimera";
import { sideFromStr } from "../jinteki/utils";

import { handleMessageAndSendDiffs, sendStateToUid, updateAndSendDiffs } from './game_1';

/** :game/rejoin */
function uidInLobbyAsOriginalPlayer(uid: string): Lobby | undefined {
  const lobbies = getAppState().lobbies;
  for (const lobby of Object.values(lobbies)) {
    const originalPlayers = (lobby as any)["original-players"] as
      | Record<string, unknown>[]
      | undefined;
    if (originalPlayers?.some((p) => (p as any).uid === uid)) {
      return lobby;
    }
  }
  return undefined;
}

registerMsgHandler("game/rejoin", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "game/rejoin";

  lobbyThread(() => {
    const lobby = uidInLobbyAsOriginalPlayer(uid);
    if (!lobby) return;

    const originalPlayers = (lobby as any)["original-players"] as
      | Record<string, unknown>[]
      | undefined;
    const originalPlayer = originalPlayers?.find((p) => (p as any).uid === uid);
    if (!originalPlayer) return;

    const players = lobby.players ?? [];
    const othersCount = players.filter((p) => (p as any).uid !== uid).length;
    if (!lobby.started || othersCount >= 2) return;

    const dataWithSide = { ...(data ?? {}), "request-side": "Any Side" };
    const lobbyAfter = joinLobby(user, uid, dataWithSide, undefined, lobby);
    if (lobbyAfter) {
      const state = (lobbyAfter as any).state;
      if (state) {
        sendStateToUid(uid, "game/start", lobbyAfter, publicStates(state as any));
      }
      updateAndSendDiffs(main.handleRejoin as any, lobbyAfter, user as any);
    }
  });
  logDelay(timestamp, id);
});

/** :game/concede */
registerMsgHandler("game/concede", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "game/concede";

  const lobby = getLobby(gameid as string);
  if (!lobby) return;
  const player = playerInLobby(uid, lobby);
  if (!player) return;

  gameThread(lobby, () => {
    const side = sideFromStr(String((player as any).side ?? ""));
    updateAndSendDiffs(main.handleConcede as any, lobby, side as any);
  });
  logDelay(timestamp, id);
});

/** :game/action */
registerMsgHandler("game/action", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const command = data?.command as string | undefined;
  const args = (data?.args as any[]) ?? [];
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "game/action";

  const lobby = getLobby(gameid as string);
  if (!lobby) return;

  gameThread(lobby, () => {
    try {
      const state = (lobby as any).state;
      const player = playerInLobby(uid, lobby);
      const spectator = spectatorInLobbyCheck(uid, lobby);

      if (state && player) {
        const oldState = { ...(state as Record<string, unknown>) };
        const side = sideFromStr(String((player as any).side ?? ""));

        try {
          // handle-set-last-update
          swapAppState((appState) => ({
            ...appState,
            lobbies: handleSetLastUpdate(appState.lobbies, gameid as string, uid),
          }));

          updateAndSendDiffs(
            main.handleAction as any,
            lobby,
            side as any,
            command ?? "",
            args,
          );
        } catch (e) {
          // Reset state on error
          const s = lobby as any;
          s.state = oldState;
          throw e;
        }
      } else if (!spectator && command !== "toast") {
        throw new Error("handle-game-action unknown state or side");
      }
      logDelay(timestamp, id);
    } catch (e: any) {
      chskSend(uid, ["game/error"]);

      const state = (lobby as any).state;
      let lastLogs = "unable to fetch log from state";
      if (state) {
        const log = (state.log as Array<{ public?: string; user?: string; text?: string }>) ?? [];
        lastLogs = log
          .filter((entry) => entry.public && entry.user === "__system__")
          .map((entry) => entry.text ?? "")
          .slice(-5)
          .join("\n\t");
      }

      let cardInfo = "";
      if (args.card && state) {
        const card = findLatest(state as any, args.card as any);
        if (card) {
          cardInfo = `\nRelevant Card: ${(card as any).printedTitle ?? (card as any).title}`;
        }
      }

      console.error(
        e,
        `Caught exception\nCommand: ${command} - ${JSON.stringify(args)}${cardInfo}\nLast messages: ${lastLogs}`,
      );
    }
  });
});

/** :game/resync */
registerMsgHandler("game/resync", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "game/resync";

  const lobby = getLobby(gameid as string);
  if (!lobby) return;

  gameThread(lobby, () => {
    if (!inLobby(uid, lobby)) return;

    const state = (lobby as any).state;
    if (state) {
      sendStateToUid(uid, "game/resync", lobby, publicStates(state as any));
    } else {
      console.error(
        `resync request unknown state\nGameID:${gameid}\nClientID:${uid}\nPlayers:${JSON.stringify(
          (lobby.players ?? []).map((p: any) => ({ uid: p.uid, side: p.side })),
        )}\nSpectators:${JSON.stringify(
          (lobby.spectators ?? []).map((p: any) => ({ uid: p.uid })),
        )}`,
      );
    }
  });
  logDelay(timestamp, id);
});

/** :game/watch */
registerMsgHandler("game/watch", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const password = data?.password as string | undefined;
  const requestSide = data?.["request-side"] as string | undefined;
  const replyFn = (msg as any).replyFn;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "game/watch";

  lobbyThread(() => {
    const lobby = getLobby(gameid as string);
    if (!lobby || !allowedInLobby(user, lobby)) return;

    const correctPassword = checkPassword(lobby, user, password);
    const sideText = requestSide ? ` (${requestSide})` : "";
    const watchStr = `${(user as any).username ?? "User"} joined the game as a spectator${sideText}.`;
    const watchMessage = makeSystemMessage(watchStr);

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

    if (lobbyExists && spectatorInLobbyCheck(uid, lobbyExists) && allowedInLobby(user, lobbyExists)) {
      sendLobbyState(lobbyExists);
      sendLobbyTing(lobbyExists);
      broadcastLobbyList();
      const state = (lobbyExists as any).state;
      if (state) {
        main.handleNotification(state as any, watchStr);
      }
      if (state) {
        sendStateToUid(uid, "game/start", lobbyExists, publicStates(state as any));
      }
      if (replyFn) replyFn(200);
    } else if (!correctPassword) {
      if (replyFn) replyFn(403);
    } else {
      if (replyFn) replyFn(404);
    }
  });
  logDelay(timestamp, id);
});

/** :game/mute-spectators */
registerMsgHandler("game/mute-spectators", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "game/mute-spectators";

  const newAppState = swapAppState((state) => ({
    ...state,
    lobbies: handleSetLastUpdate(
      (function (lobbies: Record<string, Lobby>): Record<string, Lobby> {
        const lobby = lobbies[gameid as string];
        if (!lobby) return lobbies;
        return {
          ...lobbies,
          [gameid as string]: {
            ...lobby,
            "mute-spectators": !(lobby as any)["mute-spectators"],
          },
        };
      })(state.lobbies),
      gameid as string,
      uid,
    ),
  }));

  const lobbyExists = newAppState.lobbies[gameid as string];
  if (!lobbyExists) return;

  const state = (lobbyExists as any).state;
  const muteSpectators = (lobbyExists as any)["mute-spectators"];
  const message = muteSpectators ? "muted" : "unmuted";

  if (state && playerInLobby(uid, lobbyExists)) {
    gameThread(lobbyExists, () => {
      handleMessageAndSendDiffs(
        lobbyExists,
        null,
        null,
        `${(user as any).username ?? "User"} ${message} spectators.`,
      );
      sendLobbyState(lobbyExists);
    });
  }
  logDelay(timestamp, id);
});

/** :game/say */
registerMsgHandler("game/say", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const user = ringReq.user ?? {};
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const text = data?.msg as string | undefined;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "game/say";

  if (typeof text !== "string") return;

  const newAppState = swapAppState((state) => ({
    ...state,
    lobbies: handleSetLastUpdate(state.lobbies, gameid as string, uid),
  }));

  const lobbyExists = newAppState.lobbies[gameid as string];
  if (!lobbyExists) return;

  const state = (lobbyExists as any).state;
  const muteSpectators = (lobbyExists as any)["mute-spectators"];

  let side: string | null = null;
  const player = playerInLobby(uid, lobbyExists);
  if (player) {
    side = sideFromStr(String((player as any).side ?? ""));
  } else if (!muteSpectators && spectatorInLobbyCheck(uid, lobbyExists)) {
    side = "spectator";
  }

  if (lobbyExists && state && side) {
    gameThread(lobbyExists, () => {
      handleMessageAndSendDiffs(lobbyExists, side, user, text);
    });
  }
  logDelay(timestamp, id);
});

/** :game/typing */
registerMsgHandler("game/typing", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const data = msg.data as Record<string, unknown> | undefined;
  const gameid = data?.gameid as string | undefined;
  const typing = data?.typing;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "game/typing";

  const lobby = getLobby(gameid as string);
  if (!lobby) return;

  gameThread(lobby, () => {
    const state = (lobby as any).state;
    const player = playerInLobby(uid, lobby);
    if (!state || !player) return;

    const players = lobby.players ?? [];
    for (const p of players) {
      const otherUid = (p as any).uid;
      if (otherUid && otherUid !== uid) {
        chskSend(otherUid, ["game/typing", typing]);
      }
    }
  });
  logDelay(timestamp, id);
});

/** :chsk/uidport-close */
registerMsgHandler("chsk/uidport-close", (msg: WSMessage) => {
  const uid = msg.uid as string;
  const ringReq = (msg as any).ringReq ?? {};
  const db = ringReq.system?.db as Db | undefined;
  const user = ringReq.user ?? {};
  const replyFn = (msg as any).replyFn;
  const timestamp = msg.timestamp ?? Date.now();
  const id = msg.id ?? "chsk/uidport-close";

  // Deregister user (mirrors app-state/deregister-user!)
  // app_state.ts handles this separately in ws.ts close handler,
  // but we mirror the Clojure behavior here as well.

  lobbyThread(() => {
    const lobby = uidToLobby(uid);
    if (!lobby || !lobby.started || !(lobby as any).state) {
      broadcastLobbyList();
      if (replyFn) replyFn(true);
      logDelay(timestamp, id);
      return;
    }

    // The game will not exist if this is the last player to leave.
    const lobbyAfter = leaveLobby(db!, user, uid, undefined, lobby);
    if (lobbyAfter) {
      handleMessageAndSendDiffs(
        lobbyAfter,
        null,
        null,
        `${(user as any).username ?? "User"} has left the game.`,
      );
    }
    broadcastLobbyList();
    if (replyFn) replyFn(true);
  });
  logDelay(timestamp, id);
});

// ---------------------------------------------------------------------------
// Side swapping
// ---------------------------------------------------------------------------

/**
 * Returns a new player map with the player's :side set to a new side.
 * Mirrors: (switch-side player)
 */
function switchSide(player: Record<string, unknown>): Record<string, unknown> {
  const side = (player as any).side;
  return {
    ...player,
    side: side === "Corp" ? "Runner" : "Corp",
  };
}

/**
 * Handle swapping sides for an in-progress game.
 * Mirrors: (handle-swap-sides-in-prog lobbies gameid)
 */
function handleSwapSidesInProg(
  lobbies: Record<string, Lobby>,
  gameid: string,
): Record<string, Lobby> {
  const lobby = lobbies[gameid];
  if (!lobby) return lobbies;

  const updated = {
    ...lobby,
    // original-players needs to be updated so that you rejoin the game
    // on the correct side if you leave/rejoin
    "original-players": ((lobby as any)["original-players"] as Record<string, unknown>[] | undefined)
      ?.map(switchSide),
    players: (lobby.players ?? []).map(switchSide),
  };

  return { ...lobbies, [gameid]: updated };
}

/**
 * Switch sides for a lobby (in-progress game).
 * Mirrors: (switch-side-for-lobby gameid)
 */
export function switchSideForLobby(gameid: string): void {
  const lobby = getLobby(gameid);
  if (!lobby) return;

  const state = (lobby as any).state as Record<string, unknown> | undefined;
  if (!state) return;

  const oldRunner = (state.runner as Record<string, unknown>)?.user;
  const oldRunnerOptions = (state.runner as Record<string, unknown>)?.options;

  // Swap runner/corp user and options
  const newState = { ...state };
  const newRunner = {
    ...newState.runner,
    user: (newState.corp as Record<string, unknown>)?.user,
    options: (newState.corp as Record<string, unknown>)?.options,
  };
  const newCorp = {
    ...newState.corp,
    user: oldRunner,
    options: oldRunnerOptions,
  };
  newState.runner = newRunner;
  newState.corp = newCorp;

  lobbyThread(() => {
    const newAppState = swapAppState((appState) => ({
      ...appState,
      lobbies: handleSwapSidesInProg(appState.lobbies, gameid),
    }));

    const lobbyExists = newAppState.lobbies[gameid];
    if (lobbyExists) {
      sendLobbyState(lobbyExists);
      broadcastLobbyList();
    }
  });
}

// ---------------------------------------------------------------------------
// Lobby command: :swap-sides
// Mirrors: (defmethod commands/lobby-command :swap-sides ...)
// The lobby-command dispatch in commands.ts handles this.
// ---------------------------------------------------------------------------
