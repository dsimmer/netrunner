// Stats page: user stats panel + game history with replays.
// Mirrors: src/cljs/nr/stats.cljs
import React, { useEffect, useRef, useState } from "react";
import { useAppState } from "./appstate";
import { GET, DELETE } from "./ajax";
import { authenticated } from "./auth";
import { Avatar } from "./avatar";
import EndOfGameStats from "./end_of_game_stats";
import { tr, trFormat, trRoomType, trSide } from "./translations";
import {
  dayWordWithTimeFormatter,
  factionIcon,
  formatDateTime,
  notNumToZero,
  numToPercent,
  playerHighlightOptionClass,
  renderMessage,
  renderPlayerHighlight,
  setScrollTop,
  storeScrollTop,
} from "./utils";
import { AllCards } from "../jinteki/cards";
import { onWSEvent } from "./ws";

// ─── Types ──────────────────────────────────────────────────────────

interface LogMessage {
  user: string | { username?: string; emailhash?: string };
  text: string;
}

interface PlayerSide {
  player?: { username?: string; emailhash?: string };
  identity?: string;
  "deck-name"?: string;
}

interface GameRecord {
  gameid: string;
  title: string;
  format?: string;
  room?: string;
  turn?: number;
  winner?: string;
  reason?: string;
  "replay-shared"?: boolean;
  "has-replay"?: boolean;
  "start-date"?: string;
  "end-date"?: string;
  corp?: PlayerSide;
  runner?: PlayerSide;
  log?: LogMessage[];
  stats?: {
    corp?: Record<string, unknown>;
    runner?: Record<string, unknown>;
  };
}

interface UserStats {
  "games-started"?: number;
  "games-completed"?: number;
  "wins"?: number;
  "loses"?: number;
  "games-started-corp"?: number;
  "games-completed-corp"?: number;
  "wins-corp"?: number;
  "loses-corp"?: number;
  "games-started-runner"?: number;
  "games-completed-runner"?: number;
  "wins-runner"?: number;
  "loses-runner"?: number;
  [key: string]: unknown;
}

// ─── Module-scoped scroll positions (mirrors atom 0 in stats fn) ────
const listScrollTopRef = { value: 0 };
const logScrollTopRef = { value: 0 };

// ─── Helpers ────────────────────────────────────────────────────────

function replayLinkFor(game: GameRecord): string {
  return `${window.location.origin}/replay/${game.gameid}`;
}

function launchReplay(game: GameRecord): void {
  window.location.href = replayLinkFor(game);
}

// Mirrors: update-deck-stats in stats.cljs
function updateDeckStats(deckId: string, deckStats: unknown): void {
  const decks = useAppState.getState().decks as Array<Record<string, unknown>>;
  const updated = decks.map((d) =>
    d._id === deckId ? { ...d, stats: deckStats } : d,
  );
  useAppState.getState().setDecks(updated);
}

// Mirrors: fetch-game-history
async function fetchGameHistory(setGames: (g: GameRecord[]) => void): Promise<void> {
  const r = await GET("/profile/history");
  if (r.status === 200 && Array.isArray(r.json)) {
    setGames(r.json as GameRecord[]);
  }
}

// Mirrors: clear-user-stats
function clearUserStats(): void {
  authenticated(() => {
    DELETE("/profile/stats/user").then((r) => {
      useAppState.setState({ stats: r.json });
    });
  });
}

// Mirrors: defmethod :stats/update — registered once at module load
let statsUpdateRegistered = false;
function registerStatsUpdateHandler(refreshHistory: () => void): void {
  if (statsUpdateRegistered) return;
  statsUpdateRegistered = true;
  onWSEvent("stats/update", (data: unknown) => {
    const d = data as { userstats?: UserStats; "deck-id"?: string; deckstats?: unknown };
    if (d.userstats !== undefined) {
      useAppState.setState({ stats: d.userstats });
    }
    if (d["deck-id"]) {
      updateDeckStats(d["deck-id"], d.deckstats);
    }
    refreshHistory();
  });
}

// ─── Stat view (Game/Corp/Runner sections) ──────────────────────────

interface StatSectionKeys {
  startKey: keyof UserStats;
  completeKey: keyof UserStats;
  winKey: keyof UserStats;
  loseKey: keyof UserStats;
}

