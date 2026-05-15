import { describe, it, expect } from "vitest";
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

it("adonis-campaign", () => {
  const state = newGame({ corp: { deck: ["Adonis Campaign"] } });
  playFromHand(state, "corp", "Adonis Campaign", "New remote");
  const ac = getContent(state, "remote1", 0);
  rez(state, "corp", ac);
  for (const rem of [12, 9, 6, 3]) {
    expect(getCounters(refresh(state, ac), "credit")).toBe(rem);
    takeCredits(state, "corp");
    expect(
      changed(() => getCorp(state).credit, 3, () => takeCredits(state, "runner")),
      "Gained 3c from Adonis Campaign"
    ).toBe(true);
  }
  expect(refresh(state, ac)).toBeNull();
  expect(getCorp(state).discard[0].title).toBe("Adonis Campaign");
});

it("adonis-campaign-with-gravedigger-async-issues", () => {
  const state = newGame({
    corp: { deck: ["Adonis Campaign"] },
    runner: { hand: ["Gravedigger"] },
  });
  playFromHand(state, "corp", "Adonis Campaign", "New remote");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Gravedigger");
  takeCredits(state, "runner");
  const ac = getContent(state, "remote1", 0);
  rez(state, "corp", ac);
  for (const rem of [12, 9, 6, 3]) {
    expect(getCounters(refresh(state, ac), "credit")).toBe(rem);
    takeCredits(state, "corp");
    expect(
      changed(() => getCorp(state).credit, 3, () => takeCredits(state, "runner")),
      "Gained 3c from Adonis Campaign"
    ).toBe(true);
  }
  expect(refresh(state, ac)).toBeNull();
  expect(getCorp(state).discard[0].title).toBe("Adonis Campaign");
  expect(getCounters(getProgram(state, 0), "virus")).toBe(1);
});

it("advanced-assembly-lines", () => {
  const state = newGame({ corp: { deck: ["Advanced Assembly Lines", "PAD Campaign"] } });
  playFromHand(state, "corp", "Advanced Assembly Lines", "New remote");
  const aal = getContent(state, "remote1", 0);
  const credits = getCorp(state).credit;
  const hq = getCorp(state).hand.length;
  rez(state, "corp", aal);
  expect(getCorp(state).credit).toBe(credits + 2);
  cardAbility(state, "corp", aal, 0);
  clickCard(state, "corp", findCard("PAD Campaign", getCorp(state).hand));
  clickPrompt(state, "corp", "New remote");
  expect(getCorp(state).hand.length).toBe(hq - 1);
});

it("aggressive-secretary", () => {
  const state = newGame({
    corp: { deck: ["Aggressive Secretary"] },
    runner: { deck: [qty("Cache", 3)] },
  });
  playFromHand(state, "corp", "Aggressive Secretary", "New remote");
  const as = getContent(state, "remote1", 0);
  clickAdvance(state, "corp", refresh(state, as));
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Cache");
  playFromHand(state, "runner", "Cache");
  playFromHand(state, "runner", "Cache");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", getProgram(state, 1));
  expect(getCorp(state).credit).toBe(3);
  expect(getProgram(state).length).toBe(2);
});

it("alexa-belsky", () => {
  const state = newGame({
    corp: { deck: ["Alexa Belsky", "Hedge Fund", "Breaking News", "Gutenberg", "Product Placement", "Jackson Howard"] },
  });
  playFromHand(state, "corp", "Alexa Belsky", "New remote");
  const alexa = getContent(state, "remote1", 0);
  rez(state, "corp", alexa);
  cardAbility(state, "corp", alexa, 0);
  expect(getCorp(state).discard.length).toBe(1);
  expect(getCorp(state).hand.length).toBe(5);
  expect(getCorp(state).deck.length).toBe(0);
  clickPrompt(state, "runner", "5");
  expect(getCorp(state).hand.length).toBe(2);
  expect(getCorp(state).deck.length).toBe(3);
  expect(getRunner(state).credit).toBe(0);
});

it("alix-t4lb07", () => {
  const state = newGame({ corp: { deck: ["Alix T4LB07", qty("PAD Campaign", 3)] } });
  playFromHand(state, "corp", "Alix T4LB07", "New remote");
  const alix = getContent(state, "remote1", 0);
  rez(state, "corp", alix);
  playFromHand(state, "corp", "PAD Campaign", "New remote");
  playFromHand(state, "corp", "PAD Campaign", "New remote");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getCounters(refresh(state, alix), "power")).toBe(2);
  expect(getCorp(state).credit).toBe(4);
  cardAbility(state, "corp", alix, 0);
  expect(getCorp(state).credit).toBe(8);
});

it("allele-repression", () => {
  const state = newGame({
    corp: {
      hand: ["Allele Repression", "Hedge Fund", "Vanilla"],
      discard: ["Ice Wall", "Enigma"],
      credits: 10,
    },
  });
  playFromHand(state, "corp", "Allele Repression", "New remote");
  const ar = getContent(state, "remote1", 0);
  clickAdvance(state, "corp", refresh(state, ar));
  clickAdvance(state, "corp", refresh(state, ar));
  rez(state, "corp", ar);
  cardAbility(state, "corp", ar, 0);
  expect(findCard("Allele Repression", getCorp(state).discard)).toBeTruthy();
  clickCard(state, "corp", "Hedge Fund");
  clickCard(state, "corp", "Vanilla");
  clickCard(state, "corp", "Ice Wall");
  clickCard(state, "corp", "Enigma");
  expect(findCard("Ice Wall", getCorp(state).hand)).toBeTruthy();
  expect(findCard("Enigma", getCorp(state).hand)).toBeTruthy();
  expect(findCard("Hedge Fund", getCorp(state).discard)).toBeTruthy();
  expect(findCard("Vanilla", getCorp(state).discard)).toBeTruthy();
});

describe("amani-senai", () => {
  it("trace on score/steal to bounce", () => {
    const state = newGame({
      corp: { deck: ["Amani Senai", qty("Medical Breakthrough", 2)] },
      runner: { deck: ["Analog Dreamers"] },
    });
    playFromHand(state, "corp", "Amani Senai", "New remote");
    playFromHand(state, "corp", "Medical Breakthrough", "New remote");
    playFromHand(state, "corp", "Medical Breakthrough", "New remote");
    takeCredits(state, "corp");
    const senai = getContent(state, "remote1", 0);
    const breakthrough = getContent(state, "remote3", 0);
    rez(state, "corp", senai);
    playFromHand(state, "runner", "Analog Dreamers");
    runEmptyServer(state, "Server 2");
    clickPrompt(state, "runner", "Steal");
    expect(getContent(state, "remote2").length).toBe(0);
    clickPrompt(state, "corp", "Yes");
    clickPrompt(state, "corp", "0");
    expect(getPromptMap(state, "runner").strength).toBe(3);
    clickPrompt(state, "runner", "0");
    const grip = getRunner(state).hand.length;
    expect(getProgram(state).length).toBe(1);
    clickCard(state, "corp", getProgram(state, 0));
    expect(getProgram(state).length).toBe(0);
    expect(getRunner(state).hand.length).toBe(grip + 1);
    takeCredits(state, "runner");
    scoreAgenda(state, "corp", breakthrough);
    clickPrompt(state, "corp", "Yes");
    clickPrompt(state, "corp", "0");
    expect(getPromptMap(state, "runner").strength).toBe(2);
  });

  it("with Team Sponsorship", () => {
    const state = newGame({
      corp: {
        deck: [qty("Hedge Fund", 5)],
        hand: ["Domestic Sleepers", "Amani Senai", "Team Sponsorship"],
        discard: ["Adonis Campaign"],
      },
      runner: { hand: ["Corroder"] },
    });
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Corroder");
    takeCredits(state, "runner");
    playFromHand(state, "corp", "Amani Senai", "New remote");
    playFromHand(state, "corp", "Team Sponsorship", "New remote");
    playFromHand(state, "corp", "Domestic Sleepers", "New remote");
    const amani = getContent(state, "remote1", 0);
    const tsp = getContent(state, "remote2", 0);
    const sleepers = getContent(state, "remote3", 0);
    const corroder = getProgram(state, 0);
    rez(state, "corp", amani);
    rez(state, "corp", tsp);
    scoreAgenda(state, "corp", sleepers);
    clickPrompt(state, "corp", "Amani Senai");
    clickPrompt(state, "corp", "Yes");
    clickPrompt(state, "corp", "3");
    clickPrompt(state, "runner", "0");
    clickCard(state, "corp", "Corroder");
    expect(refresh(state, corroder)).toBeNull();
    clickCard(state, "corp", "Adonis Campaign");
    clickPrompt(state, "corp", "New remote");
    expect(getContent(state, "remote4", 0).title).toBe("Adonis Campaign");
    expect(findCard("Adonis Campaign", getCorp(state).discard)).toBeFalsy();
  });

  it("with Gang Sign and Leela - issue 4487", () => {
    const state = newGame({
      corp: {
        deck: [qty("Hedge Fund", 5)],
        hand: ["Amani Senai", "Hostile Takeover", "Hostile Takeover"],
      },
      runner: { id: "Leela Patel: Trained Pragmatist", hand: ["Gang Sign"] },
    });
    playFromHand(state, "corp", "Amani Senai", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Gang Sign");
    takeCredits(state, "runner");
    playAndScore(state, "Hostile Takeover");
    clickPrompt(state, "corp", "Hostile Takeover");
    clickPrompt(state, "corp", "Yes");
    clickPrompt(state, "corp", "0");
    clickPrompt(state, "runner", "0");
    clickCard(state, "corp", "Gang Sign");
    expect(noPrompt(state, "runner")).toBe(true);
  });

  it("with SanSan City Grid #5344", () => {
    const state = newGame({
      corp: { deck: ["Amani Senai", "Merger", "SanSan City Grid"], credits: 100 },
    });
    gainClicks(state, "corp", 100);
    playFromHand(state, "corp", "Amani Senai", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    playFromHand(state, "corp", "SanSan City Grid", "New remote");
    rez(state, "corp", getContent(state, "remote2", 0));
    playFromHand(state, "corp", "Merger", "Server 2");
    expect(core.getAdvancementRequirement(getContent(state, "remote2", 1))).toBe(2);
    scoreAgenda(state, "corp", getContent(state, "remote2", 1));
    clickPrompt(state, "corp", "Yes");
    expect(getPromptMap(state, "corp").base).toBe(3);
  });
});

it("anson-rose", () => {
  const state = newGame({ corp: { deck: ["Anson Rose", "Ice Wall"] } });
  playFromHand(state, "corp", "Anson Rose", "New remote");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  const ar = getContent(state, "remote1", 0);
  const iw = getIce(state, "hq", 0);
  rez(state, "corp", refresh(state, ar));
  expect(getCounters(refresh(state, ar), "advancement")).toBe(0);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  endPhase12(state, "corp");
  expect(getCounters(refresh(state, ar), "advancement")).toBe(1);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  endPhase12(state, "corp");
  expect(getCounters(refresh(state, ar), "advancement")).toBe(2);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
  rez(state, "corp", refresh(state, iw));
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "corp", "2");
  expect(getCounters(refresh(state, ar), "advancement")).toBe(0);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(2);
});

it("anthill-excavation-contract", () => {
  const state = newGame({
    corp: { hand: ["Anthill Excavation Contract"], deck: [qty("IPO", 15)] },
  });
  playFromHand(state, "corp", "Anthill Excavation Contract", "New remote");
  const agg = getContent(state, "remote1", 0);
  rez(state, "corp", agg);
  takeCredits(state, "corp");
  expect(
    changedMulti(
      [
        [() => getCorp(state).credit, 4],
        [() => getCorp(state).hand.length, 2],
      ],
      () => takeCredits(state, "runner")
    ),
    "Corp gained 4 credits and drew 1 card"
  ).toBe(true);
  takeCredits(state, "corp");
  expect(
    changedMulti(
      [
        [() => getCorp(state).credit, 4],
        [() => getCorp(state).hand.length, 2],
      ],
      () => takeCredits(state, "runner")
    ),
    "Corp gained 4 credits and drew 1 card"
  ).toBe(true);
});

it("api-s-keeper-isobel", () => {
  const state = newGame({ corp: { deck: ["API-S Keeper Isobel", "Ice Wall"] } });
  playFromHand(state, "corp", "API-S Keeper Isobel", "New remote");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  const ap = getContent(state, "remote1", 0);
  const iw = getIce(state, "hq", 0);
  rez(state, "corp", refresh(state, ap));
  rez(state, "corp", refresh(state, iw));
  clickAdvance(state, "corp", refresh(state, iw));
  expect(getCounters(refresh(state, iw), "advancement")).toBe(1);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getCorp(state).credit).toBe(1);
  cardAbility(state, "corp", refresh(state, ap), 0);
  clickCard(state, "corp", refresh(state, iw));
  expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
  expect(getCorp(state).credit).toBe(4);
});

