import { describe, it, expect } from "vitest";
import { isFaceup, isFacedown } from "@/game/core/card";
import {
  makeCID,
  makeTimestamp,
  safeZero,
  removeOnce,
  toKeyword,
  distinctBy,
  stringToNum,
  dissocIn,
  usedThisTurn,
  sideStr,
  sameSide,
  sameCard,
  pluralize,
  quantify,
  enumerateStr,
  enumerateCards,
  inColl,
  positions,
  serverCard,
  serverCards,
  setAllCards,
  getAllCards,
} from "@/game/utils";

describe("Card faceup/facedown predicates", () => {
  it("is a faceup card when seen is true", () => {
    const card = { cid: "test-cid", seen: true, facedown: false };
    expect(isFaceup(card)).toBe(true);
  });

  it("is a faceup card when rezzed is true", () => {
    const card = { cid: "test-cid", rezzed: true };
    expect(isFaceup(card)).toBe(true);
  });

  it("is not a faceup card when facedown is true", () => {
    const card = { cid: "test-cid", facedown: true };
    expect(isFaceup(card)).toBe(false);
  });

  it("is not a faceup card when seen and rezzed are false", () => {
    const card = { cid: "test-cid", seen: false, rezzed: false };
    expect(isFaceup(card)).toBe(false);
  });

  it("is a face down card when facedown is true", () => {
    const card = { cid: "test-cid", facedown: true };
    expect(isFacedown(card)).toBe(true);
  });

  it("is not a face down card when facedown is false", () => {
    const card = { cid: "test-cid", facedown: false };
    expect(isFacedown(card)).toBe(false);
  });

  it("is not a face down card when facedown is undefined", () => {
    const card = { cid: "test-cid" };
    expect(isFacedown(card)).toBe(false);
  });

  it("is not facedown for null", () => {
    expect(isFacedown(null)).toBe(false);
  });

  it("is not faceup for null", () => {
    expect(isFaceup(null)).toBe(false);
  });
});

describe("makeCID", () => {
  it("generates a valid UUID string", () => {
    const cid = makeCID();
    expect(typeof cid).toBe("string");
    expect(cid.length).toBe(36);
  });

  it("generates unique CIDs", () => {
    const cid1 = makeCID();
    const cid2 = makeCID();
    expect(cid1).not.toBe(cid2);
  });
});

describe("makeTimestamp", () => {
  it("returns a Date object", () => {
    const ts = makeTimestamp();
    expect(ts instanceof Date).toBe(true);
  });
});

describe("safeZero", () => {
  it("returns true for 0", () => {
    expect(safeZero(0)).toBe(true);
  });

  it("returns false for non-zero numbers", () => {
    expect(safeZero(1)).toBe(false);
    expect(safeZero(-1)).toBe(false);
  });

  it("returns false for null", () => {
    expect(safeZero(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(safeZero(undefined)).toBe(false);
  });

  it("returns false for strings", () => {
    expect(safeZero("0")).toBe(false);
    expect(safeZero("hello")).toBe(false);
  });
});

describe("removeOnce", () => {
  it("removes the first matching element", () => {
    expect(removeOnce((x: number) => x === 2, [1, 2, 3, 2, 4])).toEqual([
      1, 3, 2, 4,
    ]);
  });

  it("returns the same array if no match", () => {
    const arr = [1, 2, 3];
    expect(removeOnce((x: number) => x === 99, arr)).toBe(arr);
  });

  it("handles empty array", () => {
    expect(removeOnce((x: number) => x === 1, [])).toEqual([]);
  });
});

describe("toKeyword", () => {
  it("converts [Credits] to credit", () => {
    expect(toKeyword("[Credits]")).toBe("credit");
  });

  it("lowercases strings", () => {
    expect(toKeyword("Hello")).toBe("hello");
  });

  it("converts non-strings to string", () => {
    expect(toKeyword(42 as any)).toBe("42");
  });
});

describe("distinctBy", () => {
  it("removes duplicates by key function", () => {
    const items = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 1, name: "c" },
    ];
    const result = distinctBy((x: typeof items[0]) => x.id, items);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("a");
    expect(result[1].name).toBe("b");
  });

  it("returns empty array for empty input", () => {
    expect(distinctBy((x: number) => x, [])).toEqual([]);
  });
});

