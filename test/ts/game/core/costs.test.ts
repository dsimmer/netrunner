import { describe, it, expect } from "vitest";
import * as core from "@/game/core";
import { mergeCosts, toC } from "@/game/core/payment";
import {
  newGame,
  takeCredits,
  playFromHand,
  runOn,
  rez,
  runContinue,
  clickCard,
  clickPrompt,
  autoPump,
  autoPumpAndBreak,
  cardAbility,
  expend,
  getIce,
  getContent,
  getProgram,
  getRunner,
  getCorp,
  getStrength,
  getPromptMap,
  refresh,
  lastLogContains,
  secondLastLogContains,
  lastNLogContains,
  qty,
  doGame,
} from "../test_framework/index";

describe("merge-costs", () => {
  describe("Non-damage costs", () => {
    it("No defaults, already merged", () => {
      expect(mergeCosts([[toC("credit", 1)]])).toEqual([toC("credit", 1)]);
    });

    it("Costs are already flattened", () => {
      expect(mergeCosts([[toC("credit", 1), toC("click", 1)]])).toEqual([
        toC("click", 1),
        toC("credit", 1),
      ]);
    });

    it("Passed as a flattened vec", () => {
      expect(mergeCosts([toC("credit", 1)])).toEqual([toC("credit", 1)]);
    });

    it("Default type is only element", () => {
      expect(mergeCosts([[toC("credit")]])).toEqual([toC("credit", 1)]);
    });

    it("Default plus explicit", () => {
      expect(mergeCosts([toC("click"), toC("credit", 1)])).toEqual([
        toC("click", 1),
        toC("credit", 1),
      ]);
    });

    it("Costs ending with defaults expand", () => {
      expect(mergeCosts([[toC("credit", 1), toC("click")]])).toEqual([
        toC("click", 1),
        toC("credit", 1),
      ]);
    });

    it("Non-damage costs aren't reordered", () => {
      expect(mergeCosts([[toC("click", 1), toC("credit", 1)]])).not.toEqual([
        toC("credit", 1),
        toC("click", 1),
      ]);
    });

    it("Costs with all defaults are expanded", () => {
      expect(mergeCosts([toC("click"), toC("credit")])).toEqual([
        toC("click", 1),
        toC("credit", 1),
      ]);
    });

    it("Non-damage costs are combined", () => {
      expect(
        mergeCosts([
          toC("click", 1),
          [toC("click", 3)],
          toC("credit", 1),
          toC("credit", 1),
        ]),
      ).toEqual([toC("click", 4), toC("credit", 2)]);
    });

    it("Deeply nested costs are flattened", () => {
      expect(
        mergeCosts([
          [[[[[toC("click", 1)]]]]],
          [[[[[toC("click", 1)]]]]],
          toC("click", 1),
        ]),
      ).toEqual([toC("click", 3)]);
    });

    it("Empty costs return an empty list", () => {
      expect(mergeCosts([])).toEqual([]);
    });

    it("nil costs return an empty list", () => {
      expect(mergeCosts(undefined)).toEqual([]);
    });

    it("Stealth credits are totaled correctly", () => {
      expect(
        mergeCosts([
          toC("credit", 3, { stealth: 1 }),
          toC("credit", 2, { stealth: 1 }),
        ]),
      ).toEqual([toC("credit", 5, { stealth: 2 })]);
    });
  });

  describe("Damage costs", () => {
    it("Damage costs are moved to the end", () => {
      expect(mergeCosts([toC("net", 1), toC("credit", 1)])).toEqual([
        toC("credit", 1),
        toC("net", 1),
      ]);
    });

    it("Damage is combined", () => {
      expect(mergeCosts([[toC("net", 1), toC("net", 1)]])).toEqual([
        toC("net", 2),
      ]);
    });

    it("Net, meat, and core damage are recognized", () => {
      expect(
        mergeCosts([toC("net", 1), toC("meat", 1), toC("brain", 1)]),
      ).toEqual([toC("net", 1), toC("meat", 1), toC("brain", 1)]);
    });
  });
});

