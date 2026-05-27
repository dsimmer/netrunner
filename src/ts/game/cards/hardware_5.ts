//
/**
 * Hardware Cards
 * Ported from Clojure cards/hardware.clj to TypeScript
 *
 * Contains all Runner hardware card definitions with their abilities and events.
 */

import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreActions from "../core/actions";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCostFns from "../core/cost_fns";
import * as coreDamage from "../core/damage";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEid from "../core/eid";
import * as coreEngine from "../core/engine";
import * as coreEvents from "../core/events";
import * as coreExpose from "../core/expose";
import * as coreFinding from "../core/finding";
import * as coreFlags from "../core/flags";
import * as coreGaining from "../core/gaining";
import * as coreHandSize from "../core/hand_size";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreLink from "../core/link";
import * as coreMemory from "../core/memory";
import * as coreMoving from "../core/moving";
import * as coreOptional from "../core/optional";
import * as corePayment from "../core/payment";
import * as corePlayInstants from "../core/play_instants";
import * as corePrevention from "../core/prevention";
import * as corePrompts from "../core/prompts";
import * as coreProps from "../core/props";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreServers from "../core/servers";
import * as coreSetAside from "../core/set_aside";
import * as coreShuffling from "../core/shuffling";
import * as coreTags from "../core/tags";
import * as coreToString from "../core/to_string";
import * as coreToasts from "../core/toasts";
import * as coreUpdate from "../core/update";
import * as coreVirus from "../core/virus";
import * as coreWinning from "../core/winning";
import * as coreSetAsideModule from "../core/set_aside";
import * as coreSabotage from "../core/sabotage";
import * as coreMark from "../core/mark";
import * as utils from "../utils";
import * as jintekiUtils from "../../jinteki/utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";
import { sabotageAbility, mHelper, getHosted, countTagsFn } from "./_helpers";
import {
  accessBonusFn,
  addCounterFn,
  agendaFn,
  allActiveFn,
  allActiveInstalledFn,
  allCardsInHandStarFn,
  breachAccessBonus,
  cardStr,
  corpFn,
  damageNameFn,
  derezFn,
  drawAbility,
  drawFn,
  effectCompletedFn,
  enumerateCards,
  eventFn,
  expectedMuFn,
  exposeFn,
  firstEventFn,
  gainCreditsFn,
  gainTagsFn,
  getAutoresolveFn,
  getCardFn,
  getCounters,
  hardwareFn,
  hasSubtypeFn,
  hostFn,
  inDeckFn,
  inDiscardFn,
  inHandFn,
  inHandStarFn,
  inScoredFn,
  installedFn,
  linkPlusFn,
  loseCreditsFn,
  moveFn,
  muPlusFn,
  neverFn,
  preventDamageFn,
  preventEndRunFn,
  preventableFn,
  programFn,
  pumpFn,
  quantify,
  registerEventsFn,
  rezzedFn,
  runnerCanPayAndInstallFn,
  runnerFn,
  runnerHandSizePlusFn,
  runnerInstallFn,
  sameCard,
  shuffleDeck,
  systemMsg,
  targetServerFn,
  toC,
  totalCardsAccessedFn,
  trashCardsFn,
  trashCostFn,
  trashFn,
  triggerEventFn,
  virusMuPlusFn,
} from "./hardware_1";
import { cardDefFn } from "./hardware_2";
import { getPreventFn } from "./hardware_4";
import { complementFn } from "./hardware_6";

// __cardScopeShim: ambient 'state' and 'target' references at literal scope.
const state: any = undefined as any;
const target: any = undefined as any;

// Stub helpers (to be ported from clj cards/*.clj)
function setAutoresolveFn(_kw?: string, _name?: string): any {
  return {};
}
function runFn(_server?: any, _opts?: any): any {
  return {};
}

