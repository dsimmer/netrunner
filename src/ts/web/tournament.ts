// Tournament module. Mirrors: src/clj/web/tournament.clj
//
// Handles tournament round scheduling, announcements, and table management
// for tournament organizers.

import { registerMsgHandler, broadcastTo, type WSMessage } from "./ws";
import {
  getAppState,
  getLobbies,
  getLobby,
  tournamentState,
  swapAppState,
  type Lobby,
  type TournamentState,
} from "./app_state";
import {
  handleSendMessage,
  handleSetLastUpdate,
  sendLobbyState,
  logDelay,
  gameThread,
  lobbyThread,
  registerTournamentPropertyHandler,
} from "./lobby";
import { handleMessageAndSendDiffs } from "./game";
import { response, type HttpResponse } from "./utils";

// ---- Types ----

interface WSMessageWithReq extends Omit<WSMessage, "replyFn"> {
  "ring-req"?: {
    user?: Record<string, unknown>;
  };
  replyFn?: (status: number, data?: unknown) => void;
}

// ---- Utility helpers ----

/**
 * Auth check endpoint (unused in current routing, kept for compatibility).
 */
export function auth(_req: unknown): HttpResponse {
  return response(200, { message: "ok" });
}

/**
 * Wrap a handler function to check that the user is a tournament organizer.
 * Mirrors: (wrap-with-to-handler handler)
 */
function wrapWithToHandler(handler: (msg: WSMessageWithReq) => void) {
  return (msg: WSMessageWithReq): void => {
    const user = msg["ring-req"]?.user;
    const replyFn = msg.replyFn;
    if (user && (user as any)["tournament-organizer"]) {
      handler(msg);
      if (replyFn) replyFn(200);
    } else {
      if (replyFn) replyFn(403);
    }
  };
}

/**
 * Get all competitive lobbies.
 * Mirrors: (get-comp-lobbies) -> (filter #(= (:room %) "competitive") (get-lobbies))
 */
function getCompLobbies(): Lobby[] {
  return getLobbies().filter((lobby) => lobby.room === "competitive");
}

/**
 * Parse a string to an integer. Mirrors jinteki.utils/str->int.
 */
