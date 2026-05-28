import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCharge from "../core/charge";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreEffects from "../core/effects";
import * as coreEngine from "../core/engine";
import * as coreGaining from "../core/gaining";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreMemory from "../core/memory";
import * as coreMoving from "../core/moving";
import * as corePrevention from "../core/prevention";
import * as coreRuns from "../core/runs";
import * as coreSabotage from "../core/sabotage";
import * as coreTags from "../core/tags";
import * as coreThreat from "../core/threat";
import * as coreVirus from "../core/virus";
import { effect, msg, req, continue_ability } from "../macros";
import {
  addCounter,
  autoIcebreaker,
  breakSub,
  context,
  currentIce,
  getCounters,
  runnerGrip,
  runIces,
  strengthPump,
  targetServerFromContext,
  toC,
  toCost,
  trashCard,
  virusBreaker,
} from "./programs_3_helpers";

export const magnumOpus: CardDef = {
  title: "Magnum Opus",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      "keep-menu-open": ":while-clicks-left",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreGaining.gainCredits(state, side, eid, 2);
      }),
      msg: "gain 2 [Credits]",
    },
  ],
};
export const makler: CardDef = {
  title: "Makler",
  ...autoIcebreaker({
    abilities: [breakSub(2, 2, "Barrier"), strengthPump(2, 2)],
    events: [
      {
        event: "pass-ice",
        req: req(function* (
          state: State,
          side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return (
            coreIce.allSubsBrokenByCard(context(targets).ice as Card, card) &&
            coreEngine.firstEvent(state, side, "pass-ice", (eventTargets: unknown[]) =>
              coreIce.allSubsBrokenByCard(context(eventTargets).ice as Card, card),
            )
          );
        }),
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
    ],
  }),
};
export const malandragem: CardDef = {
  title: "Malandragem",
  data: { counter: { power: 2 } },
  events: [
    {
      event: "encounter-ice",
      skippable: true,
      interactive: req(function* (): Generator<unknown, boolean, unknown> { return true; }),
      abilityName: "Malandragem (rfg)",
      optional: {
        prompt: "Remove this program from the game to bypass encountered ice?",
        req: req(function* (state: State): Generator<unknown, boolean, unknown> { return coreThreat.threatLevel(4, state); }),
        "yes-ability": {
          cost: [toC("remove-from-game", 1)],
          msg: msg("bypass ", (state: State) => currentIce(state)?.title ?? "encountered ice"),
          effect: effect(function* (state: State): Generator<unknown, void, unknown> { coreRuns.bypassIce(state); }),
        },
      },
    },
    {
      event: "encounter-ice",
      skippable: true,
      interactive: req(function* (): Generator<unknown, boolean, unknown> { return true; }),
      abilityName: "Malandragem (Power counter)",
      optional: {
        prompt: "Remove 1 power counter to bypass encountered ice?",
        once: "per-turn",
        req: req(function* (_state: State, _side: Side, _eid: EID, card: Card): Generator<unknown, boolean, unknown> {
          return getCounters(card, "power") >= 1;
        }),
        "yes-ability": {
          cost: [toC("power", 1)],
          msg: msg("bypass ", (state: State) => currentIce(state)?.title ?? "encountered ice"),
          effect: effect(function* (state: State): Generator<unknown, void, unknown> { coreRuns.bypassIce(state); }),
        },
      },
    },
  ],
};
export const mammon: CardDef = {
  title: "Mammon",
  ...autoIcebreaker({
    flags: {
      "runner-phase-12": req(function* (state: State): Generator<unknown, boolean, unknown> {
        return (state.runner?.credit ?? 0) > 0;
      }),
    },
    abilities: [
      {
        label: "Place X power counters",
        prompt: "How many credits do you want to spend?",
        once: "per-turn",
        cost: [toC("x-credits", 0)],
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return (state as unknown as Record<string, unknown>).runnerPhase12 === true;
        }),
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<unknown, void, unknown> {
          const amount = Number((eid as unknown as Record<string, unknown>)["x-credits"] ?? 0);
          addCounter(state, side, eid, card, "power", amount);
        }),
        msg: "place power counters on itself",
      },
      breakSub([toC("power", 1)], 1),
      strengthPump(2, 2),
    ],
    events: [
      {
        event: "runner-turn-ends",
        silent: true,
        effect: effect(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, void, unknown> {
          card.counter = { ...(card.counter ?? {}), power: 0 };
        }),
      },
    ],
  }),
};
export const mantle: CardDef = {
  title: "Mantle",
  recurring: 1,
  interactions: {
    "pay-credits": {
      req: req(function* (
        _state: State,
        _side: Side,
        eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const target = targets[0] as Card | null;
        return eid.sourceType === "ability" && (coreCard.hardware(target) || coreCard.program(target));
      }),
      type: "recurring",
    },
  },
};
export const marjanah: CardDef = {
  title: "Marjanah",
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 1, "Barrier", {
        label: "Break 1 Barrier subroutine",
        breakCostBonus: req(function* (state: State): Generator<unknown, Record<string, unknown>[] | undefined, unknown> {
          const runnerRecord = state.runner as unknown as Record<string, unknown>;
          return runnerRecord.successfulRun ? [toCost("credit", -1)] : undefined;
        }),
      }),
      strengthPump(1, 1),
    ],
  }),
};
export const massDriver: CardDef = {
  title: "Mass-Driver",
  ...autoIcebreaker({
    abilities: [breakSub(2, 1, "Code Gate"), strengthPump(1, 1)],
    events: [
      {
        event: "subroutines-broken",
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return coreIce.allSubsBrokenByCard(context(targets).ice as Card, card);
        }),
        msg: "prevent the first 3 subroutines from resolving on the next encountered ice",
        effect: effect(function* (
          state: State,
          side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, void, unknown> {
          coreEngine.registerEvents(state, side, card, [
            {
              event: "encounter-ice",
              duration: "end-of-run",
              "unregister-once-resolved": true,
              effect: effect(function* (innerState: State): Generator<unknown, void, unknown> {
                const ice = currentIce(innerState);
                for (const sub of (ice?.subroutines ?? []).slice(0, 3)) {
                  if (ice) coreIce.dontResolveSubroutine(ice, sub);
                }
              }),
            },
          ]);
        }),
      },
    ],
  }),
};
export const matryoshka: CardDef = {
  title: "Matryoshka",
  ...autoIcebreaker({
    abilities: [
      {
        action: true,
        label: "Host 1 copy of Matryoshka",
        prompt: "Choose 1 copy of Matryoshka in the grip",
        "keep-menu-open": ":while-clicks-left",
        cost: [toC("click", 1)],
        choices: { card: (target: Card) => coreCard.inHand(target) && target.title === "Matryoshka" },
        msg: msg("host ", (_s: State, _sd: Side, _e: EID, _c: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "Matryoshka", " on itself"),
        effect: effect(function* (state: State, side: Side, _eid: EID, card: Card, targets: unknown[]): Generator<unknown, void, unknown> {
          const target = targets[0] as Card | undefined;
          if (target) coreHosting.host(state, side, card, target);
        }),
      },
      {
        label: "Break X subroutines",
        cost: [toC("x-credits", 0), toC("turn-hosted-matryoshka-facedown", 1)],
        breakCost: [toC("x-credits", 0), toC("turn-hosted-matryoshka-facedown", 1)],
        async: true,
        autoBreakCredsPerSub: 1,
        break: 0,
        breakReq: req(function* (state: State): Generator<unknown, boolean, unknown> { return coreRuns.activeEncounter(state); }),
        req: req(function* (state: State, _side: Side, _eid: EID, card: Card): Generator<unknown, boolean, unknown> {
          const ice = currentIce(state);
          return !!ice && coreRuns.activeEncounter(state) && coreIce.getStrength(ice) <= coreIce.getStrength(card);
        }),
        effect: effect(function* (state: State, side: Side, eid: EID, card: Card): Generator<unknown, void, unknown> {
          const amount = Number((eid as unknown as Record<string, unknown>)["x-credits"] ?? 0);
          if (amount > 0) yield continue_ability(state, side, breakSub(null, amount, "All", { repeatable: false }), card, null);
        }),
      },
      strengthPump(1, 1),
    ],
  }),
};
export const maven: CardDef = {
  title: "Maven",
  ...autoIcebreaker({
    abilities: [breakSub(2, 1)],
    "static-abilities": [
      coreIce.breakerStrengthBonus(
        req(function* (state: State): Generator<unknown, number, unknown> {
          return coreBoard.allActiveInstalled(state, "runner").filter(coreCard.program).length;
        }),
        0,
      ),
    ],
  }),
};
export const mayfly: CardDef = {
  title: "Mayfly",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "All", {
        additionalAbility: {
          msg: "will trash itself when this run ends",
          effect: effect(function* (
            state: State,
            side: Side,
            _eid: EID,
            card: Card,
          ): Generator<unknown, void, unknown> {
            coreEngine.registerEvents(state, side, card, [
              {
                event: "run-ends",
                duration: "end-of-run",
                "unregister-once-resolved": true,
                async: true,
                effect: effect(function* (
                  innerState: State,
                  innerSide: Side,
                  innerEid: EID,
                  innerCard: Card,
                ): Generator<unknown, void, unknown> {
                  trashCard(innerState, innerSide, innerEid, innerCard);
                }),
              },
            ]);
          }),
        },
      }),
      strengthPump(1, 1),
    ],
  }),
};

