import type { Ability, Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCharge from "../core/charge";
import * as coreCostFns from "../core/cost_fns";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEid from "../core/eid";
import * as coreEngine from "../core/engine";
import * as coreExpose from "../core/expose";
import * as coreFinding from "../core/finding";
import * as coreGaining from "../core/gaining";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreLink from "../core/link";
import * as coreMark from "../core/mark";
import * as coreMemory from "../core/memory";
import * as coreMoving from "../core/moving";
import * as corePayment from "../core/payment";
import * as corePrevention from "../core/prevention";
import * as corePrompts from "../core/prompts";
import * as coreProps from "../core/props";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSabotage from "../core/sabotage";
import * as coreSay from "../core/say";
import * as coreServers from "../core/servers";
import * as coreShuffling from "../core/shuffling";
import * as coreTags from "../core/tags";
import * as coreThreat from "../core/threat";
import * as coreTrace from "../core/trace";
import * as coreVirus from "../core/virus";
import { effect, msg, req, wait_for, continue_ability } from "../macros";

function autoIcebreaker(definition: CardDef): CardDef {
  return coreDefHelpers.autoIcebreaker(definition);
}

const breakSub = coreIce.breakSub;
const strengthPump = coreIce.strengthPump;
const toC = corePayment.toC;

function toCost(type: string, amount = 1, args?: Record<string, unknown>): Record<string, unknown> {
  return toC(type, amount, args) as unknown as Record<string, unknown>;
}

function context(targets: unknown[]): Record<string, unknown> {
  const target = targets[0];
  return typeof target === "object" && target !== null
    ? (target as Record<string, unknown>)
    : {};
}

function currentIce(state: State): Card | null {
  return coreIce.getCurrentIce(state);
}

function getCounters(card: Card, counterType: string): number {
  const counters = (card.counter ?? {}) as Record<string, unknown>;
  const value = counters[counterType];
  return typeof value === "number" ? value : 0;
}

function addCounter(
  state: State,
  side: Side,
  eid: EID,
  card: Card,
  counterType: string,
  amount: number,
): void {
  coreProps.addCounter(state, side, eid, card, counterType, amount, null);
}

function runnerStack(state: State): Card[] {
  return state.runner?.deck ?? [];
}

function runnerGrip(state: State): Card[] {
  return state.runner?.hand ?? [];
}

function corpHand(state: State): Card[] {
  return state.corp?.hand ?? [];
}

function corpDeck(state: State): Card[] {
  return state.corp?.deck ?? [];
}

function trashCard(state: State, side: Side, eid: EID, card: Card): void {
  coreMoving.trash(state, side, eid, card);
}

function payAndTrash(state: State, side: Side, eid: EID, card: Card): void {
  trashCard(state, side, eid, card);
}

function targetServerFromContext(targets: unknown[]): string | undefined {
  const ctx = context(targets);
  const server = ctx.server ?? ctx["target-server"] ?? ctx.fromServer;
  if (typeof server === "string") return server.replace(/^:/, "");
  if (Array.isArray(server)) {
    const last = server[server.length - 1];
    return typeof last === "string" ? last.replace(/^:/, "") : undefined;
  }
  return undefined;
}

function isCentralServer(server: string | undefined): boolean {
  return server === "hq" || server === "rd" || server === "archives";
}

function runIces(state: State): Card[] {
  const server = state.run?.server?.[0];
  if (!server) return [];
  if (server === "hq" || server === "rd" || server === "archives") {
    return state.corp.servers[server].ices;
  }
  return state.corp.servers.remote[server]?.ices ?? [];
}

function hasSubtype(card: Card | null, subtype: string): boolean {
  return card !== null && coreCard.hasSubtype(card, subtype) !== undefined;
}

function cloudIcebreaker(definition: CardDef): CardDef {
  return {
    ...definition,
    "static-abilities": [
      ...((definition["static-abilities"] as Ability[] | undefined) ?? []),
      {
        type: ":used-mu",
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return coreLink.getLink(state) >= 2;
        }),
        value: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, number, unknown> {
          return -(card.memoryunits ?? 0);
        }),
      },
    ],
  };
}

function breakAndEnter(title: string, iceType: string): CardDef {
  return {
    title,
    ...autoIcebreaker(
      cloudIcebreaker({
        abilities: [breakSub([toC("trash-can", 1)], 3, iceType)],
        "static-abilities": [
          coreIce.breakerStrengthBonus(
            req(function* (
              state: State,
            ): Generator<unknown, number, unknown> {
              return coreBoard
                .allActiveInstalled(state, "runner")
                .filter((card) => coreCard.hasSubtype(card, "Icebreaker")).length;
            }),
            0,
          ),
        ],
      }),
    ),
  };
}

function globalSecBreaker(title: string, iceType: string): CardDef {
  return {
    title,
    ...cloudIcebreaker(
      autoIcebreaker({
        abilities: [breakSub(2, 0, iceType), strengthPump(2, 3)],
      }),
    ),
  };
}

function trashToBypass(
  title: string,
  iceType: string,
  breaker: Ability,
  pump: Ability,
): CardDef {
  return {
    title,
    ...autoIcebreaker({
      abilities: [
        breaker,
        pump,
        {
          label: `Bypass ${iceType} being encountered`,
          cost: [toC("trash-can", 1)],
          req: req(function* (state: State): Generator<unknown, boolean, unknown> {
            return coreRuns.activeEncounter(state) && hasSubtype(currentIce(state), iceType);
          }),
          msg: msg(
            "bypass ",
            (state: State) => currentIce(state)?.title ?? "encountered ice",
          ),
          effect: effect(function* (state: State): Generator<unknown, void, unknown> {
            coreRuns.bypassIce(state);
            coreRuns.runContinue(state, "runner", null);
          }),
        },
      ],
    }),
  };
}

function returnAndDerez(
  title: string,
  iceType: string,
  breaker: Ability,
  pump: Ability,
): CardDef {
  return {
    title,
    ...autoIcebreaker({
      abilities: [
        breaker,
        pump,
        {
          label: `Derez ${iceType} being encountered`,
          cost: [toC("credit", 2), toC("return-to-hand", 1)],
          req: req(function* (
            state: State,
            _side: Side,
            _eid: EID,
            card: Card,
          ): Generator<unknown, boolean, unknown> {
            const ice = currentIce(state);
            return (
              !!coreRuns.getCurrentEncounter(state) &&
              !!ice &&
              coreCard.isRezzed(ice) === true &&
              coreCard.hasSubtype(ice, iceType) !== undefined &&
              coreIce.allSubsBrokenByCard(ice, card)
            );
          }),
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
          ): Generator<unknown, void, unknown> {
            const ice = currentIce(state);
            if (ice) coreRezzing.derez(state, side, eid, ice);
          }),
        },
      ],
    }),
  };
}

