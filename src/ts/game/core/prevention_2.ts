// Prevention system: tag, damage, trash, expose, end-run, jack-out, encounter, bad publicity.
// Mirrors: src/clj/game/core/prevention.clj
//
// This module implements the full prevention infrastructure used by damage, tags,
// trash, expose, end-run, jack-out, encounter and other interrupt-style mechanics.

import type { GameState, Effect } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types";
import { allActive, allActiveInstalled } from "./board";
import { getCard } from "./finding";
import { installed, resource, rezzed, sameCard } from "./card";
import { cardDef } from "./card_defs";
import { chooseOneHelper } from "./choose_one";
import type { ChoiceOption } from "./choose_one";
import { cardAbilityCost } from "./cost_fns";
import { completeWithResult, effectCompleted, makeEID } from "./eid";
import { anyEffects, getEffectMaps } from "./effects";
import { resolveAbility, triggerEventSimult, triggerEventSync } from "./engine";
import {
  canTrash,
  untrashableWhileResources,
  untrashableWhileRezzed,
} from "./flags";
import { canPay, toC } from "./payment";
import { enforceMsg, nLastLogs } from "./say";
import { cardStr } from "./to_string";
import { dissocIn, enumerateStr, quantify } from "../utils";
import { otherSide } from "../../jinteki/utils";
import { req, msg, wait_for } from "../macros";

import {
  damageName,
  damagePending,
  fetchAndClear,
  pCtx,
  preventNumeric,
  pushPrevention,
  resolveKeyedPreventionForSide,
  resolvePreventEffectsWithPriority,
} from "./prevention_1";
import type { PreventionContext } from "./prevention_1";

function resolvePreDamageForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
  const pending = damagePending(state);
  const promptStr =
    side === "runner"
      ? `Prevent ${pending} ${damageName(state)} damage?`
      : `There is ${pending} pending ${damageName(state)} damage`;

  resolveKeyedPreventionForSide(state, side, eid, "pre-damage", {
    prompt: promptStr,
    waiting: "your opponent to resolve pre-damage triggers",
    option: "Pass priority",
  });
}

function resolveDamageForSide(state: GameState, side: string, eid: EID): void {
  const pending = damagePending(state);
  const promptStr =
    side === "runner"
      ? `Prevent ${pending} ${damageName(state)} damage?`
      : `There is ${pending} pending ${damageName(state)} damage`;

  resolveKeyedPreventionForSide(state, side, eid, "damage", {
    prompt: promptStr,
    waiting: "your opponent to resolve damage triggers",
    option: "Pass priority",
  });
}

/**
 * Opens pre-damage and damage prevention windows.
 * Mirrors: resolve-damage-prevention
 */
export function resolveDamagePrevention(
  state: GameState,
  side: string,
  eid: EID,
  type: string,
  n: number,
  opts: {
    unpreventable?: boolean;
    unboostable?: boolean;
    card?: Card;
  },
): void {
  const { unpreventable, unboostable, card } = opts;

  pushPrevention(state, "pre-damage", {
    count: n,
    remaining: n,
    prevented: 0,
    sourcePlayer: side,
    sourceCard: card ?? null,
    priorityPasses: 0,
    type,
    unpreventable: unpreventable ?? false,
    unboostable: unboostable ?? false,
    uses: {},
  });

  wait_for(
    state,
    [
      { asyncResult: true },
      () =>
        triggerEventSimult(
          state,
          side,
          eid,
          "pre-damage-flag",
          {},
          { card, type, count: n },
        ),
      () => {
        // After pre-damage resolves, copy remaining into damage prevention
        const preCtx = state.prevent?.[
          "pre-damage"
        ] as PreventionContext;
        state.prevent.damage = {
          count: preCtx?.count ?? n,
          remaining: preCtx?.remaining ?? n,
          prevented: preCtx?.prevented ?? 0,
          sourcePlayer: preCtx?.sourcePlayer ?? side,
          sourceCard: preCtx?.sourceCard ?? card ?? null,
          priorityPasses: 0,
          type: preCtx?.type ?? type,
          unpreventable: preCtx?.unpreventable ?? false,
          unboostable: preCtx?.unboostable ?? false,
          uses: {},
        };
      },
      () =>
        resolvePreventEffectsWithPriority(
          state,
          state.activePlayer,
          eid,
          "damage",
          resolveDamageForSide,
        ),
    ],
    [
      () =>
        resolvePreventEffectsWithPriority(
          state,
          state.activePlayer,
          eid,
          "pre-damage",
          resolvePreDamageForSide,
        ),
    ],
  );
}

