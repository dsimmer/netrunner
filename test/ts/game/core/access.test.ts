// Tests for game.core.access
// Mirrors: test/clj/game/core/access_test.clj
import { describe, it, expect } from "vitest";
import * as core from "@/game/core";
import {
  doGame,
  newGame,
  qty,
  takeCredits,
  runEmptyServer,
  runOn,
  runContinue,
  runContinueUntil,
  clickPrompt,
  clickCard,
  clickDraw,
  promptButtons,
  noPrompt,
  waiting,
  accessing,
  getCorp,
  getRunner,
  getRun,
  getIce,
  getContent,
  getProgram,
  findCard,
  refresh,
  playFromHand,
  rez,
  cardSubroutine,
  encounterContinue,
  lastLogContains,
  secondLastLogContains,
  changedMulti,
  getScored,
} from "../test_framework";

// ============================================================
// R&D Access Tests
// ============================================================

describe("rd-access", () => {
  it("Nothing in R&D, no upgrades", () => {
    doGame((state) => {
      newGame(state, {
        corp: { deck: ["Hedge Fund"], hand: qty("Hedge Fund", 4) },
      });
      clickDraw(state, "corp");
      takeCredits(state, "corp");
      runEmptyServer(state, "R&D");
      expect(getRun(state)).toBeUndefined();
      expect(noPrompt(state, "runner")).toBe(true);
      expect(noPrompt(state, "corp")).toBe(true);
    });
  });

  it("Something in R&D, no upgrades", () => {
    doGame((state) => {
      newGame(state, {
        corp: { deck: qty("Hedge Fund", 5), hand: ["Hedge Fund"] },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "R&D");
      expect(promptButtons(state, "runner")).toEqual(["No action"]);
      clickPrompt(state, "runner", "No action");
      expect(getRun(state)).toBeUndefined();
      expect(noPrompt(state, "runner")).toBe(true);
      expect(noPrompt(state, "corp")).toBe(true);
    });
  });

  it("Nothing in R&D, an unrezzed upgrade", () => {
    doGame((state) => {
      newGame(state, {
        corp: { deck: [], hand: [...qty("Hedge Fund", 5), "Bryan Stinson"] },
      });
      playFromHand(state, "corp", "Bryan Stinson", "R&D");
      takeCredits(state, "corp");
      runEmptyServer(state, "R&D");
      expect(promptButtons(state, "runner")).toEqual([
        "Pay 5 [Credits] to trash",
        "No action",
      ]);
      clickPrompt(state, "runner", "No action");
      expect(getRun(state)).toBeUndefined();
      expect(noPrompt(state, "runner")).toBe(true);
      expect(noPrompt(state, "corp")).toBe(true);
    });
  });

  it("Something in R&D, an upgrade", () => {
    doGame((state) => {
      newGame(state, {
        corp: { deck: qty("Hedge Fund", 5), hand: ["Bryan Stinson"] },
      });
      playFromHand(state, "corp", "Bryan Stinson", "R&D");
      takeCredits(state, "corp");
      runEmptyServer(state, "R&D");
      expect(promptButtons(state, "runner")).toEqual([
        "Card from deck",
        "Unrezzed upgrade",
      ]);
      clickPrompt(state, "runner", "Card from deck");
      clickPrompt(state, "runner", "No action");
      expect(promptButtons(state, "runner")).toEqual([
        "Pay 5 [Credits] to trash",
        "No action",
      ]);
      clickPrompt(state, "runner", "No action");
      expect(getRun(state)).toBeUndefined();
      expect(noPrompt(state, "runner")).toBe(true);
      expect(noPrompt(state, "corp")).toBe(true);
    });
  });

  it("Accessing multiple cards from R&D", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: [],
          hand: [...qty("Hedge Fund", 2), ...qty("Hostile Takeover", 2)],
        },
      });
      // Move cards to deck in order
      const corp = getCorp(state);
      core.move(
        state,
        "corp",
        findCard("Hedge Fund", corp.hand),
        "deck"
      );
      core.move(
        state,
        "corp",
        findCard("Hostile Takeover", corp.hand),
        "deck"
      );
      core.move(
        state,
        "corp",
        findCard("Hedge Fund", corp.hand),
        "deck"
      );
      core.move(
        state,
        "corp",
        findCard("Hostile Takeover", corp.hand),
        "deck"
      );
      takeCredits(state, "corp");
      runOn(state, "R&D");
      core.accessBonus(state, "runner", "rd", 2);
      runContinue(state);
      // Hedge Fund #1
      expect(promptButtons(state, "runner")).toEqual(["No action"]);
      clickPrompt(state, "runner", "No action");
      // Hostile Takeover #1
      expect(promptButtons(state, "runner")).toEqual(["Steal"]);
      clickPrompt(state, "runner", "Steal");
      // Hedge Fund #2
      expect(promptButtons(state, "runner")).toEqual(["No action"]);
      clickPrompt(state, "runner", "No action");
      // No more accesses
      expect(getRun(state)).toBeUndefined();
      expect(noPrompt(state, "runner")).toBe(true);
      expect(noPrompt(state, "corp")).toBe(true);
    });
  });

  it("Accessing multiple cards from R&D with multiple upgrades", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: [
            "Keegan Lane",
            "Midway Station Grid",
            "Sweeps Week",
            "Manhunt",
            "Hedge Fund",
            "Big Brother",
          ],
        },
        runner: { deck: ["Medium"] },
      });
      playFromHand(state, "corp", "Keegan Lane", "R&D");
      playFromHand(state, "corp", "Midway Station Grid", "R&D");
      rez(state, "corp", getContent(state, "rd", 1));
      const corp = getCorp(state);
      core.move(
        state,
        "corp",
        findCard("Hedge Fund", corp.hand),
        "deck"
      );
      core.move(
        state,
        "corp",
        findCard("Sweeps Week", corp.hand),
        "deck"
      );
      core.move(
        state,
        "corp",
        findCard("Manhunt", corp.hand),
        "deck"
      );
      core.move(
        state,
        "corp",
        findCard("Big Brother", corp.hand),
        "deck"
      );
      takeCredits(state, "corp");
      runOn(state, "R&D");
      core.accessBonus(state, "runner", "rd", 2);
      runContinue(state);
      expect(promptButtons(state, "runner")).toEqual([
        "Card from deck",
        "Midway Station Grid",
        "Unrezzed upgrade",
      ]);
      clickPrompt(state, "runner", "Card from deck");
      expect(accessing(state, "Hedge Fund")).toBe(true);
      clickPrompt(state, "runner", "No action");
      expect(promptButtons(state, "runner")).toEqual([
        "Card from deck",
        "Midway Station Grid",
        "Unrezzed upgrade",
      ]);
      clickPrompt(state, "runner", "Unrezzed upgrade");
      expect(accessing(state, "Keegan Lane")).toBe(true);
      clickPrompt(state, "runner", "No action");
      expect(promptButtons(state, "runner")).toEqual([
        "Card from deck",
        "Midway Station Grid",
      ]);
      clickPrompt(state, "runner", "Card from deck");
      expect(accessing(state, "Sweeps Week")).toBe(true);
      clickPrompt(state, "runner", "No action");
      expect(promptButtons(state, "runner")).toEqual([
        "Card from deck",
        "Midway Station Grid",
      ]);
      clickPrompt(state, "runner", "Midway Station Grid");
      expect(accessing(state, "Midway Station Grid")).toBe(true);
      clickPrompt(state, "runner", "No action");
      expect(accessing(state, "Manhunt")).toBe(true);
      clickPrompt(state, "runner", "No action");
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });

  it("Looping Ganked! and Ansel", () => {
    doGame((state) => {
      newGame(state, {
        corp: { hand: ["Ganked!", "Ansel 1.0"] },
      });
      playFromHand(state, "corp", "Ganked!", "R&D");
      playFromHand(state, "corp", "Ansel 1.0", "R&D");
      takeCredits(state, "corp");
      const ansel = getIce(state, "rd", 0);
      rez(state, "corp", ansel);
      runOn(state, "R&D");
      runContinueUntil(state, "success");
      for (let i = 0; i < 3; i++) {
        clickPrompt(state, "corp", "Yes");
        clickCard(state, "corp", ansel);
        cardSubroutine(state, "corp", refresh(state, ansel), 1);
        clickCard(state, "corp", "Ganked!");
        clickPrompt(state, "corp", "R&D");
        encounterContinue(state);
        clickPrompt(state, "runner", "Yes");
      }
      clickPrompt(state, "corp", "No");
      clickPrompt(state, "runner", "No action");
    });
  });
});

