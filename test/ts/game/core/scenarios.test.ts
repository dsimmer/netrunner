// Tests for game.core.scenarios
// Mirrors: test/clj/game/core/scenarios_test.clj
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
  clickPrompts,
  clickCard,
  getIce,
  getContent,
  getProgram,
  getRunner,
  getCorp,
  refresh,
  playFromHand,
  rez,
  cardAbility,
  fireSubs,
  changed,
  autoPumpAndBreak,
  findCard,
  selectBadPub,
  stackDeck,
  endTurn,
  startTurn,
  clickDraw,
  clickCredit,
  clickAdvance,
  score,
  endPhase12,
  trash,
  doTrashPrompt,
  isHand,
  countTags,
  removeTag,
  getResource,
  getCounters,
  noPrompt,
  lastLogContains,
  secondLastLogContains,
  gain,
  move,
  trashResource,
  draw,
} from "../test_framework/index";

// ============================================================
// Bad Publicity with Shift Key
// ============================================================

describe("bad-publicity-with-shift-key", () => {
  it("3 pub + 2cr", () => {
    doGame((state) => {
      newGame(state, 
        {
          corp: {
            hand: ["Scatter Field"],
            badPub: 3,
          },
          runner: { hand: ["Unity"], credits: 10 },
        },
      );
      // play-cards state :corp ["Scatter Field" "HQ" :rezzed]
      playFromHand(state, "corp", "Scatter Field", "HQ");
      rez(state, "corp", getIce(state, "hq", 0));
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Unity");
      runOn(state, "hq");
      runContinueUntil(state, "encounter-ice");
      autoPumpAndBreak(state, getProgram(state, 0));
      expect(
        changed(
          () => getRunner(state).credit,
          -2,
          () => selectBadPub(state, true),
        ),
      ).toBe(true); // 3 pub + 2cr
    });
  });
});

// ============================================================
// Tread Lightly / Vovô Ozetti combinations
// ============================================================

describe("tread-lightly-vovo-combine", () => {
  it("Tread Lightly + Vovô Ozetti combine well", () => {
    doGame((state) => {
      newGame(state, 
        {
          corp: { hand: ["Tithe", "Vovô Ozetti"] },
          runner: { hand: ["Tread Lightly"] },
        },
      );
      playFromHand(state, "corp", "Tithe", "HQ");
      playFromHand(state, "corp", "Vovô Ozetti", "HQ");
      rez(state, "corp", getContent(state, "hq", 0));
      takeCredits(state, "corp");
      clickPrompt(state, "corp", "No");
      playFromHand(state, "runner", "Tread Lightly");
      clickPrompt(state, "runner", "HQ");
      expect(
        changed(
          () => getCorp(state).credit,
          -2,
          () => rez(state, "corp", getIce(state, "hq", 0)),
        ),
      ).toBe(true); // Spent 2 credits to rez tithe: (1 - 2 + 3) :: 2
    });
  });

  it("Hernando Cortez + Vovô Ozetti combine not well", () => {
    doGame((state) => {
      newGame(state, 
        {
          corp: { hand: ["Tithe", "Vovô Ozetti"], credits: 20 },
          runner: { hand: ["Hernando Cortez"] },
        },
      );
      playFromHand(state, "corp", "Tithe", "HQ");
      playFromHand(state, "corp", "Vovô Ozetti", "HQ");
      rez(state, "corp", getContent(state, "hq", 0));
      takeCredits(state, "corp");
      clickPrompt(state, "corp", "No");
      playFromHand(state, "runner", "Hernando Cortez");
      runOn(state, "hq");
      expect(
        changed(
          () => getCorp(state).credit,
          -2,
          () => rez(state, "corp", getIce(state, "hq", 0)),
        ),
      ).toBe(true); // Spent 2 credits to rez tithe: (1 - 2 :: 0) + 2 :: 2
    });
  });
});

// ============================================================
// Masterwork / Overinstall / Boomerang complex cases
// ============================================================

