// Cost definitions and dispatch.
// Mirrors: src/clj/game/core/costs.clj
//
// Each cost type registers four (sometimes five) functions:
//   - value:        numeric weight of the cost
//   - stealthValue: stealth-credit value (only meaningful for credit-style costs)
//   - label:        cost-string used in the UI
//   - payable:      predicate for whether the cost can be paid right now
//   - handler:      effect that actually pays the cost; signals completion via the eid

import type { GameState } from "./state.js";
import type { Card } from "./card.js";
import type { EID } from "./eid.js";
import type { Ability, NumberFn } from "./types.js";

import {
  badPublicityAvailable,
  gainBadPublicity,
  loseBadPublicity,
} from "./bad_publicity.js";
import {
  allActive,
  allActiveInstalled,
  allInstalled,
  allInstalledRunnerType,
} from "./board.js";
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
  isActive,
} from "./card.js";
import { getCardDef } from "./types.js";
import { damage } from "./damage.js";
import {
  completeWithResult,
  makeEID,
  makeEIDFrom,
  registerEIDCallback,
} from "./eid.js";
import { resolveAbility, queueEvent } from "./engine.js";
import { anyEffects, isDisabledReg } from "./effects.js";
import { isScored } from "./flags.js";
import { deduct, lose } from "./gaining.js";
import {
  discardFromHand,
  flipFacedown,
  forfeit,
  mill,
  move,
  trash,
  trashCards,
} from "./moving.js";
import {
  pickCreditProvidingCards,
  pickCreditReducers,
  pickVirusCountersToSpend,
} from "./pick_counters.js";
import { addCounter, addProp } from "./props.js";
import { reveal, revealAndQueueEvent } from "./revealing.js";
import { derez } from "./rezzing.js";
import { shuffleDeck } from "./shuffling.js";
import { gainTags, loseTags } from "./tags.js";
import { cardStr } from "./to_string.js";
import { numberOfVirusCounters } from "./virus.js";
import { getCard } from "./finding.js";
import { continue_ability } from "../macros.js";
import { enumerateCards, enumerateStr, quantify, sameCard } from "../utils.js";

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

const valueDispatch = new Map<string, ValueFn>();
const stealthValueDispatch = new Map<string, StealthFn>();
const labelDispatch = new Map<string, LabelFn>();
const payableDispatch = new Map<string, PayableFn>();
const handlerDispatch = new Map<string, HandlerFn>();

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
  return payableDispatch.get(cost.type)?.(cost, state, side, eid, card) ?? false;
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

function bumpStat(state: GameState, side: string, path: string[], delta: number): void {
  const root = (state as any).stats ?? ((state as any).stats = {});
  let cur = (root[side] ??= {});
  for (let i = 0; i < path.length - 1; i++) {
    cur = (cur[path[i]] ??= {});
  }
  const last = path[path.length - 1];
  cur[last] = (cur[last] ?? 0) + delta;
}

function setRegister(state: GameState, side: string, key: string, val: unknown): void {
  const sideObj: any = (state as any)[side];
  if (!sideObj.register) sideObj.register = {};
  sideObj.register[key] = val;
}

function canForfeit(card: Card | null): boolean {
  return !((card as any)?.flags?.["cannot-forfeit"]);
}

/**
 * waitFor: starts an async action with a fresh eid and invokes `next`
 * with the eid result once that eid completes. Mirrors Clojure (wait-for ...).
 */
function waitFor(
  state: GameState,
  parentEid: EID,
  start: (innerEid: EID) => void,
  next: (asyncResult: any, innerEid: EID) => void,
): void {
  const inner = makeEIDFrom(state, parentEid);
  registerEIDCallback(state, inner, (_s, _side, completed) => {
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
  const all = Array.from(new Set([...allActive(state, side), ...allInstalled(state, side)]));
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

function customAmount(state: GameState, side: string, eid: EID, c: Card): number {
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
      const event = side === "corp" ? ":corp-spent-credits" : ":runner-spent-credits";
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
              typeof max === "function" ? max(s, sd, ei, ca, []) : (max as number);
            return Math.min(totalAvailableCredits(s, sd, ei, ca), offset + m);
          }
          return totalAvailableCredits(s, sd, ei, ca);
        }) as any,
      } as any,
      effect: ((s: GameState, sd: string, ei: EID, ca: Card | null, targets: any[]) => {
        const stealthForCall =
          stealthValue(c) === -1 ? c : (stealthValue(c) as any);
        const cost = targets[0] as number;
        const providerFn = () => eligiblePayCreditCards(s, sd, ei, ca);
        const event = sd === "corp" ? ":corp-spent-credits" : ":runner-spent-credits";
        if (cost > 0 && providerFn().length > 0) {
          waitFor(
            s,
            ei,
            (innerEid) =>
              resolveAbility(
                s,
                sd,
                {
                  ...pickCreditProvidingCards(providerFn, innerEid, cost, stealthForCall),
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
        { cause: "ability-cost", unpreventable: true, "suppress-checkpoint": true },
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
  labelDispatch.set(type, () => (type === "trash-can" ? "[trash]" : "trash itself"));
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
        req: ((s: GameState, sd: string, _e: EID, _ca: Card | null, targets: any[]) => {
          const t = targets[0] as Card;
          return isScored(s, sd, t) && canForfeit(t);
        }) as any,
      } as any,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
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
    hand.length - value(c) >= 0 || scored.filter((s) => canForfeit(s)).length > 0
  );
});
handlerDispatch.set("forfeit-or-trash-x-from-hand", (c, state, side, eid, card) => {
  const hand = side === "corp" ? "HQ" : "the grip";
  const selectFn = (x: Card) =>
    (side === "corp" ? isCorp(x) : isRunner(x)) && inHand(x);
  const trashAbility: Ability = {
    prompt: `Choose ${quantify(value(c), "card")} to reveal and trash`,
    choices: { all: true, max: value(c), card: selectFn } as any,
    async: true,
    effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
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
      req: ((s: GameState, sd: string, _e: EID, _ca: Card | null, targets: any[]) => {
        const t = targets[0] as Card;
        return isScored(s, sd, t) && canForfeit(t);
      }) as any,
    } as any,
    effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
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
      effect: ((s: GameState, sd: string, ei: EID, ca: Card | null, targets: any[]) => {
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
});

// ===========================================================================
// Gain-tag
// ===========================================================================

valueDispatch.set("gain-tag", (c) => c.amount);
labelDispatch.set("gain-tag", (c) => `take ${quantify(value(c), "tag")}`);
payableDispatch.set("gain-tag", () => true);
handlerDispatch.set("gain-tag", (c, state, side, eid) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      gainTags(state, side, innerEid, value(c), { "suppress-checkpoint": true }),
    () => {
      completeWithResult(state, side, eid, {
        "paid/msg": `takes ${quantify(value(c), "tag")}`,
        "paid/type": "gain-tag",
        "paid/value": value(c),
      });
    },
  );
});

// ===========================================================================
// Tag (remove)
// ===========================================================================

valueDispatch.set("tag", (c) => c.amount);
labelDispatch.set("tag", (c) => `remove ${quantify(value(c), "tag")}`);
payableDispatch.set("tag", (c, state) => {
  return ((state as any).runner?.tag?.base ?? 0) - value(c) >= 0;
});
handlerDispatch.set("tag", (c, state, side, eid) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      loseTags(state, side, innerEid, value(c), { "suppress-checkpoint": true }),
    () => {
      completeWithResult(state, side, eid, {
        "paid/msg": `removes ${quantify(value(c), "tag")}`,
        "paid/type": "tag",
        "paid/value": value(c),
      });
    },
  );
});