// ============================================================
// R&D Total Accesses Reduced Tests
// ============================================================

describe("rd-total-accesses-reduced-by-1-accessing-1-card", () => {
  it("R&D - Accesses reduced by 1 - Accessing 1 card", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: [...qty("Hedge Fund", 2), "Bryan Stinson"],
        },
      });
      takeCredits(state, "corp");
      runOn(state, "rd");
      core.accessBonus(state, "corp", "total", -1);
      runContinue(state);
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });
});

describe("rd-total-accesses-reduced-by-1-accessing-1-deck-1-upgrade", () => {
  it("R&D - Accesses reduced by 1 - Accessing 1 card from deck and 1 upgrade", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: [...qty("Hedge Fund", 2), "Bryan Stinson"],
        },
      });
      playFromHand(state, "corp", "Bryan Stinson", "R&D");
      takeCredits(state, "corp");
      runOn(state, "rd");
      core.accessBonus(state, "corp", "total", -1);
      runContinue(state);
      clickPrompt(state, "runner", "Card from deck");
      clickPrompt(state, "runner", "No action");
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });
});

describe("rd-total-accesses-reduced-by-1-accessing-3-deck", () => {
  it("R&D - Accesses reduced by 1 - Accessing 3 cards from deck", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: [...qty("Hedge Fund", 2), "Bryan Stinson"],
        },
        runner: { hand: ["The Maker's Eye"] },
      });
      takeCredits(state, "corp");
      playFromHand(state, "runner", "The Maker's Eye");
      runContinue(state);
      core.accessBonus(state, "corp", "total", -1);
      runContinue(state);
      clickPrompt(state, "runner", "No action");
      clickPrompt(state, "runner", "No action");
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });
});