describe("aryabhata-tech", () => {
  it("credit gain and loss", () => {
    const state = newGame({ corp: { deck: ["Aryabhata Tech", "Hunter"] } });
    playFromHand(state, "corp", "Aryabhata Tech", "New remote");
    playFromHand(state, "corp", "Hunter", "HQ");
    const at = getContent(state, "remote1", 0);
    const h = getIce(state, "hq", 0);
    rez(state, "corp", refresh(state, at));
    rez(state, "corp", refresh(state, h));
    takeCredits(state, "corp");
    runOn(state, "hq");
    runContinue(state);
    const cCredits = getCorp(state).credit;
    const rCredits = getRunner(state).credit;
    cardSubroutine(state, "corp", h, 0);
    clickPrompt(state, "corp", "0");
    clickPrompt(state, "runner", "0");
    expect(getCorp(state).credit - cCredits).toBe(1);
    expect(getRunner(state).credit - rCredits).toBe(-1);
  });

  it("interaction with trash effects like CtM - issue 2541", () => {
    const state = newGame({
      corp: {
        id: "NBN: Controlling the Message",
        deck: [qty("Hedge Fund", 5)],
        hand: ["Aryabhata Tech"],
      },
    });
    playFromHand(state, "corp", "Aryabhata Tech", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    runEmptyServer(state, "remote1");
    clickPrompt(state, "runner", "Pay 3 [Credits] to trash");
    expect(
      changed(() => getRunner(state).credit, 0, () => {
        clickPrompt(state, "corp", "Yes");
        clickPrompt(state, "corp", "0");
        clickPrompt(state, "runner", "0");
      }),
      "Runner loses no additional credits from successful trace"
    ).toBe(true);
  });
});

it("b-1001", () => {
  const state = newGame({ corp: { hand: ["B-1001"] } });
  playFromHand(state, "corp", "B-1001", "New remote");
  const b = getContent(state, "remote1", 0);
  rez(state, "corp", b);
  takeCredits(state, "corp");
  gainTags(state, "runner", 1);
  runOn(state, "Server 1");
  cardAbility(state, "corp", b, 0);
  expect((state as any).run).toBeTruthy();
  runContinue(state);
  clickPrompt(state, "runner", "No action");
  runOn(state, "hq");
  expect(
    changed(() => countTags(state), -1, () => {
      cardAbility(state, "corp", b, 0);
      expect((state as any).run).toBeFalsy();
    }),
    "Runner loses a tag"
  ).toBe(true);
  runOn(state, "HQ");
  cardAbility(state, "corp", b, 0);
  expect((state as any).run).toBeTruthy();
});

describe("balanced-coverage", () => {
  it("basic", () => {
    const state = newGame({
      corp: { deck: [qty("Hedge Fund", 5)], hand: ["Balanced Coverage"] },
    });
    playFromHand(state, "corp", "Balanced Coverage", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    clickPrompt(state, "corp", "Operation");
    clickPrompt(state, "corp", "OK");
    expect(
      changed(() => getCorp(state).credit, 2, () => clickPrompt(state, "corp", "Yes")),
      "Got 2 credits from Balanced Coverage"
    ).toBe(true);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    clickPrompt(state, "corp", "Operation");
    clickPrompt(state, "corp", "OK");
    expect(
      changed(() => getCorp(state).credit, 0, () => clickPrompt(state, "corp", "No")),
      "Got no credits declining Balanced Coverage"
    ).toBe(true);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    clickPrompt(state, "corp", "Asset");
    expect(
      changed(() => getCorp(state).credit, 0, () => clickPrompt(state, "corp", "OK")),
      "Got no credits when types don't match"
    ).toBe(true);
  });

  it("triggers hyoubu", () => {
    const state = newGame({
      corp: {
        id: "Hyoubu Institute: Absolute Clarity",
        deck: [qty("Hedge Fund", 5)],
        hand: ["Balanced Coverage"],
      },
    });
    playFromHand(state, "corp", "Balanced Coverage", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    clickPrompt(state, "corp", "Operation");
    clickPrompt(state, "corp", "OK");
    expect(
      changed(() => getCorp(state).credit, 3, () => clickPrompt(state, "corp", "Yes")),
      "Got 2 credits from Balanced Coverage + 1 from Hyoubu"
    ).toBe(true);
  });
});

it("bass-ch1r180g4", () => {
  const state = newGame({ corp: { deck: ["Bass CH1R180G4"] } });
  playFromHand(state, "corp", "Bass CH1R180G4", "New remote");
  const bass = getContent(state, "remote1", 0);
  rez(state, "corp", bass);
  expect(getCorp(state).credit).toBe(2);
  cardAbility(state, "corp", bass, 0);
  expect(getCorp(state).click).toBe(3);
  expect(refresh(state, bass)).toBeNull();
});

it("behold", () => {
  const state = newGame({ corp: { hand: ["Behold!"] } });
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  expect(waiting(state, "runner")).toBe(true);
  expect(
    changed(() => getCorp(state).credit, -4, () => clickPrompt(state, "corp", "Yes")),
    "Corp spent 4 credits"
  ).toBe(true);
  expect(countTags(state)).toBe(2);
});

describe("bio-ethics-association", () => {
  it("basic", () => {
    const state = newGame({ corp: { deck: ["Bio-Ethics Association"] } });
    playFromHand(state, "corp", "Bio-Ethics Association", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect(getRunner(state).discard.length).toBe(1);
  });

  it("should be able to prevent damage from multiple copies", () => {
    const state = newGame({
      corp: { deck: [qty("Bio-Ethics Association", 2)] },
      runner: { deck: ["Feedback Filter", qty("Sure Gamble", 3)] },
    });
    playFromHand(state, "corp", "Bio-Ethics Association", "New remote");
    playFromHand(state, "corp", "Bio-Ethics Association", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    rez(state, "corp", getContent(state, "remote2", 0));
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Feedback Filter");
    takeCredits(state, "runner");
    const ff = getHardware(state, 0);
    clickPrompt(state, "runner", "Feedback Filter (Net)");
    expect(getRunner(state).discard.length).toBe(0);
    clickPrompt(state, "runner", "Pass priority");
    expect(getRunner(state).discard.length).toBe(1);
  });
});

it("bioroid-work-crew", () => {
  function bwcTest(card: string) {
    const state = newGame({ corp: { deck: ["Bioroid Work Crew", card] } });
    playFromHand(state, "corp", "Bioroid Work Crew", "New remote");
    const bwc = getContent(state, "remote1", 0);
    rez(state, "corp", bwc);
    cardAbility(state, "corp", bwc, 0);
    clickCard(state, "corp", card);
    if (card === "Research Station") {
      clickPrompt(state, "corp", "HQ");
    } else {
      clickPrompt(state, "corp", "New remote");
    }
    expect(getCorp(state).hand.length).toBe(0);
    expect(getCorp(state).discard.length).toBe(1);
  }
  for (const card of ["Hostile Takeover", "Dedicated Response Team", "Builder", "Research Station"]) {
    bwcTest(card);
  }
});

describe("blacklist", () => {
  it("blocks moving cards from heap #5044", () => {
    const state = newGame({
      corp: { hand: ["Blacklist", "Ice Wall"] },
      runner: { hand: ["Boomerang"] },
    });
    playFromHand(state, "corp", "Ice Wall", "HQ");
    rez(state, "corp", getIce(state, "hq", 0));
    playFromHand(state, "corp", "Blacklist", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Boomerang");
    clickCard(state, "runner", "Ice Wall");
    runOn(state, "HQ");
    runContinue(state);
    cardAbility(state, "runner", getHardware(state, 0), 0);
    clickPrompt(state, "runner", "End the run");
    runContinue(state);
    runContinue(state);
    expect(noPrompt(state, "runner")).toBe(true);
    expect(findCard("Boomerang", getRunner(state).discard)).toBeTruthy();
    expect(findCard("Boomerang", getRunner(state).deck)).toBeFalsy();
  });

  it("blocks installing cards from heap", () => {
    const state = newGame({
      corp: { hand: ["Blacklist", "Ice Wall"] },
      runner: { discard: ["Paperclip"] },
    });
    playFromHand(state, "corp", "Ice Wall", "HQ");
    rez(state, "corp", getIce(state, "hq", 0));
    playFromHand(state, "corp", "Blacklist", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    runOn(state, "HQ");
    runContinue(state);
    expect(noPrompt(state, "runner")).toBe(true);
    fireSubs(state, getIce(state, "hq", 0));
    gain(state, "runner", "credit", 3);
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "runner", "Pay 3 [Credits] to trash");
    runOn(state, "HQ");
    runContinue(state);
    clickPrompt(state, "runner", "Yes");
    expect(getProgram(state).length).toBe(1);
  });

  it("need to allow steal #2426", () => {
    const state = newGame({ corp: { deck: [qty("Fetal AI", 3), "Blacklist"] } });
    trashFromHand(state, "corp", "Fetal AI");
    playFromHand(state, "corp", "Blacklist", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    expect(getCorp(state).discard.length).toBe(1);
    takeCredits(state, "corp");
    runEmptyServer(state, "archives");
    clickPrompt(state, "runner", "Pay to steal");
    expect(getRunner(state).agendaPoint).toBe(2);
    expect(getScored(state, "runner").length).toBe(1);
  });
});

it("bladderwort", () => {
  const state = newGame({ corp: { deck: ["Bladderwort"] }, runner: { hand: qty("Sure Gamble", 5) } });
  playFromHand(state, "corp", "Bladderwort", "New remote");
  const wort = getContent(state, "remote1", 0);
  takeCredits(state, "corp");
  rez(state, "corp", wort);
  lose(state, "corp", "credit", getCorp(state).credit);
  gain(state, "corp", "credit", 3);
  expect(getCorp(state).credit).toBe(3);
  expect(
    changed(() => getCorp(state).credit, 1, () => takeCredits(state, "runner")),
    "gained 1c at start of turn"
  ).toBe(true);
  expect(getRunner(state).discard.length).toBe(1);
  takeCredits(state, "corp");
  lose(state, "corp", "credit", getCorp(state).credit);
  gain(state, "corp", "credit", 4);
  expect(getCorp(state).credit).toBe(4);
  expect(
    changed(() => getCorp(state).credit, 1, () => takeCredits(state, "runner")),
    "gained 1c at start of turn"
  ).toBe(true);
  expect(getRunner(state).discard.length).toBe(1);
});

it("brain-taping-warehouse", () => {
  const state = newGame({ corp: { deck: ["Brain-Taping Warehouse", "Ichi 1.0", "Eli 1.0"] } });
  playFromHand(state, "corp", "Brain-Taping Warehouse", "New remote");
  playFromHand(state, "corp", "Ichi 1.0", "Server 1");
  playFromHand(state, "corp", "Eli 1.0", "HQ");
  const ichi = getIce(state, "remote1", 0);
  const eli = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  runOn(state, "remote1");
  rez(state, "corp", getContent(state, "remote1", 0));
  expect(getRunner(state).click).toBe(3);
  rez(state, "corp", ichi);
  expect(getCorp(state).credit).toBe(2);
  runContinueUntil(state, "movement");
  runJackOut(state);
  runOn(state, "hq");
  expect(getRunner(state).click).toBe(2);
  rez(state, "corp", eli);
  expect(getCorp(state).credit).toBe(1);
});

it("breached-dome", () => {
  const state = newGame({
    corp: { deck: [qty("Breached Dome", 10)] },
    runner: { deck: [qty("Sure Gamble", 10)] },
  });
  trashFromHand(state, "corp", "Breached Dome");
  playFromHand(state, "corp", "Breached Dome", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "R&D");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).hand.length).toBe(4);
  expect(getRunner(state).deck.length).toBe(4);
  expect(getRunner(state).discard.length).toBe(2);
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).hand.length).toBe(3);
  expect(getRunner(state).deck.length).toBe(3);
  expect(getRunner(state).discard.length).toBe(4);
  runEmptyServer(state, "Archives");
  expect(getRunner(state).hand.length).toBe(2);
  expect(getRunner(state).deck.length).toBe(2);
  expect(getRunner(state).discard.length).toBe(6);
});

it("broadcast-square", () => {
  const state = newGame({
    corp: { deck: ["Profiteering", "Hostile Takeover", "Broadcast Square"] },
  });
  playFromHand(state, "corp", "Broadcast Square", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  expect(getCorp(state).credit).toBe(3);
  playFromHand(state, "corp", "Profiteering", "New remote");
  scoreAgenda(state, "corp", getContent(state, "remote2", 0));
  clickPrompt(state, "corp", "3");
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(getCorp(state).agendaPoint).toBe(1);
  expect(countBadPub(state)).toBe(0);
  expect(getCorp(state).credit).toBe(3);
  playFromHand(state, "corp", "Hostile Takeover", "New remote");
  scoreAgenda(state, "corp", getContent(state, "remote3", 0));
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "3");
  expect(getCorp(state).agendaPoint).toBe(2);
  expect(countBadPub(state)).toBe(1);
  expect(getCorp(state).credit).toBe(10);
});

it("c-i-fund", () => {
  const state = newGame({ corp: { deck: ["C.I. Fund", "Hedge Fund"] } });
  playFromHand(state, "corp", "Hedge Fund");
  playFromHand(state, "corp", "C.I. Fund", "New remote");
  takeCredits(state, "corp");
  const ci = getContent(state, "remote1", 0);
  rez(state, "corp", ci);
  takeCredits(state, "runner");
  cardAbility(state, "corp", ci, 0);
  clickPrompt(state, "corp", "3");
  expect(getCounters(refresh(state, ci), "credit")).toBe(3);
  endPhase12(state, "corp");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  cardAbility(state, "corp", ci, 0);
  clickPrompt(state, "corp", "3");
  expect(getCounters(refresh(state, ci), "credit")).toBe(6);
  endPhase12(state, "corp");
  expect(getCounters(refresh(state, ci), "credit")).toBe(8);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  endPhase12(state, "corp");
  expect(getCounters(refresh(state, ci), "credit")).toBe(10);
  const credits = getCorp(state).credit;
  cardAbility(state, "corp", ci, 1);
  expect(getCorp(state).credit - credits).toBe(8);
  expect(getCounters(refresh(state, ci), "credit")).toBe(0);
});

it("byte-test", () => {
  const state = newGame({ corp: { deck: [qty("Byte!", 3)] } });
  playFromHand(state, "corp", "Byte!", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  expect(waiting(state, "runner")).toBe(true);
  clickPrompt(state, "corp", "Yes");
  expect(getCorp(state).credit).toBe(3);
  expect(countTags(state)).toBe(1);
  expect(getRunner(state).hand.length).toBe(0);
});

it("calvin-b4l3y", () => {
  const state = newGame({
    corp: { hand: ["Calvin B4L3Y"], deck: [qty("Hedge Fund", 3), qty("IPO", 2)] },
  });
  playFromHand(state, "corp", "Calvin B4L3Y", "New remote");
  const cal = getContent(state, "remote1", 0);
  const hand = getCorp(state).hand.length;
  const click = getCorp(state).click;
  rez(state, "corp", cal);
  cardAbility(state, "corp", cal, 0);
  expect(getCorp(state).hand.length).toBe(hand + 2);
  cardAbility(state, "corp", cal, 0);
  expect(getCorp(state).click).toBe(click - 1);
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Pay 3 [Credits] to trash");
  const hand2 = getCorp(state).hand.length;
  clickPrompt(state, "corp", "Yes");
  expect(getCorp(state).hand.length).toBe(hand2 + 2);
  expect(findCard("Calvin B4L3Y", getCorp(state).discard)).toBeTruthy();
});

it("capital-investors", () => {
  const state = newGame({ corp: { deck: ["Capital Investors"] } });
  playFromHand(state, "corp", "Capital Investors", "New remote");
  const cap = getContent(state, "remote1", 0);
  rez(state, "corp", cap);
  cardAbility(state, "corp", cap, 0);
  cardAbility(state, "corp", cap, 0);
  expect(getCorp(state).click).toBe(0);
  expect(getCorp(state).credit).toBe(7);
});

it("cerebral-overwriter", () => {
  const state = newGame({ corp: { deck: ["Cerebral Overwriter"] } });
  playFromHand(state, "corp", "Cerebral Overwriter", "New remote");
  const co = getContent(state, "remote1", 0);
  clickAdvance(state, "corp", refresh(state, co));
  clickAdvance(state, "corp", refresh(state, co));
  expect(getCounters(refresh(state, co), "advancement")).toBe(2);
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "corp", "Yes");
  expect(getRunner(state).brainDamage).toBe(2);
});

describe("chairman-hiro", () => {
  it("reduce runner max hand size; add as 2 agenda points if runner trashes", () => {
    const state = newGame({ corp: { deck: [qty("Chairman Hiro", 2)] } });
    playFromHand(state, "corp", "Chairman Hiro", "New remote");
    playFromHand(state, "corp", "Chairman Hiro", "Server 1");
    clickPrompt(state, "corp", "OK");
    expect(getCorp(state).discard.length).toBe(1);
    expect(getRunner(state).agendaPoint).toBe(0);
    const hiro = getContent(state, "remote1", 0);
    rez(state, "corp", hiro);
    expect(handSize(state, "runner")).toBe(3);
    takeCredits(state, "corp");
    takeCredits(state, "runner", 3);
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "runner", "Pay 6 [Credits] to trash");
    expect(getRunner(state).credit).toBe(2);
    expect(handSize(state, "runner")).toBe(5);
    expect(getScored(state, "runner").length).toBe(1);
    expect(getRunner(state).agendaPoint).toBe(2);
  });

  it("interaction with Bacterial Programming - issue 3090", () => {
    const state = newGame({
      corp: {
        deck: ["Accelerated Beta Test", "Brainstorm", "Chairman Hiro", "DNA Tracker", "Excalibur", "Fire Wall", "Gemini"],
        hand: ["Bacterial Programming"],
      },
    });
    playFromHand(state, "corp", "Bacterial Programming", "New remote");
    takeCredits(state, "corp");
    runEmptyServer(state, "remote1");
    clickPrompt(state, "runner", "Steal");
    clickPrompt(state, "corp", "Yes");
    clickPrompt(state, "corp", "OK");
    clickPrompt(state, "corp", "Chairman Hiro");
    clickPrompt(state, "corp", "Done");
    clickPrompt(state, "corp", "Done");
    clickPrompt(state, "corp", "Accelerated Beta Test");
    clickPrompt(state, "corp", "Brainstorm");
    clickPrompt(state, "corp", "DNA Tracker");
    clickPrompt(state, "corp", "Excalibur");
    clickPrompt(state, "corp", "Fire Wall");
    clickPrompt(state, "corp", "Gemini");
    clickPrompt(state, "corp", "OK");
    expect(getScored(state, "runner").map((c: any) => c.title)).toEqual(["Bacterial Programming"]);
    expect(getCorp(state).discard.map((c: any) => c.title)).toEqual(["Chairman Hiro"]);
  });
});

describe("charlotte-cacador", () => {
  it("basic", () => {
    const state = newGame({
      corp: { hand: ["Charlotte Caçador"], deck: [qty("Hedge Fund", 5)] },
    });
    playFromHand(state, "corp", "Charlotte Caçador", "New remote");
    const cc = getContent(state, "remote1", 0);
    advance(state, cc, 2);
    rez(state, "corp", cc);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    endPhase12(state, "corp");
    expect(
      changedMulti(
        [
          [() => getCorp(state).credit, 4],
          [() => getCorp(state).hand.length, 2],
          [() => getCounters(refresh(state, cc), "advancement"), -1],
        ],
        () => clickPrompt(state, "corp", "Yes")
      ),
      "Corp gained 4 credits and drew 1 card"
    ).toBe(true);
    expect(
      changedMulti(
        [
          [() => getCorp(state).credit, 3],
          [() => getCorp(state).discard.length, 1],
        ],
        () => cardAbility(state, "corp", refresh(state, cc), 1)
      ),
      "Corp gained 3 credits"
    ).toBe(true);
    expect(refresh(state, cc)).toBeNull();
  });

  it("with La Costa Grid", () => {
    const state = newGame({
      corp: { hand: ["Charlotte Caçador", "La Costa Grid"], deck: [qty("Hedge Fund", 5)], credits: 100 },
    });
    playFromHand(state, "corp", "Charlotte Caçador", "New remote");
    playFromHand(state, "corp", "La Costa Grid", "Server 1");
    const cc = getContent(state, "remote1", 0);
    const lcg = getContent(state, "remote1", 1);
    advance(state, cc, 2);
    rez(state, "corp", cc);
    rez(state, "corp", lcg);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    endPhase12(state, "corp");
    const btns = promptButtons(state, "corp");
    expect(btns.some((b: string) => b === "Charlotte Caçador" || b === "La Costa Grid")).toBe(true);
  });

  it("with La Costa Grid unadvanced", () => {
    const state = newGame({
      corp: { hand: ["Charlotte Caçador", "La Costa Grid"], deck: [qty("Hedge Fund", 5)], credits: 100 },
    });
    playFromHand(state, "corp", "Charlotte Caçador", "New remote");
    playFromHand(state, "corp", "La Costa Grid", "Server 1");
    const cc = getContent(state, "remote1", 0);
    const lcg = getContent(state, "remote1", 1);
    rez(state, "corp", cc);
    rez(state, "corp", lcg);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    endPhase12(state, "corp");
    const btns = promptButtons(state, "corp");
    expect(btns.some((b: string) => b === "Charlotte Caçador" || b === "La Costa Grid")).toBe(true);
  });
});

it("chekist-scion", () => {
  const state = newGame({ corp: { deck: ["Chekist Scion"] } });
  playFromHand(state, "corp", "Chekist Scion", "New remote");
  advance(state, getContent(state, "remote1", 0), 2);
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "corp", "Yes");
  expect(countTags(state)).toBe(3);
});

describe("chief-slee", () => {
  it("basic", () => {
    const state = newGame({
      corp: { deck: [qty("Hedge Fund", 5)], hand: ["Chief Slee", "Hive"], credits: 10 },
      runner: { deck: [qty("Sure Gamble", 5)] },
    });
    playFromHand(state, "corp", "Hive", "HQ");
    playFromHand(state, "corp", "Chief Slee", "New remote");
    takeCredits(state, "corp");
    runOn(state, "HQ");
    const slee = getContent(state, "remote1", 0);
    const hive = getIce(state, "hq", 0);
    rez(state, "corp", slee);
    rez(state, "corp", hive);
    runContinue(state);
    fireSubs(state, hive);
    expect((state as any).run).toBeFalsy();
    takeCredits(state, "runner");
    cardAbility(state, "corp", slee, 0);
    expect(getRunner(state).discard.length).toBe(5);
  });

  it("doesn't break when redirected by Miraju #6043", () => {
    const state = newGame({
      corp: { deck: [qty("Hedge Fund", 5)], hand: ["Chief Slee", "Mirāju", "Ice Wall"], credits: 10 },
      runner: { hand: ["Unity"] },
    });
    playFromHand(state, "corp", "Chief Slee", "New remote");
    playFromHand(state, "corp", "Mirāju", "HQ");
    playFromHand(state, "corp", "Ice Wall", "Archives");
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Unity");
    const unity = getProgram(state, 0);
    const miraju = getIce(state, "hq", 0);
    const slee = getContent(state, "remote1", 0);
    runOn(state, "HQ");
    rez(state, "corp", slee);
    rez(state, "corp", miraju);
    runContinue(state, "encounter-ice");
    cardAbility(state, "runner", unity, 0);
    clickPrompt(state, "runner", "Draw 1 card, then shuffle 1 card from HQ into R&D");
    runContinue(state);
    clickPrompt(state, "runner", "No");
    expect((refresh(state, slee) as any)?.counter?.power).toBeUndefined();
    runContinueUntil(state, "success");
    expect((refresh(state, slee) as any)?.counter?.power).toBeUndefined();
  });
});

it("city-surveillance", () => {
  const state = newGame({ corp: { deck: ["City Surveillance"] } });
  playFromHand(state, "corp", "City Surveillance", "New remote");
  const surv = getContent(state, "remote1", 0);
  rez(state, "corp", surv);
  takeCredits(state, "corp");
  expect(promptButtons(state, "runner").some((b: string) => b === "Pay 1 [Credits]" || b === "Take 1 tag")).toBe(true);
  clickPrompt(state, "runner", "Pay 1 [Credits]");
  expect(getRunner(state).credit).toBe(4);
  expect(countTags(state)).toBe(0);
  expect(noPrompt(state, "runner")).toBe(true);
  takeCredits(state, "runner");
  lose(state, "runner", "credit", getRunner(state).credit);
  takeCredits(state, "corp");
  expect(promptButtons(state, "runner").some((b: string) => b === "Take 1 tag")).toBe(true);
  clickPrompt(state, "runner", "Take 1 tag");
  expect(getRunner(state).credit).toBe(0);
  expect(countTags(state)).toBe(1);
  expect(noPrompt(state, "runner")).toBe(true);
});

describe("clearinghouse", () => {
  it("basic", () => {
    const state = newGame({
      corp: { hand: ["Clearinghouse"] },
      runner: { hand: [qty("Sure Gamble", 5)] },
    });
    gainClicks(state, "corp", 5);
    playFromHand(state, "corp", "Clearinghouse", "New remote");
    advance(state, getContent(state, "remote1", 0), 4);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    rez(state, "corp", getContent(state, "remote1", 0));
    cardAbility(state, "corp", getContent(state, "remote1", 0), 0);
    expect(
      changed(() => getRunner(state).hand.length, -4, () => clickPrompt(state, "corp", "Yes")),
      "Runner received 4 damage"
    ).toBe(true);
  });

  it("should prompt which to fire first", () => {
    const state = newGame({ corp: { deck: [qty("Clearinghouse", 2)] } });
    playFromHand(state, "corp", "Clearinghouse", "New remote");
    playFromHand(state, "corp", "Clearinghouse", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    rez(state, "corp", getContent(state, "remote2", 0));
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    endPhase12(state, "corp");
    expect(promptTitles(state, "corp")).toEqual(["Clearinghouse", "Clearinghouse", "Done"]);
  });
});

it("clone-suffrage-movement", () => {
  const state = newGame({ corp: { deck: ["Clone Suffrage Movement", qty("Hedge Fund", 2), "Ice Wall"] } });
  gainClicks(state, "corp", 1);
  playFromHand(state, "corp", "Clone Suffrage Movement", "New remote");
  playFromHand(state, "corp", "Hedge Fund");
  playFromHand(state, "corp", "Hedge Fund");
  const csm = getContent(state, "remote1", 0);
  rez(state, "corp", refresh(state, csm));
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getCorp(state).discard.length).toBe(2);
  expect((state as any).corpPhase12).toBeTruthy();
  cardAbility(state, "corp", csm, 0);
  clickCard(state, "corp", findCard("Hedge Fund", getCorp(state).discard));
  endPhase12(state, "corp");
  playFromHand(state, "corp", "Ice Wall", "Server 1");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect((state as any).corpPhase12).toBeFalsy();
});

describe("clyde-van-rite", () => {
  it("runner has 1+ credit and chooses to pay 1 credit", () => {
    const state = newGame({
      corp: { deck: ["Clyde Van Rite"] },
      runner: { deck: [qty("Sure Gamble", 3), qty("Easy Mark", 2), qty("John Masanori", 2)] },
    });
    playFromHand(state, "corp", "Clyde Van Rite", "New remote");
    const clyde = getContent(state, "remote1", 0);
    rez(state, "corp", clyde);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    cardAbility(state, "corp", clyde, 0);
    expect(getRunner(state).credit).toBe(9);
    expect(getRunner(state).deck.length).toBe(2);
    expect(promptButtons(state, "runner").some((b: string) => b === "Pay 1 [Credits]" || b === "Trash top card")).toBe(true);
    clickPrompt(state, "runner", "Pay 1 [Credits]");
    expect(getRunner(state).credit).toBe(8);
    expect(getRunner(state).deck.length).toBe(2);
  });

  it("runner can't pay 1 credit so must trash top card", () => {
    const state = newGame({
      corp: { deck: ["Clyde Van Rite"] },
      runner: { deck: [qty("Sure Gamble", 2)], hand: ["Sure Gamble"] },
    });
    playFromHand(state, "corp", "Clyde Van Rite", "New remote");
    const clyde = getContent(state, "remote1", 0);
    rez(state, "corp", clyde);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    (state as any).runner.credit = 0;
    cardAbility(state, "corp", clyde, 0);
    expect(getRunner(state).credit).toBe(0);
    expect(getRunner(state).deck.length).toBe(2);
    expect(promptButtons(state, "runner").some((b: string) => b === "Trash the top card of the stack")).toBe(true);
    clickPrompt(state, "runner", "Trash the top card of the stack");
    expect(getRunner(state).credit).toBe(0);
    expect(getRunner(state).deck.length).toBe(1);
  });

  it("runner has 1+ card in Stack and chooses to trash 1 card", () => {
    const state = newGame({
      corp: { deck: ["Clyde Van Rite"] },
      runner: { deck: [qty("Sure Gamble", 2)], hand: ["Sure Gamble"] },
    });
    playFromHand(state, "corp", "Clyde Van Rite", "New remote");
    const clyde = getContent(state, "remote1", 0);
    rez(state, "corp", clyde);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    cardAbility(state, "corp", clyde, 0);
    expect(getRunner(state).credit).toBe(9);
    expect(getRunner(state).deck.length).toBe(2);
    expect(promptButtons(state, "runner").some((b: string) => b === "Pay 1 [Credits]" || b === "Trash the top card of the stack")).toBe(true);
    clickPrompt(state, "runner", "Trash the top card of the stack");
    expect(getRunner(state).credit).toBe(9);
    expect(getRunner(state).deck.length).toBe(1);
  });

  it("runner has no cards in Stack so must pay 1 credit", () => {
    const state = newGame({ corp: { deck: ["Clyde Van Rite"] } });
    playFromHand(state, "corp", "Clyde Van Rite", "New remote");
    const clyde = getContent(state, "remote1", 0);
    rez(state, "corp", clyde);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    cardAbility(state, "corp", clyde, 0);
    expect(getRunner(state).credit).toBe(9);
    expect(getRunner(state).deck.length).toBe(0);
    expect(promptButtons(state, "runner").some((b: string) => b === "Pay 1 [Credits]")).toBe(true);
    clickPrompt(state, "runner", "Pay 1 [Credits]");
    expect(getRunner(state).credit).toBe(8);
    expect(getRunner(state).deck.length).toBe(0);
  });

  it("runner has no credits and no cards so nothing happens", () => {
    const state = newGame({
      corp: { deck: ["Clyde Van Rite"] },
      runner: { deck: [], hand: [qty("Sure Gamble", 5)], credits: 0 },
    });
    playFromHand(state, "corp", "Clyde Van Rite", "New remote");
    const clyde = getContent(state, "remote1", 0);
    rez(state, "corp", clyde);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    (state as any).runner.credit = 0;
    cardAbility(state, "corp", clyde, 0);
    expect(getRunner(state).credit).toBe(0);
    expect(getRunner(state).deck.length).toBe(0);
    expect(noPrompt(state, "corp")).toBe(true);
  });
});

it("cohort-guidance-program", () => {
  const state = newGame({
    corp: {
      hand: ["Cohort Guidance Program", "NGO Front", "PAD Campaign"],
      deck: [qty("Hedge Fund", 5)],
    },
  });
  playFromHand(state, "corp", "Cohort Guidance Program", "New remote");
  playFromHand(state, "corp", "NGO Front", "New remote");
  const cgp = getContent(state, "remote1", 0);
  const ngo = getContent(state, "remote2", 0);
  rez(state, "corp", cgp);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect((state as any).corpPhase12).toBeTruthy();
  endPhase12(state, "corp");
  expect(
    changedMulti(
      [
        [() => getCorp(state).credit, 2],
        [() => getCorp(state).discard.length, 1],
        [() => getCorp(state).hand.length, 1],
      ],
      () => {
        clickPrompt(state, "corp", "Trash 1 card from HQ to gain 2 [Credits] and draw 1 card");
        clickCard(state, "corp", "PAD Campaign");
      }
    ),
    "Corp discarded 1 card, gained 2 credits, and drew 1 card"
  ).toBe(true);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  endPhase12(state, "corp");
  expect(
    changed(
      () => getCounters(refresh(state, ngo), "advancement"),
      1,
      () => {
        clickPrompt(state, "corp", "Turn 1 facedown card in Archives faceup to place 1 advancement counter on an installed card");
        clickCard(state, "corp", findCard("PAD Campaign", getCorp(state).discard));
        clickCard(state, "corp", ngo);
      }
    ),
    "Corp turned 1 facedown card in Archives to advance 1 card"
  ).toBe(true);
  expect(getCorp(state).discard.every((c: any) => c.seen)).toBe(true);
});

it("commercial-bankers-group", () => {
  const state = newGame({ corp: { deck: ["Commercial Bankers Group", "Ice Wall"] } });
  playFromHand(state, "corp", "Commercial Bankers Group", "New remote");
  const cbg = getContent(state, "remote1", 0);
  rez(state, "corp", cbg);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getCorp(state).credit).toBe(9);
  playFromHand(state, "corp", "Ice Wall", "Server 1");
  takeCredits(state, "corp");
  expect(getCorp(state).credit).toBe(11);
  takeCredits(state, "runner");
  expect(getCorp(state).credit).toBe(11);
});

