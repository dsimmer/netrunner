import { describe, it, expect } from "vitest";
import * as core from "@/game/core";
import {
  newGame,
  countTags,
  countRealTags,
  countBadPub,
  getLink,
  change,
} from "../test_framework/index";

describe("change - base vs additional", () => {
  it("Bad Publicity", () => {
    const state = newGame();
    expect(countBadPub(state)).toBe(0); // Corp starts with 0 bad pub
    change(state, "corp", "bad-publicity", 1);
    expect(countBadPub(state)).toBe(1); // Corp has gained 1 bad pub
    expect((state.corp.badPublicity as any)?.base).toBe(1); // Only gained in the base
    expect((state.corp.badPublicity as any)?.additional).toBe(0); // Only gained in the base
    change(state, "corp", "bad-publicity", -1);
    expect(countBadPub(state)).toBe(0); // Corp has lost 1 bad pub
    expect((state.corp.badPublicity as any)?.base).toBe(0); // Only lost in the base
    expect((state.corp.badPublicity as any)?.additional).toBe(0); // No change on loss either
  });

  it("Tags", () => {
    const state = newGame();
    expect(countTags(state)).toBe(0); // Runner starts with 0 tags
    expect(countRealTags(state)).toBe(0);
    change(state, "runner", "tag", 1);
    expect(countTags(state)).toBe(1); // Runner has gained 1 tag
    expect(countRealTags(state)).toBe(1);
    change(state, "runner", "tag", -1);
    expect(countTags(state)).toBe(0); // Runner has lost 1 tag
    expect(countRealTags(state)).toBe(0);
  });
});

describe("change - generic changes", () => {
  it("Agenda points", () => {
    const state = newGame();
    expect(state.corp.agendaPoint).toBe(0); // Corp starts with 0 agenda points
    change(state, "corp", "agenda-point", 1);
    expect(state.corp.agendaPoint).toBe(1); // Corp has gained 1 agenda point
    change(state, "corp", "agenda-point", -1);
    expect(state.corp.agendaPoint).toBe(0); // Corp has lost 1 agenda point
    change(state, "corp", "agenda-point", -1);
    expect(state.corp.agendaPoint).toBe(-1); // Corp can go below 0 agenda points
  });

  it("Link", () => {
    const state = newGame();
    expect(getLink(state)).toBe(0); // Runner starts with 0 link
    change(state, "runner", "link", 1);
    expect(getLink(state)).toBe(1); // Runner has gained 1 link
    change(state, "runner", "link", -1);
    expect(getLink(state)).toBe(0); // Runner has lost 1 link
    change(state, "runner", "link", -1);
    expect(getLink(state)).toBe(-1); // Runner can go below 0 link
  });

  it("Hand size", () => {
    const state = newGame();
    expect(core.handSizeTotal(state, "runner")).toBe(5); // Runner starts with 5 hand size
    change(state, "runner", "hand-size", 1);
    expect(core.handSizeTotal(state, "runner")).toBe(6); // Runner has gained 1 hand size
    change(state, "runner", "hand-size", -1);
    expect(core.handSizeTotal(state, "runner")).toBe(5); // Runner has lost 1 hand size
    change(state, "runner", "hand-size", -6);
    expect(core.handSizeTotal(state, "runner")).toBeLessThan(0); // Runner has negative hand size
  });

  it("Memory", () => {
    const state = newGame();
    expect(core.availableMu(state)).toBe(4); // Runner starts with 4 MU
    change(state, "runner", "memory", 1);
    expect(core.availableMu(state)).toBe(5); // Runner has gained 1 memory
    change(state, "runner", "memory", -1);
    expect(core.availableMu(state)).toBe(4); // Runner has lost 1 memory
    change(state, "runner", "memory", -6);
    expect(core.availableMu(state)).toBeLessThan(0); // Runner has negative memory
  });
});
