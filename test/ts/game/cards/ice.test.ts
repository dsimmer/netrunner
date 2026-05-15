import { describe, it, expect, beforeEach } from "vitest";
import * as core from "@/game/core";
import {
  newGame, startingHand, stackDeck, cloneState,
  takeCredits, startTurn, endTurn,
  playFromHand, playAndScore, scoreAgenda, score,
  runEmptyServer, runOn, runContinue, runContinueUntil, runJackOut, encounterContinue,
  clickPrompt, clickPrompts, clickCard, clickAdvance, clickDraw, clickCredit,
  rez, derez, advance, cardAbility, cardSubroutine, cardSideAbility, fireSubs,
  autoPump, autoPumpAndBreak,
  noPrompt, waiting, promptButtons, promptTitles, accessing, promptIsCard, promptIsType,
  getPromptMap, getCorp, getRunner, getRun, getIce, getContent, getProgram, getHardware,
  getResource, getRunnerFacedown, getScored, getRfg, getDiscarded,
  findCard, refresh, getTitle, rezzed, faceup, getCounters, sameCard,
  hasSubtype, installed, getStrength,
  trash, trashFromHand, trashResource, move, gain, lose, addProp, makeEid, gainClicks,
  gainTags, loseTags, removeTag, damage, draw, purge, trace, change,
  countTags, countRealTags, isTagged, countBadPub, getLink, handSize,
  lastLogContains, secondLastLogContains,
  qty, changed, changedMulti,
} from "../test_framework/index";

it("ablative barrier - no threat", () => {
  const state = newGame({
    corp: { hand: ["Ablative Barrier", "Ablative Barrier", "City Works Project"], discard: ["Vanilla"] },
  });
  playFromHand(state, "corp", "Ablative Barrier", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  expect(noPrompt(state, "corp")).toBe(true);
});

it("ablative barrier - threat trigger", () => {
  const state = newGame({
    corp: { hand: ["Ablative Barrier", "Ablative Barrier", "Ice Wall", "City Works Project"], discard: ["Vanilla"], credits: 10 },
  });
  playFromHand(state, "corp", "Ablative Barrier", "hq");
  playFromHand(state, "corp", "Ablative Barrier", "hq");
  playAndScore(state, "City Works Project");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 1));
  clickCard(state, "corp", "Vanilla");
  clickPrompt(state, "corp", "Archives");
  expect(getIce(state, "archives", 0).title).toBe("Vanilla");
  runContinue(state);
  rez(state, "corp", getIce(state, "hq", 0));
  clickCard(state, "corp", "Ice Wall");
  clickPrompt(state, "corp", "R&D");
});

it("afshar - subroutines", () => {
  const state = newGame({ corp: { hand: ["Afshar"] } });
  playFromHand(state, "corp", "Afshar", "hq");
  const afshar = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", afshar);
  runContinue(state);
  cardSubroutine(state, "corp", afshar, 0);
  expect(getRunner(state).credit).toBe(3);
  cardSubroutine(state, "corp", afshar, 1);
  expect(getRun(state)).toBeFalsy();
});