// ============================================================
// HQ Access Tests
// ============================================================

describe("hq-access", () => {
  it("Nothing in HQ, no upgrades", () => {
    doGame((state) => {
      newGame(state, {
        corp: { deck: qty("Hedge Fund", 5), hand: [] },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "HQ");
      expect(getRun(state)).toBeUndefined();
      expect(noPrompt(state, "runner")).toBe(true);
    });
  });

  it("Something in HQ, no upgrades", () => {
    doGame((state) => {
      newGame(state, {
        corp: { deck: qty("Hedge Fund", 5), hand: ["Hedge Fund"] },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "HQ");
      expect(promptButtons(state, "runner")).toEqual(["No action"]);
      clickPrompt(state, "runner", "No action");
      expect(getRun(state)).toBeUndefined();
      expect(noPrompt(state, "runner")).toBe(true);
    });
  });

  it("Nothing in HQ, an unrezzed upgrade", () => {
    doGame((state) => {
      newGame(state, {
        corp: { deck: qty("Hedge Fund", 5), hand: ["Bryan Stinson"] },
      });
      playFromHand(state, "corp", "Bryan Stinson", "HQ");
      takeCredits(state, "corp");
      runEmptyServer(state, "HQ");
      expect(promptButtons(state, "runner")).toEqual([
        "Pay 5 [Credits] to trash",
        "No action",
      ]);
      clickPrompt(state, "runner", "No action");
      expect(getRun(state)).toBeUndefined();
      expect(noPrompt(state, "runner")).toBe(true);
    });
  });

  it("Nothing in HQ, multiple unrezzed upgrades", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Bryan Stinson", "Expo Grid"],
        },
      });
      playFromHand(state, "corp", "Bryan Stinson", "HQ");
      playFromHand(state, "corp", "Expo Grid", "HQ");
      takeCredits(state, "corp");
      runEmptyServer(state, "HQ");
      clickCard(state, "runner", getContent(state, "hq", 0));
      expect(promptButtons(state, "runner")).toEqual([
        "Pay 5 [Credits] to trash",
        "No action",
      ]);
      clickPrompt(state, "runner", "No action");
      expect(promptButtons(state, "runner")).toEqual([
        "Pay 3 [Credits] to trash",
        "No action",
      ]);
      clickPrompt(state, "runner", "No action");
      expect(getRun(state)).toBeUndefined();
      expect(noPrompt(state, "runner")).toBe(true);
    });
  });

  it("Something in HQ, an upgrade", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Hedge Fund", "Bryan Stinson"],
        },
      });
      playFromHand(state, "corp", "Bryan Stinson", "HQ");
      takeCredits(state, "corp");
      runEmptyServer(state, "HQ");
      expect(promptButtons(state, "runner")).toEqual([
        "Card from hand",
        "Unrezzed upgrade",
      ]);
      clickPrompt(state, "runner", "Card from hand");
      clickPrompt(state, "runner", "No action");
      expect(promptButtons(state, "runner")).toEqual([
        "Pay 5 [Credits] to trash",
        "No action",
      ]);
      clickPrompt(state, "runner", "No action");
      expect(getRun(state)).toBeUndefined();
      expect(noPrompt(state, "runner")).toBe(true);
    });
  });

  it("when access is limited to a single card, access only it", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: [...qty("Hedge Fund", 2), "Bryan Stinson"],
        },
      });
      playFromHand(state, "corp", "Bryan Stinson", "HQ");
      const bryan = getContent(state, "hq", 0);
      rez(state, "corp", bryan);
      takeCredits(state, "corp");
      runOn(state, "HQ");
      core.setOnlyCardToAccess(state, bryan);
      runContinue(state);
      expect(promptButtons(state, "runner")).toEqual([
        "Pay 5 [Credits] to trash",
        "No action",
      ]);
      clickPrompt(state, "runner", "Pay 5 [Credits] to trash");
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });

  it("Looping Ganked! and Ansel", () => {
    doGame((state) => {
      newGame(state, {
        corp: { hand: ["Ganked!", "Ansel 1.0"] },
      });
      playFromHand(state, "corp", "Ganked!", "HQ");
      playFromHand(state, "corp", "Ansel 1.0", "HQ");
      takeCredits(state, "corp");
      const ansel = getIce(state, "hq", 0);
      rez(state, "corp", ansel);
      runOn(state, "HQ");
      runContinueUntil(state, "success");
      for (let i = 0; i < 3; i++) {
        clickPrompt(state, "corp", "Yes");
        clickCard(state, "corp", ansel);
        cardSubroutine(state, "corp", refresh(state, ansel), 1);
        clickCard(state, "corp", "Ganked!");
        clickPrompt(state, "corp", "HQ");
        encounterContinue(state);
        clickPrompt(state, "runner", "Yes");
      }
      clickPrompt(state, "corp", "No");
      clickPrompt(state, "runner", "No action");
    });
  });
});

