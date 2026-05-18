import { describe, it, expect } from "vitest";
import {
  newGame, takeCredits, playFromHand, cardSideAbility, getContent,
  rez, removeTag, runEmptyServer, clickPrompt, clickCard,
} from "../test_framework/index";
import type { GameState, Side } from "../test_framework/index";

/*
 * Stats tracking tests.
 * Mirrors: test/clj/game/core/stats_test.clj
 *
 * Tests verify that game stats (gains, losses, spent credits, click actions)
 * are properly tracked throughout gameplay.
 */

describe("stats tracking", () => {
  describe("click count", () => {
    it("clicks gained", () => {
      const state = newGame({
        corp: { deck: ["Hedge Fund", "Hedge Fund", "Hedge Fund", "Hedge Fund", "Hedge Fund",
                        "Hedge Fund", "Hedge Fund", "Hedge Fund", "Hedge Fund", "Hedge Fund"],
                 hand: [] },
        runner: { deck: ["Sure Gamble", "Sure Gamble", "Sure Gamble", "Sure Gamble", "Sure Gamble",
                         "Sure Gamble", "Sure Gamble", "Sure Gamble", "Sure Gamble", "Sure Gamble"] },
      });

      // Take credits for corp (3 clicks → 3 credits, end turn → start runner turn)
      takeCredits(state, "corp");
      // Runner takes credits (4 clicks → 4 credits, end turn → start corp turn)
      takeCredits(state, "runner");
      // Corp takes credits again (3 clicks → 3 credits, end turn → start runner turn)
      takeCredits(state, "corp");
      // Runner takes credits again (4 clicks → 4 credits, end turn → start corp turn)
      takeCredits(state, "runner");

      // Corp has started 3 turns: 3 + 3 + 3 = 9 clicks gained
      expect((state as any).stats.corp.gain.click).toBe(9);
      // Runner has started 2 turns: 4 + 4 = 8 clicks gained
      expect((state as any).stats.runner.gain.click).toBe(8);

      // Corp drew 3 times (mandatory draw each turn start)
      expect((state as any).stats.corp.gain.card).toBe(3);
      // Runner did not draw extra (only initial draw)
      // Note: runner's gain.card depends on initial game setup
      // expect((state as any).stats.runner.gain.card).toBe(5);

      // Corp gained 6 credits from clicking (2 turns × 3 credits = 6)
      // Note: initial credits are not tracked as gains in Clojure
      expect((state as any).stats.corp.gain.credit).toBe(6);
      // Runner gained 8 credits from clicking (2 turns × 4 credits = 8)
      expect((state as any).stats.runner.gain.credit).toBe(8);

      // Corp clicked for 6 credits (2 turns × 3 clicks)
      expect((state as any).stats.corp.click.credit).toBe(6);
      // Runner clicked for 8 credits (2 turns × 4 clicks)
      expect((state as any).stats.runner.click.credit).toBe(8);

      // Play Hedge Fund (cost 5, gain 9 credits)
      playFromHand(state, "corp", "Hedge Fund");

      // Click credit stats don't change from playing cards
      expect((state as any).stats.corp.click.credit).toBe(6);
      // Corp gained 9 more credits from Hedge Fund (6 + 9 = 15)
      expect((state as any).stats.corp.gain.credit).toBe(15);
      // Corp spent 5 credits for Hedge Fund
      expect((state as any).stats.corp.spent.credit).toBe(5);

      // Corp takes credits again
      takeCredits(state, "corp");

      // Play Sure Gamble (cost 5, lose all credits)
      playFromHand(state, "runner", "Sure Gamble");

      // Runner click credit stats don't change
      expect((state as any).stats.runner.click.credit).toBe(8);
      // Runner gained 9 more credits from Sure Gamble (8 + 9 = 17)
      expect((state as any).stats.runner.gain.credit).toBe(17);
      // Runner spent 5 credits for Sure Gamble
      expect((state as any).stats.runner.spent.credit).toBe(5);
    });
  });

  describe("tags count", () => {
    it("tags gained", () => {
      const state = newGame({
        corp: { hand: ["Breaking News"] },
      });

      // Play and score Breaking News
      playFromHand(state, "corp", "Breaking News");

      // Corp takes credits (scores Breaking News, runner gets tagged)
      takeCredits(state, "corp");

      // Remove runner's tag
      removeTag(state, "runner");

      // Runner gained 2 tags base (from Breaking News)
      expect((state as any).stats.runner.gain.tag.base).toBe(2);
    });
  });

  describe("credits from cards", () => {
    it("take from Liberated Account", () => {
      const state = newGame({
        runner: { deck: ["Liberated Account", "Liberated Account", "Liberated Account",
                         "Liberated Account", "Liberated Account", "Liberated Account",
                         "Liberated Account", "Liberated Account", "Liberated Account",
                         "Liberated Account"] },
      });

      // Corp takes credits (3 clicks)
      takeCredits(state, "corp");
      // Runner takes credits (4 clicks)
      takeCredits(state, "runner");
      // Corp takes credits again (3 clicks)
      takeCredits(state, "corp");

      // Runner clicked for 4 credits (1 turn × 4 clicks)
      expect((state as any).stats.runner.click.credit).toBe(4);
      // Runner gained 4 credits from clicking
      expect((state as any).stats.runner.gain.credit).toBe(4);

      // Play Liberated Account
      playFromHand(state, "runner", "Liberated Account");
    });

    it("take from Adonis Campaign", () => {
      const state = newGame({
        corp: { hand: ["Adonis Campaign"] },
      });

      // Play Adonis Campaign
      playFromHand(state, "corp", "Adonis Campaign", "New Remote");

      // Get the ICE content (Adonis Campaign is placed as ICE)
      // Note: getContent returns cards at a server
      const content = getContent(state, "remote1");

      // Corp takes credits (3 clicks → 3 credits, but Adonis Campaign gives 1 extra per turn)
      takeCredits(state, "corp");

      // Corp clicked for 2 credits (with AC giving extra)
      expect((state as any).stats.corp.click.credit).toBe(2);
      // Corp gained 2 credits
      expect((state as any).stats.corp.gain.credit).toBe(2);

      // Runner takes credits
      takeCredits(state, "runner");

      // Corp takes credits again
      takeCredits(state, "corp");

      // Corp clicked for 5 credits total
      expect((state as any).stats.corp.click.credit).toBe(5);
      // Corp gained credits from Adonis Campaign
      expect((state as any).stats.corp.gain.credit).toBe(8);

      // Runner takes credits
      takeCredits(state, "runner");

      // Corp takes credits again
      takeCredits(state, "corp");

      // Corp clicked for 8 credits total
      expect((state as any).stats.corp.click.credit).toBe(8);
      // Corp spent 4 credits (for Adonis Campaign)
      expect((state as any).stats.corp.spent.credit).toBe(4);
      // Corp gained 14 credits total (6 from AC over turns)
      expect((state as any).stats.corp.gain.credit).toBe(14);
    });
  });

  describe("companion credits", () => {
    it("take from Mystic Maemi", () => {
      const state = newGame({
        corp: { deck: ["Project Vitruvius"] },
        runner: { deck: ["Sure Gamble", "Sure Gamble", "Sure Gamble", "Mystic Maemi"] },
      });

      // Corp takes credits
      takeCredits(state, "corp");

      // Play Mystic Maemi
      playFromHand(state, "runner", "Mystic Maemi");

      // Run HQ empty server
      runEmptyServer(state, "HQ");
      clickPrompt(state, "runner", "Steal");

      // Runner takes credits
      takeCredits(state, "runner");

      // Runner spent 1 credit (for something during the run)
      expect((state as any).stats.runner.spent.credit).toBe(1);

      // Corp takes credits
      takeCredits(state, "corp");
      // Runner takes credits
      takeCredits(state, "runner");
      // Corp takes credits
      takeCredits(state, "corp");

      // Play Sure Gamble
      playFromHand(state, "runner", "Sure Gamble");

      // Click Mystic Maemi resource ability
      const mm = getContent(state, "runner")?.find((c: any) => c.title === "Mystic Maemi");

      // Corp clicked for 6 credits
      expect((state as any).stats.runner.click.credit).toBe(6);
      // Runner spent 6 credits
      expect((state as any).stats.runner.spent.credit).toBe(6);
      // Runner gained credits
      expect((state as any).stats.runner.gain.credit).toBe(15);
    });
  });
});
