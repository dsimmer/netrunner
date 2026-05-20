// Single game row in the lobby list: join, watch, rejoin buttons.
// Mirrors: src/cljs/nr/game_row.cljs
import React, { useState } from "react";
import { useAppState } from "./appstate";
import { authenticated } from "./auth";
import { playerView as PlayerView } from "./player_view";
import { resumeSound } from "./sounds";
import { tr, trSpan } from "./translations";
import { slugToFormat } from "./utils";
import { wsSend } from "./ws";

// ─── Types ────────────────────────────────────────────────────────

export interface LobbyState {
  editing: boolean;
  passwordGame?: {
    game: Game;
    action: string;
    requestSide?: string;
  };
  showModMenu: boolean;
  [key: string]: unknown;
}

export interface Game {
  gameid: string;
  started: boolean;
  title: string;
  "allow-spectator"?: boolean;
  allowSpectator?: boolean;
  password?: boolean;
  spectators: unknown[];
  spectatorhands: unknown[] | null;
  room: string;
  players: GamePlayer[];
  originalPlayers?: GamePlayer[];
  side?: string;
  format?: string;
  singleton?: boolean;
  precon?: string;
  "open-decklists"?: boolean;
  openDecklists?: boolean;
  description?: string;
  date?: Date | string | null;
  "save-replay"?: boolean;
  saveReplay?: boolean;
  [key: string]: unknown;
}

interface GamePlayer {
  user: { username: string; [key: string]: unknown };
  side?: string;
  [key: string]: unknown;
}

// ─── Helper functions ─────────────────────────────────────────────

function resetGameName(gameid: string): void {
  authenticated(() => {
    wsSend("lobby/rename-game", { gameid });
  });
}

function deleteGame(gameid: string): void {
  authenticated(() => {
    wsSend("lobby/delete-game", { gameid });
  });
}

function shiftGame(gameid: string, room: string): void {
  authenticated(() => {
    wsSend("lobby/shift-game", { gameid, room });
  });
}

export function joinGame(
  lobbyState: React.MutableRefObject<LobbyState>,
  game: Game,
  action: string,
  requestSide?: string,
): void {
  authenticated(() => {
    lobbyState.current.editing = false;
    const wsAction =
      action === "join"
        ? ":lobby/join"
        : action === "rejoin"
        ? ":game/rejoin"
        : game.started
        ? ":game/watch"
        : ":lobby/watch";
    const data: Record<string, unknown> = { gameid: game.gameid };
    if (requestSide) {
      data["request-side"] = requestSide;
    }
    wsSend(wsAction, data);
    resumeSound();
  });
}

function canWatch(
  user: Record<string, unknown> | null,
  game: Game,
  currentGame: Game | null,
  editing: boolean,
): boolean {
  return !!(
    user?.isadmin ||
    (game["allow-spectator"] || game.allowSpectator) &&
    !currentGame &&
    !editing
  );
}

function canJoin(
  user: Record<string, unknown> | null,
  game: Game,
  currentGame: Game | null,
  editing: boolean,
): boolean {
  if (game.room === "tournament") {
    return (game.players as GamePlayer[]).some(
      (p) => p.user.username === user?.username,
    );
  }
  return (
    (game.players as GamePlayer[]).length === 1 &&
    !currentGame &&
    !editing &&
    !game.started &&
    !(game.players as GamePlayer[]).some(
      (p) => p.user.username === user?.username,
    )
  );
}

function canRejoin(
  user: Record<string, unknown> | null,
  game: Game,
  currentGame: Game | null,
  editing: boolean,
): boolean {
  return !!(
    (game.players as GamePlayer[]).length === 1 &&
    !currentGame &&
    !editing &&
    game.started &&
    (game.originalPlayers as GamePlayer[] | undefined)?.some(
      (p) => p.user.username === user?.username,
    )
  );
}

function slugToFormatDisplay(slug: string | undefined): string {
  return slugToFormat[slug ?? ""] ?? "Unknown";
}

// ─── Preconstructed / description helpers ──────────────────────────

function preconSpan(precon: string | undefined): React.ReactElement | null {
  if (!precon) return null;
  // In full implementation: (tr-underline (matchup-by-key precon))
  return (
    <span className="format-precon">
      {trSpan(["precon"])}: "{precon}"
    </span>
  );
}

const descriptions: Record<string, string> = {
  "pending-game_meta-deck": "Looking For: Meta Decks",
  "pending-game_casual": "Looking For: Casual Games",
  "pending-game_competitive": "Looking For: Competitive Games",
  "pending-game_new-player": "Looking To: Learn the game",
};

