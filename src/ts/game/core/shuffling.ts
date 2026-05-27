// Deck shuffling: shuffle!, shuffle-into-deck, shuffle-into-rd, shuffle-deck.
// Mirrors: src/clj/game/core/shuffling.clj

import { randomBytes } from "crypto";
import type { GameState } from "./state";
import type { EID } from "./eid";
import type { Card, Zone } from "./card";
import type { Ability } from "./types.ts";
import { CORP_SIDE, RUNNER_SIDE } from "./state";
import { corp, inDiscard, getTitle, getZone } from "./card";
import { triggerEvent } from "./engine";
import { zoneLocked } from "./flags";
import { move as moveCard, moveZone } from "./moving";
import { systemMsg, playSfx } from "./say";
import { nameZone } from "./servers";
import { req, continue_ability } from "../macros";
import { enumerateStr, enumerateCards, quantify } from "../utils";
import { getCard } from "./finding";

// ---------------------------------------------------------------------------
// Keyword normalization (strip leading ':' from Clojure-style keywords)
// ---------------------------------------------------------------------------

/**
 * Normalizes a Clojure-style keyword string (e.g. ":corp", ":deck")
 * to a plain string (e.g. "corp", "deck").
 */
function kw(s: string): string {
  return s.replace(/^:/, "");
}

type MessagePart =
  | string
  | ((state: GameState, side: string, eid: EID, card: Card, targets: Card[]) => unknown);

function message(...parts: MessagePart[]) {
  return (
    state: GameState,
    side: string,
    eid: EID,
    card: Card,
    targets: Card[],
  ): string => parts.map((part) => {
    if (typeof part === "function") {
      return String(part(state, side, eid, card, targets));
    }
    return part;
  }).join("");
}

// ---------------------------------------------------------------------------
// Secure RNG (mirrors defonce rng in shuffling.clj)
// ---------------------------------------------------------------------------

/**
 * Cryptographically-seeded RNG for Fisher–Yates shuffles.
 * ~128 bytes of seed entropy covers all permutations of a 170+ card list.
 * Mirrors the `rng` defonce in shuffling.clj.
 */
const rng = (() => {
  const seed = randomBytes(128);
  return seed;
})();

/**
 * Fisher-Yates shuffle on an array using crypto entropy.
 * Mirrors shuffle-coll in shuffling.clj.
 */
function shuffleColl<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    // Generate a random index 0..i using crypto bytes
    const range = i + 1;
    let cumulative = 0;
    let maxNotCovered = 0x1_00_00_00_00_00_00_00n - BigInt(range);
    const bytes = randomBytes(8);
    let r = BigInt("0x" + bytes.toString("hex"));
    while (r < maxNotCovered) {
      const more = randomBytes(8);
      r += BigInt("0x" + more.toString("hex"));
    }
    const j = Number(r % BigInt(range));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// shuffle! / shuffle  (shuffle a zone in place)
// ---------------------------------------------------------------------------

/**
 * Shuffles the given zone for the given side.
 * When called with only a zone string, returns a function for use inside `effect()` macros.
 * Mirrors shuffle! in shuffling.clj.
 */
