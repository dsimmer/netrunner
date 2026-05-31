// Bad publicity gain/lose/spend functions.
// Mirrors: src/clj/game/core/bad_publicity.clj

import type { GameState } from "./state";
import type { Card } from "./card";
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

interface BadPubArgs {
  noEvent?: boolean;
  unpreventable?: boolean;
  card?: Card;
  [key: string]: unknown;
}

/** Attempts to give the corp n bad publicity, allowing for boosting/prevention effects.
 *  Permissive arg types — tier-2 card files pass legacy 1-arg / 2-arg shapes. */
export async function gainBadPublicity(
  state: GameState | string | number | unknown,
  side?: string | unknown,
  eidOrN?: EID | number | BadPubArgs,
  n?: number | BadPubArgs,
  args?: BadPubArgs | null,
): Promise<void> {
  if (!state || typeof state !== "object" || !("corp" in (state as object))) {
    return; // legacy no-state call → no-op
  }
  const realState = state as GameState;
  const realSide = typeof side === "string" ? side : "corp";
  const resolvedEid: EID =
    eidOrN && typeof eidOrN === "object" && "id" in eidOrN ? (eidOrN as EID) : makeEID(realState);
  // Legacy callers pass args at n position; detect and shift.
  const resolvedArgs: BadPubArgs =
    (args ?? (typeof n === "object" && n !== null ? n : null)) ?? {};
  const amount =
    typeof n === "number"
      ? n
      : typeof eidOrN === "number"
        ? eidOrN
        : 0;
  resolveBadPubPrevention(realState, realSide, resolvedEid, amount, resolvedArgs);
  await resolveBadPublicity(realState, realSide, resolvedEid, amount, resolvedArgs);
}

export async function loseBadPublicity(
  state: GameState | string | unknown,
  side?: string | unknown,
  eid?: EID | number | BadPubArgs | null | undefined,
  n?: number | "all" | BadPubArgs,
  args?: BadPubArgs | null,
): Promise<void> {
  if (!state || typeof state !== "object" || !("corp" in (state as object))) {
    return; // legacy no-state call → no-op
  }
  const realState = state as GameState;
  const realSide = typeof side === "string" ? side : "corp";
  const resolvedEid: EID =
    eid && typeof eid === "object" && "id" in eid ? (eid as EID) : makeEID(realState);
  // Legacy callers pass args at n position; detect and shift.
  const resolvedArgs: BadPubArgs =
    (args ?? (typeof n === "object" && n !== null ? (n as BadPubArgs) : null)) ?? {};
  const { noEvent } = resolvedArgs;

  if (n === "all") {
    const base =
      (realState.corp as unknown as Record<string, Record<string, number>>)["bad-publicity"]?.[
        "base"
      ] ?? 0;
    return loseBadPublicity(realState, realSide, resolvedEid, base, resolvedArgs);
  }

  const amount = typeof n === "number" ? n : 0;
  const current =
    (realState.corp as unknown as Record<string, Record<string, number>>)["bad-publicity"]?.[
      "base"
    ] ?? 0;
  const actual = Math.min(amount, current);
  lose(realState, "corp", "bad-publicity", actual);

  if (noEvent) {
    effectCompleted(realState, realSide, resolvedEid);
  } else {
    await triggerEventSync(
      realState,
      realSide,
      resolvedEid,
      "corp-lose-bad-publicity",
      { amount: actual, side: realSide },
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
