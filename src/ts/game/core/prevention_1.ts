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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context map passed into prevention ability :req and :effect fns */
export interface PreventionContext {
  remaining: number | Card[];
  count: number;
  prevented: number | "all";
  sourcePlayer: string;
  sourceCard: Card | null;
  unpreventable?: boolean;
  unboostable?: boolean;
  priorityPasses?: number;
  passed?: boolean;
  uses?: Record<string, number>;
  type?: string;
  // trash-specific
  untrashable?: Array<{ card: Card; destination: string; reason?: string }>;
  cause?: string;
  gameTrash?: boolean;
  // encounter-specific
  title?: string;
  // damage-specific
}

interface PreventionEntry {
  prevents: string;
  type: string;
  prompt?: string;
  label?: string;
  maxUses?: number;
  mandatory?: boolean;
  ability: Ability;
  card: Card;
}

interface FloatingPreventionEntry {
  card: Card | null;
  value: PreventionEntry;
}

// ---------------------------------------------------------------------------
// Helpers — push / pop prevention state
// ---------------------------------------------------------------------------

export function pushPrevention(
  state: GameState,
  key: string,
  map: PreventionContext,
): void {
  const existing = state.prevent;
  if (existing) {
    (state as any).preventStack = [
      existing,
      ...((state as any).preventStack ?? []),
    ];
  }
  state.prevent = { ...(state.prevent ?? {}), [key]: map };
}

export function fetchAndClear(
  state: GameState,
  key: string,
): PreventionContext | undefined {
  const res = state.prevent?.[key];
  const stack = (state as any).preventStack;
  if (stack && stack.length > 0) {
    state.prevent = stack[0];
    (state as any).preventStack = stack.slice(1);
  } else {
    delete state.prevent;
  }
  return res;
}

// ---------------------------------------------------------------------------
// gather-prevention-abilities (relevant + floating)
// ---------------------------------------------------------------------------

function relevantPreventionAbilities(
  state: GameState,
  side: string,
  eid: EID,
  key: string,
  card: Card,
): PreventionEntry[] {
  const cdef = cardDef(card);
  const abs: PreventionEntry[] =
    (cdef as any).prevention
      ?.filter((p: any) => p.prevents === key)
      .map((p: any) => ({ ...p, card })) ?? [];

  const playable = abs.filter((p: PreventionEntry) => {
    // cannot-play? (prevent-paid-ability effect)
    const cannotPlay =
      p.type === "ability"
        ? anyEffects(
            state,
            side,
            "prevent-paid-ability",
            (v: unknown) => v === true,
            card,
            [p.ability as any, 0],
          )
        : false;

    // payable?
    const costs = cardAbilityCost(state, side, p.ability, card, []);
    const costsSeq = costs.length > 0 ? costs : null;
    const payable = canPay(state, side, eid, card, null, costsSeq);

    // not-used-too-many-times?
    const maxUses = (p as any).maxUses;
    const uses = state.prevent?.[key]?.uses?.[(card as any).cid];
    const notUsedTooManyTimes =
      maxUses == null || uses == null || uses < maxUses;

    // ability-req?
    const abilityReqFn = (p.ability as any).req;
    const context = state.prevent?.[key];
    const abilityReq =
      !abilityReqFn || abilityReqFn(state, side, eid, card, [context]);

    return !cannotPlay && payable && notUsedTooManyTimes && abilityReq;
  });

  return playable;
}

function getEffectValueInternal(
  state: GameState,
  side: string,
  eid: EID,
  targets: Card[],
  e: Effect,
): unknown {
  if (!e.value) return null;
  return typeof e.value === "function"
    ? e.value(state, side, eid, e.card, targets)
    : e.value;
}