function descriptionSpan(
  description: string | undefined,
): React.ReactElement | null {
  if (!description || description === "new-game_default") return null;
  const lastPart = description.split("_").pop();
  const k = `pending-game_${lastPart}`;
  return (
    <span className="format-precon-deck-names game-description">
      {trSpan([k], descriptions[k] ?? "")}
    </span>
  );
}

function preconUnderSpan(
  precon: string | undefined,
  description: string | undefined,
): React.ReactElement | null {
  if (precon) {
    // In full implementation: (tr-tag (matchup-by-key precon))
    return (
      <span className="format-precon-deck-names">
        {trSpan(["precon"])}
      </span>
    );
  }
  if (description) return descriptionSpan(description);
  return null;
}

function openDecklistsSpan(
  precon: string | undefined,
  openDecklists: boolean | undefined,
): React.ReactElement | null {
  if (openDecklists && !precon) {
    return (
      <span className="open-decklists">
        {" "}
        {trSpan(["lobby", "open-decklists-b"], "(open decklists)")}
      </span>
    );
  }
  return null;
}

// ─── Sub-components ───────────────────────────────────────────────

function WatchGameButton({
  spectatorhands,
  lobbyState,
  game,
}: {
  spectatorhands: unknown[] | null;
  lobbyState: React.MutableRefObject<LobbyState>;
  game: Game;
}): React.ReactElement {
  if (!spectatorhands) {
    return (
      <button
        onClick={() => {
          joinGame(lobbyState, game, "watch");
        }}
      >
        {trSpan(["lobby", "lobby_watch"], "Watch")}
      </button>
    );
  }
  const joinFn = (side: string | undefined) => () => {
    joinGame(lobbyState, game, "watch", side);
  };
  return (
    <div className="split-button">
      <button onClick={joinFn(undefined)}>
        {trSpan(["lobby", "lobby_watch"], "Watch")}
      </button>
      <button className="dropdown-toggle" data-toggle="dropdown">
        <b className="caret" />
      </button>
      <ul className="dropdown-menu blue-shade">
        <li>
          <a className="block-link" onClick={joinFn("Corp")}>
            {trSpan(
              ["lobby", "lobby_corp-perspective"],
              "Corp Perspective",
            )}
          </a>
        </li>
        <li>
          <a className="block-link" onClick={joinFn("Runner")}>
            {trSpan(
              ["lobby", "lobby_runner-perspective"],
              "Runner Perspective",
            )}
          </a>
        </li>
        <li>
          <a className="block-link" onClick={joinFn(undefined)}>
            {trSpan(["lobby", "lobby_both-perspective"], "Both")}
          </a>
        </li>
      </ul>
    </div>
  );
}

function WatchProtectedGameButton({
  spectatorhands,
  lobbyState,
  game,
}: {
  spectatorhands: unknown[] | null;
  lobbyState: React.MutableRefObject<LobbyState>;
  game: Game;
}): React.ReactElement {
  if (!spectatorhands) {
    const handleClick = () => {
      const password = !!game.password || !!game["password"];
      if (password) {
        authenticated(() => {
          lobbyState.current.passwordGame = {
            game,
            action: "watch",
          };
        });
      } else {
        joinGame(lobbyState, game, "watch");
      }
    };
    return (
      <button onClick={handleClick}>
        {trSpan(["lobby", "lobby_watch"], "Watch")}
      </button>
    );
  }
  const joinFn = (side: string | undefined) => () => {
    const password = !!game.password || !!game["password"];
    if (password) {
      authenticated(() => {
        lobbyState.current.passwordGame = {
          game,
          action: "watch",
          requestSide: side,
        };
      });
    } else {
      joinGame(lobbyState, game, "watch", side);
    }
  };
  return (
    <div className="split-button">
      <button onClick={joinFn(undefined)}>
        {trSpan(["lobby", "lobby_watch"], "Watch")}
      </button>
      <button className="dropdown-toggle" data-toggle="dropdown">
        <b className="caret" />
      </button>
      <ul className="dropdown-menu blue-shade">
        <li>
          <a className="block-link" onClick={joinFn("Corp")}>
            {trSpan(
              ["lobby", "lobby_corp-perspective"],
              "Corp Perspective",
            )}
          </a>
        </li>
        <li>
          <a className="block-link" onClick={joinFn("Runner")}>
            {trSpan(
              ["lobby", "lobby_runner-perspective"],
              "Runner Perspective",
            )}
          </a>
        </li>
        <li>
          <a className="block-link" onClick={joinFn(undefined)}>
            {trSpan(["lobby", "lobby_both-perspective"], "Both")}
          </a>
        </li>
      </ul>
    </div>
  );
}

