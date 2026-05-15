// Pending/waiting game lobby: player list, deck select, ready toggle, start.
// Mirrors: src/cljs/nr/pending_game.cljs
import React, { useRef, useEffect } from "react";
import { singletonDeck, trustedDeckStatus } from "../jinteki/validator";
import { matchupByKey } from "../jinteki/preconstructed";
import { useAppState, currentGameID } from "./appstate";
import { formatDateTime, mdyFormatter, trNonGameToast, condButton } from "./utils";
import { tr, trElement, trElementWithEmbeddedContent, trSpan, trSide } from "./translations";
import { DeckFormatStatusSpan } from "./deck_status";
import { lobbyChat } from "./lobby_chat";
import { playerView, type PlayerViewPlayer } from "./player_view";
import { wsSend } from "./ws";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

interface DeckIdentity {
  side?: string;
  title?: string;
  code?: number;
  [key: string]: unknown;
}

interface Deck {
  _id?: string | number;
  name?: string;
  identity?: DeckIdentity;
  cards?: unknown[];
  format?: string;
  date?: string;
  status?: unknown;
  [key: string]: unknown;
}

interface Player {
  user?: {
    _id?: string | number;
    username?: string;
    [key: string]: unknown;
  };
  side?: string;
  deck?: Deck;
  [key: string]: unknown;
}

