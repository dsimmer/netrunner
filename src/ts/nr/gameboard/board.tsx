// Gameboard: main game view with corp/runner boards, hand, log, prompts.
// Mirrors: src/cljs/nr/gameboard/board.cljs
// Phase 4 implementation — functional layout with key interactions.
import React, { useEffect, useRef, useState } from "react";
import { useGameBoard, getLocalSide, type CardState, type PlayerState, type GameStateData } from "./state";
import { useAppState } from "../appstate";
import { wsSend } from "../ws";

// ──────────────────────────────────────────────────────────────────
// Card image URL
// ──────────────────────────────────────────────────────────────────

function cardImageUrl(card: CardState, lang = "en"): string | null {
  const images = card.images as Record<string, unknown> | undefined;
  if (!images) return null;
  const lb = (images[lang] ?? images["en"]) as Record<string, unknown> | undefined;
  if (!lb) return null;
  const res = (lb["default"] ?? lb["lowres"]) as Record<string, unknown> | undefined;
  if (!res) return null;
  const stock = (res["stock"] ?? Object.values(res)[0]) as string[] | string | undefined;
  if (Array.isArray(stock)) return stock[0] ?? null;
  if (typeof stock === "string") return stock;
  return null;
}

// ──────────────────────────────────────────────────────────────────
// Single card rendering
// ──────────────────────────────────────────────────────────────────

interface CardProps {
  card: CardState;
  facedown?: boolean;
  onClick?: (card: CardState, e: React.MouseEvent) => void;
  selected?: boolean;
}