// ===========================================================================
// X-Tags
// ===========================================================================

valueDispatch.set("x-tags", () => 0);
labelDispatch.set("x-tags", () => "remove X tags");
payableDispatch.set("x-tags", () => true);
handlerDispatch.set("x-tags", (_c, state, side, eid, card) => {
  const tagBase = (state as any).runner?.tag?.base ?? 0;
  if (tagBase <= 0) {
    completeWithResult(state, side, eid, {
      "paid/msg": "removes 0 tags",
      "paid/type": "x-tags",
      "paid/value": 0,
    });
    return;
  }
  continue_ability(
    state,
    side,
    {
      async: true,
      prompt: "How many tags do you want to remove?",
      choices: {
        number: ((s: GameState) => (s as any).runner?.tag?.base ?? 0) as any,
      } as any,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: any[]) => {
        const cost = targets[0] as number;
        if (cost === 0) {
          completeWithResult(s, sd, ei, {
            "paid/msg": "removes 0 tags",
            "paid/type": "x-tags",
            "paid/value": 0,
          });
          return;
        }
        waitFor(
          s,
          ei,
          (innerEid) =>
            loseTags(s, sd, innerEid, cost, { "suppress-checkpoint": true }),
          () => {
            completeWithResult(s, sd, ei, {
              "paid/msg": `removes ${quantify(cost, "tag")}`,
              "paid/type": "x-tags",
              "paid/value": cost,
            });
          },
        );
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Tag-or-bad-pub
// ===========================================================================

valueDispatch.set("tag-or-bad-pub", (c) => c.amount);
labelDispatch.set(
  "tag-or-bad-pub",
  (c) =>
    `remove ${quantify(value(c), "tag")} or take ${value(c)} bad publicity`,
);
payableDispatch.set("tag-or-bad-pub", () => true);
handlerDispatch.set("tag-or-bad-pub", (c, state, side, eid, card) => {
  const tagBase = (state as any).runner?.tag?.base ?? 0;
  if (tagBase - value(c) < 0) {
    waitFor(
      state,
      eid,
      (innerEid) =>
        gainBadPublicity(state, side, innerEid, value(c), {
          "suppress-checkpoint": true,
        }),
      () => {
        completeWithResult(state, side, eid, {
          "paid/msg": `gains ${value(c)} bad publicity`,
          "paid/type": "tag-or-bad-pub",
          "paid/value": value(c),
        });
      },
    );
    return;
  }
  continue_ability(
    state,
    side,
    {
      prompt: "Choose one",
      choices: [
        `Remove ${quantify(value(c), "tag")}`,
        `Gain ${value(c)} bad publicity`,
      ],
      async: true,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: any[]) => {
        const t = targets[0] as string;
        if (t === `Gain ${value(c)} bad publicity`) {
          waitFor(
            s,
            ei,
            (innerEid) =>
              gainBadPublicity(s, sd, innerEid, value(c), {
                "suppress-checkpoint": true,
              }),
            () => {
              completeWithResult(s, sd, ei, {
                "paid/msg": `gains ${value(c)} bad publicity`,
                "paid/type": "tag-or-bad-pub",
                "paid/value": value(c),
              });
            },
          );
        } else {
          waitFor(
            s,
            ei,
            (innerEid) =>
              loseTags(s, sd, innerEid, value(c), { "suppress-checkpoint": true }),
            () => {
              completeWithResult(s, sd, ei, {
                "paid/msg": `removes ${quantify(value(c), "tag")}`,
                "paid/type": "tag-or-bad-pub",
                "paid/value": value(c),
              });
            },
          );
        }
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Return-to-hand
// ===========================================================================

valueDispatch.set("return-to-hand", () => 1);
labelDispatch.set("return-to-hand", () => "return this card to your hand");
payableDispatch.set("return-to-hand", (_c, state, _side, _eid, card) =>
  isActive(getCard(state, card)),
);
handlerDispatch.set("return-to-hand", (_c, state, side, eid, card) => {
  if (!card) return;
  move(state, side, card, "hand");
  completeWithResult(state, side, eid, {
    "paid/msg": `returns ${card.title} to ${side === "corp" ? "HQ" : "[their] grip"}`,
    "paid/type": "return-to-hand",
    "paid/value": 1,
    "paid/targets": [card],
  });
});

// ===========================================================================
// Remove-from-game
// ===========================================================================

valueDispatch.set("remove-from-game", () => 1);
labelDispatch.set("remove-from-game", () => "remove this card from the game");
payableDispatch.set("remove-from-game", (_c, state, _side, _eid, card) =>
  isActive(getCard(state, card)),
);
handlerDispatch.set("remove-from-game", (_c, state, side, eid, card) => {
  if (!card) return;
  const moved = move(state, side, card, "rfg");
  completeWithResult(state, side, eid, {
    "paid/msg": `removes ${card.title} from the game`,
    "paid/type": "remove-from-game",
    "paid/value": 1,
    "paid/targets": [moved ?? card],
  });
});

// ===========================================================================
// Rfg-program
// ===========================================================================

valueDispatch.set("rfg-program", (c) => c.amount);
labelDispatch.set(
  "rfg-program",
  (c) => `remove ${quantify(value(c), "installed program")} from the game`,
);
payableDispatch.set("rfg-program", (c, state) => {
  return allInstalledRunnerType(state, "program").length - value(c) >= 0;
});
handlerDispatch.set("rfg-program", (c, state, side, eid, card) => {
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), "program")} to remove from the game`,
      choices: {
        all: true,
        max: value(c),
        card: (x: Card) => isInstalled(x) && isProgram(x) && !isFacedown(x),
      } as any,
      async: true,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
        for (const t of targets) {
          const tagged: Card = {
            ...t,
            persistent: { ...((t as any).persistent ?? {}), "from-cid": card?.cid },
          } as Card;
          move(s, sd, tagged, "rfg");
        }
        completeWithResult(s, sd, ei, {
          "paid/msg": `removes ${quantify(value(c), "installed program")} from the game (${enumerateStr(targets.map((t) => cardStr(s, t)))})`,
          "paid/type": "rfg-program",
          "paid/value": value(c),
          "paid/targets": targets,
        });
      }) as any,
    } as any,
    card,
    [],
  );
});

// ---------------------------------------------------------------------------
// Generic "trash N installed of type" cost factory
// ---------------------------------------------------------------------------

function registerTrashInstalled(
  type: string,
  description: string,
  countSelector: (state: GameState, side: string, card: Card | null) => Card[],
  cardPred: (state: GameState, side: string, card: Card | null) => (c: Card) => boolean,
): void {
  valueDispatch.set(type, (c) => c.amount);
  labelDispatch.set(type, (c) => `trash ${quantify(value(c), description)}`);
  payableDispatch.set(type, (c, state, side, _eid, card) => {
    return countSelector(state, side, card).length - value(c) >= 0;
  });
  handlerDispatch.set(type, (c, state, side, eid, card) => {
    continue_ability(
      state,
      side,
      {
        prompt: `Choose ${quantify(value(c), description)} to trash`,
        choices: {
          all: true,
          max: value(c),
          card: cardPred(state, side, card),
        } as any,
        async: true,
        effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
          waitFor(
            s,
            ei,
            (innerEid) =>
              trashCards(s, sd, innerEid, targets, {
                cause: "ability-cost",
                "suppress-checkpoint": true,
                unpreventable: true,
              }),
            (asyncResult) => {
              const trashed = (asyncResult as Card[]) ?? [];
              completeWithResult(s, sd, ei, {
                "paid/msg": `trashes ${quantify(trashed.length, description)} (${enumerateStr(targets.map((t) => cardStr(s, t)))})`,
                "paid/type": type,
                "paid/value": trashed.length,
                "paid/targets": targets,
              });
            },
          );
        }) as any,
      } as any,
      card,
      [],
    );
  });
}

// trash-other-installed (excludes self)
registerTrashInstalled(
  "trash-other-installed",
  "installed card",
  (state, side, card) =>
    allInstalled(state, side).filter((c) => !sameCard(card as any, c)),
  (_state, side, card) => (c) =>
    isInstalled(c) &&
    !sameCard(c, card as any) &&
    (side === "runner" ? isRunner(c) : isCorp(c)),
);

// trash-installed (allows self)
registerTrashInstalled(
  "trash-installed",
  "installed card",
  (state, side) => allInstalled(state, side),
  (_state, side) => (c) =>
    isInstalled(c) && (side === "runner" ? isRunner(c) : isCorp(c)),
);

// hardware (overrides label/handler to include "of hardware")
registerTrashInstalled(
  "hardware",
  "installed piece",
  (state) => allInstalledRunnerType(state, "hardware"),
  () => (c) => isInstalled(c) && isHardware(c) && !isFacedown(c),
);
labelDispatch.set(
  "hardware",
  (c) => `trash ${quantify(value(c), "installed piece")} of hardware`,
);
handlerDispatch.set("hardware", (c, state, side, eid, card) => {
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), "installed piece")} of hardware to trash`,
      choices: {
        all: true,
        max: value(c),
        card: (x: Card) => isInstalled(x) && isHardware(x) && !isFacedown(x),
      } as any,
      async: true,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
        waitFor(
          s,
          ei,
          (innerEid) =>
            trashCards(s, sd, innerEid, targets, {
              cause: "ability-cost",
              "suppress-checkpoint": true,
              unpreventable: true,
            }),
          (asyncResult) => {
            const trashed = (asyncResult as Card[]) ?? [];
            completeWithResult(s, sd, ei, {
              "paid/msg": `trashes ${quantify(trashed.length, "installed piece")} of hardware (${enumerateStr(targets.map((t) => cardStr(s, t)))})`,
              "paid/type": "hardware",
              "paid/value": trashed.length,
              "paid/targets": targets,
            });
          },
        );
      }) as any,
    } as any,
    card,
    [],
  );
});

// program
registerTrashInstalled(
  "program",
  "installed program",
  (state) => allInstalledRunnerType(state, "program"),
  () => (c) => isInstalled(c) && isProgram(c) && !isFacedown(c),
);

// resource
registerTrashInstalled(
  "resource",
  "installed resource",
  (state) => allInstalledRunnerType(state, "resource"),
  () => (c) => isInstalled(c) && isResource(c) && !isFacedown(c),
);

// connection
registerTrashInstalled(
  "connection",
  "installed connection resource",
  (state) =>
    allActiveInstalled(state, "runner").filter((c) => hasSubtype(c, "Connection")),
  () => (c) =>
    isInstalled(c) && isResource(c) && hasSubtype(c, "Connection") && !isFacedown(c),
);

// ice
registerTrashInstalled(
  "ice",
  "installed rezzed ice",
  (state) =>
    allInstalled(state, "corp").filter((c) => isInstalled(c) && isRezzed(c) && isICE(c)),
  () => (c) => isInstalled(c) && isRezzed(c) && isICE(c),
);

// ===========================================================================
// Derez-other-harmonic
// ===========================================================================

valueDispatch.set("derez-other-harmonic", (c) => c.amount);
labelDispatch.set("derez-other-harmonic", (c) => `derez ${value(c)} Harmonic ice`);
payableDispatch.set("derez-other-harmonic", (c, state, _side, _eid, card) => {
  return (
    allActiveInstalled(state, "corp").filter(
      (x) => isRezzed(x) && hasSubtype(x, "Harmonic") && !sameCard(card as any, x),
    ).length -
      value(c) >=
    0
  );
});
handlerDispatch.set("derez-other-harmonic", (c, state, side, eid, card) => {
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${value(c)} Harmonic ice to derez`,
      choices: {
        all: true,
        max: value(c),
        card: (x: Card) =>
          isRezzed(x) && !sameCard(x, card as any) && hasSubtype(x, "Harmonic"),
      } as any,
      async: true,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
        waitFor(
          s,
          ei,
          (innerEid) =>
            derez(s, sd, innerEid, targets, {
              "suppress-checkpoint": true,
              "no-msg": true,
            }),
          () => {
            completeWithResult(s, sd, ei, {
              "paid/msg": `derezzes ${targets.length} Harmonic ice (${enumerateStr(targets.map((t) => cardStr(s, t)))})`,
              "paid/type": "derez",
              "paid/value": targets.length,
              "paid/targets": targets,
            });
          },
        );
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Bioroid-run-server
// ===========================================================================

valueDispatch.set("bioroid-run-server", (c) => c.amount);
labelDispatch.set(
  "bioroid-run-server",
  (c) => `trash ${quantify(value(c), "rezzed Bioroid")}`,
);
payableDispatch.set("bioroid-run-server", (c, state) => {
  const run = (state as any).run;
  if (!run) return false;
  const runServer = run?.server?.[0];
  return (
    allInstalled(state, "corp").filter(
      (x) =>
        isInstalled(x) &&
        isRezzed(x) &&
        hasSubtype(x, "Bioroid") &&
        getZone(x)?.[1] === runServer,
    ).length -
      value(c) >=
    0
  );
});
handlerDispatch.set("bioroid-run-server", (c, state, side, eid, card) => {
  const runServer = (state as any).run?.server?.[0];
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), " rezzed Bioroid", "")} to trash`,
      choices: {
        all: true,
        max: value(c),
        req: ((_s: GameState, _sd: string, _e: EID, _ca: Card | null, targets: any[]) => {
          const t = targets[0] as Card;
          return (
            isInstalled(t) &&
            isRezzed(t) &&
            hasSubtype(t, "Bioroid") &&
            getZone(t)?.[1] === runServer
          );
        }) as any,
      } as any,
      async: true,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
        waitFor(
          s,
          ei,
          (innerEid) =>
            trashCards(s, sd, innerEid, targets, {
              cause: "ability-cost",
              unpreventable: true,
            }),
          (asyncResult) => {
            const trashed = (asyncResult as Card[]) ?? [];
            completeWithResult(s, sd, ei, {
              "paid/msg": `trashes ${quantify(trashed.length, " rezzed Bioroid", "")} (${enumerateStr(targets.map((t) => cardStr(s, t)))})`,
              "paid/type": "bioroid-run-server",
              "paid/value": trashed.length,
              "paid/targets": targets,
            });
          },
        );
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Trash-from-deck
// ===========================================================================

valueDispatch.set("trash-from-deck", (c) => c.amount);
labelDispatch.set(
  "trash-from-deck",
  (c) => `trash ${quantify(value(c), "card")} from the top of your deck`,
);
payableDispatch.set("trash-from-deck", (c, state, side) => {
  return (((state as any)[side]?.deck ?? []) as Card[]).length - value(c) >= 0;
});
handlerDispatch.set("trash-from-deck", (c, state, side, eid) => {
  waitFor(
    state,
    eid,
    (innerEid) => mill(state, side, side, innerEid, value(c), { "suppress-checkpoint": true }),
    (asyncResult) => {
      const trashed = (asyncResult as Card[]) ?? [];
      completeWithResult(state, side, eid, {
        "paid/msg": `trashes ${quantify(trashed.length, "card")} from the top of ${side === "corp" ? "R&D" : "the stack"}`,
        "paid/type": "trash-from-deck",
        "paid/value": trashed.length,
        "paid/targets": trashed,
      });
    },
  );
});

// ===========================================================================
// Trash-from-hand
// ===========================================================================

valueDispatch.set("trash-from-hand", (c) => c.amount);
labelDispatch.set(
  "trash-from-hand",
  (c) => `trash ${quantify(value(c), "card")} from your hand`,
);
payableDispatch.set("trash-from-hand", (c, state, side) => {
  return (((state as any)[side]?.hand ?? []) as Card[]).length - value(c) >= 0;
});
handlerDispatch.set("trash-from-hand", (c, state, side, eid) => {
  const selectFn = (x: Card) =>
    (side === "corp" ? isCorp(x) : isRunner(x)) && inHand(x);
  const handName = side === "corp" ? "HQ" : "the grip";
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), "card")} to trash`,
      choices: { all: true, max: value(c), card: selectFn } as any,
      async: true,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
        waitFor(
          s,
          ei,
          (innerEid) =>
            trashCards(s, sd, innerEid, targets, {
              unpreventable: true,
              seen: false,
              cause: "ability-cost",
              "suppress-checkpoint": true,
            }),
          (asyncResult) => {
            const trashed = (asyncResult as Card[]) ?? [];
            const detail =
              sd === "runner" && trashed.length > 0
                ? ` (${enumerateStr(targets.map((t) => cardStr(s, t)))})`
                : "";
            completeWithResult(s, sd, ei, {
              "paid/msg": `trashes ${quantify(trashed.length, "card")}${detail} from ${handName}`,
              "paid/type": "trash-from-hand",
              "paid/value": trashed.length,
              "paid/targets": trashed,
            });
          },
        );
      }) as any,
    } as any,
    null,
    [],
  );
});

// ===========================================================================
// Randomly-trash-from-hand
// ===========================================================================

valueDispatch.set("randomly-trash-from-hand", (c) => c.amount);
labelDispatch.set(
  "randomly-trash-from-hand",
  (c) => `trash ${quantify(value(c), "card")} randomly from your hand`,
);
payableDispatch.set("randomly-trash-from-hand", (c, state, side) => {
  return (((state as any)[side]?.hand ?? []) as Card[]).length - value(c) >= 0;
});
handlerDispatch.set("randomly-trash-from-hand", (c, state, side, eid) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      discardFromHand(state, side, side, innerEid, value(c), {
        "suppress-checkpoint": true,
      }),
    (asyncResult) => {
      const trashed = (asyncResult as Card[]) ?? [];
      const detail =
        side === "runner" ? ` (${enumerateCards(trashed, "sorted")})` : "";
      completeWithResult(state, side, eid, {
        "paid/msg": `trashes ${quantify(trashed.length, "card")}${detail} randomly from ${side === "corp" ? "HQ" : "the grip"}`,
        "paid/type": "randomly-trash-from-hand",
        "paid/value": trashed.length,
        "paid/targets": trashed,
      });
    },
  );
});

// ===========================================================================
// Reveal-and-randomly-trash-from-hand
// ===========================================================================

valueDispatch.set("reveal-and-randomly-trash-from-hand", (c) => c.amount);
labelDispatch.set(
  "reveal-and-randomly-trash-from-hand",
  (c) => `trash ${quantify(value(c), "card")} randomly from your hand`,
);
payableDispatch.set("reveal-and-randomly-trash-from-hand", (c, state, side) => {
  return (((state as any)[side]?.hand ?? []) as Card[]).length - value(c) >= 0;
});
handlerDispatch.set("reveal-and-randomly-trash-from-hand", (c, state, side, eid) => {
  const hand = ((state as any)[side]?.hand ?? []) as Card[];
  const shuffled = [...hand].sort(() => Math.random() - 0.5);
  const toTrash = shuffled.slice(0, value(c)).map((cd) => ({ ...cd, seen: true }));
  const handName = side === "corp" ? "HQ" : "the grip";
  waitFor(
    state,
    eid,
    (innerEid) => reveal(state, side, innerEid, toTrash),
    () => {
      waitFor(
        state,
        eid,
        (innerEid) =>
          trashCards(state, side, innerEid, toTrash, {
            unpreventable: true,
            cause: "ability-cost",
          }),
        (asyncResult) => {
          const trashed = (asyncResult as Card[]) ?? [];
          completeWithResult(state, side, eid, {
            "paid/msg": `reveals and trashes ${quantify(trashed.length, "card")} (${enumerateCards(toTrash, "sorted")}) from ${handName}`,
            "paid/type": "reveal-and-randomly-trash-from-hand",
            "paid/value": trashed.length,
            "paid/targets": trashed,
          });
        },
      );
    },
  );
});

// ===========================================================================
// Trash-entire-hand
// ===========================================================================

valueDispatch.set("trash-entire-hand", () => 1);
labelDispatch.set("trash-entire-hand", () => "trash all cards in your hand");
payableDispatch.set("trash-entire-hand", () => true);
handlerDispatch.set("trash-entire-hand", (_c, state, side, eid) => {
  const cards = ((state as any)[side]?.hand ?? []) as Card[];
  waitFor(
    state,
    eid,
    (innerEid) =>
      trashCards(state, side, innerEid, cards, {
        unpreventable: true,
        "suppress-checkpoint": true,
        cause: "ability-cost",
      }),
    (asyncResult) => {
      const trashed = (asyncResult as Card[]) ?? [];
      const detail =
        side === "runner" && trashed.length > 0
          ? ` (${enumerateCards(trashed, "sorted")})`
          : "";
      completeWithResult(state, side, eid, {
        "paid/msg": `trashes all (${trashed.length}) cards in ${side === "runner" ? "[their] grip" : "HQ"}${detail}`,
        "paid/type": "trash-entire-hand",
        "paid/value": trashed.length,
        "paid/targets": trashed,
      });
    },
  );
});

// ===========================================================================
// Trash-{type}-from-hand factory
// ===========================================================================

function registerTrashTypeFromHand(
  type: string,
  description: string,
  pred: (c: Card) => boolean,
  detailFn: (targets: Card[]) => string,
): void {
  valueDispatch.set(type, (c) => c.amount);
  labelDispatch.set(type, (c) => `trash ${quantify(value(c), description)} in the grip`);
  payableDispatch.set(type, (c, state) => {
    return (((state as any).runner?.hand ?? []) as Card[]).filter(pred).length - value(c) >= 0;
  });
  handlerDispatch.set(type, (c, state, side, eid) => {
    continue_ability(
      state,
      side,
      {
        prompt: `Choose ${quantify(value(c), description)} to trash`,
        async: true,
        choices: {
          all: true,
          max: value(c),
          card: (x: Card) => pred(x) && inHand(x),
        } as any,
        effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
          waitFor(
            s,
            ei,
            (innerEid) =>
              trashCards(s, sd, innerEid, targets, {
                unpreventable: true,
                "suppress-checkpoint": true,
                cause: "ability-cost",
              }),
            (asyncResult) => {
              const trashed = (asyncResult as Card[]) ?? [];
              completeWithResult(s, sd, ei, {
                "paid/msg": `trashes ${quantify(trashed.length, description)}${detailFn(targets)}`,
                "paid/type": type,
                "paid/value": trashed.length,
                "paid/targets": trashed,
              });
            },
          );
        }) as any,
      } as any,
      null,
      [],
    );
  });
}

registerTrashTypeFromHand(
  "trash-hardware-from-hand",
  "piece",
  (c) => isHardware(c),
  (targets) => ` of hardware (${enumerateCards(targets, "sorted")}) from [their] grip`,
);
labelDispatch.set(
  "trash-hardware-from-hand",
  (c) => `trash ${quantify(value(c), "piece")} of hardware in the grip`,
);
registerTrashTypeFromHand(
  "trash-program-from-hand",
  "program",
  (c) => isProgram(c),
  (targets) => ` (${enumerateCards(targets, "sorted")}) from the grip`,
);
registerTrashTypeFromHand(
  "trash-resource-from-hand",
  "resource",
  (c) => isResource(c),
  (targets) => ` (${enumerateCards(targets, "sorted")}) from the grip`,
);

// ===========================================================================
// Damage costs (net, meat, brain)
// ===========================================================================

function registerDamage(
  type: string,
  damageKw: string,
  displayName: string,
): void {
  valueDispatch.set(type, (c) => c.amount);
  labelDispatch.set(type, (c) => `suffer ${value(c)} ${displayName}`);
  payableDispatch.set(type, (c, state) => {
    return value(c) <= (((state as any).runner?.hand ?? []) as Card[]).length;
  });
  handlerDispatch.set(type, (c, state, side, eid, card) => {
    waitFor(
      state,
      eid,
      (innerEid) =>
        damage(state, side, innerEid, damageKw, value(c), {
          unpreventable: true,
          card,
          "suppress-checkpoint": true,
        }),
      (asyncResult) => {
        const arr = (asyncResult as Card[]) ?? [];
        completeWithResult(state, side, eid, {
          "paid/msg": `suffers ${arr.length} ${displayName}`,
          "paid/type": type,
          "paid/value": arr.length,
          "paid/targets": arr,
        });
      },
    );
  });
}

registerDamage("net", "net", "net damage");
registerDamage("meat", "meat", "meat damage");
registerDamage("brain", "brain", "core damage");

// ===========================================================================
// Shuffle-installed-to-stack
// ===========================================================================

valueDispatch.set("shuffle-installed-to-stack", (c) => c.amount);
labelDispatch.set(
  "shuffle-installed-to-stack",
  (c) => `shuffle ${quantify(value(c), "installed card")} into your deck`,
);
payableDispatch.set("shuffle-installed-to-stack", (c, state, side) => {
  return allInstalled(state, side).length - value(c) >= 0;
});
handlerDispatch.set("shuffle-installed-to-stack", (c, state, side, eid) => {
  continue_ability(
    state,
    "runner",
    {
      prompt: `Choose ${quantify(value(c), "installed card")} to shuffle into ${side === "corp" ? "R&D" : "the stack"}`,
      choices: {
        max: value(c),
        all: true,
        card: (x: Card) =>
          isInstalled(x) && (side === "corp" ? isCorp(x) : isRunner(x)),
      } as any,
      async: true,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
        const moved = targets
          .map((t) => move(s, sd, t, "deck", { shuffled: true }))
          .filter((x): x is Card => !!x);
        shuffleDeck(s, sd, "deck");
        completeWithResult(s, sd, ei, {
          "paid/msg": `shuffles ${quantify(moved.length, "card")} (${enumerateCards(moved, "sorted")}) into ${side === "corp" ? "R&D" : "the stack"}`,
          "paid/type": "shuffle-installed-to-stack",
          "paid/value": moved.length,
          "paid/targets": moved,
        });
      }) as any,
    } as any,
    null,
    [],
  );
});

// ===========================================================================
// Add-installed-to-bottom-of-deck
// ===========================================================================

valueDispatch.set("add-installed-to-bottom-of-deck", (c) => c.amount);
labelDispatch.set(
  "add-installed-to-bottom-of-deck",
  (c) =>
    `add ${quantify(value(c), "installed card")} to the bottom of your deck`,
);
payableDispatch.set("add-installed-to-bottom-of-deck", (c, state, side) => {
  return allInstalled(state, side).length - value(c) >= 0;
});
handlerDispatch.set("add-installed-to-bottom-of-deck", (c, state, side, eid) => {
  const deckName = side === "corp" ? "R&D" : "the stack";
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), "installed card")} to move to the bottom of ${deckName}`,
      choices: {
        max: value(c),
        all: true,
        card: (x: Card) =>
          isInstalled(x) && (side === "corp" ? isCorp(x) : isRunner(x)),
      } as any,
      async: true,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
        const moved = targets
          .map((t) => move(s, sd, t, "deck"))
          .filter((x): x is Card => !!x);
        completeWithResult(s, sd, ei, {
          "paid/msg": `adds ${quantify(moved.length, "installed card")} to the bottom of ${deckName} (${enumerateStr(targets.map((t) => cardStr(s, t)))})`,
          "paid/type": "add-installed-to-bottom-of-deck",
          "paid/value": moved.length,
          "paid/targets": moved,
        });
      }) as any,
    } as any,
    null,
    [],
  );
});

