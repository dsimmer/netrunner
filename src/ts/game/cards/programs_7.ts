import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEngine from "../core/engine";
import * as coreGaining from "../core/gaining";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreMoving from "../core/moving";
import * as coreRevealing from "../core/revealing";
import * as coreRuns from "../core/runs";
import * as coreServers from "../core/servers";
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
  hasSubtype,
  isCentralServer,
  returnAndDerez,
  runnerStack,
  strengthPump,
  targetServerFromContext,
  toC,
  toCost,
  trashCard,
} from "./programs_3_helpers";

export const paintbrush: CardDef = {
  title: "Paintbrush",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      label: "give ice a subtype",
      choices: {
        card: (target: Card) => coreCard.installed(target) && coreCard.ice(target) && coreCard.rezzed(target),
      },
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const ice = targets[0] as Card | undefined;
        if (!ice) return;
        yield continue_ability(
          state,
          side,
          {
            prompt: "Choose an ice subtype",
            choices: ["Barrier", "Code Gate", "Sentry"],
            msg: msg("make ", () => ice.title, " gain target until the end of the turn"),
            effect: effect(function* (innerState: State, innerSide: Side, _innerEid: EID, innerCard: Card, subtypeTargets: unknown[]): Generator<unknown, void, unknown> {
              const subtype = String(subtypeTargets[0] ?? "");
              coreEffects.registerLingeringEffect(
                innerState,
                innerSide,
                innerCard,
                "gain-subtype",
                "end-of-turn",
                req(function* (_s: State, _sid: Side, _e: EID, _c: Card, effectTargets: unknown[]): Generator<unknown, boolean, unknown> {
                  return (effectTargets[0] as Card | undefined)?.cid === ice.cid;
                }),
                () => subtype,
              );
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};

export const panchatantra: CardDef = {
  title: "Panchatantra",
  events: [
    {
      event: "encounter-ice",
      skippable: true,
      optional: {
        prompt: "Give encountered piece ice a subtype?",
        req: req(function* (): Generator<unknown, boolean, unknown> {
          return true;
        }),
        "yes-ability": {
          prompt: "Choose an ice subtype",
          choices: ["Barrier", "Code Gate", "Sentry", "AP", "Bioroid", "Tracer"],
          msg: msg("make encountered ice gain target until end of encounter"),
          effect: effect(function* (
            state: State,
            side: Side,
            _eid: EID,
            card: Card,
            targets: unknown[],
          ): Generator<unknown, void, unknown> {
            const ice = currentIce(state);
            const subtype = String(targets[0] ?? "");
            if (!ice || !subtype) return;
            coreEffects.registerLingeringEffect(
              state,
              side,
              card,
              "gain-subtype",
              "end-of-encounter",
              req(function* (_s: State, _sid: Side, _e: EID, _c: Card, effectTargets: unknown[]): Generator<unknown, boolean, unknown> {
                return (effectTargets[0] as Card | undefined)?.cid === ice.cid;
              }),
              () => subtype,
            );
          }),
        },
      },
    },
  ],
};
export const paperclip: CardDef = {
  title: "Paperclip",
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
        return coreCard.inDiscard(card) && coreCard.hasSubtype(context(targets).ice as Card | null, "Barrier") !== undefined;
      }),
      effect: effect(function* (state: State, side: Side, eid: EID, card: Card): Generator<unknown, void, unknown> {
        yield continue_ability(
          state,
          side,
          {
            prompt: "Install Paperclip from the heap?",
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
      label: "+X strength, break X subroutines",
      cost: [toC("x-credits", 0)],
      heapBreakerPump: "x",
      heapBreakerBreak: "x",
      breakReq: req(function* (state: State): Generator<unknown, boolean, unknown> {
        return coreRuns.activeEncounter(state) && hasSubtype(currentIce(state), "Barrier");
      }),
      async: true,
      effect: effect(function* (state: State, side: Side, eid: EID, card: Card): Generator<unknown, void, unknown> {
        const amount = Number((eid as unknown as Record<string, unknown>)["x-credits"] ?? 0);
        coreIce.pump(state, side, card, amount);
        if (amount > 0) yield continue_ability(state, side, breakSub(null, amount, "Barrier", { repeatable: false }), card, null);
      }),
    },
  ],
};
export const parasite: CardDef = {
  title: "Parasite",
  implementation: "[Erratum] Program: Virus - Trojan",
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
        return (targets[0] as Card | undefined)?.cid === card.host?.cid;
      }),
      value: req(function* (
        state: State,
        _side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, number, unknown> {
        return -coreVirus.getVirusCounters(state, card);
      }),
    },
  ],
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
    {
      event: "ice-strength-changed",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const changed = context(targets).card as Card | undefined;
        return !!changed && changed.cid === card.host?.cid && coreIce.getStrength(changed) <= 0;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        if (card.host) coreMoving.trash(state, side, eid, card.host, { causeCard: card });
      }),
    },
    coreDefHelpers.trashOnPurge,
  ],
};
export const paricia: CardDef = {
  title: "Paricia",
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
        return eid.sourceType === "runner-trash-corp-cards" && coreCard.asset(targets[0] as Card | null);
      }),
      type: "recurring",
    },
  },
};