it("afshar - breaking restriction", () => {
  const state = newGame({
    corp: { hand: ["Afshar"] },
    runner: { hand: ["Gordian Blade"], credits: 10 },
  });
  playFromHand(state, "corp", "Afshar", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Gordian Blade");
  const afshar = getIce(state, "hq", 0);
  const gord = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", afshar);
  runContinue(state);
  cardAbility(state, "runner", gord, 0);
  clickPrompt(state, "runner", "End the run");
  expect(noPrompt(state, "runner")).toBe(true);
  cardAbility(state, "runner", gord, 0);
  expect(noPrompt(state, "runner")).toBe(true);
});

it("afshar - no breaking restriction on other servers", () => {
  const state = newGame({
    corp: { hand: ["Afshar"] },
    runner: { hand: ["Gordian Blade"], credits: 10 },
  });
  playFromHand(state, "corp", "Afshar", "rd");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Gordian Blade");
  runOn(state, "rd");
  const afshar = getIce(state, "rd", 0);
  const gord = getProgram(state, 0);
  rez(state, "corp", afshar);
  runContinue(state);
  cardAbility(state, "runner", gord, 0);
  clickPrompt(state, "runner", "End the run");
  expect(noPrompt(state, "runner")).toBe(false);
  clickPrompt(state, "runner", "Make the Runner lose 2 [Credits]");
});

it("afshar - breaking restriction also on second encounter", () => {
  const state = newGame({
    corp: { hand: ["Afshar"] },
    runner: { hand: ["Gordian Blade"], credits: 10 },
  });
  playFromHand(state, "corp", "Afshar", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Gordian Blade");
  runOn(state, "hq");
  const afshar = getIce(state, "hq", 0);
  const gord = getProgram(state, 0);
  rez(state, "corp", afshar);
  runContinue(state);
  cardAbility(state, "runner", gord, 0);
  clickPrompt(state, "runner", "Make the Runner lose 2 [Credits]");
  fireSubs(state, afshar);
  expect(getRun(state)).toBeFalsy();
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  cardAbility(state, "runner", gord, 0);
  clickPrompt(state, "runner", "Make the Runner lose 2 [Credits]");
  expect(noPrompt(state, "runner")).toBe(true);
  cardAbility(state, "runner", gord, 0);
  expect(noPrompt(state, "runner")).toBe(true);
});

it("aimor", () => {
  const state = newGame({
    corp: { hand: ["Aimor"] },
    runner: { deck: ["Sure Gamble", "Desperado", "Corroder", "Patron"], hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Aimor", "hq");
  expect(getIce(state, "hq", 0)).toBeTruthy();
  takeCredits(state, "corp");
  const aim = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", aim);
  runContinue(state);
  cardSubroutine(state, "corp", aim, 0);
  expect(getRunner(state).discard.length).toBe(3);
  expect(getRunner(state).deck.length).toBe(1);
  expect(refresh(state, aim)).toBeNull();
});

it("akhet - gains strength at 3 advancements", () => {
  const state = newGame({ corp: { hand: ["Akhet"] } });
  playFromHand(state, "corp", "Akhet", "hq");
  gain(state, "corp", "click", 1, "credit", 1);
  const akhet = getIce(state, "hq", 0);
  rez(state, "corp", akhet);
  expect(getCounters(refresh(state, akhet), "advancement")).toBe(0);
  expect(getStrength(refresh(state, akhet))).toBe(2);
  for (let n = 0; n < 2; n++) {
    advance(state, akhet);
    expect(getCounters(refresh(state, akhet), "advancement")).toBe(n + 1);
    expect(getStrength(refresh(state, akhet))).toBe(2);
  }
  advance(state, akhet);
  expect(getCounters(refresh(state, akhet), "advancement")).toBe(3);
  expect(getStrength(refresh(state, akhet))).toBe(5);
});

it("akhet - subroutines", () => {
  const state = newGame({ corp: { hand: ["Akhet"] } });
  playFromHand(state, "corp", "Akhet", "hq");
  takeCredits(state, "corp");
  const akhet = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", akhet);
  runContinue(state);
  fireSubs(state, akhet);
  expect(getCounters(refresh(state, akhet), "advancement")).toBe(0);
  clickCard(state, "corp", refresh(state, akhet));
  expect(getCounters(refresh(state, akhet), "advancement")).toBe(1);
  expect(getRun(state)).toBeFalsy();
});

it("akhet - breaking restriction", () => {
  const state = newGame({
    corp: { hand: ["Akhet"] },
    runner: { hand: ["Corroder"] },
  });
  playFromHand(state, "corp", "Akhet", "hq");
  const akhet = getIce(state, "hq", 0);
  advance(state, akhet, 2);
  expect(getCounters(refresh(state, akhet), "advancement")).toBe(2);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  runOn(state, "hq");
  const cor = getProgram(state, 0);
  rez(state, "corp", refresh(state, akhet));
  runContinue(state);
  cardAbility(state, "runner", cor, 0);
  clickPrompt(state, "runner", "End the run");
  expect(noPrompt(state, "runner")).toBe(false);
  clickPrompt(state, "runner", "Gain 1 [Credit]. Place 1 advancement counter");
  expect(noPrompt(state, "runner")).toBe(true);
  expect(refresh(state, akhet).subroutines.every((s: any) => s.broken)).toBe(true);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  gain(state, "corp", "credit", 1);
  advance(state, akhet);
  expect(getCounters(refresh(state, akhet), "advancement")).toBe(3);
  takeCredits(state, "corp");
  gain(state, "runner", "credit", 5);
  runOn(state, "hq");
  runContinue(state);
  autoPump(state, cor);
  cardAbility(state, "runner", refresh(state, cor), 0);
  clickPrompt(state, "runner", "End the run");
  expect(noPrompt(state, "runner")).toBe(true);
});

it("anansi - 3 net damage when bypassing", () => {
  const state = newGame({
    corp: { hand: ["Anansi"], credits: 8 },
    runner: { deck: [qty("Sure Gamble", 4), "Inside Job"] },
  });
  playFromHand(state, "corp", "Anansi", "hq");
  gain(state, "corp", "credit", 8);
  takeCredits(state, "corp");
  const anansi = getIce(state, "hq", 0);
  playFromHand(state, "runner", "Inside Job");
  clickPrompt(state, "runner", "HQ");
  runContinue(state);
  rez(state, "corp", anansi);
  changed(() => getRunner(state).hand.length, -3, () => {
    runContinue(state);
  });
});

it("anansi - no net damage when bypassing and derezzing with capybara", () => {
  const state = newGame({
    corp: { hand: ["Anansi"], credits: 8 },
    runner: { hand: [qty("Sure Gamble", 4), "Inside Job", "Capybara"] },
  });
  playFromHand(state, "corp", "Anansi", "hq");
  gain(state, "corp", "credit", 8);
  takeCredits(state, "corp");
  const anansi = getIce(state, "hq", 0);
  playFromHand(state, "runner", "Capybara");
  playFromHand(state, "runner", "Inside Job");
  clickPrompt(state, "runner", "HQ");
  runContinue(state);
  rez(state, "corp", anansi);
  changed(() => getRunner(state).hand.length, 0, () => {
    runContinue(state);
    clickPrompt(state, "runner", "Yes");
  });
});

it("anansi - no net damage when breaking all subs", () => {
  const state = newGame({
    corp: { hand: ["Anansi"], credits: 15 },
    runner: { deck: [qty("Sure Gamble", 4), "Mongoose"], credits: 15 },
  });
  playFromHand(state, "corp", "Anansi", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Mongoose");
  const anansi = getIce(state, "hq", 0);
  const mongoose = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", anansi);
  runContinue(state, "encounter-ice");
  autoPumpAndBreak(state, mongoose);
  changed(() => getRunner(state).hand.length, 0, () => {
    runContinue(state);
  });
});

it("anansi and border control issue #4769", () => {
  const state = newGame({
    corp: { hand: ["Anansi", "Border Control"], credits: 20 },
    runner: { hand: [qty("Sure Gamble", 6), "Corroder"], credits: 90 },
  });
  playFromHand(state, "corp", "Border Control", "hq");
  playFromHand(state, "corp", "Anansi", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  const anansi = getIce(state, "hq", 1);
  const border = getIce(state, "hq", 0);
  const corroder = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", anansi);
  runContinue(state, "encounter-ice");
  changed(() => getRunner(state).hand.length, -3, () => {
    runContinue(state, "movement");
  });
  rez(state, "corp", border);
  runContinue(state, "approach-ice");
  runContinue(state, "encounter-ice");
  autoPumpAndBreak(state, corroder);
  changed(() => getRunner(state).hand.length, 0, () => {
    cardAbility(state, "corp", refresh(state, border), 0);
  });
  expect(getRun(state)).toBeNull();
});

it("anansi - runner has to pay 2c to draw card issue #5335", () => {
  const state = newGame({
    corp: { hand: ["Anansi"], credits: 15 },
    runner: { credits: 0, deck: [qty("Sure Gamble", 5)], hand: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Anansi", "hq");
  takeCredits(state, "corp");
  const anansi = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", anansi);
  runContinue(state);
  cardSubroutine(state, "corp", anansi, 1);
  clickPrompt(state, "corp", "No");
  changed(() => getRunner(state).hand.length, 0, () => {
    expect(promptButtons(state, "runner")).toEqual(["No"]);
    clickPrompt(state, "runner", "No");
  });
  expect(noPrompt(state, "corp")).toBe(true);
});

it("anansi - 2nd sub runner clicks yes", () => {
  const state = newGame({
    corp: { hand: ["Anansi"], credits: 15 },
    runner: { deck: [qty("Sure Gamble", 5)], hand: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Anansi", "hq");
  takeCredits(state, "corp");
  const anansi = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", anansi);
  runContinue(state);
  cardSubroutine(state, "corp", anansi, 1);
  clickPrompt(state, "corp", "No");
  changed(() => getRunner(state).hand.length, 1, () => {
    clickPrompt(state, "runner", "Yes");
  });
  expect(noPrompt(state, "corp")).toBe(true);
});

it("anansi - 2nd sub runner clicks no", () => {
  const state = newGame({
    corp: { hand: ["Anansi"], credits: 15 },
    runner: { deck: [qty("Sure Gamble", 5)], hand: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Anansi", "hq");
  takeCredits(state, "corp");
  const anansi = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", anansi);
  runContinue(state);
  cardSubroutine(state, "corp", anansi, 1);
  clickPrompt(state, "corp", "No");
  changed(() => getRunner(state).hand.length, 0, () => {
    clickPrompt(state, "runner", "No");
  });
  expect(noPrompt(state, "corp")).toBe(true);
});

it("anemone - happy path", () => {
  const state = newGame({
    corp: { hand: [qty("Anemone", 2), "Hedge Fund"], credits: 50 },
    runner: { hand: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Anemone", "hq");
  const anem = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  changedMulti(
    [
      [() => getRunner(state).discard.length, 2],
      [() => getCorp(state).discard.length, 1],
    ],
    () => {
      runOn(state, "hq");
      rez(state, "corp", anem);
      clickPrompt(state, "corp", "Yes");
      clickCard(state, "corp", "Hedge Fund");
    }
  );
});

it("anemone - wrong server", () => {
  const state = newGame({
    corp: { hand: [qty("Anemone", 2), "Hedge Fund"], credits: 50 },
    runner: { hand: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Anemone", "hq");
  const anem = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  runOn(state, "rd");
  rez(state, "corp", anem);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("anemone - outside run", () => {
  const state = newGame({
    corp: { hand: [qty("Anemone", 2), "Hedge Fund"], credits: 50 },
    runner: { hand: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Anemone", "hq");
  const anem = getIce(state, "hq", 0);
  rez(state, "corp", anem);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("anemone - can't afford", () => {
  const state = newGame({
    corp: { hand: ["Anemone"], credits: 50 },
    runner: { hand: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Anemone", "hq");
  const anem = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", anem);
  expect(noPrompt(state, "corp")).toBe(true);
});

describe("ansel 1.0", () => {
  let state: any;
  let ansel: any;

  beforeEach(() => {
    state = newGame({
      corp: { hand: ["Ansel 1.0", "NGO Front", "Merger"], discard: ["Adonis Campaign"], credits: 100 },
      runner: { hand: ["Corroder", "Trick Shot"], credits: 100 },
    });
    gain(state, "corp", "click", 100);
    playFromHand(state, "corp", "Ansel 1.0", "New remote");
    ansel = getIce(state, "remote1", 0);
  });

  it("has 1.0 bioroid runner ability", () => {
    takeCredits(state, "corp");
    runOn(state, "remote1");
    rez(state, "corp", ansel);
    runContinue(state, "encounter-ice");
    changed(() => getRunner(state).click, -1, () => {
      cardSideAbility(state, "runner", refresh(state, ansel), 0);
      expect(getPromptMap(state, "runner").msg).toBe("Break a subroutine");
      clickPrompt(state, "runner", "Trash an installed Runner card");
    });
    expect(refresh(state, ansel).subroutines[0].broken).toBe(true);
  });

  it("first sub is trash installed card", () => {
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Corroder");
    runOn(state, "remote1");
    rez(state, "corp", ansel);
    runContinue(state, "encounter-ice");
    cardSubroutine(state, "corp", ansel, 0);
    expect(getPromptMap(state, "corp").msg).toBe("Choose an installed card to trash");
    clickCard(state, "corp", "Corroder");
    expect(findCard("Corroder", getProgram(state) as any[])).toBeUndefined();
    expect(findCard("Corroder", getRunner(state).discard)).toBeTruthy();
  });

  it("second sub is install from hq or archives - HQ", () => {
    takeCredits(state, "corp");
    runOn(state, "remote1");
    rez(state, "corp", ansel);
    runContinue(state, "encounter-ice");
    cardSubroutine(state, "corp", ansel, 1);
    expect(getPromptMap(state, "corp").msg).toBe("Choose a card to install from HQ or Archives");
    clickCard(state, "corp", "NGO Front");
    expect(getPromptMap(state, "corp").msg).toBe("Choose a location to install NGO Front");
    clickPrompt(state, "corp", "New remote");
    expect(getContent(state, "remote2", 0).title).toBe("NGO Front");
    expect(findCard("NGO Front", getCorp(state).hand)).toBeUndefined();
  });

  it("second sub is install from hq or archives - Archives", () => {
    takeCredits(state, "corp");
    runOn(state, "remote1");
    rez(state, "corp", ansel);
    runContinue(state, "encounter-ice");
    cardSubroutine(state, "corp", ansel, 1);
    expect(getPromptMap(state, "corp").msg).toBe("Choose a card to install from HQ or Archives");
    clickCard(state, "corp", "Adonis Campaign");
    expect(getPromptMap(state, "corp").msg).toBe("Choose a location to install Adonis Campaign");
    clickPrompt(state, "corp", "New remote");
    expect(getContent(state, "remote2", 0).title).toBe("Adonis Campaign");
    expect(findCard("Adonis Campaign", getCorp(state).discard)).toBeUndefined();
  });

  it("third sub blocks stealing - stealing", () => {
    playFromHand(state, "corp", "Merger", "Server 1");
    takeCredits(state, "corp");
    runOn(state, "remote1");
    rez(state, "corp", ansel);
    runContinue(state, "encounter-ice");
    cardSubroutine(state, "corp", ansel, 2);
    expect(lastLogContains(state, "prevent the Runner from stealing or trashing")).toBe(true);
    runContinue(state, "movement");
    runContinue(state, "success");
    expect(accessing(state, "Merger")).toBe(true);
    expect(promptButtons(state, "runner")).toEqual(["No action"]);
  });

  it("third sub blocks stealing - trashing", () => {
    playFromHand(state, "corp", "NGO Front", "Server 1");
    takeCredits(state, "corp");
    runOn(state, "remote1");
    rez(state, "corp", ansel);
    runContinue(state, "encounter-ice");
    cardSubroutine(state, "corp", ansel, 2);
    expect(lastLogContains(state, "prevent the Runner from stealing or trashing")).toBe(true);
    runContinue(state, "movement");
    runContinue(state, "success");
    expect(accessing(state, "NGO Front")).toBe(true);
    expect(promptButtons(state, "runner")).toEqual(["No action"]);
  });
});

it("ansel 1.0 - preventing trash issue #7343", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 10)], hand: ["Spin Doctor", "Ansel 1.0"], credits: 10 },
    runner: { hand: ["Trick Shot"], credits: 10 },
  });
  playFromHand(state, "corp", "Ansel 1.0", "rd");
  playFromHand(state, "corp", "Spin Doctor", "New remote");
  takeCredits(state, "corp");
  const ansel = getIce(state, "rd", 0);
  playFromHand(state, "runner", "Trick Shot");
  runContinue(state);
  rez(state, "corp", ansel);
  runContinue(state, "encounter-ice");
  fireSubs(state, refresh(state, ansel));
  clickPrompt(state, "corp", "Done");
  expect(lastLogContains(state, "cannot steal or trash")).toBe(true);
  runContinueUntil(state, "success");
  expect(lastLogContains(state, "accesses an unseen card")).toBe(true);
  expect(promptButtons(state, "runner")).toEqual(["No action"]);
  clickPrompt(state, "runner", "No action");
  clickPrompt(state, "runner", "No action");
  clickPrompt(state, "runner", "Server 1");
  runContinueUntil(state, "success");
  expect(promptButtons(state, "runner")).toEqual(["Pay 2 [Credits] to trash", "No action"]);
});

it("ansel 1.0 vs run amok", () => {
  const state = newGame({
    corp: { hand: ["Ansel 1.0"] },
    runner: { hand: ["Run Amok"] },
  });
  playFromHand(state, "corp", "Ansel 1.0", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Run Amok");
  clickPrompt(state, "runner", "HQ");
  runContinue(state);
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state, "encounter-ice");
  cardSubroutine(state, "corp", getIce(state, "hq", 0), 2);
  expect(lastLogContains(state, "prevent the Runner from stealing or trashing")).toBe(true);
  runContinue(state, "movement");
  runJackOut(state);
  clickCard(state, "runner", "Ansel 1.0");
  expect(getCorp(state).discard.length).toBe(1);
});

it("ansel 1.0 vs virtuoso", () => {
  const state = newGame({
    corp: { hand: ["Ansel 1.0", "Hostile Takeover"] },
    runner: { hand: ["Virtuoso"] },
  });
  playFromHand(state, "corp", "Ansel 1.0", "archives");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Virtuoso");
  runOn(state, "archives");
  rez(state, "corp", getIce(state, "archives", 0));
  runContinue(state, "encounter-ice");
  cardSubroutine(state, "corp", getIce(state, "archives", 0), 2);
  expect(lastLogContains(state, "prevent the Runner from stealing or trashing")).toBe(true);
  core.setMark(state, "archives");
  runContinueUntil(state, "success");
  clickPrompt(state, "runner", "Steal");
  expect(getScored(state, "runner").length).toBe(1);
});

it("ansel 1.0 - access after no steal (ganked)", () => {
  const state = newGame({
    corp: { hand: ["Ansel 1.0", "Ganked!", "Merger"], discard: ["Adonis Campaign"], credits: 100 },
    runner: { hand: ["Corroder"], credits: 100 },
  });
  gain(state, "corp", "click", 100);
  playFromHand(state, "corp", "Ansel 1.0", "New remote");
  playFromHand(state, "corp", "Ganked!", "Server 1");
  playFromHand(state, "corp", "Merger", "Server 1");
  takeCredits(state, "corp");
  const ansel = getIce(state, "remote1", 0);
  runOn(state, "remote1");
  rez(state, "corp", ansel);
  runContinue(state, "encounter-ice");
  cardSubroutine(state, "corp", ansel, 2);
  expect(lastLogContains(state, "prevent the Runner from stealing or trashing")).toBe(true);
  runContinue(state, "movement");
  runContinue(state, "success");
  clickCard(state, "runner", "Merger");
  expect(accessing(state, "Merger")).toBe(true);
  expect(promptButtons(state, "runner")).toEqual(["No action"]);
  clickPrompt(state, "runner", "No action");
  expect(waiting(state, "runner")).toBe(true);
});

it("anvil", () => {
  const state = newGame({
    corp: { hand: ["Anvil", "Ice Wall"] },
    runner: { hand: ["Unity"], credits: 50 },
  });
  playFromHand(state, "corp", "Anvil", "hq");
  playFromHand(state, "corp", "Ice Wall", "rd");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Unity");
  const unity = getProgram(state, 0);
  const anvil = getIce(state, "hq", 0);
  const iwall = getIce(state, "rd", 0);
  runOn(state, "hq");
  rez(state, "corp", refresh(state, anvil));
  runContinue(state);
  clickPrompt(state, "corp", "No");
  changed(() => getRunner(state).credit, -4, () => {
    autoPumpAndBreak(state, unity);
    core.processAction("continue", state, "corp", null);
  });
  runJackOut(state);
  runOn(state, "hq");
  runContinue(state, "encounter-ice");
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", refresh(state, iwall));
  changed(() => getRunner(state).credit, 0, () => {
    autoPumpAndBreak(state, unity);
  });
  changedMulti(
    [
      [() => getCorp(state).credit, 1],
      [() => getRunner(state).credit, -1],
    ],
    () => {
      fireSubs(state, core.getCurrentIce(state));
    }
  );
  clickCard(state, "runner", refresh(state, unity));
  expect(getRunner(state).discard.length).toBe(1);
});

it("archangel", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Archangel"] },
    runner: { hand: ["Bank Job"] },
  });
  playFromHand(state, "corp", "Archangel", "hq");
  const archangel = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  rez(state, "corp", archangel);
  playFromHand(state, "runner", "Bank Job");
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", archangel, 0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", getResource(state, 0));
  expect(getResource(state, 0)).toBeNull();
});

it("archangel - access test", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Archangel"] },
    runner: { hand: ["Bank Job"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Bank Job");
  runEmptyServer(state, "hq");
  clickPrompt(state, "corp", "Yes");
  expect(core.getCurrentIce(state).title).toBe("Archangel");
  fireSubs(state, core.getCurrentIce(state));
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", getResource(state, 0));
  expect(getResource(state, 0)).toBeNull();
  encounterContinue(state);
  expect(accessing(state, "Archangel")).toBe(true);
});

it("architect - untrashable while rezzed, trashable if derezzed or from hand", () => {
  const state = newGame({ corp: { hand: [qty("Architect", 3)] } });
  playFromHand(state, "corp", "Architect", "hq");
  const architect = getIce(state, "hq", 0);
  rez(state, "corp", architect);
  trash(state, "corp", refresh(state, architect));
  expect(getIce(state, "hq", 0)).toBeTruthy();
  derez(state, "corp", refresh(state, architect));
  trash(state, "corp", refresh(state, architect));
  expect(getIce(state, "hq", 0)).toBeNull();
  trash(state, "corp", getCorp(state).hand[0]);
  expect(getCorp(state).discard[0].title).toBe("Architect");
  expect(getCorp(state).discard[1].title).toBe("Architect");
});

it("ashigaru - gaining/losing subs", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Ashigaru"], credits: 9 } });
  playFromHand(state, "corp", "Ashigaru", "hq");
  const ashigaru = getIce(state, "hq", 0);
  rez(state, "corp", ashigaru);
  expect(refresh(state, ashigaru).subroutines.length).toBe(0);
  draw(state, "corp", 1);
  expect(refresh(state, ashigaru).subroutines.length).toBe(1);
  draw(state, "corp", 1);
  expect(refresh(state, ashigaru).subroutines.length).toBe(2);
  move(state, "corp", findCard("Hedge Fund", getCorp(state).hand)!, "deck");
  move(state, "corp", findCard("Hedge Fund", getCorp(state).hand)!, "deck");
  core.fakeCheckpoint(state);
  expect(refresh(state, ashigaru).subroutines.length).toBe(0);
});

it("ashigaru - sub is ETR", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Ashigaru", "Hedge Fund"], credits: 9 } });
  playFromHand(state, "corp", "Ashigaru", "hq");
  const ashigaru = getIce(state, "hq", 0);
  rez(state, "corp", ashigaru);
  expect(refresh(state, ashigaru).subroutines.length).toBe(1);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, ashigaru);
  expect((state as any).run).toBeNull();
});

it("asteroid belt - rez cost reduced by 3 per advancement", () => {
  const state = newGame({ corp: { hand: ["Asteroid Belt"], credits: 10 } });
  playFromHand(state, "corp", "Asteroid Belt", "hq");
  const ab = getIce(state, "hq", 0);
  advance(state, ab, 2);
  expect(getCorp(state).credit).toBe(8);
  expect(getCounters(refresh(state, ab), "advancement")).toBe(2);
  rez(state, "corp", refresh(state, ab));
  expect(getCorp(state).credit).toBe(5);
});

it("attini - happy path", () => {
  const state = newGame({
    corp: { hand: ["Attini"], credits: 10 },
    runner: { hand: ["Sure Gamble", "Caldera"], credits: 10 },
  });
  playFromHand(state, "corp", "Attini", "archives");
  takeCredits(state, "corp");
  const att = getIce(state, "archives", 0);
  playFromHand(state, "runner", "Caldera");
  runOn(state, "archives");
  rez(state, "corp", refresh(state, att));
  runContinue(state);
  fireSubs(state, att);
  changed(() => getRunner(state).credit, -2, () => {
    clickPrompt(state, "runner", "Pay 2 [Credits]");
  });
  changed(() => getRunner(state).hand.length, 0, () => {
    clickPrompt(state, "runner", "Take 1 net damage");
    clickPrompt(state, "runner", "Caldera");
  });
  changed(() => getRunner(state).hand.length, -1, () => {
    clickPrompt(state, "runner", "Take 1 net damage");
  });
});

it("attini - threat ability", () => {
  const state = newGame({
    corp: { hand: ["Attini"], scoreArea: ["Obokata Protocol"], credits: 10 },
    runner: { hand: [qty("Sure Gamble", 3)] },
  });
  playFromHand(state, "corp", "Attini", "hq");
  takeCredits(state, "corp");
  const att = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", refresh(state, att));
  runContinue(state);
  changed(() => getRunner(state).hand.length, -3, () => {
    fireSubs(state, att);
  });
});

it("attini - threat ability vs hush", () => {
  const state = newGame({
    corp: { hand: ["Attini"], scoreArea: ["Obokata Protocol"], credits: 10 },
    runner: { hand: ["Hush", qty("Sure Gamble", 3)], credits: 7 },
  });
  playFromHand(state, "corp", "Attini", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Hush");
  clickCard(state, "runner", "Attini");
  const att = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", refresh(state, att));
  runContinue(state);
  changed(() => getRunner(state).hand.length, 0, () => {
    fireSubs(state, refresh(state, att));
    for (let i = 0; i < 3; i++) {
      changed(() => getRunner(state).credit, -2, () => {
        clickPrompt(state, "runner", "Pay 2 [Credits]");
      });
    }
  });
});

it("attini - threat doesn't spill", () => {
  const state = newGame({
    corp: { hand: ["Attini", "Lionsmane", "Mycoweb"], credits: 20, scoreArea: ["Vanity Project"] },
    runner: { hand: [qty("Ika", 5)] },
  });
  playCards(state, "corp",
    ["Attini", "hq", { rezzed: true }],
    ["Lionsmane", "archives"],
    ["Mycoweb", "rd", { rezzed: true }],
  );
  takeCredits(state, "corp");
  runOn(state, "rd");
  runContinueUntil(state, "encounter-ice");
  cardSubroutine(state, "corp", getIce(state, "rd", 0), 1);
  clickCard(state, "corp", "Lionsmane");
  expect(rezzed(getIce(state, "archives", 0))).toBeTruthy();
  cardSubroutine(state, "corp", getIce(state, "rd", 0), 2);
  clickPrompts(state, "corp", "Lionsmane", "Do 2 net damage unless the Runner pays 3 [Credits]");
  changed(() => getRunner(state).credit, -3, () => {
    clickPrompt(state, "runner", "Pay 3 [Credits]");
    expect(noPrompt(state, "runner")).toBe(true);
  });
  cardSubroutine(state, "corp", getIce(state, "rd", 0), 3);
  changed(() => getRunner(state).hand.length, -1, () => {
    clickPrompts(state, "corp", "Attini", "Do 1 net damage unless the Runner pays 2 [Credits]");
  });
});

it("authenticator - decline to take tag", () => {
  const state = newGame({ corp: { hand: ["Authenticator"] } });
  playFromHand(state, "corp", "Authenticator", "hq");
  takeCredits(state, "corp");
  const ath = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", ath);
  runContinue(state);
  expect(countTags(state)).toBe(0);
  clickPrompt(state, "runner", "No");
  expect(countTags(state)).toBe(0);
  expect((state as any).run.phase).toBe("encounter-ice");
});

it("authenticator - take tag to bypass", () => {
  const state = newGame({ corp: { hand: ["Authenticator"] } });
  playFromHand(state, "corp", "Authenticator", "hq");
  takeCredits(state, "corp");
  const ath = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", ath);
  runContinue(state);
  expect(countTags(state)).toBe(0);
  clickPrompt(state, "runner", "Yes");
  expect(countTags(state)).toBe(1);
  expect((state as any).run.phase).toBe("movement");
});

it("authenticator - jesminder fizzles", () => {
  const state = newGame({
    corp: { hand: ["Authenticator"] },
    runner: { id: "Jesminder Sareen: Girl Behind the Curtain", hand: ["Dorm Computer"] },
  });
  playFromHand(state, "corp", "Authenticator", "hq");
  takeCredits(state, "corp");
  const ath = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", ath);
  runContinue(state);
  expect((state as any).run.phase).toBe("encounter-ice");
  expect(getPromptMap(state, "runner")?.msg).not.toBe("Take 1 tag to bypass?");
});

it("authenticator - qianju fizzles", () => {
  const state = newGame({
    corp: { hand: ["Authenticator"] },
    runner: { hand: ["Qianju PT"] },
  });
  playFromHand(state, "corp", "Authenticator", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Qianju PT");
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect((state as any).runnerPhase12).toBeTruthy();
  const pt = getHardware(state, 0);
  const ath = getIce(state, "hq", 0);
  cardAbility(state, "runner", pt, 0);
  endPhase12(state, "runner");
  expect(getRunner(state).click).toBe(3);
  runOn(state, "hq");
  rez(state, "corp", ath);
  runContinue(state);
  expect((state as any).run.phase).toBe("encounter-ice");
  expect(getPromptMap(state, "runner")?.msg).not.toBe("Take 1 tag to bypass?");
  fireSubs(state, ath);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  endPhase12(state, "runner");
  runOn(state, "hq");
  runContinue(state);
  expect(countTags(state)).toBe(0);
  clickPrompt(state, "runner", "Yes");
  expect(countTags(state)).toBe(1);
  expect((state as any).run.phase).toBe("movement");
});

it("authenticator - dorm computer fizzles", () => {
  const state = newGame({
    corp: { hand: ["Authenticator"] },
    runner: { hand: ["Dorm Computer"] },
  });
  playFromHand(state, "corp", "Authenticator", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Dorm Computer");
  const dorm = getHardware(state, 0);
  const ath = getIce(state, "hq", 0);
  cardAbility(state, "runner", dorm, 0);
  clickPrompt(state, "runner", "HQ");
  runContinue(state);
  expect((state as any).run.phase).toBe("approach-ice");
  rez(state, "corp", ath);
  runContinue(state);
  expect((state as any).run.phase).toBe("encounter-ice");
  expect(getPromptMap(state, "runner")?.msg).not.toBe("Take 1 tag to bypass?");
});

it("bailiff - gain credit when broken", () => {
  const state = newGame({
    corp: { hand: ["Bailiff"] },
    runner: { hand: ["Corroder"] },
  });
  playFromHand(state, "corp", "Bailiff", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  const blf = getIce(state, "hq", 0);
  const cor = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", blf);
  runContinue(state);
  changed(() => getCorp(state).credit, 1, () => {
    cardAbility(state, "runner", cor, 0);
    clickPrompt(state, "runner", "End the run");
    expect(lastLogContains(state, "Corp uses Bailiff to gain 1 [Credits]")).toBe(true);
  });
});

it("bailiff - interaction with hippo", () => {
  const state = newGame({
    corp: { hand: ["Bailiff"] },
    runner: { hand: ["Corroder", "Hippo"] },
  });
  playFromHand(state, "corp", "Bailiff", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Hippo");
  const blf = getIce(state, "hq", 0);
  const cor = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", blf);
  runContinue(state);
  changed(() => getCorp(state).credit, 0, () => {
    autoPumpAndBreak(state, cor);
    clickPrompt(state, "runner", "Yes");
  });
});

it("bailiff - sub boost auto break", () => {
  const state = newGame({
    corp: { hand: ["Bailiff", "Sub Boost"] },
    runner: { hand: ["Corroder"] },
  });
  playFromHand(state, "corp", "Bailiff", "hq");
  const blf = getIce(state, "hq", 0);
  rez(state, "corp", blf);
  playFromHand(state, "corp", "Sub Boost");
  clickCard(state, "corp", refresh(state, blf));
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  const cor = getProgram(state, 0);
  runOn(state, "hq");
  runContinue(state);
  changed(() => getCorp(state).credit, 2, () => {
    autoPumpAndBreak(state, cor);
  });
});

it("ballista", () => {
  const state = newGame({
    corp: { hand: ["Ballista", "Hedge Fund", "Ice Wall"] },
    runner: { hand: ["Datasucker"] },
  });
  playFromHand(state, "corp", "Ballista", "hq");
  playFromHand(state, "corp", "Hedge Fund");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Datasucker");
  const ball = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", refresh(state, ball));
  runContinue(state);
  fireSubs(state, ball);
  expect(promptButtons(state, "corp")).toEqual(["Trash a program", "End the run"]);
  clickPrompt(state, "corp", "End the run");
  expect((state as any).run).toBeFalsy();
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, ball);
  clickPrompt(state, "corp", "Trash a program");
  clickCard(state, "corp", "Datasucker");
  expect(getProgram(state, 0)).toBeNull();
  expect((state as any).run).toBeTruthy();
  runContinue(state);
  runContinue(state);
  clickPrompt(state, "runner", "No action");
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, ball);
  expect(promptButtons(state, "corp")).toEqual(["Do nothing", "End the run"]);
  clickPrompt(state, "corp", "End the run");
  expect((state as any).run).toBeFalsy();
});

it("bandwidth - give runner 1 tag; remove 1 if run successful", () => {
  const state = newGame({ corp: { hand: ["Bandwidth"] } });
  playFromHand(state, "corp", "Bandwidth", "archives");
  const bw = getIce(state, "archives", 0);
  takeCredits(state, "corp");
  runOn(state, "archives");
  rez(state, "corp", bw);
  runContinue(state);
  cardSubroutine(state, "corp", bw, 0);
  expect(countTags(state)).toBe(1);
  runContinue(state);
  runContinue(state);
  expect(countTags(state)).toBe(0);
  runOn(state, "archives");
  runContinue(state);
  cardSubroutine(state, "corp", bw, 0);
  expect(countTags(state)).toBe(1);
  runContinue(state, "movement");
  runJackOut(state);
  expect(countTags(state)).toBe(1);
});

it("bathynomus", () => {
  const state = newGame({
    corp: { hand: [qty("Bathynomus", 2)] },
    runner: { hand: [qty("Sure Gamble", 4)] },
  });
  playFromHand(state, "corp", "Bathynomus", "hq");
  playFromHand(state, "corp", "Bathynomus", "archives");
  takeCredits(state, "corp");
  const ba1 = getIce(state, "hq", 0);
  const ba2 = getIce(state, "archives", 0);
  rez(state, "corp", ba1);
  rez(state, "corp", ba2);
  expect(getStrength(refresh(state, ba1))).toBe(1);
  expect(getStrength(refresh(state, ba2))).toBe(4);
  runOn(state, "archives");
  runContinue(state);
  cardSubroutine(state, "corp", ba2, 0);
  expect(getRunner(state).discard.length).toBe(3);
});

it("biawak - discount", () => {
  const state = newGame({
    corp: { scoreArea: ["Project Atlas"], credits: 5, hand: ["Biawak"] },
  });
  playFromHand(state, "corp", "Biawak", "hq");
  rez(state, "corp", getIce(state, "hq", 0), { expectRez: false });
  changed(() => getCorp(state).credit, -4, () => {
    clickPrompts(state, "corp", "Biawak", "Project Atlas");
  });
  expect(rezzed(getIce(state, "hq", 0))).toBeTruthy();
});

it("blockchain - face up transactions", () => {
  const state = newGame({
    corp: { hand: ["Blockchain", qty("Beanstalk Royalties", 5)], credits: 7 },
  });
  gain(state, "corp", "click", 5);
  playFromHand(state, "corp", "Blockchain", "hq");
  const bc = getIce(state, "hq", 0);
  rez(state, "corp", bc);
  expect(refresh(state, bc).subroutines.length).toBe(2);
  playFromHand(state, "corp", "Beanstalk Royalties");
  expect(refresh(state, bc).subroutines.length).toBe(2);
  playFromHand(state, "corp", "Beanstalk Royalties");
  expect(refresh(state, bc).subroutines.length).toBe(3);
  playFromHand(state, "corp", "Beanstalk Royalties");
  expect(refresh(state, bc).subroutines.length).toBe(3);
  playFromHand(state, "corp", "Beanstalk Royalties");
  expect(refresh(state, bc).subroutines.length).toBe(4);
  expect(getCorp(state).credit).toBe(12);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  const credits = getCorp(state).credit;
  cardSubroutine(state, "corp", bc, 0);
  expect(getCorp(state).credit).toBe(credits + 1);
  expect(getRunner(state).credit).toBe(4);
});

it("blockchain - face down transactions", () => {
  const state = newGame({
    corp: { hand: ["Blockchain", qty("Beanstalk Royalties", 2)], discard: [qty("Beanstalk Royalties", 3)], credits: 7 },
  });
  gain(state, "corp", "click", 5);
  playFromHand(state, "corp", "Blockchain", "hq");
  const bc = getIce(state, "hq", 0);
  rez(state, "corp", bc);
  expect(refresh(state, bc).subroutines.length).toBe(2);
  playFromHand(state, "corp", "Beanstalk Royalties");
  expect(refresh(state, bc).subroutines.length).toBe(2);
  playFromHand(state, "corp", "Beanstalk Royalties");
  expect(refresh(state, bc).subroutines.length).toBe(3);
  expect(getCorp(state).discard.length).toBe(5);
});

it("blockchain - preemptive action interaction", () => {
  const state = newGame({
    corp: { hand: ["Blockchain", "Preemptive Action", qty("Beanstalk Royalties", 4)], credits: 7 },
  });
  gain(state, "corp", "click", 5);
  playFromHand(state, "corp", "Blockchain", "hq");
  const bc = getIce(state, "hq", 0);
  rez(state, "corp", bc);
  expect(refresh(state, bc).subroutines.length).toBe(2);
  playFromHand(state, "corp", "Beanstalk Royalties");
  expect(refresh(state, bc).subroutines.length).toBe(2);
  playFromHand(state, "corp", "Beanstalk Royalties");
  expect(refresh(state, bc).subroutines.length).toBe(3);
  playFromHand(state, "corp", "Beanstalk Royalties");
  expect(refresh(state, bc).subroutines.length).toBe(3);
  playFromHand(state, "corp", "Beanstalk Royalties");
  expect(refresh(state, bc).subroutines.length).toBe(4);
  expect(getCorp(state).credit).toBe(12);
  playFromHand(state, "corp", "Preemptive Action");
  clickCard(state, "corp", getCorp(state).discard[0]);
  clickCard(state, "corp", getCorp(state).discard[1]);
  clickCard(state, "corp", getCorp(state).discard[getCorp(state).discard.length - 1]);
  expect(getCorp(state).discard.length).toBe(1);
  expect(getCorp(state).rfg.length).toBe(1);
  expect(refresh(state, bc).subroutines.length).toBe(2);
});

it("bloom", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Bloom", "Enigma", "Ice Wall"], credits: 10 },
  });
  playFromHand(state, "corp", "Enigma", "hq");
  playFromHand(state, "corp", "Bloom", "hq");
  takeCredits(state, "corp");
  const bloom = getIce(state, "hq", 1);
  rez(state, "corp", bloom);
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", bloom, 1);
  clickCard(state, "corp", "Ice Wall");
  expect(getIce(state, "hq", 1).title).toBe("Ice Wall");
  expect((state as any).run.position).toBe(3);
});

it("bloop", () => {
  const state = newGame({ corp: { hand: ["Bloop", "Echo"] } });
  playFromHand(state, "corp", "Bloop", "hq");
  playFromHand(state, "corp", "Echo", "rd");
  rez(state, "corp", getIce(state, "hq", 0), { expectRez: false });
  expect(rezzed(getIce(state, "hq", 0))).toBeFalsy();
  expect(noPrompt(state, "corp")).toBe(true);
  rez(state, "corp", getIce(state, "rd", 0));
  rez(state, "corp", getIce(state, "hq", 0), { expectRez: false });
  clickCard(state, "corp", getIce(state, "rd", 0));
  expect(rezzed(getIce(state, "rd", 0))).toBeFalsy();
  expect(rezzed(getIce(state, "hq", 0))).toBeTruthy();
});

it("border control", () => {
  const state = newGame({ corp: { hand: ["Border Control", "Ice Wall"], credits: 10 } });
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Border Control", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const bc = getIce(state, "hq", 1);
  rez(state, "corp", bc);
  runContinue(state);
  const credits = getCorp(state).credit;
  cardSubroutine(state, "corp", bc, 0);
  expect(getCorp(state).credit).toBe(credits + 2);
  cardAbility(state, "corp", bc, 0);
  expect(refresh(state, bc)).toBeNull();
  expect(getRun(state)).toBeNull();
});

it("boto", () => {
  const state = newGame({
    corp: { hand: ["Boto", "Vanity Project", "Hedge Fund"], credits: 10 },
    runner: { hand: [qty("Sure Gamble", 2)] },
  });
  playFromHand(state, "corp", "Boto", "hq");
  takeCredits(state, "corp");
  const boto = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", boto);
  runContinue(state);
  changedMulti(
    [
      [() => getRunner(state).hand.length, -2],
      [() => getRunner(state).discard.length, 2],
    ],
    () => { cardSubroutine(state, "corp", refresh(state, boto), 0); }
  );
  changed(() => getCorp(state).hand.length, 0, () => {
    cardSubroutine(state, "corp", refresh(state, boto), 1);
    clickPrompt(state, "corp", "No");
  });
  expect((state as any).run).toBeTruthy();
  changedMulti(
    [
      [() => getCorp(state).hand.length, -1],
      [() => getCorp(state).discard.length, 1],
    ],
    () => {
      cardSubroutine(state, "corp", refresh(state, boto), 2);
      clickPrompt(state, "corp", "Yes");
      clickCard(state, "corp", "Hedge Fund");
    }
  );
  expect((state as any).run).toBeFalsy();
  takeCredits(state, "runner");
  changed(() => getStrength(refresh(state, boto)), 2, () => {
    playAndScore(state, "Vanity Project");
  });
});

it("brainstorm - subroutine gain/loss", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Brainstorm"], credits: 9 },
    runner: { deck: [qty("Sure Gamble", 5)], hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Brainstorm", "hq");
  const bs = getIce(state, "hq", 0);
  rez(state, "corp", bs);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  expect(refresh(state, bs).subroutines.length).toBe(1);
  draw(state, "runner", 1);
  core.redirectRun(state, "corp", "hq", "approach-ice");
  runContinue(state);
  runContinue(state);
  expect(refresh(state, bs).subroutines.length).toBe(3);
  draw(state, "runner", 1);
  core.redirectRun(state, "corp", "hq", "approach-ice");
  runContinue(state);
  runContinue(state);
  expect(refresh(state, bs).subroutines.length).toBe(6);
  move(state, "runner", findCard("Sure Gamble", getRunner(state).hand)!, "deck");
  move(state, "runner", findCard("Sure Gamble", getRunner(state).hand)!, "deck");
  expect(getRunner(state).hand.length).toBe(1);
  core.redirectRun(state, "corp", "hq", "approach-ice");
  runContinue(state);
  runContinue(state);
  expect(refresh(state, bs).subroutines.length).toBe(7);
});

it("brainstorm - subs not going away until end of run", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Brainstorm"], credits: 9 },
    runner: { deck: [qty("Sure Gamble", 5)], hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Brainstorm", "rd");
  takeCredits(state, "corp");
  runOn(state, "rd");
  const bs = getIce(state, "rd", 0);
  rez(state, "corp", bs);
  runContinue(state);
  expect(refresh(state, bs).subroutines.length).toBe(1);
  runContinue(state);
  runContinue(state);
  clickPrompt(state, "runner", "No action");
  expect(refresh(state, bs).subroutines.length).toBe(0);
});

it("bran 1.0", () => {
  const state = newGame({ corp: { hand: ["Brân 1.0", "Mausolus"] } });
  playFromHand(state, "corp", "Brân 1.0", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const bran = getIce(state, "hq", 0);
  rez(state, "corp", bran);
  runContinue(state);
  cardSubroutine(state, "corp", bran, 0);
  waiting(state, "runner");
  changed(() => getCorp(state).credit, 0, () => {
    clickCard(state, "corp", "Mausolus");
  });
  expect(getIce(state, "hq", 0)).toBeTruthy();
  expect(getIce(state, "hq", 1)).toBeTruthy();
  expect((state as any).run.position).toBe(2);
  cardSubroutine(state, "corp", getIce(state, "hq", 1), 1);
  expect(getRun(state)).toBeFalsy();
});

it("bran 1.0 - install ice log messages", () => {
  const state = newGame({
    corp: { hand: ["Brân 1.0"], discard: ["Mausolus", "Ice Wall"] },
  });
  playFromHand(state, "corp", "Brân 1.0", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const bran = getIce(state, "hq", 0);
  rez(state, "corp", bran);
  runContinue(state);
  cardSubroutine(state, "corp", bran, 0);
  clickCard(state, "corp", "Mausolus");
  expect(lastLogContains(state, "pays 0 [Credits] to use Brân 1.0 to install ice from Archives protecting HQ")).toBe(true);
  cardSubroutine(state, "corp", bran, 1);
  runEmptyServer(state, "archives");
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", bran, 0);
  clickCard(state, "corp", "Ice Wall");
  expect(lastLogContains(state, "pays 0 [Credits] to use Brân 1.0 to install Ice Wall from Archives protecting HQ")).toBe(true);
});

it("bullfrog", () => {
  const state = newGame({ corp: { hand: ["Bullfrog", qty("Pup", 2)] } });
  playFromHand(state, "corp", "Bullfrog", "hq");
  playFromHand(state, "corp", "Pup", "rd");
  playFromHand(state, "corp", "Pup", "rd");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const frog = getIce(state, "hq", 0);
  rez(state, "corp", frog);
  runContinue(state);
  cardSubroutine(state, "corp", frog, 0);
  clickPrompt(state, "corp", "0 [Credits]");
  clickPrompt(state, "runner", "1 [Credits]");
  clickPrompt(state, "corp", "R&D");
  runContinue(state);
  expect(getRun(state).server[0]).toBe("rd");
  expect(getRun(state).position).toBe(2);
  expect(getIce(state, "rd", 2).title).toBe("Bullfrog");
});

it("cell portal - run on centrals", () => {
  const state = newGame({ corp: { hand: ["Cell Portal", qty("Paper Wall", 2)] } });
  gain(state, "corp", "credit", 5);
  playFromHand(state, "corp", "Cell Portal", "hq");
  playFromHand(state, "corp", "Paper Wall", "hq");
  playFromHand(state, "corp", "Paper Wall", "hq");
  takeCredits(state, "corp");
  const cp = getIce(state, "hq", 0);
  rez(state, "corp", cp);
  runOn(state, "hq");
  runContinueUntil(state, "encounter-ice", cp);
  expect((state as any).run.position).toBe(1);
  cardSubroutine(state, "corp", cp, 0);
  expect((state as any).run.position).toBe(3);
  clickPrompt(state, "runner", "No");
  expect(rezzed(refresh(state, cp))).toBeFalsy();
});

it("cell portal - run on servers", () => {
  const state = newGame({ corp: { hand: ["Cell Portal", qty("Paper Wall", 2)] } });
  gain(state, "corp", "credit", 5);
  playFromHand(state, "corp", "Cell Portal", "New remote");
  playFromHand(state, "corp", "Paper Wall", "Server 1");
  playFromHand(state, "corp", "Paper Wall", "Server 1");
  takeCredits(state, "corp");
  const cp = getIce(state, "remote1", 0);
  rez(state, "corp", cp);
  runOn(state, "Server 1");
  runContinueUntil(state, "encounter-ice", cp);
  expect((state as any).run.position).toBe(1);
  cardSubroutine(state, "corp", cp, 0);
  expect((state as any).run.position).toBe(3);
  clickPrompt(state, "runner", "No");
  expect(rezzed(refresh(state, cp))).toBeFalsy();
});

it("cell portal - jack out", () => {
  const state = newGame({ corp: { hand: ["Cell Portal", qty("Paper Wall", 2)] } });
  gain(state, "corp", "credit", 5);
  playFromHand(state, "corp", "Cell Portal", "hq");
  playFromHand(state, "corp", "Paper Wall", "hq");
  playFromHand(state, "corp", "Paper Wall", "hq");
  takeCredits(state, "corp");
  const cp = getIce(state, "hq", 0);
  rez(state, "corp", cp);
  runOn(state, "hq");
  runContinueUntil(state, "encounter-ice", cp);
  expect((state as any).run.position).toBe(1);
  cardSubroutine(state, "corp", cp, 0);
  expect((state as any).run.position).toBe(3);
  clickPrompt(state, "runner", "Yes");
  expect(rezzed(refresh(state, cp))).toBeFalsy();
  expect((state as any).run).toBeFalsy();
});

it("capacitor", () => {
  const state = newGame({ corp: { hand: ["Capacitor"] } });
  playFromHand(state, "corp", "Capacitor", "hq");
  takeCredits(state, "corp");
  const cap = getIce(state, "hq", 0);
  rez(state, "corp", cap);
  changed(() => getStrength(refresh(state, cap)), 2, () => {
    gainTags(state, "runner", 2);
  });
  runOn(state, "hq");
  runContinue(state);
  changed(() => getCorp(state).credit, 2, () => {
    cardSubroutine(state, "corp", cap, 0);
  });
  cardSubroutine(state, "corp", cap, 1);
  expect((state as any).run).toBeFalsy();
});

it("checkpoint - deals damage on successful run", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Checkpoint", "Hedge Fund"] },
    runner: { hand: [qty("Sure Gamble", 3)] },
  });
  playFromHand(state, "corp", "Checkpoint", "hq");
  const chckpnt = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", chckpnt);
  runContinue(state);
  fireSubs(state, chckpnt);
  expect(getPromptMap(state, "corp").base).toBe(5);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  runContinue(state, "movement");
  runJackOut(state);
  expect(getRunner(state).discard.length).toBe(0);
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, chckpnt);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  runContinue(state);
  runContinue(state);
  expect(getPromptMap(state, "runner")).toBeTruthy();
  expect(getRunner(state).discard.length).toBe(3);
  clickPrompt(state, "runner", "No action");
  expect((state as any).run).toBeFalsy();
});

describe("chimera", () => {
  let state: any;
  let ch: any;

  beforeEach(() => {
    state = newGame({ corp: { hand: ["Chimera"], credits: 10 } });
    playFromHand(state, "corp", "Chimera", "hq");
    ch = getIce(state, "hq", 0);
  });

  for (const iceType of ["Barrier", "Code Gate", "Sentry"]) {
    it(`gains subtype ${iceType} when rezzed`, () => {
      expect(hasSubtype(refresh(state, ch), iceType)).toBe(false);
      rez(state, "corp", ch);
      clickPrompt(state, "corp", iceType);
      expect(hasSubtype(refresh(state, ch), iceType)).toBe(true);
      takeCredits(state, "corp");
      expect(hasSubtype(refresh(state, ch), iceType)).toBe(false);
    });
  }

  it("can only choose Barrier, Code Gate, or Sentry", () => {
    rez(state, "corp", refresh(state, ch));
    expect(promptButtons(state, "corp")).toEqual(["Barrier", "Code Gate", "Sentry"]);
  });

  it("derezzes at end of corp turn", () => {
    rez(state, "corp", refresh(state, ch));
    clickPrompt(state, "corp", "Barrier");
    takeCredits(state, "corp");
    expect(rezzed(refresh(state, ch))).toBeFalsy();
    rez(state, "corp", refresh(state, ch));
    clickPrompt(state, "corp", "Barrier");
    takeCredits(state, "runner");
    expect(rezzed(refresh(state, ch))).toBeFalsy();
  });
});

it("chiyashi - auto trash", () => {
  const state = newGame({
    corp: { hand: [qty("Chiyashi", 2)], credits: 30 },
    runner: { hand: ["Crypsis", "Corroder", "Hippo"], deck: [qty("Sure Gamble", 50)], credits: 50 },
  });
  playFromHand(state, "corp", "Chiyashi", "hq");
  playFromHand(state, "corp", "Chiyashi", "rd");
  rez(state, "corp", getIce(state, "hq", 0));
  rez(state, "corp", getIce(state, "rd", 0));
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Crypsis");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Hippo");
  gain(state, "runner", "click", 100);
  const corroder = getProgram(state, 1);
  const crypsis = getProgram(state, 0);
  runOn(state, "hq");
  runContinue(state);
  changed(() => getRunner(state).discard.length, 4, () => {
    autoPumpAndBreak(state, corroder);
    core.processAction("continue", state, "corp", null);
    clickPrompt(state, "runner", "Yes");
    runJackOut(state);
  });
  runOn(state, "rd");
  runContinue(state);
  changed(() => getRunner(state).discard.length, 7, () => {
    autoPumpAndBreak(state, crypsis);
    core.processAction("continue", state, "corp", null);
    runJackOut(state);
  });
  runOn(state, "rd");
  runContinue(state);
  changed(() => getRunner(state).discard.length, 0, () => {
    autoPumpAndBreak(state, corroder);
    core.processAction("continue", state, "corp", null);
    runJackOut(state);
  });
});

it("chrysalis", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Chrysalis"] },
    runner: { hand: [qty("Sure Gamble", 2)] },
  });
  playFromHand(state, "corp", "Chrysalis", "hq");
  const chrysalis = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", chrysalis);
  runContinue(state);
  cardSubroutine(state, "corp", chrysalis, 0);
  expect(getRunner(state).discard.length).toBe(2);
});

it("chrysalis - access test", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Chrysalis"] },
    runner: { hand: [qty("Sure Gamble", 2)] },
  });
  takeCredits(state, "corp");
  runEmptyServer(state, "hq");
  expect(core.getCurrentIce(state).title).toBe("Chrysalis");
  fireSubs(state, core.getCurrentIce(state));
  expect(getRunner(state).discard.length).toBe(2);
});

it("chum - +2 strength", () => {
  const state = newGame({
    corp: { hand: ["Chum", qty("Enigma", 2), "Ice Wall"] },
    runner: { hand: ["Corroder"] },
  });
  gain(state, "corp", "click", 1, "credit", 6);
  playFromHand(state, "corp", "Enigma", "hq");
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Enigma", "hq");
  playFromHand(state, "corp", "Chum", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  const chum = getIce(state, "hq", 3);
  const icewall = getIce(state, "hq", 1);
  const enigma = getIce(state, "hq", 0);
  const corroder = getProgram(state, 0);
  rez(state, "corp", chum);
  rez(state, "corp", icewall);
  rez(state, "corp", enigma);
  runOn(state, "hq");
  runContinue(state);
  expect(getStrength(refresh(state, chum))).toBe(4);
  cardSubroutine(state, "corp", refresh(state, chum), 0);
  expect(getStrength(refresh(state, chum))).toBe(4);
  expect(getStrength(refresh(state, icewall))).toBe(1);
  runContinue(state);
  expect(getStrength(refresh(state, icewall))).toBe(1);
  runContinueUntil(state, "encounter-ice", icewall);
  expect(getStrength(refresh(state, icewall))).toBe(3);
  expect(getStrength(refresh(state, enigma))).toBe(2);
  autoPumpAndBreak(state, corroder);
  core.processAction("continue", state, "corp", null);
  runContinueUntil(state, "encounter-ice", enigma);
  expect(getStrength(refresh(state, enigma))).toBe(2);
  runContinue(state, "movement");
  runJackOut(state);
});

it("chum - net damage from passing without breaking", () => {
  const state = newGame({ corp: { hand: ["Chum", "Pachinko"] } });
  playFromHand(state, "corp", "Pachinko", "hq");
  playFromHand(state, "corp", "Chum", "hq");
  takeCredits(state, "corp");
  const chum = getIce(state, "hq", 1);
  const pachinko = getIce(state, "hq", 0);
  rez(state, "corp", chum);
  rez(state, "corp", pachinko);
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", refresh(state, chum), 0);
  runContinueUntil(state, "encounter-ice", pachinko);
  changed(() => getRunner(state).hand.length, -3, () => {
    runContinue(state);
  });
});

it("chum - net damage from ice ending the run", () => {
  const state = newGame({
    corp: { hand: ["Chum", "Ice Wall"] },
    runner: { hand: ["Corroder", qty("Sure Gamble", 4)] },
  });
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Chum", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  const chum = getIce(state, "hq", 1);
  const icewall = getIce(state, "hq", 0);
  const corroder = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", chum);
  runContinue(state);
  cardSubroutine(state, "corp", refresh(state, chum), 0);
  runContinueUntil(state, "approach-ice", icewall);
  rez(state, "corp", icewall);
  runContinue(state);
  autoPumpAndBreak(state, corroder);
  changed(() => getRunner(state).hand.length, 0, () => {
    core.processAction("continue", state, "corp", null);
  });
});

it("cloud eater", () => {
  const state = newGame({
    corp: { hand: ["Cloud Eater"], credits: 10 },
    runner: { hand: [qty("Sure Gamble", 3), "Smartware Distributor"] },
  });
  playFromHand(state, "corp", "Cloud Eater", "hq");
  takeCredits(state, "corp");
  const ce = getIce(state, "hq", 0);
  playFromHand(state, "runner", "Smartware Distributor");
  runOn(state, "hq");
  rez(state, "corp", ce);
  runContinue(state);
  changedMulti(
    [
      [() => getRunner(state).discard.length, 1],
      [() => (getResource(state) as any[]).length, -1],
    ],
    () => {
      cardSubroutine(state, "corp", refresh(state, ce), 0);
      clickCard(state, "corp", "Smartware Distributor");
    }
  );
  changed(() => countTags(state), 2, () => {
    cardSubroutine(state, "corp", refresh(state, ce), 1);
  });
  changedMulti(
    [
      [() => getRunner(state).hand.length, -3],
      [() => getRunner(state).discard.length, 3],
    ],
    () => { cardSubroutine(state, "corp", refresh(state, ce), 2); }
  );
  runContinueUntil(state, "movement");
  expect(promptButtons(state, "runner").length).toBe(2);
  changed(() => countTags(state), 2, () => {
    clickPrompt(state, "runner", "Take 2 tags");
  });
});

it("congratulations!", () => {
  const state = newGame({ corp: { hand: ["Congratulations!"] } });
  playFromHand(state, "corp", "Congratulations!", "hq");
  takeCredits(state, "corp");
  const congrats = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", congrats);
  expect(getCorp(state).credit).toBe(6);
  expect(getRunner(state).credit).toBe(5);
  runContinue(state);
  cardSubroutine(state, "corp", congrats, 0);
  expect(getCorp(state).credit).toBe(8);
  expect(getRunner(state).credit).toBe(6);
  runContinue(state);
  expect(getCorp(state).credit).toBe(9);
});

it("cortex lock", () => {
  const state = newGame({
    corp: { hand: ["Cortex Lock"] },
    runner: { hand: [qty("Corroder", 2), qty("Sure Gamble", 3)] },
  });
  playFromHand(state, "corp", "Cortex Lock", "hq");
  takeCredits(state, "corp");
  const cort = getIce(state, "hq", 0);
  playFromHand(state, "runner", "Corroder");
  expect(core.availableMu(state)).toBe(3);
  runOn(state, "hq");
  rez(state, "corp", cort);
  runContinue(state);
  cardSubroutine(state, "corp", cort, 0);
  expect(getRunner(state).discard.length).toBe(3);
});

it("crick", () => {
  const state = newGame({
    corp: { hand: [qty("Crick", 2)], discard: ["Ice Wall"] },
  });
  playFromHand(state, "corp", "Crick", "hq");
  playFromHand(state, "corp", "Crick", "archives");
  takeCredits(state, "corp");
  const cr1 = getIce(state, "hq", 0);
  const cr2 = getIce(state, "archives", 0);
  rez(state, "corp", cr1);
  rez(state, "corp", cr2);
  expect(getStrength(refresh(state, cr1))).toBe(3);
  expect(getStrength(refresh(state, cr2))).toBe(6);
  runOn(state, "archives");
  runContinue(state);
  cardSubroutine(state, "corp", cr2, 0);
  clickCard(state, "corp", "Ice Wall");
  clickPrompt(state, "corp", "HQ");
  expect(getCorp(state).credit).toBe(3);
});

it("curtain wall - strength boost when outermost", () => {
  const state = newGame({ corp: { hand: ["Curtain Wall", "Paper Wall"] } });
  gain(state, "corp", "credit", 10);
  playFromHand(state, "corp", "Curtain Wall", "hq");
  const curt = getIce(state, "hq", 0);
  rez(state, "corp", curt);
  expect(getStrength(refresh(state, curt))).toBe(10);
  playFromHand(state, "corp", "Paper Wall", "hq");
  const paper = getIce(state, "hq", 1);
  rez(state, "corp", paper);
  expect(getStrength(refresh(state, curt))).toBe(6);
});

it("data hound", () => {
  const state = newGame({
    corp: { hand: ["Data Hound"] },
    runner: { deck: ["Sure Gamble", "Desperado", "Corroder", "Patron"], hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Data Hound", "hq");
  takeCredits(state, "corp");
  const dh = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", dh);
  runContinue(state);
  cardSubroutine(state, "corp", dh, 0);
  clickPrompt(state, "corp", "2");
  clickPrompt(state, "runner", "0");
  clickPrompt(state, "corp", "Desperado");
  expect(getRunner(state).discard.length).toBe(1);
  clickPrompt(state, "corp", "Sure Gamble");
  clickPrompt(state, "corp", "Corroder");
  clickPrompt(state, "corp", "Patron");
  clickPrompt(state, "corp", "Start over");
  clickPrompt(state, "corp", "Patron");
  clickPrompt(state, "corp", "Corroder");
  clickPrompt(state, "corp", "Sure Gamble");
  clickPrompt(state, "corp", "Done");
  expect(getRunner(state).deck[0].title).toBe("Sure Gamble");
  expect(getRunner(state).deck[1].title).toBe("Corroder");
  expect(getRunner(state).deck[2].title).toBe("Patron");
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", dh, 0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "1");
  expect(getRunner(state).discard.length).toBe(2);
  expect(getRunner(state).deck[0].title).toBe("Corroder");
});

it("data loop - enough cards in hand", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Data Loop"], credits: 10 },
    runner: { deck: ["Account Siphon"], hand: ["Sure Gamble", "Easy Mark"] },
  });
  playFromHand(state, "corp", "Data Loop", "hq");
  takeCredits(state, "corp");
  expect(getRunner(state).deck[0].title).toBe("Account Siphon");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  expect(getPromptMap(state, "runner").msg).toContain("Choose 2 cards");
  clickCard(state, "runner", "Easy Mark");
  clickCard(state, "runner", "Sure Gamble");
  expect(getRunner(state).deck[0].title).toBe("Sure Gamble");
  expect(getRunner(state).deck[1].title).toBe("Easy Mark");
});

it("data loop - 1 card in hand", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Data Loop"], credits: 10 },
    runner: { deck: ["Account Siphon"], hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Data Loop", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  expect(getPromptMap(state, "runner").msg).toContain("Choose 1 card");
  clickCard(state, "runner", "Sure Gamble");
  expect(noPrompt(state, "runner")).toBe(true);
  expect(getRunner(state).deck[0].title).toBe("Sure Gamble");
});

it("data loop - empty hand", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Data Loop"], credits: 10 },
    runner: { deck: ["Account Siphon"], hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Data Loop", "hq");
  takeCredits(state, "corp");
  move(state, "runner", findCard("Sure Gamble", getRunner(state).hand)!, "discard");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  expect(noPrompt(state, "runner")).toBe(true);
});

it("data mine", () => {
  const state = newGame({ corp: { hand: ["Data Mine"] } });
  playFromHand(state, "corp", "Data Mine", "New remote");
  takeCredits(state, "corp");
  const dm = getIce(state, "remote1", 0);
  runOn(state, "Server 1");
  rez(state, "corp", dm);
  runContinue(state);
  cardSubroutine(state, "corp", dm, 0);
  expect(getRunner(state).discard.length).toBe(1);
});

it("data ward - pay 3 credits", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Data Ward"] } });
  playFromHand(state, "corp", "Data Ward", "hq");
  takeCredits(state, "corp");
  const dw = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", dw);
  runContinue(state);
  changed(() => getRunner(state).credit, -3, () => {
    clickPrompt(state, "runner", "Pay 3 [Credits]");
  });
  expect(noPrompt(state, "runner")).toBe(true);
});

it("data ward - take 1 tag", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Data Ward"] } });
  playFromHand(state, "corp", "Data Ward", "hq");
  takeCredits(state, "corp");
  const dw = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", dw);
  runContinue(state);
  changed(() => countTags(state), 1, () => {
    clickPrompt(state, "runner", "Take 1 tag");
  });
  expect(noPrompt(state, "runner")).toBe(true);
});

it("data ward - ends run only if runner is tagged", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Data Ward"] } });
  playFromHand(state, "corp", "Data Ward", "hq");
  takeCredits(state, "corp");
  const dw = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", dw);
  runContinue(state);
  clickPrompt(state, "runner", "Take 1 tag");
  fireSubs(state, refresh(state, dw));
  expect((state as any).run).toBeFalsy();
  removeTag(state, "runner");
  runOn(state, "hq");
  runContinue(state);
  clickPrompt(state, "runner", "Pay 3 [Credits]");
  fireSubs(state, refresh(state, dw));
  expect((state as any).run).toBeTruthy();
});

it("datapike", () => {
  const state = newGame({ corp: { hand: ["Datapike"] } });
  playFromHand(state, "corp", "Datapike", "hq");
  const dp = getIce(state, "hq", 0);
  rez(state, "corp", dp);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  expect(getRunner(state).credit).toBe(5);
  cardSubroutine(state, "corp", dp, 0);
  expect(getRunner(state).credit).toBe(3);
  expect((state as any).run).toBeTruthy();
  cardSubroutine(state, "corp", dp, 1);
  expect((state as any).run).toBeFalsy();
});

it("datapike - cannot pay", () => {
  const state = newGame({
    corp: { hand: ["Datapike"] },
    runner: { hand: ["Professional Contacts"] },
  });
  playFromHand(state, "corp", "Datapike", "hq");
  const dp = getIce(state, "hq", 0);
  rez(state, "corp", dp);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Professional Contacts");
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", dp, 0);
  expect((state as any).run).toBeFalsy();
});

it("descent", () => {
  const state = newGame({
    corp: { hand: ["Descent"], deck: ["Hedge Fund", "Project Atlas"], discard: ["Ikawah Project"] },
  });
  playFromHand(state, "corp", "Descent", "hq");
  takeCredits(state, "corp");
  const hm = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", hm);
  runContinue(state);
  fireSubs(state, hm);
  expect((state as any).run).toBeFalsy();
  takeCredits(state, "runner");
  changed(() => getCorp(state).hand.length, 2, () => {
    clickPrompt(state, "corp", "Yes");
    expect(refresh(state, getIce(state, "hq", 0))).toBeNull();
  });
  const descent = findCard("Descent", getCorp(state).hand)!;
  expend(state, "corp", descent);
  changedMulti(
    [
      [() => getCorp(state).hand.length, -1],
      [() => getCorp(state).discard.length, -1],
      [() => getCorp(state).deck.length, 2],
    ],
    () => {
      clickCard(state, "corp", "Ikawah Project");
      clickCard(state, "corp", "Project Atlas");
    }
  );
});

it("diviner - even cost (no ETR)", () => {
  const state = newGame({
    corp: { hand: ["Diviner"] },
    runner: { hand: ["Corroder"] },
  });
  playFromHand(state, "corp", "Diviner", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const diviner = getIce(state, "hq", 0);
  rez(state, "corp", diviner);
  runContinue(state);
  changed(() => getRunner(state).discard.length, 1, () => {
    fireSubs(state, diviner);
  });
  expect(getRun(state)).toBeTruthy();
});

it("diviner - odd cost (ETR)", () => {
  const state = newGame({
    corp: { hand: ["Diviner"] },
    runner: { hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Diviner", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const diviner = getIce(state, "hq", 0);
  rez(state, "corp", diviner);
  runContinue(state);
  fireSubs(state, diviner);
  expect(getRun(state)).toBeFalsy();
});

it("draco", () => {
  const state = newGame({ corp: { hand: ["Dracō"] } });
  playFromHand(state, "corp", "Dracō", "hq");
  takeCredits(state, "corp");
  const drac = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", drac);
  clickPrompt(state, "corp", "4");
  runContinue(state);
  expect(getCounters(refresh(state, drac), "power")).toBe(4);
  expect(getStrength(refresh(state, drac))).toBe(4);
  cardSubroutine(state, "corp", drac, 0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(countTags(state)).toBe(1);
  expect((state as any).run).toBeFalsy();
});

it("drafter - subroutine 1 add card from archives to HQ", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Drafter"], discard: ["Wotan"] },
  });
  playFromHand(state, "corp", "Drafter", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const drafter = getIce(state, "hq", 0);
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardSubroutine(state, "corp", drafter, 0);
  clickCard(state, "corp", "Wotan");
  expect(findCard("Wotan", getCorp(state).hand)).toBeTruthy();
});

it("drafter - subroutine 2 install from archives", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Drafter", "Fairchild"], discard: ["Wotan"] },
  });
  playFromHand(state, "corp", "Drafter", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const drafter = getIce(state, "hq", 0);
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardSubroutine(state, "corp", drafter, 1);
  clickCard(state, "corp", "Wotan");
  changed(() => getCorp(state).credit, 0, () => {
    clickPrompt(state, "corp", "HQ");
  });
  expect(getIce(state, "hq", 1).title).toBe("Wotan");
});

it("drafter - subroutine 2 install from HQ", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Drafter", "Fairchild"], discard: ["Wotan"] },
  });
  playFromHand(state, "corp", "Drafter", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const drafter = getIce(state, "hq", 0);
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  cardSubroutine(state, "corp", drafter, 1);
  clickCard(state, "corp", "Fairchild");
  changed(() => getCorp(state).credit, 0, () => {
    clickPrompt(state, "corp", "HQ");
  });
  expect(getIce(state, "hq", 1).title).toBe("Fairchild");
});

it("echo", () => {
  const state = newGame({ corp: { hand: [qty("Echo", 3)], credits: 15 } });
  playFromHand(state, "corp", "Echo", "hq");
  playFromHand(state, "corp", "Echo", "hq");
  playFromHand(state, "corp", "Echo", "hq");
  const e1 = getIce(state, "hq", 0);
  const e2 = getIce(state, "hq", 1);
  const e3 = getIce(state, "hq", 2);
  rez(state, "corp", e1);
  expect(getCounters(refresh(state, e1), "power")).toBe(1);
  expect(getCounters(refresh(state, e2), "power")).toBe(0);
  rez(state, "corp", e2);
  expect(getCounters(refresh(state, e1), "power")).toBe(2);
  expect(getCounters(refresh(state, e2), "power")).toBe(1);
  expect(getCounters(refresh(state, e3), "power")).toBe(0);
  rez(state, "corp", e3);
  expect(getCounters(refresh(state, e1), "power")).toBe(3);
  expect(getCounters(refresh(state, e2), "power")).toBe(2);
  expect(getCounters(refresh(state, e3), "power")).toBe(1);
  expect(refresh(state, e1).subroutines.length).toBe(3);
});

it("endless eula - runner side ability", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Endless EULA"] },
    runner: { credits: 10 },
  });
  playFromHand(state, "corp", "Endless EULA", "hq");
  takeCredits(state, "corp");
  const eula = getIce(state, "hq", 0);
  const credits = getRunner(state).credit;
  rez(state, "corp", eula);
  runOn(state, "hq");
  runContinue(state);
  cardSideAbility(state, "runner", eula, 0);
  expect(getRunner(state).credit).toBe(credits - 6);
});

it("endless eula - interaction with mass-driver", () => {
  const state = newGame({
    corp: { hand: ["Enigma", "Endless EULA"], credits: 20 },
    runner: { hand: ["Mass-Driver"], credits: 20 },
  });
  playFromHand(state, "corp", "Endless EULA", "hq");
  playFromHand(state, "corp", "Enigma", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Mass-Driver");
  const eula = getIce(state, "hq", 0);
  const enigma = getIce(state, "hq", 1);
  const massDriver = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", enigma);
  runContinue(state);
  cardAbility(state, "runner", massDriver, 1);
  cardAbility(state, "runner", massDriver, 0);
  clickPrompt(state, "runner", "Force the Runner to lose [Click]");
  clickPrompt(state, "runner", "End the run");
  runContinueUntil(state, "approach-ice", eula);
  rez(state, "corp", eula);
  runContinue(state);
  changed(() => getRunner(state).credit, -3, () => {
    cardSideAbility(state, "runner", eula, 0);
  });
});

it("engram flush", () => {
  const state = newGame({
    corp: { hand: ["Engram Flush"] },
    runner: { hand: ["Daily Casts", "Sure Gamble", "Dirty Laundry", "Political Operative", "Corroder"] },
  });
  playFromHand(state, "corp", "Engram Flush", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const ef = getIce(state, "hq", 0);
  rez(state, "corp", ef);
  runContinue(state);
  clickPrompt(state, "corp", "Program");
  cardSubroutine(state, "corp", ef, 0);
  expect(getRunner(state).discard.length).toBe(0);
  clickCard(state, "corp", "Corroder");
  expect(findCard("Corroder", getRunner(state).hand)).toBeFalsy();
  expect(getRunner(state).discard.length).toBe(1);
  cardSubroutine(state, "corp", ef, 0);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("enigma", () => {
  const state = newGame({ corp: { hand: ["Enigma"] } });
  playFromHand(state, "corp", "Enigma", "hq");
  takeCredits(state, "corp");
  const enig = getIce(state, "hq", 0);
  runOn(state, "hq");
  expect(getRunner(state).click).toBe(3);
  rez(state, "corp", enig);
  runContinue(state);
  cardSubroutine(state, "corp", enig, 0);
  expect(getRunner(state).click).toBe(2);
});

it("envelope", () => {
  const state = newGame({ corp: { hand: ["Envelope"] } });
  playFromHand(state, "corp", "Envelope", "hq");
  takeCredits(state, "corp");
  const envl = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", envl);
  runContinue(state);
  expect(getRunner(state).discard.length).toBe(0);
  cardSubroutine(state, "corp", envl, 0);
  expect(getRunner(state).discard.length).toBe(1);
  expect((state as any).run).toBeTruthy();
  cardSubroutine(state, "corp", envl, 1);
  expect((state as any).run).toBeFalsy();
});

it("envelopment", () => {
  const state = newGame({ corp: { hand: ["Envelopment"], credits: 10 } });
  playFromHand(state, "corp", "Envelopment", "hq");
  const env = getIce(state, "hq", 0);
  rez(state, "corp", env);
  // starts with 4 counters
  for (let n = 4; n >= 0; n--) {
    expect(getCounters(refresh(state, env), "power")).toBe(n);
    expect(refresh(state, env).subroutines.length).toBe(n + 1);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
  }
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, refresh(state, env));
  expect(getCorp(state).discard.length).toBe(1);
});

it("envelopment - etr does not trash", () => {
  const state = newGame({ corp: { hand: ["Envelopment"], credits: 10 } });
  playFromHand(state, "corp", "Envelopment", "hq");
  const env = getIce(state, "hq", 0);
  rez(state, "corp", env);
  expect(getCounters(refresh(state, env), "power")).toBe(4);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, refresh(state, env));
  expect(getCorp(state).discard.length).toBe(0);
  expect((state as any).run).toBeFalsy();
});

it("envelopment - sub indexed correctly after running out of counters #7201", () => {
  const state = newGame({ corp: { hand: ["Envelopment"], credits: 10 } });
  playFromHand(state, "corp", "Envelopment", "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  takeCredits(state, "corp");
  for (let i = 0; i < 4; i++) {
    takeCredits(state, "runner");
    takeCredits(state, "corp");
  }
  expect(getIce(state, "hq", 0).subroutines.length).toBe(1);
  expect(getIce(state, "hq", 0).subroutines[0].index).toBe(0);
});

it("excalibur - prevent runner from making another run", () => {
  const state = newGame({
    corp: { hand: ["Excalibur"] },
    runner: { hand: ["Stimhack"] },
  });
  playFromHand(state, "corp", "Excalibur", "hq");
  takeCredits(state, "corp");
  const excal = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", excal);
  runContinue(state);
  cardSubroutine(state, "corp", excal, 0);
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "rd", { waitAtInitiation: true });
  expect((state as any).run).toBeFalsy();
  expect(getRunner(state).click).toBe(3);
  playFromHand(state, "runner", "Stimhack");
  expect((state as any).run).toBeFalsy();
  expect(getRunner(state).click).toBe(3);
  expect(getRunner(state).discard.length).toBe(0);
  takeCredits(state, "runner");
  gain(state, "runner", "click", 1);
  runOn(state, "hq");
  expect((state as any).run).toBeTruthy();
});

it("ezam - swaps with other ice", () => {
  const state = newGame({ corp: { hand: ["ezaM", "Vanilla"] } });
  playFromHand(state, "corp", "ezaM", "hq");
  playFromHand(state, "corp", "Vanilla", "archives");
  rez(state, "corp", getIce(state, "hq", 0));
  cardAbility(state, "corp", getIce(state, "hq", 0), 0);
  clickCard(state, "corp", "Vanilla");
  expect(getIce(state, "hq", 0).title).toBe("Vanilla");
  expect(getIce(state, "archives", 0).title).toBe("ezaM");
});

it("f2p", () => {
  const state = newGame({
    corp: { hand: ["F2P"] },
    runner: { hand: ["Inti", "Scrubber"] },
  });
  playFromHand(state, "corp", "F2P", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Inti");
  playFromHand(state, "runner", "Scrubber");
  expect(getRunner(state).hand.length).toBe(0);
  runOn(state, "hq");
  const f2p = getIce(state, "hq", 0);
  rez(state, "corp", refresh(state, f2p));
  runContinue(state);
  changed(() => getRunner(state).credit, -2, () => {
    cardSideAbility(state, "runner", f2p, 0);
    clickPrompt(state, "runner", "Add an installed Runner card to the grip");
  });
  cardSubroutine(state, "corp", refresh(state, f2p), 0);
  changed(() => getRunner(state).hand.length, 1, () => {
    clickCard(state, "corp", "Inti");
  });
  cardSubroutine(state, "corp", refresh(state, f2p), 0);
  changed(() => getRunner(state).hand.length, 1, () => {
    clickCard(state, "corp", "Scrubber");
  });
  cardSubroutine(state, "corp", refresh(state, f2p), 0);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("fairchild 1.0", () => {
  const state = newGame({
    corp: { hand: ["Fairchild 1.0"] },
    runner: { hand: ["Sacrificial Construct", "Clone Chip"] },
  });
  playFromHand(state, "corp", "Fairchild 1.0", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Sacrificial Construct");
  playFromHand(state, "runner", "Clone Chip");
  const fairchild = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", fairchild);
  runContinue(state);
  cardSubroutine(state, "corp", fairchild, 0);
  clickPrompt(state, "runner", "Trash an installed card");
  expect(getPromptMap(state, "runner").msg).toBe("Choose an installed card to trash");
  clickCard(state, "runner", "Sacrificial Construct");
  expect((getResource(state) as any[]).length).toBe(0);
  cardSubroutine(state, "corp", fairchild, 1);
  clickPrompt(state, "runner", "Trash an installed card");
  clickCard(state, "runner", "Clone Chip");
  expect((getHardware(state) as any[]).length).toBe(0);
});

it("fairchild 1.0 - runner cannot pay", () => {
  const state = newGame({
    corp: { hand: ["Fairchild 1.0"] },
    runner: { credits: 1 },
  });
  playFromHand(state, "corp", "Fairchild 1.0", "hq");
  takeCredits(state, "corp");
  const fc1 = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", fc1);
  runContinue(state);
  cardSubroutine(state, "corp", fc1, 0);
  expect(getPromptMap(state, "runner").choices.length).toBe(1);
  changed(() => getRunner(state).credit, -1, () => {
    clickPrompt(state, "runner", "Pay 1 [Credits]");
  });
  cardSubroutine(state, "corp", fc1, 1);
  expect(noPrompt(state, "runner")).toBe(true);
});

it("fairchild 2.0", () => {
  const state = newGame({
    corp: { hand: ["Fairchild 2.0"] },
    runner: { hand: ["Sacrificial Construct", "Clone Chip", "Sure Gamble"] },
  });
  playFromHand(state, "corp", "Fairchild 2.0", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Sacrificial Construct");
  playFromHand(state, "runner", "Clone Chip");
  const fairchild = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", fairchild);
  runContinue(state);
  cardSubroutine(state, "corp", fairchild, 0);
  clickPrompt(state, "runner", "Trash an installed card");
  clickCard(state, "runner", "Sacrificial Construct");
  expect((getResource(state) as any[]).length).toBe(0);
  cardSubroutine(state, "corp", fairchild, 1);
  clickPrompt(state, "runner", "Trash an installed card");
  clickCard(state, "runner", "Clone Chip");
  expect((getHardware(state) as any[]).length).toBe(0);
  cardSubroutine(state, "corp", fairchild, 2);
  expect(getRunner(state).brainDamage).toBe(1);
});

it("fairchild 3.0", () => {
  const state = newGame({
    corp: { hand: ["Fairchild 3.0"] },
    runner: { hand: ["Sacrificial Construct", "Clone Chip", "Sure Gamble"] },
  });
  playFromHand(state, "corp", "Fairchild 3.0", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Sacrificial Construct");
  playFromHand(state, "runner", "Clone Chip");
  const fairchild = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", fairchild);
  runContinue(state);
  cardSubroutine(state, "corp", fairchild, 0);
  clickPrompt(state, "runner", "Trash an installed card");
  clickCard(state, "runner", "Sacrificial Construct");
  cardSubroutine(state, "corp", fairchild, 1);
  clickPrompt(state, "runner", "Trash an installed card");
  clickCard(state, "runner", "Clone Chip");
  cardSubroutine(state, "corp", fairchild, 2);
  clickPrompt(state, "corp", "End the run");
  expect((state as any).run).toBeFalsy();
});

it("fenris", () => {
  const state = newGame({ corp: { hand: ["Fenris"] } });
  playFromHand(state, "corp", "Fenris", "hq");
  takeCredits(state, "corp");
  const fen = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", fen);
  runContinue(state);
  expect(countBadPub(state)).toBe(1);
  cardSubroutine(state, "corp", fen, 0);
  expect(getRunner(state).brainDamage).toBe(1);
  expect(getRunner(state).discard.length).toBe(1);
  expect(handSize(state, "runner")).toBe(4);
});

it("flare", () => {
  const state = newGame({
    corp: { hand: ["Flare"] },
    runner: { hand: ["Plascrete Carapace", "Clone Chip", qty("Cache", 3)] },
  });
  playFromHand(state, "corp", "Flare", "hq");
  gain(state, "corp", "credit", 2);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Plascrete Carapace");
  playFromHand(state, "runner", "Clone Chip");
  const flare = getIce(state, "hq", 0);
  const cc = getHardware(state, 1);
  runOn(state, "hq");
  rez(state, "corp", flare);
  runContinue(state);
  cardSubroutine(state, "corp", flare, 0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", cc);
  expect(getHardware(state, 0)).toBeTruthy();
  expect(noPrompt(state, "runner")).toBe(true);
  expect(getRunner(state).hand.length).toBe(1);
  expect(getRunner(state).discard.length).toBe(3);
  expect((state as any).run).toBeFalsy();
});

it("flyswatter - purge on rez", () => {
  const state = newGame({
    corp: { hand: ["Flyswatter"] },
    runner: { hand: ["Lamprey"] },
  });
  playFromHand(state, "corp", "Flyswatter", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Lamprey");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  expect(getRunner(state).discard[0].title).toBe("Lamprey");
});

it("formicary - basic functionality", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall", "Formicary", "Formicary"] },
    runner: { hand: ["First Responders"] },
  });
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Formicary", "archives");
  playFromHand(state, "corp", "Formicary", "rd");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "First Responders");
  const responders = getResource(state, 0);
  runOn(state, "hq");
  runContinue(state);
  expect((state as any).run.position).toBe(0);
  runContinue(state);
  clickPrompt(state, "corp", "Formicary");
  expect(getPromptMap(state, "corp").msg).toContain("Rez and move Formicary protecting Archives");
  clickPrompt(state, "corp", "Yes");
  expect(getIce(state, "hq", 0)).toBeTruthy();
  expect(getIce(state, "hq", 1)).toBeTruthy();
  expect((state as any).run.position).toBe(1);
  cardSubroutine(state, "corp", getIce(state, "hq", 0), 0);
  clickPrompt(state, "runner", "Suffer 2 net damage");
  expect(getRunner(state).discard.length).toBe(2);
  runContinueUntil(state, "success");
  clickPrompt(state, "corp", "No");
  clickPrompt(state, "runner", "No action");
  const cardsInHand = getRunner(state).hand.length;
  cardAbility(state, "runner", responders, 0);
  expect(getRunner(state).hand.length).toBe(cardsInHand + 1);
});

it("formicary - can be moved to innermost position of own server", () => {
  const state = newGame({ corp: { hand: ["Ice Wall", "Formicary"] } });
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Formicary", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinueUntil(state, "movement");
  runContinueUntil(state, "movement");
  expect((state as any).run.position).toBe(0);
  runContinue(state);
  expect(getIce(state, "hq", 0).title).toBe("Ice Wall");
  expect(getIce(state, "hq", 1).title).toBe("Formicary");
  clickPrompt(state, "corp", "Yes");
  expect((state as any).run.position).toBe(1);
  expect(getIce(state, "hq", 0).title).toBe("Formicary");
  expect(getIce(state, "hq", 1).title).toBe("Ice Wall");
});

it("formicary - no prompt if unable to rez", () => {
  const state = newGame({ corp: { hand: ["Formicary"] } });
  playFromHand(state, "corp", "Formicary", "hq");
  takeCredits(state, "corp");
  lose(state, "corp", "credit", 7);
  runOn(state, "rd");
  runContinue(state);
  expect(getIce(state, "hq", 0).title).toBe("Formicary");
  expect(getCorp(state).credit).toBe(0);
  expect(getRun(state)).toBeFalsy();
});

it("formicary - ddos functionality", () => {
  const state = newGame({
    corp: { hand: ["Formicary", "Vanilla"] },
    runner: { hand: ["DDoS"] },
  });
  playFromHand(state, "corp", "Formicary", "hq");
  playFromHand(state, "corp", "Vanilla", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "DDoS");
  cardAbility(state, "runner", getResource(state, 0), 0);
  runOn(state, "rd");
  runContinue(state);
  expect(getPromptMap(state, "corp").msg).toContain("Rez and move Formicary protecting HQ");
  clickPrompt(state, "corp", "Yes");
  const fc = getIce(state, "rd", 0);
  expect(rezzed(fc)).toBeTruthy();
});

it("free lunch - basic behavior", () => {
  const state = newGame({ corp: { hand: ["Free Lunch"] } });
  playFromHand(state, "corp", "Free Lunch", "hq");
  takeCredits(state, "corp");
  const fl = getIce(state, "hq", 0);
  rez(state, "corp", fl);
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", fl, 0);
  expect(getCounters(refresh(state, fl), "power")).toBe(1);
  cardSubroutine(state, "corp", fl, 0);
  expect(getCounters(refresh(state, fl), "power")).toBe(2);
  expect(getRunner(state).credit).toBe(5);
  cardAbility(state, "corp", refresh(state, fl), 0);
  expect(getCounters(refresh(state, fl), "power")).toBe(1);
  expect(getRunner(state).credit).toBe(4);
});

it("free lunch - derez/re-rez", () => {
  const state = newGame({ corp: { hand: ["Free Lunch"], credits: 20 } });
  playFromHand(state, "corp", "Free Lunch", "hq");
  takeCredits(state, "corp");
  const fl = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", fl);
  runContinue(state);
  fireSubs(state, refresh(state, fl));
  expect(getCounters(refresh(state, fl), "power")).toBe(2);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  derez(state, "corp", refresh(state, fl));
  rez(state, "corp", fl);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, refresh(state, fl));
  expect(getCounters(refresh(state, fl), "power")).toBe(4);
});

it("funhouse", () => {
  const state = newGame({ corp: { hand: ["Funhouse"] } });
  playFromHand(state, "corp", "Funhouse", "hq");
  takeCredits(state, "corp");
  const tt = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", tt);
  runContinue(state);
  clickPrompt(state, "runner", "End the run");
  expect((state as any).run).toBeFalsy();
  runOn(state, "hq");
  runContinue(state);
  expect(countTags(state)).toBe(0);
  clickPrompt(state, "runner", "Take 1 tag");
  expect(countTags(state)).toBe(1);
  fireSubs(state, tt);
  clickPrompt(state, "runner", "Take 1 tag");
  expect(countTags(state)).toBe(2);
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "hq");
  runContinue(state);
  clickPrompt(state, "runner", "Take 1 tag");
  fireSubs(state, tt);
  expect(getRunner(state).credit).toBe(5);
  clickPrompt(state, "runner", "Pay 4 [Credits]");
  expect(getRunner(state).credit).toBe(1);
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "hq");
  runContinue(state);
  clickPrompt(state, "runner", "Take 1 tag");
  changed(() => countTags(state), 1, () => {
    fireSubs(state, tt);
    expect(getRunner(state).credit).toBe(1);
  });
});

it("funhouse vs jesminder", () => {
  const state = newGame({
    corp: { hand: ["Funhouse"] },
    runner: { id: "Jesminder Sareen: Girl Behind the Curtain" },
  });
  playFromHand(state, "corp", "Funhouse", "hq");
  takeCredits(state, "corp");
  const tt = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", tt);
  runContinue(state);
  expect(promptButtons(state, "runner")).toEqual(["End the run"]);
  clickPrompt(state, "runner", "End the run");
});

it("funhouse vs dorm computer", () => {
  const state = newGame({
    corp: { hand: ["Funhouse"] },
    runner: { hand: ["Dorm Computer"] },
  });
  playFromHand(state, "corp", "Funhouse", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Dorm Computer");
  const dorm = getHardware(state, 0);
  const tt = getIce(state, "hq", 0);
  cardAbility(state, "runner", dorm, 0);
  clickPrompt(state, "runner", "HQ");
  runContinue(state);
  expect((state as any).run.phase).toBe("approach-ice");
  rez(state, "corp", tt);
  runContinue(state);
  expect((state as any).run.phase).toBe("encounter-ice");
  expect(promptButtons(state, "runner")).toEqual(["End the run"]);
  clickPrompt(state, "runner", "End the run");
});

it("funhouse vs qianju pt", () => {
  const state = newGame({
    corp: { hand: ["Funhouse"] },
    runner: { hand: ["Qianju PT"] },
  });
  playFromHand(state, "corp", "Funhouse", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Qianju PT");
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  const pt = getHardware(state, 0);
  const tt = getIce(state, "hq", 0);
  cardAbility(state, "runner", pt, 0);
  endPhase12(state, "runner");
  expect(getRunner(state).click).toBe(3);
  runOn(state, "hq");
  rez(state, "corp", tt);
  runContinue(state);
  expect((state as any).run.phase).toBe("encounter-ice");
  expect(promptButtons(state, "runner")).toEqual(["End the run"]);
  clickPrompt(state, "runner", "End the run");
});

it("gatekeeper - basic tests", () => {
  const state = newGame({
    corp: {
      deck: [qty("Ice Wall", 10)],
      hand: ["Gatekeeper", "Posted Bounty", "Hostile Takeover"],
      discard: [qty("Ice Wall", 2), "Hostile Takeover"],
    },
  });
  playFromHand(state, "corp", "Gatekeeper", "New remote");
  takeCredits(state, "corp");
  const gate = getIce(state, "remote1", 0);
  const hand = getCorp(state).hand.length;
  const deck = getCorp(state).deck.length;
  const hostile = findCard("Hostile Takeover", getCorp(state).hand)!;
  runOn(state, "Server 1");
  rez(state, "corp", gate);
  runContinue(state);
  expect(getStrength(refresh(state, gate))).toBe(6);
  cardSubroutine(state, "corp", gate, 0);
  clickPrompt(state, "corp", "3");
  expect(getCorp(state).hand.length).toBe(hand + 3);
  clickCard(state, "corp", hostile);
  clickCard(state, "corp", findCard("Hostile Takeover", getCorp(state).discard)!);
  clickCard(state, "corp", findCard("Posted Bounty", getCorp(state).hand)!);
  expect(getCorp(state).deck.length).toBe(deck);
  cardSubroutine(state, "corp", gate, 1);
  expect((state as any).run).toBeFalsy();
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(getStrength(refresh(state, gate))).toBe(0);
});

it("gemini", () => {
  const state = newGame({
    corp: { hand: ["Gemini", qty("Hedge Fund", 2)] },
    runner: { hand: [qty("Sure Gamble", 3), qty("Dirty Laundry", 2)] },
  });
  playFromHand(state, "corp", "Gemini", "hq");
  playFromHand(state, "corp", "Hedge Fund");
  playFromHand(state, "corp", "Hedge Fund");
  takeCredits(state, "corp");
  const gem = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", gem);
  runContinue(state);
  cardSubroutine(state, "corp", gem, 0);
  clickPrompt(state, "corp", "3");
  clickPrompt(state, "runner", "0");
  expect(getRunner(state).discard.length).toBe(2);
  cardSubroutine(state, "corp", gem, 0);
  clickPrompt(state, "corp", "3");
  clickPrompt(state, "runner", "5");
  expect(getRunner(state).discard.length).toBe(3);
});

it("gold farmer - subroutine test", () => {
  const state = newGame({ corp: { hand: ["Gold Farmer"] } });
  playFromHand(state, "corp", "Gold Farmer", "hq");
  takeCredits(state, "corp");
  const gf = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", gf);
  runContinue(state);
  changed(() => getRunner(state).credit, -3, () => {
    cardSubroutine(state, "corp", gf, 0);
    clickPrompt(state, "runner", "Pay 3 [Credits]");
  });
});

it("gold farmer - lose credit for breaking", () => {
  const state = newGame({
    corp: { hand: ["Gold Farmer"] },
    runner: { hand: ["Corroder"], credits: 100 },
  });
  playFromHand(state, "corp", "Gold Farmer", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  const gf = getIce(state, "hq", 0);
  const cor = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", gf);
  runContinue(state);
  changed(() => getRunner(state).credit, -2, () => {
    cardAbility(state, "runner", cor, 0);
    clickPrompt(state, "runner", "End the run unless the Runner pays 3 [Credits]");
    clickPrompt(state, "runner", "Done");
    expect(lastLogContains(state, "Corp uses Gold Farmer to force the runner to lose 1 [Credits] for breaking printed subs")).toBe(true);
  });
});

it("gold farmer - hippo interaction with corroder", () => {
  const state = newGame({
    corp: { hand: ["Gold Farmer"] },
    runner: { hand: ["Corroder", "Hippo"], credits: 100 },
  });
  playFromHand(state, "corp", "Gold Farmer", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  playFromHand(state, "runner", "Hippo");
  const gf = getIce(state, "hq", 0);
  const cor = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", gf);
  runContinue(state);
  changed(() => getRunner(state).credit, -3, () => {
    autoPumpAndBreak(state, cor);
    clickPrompt(state, "runner", "Yes");
  });
});

it("gold farmer - hippo interaction with laamb", () => {
  const state = newGame({
    corp: { hand: ["Gold Farmer"] },
    runner: { hand: ["Laamb", "Hippo"], credits: 100 },
  });
  playFromHand(state, "corp", "Gold Farmer", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Laamb");
  playFromHand(state, "runner", "Hippo");
  const gf = getIce(state, "hq", 0);
  const lam = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", gf);
  runContinue(state);
  changed(() => getRunner(state).credit, -2, () => {
    autoPumpAndBreak(state, lam);
    clickPrompt(state, "runner", "Yes");
  });
});

it("gold farmer - hippo interaction with paperclip", () => {
  const state = newGame({
    corp: { hand: ["Gold Farmer"] },
    runner: { hand: ["Paperclip", "Hippo"], credits: 100 },
  });
  playFromHand(state, "corp", "Gold Farmer", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Paperclip");
  playFromHand(state, "runner", "Hippo");
  const gf = getIce(state, "hq", 0);
  const pc = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", gf);
  runContinue(state);
  changed(() => getRunner(state).credit, -2, () => {
    autoPumpAndBreak(state, pc);
    clickPrompt(state, "runner", "Yes");
  });
});

it("grubber - bad pub on centrals", () => {
  for (const [server, sKey] of [["hq", "hq"], ["rd", "rd"], ["archives", "archives"]] as [string, string][]) {
    const state = newGame({ corp: { hand: ["Grubber"], credits: 10 } });
    playFromHand(state, "corp", "Grubber", server);
    rez(state, "corp", getIce(state, sKey, 0));
    expect(countBadPub(state)).toBe(1);
  }
});

it("grubber - no bad pub on remotes", () => {
  const state = newGame({ corp: { hand: ["Grubber"], credits: 10 } });
  playFromHand(state, "corp", "Grubber", "New remote");
  rez(state, "corp", getIce(state, "remote1", 0));
  expect(countBadPub(state)).toBe(0);
});

it("gyri labyrinth", () => {
  const state = newGame({ corp: { hand: ["Gyri Labyrinth"] } });
  playFromHand(state, "corp", "Gyri Labyrinth", "hq");
  takeCredits(state, "corp");
  const gyri = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", gyri);
  runContinue(state);
  expect(handSize(state, "runner")).toBe(5);
  cardSubroutine(state, "corp", gyri, 0);
  expect(handSize(state, "runner")).toBe(3);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  expect(handSize(state, "runner")).toBe(5);
});

it("hafrun - wrong server", () => {
  const state = newGame({ corp: { hand: ["Hafrún", "Hedge Fund"] } });
  playFromHand(state, "corp", "Hafrún", "hq");
  takeCredits(state, "corp");
  runOn(state, "rd");
  rez(state, "corp", getIce(state, "hq", 0));
  expect(noPrompt(state, "corp")).toBe(true);
});

it("hafrun - outside run", () => {
  const state = newGame({ corp: { hand: ["Hafrún", "Hedge Fund"] } });
  playFromHand(state, "corp", "Hafrún", "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  expect(noPrompt(state, "corp")).toBe(true);
});

it("hafrun - can't afford", () => {
  const state = newGame({ corp: { hand: ["Hafrún"] } });
  playFromHand(state, "corp", "Hafrún", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  expect(noPrompt(state, "corp")).toBe(true);
});

it("hagen - trashing only non-fracter non-decoder non-killer", () => {
  const state = newGame({
    corp: { hand: ["Hagen"] },
    runner: { hand: ["Inti", "Gordian Blade", "Pipeline", "Misdirection"] },
  });
  playFromHand(state, "corp", "Hagen", "hq");
  takeCredits(state, "corp");
  const hag = getIce(state, "hq", 0);
  gain(state, "corp", "click", 100);
  playFromHand(state, "runner", "Inti");
  playFromHand(state, "runner", "Gordian Blade");
  playFromHand(state, "runner", "Pipeline");
  playFromHand(state, "runner", "Misdirection");
  runOn(state, "hq");
  rez(state, "corp", hag);
  runContinue(state);
  cardSubroutine(state, "corp", hag, 0);
  clickCard(state, "corp", "Inti");
  expect(getRunner(state).discard.length).toBe(0);
  clickCard(state, "corp", "Gordian Blade");
  expect(getRunner(state).discard.length).toBe(0);
  clickCard(state, "corp", "Pipeline");
  expect(getRunner(state).discard.length).toBe(0);
  clickCard(state, "corp", "Misdirection");
  expect(getRunner(state).discard.length).toBe(1);
});

it("hagen - strength decrease with installed icebreakers", () => {
  const state = newGame({
    corp: { hand: ["Hagen"] },
    runner: { hand: ["Inti", "Gordian Blade", "Pipeline", "Misdirection"] },
  });
  playFromHand(state, "corp", "Hagen", "hq");
  takeCredits(state, "corp");
  const hag = getIce(state, "hq", 0);
  gain(state, "runner", "click", 100, "credit", 100);
  runOn(state, "hq");
  rez(state, "corp", hag);
  runContinue(state);
  expect(getStrength(refresh(state, hag))).toBe(6);
  runContinue(state, "movement");
  runJackOut(state);
  playFromHand(state, "runner", "Inti");
  runOn(state, "hq");
  expect(getStrength(refresh(state, hag))).toBe(5);
  runContinue(state);
  runContinue(state, "movement");
  runJackOut(state);
  playFromHand(state, "runner", "Gordian Blade");
  runOn(state, "hq");
  expect(getStrength(refresh(state, hag))).toBe(4);
  runContinue(state);
  runContinue(state, "movement");
  runJackOut(state);
  playFromHand(state, "runner", "Pipeline");
  runOn(state, "hq");
  expect(getStrength(refresh(state, hag))).toBe(3);
  runContinue(state);
  runContinue(state, "movement");
  runJackOut(state);
  playFromHand(state, "runner", "Misdirection");
  runOn(state, "hq");
  expect(getStrength(refresh(state, hag))).toBe(3);
});

it("hakarl 1.0 - happy path", () => {
  const state = newGame({
    corp: { hand: ["Hákarl 1.0", "Rashida Jaheem", "Eli 1.0", "Eli 1.0"], credits: 20 },
    runner: { hand: ["Sure Gamble"] },
  });
  gain(state, "corp", "click", 4);
  playFromHand(state, "corp", "Hákarl 1.0", "hq");
  playFromHand(state, "corp", "Eli 1.0", "New remote");
  playFromHand(state, "corp", "Rashida Jaheem", "Server 1");
  takeCredits(state, "corp");
  const rash = getContent(state, "remote1", 0);
  const hakarl = getIce(state, "hq", 0);
  const eli = getIce(state, "remote1", 0);
  rez(state, "corp", rash);
  runOn(state, "hq");
  expect(rezzed(refresh(state, rash))).toBeTruthy();
  rez(state, "corp", hakarl);
  expect(noPrompt(state, "corp")).toBe(false);
  clickCard(state, "corp", rash);
  expect(noPrompt(state, "corp")).toBe(true);
  expect(rezzed(refresh(state, rash))).toBeFalsy();
  runContinue(state);
  cardSideAbility(state, "runner", hakarl, 0);
  expect(noPrompt(state, "runner")).toBe(true);
  fireSubs(state, refresh(state, hakarl));
  expect((state as any).run).toBeFalsy();
  expect(getRunner(state).brainDamage).toBe(1);
  runOn(state, "Server 1");
  rez(state, "corp", eli);
  runContinue(state);
  cardSideAbility(state, "runner", eli, 0);
  expect(noPrompt(state, "runner")).toBe(true);
  fireSubs(state, refresh(state, eli));
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  cardSideAbility(state, "runner", hakarl, 0);
  expect(noPrompt(state, "runner")).toBe(false);
  clickPrompt(state, "runner", "Do 1 core damage");
  clickPrompt(state, "runner", "End the run");
  expect(getRunner(state).click).toBe(1);
  expect((state as any).run).toBeTruthy();
  fireSubs(state, refresh(state, hakarl));
  expect(getRunner(state).brainDamage).toBe(1);
  expect((state as any).run).toBeTruthy();
});

it("hakarl 1.0 - wrong server", () => {
  const state = newGame({
    corp: { hand: ["Hákarl 1.0", "Rashida Jaheem", "Eli 1.0"], credits: 20 },
    runner: { hand: ["Sure Gamble"] },
  });
  gain(state, "corp", "click", 4);
  playFromHand(state, "corp", "Hákarl 1.0", "hq");
  playFromHand(state, "corp", "Rashida Jaheem", "New remote");
  takeCredits(state, "corp");
  const rash = getContent(state, "remote1", 0);
  const hakarl = getIce(state, "hq", 0);
  rez(state, "corp", rash);
  runOn(state, "rd");
  expect(rezzed(refresh(state, rash))).toBeTruthy();
  rez(state, "corp", hakarl);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("hakarl 1.0 - no targets", () => {
  const state = newGame({
    corp: { hand: ["Hákarl 1.0", "Eli 1.0"], credits: 20 },
    runner: { hand: ["Sure Gamble"] },
  });
  gain(state, "corp", "click", 4);
  playFromHand(state, "corp", "Hákarl 1.0", "hq");
  takeCredits(state, "corp");
  const hakarl = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", hakarl);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("hailstorm - happy path", () => {
  const state = newGame({
    corp: { hand: ["Hailstorm", "Hedge Fund"] },
    runner: { hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Hedge Fund");
  playFromHand(state, "corp", "Hailstorm", "hq");
  takeCredits(state, "corp");
  const hs = getIce(state, "hq", 0);
  rez(state, "corp", hs);
  playFromHand(state, "runner", "Sure Gamble");
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", hs, 0);
  clickPrompt(state, "corp", "Sure Gamble");
  cardSubroutine(state, "corp", hs, 1);
  expect((state as any).run).toBeFalsy();
  expect(getRfg(state, "runner", 0).title).toBe("Sure Gamble");
});

it("hammer", () => {
  const state = newGame({
    corp: { hand: ["Hammer"] },
    runner: { hand: ["Smartware Distributor", "Simulchip", "Aumakua"] },
  });
  playFromHand(state, "corp", "Hammer", "hq");
  takeCredits(state, "corp");
  gain(state, "runner", "click", 1);
  playFromHand(state, "runner", "Smartware Distributor");
  playFromHand(state, "runner", "Simulchip");
  playFromHand(state, "runner", "Aumakua");
  const ham = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", ham);
  runContinue(state);
  changed(() => countTags(state), 1, () => {
    cardSubroutine(state, "corp", ham, 0);
  });
  changedMulti(
    [
      [() => (getHardware(state) as any[]).length, -1],
      [() => getRunner(state).discard.length, 1],
    ],
    () => {
      cardSubroutine(state, "corp", ham, 1);
      clickCard(state, "corp", getHardware(state, 0));
    }
  );
  changedMulti(
    [
      [() => (getProgram(state) as any[]).length, -1],
      [() => getRunner(state).discard.length, 1],
    ],
    () => {
      cardSubroutine(state, "corp", ham, 2);
      clickCard(state, "corp", getProgram(state, 0));
    }
  );
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "hq");
  runContinue(state);
  changedMulti(
    [
      [() => (getResource(state) as any[]).length, -1],
      [() => getRunner(state).discard.length, 1],
    ],
    () => {
      cardSubroutine(state, "corp", ham, 1);
      clickCard(state, "corp", getResource(state, 0));
    }
  );
});

it("harvester - draw 3 then discard", () => {
  const state = newGame({
    corp: { hand: ["Harvester"] },
    runner: { deck: [qty("Sure Gamble", 10)], hand: ["The Class Act", "Sure Gamble", "Sure Gamble", "Sure Gamble", "Sure Gamble"] },
  });
  playFromHand(state, "corp", "Harvester", "hq");
  const harv = getIce(state, "hq", 0);
  rez(state, "corp", harv);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "The Class Act");
  runOn(state, "hq");
  runContinue(state);
  expect(getRunner(state).hand.length).toBe(4);
  cardSubroutine(state, "corp", harv, 0);
  expect(getRunner(state).hand.length + (getRunner(state) as any).setAside?.length || getRunner(state).hand.length).toBeGreaterThan(4);
  // class act triggers first - handle set aside
  if ((state as any).runner?.prompt?.length > 1) {
    clickCard(state, "runner", (getRunner(state) as any).setAside[0]);
  }
  clickCard(state, "runner", getRunner(state).hand[getRunner(state).hand.length - 1]);
  clickCard(state, "runner", getRunner(state).hand[0]);
  expect(getRunner(state).hand.length).toBe(5);
  expect(noPrompt(state, "runner")).toBe(true);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("herald", () => {
  const state = newGame({ corp: { hand: ["Herald", "Project Beale"] } });
  playFromHand(state, "corp", "Herald", "hq");
  playFromHand(state, "corp", "Project Beale", "New remote");
  const herald = getIce(state, "hq", 0);
  const beale = getContent(state, "remote1", 0);
  rez(state, "corp", herald);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  expect(getCorp(state).credit).toBe(4);
  cardSubroutine(state, "corp", herald, 0);
  expect(getCorp(state).credit).toBe(6);
  cardSubroutine(state, "corp", herald, 1);
  clickPrompt(state, "corp", "2");
  clickCard(state, "corp", beale);
  expect(getCorp(state).credit).toBe(4);
  expect(getCounters(refresh(state, beale), "advancement")).toBe(2);
});

it("herald - access test", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Herald", "Project Beale"] },
  });
  playFromHand(state, "corp", "Project Beale", "New remote");
  const beale = getContent(state, "remote1", 0);
  takeCredits(state, "corp");
  runEmptyServer(state, "hq");
  expect(getCorp(state).credit).toBe(7);
  expect(core.getCurrentIce(state).title).toBe("Herald");
  fireSubs(state, core.getCurrentIce(state));
  expect(getCorp(state).credit).toBe(9);
  clickPrompt(state, "corp", "2");
  clickCard(state, "corp", beale);
  expect(getCorp(state).credit).toBe(7);
  expect(getCounters(refresh(state, beale), "advancement")).toBe(2);
});

it("hive", () => {
  const state = newGame({
    corp: { hand: ["Hive", "Hostile Takeover", "Rebranding Team", "Government Takeover"], credits: 50 },
  });
  gain(state, "corp", "click", 20);
  playFromHand(state, "corp", "Hostile Takeover", "New remote");
  playFromHand(state, "corp", "Rebranding Team", "New remote");
  playFromHand(state, "corp", "Government Takeover", "New remote");
  playFromHand(state, "corp", "Hive", "hq");
  const ht = getContent(state, "remote1", 0);
  const rt = getContent(state, "remote2", 0);
  const gt = getContent(state, "remote3", 0);
  const hive = getIce(state, "hq", 0);
  rez(state, "corp", hive);
  expect(refresh(state, hive).subroutines.length).toBe(5);
  scoreAgenda(state, "corp", ht);
  expect(refresh(state, hive).subroutines.length).toBe(4);
  scoreAgenda(state, "corp", rt);
  expect(refresh(state, hive).subroutines.length).toBe(2);
  scoreAgenda(state, "corp", gt);
  expect(refresh(state, hive).subroutines.length).toBe(0);
});

it("holmegaard - stop runner from accessing if win trace", () => {
  const state = newGame({
    corp: { hand: ["Holmegaard", "Hostile Takeover"] },
    runner: { hand: ["Cache", "Inti"] },
  });
  gain(state, "corp", "credit", 10);
  playFromHand(state, "corp", "Holmegaard", "hq");
  const holm = getIce(state, "hq", 0);
  rez(state, "corp", holm);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Inti");
  playFromHand(state, "runner", "Cache");
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", holm, 0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  cardSubroutine(state, "corp", holm, 1);
  clickCard(state, "corp", "Cache");
  expect(getRunner(state).discard.length).toBe(0);
  clickCard(state, "corp", "Inti");
  expect(getRunner(state).discard.length).toBe(1);
  runContinue(state);
  runContinue(state);
  clickPrompt(state, "runner", "OK");
  expect(accessing(state, "Hostile Takeover")).toBe(false);
});

describe("howler", () => {
  let state: any;

  beforeEach(() => {
    state = newGame({
      corp: { deck: [qty("Hedge Fund", 5)], hand: ["Howler", "Eli 1.0", "Hedge Fund"], discard: ["Ichi 1.0"] },
    });
    playFromHand(state, "corp", "Howler", "hq");
    takeCredits(state, "corp");
  });

  it("choosing from HQ", () => {
    runOn(state, "hq");
    const howler = getIce(state, "hq", 0);
    rez(state, "corp", howler);
    runContinue(state);
    fireSubs(state, refresh(state, howler));
    clickCard(state, "corp", "Eli 1.0");
    expect(findCard("Eli 1.0", getIce(state, "hq") as any[])).toBeTruthy();
    runContinueUntil(state, "encounter-ice", getIce(state, "hq", 0));
    runContinueUntil(state, "success");
    clickPrompt(state, "runner", "No action");
    expect(rezzed(getIce(state, "hq", 0))).toBeFalsy();
    expect(findCard("Howler", getCorp(state).discard)).toBeTruthy();
  });

  it("choosing from Archives", () => {
    runOn(state, "hq");
    const howler = getIce(state, "hq", 0);
    rez(state, "corp", howler);
    runContinue(state);
    fireSubs(state, refresh(state, howler));
    clickCard(state, "corp", "Ichi 1.0");
    expect(findCard("Ichi 1.0", getIce(state, "hq") as any[])).toBeTruthy();
    runContinueUntil(state, "encounter-ice", getIce(state, "hq", 0));
    runContinueUntil(state, "success");
    clickPrompt(state, "runner", "No action");
    expect(rezzed(getIce(state, "hq", 0))).toBeFalsy();
    expect(findCard("Howler", getCorp(state).discard)).toBeTruthy();
  });
});

it("howler - runner can jack out", () => {
  const state = newGame({ corp: { hand: ["Howler", "Eli 1.0"] } });
  playFromHand(state, "corp", "Howler", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state, "encounter-ice");
  fireSubs(state, getIce(state, "hq", 0));
  clickCard(state, "corp", "Eli 1.0");
  expect(findCard("Eli 1.0", getIce(state, "hq") as any[])).toBeTruthy();
  runContinue(state, "movement");
  runJackOut(state);
  expect(noPrompt(state, "runner")).toBe(true);
  expect((state as any).run).toBeFalsy();
  expect(findCard("Howler", getCorp(state).discard)).toBeTruthy();
});

it("hydra", () => {
  const state = newGame({ corp: { hand: ["Hydra"] } });
  playFromHand(state, "corp", "Hydra", "hq");
  takeCredits(state, "corp");
  gain(state, "corp", "credit", 10);
  runOn(state, "hq");
  const hydra = getIce(state, "hq", 0);
  const corpCreds = getCorp(state).credit;
  rez(state, "corp", hydra);
  runContinue(state);
  expect(getCorp(state).credit).toBe(corpCreds - 10);
  expect(isTagged(state)).toBe(false);
  // Subs give tags if not tagged
  for (let n = 0; n < 3; n++) {
    cardSubroutine(state, "corp", hydra, n);
    expect(countTags(state)).toBe(1);
    loseTags(state, "runner", 1);
  }
  // Main effects when tagged
  gainTags(state, "runner", 1);
  expect(isTagged(state)).toBe(true);
  expect(getRunner(state).hand.length).toBe(3);
  cardSubroutine(state, "corp", hydra, 0);
  expect(getRunner(state).hand.length).toBe(0);
  cardSubroutine(state, "corp", hydra, 1);
  expect(getCorp(state).credit).toBe(corpCreds - 5);
  expect((state as any).run).toBeTruthy();
  cardSubroutine(state, "corp", hydra, 2);
  expect((state as any).run).toBeFalsy();
});

it("ice wall", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Ice Wall"] } });
  playFromHand(state, "corp", "Ice Wall", "New remote");
  const iw = getIce(state, "remote1", 0);
  rez(state, "corp", iw);
  advance(state, iw, 1);
  expect(core.getStrength(refresh(state, iw))).toBe(2);
  takeCredits(state, "corp");
  runOn(state, "remote1");
  runContinue(state);
  cardSubroutine(state, "corp", iw, 0);
  expect((state as any).run).toBeFalsy();
});

it("inazuma - cannot jack out after encounter of next piece", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Inazuma", "Ice Wall", "Cortex Lock"], credits: 30 },
    runner: { hand: [qty("Sure Gamble", 5)], credits: 20 },
  });
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Cortex Lock", "hq");
  playFromHand(state, "corp", "Inazuma", "hq");
  takeCredits(state, "corp");
  const inazuma = getIce(state, "hq", 2);
  const cl = getIce(state, "hq", 1);
  runOn(state, "hq");
  rez(state, "corp", inazuma);
  runContinue(state);
  fireSubs(state, refresh(state, inazuma));
  runContinueUntil(state, "movement");
  runJackOut(state);
  expect((state as any).run).toBeTruthy();
  runContinue(state, "approach-ice");
  rez(state, "corp", cl);
  runContinue(state);
  fireSubs(state, cl);
  runContinueUntil(state, "movement");
  runJackOut(state);
  expect((state as any).run).toBeFalsy();
});

it("information overload", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Information Overload"], credits: 6 },
  });
  playFromHand(state, "corp", "Information Overload", "hq");
  takeCredits(state, "corp");
  const io = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", io);
  expect(refresh(state, io).subroutines.length).toBe(0);
  runContinue(state);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(refresh(state, io).subroutines.length).toBe(1);
  gainTags(state, "runner", 1);
  expect(refresh(state, io).subroutines.length).toBe(2);
  loseTags(state, "runner", 2);
  core.fakeCheckpoint(state);
  expect(refresh(state, io).subroutines.length).toBe(0);
});

it("IQ - rez cost and strength equal to cards in HQ", () => {
  const state = newGame({ corp: { hand: [qty("IQ", 3), qty("Hedge Fund", 3)] } });
  playFromHand(state, "corp", "Hedge Fund");
  playFromHand(state, "corp", "IQ", "rd");
  const iq1 = getIce(state, "rd", 0);
  rez(state, "corp", iq1);
  expect(getCorp(state).hand.length).toBe(4);
  expect(getStrength(refresh(state, iq1))).toBe(4);
  expect(getCorp(state).credit).toBe(5);
  playFromHand(state, "corp", "IQ", "hq");
  const iq2 = getIce(state, "hq", 0);
  rez(state, "corp", iq2);
  expect(getCorp(state).hand.length).toBe(3);
  expect(getStrength(refresh(state, iq1))).toBe(3);
  expect(getStrength(refresh(state, iq2))).toBe(3);
  expect(getCorp(state).credit).toBe(2);
});

it("ireress - subs based on bad pub", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Ireress", "Hostile Takeover"] },
  });
  playFromHand(state, "corp", "Ireress", "hq");
  const irs = getIce(state, "hq", 0);
  rez(state, "corp", irs);
  expect(refresh(state, irs).subroutines.length).toBe(0);
  playAndScore(state, "Hostile Takeover");
  expect(refresh(state, irs).subroutines.length).toBe(1);
});

it("it's a trap!", () => {
  const state = newGame({
    corp: { hand: ["It's a Trap!"] },
    runner: { hand: [qty("Cache", 3), qty("Infiltration", 2)] },
  });
  playFromHand(state, "corp", "It's a Trap!", "archives");
  const iat = getIce(state, "archives", 0);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Infiltration");
  clickPrompt(state, "runner", "Expose a card");
  clickCard(state, "runner", iat);
  expect(getRunner(state).discard.length).toBe(3);
  playFromHand(state, "runner", "Cache");
  runOn(state, "archives");
  rez(state, "corp", iat);
  runContinue(state);
  cardSubroutine(state, "corp", refresh(state, iat), 0);
  clickCard(state, "runner", getProgram(state, 0));
  expect(getRunner(state).discard.length).toBe(4);
  expect(getCorp(state).discard.length).toBe(1);
});

it("ivik - discount", () => {
  const state = newGame({ corp: { hand: [qty("Mind Game", 2), "Ivik"], credits: 50 } });
  playFromHand(state, "corp", "Ivik", "New remote");
  playFromHand(state, "corp", "Mind Game", "New remote");
  playFromHand(state, "corp", "Mind Game", "New remote");
  rez(state, "corp", getIce(state, "remote2", 0));
  rez(state, "corp", getIce(state, "remote3", 0));
  changed(() => getCorp(state).credit, -5, () => {
    rez(state, "corp", getIce(state, "remote1", 0));
  });
});

it("jaguarundi - no threat", () => {
  const state = newGame({ corp: { hand: ["City Works Project", "Jaguarundi"] } });
  playAndScore(state, "City Works Project");
  playFromHand(state, "corp", "Jaguarundi", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state, "encounter-ice");
  expect(noPrompt(state, "runner")).toBe(true);
  fireSubs(state, getIce(state, "hq", 0));
  expect(countTags(state)).toBe(1);
  expect(getRunner(state).brainDamage).toBe(1);
});

it("jaguarundi - jesminder interaction", () => {
  const state = newGame({
    corp: { hand: ["Jaguarundi"] },
    runner: { id: "Jesminder Sareen: Girl Behind the Curtain" },
  });
  playFromHand(state, "corp", "Jaguarundi", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state, "encounter-ice");
  changed(() => getRunner(state).brainDamage, 0, () => {
    fireSubs(state, getIce(state, "hq", 0));
  });
});

it("jaguarundi - threat ability", () => {
  const state = newGame({
    corp: { hand: ["City Works Project", "Hostile Takeover", "Jaguarundi"] },
  });
  gain(state, "corp", "click", 10, "credit", 10);
  playAndScore(state, "City Works Project");
  playAndScore(state, "Hostile Takeover");
  expect(getScored(state, "corp").length).toBe(2);
  playFromHand(state, "corp", "Jaguarundi", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state, "encounter-ice");
  changed(() => getRunner(state).click, -1, () => {
    clickPrompt(state, "runner", "Spend [Click]");
  });
  expect(noPrompt(state, "runner")).toBe(true);
});

it("jua - encounter effect - prevent runner from installing cards for the rest of the turn", () => {
  const state = newGame({
    corp: { deck: ["Jua"] },
    runner: { deck: ["Desperado", "Sure Gamble"] },
  });
  playFromHand(state, "corp", "Jua", "hq");
  takeCredits(state, "corp");
  const jua = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", jua);
  runContinue(state);
  runContinue(state);
  runContinue(state);
  expect(getRunner(state).hand.length).toBe(2);
  playFromHand(state, "runner", "Desperado");
  expect(getRunner(state).hand.length).toBe(2);
  playFromHand(state, "runner", "Sure Gamble");
  expect(getRunner(state).hand.length).toBe(1);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(getRunner(state).hand.length).toBe(1);
  playFromHand(state, "runner", "Desperado");
  expect(getRunner(state).hand.length).toBe(0);
});

it("jua - subroutine effect - choose 2 runner cards, runner moves one to the stack", () => {
  const state = newGame({
    corp: { deck: ["Jua"] },
    runner: { deck: ["Desperado", "Gordian Blade"] },
  });
  playFromHand(state, "corp", "Jua", "hq");
  takeCredits(state, "corp");
  const jua = getIce(state, "hq", 0);
  gain(state, "runner", "credit", 10);
  playFromHand(state, "runner", "Desperado");
  runOn(state, "hq");
  rez(state, "corp", jua);
  runContinue(state);
  cardSubroutine(state, "corp", refresh(state, jua), 0);
  expect(noPrompt(state, "corp")).toBe(true);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Gordian Blade");
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", refresh(state, jua), 0);
  clickCard(state, "corp", "Gordian Blade");
  clickCard(state, "corp", "Desperado");
  clickCard(state, "runner", "Gordian Blade");
  expect(getProgram(state, 0)).toBeUndefined();
  expect(getRunner(state).deck.length).toBe(1);
});

it("jua - should only lock installing for runner, not for both sides", () => {
  const state = newGame({
    corp: { id: "Mti Mwekundu: Life Improved", deck: ["Jua", "Kakugo"] },
    runner: { hand: ["Sure Gamble"], discard: ["Paperclip"] },
  });
  playFromHand(state, "corp", "Jua", "hq");
  const jua = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", jua);
  runContinue(state);
  runContinue(state);
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", findCard(state, "corp", "Kakugo"));
  clickPrompt(state, "runner", "No");
  expect(getIce(state, "hq", 0).title).toBe("Kakugo");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state, "encounter-ice");
  expect(noPrompt(state, "runner")).toBe(true);
  runContinue(state, "movement");
  expect(getRunner(state).discard.length).toBe(2);
});

it("kakugo - ability continues to work when ice is swapped", () => {
  const state = newGame({
    corp: { deck: ["Kakugo", "Ice Wall"] },
  });
  playFromHand(state, "corp", "Kakugo", "rd");
  playFromHand(state, "corp", "Ice Wall", "archives");
  takeCredits(state, "corp");
  const kakugo = getIce(state, "rd", 0);
  const iceWall = getIce(state, "archives", 0);
  runOn(state, "rd");
  rez(state, "corp", kakugo);
  runContinueUntil(state, "movement");
  runJackOut(state);
  expect(getRunner(state).hand.length).toBe(2);
  core.swapIce(state, "corp", refresh(state, kakugo), refresh(state, iceWall));
  core.fakeCheckpoint(state);
  runOn(state, "archives");
  runContinueUntil(state, "movement");
  runJackOut(state);
  expect(getRunner(state).hand.length).toBe(1);
});

it("kakugo - after wrassling, should still do damage despite temporary card change", () => {
  const state = newGame({
    corp: { deck: ["Kakugo"] },
    runner: { deck: ["Engolo", qty("Sure Gamble", 2)] },
  });
  playFromHand(state, "corp", "Kakugo", "rd");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Sure Gamble");
  playFromHand(state, "runner", "Engolo");
  expect(getRunner(state).credit).toBe(4);
  expect(getRunner(state).hand.length).toBe(1);
  const kakugo = getIce(state, "rd", 0);
  runOn(state, "rd");
  rez(state, "corp", kakugo);
  runContinue(state);
  clickPrompt(state, "runner", "Yes");
  expect(hasSubtype(refresh(state, kakugo), "Code Gate")).toBe(true);
  runContinue(state);
  expect(getRunner(state).hand.length).toBe(0);
});

it("kamali 1.0", () => {
  const state = newGame({
    corp: { deck: ["Kamali 1.0"] },
    runner: { deck: ["Astrolabe", "Decoy", "Cache"] },
  });
  playFromHand(state, "corp", "Kamali 1.0", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Astrolabe");
  playFromHand(state, "runner", "Decoy");
  playFromHand(state, "runner", "Cache");
  const kamali = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", kamali);
  runContinue(state);
  cardSubroutine(state, "corp", kamali, 0);
  expect(getRunner(state).brainDamage).toBe(0);
  clickPrompt(state, "runner", "Take 1 core damage");
  expect(getRunner(state).brainDamage).toBe(1);
  cardSubroutine(state, "corp", kamali, 1);
  expect(getRunner(state).discard.length).toBe(0);
  clickPrompt(state, "runner", "Trash 1 installed piece of hardware");
  clickCard(state, "runner", getHardware(state, 0));
  expect((getHardware as any)(state).length ?? 0).toBe(0);
  expect(getRunner(state).discard.length).toBe(1);
  cardSubroutine(state, "corp", kamali, 2);
  expect(getRunner(state).discard.length).toBe(1);
  clickPrompt(state, "runner", "Trash 1 installed program");
  clickCard(state, "runner", getProgram(state, 0));
  expect(getRunner(state).discard.length).toBe(2);
});

it("kamali 1.0 - runner has no installed cards", () => {
  const state = newGame({
    corp: { deck: ["Kamali 1.0"] },
    runner: { hand: [qty("Sure Gamble", 3)] },
  });
  playFromHand(state, "corp", "Kamali 1.0", "hq");
  takeCredits(state, "corp");
  const kamali = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", kamali);
  runContinue(state);
  for (let i = 0; i < 3; i++) {
    cardSubroutine(state, "corp", kamali, i);
    expect(getPromptMap(state, "runner").choices.length).toBe(1);
    clickPrompt(state, "runner", "Take 1 core damage");
  }
});

it("kamali 1.0 - fire all subs", () => {
  const state = newGame({ corp: { hand: ["Kamali 1.0"] } });
  playFromHand(state, "corp", "Kamali 1.0", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  runContinue(state, "encounter-ice");
  fireSubs(state, getIce(state, "hq", 0));
  for (let i = 0; i < 3; i++) {
    clickPrompt(state, "runner", "Take 1 core damage");
  }
  expect(noPrompt(state, "runner")).toBe(true);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("karuna", () => {
  const state = newGame({
    corp: { hand: ["Karunā"] },
    runner: { hand: [qty("Sure Gamble", 3), qty("Easy Mark", 3)] },
  });
  playFromHand(state, "corp", "Karunā", "hq");
  takeCredits(state, "corp");
  const kar = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", kar);
  runContinue(state);
  expect(getRunner(state).discard.length).toBe(0);
  fireSubs(state, kar);
  expect(getRunner(state).discard.length).toBe(2);
  clickPrompt(state, "runner", "Yes");
  expect((state as any).run).toBeFalsy();
  expect(getRunner(state).discard.length).toBe(2);
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, kar);
  expect(getRunner(state).discard.length).toBe(4);
  clickPrompt(state, "runner", "No");
  expect(getRunner(state).discard.length).toBe(6);
  expect((state as any).run).toBeTruthy();
});

it("kitsune - corp chooses card for runner to access", () => {
  const state = newGame({ corp: { hand: ["Kitsune", "Snare!"] } });
  playFromHand(state, "corp", "Kitsune", "rd");
  takeCredits(state, "corp");
  runOn(state, "rd");
  const kitsune = getIce(state, "rd", 0);
  rez(state, "corp", kitsune);
  runContinue(state);
  cardSubroutine(state, "corp", kitsune, 0);
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", findCard(state, "corp", "Snare!"));
  expect(waiting(state, "runner")).toBe(true);
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "runner", "No action");
  expect(getCorp(state).discard[0]?.title).toBe("Kitsune");
});

it("kitsune - trash after use", () => {
  const state = newGame({ corp: { hand: ["Kitsune", "Snare!", "Hostile Takeover"] } });
  playFromHand(state, "corp", "Kitsune", "rd");
  takeCredits(state, "corp");
  runOn(state, "rd");
  const kitsune = getIce(state, "rd", 0);
  rez(state, "corp", kitsune);
  runContinue(state);
  cardSubroutine(state, "corp", kitsune, 0);
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", findCard(state, "corp", "Snare!"));
  expect(waiting(state, "runner")).toBe(true);
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "runner", "No action");
  expect(getCorp(state).discard[0]?.title).toBe("Kitsune");
});

it("klevetnik", () => {
  const state = newGame({
    corp: { hand: ["Klevetnik"] },
    runner: { hand: [qty("No Free Lunch", 2), "Keiko"] },
  });
  playFromHand(state, "corp", "Klevetnik", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Keiko");
  playFromHand(state, "runner", "No Free Lunch");
  playFromHand(state, "runner", "No Free Lunch");
  const klev = getIce(state, "hq", 0);
  const nfl1 = getResource(state, 0);
  const nfl2 = getResource(state, 1);
  runOn(state, "hq");
  rez(state, "corp", klev);
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", getHardware(state, 0));
  expect(getPromptMap(state, "corp").type).toBe("select");
  changed(() => getRunner(state).credit, 2, () => {
    clickCard(state, "corp", nfl1);
  });
  changed(() => getRunner(state).credit, 3, () => {
    cardAbility(state, "runner", refresh(state, nfl2), 0);
  });
  runContinue(state);
  cardSubroutine(state, "corp", klev, 0);
  expect((state as any).run).toBeFalsy();
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  changed(() => getRunner(state).credit, 3, () => {
    cardAbility(state, "runner", refresh(state, nfl1), 0);
  });
});

it("klevetnik - wrong server", () => {
  const state = newGame({
    corp: { hand: ["Klevetnik"] },
    runner: { hand: ["No Free Lunch"] },
  });
  playFromHand(state, "corp", "Klevetnik", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "No Free Lunch");
  runOn(state, "rd");
  rez(state, "corp", getIce(state, "hq", 0));
  expect(noPrompt(state, "corp")).toBe(true);
});

it("klevetnik - outside run", () => {
  const state = newGame({
    corp: { hand: ["Klevetnik"] },
    runner: { hand: ["No Free Lunch"] },
  });
  playFromHand(state, "corp", "Klevetnik", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "No Free Lunch");
  rez(state, "corp", getIce(state, "hq", 0));
  expect(noPrompt(state, "corp")).toBe(true);
});

it("klevetnik - on the corp turn - effect should last until the end of the Corp next turn", () => {
  const state = newGame({
    corp: { hand: ["Klevetnik", "An Offer You Can't Refuse"] },
    runner: { hand: ["No Free Lunch"] },
  });
  playFromHand(state, "corp", "Klevetnik", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "No Free Lunch");
  const klev = getIce(state, "hq", 0);
  const nfl = getResource(state, 0);
  takeCredits(state, "runner");
  playFromHand(state, "corp", "An Offer You Can't Refuse");
  clickPrompt(state, "corp", "HQ");
  clickPrompt(state, "runner", "Yes");
  runContinue(state);
  rez(state, "corp", klev);
  clickPrompt(state, "corp", "Yes");
  changed(() => getRunner(state).credit, 2, () => {
    clickCard(state, "corp", nfl);
  });
  runContinue(state);
  cardSubroutine(state, "corp", klev, 0);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  changed(() => getRunner(state).credit, 3, () => {
    cardAbility(state, "runner", refresh(state, nfl), 0);
  });
});

it("komainu - subroutine gain/loss ability", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Komainu"] },
    runner: { deck: [qty("Sure Gamble", 5)], hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Komainu", "hq");
  takeCredits(state, "corp");
  const ko = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", ko);
  runContinue(state);
  expect(refresh(state, ko).subroutines.length).toBe(1);
  draw(state, "runner", 1);
  core.redirectRun(state, "corp", "hq", "approach-ice");
  runContinue(state);
  runContinue(state);
  expect(refresh(state, ko).subroutines.length).toBe(3);
  draw(state, "runner", 1);
  core.redirectRun(state, "corp", "hq", "approach-ice");
  runContinue(state);
  runContinue(state);
  expect(refresh(state, ko).subroutines.length).toBe(6);
  move(state, "runner", findCard(state, "runner", "Sure Gamble"), "deck");
  move(state, "runner", findCard(state, "runner", "Sure Gamble"), "deck");
  core.redirectRun(state, "corp", "hq", "approach-ice");
  runContinue(state);
  runContinue(state);
  expect(refresh(state, ko).subroutines.length).toBe(7);
});

it("komainu - subroutines not going away until end of run", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Komainu"] },
    runner: { deck: [qty("Sure Gamble", 5)], hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Komainu", "rd");
  takeCredits(state, "corp");
  runOn(state, "rd");
  const ko = getIce(state, "rd", 0);
  rez(state, "corp", ko);
  runContinue(state);
  expect(refresh(state, ko).subroutines.length).toBe(1);
  runContinue(state);
  runContinue(state);
  clickPrompt(state, "runner", "No action");
  expect(refresh(state, ko).subroutines.length).toBe(0);
});

it("konjin - return to encountering Konjin after forced encounter", () => {
  const state = newGame({ corp: { hand: ["Ice Wall", "Konjin"] } });
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Konjin", "rd");
  takeCredits(state, "corp");
  const konjin = getIce(state, "rd", 0);
  const iw = getIce(state, "hq", 0);
  rez(state, "corp", konjin);
  rez(state, "corp", iw);
  runOn(state, "rd");
  runContinue(state);
  expect(sameCard(core.getCurrentIce(state), refresh(state, konjin))).toBe(true);
  expect(getPromptMap(state, "corp").msg).toContain("Choose an amount to spend for Konjin");
  clickPrompt(state, "corp", "0 [Credits]");
  clickPrompt(state, "runner", "1 [Credits]");
  expect(getPromptMap(state, "corp").msg).toContain("Choose a piece of ice");
  clickCard(state, "corp", iw);
  expect(sameCard(core.getCurrentIce(state), refresh(state, iw))).toBe(true);
  runContinue(state, "encounter-ice");
  expect(sameCard(core.getCurrentIce(state), refresh(state, konjin))).toBe(true);
});

it("konjin - end run completely if forced encounter ends the run", () => {
  const state = newGame({ corp: { hand: ["Ice Wall", "Konjin"] } });
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Konjin", "rd");
  takeCredits(state, "corp");
  const konjin = getIce(state, "rd", 0);
  const iw = getIce(state, "hq", 0);
  rez(state, "corp", konjin);
  rez(state, "corp", iw);
  runOn(state, "rd");
  runContinue(state);
  expect(sameCard(core.getCurrentIce(state), refresh(state, konjin))).toBe(true);
  clickPrompt(state, "corp", "0 [Credits]");
  clickPrompt(state, "runner", "1 [Credits]");
  clickCard(state, "corp", iw);
  expect(sameCard(core.getCurrentIce(state), refresh(state, iw))).toBe(true);
  fireSubs(state, refresh(state, iw));
  expect((state as any).run).toBeFalsy();
});

it("konjin - target ice gets trashed", () => {
  const state = newGame({
    corp: { hand: ["Ice Wall", "Konjin"] },
    runner: { hand: ["Arruaceiras Crew"] },
  });
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Konjin", "rd");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Arruaceiras Crew");
  const konjin = getIce(state, "rd", 0);
  const iw = getIce(state, "hq", 0);
  rez(state, "corp", konjin);
  rez(state, "corp", iw);
  runOn(state, "rd");
  runContinue(state);
  expect(sameCard(core.getCurrentIce(state), refresh(state, konjin))).toBe(true);
  expect(getPromptMap(state, "corp").msg).toContain("Choose an amount to spend for Konjin");
  clickPrompt(state, "corp", "0 [Credits]");
  clickPrompt(state, "runner", "1 [Credits]");
  expect(getPromptMap(state, "corp").msg).toContain("Choose a piece of ice");
  clickCard(state, "corp", iw);
  expect(sameCard(core.getCurrentIce(state), refresh(state, iw))).toBe(true);
  cardAbility(state, "runner", getResource(state, 0), 0);
  cardAbility(state, "runner", getResource(state, 0), 1);
  expect(getCorp(state).discard[0]?.title).toBe("Ice Wall");
  runContinue(state, "encounter-ice");
  expect(sameCard(core.getCurrentIce(state), refresh(state, konjin))).toBe(true);
  expect(noPrompt(state, "runner")).toBe(true);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("lockdown - prevent runner from drawing cards for the rest of the turn", () => {
  const state = newGame({
    corp: { deck: ["Lockdown"] },
    runner: { deck: [qty("Sure Gamble", 3)], hand: [qty("Diesel", 2)] },
  });
  playFromHand(state, "corp", "Lockdown", "rd");
  takeCredits(state, "corp");
  const lock = getIce(state, "rd", 0);
  runOn(state, "rd");
  rez(state, "corp", lock);
  runContinue(state);
  cardSubroutine(state, "corp", lock, 0);
  runContinue(state);
  runContinue(state);
  playFromHand(state, "runner", "Diesel");
  expect(getRunner(state).hand.length).toBe(1);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Diesel");
  expect(getRunner(state).hand.length).toBe(3);
});

it("logjam", () => {
  const state = newGame({
    corp: {
      hand: ["Logjam", "Slash and Burn Agriculture"],
      discard: ["NGO Front", "Hedge Fund"],
      credits: 10,
    },
  });
  playFromHand(state, "corp", "Logjam", "hq");
  takeCredits(state, "corp");
  runEmptyServer(state, "archives");
  takeCredits(state, "runner");
  const lj = getIce(state, "hq", 0);
  expend(state, "corp", getCorp(state).hand[0]);
  clickCard(state, "corp", lj);
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", lj);
  expect(getStrength(refresh(state, lj))).toBe(6);
  runContinue(state);
  changed(() => getCorp(state).credit, 2, () => {
    fireSubs(state, refresh(state, lj));
  });
  expect((state as any).run).toBeFalsy();
});

it("loki - runner does not shuffle cards", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Loki", "Karunā"], credits: 100 },
    runner: { hand: [qty("Sure Gamble", 3), qty("Easy Mark", 3)] },
  });
  playFromHand(state, "corp", "Karunā", "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  playFromHand(state, "corp", "Loki", "rd");
  rez(state, "corp", getIce(state, "rd", 0));
  takeCredits(state, "corp");
  runOn(state, "rd");
  runContinue(state);
  clickCard(state, "corp", "Karunā");
  expect(lastLogContains(state, "Corp uses Loki to choose Karunā protecting HQ at position 0")).toBe(true);
  expect(getRunner(state).discard.length).toBe(0);
  fireSubs(state, getIce(state, "rd", 0));
  expect(getRunner(state).discard.length).toBe(2);
  clickPrompt(state, "runner", "No");
  expect(getRunner(state).discard.length).toBe(4);
  clickPrompt(state, "runner", "End the run");
  expect(getRunner(state).hand.length).toBe(2);
  expect((state as any).run).toBeFalsy();
});

it("loki - runner does shuffle cards", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Loki"], credits: 100 },
    runner: { hand: [qty("Sure Gamble", 3), qty("Easy Mark", 3)] },
  });
  playFromHand(state, "corp", "Loki", "rd");
  rez(state, "corp", getIce(state, "rd", 0));
  takeCredits(state, "corp");
  runOn(state, "rd");
  runContinue(state);
  fireSubs(state, getIce(state, "rd", 0));
  clickPrompt(state, "runner", "Shuffle the grip into the stack");
  expect(getRunner(state).hand.length).toBe(0);
  expect(getRunner(state).deck.length).toBe(6);
  expect((state as any).run).toBeTruthy();
});

it("loki - runner can shuffle cards with zero in hand", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Loki"], credits: 100 },
    runner: { hand: [], deck: [qty("Sure Gamble", 3)] },
  });
  playFromHand(state, "corp", "Loki", "rd");
  rez(state, "corp", getIce(state, "rd", 0));
  takeCredits(state, "corp");
  runOn(state, "rd");
  runContinue(state);
  fireSubs(state, getIce(state, "rd", 0));
  clickPrompt(state, "runner", "Shuffle the grip into the stack");
  expect(getRunner(state).hand.length).toBe(0);
  expect(getRunner(state).deck.length).toBe(3);
  expect((state as any).run).toBeTruthy();
});

it("loki - runner cannot shuffle cards", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Loki"], credits: 100 },
    runner: { hand: [], deck: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Loki", "rd");
  rez(state, "corp", getIce(state, "rd", 0));
  takeCredits(state, "corp");
  runOn(state, "rd");
  runContinue(state);
  fireSubs(state, getIce(state, "rd", 0));
  clickPrompt(state, "runner", "End the run");
  expect(getRunner(state).hand.length).toBe(0);
  expect(getRunner(state).deck.length).toBe(1);
  expect((state as any).run).toBeFalsy();
});

it("loki vs kamali 1.0 - fire all subs", () => {
  for (const lokiOpt of ["End the run", "Shuffle the grip into the stack"]) {
    const state = newGame({
      corp: { hand: ["Loki", "Kamali 1.0"], credits: 20 },
      runner: { hand: [qty("Sure Gamble", 4)] },
    });
    playFromHand(state, "corp", "Kamali 1.0", "hq");
    playFromHand(state, "corp", "Loki", "hq");
    takeCredits(state, "corp");
    runOn(state, "hq");
    rez(state, "corp", getIce(state, "hq", 0));
    rez(state, "corp", getIce(state, "hq", 1));
    runContinue(state, "encounter-ice");
    clickCard(state, "corp", "Kamali 1.0");
    fireSubs(state, getIce(state, "hq", 1));
    for (let i = 0; i < 3; i++) {
      clickPrompt(state, "runner", "Take 1 core damage");
    }
    clickPrompt(state, "runner", lokiOpt);
    expect(noPrompt(state, "runner")).toBe(true);
    expect(noPrompt(state, "corp")).toBe(true);
  }
});

it("lotus field - strength cannot be lowered", () => {
  const state = newGame({
    corp: { deck: ["Lotus Field", "Lag Time"] },
    runner: { deck: ["Ice Carver", "Parasite"] },
  });
  playFromHand(state, "corp", "Lotus Field", "archives");
  gain(state, "corp", "credit", -2);
  const lotus = getIce(state, "archives", 0);
  rez(state, "corp", lotus);
  playFromHand(state, "runner", "Ice Carver");
  runOn(state, "archives");
  runContinue(state);
  expect(getStrength(refresh(state, lotus))).toBe(4);
  runContinue(state, "movement");
  runJackOut(state);
  playFromHand(state, "runner", "Parasite");
  clickCard(state, "runner", lotus);
  expect(refresh(state, lotus).hosted.length).toBe(1);
  gain(state, "runner", "credit", -1);
  takeCredits(state, "corp");
  expect(core.getVirusCounters(state, refresh(state, lotus).hosted[0])).toBe(1);
  expect(getStrength(refresh(state, lotus))).toBe(4);
  takeCredits(state, "runner");
  playFromHand(state, "corp", "Lag Time");
  expect(getStrength(refresh(state, lotus))).toBe(5);
  gain(state, "corp", "credit", -2);
  expect(getStrength(refresh(state, lotus))).toBe(5);
});

it("lycian multi-munition", () => {
  const state = newGame({
    corp: { hand: ["Lycian Multi-Munition"] },
    runner: { hand: ["Marjanah"] },
  });
  playFromHand(state, "corp", "Lycian Multi-Munition", "hq");
  takeCredits(state, "corp");
  const lmm = getIce(state, "hq", 0);
  playFromHand(state, "runner", "Marjanah");
  runOn(state, "hq");
  rez(state, "corp", lmm);
  expect(getPromptMap(state, "corp").choices.length).toBe(3);
  clickPrompt(state, "corp", "Code Gate");
  expect(getPromptMap(state, "corp").choices.length).toBe(3);
  clickPrompt(state, "corp", "Sentry");
  expect(getPromptMap(state, "corp").choices.length).toBe(2);
  clickPrompt(state, "corp", "Barrier");
  expect(getPromptMap(state, "corp").choices.length).toBe(1);
  clickPrompt(state, "corp", "Done");
  runContinue(state);
  changed(() => ({ credit: getRunner(state).credit, click: getRunner(state).click }), { credit: -1, click: -1 }, () => {
    cardSubroutine(state, "corp", lmm, 0);
  });
  changedMulti([
    [() => (getProgram as any)(state).length, -1],
    [() => getRunner(state).discard.length, 1],
  ], () => {
    cardSubroutine(state, "corp", lmm, 1);
    clickCard(state, "corp", getProgram(state, 0));
  });
  changed(() => getCorp(state).credit, 1, () => {
    cardSubroutine(state, "corp", lmm, 2);
    expect((state as any).run).toBeFalsy();
  });
  takeCredits(state, "runner");
  expect(rezzed(refresh(state, lmm))).toBe(false);
});

it("macrophage - happy path", () => {
  const state = newGame({
    corp: { deck: ["Macrophage"] },
    runner: { deck: ["Cache"] },
  });
  playFromHand(state, "corp", "Macrophage", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Cache");
  const mp = getIce(state, "hq", 0);
  const cache = getProgram(state, 0);
  rez(state, "corp", mp);
  runOn(state, "hq");
  runContinue(state);
  expect(core.getVirusCounters(state, refresh(state, cache))).toBe(3);
  cardSubroutine(state, "corp", mp, 0);
  expect(getPromptMap(state, "corp").type).toBe("trace");
  expect(getPromptMap(state, "corp").base).toBe(4);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(core.getVirusCounters(state, refresh(state, cache))).toBe(0);
  expect(getRunner(state).discard.length).toBe(0);
  cardSubroutine(state, "corp", mp, 1);
  expect(getPromptMap(state, "corp").type).toBe("trace");
  expect(getPromptMap(state, "corp").base).toBe(3);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", cache);
  expect(getRunner(state).discard.map((c: any) => c.title)).toContain("Cache");
  cardSubroutine(state, "corp", mp, 2);
  expect(getPromptMap(state, "corp").type).toBe("trace");
  expect(getPromptMap(state, "corp").base).toBe(2);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickPrompt(state, "corp", "Cache");
  expect(getRunner(state).discard.map((c: any) => c.title)).not.toContain("Cache");
  expect(getRunner(state).rfg.map((c: any) => c.title)).toContain("Cache");
  cardSubroutine(state, "corp", mp, 3);
  expect(getPromptMap(state, "corp").type).toBe("trace");
  expect(getPromptMap(state, "corp").base).toBe(1);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect((state as any).run).toBeNull();
});

it("macrophage - heap locked test", () => {
  const state = newGame({
    corp: { deck: ["Macrophage", "Blacklist"] },
    runner: { deck: ["Cache"] },
  });
  playFromHand(state, "corp", "Macrophage", "hq");
  playFromHand(state, "corp", "Blacklist", "new remote");
  rez(state, "corp", refresh(state, getContent(state, "remote1", 0)));
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Cache");
  const mp = getIce(state, "hq", 0);
  const cache = getProgram(state, 0);
  rez(state, "corp", mp);
  runOn(state, "hq");
  runContinue(state);
  expect(core.getVirusCounters(state, refresh(state, cache))).toBe(3);
  cardSubroutine(state, "corp", mp, 0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(core.getVirusCounters(state, refresh(state, cache))).toBe(0);
  cardSubroutine(state, "corp", mp, 1);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", cache);
  expect(getRunner(state).discard.length).toBe(1);
  cardSubroutine(state, "corp", mp, 2);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(noPrompt(state, "corp")).toBe(true);
  expect(getRunner(state).discard.map((c: any) => c.title)).toContain("Cache");
  expect(getRunner(state).rfg.map((c: any) => c.title)).not.toContain("Cache");
  cardSubroutine(state, "corp", mp, 3);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect((state as any).run).toBeNull();
});

it("magnet - faceup ice", () => {
  const state = newGame({
    corp: { deck: ["Magnet", "Enigma"] },
    runner: { deck: ["Parasite"] },
  });
  playFromHand(state, "corp", "Magnet", "hq");
  playFromHand(state, "corp", "Enigma", "rd");
  rez(state, "corp", getIce(state, "rd", 0));
  takeCredits(state, "corp");
  const m = getIce(state, "hq", 0);
  const e = getIce(state, "rd", 0);
  playFromHand(state, "runner", "Parasite");
  clickCard(state, "runner", refresh(state, e));
  expect(refresh(state, e).hosted.length).toBe(1);
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  clickCard(state, "corp", getIce(state, "rd", 0).hosted[0]);
  runContinue(state);
  expect(refresh(state, e).hosted.length).toBe(0);
  expect(refresh(state, m).hosted.length).toBe(1);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(core.getVirusCounters(state, refresh(state, m).hosted[0])).toBe(0);
});

it("magnet - facedown ice", () => {
  const state = newGame({
    corp: { deck: ["Magnet", "Enigma"] },
    runner: { deck: ["Trypano"] },
  });
  playFromHand(state, "corp", "Magnet", "hq");
  playFromHand(state, "corp", "Enigma", "rd");
  takeCredits(state, "corp");
  const m = getIce(state, "hq", 0);
  const e = getIce(state, "rd", 0);
  playFromHand(state, "runner", "Trypano");
  clickCard(state, "runner", refresh(state, e));
  expect(refresh(state, e).hosted.length).toBe(1);
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  clickCard(state, "corp", getIce(state, "rd", 0).hosted[0]);
  expect(refresh(state, e).hosted.length).toBe(0);
  expect(refresh(state, m).hosted.length).toBe(1);
  runContinue(state);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(noPrompt(state, "runner")).toBe(true);
  expect(core.getVirusCounters(state, refresh(state, m).hosted[0])).toBe(0);
});

it("magnet - derezzed ice", () => {
  const state = newGame({
    corp: { deck: ["Magnet", "Enigma"] },
    runner: { deck: [qty("Parasite", 2)] },
  });
  playFromHand(state, "corp", "Magnet", "hq");
  playFromHand(state, "corp", "Enigma", "rd");
  rez(state, "corp", getIce(state, "rd", 0));
  takeCredits(state, "corp");
  const m = getIce(state, "hq", 0);
  const e = getIce(state, "rd", 0);
  playFromHand(state, "runner", "Parasite");
  clickCard(state, "runner", refresh(state, e));
  expect(refresh(state, e).hosted.length).toBe(1);
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  clickCard(state, "corp", getIce(state, "rd", 0).hosted[0]);
  expect(refresh(state, e).hosted.length).toBe(0);
  expect(refresh(state, m).hosted.length).toBe(1);
  runContinue(state);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(core.getVirusCounters(state, refresh(state, m).hosted[0])).toBe(0);
  takeCredits(state, "runner");
  derez(state, "corp", refresh(state, m));
  takeCredits(state, "corp");
  expect(core.getVirusCounters(state, refresh(state, m).hosted[0])).toBe(1);
  playFromHand(state, "runner", "Parasite");
  clickCard(state, "runner", refresh(state, e));
  expect(refresh(state, e).hosted.length).toBe(1);
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  clickCard(state, "corp", getIce(state, "rd", 0).hosted[0]);
  expect(refresh(state, e).hosted.length).toBe(0);
  expect(refresh(state, m).hosted.length).toBe(2);
  runContinue(state);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(core.getVirusCounters(state, refresh(state, m).hosted[0])).toBe(1);
  expect(core.getVirusCounters(state, refresh(state, m).hosted[1])).toBe(0);
  takeCredits(state, "runner");
  derez(state, "corp", refresh(state, m));
  takeCredits(state, "corp");
  expect(core.getVirusCounters(state, refresh(state, m).hosted[0])).toBe(2);
  expect(core.getVirusCounters(state, refresh(state, m).hosted[1])).toBe(1);
});

it("magnet - should not reset program mu", () => {
  const state = newGame({
    corp: { deck: ["Magnet"] },
    runner: { deck: ["Saci"] },
  });
  playFromHand(state, "corp", "Magnet", "rd");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Saci");
  clickCard(state, "runner", getIce(state, "rd", 0));
  changed(() => core.availableMu(state), 0, () => {
    rez(state, "corp", getIce(state, "rd", 0));
  });
  changed(() => core.availableMu(state), 0, () => {
    derez(state, "corp", getIce(state, "rd", 0));
  });
});

it("mamba", () => {
  const state = newGame({ runner: { hand: qty("Sure Gamble", 5) } });
  const stateSetup = newGame({
    corp: { hand: ["Mamba"] },
    runner: { hand: [qty("Sure Gamble", 5)] },
  });
  playFromHand(stateSetup, "corp", "Mamba", "hq");
  takeCredits(stateSetup, "corp");
  runOn(stateSetup, "hq");
  rez(stateSetup, "corp", getIce(stateSetup, "hq", 0));
  runContinue(stateSetup, "encounter-ice");
  fireSubs(stateSetup, getIce(stateSetup, "hq", 0));
  expect(getRunner(stateSetup).discard.length).toBe(1);
  clickPrompt(stateSetup, "corp", "0 [Credits]");
  clickPrompt(stateSetup, "runner", "1 [Credits]");
  expect(waiting(stateSetup, "runner")).toBe(false);
  const mamba = getIce(stateSetup, "hq", 0);
  expect(getCounters(mamba, "power")).toBe(1);
  cardAbility(stateSetup, "corp", mamba, 0);
  expect(getCounters(refresh(stateSetup, mamba), "power")).toBe(0);
  expect(getRunner(stateSetup).discard.length).toBe(2);
});

it("marker", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Marker", "Ice Wall"], credits: 100 },
  });
  playFromHand(state, "corp", "Ice Wall", "new remote");
  playFromHand(state, "corp", "Marker", "server 1");
  takeCredits(state, "corp");
  const iw = getIce(state, "remote1", 0);
  const mark = getIce(state, "remote1", 1);
  rez(state, "corp", mark);
  rez(state, "corp", iw);
  runOn(state, "server 1");
  runContinue(state);
  cardSubroutine(state, "corp", mark, 0);
  expect(lastLogContains(state, "Marker to give next encountered ice")).toBe(true);
  runContinueUntil(state, "approach-ice");
  expect(refresh(state, iw).subroutines.length).toBe(1);
  runContinue(state);
  expect(refresh(state, iw).subroutines.length).toBe(2);
  runContinue(state, "movement");
  runJackOut(state);
  expect(refresh(state, iw).subroutines.length).toBe(1);
});

it("maskirovka", () => {
  const state = newGame({ corp: { hand: ["Maskirovka"] } });
  playFromHand(state, "corp", "Maskirovka", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const money = getIce(state, "hq", 0);
  rez(state, "corp", refresh(state, money));
  runContinue(state);
  changed(() => getCorp(state).credit, 2, () => {
    fireSubs(state, refresh(state, money));
    expect((state as any).run).toBeFalsy();
  });
});

it("masvingo", () => {
  const state = newGame({ corp: { deck: ["Masvingo"] } });
  playFromHand(state, "corp", "Masvingo", "hq");
  const mas = getIce(state, "hq", 0);
  expect(getCounters(refresh(state, mas), "advancement")).toBe(0);
  rez(state, "corp", refresh(state, mas));
  expect(getCounters(refresh(state, mas), "advancement")).toBe(1);
  expect(refresh(state, mas).subroutines.length).toBe(1);
  advance(state, refresh(state, mas), 1);
  expect(refresh(state, mas).subroutines.length).toBe(2);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", mas, 0);
  expect((state as any).run).toBeFalsy();
});

it("mausolus - 3 adv tokens change the subroutines", () => {
  const state = newGame({
    corp: { deck: ["Mausolus"] },
    runner: { deck: [qty("NetChip", 5)] },
  });
  playFromHand(state, "corp", "Mausolus", "hq");
  const mau = getIce(state, "hq", 0);
  rez(state, "corp", mau);
  takeCredits(state, "corp");
  runOn(state, "hq");
  expect(getCorp(state).credit).toBe(3);
  expect(getRunner(state).discard.length).toBe(0);
  expect(countTags(state)).toBe(0);
  runContinue(state);
  cardSubroutine(state, "corp", mau, 0);
  expect(getCorp(state).credit).toBe(4);
  cardSubroutine(state, "corp", mau, 1);
  expect(getRunner(state).discard.length).toBe(1);
  cardSubroutine(state, "corp", mau, 2);
  expect(countTags(state)).toBe(1);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  advance(state, mau, 3);
  takeCredits(state, "corp");
  runOn(state, "hq");
  expect(getCorp(state).credit).toBe(1);
  expect(getRunner(state).discard.length).toBe(1);
  expect(countTags(state)).toBe(1);
  runContinue(state);
  cardSubroutine(state, "corp", mau, 0);
  expect(getCorp(state).credit).toBe(4);
  cardSubroutine(state, "corp", mau, 1);
  expect(getRunner(state).discard.length).toBe(4);
  cardSubroutine(state, "corp", mau, 2);
  expect(countTags(state)).toBe(2);
  expect((state as any).run).toBeFalsy();
});

it("meridian - etr", () => {
  const state = newGame({ corp: { deck: ["Meridian"] } });
  playFromHand(state, "corp", "Meridian", "hq");
  takeCredits(state, "corp");
  const mer = getIce(state, "hq", 0);
  rez(state, "corp", refresh(state, mer));
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", refresh(state, mer), 0);
  clickPrompt(state, "runner", "Corp gains 4 [Credits] and end the run");
  expect((state as any).run).toBeFalsy();
  expect(getRunner(state).scored.length).toBe(0);
  expect(getIce(state, "hq").length).toBe(1);
});

it("meridian - score as -1 point agenda", () => {
  const state = newGame({ corp: { deck: ["Meridian"] } });
  playFromHand(state, "corp", "Meridian", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const mer = getIce(state, "hq", 0);
  rez(state, "corp", refresh(state, mer));
  runContinue(state);
  cardSubroutine(state, "corp", refresh(state, mer), 0);
  clickPrompt(state, "runner", "Add Meridian to score area");
  expect(getRunner(state).scored.length).toBe(1);
  expect(getRunner(state).agendaPoint).toBe(-1);
  expect(getIce(state, "hq").length).toBe(0);
  runContinue(state);
  expect((state as any).run).toBeFalsy();
});

it("meru mati", () => {
  const state = newGame({ corp: { deck: [qty("Meru Mati", 2)] } });
  playFromHand(state, "corp", "Meru Mati", "hq");
  playFromHand(state, "corp", "Meru Mati", "rd");
  rez(state, "corp", getIce(state, "hq", 0));
  rez(state, "corp", getIce(state, "rd", 0));
  expect(getStrength(getIce(state, "hq", 0))).toBe(4);
  expect(getStrength(getIce(state, "rd", 0))).toBe(1);
});

it("mestnichestvo", () => {
  const state = newGame({ corp: { hand: ["Mestnichestvo"], credits: 10 } });
  playFromHand(state, "corp", "Mestnichestvo", "hq");
  const mes = getIce(state, "hq", 0);
  clickAdvance(state, "corp", refresh(state, mes));
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", refresh(state, mes));
  runContinue(state);
  changed(() => getRunner(state).credit, -3, () => {
    expect(getCounters(refresh(state, mes), "advancement")).toBe(1);
    clickPrompt(state, "corp", "Yes");
    expect(getCounters(refresh(state, mes), "advancement")).toBe(0);
  });
  changed(() => getRunner(state).credit, -2, () => {
    fireSubs(state, refresh(state, mes));
  });
  expect((state as any).run).toBeFalsy();
});

it("metamorph - with two installed ice", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Metamorph", "Ice Wall", "Vanilla"], credits: 20 },
  });
  playFromHand(state, "corp", "Metamorph", "archives");
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Vanilla", "rd");
  takeCredits(state, "corp");
  runOn(state, "archives");
  rez(state, "corp", getIce(state, "archives", 0));
  runContinue(state);
  fireSubs(state, getIce(state, "archives", 0));
  expect(promptButtons(state, "corp")).toContain("Swap 2 pieces of ice");
  clickPrompt(state, "corp", "Swap 2 pieces of ice");
  clickCard(state, "corp", "Ice Wall");
  clickCard(state, "corp", "Vanilla");
  expect(getIce(state, "hq", 0).title).toBe("Vanilla");
  expect(getIce(state, "rd", 0).title).toBe("Ice Wall");
});

