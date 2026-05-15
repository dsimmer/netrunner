import { describe, it, expect, beforeEach } from "vitest";
import * as core from "@/game/core";
import {
  newGame, startingHand, stackDeck, cloneState,
  takeCredits, startTurn, endTurn, endPhase12,
  playFromHand, playAndScore, scoreAgenda, score, playCards, playRunEvent,
  runEmptyServer, runOn, runContinue, runContinueUntil, runJackOut, encounterContinue,
  clickPrompt, clickPrompts, clickCard, clickAdvance, clickDraw, clickCredit,
  rez, derez, advance, cardAbility, expend, cardSubroutine, fireSubs,
  noPrompt, waiting, promptButtons, promptTitles, accessing, promptIsCard, promptIsType,
  getPromptMap, getCorp, getRunner, getRun, getIce, getContent, getProgram, getHardware,
  getResource, getRunnerFacedown, getScored, getRfg, getDiscarded,
  findCard, refresh, getTitle, rezzed, faceup, getCounters, sameCard,
  hasSubtype, installed, getStrength,
  trash, trashFromHand, move, gain, lose, addProp, makeEid, gainClicks,
  gainTags, loseTags, removeTag, damage, draw, purge, trace, change,
  countTags, countRealTags, isTagged, countBadPub, getLink, handSize,
  lastLogContains, secondLastLogContains,
  qty, changed, changedMulti, isDeckStacked, selectBadPub,
} from "../test_framework/index";

it("dividents vs sansan city grid", () => {
  const state = newGame({ corp: { credits: 15, hand: ["SanSan City Grid", "Off the Books"] } });
  gain(state, "corp", "click", 2);
  playFromHand(state, "corp", "SanSan City Grid", "New remote");
  playFromHand(state, "corp", "Off the Books", "Server 1");
  for (let i = 0; i < 3; i++) {
    clickAdvance(state, "corp", getContent(state, "remote1", 1));
  }
  rez(state, "corp", getContent(state, "remote1", 0));
  score(state, "corp", getContent(state, "remote1", 1));
  expect(getCounters(getScored(state, "corp", 0), "agenda")).toBe(1);
});

describe("15 Minutes", () => {
  it("works from runner side", () => {
    const state = newGame({ corp: { hand: ["15 Minutes"] } });
    playFromHand(state, "corp", "15 Minutes", "New remote");
    takeCredits(state, "corp");
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "runner", "Steal");
    takeCredits(state, "runner");
    expect(getRunner(state).agendaPoint).toBe(1);
    expect(getRunner(state).scored.length).toBe(1);
    const fifm = getRunner(state).scored[0];
    expect(getCorp(state).click).toBe(3);
    expect(refresh(state, fifm).abilities.length).toBe(1);
    cardAbility(state, "corp", refresh(state, fifm), 0);
    expect(getRunner(state).agendaPoint).toBe(0);
    expect(getRunner(state).scored.length).toBe(0);
    expect(findCard("15 Minutes", getCorp(state).deck)).toBeTruthy();
  });

  it("works from corp side", () => {
    const state = newGame({ corp: { hand: ["15 Minutes"] } });
    playAndScore(state, "15 Minutes");
    expect(getCorp(state).agendaPoint).toBe(1);
    expect(getCorp(state).scored.length).toBe(1);
    const fifm = getCorp(state).scored[0];
    expect(refresh(state, fifm).abilities.length).toBe(1);
    cardAbility(state, "corp", refresh(state, fifm), 0);
    expect(getCorp(state).agendaPoint).toBe(0);
    expect(getCorp(state).scored.length).toBe(0);
    expect(findCard("15 Minutes", getCorp(state).deck)).toBeTruthy();
  });
});

it("Above the Law", () => {
  const state = newGame({
    corp: { hand: ["Above the Law"] },
    runner: { hand: ["Armitage Codebusting"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Armitage Codebusting");
  takeCredits(state, "runner");
  playAndScore(state, "Above the Law");
  clickCard(state, "corp", "Armitage Codebusting");
  expect(findCard("Armitage Codebusting", getRunner(state).discard)).toBeTruthy();
});

it("Accelerated Beta Test", () => {
  const state = newGame({
    corp: { deck: ["Enigma", qty("Hedge Fund", 2)], hand: ["Accelerated Beta Test"] },
  });
  playAndScore(state, "Accelerated Beta Test");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "corp", "OK");
  expect(promptButtons(state, "corp").map((b: any) => b.title ?? b)).toEqual(["Enigma", "Cancel"]);
  clickPrompt(state, "corp", "Enigma");
  clickPrompt(state, "corp", "HQ");
  clickPrompt(state, "corp", "Cancel");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(noPrompt(state, "runner")).toBe(true);
  expect(getIce(state, "hq", 0)).toBeTruthy();
  expect(getCorp(state).discard.length).toBe(2);
  move(state, "corp", findCard("Accelerated Beta Test", getCorp(state).scored), "hand");
  move(state, "corp", findCard("Hedge Fund", getCorp(state).discard), "deck");
  move(state, "corp", findCard("Hedge Fund", getCorp(state).discard), "deck");
  playAndScore(state, "Accelerated Beta Test");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "corp", "OK");
  expect(promptButtons(state, "corp").map((b: any) => b.title ?? b)).toEqual(["Cancel"]);
  clickPrompt(state, "corp", "Cancel");
  expect(getCorp(state).discard.length).toBe(2);
});

it("Advanced Concept Hopper", () => {
  const state = newGame({ corp: { deck: ["Advanced Concept Hopper", qty("Hedge Fund", 4)] } });
  startingHand(state, "corp", ["Advanced Concept Hopper"]);
  playAndScore(state, "Advanced Concept Hopper");
  takeCredits(state, "corp");
  const cards = getCorp(state).hand.length;
  runOn(state, "archives");
  clickPrompt(state, "corp", "Draw 1 card");
  expect(getCorp(state).hand.length).toBe(cards + 1);
  runContinue(state);
  runOn(state, "archives");
  expect(noPrompt(state, "corp")).toBe(true);
  runJackOut(state);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  const credits = getCorp(state).credit;
  runOn(state, "archives");
  clickPrompt(state, "corp", "Gain 1 [Credits]");
  expect(getCorp(state).credit).toBe(credits + 1);
  runContinue(state);
  runOn(state, "archives");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Aggressive Trendsetting - pay click", () => {
  const state = newGame({ corp: { scoreArea: ["Aggressive Trendsetting"], hand: ["PAD Campaign"] } });
  playFromHand(state, "corp", "PAD Campaign", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Pay 4 [Credits] to trash");
  changed(() => getRunner(state).click, -1, () => {
    clickPrompt(state, "runner", "Yes");
  });
  takeCredits(state, "runner");
  expect(getCorp(state).click).toBe(3);
});

it("Aggressive Trendsetting - gain click", () => {
  const state = newGame({ corp: { scoreArea: ["Aggressive Trendsetting"], hand: ["PAD Campaign"] } });
  playFromHand(state, "corp", "PAD Campaign", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Pay 4 [Credits] to trash");
  changed(() => getRunner(state).click, 0, () => {
    clickPrompt(state, "runner", "No");
  });
  takeCredits(state, "runner");
  expect(getCorp(state).click).toBe(4);
});

it("Ancestral Imager", () => {
  const state = newGame({ corp: { deck: [qty("Ancestral Imager", 3)] } });
  playAndScore(state, "Ancestral Imager");
  takeCredits(state, "corp");
  const grip = getRunner(state).hand.length;
  runOn(state, "hq");
  runJackOut(state);
  expect(getRunner(state).hand.length).toBe(grip - 1);
});

it("AR-Enhanced Security", () => {
  const state = newGame({ corp: { deck: ["AR-Enhanced Security", qty("NGO Front", 3)] } });
  gain(state, "corp", "click", 10, "credit", 10);
  gain(state, "runner", "credit", 10);
  for (let i = 0; i < 3; i++) {
    playFromHand(state, "corp", "NGO Front", "New remote");
  }
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
  expect(getCorp(state).discard.length).toBe(1);
  expect(countTags(state)).toBe(0);
  takeCredits(state, "runner");
  playAndScore(state, "AR-Enhanced Security");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 2");
  clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
  expect(getCorp(state).discard.length).toBe(2);
  expect(countTags(state)).toBe(1);
  runEmptyServer(state, "Server 3");
  clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
  expect(getCorp(state).discard.length).toBe(3);
  expect(countTags(state)).toBe(1);
});

it("Architect Deployment Test", () => {
  const state = newGame({ corp: { deck: [qty("Architect Deployment Test", 5), "Oaktown Renovation", "Enigma", "Rashida Jaheem"] } });
  startingHand(state, "corp", Array(5).fill("Architect Deployment Test"));
  gain(state, "corp", "click", 4);
  playAndScore(state, "Architect Deployment Test");
  clickPrompt(state, "corp", "OK");
  clickPrompt(state, "corp", "Enigma");
  changed(() => getCorp(state).credit, 0, () => {
    clickPrompt(state, "corp", "New remote");
  });
  expect(faceup(getIce(state, "remote2", 0))).toBe(true);
  playAndScore(state, "Architect Deployment Test");
  clickPrompt(state, "corp", "OK");
  clickPrompt(state, "corp", "Cancel");
  expect(noPrompt(state, "corp")).toBe(true);
  playAndScore(state, "Architect Deployment Test");
  clickPrompt(state, "corp", "OK");
  clickPrompt(state, "corp", "Rashida Jaheem");
  changed(() => getCorp(state).credit, 0, () => {
    clickPrompt(state, "corp", "Server 2");
  });
  expect(faceup(getContent(state, "remote2", 0))).toBe(true);
  playAndScore(state, "Architect Deployment Test");
  clickPrompt(state, "corp", "OK");
  clickPrompt(state, "corp", "Oaktown Renovation");
  clickPrompt(state, "corp", "New remote");
  expect(getContent(state, "remote6", 0).title).toBe("Oaktown Renovation");
  expect(faceup(getContent(state, "remote6", 0))).toBe(true);
  playAndScore(state, "Architect Deployment Test");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Armed Intimidation", () => {
  const state = newGame({
    corp: { deck: [qty("Armed Intimidation", 2)] },
    runner: { deck: [qty("Sure Gamble", 3), qty("Diesel", 2)] },
  });
  playAndScore(state, "Armed Intimidation");
  clickPrompt(state, "runner", "Take 2 tags");
  expect(countTags(state)).toBe(2);
  playAndScore(state, "Armed Intimidation");
  expect(getRunner(state).hand.length).toBe(5);
  clickPrompt(state, "runner", "Suffer 5 meat damage");
  expect(getRunner(state).hand.length).toBe(0);
});

it("Armed Intimidation & Malapert Data Vault - ordering 1", () => {
  const state = newGame({
    corp: { hand: ["Armed Intimidation", "Malapert Data Vault"], deck: ["Hedge Fund"] },
    runner: { deck: [qty("Sure Gamble", 3), qty("Diesel", 2)] },
  });
  playFromHand(state, "corp", "Malapert Data Vault", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  playFromHand(state, "corp", "Armed Intimidation", "Server 1");
  const ai = getContent(state, "remote1", 1);
  scoreAgenda(state, "corp", refresh(state, ai));
  clickPrompt(state, "corp", "Armed Intimidation");
  clickPrompt(state, "runner", "Suffer 5 meat damage");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "corp", "Hedge Fund");
});

it("Armed Intimidation & Malapert Data Vault - ordering 2", () => {
  const state = newGame({
    corp: { hand: ["Armed Intimidation", "Malapert Data Vault"], deck: ["Hedge Fund"] },
    runner: { deck: [qty("Sure Gamble", 3), qty("Diesel", 2)] },
  });
  playFromHand(state, "corp", "Malapert Data Vault", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  playFromHand(state, "corp", "Armed Intimidation", "Server 1");
  const ai = getContent(state, "remote1", 1);
  scoreAgenda(state, "corp", refresh(state, ai));
  clickPrompt(state, "corp", "Malapert Data Vault");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "corp", "Hedge Fund");
  clickPrompt(state, "runner", "Suffer 5 meat damage");
});

it("Armored Servers - should write to the log", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Armored Servers"] } });
  playAndScore(state, "Armored Servers");
  const asScored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, asScored), "agenda")).toBe(1);
  takeCredits(state, "corp");
  runOn(state, "HQ");
  cardAbility(state, "corp", asScored, 0);
  expect(lastLogContains(state, "make the Runner trash")).toBe(true);
});

it("Armored Servers - icebreaker breaks 1 sub at a time", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Armored Servers", "Ice Wall"], credits: 20 },
    runner: { hand: ["Corroder", "Sure Gamble"] },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playAndScore(state, "Armored Servers");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  runOn(state, "HQ");
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  clickCard(state, "runner", "Sure Gamble");
  expect(findCard("Sure Gamble", getRunner(state).discard)).toBeTruthy();
});

it("Armored Servers - icebreaker breaks more than 1 sub at a time", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Armored Servers", "Battlement"], credits: 20 },
    runner: { hand: ["Berserker", "Sure Gamble", "Easy Mark"], credits: 20 },
  });
  playFromHand(state, "corp", "Battlement", "HQ");
  playAndScore(state, "Armored Servers");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Berserker");
  runOn(state, "HQ");
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  clickPrompt(state, "runner", "End the run");
  clickCard(state, "runner", "Sure Gamble");
  clickCard(state, "runner", "Easy Mark");
  expect(findCard("Sure Gamble", getRunner(state).discard)).toBeTruthy();
  expect(findCard("Easy Mark", getRunner(state).discard)).toBeTruthy();
});

it("Armored Servers - when jacking out", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Armored Servers", "Ice Wall"] },
    runner: { hand: ["Corroder", "Sure Gamble"] },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playAndScore(state, "Armored Servers");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  runOn(state, "HQ");
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  rez(state, "corp", getIce(state, "hq", 0));
  runContinueUntil(state, "movement");
  runJackOut(state);
  clickCard(state, "runner", "Sure Gamble");
  expect(findCard("Sure Gamble", getRunner(state).discard)).toBeTruthy();
});

it("Armored Servers - when spending multiple counters", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: [qty("Armored Servers", 2), "Ice Wall"], credits: 20 },
    runner: { hand: ["Corroder", "Sure Gamble", "Easy Mark"], credits: 20 },
  });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playAndScore(state, "Armored Servers");
  playAndScore(state, "Armored Servers");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  runOn(state, "HQ");
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  cardAbility(state, "corp", getScored(state, "corp", 1), 0);
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  clickCard(state, "runner", "Sure Gamble");
  clickCard(state, "runner", "Easy Mark");
  expect(findCard("Sure Gamble", getRunner(state).discard)).toBeTruthy();
  expect(findCard("Easy Mark", getRunner(state).discard)).toBeTruthy();
});

it("AstroScript Pilot Program - token placement", () => {
  const state = newGame({ corp: { deck: [qty("AstroScript Pilot Program", 3), qty("Ice Wall", 2)] } });
  gain(state, "corp", "click", 3);

  const tryPlace = (from: any, to: any) => {
    cardAbility(state, "corp", refresh(state, from), 0);
    clickCard(state, "corp", refresh(state, to));
  };
  const shouldNotPlace = (from: any, to: any) => {
    tryPlace(from, to);
    clickPrompt(state, "corp", "Done");
    expect(getCounters(refresh(state, from), "agenda")).toBe(1);
    expect(getCounters(refresh(state, to), "advancement")).toBe(0);
  };
  const shouldPlace = (from: any, to: any) => {
    tryPlace(from, to);
    expect(getCounters(refresh(state, from), "agenda")).toBe(0);
    expect(getCounters(refresh(state, to), "advancement")).toBe(1);
  };

  playAndScore(state, "AstroScript Pilot Program");
  playFromHand(state, "corp", "AstroScript Pilot Program", "New remote");
  const scoredAstro = getScored(state, "corp", 0);
  const installedAstro = getContent(state, "remote2", 0);
  const handAstro = findCard("AstroScript Pilot Program", getCorp(state).hand);
  shouldNotPlace(scoredAstro, handAstro);
  shouldPlace(scoredAstro, installedAstro);
  advance(state, installedAstro, 2);
  score(state, "corp", refresh(state, installedAstro));

  playFromHand(state, "corp", "Ice Wall", "HQ");
  const noTokenAstro = getScored(state, "corp", 0);
  const tokenAstro = getScored(state, "corp", 1);
  const handIceWall = findCard("Ice Wall", getCorp(state).hand);
  const installedIceWall = getIce(state, "hq", 0);
  shouldNotPlace(tokenAstro, noTokenAstro);
  shouldNotPlace(tokenAstro, handIceWall);
  shouldPlace(tokenAstro, installedIceWall);
});

it("Artificial Cryptocrash", () => {
  const state = newGame({
    corp: { hand: [qty("Artificial Cryptocrash", 2)] },
    runner: { credits: 9 },
  });
  changed(() => getRunner(state).credit, -7, () => {
    playAndScore(state, "Artificial Cryptocrash");
  });
  changed(() => getRunner(state).credit, -2, () => {
    playAndScore(state, "Artificial Cryptocrash");
  });
});

it("Award Bait", () => {
  const state = newGame({ corp: { deck: [qty("Award Bait", 2), "Ice Wall"] } });
  move(state, "corp", findCard("Award Bait", getCorp(state).hand), "deck");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  const iw = getIce(state, "hq", 0);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
  playFromHand(state, "corp", "Award Bait", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "corp", "2");
  clickCard(state, "corp", "Ice Wall");
  clickPrompt(state, "runner", "Steal");
  expect(getCounters(refresh(state, iw), "advancement")).toBe(2);
  runEmptyServer(state, "R&D");
  clickPrompt(state, "corp", "2");
  clickCard(state, "corp", refresh(state, iw));
  clickPrompt(state, "runner", "Steal");
  expect(getCounters(refresh(state, iw), "advancement")).toBe(4);
});

it("Azef Protocol - happy path", () => {
  const state = newGame({
    corp: { hand: ["Azef Protocol", "PAD Campaign"] },
    runner: { hand: ["Sure Gamble", "Sure Gamble", "Sure Gamble"] },
  });
  playFromHand(state, "corp", "Azef Protocol", "New remote");
  playFromHand(state, "corp", "PAD Campaign", "New remote");
  addProp(state, "corp", makeEid(state), getContent(state, "remote1", 0), "advanceCounter", 3);
  score(state, "corp", getContent(state, "remote1", 0));
  expect(getCorp(state).scored.length).toBe(0);
  expect(noPrompt(state, "corp")).toBe(false);
  clickCard(state, "corp", "PAD Campaign");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(getRunner(state).discard.length).toBe(2);
  expect(getCorp(state).discard.length).toBe(1);
  expect(getCorp(state).scored.length).toBe(1);
});

it("Azef Protocol - requires valid target", () => {
  const state = newGame({
    corp: { hand: ["Azef Protocol", "PAD Campaign"], credits: 100 },
    runner: { hand: ["Sure Gamble", "Sure Gamble", "Sure Gamble"] },
  });
  playFromHand(state, "corp", "Azef Protocol", "New remote");
  const azef = getContent(state, "remote1", 0);
  gain(state, "corp", "click", 3);
  advance(state, refresh(state, azef), 3);
  score(state, "corp", refresh(state, azef));
  expect(getCorp(state).scored.length).toBe(0);
  expect(noPrompt(state, "corp")).toBe(true);
  expect(getCorp(state).discard.length).toBe(0);
});

it("Azef Protocol - can't target self", () => {
  const state = newGame({
    corp: { hand: ["Azef Protocol", "PAD Campaign"] },
    runner: { hand: ["Sure Gamble", "Sure Gamble", "Sure Gamble"] },
  });
  playFromHand(state, "corp", "Azef Protocol", "New remote");
  playFromHand(state, "corp", "PAD Campaign", "New remote");
  addProp(state, "corp", makeEid(state), getContent(state, "remote1", 0), "advanceCounter", 3);
  score(state, "corp", getContent(state, "remote1", 0));
  expect(getCorp(state).scored.length).toBe(0);
  expect(noPrompt(state, "corp")).toBe(false);
  clickCard(state, "corp", getContent(state, "remote1", 0));
  expect(getCorp(state).scored.length).toBe(0);
  expect(noPrompt(state, "corp")).toBe(false);
  expect(getRunner(state).discard.length).toBe(0);
  expect(getCorp(state).discard.length).toBe(0);
});

it("Bacterial Programming - stolen from archives no duplicate accesses", () => {
  const state = newGame({
    corp: {
      discard: ["Hedge Fund", "Bacterial Programming"],
      hand: ["Bellona"],
      deck: ["IPO", "NGO Front", "Rashida Jaheem", "Tithe", "Ice Wall", "Fire Wall", "Enigma"],
    },
  });
  takeCredits(state, "corp");
  runEmptyServer(state, "archives");
  clickPrompt(state, "runner", "Bacterial Programming");
  clickPrompt(state, "runner", "Steal");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "corp", "OK");
  for (let i = 0; i < 7; i++) {
    const card = promptTitles(state, "corp")[0];
    clickPrompt(state, "corp", card);
  }
  clickPrompt(state, "corp", "OK");
  for (let i = 0; i < 7; i++) {
    clickPrompt(state, "runner", "Facedown card in Archives");
    clickPrompt(state, "runner", "No action");
  }
  expect(noPrompt(state, "corp")).toBe(true);
  expect(state.run).toBeFalsy();
});

it("Bacterial Programming - scoring should not cause a run to exist for runner", () => {
  const state = newGame({ corp: { deck: ["Bacterial Programming", "Hedge Fund"] } });
  startingHand(state, "corp", ["Bacterial Programming"]);
  playAndScore(state, "Bacterial Programming");
  clickPrompts(state, "corp", "Yes", "OK", "Done", "Done");
  clickPrompt(state, "corp", getCorp(state).setAside[0]);
  clickPrompt(state, "corp", "OK");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(state.run).toBeFalsy();
});

it("Bacterial Programming - removing all cards from R&D should not freeze", () => {
  const state = newGame({
    corp: { hand: ["Bacterial Programming"], deck: ["Bacterial Programming", qty("Vanilla", 7)] },
    options: { startAs: "runner" },
  });
  stackDeck(state, "corp", ["Bacterial Programming"]);
  runEmptyServer(state, "rd");
  clickPrompt(state, "runner", "Steal");
  clickPrompts(state, "corp", "Yes", "OK");
  for (let i = 0; i < 7; i++) {
    clickPrompt(state, "corp", "Vanilla");
  }
  clickPrompt(state, "corp", "OK");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(noPrompt(state, "runner")).toBe(true);
  expect(state.run).toBeFalsy();
});

it("Bellona", () => {
  const state = newGame({ corp: { deck: ["Bellona"] } });
  playFromHand(state, "corp", "Bellona", "New remote");
  const bell = getContent(state, "remote1", 0);
  advance(state, bell, 2);
  takeCredits(state, "corp");
  lose(state, "runner", "credit", 1);
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).scored.length).toBe(0);
  expect(getRunner(state).credit).toBe(4);
  takeCredits(state, "runner");
  advance(state, bell, 3);
  changed(() => getCorp(state).credit, 5, () => {
    score(state, "corp", refresh(state, bell));
  });
  expect(getCorp(state).agendaPoint).toBe(3);
});

it("Better Citizen Program", () => {
  const state = newGame({
    corp: { deck: ["Better Citizen Program"] },
    runner: { deck: [qty("The Maker's Eye", 2), qty("Wyrm", 2)] },
  });
  playAndScore(state, "Better Citizen Program");
  takeCredits(state, "corp");
  gain(state, "runner", "credit", 10);
  expect(countTags(state)).toBe(0);
  playFromHand(state, "runner", "The Maker's Eye");
  clickPrompt(state, "corp", "Yes");
  expect(countTags(state)).toBe(1);
  runContinue(state);
  runJackOut(state);
  playFromHand(state, "runner", "Wyrm");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(countTags(state)).toBe(1);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Wyrm");
  clickPrompt(state, "corp", "Yes");
  expect(countTags(state)).toBe(2);
  playFromHand(state, "runner", "The Maker's Eye");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(countTags(state)).toBe(2);
});

it("Better Citizen Program - should only trigger on Run events #3619", () => {
  const state = newGame({
    corp: { deck: ["Better Citizen Program"] },
    runner: { deck: ["Mining Accident"] },
  });
  playAndScore(state, "Better Citizen Program");
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  playFromHand(state, "runner", "Mining Accident");
  clickPrompt(state, "corp", "Pay 5 [Credits]");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(countTags(state)).toBe(0);
});

it("Better Citizen Program - shouldn't trigger Apex #5175", () => {
  const state = newGame({
    corp: { deck: ["Better Citizen Program"] },
    runner: { id: "Apex: Invasive Predator", deck: ["Wyrm"] },
  });
  playAndScore(state, "Better Citizen Program");
  takeCredits(state, "corp");
  endPhase12(state, "runner");
  clickCard(state, "runner", "Wyrm");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Bifrost Array", () => {
  const state = newGame({ corp: { deck: ["Bifrost Array", "Hostile Takeover"] } });
  playAndScore(state, "Hostile Takeover");
  expect(getCorp(state).credit).toBe(12);
  expect(countBadPub(state)).toBe(1);
  playAndScore(state, "Bifrost Array");
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", "Hostile Takeover");
  expect(getCorp(state).credit).toBe(19);
  expect(countBadPub(state)).toBe(2);
});