export const passport: CardDef = {
  title: "Passport",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Code Gate", {
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return isCentralServer(coreServers.targetServer(state));
        }),
      }),
      strengthPump(2, 2),
    ],
  }),
};
export const pawn: CardDef = {
  title: "Pawn",
  implementation: "[Erratum] Program: Caïssa - Trojan",
  events: [
    {
      event: "successful-run",
      interactive: req(function* (): Generator<unknown, boolean, unknown> { return true; }),
      async: true,
      req: req(function* (_state: State, _side: Side, _eid: EID, card: Card): Generator<unknown, boolean, unknown> {
        return coreCard.ice(card.host ?? null);
      }),
      effect: effect(function* (state: State, side: Side, eid: EID, card: Card): Generator<unknown, void, unknown> {
        const host = card.host;
        const server = host ? coreBoard.cardToServer(state, host) : null;
        const nextIce = server && (host?.index ?? 0) > 0 ? server.ices[(host?.index ?? 0) - 1] : undefined;
        if (nextIce) {
          coreHosting.host(state, side, nextIce, card);
        } else {
          yield continue_ability(
            state,
            side,
            {
              prompt: "Choose another Caïssa to install",
              "show-discard": true,
              choices: { card: (target: Card) => coreCard.hasSubtype(target, "Caïssa") !== undefined && (coreCard.inHand(target) || coreCard.inDiscard(target)) },
              msg: msg("trash itself and install ", (_s: State, _sd: Side, _e: EID, _c: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "a Caïssa", ", ignoring all costs"),
              async: true,
              effect: effect(function* (innerState: State, innerSide: Side, innerEid: EID, innerCard: Card, targets: unknown[]): Generator<unknown, void, unknown> {
                const target = targets[0] as Card | undefined;
                trashCard(innerState, innerSide, innerEid, innerCard);
                if (target) coreInstalling.runnerInstall(innerState, innerSide, innerEid, target, { ignoreAllCost: true, msgKeys: { displayOrigin: true, installSource: innerCard } });
              }),
            },
            card,
            null,
          );
        }
      }),
    },
  ],
};
export const peacock: CardDef = {
  title: "Peacock",
  ...autoIcebreaker({
    abilities: [breakSub(2, 1, "Code Gate"), strengthPump(2, 3)],
  }),
};
export const pelangi: CardDef = {
  title: "Pelangi",
  data: { counter: { virus: 2 } },
  abilities: [
    {
      once: "per-turn",
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        return coreRuns.activeEncounter(state);
      }),
      cost: [toC("virus", 1)],
      label: "Make ice gain a subtype",
      prompt: "Choose an ice subtype",
      choices: req(function* (state: State): Generator<unknown, string[], unknown> {
        const subtypes = new Set<string>();
        for (const card of coreBoard.getAllInstalled(state)) {
          if (coreCard.ice(card)) for (const subtype of card.subtypes ?? []) subtypes.add(subtype);
        }
        return [...subtypes].sort();
      }),
      msg: msg("make ", (state: State) => currentIce(state)?.title ?? "ice", " gain target until end of the encounter"),
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const ice = currentIce(state);
        const subtype = String(targets[0] ?? "");
        if (!ice || !subtype) return;
        coreEffects.registerLingeringEffect(
          state,
          side,
          card,
          "gain-subtype",
          "end-of-encounter",
          req(function* (
            _s: State,
            _sid: Side,
            _eid2: EID,
            _c: Card,
            effectTargets: unknown[],
          ): Generator<unknown, boolean, unknown> {
            return (effectTargets[0] as Card | undefined)?.cid === ice.cid;
          }),
          () => subtype,
        );
      }),
    },
  ],
};
export const penrose: CardDef = {
  title: "Penrose",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Barrier", {
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, boolean, unknown> {
          return (card as unknown as Record<string, unknown>).installed === "this-turn";
        }),
      }),
      breakSub(1, 1, "Code Gate"),
      strengthPump([toCost("credit", 1, { stealth: 1 })], 3, "end-of-encounter"),
    ],
  }),
};