function virusBreaker(title: string, iceType: string): CardDef {
  return {
    title,
    ...autoIcebreaker({
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
            coreSay.systemMsg(state, side, `places 1 virus counter on ${card.title}`);
            addCounter(state, side, eid, card, "virus", 1);
          }),
        },
      ],
      abilities: [
        breakSub([toC("any-virus-counter", 1)], 1, iceType),
        strengthPump([toCost("any-virus-counter", 1)], 1),
      ],
    }),
  };
}

function devaSwapBreaker(
  title: string,
  extraReq: (state: State, card: Card) => boolean,
): CardDef {
  return {
    title,
    ...autoIcebreaker({
      abilities: [
        breakSub(1, 1, "All", {
          req: req(function* (
            state: State,
            _side: Side,
            _eid: EID,
            card: Card,
          ): Generator<unknown, boolean, unknown> {
            return extraReq(state, card);
          }),
        }),
        strengthPump(1, 1),
        {
          req: req(function* (state: State): Generator<unknown, boolean, unknown> {
            return runnerGrip(state).some((gripCard) => coreCard.hasSubtype(gripCard, "Deva") !== undefined);
          }),
          label: "Swap with a deva program from the grip",
          cost: [toC("credit", 2)],
          prompt: `Choose a deva program to swap with ${title}`,
          choices: {
            card: (target: Card) => coreCard.inHand(target) && coreCard.hasSubtype(target, "Deva") !== undefined,
          },
          msg: msg("swap in ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "a deva program", " from the grip"),
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: unknown[],
          ): Generator<unknown, void, unknown> {
            const target = targets[0] as Card | undefined;
            if (target) coreInstalling.swapCardsAsync(state, side, eid, card, target);
          }),
        },
      ],
    }),
  };
}

export const cleaver: CardDef = {
  title: "Cleaver",
  ...autoIcebreaker({
    abilities: [breakSub(1, 2, "Barrier"), strengthPump(2, 1)],
  }),
};

export const cloak: CardDef = {
  title: "Cloak",
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
        return eid.sourceType === "ability" && coreCard.hasSubtype(targets[0] as Card, "Icebreaker") !== undefined;
      }),
      type: "recurring",
    },
  },
};

export const clot: CardDef = {
  title: "Clot",
  "static-abilities": [
    {
      type: ":cannot-score",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const ctx = context(targets);
        const card = ctx.card as Card | undefined;
        const installed = (card as unknown as Record<string, unknown> | undefined)?.installed;
        return installed === "this-turn";
      }),
      value: true,
    },
  ],
  events: [
    coreDefHelpers.trashOnPurge,
    {
      event: "corp-install",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return coreCard.agenda(context(targets).card as Card | null);
      }),
      effect: effect(function* (
        state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const installed = context(targets).card as Card | undefined;
        if (!installed) return;
        const corp = state.corp as unknown as Record<string, unknown>;
        const register = (corp.register ?? {}) as Record<string, unknown>;
        const cannotScore = (register["cannot-score"] as Card[] | undefined) ?? [];
        register["cannot-score"] = [installed, ...cannotScore];
        corp.register = register;
      }),
    },
  ],
};

export const coalescence: CardDef = {
  title: "Coalescence",
  data: { counter: { power: 2 } },
  abilities: [
    {
      cost: [toC("power", 1)],
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        return state.activePlayer === "runner";
      }),
      async: true,
      "keep-menu-open": ":while-power-tokens-left",
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

export const collectiveConsciousness: CardDef = {
  title: "Collective Consciousness",
  events: [
    {
      event: "rez",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return coreCard.isICE(context(targets).card as Card | null);
      }),
      msg: "draw 1 card",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreDrawing.draw(state, "runner", eid, 1);
      }),
    },
  ],
};

export const consume: CardDef = {
  title: "Consume",
  special: { "auto-place-counter": "always" },
  events: [
    {
      event: "runner-trash",
      "once-per-instance": true,
      async: true,
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return targets.some((target) => coreCard.corp(context([target]).card as Card | null));
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const trashedCount = targets.filter((target) =>
          coreCard.corp(context([target]).card as Card | null),
        ).length;
        if (trashedCount > 0) addCounter(state, side, eid, card, "virus", trashedCount);
      }),
    },
  ],
  abilities: [
    {
      action: true,
      "change-in-game-state": {
        req: req(function* (
          state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, boolean, unknown> {
          return coreVirus.getVirusCounters(state, card) > 0;
        }),
      },
      cost: [toC("click", 1)],
      label: "Gain 2 [Credits] for each hosted virus counter, then remove all virus counters",
      async: true,
      msg: msg(
        "gain ",
        (state: State, _side: Side, _eid: EID, card: Card) =>
          2 * coreVirus.getVirusCounters(state, card),
        " [Credits], removing hosted virus counters",
      ),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        const virusCounters = coreVirus.getVirusCounters(state, card);
        coreGaining.gainCredits(state, side, eid, 2 * virusCounters);
        card.counter = { ...(card.counter ?? {}), virus: 0 };
        for (const hivemind of coreBoard
          .allActiveInstalled(state, "runner")
          .filter((installed) => installed.title === "Hivemind")) {
          hivemind.counter = { ...(hivemind.counter ?? {}), virus: 0 };
        }
      }),
    },
    coreDefHelpers.setAutoresolve("auto-place-counter", "Consume placing virus counters on itself"),
  ],
};

export const conduit: CardDef = {
  title: "Conduit",
  special: { "auto-place-counter": "always" },
  events: [
    {
      event: "run-ends",
      optional: {
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          _card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          const ctx = context(targets);
          return ctx.successful === true && targetServerFromContext(targets) === "rd";
        }),
        "waiting-prompt": true,
        autoresolve: coreDefHelpers.getAutoresolve("auto-place-counter"),
        prompt: msg("Place 1 virus counter on ", (_state: State, _side: Side, _eid: EID, card: Card) => card.title, "?"),
        "yes-ability": {
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
      },
    },
    {
      event: "successful-run",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const ctx = context(targets);
        return targetServerFromContext(targets) === "rd" && ctx["this-card-run"] === true;
      }),
      effect: effect(function* (
        state: State,
        _side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        coreAccess.accessBonus(state, "runner", Math.max(0, coreVirus.getVirusCounters(state, card)), "rd");
      }),
    },
  ],
  abilities: [
    coreDefHelpers.runServerAbility("rd", { action: true, cost: [toC("click", 1)] }),
    coreDefHelpers.setAutoresolve("auto-place-counter", "Conduit placing virus counters on itself"),
  ],
};