it("Blood in the Water", () => {
  const state = newGame({
    corp: { hand: ["Blood in the Water"] },
    runner: { hand: [qty("Sure Gamble", 4)] },
  });
  playFromHand(state, "corp", "Blood in the Water", "New remote");
  const blood = getContent(state, "remote1", 0);
  addProp(state, "corp", makeEid(state), blood, "advanceCounter", 2);
  score(state, "corp", refresh(state, blood));
  expect(getCorp(state).agendaPoint).toBe(0);
  damage(state, "corp", "net", 1);
  score(state, "corp", refresh(state, blood));
  expect(getCorp(state).agendaPoint).toBe(0);
  damage(state, "corp", "net", 1);
  score(state, "corp", refresh(state, blood));
  expect(getCorp(state).agendaPoint).toBe(2);
});

it("Brain Rewiring", () => {
  const state = newGame({ corp: { deck: ["Brain Rewiring"] } });
  startingHand(state, "runner", ["Sure Gamble", "Sure Gamble"]);
  playAndScore(state, "Brain Rewiring");
  clickPrompt(state, "corp", "Yes");
  expect(noPrompt(state, "runner")).toBe(false);
  clickPrompt(state, "corp", "2");
  expect(getRunner(state).hand.length).toBe(1);
  expect(noPrompt(state, "runner")).toBe(true);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Braintrust", () => {
  const state = newGame({ corp: { deck: ["Braintrust", "Ichi 1.0"] } });
  playFromHand(state, "corp", "Braintrust", "New remote");
  const bt = getContent(state, "remote1", 0);
  addProp(state, "corp", makeEid(state), bt, "advanceCounter", 7);
  score(state, "corp", refresh(state, bt));
  const scoredBt = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, scoredBt), "agenda")).toBe(2);
  playFromHand(state, "corp", "Ichi 1.0", "HQ");
  rez(state, "corp", getIce(state, "hq", 0));
  expect(getCorp(state).credit).toBe(2);
});

it("Breaking News", () => {
  const state = newGame({ corp: { deck: [qty("Breaking News", 3)] } });
  playAndScore(state, "Breaking News");
  expect(countTags(state)).toBe(2);
  takeCredits(state, "corp");
  expect(countTags(state)).toBe(0);
});

it("Broad Daylight - take bad pub", () => {
  const state = newGame({ corp: { deck: [qty("Broad Daylight", 3)] } });
  expect(countBadPub(state)).toBe(0);
  playAndScore(state, "Broad Daylight");
  clickPrompt(state, "corp", "Yes");
  expect(countBadPub(state)).toBe(1);
  expect(getCounters(getScored(state, "corp", 0), "agenda")).toBe(1);
  playAndScore(state, "Broad Daylight");
  clickPrompt(state, "corp", "No");
  expect(countBadPub(state)).toBe(1);
  expect(getCounters(getScored(state, "corp", 1), "agenda")).toBe(1);
  playAndScore(state, "Broad Daylight");
  clickPrompt(state, "corp", "Yes");
  expect(countBadPub(state)).toBe(2);
  expect(getCounters(getScored(state, "corp", 2), "agenda")).toBe(2);
});

it("Broad Daylight - deal damage", () => {
  const state = newGame({ corp: { deck: ["Broad Daylight"] } });
  gain(state, "corp", "badPublicity", 3);
  playAndScore(state, "Broad Daylight");
  clickPrompt(state, "corp", "Yes");
  expect(countBadPub(state)).toBe(4);
  expect(getCounters(getScored(state, "corp", 0), "agenda")).toBe(4);
  expect(getRunner(state).discard.length).toBe(0);
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  expect(getRunner(state).discard.length).toBe(2);
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  expect(getRunner(state).discard.length).toBe(2);
});

it("Broad Daylight - bad pub triggers", () => {
  const state = newGame({ corp: { deck: ["Broad Daylight", "Broadcast Square"] } });
  gain(state, "corp", "badPublicity", 1);
  playFromHand(state, "corp", "Broadcast Square", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  expect(countBadPub(state)).toBe(1);
  playAndScore(state, "Broad Daylight");
  clickPrompt(state, "corp", "Yes");
  expect(countBadPub(state)).toBe(1);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(countBadPub(state)).toBe(1);
  expect(getCounters(getScored(state, "corp", 0), "agenda")).toBe(1);
});

it("Broad Daylight - bad pub triggers more cases", () => {
  const state = newGame({ corp: { deck: ["Broad Daylight", "Broadcast Square"] } });
  gain(state, "corp", "badPublicity", 1);
  playFromHand(state, "corp", "Broadcast Square", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  expect(countBadPub(state)).toBe(1);
  playAndScore(state, "Broad Daylight");
  clickPrompt(state, "corp", "Yes");
  expect(countBadPub(state)).toBe(1);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "5");
  expect(countBadPub(state)).toBe(2);
  expect(getCounters(getScored(state, "corp", 0), "agenda")).toBe(2);
});

it("Broad Daylight - interaction with Titan", () => {
  const state = newGame({
    corp: { id: "Titan Transnational: Investing In Your Future", deck: [qty("Broad Daylight", 3)] },
  });
  expect(countBadPub(state)).toBe(0);
  playAndScore(state, "Broad Daylight");
  clickPrompt(state, "corp", "No");
  expect(countBadPub(state)).toBe(0);
  expect(getCounters(getScored(state, "corp", 0), "agenda")).toBe(1);
  playAndScore(state, "Broad Daylight");
  clickPrompt(state, "corp", "Yes");
  expect(countBadPub(state)).toBe(1);
  expect(getCounters(getScored(state, "corp", 1), "agenda")).toBe(2);
});

it("Broad Daylight - interaction with Storgotic Resonator #5194", () => {
  const state = newGame({
    corp: { deck: ["Broad Daylight", "Storgotic Resonator"] },
    runner: { id: "Reina Roja: Freedom Fighter", hand: [qty("Stimhack", 5)] },
  });
  playFromHand(state, "corp", "Storgotic Resonator", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  playAndScore(state, "Broad Daylight");
  clickPrompt(state, "corp", "Yes");
  expect(getCounters(getScored(state, "corp", 0), "agenda")).toBe(1);
  expect(getRunner(state).discard.length).toBe(0);
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  expect(getRunner(state).discard.length).toBe(2);
  expect(getCounters(getContent(state, "remote1", 0), "power")).toBe(1);
});

it("CFC Excavation Contract", () => {
  for (let n = 0; n < 5; n++) {
    const state = newGame({ corp: { deck: ["CFC Excavation Contract", qty("Eli 1.0", n)] } });
    gain(state, "corp", "click", 10, "credit", 10);
    expect(getCorp(state).credit).toBe(15);
    for (let i = 0; i < n; i++) {
      playFromHand(state, "corp", "Eli 1.0", "New remote");
      rez(state, "corp", getIce(state, `remote${i + 1}` as any, 0));
    }
    const credit = getCorp(state).credit;
    playAndScore(state, "CFC Excavation Contract");
    expect(getCorp(state).credit).toBe(credit + 2 * n);
  }
});

it("Character Assassination", () => {
  const state = newGame({
    corp: { deck: ["Character Assassination"] },
    runner: { deck: ["Fall Guy", "Kati Jones"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Kati Jones");
  playFromHand(state, "runner", "Fall Guy");
  takeCredits(state, "runner");
  playAndScore(state, "Character Assassination");
  const kati = getResource(state, 0);
  clickCard(state, "corp", kati);
  expect(noPrompt(state, "runner")).toBe(true);
  expect(getRunner(state).discard.length).toBe(1);
});

it("Chronos Project - happy path", () => {
  const state = newGame({ corp: { deck: ["Chronos Project"] } });
  for (let i = 0; i < 3; i++) {
    move(state, "runner", findCard("Sure Gamble", getRunner(state).hand), "discard");
  }
  expect(getRunner(state).discard.length).toBe(3);
  playAndScore(state, "Chronos Project");
  expect(getRunner(state).discard.length).toBe(0);
});

it("Chronos Project - heap locked", () => {
  const state = newGame({
    corp: { deck: ["Chronos Project", "Blacklist", "Biotic Labor"], credits: 20 },
  });
  for (let i = 0; i < 3; i++) {
    move(state, "runner", findCard("Sure Gamble", getRunner(state).hand), "discard");
  }
  expect(getRunner(state).discard.length).toBe(3);
  playFromHand(state, "corp", "Biotic Labor");
  playFromHand(state, "corp", "Blacklist", "New remote");
  rez(state, "corp", refresh(state, getContent(state, "remote1", 0)));
  playAndScore(state, "Chronos Project");
  expect(getRunner(state).discard.length).toBe(3);
});

it("City Works Project", () => {
  const state = newGame({
    corp: { deck: ["City Works Project"] },
    runner: { deck: [qty("Sure Gamble", 4)] },
  });
  playFromHand(state, "corp", "City Works Project", "New remote");
  const cwp = getContent(state, "remote1", 0);
  clickAdvance(state, "corp", refresh(state, cwp));
  clickAdvance(state, "corp", refresh(state, cwp));
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).discard.length).toBe(4);
});

it("Clone Retirement", () => {
  const state = newGame({ corp: { deck: [qty("Clone Retirement", 2), "Hostile Takeover"] } });
  playAndScore(state, "Hostile Takeover");
  expect(getCorp(state).credit).toBe(12);
  expect(countBadPub(state)).toBe(1);
  playAndScore(state, "Clone Retirement");
  expect(countBadPub(state)).toBe(0);
  playFromHand(state, "corp", "Clone Retirement", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 3");
  clickPrompt(state, "runner", "Steal");
  expect(countBadPub(state)).toBe(1);
});

it("Corporate Sales Team", () => {
  const state = newGame({ corp: { deck: [qty("Corporate Sales Team", 2)] } });
  expect(getCorp(state).credit).toBe(5);
  playAndScore(state, "Corporate Sales Team");
  expect(getCorp(state).credit).toBe(5);
  const scoredCst = getScored(state, "corp", 0);
  endTurn(state, "corp");
  startTurn(state, "runner");
  expect(getCorp(state).credit).toBe(6);
  expect(getCounters(refresh(state, scoredCst), "credit")).toBe(9);
  endTurn(state, "runner");
  startTurn(state, "corp");
  expect(getCorp(state).credit).toBe(7);
  expect(getCounters(refresh(state, scoredCst), "credit")).toBe(8);
});

it("Corporate War", () => {
  const state = newGame({ corp: { deck: [qty("Corporate War", 2)] } });
  expect(getCorp(state).credit).toBe(5);
  playAndScore(state, "Corporate War");
  expect(getCorp(state).credit).toBe(0);
  gain(state, "corp", "credit", 7);
  playAndScore(state, "Corporate War");
  expect(getCorp(state).credit).toBe(14);
});

it("Crisis Management", () => {
  const state = newGame({ corp: { deck: ["Crisis Management"] } });
  playAndScore(state, "Crisis Management");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getRunner(state).hand.length).toBe(3);
  takeCredits(state, "corp");
  gainTags(state, "runner", 1);
  takeCredits(state, "runner");
  expect(getRunner(state).hand.length).toBe(2);
});

it("Cyberdex Sandbox", () => {
  const state = newGame({ corp: { deck: ["Cyberdex Virus Suite", "Cyberdex Sandbox", "Cyberdex Trial"] } });
  playAndScore(state, "Cyberdex Sandbox");
  gain(state, "corp", "click", 10);
  changed(() => getCorp(state).credit, 4, () => {
    clickPrompt(state, "corp", "Yes");
  });
  changed(() => getCorp(state).credit, 0, () => {
    purge(state, "corp");
  });
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  changed(() => getCorp(state).credit, 4, () => {
    playFromHand(state, "corp", "Cyberdex Trial");
  });
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  playFromHand(state, "corp", "Cyberdex Virus Suite", "HQ");
  const cvs = getContent(state, "hq", 0);
  rez(state, "corp", cvs);
  changed(() => getCorp(state).credit, 4, () => {
    cardAbility(state, "corp", cvs, 0);
  });
});

it("Cyberdex Sandbox - only triggers on first purge each turn #5174", () => {
  const state = newGame({ corp: { deck: ["Cyberdex Virus Suite", "Cyberdex Sandbox", "Cyberdex Trial"] } });
  gain(state, "corp", "click", 10);
  purge(state, "corp");
  playAndScore(state, "Cyberdex Sandbox");
  changed(() => getCorp(state).credit, 0, () => {
    clickPrompt(state, "corp", "Yes");
  });
});

it("Dedicated Neural Net - corp chooses card to access #4874", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Dedicated Neural Net", "Government Takeover", "Domestic Sleepers"] },
  });
  playAndScore(state, "Dedicated Neural Net");
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "0 [Credits]");
  clickPrompt(state, "corp", "1 [Credits]");
  clickCard(state, "corp", "Domestic Sleepers");
  clickPrompt(state, "runner", "Steal");
  expect(getCorp(state).hand[0].title).toBe("Government Takeover");
  expect(getRunner(state).scored[0].title).toBe("Domestic Sleepers");
});

it("Dedicated Neural Net - allows for accessing upgrades #2376", () => {
  const state = newGame({
    corp: { deck: ["Dedicated Neural Net", qty("Scorched Earth", 2), "Hedge Fund", "Caprice Nisei"] },
  });
  playFromHand(state, "corp", "Caprice Nisei", "HQ");
  playAndScore(state, "Dedicated Neural Net");
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "0 [Credits]");
  clickPrompt(state, "corp", "1 [Credits]");
  clickPrompt(state, "runner", "Card from hand");
  clickCard(state, "corp", "Hedge Fund");
  expect(accessing(state, "Hedge Fund")).toBe(true);
  clickPrompt(state, "runner", "No action");
  expect(accessing(state, "Caprice Nisei")).toBe(true);
  clickPrompt(state, "runner", "No action");
  expect(state.run).toBeFalsy();
});

it("Dedicated Neural Net - multiaccess works properly", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Dedicated Neural Net", "Government Takeover", "Domestic Sleepers"] },
    runner: { hand: ["HQ Interface"] },
  });
  playAndScore(state, "Dedicated Neural Net");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "HQ Interface");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "0 [Credits]");
  clickPrompt(state, "corp", "1 [Credits]");
  clickCard(state, "corp", "Domestic Sleepers");
  clickPrompt(state, "runner", "Steal");
  clickCard(state, "corp", "Government Takeover");
  clickPrompt(state, "runner", "Steal");
});

it("Dedicated Neural Net - multiaccess respects cards in hand", () => {
  const state = newGame({
    corp: { hand: ["Dedicated Neural Net", "Mwanza City Grid", "Domestic Sleepers", "Hedge Fund", "Ice Wall"] },
    runner: { hand: ["HQ Interface"] },
  });
  playAndScore(state, "Dedicated Neural Net");
  playFromHand(state, "corp", "Mwanza City Grid", "HQ");
  rez(state, "corp", getContent(state, "hq", 0));
  takeCredits(state, "corp");
  playFromHand(state, "runner", "HQ Interface");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "0 [Credits]");
  clickPrompt(state, "corp", "1 [Credits]");
  clickPrompt(state, "runner", "Mwanza City Grid");
  clickPrompt(state, "runner", "No action");
  clickCard(state, "corp", "Hedge Fund");
  clickPrompt(state, "runner", "No action");
  clickCard(state, "corp", "Ice Wall");
  clickPrompt(state, "runner", "No action");
  clickCard(state, "corp", "Domestic Sleepers");
  clickPrompt(state, "runner", "Steal");
  expect(noPrompt(state, "runner")).toBe(true);
  expect(noPrompt(state, "corp")).toBe(true);
  expect(state.run).toBeFalsy();
});

it("Dedicated Neural Net - can access upgrades between cards in hand", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Dedicated Neural Net", "Ice Wall", "Enigma", "Caprice Nisei"] },
    runner: { hand: ["HQ Interface"] },
  });
  playFromHand(state, "corp", "Caprice Nisei", "HQ");
  playAndScore(state, "Dedicated Neural Net");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "HQ Interface");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "0 [Credits]");
  clickPrompt(state, "corp", "1 [Credits]");
  clickPrompt(state, "runner", "Card from hand");
  clickCard(state, "corp", "Enigma");
  clickPrompt(state, "runner", "No action");
  clickPrompt(state, "runner", "Unrezzed upgrade");
  clickPrompt(state, "runner", "No action");
  clickCard(state, "corp", "Ice Wall");
  clickPrompt(state, "runner", "No action");
});

it("Dedicated Neural Net - first time each turn", () => {
  const state = newGame({
    corp: { scoreArea: ["Dedicated Neural Net"], hand: ["Hedge Fund", "IPO"] },
  });
  takeCredits(state, "corp");
  runEmptyServer(state, "hq");
  clickPrompt(state, "corp", "0 [Credits]");
  clickPrompt(state, "runner", "0 [Credits]");
  clickPrompt(state, "runner", "No action");
  runEmptyServer(state, "hq");
  clickPrompt(state, "runner", "No action");
  expect(noPrompt(state, "runner")).toBe(true);
});

it("Degree Mill - basic behavior", () => {
  const state = newGame({
    corp: { deck: [qty("Degree Mill", 2)] },
    runner: { deck: ["Ice Analyzer", "All-nighter", "Hunting Grounds"] },
  });
  playFromHand(state, "corp", "Degree Mill", "New remote");
  takeCredits(state, "corp");
  expect(getRunner(state).deck.length).toBe(0);
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).agendaPoint).toBe(0);
  playFromHand(state, "runner", "Ice Analyzer");
  playFromHand(state, "runner", "All-nighter");
  const ia = getResource(state, 0);
  const an = getResource(state, 1);
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Pay to steal");
  clickCard(state, "runner", ia);
  clickCard(state, "runner", an);
  expect(getRunner(state).agendaPoint).toBe(3);
  expect(getResource(state, 0)).toBeFalsy();
  expect(getRunner(state).deck.length).toBe(2);
  takeCredits(state, "runner");
  playFromHand(state, "corp", "Degree Mill", "New remote");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Hunting Grounds");
  const hg = getResource(state, 0);
  runEmptyServer(state, "Server 2");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).agendaPoint).toBe(3);
  cardAbility(state, "runner", hg, 0);
  expect(getRunnerFacedown(state, 0)).toBeTruthy();
  expect(getRunnerFacedown(state, 1)).toBeTruthy();
  expect(getRunner(state).deck.length).toBe(0);
  const fd1 = getRunnerFacedown(state, 0);
  const fd2 = getRunnerFacedown(state, 1);
  runEmptyServer(state, "Server 2");
  clickPrompt(state, "runner", "Pay to steal");
  clickCard(state, "runner", fd1);
  clickCard(state, "runner", fd2);
  expect(getRunner(state).agendaPoint).toBe(6);
  expect(getRunnerFacedown(state, 0)).toBeFalsy();
  expect(getRunner(state).deck.length).toBe(2);
});

it("Degree Mill - multiple steal costs", () => {
  const state = newGame({
    corp: { deck: [qty("Degree Mill", 1), qty("Strongbox", 1)] },
    runner: { deck: [qty("Ice Analyzer", 3), qty("All-nighter", 3)] },
  });
  playFromHand(state, "corp", "Degree Mill", "New remote");
  playFromHand(state, "corp", "Strongbox", "Server 1");
  const dm = getContent(state, "remote1", 0);
  const sb = getContent(state, "remote1", 1);
  rez(state, "corp", sb);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Ice Analyzer");
  playFromHand(state, "runner", "All-nighter");
  runEmptyServer(state, "remote1");
  clickCard(state, "runner", refresh(state, dm));
  expect(getRunner(state).click).toBe(1);
  expect(getResource(state, 0)).toBeTruthy();
  expect(getResource(state, 1)).toBeTruthy();
  clickPrompt(state, "runner", "Pay to steal");
  clickCard(state, "runner", getResource(state, 1));
  clickCard(state, "runner", getResource(state, 0));
  expect(getRunner(state).click).toBe(0);
  expect(getResource(state, 0)).toBeFalsy();
  expect(getScored(state, "runner", 0)).toBeTruthy();
});

it("Director Haas' Pet Project", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Strongbox", "Director Haas' Pet Project", "Adonis Campaign"], discard: ["Eli 1.0"] },
  });
  playAndScore(state, "Director Haas' Pet Project");
  changed(() => getCorp(state).credit, 0, () => {
    clickPrompt(state, "corp", "Yes");
    clickCard(state, "corp", "Adonis Campaign");
    clickCard(state, "corp", "Strongbox");
    clickCard(state, "corp", "Eli 1.0");
    expect(getContent(state, "remote2", 0).title).toBe("Adonis Campaign");
    expect(getContent(state, "remote2", 1).title).toBe("Strongbox");
    expect(getIce(state, "remote2", 0).title).toBe("Eli 1.0");
  });
});

it("Divested Trust", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 10)], hand: ["Hostile Takeover", "Divested Trust"] },
  });
  playAndScore(state, "Divested Trust");
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "Steal");
  expect(getCorp(state).hand.length).toBe(0);
  expect(getCorp(state).agendaPoint).toBe(1);
  expect(getRunner(state).agendaPoint).toBe(1);
  clickPrompt(state, "corp", "Yes");
  expect(getCorp(state).hand[0].title).toBe("Hostile Takeover");
  expect(getCorp(state).scored.length).toBe(0);
  expect(getCorp(state).agendaPoint).toBe(0);
  expect(getRunner(state).agendaPoint).toBe(0);
});

it("Divested Trust - doesn't stop runner from winning #4107", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 10)], hand: ["Government Takeover", "Hostile Takeover", "Divested Trust"], credits: 20 },
  });
  playAndScore(state, "Divested Trust");
  playFromHand(state, "corp", "Government Takeover", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 2");
  clickPrompt(state, "runner", "Steal");
  clickPrompt(state, "corp", "No");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "Steal");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(state.winner).toBe("runner");
  expect(state.reason).toBe("Agenda");
});

it("Divested Trust - interaction with Turntable #4789", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 10)], hand: ["Government Takeover", "Divested Trust"], credits: 20 },
    runner: { hand: ["Turntable"] },
  });
  playAndScore(state, "Divested Trust");
  playFromHand(state, "corp", "Government Takeover", "New remote");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Turntable");
  runEmptyServer(state, "Server 2");
  clickPrompt(state, "runner", "Steal");
  expect(getPromptMap(state, "runner").msg).toBe("Swap Government Takeover for an agenda in the Corp's score area?");
  clickPrompt(state, "runner", "Yes");
  clickCard(state, "runner", "Divested Trust");
  clickPrompt(state, "corp", "Yes");
  expect(getCorp(state).agendaPoint).toBe(0);
  expect(getRunner(state).agendaPoint).toBe(0);
  expect(getCorp(state).scored.length).toBe(0);
  expect(getRunner(state).scored.length).toBe(0);
  expect(findCard("Divested Trust", getCorp(state).rfg)).toBeTruthy();
  expect(findCard("Government Takeover", getCorp(state).hand)).toBeTruthy();
});

it("Domestic Sleepers - ability changes points", () => {
  const state = newGame({ corp: { deck: ["Domestic Sleepers"] } });
  playAndScore(state, "Domestic Sleepers");
  gain(state, "corp", "click", 3);
  const dsScored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, dsScored), "agenda")).toBe(0);
  expect(getCorp(state).agendaPoint).toBe(0);
  cardAbility(state, "corp", dsScored, 0);
  expect(getCounters(refresh(state, dsScored), "agenda")).toBe(1);
  expect(getCorp(state).agendaPoint).toBe(1);
});

it("Domestic Sleepers - interaction with Mark Yale #2920", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Domestic Sleepers", "Mark Yale"], credits: 10 },
  });
  gain(state, "corp", "click", 5);
  playFromHand(state, "corp", "Mark Yale", "New remote");
  playAndScore(state, "Domestic Sleepers");
  const sleepers = getScored(state, "corp", 0);
  const yale = getContent(state, "remote1", 0);
  cardAbility(state, "corp", sleepers, 0);
  rez(state, "corp", yale);
  cardAbility(state, "corp", yale, 1);
  clickCard(state, "corp", "Domestic Sleepers");
  expect(getCorp(state).agendaPoint).toBe(0);
});

it("Élivágar Bifurcation", () => {
  const state = newGame({ corp: { hand: ["Élivágar Bifurcation", "Ice Wall"] } });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  const iwall = getIce(state, "hq", 0);
  rez(state, "corp", iwall);
  playAndScore(state, "Élivágar Bifurcation");
  clickCard(state, "corp", refresh(state, iwall));
  expect(rezzed(refresh(state, iwall))).toBe(false);
});

it("Élivágar Bifurcation - declined", () => {
  const state = newGame({ corp: { hand: ["Élivágar Bifurcation"] } });
  playAndScore(state, "Élivágar Bifurcation");
  clickPrompt(state, "corp", "Done");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Eden Fragment", () => {
  const state = newGame({ corp: { deck: [qty("Eden Fragment", 3), qty("Ice Wall", 3)] } });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playAndScore(state, "Eden Fragment");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  expect(getIce(state, "hq", 1)).toBeTruthy();
  expect(getCorp(state).credit).toBe(6);
  playFromHand(state, "corp", "Ice Wall", "HQ");
  expect(getIce(state, "hq", 2)).toBeTruthy();
  expect(getCorp(state).credit).toBe(4);
});