describe("masterwork-overinstall-boomerang-complex-case", () => {
  it("for issue #7303 - order 0", () => {
    testMasterworkBoomerangComplex(state => {
      // order 0: click Boomerang first, then Tree Line, then Easy Mark
      clickPrompt(state, "runner", "Boomerang");
      clickCard(state, "runner", "Tree Line");
      clickCard(state, "runner", findCard("Easy Mark", (getRunner(state) as any).setAside));
    });
  });

  it("for issue #7303 - order 1", () => {
    testMasterworkBoomerangComplex(state => {
      // order 1: click Masterwork first, then Easy Mark, then Tree Line
      clickPrompt(state, "runner", "Masterwork (v37)");
      clickCard(state, "runner", findCard("Easy Mark", (getRunner(state) as any).setAside));
      clickCard(state, "runner", "Tree Line");
    });
  });

  function testMasterworkBoomerangComplex(
    resolveFn: (state: any) => void,
  ) {
    doGame((state) => {
      newGame(state, 
        {
          corp: {
            hand: ["Tree Line", "Winchester", "Surveyor"],
            id: "Weyland Consortium: Building a Better World",
            credits: 20,
          },
          runner: {
            hand: ["The Class Act", "Masterwork (v37)", ...qty("Boomerang", 2)],
            id: "Zahya Sadeghi: Versatile Smuggler",
            credits: 20,
            deck: [...qty("Easy Mark", 10)],
          },
        },
      );
      playFromHand(state, "corp", "Tree Line", "R&D");
      playFromHand(state, "corp", "Winchester", "HQ");
      playFromHand(state, "corp", "Surveyor", "HQ");
      rez(state, "corp", getIce(state, "hq", 0));
      rez(state, "corp", getIce(state, "rd", 0));
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Masterwork (v37)");
      playFromHand(state, "runner", "Boomerang");
      clickCard(state, "runner", "Surveyor");
      playFromHand(state, "runner", "The Class Act");
      takeCredits(state, "runner");
      takeCredits(state, "corp");
      runOn(state, "R&D");
      clickPrompt(state, "runner", "Yes");
      clickCard(state, "runner", findCard("Boomerang", (getRunner(state) as any).hand));
      resolveFn(state);
      expect(noPrompt(state, "corp")).toBe(true); // No lingering prompt
      expect(noPrompt(state, "runner")).toBe(true); // No lingering prompt
      expect((getRunner(state) as any).discard?.length ?? 0).toBe(1);
    });
  }

  it("for issue #7662 - full game", () => {
    doGame((state) => {
      newGame(state, 
        {
          corp: {
            hand: [
              ...qty("Tree Line", 2),
              "Rashida Jaheem",
              "Artificial Cryptocrash",
              "Magnet",
              "Subliminal Messaging",
            ],
            deck: [
              "Subliminal Messaging",
              "Business As Usual",
              "Mestnichestvo",
              "Tomorrow's Headline",
              "Tree Line",
              "Ubiquitous Vig",
              "Rashida Jaheem",
              ...qty("Logjam", 3),
              ...qty("Offworld Office", 3),
              ...qty("NGO Front", 2),
              "Artificial Cryptocrash",
              ...qty("Federal Fundraising", 2),
              "Spin Doctor",
              ...qty("Vladisibirsk City Grid", 2),
              "Hedge Fund",
            ],
            identity: "Pravdivost Consulting: Political Solutions",
          },
          runner: {
            hand: [
              "Paladin Poemu",
              "The Twinning",
              "Dr. Nuka Vrolyck",
              "Dirty Laundry",
              "Jailbreak",
            ],
            deck: [
              ...qty("Pinhole Threading", 2),
              ...qty("Cezve", 2),
              "Dirty Laundry",
              ...qty("Miss Bones", 2),
              ...qty("The Class Act", 2),
              "Carmen",
              ...qty("Boomerang", 2),
              "Diversion of Funds",
              "Inside Job",
              ...qty("Bravado", 2),
              "Aumakua",
              ...qty("Sure Gamble", 2),
              "Hermes",
              "Mutual Favor",
              "WAKE Implant v2A-JRJ",
            ],
            identity: "Zahya Sadeghi: Versatile Smuggler",
          },
        },
      );

      // Corp Turn 1
      playFromHand(state, "corp", "Subliminal Messaging");
      playFromHand(state, "corp", "Rashida Jaheem", "New remote");
      playFromHand(state, "corp", "Tree Line", "HQ");
      stackDeck(state, "corp", [
        "Subliminal Messaging", "Business As Usual", "Mestnichestvo",
        "Artificial Cryptocrash", "Hedge Fund", "Tomorrow's Headline",
        "Logjam", "NGO Front", "Federal Fundraising", "Logjam", "Offworld Office",
        "Rashida Jaheem", "Offworld Office", "Vladisibirsk City Grid",
        "Vladisibirsk City Grid", "Spin Doctor", "Federal Fundraising",
        "Offworld Office", "Tree Line",
        "NGO Front", "Ubiquitous Vig",
      ]);
      clickCredit(state, "corp");
      // Hand is: Magnet, Tree Line, Cryptocrash
      isHand(state, "corp", ["Tree Line", "Artificial Cryptocrash", "Magnet"]);
      expect(getCorp(state).credit).toBe(7); // Corp Turn 1: 3 in hand, 7 credits
      endTurn(state, "corp");
      startTurn(state, "runner");

      // Runner Turn 1
      stackDeck(state, "runner", [
        "Pinhole Threading", "Dirty Laundry", "Cezve", "Miss Bones", "Miss Bones",
        "The Class Act", "Carmen", "The Class Act", "Pinhole Threading",
        "Boomerang", "Diversion of Funds", "Inside Job", "Bravado",
        "Aumakua", "Mutual Favor", "Sure Gamble", "Bravado", "Cezve",
        "WAKE Implant v2A-JRJ", "Boomerang", "Hermes", "Sure Gamble",
      ]);
      playFromHand(state, "runner", "Jailbreak");
      clickPrompt(state, "runner", "R&D");
      runContinueUntil(state, "success");
      clickCard(state, "corp", getIce(state, "hq", 0));
      clickPrompt(state, "runner", "No action");
      clickPrompt(state, "runner", "No action");
      clickPrompt(state, "runner", "Yes");
      runOn(state, "remote1");
      runContinue(state);
      clickPrompt(state, "runner", "Yes"); // do-trash-prompt 1
      doTrashPrompt(state, 1);
      playFromHand(state, "runner", "Paladin Poemu");
      playFromHand(state, "runner", "Dr. Nuka Vrolyck");
      // Hand is: The Twinning, Dirty Laundry, Pinhole Threading
      isHand(state, "runner", ["The Twinning", "Dirty Laundry", "Pinhole Threading"]);
      expect(getRunner(state).credit).toBe(4); // Runner Turn 1: 3 in hand, 4 credits
      endTurn(state, "runner");

      // Corp Turn 2
      startTurn(state, "corp");
      clickDraw(state, "corp");
      playFromHand(state, "corp", "Subliminal Messaging");
      clickDraw(state, "corp");
      playFromHand(state, "corp", "Tree Line", "R&D");
      // Hand is: Artificial Cryptocrash, Magnet, Business As Usual, Mestnichestvo
      isHand(state, "corp", [
        "Artificial Cryptocrash", "Magnet", "Business As Usual", "Mestnichestvo",
      ]);
      expect(getCorp(state).credit).toBe(8); // Corp Turn 2: 4 in hand, 8 credits
      endTurn(state, "corp");

      // Runner Turn 2
      startTurn(state, "runner");
      cardAbility(state, "runner", getResource(state, 1), 0);
      playFromHand(state, "runner", "Dirty Laundry");
      clickPrompt(state, "runner", "Archives");
      runContinue(state);
      runContinue(state);
      clickCard(state, "corp", getIce(state, "rd", 0));
      playFromHand(state, "runner", "The Twinning");
      clickPrompt(state, "runner", "Done");
      playFromHand(state, "runner", "Cezve");
      clickCard(state, "runner", "Paladin Poemu");
      // Hand is: Dirty Laundry, Pinhole Threading, Miss Bones
      isHand(state, "runner", ["Dirty Laundry", "Pinhole Threading", "Miss Bones"]);
      expect(getRunner(state).credit).toBe(3); // Runner Turn 2: 3 in hand, 3 credits
      endTurn(state, "runner");

      // Corp Turn 3
      startTurn(state, "corp");
      clickDraw(state, "corp");
      playFromHand(state, "corp", "Hedge Fund");
      playFromHand(state, "corp", "Mestnichestvo", "New remote");
      endTurn(state, "corp");
      // Hand is: 2x Cryptocrash, Magnet, Business - 12 creds
      isHand(state, "corp", [
        "Artificial Cryptocrash", "Artificial Cryptocrash",
        "Magnet", "Business As Usual",
      ]);
      expect(getCorp(state).credit).toBe(12); // Corp Turn 3: 12 creds

      // Runner Turn 3
      startTurn(state, "runner");
      cardAbility(state, "runner", getResource(state, 1), 0);
      playFromHand(state, "runner", "Dirty Laundry");
      clickPrompt(state, "runner", "Archives");
      runContinue(state);
      runContinue(state);
      clickCard(state, "corp", "Mestnichestvo");
      playFromHand(state, "runner", "The Class Act");
      clickCredit(state, "runner");
      endTurn(state, "runner");
      // Hand is: 2x pinhole, 2x bones, carmen, class act, boomerang, diversion - 3 creds
      expect(getRunner(state).credit).toBe(3); // Runner Turn 3: 3 creds
      isHand(state, "runner", [
        "Pinhole Threading", "Pinhole Threading", "Carmen",
        "Miss Bones", "Miss Bones", "The Class Act", "Boomerang",
        "Diversion of Funds",
      ]);

      // Corp Turn 4
      startTurn(state, "corp");
      playFromHand(state, "corp", "Tomorrow's Headline", "Server 2");
      clickCredit(state, "corp");
      clickCredit(state, "corp");
      isHand(state, "corp", [
        "Artificial Cryptocrash", "Artificial Cryptocrash",
        "Magnet", "Business As Usual",
      ]);
      expect(getCorp(state).credit).toBe(14); // Corp Turn 4: 14 creds
      endTurn(state, "corp");

      // Runner Turn 4
      startTurn(state, "runner");
      playFromHand(state, "runner", "Boomerang");
      clickCard(state, "runner", "Paladin Poemu");
      clickCard(state, "runner", "Paladin Poemu");
      clickCard(state, "runner", getIce(state, "hq", 0));
      playFromHand(state, "runner", "Diversion of Funds");
      runContinueUntil(state, "success");
      clickCard(state, "corp", "Tomorrow's Headline");
      clickPrompt(state, "runner", "Diversion of Funds");
      runOn(state, "hq");
      // move state :corp (find-card "Artificial Cryptocrash" (:hand (get-corp))) :discard
      const crypInHand = findCard("Artificial Cryptocrash", (getCorp(state) as any).hand);
      if (crypInHand) {
        move(state, "corp", crypInHand, "discard");
      }
      runContinueUntil(state, "success");
      clickPrompt(state, "runner", "2");
      for (let i = 0; i < 3; i++) {
        const buttons = (state as any).runner?.prompt?.[0]?.choices ?? [];
        const buttonTitles = buttons.map((b: any) => b?.value?.title ?? b?.value ?? b);
        if (buttonTitles.includes("No action")) {
          clickPrompt(state, "runner", "No action");
        } else {
          clickPrompt(state, "runner", "Steal");
        }
      }
      clickPrompt(state, "runner", "Yes");
      // move state :corp (find-card "Artificial Cryptocrash" (:discard (get-corp))) :hand
      const crypInDiscard = findCard("Artificial Cryptocrash", (getCorp(state) as any).discard);
      if (crypInDiscard) {
        move(state, "corp", crypInDiscard, "hand");
      }
      endTurn(state, "runner");
      clickCard(state, "runner", findCard("Miss Bones", (getRunner(state) as any).hand));
      expect(getRunner(state).credit).toBe(10); // Runner Turn 4: 10 creds
      isHand(state, "runner", [
        "Pinhole Threading", "Pinhole Threading", "Carmen",
        "Miss Bones", "The Class Act",
      ]);

      // Corp Turn 5
      startTurn(state, "corp");
      trash(state, "corp", getIce(state, "hq", 0));
      playFromHand(state, "corp", "Magnet", "HQ");
      for (let i = 0; i < 2; i++) {
        clickAdvance(state, "corp", getContent(state, "remote2", 0));
      }
      score(state, "corp", getContent(state, "remote2", 0));
      endTurn(state, "corp");
      expect(getCorp(state).credit).toBe(7); // Corp Turn 5: 7 creds
      isHand(state, "corp", ["Business As Usual", "Artificial Cryptocrash", "Logjam"]);

      // Runner Turn 5
      startTurn(state, "runner");
      clickDraw(state, "runner");
      clickCard(state, "runner", findCard("Bravado", (getRunner(state) as any).setAside));
      removeTag(state, "runner");
      playFromHand(state, "runner", "Carmen");
      for (let i = 0; i < 2; i++) {
        clickCard(state, "runner", "Paladin Poemu");
      }
      playFromHand(state, "runner", "The Class Act");
      endTurn(state, "runner");
      expect(getRunner(state).credit).toBe(1); // Runner Turn 5: 1 cred
      isHand(state, "runner", [
        "Pinhole Threading", "Pinhole Threading", "Miss Bones",
        "Inside Job", "Aumakua", "Mutual Favor", "Sure Gamble",
        "Bravado",
      ]);

      // Corp Turn 6
      startTurn(state, "corp");
      clickPrompt(state, "corp", "Yes");
      clickPrompt(state, "corp", "Yes");
      playFromHand(state, "corp", "Subliminal Messaging");
      playFromHand(state, "corp", "Artificial Cryptocrash", "Server 2");
      playFromHand(state, "corp", "NGO Front", "New remote");
      playFromHand(state, "corp", "Business As Usual");
      clickPrompt(state, "corp", "Place 1 advancement counter on up to two cards you can advance");
      clickCard(state, "corp", getContent(state, "remote2", 0));
      clickCard(state, "corp", getContent(state, "remote3", 0));
      endTurn(state, "corp");
      expect(getCorp(state).credit).toBe(8); // Corp Turn 6: 8 creds
      isHand(state, "corp", ["Logjam", "Subliminal Messaging"]);

      // Runner Turn 6
      startTurn(state, "runner");
      clickCredit(state, "runner");
      clickCredit(state, "runner");
      playFromHand(state, "runner", "Bravado");
      clickPrompt(state, "runner", "Server 2");
      runContinue(state);
      rez(state, "corp", getIce(state, "remote2", 0));
      runContinue(state, "encounter-ice");
      clickPrompt(state, "corp", "No");
      fireSubs(state, getIce(state, "remote2", 0));
      playFromHand(state, "runner", "Pinhole Threading");
      clickPrompt(state, "runner", "Archives");
      runContinue(state);
      runContinue(state);
      clickCard(state, "corp", getContent(state, "remote2", 0));
      clickCard(state, "runner", getContent(state, "remote3", 0));
      clickPrompt(state, "runner", "Yes"); // do-trash-prompt
      doTrashPrompt(state, 1);
      clickCard(state, "runner", getProgram(state, 0));
      endTurn(state, "runner");
      clickCard(state, "runner", findCard("Miss Bones", (getRunner(state) as any).hand));
      expect(getRunner(state).credit).toBe(5); // Runner Turn 6: 5 creds
      isHand(state, "runner", [
        "Pinhole Threading", "Inside Job", "Aumakua", "Mutual Favor",
        "Sure Gamble",
      ]);

      // Corp Turn 7
      startTurn(state, "corp");
      for (let i = 0; i < 2; i++) {
        clickAdvance(state, "corp", getContent(state, "remote2", 0));
      }
      score(state, "corp", getContent(state, "remote2", 0));
      playFromHand(state, "corp", "Subliminal Messaging");
      playFromHand(state, "corp", "Federal Fundraising", "New remote");
      endTurn(state, "corp");
      expect(getCorp(state).credit).toBe(2); // Corp Turn 7: 2 creds
      isHand(state, "corp", ["Logjam"]);

      // Runner Turn 7
      startTurn(state, "runner");
      for (let i = 0; i < 2; i++) {
        clickCredit(state, "runner");
      }
      runOn(state, "archives");
      runContinue(state, "success");
      clickCard(state, "corp", getIce(state, "rd", 0));
      clickCredit(state, "runner");
      expect(getRunner(state).credit).toBe(3); // Runner Turn 7: 3 creds
      isHand(state, "runner", [
        "Pinhole Threading", "Inside Job", "Aumakua", "Mutual Favor",
        "Sure Gamble",
      ]);
      endTurn(state, "runner");

      // Corp Turn 8 (labeled Corp Turn 7 in original)
      rez(state, "corp", getContent(state, "remote4", 0));
      startTurn(state, "corp");
      endPhase12(state, "corp");
      clickPrompt(state, "corp", "Yes");
      clickPrompt(state, "corp", "Logjam");
      clickPrompt(state, "corp", "Rashida Jaheem");
      clickPrompt(state, "corp", "Offworld Office");
      clickPrompt(state, "corp", "Done");
      clickPrompt(state, "corp", "Yes");
      playFromHand(state, "corp", "Offworld Office", "Server 2");
      playFromHand(state, "corp", "Rashida Jaheem", "New remote");
      clickCredit(state, "corp");
      endTurn(state, "corp");
      expect(getCorp(state).credit).toBe(3); // Corp Turn 8: 3 creds
      isHand(state, "corp", ["Logjam"]);

      // Runner Turn 8
      startTurn(state, "runner");
      for (let i = 0; i < 2; i++) {
        clickCredit(state, "runner");
      }
      playFromHand(state, "runner", "Sure Gamble");
      playFromHand(state, "runner", "Aumakua");
      for (let i = 0; i < 3; i++) {
        clickCard(state, "runner", "Paladin Poemu");
      }
      expect(getRunner(state).credit).toBe(9); // Runner Turn 8: 9 creds
      isHand(state, "runner", ["Pinhole Threading", "Inside Job", "Mutual Favor"]);
      endTurn(state, "runner");

      // Corp Turn 9
      rez(state, "corp", getContent(state, "remote5", 0));
      startTurn(state, "corp");
      clickPrompt(state, "corp", "Yes");
      clickPrompt(state, "corp", "Yes");
      endPhase12(state, "corp");
      clickPrompt(state, "corp", "Rashida Jaheem");
      clickPrompt(state, "corp", "Yes");
      isHand(state, "corp", [
        "Logjam", "Logjam",
        "Subliminal Messaging", "Subliminal Messaging",
        "Offworld Office", "Vladisibirsk City Grid",
      ]);
      clickPrompt(state, "corp", "Yes");
      clickPrompt(state, "corp", "Federal Fundraising");
      clickPrompt(state, "corp", "Vladisibirsk City Grid");
      clickPrompt(state, "corp", "Spin Doctor");
      clickPrompt(state, "corp", "Done");
      clickPrompt(state, "corp", "Yes");
      playFromHand(state, "corp", "Spin Doctor", "New remote");
      playFromHand(state, "corp", "Vladisibirsk City Grid", "Server 2");
      playFromHand(state, "corp", "Subliminal Messaging");
      playFromHand(state, "corp", "Vladisibirsk City Grid", "Server 4");
      endTurn(state, "corp");
      expect(getCorp(state).credit).toBe(7); // Corp Turn 9: 7 creds
      isHand(state, "corp", ["Logjam", "Logjam", "Subliminal Messaging", "Offworld Office"]);

      // Runner Turn 9
      startTurn(state, "runner");
      clickDraw(state, "runner");
      clickCard(state, "runner", "WAKE Implant v2A-JRJ");
      playFromHand(state, "runner", "Inside Job");
      clickPrompt(state, "runner", "Server 2");
      runContinueUntil(state, "success");
      clickCard(state, "corp", getContent(state, "remote4", 1));
      clickCard(state, "runner", getContent(state, "remote2", 1));
      clickPrompt(state, "runner", "Yes"); // do-trash-prompt
      doTrashPrompt(state, 4);
      clickPrompt(state, "runner", "Steal");
      clickDraw(state, "runner");
      playFromHand(state, "runner", "Cezve");
      for (let i = 0; i < 2; i++) {
        clickCard(state, "runner", "Paladin Poemu");
      }
      endTurn(state, "runner");
      expect(getRunner(state).credit).toBe(3); // Runner Turn 9: 3 creds
      isHand(state, "runner", ["Pinhole Threading", "Boomerang", "Mutual Favor"]);

      // Corp Turn 10
      rez(state, "corp", getContent(state, "remote6", 0));
      startTurn(state, "corp");
      endPhase12(state, "corp");
      clickPrompt(state, "corp", "Yes");
      clickPrompt(state, "corp", "Ubiquitous Vig");
      clickPrompt(state, "corp", "NGO Front");
      clickPrompt(state, "corp", "Tree Line");
      clickPrompt(state, "corp", "Done");
      clickPrompt(state, "corp", "No");
      playFromHand(state, "corp", "Tree Line", "Server 4");
      playFromHand(state, "corp", "Subliminal Messaging");
      playFromHand(state, "corp", "Offworld Office", "Server 2");
      playFromHand(state, "corp", "Logjam", "Archives");
      endTurn(state, "corp");
      expect(getCorp(state).credit).toBe(8); // Corp Turn 10: 8 creds
      isHand(state, "corp", ["Logjam", "Offworld Office", "Federal Fundraising"]);

      // Runner Turn 10
      startTurn(state, "runner");
      clickDraw(state, "runner");
      clickCard(state, "runner", "Hermes");
      playFromHand(state, "runner", "Boomerang");
      // Here is where the bug occurs - if this doesn't throw an error, we're good
      clickCard(state, "runner", "Paladin Poemu");
      clickCard(state, "runner", getIce(state, "remote2", 0));
    });
  });
});

