// Assertion helpers for the game test framework.
// Mirrors: test/clj/game/test_framework/asserts.clj
//
// These wrap the helper functions from index.ts with vitest-compatible
// assertions so they can be used directly in tests with proper failure
// reporting.

import { expect } from "vitest";
import type { GameState, Card, Side } from "./index";

// ============================================================
// Log assertions
// ============================================================

/**
 * Assert that the last log entry contains the given substring.
 * Mirrors Clojure: (last-log-contains? state content)
 */
export function assertLastLogContains(
  state: GameState,
  substr: string,
): void {
  const log = state.log ?? [];
  const last = log[log.length - 1]?.text ?? log[log.length - 1]?.msg ?? "";
  expect(last).toContain(substr);
}

/**
 * Assert that the second-to-last log entry contains the given substring.
 * Mirrors Clojure: (second-last-log-contains? state content)
 */
export function assertSecondLastLogContains(
  state: GameState,
  substr: string,
): void {
  const log = state.log ?? [];
  const secondLast =
    log[log.length - 2]?.text ?? log[log.length - 2]?.msg ?? "";
  expect(secondLast).toContain(substr);
}

/**
 * Assert that the n-th log entry from the end contains the given substring.
 * Mirrors Clojure: (last-n-log-contains? state n content)
 *
 * @param n  0 = last, 1 = second-to-last, etc.
 */
export function assertLastNLogContains(
  state: GameState,
  n: number,
  substr: string,
): void {
  const log = state.log ?? [];
  const reversed = [...log].reverse();
  const entry = reversed[n];
  const text = entry?.text ?? entry?.msg ?? "";
  expect(text).toContain(substr);
}

// ============================================================
// Prompt assertions
// ============================================================

/**
 * Assert that the current prompt for the given side matches the expected
 * prompt type.
 * Mirrors Clojure: (prompt-is-type? state side type)
 */
export function assertPromptIsType(
  state: GameState,
  side: Side,
  expectedType: string,
): void {
  const prompt = state[side]?.prompt?.[0];
  const actualType = prompt?.promptType;
  expect(actualType).toBe(expectedType);
}

/**
 * Assert that the current prompt for the given side is showing the given card.
 * Mirrors Clojure: (prompt-is-card? state side card)
 */
export function assertPromptIsCard(
  state: GameState,
  side: Side,
  card: Card,
): void {
  const prompt = state[side]?.prompt?.[0];
  const promptCard = prompt?.card;
  expect(promptCard?.cid).toBe(card?.cid);
}

/**
 * Assert that there is no active prompt for the given side, or the prompt
 * type is "run" (meaning the prompt is part of run resolution, not an
 * open choice).
 * Mirrors Clojure: (no-prompt? state side)
 */
export function assertNoPrompt(state: GameState, side: Side): void {
  const prompt = state[side]?.prompt?.[0];
  if (!prompt) return;
  expect(prompt.promptType).toBe("run");
}

// ============================================================
// Change assertions
// ============================================================

/**
 * Assert that a value changed by exactly `delta` after executing `fn`.
 * Mirrors Clojure: (changed? state (expr delta) ...)
 *
 * Captures the value before `fn`, executes `fn`, then checks that the
 * value increased by exactly `delta`.
 */
export function assertChanged(
  getVal: () => number,
  delta: number,
  fn: () => void,
): void {
  const before = getVal();
  fn();
  const after = getVal();
  const actualChange = after - before;
  expect(actualChange).toBe(delta);
}

/**
 * Assert that a value changed by exactly `delta` after executing `fn`,
 * with a custom description for error messages.
 *
 * @param desc  human-readable label for the value being tracked
 */
export function assertChangedWithDesc(
  desc: string,
  getVal: () => number,
  delta: number,
  fn: () => void,
): void {
  const before = getVal();
  fn();
  const after = getVal();
  const actualChange = after - before;
  expect(actualChange, `${desc} => (${before} to ${after})`).toBe(delta);
}

// ============================================================
// Counter / Artifact assertions
// ============================================================

/**
 * Assert that a card has the given number of counters of the specified type.
 * Mirrors Clojure: (get-counters card counter-type)
 */
export function assertCounters(
  card: Card,
  counterType: string,
  expectedCount: number,
): void {
  const actual = card?.counter?.[counterType] ?? 0;
  expect(actual).toBe(expectedCount);
}

/**
 * Assert that a card has the given number of advancement counters.
 * Advancement counters are the sum of `advance-counter` and
 * `extra-advance-counter` on the card.
 * Mirrors Clojure: (get-counters card :advancement)
 */
export function assertAdvancementCounters(
  card: Card,
  expectedCount: number,
): void {
  const base = card?.advanceCounter ?? card?.["advance-counter"] ?? 0;
  const extra = card?.extraAdvanceCounter ?? card?.["extra-advance-counter"] ?? 0;
  const actual = base + extra;
  expect(actual).toBe(expectedCount);
}