export function shuffle(
  state: GameState,
  side: string,
  zone: string,
  opts?: { noSfx?: boolean },
): void;
export function shuffle(zone: string): (state: GameState, side: string) => void;
export function shuffle(state: GameState, zone: string): void;
export function shuffle(side: string, zone: string): void;
export function shuffle(
  stateOrZone: GameState | string,
  sideOrZone?: string,
  zone?: string,
  opts?: { noSfx?: boolean },
): void | ((state: GameState, side: string) => void) {
  // single-arg factory: return a fn for use inside effect()
  if (typeof stateOrZone === "string" && sideOrZone === undefined) {
    return (s: GameState, sd: string) => shuffle(s, sd, stateOrZone, opts);
  }

  // 2-arg (side, zone) form: no state — best-effort no-op.
  if (typeof stateOrZone === "string" && typeof sideOrZone === "string") {
    return;
  }

  // 2-arg (state, zone) form: infer side from active player.
  if (sideOrZone !== undefined && zone === undefined) {
    const s = stateOrZone as GameState;
    const z = sideOrZone;
    const sd = (s as any)?.activePlayer ?? "corp";
    return shuffle(s, sd, z, opts);
  }

  const side = sideOrZone;

  const s = stateOrZone;
  const sd = kw(side!);
  const z = kw(zone!);

  // Only shuffle known zones
  if (!["deck", "hand", "discard"].includes(z)) return;

  // Trigger event for deck shuffles
  if (z === "deck") {
    const evt = sd === CORP_SIDE ? "corp-shuffle-deck" : "runner-shuffle-deck";
    triggerEvent(s, sd, evt, null);
  }

  // Breach: corp deck shuffle clears known R&D cards
  if ((s as any).breach && sd === CORP_SIDE && z === "deck") {
    const breach = (s as any).breach;
    if (breach?.knownCids) {
      breach.knownCids.deck = [];
    }
  }

  // Access tracking: mark R&D shuffled during access
  if ((s as any).access && (s as any).run && sd === CORP_SIDE && z === "deck") {
    const runState = (s as any).run;
    if (!runState["shuffledDuringAccess"]) {
      runState["shuffledDuringAccess"] = {};
    }
    runState["shuffledDuringAccess"].rd = true;
  }

  // Play sound
  if (!opts?.noSfx) {
    playSfx(s, sd, "shuffle");
  }

  // Update shuffle stat
  const stats = (s as any).stats ?? {};
  const sideStats = stats[sd] ?? {};
  sideStats.shuffleCount = (sideStats.shuffleCount ?? 0) + 1;
  stats[sd] = sideStats;
  (s as any).stats = stats;

  // Perform the shuffle
  const player = (s as any)[sd];
  if (player && Array.isArray(player[z])) {
    player[z] = shuffleColl(player[z]);
  }
}

/** Alias for shuffle. Mirrors shuffle! name. */
export const shuffleBang = shuffle;

// ---------------------------------------------------------------------------
// shuffle-cards-into-deck!
// ---------------------------------------------------------------------------

/**
 * Shuffles a set of target cards into the specified side's deck.
 * Prints a system message describing the action.
 * Mirrors shuffle-cards-into-deck! in shuffling.clj.
 */
export function shuffleCardsIntoDeck(
  state: GameState,
  fromSide: string,
  card: Card | null,
  targets: Card | Card[] | unknown[],
  shuffleSide?: string,
): void {
  const actualShuffleSide = kw(shuffleSide ?? fromSide);
  const normalizedFromSide = kw(fromSide);

  // Flatten and resolve to actual card objects
  const flat: unknown[] = [];
  const flatten = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(flatten);
    else if (v != null) flat.push(v);
  };
  flatten(targets);

  const resolvedCards = flat
    .map((t: any) => getCard(state, t as Card) ?? (t as Card))
    .filter((c): c is Card => c != null);

  // Filter out cards in locked discard
  const filtered = resolvedCards.filter((c: any) => {
    const z = getZone(c);
    return !(
      z.length === 1 &&
      z[0] === "discard" &&
      zoneLocked(state, actualShuffleSide, "discard")
    );
  });

  const cardTitle = card ? (getTitle(card) ?? "a card") : "a card";
  const lhs = `${sideStr(normalizedFromSide)} uses ${cardTitle}${
    normalizedFromSide !== actualShuffleSide
      ? ` to force the ${capitalize(actualShuffleSide)}`
      : ""
  } to shuffle `;
  const rhs = actualShuffleSide === CORP_SIDE ? "Archives" : "the Stack";

  if (filtered.length > 0) {
    // Group cards by zone for nice messaging
    const cardsByZone = new Map<string, Card[]>();
    for (const c of filtered) {
      const key = `${c.side ?? ""}|${JSON.stringify(getZone(c))}`;
      const group = cardsByZone.get(key) ?? [];
      group.push(c);
      cardsByZone.set(key, group);
    }

    const zoneStrs: string[] = [];
    for (const [key, group] of cardsByZone) {
      const [csid, _] = key.split("|");
      const z = getZone(group[0]);
      zoneStrs.push(`${enumerateCards(group, true)} from ${nameZone(csid, z)}`);
    }
    const strs = enumerateStr(zoneStrs);

    // Move cards to deck (skip those already in deck)
    for (const t of filtered) {
      if (!inDeck(t)) {
        moveCard(state, actualShuffleSide, t, "deck");
      }
    }

    systemMsg(state, normalizedFromSide, `${lhs}${strs} into ${rhs}`);
    shuffle(state, actualShuffleSide, "deck");
  } else {
    systemMsg(state, normalizedFromSide, `${lhs}${rhs}`);
    shuffle(state, actualShuffleSide, "deck");
  }
}