function floatingPreventionAbilities(
  state: GameState,
  side: string,
  eid: EID,
  key: string,
): PreventionEntry[] {
  const effects = getEffectMaps(state, side, "prevention", eid, []);
  const cardVals: FloatingPreventionEntry[] = effects.map((ev: any) => ({
    card: ev.card,
    value: getEffectValueInternal(state, side, eid, [], ev) as PreventionEntry,
  }));

  const filtered = cardVals.filter((cv: any) => cv.value?.prevents === key);

  const playable = filtered
    .filter((cv: any) => {
      const card = cv.card ?? cv.value?.card ?? null;
      const prev = cv.value;
      const ability = prev?.ability;
      const costs = cardAbilityCost(state, side, ability, card as any, []);
      const costsSeq = costs.length > 0 ? costs : null;
      const payable = canPay(state, side, eid, card as any, null, costsSeq);

      const maxUses = (prev as any)?.maxUses;
      const cid = (card as any)?.cid;
      const uses = cid ? state.prevent?.[key]?.uses?.[cid] : undefined;
      const notUsedTooManyTimes =
        maxUses == null || uses == null || uses < maxUses;

      const abilityReqFn = (prev?.ability as any)?.req;
      const context = state.prevent?.[key];
      const abilityReq =
        !abilityReqFn || abilityReqFn(state, side, eid, card as any, [context]);

      return payable && notUsedTooManyTimes && abilityReq;
    })
    .map((cv: any) => ({ ...cv.value, card: cv.card } as PreventionEntry));

  return playable;
}

function gatherPreventionAbilities(
  state: GameState,
  side: string,
  eid: EID,
  key: string,
): PreventionEntry[] {
  const activeCards = allActive(state, side);
  const fromCards = activeCards.flatMap((c: any) =>
    relevantPreventionAbilities(state, side, eid, key, c),
  );
  const fromFloating = floatingPreventionAbilities(state, side, eid, key);
  return [...fromCards, ...fromFloating];
}

// ---------------------------------------------------------------------------
// prevent-numeric
// ---------------------------------------------------------------------------

/**
 * Prevent n units of a numeric prevention key (tag, bad-publicity, etc.).
 * Mirrors: prevent-numeric
 */
export function preventNumeric(
  state: GameState,
  side: string,
  eid: EID,
  key: string,
  n: number | "all",
): void {
  const ctx = state.prevent?.[key];
  if (!ctx) {
    console.error(
      `tried to prevent ${key} outside of a ${key} prevention window (eid: ${JSON.stringify(eid)})\n${nLastLogs(state, 5)}`,
    );
    effectCompleted(state, side, eid);
    return;
  }

  if (n === "all") {
    ctx.prevented = "all";
    ctx.remaining = 0;
  } else {
    ctx.prevented = typeof ctx.prevented === "number" ? ctx.prevented + n : n;
    if (typeof ctx.remaining === "number") {
      ctx.remaining = Math.max(0, ctx.remaining - n);
    }
  }

  const preventEvent = side === "corp" ? "corp-prevent" : "runner-prevent";
  triggerEventSync(state, side, eid, preventEvent, { type: key, amount: n });
}

// ---------------------------------------------------------------------------
// trigger-prevention / build-prevention-option
// ---------------------------------------------------------------------------

function triggerPrevention(
  state: GameState,
  side: string,
  eid: EID,
  key: string,
  prevention: PreventionEntry,
): void {
  const card = prevention.card;
  const cid = (card as any).cid;
  const abi: Ability = {
    async: true,
    effect: req(function (
      this: void,
      s: GameState,
      sid: string,
      e: EID,
      c: Card,
      t: unknown[],
    ) {
      (s as any).prevent[key].priorityPasses = 0;
      const uses = (s as any).prevent[key].uses ?? {};
      uses[cid] = (uses[cid] ?? 0) + 1;
      (s as any).prevent[key].uses = uses;
      const context = (s as any).prevent[key];
      (resolveAbility as any)(s, sid, e, prevention.ability, card, [context]);
    }),
  };

  const sourceEid = { ...eid, source: card, sourceType: "ability" };
  const finalAbility: Ability = prevention.prompt
    ? {
        optional: {
          prompt: prevention.prompt,
          yesAbility: abi,
        },
      }
    : abi;

  (resolveAbility as any)(state, side, sourceEid, finalAbility, card, null);
}

