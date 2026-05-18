// Tests for game.core.memory
// Mirrors: test/clj/game/core/memory_test.clj

import { describe, it, expect, is } from "vitest";
import * as core from "@/game/core";
import * as memory from "@/game/core/memory";
import { doGame, newGame } from "../test_framework";
import type { Card } from "@/game/core/card";

// ---------------------------------------------------------------------------
// muPlus
// ---------------------------------------------------------------------------

describe("muPlus", () => {
  it("1 arity: number value", () => {
    // mu+ with just a value uses (constantly true) as the req
    const value = Math.floor(Math.random() * 10);
    const result = memory.muPlus(value);
    expect(result.type).toBe("available-mu");
    expect(result.req).toBeDefined();
    // req is (constantly true), so it should return true
    expect(result.req!({} as any, "", null as any, null, [])).toBe(true);
    expect(result.value).toBeDefined();
    const resolved = result.value!({}, "runner", null as any, null, []);
    expect(resolved).toEqual(["regular", value]);
  });

  it("1 arity: vector value", () => {
    const value = Math.floor(Math.random() * 10);
    const result = memory.muPlus(["regular", value]);
    expect(result.type).toBe("available-mu");
    expect(result.req).toBeDefined();
    expect(result.req!({} as any, "", null as any, null, [])).toBe(true);
    const resolved = result.value!({}, "runner", null as any, null, []);
    expect(resolved).toEqual(["regular", value]);
  });

  it("2 arity: number value", () => {
    const req = () => true;
    const value = Math.floor(Math.random() * 10);
    const result = memory.muPlus(req, value);
    expect(result.type).toBe("available-mu");
    expect(result.req).toBe(req);
    const resolved = result.value!({}, "runner", null as any, null, []);
    expect(resolved).toEqual(["regular", value]);
  });

  it("2 arity: vector value", () => {
    const req = () => true;
    const value = Math.floor(Math.random() * 10);
    const result = memory.muPlus(req, ["regular", value]);
    expect(result.type).toBe("available-mu");
    expect(result.req).toBe(req);
    const resolved = result.value!({}, "runner", null as any, null, []);
    expect(resolved).toEqual(["regular", value]);
  });
});

// ---------------------------------------------------------------------------
// virusMuPlus
// ---------------------------------------------------------------------------

describe("virusMuPlus", () => {
  it("1 arity", () => {
    const value = Math.floor(Math.random() * 10);
    const result = memory.virusMuPlus(value);
    expect(result.type).toBe("available-mu");
    const resolved = result.value!({}, "runner", null as any, null, []);
    expect(resolved).toEqual(["virus", value]);
  });

  it("2 arity", () => {
    const req = () => true;
    const value = Math.floor(Math.random() * 10);
    const result = memory.virusMuPlus(req, value);
    expect(result.type).toBe("available-mu");
    expect(result.req).toBe(req);
    const resolved = result.value!({}, "runner", null as any, null, []);
    expect(resolved).toEqual(["virus", value]);
  });
});

// ---------------------------------------------------------------------------
// caissaMuPlus
// ---------------------------------------------------------------------------

describe("caissaMuPlus", () => {
  it("1 arity", () => {
    const value = Math.floor(Math.random() * 10);
    const result = memory.caissaMuPlus(value);
    expect(result.type).toBe("available-mu");
    const resolved = result.value!({}, "runner", null as any, null, []);
    expect(resolved).toEqual(["caissa", value]);
  });

  it("2 arity", () => {
    const req = () => true;
    const value = Math.floor(Math.random() * 10);
    const result = memory.caissaMuPlus(req, value);
    expect(result.type).toBe("available-mu");
    expect(result.req).toBe(req);
    const resolved = result.value!({}, "runner", null as any, null, []);
    expect(resolved).toEqual(["caissa", value]);
  });
});

// ---------------------------------------------------------------------------
// availableMu
// ---------------------------------------------------------------------------