it("Efficiency Committee", () => {
  const state = newGame({
    corp: { deck: [qty("Efficiency Committee", 3), qty("Shipment from SanSan", 2), "Ice Wall"] },
  });
  gain(state, "corp", "click", 4);
  playFromHand(state, "corp", "Efficiency Committee", "New remote");
  playFromHand(state, "corp", "Efficiency Committee", "New remote");
  playFromHand(state, "corp", "Efficiency Committee", "New remote");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  const ec1 = getContent(state, "remote1", 0);
  const ec2 = getContent(state, "remote2", 0);
  const ec3 = getContent(state, "remote3", 0);
  const iw = getIce(state, "hq", 0);
  scoreAgenda(state, "corp", ec1);
  const ec1Scored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, ec1Scored), "agenda")).toBe(3);
  expect(getCorp(state).agendaPoint).toBe(2);
  expect(getCorp(state).click).toBe(3);
  cardAbility(state, "corp", ec1Scored, 0);
  expect(getCorp(state).click).toBe(4);
  advance(state, iw);
  expect(getCorp(state).click).toBe(4);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
  advance(state, ec2);
  expect(getCorp(state).click).toBe(4);
  expect(getCounters(refresh(state, ec2), "advancement")).toBe(0);
  playFromHand(state, "corp", "Shipment from SanSan");
  clickPrompt(state, "corp", "2");
  clickCard(state, "corp", ec2);
  expect(getCounters(refresh(state, ec2), "advancement")).toBe(2);
  playFromHand(state, "corp", "Shipment from SanSan");
  clickPrompt(state, "corp", "2");
  clickCard(state, "corp", ec2);
  expect(getCounters(refresh(state, ec2), "advancement")).toBe(4);
  score(state, "corp", refresh(state, ec2));
  expect(getCorp(state).agendaPoint).toBe(4);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  advance(state, iw);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(1);
  advance(state, ec3);
  expect(getCounters(refresh(state, ec3), "advancement")).toBe(1);
});

it("Elective Upgrade", () => {
  const state = newGame({ corp: { deck: ["Elective Upgrade"] } });
  playAndScore(state, "Elective Upgrade");
  const euScored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, euScored), "agenda")).toBe(2);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getCorp(state).click).toBe(3);
  cardAbility(state, "corp", euScored, 0);
  cardAbility(state, "corp", euScored, 0);
  expect(getCorp(state).click).toBe(4);
  expect(getCounters(refresh(state, euScored), "agenda")).toBe(1);
});

it("Embedded Reporting", () => {
  for (let oa = 0; oa < 5; oa++) {
    const state = newGame({
      corp: { hand: ["Embedded Reporting", "Beanstalk Royalties"], deck: ["IPO", qty("Restructure", 15)] },
    });
    playFromHand(state, "corp", "Embedded Reporting", "New remote");
    gain(state, "corp", "click", 10, "credit", 10);
    const gpp = getContent(state, "remote1", 0);
    advance(state, gpp, 3 + oa);
    expect(getCounters(refresh(state, gpp), "advancement")).toBe(3 + oa);
    score(state, "corp", refresh(state, gpp));
    const gppScored = getScored(state, "corp", 0);
    expect(getCounters(refresh(state, gppScored), "agenda")).toBe(2 * oa);
    takeCredits(state, "corp");
    if (oa > 0) {
      changed(() => getCounters(refresh(state, gppScored), "agenda"), -1, () => {
        clickPrompt(state, "corp", "Yes");
        clickPrompt(state, "corp", "IPO");
        expect(isDeckStacked(state, "corp", ["IPO", "Restructure"])).toBe(true);
      });
    }
  }
});

it("Eminent Domain", () => {
  const state = newGame({ corp: { deck: [qty("Archer", 10)], hand: ["Eminent Domain"] } });
  playAndScore(state, "Eminent Domain");
  changed(() => getCorp(state).credit, 0, () => {
    clickPrompt(state, "corp", "Yes");
    clickPrompt(state, "corp", "Archer");
    clickPrompt(state, "corp", "HQ");
    expect(getTitle(getIce(state, "hq", 0))).toBe("Archer");
    expect(rezzed(getIce(state, "hq", 0))).toBe(true);
  });
});

it("Eminent Domain - expend ability", () => {
  const state = newGame({ corp: { hand: ["Eminent Domain", "Pharos", "Tithe", "Ice Wall"] } });
  playFromHand(state, "corp", "Tithe", "HQ");
  changed(() => getCorp(state).credit, -4, () => {
    expend(state, "corp", findCard("Eminent Domain", getCorp(state).hand));
    clickCard(state, "corp", "Eminent Domain");
    clickCard(state, "corp", "Pharos");
    clickPrompt(state, "corp", "HQ");
    expect(getTitle(getIce(state, "hq", 1))).toBe("Pharos");
    expect(rezzed(getIce(state, "hq", 1))).toBe(true);
  });
});

it("Encrypted Portals", () => {
  const state = newGame({ corp: { deck: ["Encrypted Portals", "Lotus Field"] } });
  playFromHand(state, "corp", "Lotus Field", "HQ");
  const lf = getIce(state, "hq", 0);
  rez(state, "corp", lf);
  expect(getStrength(refresh(state, lf))).toBe(4);
  expect(getCorp(state).credit).toBe(0);
  playAndScore(state, "Encrypted Portals");
  expect(getStrength(refresh(state, lf))).toBe(5);
  expect(getCorp(state).credit).toBe(1);
});

it("Escalate Vitriol", () => {
  const state = newGame({ corp: { deck: ["Escalate Vitriol"] } });
  lose(state, "corp", "credit", 5);
  playAndScore(state, "Escalate Vitriol");
  const evScored = getScored(state, "corp", 0);
  for (let tag = 0; tag < 10; tag++) {
    expect(countTags(state)).toBe(0);
    expect(getCorp(state).credit).toBe(0);
    gainTags(state, "runner", tag);
    cardAbility(state, "corp", evScored, 0);
    expect(getCorp(state).credit).toBe(tag);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    lose(state, "corp", "credit", getCorp(state).credit);
    core.loseTags(state, "runner", makeEid(state), tag);
  }
});

it("Executive Retreat", () => {
  const state = newGame({ corp: { deck: ["Executive Retreat", qty("Hedge Fund", 5)] } });
  startingHand(state, "corp", ["Executive Retreat", "Hedge Fund"]);
  expect(getCorp(state).hand.length).toBe(2);
  playAndScore(state, "Executive Retreat");
  expect(getCorp(state).hand.length).toBe(0);
  const erScored = getScored(state, "corp", 0);
  cardAbility(state, "corp", erScored, 0);
  expect(getCorp(state).hand.length).toBe(5);
  expect(getCounters(refresh(state, erScored), "agenda")).toBe(0);
});

it("Executive Retreat - overdraw", () => {
  const state = newGame({ corp: { deck: ["Executive Retreat", qty("Hedge Fund", 4)] } });
  startingHand(state, "corp", ["Executive Retreat", "Hedge Fund"]);
  expect(getCorp(state).hand.length).toBe(2);
  playAndScore(state, "Executive Retreat");
  expect(getCorp(state).hand.length).toBe(0);
  const erScored = getScored(state, "corp", 0);
  cardAbility(state, "corp", erScored, 0);
  expect(getCorp(state).hand.length).toBe(4);
  expect(getCounters(refresh(state, erScored), "agenda")).toBe(0);
  expect(state.winner).toBe("runner");
  expect(state.reason).toBe("Decked");
});

it("Explode-a-palooza", () => {
  const state = newGame({ corp: { deck: ["Explode-a-palooza"] } });
  playFromHand(state, "corp", "Explode-a-palooza", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "runner", "Steal");
  expect(getCorp(state).credit).toBe(12);
});

it("Explode-a-palooza - interaction with Turning Wheel #1717", () => {
  const state = newGame({
    corp: { deck: [qty("Explode-a-palooza", 3)] },
    runner: { deck: ["The Turning Wheel"] },
  });
  startingHand(state, "corp", ["Explode-a-palooza", "Explode-a-palooza"]);
  playFromHand(state, "corp", "Explode-a-palooza", "New remote");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "The Turning Wheel");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "runner", "Steal");
  const ttw = getResource(state, 0);
  expect(getCounters(refresh(state, ttw), "power")).toBe(0);
  expect(getRunner(state).scored.length).toBe(1);
  expect(getCorp(state).credit).toBe(12);
  runEmptyServer(state, "rd");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "runner", "Steal");
  expect(getCounters(refresh(state, ttw), "power")).toBe(0);
  expect(getRunner(state).scored.length).toBe(2);
  expect(getCorp(state).credit).toBe(17);
});

it("False Lead", () => {
  const state = newGame({ corp: { deck: ["False Lead"] } });
  playAndScore(state, "False Lead");
  expect(getCorp(state).scored.length).toBe(1);
  takeCredits(state, "corp");
  expect(getRunner(state).click).toBe(4);
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  expect(getRunner(state).click).toBe(2);
});

it("False Lead - no prompt", () => {
  const state = newGame({ corp: { scoreArea: ["False Lead"] } });
  takeCredits(state, "corp");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("False Lead - yes prompt (Always)", () => {
  const state = newGame({ corp: { scoreArea: ["False Lead"] } });
  cardAbility(state, "corp", getScored(state, "corp", 0), 1);
  clickPrompt(state, "corp", "Always");
  takeCredits(state, "corp");
  changed(() => getRunner(state).click, -2, () => {
    clickPrompt(state, "corp", "Yes");
  });
});

it("False Lead - when tagged prompt fires", () => {
  const state = newGame({ corp: { scoreArea: ["False Lead"] }, runner: { tags: 4 } });
  cardAbility(state, "corp", getScored(state, "corp", 0), 1);
  clickPrompt(state, "corp", "When tagged");
  takeCredits(state, "corp");
  changed(() => getRunner(state).click, -2, () => {
    clickPrompt(state, "corp", "Yes");
  });
});

it("False Lead - when tagged prompt fizzles", () => {
  const state = newGame({ corp: { scoreArea: ["False Lead"] }, runner: { tags: 0 } });
  cardAbility(state, "corp", getScored(state, "corp", 0), 1);
  clickPrompt(state, "corp", "When tagged");
  takeCredits(state, "corp");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Fetal AI", () => {
  const state = newGame({
    corp: { deck: [qty("Fetal AI", 3)] },
    runner: { deck: [qty("Sure Gamble", 3), qty("Diesel", 3), qty("Quality Time", 3)] },
  });
  playFromHand(state, "corp", "Fetal AI", "New remote");
  takeCredits(state, "corp", 2);
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Pay to steal");
  expect(getRunner(state).hand.length).toBe(3);
  expect(getRunner(state).credit).toBe(3);
  expect(getRunner(state).scored.length).toBe(1);
});

it("Fetal AI - can't afford to steal", () => {
  const state = newGame({
    corp: { deck: [qty("Fetal AI", 3)] },
    runner: { deck: [qty("Sure Gamble", 3), qty("Diesel", 3), qty("Quality Time", 3)] },
  });
  playFromHand(state, "corp", "Fetal AI", "New remote");
  takeCredits(state, "corp", 2);
  lose(state, "runner", "credit", 5);
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).hand.length).toBe(3);
  expect(getRunner(state).scored.length).toBe(0);
});

it("Firmware Updates", () => {
  const state = newGame({ corp: { deck: ["Firmware Updates", "Ice Wall"] } });
  playAndScore(state, "Firmware Updates");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  const fu = getScored(state, "corp", 0);
  const iw = getIce(state, "hq", 0);
  expect(getCounters(refresh(state, fu), "agenda")).toBe(3);
  rez(state, "corp", iw);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
  cardAbility(state, "corp", fu, 0);
  clickCard(state, "corp", refresh(state, iw));
  expect(getCounters(refresh(state, fu), "agenda")).toBe(2);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(1);
});

it("Flower Sermon", () => {
  const state = newGame({
    corp: { hand: ["Accelerated Beta Test", "Brainstorm", "Chiyashi", "DNA Tracker", "Excalibur", "Fire Wall", "Flower Sermon"] },
  });
  move(state, "corp", findCard("Accelerated Beta Test", getCorp(state).hand), "deck");
  move(state, "corp", findCard("Brainstorm", getCorp(state).hand), "deck");
  move(state, "corp", findCard("Chiyashi", getCorp(state).hand), "deck");
  move(state, "corp", findCard("DNA Tracker", getCorp(state).hand), "deck");
  move(state, "corp", findCard("Excalibur", getCorp(state).hand), "deck");
  move(state, "corp", findCard("Fire Wall", getCorp(state).hand), "deck");
  playAndScore(state, "Flower Sermon");
  expect(getCorp(state).hand.length).toBe(0);
  const fs = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, fs), "agenda")).toBe(5);
  cardAbility(state, "corp", fs, 0);
  expect(getCorp(state).hand.length).toBe(2);
  clickCard(state, "corp", findCard("Brainstorm", getCorp(state).hand));
  expect(getCorp(state).deck[0].title).toBe("Brainstorm");
  expect(getCounters(refresh(state, fs), "agenda")).toBe(4);
  cardAbility(state, "corp", fs, 0);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Flower Sermon - Hyoubu interaction", () => {
  const state = newGame({
    corp: { id: "Hyoubu Institute: Absolute Clarity", deck: [qty("Hedge Fund", 10)], hand: ["Flower Sermon"] },
  });
  playAndScore(state, "Flower Sermon");
  const fs = getScored(state, "corp", 0);
  const corpCredits = getCorp(state).credit;
  cardAbility(state, "corp", fs, 0);
  expect(getCorp(state).credit).toBe(corpCredits + 1);
});

it("Flower Sermon - DBS interaction", () => {
  const state = newGame({
    corp: { deck: ["Accelerated Beta Test", "Brainstorm", "Chiyashi", "DNA Tracker", "Daily Business Show", "Flower Sermon"] },
  });
  move(state, "corp", findCard("Accelerated Beta Test", getCorp(state).hand), "deck");
  move(state, "corp", findCard("Brainstorm", getCorp(state).hand), "deck");
  move(state, "corp", findCard("Chiyashi", getCorp(state).hand), "deck");
  move(state, "corp", findCard("DNA Tracker", getCorp(state).hand), "deck");
  playFromHand(state, "corp", "Daily Business Show", "New remote");
  playAndScore(state, "Flower Sermon");
  takeCredits(state, "corp");
  expect(getCorp(state).hand.length).toBe(0);
  const fs = getScored(state, "corp", 0);
  const dbs = getContent(state, "remote1", 0);
  rez(state, "corp", dbs);
  cardAbility(state, "corp", fs, 0);
  expect(getCorp(state).setAside.length).toBe(3);
  clickCard(state, "corp", findCard("Chiyashi", getCorp(state).setAside));
  expect(getCorp(state).deck[getCorp(state).deck.length - 1].title).toBe("Chiyashi");
  clickCard(state, "corp", findCard("Brainstorm", getCorp(state).hand));
  expect(getCorp(state).deck[0].title).toBe("Brainstorm");
});

it("Fly on the Wall", () => {
  const state = newGame({ corp: { deck: ["Fly on the Wall"] } });
  expect(countTags(state)).toBe(0);
  playAndScore(state, "Fly on the Wall");
  expect(countTags(state)).toBe(1);
});

it("Freedom of Information", () => {
  const state = newGame({ corp: { deck: ["Freedom of Information"] } });
  playFromHand(state, "corp", "Freedom of Information", "New remote");
  const foi = getContent(state, "remote1", 0);
  advance(state, foi, 2);
  score(state, "corp", refresh(state, foi));
  expect(getContent(state, "remote1", 0)).toBeTruthy();
  gainTags(state, "runner", 2);
  score(state, "corp", refresh(state, foi));
  expect(getCorp(state).agendaPoint).toBe(2);
});

it("Fujii Asset Retrieval", () => {
  const state = newGame({
    corp: { hand: [qty("Fujii Asset Retrieval", 2)] },
    runner: { hand: [qty("Sure Gamble", 4)] },
  });
  changed(() => getRunner(state).hand.length, -2, () => {
    playAndScore(state, "Fujii Asset Retrieval");
  });
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  changed(() => getRunner(state).hand.length, -2, () => {
    clickPrompt(state, "runner", "Steal");
  });
});

it("Genetic Resequencing", () => {
  const state = newGame({ corp: { deck: ["Genetic Resequencing", qty("Braintrust", 2)] } });
  playFromHand(state, "corp", "Braintrust", "New remote");
  playFromHand(state, "corp", "Braintrust", "New remote");
  playFromHand(state, "corp", "Genetic Resequencing", "New remote");
  const bt1 = getContent(state, "remote1", 0);
  const bt2 = getContent(state, "remote2", 0);
  const gr = getContent(state, "remote3", 0);
  scoreAgenda(state, "corp", bt1);
  const btscored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, btscored), "agenda")).toBe(0);
  scoreAgenda(state, "corp", gr);
  clickCard(state, "corp", bt2);
  expect(getCounters(refresh(state, bt2), "agenda")).toBe(0);
  clickCard(state, "corp", btscored);
  expect(getCounters(refresh(state, btscored), "agenda")).toBe(1);
});

it("Geothermal Fracking", () => {
  const state = newGame({ corp: { deck: ["Geothermal Fracking"] } });
  playAndScore(state, "Geothermal Fracking");
  expect(getCorp(state).click).toBe(2);
  expect(getCorp(state).credit).toBe(5);
  expect(countBadPub(state)).toBe(0);
  const gfScored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, gfScored), "agenda")).toBe(2);
  cardAbility(state, "corp", gfScored, 0);
  expect(getCorp(state).click).toBe(1);
  expect(getCorp(state).credit).toBe(12);
  expect(countBadPub(state)).toBe(1);
});

it("Geothermal Fracking - prevented bad pub shouldn't block credit gain", () => {
  const state = newGame({ corp: { deck: ["Geothermal Fracking", "Broadcast Square"] } });
  playAndScore(state, "Geothermal Fracking");
  expect(getCorp(state).click).toBe(2);
  expect(getCorp(state).credit).toBe(5);
  expect(countBadPub(state)).toBe(0);
  playFromHand(state, "corp", "Broadcast Square", "New remote");
  const gfScored = getScored(state, "corp", 0);
  const bs = getContent(state, "remote2", 0);
  rez(state, "corp", bs);
  expect(getCounters(refresh(state, gfScored), "agenda")).toBe(2);
  cardAbility(state, "corp", gfScored, 0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(getCorp(state).click).toBe(0);
  expect(getCorp(state).credit).toBe(10);
  expect(countBadPub(state)).toBe(0);
});

it("Gila Hands Arcology", () => {
  const state = newGame({ corp: { deck: ["Gila Hands Arcology"] } });
  playAndScore(state, "Gila Hands Arcology");
  expect(getCorp(state).click).toBe(2);
  expect(getCorp(state).credit).toBe(5);
  gain(state, "corp", "click", 2);
  const ghaScored = getScored(state, "corp", 0);
  cardAbility(state, "corp", ghaScored, 0);
  expect(getCorp(state).click).toBe(2);
  expect(getCorp(state).credit).toBe(8);
  cardAbility(state, "corp", ghaScored, 0);
  expect(getCorp(state).click).toBe(0);
  expect(getCorp(state).credit).toBe(11);
});

describe("Glenn Station", () => {
  let startState: any;
  beforeEach(() => {
    startState = newGame({
      corp: { deck: [qty("Hedge Fund", 5)], hand: ["Glenn Station", "Ice Wall", "Enigma"] },
      runner: { hand: ["Political Graffiti"] },
    });
    playAndScore(startState, "Glenn Station");
  });

  it("Can host a card", () => {
    const state = cloneState(startState);
    const gsScored = getScored(state, "corp", 0);
    cardAbility(state, "corp", gsScored, 0);
    clickCard(state, "corp", "Ice Wall");
    expect(findCard("Ice Wall", refresh(state, gsScored).hosted)).toBeTruthy();
    expect(refresh(state, gsScored).hosted.length).toBe(1);
  });

  it("Can't host more than 1 card", () => {
    const state = cloneState(startState);
    const gsScored = getScored(state, "corp", 0);
    cardAbility(state, "corp", gsScored, 0);
    clickCard(state, "corp", "Ice Wall");
    cardAbility(state, "corp", gsScored, 0);
    expect(noPrompt(state, "corp")).toBe(true);
  });

  it("Requires at least 1 card in hand to host", () => {
    const state = cloneState(startState);
    startingHand(state, "corp", []);
    const gsScored = getScored(state, "corp", 0);
    cardAbility(state, "corp", gsScored, 0);
    expect(noPrompt(state, "corp")).toBe(true);
  });

  it("Can take a hosted card", () => {
    const state = cloneState(startState);
    const gsScored = getScored(state, "corp", 0);
    cardAbility(state, "corp", gsScored, 0);
    clickCard(state, "corp", "Ice Wall");
    cardAbility(state, "corp", gsScored, 1);
    clickCard(state, "corp", "Ice Wall");
    expect(findCard("Ice Wall", getCorp(state).hand)).toBeTruthy();
    expect(refresh(state, gsScored).hosted.length).toBe(0);
  });

  it("Can't take a hosted card if none exist", () => {
    const state = cloneState(startState);
    const gsScored = getScored(state, "corp", 0);
    cardAbility(state, "corp", gsScored, 1);
    expect(noPrompt(state, "corp")).toBe(true);
  });

  it("Can host a single corp card even if a runner card is hosted", () => {
    const state = cloneState(startState);
    const gsScored = getScored(state, "corp", 0);
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Political Graffiti");
    runContinue(state);
    runContinue(state);
    clickCard(state, "runner", "Glenn Station");
    expect(refresh(state, gsScored).hosted.length).toBe(1);
    takeCredits(state, "runner");
    cardAbility(state, "corp", refresh(state, gsScored), 0);
    expect(getPromptMap(state, "corp").msg).toBe("Choose a card to host");
    clickCard(state, "corp", "Enigma");
    expect(findCard("Enigma", refresh(state, gsScored).hosted)).toBeTruthy();
  });

  it("Can't take a card if only a runner card is hosted", () => {
    const state = cloneState(startState);
    const gsScored = getScored(state, "corp", 0);
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Political Graffiti");
    runContinue(state);
    runContinue(state);
    clickCard(state, "runner", "Glenn Station");
    takeCredits(state, "runner");
    cardAbility(state, "corp", refresh(state, gsScored), 1);
    expect(noPrompt(state, "corp")).toBe(true);
  });

  it("Can take a hosted card even if a runner card is hosted", () => {
    const state = cloneState(startState);
    const gsScored = getScored(state, "corp", 0);
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Political Graffiti");
    runContinue(state);
    runContinue(state);
    clickCard(state, "runner", "Glenn Station");
    takeCredits(state, "runner");
    cardAbility(state, "corp", refresh(state, gsScored), 0);
    clickCard(state, "corp", "Enigma");
    cardAbility(state, "corp", refresh(state, gsScored), 1);
    expect(getPromptMap(state, "corp").msg).toBe("Choose a hosted card");
    clickCard(state, "corp", "Enigma");
    expect(findCard("Enigma", getCorp(state).hand)).toBeTruthy();
  });
});

it("Global Food Initiative - corp scores", () => {
  const state = newGame({ corp: { deck: [qty("Global Food Initiative", 2)] } });
  expect(getRunner(state).agendaPoint).toBe(0);
  expect(getCorp(state).agendaPoint).toBe(0);
  playAndScore(state, "Global Food Initiative");
  expect(getCorp(state).agendaPoint).toBe(3);
});

it("Global Food Initiative - runner steals", () => {
  const state = newGame({ corp: { deck: [qty("Global Food Initiative", 2)] } });
  playAndScore(state, "Global Food Initiative");
  playFromHand(state, "corp", "Global Food Initiative", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote2");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).agendaPoint).toBe(2);
});

it("Government Contracts", () => {
  const state = newGame({ corp: { deck: ["Government Contracts"] } });
  playAndScore(state, "Government Contracts");
  expect(getCorp(state).click).toBe(2);
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  expect(getCorp(state).click).toBe(0);
  expect(getCorp(state).credit).toBe(9);
});

it("Government Takeover", () => {
  const state = newGame({ corp: { deck: ["Government Takeover"] } });
  playAndScore(state, "Government Takeover");
  expect(getCorp(state).credit).toBe(5);
  const gtScored = getScored(state, "corp", 0);
  cardAbility(state, "corp", gtScored, 0);
  expect(getCorp(state).credit).toBe(8);
});

it("Graft", () => {
  const graftTests: [number, number][] = [[0, 3], [1, 2], [2, 1], [3, 0]];
  const cards = ["Ice Wall", "Fire Wall", "Orion"];
  for (const [numPicks, deckSize] of graftTests) {
    const state = newGame({ corp: { deck: ["Graft", "Ice Wall", "Fire Wall", "Orion"] } });
    startingHand(state, "corp", ["Graft"]);
    playAndScore(state, "Graft");
    for (let i = 0; i < numPicks; i++) {
      clickPrompt(state, "corp", findCard(cards[i], getCorp(state).deck));
    }
    expect(getCorp(state).hand.length).toBe(numPicks);
    expect(getCorp(state).deck.length).toBe(deckSize);
  }
});

it("Greenmail", () => {
  const state = newGame({ corp: { hand: ["Greenmail", "Archer"] } });
  changed(() => getCorp(state).credit, 2, () => {
    playAndScore(state, "Greenmail");
  });
  playFromHand(state, "corp", "Archer", "HQ");
  rez(state, "corp", getIce(state, "hq", 0), { expectRez: false });
  changed(() => getCorp(state).credit, 4, () => {
    clickCard(state, "corp", "Greenmail");
  });
});

it("Hades Fragment", () => {
  const state = newGame({ corp: { hand: ["Hades Fragment"], discard: ["Hedge Fund"] } });
  startingHand(state, "corp", ["Hades Fragment"]);
  playAndScore(state, "Hades Fragment");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  const hfScored = getScored(state, "corp", 0);
  cardAbility(state, "corp", hfScored, 0);
  clickCard(state, "corp", findCard("Hedge Fund", getCorp(state).discard));
  expect(getCorp(state).deck.length).toBe(1);
});

it("Helium-3 Deposit", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Helium-3 Deposit", "Chief Slee", "Ice Wall"] },
  });
  playFromHand(state, "corp", "Chief Slee", "New remote");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  const cs = getContent(state, "remote1", 0);
  const iw = getIce(state, "hq", 0);
  expect(getCounters(refresh(state, cs), "power")).toBe(0);
  rez(state, "corp", iw);
  rez(state, "corp", cs);
  runOn(state, "HQ");
  runContinue(state);
  fireSubs(state, iw);
  expect(getCounters(refresh(state, cs), "power")).toBe(1);
  takeCredits(state, "runner");
  playAndScore(state, "Helium-3 Deposit");
  clickPrompt(state, "corp", "2");
  clickCard(state, "corp", cs);
  expect(getCounters(refresh(state, cs), "power")).toBe(3);
});

