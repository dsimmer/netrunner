//
/**
 * Program Cards
 * Ported from Clojure cards/programs.clj to TypeScript
 *
 * Contains all Runner program card definitions with their abilities and events.
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
import * as jintekiUtils from "../../jinteki/utils";
import * as utils from "../utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";
import {
  addCounter,
  allActiveInstalled,
  breakSub,
  currentIce,
  damage,
  drawCards,
  gainCredits,
  getCounters,
  getIceType,
  getMu,
  isProgram,
  isRemote,
  isTagged,
  moveCard,
  muPlus,
  runnerFn,
  runnerStack,
  toC,
  trash,
} from "./programs_1";

// Stub helpers (to be ported from clj cards/*.clj)
function autoIcebreaker(cdef: any): any {
  return cdef;
}

// Baker
export const baker: CardDef = {
  title: "Baker",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "trash Baker to gain 2 [Credits]",
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
          [{ asyncResult: "result" }, trash(state, side, eid, card)],
          [],
        );
        gainCredits(state, side, 2);
      }),
    },
  ],
};

// Bankroll
export const bankroll: CardDef = {
  title: "Bankroll",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "reveal the top 2 cards of the stack. Gain [Credits] equal to their combined MU cost.",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const stackCards = runnerStack(state).slice(-2).reverse();
        if (stackCards.length > 0) {
          corePrompts.showChooseCardsPrompt?.(
            state,
            side,
            "Top 2 cards of the stack",
            stackCards,
            ":discard",
            { faceup: true },
          );
          const totalMu = stackCards.reduce(
            (sum: number, c: Card) => sum + getMu(c),
            0,
          );
          if (totalMu > 0) {
            gainCredits(state, side, totalMu);
          }
        }
      }),
    },
  ],
};

// Banner
export const banner: CardDef = {
  title: "Banner",
  ...autoIcebreaker({
    abilities: [
      {
        label: "Prevent barrier subroutines from ending the run this encounter",
        cost: [toC(":trash-can")],
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ice = currentIce(state);
          return (
            ice &&
            (getIceType(ice) === "Barrier" || getIceType(ice) === "barrier")
          );
        }),
        msg: "prevent barrier subroutines from ending the run this encounter",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ice = currentIce(state);
          if (ice) {
            coreIce.dontResolveAllSubroutines(ice);
          }
        }),
      },
    ],
  }),
};

// Battering Ram
export const batteringRam: CardDef = {
  title: "Battering Ram",
  ...autoIcebreaker({
    abilities: [breakSub(2, 2, "Barrier")],
  }),
};

// Begemot
export const begemot: CardDef = {
  title: "Begemot",
  ...autoIcebreaker({
    "on-install": {
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
          [{ asyncResult: "result" }, drawCards(state, side, eid, 2)],
          [],
        );
      }),
    },
    abilities: [breakSub(1, 1, "Code Gate")],
  }),
};

// Berserker
export const berserker: CardDef = {
  title: "Berserker",
  ...autoIcebreaker({
    events: [
      {
        event: "encounter-ice",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return isTagged(state);
        }),
        msg: "give Berserker +3 [Strength] until the end of the run",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          coreIce.pump(card, 3, ":end-of-run");
        }),
      },
    ],
    abilities: [breakSub(2, 0, "All")],
  }),
};

// Bishop
export const bishop: CardDef = {
  title: "Bishop",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1), toC(":net", 1)],
      msg: "trash Bishop to draw 3 cards",
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
          [{ asyncResult: "result" }, trash(state, side, eid, card)],
          [],
        );
        drawCards(state, side, eid, 3);
      }),
    },
  ],
  events: [
    {
      event: "run-ends",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return ctx.successful || ctx.success === true;
      }),
      msg: "draw 1 card",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          drawCards(state, side, eid, 1);
        },
      ),
    },
  ],
};

// Black Orchestra
export const blackOrchestra: CardDef = {
  title: "Black Orchestra",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "reveal the top 3 cards of the stack. Put any number of programs from among them into your hand and the rest into your used pile.",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const stackCards = runnerStack(state).slice(-3).reverse();
        if (stackCards.length > 0) {
          corePrompts.showChooseCardsPrompt?.(
            state,
            side,
            "Choose programs to take",
            stackCards,
            ":hand",
            {
              min: 0,
              max: stackCards.length,
              faceup: true,
              filter: (c: Card) => isProgram(c),
            },
          );
          // Remaining cards go to used
          // (handled by game engine)
        }
      }),
    },
  ],
};

// BlacKat
export const blackat: CardDef = {
  title: "BlacKat",
  ...autoIcebreaker({
    implementation: "Stealth credit restriction not enforced",
    abilities: [
      breakSub(2, 1, "Code Gate"),
      {
        action: true,
        cost: [toC("click", 1), toC(":net", 1)],
        msg: "take 2 [Credits] from the top of the stack",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const topCard = runnerStack(state).slice(-1)[0];
          if (topCard) {
            gainCredits(state, side, 2);
          }
        }),
      },
    ],
  }),
};

// Blackstone
export const blackstone: CardDef = {
  title: "Blackstone",
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 0, "All"),
      {
        action: true,
        cost: [toC("click", 1)],
        msg: "give Blackstone +2 [Strength] until the end of the run",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          coreIce.pump(card, 2, ":end-of-run");
        }),
      },
    ],
    events: [
      {
        event: "run-starts",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return isRemote(ctx.server);
        }),
        msg: "give Blackstone +1 [Strength] until the end of the run",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          coreIce.pump(card, 1, ":end-of-run");
        }),
      },
    ],
  }),
};

// Boi-tatá
export const boiTata: CardDef = {
  title: "Boi-tatá",
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 2, "Sentry"),
      {
        action: true,
        cost: [toC("click", 1), toC(":net", 1)],
        msg: "place 1 power counter on Boi-tatá",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          addCounter(state, side, card, "power", 1);
        }),
      },
    ],
    "static-abilities": [
      {
        type: ":strength-bonus",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return getCounters(card, "power");
        }),
      },
    ],
  }),
};

// Botulus
export const botulus: CardDef = {
  title: "Botulus",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 2, "Sentry"),
      {
        action: true,
        cost: [toC("click", 1)],
        msg: "take 1 [Credits] from Botulus",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const credits = (card as any).credit ?? 0;
          if (credits > 0) {
            gainCredits(state, side, 1);
            (card as any).credit = credits - 1;
          }
        }),
      },
    ],
    "static-abilities": [
      {
        type: ":strength-bonus",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (card as any).credit ?? 0;
        }),
      },
    ],
  }),
};

// Brahman
export const brahman: CardDef = {
  title: "Brahman",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 2, "All"),
      {
        action: true,
        cost: [toC("click", 1)],
        msg: "give Brahman +1 [Strength] until the end of the run",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          coreIce.pump(card, 1, ":end-of-run");
        }),
      },
    ],
  }),
};

// Breach
export const breach: CardDef = {
  title: "Breach",
  "static-abilities": [
    muPlus(1),
    { type: ":breach-access-bonus", value: ":rd", count: 1 },
    { type: ":breach-access-bonus", value: ":archives", count: 1 },
  ],
};

// Bug
export const bug: CardDef = {
  title: "Bug",
  "static-abilities": [muPlus(1)],
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "search your rig for Bug and install it for free",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const rigCards = allActiveInstalled(state, side).filter(
          (c: Card) => c.title === "Bug",
        );
        if (rigCards.length > 0) {
          const targetCard = rigCards[0];
          coreInstalling.runnerInstall(state, side, eid, targetCard, {
            cost: 0,
            muCost: 0,
          });
        }
      }),
    },
  ],
};

// Bukhgalter
export const bukhgalter: CardDef = {
  title: "Bukhgalter",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Sentry")],
  }),
};

// Buzzsaw
export const buzzsaw: CardDef = {
  title: "Buzzsaw",
  ...autoIcebreaker({
    abilities: [breakSub(1, 2, "Code Gate")],
  }),
};

// Cache
export const cache: CardDef = {
  title: "Cache",
  "static-abilities": [muPlus(1)],
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "look at the top card of the stack and either put it into your hand or leave it on top of the stack",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const topCard = runnerStack(state).slice(-1)[0];
        if (topCard) {
          corePrompts.showYesNoPrompt?.(
            state,
            side,
            `Take ${topCard.title} into your hand?`,
            {
              onYes: () => {
                moveCard(state, side, topCard, ":hand");
              },
              onNo: () => {
                // leave on stack
              },
            },
          );
        }
      }),
    },
  ],
};

// Carmen
export const carmen: CardDef = {
  title: "Carmen",
  ...autoIcebreaker({
    "install-cost-bonus": req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return (runnerFn(state) as any)?.successfulRun ? -2 : 0;
    }),
    abilities: [breakSub(2, 2, "Barrier")],
  }),
};

// Cerberus "Cuj.0" H3
export const cerberusCuj0: CardDef = {
  title: 'Cerberus "Cuj.0" H3',
  "static-abilities": [muPlus(1)],
};

// Cerberus "Lady" H1
export const cerberusLady: CardDef = {
  title: 'Cerberus "Lady" H1',
  "static-abilities": [muPlus(1)],
};

// Cerberus "Rex" H2
export const cerberusRex: CardDef = {
  title: 'Cerberus "Rex" H2',
  "static-abilities": [muPlus(1)],
};

// Cezve
export const cezve: CardDef = {
  title: "Cezve",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "place 1 power counter on Cezve",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        addCounter(state, side, card, "power", 1);
      }),
    },
  ],
  events: [
    {
      event: "run-starts",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return getCounters(card, "power") > 0;
      }),
      msg: "give Cezve +2 [Strength] until the end of the run",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreIce.pump(card, 2, ":end-of-run");
      }),
    },
  ],
};

// Chakana
export const chakana: CardDef = {
  title: "Chakana",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1), toC(":net", 1)],
      msg: "search your stack for a program and move it to the top of the stack",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const stackCards = runnerStack(state).filter((c: Card) => isProgram(c));
        if (stackCards.length > 0) {
          corePrompts.showChooseCardsPrompt?.(
            state,
            side,
            "Choose a program",
            stackCards,
            ":move",
            {
              min: 1,
              max: 1,
              faceup: true,
              onChange: (chosen: Card) => {
                moveCard(state, side, chosen, ":stack", { position: "top" });
              },
            },
          );
        }
      }),
    },
  ],
};

// Chameleon
export const chameleon: CardDef = {
  title: "Chameleon",
  ...autoIcebreaker({
    "on-install": {
      prompt: "Choose one",
      choices: {
        text: {
          Barrier:
            "Gain the ability: [Click][Click]: Prevent barrier subroutines from ending the run this encounter.",
          "Code Gate":
            "Gain the ability: [Click][Click]: Prevent code gate subroutines from ending the run this encounter.",
          Sentry:
            "Gain the ability: [Click][Click]: Prevent sentry subroutines from ending the run this encounter.",
        },
      },
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target: any = (targets as any[])?.[0];
        return ((): string => {
          const target: any = (targets as any[])?.[0];
          return `gain the ability: [Click][Click]: prevent ${target} subroutines from ending the run this encounter`;
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
        (card as any).chosenType = target;
      }),
    },
    abilities: [
      {
        action: true,
        cost: [toC("click", 2)],
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ice = currentIce(state);
          return ice && getIceType(ice) === (card as any).chosenType;
        }),
        msg: "prevent subroutines from ending the run this encounter",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ice = currentIce(state);
          if (ice) {
            coreIce.dontResolveAllSubroutines(ice);
          }
        }),
      },
    ],
  }),
};

// Chisel
export const chisel: CardDef = {
  title: "Chisel",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "search your stack for a program and install it for free",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const stackCards = runnerStack(state).filter((c: Card) => isProgram(c));
        if (stackCards.length > 0) {
          corePrompts.showChooseCardsPrompt?.(
            state,
            side,
            "Choose a program",
            stackCards,
            ":install",
            {
              min: 1,
              max: 1,
              faceup: true,
              onChange: (chosen: Card) => {
                coreInstalling.runnerInstall(state, side, eid, chosen, {
                  cost: 0,
                  muCost: 0,
                });
              },
            },
          );
        }
      }),
    },
  ],
};

// Chromatophores
export const chromatophores: CardDef = {
  title: "Chromatophores",
  "static-abilities": [muPlus(1)],
};

// Cat's Cradle
export const catsCradle: CardDef = {
  title: "Cat's Cradle",
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 2, "Sentry"),
      {
        action: true,
        cost: [toC("click", 1)],
        msg: "give Cat's Cradle +2 [Strength] until the end of the run",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          coreIce.pump(card, 2, ":end-of-run");
        }),
      },
    ],
  }),
};

// Ceres
export const ceres: CardDef = {
  title: "Ceres",
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 1, "Barrier"),
      {
        action: true,
        cost: [toC("click", 1)],
        msg: "place 1 power counter on Ceres",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          addCounter(state, side, card, "power", 1);
        }),
      },
    ],
    "static-abilities": [
      {
        type: ":strength-bonus",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return getCounters(card, "power");
        }),
      },
    ],
  }),
};

// Cerulean
export const cerulean: CardDef = {
  title: "Cerulean",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "move Cerulean to the top of the stack",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        moveCard(state, side, card, ":stack", { position: "top" });
      }),
    },
  ],
};

// Chaingun
export const chaingun: CardDef = {
  title: "Chaingun",
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 2, "Sentry"),
      {
        action: true,
        cost: [toC("click", 1), toC(":net", 1)],
        msg: "give Chaingun +1 [Strength] until the end of the run",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          coreIce.pump(card, 1, ":end-of-run");
        }),
      },
    ],
  }),
};

// Chaos
export const chaos: CardDef = {
  title: "Chaos",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1), toC(":net", 1)],
      msg: "move the top 3 cards of the stack to the bottom in any order",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const stackCards = runnerStack(state).slice(-3).reverse();
        if (stackCards.length > 0) {
          corePrompts.showReorderCardsPrompt?.(
            state,
            side,
            "Rearrange the cards",
            stackCards,
            {
              onChange: (ordered: Card[]) => {
                ordered.forEach((c: Card) => {
                  moveCard(state, side, c, ":stack", { position: "bottom" });
                });
              },
            },
          );
        }
      }),
    },
  ],
};

// Chimeric
export const chimeric: CardDef = {
  title: "Chimeric",
  "static-abilities": [muPlus(1)],
};

// Cicada 3301
export const cicada3301: CardDef = {
  title: "Cicada 3301",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "trash Cicada 3301 to draw 4 cards",
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
          [{ asyncResult: "result" }, trash(state, side, eid, card)],
          [],
        );
        drawCards(state, side, eid, 4);
      }),
    },
  ],
};

// Cipher
export const cipher: CardDef = {
  title: "Cipher",
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 1, "Code Gate"),
      {
        action: true,
        cost: [toC("click", 1)],
        msg: "place 1 power counter on Cipher",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          addCounter(state, side, card, "power", 1);
        }),
      },
    ],
  }),
};

// Circlet
export const circlet: CardDef = {
  title: "Circlet",
  "static-abilities": [muPlus(1)],
};

// Cirrus
export const cirrus: CardDef = {
  title: "Cirrus",
  ...autoIcebreaker({
    abilities: [breakSub(2, 1, "Barrier")],
  }),
};

// City of Ashes
export const cityOfAshes: CardDef = {
  title: "City of Ashes",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "trash City of Ashes to reveal the top card of the stack and put it into your hand or used pile",
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
          [{ asyncResult: "result" }, trash(state, side, eid, card)],
          [],
        );
        const topCard = runnerStack(state).slice(-1)[0];
        if (topCard) {
          corePrompts.showYesNoPrompt?.(
            state,
            side,
            `Put ${topCard.title} into your hand?`,
            {
              onYes: () => {
                moveCard(state, side, topCard, ":hand");
              },
              onNo: () => {
                moveCard(state, side, topCard, ":used");
              },
            },
          );
        }
      }),
    },
  ],
};

// Clear Skies
export const clearSkies: CardDef = {
  title: "Clear Skies",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "look at the top card of the stack and put it into your hand or leave it on top of the stack",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const topCard = runnerStack(state).slice(-1)[0];
        if (topCard) {
          corePrompts.showYesNoPrompt?.(
            state,
            side,
            `Take ${topCard.title} into your hand?`,
            {
              onYes: () => {
                moveCard(state, side, topCard, ":hand");
              },
              onNo: () => {
                /* leave on stack */
              },
            },
          );
        }
      }),
    },
  ],
};