// Lemuria Codecracker
export const lemuriaCodecracker: CardDef = {
  title: "Lemuria Codecracker",
  abilities: [
    {
      action: true,
      async: true,
      cost: [toC("click", 1), toC("credit", 1)],
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (runnerFn(state)?.reg?.successfulRun || []).some(
          (s: any) => s === ":hq",
        );
      }),
      choices: { card: installedFn },
      label: "Expose a card",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          exposeFn(eid, [target], { card: card });
        },
      ),
    },
  ],
};

// LilyPAD
export const lilyPad: CardDef = {
  title: "LilyPAD",
  events: [
    {
      event: "runner-install",
      optional: {
        prompt: "Draw 1 card?",
        "waiting-prompt": true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return (
            programFn(ctx.card) &&
            firstEventFn(state, ":runner", "runner-install", (t: any[]) =>
              programFn((t[0] || {}).card),
            )
          );
        }),
        autoresolve: getAutoresolveFn("auto-fire"),
        "yes-ability": drawAbility(1),
        "no-ability": {
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              systemMsg(`declines to use ${card.title}`);
            },
          ),
        },
      },
    },
  ],
  "static-abilities": [muPlusFn(2)],
  abilities: [{ ...setAutoresolveFn("auto-fire", "LilyPAD") }],
};

// LLDS Memory Diamond
export const lldsMemoryDiamond: CardDef = {
  title: "LLDS Memory Diamond",
  "static-abilities": [linkPlusFn(1), runnerHandSizePlusFn(1), muPlusFn(1)],
};

// LLDS Processor
export const lldsProcessor: CardDef = {
  title: "LLDS Processor",
  events: [
    {
      event: "runner-install",
      silent: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return hasSubtypeFn(ctx.card, "Icebreaker");
      }),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          pumpFn(
            (forms.context(state, card, targets) as any)?.card,
            1,
            ":end-of-turn",
          );
        },
      ),
    },
  ],
};

// Lockpick
export const lockpick: CardDef = {
  title: "Lockpick",
  recurring: 1,
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const t = target;
        return (
          eid["source-type"] === ":ability" &&
          hasSubtypeFn(t, "Decoder") &&
          hasSubtypeFn(t, "Icebreaker")
        );
      }),
      type: ":recurring",
    },
  },
};

// Logos
export const logos: CardDef = {
  title: "Logos",
  "static-abilities": [muPlusFn(1), runnerHandSizePlusFn(1)],
  events: [
    {
      event: "agenda-scored",
      "change-in-game-state": {
        silent: true,
        req: req(function* (
          state: State,
          side?: Side,
          eid?: EID,
          card?: Card,
          targets?: any[],
        ): Generator<any, any, any> {
          return !!runnerFn(state)?.deck?.length;
        }),
      },
      optional: {
        prompt: "Search for a card?",
        "waiting-prompt": true,
        "yes-ability": {
          prompt: "Choose a card",
          msg: "add 1 card from the stack to the grip",
          choices: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            return runnerFn(state)?.deck || [];
          }),
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const target: any = (targets as any[])?.[0];
              triggerEventFn(":searched-stack");
              shuffleDeck(state, side, ":deck");
              moveFn(target, ":hand");
            },
          ),
        },
      },
    },
  ],
};

// Lucky Charm
export const luckyCharm: CardDef = {
  title: "Lucky Charm",
  prevention: [
    {
      prevents: "end-run",
      type: "ability",
      ability: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return (
            (runnerFn(state)?.reg?.successfulRun || []).some(
              (s: any) => s === ":hq",
            ) &&
            ctx.remaining > 0 &&
            getPreventFn(state)?.["end-run"]?.sourcePlayer === ":corp"
          );
        }),
        cost: [toC(":remove-from-game")],
        async: true,
        msg: "prevent the run from ending",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          preventEndRunFn(state, side, eid);
        }),
      },
    },
  ],
};