describe("stringToNum", () => {
  it("parses valid number strings", () => {
    expect(stringToNum("42")).toBe(42);
    expect(stringToNum("3.14")).toBeCloseTo(3.14);
  });

  it("returns null for non-numeric strings", () => {
    expect(stringToNum("abc")).toBeNull();
  });

  it("returns 0 for empty string (JS Number(\"\") behavior)", () => {
    expect(stringToNum("")).toBe(0);
  });
});

describe("dissocIn", () => {
  it("removes a top-level key", () => {
    expect(dissocIn({ a: 1, b: 2 }, ["a"])).toEqual({ b: 2 });
  });

  it("removes a nested key", () => {
    expect(dissocIn({ a: { b: 1, c: 2 } }, ["a", "b"])).toEqual({ a: { c: 2 } });
  });

  it("removes parent object when it becomes empty", () => {
    expect(dissocIn({ a: { b: 1 } }, ["a", "b"])).toEqual({});
  });

  it("returns original when key not found", () => {
    expect(dissocIn({ a: 1 }, ["b"])).toEqual({ a: 1 });
  });

  it("handles empty key path", () => {
    const obj = { a: 1 };
    expect(dissocIn(obj, [])).toBe(obj);
  });
});

describe("usedThisTurn", () => {
  it("returns true when cid is in perTurn", () => {
    const state = { perTurn: { "cid-1": true, "cid-2": true } };
    expect(usedThisTurn(state as any, "cid-1")).toBe(true);
  });

  it("returns false when cid is not in perTurn", () => {
    const state = { perTurn: { "cid-1": true } };
    expect(usedThisTurn(state as any, "cid-99")).toBe(false);
  });

  it("returns false when perTurn is empty", () => {
    const state = { perTurn: {} };
    expect(usedThisTurn(state as any, "cid-1")).toBe(false);
  });
});

describe("sideStr", () => {
  it("normalizes corp variants", () => {
    expect(sideStr("corp")).toBe("Corp");
    expect(sideStr("Corp")).toBe("Corp");
    expect(sideStr(":corp")).toBe("Corp");
  });

  it("normalizes runner variants", () => {
    expect(sideStr("runner")).toBe("Runner");
    expect(sideStr("Runner")).toBe("Runner");
    expect(sideStr(":runner")).toBe("Runner");
  });
});

describe("sameSide", () => {
  it("returns true for same sides", () => {
    expect(sameSide("corp", "Corp")).toBe(true);
    expect(sameSide("runner", "Runner")).toBe(true);
  });

  it("returns false for different sides", () => {
    expect(sameSide("corp", "runner")).toBe(false);
  });
});

describe("sameCard", () => {
  it("returns true for cards with same cid", () => {
    const c1 = { cid: "abc" };
    const c2 = { cid: "abc" };
    expect(sameCard(c1, c2)).toBe(true);
  });

  it("returns false for cards with different cids", () => {
    const c1 = { cid: "abc" };
    const c2 = { cid: "def" };
    expect(sameCard(c1, c2)).toBe(false);
  });

  it("returns false when either card is null", () => {
    expect(sameCard(null, { cid: "abc" })).toBe(false);
    expect(sameCard({ cid: "abc" }, null)).toBe(false);
  });

  it("accepts a comparison function", () => {
    const c1 = { title: "Ace", cid: "1" };
    const c2 = { title: "Ace", cid: "2" };
    const fn = (c: typeof c1) => c.title;
    expect(sameCard(fn, c1, c2)).toBe(true);
  });
});

describe("pluralize", () => {
  it("returns singular (no suffix) for n=1", () => {
    expect(pluralize("card", 1)).toBe("card");
  });

  it("returns plural with 's' suffix for n=2", () => {
    expect(pluralize("card", 2)).toBe("cards");
  });

  it("returns singular for n=-1", () => {
    expect(pluralize("card", -1)).toBe("card");
  });

  it("uses custom plural suffix", () => {
    expect(pluralize("box", 2, "es")).toBe("boxes");
  });

  it("uses separate singular and plural suffixes with 4 args", () => {
    expect(pluralize("child", "", "ren", 2)).toBe("children");
    expect(pluralize("child", "", "ren", 1)).toBe("child");
  });

  it("uses ox/oxen pattern", () => {
    expect(pluralize("ox", "", "en", 1)).toBe("ox");
    expect(pluralize("ox", "", "en", 2)).toBe("oxen");
  });
});

