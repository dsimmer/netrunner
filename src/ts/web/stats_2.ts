// Statistics and replay management. Mirrors: src/clj/web/stats.clj

import { Db, ObjectId, WithId, Document } from "mongodb";
import { dissocIn } from "../game/utils";
import { AllCards } from "../jinteki/cards";
import { chskSend } from "./ws";
import { activeUser } from "./user";
import { response, jsonResponse, mongoTimeToUtcString, type HttpResponse } from "./utils";

import { filterLogForSide, stripOpponentDeckName, toObjectId } from "./stats_1";
import type { Annotation, RequestLike } from "./stats_1";
import { indexPage } from "./pages";

/**
 * Clear deck stats.
 * Mirrors: clear-deckstats-handler
 */
export async function clearDeckstatsHandler(
  req: RequestLike,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const username = (req.user as any)?.username;
  const id = req["path-params"]?.id;

  if (!id || !username || !db) {
    return response(401, { message: "Unauthorized" });
  }

  const deckId = toObjectId(id);
  if (!deckId) {
    return response(401, { message: "Unauthorized" });
  }

  const deck = await db.collection("decks").findOne({ _id: deckId, username });

  if (!deck) {
    return response(401, { message: "Unauthorized" });
  }

  const result = await db
    .collection("decks")
    .updateOne({ _id: deckId }, { $unset: { stats: "" } });

  if (result.acknowledged) {
    return response(200, { message: "Deleted" });
  }
  return response(403, { message: "Forbidden" });
}

/**
 * Get game history for a user.
 * Mirrors: history
 */
export async function historyHandler(
  req: RequestLike,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const user = req.user as any;
  const username = user?.username;
  const skipStr = req.params?.skip;
  const skip = skipStr ? parseInt(skipStr, 10) : 0;

  if (!db || !activeUser(user)) {
    return response(401, { message: "Unauthorized" });
  }

  const games = await db
    .collection("game-logs")
    .find({
      $or: [
        { "corp.player.username": username },
        { "runner.player.username": username },
      ],
    })
    .project({ replay: 0, log: 0, _id: 0 })
    .sort({ "start-date": -1 })
    .skip(skip)
    .limit(100)
    .toArray();

  const processed = games.map((game: any) => {
    let g = { ...game };
    g["creation-date"] = mongoTimeToUtcString(g["creation-date"]);
    g["start-date"] = mongoTimeToUtcString(g["start-date"]);
    g["end-date"] = mongoTimeToUtcString(g["end-date"]);
    g = stripOpponentDeckName(g, username);
    return g;
  });

  return response(200, processed);
}

/**
 * Fetch game log for a specific game.
 * Mirrors: fetch-log
 */
export async function fetchLog(
  req: RequestLike,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const username = (req.user as any)?.username;
  const gameid = req["path-params"]?.gameid;

  if (!username || !db) {
    return response(401, { message: "Unauthorized" });
  }

  const game = await db
    .collection("game-logs")
    .findOne({ gameid }, { projection: { corp: 1, runner: 1, log: 1 } });

  if (!game) {
    return response(401, { message: "Unauthorized" });
  }

  const corpUsername = (game.corp as any)?.player?.username;
  const runnerUsername = (game.runner as any)?.player?.username;

  if (username !== corpUsername && username !== runnerUsername) {
    return response(401, { message: "Unauthorized" });
  }

  const side: "corp" | "runner" = username === corpUsername ? "corp" : "runner";
  const filteredLog = filterLogForSide(game.log as unknown[], side);

  return response(200, filteredLog.length > 0 ? filteredLog : []);
}

/**
 * Fetch annotations for a game.
 * Mirrors: fetch-annotations
 */
export async function fetchAnnotations(
  req: RequestLike,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const user = req.user as any;
  const username = user?.username;
  const gameid = req["path-params"]?.gameid;

  if (!db || !activeUser(user)) {
    return response(401, { message: "Unauthorized" });
  }

  const game = await db
    .collection("game-logs")
    .findOne(
      { gameid },
      {
        projection: { corp: 1, runner: 1, "replay-shared": 1, annotations: 1 },
      },
    );

  if (!game) {
    return response(401, { message: "Unauthorized" });
  }

  const corpUsername = (game.corp as any)?.player?.username;
  const runnerUsername = (game.runner as any)?.player?.username;
  const replayShared = game["replay-shared"] as boolean;

  if (
    !replayShared &&
    username !== corpUsername &&
    username !== runnerUsername
  ) {
    return response(401, { message: "Unauthorized" });
  }

  return jsonResponse(200, game.annotations || []);
}

/**
 * Fetch elapsed time for a game.
 * Mirrors: fetch-elapsed
 */
export async function fetchElapsed(
  db: Db,
  gameid: string,
): Promise<number | undefined> {
  const doc = await db
    .collection("game-logs")
    .findOne({ gameid: String(gameid) }, { projection: { stats: 1 } });
  const stats = (doc?.stats as any) || {};
  return stats.time?.elapsed;
}

