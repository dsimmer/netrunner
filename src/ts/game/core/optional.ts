// Optional (Yes/No) ability handling.
// Mirrors: src/clj/game/core/optional.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability, AbilityFn, ReqFn } from "./types";
import { getCard } from "./finding";
import {
  effectCompleted,
  makeEID,
  makeEIDFrom,
  registerEIDCallback,
} from "./eid";
import { canTrigger, registerAbilityType, resolveAbility } from "./engine";
import { canPay } from "./payment";
import { showPrompt } from "./prompts";
import { toast } from "./toasts";
import { update } from "./update";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Mirrors Clojure (wait-for ...). */
function waitFor(
  state: GameState,
  parentEid: EID,
  start: (innerEid: EID) => void,
  next: (asyncResult: unknown, innerEid: EID) => void,
): void {
  const inner = makeEIDFrom(state, parentEid);
  registerEIDCallback(state, inner, (_s: any, _side: any, completed: any) => {
    next((completed as EID).result, completed as EID);
  });
  start(inner);
}

// ---------------------------------------------------------------------------
// optional-ability
// ---------------------------------------------------------------------------

/**
 * Shows a 'Yes/No' prompt and resolves the given ability's :yes-ability if Yes
 * is chosen, and :no-ability otherwise. If ability has an :autoresolve entry,
 * first call it as a 5-function, and if it returns 'Yes' or 'No' resolve the
 * ability as if prompt was displayed and Yes/No was chosen.
 *
 * Mirrors `optional-ability`.
 */
export function optionalAbility(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  message: string | undefined,
  ability: Ability,
  targets: unknown[],
): void {
  const yesAbility =
    (ability as any).yesAbility ?? (ability as any)["yes-ability"];
  const noAbility =
    (ability as any).noAbility ?? (ability as any)["no-ability"];
  const endEffect =
    (ability as any).endEffect ?? (ability as any)["end-effect"];

  const promptFn = (promptChoice: { value: string } | string): void => {
    const value =
      typeof promptChoice === "string" ? promptChoice : promptChoice?.value;
    const newEid = makeEIDFrom(state, eid);
    const canPayYes = yesAbility
      ? canPay(
          state,
          side,
          eid,
          card,
          card?.title ?? null,
          (yesAbility as any).cost,
        )
      : null;
    const abilityToDo =
      value === "Yes" && yesAbility && canPayYes
        ? { ...(yesAbility as Ability), once: (ability as any).once }
        : noAbility;

    waitFor(
      state,
      newEid,
      (innerEid) => {
        if (abilityToDo) {
          resolveAbility(
            state,
            side,
            { ...(abilityToDo as Ability), eid: innerEid },
            card,
            targets,
          );
        } else {
          effectCompleted(state, side, innerEid);
        }
      },
      () => {
        if (typeof endEffect === "function") {
          (endEffect as AbilityFn)(
            state,
            side,
            newEid,
            card,
            targets as Card[],
          );
        }
        effectCompleted(state, side, eid);
      },
    );
  };

  const autoresolveFn = (ability as any).autoresolve as
    | ((
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        targets: Card[],
      ) => string | null | undefined)
    | undefined;
  const autoresolveAnswer = autoresolveFn
    ? autoresolveFn(state, side, eid, card, targets as Card[])
    : null;

  const yesReq = (yesAbility as any)?.req as ReqFn | undefined;
  const yesReqOk = yesReq
    ? (typeof yesReq === "function"
        ? (yesReq as (...a: any[]) => any)(state, side, eid, card, targets as Card[])
        : !!yesReq)
    : true;
  const yesPayable = canPay(
    state,
    side,
    eid,
    card,
    card?.title ?? null,
    (yesAbility as any)?.cost,
  );
  const choices: string[] = [];
  if (yesPayable && yesReqOk) choices.push("Yes");
  choices.push("No");

  if (autoresolveAnswer === "Yes") {
    promptFn({ value: "Yes" });
    return;
  }
  if (autoresolveAnswer === "No") {
    promptFn({ value: "No" });
    return;
  }

  if (autoresolveFn) {
    toast(
      state,
      side,
      `This prompt can be skipped by clicking ${card?.title ?? ""} and toggling autoresolve`,
    );
  }

  showPrompt(
    state,
    side,
    card as any,
    message as any,
    choices as any,
    promptFn as any,
    { eid, ...(ability as any), targets } as any,
  );
}

// ---------------------------------------------------------------------------
// check-optional / register :optional ability type
// ---------------------------------------------------------------------------

