import { describe, it, expect } from "vitest";
import { decksBulkDeleteHandler } from "@/web/decks";

describe("Bulk delete handler validation and responses", () => {
  it("unauthorized request without username", async () => {
    const request = {
      db: null,
      user: {},
      body: { deck_ids: ["deck1", "deck2"] },
    };
    const response = await decksBulkDeleteHandler(
      request.db as any,
      request.user,
      request.body,
    );
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Unauthorized or invalid request");
  });

  it("invalid request without deck-ids", async () => {
    const request = {
      db: null,
      user: { username: "testuser" },
      body: {},
    };
    const response = await decksBulkDeleteHandler(
      request.db as any,
      request.user,
      request.body,
    );
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Unauthorized or invalid request");
  });

  it("invalid request with non-sequential deck-ids", async () => {
    const request = {
      db: null,
      user: { username: "testuser" },
      body: { deck_ids: "not-an-array" },
    };
    const response = await decksBulkDeleteHandler(
      request.db as any,
      request.user,
      request.body,
    );
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Unauthorized or invalid request");
  });

  it("empty deck-ids array", async () => {
    const request = {
      db: null,
      user: { username: "testuser" },
      body: { deck_ids: [] },
    };
    const response = await decksBulkDeleteHandler(
      request.db as any,
      request.user,
      request.body,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
