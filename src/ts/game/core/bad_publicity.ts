// Bad publicity gain/lose/spend functions.
// Mirrors: src/clj/game/core/bad_publicity.clj

import type { GameState } from "./state";
import type { EID } from "./eid";
import { makeEID, effectCompleted } from "./eid";
import { gain, lose } from "./gaining";
import { toast } from "./toasts";
import { queueEvent } from "./engine";
import { checkpoint } from "./checkpoint";
import { triggerEventSync } from "./engine";
import { resolveBadPubPrevention } from "./prevention";

export interface BadPublicityArgs {
  suppressCheckpoint?: boolean;
  unpreventable?: boolean;
  card?: unknown;
  noEvent?: boolean;
}

/** Amount of bad publicity available for this run (runner only). */
export function badPublicityAvailable(state: GameState, side: string): number {
  if (side === "runner") {
    return (
      (state.run as unknown as Record<string, number>)?.["bad-publicity-available"] ?? 0
    );
  }
  return 0;
}

async function resolveBadPublicity(
  state: GameState,
  side: string,
  eid: EID,
  n: number,
  args: BadPublicityArgs,
): Promise<void> {
  if (n > 0) {
    gain(state, "corp", "bad-publicity", n);
    toast(state, "corp", `Took ${n} bad publicity!`, "info");
    queueEvent(state, "corp-gain-bad-publicity", { amount: n });
    if (args.suppressCheckpoint) {
      effectCompleted(state, side, eid);
    } else {
      checkpoint(state, null, eid);
    }
  } else {
    effectCompleted(state, side, eid);
  }
}

/** Attempts to give the corp n bad publicity, allowing for boosting/prevention effects. */
export async function gainBadPublicity(
  state: any,
  side?: any,
  eid?: any,
  n?: any,
  args?: any,
): Promise<void> {
  const resolvedEid = (eid && typeof eid === 'object' && 'id' in eid) ? eid : makeEID(state);
  const resolvedArgs = args ?? {};
  const amount = typeof n === 'number' ? n : (typeof eid === 'number' ? eid : 0);
  resolveBadPubPrevention(state, side, resolvedEid, amount, resolvedArgs);
  await resolveBadPublicity(state, side, resolvedEid, amount, resolvedArgs);
}

export async function loseBadPublicity(
  state: any,
  side?: any,
  eid?: any,
  n?: any,
  args?: any,
): Promise<void> {
  const resolvedEid = eid ?? makeEID(state);
  const { noEvent } = args ?? {};

  if (n === "all") {
    const base =
      (state.corp as Record<string, Record<string, number>>)["bad-publicity"]?.[
        "base"
      ] ?? 0;
    return loseBadPublicity(state, side, resolvedEid, base, args);
  }

  const current =
    (state.corp as Record<string, Record<string, number>>)["bad-publicity"]?.[
      "base"
    ] ?? 0;
  const actual = Math.min(n, current);
  lose(state, "corp", "bad-publicity", actual);

  if (noEvent) {
    effectCompleted(state, side, resolvedEid);
  } else {
    await triggerEventSync(
      state,
      side,
      resolvedEid,
      "corp-lose-bad-publicity",
      { amount: actual, side },
    );
  }
}

/** Spend bad publicity during a run. */
export function spendBadPublicity(
  state: GameState,
  side: string,
  amt: number,
): void {
  if (side === "runner" && badPublicityAvailable(state, side) > 0) {
    const run = state.run as unknown as Record<string, number>;
    run["bad-publicity-available"] =
      (run["bad-publicity-available"] ?? 0) - amt;
  }
}

export { countBadPub, hasBadPub } from "../../jinteki/utils";

/** Alias for countBadPub. */
export { countBadPub as countBadPublicity } from "../../jinteki/utils";

/** Alias for hasBadPub. */
export { hasBadPub as hasBadPublicity } from "../../jinteki/utils";