// ============================================================
// MaxX / Aniccam / Buffer Drive
// ============================================================

describe("maxx-anniccam-buffer-drive-one-card-in-stack", () => {
  it("for issue #4966", () => {
    doGame((state) => {
      newGame(state, 
        {
          runner: {
            hand: ["Labor Rights", "Buffer Drive", "Aniccam"],
            discard: ["Hacktivist Meeting", "Sure Gamble"],
            credits: 10,
            id: "MaxX: Maximum Punk Rock",
          },
        },
      );
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Buffer Drive");
      playFromHand(state, "runner", "Aniccam");
      playFromHand(state, "runner", "Labor Rights");
      clickCard(state, "runner", "Hacktivist Meeting");
      clickCard(state, "runner", "Sure Gamble");
      takeCredits(state, "runner");
      const runner = getRunner(state);
      const inHand = runner.hand?.[0]?.title ?? "";
      const inDeck = runner.deck?.[0]?.title ?? "";
      takeCredits(state, "corp");
      clickPrompt(state, "runner", "Buffer Drive"); // do buffer before aniccam triggers
      clickPrompt(state, "runner", inDeck);
      const handTitles = (runner.hand ?? []).map((c: any) => c.title);
      expect(handTitles).toEqual([inHand, inDeck]); // Aniccam drew the bottomed card
    });
  });
});

