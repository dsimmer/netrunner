import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreEid from "../core/eid";
import * as coreEngine from "../core/engine";
import * as coreExpose from "../core/expose";
import * as coreGaining from "../core/gaining";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreMark from "../core/mark";
import * as coreMemory from "../core/memory";
import * as coreMoving from "../core/moving";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreShuffling from "../core/shuffling";
import * as coreThreat from "../core/threat";
import * as coreVirus from "../core/virus";
import { effect, msg, req, continue_ability } from "../macros";
import {
  addCounter,
  autoIcebreaker,
  breakAndEnter,
  breakSub,
  cloudIcebreaker,
  context,
  corpDeck,
  currentIce,
  devaSwapBreaker,
  getCounters,
  hasSubtype,
  returnAndDerez,
  runnerGrip,
  runnerStack,
  strengthPump,
  targetServerFromContext,
  toC,
  toCost,
  virusBreaker,
} from "./programs_3_helpers";

export const saci: CardDef = {
  title: "Saci",
  events: [
    {
      event: "rez",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return (context(targets).card as Card | undefined)?.cid === card.host?.cid;
      }),
      msg: "gain 3 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        _side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreGaining.gainCredits(state, "runner", eid, 3);
      }),
    },
    {
      event: "derez",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const cards = context(targets).cards;
        return Array.isArray(cards) && cards.some((target) => (target as Card).cid === card.host?.cid);
      }),
      msg: "gain 3 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        _side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreGaining.gainCredits(state, "runner", eid, 3);
      }),
    },
  ],
};
export const sadyojata: CardDef = devaSwapBreaker("Sadyojata", (state: State, card: Card) => {
  const ice = currentIce(state);
  return !!ice && (ice.subtypes ?? []).length >= 3 && coreIce.getStrength(ice) <= coreIce.getStrength(card);
});
export const sage: CardDef = {
  title: "Sage",
  abilities: [
    breakSub(2, (state: State): number => (hasSubtype(currentIce(state), "Barrier") ? 1 : 1), ["Barrier", "Code Gate"], {
      label: "break 1 Barrier subroutine or 1 Code Gate subroutine",
    }),
  ],
  "static-abilities": [
    coreIce.breakerStrengthBonus(
      req(function* (state: State): Generator<unknown, number, unknown> {
        return coreMemory.availableMu(state);
      }),
      0,
    ),
  ],
};

export const sahasrara: CardDef = {
  title: "Sahasrara",
  recurring: 2,
  interactions: {
    "pay-credits": {
      req: req(function* (
        _state: State,
        _side: Side,
        eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return eid.sourceType === "runner-install" && coreCard.program(targets[0] as Card | null);
      }),
      type: "recurring",
    },
  },
};

export const saker: CardDef = returnAndDerez(
  "Saker",
  "Barrier",
  breakSub(1, 1, "Barrier"),
  strengthPump(2, 2),
);
export const sangKancil: CardDef = {
  title: "Sang Kancil",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Code Gate"),
      strengthPump(3, 2, "end-of-encounter", {
        costBonus: req(function* (state: State): Generator<unknown, Record<string, unknown>[] | undefined, unknown> {
          const playArea = (state.runner?.playArea ?? []) as Card[];
          return playArea.some((card) => coreCard.event(card) && coreCard.hasSubtype(card, "Run") !== undefined)
            ? [toCost("credit", -2)]
            : undefined;
        }),
      }),
    ],
  }),
};
export const savant: CardDef = {
  title: "Savant",
  abilities: [
    breakSub(2, (state: State): number => (hasSubtype(currentIce(state), "Code Gate") ? 2 : 1), ["Code Gate", "Sentry"], {
      label: "break 2 Code Gate subroutines or 1 Sentry subroutine",
    }),
  ],
  "static-abilities": [
    coreIce.breakerStrengthBonus(
      req(function* (state: State): Generator<unknown, number, unknown> {
        return coreMemory.availableMu(state);
      }),
      0,
    ),
  ],
};
export const savoirFaire: CardDef = {
  title: "Savoir-faire",
  abilities: [
    {
      cost: [toC("credit", 2)],
      label: "Install a program",
      once: "per-turn",
      "change-in-game-state": {
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return runnerGrip(state).length > 0;
        }),
      },
      prompt: "Choose a program to install",
      choices: {
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          _card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          const target = targets[0] as Card | null;
          return coreCard.program(target) && coreCard.inHand(target);
        }),
      },
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const target = targets[0] as Card | undefined;
        if (target) coreInstalling.runnerInstall(state, side, eid, target, { msgKeys: { installSource: card, displayOrigin: true, includeCostFromEid: eid } });
      }),
    },
  ],
};