export const copycat: CardDef = {
  title: "Copycat",
  abilities: [
    {
      async: true,
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        const ice = currentIce(state);
        return !!state.run && !!ice && coreCard.rezzed(ice);
      }),
      prompt: msg(
        "Choose a rezzed copy of ",
        (state: State) => currentIce(state)?.title ?? "encountered ice",
      ),
      choices: {
        req: req(function* (
          state: State,
          _side: Side,
          _eid: EID,
          _card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          const target = targets[0] as Card | undefined;
          const ice = currentIce(state);
          return !!target && !!ice && coreCard.rezzed(target) && coreCard.isICE(target) && target.title === ice.title;
        }),
      },
      msg: "redirect the run",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const target = targets[0] as Card | undefined;
        if (!target || !state.run) return;
        const zone = coreCard.getZone(target);
        const server = zone.length > 1 ? zone[1] : undefined;
        const index = typeof target.index === "number" ? target.index : 0;
        state.run.position = index;
        if (server) state.run.server = [server];
        payAndTrash(state, side, eid, card);
        coreIce.setCurrentIce(state);
      }),
    },
  ],
};

export const cordyceps: CardDef = {
  title: "Cordyceps",
  data: { counter: { virus: 2 } },
  events: [
    {
      event: "successful-run",
      skippable: true,
      interactive: req(function* (): Generator<unknown, boolean, unknown> {
        return true;
      }),
      optional: {
        req: req(function* (
          state: State,
          _side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return (
            isCentralServer(targetServerFromContext(targets)) &&
            coreVirus.getVirusCounters(state, card) > 0 &&
            runIces(state).length > 0 &&
            coreBoard.allInstalled(state, "corp").filter(coreCard.isICE).length >= 2
          );
        }),
        once: "per-turn",
        prompt: "Swap 2 pieces of ice?",
        "yes-ability": {
          prompt: "Choose a piece of ice protecting this server",
          choices: {
            req: req(function* (
              state: State,
              _side: Side,
              _eid: EID,
              _card: Card,
              targets: unknown[],
            ): Generator<unknown, boolean, unknown> {
              const target = targets[0] as Card | undefined;
              return !!target && coreCard.installed(target) && coreCard.isICE(target) && coreServers.targetServer(state.run) === coreCard.getZone(target)[1];
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
            const firstIce = targets[0] as Card | undefined;
            if (!firstIce) return;
            yield continue_ability(
              state,
              side,
              {
                prompt: "Choose a piece of ice to swap with",
                choices: {
                  req: req(function* (
                    _state: State,
                    _side: Side,
                    _eid: EID,
                    _card: Card,
                    secondTargets: unknown[],
                  ): Generator<unknown, boolean, unknown> {
                    const target = secondTargets[0] as Card | undefined;
                    return !!target && coreCard.installed(target) && coreCard.isICE(target) && target.cid !== firstIce.cid;
                  }),
                },
                msg: msg(
                  "swap the positions of ",
                  () => firstIce.title,
                  " and ",
                  (_state: State, _side: Side, _eid: EID, _card: Card, secondTargets: unknown[]) =>
                    (secondTargets[0] as Card | undefined)?.title ?? "ice",
                ),
                async: true,
                effect: effect(function* (
                  innerState: State,
                  innerSide: Side,
                  innerEid: EID,
                  innerCard: Card,
                  secondTargets: unknown[],
                ): Generator<unknown, void, unknown> {
                  const secondIce = secondTargets[0] as Card | undefined;
                  if (!secondIce) return;
                  coreMoving.swapIce(innerState, innerSide, firstIce, secondIce);
                  addCounter(innerState, innerSide, innerEid, innerCard, "virus", -1);
                }),
              },
              card,
              null,
            );
          }),
        },
      },
    },
  ],
};

export const corroder: CardDef = {
  title: "Corroder",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Barrier"), strengthPump(1, 1)],
  }),
};

export const corsair: CardDef = {
  title: "Corsair",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Barrier"),
      {
        label: "Give -3 strength to encountered Barrier",
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return coreRuns.activeEncounter(state) && hasSubtype(currentIce(state), "Barrier");
        }),
        "keep-menu-open": true,
        msg: msg("give -3 strength to ", (state: State) => currentIce(state)?.title ?? "ice"),
        effect: effect(function* (state: State, side: Side): Generator<unknown, void, unknown> {
          const ice = currentIce(state);
          if (ice) coreIce.pumpIce(state, side, ice, -3);
        }),
        cost: [toC("credit", 1, { stealth: "all-stealth" })],
      },
    ],
  }),
};

export const cradle: CardDef = {
  title: "Cradle",
  ...autoIcebreaker({
    abilities: [breakSub(2, 0, "Code Gate")],
    "static-abilities": [
      coreIce.breakerStrengthBonus(
        req(function* (state: State): Generator<unknown, number, unknown> {
          return -(state.runner?.hand?.length ?? 0);
        }),
        0,
      ),
    ],
  }),
};

export const creeper: CardDef = {
  title: "Creeper",
  ...cloudIcebreaker(
    autoIcebreaker({
      abilities: [breakSub(2, 1, "Sentry"), strengthPump(1, 1)],
    }),
  ),
};

export const crescentus: CardDef = {
  title: "Crescentus",
  abilities: [
    {
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        const ice = currentIce(state);
        return !!coreRuns.getCurrentEncounter(state) && !!ice && coreCard.rezzed(ice) && coreIce.allSubsBroken(ice);
      }),
      label: "derez an ice",
      cost: [toC("trash-can", 1)],
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        const ice = currentIce(state);
        if (ice) coreRezzing.derez(state, side, eid, ice);
      }),
    },
  ],
};

export const crowbar: CardDef = breakAndEnter("Crowbar", "Code Gate");

