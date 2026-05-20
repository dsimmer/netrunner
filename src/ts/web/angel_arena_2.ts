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

import type { WSMessageWithReq } from './angel_arena_1';

/**
 * Select the correct state view for a uid + side.
 * Mirrors: (select-state uid lobby side diffs)
 */
export function selectState(
  uid: string,
  lobby: Lobby,
  side: string | undefined,
  diffs: Record<string, unknown>,
): string {
  const corpSpectators = (lobby["corp-spectators"] ?? []) as Record<string, unknown>[];
  const runnerSpectators = (lobby["runner-spectators"] ?? []) as Record<string, unknown>[];

  let selected: unknown;
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
    const inactiveUser = (state[inactiveSide] as Record<string, unknown>)?.user as Record<string, unknown> | undefined;

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

  const corpUsername = (((state as any).corp as Record<string, unknown>)?.user as Record<string, unknown> | undefined)?.username;
  const runnerUsername = (((state as any).runner as Record<string, unknown>)?.user as Record<string, unknown> | undefined)?.username;

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

    const corpUsername = (((state as any).corp as Record<string, unknown>)?.user as Record<string, unknown> | undefined)?.username;
    const runnerUsername = (((state as any).runner as Record<string, unknown>)?.user as Record<string, unknown> | undefined)?.username;

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

  const corpUsername = (((state as any).corp as Record<string, unknown>)?.user as Record<string, unknown> | undefined)?.username;
  const runnerUsername = (((state as any).runner as Record<string, unknown>)?.user as Record<string, unknown> | undefined)?.username;

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

export function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}
