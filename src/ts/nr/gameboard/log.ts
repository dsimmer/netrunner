// In-game chat log utilities: command completions, fuzzy matching, message sending.
// Mirrors: src/cljs/nr/gameboard/log.cljs (non-component portions)

import { commandInfo, type CommandInfo } from "../../jinteki/utils";
import { AllCards } from "../../jinteki/cards";
import { wsSend } from "../ws";
import { currentGameID, useAppState } from "../appstate";
import { useGameBoard, notSpectator } from "./state";

// ---------------------------------------------------------------------------
// Commands / command-info-map
// ---------------------------------------------------------------------------

export const commands: string[] = Array.from(new Set(commandInfo.map((c) => c.name)));

export const commandInfoMap: Record<
  string,
  Pick<CommandInfo, "hasArgs" | "usage" | "help">
> = (() => {
  const map: Record<string, Pick<CommandInfo, "hasArgs" | "usage" | "help">> = {};
  for (const info of commandInfo) {
    map[info.name] = {
      hasArgs: info.hasArgs,
      usage: info.usage,
      help: info.help,
    };
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Scroll helpers
// ---------------------------------------------------------------------------

export function scrolledToEnd(el: HTMLElement, tolerance: number): boolean {
  return tolerance > (el.scrollHeight - el.scrollTop - el.clientHeight);
}

export interface ShouldScrollState {
  update: boolean;
  sendMsg: boolean;
}

// ---------------------------------------------------------------------------
// send-msg / send-typing
// ---------------------------------------------------------------------------

export interface LogState {
  msg?: string;
  completions?: Completion[] | null;
  completionHighlight?: number | null;
}

export function sendMsg(state: React.MutableRefObject<LogState>): void {
  const text = state.current.msg ?? "";
  const gameState = useGameBoard.getState().gameState;
  if (gameState?.replay) return;
  if (!text || text.length === 0) return;

  const gameid = currentGameID();
  if (gameid) {
    wsSend("game/say", { gameid, msg: text });
  }
  state.current.msg = "";
}

/**
 * Send a typing event to server for this user if it is not already set in game state
 * AND user is not a spectator.
 */
export function sendTyping(state: React.MutableRefObject<LogState>): void {
  const gameState = useGameBoard.getState().gameState;
  if (gameState?.replay) return;

  const typing = (state.current.msg ?? "").length > 0;
  const currentTyping = !!gameState?.typing;

  // only send if the typing state is different
  if ((currentTyping === typing) || !notSpectator(gameState)) return;

  const gameid = currentGameID();
  if (gameid) {
    wsSend("game/typing", { gameid, typing });
  }
}

// ---------------------------------------------------------------------------
// Fuzzy matching
// ---------------------------------------------------------------------------

/**
 * Matches if all characters in input appear in target in order.
 * Score is sum of matched indices, lower is a better match. Scoring is case insensitive.
 * Unicode NFKD normalization is used to allow fuzzy matching against composite unicode glyphs.
 */
export function fuzzyMatchScore(input: string, target: string): number | null {
  const normInput = input.toLowerCase().normalize("NFKD");
  const normTarget = target.toLowerCase().normalize("NFKD");

  let targetIndex = normTarget.indexOf(normInput[0], 0);
  if (targetIndex < 0) return null;

  let score = targetIndex;
  let restInput = normInput.slice(1);

  while (restInput.length > 0) {
    const nextIndex = normTarget.indexOf(restInput[0], targetIndex + 1);
    if (nextIndex < 0) return null;
    score += nextIndex;
    targetIndex = nextIndex;
    restInput = restInput.slice(1);
  }

  return score;
}

export function findMatches<T extends string>(potentialMatches: T[], pattern: string): T[] {
  const scored = potentialMatches
    .map((target) => ({ match: target, score: fuzzyMatchScore(pattern, target) }))
    .filter((s): s is { match: T; score: number } => s.score != null)
    .sort((a, b) => a.score - b.score)
    .slice(0, 10);
  return scored.map((s) => s.match);
}

// ---------------------------------------------------------------------------
// Completion types
// ---------------------------------------------------------------------------

export interface Completion {
  completionText: string;
  displayText: string;
}

export function showCompletions(state: LogState): boolean {
  return !!(state.completions && state.completions.length > 0);
}

export function resetCompletions(state: React.MutableRefObject<LogState>): void {
  state.current.completions = null;
  state.current.completionHighlight = null;
}

export function fillCompletion(state: React.MutableRefObject<LogState>, completionText: string): void {
  state.current.msg = `${completionText} `;
  resetCompletions(state);
}

export function isCommand(completion: string): boolean {
  return completion in commandInfoMap;
}

export function hasArgs(completion: string): boolean {
  return commandInfoMap[completion]?.hasArgs != null;
}

/**
 * Commands with arguments do not autosend.
 * Other completion types (commands with no args, card completions) do autosend.
 */
export function autosend(completion: string): boolean {
  if (isCommand(completion) && hasArgs(completion)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Completions keyboard handler
// ---------------------------------------------------------------------------

export function completionsKeyDownHandler(
  state: React.MutableRefObject<LogState>,
  e: React.KeyboardEvent<HTMLInputElement>,
  onSendMsg: (state: React.MutableRefObject<LogState>) => void,
): void {
  if (!showCompletions(state.current)) return;

  const key = e.key;
  const completions = state.current.completions ?? [];
  const completionsCount = completions.length;

  if (key === "ArrowDown") {
    e.preventDefault();
    const current = state.current.completionHighlight;
    state.current.completionHighlight = current !== null ? (current + 1) % completionsCount : 0;
  } else if (key === "ArrowUp") {
    if (state.current.completionHighlight != null) {
      e.preventDefault();
      const current = state.current.completionHighlight;
      state.current.completionHighlight = current > 0 ? (current - 1) % completionsCount : 0;
    }
  } else if (key === "Enter" || key === " " || key === "ArrowRight" || key === "Tab") {
    if (completionsCount === 1 || state.current.completionHighlight != null) {
      const useIndex = completionsCount === 1 ? 0 : (state.current.completionHighlight ?? 0);
      const completion = completions[useIndex].completionText;
      e.preventDefault();
      fillCompletion(state, completion);
      // auto send when Enter and no args needed
      if (key === "Enter" && autosend(completion)) {
        onSendMsg(state);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Command / card completion functions
// ---------------------------------------------------------------------------

export function completeCommand(state: React.MutableRefObject<LogState>, input: string): void {
  const matches = findMatches(commands, input);
  state.current.completions = matches.map((match) => ({
    completionText: match,
    displayText: commandInfoMap[match]?.usage ?? match,
  }));
}

function filterSide(entry: [string, Record<string, unknown>]): boolean {
  const gameState = useGameBoard.getState().gameState;
  const side = gameState?.side;
  if (side === "corp") return (entry[1].side as string) === "Corp";
  if (side === "runner") return (entry[1].side as string) === "Runner";
  return true;
}

export function completeCardname(
  state: React.MutableRefObject<LogState>,
  fullInput: string,
  cardInput: string,
): void {
  const cardnames = Object.keys(AllCards).filter(
    (name) => filterSide([name, AllCards[name]]),
  );
  const matches = findMatches(cardnames, cardInput);
  const complete = (match: string) => fullInput.replace(cardInput, match);

  state.current.completions = matches.map((match) => ({
    completionText: complete(match),
    displayText: match,
  }));
}

export function completeIdentity(
  state: React.MutableRefObject<LogState>,
  fullInput: string,
  cardInput: string,
): void {
  const cardnames = Object.keys(AllCards).filter(
    (name) => {
      const card = AllCards[name];
      return filterSide([name, card]) && (card.type as string) === "Identity";
    },
  );
  const matches = findMatches(cardnames, cardInput);
  const complete = (match: string) => fullInput.replace(cardInput, match);

  state.current.completions = matches.map((match) => ({
    completionText: complete(match),
    displayText: match,
  }));
}

// ---------------------------------------------------------------------------
// Log input change handler
// ---------------------------------------------------------------------------

export function logInputChangeHandler(
  state: React.MutableRefObject<LogState>,
  e: React.ChangeEvent<HTMLInputElement>,
): void {
  resetCompletions(state);
  const input = e.target.value;

  if (input.startsWith("/summon ")) {
    const card = input.replace("/summon ", "");
    completeCardname(state, input, card);
  } else if (input.startsWith("/replace-id ")) {
    const card = input.replace("/replace-id ", "");
    completeIdentity(state, input, card);
  } else if (input[0] === "/") {
    completeCommand(state, input);
  }

  state.current.msg = input;
  // (send-typing state); // commented out in original CLJS too
}

// ---------------------------------------------------------------------------
// Timestamp formatting helpers
// ---------------------------------------------------------------------------

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const timeStr = date.toLocaleTimeString();
  // Remove AM/PM suffix (matches CLJS regex #"\s\w*")
  return timeStr.replace(/\s\w*$/, "");
}

// ---------------------------------------------------------------------------
// Card preview zoom channel — re-exported from card_preview.ts
// (mirrors card_preview.cljs; centralized there to match CLJS module layout)
// ---------------------------------------------------------------------------

export {
  setZoomChannelCallback,
  zoomChannelPut,
  cardPreviewMouseOver,
  cardPreviewMouseOut,
} from "./card_preview";
