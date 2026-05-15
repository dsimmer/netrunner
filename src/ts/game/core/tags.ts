// Tag management: summing effects, updating tag status, gaining/losing tags.
// Mirrors: src/clj/game/core/tags.clj

import type { GameState } from "./state.js";
import type { EID } from "./eid.js";
import { RUNNER_SIDE } from "./state.js";
import { anyEffects, sumEffects } from "./effects.js";
import { effectCompleted } from "./eid.js";
import { triggerEvent, queueEvent, checkpoint } from "./engine.js";
import { gain, deduct } from "./gaining.js";
import { resolveTagPrevention } from "./prevention.js";
import { toast } from "./toasts.js";
import { quantify } from "../utils.js";
import { req } from "../macros.js";

// ---------------------------------------------------------------------------
// Tag effect summation
// ---------------------------------------------------------------------------

/**
 * Sums all tag effects (base + user-tags + tags effects).
 * Mirrors: sum-tag-effects in tags.clj
 */
export function sumTagEffects(state: GameState): number {
  return (state.runner.tag.base ?? 0)
    + sumEffects(state, RUNNER_SIDE, "user-tags", null, [])
    + sumEffects(state, RUNNER_SIDE, "tags", null, []);
}

/**
 * Recalculates tag totals and fires :tags-changed if anything differs.
 * Mirrors: update-tag-status in tags.clj
 */
export function updateTagStatus(state: GameState): boolean {
  const oldTotal = state.runner.tag.total ?? 0;
  const newTotal = sumTagEffects(state);
  const isTagged = anyEffects(state, RUNNER_SIDE, "is-tagged", () => true, null, [])
    || newTotal > 0;

  const oldTags = { total: oldTotal, isTagged: state.runner.tag.isTagged ?? false };
  const newTags = { total: newTotal, isTagged };

  const changed = oldTags.total !== newTags.total || oldTags.isTagged !== newTags.isTagged;

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
export function gainTags(
  state: GameState,
  side: string,
  eid: EID,
  n: number,
  opts: GainTagsOpts = {},
): void {
  const { unpreventable, card, suppressCheckpoint } = opts;

  // Use wait_for pattern to chain prevention → resolve
  // Mirrors: (wait-for (resolve-tag-prevention ...) (resolve-tag ... async-result))
  resolveTagPrevention(state, side, eid, n, { unpreventable, card }, (remaining) => {
    resolveTag(state, side, eid, card ?? null, remaining, suppressCheckpoint);
  });
}

/**
 * Take n tags (ability-returning helper).
 * Mirrors: gain-tags-ability in tags.clj
 */
export function gainTagsAbility(n: number): {
  msg: string;
  async: boolean;
  effect: (state: GameState, side: string, eid: EID, card: unknown, targets: unknown[]) => void;
} {
  return {
    msg: `take ${quantify(n, "tag")}`,
    async: true,
    effect: req(function(this: unknown, s: GameState, sid: string, e: EID) {
      gainTags(s, sid, e, n);
    }),
  };
}

/**
 * Always removes `:base` tags.
 * Mirrors: lose-tags in tags.clj
 */
export function loseTags(
  state: GameState,
  side: string,
  eid: EID,
  n: number | "all",
  opts: { suppressCheckpoint?: boolean } = {},
): void {
  if (n === "all") {
    loseTags(state, side, eid, state.runner.tag.base ?? 0, opts);
    return;
  }

  const actualN = Math.min(n, state.runner.tag.base ?? 0);
  if (actualN <= 0) return;

  // Update lose stats
  const stats = (state as any).stats;
  if (stats?.runner?.lose) {
    stats.runner.lose.tag = (stats.runner.lose.tag ?? 0) + actualN;
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