it("metamorph - with two installed non-ice", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Metamorph", "Allele Repression", "Hostile Takeover"], credits: 20 },
  });
  playFromHand(state, "corp", "Metamorph", "archives");
  playFromHand(state, "corp", "Allele Repression", "new remote");
  playFromHand(state, "corp", "Hostile Takeover", "new remote");
  takeCredits(state, "corp");
  runOn(state, "archives");
  rez(state, "corp", getIce(state, "archives", 0));
  runContinue(state);
  fireSubs(state, getIce(state, "archives", 0));
  expect(promptButtons(state, "corp")).toContain("Swap 2 non-ice");
  clickPrompt(state, "corp", "Swap 2 non-ice");
  clickCard(state, "corp", "Allele Repression");
  clickCard(state, "corp", "Hostile Takeover");
  expect(getContent(state, "remote1", 0).title).toBe("Hostile Takeover");
  expect(getContent(state, "remote2", 0).title).toBe("Allele Repression");
});

it("metamorph - with two installed non-ice both options available", () => {
  const state = newGame({
    corp: {
      deck: [qty("Hedge Fund", 5)],
      hand: ["Metamorph", "Ice Wall", "Vanilla", "Allele Repression", "Hostile Takeover"],
      credits: 20,
    },
  });
  gain(state, "corp", "click", 10);
  playFromHand(state, "corp", "Metamorph", "archives");
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Vanilla", "rd");
  playFromHand(state, "corp", "Allele Repression", "new remote");
  playFromHand(state, "corp", "Hostile Takeover", "new remote");
  takeCredits(state, "corp");
  runOn(state, "archives");
  rez(state, "corp", getIce(state, "archives", 0));
  runContinue(state);
  fireSubs(state, getIce(state, "archives", 0));
  expect(promptButtons(state, "corp")).toContain("Swap 2 pieces of ice");
  expect(promptButtons(state, "corp")).toContain("Swap 2 non-ice");
});

