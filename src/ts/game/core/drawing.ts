// Card drawing mechanics.
// Mirrors: src/clj/game/core/drawing.clj

import type { GameState } from "./state.js";
import type { Card } from "./card.js";
import type { EID } from "./eid.js";
import type { Ability } from "./types.js";
import { getPlayer } from "./state.js";
import { getTitle } from "./card.js";
import { cardDef } from "./card_defs.js";
import {
  effectCompleted, makeEID, makeEIDFrom, makeResult, registerEIDCallback,
} from "./eid.js";
import {
  checkpoint, queueEvent, registerPendingEvent, resolveAbility,
  triggerEvent, triggerEventSimult, triggerEventSync,
} from "./engine.js";
import { firstEvent } from "./events.js";
import { preventDraw } from "./flags.js";
import { move } from "./moving.js";
import { systemMsg } from "./say.js";
import { setAsideForMe, getSetAside } from "./set_aside.js";
import { winDecked } from "./winning.js";
import { continue_ability, msg, req } from "../macros.js";
import { quantify, safeZero } from "../utils.js";
import { otherSide } from "../../jinteki/utils.js";

interface DrawOpts {
  suppressEvent?: boolean;
  noUpdateDrawStats?: boolean;
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
  registerEIDCallback(state, inner, (_s, _side, completed) => {
    next((completed as EID).result, completed as EID);
  });
  start(inner);
}

function getRegister(state: GameState, side: string): Record<string, any> {
  const player = getPlayer(state, side) as any;
  if (!player.register) player.register = {};
  return player.register as Record<string, any>;
}

function getBonus(state: GameState): Record<string, any> {
  const b = ((state.bonus ?? {}) as Record<string, any>);
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
export function remainingDraws(state: GameState, side: string): number | undefined {
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
export function clickDrawBonus(state: GameState, _side: string, n: number): void {
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
export function draw(
  state: GameState,
  side: string,
  eid: EID,
  n: number,
  opts: DrawOpts = {},
): void {
  if (n === 0) {
    effectCompleted(state, side, eid);
    return;
  }

  const preEvent = side === "corp" ? "pre-corp-draw" : "pre-runner-draw";

  waitFor(
    state, eid,
    (inner) => triggerEventSimult(
      state, side, inner, preEvent, {}, { count: n },
    ),
    () => {
      const bonusDraw = ((state.bonus as any)?.draw as number | undefined) ?? 0;
      const totalN = n + bonusDraw;
      const drawsWanted = totalN;
      const activePlayer = state.activePlayer;
      const reg = getRegister(state, side);
      const activeReg = getRegister(state, activePlayer);
      const drawsAfterPrevent = (side === activePlayer && activeReg["max-draw"] != null)
        ? Math.min(totalN, remainingDraws(state, side) ?? 0)
        : totalN;
      const player = getPlayer(state, side) as any;
      const deckCount = (player.deck as Card[]).length;

      // Clear bonus draws
      if (state.bonus && typeof state.bonus === "object") {
        delete (state.bonus as any).draw;
      }

      if (side === "corp" && deckCount < drawsAfterPrevent) {
        if (winDecked(state) && !(state as any).winnerDeclared) {
          triggerEvent(state, "runner", "win", { winner: "runner" });
        }
      }

      if (drawsAfterPrevent < drawsWanted) {
        const prevented = drawsWanted - drawsAfterPrevent;
        systemMsg(
          state, otherSide(side) ?? "",
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

      reg["drawn-this-turn"] = ((reg["drawn-this-turn"] as number | undefined) ?? 0) + drawnCount;

      if (!opts.noUpdateDrawStats) {
        const stats = state.stats as any;
        if (!stats[side]) stats[side] = {};
        if (!stats[side].gain) stats[side].gain = {};
        stats[side].gain.card = (stats[side].gain.card ?? 0) + totalN;
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
      if (!Array.isArray(reg["currently-drawing"])) reg["currently-drawing"] = [];
      (reg["currently-drawing"] as Card[][]).push(drawn);

      for (const c of drawn) {
        const onDraw = (cardDef(c) as any)?.["on-draw"];
        if (onDraw) {
          registerPendingEvent(state, drawEvent, c, { ...onDraw, location: "set-aside" });
        }
      }

      queueEvent(state, drawEvent, { cards: drawn, count: drawnCount });

      waitFor(
        state, eid,
        (inner) => checkpoint(state, null, inner, null),
        () => {
          for (const c of getSetAside(state, side, setAsideEid)) {
            move(state, side, c, "hand");
          }
          const postEvent = side === "corp" ? "post-corp-draw" : "post-runner-draw";
          waitFor(
            state, eid,
            (inner) => triggerEventSync(state, side, inner, postEvent, { count: drawnCount }),
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
    state, side,
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
            systemMsg(s, side, `declines to use ${getTitle(card)} to draw cards`),
          ),
        },
      },
    } as unknown as Ability,
    card as unknown as Card, [],
  );
}

/** Prompt to draw up to n cards. */
export function drawUpTo(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  n: number,
  args: DrawUpToArgs = { allowZeroDraws: true },
): void {
  if (n === 0) {
    draw(state, side, eid, 0, args);
    return;
  }
  const allowZero = args.allowZeroDraws;
  continue_ability(
    state, side,
    {
      prompt: `Draw how many cards?${allowZero ? "" : " (minimum 1)"}`,
      choices: {
        number: req(() => n),
        max: req(() => n),
        default: req(() => n),
      },
      "waiting-prompt": true,
      async: true,
      msg: msg((_s: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) =>
        `draw ${quantify((targets?.[0] as number) ?? 0, "card")}`,
      ),
      effect: req((s: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) => {
        const target = targets?.[0] as number | undefined;
        if (!target && !allowZero) {
          drawUpTo(s, side, makeEID(s), card, n, args);
        } else {
          draw(s, side, eid, target ?? 0, args);
        }
      }),
    } as unknown as Ability,
    card as unknown as Card, [],
  );
}

// Resolve-ability re-export touchpoint (kept for parity with Clojure ns require list).
export { resolveAbility };
