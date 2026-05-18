// In-game message log panel and chat utilities.
// Mirrors: src/cljs/nr/gameboard/log.cljs
import React, { useRef, useState, useEffect, useCallback } from "react";
import { useGameBoard, notSpectator } from "./state";
import { useAppState, currentGameID } from "../appstate";
import { Avatar } from "../avatar";
import { tr, trSpan } from "../translations";
import {
  influenceDot,
  renderMessage,
  renderPlayerHighlight,
  playerHighlightOptionClass,
} from "../utils";
import { wsSend } from "../ws";
import { commandInfo, type CommandInfo } from "../../jinteki/utils";
import { AllCards } from "../../jinteki/cards";
import {
  cardPreviewMouseOver,
  cardPreviewMouseOut,
} from "./card_preview";

// ---------------------------------------------------------------------------
// Commands / command-info-map
// Mirrors: commands, command-info-map
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
// Mirrors: scrolled-to-end?, should-scroll
// ---------------------------------------------------------------------------

export function scrolledToEnd(el: HTMLElement, tolerance: number): boolean {
  return tolerance > (el.scrollHeight - el.scrollTop - el.clientHeight);
}

export interface ShouldScrollState {
  update: boolean;
  sendMsg: boolean;
}

// Module-level scroll tracking atom (mirrors should-scroll r/atom)
const shouldScroll: ShouldScrollState = { update: true, sendMsg: false };

// ---------------------------------------------------------------------------
// Chat input state
// ---------------------------------------------------------------------------

export interface Completion {
  completionText: string;
  displayText: string;
}

export interface LogState {
  msg?: string;
  completions?: Completion[] | null;
  completionHighlight?: number | null;
}

// ---------------------------------------------------------------------------
// send-msg / send-typing
// ---------------------------------------------------------------------------

export function sendMsg(state: React.MutableRefObject<LogState>): void {
  const text = state.current.msg ?? "";
  const gameState = useGameBoard.getState().gameState;
  if (gameState?.replay) return;
  if (!text || text.length === 0) return;

  shouldScroll.update = false;
  shouldScroll.sendMsg = true;

  const gameid = currentGameID();
  if (gameid) {
    wsSend("game/say", { gameid, msg: text });
  }
  state.current.msg = "";
}

/**
 * Send a typing event to server for this user if it is not already set in game state
 * AND user is not a spectator.
 * Mirrors: send-typing
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
// Mirrors: fuzzy-match-score, find-matches
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
// Completion helpers
// Mirrors: show-completions?, reset-completions, fill-completion,
//          is-command?, has-args?, autosend?
// ---------------------------------------------------------------------------

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
// Mirrors: completions-key-down-handler
// ---------------------------------------------------------------------------

// Clojure-style mod: result always non-negative
function modN(n: number, m: number): number {
  return ((n % m) + m) % m;
}

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
    state.current.completionHighlight = current != null ? modN(current + 1, completionsCount) : 0;
  } else if (key === "ArrowUp") {
    if (state.current.completionHighlight != null) {
      e.preventDefault();
      const current = state.current.completionHighlight;
      state.current.completionHighlight = modN(current - 1, completionsCount);
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
// Mirrors: complete-command, filter-side, complete-cardname, complete-identity
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
// Mirrors: log-input-change-handler
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
// Mirrors: (string/replace (.toLocaleTimeString (js/Date. timestamp)) #"\s\w*" "")
// ---------------------------------------------------------------------------

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const timeStr = date.toLocaleTimeString();
  // Mirrors the Clojure regex #"\s\w*" — replace all space + word-char sequences
  return timeStr.replace(/\s\w*/g, "");
}

// ---------------------------------------------------------------------------
// IndicateAction button
// Mirrors: indicate-action
// ---------------------------------------------------------------------------