it("High-Risk Investment", () => {
  const state = newGame({ corp: { deck: ["High-Risk Investment"] } });
  playAndScore(state, "High-Risk Investment");
  const hriScored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, hriScored), "agenda")).toBe(1);
  takeCredits(state, "corp");
  expect(getCorp(state).credit).toBe(7);
  takeCredits(state, "runner");
  expect(getRunner(state).credit).toBe(9);
  cardAbility(state, "corp", hriScored, 0);
  expect(getCorp(state).credit).toBe(16);
  expect(getCorp(state).click).toBe(2);
  expect(getCounters(refresh(state, hriScored), "agenda")).toBe(0);
});

it("Hollywood Renovation", () => {
  const state = newGame({ corp: { deck: ["Hollywood Renovation", "Ice Wall"] } });
  gain(state, "corp", "click", 10, "credit", 10);
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playFromHand(state, "corp", "Hollywood Renovation", "New remote");
  const hr = getContent(state, "remote1", 0);
  const iw = getIce(state, "hq", 0);
  for (let i = 0; i < 5; i++) {
    advance(state, refresh(state, hr));
    clickCard(state, "corp", refresh(state, iw));
  }
  expect(getCounters(refresh(state, hr), "advancement")).toBe(5);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(5);
  advance(state, refresh(state, hr));
  clickCard(state, "corp", refresh(state, iw));
  expect(getCounters(refresh(state, hr), "advancement")).toBe(6);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(7);
});

it("Hostile Takeover", () => {
  const state = newGame({ corp: { deck: ["Hostile Takeover"] } });
  playAndScore(state, "Hostile Takeover");
  expect(getCorp(state).credit).toBe(12);
  expect(countBadPub(state)).toBe(1);
});

it("House of Knives", () => {
  const state = newGame({ corp: { deck: ["House of Knives"] } });
  playAndScore(state, "House of Knives");
  const hokScored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, hokScored), "agenda")).toBe(3);
  takeCredits(state, "corp");
  runOn(state, "R&D");
  expect(state.run?.phase).toBe("movement");
  cardAbility(state, "corp", hokScored, 0);
  expect(getRunner(state).discard.length).toBe(1);
  runContinue(state);
  runOn(state, "R&D");
  expect(state.run?.phase).toBe("movement");
  cardAbility(state, "corp", hokScored, 0);
  cardAbility(state, "corp", hokScored, 0);
  expect(getRunner(state).discard.length).toBe(2);
});

it("Hybrid Release", () => {
  const state = newGame({
    corp: {
      id: "Sportsmetal: Go Big or Go Home",
      deck: ["Hybrid Release", qty("Hansei Review", 2), "PAD Campaign", "Hedge Fund"],
      discard: ["Obokata Protocol"],
    },
  });
  takeCredits(state, "corp");
  runEmptyServer(state, "Archives");
  clickPrompt(state, "runner", "No action");
  takeCredits(state, "runner");
  gain(state, "corp", "click", 2);
  playFromHand(state, "corp", "Hansei Review");
  clickCard(state, "corp", "PAD Campaign");
  playFromHand(state, "corp", "Hansei Review");
  clickCard(state, "corp", "Hedge Fund");
  playAndScore(state, "Hybrid Release");
  clickPrompt(state, "corp", "Sportsmetal: Go Big or Go Home");
  clickPrompt(state, "corp", "Gain 2 [Credits]");
  clickCard(state, "corp", findCard("Obokata Protocol", getCorp(state).discard));
  expect(getPromptMap(state, "corp").msg).toBe("Choose a facedown card in Archives to install");
  clickCard(state, "corp", findCard("Hedge Fund", getCorp(state).discard));
  expect(getPromptMap(state, "corp").msg).toBe("Choose a facedown card in Archives to install");
  clickCard(state, "corp", findCard("PAD Campaign", getCorp(state).discard));
  clickPrompt(state, "corp", "New remote");
  expect(noPrompt(state, "runner")).toBe(true);
  expect(getContent(state, "remote2", 0).title).toBe("PAD Campaign");
});

it("Hybrid Release - no prompt when no facedown card in archives", () => {
  const state = newGame({ corp: { hand: ["Hybrid Release"], discard: ["Ice Wall"] } });
  takeCredits(state, "corp");
  runEmptyServer(state, "Archives");
  takeCredits(state, "runner");
  playAndScore(state, "Hybrid Release");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Hyperloop Extension - score", () => {
  const state = newGame({ corp: { deck: ["Hyperloop Extension"] } });
  playFromHand(state, "corp", "Hyperloop Extension", "New remote");
  expect(getCorp(state).credit).toBe(5);
  scoreAgenda(state, "corp", getContent(state, "remote1", 0));
  expect(getCorp(state).credit).toBe(8);
});

it("Hyperloop Extension - steal", () => {
  const state = newGame({ corp: { deck: ["Hyperloop Extension"] } });
  playFromHand(state, "corp", "Hyperloop Extension", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  expect(getCorp(state).credit).toBe(7);
  clickPrompt(state, "runner", "Steal");
  expect(getCorp(state).credit).toBe(10);
});

it("Ikawah Project - no credits", () => {
  const state = newGame({ corp: { deck: ["Ikawah Project"] } });
  playFromHand(state, "corp", "Ikawah Project", "New remote");
  takeCredits(state, "corp");
  lose(state, "runner", "credit", getRunner(state).credit);
  lose(state, "runner", "click", 3);
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).credit).toBe(0);
  expect(getRunner(state).scored.length).toBe(0);
});

it("Ikawah Project - no clicks", () => {
  const state = newGame({ corp: { deck: ["Ikawah Project"] } });
  playFromHand(state, "corp", "Ikawah Project", "New remote");
  takeCredits(state, "corp");
  lose(state, "runner", "credit", getRunner(state).credit);
  lose(state, "runner", "click", 3);
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).click).toBe(0);
  expect(getRunner(state).scored.length).toBe(0);
});

it("Ikawah Project - enough of both", () => {
  const state = newGame({ corp: { deck: ["Ikawah Project"] } });
  playFromHand(state, "corp", "Ikawah Project", "New remote");
  takeCredits(state, "corp");
  lose(state, "runner", "credit", getRunner(state).credit);
  lose(state, "runner", "click", getRunner(state).click);
  gain(state, "runner", "credit", 5, "click", 4);
  expect(getRunner(state).credit).toBe(5);
  expect(getRunner(state).click).toBe(4);
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Pay to steal");
  expect(getRunner(state).click).toBe(2);
  expect(getRunner(state).credit).toBe(3);
  expect(getRunner(state).agendaPoint).toBe(3);
  expect(getRunner(state).scored.length).toBe(1);
});

it("Ikawah Project - not stealing from R&D", () => {
  const state = newGame({ corp: { deck: [qty("Ikawah Project", 2)] } });
  takeCredits(state, "corp");
  startingHand(state, "corp", ["Ikawah Project"]);
  runEmptyServer(state, "R&D");
  clickPrompt(state, "runner", "No action");
  expect(lastLogContains(state, "Ikawah Project")).toBe(false);
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "No action");
  expect(lastLogContains(state, "Ikawah Project")).toBe(true);
});

it("Illicit Sales", () => {
  const tests: [number, string, number][] = [
    [0, "No", 0], [0, "Yes", 3], [1, "No", 3], [1, "Yes", 6],
    [2, "No", 6], [2, "Yes", 9], [3, "No", 9], [3, "Yes", 12],
  ];
  for (const [startingBp, answer, creditsGained] of tests) {
    const state = newGame({ corp: { deck: ["Illicit Sales"] } });
    const credits = getCorp(state).credit;
    gain(state, "corp", "badPublicity", startingBp);
    playAndScore(state, "Illicit Sales");
    clickPrompt(state, "corp", answer);
    expect(getCorp(state).credit).toBe(credits + creditsGained);
  }
});

it("Improved Protein Source", () => {
  const state = newGame({ corp: { deck: [qty("Improved Protein Source", 2)] } });
  expect(getRunner(state).credit).toBe(5);
  playAndScore(state, "Improved Protein Source");
  expect(getRunner(state).credit).toBe(9);
  playFromHand(state, "corp", "Improved Protein Source", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote2");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).credit).toBe(13);
});

it("Improved Tracers", () => {
  const state = newGame({ corp: { deck: ["Improved Tracers", "News Hound", "Information Overload"] } });
  gain(state, "corp", "credit", 10);
  playFromHand(state, "corp", "News Hound", "HQ");
  playFromHand(state, "corp", "Information Overload", "R&D");
  const nh = getIce(state, "hq", 0);
  const io = getIce(state, "rd", 0);
  rez(state, "corp", nh);
  rez(state, "corp", io);
  expect(getStrength(refresh(state, nh))).toBe(4);
  expect(getCorp(state).credit).toBe(7);
  playAndScore(state, "Improved Tracers");
  expect(getStrength(refresh(state, nh))).toBe(5);
  takeCredits(state, "corp");
  runOn(state, "HQ");
  runContinue(state);
  fireSubs(state, nh);
  expect(getPromptMap(state, "corp").bonus).toBe(1);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(countTags(state)).toBe(1);
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "HQ");
  runContinue(state);
  fireSubs(state, nh);
  expect(getPromptMap(state, "corp").bonus).toBe(1);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(countTags(state)).toBe(2);
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "R&D");
  runContinue(state);
  fireSubs(state, io);
  expect(getPromptMap(state, "corp").bonus).toBe(0);
});

it("Jumon", () => {
  const state = newGame({ corp: { deck: ["Jumon", "Ice Wall", "Crisium Grid", "Project Atlas"] } });
  playAndScore(state, "Jumon");
  playFromHand(state, "corp", "Ice Wall", "New remote");
  playFromHand(state, "corp", "Project Atlas", "Server 2");
  endTurn(state, "corp");
  const pa = getContent(state, "remote2", 0);
  const iw = getIce(state, "remote2", 0);
  expect(getCounters(refresh(state, pa), "advancement")).toBe(0);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
  clickCard(state, "corp", iw);
  clickCard(state, "corp", pa);
  expect(getCounters(refresh(state, pa), "advancement")).toBe(2);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
  startTurn(state, "runner");
  takeCredits(state, "runner");
  playFromHand(state, "corp", "Crisium Grid", "Server 2");
  const cg = getContent(state, "remote2", 1);
  expect(getCounters(refresh(state, cg), "advancement")).toBe(0);
  endTurn(state, "corp");
  clickCard(state, "corp", cg);
  expect(getCounters(refresh(state, cg), "advancement")).toBe(2);
});

it("Labyrinthine Servers", () => {
  const state = newGame({ corp: { deck: [qty("Labyrinthine Servers", 1)] } });
  playAndScore(state, "Labyrinthine Servers");
  takeCredits(state, "corp");
  const ls1 = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, ls1), "power")).toBe(2);
  runOn(state, "HQ");
  runJackOut(state);
  expect(state.run).toBeTruthy();
  clickPrompt(state, "corp", "Allow the Runner to jack out");
  expect(state.run).toBeFalsy();
  runOn(state, "HQ");
  runJackOut(state);
  clickPrompt(state, "corp", "Labyrinthine Servers");
  expect(state.run).toBeTruthy();
  runContinue(state);
  expect(state.run).toBeFalsy();
  expect(getCounters(refresh(state, ls1), "power")).toBe(1);
  runOn(state, "HQ");
  runJackOut(state);
  expect(state.run).toBeTruthy();
  clickPrompt(state, "corp", "Labyrinthine Servers");
  runContinue(state);
  expect(state.run).toBeFalsy();
  runOn(state, "HQ");
  runJackOut(state);
  expect(state.run).toBeFalsy();
});

it("Kimberlite Field - no target", () => {
  const state = newGame({ corp: { hand: ["Kimberlite Field", "Rashida Jaheem"] } });
  playFromHand(state, "corp", "Rashida Jaheem", "New remote");
  playAndScore(state, "Kimberlite Field");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Kimberlite Field - standard functionality", () => {
  const state = newGame({
    corp: { hand: ["Kimberlite Field", "Echo Chamber", "Breaker Bay Grid", "TechnoCo"] },
    runner: { hand: ["Amina", "Paperclip"], credits: 15 },
  });
  playFromHand(state, "corp", "Echo Chamber", "New remote");
  playFromHand(state, "corp", "Breaker Bay Grid", "Server 1");
  playFromHand(state, "corp", "TechnoCo", "New remote");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Amina");
  playFromHand(state, "runner", "Paperclip");
  takeCredits(state, "runner");
  rez(state, "corp", getContent(state, "remote1", 1));
  rez(state, "corp", getContent(state, "remote1", 0));
  rez(state, "corp", getContent(state, "remote2", 0));
  playAndScore(state, "Kimberlite Field");
  clickCard(state, "corp", "Echo Chamber");
  clickCard(state, "corp", "Amina");
  expect(getRunner(state).discard.length).toBe(0);
  clickCard(state, "corp", "Paperclip");
  expect(getRunner(state).discard.length).toBe(1);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Kingmaking", () => {
  const state = newGame({
    corp: { hand: ["Kingmaking"], deck: ["House of Knives", "Project Atlas", "Hedge Fund"] },
  });
  changedMulti(
    [
      [() => getCorp(state).deck.length, -3],
      [() => getCorp(state).hand.length, 1],
      [() => getCorp(state).agendaPoint, 3],
    ],
    () => {
      playAndScore(state, "Kingmaking");
      clickPrompt(state, "corp", "3");
      clickCard(state, "corp", "Project Atlas");
      expect(noPrompt(state, "corp")).toBe(false);
      clickCard(state, "corp", "House of Knives");
    }
  );
  expect(getCounters(getScored(state, "runner", 1), "agenda")).toBe(0);
});

it("Kingmaking - draw N", () => {
  for (let n = 0; n < 4; n++) {
    const state = newGame({
      corp: { hand: ["Kingmaking", "Hedge Fund"], deck: ["House of Knives", "Project Atlas", "Hedge Fund"] },
    });
    changedMulti(
      [
        [() => getCorp(state).deck.length, -n],
        [() => getCorp(state).hand.length, n - 1],
      ],
      () => {
        playAndScore(state, "Kingmaking");
        clickPrompt(state, "corp", String(n));
        clickPrompt(state, "corp", "Done");
      }
    );
  }
});

it("Let Them Dream", () => {
  const agendas = [["HQ", "Project Atlas"], ["R&D", "Ikawah Project"], ["Archives", "Project Kusanagi"]];
  const tos = ["HQ", "Bottom of R&D"];
  for (const [from, agenda] of agendas) {
    for (const to of tos) {
      const state = newGame({
        corp: {
          hand: ["Let Them Dream", "Project Atlas"],
          deck: [qty("IPO", 15), "Ikawah Project"],
          discard: ["Project Kusanagi"],
        },
      });
      playAndScore(state, "Let Them Dream");
      clickPrompts(state, "corp", from, agenda, to);
      if (to === "HQ") {
        expect(getCorp(state).hand.some((c: any) => c.title === agenda)).toBe(true);
      } else {
        expect(getCorp(state).deck[getCorp(state).deck.length - 1].title).toBe(agenda);
      }
    }
  }
});

it("Let Them Dream - points", () => {
  const state = newGame({ corp: { deck: [qty("Let Them Dream", 2)] } });
  expect(getRunner(state).agendaPoint).toBe(0);
  expect(getCorp(state).agendaPoint).toBe(0);
  playAndScore(state, "Let Them Dream");
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).agendaPoint).toBe(2);
  playFromHand(state, "corp", "Let Them Dream", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote2");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).agendaPoint).toBe(1);
});

it("License Acquisition", () => {
  const state = newGame({
    corp: {
      deck: [qty("License Acquisition", 4), "Adonis Campaign", "Eve Campaign", "Strongbox", "Corporate Troubleshooter"],
    },
  });
  startingHand(state, "corp", [
    "License Acquisition", "License Acquisition", "License Acquisition", "License Acquisition",
    "Adonis Campaign", "Strongbox",
  ]);
  move(state, "corp", findCard("Eve Campaign", getCorp(state).deck), "discard");
  move(state, "corp", findCard("Corporate Troubleshooter", getCorp(state).deck), "discard");
  gain(state, "corp", "click", 4);
  // Asset & HQ
  playAndScore(state, "License Acquisition");
  clickCard(state, "corp", findCard("Adonis Campaign", getCorp(state).hand));
  clickPrompt(state, "corp", "New remote");
  expect(getContent(state, "remote2", 0)).toBeTruthy();
  // Upgrade & HQ
  playAndScore(state, "License Acquisition");
  clickCard(state, "corp", findCard("Strongbox", getCorp(state).hand));
  clickPrompt(state, "corp", "New remote");
  expect(getContent(state, "remote4", 0)).toBeTruthy();
  // Asset & Archives
  playAndScore(state, "License Acquisition");
  clickCard(state, "corp", findCard("Eve Campaign", getCorp(state).discard));
  clickPrompt(state, "corp", "New remote");
  expect(getContent(state, "remote6", 0)).toBeTruthy();
  // Upgrade & Archives
  playAndScore(state, "License Acquisition");
  clickCard(state, "corp", findCard("Corporate Troubleshooter", getCorp(state).discard));
  clickPrompt(state, "corp", "New remote");
  expect(getContent(state, "remote8", 0)).toBeTruthy();
});

it("Lightning Laboratory", () => {
  const state = newGame({ corp: { hand: ["Lightning Laboratory", "Archer", "Bloop", "Rime"] } });
  gain(state, "corp", "click", 1);
  playAndScore(state, "Lightning Laboratory");
  playFromHand(state, "corp", "Archer", "HQ");
  playFromHand(state, "corp", "Bloop", "HQ");
  playFromHand(state, "corp", "Rime", "HQ");
  const ll = getScored(state, "corp", 0);
  const archer = getIce(state, "hq", 0);
  const bloop = getIce(state, "hq", 1);
  const rime = getIce(state, "hq", 2);
  expect(getCounters(refresh(state, ll), "agenda")).toBe(1);
  takeCredits(state, "corp");
  runOn(state, "hq");
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", archer);
  clickCard(state, "corp", bloop);
  expect(rezzed(refresh(state, archer))).toBe(true);
  expect(rezzed(refresh(state, bloop))).toBe(true);
  rez(state, "corp", rime);
  runContinue(state);
  runContinue(state);
  runJackOut(state);
  expect(noPrompt(state, "corp")).toBe(true);
  takeCredits(state, "runner");
  expect(noPrompt(state, "corp")).toBe(false);
  clickCard(state, "corp", archer);
  clickCard(state, "corp", rime);
  expect(rezzed(refresh(state, archer))).toBe(false);
  expect(rezzed(refresh(state, rime))).toBe(false);
  expect(rezzed(refresh(state, bloop))).toBe(true);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Longevity Serum - basic behavior", () => {
  const state = newGame({
    corp: {
      hand: ["Longevity Serum", "Hedge Fund", "IPO", "Afshar"],
      discard: ["Ice Wall", "Fire Wall", "Hostile Takeover", "Prisec"],
    },
  });
  playAndScore(state, "Longevity Serum");
  clickCard(state, "corp", findCard("Hedge Fund", getCorp(state).hand));
  clickCard(state, "corp", findCard("IPO", getCorp(state).hand));
  expect(getCorp(state).discard.length).toBe(4);
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).discard.length).toBe(6);
  clickCard(state, "corp", "Ice Wall");
  clickCard(state, "corp", "Fire Wall");
  clickCard(state, "corp", "Prisec");
  expect(findCard("Fire Wall", getCorp(state).deck)).toBeTruthy();
  expect(findCard("Ice Wall", getCorp(state).deck)).toBeTruthy();
  expect(findCard("Prisec", getCorp(state).deck)).toBeTruthy();
});

it("Longevity Serum - no cards selected", () => {
  const state = newGame({
    corp: {
      hand: ["Longevity Serum", "Hedge Fund", "IPO", "Afshar"],
      discard: ["Ice Wall", "Fire Wall", "Hostile Takeover", "Prisec"],
    },
  });
  playAndScore(state, "Longevity Serum");
  expect(getCorp(state).discard.length).toBe(4);
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).discard.length).toBe(4);
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).discard.length).toBe(4);
});

it("Longevity Serum - no cards trashed, 2 shuffled", () => {
  const state = newGame({
    corp: {
      hand: ["Longevity Serum", "Hedge Fund", "IPO", "Afshar"],
      discard: ["Ice Wall", "Fire Wall", "Hostile Takeover", "Prisec"],
    },
  });
  playAndScore(state, "Longevity Serum");
  expect(getCorp(state).discard.length).toBe(4);
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).discard.length).toBe(4);
  clickCard(state, "corp", "Ice Wall");
  clickCard(state, "corp", "Fire Wall");
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).discard.length).toBe(2);
});

it("Longevity Serum - effect fully completes before runner abilities trigger #5992", () => {
  const state = newGame({
    corp: {
      hand: ["Longevity Serum", "Hedge Fund", "IPO", "Afshar", "Enigma"],
      discard: ["Ice Wall", "Fire Wall", "Hostile Takeover", "Prisec"],
    },
    runner: { id: "Tāo Salonga: Telepresence Magician" },
  });
  playFromHand(state, "corp", "Afshar", "HQ");
  playFromHand(state, "corp", "Enigma", "R&D");
  playAndScore(state, "Longevity Serum");
  expect(waiting(state, "runner")).toBe(true);
  expect(getCorp(state).discard.length).toBe(4);
  clickCard(state, "corp", findCard("Hedge Fund", getCorp(state).hand));
  clickCard(state, "corp", findCard("IPO", getCorp(state).hand));
  expect(getCorp(state).discard.length).toBe(6);
  expect(waiting(state, "runner")).toBe(true);
  clickCard(state, "corp", "Ice Wall");
  clickCard(state, "corp", "Fire Wall");
  clickCard(state, "corp", "Prisec");
  expect(findCard("Fire Wall", getCorp(state).deck)).toBeTruthy();
  expect(findCard("Ice Wall", getCorp(state).deck)).toBeTruthy();
  expect(findCard("Prisec", getCorp(state).deck)).toBeTruthy();
  expect(waiting(state, "corp")).toBe(true);
  clickPrompt(state, "runner", "No");
});

it("Lotus Haze - basic test", () => {
  const state = newGame({ corp: { hand: ["Lotus Haze", "Crisium Grid"] } });
  playAndScore(state, "Lotus Haze");
  playFromHand(state, "corp", "Crisium Grid", "HQ");
  rez(state, "corp", getContent(state, "hq", 0));
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  clickCard(state, "corp", "Crisium Grid");
  expect(promptTitles(state, "corp")).toEqual(["Archives", "R&D"]);
  clickPrompt(state, "corp", "R&D");
  expect(getContent(state, "rd", 0).title).toBe("Crisium Grid");
  expect(noPrompt(state, "runner")).toBe(true);
});

it("Lotus Haze - movement rules test", () => {
  const state = newGame({ corp: { hand: ["Lotus Haze", "Crisium Grid", "ZATO City Grid"], credits: 15 } });
  playAndScore(state, "Lotus Haze");
  playCards(state, "corp", ["Crisium Grid", "HQ", "rezzed"]);
  playCards(state, "corp", ["ZATO City Grid", "New remote", "rezzed"]);
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  clickCard(state, "corp", "Crisium Grid");
  expect(promptTitles(state, "corp")).toEqual(["Archives", "R&D"]);
  clickPrompt(state, "corp", "R&D");
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  clickCard(state, "corp", "ZATO City Grid");
  expect(promptTitles(state, "corp")).toEqual(["OK"]);
});

it("Luminal Transubstantiation", () => {
  const state = newGame({ corp: { deck: ["Luminal Transubstantiation", "Project Vitruvius"] } });
  playFromHand(state, "corp", "Luminal Transubstantiation", "New remote");
  addProp(state, "corp", makeEid(state), getContent(state, "remote1", 0), "advanceCounter", 3);
  changed(() => getCorp(state).click, 3, () => {
    score(state, "corp", getContent(state, "remote1", 0));
  });
  expect(findCard("Luminal Transubstantiation", getCorp(state).scored)).toBeTruthy();
  expect(getCorp(state).scored.length).toBe(1);
  playFromHand(state, "corp", "Project Vitruvius", "New remote");
  addProp(state, "corp", makeEid(state), getContent(state, "remote2", 0), "advanceCounter", 3);
  score(state, "corp", getContent(state, "remote2", 0));
  expect(getCorp(state).scored.length).toBe(1);
});

it("Mandatory Seed Replacement", () => {
  const state = newGame({
    corp: {
      deck: ["Mandatory Seed Replacement", "Ice Wall", "Fire Wall", "Kakugo", "Chum", "RSVP", "Sensei"],
      credits: 100,
    },
  });
  clickDraw(state, "corp");
  gain(state, "corp", "click", 10, "credit", 10);
  playFromHand(state, "corp", "Ice Wall", "Archives");
  playFromHand(state, "corp", "Fire Wall", "R&D");
  playFromHand(state, "corp", "Kakugo", "HQ");
  playFromHand(state, "corp", "Chum", "Archives");
  playFromHand(state, "corp", "RSVP", "R&D");
  playFromHand(state, "corp", "Sensei", "HQ");
  const iw = getIce(state, "archives", 0);
  const fw = getIce(state, "rd", 0);
  const kk = getIce(state, "hq", 0);
  const ch = getIce(state, "archives", 1);
  const rs = getIce(state, "rd", 1);
  const sn = getIce(state, "hq", 1);
  rez(state, "corp", iw); rez(state, "corp", fw); rez(state, "corp", kk);
  rez(state, "corp", ch); rez(state, "corp", rs); rez(state, "corp", sn);
  playAndScore(state, "Mandatory Seed Replacement");
  clickCard(state, "corp", refresh(state, iw));
  clickCard(state, "corp", refresh(state, fw));
  clickCard(state, "corp", refresh(state, kk));
  clickCard(state, "corp", refresh(state, ch));
  clickCard(state, "corp", refresh(state, rs));
  clickCard(state, "corp", refresh(state, sn));
});

