// Tag management: summing effects, updating tag status, gaining/losing tags.
// Mirrors: src/clj/game/core/tags.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import { RUNNER_SIDE } from "./state";
import { anyEffects, sumEffects } from "./effects";
import { effectCompleted } from "./eid";
import { triggerEvent, queueEvent, checkpoint } from "./engine";
import { gain, deduct } from "./gaining";
import { resolveTagPrevention } from "./prevention";
import { toast } from "./toasts";
import { quantify } from "../utils";
import { req } from "../macros";
import { makeEID, registerEffectCompleted } from "./eid";

// ---------------------------------------------------------------------------
// Tag effect summation
// ---------------------------------------------------------------------------

/**
 * Sums all tag effects (base + user-tags + tags effects).
 * Mirrors: sum-tag-effects in tags.clj
 */
export function sumTagEffects(state: GameState): number {
  return (
    (state.runner.tag.base ?? 0) +
    sumEffects(state, RUNNER_SIDE, "user-tags", null, []) +
    sumEffects(state, RUNNER_SIDE, "tags", null, [])
  );
}

/**
 * Recalculates tag totals and fires :tags-changed if anything differs.
 * Mirrors: update-tag-status in tags.clj
 */
export function updateTagStatus(state: GameState): boolean {
  const oldTotal = state.runner.tag.total ?? 0;
  const newTotal = sumTagEffects(state);
  const isTagged =
    anyEffects(state, RUNNER_SIDE, "is-tagged", () => true, null, []) ||
    newTotal > 0;

  const oldTags = {
    total: oldTotal,
    isTagged: state.runner.tag.isTagged ?? false,
  };
  const newTags = { total: newTotal, isTagged };

  const changed =
    oldTags.total !== newTags.total || oldTags.isTagged !== newTags.isTagged;

  if (changed) {
    state.runner.tag.total = newTotal;
    state.runner.tag.isTagged = isTagged;
    triggerEvent(state, RUNNER_SIDE, "tags-changed", {
      newTotal,
      oldTotal,
      isTagged,
    });
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Resolve tag (internal — called after prevention window)
// ---------------------------------------------------------------------------

/**
 * Resolve runner gaining tags. Always gives `:base` tags.
 * Mirrors: resolve-tag in tags.clj
 */
function resolveTag(
  state: GameState,
  side: string,
  eid: EID,
  card: { cid: string; title: string } | null,
  n: number,
  suppressCheckpoint?: boolean,
): void {
  if (n > 0) {
    gain(state, RUNNER_SIDE, "tag", { base: n });
    toast(state, RUNNER_SIDE, `Took ${quantify(n, "tag")}!`, "info");
    updateTagStatus(state);
    queueEvent(state, "runner-gain-tag", {
      side,
      causeCard: card ? { cid: card.cid, title: card.title } : null,
      amount: n,
    });
  } else {
    queueEvent(state, "runner-prevents-all-tags", {
      side,
      causeCard: card,
    });
  }

  if (suppressCheckpoint) {
    effectCompleted(state, null, eid);
  } else {
    checkpoint(state, null, eid);
  }
}

// ---------------------------------------------------------------------------
// Gain / lose tags
// ---------------------------------------------------------------------------

interface GainTagsOpts {
  unpreventable?: boolean;
  card?: Card | { cid: string; title: string } | null;
  suppressCheckpoint?: boolean;
  // kebab-case alias for tier-2 card callers
  "suppress-checkpoint"?: boolean;
  [key: string]: unknown;
}

/**
 * Attempts to give the runner n tags, allowing for boosting/prevention effects.
 * Mirrors: gain-tags in tags.clj
 */
export function gainTags(state: GameState, side: string, n: number, opts?: GainTagsOpts | null): void;
export function gainTags(state: GameState, side: string, eid: EID, n: number, opts?: GainTagsOpts | null): void;
// Permissive overloads for tier-2 card legacy call shapes.
export function gainTags(eid: EID, n: number, opts?: GainTagsOpts | null): void;
export function gainTags(side: string, eid: EID, n: number, opts?: GainTagsOpts | null): void;
export function gainTags(
  arg1: GameState | EID | string,
  arg2: string | EID | number,
  arg3?: EID | number | GainTagsOpts | null,
  arg4?: number | GainTagsOpts | null,
  arg5?: GainTagsOpts | null,
): void {
  // Detect a real GameState (must have .corp + .runner).
  let state: GameState;
  let side: string;
  if (
    arg1 &&
    typeof arg1 === "object" &&
    "corp" in (arg1 as object) &&
    "runner" in (arg1 as object)
  ) {
    state = arg1 as GameState;
    side = typeof arg2 === "string" ? arg2 : "runner";
  } else {
    // Legacy form (eid, n) or (side, eid, n) — no state, no-op.
    return;
  }
  return gainTagsImpl(state, side, arg3, arg4, arg5);
}

function gainTagsImpl(
  state: GameState,
  side: string,
  arg3: EID | number | GainTagsOpts | null | undefined,
  arg4?: number | GainTagsOpts | null,
  arg5?: GainTagsOpts | null,
): void {
  let eid: EID;
  let n: number;
  let opts: GainTagsOpts = {};
  if (arg3 && typeof arg3 === "object" && "id" in arg3) {
    eid = arg3;
    n = arg4 as number;
    opts = arg5 ?? {};
  } else {
    n = arg3 as number;
    opts = (arg4 as GainTagsOpts | null) ?? {};
    eid = { id: 0, source: null } as unknown as EID;
  }
  const { unpreventable, card, suppressCheckpoint } = opts;

  // Mirrors: (wait-for (resolve-tag-prevention ...) (resolve-tag ... async-result))
  // resolveTagPrevention signals completion on its eid via completeWithResult.
  // We register an effect-completed handler on a fresh inner eid so we can
  // capture the `remaining` count, then resolve the actual tag gain.
  const innerEid = makeEID(state);
  registerEffectCompleted(state, innerEid, (
    _s: GameState,
    _sd: string,
    completedEid: EID,
  ) => {
    const result = (completedEid as EID & { result?: unknown }).result;
    const remaining: number =
      typeof result === "number"
        ? result
        : (result as { remaining?: number; "paid/value"?: number } | null | undefined)?.remaining
          ?? (result as { "paid/value"?: number } | null | undefined)?.["paid/value"]
          ?? n;
    const narrowCard =
      card && "cid" in card && "title" in card
        ? { cid: card.cid, title: card.title ?? "" }
        : null;
    resolveTag(state, side, eid, narrowCard, remaining, suppressCheckpoint || opts["suppress-checkpoint"]);
  });
  resolveTagPrevention(state, side, innerEid, n, { unpreventable, card: card as Card | undefined });
}

/**
 * Take n tags (ability-returning helper).
 * Mirrors: gain-tags-ability in tags.clj
 */
export function gainTagsAbility(n: number): import("./types").Ability {
  return {
    msg: `take ${quantify(n, "tag")}`,
    async: true,
    effect: req(function (this: unknown, s: GameState, sid: string, e: EID) {
      gainTags(s, sid, e, n);
    }),
  };
}

/**
 * Always removes `:base` tags.
 * Mirrors: lose-tags in tags.clj
 */
interface LoseTagsOpts {
  suppressCheckpoint?: boolean;
  "suppress-checkpoint"?: boolean;
  [key: string]: unknown;
}

export function loseTags(eid: EID, n: number | "all" | ":all"): void;
export function loseTags(state: GameState, side: string, n: number | "all" | ":all", opts?: LoseTagsOpts | null): void;
export function loseTags(state: GameState, side: string, eid: EID, n: number | "all" | ":all", opts?: LoseTagsOpts | null): void;
export function loseTags(
  arg1: GameState | EID,
  arg2: string | number | "all" | ":all",
  arg3?: EID | number | "all" | ":all",
  arg4?: number | "all" | ":all" | LoseTagsOpts | null,
  arg5?: LoseTagsOpts | null,
): void {
  let state: GameState;
  let side: string;
  let eid: EID;
  let n: number | "all";
  let opts: LoseTagsOpts = {};

  if (arg1 && typeof arg1 === "object" && "id" in arg1 && !("corp" in arg1)) {
    // (eid, n) — legacy 2-arg shim
    return;
  }
  state = arg1 as GameState;
  side = arg2 as string;
  if (arg3 && typeof arg3 === "object" && "id" in arg3) {
    eid = arg3;
    const rawN = arg4 as number | "all" | ":all";
    n = rawN === ":all" ? "all" : rawN;
    opts = arg5 ?? {};
  } else {
    const rawN = arg3 as number | "all" | ":all";
    n = rawN === ":all" ? "all" : rawN;
    opts = (arg4 as LoseTagsOpts | null) ?? {};
    eid = { id: 0, source: null } as unknown as EID;
  }
  if (n === "all") {
    loseTags(state, side, eid, state.runner.tag.base ?? 0, opts);
    return;
  }

  const actualN = Math.min(n, state.runner.tag.base ?? 0);
  if (actualN <= 0) return;

  // Update lose stats
  const stats = state.stats;
  const runnerStats = stats?.runner;
  const loseStats =
    runnerStats && typeof runnerStats === "object"
      ? runnerStats.lose
      : undefined;
  if (loseStats && typeof loseStats === "object") {
    const loseRecord = loseStats as Record<string, number | undefined>;
    loseRecord.tag = (loseRecord.tag ?? 0) + actualN;
  }

  deduct(state, RUNNER_SIDE, "tag", { base: actualN });
  updateTagStatus(state);
  queueEvent(state, "runner-lose-tag", { amount: actualN, side });

  if (opts.suppressCheckpoint) {
    effectCompleted(state, null, eid);
  } else {
    checkpoint(state, null, eid);
  }
}

export { countTags, isTagged } from "../../jinteki/utils";
export { removeTag } from "./actions_2";
export { sameSide, sideStr } from "../utils";
export { otherSide } from "../../jinteki/utils";

/** Alias for gainTags — clj-style `add-tag` API. */
export const addTag = gainTags;
