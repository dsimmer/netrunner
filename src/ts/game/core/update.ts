// State/card update helpers.
// Mirrors: src/clj/game/core/update.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import { getCard } from "./finding";
import { getScoringOwner } from "./finding";
import { toKeyword } from "../utils";
import type { State } from './types';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate into a nested object following a path of string keys.
 * Returns the value at that path, or undefined if any segment is missing.
 */
function getIn(obj: unknown, path: (string | symbol)[]): unknown {
  let current: unknown = obj;
  for (const seg of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[String(seg)];
  }
  return current;
}

/**
 * Navigate to the parent of the given path and set the final key to value.
 * Mirrors Clojure's assoc-in.
 */
function setIn(
  obj: Record<string, unknown>,
  path: (string | symbol)[],
  value: unknown,
): void {
  if (path.length < 2) return;
  let current: unknown = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (current == null || typeof current !== "object") return;
    current = (current as Record<string, unknown>)[String(path[i])];
  }
  if (current != null && typeof current === "object") {
    (current as Record<string, unknown>)[String(path[path.length - 1])] = value;
  }
}

// ---------------------------------------------------------------------------
// update-hosted!
// ---------------------------------------------------------------------------

/**
 * Updates a card that is hosted on another, by recursively updating the host card's
 * :hosted vector.
 */
function updateHosted(state: GameState, side: string, card: Card): void {
  const hostCard = getCard(state, card.host ?? null);
  if (hostCard) {
    const hosted = hostCard.hosted ?? [];
    const idx = hosted.findIndex((c) => c?.cid === card.cid);
    if (idx >= 0) {
      hosted[idx] = card;
    } else {
      hosted.push(card);
    }
    // Recur with the updated host so the chain walks upward
    updateHosted(state, side, hostCard);
  } else if (!card.host) {
    // No host found (or card has no host) – fall through to direct zone update
    updateInZone(state, side, card);
  }
}

// ---------------------------------------------------------------------------
// Direct zone update (non-identity, non-hosted fallback)
// ---------------------------------------------------------------------------

function updateInZone(state: GameState, side: string, card: Card): void {
  const zone = card.zone;
  if (!zone) return;

  const owner = getScoringOwner(state, card) || toKeyword(card.side ?? "");
  const path: (string | symbol)[] = [owner, ...zone];

  const collection = getIn(state, path);
  if (!Array.isArray(collection)) return;

  const idx = collection.findIndex(
    (c: Card | null | undefined) => c?.cid === card.cid,
  );
  if (idx >= 0) {
    collection[idx] = card;
  } else {
    collection.push(card);
  }
}

// ---------------------------------------------------------------------------
// update!
// ---------------------------------------------------------------------------

/**
 * Updates the state so that its copy of the given card matches the argument given.
 *
 * Mirrors: game.core.update/update!
 */
export function updateCard(state: GameState, side: string, card: Card | null | undefined): void;
export function updateCard(state: GameState, side: string, card: any): void;
export function updateCard(state: GameState, side: string, cardArg: any): void {
  if (!cardArg) return;
  const card = cardArg as Card;
  if (card.type === "Identity") {
    if (side === toKeyword(card.side ?? "")) {
      if (side === "corp") {
        state.corp.identity = card;
      } else {
        state.runner.identity = card;
      }
    }
    return;
  }

  if (card.host) {
    updateHosted(state, side, card);
    return;
  }

  updateInZone(state, side, card);
}

/**
 * Convenience alias matching the Clojure name `update!`.
 * Updates the state so that its copy of the given card matches the argument given.
 */
export const update = updateCard;

/**
 * Mirrors Clojure's `update-in`: walks the path inside `obj`, applies `fn` to the
 * value at the final key, then writes the result back. Mutates in place.
 */
export function updateIn(
  ...args: any[]
): any {
  // Permissive signature supporting both:
  //   updateIn(obj, path, fn)
  //   updateIn(state, side, card, fn)  (legacy Clojure-style)
  let obj: any;
  let path: (string | number | symbol)[];
  let fn: (current: any) => any;
  if (args.length === 3) {
    [obj, path, fn] = args;
  } else if (args.length >= 4) {
    obj = args[0];
    // Best-effort: assume args[1] (side) is path root, args[2] is card or further path; treat remaining as path; last arg is fn
    fn = args[args.length - 1];
    path = args.slice(1, args.length - 1).flatMap((p: any) => Array.isArray(p) ? p : [p]);
  } else {
    return undefined;
  }
  if (!Array.isArray(path) || path.length === 0 || obj == null || typeof obj !== "object") return;
  let current: any = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = String(path[i]);
    if (current[seg] == null || typeof current[seg] !== "object") current[seg] = {};
    current = current[seg];
  }
  const last = String(path[path.length - 1]);
  current[last] = typeof fn === 'function' ? fn(current[last]) : fn;
}
