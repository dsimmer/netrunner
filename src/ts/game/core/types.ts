// Core type declarations shared across the game engine.
// Mirrors: src/go/game/core/types.go + src/clj/game/macros.clj
// (AbilityFn, ReqFn, Ability, Subroutine, Cost, CardDef, etc.)

import type { GameState } from "./state";
import type { EID } from "./eid";
import type { Card, Zone, Counter } from "./card";

export type { EID, Card, GameState, Zone, Counter };

// Generic server descriptor: name string ("hq", "remote2") or zone vector.
export type Server = string | string[];
// Generic options bag accepted by many engine helpers (Clojure-style kwargs).
export type EngineOpts = Record<string, unknown>;
// Generator return type produced by req/effect macro bodies.
export type AbilityGen<T = unknown> = Generator<unknown, T, unknown>;

// Convenience aliases used widely across card files.
export type State = GameState;
export type Side = string;
export type Targets = unknown[];
export type Effect = AbilityFn;

// ---------------------------------------------------------------------------
// Function types (mirror Go's AbilityFn / ReqFn / ValueFn / NumberFn)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

export type AbilityFn = AnyFn;

export type ReqFn = AnyFn | boolean;

export type MsgFn =
  | AnyFn
  | string
  | {
      public?: string | AnyFn;
      corp?: string | AnyFn;
      runner?: string | AnyFn;
      [key: string]: any;
    };

export type ValueFn = AnyFn | number | boolean | string | unknown;

export type NumberFn = AnyFn | number;

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

export interface Cost {
  type: string; // "credit", "click", "tag", etc.
  amount?: number;
  subAbility?: Ability;
  additional?: boolean;
  stealth?: number | "all-stealth";
  maximum?: number;
  offset?: number;
  args?: Record<string, unknown>;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// PSI / Trace sub-structures
// ---------------------------------------------------------------------------

export interface PsiAbility {
  equal?: Ability;
  unequal?: Ability;
  "not-equal"?: Ability;
  [key: string]: any;
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
  // Card defs are still being ported from clj — allow kebab-case / extra keys.
  [key: string]: any;
}

// ChoicesSpec mirrors Go's ChoicesMap — can be string[], "*", "credit", etc.
// Cards in progress sometimes pass a function (req-style) directly; allow that.
export type ChoicesSpec =
  | string[]
  | string
  | ReqFn
  | {
      number?: NumberFn;
      default?: NumberFn;
      card?: (c: Card) => boolean | unknown;
      req?: ReqFn;
      all?: boolean;
      max?: NumberFn;
      notSelf?: boolean;
      [key: string]: any;
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
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// StaticAbility / EventHandler
// ---------------------------------------------------------------------------

export interface StaticAbility {
  type: string;
  req?: ReqFn;
  value?: ValueFn;
  [key: string]: any;
}

export interface EventHandler {
  event?: string;
  req?: ReqFn;
  effect?: AbilityFn;
  async?: boolean;
  once?: string; // "per-turn" etc.
  oncePer?: string;
  optional?: Ability;
  waiting?: string;
  location?: string | string[] | string[][];
  name?: string;
  msg?: string | MsgFn;
  duration?: string; // "until-runner-turn-ends" etc.
  [key: string]: any;
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
  [key: string]: any;
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