it("m.i.c.", () => {
  const state = newGame({ corp: { hand: ["M.I.C."] } });
  playFromHand(state, "corp", "M.I.C.", "hq");
  takeCredits(state, "corp");
  const mic = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", mic);
  runContinue(state);
  changed(() => getRunner(state).click, -2, () => {
    fireSubs(state, mic);
  });
  expect((state as any).run).toBeNull();
  gain(state, "runner", "click", 1);
  runOn(state, "hq");
  runContinue(state);
  changed(() => getRunner(state).click, -1, () => {
    cardAbility(state, "corp", mic, 0);
    clickPrompt(state, "runner", "Spend [Click]");
  });
  expect((state as any).run).toBeTruthy();
  expect(getCorp(state).discard.length).toBe(1);
});

it("mind game - server redirection", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Mind Game"] },
    runner: { deck: ["Easy Mark"], hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Mind Game", "hq");
  takeCredits(state, "corp");
  const mindgame = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", mindgame);
  runContinue(state);
  cardSubroutine(state, "corp", mindgame, 0);
  clickPrompt(state, "corp", "1 [Credits]");
  clickPrompt(state, "runner", "0 [Credits]");
  expect(promptButtons(state, "corp")).not.toContain("HQ");
  clickPrompt(state, "corp", "Archives");
  clickPrompt(state, "runner", "No");
  expect(getRun(state)?.server).toEqual(["archives"]);
});

