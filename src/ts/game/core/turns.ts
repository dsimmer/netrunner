// Turn management: start-turn, end-turn, phase-1.2, post-discard phases.
// Mirrors: src/clj/game/core/turns.clj

import type { GameState } from "./state.js";
import type { Card } from "./card.js";
import type { EID } from "./eid.js";
import { CORP_SIDE, RUNNER_SIDE } from "./state.js";
import {
  isFacedown, hasSubtype, inHand,
} from "./card.js";
import { getCard } from "./finding.js";
import {
  makeEID, makeEIDFrom, effectCompleted,
  registerEIDCallback,
} from "./eid.js";
import {
  triggerEvent, triggerEventSimult, queueEvent,
  unregisterFloatingEvents, updateFloatingEventDurations,
} from "./engine.js";
import { cardFlagFn, clearTurnRegister } from "./flags.js";
import { gain, lose } from "./gaining.js";
import { handSizeEffective } from "./hand_size.js";
import { updateAllIce, updateBreakerStrength } from "./ice.js";
import { systemMsg } from "./say.js";
import { toast } from "./toasts.js";
import { update } from "./update.js";
import { flatline } from "./winning.js";
import { draw } from "./drawing.js";
import { move } from "./moving.js";
import { otherSide } from "../../jinteki/utils.js";
import { quantify, enumerateStr } from "../utils.js";
import {
  allActive, allActiveInstalled, allInstalled, allInstalledAndScored,
} from "./board.js";
import {
  updateAllAdvancementRequirements,
} from "./agendas.js";
import {
  updateLingeringEffectDurations, unregisterLingeringEffects,
  getEffects,
} from "./effects.js";
import { cleanSetAside } from "./set_aside.js";
import { continue_ability, req } from "../macros.js";
import { checkpoint } from "./checkpoint.js";

// ---------------------------------------------------------------------------
// resolve-durations
// Unregisters all floating and lingering effects for the given durations.
// Mirrors: resolve-durations in engine.clj
// ---------------------------------------------------------------------------

