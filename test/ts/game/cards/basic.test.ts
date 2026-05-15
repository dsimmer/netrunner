import { describe, it, expect } from "vitest";
import * as core from "@/game/core";
import {
  newGame, startingHand, takeCredits,
  playFromHand, runOn,
  clickCredit, clickDraw, clickAdvance, clickCard,
  clickPrompt,
  getCorp, getRunner, getIce, getContent, getProgram, getResource, getHardware,
  gain, gainTags, removeTag, purge, trash,
  getCounters, refresh, lastLogContains,
  countTags, changed, qty,
} from "../test_framework/index";

it("corp basic actions - gain 1 credit", () => {
  const state = newGame();
  changed(() => getCorp(state).credit, 1, () => {
    clickCredit(state, "corp");
  });
});

it("corp basic actions - draw card", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 10)] } });
  changed(() => getCorp(state).hand.length, 1, () => {
    clickDraw(state, "corp");
  });
});

it("corp basic actions - install agenda", () => {
  const state = newGame({ corp: { hand: ["Project Beale"] } });
  playFromHand(state, "corp", "Project Beale", "New remote");
  expect(getContent(state, "remote1", 0).title).toBe("Project Beale");
});

it("corp basic actions - install asset", () => {
  const state = newGame({ corp: { hand: ["PAD Campaign"] } });
  playFromHand(state, "corp", "PAD Campaign", "New remote");
  expect(getContent(state, "remote1", 0).title).toBe("PAD Campaign");
});

it("corp basic actions - install upgrade", () => {
  const state = newGame({ corp: { hand: ["Breaker Bay Grid"] } });
  playFromHand(state, "corp", "Breaker Bay Grid", "New remote");
  expect(getContent(state, "remote1", 0).title).toBe("Breaker Bay Grid");
});

it("corp basic actions - install ice", () => {
  const state = newGame({ corp: { hand: ["Ice Wall"] } });
  playFromHand(state, "corp", "Ice Wall", "New remote");
  expect(getIce(state, "remote1", 0).title).toBe("Ice Wall");
});

it("corp basic actions - play operation", () => {
  const state = newGame({ corp: { hand: ["Hedge Fund"] } });
  changed(() => getCorp(state).credit, 4, () => {
    playFromHand(state, "corp", "Hedge Fund");
  });
});

it("corp basic actions - advance installed ice", () => {
  const state = newGame({ corp: { hand: ["Ice Wall"] } });
  playFromHand(state, "corp", "Ice Wall", "hq");
  clickAdvance(state, "corp", getIce(state, "hq", 0));
  expect(getCounters(getIce(state, "hq", 0), "advancement")).toBe(1);
});

it("corp basic actions - advance agenda", () => {
  const state = newGame({ corp: { hand: ["Project Beale"] } });
  playFromHand(state, "corp", "Project Beale", "New remote");
  clickAdvance(state, "corp", getContent(state, "remote1", 0));
  expect(getCounters(getContent(state, "remote1", 0), "advancement")).toBe(1);
});

it("corp basic actions - trash resource if runner is tagged", () => {
  const state = newGame({ runner: { hand: ["Fan Site"] }, options: { startAs: "runner" } });
  playFromHand(state, "runner", "Fan Site");
  const fs = getResource(state, 0);
  takeCredits(state, "runner");
  gainTags(state, "runner", 1);
  // trash resource action
  core.trashResource(state);
  clickCard(state, "corp", fs);
  expect(lastLogContains(state, "to trash Fan Site")).toBe(true);
  expect(getRunner(state).discard.length).toBe(1);
});

it("corp basic actions - purge", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Ice Wall"] },
    runner: { deck: ["Clot", "Imp", "Botulus"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Clot");
  playFromHand(state, "runner", "Imp");
  playFromHand(state, "runner", "Botulus");
  clickCard(state, "runner", getIce(state, "hq", 0));
  takeCredits(state, "runner");
  const imp = getProgram(state, 1);
  const bot = (getIce(state, "hq", 0) as any).hosted[0];
  expect(getCounters(refresh(state, imp), "virus")).toBe(2);
  expect(getCounters(refresh(state, bot), "virus")).toBe(1);
  purge(state, "corp");
  expect(getRunner(state).discard.length).toBe(1);
  expect(getCounters(refresh(state, imp), "virus")).toBe(0);
  expect(getCounters(refresh(state, bot), "virus")).toBe(0);
  takeCredits(state, "corp");
  expect(getCounters(refresh(state, bot), "virus")).toBe(1);
});

it("runner basic actions - gain 1 credit", () => {
  const state = newGame({ options: { startAs: "runner" } });
  changed(() => getRunner(state).credit, 1, () => {
    clickCredit(state, "runner");
  });
});

it("runner basic actions - draw card", () => {
  const state = newGame({ options: { startAs: "runner" }, runner: { deck: [qty("Sure Gamble", 10)] } });
  changed(() => getRunner(state).hand.length, 1, () => {
    clickDraw(state, "runner");
  });
});

it("runner basic actions - install program", () => {
  const state = newGame({ options: { startAs: "runner" }, runner: { hand: ["Misdirection"] } });
  playFromHand(state, "runner", "Misdirection");
  expect(getProgram(state, 0).title).toBe("Misdirection");
});

it("runner basic actions - install resource", () => {
  const state = newGame({ options: { startAs: "runner" }, runner: { hand: ["Fan Site"] } });
  playFromHand(state, "runner", "Fan Site");
  expect(getResource(state, 0).title).toBe("Fan Site");
});

it("runner basic actions - install hardware", () => {
  const state = newGame({ options: { startAs: "runner" }, runner: { hand: ["Bookmark"] } });
  playFromHand(state, "runner", "Bookmark");
  expect(getHardware(state, 0).title).toBe("Bookmark");
});

it("runner basic actions - play event", () => {
  const state = newGame({ options: { startAs: "runner" }, runner: { hand: ["Sure Gamble"] } });
  changed(() => getRunner(state).credit, 4, () => {
    playFromHand(state, "runner", "Sure Gamble");
  });
});

it("runner basic actions - run hq", () => {
  const state = newGame({ options: { startAs: "runner" } });
  runOn(state, "hq");
  expect((state as any).run).toBeTruthy();
});

it("runner basic actions - remove tag", () => {
  const state = newGame({ options: { startAs: "runner" } });
  gainTags(state, "runner", 1);
  expect(countTags(state)).toBe(1);
  removeTag(state, "runner");
  expect(countTags(state)).toBe(0);
});
