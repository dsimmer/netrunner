// Trace resolution logic.
// Mirrors: src/clj/game/core/trace.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types";
import { totalAvailableCredits } from "./costs";
import { anyEffects, sumEffects, getEffects } from "./effects";
import { makeEID, effectCompleted, completeWithResult } from "./eid";
import {
  canTrigger,
  pay,
  registerAbilityType,
  resolveAbility,
  triggerEventSimult,
  triggerEventSync,
} from "./engine";
import { getLink } from "./link";
import { clearWaitPrompt, showTracePrompt, showWaitPrompt } from "./prompts";
import { systemMsg, systemSay } from "./say";
import { continue_ability, req, wait_for } from "../macros";
import { toC } from "./payment";

// ---------------------------------------------------------------------------
// Trace state helper type (mirrors the map shape used in Clojure trace.clj)
// ---------------------------------------------------------------------------

interface TraceData {
  player: string; // "corp" | "runner" – who initiates
  other: string;
  base: number;
  bonus: number;
  link: number;
  strength: number;
  corpCredits: (eid: EID) => number;
  runnerCredits: (eid: EID) => number;
  corpBoost?: number;
  runnerBoost?: number;
  unbeatable?: number | null;
  beatTrace?: number | null;
  label?: string;
  ability?: Ability;
  successful?: Ability;
  unsuccessful?: Ability;
  kicker?: Ability;
  kickerMin?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function determineInitiator(
  state: GameState,
  trace: Record<string, unknown>,
): string {
  const runnerFirst = anyEffects(
    state,
    "",
    "trace-runner-spends-first",
    (v) => v === true,
    null,
    [],
  );
  if (runnerFirst) return "runner";
  const player = (trace.player as string) ?? null;
  if (player) return player;
  return "corp";
}

function corpStart(trace: TraceData): boolean {
  return trace.player === "corp";
}

// ---------------------------------------------------------------------------
// resolve-trace
// ---------------------------------------------------------------------------

function resolveTrace(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  trace: TraceData,
  boost: number,
): void {
  const { player, other, base, bonus, link, strength } = trace;

  const corpStrength: number = corpStart(trace)
    ? strength
    : (base ?? 0) + (bonus ?? 0) + boost;
  const runnerStrength: number = corpStart(trace)
    ? (link ?? 0) + boost
    : strength;

  // Build trigger-trace (select-keys of the original trace + extra data)
  const triggerTrace = {
    player: trace.player,
    other: trace.other,
    base: trace.base,
    bonus: trace.bonus,
    link: trace.link,
    ability: trace.ability,
    strength: trace.strength,
    corpStrength,
    runnerStrength,
    successful: corpStrength > runnerStrength,
    corpSpent: corpStart(trace) ? strength - (base ?? 0) - (bonus ?? 0) : boost,
    runnerSpent: corpStart(trace) ? boost : strength - (link ?? 0),
  };

  // Pay boost credits
  wait_for(
    state,
    [
      (asyncResult: { msg?: string } | null | undefined) => {
        const paymentStr = asyncResult?.msg ?? "";
        const typeStr = corpStart(trace) ? "link" : "trace";
        const newStrength = corpStart(trace) ? runnerStrength : corpStrength;
        systemMsg(
          state,
          other,
          `${paymentStr} to increase ${typeStr} strength to ${newStrength}`,
        );
      },
    ],
    [pay, state, other, makeEID(state, eid), card, [toC("credit", boost)]],
  );

  // Clear wait prompt for the initiator
  clearWaitPrompt(state, player);

  const successful = corpStrength > runnerStrength;
  const whichAbility = {
    ...(successful ? (trace.successful ?? {}) : (trace.unsuccessful ?? {})),
    eid: makeEID(state),
  } as Ability;

  systemSay(
    state,
    player,
    `The trace was ${successful ? "" : "un"}successful.`,
  );

  // Trigger simultaneous event
  wait_for(
    state,
    [
      () => {
        // Resolve the ability (successful or unsuccessful)
        wait_for(
          state,
          [
            () => {
              if (trace.kicker && corpStrength >= (trace.kickerMin ?? 0)) {
                continue_ability(state, "corp", trace.kicker, card, [
                  corpStrength,
                  runnerStrength,
                ]);
              } else {
                effectCompleted(state, side, eid);
              }
            },
          ],
          [
            resolveAbility,
            state,
            "corp",
            whichAbility.eid as EID | undefined,
            whichAbility,
            card,
            [corpStrength, runnerStrength],
          ],
        );
      },
    ],
    [
      triggerEventSimult,
      state,
      "corp",
      successful ? "successful-trace" : "unsuccessful-trace",
      null,
      triggerTrace,
    ],
  );
}

// ---------------------------------------------------------------------------
// beat-trace-amount
// ---------------------------------------------------------------------------

function beatTraceAmount(
  initiator: string,
  corpCreditsFn: (eid: EID) => number,
  runnerCreditsFn: (eid: EID) => number,
  link: number,
  base: number,
  strength: number,
  eid: EID,
): number | null {
  const runnerCredits = runnerCreditsFn(eid);
  const corpCredits = corpCreditsFn(eid);
  const required = initiator === "corp" ? strength - link : strength - base;

  if (required <= (initiator === "corp" ? runnerCredits : corpCredits)) {
    return Math.max(required, 0);
  }
  return null;
}

// ---------------------------------------------------------------------------
// trace-reply
// ---------------------------------------------------------------------------

function traceReply(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  trace: TraceData,
  boost: number,
): void {
  const { player, other, base, link, corpCredits, runnerCredits } = trace;

  const traceWithoutUnbeatable: TraceData = { ...trace, unbeatable: undefined };

  const otherType = corpStart(trace) ? "link" : "trace";
  const strength = corpStart(trace)
    ? (base ?? 0) + (trace.bonus ?? 0) + boost
    : (link ?? 0) + boost;

  const updatedTrace: TraceData = {
    ...traceWithoutUnbeatable,
    strength,
    beatTrace:
      beatTraceAmount(
        player,
        corpCredits,
        runnerCredits,
        link,
        base,
        strength,
        eid,
      ) ?? undefined,
  };

  wait_for(
    state,
    [
      (asyncResult: { msg?: string } | null | undefined) => {
        const paymentStr = asyncResult?.msg ?? "";
        systemMsg(
          state,
          player,
          `${paymentStr} to increase ${otherType} strength to ${strength}`,
        );
      },
    ],
    [pay, state, player, makeEID(state, eid), card, [toC("credit", boost)]],
  );

  clearWaitPrompt(state, other);
  showWaitPrompt(
    state,
    player,
    `${corpStart(trace) ? "Runner" : "Corp"} to boost ${otherType} strength`,
  );
  showTracePrompt(
    state,
    other,
    card,
    `Boost ${otherType} strength?`,
    (boost2: number) =>
      resolveTrace(state, side, eid, card, updatedTrace, boost2),
    {
      corpCredits,
      runnerCredits,
      player: other,
      other: player,
      base: trace.base,
      bonus: trace.bonus,
      strength,
      link: trace.link,
      unbeatable: undefined,
      beatTrace: updatedTrace.beatTrace ?? undefined,
      targets: undefined,
    },
  );
}

// ---------------------------------------------------------------------------
// trace-start
// ---------------------------------------------------------------------------

function traceStart(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  trace: TraceData,
): void {
  const { player, other, base, bonus, label: labelName, strength } = trace;
  const thisType = corpStart(trace) ? "trace" : "link";
  const title = card?.title ?? "trace";

  const baseBonus = (base ?? 0) + (bonus ?? 0);
  systemMsg(
    state,
    player,
    `${title} uses ${title} to initiate a trace with strength ${baseBonus}${bonus > 0 ? ` (${base} + ${bonus})` : ""}${labelName ? ` (${labelName})` : ""}`,
  );

  showWaitPrompt(
    state,
    other,
    `${corpStart(trace) ? "Corp" : "Runner"} to boost ${thisType} strength`,
  );

  showTracePrompt(
    state,
    player,
    card,
    `Boost ${thisType} strength?`,
    (boost: number) => traceReply(state, side, eid, card, trace, boost),
    {
      eid: makeEID(state, eid),
      corpCredits: trace.corpCredits,
      runnerCredits: trace.runnerCredits,
      player,
      other,
      base: trace.base,
      bonus: trace.bonus,
      strength: strength ?? baseBonus,
      link: trace.link,
      unbeatable: trace.unbeatable ?? undefined,
      beatTrace: undefined,
      targets: undefined,
    },
  );
}

// ---------------------------------------------------------------------------
// reset-trace-modifications
// ---------------------------------------------------------------------------

function resetTraceModifications(state: GameState): void {
  state.trace = null;
}

// ---------------------------------------------------------------------------
// force-base (public)
// ---------------------------------------------------------------------------

/**
 * Force the trace base strength to a specific value.
 * Mirrors: force-base in trace.clj
 */
export function forceBase(state: GameState, value: number): void {
  if (!state.trace) {
    state.trace = {
      base: 0,
      boost: 0,
      strength: 0,
      corpBoost: 0,
      runnerBoost: 0,
      bonuses: 0,
    };
  }
  state.trace.forceBase = value;
}

// ---------------------------------------------------------------------------
// find-unbeatable-amount
// ---------------------------------------------------------------------------

function findUnbeatableAmount(
  initiator: string,
  corpCreditsFn: (eid: EID) => number,
  runnerCreditsFn: (eid: EID) => number,
  link: number,
  base: number,
  eid: EID,
): number | null {
  const runnerCredits = runnerCreditsFn(eid);
  const corpCredits = corpCreditsFn(eid);
  const required =
    initiator === "corp"
      ? runnerCredits + link + 1 - base
      : base + corpCredits - link;

  if (required <= (initiator === "corp" ? corpCredits : runnerCredits)) {
    return Math.max(required, 0);
  }
  return null;
}

// ---------------------------------------------------------------------------
// init-trace (public entry point)
// ---------------------------------------------------------------------------

/**
 * Initialize a trace. This is the main public entry point.
 * Mirrors: init-trace in trace.clj
 */
export function initTrace(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  trace: {
    base:
      | number
      | ((
          state: GameState,
          side: string,
          eid: EID,
          card: Card | null,
          targets: unknown[],
        ) => number);
  } & Record<string, unknown>,
): void {
  resetTraceModifications(state);

  triggerEventSync(state, "corp", eid, "initialize-trace", card);

  const forceBaseVal = state.trace?.forceBase;
  const forceLink = getEffects(state, "corp", "trace-force-link", card, [
    eid as unknown as Card,
  ])[0];
  const baseVal =
    forceBaseVal ??
    (typeof trace.base === "function"
      ? (trace.base as Function)(state, "corp", makeEID(state), card, null)
      : trace.base);
  const link = (forceLink as number) ?? getLink(state);
  const bonus = sumEffects(state, "corp", "trace-base-strength", card, [
    eid as unknown as Card,
  ]);

  const initiator = determineInitiator(state, trace);
  const traceEid = { ...eid, sourceType: "trace" } as EID;

  const corpCredits = (eid: EID) =>
    totalAvailableCredits(state, "corp", eid, card);
  const runnerCredits = (eid: EID) =>
    totalAvailableCredits(state, "runner", eid, card);

  const traceData: TraceData = {
    player: initiator,
    other: initiator === "corp" ? "runner" : "corp",
    unbeatable: findUnbeatableAmount(
      initiator,
      corpCredits,
      runnerCredits,
      link,
      baseVal,
      traceEid,
    ),
    base: baseVal as number,
    bonus,
    link,
    corpCredits,
    runnerCredits,
    strength: (baseVal as number) + bonus,
    label: trace.label as string | undefined,
    ability: trace.ability as Ability | undefined,
    successful: trace.successful as Ability | undefined,
    unsuccessful: trace.unsuccessful as Ability | undefined,
    kicker: trace.kicker as Ability | undefined,
    kickerMin: trace.kickerMin as number | undefined,
  };

  resetTraceModifications(state);
  traceStart(state, side, traceEid, card, traceData);
}

// ---------------------------------------------------------------------------
// Overloads matching Clojure arities
// ---------------------------------------------------------------------------

/**
 * init-trace: (state, side, card) — default eid and base=0.
 */
export function initTraceSimple(
  state: GameState,
  side: string,
  card: Card,
): void {
  const eid = makeEID(state, { sourceType: "trace" } as EID);
  initTrace(state, side, eid, card, { base: 0 });
}

/**
 * init-trace: (state, side, card, trace) — default eid.
 */
export function initTraceWithTrace(
  state: GameState,
  side: string,
  card: Card,
  trace: { base: number } & Record<string, unknown>,
): void {
  const eid = makeEID(state, { sourceType: "trace" } as EID);
  initTrace(state, side, eid, card, trace);
}

// ---------------------------------------------------------------------------
// check-trace (ability-type handler)
// ---------------------------------------------------------------------------

function checkTrace(
  state: GameState,
  side: string,
  ability: Ability & { trace?: Record<string, unknown> },
  card: Card | null,
  targets: unknown[],
): void {
  const traceData = ability.trace;
  if (!traceData) return;

  // Assert no :async in trace (mirrors Clojure assertion)
  if (traceData.async) {
    throw new Error("Put :async in the :successful/:unsuccessful");
  }

  const eid = (ability.eid as EID | undefined) ?? makeEID(state);
  if (canTrigger(state, side, eid as EID, ability, card, targets)) {
    const capturedState = state;
    const capturedSide = side;
    const capturedEid = eid as EID;
    const capturedCard = card;
    const capturedTraceData = traceData;
    resolveAbility(
      capturedState,
      capturedSide,
      {
        ...ability,
        trace: undefined,
        req: undefined,
        async: true,
        effect: req(
          (s: GameState, sd: string, ei: EID, c: Card | null, t: unknown[]) => {
            initTrace(s, sd, capturedEid, c, capturedTraceData as { base: number } & Record<string, unknown>);
          },
        ),
      },
      capturedCard,
      targets,
    );
  } else {
    effectCompleted(state, side, eid as EID);
  }
}

registerAbilityType("trace", checkTrace as Parameters<typeof registerAbilityType>[1]);