describe("pay-credits", () => {
  it("Testing several cost messages", () => {
    doGame((state) => {
      newGame(
        {
          runner: {
            hand: [
              "Diesel",
              "Daily Casts",
              "Clot",
              "Career Fair",
              "Daily Casts",
              "Sure Gamble",
              "Misdirection",
            ],
            deck: qty("Ika", 15),
          },
          corp: {
            hand: [
              ...qty("Ice Wall", 2),
              "Turtlebacks",
              "Beanstalk Royalties",
              "Hedge Fund",
              "Project Beale",
              "Ben Musashi",
            ],
          },
        },
        state,
      );
      core.gain(state, "corp", "click", 10);
      playFromHand(state, "corp", "Ice Wall", "HQ");
      expect(
        lastLogContains(
          state,
          "Corp spends [Click] and pays 0 [Credits] to install ice protecting HQ.",
        ),
      ).toBe(true);

      playFromHand(state, "corp", "Ice Wall", "HQ");
      expect(
        lastLogContains(
          state,
          "Corp spends [Click] and pays 1 [Credits] to install ice protecting HQ.",
        ),
      ).toBe(true);

      playFromHand(state, "corp", "Turtlebacks", "New remote");
      expect(
        lastLogContains(
          state,
          "Corp spends [Click] to install a card in the root of Server 1.",
        ),
      ).toBe(true);

      playFromHand(state, "corp", "Ben Musashi", "Server 1");
      expect(
        lastLogContains(
          state,
          "Corp spends [Click] to install a card in the root of Server 1.",
        ),
      ).toBe(true);

      playFromHand(state, "corp", "Project Beale", "New remote");
      expect(
        lastLogContains(
          state,
          "Corp spends [Click] to install a card in the root of Server 2.",
        ),
      ).toBe(true);

      playFromHand(state, "corp", "Beanstalk Royalties");
      expect(
        secondLastLogContains(
          state,
          "Corp spends [Click] and pays 0 [Credits] to play Beanstalk Royalties.",
        ),
      ).toBe(true);

      playFromHand(state, "corp", "Hedge Fund");
      expect(
        secondLastLogContains(
          state,
          "Corp spends [Click] and pays 5 [Credits] to play Hedge Fund.",
        ),
      ).toBe(true);

      takeCredits(state, "corp");
      core.gain(state, "runner", "click", 10);
      playFromHand(state, "runner", "Diesel");
      expect(
        secondLastLogContains(
          state,
          "Runner spends [Click] and pays 0 [Credits] to play Diesel.",
        ),
      ).toBe(true);

      playFromHand(state, "runner", "Sure Gamble");
      expect(
        secondLastLogContains(
          state,
          "Runner spends [Click] and pays 5 [Credits] to play Sure Gamble.",
        ),
      ).toBe(true);

      playFromHand(state, "runner", "Clot");
      expect(
        lastLogContains(
          state,
          "Runner spends [Click] and pays 2 [Credits] to install Clot.",
        ),
      ).toBe(true);

      playFromHand(state, "runner", "Misdirection");
      expect(
        lastLogContains(
          state,
          "Runner spends [Click] and pays 0 [Credits] to install Misdirection.",
        ),
      ).toBe(true);

      playFromHand(state, "runner", "Career Fair");
      expect(
        lastLogContains(
          state,
          "Runner spends [Click] and pays 0 [Credits] to play Career Fair.",
        ),
      ).toBe(true);

      clickCard(state, "runner", "Daily Casts");
      expect(
        lastLogContains(
          state,
          "Runner pays 0 [Credits] to use Career Fair to install Daily Casts from the Grip",
        ),
      ).toBe(true);

      playFromHand(state, "runner", "Daily Casts");
      expect(
        lastLogContains(
          state,
          "Runner spends [Click] and pays 3 [Credits] to install Daily Casts.",
        ),
      ).toBe(true);

      runOn(state, "archives");
      expect(
        lastNLogContains(
          state,
          1,
          "Runner spends [Click] to make a run on Archives.",
        ),
      ).toBe(true);
    });
  });

  it("Issue #4295: Auto-pumping Icebreaker with pay-credits prompt", () => {
    doGame((state) => {
      newGame(
        {
          runner: { hand: ["Corroder", "Net Mercur", "Cloak"] },
          corp: { hand: ["Fire Wall"] },
        },
        state,
      );
      playFromHand(state, "corp", "Fire Wall", "HQ");
      takeCredits(state, "corp");
      core.gain(state, "runner", "credit", 10);
      playFromHand(state, "runner", "Corroder");
      playFromHand(state, "runner", "Cloak");
      playFromHand(state, "runner", "Net Mercur");
      runOn(state, "hq");

      const cre = getRunner(state).credit;
      const cor = getProgram(state, 0);
      const clo = getProgram(state, 1);

      expect(getStrength(refresh(state, cor))).toBe(2);
      autoPump(state, refresh(state, cor));
      clickCard(state, "runner", clo);
      clickPrompt(state, "runner", "Place 1 [Credits] on Net Mercur");

      expect(getStrength(refresh(state, cor))).toBe(5);
      expect(getRunner(state).credit).toBe(cre - 2);
    });
  });
});