export const medium: CardDef = {
  title: "Medium",
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
        return targetServerFromContext(targets) === "rd";
      }),
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
    {
      event: "breach-server",
      automatic: "pre-breach",
      async: true,
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return context(targets).server === "rd";
      }),
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
            req: req(function* (
              innerState: State,
              _innerSide: Side,
              _innerEid: EID,
              innerCard: Card,
            ): Generator<unknown, boolean, unknown> {
              return coreVirus.getVirusCounters(innerState, innerCard) > 1;
            }),
            prompt: "How many additional cards from R&D do you want to access?",
            choices: {
              number: req(function* (
                innerState: State,
                _innerSide: Side,
                _innerEid: EID,
                innerCard: Card,
              ): Generator<unknown, number, unknown> {
                return coreVirus.getVirusCounters(innerState, innerCard) - 1;
              }),
              default: req(function* (
                innerState: State,
                _innerSide: Side,
                _innerEid: EID,
                innerCard: Card,
              ): Generator<unknown, number, unknown> {
                return coreVirus.getVirusCounters(innerState, innerCard) - 1;
              }),
            },
            msg: msg("access target additional card from R&D"),
            effect: effect(function* (
              innerState: State,
              _innerSide: Side,
              _innerEid: EID,
              _innerCard: Card,
              targets: unknown[],
            ): Generator<unknown, void, unknown> {
              const amount = typeof targets[0] === "number" ? targets[0] : 0;
              coreAccess.accessBonus(innerState, "runner", Math.max(0, amount), "rd");
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};
export const mimic: CardDef = {
  title: "Mimic",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Sentry")],
  }),
};
export const misdirection: CardDef = {
  title: "Misdirection",
  abilities: [
    {
      action: true,
      cost: [toC("click", 2), toC("x-credits", 0)],
      label: "remove X tags",
      async: true,
      msg: msg("remove ", (_state: State, _side: Side, eid: EID) => Number((eid as unknown as Record<string, unknown>)["x-credits"] ?? 0), " tag"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreTags.loseTags(state, side, eid, Number((eid as unknown as Record<string, unknown>)["x-credits"] ?? 0));
      }),
    },
  ],
};
export const mKUltra: CardDef = {
  title: "MKUltra",
  highlightInDiscard: true,
  events: [
    {
      event: "encounter-ice",
      skippable: true,
      async: true,
      location: "discard",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return coreCard.inDiscard(card) && coreCard.hasSubtype(context(targets).ice as Card | null, "Sentry") !== undefined;
      }),
      effect: effect(function* (state: State, side: Side, eid: EID, card: Card): Generator<unknown, void, unknown> {
        yield continue_ability(
          state,
          side,
          {
            prompt: "Install MKUltra from the heap?",
            choices: ["Yes", "No"],
            async: true,
            effect: effect(function* (innerState: State, innerSide: Side, innerEid: EID, innerCard: Card, targets: unknown[]): Generator<unknown, void, unknown> {
              if (targets[0] === "Yes") coreInstalling.runnerInstall(innerState, innerSide, innerEid, innerCard, { msgKeys: { installSource: innerCard, displayOrigin: true } });
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
  abilities: [
    {
      ...breakSub([toC("credit", 3)], 2, "Sentry"),
      label: "add 2 strength and break up to 2 Sentry subroutines",
      heapBreakerPump: 2,
      heapBreakerBreak: 2,
      pump: 2,
    },
  ],
};
export const mongoose: CardDef = {
  title: "Mongoose",
  ...autoIcebreaker({
    events: [
      {
        event: "subroutines-broken",
        silent: true,
        req: req(function* (
          state: State,
          _side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return !!state.run && coreIce.anySubsBrokenByCard(context(targets).ice as Card, card);
        }),
        effect: effect(function* (
          state: State,
          side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, void, unknown> {
          const brokenIce = context(targets).ice as Card | undefined;
          coreEffects.registerLingeringEffect(
            state,
            side,
            card,
            "prevent-paid-ability",
            "end-of-run",
            req(function* (
              innerState: State,
              _innerSide: Side,
              _innerEid: EID,
              _innerCard: Card,
              abilityTargets: unknown[],
            ): Generator<unknown, boolean, unknown> {
              const breaker = abilityTargets[0] as Card | undefined;
              return currentIce(innerState)?.cid !== brokenIce?.cid && breaker?.cid === card.cid;
            }),
            () => true,
          );
        }),
      },
    ],
    abilities: [breakSub(1, 2, "Sentry"), strengthPump(2, 2)],
  }),
};

export const monkeywrench: CardDef = {
  title: "Monkeywrench",
  "static-abilities": [
    {
      type: ":ice-strength",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const target = targets[0] as Card | undefined;
        return !!target && coreCard.ice(target) && card.host !== undefined && coreCard.getZone(card.host)[1] === coreCard.getZone(target)[1];
      }),
      value: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, number, unknown> {
        return (targets[0] as Card | undefined)?.cid === card.host?.cid ? -2 : -1;
      }),
    },
  ],
};
export const morningStar: CardDef = {
  title: "Morning Star",
  ...autoIcebreaker({
    abilities: [breakSub(1, 0, "Barrier")],
  }),
};

export const multithreader: CardDef = {
  title: "Multithreader",
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
        return eid.sourceType === "ability" && coreCard.program(targets[0] as Card | null);
      }),
      type: "recurring",
    },
  },
};

