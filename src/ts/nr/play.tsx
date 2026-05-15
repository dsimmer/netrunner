// Play / lobby page: game list, new game creation, lobby chat.
// Mirrors: src/cljs/nr/lobby.cljs + nr/game_row.cljs + nr/new_game.cljs
import React, { useEffect, useState } from "react";
import { useAppState } from "./appstate";
import { wsSend, onWSEvent, lobbyUpdatesContinue, lobbyUpdatesPause } from "./ws";
import { authenticated, showModal } from "./auth";
import { GET } from "./ajax";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

interface LobbyPlayer {
  user: { _id: string; username: string; emailhash?: string };
  side?: string;
  "deck-name"?: string;
}

interface GameEntry {
  gameid: string;
  title: string;
  started: boolean;
  room: string;
  format?: string;
  players: LobbyPlayer[];
  spectators?: LobbyPlayer[];
  "allow-spectator"?: boolean;
  "spectatorhands"?: boolean;
  protected?: boolean;
}

const FORMATS = [
  ["standard", "Standard"], ["startup", "Startup"], ["eternal", "Eternal"],
  ["system-gateway", "System Gateway"], ["core", "Core Experience"],
  ["quick-draft", "Quick Draft"], ["chimera", "Chimera"], ["preconstructed", "Preconstructed"],
  ["casual", "Casual"],
];

// ──────────────────────────────────────────────────────────────────
// New Game form
// ──────────────────────────────────────────────────────────────────

