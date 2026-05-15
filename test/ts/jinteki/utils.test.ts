// Tests for jinteki/utils.ts
// Mirrors: src/cljc/jinteki/utils.cljc tests
import { describe, it, expect } from "vitest";
import { INFINITY, factionLabel, otherSide, slugify, superuser, capitalize, decapitalize } from "../../../src/ts/jinteki/utils";

describe("INFINITY", () => {
  it("equals 2147483647", () => {
    expect(INFINITY).toBe(2147483647);
  });
});

describe("factionLabel", () => {
  it("returns neutral for missing faction", () => {
    expect(factionLabel({})).toBe("neutral");
    expect(factionLabel({ faction: undefined })).toBe("neutral");
  });

  it("lowercases and hyphenates faction names", () => {
    expect(factionLabel({ faction: "Haas-Bioroid" })).toBe("haas-bioroid");
    expect(factionLabel({ faction: "Weyland Consortium" })).toBe("weyland-consortium");
    expect(factionLabel({ faction: "NBN" })).toBe("nbn");
  });
});

describe("otherSide", () => {
  it("returns runner for corp", () => {
    expect(otherSide("corp")).toBe("runner");
  });
  it("returns corp for runner", () => {
    expect(otherSide("runner")).toBe("corp");
  });
  it("returns null for unknown", () => {
    expect(otherSide("spectator")).toBeNull();
  });
});

describe("slugify", () => {
  it("converts to lowercase slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips punctuation", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("uses custom separator", () => {
    expect(slugify("Hello World", "_")).toBe("hello_world");
  });

  it("returns empty for non-string", () => {
    expect(slugify(null as unknown as string)).toBe("");
  });

  it("strips leading/trailing whitespace", () => {
    expect(slugify("  hello  ")).toBe("hello");
  });
});

describe("superuser", () => {
  it("returns true for admin", () => {
    expect(superuser({ isadmin: true })).toBe(true);
  });
  it("returns true for moderator", () => {
    expect(superuser({ ismoderator: true })).toBe(true);
  });
  it("returns false for regular user", () => {
    expect(superuser({})).toBe(false);
  });
});

describe("capitalize", () => {
  it("uppercases first character", () => {
    expect(capitalize("hello")).toBe("Hello");
  });
  it("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });
});

describe("decapitalize", () => {
  it("lowercases first character", () => {
    expect(decapitalize("Hello")).toBe("hello");
  });
  it("handles empty string", () => {
    expect(decapitalize("")).toBe("");
  });
});
