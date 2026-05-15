import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { GET } from "nr/ajax";
import * as angelArena from "nr/angel-arena/lobby";
import { appState, currentGameid } from "nr/appstate";
import { authenticated } from "nr/auth";
import { gameRow } from "nr/game-row";
import * as ls from "nr/local-storage";
import { leaveGame } from "nr/gameboard/actions";
import { createNewGame } from "nr/new-game";
import { passwordGame } from "nr/password-game";
import { startReplayDiv } from "nr/replay-game";
import { pendingGame } from "nr/pending-game";
import { playSound, resumeSound } from "nr/sounds";
import { tr, trElement, trSpan, trFormat } from "nr/translations";
import { condButton, nonGameToast, trNonGameToast } from "nr/utils";
import {
  wsSend,
  lobbyUpdatesContinue,
  lobbyUpdatesPause,
  lobbyUpdatesState,
} from "nr/ws";
import { eventMsgHandlerWrapper } from "nr/ws";
import * as sente from "taoensso.sente";
import { slugToFormat } from "nr/utils";

// Type definitions
interface User {
  _id?: string;
  username?: string;
  [key: string]: any;
}

interface Game {
  gameid?: string;
  room?: string;
  started?: boolean;
  players?: { user?: User }[];
  format?: string;
  [key: string]: any;
}

interface LobbyState {
  room?: string;
  editing?: boolean;
  "password-game"?: boolean;
  replay?: boolean;
  [key: string]: any;
}

interface ReplayJumpParams {
  n?: number;
  d?: number;
  b?: number;
  [key: string]: any;
}

interface GamesListPanelProps {
  state: LobbyState;
  setState: React.Dispatch<React.SetStateAction<LobbyState>>;
  games: Game[];
  currentGame: Game;
  user: User;
  visibleFormats: Set<string>;
}

interface RightPanelProps {
  state: LobbyState;
  setState: React.Dispatch<React.SetStateAction<LobbyState>>;
  decks: any;
  currentGame: Game;
  user: User;
}

interface ButtonBarProps {
  state: LobbyState;
  setState: React.Dispatch<React.SetStateAction<LobbyState>>;
  games: Game[];
  currentGame: Game;
  user: User;
  visibleFormats: Set<string>;
}

// WebSocket event handlers registration
const registerWsHandlers = () => {
  // :lobby/list
  ws.eventMsgHandler("lobby/list", ({ "?data": data }: any) => {
    (appState as any).games = data;
  });

  // :lobby/state
  ws.eventMsgHandler("lobby/state", ({ "?data": data }: any) => {
    const currentGameId = ((appState as any).gameid as string) || "";
    if (currentGameId !== "local-replay") {
      (appState as any)["current-game"] = data;
      if (data.started) {
        wsSend(["game/resync", { gameid: data.gameid }]);
      }
    }
  });

  // :lobby/notification
  ws.eventMsgHandler("lobby/notification", ({ "?data": data }: any) => {
    playSound(data);
  });

  // :lobby/toast
  ws.eventMsgHandler("lobby/toast", ({ "?data": data }: any) => {
    const { message, type } = data;
    const msg = typeof message === "string" ? message : tr(message as string);
    nonGameToast(msg, type as string, { "time-out": 30000, "close-button": true });
  });

  // :lobby/block-game-creation
  ws.eventMsgHandler("lobby/block-game-creation", ({ "?data": data }: any) => {
    (appState as any)["block-game-creation"] = data;
  });

  // :lobby/timeout
  ws.eventMsgHandler("lobby/timeout", ({ "?data": data }: any) => {
    const currentGameId = (((appState as any)["current-game"] as any)?.gameid) || "";
    if (data.gameid === currentGameId) {
      trNonGameToast(
        "lobby_closed-msg",
        "Game lobby closed due to inactivity",
        "error",
        { "time-out": 0, "close-button": true }
      );
      (appState as any).gameid = null;
    }
  });
};

// Utility functions
const replayGame = (setState: React.Dispatch<React.SetStateAction<LobbyState>>) => {
  authenticated((_: any) => {
    setState((prev) => ({ ...prev, replay: true }));
  });
};