// Mâché
export const mache: CardDef = {
  title: "Mâché",
  abilities: [
    {
      ...drawAbility(1, null, {
        cost: [toC("power", 3)],
        "keep-menu-open": ":while-3-power-tokens-left",
      }),
    },
  ],
  events: [
    {
      event: "runner-trash",
      "once-per-instance": true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const pred = ({ card: c, accessed }: any) => accessed && corpFn(c);
        return (
          targets.some(pred) &&
          firstEventFn(state, side, "runner-trash", (t: any[]) => t.some(pred))
        );
      }),
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const pred = ({ card: c, accessed }: any) => accessed && corpFn(c);
        const target = targets.find(pred);
        const cost = trashCostFn(state, side, target?.card);
        if (cost) {
          systemMsg(
            state,
            side,
            `uses ${card.title} to place ${quantify(cost, "power counter")} on itself`,
          );
          addCounterFn(state, side, eid, card, "power", cost);
        } else {
          effectCompletedFn(state, side, eid);
        }
      }),
    },
  ],
};

// Madani
export const madani: CardDef = {
  title: "Madani",
  "static-abilities": [],
  abilities: [
    {
      cost: [toC("click", 1)],
      label: "Host any number of programs",
      prompt: "Choose any number of program",
      action: true,
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = (targets as any[])?.[0];
          return inHandFn(target) && programFn(target);
        }),
        max: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (runnerFn(state)?.hand || []).filter((c: Card) => programFn(c))
            .length;
        }),
      },
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `host ${enumerateCards(targets, ":sorted")}`,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        for (const t of targets) {
          hostFn(state, side, card, t);
        }
      }),
    },
    {
      cost: [toC("credit", 0)],
      label: "Install a hosted program",
      async: true,
      once: ":per-turn",
      prompt: "Choose a hosted program to install",
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = (targets as any[])?.[0];
          return (
            programFn(target) &&
            runnerCanPayAndInstallFn(state, side, eid, target, {
              "no-toast": true,
            }) &&
            sameCard(hostFn(state, card), target)
          );
        }),
      },
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        runnerInstallFn(state, side, eid, target, {
          displayOrigin: true,
          installSource: card,
        });
      }),
    },
  ],
};

// Maglectric Rapid (748 Mod)
export const maglectricRapid: CardDef = {
  title: "Maglectric Rapid (748 Mod)",
  events: [
    {
      event: "successful-run",
      prompt: "Derez a card?",
      skippable: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return (
          targetServerFn(ctx) === ":hq" &&
          allActiveInstalledFn(state, ":corp").some(
            (c: Card) => rezzedFn(c) && !agendaFn(c),
          )
        );
      }),
      choices: {
        card: (c: Card) =>
          installedFn(c) && corpFn(c) && rezzedFn(c) && !agendaFn(c),
      },
      cost: [toC(":trash-self", 1)],
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          derezFn(state, side, eid, target);
        },
      ),
    },
  ],
};

// Marrow
export const marrow: CardDef = {
  title: "Marrow",
  "static-abilities": [muPlusFn(1), runnerHandSizePlusFn(3)],
  "on-install": {
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDamage.damage(eid, ":brain", 1, { card: card });
      },
    ),
  },
  events: [
    {
      ...sabotageAbility(1),
      event: "agenda-scored",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
    },
  ],
};