function WatchButton({
  lobbyState,
  user,
  game,
  currentGame,
  editing,
}: {
  lobbyState: React.MutableRefObject<LobbyState>;
  user: Record<string, unknown> | null;
  game: Game;
  currentGame: Game | null;
  editing: boolean;
}): React.ReactElement | null {
  if (!canWatch(user, game, currentGame, editing)) return null;
  const password = !!game.password || !!game["password"];
  const spectatorhands = game.spectatorhands;
  if (!password) {
    return (
      <WatchGameButton
        spectatorhands={spectatorhands}
        lobbyState={lobbyState}
        game={game}
      />
    );
  }
  return (
    <WatchProtectedGameButton
      spectatorhands={spectatorhands}
      lobbyState={lobbyState}
      game={game}
    />
  );
}

function JoinButton({
  lobbyState,
  user,
  game,
  currentGame,
  editing,
}: {
  lobbyState: React.MutableRefObject<LobbyState>;
  user: Record<string, unknown> | null;
  game: Game;
  currentGame: Game | null;
  editing: boolean;
}): React.ReactElement | null {
  if (!canJoin(user, game, currentGame, editing)) return null;

  const anySide = (game.players as GamePlayer[]).some(
    (p) => p.side === "Any Side",
  );

  const password = !!game.password || !!game["password"];

  if (anySide && !password) {
    const joinFn = (side?: string) => () => {
      joinGame(lobbyState, game, "join", side);
    };
    return (
      <div className="split-button">
        <button onClick={joinFn()}>
          {trSpan(["lobby", "lobby_join"], "Join")}
        </button>
        <button className="dropdown-toggle" data-toggle="dropdown">
          <b className="caret" />
        </button>
        <ul className="dropdown-menu blue-shade">
          <li>
            <a className="block-link" onClick={joinFn("Corp")}>
              {trSpan(["lobby", "lobby_as-corp"], "As Corp")}
            </a>
          </li>
          <li>
            <a className="block-link" onClick={joinFn("Runner")}>
              {trSpan(["lobby", "lobby_as-runner"], "As Runner")}
            </a>
          </li>
        </ul>
      </div>
    );
  }

  const handleClick = () => {
    if (password) {
      authenticated(() => {
        lobbyState.current.passwordGame = { game, action: "join" };
      });
    } else {
      joinGame(lobbyState, game, "join");
    }
  };

  return (
    <button onClick={handleClick}>
      {trSpan(["lobby", "lobby_join"], "Join")}
    </button>
  );
}

function RejoinButton({
  lobbyState,
  user,
  game,
  currentGame,
  editing,
}: {
  lobbyState: React.MutableRefObject<LobbyState>;
  user: Record<string, unknown> | null;
  game: Game;
  currentGame: Game | null;
  editing: boolean;
}): React.ReactElement | null {
  if (!canRejoin(user, game, currentGame, editing)) return null;

  const password = !!game.password || !!game["password"];

  const handleClick = () => {
    if (password) {
      authenticated(() => {
        lobbyState.current.passwordGame = { game, action: "rejoin" };
      });
    } else {
      joinGame(lobbyState, game, "rejoin");
    }
  };

  return (
    <button onClick={handleClick}>
      {trSpan(["lobby", "lobby_rejoin"], "Rejoin")}
    </button>
  );
}

function isMod(user: Record<string, unknown> | null): boolean {
  return !!(user?.isadmin || user?.ismoderator || user?.special);
}

function ModMenuPopup({
  state,
  user,
  game,
}: {
  state: { showModMenu: boolean; setShowModMenu: (v: boolean) => void };
  user: Record<string, unknown> | null;
  game: Game;
}): React.ReactElement | null {
  if (!state.showModMenu) return null;
  if (!isMod(user)) return null;

  const isUserAdmin = !!user?.isadmin;

  const handleResetName = () => {
    resetGameName(game.gameid);
    state.setShowModMenu(false);
  };

  const handleDelete = () => {
    deleteGame(game.gameid);
    state.setShowModMenu(false);
  };

  const handleShift = () => {
    shiftGame(
      game.gameid,
      game.room === "competitive" ? "casual" : "competitive",
    );
    state.setShowModMenu(false);
  };

  return (
    <div className="ctrl-menu">
      <div className="panel blue-shade mod-menu">
        {isUserAdmin && (
          <>
            <div onClick={handleResetName}>
              {trSpan(["lobby", "lobby_reset"], "Reset Game Name")}
            </div>
            <div onClick={handleDelete}>
              {tr(["lobby", "lobby_delete"], "Delete Game")}
            </div>
            <div onClick={() => state.setShowModMenu(false)}>
              {trSpan(["lobby", "lobby_cancel"], "Cancel")}
            </div>
          </>
        )}
        <div onClick={handleShift}>
          {trSpan(
            ["lobby", "lobby_shift-to-casual"],
            game.room === "competitive"
              ? "Shift game to Casual lobby"
              : "shift game to Tournament lobby",
          )}
        </div>
      </div>
    </div>
  );
}