export const scheherazade: CardDef = {
  title: "Scheherazade",
  "static-abilities": [
    {
      type: ":can-host",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return coreCard.program(targets[0] as Card | null);
      }),
    },
  ],
  events: [
    {
      event: "runner-install",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const installed = context(targets).card as Card | undefined;
        return installed?.host?.cid === card.cid;
      }),
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreGaining.gainCredits(state, side, eid, 1);
      }),
    },
  ],
};
export const selfModifyingCode: CardDef = {
  title: "Self-modifying Code",
  abilities: [
    {
      label: "Install a program from the stack",
      cost: [toC("trash-can", 1), toC("credit", 2)],
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        yield continue_ability(
          state,
          side,
          {
            prompt: "Choose a program to install",
            choices: req(function* (innerState: State): Generator<unknown, (Card | string)[], unknown> {
              return [
                ...runnerStack(innerState)
                  .filter(coreCard.program)
                  .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "")),
                "Done",
              ];
            }),
            async: true,
            "waiting-prompt": true,
            effect: effect(function* (
              innerState: State,
              innerSide: Side,
              innerEid: EID,
              _innerCard: Card,
              targets: unknown[],
            ): Generator<unknown, void, unknown> {
              const target = targets[0];
              coreEngine.triggerEvent(innerState, innerSide, "searched-stack");
              coreShuffling.shuffle(innerState, innerSide, "deck");
              if (typeof target === "string") {
                coreSay.systemMsg(innerState, innerSide, "shuffles the Stack");
                coreEid.effectCompleted(innerState, innerSide, innerEid);
              } else {
                coreInstalling.runnerInstall(innerState, innerSide, innerEid, target as Card, { msgKeys: { installSource: card, displayOrigin: true, includeCostFromEid: eid } });
              }
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};
export const sharpshooter: CardDef = {
  title: "Sharpshooter",
  ...autoIcebreaker({
    abilities: [breakSub([toC("trash-can", 1)], 0, "Destroyer"), strengthPump(1, 2)],
  }),
};

export const shibboleth: CardDef = {
  title: "Shibboleth",
  ...autoIcebreaker({
    "x-fn": req(function* (state: State): Generator<unknown, number, unknown> {
      return coreThreat.threatLevel(4, state) ? -2 : 0;
    }),
    abilities: [breakSub(1, 1, "Code Gate"), strengthPump(2, 2)],
    "static-abilities": [
      coreIce.breakerStrengthBonus(
        req(function* (state: State): Generator<unknown, number, unknown> {
          return coreThreat.threatLevel(4, state) ? -2 : 0;
        }),
        0,
      ),
    ],
  }),
};

export const shiv: CardDef = breakAndEnter("Shiv", "Sentry");
export const sipa: CardDef = {
  title: "Sipa",
  events: [
    {
      event: "pass-ice",
      req: req(function* (
        state: State,
        side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const ctx = context(targets);
        const valid = ctx.allSubsBroken === true && ctx.outermost === true && ctx.ice !== undefined;
        return valid && coreEngine.firstEvent(state, side, "pass-ice", (eventTargets: unknown[]) => context(eventTargets).ice !== undefined);
      }),
      interactive: req(function* (): Generator<unknown, boolean, unknown> {
        return true;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const ice = context(targets).ice as Card | undefined;
        if (!ice) return;
        yield continue_ability(
          state,
          side,
          {
            prompt: `Swap ${ice.title} with another ice?`,
            choices: { card: (target: Card) => coreCard.installed(target) && coreCard.ice(target) && target.cid !== ice.cid },
            msg: msg("swap the positions of ", () => ice.title, " and ", (_s: State, _sd: Side, _e: EID, _c: Card, swapTargets: unknown[]) => (swapTargets[0] as Card | undefined)?.title ?? "ice"),
            effect: effect(function* (innerState: State, innerSide: Side, _innerEid: EID, _innerCard: Card, swapTargets: unknown[]): Generator<unknown, void, unknown> {
              const target = swapTargets[0] as Card | undefined;
              if (target) coreMoving.swapIce(innerState, innerSide, ice, target);
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};
export const slapVandal: CardDef = {
  title: "Slap Vandal",
  abilities: [
    breakSub(1, 1, "All", {
      req: req(function* (
        state: State,
        _side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, boolean, unknown> {
        return currentIce(state)?.cid === card.host?.cid;
      }),
      repeatable: false,
    }),
  ],
};
export const sneakdoorBeta: CardDef = {
  title: "Sneakdoor Beta",
  abilities: [
    coreDefHelpers.runServerAbility("archives", {
      action: true,
      cost: [toC("click", 1)],
      events: [
        {
          event: "pre-successful-run",
          duration: "end-of-run",
          "unregister-once-resolved": true,
          interactive: req(function* (): Generator<unknown, boolean, unknown> {
            return true;
          }),
          msg: "change the attacked server to HQ",
          req: req(function* (state: State): Generator<unknown, boolean, unknown> {
            return state.run?.server?.[0] === "archives";
          }),
          effect: effect(function* (state: State): Generator<unknown, void, unknown> {
            if (state.run) state.run.server = ["hq"];
          }),
        },
      ],
    }),
  ],
};
export const sneakdoorPrimeA: CardDef = {
  title: "Sneakdoor Prime A",
  abilities: [
    {
      action: true,
      cost: [toC("click", 2)],
      prompt: "Choose a server",
      choices: req(function* (state: State): Generator<unknown, string[], unknown> {
        return Object.keys(state.corp.servers.remote);
      }),
      msg: "make a run on a remote server",
      "makes-run": true,
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const initialServer = String(targets[0] ?? "");
        coreEngine.registerEvents(state, side, card, [
          {
            event: "pre-successful-run",
            duration: "end-of-run",
            "unregister-once-resolved": true,
            req: req(function* (innerState: State): Generator<unknown, boolean, unknown> {
              return innerState.run?.server?.[0] === initialServer;
            }),
            prompt: "Choose a server",
            choices: ["Archives", "R&D", "HQ"],
            msg: msg("change the attacked server to target"),
            effect: effect(function* (innerState: State, _innerSide: Side, _innerEid: EID, _innerCard: Card, targetChoices: unknown[]): Generator<unknown, void, unknown> {
              const chosen = String(targetChoices[0] ?? "").toLowerCase().replace("r&d", "rd");
              if (innerState.run) innerState.run.server = [chosen];
            }),
          },
        ]);
        coreRuns.makeRun(state, side, eid, initialServer, card);
      }),
    },
  ],
};

export const sneakdoorPrimeB: CardDef = {
  title: "Sneakdoor Prime B",
  abilities: [
    {
      action: true,
      cost: [toC("click", 2)],
      prompt: "Choose a server",
      choices: ["Archives", "R&D", "HQ"],
      msg: "make a run on central server",
      "makes-run": true,
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const initialServer = String(targets[0] ?? "").toLowerCase().replace("r&d", "rd");
        coreEngine.registerEvents(state, side, card, [
          {
            event: "pre-successful-run",
            duration: "end-of-run",
            "unregister-once-resolved": true,
            req: req(function* (innerState: State): Generator<unknown, boolean, unknown> {
              return innerState.run?.server?.[0] === initialServer;
            }),
            prompt: "Choose a server",
            choices: req(function* (innerState: State): Generator<unknown, string[], unknown> {
              return Object.keys(innerState.corp.servers.remote);
            }),
            msg: msg("change the attacked server to target"),
            effect: effect(function* (innerState: State, _innerSide: Side, _innerEid: EID, _innerCard: Card, targetChoices: unknown[]): Generator<unknown, void, unknown> {
              if (innerState.run) innerState.run.server = [String(targetChoices[0] ?? "")];
            }),
          },
        ]);
        coreRuns.makeRun(state, side, eid, initialServer, card);
      }),
    },
  ],
};
export const snitch: CardDef = {
  title: "Snitch",
  events: [
    {
      event: "approach-ice",
      optional: {
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          _card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return !coreCard.rezzed(context(targets).ice as Card | null);
        }),
        prompt: "Expose approached piece of ice?",
        "yes-ability": {
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: unknown[],
          ): Generator<unknown, void, unknown> {
            const ice = context(targets).ice as Card | undefined;
            if (ice) coreExpose.expose(state, side, eid, [ice]);
            yield continue_ability(state, side, coreDefHelpers.offerJackOut(), card, null);
          }),
        },
      },
    },
  ],
};
export const snowball: CardDef = {
  title: "Snowball",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Barrier", {
        additionalAbility: {
          msg: "gain +1 strength for the remainder of the run",
          effect: effect(function* (
            state: State,
            side: Side,
            _eid: EID,
            card: Card,
          ): Generator<unknown, void, unknown> {
            coreIce.pump(state, side, card, 1, "end-of-run");
          }),
        },
      }),
      strengthPump(1, 1),
    ],
  }),
};

