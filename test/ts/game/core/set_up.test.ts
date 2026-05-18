// Tests for game/core/set_up.ts
// Mirrors: test/clj/game/core/set_up_test.clj
import { describe, it, expect } from "vitest";
import {
  doGame,
  newGame,
  getCorp,
  getRunner,
  clickPrompt,
  lastLogContains,
} from "../test_framework";

describe("mulligan-responses", () => {
  const setup = {
    corp: {
      deck: [
        "Ice Wall",
        "Hedge Fund",
        "IPO",
        "NGO Front",
        "PAD Campaign",
        "Jackson Howard",
        "Enigma",
        "Merger",
        "SanSan City Grid",
      ],
    },
    runner: {
      deck: [
        "Sure Gamble",
        "Drug Dealer",
        "Corroder",
        "Nfr",
        "Kasi String",
        "Stimhack",
        "Desperado",
        "Jak Sinclair",
      ],
    },
    dontStartGame: true,
  };

  describe("keep", () => {
    it("corp keeps their hand", () => {
      doGame((state) => {
        newGame(state, setup);
        const corpHand = getCorp(state).hand;
        clickPrompt(state, "corp", "Keep");
        expect(getCorp(state).hand).toBe(corpHand);
        expect(lastLogContains(state, "Corp keeps their hand")).toBe(true);
      });
    });

    it("runner keeps their hand", () => {
      doGame((state) => {
        newGame(state, setup);
        clickPrompt(state, "corp", "Keep");
        const runnerHand = getRunner(state).hand;
        clickPrompt(state, "runner", "Keep");
        expect(getRunner(state).hand).toBe(runnerHand);
        expect(lastLogContains(state, "Runner keeps their hand")).toBe(true);
      });
    });
  });

  describe("mulligan", () => {
    it("corp takes a mulligan", () => {
      doGame((state) => {
        newGame(state, setup);
        const corpHandTitles = getCorp(state).hand.map((c: any) => c.title);
        clickPrompt(state, "corp", "Mulligan");
        const newCorpHandTitles = getCorp(state).hand.map((c: any) => c.title);
        expect(newCorpHandTitles).not.toEqual(corpHandTitles);
        expect(lastLogContains(state, "Corp takes a mulligan")).toBe(true);
      });
    });

    it("runner takes a mulligan", () => {
      doGame((state) => {
        newGame(state, setup);
        clickPrompt(state, "corp", "Keep");
        const runnerHandTitles = getRunner(state).hand.map((c: any) => c.title);
        clickPrompt(state, "runner", "Mulligan");
        const newRunnerHandTitles = getRunner(state).hand.map((c: any) => c.title);
        expect(newRunnerHandTitles).not.toEqual(runnerHandTitles);
        expect(lastLogContains(state, "Runner takes a mulligan")).toBe(true);
      });
    });
  });
});