export const crypsis: CardDef = {
  title: "Crypsis",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "All"),
      strengthPump(1, 1),
      {
        action: true,
        cost: [toC("click", 1)],
        "keep-menu-open": ":while-clicks-left",
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
        msg: msg(
          (_state: State, _side: Side, _eid: EID, card: Card) =>
            getCounters(card, "virus") > 0 ? "remove 1 hosted virus counter" : "trash itself",
        ),
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<unknown, void, unknown> {
          if (getCounters(card, "virus") > 0) {
            addCounter(state, side, eid, card, "virus", -1);
          } else {
            trashCard(state, side, eid, card);
          }
        }),
      },
    ],
  }),
};

export const cupellation: CardDef = {
  title: "Cupellation",
  events: [
    {
      event: "end-breach-server",
      interactive: req(function* (): Generator<unknown, boolean, unknown> {
        return true;
      }),
      req: req(function* (
        state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const fromServer = context(targets).fromServer;
        return (
          fromServer === "archives" &&
          state.corp.discard.some((discarded) => discarded.seen === true && !coreCard.agenda(discarded)) &&
          !(card.hosted ?? []).some(coreCard.corp)
        );
      }),
      prompt: "1 [Credits]: Host a card from archives?",
      choices: {
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          _card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          const target = targets[0] as Card | undefined;
          return !!target && target.seen === true && !coreCard.agenda(target);
        }),
      },
      cost: [toC("credit", 1)],
      msg: msg("host ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "a card", " on itself"),
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const target = targets[0] as Card | undefined;
        if (target) coreHosting.host(state, side, card, { ...target, seen: true, installed: false });
      }),
    },
    {
      event: "breach-server",
      automatic: "pre-breach",
      async: true,
      optional: {
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return context(targets).server === "hq" && (card.hosted ?? []).some(coreCard.corp);
        }),
        prompt: "1 [Credits]: Trash this program to access 2 additional cards from HQ?",
        "yes-ability": {
          async: true,
          effect: effect(function* (state: State): Generator<unknown, void, unknown> {
            coreAccess.accessBonus(state, "runner", 2, "hq");
          }),
          cost: [toC("credit", 1), toC("trash-can", 1)],
          msg: "access 2 additional cards from HQ",
        },
      },
    },
  ],
  interactions: {
    "access-ability": {
      label: "Host card",
      trash: false,
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const target = targets[0] as Card | undefined;
        return !!target && !(card.hosted ?? []).some(coreCard.corp) && !coreCard.agenda(target);
      }),
      cost: [toC("credit", 1)],
      msg: msg("host ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "a card", " on itself"),
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const target = targets[0] as Card | undefined;
        if (target) coreHosting.host(state, side, card, { ...target, seen: true, installed: false });
        const stateRecord = state as unknown as Record<string, unknown>;
        delete stateRecord.access;
      }),
    },
  },
};

export const curupira: CardDef = {
  title: "Curupira",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Barrier"), strengthPump(1, 1)],
    interactive: req(function* (): Generator<unknown, boolean, unknown> {
      return true;
    }),
    events: [
      {
        event: "encounter-ice",
        skippable: true,
        optional: {
          prompt: msg("Spend 3 power counters to bypass ", (state: State) => currentIce(state)?.title ?? "encountered ice", "?"),
          "waiting-prompt": true,
          req: req(function* (
            state: State,
            _side: Side,
            _eid: EID,
            card: Card,
            targets: unknown[],
          ): Generator<unknown, boolean, unknown> {
            const ice = (context(targets).ice as Card | undefined) ?? currentIce(state);
            return !!ice && coreCard.hasSubtype(ice, "Barrier") !== undefined && getCounters(card, "power") >= 3;
          }),
          "yes-ability": {
            cost: [toC("power", 3)],
            msg: msg("bypass ", (state: State) => currentIce(state)?.title ?? "encountered ice"),
            effect: effect(function* (state: State): Generator<unknown, void, unknown> {
              coreRuns.bypassIce(state);
            }),
          },
        },
      },
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

export const customizedSecretary: CardDef = {
  title: "Customized Secretary",
  "on-install": {
    async: true,
    interactive: req(function* (): Generator<unknown, boolean, unknown> {
      return true;
    }),
    msg: msg("reveal the top 5 cards of the stack"),
    "waiting-prompt": true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<unknown, void, unknown> {
      const cards = runnerStack(state).slice(0, 5);
      coreRevealing.reveal(state, side, eid, cards);
      const programs = cards.filter(coreCard.program);
      if (programs.length > 0) {
        yield continue_ability(
          state,
          side,
          {
            prompt: "Choose a program to host",
            choices: [...programs, "Done"],
            async: true,
            effect: effect(function* (
              innerState: State,
              innerSide: Side,
              innerEid: EID,
              innerCard: Card,
              targets: unknown[],
            ): Generator<unknown, void, unknown> {
              const target = targets[0];
              if (typeof target !== "string") {
                coreHosting.host(innerState, innerSide, innerCard, target as Card);
              }
              coreShuffling.shuffle(innerState, innerSide, "deck");
              coreEid.effectCompleted(innerState, innerSide, innerEid);
            }),
          },
          card,
          null,
        );
      } else {
        coreShuffling.shuffle(state, side, "deck");
      }
    }),
  },
  abilities: [
    {
      action: true,
      cost: [toC("click", 1)],
      "keep-menu-open": ":while-clicks-left",
      label: "Install a hosted program",
      prompt: "Choose a program to install",
      choices: {
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          const target = targets[0] as Card | undefined;
          return !!target && (card.hosted ?? []).some((hosted) => hosted.cid === target.cid);
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
        if (target) coreInstalling.runnerInstall(state, side, eid, target, { msgKeys: { installSource: card, includeCostFromEid: eid } });
      }),
    },
  ],
};

export const cyberCypher: CardDef = {
  title: "Cyber-Cypher",
  ...autoIcebreaker({
    "on-install": {
      prompt: "Choose a server",
      msg: msg("target ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => String(targets[0] ?? "")),
      choices: req(function* (state: State): Generator<unknown, string[], unknown> {
        return Object.keys(state.corp.servers.remote).concat(["hq", "rd", "archives"]);
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
    "leave-play": effect(function* (
      _state: State,
      _side: Side,
      _eid: EID,
      card: Card,
    ): Generator<unknown, void, unknown> {
      delete (card as unknown as Record<string, unknown>).cardTarget;
    }),
    abilities: [
      breakSub(1, 1, "Code Gate", {
        req: req(function* (
          state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, boolean, unknown> {
          const target = (card as unknown as Record<string, unknown>).cardTarget;
          return !target || String(target).replace(/^:/, "") === coreServers.targetServer(state);
        }),
      }),
      strengthPump(1, 1, "end-of-encounter", {
        req: req(function* (
          state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, boolean, unknown> {
          const target = (card as unknown as Record<string, unknown>).cardTarget;
          return !target || String(target).replace(/^:/, "") === coreServers.targetServer(state);
        }),
      }),
    ],
  }),
};

export const d4v1d: CardDef = {
  title: "D4v1d",
  ...autoIcebreaker({
    data: { counter: { power: 3 } },
    abilities: [
      breakSub([toC("power", 1)], 1, "All", {
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          const ice = currentIce(state);
          return !!ice && coreIce.getStrength(ice) >= 5;
        }),
      }),
    ],
  }),
};

export const dagger: CardDef = {
  title: "Dagger",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "Sentry"),
      strengthPump([toCost("credit", 1, { stealth: 1 })], 5, "end-of-encounter"),
    ],
  }),
};

