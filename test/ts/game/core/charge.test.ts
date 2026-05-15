import { describe, it, expect } from "vitest";
import { resolveAbility } from "@/game/core/engine_1";
import {
  newGame,
  takeCredits,
  playFromHand,
  clickPrompt,
  clickCard,
  getRunner,
  getResource,
  refresh,
  getCounters,
  noPrompt,
  waiting,
  doGame,
  makeEid,
} from "../test_framework/index";
import { canCharge, chargeCard, chargeAbility } from "../../../../src/ts/game/core/charge";

describe("Charge", () => {
  it("Charging a card", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Earthrise Hotel", "Daily Casts"], credits: 10 } });
      takeCredits(state, "corp");

      expect(canCharge(state, "runner")).toBe(false); // Can't charge, there are no targets

      playFromHand(state, "runner", "Daily Casts");
      expect(canCharge(state, "runner", getResource(state, 0))).toBe(false); // Can't charge daily casts
      expect(canCharge(state, "runner")).toBe(false); // Can't charge, there are still no targets

      playFromHand(state, "runner", "Earthrise Hotel");
      const hotel = getResource(state, 1);
      expect(getCounters(refresh(state, hotel), "power")).toBe(3); // Hotel starts with 3 counters
      expect(canCharge(state, "runner", refresh(state, hotel))).toBe(true); // We can charge hotel
      expect(canCharge(state, "runner")).toBe(true); // We can charge in general (because of hotel)
      expect(getCounters(refresh(state, hotel), "power")).toBe(3); // Hotel has not been changed

      chargeCard(state, "runner", makeEid(state), refresh(state, hotel));
      expect(getCounters(refresh(state, hotel), "power")).toBe(4); // Default charge adds 1 power counter

      chargeCard(state, "runner", makeEid(state), refresh(state, hotel), 6);
      expect(getCounters(refresh(state, hotel), "power")).toBe(10); // 4 + 6 = 10 power counters

      const casts = getResource(state, 0);
      expect(getCounters(refresh(state, casts), "power")).toBe(0); // Casts has 0 power counters
      chargeCard(state, "runner", makeEid(state), refresh(state, casts));
      expect(getCounters(refresh(state, casts), "power")).toBe(0); // Casts still has 0 power counters
    });
  });

  it("Charge using a prompt", () => {
    doGame((state) => {
      newGame(state, { runner: { hand: ["Earthrise Hotel", "Daily Casts"], credits: 10 } });
      takeCredits(state, "corp");

      resolveAbility(
        state,
        "runner",
        chargeAbility(state, "runner") ?? {},
        getRunner(state).identity,
        [],
      );
      expect(noPrompt(state, "runner")).toBe(true); // No prompt to charge because the action is invalid

      playFromHand(state, "runner", "Daily Casts");
      resolveAbility(
        state,
        "runner",
        chargeAbility(state, "runner") ?? {},
        getRunner(state).identity,
        [],
      );
      expect(noPrompt(state, "runner")).toBe(true); // No prompt to charge because there are no valid targets

      playFromHand(state, "runner", "Earthrise Hotel");
      resolveAbility(
        state,
        "runner",
        chargeAbility(state, "runner") ?? {},
        getRunner(state).identity,
        [],
      );
      expect(waiting(state, "corp")).toBe(true);
      clickPrompt(state, "runner", "Done");
      expect(noPrompt(state, "corp")).toBe(true);

      resolveAbility(
        state,
        "runner",
        chargeAbility(state, "runner") ?? {},
        getRunner(state).identity,
        [],
      );
      clickCard(state, "runner", "Daily Casts");
      expect(noPrompt(state, "runner")).toBe(false); // Can't charge Daily Casts

      clickCard(state, "runner", "Earthrise Hotel");
      expect(getCounters(getResource(state, 1), "power")).toBe(4);
      expect(noPrompt(state, "corp")).toBe(true);
    });
  });
});