function IndicateAction(): React.ReactElement | null {
  const gameState = useGameBoard((s) => s.gameState);
  if (!notSpectator(gameState)) return null;

  return (
    <button
      className="indicate-action"
      type="button"
      onClick={(e) => {
        e.preventDefault();
        const gameid = currentGameID();
        if (gameid) {
          wsSend("game/action", { gameid, command: "indicate-action", args: {} });
        }
      }}
    >
      {trSpan(["game_indicate-action", "Indicate paid ability"])}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ShowDecklists button
// Mirrors: show-decklists
// ---------------------------------------------------------------------------

function ShowDecklists(): React.ReactElement | null {
  const currentGame = useAppState((s) => s.currentGame);
  if (!currentGame || !(currentGame as Record<string, unknown>)["open-decklists"]) return null;

  return (
    <button
      className="show-decklists"
      type="button"
      onClick={(e) => {
        e.preventDefault();
        useAppState.setState((s) => ({
          ...s,
          ["display-decklists" as keyof typeof s]: !(s as unknown as Record<string, unknown>)["display-decklists"],
        }));
      }}
    >
      {trSpan(["game_show-decklists", "Show/Hide decklists"])}
    </button>
  );
}

// ---------------------------------------------------------------------------
// LogTyping indicator
// Mirrors: log-typing
// ---------------------------------------------------------------------------

function LogTyping(): React.ReactElement | null {
  const typing = useGameBoard((s) => s.gameState?.typing);
  if (!typing) return null;

  return (
    <div>
      <p className="typing">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i}> {influenceDot} </span>
        ))}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Completions dropdown
// Mirrors: completions
// ---------------------------------------------------------------------------

interface CompletionsProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  stateRef: React.MutableRefObject<LogState>;
}