export const musaazi: CardDef = virusBreaker("Musaazi", "Sentry");
export const muse: CardDef = {
  title: "Muse",
  abilities: [
    {
      prompt: "Choose a non-daemon program",
      choices: req(function* (state: State): Generator<unknown, (Card | string)[], unknown> {
        return [
          ...runnerGrip(state).filter((card) => coreCard.program(card) && coreCard.hasSubtype(card, "Daemon") === undefined),
          "Done",
        ];
      }),
      async: true,
      effect: effect(function* (state: State, side: Side, eid: EID, card: Card, targets: unknown[]): Generator<unknown, void, unknown> {
        const target = targets[0];
        if (typeof target !== "string") coreInstalling.runnerInstall(state, side, eid, target as Card, { hostCard: card, msgKeys: { installSource: card, displayOrigin: true } });
      }),
    },
  ],
};
export const naNotK: CardDef = {
  title: "Na'Not'K",
  ...autoIcebreaker({
    "static-abilities": [
      coreIce.breakerStrengthBonus(
        req(function* (state: State): Generator<unknown, number, unknown> {
          return runIces(state).length;
        }),
        0,
      ),
    ],
    abilities: [breakSub(1, 1, "Sentry"), strengthPump(3, 2)],
  }),
};
export const nanuq: CardDef = {
  title: "Nanuq",
  ...autoIcebreaker({
    abilities: [breakSub(2, 2, "All"), strengthPump(1, 1)],
    "move-zone-replacement": req(function* (
      _state: State,
      _side: Side,
      _eid: EID,
      _card: Card,
      targets: unknown[],
    ): Generator<unknown, string[] | undefined, unknown> {
      const ctx = context(targets);
      const old = ctx.card as Card | undefined;
      const targetZone = ctx.zone as string[] | undefined;
      if (old?.installed === true && ctx.shuffled !== true && old.facedown !== true && targetZone?.[0] !== "rfg") return ["rfg"];
      return undefined;
    }),
    events: [
      {
        event: "agenda-scored",
        msg: "remove itself from the game",
        once: "per-turn",
        interactive: req(function* (): Generator<unknown, boolean, unknown> {
          return true;
        }),
        effect: effect(function* (state: State, side: Side, _eid: EID, card: Card): Generator<unknown, void, unknown> {
          coreMoving.move(state, side, card, "rfg");
        }),
      },
      {
        event: "agenda-stolen",
        msg: "remove itself from the game",
        once: "per-turn",
        interactive: req(function* (): Generator<unknown, boolean, unknown> {
          return true;
        }),
        effect: effect(function* (state: State, side: Side, _eid: EID, card: Card): Generator<unknown, void, unknown> {
          coreMoving.move(state, side, card, "rfg");
        }),
      },
    ],
  }),
};
export const nerveAgent: CardDef = {
  title: "Nerve Agent",
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
        return targetServerFromContext(targets) === "hq";
      }),
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
    {
      event: "breach-server",
      automatic: "pre-breach",
      async: true,
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return context(targets).server === "hq";
      }),
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
            req: req(function* (
              innerState: State,
              _innerSide: Side,
              _innerEid: EID,
              innerCard: Card,
            ): Generator<unknown, boolean, unknown> {
              return coreVirus.getVirusCounters(innerState, innerCard) > 1;
            }),
            prompt: "How many additional cards from HQ do you want to access?",
            choices: {
              number: req(function* (
                innerState: State,
                _innerSide: Side,
                _innerEid: EID,
                innerCard: Card,
              ): Generator<unknown, number, unknown> {
                return coreVirus.getVirusCounters(innerState, innerCard) - 1;
              }),
              default: req(function* (
                innerState: State,
                _innerSide: Side,
                _innerEid: EID,
                innerCard: Card,
              ): Generator<unknown, number, unknown> {
                return coreVirus.getVirusCounters(innerState, innerCard) - 1;
              }),
            },
            msg: msg("access target additional card from HQ"),
            effect: effect(function* (
              innerState: State,
              _innerSide: Side,
              _innerEid: EID,
              _innerCard: Card,
              targets: unknown[],
            ): Generator<unknown, void, unknown> {
              const amount = typeof targets[0] === "number" ? targets[0] : 0;
              coreAccess.accessBonus(innerState, "runner", Math.max(0, amount), "hq");
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};
export const netShield: CardDef = {
  title: "Net Shield",
  prevention: [
    {
      prevents: "damage",
      type: "ability",
      maxUses: 1,
      ability: {
        ...corePrevention.preventUpToNDamage(1, ["net"]),
        cost: [toC("credit", 1)],
        msg: "prevent 1 net damage",
      },
    },
  ],
};
export const nfr: CardDef = {
  title: "Nfr",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Barrier")],
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
export const nga: CardDef = {
  title: "Nga",
  data: { counter: { power: 3 } },
  events: [
    {
      event: "successful-run",
      skippable: true,
      optional: {
        req: req(function* (_state: State, _side: Side, _eid: EID, card: Card): Generator<unknown, boolean, unknown> {
          return getCounters(card, "power") > 0;
        }),
        autoresolve: coreDefHelpers.getAutoresolve("auto-fire"),
        "waiting-prompt": true,
        prompt: "Remove 1 hosted power counter?",
        "yes-ability": {
          msg: "remove 1 hosted power counter to sabotage 1",
          async: true,
          cost: [toC("power", 1)],
          effect: effect(function* (state: State, side: Side, eid: EID, card: Card): Generator<unknown, void, unknown> {
            yield continue_ability(state, side, coreSabotage.sabotageAbility(1), card, null);
          }),
        },
      },
    },
  ],
  abilities: [coreDefHelpers.setAutoresolve("auto-fire", "Nga")],
};
export const ninja: CardDef = {
  title: "Ninja",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Sentry"), strengthPump(3, 5)],
  }),
};