export const daiV: CardDef = {
  title: "Dai V",
  ...autoIcebreaker({
    abilities: [
      breakSub([toC("credit", 2, { stealth: "all-stealth" })], 0, "All", { all: true }),
      strengthPump(1, 1),
    ],
  }),
};

export const darwin: CardDef = {
  title: "Darwin",
  ...autoIcebreaker({
    flags: {
      "runner-phase-12": req(function* (): Generator<unknown, boolean, unknown> {
        return true;
      }),
    },
    "x-fn": req(function* (
      state: State,
      _side: Side,
      _eid: EID,
      card: Card,
    ): Generator<unknown, number, unknown> {
      return coreVirus.getVirusCounters(state, card);
    }),
    abilities: [
      breakSub(2, 1),
      {
        label: "Place 1 virus counter (start of turn)",
        once: "per-turn",
        cost: [toC("credit", 1)],
        msg: "place 1 virus counter on itself",
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
          addCounter(state, side, eid, card, "virus", 1);
        }),
      },
    ],
    "static-abilities": [
      coreIce.breakerStrengthBonus(
        req(function* (
          state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, number, unknown> {
          return coreVirus.getVirusCounters(state, card);
        }),
        0,
      ),
    ],
  }),
};

export const datasucker: CardDef = {
  title: "Datasucker",
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
        return isCentralServer(targetServerFromContext(targets));
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
  abilities: [
    {
      cost: [toC("virus", 1)],
      label: "Give -1 strength to current piece of ice",
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        const ice = currentIce(state);
        return !!ice && coreCard.rezzed(ice) && !!coreRuns.getCurrentEncounter(state);
      }),
      "keep-menu-open": ":while-virus-tokens-left",
      msg: msg("give -1 strength to ", (state: State) => currentIce(state)?.title ?? "ice"),
      effect: effect(function* (state: State, side: Side): Generator<unknown, void, unknown> {
        const ice = currentIce(state);
        if (ice) coreIce.pumpIce(state, side, ice, -1);
      }),
    },
  ],
};
export const daVinci: CardDef = {
  title: "DaVinci",
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
        addCounter(state, side, eid, card, "power", 1);
      }),
    },
  ],
  abilities: [
    {
      req: req(function* (state: State, side: Side, eid: EID, card: Card): Generator<unknown, boolean, unknown> {
        return runnerGrip(state).some(
          (gripCard) =>
            (coreCard.hardware(gripCard) || coreCard.program(gripCard) || coreCard.resource(gripCard)) &&
            getCounters(card, "power") >= coreCostFns.installCost(state, side, gripCard),
        );
      }),
      label: "install a card from the grip",
      cost: [toC("trash-can", 1)],
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
            "waiting-prompt": true,
            prompt: "Choose a card to install",
            choices: {
              req: req(function* (
                innerState: State,
                innerSide: Side,
                _innerEid: EID,
                _innerCard: Card,
                targets: unknown[],
              ): Generator<unknown, boolean, unknown> {
                const target = targets[0] as Card | undefined;
                return (
                  !!target &&
                  coreCard.inHand(target) &&
                  (coreCard.hardware(target) || coreCard.program(target) || coreCard.resource(target)) &&
                  coreCostFns.installCost(innerState, innerSide, target) <= getCounters(card, "power")
                );
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
              if (target) coreInstalling.runnerInstall(innerState, innerSide, innerEid, target, { ignoreInstallCost: true, msgKeys: { installSource: card, includeCostFromEid: eid, displayOrigin: true } });
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};
export const deepThought: CardDef = {
  title: "Deep Thought",
  events: [
    {
      event: "successful-run",
      silent: true,
      async: true,
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return targetServerFromContext(targets) === "rd";
      }),
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
      event: "runner-turn-begins",
      req: req(function* (
        state: State,
        _side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, boolean, unknown> {
        return coreVirus.getVirusCounters(state, card) >= 3;
      }),
      msg: "look at the top card of R&D",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        const topCard = corpDeck(state)[0];
        yield continue_ability(
          state,
          side,
          {
            prompt: `The top card of R&D is ${topCard?.title ?? "unknown"}`,
            choices: ["OK"],
          },
          card,
          null,
        );
      }),
    },
  ],
};

export const demara: CardDef = trashToBypass(
  "Demara",
  "Barrier",
  breakSub(2, 2, "Barrier"),
  strengthPump(2, 3),
);
export const deusX: CardDef = {
  title: "Deus X",
  prevention: [
    {
      prevents: "damage",
      type: "ability",
      ability: {
        ...corePrevention.preventUpToNDamage("all", ["net"]),
        cost: [toC("trash-can", 1)],
      },
    },
  ],
  abilities: [breakSub([toC("trash-can", 1)], 0, "AP")],
};
export const devadattaDrone: CardDef = {
  title: "Devadatta Drone",
  data: { counter: { power: 2 } },
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
        autoresolve: coreDefHelpers.getAutoresolve("auto-fire"),
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
  abilities: [coreDefHelpers.setAutoresolve("auto-fire", "Devadatta Drone")],
};

export const dhegdheer: CardDef = {
  title: "Dhegdheer",
  implementation: "Discount not considered by every engine check for whether a program is playable",
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
      "cost-bonus": -1,
      "max-cards": 1,
    },
  ],
};
export const disrupter: CardDef = {
  title: "Disrupter",
  events: [
    {
      event: "initialize-trace",
      fakeCost: [toC("trash-can", 1)],
      optional: {
        "waiting-prompt": true,
        prompt: "Trash Disrupter to reduce the base trace strength to 0?",
        "yes-ability": {
          cost: [toC("trash-can", 1)],
          effect: effect(function* (state: State): Generator<unknown, void, unknown> {
            coreTrace.forceBase(state, 0);
          }),
        },
      },
    },
  ],
};