// ============================================================
// HQ Total Accesses Reduced Tests
// ============================================================

describe("hq-total-accesses-reduced-by-1-accessing-1-card", () => {
  it("HQ - Accesses reduced by 1 - Accessing 1 card", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: [...qty("Hedge Fund", 2), "Bryan Stinson"],
        },
      });
      takeCredits(state, "corp");
      runOn(state, "hq");
      core.accessBonus(state, "corp", "total", -1);
      runContinue(state);
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });
});

describe("hq-total-accesses-reduced-by-1-accessing-1-hand-1-upgrade", () => {
  it("HQ - Accesses reduced by 1 - Accessing 1 card from hand and 1 upgrade", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: [...qty("Hedge Fund", 2), "Bryan Stinson"],
        },
      });
      playFromHand(state, "corp", "Bryan Stinson", "HQ");
      takeCredits(state, "corp");
      runOn(state, "hq");
      core.accessBonus(state, "corp", "total", -1);
      runContinue(state);
      clickPrompt(state, "runner", "Card from hand");
      clickPrompt(state, "runner", "No action");
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });
});

describe("hq-total-accesses-reduced-by-1-accessing-2-hand", () => {
  it("HQ - Accesses reduced by 1 - Accessing 2 cards from hand", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: [...qty("Hedge Fund", 2), "Bryan Stinson"],
        },
        runner: { hand: ["Docklands Pass"] },
      });
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Docklands Pass");
      runOn(state, "hq");
      core.accessBonus(state, "corp", "total", -1);
      runContinue(state);
      clickPrompt(state, "runner", "No action");
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });
});

// ============================================================
// Archives Access Tests
// ============================================================