describe("quantify", () => {
  it("returns singular form for 1", () => {
    expect(quantify(1, "card")).toBe("1 card");
  });

  it("returns plural form for 2", () => {
    expect(quantify(2, "card")).toBe("2 cards");
  });

  it("uses custom suffix", () => {
    expect(quantify(2, "child", "ren")).toBe("2 children");
  });
});

describe("enumerateStr", () => {
  it("joins two items with separator", () => {
    expect(enumerateStr(["a", "b"])).toBe("a and b");
  });

  it("joins three+ items with commas and separator", () => {
    expect(enumerateStr(["a", "b", "c"])).toBe("a, b, and c");
  });

  it("handles single item", () => {
    expect(enumerateStr(["a"])).toBe("a");
  });

  it("handles empty array", () => {
    expect(enumerateStr([])).toBe("");
  });

  it("uses custom separator", () => {
    expect(enumerateStr(["a", "b", "c"], "or")).toBe("a, b, or c");
  });
});

describe("enumerateCards", () => {
  it("enumerates cards by title", () => {
    const cards = [
      { title: "Ace" },
      { title: "King" },
      { title: "Queen" },
    ] as any[];
    expect(enumerateCards(cards)).toBe("Ace, King, and Queen");
  });

  it("sorts titles when sorted is true", () => {
    const cards = [
      { title: "Queen" },
      { title: "Ace" },
      { title: "King" },
    ] as any[];
    expect(enumerateCards(cards, true)).toBe("Ace, King, and Queen");
  });
});

describe("inColl", () => {
  it("returns true when element is in collection", () => {
    expect(inColl([1, 2, 3], 2)).toBe(true);
  });

  it("returns false when element is not in collection", () => {
    expect(inColl([1, 2, 3], 4)).toBe(false);
  });

  it("returns false for empty collection", () => {
    expect(inColl([], 1)).toBe(false);
  });
});

describe("positions", () => {
  it("returns indices of matching elements", () => {
    expect(positions((x: number) => x % 2 === 0, [1, 2, 3, 4, 5])).toEqual([
      1, 3,
    ]);
  });

  it("returns empty array when no matches", () => {
    expect(positions((x: number) => x > 10, [1, 2, 3])).toEqual([]);
  });

  it("handles empty array", () => {
    expect(positions((x: number) => x > 0, [])).toEqual([]);
  });
});

describe("serverCard", () => {
  it("returns the card for Corp Basic Action Card", () => {
    const card = serverCard("Corp Basic Action Card");
    expect(card).toBeDefined();
    expect(card).not.toBeNull();
  });

  it("returns the card for Runner Basic Action Card", () => {
    const card = serverCard("Runner Basic Action Card");
    expect(card).toBeDefined();
    expect(card).not.toBeNull();
  });

  it("throws for unknown card with strict=true", () => {
    expect(() => serverCard("Nonexistent Card", true)).toThrow(
      "Tried to select server-card for Nonexistent Card",
    );
  });

  it("returns null for unknown card with strict=false", () => {
    expect(serverCard("Nonexistent Card", false)).toBeNull();
  });

  it("returns empty object for basic action cards when not in registry", () => {
    // Clear the registry to test the fallback
    setAllCards(new Map());
    expect(serverCard("Corp Basic Action Card")).toEqual({});
    expect(serverCard("Runner Basic Action Card")).toEqual({});
  });
});

describe("serverCards / setAllCards / getAllCards", () => {
  it("stores and retrieves cards", () => {
    const cards = new Map<string, Record<string, unknown>>();
    cards.set("Test Card", { title: "Test Card", type: "Agenda" });
    setAllCards(cards);
    const retrieved = Array.from(getAllCards());
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]).toEqual({ title: "Test Card", type: "Agenda" });
  });

  it("serverCards returns array of card values", () => {
    const cards = new Map<string, Record<string, unknown>>();
    cards.set("Card A", { title: "Card A" });
    cards.set("Card B", { title: "Card B" });
    setAllCards(cards);
    const result = serverCards();
    expect(result).toHaveLength(2);
  });

  it("setAllCards clears previous cards", () => {
    const cards1 = new Map<string, Record<string, unknown>>();
    cards1.set("Old", {});
    setAllCards(cards1);
    expect(serverCards()).toHaveLength(1);

    const cards2 = new Map<string, Record<string, unknown>>();
    cards2.set("New1", {});
    cards2.set("New2", {});
    setAllCards(cards2);
    expect(serverCards()).toHaveLength(2);
  });
});
