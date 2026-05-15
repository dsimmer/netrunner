// Angel Arena in-game log: inactivity pane, time controls, victory claim.
// Mirrors: src/cljs/nr/angel_arena/log.cljs
import React from "react";
import { useAppState, currentGameID } from "../appstate";
import { useGameBoard, notSpectator } from "../gameboard/state";
import { tr } from "../translations";
import { timeSpanString } from "../utils";
import { wsSend } from "../ws";

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

export function moreTime(): void {
  const gameid = currentGameID();
  if (gameid) {
    wsSend("angel-arena/more-time", { gameid });
  }
}

export function claimVictory(): void {
  const gameid = currentGameID();
  if (gameid) {
    wsSend("angel-arena/claim-victory", { gameid });
  }
}

export function cancelMatch(): void {
  const gameid = currentGameID();
  if (gameid) {
    wsSend("angel-arena/cancel-match", { gameid });
  }
}

// ---------------------------------------------------------------------------
// InactivityPane
// ---------------------------------------------------------------------------

export function InactivityPane(): React.ReactElement | null {
  const username = useAppState((s) => (s.user as Record<string, unknown> | null)?.username as string | undefined);
  const gameState = useGameBoard((s) => s.gameState);

  const angelArenaInfo = gameState
    ? (gameState["angel-arena-info"] as Record<string, unknown> | undefined)
    : undefined;
  const inactivityWarning = angelArenaInfo
    ? (angelArenaInfo["inactivity-warning"] as Record<string, unknown> | undefined)
    : undefined;

  if (!inactivityWarning) return null;

  const stage = inactivityWarning["stage"] as string | undefined;
  const inactiveSide = inactivityWarning["inactive-side"] as string | undefined;
  const inactiveUser = inactivityWarning["inactive-user"] as { username: string } | undefined;
  const warningTime = inactivityWarning["warning-time"] as string | number | undefined;
  const periodToReact = inactivityWarning["period-to-react"] as number | undefined;

  const inactiveSideKw = inactiveSide ? (inactiveSide.startsWith(":") ? inactiveSide.slice(1) : inactiveSide) : undefined;
  const inactivityCounter = angelArenaInfo
    ? (angelArenaInfo["inactivity-counter"] as Record<string, number> | undefined)
    : undefined;
  const inactivitiesRemaining = (inactivityCounter?.[inactiveSideKw ?? ""] ?? 1) as number;

  const isNotSpectator = notSpectator(gameState);

  if (!stage || stage === "inactive-left") {
    if (stage !== "inactive-left") return null;
    return (
      <div className="angel-arena-time-warning">
        {isNotSpectator && (
          <div className="infobox">
            <p>
              Your opponent has left the game. You can wait for them to return, you may claim this game as a victory, or cancel the match.
            </p>
            <div className="button-bar centered">
              <button onClick={claimVictory}>{tr(["angel-arena_claim-victory", "Claim victory"])}</button>
              <button onClick={cancelMatch}>{tr(["angel-arena_cancel-match", "Cancel match"])}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (stage === "inactive-pre-start") {
    return (
      <div className="angel-arena-time-warning">
        {isNotSpectator && (
          <div className="infobox">
            <p>
              There was no activity in this game yet. You may cancel the match, if your opponent does not respond.
            </p>
            <div className="button-bar centered">
              <button onClick={cancelMatch}>{tr(["angel-arena_cancel-match", "Cancel match"])}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (stage === "inactive-warning") {
    const timeInactive = warningTime
      ? (Date.now() - new Date(warningTime).getTime()) / 1000
      : 0;
    const timeRemaining = (periodToReact ?? 0) - timeInactive;

    const isCurrentUserInactive = inactiveUser && username && inactiveUser.username === username;

    if (isCurrentUserInactive) {
      return (
        <div className="angel-arena-time-warning">
          <div className="infobox">
            <p>
              {inactivitiesRemaining > 0
                ? "You have been inactive for a while. Please confirm, you are still there. Otherwise, y"
                : "You have been inactive for a while. Y"}
              our opponent will be able to claim victory or cancel the match in{" "}
              {timeSpanString(Math.floor(timeRemaining))}.
            </p>
          </div>
          {inactivitiesRemaining > 0 && (
            <div className="button-bar centered">
              <button onClick={moreTime}>{tr(["angel-arena_still-here", "Need more time"])}</button>
            </div>
          )}
        </div>
      );
    }

    if (isNotSpectator) {
      return (
        <div className="angel-arena-time-warning">
          <div className="infobox">
            <p>
              Your opponent has been inactive for a while. You will be able to claim victory or cancel the match in{" "}
              {timeSpanString(Math.floor(timeRemaining))}.
            </p>
          </div>
        </div>
      );
    }

    // Spectator view
    return (
      <div className="angel-arena-time-warning">
        <div className="infobox">
          <p>
            {inactiveUser?.username ?? ""} has been inactive for a while. Their opponent will be able to claim victory or cancel the match in{" "}
            {timeSpanString(Math.floor(timeRemaining))}.
          </p>
        </div>
      </div>
    );
  }

  if (stage === "inactive-countdown") {
    const timeInactive = warningTime
      ? (Date.now() - new Date(warningTime).getTime()) / 1000
      : 0;

    const isCurrentUserInactive = inactiveUser && username && inactiveUser.username === username;

    if (isCurrentUserInactive) {
      return (
        <div className="angel-arena-time-warning">
          <div className="infobox">
            <p>
              You have been inactive for {timeSpanString(Math.floor(timeInactive))}. Your opponent can decide to either claim victory or cancel the match.
            </p>
          </div>
          {inactivitiesRemaining > 0 && (
            <div className="button-bar centered">
              <button onClick={moreTime}>{tr(["angel-arena_still-here", "Need more time"])}</button>
            </div>
          )}
        </div>
      );
    }

    if (isNotSpectator) {
      return (
        <div className="angel-arena-time-warning">
          <div className="infobox">
            <p>
              Your opponent has been inactive for {timeSpanString(Math.floor(timeInactive))}. You can decide to either claim victory or cancel the match.
            </p>
          </div>
          <div className="button-bar centered">
            <button onClick={claimVictory}>{tr(["angel-arena_claim-victory", "Claim victory"])}</button>
            <button onClick={cancelMatch}>{tr(["angel-arena_cancel-match", "Cancel match"])}</button>
          </div>
        </div>
      );
    }

    // Spectator view
    return (
      <div className="angel-arena-time-warning">
        <div className="infobox">
          <p>
            {inactiveUser?.username ?? ""} has been inactive for {timeSpanString(Math.floor(timeInactive))}. Their opponent can decide to either claim victory or cancel the match.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Default export: Angel Arena Log component
// ---------------------------------------------------------------------------

export default function AngelArenaLog(): React.ReactElement {
  return <InactivityPane />;
}
