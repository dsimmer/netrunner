import { describe, it, expect } from "vitest";
import type { Effect } from "@/game/core/state";
import type { Card } from "@/game/core/card";
import {
  getEffectMaps,
  getEffects,
  sumEffects,
} from "../../../../src/ts/game/core/effects";

// Minimal state type for low-level effect testing
type TestState = {
  activePlayer: string;
  effects: Effect[];
  disabledCardReg: Map<string, any>;
  reqCalled?: number;
};

function makeState(overrides: Partial<TestState> = {}): TestState {
  return {
    activePlayer: "corp",
    effects: [],
    disabledCardReg: new Map(),
    reqCalled: 0,
    ...overrides,
  };
}

function makeCard(cid: number, side: string, title: string): Card {
  // isCorp checks for "Corp", isRunner checks for "Runner" (capitalized)
  const normalizedSide = side.toLowerCase() === "corp" ? "Corp" : "Runner";
  return { cid, side: normalizedSide, title } as Card;
}

function makeEffect(
  type: string,
  card: Card,
  value: () => unknown,
  req?: () => boolean,
): Effect {
  return {
    uuid: crypto.randomUUID(),
    type,
    card,
    value: value as any,
    req: req ? ((() => req()) as any) : undefined,
    duration: "while-active",
    lingering: true,
  };
}

describe("Effects", () => {
  const corpCard = makeCard(1, "corp", "Test Card 1");
  const runnerCard = makeCard(2, "runner", "Test Card 2");
  const targetCard = makeCard(10, "corp", "Target Card");

  describe("gatherEffects via getEffectMaps", () => {
    it("filters by effect type", () => {
      const state = makeState();
      state.effects.push(makeEffect("test-type", corpCard, () => 1));
      state.effects.push(makeEffect("test-type-2", corpCard, () => 2));
      state.effects.push(makeEffect("test-type", corpCard, () => 1));
      state.effects.push(makeEffect("test-type-2", corpCard, () => 2));

      const effects = getEffectMaps(state, "corp", "test-type", 0, []);
      expect(effects).toHaveLength(2);
    });

    it("sorts effects with active player first", () => {
      const state = makeState();
      expect(state.activePlayer).toBe("corp");

      state.effects.push(makeEffect("test-type", corpCard, () => 1));
      state.effects.push(makeEffect("test-type", runnerCard, () => 1));
      state.effects.push(makeEffect("test-type", corpCard, () => 1));
      state.effects.push(makeEffect("test-type", runnerCard, () => 1));

      const effects = getEffectMaps(state, "corp", "test-type", 0, []);
      const sides = effects.map((e: any) => e.card.side);
      // Active player (corp) effects come first
      expect(sides).toEqual(["Corp", "Corp", "Runner", "Runner"]);
    });
  });

  describe("getEffects", () => {
    const c1 = makeCard(1, "corp", "Test Card 1");
    const c2 = makeCard(2, "corp", "Test Card 2");

    it("returns value from constant function", () => {
      const state = makeState();
      state.effects.push(makeEffect("test-type", c1, () => 1));
      const effects = getEffects(state, "corp", "test-type", c2, []);
      expect(effects).toEqual([1]);
    });

    it("returns value from dynamic function", () => {
      const state = makeState();
      state.effects.push(makeEffect("test-type", c1, () => 42));
      const effects = getEffects(state, "corp", "test-type", c2, []);
      expect(effects).toEqual([42]);
    });

    describe("req filtering", () => {
      it("calls the req function when querying effects", () => {
        const state = makeState();
        let reqCalled = 0;
        state.effects.push(
          makeEffect("test-type", c1, () => 1, () => {
            reqCalled++;
            return true;
          }),
        );

        expect(reqCalled).toBe(0);
        getEffects(state, "corp", "test-type", c2, []);
        expect(reqCalled).toBe(1);
        getEffects(state, "corp", "test-type", c2, []);
        expect(reqCalled).toBe(2);
      });

      it("includes the effect when req returns truthy", () => {
        const state = makeState();
        state.effects.push(makeEffect("test-type", c1, () => 1, () => true));
        const effects = getEffects(state, "corp", "test-type", c2, []);
        expect(effects).toEqual([1]);
      });

      it("excludes the effect when req returns falsey", () => {
        const state = makeState();
        state.effects.push(makeEffect("test-type", c1, () => 1, () => false));
        const effects = getEffects(state, "corp", "test-type", c2, []);
        expect(effects).toEqual([]);
      });
    });
  });

  describe("sumEffects", () => {
    it("handles non-numbers (nils/nulls)", () => {
      const state = makeState();
      state.effects.push(makeEffect("test-type", corpCard, () => 1));
      state.effects.push(makeEffect("test-type", corpCard, () => 2));
      state.effects.push(makeEffect("test-type", corpCard, () => null));
      state.effects.push(makeEffect("test-type", corpCard, () => 3));
      state.effects.push(makeEffect("test-type", corpCard, () => 4));

      const sum = sumEffects(state, "corp", "test-type", corpCard, []);
      // 1 + 2 + 3 + 4 = 10 (null is skipped)
      expect(sum).toBe(10);
    });
  });
});