describe("availableMu", () => {
  it("defaults used to 0", () => {
    const state = { runner: { memory: { available: 0 } } } as any;
    expect(memory.availableMu(state)).toBe(0);
  });

  it("defaults available to 0", () => {
    const state = { runner: { memory: { used: 0 } } } as any;
    expect(memory.availableMu(state)).toBe(0);
  });

  it("handles nils", () => {
    const state = { runner: { memory: { available: null, used: null } } } as any;
    expect(memory.availableMu(state)).toBe(0);
  });

  it("base value is available", () => {
    const state = { runner: { memory: { available: 1, used: 0 } } } as any;
    expect(memory.availableMu(state)).toBe(1);
  });

  it("subtracts used from available", () => {
    const state = { runner: { memory: { available: 0, used: 1 } } } as any;
    expect(memory.availableMu(state)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// buildNewMu - basic tests
// ---------------------------------------------------------------------------

describe("buildNewMu - init", () => {
  it("starting values should be 4 available, 0 used", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Corroder", "Sure Gamble"] } });
      const mu = memory.buildNewMu(state);
      expect(mu).toEqual({
        onlyFor: {
          caissa: { available: 0, used: 0 },
          virus: { available: 0, used: 0 },
        },
        available: 4,
        used: 0,
      });
    });
  });
});

describe("buildNewMu - using mu", () => {
  it("should increase used", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Corroder", "Sure Gamble"] } });
      const corroder = core.findCard("Corroder", state.runner.hand);
      core.registerLingeringEffect(
        state,
        "runner",
        corroder!,
        "used-mu",
        "while-active",
        null,
        () => 1,
      );
      const mu = memory.buildNewMu(state);
      expect(mu).toEqual({
        onlyFor: {
          caissa: { available: 0, used: 0 },
          virus: { available: 0, used: 0 },
        },
        available: 4,
        used: 1,
      });
    });
  });
});

describe("buildNewMu - greater than available", () => {
  it("should increase used", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Corroder", "Sure Gamble"] } });
      const corroder = core.findCard("Corroder", state.runner.hand);
      core.registerLingeringEffect(
        state,
        "runner",
        corroder!,
        "used-mu",
        "while-active",
        null,
        () => 5,
      );
      const mu = memory.buildNewMu(state);
      expect(mu).toEqual({
        onlyFor: {
          caissa: { available: 0, used: 0 },
          virus: { available: 0, used: 0 },
        },
        available: 4,
        used: 5,
      });
    });
  });
});

describe("buildNewMu - increasing available mu", () => {
  it("should increase available", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Corroder", "Sure Gamble"] } });
      const sureGamble = core.findCard("Sure Gamble", state.runner.hand);
      core.registerLingeringEffect(
        state,
        "runner",
        sureGamble!,
        "available-mu",
        "while-active",
        null,
        () => ["regular", 2],
      );
      const mu = memory.buildNewMu(state);
      expect(mu).toEqual({
        onlyFor: {
          caissa: { available: 0, used: 0 },
          virus: { available: 0, used: 0 },
        },
        available: 6,
        used: 0,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// buildNewMu - virus mu tests
// ---------------------------------------------------------------------------

describe("buildNewMu - virus increasing available virus mu", () => {
  it("should increase virus available, not regular available", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Cache", "Sure Gamble"] } });
      const sureGamble = core.findCard("Sure Gamble", state.runner.hand);
      core.registerLingeringEffect(
        state,
        "runner",
        sureGamble!,
        "available-mu",
        "while-active",
        null,
        () => ["virus", 2],
      );
      const mu = memory.buildNewMu(state);
      expect(mu).toEqual({
        onlyFor: {
          caissa: { available: 0, used: 0 },
          virus: { available: 2, used: 0 },
        },
        available: 4,
        used: 0,
      });
    });
  });
});

describe("buildNewMu - virus increasing available non-virus mu", () => {
  it("should increase both virus and regular available", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Cache", "Sure Gamble"] } });
      const sureGamble = core.findCard("Sure Gamble", state.runner.hand);
      core.registerLingeringEffect(
        state,
        "runner",
        sureGamble!,
        "available-mu",
        "while-active",
        null,
        () => ["regular", 2],
      );
      core.registerLingeringEffect(
        state,
        "runner",
        sureGamble!,
        "available-mu",
        "while-active",
        null,
        () => ["virus", 2],
      );
      const mu = memory.buildNewMu(state);
      expect(mu).toEqual({
        onlyFor: {
          caissa: { available: 0, used: 0 },
          virus: { available: 2, used: 0 },
        },
        available: 6,
        used: 0,
      });
    });
  });
});

describe("buildNewMu - virus no available virus mu", () => {
  it("should increase used", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Cache", "Sure Gamble"] } });
      const cache = core.findCard("Cache", state.runner.hand);
      core.registerLingeringEffect(
        state,
        "runner",
        cache!,
        "used-mu",
        "while-active",
        null,
        () => 2,
      );
      const mu = memory.buildNewMu(state);
      expect(mu).toEqual({
        onlyFor: {
          caissa: { available: 0, used: 0 },
          virus: { available: 0, used: 2 },
        },
        available: 4,
        used: 2,
      });
    });
  });
});

