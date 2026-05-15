// Prevention system: tag, damage, trash, expose, end-run, jack-out, encounter, bad publicity.
// Mirrors: src/clj/game/core/prevention.clj
//
// This module implements the full prevention infrastructure used by damage, tags,
// trash, expose, end-run, jack-out, encounter and other interrupt-style mechanics.

import type { GameState, Effect } from "./state.js";
import type { Card } from "./card.js";
import type { EID } from "./eid.js";
import type { Ability } from "../../jinteki/utils.js";
import { allActive, allActiveInstalled } from "./board.js";
import { getCard } from "./finding.js";
import { installed, resource, rezzed, sameCard } from "./card.js";
import { cardDef } from "./card_defs.js";
import { chooseOneHelper } from "./choose_one.js";
import type { ChoiceOption } from "./choose_one.js";
import { cardAbilityCost } from "./cost_fns.js";
import { completeWithResult, effectCompleted } from "./eid.js";
import { anyEffects, getEffectMaps } from "./effects.js";
import { resolveAbility, triggerEventSimult, triggerEventSync } from "./engine.js";
import {
  canTrash,
  untrashableWhileResources,
  untrashableWhileRezzed,
} from "./flags.js";
import { canPay, toC } from "./payment.js";
import { enforceMsg, nLastLogs } from "./say.js";
import { cardStr } from "./to_string.js";
import { dissocIn, enumerateStr, quantify } from "../utils.js";
import { otherSide } from "../../jinteki/utils.js";
import { req, msg, wait_for } from "../macros.js";

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

function pushPrevention(state: GameState, key: string, map: PreventionContext): void {
  const existing = (state as any).prevent;
  if (existing) {
    (state as any).preventStack = [existing, ...(state as any).preventStack ?? []];
  }
  (state as any).prevent = { ...((state as any).prevent ?? {}), [key]: map };
}

function fetchAndClear(state: GameState, key: string): PreventionContext | undefined {
  const res = (state as any).prevent?.[key];
  const stack = (state as any).preventStack;
  if (stack && stack.length > 0) {
    (state as any).prevent = stack[0];
    (state as any).preventStack = stack.slice(1);
  } else {
    delete (state as any).prevent;
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
  const abs: PreventionEntry[] = (cdef as any).prevention
    ?.filter((p: any) => p.prevents === key)
    .map((p: any) => ({ ...p, card }))
    ?? [];

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
            [(p.ability as any), 0],
          )
        : false;

    // payable?
    const costs = cardAbilityCost(state, side, p.ability, card, []);
    const costsSeq = costs.length > 0 ? costs : null;
    const payable = canPay(state, side, eid, card, null, costsSeq);

    // not-used-too-many-times?
    const maxUses = (p as any).maxUses;
    const uses = (state as any).prevent?.[key]?.uses?.[(card as any).cid];
    const notUsedTooManyTimes =
      maxUses == null || uses == null || uses < maxUses;

    // ability-req?
    const abilityReqFn = (p.ability as any).req;
    const context = (state as any).prevent?.[key];
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
  return e.value(state, side, eid, e.card, targets);
}

function floatingPreventionAbilities(
  state: GameState,
  side: string,
  eid: EID,
  key: string,
): PreventionEntry[] {
  const effects = getEffectMaps(state, side, "prevention", eid, []);
  const cardVals: FloatingPreventionEntry[] = effects.map((ev) => ({
    card: ev.card,
    value: getEffectValueInternal(state, side, eid, [], ev) as PreventionEntry,
  }));

  const filtered = cardVals.filter(
    (cv) => cv.value?.prevents === key,
  );

  const playable = filtered
    .filter((cv) => {
      const card = cv.card ?? cv.value?.card ?? null;
      const prev = cv.value;
      const ability = prev?.ability;
      const costs = cardAbilityCost(state, side, ability, card as any, []);
      const costsSeq = costs.length > 0 ? costs : null;
      const payable = canPay(state, side, eid, card as any, null, costsSeq);

      const maxUses = (prev as any)?.maxUses;
      const cid = (card as any)?.cid;
      const uses = cid ? (state as any).prevent?.[key]?.uses?.[cid] : undefined;
      const notUsedTooManyTimes =
        maxUses == null || uses == null || uses < maxUses;

      const abilityReqFn = (prev?.ability as any)?.req;
      const context = (state as any).prevent?.[key];
      const abilityReq =
        !abilityReqFn || abilityReqFn(state, side, eid, card as any, [context]);

      return payable && notUsedTooManyTimes && abilityReq;
    })
    .map((cv) => ({ ...cv.value, card: cv.card }));

  return playable;
}