export const diwan: CardDef = {
  title: "Diwan",
  "on-install": {
    prompt: "Choose a server",
    choices: req(function* (state: State): Generator<unknown, string[], unknown> {
      return Object.keys(state.corp.servers.remote).concat(["hq", "rd", "archives"]);
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
  "static-abilities": [
    {
      type: ":install-cost",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const installInfo = targets[1] as Record<string, unknown> | undefined;
        return installInfo?.server === (card as unknown as Record<string, unknown>).cardTarget;
      }),
      value: 1,
    },
  ],
  events: [coreDefHelpers.trashOnPurge],
};

export const djinn: CardDef = {
  title: "Djinn",
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
        return (
          (target?.memoryunits ?? 0) <= 3 &&
          coreCard.hasSubtype(target, "Icebreaker") === undefined &&
          coreCard.program(target)
        );
      }),
      "no-mu": true,
      "max-mu": 3,
    },
  ],
  abilities: [
    {
      ...coreDefHelpers.tutorAbi(true, (card: Card) => coreCard.program(card) && coreCard.hasSubtype(card, "Virus") !== undefined),
      action: true,
      label: "Search the stack for a virus program and add it to the grip",
      cost: [toC("click", 1), toC("credit", 1)],
      "keep-menu-open": ":while-clicks-left",
    },
  ],
};
export const eater: CardDef = {
  title: "Eater",
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, "All", {
        additionalAbility: {
          msg: "access not more than 0 cards for the remainder of this run",
          effect: effect(function* (state: State): Generator<unknown, void, unknown> {
            coreAccess.maxAccess(state, 0);
          }),
        },
        label: "break 1 subroutine and access 0 cards",
      }),
      strengthPump(1, 1),
    ],
  }),
};

export const echelon: CardDef = {
  title: "Echelon",
  ...autoIcebreaker({
    "static-abilities": [
      coreIce.breakerStrengthBonus(
        req(function* (state: State): Generator<unknown, number, unknown> {
          return coreBoard
            .allActiveInstalled(state, "runner")
            .filter((card) => coreCard.program(card) && coreCard.hasSubtype(card, "Icebreaker") !== undefined).length;
        }),
        0,
      ),
    ],
    abilities: [breakSub(1, 1, "Sentry"), strengthPump(3, 2)],
  }),
};
export const egret: CardDef = {
  title: "Egret",
  implementation: "[Erratum] Program: Trojan",
  "on-install": {
    msg: msg("make ", (_state: State, _side: Side, _eid: EID, card: Card) => card.host?.title ?? "hosted ice", " gain Barrier, Code Gate and Sentry subtypes"),
  },
  "static-abilities": [
    {
      type: ":gain-subtype",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return (targets[0] as Card | undefined)?.cid === card.host?.cid;
      }),
      value: ["Barrier", "Code Gate", "Sentry"],
    },
  ],
};
export const endlessHunger: CardDef = {
  title: "Endless Hunger",
  implementation: "ETR restriction not implemented by the converted break-sub helper",
  abilities: [
    breakSub([toC("trash-installed", 1)], 1, "All", {
      label: 'break 1 "[Subroutine] End the run." subroutine',
    }),
  ],
};

