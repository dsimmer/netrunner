import { describe, it, expect } from "vitest";
import * as core from "@/game/core";
import {
  newGame,
  takeCredits,
  playFromHand,
  playAndScore,
  rez,
  cardAbility,
  clickCard,
  clickPrompt,
  findCard,
  getIce,
  getContent,
  getCorp,
  getRunner,
  gain,
} from "../test_framework/index";

describe("all-installed", () => {
  it("corp cards", () => {
    const state: any = {};
    newGame(state, {
      corp: {
        hand: [
          // Agendas
          "Merger",
          "Hostile Takeover",
          // Assets
          "PAD Campaign",
          "Worlds Plaza",
          "NGO Front",
          // Ice
          "Ice Wall",
          "Vanilla",
          // Upgrades
          "Research Station",
          "Embolus",
          // Hosted Operations
          "MCA Informant",
          "Patch",
          // Currents
          "Death and Taxes",
          // Removed from the game
          "Game Changer",
          // Operation during resolution
          "Distract the Masses",
          // Card left in hand
          "Enigma",
        ],
        deck: ["Hedge Fund"],
        discard: ["IPO"],
        credits: 100,
      },
      runner: { hand: ["Film Critic"] },
    });
    gain(state, "corp", "click", 100);

    // Agendas
    playAndScore(state, "Hostile Takeover");
    expect(findCard("Hostile Takeover", core.allInstalled(state, "corp"))).toBeFalsy();

    playFromHand(state, "corp", "Merger", "New remote");
    expect(findCard("Merger", core.allInstalled(state, "corp"))).toBeTruthy();

    // Assets
    playFromHand(state, "corp", "PAD Campaign", "New remote");
    expect(findCard("PAD Campaign", core.allInstalled(state, "corp"))).toBeTruthy();

    playFromHand(state, "corp", "Worlds Plaza", "New remote");
    rez(state, "corp", getContent(state, "remote4", 0));
    expect(findCard("Worlds Plaza", core.allInstalled(state, "corp"))).toBeTruthy();

    cardAbility(state, "corp", getContent(state, "remote4", 0), 0);
    clickCard(state, "corp", "NGO Front");
    expect(findCard("NGO Front", core.allInstalled(state, "corp"))).toBeTruthy();

    // Ice
    playFromHand(state, "corp", "Ice Wall", "HQ");
    expect(findCard("Ice Wall", core.allInstalled(state, "corp"))).toBeTruthy();

    playFromHand(state, "corp", "Vanilla", "New remote");
    expect(findCard("Vanilla", core.allInstalled(state, "corp"))).toBeTruthy();

    // Upgrades
    // Root
    playFromHand(state, "corp", "Research Station", "HQ");
    expect(findCard("Research Station", core.allInstalled(state, "corp"))).toBeTruthy();

    // Remotes
    playFromHand(state, "corp", "Embolus", "New remote");
    expect(findCard("Embolus", core.allInstalled(state, "corp"))).toBeTruthy();

    // Hosted Operations
    rez(state, "corp", getIce(state, "hq", 0));
    playFromHand(state, "corp", "Patch");
    clickCard(state, "corp", "Ice Wall");
    expect(findCard("Patch", core.allInstalled(state, "corp"))).toBeTruthy();

    // Currents
    playFromHand(state, "corp", "Death and Taxes");
    expect(findCard("Death and Taxes", core.allInstalled(state, "corp"))).toBeFalsy();

    // RFG
    playFromHand(state, "corp", "Game Changer");
    expect(findCard("Game Changer", core.allInstalled(state, "corp"))).toBeFalsy();

    // Operation in the play area
    playFromHand(state, "corp", "Distract the Masses");
    expect(findCard("Distract the Masses", core.allInstalled(state, "corp"))).toBeFalsy();
    clickPrompt(state, "corp", "Done");
    clickPrompt(state, "corp", "Done");

    // Hand
    expect(findCard("Enigma", core.allInstalled(state, "corp"))).toBeFalsy();

    // Deck
    expect(findCard("Hedge Fund", core.allInstalled(state, "corp"))).toBeFalsy();

    // Discard
    expect(findCard("IPO", core.allInstalled(state, "corp"))).toBeFalsy();

    takeCredits(state, "corp");
    playFromHand(state, "runner", "Film Critic");
    takeCredits(state, "runner");
    playFromHand(state, "corp", "MCA Informant");
    clickCard(state, "corp", "Film Critic");
    // Hosted on runner cards
    expect(findCard("MCA Informant", core.allInstalled(state, "corp"))).toBeTruthy();
  });

  it("runner cards", () => {
    const state: any = {};
    newGame(state, {
      corp: { hand: ["Ice Wall"] },
      runner: { hand: ["Parasite"] },
    });
    playFromHand(state, "corp", "Ice Wall", "New remote");
    rez(state, "corp", getIce(state, "remote1", 0));
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Parasite");
    clickCard(state, "runner", "Ice Wall");
    expect(findCard("Parasite", core.allInstalled(state, "runner"))).toBeTruthy();
  });
});
