// State/card update helpers.
// Mirrors: src/clj/game/core/update.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import { getCard, getScoringOwner } from "./finding";
import { toKeyword } from "../utils";

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
 * Mirrors: game.core.update/update!. Accepts a partial card-shaped object so
 * that callers spreading `getCard` results (which may return null) still
 * type-check — null/undefined-cid inputs are silently ignored.
 */
export function updateCard(
  state: GameState,
  side: string,
  card: Partial<Card> | Card | null | undefined,
): void {
  if (!card || !card.cid) return;
  const c = card as Card;
  if (c.type === "Identity") {
    if (side === toKeyword(c.side ?? "")) {
      if (side === "corp") {
        state.corp.identity = c;
      } else {
        state.runner.identity = c;
      }
    }
    return;
  }

  if (c.host) {
    updateHosted(state, side, c);
    return;
  }

  updateInZone(state, side, c);
}

/**
 * Convenience alias matching the Clojure name `update!`.
 * Updates the state so that its copy of the given card matches the argument given.
 */
export const update = updateCard;

type PathSeg = string | number | symbol;
type UpdateFn = (current: unknown) => unknown;

/**
 * Mirrors Clojure's `update-in`: walks the path inside `obj`, applies `fn` to the
 * value at the final key, then writes the result back. Mutates in place.
 *
 * Supports two call forms used by card definitions:
 *   updateIn(obj, path, fn)                 — path as array, fn applied
 *   updateIn(obj, key1, key2, ..., value)   — flat path, final arg is value or fn
 */
export function updateIn(
  obj: object | null | undefined,
  ...rest: unknown[]
): unknown {
  if (rest.length === 0 || obj == null || typeof obj !== "object") return undefined;

  let path: PathSeg[];
  let fnOrValue: unknown;

  if (rest.length === 2 && Array.isArray(rest[0])) {
    path = rest[0] as PathSeg[];
    fnOrValue = rest[1];
  } else {
    fnOrValue = rest[rest.length - 1];
    const pathArgs = rest.slice(0, -1);
    path = pathArgs.flatMap((p) =>
      Array.isArray(p) ? (p as PathSeg[]) : [p as PathSeg],
    );
  }

  if (path.length === 0) return undefined;

  let current: Record<string, unknown> = obj as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = String(path[i]);
    const next = current[seg];
    if (next == null || typeof next !== "object") {
      current[seg] = {};
    }
    current = current[seg] as Record<string, unknown>;
  }
  const last = String(path[path.length - 1]);
  const newValue =
    typeof fnOrValue === "function"
      ? (fnOrValue as UpdateFn)(current[last])
      : fnOrValue;
  current[last] = newValue;
  return newValue;
}