interface Spectator {
  user?: {
    _id?: string | number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface CurrentGame {
  gameid?: string;
  title?: string;
  format?: string;
  precon?: string;
  singleton?: boolean;
  players?: Player[];
  spectators?: Spectator[];
  messages?: unknown[];
  "allow-spectator"?: boolean;
  "api-access"?: boolean;
  password?: string | boolean;
  "save-replay"?: boolean;
  "spectatorhands"?: boolean;
  timer?: number;
  [key: string]: unknown;
}

interface ChatMessage {
  user?: unknown;
  text?: string;
  timestamp?: string | number;
}

interface PendingGameProps {
  currentGame: CurrentGame;
  user: { _id?: string | number; [key: string]: unknown } | null;
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function isConstructed(currentGame: CurrentGame): boolean {
  return (
    !currentGame.precon &&
    currentGame.format !== "quick-draft" &&
    currentGame.format !== "chimera"
  );
}

function isPreconstructed(currentGame: CurrentGame): boolean {
  return !isConstructed(currentGame);
}

function firstUser(players: Player[] | undefined, user: { _id?: string | number } | null): boolean {
  if (!players || players.length === 0 || !user?._id) return false;
  return players[0]?.user?._id === user._id;
}

// deck-name: truncate deck name with ellipsis
function deckName(deck: Deck | undefined, limit: number = 40): string | null {
  const name = deck?.name;
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length <= limit) return trimmed;
  return trimmed.substring(0, limit) + "...";
}

// image-url: get image URL for a card (mirrors cardbrowser.cljs)
function imageUrl(card: Record<string, unknown> | undefined): string | null {
  if (!card) return null;
  const options = useAppState.getState().options as Record<string, unknown> | undefined;
  const lang = (options?.["cardLanguage"] as string) ?? "en";
  const res = (options?.["cardResolution"] as string) ?? "default";

  // Simple image path lookup (mirrors the CLJS version for identity cards)
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

// Check deck legality for format
function isDeckLegal(deck: Deck | undefined, fmt: string | undefined): boolean {
  if (!deck || fmt === "casual") return true;
  const fmtKey = fmt as keyof Deck["status"];
  const status = deck.status as Record<string, unknown> | undefined;
  if (status) {
    const fmtStatus = status[fmtKey] as Record<string, unknown> | undefined;
    if (fmtStatus?.["legal"]) return true;
  }
  // Fallback: compute trusted status
  const trusted = trustedDeckStatus({ ...deck, format: fmt } as any);
  const fmtResult = trusted[fmt as keyof typeof trusted] as { legal?: boolean } | undefined;
  return !!fmtResult?.legal;
}

// ──────────────────────────────────────────────────────────────────
// Select Deck Modal
// ──────────────────────────────────────────────────────────────────

interface SelectDeckModalProps {
  user: { _id?: string | number; [key: string]: unknown } | null;
  currentGame: CurrentGame;
  onClose: () => void;
}

function SelectDeckModal({ user, currentGame, onClose }: SelectDeckModalProps): React.ReactElement {
  const decks = useAppState(s => s.decks) as Deck[];
  const fmt = currentGame.format;
  const players = currentGame.players ?? [];
  const singleton = currentGame.singleton;

  // Find this user's side
  const side = players.find(p => p.user?._id === user?._id)?.side;

  function filterDecks(): Deck[] {
    return decks
      .filter((d: Deck) => d.identity?.side === side)
      .filter((d: Deck) => !singleton || singletonDeck(d as any))
      .filter((d: Deck) => isDeckLegal(d, fmt))
      .sort((a: Deck, b: Deck) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
  }

  function handleSelectDeck(deck: Deck) {
    const gid = currentGameID();
    wsSend(["lobby/deck", { gameid: gid, "deck-id": deck._id }] as any);
    onClose();
  }

  const appropriateDecks = filterDecks();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {appropriateDecks.length > 0 ? (
          <>
            <h3>{tr(["lobby_select-title", "Select your deck"])}</h3>
            <div className="deck-collection lobby-deck-selector">
              {appropriateDecks.map((deck: Deck) => (
                <div
                  key={String(deck._id)}
                  className="deckline"
                  onClick={() => handleSelectDeck(deck)}
                >
                  <img
                    src={imageUrl(deck.identity as Record<string, unknown> | undefined) ?? ""}
                    alt={(deck.identity as DeckIdentity)?.title ?? ""}
                  />
                  <div className="float-right">
                    <DeckFormatStatusSpan deck={deck as any} fmt={fmt ?? "standard"} useTrustedInfo={true} />
                  </div>
                  <h4>{deck.name ?? ""}</h4>
                  <div className="float-right">
                    {deck.date ? formatDateTime(mdyFormatter, deck.date) : ""}
                  </div>
                  <p>{(deck.identity as DeckIdentity)?.title ?? ""}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h3>{tr(["lobby_no-valid-decks", "You do not have any decks that are valid for this format"])}</h3>
            <h3>
              {tr(["lobby_no-valid-decks-format", "This lobby is for the ${format} format"], { format: fmt ?? "" })}
            </h3>
            <h4>
              {tr(["lobby_no-valid-decks-help", "Please check the validity of your decklists and ensure you are queueing for a game of the appropriate format. If you are a new player and wish to play the learner decks, you need to create or join a game of the System Gateway format."], { format: fmt ?? "" })}
            </h4>
          </>
        )}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Button components
// ──────────────────────────────────────────────────────────────────

function StartButton({
  currentGame, user, gameid, players
}: {
  currentGame: CurrentGame;
  user: { _id?: string | number } | null;
  gameid: string | undefined;
  players: Player[] | undefined;
}): React.ReactElement | null {
  if (!firstUser(players, user)) return null;

  const allReady = (players ?? []).every(p => !!p.deck) ||
    isPreconstructed(currentGame) ||
    currentGame.format === "chimera";

  return (
    <condButton
      text={tr(["lobby_start", "Start"])}
      cond={allReady}
      f={() => wsSend(["game/start", { gameid }] as any)}
    />
  );
}

function LeaveButton({ gameid }: { gameid: string | undefined }): React.ReactElement {
  return (
    <button
      onClick={e => {
        e.preventDefault();
        wsSend(["lobby/leave", { gameid }] as any);
        useAppState.getState().setCurrentGame(null);
      }}
    >
      {tr(["lobby_leave", "Leave"])}
    </button>
  );
}

function SwapSidesButton({
  user, gameid, players
}: {
  user: { _id?: string | number } | null;
  gameid: string | undefined;
  players: Player[] | undefined;
}): React.ReactElement | null {
  if (!firstUser(players, user)) return null;

  const playerCount = (players ?? []).length;
  const currentPlayerSide = players?.[0]?.side ?? "Any Side";

  if (playerCount <= 1) {
    return (
      <button onClick={() => wsSend(["lobby/swap", { gameid }] as any)}>
        {tr(["lobby_swap", "Swap sides"])}
      </button>
    );
  }

  const sides = ["Any Side", "Corp", "Runner"];

  return (
    <div className="dropdown">
      <button className="dropdown-toggle" data-toggle="dropdown">
        {tr(["lobby_swap", "Swap sides"])}
        <b className="caret" />
      </button>
      <ul className="dropdown-menu blue-shade">
        {sides.map(side => {
          const isPlayerSide = side === currentPlayerSide;
          return (
            <li key={side}>
              <a
                className="block-link"
                style={isPlayerSide ? { color: "grey", cursor: "default" } : undefined}
                disabled={isPlayerSide}
                onClick={() => {
                  if (!isPlayerSide) {
                    wsSend(["lobby/swap", { gameid, side }] as any);
                  }
                }}
              >
                {trSide(side)}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ButtonBar({
  currentGame, user, gameid, players
}: {
  currentGame: CurrentGame;
  user: { _id?: string | number } | null;
  gameid: string | undefined;
  players: Player[] | undefined;
}): React.ReactElement {
  return (
    <div className="button-bar">
      <StartButton currentGame={currentGame} user={user} gameid={gameid} players={players} />
      <LeaveButton gameid={gameid} />
      <SwapSidesButton user={user} gameid={gameid} players={players} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Info boxes
// ──────────────────────────────────────────────────────────────────

function PreconInfoBox({ currentGame }: { currentGame: CurrentGame }): React.ReactElement | null {
  const precon = currentGame.precon;
  if (!precon) return null;
  const matchup = matchupByKey(precon as any);
  if (!matchup) return null;
  const trDesc = Array.isArray(matchup.trDesc)
    ? matchup.trDesc as [string, string]
    : [matchup.trDesc as string, matchup.trDesc as string];
  return (
    <div className="infobox blue-shade">
      {trElement("p", trDesc)}
    </div>
  );
}

function ChimeraInfoBox({ currentGame }: { currentGame: CurrentGame }): React.ReactElement | null {
  if (currentGame.format !== "chimera") return null;
  const link = (
    <a href="https://www.playchimera.net" target="_blank" rel="noopener noreferrer">
      playchimera.net
    </a>
  );
  return (
    <div className="infobox blue-shade">
      {trElementWithEmbeddedContent(
        "p",
        ["lobby_chimera-info", "Chimera is a format in which each player plays with randomly generated decklists. Visit [link] for more info on the rules and decisions behind the format."],
        { link },
        { link: String(link) }
      )}
    </div>
  );
}

function SingletonInfoBox({ currentGame }: { currentGame: CurrentGame }): React.ReactElement | null {
  if (!currentGame.singleton) return null;
  return (
    <div className="infobox blue-shade">
      {trElement("p", ["lobby_singleton-restriction", "This lobby is running in singleton mode. This means decklists will be restricted to only those which do not contain any duplicate cards."])}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Player components
// ──────────────────────────────────────────────────────────────────

function PlayerItem({
  user, currentGame, player
}: {
  user: { _id?: string | number } | null;
  currentGame: CurrentGame;
  player: Player;
}): React.ReactElement {
  const playerId = player.user?._id;
  const thisPlayer = playerId === user?._id;
  const [showModal, setShowModal] = React.useState(false);

  const deck = player.deck;
  const deckStatus = deck?.status as Record<string, unknown> | undefined;
  const status = deckStatus?.["status"] as { status?: string } | undefined;

  const gameWithoutPassword = { ...currentGame, password: undefined };

  return (
    <div key={String(playerId)}>
      {playerView(player as PlayerViewPlayer, gameWithoutPassword)}

      {status && (
        <span className={status.status ?? ""}>
          <span className="label">
            {thisPlayer
              ? (deckName(player.deck, 25) ?? "Deck selected")
              : trSpan(["lobby_deck-selected", "Deck selected"])}
          </span>
        </span>
      )}

      {deck && (
        <div className="float-right">
          <DeckFormatStatusSpan
            deck={deck as any}
            fmt={(currentGame.format ?? "standard") as string}
            useTrustedInfo={true}
          />
        </div>
      )}

      {isConstructed(currentGame) && thisPlayer && player.side !== "Any Side" && (
        <span
          className="fake-link deck-load"
          onClick={() => setShowModal(true)}
        >
          {trSpan(["lobby_select-deck", "Select Deck"])}
        </span>
      )}

      {showModal && (
        <SelectDeckModal
          user={user}
          currentGame={currentGame}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function PlayerList({
  user, currentGame, players
}: {
  user: { _id?: string | number } | null;
  currentGame: CurrentGame;
  players: Player[] | undefined;
}): React.ReactElement {
  return (
    <>
      {trElement("h3", ["lobby_players", "Players"])}
      <div className="players">
        {(players ?? []).map(player => (
          <PlayerItem
            key={String(player.user?._id)}
            user={user}
            currentGame={currentGame}
            player={player}
          />
        ))}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Options list
// ──────────────────────────────────────────────────────────────────

function OptionsList({ currentGame }: { currentGame: CurrentGame }): React.ReactElement {
  const allowSpectator = currentGame["allow-spectator"];
  const apiAccess = currentGame["api-access"];
  const password = currentGame.password;
  const saveReplay = currentGame["save-replay"];
  const spectatorHands = currentGame["spectatorhands"];
  const timer = currentGame.timer;

  return (
    <>
      {trElement("h3", ["lobby_options", "Options"])}
      <ul className="options">
        {allowSpectator && trElement("li", ["lobby_spectators", "Allow spectators"])}
        {timer && trElement("li", ["lobby_timer-set-for", `Game timer set for ${timer} minutes`], { minutes: String(timer) })}
        {spectatorHands && trElement("li", ["lobby_hidden", "Make players' hidden information visible to spectators"])}
        {password && trElement("li", ["lobby_password-protected", "Password protected"])}
        {saveReplay && (
          <>
            <li>🟢 {trSpan(["lobby_save-replay", "Save replay"])}</li>
            <div
              className="infobox blue-shade"
              style={{ display: saveReplay ? "block" : "none" }}
            >
              {trElement("p", ["lobby_save-replay-details", "This will save a replay file of this match with open information (e.g. open cards in hand). The file is available only after the game is finished."])}
              {trElement("p", ["lobby_save-replay-unshared", "Only your latest 15 unshared games will be kept, so make sure to either download or share the match afterwards."])}
              {trElement("p", ["lobby_save-replay-beta", "BETA Functionality: Be aware that we might need to reset the saved replays, so make sure to download games you want to keep. Also, please keep in mind that we might need to do future changes to the site that might make replays incompatible."])}
            </div>
          </>
        )}
        {apiAccess && trElement("li", ["lobby_api-access", "Allow API access to game information"])}
      </ul>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Spectator list
// ──────────────────────────────────────────────────────────────────

function SpectatorList({ currentGame }: { currentGame: CurrentGame }): React.ReactElement | null {
  const allowSpectator = currentGame["allow-spectator"];
  const spectators = currentGame.spectators ?? [];

  if (!allowSpectator) return null;

  return (
    <div className="spectators">
      {trElement("h3", ["lobby_spectator-count", "Spectators"], { cnt: String(spectators.length) })}
      {spectators.map((spectator: Spectator) => (
        <div key={String(spectator.user?._id)}>
          {playerView(spectator as PlayerViewPlayer, null)}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main PendingGame component
// ──────────────────────────────────────────────────────────────────

export function PendingGame({ currentGame, user }: PendingGameProps): React.ReactElement {
  const createGameDeck = useAppState(s => s.currentGame as unknown as CurrentGame);
  const createGameDeckRef = useRef<Deck | null>(null);

  // Handle auto-deck selection on mount (mirrors create-game-deck handling in CLJS)
  useEffect(() => {
    const cg = useAppState.getState();
    const deck = (cg as any).createGameDeck as Deck | undefined;
    if (deck) {
      const gid = currentGameID();
      wsSend(["lobby/deck", { gameid: gid, "deck-id": deck._id }] as any);
      // Clear the create-game-deck state
      // (In the full port, this would use a Zustand action)
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const players = currentGame.players ?? [];
  const gameid = currentGame.gameid;
  const messages = (currentGame.messages ?? []) as ChatMessage[];

  const allReady = players.every(p => !!p.deck) || !isConstructed(currentGame);

  return (
    <div>
      <ButtonBar currentGame={currentGame} user={user} gameid={gameid} players={players} />
      <div className="content">
        <h2>{currentGame.title ?? ""}</h2>
        <PreconInfoBox currentGame={currentGame} />
        <SingletonInfoBox currentGame={currentGame} />
        <ChimeraInfoBox currentGame={currentGame} />

        {!allReady && (
          <div className="flash-message">
            {trElement("div", ["lobby_waiting", "Waiting players deck selection"])}
          </div>
        )}

        <PlayerList user={user} currentGame={currentGame} players={players} />
        <OptionsList currentGame={currentGame} />
        <SpectatorList currentGame={currentGame} />
        {lobbyChat({ currentGame, messages }, null as any)}
      </div>
    </div>
  );
}

export default PendingGame;
