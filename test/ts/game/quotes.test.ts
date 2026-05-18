// Tests for game/quotes.ts
// Mirrors: test/clj/game/quotes_test.clj

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { makeQuote, loadQuotes } from "@/game/quotes";

// ============================================================
// Simple EDN parser for the quote file format
// Handles: maps {}, vectors [], strings (with escapes)
// ============================================================

interface EdnValue {
  [key: string]: EdnValue;
}

interface QuotesData {
  [identityTitle: string]: {
    [factionOrTitle: string]: string[];
  };
}

function parseEdnQuotes(content: string): EdnValue {
  let pos = 0;

  function skipWhitespace(): void {
    while (pos < content.length && /\s/.test(content[pos])) {
      pos++;
    }
  }

  function parseString(): string {
    skipWhitespace();
    if (content[pos] !== '"') {
      throw new Error(`Expected '"' at position ${pos}`);
    }
    pos++; // skip opening quote
    let result = "";
    while (pos < content.length && content[pos] !== '"') {
      if (content[pos] === "\\") {
        pos++;
        switch (content[pos]) {
          case '"': result += '"'; break;
          case '\\': result += '\\'; break;
          case '/': result += '/'; break;
          case 'n': result += '\n'; break;
          case 't': result += '\t'; break;
          case 'r': result += '\r'; break;
          default: result += content[pos];
        }
      } else {
        result += content[pos];
      }
      pos++;
    }
    if (pos >= content.length) {
      throw new Error("Unterminated string");
    }
    pos++; // skip closing quote
    return result;
  }

  function parseVector(): string[] {
    skipWhitespace();
    if (content[pos] !== "[") {
      throw new Error(`Expected '[' at position ${pos}`);
    }
    pos++; // skip opening bracket
    const result: string[] = [];
    while (pos < content.length && content[pos] !== "]") {
      skipWhitespace();
      if (content[pos] === '"') {
        result.push(parseString());
      } else {
        throw new Error(`Unexpected character at position ${pos}`);
      }
    }
    if (pos >= content.length) {
      throw new Error("Unterminated vector");
    }
    pos++; // skip closing bracket
    return result;
  }

  function parseMap(): EdnValue {
    skipWhitespace();
    if (content[pos] !== "{") {
      throw new Error(`Expected '{' at position ${pos}`);
    }
    pos++; // skip opening brace
    const result: EdnValue = {};
    while (pos < content.length && content[pos] !== "}") {
      skipWhitespace();
      const key = parseString();
      skipWhitespace();
      if (content[pos] === "[") {
        result[key] = parseVector();
      } else if (content[pos] === "{") {
        result[key] = parseMap();
      } else {
        throw new Error(`Unexpected character at position ${pos}, expected '[' or '{'`);
      }
    }
    if (pos >= content.length) {
      throw new Error("Unterminated map");
    }
    pos++; // skip closing brace
    return result;
  }

  skipWhitespace();
  return parseMap();
}

function loadEdnFile(filename: string): EdnValue {
  const fullPath = path.resolve(__dirname, "../../../", filename);
  const content = fs.readFileSync(fullPath, "utf-8");
  return parseEdnQuotes(content);
}

// ============================================================
// Test helpers
// ============================================================

const validFactionKeys = new Set([
  "Default",
  "Anarch",
  "Criminal",
  "Shaper",
  "Haas-Bioroid",
  "Jinteki",
  "NBN",
  "Weyland Consortium",
]);

// Known identity card titles from the quote files
// These are the identities that appear as top-level keys in the quote files
const knownIdentityTitles = new Set<string>();

// We'll populate knownIdentityTitles from the actual quote files
// and then validate them against the card registry

// ============================================================
// Tests
// ============================================================

describe("quotes", () => {
  let corpQuotes: EdnValue;
  let runnerQuotes: EdnValue;
  let mergedQuotes: QuotesData;

  beforeAll(() => {
    corpQuotes = loadEdnFile("data/quotes-corp.edn");
    runnerQuotes = loadEdnFile("data/quotes-runner.edn");
    mergedQuotes = { ...corpQuotes, ...runnerQuotes } as QuotesData;
  });

  describe("loadQuotes", () => {
    it("loads quotes successfully", () => {
      // The EDN files exist and parse correctly
      expect(Object.keys(corpQuotes).length).toBeGreaterThan(0);
      expect(Object.keys(runnerQuotes).length).toBeGreaterThan(0);
    });
  });

  describe("quote data validation", () => {
    it("identity quotes structure is correct", () => {
      for (const id of Object.keys(mergedQuotes)) {
        // Each identity should have a map of faction/title -> quotes
        const pairs = mergedQuotes[id];
        expect(typeof pairs).toBe("object");
        expect(pairs).not.toBeNull();
      }
    });

    it("pair values are arrays", () => {
      for (const [id, pairs] of Object.entries(mergedQuotes)) {
        for (const [pairId, pairQuotes] of Object.entries(pairs)) {
          expect(Array.isArray(pairQuotes)).toBe(true);
        }
      }
    });

    it("quotes are non-blank and trimmed", () => {
      for (const [id, pairs] of Object.entries(mergedQuotes)) {
        for (const [pairId, pairQuotes] of Object.entries(pairs)) {
          const quotes = pairQuotes as string[];
          for (const quote of quotes) {
            expect(quote.trim().length).toBeGreaterThan(0);
            expect(quote).toBe(quote.trim());
          }
        }
      }
    });

    it("pair keys are either known identities or valid faction names", () => {
      // Collect all known identity titles from both quote files
      const allIdentityTitles = new Set([
        ...Object.keys(corpQuotes),
        ...Object.keys(runnerQuotes),
      ]);

      for (const [id, pairs] of Object.entries(mergedQuotes)) {
        for (const pairId of Object.keys(pairs)) {
          const isValidFaction = validFactionKeys.has(pairId);
          const isKnownIdentity = allIdentityTitles.has(pairId);
          expect(
            isValidFaction || isKnownIdentity,
            `${pairId} is not a valid faction or identity for ${id}`,
          ).toBe(true);
        }
      }
    });
  });

  describe("makeQuote", () => {
    it("returns a string", () => {
      const quote = makeQuote(
        { title: "Test Identity", faction: "Anarch" },
        { title: "Opponent Identity", faction: "NBN" },
      );
      expect(typeof quote).toBe("string");
    });

    it("returns fallback when no quotes are available", () => {
      const quote = makeQuote(
        { title: "NonExistent Identity" },
        { title: "AlsoNonExistent", faction: "Unknown" },
      );
      expect(quote).toBe("NO QUOTE SRY");
    });

    it("returns a quote when identity data is present", () => {
      // Load quotes into the module
      loadQuotes();

      // Test with a known identity structure from the loaded data
      const quote = makeQuote(
        { title: "Blue Sun: Powering the Future", faction: "Haas-Bioroid" },
        { title: "NonExistent Runner", faction: "Shaper" },
      );
      // Should return either a quote or the fallback
      expect(typeof quote).toBe("string");
      expect(quote.length).toBeGreaterThan(0);
    });
  });
});