describe("archives-access", () => {
  it("Nothing in archives", () => {
    doGame((state) => {
      newGame(state, {
        corp: { deck: qty("Hedge Fund", 5), hand: ["Hedge Fund"] },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "Archives");
      expect(noPrompt(state, "runner")).toBe(true);
    });
  });

  it("only non-interactive cards", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Hedge Fund"],
          discard: ["Hedge Fund", "Beanstalk Royalties"],
        },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "Archives");
      expect(noPrompt(state, "runner")).toBe(true);
    });
  });

  it("contains one agenda", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Hedge Fund"],
          discard: ["Hostile Takeover"],
        },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "Archives");
      expect(promptButtons(state, "runner")).toEqual(["Steal"]);
      clickPrompt(state, "runner", "Steal");
      expect(getRunner(state).agendaPoint).toBe(1);
    });
  });

  it("contains multiple agendas", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Hedge Fund"],
          discard: ["Hostile Takeover", "15 Minutes"],
        },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "Archives");
      expect(
        promptButtons(state, "runner").sort()
      ).toEqual(["15 Minutes", "Hostile Takeover"]);
      clickPrompt(state, "runner", "Hostile Takeover");
      clickPrompt(state, "runner", "Steal");
      expect(accessing(state, "15 Minutes")).toBe(true);
      clickPrompt(state, "runner", "Steal");
      expect(getRun(state)).toBeUndefined();
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRunner(state).agendaPoint).toBe(2);
    });
  });

  it("contains one access ability", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Hedge Fund"],
          discard: ["Cyberdex Virus Suite"],
        },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "Archives");
      expect(waiting(state, "runner")).toBe(true);
      clickPrompt(state, "corp", "Yes");
    });
  });

  it("contains multiple access abilities", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Hedge Fund"],
          discard: ["Cyberdex Virus Suite", "Shock!"],
        },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "Archives");
      expect(promptButtons(state, "runner").sort()).toEqual([
        "Cyberdex Virus Suite",
        "Shock!",
      ]);
      clickPrompt(state, "runner", "Shock!");
      expect(waiting(state, "runner")).toBe(true);
      clickPrompt(state, "corp", "Yes");
    });
  });

  it("contains agendas and access abilities", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Hedge Fund"],
          discard: ["Hostile Takeover", "Cyberdex Virus Suite"],
        },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "Archives");
      expect(promptButtons(state, "runner").sort()).toEqual([
        "Cyberdex Virus Suite",
        "Hostile Takeover",
      ]);
      clickPrompt(state, "runner", "Cyberdex Virus Suite");
      expect(waiting(state, "runner")).toBe(true);
      clickPrompt(state, "corp", "Yes");
      expect(accessing(state, "Hostile Takeover")).toBe(true);
      clickPrompt(state, "runner", "Steal");
      expect(getRunner(state).agendaPoint).toBe(1);
    });
  });

  it("contains non-interactive cards, agendas, and access abilities", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Hedge Fund"],
          discard: [
            "Hedge Fund",
            "Hostile Takeover",
            "Cyberdex Virus Suite",
          ],
        },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "Archives");
      expect(promptButtons(state, "runner").sort()).toEqual([
        "Cyberdex Virus Suite",
        "Everything else",
        "Hostile Takeover",
      ]);
      clickPrompt(state, "runner", "Cyberdex Virus Suite");
      expect(waiting(state, "runner")).toBe(true);
      clickPrompt(state, "corp", "Yes");
      expect(promptButtons(state, "runner")).toEqual([
        "Hostile Takeover",
        "Everything else",
      ]);
      clickPrompt(state, "runner", "Hostile Takeover");
      clickPrompt(state, "runner", "Steal");
      expect(getRunner(state).agendaPoint).toBe(1);
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });

  it("when access count is reduced by 1", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Bryan Stinson"],
          discard: ["Hedge Fund", "Hostile Takeover"],
        },
        runner: { credits: 10 },
      });
      playFromHand(state, "corp", "Bryan Stinson", "Archives");
      rez(state, "corp", getContent(state, "archives", 0));
      takeCredits(state, "corp");
      runOn(state, "Archives");
      core.accessBonus(state, "corp", "total", -1);
      runContinue(state);
      expect(promptButtons(state, "runner")).toEqual([
        "Hostile Takeover",
        "Bryan Stinson",
        "Everything else",
      ]);
      clickPrompt(state, "runner", "Bryan Stinson");
      clickPrompt(state, "runner", "No action");
      expect(promptButtons(state, "runner")).toEqual([
        "Hostile Takeover",
        "Everything else",
      ]);
      clickPrompt(state, "runner", "Everything else");
      expect(getRunner(state).agendaPoint).toBe(0);
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });

  it("when access count is reduced by more than 1", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Bryan Stinson"],
          discard: ["Hedge Fund", "Hostile Takeover", "Shock!"],
        },
        runner: { credits: 10 },
      });
      playFromHand(state, "corp", "Bryan Stinson", "Archives");
      rez(state, "corp", getContent(state, "archives", 0));
      takeCredits(state, "corp");
      runOn(state, "Archives");
      core.accessBonus(state, "corp", "total", -2);
      runContinue(state);
      expect(promptButtons(state, "runner").sort()).toEqual([
        "Bryan Stinson",
        "Everything else",
        "Hostile Takeover",
        "Shock!",
      ]);
      clickPrompt(state, "runner", "Bryan Stinson");
      clickPrompt(state, "runner", "No action");
      expect(promptButtons(state, "runner").sort()).toEqual([
        "Everything else",
        "Hostile Takeover",
        "Shock!",
      ]);
      clickPrompt(state, "runner", "Everything else");
      expect(getRunner(state).agendaPoint).toBe(0);
      expect(getRunner(state).discard.length).toBe(0);
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });

  it("when access is limited to a single card, access only it #5015", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Bryan Stinson"],
          discard: ["Hostile Takeover", "Cyberdex Virus Suite"],
        },
      });
      playFromHand(state, "corp", "Bryan Stinson", "Archives");
      const bryan = getContent(state, "archives", 0);
      rez(state, "corp", bryan);
      takeCredits(state, "corp");
      runOn(state, "Archives");
      core.setOnlyCardToAccess(state, bryan);
      runContinue(state);
      expect(promptButtons(state, "runner")).toEqual([
        "Pay 5 [Credits] to trash",
        "No action",
      ]);
      clickPrompt(state, "runner", "Pay 5 [Credits] to trash");
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });

  it("when a card is turned facedown mid-access", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Bryan Stinson"],
          discard: [
            "Hostile Takeover",
            "Cyberdex Virus Suite",
            "Hedge Fund",
          ],
        },
      });
      playFromHand(state, "corp", "Bryan Stinson", "Archives");
      rez(state, "corp", getContent(state, "archives", 0));
      takeCredits(state, "corp");
      runOn(state, "Archives");
      runContinue(state);
      expect(promptButtons(state, "runner").sort()).toEqual([
        "Bryan Stinson",
        "Cyberdex Virus Suite",
        "Hostile Takeover",
      ]);
      clickPrompt(state, "runner", "Hostile Takeover");
      // Turn Hedge Fund facedown by removing :seen
      const hedgeFund = findCard(
        "Hedge Fund",
        getCorp(state).discard
      );
      delete hedgeFund.seen;
      core.update(state, "corp", hedgeFund);
      clickPrompt(state, "runner", "Steal");
      expect(promptButtons(state, "runner")).toEqual([
        "Cyberdex Virus Suite",
        "Bryan Stinson",
        "Facedown card in Archives",
      ]);
      clickPrompt(state, "runner", "Cyberdex Virus Suite");
      clickPrompt(state, "corp", "No");
      expect(promptButtons(state, "runner")).toEqual([
        "Bryan Stinson",
        "Facedown card in Archives",
      ]);
      clickPrompt(state, "runner", "Facedown card in Archives");
      clickPrompt(state, "runner", "No action");
      expect(
        secondLastLogContains(
          state,
          "Runner accesses Hedge Fund from Archives."
        )
      ).toBe(true);
      expect(accessing(state, "Bryan Stinson")).toBe(true);
      expect(promptButtons(state, "runner")).toEqual([
        "Pay 5 [Credits] to trash",
        "No action",
      ]);
      clickPrompt(state, "runner", "No action");
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });

  it("stealing multiple agendas from archives", () => {
    doGame((state) => {
      newGame(state, {
        corp: { discard: qty("Breaking News", 3) },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "archives");
      clickPrompt(state, "runner", "Breaking News");
      clickPrompt(state, "runner", "Steal");
      clickPrompt(state, "runner", "Breaking News");
      clickPrompt(state, "runner", "Steal");
      expect(accessing(state, "Breaking News")).toBe(true);
      clickPrompt(state, "runner", "Steal");
      expect(getScored(state, "runner").length).toBe(3);
      expect(getCorp(state).discard.length).toBe(0);
    });
  });

  it("choosing Everything else first #5151", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          discard: [
            "Global Food Initiative",
            ...qty("Blue Level Clearance", 3),
          ],
        },
      });
      takeCredits(state, "corp");
      runEmptyServer(state, "Archives");
      expect(promptButtons(state, "runner")).toEqual([
        "Global Food Initiative",
        "Everything else",
      ]);
      clickPrompt(state, "runner", "Everything else");
      expect(
        secondLastLogContains(
          state,
          "Runner accesses everything else in Archives"
        )
      ).toBe(true);
      expect(accessing(state, "Global Food Initiative")).toBe(true);
      expect(promptButtons(state, "runner")).toEqual(["Steal"]);
      clickPrompt(state, "runner", "Steal");
    });
  });

  it("Looping Ganked! and Ansel", () => {
    doGame((state) => {
      newGame(state, {
        corp: { hand: ["Ganked!", "Ansel 1.0"] },
      });
      playFromHand(state, "corp", "Ganked!", "Archives");
      playFromHand(state, "corp", "Ansel 1.0", "Archives");
      takeCredits(state, "corp");
      const ansel = getIce(state, "archives", 0);
      rez(state, "corp", ansel);
      runOn(state, "Archives");
      runContinueUntil(state, "success");
      for (let i = 0; i < 3; i++) {
        clickPrompt(state, "corp", "Yes");
        clickCard(state, "corp", ansel);
        cardSubroutine(state, "corp", refresh(state, ansel), 1);
        clickCard(state, "corp", "Ganked!");
        clickPrompt(state, "corp", "Archives");
        encounterContinue(state);
        clickPrompt(state, "runner", "Yes");
      }
      clickPrompt(state, "corp", "No");
      clickPrompt(state, "runner", "No action");
    });
  });
});