/**
 * Check if annotations total size is under 50k characters.
 * Mirrors: check-annotations-size
 */
function checkAnnotationsSize(annotations: Record<string, unknown>): boolean {
  const turns = annotations.turns as Record<string, unknown> | undefined;
  const clicks = annotations.clicks as Record<string, unknown> | undefined;

  const corpNotes =
    (turns?.corp as Record<string, { notes?: string }> | undefined) || {};
  const runnerNotes =
    (turns?.runner as Record<string, { notes?: string }> | undefined) || {};
  const clickNotes =
    (clicks as Record<string, { notes?: string }> | undefined) || {};

  const totalSize =
    Object.values(corpNotes).reduce(
      (sum, entry) => sum + ((entry as any)?.notes?.length || 0),
      0,
    ) +
    Object.values(runnerNotes).reduce(
      (sum, entry) => sum + ((entry as any)?.notes?.length || 0),
      0,
    ) +
    Object.values(clickNotes).reduce(
      (sum, entry) => sum + ((entry as any)?.notes?.length || 0),
      0,
    );

  return 50000 >= totalSize;
}

/**
 * Publish annotations for a game replay.
 * Mirrors: publish-annotations
 */
export async function publishAnnotations(
  req: RequestLike,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const username = (req.user as any)?.username;
  const gameid = req["path-params"]?.gameid;
  const body = req.body as Record<string, unknown>;

  if (!db || !username) {
    return response(401, { message: "Unauthorized" });
  }

  const game = await db
    .collection("game-logs")
    .findOne(
      { gameid },
      {
        projection: {
          corp: 1,
          runner: 1,
          replay: 1,
          "replay-shared": 1,
          annotations: 1,
        },
      },
    );

  if (!game) {
    return response(404, { message: "Replay not found" });
  }

  const corpUsername = (game.corp as any)?.player?.username;
  const runnerUsername = (game.runner as any)?.player?.username;
  const replayShared = game["replay-shared"] as boolean;
  const replay = (game.replay as string) || "";
  const annotations = game.annotations || [];

  if (
    !replayShared &&
    username !== corpUsername &&
    username !== runnerUsername
  ) {
    return response(401, { message: "Unauthorized" });
  }

  if (!replay || replay.length === 0) {
    return response(404, { message: "Replay not found" });
  }

  if (!checkAnnotationsSize(body as any)) {
    return response(413, { message: "File too large" });
  }

  const turns = body.turns as Record<string, unknown> | undefined;
  const newAnnotation: Annotation = {
    username,
    date: body.date as Date | string,
    turns: {
      corp: (turns?.corp as any) || {},
      runner: (turns?.runner as any) || {},
    },
    clicks: (body.clicks as any) || {},
  };

  const newAnnotations = [...annotations, newAnnotation];

  await db
    .collection("game-logs")
    .updateOne(
      { gameid: String(gameid) },
      { $set: { annotations: newAnnotations } },
    );

  return response(200, { message: "Annotations published" });
}

/**
 * Delete annotations for a game replay.
 * Mirrors: delete-annotations
 */
export async function deleteAnnotations(
  req: RequestLike,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const username = (req.user as any)?.username;
  const gameid = req["path-params"]?.gameid;
  const date = req["path-params"]?.date;

  if (!db || !username) {
    return response(401, { message: "Unauthorized" });
  }

  const game = await db
    .collection("game-logs")
    .findOne(
      { gameid },
      {
        projection: {
          corp: 1,
          runner: 1,
          replay: 1,
          "replay-shared": 1,
          annotations: 1,
        },
      },
    );

  if (!game) {
    return response(404, { message: "Replay not found" });
  }

  const replay = (game.replay as string) || "";
  const annotations: Annotation[] = game.annotations || [];

  if (!replay || replay.length === 0) {
    return response(404, { message: "Replay not found" });
  }

  // Find annotation index by matching date string
  const corpUsername = (game.corp as any)?.player?.username;
  const runnerUsername = (game.runner as any)?.player?.username;

  let ind: number | undefined;
  let anno: Annotation | undefined;
  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    if (String(a.date) === date) {
      ind = i;
      anno = a;
      break;
    }
  }

  if (!anno) {
    return response(404, { message: "Annotations not found" });
  }

  if (
    username !== anno.username &&
    username !== corpUsername &&
    username !== runnerUsername
  ) {
    return response(401, { message: "Unauthorized" });
  }

  const newAnnotations = [
    ...annotations.slice(0, ind!),
    ...annotations.slice((ind as number) + 1),
  ];

  await db
    .collection("game-logs")
    .updateOne(
      { gameid: String(gameid) },
      { $set: { annotations: newAnnotations } },
    );

  return response(200, { message: "Annotations deleted" });
}

/**
 * Fetch replay data for a game.
 * Mirrors: fetch-replay
 */