export const engolo: CardDef = {
  title: "Engolo",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Code Gate"), strengthPump(2, 4)],
    events: [
      {
        event: "encounter-ice",
        skippable: true,
        req: req(function* (
          state: State,
        ): Generator<unknown, boolean, unknown> {
          const ice = currentIce(state);
          return !!ice && coreCard.hasSubtype(ice, "Code Gate") === undefined;
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
                prompt: `Pay 2 [Credits] to make ${ice.title} gain Code Gate?`,
                "yes-ability": {
                  cost: [toC("credit", 2)],
                  msg: msg("make ", () => ice.title, " gain Code Gate"),
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
                      () => "Code Gate",
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
export const equivocation: CardDef = {
  title: "Equivocation",
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
      interactive: req(function* (): Generator<unknown, boolean, unknown> {
        return true;
      }),
      "waiting-prompt": true,
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
            optional: {
              prompt: "Reveal the top card of R&D?",
              "yes-ability": {
                async: true,
                effect: effect(function* (
                  innerState: State,
                  innerSide: Side,
                  innerEid: EID,
                  innerCard: Card,
                ): Generator<unknown, void, unknown> {
                  const topCard = corpDeck(innerState)[0];
                  if (!topCard) return;
                  coreRevealing.reveal(innerState, innerSide, innerEid, topCard);
                  coreSay.systemMsg(innerState, innerSide, `reveals ${topCard.title} from the top of R&D`);
                  yield continue_ability(
                    innerState,
                    innerSide,
                    {
                      optional: {
                        prompt: `Force the Corp to draw ${topCard.title}?`,
                        "yes-ability": {
                          async: true,
                          effect: effect(function* (s: State, _sd: Side, e: EID): Generator<unknown, void, unknown> {
                            coreSay.systemMsg(s, "corp", `is forced to draw ${topCard.title}`);
                            coreDrawing.draw(s, "corp", e, 1);
                          }),
                        },
                      },
                    },
                    innerCard,
                    null,
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
};
export const euler: CardDef = {
  title: "Euler",
  ...autoIcebreaker({
    abilities: [
      breakSub(0, 1, "Code Gate", {
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, boolean, unknown> {
          return (card as unknown as Record<string, unknown>).installed === "this-turn";
        }),
      }),
      breakSub(2, 2, "Code Gate"),
      strengthPump(1, 1),
    ],
  }),
};

export const eXer: CardDef = {
  title: "eXer",
  events: [coreDefHelpers.breachAccessBonus("rd", 1), coreDefHelpers.trashOnPurge],
};
export const expertScheduleAnalyzer: CardDef = {
  title: "Expert Schedule Analyzer",
  abilities: [
    coreDefHelpers.runServerAbility("hq", {
      action: true,
      cost: [toC("click", 1)],
      events: [
        coreRuns.successfulRunReplaceBreach({
          "target-server": "hq",
          duration: "end-of-run",
          ability: {
            msg: "reveal cards from HQ",
            async: true,
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
            ): Generator<unknown, void, unknown> {
              coreRevealing.reveal(state, side, eid, corpHand(state));
            }),
          },
        }),
      ],
    }),
  ],
};
export const faerie: CardDef = {
  title: "Faerie",
  ...autoIcebreaker({
    abilities: [breakSub(0, 1, "Sentry"), strengthPump(1, 1)],
    events: [
      {
        event: "end-of-encounter",
        async: true,
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return coreIce.anySubsBrokenByCard(context(targets).ice as Card, card);
        }),
        msg: msg("trash ", (_state: State, _side: Side, _eid: EID, card: Card) => card.title),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<unknown, void, unknown> {
          trashCard(state, side, eid, card);
        }),
      },
    ],
  }),
};
export const falseEcho: CardDef = {
  title: "False Echo",
  events: [
    {
      event: "pass-ice",
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
        prompt: msg("Trash False Echo to make the Corp rez the passed piece of ice or add it to HQ?"),
        "yes-ability": {
          async: true,
          msg: "force the Corp to either rez the passed piece of ice or add it to HQ",
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: unknown[],
          ): Generator<unknown, void, unknown> {
            const ice = context(targets).ice as Card | undefined;
            trashCard(state, side, eid, card);
            if (!ice) return;
            yield continue_ability(
              state,
              side,
              {
                async: true,
                prompt: "Choose one",
                "waiting-prompt": true,
                player: "corp",
                choices: [`Rez ${ice.title}`, `Add ${ice.title} to HQ`],
                effect: effect(function* (innerState: State, innerSide: Side, innerEid: EID, _innerCard: Card, choiceTargets: unknown[]): Generator<unknown, void, unknown> {
                  if (choiceTargets[0] === `Rez ${ice.title}`) {
                    coreRezzing.rez(innerState, innerSide, innerEid, ice);
                  } else {
                    coreSay.systemMsg(innerState, "corp", "adds the passed piece of ice to HQ");
                    coreMoving.move(innerState, "corp", ice, "hand");
                    coreEid.effectCompleted(innerState, innerSide, innerEid);
                  }
                }),
              },
              card,
              targets[0],
            );
          }),
        },
      },
    },
  ],
};
export const faust: CardDef = {
  title: "Faust",
  abilities: [
    breakSub([toC("trash-from-hand", 1)], 1),
    strengthPump([toCost("trash-from-hand", 1)], 2),
  ],
};

export const fawkes: CardDef = {
  title: "Fawkes",
  abilities: [
    breakSub(1, 1, "Sentry"),
    {
      label: "+X strength for the remainder of the run (using at least 1 stealth [Credits])",
      cost: [toC("x-credits", 0, { stealth: 1 })],
      prompt: "How many credits do you want to spend?",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        const paid = Number((eid as unknown as Record<string, unknown>)["x-credits"] ?? 0);
        coreIce.pump(state, side, card, paid, "end-of-run");
      }),
      msg: msg(
        "increase strength by ",
        (_state: State, _side: Side, eid: EID) => Number((eid as unknown as Record<string, unknown>)["x-credits"] ?? 0),
        " for the remainder of the run",
      ),
    },
  ],
};
export const femmeFatale: CardDef = {
  title: "Femme Fatale",
  ...autoIcebreaker({
    "on-install": {
      prompt: "Choose a piece of ice to target for bypassing",
      choices: { card: (target: Card) => coreCard.ice(target) },
      msg: msg("target ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "ice"),
      effect: effect(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        card.special = { ...(card.special ?? {}), femme: targets[0] };
      }),
    },
    "static-abilities": [
      {
        type: ":icon",
        req: req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
          targets: unknown[],
        ): Generator<unknown, boolean, unknown> {
          return (card.special?.femme as Card | undefined)?.cid === (targets[0] as Card | undefined)?.cid;
        }),
        value: "FF",
      },
    ],
    events: [
      {
        event: "encounter-ice",
        skippable: true,
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
          return (card.special?.femme as Card | undefined)?.cid === (context(targets).ice as Card | undefined)?.cid;
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
          const cost = ice?.subroutines?.length ?? 0;
          if (!ice) return;
          yield continue_ability(
            state,
            side,
            {
              optional: {
                prompt: `Pay ${cost} [Credits] to bypass ${ice.title}?`,
                "yes-ability": {
                  cost: [toC("credit", cost)],
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
    abilities: [breakSub(1, 1, "Sentry"), strengthPump(2, 1)],
  }),
};
export const fermenter: CardDef = {
  title: "Fermenter",
  data: { counter: { virus: 1 } },
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
      "change-in-game-state": {
        req: req(function* (
          state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, boolean, unknown> {
          return coreVirus.getVirusCounters(state, card) > 0;
        }),
      },
      cost: [toC("click", 1), toC("trash-can", 1)],
      label: "Gain 2 [Credits] for each hosted virus counter",
      msg: msg(
        "gain ",
        (state: State, _side: Side, _eid: EID, card: Card) =>
          2 * coreVirus.getVirusCounters(state, card),
        " [Credits]",
      ),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        coreGaining.gainCredits(state, side, eid, 2 * coreVirus.getVirusCounters(state, card));
      }),
    },
  ],
};
export const flashbang: CardDef = {
  title: "Flashbang",
  ...autoIcebreaker({
    abilities: [
      {
        label: "Derez a Sentry being encountered",
        cost: [toC("credit", 6)],
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return !!coreRuns.getCurrentEncounter(state) && hasSubtype(currentIce(state), "Sentry");
        }),
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
        ): Generator<unknown, void, unknown> {
          const ice = currentIce(state);
          if (ice) coreRezzing.derez(state, side, eid, ice);
        }),
      },
      strengthPump(1, 1),
    ],
  }),
};
export const fluxCapacitor: CardDef = {
  title: "Flux Capacitor",
  events: [
    {
      event: "subroutines-broken",
      once: "per-encounter",
      async: true,
      req: req(function* (
        state: State,
        _side: Side,
        _eid: EID,
        card: Card,
      ): Generator<unknown, boolean, unknown> {
        return currentIce(state)?.cid === card.host?.cid;
      }),
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
};
export const forceOfNature: CardDef = {
  title: "Force of Nature",
  ...autoIcebreaker({
    abilities: [breakSub(2, 2, "Code Gate"), strengthPump(1, 1)],
  }),
};

export const garrote: CardDef = {
  title: "Garrote",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Sentry"), strengthPump(1, 1)],
  }),
};

export const gauss: CardDef = {
  title: "Gauss",
  ...autoIcebreaker({
    "static-abilities": [
      coreIce.breakerStrengthBonus(
        req(function* (
          _state: State,
          _side: Side,
          _eid: EID,
          card: Card,
        ): Generator<unknown, boolean, unknown> {
          return (card as unknown as Record<string, unknown>).installed === "this-turn";
        }),
        3,
      ),
    ],
    abilities: [breakSub(1, 1, "Barrier"), strengthPump(2, 2)],
  }),
};

