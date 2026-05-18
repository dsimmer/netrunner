import { describe, it, expect, beforeEach } from "vitest";
import { newGame } from "../test_framework/index";
import type { GameState } from "@/game/core/types";
import type { Card } from "@/game/core/card";
import { canScore } from "@/game/core/flags";
import { registerCard } from "@/game/core/types";

// ---------------------------------------------------------------------------
// cardFlag tests
// ---------------------------------------------------------------------------

describe("cardFlag", () => {
  it("returns false when flag key is not present", () => {
    const card: Card = { title: "Test Card" };
    registerCard("Test Card", {});
    const { cardFlag } = require("@/game/core/flags");
    expect(cardFlag(card, "some-flag")).toBe(false);
  });

  it("returns true when flag key is present with truthy value", () => {
    const card: Card = { title: "Test Card" };
    registerCard("Test Card", { flags: { "test-flag": true } });
    const { cardFlag } = require("@/game/core/flags");
    expect(cardFlag(card, "test-flag")).toBe(true);
  });

  it("returns true when value matches", () => {
    const card: Card = { title: "Test Card" };
    registerCard("Test Card", { flags: { "test-flag": "some-value" } });
    const { cardFlag } = require("@/game/core/flags");
    expect(cardFlag(card, "test-flag", "some-value")).toBe(true);
  });

  it("returns false when value does not match", () => {
    const card: Card = { title: "Test Card" };
    registerCard("Test Card", { flags: { "test-flag": "some-value" } });
    const { cardFlag } = require("@/game/core/flags");
    expect(cardFlag(card, "test-flag", "different-value")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cardFlagFn tests
// ---------------------------------------------------------------------------

describe("cardFlagFn", () => {
  let state: GameState;

  beforeEach(() => {
    state = newGame();
  });

  it("returns true when flag function returns truthy", () => {
    const { cardFlagFn } = require("@/game/core/flags");
    const card: Card = { title: "Test Card" };
    registerCard("Test Card", {
      flags: {
        "test-flag": () => true,
      },
    });
    expect(cardFlagFn(state, "corp", card, "test-flag")).toBe(true);
  });

  it("returns false when flag function returns falsy", () => {
    const { cardFlagFn } = require("@/game/core/flags");
    const card: Card = { title: "Test Card" };
    registerCard("Test Card", {
      flags: {
        "test-flag": () => false,
      },
    });
    expect(cardFlagFn(state, "corp", card, "test-flag")).toBe(false);
  });

  it("returns false when flag key is not present", () => {
    const { cardFlagFn } = require("@/game/core/flags");
    const card: Card = { title: "Test Card" };
    registerCard("Test Card", {});
    expect(cardFlagFn(state, "corp", card, "nonexistent")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// anyFlagFn tests
// ---------------------------------------------------------------------------

describe("anyFlagFn", () => {
  let state: GameState;
  let cardA: Card;
  let cardB: Card;

  beforeEach(() => {
    state = newGame();
    state.corp.playArea = [
      { cid: "card-a", title: "Card A", code: "card-a" },
      { cid: "card-b", title: "Card B", code: "card-b" },
    ];
    cardA = state.corp.playArea[0];
    cardB = state.corp.playArea[1];
    registerCard("Card A", {});
    registerCard("Card B", {});
  });

  it("returns true when any card's flag function matches the value", () => {
    const { anyFlagFn } = require("@/game/core/flags");
    registerCard("Card A", {
      flags: {
        "test-flag": () => true,
      },
    });
    expect(anyFlagFn(state, "corp", "test-flag", true)).toBe(true);
  });

  it("returns false when no card's flag function matches the value", () => {
    const { anyFlagFn } = require("@/game/core/flags");
    registerCard("Card A", {
      flags: {
        "test-flag": () => false,
      },
    });
    registerCard("Card B", {
      flags: {
        "test-flag": () => false,
      },
    });
    expect(anyFlagFn(state, "corp", "test-flag", true)).toBe(false);
  });

  it("returns true when at least one card matches among multiple", () => {
    const { anyFlagFn } = require("@/game/core/flags");
    registerCard("Card A", {
      flags: {
        "test-flag": () => false,
      },
    });
    registerCard("Card B", {
      flags: {
        "test-flag": () => true,
      },
    });
    expect(anyFlagFn(state, "corp", "test-flag", true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canScore tests (mirrors can-score?-test in flags_test.clj)
// ---------------------------------------------------------------------------

describe("canScore", () => {
  let state: GameState;
  let testCard: Card;
  let testCardWithCounters: Card;

  beforeEach(() => {
    state = newGame();
    state.activePlayer = "corp";
    // Register an empty card def so cardDef doesn't throw
    registerCard("Test Card", {});
    testCard = { title: "Test Card", type: "Agenda", advancementCost: 2 };
    testCardWithCounters = { ...testCard, advancement: 2 };
  });

  it("must be an agenda", () => {
    // Passing an empty object (not an agenda) should return false
    expect(canScore(state, "corp", {} as Card)).toBe(false);
  });

  it("advancement requirement skipped with noReq", () => {
    // With noReq: true, advancement counters are not checked
    expect(canScore(state, "corp", testCard, { noReq: true })).toBe(true);
  });

  it("advancement requirement must be met", () => {
    // Card with advancement cost 2 and 0 counters should fail
    expect(canScore(state, "corp", testCard)).toBe(false);
    // Card with advancement cost 2 and 2 counters should pass
    expect(canScore(state, "corp", testCardWithCounters)).toBe(true);
  });

  it("can-score card-flag-fn receives state and card context", () => {
    // Register a card def with a can-score flag function that checks card title
    registerCard("Test Card", {
      flags: {
        "can-score": (_state, _side, _eid, card) => {
          return card?.title === "Different Card";
        },
      },
    });
    // Card has counters but flag function returns false because title doesn't match
    expect(canScore(state, "corp", testCardWithCounters)).toBe(false);
    // Change title so flag function returns true
    const differentCard = { ...testCardWithCounters, title: "Different Card" };
    expect(canScore(state, "corp", differentCard)).toBe(true);
    // Clean up
    registerCard("Test Card", {});
  });
});