// ============================================================
// Degree Mill / CVS
// ============================================================

describe("degree-mill-cvs", () => {
  it("for issue #4515", () => {
    doGame((state) => {
      newGame(state, 
        {
          corp: {
            hand: ["Degree Mill"],
            discard: ["Cyberdex Virus Suite"],
          },
          runner: {
            hand: ["Aumakua", ...qty("Clone Chip", 2)],
            credits: 10,
          },
        },
      );
      takeCredits(state, "corp");
      gain(state, "runner", "click", 10);
      playFromHand(state, "runner", "Aumakua");
      playFromHand(state, "runner", "Clone Chip");
      playFromHand(state, "runner", "Clone Chip");
      runOn(state, "rd");
      runContinue(state);
      runOn(state, "rd");
      runContinue(state);
      expect(getCounters(getProgram(state, 0), "virus")).toBe(2); // Aumakua has 2 virus counters
      runOn(state, "archives");
      runContinue(state);
      clickPrompt(state, "corp", "Yes");
      expect(getCounters(getProgram(state, 0), "virus")).toBe(1); // Aumakua has 1 virus counter after purge and no trash
      expect(state.run).toBeUndefined(); // Run has ended
      runOn(state, "rd");
      runContinue(state);
      runOn(state, "rd");
      runContinue(state);
      // trash-from-hand state :corp "Degree Mill"
      const dm = findCard("Degree Mill", (getCorp(state) as any).hand);
      if (dm) {
        core.processAction("trash", state, "corp", { card: dm });
      }
      runOn(state, "archives");
      runContinue(state);
      clickPrompt(state, "runner", "Degree Mill");
      clickPrompt(state, "runner", "Pay to steal");
      clickCard(state, "runner", (getRunner(state) as any).rig?.hardware?.[0]);
      clickCard(state, "runner", (getRunner(state) as any).rig?.hardware?.[1]);
      clickPrompt(state, "corp", "Yes");
      expect(getCounters(getProgram(state, 0), "virus")).toBe(0); // Aumakua has 0 virus counter after purge and steal
      expect(state.run).toBeUndefined(); // Run has ended
    });
  });
});