function StatView({
  stats,
  startKey,
  completeKey,
  winKey,
  loseKey,
}: StatSectionKeys & { stats: UserStats }): React.ReactElement {
  const started = notNumToZero(stats[startKey]);
  const completed = notNumToZero(stats[completeKey]);
  const pc = numToPercent(completed, started);
  const win = notNumToZero(stats[winKey]);
  const lose = notNumToZero(stats[loseKey]);
  const pw = numToPercent(win, win + lose);
  const pl = numToPercent(lose, win + lose);
  const incomplete = notNumToZero(started - completed);
  const pi = numToPercent(incomplete, started);
  const gamestats = useAppState((s) => (s.options as Record<string, unknown>)["gamestats"]) as string | undefined;

  return (
    <section>
      <div>{tr(["stats_started", "Started"], { started: String(started) })}</div>
      <div>{tr(["stats_completed", "Completed"], { completed: String(completed), percent: pc })}</div>
      <div>{tr(["stats_not-completed", "Not completed"], { completed: String(incomplete), percent: pi })}</div>
      {gamestats !== "none" && (
        <>
          <div>{tr(["stats_won", "Won"], { won: String(win), percent: pw })}</div>
          <div>{tr(["stats_lost", "Lost"], { lost: String(lose), percent: pl })}</div>
        </>
      )}
    </section>
  );
}

function StatsPanel({ stats }: { stats: UserStats }): React.ReactElement {
  return (
    <div className="games panel">
      <div className="games">
        <div>
          <h3>{tr(["stats_game-stats", "Game Stats"])}</h3>
          <StatView
            stats={stats}
            startKey="games-started"
            completeKey="games-completed"
            winKey="wins"
            loseKey="loses"
          />
        </div>
        <div>
          <h3>{tr(["stats_corp-stats", "Corp Stats"])}</h3>
          <StatView
            stats={stats}
            startKey="games-started-corp"
            completeKey="games-completed-corp"
            winKey="wins-corp"
            loseKey="loses-corp"
          />
        </div>
        <div>
          <h3>{tr(["stats_runner-stats", "Runner Stats"])}</h3>
          <StatView
            stats={stats}
            startKey="games-started-runner"
            completeKey="games-completed-runner"
            winKey="wins-runner"
            loseKey="loses-runner"
          />
        </div>
      </div>
      <p>
        <button onClick={clearUserStats}>
          {tr(["stats_clear-stats", "Clear Stats"])}
        </button>
      </p>
    </div>
  );
}

// ─── Game details panel ─────────────────────────────────────────────

