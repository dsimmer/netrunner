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
  getIce,
  getContent,
  getProgram,
  getRunner,
  getCorp,
  getStrength,
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
      expect(mergeCosts([[toC("credit")]]))).toEqual([toC("credit", 1)]);
    });

    it("Default plus explicit", () => {
      expect(mergeCosts([toC("click"), toC("credit", 1)])).toEqual([
        toC("click", 1),
        toC("credit", 1),
      ]);
    });

    it("Costs ending with defaults expand", () => {
      expect(mergeCosts([[toC("credit", 1), toC("click")]]))).toEqual([
        toC("click", 1),
        toC("credit", 1),
      ]);
    });

    it("Non-damage costs aren't reordered", () => {
      expect(mergeCosts([[toC("click", 1), toC("credit", 1)]]))).not.toEqual([
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
      expect(mergeCosts([[toC("net", 1), toC("net", 1)]]))).toEqual([
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
      ).toBe(true); // Install ice, zero cost

      playFromHand(state, "corp", "Ice Wall", "HQ");
      expect(
        lastLogContains(
          state,
          "Corp spends [Click] and pays 1 [Credits] to install ice protecting HQ.",
        ),
      ).toBe(true); // Install ice, one cost

      playFromHand(state, "corp", "Turtlebacks", "New remote");
      expect(
        lastLogContains(
          state,
          "Corp spends [Click] to install a card in the root of Server 1.",
        ),
      ).toBe(true); // Install asset, zero cost

      playFromHand(state, "corp", "Ben Musashi", "Server 1");
      expect(
        lastLogContains(
          state,
          "Corp spends [Click] to install a card in the root of Server 1.",
        ),
      ).toBe(true); // Install upgrade, zero cost

      playFromHand(state, "corp", "Project Beale", "New remote");
      expect(
        lastLogContains(
          state,
          "Corp spends [Click] to install a card in the root of Server 2.",
        ),
      ).toBe(true); // Install agenda, zero cost

      playFromHand(state, "corp", "Beanstalk Royalties");
      expect(
        secondLastLogContains(
          state,
          "Corp spends [Click] and pays 0 [Credits] to play Beanstalk Royalties.",
        ),
      ).toBe(true); // Play operation, zero cost

      playFromHand(state, "corp", "Hedge Fund");
      expect(
        secondLastLogContains(
          state,
          "Corp spends [Click] and pays 5 [Credits] to play Hedge Fund.",
        ),
      ).toBe(true); // Play operation, five cost

      takeCredits(state, "corp");
      core.gain(state, "runner", "click", 10);
      playFromHand(state, "runner", "Diesel");
      expect(
        secondLastLogContains(
          state,
          "Runner spends [Click] and pays 0 [Credits] to play Diesel.",
        ),
      ).toBe(true); // Play event, zero cost

      playFromHand(state, "runner", "Sure Gamble");
      expect(
        secondLastLogContains(
          state,
          "Runner spends [Click] and pays 5 [Credits] to play Sure Gamble.",
        ),
      ).toBe(true); // Play event, five cost

      playFromHand(state, "runner", "Clot");
      expect(
        lastLogContains(
          state,
          "Runner spends [Click] and pays 2 [Credits] to install Clot.",
        ),
      ).toBe(true); // Install program, two cost

      playFromHand(state, "runner", "Misdirection");
      expect(
        lastLogContains(
          state,
          "Runner spends [Click] and pays 0 [Credits] to install Misdirection.",
        ),
      ).toBe(true); // Install program, zero cost

      playFromHand(state, "runner", "Career Fair");
      expect(
        lastLogContains(
          state,
          "Runner spends [Click] and pays 0 [Credits] to play Career Fair.",
        ),
      ).toBe(true); // Play Career Fair, zero cost

      clickCard(state, "runner", "Daily Casts");
      expect(
        lastLogContains(
          state,
          "Runner pays 0 [Credits] to use Career Fair to install Daily Casts from the Grip",
        ),
      ).toBe(true); // Choose Daily cast, zero cost install

      playFromHand(state, "runner", "Daily Casts");
      expect(
        lastLogContains(
          state,
          "Runner spends [Click] and pays 3 [Credits] to install Daily Casts.",
        ),
      ).toBe(true); // Install resource, three cost

      runOn(state, "archives");
      expect(
        lastNLogContains(state, 1, "Runner spends [Click] to make a run on Archives."),
      ).toBe(true); // Initiate run, zero cost
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

      expect(getStrength(refresh(state, cor))).toBe(2); // Corroder starts at 2 strength
      autoPump(state, refresh(state, cor));
      clickCard(state, "runner", clo);
      clickPrompt(state, "runner", "Place 1 [Credits] on Net Mercur");

      expect(getStrength(refresh(state, cor))).toBe(5); // Corroder is at 5 strength
      expect(getRunner(state).credit).toBe(cre - 2); // Spent 2 (+1 from Cloak) to pump
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
      expect(getStrength(refresh(state, cor))).toBe(2); // Corroder starts at 2 strength
      autoPumpAndBreak(state, refresh(state, cor));
      expect(getStrength(refresh(state, cor))).toBe(3); // Corroder now at 3 strength
      expect(
        (refresh(state, hive).subroutines ?? []).every(
          (sub: any) => sub.broken,
        ),
      ).toBe(true); // Hive is now fully broken
      expect(
        secondLastLogContains(
          state,
          "Runner pays 6 [Credits] to increase the strength of Corroder to 3 and break all 5 subroutines on Hive.",
        ),
      ).toBe(true); // Should write correct pump & break price to log
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
      expect(getStrength(refresh(state, cor))).toBe(3); // Corroder now at 3 strength
      expect(
        lastLogContains(
          state,
          "Runner pays 1 [Credits] to increase the strength of Corroder to 3.",
        ),
      ).toBe(true); // Should write correct pump price to log
      autoPumpAndBreak(state, refresh(state, cor));
      expect(
        (refresh(state, hive).subroutines ?? []).every(
          (sub: any) => sub.broken,
        ),
      ).toBe(true); // Hive is now fully broken
      expect(
        secondLastLogContains(
          state,
          "Runner pays 5 [Credits] to use Corroder to break all 5 subroutines on Hive.",
        ),
      ).toBe(true); // Should write correct break price to log
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
      expect(getStrength(refresh(state, cor))).toBe(2); // Corroder still at 2 strength
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
      ).toBe(true); // The prompt tells us how many stealth credits we need
      clickCard(state, "runner", mantle1);
      clickCard(state, "runner", mantle2);
      expect(getStrength(refresh(state, hou))).toBe(10); // Houdini is at 10 strength
      autoPumpAndBreak(state, refresh(state, hou));
      expect(
        (refresh(state, engine).subroutines ?? []).every(
          (sub: any) => sub.broken,
        ),
      ).toBe(true); // Engine is now fully broken
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
      expect(getStrength(refresh(state, cor))).toBe(3); // Corroder is now at 3 strength
      cardAbility(state, "runner", refresh(state, cor), 0);
      clickPrompt(state, "runner", "End the run");
      clickPrompt(state, "runner", "Done");

      const unbroken1 = (refresh(state, hive).subroutines ?? []).filter(
        (sub: any) => !sub.broken,
      );
      expect(unbroken1.length).toBe(4); // Only broken 1 sub

      autoPumpAndBreak(state, refresh(state, cor));
      expect(
        (refresh(state, hive).subroutines ?? []).every(
          (sub: any) => sub.broken,
        ),
      ).toBe(true); // Hive is now fully broken
      expect(
        secondLastLogContains(
          state,
          "Runner pays 4 [Credits] to use Corroder to break the remaining 4 subroutines on Hive.",
        ),
      ).toBe(true); // Should write correct price to log
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
      expect(choices.length).toBe(2); // Runner should only get choice of Archives or R&D
      expect(choices).not.toContainEqual("HQ"); // Runner should only get choice of Archives or R&D
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
      expect(getCorp(state).credit).toBe(5); // Expend triggered Hyoubu
    });
  });
});