it("Mandatory Upgrades - gain an additional click", () => {
  const state = newGame({ corp: { deck: ["Mandatory Upgrades", "Melange Mining Corp."] } });
  playAndScore(state, "Mandatory Upgrades");
  expect(getCorp(state).agendaPoint).toBe(2);
  playFromHand(state, "corp", "Melange Mining Corp.", "New remote");
  const mmc = getContent(state, "remote2", 0);
  rez(state, "corp", mmc);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getCorp(state).click).toBe(4);
  cardAbility(state, "corp", mmc, 0);
  expect(getCorp(state).click).toBe(1);
});

it("Mandatory Upgrades - lose additional click if sacrificed", () => {
  const state = newGame({ corp: { deck: ["Mandatory Upgrades", "Archer"] } });
  playAndScore(state, "Mandatory Upgrades");
  expect(getCorp(state).agendaPoint).toBe(2);
  playFromHand(state, "corp", "Archer", "HQ");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  const arc = getIce(state, "hq", 0);
  const mu = getScored(state, "corp", 0);
  expect(getCorp(state).click).toBe(4);
  rez(state, "corp", arc, { expectRez: false });
  clickCard(state, "corp", refresh(state, mu));
  expect(getCorp(state).click).toBe(3);
});

it("Market Research - runner not tagged", () => {
  const state = newGame({ corp: { deck: [qty("Market Research", 2)] } });
  playAndScore(state, "Market Research");
  expect(getCorp(state).agendaPoint).toBe(2);
});

it("Market Research - runner tagged", () => {
  const state = newGame({ corp: { deck: [qty("Market Research", 2)] } });
  playAndScore(state, "Market Research");
  gainTags(state, "runner", 1);
  playAndScore(state, "Market Research");
  expect(getCorp(state).agendaPoint).toBe(5);
});

it("Medical Breakthrough", () => {
  const state = newGame({ corp: { deck: [qty("Medical Breakthrough", 3), qty("Hedge Fund", 3)] } });
  playFromHand(state, "corp", "Medical Breakthrough", "New remote");
  playFromHand(state, "corp", "Medical Breakthrough", "New remote");
  playFromHand(state, "corp", "Hedge Fund");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Steal");
  takeCredits(state, "runner");
  const mb2 = getContent(state, "remote2", 0);
  advance(state, mb2, 3);
  score(state, "corp", refresh(state, mb2));
  expect(getCorp(state).agendaPoint).toBe(2);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  playFromHand(state, "corp", "Medical Breakthrough", "New remote");
  const mb3 = getContent(state, "remote3", 0);
  advance(state, mb3, 2);
  score(state, "corp", refresh(state, mb3));
  expect(getCorp(state).agendaPoint).toBe(4);
});

it("Megaprix Qualifier - first scored doesn't get a counter, worth 1 point", () => {
  const state = newGame({ corp: { hand: ["Megaprix Qualifier"] } });
  playAndScore(state, "Megaprix Qualifier");
  const mq = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, mq), "agenda")).toBe(0);
  expect(getCorp(state).agendaPoint).toBe(1);
});

it("Megaprix Qualifier - second scored gets a counter, worth 2 points", () => {
  const state = newGame({ corp: { hand: [qty("Megaprix Qualifier", 2)] } });
  playAndScore(state, "Megaprix Qualifier");
  playAndScore(state, "Megaprix Qualifier");
  const [first, second] = getCorp(state).scored;
  expect(getCounters(refresh(state, first), "agenda")).toBe(0);
  expect(getCounters(refresh(state, second), "agenda")).toBe(1);
  expect(getCorp(state).agendaPoint).toBe(3);
});

it("Megaprix Qualifier - stolen qualifiers are only ever worth 1 point", () => {
  const state = newGame({ corp: { hand: [qty("Megaprix Qualifier", 2)] } });
  takeCredits(state, "corp");
  for (let i = 0; i < 2; i++) {
    runEmptyServer(state, "HQ");
    clickPrompt(state, "runner", "Steal");
  }
  const [first, second] = getRunner(state).scored;
  expect(getCounters(refresh(state, first), "agenda")).toBe(0);
  expect(getCounters(refresh(state, second), "agenda")).toBe(0);
  expect(getRunner(state).agendaPoint).toBe(2);
});

it("Megaprix Qualifier - scored after runner steals one gets a counter, worth 2 points", () => {
  const state = newGame({ corp: { hand: [qty("Megaprix Qualifier", 2)] } });
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "Steal");
  takeCredits(state, "runner");
  playAndScore(state, "Megaprix Qualifier");
  const runnerMq = getScored(state, "runner", 0);
  const corpMq = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, runnerMq), "agenda")).toBe(0);
  expect(getCounters(refresh(state, corpMq), "agenda")).toBe(1);
  expect(getRunner(state).agendaPoint).toBe(1);
  expect(getCorp(state).agendaPoint).toBe(2);
});

it("Megaprix Qualifier - getting to 7 points through a counter wins immediately", () => {
  const state = newGame({ corp: { hand: [qty("Megaprix Qualifier", 5)], deck: [qty("Hedge Fund", 5)] } });
  gain(state, "corp", "click", 1);
  playAndScore(state, "Megaprix Qualifier");
  playAndScore(state, "Megaprix Qualifier");
  playAndScore(state, "Megaprix Qualifier");
  playAndScore(state, "Megaprix Qualifier");
  expect(getCorp(state).agendaPoint).toBe(7);
  expect((state as any).winner).toBe("corp");
});

it("Méliès City Luxury Line", () => {
  const state = newGame({ corp: { hand: [qty("Méliès City Luxury Line", 2)] } });
  changed(() => getCorp(state).click, 0, () => {
    playAndScore(state, "Méliès City Luxury Line");
  });
  takeCredits(state, "corp");
  runEmptyServer(state, "hq");
  clickPrompt(state, "runner", "Pay to steal");
});

it("Merger", () => {
  const state = newGame({ corp: { deck: [qty("Merger", 2)] } });
  playAndScore(state, "Merger");
  expect(getCorp(state).agendaPoint).toBe(2);
  playFromHand(state, "corp", "Merger", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote2");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).agendaPoint).toBe(3);
});

it("Meteor Mining - stolen", () => {
  const state = newGame({ corp: { deck: ["Meteor Mining"] } });
  playFromHand(state, "corp", "Meteor Mining", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).agendaPoint).toBe(2);
});

it("Meteor Mining - scored", () => {
  const tests: [number, number, string, number, number][] = [
    [0, 2, "No action", 0, 0],
    [0, 2, "Gain 7 [Credits]", 7, 0],
    [1, 2, "No action", 0, 0],
    [1, 2, "Gain 7 [Credits]", 7, 0],
    [2, 3, "No action", 0, 0],
    [2, 3, "Gain 7 [Credits]", 7, 0],
    [2, 3, "Do 7 meat damage", 0, 7],
    [3, 3, "No action", 0, 0],
    [3, 3, "Gain 7 [Credits]", 7, 0],
    [3, 3, "Do 7 meat damage", 0, 7],
  ];
  for (const [tags, numChoices, pick, creds, dmg] of tests) {
    const state = newGame({ corp: { deck: ["Meteor Mining"] }, runner: { deck: [qty("Sure Gamble", 7)] } });
    startingHand(state, "runner", ["Sure Gamble", "Sure Gamble", "Sure Gamble", "Sure Gamble", "Sure Gamble", "Sure Gamble", "Sure Gamble"]);
    const credits = getCorp(state).credit;
    const grip = getRunner(state).hand.length;
    gainTags(state, "runner", tags);
    playAndScore(state, "Meteor Mining");
    expect(promptButtons(state, "corp").length).toBe(numChoices);
    clickPrompt(state, "corp", pick);
    expect(getCorp(state).credit).toBe(credits + creds);
    expect(getRunner(state).hand.length).toBe(grip - dmg);
  }
});

it("Midnight-3 Arcology", () => {
  const state = newGame({
    corp: { hand: ["Midnight-3 Arcology", qty("Hedge Fund", 5)], deck: ["NGO Front", "Vanilla", "Chiyashi"] },
  });
  changed(() => getCorp(state).hand.length, 2, () => {
    playAndScore(state, "Midnight-3 Arcology");
  });
  takeCredits(state, "corp");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(getCorp(state).hand.length).toBe(8);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  clickCard(state, "corp", "NGO Front");
  clickCard(state, "corp", "Vanilla");
  clickCard(state, "corp", "Chiyashi");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("NAPD Contract", () => {
  const state = newGame({ corp: { deck: ["NAPD Contract"] } });
  playFromHand(state, "corp", "NAPD Contract", "New remote");
  const napd = getContent(state, "remote1", 0);
  advance(state, napd, 2);
  takeCredits(state, "corp");
  lose(state, "runner", "credit", 2);
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).scored.length).toBe(0);
  expect(getRunner(state).credit).toBe(3);
  takeCredits(state, "runner");
  gain(state, "corp", "badPublicity", 1);
  advance(state, napd, 2);
  score(state, "corp", refresh(state, napd));
  expect(getContent(state, "remote1", 0)).toBeTruthy();
  advance(state, napd);
  score(state, "corp", refresh(state, napd));
  expect(getCorp(state).agendaPoint).toBe(2);
});

it("NAPD Contract - scoring requirement increases with bad publicity from Corporate Scandal", () => {
  const state = newGame({ corp: { deck: ["NAPD Contract"] }, runner: { deck: ["Corporate Scandal"] } });
  playFromHand(state, "corp", "NAPD Contract", "New remote");
  const napd = getContent(state, "remote1", 0);
  advance(state, napd, 2);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corporate Scandal");
  takeCredits(state, "runner");
  advance(state, napd, 2);
  score(state, "corp", refresh(state, napd));
  expect(getContent(state, "remote1", 0)).toBeTruthy();
  advance(state, napd);
  score(state, "corp", refresh(state, napd));
  expect(getCorp(state).agendaPoint).toBe(2);
});

it("Net Quarantine", () => {
  const state = newGame({ corp: { deck: ["Net Quarantine"] } });
  (state as any).runner.identity.baselink = 1;
  gain(state, "corp", "click", 3);
  playAndScore(state, "Net Quarantine");
  const credits = getCorp(state).credit;
  trace(state, 1);
  clickPrompt(state, "corp", "0");
  expect(getPromptMap(state, "runner").bonus).toBe(0);
  clickPrompt(state, "runner", "3");
  expect(getCorp(state).credit).toBe(credits + 1);
  trace(state, 1);
  clickPrompt(state, "corp", "0");
  expect(getPromptMap(state, "runner").bonus).toBe(1);
  clickPrompt(state, "runner", "2");
  expect(getCorp(state).credit).toBe(credits + 2);
});

it("New Construction", () => {
  const state = newGame({ corp: { deck: ["New Construction", qty("Commercial Bankers Group", 10)] } });
  startingHand(state, "corp", ["New Construction", "Commercial Bankers Group", "Commercial Bankers Group", "Commercial Bankers Group", "Commercial Bankers Group", "Commercial Bankers Group", "Commercial Bankers Group", "Commercial Bankers Group", "Commercial Bankers Group", "Commercial Bankers Group", "Commercial Bankers Group"]);
  gain(state, "corp", "click", 10, "credit", 10);
  playFromHand(state, "corp", "New Construction", "New remote");
  const nc = getContent(state, "remote1", 0);
  expect(getCounters(refresh(state, nc), "advancement")).toBe(0);
  for (let i = 0; i < 4; i++) {
    advance(state, refresh(state, nc));
    clickPrompt(state, "corp", "Yes");
    clickCard(state, "corp", findCard("Commercial Bankers Group", getCorp(state).hand));
  }
  expect(getCounters(refresh(state, nc), "advancement")).toBe(4);
  expect(rezzed(getContent(state, "remote5", 0))).not.toBe(true);
  const credits = getCorp(state).credit;
  advance(state, refresh(state, nc));
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", findCard("Commercial Bankers Group", getCorp(state).hand));
  expect(getCounters(refresh(state, nc), "advancement")).toBe(5);
  expect(rezzed(getContent(state, "remote6", 0))).toBe(true);
  expect(getCorp(state).credit).toBe(credits - 1);
});

it("Next Big Thing", () => {
  const state = newGame({ corp: { hand: ["Next Big Thing"], deck: ["Hedge Fund", "NGO Front", "Project Atlas", "IPO"] } });
  playAndScore(state, "Next Big Thing");
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  expect(getCorp(state).hand.length).toBe(4);
  clickCard(state, "corp", getCorp(state).hand[0].title);
  clickCard(state, "corp", getCorp(state).hand[0].title);
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).hand.length).toBe(2);
});

it("Next Big Thing - shuffle all back", () => {
  const state = newGame({
    corp: { hand: ["Next Big Thing", "Subliminal Messaging", "Ice Wall", "Vanilla"], deck: ["Hedge Fund", "NGO Front", "Project Atlas", "IPO"] },
  });
  playAndScore(state, "Next Big Thing");
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  expect(getCorp(state).hand.length).toBe(7);
  for (const c of [...getCorp(state).hand]) {
    clickCard(state, "corp", c.title);
  }
  expect(getCorp(state).hand.length).toBe(0);
});

it("NEXT Wave 2", () => {
  const state = newGame({ corp: { deck: [qty("NEXT Wave 2", 2), "NEXT Bronze"] } });
  expect(getRunner(state).brainDamage).toBe(0);
  playFromHand(state, "corp", "NEXT Bronze", "HQ");
  rez(state, "corp", getIce(state, "hq", 0));
  playAndScore(state, "NEXT Wave 2");
  clickPrompt(state, "corp", "No");
  expect(getRunner(state).brainDamage).toBe(0);
  playAndScore(state, "NEXT Wave 2");
  clickPrompt(state, "corp", "Yes");
  expect(getRunner(state).brainDamage).toBe(1);
});

it("NEXT Wave 2 - stealing doesn't do anything", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["NEXT Wave 2", "NEXT Bronze"] } });
  expect(getRunner(state).brainDamage).toBe(0);
  playFromHand(state, "corp", "NEXT Bronze", "HQ");
  rez(state, "corp", getIce(state, "hq", 0));
  takeCredits(state, "corp");
  runOn(state, "HQ");
  runContinue(state);
  runContinue(state);
  runContinue(state);
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).brainDamage).toBe(0);
});

it("Nisei MK II", () => {
  const state = newGame({ corp: { deck: ["Nisei MK II"] } });
  playAndScore(state, "Nisei MK II");
  const nisei = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, nisei), "agenda")).toBe(1);
  takeCredits(state, "corp");
  runOn(state, "HQ");
  expect(state.run?.phase).toBe("movement");
  cardAbility(state, "corp", refresh(state, nisei), 0);
  expect(state.run).toBeFalsy();
  expect(getCounters(refresh(state, nisei), "agenda")).toBe(0);
});

it("Oaktown Renovation", () => {
  const state = newGame({ corp: { deck: ["Oaktown Renovation", "Shipment from SanSan"] } });
  gain(state, "corp", "click", 3);
  playFromHand(state, "corp", "Oaktown Renovation", "New remote");
  const oak = getContent(state, "remote1", 0);
  expect(faceup(refresh(state, oak))).toBe(true);
  advance(state, oak);
  expect(getCorp(state).credit).toBe(6);
  playFromHand(state, "corp", "Shipment from SanSan");
  clickPrompt(state, "corp", "2");
  clickCard(state, "corp", oak);
  expect(getCounters(refresh(state, oak), "advancement")).toBe(3);
  expect(getCorp(state).credit).toBe(6);
  advance(state, oak);
  expect(getCorp(state).credit).toBe(7);
  advance(state, oak);
  expect(getCounters(refresh(state, oak), "advancement")).toBe(5);
  expect(getCorp(state).credit).toBe(9);
});

it("Obokata Protocol", () => {
  const state = newGame({
    corp: { id: "Jinteki: Personal Evolution", deck: [qty("Hedge Fund", 5)], hand: ["Obokata Protocol", "Merger", "Hostile Takeover"] },
    runner: { hand: [qty("Sure Gamble", 6)] },
  });
  playFromHand(state, "corp", "Obokata Protocol", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "Steal");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "Steal");
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  changed(() => getRunner(state).discard.length, 4, () => {
    clickPrompt(state, "runner", "Pay to steal");
  });
  expect((state as any).winner).toBe("runner");
  expect((state as any).reason).toBe("Agenda");
});

it("Offworld Office", () => {
  const state = newGame({ corp: { hand: [qty("Offworld Office", 2)] } });
  changed(() => getCorp(state).credit, 7, () => {
    playAndScore(state, "Offworld Office");
  });
});

it("Off the Books", () => {
  const state = newGame({ corp: { hand: ["Off the Books"], deck: ["Project Atlas"] } });
  gain(state, "corp", "click", 10, "credit", 10);
  playFromHand(state, "corp", "Off the Books", "New remote");
  const pr = getContent(state, "remote1", 0);
  advance(state, pr, 5);
  score(state, "corp", refresh(state, pr));
  const scored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, scored), "agenda")).toBe(2);
  takeCredits(state, "corp");
  clickPrompts(state, "corp", "Yes", "Project Atlas", "Install Project Atlas", "New remote");
  expect(getContent(state, "remote2", 0).title).toBe("Project Atlas");
});

it("Off the Books - ignores cost", () => {
  const state = newGame({ corp: { hand: ["Off the Books", "Vanilla"], deck: ["Ice Wall"] } });
  gain(state, "corp", "click", 10, "credit", 10);
  playFromHand(state, "corp", "Off the Books", "New remote");
  const pr = getContent(state, "remote1", 0);
  advance(state, pr, 5);
  score(state, "corp", refresh(state, pr));
  const scored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, scored), "agenda")).toBe(2);
  playFromHand(state, "corp", "Vanilla", "HQ");
  takeCredits(state, "corp");
  changed(() => getCorp(state).credit, 0, () => {
    clickPrompts(state, "corp", "Yes", "Ice Wall", "Install Ice Wall", "HQ");
    expect(getIce(state, "hq", 1).title).toBe("Ice Wall");
  });
});

it("Ontological Dependence", () => {
  const state = newGame({ corp: { hand: ["Ontological Dependence"] } });
  playFromHand(state, "corp", "Ontological Dependence", "New remote");
  const onto = getContent(state, "remote1", 0);
  advance(state, onto, 2);
  score(state, "corp", refresh(state, onto));
  expect(getContent(state, "remote1", 0)).toBeTruthy();
  damage(state, "corp", "brain", 2);
  score(state, "corp", refresh(state, onto));
  expect(getContent(state, "remote1", 0)).toBeFalsy();
});

it("Oracle Thinktank", () => {
  const state = newGame({ corp: { hand: [qty("Oracle Thinktank", 2)] } });
  playAndScore(state, "Oracle Thinktank");
  gainTags(state, "runner", 1);
  cardAbility(state, "corp", refresh(state, getScored(state, "corp", 0)), 0);
  expect(getCorp(state).agendaPoint).toBe(1);
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  changed(() => countTags(state), 1, () => {
    clickPrompt(state, "runner", "Steal");
  });
  takeCredits(state, "runner");
  const ot = getScored(state, "runner", 0);
  expect(getCorp(state).click).toBe(3);
  changed(() => countTags(state), -1, () => {
    cardAbility(state, "corp", refresh(state, ot), 0);
  });
  expect(getRunner(state).agendaPoint).toBe(0);
  expect(getRunner(state).scored.length).toBe(0);
  expect(findCard("Oracle Thinktank", getCorp(state).deck)).toBeTruthy();
});

it("Orbital Superiority", () => {
  const state = newGame({ corp: { hand: [qty("Orbital Superiority", 2)] }, runner: { hand: [qty("Sure Gamble", 10)] } });
  changed(() => countTags(state), 1, () => {
    playAndScore(state, "Orbital Superiority");
  });
  changed(() => getRunner(state).hand.length, -4, () => {
    playAndScore(state, "Orbital Superiority");
  });
});

it("Paper Trail", () => {
  const state = newGame({
    corp: { deck: ["Paper Trail"] },
    runner: { deck: ["Aeneas Informant", "Bank Job", "Rosetta 2.0", "Magnum Opus", "Astrolabe"] },
  });
  takeCredits(state, "corp");
  gain(state, "runner", "click", 10, "credit", 10);
  playFromHand(state, "runner", "Aeneas Informant");
  playFromHand(state, "runner", "Bank Job");
  playFromHand(state, "runner", "Rosetta 2.0");
  playFromHand(state, "runner", "Magnum Opus");
  playFromHand(state, "runner", "Astrolabe");
  takeCredits(state, "runner");
  playAndScore(state, "Paper Trail");
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(getRunner(state).discard.length).toBe(2);
  expect(getResource(state, 0)).toBeTruthy();
  expect(getResource(state).length).toBe(1);
  expect(getProgram(state, 0)).toBeTruthy();
  expect(getHardware(state, 0)).toBeTruthy();
});

it("Personality Profiles", () => {
  const state = newGame({
    corp: { deck: ["Personality Profiles"] },
    runner: { deck: ["Corroder"], hand: ["Self-modifying Code", "Clone Chip", "Patron", "Patron"] },
  });
  playAndScore(state, "Personality Profiles");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Self-modifying Code");
  playFromHand(state, "runner", "Clone Chip");
  const smc = getProgram(state, 0);
  cardAbility(state, "runner", smc, 0);
  clickPrompt(state, "runner", findCard("Corroder", getRunner(state).deck));
  expect(getRunner(state).discard.length).toBe(2);
  const chip = getHardware(state, 0);
  cardAbility(state, "runner", chip, 0);
  clickCard(state, "runner", findCard("Self-modifying Code", getRunner(state).discard));
  expect(lastLogContains(state, "Patron")).toBe(true);
  expect(getRunner(state).discard.length).toBe(3);
});

it("Personality Profiles - effects still fire with empty hand", () => {
  const state = newGame({
    corp: { deck: ["Personality Profiles"] },
    runner: { deck: ["Self-modifying Code", "Clone Chip", "Corroder"] },
  });
  startingHand(state, "runner", ["Self-modifying Code", "Clone Chip"]);
  playAndScore(state, "Personality Profiles");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Self-modifying Code");
  playFromHand(state, "runner", "Clone Chip");
  const smc = getProgram(state, 0);
  cardAbility(state, "runner", smc, 0);
  clickPrompt(state, "runner", findCard("Corroder", getRunner(state).deck));
  const cor = getProgram(state, 0);
  expect(cor).toBeTruthy();
  expect(cor.title).toBe("Corroder");
  const chip = getHardware(state, 0);
  cardAbility(state, "runner", chip, 0);
  clickCard(state, "runner", findCard("Self-modifying Code", getRunner(state).discard));
  const smc2 = getProgram(state, 1);
  expect(smc2).toBeTruthy();
  expect(smc2.title).toBe("Self-modifying Code");
});

it("Philotic Entanglement", () => {
  const state = newGame({
    corp: { deck: ["Philotic Entanglement", qty("House of Knives", 3)] },
    runner: { deck: [qty("Sure Gamble", 3), qty("Cache", 2)] },
  });
  playFromHand(state, "corp", "House of Knives", "New remote");
  playFromHand(state, "corp", "House of Knives", "New remote");
  playFromHand(state, "corp", "House of Knives", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Steal");
  runEmptyServer(state, "remote2");
  clickPrompt(state, "runner", "Steal");
  runEmptyServer(state, "remote3");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).scored.length).toBe(3);
  takeCredits(state, "runner");
  playAndScore(state, "Philotic Entanglement");
  expect(getCorp(state).agendaPoint).toBe(2);
  expect(getRunner(state).discard.length).toBe(3);
});

it("Post-Truth Dividend", () => {
  const state = newGame({ corp: { hand: ["Post-Truth Dividend"], deck: ["Hedge Fund"] } });
  playAndScore(state, "Post-Truth Dividend");
  changed(() => getCorp(state).hand.length, 1, () => {
    clickPrompt(state, "corp", "Yes");
  });
});

it("Posted Bounty - forfeiting takes 1 bad publicity", () => {
  const state = newGame({ corp: { deck: ["Posted Bounty"] } });
  playAndScore(state, "Posted Bounty");
  clickPrompt(state, "corp", "Yes");
  expect(getCorp(state).agendaPoint).toBe(0);
  expect(countBadPub(state)).toBe(1);
  expect(countTags(state)).toBe(1);
});

it("Posted Bounty - choosing not to forfeit scores normally", () => {
  const state = newGame({ corp: { deck: ["Posted Bounty"] } });
  playAndScore(state, "Posted Bounty");
  clickPrompt(state, "corp", "No");
  expect(getCorp(state).agendaPoint).toBe(1);
  expect(countBadPub(state)).toBe(0);
  expect(countTags(state)).toBe(0);
});

it("Priority Requisition", () => {
  const state = newGame({ corp: { deck: ["Priority Requisition", "Archer"] } });
  playFromHand(state, "corp", "Archer", "HQ");
  const arc = getIce(state, "hq", 0);
  playAndScore(state, "Priority Requisition");
  clickCard(state, "corp", arc);
  expect(rezzed(refresh(state, arc))).toBe(true);
});

