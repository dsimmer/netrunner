// Gameboard action dispatchers: concede, mute-spectators, leave-game, etc.
// Mirrors: src/cljs/nr/gameboard/actions.cljs
import { useAppState, currentGameID } from "../appstate";
import { useGameBoard, getLocalSide, type GameStateData } from "./state";
import { onWSEvent, wsSend, lockState, setLock } from "../ws";
import { playSfx } from "../sounds";
import { trSpan, tr } from "../translations";
import { toastrOptions } from "../utils";
import { initReplay } from "./replay";
import ReactDOMServer from "react-dom/server";

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

/**
 * Display a toast notification.
 * Mirrors: toast in actions.cljs
 */
export function toast(
  msg: string | [string, string],
  toastType: string,
  options?: Record<string, unknown>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).toastr.options = toastrOptions(options ?? {});
  const actualType = toastType === "exception" ? "error" : toastType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = (window as any).toastr[actualType];
  if (typeof f === "function") {
    if (toastType === "exception") {
      f(buildExceptionMsg(msg, useGameBoard.getState().gameState?.["last-error"] as unknown));
    } else {
      f(Array.isArray(msg) ? ReactDOMServer.renderToString(trSpan(msg)) : msg);
    }
  }
}

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------

/** Reset game state. Mirrors: reset-game! */
export function resetGame(state: GameStateData): void {
  const side = getLocalSide(state);
  useGameBoard.getState().setGameState({ ...state, side });
  setLock(false);
}

/** Initialize game state. Mirrors: init-game! */
export function initGame(state: GameStateData): void {
  const side = getLocalSide(state);
  useGameBoard.getState().setGameState(state);
  useGameBoard.setState((prev) => ({ gameState: { ...prev.gameState!, side } }));
  setLock(false);
  if ((state as Record<string, unknown>)["replay-diffs"]) {
    initReplay(useAppState.getState(), state);
    const currentGame = useAppState.getState().currentGame;
    if (currentGame) {
      useAppState.getState().setCurrentGame({ ...currentGame, started: true });
    }
  }
}

/** Launch game UI. Mirrors: launch-game! */
export function launchGame(state: GameStateData): void {
  initGame(state);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).onbeforeunload = () => "Leaving this page will disconnect you from the game.";
  const lobby = document.getElementById("gamelobby");
  const board = document.getElementById("gameboard");
  if (lobby) {
    lobby.style.transition = "opacity 0.3s";
    lobby.style.opacity = "0";
    setTimeout(() => { lobby.style.display = "none"; }, 300);
  }
  if (board) {
    board.style.display = "block";
    board.style.opacity = "0";
    requestAnimationFrame(() => {
      board.style.transition = "opacity 0.3s";
      board.style.opacity = "1";
    });
  }
}

/** Leave the current game. Mirrors: leave-game! */
export function leaveGame(): void {
  useGameBoard.getState().setGameState(null as unknown as GameStateData);
  useAppState.getState().setCurrentGame(null);
  document.body.style.cursor = "default";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).onbeforeunload = null;
  const board = document.getElementById("gameboard");
  const lobby = document.getElementById("gamelobby");
  if (board) {
    board.style.transition = "opacity 0.3s";
    board.style.opacity = "0";
    setTimeout(() => { board.style.display = "none"; }, 300);
  }
  if (lobby) {
    lobby.style.display = "block";
    lobby.style.opacity = "0";
    requestAnimationFrame(() => {
      lobby.style.transition = "opacity 0.3s";
      lobby.style.opacity = "1";
    });
  }
}

// ---------------------------------------------------------------------------
// Diff handling
// ---------------------------------------------------------------------------

/** Handle incoming state diff. Mirrors: handle-diff! */
export function handleDiff(data: { gameid?: string; diff?: unknown[] }): void {
  const diff = data.diff;
  if (diff && Array.isArray(diff)) {
    useGameBoard.getState().applyDiff(diff);
  }
  checkLock();
  const gs = useGameBoard.getState().gameState;
  if (gs) {
    const side = getLocalSide(gs);
    useGameBoard.setState({ lastGameState: { ...gs, side } });
  }
}

/** Check if we can clear client lock based on action-id. Mirrors: check-lock? */
export function checkLock(): void {
  const gs = useGameBoard.getState().gameState;
  const ls = useGameBoard.getState().lastGameState;
  if (!gs || !ls) return;
  const side = gs.side as string;
  const player = (gs[side as keyof typeof gs] as Record<string, unknown>) ?? {};
  const lastPlayer = (ls[side as keyof typeof ls] as Record<string, unknown>) ?? {};
  if (player["aid"] !== lastPlayer["aid"]) {
    setLock(false);
  }
}

// ---------------------------------------------------------------------------
// Timeout / Error handling
// ---------------------------------------------------------------------------