// Clover
export const clover: CardDef = {
  title: "Clover",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "look at the top 2 cards of the stack. Put one into your hand and the other into your used pile",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const stackCards = runnerStack(state).slice(-2).reverse();
        if (stackCards.length >= 2) {
          corePrompts.showChooseCardsPrompt?.(
            state,
            side,
            "Choose a card to take",
            stackCards,
            ":hand",
            {
              min: 1,
              max: 1,
              faceup: true,
              onChange: (chosen: Card) => {
                moveCard(state, side, chosen, ":hand");
                const other = stackCards.find((c: Card) => c !== chosen);
                if (other) {
                  moveCard(state, side, other, ":used");
                }
              },
            },
          );
        }
      }),
    },
  ],
};

// Cockpit
export const cockpit: CardDef = {
  title: "Cockpit",
  "static-abilities": [muPlus(1)],
};

// Cogitator
export const cogitator: CardDef = {
  title: "Cogitator",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "search your stack for a program and move it to the top of the stack",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const stackCards = runnerStack(state).filter((c: Card) => isProgram(c));
        if (stackCards.length > 0) {
          corePrompts.showChooseCardsPrompt?.(
            state,
            side,
            "Choose a program",
            stackCards,
            ":move",
            {
              min: 1,
              max: 1,
              faceup: true,
              onChange: (chosen: Card) => {
                moveCard(state, side, chosen, ":stack", { position: "top" });
              },
            },
          );
        }
      }),
    },
  ],
};