it("Private Security Force", () => {
  const state = newGame({ corp: { deck: [qty("Private Security Force", 10)] } });
  gainTags(state, "runner", 1);
  playAndScore(state, "Private Security Force");
  const psf = getScored(state, "corp", 0);
  cardAbility(state, "corp", psf, 0);
  expect(getRunner(state).discard.length).toBe(1);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  for (let i = 0; i < 3; i++) {
    cardAbility(state, "corp", psf, 0);
  }
  expect(getRunner(state).discard.length).toBe(3);
  expect((state as any).winner).toBe("corp");
  expect((state as any).reason).toBe("Flatline");
});

it("Profiteering", () => {
  const state = newGame({ corp: { deck: ["Profiteering"] } });
  playAndScore(state, "Profiteering");
  clickPrompt(state, "corp", "3");
  expect(getCorp(state).agendaPoint).toBe(1);
  expect(countBadPub(state)).toBe(3);
  expect(getCorp(state).credit).toBe(20);
});

it("Project Ares", () => {
  const state = newGame({ corp: { deck: [qty("Project Ares", 2)] }, runner: { deck: ["Clone Chip"] } });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Clone Chip");
  takeCredits(state, "runner");
  playAndScore(state, "Project Ares");
  expect(noPrompt(state, "runner")).toBe(true);
  gain(state, "corp", "click", 5);
  playFromHand(state, "corp", "Project Ares", "New remote");
  const ares = getContent(state, "remote2", 0);
  advance(state, ares, 6);
  expect(getCounters(refresh(state, ares), "advancement")).toBe(6);
  score(state, "corp", refresh(state, ares));
  expect(getPromptMap(state, "runner").msg).toBe("Choose 2 installed cards installed cards to trash");
  clickCard(state, "runner", "Clone Chip");
  expect(noPrompt(state, "runner")).toBe(true);
  expect(getRunner(state).discard.length).toBe(1);
  expect(countBadPub(state)).toBe(1);
});

it("Project Atlas", () => {
  const state = newGame({ corp: { deck: ["Project Atlas", "Beanstalk Royalties"] } });
  startingHand(state, "corp", ["Project Atlas"]);
  gain(state, "corp", "click", 10, "credit", 10);
  playFromHand(state, "corp", "Project Atlas", "New remote");
  const atlas = getContent(state, "remote1", 0);
  advance(state, atlas, 4);
  score(state, "corp", refresh(state, atlas));
  const atlasScored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, atlasScored), "agenda")).toBe(1);
  cardAbility(state, "corp", atlasScored, 0);
  clickPrompt(state, "corp", findCard("Beanstalk Royalties", getCorp(state).deck));
  expect(getCounters(refresh(state, atlasScored), "agenda")).toBe(0);
  expect(getCorp(state).hand.length).toBe(1);
});

it("Project Atlas - with Titan", () => {
  const state = newGame({
    corp: { id: "Titan Transnational: Investing In Your Future", deck: [qty("Project Atlas", 2), "Beanstalk Royalties", "Hedge Fund"] },
  });
  startingHand(state, "corp", ["Project Atlas", "Project Atlas"]);
  gain(state, "corp", "click", 10, "credit", 10);
  playFromHand(state, "corp", "Project Atlas", "New remote");
  const atlas = getContent(state, "remote1", 0);
  advance(state, atlas, 3);
  score(state, "corp", refresh(state, atlas));
  const atlasScored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, atlasScored), "agenda")).toBe(1);
  cardAbility(state, "corp", atlasScored, 0);
  clickPrompt(state, "corp", findCard("Beanstalk Royalties", getCorp(state).deck));
  expect(getCounters(refresh(state, atlasScored), "agenda")).toBe(0);
  expect(getCorp(state).hand.length).toBe(2);
  playFromHand(state, "corp", "Project Atlas", "New remote");
  const atlas2 = getContent(state, "remote2", 0);
  advance(state, atlas2, 4);
  score(state, "corp", refresh(state, atlas2));
  const atlasScored2 = getScored(state, "corp", 1);
  expect(getCounters(refresh(state, atlasScored2), "agenda")).toBe(2);
  cardAbility(state, "corp", atlasScored2, 0);
  clickPrompt(state, "corp", findCard("Hedge Fund", getCorp(state).deck));
  expect(getCounters(refresh(state, atlasScored2), "agenda")).toBe(1);
  expect(getCorp(state).hand.length).toBe(2);
});

it("Project Beale", () => {
  const state = newGame({ corp: { deck: [qty("Project Beale", 2)] } });
  gain(state, "corp", "click", 8, "credit", 8);
  playFromHand(state, "corp", "Project Beale", "New remote");
  const pb1 = getContent(state, "remote1", 0);
  advance(state, pb1, 4);
  score(state, "corp", refresh(state, pb1));
  expect(getCorp(state).agendaPoint).toBe(2);
  playFromHand(state, "corp", "Project Beale", "New remote");
  const pb2 = getContent(state, "remote2", 0);
  advance(state, pb2, 5);
  score(state, "corp", refresh(state, pb2));
  expect(getCorp(state).agendaPoint).toBe(5);
});

it("Project Ingatan", () => {
  for (let oa = 0; oa < 5; oa++) {
    const state = newGame({ corp: { hand: ["Project Ingatan", "Vanilla"], discard: ["Ice Wall"] } });
    playFromHand(state, "corp", "Project Ingatan", "New remote");
    playFromHand(state, "corp", "Vanilla", "HQ");
    gain(state, "corp", "click", 10, "credit", 10);
    const ing = getContent(state, "remote1", 0);
    advance(state, ing, 3 + oa);
    score(state, "corp", refresh(state, ing));
    const ingScored = getScored(state, "corp", 0);
    expect(getCounters(refresh(state, ingScored), "agenda")).toBe(oa);
    if (oa > 0) {
      takeCredits(state, "corp");
      changed(() => getCorp(state).credit, 0, () => {
        clickCard(state, "corp", "Ice Wall");
        clickPrompt(state, "corp", "HQ");
      });
    }
  }
});

it("Project Kusanagi", () => {
  const state = newGame({ corp: { deck: [qty("Project Kusanagi", 2), "Ice Wall"] } });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  rez(state, "corp", getIce(state, "hq", 0));
  gain(state, "corp", "click", 10, "credit", 10);
  playAndScore(state, "Project Kusanagi");
  const pk1 = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, pk1), "agenda")).toBe(0);
  playFromHand(state, "corp", "Project Kusanagi", "New remote");
  const pk = getContent(state, "remote2", 0);
  advance(state, pk, 3);
  score(state, "corp", refresh(state, pk));
  const pkScored = getScored(state, "corp", 1);
  expect(getCounters(refresh(state, pkScored), "agenda")).toBe(1);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  cardAbility(state, "corp", pkScored, 0);
  clickCard(state, "corp", getIce(state, "hq", 0));
  expect(lastLogContains(state, "Do 1 net damage")).toBe(true);
  expect(getIce(state, "hq", 0).subroutines.length).toBe(2);
  expect(getCounters(refresh(state, pkScored), "agenda")).toBe(0);
});

it("Project Vacheron - runner steals from HQ", () => {
  const state = newGame({ corp: { deck: ["Project Vacheron"] } });
  takeCredits(state, "corp");
  runEmptyServer(state, "hq");
  expect(getRunner(state).agendaPoint).toBe(0);
  clickPrompt(state, "runner", "Steal");
  for (let n = 0; n < 5; n++) {
    if (n < 4) {
      expect(getRunner(state).agendaPoint).toBe(0);
    } else {
      expect(getRunner(state).agendaPoint).toBe(3);
    }
    expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(4 - n);
    takeCredits(state, "runner");
    takeCredits(state, "corp");
  }
});

it("Project Vacheron - still adding tokens when using Film Critic", () => {
  const state = newGame({ corp: { deck: ["Project Vacheron"] }, runner: { deck: ["Film Critic"] } });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Film Critic");
  runEmptyServer(state, "hq");
  expect(getPromptMap(state, "runner").msg).toBe("Host Project Vacheron on Film Critic?");
  clickPrompt(state, "runner", "Yes");
  cardAbility(state, "runner", getResource(state, 0), 0);
  expect(getRunner(state).agendaPoint).toBe(0);
  expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(4);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(3);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(2);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(1);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(getRunner(state).agendaPoint).toBe(3);
  expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(0);
});

it("Project Vacheron - scoring as corp gives 3 points", () => {
  const state = newGame({ corp: { deck: ["Project Vacheron"] } });
  playAndScore(state, "Project Vacheron");
  expect(getCorp(state).agendaPoint).toBe(3);
});

it("Project Vacheron - steal from Archives gives 3 points", () => {
  const state = newGame({ corp: { hand: ["Project Vacheron"] } });
  trashFromHand(state, "corp", "Project Vacheron");
  takeCredits(state, "corp");
  runEmptyServer(state, "archives");
  clickPrompt(state, "runner", "Steal");
  expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(0);
  expect(getRunner(state).agendaPoint).toBe(3);
});

it("Project Vacheron - additional cards added to runner score area shouldn't add counters", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Project Vacheron"] }, runner: { hand: ["Mad Dash"] } });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Mad Dash");
  clickPrompt(state, "runner", "HQ");
  runContinueUntil(state, "success");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).agendaPoint).toBe(1);
  expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(4);
});

it("Project Vacheron - scoring other agendas shouldn't increase number of counters", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Project Vacheron", "Hostile Takeover"] } });
  playFromHand(state, "corp", "Hostile Takeover", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "hq");
  clickPrompt(state, "runner", "Steal");
  expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(4);
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Steal");
  expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(4);
});

it("Project Vacheron - stealing from Archives shouldn't add any counters", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Hostile Takeover"], discard: ["Project Vacheron"] } });
  playFromHand(state, "corp", "Hostile Takeover", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "archives");
  clickPrompt(state, "runner", "Steal");
  expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(0);
});

it("Project Vacheron - still adds counters when swapped with Turntable", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Project Vacheron", "Hostile Takeover"] },
    runner: { hand: ["Turntable"] },
  });
  playAndScore(state, "Project Vacheron");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Turntable");
  runEmptyServer(state, "hq");
  clickPrompt(state, "runner", "Steal");
  expect(promptIsCard(state, "runner", getHardware(state, 0))).toBe(true);
  clickPrompt(state, "runner", "Yes");
  clickCard(state, "runner", findCard("Project Vacheron", getCorp(state).scored));
  expect(getCounters(getScored(state, "runner", 0), "agenda")).toBe(4);
  expect(getRunner(state).agendaPoint).toBe(0);
  expect(getCorp(state).agendaPoint).toBe(1);
});

it("Project Vitruvius", () => {
  const state = newGame({ corp: { deck: ["Project Vitruvius", "Hedge Fund"] } });
  move(state, "corp", findCard("Hedge Fund", getCorp(state).hand), "discard");
  expect(getCorp(state).discard.length).toBe(1);
  gain(state, "corp", "click", 10, "credit", 10);
  playFromHand(state, "corp", "Project Vitruvius", "New remote");
  const vit = getContent(state, "remote1", 0);
  advance(state, vit, 4);
  score(state, "corp", refresh(state, vit));
  const vitScored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, vitScored), "agenda")).toBe(1);
  cardAbility(state, "corp", vitScored, 0);
  clickCard(state, "corp", findCard("Hedge Fund", getCorp(state).discard));
  expect(getCounters(refresh(state, vitScored), "agenda")).toBe(0);
  expect(getCorp(state).hand.length).toBe(1);
});

it("Project Wotan", () => {
  const state = newGame({ corp: { deck: ["Project Wotan", "Eli 1.0", qty("Hedge Fund", 3)] } });
  startingHand(state, "corp", ["Project Wotan", "Eli 1.0"]);
  playFromHand(state, "corp", "Eli 1.0", "HQ");
  playAndScore(state, "Project Wotan");
  takeCredits(state, "corp");
  const wotScored = getScored(state, "corp", 0);
  const eli = getIce(state, "hq", 0);
  rez(state, "corp", eli);
  expect(getCounters(refresh(state, wotScored), "agenda")).toBe(3);
  runOn(state, "HQ");
  cardAbility(state, "corp", wotScored, 0);
  expect(lastLogContains(state, "End the run")).toBe(true);
  expect(getCounters(refresh(state, wotScored), "agenda")).toBe(2);
  expect(getIce(state, "hq", 0).subroutines.length).toBe(3);
  runContinueUntil(state, "movement");
  runJackOut(state);
  expect(getIce(state, "hq", 0).subroutines.length).toBe(2);
});

it("Project Yagi-Uda - swap ice from HQ", () => {
  const state = newGame({
    corp: { deck: [qty("Project Yagi-Uda", 2), "Eli 1.0", "Eli 2.0", "Jackson Howard", "Prisec", "Hedge Fund"] },
  });
  gain(state, "corp", "click", 10, "credit", 10);
  clickDraw(state, "corp");
  playFromHand(state, "corp", "Project Yagi-Uda", "New remote");
  playFromHand(state, "corp", "Eli 1.0", "New remote");
  const pyu = getContent(state, "remote1", 0);
  advance(state, pyu, 4);
  score(state, "corp", refresh(state, pyu));
  takeCredits(state, "corp");
  const pyuScored = getScored(state, "corp", 0);
  const eli1 = getIce(state, "remote2", 0);
  runOn(state, "remote2");
  cardAbility(state, "corp", pyuScored, 0);
  clickCard(state, "corp", eli1);
  clickCard(state, "corp", "Hedge Fund");
  expect(getIce(state, "remote2", 0).title).toBe("Eli 1.0");
  clickCard(state, "corp", "Jackson Howard");
  expect(getIce(state, "remote2", 0).title).toBe("Eli 1.0");
  clickCard(state, "corp", "Prisec");
  expect(getIce(state, "remote2", 0).title).toBe("Eli 1.0");
  clickCard(state, "corp", findCard("Project Yagi-Uda", getCorp(state).hand));
  expect(getIce(state, "remote2", 0).title).toBe("Eli 1.0");
  clickCard(state, "corp", "Eli 2.0");
  expect(getIce(state, "remote2", 0).title).toBe("Eli 2.0");
  clickPrompt(state, "runner", "No");
});

it("Project Yagi-Uda - swap cards in server with cards in HQ", () => {
  const state = newGame({
    corp: { deck: [qty("Project Yagi-Uda", 2), "Eli 1.0", "Eli 2.0", "Jackson Howard", "Prisec", "Hedge Fund"] },
  });
  gain(state, "corp", "click", 10, "credit", 10);
  clickDraw(state, "corp");
  playFromHand(state, "corp", "Project Yagi-Uda", "New remote");
  playFromHand(state, "corp", "Project Yagi-Uda", "New remote");
  const pyu = getContent(state, "remote1", 0);
  advance(state, pyu, 6);
  score(state, "corp", refresh(state, pyu));
  takeCredits(state, "corp");
  const pyuScored = getScored(state, "corp", 0);
  const pyu2 = getContent(state, "remote2", 0);
  runOn(state, "remote2");
  cardAbility(state, "corp", pyuScored, 0);
  clickCard(state, "corp", pyu2);
  clickCard(state, "corp", "Hedge Fund");
  expect(getContent(state, "remote2", 0).title).toBe("Project Yagi-Uda");
  clickCard(state, "corp", "Eli 2.0");
  expect(getContent(state, "remote2", 0).title).toBe("Project Yagi-Uda");
  clickCard(state, "corp", "Jackson Howard");
  expect(getContent(state, "remote2", 0).title).toBe("Jackson Howard");
  clickPrompt(state, "runner", "No");
  cardAbility(state, "corp", pyuScored, 0);
  clickCard(state, "corp", getContent(state, "remote2", 0));
  clickCard(state, "corp", "Prisec");
  expect(getContent(state, "remote2", 0).title).toBe("Prisec");
  clickPrompt(state, "runner", "No");
  cardAbility(state, "corp", pyuScored, 0);
  clickCard(state, "corp", getContent(state, "remote2", 0));
  clickCard(state, "corp", findCard("Project Yagi-Uda", getCorp(state).hand));
  expect(getContent(state, "remote2", 0).title).toBe("Project Yagi-Uda");
  clickPrompt(state, "runner", "No");
});

it("Project Yagi-Uda - cancel swapping at different stages", () => {
  const state = newGame({ corp: { deck: ["Project Yagi-Uda", "Eli 1.0", "Eli 2.0"] } });
  gain(state, "corp", "click", 10, "credit", 10);
  playFromHand(state, "corp", "Project Yagi-Uda", "New remote");
  playFromHand(state, "corp", "Eli 1.0", "New remote");
  const pyu = getContent(state, "remote1", 0);
  advance(state, pyu, 4);
  score(state, "corp", refresh(state, pyu));
  takeCredits(state, "corp");
  const pyuScored = getScored(state, "corp", 0);
  const eli1 = getIce(state, "remote2", 0);
  runOn(state, "remote2");
  expect(getCounters(refresh(state, pyuScored), "agenda")).toBe(1);
  cardAbility(state, "corp", pyuScored, 0);
  expect(getCounters(refresh(state, pyuScored), "agenda")).toBe(1);
  clickPrompt(state, "corp", "Done");
  expect(getCounters(refresh(state, pyuScored), "agenda")).toBe(1);
  cardAbility(state, "corp", pyuScored, 0);
  clickCard(state, "corp", eli1);
  clickPrompt(state, "corp", "Done");
  expect(getCounters(refresh(state, pyuScored), "agenda")).toBe(1);
});

it("Project Yagi-Uda - jack out", () => {
  const state = newGame({
    corp: { deck: [qty("Project Yagi-Uda", 2), "Eli 1.0", "Eli 2.0", "Jackson Howard", "Prisec", "Hedge Fund"] },
  });
  gain(state, "corp", "click", 10, "credit", 10);
  clickDraw(state, "corp");
  playFromHand(state, "corp", "Project Yagi-Uda", "New remote");
  playFromHand(state, "corp", "Eli 1.0", "New remote");
  const pyu = getContent(state, "remote1", 0);
  advance(state, pyu, 4);
  score(state, "corp", refresh(state, pyu));
  takeCredits(state, "corp");
  const pyuScored = getScored(state, "corp", 0);
  const eli1 = getIce(state, "remote2", 0);
  runOn(state, "remote2");
  cardAbility(state, "corp", pyuScored, 0);
  clickCard(state, "corp", eli1);
  clickCard(state, "corp", "Eli 2.0");
  expect(getIce(state, "remote2", 0).title).toBe("Eli 2.0");
  clickPrompt(state, "runner", "Yes");
  expect(state.run).toBeFalsy();
});

it("Project Yagi-Uda - swap inner ice with HQ", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Project Yagi-Uda", "Eli 1.0", qty("Ice Wall", 2)], credits: 20 },
  });
  gain(state, "corp", "click", 10);
  playFromHand(state, "corp", "Project Yagi-Uda", "New remote");
  const pyu = getContent(state, "remote1", 0);
  advance(state, pyu, 4);
  score(state, "corp", refresh(state, pyu));
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  const pyuScored = getScored(state, "corp", 0);
  runOn(state, "hq");
  cardAbility(state, "corp", pyuScored, 0);
  clickCard(state, "corp", getIce(state, "hq", 0));
  clickCard(state, "corp", "Eli 1.0");
  expect(getIce(state, "hq", 0).title).toBe("Eli 1.0");
  clickPrompt(state, "runner", "No");
});

it("Yagi-Uda swap triggers install", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], credits: 20, hand: ["Tranquility Home Grid", "Project Yagi-Uda", "Project Atlas", "Project Beale"] },
  });
  gain(state, "corp", "click", 10);
  playFromHand(state, "corp", "Tranquility Home Grid", "New remote");
  playFromHand(state, "corp", "Project Beale", "Server 1");
  rez(state, "corp", getContent(state, "remote1", 0));
  playFromHand(state, "corp", "Project Yagi-Uda", "New remote");
  const pyu = getContent(state, "remote2", 0);
  advance(state, pyu, 4);
  score(state, "corp", refresh(state, pyu));
  takeCredits(state, "corp");
  runOn(state, "remote1");
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  clickCard(state, "corp", "Project Beale");
  clickCard(state, "corp", "Project Atlas");
  clickPrompt(state, "corp", "Gain 2 [Credits]");
});

it("Puppet Master", () => {
  const state = newGame({ corp: { deck: ["Puppet Master"] } });
  playAndScore(state, "Puppet Master");
  takeCredits(state, "corp");
  runEmptyServer(state, "archives");
  clickPrompt(state, "corp", "Done");
  expect(noPrompt(state, "runner")).toBe(true);
});

it("Proprionegation - basic", () => {
  const state = newGame({ corp: { hand: ["Proprionegation"] } });
  playAndScore(state, "Proprionegation");
  takeCredits(state, "corp");
  runOn(state, "hq");
  cardAbility(state, "corp", getScored(state, "corp", 0), 0);
  expect((state as any).run.server).toEqual(["archives"]);
});

it("Quantum Predictive Model", () => {
  const state = newGame({
    corp: { deck: [qty("Quantum Predictive Model", 2)], hand: ["Quantum Predictive Model", "Quantum Predictive Model"] },
  });
  playFromHand(state, "corp", "Quantum Predictive Model", "New remote");
  playFromHand(state, "corp", "Quantum Predictive Model", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).agendaPoint).toBe(1);
  runEmptyServer(state, "rd");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).agendaPoint).toBe(2);
  gainTags(state, "runner", 1);
  runEmptyServer(state, "remote2");
  clickPrompt(state, "runner", "OK");
  expect(getRunner(state).agendaPoint).toBe(2);
  expect(getCorp(state).agendaPoint).toBe(1);
  runEmptyServer(state, "rd");
  clickPrompt(state, "runner", "OK");
  expect(getRunner(state).agendaPoint).toBe(2);
  expect(getCorp(state).agendaPoint).toBe(2);
  expect(getCorp(state).deck.length).toBe(0);
});

it("Rebranding Team", () => {
  const state = newGame({
    corp: { hand: ["Rebranding Team", "Launch Campaign", "City Surveillance", "Jackson Howard", "Museum of History", "Advanced Assembly Lines"] },
  });
  playAndScore(state, "Rebranding Team");
  expect(hasSubtype(findCard("Advanced Assembly Lines", getCorp(state).hand), "Advertisement")).toBe(true);
  trashFromHand(state, "corp", "Advanced Assembly Lines");
  expect(hasSubtype(findCard("Advanced Assembly Lines", getCorp(state).discard), "Advertisement")).toBe(true);
  expect(hasSubtype(findCard("Launch Campaign", getCorp(state).hand), "Advertisement")).toBe(true);
  expect(hasSubtype(findCard("City Surveillance", getCorp(state).hand), "Advertisement")).toBe(true);
  expect(hasSubtype(findCard("Jackson Howard", getCorp(state).hand), "Advertisement")).toBe(true);
  expect(hasSubtype(findCard("Jackson Howard", getCorp(state).hand), "Executive")).toBe(true);
  expect(hasSubtype(findCard("Museum of History", getCorp(state).hand), "Advertisement")).toBe(true);
  expect(hasSubtype(findCard("Museum of History", getCorp(state).hand), "Alliance")).toBe(true);
  expect(hasSubtype(findCard("Museum of History", getCorp(state).hand), "Ritzy")).toBe(true);
  move(state, "corp", findCard("Rebranding Team", getCorp(state).scored), "deck");
  expect(hasSubtype(findCard("Launch Campaign", getCorp(state).hand), "Advertisement")).toBe(true);
  expect(hasSubtype(findCard("Advanced Assembly Lines", getCorp(state).discard), "Advertisement")).toBe(false);
  expect(hasSubtype(findCard("City Surveillance", getCorp(state).hand), "Advertisement")).toBe(false);
  expect(hasSubtype(findCard("Jackson Howard", getCorp(state).hand), "Advertisement")).toBe(false);
  expect(hasSubtype(findCard("Jackson Howard", getCorp(state).hand), "Executive")).toBe(true);
  expect(hasSubtype(findCard("Museum of History", getCorp(state).hand), "Advertisement")).toBe(false);
  expect(hasSubtype(findCard("Museum of History", getCorp(state).hand), "Alliance")).toBe(true);
  expect(hasSubtype(findCard("Museum of History", getCorp(state).hand), "Ritzy")).toBe(true);
});

it("Rebranding Team - not active while in runner score area", () => {
  const state = newGame({
    corp: { deck: ["Rebranding Team", "Project Beale", "Museum of History", "Exchange of Information", "Exchange of Information"] },
  });
  playFromHand(state, "corp", "Rebranding Team", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Steal");
  expect(hasSubtype(findCard("Museum of History", getCorp(state).hand), "Advertisement")).toBe(false);
  takeCredits(state, "runner");
  gain(state, "corp", "click", 3);
  playAndScore(state, "Project Beale");
  gainTags(state, "runner", 1);
  playFromHand(state, "corp", "Exchange of Information");
  clickCard(state, "corp", findCard("Rebranding Team", getRunner(state).scored));
  clickCard(state, "corp", findCard("Project Beale", getCorp(state).scored));
  expect(lastLogContains(state, "make all assets gain Advertisement")).toBe(true);
  expect(hasSubtype(findCard("Museum of History", getCorp(state).hand), "Advertisement")).toBe(true);
  playFromHand(state, "corp", "Exchange of Information");
  clickCard(state, "corp", findCard("Project Beale", getRunner(state).scored));
  clickCard(state, "corp", findCard("Rebranding Team", getCorp(state).scored));
  expect(hasSubtype(findCard("Museum of History", getCorp(state).hand), "Advertisement")).toBe(false);
});

it("Reeducation - simple test", () => {
  const state = newGame({
    corp: { deck: ["Reeducation", "Sweeps Week", "Hedge Fund", "Jackson Howard", "Gutenberg"] },
    runner: { deck: ["Self-modifying Code", "Clone Chip", "Corroder", "Sure Gamble", "Desperado"] },
  });
  startingHand(state, "corp", ["Reeducation", "Sweeps Week"]);
  startingHand(state, "runner", ["Self-modifying Code"]);
  playAndScore(state, "Reeducation");
  expect(waiting(state, "runner")).toBe(true);
  expect(getCorp(state).hand.length).toBe(1);
  expect(getRunner(state).hand.length).toBe(1);
  clickPrompt(state, "corp", findCard("Sweeps Week", getCorp(state).hand));
  clickPrompt(state, "corp", "Done");
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).deck[getCorp(state).deck.length - 1].title).toBe("Sweeps Week");
  expect(getRunner(state).deck[getRunner(state).deck.length - 1].title).toBe("Self-modifying Code");
  expect(getCorp(state).hand.length).toBe(1);
  expect(getRunner(state).hand.length).toBe(0);
});

