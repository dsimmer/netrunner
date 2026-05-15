// Game utility functions used pervasively across the game engine.
// Mirrors: src/clj/game/utils.clj + src/go/game/utils.go

import { randomUUID } from "crypto";
import type { Card } from "./core/card.js";
import type { GameState } from "./core/state.js";

// Global card registry (all-cards atom equivalent).
// Populated by the card loading task before any game starts.
const allCards = new Map<string, Record<string, unknown>>();

export function setAllCards(cards: Map<string, Record<string, unknown>>): void {
  allCards.clear();
  for (const [k, v] of cards) {
    allCards.set(k, v);
  }
}

export function getAllCards(): IterableIterator<Record<string, unknown>> {
  return allCards.values();
}

// ---------------------------------------------------------------------------

/** Generates a new unique card instance ID. Mirrors make-cid. */
export function makeCID(): string {
  return randomUUID();
}

/** Returns the current instant (UTC). Mirrors make-timestamp. */
export function makeTimestamp(): Date {
  return new Date();
}

/**
 * Looks up a card by title in the global card registry.
 * Throws if strict=true and card is not found.
 * Mirrors server-card.
 */
export function serverCard(title: string, strict = true): Record<string, unknown> | null {
  const card = allCards.get(title);
  if (card) return card;
  if (
    title === "Corp Basic Action Card" ||
    title === "Runner Basic Action Card"
  ) {
    return {};
  }
  if (strict) {
    throw new Error(`Tried to select server-card for ${title}`);
  }
  return null;
}

/** Returns all cards in the global registry. Mirrors server-cards. */
export function serverCards(): Record<string, unknown>[] {
  return Array.from(allCards.values());
}

/**
 * Safe zero check — returns true only if n is numerically zero.
 * Mirrors safe-zero?
 */
export function safeZero(n: unknown): boolean {
  if (n == null) return false;
  return n === 0;
}

/**
 * Removes the first element matching pred from coll.
 * Mirrors remove-once.
 */
export function removeOnce<T>(pred: (v: T) => boolean, coll: T[]): T[] {
  const idx = coll.findIndex(pred);
  if (idx === -1) return coll;
  return [...coll.slice(0, idx), ...coll.slice(idx + 1)];
}

/**
 * Converts a string to a keyword-style string (lower-case).
 * "[Credits]" → "credit".
 * Mirrors to-keyword.
 */
export function toKeyword(s: unknown): string {
  if (s === "[Credits]") return "credit";
  if (typeof s === "string") return s.toLowerCase();
  return String(s);
}

/**
 * Returns a slice with duplicates removed based on key function f.
 * Mirrors distinct-by.
 */
export function distinctBy<T>(f: (v: T) => unknown, coll: T[]): T[] {
  const seen = new Set<unknown>();
  const out: T[] = [];
  for (const v of coll) {
    const k = f(v);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

/**
 * Parses s as a number, returning null if parsing fails.
 * Mirrors string->num.
 */
export function stringToNum(s: string): number | null {
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return n;
}

/**
 * Dissociates a nested key path from a plain-object map.
 * Any empty objects that result are removed.
 * Mirrors dissoc-in.
 */
export function dissocIn(
  m: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  if (keys.length === 0) return m;
  const [k, ...ks] = keys;
  if (ks.length === 0) {
    const { [k]: _removed, ...rest } = m;
    return rest;
  }
  const nested = m[k];
  if (nested == null || typeof nested !== "object" || Array.isArray(nested)) {
    return m;
  }
  const newMap = dissocIn(nested as Record<string, unknown>, ks);
  if (Object.keys(newMap).length === 0) {
    const { [k]: _removed, ...rest } = m;
    return rest;
  }
  return { ...m, [k]: newMap };
}

/**
 * Returns true if cid was used this turn.
 * Mirrors used-this-turn?
 */
export function usedThisTurn(state: GameState, cid: string): boolean {
  return cid in state.perTurn;
}

/**
 * Normalises side to "Corp" or "Runner".
 * Mirrors side-str.
 */
export function sideStr(side: unknown): string {
  const s = String(side).toLowerCase();
  if (s === "corp" || s === ":corp") return "Corp";
  if (s === "runner" || s === ":runner") return "Runner";
  return String(side);
}

/**
 * Returns true if two sides refer to the same side.
 * Mirrors same-side?
 */
export function sameSide(side1: unknown, side2: unknown): boolean {
  return sideStr(side1) === sideStr(side2);
}

/**
 * Returns true if two cards share the same cid.
 * Mirrors same-card?
 */
export function sameCard(
  card1: { cid?: string } | null,
  card2: { cid?: string } | null,
): boolean;
export function sameCard<T>(
  fn: (c: T) => unknown,
  card1: T | null,
  card2: T | null,
): boolean;
export function sameCard(
  fnOrCard1: unknown,
  card1OrCard2: unknown,
  card2?: unknown,
): boolean {
  if (typeof fnOrCard1 === "function") {
    const fn = fnOrCard1 as (c: unknown) => unknown;
    const id1 = fn(card1OrCard2);
    const id2 = fn(card2);
    return id1 != null && id2 != null && id1 === id2;
  }
  const c1 = fnOrCard1 as { cid?: string } | null;
  const c2 = card1OrCard2 as { cid?: string } | null;
  return c1?.cid != null && c2?.cid != null && c1.cid === c2.cid;
}

/**
 * Makes a string plural based on the number n.
 * Mirrors pluralize.
 */
export function pluralize(s: string, n: number, suffix = "s"): string;
export function pluralize(
  s: string,
  singleSuffix: string,
  pluralSuffix: string,
  n: number,
): string;
export function pluralize(
  s: string,
  nOrSingle: number | string,
  suffixOrPlural = "s",
  nOpt?: number,
): string {
  let n: number;
  let singleSuffix: string;
  let pluralSuffix: string;
  if (typeof nOrSingle === "number") {
    n = nOrSingle;
    singleSuffix = "";
    pluralSuffix = suffixOrPlural;
  } else {
    singleSuffix = nOrSingle;
    pluralSuffix = suffixOrPlural;
    n = nOpt!;
  }
  return n === 1 || n === -1 ? s + singleSuffix : s + pluralSuffix;
}

/**
 * Returns "n word" with correct pluralisation.
 * Mirrors quantify.
 */
export function quantify(n: number, word: string, suffix = "s"): string {
  return `${n} ${pluralize(word, n, suffix)}`;
}

/**
 * Joins strings with commas and "and" before the last item.
 * Mirrors enumerate-str.
 */
export function enumerateStr(strings: string[], sep = "and"): string {
  if (strings.length <= 2) return strings.join(` ${sep} `);
  return `${strings.slice(0, -1).join(", ")}, ${sep} ${strings[strings.length - 1]}`;
}

/**
 * Enumerates a collection of cards by title, optionally sorted.
 * Mirrors enumerate-cards.
 */
export function enumerateCards(
  cards: Card[],
  sorted = false,
  sep = "and",
): string {
  let titles = cards.map((c) => c.title ?? "");
  if (sorted) titles = [...titles].sort();
  return enumerateStr(titles, sep);
}

/**
 * Returns true if coll contains elm.
 * Mirrors in-coll?
 */
export function inColl<T>(coll: T[], elm: T): boolean {
  return coll.some((v) => v === elm);
}

/**
 * Returns the indices of elements in coll matching pred.
 * Mirrors positions.
 */
export function positions<T>(pred: (v: T) => boolean, coll: T[]): number[] {
  const out: number[] = [];
  coll.forEach((v, i) => {
    if (pred(v)) out.push(i);
  });
  return out;
}