export const num: CardDef = {
  title: "Num",
  ...autoIcebreaker({
    abilities: [breakSub(2, 1, "Sentry")],
  }),
};
export const nyashia: CardDef = {
  title: "Nyashia",
  data: { counter: { power: 3 } },
  events: [
    {
      event: "breach-server",
      skippable: true,
      optional: {
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return getCounters(card, "power") > 0 && context(targets).server === "rd";
        }),
        "waiting-prompt": true,
        prompt: "Spend 1 hosted power counter to access 1 additional card?",
        "yes-ability": {
          msg: "access 1 additional card from R&D",
          cost: [toC("power", 1)],
          effect: effect(function* (state: State): Generator<unknown, void, unknown> {
            coreAccess.accessBonus(state, "runner", 1, "rd");
          }),
        },
      },
    },
  ],
};

export const odore: CardDef = {
  title: "Odore",
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 0, "Sentry"),
      breakSub(0, 1, "Sentry", {
        label: "Break 1 Sentry subroutine (Virtual restriction)",
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return coreBoard
            .allActiveInstalled(state, "runner")
            .filter((card) => coreCard.hasSubtype(card, "Virtual") !== undefined).length >= 3;
        }),
      }),
      strengthPump(3, 3),
    ],
  }),
};
export const omega: CardDef = {
  title: "Omega",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "All", {
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          const ice = currentIce(state);
          const server = ice ? coreBoard.cardToServer(state, ice) : null;
          return !!ice && !!server && server.ices[0]?.cid === ice.cid;
        }),
      }),
      strengthPump(1, 1),
    ],
  }),
};
export const orca: CardDef = {
  title: "Orca",
  ...autoIcebreaker({
    abilities: [breakSub(2, 0, "Sentry"), strengthPump(2, 3)],
    events: [
      {
        event: "subroutines-broken",
        req: req(function* (
          state: State,
          side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return (
            coreIce.allSubsBrokenByCard(context(targets).ice as Card, card) &&
            coreEngine.firstEvent(state, side, "subroutines-broken", (eventTargets: unknown[]) =>
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
        ): Generator<unknown, void, unknown> {
          yield continue_ability(state, side, coreCharge.chargeAbility(state, side), card, null);
        }),
      },
    ],
  }),
};
export const origami: CardDef = {
  title: "Origami",
  "static-abilities": [
    {
      type: ":hand-size",
      req: req(function* (
        _state: State,
        side: Side,
      ): Generator<unknown, boolean, unknown> {
        return side === "runner";
      }),
      value: req(function* (state: State): Generator<unknown, number, unknown> {
        return coreBoard
          .allActiveInstalled(state, "runner")
          .filter((card) => card.title === "Origami").length;
      }),
    },
  ],
};
export const overmind: CardDef = {
  title: "Overmind",
  ...autoIcebreaker({
    "on-install": {
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        addCounter(state, side, eid, card, "power", coreMemory.availableMu(state));
      }),
    },
    abilities: [breakSub([toC("power", 1)], 1), strengthPump(1, 1)],
  }),
};
