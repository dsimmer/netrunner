// Player stats sidebar: credits, clicks, agenda points, hand/deck/discard counts.
// Mirrors: src/cljs/nr/gameboard/player_stats.cljs
import React, { useState } from "react";
import { useGameBoard, getLocalSide, type PlayerState, type GameStateData } from "./state";
import { Avatar } from "../avatar";
import { wsSend } from "../ws";
import { currentGameID, useAppState } from "../appstate";
import { tr, trSpan, trElement, trPronouns } from "../translations";

// ---------------------------------------------------------------------------
// send-command: mirror of CLJS (send-command command args)
// ---------------------------------------------------------------------------
function sendCommand(command: string, args?: Record<string, unknown>): void {
  const gameid = currentGameID();
  if (gameid) {
    wsSend("game/action", { gameid, command, args: args ?? {} });
  }
}

// ---------------------------------------------------------------------------
// stat-controls: overlay to increase/decrease a player attribute
// ---------------------------------------------------------------------------
function StatControls({
  key,
  increment = 1,
  decrement = -1,
  children,
  enabled,
}: {
  key: string;
  increment?: number;
  decrement?: number;
  children: React.ReactNode;
  enabled: boolean;
}) {
  if (!enabled) {
    return <>{children}</>;
  }
  return (
    <div className="stat-controls">
      {children}
      <div className="controls">
        <button
          className="small"
          type="button"
          onClick={() => sendCommand("change", { key, delta: decrement })}
        >
          -
        </button>
        <button
          className="small"
          type="button"
          onClick={() => sendCommand("change", { key, delta: increment })}
        >
          +
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// stat-controls-for-side: returns a wrapper that only enables controls
// for the current player's side.
// ---------------------------------------------------------------------------
function makeStatControlWrapper(
  side: "corp" | "runner" | "spectator",
  currentSide: "corp" | "runner" | "spectator",
): (props: { key: string; children: React.ReactNode; increment?: number; decrement?: number }) => React.ReactElement {
  if (side === currentSide) {
    return ({ key, children, increment, decrement }) => (
      <StatControls key={key} increment={increment} decrement={decrement} enabled={true}>
        {children}
      </StatControls>
    );
  }
  return ({ children }) => <>{children}</>;
}

// ---------------------------------------------------------------------------
// name-area
// ---------------------------------------------------------------------------
function NameArea({ user }: { user?: { username?: string; options?: Record<string, unknown> } }) {
  const pronouns = user?.options?.pronouns as string | undefined;
  let proStr = "";
  if (pronouns) {
    proStr = pronouns === "blank" ? "" : trPronouns(pronouns);
  }
  return (
    <div className="name-area">
      <Avatar user={user ?? {}} opts={{ size: 32 }} />
      <div className="name-box">
        <div className="username">{user?.username}</div>
        {proStr && <div className="pronouns">{proStr.toLowerCase()}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory types
// ---------------------------------------------------------------------------
interface MemoryData {
  available: number;
  used: number;
  only_for?: Record<string, { available: number; used: number }>;
}

interface TagData {
  base: number;
  total: number;
  "is-tagged"?: boolean;
}

interface BadPublicityData {
  base: number;
  additional: number;
}

// ---------------------------------------------------------------------------
// display-memory
// ---------------------------------------------------------------------------
function DisplayMemory({
  memory,
  icon,
  Ctrl,
}: {
  memory?: MemoryData;
  icon: boolean;
  Ctrl: (props: { key: string; children: React.ReactNode; increment?: number; decrement?: number }) => React.ReactElement;
}) {
  if (!memory) return null;
  const { available, used } = memory;
  const unused = available - used;
  const label = icon
    ? <>{unused} / {available} <span className="anr-icon mu" /></>
    : trSpan(["game_mu-count", "MU Count"], { unused: String(unused), available: String(available) });

  return (
    <Ctrl key="memory">
      <div>
        {label}
        {unused < 0 && <div className="warning">!</div>}
      </div>
    </Ctrl>
  );
}

// ---------------------------------------------------------------------------
// display-special-memory
// ---------------------------------------------------------------------------
function DisplaySpecialMemory({
  memory,
  icon,
}: {
  memory?: MemoryData;
  icon: boolean;
}) {
  if (!memory?.only_for) return null;

  const entries = Object.entries(memory.only_for).filter(
    ([, v]) => v && typeof v === "object" && (v as { available: number }).available > 0,
  );

  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([muType, data]) => {
        const d = data as { available: number; used: number };
        const unused = Math.max(0, d.available - d.used);
        const muTypeName = muType.charAt(0).toUpperCase() + muType.slice(1);
        return (
          <div key={muTypeName}>
            {icon
              ? <>{unused} / {d.available} {muTypeName} <span className="anr-icon mu" /></>
              : trSpan(
                  ["game_special-mu-count", "Special MU Count"],
                  {
                    unused: String(unused),
                    available: String(d.available),
                    "mu-type": muTypeName,
                  },
                )}
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// stats-area: Runner
// ---------------------------------------------------------------------------
function RunnerStatsArea({
  player,
  Ctrl,
}: {
  player: PlayerState;
  Ctrl: (props: { key: string; children: React.ReactNode; increment?: number; decrement?: number }) => React.ReactElement;
}) {
  const appOptions = useAppState((s) => s.options);
  const icons = (appOptions["player-stats-icons"] as boolean) ?? true;

  const click = player.click ?? 0;
  const credit = player.credit ?? 0;
  const runCredit = (player["run-credit"] as number) ?? 0;
  const badPubCredit = (player["bad-pub-credit"] as number) ?? 0;
  const memory = player.memory as MemoryData | undefined;
  const link = (player.link as number) ?? 0;
  const brainDamage = (player["brain-damage"] as number) ?? 0;
  const tag = (player.tag as TagData) ?? { base: 0, total: 0, "is-tagged": false };

  const baseCredit = credit - runCredit;
  const plusRunCredit = (runCredit > 0 || badPubCredit > 0) ? `+${badPubCredit + runCredit}` : undefined;

  const isTagged = tag["is-tagged"] ?? false;
  const additionalTags = tag.total - tag.base;
  const showTagged = isTagged || tag.total > 0;

  return (
    <div className="stats-area">
      {icons ? (
        <>
          <div className="icon-grid">
            <Ctrl key="click">
              <div>{click} <span className="anr-icon click" /></div>
            </Ctrl>
            <Ctrl key="credit">
              <div>{baseCredit} {plusRunCredit ?? ""} <span className="anr-icon credit" /></div>
            </Ctrl>
            <DisplayMemory memory={memory} icon Ctrl={Ctrl} />
            <Ctrl key="link">
              <div>{link} <span className="anr-icon link" /></div>
            </Ctrl>
          </div>
          <DisplaySpecialMemory memory={memory} icon />
        </>
      ) : (
        <>
          <Ctrl key="click">
            <div>{trSpan(["game_click-count", "Click Count"], { click: String(click) })}</div>
          </Ctrl>
          <Ctrl key="credit">
            <div>
              {runCredit > 0
                ? trSpan(
                    ["game_credit-count-with-run-credits", "Credit Count with Run Credits"],
                    { credit: String(credit), "run-credit": String(runCredit) },
                  )
                : trSpan(["game_credit-count", "Credit Count"], { credit: String(credit) })}
            </div>
          </Ctrl>
          <DisplayMemory memory={memory} icon={false} Ctrl={Ctrl} />
          <DisplaySpecialMemory memory={memory} icon={false} />
          <Ctrl key="link">
            <div>
              {link} {trSpan(["game_link-strength", "Link Strength"])}
            </div>
          </Ctrl>
        </>
      )}
      <Ctrl key="tag">
        <div>
          {additionalTags > 0
            ? trSpan(
                ["game_tag-count-additional", "Tag Count Additional"],
                { base: String(tag.base), additional: String(additionalTags), total: String(tag.total) },
              )
            : trSpan(["game_tag-count", "Tag Count"], { base: String(tag.base) })}
          {showTagged && <div className="warning">!</div>}
        </div>
      </Ctrl>
      <Ctrl key="brain-damage">
        {trElement("div", ["game_brain-damage", "Core Damage"], { dmg: String(brainDamage) })}
      </Ctrl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// stats-area: Corp
// ---------------------------------------------------------------------------
function CorpStatsArea({
  player,
  Ctrl,
}: {
  player: PlayerState;
  Ctrl: (props: { key: string; children: React.ReactNode; increment?: number; decrement?: number }) => React.ReactElement;
}) {
  const appOptions = useAppState((s) => s.options);
  const icons = (appOptions["player-stats-icons"] as boolean) ?? true;

  const click = player.click ?? 0;
  const credit = player.credit ?? 0;
  const badPublicity = (player["bad-publicity"] as BadPublicityData) ?? { base: 0, additional: 0 };

  return (
    <div className="stats-area">
      {icons ? (
        <div className="icon-grid">
          <Ctrl key="click">
            <div>{click} <span className="anr-icon click" /></div>
          </Ctrl>
          <Ctrl key="credit">
            <div>{credit} <span className="anr-icon credit" /></div>
          </Ctrl>
        </div>
      ) : (
        <>
          <Ctrl key="click">
            {trElement("div", ["game_click-count", "Click Count"], { click: String(click) })}
          </Ctrl>
          <Ctrl key="credit">
            {trElement("div", ["game_credit-count", "Credit Count"], { credit: String(credit) })}
          </Ctrl>
        </>
      )}
      <Ctrl key="bad-publicity">
        <div>
          {badPublicity.additional > 0
            ? trSpan(
                ["game_bad-pub-count-additional", "Bad Pub Count Additional"],
                { base: String(badPublicity.base), additional: String(badPublicity.additional) },
              )
            : trSpan(["game_bad-pub-count", "Bad Pub Count"], { base: String(badPublicity.base) })}
        </div>
      </Ctrl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// really-my-side?: check if this player is controlled by the local user
// ---------------------------------------------------------------------------
function reallyMySide(side: string, gameState: GameStateData | null): boolean {
  const localSide = getLocalSide(gameState);
  return localSide !== "spectator" && localSide === side.toLowerCase();
}

// ---------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------
function Tabs({
  selectedTab,
  setTab,
}: {
  selectedTab: string;
  setTab: (tab: string) => void;
}) {
  return (
    <div className="panel-bot selector options-tabs">
      <div className="tab">
        <a
          key="stats"
          onClick={() => setTab("stats")}
          style={{ cursor: "pointer" }}
        >
          <label>Stats</label>
        </a>
      </div>
      <div className="tab right">
        <a
          key="options"
          onClick={() => setTab("options")}
          style={{ cursor: "pointer" }}
        >
          <label>Gameplay Options</label>
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// render-player-panel
// ---------------------------------------------------------------------------
function RenderPlayerPanel({
  player,
}: {
  player: PlayerState;
}) {
  const gameState = useGameBoard((s) => s.gameState);
  const localSide = getLocalSide(gameState);
  const playerSide = (player.identity?.side as string) ?? "";
  const Ctrl = makeStatControlWrapper(
    playerSide === "Corp" ? "corp" : "runner",
    localSide,
  );

  return (
    <>
      <NameArea user={player.user as { username?: string; options?: Record<string, unknown> }} />
      {/* key forces re-mount when side changes (React caches defmulti results) */}
      {playerSide === "Runner" ? (
        <RunnerStatsArea key="runner" player={player} Ctrl={Ctrl} />
      ) : (
        <CorpStatsArea key="corp" player={player} Ctrl={Ctrl} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// gameplay-boolean: checkbox for gameplay options
// ---------------------------------------------------------------------------
function GameplayBoolean({
  player,
  targetSide,
  key,
  trKey,
  trText,
}: {
  player: PlayerState;
  targetSide: "corp" | "runner" | null;
  key: string;
  trKey: string;
  trText: string;
}) {
  const gameState = useGameBoard((s) => s.gameState);
  const localSide = getLocalSide(gameState);

  const val = ((player.properties as Record<string, unknown>)?.[key] as boolean) ?? false;

  if (targetSide && targetSide !== localSide) {
    return null;
  }

  return (
    <div>
      <label>
        <input
          type="checkbox"
          key={key}
          checked={val}
          onChange={(e) =>
            sendCommand("set-property", { key, value: e.target.checked })
          }
        />
        {trSpan([trKey, trText])}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// in-game-options
// ---------------------------------------------------------------------------
function InGameOptions({
  player,
}: {
  player: PlayerState;
}) {
  return (
    <div className="in-game-options">
      {trElement("h4", ["gameplay-options_gameplay-options", "General Gameplay Options"])}
      <GameplayBoolean
        player={player}
        targetSide={null}
        key="trash-like-cards"
        trKey="game_trash-like-cards"
        trText="Offer to trash like cards"
      />
      <GameplayBoolean
        player={player}
        targetSide="corp"
        key="auto-purge"
        trKey="game_auto-purge-smart"
        trText="CSV/Mavirus Auto-purge"
      />
      {trElement("h4", ["gameplay-options_timing-windows", "Timing Windows"])}

      {/* Corp perspective window forcing */}
      <GameplayBoolean
        player={player}
        targetSide="corp"
        key="force-phase-12-self"
        trKey="game_force-phase-12-self-corp"
        trText="Corp pre-draw PAW"
      />
      <GameplayBoolean
        player={player}
        targetSide="corp"
        key="force-phase-12-opponent"
        trKey="game_force-phase-12-opponent-corp"
        trText="Runner turn-begins PAW"
      />
      <GameplayBoolean
        player={player}
        targetSide="corp"
        key="force-post-discard-self"
        trKey="game_force-post-discard-self-corp"
        trText="Corp post-discard PAW"
      />
      <GameplayBoolean
        player={player}
        targetSide="corp"
        key="force-post-discard-opponent"
        trKey="game_force-post-discard-opponent-corp"
        trText="Runner post-discard PAW"
      />

      {/* Runner perspective window forcing */}
      <GameplayBoolean
        player={player}
        targetSide="runner"
        key="force-phase-12-self"
        trKey="game_force-phase-12-self-runner"
        trText="Runner turn-begins PAW"
      />
      <GameplayBoolean
        player={player}
        targetSide="runner"
        key="force-phase-12-opponent"
        trKey="game_force-phase-12-opponent-runner"
        trText="Corp pre-draw PAW"
      />
      <GameplayBoolean
        player={player}
        targetSide="runner"
        key="force-post-discard-self"
        trKey="game_force-post-discard-self-runner"
        trText="Runner post-discard PAW"
      />
      <GameplayBoolean
        player={player}
        targetSide="runner"
        key="force-post-discard-opponent"
        trKey="game_force-post-discard-opponent-runner"
        trText="Corp post-discard PAW"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// stats-view: main component with tabs for stats / options
// ---------------------------------------------------------------------------
export function PlayerStats({ side }: { side: "corp" | "runner" }): React.ReactElement {
  const [selectedTab, setSelectedTab] = useState("stats");

  const gameState = useGameBoard((s) => s.gameState);
  if (!gameState) return <div className="panel blue-shade stats" />;

  const player = gameState[side] as PlayerState | undefined;
  if (!player) return <div className="panel blue-shade stats" />;

  const playerSide = (player.identity?.side as string) ?? "";
  const showTabs = reallyMySide(playerSide, gameState);

  return (
    <div className={`panel blue-shade stats${player.active ? " active-player" : ""}`}>
      {!showTabs ? (
        <RenderPlayerPanel player={player} />
      ) : (
        <>
          {selectedTab === "stats" ? (
            <RenderPlayerPanel player={player} />
          ) : (
            <InGameOptions player={player} />
          )}
          <Tabs selectedTab={selectedTab} setTab={setSelectedTab} />
        </>
      )}
    </div>
  );
}

export default PlayerStats;