it("Reeducation - extra cards", () => {
  const state = newGame({
    corp: { deck: ["Reeducation", "Sweeps Week", "Hedge Fund", "Jackson Howard", "Gutenberg"] },
    runner: { deck: ["Self-modifying Code", "Clone Chip", "Corroder", "Sure Gamble", "Desperado"] },
  });
  startingHand(state, "corp", ["Reeducation", "Sweeps Week", "Hedge Fund"]);
  startingHand(state, "runner", ["Self-modifying Code"]);
  playAndScore(state, "Reeducation");
  expect(waiting(state, "runner")).toBe(true);
  clickPrompt(state, "corp", findCard("Sweeps Week", getCorp(state).hand));
  clickPrompt(state, "corp", findCard("Hedge Fund", getCorp(state).hand));
  clickPrompt(state, "corp", "Done");
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).deck[getCorp(state).deck.length - 1].title).toBe("Hedge Fund");
  expect(getCorp(state).deck[getCorp(state).deck.length - 2].title).toBe("Sweeps Week");
  expect(getRunner(state).hand[0].title).toBe("Self-modifying Code");
  expect(lastLogContains(state, "Grip")).toBe(false);
});

it("Regenesis", () => {
  const state = newGame({ corp: { deck: [qty("Regenesis", 2), "Hansei Review", "Obokata Protocol"] } });
  playFromHand(state, "corp", "Hansei Review");
  clickCard(state, "corp", "Obokata Protocol");
  playAndScore(state, "Regenesis");
  expect(noPrompt(state, "corp")).toBe(true);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  playAndScore(state, "Regenesis");
  clickCard(state, "corp", "Obokata Protocol");
  expect(getCorp(state).agendaPoint).toBe(5);
});

it("Regenesis - vs Marilyn Campaign trash replacement", () => {
  const state = newGame({ corp: { deck: ["Regenesis", "Marilyn Campaign"], discard: ["Obokata Protocol"] } });
  playFromHand(state, "corp", "Marilyn Campaign", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  for (let i = 0; i < 4; i++) {
    takeCredits(state, "corp");
    takeCredits(state, "runner");
  }
  clickPrompt(state, "corp", "Shuffle Marilyn Campaign into R&D");
  playAndScore(state, "Regenesis");
  clickCard(state, "corp", "Obokata Protocol");
  expect(getCorp(state).agendaPoint).toBe(4);
});

it("Regenesis - not affected by Subliminal Messaging", () => {
  const state = newGame({ corp: { hand: ["Regenesis", "Hansei Review", "Obokata Protocol", "Subliminal Messaging"] } });
  playFromHand(state, "corp", "Subliminal Messaging");
  playFromHand(state, "corp", "Hansei Review");
  clickCard(state, "corp", "Obokata Protocol");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  clickPrompt(state, "corp", "No");
  playAndScore(state, "Regenesis");
  clickCard(state, "corp", "Obokata Protocol");
  expect(getCorp(state).agendaPoint).toBe(4);
});

it("Regenesis - triggering Hyoubu Institute", () => {
  const state = newGame({
    corp: { id: "Hyoubu Institute: Absolute Clarity", hand: ["Regenesis", "Hansei Review", "Obokata Protocol"] },
  });
  playFromHand(state, "corp", "Hansei Review");
  clickCard(state, "corp", "Obokata Protocol");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  changed(() => getCorp(state).credit, 1, () => {
    playAndScore(state, "Regenesis");
    clickCard(state, "corp", "Obokata Protocol");
  });
});

it("Regenesis - extra score not prevented by runner discard", () => {
  const state = newGame({
    corp: { deck: [qty("Regenesis", 6)], hand: ["Bio-Ethics Association"], discard: ["Obokata Protocol"] },
    runner: { deck: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Bio-Ethics Association", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getRunner(state).discard.length).toBe(1);
  playAndScore(state, "Regenesis");
  expect(promptIsCard(state, "corp", getContent(state, "scored-area", 0))).toBe(true);
  expect(promptIsType(state, "corp", "choice")).toBe(true);
  clickCard(state, "corp", "Obokata Protocol");
  expect(getCorp(state).agendaPoint).toBe(4);
});

it("Regulatory Capture", () => {
  const state = newGame({ corp: { hand: [qty("Regulatory Capture", 2)], credits: 10 } });
  playFromHand(state, "corp", "Regulatory Capture", "New remote");
  playFromHand(state, "corp", "Regulatory Capture", "New remote");
  const r1 = getContent(state, "remote1", 0);
  const r2 = getContent(state, "remote2", 0);
  addProp(state, "corp", makeEid(state), refresh(state, r1), "advanceCounter", 4);
  addProp(state, "corp", makeEid(state), refresh(state, r2), "advanceCounter", 1);
  score(state, "corp", refresh(state, r1));
  expect(getContent(state, "remote1", 0)).toBeTruthy();
  gain(state, "corp", "badPublicity", 2);
  core.fakeCheckpoint(state);
  score(state, "corp", refresh(state, r1));
  expect(getContent(state, "remote1", 0)).toBeFalsy();
  gain(state, "corp", "badPublicity", 3);
  core.fakeCheckpoint(state);
  score(state, "corp", refresh(state, r2));
  expect(getContent(state, "remote2", 0)).toBeTruthy();
});

it("Remastered Edition", () => {
  const state = newGame({ corp: { deck: [qty("Remastered Edition", 2), qty("Enigma", 1)] } });
  gain(state, "corp", "click", 3);
  playAndScore(state, "Remastered Edition");
  playFromHand(state, "corp", "Remastered Edition", "New remote");
  const scoredAgenda = getScored(state, "corp", 0);
  const installedAgenda = getContent(state, "remote2", 0);
  cardAbility(state, "corp", refresh(state, scoredAgenda), 0);
  clickCard(state, "corp", refresh(state, installedAgenda));
  expect(getCounters(refresh(state, scoredAgenda), "agenda")).toBe(0);
  expect(getCounters(refresh(state, installedAgenda), "advancement")).toBe(1);
  advance(state, installedAgenda, 3);
  score(state, "corp", refresh(state, installedAgenda));
  playFromHand(state, "corp", "Enigma", "HQ");
  const strikeforce = getScored(state, "corp", 1);
  const enigma = getIce(state, "hq", 0);
  cardAbility(state, "corp", refresh(state, strikeforce), 0);
  clickCard(state, "corp", refresh(state, enigma));
  expect(getCounters(refresh(state, strikeforce), "agenda")).toBe(0);
  expect(getCounters(refresh(state, enigma), "advancement")).toBe(1);
});

it("Remote Data Farm", () => {
  const state = newGame({ corp: { deck: ["Remote Data Farm"] } });
  expect(handSize(state, "corp")).toBe(5);
  playAndScore(state, "Remote Data Farm");
  expect(handSize(state, "corp")).toBe(7);
});

it("Remote Data Farm - logging when entering corp score area", () => {
  const state = newGame({
    corp: { deck: ["Remote Data Farm", "Project Beale", "Exchange of Information", "Exchange of Information"] },
  });
  playFromHand(state, "corp", "Remote Data Farm", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Steal");
  expect(handSize(state, "corp")).toBe(5);
  takeCredits(state, "runner");
  gain(state, "corp", "click", 3);
  playAndScore(state, "Project Beale");
  gainTags(state, "runner", 1);
  playFromHand(state, "corp", "Exchange of Information");
  clickCard(state, "corp", findCard("Remote Data Farm", getRunner(state).scored));
  clickCard(state, "corp", findCard("Project Beale", getCorp(state).scored));
  expect(lastLogContains(state, "increase their maximum hand size by 2")).toBe(true);
  expect(handSize(state, "corp")).toBe(7);
  playFromHand(state, "corp", "Exchange of Information");
  clickCard(state, "corp", findCard("Project Beale", getRunner(state).scored));
  clickCard(state, "corp", findCard("Remote Data Farm", getCorp(state).scored));
  expect(handSize(state, "corp")).toBe(5);
});

it("Remote Data Farm - removed from runner score area", () => {
  const state = newGame({ corp: { deck: ["Remote Data Farm"] }, runner: { deck: ["Data Dealer"] } });
  playFromHand(state, "corp", "Remote Data Farm", "New remote");
  expect(handSize(state, "corp")).toBe(5);
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Steal");
  playFromHand(state, "runner", "Data Dealer");
  cardAbility(state, "runner", getResource(state, 0), 0);
  clickCard(state, "runner", getScored(state, "runner", 0));
  expect(handSize(state, "corp")).toBe(5);
});

it("Remote Enforcement", () => {
  const state = newGame({
    corp: { deck: [qty("Remote Enforcement", 2), "Archer", "Chiyashi"] },
    runner: { id: "Reina Roja: Freedom Fighter" },
  });
  startingHand(state, "corp", ["Remote Enforcement", "Remote Enforcement"]);
  expect(getCorp(state).deck.length).toBe(2);
  playAndScore(state, "Remote Enforcement");
  const N = getCorp(state).credit;
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "corp", findCard("Chiyashi", getCorp(state).deck));
  clickPrompt(state, "corp", "New remote");
  expect(rezzed(getIce(state, "remote2", 0))).toBe(true);
  expect(getCorp(state).credit).toBe(N);
  playAndScore(state, "Remote Enforcement");
  const N2 = getCorp(state).credit;
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "corp", findCard("Archer", getCorp(state).deck));
  clickPrompt(state, "corp", "Server 2");
  expect(getCorp(state).credit).toBe(N2 - 1);
  expect(noPrompt(state, "corp")).toBe(false);
  expect(getCorp(state).credit).toBe(N2 - 1);
});

it("Research Grant", () => {
  const state = newGame({ corp: { deck: [qty("Research Grant", 2)] } });
  playFromHand(state, "corp", "Research Grant", "New remote");
  playAndScore(state, "Research Grant");
  clickCard(state, "corp", getContent(state, "remote1", 0));
  expect(getCorp(state).scored.length).toBe(2);
});

it("Research Grant - single", () => {
  const state = newGame({ corp: { deck: [qty("Research Grant", 1)] } });
  playAndScore(state, "Research Grant");
  expect(getCorp(state).scored.length).toBe(1);
});

it("Research Grant - with Team Sponsorship", () => {
  const state = newGame({ corp: { deck: [qty("Research Grant", 3), qty("Team Sponsorship", 1)] } });
  playFromHand(state, "corp", "Team Sponsorship", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  playAndScore(state, "Research Grant");
  clickCard(state, "corp", findCard("Research Grant", getCorp(state).hand));
  clickPrompt(state, "corp", "New remote");
  clickCard(state, "corp", getContent(state, "remote3", 0));
  clickCard(state, "corp", findCard("Research Grant", getCorp(state).hand));
  clickPrompt(state, "corp", "New remote");
  clickCard(state, "corp", getContent(state, "remote4", 0));
  expect(getCorp(state).scored.length).toBe(3);
});

it("Research Grant - vs Leela", () => {
  const state = newGame({
    corp: { deck: [qty("Research Grant", 2), qty("Ice Wall", 2)] },
    runner: { id: "Leela Patel: Trained Pragmatist", deck: ["Sure Gamble"] },
  });
  gain(state, "corp", "click", 1);
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playFromHand(state, "corp", "Ice Wall", "R&D");
  playFromHand(state, "corp", "Research Grant", "New remote");
  playAndScore(state, "Research Grant");
  clickCard(state, "corp", getContent(state, "remote1", 0));
  expect(getCorp(state).scored.length).toBe(2);
  clickCard(state, "runner", getIce(state, "hq", 0));
  clickCard(state, "runner", getIce(state, "rd", 0));
});

it("Restructured Datapool", () => {
  const state = newGame({ corp: { deck: ["Restructured Datapool"] } });
  expect(countTags(state)).toBe(0);
  playAndScore(state, "Restructured Datapool");
  const rdScored = getScored(state, "corp", 0);
  cardAbility(state, "corp", rdScored, 0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(countTags(state)).toBe(1);
});

it("Sacrifice Zone Expansion", () => {
  const state = newGame({ corp: { hand: ["Sacrifice Zone Expansion"] } });
  playFromHand(state, "corp", "Sacrifice Zone Expansion", "New remote");
  changed(() => getCorp(state).credit, 2, () => {
    clickAdvance(state, "corp", getContent(state, "remote1", 0));
  });
  changed(() => getCorp(state).credit, -1, () => {
    clickAdvance(state, "corp", getContent(state, "remote1", 0));
  });
  takeCredits(state, "corp");
  runEmptyServer(state, "hq");
  changed(() => getRunner(state).hand.length, -1, () => {
    clickPrompt(state, "corp", "Yes");
  });
});

it("Salvo Testing", () => {
  const state = newGame({ corp: { hand: ["Salvo Testing", "Project Vitruvius"], credits: 10 }, runner: { hand: [qty("Sure Gamble", 2)] } });
  changed(() => getRunner(state).hand.length, -1, () => {
    playAndScore(state, "Salvo Testing");
    clickPrompt(state, "corp", "Yes");
  });
  expect(getRunner(state).brainDamage).toBe(1);
  changed(() => getRunner(state).hand.length, -1, () => {
    playAndScore(state, "Project Vitruvius");
    clickPrompt(state, "corp", "Yes");
  });
  expect(getRunner(state).brainDamage).toBe(2);
});

it("SDS Drone Deployment - corp score, program installed", () => {
  const state = newGame({ corp: { hand: ["SDS Drone Deployment"] }, runner: { hand: ["Cache"] } });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Cache");
  takeCredits(state, "runner");
  playAndScore(state, "SDS Drone Deployment");
  const cache = getProgram(state, 0);
  expect(promptIsType(state, "corp", "select")).toBe(true);
  clickCard(state, "corp", "Cache");
  expect(refresh(state, cache)).toBeFalsy();
  expect(findCard("Cache", getRunner(state).discard)).toBeTruthy();
});

it("SDS Drone Deployment - corp score, no program", () => {
  const state = newGame({ corp: { hand: ["SDS Drone Deployment"] } });
  playAndScore(state, "SDS Drone Deployment");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("SDS Drone Deployment - runner steal, program installed", () => {
  const state = newGame({ corp: { hand: ["SDS Drone Deployment"] }, runner: { hand: ["Cache"] } });
  playFromHand(state, "corp", "SDS Drone Deployment", "New remote");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Cache");
  runEmptyServer(state, "Server 1");
  const cache = getProgram(state, 0);
  expect(promptButtons(state, "runner")).toEqual(["Pay to steal", "No action"]);
  clickPrompt(state, "runner", "Pay to steal");
  clickCard(state, "runner", "Cache");
  expect(refresh(state, cache)).toBeFalsy();
  expect(findCard("Cache", getRunner(state).discard)).toBeTruthy();
  expect(findCard("SDS Drone Deployment", getRunner(state).scored)).toBeTruthy();
});

it("SDS Drone Deployment - runner steal, no program", () => {
  const state = newGame({ corp: { hand: ["SDS Drone Deployment"] } });
  playFromHand(state, "corp", "SDS Drone Deployment", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  expect(promptButtons(state, "runner")).toEqual(["No action"]);
});

it("SDS Drone Deployment - ensure effect is async", () => {
  const state = newGame({
    corp: { hand: ["Amani Senai", "Team Sponsorship", "SDS Drone Deployment", "NGO Front"], credits: 10 },
    runner: { hand: ["Cache", "Corroder"], credits: 10 },
  });
  playFromHand(state, "corp", "Amani Senai", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  playFromHand(state, "corp", "Team Sponsorship", "New remote");
  rez(state, "corp", getContent(state, "remote2", 0));
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Cache");
  playFromHand(state, "runner", "Corroder");
  takeCredits(state, "runner");
  playAndScore(state, "SDS Drone Deployment");
  expect(getPromptMap(state, "corp").msg).toBe("Choose a trigger to resolve");
  expect(new Set(promptTitles(state, "corp"))).toEqual(new Set(["SDS Drone Deployment", "Amani Senai", "Team Sponsorship", "Done"]));
  clickPrompt(state, "corp", "SDS Drone Deployment");
  clickCard(state, "corp", "Cache");
  clickPrompt(state, "corp", "Amani Senai");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", "Corroder");
  clickCard(state, "corp", "NGO Front");
  clickPrompt(state, "corp", "New remote");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(noPrompt(state, "runner")).toBe(true);
});

it("See How They Run - win psi", () => {
  const state = newGame({ corp: { hand: ["See How They Run"] }, runner: { hand: ["Sure Gamble"] } });
  changedMulti(
    [
      [() => countTags(state), 1],
      [() => getRunner(state).hand.length, -1],
      [() => getRunner(state).discard.length, 1],
      [() => getRunner(state).brainDamage, 1],
    ],
    () => {
      playAndScore(state, "See How They Run");
      clickPrompt(state, "corp", "0 [Credits]");
      clickPrompt(state, "runner", "1 [Credits]");
    }
  );
});

it("See How They Run - lose psi", () => {
  const state = newGame({ corp: { hand: ["See How They Run"] }, runner: { hand: ["Sure Gamble"] } });
  changedMulti(
    [
      [() => countTags(state), 1],
      [() => getRunner(state).hand.length, -1],
      [() => getRunner(state).discard.length, 1],
      [() => getRunner(state).brainDamage, 0],
    ],
    () => {
      playAndScore(state, "See How They Run");
      clickPrompt(state, "corp", "0 [Credits]");
      clickPrompt(state, "runner", "0 [Credits]");
    }
  );
});

it("Self-Destruct Chips", () => {
  const state = newGame({ corp: { deck: ["Self-Destruct Chips"] } });
  expect(handSize(state, "runner")).toBe(5);
  playAndScore(state, "Self-Destruct Chips");
  expect(handSize(state, "runner")).toBe(4);
});

it("Self-Destruct Chips - logging when entering corp score area", () => {
  const state = newGame({
    corp: { deck: ["Self-Destruct Chips", "Project Vitruvius", "Exchange of Information", "Exchange of Information"] },
  });
  playFromHand(state, "corp", "Self-Destruct Chips", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Steal");
  expect(handSize(state, "runner")).toBe(5);
  takeCredits(state, "runner");
  gain(state, "corp", "click", 3);
  playAndScore(state, "Project Vitruvius");
  gainTags(state, "runner", 1);
  playFromHand(state, "corp", "Exchange of Information");
  clickCard(state, "corp", findCard("Self-Destruct Chips", getRunner(state).scored));
  clickCard(state, "corp", findCard("Project Vitruvius", getCorp(state).scored));
  expect(lastLogContains(state, "decrease the Runner's maximum hand size by 1")).toBe(true);
  expect(handSize(state, "runner")).toBe(4);
  playFromHand(state, "corp", "Exchange of Information");
  clickCard(state, "corp", findCard("Project Vitruvius", getRunner(state).scored));
  clickCard(state, "corp", findCard("Self-Destruct Chips", getCorp(state).scored));
  expect(handSize(state, "runner")).toBe(5);
});

it("Send a Message - corp score", () => {
  const state = newGame({ corp: { deck: ["Send a Message", "Archer"] } });
  playFromHand(state, "corp", "Archer", "HQ");
  const archer = getIce(state, "hq", 0);
  playAndScore(state, "Send a Message");
  clickCard(state, "corp", archer);
  expect(rezzed(refresh(state, archer))).toBe(true);
  expect(noPrompt(state, "runner")).toBe(true);
});

it("Send a Message - steal", () => {
  const state = newGame({ corp: { deck: ["Send a Message", "Archer"] } });
  playFromHand(state, "corp", "Archer", "HQ");
  playFromHand(state, "corp", "Send a Message", "New remote");
  const archer = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Steal");
  clickCard(state, "corp", archer);
  expect(rezzed(refresh(state, archer))).toBe(true);
  expect(noPrompt(state, "runner")).toBe(true);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Sensor Net Activation", () => {
  const state = newGame({ corp: { deck: [qty("Sensor Net Activation", 2), "Enforcer 1.0", "Ash 2X3ZB9CY"] } });
  playFromHand(state, "corp", "Enforcer 1.0", "HQ");
  playAndScore(state, "Sensor Net Activation");
  const sna = getScored(state, "corp", 0);
  const enf = getIce(state, "hq", 0);
  expect(getCounters(refresh(state, sna), "agenda")).toBe(1);
  expect(rezzed(refresh(state, enf))).toBe(false);
  cardAbility(state, "corp", refresh(state, sna), 0);
  clickCard(state, "corp", enf);
  expect(rezzed(refresh(state, enf))).toBe(true);
  expect(getCorp(state).scored.length).toBe(1);
  takeCredits(state, "corp");
  expect(rezzed(refresh(state, enf))).toBe(false);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  playFromHand(state, "corp", "Ash 2X3ZB9CY", "New remote");
  playAndScore(state, "Sensor Net Activation");
  takeCredits(state, "corp");
  const sna2 = getScored(state, "corp", 1);
  const ash = getContent(state, "remote2", 0);
  expect(getCounters(refresh(state, sna2), "agenda")).toBe(1);
  expect(rezzed(refresh(state, ash))).toBe(false);
  cardAbility(state, "corp", refresh(state, sna2), 0);
  clickCard(state, "corp", ash);
  expect(rezzed(refresh(state, ash))).toBe(true);
  takeCredits(state, "runner");
  expect(rezzed(refresh(state, ash))).toBe(false);
});

it("Sericulture Expansion", () => {
  const state = newGame({ corp: { hand: ["Sericulture Expansion", "NGO Front"] } });
  gain(state, "corp", "click", 10, "credit", 10);
  playFromHand(state, "corp", "Sericulture Expansion", "New remote");
  playFromHand(state, "corp", "NGO Front", "New remote");
  const pr = getContent(state, "remote1", 0);
  advance(state, pr, 5);
  score(state, "corp", refresh(state, pr));
  const scored = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, scored), "agenda")).toBe(2);
  changed(() => getCounters(refresh(state, scored), "agenda"), -1, () => {
    takeCredits(state, "corp");
    clickCard(state, "corp", "NGO Front");
    expect(getCounters(getContent(state, "remote2", 0), "advancement")).toBe(2);
  });
  expect(noPrompt(state, "runner")).toBe(true);
});

it("Show of Force", () => {
  const state = newGame({ corp: { deck: ["Show of Force"] } });
  expect(getRunner(state).hand.length).toBe(3);
  playAndScore(state, "Show of Force");
  expect(getRunner(state).hand.length).toBe(1);
  expect(getRunner(state).discard.length).toBe(2);
});

it("Sisyphus Protocol - trash from HQ", () => {
  const state = newGame({ corp: { hand: ["Sisyphus Protocol", "Tithe", "Hedge Fund"] } });
  playAndScore(state, "Sisyphus Protocol");
  playFromHand(state, "corp", "Tithe", "R&D");
  takeCredits(state, "corp");
  const tithe = getIce(state, "rd", 0);
  runOn(state, "R&D");
  rez(state, "corp", tithe);
  runContinue(state);
  runContinue(state);
  expect((state as any).run.position).toBe(0);
  changedMulti(
    [[() => getCorp(state).hand.length, -1], [() => getCorp(state).discard.length, 1]],
    () => {
      clickPrompt(state, "corp", "Trash 1 card from HQ");
      clickCard(state, "corp", "Hedge Fund");
    }
  );
  expect((state as any).run.position).toBe(0);
  runContinue(state);
  runJackOut(state);
  runOn(state, "R&D");
  runContinue(state);
  runContinue(state);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Sisyphus Protocol - pay credits", () => {
  const state = newGame({ corp: { hand: ["Sisyphus Protocol", "Whitespace"] } });
  playAndScore(state, "Sisyphus Protocol");
  playFromHand(state, "corp", "Whitespace", "HQ");
  takeCredits(state, "corp");
  const ws = getIce(state, "hq", 0);
  runOn(state, "HQ");
  rez(state, "corp", ws);
  runContinue(state);
  runContinue(state);
  expect((state as any).run.position).toBe(0);
  changed(() => getCorp(state).credit, -1, () => {
    clickPrompt(state, "corp", "Pay 1 [Credit]");
  });
  expect((state as any).run.position).toBe(0);
});

it("Slash and Burn Agriculture", () => {
  const state = newGame({ corp: { deck: ["Slash and Burn Agriculture", "PAD Campaign", "Ice Wall"] } });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  playFromHand(state, "corp", "PAD Campaign", "New remote");
  const iw = getIce(state, "hq", 0);
  const pad = getContent(state, "remote1", 0);
  const agri = getCorp(state).hand[0];
  expend(state, "corp", agri);
  changed(() => getCounters(refresh(state, pad), "advancement"), 0, () => {
    clickCard(state, "corp", pad);
  });
  changed(() => getCounters(refresh(state, iw), "advancement"), 2, () => {
    clickCard(state, "corp", iw);
  });
  expect(getCorp(state).credit).toBe(4);
  expect(getCorp(state).discard.length).toBe(1);
});

it("SSL Endorsement - corp score area", () => {
  const state = newGame({ corp: { deck: ["SSL Endorsement"] } });
  playAndScore(state, "SSL Endorsement");
  for (const take of [false, true, false, false, true, true]) {
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect(noPrompt(state, "corp")).toBe(false);
    if (!take) {
      changed(() => getCorp(state).credit, 0, () => { clickPrompt(state, "corp", "No"); });
    } else {
      changed(() => getCorp(state).credit, 3, () => { clickPrompt(state, "corp", "Yes"); });
    }
  }
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("SSL Endorsement - runner score area", () => {
  const state = newGame({ corp: { deck: ["SSL Endorsement"] } });
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "Steal");
  takeCredits(state, "runner");
  for (const take of [false, true, false, false, true, true]) {
    expect(noPrompt(state, "corp")).toBe(false);
    if (!take) {
      changed(() => getCorp(state).credit, 0, () => { clickPrompt(state, "corp", "No"); });
    } else {
      changed(() => getCorp(state).credit, 3, () => { clickPrompt(state, "corp", "Yes"); });
    }
    takeCredits(state, "corp");
    takeCredits(state, "runner");
  }
  expect(noPrompt(state, "corp")).toBe(true);
});

it("SSL Endorsement - register event when swapped with Turntable", () => {
  const state = newGame({ corp: { deck: ["SSL Endorsement", "Breaking News"] }, runner: { deck: ["Turntable"] } });
  playFromHand(state, "corp", "Breaking News", "New remote");
  playAndScore(state, "SSL Endorsement");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Turntable");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Steal");
  clickPrompt(state, "runner", "Yes");
  clickCard(state, "runner", findCard("SSL Endorsement", getCorp(state).scored));
  takeCredits(state, "runner");
  expect(noPrompt(state, "corp")).toBe(false);
  expect(getCorp(state).credit).toBe(6);
  clickPrompt(state, "corp", "Yes");
  expect(getCorp(state).credit).toBe(9);
});

it("Standoff - runner declines first", () => {
  const state = newGame({ corp: { deck: ["Standoff", "Ice Wall", "News Team"] }, runner: { deck: ["Cache"] } });
  startingHand(state, "corp", ["Standoff", "Ice Wall"]);
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Cache");
  takeCredits(state, "runner");
  playAndScore(state, "Standoff");
  startingHand(state, "corp", []);
  expect(getRunner(state).discard.length).toBe(0);
  clickCard(state, "runner", getProgram(state, 0));
  expect(getRunner(state).discard.length).toBe(1);
  expect(getCorp(state).discard.length).toBe(0);
  clickCard(state, "corp", getIce(state, "hq", 0));
  expect(getCorp(state).discard.length).toBe(1);
  expect(getCorp(state).hand.length).toBe(0);
  const credits = getCorp(state).credit;
  clickPrompt(state, "runner", "Done");
  expect(getCorp(state).credit).toBe(credits + 5);
  expect(getCorp(state).hand.length).toBe(1);
});

it("Standoff - corp declines first", () => {
  const state = newGame({ corp: { deck: ["Standoff", "Ice Wall", "News Team"] }, runner: { deck: ["Cache", "Cache"] } });
  startingHand(state, "corp", ["Standoff", "Ice Wall"]);
  playFromHand(state, "corp", "Ice Wall", "HQ");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Cache");
  playFromHand(state, "runner", "Cache");
  takeCredits(state, "runner");
  playAndScore(state, "Standoff");
  startingHand(state, "corp", []);
  clickCard(state, "runner", getProgram(state, 0));
  expect(getRunner(state).discard.length).toBe(1);
  clickCard(state, "corp", getIce(state, "hq", 0));
  expect(getCorp(state).discard.length).toBe(1);
  expect(getCorp(state).hand.length).toBe(0);
  clickCard(state, "runner", getProgram(state, 0));
  expect(getRunner(state).discard.length).toBe(2);
  const credits = getCorp(state).credit;
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).credit).toBe(credits);
  expect(getCorp(state).hand.length).toBe(0);
});

it("Stegodon MK IV", () => {
  const state = newGame({ corp: { hand: ["Stegodon MK IV", qty("Ice Wall", 2)], credits: 10 }, runner: { hand: ["Corroder"] } });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  rez(state, "corp", getIce(state, "hq", 0));
  playFromHand(state, "corp", "Ice Wall", "R&D");
  rez(state, "corp", getIce(state, "rd", 0));
  playAndScore(state, "Stegodon MK IV");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  const corr = getProgram(state, 0);
  runOn(state, "HQ");
  expect(getStrength(refresh(state, corr))).toBe(2);
  changed(() => getCorp(state).credit, 1, () => {
    clickCard(state, "corp", getIce(state, "rd", 0));
  });
  expect(getStrength(refresh(state, corr))).toBe(0);
  runContinue(state);
  cardAbility(state, "runner", refresh(state, corr), 0);
  expect(noPrompt(state, "runner")).toBe(true);
  runContinue(state);
  runContinue(state);
  runOn(state, "Archives");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(getStrength(refresh(state, corr))).toBe(2);
});

it("Sting! - corp score, runner steal, corp score", () => {
  const state = newGame({ corp: { deck: [qty("Sting!", 3)] }, runner: { deck: [qty("Spy Camera", 5)] } });
  expect(getRunner(state).hand.length).toBe(5);
  playFromHand(state, "corp", "Sting!", "New remote");
  playAndScore(state, "Sting!");
  expect(getRunner(state).discard.length).toBe(1);
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).discard.length).toBe(3);
  takeCredits(state, "runner");
  playAndScore(state, "Sting!");
  expect(getRunner(state).discard.length).toBe(5);
});

it("Sting! - swapping agendas does no damage", () => {
  const state = newGame({ corp: { deck: ["Exchange of Information", "Sting!", "Jumon"] }, runner: { deck: [qty("Spy Camera", 5)] } });
  playAndScore(state, "Sting!");
  takeCredits(state, "corp");
  core.steal(state, "runner", makeEid(state), findCard("Jumon", getCorp(state).hand));
  takeCredits(state, "runner");
  gainTags(state, "runner", 1);
  playFromHand(state, "corp", "Exchange of Information");
  clickCard(state, "corp", findCard("Jumon", getRunner(state).scored));
  clickCard(state, "corp", findCard("Sting!", getCorp(state).scored));
  expect(getRunner(state).discard.length).toBe(1);
});

it("Stoke the Embers", () => {
  const state = newGame({
    corp: { id: "Hyoubu Institute: Absolute Clarity", hand: ["Stoke the Embers", "NGO Front", "Restore"], discard: ["Stoke the Embers"] },
  });
  playFromHand(state, "corp", "NGO Front", "New remote");
  changed(() => getCorp(state).credit, 3, () => {
    playAndScore(state, "Stoke the Embers");
    clickCard(state, "corp", "NGO Front");
  });
  expect(getCounters(getContent(state, "remote1", 0), "advancement")).toBe(1);
  playFromHand(state, "corp", "Restore");
  clickCard(state, "corp", findCard("Stoke the Embers", getCorp(state).discard));
  changed(() => getCorp(state).credit, 3, () => {
    clickPrompt(state, "corp", "New remote");
    clickPrompt(state, "corp", "Yes");
    clickCard(state, "corp", getContent(state, "remote3", 0));
  });
  expect(getCounters(getContent(state, "remote3", 0), "advancement")).toBe(1);
});

it("Successful Field Test", () => {
  const state = newGame({ corp: { deck: ["Successful Field Test", qty("Ice Wall", 10)] } });
  startingHand(state, "corp", ["Successful Field Test", "Ice Wall", "Ice Wall", "Ice Wall", "Ice Wall", "Ice Wall", "Ice Wall", "Ice Wall", "Ice Wall", "Ice Wall", "Ice Wall"]);
  expect(getCorp(state).credit).toBe(5);
  playAndScore(state, "Successful Field Test");
  for (let i = 0; i < 10; i++) {
    clickCard(state, "corp", findCard("Ice Wall", getCorp(state).hand));
    clickPrompt(state, "corp", "HQ");
  }
  expect(getCorp(state).credit).toBe(5);
  expect(getIce(state, "hq", 9)).toBeTruthy();
});

it("Superconducting Hub", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Superconducting Hub"], credits: 10 } });
  gain(state, "corp", "click", 10);
  playFromHand(state, "corp", "Superconducting Hub", "New remote");
  changed(() => getCorp(state).hand.length, 2, () => {
    scoreAgenda(state, "corp", getContent(state, "remote1", 0));
    clickPrompt(state, "corp", "Yes");
  });
  expect(handSize(state, "corp")).toBe(7);
});

it("Superior Cyberwalls", () => {
  const state = newGame({ corp: { deck: ["Superior Cyberwalls", "Ice Wall"] } });
  playFromHand(state, "corp", "Ice Wall", "HQ");
  const iw = getIce(state, "hq", 0);
  rez(state, "corp", iw);
  expect(getStrength(refresh(state, iw))).toBe(1);
  expect(getCorp(state).credit).toBe(4);
  playAndScore(state, "Superior Cyberwalls");
  expect(getStrength(refresh(state, iw))).toBe(2);
  expect(getCorp(state).credit).toBe(5);
});

it("TGTBT", () => {
  const state = newGame({ corp: { deck: [qty("TGTBT", 2), "Old Hollywood Grid"] } });
  playFromHand(state, "corp", "TGTBT", "New remote");
  playFromHand(state, "corp", "Old Hollywood Grid", "Server 1");
  playFromHand(state, "corp", "TGTBT", "New remote");
  takeCredits(state, "corp");
  const tg1 = getContent(state, "remote1", 0);
  const ohg = getContent(state, "remote1", 1);
  rez(state, "corp", ohg);
  runEmptyServer(state, "Server 1");
  clickCard(state, "runner", tg1);
  expect(countTags(state)).toBe(1);
  clickPrompt(state, "runner", "No action");
  clickPrompt(state, "runner", "Pay 4 [Credits] to trash");
  runEmptyServer(state, "Server 2");
  clickPrompt(state, "runner", "Steal");
  expect(countTags(state)).toBe(2);
});

it("The Basalt Spire", () => {
  const state = newGame({ corp: { deck: ["Hedge Fund"], hand: [qty("The Basalt Spire", 2)], discard: ["Ice Wall"] } });
  playAndScore(state, "The Basalt Spire");
  const tbs = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, tbs), "agenda")).toBe(2);
  changedMulti(
    [
      [() => getCounters(refresh(state, tbs), "agenda"), -1],
      [() => getCorp(state).discard.length, 1],
      [() => getCorp(state).deck.length, -1],
    ],
    () => { cardAbility(state, "corp", refresh(state, tbs), 0); }
  );
  changed(() => getCorp(state).hand.length, 1, () => {
    clickCard(state, "corp", "Hedge Fund");
  });
  playFromHand(state, "corp", "The Basalt Spire", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 2");
  clickPrompt(state, "runner", "Steal");
  changed(() => getCorp(state).hand.length, 1, () => {
    clickCard(state, "corp", "Ice Wall");
  });
});

