// Player view component: avatar, username, game completion rate, faction/side.
// Mirrors: src/cljs/nr/player_view.cljs
import React from "react";
import { Avatar } from "./avatar";
import { trSpan, trSide } from "./translations";
import { factionIcon, numToPercent } from "./utils";

// Mirrors: notnum->zero in utils.cljs
// numToPercent returns a string (e.g. "65"), so we parse it
function notnumToZero(input: number | string | null | undefined): number {
  const val = typeof input === "string" ? parseInt(input, 10) : input ?? 0;
  return isNaN(val) || val <= 0 ? 0 : val;
}

interface PlayerUser {
  username?: string;
  stats?: {
    "games-started"?: number;
    "games-completed"?: number;
  };
  [key: string]: unknown;
}

interface PlayerDeck {
  identity?: {
    faction?: string;
    title?: string;
  };
}

export interface PlayerViewPlayer {
  user?: PlayerUser;
  side?: string;
  deck?: PlayerDeck;
  [key: string]: unknown;
}

export interface PlayerViewGame {
  password?: boolean;
  "allow-spectator"?: boolean;
  [key: string]: unknown;
}

// Mirrors: user-status-span
function UserStatusSpan({ player }: { player: PlayerViewPlayer }): React.ReactElement {
  const started = (player.user?.stats?.["games-started"] as number) ?? 0;
  const completed = (player.user?.stats?.["games-completed"] as number) ?? 0;
  const completionRate = notnumToZero(numToPercent(completed, started)) + "%";
  const displayRate = started < 10
    ? trSpan(["lobby_too-little-data", "Too little data"])
    : completionRate;

  return (
    <span className="user-status">
      {player.user?.username}
      <div className="status-tooltip blue-shade">
        <div>
          {trSpan(["lobby_completion-rate", "Game Completion Rate"])}: {displayRate}
        </div>
      </div>
    </span>
  );
}

// Mirrors: player-view
export function playerView(
  player: PlayerViewPlayer,
  game?: PlayerViewGame | null
): React.ReactElement {
  const side = player.side;
  const faction = (player.deck as PlayerViewPlayer["deck"])?.identity?.faction;
  const identity = (player.deck as PlayerViewPlayer["deck"])?.identity?.title;
  const specs = game?.["allow-spectator"];

  let sideContent: React.ReactElement | string | null = null;
  if (game && !game.password) {
    if (faction && faction !== "Neutral" && specs) {
      sideContent = factionIcon(faction, identity ?? "");
    } else if (side) {
      sideContent = ` (${trSide(side)})`;
    }
  }

  return (
    <span className="player">
      <Avatar user={player.user ?? {}} opts={{ size: 22 }} />
      <UserStatusSpan player={player} />
      {sideContent}
    </span>
  );
}