// ===========================================================================
// Turn-hosted-matryoshka-facedown
// ===========================================================================

valueDispatch.set("turn-hosted-matryoshka-facedown", (c) => c.amount);
labelDispatch.set(
  "turn-hosted-matryoshka-facedown",
  (c) => `turn ${quantify(value(c), "hosted cop", "y")} of Matryoshka facedown`,
);
payableDispatch.set("turn-hosted-matryoshka-facedown", (c, state, _side, _eid, card) => {
  const hosted = ((getCard(state, card) as any)?.hosted ?? []) as Card[];
  return (
    value(c) <=
    hosted.filter((x) => !isFacedown(x) && x.title === "Matryoshka").length
  );
});
handlerDispatch.set("turn-hosted-matryoshka-facedown", (c, state, side, eid, card) => {
  const pred = (x: Card) => !isFacedown(x) && x.title === "Matryoshka";
  const hosted = ((getCard(state, card) as any)?.hosted ?? []) as Card[];
  const selected = hosted.filter(pred).slice(0, value(c));
  for (const cc of selected) flipFacedown(state, side, cc);
  completeWithResult(state, side, eid, {
    "paid/msg": `turns ${quantify(value(c), "hosted cop", "y")} of Matryoshka facedown`,
    "paid/type": "turn-hosted-matryoshka-facedown",
    "paid/value": value(c),
    "paid/targets": selected,
  });
});