// Masterwork (v37)
export const masterwork: CardDef = {
  title: "Masterwork (v37)",
  "static-abilities": [muPlusFn(1)],
  events: [
    {
      event: "run",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      "change-in-game-state": {
        silent: true,
        req: req(function* (
          state: State,
          side?: Side,
          eid?: EID,
          card?: Card,
          targets?: any[],
        ): Generator<any, any, any> {
          return !!runnerFn(state)?.hand?.length;
        }),
      },
      optional: {
        prompt: "Pay 1 [Credit] to install a piece of hardware?",
        "yes-ability": {
          async: true,
          prompt: "Choose a piece of hardware",
          req: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            return allCardsInHandStarFn(state, ":runner").some(
              (c: Card) =>
                hardwareFn(c) &&
                runnerCanPayAndInstallFn(
                  state,
                  side,
                  { ...eid, source: card },
                  c,
                  { "cost-bonus": 1 },
                ),
            );
          }),
          choices: {
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              const target: any = (targets as any[])?.[0];
              return (
                inHandStarFn(state, target) &&
                hardwareFn(target) &&
                runnerCanPayAndInstallFn(
                  state,
                  side,
                  { ...eid, source: card },
                  target,
                  { "cost-bonus": 1 },
                )
              );
            }),
          },
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const target: any = (targets as any[])?.[0];
              runnerInstallFn(
                { ...eid, source: card, "source-type": ":runner-install" },
                target,
                {
                  "cost-bonus": 1,
                  "msg-keys": { displayOrigin: true, installSource: card },
                },
              );
            },
          ),
        },
      },
    },
    drawAbility(1, null, {
      event: "runner-install",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return (
          hardwareFn(ctx.card) &&
          firstEventFn(state, side, "runner-install", (t: any[]) =>
            hardwareFn((t[0] || {}).card),
          )
        );
      }),
    }),
  ],
};

// Māui
export const maui: CardDef = {
  title: "Māui",
  "x-fn": req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    const corp = corpFn(state);
    return (corp?.servers?.hq?.ices || []).length;
  }),
  "static-abilities": [muPlusFn(2)],
  recurring: req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    const corp = corpFn(state);
    return (corp?.servers?.hq?.ices || []).length;
  }),
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          (getRunFn(state)?.server || []).length === 1 &&
          getRunFn(state)?.server[0] === ":hq"
        );
      }),
      type: ":recurring",
    },
  },
};

function getRunFn(state: State): any {
  return (state as any).run;
}

// Maw
export const maw: CardDef = {
  title: "Maw",
  "static-abilities": [muPlusFn(2)],
  events: [
    {
      event: "post-access-card",
      label: "Trash a card from HQ",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const ctx = forms.context(state, card, targets) || {};
        return (
          getPreventFn(state)?.noTrashOrSteal === 1 &&
          (corpFn(state)?.hand?.length ?? 0) > 0 &&
          !inDiscardFn(target) &&
          !inScoredFn(target)
        );
      }),
      once: ":per-turn",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const corp = corpFn(state);
        const cardToTrash =
          corp?.hand?.[Math.floor(Math.random() * corp.hand.length)] || null;
        const ctx = forms.context(state, card, targets) || {};
        const cardSeen =
          cardToTrash && sameCard(ctx["accessed-card"], cardToTrash);
        const finalCard = cardSeen
          ? { ...cardToTrash, seen: true }
          : cardToTrash;
        continue_ability(
          state,
          side,
          {
            effect: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              trashFn(state, ":corp", eid, finalCard, {
                causeCard: card,
                cause: ":forced-to-trash",
              });
            }),
            async: true,
            msg: `force the Corp to trash a random card from HQ${cardSeen ? " (" + finalCard.title + ")" : ""}`,
          },
          card,
          null,
        );
      }),
    },
  ],
};

// Maya
export const maya: CardDef = {
  title: "Maya",
  "static-abilities": [muPlusFn(2)],
  events: [
    {
      event: "post-access-card",
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return inDeckFn(ctx["accessed-card-snapshot"]);
        }),
        once: ":per-turn",
        prompt: (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ) =>
          `Move ${ctxFn?.()?.["accessed-card"]?.title || "the card"} to the bottom of R&D?`,
        "yes-ability": {
          msg: "move the card just accessed to the bottom of R&D",
          async: true,
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              moveFn(ctxFn?.()?.["accessed-card"], ":deck");
              gainTagsFn(":runner", eid, 1);
            },
          ),
        },
      },
    },
  ],
};

function ctxFn(): any {
  return null;
}

// MemStrips
export const memStrips: CardDef = {
  title: "MemStrips",
  "static-abilities": [virusMuPlusFn(3)],
};

