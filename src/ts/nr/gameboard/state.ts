// Game state management for the board.
// Mirrors: src/cljs/nr/gameboard/state.cljs
import { create } from "zustand";
import { useAppState } from "../appstate";
import { onWSEvent, wsSend } from "../ws";
import { jsonPatch, type JsonPatchOp } from "./replay";
import { toastrOptions } from "../utils";
import { trSpan } from "../translations";
import ReactDOMServer from "react-dom/server";


export interface CardState {
  cid?: string;
  title?: string;
  type?: string;
  side?: string;
  rezzed?: boolean;
  counters?: Record<string, number>;
  "advance-counter"?: number;
  strength?: number;
  "current-strength"?: number;
  subroutines?: Array<{ label: string; broken: boolean; printed: boolean }>;
  [key: string]: unknown;
}

export interface PromptState {
  prompt?: string;
  choices?: Array<string | { text: string; value: unknown }>;
  "card-title"?: string;
  type?: string;
}

export interface PlayerState {
  user?: { username: string; _id: string };
  identity?: CardState;
  hand?: CardState[];
  deck?: CardState[];
  discard?: CardState[];
  scored?: CardState[];
  rfg?: CardState[];
  current?: CardState[];
  "set-aside"?: CardState[];
  "play-area"?: CardState[];
  click?: number;
  "click-per-turn"?: number;
  credit?: number;
  "agenda-point"?: number;
  "agenda-point-req"?: number;
  "hand-size"?: number;
  tag?: number | { "base": number; "total": number; "is-tagged": boolean };
  "bad-publicity"?: number | { "base": number };
  keep?: boolean;
  quote?: string;
  servers?: Record<string, unknown>;
  rig?: Record<string, unknown>;
  "prompt-state"?: PromptState;
  [key: string]: unknown;
}

export interface GameStateData {
  gameid?: string;
  corp?: PlayerState;
  runner?: PlayerState;
  run?: unknown;
  turn?: number;
  "active-player"?: string;
  log?: Array<{ user: string | { username: string }; text: string }>;
  winner?: string;
  "win-reason"?: string;
  typing?: boolean;
  side?: string;
  replay?: boolean;
  "sfx"?: unknown[];
  [key: string]: unknown;
}

interface GameBoardStore {
  gameState: GameStateData | null;
  lastGameState: GameStateData | null;
  replaySide: "corp" | "runner" | "spectator";
  setGameState: (state: GameStateData) => void;
  setReplaySide: (side: "corp" | "runner" | "spectator") => void;
  applyDiff: (diff: JsonPatchOp[]) => void;
}

export const useGameBoard = create<GameBoardStore>((set, get) => ({
  gameState: null,
  lastGameState: null,
  replaySide: "spectator",
  setGameState: (state) => {
    const side = getLocalSide(state);
    set({ gameState: { ...state, side }, lastGameState: { ...state, side } });
  },
  setReplaySide: (side) => set({ replaySide: side }),
  applyDiff: (diff) => {
    const current = get().gameState;
    if (current && diff && diff.length > 0) {
      const patched = jsonPatch(current, diff);
      const side = getLocalSide(patched);
      set({
        gameState: { ...patched, side },
        lastGameState: { ...patched, side },
      });
      // Check for new toasts after applying diff
      checkToasts(get().lastGameState, { ...patched, side });
    }
  },
}));

// Toast interface from server
interface ServerToast {
  id?: number;
  msg?: string | [string, string];
  type?: string;
  options?: Record<string, unknown>;
}

// Display a server toast
function displayServerToast(
  msg: string | [string, string],
  toastType: string,
  options?: Record<string, unknown>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).toastr.options = toastrOptions(options ?? {});
  const actualType = toastType === "exception" ? "error" : toastType;
  const f = (window as any).toastr[actualType];
  if (typeof f === "function") {
    const rendered = Array.isArray(msg)
      ? ReactDOMServer.renderToString(trSpan(msg))
      : msg;
    f(rendered);
  }
}

// Send ack for a toast (mirrors ack-toast)
function ackToast(id: number): void {
  const gameid = useAppState.getState().currentGame?.gameid ?? null;
  if (gameid) {
    wsSend("game/action", {
      gameid,
      command: "toast",
      args: { id },
    });
  }
}

/** Check for new toasts in game state and display them. Mirrors handle-toasts-changed. */
export function checkToasts(
  lastState: GameStateData | null,
  newState: GameStateData | null,
): void {
  if (!newState || !lastState) return;
  const side = (newState.side as string) ?? "spectator";
  const lastToasts = (lastState[side as keyof typeof lastState] as { toast?: ServerToast[] })?.toast ?? [];
  const newToasts = (newState[side as keyof typeof newState] as { toast?: ServerToast[] })?.toast ?? [];
  if (newToasts.length !== lastToasts.length) {
    for (const t of newToasts) {
      if (t.msg && t.type) {
        displayServerToast(t.msg, t.type, t.options as Record<string, unknown> | undefined);
      }
      if (t.id != null) {
        ackToast(t.id);
      }
    }
  }
}

// Determine which side the local user is playing
export function getLocalSide(gameState: GameStateData | null): "corp" | "runner" | "spectator" {
  if (!gameState) return "spectator";
  const userId = useAppState.getState().user?._id as string | undefined;
  if (!userId) return "spectator";
  if (gameState.corp?.user?._id === userId) return "corp";
  if (gameState.runner?.user?._id === userId) return "runner";
  return "spectator";
}

export function notSpectator(gameState: GameStateData | null): boolean {
  return getLocalSide(gameState) !== "spectator";
}

// Register WS handlers for basic game state events
// (game/diff, game/start, game/timeout etc. are registered in actions.ts)
export function registerGameStateHandlers(): void {
  onWSEvent("game/state", (data: unknown) => {
    const state = data as GameStateData;
    useGameBoard.getState().setGameState(state);
  });

  onWSEvent("game/typing", (data: unknown) => {
    const current = useGameBoard.getState().gameState;
    if (current) {
      const side = getLocalSide(current);
      useGameBoard.getState().setGameState({ ...current, typing: data as boolean, side });
    }
  });
}