describe("constellation-protocol", () => {
  it("basic", () => {
    const state = newGame({ corp: { deck: ["Constellation Protocol", "Ice Wall", "Fire Wall"] } });
    gain(state, "corp", "credit", 100);
    gainClicks(state, "corp", 10);
    playFromHand(state, "corp", "Constellation Protocol", "New remote");
    playFromHand(state, "corp", "Ice Wall", "New remote");
    playFromHand(state, "corp", "Fire Wall", "New remote");
    const cp = getContent(state, "remote1", 0);
    const iw = getIce(state, "remote2", 0);
    const fw = getIce(state, "remote3", 0);
    rez(state, "corp", cp);
    rez(state, "corp", iw);
    rez(state, "corp", fw);
    advance(state, iw, 1);
    advance(state, fw, 1);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    cardAbility(state, "corp", cp, 0);
    expect(getCounters(refresh(state, iw), "advancement")).toBe(1);
    expect(getCounters(refresh(state, fw), "advancement")).toBe(1);
    clickCard(state, "corp", refresh(state, iw));
    clickCard(state, "corp", refresh(state, fw));
    expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
    expect(getCounters(refresh(state, fw), "advancement")).toBe(2);
    endPhase12(state, "corp");
    expect(noPrompt(state, "runner")).toBe(true);
  });

  it("variable number of advanceable cards", () => {
    const state = newGame({ corp: { deck: ["Constellation Protocol", "Ice Wall", "Hive"] } });
    gain(state, "corp", "credit", 100);
    gainClicks(state, "corp", 10);
    playFromHand(state, "corp", "Constellation Protocol", "New remote");
    const cp = getContent(state, "remote1", 0);
    rez(state, "corp", cp);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeFalsy();
    playFromHand(state, "corp", "Ice Wall", "New remote");
    const iw = getIce(state, "remote2", 0);
    rez(state, "corp", iw);
    advance(state, iw, 1);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeFalsy();
    playFromHand(state, "corp", "Hive", "New remote");
    const hive = getIce(state, "remote3", 0);
    rez(state, "corp", hive);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeFalsy();
  });

  it("can't advance assets", () => {
    const state = newGame({ corp: { deck: ["Constellation Protocol", "Ice Wall", "Contract Killer"] } });
    gain(state, "corp", "credit", 100);
    gainClicks(state, "corp", 10);
    playFromHand(state, "corp", "Constellation Protocol", "New remote");
    playFromHand(state, "corp", "Ice Wall", "New remote");
    playFromHand(state, "corp", "Contract Killer", "New remote");
    const cp = getContent(state, "remote1", 0);
    const iw = getIce(state, "remote2", 0);
    const ck = getContent(state, "remote3", 0);
    rez(state, "corp", cp);
    rez(state, "corp", iw);
    rez(state, "corp", ck);
    advance(state, iw, 1);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeFalsy();
  });
});

it("contract-killer", () => {
  const state = newGame({
    corp: { deck: ["Contract Killer"] },
    runner: { deck: [qty("Sure Gamble", 2), "Data Dealer"] },
  });
  gain(state, "corp", "credit", 10);
  playFromHand(state, "corp", "Contract Killer", "New remote");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Data Dealer");
  takeCredits(state, "runner");
  const ck = getContent(state, "remote1", 0);
  advance(state, ck, 2);
  rez(state, "corp", ck);
  cardAbility(state, "corp", ck, 0);
  clickCard(state, "corp", getResource(state, 0));
  expect(getCorp(state).discard.length).toBe(1);
  expect(getRunner(state).discard.length).toBe(1);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  gainClicks(state, "corp", 1);
  move(state, "corp", findCard("Contract Killer", getCorp(state).discard), "hand");
  playFromHand(state, "corp", "Contract Killer", "New remote");
  const ck2 = getContent(state, "remote2", 0);
  rez(state, "corp", ck2);
  advance(state, ck2, 2);
  cardAbility(state, "corp", ck2, 1);
  expect(getCorp(state).discard.length).toBe(1);
  expect(getRunner(state).discard.length).toBe(3);
});

it("corporate-town", () => {
  const state = newGame({
    corp: { deck: ["Corporate Town", "Hostile Takeover"] },
    runner: { deck: ["Data Dealer"] },
  });
  gainClicks(state, "corp", 1);
  playAndScore(state, "Hostile Takeover");
  playFromHand(state, "corp", "Corporate Town", "New remote");
  const ct = getContent(state, "remote2", 0);
  const ht = getScored(state, "corp", 0);
  rez(state, "corp", ct, { expectRez: false });
  clickCard(state, "corp", ht);
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Data Dealer");
  takeCredits(state, "runner");
  cardAbility(state, "corp", ct, 0);
  clickCard(state, "corp", getResource(state, 0));
  expect(getRunner(state).discard.length).toBe(1);
  endPhase12(state, "corp");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect((state as any).corpPhase12).toBeFalsy();
});

