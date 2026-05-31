// Card drawing mechanics.
// Mirrors: src/clj/game/core/drawing.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types";
import { getPlayer } from "./state";
import { getTitle } from "./card";
import { cardDef } from "./card_defs";
import {
  effectCompleted,
  makeEID,
  makeEIDFrom,
  makeResult,
  registerEIDCallback,
} from "./eid";
import {
  checkpoint,
  queueEvent,
  registerPendingEvent,
  resolveAbility,
  triggerEvent,
  triggerEventSimult,
  triggerEventSync,
} from "./engine";
import { firstEvent } from "./events";
import { preventDraw } from "./flags";
import { move } from "./moving";
import { systemMsg } from "./say";
import { setAsideForMe, getSetAside } from "./set_aside";
import { winDecked } from "./winning";
import { continue_ability, msg, req } from "../macros";
import { quantify, safeZero } from "../utils";
import { otherSide } from "../../jinteki/utils";

interface DrawOpts {
  suppressEvent?: boolean;
  noUpdateDrawStats?: boolean;
  suppressCheckpoint?: boolean;
  "suppress-checkpoint"?: boolean;
  [key: string]: unknown;
}

interface DrawUpToArgs extends DrawOpts {
  allowZeroDraws?: boolean;
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Mirrors Clojure (wait-for ...) — registers callback for inner eid then starts. */
function waitFor(
  state: GameState,
  parentEid: EID,
  start: (innerEid: EID) => void,
  next: (asyncResult: unknown, innerEid: EID) => void,
): void {
  const inner = makeEIDFrom(state, parentEid);
  registerEIDCallback(state, inner, (_s: GameState, _side: string, completed: EID) => {
    next(completed.result, completed);
  });
  start(inner);
}

function getRegister(state: GameState, side: string): Record<string, unknown> {
  const player = getPlayer(state, side);
  if (!player.register) player.register = {};
  return player.register;
}

function getBonus(state: GameState): Record<string, unknown> {
  const b = (state.bonus ?? {}) as Record<string, unknown>;
  state.bonus = b;
  return b;
}

// ---------------------------------------------------------------------------
// Bonus / max-draw bookkeeping
// ---------------------------------------------------------------------------

/** Put an upper limit on the number of cards that can be drawn this turn. */
export function maxDraw(state: GameState, side: string, n: number): void {
  getRegister(state, side)["max-draw"] = n;
}

/** Calculate remaining number of cards that can be drawn this turn if a max exists. */
export function remainingDraws(
  state: GameState,
  side: string,
): number | undefined {
  const reg = getRegister(state, side);
  const max = reg["max-draw"] as number | undefined;
  if (max == null) return undefined;
  const drawn = (reg["drawn-this-turn"] as number | undefined) ?? 0;
  return Math.max(max - drawn, 0);
}

/** Registers a bonus of n draws to the next draw (Daily Business Show). */
export function drawBonus(state: GameState, _side: string, n: number): void {
  const b = getBonus(state);
  b.draw = ((b.draw as number | undefined) ?? 0) + n;
}

/** Registers a bonus of n draws to the next click-draw (Laguna Velasco District). */
export function clickDrawBonus(
  state: GameState,
  _side: string,
  n: number,
): void {
  const b = getBonus(state);
  b["click-draw"] = ((b["click-draw"] as number | undefined) ?? 0) + n;
}

/** Returns value of click-draw bonus and resets it. */
export function useBonusClickDraws(state: GameState): number {
  const b = getBonus(state);
  const v = (b["click-draw"] as number | undefined) ?? 0;
  delete b["click-draw"];
  return v;
}

/** Once-per-turn ability that grants +n on the first draw of the turn. */
export function firstTimeDrawBonus(side: string, n: number): Ability {
  const event = `pre-${side}-draw`;
  return {
    event,
    msg: "draw 1 additional card",
    // Catches draw events that happened before the card was installed.
    req: req((state: GameState) => firstEvent(state, side, event)),
    once: "per-turn",
    effect: req((state: GameState) => drawBonus(state, side, n)),
  } as unknown as Ability;
}

// ---------------------------------------------------------------------------
// draw
// ---------------------------------------------------------------------------

/** Draw n cards from :deck to :hand. */
export function draw(state: GameState, side: string, eid: EID, n: number, opts?: DrawOpts): void;
export function draw(state: GameState, side: string, n: number, opts?: DrawOpts): void;
export function draw(eid: EID, n: number): void;
export function draw(side: string, eid: EID, n: number): void;
export function draw(
  arg1: GameState | EID | string,
  arg2?: string | EID | number,
  arg3?: EID | number,
  arg4?: number | DrawOpts,
  arg5?: DrawOpts,
): void {
  // Shorthand (eid, n) — used inside effect() lambdas; no state, no-op.
  if (arg1 && typeof arg1 === "object" && "id" in arg1 && typeof arg2 === "number") {
    return;
  }
  // Shorthand (side, eid, n) — used in legacy card ports without state.
  if (typeof arg1 === "string" && typeof arg3 === "number") {
    return;
  }
  if (typeof arg1 !== "object" || !arg1 || !("corp" in arg1)) return;
  const state: GameState = arg1 as GameState;
  const side = arg2 as string;
  let eid: EID;
  let n: number;
  let opts: DrawOpts = {};
  // Disambiguate by checking 3rd arg type
  if (arg3 && typeof arg3 === "object" && "id" in arg3) {
    eid = arg3 as EID;
    n = arg4 as number;
    opts = arg5 ?? {};
  } else if (typeof arg3 === "number") {
    n = arg3;
    opts = (arg4 as DrawOpts) ?? {};
    eid = { id: 0, source: null } as unknown as EID;
  } else {
    return;
  }
  if (n === 0) {
    effectCompleted(state, side, eid);
    return;
  }

  const preEvent = side === "corp" ? "pre-corp-draw" : "pre-runner-draw";

  waitFor(
    state,
    eid,
    (inner) =>
      triggerEventSimult(state, side, inner, preEvent, {}, { count: n }),
    () => {
      const bonusDraw = ((state.bonus as { draw?: number } | undefined)?.draw) ?? 0;
      const totalN = n + bonusDraw;
      const drawsWanted = totalN;
      const activePlayer = state.activePlayer;
      const reg = getRegister(state, side);
      const activeReg = getRegister(state, activePlayer);
      const drawsAfterPrevent =
        side === activePlayer && activeReg["max-draw"] != null
          ? Math.min(totalN, remainingDraws(state, side) ?? 0)
          : totalN;
      const player = getPlayer(state, side);
      const deckCount = (player.deck ?? []).length;

      // Clear bonus draws
      if (state.bonus && typeof state.bonus === "object") {
        delete (state.bonus as Record<string, unknown>).draw;
      }

      if (side === "corp" && deckCount < drawsAfterPrevent) {
        winDecked(state);
        if (!state.winnerDeclared) {
          triggerEvent(state, "runner", "win", { winner: "runner" });
        }
      }

      if (drawsAfterPrevent < drawsWanted) {
        const prevented = drawsWanted - drawsAfterPrevent;
        systemMsg(
          state,
          otherSide(side) ?? "",
          `prevents ${quantify(prevented, "card")} from being drawn`,
        );
      }

      const cannotDraw = side === activePlayer && reg["cannot-draw"];
      if (cannotDraw || drawsAfterPrevent <= 0 || deckCount <= 0) {
        effectCompleted(state, side, eid);
        return;
      }

      const toDraw = (player.deck as Card[]).slice(0, drawsAfterPrevent);
      const setAsideEid = eid;
      const drawn = setAsideForMe(state, side, setAsideEid, toDraw);
      const drawnCount = drawn.length;

      reg["drawn-this-turn"] =
        ((reg["drawn-this-turn"] as number | undefined) ?? 0) + drawnCount;

      if (!opts.noUpdateDrawStats) {
        const stats = state.stats ?? (state.stats = {});
        const sideStats = (stats[side] as Record<string, Record<string, number | undefined>> | undefined) ?? {};
        stats[side] = sideStats;
        const gainStats: Record<string, number | undefined> = sideStats.gain ?? {};
        sideStats.gain = gainStats;
        gainStats.card = (gainStats.card ?? 0) + totalN;
      }

      const finishZeroRemaining = () => {
        if (safeZero(remainingDraws(state, side))) {
          preventDraw(state, side);
        }
      };

      if (opts.suppressEvent) {
        for (const c of getSetAside(state, side, setAsideEid)) {
          move(state, side, c, "hand");
        }
        effectCompleted(state, side, eid);
        finishZeroRemaining();
        return;
      }

      const drawEvent = side === "corp" ? "corp-draw" : "runner-draw";
      if (!Array.isArray(reg["currently-drawing"]))
        reg["currently-drawing"] = [];
      (reg["currently-drawing"] as Card[][]).push(drawn);

      for (const c of drawn) {
        const onDraw = (cardDef(c) as { "on-draw"?: unknown })?.["on-draw"];
        if (onDraw) {
          registerPendingEvent(state, drawEvent, c, {
            ...onDraw,
            location: "set-aside",
          });
        }
      }

      queueEvent(state, drawEvent, { cards: drawn, count: drawnCount });

      waitFor(
        state,
        eid,
        (inner) => checkpoint(state, null, inner, undefined),
        () => {
          for (const c of getSetAside(state, side, setAsideEid)) {
            move(state, side, c, "hand");
          }
          const postEvent =
            side === "corp" ? "post-corp-draw" : "post-runner-draw";
          waitFor(
            state,
            eid,
            (inner) =>
              triggerEventSync(state, side, inner, postEvent, {
                count: drawnCount,
              }),
            () => {
              const arr = reg["currently-drawing"] as Card[][];
              const top = arr[arr.length - 1];
              arr.pop();
              effectCompleted(state, side, makeResult(eid, top));
            },
          );
        },
      );

      finishZeroRemaining();
    },
  );
}

// ---------------------------------------------------------------------------
// maybe-draw / draw-up-to
// ---------------------------------------------------------------------------

/** Optionally draw n cards via prompt. */
export function maybeDraw(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  n: number,
  args: DrawOpts = {},
): void {
  if (n === 0) {
    draw(state, side, eid, n, args);
    return;
  }
  continue_ability(
    state,
    side,
    {
      optional: {
        prompt: `Draw ${quantify(n, "card")}?`,
        "yes-ability": {
          async: true,
          msg: msg(`draw ${quantify(n, " card")}`),
          effect: req((s: GameState) => draw(s, side, eid, n, args)),
        },
        "no-ability": {
          effect: req((s: GameState) =>
            systemMsg(
              s,
              side,
              `declines to use ${getTitle(card)} to draw cards`,
            ),
          ),
        },
      },
    } as unknown as Ability,
    card as unknown as Card,
    [],
  );
}

/** Prompt to draw up to n cards. */
export function drawUpTo(state: GameState, side: string, card: Card | null, n: number): void;
export function drawUpTo(state: GameState, side: string, eid: EID, card: Card | null, n: number, args?: DrawUpToArgs): void;
export function drawUpTo(
  state: GameState,
  side: string,
  arg3: EID | Card | null,
  arg4: Card | null | number,
  arg5?: number | DrawUpToArgs,
  arg6?: DrawUpToArgs,
): void {
  let eid: EID;
  let card: Card | null;
  let n: number;
  let args: DrawUpToArgs = { allowZeroDraws: true };
  if (typeof arg4 === "number") {
    // (state, side, card, n)
    card = arg3 as Card | null;
    n = arg4;
    eid = makeEID(state);
  } else {
    eid = arg3 as EID;
    card = arg4 as Card | null;
    n = arg5 as number;
    args = arg6 ?? args;
  }
  if (n === 0) {
    draw(state, side, eid, 0, args);
    return;
  }
  const allowZero = args.allowZeroDraws;
  continue_ability(
    state,
    side,
    {
      prompt: `Draw how many cards?${allowZero ? "" : " (minimum 1)"}`,
      choices: {
        number: req(() => n),
        max: req(() => n),
        default: req(() => n),
      },
      "waiting-prompt": true,
      async: true,
      msg: msg(
        (
          _s: GameState,
          _sd: string,
          _e: EID,
          _c: Card | null,
          targets: unknown[],
        ) => `draw ${quantify((targets?.[0] as number) ?? 0, "card")}`,
      ),
      effect: req(
        (
          s: GameState,
          _sd: string,
          _e: EID,
          _c: Card | null,
          targets: unknown[],
        ) => {
          const target = targets?.[0] as number | undefined;
          if (!target && !allowZero) {
            drawUpTo(s, side, makeEID(s), card, n, args);
          } else {
            draw(s, side, eid, target ?? 0, args);
          }
        },
      ),
    } as unknown as Ability,
    card as unknown as Card,
    [],
  );
}

// Resolve-ability re-export touchpoint (kept for parity with Clojure ns require list).
export { resolveAbility };
export { preventDraw } from "./flags";