// ---------------------------------------------------------------------------
// ENCOUNTER PREVENTION
// ---------------------------------------------------------------------------

/**
 * Prevent the next encounter ability.
 * Mirrors: prevent-encounter
 */
export const preventEncounter = function (
  state: GameState,
  side: string,
  eid: EID,
): void {
  preventNumeric(state, side, eid, "encounter", 1);
};

function resolveEncounterPreventionForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
  const encounter = state.prevent?.encounter as PreventionContext;
  const promptStr = `Prevent ${encounter?.title ?? "an"} ability?`;
  const optionStr = `Allow ${encounter?.title ?? "the"} ability`;

  resolveKeyedPreventionForSide(state, side, eid, "encounter", {
    prompt: promptStr,
    waiting: 'your opponent to prevent a "when encountered" ability',
    option: optionStr,
  });
}

/**
 * Opens an encounter-prevention window.
 * Mirrors: resolve-encounter-prevention
 */
export function resolveEncounterPrevention(
  state: GameState,
  side: string,
  eid: EID,
  opts: {
    unpreventable?: boolean;
    card?: Card;
    title?: string;
  },
): void {
  const { unpreventable, card, title } = opts;

  pushPrevention(state, "encounter", {
    count: 1,
    remaining: 1,
    title: title ?? "",
    prevented: 0,
    sourcePlayer: side,
    sourceCard: card ?? null,
    uses: {},
  });

  if (unpreventable) {
    completeWithResult(state, side, eid, fetchAndClear(state, "encounter"));
  } else {
    resolvePreventEffectsWithPriority(
      state,
      state.activePlayer,
      eid,
      "encounter",
      resolveEncounterPreventionForSide,
    );
  }
}

// ---------------------------------------------------------------------------
// END RUN PREVENTION
// ---------------------------------------------------------------------------

/**
 * Prevent the run from ending.
 * Mirrors: prevent-end-run
 */
export const preventEndRun = function (
  state: GameState,
  side: string,
  eid: EID,
): void {
  preventNumeric(state, side, eid, "end-run", 1);
};

function resolveEndRunPreventionForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
  resolveKeyedPreventionForSide(state, side, eid, "end-run", {
    prompt: "Prevent the run from ending",
    waiting: "your opponent to prevent the run from ending",
    option: "Allow the run to end",
  });
}

/**
 * Opens an end-run-prevention window.
 * Mirrors: resolve-end-run-prevention
 */
export function resolveEndRunPrevention(
  state: GameState,
  side: string,
  eid: EID,
  opts: {
    unpreventable?: boolean;
    card?: Card;
  },
): void {
  const { unpreventable, card } = opts;

  pushPrevention(state, "end-run", {
    count: 1,
    remaining: 1,
    prevented: 0,
    sourcePlayer: side,
    sourceCard: card ?? null,
    uses: {},
  });

  // Trigger can-run-be-ended? event (for Banner etc.)
  wait_for(
    state,
    [
      { asyncResult: true },
      () => {
        const remaining = (
          state.prevent?.["end-run"] as PreventionContext
        )?.remaining;
        if (remaining === 0) {
          completeWithResult(state, side, eid, fetchAndClear(state, "end-run"));
        } else {
          // Trigger end-run-interrupt event
          triggerEventSimult(
            state,
            side,
            eid,
            "end-run-interrupt",
            {},
            { card, sourceEid: eid },
          );

          if (unpreventable) {
            completeWithResult(
              state,
              side,
              eid,
              fetchAndClear(state, "end-run"),
            );
          } else {
            resolvePreventEffectsWithPriority(
              state,
              state.activePlayer,
              eid,
              "end-run",
              resolveEndRunPreventionForSide,
            );
          }
        }
      },
    ],
    [
      () =>
        triggerEventSimult(
          state,
          side,
          eid,
          "can-run-be-ended?",
          {},
          { card, sourceEid: eid },
        ),
    ],
  );
}