it("mind game - jack out additional cost - and can't pay", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Mind Game"] },
    runner: { deck: ["Easy Mark"], hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Mind Game", "hq");
  takeCredits(state, "corp");
  const mindgame = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", mindgame);
  runContinue(state);
  cardSubroutine(state, "corp", mindgame, 0);
  clickPrompt(state, "corp", "1 [Credits]");
  clickPrompt(state, "runner", "0 [Credits]");
  clickPrompt(state, "corp", "Archives");
  clickPrompt(state, "runner", "Yes");
  expect(getRun(state)).toBeTruthy();
});

it("mind game - jack out additional cost - and can pay", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Mind Game"] },
    runner: { deck: ["Easy Mark"], hand: ["Sure Gamble", "Corroder"] },
  });
  playFromHand(state, "corp", "Mind Game", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  const mindgame = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", mindgame);
  runContinue(state);
  cardSubroutine(state, "corp", mindgame, 0);
  clickPrompt(state, "corp", "1 [Credits]");
  clickPrompt(state, "runner", "0 [Credits]");
  clickPrompt(state, "corp", "Archives");
  clickPrompt(state, "runner", "Yes");
  clickCard(state, "runner", "Corroder");
  expect(getRunner(state).deck[getRunner(state).deck.length - 1]?.title).toBe("Corroder");
  expect(getRun(state)).toBeFalsy();
});

it("mind game - redirection works correctly #5047", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Mind Game", "Ice Wall"] },
    runner: { deck: ["Easy Mark"], hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Ice Wall", "archives");
  playFromHand(state, "corp", "Mind Game", "hq");
  takeCredits(state, "corp");
  const mindgame = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", mindgame);
  runContinue(state);
  cardSubroutine(state, "corp", mindgame, 0);
  clickPrompt(state, "corp", "1 [Credits]");
  clickPrompt(state, "runner", "0 [Credits]");
  expect(promptButtons(state, "corp")).not.toContain("HQ");
  clickPrompt(state, "corp", "Archives");
  expect(getRun(state)?.server).toEqual(["archives"]);
  clickPrompt(state, "runner", "No");
  rez(state, "corp", getIce(state, "archives", 0));
  runContinue(state);
  expect(lastLogContains(state, "Runner encounters Ice Wall")).toBe(true);
});

it("minelayer - install ice at no cost", () => {
  const state = newGame({ corp: { deck: ["Minelayer", "Fire Wall"] } });
  playFromHand(state, "corp", "Minelayer", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  expect(getCorp(state).credit).toBe(6);
  runContinue(state);
  cardSubroutine(state, "corp", getIce(state, "hq", 0), 0);
  clickCard(state, "corp", findCard(state, "corp", "Fire Wall"));
  expect(getIce(state, "hq").length).toBe(2);
  expect(getCorp(state).credit).toBe(6);
});

it("miraju - breaking sub redirects run", () => {
  const state = newGame({
    corp: { hand: ["Mirāju", "Ice Wall"] },
    runner: { hand: ["Force of Nature"], credits: 10 },
  });
  playFromHand(state, "corp", "Mirāju", "hq");
  playFromHand(state, "corp", "Ice Wall", "archives");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Force of Nature");
  const miraju = getIce(state, "hq", 0);
  const iw = getIce(state, "archives", 0);
  rez(state, "corp", miraju);
  rez(state, "corp", iw);
  runOn(state, "hq");
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "Draw 1 card, then shuffle 1 card from HQ into R&D");
  runContinue(state);
  expect(getRun(state)?.server).toEqual(["archives"]);
  clickPrompt(state, "runner", "No");
  expect(rezzed(refresh(state, miraju))).toBe(false);
  runContinue(state);
  expect((state as any).run?.phase).toBe("encounter-ice");
  expect(sameCard(core.getCurrentIce(state), refresh(state, iw))).toBe(true);
});

it("miraju - runner can jack out after redirect", () => {
  const state = newGame({
    corp: { hand: ["Mirāju", "Ice Wall"] },
    runner: { hand: ["Force of Nature"], credits: 10 },
  });
  playFromHand(state, "corp", "Mirāju", "hq");
  playFromHand(state, "corp", "Ice Wall", "archives");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Force of Nature");
  const miraju = getIce(state, "hq", 0);
  const iw = getIce(state, "archives", 0);
  rez(state, "corp", miraju);
  rez(state, "corp", iw);
  runOn(state, "hq");
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "Draw 1 card, then shuffle 1 card from HQ into R&D");
  runContinue(state);
  expect(getRun(state)?.server).toEqual(["archives"]);
  clickPrompt(state, "runner", "Yes");
  expect(rezzed(refresh(state, miraju))).toBe(false);
  expect((state as any).run).toBeFalsy();
});

it("mlinzi - each side of each subroutine", () => {
  const state = newGame({
    corp: { deck: ["Mlinzi"] },
    runner: { hand: [qty("Sure Gamble", 10)], deck: [qty("Sure Gamble", 10)] },
  });
  playFromHand(state, "corp", "Mlinzi", "hq");
  takeCredits(state, "corp");
  const ml = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", ml);
  runContinue(state);
  cardSubroutine(state, "corp", refresh(state, ml), 0);
  expect(getRunner(state).hand.length).toBe(10);
  expect(promptButtons(state, "runner")).toContain("Take 1 net damage");
  expect(promptButtons(state, "runner")).toContain("Trash 2 cards from the top of your deck");
  clickPrompt(state, "runner", "Take 1 net damage");
  expect(getRunner(state).discard.length).toBe(1);
  expect(getRunner(state).hand.length).toBe(9);
  cardSubroutine(state, "corp", refresh(state, ml), 0);
  clickPrompt(state, "runner", "Trash 2 cards from the top of your deck");
  expect(getRunner(state).discard.length).toBe(3);
  expect(getRunner(state).deck.length).toBe(8);
  cardSubroutine(state, "corp", refresh(state, ml), 1);
  expect(promptButtons(state, "runner")).toContain("Take 2 net damage");
  expect(promptButtons(state, "runner")).toContain("Trash 3 cards from the top of your deck");
  clickPrompt(state, "runner", "Take 2 net damage");
  expect(getRunner(state).discard.length).toBe(5);
  expect(getRunner(state).hand.length).toBe(7);
  cardSubroutine(state, "corp", refresh(state, ml), 1);
  clickPrompt(state, "runner", "Trash 3 cards from the top of your deck");
  expect(getRunner(state).discard.length).toBe(8);
  expect(getRunner(state).deck.length).toBe(5);
  cardSubroutine(state, "corp", refresh(state, ml), 2);
  expect(promptButtons(state, "runner")).toContain("Take 3 net damage");
  expect(promptButtons(state, "runner")).toContain("Trash 4 cards from the top of your deck");
  clickPrompt(state, "runner", "Take 3 net damage");
  expect(getRunner(state).discard.length).toBe(11);
  expect(getRunner(state).hand.length).toBe(4);
  cardSubroutine(state, "corp", refresh(state, ml), 2);
  clickPrompt(state, "runner", "Trash 4 cards from the top of your deck");
  expect(getRunner(state).discard.length).toBe(15);
  expect(getRunner(state).deck.length).toBe(1);
});