describe("pump-and-break", () => {
  it("Basic test", () => {
    doGame((state) => {
      newGame(
        {
          runner: { hand: ["Corroder"] },
          corp: { hand: ["Hive"] },
        },
        state,
      );
      playFromHand(state, "corp", "Hive", "HQ");
      takeCredits(state, "corp");
      core.gain(state, "runner", "credit", 10);
      playFromHand(state, "runner", "Corroder");
      runOn(state, "hq");

      const cor = getProgram(state, 0);
      const hive = getIce(state, "hq", 0);

      rez(state, "corp", hive);
      runContinue(state);
      expect(getStrength(refresh(state, cor))).toBe(2);
      autoPumpAndBreak(state, refresh(state, cor));
      expect(getStrength(refresh(state, cor))).toBe(3);
      expect(
        (refresh(state, hive).subroutines ?? []).every(
          (sub: any) => sub.broken,
        ),
      ).toBe(true);
      expect(
        secondLastLogContains(
          state,
          "Runner pays 6 [Credits] to increase the strength of Corroder to 3 and break all 5 subroutines on Hive.",
        ),
      ).toBe(true);
    });
  });

  it("Auto-pump first", () => {
    doGame((state) => {
      newGame(
        {
          runner: { hand: ["Corroder"] },
          corp: { hand: ["Hive"] },
        },
        state,
      );
      playFromHand(state, "corp", "Hive", "HQ");
      takeCredits(state, "corp");
      core.gain(state, "runner", "credit", 10);
      playFromHand(state, "runner", "Corroder");
      runOn(state, "hq");

      const cor = getProgram(state, 0);
      const hive = getIce(state, "hq", 0);

      rez(state, "corp", hive);
      runContinue(state);
      autoPump(state, refresh(state, cor));
      expect(getStrength(refresh(state, cor))).toBe(3);
      expect(
        lastLogContains(
          state,
          "Runner pays 1 [Credits] to increase the strength of Corroder to 3.",
        ),
      ).toBe(true);
      autoPumpAndBreak(state, refresh(state, cor));
      expect(
        (refresh(state, hive).subroutines ?? []).every(
          (sub: any) => sub.broken,
        ),
      ).toBe(true);
      expect(
        secondLastLogContains(
          state,
          "Runner pays 5 [Credits] to use Corroder to break all 5 subroutines on Hive.",
        ),
      ).toBe(true);
    });
  });

  it("Inability to pay for auto-pump", () => {
    doGame((state) => {
      newGame(
        {
          runner: { hand: ["Corroder"] },
          corp: { hand: ["Hive"] },
        },
        state,
      );
      playFromHand(state, "corp", "Hive", "HQ");
      takeCredits(state, "corp");
      core.lose(state, "runner", "credit", 3);
      playFromHand(state, "runner", "Corroder");
      runOn(state, "hq");

      const cor = getProgram(state, 0);
      const hive = getIce(state, "hq", 0);

      rez(state, "corp", hive);
      runContinue(state);
      autoPump(state, refresh(state, cor));
      expect(getStrength(refresh(state, cor))).toBe(2);
    });
  });

  it("Auto-pump with stealth", () => {
    doGame((state) => {
      newGame(
        {
          runner: { hand: ["Houdini", ...qty("Mantle", 2)] },
          corp: { hand: ["Little Engine"] },
        },
        state,
      );
      playFromHand(state, "corp", "Little Engine", "HQ");
      takeCredits(state, "corp");
      core.gain(state, "runner", "credit", 10);
      playFromHand(state, "runner", "Houdini");
      playFromHand(state, "runner", "Mantle");
      playFromHand(state, "runner", "Mantle");
      runOn(state, "hq");

      const hou = getProgram(state, 0);
      const engine = getIce(state, "hq", 0);
      const mantle1 = getProgram(state, 1);
      const mantle2 = getProgram(state, 2);

      rez(state, "corp", engine);
      runContinue(state);
      autoPump(state, refresh(state, hou));
      expect(
        (getPromptMap(state, "runner") as any)?.msg?.includes("2 stealth") ??
          false,
      ).toBe(true);
      clickCard(state, "runner", mantle1);
      clickCard(state, "runner", mantle2);
      expect(getStrength(refresh(state, hou))).toBe(10);
      autoPumpAndBreak(state, refresh(state, hou));
      expect(
        (refresh(state, engine).subroutines ?? []).every(
          (sub: any) => sub.broken,
        ),
      ).toBe(true);
    });
  });

  it("Auto-pump and break some subs manually first", () => {
    doGame((state) => {
      newGame(
        {
          runner: { hand: ["Corroder"] },
          corp: { hand: ["Hive"] },
        },
        state,
      );
      playFromHand(state, "corp", "Hive", "HQ");
      takeCredits(state, "corp");
      core.gain(state, "runner", "credit", 10);
      playFromHand(state, "runner", "Corroder");
      runOn(state, "hq");

      const cor = getProgram(state, 0);
      const hive = getIce(state, "hq", 0);

      rez(state, "corp", hive);
      runContinue(state);
      autoPump(state, refresh(state, cor));
      expect(getStrength(refresh(state, cor))).toBe(3);
      cardAbility(state, "runner", refresh(state, cor), 0);
      clickPrompt(state, "runner", "End the run");
      clickPrompt(state, "runner", "Done");

      const unbroken = (refresh(state, hive).subroutines ?? []).filter(
        (sub: any) => !sub.broken,
      );
      expect(unbroken.length).toBe(4);

      autoPumpAndBreak(state, refresh(state, cor));
      expect(
        (refresh(state, hive).subroutines ?? []).every(
          (sub: any) => sub.broken,
        ),
      ).toBe(true);
      expect(
        secondLastLogContains(
          state,
          "Runner pays 4 [Credits] to use Corroder to break the remaining 4 subroutines on Hive.",
        ),
      ).toBe(true);
    });
  });
});

