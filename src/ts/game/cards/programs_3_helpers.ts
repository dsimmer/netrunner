import type { Ability, Card, CardDef, EID, Side, State } from "../../types";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreLink from "../core/link";
import * as coreMoving from "../core/moving";
import * as corePayment from "../core/payment";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreProps from "../core/props";
import { effect, msg, req } from "../macros";

export function autoIcebreaker(definition: CardDef): CardDef {
  return coreDefHelpers.autoIcebreaker(definition);
}

export const breakSub = coreIce.breakSub;
export const strengthPump = coreIce.strengthPump;
export const toC = corePayment.toC;

export function toCost(type: string, amount = 1, args?: Record<string, unknown>): Record<string, unknown> {
  return toC(type, amount, args) as unknown as Record<string, unknown>;
}

export function context(targets: unknown[]): Record<string, unknown> {
  const target = targets[0];
  return typeof target === "object" && target !== null
    ? (target as Record<string, unknown>)
    : {};
}

export function currentIce(state: State): Card | null {
  return coreIce.getCurrentIce(state);
}

export function getCounters(card: Card, counterType: string): number {
  const counters = (card.counter ?? {}) as Record<string, unknown>;
  const value = counters[counterType];
  return typeof value === "number" ? value : 0;
}

export function addCounter(
  state: State,
  side: Side,
  eid: EID,
  card: Card,
  counterType: string,
  amount: number,
): void {
  coreProps.addCounter(state, side, eid, card, counterType, amount, null);
}

export function runnerStack(state: State): Card[] {
  return state.runner?.deck ?? [];
}

export function runnerGrip(state: State): Card[] {
  return state.runner?.hand ?? [];
}

export function corpHand(state: State): Card[] {
  return state.corp?.hand ?? [];
}

export function corpDeck(state: State): Card[] {
  return state.corp?.deck ?? [];
}

export function trashCard(state: State, side: Side, eid: EID, card: Card): void {
  coreMoving.trash(state, side, eid, card);
}

export function payAndTrash(state: State, side: Side, eid: EID, card: Card): void {
  trashCard(state, side, eid, card);
}

export function targetServerFromContext(targets: unknown[]): string | undefined {
  const ctx = context(targets);
  const server = ctx.server ?? ctx["target-server"] ?? ctx.fromServer;
  if (typeof server === "string") return server.replace(/^:/, "");
  if (Array.isArray(server)) {
    const last = server[server.length - 1];
    return typeof last === "string" ? last.replace(/^:/, "") : undefined;
  }
  return undefined;
}

export function isCentralServer(server: string | undefined): boolean {
  return server === "hq" || server === "rd" || server === "archives";
}

export function runIces(state: State): Card[] {
  const server = state.run?.server?.[0];
  if (!server) return [];
  if (server === "hq" || server === "rd" || server === "archives") {
    return state.corp.servers[server].ices;
  }
  return state.corp.servers.remote[server]?.ices ?? [];
}

export function hasSubtype(card: Card | null, subtype: string): boolean {
  return card !== null && coreCard.hasSubtype(card, subtype) !== undefined;
}

export function cloudIcebreaker(definition: CardDef): CardDef {
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

export function breakAndEnter(title: string, iceType: string): CardDef {
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

export function globalSecBreaker(title: string, iceType: string): CardDef {
  return {
    title,
    ...cloudIcebreaker(
      autoIcebreaker({
        abilities: [breakSub(2, 0, iceType), strengthPump(2, 3)],
      }),
    ),
  };
}

export function trashToBypass(
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

export function returnAndDerez(
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

export function virusBreaker(title: string, iceType: string): CardDef {
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

export function devaSwapBreaker(
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