// Helper imported from test framework
function getPromptMap(state: any, side: string): any {
  return state[side]?.prompt?.[0];
}

function getRunner(state: any): any {
  return state.runner;
}

function getCorp(state: any): any {
  return state.corp;
}

function getIce(state: any, server: string, pos?: number): any {
  const ices = state.corp?.servers?.[server]?.ices ?? [];
  return pos === undefined ? ices : ices[pos];
}

function getContent(state: any, server: string, pos?: number): any {
  const content = state.corp?.servers?.[server]?.content ?? [];
  return pos === undefined ? content : content[pos];
}

function getProgram(state: any, pos?: number): any {
  const programs = state.runner?.rig?.program ?? [];
  return pos === undefined ? programs : programs[pos];
}

function refresh(state: any, card: any): any {
  return core.getCard(state, card);
}

function getStrength(card: any): number {
  return card?.currentStrength ?? card?.strength ?? 0;
}

function lastLogContains(state: any, content: string, side = "public"): boolean {
  const log = (state.log ?? []).filter(
    (entry: any) => entry?.[side] ?? entry?.public,
  );
  const lastEntry = log[log.length - 1]?.text ?? "";
  const escaped = content.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  return new RegExp(escaped).test(lastEntry);
}

function secondLastLogContains(
  state: any,
  content: string,
  side = "public",
): boolean {
  const log = (state.log ?? []).filter(
    (entry: any) => entry?.[side] ?? entry?.public,
  );
  const entry = log[log.length - 2]?.text ?? "";
  const escaped = content.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  return new RegExp(escaped).test(entry);
}