function GameTitle({
  state,
  user,
  game,
}: {
  state: { showModMenu: boolean; setShowModMenu: (v: boolean) => void };
  user: Record<string, unknown> | null;
  game: Game;
}): React.ReactElement {
  const password = !!game.password || !!game["password"];
  const spectatorCount = Array.isArray(game.spectators)
    ? game.spectators.length
    : 0;
  const saveReplay = !!game["save-replay"] || !!game.saveReplay;

  return (
    <h4
      onClick={() => state.setShowModMenu(!state.showModMenu)}
      className={isMod(user) ? "clickable" : undefined}
    >
      {saveReplay && <span>🟢</span>}
      {password && (
        <>
          {"["} {trSpan(["lobby", "lobby_private"], "PRIVATE")} {"] "}
        </>
      )}
      {game.title}
      {spectatorCount > 0 && (
        <>
          {" ("}
          {trSpan(["lobby", "lobby_spectator-count"], { cnt: String(spectatorCount) })}
          {")"}
        </>
      )}
    </h4>
  );
}

function GameFormat({
  game,
}: {
  game: Game;
}): React.ReactElement {
  const fmt = game.format as string | undefined;
  const singleton = !!game.singleton;
  const precon = game.precon as string | undefined;
  const openDecklists = !!(game["open-decklists"] || game.openDecklists);
  const description = game.description as string | undefined;

  return (
    <div className="game-format">
      <span className="format-label">
        {trSpan(["lobby", "lobby_format"], "Format")}:{" "}
      </span>
      <span className="format-type">
        {slugToFormatDisplay(fmt)}
      </span>
      {precon && preconSpan(precon)}
      {singleton && (
        <span className="format-singleton">
          {" "}
          {trSpan(["lobby", "lobby_singleton-b"], "(singleton)")}
        </span>
      )}
      {openDecklistsSpan(precon, openDecklists)}
      {preconUnderSpan(precon, description)}
    </div>
  );
}

function timeSince(start: Date | string | null | undefined): number {
  if (!start) return 0;
  const startMs =
    start instanceof Date ? start.getTime() : new Date(start).getTime();
  const now = Date.now();
  const diffMs = now - startMs;
  return Math.abs(Math.floor(diffMs / 60000));
}

function GameTime(game: Game): React.ReactElement | null {
  if (!game.started) return null;
  const minutes = timeSince(game.date);
  return (
    <div className="game-time">
      <span className="game-time-emoji">⏰</span> {minutes}m
    </div>
  );
}

function PlayersRow({ game }: { game: Game }): React.ReactElement {
  const players = game.players as GamePlayer[];
  return (
    <div>
      {players.map((player, idx) => (
        <PlayerView key={(player.user as any)._id ?? idx} user={player.user} />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────

export function GameRow({
  lobbyState,
  game,
  currentGame,
  editing,
}: {
  lobbyState: React.MutableRefObject<LobbyState>;
  game: Game;
  currentGame: Game | null;
  editing: boolean;
}): React.ReactElement {
  const user = useAppState((s) => s.user);
  const [showModMenu, setShowModMenu] = useState(false);
  const state = { showModMenu, setShowModMenu };

  const isActive = game.gameid === currentGame?.gameid;

  return (
    <div className={isActive ? "gameline active" : "gameline"}>
      <WatchButton
        lobbyState={lobbyState}
        user={user}
        game={game}
        currentGame={currentGame}
        editing={editing}
      />
      <JoinButton
        lobbyState={lobbyState}
        user={user}
        game={game}
        currentGame={currentGame}
        editing={editing}
      />
      <RejoinButton
        lobbyState={lobbyState}
        user={user}
        game={game}
        currentGame={currentGame}
        editing={editing}
      />
      <GameTitle state={state} user={user} game={game} />
      <ModMenuPopup state={state} user={user} game={game} />
      <GameFormat game={game} />
      {GameTime(game)}
      <PlayersRow game={game} />
    </div>
  );
}

export default GameRow;