const startSharedReplay = (
  setState: React.Dispatch<React.SetStateAction<LobbyState>>,
  gameid: string,
  jumpTo?: ReplayJumpParams
) => {
  authenticated((user: User) => {
    setState((prev) => ({
      ...prev,
      title: `${user.username}'s game`,
      side: "Corp",
      format: "standard",
      editing: false,
      replay: true,
      flashMessage: "",
      protected: false,
      password: "",
      allowSpectator: true,
      spectatorhands: true,
    }));

    GET(`/profile/history/full/${gameid}`).then(({ status, json }: any) => {
      if (status === 200) {
        const replay = json as any;
        const history = replay.history;
        const replayShared = replay.replay_shared;
        let initState = history[0];
        initState = { ...initState, gameid, "replay-shared": replayShared };
        initState = {
          ...initState,
          options: { ...initState.options, spectatorhands: true },
        };
        const diffs = history.slice(1);
        initState = { ...initState, "replay-diffs": diffs };

        if (jumpTo) {
          initState = { ...initState, "replay-jump-to": jumpTo };
        }

        eventMsgHandlerWrapper({
          id: "game/start",
          "?data": JSON.stringify(initState),
        });
      } else if (status === 404) {
        trNonGameToast(
          "lobby_replay-link-error",
          "Replay link invalid.",
          "error",
          { "time-out": 0, "close-button": true }
        );
      }
    });
  });
};

const leaveGameFn = () => {
  const currentGameId = ((appState as any).gameid as string) || "";
  if (currentGameId === "local-replay") {
    (appState as any).gameid = null;
    leaveGame();
  } else {
    wsSend(
      ["game/leave", { gameid: currentGameid(appState as any) }],
      8000,
      (res: any) => {
        if (sente.cbSuccess(res)) {
          leaveGame();
        }
      }
    );
  }
};

const filterGames = (
  user: User,
  games: Game[],
  visibleFormats: Set<string>
) => {
  if (games.length > 0 && games[0].room === "tournament") {
    return games;
  }
  const isVisible = (game: Game) => {
    const hasPlayer = (game.players || []).some(
      (p) => p.user?.username === user.username
    );
    const formatVisible = visibleFormats.has(game.format as string);
    return hasPlayer || formatVisible;
  };
  return games.filter(isVisible);
};

const openGamesSymbol = "\u25CB";
const closedGamesSymbol = "\u25CF";

const roomCountStr = (openCount: number, closedCount: number) =>
  ` (${openCount} ${openGamesSymbol} ${closedCount} ${closedGamesSymbol})`;

// Room tab component
const RoomTab: React.FC<{
  user: User;
  state: LobbyState;
  setState: React.Dispatch<React.SetStateAction<LobbyState>>;
  games: Game[];
  room: string;
  roomName: string;
}> = ({ user, state, setState, games, room, roomName }) => {
  const roomGames = useMemo(
    () => games.filter((g) => g.room === room),
    [games, room]
  );
  const visibleFormats = (appState as any).visibleFormats || new Set<string>();
  const filteredGames = useMemo(
    () => filterGames(user, roomGames, visibleFormats),
    [user, roomGames, visibleFormats]
  );
  const closedCount = useMemo(
    () => filteredGames.filter((g) => g.started).length,
    [filteredGames]
  );
  const openCount = roomGames.length - closedCount;

  return (
    <div
      className={`roomtab${room === state.room ? " current" : ""}`}
      onClick={() => {
        setState((prev) => ({ ...prev, room, editing: undefined }));
      }}
    >
      {trSpan(
        [(`lobby_${roomName}` as any), roomName.toUpperCase()],
        { type: roomName }
      )}
      {roomCountStr(openCount, closedCount)}
    </div>
  );
};

// Game list component
const GameList: React.FC<{
  state: LobbyState;
  setState: React.Dispatch<React.SetStateAction<LobbyState>>;
  user: User;
  games: Game[];
  currentGame: Game;
}> = ({ state, user, games, currentGame }) => {
  const room = state.room || "casual";
  const visibleFormats = (appState as any).visibleFormats || new Set<string>();
  const roomGames = games.filter((g) => g.room === room);
  const filteredGames = filterGames(user, roomGames, visibleFormats);

  const countLabel =
    Object.keys(slugToFormat).length === visibleFormats.size
      ? tr("lobby_game-count")
      : tr("lobby_game-count-filtered");

  return (
    <>
      <div className="game-count">
        {trElement("h4", countLabel, { cnt: filteredGames.length })}
      </div>
      <div className="game-list">
        {filteredGames.length === 0 ? (
          trElement("h4", tr("lobby_no-games", "No games"))
        ) : (
          filteredGames.map((game) => (
            <div key={game.gameid}>
              {gameRow(state, game, currentGame, state.editing)}
            </div>
          ))
        )}
      </div>
    </>
  );
};