describe("buildNewMu - virus using virus mu", () => {
  it("should increase used-virus", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Cache", "Sure Gamble"] } });
      const sureGamble = core.findCard("Sure Gamble", state.runner.hand);
      core.registerLingeringEffect(
        state,
        "runner",
        sureGamble!,
        "available-mu",
        "while-active",
        null,
        () => ["virus", 2],
      );
      const cache = core.findCard("Cache", state.runner.hand);
      core.registerLingeringEffect(
        state,
        "runner",
        cache!,
        "used-mu",
        "while-active",
        null,
        () => 2,
      );
      const mu = memory.buildNewMu(state);
      expect(mu).toEqual({
        onlyFor: {
          caissa: { available: 0, used: 0 },
          virus: { available: 2, used: 2 },
        },
        available: 4,
        used: 0,
      });
    });
  });
});

describe("buildNewMu - virus using more than available", () => {
  it("should increase used-virus and overflow to regular", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Cache", "Sure Gamble"] } });
      const sureGamble = core.findCard("Sure Gamble", state.runner.hand);
      core.registerLingeringEffect(
        state,
        "runner",
        sureGamble!,
        "available-mu",
        "while-active",
        null,
        () => ["virus", 2],
      );
      const cache = core.findCard("Cache", state.runner.hand);
      core.registerLingeringEffect(
        state,
        "runner",
        cache!,
        "used-mu",
        "while-active",
        null,
        () => 3,
      );
      const mu = memory.buildNewMu(state);
      expect(mu).toEqual({
        onlyFor: {
          caissa: { available: 0, used: 0 },
          virus: { available: 2, used: 3 },
        },
        available: 4,
        used: 1,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// updateMu
// ---------------------------------------------------------------------------

describe("updateMu", () => {
  it("returns false when no change occurs", () => {
    doGame((state) => {
      newGame(state);
      expect(memory.updateMu(state)).toBe(false);
    });
  });

  it("returns true when a change has occurred (used-mu)", () => {
    doGame((state) => {
      newGame(state);
      core.registerLingeringEffect(
        state,
        "runner",
        null as unknown as Card,
        "used-mu",
        "while-active",
        null,
        () => 1,
      );
      expect(memory.updateMu(state)).toBe(true);
    });
  });

  it("returns true when a change has occurred (virus-mu+)", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Sure Gamble"] } });
      const sureGamble = core.findCard("Sure Gamble", state.runner.hand);
      core.registerLingeringEffect(
        state,
        "runner",
        sureGamble!,
        "available-mu",
        "while-active",
        null,
        () => ["virus", 2],
      );
      expect(memory.updateMu(state)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// sufficientMu
// ---------------------------------------------------------------------------

describe("sufficientMu", () => {
  it("insufficient MU to install", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          hand: ["Hedge Fund"],
          deck: ["Hedge Fund"],
        },
        runner: {
          hand: ["Endless Hunger", "Corroder", "Akamatsu Mem Chip"],
        },
      });
      // Take credits for corp to advance to runner's turn
      const clicks = state.corp.click;
      for (let i = 0; i < clicks; i++) {
        core.processAction("credit", state, "corp", null);
      }
      if (state.corp.click === 0) {
        core.processAction("end-turn", state, "corp", null);
        core.processAction("start-turn", state, "runner", null);
      }

      // Play Endless Hunger to reduce MU
      const hunger = core.findCard("Endless Hunger", state.runner.hand);
      if (hunger) {
        core.processAction("play", state, "runner", { card: hunger });
      }

      const corroder = core.findCard("Corroder", state.runner.hand);
      if (corroder) {
        const result = memory.sufficientMu(state, corroder);
        expect(result).toBe(false);
      }

      // Play Akamatsu Mem Chip to increase MU
      const memChip = core.findCard("Akamatsu Mem Chip", state.runner.hand);
      if (memChip) {
        core.processAction("play", state, "runner", { card: memChip });
      }

      const corroder2 = core.findCard("Corroder", state.runner.hand);
      if (corroder2) {
        const result = memory.sufficientMu(state, corroder2);
        expect(result).toBe(true);
      }
    });
  });
});