/** Handle game timeout. Mirrors: handle-timeout */
export function handleTimeout(gameid: string): void {
  if (gameid === currentGameID()) {
    toast(["game_inactivity", "Game closed due to inactivity"], "error", { "time-out": 0, "close-button": true });
    leaveGame();
  }
}

/** Handle game timeout warning. Mirrors: handle-timeout-soon */
export function handleTimeoutSoon(gameid: string): void {
  if (gameid === currentGameID()) {
    playSfx(["time-out"]);
    toast(["game_timeout-soon", "Game will time out within 30 seconds for inactivity"],
      "error",
      { "time-out": 29000, "close-button": true });
  }
}

/** Handle server error. Mirrors: handle-error */
export function handleError(): void {
  toast(["game_error", "Internal Server Error. Please type /bug in the chat and follow the instructions."],
    "error",
    { "time-out": 0, "close-button": true });
  setLock(false);
}

// ---------------------------------------------------------------------------
// WS event handlers
// ---------------------------------------------------------------------------

/** Register all game action WS handlers. Mirrors: defmethod event-msg-handler entries */
export function registerGameActionHandlers(): void {
  onWSEvent("game/start", (data: unknown) => {
    // Reset queueing state (mirrors angel-arena/queueing)
    const state = data as GameStateData;
    launchGame(state);
  });

  onWSEvent("game/resync", (data: unknown) => {
    const state = data as GameStateData;
    resetGame(state);
  });

  onWSEvent("game/diff", (data: unknown) => {
    const payload = data as { gameid?: string; diff?: unknown[] };
    handleDiff(payload);
  });

  onWSEvent("game/timeout", (data: unknown) => {
    const gameid = (data as { gameid?: string })?.gameid ?? String(data);
    handleTimeout(gameid);
  });

  onWSEvent("game/timeout-soon", (data: unknown) => {
    const gameid = (data as { gameid?: string })?.gameid ?? String(data);
    handleTimeoutSoon(gameid);
  });

  onWSEvent("game/error", () => {
    handleError();
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Send a command to the server.
 * Mirrors: send-command in actions.cljs
 */
export function sendCommand(
  command: string,
  args?: { noLock?: boolean; card?: Record<string, unknown>; [key: string]: unknown },
): void {
  const gs = useGameBoard.getState().gameState;
  if (gs?.replay) return;
  if (lockState.lock && !args?.noLock) return;

  const card = args?.card
    ? {
        cid: args.card.cid,
        zone: args.card.zone,
        side: args.card.side,
        host: args.card.host,
        type: args.card.type,
      }
    : undefined;

  const mergedArgs = card ? { ...args, card } : args;
  if (!args?.noLock) {
    setLock(true);
  }

  const gameid = currentGameID();
  if (gameid) {
    wsSend("game/action", {
      gameid,
      command,
      args: mergedArgs ?? {},
    });
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Mute spectators. Mirrors: mute-spectators */
export function muteSpectators(): void {
  const gs = useGameBoard.getState().gameState;
  if (!gs?.replay) {
    const gameid = currentGameID();
    if (gameid) {
      wsSend("game/mute-spectators", { gameid });
    }
  }
}

/** Toggle stacked cards option. Mirrors: stack-cards */
export function stackCards(): void {
  useAppState.setState((prev) => ({
    options: {
      ...prev.options,
      "stacked-cards": !(prev.options["stacked-cards"] as boolean),
    },
  }));
}

/** Concede the game. Mirrors: concede */
export function concede(): void {
  const gs = useGameBoard.getState().gameState;
  if (!gs?.replay) {
    const gameid = currentGameID();
    if (gameid) {
      wsSend("game/concede", { gameid });
    }
  }
}

// ---------------------------------------------------------------------------
// Exception reporting
// ---------------------------------------------------------------------------

/**
 * Build an exception report message with a GitHub issue link.
 * Mirrors: build-exception-msg
 */
export function buildExceptionMsg(msg: string | [string, string], error?: unknown): string {
  const body = encodeURIComponent(
    `Please describe the circumstances of your error here.\n\n\nStack Trace:\n\`\`\`clojure\n${String(error ?? "")}\n\`\`\``,
  );
  const translated = Array.isArray(msg) ? tr(msg) : msg;
  return `<div>${translated}<br><a class="button reportbtn" href="https://github.com/mtgred/netrunner/issues/new?body=${body}" target="_blank" style="margin-top:5px">${tr(["game_report-on-github", "Report on Github"])}</a></div>`;
}

// ---------------------------------------------------------------------------
// Toast acknowledgment
// ---------------------------------------------------------------------------

/** Acknowledge a toast by sending a command to clear server-side toasts. Mirrors: ack-toast */
export function ackToast(id: number): void {
  sendCommand("toast", { id });
}