function gatherPreventionAbilities(
  state: GameState,
  side: string,
  eid: EID,
  key: string,
): PreventionEntry[] {
  const activeCards = allActive(state, side);
  const fromCards = activeCards.flatMap((c) =>
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
  const ctx = (state as any).prevent?.[key];
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
    ctx.prevented =
      typeof ctx.prevented === "number" ? ctx.prevented + n : n;
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
    effect: req(
      function (
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
        resolveAbility(s, sid, e, prevention.ability, card, [context]);
      },
    ),
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

  resolveAbility(state, side, sourceEid, finalAbility, card, null);
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

function resolveKeyedPreventionForSide(
  state: GameState,
  side: string,
  eid: EID,
  key: string,
  args: KeyedPreventionArgs,
): void {
  const remainder = (state as any).prevent?.[key]?.remaining;
  const passed = (state as any).prevent?.[key]?.passed;

  const promptStr = typeof args.prompt === "function" ? args.prompt(state, remainder) : args.prompt;
  const waitingStr = typeof args.waiting === "function" ? args.waiting(state, remainder) : args.waiting;
  const optionStr = typeof args.option === "function" ? args.option(state, remainder) : args.option;

  const isSequential = args.dataType === "sequential";
  const emptyRemainder = isSequential
    ? !remainder || (Array.isArray(remainder) && remainder.length === 0)
    : !(typeof remainder === "number" && remainder > 0);

  const damageSpecial =
    key === "pre-damage" || key === "damage"
      ? false
      : emptyRemainder;

  if (
    (isSequential
      ? !remainder || (Array.isArray(remainder) && remainder.length === 0)
      : key !== "pre-damage" && !(typeof remainder === "number" && remainder > 0)) ||
    passed
  ) {
    delete (state as any).prevent?.[key]?.passed;
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
      [
        () =>
          triggerPrevention(state, side, eid, key, preventions[0]),
      ],
    );
    return;
  }

  // Build choose-one options
  const options: ChoiceOption[] = [
    ...preventions.map((p) => buildPreventionOption(p, key)),
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
      waitingPrompt: waitingStr,
    },
    options,
  );

  wait_for(
    state,
    [
      { asyncResult: true },
      () => resolveKeyedPreventionForSide(state, side, eid, key, args),
    ],
    [() => resolveAbility(state, side, eid, chooseOneAbility, null, null)],
  );
}

function someMandatory(preventions: PreventionEntry[]): boolean {
  return preventions.some((p) => (p as any).mandatory === true);
}

// ---------------------------------------------------------------------------
// resolve-prevent-effects-with-priority
// ---------------------------------------------------------------------------

function resolvePreventEffectsWithPriority(
  state: GameState,
  side: string,
  eid: EID,
  key: string,
  prevFn: (state: GameState, side: string, eid: EID) => void,
): void {
  const priorityPasses = (state as any).prevent?.[key]?.priorityPasses ?? 0;

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
        const ctx = (state as any).prevent?.[key];
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

export function preventable(state: GameState, key: string): boolean {
  const ctx = (state as any).prevent?.[key];
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
        const payable = canPay(s, sid, e, c, null, cost.length > 0 ? cost : null);
        const valid = !context?.unpreventable && (!validContext || validContext(context));
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
          (s as any).prevent.trash.remaining = remaining.filter(
            (r: any) => {
              const rc = typeof r === "object" && "card" in r ? r.card : r;
              return !sameCard(rc, (t as Card[])[0]);
            },
          );
        }

        // Filter remaining to only valid cards
        const ctx2 = (s as any).prevent?.trash;
        if (ctx2?.remaining) {
          ctx2.remaining = ctx2.remaining.filter(
            (r: any) => {
              const rc = typeof r === "object" && "card" in r ? r.card : r;
              return getCard(s, rc);
            },
          );
        }
        effectCompleted(s, sid, e);
      }),
    } as any,
  } as any;
}

function resolveTrashForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
  const remaining = ((state as any).prevent?.trash?.remaining as Array<{ card: Card }>) ?? [];

  const promptStr = (() => {
    if (side === "runner") {
      if (remaining.length === 1) {
        return `Prevent ${remaining[0].card.title} from being trashed?`;
      } else if (remaining.length <= 5) {
        const titles = remaining
          .map((r) => r.card.title)
          .sort();
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
      untrashableList.push({ card, reason: "cannot be trashed while installed" });
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

  const untrashableCids = new Set(untrashableList.map((u) => (u.card as any).cid));
  const trashable = targets.filter((c) => !untrashableCids.has((c as any).cid));

  const untrashableEntries = untrashableList.map((u) => ({
    card: u.card,
    destination: "discard",
    reason: u.reason,
  }));
  const trashableEntries = trashable.map((c) => ({
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
    remaining: trashableEntries,
    untrashable: untrashableEntries,
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
  if ((state as any).prevent?.["pre-damage"]) return "pre-damage";
  if ((state as any).prevent?.damage) return "damage";
  console.error(
    `attempt to pick damage key when no damage prevention is active: \n ${nLastLogs(state, 5)}`,
  );
  return null;
}

export function damageType(state: GameState): string | undefined {
  const dk = damageKey(state);
  return dk ? ((state as any).prevent[dk] as PreventionContext)?.type : undefined;
}

export function damagePending(state: GameState): number | undefined {
  const dk = damageKey(state);
  return dk ? ((state as any).prevent[dk] as PreventionContext)?.remaining as number : undefined;
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
    const current = ((state as any).prevent[dk] as PreventionContext).remaining as number;
    ((state as any).prevent[dk] as PreventionContext).remaining = current + n;
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
export function preventDamage(
  state: GameState,
  side: string,
  eid: EID,
  n: number | "all",
): void {
  const pending = damagePending(state);
  if (pending && pending > 0) {
    const dk = damageKey(state)!;
    const ctx = (state as any).prevent[dk] as PreventionContext;
    if (n === "all") {
      ctx.remaining = 0;
      ctx.prevented = "all";
    } else {
      ctx.remaining = Math.max(0, (ctx.remaining as number) - n);
      ctx.prevented =
        typeof ctx.prevented === "number"
          ? (ctx.prevented as number) + n
          : n;
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
    prompt: msg("Choose how much ", (state: GameState) => damageName(state), " damage prevent"),
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
        const remaining = dk ? ((s as any).prevent[dk] as PreventionContext).remaining : 0;
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
        const remaining = dk ? ((s as any).prevent[dk] as PreventionContext).remaining : 0;
        if (n === "all") return remaining as number;
        return Math.min(remaining as number, n as number);
      }),
    },
    async: true,
    msg: msg("prevent ", "target", " ", (s: GameState) => damageName(s), " damage"),
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

function resolveDamageForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
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
      () => triggerEventSimult(state, side, eid, "pre-damage-flag", {}, { card, type, count: n }),
      () => {
        // After pre-damage resolves, copy remaining into damage prevention
        const preCtx = (state as any).prevent?.["pre-damage"] as PreventionContext;
        (state as any).prevent.damage = {
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
      () => resolvePreventEffectsWithPriority(state, state.activePlayer, eid, "damage", resolveDamageForSide),
    ],
    [
      () => resolvePreventEffectsWithPriority(state, state.activePlayer, eid, "pre-damage", resolvePreDamageForSide),
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
  const encounter = (state as any).prevent?.encounter as PreventionContext;
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
        const remaining = ((state as any).prevent?.["end-run"] as PreventionContext)?.remaining;
        if (remaining === 0) {
          completeWithResult(state, side, eid, fetchAndClear(state, "end-run"));
        } else {
          // Trigger end-run-interrupt event
          triggerEventSimult(state, side, eid, "end-run-interrupt", {}, { card, sourceEid: eid });

          if (unpreventable) {
            completeWithResult(state, side, eid, fetchAndClear(state, "end-run"));
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
    [() => triggerEventSimult(state, side, eid, "can-run-be-ended?", {}, { card, sourceEid: eid })],
  );
}

// ---------------------------------------------------------------------------
// JACK OUT PREVENTION
// ---------------------------------------------------------------------------

/**
 * Prevent the runner from jacking out.
 * Mirrors: prevent-jack-out
 */
export const preventJackOut = function (
  state: GameState,
  side: string,
  eid: EID,
): void {
  preventNumeric(state, side, eid, "jack-out", 1);
};

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
        () => completeWithResult(state, side, eid, fetchAndClear(state, "jack-out")),
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
  const ctx = (state as any).prevent?.expose;
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
    triggerEventSync(state, side, eid, preventEvent, { type: "expose", amount: 1 });
  } else {
    // Choose which card to prevent
    resolveAbility(
      state,
      side,
      eid,
      {
        prompt: "Prevent which card from being exposed?",
        choices: req(function (
          this: void,
          s: GameState,
          sid: string,
          e: EID,
          c: Card,
          t: unknown[],
        ) {
          return [...remaining].sort((a, b) =>
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
          const ctx = (s as any).prevent?.expose as PreventionContext;
          if (ctx) {
            ctx.remaining = (ctx.remaining as Card[]).filter(
              (r: Card) => !sameCard(r, target),
            );
            ctx.prevented =
              typeof ctx.prevented === "number" ? (ctx.prevented as number) + 1 : 1;
          }
        }),
      },
      card,
      null,
    );
  }
}

function resolveExposePreventionForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
  const remaining = ((state as any).prevent?.expose?.remaining as Card[]) ?? [];

  const promptStr = `Prevent ${enumerateStr(remaining.map((c) => cardStr(state, c, { visible: side === "corp" })), "or")} from being exposed?`;
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

  triggerEventSimult(state, side, eid, "expose-interrupt", {}, { cards: targets });

  // Filter out rezzed or nil cards
  const newTargets = targets
    .map((c) => getCard(state, c))
    .filter((c): c is Card => c != null && !rezzed(c));

  (state as any).prevent.expose.remaining = newTargets;
  (state as any).prevent.expose.count = newTargets.length;

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
        () => completeWithResult(state, side, eid, fetchAndClear(state, "expose")),
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
  n: number,
): void {
  preventNumeric(state, side, eid, "bad-publicity", n);
}

function resolveBadPubPreventionForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
  const ctx = (state as any).prevent?.["bad-publicity"] as PreventionContext;
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
      return !!(s as any).prevent?.tag;
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
        const remaining = ((s as any).prevent?.tag as PreventionContext)?.remaining as number;
        if (n === "all") return remaining;
        return Math.min(remaining, n as number);
      }),
      default: req(function (
        this: void,
        s: GameState,
        sid: string,
        e: EID,
        c: Card,
        t: unknown[],
      ) {
        const remaining = ((s as any).prevent?.tag as PreventionContext)?.remaining as number;
        if (n === "all") return remaining;
        return Math.min(remaining, n as number);
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
      const target = (t as any[])[0];
      preventTag(s, sid, e, target as number);
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
  } as any;
}

function resolveTagPreventionForSide(
  state: GameState,
  side: string,
  eid: EID,
): void {
  const ctx = (state as any).prevent?.tag as PreventionContext;
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