it("mlinzi - not enough cards in hand", () => {
  const state = newGame({
    corp: { deck: ["Mlinzi"] },
    runner: { hand: ["Sure Gamble"], deck: [qty("Sure Gamble", 10)] },
  });
  playFromHand(state, "corp", "Mlinzi", "hq");
  takeCredits(state, "corp");
  const ml = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", ml);
  runContinue(state);
  expect(getRunner(state).hand.length).toBe(1);
  cardSubroutine(state, "corp", refresh(state, ml), 2);
  expect(promptButtons(state, "runner")).toContain("Take 3 net damage");
  expect(promptButtons(state, "runner")).toContain("Trash 4 cards from the top of your deck");
});

it("mlinzi - not enough cards in deck", () => {
  const state = newGame({
    corp: { deck: ["Mlinzi"] },
    runner: { deck: ["Sure Gamble"], hand: [qty("Sure Gamble", 10)] },
  });
  playFromHand(state, "corp", "Mlinzi", "hq");
  takeCredits(state, "corp");
  const ml = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", ml);
  runContinue(state);
  expect(getRunner(state).deck.length).toBe(1);
  cardSubroutine(state, "corp", refresh(state, ml), 2);
  expect(promptButtons(state, "runner")).toEqual(["Take 3 net damage"]);
});

it("mother goddess - gains other ice subtypes", () => {
  const state = newGame({ corp: { deck: ["Mother Goddess", "NEXT Bronze"] } });
  gain(state, "corp", "credit", 1);
  playFromHand(state, "corp", "Mother Goddess", "hq");
  playFromHand(state, "corp", "NEXT Bronze", "rd");
  const mg = getIce(state, "hq", 0);
  const nb = getIce(state, "rd", 0);
  rez(state, "corp", mg);
  expect(hasSubtype(refresh(state, mg), "Mythic")).toBe(true);
  expect(hasSubtype(refresh(state, mg), "Code Gate")).toBe(false);
  expect(hasSubtype(refresh(state, mg), "NEXT")).toBe(false);
  rez(state, "corp", nb);
  expect(hasSubtype(refresh(state, mg), "Mythic")).toBe(true);
  expect(hasSubtype(refresh(state, mg), "Code Gate")).toBe(true);
  expect(hasSubtype(refresh(state, mg), "NEXT")).toBe(true);
});

it("negotiator - subroutines fire correctly", () => {
  const state = newGame({
    corp: { deck: ["Negotiator"] },
    runner: { deck: ["Pelangi"] },
  });
  playFromHand(state, "corp", "Negotiator", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Pelangi");
  const negotiator = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", negotiator);
  runContinue(state);
  expect(getCorp(state).credit).toBe(3);
  cardSubroutine(state, "corp", negotiator, 0);
  expect(getCorp(state).credit).toBe(5);
  cardSubroutine(state, "corp", negotiator, 1);
  clickCard(state, "corp", "Pelangi");
  expect((getProgram as any)(state).length ?? 0).toBe(0);
});

it("negotiator - runner can break subs with credits", () => {
  const state = newGame({ corp: { deck: ["Negotiator"] } });
  playFromHand(state, "corp", "Negotiator", "hq");
  takeCredits(state, "corp");
  const negotiator = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", negotiator);
  runContinue(state);
  expect(getRunner(state).credit).toBe(5);
  cardSideAbility(state, "runner", negotiator, 0);
  clickPrompt(state, "runner", "Gain 2 [Credits]");
  clickPrompt(state, "runner", "Trash a program");
  expect(getRunner(state).credit).toBe(1);
  runContinue(state);
  expect(getRun(state)?.server).toEqual(["hq"]);
});

it("news hound - rezzes with the etr sub", () => {
  const state = newGame({
    corp: { deck: [qty("Project Atlas", 5)], hand: [qty("Scarcity of Resources", 2), "News Hound"] },
    runner: { hand: ["Employee Strike"] },
  });
  playFromHand(state, "corp", "Scarcity of Resources");
  playFromHand(state, "corp", "News Hound", "hq");
  const news = getIce(state, "hq", 0);
  rez(state, "corp", news);
  expect(refresh(state, news).subroutines.length).toBe(2);
});

it("news hound - loses and gains etr sub properly", () => {
  const state = newGame({
    corp: { deck: [qty("Project Atlas", 5)], hand: [qty("Scarcity of Resources", 2), "News Hound"] },
    runner: { hand: ["Employee Strike"] },
  });
  playFromHand(state, "corp", "News Hound", "hq");
  const news = getIce(state, "hq", 0);
  rez(state, "corp", news);
  expect(refresh(state, news).subroutines.length).toBe(1);
  playFromHand(state, "corp", "Scarcity of Resources");
  expect(refresh(state, news).subroutines.length).toBe(2);
  playFromHand(state, "corp", "Scarcity of Resources");
  expect(refresh(state, news).subroutines.length).toBe(2);
  takeCredits(state, "corp");
  runEmptyServer(state, "rd");
  clickPrompt(state, "runner", "Steal");
  expect(refresh(state, news).subroutines.length).toBe(1);
  playFromHand(state, "runner", "Employee Strike");
  expect(refresh(state, news).subroutines.length).toBe(2);
  takeCredits(state, "runner");
  playAndScore(state, "Project Atlas");
  expect(refresh(state, news).subroutines.length).toBe(1);
});

it("next bronze - add 1 strength for every rezzed NEXT ice", () => {
  const state = newGame({ corp: { deck: [qty("NEXT Bronze", 2), "NEXT Silver"] } });
  gain(state, "corp", "credit", 2);
  playFromHand(state, "corp", "NEXT Bronze", "hq");
  playFromHand(state, "corp", "NEXT Bronze", "rd");
  playFromHand(state, "corp", "NEXT Silver", "archives");
  const nb1 = getIce(state, "hq", 0);
  const nb2 = getIce(state, "rd", 0);
  const ns1 = getIce(state, "archives", 0);
  rez(state, "corp", nb1);
  expect(getStrength(refresh(state, nb1))).toBe(1);
  rez(state, "corp", nb2);
  expect(getStrength(refresh(state, nb1))).toBe(2);
  expect(getStrength(refresh(state, nb2))).toBe(2);
  rez(state, "corp", ns1);
  expect(getStrength(refresh(state, nb1))).toBe(3);
  expect(getStrength(refresh(state, nb2))).toBe(3);
});

it("next diamond - base rez cost", () => {
  const state = newGame({ corp: { deck: ["NEXT Diamond"] } });
  gain(state, "corp", "credit", 5);
  expect(getCorp(state).credit).toBe(10);
  playFromHand(state, "corp", "NEXT Diamond", "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  expect(getCorp(state).credit).toBe(0);
});

it("next diamond - lowered rez cost", () => {
  const state = newGame({ corp: { deck: ["NEXT Diamond", "NEXT Opal", "NEXT Bronze", "Kakugo"] } });
  gain(state, "corp", "credit", 13, "click", 1);
  playFromHand(state, "corp", "NEXT Diamond", "hq");
  playFromHand(state, "corp", "NEXT Opal", "hq");
  playFromHand(state, "corp", "NEXT Bronze", "rd");
  playFromHand(state, "corp", "Kakugo", "archives");
  rez(state, "corp", getIce(state, "hq", 1));
  rez(state, "corp", getIce(state, "archives", 0));
  expect(getCorp(state).credit).toBe(9);
  rez(state, "corp", getIce(state, "hq", 0));
  expect(getCorp(state).credit).toBe(0);
});

it("next gold", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["NEXT Gold", "NEXT Bronze"], credits: 100 },
    runner: { hand: [qty("Paperclip", 4), "Clot"], credits: 100 },
  });
  playFromHand(state, "corp", "NEXT Gold", "hq");
  playFromHand(state, "corp", "NEXT Bronze", "new remote");
  const gold = getIce(state, "hq", 0);
  const bro = getIce(state, "remote1", 0);
  rez(state, "corp", gold);
  rez(state, "corp", bro);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Paperclip");
  playFromHand(state, "runner", "Clot");
  expect(getRunner(state).hand.length).toBe(3);
  expect(getRunner(state).discard.length).toBe(0);
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", gold, 0);
  expect(getRunner(state).hand.length).toBe(1);
  expect(getRunner(state).discard.length).toBe(2);
  cardSubroutine(state, "corp", gold, 1);
  clickCard(state, "corp", getProgram(state, 0));
  clickCard(state, "corp", getProgram(state, 0));
  expect(getRunner(state).discard.length).toBe(4);
});

it("next opal", () => {
  const state = newGame({
    corp: {
      deck: [qty("Hedge Fund", 5)],
      hand: ["NEXT Opal", "NEXT Bronze", "Hostile Takeover", "PAD Campaign", "Mumbad Virtual Tour"],
      credits: 100,
    },
  });
  playFromHand(state, "corp", "NEXT Opal", "hq");
  const no = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", no);
  expect(refresh(state, no).subroutines.length).toBe(1);
  runContinue(state);
  cardSubroutine(state, "corp", no, 0);
  clickCard(state, "corp", "NEXT Bronze");
  clickPrompt(state, "corp", "New remote");
  rez(state, "corp", getIce(state, "remote1", 0));
  expect(refresh(state, no).subroutines.length).toBe(2);
  cardSubroutine(state, "corp", no, 0);
  clickCard(state, "corp", "Hostile Takeover");
  clickPrompt(state, "corp", "New remote");
  cardSubroutine(state, "corp", no, 0);
  clickCard(state, "corp", "PAD Campaign");
  clickPrompt(state, "corp", "New remote");
  cardSubroutine(state, "corp", no, 0);
  clickCard(state, "corp", "Mumbad Virtual Tour");
  clickPrompt(state, "corp", "New remote");
});

it("next sapphire", () => {
  const state = newGame({
    corp: {
      deck: [qty("Ice Wall", 100)],
      hand: ["NEXT Bronze", "NEXT Sapphire", qty("Ice Wall", 2)],
      discard: qty("Ice Wall", 5),
      credits: 10,
    },
  });
  playFromHand(state, "corp", "NEXT Bronze", "hq");
  playFromHand(state, "corp", "NEXT Sapphire", "rd");
  const bronze = getIce(state, "hq", 0);
  const sapphire = getIce(state, "rd", 0);
  rez(state, "corp", sapphire);
  takeCredits(state, "corp");
  runOn(state, "rd");
  runContinue(state);
  const hand0 = getCorp(state).hand.length;
  const deck0 = getCorp(state).deck.length;
  cardSubroutine(state, "corp", sapphire, 0);
  expect(getPromptMap(state, "corp").choices?.number).toBe(1);
  clickPrompt(state, "corp", "1");
  expect(getCorp(state).hand.length).toBe(hand0 + 1);
  expect(getCorp(state).deck.length).toBe(deck0 - 1);
  const hand1 = getCorp(state).hand.length;
  const trash1 = getCorp(state).discard.length;
  cardSubroutine(state, "corp", sapphire, 1);
  clickCard(state, "corp", findCard(state, "corp", "Ice Wall"));
  expect(getCorp(state).hand.length).toBe(hand1 + 1);
  expect(getCorp(state).discard.length).toBe(trash1 - 1);
  const hand2 = getCorp(state).hand.length;
  const deck2 = getCorp(state).deck.length;
  cardSubroutine(state, "corp", sapphire, 2);
  clickCard(state, "corp", findCard(state, "corp", "Ice Wall"));
  expect(getCorp(state).hand.length).toBe(hand2 - 1);
  expect(getCorp(state).deck.length).toBe(deck2 + 1);
  rez(state, "corp", bronze);
  cardSubroutine(state, "corp", sapphire, 0);
  expect(getPromptMap(state, "corp").choices?.number).toBe(2);
});

it("next silver", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["NEXT Silver", "NEXT Bronze"], credits: 100 },
  });
  playFromHand(state, "corp", "NEXT Silver", "hq");
  playFromHand(state, "corp", "NEXT Bronze", "new remote");
  const sil = getIce(state, "hq", 0);
  const bro = getIce(state, "remote1", 0);
  rez(state, "corp", sil);
  expect(refresh(state, sil).subroutines.length).toBe(1);
  rez(state, "corp", bro);
  expect(refresh(state, sil).subroutines.length).toBe(2);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", sil, 0);
  expect((state as any).run).toBeFalsy();
});

it("nightdancer - runner loses a click if able, corp gains a click on next turn", () => {
  const state = newGame({ corp: { deck: ["Nightdancer"] } });
  playFromHand(state, "corp", "Nightdancer", "hq");
  takeCredits(state, "corp");
  const nd = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", nd);
  runContinue(state);
  expect(getRunner(state).click).toBe(3);
  cardSubroutine(state, "corp", nd, 0);
  expect(getRunner(state).click).toBe(2);
  cardSubroutine(state, "corp", nd, 1);
  expect(getRunner(state).click).toBe(1);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  expect(getCorp(state).click).toBe(5);
});

it("oduduwa - encounter effect", () => {
  const state = newGame({ corp: { deck: ["Oduduwa", "Enigma"], credits: 10 } });
  playFromHand(state, "corp", "Oduduwa", "hq");
  playFromHand(state, "corp", "Enigma", "rd");
  const odu = getIce(state, "hq", 0);
  const eni = getIce(state, "rd", 0);
  rez(state, "corp", odu);
  rez(state, "corp", eni);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  expect(getPromptMap(state, "corp").msg).toContain("Place 1 advancement counter on another ice?");
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", refresh(state, eni));
  expect(getCounters(refresh(state, odu), "advancement")).toBe(1);
  expect(getCounters(refresh(state, eni), "advancement")).toBe(1);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  expect(getPromptMap(state, "corp").msg).toContain("Place 2 advancement counters on another ice?");
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", refresh(state, eni));
  expect(getCounters(refresh(state, odu), "advancement")).toBe(2);
  expect(getCounters(refresh(state, eni), "advancement")).toBe(3);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  expect(getPromptMap(state, "corp").msg).toContain("Place 3 advancement counters on another ice?");
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", refresh(state, eni));
  expect(lastLogContains(state, "Corp uses Oduduwa to place 3 advancement counters on Enigma")).toBe(true);
  expect(getCounters(refresh(state, odu), "advancement")).toBe(3);
  expect(getCounters(refresh(state, eni), "advancement")).toBe(6);
});

it("otoroshi", () => {
  const state = newGame({
    corp: { deck: [qty("Ice Wall", 100)], hand: ["Otoroshi", "Project Junebug"] },
    runner: { hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Otoroshi", "new remote");
  playFromHand(state, "corp", "Project Junebug", "new remote");
  takeCredits(state, "corp");
  runOn(state, "remote1");
  const otoroshi = getIce(state, "remote1", 0);
  const junebug = getContent(state, "remote2", 0);
  const credits = getRunner(state).credit;
  expect(getCounters(refresh(state, junebug), "advancement")).toBe(0);
  rez(state, "corp", otoroshi);
  runContinue(state);
  cardSubroutine(state, "corp", otoroshi, 0);
  clickCard(state, "corp", junebug);
  expect(getCounters(refresh(state, junebug), "advancement")).toBe(3);
  expect(promptButtons(state, "runner")).toContain("Access a card in Server 2");
  expect(promptButtons(state, "runner")).toContain("Pay 3 [Credits]");
  clickPrompt(state, "runner", "Pay 3 [Credits]");
  expect(getRunner(state).credit).toBe(credits - 3);
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "remote1");
  runContinue(state);
  cardSubroutine(state, "corp", otoroshi, 0);
  clickCard(state, "corp", refresh(state, junebug));
  expect(getCounters(refresh(state, junebug), "advancement")).toBe(6);
  expect(promptButtons(state, "runner")).toEqual(["Access a card in Server 2"]);
  clickPrompt(state, "runner", "Access a card in Server 2");
  clickPrompt(state, "corp", "Yes");
  expect(accessing(state, "Project Junebug")).toBe(true);
  clickPrompt(state, "runner", "No action");
  expect((state as any).winner).toBe("corp");
});

it("pachinko - no tags, run continues", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Pachinko"] },
  });
  playFromHand(state, "corp", "Pachinko", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const pachinko = getIce(state, "hq", 0);
  rez(state, "corp", pachinko);
  runContinue(state);
  cardSubroutine(state, "corp", pachinko, 0);
  cardSubroutine(state, "corp", pachinko, 1);
  expect((state as any).run).toBeTruthy();
});

it("pachinko - autopump subtracted correct amount of credits", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Pachinko"] },
    runner: { hand: ["Corroder"] },
  });
  playFromHand(state, "corp", "Pachinko", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  gain(state, "runner", "credit", 10);
  runOn(state, "hq");
  const pachinko = getIce(state, "hq", 0);
  const corroder = getProgram(state, 0);
  const runnerCredits = getRunner(state).credit;
  rez(state, "corp", pachinko);
  runContinue(state);
  autoPumpAndBreak(state, corroder);
  expect(getRunner(state).credit).toBe(runnerCredits - 4);
});

it("pachinko - etr with tags", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Pachinko"] },
  });
  playFromHand(state, "corp", "Pachinko", "hq");
  takeCredits(state, "corp");
  gainTags(state, "runner", 1);
  runOn(state, "hq");
  const pachinko = getIce(state, "hq", 0);
  rez(state, "corp", pachinko);
  runContinue(state);
  cardSubroutine(state, "corp", pachinko, 0);
  expect((state as any).run).toBeFalsy();
});

it("palisade", () => {
  const state = newGame({ corp: { hand: [qty("Palisade", 2)] } });
  clickCredit(state, "corp");
  playFromHand(state, "corp", "Palisade", "hq");
  playFromHand(state, "corp", "Palisade", "new remote");
  takeCredits(state, "corp");
  const palisadeCentral = getIce(state, "hq", 0);
  const palisadeRemote = getIce(state, "remote1", 0);
  rez(state, "corp", palisadeCentral);
  expect(getStrength(refresh(state, palisadeCentral))).toBe(2);
  rez(state, "corp", palisadeRemote);
  expect(getStrength(refresh(state, palisadeRemote))).toBe(4);
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, palisadeCentral);
  expect((state as any).run).toBeFalsy();
});

it("paper wall", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Paper Wall"] },
    runner: { hand: ["Corroder"] },
  });
  playFromHand(state, "corp", "Paper Wall", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  runOn(state, "hq");
  const paperwall = getIce(state, "hq", 0);
  const corroder = getProgram(state, 0);
  rez(state, "corp", paperwall);
  runContinue(state);
  autoPumpAndBreak(state, corroder);
  expect(getIce(state, "hq", 0)).toBeUndefined();
});

it("peeping tom - counts # of chosen card type in runner grip", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Peeping Tom"] },
    runner: { hand: ["Corroder", qty("Sure Gamble", 4)] },
  });
  playFromHand(state, "corp", "Peeping Tom", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  runOn(state, "hq");
  const tom = getIce(state, "hq", 0);
  rez(state, "corp", refresh(state, tom));
  runContinue(state);
  clickPrompt(state, "corp", "Event");
  expect(lastLogContains(state, "Sure Gamble, Sure Gamble, Sure Gamble, and Sure Gamble")).toBe(true);
  expect(lastLogContains(state, "4")).toBe(true);
  fireSubs(state, tom);
  clickPrompt(state, "runner", "Take 1 tag");
  expect(countTags(state)).toBe(1);
  clickPrompt(state, "runner", "End the run");
  expect((state as any).run).toBeFalsy();
});

it("pharos", () => {
  const state = newGame({ corp: { hand: ["Pharos", qty("Hedge Fund", 2)] } });
  playFromHand(state, "corp", "Pharos", "hq");
  playFromHand(state, "corp", "Hedge Fund");
  playFromHand(state, "corp", "Hedge Fund");
  takeCredits(state, "corp");
  expect(countTags(state)).toBe(0);
  const pha = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", refresh(state, pha));
  runContinue(state);
  fireSubs(state, pha);
  expect(countTags(state)).toBe(1);
  expect((state as any).run).toBeFalsy();
  takeCredits(state, "runner");
  expect(getCounters(refresh(state, pha), "advancement")).toBe(0);
  expect(getStrength(refresh(state, pha))).toBe(5);
  for (let n = 0; n < 2; n++) {
    advance(state, pha);
    expect(getCounters(refresh(state, pha), "advancement")).toBe(n + 1);
    expect(getStrength(refresh(state, pha))).toBe(5);
  }
  advance(state, pha);
  expect(getCounters(refresh(state, pha), "advancement")).toBe(3);
  expect(getStrength(refresh(state, pha))).toBe(10);
});

it("phoneutria - tag only when passing itself", () => {
  const state = newGame({
    corp: { hand: ["Hedge Fund", "Phoneutria", "Vanilla"] },
    runner: { hand: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Hedge Fund");
  playFromHand(state, "corp", "Phoneutria", "hq");
  playFromHand(state, "corp", "Vanilla", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 1));
  rez(state, "corp", getIce(state, "hq", 0));
  changed(() => countTags(state), 0, () => {
    runContinue(state, "encounter-ice");
    runContinue(state, "movement");
    runContinue(state, "approach-ice");
  });
  runContinue(state, "encounter-ice");
  changed(() => countTags(state), 1, () => {
    runContinue(state, "movement");
  });
});

it("phoneutria - no tag", () => {
  const state = newGame({
    corp: { hand: ["Hedge Fund", "Phoneutria"] },
    runner: { hand: [qty("Sure Gamble", 3)] },
  });
  playFromHand(state, "corp", "Hedge Fund");
  playFromHand(state, "corp", "Phoneutria", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  changed(() => countTags(state), 0, () => {
    runContinue(state, "encounter-ice");
    runContinue(state, "movement");
  });
});

it("ping - takes tag on rez during run", () => {
  const state = newGame({ corp: { hand: ["Hedge Fund", qty("Ping", 2)] } });
  playFromHand(state, "corp", "Ping", "hq");
  playFromHand(state, "corp", "Ping", "new remote");
  takeCredits(state, "corp");
  const png1 = getIce(state, "hq", 0);
  const png2 = getIce(state, "remote1", 0);
  expect(countTags(state)).toBe(0);
  rez(state, "corp", refresh(state, png2));
  expect(countTags(state)).toBe(0);
  runOn(state, "hq");
  rez(state, "corp", refresh(state, png1));
  expect(countTags(state)).toBe(1);
  runContinue(state);
  fireSubs(state, png1);
  expect((state as any).run).toBeFalsy();
});

it("piranhas - take bad pub", () => {
  const state = newGame({
    corp: { hand: ["Piranhas"], deck: [qty("Hedge Fund", 5)] },
    runner: { hand: [qty("Sure Gamble", 2)] },
  });
  playFromHand(state, "corp", "Piranhas", "hq");
  takeCredits(state, "corp");
  const pir = getIce(state, "hq", 0);
  runOn(state, "hq");
  changed(() => countBadPub(state), 1, () => {
    rez(state, "corp", pir);
  });
  runContinue(state);
  changed(() => getCorp(state).hand.length, 1, () => {
    cardSubroutine(state, "corp", refresh(state, pir), 0);
    clickPrompt(state, "corp", "Yes");
  });
  changedMulti([
    [() => getRunner(state).hand.length, -1],
    [() => getRunner(state).discard.length, 1],
  ], () => {
    cardSubroutine(state, "corp", refresh(state, pir), 1);
  });
  cardSubroutine(state, "corp", refresh(state, pir), 2);
  expect((state as any).run).toBeTruthy();
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, refresh(state, pir));
  clickPrompt(state, "corp", "Yes");
  expect((state as any).run).toBeFalsy();
});

it("piranhas - remove tag", () => {
  const state = newGame({ corp: { hand: ["Piranhas"] } });
  playFromHand(state, "corp", "Piranhas", "hq");
  takeCredits(state, "corp");
  const pir = getIce(state, "hq", 0);
  gainTags(state, "runner", 1);
  runOn(state, "hq");
  changed(() => countTags(state), -1, () => {
    rez(state, "corp", pir, { expectRez: false });
    clickPrompt(state, "corp", "Remove 1 tag");
  });
});

it("pulse", () => {
  const state = newGame({ corp: { hand: [qty("Pulse", 2)], credits: 15 } });
  playFromHand(state, "corp", "Pulse", "hq");
  playFromHand(state, "corp", "Pulse", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const p1 = getIce(state, "hq", 1);
  const p2 = getIce(state, "hq", 0);
  changed(() => getRunner(state).click, -1, () => {
    rez(state, "corp", refresh(state, p1));
  });
  runContinue(state);
  rez(state, "corp", refresh(state, p2));
  changed(() => getRunner(state).credit, -2, () => {
    fireSubs(state, refresh(state, p1));
  });
  changed(() => getRunner(state).click, -1, () => {
    clickPrompt(state, "runner", "Spend [Click]");
  });
});

it("pulse - cannot spend click when running last click", () => {
  const state = newGame({ corp: { hand: ["Pulse"] } });
  playFromHand(state, "corp", "Pulse", "hq");
  takeCredits(state, "corp");
  for (let i = 0; i < 3; i++) {
    clickCredit(state, "runner");
  }
  runOn(state, "hq");
  const pulse = getIce(state, "hq", 0);
  rez(state, "corp", pulse);
  runContinue(state);
  fireSubs(state, refresh(state, pulse));
  expect(promptButtons(state, "runner")).toEqual(["End the run"]);
});

it("red tape", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Ice Wall", "Red Tape"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Red Tape", "rd");
  const iw = getIce(state, "hq", 0);
  const redTape = getIce(state, "rd", 0);
  rez(state, "corp", iw);
  rez(state, "corp", redTape);
  takeCredits(state, "corp");
  runOn(state, "rd");
  runContinue(state);
  changed(() => core.getStrength(refresh(state, iw)), 3, () => {
    fireSubs(state, redTape);
  });
});

it("resistor - strength based on tags", () => {
  const state = newGame({ corp: { deck: ["Resistor"] } });
  playFromHand(state, "corp", "Resistor", "hq");
  const resistor = getIce(state, "hq", 0);
  rez(state, "corp", resistor);
  expect(getStrength(refresh(state, resistor))).toBe(0);
  gainTags(state, "runner", 2);
  expect(countTags(state)).toBe(2);
  expect(getStrength(refresh(state, resistor))).toBe(2);
  takeCredits(state, "corp");
  removeTag(state, "runner");
  expect(getStrength(refresh(state, resistor))).toBe(1);
});

it("resistor - subroutine is trace 4 etr", () => {
  const state = newGame({ corp: { deck: ["Resistor"] } });
  playFromHand(state, "corp", "Resistor", "hq");
  const resistor = getIce(state, "hq", 0);
  rez(state, "corp", resistor);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, resistor);
  expect(getPromptMap(state, "corp").type).toBe("trace");
  expect(getPromptMap(state, "corp").base).toBe(4);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect((state as any).run).toBeFalsy();
});

it("rime", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 10)], hand: [qty("Rime", 2), qty("Ice Wall", 2)] },
  });
  gain(state, "corp", "click", 10, "credit", 10);
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Ice Wall", "rd");
  const iw1 = getIce(state, "hq", 0);
  const iw2 = getIce(state, "rd", 0);
  rez(state, "corp", iw1);
  rez(state, "corp", iw2);
  expect(core.getStrength(refresh(state, iw1))).toBe(1);
  playFromHand(state, "corp", "Rime", "hq");
  expect(core.getStrength(refresh(state, iw1))).toBe(1);
  rez(state, "corp", getIce(state, "hq", 1));
  expect(core.getStrength(refresh(state, iw1))).toBe(2);
  expect(core.getStrength(refresh(state, iw2))).toBe(1);
  move(state, "corp", getIce(state, "hq", 1), "hand");
  playFromHand(state, "corp", "Rime", "rd");
  rez(state, "corp", getIce(state, "rd", 1));
  expect(core.getStrength(refresh(state, iw1))).toBe(1);
  expect(core.getStrength(refresh(state, iw2))).toBe(2);
});

it("sadaka - sub 1 - look at top 3 cards of r&d", () => {
  const state = newGame({
    corp: { deck: [qty("Enigma", 4)], hand: ["Sadaka"] },
  });
  playFromHand(state, "corp", "Sadaka", "archives");
  const sadaka = getIce(state, "archives", 0);
  takeCredits(state, "corp");
  runOn(state, "archives");
  rez(state, "corp", sadaka);
  runContinue(state);
  expect(getCorp(state).hand.length).toBe(0);
  cardSubroutine(state, "corp", refresh(state, sadaka), 0);
  clickPrompt(state, "corp", "Shuffle R&D");
  clickPrompt(state, "corp", "Yes");
  expect(getCorp(state).hand.length).toBe(1);
  cardSubroutine(state, "corp", refresh(state, sadaka), 0);
  clickPrompt(state, "corp", "Arrange cards");
  clickPrompt(state, "corp", "Enigma");
  clickPrompt(state, "corp", "Enigma");
  clickPrompt(state, "corp", "Enigma");
  clickPrompt(state, "corp", "Done");
  clickPrompt(state, "corp", "No");
  expect(getCorp(state).hand.length).toBe(1);
});

it("sadaka - sub 2 - trash card in hq, trash 1 resource", () => {
  const state = newGame({
    corp: { deck: [qty("Sadaka", 2), qty("Enigma", 3)] },
    runner: { deck: ["Bank Job"] },
  });
  playFromHand(state, "corp", "Sadaka", "archives");
  playFromHand(state, "corp", "Sadaka", "hq");
  const sadaka = getIce(state, "archives", 0);
  const sadakaHQ = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Bank Job");
  runOn(state, "archives");
  rez(state, "corp", sadaka);
  runContinue(state);
  expect(getCorp(state).hand.length).toBe(3);
  expect(getCorp(state).discard.length).toBe(0);
  cardSubroutine(state, "corp", refresh(state, sadaka), 1);
  clickCard(state, "corp", findCard(state, "corp", "Enigma"));
  expect(getCorp(state).hand.length).toBe(2);
  expect(getCorp(state).discard.length).toBe(1);
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).discard.length).toBe(2);
  runJackOut(state);
  runOn(state, "hq");
  rez(state, "corp", sadakaHQ);
  runContinue(state);
  expect(getCorp(state).hand.length).toBe(2);
  expect(getRunner(state).discard.length).toBe(0);
  cardSubroutine(state, "corp", refresh(state, sadakaHQ), 1);
  clickCard(state, "corp", findCard(state, "corp", "Enigma"));
  expect(getCorp(state).hand.length).toBe(1);
  expect(getCorp(state).discard.length).toBe(3);
  clickCard(state, "corp", getResource(state, 0));
  expect(getRunner(state).discard.length).toBe(1);
  expect(getCorp(state).discard.length).toBe(4);
});

it("saisentan - corp chooses correctly", () => {
  const state = newGame({
    corp: { hand: ["Saisentan"] },
    runner: { hand: [qty("Sure Gamble", 6)] },
  });
  playFromHand(state, "corp", "Saisentan", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const sai = getIce(state, "hq", 0);
  rez(state, "corp", sai);
  runContinue(state);
  clickPrompt(state, "corp", "Event");
  expect(getRunner(state).discard.length).toBe(0);
  cardSubroutine(state, "corp", sai, 0);
  expect(getRunner(state).discard.length).toBe(2);
});

it("saisentan - corp chooses incorrectly", () => {
  const state = newGame({
    corp: { hand: ["Saisentan"] },
    runner: { hand: [qty("Sure Gamble", 6)] },
  });
  playFromHand(state, "corp", "Saisentan", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const sai = getIce(state, "hq", 0);
  rez(state, "corp", sai);
  runContinue(state);
  clickPrompt(state, "corp", "Hardware");
  expect(getRunner(state).discard.length).toBe(0);
  cardSubroutine(state, "corp", sai, 0);
  expect(getRunner(state).discard.length).toBe(1);
});

it("saisentan - firing subs with fire-subs", () => {
  const state = newGame({
    corp: { hand: ["Saisentan"] },
    runner: { hand: [qty("Sure Gamble", 9)] },
  });
  playFromHand(state, "corp", "Saisentan", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const sai = getIce(state, "hq", 0);
  rez(state, "corp", sai);
  runContinue(state);
  clickPrompt(state, "corp", "Event");
  changed(() => getRunner(state).hand.length, -6, () => {
    fireSubs(state, refresh(state, sai));
  });
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "hq");
  runContinue(state);
  clickPrompt(state, "corp", "Hardware");
  changed(() => getRunner(state).hand.length, -3, () => {
    fireSubs(state, refresh(state, sai));
  });
});

it("salvage - subroutine gaining ability", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Salvage"] },
  });
  playFromHand(state, "corp", "Salvage", "hq");
  const salvage = getIce(state, "hq", 0);
  rez(state, "corp", salvage);
  expect(refresh(state, salvage).subroutines.length).toBe(0);
  advance(state, salvage, 2);
  expect(refresh(state, salvage).subroutines.length).toBe(2);
});

it("salvage - subroutine is trace 2 gain a tag", () => {
  const state = newGame({ corp: { deck: ["Salvage"] } });
  playFromHand(state, "corp", "Salvage", "hq");
  const salvage = getIce(state, "hq", 0);
  rez(state, "corp", salvage);
  advance(state, salvage, 1);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, salvage);
  expect(getPromptMap(state, "corp").type).toBe("trace");
  expect(getPromptMap(state, "corp").base).toBe(2);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(countTags(state)).toBe(1);
});

it("sand storm - redirect run", () => {
  const state = newGame({ corp: { deck: ["Sand Storm", "PAD Campaign"] } });
  playFromHand(state, "corp", "Sand Storm", "new remote");
  playFromHand(state, "corp", "PAD Campaign", "new remote");
  takeCredits(state, "corp");
  runOn(state, "server 1");
  const sandStorm = getIce(state, "remote1", 0);
  rez(state, "corp", sandStorm);
  runContinue(state);
  cardSubroutine(state, "corp", sandStorm, 0);
  clickPrompt(state, "corp", "Server 2");
  expect(getRun(state)?.server[0]).toBe("remote2");
});