function NewGameForm({ room, onCancel }: { room: string; onCancel: () => void }): React.ReactElement {
  const blockCreation = useAppState(s => s.blockGameCreation);
  const [title, setTitle] = useState("");
  const [side, setSide] = useState("Any Side");
  const [format, setFormat] = useState("standard");
  const [allowSpectator, setAllowSpectator] = useState(true);
  const [spectatorHands, setSpectatorHands] = useState(false);
  const [saveReplay, setSaveReplay] = useState(false);
  const [openDecklists, setOpenDecklists] = useState(false);
  const [password, setPassword] = useState("");
  const [flash, setFlash] = useState("");

  function createGame() {
    authenticated(() => {
      if (!title.trim()) { setFlash("Please fill a game title."); return; }
      wsSend("lobby/create", {
        title, side, format, room,
        "allow-spectator": allowSpectator,
        spectatorhands: spectatorHands,
        "save-replay": saveReplay,
        "open-decklists": openDecklists,
        password: password || null,
      });
      onCancel();
    });
  }

  return (
    <div className="new-game-panel panel blue-shade">
      {flash && <p className="flash-message">{flash}</p>}
      <section>
        <h3>Title</h3>
        <input className="game-title" type="text" maxLength={100}
          placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
      </section>
      <section>
        <h3>Side</h3>
        {["Any Side", "Corp", "Runner"].map(opt => (
          <p key={opt}>
            <label>
              <input type="radio" name="side" value={opt} checked={side === opt}
                onChange={() => setSide(opt)} />
              {" "}{opt}
            </label>
          </p>
        ))}
      </section>
      <section>
        <h3>Format</h3>
        <select value={format} onChange={e => setFormat(e.target.value)}>
          {FORMATS.map(([slug, name]) => (
            <option key={slug} value={slug}>{name}</option>
          ))}
        </select>
      </section>
      <section>
        <h3>Options</h3>
        <p><label><input type="checkbox" checked={allowSpectator}
          onChange={e => setAllowSpectator(e.target.checked)} /> Allow spectators</label></p>
        <p><label><input type="checkbox" checked={spectatorHands}
          onChange={e => setSpectatorHands(e.target.checked)} /> Spectators can see hands</label></p>
        <p><label><input type="checkbox" checked={saveReplay}
          onChange={e => setSaveReplay(e.target.checked)} /> Save replay</label></p>
        <p><label><input type="checkbox" checked={openDecklists}
          onChange={e => setOpenDecklists(e.target.checked)} /> Open decklists</label></p>
        <p>
          <label>Password (optional):</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </p>
      </section>
      <div className="button-bar">
        <button disabled={blockCreation} onClick={createGame}
          title={blockCreation ? "Game creation is currently paused for maintenance." : ""}>
          Create
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Pending game (waiting for opponent)
// ──────────────────────────────────────────────────────────────────

function PendingGame({ game, user }: { game: GameEntry; user: Record<string, unknown> | null }): React.ReactElement {
  function leave() {
    wsSend("lobby/leave", { gameid: game.gameid });
  }

  function kick(uid: string) {
    wsSend("lobby/kick", { gameid: game.gameid, uid });
  }

  function start() {
    wsSend("game/start", { gameid: game.gameid });
  }

  const isHost = user && game.players[0]?.user._id === (user._id as string);

  return (
    <div className="pending-game panel blue-shade">
      <h3>{game.title}</h3>
      <h4>Players</h4>
      <ul>
        {game.players.map((p, i) => (
          <li key={p.user._id}>
            {p.user.username} {p.side ? `(${p.side})` : ""}
            {isHost && i !== 0 && (
              <button onClick={() => kick(p.user._id)}>Kick</button>
            )}
          </li>
        ))}
      </ul>
      {(game.spectators?.length ?? 0) > 0 && (
        <>
          <h4>Spectators</h4>
          <ul>
            {game.spectators!.map(s => <li key={s.user._id}>{s.user.username}</li>)}
          </ul>
        </>
      )}
      <div className="button-bar">
        {isHost && game.players.length >= 2 && (
          <button onClick={start}>Start</button>
        )}
        <button onClick={leave}>Leave</button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Game row in list
// ──────────────────────────────────────────────────────────────────

function GameRow({
  game,
  currentGame,
  user,
}: {
  game: GameEntry;
  currentGame: GameEntry | null;
  user: Record<string, unknown> | null;
}): React.ReactElement {
  const alreadyInGame = currentGame != null;
  const started = game.started;
  const canJoin = !alreadyInGame && !started && game.players.length < 2;
  const canWatch = !alreadyInGame && (game["allow-spectator"] || !started);

  function join() {
    authenticated(() => {
      if (game.protected) {
        const pw = prompt("Password:");
        wsSend("lobby/join", { gameid: game.gameid, password: pw });
      } else {
        wsSend("lobby/join", { gameid: game.gameid });
      }
    });
  }

  function watch() {
    authenticated(() => {
      wsSend("lobby/watch", { gameid: game.gameid });
    });
  }

  const corpPlayer = game.players.find(p => p.side === "Corp") ?? game.players[0];
  const runnerPlayer = game.players.find(p => p.side === "Runner") ?? game.players[1];

  return (
    <div className="gameline">
      <div className="game-title">{game.title}</div>
      <div className="game-players">
        <span className="player corp">{corpPlayer?.user.username ?? "?"}</span>
        <span> vs </span>
        <span className="player runner">{runnerPlayer?.user.username ?? "?"}</span>
      </div>
      <div className="game-format">{game.format ?? "standard"}</div>
      <div className="game-actions">
        {canJoin && <button onClick={join}>Join</button>}
        {canWatch && <button onClick={watch}>Watch</button>}
        {started && <span className="started">In progress</span>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Room tabs
// ──────────────────────────────────────────────────────────────────

function RoomTabs({ room, onChange }: { room: string; onChange: (r: string) => void }): React.ReactElement {
  return (
    <div className="rooms">
      {[["casual", "Casual"], ["competitive", "Competitive"]].map(([key, label]) => (
        <button key={key} className={`room-tab${room === key ? " active" : ""}`}
          onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main lobby page
// ──────────────────────────────────────────────────────────────────

export default function PlayPage(): React.ReactElement {
  const user = useAppState(s => s.user);
  const games = useAppState(s => s.games) as GameEntry[];
  const currentGame = useAppState(s => s.currentGame) as GameEntry | null;
  const visibleFormats = useAppState(s => s.visibleFormats);

  const [room, setRoom] = useState("casual");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    onWSEvent("lobby/list", (data: unknown) => {
      useAppState.getState().setGames(data as unknown[]);
    });
    onWSEvent("lobby/state", (data: unknown) => {
      const g = data as GameEntry | null;
      useAppState.getState().setCurrentGame(g as never);
      if (g?.started) {
        wsSend("game/resync", { gameid: g.gameid });
      }
    });
    onWSEvent("lobby/toast", (data: unknown) => {
      const d = data as { message: string; type: string };
      console.log("lobby/toast:", d.message);
    });
    onWSEvent("lobby/block-game-creation", (data: unknown) => {
      useAppState.getState().setBlockGameCreation(data as boolean);
    });

    lobbyUpdatesContinue();
    return () => lobbyUpdatesPause();
  }, []);

  const roomGames = games.filter(g => g.room === room);
  const visibleGames = roomGames.filter(g => !g.format || visibleFormats.has(g.format));
  const inAGame = currentGame != null;

  const userInGame = games.some(g =>
    g.players.some(p => p.user._id === (user?._id as string))
  );

  return (
    <div className="container">
      <div className="lobby-bg" />
      <div className="lobby panel blue-shade">
        {/* Left: game list */}
        <div className="games">
          <div className="button-bar">
            <RoomTabs room={room} onChange={r => { setRoom(r); setEditing(false); }} />
            <div className="lobby-buttons">
              <button
                disabled={!!(inAGame || editing || userInGame)}
                onClick={() => authenticated(() => setEditing(true))}
              >
                New game
              </button>
              <button onClick={() => wsSend("lobby/list")}>Reload list</button>
            </div>
          </div>

          <div className="game-count">
            <h4>{visibleGames.length} game(s)</h4>
          </div>

          <div className="game-list">
            {visibleGames.length === 0 ? (
              <h4>No games</h4>
            ) : (
              visibleGames.map(g => (
                <GameRow key={g.gameid} game={g} currentGame={currentGame} user={user} />
              ))
            )}
          </div>
        </div>

        {/* Right: new game / pending game panel */}
        <div className="game-panel">
          {editing && (
            <NewGameForm room={room} onCancel={() => setEditing(false)} />
          )}
          {!editing && currentGame && !currentGame.started && (
            <PendingGame game={currentGame as GameEntry} user={user} />
          )}
          {!editing && (!currentGame || currentGame.started) && !editing && (
            <div className="no-game-panel panel blue-shade">
              <p>Select a game to join or watch, or create a new game.</p>
              {!user && (
                <p>
                  <a href="" onClick={e => { e.preventDefault(); showModal("login"); }}>
                    Log in
                  </a>{" "}
                  to create or join games.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