// ============================================================
// Remote Access Tests
// ============================================================

describe("remote-access", () => {
  it("reduced by 1 #5014", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Bryan Stinson"],
          discard: ["Hedge Fund", "Hostile Takeover"],
        },
        runner: { credits: 10 },
      });
      playFromHand(state, "corp", "Bryan Stinson", "New remote");
      rez(state, "corp", getContent(state, "remote1", 0));
      takeCredits(state, "corp");
      runOn(state, "Server 1");
      core.accessBonus(state, "runner", "total", -1);
      runContinue(state);
      expect(noPrompt(state, "corp")).toBe(true);
      expect(noPrompt(state, "runner")).toBe(true);
      expect(getRun(state)).toBeUndefined();
    });
  });

  it("Looping Ganked! and Ansel", () => {
    doGame((state) => {
      newGame(state, {
        corp: { hand: ["Ganked!", "Ansel 1.0"] },
      });
      playFromHand(state, "corp", "Ganked!", "New remote");
      playFromHand(state, "corp", "Ansel 1.0", "Server 1");
      takeCredits(state, "corp");
      const ansel = getIce(state, "remote1", 0);
      rez(state, "corp", ansel);
      runOn(state, "Server 1");
      runContinueUntil(state, "success");
      for (let i = 0; i < 3; i++) {
        clickPrompt(state, "corp", "Yes");
        clickCard(state, "corp", ansel);
        cardSubroutine(state, "corp", refresh(state, ansel), 1);
        clickCard(state, "corp", "Ganked!");
        clickPrompt(state, "corp", "Server 1");
        encounterContinue(state);
        clickPrompt(state, "runner", "Yes");
      }
      clickPrompt(state, "corp", "No");
      clickPrompt(state, "runner", "No action");
    });
  });
});

