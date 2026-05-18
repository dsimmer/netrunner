import { describe, it, expect } from "vitest";
import { validUsername, characterLength, withinCharLimitUsername } from "@/web/user";

// ---- validUsername tests (mirrors valid-username?-test) ----

describe("validUsername", () => {
  it("accepts a normal username", () => {
    expect(validUsername("test")).toBe(true);
  });

  it("rejects a username with more than 20 characters", () => {
    expect(validUsername("abcdefghijklmnopqrstu")).toBe(false);
  });

  it("accepts a username with exactly 20 characters", () => {
    expect(validUsername("abcdefghijklmnopqrst")).toBe(true);
  });

  it("accepts emoji in usernames", () => {
    expect(validUsername("\u{1F438}")).toBe(true);
  });

  it("accepts 20 emoji glyphs as valid", () => {
    const twentyFrogs = "\u{1F438}".repeat(20);
    expect(validUsername(twentyFrogs)).toBe(true);
  });

  it("accepts HTML-like text that does not close a tag", () => {
    expect(validUsername('<script src="t.js"')).toBe(true);
  });

  it("rejects usernames containing closing HTML tags", () => {
    expect(validUsername("<h1>hello</h1>")).toBe(false);
  });

  it("rejects usernames containing URLs", () => {
    expect(validUsername("http://example.org")).toBe(false);
  });
});

// ---- characterLength tests ----

describe("characterLength", () => {
  it("counts ASCII characters correctly", () => {
    expect(characterLength("hello")).toBe(5);
  });

  it("counts emoji as single characters via grapheme iteration", () => {
    expect(characterLength("\u{1F438}")).toBe(1);
  });

  it("counts a mix of ASCII and emoji correctly", () => {
    expect(characterLength("a\u{1F438}b")).toBe(3);
  });
});

// ---- withinCharLimitUsername tests ----

describe("withinCharLimitUsername", () => {
  it("returns true for a 20-character username", () => {
    expect(withinCharLimitUsername("abcdefghijklmnopqrst")).toBe(true);
  });

  it("returns false for a 21-character username", () => {
    expect(withinCharLimitUsername("abcdefghijklmnopqrstu")).toBe(false);
  });

  it("returns true for 20 emoji glyphs", () => {
    const twentyFrogs = "\u{1F438}".repeat(20);
    expect(withinCharLimitUsername(twentyFrogs)).toBe(true);
  });

  it("returns false for 21 emoji glyphs", () => {
    const twentyOneFrogs = "\u{1F438}".repeat(21);
    expect(withinCharLimitUsername(twentyOneFrogs)).toBe(false);
  });
});
