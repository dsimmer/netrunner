// Tests for game.core.rezzing
// Mirrors: test/clj/game/core/rezzing_test.clj
import { describe, it, expect, beforeEach } from "vitest";
import * as core from "@/game/core";
import { newGame, qty, playFromHand, rez, derez, clickPrompt, clickCard, getPromptMap, getContent, getCorp, refresh, waiting, changed } from "../test_framework";
import { getRezCost, canPayToRez } from "@/game/core/rezzing";
import { toC, mergeCosts } from "@/game/core/payment";
import type { Card } from "@/game/core/card";

// ---------------------------------------------------------------------------
// get-rez-cost tests
// ---------------------------------------------------------------------------

describe("get-rez-cost", () => {
  let state: any;
  let card: Card;

  beforeEach(() => {
    state = newGame();
    card = { title: "No match", cost: 5 };
  });

  describe("ignoring all costs", () => {
    it("returns 0 credits when ignore-cost is :all-costs", () => {
      const costs = getRezCost(state, "corp", card, { ignoreCost: "all-costs" });
      expect(costs).toEqual([toC("credit", 0)]);
    });
  });

  describe("as an alternative cost", () => {
    it("returns the alternative cost", () => {
      const costs = getRezCost(state, "corp", card, { alternativeCost: [toC("click", 1)] });
      expect(costs).toEqual([toC("click", 1)]);
    });
  });

  describe("base cost", () => {
    it("returns card cost in credits", () => {
      const costs = getRezCost(state, "corp", card, {});
      expect(costs).toEqual([toC("credit", 5)]);
    });
  });

  describe("ignoring cost", () => {
    it("returns empty when ignore-cost is true", () => {
      const costs = getRezCost(state, "corp", card, { ignoreCost: true });
      expect(costs).toEqual([]);
    });
  });

  describe("with additional costs and card disabled", () => {
    let cardWithAdditionalCost: Card;

    beforeEach(() => {
      cardWithAdditionalCost = {
        title: "No match",
        cost: 5,
        additionalCost: [toC("trash-can", 1)],
        disabled: true,
      };
    });

    it("returns only base credit cost when card is disabled", () => {
      const costs = getRezCost(state, "corp", cardWithAdditionalCost, {});
      expect(costs).toEqual([toC("credit", 5)]);
    });
  });
});

// ---------------------------------------------------------------------------
// simultaneous-rez test
// ---------------------------------------------------------------------------

describe("simultaneous-rez", () => {
  it("Corp can rez multiple assets and on-rez triggers resolve", () => {
    const state: any = newGame({
      corp: {
        hand: ["Advanced Assembly Lines", "NGO Front", "PAD Campaign"],
        deck: qty("Hedge Fund", 10),
      },
    });

    // Corp starts with 5 credits
    // Play 3 cards (-3) = 2 credits
    // Need extra credits to rez: AAL costs 5, NGO costs 4 = 9
    core.gain(state, "corp", "credit", 10);

    // Play assets to new remote servers
    playFromHand(state, "corp", "Advanced Assembly Lines", "New remote");
    playFromHand(state, "corp", "NGO Front", "New remote");

    const aal = getContent(state, "remote1", 0);
    const ngo = getContent(state, "remote2", 0);

    expect(aal).toBeTruthy();
    expect(ngo).toBeTruthy();

    // Rez AAL - costs 5 credits
    expect(changed(
      () => getCorp(state).credit,
      -5,
      () => rez(state, "corp", aal),
    )).toBe(true);

    // AAL's on-rez should trigger (gain 3 credits)
    // The trigger resolution prompt should appear
    expect(getPromptMap(state, "corp")).toBeDefined();
    expect(getPromptMap(state, "corp")?.msg).toBe("Choose a trigger to resolve");

    // Resolve AAL's on-rez trigger
    const promptTitles = (getPromptMap(state, "corp")?.choices ?? [])
      .map((c: any) => c?.value?.title ?? c?.value ?? c);
    expect(promptTitles).toContain("Advanced Assembly Lines");

    const creditBeforeAALTrigger = getCorp(state).credit;
    clickPrompt(state, "corp", "Advanced Assembly Lines");
    expect(getCorp(state).credit).toBe(creditBeforeAALTrigger + 3);

    // Click Done to finish trigger resolution
    clickPrompt(state, "corp", "Done");

    // Rez NGO Front
    rez(state, "corp", ngo);

    // Verify all cards are rezzed
    expect(refresh(state, aal).rezzed).toBeTruthy();
    expect(refresh(state, ngo).rezzed).toBeTruthy();

    // Runner should be waiting
    expect(waiting(state, "runner")).toBe(true);
  });

  it("Can rez cards at no cost when ignore-cost is true", () => {
    const state: any = newGame({
      corp: {
        hand: ["NGO Front"],
        deck: qty("Hedge Fund", 5),
      },
    });

    playFromHand(state, "corp", "NGO Front", "New remote");
    const ngo = getContent(state, "remote1", 0);

    expect(ngo).toBeTruthy();

    const creditBefore = getCorp(state).credit;
    rez(state, "corp", ngo, { ignoreCost: true });

    expect(getCorp(state).credit).toBe(creditBefore);
    expect(refresh(state, ngo).rezzed).toBeTruthy();
  });

  it("Can rez with cost-bonus discount", () => {
    const state: any = newGame({
      corp: {
        hand: ["NGO Front"],
        deck: qty("Hedge Fund", 5),
      },
    });

    playFromHand(state, "corp", "NGO Front", "New remote");
    const ngo = getContent(state, "remote1", 0);
    // NGO Front costs 4 to rez, with -2 bonus it costs 2

    expect(ngo).toBeTruthy();

    const creditBefore = getCorp(state).credit;
    rez(state, "corp", ngo, { costBonus: -2 });

    expect(getCorp(state).credit).toBe(creditBefore - 2);
    expect(refresh(state, ngo).rezzed).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// can-pay-to-rez tests
// ---------------------------------------------------------------------------

describe("can-pay-to-rez", () => {
  let state: any;

  beforeEach(() => {
    state = newGame({
      corp: {
        hand: ["NGO Front"],
        deck: qty("Hedge Fund", 5),
      },
    });
  });

  it("returns true when corp can afford to rez", () => {
    playFromHand(state, "corp", "NGO Front", "New remote");
    const card = getContent(state, "remote1", 0);
    const eid = core.makeEID(state);
    // NGO Front costs 4 to rez, corp has 4 credits (5 - 1 for playing)
    expect(canPayToRez(state, "corp", eid, card)).toBe(true);
  });

  it("returns false when corp cannot afford to rez", () => {
    // Deplete credits first
    core.lose(state, "corp", "credit", 5);
    playFromHand(state, "corp", "NGO Front", "New remote");
    const card = getContent(state, "remote1", 0);
    const eid = core.makeEID(state);
    // NGO Front costs 4 to rez, corp has 0 credits
    expect(canPayToRez(state, "corp", eid, card)).toBe(false);
  });
});