function inDeck(card: Card): boolean {
  const z = getZone(card);
  return z.length === 1 && z[0] === "deck";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sideStr(side: string): string {
  const s = String(side).toLowerCase().replace(/^:/, "");
  if (s === "corp") return "Corp";
  if (s === "runner") return "Runner";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// shuffle-into-deck
// ---------------------------------------------------------------------------

/**
 * Moves all cards in the given zones to the deck and shuffles.
 * When called with only zone strings, returns a function for use inside `effect()` macros.
 * Mirrors shuffle-into-deck in shuffling.clj.
 */
export function shuffleIntoDeck(
  state: GameState,
  side: string,
  ...zones: (string | Zone)[]
): void;
export function shuffleIntoDeck(
  ...zones: (string | Zone)[]
): (state: GameState, side: string) => void;
export function shuffleIntoDeck(
  stateOrZone: GameState | string | Zone,
  sideOrZone?: string | Zone,
  ...restZones: (string | Zone)[]
): void | ((state: GameState, side: string) => void) {
  // factory form: first arg is a zone string
  if (typeof stateOrZone === "string") {
    return (s: GameState, sd: string) => {
      const allZones = [stateOrZone, sideOrZone, ...restZones].filter(
        (z): z is string | Zone => typeof z === "string" || Array.isArray(z),
      ) as string[];
      return shuffleIntoDeck(s, sd, ...allZones);
    };
  }

  const state = stateOrZone as GameState;
  const side = kw(sideOrZone as string);
  const zones = restZones
    .filter((z): z is string => typeof z === "string")
    .map((z: any) => kw(z));

  for (const z of zones) {
    moveZone(state, side, z, "deck");
  }
  shuffle(state, side, "deck");
}

// ---------------------------------------------------------------------------
// shuffle-my-deck!  (ability definition)
// ---------------------------------------------------------------------------

/**
 * Ability to shuffle one's own deck.
 * Mirrors shuffle-my-deck! in shuffling.clj.
 */
export const shuffleMyDeck: Ability = {
  msg: message("shuffle ", (state: GameState, side: string) =>
    side === RUNNER_SIDE ? "the stack" : "R&D",
  ),
  effect: req((state: GameState, side: string) => {
    shuffle(state, side, "deck");
  }),
};

// ---------------------------------------------------------------------------
// fail-to-find!  (ability definition)
// ---------------------------------------------------------------------------

/**
 * Fail to find a card when searching the deck.
 * Triggers :searched-stack event for runner, then shuffles.
 * Mirrors fail-to-find! in shuffling.clj.
 */
export const failToFind: Ability = {
  msg: message("shuffle ", (state: GameState, side: string) =>
    side === RUNNER_SIDE ? "the stack" : "R&D",
  ),
  effect: req((state: GameState, side: string) => {
    if (side === RUNNER_SIDE) {
      triggerEvent(state, side, "searched-stack", null);
    }
    shuffle(state, side, "deck");
  }),
};

// ---------------------------------------------------------------------------
// shuffle-into-rd-effect
// ---------------------------------------------------------------------------

/**
 * Interactive ability: let corp choose cards from discard to shuffle into R&D.
 * Mirrors shuffle-into-rd-effect in shuffling.clj.
 */
export function shuffleIntoRdEffect(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  n: number,
  all?: boolean,
): void {
  all = all ?? false;

  continue_ability(
    state,
    side,
    {
      showDiscard: true,
      choices: {
        max: Math.min(state.corp?.discard?.length ?? 0, n),
        card: (c: Card) => corp(c) && inDiscard(c),
        all,
      },
      msg: {
        public: message(
          "shuffle ",
          (
            _s: GameState,
            _sd: string,
            _eid: EID,
            _card: Card,
            targets: Card[],
          ) => {
            const seen = targets.filter((c: Card) => c.seen);
            const unseen = targets.filter((c: Card) => !c.seen);
            const m = unseen.length;
            return (
              enumerateCards(seen, true) +
              (m > 0
                ? ` ${seen.length > 0 ? "and " : ""}${quantify(m, "unseen card")}`
                : "")
            );
          },
          " into R&D",
        ),
        corp: message(
          "shuffle ",
          (
            _s: GameState,
            _sd: string,
            _eid: EID,
            _card: Card,
            targets: Card[],
          ) => {
            const seen = targets.filter((c: Card) => c.seen);
            const unseen = targets.filter((c: Card) => !c.seen);
            const m = unseen.length;
            return (
              enumerateCards(seen, true) +
              (m > 0
                ? ` ${seen.length > 0 ? "and " : ""}${quantify(m, "unseen card")} (${enumerateCards(unseen, true)})`
                : "")
            );
          },
          " into R&D",
        ),
      },
      waitingPrompt: true,
      effect: req(
        (
          _s: GameState,
          _sd: string,
          _eid: EID,
          _card: Card,
          targets: Card[],
        ) => {
          for (const c of targets) {
            moveCard(_s, _sd, c, "deck");
          }
          shuffle(_s, _sd, "deck");
        },
      ),
      cancel: shuffleMyDeck,
    } as unknown as Ability,
    card,
    null,
  );
}

// ---------------------------------------------------------------------------
// shuffle-deck
// ---------------------------------------------------------------------------

/**
 * Shuffle R&D/Stack. Optionally close the view-deck prompt.
 * Mirrors shuffle-deck in shuffling.clj.
 */
export function shuffleDeck(
  state: GameState,
  side: string,
  opts?: { close?: boolean },
): void {
  const sd = kw(side);
  const player = (state as any)[sd];
  if (player && Array.isArray(player.deck)) {
    player.deck = shuffleColl(player.deck);
  }
  playSfx(state, sd, "shuffle");

  if (opts?.close) {
    // Remove view-deck prompt
    player.viewDeck = undefined;
    systemMsg(state, sd, "stops looking at [pronoun] deck and shuffles it");
  } else {
    systemMsg(state, sd, "shuffles [pronoun] deck");
  }
}

// ---------------------------------------------------------------------------
// get-set-aside (re-export from set-aside for convenience)
// ---------------------------------------------------------------------------

/**
 * Returns the set-aside cards for a given side and EID.
 * Mirrors get-set-aside in set-aside.clj, re-exported here for convenience
 * since it's used alongside shuffle-into-deck.
 */
export function getSetAside(
  state: GameState,
  side: string,
  eid: EID | { id: number } | number,
): Card[] {
  const sd = kw(side);
  const eidNum = typeof eid === "number" ? eid : (eid as EID).id;
  const player = (state as any)[sd];
  const tracking = player?.setAsideTracking;
  if (!tracking || typeof tracking !== "object") return [];
  return (tracking[String(eidNum)] as Card[]) ?? [];
}

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility with card imports
// ---------------------------------------------------------------------------



/** Alias for `shuffleIntoRdEffect`. */
export const shuffleIntoRDEffect = shuffleIntoRdEffect;