export async function fetchReplay(
  req: RequestLike,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const username = (req.user as any)?.username;
  const gameid = req["path-params"]?.gameid;

  if (!db || !username) {
    return response(401, { message: "Unauthorized" });
  }

  const game = await db
    .collection("game-logs")
    .findOne(
      { gameid },
      {
        projection: {
          corp: 1,
          runner: 1,
          replay: 1,
          "replay-shared": 1,
          "bug-reported": 1,
        },
      },
    );

  if (!game) {
    return response(404, { message: "Replay not found" });
  }

  const replay = (game.replay as string) || "{}";
  const replayShared = game["replay-shared"] as boolean;
  const bugReported = game["bug-reported"] as boolean;

  const corpUsername = (game.corp as any)?.player?.username;
  const runnerUsername = (game.runner as any)?.player?.username;

  if (
    !bugReported &&
    !replayShared &&
    username !== corpUsername &&
    username !== runnerUsername
  ) {
    return response(401, { message: "Unauthorized" });
  }

  if (!replay || Object.keys(replay).length === 0) {
    return response(404, { message: "Replay not found" });
  }

  const parsedReplay =
    typeof replay === "string" ? JSON.parse(replay) : (replay as any);
  parsedReplay["replay-shared"] = replayShared;

  return jsonResponse(200, JSON.stringify(parsedReplay));
}

/**
 * Share a replay publicly.
 * Mirrors: share-replay
 */
export async function shareReplay(
  req: RequestLike,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const username = (req.user as any)?.username;
  const gameid = req["path-params"]?.gameid;

  if (!username || !db) {
    return response(401, { message: "Unauthorized" });
  }

  try {
    await db.collection("game-logs").updateOne(
      {
        $and: [
          { gameid: String(gameid) },
          {
            $or: [
              { "corp.player.username": username },
              { "runner.player.username": username },
            ],
          },
        ],
      },
      { $set: { "replay-shared": true } },
    );
    return response(200, { message: "Shared" });
  } catch (e) {
    console.error("Caught exception sharing game", e);
    return response(500, { message: "Server error" });
  }
}

// ---- Replay HTML Page ----

/**
 * Get the winner's identity card image URL.
 * Mirrors: get-winner-card
 */
function getWinnerCard(
  winner: string | undefined,
  corp: Record<string, unknown>,
  runner: Record<string, unknown>,
  host: string,
): string {
  const defaultImg = `${host}/img/icons/jinteki_167.png`;
  if (!winner) return defaultImg;

  const sideData = winner === "corp" ? corp : runner;
  const winId = (sideData as any).identity as string | undefined;

  if (winId) {
    const cardData = AllCards[winId] as Record<string, unknown> | undefined;
    const cardImg = (cardData?.images as any)?.en?.default?.stock as
      | string
      | undefined;
    if (cardImg) {
      return `${host}${cardImg}`;
    }
  }
  return defaultImg;
}

/**
 * Render the replay HTML page.
 * Mirrors: replay-handler
 */
export async function replayHandler(
  req: RequestLike,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const gameid = req["path-params"]?.gameid;
  const bugid = req["path-params"]?.bugid;
  const n = req.params?.n;
  const d = req.params?.d;
  const b = req.params?.b;
  const scheme = req.scheme || "http";
  const headers = req.headers || {};

  if (!db) {
    return response(404, { message: "Replay not found" });
  }

  const game = await db
    .collection("game-logs")
    .findOne(
      { gameid: gameid || bugid },
      { projection: { replay: 1, winner: 1, corp: 1, runner: 1, title: 1 } },
    );

  if (!game) {
    return response(404, { message: "Replay not found" });
  }

  const replay = game.replay as string | undefined;
  if (!replay) {
    return response(404, { message: "Replay not found" });
  }

  // Build gameid string with query params
  let gameidStr: string;
  if (gameid) {
    gameidStr = n && d ? `${gameid}?n=${n}&d=${d}` : gameid;
  } else {
    gameidStr = `${bugid}?bug-report${b ? `&b=${b}` : ""}`;
  }

  const corpUser = (game.corp as any)?.player?.username || "Unknown";
  const corpId = (game.corp as any)?.identity || "";
  const runnerUser = (game.runner as any)?.player?.username || "Unknown";
  const runnerId = (game.runner as any)?.identity || "";
  const host = `${scheme}://${headers.host || "jinteki.net"}`;
  const title = game.title || "";

  // Build OG meta data
  const og: Record<string, string> = {
    type: "website",
    url: req.originalUrl || req.url || "",
    image: getWinnerCard(
      game.winner as string | undefined,
      game.corp as Record<string, unknown>,
      game.runner as Record<string, unknown>,
      host,
    ),
    title: `${gameid ? "REPLAY: " : "BUG-REPORT: "} ${title}`,
    site_name: "jinteki.net",
    description: `${corpUser} (${corpId}) vs. ${runnerUser} (${runnerId})`,
  };

  // Use pages.indexPage to render with OG data, replay id, and CSRF token.
  return indexPage(req as any, og as any, gameidStr);
}

/**
 * Replay rendering now delegates to pages.indexPage; the duplicated render
 * was removed in favor of the canonical implementation.
 */