export const peregrine: CardDef = returnAndDerez(
  "Peregrine",
  "Code Gate",
  breakSub(1, 1, "Code Gate"),
  strengthPump(3, 3),
);
export const persephone: CardDef = {
  title: "Persephone",
  ...autoIcebreaker({
    abilities: [breakSub(2, 1, "Sentry"), strengthPump(1, 1)],
    events: [
      {
        event: "pass-ice",
        req: req(function* (
          state: State,
          _side: Side,
          _eid: EID,
          _card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          const ice = context(targets).ice as Card | null;
          return coreCard.hasSubtype(ice, "Sentry") !== undefined && coreCard.rezzed(ice) && runnerStack(state).length > 0;
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
          const firedCount = (ice?.subroutines ?? []).filter((sub) => sub.fired === true).length;
          yield continue_ability(
            state,
            side,
            {
              optional: {
                prompt: `Trash the top card of the stack to trash ${firedCount} card from R&D?`,
                "yes-ability": {
                  async: true,
                  msg: "trash the top card of the stack and trash cards from R&D",
                  effect: effect(function* (innerState: State, _innerSide: Side, innerEid: EID): Generator<unknown, void, unknown> {
                    coreMoving.mill(innerState, "runner", innerEid, "runner", 1);
                    coreMoving.mill(innerState, "runner", innerEid, "corp", firedCount);
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

export const pheromones: CardDef = {
  title: "Pheromones",
  "x-fn": req(function* (
    _state: State,
    _side: Side,
    _eid: EID,
    card: Card,
  ): Generator<unknown, number, unknown> {
    return getCounters(card, "virus");
  }),
  recurring: req(function* (
    _state: State,
    _side: Side,
    _eid: EID,
    card: Card,
  ): Generator<unknown, number, unknown> {
    return getCounters(card, "virus");
  }),
  events: [
    {
      event: "successful-run",
      silent: true,
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
  ],
  interactions: {
    "pay-credits": {
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        return coreServers.targetServer(state) === "hq";
      }),
      type: "recurring",
    },
  },
};
export const physarumEntangler: CardDef = {
  title: "Physarum Entangler",
  events: [
    coreDefHelpers.trashOnPurge,
    {
      event: "encounter-ice",
      skippable: true,
      optional: {
        prompt: msg("Pay ", (state: State) => currentIce(state)?.subroutines?.length ?? 0, " [Credits] to bypass encountered ice?"),
        req: req(function* (state: State, _side: Side, _eid: EID, card: Card): Generator<unknown, boolean, unknown> {
          const ice = currentIce(state);
          return !!ice && coreCard.hasSubtype(ice, "Barrier") === undefined && ice.cid === card.host?.cid;
        }),
        "yes-ability": {
          async: true,
          cost: [toC("credit", 0)],
          msg: msg("bypass ", (state: State) => currentIce(state)?.title ?? "encountered ice"),
          effect: effect(function* (state: State): Generator<unknown, void, unknown> {
            coreRuns.bypassIce(state);
          }),
        },
      },
    },
  ],
};

export const pichacao: CardDef = {
  title: "Pichação",
  events: [
    {
      event: "pass-ice",
      optional: {
        interactive: req(function* (): Generator<unknown, boolean, unknown> {
          return true;
        }),
        prompt: "Gain [Click]?",
        "waiting-prompt": true,
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return (context(targets).ice as Card | undefined)?.cid === card.host?.cid;
        }),
        "yes-ability": {
          msg: "gain [Click]",
          async: true,
          effect: effect(function* (state: State, side: Side): Generator<unknown, void, unknown> {
            coreGaining.gainClicks(state, side, 1);
          }),
        },
      },
    },
  ],
};
export const pipeline: CardDef = {
  title: "Pipeline",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Sentry"), strengthPump(2, 1, "end-of-run")],
  }),
};
export const plague: CardDef = {
  title: "Plague",
  "on-install": {
    prompt: "Choose a server",
    choices: req(function* (state: State): Generator<unknown, string[], unknown> {
      return Object.keys(state.corp.servers.remote).concat(["hq", "rd", "archives"]);
    }),
    msg: msg("target ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => String(targets[0] ?? "")),
    req: req(function* (
      _state: State,
      _side: Side,
      _eid: EID,
      card: Card,
    ): Generator<unknown, boolean, unknown> {
      return (card as unknown as Record<string, unknown>).cardTarget === undefined;
    }),
    effect: effect(function* (
      _state: State,
      _side: Side,
      _eid: EID,
      card: Card,
      targets: unknown[],
    ): Generator<unknown, void, unknown> {
      (card as unknown as Record<string, unknown>).cardTarget = targets[0];
    }),
  },
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
        return targetServerFromContext(targets) === (card as unknown as Record<string, unknown>).cardTarget;
      }),
      msg: "place 2 virus counters on itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        addCounter(state, side, eid, card, "virus", 2);
      }),
    },
  ],
};

export const pressureSpike: CardDef = {
  title: "Pressure Spike",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Barrier"),
      strengthPump(2, 3, "end-of-encounter", { autoPumpSort: 1 }),
      strengthPump(2, 9, "end-of-encounter", {
        autoPumpIgnore: true,
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return coreThreat.threatLevel(4, state);
        }),
      }),
    ],
  }),
};
export const principia: CardDef = {
  title: "Principia",
  "install-cost-bonus": req(function* (state: State): Generator<unknown, number, unknown> {
    return -coreBoard
      .allInstalled(state, "runner")
      .filter((card) => coreCard.hasSubtype(card, "Icebreaker") !== undefined).length;
  }),
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Barrier"), strengthPump(2, 2)],
  }),
};

