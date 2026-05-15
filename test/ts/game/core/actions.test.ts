import { describe, it, expect, beforeEach } from "vitest";
import * as core from "@/game/core";
import {
  newGame, takeCredits, startTurn, endTurn,
  playFromHand, runOn, runJackOut, runEmptyServer, runContinue,
  clickPrompt, clickCard, clickAdvance, clickCredit,
  rez, score, noPrompt, getRun, getIce, getContent, getScored,
  getCorp, getRunner, getPromptMap,
  refresh, findCard, sameCard,
  lastLogContains,
  qty, changed,
  cardSideAbility,
} from "../test_framework/index";

describe("clearing run prompt doesn't brick actions later", () => {
  it("clears dummy run prompt and allows playing cards after", () => {
    const state = newGame({ corp: { deck: [], hand: qty("Hedge Fund", 5) } });
    takeCredits(state, "corp");
    runOn(state, "hq");
    // Clear the dummy run prompt using /close-prompt
    core.commandParser(state, "runner", { user: { username: "Runner" }, text: "/close-prompt" });
    expect(getPromptMap(state, "runner")).toBeUndefined();
    expect(getPromptMap(state, "corp")).toBeTruthy();
    runJackOut(state);
    expect(getRun(state)).toBeNull();
    takeCredits(state, "runner");
    expect(getPromptMap(state, "corp")).toBeUndefined();
    expect(changed(
      () => getCorp(state).credit,
      4,
      () => playFromHand(state, "corp", "Hedge Fund")
    )).toBe(true);
  });
});

describe("undo-turn", () => {
  it("resets corp turn state when both players agree", () => {
    const state = newGame();
    playFromHand(state, "corp", "Hedge Fund");
    playFromHand(state, "corp", "Hedge Fund");
    expect(getCorp(state).click).toBe(1);
    expect(getCorp(state).credit).toBe(13);
    expect(getCorp(state).hand.length).toBe(1);
    core.commandUndoTurn(state, "runner");
    core.commandUndoTurn(state, "corp");
    expect(getCorp(state).hand.length).toBe(3);
    expect(getCorp(state).click).toBe(0);
    expect(getCorp(state).credit).toBe(5);
    startTurn(state, "corp");
    playFromHand(state, "corp", "Hedge Fund");
    playFromHand(state, "corp", "Hedge Fund");
    expect(getCorp(state).click).toBe(1);
    expect(getCorp(state).credit).toBe(13);
    expect(getCorp(state).hand.length).toBe(1);
  });
});

