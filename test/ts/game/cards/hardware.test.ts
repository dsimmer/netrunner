import { it, expect } from "vitest";
import * as core from "@/game/core";
import {
  newGame, startingHand, stackDeck,
  takeCredits, startTurn, endTurn, endPhase12,
  playFromHand, playAndScore, scoreAgenda, score, playCards,
  runEmptyServer, runOn, runContinue, runContinueUntil, runJackOut,
  clickPrompt, clickPrompts, clickCard, clickAdvance, clickDraw, clickCredit,
  rez, derez, advance, cardAbility, cardSubroutine, fireSubs,
  autoPump, autoPumpAndBreak, cardSideAbility,
  noPrompt, waiting, promptButtons, promptTitles,
  promptIsCard, promptIsType,
  getPromptMap, getCorp, getRunner, getIce, getContent, getProgram, getHardware,
  getResource, getScored, getRfg,
  findCard, refresh, getTitle, rezzed, faceup, getCounters, getStrength,
  hasIcon, noIcons, cardIcons, hasSubtype, installed,
  trash, trashFromHand, move, gain, lose, addProp, makeEid, gainClicks,
  gainTags, loseTags, removeTag, damage, draw, purge, trace, change,
  countTags, countRealTags, isTagged, countBadPub, getLink, handSize,
  lastLogContains, secondLastLogContains,
  qty, changed, changedMulti, isDeckStacked, selectBadPub,
} from "../test_framework/index";