function buildPreventionOption(
  prevention: PreventionEntry,
  key: string,
): ChoiceOption {
  return {
    option: prevention.label ?? prevention.card?.title ?? "",
    card: prevention.card,
    ability: {
      async: true,
      effect: req(function (
        this: void,
        s: GameState,
        sid: string,
        e: EID,
        c: Card,
        t: unknown[],
      ) {
        triggerPrevention(s, sid, e, key, prevention);
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// resolve-keyed-prevention-for-side
// ---------------------------------------------------------------------------

interface KeyedPreventionArgs {
  prompt?: string | ((state: GameState, remainder: unknown) => string);
  waiting?: string | ((state: GameState, remainder: unknown) => string);
  option?: string | ((state: GameState, remainder: unknown) => string);
  dataType?: "sequential" | "numeric";
}

export function resolveKeyedPreventionForSide(
  state: GameState,
  side: string,
  eid: EID,
  key: string,
  args: KeyedPreventionArgs,
): void {
  const remainder = state.prevent?.[key]?.remaining;
  const passed = state.prevent?.[key]?.passed;

  const promptStr =
    typeof args.prompt === "function"
      ? args.prompt(state, remainder)
      : args.prompt;
  const waitingStr =
    typeof args.waiting === "function"
      ? args.waiting(state, remainder)
      : args.waiting;
  const optionStr =
    typeof args.option === "function"
      ? args.option(state, remainder)
      : args.option;

  const isSequential = args.dataType === "sequential";
  const emptyRemainder = isSequential
    ? !remainder || (Array.isArray(remainder) && remainder.length === 0)
    : !(typeof remainder === "number" && remainder > 0);

  const damageSpecial =
    key === "pre-damage" || key === "damage" ? false : emptyRemainder;

  if (
    (isSequential
      ? !remainder || (Array.isArray(remainder) && remainder.length === 0)
      : key !== "pre-damage" &&
        !(typeof remainder === "number" && remainder > 0)) ||
    passed
  ) {
    delete state.prevent?.[key]?.passed;
    effectCompleted(state, side, eid);
    return;
  }

  const preventions = gatherPreventionAbilities(state, side, eid, key);

  if (preventions.length === 0) {
    effectCompleted(state, side, eid);
    return;
  }

  // Mandatory single prevention
  if (preventions.length === 1 && (preventions[0] as any).mandatory) {
    wait_for(
      state,
      [
        { asyncResult: true },
        () => resolveKeyedPreventionForSide(state, side, eid, key, args),
      ],
      [() => triggerPrevention(state, side, eid, key, preventions[0])],
    );
    return;
  }

  // Build choose-one options
  const options: ChoiceOption[] = [
    ...preventions.map((p: any) => buildPreventionOption(p, key)),
    ...(someMandatory(preventions)
      ? []
      : [
          {
            option: optionStr ?? "Pass",
            ability: {
              effect: req(function (
                this: void,
                s: GameState,
                sid: string,
                e: EID,
                c: Card,
                t: unknown[],
              ) {
                (s as any).prevent[key].passed = true;
              }),
            },
          },
        ]),
  ];

  const chooseOneAbility = chooseOneHelper(
    {
      prompt: promptStr ?? "Choose",
      waitingPrompt: !!waitingStr,
    },
    options,
  );

  wait_for(
    state,
    [
      { asyncResult: true },
      () => resolveKeyedPreventionForSide(state, side, eid, key, args),
    ],
    [() => (resolveAbility as any)(state, side, eid, chooseOneAbility, null, null)],
  );
}

function someMandatory(preventions: PreventionEntry[]): boolean {
  return preventions.some((p: any) => (p as any).mandatory === true);
}

// ---------------------------------------------------------------------------
// resolve-prevent-effects-with-priority
// ---------------------------------------------------------------------------

export function resolvePreventEffectsWithPriority(
  state: GameState,
  side: string,
  eid: EID,
  key: string,
  prevFn: (state: GameState, side: string, eid: EID) => void,
): void {
  const priorityPasses = state.prevent?.[key]?.priorityPasses ?? 0;

  if (priorityPasses >= 2) {
    const result = fetchAndClear(state, key);
    completeWithResult(state, side, eid, result);
    return;
  }

  wait_for(
    state,
    [
      { asyncResult: true },
      () => {
        const ctx = state.prevent?.[key];
        if (ctx) {
          ctx.priorityPasses = (ctx.priorityPasses ?? 0) + 1;
        }
      },
      () => {
        const other = otherSide(side);
        if (other) {
          resolvePreventEffectsWithPriority(state, other, eid, key, prevFn);
        }
      },
    ],
    [() => prevFn(state, side, eid)],
  );
}

// ---------------------------------------------------------------------------
// preventable?
// ---------------------------------------------------------------------------

export function preventable(stateOrCtx: any, key?: any): boolean {
  // Permissive: accept either (state, key) or (ctx).
  if (key === undefined) {
    if (!stateOrCtx) return false;
    return preventableContext(stateOrCtx);
  }
  const ctx = (stateOrCtx as any)?.prevent?.[key];
  if (!ctx) return false;
  return preventableContext(ctx);
}

function preventableContext(ctx: PreventionContext): boolean {
  const { remaining, unpreventable } = ctx;
  if (unpreventable) return false;
  if (Array.isArray(remaining)) return remaining.length > 0;
  if (typeof remaining === "number") return remaining > 0;
  return false;
}

// ---------------------------------------------------------------------------
// TRASH PREVENTION
// ---------------------------------------------------------------------------

function preventTrashInstalledByType(
  label: string,
  types: string[],
  cost: any[],
  validContext?: (ctx: PreventionContext) => boolean,
): Ability {
  return {
    prevents: "trash",
    type: "ability",
    label,
    ability: {
      req: req(function (
        this: void,
        s: GameState,
        sid: string,
        e: EID,
        c: Card,
        t: unknown[],
      ) {
        const context = (s as any).prevent?.trash;
        const remaining = context?.remaining;
        if (!remaining || !Array.isArray(remaining)) return false;
        const relevant = remaining
          .map((r: any) => (typeof r === "object" && "card" in r ? r.card : r))
          .filter(
            (card: Card) =>
              types.includes((card as any).type) &&
              installed(card) &&
              (cost[0]?.type !== "trash-can" || !sameCard(c, card)),
          );
        const payable = canPay(
          s,
          sid,
          e,
          c,
          null,
          cost.length > 0 ? cost : null,
        );
        const valid =
          !context?.unpreventable && (!validContext || validContext(context));
        return relevant.length > 0 && payable && valid;
      }),
      async: true,
      fakeCost: cost,
      effect: req(function (
        this: void,
        s: GameState,
        sid: string,
        e: EID,
        c: Card,
        t: unknown[],
      ) {
        const context = (s as any).prevent?.trash;
        const remaining = context?.remaining;
        if (!remaining || !Array.isArray(remaining)) return;

        const relevant = remaining
          .map((r: any) => (typeof r === "object" && "card" in r ? r.card : r))
          .filter(
            (card: Card) =>
              types.includes((card as any).type) &&
              installed(card) &&
              (cost[0]?.type !== "trash-can" || !sameCard(c, card)),
          );

        if (relevant.length === 1) {
          const targetCard = relevant[0];
          // prevent single card
          (s as any).prevent.trash.remaining = [];
        } else {
          // choose one
          // This would normally go through a choice prompt
          (s as any).prevent.trash.remaining = remaining.filter((r: any) => {
            const rc = typeof r === "object" && "card" in r ? r.card : r;
            return !sameCard(rc, (t as Card[])[0]);
          });
        }

        // Filter remaining to only valid cards
        const ctx2 = (s as any).prevent?.trash;
        if (ctx2?.remaining) {
          ctx2.remaining = ctx2.remaining.filter((r: any) => {
            const rc = typeof r === "object" && "card" in r ? r.card : r;
            return getCard(s, rc);
          });
        }
        effectCompleted(s, sid, e);
      }),
    } as any,
  } as any;
}

function resolveTrashForSide(state: GameState, side: string, eid: EID): void {
  const remaining =
    (state.prevent?.trash?.remaining as Array<{ card: Card }>) ?? [];

  const promptStr = (() => {
    if (side === "runner") {
      if (remaining.length === 1) {
        return `Prevent ${remaining[0].card.title} from being trashed?`;
      } else if (remaining.length <= 5) {
        const titles = remaining.map((r: any) => r.card.title ?? "").sort();
        return `Prevent any of ${enumerateStr(titles, "or")} from being trashed?`;
      } else {
        return `Prevent any of ${remaining.length} cards from being trashed?`;
      }
    }
    return "Choose an interrupt";
  })();

  const optionStr = `Continue trashing ${quantify(remaining.length, "card")}`;

  resolveKeyedPreventionForSide(state, side, eid, "trash", {
    dataType: "sequential",
    prompt: promptStr,
    waiting: "your opponent to resolve trash prevention triggers",
    option: optionStr,
  });
}

/**
 * Opens a trash-prevention window for the given targets.
 * Mirrors: resolve-trash-prevention
 */
export function resolveTrashPrevention(
  state: GameState,
  side: string,
  eid: EID,
  targets: Card[],
  opts: {
    unpreventable?: boolean;
    gameTrash?: boolean;
    cause?: string;
    causeCard?: Card;
    type?: string;
  },
): void {
  const { unpreventable, gameTrash, cause, causeCard, type } = opts;

  // Determine untrashable cards
  const untrashableList: Array<{ card: Card; reason: string }> = [];
  for (const card of targets) {
    if (!gameTrash && untrashableWhileRezzed(state, side, card)) {
      untrashableList.push({
        card,
        reason: "cannot be trashed while installed",
      });
    } else if (side === "runner" && !canTrash(state, side, card)) {
      untrashableList.push({ card, reason: "cannot be trashed" });
    } else if (
      side === "corp" &&
      untrashableWhileResources(card) &&
      allActiveInstalled(state, "runner").filter(resource).length > 1
    ) {
      untrashableList.push({
        card,
        reason: "cannot be trashed while there are other resources installed",
      });
    }
  }

  const untrashableCids = new Set(
    untrashableList.map((u: any) => (u.card as any).cid),
  );
  const trashable = targets.filter((c: any) => !untrashableCids.has((c as any).cid));

  const untrashableEntries = untrashableList.map((u: any) => ({
    card: u.card,
    destination: "discard",
    reason: u.reason,
  }));
  const trashableEntries = trashable.map((c: any) => ({
    card: c,
    destination: "discard",
  }));

  for (const { card, reason } of untrashableList) {
    if (reason) {
      enforceMsg(state, card, reason);
    }
  }

  pushPrevention(state, "trash", {
    count: trashable.length,
    remaining: trashableEntries as any,
    untrashable: untrashableEntries as any,
    prevented: 0,
    sourcePlayer: side,
    sourceCard: causeCard ?? null,
    priorityPasses: 0,
    type: type ?? "",
    unpreventable: unpreventable ?? false,
    cause: cause ?? "",
    gameTrash: gameTrash ?? false,
    uses: {},
  });

  if (trashable.length === 0) {
    completeWithResult(state, side, eid, fetchAndClear(state, "trash"));
  } else {
    resolvePreventEffectsWithPriority(
      state,
      state.activePlayer,
      eid,
      "trash",
      resolveTrashForSide,
    );
  }
}

// ---------------------------------------------------------------------------
// DAMAGE PREVENTION + PRE-DAMAGE PREVENTION
// ---------------------------------------------------------------------------

function damageKey(state: GameState): string | null {
  if (state.prevent?.["pre-damage"]) return "pre-damage";
  if (state.prevent?.damage) return "damage";
  console.error(
    `attempt to pick damage key when no damage prevention is active: \n ${nLastLogs(state, 5)}`,
  );
  return null;
}

export function damageType(state: GameState): string | undefined {
  const dk = damageKey(state);
  return dk
    ? (state.prevent[dk] as PreventionContext)?.type
    : undefined;
}

export function damagePending(state: GameState): number | undefined {
  const dk = damageKey(state);
  return dk
    ? ((state.prevent[dk] as PreventionContext)?.remaining as number)
    : undefined;
}

/**
 * Boost damage by n (add to remaining).
 * Mirrors: damage-boost
 */
export function damageBoost(
  state: GameState,
  side: string,
  eid: EID,
  n: number,
): void {
  const pending = damagePending(state);
  if (pending && pending > 0) {
    const dk = damageKey(state)!;
    const current = (state.prevent[dk] as PreventionContext)
      .remaining as number;
    (state.prevent[dk] as PreventionContext).remaining = current + n;
  }
  effectCompleted(state, side, eid);
}

export function damageName(state: GameState): string {
  const dt = damageType(state);
  switch (dt) {
    case "meat":
      return "meat";
    case "brain":
    case "core":
      return "core";
    case "net":
      return "net";
    default:
      return "neat";
  }
}

/**
 * Prevent n damage within an active damage/pre-damage window.
 * Mirrors: prevent-damage
 */
export function preventDamage(state: GameState, side: string, n: number | "all"): void;
export function preventDamage(state: GameState, side: string, eid: EID, n: number | "all"): void;
export function preventDamage(...rawArgs: any[]): void {
  let state: GameState, side: string, eid: EID, n: number | "all";
  if (rawArgs.length === 3) {
    [state, side, n] = rawArgs as [GameState, string, number | "all"];
    eid = makeEID(state);
  } else {
    [state, side, eid, n] = rawArgs as [GameState, string, EID, number | "all"];
  }
  const pending = damagePending(state);
  if (pending && pending > 0) {
    const dk = damageKey(state)!;
    const ctx = state.prevent[dk] as PreventionContext;
    if (n === "all") {
      ctx.remaining = 0;
      ctx.prevented = "all";
    } else {
      ctx.remaining = Math.max(0, (ctx.remaining as number) - n);
      ctx.prevented =
        typeof ctx.prevented === "number" ? (ctx.prevented as number) + n : n;
    }
  }
  effectCompleted(state, side, eid);
}

/**
 * Returns an ability that lets the player choose how much damage to prevent (up to n).
 * Mirrors: prevent-up-to-n-damage
 */
export function preventUpToNDamage(
  n: number | "all",
  types?: string[],
): Ability {
  return {
    prompt: msg(
      "Choose how much ",
      (state: GameState) => damageName(state),
      " damage prevent",
    ),
    req: req(function (
      this: void,
      s: GameState,
      sid: string,
      e: EID,
      c: Card,
      t: unknown[],
    ) {
      const dk = damageKey(s);
      if (!dk) return false;
      const ctx = (s as any).prevent?.[dk] as PreventionContext;
      if (!ctx) return false;
      if (!preventableContext(ctx)) return false;
      if (types && !types.includes(ctx.type ?? "")) return false;
      return true;
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
        const dk = damageKey(s);
        const remaining = dk
          ? ((s as any).prevent[dk] as PreventionContext).remaining
          : 0;
        if (n === "all") return remaining as number;
        return Math.min(remaining as number, n as number);
      }),
      default: req(function (
        this: void,
        s: GameState,
        sid: string,
        e: EID,
        c: Card,
        t: unknown[],
      ) {
        const dk = damageKey(s);
        const remaining = dk
          ? ((s as any).prevent[dk] as PreventionContext).remaining
          : 0;
        if (n === "all") return remaining as number;
        return Math.min(remaining as number, n as number);
      }),
    },
    async: true,
    msg: msg(
      "prevent ",
      "target",
      " ",
      (s: GameState) => damageName(s),
      " damage",
    ),
    effect: req(function (
      this: void,
      s: GameState,
      sid: string,
      e: EID,
      c: Card,
      t: unknown[],
    ) {
      const target = (t as any[])[0];
      preventDamage(s, sid, e, target as number);
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
        preventDamage(s, sid, e, 0);
      }),
    },
  } as any;
}
