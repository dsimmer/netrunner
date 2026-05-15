// Angel Arena stats tracking.
// Mirrors: src/clj/web/angel_arena/stats.clj

import { Db, Document } from "mongodb";
import { finishRun } from "./runs";
import { getDeckFromId, getLosses, getRuns, Runs, SideRun } from "./utils";
import { chskSend } from "../ws";

const MAX_LOSSES = 3;

type Player = {
  user: {
    username: string;
    options?: {
      pronouns?: string;
    };
  };
  format: string;
  side: string;
  uid?: string;
};

type EndingPlayer = Player;

type State = {
  winner?: string;
  reason?: string;
  [key: string]: unknown;
};

async function enterWinner(
  db: Db,
  player: Player,
  game: { gameid?: string; endingPlayers?: EndingPlayer[]; state?: State }
): Promise<Runs | undefined> {
  try {
    const { gameid, endingPlayers, state } = game;
    const username = player.user.username;
    const otherPlayer = endingPlayers?.find(
      (p) => p.user.username !== username
    );
    const runs = await getRuns(db, username);
    if (!runs) return undefined;

    const form = player.format.toLowerCase();
    const side = player.side.toLowerCase();
    const otherSide = otherPlayer ? otherPlayer.side.toLowerCase() : "";

    const otherIdentity =
      state && otherSide
        ? (
            (state as any)[otherSide] as { identity?: { title?: string } }
          )?.identity?.title
        : undefined;

    const updatedRun = {
      "game-id": gameid,
      winner: state?.winner ?? null,
      reason: state?.reason ?? null,
      opponent: {
        username: otherPlayer?.user.username ?? "",
        pronouns: otherPlayer?.user.options?.pronouns,
        identity: otherIdentity,
      },
    };

    const newRuns = { ...runs };
    if (newRuns[form] && newRuns[form][side]) {
      const sideRuns = { ...newRuns[form][side] };
      const existingGames = sideRuns.games ?? [];
      sideRuns.games = existingGames.map((gameEntry) =>
        gameEntry["game-id"] === gameid ? updatedRun : gameEntry
      );
      newRuns[form] = { ...newRuns[form], [side]: sideRuns };
    }

    await db.collection<Document>("users").updateOne(
      { username },
      { $set: { "angel-arena-runs": newRuns as any } }
    );
    return newRuns;
  } catch (e: any) {
    console.log("Caught exception entering winner: " + e.message);
  }
}

export async function gameFinished(
  db: Db,
  game: { endingPlayers?: EndingPlayer[]; originalPlayers?: Player[] }
): Promise<void> {
  const { endingPlayers, originalPlayers } = game;
  for (const player of originalPlayers ?? []) {
    const username = player.user.username;
    const endPlayer = endingPlayers?.find(
      (p) => p.user.username === username
    );
    const form = (player.format ?? "").toLowerCase();
    const side = (player.side ?? "").toLowerCase();

    const runs = await enterWinner(db, player, game);
    if (runs) {
      const deck = await getDeckFromId(
        db,
        username,
        runs[form]?.[side]?.["deck-id"]
      );
      if (deck) {
        const sideRun = runs[form]?.[side] as SideRun | undefined;
        if (sideRun) {
          const losses = getLosses(sideRun);
          if (MAX_LOSSES <= losses) {
            await finishRun(db, username, runs, deck as any);
          }
        }
        if (endPlayer?.uid) {
          chskSend(endPlayer.uid, ["angel-arena/run-update"]);
        }
      }
    }
  }
}
