import type { Ability, Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCostFns from "../core/cost_fns";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEid from "../core/eid";
import * as coreGaining from "../core/gaining";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreMoving from "../core/moving";
import * as corePrevention from "../core/prevention";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreServers from "../core/servers";
import * as coreShuffling from "../core/shuffling";
import * as coreTrace from "../core/trace";
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
  getCounters,
  hasSubtype,
  isCentralServer,
  payAndTrash,
  runIces,
  runnerGrip,
  runnerStack,
  strengthPump,
  targetServerFromContext,
  toC,
  toCost,
  trashCard,
  trashToBypass,
} from "./programs_3_helpers";

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
