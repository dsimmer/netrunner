import { describe, it, expect } from "vitest";
import { parseInput, readableUrl } from "@/web/nrdb";

describe("parseInput", () => {
  it("public decklist URL with slug", () => {
    expect(
      parseInput(
        "https://netrunnerdb.com/en/decklist/d8888676-f12e-4fa1-a531-9284a06a9ad0/tread-loudly-5th-at-worlds-2025",
      ),
    ).toEqual(["public", "d8888676-f12e-4fa1-a531-9284a06a9ad0"]);
  });

  it("public decklist URL without slug", () => {
    expect(
      parseInput(
        "https://netrunnerdb.com/en/decklist/d8888676-f12e-4fa1-a531-9284a06a9ad0",
      ),
    ).toEqual(["public", "d8888676-f12e-4fa1-a531-9284a06a9ad0"]);
  });

  it("public decklist URL with numeric id", () => {
    expect(
      parseInput("https://netrunnerdb.com/en/decklist/92324"),
    ).toEqual(["public", "92324"]);
  });

  it("private deck URL", () => {
    expect(
      parseInput(
        "https://netrunnerdb.com/en/deck/view/95db310b-79e7-4bf0-8e4e-e643cb7f6c95",
      ),
    ).toEqual(["private", "95db310b-79e7-4bf0-8e4e-e643cb7f6c95"]);
  });

  it("bare id", () => {
    expect(parseInput("12345")).toEqual(["unknown", "12345"]);
  });
});

describe("readableUrl", () => {
  it("public endpoint generates decklist URL", () => {
    expect(readableUrl("public", "92324")).toBe(
      "https://netrunnerdb.com/en/decklist/92324",
    );
  });

  it("private endpoint generates deck/view URL", () => {
    expect(
      readableUrl("private", "95db310b-79e7-4bf0-8e4e-e643cb7f6c95"),
    ).toBe(
      "https://netrunnerdb.com/en/deck/view/95db310b-79e7-4bf0-8e4e-e643cb7f6c95",
    );
  });

  it("unknown endpoint defaults to decklist URL", () => {
    expect(readableUrl("unknown", "12345")).toBe(
      "https://netrunnerdb.com/en/decklist/12345",
    );
  });
});