// Methuselah
export const methuselah: CardDef = {
  title: "Methuselah",
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return !!runFn(state);
      }),
      type: ":credit",
    },
  },
  events: [
    {
      event: "run",
      "change-in-game-state": {
        req: req(function* (
          state: State,
          side?: Side,
          eid?: EID,
          card?: Card,
          targets?: any[],
        ): Generator<any, any, any> {
          return !!runnerFn(state)?.hand?.length;
        }),
        silent: true,
      },
      skippable: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      prompt: "Trash a hardware from the Grip?",
      choices: { card: (c: Card) => hardwareFn(c) && inHandFn(c) },
      async: true,
      "waiting-prompt": true,
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target: any = (targets as any[])?.[0];
        return ((): string => {
          const target: any = (targets as any[])?.[0];
          return `trash ${target.title} and place 2 [Credits] on itself`;
        })();
      },
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            trashFn(state, side, target, { unpreventable: true }),
          ],
          [],
        );
        addCounterFn(state, side, eid, card, "credit", 2);
      }),
    },
  ],
  "static-abilities": [muPlusFn(1)],
};

// Mind's Eye
export const mindsEye: CardDef = {
  title: "Mind's Eye",
  implementation: "Power counters added automatically",
  "static-abilities": [muPlusFn(1)],
  events: [
    {
      event: "successful-run",
      silent: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return targetServerFn(forms.context(state, card, targets)) === ":rd";
      }),
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          addCounterFn(eid, card, "power", 1);
        },
      ),
    },
  ],
  abilities: [
    {
      action: true,
      async: true,
      cost: [toC("click", 1), toC("power", 3)],
      msg: "breach R&D",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        accessBonusFn(state, side, ":rd", 1);
      }),
    },
  ],
};

// Mirror
export const mirror: CardDef = {
  title: "Mirror",
  "static-abilities": [muPlusFn(2)],
  events: [
    {
      event: "successful-run",
      skippable: true,
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return targetServerFn(forms.context(state, card, targets)) === ":rd";
      }),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          continue_ability(
            {
              prompt:
                "Choose a card and replace 1 spent [Recurring Credits] on it",
              choices: {
                card: (c: Card) =>
                  getCounters(c, "recurring") <
                  ((cardDefFn(c) || {})?.recurring ?? 0),
              },
              msg: (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                const target: any = (targets as any[])?.[0];
                return ((): string => {
                  const target: any = (targets as any[])?.[0];
                  return `replace 1 spent [Recurring Credits] on ${target.title}`;
                })();
              },
              async: true,
              effect: effect(addCounterFn(eid, target, "recurring", 1)),
            },
            card,
            null,
          );
        },
      ),
    },
  ],
};

// Monolith
export const monolith: CardDef = {
  title: "Monolith",
  "static-abilities": [muPlusFn(3)],
  "on-install": {
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(mHelper(1), card, null);
      },
    ),
  },
  prevention: [
    {
      prevents: "damage",
      type: "ability",
      ability: {
        async: true,
        cost: [toC(":trash-program-from-hand", 1)],
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `prevent 1 ${damageNameFn(state)} damage`,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return (
            ctx.type !== "meat" && ctx.type !== ":meat" && preventableFn(ctx)
          );
        }),
      },
    },
  ],
};

function mHelperFn(n: number): any {
  return {
    prompt: "Choose a program to install",
    choices: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        return (
          programFn(target) &&
          inHandStarFn(state, target) &&
          runnerCanPayAndInstallFn(
            state,
            side,
            { ...eid, source: card },
            target,
            { "cost-bonus": -4 },
          )
        );
      }),
    },
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const target: any = (targets as any[])?.[0];
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          runnerInstallFn(state, side, target, {
            "cost-bonus": -4,
            "msg-keys": { installSource: card, displayOrigin: true },
          }),
        ],
        [],
      );
      if (n < 3) {
        continue_ability(state, side, mHelperFn(n + 1), card, null);
      }
    }),
  };
}