describe("undo-click", () => {
  it("resets state to start of current click", () => {
    const state = newGame({
      corp: { deck: ["Ikawah Project"] },
      runner: { deck: ["Day Job"] },
    });
    playFromHand(state, "corp", "Ikawah Project", "New remote");
    takeCredits(state, "corp");
    expect(getRunner(state).credit).toBe(5);
    expect(getRunner(state).click).toBe(4);
    runEmptyServer(state, "remote1");
    clickPrompt(state, "runner", "Pay to steal");
    expect(getRunner(state).click).toBe(2);
    expect(getRunner(state).credit).toBe(3);
    expect(getRunner(state).scored.length).toBe(1);
    core.commandUndoClick(state, "corp");
    expect(getRunner(state).scored.length).toBe(1);
    core.commandUndoClick(state, "runner");
    expect(getRunner(state).scored.length).toBe(0);
    expect(getRunner(state).click).toBe(4);
    expect(getRunner(state).credit).toBe(5);
    playFromHand(state, "runner", "Day Job");
    expect(getRunner(state).click).toBe(0);
    core.commandUndoClick(state, "runner");
    expect(getRunner(state).click).toBe(4);
    expect(getRunner(state).credit).toBe(5);
  });

  it("returns card from play area on undo", () => {
    const state = newGame({
      corp: { deck: qty("Hedge Fund", 5), hand: ["Predictive Planogram"] },
      runner: { hand: ["Sure Gamble", "Dirty Laundry", "Day Job"] },
    });
    playFromHand(state, "corp", "Predictive Planogram");
    core.commandUndoClick(state, "corp");
    expect((state.corp.playArea ?? []).length).toBe(0);
    expect(getCorp(state).hand.length).toBe(1);
    takeCredits(state, "corp");
    expect(getRunner(state).hand.map((c: any) => c.title)).toEqual(["Sure Gamble", "Dirty Laundry", "Day Job"]);
    playFromHand(state, "runner", "Dirty Laundry");
    core.commandUndoClick(state, "runner");
    expect((state.runner.playArea ?? []).length).toBe(0);
    expect(getRunner(state).hand.length).toBe(3);
    expect(getRunner(state).hand.map((c: any) => c.title)).toEqual(["Sure Gamble", "Dirty Laundry", "Day Job"]);
  });

  it("does not return lockdown from play area", () => {
    const state = newGame({
      corp: { deck: ["NAPD Cordon", "Predictive Planogram"] },
      runner: { deck: ["Dirty Laundry"] },
    });
    playFromHand(state, "corp", "NAPD Cordon");
    core.commandUndoClick(state, "corp");
    expect((state.corp.playArea ?? []).length).toBe(0);
    expect(getCorp(state).hand.length).toBe(2);
    playFromHand(state, "corp", "NAPD Cordon");
    playFromHand(state, "corp", "Predictive Planogram");
    core.commandUndoClick(state, "corp");
    expect((state.corp.playArea ?? []).length).toBe(1);
    expect(getCorp(state).hand.length).toBe(1);
  });

  it("works with bioroid cost", () => {
    const state = newGame({
      corp: { deck: qty("Hedge Fund", 5), hand: ["Eli 1.0"] },
    });
    playFromHand(state, "corp", "Eli 1.0", "rd");
    takeCredits(state, "corp");
    runOn(state, "rd");
    const ice = getIce(state, "rd", 0);
    rez(state, "corp", ice);
    runContinue(state);
    cardSideAbility(state, "runner", ice, 0);
    clickPrompt(state, "runner", "End the run");
    expect(lastLogContains(state, "Runner loses [Click] to use Eli 1.0 to break 1 subroutine on Eli 1.0")).toBe(true);
    clickPrompt(state, "runner", "End the run");
    expect(lastLogContains(state, "Runner loses [Click] to use Eli 1.0 to break 1 subroutine on Eli 1.0")).toBe(true);
    runContinue(state);
    runContinue(state);
    clickPrompt(state, "runner", "No action");
    expect(getRun(state)).toBeNull();
    expect(getRunner(state).click).toBe(1);
    core.commandUndoClick(state, "runner");
    expect(getRunner(state).click).toBe(4);
    expect(lastLogContains(state, "Runner uses the undo-click command")).toBe(true);
  });
});

