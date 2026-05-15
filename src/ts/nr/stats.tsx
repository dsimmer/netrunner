// Stats page: user stats and game history.
// Mirrors: src/cljs/nr/stats.cljs
import React, { useEffect, useState } from "react";
import { useAppState } from "./appstate";
import { GET, DELETE } from "./ajax";
import { authenticated } from "./auth";

interface GameRecord {
  gameid: string;
  title: string;
  turn?: number;
  winner?: string;
  "replay-shared"?: boolean;
  "has-replay"?: boolean;
  "start-date"?: string;
  corp?: {
    player?: { username: string };
    identity?: string;
    "deck-name"?: string;
  };
  runner?: {
    player?: { username: string };
    identity?: string;
    "deck-name"?: string;
  };
  log?: unknown[];
  stats?: {
    corp?: Record<string, unknown>;
    runner?: Record<string, unknown>;
  };
}

interface UserStats {
  "games-started"?: number;
  "games-completed"?: number;
  "corp-wins"?: number;
  "corp-losses"?: number;
  "runner-wins"?: number;
  "runner-losses"?: number;
}

function safeDiv(a: number, b: number): string {
  if (b === 0) return "0%";
  return `${Math.round((a / b) * 100)}%`;
}

function StatSection({
  label,
  startKey, completeKey, winKey, loseKey,
  stats,
}: {
  label: string;
  startKey: keyof UserStats;
  completeKey: keyof UserStats;
  winKey: keyof UserStats;
  loseKey: keyof UserStats;
  stats: UserStats;
}): React.ReactElement {
  const started = (stats[startKey] as number) ?? 0;
  const completed = (stats[completeKey] as number) ?? 0;
  const win = (stats[winKey] as number) ?? 0;
  const lose = (stats[loseKey] as number) ?? 0;
  const incomplete = started - completed;

  return (
    <section>
      <h4>{label}</h4>
      <div>Started: {started}</div>
      <div>Completed: {completed} ({safeDiv(completed, started)})</div>
      <div>Not completed: {incomplete} ({safeDiv(incomplete, started)})</div>
      <div>Won: {win} ({safeDiv(win, win + lose)})</div>
      <div>Lost: {lose} ({safeDiv(lose, win + lose)})</div>
    </section>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function GameRow({
  game,
  user,
  onView,
}: {
  game: GameRecord;
  user: Record<string, unknown> | null;
  onView: (g: GameRecord) => void;
}): React.ReactElement {
  const username = user?.username as string | undefined;
  const corpUsername = game.corp?.player?.username;
  const runnerUsername = game.runner?.player?.username;
  const userIsWinner = game.winner === "corp"
    ? username === corpUsername
    : username === runnerUsername;
  const borderColor = game.winner ? (userIsWinner ? "#6AB56A" : "#Ea7d7f") : undefined;

  return (
    <div className="gameline" style={{ minHeight: "auto", borderColor }}>
      <button className="float-right" onClick={() => onView(game)}>
        View log
      </button>
      <h4 className="log-title">
        {game.title} (Turn {game.turn ?? 0})
        {game["has-replay"] && (game["replay-shared"] ? " ⭐" : " 🟢")}
      </h4>
      <div className="log-date">{formatDate(game["start-date"])}</div>
      <div><span className="player">{corpUsername} - {game.corp?.identity ?? ""}</span></div>
      <div><span className="player">{runnerUsername} - {game.runner?.identity ?? ""}</span></div>
      {game.winner && (
        <h4>Winner: {game.winner}{userIsWinner ? " (You)" : ""}</h4>
      )}
    </div>
  );
}

function GameDetails({
  game,
  onReturn,
}: {
  game: GameRecord;
  onReturn: () => void;
}): React.ReactElement {
  const replayLink = `${window.location.origin}/replay/${game.gameid}`;

  function shareReplay() {
    GET(`/profile/history/share/${game.gameid}`);
  }

  return (
    <div className="games panel">
      <p className="return-button">
        <button onClick={onReturn}>Return to stats screen</button>
      </p>
      <h4>
        {game.title}
        {game["has-replay"] && (game["replay-shared"] ? " ⭐" : " 🟢")}
      </h4>
      <div className="game-details-table">
        <div>Winner: {game.winner}</div>
        <div>Started: {formatDate(game["start-date"])}</div>
      </div>
      <p>
        {game["has-replay"] && !game["replay-shared"] && (
          <button onClick={shareReplay}>Share replay</button>
        )}
        {game["has-replay"] ? (
          <>
            <button onClick={() => { window.location.href = replayLink; }}>Launch Replay</button>
            <a className="button" href={`/profile/history/full/${game.gameid}`} download={`${game.title}.json`}>
              Download replay
            </a>
          </>
        ) : (
          <span>Replay unavailable</span>
        )}
      </p>
      {game["replay-shared"] && (
        <p><input className="share-link" type="text" readOnly value={replayLink} /></p>
      )}
      {game.log && (
        <div className="panel messages">
          {(game.log as Array<{ user: string | { username: string }; text: string }>).map((msg, i) => {
            if (msg.user === "__system__") {
              return <div key={i} className="system">{msg.text}</div>;
            }
            const uname = typeof msg.user === "string" ? msg.user : msg.user?.username;
            return (
              <div key={i} className="message">
                <div className="content">
                  <div className="username">{uname}</div>
                  <div>{msg.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StatsPage(): React.ReactElement {
  const user = useAppState(s => s.user);
  const stats = useAppState(s => s.stats) as UserStats | null;
  const [games, setGames] = useState<GameRecord[]>([]);
  const [viewGame, setViewGame] = useState<GameRecord | null>(null);
  const [filterReplays, setFilterReplays] = useState(false);

  useEffect(() => {
    authenticated(() => {
      GET("/profile/history").then(r => {
        if (r.status === 200 && Array.isArray(r.json)) {
          setGames(r.json as GameRecord[]);
        }
      });
    });
  }, []);

  function viewLog(game: GameRecord) {
    GET(`/profile/history/${game.gameid}`).then(r => {
      if (r.status === 200) {
        setViewGame({ ...game, log: r.json as unknown[] });
      }
    });
  }

  function clearUserStats() {
    authenticated(() => {
      DELETE("/profile/stats/user").then(r => {
        if (r.status === 200) {
          useAppState.getState().setOptions({ stats: r.json } as never);
        }
      });
    });
  }

  const visibleGames = filterReplays ? games.filter(g => g["replay-shared"]) : games;

  return (
    <div className="page-container">
      <div className="stats-bg" />
      <div className="lobby panel blue-shade">
        {/* Left: user stats */}
        <div className="stats-left">
          {stats ? (
            <>
              <StatSection
                label="Corp"
                startKey="games-started"
                completeKey="games-completed"
                winKey="corp-wins"
                loseKey="corp-losses"
                stats={stats}
              />
              <StatSection
                label="Runner"
                startKey="games-started"
                completeKey="games-completed"
                winKey="runner-wins"
                loseKey="runner-losses"
                stats={stats}
              />
            </>
          ) : (
            <p>No stats available.</p>
          )}
          <button onClick={clearUserStats}>Clear stats</button>
        </div>

        {/* Right: game history or game detail */}
        <div className="stats-right">
          {viewGame ? (
            <GameDetails game={viewGame} onReturn={() => setViewGame(null)} />
          ) : (
            <div className="game-panel">
              <div className="controls">
                <button onClick={() => setFilterReplays(f => !f)}>
                  {filterReplays ? "Show all games" : "Only show shared"}
                </button>
                <span className="log-count">{visibleGames.length} game(s)</span>
              </div>
              {visibleGames.length === 0 ? (
                <h4>No games</h4>
              ) : (
                visibleGames.map(g => (
                  <GameRow key={g.gameid} game={g} user={user} onView={viewLog} />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
