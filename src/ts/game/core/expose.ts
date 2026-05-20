// Expose resolution.
// Mirrors: src/clj/game/core/expose.clj

import type { GameState } from "./state";
import type { EID } from "./eid";
import type { Card } from "./card";
import { isRezzed } from "./card";
import { cardDef } from "./card_defs";
import {
  completeWithResult,
  effectCompleted,
  makeEID,
  registerEffectCompleted,
} from "./eid";
import { anyEffects } from "./effects";
import { checkpoint, queueEvent, registerPendingEvent } from "./engine";
import { resolveExposePrevention } from "./prevention";
import { systemMsg } from "./say";
import { cardStr } from "./to_string";
import { enumerateStr } from "../utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExposeArgs {
  card?: Card | null;
  unpreventable?: boolean;
}

// ---------------------------------------------------------------------------
// Expose resolution
// ---------------------------------------------------------------------------

/**
 * Core expose logic: log the action, fire on-expose abilities, queue the
 * :expose event, run a checkpoint, then complete.
 * Mirrors: resolve-expose in expose.clj
 */
export function resolveExpose(
  state: GameState,
  side: string,
  eid: EID,
  targets: Card[],
  args: ExposeArgs,
): void {
  if (targets.length === 0) {
    effectCompleted(state, side, eid);
    return;
  }

  const msg = `${args.card ? `uses ${args.card.title} to expose ` : "exposes "}${enumerateStr(
    targets.map((t: any) => cardStr(state, t, { visible: true })),
  )}`;
  systemMsg(state, side, msg);

  for (const t of targets) {
    const ability = cardDef(t).onExpose;
    if (ability) {
      // if it gets rezzed by blackguard or something, the effect shouldn't fizzle
      registerPendingEvent(state, "expose", t, {
        ...ability,
        condition: "installed",
      });
    }
  }

  queueEvent(state, "expose", { cards: targets });

  const checkpointEid = makeEID(state);
  registerEffectCompleted(state, checkpointEid, ((
    _s: GameState,
    _sd: string,
    _e: EID,
  ) => {
    completeWithResult(state, side, eid, { cards: targets });
  }) as any);
  checkpoint(state, side, checkpointEid, { duration: "expose" });
}

/**
 * Exposes the given cards.
 * Mirrors: expose in expose.clj
 */
export function expose(state: any, side?: any, eid?: any, targets?: any, args?: any): any;
export function expose(
  state: GameState,
  side: string,
  eid: EID,
  targets: Card[],
  args?: ExposeArgs | null,
): void {
  const resolvedArgs = args ?? {};
  const a: ExposeArgs = {
    ...resolvedArgs,
    card: eid.source ?? null,
  };

  // Filter out rezzed, nil, and prevented cards
  const filtered = targets.filter(
    (target) =>
      target &&
      !isRezzed(target) &&
      !anyEffects(
        state,
        side,
        "cannot-be-exposed",
        (v) => v === true,
        target,
        [],
      ),
  );

  if (filtered.length === 0) {
    effectCompleted(state, side, eid); // cannot expose faceup cards
    return;
  }

  // Mirrors: (wait-for (resolve-expose-prevention state side targets args) ...)
  // resolveExposePrevention signals completion via the inner eid; we register
  // a continuation to read the `remaining` cards and resume.
  const preventionEid = makeEID(state);
  registerEffectCompleted(state, preventionEid, ((
    _s: GameState,
    _sd: string,
    completedEid: EID,
  ) => {
    const result: any = (completedEid as any).result;
    const remaining: Card[] = Array.isArray(result?.remaining)
      ? result.remaining
      : filtered;
    resolveExpose(state, side, eid, remaining, a);
  }) as any);
  resolveExposePrevention(state, side, preventionEid, filtered, {
    unpreventable: a.unpreventable,
    card: a.card ?? undefined,
  });
}