const formatVisible = (slug: string) => {
  return (appState as any).visibleFormats?.has(slug) || false;
};

const onChangeFormatVisibility = (
  slug: string,
  evt: React.ChangeEvent<HTMLInputElement>
) => {
  evt.stopPropagation();
  const vf = (appState as any).visibleFormats || new Set<string>();
  if (formatVisible(slug)) {
    vf.delete(slug);
  } else {
    vf.add(slug);
  }
  (appState as any).visibleFormats = vf;
  ls.save!("visible-formats", vf);
};

const FormatToggle: React.FC<{ slug: string }> = ({ slug }) => {
  const id = `filter-${slug}`;
  return (
    <div>
      <input
        id={id}
        className="visible-formats"
        type="checkbox"
        onChange={(e) => onChangeFormatVisibility(slug, e)}
        checked={formatVisible(slug)}
      />
      <label htmlFor={id} onClick={(e) => e.stopPropagation()}>
        {trFormat(slug)}
      </label>
    </div>
  );
};

const NewGameButton: React.FC<{
  state: LobbyState;
  setState: React.Dispatch<React.SetStateAction<LobbyState>>;
  games: Game[];
  gameid: string | null;
  user: User;
}> = ({ state, setState, games, gameid, user }) => {
  const canCreate =
    !gameid &&
    !state.editing &&
    state.room !== "tournament" &&
    !games
      .flatMap((g) => g.players || [])
      .some((p) => p.user?._id === user._id);

  return condButton(
    trSpan(["lobby_new-game", "New game"]),
    canCreate,
    () => {
      authenticated((_: any) => {
        wsSend(["lobby/block-game-creation"]);
        setState((prev) => ({ ...prev, editing: true }));
        const el = document.querySelector(".game-title") as HTMLInputElement;
        if (el) el.select();
        resumeSound();
      });
    }
  );
};

const ReloadLobbyButton: React.FC = () => (
  <button
    className="reload-button"
    type="button"
    onClick={() => wsSend(["lobby/list"])}
  >
    {trSpan(["lobby_reload", "Reload list"])}
  </button>
);

const LoadReplayButton: React.FC<{
  state: LobbyState;
  setState: React.Dispatch<React.SetStateAction<LobbyState>>;
  games: Game[];
  gameid: string | null;
  user: User;
}> = ({ state, setState, games, gameid, user }) => {
  const canLoad =
    !gameid &&
    !state.editing &&
    state.room !== "tournament" &&
    !games
      .flatMap((g) => g.players || [])
      .some((p) => p.user?._id === user._id);

  return condButton(
    trSpan(["lobby_load-replay", "Load replay"]),
    canLoad,
    () => {
      replayGame(setState);
      resumeSound();
    }
  );
};

// Button bar component
const ButtonBar: React.FC<ButtonBarProps> = ({
  state,
  setState,
  games,
  currentGame,
  user,
  visibleFormats,
}) => (
  <div className="button-bar">
    <div className="rooms">
      <div id="filter" className="dropdown">
        <a href="" data-toggle="dropdown">
          {trSpan(["lobby_filter", "Filter"])}
          <b className="caret" />
        </a>
        <div className="dropdown-menu blue-shade">
          {Object.keys(slugToFormat).map((k) => (
            <FormatToggle key={k} slug={k} />
          ))}
        </div>
      </div>
      <RoomTab
        user={user}
        state={state}
        setState={setState}
        games={games}
        room="casual"
        roomName="casual"
      />
      <RoomTab
        user={user}
        state={state}
        setState={setState}
        games={games}
        room="competitive"
        roomName="tournament"
      />
    </div>
    {state.room !== "angel-arena" && (
      <div className="lobby-buttons">
        <NewGameButton
          state={state}
          setState={setState}
          games={games}
          gameid={currentGameId(appState as any) || null}
          user={user}
        />
        <ReloadLobbyButton />
        <LoadReplayButton
          state={state}
          setState={setState}
          games={games}
          gameid={currentGameId(appState as any) || null}
          user={user}
        />
      </div>
    )}
  </div>
);