/** Checks if there is an optional ability to resolve. Mirrors `check-optional`. */
function checkOptional(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
): void {
  const eid = (ability as any).eid as EID;
  const optional = (ability as any).optional as Ability;
  if (optional && "async" in (optional as any)) {
    throw new Error("Put :async in the :yes-ability");
  }

  if (canTrigger(state, side, eid, optional, card, targets)) {
    const stripped: Ability = { ...ability };
    delete (stripped as any).optional;
    delete (stripped as any).once;
    delete (stripped as any).req;

    const resolveSide = (optional as any).player ?? side;
    const wrapped: Ability = {
      ...stripped,
      async: true,
      effect: (
        s: GameState,
        _sd: string,
        e: EID,
        c: Card | null,
        t: Card[],
      ) => {
        optionalAbility(
          s,
          resolveSide,
          e,
          c,
          (optional as any).prompt,
          optional,
          t,
        );
      },
    };
    resolveAbility(state, side, wrapped, card, targets);
  } else {
    effectCompleted(state, side, eid);
  }
}

registerAbilityType("optional", checkOptional);

// ---------------------------------------------------------------------------
// Autoresolve helpers
// ---------------------------------------------------------------------------

/** Returns true if argument is `:never` / "never". Mirrors `never?`. */
export function isNever(x: unknown): boolean {
  return x === "never" || x === ":never";
}

type AutoresolvePred =
  | Record<string, string | undefined>
  | ((value: any) => any);

/**
 * Makes a card ability which lets the user toggle auto-resolve on an ability.
 * Setting is stored under `[:special toggle-kw]`.
 *
 * Mirrors `set-autoresolve`.
 */
export function setAutoresolve(toggleKw: string, abilityName: string): Ability {
  const labels: Record<string, string> = {
    always: "always",
    never: "never",
    ask: "ask whether it should",
  };

  return {
    autoresolve: true,
    label: `Toggle auto-resolve on ${abilityName}`,
    prompt: `Set auto-resolve on ${abilityName} to:`,
    choices: ["Always", "Never", "Ask"],
    effect: (
      state: GameState,
      side: string,
      _eid: EID,
      card: Card | null,
      targets: Card[],
    ) => {
      const target = (targets?.[0] as unknown as string) ?? "";
      const newSetting = target.toLowerCase();
      if (card) {
        (update as any)(
          state,
          side,
          (c: Card) => {
            const updated = { ...c };
            (updated as any).special = {
              ...((updated as any).special ?? {}),
              [toggleKw]: newSetting,
            };
            return updated;
          },
          card,
        );
      }
      const refreshed = card ? getCard(state, card) : null;
      const setting = (refreshed as any)?.special?.[toggleKw] as
        | string
        | undefined;
      const verb = setting ? (labels[setting] ?? setting) : "";
      toast(
        state,
        side,
        `From now on, ${abilityName} will ${verb} resolve.`,
        "info",
      );
    },
  } as unknown as Ability;
}

/**
 * Returns a 5-fn intended for use in the :autoresolve of an optional ability.
 * Function returns "Yes", "No" or undefined depending on whether card has
 * `[:special toggle-kw]` set to "always", "never" or something else.
 * If a function is passed in, instead call that on `[:special toggle-kw]`.
 *
 * Mirrors `get-autoresolve`.
 */
export function getAutoresolve(toggleKw: string, pred?: AutoresolvePred): (state: GameState, side: string, eid: EID, card: Card | null, targets: Card[]) => string | undefined;
export function getAutoresolve(state: GameState, side: string, card: Card | null, toggleKw: string): (state: GameState, side: string, eid: EID, card: Card | null, targets: Card[]) => string | undefined;
export function getAutoresolve(...rawArgs: any[]): any {
  // 4-arg form: (state, side, card, toggleKw) — drop the state/side/card and use just the kw
  if (rawArgs.length === 4 && typeof rawArgs[3] === "string") {
    return _getAutoresolveImpl(rawArgs[3]);
  }
  return _getAutoresolveImpl(rawArgs[0], rawArgs[1]);
}
function _getAutoresolveImpl(
  toggleKw: string,
  pred: AutoresolvePred = { always: "Yes", never: "No" },
): (
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: Card[],
) => string | undefined {
  return (state, _side, _eid, card, _targets) => {
    const refreshed = card ? getCard(state, card) : null;
    const value = (refreshed as any)?.special?.[toggleKw];
    if (typeof pred === "function") {
      return pred(value);
    }
    if (value == null) return undefined;
    return pred[value as string];
  };
}

/** Returns true when the argument is `:never`. Mirrors `never?` in clj. */
export function never(x: unknown): boolean {
  return x === ":never" || x === "never";
}
