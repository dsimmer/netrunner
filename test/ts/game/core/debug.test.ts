import { describe, it, expect } from "vitest";
import {
  doGame,
  newGame,
  getCorp,
  getRunner,
} from "../test_framework";

describe("debug", () => {
  it("debug state after newGame with dontStartGame true", () => {
    doGame((state) => {
      const setup = {
        corp: { deck: ["Ice Wall", "Hedge Fund", "IPO"] },
        runner: { deck: ["Sure Gamble", "Corroder", "Desperado"] },
        dontStartGame: true,
      };
      newGame(state, setup);

      expect(state.corp.hand?.length).toBe(5); // should have 5 cards in hand
    });
  });

  it("debug state after newGame without dontStartGame", () => {
    doGame((state) => {
      const setup = {
        corp: { deck: ["Ice Wall", "Hedge Fund", "IPO"] },
        runner: { deck: ["Sure Gamble", "Corroder", "Desperado"] },
      };
      newGame(state, setup);

      expect(state.corp.hand?.length).toBe(5); // should have 5 cards in hand
    });
  });
});