// ============================================================
// Mini-game: prevent net dmg / resource trash with Fall Guy
// ============================================================

describe("minigame-prevent-netdmg-resourcetrash", () => {
  it("Mini-game testing prevention of net damage and resource trashing, with hosted Fall Guy", () => {
    doGame((state) => {
      newGame(state, 
        {
          corp: { deck: ["Neural EMP", ...qty("Hedge Fund", 3), "SEA Source"] },
          runner: { deck: ["Fall Guy", "Off-Campus Apartment", "Net Shield",
            "Wireless Net Pavilion", "Sure Gamble"] },
        },
      );
      playFromHand(state, "corp", "Hedge Fund");
      playFromHand(state, "corp", "Hedge Fund");
      takeCredits(state, "corp", 1);
      expect(getCorp(state).credit).toBe(14);
      gain(state, "runner", "click", 2);
      // run-empty-server Archives - enable Corp play of Neural and SEA next turn
      runOn(state, "archives");
      runContinue(state);
      playFromHand(state, "runner", "Sure Gamble");
      playFromHand(state, "runner", "Off-Campus Apartment");
      playFromHand(state, "runner", "Wireless Net Pavilion");
      playFromHand(state, "runner", "Net Shield");
      const apt = getResource(state, 0);
      playFromHand(state, "runner", "Fall Guy");
      clickPrompt(state, "runner", apt?.title ?? "Off-Campus Apartment");
      takeCredits(state, "runner");
      expect(getRunner(state).credit).toBe(6);
      playFromHand(state, "corp", "Neural EMP");
      const hostedOnApt = (refresh(state, apt) as any).hosted;
      const fg = hostedOnApt?.[0];
      clickPrompt(state, "runner", "Net Shield");
      expect(getRunner(state).credit).toBe(5); // Runner paid 1c to survive Neural EMP
      playFromHand(state, "corp", "SEA Source");
      clickPrompt(state, "corp", "3"); // boost trace to 6
      clickPrompt(state, "runner", "0");
      expect(countTags(state)).toBe(1); // Runner took tag from SEA Source
      expect(getCorp(state).credit).toBe(7);
      trashResource(state);
      clickCard(state, "corp", "Off-Campus Apartment");
      expect(getCorp(state).credit).toBe(3); // WNP increased cost to trash a resource by 2
      clickPrompt(state, "runner", "Fall Guy"); // Trash Fall Guy to save the Apartment!
      expect((getResource(state, 0) as any)?.title).toBe("Off-Campus Apartment");
      // Apartment still standing
      const discarded = (getRunner(state) as any).discard ?? [];
      expect(discarded[discarded.length - 1]?.title).toBe("Fall Guy"); // Fall Guy trashed
    });
  });
});