// ===========================================================================
// Add-random-from-hand-to-bottom-of-deck
// ===========================================================================

valueDispatch.set("add-random-from-hand-to-bottom-of-deck", (c) => c.amount);
labelDispatch.set(
  "add-random-from-hand-to-bottom-of-deck",
  (c) => `add ${quantify(value(c), "random card")} to the bottom of your deck`,
);
payableDispatch.set("add-random-from-hand-to-bottom-of-deck", (c, state, side) => {
  return value(c) <= (((state as any)[side]?.hand ?? []) as Card[]).length;
});
handlerDispatch.set("add-random-from-hand-to-bottom-of-deck", (c, state, side, eid) => {
  const deck = side === "corp" ? "R&D" : "the stack";
  const hand = ((state as any)[side]?.hand ?? []) as Card[];
  const chosen = [...hand].sort(() => Math.random() - 0.5).slice(0, value(c));
  for (const cc of chosen) move(state, side, cc, "deck");
  completeWithResult(state, side, eid, {
    "paid/msg": `adds ${quantify(value(c), "random card")} to the bottom of ${deck}`,
    "paid/type": "add-random-from-hand-to-bottom-of-deck",
    "paid/value": value(c),
    "paid/targets": chosen,
  });
});

// ===========================================================================
// Hosted-to-hq
// ===========================================================================