function Completions({ inputRef, stateRef }: CompletionsProps): React.ReactElement | null {
  const state = stateRef.current;
  if (!state || !showCompletions(state)) return null;

  return (
    <div
      className="command-matches-container panel blue-shade"
      onMouseLeave={() => {
        stateRef.current.completionHighlight = null;
      }}
    >
      <ul className="command-matches">
        {(state.completions ?? []).map((completion: Completion, i: number) => (
          <li
            key={completion.completionText}
            className={`command-match${i === state.completionHighlight ? " highlight" : ""}`}
          >
            <span
              onMouseOver={() => { stateRef.current.completionHighlight = i; }}
              onClick={() => {
                fillCompletion(stateRef, completion.completionText);
                inputRef.current?.focus();
              }}
            >
              {completion.displayText}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LogInput (message input field)
// Mirrors: log-input
// ---------------------------------------------------------------------------

function LogInput(): React.ReactElement | null {
  const currentGame = useAppState((s) => s.currentGame);
  const gameState = useGameBoard((s) => s.gameState);

  // Spectators can type unless mutespectators is enabled
  const isSpectator = !notSpectator(gameState);
  const muteSpectators = ((currentGame as Record<string, unknown>)?.["mutespectators"] as boolean | undefined);
  if (isSpectator && muteSpectators) return null;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<LogState>({});
  const stateRef = useRef<LogState>(state);

  // Keep ref in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const handleSend = useCallback(() => {
    sendMsg(stateRef);
    setState({ ...stateRef.current, msg: "" });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resetCompletions(stateRef);
    handleSend();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    completionsKeyDownHandler(stateRef, e, handleSend);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    logInputChangeHandler(stateRef, e);
    setState({ ...stateRef.current });
  };

  return (
    <div className="log-input">
      <div className="form-container">
        <form onSubmit={handleSubmit}>
          <input
            id="log-input"
            placeholder={tr(["chat_placeholder", "Say something..."])}
            data-i18n-key="chat_placeholder"
            type="text"
            autoComplete="off"
            ref={inputRef}
            value={state.msg ?? ""}
            onKeyDown={handleKeyDown}
            onChange={handleChange}
          />
        </form>
      </div>
      <IndicateAction />
      <ShowDecklists />
      <Completions inputRef={inputRef} stateRef={stateRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timestamp formatting (for log messages)
// Mirrors: format-system-timestamp, format-user-timestamp
// ---------------------------------------------------------------------------

function formatSystemTimestamp(
  timestamp: number | undefined,
  text: string,
  corp: string,
  runner: string,
  logTimestamps: boolean,
): React.ReactNode {
  if (logTimestamps && timestamp != null) {
    const ts = `[${formatTimestamp(timestamp)}]`;
    return renderMessage(renderPlayerHighlight(text, corp, runner, ts) as unknown as string) as React.ReactNode;
  }
  return renderMessage(renderPlayerHighlight(text, corp, runner) as unknown as string) as React.ReactNode;
}

function formatUserTimestamp(
  timestamp: number | undefined,
  user: { username: string },
  logTimestamps: boolean,
): React.ReactElement {
  if (logTimestamps && timestamp != null) {
    return (
      <div className="timestamp-wrapper">
        <div className="username">{user.username}</div>
        <div className="timestamp">[{formatTimestamp(timestamp)}]</div>
      </div>
    );
  }
  return <div className="username">{user.username}</div>;
}

// ---------------------------------------------------------------------------
// LogMessages (scrollable chat history)
// Mirrors: log-messages
// ---------------------------------------------------------------------------

interface LogEntry {
  user: string | { username: string };
  text: string;
  timestamp?: number;
}

function LogMessages(): React.ReactElement {
  const gameState = useGameBoard((s) => s.gameState);
  const options = useAppState((s) => s.options) as Record<string, unknown> | undefined;
  const logTimestamps = !!(options?.["log-timestamps"]);
  const log = (gameState?.log as LogEntry[]) ?? [];
  const corp = (gameState?.corp?.user as { username?: string })?.username ?? "";
  const runner = (gameState?.runner?.user as { username?: string })?.username ?? "";

  const nodeRef = useRef<HTMLDivElement | null>(null);

  // component-did-mount + component-did-update: scroll to bottom if should-scroll.update
  useEffect(() => {
    if (shouldScroll.update && nodeRef.current) {
      nodeRef.current.scrollTop = nodeRef.current.scrollHeight;
    }
  });

  // component-will-update equivalent: before log changes, check if user is at bottom
  // (run as a layout effect on log change tracking)
  const prevLogLength = useRef(log.length);
  useEffect(() => {
    if (prevLogLength.current !== log.length && nodeRef.current) {
      shouldScroll.update = shouldScroll.sendMsg || scrolledToEnd(nodeRef.current, 15);
      shouldScroll.sendMsg = false;
    }
    prevLogLength.current = log.length;
  }, [log.length]);

  return (
    <div
      className={`messages ${gameState?.replay ? "panel-bottom" : ""} ${
        playerHighlightOptionClass() ?? ""
      }`.trim()}
      ref={nodeRef}
      onMouseOver={(e) => cardPreviewMouseOver(e as unknown as React.MouseEvent)}
      onMouseOut={(e) => cardPreviewMouseOut(e as unknown as React.MouseEvent)}
      aria-live="polite"
    >
      {log.map((entry: LogEntry, idx: number) => {
        const user = typeof entry.user === "string" ? entry.user : entry.user.username;
        const timestamp = entry.timestamp;

        if (user === "__system__") {
          return (
            <div className="system" key={timestamp ?? idx}>
              {formatSystemTimestamp(timestamp, entry.text, corp, runner, logTimestamps)}
            </div>
          );
        }

        return (
          <div className="message" key={timestamp ?? idx}>
            <Avatar user={{ username: user, emailhash: undefined }} opts={{ size: 38 }} />
            <div className="content">
              {formatUserTimestamp(timestamp, { username: user }, logTimestamps)}
              <div>{renderMessage(entry.text) as React.ReactNode}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LogPane (main export)
// Mirrors: log-pane
// ---------------------------------------------------------------------------

export function GameLog(): React.ReactElement {
  return (
    <div className="log">
      {/* <InactivityPane /> */}
      <LogMessages />
      <LogTyping />
      <LogInput />
    </div>
  );
}

export default GameLog;
