// Expose resolution.
// Mirrors: src/clj/game/core/expose.clj

import type { GameState } from "./state";
import type { EID } from "./eid";
import type { Card } from "./card";
import { isRezzed } from "./card";
import { cardDef } from "./card_defs";
import { completeWithResult, effectCompleted } from "./eid";
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
export async function resolveExpose(
  state: GameState,
  side: string,
  eid: EID,
  targets: Card[],
  args: ExposeArgs,
): Promise<void> {
  if (targets.length === 0) {
    effectCompleted(state, side, eid);
    return;
  }

  const msg = `${args.card ? `uses ${args.card.title} to expose ` : "exposes "}${enumerateStr(
    targets.map((t) => cardStr(state, t, { visible: true })),
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

  await checkpoint(state, side, { duration: "expose" });
  completeWithResult(state, side, eid, { cards: targets });
}

/**
 * Exposes the given cards.
 * Mirrors: expose in expose.clj
 */
export async function expose(
  state: GameState,
  side: string,
  eid: EID,
  targets: Card[],
  args?: ExposeArgs | null,
): Promise<void> {
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
  const result = await resolveExposePrevention(state, side, filtered, a);
  await resolveExpose(state, side, eid, result.remaining, a);
}
