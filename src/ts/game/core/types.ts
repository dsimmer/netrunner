// Core type declarations shared across the game engine.
// Mirrors: src/go/game/core/types.go + src/clj/game/macros.clj
// (AbilityFn, ReqFn, Ability, Subroutine, Cost, CardDef, etc.)

import type { GameState } from "./state";
import type { EID } from "./eid";
import type { Card } from "./card";

export type { EID, Card, GameState };

// ---------------------------------------------------------------------------
// Function types (mirror Go's AbilityFn / ReqFn / ValueFn / NumberFn)
// ---------------------------------------------------------------------------

export type AbilityFn = (
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: Card[],
) => void;

export type ReqFn = (
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: Card[],
) => boolean;

export type MsgFn = (
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: Card[],
) => string;

export type ValueFn = (
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: Card[],
) => unknown;

export type NumberFn = (
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: Card[],
) => number;

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

export interface Cost {
  type: string; // "credit", "click", "tag", etc.
  amount: number;
  subAbility?: Ability;
}

// ---------------------------------------------------------------------------
// PSI / Trace sub-structures
// ---------------------------------------------------------------------------

export interface PsiAbility {
  equal?: Ability;
  unequal?: Ability;
}

export interface TraceAbility {
  base?: number | NumberFn;
  successful?: Ability;
  unsuccessful?: Ability;
  label?: string;
  player?: string;
  msg?: string | MsgFn;
}

// ---------------------------------------------------------------------------
// Ability
// ---------------------------------------------------------------------------

export interface Ability {
  label?: string;
  cost?: Cost[];
  breakCost?: Cost[];
  costLabel?: string;
  msg?: string | MsgFn;
  prompt?: string | MsgFn;
  choices?: ChoicesSpec;
  effect?: AbilityFn;
  req?: ReqFn;
  async?: boolean;
  optional?: Ability;
  player?: string;
  promptType?: string;
  interactive?: ReqFn;
  abilities?: Ability[];
  waiting?: string;
  priority?: number;
  additionalCost?: Cost[];
  event?: string;
  psi?: PsiAbility;
  trace?: TraceAbility;
  notShown?: boolean;
}

// ChoicesSpec mirrors Go's ChoicesMap — can be string[], "*", "credit", etc.
export type ChoicesSpec =
  | string[]
  | "*"
  | "credit"
  | "counter"
  | {
      number?: NumberFn;
      default?: NumberFn;
      card?: (c: Card) => boolean;
      req?: ReqFn;
      all?: boolean;
      max?: NumberFn;
      notSelf?: boolean;
    };

// ---------------------------------------------------------------------------
// Subroutine
// ---------------------------------------------------------------------------

export interface Subroutine {
  label?: string;
  ability?: Ability;
  effect?: AbilityFn;
  broken?: boolean;
  fired?: boolean;
  printed?: boolean;
  sourceCard?: Card | null;
  breakerCid?: string;
  index?: number;
}

// ---------------------------------------------------------------------------
// StaticAbility / EventHandler
// ---------------------------------------------------------------------------

export interface StaticAbility {
  type: string;
  req?: ReqFn;
  value?: ValueFn;
}

export interface EventHandler {
  event: string;
  req?: ReqFn;
  effect?: AbilityFn;
  async?: boolean;
  once?: string; // "per-turn" etc.
  oncePer?: string;
  optional?: Ability;
  waiting?: string;
  location?: string[][];
  name?: string;
  msg?: string | MsgFn;
  duration?: string; // "until-runner-turn-ends" etc.
}

// ---------------------------------------------------------------------------
// CardDef
// ---------------------------------------------------------------------------

export interface CardDef {
  title?: string;
  abilities?: Ability[];
  corpAbilities?: Ability[];
  runnerAbilities?: Ability[];
  subroutines?: Subroutine[];
  staticAbilities?: StaticAbility[];
  events?: EventHandler[];
  recurring?: number | AbilityFn;
  inPlay?: unknown[];
  onInstall?: Ability;
  effect?: AbilityFn;
  req?: ReqFn;
  leavePlay?: AbilityFn;
  trash?: AbilityFn;
  rez?: AbilityFn;
  derez?: AbilityFn;
  disable?: AbilityFn;
  access?: Ability;
  expend?: Ability;
  strengthBonus?: NumberFn;
  data?: Record<string, unknown>;
  implementation?: string;
  async?: boolean;
  optional?: Ability;
  xFn?: AbilityFn;
  poison?: boolean;
  highlightInDiscard?: boolean;
  special?: Record<string, unknown>;
  flags?: Record<string, ReqFn>;
}

// ---------------------------------------------------------------------------
// Card definition registry
// ---------------------------------------------------------------------------

export const cardDefRegistry = new Map<string, CardDef>();

/** Register a card definition by title. Mirrors RegisterCard in Go. */
export function registerCard(title: string, def: CardDef): void {
  cardDefRegistry.set(title, def);
}

/** Retrieve the ability definition for a card. Mirrors GetCardDef in Go. */
export function getCardDef(card: Card | null): CardDef {
  if (!card) return {};
  const title = card.title ?? "";
  return cardDefRegistry.get(title) ?? {};
}
