// Tag management: summing effects, updating tag status, gaining/losing tags.
// Mirrors: src/clj/game/core/tags.clj

import type { GameState } from "./state";
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
  card?: { cid: string; title: string } | null;
  suppressCheckpoint?: boolean;
}

/**
 * Attempts to give the runner n tags, allowing for boosting/prevention effects.
 * Mirrors: gain-tags in tags.clj
 */
export function gainTags(state: GameState, side: string, eid: EID, n: number, opts?: GainTagsOpts | null): void;
export function gainTags(...rawArgs: any[]): void;
export function gainTags(...rawArgs: any[]): void {
  let state: GameState, side: string, eid: EID, n: number;
  let opts: GainTagsOpts = {};
  if (rawArgs.length >= 4 && typeof rawArgs[2] === "object" && rawArgs[2] !== null && "id" in rawArgs[2]) {
    [state, side, eid, n] = rawArgs as any;
    opts = rawArgs[4] ?? {};
  } else {
    // (state, side, n, opts?) — legacy short form
    state = rawArgs[0]; side = rawArgs[1]; n = rawArgs[2];
    opts = rawArgs[3] ?? {};
    eid = { id: 0, source: null } as unknown as EID;
  }
  opts = opts ?? {};
  const { unpreventable, card, suppressCheckpoint } = opts;

  // Mirrors: (wait-for (resolve-tag-prevention ...) (resolve-tag ... async-result))
  // resolveTagPrevention signals completion on its eid via completeWithResult.
  // We register an effect-completed handler on a fresh inner eid so we can
  // capture the `remaining` count, then resolve the actual tag gain.
  const innerEid = makeEID(state);
  registerEffectCompleted(state, innerEid, ((
    _s: GameState,
    _sd: string,
    completedEid: EID,
  ) => {
    const result: any = (completedEid as any).result;
    const remaining: number =
      typeof result === "number"
        ? result
        : (result?.remaining ?? result?.["paid/value"] ?? n);
    resolveTag(state, side, eid, card ?? null, remaining, suppressCheckpoint);
  }) as any);
  resolveTagPrevention(state, side, innerEid, n, { unpreventable, card: card as any });
}

/**
 * Take n tags (ability-returning helper).
 * Mirrors: gain-tags-ability in tags.clj
 */
export function gainTagsAbility(n: number): any {
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
export function loseTags(state: GameState, side: string, eid: EID, n: number | "all", opts?: { suppressCheckpoint?: boolean } | null): void;
export function loseTags(...rawArgs: any[]): void;
export function loseTags(...rawArgs: any[]): void {
  let state: GameState, side: string, eid: EID, n: number | "all";
  let opts: { suppressCheckpoint?: boolean } = {};
  if (rawArgs.length >= 4 && typeof rawArgs[2] === "object" && rawArgs[2] !== null && "id" in rawArgs[2]) {
    [state, side, eid, n] = rawArgs as any;
    opts = rawArgs[4] ?? {};
  } else {
    state = rawArgs[0]; side = rawArgs[1]; n = rawArgs[2];
    opts = rawArgs[3] ?? {};
    eid = { id: 0, source: null } as unknown as EID;
  }
  opts = opts ?? {};
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
