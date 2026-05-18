// Status bar: game count, reconnect button, in-game concede/leave controls.
// Mirrors: src/cljs/nr/status_bar.cljs
import React from "react";
import { useAppState } from "./appstate";
import { concede, muteSpectators, leaveGame } from "./gameboard/actions";
import { setReplaySide } from "./gameboard/replay";
import { filterGames } from "./lobby";
import { trSpan } from "./translations";
import { chskReconnect } from "./ws";
import { playerView } from "./player_view";

// ---------------------------------------------------------------------------
// current-game-count
// Shows the count of visible games and a reconnect button when disconnected.
// ---------------------------------------------------------------------------
export function CurrentGameCount(): React.ReactElement {
  const connected = useAppState((s) => s.connected);
  const games = useAppState((s) => s.games) as unknown[];
  const visibleFormats = useAppState((s) => s.visibleFormats);
  const user = useAppState((s) => s.user) as Record<string, unknown> | null;

  // Mirrors: (r/track (fn [] (count (filter-games @user @games (:visible-formats @app-state)))))
  const filteredCount = (() => {
    if (!games.length || !user || !visibleFormats) return 0;
    return filterGames(
      user as unknown as { username: string },
      games as Parameters<typeof filterGames>[1],
      visibleFormats as Set<string>,
    ).length;
  })();

  return (
    <div className="float-right">
      {trSpan(["nav_game-count", ""], { cnt: String(filteredCount) })}
      {!connected && (
        <a
          className="reconnect-button"
          onClick={() => chskReconnect()}
        >
          {trSpan("game_attempt-reconnect")}
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// in-game-buttons
// Concede, leave, mute/unmute spectators buttons shown during a game.
// ---------------------------------------------------------------------------
export function InGameButtons(): React.ReactElement | null {
  const currentGame = useAppState((s) => s.currentGame) as Record<string, unknown> | null;
  const gameid = useAppState((s) => s.currentGame?.gameid) ?? null;
  const user = useAppState((s) => s.user) as Record<string, unknown> | null;

  // (when (and (:started @current-game) (not= "local-replay" @gameid))
  if (!currentGame || !currentGame.started || gameid === "local-replay") {
    return null;
  }

  const userId = (user as Record<string, unknown> | undefined)?._id as string | undefined;
  const players = currentGame.players as Array<{ user?: { _id?: string } }> | undefined;
  const isPlayer = players?.some((p) => p.user?._id === userId) ?? false;

  const muteSpectatorsFlag = currentGame["mute-spectators"] as boolean | undefined;

  return (
    <div className="float-right">
      {isPlayer && (
        <a className="concede-button" onClick={() => concede()}>
          {trSpan("game_concede")}
        </a>
      )}
      <a className="leave-button" onClick={() => leaveGame()}>
        {currentGame.replay
          ? trSpan("game_leave-replay")
          : trSpan("game_leave")}
      </a>
      {isPlayer && (
        <a className="mute-button" onClick={() => muteSpectators()}>
          {muteSpectatorsFlag
            ? trSpan("game_unmute")
            : trSpan("game_mute")}
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// replay-and-spectator-buttons
// Leave game/replay button and replay side selection buttons.
// ---------------------------------------------------------------------------
export function ReplayAndSpectatorButtons(): React.ReactElement | null {
  const gameid = useAppState((s) => s.currentGame?.gameid) ?? null;

  // (when (not (nil? @gameid))
  if (gameid == null) {
    return null;
  }

  return (
    <div className="float-right">
      <a onClick={() => leaveGame()}>
        {gameid === "local-replay"
          ? trSpan("game_leave-replay")
          : trSpan("game_leave")}
      </a>
      {gameid === "local-replay" && (
        <>
          <a className="replay-button" onClick={() => setReplaySide("corp")}>
            {trSpan("game_corp-view")}
          </a>
          <a className="replay-button" onClick={() => setReplaySide("runner")}>
            {trSpan("game_runner-view")}
          </a>
          <a className="replay-button" onClick={() => setReplaySide("spectator")}>
            {trSpan("game_spec-view")}
          </a>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// spectator-list
// Shows spectator count and list of spectators.
// ---------------------------------------------------------------------------
export function SpectatorList(): React.ReactElement | null {
  const currentGame = useAppState((s) => s.currentGame) as Record<string, unknown> | null;

  // (when-let [game @current-game] (when (:started game) ...)
  if (!currentGame || !currentGame.started) {
    return null;
  }

  const spectators = currentGame.spectators as Array<{ user?: { _id?: string }; [key: string]: unknown }> | undefined;
  const count = spectators?.length ?? 0;

  // (when (pos? c) ...)
  if (count <= 0) {
    return null;
  }

  return (
    <div className="spectators-count float-right">
      {trSpan("game_spec-count", { cnt: String(count) })}
      <div className="blue-shade spectators">
        {spectators?.map((p) => (
          <span key={(p.user?._id as string) ?? ""}>
            {playerView(p as unknown as { user: { username: string; stats: { "games-started": number; "games-completed": number } }; side?: string; deck?: { identity?: { faction?: string; title?: string } } })}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// status
// Main status bar component combining all sub-components.
// ---------------------------------------------------------------------------
export function StatusBar(): React.ReactElement {
  return (
    <div>
      <CurrentGameCount />
      <InGameButtons />
      <ReplayAndSpectatorButtons />
      <SpectatorList />
    </div>
  );
}

export default StatusBar;