describe("run-additional-costs", () => {
  it("If runner cannot pay additional cost, server not shown as an option for run events or click to run button", () => {
    doGame((state) => {
      newGame(
        {
          corp: { deck: ["Ruhr Valley"] },
          runner: { deck: ["Dirty Laundry"] },
        },
        state,
      );
      playFromHand(state, "corp", "Ruhr Valley", "HQ");
      takeCredits(state, "corp");
      const ruhr = getContent(state, "hq", 0);
      rez(state, "corp", ruhr);
      core.gain(state, "runner", "click", -3);
      expect(getRunner(state).click).toBe(1);
      playFromHand(state, "runner", "Dirty Laundry");
      const choices = (getRunner(state).prompt?.[0] as any)?.choices ?? [];
      expect(choices.length).toBe(2);
      expect(choices).not.toContainEqual("HQ");
    });
  });
});

describe("expend-costs-reveal-the-discarded-card", () => {
  it("Expend abilities reveal the discarded card", () => {
    doGame((state) => {
      newGame(
        {
          corp: {
            id: "Hyoubu Institute: Absolute Clarity",
            hand: ["Slash and Burn Agriculture", "Ice Wall"],
          },
        },
        state,
      );
      playFromHand(state, "corp", "Ice Wall", "HQ");
      const iw = getIce(state, "hq", 0);
      const agri = getCorp(state).hand[0];

      expend(state, "corp", agri);
      clickCard(state, "corp", iw);
      expect(getCorp(state).credit).toBe(5);
    });
  });
});