// Mu Safecracker
export const muSafecracker: CardDef = {
  title: "Mu Safecracker",
  implementation: "Stealth credit restriction not enforced",
  events: [
    {
      event: "successful-run",
      skippable: true,
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return (
            targetServerFn(ctx) === ":hq" &&
            allActiveFn(state, ":runner").some((c: Card) =>
              hasSubtypeFn(c, "Stealth"),
            )
          );
        }),
        prompt: "Pay 1 [Credits] to access 1 additional card?",
        "yes-ability": {
          cost: [toC("credit", 1, { stealth: 1 })],
          msg: "access 1 additional card from HQ",
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              registerEventsFn(card, [
                breachAccessBonus(":hq", 1, { duration: ":end-of-run" }),
              ]);
            },
          ),
        },
      },
    },
    {
      event: "successful-run",
      skippable: true,
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return (
            targetServerFn(ctx) === ":rd" &&
            allActiveFn(state, ":runner").some((c: Card) =>
              hasSubtypeFn(c, "Stealth"),
            )
          );
        }),
        prompt: "Pay 2 [Credits] to access 1 additional card?",
        "yes-ability": {
          cost: [toC("credit", 2, { stealth: ":all-stealth" })],
          msg: "access 1 additional card from R&D",
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              registerEventsFn(card, [
                breachAccessBonus(":rd", 1, { duration: ":end-of-run" }),
              ]);
            },
          ),
        },
      },
    },
  ],
};

// Muresh Bodysuit
export const mureshBodysuit: CardDef = {
  title: "Muresh Bodysuit",
  prevention: [
    {
      prevents: "damage",
      type: "event",
      "max-uses": 1,
      mandatory: true,
      ability: {
        async: true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return (
            (ctx.type === "meat" || ctx.type === ":meat") &&
            firstEventFn(
              state,
              side,
              "pre-damage-flag",
              (t: any[]) => (t[0] || {})?.type === "meat",
            ) &&
            preventableFn(ctx)
          );
        }),
        msg: "reduce the pending meat damage by 1",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          preventDamageFn(state, side, eid, 1);
        }),
      },
    },
  ],
};

// Net-Ready Eyes
export const netReadyEyes: CardDef = {
  title: "Net-Ready Eyes",
  "on-install": {
    async: true,
    msg: "suffer 2 meat damage",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDamage.damage(eid, ":meat", 2, { unboostable: true, card: card });
      },
    ),
  },
  events: [
    {
      event: "run",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return allActiveInstalledFn(state, ":runner").some(
          (c: Card) => programFn(c) && hasSubtypeFn(c, "Icebreaker"),
        );
      }),
      choices: {
        card: (c: Card) => installedFn(c) && hasSubtypeFn(c, "Icebreaker"),
      },
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target: any = (targets as any[])?.[0];
        return ((): string => {
          const target: any = (targets as any[])?.[0];
          return `give ${target.title} +1 strength`;
        })();
      },
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          pumpFn(target, 1, ":end-of-run");
        },
      ),
    },
  ],
};

// NetChip
export const netChip: CardDef = {
  title: "NetChip",
  let: {
    netChipCount: (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ) =>
      allActiveInstalledFn(state, ":runner").filter(
        (c: Card) => c.title === "NetChip",
      ).length,
  },
  "enforce-conditions": {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const hosted = getHosted(state, card);
      const firstProgram = hosted.find((c: Card) => programFn(c));
      if (!firstProgram) return false;
      return (
        expectedMuFn(state, firstProgram) > getHostedFn(state, card).length
      );
    }),
    silent: true,
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `trash ${cardStr(
        state,
        getHostedFn(state, card).find((c: Card) => programFn(c)),
      )} for violating hosting restrictions`,
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const hosted = getHostedFn(state, card);
      const firstProgram = hosted.find((c: Card) => programFn(c));
      if (firstProgram) {
        systemMsg(
          state,
          null,
          `${cardStr(state, firstProgram)} is trashed for violating hosting restrictions`,
        );
        trashCardsFn(state, side, eid, [firstProgram], {
          unpreventable: true,
          "game-trash": true,
        });
      }
    }),
  },
  "static-abilities": [
    {
      type: ":can-host",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const ncCount = allActiveInstalledFn(state, ":runner").filter(
          (c: Card) => c.title === "NetChip",
        ).length;
        return programFn(target) && expectedMuFn(state, target) <= ncCount;
      }),
      "max-mu": req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return allActiveInstalledFn(state, ":runner").filter(
          (c: Card) => c.title === "NetChip",
        ).length;
      }),
      "max-cards": 1,
      "no-mu": true,
    },
  ],
};