it("cpc-generator", () => {
  const state = newGame({ corp: { deck: ["CPC Generator"] } });
  playFromHand(state, "corp", "CPC Generator", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  takeCredits(state, "corp");
  const credits1 = getCorp(state).credit;
  clickCredit(state, "runner");
  expect(getCorp(state).credit - credits1).toBe(1);
  const credits2 = getCorp(state).credit;
  clickCredit(state, "runner");
  expect(getCorp(state).credit - credits2).toBe(0);
});

it("csr-campaign", () => {
  const state = newGame({ corp: { deck: [qty("CSR Campaign", 10)] } });
  playFromHand(state, "corp", "CSR Campaign", "New remote");
  playFromHand(state, "corp", "CSR Campaign", "New remote");
  takeCredits(state, "corp");
  rez(state, "corp", getContent(state, "remote1", 0));
  rez(state, "corp", getContent(state, "remote2", 0));
  takeCredits(state, "runner");
  const cards = getCorp(state).hand.length;
  const csr1 = getContent(state, "remote1", 0);
  const csr2 = getContent(state, "remote2", 0);
  expect((state as any).corpPhase12).toBeTruthy();
  cardAbility(state, "corp", csr1, 0);
  clickPrompt(state, "corp", "Yes");
  expect(getCorp(state).hand.length).toBe(cards + 1);
  cardAbility(state, "corp", csr2, 0);
  clickPrompt(state, "corp", "No");
  expect(getCorp(state).hand.length).toBe(cards + 1);
  endPhase12(state, "corp");
  expect(getCorp(state).hand.length).toBe(cards + 2);
});

it("cybernetics-court", () => {
  const state = newGame({ corp: { deck: ["Cybernetics Court"] } });
  playFromHand(state, "corp", "Cybernetics Court", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  expect(handSize(state, "corp")).toBe(9);
});

describe("cybersand-harvester", () => {
  it("basic", () => {
    const state = newGame({ corp: { deck: ["Cybersand Harvester", qty("Ice Wall", 2)] } });
    playFromHand(state, "corp", "Cybersand Harvester", "New remote");
    const ch = getContent(state, "remote1", 0);
    rez(state, "corp", ch);
    playFromHand(state, "corp", "Ice Wall", "Server 1");
    expect(
      changed(() => getCounters(refresh(state, ch), "credit"), 2, () => rez(state, "corp", getIce(state, "remote1", 0))),
      "Placed 2 credits on Cybersand Harvester"
    ).toBe(true);
    expect(
      changed(
        () => getCounters(refresh(state, ch), "credit"),
        -1,
        () => {
          playFromHand(state, "corp", "Ice Wall", "Server 1");
          clickCard(state, "corp", ch);
        }
      ),
      "Spent 1 credit from Cybersand Harvester"
    ).toBe(true);
    expect(
      changed(() => getCorp(state).credit, 1, () => cardAbility(state, "corp", refresh(state, ch), 0)),
      "Took all hosted credits"
    ).toBe(true);
    expect(getCorp(state).discard.length).toBe(1);
  });

  it("can be trashed when no credits", () => {
    const state = newGame({ corp: { deck: ["Cybersand Harvester"] } });
    playFromHand(state, "corp", "Cybersand Harvester", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    cardAbility(state, "corp", getContent(state, "remote1", 0), 0);
    expect(getCorp(state).discard[0].title).toBe("Cybersand Harvester");
  });
});

describe("daily-business-show", () => {
  it("full test", () => {
    const state = newGame({
      corp: {
        deck: ["Jackson Howard", "Resistor", "Product Placement", "Breaking News"],
        hand: [qty("Daily Business Show", 3), "Hedge Fund"],
        credits: 10,
      },
    });
    playFromHand(state, "corp", "Daily Business Show", "New remote");
    playFromHand(state, "corp", "Daily Business Show", "New remote");
    playFromHand(state, "corp", "Daily Business Show", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    rez(state, "corp", getContent(state, "remote2", 0));
    rez(state, "corp", getContent(state, "remote3", 0));
    takeCredits(state, "corp");
    expect(getCorp(state).hand.length).toBe(1);
    takeCredits(state, "runner");
    expect(getCorp(state).setAside.length).toBe(4);
    expect(noPrompt(state, "runner")).toBe(false);
    clickCard(state, "corp", findCard("Hedge Fund", getCorp(state).hand));
    clickCard(state, "corp", findCard("Resistor", getCorp(state).setAside));
    clickCard(state, "corp", findCard("Product Placement", getCorp(state).setAside));
    clickCard(state, "corp", findCard("Breaking News", getCorp(state).setAside));
    expect(noPrompt(state, "runner")).toBe(true);
    expect(getCorp(state).hand.length).toBe(2);
    expect(getCorp(state).hand[0].title).toBe("Hedge Fund");
    expect(getCorp(state).hand[1].title).toBe("Jackson Howard");
    const deck = getCorp(state).deck;
    expect(deck[deck.length - 1].title).toBe("Resistor");
    expect(deck[deck.length - 2].title).toBe("Product Placement");
    expect(deck[deck.length - 3].title).toBe("Breaking News");
  });

  it("should not trigger if rezzed after mandatory draw", () => {
    const state = newGame({
      corp: { deck: [qty("Daily Business Show", 3), "Hedge Fund", "Jackson Howard", "Resistor", "Product Placement", "Breaking News"] },
    });
    startingHand(state, "corp", ["Daily Business Show"]);
    playFromHand(state, "corp", "Daily Business Show", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    draw(state, "corp");
    expect(getCorp(state).hand.length).toBe(1);
    expect(noPrompt(state, "corp")).toBe(true);
  });

  it("fire on runner turn", () => {
    const state = newGame({
      corp: { deck: ["Daily Business Show", "Hedge Fund", "Resistor", "Product Placement", "Breaking News"] },
      runner: { deck: ["Fisk Investment Seminar"] },
    });
    startingHand(state, "corp", ["Daily Business Show"]);
    playFromHand(state, "corp", "Daily Business Show", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    expect(getCorp(state).hand.length).toBe(0);
    playFromHand(state, "runner", "Fisk Investment Seminar");
    expect(getCorp(state).setAside.length).toBe(4);
    expect(noPrompt(state, "runner")).toBe(false);
    clickCard(state, "corp", findCard("Resistor", getCorp(state).setAside));
    expect(noPrompt(state, "runner")).toBe(true);
    expect(getCorp(state).hand.length).toBe(3);
  });

  it("interaction with Rashida and start of turn effects - issue 4582", () => {
    const state = newGame({
      corp: { deck: [qty("Hedge Fund", 10)], hand: ["Daily Business Show", "Rashida Jaheem"] },
    });
    playFromHand(state, "corp", "Daily Business Show", "New remote");
    playFromHand(state, "corp", "Rashida Jaheem", "New remote");
    takeCredits(state, "corp");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    rez(state, "corp", getContent(state, "remote2", 0));
    cardAbility(state, "corp", getContent(state, "remote2", 0), 0);
    clickPrompt(state, "corp", "Yes");
    expect(getContent(state, "remote2", 0)).toBeNull();
    clickCard(state, "corp", findCard("Hedge Fund", getCorp(state).setAside));
    endPhase12(state, "corp");
    expect(noPrompt(state, "corp")).toBe(true);
  });

  it("interaction with NEH and Political Dealings - DBS first", () => {
    const state = newGame({
      corp: {
        id: "Near-Earth Hub: Broadcast Center",
        deck: [qty("Hedge Fund", 10)],
        hand: ["Daily Business Show", "Political Dealings", "Merger"],
        credits: 20,
      },
    });
    playFromHand(state, "corp", "Daily Business Show", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    playFromHand(state, "corp", "Political Dealings", "New remote");
    rez(state, "corp", getContent(state, "remote2", 0));
    takeCredits(state, "corp");
    move(state, "corp", findCard("Merger", getCorp(state).hand), "deck");
    takeCredits(state, "runner");
    clickPrompt(state, "corp", "Daily Business Show");
    clickCard(state, "corp", "Merger");
    clickPrompt(state, "corp", "Carry on!");
  });

  it("interaction with NEH and Political Dealings - Political Dealings first", () => {
    const state = newGame({
      corp: {
        id: "Near-Earth Hub: Broadcast Center",
        deck: [qty("Hedge Fund", 10)],
        hand: ["Daily Business Show", "Political Dealings", "Merger", "Ice Wall"],
        credits: 20,
      },
    });
    playFromHand(state, "corp", "Daily Business Show", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    playFromHand(state, "corp", "Political Dealings", "New remote");
    rez(state, "corp", getContent(state, "remote2", 0));
    takeCredits(state, "corp");
    move(state, "corp", findCard("Ice Wall", getCorp(state).hand), "deck");
    move(state, "corp", findCard("Merger", getCorp(state).hand), "deck");
    takeCredits(state, "runner");
    clickPrompt(state, "corp", "Political Dealings");
    clickPrompt(state, "corp", "Yes");
    clickPrompt(state, "corp", "New remote");
    clickPrompt(state, "corp", "Carry on!");
    clickCard(state, "corp", "Ice Wall");
    expect(noPrompt(state, "corp")).toBe(true);
  });
});

describe("daily-quest", () => {
  it("can only rez during corp's action phase", () => {
    const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Daily Quest"] } });
    playFromHand(state, "corp", "Daily Quest", "New remote");
    const dq = getContent(state, "remote1", 0);
    rez(state, "corp", dq);
    expect(rezzed(refresh(state, dq))).toBe(true);
    derez(state, "corp", dq);
    takeCredits(state, "corp");
    rez(state, "corp", dq, { expectRez: false });
    expect(rezzed(refresh(state, dq))).toBe(false);
  });

  it("runner gains credits on successful runs", () => {
    const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Daily Quest"] } });
    playFromHand(state, "corp", "Daily Quest", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    expect(getRunner(state).credit).toBe(5);
    runEmptyServer(state, "remote1");
    clickPrompt(state, "runner", "No action");
    expect(getRunner(state).credit).toBe(7);
    runEmptyServer(state, "remote1");
    clickPrompt(state, "runner", "No action");
    expect(getRunner(state).credit).toBe(9);
    runOn(state, "remote1");
    runJackOut(state);
    expect(getRunner(state).credit).toBe(9);
    expect(getCorp(state).credit).toBe(6);
    takeCredits(state, "runner");
    expect(getCorp(state).credit).toBe(6);
  });

  it("corp gains credits on no successful runs last turn", () => {
    const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Daily Quest"] } });
    playFromHand(state, "corp", "Daily Quest", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    runEmptyServer(state, "hq");
    runEmptyServer(state, "rd");
    clickPrompt(state, "runner", "No action");
    runEmptyServer(state, "archives");
    runOn(state, "remote1");
    runJackOut(state);
    expect(getRunner(state).credit).toBe(5);
    expect(getCorp(state).credit).toBe(6);
    takeCredits(state, "runner");
    expect(getCorp(state).credit).toBe(9);
  });

  it("corp gains credits when no runs last turn - issue 4447", () => {
    const state = newGame({ corp: { deck: [qty("Hedge Fund", 5)], hand: ["Daily Quest"] } });
    playFromHand(state, "corp", "Daily Quest", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    expect(getCorp(state).credit).toBe(6);
    takeCredits(state, "runner");
    expect(getCorp(state).credit).toBe(9);
  });

  it("works when hosted #4571", () => {
    const state = newGame({
      corp: { deck: [qty("Hedge Fund", 5)], hand: ["Daily Quest", "Full Immersion RecStudio"], credits: 10 },
    });
    playFromHand(state, "corp", "Full Immersion RecStudio", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    cardAbility(state, "corp", getContent(state, "remote1", 0), 0);
    clickCard(state, "corp", "Daily Quest");
    rez(state, "corp", (getContent(state, "remote1", 0) as any).hosted[0]);
    takeCredits(state, "corp");
    runEmptyServer(state, "remote1");
    clickCard(state, "runner", "Daily Quest");
    clickPrompt(state, "runner", "No action");
    expect(getRunner(state).credit).toBe(7);
  });
});

it("dedicated-response-team", () => {
  const state = newGame({ corp: { deck: ["Dedicated Response Team"] } });
  playFromHand(state, "corp", "Dedicated Response Team", "New remote");
  const drt = getContent(state, "remote1", 0);
  rez(state, "corp", drt);
  takeCredits(state, "corp");
  runEmptyServer(state, "rd");
  expect(getRunner(state).discard.length).toBe(0);
  gainTags(state, "runner", 1);
  runOn(state, "rd");
  runJackOut(state);
  expect(getRunner(state).discard.length).toBe(0);
  runEmptyServer(state, "rd");
  expect(getRunner(state).discard.length).toBe(2);
});

describe("dedicated-server", () => {
  it("basic", () => {
    const state = newGame({ corp: { deck: ["Dedicated Server"] } });
    playFromHand(state, "corp", "Dedicated Server", "New remote");
    const server = getContent(state, "remote1", 0);
    rez(state, "corp", server);
    expect(getCounters(refresh(state, server), "recurring")).toBe(2);
  });

  it("pay-credits prompt", () => {
    const state = newGame({ corp: { deck: ["Dedicated Server", "Ice Wall"] } });
    playFromHand(state, "corp", "Dedicated Server", "New remote");
    playFromHand(state, "corp", "Ice Wall", "HQ");
    const server = getContent(state, "remote1", 0);
    const iw = getIce(state, "hq", 0);
    rez(state, "corp", server);
    expect(
      changed(() => getCorp(state).credit, 0, () => {
        rez(state, "corp", iw, { expectRez: false });
        clickCard(state, "corp", server);
      }),
      "Used 1 credit from Dedicated Server"
    ).toBe(true);
  });
});

it("director-haas", () => {
  const state = newGame({ corp: { deck: [qty("Director Haas", 2)] } });
  playFromHand(state, "corp", "Director Haas", "New remote");
  playFromHand(state, "corp", "Director Haas", "Server 1");
  clickPrompt(state, "corp", "OK");
  expect(getCorp(state).discard.length).toBe(1);
  expect(getRunner(state).agendaPoint).toBe(0);
  const dh = getContent(state, "remote1", 0);
  rez(state, "corp", dh);
  expect(getCorp(state).click).toBe(1);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getCorp(state).click).toBe(4);
  takeCredits(state, "corp");
  takeCredits(state, "runner", 3);
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "Pay 5 [Credits] to trash");
  takeCredits(state, "runner");
  expect(getCorp(state).click).toBe(3);
  expect(getScored(state, "runner").length).toBe(1);
  expect(getRunner(state).agendaPoint).toBe(2);
});

it("docklands-crackdown", () => {
  function dlcdTest(number: number) {
    const state = newGame({
      corp: { hand: ["Docklands Crackdown", qty("Vanilla", 2)] },
      runner: { hand: [qty("Gachapon", 2)] },
    });
    playFromHand(state, "corp", "Docklands Crackdown", "New remote");
    const dlcd = getContent(state, "remote1", 0);
    rez(state, "corp", dlcd);
    addProp(state, "corp", dlcd, "power", number);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect(
      changed(() => getCorp(state).credit, 0, () => playFromHand(state, "corp", "Vanilla", "HQ")),
      "No additional cost for installing the first Corp card"
    ).toBe(true);
    expect(
      changed(() => getCorp(state).credit, 0, () => playFromHand(state, "corp", "Vanilla", "R&D")),
      "No additional cost for installing the next Corp card"
    ).toBe(true);
    takeCredits(state, "corp");
    expect(
      changed(() => getRunner(state).credit, -number, () => playFromHand(state, "runner", "Gachapon")),
      "Additional cost for installing the first Runner card"
    ).toBe(true);
    expect(
      changed(() => getRunner(state).credit, 0, () => playFromHand(state, "runner", "Gachapon")),
      "No additional cost for installing the next Runner card"
    ).toBe(true);
  }
  for (const n of [0, 1, 2, 3, 4]) {
    dlcdTest(n);
  }
});

it("dr-vientiane-keeling", () => {
  const state = newGame({
    corp: { hand: ["Dr. Vientiane Keeling"] },
    runner: { hand: ["Sure Gamble"] },
  });
  playFromHand(state, "corp", "Dr. Vientiane Keeling", "New remote");
  const dr = getContent(state, "remote1", 0);
  rez(state, "corp", dr);
  for (let i = 0; i < 5; i++) {
    const c = i + 1;
    expect(getCounters(refresh(state, dr), "power")).toBe(c);
    expect(handSize(state, "runner")).toBe(5 - c);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
  }
});

it("drago-ivanov", () => {
  const state = newGame({ corp: { hand: ["Drago Ivanov"], credits: 10 } });
  gainClicks(state, "corp", 3);
  playFromHand(state, "corp", "Drago Ivanov", "New remote");
  const drago = getContent(state, "remote1", 0);
  advance(state, refresh(state, drago), 4);
  expect(getCounters(refresh(state, drago), "advancement")).toBe(4);
  rez(state, "corp", refresh(state, drago));
  expect(
    changed(() => countTags(state), 1, () => {
      cardAbility(state, "corp", refresh(state, drago), 0);
      expect(getCounters(refresh(state, drago), "advancement")).toBe(2);
    }),
    "Drago tagged the runner"
  ).toBe(true);
  takeCredits(state, "corp");
  expect(
    changed(() => countTags(state), 0, () => {
      cardAbility(state, "corp", refresh(state, drago), 0);
      expect(getCounters(refresh(state, drago), "advancement")).toBe(2);
    }),
    "Drago cannot be used on the runner's turn"
  ).toBe(true);
});

it("drudge-work", () => {
  const state = newGame({
    corp: {
      deck: ["Drudge Work", "Hostile Takeover", "Standoff", "Global Food Initiative", "Armed Intimidation", "Hedge Fund"],
    },
  });
  gainClicks(state, "corp", 2);
  playFromHand(state, "corp", "Drudge Work", "New remote");
  playFromHand(state, "corp", "Armed Intimidation", "New remote");
  trashFromHand(state, "corp", "Hostile Takeover");
  const hand = getCorp(state).hand;
  const drudgeWork = getContent(state, "remote1", 0);
  const ai = getContent(state, "remote2", 0);
  const ht = findCard("Hostile Takeover", getCorp(state).discard);
  const standoff = findCard("Standoff", hand);
  const gfi = findCard("Global Food Initiative", hand);
  const hf = findCard("Hedge Fund", hand);
  rez(state, "corp", drudgeWork);
  expect(getCorp(state).credit).toBe(3);
  expect(getCounters(refresh(state, drudgeWork), "power")).toBe(3);
  // selecting installed agenda or operation
  cardAbility(state, "corp", refresh(state, drudgeWork), 0);
  clickCard(state, "corp", ai);
  expect(getContent(state, "remote2", 0)).toBeTruthy();
  expect(getCounters(refresh(state, drudgeWork), "power")).toBe(3);
  expect(getCorp(state).credit).toBe(3);
  expect(getCorp(state).deck.length).toBe(0);
  clickCard(state, "corp", hf);
  expect(getCorp(state).hand.length).toBe(3);
  expect(getCounters(refresh(state, drudgeWork), "power")).toBe(3);
  // gain credits from HQ agenda
  clickCard(state, "corp", gfi);
  expect(getCorp(state).deck.length).toBe(1);
  expect(getCorp(state).hand.length).toBe(2);
  expect(getCorp(state).click).toBe(2);
  expect(getCounters(refresh(state, drudgeWork), "power")).toBe(2);
  expect(getCorp(state).credit).toBe(6);
  // gain credits from Archives agenda
  cardAbility(state, "corp", refresh(state, drudgeWork), 0);
  clickCard(state, "corp", ht);
  expect(getCorp(state).deck.length).toBe(2);
  expect(getCorp(state).hand.length).toBe(2);
  expect(getCorp(state).click).toBe(1);
  expect(getCounters(refresh(state, drudgeWork), "power")).toBe(1);
  expect(getCorp(state).credit).toBe(7);
  // Standoff (0 points) - trashes drudge work
  cardAbility(state, "corp", refresh(state, drudgeWork), 0);
  clickCard(state, "corp", standoff);
  expect(getCorp(state).deck.length).toBe(3);
  expect(getCorp(state).hand.length).toBe(1);
  expect(getCorp(state).click).toBe(0);
  expect(getCorp(state).discard[0].title).toBe("Drudge Work");
  expect(getCorp(state).credit).toBe(7);
});

it("early-premiere", () => {
  const state = newGame({ corp: { deck: ["Early Premiere", "Ice Wall", "Ghost Branch", "Blacklist"] } });
  gainClicks(state, "corp", 1);
  playFromHand(state, "corp", "Early Premiere", "New remote");
  playFromHand(state, "corp", "Blacklist", "New remote");
  playFromHand(state, "corp", "Ghost Branch", "New remote");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  const ep = getContent(state, "remote1", 0);
  const bl = getContent(state, "remote2", 0);
  const gb = getContent(state, "remote3", 0);
  const iw = getIce(state, "hq", 0);
  rez(state, "corp", ep);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  cardAbility(state, "corp", ep, 0);
  clickCard(state, "corp", iw);
  expect(getCounters(refresh(state, iw), "advancement")).toBe(0);
  clickCard(state, "corp", bl);
  expect(getCounters(refresh(state, bl), "advancement")).toBe(0);
  clickCard(state, "corp", gb);
  expect(getCounters(refresh(state, gb), "advancement")).toBe(1);
  expect(getCorp(state).credit).toBe(4);
});

it("echo-chamber", () => {
  const state = newGame({ corp: { deck: ["Echo Chamber"] } });
  gainClicks(state, "corp", 1);
  playFromHand(state, "corp", "Echo Chamber", "New remote");
  const ec = getContent(state, "remote1", 0);
  rez(state, "corp", ec);
  cardAbility(state, "corp", ec, 0);
  expect(getScored(state, "corp", 0).agendapoints).toBe(1);
});

it("edge-of-world", () => {
  const state = newGame({ corp: { deck: [qty("Edge of World", 3), qty("Ice Wall", 3)] } });
  gain(state, "corp", "credit", 6);
  gainClicks(state, "corp", 1);
  playFromHand(state, "corp", "Edge of World", "New remote");
  playFromHand(state, "corp", "Edge of World", "New remote");
  playFromHand(state, "corp", "Ice Wall", "Server 1");
  playFromHand(state, "corp", "Ice Wall", "Server 1");
  takeCredits(state, "corp");
  runOn(state, "Server 1");
  runContinueUntil(state, "success");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "runner", "Pay 0 [Credits] to trash");
  expect(getRunner(state).brainDamage).toBe(2);
  runEmptyServer(state, "Server 2");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "runner", "Pay 0 [Credits] to trash");
  expect(getRunner(state).brainDamage).toBe(2);
});

it("eliza-s-toybox", () => {
  const state = newGame({ corp: { deck: ["Eliza's Toybox", "Wotan", "Archer"] } });
  playFromHand(state, "corp", "Wotan", "R&D");
  playFromHand(state, "corp", "Archer", "HQ");
  playFromHand(state, "corp", "Eliza's Toybox", "New remote");
  const wotan = getIce(state, "rd", 0);
  const archer = getIce(state, "hq", 0);
  const eliza = getContent(state, "remote1", 0);
  rez(state, "corp", eliza);
  expect(getCorp(state).credit).toBe(1);
  expect(getCorp(state).click).toBe(0);
  gainClicks(state, "corp", 6);
  cardAbility(state, "corp", eliza, 0);
  clickCard(state, "corp", wotan);
  expect(rezzed(refresh(state, wotan))).toBe(true);
  expect(getCorp(state).click).toBe(3);
  expect(getCorp(state).credit).toBe(1);
  cardAbility(state, "corp", eliza, 0);
  clickCard(state, "corp", archer);
  expect(rezzed(refresh(state, archer))).toBe(true);
  expect(getCorp(state).click).toBe(0);
  expect(getCorp(state).credit).toBe(1);
});

it("elizabeth-mills", () => {
  const state = newGame({
    corp: { deck: ["Elizabeth Mills"] },
    runner: { deck: ["Earthrise Hotel"] },
  });
  gain(state, "corp", "bad-publicity", 1);
  playFromHand(state, "corp", "Elizabeth Mills", "New remote");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Earthrise Hotel");
  takeCredits(state, "runner");
  const liz = getContent(state, "remote1", 0);
  const hotel = getResource(state, 0);
  rez(state, "corp", liz);
  expect(countBadPub(state)).toBe(0);
  cardAbility(state, "corp", liz, 0);
  clickCard(state, "corp", hotel);
  expect(getRunner(state).discard.length).toBe(1);
  expect(getCorp(state).discard.length).toBe(1);
  expect(countBadPub(state)).toBe(1);
});

it("encryption-protocol", () => {
  const state = newGame({ corp: { deck: [qty("Encryption Protocol", 2)] } });
  playFromHand(state, "corp", "Encryption Protocol", "New remote");
  playFromHand(state, "corp", "Encryption Protocol", "New remote");
  const ep1 = getContent(state, "remote1", 0);
  const ep2 = getContent(state, "remote2", 0);
  rez(state, "corp", ep1);
  rez(state, "corp", ep2);
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  expect(core.trashCost(state, "runner", refresh(state, ep1))).toBe(4);
  clickPrompt(state, "runner", "Pay 4 [Credits] to trash");
  runEmptyServer(state, "Server 2");
  expect(core.trashCost(state, "runner", refresh(state, ep2))).toBe(3);
});

it("esca", () => {
  for (const [tags, dmg] of [[0, 0], [1, 1], [15, 1]] as [number, number][]) {
    const state = newGame({
      corp: { discard: ["Esca"] },
      runner: { hand: ["Ika", "Ika"], tags },
    });
    takeCredits(state, "corp");
    expect(
      changedMulti(
        [
          [() => getRunner(state).credit, -1],
          [() => getRunner(state).hand.length, -dmg],
        ],
        () => runEmptyServer(state, "archives")
      ),
      "Tanked it"
    ).toBe(true);
  }
});

it("estelle-moon", () => {
  function estelleTest(number: number) {
    const state = newGame({ corp: { deck: ["Estelle Moon", qty("Encryption Protocol", 20)] } });
    startingHand(state, "corp", Array(9).fill("Encryption Protocol"));
    move(state, "corp", findCard("Estelle Moon", getCorp(state).deck), "hand");
    playFromHand(state, "corp", "Estelle Moon", "New remote");
    const em = getContent(state, "remote1", 0);
    rez(state, "corp", refresh(state, em));
    gainClicks(state, "corp", 10);
    for (let i = 0; i < number; i++) {
      playFromHand(state, "corp", "Encryption Protocol", "New remote");
    }
    const credits = getCorp(state).credit;
    const hand = getCorp(state).hand.length;
    cardAbility(state, "corp", refresh(state, em), 0);
    expect(getCorp(state).credit - credits).toBe(number * 2);
    expect(getCorp(state).hand.length - hand).toBe(number);
    expect(getCorp(state).discard.length).toBe(1);
  }
  for (let i = 0; i < 10; i++) {
    estelleTest(i);
  }
});

it("estelle-moon-triggers-multiple-times-after-derez-4601", () => {
  const state = newGame({
    corp: {
      hand: ["Estelle Moon", "Divert Power", qty("Encryption Protocol", 3)],
      deck: [qty("Encryption Protocol", 20)],
    },
  });
  gainClicks(state, "corp", 1);
  playFromHand(state, "corp", "Estelle Moon", "New remote");
  const em = getContent(state, "remote1", 0);
  rez(state, "corp", refresh(state, em));
  playFromHand(state, "corp", "Encryption Protocol", "New remote");
  expect(getCounters(refresh(state, em), "power")).toBe(1);
  playFromHand(state, "corp", "Divert Power");
  clickCard(state, "corp", refresh(state, em));
  clickCard(state, "corp", refresh(state, em));
  playFromHand(state, "corp", "Encryption Protocol", "New remote");
  expect(getCounters(refresh(state, em), "power")).toBe(2);
});

it("eve-campaign", () => {
  const state = newGame({ corp: { deck: ["Eve Campaign"] } });
  playFromHand(state, "corp", "Eve Campaign", "New remote");
  const eve = getContent(state, "remote1", 0);
  rez(state, "corp", eve);
  expect(getCorp(state).credit).toBe(0);
  expect(getCounters(refresh(state, eve), "credit")).toBe(16);
  takeCredits(state, "corp", 2);
  takeCredits(state, "runner");
  expect(getCorp(state).credit).toBe(4);
  expect(getCounters(refresh(state, eve), "credit")).toBe(14);
});

describe("executive-boot-camp", () => {
  it("suppress start-of-turn event on rezzed card - issue 1346", () => {
    const state = newGame({ corp: { deck: ["Eve Campaign", "Executive Boot Camp"] } });
    playFromHand(state, "corp", "Eve Campaign", "New remote");
    playFromHand(state, "corp", "Executive Boot Camp", "New remote");
    takeCredits(state, "corp");
    expect(getCorp(state).credit).toBe(6);
    const eve = getContent(state, "remote1", 0);
    const ebc = getContent(state, "remote2", 0);
    rez(state, "corp", ebc);
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    clickCard(state, "corp", "Eve Campaign");
    expect(getCorp(state).credit).toBe(2);
    expect(getCounters(refresh(state, eve), "credit")).toBe(16);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    clickPrompt(state, "corp", "Executive Boot Camp");
    expect((state as any).corpPhase12).toBeFalsy();
    expect(getCounters(refresh(state, eve), "credit")).toBe(14);
  });

  it("works with ice that has alternate rez costs", () => {
    const state = newGame({ corp: { deck: ["15 Minutes", "Executive Boot Camp", "Tithonium"] } });
    gain(state, "corp", "credit", 3);
    scoreAgenda(state, "corp", findCard("15 Minutes", getCorp(state).hand));
    playFromHand(state, "corp", "Tithonium", "HQ");
    playFromHand(state, "corp", "Executive Boot Camp", "New remote");
    const ebc = getContent(state, "remote1", 0);
    const tith = getIce(state, "hq", 0);
    rez(state, "corp", ebc);
    takeCredits(state, "corp");
    expect(getCorp(state).credit).toBe(9);
    takeCredits(state, "runner");
    expect(rezzed(refresh(state, tith))).toBe(false);
    clickCard(state, "corp", tith);
    clickPrompt(state, "corp", "No");
    expect(installed(refresh(state, tith)) && rezzed(refresh(state, tith))).toBe(true);
    expect(getCorp(state).credit).toBe(1);
  });

  it("works with pay-credits prompt for Mumba Temple", () => {
    const state = newGame({ corp: { deck: ["Mumba Temple", "Eve Campaign", "Executive Boot Camp"] } });
    playFromHand(state, "corp", "Eve Campaign", "New remote");
    playFromHand(state, "corp", "Executive Boot Camp", "New remote");
    playFromHand(state, "corp", "Mumba Temple", "New remote");
    takeCredits(state, "corp");
    expect(getCorp(state).credit).toBe(5);
    const eve = getContent(state, "remote1", 0);
    const ebc = getContent(state, "remote2", 0);
    const mum = getContent(state, "remote3", 0);
    rez(state, "corp", ebc);
    rez(state, "corp", mum);
    takeCredits(state, "runner");
    clickCard(state, "corp", "Eve Campaign");
    for (let i = 0; i < 2; i++) clickCard(state, "corp", mum);
    expect(getCorp(state).credit).toBe(2);
    expect(getCounters(refresh(state, eve), "credit")).toBe(16);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    clickPrompt(state, "corp", "Executive Boot Camp");
    expect((state as any).corpPhase12).toBeFalsy();
    expect(getCounters(refresh(state, eve), "credit")).toBe(14);
  });
});

it("executive-search-firm", () => {
  const state = newGame({
    corp: { deck: ["Executive Search Firm", "Elizabeth Mills", "Midori", "Shannon Claire"] },
  });
  startingHand(state, "corp", ["Executive Search Firm"]);
  gainClicks(state, "corp", 4);
  playFromHand(state, "corp", "Executive Search Firm", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  for (const card of ["Elizabeth Mills", "Midori", "Shannon Claire"]) {
    const esf = getContent(state, "remote1", 0);
    const shuffles = core.turnEvents(state, "corp", "corp-shuffle-deck").length;
    cardAbility(state, "corp", esf, 0);
    clickPrompt(state, "corp", findCard(card, getCorp(state).deck).title);
    expect(getCorp(state).hand[0].title).toBe(card);
    move(state, "corp", findCard(card, getCorp(state).hand), "deck");
    expect(core.turnEvents(state, "corp", "corp-shuffle-deck").length).toBeGreaterThan(shuffles);
  }
});

it("expose", () => {
  const state = newGame({ corp: { deck: ["Exposé"] } });
  gain(state, "corp", "credit", 100);
  gainClicks(state, "corp", 100);
  for (let i = 0; i < 5; i++) {
    playFromHand(state, "corp", "Exposé", "New remote");
    const expose = getContent(state, `remote${i + 1}`, 0);
    rez(state, "corp", refresh(state, expose));
    expect(countBadPub(state)).toBe(0);
    if (i > 0) {
      gain(state, "corp", "bad-publicity", i);
      expect(countBadPub(state)).toBe(i);
      advance(state, refresh(state, expose), i);
    }
    cardAbility(state, "corp", refresh(state, expose), 0);
    expect(countBadPub(state)).toBe(0);
    expect(getCorp(state).discard.length).toBe(1);
    expect(getCorp(state).discard[0].title).toBe("Exposé");
    move(state, "corp", findCard("Exposé", getCorp(state).discard), "hand");
  }
});

describe("false-flag", () => {
  it("corp can score with 7 advancements", () => {
    const state = newGame({ corp: { deck: ["False Flag"] } });
    playFromHand(state, "corp", "False Flag", "New remote");
    const ff = getContent(state, "remote1", 0);
    addProp(state, "corp", ff, "advancement", 7);
    rez(state, "corp", refresh(state, ff));
    cardAbility(state, "corp", refresh(state, ff), 0);
    expect(getContent(state, "remote1", 0)).toBeNull();
    expect(getScored(state, "corp", 0).agendapoints).toBe(3);
    expect(getCorp(state).click).toBe(1);
  });

  it("corp cannot score with less than 7 advancements", () => {
    const state = newGame({ corp: { deck: ["False Flag"] } });
    playFromHand(state, "corp", "False Flag", "New remote");
    const ff = getContent(state, "remote1", 0);
    addProp(state, "corp", ff, "advancement", 6);
    rez(state, "corp", refresh(state, ff));
    cardAbility(state, "corp", refresh(state, ff), 0);
    expect(getContent(state, "remote1", 0)).toBeTruthy();
    expect(getScored(state, "corp", 0)).toBeUndefined();
    expect(getCorp(state).click).toBe(2);
  });

  it("tags on access", () => {
    for (const [advancements, expectedTags] of [[0, 0], [2, 1], [5, 2], [10, 5]] as [number, number][]) {
      const state = newGame({ corp: { deck: ["False Flag"] } });
      playFromHand(state, "corp", "False Flag", "New remote");
      addProp(state, "corp", makeEid(state), getContent(state, "remote1", 0), "advance-counter", advancements);
      takeCredits(state, "corp");
      runEmptyServer(state, "Server 1");
      clickPrompt(state, "runner", "No action");
      expect(countTags(state)).toBe(expectedTags);
    }
  });
});

it("federal-fundraising", () => {
  const state = newGame({
    corp: { hand: ["Federal Fundraising", "Accelerated Beta Test", "Brainstorm", "Chiyashi", "DNA Tracker"] },
  });
  move(state, "corp", findCard("Accelerated Beta Test", getCorp(state).hand), "deck");
  move(state, "corp", findCard("Brainstorm", getCorp(state).hand), "deck");
  move(state, "corp", findCard("Chiyashi", getCorp(state).hand), "deck");
  move(state, "corp", findCard("DNA Tracker", getCorp(state).hand), "deck");
  playFromHand(state, "corp", "Federal Fundraising", "New remote");
  const ff = getContent(state, "remote1", 0);
  rez(state, "corp", ff);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect((state as any).corpPhase12).toBeTruthy();
  cardAbility(state, "corp", ff, 0);
  clickPrompt(state, "corp", "Yes");
  expect(promptButtons(state, "corp").map((b: any) => b.title || b)).toEqual(["Accelerated Beta Test", "Brainstorm", "Chiyashi"]);
  clickPrompt(state, "corp", "Brainstorm");
  clickPrompt(state, "corp", "Accelerated Beta Test");
  clickPrompt(state, "corp", "Chiyashi");
  clickPrompt(state, "corp", "Done");
  const deck = getCorp(state).deck;
  expect(deck[0].title).toBe("Chiyashi");
  expect(deck[1].title).toBe("Accelerated Beta Test");
  expect(deck[2].title).toBe("Brainstorm");
  expect(
    changed(() => getCorp(state).hand.length, 1, () => clickPrompt(state, "corp", "Yes")),
    "Corp drew 1 card"
  ).toBe(true);
  endPhase12(state, "corp");
  expect(noPrompt(state, "corp")).toBe(true);
});

it("franchise-city", () => {
  const state = newGame({ corp: { deck: ["Franchise City", "Accelerated Beta Test"] } });
  playFromHand(state, "corp", "Franchise City", "New remote");
  playFromHand(state, "corp", "Accelerated Beta Test", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  takeCredits(state, "corp", 1);
  runEmptyServer(state, "Server 2");
  clickPrompt(state, "runner", "Steal");
  expect(getContent(state, "remote2").length).toBe(0);
  expect(getRunner(state).agendaPoint).toBe(2);
  expect(findCard("Franchise City", getCorp(state).scored)).toBeTruthy();
  expect(getCorp(state).agendaPoint).toBe(1);
});

it("front-company", () => {
  const state = newGame({
    corp: { deck: [], hand: ["Front Company"] },
    runner: { hand: [qty("Sure Gamble", 5)] },
  });
  playFromHand(state, "corp", "Front Company", "New remote");
  const fc = getContent(state, "remote1", 0);
  rez(state, "corp", fc);
  expect(rezzed(refresh(state, fc))).toBe(true);
  derez(state, "corp", fc);
  takeCredits(state, "corp");
  rez(state, "corp", fc, { expectRez: false });
  expect(rezzed(refresh(state, fc))).toBe(false);
  takeCredits(state, "runner");
  rez(state, "corp", fc);
  takeCredits(state, "corp");
  expect(core.canRunServer(state, "Server 1")).toBe(false);
  runEmptyServer(state, "HQ");
  expect(core.canRunServer(state, "Server 1")).toBe(true);
  expect(getRunner(state).discard.length).toBe(0);
  runOn(state, "Archives");
  expect(getRunner(state).discard.length).toBe(2);
  runJackOut(state);
  runOn(state, "Archives");
  expect(getRunner(state).discard.length).toBe(2);
});

describe("full-immersion-recstudio", () => {
  it("full test", () => {
    const state = newGame({
      corp: { deck: ["Full Immersion RecStudio", qty("Interns", 2), qty("Launch Campaign", 3)] },
    });
    playFromHand(state, "corp", "Full Immersion RecStudio", "New remote");
    const fir = getContent(state, "remote1", 0);
    rez(state, "corp", fir);
    cardAbility(state, "corp", fir, 0);
    clickCard(state, "corp", findCard("Launch Campaign", getCorp(state).hand));
    const lc = (refresh(state, fir) as any).hosted[0];
    expect(lc).toBeTruthy();
    rez(state, "corp", lc);
    expect(installed(refresh(state, lc)) && rezzed(refresh(state, lc))).toBe(true);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect(getCorp(state).credit).toBe(5);
    expect(getCounters(refresh(state, lc), "credit")).toBe(4);
    playFromHand(state, "corp", "Interns");
    clickCard(state, "corp", findCard("Launch Campaign", getCorp(state).hand));
    clickPrompt(state, "corp", refresh(state, fir).title);
    expect((refresh(state, fir) as any).hosted.length).toBe(2);
  });

  it("hosting an asset with events does not double-register events - issue 1827", () => {
    const state = newGame({ corp: { deck: ["Full Immersion RecStudio", "Sandburg", "Vanilla", "Oaktown Renovation"] } });
    playFromHand(state, "corp", "Full Immersion RecStudio", "New remote");
    playFromHand(state, "corp", "Vanilla", "HQ");
    const fir = getContent(state, "remote1", 0);
    const van = getIce(state, "hq", 0);
    rez(state, "corp", fir);
    rez(state, "corp", van);
    cardAbility(state, "corp", fir, 0);
    clickCard(state, "corp", findCard("Sandburg", getCorp(state).hand));
    gain(state, "corp", "credit", 7);
    gainClicks(state, "corp", 3);
    rez(state, "corp", (refresh(state, fir) as any).hosted[0]);
    expect(getStrength(refresh(state, van))).toBe(2);
    cardAbility(state, "corp", fir, 0);
    clickCard(state, "corp", findCard("Oaktown Renovation", getCorp(state).hand));
    clickAdvance(state, "corp", (refresh(state, fir) as any).hosted.at(-1));
    expect(getCorp(state).credit).toBe(11);
  });

  it("vs NGO Front - issue #5617", () => {
    const state = newGame({ corp: { hand: ["Full Immersion RecStudio", "NGO Front"] } });
    playFromHand(state, "corp", "Full Immersion RecStudio", "New remote");
    const rec = getContent(state, "remote1", 0);
    rez(state, "corp", rec);
    cardAbility(state, "corp", refresh(state, rec), 0);
    clickCard(state, "corp", "NGO Front");
    const ngo = (refresh(state, rec) as any).hosted[0];
    addProp(state, "corp", ngo, "advancement", 1);
    rez(state, "corp", refresh(state, ngo));
    cardAbility(state, "corp", refresh(state, ngo), 0);
    expect(refresh(state, ngo)).toBeFalsy();
    expect((refresh(state, rec) as any).hosted.length).toBe(0);
    expect(getCorp(state).discard.map((c: any) => c.title)).toEqual(["NGO Front"]);
  });
});

it("fumiko-yamamori", () => {
  const state = newGame({ corp: { deck: ["Fumiko Yamamori"] } });
  gain(state, "corp", "credit", 10);
  playFromHand(state, "corp", "Fumiko Yamamori", "New remote");
  const fumiko = getContent(state, "remote1", 0);
  rez(state, "corp", refresh(state, fumiko));
  core.psiGame(state, "corp", refresh(state, fumiko), {
    equal: { msg: "resolve equal bets effect" },
    notEqual: { msg: "resolve unequal bets effect" },
  });
  clickPrompt(state, "corp", "2 [Credits]");
  clickPrompt(state, "runner", "0 [Credits]");
  expect(getRunner(state).discard.length).toBe(1);
});

it("gaslight", () => {
  const state = newGame({ corp: { hand: ["Gaslight"], deck: ["Hedge Fund"] } });
  playFromHand(state, "corp", "Gaslight", "New remote");
  const gasl = getContent(state, "remote1", 0);
  rez(state, "corp", refresh(state, gasl));
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect((state as any).corpPhase12).toBeTruthy();
  cardAbility(state, "corp", gasl, 0);
  clickPrompt(state, "corp", "Yes");
  expect(
    changed(() => getCorp(state).hand.length, 1, () => clickPrompt(state, "corp", "Hedge Fund")),
    "Hedge Fund moved to HQ"
  ).toBe(true);
  expect(getCorp(state).discard.length).toBe(1);
});

describe("gene-splicer", () => {
  it("runner accesses unadvanced and doesn't trash", () => {
    const state = newGame({ corp: { deck: ["Gene Splicer"] }, runner: { deck: [qty("Sure Gamble", 3)] } });
    playFromHand(state, "corp", "Gene Splicer", "New remote");
    takeCredits(state, "corp");
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "runner", "No action");
    expect(getRunner(state).discard.length).toBe(0);
    expect(getContent(state, "remote1", 0).title).toBe("Gene Splicer");
    expect(getRunner(state).credit).toBe(5);
  });

  it("runner accesses unadvanced and trashes", () => {
    const state = newGame({ corp: { deck: ["Gene Splicer"] }, runner: { deck: [qty("Sure Gamble", 3)] } });
    playFromHand(state, "corp", "Gene Splicer", "New remote");
    takeCredits(state, "corp");
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(0);
    expect(getContent(state, "remote1", 0)).toBeNull();
    expect(getCorp(state).discard.at(-1).title).toBe("Gene Splicer");
    expect(getRunner(state).credit).toBe(4);
  });

  it("runner accesses single-advanced and doesn't trash", () => {
    const state = newGame({ corp: { deck: ["Gene Splicer"] }, runner: { deck: [qty("Sure Gamble", 3)] } });
    playFromHand(state, "corp", "Gene Splicer", "New remote");
    addProp(state, "corp", makeEid(state), getContent(state, "remote1", 0), "advancement", 1);
    takeCredits(state, "corp");
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "runner", "No action");
    expect(getRunner(state).discard.length).toBe(1);
    expect(getContent(state, "remote1", 0).title).toBe("Gene Splicer");
    expect(getRunner(state).credit).toBe(5);
  });

  it("runner accesses single-advanced and trashes", () => {
    const state = newGame({ corp: { deck: ["Gene Splicer"] }, runner: { deck: [qty("Sure Gamble", 3)] } });
    playFromHand(state, "corp", "Gene Splicer", "New remote");
    addProp(state, "corp", makeEid(state), getContent(state, "remote1", 0), "advancement", 1);
    takeCredits(state, "corp");
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(1);
    expect(getContent(state, "remote1", 0)).toBeNull();
    expect(getCorp(state).discard.at(-1).title).toBe("Gene Splicer");
    expect(getRunner(state).credit).toBe(4);
  });

  it("runner accesses double-advanced and doesn't trash", () => {
    const state = newGame({ corp: { deck: ["Gene Splicer"] }, runner: { deck: [qty("Sure Gamble", 3)] } });
    playFromHand(state, "corp", "Gene Splicer", "New remote");
    addProp(state, "corp", makeEid(state), getContent(state, "remote1", 0), "advancement", 2);
    takeCredits(state, "corp");
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "runner", "No action");
    expect(getRunner(state).discard.length).toBe(2);
    expect(getContent(state, "remote1", 0).title).toBe("Gene Splicer");
    expect(getRunner(state).credit).toBe(5);
  });

  it("runner accesses double-advanced and trashes", () => {
    const state = newGame({ corp: { deck: ["Gene Splicer"] }, runner: { deck: [qty("Sure Gamble", 3)] } });
    playFromHand(state, "corp", "Gene Splicer", "New remote");
    addProp(state, "corp", makeEid(state), getContent(state, "remote1", 0), "advancement", 2);
    takeCredits(state, "corp");
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(2);
    expect(getContent(state, "remote1", 0)).toBeNull();
    expect(getCorp(state).discard.at(-1).title).toBe("Gene Splicer");
    expect(getRunner(state).credit).toBe(4);
  });

  it("corp triple-advances and scores as 1 point agenda", () => {
    const state = newGame({
      corp: { deck: [qty("Gene Splicer", 2), qty("Ice Wall", 3), qty("Vanilla", 2)] },
      runner: { deck: [qty("Sure Gamble", 3)] },
    });
    playFromHand(state, "corp", "Gene Splicer", "New remote");
    const gs = getContent(state, "remote1", 0);
    addProp(state, "corp", makeEid(state), gs, "advancement", 2);
    takeCredits(state, "runner");
    addProp(state, "corp", makeEid(state), refresh(state, gs), "advancement", 1);
    rez(state, "corp", refresh(state, gs));
    cardAbility(state, "corp", refresh(state, gs), 0);
    expect(getContent(state, "remote1", 0)).toBeNull();
    expect(getScored(state, "corp", 0).agendapoints).toBe(1);
  });

  it("corp double-advances and fails to score", () => {
    const state = newGame({ corp: { hand: ["Gene Splicer"] }, runner: { deck: [qty("Sure Gamble", 3)] } });
    playFromHand(state, "corp", "Gene Splicer", "New remote");
    const gs = getContent(state, "remote1", 0);
    for (let i = 0; i < 2; i++) clickAdvance(state, "corp", refresh(state, gs));
    takeCredits(state, "runner");
    rez(state, "corp", refresh(state, gs));
    cardAbility(state, "corp", refresh(state, gs), 0);
    expect(refresh(state, gs)).toBeTruthy();
    expect(getScored(state, "corp").length).toBe(0);
  });
});

describe("genetics-pavilion", () => {
  it("limit runner to 2 draws per turn, but only during runner's turn", () => {
    const state = newGame({
      corp: { deck: ["Genetics Pavilion"] },
      runner: { deck: [qty("Sure Gamble", 3)], hand: ["Diesel", "Sports Hopper"] },
    });
    playFromHand(state, "corp", "Genetics Pavilion", "New remote");
    const gp = getContent(state, "remote1", 0);
    takeCredits(state, "corp");
    rez(state, "corp", gp);
    playFromHand(state, "runner", "Sports Hopper");
    playFromHand(state, "runner", "Diesel");
    expect(getRunner(state).hand.length).toBe(2);
    takeCredits(state, "runner");
    move(state, "runner", findCard("Sure Gamble", getRunner(state).hand), "deck");
    move(state, "runner", findCard("Sure Gamble", getRunner(state).hand), "deck");
    const hopper = getHardware(state, 0);
    cardAbility(state, "runner", hopper, 0);
    expect(getRunner(state).hand.length).toBe(3);
    derez(state, "corp", refresh(state, gp));
    takeCredits(state, "corp");
  });

  it("disables further draws after drawing", () => {
    const state = newGame({
      corp: { deck: ["Genetics Pavilion"] },
      runner: { deck: [qty("Sure Gamble", 3)], hand: ["Diesel"] },
    });
    playFromHand(state, "corp", "Genetics Pavilion", "New remote");
    const gp = getContent(state, "remote1", 0);
    takeCredits(state, "corp");
    expect(getRunner(state).hand.length).toBe(1);
    playFromHand(state, "runner", "Diesel");
    expect(getRunner(state).hand.length).toBe(3);
    move(state, "runner", findCard("Sure Gamble", getRunner(state).hand), "deck");
    rez(state, "corp", refresh(state, gp));
    draw(state, "runner");
    expect(getRunner(state).hand.length).toBe(2);
  });

  it("vs Fisk Investment Seminar", () => {
    const state = newGame({
      corp: { deck: ["Genetics Pavilion", qty("Hedge Fund", 3)] },
      runner: { deck: ["Fisk Investment Seminar", qty("Sure Gamble", 3)] },
    });
    playFromHand(state, "corp", "Genetics Pavilion", "New remote");
    const gp = getContent(state, "remote1", 0);
    takeCredits(state, "corp");
    rez(state, "corp", gp);
    for (let i = 0; i < 3; i++) move(state, "corp", findCard("Hedge Fund", getCorp(state).hand), "deck");
    for (let i = 0; i < 3; i++) move(state, "runner", findCard("Sure Gamble", getRunner(state).hand), "deck");
    expect(getRunner(state).hand.length).toBe(1);
    expect(getCorp(state).hand.length).toBe(0);
    playFromHand(state, "runner", "Fisk Investment Seminar");
    expect(getRunner(state).hand.length).toBe(2);
    expect(getCorp(state).hand.length).toBe(3);
  });

  it("Mr. Li interaction #1594", () => {
    const state = newGame({
      corp: { deck: ["Genetics Pavilion"] },
      runner: { deck: ["Mr. Li", "Account Siphon", "Faerie", "Sure Gamble", "John Masanori", "Desperado"] },
    });
    startingHand(state, "runner", ["Mr. Li"]);
    playFromHand(state, "corp", "Genetics Pavilion", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Mr. Li");
    const mrli = getResource(state, 0);
    expect(getRunner(state).hand.length).toBe(0);
    cardAbility(state, "runner", mrli, 0);
    expect(getRunner(state).setAside.length).toBe(2);
    clickCard(state, "runner", getRunner(state).setAside[0]);
    expect(getRunner(state).hand.length).toBe(1);
    cardAbility(state, "runner", mrli, 0);
    expect(getRunner(state).hand.length).toBe(1);
    expect(noPrompt(state, "runner")).toBe(true);
  });

  it("no cards in stack but draw effects #4192", () => {
    const state = newGame({
      corp: { deck: [qty("Hedge Fund", 10)], hand: ["Genetics Pavilion"] },
      runner: { hand: ["Labor Rights", qty("Crowdfunding", 2)], discard: ["Account Siphon", "Bankroll", "Cache"] },
    });
    playFromHand(state, "corp", "Genetics Pavilion", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Crowdfunding");
    playFromHand(state, "runner", "Crowdfunding");
    for (let i = 0; i < 3; i++) {
      takeCredits(state, "runner");
      takeCredits(state, "corp");
    }
    cardAbility(state, "runner", getResource(state, 1), 0);
    cardAbility(state, "runner", getResource(state, 0), 0);
    endPhase12(state, "runner");
    expect(getRunner(state).discard.length).toBe(5);
    expect(getRunner(state).hand.length).toBe(1);
    playFromHand(state, "runner", "Labor Rights");
    expect(getRunner(state).hand.length).toBe(0);
    clickCard(state, "runner", "Account Siphon");
    clickCard(state, "runner", "Bankroll");
    clickCard(state, "runner", "Cache");
    expect(getRunner(state).hand.length).toBe(1);
  });
});

describe("ghost-branch", () => {
  it("give runner tags equal to advancements when accessed", () => {
    const state = newGame({ corp: { deck: ["Ghost Branch"] } });
    playFromHand(state, "corp", "Ghost Branch", "New remote");
    const gb = getContent(state, "remote1", 0);
    clickAdvance(state, "corp", refresh(state, gb));
    clickAdvance(state, "corp", refresh(state, gb));
    expect(getCounters(refresh(state, gb), "advancement")).toBe(2);
    takeCredits(state, "corp");
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "corp", "Yes");
    expect(countTags(state)).toBe(2);
  });

  it("with Dedicated Response Team", () => {
    const state = newGame({ corp: { deck: ["Ghost Branch", "Dedicated Response Team"] } });
    playFromHand(state, "corp", "Ghost Branch", "New remote");
    playFromHand(state, "corp", "Dedicated Response Team", "New remote");
    gainClicks(state, "corp", 1);
    const gb = getContent(state, "remote1", 0);
    const drt = getContent(state, "remote2", 0);
    clickAdvance(state, "corp", gb);
    clickAdvance(state, "corp", refresh(state, gb));
    expect(getCounters(refresh(state, gb), "advancement")).toBe(2);
    takeCredits(state, "corp");
    runOn(state, "Server 1");
    rez(state, "corp", drt);
    runContinue(state);
    expect(waiting(state, "runner")).toBe(true);
    clickPrompt(state, "corp", "Yes");
    expect(countTags(state)).toBe(2);
    clickPrompt(state, "runner", "Pay 0 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(2);
  });
});

it("grndl-refinery", () => {
  const state = newGame({ corp: { deck: ["GRNDL Refinery"] } });
  gain(state, "corp", "credit", 100);
  gainClicks(state, "corp", 100);
  for (let i = 0; i < 5; i++) {
    playFromHand(state, "corp", "GRNDL Refinery", "New remote");
    const grndl = getContent(state, `remote${i + 1}`, 0);
    const credits = getCorp(state).credit - i;
    rez(state, "corp", grndl);
    if (i > 0) {
      advance(state, refresh(state, grndl), i);
      expect(getCounters(refresh(state, grndl), "advancement")).toBe(i);
    }
    cardAbility(state, "corp", refresh(state, grndl), 0);
    expect(getCorp(state).credit).toBe(credits + i * 4);
    expect(getCorp(state).discard.length).toBe(1);
    expect(getCorp(state).discard[0].title).toBe("GRNDL Refinery");
    move(state, "corp", findCard("GRNDL Refinery", getCorp(state).discard), "hand");
  }
});

it("haas-arcology-ai", () => {
  const state = newGame({ corp: { deck: ["Haas Arcology AI"] } });
  gainClicks(state, "corp", 1);
  playFromHand(state, "corp", "Haas Arcology AI", "New remote");
  const haa = getContent(state, "remote1", 0);
  advance(state, haa, 2);
  rez(state, "corp", refresh(state, haa));
  expect(getCorp(state).click).toBe(1);
  expect(getCounters(refresh(state, haa), "advancement")).toBe(2);
  cardAbility(state, "corp", refresh(state, haa), 0);
  expect(getCounters(refresh(state, haa), "advancement")).toBe(1);
  expect(getCorp(state).click).toBe(2);
  cardAbility(state, "corp", refresh(state, haa), 0);
  expect(getCounters(refresh(state, haa), "advancement")).toBe(1);
  expect(getCorp(state).click).toBe(2);
});

describe("hearts-and-minds", () => {
  it("basic", () => {
    const state = newGame({ corp: { hand: ["Hearts and Minds", "NGO Front"] } });
    playFromHand(state, "corp", "Hearts and Minds", "New remote");
    playFromHand(state, "corp", "NGO Front", "New remote");
    const ham = getContent(state, "remote1", 0);
    const ngo = getContent(state, "remote2", 0);
    rez(state, "corp", ham);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    cardAbility(state, "corp", ham, 0);
    clickPrompt(state, "corp", "Done");
    expect(
      changed(() => getCounters(refresh(state, ngo), "advancement"), 1, () => clickCard(state, "corp", ngo)),
      "NGO Front got 1 advancement counter"
    ).toBe(true);
  });

  it("behind ice", () => {
    const state = newGame({ corp: { hand: ["Hearts and Minds", "Vanilla", "NGO Front", "Project Atlas"] } });
    gainClicks(state, "corp", 2);
    playFromHand(state, "corp", "Hearts and Minds", "New remote");
    playFromHand(state, "corp", "Vanilla", "Server 1");
    playFromHand(state, "corp", "NGO Front", "New remote");
    playFromHand(state, "corp", "Project Atlas", "New remote");
    const ham = getContent(state, "remote1", 0);
    const ngo = getContent(state, "remote2", 0);
    const atlas = getContent(state, "remote3", 0);
    rez(state, "corp", ham);
    clickAdvance(state, "corp", ngo);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    cardAbility(state, "corp", ham, 0);
    expect(
      changedMulti(
        [
          [() => getCounters(refresh(state, ngo), "advancement"), -1],
          [() => getCounters(refresh(state, atlas), "advancement"), 1],
        ],
        () => {
          clickCard(state, "corp", ngo);
          clickCard(state, "corp", atlas);
        }
      ),
      "Advancement counter moved from NGO Front to Project Atlas"
    ).toBe(true);
    expect(noPrompt(state, "corp")).toBe(true);
  });
});

it("honeyfarm", () => {
  const state = newGame({ corp: { deck: [qty("Honeyfarm", 3)] } });
  trashFromHand(state, "corp", "Honeyfarm");
  playFromHand(state, "corp", "Honeyfarm", "New remote");
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).credit).toBe(4);
  runEmptyServer(state, "Archives");
  expect(getRunner(state).credit).toBe(3);
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "No action");
  expect(getRunner(state).credit).toBe(2);
});

describe("hostile-architecture", () => {
  it("basic behavior", () => {
    const state = newGame({
      corp: { hand: [qty("Hostile Architecture", 4)], credits: 15 },
    });
    gain(state, "runner", "credit", 50);
    playFromHand(state, "corp", "Hostile Architecture", "New remote");
    playFromHand(state, "corp", "Hostile Architecture", "New remote");
    playFromHand(state, "corp", "Hostile Architecture", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    runEmptyServer(state, "hq");
    clickPrompt(state, "runner", "Pay 4 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(0);
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "runner", "Pay 4 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(2);
    rez(state, "corp", getContent(state, "remote2", 0));
    runEmptyServer(state, "Server 2");
    clickPrompt(state, "runner", "Pay 4 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(2);
    runEmptyServer(state, "Server 3");
    clickPrompt(state, "runner", "Pay 4 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(2);
  });

  it("trash other", () => {
    const state = newGame({
      corp: { hand: ["Hostile Architecture", "Bladderwort"] },
      runner: { hand: [qty("Sure Gamble", 5)] },
    });
    gain(state, "corp", "credit", 1);
    gain(state, "runner", "credit", 50);
    playFromHand(state, "corp", "Bladderwort", "New remote");
    playFromHand(state, "corp", "Hostile Architecture", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    rez(state, "corp", getContent(state, "remote2", 0));
    takeCredits(state, "corp");
    runEmptyServer(state, "Server 1");
    clickPrompt(state, "runner", "Pay 3 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(2);
    runEmptyServer(state, "Server 2");
    clickPrompt(state, "runner", "Pay 4 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(2);
  });
});

describe("hostile-infrastructure", () => {
  it("basic behavior", () => {
    const state = newGame({
      corp: { deck: [qty("Hostile Infrastructure", 3)] },
      runner: { hand: [qty("Sure Gamble", 5)] },
    });
    gain(state, "runner", "credit", 50);
    playFromHand(state, "corp", "Hostile Infrastructure", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    runEmptyServer(state, "hq");
    clickPrompt(state, "runner", "Pay 5 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(1);
    runEmptyServer(state, "remote1");
    clickPrompt(state, "runner", "Pay 5 [Credits] to trash");
    expect(getRunner(state).discard.length).toBe(2);
  });

  it("overwrite by corp", () => {
    const state = newGame({ corp: { deck: [qty("Hostile Infrastructure", 3)], credits: 15 } });
    gain(state, "runner", "credit", 50);
    gainClicks(state, "corp", 3);
    playFromHand(state, "corp", "Hostile Infrastructure", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    playFromHand(state, "corp", "Hostile Infrastructure", "Server 1");
    clickPrompt(state, "corp", "OK");
    rez(state, "corp", getContent(state, "remote1", 0));
    expect(getCorp(state).discard.length).toBe(1);
    expect(getRunner(state).discard.length).toBe(0);
  });
});

it("humanoid-resources", () => {
  const state = newGame({
    corp: { hand: ["Humanoid Resources"], deck: ["Hedge Fund", "Vanilla", "Enigma"] },
  });
  playFromHand(state, "corp", "Humanoid Resources", "New remote");
  gainClicks(state, "corp", 1);
  rez(state, "corp", getContent(state, "remote1", 0));
  expect(
    changedMulti(
      [
        [() => getCorp(state).click, -3],
        [() => getCorp(state).credit, 4],
        [() => getCorp(state).hand.length, 3],
      ],
      () => cardAbility(state, "corp", getContent(state, "remote1", 0), 0)
    ),
    "Gained 4, drew 3"
  ).toBe(true);
  expect(
    changedMulti(
      [
        [() => getCorp(state).credit, 4],
        [() => getCorp(state).hand.length, -3],
      ],
      () => clickPrompts(state, "corp", "Vanilla", "New remote", "Enigma", "HQ", "Hedge Fund")
    ),
    "Gained 4c and installed two cards"
  ).toBe(true);
  expect(noPrompt(state, "corp")).toBe(true);
});

it("hyoubu-research-facility", () => {
  const state = newGame({ corp: { deck: ["Hyoubu Research Facility", "Snowflake"] } });
  playFromHand(state, "corp", "Hyoubu Research Facility", "New remote");
  playFromHand(state, "corp", "Snowflake", "HQ");
  const hrf = getContent(state, "remote1", 0);
  const sf = getIce(state, "hq", 0);
  takeCredits(state, "corp");
  runOn(state, "HQ");
  rez(state, "corp", hrf);
  rez(state, "corp", sf);
  runContinue(state);
  cardSubroutine(state, "corp", sf, 0);
  clickPrompt(state, "corp", "2 [Credits]");
  clickPrompt(state, "runner", "0 [Credits]");
  expect(getCorp(state).credit).toBe(5);
  runOn(state, "HQ");
  runContinue(state);
  cardSubroutine(state, "corp", sf, 0);
  clickPrompt(state, "corp", "2 [Credits]");
  clickPrompt(state, "runner", "0 [Credits]");
  expect(getCorp(state).credit).toBe(3);
});

it("ibrahim-salem", () => {
  const state = newGame({
    corp: { deck: ["Hostile Takeover", "Ibrahim Salem"] },
    runner: { deck: ["Sure Gamble", "Astrolabe", "Paperclip", "Daily Casts"] },
  });
  playAndScore(state, "Hostile Takeover");
  playFromHand(state, "corp", "Ibrahim Salem", "New remote");
  const ibrahim = getContent(state, "remote2", 0);
  rez(state, "corp", refresh(state, ibrahim), { expectRez: false });
  clickCard(state, "corp", getCorp(state).scored[0]);
  for (const [i, [cardType, cardName]] of [[0, ["Event", "Sure Gamble"]], [1, ["Hardware", "Astrolabe"]], [2, ["Program", "Paperclip"]], [3, ["Resource", "Daily Casts"]]].entries()) {
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    cardAbility(state, "corp", ibrahim, 0);
    clickPrompt(state, "corp", cardType as string);
    clickCard(state, "corp", cardName as string);
    endPhase12(state, "corp");
    expect(getRunner(state).discard.length).toBe(i + 1);
  }
});

it("idiosyncresis", () => {
  for (let x = 0; x < 3; x++) {
    const state = newGame({ corp: { hand: ["Idiosyncresis"] } });
    playFromHand(state, "corp", "Idiosyncresis", "New remote");
    for (let y = 0; y < x; y++) {
      gainClicks(state, "corp", 1);
      gain(state, "corp", "credit", 1);
      clickAdvance(state, "corp", getContent(state, "remote1", 0));
    }
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect(
      changedMulti(
        [
          [() => getRunner(state).credit, -(2 * x)],
          [() => getCorp(state).credit, 3 * x],
        ],
        () => clickPrompt(state, "corp", "Yes")
      ),
      `Corp siphoned the runner for ${2 * x}`
    ).toBe(true);
    expect(getCorp(state).discard.length).toBe(1);
  }
});

it("illegal-arms-factory", () => {
  const state = newGame({
    corp: { deck: ["Hedge Fund", "Beanstalk Royalties", "IPO", qty("Illegal Arms Factory", 3)] },
  });
  gain(state, "runner", "credit", 20);
  move(state, "corp", findCard("IPO", getCorp(state).hand), "deck");
  move(state, "corp", findCard("Hedge Fund", getCorp(state).hand), "deck");
  move(state, "corp", findCard("Beanstalk Royalties", getCorp(state).hand), "deck");
  playFromHand(state, "corp", "Illegal Arms Factory", "New remote");
  playFromHand(state, "corp", "Illegal Arms Factory", "New remote");
  const iaf = getContent(state, "remote2", 0);
  rez(state, "corp", iaf);
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  clickPrompt(state, "runner", "Pay 6 [Credits] to trash");
  expect(countBadPub(state)).toBe(0);
  takeCredits(state, "runner");
  expect(getCorp(state).hand.length).toBe(3);
  expect(getCorp(state).credit).toBe(4);
  takeCredits(state, "corp");
  runEmptyServer(state, "remote2");
  clickPrompt(state, "runner", "Pay 6 [Credits] to trash");
  expect(countBadPub(state)).toBe(1);
});

it("indian-union-stock-exchange", () => {
  const state = newGame({
    corp: {
      id: "Argus Security: Protection Guaranteed",
      deck: ["Indian Union Stock Exchange", "Beanstalk Royalties", "Kill Switch", "Net Police"],
    },
  });
  gainClicks(state, "corp", 3);
  playFromHand(state, "corp", "Indian Union Stock Exchange", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  const credits1 = getCorp(state).credit;
  playFromHand(state, "corp", "Beanstalk Royalties");
  expect(getCorp(state).credit).toBe(credits1 + 3);
  const credits2 = getCorp(state).credit;
  playFromHand(state, "corp", "Kill Switch");
  expect(getCorp(state).credit).toBe(credits2);
  const credits3 = getCorp(state).credit;
  playFromHand(state, "corp", "Net Police", "New remote");
  rez(state, "corp", getContent(state, "remote2", 0));
  expect(getCorp(state).credit).toBe(credits3);
});

describe("investigator-inez-delgado-a", () => {
  it("basic", () => {
    const state = newGame({
      corp: { hand: ["Investigator Inez Delgado A", "Project Atlas"] },
      runner: { scoreArea: ["Hostile Takeover"] },
    });
    playFromHand(state, "corp", "Investigator Inez Delgado A", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    playAndScore(state, "Project Atlas");
    clickPrompt(state, "corp", "Yes");
    expect(
      changed(() => getCorp(state).credit, 7, () => clickCard(state, "corp", "Hostile Takeover")),
      "Scored hostile"
    ).toBe(true);
    expect((state as any).corp.scored[0].title).toBe("Hostile Takeover");
  });

  it("variant 2", () => {
    const state = newGame({
      corp: { hand: ["Project Atlas", "Investigator Inez Delgado A 2", "Hostile Takeover"] },
    });
    playFromHand(state, "corp", "Investigator Inez Delgado A 2", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    playAndScore(state, "Project Atlas");
    takeCredits(state, "corp");
    runEmptyServer(state, "hq");
    clickPrompt(state, "runner", "Steal");
    expect(
      changed(() => getCorp(state).credit, 7, () => clickPrompt(state, "corp", "Yes")),
      "Scored ability for hostile"
    ).toBe(true);
    clickCard(state, "corp", "Project Atlas");
    expect((state as any).corp.scored[0].title).toBe("Hostile Takeover");
  });
});

it("isabel-mcguire", () => {
  const state = newGame({ corp: { deck: ["Ice Wall", "Isabel McGuire"] } });
  playFromHand(state, "corp", "Isabel McGuire", "New remote");
  playFromHand(state, "corp", "Ice Wall", "HQ");
  expect(getCorp(state).hand.length).toBe(0);
  const isabel = getContent(state, "remote1", 0);
  const iw = getIce(state, "hq", 0);
  rez(state, "corp", isabel);
  cardAbility(state, "corp", isabel, 0);
  clickCard(state, "corp", refresh(state, iw));
  expect(getCorp(state).hand.length).toBe(1);
});

it("it-department", () => {
  const state = newGame({
    corp: { deck: [qty("Hedge Fund", 5)], hand: ["IT Department", "Wall of Static"] },
  });
  playFromHand(state, "corp", "IT Department", "New remote");
  playFromHand(state, "corp", "Wall of Static", "Server 1");
  const itd = getContent(state, "remote1", 0);
  const wos = getIce(state, "remote1", 0);
  rez(state, "corp", itd);
  rez(state, "corp", wos);
  cardAbility(state, "corp", itd, 0);
  expect(getCorp(state).click).toBe(0);
  expect(getCounters(refresh(state, itd), "power")).toBe(1);
  addProp(state, "corp", makeEid(state), refresh(state, itd), "power", 4);
  expect(getCounters(refresh(state, itd), "power")).toBe(5);
  cardAbility(state, "corp", itd, 1);
  clickCard(state, "corp", wos);
  expect(getStrength(refresh(state, wos))).toBe(8);
  expect(getCounters(refresh(state, itd), "power")).toBe(4);
  cardAbility(state, "corp", itd, 1);
  clickCard(state, "corp", wos);
  expect(getStrength(refresh(state, wos))).toBe(11);
  expect(getCounters(refresh(state, itd), "power")).toBe(3);
  cardAbility(state, "corp", itd, 1);
  clickCard(state, "corp", wos);
  expect(getStrength(refresh(state, wos))).toBe(12);
  expect(getCounters(refresh(state, itd), "power")).toBe(2);
  cardAbility(state, "corp", itd, 1);
  clickCard(state, "corp", wos);
  expect(getStrength(refresh(state, wos))).toBe(11);
  expect(getCounters(refresh(state, itd), "power")).toBe(1);
  takeCredits(state, "corp");
  expect(getStrength(refresh(state, wos))).toBe(3);
});

describe("jackson-howard", () => {
  it("draw 2 cards", () => {
    const state = newGame({
      corp: { deck: [qty("Hedge Fund", 5)], hand: ["Jackson Howard"], discard: ["Ice Wall", "Enigma", "Rototurret"] },
    });
    playFromHand(state, "corp", "Jackson Howard", "New remote");
    const jhow = getContent(state, "remote1", 0);
    rez(state, "corp", jhow);
    expect(getCorp(state).hand.length).toBe(0);
    expect(getCorp(state).click).toBe(2);
    cardAbility(state, "corp", jhow, 0);
    expect(getCorp(state).hand.length).toBe(2);
    expect(getCorp(state).click).toBe(1);
    cardAbility(state, "corp", jhow, 1);
    clickCard(state, "corp", "Ice Wall");
    clickCard(state, "corp", "Enigma");
    clickCard(state, "corp", "Rototurret");
    expect(findCard("Jackson Howard", getRfg(state, "corp"))).toBeTruthy();
    expect(findCard("Ice Wall", getCorp(state).deck)).toBeTruthy();
    expect(findCard("Enigma", getCorp(state).deck)).toBeTruthy();
    expect(findCard("Rototurret", getCorp(state).deck)).toBeTruthy();
  });

  it("mid-run usage does not allow successful run effects to trigger", () => {
    const state = newGame({
      corp: { deck: ["Jackson Howard"], discard: ["Enigma", "Ice Wall"] },
      runner: { deck: ["Desperado"] },
    });
    playFromHand(state, "corp", "Jackson Howard", "New remote");
    const jhow = getContent(state, "remote1", 0);
    rez(state, "corp", jhow);
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Desperado");
    runOn(state, "remote1");
    expect(
      changed(() => getRunner(state).credit, 0, () => {
        cardAbility(state, "corp", jhow, 1);
        clickCard(state, "corp", "Enigma");
        clickPrompt(state, "corp", "Done");
        expect(findCard("Jackson Howard", getRfg(state, "corp"))).toBeTruthy();
        expect(findCard("Enigma", getCorp(state).deck)).toBeTruthy();
        expect(refresh(state, jhow)).toBeNull();
        expect((state as any).run).toBeNull();
      }),
      "A server vanishing mid-run does not trigger Desperado"
    ).toBe(true);
  });
});

it("janaina-jk-dumont-kindelan", () => {
  const state = newGame({ corp: { hand: ['Janaína "JK" Dumont Kindelán', "NGO Front"] } });
  playFromHand(state, "corp", 'Janaína "JK" Dumont Kindelán', "New remote");
  const jk = getContent(state, "remote1", 0);
  rez(state, "corp", jk);
  for (let n = 0; n < 2; n++) {
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect((state as any).corpPhase12).toBeTruthy();
    endPhase12(state, "corp");
    expect(getCounters(refresh(state, jk), "credit")).toBe(3 * (n + 1));
  }
  expect(
    changedMulti(
      [
        [() => getCorp(state).credit, 6],
      ],
      () => {
        cardAbility(state, "corp", jk, 1);
        clickCard(state, "corp", "NGO Front");
        clickPrompt(state, "corp", "New remote");
      }
    ),
    "Corp gained 6 credits and installed 1 card"
  ).toBe(true);
  expect(getContent(state, "remote1", 0)).toBeNull();
  expect(getContent(state, "remote2", 0).title).toBe("NGO Front");
});

describe("jeeves-model-bioroids", () => {
  it("cases where Jeeves should trigger - install three different cards", () => {
    const state = newGame({ corp: { deck: ["Jeeves Model Bioroids", "TGTBT", qty("Melange Mining Corp.", 2)] } });
    playFromHand(state, "corp", "Jeeves Model Bioroids", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    playFromHand(state, "corp", "TGTBT", "New remote");
    playFromHand(state, "corp", "Melange Mining Corp.", "New remote");
    playFromHand(state, "corp", "Melange Mining Corp.", "New remote");
    expect(getCorp(state).click).toBe(1);
  });

  it("click for credits three times", () => {
    const state = newGame({ corp: { deck: ["Jeeves Model Bioroids"] } });
    playFromHand(state, "corp", "Jeeves Model Bioroids", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    takeCredits(state, "corp", 3);
    expect(getCorp(state).click).toBe(1);
  });

  it("spending three clicks to purge", () => {
    const state = newGame({ corp: { deck: ["Jeeves Model Bioroids"] } });
    playFromHand(state, "corp", "Jeeves Model Bioroids", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    purge(state, "corp");
    expect(getCorp(state).click).toBe(1);
  });

  it("advancing three times", () => {
    const state = newGame({ corp: { deck: ["Jeeves Model Bioroids", "Project Beale"] } });
    playFromHand(state, "corp", "Jeeves Model Bioroids", "New remote");
    playFromHand(state, "corp", "Project Beale", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    for (let i = 0; i < 3; i++) clickAdvance(state, "corp", getContent(state, "remote2", 0));
    expect(getCorp(state).click).toBe(1);
  });

  it("use 3 clicks on a single card ability - Melange", () => {
    const state = newGame({ corp: { deck: ["Jeeves Model Bioroids", "Melange Mining Corp."] } });
    playFromHand(state, "corp", "Jeeves Model Bioroids", "New remote");
    playFromHand(state, "corp", "Melange Mining Corp.", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    rez(state, "corp", getContent(state, "remote2", 0));
    cardAbility(state, "corp", getContent(state, "remote2", 0), 0);
    expect(getCorp(state).click).toBe(1);
  });

  it("cases where Jeeves should not trigger - three different basic actions", () => {
    const state = newGame({ corp: { hand: ["Jeeves Model Bioroids", "Project Vitruvius"] } });
    playFromHand(state, "corp", "Jeeves Model Bioroids", "New remote");
    playFromHand(state, "corp", "Project Vitruvius", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    clickAdvance(state, "corp", getContent(state, "remote2", 0));
    clickCredit(state, "corp");
    clickAdvance(state, "corp", getContent(state, "remote2", 0));
    expect(getCorp(state).click).toBe(0);
  });

  it("cases where Jeeves should not trigger - three different asset abilities", () => {
    const state = newGame({ corp: { hand: ["Jeeves Model Bioroids", qty("Nanoetching Matrix", 3)] } });
    gainClicks(state, "corp", 1);
    playFromHand(state, "corp", "Jeeves Model Bioroids", "New remote");
    playFromHand(state, "corp", "Nanoetching Matrix", "New remote");
    playFromHand(state, "corp", "Nanoetching Matrix", "New remote");
    playFromHand(state, "corp", "Nanoetching Matrix", "New remote");
    const jev = getContent(state, "remote1", 0);
    const nm1 = getContent(state, "remote2", 0);
    const nm2 = getContent(state, "remote3", 0);
    const nm3 = getContent(state, "remote4", 0);
    rez(state, "corp", jev);
    rez(state, "corp", nm1);
    rez(state, "corp", nm2);
    rez(state, "corp", nm3);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    cardAbility(state, "corp", nm1, 0);
    cardAbility(state, "corp", nm2, 0);
    cardAbility(state, "corp", nm3, 0);
    expect(getCorp(state).click).toBe(0);
  });
});

it("kala-ghoda-real-tv", () => {
  const state = newGame({ corp: { deck: ["Kala Ghoda Real TV"] } });
  startingHand(state, "runner", ["Sure Gamble"]);
  playFromHand(state, "corp", "Kala Ghoda Real TV", "New remote");
  const tv = getContent(state, "remote1", 0);
  rez(state, "corp", tv);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect((state as any).corpPhase12).toBeTruthy();
  cardAbility(state, "corp", tv, 0);
  clickPrompt(state, "corp", "OK");
  cardAbility(state, "corp", tv, 1);
  expect(getCorp(state).discard.length).toBe(1);
  expect(getRunner(state).discard.length).toBe(1);
  expect(lastLogContains(state, "Sure Gamble")).toBe(true);
});

it("kuwinda-k4h1u3", () => {
  const state = newGame({ corp: { deck: ["Kuwinda K4H1U3"] } });
  gain(state, "corp", "credit", 100);
  gain(state, "runner", "credit", 100);
  playFromHand(state, "corp", "Kuwinda K4H1U3", "New remote");
  const kuwinda = getContent(state, "remote1", 0);
  rez(state, "corp", kuwinda);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect((state as any).corpPhase12).toBeTruthy();
  cardAbility(state, "corp", refresh(state, kuwinda), 0);
  expect(getPromptMap(state, "corp").base).toBe(0);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "0");
  expect(getRunner(state).discard.length).toBe(0);
  expect(getCounters(refresh(state, kuwinda), "power")).toBe(1);
  endPhase12(state, "corp");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect((state as any).corpPhase12).toBeTruthy();
  cardAbility(state, "corp", refresh(state, kuwinda), 0);
  expect(getPromptMap(state, "corp").base).toBe(1);
  clickPrompt(state, "corp", "0");
  clickPrompt(state, "runner", "1");
  expect(getRunner(state).discard.length).toBe(0);
  expect(getCounters(refresh(state, kuwinda), "power")).toBe(2);
  endPhase12(state, "corp");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  cardAbility(state, "corp", refresh(state, kuwinda), 0);
  expect(getPromptMap(state, "corp").base).toBe(2);
  clickPrompt(state, "corp", "1");
  clickPrompt(state, "runner", "0");
  expect(getRunner(state).brainDamage).toBe(1);
  expect(getRunner(state).discard.length).toBe(1);
  expect(getCorp(state).discard.length).toBe(1);
  expect(getCorp(state).discard[0].title).toBe("Kuwinda K4H1U3");
  endPhase12(state, "corp");
});

describe("lady-liberty", () => {
  it("basic behavior", () => {
    const state = newGame({ corp: { deck: ["Lady Liberty", "Breaking News", "Ikawah Project"] } });
    playFromHand(state, "corp", "Lady Liberty", "New remote");
    const ll = getContent(state, "remote1", 0);
    rez(state, "corp", ll);
    takeCredits(state, "corp");
    expect(getCounters(refresh(state, ll), "power")).toBe(0);
    takeCredits(state, "runner");
    expect(getCounters(refresh(state, ll), "power")).toBe(1);
    expect(getCorp(state).hand.length).toBe(2);
    cardAbility(state, "corp", refresh(state, ll), 0);
    clickCard(state, "corp", findCard("Breaking News", getCorp(state).hand));
    expect(getCorp(state).hand.length).toBe(1);
    expect(getCorp(state).scored.length).toBe(1);
    expect(getCorp(state).agendaPoint).toBe(1);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    cardAbility(state, "corp", refresh(state, ll), 0);
    expect(noPrompt(state, "corp")).toBe(true);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    cardAbility(state, "corp", refresh(state, ll), 0);
    clickCard(state, "corp", findCard("Ikawah Project", getCorp(state).hand));
    expect(getCorp(state).hand.length).toBe(0);
    expect(getCorp(state).scored.length).toBe(2);
    expect(getCorp(state).agendaPoint).toBe(4);
  });

  it("agenda static abilities", () => {
    const state = newGame({ corp: { deck: ["Lady Liberty", "Self-Destruct Chips"] } });
    playFromHand(state, "corp", "Lady Liberty", "New remote");
    const ll = getContent(state, "remote1", 0);
    rez(state, "corp", ll);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    cardAbility(state, "corp", refresh(state, ll), 0);
    clickCard(state, "corp", findCard("Self-Destruct Chips", getCorp(state).hand));
    expect(getCorp(state).agendaPoint).toBe(1);
    expect(handSize(state, "runner")).toBe(4);
  });

  it("agenda events", () => {
    const state = newGame({ corp: { deck: ["Lady Liberty", "Puppet Master"] } });
    playFromHand(state, "corp", "Lady Liberty", "New remote");
    const ll = getContent(state, "remote1", 0);
    rez(state, "corp", ll);
    for (let i = 0; i < 3; i++) {
      takeCredits(state, "corp");
      takeCredits(state, "runner");
    }
    cardAbility(state, "corp", refresh(state, ll), 0);
    clickCard(state, "corp", findCard("Puppet Master", getCorp(state).hand));
    expect(getCorp(state).agendaPoint).toBe(3);
    takeCredits(state, "corp");
    runEmptyServer(state, "HQ");
    expect(getPromptMap(state, "corp").msg).toContain("Choose a card that can be advanced to place 1 advancement counter on");
  });
});

it("lakshmi-smartfabrics", () => {
  const state = newGame({
    corp: { deck: ["Lakshmi Smartfabrics", "Vanilla", "Marked Accounts", "Elective Upgrade"] },
    runner: { hand: ["Rezeki"] },
  });
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Rezeki");
  takeCredits(state, "runner");
  playFromHand(state, "corp", "Lakshmi Smartfabrics", "New remote");
  const lak = getContent(state, "remote1", 0);
  rez(state, "corp", lak);
  expect(getCounters(refresh(state, lak), "power")).toBe(1);
  playFromHand(state, "corp", "Vanilla", "R&D");
  playFromHand(state, "corp", "Marked Accounts", "New remote");
  rez(state, "corp", getIce(state, "rd", 0));
  expect(getCounters(refresh(state, lak), "power")).toBe(2);
  rez(state, "corp", getContent(state, "remote2", 0));
  expect(getCounters(refresh(state, lak), "power")).toBe(3);
  takeCredits(state, "corp");
  cardAbility(state, "corp", refresh(state, lak), 0);
  clickPrompt(state, "corp", "3");
  clickCard(state, "corp", findCard("Elective Upgrade", getCorp(state).hand));
  expect(lastLogContains(state, "Elective Upgrade")).toBe(true);
  expect(getCounters(refresh(state, lak), "power")).toBe(0);
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "No action");
  expect(getScored(state, "runner").length).toBe(0);
  takeCredits(state, "runner");
  takeCredits(state, "corp");
  runEmptyServer(state, "HQ");
  clickPrompt(state, "runner", "Steal");
  expect(getRunner(state).agendaPoint).toBe(3);
});

it("launch-campaign", () => {
  const state = newGame({ corp: { deck: ["Launch Campaign"] } });
  playFromHand(state, "corp", "Launch Campaign", "New remote");
  const launch = getContent(state, "remote1", 0);
  rez(state, "corp", launch);
  expect(getCorp(state).credit).toBe(4);
  expect(getCounters(refresh(state, launch), "credit")).toBe(6);
  takeCredits(state, "corp", 2);
  takeCredits(state, "runner");
  expect(getCorp(state).credit).toBe(8);
  expect(getCounters(refresh(state, launch), "credit")).toBe(4);
});

it("levy-university", () => {
  const state = newGame({ corp: { deck: ["Levy University", "Ice Wall", qty("Fire Wall", 10)] } });
  startingHand(state, "corp", ["Levy University"]);
  playFromHand(state, "corp", "Levy University", "New remote");
  const levy = getContent(state, "remote1", 0);
  const shuffles = core.turnEvents(state, "corp", "corp-shuffle-deck").length;
  rez(state, "corp", levy);
  expect(getCorp(state).hand.length).toBe(0);
  const clicks = getCorp(state).click;
  const credits = getCorp(state).credit;
  cardAbility(state, "corp", refresh(state, levy), 0);
  clickPrompt(state, "corp", findCard("Ice Wall", getCorp(state).deck).title);
  expect(getCorp(state).credit).toBe(credits - 1);
  expect(getCorp(state).click).toBe(clicks - 1);
  expect(getCorp(state).hand.length).toBe(1);
  expect(getCorp(state).hand[0].title).toBe("Ice Wall");
  expect(core.turnEvents(state, "corp", "corp-shuffle-deck").length).toBeGreaterThan(shuffles);
});

it("lily-lockwell", () => {
  const state = newGame({
    corp: { deck: [qty("Fire Wall", 10)], hand: ["Lily Lockwell", "Beanstalk Royalties"], credits: 10 },
    runner: { tags: 2 },
  });
  playFromHand(state, "corp", "Lily Lockwell", "New remote");
  const lily = getContent(state, "remote1", 0);
  const clicks = getCorp(state).click;
  const shuffles = core.turnEvents(state, "corp", "corp-shuffle-deck").length;
  const hand = getCorp(state).hand.length;
  rez(state, "corp", lily);
  expect(getCorp(state).hand.length).toBe(hand + 3);
  move(state, "corp", findCard("Beanstalk Royalties", getCorp(state).hand), "deck");
  cardAbility(state, "corp", refresh(state, lily), 0);
  clickPrompt(state, "corp", "Beanstalk Royalties");
  expect(getCorp(state).deck[0].title).toBe("Beanstalk Royalties");
  expect(countTags(state)).toBe(1);
  expect(getCorp(state).click).toBe(clicks - 1);
  expect(core.turnEvents(state, "corp", "corp-shuffle-deck").length).toBeGreaterThan(shuffles);
  draw(state, "corp");
  cardAbility(state, "corp", refresh(state, lily), 0);
  clickPrompt(state, "corp", "No action");
  expect(countTags(state)).toBe(0);
});

it("long-term-investment", () => {
  const state = newGame({ corp: { deck: ["Long-Term Investment"] } });
  playFromHand(state, "corp", "Long-Term Investment", "New remote");
  const lti = getContent(state, "remote1", 0);
  rez(state, "corp", lti);
  for (let i = 0; i < 4; i++) {
    expect(getCounters(refresh(state, lti), "credit")).toBe(i * 2);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
  }
  expect(getCounters(refresh(state, lti), "credit")).toBe(8);
  const credits = getCorp(state).credit;
  cardAbility(state, "corp", refresh(state, lti), 0);
  clickPrompt(state, "corp", "8");
  expect(getCorp(state).credit).toBe(credits + 8);
});

describe("lt-todachine", () => {
  it("basic", () => {
    const state = newGame({ corp: { hand: ["Lt. Todachine", "Vanilla"] } });
    playFromHand(state, "corp", "Lt. Todachine", "New remote");
    playFromHand(state, "corp", "Vanilla", "HQ");
    rez(state, "corp", getContent(state, "remote1", 0));
    rez(state, "corp", getIce(state, "hq", 0));
    expect(countTags(state)).toBe(1);
  });

  it("variant 2", () => {
    const state = newGame({
      corp: { hand: ["Lt. Todachine 2", "Vanilla"], deck: [qty("IPO", 3)] },
      runner: { hand: ["Jailbreak"] },
    });
    playFromHand(state, "corp", "Lt. Todachine 2", "New remote");
    playFromHand(state, "corp", "Vanilla", "HQ");
    rez(state, "corp", getContent(state, "remote1", 0));
    rez(state, "corp", getIce(state, "hq", 0));
    expect(countTags(state)).toBe(1);
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Jailbreak");
    clickPrompt(state, "runner", "R&D");
    runContinueUntil(state, "success");
    clickPrompt(state, "runner", "No action");
    expect(noPrompt(state, "runner")).toBe(true);
    expect((state as any).run).toBeFalsy();
  });
});

it("luana", () => {
  const state = newGame({
    corp: { hand: ["Luana Campos", "Extract"], deck: [qty("IPO", 10)], badPub: 1 },
  });
  playCards(state, "corp", ["Luana Campos", "New remote", "rezzed"]);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(
    changedMulti(
      [
        [() => getCorp(state).credit, 3],
        [() => countBadPub(state), -1],
        [() => getCorp(state).hand.length, 2],
      ],
      () => clickPrompt(state, "corp", "Yes")
    ),
    "Took a BP to get value"
  ).toBe(true);
  expect(
    changed(() => countBadPub(state), 1, () => playCards(state, "corp", ["Extract", "Luana Campos"])),
    "Took BP back"
  ).toBe(true);
});

it("magistrate-revontulet", () => {
  const state = newGame({
    corp: { hand: ["Magistrate Revontulet", "Greenmail", "Project Beale", "Project Atlas"] },
    runner: { credits: 20 },
  });
  playFromHand(state, "corp", "Magistrate Revontulet", "New remote");
  playFromHand(state, "corp", "Project Atlas", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  expect(rezzed(getContent(state, "remote1", 0))).toBe(true);
  playAndScore(state, "Greenmail");
  expect(
    changed(() => getRunner(state).credit, -3, () => clickPrompt(state, "corp", "Greenmail")),
    "Taxed on score"
  ).toBe(true);
  takeCredits(state, "corp");
  runEmptyServer(state, "hq");
  expect(
    changed(() => getRunner(state).credit, -3, () => clickPrompt(state, "runner", "Pay to steal")),
    "paid 3 to steal"
  ).toBe(true);
  expect(noPrompt(state, "runner")).toBe(true);
  runEmptyServer(state, "remote2");
  expect(
    changed(() => getRunner(state).credit, -3, () => clickPrompt(state, "runner", "Pay to steal")),
    "paid 3 to steal"
  ).toBe(true);
});

describe("malia-z0l0k4", () => {
  it("icon goes away with cupellation", () => {
    const state = newGame({
      corp: { hand: ["Malia Z0L0K4"] },
      runner: { hand: ["Daily Casts", "Cupellation"] },
    });
    playFromHand(state, "corp", "Malia Z0L0K4", "New remote");
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Daily Casts");
    rez(state, "corp", getContent(state, "remote1", 0));
    clickCard(state, "corp", "Daily Casts");
    expect(cardIcons(state, getResource(state, 0))).toEqual(["MZ"]);
    playFromHand(state, "runner", "Cupellation");
    runEmptyServer(state, "remote1");
    clickPrompt(state, "runner", "[Cupellation] 1 [Credits]: Host card");
    expect(cardIcons(state, getResource(state, 0))).toBeFalsy();
  });

  it("blank an installed non-virtual runner resource", () => {
    const state = newGame({
      corp: { deck: [qty("Ice Wall", 5)], hand: [qty("Malia Z0L0K4", 2)] },
      runner: { deck: ["Rachel Beckman", "Daily Casts", "Rumor Mill"] },
    });
    playFromHand(state, "corp", "Malia Z0L0K4", "New remote");
    playFromHand(state, "corp", "Malia Z0L0K4", "New remote");
    takeCredits(state, "corp");
    const malia1 = getContent(state, "remote1", 0);
    const malia2 = getContent(state, "remote2", 0);
    playFromHand(state, "runner", "Daily Casts");
    takeCredits(state, "runner");
    const N = getRunner(state).credit;
    rez(state, "corp", malia1);
    clickCard(state, "corp", getResource(state, 0));
    expect(hasIcon(state, refresh(state, getResource(state, 0)), "MZ")).toBe(true);
    takeCredits(state, "corp");
    expect(getRunner(state).credit).toBe(N);
    takeCredits(state, "runner");
    derez(state, "corp", refresh(state, malia1));
    expect(noIcons(state, getResource(state, 0))).toBe(true);
    const N2 = getRunner(state).credit;
    takeCredits(state, "corp");
    expect(getRunner(state).credit).toBe(N2 + 2);
    playFromHand(state, "runner", "Rachel Beckman");
    const rachel = getResource(state, 1);
    expect(getRunner(state).click).toBe(3);
    rez(state, "corp", refresh(state, malia1));
    clickCard(state, "corp", refresh(state, rachel));
    expect(getRunner(state).click).toBe(3);
    derez(state, "corp", refresh(state, malia1));
    expect(getRunner(state).click).toBe(3);
    rez(state, "corp", refresh(state, malia1));
    clickCard(state, "corp", refresh(state, rachel));
    gainTags(state, "corp", 1);
    expect(countTags(state)).toBe(1);
    expect(refresh(state, rachel)).toBeTruthy();
    takeCredits(state, "runner");
    expect(findCard("Malia Z0L0K4", getCorp(state).hand)).toBeFalsy();
    move(state, "corp", refresh(state, malia1), "hand");
    expect(findCard("Malia Z0L0K4", getCorp(state).hand)).toBeTruthy();
    expect(refresh(state, rachel)).toBeNull();
    rez(state, "corp", malia2);
    clickCard(state, "corp", getResource(state, 0));
    const N3 = getRunner(state).credit;
    takeCredits(state, "corp");
    expect(getRunner(state).credit).toBe(N3);
    playFromHand(state, "runner", "Rumor Mill");
    takeCredits(state, "runner");
    const N4 = getRunner(state).credit;
    takeCredits(state, "corp");
    expect(getRunner(state).credit).toBe(N4 + 2);
  });

  it("Malia and Miss Bones - no prompt on trash #5350", () => {
    const state = newGame({
      corp: { deck: [qty("Malia Z0L0K4", 2)] },
      runner: { deck: ["Miss Bones"] },
    });
    playFromHand(state, "corp", "Malia Z0L0K4", "New remote");
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Miss Bones");
    const malia1 = getContent(state, "remote1", 0);
    runEmptyServer(state, "remote1");
    rez(state, "corp", malia1);
    clickCard(state, "corp", getResource(state, 0));
    clickPrompt(state, "runner", "Pay 3 [Credits] to trash");
    expect(noPrompt(state, "runner")).toBe(true);
    expect(refresh(state, malia1)).toBeNull();
  });
});

describe("marilyn-campaign", () => {
  it("basic", () => {
    const state = newGame({ corp: { deck: ["Marilyn Campaign"] } });
    playFromHand(state, "corp", "Marilyn Campaign", "New remote");
    const marilyn = getContent(state, "remote1", 0);
    rez(state, "corp", marilyn);
    expect(getCorp(state).deck.length).toBe(0);
    for (const cr of [8, 6, 4, 2, 0]) {
      expect(getCounters(refresh(state, marilyn), "credit")).toBe(cr);
      if (cr !== 0) {
        takeCredits(state, "corp");
        takeCredits(state, "runner");
      }
    }
    clickPrompt(state, "corp", "Shuffle Marilyn Campaign into R&D");
    expect(getCorp(state).hand.length).toBe(1);
    expect(getCorp(state).hand[0].title).toBe("Marilyn Campaign");
  });

  it("derez and rez gives additional credits - issue 4581", () => {
    const state = newGame({ corp: { hand: ["Marilyn Campaign"] } });
    playFromHand(state, "corp", "Marilyn Campaign", "New remote");
    const marilyn = getContent(state, "remote1", 0);
    rez(state, "corp", refresh(state, marilyn));
    expect(getCounters(refresh(state, marilyn), "credit")).toBe(8);
    derez(state, "corp", refresh(state, marilyn));
    rez(state, "corp", refresh(state, marilyn));
    expect(getCounters(refresh(state, marilyn), "credit")).toBe(16);
  });

  it("interactive prompt only on last trigger", () => {
    const state = newGame({ corp: { deck: ["PAD Campaign", "Marilyn Campaign"] } });
    playFromHand(state, "corp", "Marilyn Campaign", "New remote");
    playFromHand(state, "corp", "PAD Campaign", "New remote");
    const marilyn = getContent(state, "remote1", 0);
    const pad = getContent(state, "remote2", 0);
    rez(state, "corp", marilyn);
    rez(state, "corp", pad);
    for (let i = 0; i < 3; i++) {
      takeCredits(state, "corp");
      takeCredits(state, "runner");
      expect(noPrompt(state, "corp")).toBe(true);
    }
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect(noPrompt(state, "corp")).toBe(false);
  });
});

it("mark-yale", () => {
  const state = newGame({ corp: { deck: ["Mark Yale", "Project Atlas", qty("Ice Wall", 10)] } });
  startingHand(state, "corp", ["Mark Yale", "Project Atlas"]);
  gain(state, "corp", "credit", 100);
  gainClicks(state, "corp", 100);
  playFromHand(state, "corp", "Mark Yale", "New remote");
  playFromHand(state, "corp", "Project Atlas", "New remote");
  const mark = getContent(state, "remote1", 0);
  const atlas = getContent(state, "remote2", 0);
  rez(state, "corp", mark);
  advance(state, atlas, 5);
  score(state, "corp", refresh(state, atlas));
  const mark2 = getContent(state, "remote1", 0);
  const scoredAtlas = getScored(state, "corp", 0);
  const credits = getCorp(state).credit;
  cardAbility(state, "corp", mark2, 1);
  clickCard(state, "corp", scoredAtlas);
  expect(getCorp(state).credit).toBe(credits + 3);
  cardAbility(state, "corp", scoredAtlas, 0);
  clickPrompt(state, "corp", findCard("Ice Wall", getCorp(state).deck).title);
  expect(getCorp(state).credit).toBe(credits + 4);
  cardAbility(state, "corp", mark2, 0);
  expect(getCorp(state).credit).toBe(credits + 6);
});

describe("marked-accounts", () => {
  it("basic", () => {
    const state = newGame({ corp: { deck: ["Marked Accounts"] } });
    playFromHand(state, "corp", "Marked Accounts", "New remote");
    const ma = getContent(state, "remote1", 0);
    rez(state, "corp", ma);
    expect(getCounters(refresh(state, ma), "credit")).toBe(0);
    cardAbility(state, "corp", ma, 1);
    expect(getCounters(refresh(state, ma), "credit")).toBe(3);
    takeCredits(state, "corp");
    const credits = getCorp(state).credit;
    takeCredits(state, "runner");
    expect(getCorp(state).credit).toBe(credits + 1);
  });

  it("marked accounts can go negative #4599", () => {
    const state = newGame({ corp: { hand: [qty("Marked Accounts", 2)], deck: [qty("Hedge Fund", 5)] } });
    playFromHand(state, "corp", "Marked Accounts", "New remote");
    playFromHand(state, "corp", "Marked Accounts", "New remote");
    const ma1 = getContent(state, "remote1", 0);
    const ma2 = getContent(state, "remote2", 0);
    rez(state, "corp", ma1);
    rez(state, "corp", ma2);
    expect(getCounters(refresh(state, ma1), "credit")).toBe(0);
    expect(getCounters(refresh(state, ma2), "credit")).toBe(0);
    cardAbility(state, "corp", ma2, 1);
    expect(getCounters(refresh(state, ma2), "credit")).toBe(3);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    expect(getCorp(state).credit).toBe(6);
    expect(getCounters(refresh(state, ma1), "credit")).toBe(0);
    expect(getCounters(refresh(state, ma2), "credit")).toBe(2);
    for (let i = 0; i < 2; i++) {
      takeCredits(state, "corp");
      takeCredits(state, "runner");
    }
    expect(getCounters(refresh(state, ma1), "credit")).toBe(0);
    expect(getCounters(refresh(state, ma2), "credit")).toBe(0);
    expect(getCorp(state).credit).toBe(14);
    cardAbility(state, "corp", ma1, 1);
    expect(getCounters(refresh(state, ma1), "credit")).toBe(3);
    cardAbility(state, "corp", ma2, 1);
    expect(getCounters(refresh(state, ma2), "credit")).toBe(3);
  });
});

it("mca-austerity-policy", () => {
  {
    const state = newGame({ corp: { deck: ["MCA Austerity Policy"] } });
    playFromHand(state, "corp", "MCA Austerity Policy", "New remote");
    const mca = getContent(state, "remote1", 0);
    rez(state, "corp", mca);
    cardAbility(state, "corp", mca, 0);
    expect(getCounters(refresh(state, mca), "power")).toBe(1);
    cardAbility(state, "corp", mca, 0);
    expect(getCounters(refresh(state, mca), "power")).toBe(1);
    takeCredits(state, "corp");
    expect(getRunner(state).click).toBe(3);
    takeCredits(state, "runner");
    cardAbility(state, "corp", mca, 0);
    expect(getCounters(refresh(state, mca), "power")).toBe(2);
    takeCredits(state, "corp");
    takeCredits(state, "runner");
    cardAbility(state, "corp", mca, 0);
    expect(getCounters(refresh(state, mca), "power")).toBe(3);
    expect(getCorp(state).click).toBe(2);
    cardAbility(state, "corp", refresh(state, mca), 1);
    expect(getCorp(state).click).toBe(5);
  }
  {
    const state = newGame({ corp: { deck: [qty("MCA Austerity Policy", 2)] } });
    gainClicks(state, "corp", 1);
    playFromHand(state, "corp", "MCA Austerity Policy", "New remote");
    const mca = getContent(state, "remote1", 0);
    rez(state, "corp", mca);
    cardAbility(state, "corp", mca, 0);
    expect(getCounters(refresh(state, mca), "power")).toBe(1);
    cardAbility(state, "corp", mca, 0);
    expect(getCounters(refresh(state, mca), "power")).toBe(1);
    playFromHand(state, "corp", "MCA Austerity Policy", "Server 1");
    clickPrompt(state, "corp", "OK");
    const mca2 = getContent(state, "remote1", 0);
    rez(state, "corp", mca2);
    cardAbility(state, "corp", mca2, 0);
    takeCredits(state, "corp");
    expect(getRunner(state).click).toBe(2);
  }
});

it("melange-mining-corp", () => {
  const state = newGame({ corp: { deck: ["Melange Mining Corp."] } });
  playFromHand(state, "corp", "Melange Mining Corp.", "New remote");
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  rez(state, "corp", getContent(state, "remote1", 0));
  const mmc = getContent(state, "remote1", 0);
  const credits = getCorp(state).credit;
  expect(getCorp(state).click).toBe(3);
  cardAbility(state, "corp", mmc, 0);
  expect(getCorp(state).click).toBe(0);
  expect(getCorp(state).credit).toBe(credits + 7);
});

it("mental-health-clinic", () => {
  const state = newGame({ corp: { deck: ["Mental Health Clinic"] } });
  playFromHand(state, "corp", "Mental Health Clinic", "New remote");
  const mhc = getContent(state, "remote1", 0);
  rez(state, "corp", mhc);
  expect(handSize(state, "runner")).toBe(6);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getCorp(state).credit).toBe(8);
});

describe("moon-pool", () => {
  it("basic", () => {
    const state = newGame({
      corp: { hand: [qty("Moon Pool", 2), "Hostile Takeover", "PAD Campaign", "Project Atlas", "House of Knives"], credits: 10 },
    });
    playFromHand(state, "corp", "Moon Pool", "New remote");
    playFromHand(state, "corp", "Moon Pool", "New remote");
    playFromHand(state, "corp", "Hostile Takeover", "New remote");
    rez(state, "corp", getContent(state, "remote1", 0));
    rez(state, "corp", getContent(state, "remote2", 0));
    cardAbility(state, "corp", getContent(state, "remote1", 0), 0);
    clickCard(state, "corp", "PAD Campaign");
    clickCard(state, "corp", "Project Atlas");
    expect(lastLogContains(state, "Moon Pool")).toBe(true);
    expect(getCorp(state).discard.length).toBe(2);
    clickCard(state, "corp", "PAD Campaign");
    clickPrompt(state, "corp", "Done");
    expect(noPrompt(state, "corp")).toBe(true);
    expect(getCorp(state).discard.length).toBe(1);
    expect(getCorp(state).deck.length).toBe(1);
    cardAbility(state, "corp", getContent(state, "remote2", 0), 0);
    clickCard(state, "corp", "House of Knives");
    clickPrompt(state, "corp", "Done");
    clickCard(state, "corp", "House of Knives");
    clickCard(state, "corp", "Project Atlas");
    expect(getCorp(state).discard.length).toBe(0);
    expect(getCorp(state).deck.length).toBe(3);
    clickCard(state, "corp", "Hostile Takeover");
    clickCard(state, "corp", "Hostile Takeover");
    score(state, "corp", getContent(state, "remote3", 0));
    expect(getCorp(state).scored.length).toBe(1);
    expect(findCard("Moon Pool", getRfg(state, "corp"))).toBeTruthy();
    expect(getContent(state, "remote1", 0)).toBeNull();
  });

  it("rfg when no cards trashed from hq", () => {
    const state = newGame({
      corp: { hand: ["Moon Pool", qty("Hedge Fund", 3)], discard: ["Longevity Serum"] },
    });
    playFromHand(state, "corp", "Moon Pool", "New remote");
    const moonPool = getContent(state, "remote1", 0);
    rez(state, "corp", moonPool);
    cardAbility(state, "corp", moonPool, 0);
    expect(promptIsCard(state, "corp", "moon-pool")).toBeTruthy();
    clickPrompt(state, "corp", "Done");
    clickCard(state, "corp", "Longevity Serum");
    clickPrompt(state, "corp", "Done");
    expect(noPrompt(state, "corp")).toBe(true);
    expect(findCard("Moon Pool", getRfg(state, "corp"))).toBeTruthy();
    expect(getContent(state, "remote1", 0)).toBeNull();
  });
});

it("mr-stone", () => {
  const state = newGame({ corp: { deck: ["Mr. Stone"] } });
  playFromHand(state, "corp", "Mr. Stone", "New remote");
  const stone = getContent(state, "remote1", 0);
  rez(state, "corp", stone);
  gainTags(state, "runner", 1);
  expect(getRunner(state).discard.length).toBe(1);
  gainTags(state, "corp", 5);
  expect(getRunner(state).discard.length).toBe(2);
});

describe("mumba-temple", () => {
  it("basic", () => {
    const state = newGame({ corp: { deck: ["Mumba Temple"] } });
    playFromHand(state, "corp", "Mumba Temple", "New remote");
    const mumba = getContent(state, "remote1", 0);
    rez(state, "corp", mumba);
    expect(getCounters(refresh(state, mumba), "recurring")).toBe(2);
  });

  it("pay-credits prompt", () => {
    const state = newGame({ corp: { deck: ["Mumba Temple", "Ice Wall", "PAD Campaign"] } });
    playFromHand(state, "corp", "Mumba Temple", "New remote");
    playFromHand(state, "corp", "PAD Campaign", "New remote");
    playFromHand(state, "corp", "Ice Wall", "HQ");
    const mumba = getContent(state, "remote1", 0);
    const pad = getContent(state, "remote2", 0);
    const iw = getIce(state, "hq", 0);
    rez(state, "corp", mumba);
    expect(
      changed(() => getCorp(state).credit, 0, () => {
        rez(state, "corp", iw, { expectRez: false });
        clickCard(state, "corp", mumba);
      }),
      "Used 1 credit from Mumba"
    ).toBe(true);
    expect(noPrompt(state, "corp")).toBe(true);
    expect(
      changed(() => getCorp(state).credit, -1, () => {
        rez(state, "corp", pad, { expectRez: false });
        clickCard(state, "corp", mumba);
      }),
      "Used 1 credit from Mumba"
    ).toBe(true);
  });

  it("derez test", () => {
    const state = newGame({ corp: { deck: ["Mumba Temple"] } });
    playFromHand(state, "corp", "Mumba Temple", "New remote");
    const mumba = getContent(state, "remote1", 0);
    rez(state, "corp", mumba);
    expect(getCounters(refresh(state, mumba), "recurring")).toBe(2);
    derez(state, "corp", mumba);
    rez(state, "corp", mumba);
    expect(getCounters(refresh(state, mumba), "recurring")).toBe(2);
  });
});

it("mumbad-city-hall", () => {
  const state = newGame({
    corp: { deck: ["Mumbad City Hall", "PAD Factory", "Salem's Hospitality"] },
  });
  gainClicks(state, "corp", 3);
  gain(state, "corp", "credit", 100);
  startingHand(state, "corp", ["Mumbad City Hall"]);
  playFromHand(state, "corp", "Mumbad City Hall", "New remote");
  const mumbad = getContent(state, "remote1", 0);
  rez(state, "corp", mumbad);
  cardAbility(state, "corp", mumbad, 0);
  clickPrompt(state, "corp", findCard("PAD Factory", getCorp(state).deck).title);
  clickPrompt(state, "corp", "New remote");
  expect(getContent(state, "remote2", 0).title).toBe("PAD Factory");
  cardAbility(state, "corp", mumbad, 0);
  clickPrompt(state, "corp", findCard("Salem's Hospitality", getCorp(state).deck).title);
  clickPrompt(state, "corp", "Sure Gamble");
  expect(getRunner(state).discard.length).toBe(3);
});

it("mumbad-construction-co", () => {
  const state = newGame({ corp: { deck: ["Mumbad Construction Co.", "Oaktown Renovation"] } });
  playFromHand(state, "corp", "Mumbad Construction Co.", "New remote");
  playFromHand(state, "corp", "Oaktown Renovation", "New remote");
  const mcc = getContent(state, "remote1", 0);
  const oak = getContent(state, "remote2", 0);
  rez(state, "corp", mcc);
  expect(getCounters(refresh(state, mcc), "advancement")).toBe(0);
  expect(getCounters(refresh(state, oak), "advancement")).toBe(0);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getCounters(refresh(state, mcc), "advancement")).toBe(1);
  const credits = getCorp(state).credit;
  cardAbility(state, "corp", mcc, 0);
  clickCard(state, "corp", refresh(state, oak));
  expect(getCounters(refresh(state, mcc), "advancement")).toBe(0);
  expect(getCounters(refresh(state, oak), "advancement")).toBe(1);
  expect(getCorp(state).credit).toBe(credits - 2);
});

it("museum-of-history", () => {
  const state = newGame({ corp: { deck: ["Museum of History", "Beanstalk Royalties", qty("Ice Wall", 10)] } });
  startingHand(state, "corp", ["Beanstalk Royalties", "Museum of History"]);
  playFromHand(state, "corp", "Beanstalk Royalties");
  playFromHand(state, "corp", "Museum of History", "New remote");
  const museum = getContent(state, "remote1", 0);
  const shuffles = core.turnEvents(state, "corp", "corp-shuffle-deck").length;
  rez(state, "corp", museum);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  cardAbility(state, "corp", museum, 0);
  clickCard(state, "corp", findCard("Beanstalk Royalties", getCorp(state).discard));
  expect(core.turnEvents(state, "corp", "corp-shuffle-deck").length).toBeGreaterThan(shuffles);
  expect(getCorp(state).discard.length).toBe(0);
});

it("nanoetching-matrix", () => {
  const state = newGame({ corp: { deck: ["Nanoetching Matrix"] } });
  playFromHand(state, "corp", "Nanoetching Matrix", "New remote");
  const nm = getContent(state, "remote1", 0);
  rez(state, "corp", refresh(state, nm));
  const credits = getCorp(state).credit;
  cardAbility(state, "corp", refresh(state, nm), 0);
  expect(getCorp(state).credit).toBe(credits + 2);
  cardAbility(state, "corp", refresh(state, nm), 0);
  expect(getCorp(state).credit).toBe(credits + 2);
  takeCredits(state, "corp");
  runEmptyServer(state, "remote1");
  const newCredits = getCorp(state).credit;
  expect(getCorp(state).discard.length).toBe(0);
  clickPrompt(state, "runner", "Pay 3 [Credits] to trash");
  clickPrompt(state, "corp", "Yes");
  expect(getCorp(state).discard.length).toBe(1);
  expect(getCorp(state).credit).toBe(newCredits + 2);
});

it("nasx", () => {
  const state = newGame({ corp: { deck: ["NASX"] } });
  playFromHand(state, "corp", "NASX", "New remote");
  const nasx = getContent(state, "remote1", 0);
  rez(state, "corp", nasx);
  takeCredits(state, "corp");
  const credits1 = getCorp(state).credit;
  takeCredits(state, "runner");
  expect(getCorp(state).credit).toBe(credits1 + 1);
  const credits2 = getCorp(state).credit;
  cardAbility(state, "corp", nasx, 1);
  expect(getCorp(state).credit).toBe(credits2 - 1);
  expect(getCounters(refresh(state, nasx), "power")).toBe(1);
  const credits3 = getCorp(state).credit;
  cardAbility(state, "corp", nasx, 2);
  expect(getCorp(state).credit).toBe(credits3 - 2);
  expect(getCounters(refresh(state, nasx), "power")).toBe(3);
  const credits4 = getCorp(state).credit;
  const counters = getCounters(refresh(state, nasx), "power");
  cardAbility(state, "corp", nasx, 3);
  expect(getCorp(state).credit).toBe(credits4 + counters * 2);
  expect(getCorp(state).discard.length).toBe(1);
  expect(getCorp(state).discard[0].title).toBe("NASX");
});

it("net-analytics", () => {
  const state = newGame({
    corp: { deck: [qty("Ghost Branch", 3), qty("Net Analytics", 3)] },
    runner: { deck: [qty("New Angeles City Hall", 3)] },
  });
  startingHand(state, "corp", ["Net Analytics", "Ghost Branch"]);
  playFromHand(state, "corp", "Ghost Branch", "New remote");
  playFromHand(state, "corp", "Net Analytics", "New remote");
  takeCredits(state, "corp");
  playFromHand(state, "runner", "New Angeles City Hall");
  takeCredits(state, "runner");
  const gb = getContent(state, "remote1", 0);
  const net = getContent(state, "remote2", 0);
  const nach = getResource(state, 0);
  rez(state, "corp", refresh(state, net));
  clickAdvance(state, "corp", refresh(state, gb));
  expect(getCounters(refresh(state, gb), "advancement")).toBe(1);
  takeCredits(state, "corp");
  expect(getCorp(state).hand.length).toBe(1);
  runEmptyServer(state, "Server 1");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "runner", "New Angeles City Hall");
  clickPrompt(state, "runner", "Yes");
  clickPrompt(state, "corp", "Yes");
  clickPrompt(state, "runner", "No action");
  expect(noPrompt(state, "runner")).toBe(true);
  expect(countTags(state)).toBe(0);
  expect(getCorp(state).hand.length).toBe(2);
  gainTags(state, "runner", 1);
  clickPrompt(state, "runner", "Allow 1 remaining tag");
  removeTag(state, "runner");
  clickPrompt(state, "corp", "Yes");
  expect(getCorp(state).hand.length).toBe(3);
});

it("neurostasis", () => {
  const state = newGame({ corp: { deck: ["Neurostasis"] }, runner: { deck: [qty("Cache", 3)] } });
  playFromHand(state, "corp", "Neurostasis", "New remote");
  const neuro = getContent(state, "remote1", 0);
  clickAdvance(state, "corp", refresh(state, neuro));
  takeCredits(state, "corp");
  playFromHand(state, "runner", "Cache");
  playFromHand(state, "runner", "Cache");
  playFromHand(state, "runner", "Cache");
  runEmptyServer(state, "Server 1");
  expect(getCorp(state).credit).toBe(5);
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", getProgram(state, 1));
  clickPrompt(state, "runner", "No action");
  expect(getCorp(state).credit).toBe(2);
  expect(getProgram(state).length).toBe(2);
  expect(getRunner(state).deck.length).toBe(1);
  takeCredits(state, "runner");
  clickAdvance(state, "corp", refresh(state, neuro));
  takeCredits(state, "corp");
  runEmptyServer(state, "Server 1");
  expect(getCorp(state).credit).toBe(3);
  clickPrompt(state, "corp", "Yes");
  clickCard(state, "corp", getProgram(state, 1));
  clickCard(state, "corp", getProgram(state, 0));
  expect(getCorp(state).credit).toBe(0);
  expect(getProgram(state).length).toBe(0);
  expect(getRunner(state).deck.length).toBe(3);
});

describe("news-team", () => {
  it("on access take 2 tags or take as agenda worth -1", () => {
    const state = newGame({ corp: { deck: [qty("News Team", 3), "Blacklist"] } });
    trashFromHand(state, "corp", "News Team");
    playFromHand(state, "corp", "Blacklist", "New remote");
    takeCredits(state, "corp");
    runEmptyServer(state, "archives");
    clickPrompt(state, "runner", "Take 2 tags");
    expect(countTags(state)).toBe(2);
    runEmptyServer(state, "archives");
    clickPrompt(state, "runner", "Add News Team to score area");
    expect(getScored(state, "runner").length).toBe(1);
    trashFromHand(state, "corp", "News Team");
    rez(state, "corp", getContent(state, "remote1", 0));
    runEmptyServer(state, "archives");
    clickPrompt(state, "runner", "Add News Team to score area");
    expect(getScored(state, "runner").length).toBe(2);
  });

  it("interaction with Maw - issue 4214", () => {
    const state = newGame({
      corp: { deck: [qty("Hedge Fund", 5)], hand: ["Government Takeover", "News Team"] },
      runner: { hand: ["Maw"], credits: 10 },
    });
    playFromHand(state, "corp", "News Team", "New remote");
    takeCredits(state, "corp");
    playFromHand(state, "runner", "Maw");
    expect(getCorp(state).discard.length).toBe(0);
    runEmptyServer(state, "remote1");
    clickPrompt(state, "runner", "Add News Team to score area");
    expect(getCorp(state).discard.length).toBe(1);
    expect(getCorp(state).discard[0].title).toBe("Government Takeover");
  });
});

it("nightmare-archive", () => {
  const state = newGame({ corp: { deck: [qty("Nightmare Archive", 2)] } });
  trashFromHand(state, "corp", "Nightmare Archive");
  takeCredits(state, "corp");
  runEmptyServer(state, "archives");
  clickPrompt(state, "runner", "Suffer 1 core damage");
  expect(getRunner(state).brainDamage).toBe(1);
  expect(getRfg(state, "corp").length).toBe(1);
  runEmptyServer(state, "hq");
  clickPrompt(state, "runner", "Add Nightmare Archive to score area");
  expect(getScored(state, "runner").length).toBe(1);
});

describe("ngo-front", () => {
  it("full test", () => {
    const state = newGame({ corp: { deck: [qty("NGO Front", 3)] } });
    gainClicks(state, "corp", 3);
    playFromHand(state, "corp", "NGO Front", "New remote");
    playFromHand(state, "corp", "NGO Front", "New remote");
    playFromHand(state, "corp", "NGO Front", "New remote");
    const ngo1 = getContent(state, "remote1", 0);
    const ngo2 = getContent(state, "remote2", 0);
    const ngo3 = getContent(state, "remote3", 0);
    advance(state, ngo2, 1);
    advance(state, refresh(state, ngo3), 1);
    advance(state, refresh(state, ngo3), 1);
    rez(state, "corp", refresh(state, ngo1));
    rez(state, "corp", refresh(state, ngo2));
    rez(state, "corp", refresh(state, ngo3));
    expect(getCorp(state).credit).toBe(2);
    cardAbility(state, "corp", ngo1, 1);
    cardAbility(state, "corp", ngo1, 0);
    expect(getCorp(state).credit).toBe(2);
    expect(getCorp(state).discard.length).toBe(0);
    cardAbility(state, "corp", ngo2, 1);
    expect(getCorp(state).credit).toBe(2);
    expect(getCorp(state).discard.length).toBe(0);
    cardAbility(state, "corp", ngo2, 0);
    expect(getCorp(state).credit).toBe(7);
    expect(getCorp(state).discard.length).toBe(1);
    cardAbility(state, "corp", ngo3, 1);
    expect(getCorp(state).credit).toBe(15);
    expect(getCorp(state).discard.length).toBe(2);
  });

  it("run ends when used mid-run", () => {
    const state = newGame({ corp: { deck: ["NGO Front"] } });
    playFromHand(state, "corp", "NGO Front", "New remote");
    const ngo = getContent(state, "remote1", 0);
    rez(state, "corp", ngo);
    advance(state, refresh(state, ngo), 1);
    takeCredits(state, "corp");
    runOn(state, "remote1");
    cardAbility(state, "corp", ngo, 0);
    expect(refresh(state, ngo)).toBeNull();
    expect((state as any).run).toBeNull();
  });
});

it("nico-campaign", () => {
  const state = newGame({ corp: { deck: [qty("Hedge Fund", 10)], hand: ["Nico Campaign"] } });
  playFromHand(state, "corp", "Nico Campaign", "New remote");
  const nico = getContent(state, "remote1", 0);
  rez(state, "corp", nico);
  expect(getCounters(refresh(state, nico), "credit")).toBe(9);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getCounters(refresh(state, nico), "credit")).toBe(6);
  takeCredits(state, "corp");
  takeCredits(state, "runner");
  expect(getCounters(refresh(state, nico), "credit")).toBe(3);
  takeCredits(state, "corp");
  expect(
    changed(() => getCorp(state).hand.length, 2, () => takeCredits(state, "runner")),
    "Drew 2 cards -> mandatory + nico trash effect"
  ).toBe(true);
});

it("nihilo-agent", () => {
  const state = newGame({ corp: { hand: ["Nihilo Agent"] } });
  playFromHand(state, "corp", "Nihilo Agent", "New remote");
  rez(state, "corp", getContent(state, "remote1", 0));
  for (let n = 0; n < 3; n++) {
    expect(isTagged(state)).toBe(false);
    takeCredits(state, "corp");
    startTurn(state, "runner");
    expect(countBadPub(state)).toBe(1);
    expect(isTagged(state)).toBe(true);
    takeCredits(state, "runner");
    if (n !== 2) {
      expect(countBadPub(state)).toBe(0);
      expect(isTagged(state)).toBe(false);
    }
  }
  expect(countBadPub(state)).toBe(1);
});