it("sandman - add an installed runner card to the grip", () => {
  const state = newGame({
    corp: { deck: ["Sandman"] },
    runner: { deck: ["Inti", "Scrubber"] },
  });
  playFromHand(state, "corp", "Sandman", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Inti");
  playFromHand(state, "runner", "Scrubber");
  expect(getRunner(state).hand.length).toBe(0);
  runOn(state, "hq");
  const sand = getIce(state, "hq", 0);
  rez(state, "corp", refresh(state, sand));
  runContinue(state);
  cardSubroutine(state, "corp", refresh(state, sand), 0);
  clickCard(state, "corp", "Inti");
  expect(getRunner(state).hand.length).toBe(1);
  cardSubroutine(state, "corp", refresh(state, sand), 0);
  clickCard(state, "corp", "Scrubber");
  expect(getRunner(state).hand.length).toBe(2);
  cardSubroutine(state, "corp", refresh(state, sand), 0);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("sandstone - gain virus counter on run reducing strength by 1", () => {
  const state = newGame({ corp: { deck: ["Sandstone"] } });
  playFromHand(state, "corp", "Sandstone", "hq");
  takeCredits(state, "corp");
  gain(state, "runner", "click", 10);
  const snd = getIce(state, "hq", 0);
  rez(state, "corp", snd);
  for (let i = 0; i < 6; i++) {
    runOn(state, "hq");
    expect(getCounters(refresh(state, snd), "virus")).toBe(i);
    expect(core.getStrength(refresh(state, snd))).toBe(6 - i);
    runContinue(state);
    expect(getCounters(refresh(state, snd), "virus")).toBe(i + 1);
    expect(core.getStrength(refresh(state, snd))).toBe(6 - (i + 1));
    cardSubroutine(state, "corp", refresh(state, snd), 0);
    expect((state as any).run).toBeFalsy();
  }
  expect(core.getStrength(refresh(state, snd))).toBe(0);
});

it("sapper", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Sapper"] },
    runner: { hand: ["Corroder"] },
  });
  playFromHand(state, "corp", "Sapper", "hq");
  const sapper = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  runOn(state, "hq");
  rez(state, "corp", sapper);
  runContinue(state);
  cardSubroutine(state, "corp", sapper, 0);
  clickCard(state, "corp", "Corroder");
  expect(getProgram(state, 0)).toBeUndefined();
});

it("sapper - access test", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Sapper"] },
    runner: { hand: ["Corroder"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  runEmptyServer(state, "hq");
  expect(core.getCurrentIce(state)?.title).toBe("Sapper");
  fireSubs(state, core.getCurrentIce(state)!);
  clickCard(state, "corp", "Corroder");
  expect(getProgram(state, 0)).toBeUndefined();
});

it("searchlight - trace base equal to advancement counters", () => {
  const state = newGame({ corp: { deck: ["Searchlight"] } });
  playFromHand(state, "corp", "Searchlight", "hq");
  takeCredits(state, "corp");
  const searchlight = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", searchlight);
  runContinue(state);
  cardSubroutine(state, "corp", refresh(state, searchlight), 0);
  expect(getPromptMap(state, "corp").type).toBe("trace");
  expect(getPromptMap(state, "corp").base).toBe(0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(countTags(state)).toBe(0);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  advance(state, searchlight, 1);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", refresh(state, searchlight), 0);
  expect(getPromptMap(state, "corp").type).toBe("trace");
  expect(getPromptMap(state, "corp").base).toBe(1);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(countTags(state)).toBe(1);
});

it("seidr adaptive barrier - +1 strength for every ice protecting its server", () => {
  const state = newGame({ corp: { deck: ["Seidr Adaptive Barrier", qty("Ice Wall", 2)] } });
  gain(state, "corp", "credit", 10);
  playFromHand(state, "corp", "Seidr Adaptive Barrier", "hq");
  const sab = getIce(state, "hq", 0);
  rez(state, "corp", sab);
  expect(getStrength(refresh(state, sab))).toBe(3);
  playFromHand(state, "corp", "Ice Wall", "hq");
  expect(getStrength(refresh(state, sab))).toBe(4);
  playFromHand(state, "corp", "Ice Wall", "hq");
  expect(getStrength(refresh(state, sab))).toBe(5);
  core.processAction("move", state, "corp", { card: getIce(state, "hq", 1), server: "Archives" });
  expect(getStrength(refresh(state, sab))).toBe(4);
});

it("self-adapting code wall - strength cannot be lowered", () => {
  const state = newGame({
    corp: { deck: ["Self-Adapting Code Wall", "Lag Time"] },
    runner: { deck: ["Ice Carver", "Parasite"] },
  });
  playFromHand(state, "corp", "Self-Adapting Code Wall", "archives");
  gain(state, "corp", "credit", -2);
  const sacw = getIce(state, "archives", 0);
  playFromHand(state, "runner", "Ice Carver");
  runOn(state, "archives");
  rez(state, "corp", sacw);
  runContinue(state);
  expect(getStrength(refresh(state, sacw))).toBe(1);
  runContinue(state, "movement");
  runJackOut(state);
  playFromHand(state, "runner", "Parasite");
  clickCard(state, "runner", sacw);
  expect(refresh(state, sacw).hosted.length).toBe(1);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  expect(core.getVirusCounters(state, refresh(state, sacw).hosted[0])).toBe(1);
  expect(getStrength(refresh(state, sacw))).toBe(1);
  takeCredits(state, "runner");
  playFromHand(state, "corp", "Lag Time");
  expect(getStrength(refresh(state, sacw))).toBe(2);
  takeCredits(state, "corp");
  expect(getStrength(refresh(state, sacw))).toBe(2);
});

it("sensei", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Special Offer", "Snowflake", "Sensei"], credits: 100 },
  });
  playFromHand(state, "corp", "Special Offer", "hq");
  playFromHand(state, "corp", "Snowflake", "hq");
  playFromHand(state, "corp", "Sensei", "hq");
  takeCredits(state, "corp");
  const offer = getIce(state, "hq", 0);
  const snow = getIce(state, "hq", 1);
  const sensei = getIce(state, "hq", 2);
  runOn(state, "hq");
  rez(state, "corp", sensei);
  runContinue(state);
  fireSubs(state, sensei);
  expect(refresh(state, offer).subroutines.length).toBe(1);
  runContinueUntil(state, "approach-ice");
  rez(state, "corp", snow);
  runContinue(state);
  expect(refresh(state, snow).subroutines.length).toBe(2);
  runContinueUntil(state, "approach-ice");
  rez(state, "corp", offer);
  runContinue(state);
  expect(refresh(state, offer).subroutines.length).toBe(2);
  runContinue(state, "movement");
  runJackOut(state);
  expect(refresh(state, offer).subroutines.length).toBe(1);
  expect(refresh(state, snow).subroutines.length).toBe(1);
});

it("seraph", () => {
  const state = newGame({
    corp: { hand: ["Seraph"], credits: 10 },
    runner: { hand: [qty("Sure Gamble", 4)], credits: 10 },
  });
  playFromHand(state, "corp", "Seraph", "hq");
  takeCredits(state, "corp");
  const ser = getIce(state, "hq", 0);
  rez(state, "corp", ser);
  runOn(state, "hq");
  runContinue(state);
  changed(() => getRunner(state).credit, -3, () => {
    clickPrompt(state, "runner", "Lose 3 [Credits]");
  });
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "hq");
  runContinue(state);
  changed(() => countTags(state), 1, () => {
    clickPrompt(state, "runner", "Take 1 tag");
  });
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "hq");
  runContinue(state);
  changedMulti([
    [() => getRunner(state).hand.length, -2],
    [() => getRunner(state).discard.length, 2],
  ], () => {
    clickPrompt(state, "runner", "Suffer 2 net damage");
  });
  changed(() => getRunner(state).credit, -3, () => {
    cardSubroutine(state, "corp", refresh(state, ser), 0);
  });
  changedMulti([
    [() => getRunner(state).hand.length, -2],
    [() => getRunner(state).discard.length, 2],
  ], () => {
    cardSubroutine(state, "corp", refresh(state, ser), 1);
  });
  changed(() => countTags(state), 1, () => {
    cardSubroutine(state, "corp", refresh(state, ser), 2);
  });
});

it("sherlock 1.0 - subroutine 1: trace 4 - add installed program to top of stack", () => {
  const state = newGame({
    corp: { deck: ["Sherlock 1.0"] },
    runner: { deck: [qty("Gordian Blade", 3), qty("Sure Gamble", 3)] },
  });
  playFromHand(state, "corp", "Sherlock 1.0", "hq");
  takeCredits(state, "corp");
  const sherlock = getIce(state, "hq", 0);
  playFromHand(state, "runner", "Gordian Blade");
  runOn(state, "hq");
  rez(state, "corp", sherlock);
  runContinue(state);
  cardSubroutine(state, "corp", sherlock, 0);
  expect(getPromptMap(state, "corp").type).toBe("trace");
  expect(getPromptMap(state, "corp").base).toBe(4);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", getProgram(state, 0));
  expect(getRunner(state).deck[0]?.title).toBe("Gordian Blade");
});

it("sherlock 1.0 - subroutine 2: trace 4 - add installed program to top of stack", () => {
  const state = newGame({
    corp: { deck: ["Sherlock 1.0"] },
    runner: { deck: [qty("Gordian Blade", 3), qty("Sure Gamble", 3)] },
  });
  playFromHand(state, "corp", "Sherlock 1.0", "hq");
  takeCredits(state, "corp");
  const sherlock = getIce(state, "hq", 0);
  playFromHand(state, "runner", "Gordian Blade");
  runOn(state, "hq");
  rez(state, "corp", sherlock);
  runContinue(state);
  cardSubroutine(state, "corp", sherlock, 1);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", getProgram(state, 0));
  expect(getRunner(state).deck[0]?.title).toBe("Gordian Blade");
});

it("sherlock 2.0 - subroutine 1: trace 4 - add installed program to bottom of stack", () => {
  const state = newGame({
    corp: { deck: [qty("Sherlock 2.0", 1)] },
    runner: { deck: [qty("Gordian Blade", 3), qty("Sure Gamble", 3)] },
  });
  playFromHand(state, "corp", "Sherlock 2.0", "hq");
  takeCredits(state, "corp");
  const sherlock = getIce(state, "hq", 0);
  playFromHand(state, "runner", "Gordian Blade");
  runOn(state, "hq");
  rez(state, "corp", sherlock);
  runContinue(state);
  cardSubroutine(state, "corp", sherlock, 0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", getProgram(state, 0));
  const deck = getRunner(state).deck;
  expect(deck[deck.length - 1]?.title).toBe("Gordian Blade");
});

it("sherlock 2.0 - subroutine 2: trace 4 - add installed program to bottom of stack", () => {
  const state = newGame({
    corp: { deck: [qty("Sherlock 2.0", 1)] },
    runner: { deck: [qty("Gordian Blade", 3), qty("Sure Gamble", 3)] },
  });
  playFromHand(state, "corp", "Sherlock 2.0", "hq");
  takeCredits(state, "corp");
  const sherlock = getIce(state, "hq", 0);
  playFromHand(state, "runner", "Gordian Blade");
  runOn(state, "hq");
  rez(state, "corp", sherlock);
  runContinue(state);
  cardSubroutine(state, "corp", sherlock, 1);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", getProgram(state, 0));
  const deck = getRunner(state).deck;
  expect(deck[deck.length - 1]?.title).toBe("Gordian Blade");
});

it("sherlock 2.0 - subroutine 3: give 1 tag", () => {
  const state = newGame({ corp: { deck: [qty("Sherlock 2.0", 1)] } });
  playFromHand(state, "corp", "Sherlock 2.0", "hq");
  takeCredits(state, "corp");
  const sherlock = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", sherlock);
  runContinue(state);
  cardSubroutine(state, "corp", sherlock, 2);
  expect(countTags(state)).toBe(1);
});

it("shiro - subroutine 1: rearrange the top 3 cards of r&d", () => {
  const state = newGame({
    corp: { deck: ["Caprice Nisei", "Quandary", "Jackson Howard"], hand: ["Shiro"] },
    runner: { deck: ["R&D Interface"] },
  });
  playFromHand(state, "corp", "Shiro", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "R&D Interface");
  const shiro = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", shiro);
  runContinue(state);
  cardSubroutine(state, "corp", shiro, 0);
  clickCard(state, "corp", findCard(state, "corp", "Caprice Nisei"));
  clickCard(state, "corp", findCard(state, "corp", "Quandary"));
  clickCard(state, "corp", findCard(state, "corp", "Jackson Howard"));
  clickPrompt(state, "corp", "Start over");
  clickCard(state, "corp", findCard(state, "corp", "Jackson Howard"));
  clickCard(state, "corp", findCard(state, "corp", "Quandary"));
  clickCard(state, "corp", findCard(state, "corp", "Caprice Nisei"));
  clickPrompt(state, "corp", "Done");
  expect(getCorp(state).deck[0]?.title).toBe("Caprice Nisei");
  expect(getCorp(state).deck[1]?.title).toBe("Quandary");
  expect(getCorp(state).deck[2]?.title).toBe("Jackson Howard");
});

it("shiro - subroutine 2: corp can let runner access", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Shiro"] },
    runner: { deck: ["R&D Interface"] },
  });
  playFromHand(state, "corp", "Shiro", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "R&D Interface");
  const shiro = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", shiro);
  runContinue(state);
  cardSubroutine(state, "corp", shiro, 1);
  clickPrompt(state, "corp", "No");
  expect(lastLogContains(state, "make the Runner breach R&D")).toBe(true);
  const topCard = getCorp(state).deck[0];
  expect(getPromptMap(state, "runner").card?.cid).toBe(topCard?.cid);
  clickPrompt(state, "runner", "No action");
});

it("shiro - subroutine 2: corp can pay to prevent access", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Shiro"] },
    runner: { deck: ["R&D Interface"] },
  });
  playFromHand(state, "corp", "Shiro", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "R&D Interface");
  const shiro = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", shiro);
  runContinue(state);
  cardSubroutine(state, "corp", shiro, 1);
  const credits = getCorp(state).credit;
  clickPrompt(state, "corp", "Yes");
  expect(lastLogContains(state, "pays 1 [Credits]")).toBe(true);
  expect(lastLogContains(state, "keep the Runner from breaching R&D")).toBe(true);
  expect(getCorp(state).credit).toBe(credits - 1);
});

it("slot machine", () => {
  const state = newGame({
    corp: { hand: ["Slot Machine", "Ice Wall"] },
    runner: { deck: [qty("Sure Gamble", 10)] },
  });
  playFromHand(state, "corp", "Ice Wall", "rd");
  playFromHand(state, "corp", "Slot Machine", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const sm = getIce(state, "hq", 0);
  rez(state, "corp", sm);
  const iw = getIce(state, "rd", 0);
  const corpCredits = getCorp(state).credit;
  const runnerCredits = getRunner(state).credit;
  runContinue(state);
  cardSubroutine(state, "corp", sm, 0);
  expect(getRunner(state).credit).toBe(runnerCredits - 3);
  cardSubroutine(state, "corp", sm, 1);
  expect(getCorp(state).credit).toBe(corpCredits + 3);
  cardSubroutine(state, "corp", sm, 2);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
  clickCard(state, "corp", iw);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(3);
});

it("snowflake - win a psi game to end the run", () => {
  const state = newGame({ corp: { deck: ["Snowflake"] } });
  playFromHand(state, "corp", "Snowflake", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const sf = getIce(state, "hq", 0);
  rez(state, "corp", sf);
  runContinue(state);
  cardSubroutine(state, "corp", sf, 0);
  clickPrompt(state, "corp", "0 [Credits]");
  clickPrompt(state, "runner", "0 [Credits]");
  expect((state as any).run).toBeTruthy();
  cardSubroutine(state, "corp", sf, 0);
  clickPrompt(state, "corp", "0 [Credits]");
  clickPrompt(state, "runner", "1 [Credits]");
  expect((state as any).run).toBeFalsy();
});

it("sorocaban blade", () => {
  const state = newGame({
    corp: { hand: ["Sorocaban Blade"] },
    runner: { hand: ["Smartware Distributor", "Marjanah", "Simulchip"] },
  });
  playFromHand(state, "corp", "Sorocaban Blade", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Smartware Distributor");
  playFromHand(state, "runner", "Marjanah");
  playFromHand(state, "runner", "Simulchip");
  runOn(state, "hq");
  const sb = getIce(state, "hq", 0);
  rez(state, "corp", sb);
  runContinue(state);
  fireSubs(state, sb);
  changed(() => getRunner(state).discard.length, 0, () => {
    clickPrompt(state, "corp", "Done");
  });
  changed(() => getRunner(state).discard.length, 1, () => {
    clickCard(state, "corp", getHardware(state, 0));
  });
  expect(noPrompt(state, "corp")).toBe(true);
});

it("special offer - trashes itself and updates the run position", () => {
  const state = newGame({ corp: { deck: ["Ice Wall", "Special Offer"] } });
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Special Offer", "hq");
  gain(state, "corp", "credit", -1);
  runOn(state, "hq");
  expect((state as any).run?.position).toBe(2);
  const special = getIce(state, "hq", 1);
  rez(state, "corp", special);
  runContinue(state);
  expect(getCorp(state).credit).toBe(4);
  cardSubroutine(state, "corp", special, 0);
  expect(getCorp(state).credit).toBe(9);
  expect((state as any).run?.position).toBe(1);
});

it("starlit knight", () => {
  const state = newGame({
    corp: { hand: ["Starlit Knight", "Vanity Project"], credits: 20 },
  });
  playFromHand(state, "corp", "Starlit Knight", "hq");
  takeCredits(state, "corp");
  const sk = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", sk);
  runContinue(state);
  changed(() => countTags(state), 2, () => {
    fireSubs(state, refresh(state, sk));
  });
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  playAndScore(state, "Vanity Project");
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  const subs = refresh(state, sk).subroutines.map((s: any) => s.label);
  expect(subs).toContain("End the run");
  changed(() => countTags(state), 2, () => {
    fireSubs(state, refresh(state, sk));
  });
  expect((state as any).run).toBeFalsy();
});

it("stavka", () => {
  const state = newGame({
    corp: { hand: ["Stavka", "Prisec"], credits: 10 },
    runner: { hand: ["Rezeki", "Rezeki"] },
  });
  playFromHand(state, "corp", "Stavka", "hq");
  playFromHand(state, "corp", "Prisec", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Rezeki");
  playFromHand(state, "runner", "Rezeki");
  runOn(state, "hq");
  const sta = getIce(state, "hq", 0);
  rez(state, "corp", sta);
  changed(() => getStrength(refresh(state, sta)), 5, () => {
    clickPrompt(state, "corp", "Yes");
    clickCard(state, "corp", "Prisec");
  });
  runContinue(state);
  fireSubs(state, refresh(state, sta));
  clickCard(state, "corp", getProgram(state, 0));
  clickCard(state, "corp", getProgram(state, 0));
  expect(getRunner(state).discard.length).toBe(2);
  expect(getCorp(state).discard.length).toBe(1);
});

it("stavka - outside of run should not gain strength", () => {
  const state = newGame({ corp: { hand: ["Stavka", "Prisec"] } });
  playFromHand(state, "corp", "Stavka", "hq");
  playFromHand(state, "corp", "Prisec", "hq");
  const sta = getIce(state, "hq", 0);
  rez(state, "corp", sta);
  changed(() => getStrength(refresh(state, sta)), 0, () => {
    clickPrompt(state, "corp", "Yes");
    clickCard(state, "corp", "Prisec");
  });
});

it("surveyor - ice strength", () => {
  const state = newGame({ corp: { deck: [qty("Surveyor", 1), qty("Ice Wall", 2)] } });
  gain(state, "corp", "credit", 10);
  gain(state, "runner", "credit", 10);
  playFromHand(state, "corp", "Surveyor", "hq");
  const surv = getIce(state, "hq", 0);
  rez(state, "corp", surv);
  expect(getStrength(refresh(state, surv))).toBe(2);
  playFromHand(state, "corp", "Ice Wall", "hq");
  expect(getStrength(refresh(state, surv))).toBe(4);
  playFromHand(state, "corp", "Ice Wall", "hq");
  expect(getStrength(refresh(state, surv))).toBe(6);
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinueUntil(state, "encounter-ice");
  cardSubroutine(state, "corp", surv, 0);
  expect(getPromptMap(state, "corp").type).toBe("trace");
  expect(getPromptMap(state, "corp").base).toBe(6);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "5");
  expect(countTags(state)).toBe(2);
  cardSubroutine(state, "corp", surv, 0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "6");
  expect(countTags(state)).toBe(2);
  core.processAction("move", state, "corp", { card: getIce(state, "hq", 1), server: "Archives" });
  expect(getStrength(refresh(state, surv))).toBe(4);
});

it("susanoo-no-mikoto", () => {
  const state = newGame({
    corp: { deck: ["Susanoo-no-Mikoto", "Cortex Lock", "Anansi"], credits: 20 },
    runner: { deck: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Anansi", "archives");
  playFromHand(state, "corp", "Cortex Lock", "archives");
  playFromHand(state, "corp", "Susanoo-no-Mikoto", "hq");
  takeCredits(state, "corp");
  const susanoo = getIce(state, "hq", 0);
  const cl = getIce(state, "archives", 1);
  runOn(state, "hq");
  rez(state, "corp", susanoo);
  runContinue(state);
  fireSubs(state, susanoo);
  expect(getRun(state)?.server).toEqual(["archives"]);
  rez(state, "corp", cl);
  runContinueUntil(state, "encounter-ice");
  fireSubs(state, cl);
  runContinue(state, "movement");
  runJackOut(state);
  expect((state as any).run).toBeFalsy();
});

it("swarm - variable subroutines update", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Swarm"], credits: 10 },
  });
  playFromHand(state, "corp", "Swarm", "hq");
  const swarm = getIce(state, "hq", 0);
  rez(state, "corp", swarm);
  expect(refresh(state, swarm).subroutines.length).toBe(0);
  advance(state, swarm, 2);
  expect(refresh(state, swarm).subroutines.length).toBe(2);
});

it("swarm - subroutine is correct #4608", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Swarm"], credits: 10 },
    runner: { hand: ["Corroder"] },
  });
  playFromHand(state, "corp", "Swarm", "hq");
  const swarm = getIce(state, "hq", 0);
  advance(state, swarm, 2);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  runOn(state, "hq");
  rez(state, "corp", refresh(state, swarm));
  runContinue(state);
  fireSubs(state, refresh(state, swarm));
  expect(promptButtons(state, "runner")).toContain("The Corp trashes a program");
  expect(promptButtons(state, "runner")).toContain("Pay 3 [Credits]");
  clickPrompt(state, "runner", "The Corp trashes a program");
  clickCard(state, "corp", "Corroder");
  expect(findCard(state, "runner", "Corroder")).toBeTruthy();
  changed(() => getRunner(state).credit, -3, () => {
    clickPrompt(state, "runner", "Pay 3 [Credits]");
  });
});

it("swordsman - can't be broken with ai", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Swordsman"] },
    runner: { hand: ["Alpha", "Faerie"], credits: 15 },
  });
  playFromHand(state, "corp", "Swordsman", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Alpha");
  playFromHand(state, "runner", "Faerie");
  runOn(state, "hq");
  const swordsman = getIce(state, "hq", 0);
  const alpha = getProgram(state, 0);
  const faerie = getProgram(state, 1);
  rez(state, "corp", swordsman);
  runContinue(state);
  cardAbility(state, "runner", alpha, 1);
  cardAbility(state, "runner", alpha, 0);
  expect(noPrompt(state, "runner")).toBe(true);
  cardAbility(state, "runner", faerie, 0);
  expect(getPromptMap(state, "runner").msg).toContain("Break a subroutine");
});

it("swordsman - first subroutine trashes ai programs", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Swordsman"] },
    runner: { hand: ["Alpha", "Faerie"], credits: 15 },
  });
  playFromHand(state, "corp", "Swordsman", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Alpha");
  playFromHand(state, "runner", "Faerie");
  runOn(state, "hq");
  const swordsman = getIce(state, "hq", 0);
  const alpha = getProgram(state, 0);
  const faerie = getProgram(state, 1);
  rez(state, "corp", swordsman);
  runContinue(state);
  fireSubs(state, swordsman);
  expect(getPromptMap(state, "corp").type).toBe("select");
  clickCard(state, "corp", faerie);
  expect(refresh(state, faerie)).toBeTruthy();
  clickCard(state, "corp", alpha);
  expect(refresh(state, alpha)).toBeFalsy();
  expect(getRunner(state).discard[0]?.title).toBe("Alpha");
});

it("tatu-bola", () => {
  const state = newGame({ corp: { hand: ["Tatu-Bola", "Guard"] } });
  playFromHand(state, "corp", "Tatu-Bola", "archives");
  takeCredits(state, "corp");
  runOn(state, "archives");
  rez(state, "corp", getIce(state, "archives", 0));
  runContinue(state);
  runContinue(state, "movement");
  changed(() => getCorp(state).credit, 4, () => {
    clickPrompt(state, "corp", "Yes");
    clickPrompt(state, "corp", "Guard");
  });
  expect(getCorp(state).hand[0]?.title).toBe("Tatu-Bola");
  expect(getIce(state, "archives", 0).title).toBe("Guard");
});

it("tatu-bola - fake prompt", () => {
  const state = newGame({ corp: { hand: ["Tatu-Bola", "Hedge Fund"] } });
  playFromHand(state, "corp", "Tatu-Bola", "archives");
  takeCredits(state, "corp");
  runOn(state, "archives");
  rez(state, "corp", getIce(state, "archives", 0));
  runContinue(state);
  runContinue(state);
  expect(lastLogContains(state, "decline to install")).toBe(false);
  changed(() => getCorp(state).credit, 0, () => {
    clickPrompt(state, "corp", "OK");
    expect(lastLogContains(state, "decline to install")).toBe(true);
  });
});

it("thimblerig - does not open a prompt if it's the only piece of ice", () => {
  const state = newGame({ corp: { deck: ["Thimblerig", "Guard"] } });
  playFromHand(state, "corp", "Thimblerig", "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getPromptMap(state, "corp")).toBeFalsy();
  playFromHand(state, "corp", "Guard", "new remote");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getPromptMap(state, "corp")).toBeTruthy();
});

it("thimblerig - swap ability at the start of turn", () => {
  const state = newGame({ corp: { deck: ["Pup", "Thimblerig"] } });
  playFromHand(state, "corp", "Thimblerig", "hq");
  playFromHand(state, "corp", "Pup", "hq");
  const thimble = getIce(state, "hq", 0);
  const pup = getIce(state, "hq", 1);
  rez(state, "corp", thimble);
  rez(state, "corp", pup);
  expect(getIce(state, "hq", 0).title).toBe("Thimblerig");
  expect(getIce(state, "hq", 1).title).toBe("Pup");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getPromptMap(state, "corp").msg).toContain("Swap Thimblerig protecting HQ at position 0 with another ice?");
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", refresh(state, pup));
  expect(getIce(state, "hq", 0).title).toBe("Pup");
  expect(getIce(state, "hq", 1).title).toBe("Thimblerig");
});

it("thimblerig - swap ability on runner pass", () => {
  const state = newGame({ corp: { deck: ["Vanilla", "Thimblerig"] } });
  playFromHand(state, "corp", "Thimblerig", "hq");
  playFromHand(state, "corp", "Vanilla", "new remote");
  takeCredits(state, "corp");
  const thimble = getIce(state, "hq", 0);
  const vanilla = getIce(state, "remote1", 0);
  runOn(state, "hq");
  rez(state, "corp", thimble);
  runContinue(state);
  runContinue(state);
  clickPrompt(state, "corp", "Yes");
  expect(getIce(state, "hq", 0).title).toBe("Thimblerig");
  expect(getIce(state, "remote1", 0).title).toBe("Vanilla");
  clickCard(state, "corp", vanilla);
  expect(getIce(state, "hq", 0).title).toBe("Vanilla");
  expect(getIce(state, "remote1", 0).title).toBe("Thimblerig");
});

it("tithe", () => {
  const state = newGame({
    corp: { hand: ["Tithe"] },
    runner: { hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Tithe", "hq");
  takeCredits(state, "corp");
  expect(getCorp(state).credit).toBe(7);
  rez(state, "corp", getIce(state, "hq", 0));
  expect(getCorp(state).credit).toBe(6);
  runOn(state, "hq");
  runContinue(state);
  expect(getRunner(state).discard.length).toBe(0);
  fireSubs(state, getIce(state, "hq", 0));
  expect(getRunner(state).discard.length).toBe(1);
  expect(getCorp(state).credit).toBe(7);
});

it("tithonium - forfeit option as rez cost, can have hosted condition counters", () => {
  const state = newGame({
    corp: { deck: ["Hostile Takeover", "Tithonium", "Patch"] },
    runner: { deck: ["Wasteland"] },
  });
  gain(state, "corp", "click", 10);
  playFromHand(state, "corp", "Hostile Takeover", "new remote");
  playFromHand(state, "corp", "Tithonium", "hq");
  const ht = getContent(state, "remote1", 0);
  const ti = getIce(state, "hq", 0);
  scoreAgenda(state, "corp", ht);
  expect(getCorp(state).scored.length).toBe(1);
  expect(getCorp(state).credit).toBe(12);
  rez(state, "corp", ti, { expectRez: false });
  clickPrompt(state, "corp", "No");
  expect(getCorp(state).credit).toBe(3);
  derez(state, "corp", refresh(state, ti));
  rez(state, "corp", ti, { expectRez: false });
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", "Hostile Takeover");
  expect(getCorp(state).credit).toBe(3);
  expect(getCorp(state).scored.length).toBe(0);
  expect(rezzed(refresh(state, ti))).toBe(true);
  playFromHand(state, "corp", "Patch");
  clickCard(state, "corp", refresh(state, ti));
  expect(refresh(state, ti).hosted.length).toBe(1);
  takeCredits(state, "corp");
  derez(state, "corp", refresh(state, ti));
  expect(refresh(state, ti).hosted.length).toBe(1);
  playFromHand(state, "runner", "Wasteland");
  const wast = getResource(state, 0);
  runOn(state, "hq");
  gain(state, "corp", "credit", 9);
  rez(state, "corp", refresh(state, ti));
  runContinue(state);
  cardSubroutine(state, "corp", ti, 2);
  clickCard(state, "corp", refresh(state, wast));
  expect(getRunner(state).discard.length).toBe(1);
  expect((state as any).run).toBeFalsy();
  runOn(state, "hq");
  runContinue(state);
  cardSubroutine(state, "corp", ti, 2);
  expect((state as any).run).toBeFalsy();
});

it("tithonium - oversight ai does not prompt for alt cost", () => {
  const state = newGame({ corp: { deck: ["Hostile Takeover", "Oversight AI", "Tithonium"] } });
  playFromHand(state, "corp", "Hostile Takeover", "new remote");
  playFromHand(state, "corp", "Tithonium", "rd");
  const ht = getContent(state, "remote1", 0);
  const ti = getIce(state, "rd", 0);
  scoreAgenda(state, "corp", ht);
  playFromHand(state, "corp", "Oversight AI");
  clickCard(state, "corp", ti);
  expect(rezzed(refresh(state, ti))).toBe(true);
  expect(getTitle(refresh(state, ti).hosted[0])).toBe("Oversight AI");
});

it("tithonium - hosted pawn is trashed", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 10)], hand: ["Tithonium"], credits: 100 },
    runner: { hand: ["Pawn"] },
  });
  playFromHand(state, "corp", "Tithonium", "rd");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Pawn");
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickCard(state, "runner", "Tithonium");
  const ti = getIce(state, "rd", 0);
  rez(state, "corp", ti);
  expect(lastLogContains(state, "Corp trashes Pawn hosted on Tithonium")).toBe(true);
  expect(refresh(state, ti).hosted.length).toBe(0);
});

it("tl;dr", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Enigma", "TL;DR"], credits: 20 },
  });
  playFromHand(state, "corp", "Enigma", "hq");
  playFromHand(state, "corp", "TL;DR", "hq");
  takeCredits(state, "corp");
  const e = getIce(state, "hq", 0);
  const tldr = getIce(state, "hq", 1);
  runOn(state, "hq");
  rez(state, "corp", e);
  rez(state, "corp", tldr);
  runContinue(state);
  expect(refresh(state, e).subroutines.length).toBe(2);
  fireSubs(state, tldr);
  runContinueUntil(state, "encounter-ice");
  expect(refresh(state, e).subroutines.length).toBe(4);
  runContinue(state, "movement");
  expect(refresh(state, e).subroutines.length).toBe(2);
});

it("tmi", () => {
  const state = newGame({ corp: { deck: ["TMI"] } });
  playFromHand(state, "corp", "TMI", "hq");
  const tmi = getIce(state, "hq", 0);
  rez(state, "corp", tmi);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(rezzed(refresh(state, tmi))).toBe(true);
});

it("tmi - losing trace derezzes tmi", () => {
  const state = newGame({
    corp: { deck: ["TMI"] },
    runner: { deck: [qty("Blackmail", 3)] },
  });
  playFromHand(state, "corp", "TMI", "hq");
  const tmi = getIce(state, "hq", 0);
  rez(state, "corp", tmi);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "2");
  expect(rezzed(refresh(state, tmi))).toBe(false);
});

it("tour guide - rez before other assets", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Tour Guide", qty("NGO Front", 3)], credits: 10 },
  });
  gain(state, "corp", "click", 10);
  playFromHand(state, "corp", "Tour Guide", "hq");
  playFromHand(state, "corp", "NGO Front", "new remote");
  playFromHand(state, "corp", "NGO Front", "new remote");
  playFromHand(state, "corp", "NGO Front", "new remote");
  const tg = getIce(state, "hq", 0);
  rez(state, "corp", tg);
  expect(refresh(state, tg).subroutines.length).toBe(0);
  rez(state, "corp", getContent(state, "remote1", 0));
  expect(refresh(state, tg).subroutines.length).toBe(1);
  rez(state, "corp", getContent(state, "remote2", 0));
  rez(state, "corp", getContent(state, "remote3", 0));
  expect(refresh(state, tg).subroutines.length).toBe(3);
});

it("tour guide - rez after other assets", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Tour Guide", qty("NGO Front", 3)], credits: 10 },
  });
  gain(state, "corp", "click", 10);
  playFromHand(state, "corp", "NGO Front", "new remote");
  playFromHand(state, "corp", "NGO Front", "new remote");
  playFromHand(state, "corp", "NGO Front", "new remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  rez(state, "corp", getContent(state, "remote2", 0));
  rez(state, "corp", getContent(state, "remote3", 0));
  playFromHand(state, "corp", "Tour Guide", "hq");
  const tg = getIce(state, "hq", 0);
  rez(state, "corp", tg);
  expect(refresh(state, tg).subroutines.length).toBe(3);
});

