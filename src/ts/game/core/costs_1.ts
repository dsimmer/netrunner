// Cost definitions and dispatch.
// Mirrors: src/clj/game/core/costs.clj
//
// Each cost type registers four (sometimes five) functions:
//   - value:        numeric weight of the cost
//   - stealthValue: stealth-credit value (only meaningful for credit-style costs)
//   - label:        cost-string used in the UI
//   - payable:      predicate for whether the cost can be paid right now
//   - handler:      effect that actually pays the cost; signals completion via the eid

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability, NumberFn } from "./types.ts";

import {
  badPublicityAvailable,
  gainBadPublicity,
  loseBadPublicity,
} from "./bad_publicity";
import {
  allActive,
  allActiveInstalled,
  allInstalled,
  allInstalledRunnerType,
} from "./board";
import {
  hasSubtype,
  getCounter,
  getZone,
  inHand,
  isAgenda,
  isCorp,
  isFacedown,
  isHardware,
  isICE,
  isInstalled,
  isProgram,
  isResource,
  isRezzed,
  isRunner,
  active as isActive,
} from "./card";
import { getCardDef } from "./types.ts";
import { damage } from "./damage";
import {
  completeWithResult,
  makeEID,
  makeEIDFrom,
  registerEIDCallback,
} from "./eid";
import { resolveAbility, queueEvent } from "./engine";
import { anyEffects, isDisabledReg } from "./effects";
import { isScored } from "./flags";
import { deduct, lose } from "./gaining";
import {
  discardFromHand,
  flipFacedown,
  forfeit,
  mill,
  move,
  trash,
  trashCards,
} from "./moving";
import {
  pickCreditProvidingCards,
  pickCreditReducers,
  pickVirusCountersToSpend,
} from "./pick_counters";
import { addCounter, addProp } from "./props";
import { reveal, revealAndQueueEvent } from "./revealing";
import { derez } from "./rezzing";
import { shuffleDeck } from "./shuffling";
import { gainTags, loseTags } from "./tags";
import { cardStr } from "./to_string";
import { numberOfVirusCounters } from "./virus";
import { getCard } from "./finding";
import { continue_ability } from "../macros";
import { enumerateCards, enumerateStr, quantify, sameCard } from "../utils";

// ---------------------------------------------------------------------------
// Cost shape (extends the base Cost interface in types.ts with optional fields
// used by particular cost types: stealth, maximum, offset, args).
// ---------------------------------------------------------------------------

export interface Cost {
  type: string;
  amount: number;
  additional?: boolean;
  stealth?: number | "all-stealth";
  maximum?: number | NumberFn;
  offset?: number;
  args?: Record<string, unknown>;
  subAbility?: Ability;
}

// ---------------------------------------------------------------------------
// Multimethod dispatch tables
// ---------------------------------------------------------------------------

type ValueFn = (cost: Cost) => number;
type StealthFn = (cost: Cost) => number;
type LabelFn = (cost: Cost) => string;
type PayableFn = (
  cost: Cost,
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
) => boolean;
type HandlerFn = (
  cost: Cost,
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
) => void;

export const valueDispatch = new Map<string, ValueFn>();
const stealthValueDispatch = new Map<string, StealthFn>();
export const labelDispatch = new Map<string, LabelFn>();
export const payableDispatch = new Map<string, PayableFn>();
export const handlerDispatch = new Map<string, HandlerFn>();

export function value(cost: Cost): number {
  return valueDispatch.get(cost.type)?.(cost) ?? 0;
}

export function stealthValue(cost: Cost): number {
  return stealthValueDispatch.get(cost.type)?.(cost) ?? 0;
}

export function label(cost: Cost): string {
  return labelDispatch.get(cost.type)?.(cost) ?? "";
}

export function payable(
  cost: Cost,
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
): boolean {
  return (
    payableDispatch.get(cost.type)?.(cost, state, side, eid, card) ?? false
  );
}