describe("counter manipulation commands", () => {
  it("allows manipulating counters with /counter and /adv-counter", () => {
    const state = newGame({
      corp: { deck: ["Adonis Campaign", ...qty("Public Support", 2), "Oaktown Renovation"] },
    });
    // Turn 1 Corp, install oaktown and assets
    core.gain(state, "corp", "click", 4);
    core.fakeCheckpoint(state);
    playFromHand(state, "corp", "Adonis Campaign", "New remote");
    playFromHand(state, "corp", "Public Support", "New remote");
    playFromHand(state, "corp", "Public Support", "New remote");
    playFromHand(state, "corp", "Oaktown Renovation", "New remote");
    const adonis = getContent(state, "remote1", 0);
    const publics1 = getContent(state, "remote2", 0);
    const publics2 = getContent(state, "remote3", 0);
    const oaktown = getContent(state, "remote4", 0);
    clickAdvance(state, "corp", refresh(state, oaktown));
    clickAdvance(state, "corp", refresh(state, oaktown));
    clickAdvance(state, "corp", refresh(state, oaktown));
    expect(getCorp(state).credit).toBe(8);
    endTurn(state, "corp");

    // Turn 1 Runner
    startTurn(state, "runner");
    takeCredits(state, "runner", 3);
    clickCredit(state, "runner");
    endTurn(state, "runner");
    rez(state, "corp", refresh(state, adonis));
    rez(state, "corp", refresh(state, publics1));

    // Turn 2 Corp
    startTurn(state, "corp");
    rez(state, "corp", refresh(state, publics2));
    expect(getCorp(state).click).toBe(3);
    expect(getCorp(state).credit).toBe(3);
    expect(getCountersHelper(refresh(state, adonis), "credit")).toBe(9);
    expect(getCountersHelper(refresh(state, publics1), "power")).toBe(2);
    expect(getCountersHelper(refresh(state, publics2), "power")).toBe(3);

    // Use /counter to set power on publics2
    core.commandCounter(state, "corp", ["power", "2"]);
    clickCard(state, "corp", refresh(state, publics2));
    expect(getCountersHelper(refresh(state, publics2), "power")).toBe(2);

    // Oaktown checks and manipulation
    expect(getCountersHelper(refresh(state, oaktown), "advancement")).toBe(3);
    core.commandAdvCounter(state, "corp", 2);
    clickCard(state, "corp", refresh(state, oaktown));
    // Score should fail with 2 advancement tokens
    score(state, "corp", refresh(state, oaktown));
    expect(getCorp(state).agendaPoint).toBe(0);
    core.commandAdvCounter(state, "corp", 4);
    clickCard(state, "corp", refresh(state, oaktown));
    expect(getCountersHelper(refresh(state, oaktown), "advancement")).toBe(4);
    expect(getCorp(state).credit).toBe(3);
    expect(getCorp(state).click).toBe(3);
    score(state, "corp", refresh(state, oaktown));
    expect(getCorp(state).agendaPoint).toBe(2);
    takeCredits(state, "corp");

    // Modifying publics1 and adonis
    expect(getCountersHelper(refresh(state, publics1), "power")).toBe(2);
    core.commandCounter(state, "corp", ["power", "1"]);
    clickCard(state, "corp", refresh(state, publics1));
    expect(getCountersHelper(refresh(state, publics1), "power")).toBe(1);
    expect(getCountersHelper(refresh(state, adonis), "credit")).toBe(9);
    core.commandCounter(state, "corp", ["credit", "3"]);
    clickCard(state, "corp", refresh(state, adonis));
    expect(getCountersHelper(refresh(state, adonis), "credit")).toBe(3);

    // Turn 2 Runner
    takeCredits(state, "runner");

    // Turn 3 Corp
    expect(getCorp(state).agendaPoint).toBe(3);
    expect(getCorp(state).credit).toBe(9);
    takeCredits(state, "corp");

    // Turn 3 Runner
    takeCredits(state, "runner");

    // Turn 4 Corp
    expect(getCorp(state).agendaPoint).toBe(4);
    expect(getCorp(state).credit).toBe(12);
  });
});

describe("counter manipulation commands smart", () => {
  it("uses smart counter advancement", () => {
    const state = newGame({
      corp: { deck: ["House of Knives"] },
    });
    playFromHand(state, "corp", "House of Knives", "New remote");
    const hok = getContent(state, "remote1", 0);
    core.commandCounter(state, "corp", ["3"]);
    clickCard(state, "corp", refresh(state, hok));
    expect(getCountersHelper(refresh(state, hok), "advancement")).toBe(3);
    score(state, "corp", refresh(state, hok));
    const hokScored = getScored(state, "corp", 0);
    expect(getCountersHelper(refresh(state, hokScored), "agenda")).toBe(3);
    core.commandCounter(state, "corp", ["virus", "2"]);
    clickCard(state, "corp", refresh(state, hokScored));
    expect(getCountersHelper(refresh(state, hokScored), "agenda")).toBe(3);
    expect(getCountersHelper(refresh(state, hokScored), "virus")).toBe(2);
    core.commandCounter(state, "corp", ["4"]);
    clickCard(state, "corp", refresh(state, hokScored));
    expect(noPrompt(state, "corp")).toBe(true);
    expect(getCountersHelper(refresh(state, hokScored), "agenda")).toBe(4);
    expect(getCountersHelper(refresh(state, hokScored), "virus")).toBe(2);
  });
});

// Helper to get counters - mirrors Clojure's get-counters
function getCountersHelper(card: any, counterType: string): number {
  const counters = card?.counters ?? card?.counter ?? {};
  const key = counterType === "advancement" ? "advance-counter" : counterType;
  return counters[key] ?? counters[counterType] ?? 0;
}
