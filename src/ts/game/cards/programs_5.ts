import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreEffects from "../core/effects";
import * as coreEngine from "../core/engine";
import * as coreGaining from "../core/gaining";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreMoving from "../core/moving";
import * as corePrevention from "../core/prevention";
import * as coreRuns from "../core/runs";
import * as coreShuffling from "../core/shuffling";
import * as coreThreat from "../core/threat";
import * as coreVirus from "../core/virus";
import { effect, msg, req, continue_ability } from "../macros";
import {
  addCounter,
  autoIcebreaker,
  breakSub,
  context,
  corpHand,
  currentIce,
  getCounters,
  hasSubtype,
  isCentralServer,
  strengthPump,
  targetServerFromContext,
  toC,
  toCost,
  trashToBypass,
} from "./programs_3_helpers";

export const harbinger: CardDef = {
  title: "Harbinger",
  "on-trash": {
    req: req(function* (
      _state: State,
      _side: Side,
      _eid: EID,
      card: Card,
    ): Generator<unknown, boolean, unknown> {
      const zone = coreCard.getZone(card);
      return !zone.includes("facedown") && !zone.includes("hand");
    }),
    effect: effect(function* (state: State, side: Side, _eid: EID, card: Card): Generator<unknown, void, unknown> {
      coreMoving.flipFacedown(state, side, card);
    }),
  },
};
export const heliamphora: CardDef = {
  title: "Heliamphora",
  events: [
    {
      event: "breach-server",
      automatic: "pre-breach",
      async: true,
      interactive: req(function* (): Generator<unknown, boolean, unknown> { return true; }),
      req: req(function* (state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]): Generator<unknown, boolean, unknown> {
        return context(targets).server === "archives" && state.corp.discard.length > 0;
      }),
      effect: effect(function* (state: State, side: Side, _eid: EID, card: Card): Generator<unknown, void, unknown> {
        card.special = { ...(card.special ?? {}), hostAvailable: true };
        yield continue_ability(
          state,
          side,
          {
            optional: {
              prompt: "Host a card on this program instead of accessing it?",
              "yes-ability": {
                prompt: "Choose a card in Archives",
                choices: req(function* (innerState: State): Generator<unknown, Card[], unknown> { return innerState.corp.discard; }),
                msg: msg("host ", (_s: State, _sd: Side, _e: EID, _c: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "a card", " on itself instead of accessing it"),
                effect: effect(function* (innerState: State, innerSide: Side, _e: EID, innerCard: Card, targets: unknown[]): Generator<unknown, void, unknown> {
                  const target = targets[0] as Card | undefined;
                  innerCard.special = { ...(innerCard.special ?? {}), hostAvailable: false };
                  if (target) coreHosting.host(innerState, innerSide, innerCard, target);
                }),
              },
            },
          },
          card,
          null,
        );
      }),
    },
  ],
};
export const hantu: CardDef = {
  title: "Hantu",
  ...autoIcebreaker({
    data: { counter: { virus: 2 } },
    abilities: [breakSub(1, 1, "Sentry"), strengthPump([toCost("virus", 1), toCost("credit", 3)], 2)],
  }),
};
export const hemorrhage: CardDef = {
  title: "Hemorrhage",
  events: [
    {
      event: "successful-run",
      silent: true,
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        addCounter(state, side, eid, card, "virus", 1);
      }),
    },
  ],
  abilities: [
    {
      action: true,
      cost: [toC("click", 1), toC("virus", 2)],
      "keep-menu-open": ":while-2-virus-tokens-left",
      "change-in-game-state": {
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return corpHand(state).length > 0;
        }),
      },
      msg: "force the Corp to trash 1 card from HQ",
      async: true,
      effect: effect(function* (
        state: State,
        _side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        yield continue_ability(
          state,
          "corp",
          {
            "waiting-prompt": true,
            prompt: "Choose a card to trash",
            choices: {
              req: req(function* (
                _s: State,
                _sid: Side,
                _e: EID,
                _c: Card,
                targets: unknown[],
              ): Generator<unknown, boolean, unknown> {
                return coreCard.corp(targets[0] as Card | null);
              }),
            },
            async: true,
            effect: effect(function* (
              innerState: State,
              innerSide: Side,
              innerEid: EID,
              _innerCard: Card,
              targets: unknown[],
            ): Generator<unknown, void, unknown> {
              const target = targets[0] as Card | undefined;
              if (target) coreMoving.trash(innerState, innerSide, innerEid, target, { causeCard: card, cause: "forced-to-trash" });
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};

export const hivemind: CardDef = {
  title: "Hivemind",
  data: { counter: { virus: 1 } },
  abilities: [
    {
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, boolean, unknown> {
        return getCounters(card, "virus") > 0;
      }),
      label: "Move hosted virus counters",
      prompt: "Choose a Virus card to move hosted virus counters to",
      choices: {
        card: (target: Card) => coreCard.hasSubtype(target, "Virus") !== undefined,
        notSelf: true,
      },
      msg: msg("manually move a virus counter from itself to ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "a Virus card"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const target = targets[0] as Card | undefined;
        if (!target) return;
        addCounter(state, side, eid, target, "virus", 1);
        addCounter(state, side, eid, card, "virus", -1);
      }),
    },
  ],
};
export const houdini: CardDef = {
  title: "Houdini",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Code Gate"),
      strengthPump([toCost("credit", 2, { stealth: 1 })], 4, "end-of-run"),
    ],
  }),
};
export const hush: CardDef = {
  title: "Hush",
  implementation: "Experimentally implemented. If it doesn't work correctly, please file a bug report with the exact case and cards used, and we will investigate.",
  "static-abilities": [
    {
      type: ":disable-card",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return (targets[0] as Card | undefined)?.cid === card.host?.cid;
      }),
      value: true,
    },
  ],
  abilities: [
    {
      action: true,
      label: "Host on a piece of ice",
      prompt: "Choose a piece of ice",
      cost: [toC("click", 1)],
      choices: {
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          _card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          const target = targets[0] as Card | null;
          return coreCard.ice(target) && coreCard.installed(target);
        }),
      },
      msg: msg("host itself on ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "ice"),
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const target = targets[0] as Card | undefined;
        if (target) coreHosting.host(state, side, target, card);
        coreEffects.updateDisabledCards(state);
      }),
    },
  ],
};
export const hyperbaric: CardDef = {
  title: "Hyperbaric",
  ...autoIcebreaker({
    data: { counter: { power: 1 } },
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

export const hyperdriver: CardDef = {
  title: "Hyperdriver",
  flags: {
    "runner-phase-12": req(function* (): Generator<unknown, boolean, unknown> {
      return true;
    }),
  },
  abilities: [
    {
      label: "Remove Hyperdriver from the game to gain [Click] [Click] [Click]",
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        return (state as unknown as Record<string, unknown>).runnerPhase12 === true;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        coreMoving.move(state, side, card, "rfg");
        coreGaining.gainClicks(state, side, 3);
      }),
      msg: "gain [Click][Click][Click]",
    },
  ],
};
export const ika: CardDef = {
  title: "Ika",
  ...autoIcebreaker({
    implementation: "[Erratum] Program: Icebreaker - Killer - Trojan",
    abilities: [
      {
        label: "Host on a piece of ice",
        prompt: "Choose a piece of ice",
        cost: [toC("credit", 2)],
        choices: {
          req: req(function* (
            _state: State,
            _side: Side,
            _eid: EID,
            _card: Card,
            targets: unknown[],
          ): Generator<unknown, boolean, unknown> {
            const target = targets[0] as Card | null;
            return coreCard.ice(target) && coreCard.installed(target);
          }),
        },
        msg: msg("host itself on ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "ice"),
        effect: effect(function* (
          state: State,
          side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, void, unknown> {
          const target = targets[0] as Card | undefined;
          if (target) coreHosting.host(state, side, target, card);
        }),
      },
      breakSub(1, 2, "Sentry"),
      strengthPump(2, 3),
    ],
  }),
};
export const imp: CardDef = {
  title: "Imp",
  data: { counter: { virus: 2 } },
  interactions: {
    "access-ability": {
      label: "Trash card",
      trash: true,
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const target = targets[0] as Card | null;
        return !!target && !coreCard.inDiscard(target);
      }),
      cost: [toC("virus", 1)],
      msg: msg("trash ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "accessed card", " at no cost"),
      once: "per-turn",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const target = targets[0] as Card | undefined;
        if (target) coreMoving.trash(state, side, eid, { ...target, seen: true }, { accessed: true });
      }),
    },
  },
};