function GameDetails({
  game,
  onReturn,
  onShared,
}: {
  game: GameRecord;
  onReturn: () => void;
  onShared: () => void;
}): React.ReactElement {
  function shareReplay() {
    GET(`/profile/history/share/${game.gameid}`).then((r) => {
      if (r.status === 200) onShared();
    });
  }

  return (
    <div className="games panel">
      <p className="return-button">
        <button onClick={onReturn}>
          {tr(["stats_view-games", "Return to stats screen"])}
        </button>
      </p>
      <h4>
        {game.title}
        {game["has-replay"] && (game["replay-shared"] ? " ⭐" : " 🟢")}
      </h4>
      <div>
        <div className="game-details-table">
          <div>{tr(["stats_lobby", "Lobby:"], { lobby: trRoomType(game.room ?? "") })}</div>
          <div>{tr(["stats_format", "Format:"], { format: trFormat(game.format ?? "") })}</div>
          <div>{tr(["stats_winner", "Winner:"], { winner: game.winner ? trSide(game.winner) : "" })}</div>
          <div>{tr(["stats_win-method", "Win method:"], { reason: game.reason ?? "" })}</div>
          <div>{tr(["stats_started", "Started:"], { started: game["start-date"] ?? "" })}</div>
          <div>{tr(["stats_ended", "Ended:"], { ended: game["end-date"] ?? "" })}</div>
        </div>
        {game.stats && (
          <EndOfGameStats
            corp={(game.stats.corp ?? {}) as Record<string, unknown>}
            runner={(game.stats.runner ?? {}) as Record<string, unknown>}
          />
        )}
        <p>
          {game["has-replay"] && !game["replay-shared"] && (
            <button onClick={shareReplay}>
              {tr(["stats_share", "Share replay"])}
            </button>
          )}
          {game["has-replay"] ? (
            <span>
              <button onClick={() => launchReplay(game)}>
                {tr(["stats_launch", "Launch Replay"])}
              </button>
              <a
                className="button"
                href={`/profile/history/full/${game.gameid}`}
                download={`${game.title}.json`}
              >
                {tr(["stats_download", "Download replay"])}
              </a>
            </span>
          ) : (
            tr(["stats_unavailable", "Replay unavailable"])
          )}
        </p>
        {game["replay-shared"] && (
          <p>
            <input
              className="share-link"
              type="text"
              readOnly
              value={replayLinkFor(game)}
            />
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Game log panel ─────────────────────────────────────────────────

function GameLog({ game }: { game: GameRecord }): React.ReactElement {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const corp = game.corp?.player?.username ?? "";
  const runner = game.runner?.player?.username ?? "";
  const highlightClass = playerHighlightOptionClass();

  useEffect(() => {
    setScrollTop(nodeRef.current, logScrollTopRef.value);
    return () => {
      storeScrollTop(nodeRef.current, (n) => { logScrollTopRef.value = n; });
    };
  }, []);

  return (
    <div style={{ overflow: "auto" }} ref={nodeRef}>
      <div className={`panel messages${highlightClass ? ` ${highlightClass}` : ""}`}>
        {game.log && game.log.length > 0 ? (
          game.log.map((msg, i) => {
            if (msg.user === "__system__" && msg.text === "typing") return null;
            if (msg.user === "__system__") {
              return (
                <div className="system" key={i}>
                  {renderMessage(renderPlayerHighlight(msg.text, corp, runner) as unknown as string) as React.ReactNode}
                </div>
              );
            }
            const u = msg.user as { username?: string; emailhash?: string };
            return (
              <div className="message" key={i}>
                <Avatar user={u} opts={{ size: 38 }} />
                <div className="content">
                  <div className="username">{u.username}</div>
                  <div>{renderMessage(msg.text) as React.ReactNode}</div>
                </div>
              </div>
            );
          })
        ) : (
          <h4>{tr(["stats_no-log", "No log available"])}</h4>
        )}
      </div>
    </div>
  );
}

// ─── Game row in history list ───────────────────────────────────────

function GameRow({
  game,
  user,
  onView,
}: {
  game: GameRecord;
  user: Record<string, unknown> | null;
  onView: (g: GameRecord) => void;
}): React.ReactElement {
  const corpCard = game.corp?.identity ? AllCards[game.corp.identity] : undefined;
  const runnerCard = game.runner?.identity ? AllCards[game.runner.identity] : undefined;
  const turnCount = game.turn ?? 0;
  const username = user?.username as string | undefined;
  const userIsCorp = username === game.corp?.player?.username;
  const userWin = String(game.winner) === "corp"
    ? (userIsCorp ? " (You)" : "")
    : (username === game.runner?.player?.username ? " (You)" : "");
  const userDeckName = userIsCorp
    ? game.corp?.["deck-name"]
    : game.runner?.["deck-name"];
  const borderColor = game.winner
    ? (userWin === " (You)" ? "#6AB56A" : "#Ea7d7f")
    : undefined;

  return (
    <div className="gameline" style={{ minHeight: "auto", borderColor }}>
      <button className="float-right" onClick={() => onView(game)}>
        {tr(["stats_view-log", "View log"])}
      </button>
      <h4
        className="log-title"
        title={game["replay-shared"] ? tr(["stats_replay-shared", "Replay shared"]) : undefined}
      >
        {tr(["stats_game-title", ""], { title: game.title, cnt: String(turnCount) })}
        {game["has-replay"] && (game["replay-shared"] ? " ⭐" : " 🟢")}
      </h4>

      <div className="log-date">
        {formatDateTime(dayWordWithTimeFormatter, game["start-date"] ?? "")}
      </div>

      <div>
        <span className="player">
          <Avatar user={(game.corp?.player ?? {}) as { username?: string; emailhash?: string }} opts={{ size: 24 }} />
          {game.corp?.player?.username} {" - "}
          <span className="identity-deck">
            <span>
              {corpCard ? factionIcon((corpCard.faction as string) ?? "", (corpCard.title as string) ?? "") : null}
              {" "}{(corpCard?.title as string) ?? ""}
            </span>
            {userIsCorp && userDeckName && (
              <span className="deck-name">{userDeckName}</span>
            )}
          </span>
        </span>
      </div>

      <div>
        <span className="player">
          <Avatar user={(game.runner?.player ?? {}) as { username?: string; emailhash?: string }} opts={{ size: 24 }} />
          {game.runner?.player?.username} {" - "}
          <span className="identity-deck">
            <span>
              {runnerCard ? factionIcon((runnerCard.faction as string) ?? "", (runnerCard.title as string) ?? "") : null}
              {" "}{(runnerCard?.title as string) ?? ""}
            </span>
            {!userIsCorp && userDeckName && (
              <span className="deck-name">{userDeckName}</span>
            )}
          </span>
        </span>
      </div>

      {game.winner && (
        <h4>
          {tr(["stats_winner", "Winner"], { winner: trSide(game.winner) })}{userWin}
        </h4>
      )}
    </div>
  );
}

// ─── History list ───────────────────────────────────────────────────

function HistoryList({
  games,
  user,
  filterReplays,
  onToggleFilter,
  onView,
}: {
  games: GameRecord[];
  user: Record<string, unknown> | null;
  filterReplays: boolean;
  onToggleFilter: () => void;
  onView: (g: GameRecord) => void;
}): React.ReactElement {
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setScrollTop(nodeRef.current, listScrollTopRef.value);
    return () => {
      storeScrollTop(nodeRef.current, (n) => { listScrollTopRef.value = n; });
    };
  }, []);

  const visible = filterReplays
    ? games.filter((g) => g["replay-shared"])
    : games;
  const cnt = visible.length;

  return (
    <div className="game-list" ref={nodeRef}>
      <div className="controls">
        <button onClick={onToggleFilter}>
          {filterReplays
            ? tr(["stats_all-games", "Show all games"])
            : tr(["stats_shared-games", "Only show shared"])}
        </button>
        <span className="log-count">
          {filterReplays
            ? tr(["stats_log-count-filtered", ""], { cnt: String(cnt) })
            : tr(["stats_log-count", ""], { cnt: String(cnt) })}
        </span>
      </div>
      {visible.length === 0 ? (
        <h4>{tr(["stats_no-games", "No games"])}</h4>
      ) : (
        visible.map((g) => (
          <GameRow key={g.gameid} game={g} user={user} onView={onView} />
        ))
      )}
    </div>
  );
}

// ─── Top-level page ─────────────────────────────────────────────────

export default function StatsPage(): React.ReactElement {
  const user = useAppState((s) => s.user) as Record<string, unknown> | null;
  const stats = useAppState((s) => s.stats) as UserStats | null;
  const [games, setGames] = useState<GameRecord[]>([]);
  const [viewGame, setViewGame] = useState<GameRecord | null>(null);
  const [filterReplays, setFilterReplays] = useState(false);

  useEffect(() => {
    registerStatsUpdateHandler(() => {
      fetchGameHistory(setGames);
    });
    fetchGameHistory(setGames);
  }, []);

  // Mirrors: fetch-log — load full game log when "View log" clicked
  function viewLog(game: GameRecord) {
    logScrollTopRef.value = 0;
    GET(`/profile/history/${game.gameid}`).then((r) => {
      if (r.status === 200) {
        setViewGame({ ...game, log: r.json as LogMessage[] });
      }
    });
  }

  function markShared() {
    if (!viewGame) return;
    setViewGame({ ...viewGame, "replay-shared": true });
  }

  return (
    <div className="page-container">
      <div className="stats-bg" />
      <div className="lobby panel blue-shade">
        {/* Left panel: stats or game details */}
        {viewGame ? (
          <GameDetails
            game={viewGame}
            onReturn={() => setViewGame(null)}
            onShared={markShared}
          />
        ) : (
          <StatsPanel stats={stats ?? {}} />
        )}
        {/* Right panel: history or game log */}
        {viewGame ? (
          <GameLog game={viewGame} />
        ) : (
          <div className="game-panel">
            <HistoryList
              games={games}
              user={user}
              filterReplays={filterReplays}
              onToggleFilter={() => setFilterReplays((f) => !f)}
              onView={viewLog}
            />
          </div>
        )}
      </div>
    </div>
  );
}