valueDispatch.set("hosted-to-hq", (c) => c.amount);
labelDispatch.set(
  "hosted-to-hq",
  (c) => `add ${quantify(value(c), "hosted card")} to HQ`,
);
payableDispatch.set("hosted-to-hq", (c, state, _side, _eid, card) => {
  const hosted = ((getCard(state, card) as any)?.hosted ?? []) as Card[];
  return hosted.filter((x) => isCorp(x)).length - value(c) >= 0;
});
handlerDispatch.set("hosted-to-hq", (c, state, side, eid, card) => {
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), "card")} hosted on ${card?.title} to add to HQ`,
      choices: {
        max: value(c),
        all: true,
        req: ((_s: GameState, _sd: string, _e: EID, _ca: Card | null, targets: any[]) => {
          const t = targets[0] as Card;
          return isCorp(t) && sameCard((t as any).host, card as any);
        }) as any,
      } as any,
      async: true,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
        const moved = targets
          .map((t) => move(s, "corp", t, "hand"))
          .filter((x): x is Card => !!x);
        completeWithResult(s, sd, ei, {
          "paid/msg": `adds ${quantify(moved.length, "hosted card")} to HQ (${enumerateCards(moved, "sorted")})`,
          "paid/type": "hosted-to-hq",
          "paid/value": moved.length,
          "paid/targets": moved,
        });
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Any-agenda-counter
// ===========================================================================

valueDispatch.set("any-agenda-counter", (c) => c.amount);
labelDispatch.set("any-agenda-counter", () => "any agenda counter");
payableDispatch.set("any-agenda-counter", (c, state) => {
  const total = (((state as any).corp?.scored ?? []) as Card[])
    .map((x) => getCounter(x, "agenda"))
    .reduce((a, b) => a + b, 0);
  return total - value(c) >= 0;
});
handlerDispatch.set("any-agenda-counter", (c, state, side, eid) => {
  continue_ability(
    state,
    side,
    {
      prompt: "Choose an agenda with a counter",
      choices: {
        card: (x: Card) =>
          isAgenda(x) && isScored(state, side, x) && getCounter(x, "agenda") > 0,
      } as any,
      async: true,
      effect: ((s: GameState, sd: string, ei: EID, _ca: Card | null, targets: Card[]) => {
        const tgt = targets[0];
        waitFor(
          s,
          ei,
          (innerEid) =>
            addCounter(s, sd, innerEid, tgt, "agenda", -value(c), {
              "suppress-checkpoint": true,
            }),
          () => {
            queueEvent(s, ":agenda-counter-spent", { value: value(c) } as any);
            completeWithResult(s, sd, ei, {
              "paid/msg": `spends ${quantify(value(c), "hosted agenda counter")} from on ${tgt.title}`,
              "paid/type": "any-agenda-counter",
              "paid/value": value(c),
              "paid/targets": [tgt],
            });
          },
        );
      }) as any,
    } as any,
    null,
    [],
  );
});

// ===========================================================================
// Any-virus-counter
// ===========================================================================

valueDispatch.set("any-virus-counter", (c) => c.amount);
labelDispatch.set(
  "any-virus-counter",
  (c) => `any ${quantify(value(c), "virus counter")}`,
);
payableDispatch.set("any-virus-counter", (c, state) => {
  return numberOfVirusCounters(state) - value(c) >= 0;
});
handlerDispatch.set("any-virus-counter", (c, state, side, eid, card) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      resolveAbility(
        state,
        side,
        { ...pickVirusCountersToSpend(value(c)), eid: innerEid } as any,
        card,
        [],
      ),
    (asyncResult) => {
      completeWithResult(state, side, eid, {
        "paid/msg": `spends ${(asyncResult as any)?.msg ?? ""}`,
        "paid/type": "any-virus-counter",
        "paid/value": (asyncResult as any)?.number,
        "paid/targets": (asyncResult as any)?.targets,
      });
    },
  );
});

// ===========================================================================
// Advancement counter (on source card)
// ===========================================================================

valueDispatch.set("advancement", (c) => c.amount);
labelDispatch.set("advancement", (c) =>
  value(c) > 1
    ? quantify(value(c), "hosted advancement counter")
    : "hosted advancement counter",
);
payableDispatch.set("advancement", (c, _state, _side, _eid, card) => {
  return getCounter(card, "advancement") - value(c) >= 0;
});
handlerDispatch.set("advancement", (c, state, side, eid, card) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      addProp(state, side, innerEid, card, "advance-counter", -value(c), {
        placed: true,
        "suppress-checkpoint": true,
      }),
    () => {
      completeWithResult(state, side, eid, {
        "paid/msg": `spends ${quantify(value(c), "hosted advancement counter")} from on ${card?.title}`,
        "paid/type": "advancement",
        "paid/value": value(c),
      });
    },
  );
});

// ===========================================================================
// Agenda counter
// ===========================================================================

valueDispatch.set("agenda", (c) => c.amount);
labelDispatch.set("agenda", (c) =>
  value(c) > 1
    ? quantify(value(c), "hosted agenda counter")
    : "hosted agenda counter",
);
payableDispatch.set("agenda", (c, _state, _side, _eid, card) => {
  return getCounter(card, "agenda") - value(c) >= 0;
});
handlerDispatch.set("agenda", (c, state, side, eid, card) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      addCounter(state, side, innerEid, card, "agenda", -value(c), {
        "suppress-checkpoint": true,
      }),
    () => {
      queueEvent(state, ":agenda-counter-spent", { value: value(c) } as any);
      completeWithResult(state, side, eid, {
        "paid/msg": `spends ${quantify(value(c), "hosted agenda counter")} from on ${card?.title}`,
        "paid/type": "agenda",
        "paid/value": value(c),
      });
    },
  );
});

// ===========================================================================
// Power counter
// ===========================================================================

valueDispatch.set("power", (c) => c.amount);
labelDispatch.set("power", (c) =>
  value(c) > 1
    ? quantify(value(c), "hosted power counter")
    : "hosted power counter",
);
payableDispatch.set("power", (c, _state, _side, _eid, card) => {
  return getCounter(card, "power") - value(c) >= 0;
});
handlerDispatch.set("power", (c, state, side, eid, card) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      addCounter(state, side, innerEid, card, "power", -value(c), {
        "suppress-checkpoint": true,
      }),
    () => {
      completeWithResult(state, side, eid, {
        "paid/msg": `spends ${quantify(value(c), "hosted power counter")} from on ${card?.title}`,
        "paid/type": "power",
        "paid/value": value(c),
      });
    },
  );
});

// ===========================================================================
// X-power counter
// ===========================================================================

valueDispatch.set("x-power", () => 0);
labelDispatch.set("x-power", () => "X hosted power counters");
payableDispatch.set("x-power", (_c, _state, _side, _eid, card) => {
  return getCounter(card, "power") > 0;
});
handlerDispatch.set("x-power", (_c, state, side, eid, card) => {
  continue_ability(
    state,
    side,
    {
      async: true,
      prompt: "How many hosted power counters do you want to spend?",
      choices: {
        number: ((_s: GameState, _sd: string, _e: EID, ca: Card | null) =>
          getCounter(ca, "power")) as any,
      } as any,
      effect: ((s: GameState, sd: string, ei: EID, ca: Card | null, targets: any[]) => {
        const cost = targets[0] as number;
        waitFor(
          s,
          ei,
          (innerEid) =>
            addCounter(s, sd, innerEid, ca, "power", -cost, {
              "suppress-checkpoint": true,
            }),
          () => {
            completeWithResult(s, sd, ei, {
              "paid/msg": `spends ${quantify(cost, "hosted power counter")} from on ${ca?.title}`,
              "paid/type": "x-power",
              "paid/value": cost,
            });
          },
        );
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Virus counter
// ===========================================================================

valueDispatch.set("virus", (c) => c.amount);
labelDispatch.set("virus", (c) =>
  value(c) > 1
    ? quantify(value(c), "hosted virus counter")
    : "hosted virus counter",
);
payableDispatch.set("virus", (c, state, _side, _eid, card) => {
  const hivemind = allActiveInstalled(state, "runner")
    .filter((x) => x.title === "Hivemind")
    .reduce((sum, x) => sum + getCounter(x, "virus"), 0);
  return getCounter(card, "virus") + hivemind - value(c) >= 0;
});
handlerDispatch.set("virus", (c, state, side, eid, card) => {
  const hivemindTotal = allActiveInstalled(state, "runner")
    .filter((x) => x.title === "Hivemind")
    .reduce((sum, x) => sum + getCounter(x, "virus"), 0);
  if (hivemindTotal > 0) {
    waitFor(
      state,
      eid,
      (innerEid) =>
        resolveAbility(
          state,
          side,
          { ...pickVirusCountersToSpend(card, value(c)), eid: innerEid } as any,
          card,
          [],
        ),
      (asyncResult) => {
        completeWithResult(state, side, eid, {
          "paid/msg": `spends ${(asyncResult as any)?.msg ?? ""}`,
          "paid/type": "virus",
          "paid/value": (asyncResult as any)?.number,
          "paid/targets": (asyncResult as any)?.targets,
        });
      },
    );
  } else {
    const title = card?.title;
    waitFor(
      state,
      eid,
      (innerEid) =>
        addCounter(state, side, innerEid, card, "virus", -value(c), {
          "suppress-checkpoint": true,
        }),
      () => {
        completeWithResult(state, side, eid, {
          "paid/msg": `spends ${quantify(value(c), "hosted virus counter")} from on ${title}`,
          "paid/type": "virus",
          "paid/value": value(c),
        });
      },
    );
  }
});

// ===========================================================================
// Host-bad-pub
// ===========================================================================

valueDispatch.set("host-bad-pub", (c) => c.amount);
labelDispatch.set("host-bad-pub", (c) => `host ${value(c)} bad publicity`);
payableDispatch.set("host-bad-pub", (c, state) => {
  return ((state as any).corp?.["bad-publicity"]?.base ?? 0) - value(c) >= 0;
});
handlerDispatch.set("host-bad-pub", (c, state, side, eid, card) => {
  waitFor(
    state,
    eid,
    (innerEid) => loseBadPublicity(state, side, innerEid, value(c), null),
    () => {
      waitFor(
        state,
        eid,
        (innerEid) =>
          addCounter(state, side, innerEid, card, "bad-publicity", value(c), {
            "suppress-checkpoint": true,
          }),
        () => {
          completeWithResult(state, side, eid, {
            "paid/msg": `hosts ${value(c)} bad publicity on ${card?.title}`,
            "paid/type": "host-bad-pub",
            "paid/value": value(c),
          });
        },
      );
    },
  );
});

// Suppress unused-variable warnings for items wired into closures only.
void makeEID;