// ============================================================
// HB Glacier econ and server protection
// ============================================================

describe("hb-glacier", () => {
  it("HB Glacier econ and server protection with upgrades", () => {
    doGame((state) => {
      newGame(state, 
        {
          corp: {
            id: "Haas-Bioroid: Engineering the Future",
            deck: [
              "Adonis Campaign",
              "Global Food Initiative",
              "Breaker Bay Grid",
              "Caprice Nisei",
              "Ash 2X3ZB9CY",
              "Turing",
              "Hedge Fund",
            ],
          },
          runner: {
            deck: [
              "Desperado",
              "Dirty Laundry",
              "Emergency Shutdown",
              "Lamprey",
              "Data Folding",
              "Career Fair",
            ],
          },
        },
      );
      draw(state, "corp", 1);
      gain(state, "corp", "click", 1);
      playFromHand(state, "corp", "Hedge Fund");
      playFromHand(state, "corp", "Adonis Campaign", "New remote");
      expect(getCorp(state).credit).toBe(10); // HB:EtF ability paid 1 credit
      playFromHand(state, "corp", "Breaker Bay Grid", "Server 1");
      playFromHand(state, "corp", "Ash 2X3ZB9CY", "HQ");
      const adon = getContent(state, "remote1", 0);
      const bbg = getContent(state, "remote1", 1);
      const ash = getContent(state, "hq", 0);
      rez(state, "corp", bbg);
      rez(state, "corp", adon);
      expect(getCorp(state).credit).toBe(10); // Breaker Bay Grid allowed rez of Adonis for free
      takeCredits(state, "corp");
      draw(state, "runner", 1);
      playFromHand(state, "runner", "Career Fair");
      clickCard(state, "runner", findCard("Data Folding", (getRunner(state) as any).hand));
      expect(getRunner(state).credit).toBe(5); // Data Folding installed for free by Career Fair
      playFromHand(state, "runner", "Lamprey");
      playFromHand(state, "runner", "Desperado");
      expect(getRunner(state).credit).toBe(1);
      runOn(state, "HQ");
      rez(state, "corp", ash);
      runContinue(state);
      clickPrompt(state, "corp", "0");
      clickPrompt(state, "runner", "0");
      expect(getRunner(state).credit).toBe(2);
      expect(getCorp(state).credit).toBe(7); // Desperado paid 1 to Runner, Lamprey took 1 from Corp
      clickPrompt(state, "runner", "No action"); // can't afford to trash Ash
      takeCredits(state, "runner");
      playFromHand(state, "corp", "Caprice Nisei", "Server 1");
      expect(getCorp(state).credit).toBe(11); // Gained 3 from Adonis and 1 from HB:EtF
      playFromHand(state, "corp", "Turing", "Server 1");
      takeCredits(state, "corp", 1);
      expect(getRunner(state).credit).toBe(3); // Gained 1 from Data Folding
      gain(state, "runner", "click", 2);
      runOn(state, "HQ");
      runContinue(state);
      clickPrompt(state, "corp", "0");
      clickPrompt(state, "runner", "0");
      clickPrompt(state, "runner", "Pay 3 [Credits] to trash"); // trash Ash
      expect(getRunner(state).credit).toBe(1);
      expect(getCorp(state).credit).toBe(11);
      gain(state, "runner", "credit", 1);
      playFromHand(state, "runner", "Dirty Laundry");
      clickPrompt(state, "runner", "HQ");
      runContinue(state);
      runContinue(state);
      clickPrompt(state, "runner", "Steal");
      expect((getRunner(state) as any).agendaPoint).toBe(2); // Stole Global Food Initiative
      expect(getRunner(state).credit).toBe(6);
      expect(getCorp(state).credit).toBe(10);
      runOn(state, "Server 1");
      const tur = getIce(state, "remote1", 0);
      const cap = getContent(state, "remote1", 2);
      rez(state, "corp", tur);
      runContinue(state);
      expect((refresh(state, tur) as any).currentStrength).toBe(5); // Turing +3 strength protecting a remote
      core.processAction("subroutine", state, "corp", { card: refresh(state, tur), subroutine: 0 }); // end the run
      clickPrompt(state, "runner", "End the run");
      playFromHand(state, "runner", "Emergency Shutdown");
      clickCard(state, "runner", tur);
      expect((refresh(state, tur) as any).rezzed).toBe(false); // Turing derezzed
      runOn(state, "Server 1"); // letting Runner in this time to use Caprice
      rez(state, "corp", cap);
      runContinue(state);
      // Caprice psi game started automatically
      clickPrompt(state, "corp", "1 [Credits]");
      clickPrompt(state, "runner", "2 [Credits]");
      expect(state.run).toBeUndefined(); // Corp won Caprice psi game and ended the run
    });
  });
});