function getHostedFn(state: State, card: Card): Card[] {
  const c = getCardFn(state, card);
  return c?.hosted || [];
}

// Obelus
export const obelus: CardDef = {
  title: "Obelus",
  "static-abilities": [
    muPlusFn(1),
    runnerHandSizePlusFn(
      req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return countTagsFn(state);
      }),
    ),
  ],
  events: [
    {
      event: "run-ends",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const ctx = forms.context(state, card, targets) || {};
        return !!(
          ctx.successful &&
          ([":rd", ":hq", "rd", "hq"].includes(ctx.target) ||
            (ctx.target?.includes &&
              (ctx.target.includes("rd") || ctx.target.includes("hq")))) &&
          firstEventFn(state, side, "run-ends", (t: any[]) => {
            const first = t[0];
            return (
              first?.successful &&
              (first.target === ":rd" ||
                first.target === ":hq" ||
                (first.target?.includes &&
                  (first.target.includes("rd") || first.target.includes("hq"))))
            );
          })
        );
      }),
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `draw ${quantify(totalCardsAccessedFn(forms.context(state, card, targets)) ?? 0, "card")}`,
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          drawFn(
            eid,
            totalCardsAccessedFn(forms.context(state, card, targets)) ?? 0,
          );
        },
      ),
    },
  ],
};

// Omni-drive
export const omniDrive: CardDef = {
  title: "Omni-drive",
  recurring: 1,
  "enforce-conditions": {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const hosted = getHostedFn(state, card);
      const firstProgram = hosted.find((c: Card) => programFn(c));
      return firstProgram && expectedMuFn(state, firstProgram) > 1;
    }),
    silent: true,
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `trash ${cardStr(
        state,
        getHostedFn(state, card).find((c: Card) => programFn(c)),
      )} for violating hosting restrictions`,
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const hosted = getHostedFn(state, card);
      const firstProgram = hosted.find((c: Card) => programFn(c));
      if (firstProgram) {
        systemMsg(
          state,
          null,
          `${cardStr(state, firstProgram)} is trashed for violating hosting restrictions`,
        );
        trashCardsFn(state, side, eid, [firstProgram], {
          unpreventable: true,
          "game-trash": true,
        });
      }
    }),
  },
  "static-abilities": [
    {
      type: ":can-host",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        return programFn(target) && expectedMuFn(state, target) <= 1;
      }),
      "max-mu": 1,
      "max-cards": 1,
      "no-mu": true,
    },
  ],
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const host = forms.host?.(state, card);
        return (
          eid["source-type"] === ":ability" &&
          programFn(target) &&
          host &&
          sameCard(card, host)
        );
      }),
      type: ":recurring",
    },
  },
};

// PAN-Weave
export const panWeave: CardDef = {
  title: "PAN-Weave",
  "on-install": {
    async: true,
    msg: "suffer 1 meat damage",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDamage.damage(eid, ":meat", 1, { unboostable: true, card: card });
      },
    ),
  },
  events: [
    {
      event: "successful-run",
      automatic: ":drain-credits",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return (
          (ctx.server?.[0] === ":hq" || ctx.server?.[0] === "hq") &&
          firstEventFn(state, side, "successful-run", (t: any[]) => {
            const first = t[0];
            return first?.server?.[0] === ":hq" || first?.server?.[0] === "hq";
          })
        );
      }),
      msg: "force the Corp to lose 1 [Credits]",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const corp = corpFn(state);
        if ((corp?.credit ?? 0) > 0) {
          yield wait_for(
            state,
            [{ asyncResult: "result" }, loseCreditsFn(state, ":corp", 1)],
            [],
          );
          systemMsg(state, side, `uses ${card.title} to gain 1 [Credits]`);
          gainCreditsFn(state, ":runner", eid, 1);
        } else {
          effectCompletedFn(state, side, eid);
        }
      }),
    },
  ],
};