export const progenitor: CardDef = {
  title: "Progenitor",
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
        const target = targets[0] as Card | null;
        return coreCard.program(target) && coreCard.hasSubtype(target, "Virus") !== undefined;
      }),
      "no-mu": true,
      "max-cards": 1,
    },
    {
      type: ":prevent-purge-virus-counters",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, boolean, unknown> {
        return getCounters((card.hosted ?? [])[0], "virus") > 0;
      }),
      value: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, Record<string, unknown>, unknown> {
        return { card: (card.hosted ?? [])[0], quantity: 1 };
      }),
    },
  ],
};
export const propeller: CardDef = {
  title: "Propeller",
  ...autoIcebreaker({
    data: { counter: { power: 4 } },
    abilities: [breakSub(1, 1, "Barrier"), strengthPump([toCost("power", 1)], 2)],
  }),
};
export const puffer: CardDef = {
  title: "Puffer",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Sentry"),
      strengthPump(2, 1),
      {
        action: true,
        cost: [toC("click", 1)],
        msg: "place 1 power counter",
        label: "Place 1 power counter",
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
export const readWriteShare: CardDef = { title: "Read-Write Share" };
export const reaver: CardDef = {
  title: "Reaver",
  events: [
    {
      event: "runner-trash",
      async: true,
      interactive: req(function* (): Generator<unknown, boolean, unknown> {
        return true;
      }),
      "once-per-instance": true,
      req: req(function* (
        state: State,
        side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const installedCardTrashed = targets.some((target) => coreCard.installed(context([target]).card as Card | null));
        return installedCardTrashed && coreEngine.firstEvent(state, side, "runner-trash", (eventTargets: unknown[]) =>
          eventTargets.some((target) => coreCard.installed(context([target]).card as Card | null)),
        );
      }),
      msg: "draw 1 card",
      effect: effect(function* (
        state: State,
        _side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreDrawing.draw(state, "runner", eid, 1);
      }),
    },
  ],
};
export const refractor: CardDef = {
  title: "Refractor",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Code Gate"),
      strengthPump([toCost("credit", 1, { stealth: 1 })], 3, "end-of-encounter"),
    ],
  }),
};

