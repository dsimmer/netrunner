// Angel Arena lobby: queue management, run display, format selection, game list.
// Mirrors: src/cljs/nr/angel_arena/lobby.cljs
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAppState } from "./appstate";
import { Avatar } from "./avatar";
import { DeckFormatStatusSpan } from "./deck_status";
import { joinGame, LobbyState, Game as GameRowGame } from "./game_row";
import { AllCards } from "../../jinteki/cards";
import { superuser } from "../../jinteki/utils";
import { resumeSound } from "./sounds";
import { tr, trPronouns } from "./translations";
import {
  condButton,
  factionIcon,
  formatZonedDateTime,
  mdyFormatter,
  slugToFormat,
  timeSpanString,
  tristateButton,
} from "./utils";
import { wsSend, onWSEvent } from "./ws";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunInfo {
  side?: string;
  games?: GameEntry[];
  "deck-id"?: string;
  "run-started"?: string;
  [key: string]: unknown;
}

export interface GameEntry {
  "game-id"?: string;
  opponent?: { identity?: string; username?: string; pronouns?: string };
  winner?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface DeckData {
  _id?: string | number;
  name?: string;
  date?: string;
  identity?: {
    title?: string;
    side?: string;
    faction?: string;
    [key: string]: unknown;
  };
  status?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ArenaRun {
  _id?: string;
  identity?: string;
  "deck-name"?: string;
  side?: string;
  games?: GameEntry[];
  "run-finished"?: string;
  format?: string;
  "run-started"?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Module-level state (mirrors r/atom atoms in CLJS)
// ---------------------------------------------------------------------------

export const arenaSupportedFormats: string[] = ["standard", "startup", "eternal"];

// refs for reactivity tracking in components
const runsRef = useRef<Record<string, Record<string, RunInfo | null>> | null>(null);
const latestRunsRef = useRef<ArenaRun[] | null>(null);
const chosenFormatRef = useRef<string>(arenaSupportedFormats[0]);
const queueingRef = useRef<string | number | null>(null);
const queueTimesRef = useRef<Record<string, Record<string, number | null>> | null>(null);

// ---------------------------------------------------------------------------
// image-url: get image URL for a card by code string (mirrors cardbrowser.cljs)
// ---------------------------------------------------------------------------

function imageUrl(cardCode: string | undefined): string | null {
  if (!cardCode) return null;
  const card = AllCards[cardCode];
  if (!card) return null;
  const options = useAppState.getState().options as Record<string, unknown> | undefined;
  const lang = (options?.["cardLanguage"] as string) ?? "en";
  const res = (options?.["cardResolution"] as string) ?? "default";

  const images = card.images as Record<string, unknown> | undefined;
  if (!images) return null;
  const langBlock = (images[lang] ?? images["en"]) as Record<string, unknown> | undefined;
  if (!langBlock) return null;
  const resBlock = (langBlock[res] ?? langBlock["default"]) as Record<string, unknown> | undefined;
  if (!resBlock) return null;
  const stock = (resBlock["stock"] ?? Object.values(resBlock)[0]) as string[] | string | undefined;
  if (Array.isArray(stock)) return stock[0] ?? null;
  if (typeof stock === "string") return stock;
  return null;
}

// ---------------------------------------------------------------------------
// deck-name: truncated deck name (mirrors deckbuilder.cljs)
// ---------------------------------------------------------------------------

function deckName(deck: DeckData | undefined, limit = 40): string {
  const name = deck?.name;
  if (!name) return "";
  const trimmed = name.trim();
  if (trimmed.length <= limit) return trimmed;
  return trimmed.substring(0, limit) + "...";
}

// ---------------------------------------------------------------------------
// Fetch helpers (mirrors ws/ws-send! with timeout and callback)
// ---------------------------------------------------------------------------

function fetchRuns(): void {
  wsSend("angel-arena/fetch-runs");
}

function fetchQueueTimes(): void {
  wsSend("angel-arena/fetch-queue-times");
}

function fetchHistory(): void {
  wsSend("angel-arena/fetch-history");
}

// ---------------------------------------------------------------------------
// Win/loss counting (mirrors get-wins / get-losses)
// ---------------------------------------------------------------------------

function getWins(runInfo: { games?: GameEntry[]; side?: string }): number {
  if (!runInfo.games || !runInfo.side) return 0;
  const sideName = typeof runInfo.side === "string" ? runInfo.side : String(runInfo.side);
  return runInfo.games.filter((g) => g.winner === sideName).length;
}

function getLosses(runInfo: { games?: GameEntry[] }, wins: number): number {
  if (!runInfo.games) return 0;
  const decidedGames = runInfo.games.filter((g) => g.winner != null).length;
  return decidedGames - wins;
}

// ---------------------------------------------------------------------------
// Capitalize helper (mirrors clojure.string/capitalize)
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Time-left component (mirrors time-left)
// ---------------------------------------------------------------------------

function TimeLeft({
  runInfoRef,
  wins,
  losses,
}: {
  runInfoRef: React.MutableRefObject<RunInfo | undefined>;
  wins: number;
  losses: number;
}): React.ReactElement {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const runStarted = runInfoRef.current?.["run-started"];
  const timeSinceStart = runStarted
    ? Date.now() - new Date(runStarted as string).getTime()
    : 0;
  const allowedDays = 3 + wins + losses;
  const msPerDay = 1000 * 60 * 60 * 24;
  const remaining = allowedDays * msPerDay - timeSinceStart;
  const seconds = Math.max(0, remaining / 1000);

  return <div className="time">Time left: {timeSpanString(seconds)}</div>;
}

// ---------------------------------------------------------------------------
// Deck view (mirrors deck-view)
// ---------------------------------------------------------------------------

function DeckView({ side, deck }: { side: string; deck: DeckData | undefined }): React.ReactElement | null {
  const runInfo = runsRef.current?.[chosenFormatRef.current]?.[side] as RunInfo | undefined;
  if (!deck) return null;

  const wins = runInfo ? getWins(runInfo) : 0;
  const losses = runInfo ? getLosses(runInfo, wins) : 0;
  const identityTitle = (deck.identity?.title as string) ?? "";

  return (
    <div className="deck">
      <img src={imageUrl(String(deck.identity)) ?? ""} alt={identityTitle} />
      <h4>{deckName(deck)}</h4>
      <div className="result float-right">{wins} wins</div>
      <div>{identityTitle}</div>
      <div className="result float-right">{losses} losses</div>
      <TimeLeft runInfoRef={useRef(runInfo)} wins={wins} losses={losses} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck buttons (mirrors deck-buttons)
// ---------------------------------------------------------------------------

function DeckButtons({ side, deck }: { side: string; deck: DeckData | undefined }): React.ReactElement {
  const [abandon, setAbandon] = useState(false);
  const queueing = queueingRef.current;
  const deckId = deck?._id;
  const isQueueing = deckId !== undefined && queueing !== null && String(deckId) === String(queueing);
  const isOtherQueueing = queueing !== null && !isQueueing;

  const format = chosenFormatRef.current;
  const avgTime = queueTimesRef.current?.[format]?.[side] ?? 0;

  return (
    <div className="buttons">
      <div className="button-row">
        <tristateButton
          onText={tr(["angel-arena_queueing", "Queueing..."])}
          offText={tr(["angel-arena_queue-for-match", "Queue for match"])}
          onCond={isQueueing}
          disableCond={isOtherQueueing}
          f={() => {
            if (isQueueing) {
              wsSend("angel-arena/dequeue", { "deck-id": deckId });
              queueingRef.current = null;
            } else {
              wsSend("angel-arena/queue", { "deck-id": deckId });
              queueingRef.current = deckId ?? null;
            }
          }}
        />
        <span>{"Average waiting time: " + timeSpanString(avgTime)}</span>
      </div>
      <div className="button-row">
        {abandon ? (
          <>
            <span>
              {tr(["angel-arena_are-you-sure", "Are you sure?"])}{" "}
              <button
                className="small"
                onClick={() => {
                  wsSend("angel-arena/abandon-run", { "deck-id": deckId });
                  fetchRuns();
                }}
              >
                {tr(["angel-arena_are-you-sure-yes", "yes"])}
              </button>{" "}
              <button className="small" onClick={() => setAbandon(false)}>
                {tr(["angel-arena_are-you-sure-no", "no"])}
              </button>
            </span>
          </>
        ) : (
          <condButton
            text={tr(["angel-arena_abandon-run", "Abandon run"])}
            cond={!isQueueing}
            f={() => setAbandon(true)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck games (mirrors deck-games)
// ---------------------------------------------------------------------------

function DeckGames({ side }: { side: string }): React.ReactElement {
  const runInfo = runsRef.current?.[chosenFormatRef.current]?.[side] as RunInfo | undefined;
  const games = runInfo?.games ?? [];

  return (
    <div className="games">
      {games.map((game) => {
        const gameId = game["game-id"];
        const opponent = game.opponent as { identity?: string; username?: string } | undefined;
        const winner = game.winner;
        const result: string = winner == null ? "aborted" : winner === side ? "won" : "lost";

        return (
          <div key={String(gameId)} className={`match ${result}`}>
            <img
              className={`identity ${result}`}
              src={imageUrl(opponent?.identity) ?? ""}
              alt={opponent?.identity ?? ""}
              title={`${opponent?.identity ?? ""}\nOpponent: ${opponent?.username ?? ""}`}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck select modal (mirrors deckselect-modal)
// ---------------------------------------------------------------------------

function DeckSelectModal({
  side,
  onClose,
}: {
  side: string;
  onClose: () => void;
}): React.ReactElement {
  const decks = useAppState((s) => s.decks) as DeckData[];
  const format = chosenFormatRef.current;

  const sameSide = (deck: DeckData) =>
    (deck.identity?.side as string) === capitalize(side);

  const correctFormat = (deck: DeckData) => {
    const form = (deck.status as Record<string, unknown>)?.format as string | undefined;
    return form === format;
  };

  const legal = (deck: DeckData) => {
    const form = (deck.status as Record<string, unknown>)?.format as string | undefined;
    const fmtStatus = (deck.status as Record<string, unknown>)?.[form ?? ""] as Record<string, unknown> | undefined;
    return !!fmtStatus?.legal;
  };

  const eligibleDecks = decks
    .filter(sameSide)
    .filter(correctFormat)
    .filter(legal)
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{tr(["angel-arena_select-deck", "Select your deck"])}</h3>
        <div className="deck-collection lobby-deck-selector">
          {eligibleDecks.length === 0 ? (
            <div className="infobox one-line blue-shade">
              <p>{tr(["angel-arena_no-eligible-decks", "No legal decks found for this side and format."])}</p>
            </div>
          ) : (
            eligibleDecks.map((deck) => {
              const fmt = ((deck.status as Record<string, unknown>)?.format as string) ?? "standard";
              return (
                <div
                  key={String(deck._id)}
                  className="deckline"
                  onClick={() => {
                    wsSend("angel-arena/start-run", { "deck-id": deck._id });
                    onClose();
                    fetchRuns();
                  }}
                >
                  <img
                    src={imageUrl(String(deck.identity)) ?? ""}
                    alt={(deck.identity?.title as string) ?? ""}
                  />
                  <div className="float-right">
                    <DeckFormatStatusSpan deck={deck as any} fmt={fmt} useTrustedInfo={true} />
                  </div>
                  <h4>{deck.name ?? ""}</h4>
                  <div className="float-right">
                    {deck.date ? formatZonedDateTime(mdyFormatter, deck.date) : ""}
                  </div>
                  <p>{deck.identity?.title ?? ""}</p>
                </div>
              );
            })
          )}
        </div>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New run button bar (mirrors new-run-button-bar)
// ---------------------------------------------------------------------------

function NewRunButtonBar({
  side,
  decks,
}: {
  side: string;
  decks: DeckData[];
}): React.ReactElement {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="button-bar">
      <condButton
        text={tr(["angel-arena_start-new-run", "Start new run"])}
        cond={queueingRef.current === null}
        f={() => setShowModal(true)}
      />
      {showModal && <DeckSelectModal side={side} onClose={() => setShowModal(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WS event handler for run-update (mirrors defmethod event-msg-handler)
// ---------------------------------------------------------------------------

onWSEvent("angel-arena/run-update", (data: unknown) => {
  const msgData = data as { "finished-run"?: boolean; [key: string]: unknown } | undefined;
  if (msgData?.["finished-run"]) {
    console.log("Run finished:", data, "\nWould display dialog box now...");
  }
  fetchRuns();
  fetchHistory();
});

// Also handle fetch responses - update module-level refs
onWSEvent("angel-arena/fetch-runs", (data: unknown) => {
  runsRef.current = data as Record<string, Record<string, RunInfo | null>> | null;
});

onWSEvent("angel-arena/fetch-queue-times", (data: unknown) => {
  queueTimesRef.current = data as Record<string, Record<string, number | null>> | null;
});

onWSEvent("angel-arena/fetch-history", (data: unknown) => {
  latestRunsRef.current = data as ArenaRun[] | null;
});

// ---------------------------------------------------------------------------
// Latest run view (mirrors latest-run-view)
// ---------------------------------------------------------------------------

function LatestRunView({ run }: { run: ArenaRun }): React.ReactElement {
  const [opened, setOpened] = useState(false);
  const wins = getWins(run as unknown as RunInfo);
  const losses = getLosses(run as unknown as RunInfo, wins);
  const _id = run._id ?? "";
  const identity = run.identity ?? "";
  const deckNameVal = run["deck-name"] ?? "";
  const side = run.side ?? "";
  const games = run.games ?? [];
  const runFinished = run["run-finished"] as string | undefined;

  const decidedGames = games.filter((g) => g.winner != null);

  return (
    <div className="run" key={_id}>
      <div
        className="unfold-button"
        onClick={() => setOpened((o) => !o)}
        className={opened ? "open" : undefined}
      />
      <div className="deck">
        <img src={imageUrl(identity) ?? ""} alt={identity} />
        <h4>{deckNameVal}</h4>
        <div className="result float-right">{wins} wins</div>
        <div>{identity}</div>
        <div className="result float-right">{losses} losses</div>
        <div>
          Run started:{" "}
          {runFinished ? new Date(runFinished).toLocaleString() : ""}
        </div>
      </div>
      <div
        className={`unfold${opened ? " open" : ""}`}
        style={{
          maxHeight: opened ? 100 * decidedGames.length : undefined,
        }}
      >
        <div className="games">
          {decidedGames.map((game) => {
            const gameId = game["game-id"];
            const opponent = game.opponent as { identity?: string; username?: string; pronouns?: string } | undefined;
            const winner = game.winner;
            const result: string = winner == null ? "aborted" : winner === side ? "won" : "lost";
            const reason = game.reason;

            return (
              <div key={String(gameId)} className={`match ${result}`}>
                <img
                  className={`identity ${result}`}
                  src={imageUrl(opponent?.identity) ?? ""}
                  alt={opponent?.identity ?? ""}
                  title={opponent?.identity ?? ""}
                />
                <div className="name-area">
                  <Avatar user={{ username: opponent?.username } as any} opts={{ size: 32 }} />
                  <div className="name-box">
                    <div className="username">{opponent?.username ?? ""}</div>
                    {opponent?.pronouns && opponent.pronouns !== "blank" && (
                      <div className="pronouns">
                        {(trPronouns(opponent.pronouns) ?? "").toLowerCase()}
                      </div>
                    )}
                  </div>
                </div>
                <div className="info">
                  {result === "aborted" && <p>Aborted</p>}
                  {result === "won" && reason && <p>Won by {reason}</p>}
                  {result === "lost" && reason && <p>Lost by {reason}</p>}
                  <p>
                    <a href={`/replay/${gameId}`}>Replay</a>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Latest runs view (mirrors latest-runs-view)
// ---------------------------------------------------------------------------

function LatestRunsView(): React.ReactElement {
  const format = chosenFormatRef.current;
  const latestRuns = latestRunsRef.current ?? [];
  const filtered = latestRuns.filter((run) => run.format === format);

  return (
    <div className="latest-runs" key={format}>
      {filtered.map((run) => (
        <LatestRunView key={run["run-started"] ?? run._id ?? ""} run={run} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game panel (mirrors game-panel / r/create-class)
// ---------------------------------------------------------------------------

export function gamePanel({ decks }: { decks: DeckData[] }): React.ReactElement {
  const [, forceUpdate] = useState(0);
  const forceRerender = useCallback(() => forceUpdate((n) => n + 1), []);

  // Subscribe to appState games changes to trigger re-renders
  useEffect(() => {
    const unsubscribe = useAppState.subscribe(() => {
      forceRerender();
    });
    fetchRuns();
    fetchQueueTimes();
    fetchHistory();
    return unsubscribe;
  }, []);

  const runs = runsRef.current;

  if (!runs) {
    return (
      <div className="game-panel angel-arena">
        <h3>{tr(["angel-arena_requesting-run-data", "Requesting run data..."])}</h3>
      </div>
    );
  }

  const format = chosenFormatRef.current;

  // Find deck by deck-id for corp
  const corpRunInfo = runs[format]?.["corp"] as RunInfo | undefined;
  const corpDeckId = corpRunInfo?.["deck-id"];
  const corpDeck = corpDeckId
    ? (decks.find((d) => String(d._id) === String(corpDeckId)) ?? undefined)
    : undefined;

  // Find deck by deck-id for runner
  const runnerRunInfo = runs[format]?.["runner"] as RunInfo | undefined;
  const runnerDeckId = runnerRunInfo?.["deck-id"];
  const runnerDeck = runnerDeckId
    ? (decks.find((d) => String(d._id) === String(runnerDeckId)) ?? undefined)
    : undefined;

  return (
    <div className="game-panel angel-arena">
      <h3>{tr(["angel-arena_format", "Format"])}</h3>
      <div className="format-bar">
        {arenaSupportedFormats.map((form) => (
          <span
            key={form}
            className={`tab${format === form ? " current" : ""}`}
            onClick={() => { chosenFormatRef.current = form; forceRerender(); }}
          >
            {slugToFormat[form] ?? form}
          </span>
        ))}
      </div>

      <h3>{tr(["angel-arena_active-corp-run", "Active Corp run"])}</h3>
      {corpRunInfo && corpDeck ? (
        <div className="run">
          <DeckView side="corp" deck={corpDeck} />
          <DeckGames side="corp" />
          <DeckButtons side="corp" deck={corpDeck} />
        </div>
      ) : (
        <div className="run">
          <NewRunButtonBar side="corp" decks={decks} />
        </div>
      )}

      <h3>{tr(["angel-arena_active-runner-run", "Active Runner run"])}</h3>
      {runnerRunInfo && runnerDeck ? (
        <div className="run">
          <DeckView side="runner" deck={runnerDeck} />
          <DeckGames side="runner" />
          <DeckButtons side="runner" deck={runnerDeck} />
        </div>
      ) : (
        <div className="run">
          <NewRunButtonBar side="runner" decks={decks} />
        </div>
      )}

      <h3>{tr(["angel-arena_latest-runs", "Latest runs"])}</h3>
      <LatestRunsView />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player view (mirrors player-view in lobby.cljs, separate from player_view.cljs)
// ---------------------------------------------------------------------------

interface LobbyPlayer {
  user?: { username?: string; emailhash?: string; [key: string]: unknown };
  side?: string;
  deck?: {
    identity?: { faction?: string; title?: string };
    [key: string]: unknown;
  };
  "run-info"?: { wins?: number; losses?: number };
  [key: string]: unknown;
}

interface LobbyGame {
  "allow-spectator"?: boolean;
  password?: boolean;
  [key: string]: unknown;
}

function LobbyPlayerView({
  player,
  game,
}: {
  player: LobbyPlayer;
  game?: LobbyGame | null;
}): React.ReactElement {
  const side = player.side;
  const deck = player.deck as { identity?: { faction?: string; title?: string } } | undefined;
  const faction = deck?.identity?.faction;
  const identity = deck?.identity?.title;
  const specs = game?.["allow-spectator"];
  const runInfo = player["run-info"] as { wins?: number; losses?: number } | undefined;

  let sideContent: React.ReactElement | string | null = null;
  if (faction && faction !== "Neutral" && specs) {
    sideContent = factionIcon(faction, identity ?? "");
  } else if (side) {
    sideContent = ` (${tr(["side_name"], { side: String(side) })})`;
  }

  return (
    <span className="player">
      <Avatar user={player.user ?? {}} opts={{ size: 22 }} />
      <span className="user-status">
        {player.user?.username}
      </span>
      {sideContent}
      {runInfo && (
        <span className="standings">
          {runInfo.wins}-{runInfo.losses}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Game row (mirrors game-row in lobby.cljs)
// ---------------------------------------------------------------------------

function LobbyGameRow({
  lobbyState,
  game,
  currentGame,
}: {
  lobbyState: React.MutableRefObject<LobbyState>;
  game: GameRowGame;
  currentGame?: string;
}): React.ReactElement {
  const user = useAppState.getState().user as Record<string, unknown> | null;

  const handleJoin = (action: string) => {
    joinGame(lobbyState, game, action, "Any Side");
  };

  const format = game.format as string;
  const started = game.started;
  const players = (game.players ?? []) as GameRowGame["players"];
  const originalPlayers = (game.originalPlayers ?? players) as GameRowGame["players"];
  const spectatorCount = (game["spectator-count"] as number) ?? 0;
  const saveReplay = game["save-replay"] ?? game.saveReplay;

  return (
    <div className={`gameline${currentGame === game.gameid ? " active" : ""}`}>
      {(superuser(user ?? {}) || (game["allow-spectator"] && !currentGame)) && (
        <button onClick={() => { handleJoin("watch"); resumeSound(); }}>
          {tr(["lobby_watch", "Watch"])}
        </button>
      )}
      {!currentGame &&
        started &&
        players.length === 1 &&
        originalPlayers.some(
          (p: { user?: { username?: string } }) =>
            p.user?.username === user?.username
        ) && (
          <button onClick={() => { handleJoin("rejoin"); resumeSound(); }}>
            {tr(["lobby_rejoin", "Rejoin"])}
          </button>
        )}
      <h4>
        {saveReplay ? "\uD83D\uDFE2" : ""}
        {game.title}
        {spectatorCount > 0
          ? ` (${tr(["lobby_spectator-count"], { cnt: String(spectatorCount) })})`
          : ""}
      </h4>
      <div className="game-format">
        <span className="format-label">
          {tr(["lobby_default-game-format", "Default game format"])}:{" "}
        </span>
        <span className="format-type">
          {slugToFormat[format] ?? format ?? "Unknown"}
        </span>
      </div>
      {originalPlayers.map((player: LobbyPlayer) => (
        <LobbyPlayerView
          key={(player.user?.username as string) ?? Math.random().toString()}
          player={player}
          game={game as unknown as LobbyGame}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: get player wins (mirrors get-player-wins)
// ---------------------------------------------------------------------------

function getPlayerWins(
  game: { players?: { "run-info"?: { games?: GameEntry[]; side?: string } }[] }
): number[] {
  const players = game.players ?? [];
  return players.map((p) => getWins(p["run-info"] as unknown as RunInfo));
}

// ---------------------------------------------------------------------------
// Game list (mirrors game-list)
// ---------------------------------------------------------------------------

export function gameList(
  lobbyState: React.MutableRefObject<LobbyState>,
  { games, currentGame }: { games: GameRowGame[]; currentGame?: GameRowGame | null }
): React.ReactElement {
  const [renderKey, setRenderKey] = useState(0);
  const forceRerender = useCallback(() => setRenderKey((k) => k + 1), []);

  useEffect(() => {
    const unsubscribe = useAppState.subscribe(() => {
      forceRerender();
    });
    return unsubscribe;
  }, []);

  const allGames = useAppState.getState().games as GameRowGame[];
  const roomGames = allGames.filter((g) => g.room === "angel-arena");

  if (roomGames.length === 0) {
    return (
      <div className="game-list">
        <h4>{tr(["angel-arena_no-games", "No games"])}</h4>
      </div>
    );
  }

  // Group by max wins
  const groups: Map<number, GameRowGame[]> = new Map();
  for (const game of roomGames) {
    const wins = Math.max(0, ...getPlayerWins(game));
    const existing = groups.get(wins) ?? [];
    existing.push(game);
    groups.set(wins, existing);
  }

  const sortedGroups = Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);
  const currentGameId = currentGame?.gameid;

  return (
    <div className="game-list" key={renderKey}>
      {sortedGroups.map(([wins, games]) => (
        <div className="win-group" key={wins}>
          <div className="win-divider" key={`${wins}-divider`}>
            {wins} {tr(["angel-arena_wins", "wins"])}
          </div>
          {games.map((game) => (
            <LobbyGameRow
              key={game.gameid}
              lobbyState={lobbyState}
              game={game}
              currentGame={currentGameId}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default export (stub for compatibility with import in lobby.tsx)
// ---------------------------------------------------------------------------

export default function AngelArenaLobby(): React.ReactElement {
  throw new Error("not implemented");
}