export const incubator: CardDef = {
  title: "Incubator",
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
      }),
    },
  ],
  abilities: [
    {
      action: true,
      cost: [toC("click", 1), toC("trash-can", 1)],
      label: "move hosted virus counters",
      msg: msg("move ", (_state: State, _side: Side, _eid: EID, card: Card) => getCounters(card, "virus"), " virus counter to ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "a Virus card"),
      choices: {
        card: (target: Card) => coreCard.installed(target) && coreCard.hasSubtype(target, "Virus") !== undefined,
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
        if (target) addCounter(state, side, eid, target, "virus", getCounters(card, "virus"));
      }),
    },
  ],
};
export const inti: CardDef = {
  title: "Inti",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Barrier"), strengthPump(2, 1, "end-of-run")],
  }),
};
export const inversificator: CardDef = {
  title: "Inversificator",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Code Gate"), strengthPump(1, 1)],
    events: [
      {
        event: "pass-ice",
        interactive: req(function* (): Generator<unknown, boolean, unknown> {
          return true;
        }),
        req: req(function* (
          state: State,
          side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return (
            coreIce.allSubsBrokenByCard(context(targets).ice as Card, card) &&
            coreEngine.firstEvent(state, side, "end-of-encounter", (eventTargets: unknown[]) =>
              coreIce.allSubsBrokenByCard(context(eventTargets).ice as Card, card),
            )
          );
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
              optional: {
                prompt: `Swap ${ice.title} with another ice?`,
                "yes-ability": {
                  prompt: "Choose another ice",
                  choices: { card: (target: Card) => coreCard.installed(target) && coreCard.ice(target) && target.cid !== ice.cid },
                  msg: msg("swap the positions of ", () => ice.title, " and ", (_s: State, _sd: Side, _e: EID, _c: Card, swapTargets: unknown[]) => (swapTargets[0] as Card | undefined)?.title ?? "ice"),
                  effect: effect(function* (innerState: State, innerSide: Side, _innerEid: EID, _innerCard: Card, swapTargets: unknown[]): Generator<unknown, void, unknown> {
                    const target = swapTargets[0] as Card | undefined;
                    if (target) coreMoving.swapIce(innerState, innerSide, ice, target);
                  }),
                },
              },
            },
            card,
            null,
          );
        }),
      },
    ],
  }),
};
export const ixodidae: CardDef = {
  title: "Ixodidae",
  events: [
    {
      event: "corp-credit-loss",
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        _side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreGaining.gainCredits(state, "runner", eid, 1);
      }),
    },
    coreDefHelpers.trashOnPurge,
  ],
};
export const k2CPTurbine: CardDef = {
  title: "K2CP Turbine",
  "static-abilities": [
    {
      type: ":breaker-strength",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const target = targets[0] as Card | null;
        return coreCard.hasSubtype(target, "Icebreaker") !== undefined && coreCard.hasSubtype(target, "AI") === undefined;
      }),
      value: 2,
    },
  ],
  "leave-play": effect(function* (state: State, side: Side): Generator<unknown, void, unknown> {
    coreIce.updateAllIcebreakers(state, side);
  }),
};
export const keyhole: CardDef = {
  title: "Keyhole",
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
            prompt: "Choose a card to trash",
            "not-distinct": true,
            msg: msg("trash ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "a card"),
            choices: req(function* (state: State): Generator<unknown, Card[], unknown> {
              return state.corp.deck.slice(0, 3);
            }),
            async: true,
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: unknown[],
            ): Generator<unknown, void, unknown> {
              const target = targets[0] as Card | undefined;
              coreShuffling.shuffle(state, "corp", "deck");
              if (target) coreMoving.trash(state, side, eid, { ...target, seen: true }, { causeCard: card });
            }),
          },
        }),
      ],
    }),
  ],
};
export const knight: CardDef = {
  title: "Knight",
  implementation: "[Erratum] Program: Icebreaker - AI - Caïssa - Trojan",
  abilities: [
    {
      action: true,
      label: "Host on a piece of ice",
      async: true,
      effect: effect(function* (state: State, side: Side, _eid: EID, card: Card): Generator<unknown, void, unknown> {
        yield continue_ability(
          state,
          side,
          {
            prompt: "Choose a piece of ice",
            cost: [toC("click", 1)],
            choices: { card: (target: Card) => coreCard.ice(target) && coreCard.installed(target) },
            msg: msg("host itself on ", (_s: State, _sd: Side, _e: EID, _c: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "ice"),
            effect: effect(function* (innerState: State, innerSide: Side, _e: EID, innerCard: Card, targets: unknown[]): Generator<unknown, void, unknown> {
              const target = targets[0] as Card | undefined;
              if (target) coreHosting.host(innerState, innerSide, target, innerCard);
            }),
          },
          card,
          null,
        );
      }),
    },
    breakSub(2, 1, "All", {
      req: req(function* (state: State, _side: Side, _eid: EID, card: Card): Generator<unknown, boolean, unknown> {
        const ice = currentIce(state);
        return !!ice && ice.cid === card.host?.cid && coreIce.getStrength(ice) <= coreIce.getStrength(card);
      }),
    }),
  ],
};
export const kyuban: CardDef = {
  title: "Kyuban",
  implementation: "[Erratum] Program: Trojan",
  events: [
    {
      event: "pass-ice",
      interactive: req(function* (): Generator<unknown, boolean, unknown> {
        return true;
      }),
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return (context(targets).ice as Card | undefined)?.cid === card.host?.cid;
      }),
      msg: "gain 2 [Credits]",
      async: true,
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
export const laamb: CardDef = {
  title: "Laamb",
  ...autoIcebreaker({
    abilities: [breakSub(2, 0, "Barrier"), strengthPump(3, 6)],
    events: [
      {
        event: "encounter-ice",
        skippable: true,
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          const ice = currentIce(state);
          return !!ice && coreCard.hasSubtype(ice, "Barrier") === undefined;
        }),
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
              optional: {
                prompt: `Pay 2 [Credits] to make ${ice.title} gain Barrier?`,
                "yes-ability": {
                  cost: [toC("credit", 2)],
                  msg: msg("make ", () => ice.title, " gain Barrier"),
                  effect: effect(function* (innerState: State, innerSide: Side): Generator<unknown, void, unknown> {
                    coreEffects.registerLingeringEffect(
                      innerState,
                      innerSide,
                      card,
                      "gain-subtype",
                      "end-of-encounter",
                      req(function* (
                        _s: State,
                        _sid: Side,
                        _eid2: EID,
                        _c: Card,
                        targets: unknown[],
                      ): Generator<unknown, boolean, unknown> {
                        return (targets[0] as Card | undefined)?.cid === ice.cid;
                      }),
                      () => "Barrier",
                    );
                  }),
                },
              },
            },
            card,
            null,
          );
        }),
      },
    ],
  }),
};
export const lampades: CardDef = {
  title: "Lampades",
  data: { counter: { power: 3 } },
  interactions: {
    "access-ability": {
      async: true,
      trash: true,
      label: "Trash card",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const target = targets[0] as Card | null;
        return card.disabled !== true && !!target && !coreCard.agenda(target) && !coreCard.inDiscard(target);
      }),
      "waiting-prompt": true,
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const accessed = targets[0] as Card | undefined;
        if (!accessed) return;
        yield continue_ability(
          state,
          side,
          {
            async: true,
            cost: [toC("power", 1), toC("credit", accessed.cost ?? 0, { stealth: "all-stealth" })],
            msg: msg("trash ", () => accessed.title),
            effect: effect(function* (innerState: State, innerSide: Side, innerEid: EID): Generator<unknown, void, unknown> {
              coreMoving.trash(innerState, innerSide, innerEid, { ...accessed, seen: true }, { accessed: true });
            }),
          },
          card,
          null,
        );
      }),
    },
  },
};
export const lamprey: CardDef = {
  title: "Lamprey",
  events: [
    {
      event: "successful-run",
      automatic: "drain-credits",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return targetServerFromContext(targets) === "hq";
      }),
      msg: "force the Corp to lose 1 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        _side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreGaining.loseCredits(state, "corp", eid, 1);
      }),
    },
    coreDefHelpers.trashOnPurge,
  ],
};
export const laserPointer: CardDef = {
  title: "Laser Pointer",
  events: [
    {
      event: "encounter-ice",
      skippable: true,
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        const ice = currentIce(state);
        return !!ice && coreCard.hasAnySubtype(ice, ["AP", "Observer", "Destroyer"]);
      }),
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
            optional: {
              prompt: `Trash this program to bypass ${ice.title}?`,
              "yes-ability": {
                cost: [toC("trash-can", 1)],
                msg: msg("bypass ", () => ice.title),
                effect: effect(function* (innerState: State): Generator<unknown, void, unknown> {
                  coreRuns.bypassIce(innerState);
                }),
              },
            },
          },
          card,
          null,
        );
      }),
    },
  ],
};
export const leech: CardDef = {
  title: "Leech",
  events: [
    {
      event: "successful-run",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return isCentralServer(targetServerFromContext(targets));
      }),
      msg: "place 1 virus counter on itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        addCounter(state, side, eid, card, "virus", 1);
      }),
    },
  ],
  abilities: [
    {
      cost: [toC("virus", 1)],
      label: "Give -1 strength to current piece of ice",
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        return coreRuns.activeEncounter(state);
      }),
      msg: msg("give -1 strength to ", (state: State) => currentIce(state)?.title ?? "ice"),
      effect: effect(function* (state: State, side: Side): Generator<unknown, void, unknown> {
        const ice = currentIce(state);
        if (ice) coreIce.pumpIce(state, side, ice, -1);
      }),
    },
  ],
};
export const leprechaun: CardDef = {
  title: "Leprechaun",
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
      "no-mu": true,
      "max-cards": 2,
    },
  ],
};

