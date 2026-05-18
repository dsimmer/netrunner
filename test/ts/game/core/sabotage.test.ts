// Tests for game.core.sabotage
// Mirrors: test/clj/game/core/sabotage_test.clj
import { describe, it, expect } from "vitest";
import { resolveAbility } from "@/game/core/engine_1";
import {
  doGame,
  newGame,
  qty,
  clickCard,
  clickPrompt,
  noPrompt,
  waiting,
  getCorp,
  getRunner,
} from "../test_framework";
import { sabotageAbility } from "@/game/core/sabotage";

describe("sabotage", () => {
  it("Choosing only from HQ", () => {
    doGame((state) => {
      newGame(state, { corp: { deck: qty("Hedge Fund", 15) } });

      const runnerIdentity = getRunner(state).identity;
      resolveAbility(
        state,
        "runner",
        sabotageAbility(3),
        runnerIdentity,
        [],
      );

      expect(waiting(state, "runner")).toBe(true);
      expect(getCorp(state).discard).toEqual([]);

      const prevCardsInRd = (getCorp(state).deck ?? []).length;
      const prevCardsInHq = (getCorp(state).hand ?? []).length;

      clickCard(state, "corp", (getCorp(state).hand ?? [])[0]);
      clickCard(state, "corp", (getCorp(state).hand ?? [])[1]);
      clickCard(state, "corp", (getCorp(state).hand ?? [])[2]);

      expect((getCorp(state).deck ?? []).length).toBe(prevCardsInRd);
      expect((getCorp(state).hand ?? []).length).toBe(prevCardsInHq - 3);

      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect((getCorp(state).discard ?? []).length).toBe(3);
    });
  });

  it("Choosing only from R&D", () => {
    doGame((state) => {
      newGame(state, { corp: { deck: qty("Hedge Fund", 15) } });

      const runnerIdentity = getRunner(state).identity;
      resolveAbility(
        state,
        "runner",
        sabotageAbility(3),
        runnerIdentity,
        [],
      );

      expect(waiting(state, "runner")).toBe(true);
      expect(getCorp(state).discard).toEqual([]);

      const prevCardsInRd = (getCorp(state).deck ?? []).length;
      const prevCardsInHq = (getCorp(state).hand ?? []).length;

      clickPrompt(state, "corp", "Done");

      expect((getCorp(state).deck ?? []).length).toBe(prevCardsInRd - 3);
      expect((getCorp(state).hand ?? []).length).toBe(prevCardsInHq);

      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect((getCorp(state).discard ?? []).length).toBe(3);
    });
  });

  it("Choosing a mix from HQ and R&D", () => {
    doGame((state) => {
      newGame(state, { corp: { deck: qty("Hedge Fund", 15) } });

      const runnerIdentity = getRunner(state).identity;
      resolveAbility(
        state,
        "runner",
        sabotageAbility(3),
        runnerIdentity,
        [],
      );

      expect(waiting(state, "runner")).toBe(true);
      expect(getCorp(state).discard).toEqual([]);

      const prevCardsInRd = (getCorp(state).deck ?? []).length;
      const prevCardsInHq = (getCorp(state).hand ?? []).length;

      clickCard(state, "corp", (getCorp(state).hand ?? [])[0]);
      clickCard(state, "corp", (getCorp(state).hand ?? [])[1]);
      clickPrompt(state, "corp", "Done");

      expect((getCorp(state).deck ?? []).length).toBe(prevCardsInRd - 1);
      expect((getCorp(state).hand ?? []).length).toBe(prevCardsInHq - 2);

      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect((getCorp(state).discard ?? []).length).toBe(3);
    });
  });

  it("Forced to trash some cards from HQ", () => {
    doGame((state) => {
      newGame(state, { corp: { deck: qty("Hedge Fund", 7) } });

      const runnerIdentity = getRunner(state).identity;
      resolveAbility(
        state,
        "runner",
        sabotageAbility(3),
        runnerIdentity,
        [],
      );

      expect(waiting(state, "runner")).toBe(true);
      expect(getCorp(state).discard).toEqual([]);

      // Check the prompt message
      const corpPrompt = (state.corp as any)?.prompt?.[0];
      expect(corpPrompt?.msg).toBe(
        "Choose at least 2 cards and up to 3 cards to trash from HQ. Remainder will be trashed from top of R&D.",
      );

      // Check the "Done" choice is available
      const choices = corpPrompt?.choices ?? [];
      const doneChoice = choices.find((c: any) => c.value === "Done");
      expect(doneChoice).toBeDefined();

      // No toasts yet
      expect((state.corp as any)?.toast).toEqual([]);

      // Click Done with 0 selected — should get a toast asking for more
      clickPrompt(state, "corp", "Done");
      expect((state.corp as any)?.toast?.length).toBe(1);
      expect((corpPrompt ? (state.corp as any)?.prompt?.[0]?.promptType : undefined)).toBe("select");

      // Select 1 card — still need at least 2
      clickCard(state, "corp", (getCorp(state).hand ?? [])[0]);
      clickPrompt(state, "corp", "Done");
      expect((state.corp as any)?.toast?.length).toBe(2);
      expect((state.corp as any)?.prompt?.[0]?.promptType).toBe("select");

      // Select 2nd card — meets minimum
      clickCard(state, "corp", (getCorp(state).hand ?? [])[1]);
      clickPrompt(state, "corp", "Done");

      // No further toast added
      expect((state.corp as any)?.toast?.length).toBe(2);

      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
    });
  });

  it("Forced to trash entire HQ and R&D", () => {
    doGame((state) => {
      newGame(state, { corp: { deck: qty("Hedge Fund", 7) } });

      const runnerIdentity = getRunner(state).identity;
      resolveAbility(
        state,
        "runner",
        sabotageAbility(100),
        runnerIdentity,
        [],
      );

      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getCorp(state).hand).toEqual([]);
      expect(getCorp(state).deck).toEqual([]);
      expect((getCorp(state).discard ?? []).length).toBe(7);
    });
  });

  it("Forced to trash more cards than there are in HQ", () => {
    doGame((state) => {
      newGame(state, { corp: { deck: qty("Hedge Fund", 7) } });

      const runnerIdentity = getRunner(state).identity;
      resolveAbility(
        state,
        "runner",
        sabotageAbility(7),
        runnerIdentity,
        [],
      );

      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getCorp(state).hand).toEqual([]);
      expect(getCorp(state).deck).toEqual([]);
      expect((getCorp(state).discard ?? []).length).toBe(7);
    });
  });
});