export const gingerbread: CardDef = {
  title: "Gingerbread",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Tracer"), strengthPump(2, 3)],
  }),
};
export const godOfWar: CardDef = {
  title: "God of War",
  ...autoIcebreaker({
    flags: {
      "runner-phase-12": req(function* (): Generator<unknown, boolean, unknown> {
        return true;
      }),
    },
    events: [
      {
        event: "runner-turn-begins",
        skippable: true,
        interactive: req(function* (): Generator<unknown, boolean, unknown> {
          return true;
        }),
        optional: {
          prompt: "Take 1 tag: Place 2 virus counters on God of War",
          req: req(function* (): Generator<unknown, boolean, unknown> {
            return true;
          }),
          "yes-ability": {
            label: "Take 1 tag to place 2 virus counters (start of turn)",
            cost: [toC("gain-tag", 1)],
            once: "per-turn",
            async: true,
            msg: msg("place 2 virus counters on ", (_state: State, _side: Side, _eid: EID, card: Card) => card.title),
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
            ): Generator<unknown, void, unknown> {
              addCounter(state, side, eid, card, "virus", 2);
            }),
          },
        },
      },
    ],
    abilities: [
      breakSub([toC("virus", 1)], 1),
      strengthPump(2, 1),
      {
        label: "Take 1 tag to place 2 virus counters (start of turn)",
        cost: [toC("gain-tag", 1)],
        once: "per-turn",
        async: true,
        msg: msg("place 2 virus counters on ", (_state: State, _side: Side, _eid: EID, card: Card) => card.title),
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
  }),
};
export const golden: CardDef = returnAndDerez(
  "Golden",
  "Sentry",
  breakSub(2, 2, "Sentry"),
  strengthPump(2, 4),
);

export const gordianBlade: CardDef = {
  title: "Gordian Blade",
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, "Code Gate"), strengthPump(1, 1, "end-of-run")],
  }),
};
export const gormanDripV1: CardDef = {
  title: "Gorman Drip v1",
  events: [
    {
      event: "corp-credit-gain",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        return context(targets).action === "corp-click-credit";
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
      event: "corp-click-draw",
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
      label: "Gain credits",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<unknown, void, unknown> {
        coreGaining.gainCredits(state, side, eid, coreVirus.getVirusCounters(state, card));
      }),
      msg: msg("gain ", (state: State, _side: Side, _eid: EID, card: Card) => coreVirus.getVirusCounters(state, card), " [Credits]"),
    },
  ],
};
export const gourmand: CardDef = {
  title: "Gourmand",
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
        return !!target && !coreCard.agenda(target) && !coreCard.inDiscard(target);
      }),
      cost: [toC("trash-can", 1)],
      msg: msg("trash ", (_state: State, _side: Side, _eid: EID, _card: Card, targets: unknown[]) => (targets[0] as Card | undefined)?.title ?? "card"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const target = targets[0] as Card | undefined;
        if (target) coreMoving.trash(state, side, eid, { ...target, seen: true }, { accessed: true, causeCard: card });
        coreDrawing.draw(state, side, eid, 1);
      }),
    },
  },
};
export const grapplingHook: CardDef = {
  title: "Grappling Hook",
  abilities: [
    {
      label: "break all but 1 subroutine",
      req: req(function* (state: State): Generator<unknown, boolean, unknown> {
        const ice = currentIce(state);
        return coreRuns.activeEncounter(state) && (ice?.subroutines ?? []).filter((sub) => sub.broken !== true).length > 1;
      }),
      break: 1,
      breaks: "All",
      breakCost: [toC("trash-can", 1)],
      cost: [toC("trash-can", 1)],
      prompt: "Choose the subroutine to NOT break",
      choices: req(function* (state: State): Generator<unknown, string[], unknown> {
        return (currentIce(state)?.subroutines ?? [])
          .filter((sub) => sub.broken !== true)
          .map((sub) => sub.label ?? String(sub.index ?? ""));
      }),
      msg: "break all but 1 subroutine",
      async: true,
      effect: effect(function* (
        state: State,
        _side: Side,
        _eid: EID,
        card: Card,
        targets: unknown[],
      ): Generator<unknown, void, unknown> {
        const ice = currentIce(state);
        const keepLabel = String(targets[0] ?? "");
        if (!ice) return;
        for (const sub of ice.subroutines ?? []) {
          if ((sub.label ?? String(sub.index ?? "")) !== keepLabel) coreIce.breakSubroutine(ice, sub, card);
        }
      }),
    },
  ],
};
export const gravedigger: CardDef = {
  title: "Gravedigger",
  events: [
    {
      event: "runner-trash",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const trashed = context(targets).card as Card | null;
        return coreCard.installed(trashed) && coreCard.corp(trashed);
      }),
      msg: msg("place 1 virus counter on ", (_state: State, _side: Side, _eid: EID, card: Card) => card.title),
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
      event: "corp-trash",
      req: req(function* (
        _state: State,
        _side: Side,
        _eid: EID,
        _card: Card,
        targets: unknown[],
      ): Generator<unknown, boolean, unknown> {
        const trashed = context(targets).card as Card | null;
        return coreCard.installed(trashed) && coreCard.corp(trashed);
      }),
      msg: msg("place 1 virus counter on ", (_state: State, _side: Side, _eid: EID, card: Card) => card.title),
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
      async: true,
      cost: [toC("click", 1), toC("virus", 1)],
      "change-in-game-state": {
        req: req(function* (state: State): Generator<unknown, boolean, unknown> {
          return corpDeck(state).length > 0;
        }),
      },
      "keep-menu-open": ":while-virus-tokens-left",
      msg: "force the Corp to trash the top card of R&D",
      effect: effect(function* (
        state: State,
        _side: Side,
        eid: EID,
      ): Generator<unknown, void, unknown> {
        coreMoving.mill(state, "corp", eid, "corp", 1, { cause: "forced-to-trash" });
      }),
    },
  ],
};
export const gSShermanM3: CardDef = globalSecBreaker("GS Sherman M3", "Barrier");
export const gSShrikeM2: CardDef = globalSecBreaker("GS Shrike M2", "Sentry");
export const gSStrikerM1: CardDef = globalSecBreaker("GS Striker M1", "Code Gate");
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
              return corpDeck(state).slice(0, 3);
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