export const leviathan: CardDef = {
  title: "Leviathan",
  ...autoIcebreaker({
    abilities: [breakSub(3, 3, "Code Gate"), strengthPump(3, 5)],
  }),
};
export const livingMural: CardDef = {
  title: "Living Mural",
  ...autoIcebreaker({
    "on-install": {
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        return coreThreat.threatLevel(4, state);
      }),
      msg: "gain 3 strength for the remainder of the turn",
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        coreIce.pump(state, side, card, 3, "end-of-turn");
      }),
    },
    abilities: [
      breakSub(1, 1, "Sentry", {
        req: req(function* (
          state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, boolean, unknown> {
          const ice = currentIce(state);
          return !!ice && !!card.host && coreCard.getZone(ice)[1] === coreCard.getZone(card.host)[1];
        }),
      }),
      strengthPump(1, 2),
    ],
  }),
};
export const lLDSEnergyRegulator: CardDef = {
  title: "LLDS Energy Regulator",
  prevention: [
    corePrevention.preventTrashInstalledByType("3 [Credits]: LLDS Energy Regulator", ["Hardware"], [toC("credit", 3)], (ctx: unknown) => {
      const rec = ctx as Record<string, unknown>;
      return rec.cause !== "ability-cost" && rec.gameTrash !== true;
    }),
    corePrevention.preventTrashInstalledByType("[Trash]: LLDS Energy Regulator", ["Hardware"], [toC("trash-can", 1)], (ctx: unknown) => {
      const rec = ctx as Record<string, unknown>;
      return rec.cause !== "ability-cost" && rec.gameTrash !== true;
    }),
  ],
};
export const lobisomem: CardDef = {
  title: "Lobisomem",
  ...autoIcebreaker({
    data: { counter: { power: 1 } },
    abilities: [
      breakSub(1, 1, "Code Gate", { autoBreakSort: 1 }),
      {
        label: "Break X Barrier subroutines",
        cost: [toC("x-credits", 0), toC("power", 1)],
        breakCost: [toC("x-credits", 0), toC("power", 1)],
        autoBreakCredsPerSub: 1,
        break: 0,
        breakReq: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return coreRuns.activeEncounter(state) && hasSubtype(currentIce(state), "Barrier");
        }),
        req: req(function* (state: State, _side: Side, _eid: EID, card: Card): Generator<unknown, boolean, unknown> {
          const ice = currentIce(state);
          return !!ice && coreRuns.activeEncounter(state) && coreIce.getStrength(ice) <= coreIce.getStrength(card);
        }),
        msg: "break X subroutines on encountered Barrier",
        async: true,
        effect: effect(function* (state: State, side: Side, eid: EID, card: Card): Generator<unknown, void, unknown> {
          const count = Number((eid as unknown as Record<string, unknown>)["x-credits"] ?? 0);
          if (count > 0) yield continue_ability(state, side, breakSub(null, count, "Barrier", { repeatable: false }), card, null);
        }),
      },
      strengthPump(1, 2),
    ],
    events: [
      {
        event: "subroutines-broken",
        req: req(function* (_state: State, _side: Side, _eid: EID, card: Card, targets: unknown[]): Generator<unknown, boolean, unknown> {
          return coreIce.allSubsBrokenByCard(context(targets).ice as Card, card);
        }),
        async: true,
        msg: "place 1 power counter on itself",
        effect: effect(function* (state: State, side: Side, eid: EID, card: Card): Generator<unknown, void, unknown> {
          addCounter(state, side, eid, card, "power", 1);
        }),
      },
    ],
  }),
};
export const lustig: CardDef = trashToBypass(
  "Lustig",
  "Sentry",
  breakSub(1, 1, "Sentry"),
  strengthPump(3, 5),
);
