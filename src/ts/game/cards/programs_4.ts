import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCharge from "../core/charge";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEid from "../core/eid";
import * as coreGaining from "../core/gaining";
import * as coreIce from "../core/ice";
import * as coreMoving from "../core/moving";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreVirus from "../core/virus";
import { effect, msg, req, continue_ability } from "../macros";
import {
  addCounter,
  autoIcebreaker,
  breakSub,
  context,
  corpDeck,
  corpHand,
  currentIce,
  globalSecBreaker,
  hasSubtype,
  returnAndDerez,
  strengthPump,
  targetServerFromContext,
  toC,
  toCost,
  trashCard,
} from "./programs_3_helpers";

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
