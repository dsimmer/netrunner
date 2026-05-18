import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  stripOpponentDeckName,
  filterLogForSide,
  toObjectId,
  clearUserstatsHandler,
} from "@/web/stats_1";
import { clearDeckstatsHandler, fetchLog } from "@/web/stats_2";
import type { RequestLike } from "@/web/stats_1";

// ---- Helper: build a mock Db with controllable collections ----

type FindOneFn = (query: Record<string, unknown>, options?: Record<string, unknown>) => Promise<any>;
type UpdateOneFn = (query: Record<string, unknown>, update: Record<string, unknown>) => Promise<{ acknowledged: boolean; matchedCount?: number; modifiedCount?: number }>;

function makeMockDb(findOne: FindOneFn, updateOne?: UpdateOneFn) {
  const defaultUpdateOne: UpdateOneFn = async () => ({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
  const collections: Record<string, { findOne: FindOneFn; updateOne: UpdateOneFn }> = {};

  const mockDb = {
    collection(name: string) {
      if (!collections[name]) {
        collections[name] = { findOne, updateOne: updateOne ?? defaultUpdateOne };
      }
      return collections[name];
    },
  };
  return mockDb as any;
}

// ---- stripOpponentDeckName tests (mirrors strip-opponent-deck-name-test) ----

describe("stripOpponentDeckName", () => {
  const game = {
    corp: { player: { username: "alice" }, "deck-name": "HB Fast Advance" },
    runner: { player: { username: "bob" }, "deck-name": "Stealth Andy" },
  };

  it("corp user: runner deck-name is stripped, corp deck-name is kept", () => {
    const result = stripOpponentDeckName(game, "alice");
    expect((result.corp as any)["deck-name"]).toBe("HB Fast Advance");
    expect((result.runner as any)["deck-name"]).toBeUndefined();
  });

  it("runner user: corp deck-name is stripped, runner deck-name is kept", () => {
    const result = stripOpponentDeckName(game, "bob");
    expect((result.runner as any)["deck-name"]).toBe("Stealth Andy");
    expect((result.corp as any)["deck-name"]).toBeUndefined();
  });
});

// ---- filterLogForSide tests ----

describe("filterLogForSide", () => {
  const publicMsg = { user: "__system__", text: "public message" };
  const corpMsg = { user: "__system__", text: "corp only" };
  const runnerMsg = { user: "__system__", text: "runner only" };

  const newFormatLog = [
    { public: publicMsg },
    { corp: corpMsg },
    { runner: runnerMsg },
  ];

  it("corp player receives public and corp-only messages, not runner-only", () => {
    const log = filterLogForSide(newFormatLog, "corp");
    expect(log).toHaveLength(2);
    expect(log.some((m: any) => m.text === "public message")).toBe(true);
    expect(log.some((m: any) => m.text === "corp only")).toBe(true);
    expect(log.some((m: any) => m.text === "runner only")).toBe(false);
  });

  it("runner player receives public and runner-only messages, not corp-only", () => {
    const log = filterLogForSide(newFormatLog, "runner");
    expect(log).toHaveLength(2);
    expect(log.some((m: any) => m.text === "public message")).toBe(true);
    expect(log.some((m: any) => m.text === "runner only")).toBe(true);
    expect(log.some((m: any) => m.text === "corp only")).toBe(false);
  });

  const oldFormatLog = [
    { user: "__system__", text: "Game started" },
    { user: { username: "alice", emailhash: "abc" }, text: "Hello" },
  ];

  it("old-format logs are returned unchanged for corp player", () => {
    const log = filterLogForSide(oldFormatLog, "corp");
    expect(log).toHaveLength(2);
    expect((log[0] as any).text).toBe("Game started");
  });

  it("old-format logs are returned unchanged for runner player", () => {
    const log = filterLogForSide(oldFormatLog, "runner");
    expect(log).toHaveLength(2);
    expect((log[0] as any).text).toBe("Game started");
  });

  it("returns empty array for null/undefined log", () => {
    expect(filterLogForSide(undefined, "corp")).toEqual([]);
    expect(filterLogForSide(null as any, "runner")).toEqual([]);
  });
});

// ---- clearDeckstatsHandler ownership tests (mirrors clear-deckstats-handler-ownership-test) ----

describe("clearDeckstatsHandler", () => {
  const aliceDeckId = "507f1f77bcf86cd799439001";
  const bobDeckId = "507f1f77bcf86cd799439002";

  it("only allow clearing deck stats for your decks", async () => {
    // deck not found for this user (alice targets bob's deck)
    const mockDb = makeMockDb(async () => null);

    const request: RequestLike = {
      system: { db: mockDb },
      user: { username: "alice" },
      "path-params": { id: bobDeckId },
    };

    const result = await clearDeckstatsHandler(request);
    expect(result.status).toBe(401);
  });

  it("owner can clear stats for their own deck", async () => {
    // deck found for this user
    const mockDb = makeMockDb(
      async () => ({ _id: aliceDeckId, username: "alice" }),
      async () => ({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }),
    );

    const request: RequestLike = {
      system: { db: mockDb },
      user: { username: "alice" },
      "path-params": { id: aliceDeckId },
    };

    const result = await clearDeckstatsHandler(request);
    expect(result.status).toBe(200);
  });
});

// ---- fetchLog ownership tests (mirrors fetch-log-ownership-test) ----

describe("fetchLog", () => {
  const gameWithAliceAndBob = {
    corp: { player: { username: "alice" } },
    runner: { player: { username: "bob" } },
    log: [{ text: "some log entry" }],
  };

  it("non-player cannot fetch a game log", async () => {
    const mockDb = makeMockDb(async () => gameWithAliceAndBob);

    const request: RequestLike = {
      system: { db: mockDb },
      user: { username: "eve", _id: "eve-id" },
      "path-params": { gameid: "some-game-id" },
    };

    const result = await fetchLog(request);
    expect(result.status).toBe(401);
  });

  it("corp player can fetch their game log", async () => {
    const mockDb = makeMockDb(async () => gameWithAliceAndBob);

    const request: RequestLike = {
      system: { db: mockDb },
      user: { username: "alice", _id: "alice-id" },
      "path-params": { gameid: "some-game-id" },
    };

    const result = await fetchLog(request);
    expect(result.status).toBe(200);
  });

  it("runner player can fetch their game log", async () => {
    const mockDb = makeMockDb(async () => gameWithAliceAndBob);

    const request: RequestLike = {
      system: { db: mockDb },
      user: { username: "bob", _id: "bob-id" },
      "path-params": { gameid: "some-game-id" },
    };

    const result = await fetchLog(request);
    expect(result.status).toBe(200);
  });
});

// ---- fetchLog new format tests (mirrors fetch-log-new-format-test) ----

describe("fetchLog new format", () => {
  const publicMsg = { user: "__system__", text: "public message" };
  const corpMsg = { user: "__system__", text: "corp only" };
  const runnerMsg = { user: "__system__", text: "runner only" };

  const gameWithNewFormatLog = {
    corp: { player: { username: "alice" } },
    runner: { player: { username: "bob" } },
    log: [
      { public: publicMsg },
      { corp: corpMsg },
      { runner: runnerMsg },
    ],
  };

  it("corp player receives public and corp-only messages, not runner-only", async () => {
    const mockDb = makeMockDb(async () => gameWithNewFormatLog);

    const request: RequestLike = {
      system: { db: mockDb },
      user: { username: "alice" },
      "path-params": { gameid: "g1" },
    };

    const result = await fetchLog(request);
    const log = result.body;
    expect(result.status).toBe(200);
    expect(log).toHaveLength(2);
    expect(log.some((m: any) => m.text === "public message")).toBe(true);
    expect(log.some((m: any) => m.text === "corp only")).toBe(true);
    expect(log.some((m: any) => m.text === "runner only")).toBe(false);
  });

  it("runner player receives public and runner-only messages, not corp-only", async () => {
    const mockDb = makeMockDb(async () => gameWithNewFormatLog);

    const request: RequestLike = {
      system: { db: mockDb },
      user: { username: "bob" },
      "path-params": { gameid: "g1" },
    };

    const result = await fetchLog(request);
    const log = result.body;
    expect(result.status).toBe(200);
    expect(log).toHaveLength(2);
    expect(log.some((m: any) => m.text === "public message")).toBe(true);
    expect(log.some((m: any) => m.text === "runner only")).toBe(true);
    expect(log.some((m: any) => m.text === "corp only")).toBe(false);
  });
});

// ---- fetchLog old format tests (mirrors fetch-log-old-format-test) ----

describe("fetchLog old format", () => {
  const gameWithOldFormatLog = {
    corp: { player: { username: "alice" } },
    runner: { player: { username: "bob" } },
    log: [
      { user: "__system__", text: "Game started" },
      { user: { username: "alice", emailhash: "abc" }, text: "Hello" },
    ],
  };

  it("old-format logs are returned unchanged for corp player", async () => {
    const mockDb = makeMockDb(async () => gameWithOldFormatLog);

    const request: RequestLike = {
      system: { db: mockDb },
      user: { username: "alice" },
      "path-params": { gameid: "g2" },
    };

    const result = await fetchLog(request);
    const log = result.body;
    expect(result.status).toBe(200);
    expect(log).toHaveLength(2);
    expect(log[0].text).toBe("Game started");
  });

  it("old-format logs are returned unchanged for runner player", async () => {
    const mockDb = makeMockDb(async () => gameWithOldFormatLog);

    const request: RequestLike = {
      system: { db: mockDb },
      user: { username: "bob" },
      "path-params": { gameid: "g2" },
    };

    const result = await fetchLog(request);
    const log = result.body;
    expect(result.status).toBe(200);
    expect(log).toHaveLength(2);
    expect(log[0].text).toBe("Game started");
  });
});

// ---- toObjectId tests ----

describe("toObjectId", () => {
  it("returns undefined for null/undefined input", () => {
    expect(toObjectId(undefined)).toBeUndefined();
    expect(toObjectId(null)).toBeUndefined();
  });

  it("returns ObjectId from a valid string", () => {
    const id = "507f1f77bcf86cd799439011";
    const result = toObjectId(id);
    expect(result).toBeDefined();
    expect(result?.toString()).toBe(id);
  });
});