// Comet
export const comet: CardDef = {
  title: "Comet",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "trash Comet to gain 2 [Credits]",
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
          [{ asyncResult: "result" }, trash(state, side, eid, card)],
          [],
        );
        gainCredits(state, side, 2);
      }),
    },
  ],
};

// Companion
export const companion: CardDef = {
  title: "Companion",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "draw 1 card",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        drawCards(state, side, eid, 1);
      }),
    },
  ],
};

// Conduit
export const conduit: CardDef = {
  title: "Conduit",
  "static-abilities": [muPlus(1)],
};

// Core
export const core: CardDef = {
  title: "Core",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "search your stack for a program and move it to the top of the stack",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const stackCards = runnerStack(state).filter((c: Card) => isProgram(c));
        if (stackCards.length > 0) {
          corePrompts.showChooseCardsPrompt?.(
            state,
            side,
            "Choose a program",
            stackCards,
            ":move",
            {
              min: 1,
              max: 1,
              faceup: true,
              onChange: (chosen: Card) => {
                moveCard(state, side, chosen, ":stack", { position: "top" });
              },
            },
          );
        }
      }),
    },
  ],
};

// Core Memory
export const coreMemoryCard: CardDef = {
  title: "Core Memory",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "search your stack for a program and move it to the top of the stack",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const stackCards = runnerStack(state).filter((c: Card) => isProgram(c));
        if (stackCards.length > 0) {
          corePrompts.showChooseCardsPrompt?.(
            state,
            side,
            "Choose a program",
            stackCards,
            ":move",
            {
              min: 1,
              max: 1,
              faceup: true,
              onChange: (chosen: Card) => {
                moveCard(state, side, chosen, ":stack", { position: "top" });
              },
            },
          );
        }
      }),
    },
  ],
};

// Corn
export const corn: CardDef = {
  title: "Corn",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "trash Corn to gain 3 [Credits]",
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
          [{ asyncResult: "result" }, trash(state, side, eid, card)],
          [],
        );
        gainCredits(state, side, 3);
      }),
    },
  ],
};

// Coronet
export const coronet: CardDef = {
  title: "Coronet",
  "static-abilities": [muPlus(1)],
};

// Countermeasure
export const countermeasure: CardDef = {
  title: "Countermeasure",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1), toC(":net", 1)],
      msg: "move Countermeasure to the top of the stack",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        moveCard(state, side, card, ":stack", { position: "top" });
      }),
    },
  ],
};

// Cortex
export const cortex: CardDef = {
  title: "Cortex",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "draw 1 card",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        drawCards(state, side, eid, 1);
      }),
    },
  ],
};

// Cortez Chip
export const cortezChip: CardDef = {
  title: "Cortez Chip",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      msg: "deal 1 [Brain] damage",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        damage(state, side, ":brain", 1);
      }),
    },
  ],
};