function strToInt(s: string): number {
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

// ---- Instant helpers (mirrors cljc.java-time.instant) ----

/**
 * Get current instant.
 */
function instNow(): Date {
  return new Date();
}

/**
 * Check if time1 is before time2.
 */
function instIsBefore(time1: Date, time2: Date): boolean {
  return time1.getTime() < time2.getTime();
}

/**
 * Truncate instant to seconds.
 */
function instTruncatedToSeconds(inst: Date): Date {
  return new Date(Math.floor(inst.getTime() / 1000) * 1000);
}

/**
 * Add duration in minutes to an instant.
 */
function instPlusMinutes(inst: Date, minutes: number): Date {
  return new Date(inst.getTime() + minutes * 60 * 1000);
}

/**
 * Subtract duration in minutes from an instant.
 */
function instMinusMinutes(inst: Date, minutes: number): Date {
  return new Date(inst.getTime() - minutes * 60 * 1000);
}

/**
 * Add seconds to an instant.
 */
function instPlusSeconds(inst: Date, seconds: number): Date {
  return new Date(inst.getTime() + seconds * 1000);
}

/**
 * Offset a time by minutes and seconds.
 * Mirrors: (offset-time time minutes seconds)
 */
function offsetTime(time: Date, minutes: number | null | undefined, seconds: number | null | undefined): Date {
  return instPlusSeconds(instPlusMinutes(time, minutes ?? 0), seconds ?? 0);
}

// ---- Make message (mirrors game.core.say/make-message) ----

function makeMessage({ user, text, timestamp }: { user?: Record<string, unknown> | string; text?: string; timestamp?: Date }): Record<string, unknown> {
  const msgUser = user === "__system__"
    ? "__system__"
    : user
      ? { username: (user as any).username, emailhash: (user as any).emailhash }
      : {};
  return {
    user: msgUser,
    text: typeof text === "string" ? text.trim() : text ?? "",
    timestamp: timestamp ?? new Date(),
  };
}

// ---- Task scheduling (mirrors core.async based task scheduling) ----

interface ScheduledTask {
  stopTimer: ReturnType<typeof setTimeout> | null;
}

// tasks: Map<gameid, Map<taskKey, ScheduledTask>>
const tasks = new Map<string, Map<string, ScheduledTask>>();

/**
 * Cancel a scheduled task by key.
 * Mirrors: (cancel-task! keyvec)
 */
function cancelTask(gameid: string, taskKey: string): void {
  const gameTasks = tasks.get(gameid);
  if (!gameTasks) return;
  const task = gameTasks.get(taskKey);
  if (task && task.stopTimer) {
    clearTimeout(task.stopTimer);
    gameTasks.set(taskKey, { stopTimer: null });
  }
}

/**
 * Cancel all tasks for a given lobby.
 * Mirrors: (cancel-tasks-for-lobby! lobby)
 */
function cancelTasksForLobby(lobby: Lobby): void {
  const gameid = lobby.gameid as string | undefined;
  if (!gameid) return;
  const gameTasks = tasks.get(gameid);
  if (!gameTasks) return;
  gameTasks.forEach((_task, taskKey) => {
    cancelTask(gameid, taskKey);
  });
}

/**
 * Cancel all pending tasks and clear the task map.
 * Mirrors: (cancel-all-tasks!)
 */
function cancelAllTasks(): void {
  tasks.forEach((gameTasks, gameid) => {
    gameTasks.forEach((_task, taskKey) => {
      cancelTask(gameid, taskKey);
    });
  });
  tasks.clear();
}

/**
 * Schedule a task to run at a specific time.
 * If the task already exists, it is cancelled and rescheduled.
 * Mirrors: (schedule-task keyvec time f)
 */
function scheduleTask(gameid: string, taskKey: string, time: Date, f: () => void): void {
  // Do not schedule tasks in the past
  const now = instNow();
  if (instIsBefore(time, now)) return;

  cancelTask(gameid, taskKey);

  const delayMs = time.getTime() - now.getTime();
  const stopTimer = setTimeout(() => {
    f();
  }, delayMs);

  if (!tasks.has(gameid)) {
    tasks.set(gameid, new Map());
  }
  tasks.get(gameid)!.set(taskKey, { stopTimer });
}

// ---- Alert lobby (mirrors alert-lobby) ----

/**
 * Send a message to a lobby, either in-game or in-lobby.
 * Mirrors: (alert-lobby lobby msg)
 */
function alertLobby(lobby: Lobby, msg: string): void {
  const gameid = lobby.gameid as string | undefined;
  if (!gameid) return;

  const actualLobby = getLobby(gameid);
  if (!actualLobby) return;

  // If lobby is excluded, cancel its tasks
  if (actualLobby.excluded) {
    cancelTasksForLobby(actualLobby);
    return;
  }

  const timestamp = Date.now();

  if (actualLobby.started) {
    // In game - use the in-game messaging
    gameThread(actualLobby, () => {
      handleMessageAndSendDiffs(
        actualLobby,
        null,
        { uid: "TOURNAMENT SCHEDULER", username: "TOURNAMENT SCHEDULER" },
        "[!] " + msg
      );
    });
  } else {
    // In lobby - send as lobby message
    lobbyThread(() => {
      const message = makeMessage({
        user: { username: "TOURNAMENT SCHEDULER", uid: "TOURNAMENT SCHEDULER" },
        text: msg,
      });

      const newState = swapAppState((state) => {
        const lobbies = handleSendMessage(state.lobbies, gameid, message);
        return {
          ...state,
          lobbies: handleSetLastUpdate(lobbies, gameid, "TOURNAMENT SCHEDULER"),
        };
      });

      const lobbyAfter = newState.lobbies[gameid];
      sendLobbyState(lobbyAfter);
    });
  }

  logDelay(timestamp, "tournament-alert-lobby");
}

// ---- View tables (mirrors view-tables) ----

/**
 * Send tournament table view to a user.
 * Mirrors: (view-tables {:uid uid})
 */
function viewTables(uid: string): void {
  const stripPlayers = (players: Record<string, unknown>[]) =>
    players.map((p) => ({
      uid: (p as any).uid,
      side: (p as any).side,
    }));

  const compLobbies = getCompLobbies().map((l) => {
    const base: Record<string, unknown> = {};
    if (l.gameid !== undefined) base.gameid = l.gameid;
    if (l.title !== undefined) base.title = l.title;
    if (l.players !== undefined) base.players = stripPlayers(l.players);
    if (l["time-extension"] !== undefined) base["time-extension"] = l["time-extension"];
    if (l.excluded !== undefined) base["excluded?"] = l.excluded;
    return base;
  });

  broadcastTo(
    [uid],
    "tournament/view-tables",
    {
      "competitive-lobbies": compLobbies,
      "tournament-state": tournamentState(),
    }
  );
}

// ---- Schedule lobby (mirrors schedule-lobby!) ----

/**
 * Schedule tournament alerts for a lobby.
 * Mirrors: (schedule-lobby! lobby)
 */
function scheduleLobby(lobby: Lobby): void {
  const ts = tournamentState();
  if (!ts) return;

  const gameid = lobby.gameid as string | undefined;
  if (!gameid) return;

  const timeExtension = lobby["time-extension"] as number | undefined;

  const roundStart = ts["round-start"] as Date | undefined;
  const roundStartAlert = ts["round-start-alert"];
  const roundStart1mAlert = ts["round-start-1m-alert"];
  const roundEnd = ts["round-end"] as Date | undefined;
  const round20mWarning = ts["round-20m-warning"] as Date | null | undefined;
  const round5mWarning = ts["round-5m-warning"] as Date | null | undefined;
  const round1mWarning = ts["round-1m-warning"] as Date | null | undefined;
  const roundTimeCall = ts["round-time-call"] as string | undefined;
  const roundTimeExplainer = ts["round-time-explainer"] as string | null | undefined;
  const reportMatch = ts["report-match"] as string | null | undefined;

  if (roundStart && roundStartAlert) {
    scheduleTask(gameid, "round-start", roundStart, () => alertLobby(lobby, "The round has begun!"));
  }
  if (roundStart && roundStart1mAlert) {
    scheduleTask(gameid, "round-start-1m", instMinusMinutes(roundStart, 1), () => alertLobby(lobby, "The round will begin in one minute."));
  }
  if (roundEnd && roundTimeCall) {
    scheduleTask(gameid, "round-end", offsetTime(roundEnd, timeExtension, 0), () => alertLobby(lobby, roundTimeCall));
  }
  if (roundEnd && roundTimeExplainer) {
    scheduleTask(gameid, "round-explain", offsetTime(roundEnd, timeExtension, 0), () => alertLobby(lobby, roundTimeExplainer));
  }
  if (roundEnd && round1mWarning) {
    scheduleTask(gameid, "round-1m-warn", instPlusMinutes(roundEnd, (timeExtension ?? 0) - 1), () => alertLobby(lobby, "1 minute remaining in the round"));
  }
  if (roundEnd && round5mWarning) {
    scheduleTask(gameid, "round-5m-warn", instPlusMinutes(roundEnd, (timeExtension ?? 0) - 5), () => alertLobby(lobby, "5 minutes remaining in the round"));
  }
  if (roundEnd && round20mWarning) {
    scheduleTask(gameid, "round-20m-warn", instPlusMinutes(roundEnd, (timeExtension ?? 0) - 20), () => alertLobby(lobby, "20 minutes remaining in the round"));
  }
  if (roundEnd && reportMatch) {
    scheduleTask(gameid, "report-match", offsetTime(roundEnd, timeExtension, 10), () => alertLobby(lobby, "Report your match here: " + reportMatch));
  }
}

// ---- Tournament property assignment (mirrors defmethod assign-tournament-properties :default) ----

registerTournamentPropertyHandler("default", (lobby: Lobby) => {
  const gameid = lobby.gameid as string | undefined;
  if (!gameid) return;
  const lobbyObj = getLobby(gameid);
  if (!lobbyObj) return;
  if (lobbyObj.room === "competitive" && !lobbyObj["exclude?"]) {
    scheduleLobby(lobbyObj);
  }
});

// ---- Conclude round (mirrors conclude-round) ----

/**
 * Conclude the current tournament round.
 * Mirrors: (conclude-round {:uid uid})
 */
function concludeRound(msg: WSMessageWithReq): void {
  const uid = msg.uid;
  swapAppState((state) => ({ ...state, tournament: null }));
  cancelAllTasks();
  viewTables(uid ?? "");
}

// ---- Declare round (mirrors declare-round) ----

interface TournamentSettings {
  "round-start"?: {
    "start-in"?: number;
    alert?: unknown;
    "one-minute-warning"?: unknown;
  };
  round?: {
    "time-in-round"?: number;
    "twenty-minute-warning"?: boolean;
    "five-minute-warning"?: boolean;
    "one-minute-warning"?: boolean;
    "time-expiry-text"?: string;
    "explain-time-resolution"?: boolean;
    "time-expiry-rules-text"?: string;
  };
  reporting?: {
    "self-reporting"?: boolean;
    "self-reporting-url"?: string | null;
  };
}

/**
 * Declare a new tournament round.
 * Mirrors: (declare-round msg)
 */
function declareRound(msg: WSMessageWithReq): void {
  const uid = msg.uid;
  const data = msg.data as { "tournament-settings"?: TournamentSettings } | undefined;
  const tournamentSettings = data?.["tournament-settings"];

  if (tournamentState()) {
    broadcastTo(
      [uid ?? ""],
      "tournament/declare-round",
      { error: "A round is already underway" }
    );
    viewTables(uid ?? "");
    return;
  }

  const now = instTruncatedToSeconds(instNow());
  const startIn = tournamentSettings?.["round-start"]?.["start-in"] ?? 0;

  // Round start
  const roundStart = instPlusMinutes(now, startIn);
  const roundStartAlert = tournamentSettings?.["round-start"]?.alert;
  const roundStart1mAlert = startIn > 0
    ? tournamentSettings?.["round-start"]?.["one-minute-warning"]
    : undefined;

  // Round itself
  const roundLength = tournamentSettings?.round?.["time-in-round"] ?? 0;
  const roundEnd = instPlusMinutes(instPlusMinutes(now, roundLength), startIn);
  const round20MinuteWarning = tournamentSettings?.round?.["twenty-minute-warning"]
    ? instMinusMinutes(roundEnd, 20)
    : null;
  const round5MinuteWarning = tournamentSettings?.round?.["five-minute-warning"] ?? true
    ? instMinusMinutes(roundEnd, 5)
    : null;
  const round1MinuteWarning = tournamentSettings?.round?.["one-minute-warning"]
    ? instMinusMinutes(roundEnd, 1)
    : null;
  const roundTimeCall = tournamentSettings?.round?.["time-expiry-text"] ?? "-- TIME IN ROUND --";
  const roundExplainTimeResolution = tournamentSettings?.round?.["explain-time-resolution"] ?? true;
  const roundTimeExpiryRulesText =
    tournamentSettings?.round?.["time-expiry-rules-text"] ??
    "Time has been called. The active player finishes their turn, then the opposing player takes a turn. If the game has not concluded by the end of that turn, then the game is decided on agenda points.";

  // Reporting
  const showReportMatchUrl = tournamentSettings?.reporting?.["self-reporting"] ?? false;
  const reportMatchUrl = tournamentSettings?.reporting?.["self-reporting-url"] ?? null;

  // Final config
  const tournamentConfig: TournamentState = {
    "source-uid": uid,
    "round-start": roundStart,
    "round-start-alert": roundStartAlert,
    "round-start-1m-alert": roundStart1mAlert,
    "round-end": roundEnd,
    "round-20m-warning": round20MinuteWarning,
    "round-5m-warning": round5MinuteWarning,
    "round-1m-warning": round1MinuteWarning,
    "round-time-call": roundTimeCall,
    "round-time-explainer": roundExplainTimeResolution ? roundTimeExpiryRulesText : null,
    "report-match": showReportMatchUrl ? reportMatchUrl : null,
  };

  if (!tournamentState()) {
    swapAppState((state) => ({ ...state, tournament: tournamentConfig }));
    for (const lobby of getCompLobbies()) {
      if (startIn === 0 && roundStartAlert) {
        alertLobby(lobby, "The round has begun!");
      }
      scheduleLobby(lobby);
    }
  }

  viewTables(uid ?? "");
}

// ---- Update tables (mirrors update-tables) ----

interface CompetitiveLobbyUpdate {
  gameid?: string;
  excluded?: boolean;
  "time-extension"?: number;
}

/**
 * Update competitive lobby settings.
 * Mirrors: (update-tables msg)
 */
function updateTables(msg: WSMessageWithReq): void {
  const uid = msg.uid;
  const data = msg.data as { "competitive-lobbies"?: CompetitiveLobbyUpdate[] } | undefined;
  const competitiveLobbies = data?.["competitive-lobbies"] ?? [];

  // Select only gameid, excluded?, time-extension
  const cleanedLobbies = competitiveLobbies.map((l) => ({
    gameid: l.gameid,
    excluded: l.excluded,
    "time-extension": l["time-extension"],
  }));

  // Build map: gameid -> update data
  const toUpdate: Record<string, Record<string, unknown>> = {};
  for (const l of cleanedLobbies) {
    if (l.gameid) {
      toUpdate[l.gameid] = l;
    }
  }

  // Merge updates into existing lobbies
  swapAppState((state) => {
    const updatedLobbies = { ...state.lobbies };
    for (const [gameid, updates] of Object.entries(toUpdate)) {
      if (updatedLobbies[gameid]) {
        updatedLobbies[gameid] = { ...updatedLobbies[gameid], ...updates };
      }
    }
    return { ...state, lobbies: updatedLobbies };
  });

  // Reschedule all competitive lobbies
  for (const lobby of getCompLobbies()) {
    scheduleLobby(lobby);
  }

  viewTables(uid ?? "");
}

// ---- Announce (mirrors to-announce!) ----

/**
 * Send an announcement to all competitive lobbies.
 * Mirrors: (to-announce! msg)
 */
function toAnnounce(msg: WSMessageWithReq): void {
  const uid = msg.uid;
  const data = msg.data as { msg?: string } | undefined;
  const text = data?.msg ?? "";

  for (const lobby of getCompLobbies()) {
    alertLobby(lobby, text);
  }

  broadcastTo([uid ?? ""], "tournament/announce", { success: true });
}

// ---- WebSocket message handlers (mirrors defmethod ws/-msg-handler) ----

registerMsgHandler("tournament/conclude-round", (event: WSMessage) => {
  wrapWithToHandler(concludeRound)(event as WSMessageWithReq);
});

registerMsgHandler("tournament/declare-round", (event: WSMessage) => {
  wrapWithToHandler(declareRound)(event as WSMessageWithReq);
});

registerMsgHandler("tournament/view-tables", (event: WSMessage) => {
  wrapWithToHandler((msg: WSMessageWithReq) => viewTables(msg.uid ?? ""))(event as WSMessageWithReq);
});

registerMsgHandler("tournament/announce", (event: WSMessage) => {
  wrapWithToHandler(toAnnounce)(event as WSMessageWithReq);
});

registerMsgHandler("tournament/update-tables", (event: WSMessage) => {
  wrapWithToHandler(updateTables)(event as WSMessageWithReq);
});