export function handler(
  cost: Cost,
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
): void {
  handlerDispatch.get(cost.type)?.(cost, state, side, eid, card);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clicks(n: number): string {
  return Array(n).fill("[Click]").join("");
}

function bumpStat(
  state: GameState,
  side: string,
  path: string[],
  delta: number,
): void {
  const root = (state as any).stats ?? ((state as any).stats = {});
  let cur = (root[side] ??= {});
  for (let i = 0; i < path.length - 1; i++) {
    cur = cur[path[i]] ??= {};
  }
  const last = path[path.length - 1];
  cur[last] = (cur[last] ?? 0) + delta;
}

function setRegister(
  state: GameState,
  side: string,
  key: string,
  val: unknown,
): void {
  const sideObj: any = (state as any)[side];
  if (!sideObj.register) sideObj.register = {};
  sideObj.register[key] = val;
}

function canForfeit(card: Card | null): boolean {
  return !(card as any)?.flags?.["cannot-forfeit"];
}

/**
 * waitFor: starts an async action with a fresh eid and invokes `next`
 * with the eid result once that eid completes. Mirrors Clojure (wait-for ...).
 */
export function waitFor(
  state: GameState,
  parentEid: EID,
  start: (innerEid: EID) => void,
  next: (asyncResult: any, innerEid: EID) => void,
): void {
  const inner = makeEIDFrom(state, parentEid);
  registerEIDCallback(state, inner, (_s: any, _side: any, completed: any) => {
    next((completed as EID).result, completed as EID);
  });
  start(inner);
}

// ---------------------------------------------------------------------------
// Pay-credits provider helpers
// ---------------------------------------------------------------------------

function payCreditsCfg(card: Card): any | null {
  return (getCardDef(card) as any)?.interactions?.["pay-credits"] ?? null;
}

function activePayCreditCards(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  reducers: boolean,
): Card[] {
  const all = Array.from(
    new Set([...allActive(state, side), ...allInstalled(state, side)]),
  );
  return all.filter((c) => {
    const pc = payCreditsCfg(c);
    if (!pc) return false;
    if (isDisabledReg(state, c)) return false;
    if (!(isActive(c) || pc["while-inactive"])) return false;
    if (pc.req && !pc.req(state, side, eid, c, [card])) return false;
    return reducers ? !!pc["cost-reduction"] : !pc["cost-reduction"];
  });
}

function eligiblePayCreditCards(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
): Card[] {
  return activePayCreditCards(state, side, eid, card, false).filter((c) => {
    const pc = payCreditsCfg(c);
    switch (pc?.type) {
      case "recurring":
        return getCounter(getCard(state, c), "recurring") > 0;
      case "credit":
        return getCounter(getCard(state, c), "credit") > 0;
      case "custom":
        return !!pc.req(state, side, eid, c, [card]);
      default:
        return false;
    }
  });
}

function eligibleReduceCreditCards(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
): Card[] {
  return activePayCreditCards(state, side, eid, card, true).filter((c) => {
    const pc = payCreditsCfg(c);
    switch (pc?.type) {
      case "recurring":
        return getCounter(getCard(state, c), "recurring") > 0;
      case "credit":
        return getCounter(getCard(state, c), "credit") > 0;
      case "custom":
        return !!pc.req(state, side, eid, c, [card]);
      default:
        return false;
    }
  });
}

function customAmount(
  state: GameState,
  side: string,
  eid: EID,
  c: Card,
): number {
  const cmt = payCreditsCfg(c)?.["custom-amount"];
  if (cmt == null) return 0;
  if (typeof cmt === "function") return cmt(state, side, eid, c, null);
  return cmt;
}

export function totalAvailableCredits(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
): number {
  if (anyEffects(state, side, "cannot-pay-credit")) return 0;
  const pool = anyEffects(state, side, "cannot-pay-credits-from-pool")
    ? 0
    : ((state as any)[side]?.credit ?? 0);
  const bp = badPublicityAvailable(state, side);
  const provider = [
    ...eligiblePayCreditCards(state, side, eid, card),
    ...eligibleReduceCreditCards(state, side, eid, card),
  ];
  const fromCards = provider.reduce(
    (sum, c) =>
      sum +
      getCounter(c, "recurring") +
      getCounter(c, "credit") +
      customAmount(state, side, eid, c),
    0,
  );
  return pool + bp + fromCards;
}

function eligiblePayStealthCreditCards(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
): Card[] {
  return eligiblePayCreditCards(state, side, eid, card).filter((c) =>
    hasSubtype(c, "Stealth"),
  );
}

function totalAvailableStealthCredits(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
): number {
  return eligiblePayStealthCreditCards(state, side, eid, card).reduce(
    (sum, c) =>
      sum +
      getCounter(c, "recurring") +
      getCounter(c, "credit") +
      (payCreditsCfg(c)?.["custom-amount"] ?? 0),
    0,
  );
}

// ===========================================================================
// Click
// ===========================================================================

valueDispatch.set("click", (c) => c.amount);
labelDispatch.set("click", (c) => clicks(value(c)));
payableDispatch.set("click", (c, state, side) => {
  return ((state as any)[side]?.click ?? 0) - value(c) >= 0;
});
handlerDispatch.set("click", (c, state, side, eid) => {
  const a = (eid as any).action;
  const idx = (eid as any).sourceInfo?.["ability-idx"];
  const sourceAbilities = (eid as any).source?.abilities;
  const isGameAction =
    (eid as any).sourceType === "ability" &&
    typeof idx === "number" &&
    Array.isArray(sourceAbilities) &&
    sourceAbilities.length > 0
      ? sourceAbilities[idx]?.action
      : undefined;
  const source: any = (eid as any).source ?? {};
  bumpStat(state, side, ["lose", "click"], value(c));
  deduct(state, side, ["click", value(c)] as any);
  queueEvent(
    state,
    side === "corp" ? ":corp-spent-click" : ":runner-spent-click",
    {
      action: a,
      "is-game-action?": isGameAction,
      "stripped-source-card": {
        cid: source.cid,
        title: source.title,
        type: source.type,
      },
      value: value(c),
      "ability-idx": (eid as any).sourceInfo?.["ability-idx"],
    } as any,
  );
  setRegister(state, side, "spent-click", true);
  completeWithResult(state, side, eid, {
    "paid/msg": `spends ${label(c)}`,
    "paid/type": "click",
    "paid/value": value(c),
  });
});

// ===========================================================================
// Lose-Click
// ===========================================================================

function loseClickLabel(cost: Cost): string {
  return clicks(value(cost));
}

valueDispatch.set("lose-click", (c) => c.amount);
labelDispatch.set("lose-click", (c) => `Lose ${loseClickLabel(c)}`);
payableDispatch.set("lose-click", (c, state, side) => {
  return ((state as any)[side]?.click ?? 0) - value(c) >= 0;
});
handlerDispatch.set("lose-click", (c, state, side, eid) => {
  bumpStat(state, side, ["lose", "click"], value(c));
  deduct(state, side, ["click", value(c)] as any);
  queueEvent(
    state,
    side === "corp" ? ":corp-spent-click" : ":runner-spent-click",
    { value: value(c) } as any,
  );
  setRegister(state, side, "spent-click", true);
  completeWithResult(state, side, eid, {
    "paid/msg": `loses ${loseClickLabel(c)}`,
    "paid/type": "lose-click",
    "paid/value": value(c),
  });
});

// ===========================================================================
// Credit
// ===========================================================================

valueDispatch.set("credit", (c) => c.amount);
stealthValueDispatch.set("credit", (c) => {
  const v = c.stealth;
  if (v === "all-stealth") return value(c);
  if (typeof v === "number") return v;
  return 0;
});
labelDispatch.set("credit", (c) => `${value(c)} [Credits]`);
payableDispatch.set("credit", (c, state, side, eid, card) => {
  const stealthOk =
    totalAvailableStealthCredits(state, side, eid, card) - stealthValue(c) >= 0;
  const valueOk = value(c) - stealthValue(c) >= 0;
  if (!stealthOk || !valueOk) return false;
  if (!anyEffects(state, side, "cannot-pay-credits-from-pool")) {
    if (((state as any)[side]?.credit ?? 0) - value(c) >= 0) return true;
  }
  return totalAvailableCredits(state, side, eid, card) - value(c) >= 0;
});
handlerDispatch.set("credit", (c, state, side, eid, card) => {
  const reducerFn = () => eligibleReduceCreditCards(state, side, eid, card);
  const providerFn = () => eligiblePayCreditCards(state, side, eid, card);
  waitFor(
    state,
    eid,
    (innerEid) =>
      resolveAbility(
        state,
        side,
        {
          ...pickCreditReducers(reducerFn, innerEid, value(c), stealthValue(c)),
          eid: innerEid,
        } as any,
        card,
        [],
      ),
    (reduceResult) => {
      const reduction = (reduceResult as any)?.reduction ?? 0;
      const updated = Math.max(0, value(c) - reduction);
      const event =
        side === "corp" ? ":corp-spent-credits" : ":runner-spent-credits";
      if (
        updated > 0 &&
        (providerFn().length > 0 || badPublicityAvailable(state, side) > 0)
      ) {
        waitFor(
          state,
          eid,
          (innerEid) =>
            resolveAbility(
              state,
              side,
              {
                ...pickCreditProvidingCards(
                  providerFn,
                  innerEid,
                  updated,
                  stealthValue(c),
                  {},
                  null,
                  {},
                  badPublicityAvailable(state, side),
                ),
                eid: innerEid,
              } as any,
              card,
              [],
            ),
          (payRes) => {
            queueEvent(state, event, { value: updated } as any);
            bumpStat(state, side, ["spent", "credit"], updated);
            completeWithResult(state, side, eid, {
              "paid/msg": `pays ${(payRes as any)?.msg ?? ""}`,
              "paid/type": "credit",
              "paid/value": (payRes as any)?.number,
              "paid/targets": (payRes as any)?.targets,
            });
          },
        );
      } else if (updated > 0) {
        lose(state, side, "credit" as any, updated);
        queueEvent(state, event, { value: updated } as any);
        bumpStat(state, side, ["spent", "credit"], updated);
        completeWithResult(state, side, eid, {
          "paid/msg": `pays ${updated} [Credits]`,
          "paid/type": "credit",
          "paid/value": updated,
        });
      } else {
        completeWithResult(state, side, eid, {
          "paid/msg": "pays 0 [Credits]",
          "paid/type": "credit",
          "paid/value": 0,
        });
      }
    },
  );
});

// ===========================================================================
// X-Credits
// ===========================================================================

valueDispatch.set("x-credits", () => 0);
stealthValueDispatch.set("x-credits", (c) =>
  typeof c.stealth === "number" ? c.stealth : 0,
);
labelDispatch.set("x-credits", () => "X [Credits]");
payableDispatch.set("x-credits", (c, state, side, eid, card) => {
  const offset = c.offset ?? 0;
  return (
    totalAvailableCredits(state, side, eid, card) >= offset &&
    stealthValue(c) <= totalAvailableStealthCredits(state, side, eid, card)
  );
});
handlerDispatch.set("x-credits", (c, state, side, eid, card) => {
  const offset = c.offset ?? 0;
  continue_ability(
    state,
    side,
    {
      async: true,
      prompt: "How many credits do you want to spend?",
      choices: {
        minimum: offset > 0 ? offset : 0,
        number: ((s: GameState, sd: string, ei: EID, ca: Card | null) => {
          const max = c.maximum;
          if (max != null) {
            const m =
              typeof max === "function"
                ? max(s, sd, ei, ca, [])
                : (max as number);
            return Math.min(totalAvailableCredits(s, sd, ei, ca), offset + m);
          }
          return totalAvailableCredits(s, sd, ei, ca);
        }) as any,
      } as any,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        ca: Card | null,
        targets: any[],
      ) => {
        const stealthForCall =
          stealthValue(c) === -1 ? c : (stealthValue(c) as any);
        const cost = targets[0] as number;
        const providerFn = () => eligiblePayCreditCards(s, sd, ei, ca);
        const event =
          sd === "corp" ? ":corp-spent-credits" : ":runner-spent-credits";
        if (cost > 0 && providerFn().length > 0) {
          waitFor(
            s,
            ei,
            (innerEid) =>
              resolveAbility(
                s,
                sd,
                {
                  ...pickCreditProvidingCards(
                    providerFn,
                    innerEid,
                    cost,
                    stealthForCall,
                  ),
                  eid: innerEid,
                } as any,
                ca,
                [],
              ),
            (payRes) => {
              bumpStat(s, sd, ["spent", "credit"], cost);
              completeWithResult(s, sd, ei, {
                "paid/msg": `pays ${(payRes as any)?.msg ?? ""}`,
                "paid/type": "x-credits",
                "paid/x-value": ((payRes as any)?.number ?? 0) - offset,
                "paid/value": (payRes as any)?.number,
                "paid/targets": (payRes as any)?.targets,
              });
            },
          );
        } else if (cost > 0) {
          lose(s, sd, "credit" as any, cost);
          queueEvent(s, event, { value: cost } as any);
          bumpStat(s, sd, ["spent", "credit"], cost);
          completeWithResult(s, sd, ei, {
            "paid/msg": `pays ${cost} [Credits]`,
            "paid/type": "x-credits",
            "paid/x-value": cost - offset,
            "paid/value": cost,
          });
        } else {
          completeWithResult(s, sd, ei, {
            "paid/msg": "pays 0 [Credits]",
            "paid/type": "x-credits",
            "paid/x-value": -offset,
            "paid/value": 0,
          });
        }
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Expend
// ===========================================================================

valueDispatch.set("expend", () => 1);
labelDispatch.set("expend", () => "reveal from HQ and trash itself");
payableDispatch.set("expend", (_c, state, _side, _eid, card) =>
  inHand(getCard(state, card)),
);
handlerDispatch.set("expend", (_c, state, side, eid, card) => {
  if (!card) return;
  revealAndQueueEvent(state, side, [card]);
  waitFor(
    state,
    eid,
    (innerEid) =>
      trash(
        state,
        "corp",
        innerEid,
        { ...(getCard(state, card) ?? card), seen: true },
        {
          cause: "ability-cost",
          unpreventable: true,
          "suppress-checkpoint": true,
        },
      ),
    () => {
      completeWithResult(state, side, eid, {
        "paid/msg": `trashes ${card.title} from HQ`,
        "paid/type": "expend",
        "paid/value": 1,
        "paid/targets": [card],
      });
    },
  );
});

// ===========================================================================
// Trash-can / Trash-self
// ===========================================================================

function registerSelfTrash(type: string): void {
  valueDispatch.set(type, (c) => c.amount);
  labelDispatch.set(type, () =>
    type === "trash-can" ? "[trash]" : "trash itself",
  );
  payableDispatch.set(type, (c, state, _side, _eid, card) => {
    return isInstalled(getCard(state, card)) && value(c) === 1;
  });
  handlerDispatch.set(type, (_c, state, side, eid, card) => {
    if (!card) return;
    waitFor(
      state,
      eid,
      (innerEid) =>
        trash(state, side, innerEid, card, {
          cause: "ability-cost",
          unpreventable: true,
          "suppress-checkpoint": true,
        }),
      () => {
        completeWithResult(state, side, eid, {
          "paid/msg": `trashes ${(card as any)["printed-title"] ?? card.title}`,
          "paid/type": type,
          "paid/value": 1,
          "paid/targets": [card],
        });
      },
    );
  });
}
registerSelfTrash("trash-can");
registerSelfTrash("trash-self");

// ===========================================================================
// Forfeit
// ===========================================================================

valueDispatch.set("forfeit", (c) => c.amount);
labelDispatch.set("forfeit", (c) => `forfeit ${quantify(value(c), "Agenda")}`);
payableDispatch.set("forfeit", (c, state, side) => {
  const scored: Card[] = (state as any)[side]?.scored ?? [];
  return scored.filter((s) => canForfeit(s)).length - value(c) >= 0;
});
handlerDispatch.set("forfeit", (c, state, side, eid, card) => {
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), "Agenda")} to forfeit`,
      async: true,
      choices: {
        max: value(c),
        all: true,
        req: ((
          s: GameState,
          sd: string,
          _e: EID,
          _ca: Card | null,
          targets: any[],
        ) => {
          const t = targets[0] as Card;
          return isScored(s, sd, t) && canForfeit(t);
        }) as any,
      } as any,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: Card[],
      ) => {
        for (const ag of targets) {
          forfeit(s, sd, makeEIDFrom(s, ei), ag, {
            msg: false,
            "suppress-checkpoint": true,
          });
        }
        completeWithResult(s, sd, ei, {
          "paid/msg": `forfeits ${quantify(value(c), "agenda")} (${enumerateCards(targets, "sorted")})`,
          "paid/type": "forfeit",
          "paid/value": value(c),
          "paid/targets": targets,
        });
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Forfeit-self
// ===========================================================================

valueDispatch.set("forfeit-self", () => 1);
labelDispatch.set("forfeit-self", () => "forfeit this Agenda");
payableDispatch.set("forfeit-self", (_c, state, side, _eid, card) =>
  isScored(state, side, getCard(state, card) as Card),
);
handlerDispatch.set("forfeit-self", (_c, state, side, eid, card) => {
  if (!card) return;
  waitFor(
    state,
    eid,
    (innerEid) =>
      forfeit(state, side, innerEid, card, {
        msg: false,
        "suppress-checkpoint": true,
      }),
    () => {
      completeWithResult(state, side, eid, {
        "paid/msg": `forfeits ${card.title}`,
        "paid/type": "forfeit-self",
        "paid/value": 1,
        "paid/targets": [card],
      });
    },
  );
});

// ===========================================================================
// Forfeit-or-trash-x-from-hand
// ===========================================================================

valueDispatch.set("forfeit-or-trash-x-from-hand", (c) => c.amount);
labelDispatch.set(
  "forfeit-or-trash-x-from-hand",
  (c) =>
    `forfeit an agenda or reveal and trash ${quantify(value(c), "card")} from hand`,
);
payableDispatch.set("forfeit-or-trash-x-from-hand", (c, state, side) => {
  const hand = ((state as any)[side]?.hand ?? []) as Card[];
  const scored = ((state as any)[side]?.scored ?? []) as Card[];
  return (
    hand.length - value(c) >= 0 ||
    scored.filter((s) => canForfeit(s)).length > 0
  );
});
handlerDispatch.set(
  "forfeit-or-trash-x-from-hand",
  (c, state, side, eid, card) => {
    const hand = side === "corp" ? "HQ" : "the grip";
    const selectFn = (x: Card) =>
      (side === "corp" ? isCorp(x) : isRunner(x)) && inHand(x);
    const trashAbility: Ability = {
      prompt: `Choose ${quantify(value(c), "card")} to reveal and trash`,
      choices: { all: true, max: value(c), card: selectFn } as any,
      async: true,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: Card[],
      ) => {
        waitFor(
          s,
          ei,
          (innerEid) => reveal(s, sd, innerEid, targets),
          () => {
            waitFor(
              s,
              ei,
              (innerEid) =>
                trashCards(
                  s,
                  sd,
                  innerEid,
                  targets.map((t) => ({ ...t, seen: true })),
                  {
                    unpreventable: true,
                    cause: "ability-cost",
                    "suppress-checkpoint": true,
                  },
                ),
              (asyncResult) => {
                const trashed = (asyncResult as Card[]) ?? [];
                completeWithResult(s, sd, ei, {
                  "paid/msg": `reveals and trashes ${quantify(trashed.length, "card")} (${enumerateCards(targets, "sorted")}) from ${hand}`,
                  "paid/type": "trash-from-hand",
                  "paid/value": trashed.length,
                  "paid/targets": trashed,
                });
              },
            );
          },
        );
      }) as any,
    };

    const forfeitAbility: Ability = {
      prompt: "Choose an Agenda to forfeit",
      async: true,
      choices: {
        max: 1,
        all: true,
        req: ((
          s: GameState,
          sd: string,
          _e: EID,
          _ca: Card | null,
          targets: any[],
        ) => {
          const t = targets[0] as Card;
          return isScored(s, sd, t) && canForfeit(t);
        }) as any,
      } as any,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: Card[],
      ) => {
        for (const ag of targets) {
          forfeit(s, sd, makeEIDFrom(s, ei), ag, {
            msg: false,
            "suppress-checkpoint": true,
          });
        }
        completeWithResult(s, sd, ei, {
          "paid/msg": `forfeits an agenda (${enumerateCards(targets, "sorted")})`,
          "paid/type": "forfeit",
          "paid/value": 1,
          "paid/targets": targets,
        });
      }) as any,
    };

    const scored = ((state as any)[side]?.scored ?? []) as Card[];
    const hand2 = ((state as any)[side]?.hand ?? []) as Card[];
    let chosen: Ability;
    if (scored.length === 0) chosen = trashAbility;
    else if (hand2.length - value(c) < 0) chosen = forfeitAbility;
    else
      chosen = {
        async: true,
        prompt: "Choose one",
        choices: [
          "Forfeit an Agenda",
          `Reveal and trash ${value(c)} cards from ${hand}`,
        ],
        effect: ((
          s: GameState,
          sd: string,
          ei: EID,
          ca: Card | null,
          targets: any[],
        ) => {
          const t = targets[0] as string;
          continue_ability(
            s,
            sd,
            t === "Forfeit an Agenda" ? forfeitAbility : trashAbility,
            ca,
            [],
          );
        }) as any,
      };
    continue_ability(state, side, chosen, card, []);
  },
);

// canPay is re-exported via ./costs from ./payment (the real implementation).