// Pantograph
export const pantograph: CardDef = {
  title: "Pantograph",
  let: {
    installAbility: {
      async: true,
      prompt: "Choose a card to install",
      "waiting-prompt": true,
      "change-in-game-state": {
        req: req(function* (
          state: State,
          side?: Side,
          eid?: EID,
          card?: Card,
          targets?: any[],
        ): Generator<any, any, any> {
          return !!allCardsInHandStarFn(state, ":runner")?.length;
        }),
        silent: true,
      },
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = (targets as any[])?.[0];
          return (
            runnerFn(target) &&
            inHandStarFn(state, target) &&
            !eventFn(target) &&
            runnerCanPayAndInstallFn(state, side, eid, target, {
              "no-toast": true,
            })
          );
        }),
      },
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          runnerInstallFn(
            { ...eid, source: card, "source-type": ":runner-install" },
            target,
            { "msg-keys": { installSource: card, displayOrigin: true } },
          );
        },
      ),
    },
    gainCreditAbility: {
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      async: true,
      msg: "gain 1 [Credits]",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [{ asyncResult: "result" }, gainCreditsFn(state, ":runner", 1)],
          [],
        );
        continue_ability(state, side, forms.let?.installAbility, card, null);
      }),
    },
  },
  "static-abilities": [muPlusFn(1)],
  events: [
    { event: "agenda-scored", ...(forms.let?.gainCreditAbility || {}) },
    { event: "agenda-stolen", ...(forms.let?.gainCreditAbility || {}) },
  ],
};

// Paragon
export const paragon: CardDef = {
  title: "Paragon",
  "static-abilities": [muPlusFn(1)],
  events: [
    {
      event: "successful-run",
      automatic: ":pre-draw",
      interactive: getAutoresolveFn("auto-fire", complementFn(neverFn) as any),
      silent: getAutoresolveFn("auto-fire", neverFn),
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return firstEventFn(state, side, "successful-run");
        }),
        autoresolve: getAutoresolveFn("auto-fire"),
        "waiting-prompt": true,
        prompt: "Gain 1 [Credit] and look at the top card of the stack?",
        "yes-ability": {
          msg: "gain 1 [Credit] and look at the top card of the stack",
          async: true,
          effect: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            yield wait_for(
              state,
              [{ asyncResult: "result" }, gainCreditsFn(state, ":runner", 1)],
              [],
            );
            continue_ability(
              state,
              ":runner",
              {
                optional: {
                  prompt: (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) =>
                    `Add ${runnerFn(state)?.deck?.[0]?.title || "the top card"} to bottom of the stack?`,
                  "yes-ability": {
                    msg: "add the top card of the stack to the bottom",
                    effect: effect(
                      (
                        state: State,
                        side: Side,
                        eid: EID,
                        card: Card,
                        targets: any[],
                      ) => {
                        moveFn(":runner", runnerFn(state)?.deck?.[0], ":deck");
                      },
                    ),
                  },
                  "no-ability": {
                    effect: effect(
                      (
                        state: State,
                        side: Side,
                        eid: EID,
                        card: Card,
                        targets: any[],
                      ) => {
                        systemMsg(
                          "does not add the top card of the the stack to the bottom",
                        );
                      },
                    ),
                  },
                },
              },
              card,
              null,
            );
          }),
        },
        "no-ability": {
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              systemMsg(`declines to use ${card.title}`);
            },
          ),
        },
      },
    },
  ],
  abilities: [{ ...setAutoresolveFn("auto-fire", "Paragon") }],
};
