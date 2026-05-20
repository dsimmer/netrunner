// Convenience re-exports for card files.
// Most type defs live in src/ts/game/core/types.ts; this barrel exposes
// the names cards use (State, Side, Card, EID, CardDef).

import type { GameState } from "./game/core/state";

export type State = GameState;
export type Side = string;

export type {
  EID,
  Card,
  GameState,
  AbilityFn,
  ReqFn,
  MsgFn,
  ValueFn,
  NumberFn,
  Cost,
  PsiAbility,
  TraceAbility,
  Ability,
  ChoicesSpec,
  Subroutine,
  StaticAbility,
  EventHandler,
  CardDef,
  Zone,
  Counter,
  Server,
  EngineOpts,
  AbilityGen,
} from "./game/core/types";
