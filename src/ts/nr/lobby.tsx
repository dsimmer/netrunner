// Game lobby page: rooms, game list, format filter, new-game / replay panels.
// Mirrors: src/cljs/nr/lobby.cljs
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GET } from "./ajax";
import * as angelArena from "./angel_arena/lobby";
import { useAppState, currentGameID, type AppStateShape } from "./appstate";
import { authenticated } from "./auth";
import { GameRow } from "./game_row";
import { save as lsSave } from "./local_storage";
import { launchGame, leaveGame as leaveGameAction } from "./gameboard/actions";
import { createNewGame } from "./new_game";
import { passwordGame } from "./password_game";
import { PendingGame } from "./pending_game";
import ReplayPage from "./replay_game";
import { playSound, resumeSound } from "./sounds";
import { tr, trElement, trSpan, trFormat } from "./translations";
import {
  condButton,
  nonGameToast,
  trNonGameToast,
  slugToFormat,
} from "./utils";
import {
  wsSend,
  wsSendWithCb,
  onWSEvent,
  lobbyUpdatesContinue,
  lobbyUpdatesPause,
} from "./ws";

// ─── Types ────────────────────────────────────────────────────────

interface User {
  _id?: string;
  username?: string;
  [key: string]: unknown;
}

interface GamePlayer {
  user?: { _id?: string; username?: string; [key: string]: unknown };
  side?: string;
  [key: string]: unknown;
}

interface Game {
  gameid?: string;
  room?: string;
  started?: boolean;
  players?: GamePlayer[];
  format?: string;
  spectators?: unknown[];
  [key: string]: unknown;
}

interface PasswordGameInfo {
  game: Game;
  action: string;
  "request-side"?: string;
  requestSide?: string;
}

interface LobbyLocalState {
  room: string;
  editing: boolean;
  replay: boolean;
  // game_row.tsx mutates `.current.passwordGame`; password_game.tsx reads
  // `.["password-game"]`. Keep both keys in sync via the proxy in GameLobby.
  passwordGame: PasswordGameInfo | null;
  "password-game": PasswordGameInfo | null;
  showModMenu: boolean;
}

// ─── WS handlers (module-level, auto-registered) ──────────────────
// Mirrors the defmethod ws/event-msg-handler entries at the top of lobby.cljs.

onWSEvent("lobby/list", (data: unknown) => {
  useAppState.getState().setGames((data as unknown[]) ?? []);
});

onWSEvent("lobby/state", (data: unknown) => {
  const game = data as Game | null;
  const state = useAppState.getState();
  if (state.currentGame?.gameid === "local-replay") return;
  state.setCurrentGame(
    game ? ({ gameid: game.gameid ?? "", started: !!game.started, ...game } as never) : null,
  );
  if (game?.started && game.gameid) {
    wsSend("game/resync", { gameid: game.gameid });
  }
});

onWSEvent("lobby/notification", (data: unknown) => {
  playSound(data as string);
});

onWSEvent("lobby/toast", (data: unknown) => {
  const { message, type } = (data ?? {}) as { message?: string; type?: string };
  if (!message || !type) return;
  // cljs handles keyword vs string; in JS we only ever get strings.
  nonGameToast(message, type, { "time-out": 30000, "close-button": true });
});

onWSEvent("lobby/block-game-creation", (data: unknown) => {
  useAppState.getState().setBlockGameCreation(!!data);
});