/**
 * Assert that a card has a certain number of artifacts.
 * Artifacts are tracked as the "artifact" counter type on cards.
 */
export function assertArtifacts(
  card: Card,
  expectedCount: number,
): void {
  const actual = card?.counter?.["artifact"] ?? 0;
  expect(actual).toBe(expectedCount);
}

// ============================================================
// Uniqueness assertions
// ============================================================

/**
 * Assert that a uniqueness violation exists for the given card.
 * A uniqueness violation occurs when multiple copies of a unique card
 * (with the same code) are installed and rezzed on the same side.
 */
export function assertUniquenessViolation(
  state: GameState,
  side: Side,
  card: Card,
): void {
  const resolved = card;
  const cardCode = resolved?.code;
  const isUnique = resolved?.uniqueness === true;

  // Get all installed cards on this side
  const installed: Card[] = [];
  if (side === "corp") {
    // Corp installed cards: assets in servers
    const servers = state.corp?.servers ?? {};
    for (const serverName of Object.keys(servers)) {
      const server = servers[serverName];
      const content = server?.content ?? [];
      for (const c of content) {
        if (c && (c.installed || c.rezzed)) {
          installed.push(c);
        }
      }
    }
  } else {
    // Runner installed cards: programs, hardware, resources in rig
    const rig = state.runner?.rig ?? {};
    for (const zone of ["program", "hardware", "resource"] as const) {
      const cards = rig[zone] ?? [];
      for (const c of cards) {
        if (c && c.installed !== false) {
          installed.push(c);
        }
      }
    }
  }

  // Find other cards with the same code that are unique and installed
  const duplicates = installed.filter(
    (c) =>
      c?.code === cardCode &&
      c?.uniqueness === true &&
      c?.cid !== card?.cid,
  );

  expect(duplicates.length).toBeGreaterThanOrEqual(1);
}

// ============================================================
// Zone assertions (convenience wrappers)
// ============================================================

/**
 * Assert that a card is in the expected zone.
 * Mirrors Clojure: (is' (= expected-zone (get-zone card)))
 */
export function assertZone(card: Card, expectedZone: string[]): void {
  const actual = card?.zone ?? [];
  expect(actual).toEqual(expectedZone);
}

/**
 * Assert that a card is in a specific named zone.
 */
export function assertInZone(
  card: Card,
  side: Side,
  zone: string,
): void {
  const actual = card?.zone ?? [];
  if (zone === "hand") {
    expect(actual).toEqual(["hand"]);
  } else if (zone === "deck") {
    expect(actual).toEqual(["deck"]);
  } else if (zone === "discard") {
    expect(actual).toEqual(["discard"]);
  } else if (zone === "scored") {
    expect(actual).toEqual(["scored"]);
  } else if (zone === "rfg") {
    expect(actual).toEqual(["rfg"]);
  } else if (zone === "set-aside") {
    expect(actual).toEqual(["set-aside"]);
  } else {
    // For server zones, check that the zone starts with "servers"
    expect(actual[0]).toBe("servers");
  }
}

// ============================================================
// Stat assertions (convenience wrappers)
// ============================================================

/**
 * Assert that a side has the expected number of credits.
 */
export function assertCredits(
  state: GameState,
  side: Side,
  expected: number,
): void {
  const actual = state[side]?.credit ?? 0;
  expect(actual).toBe(expected);
}

/**
 * Assert that a side has the expected number of clicks.
 */
export function assertClicks(
  state: GameState,
  side: Side,
  expected: number,
): void {
  const actual = state[side]?.click ?? 0;
  expect(actual).toBe(expected);
}

/**
 * Assert that the runner has the expected number of tags.
 */
export function assertTags(
  state: GameState,
  expected: number,
): void {
  const tag = state.runner?.tag;
  if (!tag) {
    expect(0).toBe(expected);
    return;
  }
  const real = tag.real ?? 0;
  const virtual = tag.virtual ?? {};
  const total =
    real + Object.values(virtual).reduce((sum: number, v: number) => sum + v, 0);
  expect(total).toBe(expected);
}

/**
 * Assert that the corp has the expected bad publicity.
 */
export function assertBadPublicity(
  state: GameState,
  expected: number,
): void {
  const actual = state.corp?.badPublicity?.base ?? 0;
  expect(actual).toBe(expected);
}

// ============================================================
// Game state assertions
// ============================================================

/**
 * Assert that the game is over.
 */
export function assertGameOver(state: GameState): void {
  expect(state.gameOver).toBe(true);
}

/**
 * Assert that the game is not over.
 */
export function assertGameActive(state: GameState): void {
  expect(state.gameOver).toBe(false);
}

/**
 * Assert that the winner is the expected side.
 */
export function assertWinner(state: GameState, expectedWinner: Side): void {
  const actual = state.winner;
  expect(actual).toBe(expectedWinner);
}