// ============================================================
// Access Count Tests
// ============================================================

describe("access-count", () => {
  it("rd", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 2),
          hand: qty("Hedge Fund", 2),
        },
      });
      expect(
        core.numCardsToAccess(state, "runner", "rd", null)
      ).toEqual({ randomAccessLimit: 1, totalMod: 0, chosen: 0 });
      core.accessBonus(state, "runner", "rd", 2);
      expect(
        core.numCardsToAccess(state, "runner", "rd", null)
      ).toEqual({ randomAccessLimit: 3, totalMod: 0, chosen: 0 });
      core.accessBonus(state, "runner", "total", -1);
      expect(
        core.numCardsToAccess(state, "runner", "rd", null)
      ).toEqual({ randomAccessLimit: 3, totalMod: -1, chosen: 0 });
    });
  });

  it("hq", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 2),
          hand: qty("Hedge Fund", 2),
        },
      });
      expect(
        core.numCardsToAccess(state, "runner", "hq", null)
      ).toEqual({ randomAccessLimit: 1, totalMod: 0, chosen: 0 });
      core.accessBonus(state, "runner", "hq", 2);
      expect(
        core.numCardsToAccess(state, "runner", "hq", null)
      ).toEqual({ randomAccessLimit: 3, totalMod: 0, chosen: 0 });
      core.accessBonus(state, "runner", "total", -1);
      expect(
        core.numCardsToAccess(state, "runner", "hq", null)
      ).toEqual({ randomAccessLimit: 3, totalMod: -1, chosen: 0 });
    });
  });

  it("archives", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 2),
          discard: qty("Hedge Fund", 2),
        },
      });
      expect(
        core.numCardsToAccess(state, "runner", "archives", null)
      ).toEqual({ totalMod: 0, chosen: 0 });
      core.accessBonus(state, "runner", "total", -1);
      expect(
        core.numCardsToAccess(state, "runner", "archives", null)
      ).toEqual({ totalMod: -1, chosen: 0 });
    });
  });
});