export const revolver: CardDef = {
  title: "Revolver",
  ...autoIcebreaker({
    data: { counter: { power: 6 } },
    abilities: [
      breakSub([toC("power", 1)], 1, "Sentry", { autoBreakSort: 1 }),
      breakSub([toC("trash-can", 1)], 1, "Sentry"),
      strengthPump(2, 3),
    ],
  }),
};

export const rezeki: CardDef = {
  title: "Rezeki",
  events: [
    {
      event: "runner-turn-begins",
      automatic: "gain-credits",
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

export const risingTide: CardDef = {
  title: "Rising Tide",
  ...autoIcebreaker({
    "static-abilities": [
      coreIce.breakerStrengthBonus(
        req(function* (state: State): Generator<unknown, number, unknown> {
          return (state.runner?.discard ?? []).filter((card) => coreCard.hasSubtype(card, "Fracter") !== undefined).length;
        }),
        0,
      ),
    ],
    abilities: [breakSub(1, 1, "Barrier"), strengthPump(1, 1)],
  }),
};
export const rNGKey: CardDef = {
  title: "RNG Key",
  events: [
    {
      event: "pre-access-card",
      req: req(function* (_state: State, _side: Side, _eid: EID, card: Card): Generator<unknown, boolean, unknown> {
        return card.special?.rngGuess !== undefined;
      }),
      async: true,
      msg: "reveal the accessed card",
      effect: effect(function* (state: State, side: Side, eid: EID, card: Card, targets: unknown[]): Generator<unknown, void, unknown> {
        const accessed = context(targets).accessedCard as Card | undefined;
        if (!accessed) return;
        coreRevealing.reveal(state, side, eid, accessed);
        const guess = card.special?.rngGuess;
        if (guess === accessed.cost || guess === (accessed as unknown as Record<string, unknown>).advancementRequirement) {
          yield continue_ability(
            state,
            side,
            {
              prompt: "Choose one",
              "waiting-prompt": true,
              choices: ["Gain 3 [Credits]", "Draw 2 cards"],
              async: true,
              effect: effect(function* (s: State, _sd: Side, e: EID, _c: Card, choiceTargets: unknown[]): Generator<unknown, void, unknown> {
                if (choiceTargets[0] === "Draw 2 cards") coreDrawing.draw(s, "runner", e, 2);
                else coreGaining.gainCredits(s, "runner", e, 3);
              }),
            },
            card,
            null,
          );
        }
      }),
    },
    {
      event: "post-access-card",
      effect: effect(function* (_state: State, _side: Side, _eid: EID, card: Card): Generator<unknown, void, unknown> {
        card.special = { ...(card.special ?? {}), rngGuess: undefined };
      }),
    },
    {
      event: "successful-run",
      optional: {
        req: req(function* (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]): Generator<unknown, boolean, unknown> {
          const server = targetServerFromContext(targets);
          return server === "hq" || server === "rd";
        }),
        prompt: "Choose a number to secretly spend for RNG Key",
        choices: { number: 10, default: 0 },
        "yes-ability": {
          effect: effect(function* (_state: State, _side: Side, _eid: EID, card: Card, targets: unknown[]): Generator<unknown, void, unknown> {
            card.special = { ...(card.special ?? {}), rngGuess: targets[0] };
          }),
        },
      },
    },
  ],
};
export const rook: CardDef = {
  title: "Rook",
  implementation: "[Erratum] Program: Caïssa - Trojan",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      label: "Host on another ice",
      async: true,
      effect: effect(function* (state: State, side: Side, _eid: EID, card: Card): Generator<unknown, void, unknown> {
        yield continue_ability(
          state,
          side,
          {
            prompt: "Choose a piece of ice protecting any server",
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
  ],
  "static-abilities": [
    {
      type: ":rez-cost",
      req: req(function* (_state: State, _side: Side, _eid: EID, card: Card, targets: unknown[]): Generator<unknown, boolean, unknown> {
        const target = targets[0] as Card | undefined;
        return !!target && coreCard.ice(target) && !!card.host && coreCard.getZone(card.host).join("/") === coreCard.getZone(target).join("/");
      }),
      value: 2,
    },
  ],
};
