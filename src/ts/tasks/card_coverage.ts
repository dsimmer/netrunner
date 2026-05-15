// Utilities for card test coverage reporting.
// Mirrors: src/clj/tasks/card_coverage.clj
//
// CLJ uses namespace reflection (ns-publics + :test metadata).
// TS equivalent parses test files with regex.
//
// Convention for TS test files:
//   // @skip-card-coverage       — omit next test from coverage
//   // @card-title: "Real Title" — override card title for next test

import * as fs from "fs";
import * as path from "path";
import { slugify } from "../jinteki/utils.js";

// ──────────────────────────────────────────────────────────────────
// ANSI helpers
// ──────────────────────────────────────────────────────────────────

const ESC = "\u001B";
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const RED = `${ESC}[1;31m`;
const GREEN = `${ESC}[1;32m`;
const BLUE = `${ESC}[1;34m`;

function fmt(label: string, count: number, color: string): string {
  return `${ESC}${color}${label}${RESET}${BOLD}${count}${RESET}`;
}

// ──────────────────────────────────────────────────────────────────
// Card loading
// ──────────────────────────────────────────────────────────────────

interface CardRecord {
  title?: string;
  normalizedtitle?: string;
  type?: string;
}

function loadCards(filePath = "data/cards.json"): CardRecord[] {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Cards file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : Object.values(parsed);
}

function getCards(cards: CardRecord[]): string[] {
  return cards
    .map((c) => slugify(c.normalizedtitle ?? c.title ?? ""))
    .filter(Boolean);
}

function getCardsByType(cards: CardRecord[], cardType: string): string[] {
  return cards
    .filter((c) => c.type === cardType)
    .map((c) => slugify(c.normalizedtitle ?? c.title ?? ""))
    .filter(Boolean);
}

// ──────────────────────────────────────────────────────────────────
// Test discovery (replaces CLJ ns-publics + :test metadata reflection)
// ──────────────────────────────────────────────────────────────────

// Matches: it("card name", ...) or test("card name", ...)
// Also handles single-quoted strings.
const TEST_PATTERN = /^\s*(?:it|test)\s*\(\s*(["'`])([^"'`]+)\1/;
const SKIP_PATTERN = /\/\/\s*@skip-card-coverage/;
const TITLE_PATTERN = /\/\/\s*@card-title:\s*(["'])([^"']+)\1/;

function getTests(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const results: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = TEST_PATTERN.exec(line);
    if (!match) continue;

    // Look back up to 3 lines for annotations
    const lookback = lines.slice(Math.max(0, i - 3), i);
    if (lookback.some((l) => SKIP_PATTERN.test(l))) continue;

    const titleOverride = lookback.map((l) => TITLE_PATTERN.exec(l)).find(Boolean);
    const name = titleOverride ? titleOverride[2] : match[2];
    const slug = slugify(name);
    if (slug) results.push(slug);
  }

  return results;
}

// ──────────────────────────────────────────────────────────────────
// Diff helpers
// ──────────────────────────────────────────────────────────────────

function setDiff(
  a: Set<string>,
  b: Set<string>,
): { onlyA: string[]; onlyB: string[]; both: string[] } {
  const onlyA = [...a].filter((x) => !b.has(x)).sort();
  const onlyB = [...b].filter((x) => !a.has(x)).sort();
  const both = [...a].filter((x) => b.has(x)).sort();
  return { onlyA, onlyB, both };
}

// ──────────────────────────────────────────────────────────────────
// Reporting
// ──────────────────────────────────────────────────────────────────

function compareTests(
  cardType: string,
  testFiles: string[],
  cards: CardRecord[],
  showAll: boolean,
  showNone: boolean,
): void {
  const cardSlugs = new Set(getCardsByType(cards, cardType));
  const testSlugs = new Set(testFiles.flatMap((f) => getTests(f)));
  const { onlyA: cardsWo, onlyB: testsWo, both } = setDiff(cardSlugs, testSlugs);

  console.log(`${ESC}${BLUE}${cardType}${RESET}`);
  console.log(`\tUnique cards in db: ${cardSlugs.size}`);
  console.log(`\tTests: ${testSlugs.size}`);
  console.log(fmt("\tCards with tests: ", both.length, GREEN));
  if (showAll && !showNone) {
    for (const c of both) console.log(`\t\t ${c}`);
  }
  console.log(fmt("\tCards without tests: ", cardsWo.length, RED));
  if (!showNone) {
    for (const c of cardsWo) console.log(`\t\t ${c}`);
  }
  console.log(fmt("\tTests without cards: ", testsWo.length, RED));
  if (!showNone) {
    for (const c of testsWo) console.log(`\t\t ${c}`);
  }
}

function compareAllTests(
  namespaces: Record<string, string[]>,
  cards: CardRecord[],
): void {
  const allCardSlugs = new Set(getCards(cards));
  const allTestSlugs = new Set(
    Object.values(namespaces).flat().flatMap((f) => getTests(f)),
  );
  const { onlyA: cardsWo, onlyB: testsWo } = setDiff(allCardSlugs, allTestSlugs);

  console.log(`${ESC}${BLUE}All${RESET}`);
  console.log(`\tUnique cards in db: ${allCardSlugs.size}`);
  console.log(`\tTests: ${allTestSlugs.size}`);
  console.log(fmt("\tCards without tests: ", cardsWo.length, RED));
  for (const c of cardsWo) console.log(`\t\t ${c}`);
  console.log(fmt("\tTests without cards: ", testsWo.length, RED));
  for (const c of testsWo) console.log(`\t\t ${c}`);
}

// ──────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────

const TEST_FILE_MAP: Record<string, string[]> = {
  Agenda: ["test/ts/game/cards/agendas_test.ts"],
  Asset: ["test/ts/game/cards/assets_test.ts"],
  Event: ["test/ts/game/cards/events_test.ts"],
  Hardware: ["test/ts/game/cards/hardware_test.ts"],
  ICE: ["test/ts/game/cards/ice_test.ts"],
  Identity: ["test/ts/game/cards/identities_test.ts"],
  Operation: ["test/ts/game/cards/operations_test.ts"],
  Program: ["test/ts/game/cards/programs_test.ts"],
  Resource: ["test/ts/game/cards/resources_test.ts"],
  Upgrade: ["test/ts/game/cards/upgrades_test.ts"],
};

export function testCoverage(...args: string[]): void {
  const cardsFile = args.find((a) => !a.startsWith("--")) ?? "data/cards.json";
  const only = args.includes("--only");
  const showAll = args.includes("--show-all");
  const showNone = args.includes("--show-none");
  const onlyTotal = args.includes("--only-total");
  const cardType = args.find(
    (a) => !a.startsWith("--") && a !== cardsFile,
  );

  console.log("Loading all tests and cards");
  let cards: CardRecord[];
  try {
    cards = loadCards(cardsFile);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  console.log("Loaded successfully");

  const filteredMap =
    only && cardType && !onlyTotal
      ? { [cardType]: TEST_FILE_MAP[cardType] ?? [] }
      : TEST_FILE_MAP;

  if (onlyTotal) {
    compareAllTests(TEST_FILE_MAP, cards);
  } else {
    if (only && cardType) {
      console.log(
        `Only checking cards of type ${ESC}${BLUE}${cardType}${RESET}`,
      );
    }
    for (const [type, files] of Object.entries(filteredMap)) {
      compareTests(type, files, cards, showAll, showNone);
      console.log();
    }
  }
}