export const spike: CardDef = breakAndEnter("Spike", "Barrier");
export const stargate: CardDef = {
  title: "Stargate",
  abilities: [
    coreDefHelpers.runServerAbility("rd", {
      action: true,
      cost: [toC("click", 1)],
      events: [
        coreRuns.successfulRunReplaceBreach({
          "target-server": "rd",
          mandatory: true,
          duration: "end-of-run",
          ability: {
            async: true,
            msg: "reveal the top 3 cards from R&D",
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
            ): Generator<unknown, void, unknown> {
              const topCards = corpDeck(state).slice(0, 3);
              coreRevealing.reveal(state, side, eid, topCards);
              yield continue_ability(
                state,
                side,
                {
                  async: true,
                  prompt: "Choose a card to trash",
                  "not-distinct": true,
                  choices: req(function* (innerState: State): Generator<unknown, Card[], unknown> {
                    return corpDeck(innerState).slice(0, 3);
                  }),
                  msg: msg("trash ", (_s: State, _sd: Side, _e: EID, _c: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "a card"),
                  effect: effect(function* (innerState: State, innerSide: Side, innerEid: EID, _innerCard: Card, targets: unknown[]): Generator<unknown, void, unknown> {
                    const target = targets[0] as Card | undefined;
                    if (target) coreMoving.trash(innerState, innerSide, innerEid, { ...target, seen: true }, { causeCard: card });
                  }),
                },
                card,
                null,
              );
            }),
          },
        }),
      ],
    }),
  ],
};
export const stowaway: CardDef = {
  title: "Stowaway",
  events: [
    {
      event: "successful-run",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const hostServer = card.host ? coreCard.getZone(card.host)[1] : undefined;
        return hostServer === targetServerFromContext(targets);
      }),
      async: true,
      msg: "gain 2 [Credits]",
      automatic: "gain-credits",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreGaining.gainCredits(state, side, eid, 2);
      }),
    },
  ],
};
export const studyGuide: CardDef = {
  title: "Study Guide",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Code Gate"),
      {
        cost: [toC("credit", 2)],
        msg: "place 1 power counter",
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<unknown, void, unknown> {
          addCounter(state, side, eid, card, "power", 1);
        }),
      },
    ],
    "static-abilities": [
      coreIce.breakerStrengthBonus(
        req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, number, unknown> {
          return getCounters(card, "power");
        }),
        0,
      ),
    ],
  }),
};

