// Tests for game.core.subtypes
// Mirrors: test/clj/game/core/subtypes_test.clj

import { describe, it, expect, beforeEach } from "vitest";
import {
  subtypesForCard,
  updateSubtypesForCard,
  updateAllSubtypes,
} from "../../../../src/ts/game/core/subtypes";
import type { GameState } from "../../../../src/ts/game/core/state";
import type { Card } from "../../../../src/ts/game/core/card";
import {
  doGame,
  newGame,
  findCard as tfFindCard,
  refresh,
} from "../test_framework/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal effect card for use as the source of an effect. */
function makeEffectCard(title: string, side: string): Card {
  return {
    cid: `effect-${title}`,
    title,
    side,
  } as Card;
}

/** Build a `gain-subtype` effect object. */
function makeGainSubtypeEffect(
  sourceCard: Card,
  value: string,
  req?: (
    state: GameState,
    side: string,
    eid: unknown,
    card: Card | null,
    targets: Card[],
  ) => boolean,
) {
  return {
    uuid: crypto.randomUUID(),
    type: "gain-subtype",
    card: sourceCard,
    value: () => value,
    req: req as any,
    duration: "while-active",
    lingering: true,
  };
}

// ---------------------------------------------------------------------------
// subtypes-for-card tests
// ---------------------------------------------------------------------------

describe("subtypesForCard", () => {
  let state: GameState;
  let stimhack: Card;

  beforeEach(() => {
    doGame((s) => {
      newGame(s, { runner: { hand: ["Stimhack"] } });
      state = s;
      stimhack = tfFindCard(s, "Stimhack")!;
    });
  });

  it("returns subtypes for a given card", () => {
    expect(subtypesForCard(state, stimhack)).toEqual(["Run"]);
  });

  it("returns printed subtypes", () => {
    // Even when the card in game state has empty subtypes,
    // it should fall back to the printed (server) subtypes.
    (state.runner.hand[0] as any).subtypes = [];
    const card = refresh(state, stimhack);
    expect(subtypesForCard(state, card)).toEqual(["Run"]);
  });

  it("concats applicable :subtype effects", () => {
    const effectCard = makeEffectCard("Test Effect Source", "Runner");
    state.effects.push(
      makeGainSubtypeEffect(effectCard, "Mod"),
    );
    const result = subtypesForCard(state, refresh(state, stimhack));
    expect(result!.sort()).toEqual(["Mod", "Run"]);
  });
});

// ---------------------------------------------------------------------------
// update-subtypes-for-card tests
// ---------------------------------------------------------------------------

describe("updateSubtypesForCard", () => {
  let state: GameState;
  let stimhack: Card;

  beforeEach(() => {
    doGame((s) => {
      newGame(s, { runner: { hand: ["Stimhack"] } });
      state = s;
      stimhack = tfFindCard(s, "Stimhack")!;
    });
  });

  it("returns false when nothing changes", () => {
    const changed = updateSubtypesForCard(state, null as any, refresh(state, stimhack));
    expect(changed).toBe(false);
  });

  it("returns true when subtypes change", () => {
    const effectCard = makeEffectCard("Test Effect Source", "Runner");
    state.effects.push(
      makeGainSubtypeEffect(effectCard, "Mod"),
    );
    const changed = updateSubtypesForCard(state, null as any, refresh(state, stimhack));
    expect(changed).toBe(true);
    const updatedCard = refresh(state, stimhack);
    expect((updatedCard.subtypes ?? []).sort()).toEqual(["Mod", "Run"]);
  });
});

// ---------------------------------------------------------------------------
// update-all-subtypes tests
// ---------------------------------------------------------------------------

describe("updateAllSubtypes", () => {
  let state: GameState;

  beforeEach(() => {
    doGame((s) => {
      newGame(s, { runner: { hand: ["Stimhack", "Contaminate", "Laamb"] } });
      state = s;
      // Initial update — should settle everything
      updateAllSubtypes(state);
    });
  });

  it("returns false when nothing changes", () => {
    expect(updateAllSubtypes(state)).toBe(false);
  });

  it("returns true when at least 1 card is updated", () => {
    const effectCard = makeEffectCard("Test Effect Source", "Runner");
    // Add a conditional effect that only applies to Stimhack
    state.effects.push(
      makeGainSubtypeEffect(
        effectCard,
        "Mod",
        (_state, _side, _eid, _card, targets) => {
          const target = targets[0];
          return target?.title === "Stimhack";
        },
      ),
    );
    expect(updateAllSubtypes(state)).toBe(true);
  });
});