onWSEvent("lobby/timeout", (data: unknown) => {
  const { gameid } = (data ?? {}) as { gameid?: string };
  if (!gameid) return;
  if (gameid === currentGameID()) {
    trNonGameToast(
      ["lobby_closed-msg", "Game lobby closed due to inactivity"],
      "error",
      { "time-out": 0, "close-button": true },
    );
    useAppState.getState().setCurrentGame(null);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────

// Mirrors: filter-games — visible if user is a player or game's format is visible.
// Tournament room shows all games unconditionally.
export function filterGames(
  user: User,
  games: Game[],
  visibleFormats: Set<string>,
): Game[] {
  if (games.length > 0 && games[0]?.room === "tournament") {
    return games;
  }
  return games.filter((game) => {
    const hasPlayer = (game.players ?? []).some(
      (p) => p.user?.username === user?.username,
    );
    if (hasPlayer) return true;
    return !!game.format && visibleFormats.has(game.format);
  });
}

const OPEN_GAMES_SYMBOL = "○";
const CLOSED_GAMES_SYMBOL = "●";

function roomCountStr(openCount: number, closedCount: number): string {
  return ` (${openCount}${OPEN_GAMES_SYMBOL} ${closedCount}${CLOSED_GAMES_SYMBOL})`;
}

function startSharedReplay(
  gameid: string,
  jumpTo?: { n?: number; d?: number; bug?: number } | null,
): void {
  authenticated((_user) => {
    GET(`/profile/history/full/${gameid}`).then((res) => {
      if (res.status === 200) {
        const replay = res.json as {
          history?: Array<Record<string, unknown>>;
          "replay-shared"?: boolean;
        };
        const history = replay?.history ?? [];
        if (history.length === 0) return;
        const initStateBase = history[0] ?? {};
        const diffs = history.slice(1);
        const initState: Record<string, unknown> = {
          ...initStateBase,
          gameid,
          "replay-shared": replay?.["replay-shared"] ?? false,
          options: {
            ...((initStateBase.options as Record<string, unknown>) ?? {}),
            spectatorhands: true,
          },
          "replay-diffs": diffs,
        };
        if (jumpTo) {
          initState["replay-jump-to"] = jumpTo;
        }
        // Mirrors (ws/event-msg-handler-wrapper {:id :game/start ...}) — a local
        // dispatch into the game/start handler rather than a network send.
        launchGame(initState as never);
      } else if (res.status === 404) {
        trNonGameToast(
          ["lobby_replay-link-error", "Replay link invalid."],
          "error",
          { "time-out": 0, "close-button": true },
        );
      }
    });
  });
}

function leaveGameFromLobby(): void {
  const gameid = currentGameID();
  if (gameid === "local-replay") {
    useAppState.getState().setCurrentGame(null);
    leaveGameAction();
    return;
  }
  wsSendWithCb(
    "game/leave",
    { gameid },
    8000,
    (response) => {
      // Mirrors (sente/cb-success? %) — sente success values are non-error,
      // matching responses that aren't `{error: ...}` or a timeout sentinel.
      const ok =
        response !== undefined &&
        response !== null &&
        !(response as { error?: string }).error;
      if (ok) leaveGameAction();
    },
  );
}

// ─── Room tab ─────────────────────────────────────────────────────

function RoomTab({
  state,
  setState,
  user,
  games,
  room,
  roomName,
}: {
  state: LobbyLocalState;
  setState: React.Dispatch<React.SetStateAction<LobbyLocalState>>;
  user: User;
  games: Game[];
  room: string;
  roomName: string;
}): React.ReactElement {
  const visibleFormats = useAppState((s) => s.visibleFormats);
  const roomGames = useMemo(
    () => games.filter((g) => g.room === room),
    [games, room],
  );
  const filteredGames = useMemo(
    () => filterGames(user, roomGames, visibleFormats),
    [user, roomGames, visibleFormats],
  );
  const closedCount = filteredGames.filter((g) => g.started).length;
  const openCount = roomGames.length - closedCount;

  const active = state.room === room;

  return (
    <div
      className={`roomtab${active ? " current" : ""}`}
      onClick={() => {
        if (!active) {
          setState((prev) => ({ ...prev, room, editing: false }));
        }
      }}
    >
      {trSpan(
        [`lobby_${roomName}`, roomName.charAt(0).toUpperCase() + roomName.slice(1)],
        { type: roomName },
      )}
      {roomCountStr(openCount, closedCount)}
    </div>
  );
}

// ─── Game list ────────────────────────────────────────────────────

function GameList({
  state,
  stateRef,
  user,
  games,
  currentGame,
}: {
  state: LobbyLocalState;
  stateRef: React.MutableRefObject<LobbyLocalState>;
  user: User;
  games: Game[];
  currentGame: Game | null;
}): React.ReactElement {
  const visibleFormats = useAppState((s) => s.visibleFormats);
  const roomGames = games.filter((g) => g.room === state.room);
  const filteredGames = filterGames(user, roomGames, visibleFormats);

  const allFormatsVisible =
    Object.keys(slugToFormat).length === visibleFormats.size;
  const countResource: [string, string] = allFormatsVisible
    ? ["lobby_game-count", ""]
    : ["lobby_game-count-filtered", ""];

  return (
    <>
      <div className="game-count">
        {trElement("h4", countResource, { cnt: String(filteredGames.length) })}
      </div>
      <div className="game-list">
        {filteredGames.length === 0 ? (
          trElement("h4", ["lobby_no-games", "No games"])
        ) : (
          filteredGames.map((game) => (
            <GameRow
              key={game.gameid}
              lobbyState={stateRef as never}
              game={game as never}
              currentGame={currentGame as never}
              editing={state.editing}
            />
          ))
        )}
      </div>
    </>
  );
}

// ─── Format toggle ────────────────────────────────────────────────

function FormatToggle({ slug }: { slug: string }): React.ReactElement {
  const visibleFormats = useAppState((s) => s.visibleFormats);
  const checked = visibleFormats.has(slug);
  const id = `filter-${slug}`;

  const onChange = useCallback(
    (evt: React.ChangeEvent<HTMLInputElement>) => {
      evt.stopPropagation();
      const current = useAppState.getState().visibleFormats;
      const next = new Set(current);
      if (checked) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      useAppState.setState({ visibleFormats: next } as Partial<AppStateShape>);
      lsSave("visible-formats", next);
    },
    [slug, checked],
  );

  return (
    <div>
      <input
        className="visible-formats"
        id={id}
        type="checkbox"
        onChange={onChange}
        checked={checked}
      />
      <label htmlFor={id} onClick={(e) => e.stopPropagation()}>
        {trFormat(slugToFormat[slug] ?? slug)}
      </label>
    </div>
  );
}

// ─── Button bar ───────────────────────────────────────────────────

function userInAnyGame(games: Game[], user: User): boolean {
  const id = user?._id;
  if (!id) return false;
  return games.some((g) => (g.players ?? []).some((p) => p.user?._id === id));
}

function NewGameButton({
  state,
  setState,
  games,
  user,
}: {
  state: LobbyLocalState;
  setState: React.Dispatch<React.SetStateAction<LobbyLocalState>>;
  games: Game[];
  user: User;
}): React.ReactElement {
  const gameid = currentGameID();
  const canCreate =
    !gameid &&
    !state.editing &&
    state.room !== "tournament" &&
    !userInAnyGame(games, user);

  return condButton(
    trSpan(["lobby_new-game", "New game"]),
    canCreate,
    () => {
      authenticated(() => {
        wsSend("lobby/block-game-creation");
        setState((prev) => ({ ...prev, editing: true }));
        const el = document.querySelector(".game-title") as HTMLInputElement | null;
        el?.select();
        resumeSound();
      });
    },
  );
}

function ReloadLobbyButton(): React.ReactElement {
  return (
    <button
      className="reload-button"
      type="button"
      onClick={() => wsSend("lobby/list")}
    >
      {trSpan(["lobby_reload", "Reload list"])}
    </button>
  );
}

function LoadReplayButton({
  state,
  setState,
  games,
  user,
}: {
  state: LobbyLocalState;
  setState: React.Dispatch<React.SetStateAction<LobbyLocalState>>;
  games: Game[];
  user: User;
}): React.ReactElement {
  const gameid = currentGameID();
  const canLoad =
    !gameid &&
    !state.editing &&
    state.room !== "tournament" &&
    !userInAnyGame(games, user);

  return condButton(
    trSpan(["lobby_load-replay", "Load replay"]),
    canLoad,
    () => {
      authenticated(() => {
        setState((prev) => ({ ...prev, replay: true }));
        resumeSound();
      });
    },
  );
}

function ButtonBar({
  state,
  setState,
  games,
  user,
}: {
  state: LobbyLocalState;
  setState: React.Dispatch<React.SetStateAction<LobbyLocalState>>;
  games: Game[];
  user: User;
}): React.ReactElement {
  return (
    <div className="button-bar">
      <div className="rooms">
        <div id="filter" className="dropdown">
          <a href="" data-toggle="dropdown" onClick={(e) => e.preventDefault()}>
            {trSpan(["lobby_filter", "Filter"])}
            <b className="caret" />
          </a>
          <div className="dropdown-menu blue-shade">
            {Object.keys(slugToFormat).map((slug) => (
              <FormatToggle key={slug} slug={slug} />
            ))}
          </div>
        </div>
        <RoomTab
          state={state}
          setState={setState}
          user={user}
          games={games}
          room="casual"
          roomName="casual"
        />
        <RoomTab
          state={state}
          setState={setState}
          user={user}
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
            user={user}
          />
          <ReloadLobbyButton />
          <LoadReplayButton
            state={state}
            setState={setState}
            games={games}
            user={user}
          />
        </div>
      )}
    </div>
  );
}

// ─── Panels ───────────────────────────────────────────────────────

function GamesListPanel({
  state,
  setState,
  stateRef,
  games,
  currentGame,
  user,
}: {
  state: LobbyLocalState;
  setState: React.Dispatch<React.SetStateAction<LobbyLocalState>>;
  stateRef: React.MutableRefObject<LobbyLocalState>;
  games: Game[];
  currentGame: Game | null;
  user: User;
}): React.ReactElement {
  useEffect(() => {
    lobbyUpdatesContinue();
    return () => {
      lobbyUpdatesPause();
    };
  }, []);

  return (
    <div className="games">
      <ButtonBar state={state} setState={setState} games={games} user={user} />
      {state.room === "angel-arena" ? (
        // angel-arena exports gameList; preserve the cljs-style call shape.
        angelArena.gameList(
          { current: state } as never,
          { games, currentGame } as never,
        ) as React.ReactNode
      ) : (
        <GameList
          state={state}
          stateRef={stateRef}
          user={user}
          games={games}
          currentGame={currentGame}
        />
      )}
    </div>
  );
}

function RightPanel({
  state,
  setState,
  stateRef,
  decks,
  currentGame,
  user,
}: {
  state: LobbyLocalState;
  setState: React.Dispatch<React.SetStateAction<LobbyLocalState>>;
  stateRef: React.MutableRefObject<LobbyLocalState>;
  decks: unknown[];
  currentGame: Game | null;
  user: User;
}): React.ReactElement | null {
  if (state.room === "angel-arena") {
    return (angelArena.gamePanel as unknown as (props: { decks: unknown[] }) => React.ReactElement)({ decks });
  }

  if (state.replay) {
    return <ReplayPage />;
  }

  if (state.editing) {
    // new_game.tsx expects a MutableRefObject<{ editing: boolean, ... }> and
    // mutates `.current.editing = false` on submit. The proxy ref propagates
    // that mutation back into React state, dismissing the new-game panel.
    return createNewGame(
      stateRef as unknown as React.MutableRefObject<{ editing: boolean; [key: string]: unknown }>,
      user as Record<string, unknown> | null,
    );
  }

  const pwGame = state["password-game"] ?? state.passwordGame;
  if (pwGame) {
    return passwordGame({
      lobbyState: { "password-game": pwGame } as never,
      setLobbyState: ((updater: unknown) => {
        setState((prev) => {
          const partial =
            typeof updater === "function"
              ? (updater as (s: Record<string, unknown>) => Record<string, unknown>)(prev as never)
              : updater;
          // Keep camelCase and kebab-case in sync.
          const merged = { ...prev, ...(partial as Partial<LobbyLocalState>) };
          if ("password-game" in (partial as object)) {
            merged.passwordGame = (partial as Partial<LobbyLocalState>)["password-game"] ?? null;
          }
          if ("passwordGame" in (partial as object)) {
            merged["password-game"] = (partial as Partial<LobbyLocalState>).passwordGame ?? null;
          }
          return merged;
        });
      }) as never,
    });
  }

  if (currentGame && !currentGame.started) {
    return <PendingGame currentGame={currentGame as never} user={user as never} />;
  }

  return null;
}

// ─── Replay URL params ────────────────────────────────────────────

function loadReplayFromParams(params: string): void {
  // Clear the trigger so we don't re-process.
  useAppState.setState({ "replay-id": null } as Partial<AppStateShape>);
  const bugReport = /bug-report/.test(params);
  const idMatch = /([0-9a-f-]+)/.exec(params);
  const nMatch = /n=(\d+)/.exec(params);
  const dMatch = /d=(\d+)/.exec(params);
  const bMatch = /b=(\d+)/.exec(params);
  const replayId = idMatch?.[1];
  if (!replayId) return;

  window.history.replaceState({}, "", "/play");

  const n = nMatch ? parseInt(nMatch[1], 10) : undefined;
  const d = dMatch ? parseInt(dMatch[1], 10) : undefined;
  const b = bMatch ? parseInt(bMatch[1], 10) : undefined;

  if (bugReport) {
    startSharedReplay(replayId, { bug: b ?? 0 });
  } else if (n !== undefined && d !== undefined) {
    startSharedReplay(replayId, { n, d });
  } else {
    startSharedReplay(replayId, null);
  }
  resumeSound();
}

// ─── Main component ───────────────────────────────────────────────

// Wrap the React state in a Proxy that calls setState when any field is
// written. Inner components written against the cljs `swap! lobby-state`
// pattern mutate `lobbyState.current.foo = bar`; this proxy turns those into
// real React updates so the parent re-renders.
function useLobbyStateRef(
  state: LobbyLocalState,
  setState: React.Dispatch<React.SetStateAction<LobbyLocalState>>,
): React.MutableRefObject<LobbyLocalState> {
  const liveRef = useRef(state);
  liveRef.current = state;
  const refRef = useRef<React.MutableRefObject<LobbyLocalState> | null>(null);
  if (refRef.current === null) {
    const target: { current: LobbyLocalState } = { current: state };
    refRef.current = new Proxy(target, {
      get: (_t, key) => {
        if (key === "current") {
          return new Proxy(liveRef.current as unknown as Record<string, unknown>, {
            get: (_t2, k) => (liveRef.current as unknown as Record<string, unknown>)[k as string],
            set: (_t2, k, v) => {
              const field = k as string;
              setState((prev) => {
                const next: LobbyLocalState = { ...prev, [field]: v } as LobbyLocalState;
                if (field === "passwordGame") next["password-game"] = v as never;
                if (field === "password-game") next.passwordGame = v as never;
                return next;
              });
              return true;
            },
          }) as unknown as LobbyLocalState;
        }
        return (target as unknown as Record<string, unknown>)[key as string];
      },
    }) as React.MutableRefObject<LobbyLocalState>;
  }
  return refRef.current!;
}

export function GameLobby(): React.ReactElement {
  const [state, setState] = useState<LobbyLocalState>({
    room: "casual",
    editing: false,
    replay: false,
    passwordGame: null,
    "password-game": null,
    showModMenu: false,
  });

  const stateRef = useLobbyStateRef(state, setState);

  const user = (useAppState((s) => s.user) as User | null) ?? {};
  const games = useAppState((s) => s.games) as Game[];
  const currentGame = useAppState((s) => s.currentGame) as Game | null;
  const decks = useAppState((s) => s.decks);
  const replayId = useAppState((s) => (s as Record<string, unknown>)["replay-id"]) as string | null;

  // Mirrors top-level (authenticated (fn [_] nil)) — open login if needed.
  useEffect(() => {
    authenticated(() => {});
  }, []);

  // Guard the replay-trigger so we only invoke once per replay-id.
  const replayHandled = useRef<string | null>(null);
  useEffect(() => {
    if (replayId && replayHandled.current !== replayId) {
      replayHandled.current = replayId;
      loadReplayFromParams(replayId);
    }
  }, [replayId]);

  return (
    <div className="container">
      <div className="lobby-bg" />
      <div className="lobby panel blue-shade">
        <GamesListPanel
          state={state}
          setState={setState}
          stateRef={stateRef}
          games={games}
          currentGame={currentGame}
          user={user}
        />
        <RightPanel
          state={state}
          setState={setState}
          stateRef={stateRef}
          decks={decks}
          currentGame={currentGame}
          user={user}
        />
      </div>
    </div>
  );
}

export default GameLobby;

// Backwards-compat alias for the previous lowercase export.
export const gameLobby = GameLobby;

// Re-exports kept for other modules that import from here.
export { leaveGameFromLobby as leaveGameFn, startSharedReplay, slugToFormat };