// Games list panel component
const gamesListPanel = ({
  state,
  setState,
  games,
  currentGame,
  user,
  visibleFormats,
}: GamesListPanelProps) => {
  useEffect(() => {
    lobbyUpdatesContinue();
    return () => {
      lobbyUpdatesPause();
    };
  }, []);

  return (
    <div className="games">
      <ButtonBar
        state={state}
        setState={setState}
        games={games}
        currentGame={currentGame}
        user={user}
        visibleFormats={visibleFormats}
      />
      {lobbyUpdatesState.current
        ? state.room === "angel-arena"
          ? angelArena.gameList(state, { games, currentGame })
          : (
              <GameList
                state={state}
                setState={setState}
                user={user}
                games={games}
                currentGame={currentGame}
              />
            )
        : (
          <div>
            Lobby updates halted.{" "}
            <button onClick={() => lobbyUpdatesContinue()}>
              Reenable lobby updates
            </button>
          </div>
        )}
    </div>
  );
};

// Right panel component
const rightPanel = ({
  state,
  setState,
  decks,
  currentGame,
  user,
}: RightPanelProps) => {
  if (state.room === "angel-arena") {
    return <angelArena.gamePanel decks={decks} />;
  }

  if (state.replay) {
    return <startReplayDiv state={state} setState={setState} />;
  }
  if (state.editing) {
    return <createNewGame state={state} setState={setState} user={user} />;
  }
  if (state["password-game"]) {
    return <passwordGame state={state} setState={setState} />;
  }
  if (currentGame && !currentGame.started) {
    return <pendingGame currentGame={currentGame} user={user} />;
  }
  return null;
};

// Load replay from URL params
const loadReplayFromParams = (
  setState: React.Dispatch<React.SetStateAction<LobbyState>>,
  params: string
) => {
  (appState as any)["replay-id"] = null;
  const bugReportMatch = /bug-report/.test(params);
  const idMatch = /([0-9a-f\-]+)/.exec(params);
  const nMatch = /n=(\d+)/.exec(params);
  const dMatch = /d=(\d+)/.exec(params);
  const bMatch = /b=(\d+)/.exec(params);
  const replayId = idMatch ? idMatch[1] : null;
  const n = nMatch ? parseInt(nMatch[1], 10) : undefined;
  const d = dMatch ? parseInt(dMatch[1], 10) : undefined;
  const b = bMatch ? parseInt(bMatch[1], 10) : undefined;

  if (replayId) {
    window.history.replaceState({}, "", "/play");
    if (bugReportMatch) {
      startSharedReplay(setState, replayId, { bug: b ?? 0 });
    } else if (n !== undefined && d !== undefined) {
      startSharedReplay(setState, replayId, { n, d });
    } else {
      startSharedReplay(setState, replayId);
    }
    resumeSound();
    return false;
  }
  return true;
};

// Main game lobby component
export const gameLobby = () => {
  const [state, setState] = useState<LobbyState>({ room: "casual" });
  const games = (appState as any).games || [];
  const currentGame = (appState as any)["current-game"] || {};
  const user = (appState as any).user || {};
  const visibleFormats = (appState as any).visibleFormats || new Set<string>();
  const replayId = (appState as any)["replay-id"] || null;
  const [decks] = useState((appState as any).decks);

  useEffect(() => {
    authenticated((_: any) => {});
  }, []);

  if (replayId) {
    loadReplayFromParams(setState, replayId as string);
  }

  return (
    <div className="container">
      <div className="lobby-bg" />
      <div className="lobby panel blue-shade">
        {gamesListPanel({
          state,
          setState,
          games,
          currentGame,
          user,
          visibleFormats,
        })}
        {rightPanel({
          state,
          setState,
          decks,
          currentGame,
          user,
        })}
      </div>
    </div>
  );
};

export { registerWsHandlers, slugToFormat, leaveGameFn };