// ============================================================
// Multiple Trash Abilities Tests
// ============================================================

describe("multiple-trash-abilities", () => {
  it("Mumbad Virtual Tour", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Mumbad Virtual Tour"],
          credits: 100,
        },
        runner: { hand: ["Imp", "Cupellation"] },
      });
      playFromHand(state, "corp", "Mumbad Virtual Tour", "New remote");
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Cupellation");
      playFromHand(state, "runner", "Imp");
      runEmptyServer(state, "remote1");
      expect(promptButtons(state, "runner")).toEqual([
        "[Imp] Hosted virus counter: Trash card",
      ]);
      clickPrompt(state, "runner", "[Imp] Hosted virus counter: Trash card");
      expect(
        lastLogContains(state, "to use Imp to trash Mumbad Virtual Tour")
      ).toBe(true);
      expect(getProgram(state, 0).hosted.length).toBe(0);
    });
  });

  it("Multiple imps", () => {
    doGame((state) => {
      newGame(state, {
        corp: {
          deck: qty("Hedge Fund", 5),
          hand: ["Mumbad Virtual Tour", "Orbital Superiority"],
          credits: 100,
        },
        runner: { hand: qty("Imp", 2), credits: 100 },
      });
      playFromHand(state, "corp", "Mumbad Virtual Tour", "New remote");
      playFromHand(state, "corp", "Orbital Superiority", "New remote");
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Imp");
      playFromHand(state, "runner", "Imp");
      const [imp1, imp2] = getProgram(state);
      runEmptyServer(state, "remote1");
      expect(promptButtons(state, "runner")).toEqual([
        "[Imp] Hosted virus counter: Trash card",
        "[Imp] Hosted virus counter: Trash card",
      ]);
      expect(
        changedMulti(
          [
            [() => getProgram(state)[0].counters?.virus ?? 0, 0],
            [() => getProgram(state)[1].counters?.virus ?? 0, -1],
          ],
          () => {
            clickPrompt(
              state,
              "runner",
              promptButtons(state, "runner")[1]
            );
          }
        )
      ).toBe(true);
      expect(
        lastLogContains(state, "to use Imp to trash Mumbad Virtual Tour")
      ).toBe(true);
      expect(getRun(state)).toBeUndefined();
      takeCredits(state, "runner");
      takeCredits(state, "corp");
      runEmptyServer(state, "remote2");
      expect(promptButtons(state, "runner")).toEqual([
        "[Imp] Hosted virus counter: Trash card",
        "[Imp] Hosted virus counter: Trash card",
        "Steal",
      ]);
      expect(
        changedMulti(
          [
            [() => getProgram(state)[0].counters?.virus ?? 0, 0],
            [() => getProgram(state)[1].counters?.virus ?? 0, -1],
          ],
          () => {
            clickPrompt(
              state,
              "runner",
              promptButtons(state, "runner")[1]
            );
          }
        )
      ).toBe(true);
      expect(
        lastLogContains(state, "to use Imp to trash Orbital Superiority")
      ).toBe(true);
    });
  });
});
