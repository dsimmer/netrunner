// Shared card helpers — common patterns referenced across card files
// before they were ported individually. These are permissive stubs that
// match the surface shape used by clj cards, so the TS port compiles
// while individual helper bodies are being filled in.

import type { Card, CardDef } from "../core/types";
import { chooseOneHelper } from "../core/choose_one";
type AnyArgs = unknown[];

export function installAbility(..._args: AnyArgs): CardDef {
  return {};
}

export function iceBoostAgenda(..._args: AnyArgs): Partial<CardDef> {
  return {};
}

export function campaign(..._args: AnyArgs): CardDef {
  return {};
}

export function serverCards(..._args: AnyArgs): unknown[] {
  return [];
}

export function coreThreat(..._args: AnyArgs): unknown {
  return undefined;
}

export function breakSubFn(..._args: AnyArgs): Record<string, unknown> {
  return {};
}

export function targetFn(..._args: AnyArgs): unknown {
  return undefined;
}

export function autoIcebreakerFn(..._args: AnyArgs): Partial<CardDef> {
  return {};
}

export type CardFn = (...args: AnyArgs) => unknown;

export function preventUpToNDamageFn(..._args: AnyArgs): Record<string, unknown> {
  return {};
}

export const coreChooseOneMod = {
  chooseOneHelper,
};

export function coreChooseOneModFn(..._args: AnyArgs): unknown {
  return coreChooseOneMod;
}

export function sabotageAbility(..._args: AnyArgs): Record<string, unknown> {
  return {};
}

export function mHelper(..._args: AnyArgs): unknown {
  return undefined;
}

export function getHosted(..._args: AnyArgs): Card[] {
  return [];
}

export function countTagsFn(..._args: AnyArgs): unknown {
  return 0;
}

export function installChoice(..._args: AnyArgs): unknown {
  return undefined;
}

export function makeEidFn2(..._args: AnyArgs): unknown {
  return undefined;
}

export function getDamageFn(..._args: AnyArgs): unknown {
  return 0;
}

export function morphIce(..._args: AnyArgs): Partial<CardDef> {
  return {};
}

export function constellationIce(..._args: AnyArgs): Partial<CardDef> {
  return {};
}

export function heroToHero(..._args: AnyArgs): Partial<CardDef> {
  return {};
}

export function nextIceVariableSubs(..._args: AnyArgs): Partial<CardDef> {
  return {};
}

export function zeroToHero(..._args: AnyArgs): Partial<CardDef> {
  return {};
}