export const sunya: CardDef = {
  title: "Sūnya",
  ...autoIcebreaker({
    abilities: [breakSub(2, 1, "Sentry")],
    "static-abilities": [
      coreIce.breakerStrengthBonus(
        req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, number, unknown> {
          return getCounters(card, "power");
        }),
        0,
      ),
    ],
    events: [
      {
        event: "end-of-encounter",
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return coreIce.allSubsBrokenByCard(context(targets).ice as Card, card);
        }),
        msg: "place 1 power counter on itself",
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<unknown, void, unknown> {
          addCounter(state, side, eid, card, "power", 1);
        }),
      },
    ],
  }),
};
export const surfer: CardDef = {
  title: "Surfer",
  abilities: [
    {
      cost: [toC("credit", 2)],
      msg: "swap a piece of Barrier ice",
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        const ice = currentIce(state);
        return !!coreRuns.getCurrentEncounter(state) && !!ice && coreCard.rezzed(ice) && coreCard.hasSubtype(ice, "Barrier") !== undefined;
      }),
      label: "Swap the piece of Barrier ice currently being encountered with a piece of ice directly before or after it",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        const ice = currentIce(state);
        if (!ice) return;
        yield continue_ability(
          state,
          side,
          {
            prompt: `Choose a piece of ice before or after ${ice.title}`,
            choices: {
              card: (target: Card) =>
                coreCard.ice(target) &&
                coreCard.getZone(target).join("/") === coreCard.getZone(ice).join("/") &&
                Math.abs((target.index ?? 0) - (ice.index ?? 0)) === 1,
            },
            msg: msg("swap ", () => ice.title, " and ", (_s: State, _sd: Side, _e: EID, _c: Card, swapTargets: unknown[]) => (swapTargets[0] as Card | undefined)?.title ?? "ice"),
            effect: effect(function* (innerState: State, innerSide: Side, _innerEid: EID, _innerCard: Card, swapTargets: unknown[]): Generator<unknown, void, unknown> {
              const target = swapTargets[0] as Card | undefined;
              if (target) coreMoving.swapIce(innerState, innerSide, ice, target);
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};
export const surveillanceNetworkKey: CardDef = {
  title: "Surveillance Network Key",
  implementation: "Only implemented for click to draw",
  events: [
    {
      event: "corp-click-draw",
      msg: msg("reveal that they drew ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (context(targets).card as Card | undefined)?.title ?? "a card"),
    },
  ],
};
export const surveillanceNetworkKeyTwo: CardDef = {
  title: "Surveillance Network Key 2",
  implementation: "Only implemented for click to draw",
  abilities: [
    {
      label: "Access an additional card in R&D",
      cost: [toC("credit", 2)],
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        return !!state.run;
      }),
      once: "per-turn",
      "keep-menu-open": ":while-2-power-tokens-left",
      msg: "access 1 additional card from R&D for the remainder of the run",
      effect: effect(function* (state: State): Generator<unknown, void, unknown> {
        coreAccess.accessBonus(state, "runner", 1, "rd");
      }),
    },
    {
      label: "Access an additional card in HQ",
      cost: [toC("credit", 2)],
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        return !!state.run;
      }),
      once: "per-turn",
      "keep-menu-open": ":while-2-power-tokens-left",
      msg: "access 1 additional card from HQ for the remainder of the run",
      effect: effect(function* (state: State): Generator<unknown, void, unknown> {
        coreAccess.accessBonus(state, "runner", 1, "hq");
      }),
    },
  ],
  events: [
    {
      event: "corp-click-draw",
      msg: msg("reveal that they drew ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (context(targets).card as Card | undefined)?.title ?? "a card"),
    },
  ],
};
export const switchblade: CardDef = {
  title: "Switchblade",
  ...autoIcebreaker({
    abilities: [
      breakSub([toC("credit", 1, { stealth: 1 })], 0, "Sentry"),
      strengthPump([toCost("credit", 1, { stealth: 1 })], 7, "end-of-encounter"),
    ],
  }),
};
export const takobi: CardDef = {
  title: "Takobi",
  special: { "auto-place-counter": "always" },
  events: [
    {
      event: "subroutines-broken",
      optional: {
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          _card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return context(targets).allSubsBroken === true || context(targets)["all-subs-broken"] === true;
        }),
        prompt: msg("Place 1 power counter on ", (_state: State, _side: Side, _eid: EID, card: Card) => card.title, "?"),
        autoresolve: coreDefHelpers.getAutoresolve("auto-place-counter"),
        "yes-ability": {
          msg: "place 1 power counter on itself",
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
          ): Generator<unknown, void, unknown> {
            addCounter(state, side, eid, card, "power", 1);
          }),
        },
      },
    },
  ],
  abilities: [
    {
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        return !!coreRuns.getCurrentEncounter(state);
      }),
      cost: [toC("power", 2)],
      label: "Give non-AI icebreaker +3 strength",
      prompt: "Choose an installed non-AI icebreaker",
      choices: {
        card: (target: Card) =>
          coreCard.hasSubtype(target, "Icebreaker") !== undefined &&
          coreCard.hasSubtype(target, "AI") === undefined &&
          coreCard.installed(target),
      },
      "keep-menu-open": ":while-power-tokens-left",
      msg: msg("give +3 strength to ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "an icebreaker"),
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const target = targets[0] as Card | undefined;
        if (target) coreIce.pump(state, side, target, 3);
      }),
    },
    coreDefHelpers.setAutoresolve("auto-place-counter", "Takobi placing power counters on itself"),
  ],
};
export const tapwrm: CardDef = {
  title: "Tapwrm",
  req: req(function* (state: State): Generator<unknown, boolean, unknown> {
    const reg = (state.runner as unknown as Record<string, unknown>).successfulRun;
    return Array.isArray(reg) && reg.some((server) => server === "hq" || server === "rd" || server === "archives");
  }),
  flags: { "drip-economy": true },
  abilities: [
    {
      label: "Gain [Credits] (start of turn)",
      automatic: "gain-credits",
      msg: msg("gain ", (state: State) => Math.floor((state.corp?.credit ?? 0) / 5), " [Credits]"),
      once: "per-turn",
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        return (state as unknown as Record<string, unknown>).runnerPhase12 === true;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreGaining.gainCredits(state, side, eid, Math.floor((state.corp?.credit ?? 0) / 5));
      }),
    },
  ],
  events: [
    {
      event: "runner-turn-begins",
      automatic: "gain-credits",
      msg: msg("gain ", (state: State) => Math.floor((state.corp?.credit ?? 0) / 5), " [Credits]"),
      once: "per-turn",
      req: req(function* (): Generator<unknown, boolean, unknown> {
        return true;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreGaining.gainCredits(state, side, eid, Math.floor((state.corp?.credit ?? 0) / 5));
      }),
    },
    coreDefHelpers.trashOnPurge,
  ],
};
export const torch: CardDef = {
  title: "Torch",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Code Gate"), strengthPump(1, 1)],
  }),
};
export const tracker: CardDef = { title: "Tracker" };
export const tranquilizer: CardDef = {
  title: "Tranquilizer",
  implementation: "[Erratum] Program: Virus - Trojan",
  "on-install": {
    interactive: req(function* (): Generator<unknown, boolean, unknown> {
      return true;
    }),
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<unknown, void, unknown> {
      addCounter(state, side, eid, card, "virus", 1);
      if (card.host && coreCard.rezzed(card.host) && coreVirus.getVirusCounters(state, card) >= 3) {
        coreRezzing.derez(state, side, eid, card.host);
      }
    }),
  },
  events: [
    {
      event: "runner-turn-begins",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        addCounter(state, side, eid, card, "virus", 1);
        if (card.host && coreCard.rezzed(card.host) && coreVirus.getVirusCounters(state, card) >= 3) {
          coreRezzing.derez(state, side, eid, card.host);
        }
      }),
    },
  ],
};
export const tremolo: CardDef = {
  title: "Tremolo",
  ...autoIcebreaker({
    abilities: [
      breakSub(3, 2, "Barrier", {
        label: "Break up to 2 Barrier subroutine",
        breakCostBonus: req(function* (state: State): Generator<unknown, Record<string, unknown>[], unknown> {
          const cyberneticCount = coreBoard
            .allInstalledRunnerType(state, "hardware")
            .filter((card) => coreCard.hasSubtype(card, "Cybernetic") !== undefined).length;
          return [toCost("credit", Math.max(-3, -cyberneticCount))];
        }),
      }),
      strengthPump(2, 2),
    ],
  }),
};
export const trope: CardDef = {
  title: "Trope",
  events: [
    {
      event: "runner-turn-begins",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        addCounter(state, side, eid, card, "power", 1);
      }),
    },
  ],
  abilities: [
    {
      action: true,
      label: "shuffle cards from heap into stack",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        yield continue_ability(
          state,
          side,
          {
            cost: [toC("click", 1), toC("remove-from-game", 1)],
            label: "Reshuffle cards from heap into stack",
            "show-discard": true,
            choices: {
              max: getCounters(card, "power"),
              all: true,
              card: (target: Card) => coreCard.runner(target) && coreCard.inDiscard(target),
            },
            msg: "shuffle cards into the stack",
            effect: effect(function* (innerState: State, innerSide: Side, _innerEid: EID, _innerCard: Card, targets: unknown[]): Generator<unknown, void, unknown> {
              for (const target of targets) coreMoving.move(innerState, innerSide, target as Card, "deck");
              coreShuffling.shuffle(innerState, innerSide, "deck");
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};
export const trypano: CardDef = {
  title: "Trypano",
  implementation: "[Erratum] Program: Virus - Trojan",
  "on-install": {
    async: true,
    effect: effect(function* (state: State, side: Side, eid: EID, card: Card): Generator<unknown, void, unknown> {
      if (card.host && coreVirus.getVirusCounters(state, card) >= 5) coreMoving.trash(state, side, eid, card.host, { causeCard: card });
    }),
  },
  abilities: [coreDefHelpers.setAutoresolve("auto-place-counter", "Trypano placing virus counters on itself")],
  events: [
    {
      event: "runner-turn-begins",
      optional: {
        prompt: msg("Place 1 virus counter on ", (_state: State, _side: Side, _eid: EID, card: Card) => card.title, "?"),
        autoresolve: coreDefHelpers.getAutoresolve("auto-place-counter"),
        "yes-ability": {
          msg: "place 1 virus counter on itself",
          async: true,
          effect: effect(function* (state: State, side: Side, eid: EID, card: Card): Generator<unknown, void, unknown> {
            addCounter(state, side, eid, card, "virus", 1);
            if (card.host && coreVirus.getVirusCounters(state, card) >= 5) coreMoving.trash(state, side, eid, card.host, { causeCard: card });
          }),
        },
      },
    },
  ],
};
export const tunnelVision: CardDef = {
  title: "Tunnel Vision",
  ...autoIcebreaker({
    events: [coreMark.markChangedEvent, { ...coreMark.identifyMarkAbility, event: "runner-turn-begins" }],
    abilities: [
      breakSub(2, 2, "All", {
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return state.mark === state.run?.server?.[0];
        }),
      }),
      strengthPump(2, 2),
    ],
  }),
};
export const tycoon: CardDef = {
  title: "Tycoon",
  ...autoIcebreaker({
    abilities: [breakSub(1, 2, "Barrier"), strengthPump(2, 3)],
    events: [
      {
        event: "end-of-encounter",
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return coreIce.anySubsBrokenByCard(context(targets).ice as Card, card);
        }),
        msg: "give the Corp 2 [Credits]",
        async: true,
        effect: effect(function* (
          state: State,
          _side: Side,
          eid: EID,
        ): Generator<unknown, void, unknown> {
          coreGaining.gainCredits(state, "corp", eid, 2);
        }),
      },
    ],
  }),
};
export const umbrella: CardDef = { title: "Umbrella" };
export const unity: CardDef = {
  title: "Unity",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Code Gate"),
      strengthPump(1, 0, "end-of-encounter", {
        label: "Add 1 strength for each installed icebreaker",
        pumpBonus: req(function* (state: State): Generator<unknown, number, unknown> {
          return coreBoard
            .allActiveInstalled(state, "runner")
            .filter((card) => coreCard.program(card) && coreCard.hasSubtype(card, "Icebreaker") !== undefined).length;
        }),
      }),
    ],
  }),
};
export const upya: CardDef = {
  title: "Upya",
  special: { "auto-place-counters": "always" },
  events: [
    {
      event: "successful-run",
      optional: {
        player: "runner",
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          _card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return targetServerFromContext(targets) === "rd";
        }),
        "waiting-prompt": true,
        autoresolve: coreDefHelpers.getAutoresolve("auto-place-counters"),
        prompt: msg("Place 1 power counter on ", (_state: State, _side: Side, _eid: EID, card: Card) => card.title, "?"),
        "yes-ability": {
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
          ): Generator<unknown, void, unknown> {
            addCounter(state, side, eid, card, "power", 1);
          }),
        },
      },
    },
  ],
  abilities: [
    {
      action: true,
      cost: [toC("click", 1), toC("power", 3)],
      once: "per-turn",
      msg: "gain [Click][Click]",
      effect: effect(function* (state: State, side: Side): Generator<unknown, void, unknown> {
        coreGaining.gainClicks(state, side, 2);
      }),
    },
    coreDefHelpers.setAutoresolve("auto-place-counters", "Upya placing counters on itself"),
  ],
};
export const utae: CardDef = { title: "Utae" };
export const vamadeva: CardDef = devaSwapBreaker("Vamadeva", (state: State, card: Card) => {
  const ice = currentIce(state);
  return !!ice && (ice.subroutines ?? []).length === 1 && coreIce.getStrength(ice) <= coreIce.getStrength(card);
});
export const wari: CardDef = { title: "Wari" };
export const worldTree: CardDef = { title: "World Tree" };
export const wyrm: CardDef = {
  title: "Wyrm",
  ...autoIcebreaker({
    abilities: [
      breakSub(3, 1, "All", {
        label: "break 1 subroutine on a piece of ice with 0 or less strength",
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          const ice = currentIce(state);
          return !!ice && coreIce.getStrength(ice) <= 0;
        }),
      }),
      {
        cost: [toC("credit", 1)],
        label: "Give -1 strength to current piece of ice",
        req: req(function* (state: State, _side: Side, _eid: EID, card: Card): Generator<unknown, boolean, unknown> {
          const ice = currentIce(state);
          return !!ice && coreRuns.activeEncounter(state) && coreIce.getStrength(ice) <= coreIce.getStrength(card);
        }),
        msg: msg("give -1 strength to ", (state: State) => currentIce(state)?.title ?? "ice"),
        effect: effect(function* (state: State, side: Side): Generator<unknown, void, unknown> {
          const ice = currentIce(state);
          if (ice) coreIce.pumpIce(state, side, ice, -1);
        }),
      },
      strengthPump(1, 1),
    ],
  }),
};

export const yogZero: CardDef = {
  title: "Yog.0",
  ...autoIcebreaker({
    abilities: [breakSub(0, 1, "Code Gate")],
  }),
};

export const yusuf: CardDef = virusBreaker("Yusuf", "Barrier");

export const zU13KeyMaster: CardDef = {
  title: "ZU.13 Key Master",
  ...cloudIcebreaker(
    autoIcebreaker({
      abilities: [breakSub(1, 1, "Code Gate"), strengthPump(1, 1)],
    }),
  ),
};
