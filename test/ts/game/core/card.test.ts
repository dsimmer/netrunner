import { describe, it, beforeEach, expect } from "vitest";
import { hasSubtype, hasAnySubtype, hasAllSubtypes } from "../../../../src/ts/game/core/card";
import type { Card } from "../../../../src/ts/game/core/card";

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
    expect(hasSubtype(contaminate, "Run")).toBeFalsy();
  });

  it("one subtype matches", () => {
    expect(hasSubtype(stimhack, "Run")).toBeTruthy();
  });

  it("one subtype does not match different subtype", () => {
    expect(hasSubtype(stimhack, "Mod")).toBeFalsy();
  });

  it("multiple subtypes matches first", () => {
    expect(hasSubtype(laamb, "Icebreaker")).toBeTruthy();
  });

  it("multiple subtypes matches second", () => {
    expect(hasSubtype(laamb, "Fracter")).toBeTruthy();
  });

  it("multiple subtypes does not match non-existent subtype", () => {
    expect(hasSubtype(stimhack, "Mod")).toBeFalsy();
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
    expect(hasAnySubtype(stimhack, ["Test", "Two", "Run"])).toBe(true);
  });

  it("multiple are present but not all returns true", () => {
    expect(hasAnySubtype(laamb, ["Test", "Two", "Icebreaker", "Fracter", "False"])).toBe(true);
  });

  it("none are present returns false", () => {
    expect(hasAnySubtype(contaminate, ["Test", "Two", "Icebreaker", "Fracter", "False"])).toBe(false);
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
    expect(hasAllSubtypes(stimhack, ["Run"])).toBe(true);
  });

  it("card with one subtype does not match multiple subtypes", () => {
    expect(hasAllSubtypes(stimhack, ["Test", "Two", "Run"])).toBe(false);
  });

  it("card with two subtypes matches both subtypes", () => {
    expect(hasAllSubtypes(laamb, ["Icebreaker", "Fracter"])).toBe(true);
  });

  it("card with two subtypes matches single subtype", () => {
    expect(hasAllSubtypes(laamb, ["Icebreaker"])).toBe(true);
  });

  it("card with two subtypes does not match three subtypes", () => {
    expect(hasAllSubtypes(laamb, ["Icebreaker", "Fracter", "Test"])).toBe(false);
  });

  it("card with no subtypes does not match any subtypes", () => {
    expect(hasAllSubtypes(contaminate, ["Test", "Two", "Icebreaker", "Fracter", "False"])).toBe(false);
  });
});