// ---------------------------------------------------------------------------
// JACK OUT PREVENTION
// ---------------------------------------------------------------------------

/**
 * Prevent the runner from jacking out.
 * Mirrors: prevent-jack-out
 */
export function preventJackOut(state: GameState, side: string): void;
export function preventJackOut(state: GameState, side: string, eid: EID): void;
export function preventJackOut(state: GameState, side: string, eid?: EID): void {
  preventNumeric(state, side, eid ?? makeEID(state), "jack-out", 1);
}

function resolveJackOutPreventionForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
  resolveKeyedPreventionForSide(state, side, eid, "jack-out", {
    prompt: "Prevent the runner from jacking out",
    waiting: "your opponent to prevent you from jacking out",
    option: "Allow the Runner to jack out",
  });
}

/**
 * Opens a jack-out-prevention window.
 * Mirrors: resolve-jack-out-prevention
 */
export function resolveJackOutPrevention(
  state: GameState,
  side: string,
  eid: EID,
  opts: {
    unpreventable?: boolean;
    card?: Card;
  },
): void {
  const { unpreventable, card } = opts;

  pushPrevention(state, "jack-out", {
    count: 1,
    remaining: 1,
    prevented: 0,
    sourcePlayer: side,
    sourceCard: card ?? null,
    uses: {},
  });

  if (unpreventable) {
    completeWithResult(state, side, eid, fetchAndClear(state, "jack-out"));
  } else {
    wait_for(
      state,
      [
        { asyncResult: true },
        () =>
          completeWithResult(
            state,
            side,
            eid,
            fetchAndClear(state, "jack-out"),
          ),
      ],
      [() => resolveJackOutPreventionForSide(state, "corp", eid)],
    );
  }
}

// ---------------------------------------------------------------------------
// EXPOSE PREVENTION
// ---------------------------------------------------------------------------

/**
 * Prevent one or more cards from being exposed.
 * Mirrors: prevent-expose
 */
export function preventExpose(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
): void {
  const ctx = state.prevent?.expose;
  if (!ctx) {
    console.error(
      `tried to prevent expose outside of an expose prevention window\n${nLastLogs(state, 5)}`,
    );
    effectCompleted(state, side, eid);
    return;
  }

  const remaining = ctx.remaining as Card[];
  if (remaining.length <= 1) {
    ctx.prevented = "all";
    ctx.remaining = [];
    const preventEvent = side === "corp" ? "corp-prevent" : "runner-prevent";
    triggerEventSync(state, side, eid, preventEvent, {
      type: "expose",
      amount: 1,
    });
  } else {
    // Choose which card to prevent
    resolveAbility(
      state,
      side,
      {
        eid,
        prompt: "Prevent which card from being exposed?",
        choices: req(function (
          this: void,
          s: GameState,
          sid: string,
          e: EID,
          c: Card,
          t: unknown[],
        ) {
          return [...remaining].sort((a: Card, b: Card) =>
            (a.title ?? "").localeCompare(b.title ?? ""),
          );
        }),
        effect: req(function (
          this: void,
          s: GameState,
          sid: string,
          e: EID,
          c: Card,
          t: unknown[],
        ) {
          const target = (t as Card[])[0];
          const ctx = pCtx(s, "expose");
          if (ctx) {
            ctx.remaining = (ctx.remaining as Card[]).filter(
              (r: Card) => !sameCard(r, target),
            );
            ctx.prevented =
              typeof ctx.prevented === "number"
                ? (ctx.prevented as number) + 1
                : 1;
          }
        }),
      } as Ability,
      card,
      [],
    );
  }
}

function resolveExposePreventionForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
  const remaining = (state.prevent?.expose?.remaining as Card[]) ?? [];

  const promptStr = `Prevent ${enumerateStr(
    remaining.map((c: Card) => cardStr(state, c, { visible: side === "corp" })),
    "or",
  )} from being exposed?`;
  const optionStr = `Allow ${quantify(remaining.length, "card")} to be exposed`;

  resolveKeyedPreventionForSide(state, side, eid, "expose", {
    dataType: "sequential",
    prompt: promptStr,
    waiting: "your opponent to prevent an Expose",
    option: optionStr,
  });
}

/**
 * Opens an expose-prevention window.
 * Mirrors: resolve-expose-prevention
 */
export function resolveExposePrevention(
  state: GameState,
  side: string,
  eid: EID,
  targets: Card[],
  opts: {
    unpreventable?: boolean;
    card?: Card;
  },
): void {
  const { unpreventable, card } = opts;

  pushPrevention(state, "expose", {
    count: targets.length,
    remaining: targets,
    prevented: 0,
    sourcePlayer: side,
    sourceCard: card ?? null,
    uses: {},
  });

  triggerEventSimult(
    state,
    side,
    eid,
    "expose-interrupt",
    {},
    { cards: targets },
  );

  // Filter out rezzed or nil cards
  const newTargets = targets
    .map((c: Card) => getCard(state, c))
    .filter((c): c is Card => c != null && !rezzed(c));

  state.prevent.expose.remaining = newTargets;
  state.prevent.expose.count = newTargets.length;

  if (unpreventable || newTargets.length === 0) {
    completeWithResult(state, side, eid, fetchAndClear(state, "expose"));
  } else {
    const activeSide = state.activePlayer;
    const respondingSide = otherSide(activeSide);

    wait_for(
      state,
      [
        { asyncResult: true },
        () => {
          if (respondingSide) {
            resolveExposePreventionForSide(state, respondingSide, eid);
          }
        },
        () =>
          completeWithResult(state, side, eid, fetchAndClear(state, "expose")),
      ],
      [() => resolveExposePreventionForSide(state, activeSide, eid)],
    );
  }
}

// ---------------------------------------------------------------------------
// BAD PUBLICITY PREVENTION
// ---------------------------------------------------------------------------

/**
 * Prevent n bad publicity.
 * Mirrors: prevent-bad-publicity
 */
export function preventBadPublicity(
  state: GameState,
  side: string,
  eid: EID,
  n: number | "all",
): void {
  preventNumeric(state, side, eid, "bad-publicity", n);
}

function resolveBadPubPreventionForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
  const ctx = state.prevent?.["bad-publicity"] as PreventionContext;
  const count = ctx?.count ?? 0;
  const remaining = (ctx?.remaining as number) ?? 0;

  const promptStr =
    `Prevent any of the ${count} bad publicity?` +
    (count !== remaining ? ` (${remaining} remaining)` : "");
  const optionStr = `Allow ${remaining} bad publicity`;

  resolveKeyedPreventionForSide(state, side, eid, "bad-publicity", {
    prompt: promptStr,
    waiting: "your opponent to prevent bad publicity",
    option: optionStr,
  });
}

/**
 * Opens a bad publicity prevention window.
 * Mirrors: resolve-bad-pub-prevention
 */
export function resolveBadPubPrevention(
  state: GameState,
  side: string,
  eid: EID,
  n: number,
  opts: {
    unpreventable?: boolean;
    card?: Card;
  },
): void {
  const { unpreventable, card } = opts;

  pushPrevention(state, "bad-publicity", {
    count: n,
    remaining: n,
    prevented: 0,
    sourcePlayer: side,
    sourceCard: card ?? null,
    uses: {},
  });

  if (unpreventable || n <= 0) {
    completeWithResult(state, side, eid, fetchAndClear(state, "bad-publicity"));
  } else {
    resolvePreventEffectsWithPriority(
      state,
      state.activePlayer,
      eid,
      "bad-publicity",
      resolveBadPubPreventionForSide,
    );
  }
}

