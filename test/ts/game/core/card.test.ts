import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { hasSubtype, hasAnySubtype, hasAllSubtypes } from "../../../../src/ts/game/core/card.ts";
import type { Card } from "../../../../src/ts/game/core/card.ts";

describe("hasSubtype", () => {
  let contaminate: Card;
  let stimhack: Card;
  let laamb: Card;

  beforeEach(() => {
    contaminate = { cid: "test-contaminate", subtypes: [] };
    stimhack = { cid: "test-stimhack", subtypes: ["Run"] };
    laamb = { cid: "test-laamb", subtypes: ["Icebreaker", "Fracter"] };
  });

  it("no subtypes returns undefined", () => {
    assert(!hasSubtype(contaminate, "Run"));
  });

  it("one subtype matches", () => {
    assert(hasSubtype(stimhack, "Run"));
  });

  it("one subtype does not match different subtype", () => {
    assert(!hasSubtype(stimhack, "Mod"));
  });

  it("multiple subtypes matches first", () => {
    assert(hasSubtype(laamb, "Icebreaker"));
  });

  it("multiple subtypes matches second", () => {
    assert(hasSubtype(laamb, "Fracter"));
  });

  it("multiple subtypes does not match non-existent subtype", () => {
    assert(!hasSubtype(stimhack, "Mod"));
  });
});

describe("hasAnySubtype", () => {
  let contaminate: Card;
  let stimhack: Card;
  let laamb: Card;

  beforeEach(() => {
    contaminate = { cid: "test-contaminate", subtypes: [] };
    stimhack = { cid: "test-stimhack", subtypes: ["Run"] };
    laamb = { cid: "test-laamb", subtypes: ["Icebreaker", "Fracter"] };
  });

  it("one is present returns true", () => {
    assert(hasAnySubtype(stimhack, ["Test", "Two", "Run"]));
  });

  it("multiple are present but not all returns true", () => {
    assert(hasAnySubtype(laamb, ["Test", "Two", "Icebreaker", "Fracter", "False"]));
  });

  it("none are present returns false", () => {
    assert(!hasAnySubtype(contaminate, ["Test", "Two", "Icebreaker", "Fracter", "False"]));
  });
});

describe("hasAllSubtypes", () => {
  let contaminate: Card;
  let stimhack: Card;
  let laamb: Card;

  beforeEach(() => {
    contaminate = { cid: "test-contaminate", subtypes: [] };
    stimhack = { cid: "test-stimhack", subtypes: ["Run"] };
    laamb = { cid: "test-laamb", subtypes: ["Icebreaker", "Fracter"] };
  });

  it("card with one subtype matches single subtype", () => {
    assert(hasAllSubtypes(stimhack, ["Run"]));
  });

  it("card with one subtype does not match multiple subtypes", () => {
    assert(!hasAllSubtypes(stimhack, ["Test", "Two", "Run"]));
  });

  it("card with two subtypes matches both subtypes", () => {
    assert(hasAllSubtypes(laamb, ["Icebreaker", "Fracter"]));
  });

  it("card with two subtypes matches single subtype", () => {
    assert(hasAllSubtypes(laamb, ["Icebreaker"]));
  });

  it("card with two subtypes does not match three subtypes", () => {
    assert(!hasAllSubtypes(laamb, ["Icebreaker", "Fracter", "Test"]));
  });

  it("card with no subtypes does not match any subtypes", () => {
    assert(!hasAllSubtypes(contaminate, ["Test", "Two", "Icebreaker", "Fracter", "False"]));
  });
});