function lastNLogContains(
  state: any,
  n: number,
  content: string,
  side = "public",
): boolean {
  const log = (state.log ?? []).filter(
    (entry: any) => entry?.[side] ?? entry?.public,
  );
  const entry = log[log.length - 1 - n]?.text ?? "";
  const escaped = content.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  return new RegExp(escaped).test(entry);
}

function newGame(config: any, state?: any): any {
  const st = state ?? {};
  // Use the test framework's newGame
  const tf = require("../test_framework/index");
  const result = tf.newGame(config, st);
  return result;
}

function takeCredits(state: any, side: string, n?: number): void {
  core.takeCredits(state, side, n);
}

function playFromHand(
  state: any,
  side: string,
  title: string,
  server?: string,
): boolean {
  return core.playFromHand(state, side, title, server);
}

function runOn(state: any, server: string, args?: any): boolean {
  return core.runOn(state, server, args ?? {});
}

function rez(state: any, side: string, card: any, opts?: any): void {
  core.rez(state, side, card, opts);
}

function runContinue(state: any, phase?: string): void {
  core.runContinue(state, phase);
}

function clickCard(state: any, side: string, card: any): void {
  core.clickCard(state, side, card);
}

function clickPrompt(state: any, side: string, choice: string | number, args?: any): void {
  core.clickPrompt(state, side, choice, args);
}

function autoPump(state: any, card: any): void {
  core.processAction("dynamic-ability", state, "runner", {
    dynamic: "auto-pump",
    card: core.getCard(state, card),
  });
}

function autoPumpAndBreak(state: any, card: any): void {
  core.processAction("dynamic-ability", state, "runner", {
    dynamic: "auto-pump-and-break",
    card: core.getCard(state, card),
  });
}

function cardAbility(
  state: any,
  side: string,
  card: any,
  ability: number | string,
  targets?: any,
): boolean {
  return core.cardAbility(state, side, card, ability, targets);
}

function expend(state: any, side: string, card: any): boolean {
  return core.processAction("expend", state, side, {
    card: core.getCard(state, card),
  });
}

function doGame(fn: (state: any) => void): void {
  const state: any = {};
  fn(state);
}

function qty(card: string, amount: number): string[] {
  return Array.from({ length: amount }, () => card);
}