// ---------------------------------------------------------------------------
// TAG PREVENTION
// ---------------------------------------------------------------------------

/**
 * Prevent n tags.
 * Mirrors: prevent-tag
 */
export function preventTag(
  state: GameState,
  side: string,
  eid: EID,
  n: number | "all",
): void {
  preventNumeric(state, side, eid, "tag", n);
}

/**
 * Returns an ability that lets the player choose how many tags to avoid (up to n).
 * Mirrors: prevent-up-to-n-tags
 */
export function preventUpToNTags(n: number | "all"): Ability {
  return {
    prompt: "Choose how many tags to avoid",
    req: req(function (
      this: void,
      s: GameState,
      sid: string,
      e: EID,
      c: Card,
      t: unknown[],
    ) {
      return !!pCtx(s, "tag");
    }),
    choices: {
      number: req(function (
        this: void,
        s: GameState,
        sid: string,
        e: EID,
        c: Card,
        t: unknown[],
      ) {
        const remaining = pCtx(s, "tag")?.remaining as number | undefined;
        const r = remaining ?? 0;
        if (n === "all") return r;
        return Math.min(r, n as number);
      }),
      default: req(function (
        this: void,
        s: GameState,
        sid: string,
        e: EID,
        c: Card,
        t: unknown[],
      ) {
        const remaining = pCtx(s, "tag")?.remaining as number | undefined;
        const r = remaining ?? 0;
        if (n === "all") return r;
        return Math.min(r, n as number);
      }),
    },
    async: true,
    msg: msg("avoid ", (n: number) => quantify(n, "tag")),
    effect: req(function (
      this: void,
      s: GameState,
      sid: string,
      e: EID,
      c: Card,
      t: unknown[],
    ) {
      const target = (t as Array<number | "all">)[0];
      preventTag(s, sid, e, target);
    }),
    cancel: {
      async: true,
      effect: req(function (
        this: void,
        s: GameState,
        sid: string,
        e: EID,
        c: Card,
        t: unknown[],
      ) {
        preventTag(s, sid, e, 0);
      }),
    },
  };
}

function resolveTagPreventionForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
  const ctx = state.prevent?.tag as PreventionContext;
  const count = ctx?.count ?? 0;
  const remaining = (ctx?.remaining as number) ?? 0;

  const promptStr =
    `Prevent any of the ${count} tags?` +
    (count !== remaining ? ` (${remaining} remaining)` : "");
  const optionStr = `Allow ${quantify(remaining, "remaining tag")}`;

  resolveKeyedPreventionForSide(state, side, eid, "tag", {
    prompt: promptStr,
    waiting: "your opponent to prevent tags",
    option: optionStr,
  });
}

/**
 * Opens a tag-prevention window and resolves any prevention abilities.
 * Mirrors: resolve-tag-prevention
 */
export function resolveTagPrevention(
  state: GameState,
  side: string,
  eid: EID,
  n: number,
  opts: {
    unpreventable?: boolean;
    card?: Card;
  },
): void {
  const { unpreventable, card } = opts;

  pushPrevention(state, "tag", {
    count: n,
    remaining: n,
    prevented: 0,
    sourcePlayer: side,
    sourceCard: card ?? null,
    uses: {},
  });

  if (unpreventable || n <= 0) {
    completeWithResult(state, side, eid, fetchAndClear(state, "tag"));
  } else {
    triggerEventSimult(state, side, eid, "tag-interrupt", {}, card);

    const activeSide = state.activePlayer;
    const respondingSide = otherSide(activeSide);

    wait_for(
      state,
      [
        { asyncResult: true },
        () => {
          if (respondingSide) {
            resolveTagPreventionForSide(state, respondingSide, eid);
          }
        },
        () => completeWithResult(state, side, eid, fetchAndClear(state, "tag")),
      ],
      [() => resolveTagPreventionForSide(state, activeSide, eid)],
    );
  }
}
