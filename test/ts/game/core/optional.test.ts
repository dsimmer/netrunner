import { describe, it, expect } from "vitest";
import { resolveAbility } from "@/game/core/engine_1";
import { makeCard } from "@/game/core/initializing";
import { newGame, doGame } from "../test_framework/index";
import "@/game/core/optional"; // ensure :optional ability type is registered

describe("optional", () => {
  it("only the inner req of :optional should be checked, not the outer req", () => {
    doGame((state) => {
      newGame(state);
      const spy: string[] = [];

      const testCard = makeCard({ title: "test" });

      // Resolve ability with an outer :req and an :optional with its own :req
      // The outer :req should NOT be evaluated; only the :optional's :req should be
      resolveAbility(
        state,
        "corp",
        {
          req: () => {
            spy.push("outer");
            return true;
          },
          optional: {
            req: () => {
              spy.push("inner");
              return true;
            },
            prompt: "Yes or no",
            yesAbility: {
              effect: () => true,
            },
          },
        } as any,
        testCard,
        null,
      );

      expect(spy).toEqual(["inner"]);
    });
  });
});
