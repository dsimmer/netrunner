// Tests for game.core.installing
// Mirrors: test/clj/game/core/installing_test.clj
import { describe, it, expect } from "vitest";
import {
  doGame,
  newGame,
  qty,
  takeCredits,
  playFromHand,
  clickCard,
  getProgram,
  findCard,
  getRunner,
  getPromptMap,
} from "../test_framework";

describe("runner-install-trash-existing-programs", () => {
  it("Trash existing programs when insufficient MU", () => {
    doGame((state) => {
      newGame(state, {
        corp: { hand: ["Hedge Fund"], deck: qty("Hedge Fund", 100) },
        runner: { hand: ["Endless Hunger", "Corroder"] },
      });
      takeCredits(state, "corp");
      console.log("Runner hand before play:", (state.runner?.hand ?? []).map((c: any) => c?.title));
      console.log("Runner credits:", state.runner?.credit);
      console.log("Runner link:", state.runner?.link);
      const hungerCard = findCard(state, "Endless Hunger");
      console.log("Found Endless Hunger:", hungerCard?.title, hungerCard?.cid);
      const hungerResult = playFromHand(state, "runner", "Endless Hunger");
      console.log("Play Endless Hunger result:", hungerResult);
      console.log("Runner prompt after Endless Hunger:", JSON.stringify(getPromptMap(state, "runner"), null, 2));
      console.log("Corp prompt after Endless Hunger:", JSON.stringify(getPromptMap(state, "corp"), null, 2));
      console.log("Runner rig after Endless Hunger:", JSON.stringify(state.runner?.rig, null, 2));
      console.log("Runner basic action card:", state.runner?.basicActionCard?.title);
      const corroderResult = playFromHand(state, "runner", "Corroder");
      console.log("Play Corroder result:", corroderResult);
      console.log("Runner rig after Corroder:", JSON.stringify(state.runner?.rig, null, 2));
      console.log("Runner credits after plays:", state.runner?.credit);
      console.log("Runner discard:", (state.runner?.discard ?? []).map((c: any) => c?.title));
      console.log("Runner hand after plays:", (state.runner?.hand ?? []).map((c: any) => c?.title));
      const prompt = getPromptMap(state, "runner");
      console.log("Prompt:", JSON.stringify(prompt, null, 2));
      expect(prompt?.msg).toBe(
        "Insufficient MU to install Corroder. Trash installed programs?",
      );
      clickCard(state, "runner", "Endless Hunger");
      expect(getProgram(state, 0)?.title).toBe("Corroder");
      expect(
        findCard("Endless Hunger", getRunner(state).discard),
      ).toBeDefined();
    });
  });
});