function Card({ card, facedown, onClick, selected }: CardProps): React.ReactElement {
  const [showText, setShowText] = useState(false);
  const url = !facedown ? cardImageUrl(card) : null;

  return (
    <div
      className={`card-wrapper${selected ? " selected" : ""}${card.rezzed ? " rezzed" : ""}${facedown ? " facedown" : ""}`}
      onClick={onClick ? (e) => onClick(card, e) : undefined}
      title={card.title ?? ""}
    >
      {url && !showText ? (
        <img src={url} alt={card.title ?? ""} onError={() => setShowText(true)} />
      ) : (
        <div className="card-face">
          <span className="card-title">{facedown ? "?" : (card.title ?? "Unknown")}</span>
          {card.counters && Object.entries(card.counters).map(([k, v]) => (
            <span key={k} className="counter">{k}: {v}</span>
          ))}
          {card.subroutines?.map((sub, i) => (
            <div key={i} className={`subroutine${sub.broken ? " broken" : ""}`}>
              {sub.broken ? "↳" : "→"} {sub.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Hand
// ──────────────────────────────────────────────────────────────────

function HandView({
  cards, visible, side, gameId,
}: {
  cards: CardState[];
  visible: boolean;
  side: string;
  gameId: string;
}): React.ReactElement {
  function playCard(card: CardState) {
    wsSend("game/action", { gameid: gameId, command: "play", args: { card: { cid: card.cid } } });
  }

  return (
    <div className={`hand-view ${side}`}>
      <div className="hand-cards">
        {cards.map((c, i) => (
          <Card
            key={c.cid ?? i}
            card={c}
            facedown={!visible}
            onClick={visible ? () => playCard(c) : undefined}
          />
        ))}
      </div>
      <div className="hand-size">{cards.length}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Player stats
// ──────────────────────────────────────────────────────────────────

function PlayerStats({ player, side, gameId, active }: {
  player: PlayerState;
  side: string;
  gameId: string;
  active: boolean;
}): React.ReactElement {
  const tag = typeof player.tag === "object" ? player.tag?.total ?? 0 : player.tag ?? 0;
  const bp = typeof player["bad-publicity"] === "object"
    ? player["bad-publicity"]?.base ?? 0
    : player["bad-publicity"] ?? 0;

  function click() {
    wsSend("game/action", { gameid: gameId, command: "click", args: { side } });
  }
  function draw() {
    wsSend("game/action", { gameid: gameId, command: "draw", args: { side } });
  }

  return (
    <div className={`player-stats ${side}${active ? " active-player" : ""}`}>
      <div className="username">{player.user?.username ?? side}</div>
      <div className="stat clicks" title="Clicks">⚡ {player.click ?? 0}</div>
      <div className="stat credits" title="Credits">${player.credit ?? 0}</div>
      <div className="stat hand-size" title="Hand size">✋ {player["hand-size"] ?? 5}</div>
      <div className="stat agenda" title="Agenda points">★ {player["agenda-point"] ?? 0}/{player["agenda-point-req"] ?? 7}</div>
      {tag > 0 && <div className="stat tags" title="Tags">🏷 {tag}</div>}
      {bp > 0 && <div className="stat bp" title="Bad publicity">☢ {bp}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────────────────────

function PromptView({ prompt, gameId, side }: {
  prompt: NonNullable<PlayerState["prompt-state"]>;
  gameId: string;
  side: string;
}): React.ReactElement {
  function choose(choice: string | { text: string; value: unknown }, idx: number) {
    const value = typeof choice === "string" ? choice : choice.value;
    const text = typeof choice === "string" ? choice : choice.text;
    wsSend("game/action", {
      gameid: gameId,
      command: "choice",
      args: { choice: value ?? text, idx },
    });
  }

  return (
    <div className="prompt-panel blue-shade panel">
      {prompt.prompt && <p className="prompt-text">{prompt.prompt}</p>}
      {prompt["card-title"] && <p className="prompt-card">{prompt["card-title"]}</p>}
      <div className="choices">
        {(prompt.choices ?? []).map((c, i) => {
          const label = typeof c === "string" ? c : c.text;
          return (
            <button key={i} className="choice-button" onClick={() => choose(c, i)}>
              <span className="choice-index">{i + 1}</span> {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Game log
// ──────────────────────────────────────────────────────────────────

function GameLog({ log, gameId }: {
  log: GameStateData["log"];
  gameId: string;
}): React.ReactElement {
  const [msg, setMsg] = useState("");
  const logRef = useRef<HTMLDivElement | null>(null);
  const user = useAppState(s => s.user);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log?.length]);

  function sendMsg(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim()) return;
    wsSend("game/say", {
      gameid: gameId,
      msg,
      username: user?.username,
      emailhash: user?.emailhash,
    });
    setMsg("");
  }

  return (
    <div className="log-view">
      <div className="messages panel" ref={logRef}>
        {(log ?? []).map((entry, i) => {
          if (typeof entry.user === "string" && entry.user === "__system__") {
            if (entry.text === "typing") return null;
            return <div key={i} className="system">{entry.text}</div>;
          }
          const uname = typeof entry.user === "string" ? entry.user : entry.user?.username;
          return (
            <div key={i} className="message">
              <span className="username">{uname}</span>: {entry.text}
            </div>
          );
        })}
      </div>
      <form onSubmit={sendMsg}>
        <input type="text" value={msg} onChange={e => setMsg(e.target.value)}
          placeholder="Say something..." />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Corp server
// ──────────────────────────────────────────────────────────────────

function ServerView({ serverKey, server, gameId }: {
  serverKey: string;
  server: { ices?: CardState[]; content?: CardState[] };
  gameId: string;
}): React.ReactElement {
  function installInServer(card: CardState) {
    wsSend("game/action", {
      gameid: gameId,
      command: "install",
      args: { card: { cid: card.cid }, server: serverKey },
    });
  }

  return (
    <div className="server" data-server={serverKey}>
      <div className="ice-row">
        {(server.ices ?? []).map((ice, i) => (
          <Card key={ice.cid ?? i} card={ice} facedown={!ice.rezzed} />
        ))}
      </div>
      <div className="content">
        {(server.content ?? []).map((card, i) => (
          <Card key={card.cid ?? i} card={card} facedown={!card.rezzed} />
        ))}
      </div>
      <div className="server-label">{serverKey}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Action buttons
// ──────────────────────────────────────────────────────────────────

function ActionButtons({ gameId, side, gameState }: {
  gameId: string;
  side: string;
  gameState: GameStateData;
}): React.ReactElement {
  const activeSide = gameState["active-player"] ?? "corp";
  const isActive = activeSide === side;
  const player = side === "corp" ? gameState.corp : gameState.runner;
  const clicks = player?.click ?? 0;

  function action(command: string, args?: object) {
    wsSend("game/action", { gameid: gameId, command, args: args ?? {} });
  }

  if (gameState.winner) {
    return (
      <div className="button-pane">
        <p className="win-message">{gameState.winner} wins! ({gameState["win-reason"]})</p>
        <button onClick={() => action("concede")}>Leave game</button>
      </div>
    );
  }

  return (
    <div className="button-pane">
      {isActive && (
        <>
          {clicks > 0 && <button onClick={() => action("credit")}>Credit [click]</button>}
          {clicks > 0 && <button onClick={() => action("draw")}>Draw [click]</button>}
          <button onClick={() => action("end-turn")}>End Turn</button>
        </>
      )}
      {!isActive && <p className="waiting">Waiting for opponent...</p>}
      <button onClick={() => action("concede")}>Concede</button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main board component
// ──────────────────────────────────────────────────────────────────

export function GameBoard({ gameId }: { gameId: string }): React.ReactElement | null {
  const gameState = useGameBoard(s => s.gameState);
  const user = useAppState(s => s.user);

  if (!gameState) return null;

  const localSide = getLocalSide(gameState);
  const meSide = localSide === "spectator" ? "corp" : localSide;
  const opSide = meSide === "corp" ? "runner" : "corp";

  const me = gameState[meSide] as PlayerState | undefined;
  const opponent = gameState[opSide] as PlayerState | undefined;
  const meHand = me?.hand ?? [];
  const opHand = opponent?.hand ?? [];
  const isNotSpectator = localSide !== "spectator";
  const mePrompt = me?.["prompt-state"];
  const activePlayer = gameState["active-player"] ?? "corp";

  const corpServers = gameState.corp?.servers as Record<string, { ices?: CardState[]; content?: CardState[] }> ?? {};

  return (
    <div className="gameview">
      <div className="gameboard">
        {/* Opponent stats */}
        <div className="leftpane">
          <div className="opponent">
            <HandView
              cards={opHand}
              visible={false}
              side={opSide}
              gameId={gameId}
            />
          </div>
          <div className="inner-leftpane">
            <PlayerStats
              player={opponent ?? {}}
              side={opSide}
              gameId={gameId}
              active={activePlayer === opSide}
            />
            <PlayerStats
              player={me ?? {}}
              side={meSide}
              gameId={gameId}
              active={activePlayer === meSide}
            />
          </div>
          <div className="me">
            <HandView
              cards={meHand}
              visible={isNotSpectator}
              side={meSide}
              gameId={gameId}
            />
          </div>
        </div>

        {/* Central board */}
        <div className="centralpane">
          {/* Corp servers */}
          <div className="corp-board">
            {Object.entries(corpServers).map(([key, server]) => (
              <ServerView key={key} serverKey={key} server={server} gameId={gameId} />
            ))}
          </div>

          {/* Runner rig */}
          <div className="runner-board">
            {gameState.runner?.rig && Object.entries(gameState.runner.rig as Record<string, CardState[]>).map(([zone, cards]) => (
              <div key={zone} className={`rig-zone ${zone}`}>
                {cards.map((c, i) => <Card key={c.cid ?? i} card={c} />)}
              </div>
            ))}
          </div>
        </div>

        {/* Right pane: action buttons + prompt + log */}
        <div className="right-pane">
          {mePrompt && (
            <PromptView prompt={mePrompt} gameId={gameId} side={meSide} />
          )}
          {isNotSpectator && (
            <ActionButtons gameId={gameId} side={meSide} gameState={gameState} />
          )}
          <GameLog log={gameState.log} gameId={gameId} />
        </div>
      </div>
    </div>
  );
}