// ============================================================
// Poétrï hidden info game
// ============================================================

describe("poetri-hidden-info-game", () => {
  it("during a breach, if a known card (already seen) would move positions, it is known which card it is", () => {
    for (let x = 0; x < 100; x++) {
      const unseen: Set<string> = new Set(["Hostile Takeover", "Ice Wall", "Tollbooth"]);
      doGame((state) => {
        newGame(state, 
          {
            corp: {
              id: "Poétrï Luxury Brands: All the Rage",
              hand: [...unseen],
            },
            runner: { hand: ["Legwork"] },
          },
        );
        takeCredits(state, "corp");
        playFromHand(state, "runner", "Legwork");
        runContinueUntil(state, "success");
        // first access
        const prompt = (state.runner as any)?.prompt?.[0];
        const cur = prompt?.card?.title ?? "";
        unseen.delete(cur);
        if (cur === "Hostile Takeover") {
          // install either one, doesn't matter
          const remaining = [...unseen];
          clickPrompt(state, "runner", "Steal");
          const firstUnseen = remaining[0] ?? "Ice Wall";
          clickPrompts(state, "corp", firstUnseen, "New remote");
          expect(secondLastLogContains(state, "install ice protecting Server 1")).toBe(true);
          // New remote, no leaked info
          clickPrompt(state, "runner", "No action");
          expect(noPrompt(state, "runner")).toBe(true); // Saw 2 cards, access over
        } else {
          // second access
          clickPrompt(state, "runner", "No action");
          const prompt2 = (state.runner as any)?.prompt?.[0];
          const cur2 = prompt2?.card?.title ?? "";
          unseen.delete(cur2);
          if (cur2 === "Hostile Takeover") {
            clickPrompt(state, "runner", "Steal");
            const remaining = [...unseen];
            const firstUnseen = remaining[0] ?? "Ice Wall";
            clickPrompts(state, "corp", firstUnseen, "New remote");
            expect(lastLogContains(state, "install ice protecting Server 1")).toBe(true);
            // New remote, no leaked info
            expect(noPrompt(state, "runner")).toBe(true); // Saw 2 cards, access over
          } else {
            clickPrompt(state, "runner", "No action");
            // third access -> this time we just install an ice, and it will be known
            const options = ["Ice Wall", "Tollbooth"];
            const target = options[Math.floor(Math.random() * options.length)];
            clickPrompt(state, "runner", "Steal");
            clickPrompts(state, "corp", target, "New remote");
            expect(lastLogContains(state, `to install ${target} protecting Server 1`)).toBe(true);
            // Exposed the info
            expect(noPrompt(state, "runner")).toBe(true); // Access over
          }
        }
      });
    }
  });
});

