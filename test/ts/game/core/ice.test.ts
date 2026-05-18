// Tests for game.core.ice
// Mirrors: test/clj/game/core/ice_test.clj
import { describe, it, expect } from "vitest";
import * as core from "@/game/core";
import {
  doGame,
  newGame,
  qty,
  takeCredits,
  runOn,
  runContinue,
  runContinueUntil,
  clickPrompt,
  getIce,
  getContent,
  getProgram,
  getRunner,
  refresh,
  playFromHand,
  rez,
  cardSideAbility,
  fireSubs,
  changed,
  autoPump,
  autoPumpAndBreak,
  cardAbility,
} from "../test_framework/index";

// ============================================================
// auto-pump-and-break tests
// ============================================================

describe("auto-pump-and-break", () => {
  it("update after ice updates subs", () => {
    doGame((state) => {
      newGame(
        {
          corp: {
            hand: ["Tour Guide", ...qty("PAD Campaign", 2)],
            credits: 10,
          },
          runner: { hand: ["Bukhgalter"] },
        },
        state,
      );
      playFromHand(state, "corp", "PAD Campaign", "New remote");
      playFromHand(state, "corp", "PAD Campaign", "New remote");
      playFromHand(state, "corp", "Tour Guide", "HQ");
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Bukhgalter");

      const p1 = getContent(state, "remote1", 0);
      const p2 = getContent(state, "remote2", 0);
      const tg = getIce(state, "hq", 0);
      const buk = getProgram(state, 0);

      rez(state, "corp", p1);
      rez(state, "corp", tg);
      expect((refresh(state, tg).subroutines ?? []).length).toBe(1);

      runOn(state, "hq");
      expect(
        (refresh(state, buk).abilities ?? []).slice(-1)[0]?.label,
      ).toBe("Add 1 strength"); // Not encountered an ice yet

      rez(state, "corp", p2);
      runContinue(state);
      expect(
        (refresh(state, buk).abilities ?? []).slice(-1)[0]?.label,
      ).toBe("Fully break Tour Guide");
      expect((refresh(state, tg).subroutines ?? []).length).toBe(2);
    });
  });

  it("Also works on second encounter", () => {
    doGame((state) => {
      newGame(
        {
          corp: {
            hand: ["Tour Guide", ...qty("PAD Campaign", 2)],
            credits: 10,
          },
          runner: { hand: ["Bukhgalter"] },
        },
        state,
      );
      playFromHand(state, "corp", "PAD Campaign", "New remote");
      playFromHand(state, "corp", "Tour Guide", "HQ");
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Bukhgalter");

      const p1 = getContent(state, "remote1", 0);
      const tg = getIce(state, "hq", 0);
      const buk = getProgram(state, 0);

      rez(state, "corp", p1);
      rez(state, "corp", tg);
      runOn(state, "hq");
      runContinue(state);
      expect(
        (refresh(state, buk).abilities ?? []).slice(-1)[0]?.label,
      ).toBe("Fully break Tour Guide");

      fireSubs(state, tg);
      takeCredits(state, "runner");
      takeCredits(state, "corp");

      runOn(state, "hq");
      runContinue(state);
      expect(
        (refresh(state, buk).abilities ?? []).slice(-1)[0]?.label,
      ).toBe("Fully break Tour Guide");
    });
  });

  it("Breaking restrictions on auto-pump-and-break - No auto pumping if (:breakable sub) does not return :unrestricted", () => {
    doGame((state) => {
      newGame(
        {
          corp: { hand: ["Afshar"] },
          runner: { hand: ["Gordian Blade"], credits: 10 },
        },
        state,
      );
      playFromHand(state, "corp", "Afshar", "HQ");
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Gordian Blade");
      runOn(state, "hq");

      const afshar = getIce(state, "hq", 0);
      const gord = getProgram(state, 0);

      rez(state, "corp", afshar);
      runContinue(state);
      expect(
        (refresh(state, gord).abilities ?? [])
          .filter((a: any) => a.dynamic === "auto-pump-and-break")
          .length === 0,
      ).toBe(true); // No auto break dynamic ability
    });
  });

  it("Breaking restrictions on auto-pump-and-break - Auto pumping if (:breakable sub) returns :unrestricted", () => {
    doGame((state) => {
      newGame(
        {
          corp: { hand: ["Afshar"] },
          runner: { hand: ["Gordian Blade"], credits: 10 },
        },
        state,
      );
      playFromHand(state, "corp", "Afshar", "R&D");
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Gordian Blade");
      runOn(state, "rd");

      const afshar = getIce(state, "rd", 0);
      const gord = getProgram(state, 0);

      rez(state, "corp", afshar);
      runContinue(state);
      expect(
        (refresh(state, gord).abilities ?? [])
          .filter((a: any) => a.dynamic === "auto-pump-and-break")
          .length > 0,
      ).toBe(true); // Autobreak is active

      autoPumpAndBreak(state, refresh(state, gord));
      expect(
        (refresh(state, afshar).subroutines ?? []).every(
          (sub: any) => sub.broken,
        ),
      ).toBe(true); // All subroutines broken
    });
  });

  it("Auto break handles pump abilities with variable strength", () => {
    doGame((state) => {
      newGame(
        {
          corp: {
            deck: qty("Hedge Fund", 5),
            hand: ["DNA Tracker"],
            credits: 20,
          },
          runner: { deck: qty("Unity", 3), credits: 20 },
        },
        state,
      );
      playFromHand(state, "corp", "DNA Tracker", "HQ");
      rez(state, "corp", getIce(state, "hq", 0));
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Unity");
      playFromHand(state, "runner", "Unity");
      playFromHand(state, "runner", "Unity");

      const unity = getProgram(state, 0);
      const ice = getIce(state, "hq", 0);

      runOn(state, "hq");
      runContinue(state);
      expect(
        (refresh(state, unity).abilities ?? [])[2]?.costLabel,
      ).toBe("5 [Credits]"); // Auto Break label lists cost as 5 credits

      expect(
        changed(
          () => getRunner(state).credit,
          -5,
          () => autoPumpAndBreak(state, refresh(state, unity)),
        ),
      ).toBe(true); // Auto break costs 5

      expect(refresh(state, unity).currentStrength).toBe(7); // Unity's strength is 7 after pumping twice
      expect(
        (refresh(state, ice).subroutines ?? []).filter(
          (sub: any) => !sub.broken,
        ).length === 0,
      ).toBe(true); // All subroutines have been broken
    });
  });

  it("Auto break handles break abilities with variable cost", () => {
    doGame((state) => {
      newGame(
        {
          runner: { hand: [...qty("Marjanah", 2)], credits: 20 },
          corp: { deck: qty("Hedge Fund", 5), hand: ["Ice Wall"], credits: 20 },
        },
        state,
      );
      playFromHand(state, "corp", "Ice Wall", "HQ");
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Marjanah");
      runOn(state, "hq");
      rez(state, "corp", getIce(state, "hq", 0));
      runContinue(state, "encounter-ice");

      const marjanah = getProgram(state, 0);

      expect(
        (refresh(state, marjanah).abilities ?? [])[2]?.costLabel,
      ).toBe("2 [Credits]"); // Auto Break label lists cost as 2 credits
      expect(
        changed(
          () => getRunner(state).credit,
          -2,
          () => cardAbility(state, "runner", refresh(state, marjanah), 2),
        ),
      ).toBe(true); // Break costs 2

      runContinue(state, "movement");
      runContinue(state);
      runOn(state, "hq");
      runContinue(state, "encounter-ice");
      expect(
        (refresh(state, marjanah).abilities ?? [])[2]?.costLabel,
      ).toBe("1 [Credits]"); // Auto Break label lists cost as 1 credit
      expect(
        changed(
          () => getRunner(state).credit,
          -1,
          () => cardAbility(state, "runner", refresh(state, marjanah), 2),
        ),
      ).toBe(true); // Break costs 1 after run
    });
  });

  it("Basic auto pump test", () => {
    doGame((state) => {
      newGame(
        {
          runner: { hand: ["Corroder"], credits: 20 },
          corp: { deck: qty("Hedge Fund", 5), hand: ["Fire Wall"], credits: 20 },
        },
        state,
      );
      playFromHand(state, "corp", "Fire Wall", "HQ");
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Corroder");
      runOn(state, "hq");
      rez(state, "corp", getIce(state, "hq", 0));
      runContinue(state, "encounter-ice");

      const corroder = getProgram(state, 0);
      const fireWall = getIce(state, "hq", 0);

      expect(
        (refresh(state, corroder).abilities ?? [])
          .filter((a: any) => a.dynamic === "auto-pump")
          .length > 0,
      ).toBe(true); // Auto pump is active
      expect(
        (refresh(state, corroder).abilities ?? [])[3]?.costLabel,
      ).toBe("3 [Credits]"); // Auto pump label lists cost as 3 credits
      expect(
        changed(
          () => getRunner(state).credit,
          -3,
          () => autoPump(state, refresh(state, corroder)),
        ),
      ).toBe(true); // Pump costs 3
      expect(refresh(state, corroder).currentStrength).toBe(5); // Breaker strength equals ice strength
      expect(
        (refresh(state, fireWall).subroutines ?? []).some(
          (sub: any) => sub.broken,
        ),
      ).toBe(false); // No subroutines have been broken
      expect(
        (refresh(state, corroder).abilities ?? [])
          .filter((a: any) => a.dynamic === "auto-pump")
          .length === 0,
      ).toBe(true); // No auto pump ability since breaker is at strength
    });
  });

  it("Auto pump handles pump abilities with variable strength", () => {
    doGame((state) => {
      newGame(
        {
          corp: {
            deck: qty("Hedge Fund", 5),
            hand: ["DNA Tracker"],
            credits: 20,
          },
          runner: { deck: qty("Unity", 3), credits: 20 },
        },
        state,
      );
      playFromHand(state, "corp", "DNA Tracker", "HQ");
      rez(state, "corp", getIce(state, "hq", 0));
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Unity");
      playFromHand(state, "runner", "Unity");
      playFromHand(state, "runner", "Unity");

      const unity = getProgram(state, 0);

      runOn(state, "hq");
      runContinue(state);
      expect(
        (refresh(state, unity).abilities ?? [])[3]?.costLabel,
      ).toBe("2 [Credits]"); // Auto Break label lists cost as 2 credits
      expect(
        changed(
          () => getRunner(state).credit,
          -2,
          () => autoPump(state, refresh(state, unity)),
        ),
      ).toBe(true); // Auto pump costs 2
      expect(refresh(state, unity).currentStrength).toBe(7); // Unity's strength is 7 after pumping twice
    });
  });

  it("Auto pump available even with no active break ability", () => {
    doGame((state) => {
      newGame(
        {
          corp: {
            deck: qty("Hedge Fund", 5),
            hand: ["DNA Tracker", "Enigma"],
            credits: 20,
          },
          runner: { deck: ["Utae"], credits: 20 },
        },
        state,
      );
      playFromHand(state, "corp", "DNA Tracker", "HQ");
      playFromHand(state, "corp", "Enigma", "HQ");
      rez(state, "corp", getIce(state, "hq", 0));
      rez(state, "corp", getIce(state, "hq", 1));
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Utae");

      const utae = getProgram(state, 0);

      runOn(state, "hq");
      runContinue(state);
      autoPumpAndBreak(state, refresh(state, utae));
      runContinueUntil(state, "encounter-ice");

      expect(
        (refresh(state, utae).abilities ?? [])
          .filter((a: any) => a.dynamic === "auto-pump")
          .length > 0,
      ).toBe(true); // Auto pump is active
      expect(
        (refresh(state, utae).abilities ?? [])
          .filter((a: any) => a.dynamic === "auto-pump-and-break")
          .length === 0,
      ).toBe(true); // No auto break dynamic ability
    });
  });
});

// ============================================================
// bioroid break abilities tests
// ============================================================

describe("bioroid-break-abilities", () => {
  it("The click-to-break abilities on bioroids shouldn't create an undo-click", () => {
    doGame((state) => {
      newGame(
        {
          corp: { deck: qty("Hedge Fund", 5), hand: ["Eli 1.0"] },
        },
        state,
      );
      playFromHand(state, "corp", "Eli 1.0", "HQ");
      takeCredits(state, "corp");
      runOn(state, "hq");
      rez(state, "corp", getIce(state, "hq", 0));
      runContinue(state);

      const undoClick = (state as any).clickState;
      const clicks = getRunner(state).click;

      cardSideAbility(state, "runner", getIce(state, "hq", 0), 0);
      clickPrompt(state, "runner", "End the run");

      expect(getRunner(state).click).toBe(clicks - 1); // Runner has spent 1 click on the bioroid-break ability

      core.commandUndoClick(state, "runner");
      expect(getRunner(state).click).toBe(clicks + 1); // Runner regains clicks spent on break ability and run
      expect(state.run).toBeUndefined(); // Undoing a click resets to before the run began
    });
  });
});