function resolveDurations(
  state: GameState,
  _side: string,
  ...durations: string[]
): void {
  for (const duration of durations) {
    unregisterLingeringEffects(state, _side, duration);
    unregisterFloatingEvents(state, _side, duration);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Helper to wait for an async action then run a callback.
 * Mirrors the (wait-for action body...) pattern.
 */
function waitFor(
  state: GameState,
  parentEid: EID,
  start: (innerEid: EID) => void,
  next: (innerEid: EID) => void,
): void {
  const inner = makeEIDFrom(state, parentEid);
  registerEIDCallback(state, inner, (_s, _side, completed) => {
    next(completed as EID);
  });
  start(inner);
}

/**
 * Helper to chain multiple async operations sequentially.
 * Each operation receives an EID and must call effectCompleted when done.
 * Mirrors nested (wait-for ...) chains.
 */
function chainOps(
  state: GameState,
  parentEid: EID,
  ops: Array<(eid: EID) => void>,
): void {
  if (ops.length === 0) {
    effectCompleted(state, "", parentEid);
    return;
  }
  const [first, ...rest] = ops;
  if (rest.length === 0) {
    first(parentEid);
    return;
  }
  waitFor(state, parentEid, first, () => {
    chainOps(state, parentEid, rest);
  });
}

// ---------------------------------------------------------------------------
// turn-message
// Prints a message for the start or end of a turn, summarizing credits and cards in hand.
// Mirrors: turn-message in turns.clj
// ---------------------------------------------------------------------------

function turnMessage(state: GameState, side: string, startOfTurn: boolean): void {
  const pre = startOfTurn ? "started" : "is ending";
  const hand = side === RUNNER_SIDE ? "[their] Grip" : "HQ";
  const player = side === CORP_SIDE ? state.corp : state.runner;
  const cards = (player.hand as Card[]).length;
  const credits = player.credit;
  const text = `${pre} [their] turn ${state.turn} with ${credits} [Credit] and ${quantify(cards, "card")} in ${hand}`;
  if (startOfTurn) {
    systemMsg(state, side, text);
  } else {
    // CLJ: {:hr true} means horizontal rule marker
    systemMsg(state, side, text + " [hr]");
  }
}

// ---------------------------------------------------------------------------
// end-phase-12
// End phase 1.2 and trigger appropriate events for the player.
// Mirrors: end-phase-12 in turns.clj
// ---------------------------------------------------------------------------

export function endPhase12(
  state: GameState,
  side: string,
  eid?: EID,
  _extra?: unknown,
): void {
  const effectiveEid = eid ?? makeEID(state);
  const phaseKey = side === CORP_SIDE ? "corp-phase-12" : "runner-phase-12";

  if (!((state as any)[phaseKey])) return;

  turnMessage(state, side, true);

  const turnBeginsEvent = side === CORP_SIDE ? "corp-turn-begins" : "runner-turn-begins";
  const postTurnBeginsEvent = side === CORP_SIDE ? "post-corp-turn-begins" : "post-runner-turn-begins";
  const durationCheck = side === CORP_SIDE ? "start-of-turn" : "start-of-turn";
  const durationUntil = side === CORP_SIDE ? "until-corp-turn-begins" : "until-runner-turn-begins";
  const lingerFrom = side === CORP_SIDE ? "until-next-corp-turn-begins" : "until-next-runner-turn-begins";
  const lingerTo = side === CORP_SIDE ? "until-corp-turn-begins" : "until-runner-turn-begins";

  chainOps(state, effectiveEid, [
    (innerEid) => {
      triggerEventSimult(state, side, innerEid, turnBeginsEvent, {});
    },
    (innerEid) => {
      resolveDurations(state, side, durationCheck, durationUntil);
      updateLingeringEffectDurations(state, lingerFrom, lingerTo);
      updateFloatingEventDurations(state, side, lingerFrom, lingerTo);
      effectCompleted(state, side, innerEid);
    },
    (innerEid) => {
      if (side === CORP_SIDE) {
        systemMsg(state, side, "makes [their] mandatory start of turn draw");
        // draw then trigger corp-mandatory-draw
        draw(state, side, innerEid, 1, {});
        // After draw completes, trigger the mandatory draw event
        registerEIDCallback(state, innerEid, (s, s2, completed) => {
          triggerEventSimult(s, s2, makeEIDFrom(s, completed as EID), "corp-mandatory-draw", {});
          effectCompleted(s, s2, completed as EID);
        });
      } else {
        effectCompleted(state, side, innerEid);
      }
    },
    (innerEid) => {
      delete (state as any)[phaseKey];
      effectCompleted(state, side, innerEid);
    },
    (innerEid) => {
      triggerEventSimult(state, side, innerEid, postTurnBeginsEvent, {});
      if (side === CORP_SIDE) {
        updateAllAdvancementRequirements(state);
      }
      effectCompleted(state, side, effectiveEid);
    },
  ]);
}

// ---------------------------------------------------------------------------
// phase-12-pass-priority
// Mirrors: phase-12-pass-priority in turns.clj
// ---------------------------------------------------------------------------

export function phase12PassPriority(
  state: GameState,
  side: string,
  eid?: EID,
  _extra?: unknown,
): void {
  const effectiveEid = eid ?? makeEID(state);

  if ((state as any)["corp-phase-12"]) {
    const bucket = (state as any)["corp-phase-12"];
    if (typeof bucket !== "object" || bucket === null) {
      (state as any)["corp-phase-12"] = {};
    }
    ((state as any)["corp-phase-12"] as Record<string, boolean>)[side] = true;
    const cp12 = ((state as any)["corp-phase-12"] as Record<string, boolean>);
    if (cp12[CORP_SIDE] && cp12[RUNNER_SIDE]) {
      endPhase12(state, CORP_SIDE, effectiveEid, undefined);
    } else {
      systemMsg(state, side, "has no further action");
      effectCompleted(state, side, effectiveEid);
    }
  } else if ((state as any)["runner-phase-12"]) {
    const bucket = (state as any)["runner-phase-12"];
    if (typeof bucket !== "object" || bucket === null) {
      (state as any)["runner-phase-12"] = {};
    }
    ((state as any)["runner-phase-12"] as Record<string, boolean>)[side] = true;
    const rp12 = ((state as any)["runner-phase-12"] as Record<string, boolean>);
    if (rp12[CORP_SIDE] && rp12[RUNNER_SIDE]) {
      endPhase12(state, RUNNER_SIDE, effectiveEid, undefined);
    } else {
      systemMsg(state, side, "has no further action");
      effectCompleted(state, side, effectiveEid);
    }
  }
}

// ---------------------------------------------------------------------------
// start-turn
// Start turn.
// Mirrors: start-turn in turns.clj
// ---------------------------------------------------------------------------

export function startTurn(
  state: GameState,
  side: string,
  _extra?: unknown,
): void {
  // note that it's possible for the front-end to send the "start-turn" command twice,
  // before it can be updated with the fact that the turn has started.
  const player = side === CORP_SIDE ? state.corp : state.runner;
  if ((player as any).turnStarted) return;

  // Don't clear :turn-events until the player clicks "Start Turn"
  // Fix for Hayley triggers
  state.turnEvents = null;
  (player as any).turnStarted = true;

  // clear out last-revealed so cards don't stick around all game
  state.lastRevealed = [];

  // Functions to set up state for undo-turn functionality
  for (const s of [CORP_SIDE, RUNNER_SIDE]) {
    delete (state as any)[s]["undo-turn"];
  }
  state.clickStates = [];
  delete (state as any).paidAbilityState;
  // Copy state minus log, history, turn-state
  const { log, history, turnState, ...rest } = state as any;
  state.turnState = rest;

  if (side === CORP_SIDE) {
    state.turn = (state.turn ?? 0) + 1;
  }

  // Clear :new flag on installed/scored and discard cards
  const installedAndScored = allInstalledAndScored(state, side);
  const discard = (player as any).discard ?? [];
  const cardsWithNew = [...installedAndScored, ...discard].filter((c: Card) => c.new);
  for (const c of cardsWithNew) {
    const card = getCard(state, c);
    if (card) {
      delete (card as any).new;
      update(state, side, card);
    }
  }

  state.activePlayer = side;
  (state as any).perTurn = null;
  (state as any).endTurn = false;

  for (const s of [CORP_SIDE, RUNNER_SIDE]) {
    const p = s === CORP_SIDE ? state.corp : state.runner;
    (p as any).register = null;
  }

  const phaseKey = side === CORP_SIDE ? "corp-phase-12" : "runner-phase-12";
  const phaseEvent = side === CORP_SIDE ? "corp-phase-12" : "runner-phase-12";

  const activeCards = allActive(state, side);
  const installedCards = allInstalled(state, side).filter((c) => !isFacedown(c));
  const allCards = [...new Set([...activeCards, ...installedCards])];

  const startCards = allCards.filter((c) =>
    cardFlagFn(state, side, c, phaseKey, true),
  );

  const extraClicks = ((player as any).extraClickTemp ?? 0) as number;

  gain(state, side, "click", player.clickPerTurn ?? 5);
  if (extraClicks < 0) {
    lose(state, side, "click", Math.abs(extraClicks));
  } else if (extraClicks > 0) {
    gain(state, side, "click", extraClicks);
  }
  delete (player as any).extraClickTemp;

  (state as any)[phaseKey] = { active: true };

  triggerEvent(state, side, phaseEvent);

  const oppSide = otherSide(side);
  if (oppSide && (state as any)[oppSide]?.properties?.["force-phase-12-opponent"]) {
    toast(
      state, side,
      side === CORP_SIDE
        ? "players may use abilities between the start of your turn and your mandatory draw"
        : "players may use abilities before you can take your first click",
      "info",
    );
    ((state as any)[phaseKey] as any).requiresConsent = true;
  } else if ((player as any).properties?.["force-phase-12-self"] || startCards.length > 0) {
    toast(
      state, side,
      `You may use ${enumerateStr(startCards.map((c: Card) => c.title ?? ""))}` +
      (side === CORP_SIDE
        ? " between the start of your turn and your mandatory draw."
        : " before taking your first click."),
      "info",
    );
  } else {
    endPhase12(state, side, undefined, undefined);
  }
}

// ---------------------------------------------------------------------------
// handle-end-of-turn-discard
// Mirrors: handle-end-of-turn-discard in turns.clj
// ---------------------------------------------------------------------------

function handleEndOfTurnDiscard(
  state: GameState,
  side: string,
  eid: EID,
  _extra?: unknown,
): void {
  const player = side === CORP_SIDE ? state.corp : state.runner;
  const curHandSize = (player.hand as Card[]).length;
  const maxHandSize = handSizeEffective(state, side);

  // Runner with negative hand size -> flatline
  if (side === RUNNER_SIDE && maxHandSize < 0) {
    flatline(state);
    effectCompleted(state, side, eid);
    return;
  }

  // Check for :skip-discard effects
  const skipEffects = getEffects(state, side, "skip-discard", null, []);
  if (skipEffects.length > 0) {
    systemMsg(state, side, "skips [their] discard step this turn");
    effectCompleted(state, side, eid);
    return;
  }

  if (curHandSize > maxHandSize) {
    const discardCount = curHandSize - Math.max(maxHandSize, 0);
    continue_ability(
      state, side,
      {
        prompt: `Discard down to ${quantify(Math.max(maxHandSize, 0), "card")}`,
        choices: {
          card: inHand,
          max: discardCount,
          all: true,
        },
        "waiting-prompt": true,
        async: true,
        effect: req((s: GameState, _sd: string, _e: EID, _c: Card, targets: unknown[]) => {
          const targetCards = targets as Card[];
          const cardTitles = targetCards.map((c: Card) => c.title ?? "").filter(Boolean);
          systemMsg(
            s, side,
            side === RUNNER_SIDE
              ? `discards ${enumerateStr(cardTitles)} from [their] Grip at end of turn`
              : `discards ${quantify(targetCards.length, "card")} from HQ at end of turn`,
          );
          const discarded: Card[] = [];
          for (const c of targetCards) {
            const moved = move(s, side, c, "discard");
            if (moved) discarded.push(moved);
          }
          const ev = side === RUNNER_SIDE ? "runner-discard-to-hand-size" : "corp-discard-to-hand-size";
          queueEvent(s, ev, { cards: discarded });
          checkpoint(s, null, eid, { durations: [ev] });
        }),
      } as any,
      null as unknown as Card, [],
    );
    return;
  }

  effectCompleted(state, side, eid);
}

// ---------------------------------------------------------------------------
// end-turn-continue
// Mirrors: end-turn-continue in turns.clj
// ---------------------------------------------------------------------------

export function endTurnContinue(
  state: GameState,
  side: string,
  eid?: EID,
  _extra?: unknown,
): void {
  const effectiveEid = eid ?? makeEID(state);
  const postDiscardKey = side === CORP_SIDE ? "corp-post-discard" : "runner-post-discard";

  if (!((state as any)[postDiscardKey])) return;

  delete (state as any)["corp-post-discard"];
  delete (state as any)["runner-post-discard"];

  turnMessage(state, side, false);

  const turnEndsEvent = side === RUNNER_SIDE ? "runner-turn-ends" : "corp-turn-ends";
  const postTurnEndsEvent = side === RUNNER_SIDE ? "post-runner-turn-ends" : "post-corp-turn-ends";
  const lingerFromEnds = side === CORP_SIDE ? "until-next-corp-turn-ends" : "until-next-runner-turn-ends";
  const lingerToEnds = side === CORP_SIDE ? "until-corp-turn-ends" : "until-runner-turn-ends";
  const durationUntilEnds = side === RUNNER_SIDE ? "until-runner-turn-ends" : "until-corp-turn-ends";

  chainOps(state, effectiveEid, [
    (innerEid) => {
      triggerEventSimult(state, side, innerEid, turnEndsEvent, {});
    },
    (innerEid) => {
      triggerEvent(state, side, postTurnEndsEvent);
      effectCompleted(state, side, innerEid);
    },
    (innerEid) => {
      const player = side === CORP_SIDE ? state.corp : state.runner;
      (player as any).registerLastTurn = (player as any).register;
      effectCompleted(state, side, innerEid);
    },
    (innerEid) => {
      resolveDurations(
        state, side,
        "end-of-turn", "end-of-next-run", "end-of-run", "end-of-encounter", durationUntilEnds,
      );
      effectCompleted(state, side, innerEid);
    },
    (innerEid) => {
      updateLingeringEffectDurations(state, lingerFromEnds, lingerToEnds);
      updateFloatingEventDurations(state, side, lingerFromEnds, lingerToEnds);
      effectCompleted(state, side, innerEid);
    },
    (innerEid) => {
      (state as any).endTurn = true;
      cleanSetAside(state, side);
      effectCompleted(state, side, innerEid);
    },
    (innerEid) => {
      // Clear :this-turn installed flags on runner cards
      for (const card of allActiveInstalled(state, RUNNER_SIDE)) {
        const actualCard = getCard(state, card);
        if (actualCard && (actualCard as any).installed === "this-turn") {
          (actualCard as any).installed = true;
          update(state, side, actualCard);
        }
        // Remove all :turn strength from icebreakers.
        if (hasSubtype(card, "Icebreaker")) {
          updateBreakerStrength(state, RUNNER_SIDE, getCard(state, card) ?? card);
        }
      }
      // Clear :this-turn flags on corp installed cards
      for (const card of allInstalled(state, CORP_SIDE)) {
        const actualCard = getCard(state, card);
        if (actualCard && (actualCard as any).installed === "this-turn") {
          (actualCard as any).installed = true;
          update(state, side, actualCard);
        }
        if ((actualCard as any).rezzed === "this-turn") {
          (actualCard as any).rezzed = true;
          update(state, side, actualCard);
        }
      }
      effectCompleted(state, side, innerEid);
    },
    (innerEid) => {
      updateAllIce(state, side);
      effectCompleted(state, side, innerEid);
    },
    (innerEid) => {
      // Dissoc :cannot-draw and :drawn-this-turn from register
      const player = side === CORP_SIDE ? state.corp : state.runner;
      const reg = (player as any).register as Record<string, unknown> | null;
      if (reg) {
        delete reg["cannot-draw"];
        delete reg["drawn-this-turn"];
      }
      delete (player as any).turnStarted;
      (state as any).mark = null;
      clearTurnRegister(state);
      effectCompleted(state, side, innerEid);
    },
    (innerEid) => {
      // Handle extra turns
      const player = side === CORP_SIDE ? state.corp : state.runner;
      const extraTurns = (player as any).extraTurns as number | undefined;
      if (extraTurns && extraTurns > 0) {
        startTurn(state, side, undefined);
        (player as any).extraTurns = extraTurns - 1;
        systemMsg(state, side, `will have ${quantify(extraTurns - 1, "extra turn")} remaining.`);
      }
      effectCompleted(state, side, effectiveEid);
    },
  ]);
}

// ---------------------------------------------------------------------------
// post-discard-pass-priority
// Mirrors: post-discard-pass-priority in turns.clj
// ---------------------------------------------------------------------------

export function postDiscardPassPriority(
  state: GameState,
  side: string,
  eid?: EID,
  _extra?: unknown,
): void {
  const effectiveEid = eid ?? makeEID(state);

  if ((state as any)["corp-post-discard"]) {
    const bucket = (state as any)["corp-post-discard"];
    if (typeof bucket !== "object" || bucket === null) {
      (state as any)["corp-post-discard"] = {};
    }
    ((state as any)["corp-post-discard"] as Record<string, boolean>)[side] = true;
    const cpd = ((state as any)["corp-post-discard"] as Record<string, boolean>);
    if (cpd[CORP_SIDE] && cpd[RUNNER_SIDE]) {
      endTurnContinue(state, CORP_SIDE, effectiveEid, undefined);
    } else {
      systemMsg(state, side, "has no further action");
      effectCompleted(state, side, effectiveEid);
    }
  } else if ((state as any)["runner-post-discard"]) {
    const bucket = (state as any)["runner-post-discard"];
    if (typeof bucket !== "object" || bucket === null) {
      (state as any)["runner-post-discard"] = {};
    }
    ((state as any)["runner-post-discard"] as Record<string, boolean>)[side] = true;
    const rpd = ((state as any)["runner-post-discard"] as Record<string, boolean>);
    if (rpd[CORP_SIDE] && rpd[RUNNER_SIDE]) {
      endTurnContinue(state, RUNNER_SIDE, effectiveEid, undefined);
    } else {
      systemMsg(state, side, "has no further action");
      effectCompleted(state, side, effectiveEid);
    }
  }
}

// ---------------------------------------------------------------------------
// end-turn
// Mirrors: end-turn in turns.clj
// ---------------------------------------------------------------------------

export function endTurn(
  state: GameState,
  side: string,
  eid?: EID,
  _extra?: unknown,
): void {
  const effectiveEid = eid ?? makeEID(state);
  const actionPhaseEnds = side === RUNNER_SIDE ? "runner-action-phase-ends" : "corp-action-phase-ends";
  const postDiscardKey = side === CORP_SIDE ? "corp-post-discard" : "runner-post-discard";

  chainOps(state, effectiveEid, [
    (innerEid) => {
      triggerEventSimult(state, side, innerEid, actionPhaseEnds, {});
    },
    (innerEid) => {
      delete (state as any).paidAbilityState;
      effectCompleted(state, side, innerEid);
    },
    (innerEid) => {
      handleEndOfTurnDiscard(state, side, innerEid, undefined);
    },
    (innerEid) => {
      (state as any)[postDiscardKey] = { active: true };

      const oppSide = otherSide(side);
      if (oppSide && (state as any)[oppSide]?.properties?.["force-post-discard-opponent"]) {
        toast(
          state, side,
          "players may use abilities between the discard phase and the turn ends phase",
          "info",
        );
        ((state as any)[postDiscardKey] as any).requiresConsent = true;
      } else if ((side === CORP_SIDE ? state.corp : state.runner).properties?.["force-post-discard-self"]) {
        toast(
          state, side,
          "players may use abilities between the discard phase and the turn ends phase",
          "info",
        );
      } else {
        endTurnContinue(state, side, effectiveEid, undefined);
      }
      effectCompleted(state, side, innerEid);
    },
  ]);
}
