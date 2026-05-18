import * as core from "@/game/core";
import * as tf from "../test_framework";

describe("game.core.rules", () => {
  it("corp-rez-unique: Rezzing a second copy of a unique Corp card", () => {
    tf.doGame((state) => {
      tf.newGame(state, { corp: { deck: tf.qty("Caprice Nisei", 2) } });
      tf.playFromHand(state, "corp", "Caprice Nisei", "HQ");
      tf.playFromHand(state, "corp", "Caprice Nisei", "R&D");
      tf.rez(state, "corp", tf.getContent(state, "hq", 0));
      expect(tf.rezzed(tf.getContent(state, "hq", 0))).toBe(true);
      tf.rez(state, "corp", tf.getContent(state, "rd", 0), { expectRez: false });
      expect(tf.rezzed(tf.getContent(state, "rd", 0))).toBe(false);
    });
  });

  it("runner-install-program: Program install; ensure costs are paid", () => {
    tf.doGame((state) => {
      tf.newGame(state, { runner: { deck: ["Gordian Blade"] } });
      tf.takeCredits(state, "corp");
      tf.playFromHand(state, "runner", "Gordian Blade");
      const gord = tf.getProgram(state, 0);
      const runner = tf.getRunner(state);
      expect(runner.credit).toBe(5 - gord.cost);
      expect(core.availableMu(state)).toBe(4 - gord.memoryunits);
    });
  });

  it("installing-second-region-test", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          hand: [
            "Lateral Growth",
            "Crisium Grid",
            "Tranquility Home Grid",
            "Jinja City Grid",
          ],
        },
      });
      tf.playFromHand(state, "corp", "Jinja City Grid", "New remote");
      expect(tf.noPrompt(state, "corp")).toBe(true);
      tf.playFromHand(state, "corp", "Crisium Grid", "Server 1");
      const prompt = tf.getPromptMap(state, "corp");
      expect(prompt.msg).toBe("The Jinja City Grid in Server 1 will now be trashed.");
      tf.clickPrompt(state, "corp", "OK");
      tf.playFromHand(state, "corp", "Lateral Growth");
      tf.clickCard(state, "corp", "Tranquility Home Grid");
      tf.clickPrompt(state, "corp", "Server 1");
      const prompt2 = tf.getPromptMap(state, "corp");
      expect(prompt2.msg).toBe("The Crisium Grid in Server 1 will now be trashed.");
      tf.clickPrompt(state, "corp", "OK");
      expect(tf.getDiscarded(state, "corp")).toBeDefined();
      const corpDiscard = tf.getCorp(state).discard;
      expect(corpDiscard.length).toBe(3);
    });
  });

  it("installing-second-unique-trashes-first-unique-test", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        runner: { hand: tf.qty("Kati Jones", 2), credits: 100 },
      });
      tf.takeCredits(state, "corp");
      tf.playFromHand(state, "runner", "Kati Jones");
      tf.cardAbility(state, "runner", tf.getResource(state, 0), 0);
      expect(tf.getCounters(tf.getResource(state, 0), "credit")).toBe(3);
      tf.playFromHand(state, "runner", "Kati Jones");
      expect(tf.getCounters(tf.getResource(state, 0), "credit")).toBe(0);
      expect(tf.findCard(tf.getResource(state), "Kati Jones")).toBeDefined();
      expect(tf.lastLogContains(state, "Kati Jones is trashed.")).toBe(true);
    });
  });

  describe("installing-second-unique-on-off-campus-apartment-trashes-first-test", () => {
    it("Should trash the kati in the rig", () => {
      tf.doGame((state) => {
        tf.newGame(state, {
          runner: {
            hand: [
              ...tf.qty("Kati Jones", 2),
              "Off-Campus Apartment",
            ],
            credits: 100,
          },
        });
        tf.takeCredits(state, "corp");
        tf.playCards(
          state,
          "runner",
          "Off-Campus Apartment",
          ["Kati Jones", "The Rig"],
          ["Kati Jones", "Off-Campus Apartment"],
        );
        expect(
          tf.findCard("Kati Jones", tf.getResource(state, 0).hosted),
        ).toBeDefined();
        expect(tf.getTitle(tf.getDiscarded(state, "runner"))).toBe("Kati Jones");
        expect(tf.lastLogContains(state, "Kati Jones is trashed.")).toBe(true);
      });
    });

    it("Should trash the kati on OCA", () => {
      tf.doGame((state) => {
        tf.newGame(state, {
          runner: {
            hand: [
              ...tf.qty("Kati Jones", 2),
              "Off-Campus Apartment",
            ],
            credits: 100,
          },
        });
        tf.takeCredits(state, "corp");
        tf.playCards(
          state,
          "runner",
          "Off-Campus Apartment",
          ["Kati Jones", "Off-Campus Apartment"],
          ["Kati Jones", "The Rig"],
        );
        expect(tf.getTitle(tf.getResource(state, 1))).toBe("Kati Jones");
        expect(
          tf.findCard("Kati Jones", tf.getResource(state, 0).hosted),
        ).toBeUndefined();
        expect(tf.getTitle(tf.getDiscarded(state, "runner"))).toBe("Kati Jones");
        expect(
          tf.lastLogContains(state, "Kati Jones hosted on .* is trashed."),
        ).toBe(true);
      });
    });

    it("Should trash the loaded kati on OCA", () => {
      tf.doGame((state) => {
        tf.newGame(state, {
          runner: {
            hand: [
              ...tf.qty("Kati Jones", 2),
              "Off-Campus Apartment",
            ],
            credits: 100,
          },
        });
        tf.takeCredits(state, "corp");
        tf.playCards(
          state,
          "runner",
          "Off-Campus Apartment",
          ["Kati Jones", "Off-Campus Apartment"],
        );
        const hostedKati = tf.getResource(state, 0).hosted[0];
        tf.cardAbility(state, "runner", hostedKati, 0);
        expect(tf.getCounters(hostedKati, "credit")).toBe(3);
        tf.playCards(state, "runner", ["Kati Jones", "Off-Campus Apartment"]);
        expect(
          tf.getCounters(tf.getResource(state, 0).hosted[0], "credit"),
        ).toBe(0);
        expect(
          tf.findCard("Kati Jones", tf.getResource(state, 0).hosted),
        ).toBeDefined();
        expect(tf.getTitle(tf.getDiscarded(state, "runner"))).toBe("Kati Jones");
        expect(
          tf.lastLogContains(state, "Kati Jones hosted on .* is trashed."),
        ).toBe(true);
      });
    });
  });

  it("installing-second-hivemind-trashes-hosted-hivemind-test", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        runner: {
          hand: ["Scheherazade", ...tf.qty("Hivemind", 2)],
          credits: 100,
        },
      });
      tf.takeCredits(state, "corp");
      tf.playFromHand(state, "runner", "Scheherazade");
      const scheh = tf.getProgram(state, 0);
      tf.playFromHand(state, "runner", "Hivemind");
      tf.clickPrompt(state, "runner", "Scheherazade");
      expect(
        tf.findCard("Hivemind", core.getCard(state, scheh).hosted),
      ).toBeDefined();
      tf.playFromHand(state, "runner", "Hivemind");
      tf.clickPrompt(state, "runner", "The Rig");
      expect(tf.getTitle(tf.getDiscarded(state, "runner"))).toBe("Hivemind");
      expect(
        tf.lastLogContains(state, "Hivemind hosted on Scheherazade is trashed."),
      ).toBe(true);
      expect(core.getCard(state, scheh).hosted.length).toBe(0);
    });
  });

  it("deactivate-program: Program deactivation; ensure MU are restored", () => {
    tf.doGame((state) => {
      tf.newGame(state, { runner: { deck: ["Gordian Blade"] } });
      tf.takeCredits(state, "corp");
      tf.playFromHand(state, "runner", "Gordian Blade");
      const gord = tf.getProgram(state, 0);
      tf.trash(state, "runner", gord);
      expect(core.availableMu(state)).toBe(4);
    });
  });

  it("agenda-forfeit-runner: Don't deactivate agenda on runner forfeit", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { deck: ["Mandatory Upgrades"] },
        runner: { deck: ["Data Dealer"] },
      });
      tf.takeCredits(state, "corp");
      tf.playFromHand(state, "runner", "Data Dealer");
      tf.runEmptyServer(state, "HQ");
      tf.clickPrompt(state, "runner", "Steal");
      expect(tf.getRunner(state).agendaPoint).toBe(2);
      tf.cardAbility(state, "runner", tf.getResource(state, 0), 0);
      tf.clickCard(state, "runner", tf.getScored(state, "runner", 0));
      expect(tf.getRunner(state).click).toBe(1);
      expect(tf.getRunner(state).clickPerTurn).toBe(4);
    });
  });

  it("agenda-forfeit-corp: Deactivate agenda on corp forfeit", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { deck: ["Mandatory Upgrades", "Corporate Town"] },
      });
      tf.playFromHand(state, "corp", "Mandatory Upgrades", "New remote");
      tf.scoreAgenda(state, "corp", tf.getContent(state, "remote1", 0));
      expect(tf.getCorp(state).clickPerTurn).toBe(4);
      tf.playFromHand(state, "corp", "Corporate Town", "New remote");
      const ctown = tf.getContent(state, "remote2", 0);
      tf.rez(state, "corp", ctown, { expectRez: false });
      tf.clickCard(state, "corp", tf.getScored(state, "corp", 0));
      expect(tf.getCorp(state).clickPerTurn).toBe(3);
    });
  });

  it("refresh-recurring-credits-hosted: Recurring credits refresh properly", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          hand: [
            ...tf.qty("Ice Wall", 3),
            ...tf.qty("Hedge Fund", 3),
          ],
        },
        runner: { hand: ["Compromised Employee", "Off-Campus Apartment"] },
      });
      tf.playFromHand(state, "corp", "Ice Wall", "HQ");
      tf.takeCredits(state, "corp", 2);
      tf.playFromHand(state, "runner", "Off-Campus Apartment");
      const iwall = tf.getIce(state, "hq", 0);
      const apt = tf.getResource(state, 0);
      tf.playFromHand(state, "runner", "Compromised Employee");
      tf.clickPrompt(state, "runner", tf.getTitle(apt));
      const cehosted = core.getCard(state, apt).hosted[0];
      tf.cardAbility(state, "runner", cehosted, 0);
      expect(tf.getRunner(state).credit).toBe(4);
      expect(tf.getCounters(core.getCard(state, cehosted), "recurring")).toBe(0);
      tf.rez(state, "corp", iwall);
      expect(tf.getRunner(state).credit).toBe(5);
      tf.takeCredits(state, "runner");
      tf.takeCredits(state, "corp");
      expect(
        tf.getCounters(core.getCard(state, cehosted), "recurring"),
      ).toBe(1);
    });
  });

  it("card-str-test-simple: card-str names cards properly", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          deck: [
            ...tf.qty("Ice Wall", 3),
            ...tf.qty("Jackson Howard", 2),
          ],
        },
        runner: {
          deck: ["Corroder", "Clone Chip", "Paparazzi", "Parasite"],
        },
      });
      tf.gain(state, "corp", "click", 2);
      tf.playFromHand(state, "corp", "Ice Wall", "HQ");
      tf.playFromHand(state, "corp", "Ice Wall", "R&D");
      tf.playFromHand(state, "corp", "Jackson Howard", "New remote");
      tf.playFromHand(state, "corp", "Jackson Howard", "New remote");
      tf.playFromHand(state, "corp", "Ice Wall", "HQ");
      tf.endTurn(state, "corp");
      tf.startTurn(state, "runner");
      tf.playFromHand(state, "runner", "Corroder");
      tf.playFromHand(state, "runner", "Clone Chip");
      tf.playFromHand(state, "runner", "Paparazzi");
      const hqiwall0 = tf.getIce(state, "hq", 0);
      const hqiwall1 = tf.getIce(state, "hq", 1);
      const rdiwall = tf.getIce(state, "rd", 0);
      const jh1 = tf.getContent(state, "remote1", 0);
      const jh2 = tf.getContent(state, "remote2", 0);
      const corr = tf.getProgram(state, 0);
      const cchip = tf.getHardware(state, 0);
      const pap = tf.getResource(state, 0);
      tf.rez(state, "corp", hqiwall0);
      tf.rez(state, "corp", jh1);
      tf.playFromHand(state, "runner", "Parasite");
      tf.clickCard(state, "runner", core.getCard(state, hqiwall0));
      expect(
        core.cardStr(state, core.getCard(state, hqiwall0)),
      ).toBe("Ice Wall protecting HQ at position 0");
      expect(
        core.cardStr(state, core.getCard(state, hqiwall1)),
      ).toBe("ice protecting HQ at position 1");
      expect(
        core.cardStr(state, core.getCard(state, rdiwall)),
      ).toBe("ice protecting R&D at position 0");
      expect(
        core.cardStr(state, core.getCard(state, rdiwall), { visible: true }),
      ).toBe("Ice Wall protecting R&D at position 0");
      expect(
        core.cardStr(state, core.getCard(state, jh1)),
      ).toBe("Jackson Howard in Server 1");
      expect(
        core.cardStr(state, core.getCard(state, jh2)),
      ).toBe("a card in Server 2");
      expect(
        core.cardStr(state, core.getCard(state, corr)),
      ).toBe("Corroder");
      expect(
        core.cardStr(state, core.getCard(state, cchip)),
      ).toBe("Clone Chip");
      expect(
        core.cardStr(state, core.getCard(state, pap)),
      ).toBe("Paparazzi");
      const hostedParasite = core.getCard(state, hqiwall0).hosted[0];
      expect(
        core.cardStr(state, hostedParasite),
      ).toBe("Parasite hosted on Ice Wall protecting HQ at position 0");
    });
  });

  it("invalid-score-attempt: Scoring with incorrect advancement tokens", () => {
    tf.doGame((state) => {
      tf.newGame(state, { corp: { deck: ["Ancestral Imager"] } });
      tf.playFromHand(state, "corp", "Ancestral Imager", "New remote");
      const ai = tf.getContent(state, "remote1", 0);
      expect(
        tf.findCard("Ancestral Imager", tf.getCorp(state).scored),
      ).toBeUndefined();
      expect(tf.getContent(state, "remote1", 0)).toBeDefined();
      tf.clickAdvance(state, "corp", ai);
      tf.score(state, "corp", core.getCard(state, ai));
      expect(tf.getContent(state, "remote1", 0)).toBeDefined();
    });
  });

  it("trash-corp-hosted: Hosted Corp cards included in all-installed", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          deck: [
            "Full Immersion RecStudio",
            "Worlds Plaza",
            "Director Haas",
          ],
        },
      });
      tf.playFromHand(state, "corp", "Full Immersion RecStudio", "New remote");
      const fir = tf.getContent(state, "remote1", 0);
      tf.rez(state, "corp", fir);
      tf.cardAbility(state, "corp", fir, 0);
      tf.clickCard(state, "corp", "Worlds Plaza");
      const wp = core.getCard(state, fir).hosted[0];
      tf.rez(state, "corp", wp);
      tf.cardAbility(state, "corp", wp, 0);
      tf.clickCard(state, "corp", "Director Haas");
      const dh = core.getCard(state, wp).hosted[0];
      expect(dh.rezzed).toBe(true);
      expect(tf.getCorp(state).credit).toBe(0);
      expect(tf.getCorp(state).clickPerTurn).toBe(4);
      expect(core.allInstalled(state, "corp").length).toBe(3);
      tf.takeCredits(state, "corp");
      tf.runEmptyServer(state, "Server 1");
      tf.clickCard(state, "runner", dh);
      tf.clickPrompt(state, "runner", "Pay 5 [Credits] to trash");
      tf.clickPrompts(state, "runner", "Worlds Plaza", "No action", "No action");
      expect(tf.getCorp(state).clickPerTurn).toBe(3);
    });
  });

  it("trash-remove-per-turn-restriction: Trashing removes from per-turn", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { deck: tf.qty("Hedge Fund", 3) },
        runner: { deck: [...tf.qty("Imp", 2), "Scavenge"] },
      });
      tf.takeCredits(state, "corp");
      tf.gain(state, "runner", "click", 1);
      tf.playFromHand(state, "runner", "Imp");
      const imp = tf.getProgram(state, 0);
      tf.runEmptyServer(state, "HQ");
      tf.clickPrompt(state, "runner", "[Imp] Hosted virus counter: Trash card");
      expect(tf.getCorp(state).discard.length).toBe(1);
      tf.runEmptyServer(state, "HQ");
      tf.clickPrompt(state, "runner", "No action");
      expect(tf.getCorp(state).discard.length).toBe(1);
      tf.playFromHand(state, "runner", "Scavenge");
      tf.clickCard(state, "runner", imp);
      tf.clickCard(state, "runner", tf.findCard("Imp", tf.getRunner(state).discard));
      const imp2 = tf.getProgram(state, 0);
      expect(tf.getCounters(core.getCard(state, imp2), "virus")).toBe(2);
      tf.runEmptyServer(state, "HQ");
      tf.clickPrompt(state, "runner", "[Imp] Hosted virus counter: Trash card");
      expect(tf.getCorp(state).discard.length).toBe(2);
    });
  });

  it("trash-seen-and-unseen: Trash installed assets seen and unseen", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          deck: tf.qty("Ice Wall", 7),
          hand: ["PAD Campaign", "Sandburg", "NGO Front"],
        },
      });
      tf.playFromHand(state, "corp", "PAD Campaign", "New remote");
      tf.playFromHand(state, "corp", "Sandburg", "New remote");
      tf.takeCredits(state, "corp", 1);
      tf.runEmptyServer(state, "Server 1");
      tf.clickPrompt(state, "runner", "No action");
      tf.runEmptyServer(state, "Server 2");
      tf.clickPrompt(state, "runner", "Pay 4 [Credits] to trash");
      tf.takeCredits(state, "runner", 2);
      tf.playFromHand(state, "corp", "NGO Front", "Server 1");
      const prompt = tf.getPromptMap(state, "corp");
      expect(prompt.msg).toBe("The PAD Campaign in Server 1 will now be trashed.");
      tf.clickPrompt(state, "corp", "OK");
      expect(tf.getCorp(state).discard.length).toBe(2);
      const sandburg = tf.findCard("Sandburg", tf.getCorp(state).discard);
      expect(sandburg.seen).toBe(true);
      const pad = tf.findCard("PAD Campaign", tf.getCorp(state).discard);
      expect(pad.seen).toBe(false);
      expect(tf.getContent(state, "remote1", 0).seen).toBe(false);
    });
  });

  it("reinstall-seen-asset: Reinstall faceup card is not seen", () => {
    tf.doGame((state) => {
      tf.newGame(state, { corp: { deck: ["PAD Campaign", "Interns"] } });
      tf.playFromHand(state, "corp", "PAD Campaign", "New remote");
      tf.takeCredits(state, "corp", 2);
      tf.runEmptyServer(state, "Server 1");
      tf.clickPrompt(state, "runner", "Pay 4 [Credits] to trash");
      expect(tf.getCorp(state).discard[0].seen).toBe(true);
      tf.takeCredits(state, "runner", 3);
      tf.playFromHand(state, "corp", "Interns");
      tf.clickCard(state, "corp", tf.getCorp(state).discard[0]);
      tf.clickPrompt(state, "corp", "New remote");
      expect(tf.getContent(state, "remote2", 0).seen).toBe(false);
    });
  });

  it("all-installed-runner-test: all-installed for runner cards", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { deck: ["Wraparound"] },
        runner: {
          hand: [
            "Omni-drive",
            "Personal Workshop",
            "Leprechaun",
            "Corroder",
            "Mimic",
            "Knight",
          ],
        },
      });
      tf.playFromHand(state, "corp", "Wraparound", "HQ");
      const wrap = tf.getIce(state, "hq", 0);
      tf.rez(state, "corp", wrap);
      tf.takeCredits(state, "corp");
      tf.gain(state, "runner", "credit", 7);
      tf.playFromHand(state, "runner", "Knight");
      tf.playFromHand(state, "runner", "Personal Workshop");
      tf.playFromHand(state, "runner", "Omni-drive");
      tf.takeCredits(state, "runner");
      tf.takeCredits(state, "corp");
      const kn = tf.getProgram(state, 0);
      const pw = tf.getResource(state, 0);
      const od = tf.getHardware(state, 0);
      tf.cardAbility(state, "runner", kn, 0);
      tf.clickCard(state, "runner", wrap);
      tf.cardAbility(state, "runner", pw, 0);
      tf.clickCard(state, "runner", "Corroder");
      tf.playFromHand(state, "runner", "Leprechaun");
      tf.clickPrompt(state, "runner", tf.getTitle(od));
      const odRefreshed = core.getCard(state, od);
      const le = odRefreshed.hosted[0];
      tf.playFromHand(state, "runner", "Mimic");
      tf.clickPrompt(state, "runner", "Leprechaun");
      const allInstalled = core.allInstalled(state, "runner");
      expect(allInstalled.length).toBe(5);
      expect(
        allInstalled.find((c) => c.title === "Leprechaun"),
      ).toBeDefined();
      expect(
        allInstalled.find((c) => c.title === "Personal Workshop"),
      ).toBeDefined();
      expect(allInstalled.find((c) => c.title === "Mimic")).toBeDefined();
      expect(allInstalled.find((c) => c.title === "Omni-drive")).toBeDefined();
      expect(allInstalled.find((c) => c.title === "Knight")).toBeDefined();
      expect(
        allInstalled.find((c) => c.title === "Corroder"),
      ).toBeUndefined();
    });
  });

  it("log-accessed-names: Accessed card names logged", () => {
    tf.doGame((state) => {
      tf.newGame(state, { corp: { deck: tf.qty("PAD Campaign", 7) } });
      tf.playFromHand(state, "corp", "PAD Campaign", "New remote");
      tf.trashFromHand(state, "corp", "PAD Campaign");
      tf.takeCredits(state, "corp");
      tf.runEmptyServer(state, "hq");
      tf.clickPrompt(state, "runner", "No action");
      expect(tf.lastLogContains(state, "PAD Campaign")).toBe(true);
      tf.runEmptyServer(state, "rd");
      tf.clickPrompt(state, "runner", "No action");
      expect(tf.lastLogContains(state, "an unseen card")).toBe(true);
      tf.runEmptyServer(state, "remote1");
      tf.clickPrompt(state, "runner", "No action");
      expect(tf.lastLogContains(state, "PAD Campaign")).toBe(true);
    });
  });

  it("run-bad-publicity-credits: Should not lose BP credits until run over", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { deck: tf.qty("Cyberdex Virus Suite", 3) },
        runner: {
          id: "Valencia Estevez: The Angel of Cayambe",
          deck: tf.qty("Sure Gamble", 3),
        },
      });
      expect(tf.countBadPub(state)).toBe(1);
      tf.playFromHand(state, "corp", "Cyberdex Virus Suite", "New remote");
      tf.playFromHand(state, "corp", "Cyberdex Virus Suite", "R&D");
      tf.playFromHand(state, "corp", "Cyberdex Virus Suite", "HQ");
      tf.takeCredits(state, "corp");
      tf.runEmptyServer(state, "remote1");
      tf.clickPrompt(state, "corp", "No");
      tf.clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
      tf.selectBadPub(state, false);
      expect(tf.getRunner(state).credit).toBe(5);
      tf.runEmptyServer(state, "hq");
      tf.clickPrompt(state, "corp", "No");
      tf.clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
      tf.selectBadPub(state, false);
      expect(tf.getRunner(state).credit).toBe(5);
      tf.runEmptyServer(state, "rd");
      tf.clickPrompt(state, "corp", "No");
      tf.clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
      tf.selectBadPub(state, false);
      expect(tf.getRunner(state).credit).toBe(5);
    });
  });

  it("run-psi-bad-publicity-credits: Pay from Bad Pub for Psi games", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { deck: tf.qty("Caprice Nisei", 3) },
        runner: {
          id: "Valencia Estevez: The Angel of Cayambe",
          deck: tf.qty("Sure Gamble", 3),
        },
      });
      expect(tf.countBadPub(state)).toBe(1);
      tf.playFromHand(state, "corp", "Caprice Nisei", "New remote");
      tf.takeCredits(state, "corp");
      const caprice = tf.getContent(state, "remote1", 0);
      tf.rez(state, "corp", caprice);
      tf.runOn(state, "Server 1");
      expect(tf.promptIsCard(state, "corp", caprice)).toBe(true);
      expect(tf.promptIsCard(state, "runner", caprice)).toBe(true);
      tf.clickPrompt(state, "corp", "2 [Credits]");
      tf.clickPrompt(state, "runner", "1 [Credits]");
      expect(tf.getRunner(state).credit).toBe(5);
      expect(tf.getCorp(state).credit).toBe(3);
    });
  });

  it("purge-nested: Purge nested-hosted virus counters", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { deck: ["Cyberdex Trial"] },
        runner: { deck: ["Djinn", "Imp", "Leprechaun"] },
      });
      tf.takeCredits(state, "corp");
      tf.gain(state, "runner", "credit", 100);
      tf.playFromHand(state, "runner", "Leprechaun");
      tf.playFromHand(state, "runner", "Djinn");
      tf.clickPrompt(state, "runner", "Leprechaun");
      tf.playFromHand(state, "runner", "Imp");
      tf.clickPrompt(state, "runner", "Djinn");
      const lep = tf.getProgram(state, 0);
      const djinn = core.getCard(state, lep).hosted[0];
      const imp = core.getCard(state, djinn).hosted[0];
      expect(tf.getCounters(imp, "virus")).toBe(2);
      tf.takeCredits(state, "runner");
      tf.playFromHand(state, "corp", "Cyberdex Trial");
      expect(tf.getCounters(core.getCard(state, imp), "virus")).toBe(0);
    });
  });

  it("purge-corp: Purge virus counters on Corp cards", () => {
    tf.doGame((state) => {
      tf.newGame(state, { corp: { deck: ["Cyberdex Trial", "Ice Wall"] } });
      tf.playFromHand(state, "corp", "Ice Wall", "HQ");
      const iw = tf.getIce(state, "hq", 0);
      core.commandCounter(state, "corp", ["virus", 2]);
      tf.clickCard(state, "corp", iw);
      expect(tf.getCounters(core.getCard(state, iw), "virus")).toBe(2);
      tf.playFromHand(state, "corp", "Cyberdex Trial");
      tf.takeCredits(state, "corp");
      expect(tf.getCounters(core.getCard(state, iw), "virus")).toBe(0);
    });
  });

  it("end-the-run-test: ETR ice ends the run", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          deck: [
            ...tf.qty("Ice Wall", 3),
            ...tf.qty("Hedge Fund", 3),
            ...tf.qty("Restructure", 2),
          ],
        },
      });
      tf.playFromHand(state, "corp", "Ice Wall", "HQ");
      tf.takeCredits(state, "corp", 2);
      tf.runOn(state, "HQ");
      expect(state.run.server).toEqual(["hq"]);
      const iwall = tf.getIce(state, "hq", 0);
      tf.rez(state, "corp", iwall);
      tf.runContinue(state);
      tf.cardSubroutine(state, "corp", iwall, 0);
      expect(state.run).toBeUndefined();
      expect(state.runner.register["unsuccessful-run"]).toBe(true);
    });
  });

  it("auto-pump-breakers-single-pump: Single pump", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { deck: ["Masvingo"] },
        runner: { deck: ["Laamb"] },
      });
      tf.playFromHand(state, "corp", "Masvingo", "HQ");
      tf.takeCredits(state, "corp");
      tf.gain(state, "runner", "credit", 5);
      tf.playFromHand(state, "runner", "Laamb");
      tf.runOn(state, "HQ");
      tf.rez(state, "corp", tf.getIce(state, "hq", 0));
      tf.runContinue(state);
      const laamb = tf.getProgram(state, 0);
      expect(tf.getStrength(core.getCard(state, laamb))).toBe(2);
      expect(tf.getRunner(state).credit).toBe(6);
      tf.autoPump(state, core.getCard(state, laamb));
      expect(tf.getStrength(core.getCard(state, laamb))).toBe(8);
      expect(tf.getRunner(state).credit).toBe(3);
    });
  });

  it("auto-pump-breakers-multi-pump: Multi pump", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { deck: ["Masvingo"] },
        runner: { deck: ["Ankusa"] },
      });
      tf.playFromHand(state, "corp", "Masvingo", "HQ");
      tf.takeCredits(state, "corp");
      tf.gain(state, "runner", "credit", 5);
      tf.playFromHand(state, "runner", "Ankusa");
      tf.runOn(state, "HQ");
      tf.rez(state, "corp", tf.getIce(state, "hq", 0));
      tf.runContinue(state);
      const ank = tf.getProgram(state, 0);
      expect(tf.getStrength(core.getCard(state, ank))).toBe(0);
      expect(tf.getRunner(state).credit).toBe(4);
      tf.autoPump(state, core.getCard(state, ank));
      expect(tf.getStrength(core.getCard(state, ank))).toBe(3);
      expect(tf.getRunner(state).credit).toBe(1);
    });
  });

  it("autoresolve-aeneas-with-and-without-autoresolve", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { deck: ["Jackson Howard"] },
        runner: { deck: tf.qty("Aeneas Informant", 2) },
      });
      tf.playFromHand(state, "corp", "Jackson Howard", "New remote");
      tf.takeCredits(state, "corp");
      tf.gain(state, "runner", "click", 50);
      tf.playFromHand(state, "runner", "Aeneas Informant");

      const runJackson = () => {
        tf.runEmptyServer(state, "Server 1");
        tf.clickPrompt(state, "runner", "No action");
      };
      const getAeneas1 = () => tf.getResource(state, 0);

      // Before toggling, aeneas should always prompt
      for (let i = 0; i < 3; i++) {
        runJackson();
        expect(
          tf.changed(
            () => tf.getRunner(state).credit,
            1,
            () => tf.clickPrompt(state, "runner", "Yes"),
          ),
        ).toBe(true);
        expect(tf.noPrompt(state, "runner")).toBe(true);
        runJackson();
        expect(
          tf.changed(
            () => tf.getRunner(state).credit,
            0,
            () => tf.clickPrompt(state, "runner", "No"),
          ),
        ).toBe(true);
        expect(tf.noPrompt(state, "runner")).toBe(true);
        tf.cardAbility(state, "runner", getAeneas1(), 0);
        tf.clickPrompt(state, "runner", "Ask");
      }

      // Set to Never
      tf.cardAbility(state, "runner", getAeneas1(), 0);
      tf.clickPrompt(state, "runner", "Never");
      expect(
        tf.changed(() => tf.getRunner(state).credit, 0, () => runJackson()),
      ).toBe(true);
      expect(tf.noPrompt(state, "runner")).toBe(true);

      // Set to Always
      tf.cardAbility(state, "runner", getAeneas1(), 0);
      tf.clickPrompt(state, "runner", "Always");
      expect(
        tf.changed(() => tf.getRunner(state).credit, 1, () => runJackson()),
      ).toBe(true);
      expect(tf.noPrompt(state, "runner")).toBe(true);

      // Play second Aeneas
      tf.playFromHand(state, "runner", "Aeneas Informant");
      expect(
        tf.changed(
          () => tf.getRunner(state).credit,
          2,
          () => {
            runJackson();
            tf.clickPrompt(state, "runner", "Yes");
          },
        ),
      ).toBe(true);
      expect(tf.noPrompt(state, "runner")).toBe(true);

      // Set second to Never
      tf.cardAbility(state, "runner", tf.getResource(state, 1), 0);
      tf.clickPrompt(state, "runner", "Never");
      expect(
        tf.changed(() => tf.getRunner(state).credit, 1, () => runJackson()),
      ).toBe(true);
      expect(tf.noPrompt(state, "runner")).toBe(true);
    });
  });

  it("autoresolve-fisk-ftt-with-and-without-autoresolve", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { deck: tf.qty("Archer", 30) },
        runner: {
          id: "Laramy Fisk: Savvy Investor",
          deck: ["Find the Truth"],
        },
      });
      tf.takeCredits(state, "corp");
      tf.clickCard(state, "corp", tf.getCorp(state).hand[0]);
      tf.playFromHand(state, "runner", "Find the Truth");

      const setFttAutoresolve = (setting: string) => {
        tf.cardAbility(state, "runner", tf.getResource(state, 0), 0);
        tf.clickPrompt(state, "runner", setting);
      };
      const setFiskAutoresolve = (setting: string) => {
        tf.cardAbility(state, "runner", state.runner.identity, 0);
        tf.clickPrompt(state, "runner", setting);
      };
      const passTurnRunnerCorp = () => {
        tf.takeCredits(state, "runner");
        tf.startingHand(state, "corp", ["Archer"]);
        tf.takeCredits(state, "corp");
      };

      // With nothing done, both prompt on central run
      tf.runEmptyServer(state, "Archives");
      expect(
        tf.changed(
          () => tf.getCorp(state).hand.length,
          1,
          () => {
            tf.clickPrompt(
              state,
              "runner",
              "Laramy Fisk: Savvy Investor",
            );
            tf.clickPrompt(state, "runner", "Yes");
          },
        ),
      ).toBe(true);
      tf.clickPrompt(state, "runner", "Yes");
      tf.clickPrompt(state, "runner", "OK");

      setFiskAutoresolve("Ask");
      passTurnRunnerCorp();
      tf.runEmptyServer(state, "Archives");
      expect(
        tf.changed(
          () => tf.getCorp(state).hand.length,
          1,
          () => {
            tf.clickPrompt(
              state,
              "runner",
              "Laramy Fisk: Savvy Investor",
            );
            tf.clickPrompt(state, "runner", "Yes");
          },
        ),
      ).toBe(true);
      tf.clickPrompt(state, "runner", "Yes");
      tf.clickPrompt(state, "runner", "OK");
      setFiskAutoresolve("Ask");
      passTurnRunnerCorp();

      // FTT never - no simult resolution
      setFiskAutoresolve("Ask");
      setFttAutoresolve("Never");
      expect(tf.noPrompt(state, "runner")).toBe(true);
      tf.runEmptyServer(state, "Archives");
      expect(
        state.runner.prompt[0].card.title,
      ).toBe("Laramy Fisk: Savvy Investor");
      tf.clickPrompt(state, "runner", "No");
      expect(tf.noPrompt(state, "runner")).toBe(true);
      passTurnRunnerCorp();

      // Fisk never, FTT always
      setFiskAutoresolve("Never");
      setFttAutoresolve("Always");
      tf.runEmptyServer(state, "Archives");
      tf.clickPrompt(state, "runner", "OK");
      expect(tf.noPrompt(state, "runner")).toBe(true);
      passTurnRunnerCorp();

      // Fisk always, FTT Ask
      setFiskAutoresolve("Always");
      setFttAutoresolve("Ask");
      tf.runEmptyServer(state, "Archives");
      tf.clickPrompt(state, "runner", "Find the Truth");
      tf.clickPrompt(state, "runner", "Yes");
      expect(
        tf.changed(
          () => tf.getCorp(state).hand.length,
          1,
          () => tf.clickPrompt(state, "runner", "OK"),
        ),
      ).toBe(true);
      expect(tf.noPrompt(state, "runner")).toBe(true);
    });
  });

  it("autoresolve-ensure-autoresolve-does-not-break-prompts-with-a-req", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          id: "SSO Industries: Fueling Innovation",
          deck: ["Underway Renovation", ...tf.qty("Ice Wall", 3)],
        },
      });
      const toggleSSO = (setting: string) => {
        tf.cardAbility(state, "corp", state.corp.identity, 0);
        tf.clickPrompt(state, "corp", setting);
      };

      toggleSSO("Always");
      tf.playFromHand(state, "corp", "Underway Renovation", "New remote");
      tf.takeCredits(state, "corp");
      expect(tf.noPrompt(state, "corp")).toBe(true);
      tf.takeCredits(state, "runner");
      tf.playFromHand(state, "corp", "Ice Wall", "New remote");
      toggleSSO("Never");
      tf.takeCredits(state, "corp");
      expect(tf.noPrompt(state, "corp")).toBe(true);
      tf.takeCredits(state, "runner");
      toggleSSO("Always");
      tf.takeCredits(state, "corp");
      const prompt = tf.getPromptMap(state, "corp");
      expect(prompt.msg).toBe(
        "Choose a piece of ice with no advancement counters to place 1 advancement counter on",
      );
      tf.clickCard(state, "corp", tf.getIce(state, "remote2", 0));
      expect(
        tf.getCounters(tf.getIce(state, "remote2", 0), "advancement"),
      ).toBe(1);
      expect(tf.noPrompt(state, "corp")).toBe(true);
      tf.takeCredits(state, "runner");
      tf.takeCredits(state, "corp");
      expect(tf.noPrompt(state, "corp")).toBe(true);
    });
  });

  it("autoresolve-ctm-autoresolve", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          id: "NBN: Controlling the Message",
          deck: tf.qty("Rashida Jaheem", 3),
        },
      });
      const toggleCtm = (setting: string) => {
        tf.cardAbility(state, "corp", state.corp.identity, 0);
        tf.clickPrompt(state, "corp", setting);
      };

      tf.playFromHand(state, "corp", "Rashida Jaheem", "New remote");
      tf.playFromHand(state, "corp", "Rashida Jaheem", "New remote");
      tf.playFromHand(state, "corp", "Rashida Jaheem", "New remote");
      tf.takeCredits(state, "corp");
      toggleCtm("Ask");
      tf.runEmptyServer(state, "Server 1");
      tf.clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
      tf.clickPrompt(state, "corp", "Yes");
      tf.clickPrompt(state, "corp", "0");
      tf.clickPrompt(state, "runner", "0");
      tf.takeCredits(state, "runner");
      tf.takeCredits(state, "corp");
      toggleCtm("Always");
      tf.runEmptyServer(state, "Server 2");
      tf.clickPrompt(state, "runner", "Pay 1 [Credits] to trash");
      tf.clickPrompt(state, "corp", "0");
      tf.clickPrompt(state, "runner", "0");
      expect(tf.noPrompt(state, "corp")).toBe(true);
      expect(tf.noPrompt(state, "runner")).toBe(true);
    });
  });

  it("no-scoring-after-terminal", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          deck: tf.qty("Hedge Fund", 5),
          hand: ["IPO", "Hostile Takeover"],
          credits: 15,
        },
      });
      tf.gain(state, "corp", "click", 1);
      tf.playFromHand(state, "corp", "Hostile Takeover", "New remote");
      const ht = tf.getContent(state, "remote1", 0);
      tf.advance(ht, 2);
      const credits = tf.getCorp(state).credit;
      tf.playFromHand(state, "corp", "IPO");
      expect(tf.getCorp(state).credit).toBe(credits + 5);
      tf.score(state, "corp", core.getCard(state, ht));
      expect(core.getCard(state, ht)).toBeDefined();
      tf.takeCredits(state, "corp");
      tf.takeCredits(state, "runner");
      tf.score(state, "corp", core.getCard(state, ht));
      expect(core.getCard(state, ht)).toBeNull();
      expect(tf.getTitle(tf.getScored(state, "corp", 0))).toBe("Hostile Takeover");
    });
  });

  it("clearing-currents: Runner doesn't take damage from clearing current", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          deck: tf.qty("Hedge Fund", 5),
          hand: [
            "Hostile Infrastructure",
            "Surveillance Sweep",
            "Hostile Takeover",
          ],
          credits: 10,
        },
        runner: {
          id: "Leela Patel: Trained Pragmatist",
          hand: ['Corporate "Grant"', ...tf.qty("Sure Gamble", 2)],
        },
      });
      tf.playFromHand(state, "corp", "Hostile Infrastructure", "New remote");
      tf.rez(state, "corp", tf.getContent(state, "remote1", 0));
      tf.playFromHand(state, "corp", "Surveillance Sweep");
      tf.takeCredits(state, "corp");
      tf.playFromHand(state, "runner", 'Corporate "Grant"');
      expect(tf.getRunner(state).hand.length).toBe(2);
    });
  });

  it("simultaneous-trash-effects", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          deck: tf.qty("Hedge Fund", 5),
          hand: [
            "Hostile Infrastructure",
            "Marilyn Campaign",
            "Calvin B4L3Y",
          ],
          credits: 20,
        },
        runner: { hand: ["Apocalypse"] },
      });
      tf.playFromHand(state, "corp", "Hostile Infrastructure", "New remote");
      tf.playFromHand(state, "corp", "Marilyn Campaign", "New remote");
      tf.playFromHand(state, "corp", "Calvin B4L3Y", "New remote");
      tf.rez(state, "corp", tf.getContent(state, "remote1", 0));
      tf.rez(state, "corp", tf.getContent(state, "remote2", 0));
      tf.rez(state, "corp", tf.getContent(state, "remote3", 0));
      tf.takeCredits(state, "corp");
      tf.runEmptyServer(state, "Archives");
      tf.runEmptyServer(state, "R&D");
      tf.clickPrompt(state, "runner", "No action");
      tf.runEmptyServer(state, "HQ");
      tf.playFromHand(state, "runner", "Apocalypse");
      const titles = new Set(tf.promptTitles(state, "corp"));
      expect(titles.has("Shuffle Marilyn Campaign into R&D")).toBe(true);
      expect(titles.has("Continue trashing 3 cards")).toBe(true);
      tf.clickPrompt(state, "corp", "Shuffle Marilyn Campaign into R&D");
      const titles2 = new Set(tf.promptTitles(state, "corp"));
      expect(titles2.has("Done")).toBe(true);
      expect(titles2.has("Hostile Infrastructure")).toBe(true);
      expect(titles2.has("Calvin B4L3Y")).toBe(true);
      tf.clickPrompt(state, "corp", "Calvin B4L3Y");
      tf.clickPrompt(state, "corp", "Yes");
    });
  });

  it("events-after-derez: Event triggered but card derezzed", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          deck: tf.qty("Hedge Fund", 5),
          hand: ["Kakugo"],
        },
        runner: { hand: ["Saker"], credits: 10 },
      });
      tf.playFromHand(state, "corp", "Kakugo", "HQ");
      tf.takeCredits(state, "corp");
      tf.playFromHand(state, "runner", "Saker");
      tf.runOn(state, "HQ");
      tf.rez(state, "corp", tf.getIce(state, "hq", 0));
      tf.runContinue(state);
      tf.cardAbility(state, "runner", tf.getProgram(state, 0), 0);
      tf.clickPrompt(state, "runner", "End the run");
      tf.cardAbility(state, "runner", tf.getProgram(state, 0), 2);
      tf.runContinue(state);
      expect(tf.getRunner(state).hand.length).toBe(1);
    });
  });

  it("start-of-turn-phase-12: phase-1.2 checks derezzed cards", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          deck: tf.qty("Hedge Fund", 5),
          hand: ["Rashida Jaheem"],
        },
        runner: { hand: ["Security Testing"] },
      });
      tf.playFromHand(state, "corp", "Rashida Jaheem", "New remote");
      tf.takeCredits(state, "corp");
      tf.playFromHand(state, "runner", "Security Testing");
      const secTest = tf.getResource(state, 0);
      core.setProperty(state, "runner", "facedown", true, secTest);
      tf.takeCredits(state, "runner");
      expect(state.corpPhase12).toBe(true);
      tf.endPhase12(state, "corp");
      tf.takeCredits(state, "corp");
      expect(state.runnerPhase12).toBe(false);
    });
  });

  it("move-removes-icon: Moving marked ice to HQ removes icon", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: {
          deck: tf.qty("Hedge Fund", 5),
          hand: ["Project Yagi-Uda", "Ice Wall", "Enigma"],
          credits: 10,
        },
        runner: { hand: ["Boomerang"] },
      });
      tf.playFromHand(state, "corp", "Ice Wall", "HQ");
      tf.playAndScore(state, "Project Yagi-Uda");
      tf.takeCredits(state, "corp");
      tf.playFromHand(state, "runner", "Boomerang");
      const icew = tf.getIce(state, "hq", 0);
      const yagi = tf.getScored(state, "corp", 0);
      tf.clickCard(state, "runner", icew);
      tf.runOn(state, "hq");
      const yagiRefreshed = core.getCard(state, yagi);
      if (yagiRefreshed.counter) {
        yagiRefreshed.counter.agenda = 1;
      } else {
        yagiRefreshed.counter = { agenda: 1 };
      }
      core.fakeCheckpoint(state);
      tf.cardAbility(state, "corp", core.getCard(state, yagi), 0);
      tf.clickCard(state, "corp", icew);
      tf.clickCard(state, "corp", "Enigma");
      const iwallInHand = tf.findCard("Ice Wall", tf.getCorp(state).hand);
      expect(iwallInHand.icon).toBeUndefined();
    });
  });

  it("runner-forced-to-discard-below-hand-size-ends-the-game", () => {
    tf.doGame((state) => {
      tf.newGame(state, {
        corp: { hand: ["Brainstorm"], credits: 20 },
        runner: { hand: tf.qty("Sure Gamble", 8) },
      });
      tf.playFromHand(state, "corp", "Brainstorm", "HQ");
      tf.takeCredits(state, "corp");
      tf.runOn(state, "hq");
      const bs = tf.getIce(state, "hq", 0);
      tf.rez(state, "corp", bs);
      expect(
        tf.changed(
          () => tf.getRunner(state).brainDamage,
          8,
          () => {
            tf.runContinueUntil(state, "encounter-ice");
            tf.fireSubs(state, core.getCard(state, bs));
          },
        ),
      ).toBe(true);
      expect(tf.handSize(state, "runner")).toBe(-3);
      expect(state.winner).toBeUndefined();
      tf.runContinueUntil(state, "success");
      tf.takeCredits(state, "runner");
      expect(state.winner).toBe("corp");
    });
  });
});
