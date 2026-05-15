// In-game message log panel.
// Mirrors: src/cljs/nr/gameboard/log.cljs (component portions)
import React, { useRef, useState, useEffect, useCallback } from "react";
import { useGameBoard, notSpectator, type GameStateData } from "./state";
import { useAppState, currentGameID } from "../appstate";
import { Avatar } from "../avatar";
import { tr, trSpan } from "../translations";
import { influenceDot, renderMessage, renderPlayerHighlight, playerHighlightOptionClass } from "../utils";
import { wsSend } from "../ws";
import {
  scrolledToEnd,
  type ShouldScrollState,
  type Completion,
  type LogState,
  showCompletions,
  resetCompletions,
  fillCompletion,
  completionsKeyDownHandler,
  logInputChangeHandler,
  formatTimestamp,
  cardPreviewMouseOver,
  cardPreviewMouseOut,
  sendMsg,
} from "./log";

// ---------------------------------------------------------------------------
// IndicateAction button
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
// ---------------------------------------------------------------------------

function ShowDecklists(): React.ReactElement | null {
  const currentGame = useAppState((s) => s.currentGame);
  if (!currentGame || !(currentGame as Record<string, unknown>)["open-decklists"]) return null;

  const appState = useAppState.getState() as unknown as Record<string, unknown>;
  const displayDecklists = appState["display-decklists"] as boolean | undefined;

  return (
    <button
      className="show-decklists"
      type="button"
      onClick={(e) => {
        e.preventDefault();
        useAppState.setState((s) => ({
          ...s,
          ["display-decklists" as keyof typeof s]: !(s as Record<string, unknown>)["display-decklists"],
        }));
      }}
    >
      {trSpan(["game_show-decklists", "Show/Hide decklists"])}
    </button>
  );
}

// ---------------------------------------------------------------------------
// LogTyping indicator
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
// ---------------------------------------------------------------------------

interface CompletionsProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  stateRef: React.RefObject<LogState>;
}

function Completions({ inputRef, stateRef }: CompletionsProps): React.ReactElement | null {
  const state = stateRef.current;
  if (!showCompletions(state)) return null;

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
// ---------------------------------------------------------------------------

interface AvatarUser {
  emailhash?: string;
  username?: string;
}

function formatSystemTimestamp(
  timestamp: number | undefined,
  text: string,
  corp: string,
  runner: string,
): React.ReactNode {
  const options = useAppState((s) => s.options) as Record<string, unknown>;
  const logTimestamps = options?.["log-timestamps"] as boolean | undefined;

  let displayedText: React.ReactNode = renderPlayerHighlight(text, corp, runner);
  if (logTimestamps && timestamp != null) {
    const ts = `[${formatTimestamp(timestamp)}]`;
    displayedText = renderMessage(renderPlayerHighlight(text, corp, runner, ts));
  }
  return renderMessage(displayedText);
}

function formatUserTimestamp(
  timestamp: number | undefined,
  user: { username: string },
): React.ReactElement {
  const options = useAppState((s) => s.options) as Record<string, unknown>;
  const logTimestamps = options?.["log-timestamps"] as boolean | undefined;

  if (logTimestamps && timestamp != null) {
    return (
      <div className="timestamp-wrapper">
        <div className="username">{user.username}</div>
        <div className={`timestamp`}>[{formatTimestamp(timestamp)}]</div>
      </div>
    );
  }
  return <div className="username">{user.username}</div>;
}

// ---------------------------------------------------------------------------
// LogMessages (scrollable chat history)
// ---------------------------------------------------------------------------

interface LogEntry {
  user: string | { username: string };
  text: string;
  timestamp?: number;
}

function LogMessages(): React.ReactElement {
  const gameState = useGameBoard((s) => s.gameState);
  const log = (gameState?.log as LogEntry[]) ?? [];
  const corp = (gameState?.corp?.user as { username?: string })?.username ?? "";
  const runner = (gameState?.runner?.user as { username?: string })?.username ?? "";

  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [shouldScroll, setShouldScroll] = useState<ShouldScrollState>({ update: true, sendMsg: false });
  const prevLogLength = useRef(log.length);

  // Auto-scroll on mount
  useEffect(() => {
    if (shouldScroll.update && nodeRef.current) {
      nodeRef.current.scrollTop = nodeRef.current.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if user was scrolled to end before update
  useEffect(() => {
    if (nodeRef.current) {
      setShouldScroll({
        update: shouldScroll.sendMsg || scrolledToEnd(nodeRef.current, 15),
        sendMsg: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log]);

  // Auto-scroll after update
  useEffect(() => {
    if (shouldScroll.update && nodeRef.current) {
      nodeRef.current.scrollTop = nodeRef.current.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldScroll.update]);

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
              {formatSystemTimestamp(timestamp, entry.text, corp, runner)}
            </div>
          );
        }

        return (
          <div className="message" key={timestamp ?? idx}>
            <Avatar user={{ username: user, emailhash: undefined } as { emailhash?: string; username?: string }} opts={{ size: 38 }} />
            <div className="content">
              {formatUserTimestamp(timestamp, { username: user })}
              <div>{renderMessage(entry.text)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LogPane (main export)
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
