import { describe, it, expect } from "vitest";
import * as core from "@/game/core";
import { newGame, qty, playFromHand, getContent, getCorp, getIce } from "../test_framework";

describe("debug", () => {
  it("play asset", () => {
    const state: any = newGame({
      corp: {
        hand: ["PAD Campaign"],
        deck: qty("Hedge Fund", 5),
      },
    });
    console.log("Corp hand:", state.corp.hand.map((c: any) => c.title));
    const result = playFromHand(state, "corp", "PAD Campaign", "New remote");
    console.log("Play result:", result);
    console.log("Servers:", Object.keys(state.corp.servers || {}));
    console.log("remote1:", JSON.stringify(state.corp.servers?.remote1));
    const content = getContent(state, "remote1", 0);
    console.log("remote1 content[0]:", content);
    expect(result).toBe(true);
  });
});