// ============================================================
// ESA / Thule hidden info - known card
// ============================================================

describe("esa-v-thule-hidden-info-known", () => {
  it("known card info is revealed", () => {
    doGame((state) => {
      newGame(state, 
        {
          runner: {
            id: "Esâ Afontov: Eco-Insurrectionist",
            hand: ["Ika", "Jailbreak"],
          },
          corp: {
            hand: ["IPO"],
            id: "Thule Subsea: Safety Below",
            deck: ["Project Atlas", "Vanilla", "Ice Wall"],
          },
        },
      );
      stackDeck(state, "corp", ["Vanilla", "Project Atlas", "Ice Wall"]);
      takeCredits(state, "corp");
      playFromHand(state, "runner", "Jailbreak");
      clickPrompt(state, "runner", "R&D");
      runContinueUntil(state, "success");
      clickPrompts(state, "runner", "No action", "Steal", "Suffer 1 core damage", "Yes");
      clickPrompt(state, "corp", "Done");
      expect(lastLogContains(state, "trashes Vanilla and 1 unknown card")).toBe(true); // Revealed known info
      const discard = (getCorp(state) as any).discard ?? [];
      expect(
        discard.some(
          (c: any) => c.seen === true && c.title === "Vanilla",
        ),
      ).toBe(true); // Seen vanilla
      expect(
        discard.some(
          (c: any) => c.seen !== true && c.title === "Ice Wall",
        ),
      ).toBe(true); // Unseen Iwall
    });
  });
});

// ============================================================
// Companions - Fencer Fueno, Mystic Maemi, Trickster Taka
// ============================================================

describe("companions", () => {
  it.each(["Fencer Fueno", "Trickster Taka", "Mystic Maemi"])(
    "%s: Gain 1c on start of turn or agenda steal",
    (card) => {
      doGame((state) => {
        newGame(state, 
          {
            corp: {
              deck: [...qty("Hedge Fund", 5)],
              hand: ["Hostile Takeover"],
            },
            runner: { hand: [card] },
          },
        );
        takeCredits(state, "corp");
        playFromHand(state, "runner", card);
        const cc = getResource(state, 0);
        const counters = getCounters(refresh(state, cc), "credit");
        expect(getCounters(refresh(state, cc), "credit")).toBe(0); // Companion starts with 0 credits
        runOn(state, "hq");
        runContinue(state);
        clickPrompt(state, "runner", "Steal");
        expect(getCounters(refresh(state, cc), "credit")).toBe(counters + 1); // Companion gains 1c for stealing agenda
        runOn(state, "archives");
        runContinue(state);
        expect(getCounters(refresh(state, cc), "credit")).toBe(counters + 1); // Companion doesn't gain 1c when no agenda stolen
      });
    },
  );
});