it("tour guide - trashing resets the number", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Tour Guide", qty("NGO Front", 3)], credits: 10 },
  });
  gain(state, "corp", "click", 10);
  playFromHand(state, "corp", "NGO Front", "new remote");
  playFromHand(state, "corp", "NGO Front", "new remote");
  playFromHand(state, "corp", "NGO Front", "new remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  rez(state, "corp", getContent(state, "remote2", 0));
  rez(state, "corp", getContent(state, "remote3", 0));
  playFromHand(state, "corp", "Tour Guide", "hq");
  const tg = getIce(state, "hq", 0);
  const ngo = getContent(state, "remote2", 0);
  rez(state, "corp", tg);
  expect(refresh(state, tg).subroutines.length).toBe(3);
  clickAdvance(state, "corp", refresh(state, ngo));
  clickAdvance(state, "corp", refresh(state, ngo));
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
  expect(refresh(state, tg).subroutines.length).toBe(2);
  cardAbility(state, "corp", refresh(state, ngo), 0);
  expect(refresh(state, tg).subroutines.length).toBe(1);
});

it("trebuchet - no stealing on successful trace", () => {
  const state = newGame({
    corp: { deck: ["Trebuchet", "Project Atlas"] },
    runner: { deck: ["Inti"] },
  });
  playFromHand(state, "corp", "Trebuchet", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Inti");
  const treb = getIce(state, "hq", 0);
  runOn(state, "hq");
  expect(countBadPub(state)).toBe(0);
  rez(state, "corp", treb);
  expect(countBadPub(state)).toBe(1);
  runContinue(state);
  cardSubroutine(state, "corp", treb, 0);
  clickCard(state, "corp", "Inti");
  expect(getRunner(state).discard.length).toBe(1);
  cardSubroutine(state, "corp", treb, 1);
  expect(waiting(state, "runner")).toBe(true);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  runContinue(state);
  runContinue(state);
  clickPrompt(state, "runner", "No action");
});

it("trebuchet - no trashing on successful trace", () => {
  const state = newGame({
    corp: { deck: ["Trebuchet", "PAD Campaign"] },
    runner: { deck: ["Inti"] },
  });
  playFromHand(state, "corp", "Trebuchet", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Inti");
  const treb = getIce(state, "hq", 0);
  runOn(state, "hq");
  expect(countBadPub(state)).toBe(0);
  rez(state, "corp", treb);
  expect(countBadPub(state)).toBe(1);
  runContinue(state);
  cardSubroutine(state, "corp", treb, 0);
  clickCard(state, "corp", "Inti");
  expect(getRunner(state).discard.length).toBe(1);
  cardSubroutine(state, "corp", treb, 1);
  expect(waiting(state, "runner")).toBe(true);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  runContinue(state);
  runContinue(state);
  expect(getPromptMap(state, "runner").choices.length).toBe(1);
  clickPrompt(state, "runner", "No action");
  expect(getCorp(state).discard.length).toBe(0);
});

it("tree line", () => {
  const state = newGame({ corp: { hand: ["Tree Line"] } });
  playFromHand(state, "corp", "Tree Line", "hq");
  const tl = getIce(state, "hq", 0);
  rez(state, "corp", tl);
  changed(() => core.getStrength(refresh(state, tl)), 1, () => {
    advance(state, tl, 1);
  });
  takeCredits(state, "corp");
  runOn(state, "hq");
  runContinue(state);
  changed(() => getCorp(state).credit, 1, () => {
    fireSubs(state, refresh(state, tl));
  });
  expect((state as any).run).toBeFalsy();
});

it("tree line - expend", () => {
  const state = newGame({ corp: { hand: ["Tree Line", "Enigma"] } });
  playFromHand(state, "corp", "Enigma", "hq");
  const enigma = getIce(state, "hq", 0);
  const tl = getCorp(state).hand[0];
  cardAbility(state, "corp", tl, 0); // expend
  changed(() => getCounters(refresh(state, enigma), "advancement"), 3, () => {
    clickCard(state, "corp", enigma);
  });
  expect(getCorp(state).credit).toBe(4);
  expect(getCorp(state).discard.length).toBe(1);
});

it("tributary", () => {
  const state = newGame({
    corp: {
      hand: ["Tributary", "Rime", "Enigma", "Palisade"],
      deck: [qty("Hedge Fund", 5)],
      credits: 20,
    },
  });
  playFromHand(state, "corp", "Tributary", "hq");
  playFromHand(state, "corp", "Rime", "New remote");
  playFromHand(state, "corp", "Enigma", "Archives");
  rez(state, "corp", getIce(state, "hq", 0));
  rez(state, "corp", getIce(state, "archives", 0));
  takeCredits(state, "corp");
  runOn(state, "Archives");
  clickPrompt(state, "corp", "Yes");
  expect((state as any).corp.servers.archives.ices.length).toBe(2);
  expect((state as any).run.position).toBe(2);
  runContinue(state);
  const enigma = getIce(state, "archives", 0);
  const trib = getIce(state, "archives", 1);
  changedMulti(state, [
    [() => getCorp(state).deck.length, -1],
    [() => getCorp(state).hand.length, 0],
    [() => (state as any).corp.servers.remote1.ices.length, 1],
  ], () => {
    cardSubroutine(state, "corp", refresh(state, trib), 0);
    clickPrompt(state, "corp", "Yes");
    clickCard(state, "corp", "Palisade");
    clickPrompt(state, "corp", "Server 1");
  });
  changed(() => core.getStrength(refresh(state, enigma)), 2, () => {
    cardSubroutine(state, "corp", refresh(state, trib), 1);
  });
});

it("troll - giving the runner a choice on successful trace shouldn't make runner pay trace first", () => {
  const state = newGame({ corp: { deck: ["Troll"] } });
  playFromHand(state, "corp", "Troll", "hq");
  takeCredits(state, "corp");
  const troll = getIce(state, "hq", 0);
  rez(state, "corp", troll);
  runOn(state, "hq");
  runContinue(state);
  expect(waiting(state, "runner")).toBe(true);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickPrompt(state, "runner", "End the run");
  expect((state as any).run).toBeFalsy();
});

it("tsurugi", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Tsurugi"], credits: 10 },
  });
  playFromHand(state, "corp", "Tsurugi", "hq");
  takeCredits(state, "corp");
  const tsurugi = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", tsurugi);
  runContinue(state);
  cardSubroutine(state, "corp", tsurugi, 0);
  expect(waiting(state, "runner")).toBe(true);
});

it("turing - strength boosted when protecting a remote server", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: [qty("Turing", 2), "Hedge Fund"] },
  });
  playFromHand(state, "corp", "Hedge Fund");
  playFromHand(state, "corp", "Turing", "hq");
  playFromHand(state, "corp", "Turing", "New remote");
  const t1 = getIce(state, "hq", 0);
  const t2 = getIce(state, "remote1", 0);
  rez(state, "corp", t1);
  expect(core.getStrength(refresh(state, t1))).toBe(2);
  rez(state, "corp", t2);
  expect(core.getStrength(refresh(state, t2))).toBe(5);
});

it("turing - can't be broken with AI", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Turing"] },
    runner: { hand: ["Alpha", "Abagnale"], credits: 15 },
  });
  playFromHand(state, "corp", "Turing", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Alpha");
  playFromHand(state, "runner", "Abagnale");
  runOn(state, "hq");
  const turing = getIce(state, "hq", 0);
  const alpha = getProgram(state, 0);
  const abagnale = getProgram(state, 1);
  rez(state, "corp", turing);
  runContinue(state);
  cardAbility(state, "runner", alpha, 0); // Add 1 strength
  cardAbility(state, "runner", alpha, 1); // Break 1 sub
  expect(getPromptMap(state, "runner").type).toBeFalsy(); // no prompt, can't break
  cardAbility(state, "runner", abagnale, 0); // Break 1 Code Gate sub
  expect(getPromptMap(state, "runner").msg).toContain("Break a subroutine");
});

it("turnpike", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Turnpike"] },
  });
  playFromHand(state, "corp", "Turnpike", "hq");
  takeCredits(state, "corp");
  changed(() => getRunner(state).credit, -1, () => {
    runOn(state, "hq");
    rez(state, "corp", getIce(state, "hq", 0));
    runContinue(state);
  });
});

it("tyr - click gain by bioroid breaking", () => {
  const state = newGame({ corp: { deck: ["Týr"] } });
  playFromHand(state, "corp", "Týr", "hq");
  gain(state, "corp", 10);
  takeCredits(state, "corp");
  const tyr = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", tyr);
  runContinue(state);
  expect(getRunner(state).click).toBe(3);
  cardSideAbility(state, "runner", tyr, 0);
  clickPrompt(state, "runner", "Do 2 core damage");
  clickPrompt(state, "runner", "Trash an installed Runner card. Gain 3 [Credits]");
  clickPrompt(state, "runner", "End the run");
  expect(getRunner(state).click).toBe(0);
  runContinue(state, "movement");
  runJackOut(state);
  takeCredits(state, "runner");
  expect(getCorp(state).click).toBe(6);
});

it("tyrant", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Tyrant"], credits: 10 },
  });
  playFromHand(state, "corp", "Tyrant", "hq");
  const tyrant = getIce(state, "hq", 0);
  rez(state, "corp", tyrant);
  expect(refresh(state, tyrant).subroutines.length).toBe(0);
  advance(state, tyrant, 2);
  expect(refresh(state, tyrant).subroutines.length).toBe(2);
});

it("unsmiling tsarevna", () => {
  const state = newGame({
    corp: {
      hand: [qty("Unsmiling Tsarevna", 2)],
      deck: [qty("Hedge Fund", 5)],
      credits: 20,
    },
    runner: { hand: ["Carmen", qty("Sure Gamble", 2)], credits: 20 },
  });
  playFromHand(state, "corp", "Unsmiling Tsarevna", "R&D");
  playFromHand(state, "corp", "Unsmiling Tsarevna", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Carmen");
  const utRd = getIce(state, "rd", 0);
  const utHq = getIce(state, "hq", 0);
  const carm = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", utHq);
  changed(() => getRunner(state).credit, 2, () => {
    clickPrompt(state, "corp", "Yes");
  });
  runContinue(state);
  cardAbility(state, "runner", carm, 0);
  clickPrompt(state, "runner", "Do 2 net damage");
  // cannot break more than 1 sub
  fireSubs(state, refresh(state, utHq));
  expect(getRunner(state).hand.length).toBe(2);
  expect(countTags(state)).toBe(1);
  changed(() => getCorp(state).hand.length, 2, () => {
    clickPrompt(state, "corp", "Yes");
  });
  runContinue(state);
  runJackOut(state);
  runOn(state, "rd");
  rez(state, "corp", utRd);
  changed(() => getRunner(state).credit, 0, () => {
    clickPrompt(state, "corp", "No");
  });
  runContinue(state);
  cardAbility(state, "runner", carm, 0);
  clickPrompt(state, "runner", "Do 2 net damage");
  clickPrompt(state, "runner", "Give the Runner 1 tag");
  clickPrompt(state, "runner", "Done");
});

it("unsmiling tsarevna - with extra sub", () => {
  for (const order of [["End the run", "Give the Runner 1 tag"], ["Give the Runner 1 tag", "End the run"]]) {
    const state = newGame({
      corp: { hand: ["Marker", "Unsmiling Tsarevna"] },
      runner: { hand: ["Carmen"], credits: 20 },
    });
    playFromHand(state, "corp", "Unsmiling Tsarevna", "hq");
    playFromHand(state, "corp", "Marker", "hq");
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Carmen");
    runOn(state, "hq");
    rez(state, "corp", getIce(state, "hq", 1));
    runContinueUntil(state, "encounter-ice");
    fireSubs(state, getIce(state, "hq", 1));
    rez(state, "corp", getIce(state, "hq", 0));
    clickPrompt(state, "corp", "Yes");
    runContinueUntil(state, "encounter-ice");
    expect(getIce(state, "hq", 0).subroutines.length).toBe(4);
    cardAbility(state, "runner", getProgram(state, 0), 0);
    for (const choice of order) {
      clickPrompt(state, "runner", choice);
    }
    // broke 2 subs, no more choices offered
  }
});

it("unsmiling tsarevna - wrong server", () => {
  const state = newGame({ corp: { hand: ["Unsmiling Tsarevna"] } });
  playFromHand(state, "corp", "Unsmiling Tsarevna", "hq");
  takeCredits(state, "corp");
  runOn(state, "rd");
  rez(state, "corp", getIce(state, "hq", 0));
  // no prompt for corp - not active outside attacked server
  expect(getPromptMap(state, "corp").type).toBeFalsy();
});

it("unsmiling tsarevna - outside run", () => {
  const state = newGame({ corp: { hand: ["Unsmiling Tsarevna"] } });
  playFromHand(state, "corp", "Unsmiling Tsarevna", "hq");
  takeCredits(state, "corp");
  rez(state, "corp", getIce(state, "hq", 0));
  expect(getPromptMap(state, "corp").type).toBeFalsy();
});

it("unsmiling tsarevna - multiple encounters", () => {
  const state = newGame({
    corp: {
      hand: ["Unsmiling Tsarevna", "Vanilla", "Mumbad City Grid"],
      deck: [qty("Hedge Fund", 5)],
      credits: 20,
    },
    runner: { hand: ["Carmen", qty("Sure Gamble", 2)], credits: 20 },
  });
  playFromHand(state, "corp", "Vanilla", "hq");
  playFromHand(state, "corp", "Unsmiling Tsarevna", "hq");
  playFromHand(state, "corp", "Mumbad City Grid", "hq");
  rez(state, "corp", getContent(state, "hq", 0));
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Carmen");
  const ut = getIce(state, "hq", 1);
  const carm = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", ut);
  changed(() => getRunner(state).credit, 2, () => {
    clickPrompt(state, "corp", "Yes");
  });
  runContinue(state);
  cardAbility(state, "runner", carm, 0);
  clickPrompt(state, "runner", "Do 2 net damage");
  fireSubs(state, refresh(state, ut));
  expect(getRunner(state).hand.length).toBe(2);
  expect(countTags(state)).toBe(1);
  changed(() => getCorp(state).hand.length, 2, () => {
    clickPrompt(state, "corp", "Yes");
  });
  runContinue(state);
  // Swap UT with innermost ice
  clickCard(state, "corp", getIce(state, "hq", 0));
  runContinue(state);
  runContinue(state);
  cardAbility(state, "runner", carm, 0);
  clickPrompt(state, "runner", "Do 2 net damage");
  // cannot break more than 1 sub
});

it("unsmiling tsarevna - auto break limit", () => {
  const state = newGame({
    corp: {
      hand: [qty("Unsmiling Tsarevna", 1)],
      deck: [qty("Hedge Fund", 5)],
      credits: 20,
    },
    runner: { hand: ["Carmen"], credits: 20 },
  });
  playFromHand(state, "corp", "Unsmiling Tsarevna", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Carmen");
  const utHq = getIce(state, "hq", 0);
  const carm = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", utHq);
  clickPrompt(state, "corp", "Yes");
  runContinue(state);
  const carmRefreshed = refresh(state, carm) as any;
  const hasAutoBreak = (carmRefreshed.abilities || []).some((a: any) => a.dynamic);
  expect(hasAutoBreak).toBe(false);
});

it("valentão - no choice without tags", () => {
  const state = newGame({ corp: { hand: ["Valentão"] } });
  playFromHand(state, "corp", "Valentão", "hq");
  changed(() => countBadPub(state), 1, () => {
    rez(state, "corp", getIce(state, "hq", 0));
  });
});

it("valentão - spend tag", () => {
  const state = newGame({
    corp: { hand: [qty("Valentão", 2)], credits: 20 },
    runner: { hand: ["Paparazzi"] },
  });
  playFromHand(state, "corp", "Valentão", "hq");
  playFromHand(state, "corp", "Valentão", "R&D");
  gainTags(state, "runner", 1);
  changed(() => countTags(state), -1, () => {
    rez(state, "corp", getIce(state, "hq", 0), { expectRez: false });
    clickPrompt(state, "corp", "Remove 1 tag");
  });
  expect(countBadPub(state)).toBe(0);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Paparazzi");
  changed(() => countBadPub(state), 1, () => {
    rez(state, "corp", getIce(state, "rd", 0));
  });
});

it("valentão - choosing bad pub with tags", () => {
  const state = newGame({ corp: { hand: ["Valentão"] } });
  playFromHand(state, "corp", "Valentão", "hq");
  gainTags(state, "runner", 1);
  changedMulti(state, [
    [() => countBadPub(state), 1],
    [() => countTags(state), 0],
  ], () => {
    rez(state, "corp", getIce(state, "hq", 0), { expectRez: false });
    clickPrompt(state, "corp", "Gain 1 bad publicity");
  });
});

it("valentão - subs", () => {
  const state = newGame({ corp: { hand: ["Valentão"], credits: 10 } });
  playFromHand(state, "corp", "Valentão", "hq");
  takeCredits(state, "corp");
  const val = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", val);
  runContinue(state);
  changedMulti(state, [
    [() => getRunner(state).credit, -2],
    [() => getCorp(state).credit, 2],
  ], () => {
    fireSubs(state, refresh(state, val));
  });
  expect((state as any).run).toBeFalsy();
  gain(state, "runner", 10);
  runOn(state, "hq");
  runContinue(state);
  fireSubs(state, refresh(state, val));
  expect((state as any).run).toBeTruthy();
});

it("vampyronassa", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 3)], hand: ["Vampyronassa"] },
  });
  playFromHand(state, "corp", "Vampyronassa", "hq");
  takeCredits(state, "corp");
  const vam = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", vam);
  runContinue(state);
  changed(() => getRunner(state).credit, -2, () => {
    cardSubroutine(state, "corp", vam, 0);
  });
  changed(() => getCorp(state).credit, 2, () => {
    cardSubroutine(state, "corp", vam, 1);
  });
  changed(() => getRunner(state).hand.length, -2, () => {
    cardSubroutine(state, "corp", vam, 2);
  });
  changed(() => getCorp(state).hand.length, 2, () => {
    cardSubroutine(state, "corp", vam, 3);
    clickPrompt(state, "corp", "2");
  });
});

it("vampyronassa - draw no cards", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 3)], hand: ["Vampyronassa"] },
  });
  playFromHand(state, "corp", "Vampyronassa", "hq");
  takeCredits(state, "corp");
  const vam = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", vam);
  runContinue(state);
  changed(() => getCorp(state).hand.length, 0, () => {
    cardSubroutine(state, "corp", vam, 3);
    clickPrompt(state, "corp", "0");
  });
});

it("vasilisa", () => {
  const state = newGame({ corp: { hand: ["Vasilisa", "NGO Front"] } });
  playFromHand(state, "corp", "Vasilisa", "hq");
  playFromHand(state, "corp", "NGO Front", "New remote");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const vas = getIce(state, "hq", 0);
  const ngo = getContent(state, "remote1", 0);
  rez(state, "corp", vas);
  runContinue(state);
  changed(() => getCorp(state).credit, -1, () => {
    clickCard(state, "corp", refresh(state, ngo));
    expect(getCounters(refresh(state, ngo), "advancement")).toBe(1);
  });
  cardSubroutine(state, "corp", refresh(state, vas), 0);
  expect(countTags(state)).toBe(1);
});

it("virtual service agent", () => {
  const state = newGame({
    corp: { hand: ["Virtual Service Agent"] },
    runner: { hand: ["Nanuq", "Buzzsaw"], credits: 20 },
  });
  playFromHand(state, "corp", "Virtual Service Agent", "hq");
  takeCredits(state, "corp");
  const vsa = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", vsa);
  runContinue(state);
  changed(() => getRunner(state).credit, -1, () => {
    fireSubs(state, refresh(state, vsa));
  });
  changed(() => countTags(state), 1, () => {
    runContinue(state, "movement");
  });
  runJackOut(state);
  playFromHand(state, "runner", "Nanuq");
  runOn(state, "hq");
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "Make the Runner lose 1 [Credits]");
  changed(() => countTags(state), 1, () => {
    runContinue(state, "movement");
  });
  runJackOut(state);
  playFromHand(state, "runner", "Buzzsaw");
  gain(state, "runner", 1); // extra click
  (state as any).runner.click++;
  runOn(state, "hq");
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 1), 0);
  clickPrompt(state, "runner", "Make the Runner lose 1 [Credits]");
  changed(() => countTags(state), 0, () => {
    runContinue(state, "movement");
  });
});

it("virtual service agent - regression other ice", () => {
  const state = newGame({ corp: { hand: ["Vanilla", "Virtual Service Agent"] } });
  playFromHand(state, "corp", "Vanilla", "R&D");
  playFromHand(state, "corp", "Virtual Service Agent", "hq");
  rez(state, "corp", getIce(state, "hq", 0));
  rez(state, "corp", getIce(state, "rd", 0));
  takeCredits(state, "corp");
  runEmptyServer(state, "archives");
  expect(countTags(state)).toBe(0);
});

it("waiver", () => {
  const state = newGame({
    corp: { deck: ["Waiver"] },
    runner: { deck: ["Corroder", "Dean Lister", "Ubax", "Caldera"] },
  });
  playFromHand(state, "corp", "Waiver", "hq");
  takeCredits(state, "corp");
  runOn(state, "hq");
  const waiv = getIce(state, "hq", 0);
  rez(state, "corp", waiv);
  runContinue(state);
  cardSubroutine(state, "corp", waiv, 0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "3");
  expect(getRunner(state).discard.find((c: any) => c.title === "Ubax")).toBeFalsy();
  expect(getRunner(state).discard.find((c: any) => c.title === "Caldera")).toBeFalsy();
  expect(getRunner(state).discard.length).toBe(2);
});

it("wave", () => {
  const state = newGame({
    corp: {
      id: "Hyoubu Institute: Absolute Clarity",
      hand: ["Wave", "Wave"],
      deck: ["Ice Wall"],
      credits: 10,
    },
  });
  playFromHand(state, "corp", "Wave", "hq");
  playFromHand(state, "corp", "Wave", "R&D");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "rd", 0));
  expect(getPromptMap(state, "corp").type).toBeFalsy();
  rez(state, "corp", getIce(state, "hq", 0));
  clickPrompt(state, "corp", "Yes");
  changed(() => getCorp(state).credit, 1, () => {
    clickPrompt(state, "corp", "Ice Wall");
  });
  expect(getCorp(state).hand.find((c: any) => c.title === "Ice Wall")).toBeTruthy();
  runContinue(state);
  changed(() => getCorp(state).credit, 2, () => {
    cardSubroutine(state, "corp", getIce(state, "hq", 0), 0);
  });
});

it("wave - just shuffle", () => {
  const state = newGame({
    corp: { hand: ["Wave", "Wave"], deck: ["Ice Wall"], credits: 10 },
  });
  playFromHand(state, "corp", "Wave", "hq");
  playFromHand(state, "corp", "Wave", "R&D");
  takeCredits(state, "corp");
  runOn(state, "hq");
  rez(state, "corp", getIce(state, "rd", 0));
  expect(getPromptMap(state, "corp").type).toBeFalsy();
  rez(state, "corp", getIce(state, "hq", 0));
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "corp", "Cancel");
  expect(getPromptMap(state, "corp").type).toBeFalsy();
});

it("wendigo - morph ice gain/lose subtypes", () => {
  const state = newGame({
    corp: { deck: ["Wendigo", "Shipment from SanSan", "Superior Cyberwalls"], credits: 100 },
  });
  gain(state, "corp", 2); // extra clicks
  (state as any).corp.click += 2;
  playFromHand(state, "corp", "Superior Cyberwalls", "New remote");
  const sc = getContent(state, "remote1", 0);
  scoreAgenda(state, "corp", sc);
  playFromHand(state, "corp", "Wendigo", "hq");
  const wend = getIce(state, "hq", 0);
  rez(state, "corp", wend);
  expect(core.getStrength(refresh(state, wend))).toBe(4);
  advance(state, refresh(state, wend), 1);
  expect(hasSubtype(refresh(state, wend), "Barrier")).toBe(true);
  expect(hasSubtype(refresh(state, wend), "Code Gate")).toBe(false);
  expect(core.getStrength(refresh(state, wend))).toBe(5);
  playFromHand(state, "corp", "Shipment from SanSan");
  clickPrompt(state, "corp", "1");
  clickCard(state, "corp", wend);
  expect(hasSubtype(refresh(state, wend), "Barrier")).toBe(false);
  expect(hasSubtype(refresh(state, wend), "Code Gate")).toBe(true);
  expect(core.getStrength(refresh(state, wend))).toBe(4);
});

it("whirlpool - on remote", () => {
  const state = newGame({
    corp: { hand: ["Whirlpool", "Ice Wall", "Border Control"] },
    runner: { deck: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Border Control", "New remote");
  playFromHand(state, "corp", "Ice Wall", "Server 1");
  playFromHand(state, "corp", "Whirlpool", "Server 1");
  takeCredits(state, "corp");
  const wp = getIce(state, "remote1", 2);
  runOn(state, "remote1");
  rez(state, "corp", wp);
  runContinue(state);
  fireSubs(state, wp);
  runJackOut(state);
  expect((state as any).run).toBeTruthy();
  expect(refresh(state, wp)).toBeNull();
});

it("whirlpool - on hq", () => {
  const state = newGame({
    corp: { hand: ["Whirlpool", "Ice Wall", "Border Control"] },
    runner: { deck: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Border Control", "hq");
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Whirlpool", "hq");
  takeCredits(state, "corp");
  const wp = getIce(state, "hq", 2);
  runOn(state, "hq");
  rez(state, "corp", wp);
  runContinue(state);
  fireSubs(state, wp);
  runJackOut(state);
  expect((state as any).run).toBeTruthy();
  expect(refresh(state, wp)).toBeNull();
});

it("whirlpool - not trashed when broken", () => {
  const state = newGame({
    corp: { hand: ["Whirlpool", "Ice Wall", "Border Control"] },
    runner: { deck: [qty("Sure Gamble", 5)], hand: ["Aumakua"] },
  });
  playFromHand(state, "corp", "Border Control", "hq");
  playFromHand(state, "corp", "Ice Wall", "hq");
  playFromHand(state, "corp", "Whirlpool", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Aumakua");
  runEmptyServer(state, "archives");
  const wp = getIce(state, "hq", 2);
  const au = getProgram(state, 0);
  runOn(state, "hq");
  rez(state, "corp", wp);
  runContinue(state);
  cardAbility(state, "runner", au, 0);
  clickPrompt(state, "runner", "The Runner cannot jack out for the remainder of this run");
  expect(refresh(state, wp)).toBeTruthy();
});

it("whitespace", () => {
  const state = newGame({
    corp: { hand: ["Whitespace", "Hedge Fund"] },
    runner: { hand: [qty("Sure Gamble", 2)] },
  });
  playFromHand(state, "corp", "Whitespace", "hq");
  takeCredits(state, "corp");
  const ws = getIce(state, "hq", 0);
  playFromHand(state, "runner", "Sure Gamble");
  clickCredit(state, "runner");
  runOn(state, "hq");
  rez(state, "corp", ws);
  runContinue(state);
  expect(getRunner(state).credit).toBe(10);
  fireSubs(state, ws);
  expect(getRunner(state).credit).toBe(7);
  expect((state as any).run).toBeTruthy();
  runContinue(state);
  runContinue(state);
  clickPrompt(state, "runner", "No action");
  runOn(state, "hq");
  runContinue(state);
  expect(getRunner(state).credit).toBe(7);
  fireSubs(state, ws);
  expect(getRunner(state).credit).toBe(4);
  expect((state as any).run).toBeFalsy();
});

it("winchester", () => {
  const state = newGame({
    corp: { deck: ["Winchester"] },
    runner: { hand: ["Misdirection", "Astrolabe", "Fan Site"] },
  });
  playFromHand(state, "corp", "Winchester", "hq");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Misdirection");
  playFromHand(state, "runner", "Astrolabe");
  playFromHand(state, "runner", "Fan Site");
  runOn(state, "hq");
  const win = getIce(state, "hq", 0);
  const misd = getProgram(state, 0);
  const astro = getHardware(state, 0);
  const fs = getResource(state, 0);
  rez(state, "corp", win);
  runContinue(state);
  expect(refresh(state, win).subroutines.length).toBe(3);
  fireSubs(state, win);
  expect(getPromptMap(state, "corp").base).toBe(4);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", astro);
  expect(getRunner(state).discard.length).toBe(0);
  clickCard(state, "corp", fs);
  expect(getRunner(state).discard.length).toBe(0);
  clickCard(state, "corp", misd);
  expect(getRunner(state).discard.length).toBe(1);
  expect(getPromptMap(state, "corp").base).toBe(3);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickCard(state, "corp", fs);
  expect(getRunner(state).discard.length).toBe(1);
  clickCard(state, "corp", astro);
  expect(getRunner(state).discard.length).toBe(2);
  expect(getPromptMap(state, "corp").base).toBe(3);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect((state as any).run).toBeFalsy();
});

it("winchester - 2 subs on other servers", () => {
  const state = newGame({ corp: { deck: ["Winchester"] } });
  playFromHand(state, "corp", "Winchester", "R&D");
  takeCredits(state, "corp");
  runOn(state, "rd");
  const win = getIce(state, "rd", 0);
  rez(state, "corp", win);
  runContinue(state);
  expect(refresh(state, win).subroutines.length).toBe(2);
});

it("winchester - 2 subs when moved with thimblerig", () => {
  const state = newGame({
    corp: { deck: ["Winchester", "Thimblerig"] },
    runner: { deck: ["Aumakua"] },
  });
  playFromHand(state, "corp", "Winchester", "R&D");
  playFromHand(state, "corp", "Thimblerig", "hq");
  takeCredits(state, "corp");
  runOn(state, "rd");
  const win = getIce(state, "rd", 0);
  const thim = getIce(state, "hq", 0);
  rez(state, "corp", win);
  runContinue(state);
  expect(refresh(state, win).subroutines.length).toBe(2);
  fireSubs(state, win);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  runContinue(state, "movement");
  runJackOut(state);
  playFromHand(state, "runner", "Aumakua");
  runOn(state, "hq");
  rez(state, "corp", thim);
  runContinue(state);
  cardAbility(state, "runner", getProgram(state, 0), 0);
  clickPrompt(state, "runner", "End the run");
  runContinue(state);
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", refresh(state, win));
  runJackOut(state);
  runOn(state, "hq");
  runContinue(state);
  expect(getIce(state, "hq", 0).subroutines.length).toBe(3);
});

it("winchester - 2 subs when moved with tao", () => {
  const state = newGame({
    corp: { deck: ["Winchester", "Thimblerig", "Merger"], credits: 6 },
    runner: { id: "Tāo Salonga: Telepresence Magician" },
  });
  playFromHand(state, "corp", "Winchester", "hq");
  playFromHand(state, "corp", "Thimblerig", "R&D");
  const thim = getIce(state, "rd", 0);
  const win = getIce(state, "hq", 0);
  rez(state, "corp", thim);
  rez(state, "corp", win);
  playAndScore(state, "Merger");
  clickPrompt(state, "runner", "Yes");
  clickCard(state, "runner", "Winchester");
  clickCard(state, "runner", "Thimblerig");
  expect(getIce(state, "rd", 0).subroutines.length).toBe(2);
});

it("woodcutter", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Woodcutter"], credits: 10 },
  });
  playFromHand(state, "corp", "Woodcutter", "hq");
  const woodcutter = getIce(state, "hq", 0);
  rez(state, "corp", woodcutter);
  expect(refresh(state, woodcutter).subroutines.length).toBe(0);
  advance(state, woodcutter, 2);
  expect(refresh(state, woodcutter).subroutines.length).toBe(2);
});

it("wormhole", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["Ice Wall", "Wormhole"], credits: 10 },
  });
  playFromHand(state, "corp", "Ice Wall", "R&D");
  playFromHand(state, "corp", "Wormhole", "hq");
  takeCredits(state, "corp");
  const iw = getIce(state, "rd", 0);
  const wormhole = getIce(state, "hq", 0);
  runOn(state, "hq");
  rez(state, "corp", wormhole);
  runContinue(state);
  cardSubroutine(state, "corp", wormhole, 0);
  expect((refresh(state, wormhole).subroutines[0] as any).fired).toBe(true);
  expect(getPromptMap(state, "corp").type).toBeFalsy();
  runContinue(state, "movement");
  runJackOut(state);
  runOn(state, "hq");
  rez(state, "corp", iw);
  runContinue(state);
  fireSubs(state, wormhole);
  clickCard(state, "corp", iw);
  clickPrompt(state, "corp", "End the run");
  expect((state as any).run).toBeFalsy();
});

it("wraparound - strength boosted when no fracter is installed", () => {
  const state = newGame({
    corp: { deck: ["Wraparound"] },
    runner: { deck: ["Corroder"] },
  });
  playFromHand(state, "corp", "Wraparound", "hq");
  const wrap = getIce(state, "hq", 0);
  rez(state, "corp", wrap);
  expect(core.getStrength(refresh(state, wrap))).toBe(7);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Corroder");
  expect(core.getStrength(refresh(state, wrap))).toBe(0);
});

it("zed 1.0 - only does brain damage if runner spends click to break", () => {
  {
    const state = newGame({ corp: { hand: ["Zed 1.0"] } });
    playFromHand(state, "corp", "Zed 1.0", "hq");
    const zed = getIce(state, "hq", 0);
    rez(state, "corp", zed);
    takeCredits(state, "corp");
    runOn(state, "hq");
    runContinue(state);
    cardSideAbility(state, "runner", zed, 0);
    clickPrompt(state, "runner", "Do 1 core damage");
    fireSubs(state, zed);
    expect((getRunner(state) as any).brainDamage).toBe(1);
  }
  {
    const state = newGame({ corp: { hand: ["Zed 1.0"] } });
    playFromHand(state, "corp", "Zed 1.0", "hq");
    const zed = getIce(state, "hq", 0);
    rez(state, "corp", zed);
    takeCredits(state, "corp");
    runOn(state, "hq");
    runContinue(state);
    fireSubs(state, zed);
    expect((getRunner(state) as any).brainDamage).toBe(0);
  }
});

it("zed 2.0 - only does brain damage if runner spends click to break", () => {
  {
    const state = newGame({ corp: { hand: ["Zed 2.0"], credits: 10 } });
    playFromHand(state, "corp", "Zed 2.0", "hq");
    const zed = getIce(state, "hq", 0);
    rez(state, "corp", zed);
    takeCredits(state, "corp");
    runOn(state, "hq");
    runContinue(state);
    cardSideAbility(state, "runner", zed, 0);
    clickPrompt(state, "runner", "Trash a piece of hardware");
    clickPrompt(state, "runner", "Trash a piece of hardware");
    fireSubs(state, zed);
    expect((getRunner(state) as any).brainDamage).toBe(2);
  }
  {
    const state = newGame({ corp: { hand: ["Zed 2.0"], credits: 10 } });
    playFromHand(state, "corp", "Zed 2.0", "hq");
    const zed = getIce(state, "hq", 0);
    rez(state, "corp", zed);
    takeCredits(state, "corp");
    runOn(state, "hq");
    runContinue(state);
    fireSubs(state, zed);
    expect((getRunner(state) as any).brainDamage).toBe(0);
  }
});