it("The Cleaners", () => {
  const state = newGame({ corp: { deck: ["The Cleaners", "Scorched Earth"] }, runner: { deck: [qty("Sure Gamble", 3), qty("Diesel", 3)] } });
  playAndScore(state, "The Cleaners");
  gainTags(state, "runner", 1);
  playFromHand(state, "corp", "Scorched Earth");
  expect(getRunner(state).hand.length).toBe(0);
});

it("The Cleaners - no bonus damage when runner suffers damage from Cybernetics", () => {
  const state = newGame({ corp: { deck: ["The Cleaners"] }, runner: { deck: [qty("Respirocytes", 3)] } });
  playAndScore(state, "The Cleaners");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Respirocytes");
  expect(getRunner(state).hand.length).toBe(1);
});

it("The Future is Now - with at least one card in deck", () => {
  const state = newGame({ corp: { deck: ["The Future is Now", "Ice Wall"] } });
  startingHand(state, "corp", ["The Future is Now"]);
  expect(getCorp(state).hand.length).toBe(1);
  expect(getCorp(state).deck.length).toBe(1);
  playAndScore(state, "The Future is Now");
  clickPrompt(state, "corp", findCard("Ice Wall", getCorp(state).deck));
  expect(getCorp(state).hand.length).toBe(1);
  expect(getCorp(state).deck.length).toBe(0);
});

it("The Future is Now - with empty deck", () => {
  const state = newGame({ corp: { deck: ["The Future is Now"] } });
  expect(getCorp(state).hand.length).toBe(1);
  expect(getCorp(state).deck.length).toBe(0);
  playAndScore(state, "The Future is Now");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(getCorp(state).hand.length).toBe(0);
  expect(getCorp(state).deck.length).toBe(0);
});

it("The Future Perfect", () => {
  const state = newGame({ corp: { deck: [qty("The Future Perfect", 2)] } });
  playFromHand(state, "corp", "The Future Perfect", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "corp", "1 [Credits]");
  clickPrompt(state, "runner", "0 [Credits]");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).agendaPoint).toBe(0);
  runEmptyServer(state, "HQ");
  clickPrompt(state, "corp", "1 [Credits]");
  clickPrompt(state, "runner", "1 [Credits]");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).agendaPoint).toBe(3);
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).agendaPoint).toBe(6);
});

it("Timely Public Release - install outside run", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Timely Public Release", "Enigma"] } });
  playAndScore(state, "Timely Public Release");
  const tpr = getScored(state, "corp", 0);
  expect(getCounters(refresh(state, tpr), "agenda")).toBe(1);
  cardAbility(state, "corp", refresh(state, tpr), 0);
  move(state, "corp", Object.assign(findCard("Enigma", getCorp(state).hand), { seen: true }), "discard");
  clickCard(state, "corp", "Enigma");
  expect(promptButtons(state, "corp")).toEqual(["Archives", "R&D", "HQ", "New remote"]);
  clickPrompt(state, "corp", "HQ");
  clickPrompt(state, "corp", "0");
  expect(getIce(state, "hq", 0).title).toBe("Enigma");
  expect(getCorp(state).hand.length).toBe(0);
  expect(getCounters(refresh(state, tpr), "agenda")).toBe(0);
});

it("Timely Public Release - install on new remote", () => {
  const state = newGame({ corp: { hand: ["Timely Public Release", "Enigma"] } });
  playAndScore(state, "Timely Public Release");
  const tpr = getScored(state, "corp", 0);
  cardAbility(state, "corp", refresh(state, tpr), 0);
  clickCard(state, "corp", "Enigma");
  clickPrompt(state, "corp", "New remote");
  clickPrompt(state, "corp", "0");
  expect(getIce(state, "remote2", 0).title).toBe("Enigma");
});

it("Tomorrow's Headline - scored", () => {
  const state = newGame({ corp: { deck: ["Tomorrow's Headline"] } });
  changed(() => countTags(state), 1, () => {
    playAndScore(state, "Tomorrow's Headline");
  });
});

it("Tomorrow's Headline - stolen", () => {
  const state = newGame({ corp: { deck: ["Tomorrow's Headline"] } });
  playFromHand(state, "corp", "Tomorrow's Headline", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  changed(() => countTags(state), 1, () => {
    clickPrompt(state, "runner", "Steal");
  });
});

it("Tomorrow's Headline - no tag when swapping agendas", () => {
  const state = newGame({ corp: { deck: ["Tomorrow's Headline", "Exchange of Information", "Project Beale"] } });
  playFromHand(state, "corp", "Project Beale", "New remote");
  playAndScore(state, "Tomorrow's Headline");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Steal");
  takeCredits(state, "runner");
  playFromHand(state, "corp", "Exchange of Information");
  clickCard(state, "corp", findCard("Project Beale", getRunner(state).scored));
  clickCard(state, "corp", findCard("Tomorrow's Headline", getCorp(state).scored));
  expect(countTags(state)).toBe(1);
});

it("Transport Monopoly - basic functionality", () => {
  const state = newGame({ corp: { deck: ["Transport Monopoly", "Hedge Fund"] }, runner: { deck: [qty("Dirty Laundry", 3)] } });
  playAndScore(state, "Transport Monopoly");
  takeCredits(state, "corp");
  const tm = getScored(state, "corp", 0);
  changed(() => getRunner(state).credit, -2, () => {
    playFromHand(state, "runner", "Dirty Laundry");
    clickPrompt(state, "runner", "HQ");
    runContinue(state);
    cardAbility(state, "corp", refresh(state, tm), 0);
    runContinue(state);
    expect(accessing(state, "Hedge Fund")).toBe(true);
    clickPrompt(state, "runner", "No action");
  });
  changed(() => getRunner(state).credit, 3, () => {
    playFromHand(state, "runner", "Dirty Laundry");
    clickPrompt(state, "runner", "HQ");
    runContinue(state);
    runContinue(state);
    clickPrompt(state, "runner", "No action");
  });
});

it("Transport Monopoly - Stargate interaction", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Transport Monopoly"] },
    runner: { deck: [qty("Sure Gamble", 3)], hand: ["Stargate"] },
  });
  playAndScore(state, "Transport Monopoly");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Stargate");
  const tm = getScored(state, "corp", 0);
  const stargate = getProgram(state, 0);
  cardAbility(state, "runner", stargate, 0);
  runContinue(state);
  cardAbility(state, "corp", refresh(state, tm), 0);
  runContinue(state);
  expect(accessing(state, "Hedge Fund")).toBe(true);
  clickPrompt(state, "runner", "No action");
});

it("Underway Renovation", () => {
  const state = newGame({ corp: { deck: ["Underway Renovation", "Shipment from SanSan"] } });
  gain(state, "corp", "click", 2);
  startingHand(state, "runner", []);
  playFromHand(state, "corp", "Underway Renovation", "New remote");
  const ur = getContent(state, "remote1", 0);
  advance(state, ur);
  expect(lastLogContains(state, "Sure Gamble")).toBe(true);
  expect(lastLogContains(state, "Sure Gamble, Sure Gamble")).toBe(false);
  expect(getRunner(state).discard.length).toBe(1);
  playFromHand(state, "corp", "Shipment from SanSan");
  clickPrompt(state, "corp", "2");
  clickCard(state, "corp", ur);
  expect(getCounters(refresh(state, ur), "advancement")).toBe(3);
  expect(getRunner(state).discard.length).toBe(1);
  advance(state, ur);
  expect(getCounters(refresh(state, ur), "advancement")).toBe(4);
  expect(lastLogContains(state, "Sure Gamble and Sure Gamble")).toBe(true);
  expect(getRunner(state).discard.length).toBe(3);
});

it("Unorthodox Predictions", () => {
  const state = newGame({ corp: { deck: ["Unorthodox Predictions"] } });
  playAndScore(state, "Unorthodox Predictions");
  clickPrompt(state, "corp", "Barrier");
  expect(lastLogContains(state, "Barrier")).toBe(true);
});

it("Utopia Fragment", () => {
  const state = newGame({ corp: { deck: ["Utopia Fragment", "Hostile Takeover"] } });
  playAndScore(state, "Utopia Fragment");
  playFromHand(state, "corp", "Hostile Takeover", "New remote");
  advance(state, getContent(state, "remote2", 0));
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 2");
  expect(promptButtons(state, "runner")).toEqual(["Pay to steal", "No action"]);
  clickPrompt(state, "runner", "Pay to steal");
  expect(getRunner(state).agendaPoint).toBe(1);
  expect(getRunner(state).credit).toBe(3);
});

it("Vanity Project", () => {
  const state = newGame({ corp: { deck: ["Vanity Project"] } });
  playAndScore(state, "Vanity Project");
  expect(getCorp(state).agendaPoint).toBe(4);
});

it("Veterans Program", () => {
  const state = newGame({ corp: { deck: [qty("Hostile Takeover", 2), "Veterans Program"] } });
  playAndScore(state, "Hostile Takeover");
  playAndScore(state, "Hostile Takeover");
  expect(getCorp(state).credit).toBe(19);
  expect(countBadPub(state)).toBe(2);
  playAndScore(state, "Veterans Program");
  expect(countBadPub(state)).toBe(0);
});

it("Veterans Program - removes up to 2 bad publicity", () => {
  const state = newGame({ corp: { deck: ["Hostile Takeover", "Veterans Program"] } });
  playAndScore(state, "Hostile Takeover");
  expect(getCorp(state).credit).toBe(12);
  expect(countBadPub(state)).toBe(1);
  playAndScore(state, "Veterans Program");
  expect(countBadPub(state)).toBe(0);
});

it("Viral Weaponization - score on corp turn", () => {
  const state = newGame({ corp: { deck: [qty("Viral Weaponization", 2)] }, runner: { deck: [qty("Sure Gamble", 3)] } });
  startingHand(state, "runner", ["Sure Gamble", "Sure Gamble"]);
  playAndScore(state, "Viral Weaponization");
  expect(getRunner(state).hand.length).toBe(2);
  takeCredits(state, "corp");
  expect(getRunner(state).hand.length).toBe(0);
  clickDraw(state, "runner");
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(getRunner(state).hand.length).toBe(1);
  playFromHand(state, "runner", "Sure Gamble");
  takeCredits(state, "runner");
  expect(getRunner(state).hand.length).toBe(0);
  playAndScore(state, "Viral Weaponization");
  takeCredits(state, "corp");
  expect(getRunner(state).hand.length).toBe(0);
});

it("Viral Weaponization - score on runner turn", () => {
  const state = newGame({ corp: { deck: ["Viral Weaponization", "Plan B"] }, runner: { deck: [qty("Sure Gamble", 3)] } });
  startingHand(state, "runner", ["Sure Gamble", "Sure Gamble"]);
  playFromHand(state, "corp", "Plan B", "New remote");
  addProp(state, "corp", makeEid(state), getContent(state, "remote1", 0), "advanceCounter", 4);
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", findCard("Viral Weaponization", getCorp(state).hand));
  expect(promptButtons(state, "runner")).toEqual(["Pay 1 [Credits] to trash", "No action"]);
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).hand.length).toBe(2);
  takeCredits(state, "runner");
  expect(getRunner(state).hand.length).toBe(0);
});

it("Voting Machine Initiative", () => {
  const state = newGame({ corp: { deck: ["Voting Machine Initiative"] } });
  playAndScore(state, "Voting Machine Initiative");
  takeCredits(state, "corp");
  const vmi = getScored(state, "corp", 0);
  const vmiTest = (choice: string, counter: number) => {
    const diff = choice === "Yes" ? 1 : 0;
    expect(getCounters(refresh(state, vmi), "agenda")).toBe(counter);
    expect(getRunner(state).click).toBe(4);
    clickPrompt(state, "corp", choice);
    expect(getRunner(state).click).toBe(4 - diff);
    expect(getCounters(refresh(state, vmi), "agenda")).toBe(counter - diff);
    takeCredits(state, "runner");
    takeCredits(state, "corp");
  };
  vmiTest("Yes", 3);
  vmiTest("No", 2);
  vmiTest("Yes", 2);
  vmiTest("Yes", 1);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("Vulcan Coverup", () => {
  const state = newGame({ corp: { deck: [qty("Vulcan Coverup", 2)] } });
  playFromHand(state, "corp", "Vulcan Coverup", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Steal");
  expect(countBadPub(state)).toBe(1);
  takeCredits(state, "runner");
  playAndScore(state, "Vulcan Coverup");
  expect(getRunner(state).discard.length).toBe(2);
});

it("Vulnerability Audit", () => {
  const state = newGame({ corp: { deck: ["Vulnerability Audit", "Project Atlas"] } });
  playFromHand(state, "corp", "Vulnerability Audit", "New remote");
  playFromHand(state, "corp", "Project Atlas", "New remote");
  addProp(state, "corp", makeEid(state), getContent(state, "remote1", 0), "advanceCounter", 4);
  score(state, "corp", getContent(state, "remote1", 0));
  expect(getCorp(state).scored.length).toBe(0);
  addProp(state, "corp", makeEid(state), getContent(state, "remote2", 0), "advanceCounter", 3);
  score(state, "corp", getContent(state, "remote2", 0));
  expect(getCorp(state).scored.length).toBe(1);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  score(state, "corp", getContent(state, "remote1", 0));
  expect(getCorp(state).scored.length).toBe(2);
});

it("Water Monopoly", () => {
  const state = newGame({ corp: { hand: ["Water Monopoly"] }, runner: { hand: ["Fan Site", "Levy Advanced Research Lab"] } });
  playAndScore(state, "Water Monopoly");
  takeCredits(state, "corp");
  expect(getRunner(state).credit).toBe(5);
  playFromHand(state, "runner", "Fan Site");
  expect(getRunner(state).credit).toBe(5);
  playFromHand(state, "runner", "Levy Advanced Research Lab");
  expect(getRunner(state).credit).toBe(0);
});

it("Water Monopoly - interaction with installing facedown", () => {
  const state = newGame({ corp: { hand: ["Water Monopoly"] }, runner: { hand: ["Hunting Grounds"], deck: [qty("Algo Trading", 3)] } });
  playAndScore(state, "Water Monopoly");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Hunting Grounds");
  cardAbility(state, "runner", getResource(state, 0), 0);
  expect(getRunner(state).credit).toBe(3);
});

it("Witch Hunt", () => {
  for (let t = 0; t <= 6; t++) {
    const state = newGame({ corp: { hand: ["Witch Hunt"] } });
    playAndScore(state, "Witch Hunt");
    takeCredits(state, "corp");
    expect(countTags(state)).toBe(3);
    takeCredits(state, "runner");
    changed(() => countTags(state), 0, () => {
      takeCredits(state, "corp");
    });
    expect(countBadPub(state)).toBe(0);
  }
});