// Acacia
it("acacia-pay-credits-prompt", () => {
  const state = newGame({
    runner: { hand: ["Acacia", "Inti"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Acacia");
  playFromHand(state, "runner", "Inti");
  const acacia = getHardware(state, 0);
  const inti = getProgram(state, 0);
  expect(
    changed(() => getRunner(state).credit, 0, () => {
      cardAbility(state, "runner", inti, 1);
      clickCard(state, "runner", acacia);
    })
  ).toBe(true);
});

// Afterimage
it("afterimage-basic", () => {
  const state = newGame({
    corp: { deck: ["PAD Campaign"], hand: ["Vanilla"] },
    runner: { hand: ["Afterimage", "Corroder"] },
  });
  playFromHand(state, "corp", "Vanilla", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Afterimage");
  const ai = getHardware(state, 0);
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinueUntil(state, "success");
  expect(getCounters(refresh(state, ai), "power")).toBe(0);
  expect(getRunner(state).discard.length).toBe(1);
});

it("afterimage-multiple-runs", () => {
  const state = newGame({
    corp: { deck: ["PAD Campaign"], hand: ["Vanilla", "Vanilla"] },
    runner: { hand: ["Afterimage", "Corroder"] },
  });
  playFromHand(state, "corp", "Vanilla", "HQ");
  playFromHand(state, "corp", "Vanilla", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Afterimage");
  const ai = getHardware(state, 0);
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinueUntil(state, "success");
  expect(getCounters(refresh(state, ai), "power")).toBe(0);
  expect(getRunner(state).discard.length).toBe(1);
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 1));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinueUntil(state, "success");
  expect(getCounters(refresh(state, ai), "power")).toBe(0);
  expect(getRunner(state).discard.length).toBe(2);
});

// Anansi
it("anansi-pay-credits-prompt", () => {
  const state = newGame({
    runner: { deck: ["Anansi", "Inti"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Anansi");
  playFromHand(state, "runner", "Inti");
  const an = getHardware(state, 0);
  const inti = getProgram(state, 0);
  expect(
    changed(() => getRunner(state).credit, 0, () => {
      cardAbility(state, "runner", inti, 1);
      clickCard(state, "runner", an);
      clickCard(state, "runner", an);
    })
  ).toBe(true);
});

// Arcus
it("arcus-pay-credits-prompt", () => {
  const state = newGame({
    runner: { deck: ["Arcus", "Inti"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Arcus");
  playFromHand(state, "runner", "Inti");
  const arc = getHardware(state, 0);
  const inti = getProgram(state, 0);
  expect(
    changed(() => getRunner(state).credit, 0, () => {
      cardAbility(state, "runner", inti, 1);
      clickCard(state, "runner", arc);
    })
  ).toBe(true);
});

// Armitage
it("armitage-basic", () => {
  const state = newGame({
    corp: { deck: ["Hedge Fund", "Hostile Takeover"] },
    runner: { hand: ["Armitage", "Sure Gamble"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Armitage");
  const arm = getHardware(state, 0);
  runEmptyServer(state, "hq");
  clickPrompt(state, "runner", "Steal");
  expect(getCounters(refresh(state, arm), "power")).toBe(1);
  runEmptyServer(state, "hq");
  clickPrompt(state, "runner", "Steal");
  expect(getCounters(refresh(state, arm), "power")).toBe(2);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  runEmptyServer(state, "hq");
  clickPrompt(state, "runner", "Steal");
  expect(getCounters(refresh(state, arm), "power")).toBe(3);
});

// Aurora
it("aurora-pay-credits-prompt", () => {
  const state = newGame({
    runner: { hand: ["Aurora", "Inti"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Aurora");
  playFromHand(state, "runner", "Inti");
  const aur = getHardware(state, 0);
  const inti = getProgram(state, 0);
  expect(
    changed(() => getRunner(state).credit, 0, () => {
      cardAbility(state, "runner", inti, 1);
      clickCard(state, "runner", aur);
    })
  ).toBe(true);
});

// Axzim
it("axzim-pay-credits-prompt", () => {
  const state = newGame({
    runner: { hand: ["Axzim", "Inti"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Axzim");
  playFromHand(state, "runner", "Inti");
  const ax = getHardware(state, 0);
  const inti = getProgram(state, 0);
  expect(
    changed(() => getRunner(state).credit, 0, () => {
      cardAbility(state, "runner", inti, 1);
      clickCard(state, "runner", ax);
    })
  ).toBe(true);
});

// Ballast
it("ballast-pay-credits-prompt", () => {
  const state = newGame({
    runner: { hand: ["Ballast", "Inti"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Ballast");
  playFromHand(state, "runner", "Inti");
  const ball = getHardware(state, 0);
  const inti = getProgram(state, 0);
  expect(
    changed(() => getRunner(state).credit, 0, () => {
      cardAbility(state, "runner", inti, 1);
      clickCard(state, "runner", ball);
    })
  ).toBe(true);
});

// Barman
it("barman-pay-credits-prompt", () => {
  const state = newGame({
    runner: { hand: ["Barman", "Inti"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Barman");
  playFromHand(state, "runner", "Inti");
  const bar = getHardware(state, 0);
  const inti = getProgram(state, 0);
  expect(
    changed(() => getRunner(state).credit, 0, () => {
      cardAbility(state, "runner", inti, 1);
      clickCard(state, "runner", bar);
    })
  ).toBe(true);
});

// Basalt Lakai
it("basalt-lakai-basic", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall"], deck: [qty("Hedge Fund", 5)] },
    runner: { hand: ["Basalt Lakai", "Corroder"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Basalt Lakai");
  const bl = getHardware(state, 0);
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinueUntil(state, "success");
  expect(getCounters(refresh(state, bl), "power")).toBe(1);
  runOn(state, "hq");
  runContinue(state);
  expect(getCounters(refresh(state, bl), "power")).toBe(1);
  clickPrompt(state, "runner", "Basalt Lakai");
  expect(getCounters(refresh(state, bl), "power")).toBe(0);
  runContinueUntil(state, "success");
});

// Basalt Lakai - interaction with multiple runs
it("basalt-lakai-multiple-runs", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall"], deck: [qty("Hedge Fund", 5)] },
    runner: { hand: ["Basalt Lakai", "Corroder"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Basalt Lakai");
  const bl = getHardware(state, 0);
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinueUntil(state, "success");
  expect(getCounters(refresh(state, bl), "power")).toBe(1);
  runOn(state, "rd");
  clickPrompt(state, "runner", "No action");
  runOn(state, "hq");
  expect(noPrompt(state, "runner")).toBe(true);
});

// Basalt Lakai - doesn't give additional accesses on non-HQ runs
it("basalt-lakai-non-hq", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall"], deck: [qty("Hedge Fund", 5)] },
    runner: { hand: ["Basalt Lakai", "Corroder"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "R&D");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Basalt Lakai");
  const bl = getHardware(state, 0);
  runOn(state, "rd");
  rez(state, "corp", getIce(state, "rd", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinueUntil(state, "success");
  expect(getCounters(refresh(state, bl), "power")).toBe(0);
});

// Basalt Lakai - doesn't trigger on non-HQ run even with Gang Sign
it("basalt-lakai-gang-sign", () => {
  const state = newGame({
    corp: { deck: [qty("Hostile Takeover", 5)] },
    runner: { hand: ["Basalt Lakai", "Gang Sign"], credits: 5 },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Gang Sign");
  playFromHand(state, "runner", "Basalt Lakai");
  takeCredits(state, "runner");
  playFromHand(state, "corp", "Hostile Takeover", "New remote");
  scoreAgenda(state, "corp", getContent(state, "remote1", 0));
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Steal");
  const bl = getHardware(state, 0);
  expect(noPrompt(state, "runner")).toBe(true);
});

// Basalt Lakai - interaction with R&D Interface
it("basalt-laksi-rdi", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall"], deck: [qty("Hedge Fund", 5)] },
    runner: { hand: ["Basalt Lakai", "Corroder", "R&D Interface"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "R&D");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Basalt Lakai");
  playFromHand(state, "runner", "R&D Interface");
  cardAbility(state, "runner", getProgram(state, 1), 0);
  runContinue(state);
  runContinueUntil(state, "success");
  clickPrompt(state, "runner", "No action");
  runOn(state, "hq");
  expect(noPrompt(state, "runner")).toBe(true);
});

// Basalt Lakai - interaction with multiple breaks
it("basalt-lakai-multiple-breaks", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall", "Ice Wall"], deck: [qty("Hedge Fund", 5)] },
    runner: { hand: ["Basalt Lakai", "Corroder"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Basalt Lakai");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinue(state);
  rez(state, "corp", getIce(state, "hq", 1));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinueUntil(state, "success");
  const bl = getHardware(state, 0);
  expect(getCounters(refresh(state, bl), "power")).toBe(1);
});

// Basalt Lakai - doesn't trigger if ice is trashed instead of broken
it("basalt-lakai-chisel", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall"], deck: [qty("Hedge Fund", 5)] },
    runner: { hand: ["Basalt Lakai", "Chisel"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Chisel");
  clickCard(state, "runner", "Ice Wall");
  playFromHand(state, "runner", "Basalt Lakai");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinueUntil(state, "movement");
  runJackOut(state);
  runOn(state, "hq");
  runContinueUntil(state, "success");
  const bl = getHardware(state, 0);
  expect(getCounters(refresh(state, bl), "power")).toBe(0);
});

// Basalt Lakai - doesn't trigger if ice is derezzed
it("basalt-lakai-derez", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall"], deck: [qty("Hedge Fund", 5)] },
    runner: { hand: ["Basalt Lakai", "Saker"], credits: 15 },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Saker");
  playFromHand(state, "runner", "Basalt Lakai");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 2);
  expect(rezzed(getIce(state, "hq", 0))).toBe(false);
  runContinueUntil(state, "success");
  const bl = getHardware(state, 0);
  expect(getCounters(refresh(state, bl), "power")).toBe(0);
});

// Basalt Lakai - doesn't trigger on approach ICE
it("basalt-lakai-approach-ice", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall", "Ice Wall"], deck: [qty("Hedge Fund", 5)] },
    runner: { hand: ["Basalt Lakai", "Corroder"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Basalt Lakai");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "Done");
  runContinue(state);
  const bl = getHardware(state, 0);
  expect(getCounters(refresh(state, bl), "power")).toBe(0);
});

// Basalt Lakai - can be used on the same run it's triggered
it("basalt-lakai-same-turn", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall", "Ice Wall"], deck: [qty("Hedge Fund", 5)] },
    runner: { hand: ["Basalt Lakai", "Corroder"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Basalt Lakai");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinueUntil(state, "success");
  const bl = getHardware(state, 0);
  clickPrompt(state, "runner", "Basalt Lakai");
  clickPrompt(state, "runner", "No action");
  expect(getCounters(refresh(state, bl), "power")).toBe(0);
});

// Basalt Lakai - with multiple counters
it("basalt-lakai-multiple-counters", () => {
  const state = newGame({
    corp: { hand: [qty("Ice Wall", 2)], deck: [qty("Hedge Fund", 5)] },
    runner: { hand: ["Basalt Lakai", "Corroder"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Basalt Lakai");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinueUntil(state, "success");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 1));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinueUntil(state, "success");
  const bl = getHardware(state, 0);
  expect(getCounters(refresh(state, bl), "power")).toBe(2);
  runOn(state, "hq");
  clickPrompt(state, "runner", "Basalt Lakai");
  expect(getCounters(refresh(state, bl), "power")).toBe(1);
  runContinueUntil(state, "success");
  clickPrompt(state, "runner", "No action");
  clickPrompt(state, "runner", "No action");
});

// Basalt Lakai - interaction with Armitage
it("basalt-lakai-armitage", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall"], deck: ["Hostile Takeover"] },
    runner: { hand: ["Basalt Lakai", "Armitage", "Corroder"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");