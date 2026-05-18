// Angel Arena run management.
// Mirrors: src/clj/web/angel_arena/runs.clj

import { Db, Document, ObjectId } from "mongodb";
import { getRuns, Runs, SideRun } from "./utils";
import { toObjectId } from "../mongodb";

interface Deck {
  _id?: ObjectId | string;
  name?: string;
  locked?: boolean;
  status?: {
    format?: string;
    [key: string]: { legal?: boolean } | unknown;
  };
  identity?: {
    side?: string;
    title?: string;
  };
}

interface Player {
  user: {
    username: string;
    options?: {
      pronouns?: string;
    };
  };
  format: string;
  side: string;
  deck?: {
    identity?: {
      title?: string;
    };
  };
}

/**
 * Start a new Angel Arena run for a user's deck.
 * Mirrors: start-run!
 */
export async function startRun(
  db: Db,
  username: string,
  runs: Runs,
  deck: Deck
): Promise<void> {
  const format = (deck.status?.format ?? "").toLowerCase();
  const side = (deck.identity?.side ?? "").toLowerCase();
  const deckId = String(deck._id ?? "");

  // Check deck is legal in this format
  const formatKey = format as string;
  const formatStatus = deck.status?.[formatKey] as
    | { legal?: boolean }
    | undefined;
  if (formatStatus?.legal) {
    // add run to user account
    const newRuns = { ...runs };
    if (!newRuns[formatKey]) {
      newRuns[formatKey] = {};
    }
    newRuns[formatKey][side] = {
      "deck-id": deckId,
      format: formatKey,
      side,
      games: [],
      "run-started": new Date().toISOString(),
    };

    await db.collection<Document>("users").updateOne(
      { username },
      { $set: { "angel-arena-runs": newRuns as any } }
    );

    // lock deck
    await db.collection<Document>("decks").updateOne(
      { _id: toObjectId(deckId), username },
      { $set: { locked: true } }
    );
  }
}

/**
 * Finish an Angel Arena run for a user's deck.
 * Mirrors: finish-run!
 */
export async function finishRun(
  db: Db,
  username: string,
  runs: Runs,
  deck: Deck
): Promise<void> {
  const format = (deck.status?.format ?? "").toLowerCase();
  const side = (deck.identity?.side ?? "").toLowerCase();
  const deckId = String(deck._id ?? "");

  // remove run from user account
  const newRuns = { ...runs };
  const formatKey = format as string;
  if (newRuns[formatKey]) {
    delete newRuns[formatKey][side];
  }

  await db.collection<Document>("users").updateOne(
    { username },
    { $set: { "angel-arena-runs": newRuns as any } }
  );

  // unlock deck
  await db.collection<Document>("decks").updateOne(
    { _id: toObjectId(deckId), username },
    { $set: { locked: false } }
  );

  // add run to run history
  const currentGames = runs[formatKey]?.[side]?.games;
  if (currentGames && currentGames.length > 0) {
    const runData = { ...runs[formatKey]?.[side] };
    await db.collection<Document>("angel-arena").insertOne({
      ...runData,
      identity: deck.identity?.title,
      "deck-name": deck.name,
      "run-finished": new Date().toISOString(),
      username,
    });
  }
}

/**
 * Add a new match to the user's Angel Arena run history.
 * Mirrors: add-new-match!
 */
export async function addNewMatch(
  db: Db,
  player: Player,
  otherPlayer: Player,
  gameId: string
): Promise<void> {
  try {
    const username = player.user.username;
    const runs = await getRuns(db, username);
    if (!runs) return;

    const side = player.side.toLowerCase();
    const form = player.format.toLowerCase();

    const otherUsername = otherPlayer.user.username;
    const otherPronouns = otherPlayer.user.options?.pronouns;
    const otherIdentity = otherPlayer.deck?.identity?.title;

    const newRuns = { ...runs };
    if (!newRuns[form]) {
      newRuns[form] = {};
    }
    const sideRuns: SideRun = newRuns[form][side] ?? {};
    const existingGames = sideRuns.games ?? [];
    const updatedGames = [
      ...existingGames,
      {
        "game-id": gameId,
        winner: null,
        reason: null,
        opponent: {
          username: otherUsername,
          pronouns: otherPronouns,
          identity: otherIdentity,
        },
      },
    ];

    newRuns[form][side] = {
      ...sideRuns,
      games: updatedGames,
    };

    await db.collection<Document>("users").updateOne(
      { username },
      { $set: { "angel-arena-runs": newRuns as any } }
    );
  } catch (e: any) {
    console.log(
      "Caught exception adding new game to Angel Arena history: " + e.message
    );
  }
}
