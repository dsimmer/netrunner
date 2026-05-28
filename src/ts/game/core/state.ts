// GameState, Corp, Runner, and all player-side state types.
// Mirrors: src/clj/game/core/state.clj + player.clj + src/go/game/core/state.go

import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import type { Ability, AbilityFn, ReqFn, Side } from "./types";
// ---------------------------------------------------------------------------
// Side constants
// ---------------------------------------------------------------------------

export const CORP_SIDE = "corp";
export const RUNNER_SIDE = "runner";

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

export interface HandSize {
  base: number;
  total: number;
}

export interface BadPublicity {
  base: number;
  additional: number;
}

export interface Tags {
  base: number;
  total: number;
  isTagged: boolean;
}

export interface FlagEntry {
  card: Card;
  condition: ReqFn;
}

export interface FlagStack {
  currentRun: Record<string, FlagEntry[]>;
  currentTurn: Record<string, FlagEntry[]>;
  persistent: Record<string, FlagEntry[]>;
}

export interface DamageState {
  damageChooseRunner: boolean;
  damageChooseCorp: boolean;
  chosenDamage: Card[];
}

export interface Rig {
  facedown: Card[];
  hardware: Card[];
  program: Card[];
  resource: Card[];
}

export interface ServerZone {
  content: Card[];
  ices: Card[];
}

export interface Servers {
  hq: ServerZone;
  rd: ServerZone;
  archives: ServerZone;
  remote: Record<string, ServerZone>; // "remote0", "remote1", etc.
}

export interface MemoryBucket {
  available: number;
  used: number;
}

export interface Memory {
  base: number;
  available: number;
  used: number;
  onlyFor: Record<string, MemoryBucket>;
}

export interface ChoicesMap {
  number?: (
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: Card[],
  ) => number;
  default?: (
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: Card[],
  ) => number;
  card?: (c: Card) => boolean;
  req?: ReqFn;
  all?: boolean;
  max?: (
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: Card[],
  ) => number;
  notSelf?: boolean;
  counter?: string;
  "card-title"?: (
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: Card[],
  ) => unknown;
  [key: string]: unknown;
}

export interface Prompt {
  eid?: EID;
  side?: string;
  card?: Card | null;
  message?: string;
  promptType?: string;
  choices?: string[] | "*" | "credit" | "counter" | ChoicesMap | number;
  effect?: AbilityFn;
  cancel?: AbilityFn;
  priority?: number;
  buttons?: string[];
  waiting?: string;
}

export interface RunEffectEntry {
  card: Card;
  ability: Ability;
  mandatory?: boolean;
}

export interface RunSourceCard {
  code?: string;
  cid?: string;
  zone?: Zone;
  title?: string;
  side?: string;
  type?: string;
  art?: string;
  implementation?: string | boolean;
}

export interface RunState {
  runId?: EID;
  eid?: EID;
  server: string[];
  position: number;
  phase: string;
  nextPhase?: string;
  noAction?: boolean | string;
  successful?: boolean;
  unsuccessful?: boolean;
  preventAccess?: boolean;
  approachedIce?: boolean;
  corpAutoNoAction?: boolean;
  ended?: boolean;
  cardsAccessed?: Record<string, number>;
  runEffects?: RunEffectEntry[];
  sourceCard?: RunSourceCard;
  badPublicityAvailable?: number;
  subroutinesFired?: number;
  "marked-server"?: boolean;
}

export interface Encounter {
  eid?: EID;
  ice?: Card | null;
  noAction?: string;
  bypass?: boolean;
  ending?: boolean;
}

export interface Effect {
  uuid: string;
  type: string;
  card: Card;
  req?: ReqFn;
  value?:
    | ((
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        targets: Card[],
      ) => unknown)
    | number
    | boolean
    | string
    | Record<string, unknown>
    | unknown[]
    | null;
  duration?: string;
  static?: boolean;
  lingering?: boolean;
}

export interface GameEvent {
  type: string;
  card?: Card | null;
  targets?: Card[];
  side?: string;
  data?: Record<string, unknown>;
}

export interface RegisteredEvent {
  uuid: string;
  card: Card;
  side: string;
  event: string;
  req?: ReqFn;
  effect?: AbilityFn;
  async?: boolean;
  once?: string;
  oncePer?: string;
  duration?: string;
  // ability / handler are CLJS-style aliases — kept loose because callers
  // poke them with arbitrary shapes (see engine_3.ts / events.ts).
  ability?: unknown;
  handler?: unknown;
  unregisterOnceResolved?: boolean;
  [key: string]: unknown;
}

export interface PhaseState {
  active?: boolean;
  corp?: boolean;
  runner?: boolean;
  requiresConsent?: boolean;
}

export interface LogEntry {
  public?: string;
  corp?: string;
  runner?: string;
  user?: string;
  text?: string;
}

export interface Log {
  public: LogEntry[];
  corp: LogEntry[];
  runner: LogEntry[];
}

export interface PSIState {
  bet: Record<string, number>;
  ability?: Ability;
  card?: Card | null;
  eid?: EID;
}

export interface TraceState {
  base: number;
  boost: number;
  strength: number;
  corpBoost: number;
  runnerBoost: number;
  bonuses: number;
  successful?: Ability;
  unsuccessful?: Ability;
  card?: Card | null;
  eid?: EID;
  forceBase?: number;
}

export interface GameStats {
  time?: {
    started: Date;
    ended?: Date;
    elapsed?: number;
  };
  corp?: Record<string, unknown>;
  runner?: Record<string, unknown>;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Corp / Runner
// ---------------------------------------------------------------------------

export interface Corp {
  aid: number;
  user: Record<string, unknown>;
  identity: Card | null;
  options: Record<string, unknown>;
  basicActionCard: Card | null;
  deck: Card[];
  deckId: string;
  hand: Card[];
  discard: Card[];
  scored: Card[];
  rfg: Card[];
  playArea: Card[];
  current: Card[];
  setAside: Card[];
  setAsideTracking: Record<string, unknown>;
  servers: Servers;
  properties: Record<string, unknown>;
  click: number;
  clickPerTurn: number;
  credit: number;
  badPublicity: BadPublicity;
  toast: unknown[];
  handSize: HandSize;
  agendaPoint: number;
  agendaPointReq: number;
  keep: string;
  quote: string;
  register?: Record<string, unknown>;
  registerLastTurn?: Record<string, unknown>;
  extraClickTemp?: number;
  extraTurns?: number;
  turnStarted?: boolean;
  undoTurn?: unknown;
  promptState?: Prompt | null;
  openhand?: boolean;
}

export interface Runner {
  aid: number;
  user: Record<string, unknown>;
  identity: Card | null;
  options: Record<string, unknown>;
  basicActionCard: Card | null;
  deck: Card[];
  deckId: string;
  hand: Card[];
  discard: Card[];
  scored: Card[];
  rfg: Card[];
  playArea: Card[];
  current: Card[];
  setAside: Card[];
  setAsideTracking: Record<string, unknown>;
  rig: Rig;
  toast: unknown[];
  click: number;
  clickPerTurn: number;
  credit: number;
  runCredit: number;
  nextRunCredit?: number;
  badPubCredit: number;
  link: number;
  tag: Tags;
  properties: Record<string, unknown>;
  memory: Memory;
  handSize: HandSize;
  agendaPoint: number;
  agendaPointReq: number;
  hqAccess: number;
  rdAccess: number;
  brainDamage: number;
  keep: string;
  quote: string;
  register?: Record<string, unknown>;
  registerLastTurn?: Record<string, unknown>;
  extraClickTemp?: number;
  extraTurns?: number;
  turnStarted?: boolean;
  undoTurn?: unknown;
  promptState?: Prompt | null;
  openhand?: boolean;
}

// ---------------------------------------------------------------------------
// GameState
// ---------------------------------------------------------------------------

export interface GameState {
  // Identity
  gameId: string;
  room: string;
  format: string;

  // Players
  corp: Corp;
  runner: Runner;

  // Turn / phase
  activePlayer: string;
  turn: number;
  endTurn: boolean;
  corpPhase12?: PhaseState;
  runnerPhase12?: PhaseState;
  corpPostDiscard?: PhaseState;
  runnerPostDiscard?: PhaseState;

  // Counters
  eidCounter: number;
  rid: number;

  // Effects and events
  effects: Effect[];
  events: RegisteredEvent[];
  disabledCardReg: Map<string, Card>;

  // EID completion callbacks
  eidCallbacks: Map<number, AbilityFn>;

  // Prompt queues
  corpPrompt: Prompt[];
  runnerPrompt: Prompt[];

  // Log
  log: Log;
  history: unknown[];

  // Run state
  run?: RunState | null;

  // Per-run and per-turn event tracking
  perRun: Record<string, unknown>;
  perTurn: Record<string, unknown>;

  // Queued and turn events
  queuedEvents: GameEvent[];
  turnEvents: GameEvent[];
  turnState: Record<string, unknown>;

  // Undo / click state
  lastRevealed?: Card[];
  clickStates?: unknown[];
  paidAbilityState?: unknown;

  // Stack
  stack: unknown[];

  // Flag stacks
  flagStack: FlagStack;

  // Damage state
  damage: DamageState;

  // Sound effects
  sfx: string[];
  sfxCurrentId: number;

  // Win/lose
  winner?: string;
  winReason?: string;
  loser?: string;
  reason?: string;
  winnerDeckId?: string;
  loserDeckId?: string;
  winnerUser?: string;
  loserUser?: string;
  endTime?: Date;
  winnerDeclared?: boolean;

  // Options
  options: Record<string, unknown>;

  // Encounters
  encounters: Encounter[];

  endRunEnded?: boolean;
  mark?: unknown;
  psi?: PSIState | null;
  trace?: TraceState | null;

  // Undo state
  trash?: any;
  clickState?: unknown;
  endRun?: { ended?: boolean } & Record<string, unknown>;
  bonus?: any;

  // Per-encounter scratch space (cleared between encounters).
  perEncounter?: Record<string, unknown> | null;
  // Active count of nested forced encounters (Border Control etc.).
  forcedEncounter?: number;

  // Prevention state — shape varies per category (trash/damage/tag/encounter/etc.)
  // Each entry carries `remaining`, `count`, `uses`, and category-specific keys,
  // so we use a loose record here pending full typing of the prevention engine.
  prevent?: any;

  // Breach state (set during a server breach; reset to null on end-breach-server)
  breach?: Record<string, unknown> | null;

  // Typing indicators
  typing: string[];

  // Deck lists
  decklists?: Record<string, unknown>;

  // Start date
  startDate: Date;

  // Stats
  stats: GameStats;
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/** Creates a fresh Corp player state. Mirrors new-corp in player.clj. */
export function newCorp(
  user: Record<string, unknown>,
  identity: Card | null,
  options: Record<string, unknown>,
  deck: Card[],
  deckId: string,
  quote: string,
): Corp {
  return {
    aid: 0,
    user,
    identity,
    options,
    basicActionCard: null,
    deck,
    deckId,
    hand: [],
    discard: [],
    scored: [],
    rfg: [],
    playArea: [],
    current: [],
    setAside: [],
    setAsideTracking: {},
    servers: {
      hq: { content: [], ices: [] },
      rd: { content: [], ices: [] },
      archives: { content: [], ices: [] },
      remote: {},
    },
    properties: {},
    click: 0,
    clickPerTurn: 3,
    credit: 5,
    badPublicity: { base: 0, additional: 0 },
    toast: [],
    handSize: { base: 5, total: 5 },
    agendaPoint: 0,
    agendaPointReq: 7,
    keep: "",
    quote,
  };
}

/** Creates a fresh Runner player state. Mirrors new-runner in player.clj. */
export function newRunner(
  user: Record<string, unknown>,
  identity: Card | null,
  options: Record<string, unknown>,
  deck: Card[],
  deckId: string,
  quote: string,
): Runner {
  return {
    aid: 0,
    user,
    identity,
    options,
    basicActionCard: null,
    deck,
    deckId,
    hand: [],
    discard: [],
    scored: [],
    rfg: [],
    playArea: [],
    current: [],
    setAside: [],
    setAsideTracking: {},
    rig: {
      facedown: [],
      hardware: [],
      program: [],
      resource: [],
    },
    toast: [],
    click: 0,
    clickPerTurn: 4,
    credit: 5,
    runCredit: 0,
    badPubCredit: 0,
    link: 0,
    tag: { base: 0, total: 0, isTagged: false },
    properties: {},
    memory: { base: 4, available: 0, used: 0, onlyFor: {} },
    handSize: { base: 5, total: 5 },
    agendaPoint: 0,
    agendaPointReq: 7,
    hqAccess: 0,
    rdAccess: 0,
    brainDamage: 0,
    keep: "",
    quote,
  };
}

/**
 * Creates a fresh game state.
 * Mirrors new-state in state.clj.
 */
export function newGameState(
  gameId: string,
  room: string,
  format: string,
  now: Date,
  options: Record<string, unknown>,
  corp: Corp,
  runner: Runner,
): GameState {
  return {
    gameId,
    room,
    format,
    startDate: now,
    options,
    corp,
    runner,
    activePlayer: RUNNER_SIDE,
    turn: 0,
    endTurn: true,
    log: { public: [], corp: [], runner: [] },
    history: [],
    mark: null,
    rid: 1,
    eidCounter: 0,
    sfx: [],
    sfxCurrentId: 0,
    stats: { time: { started: now } },
    encounters: [],
    eidCallbacks: new Map(),
    disabledCardReg: new Map(),
    perRun: {},
    perTurn: {},
    turnState: {},
    flagStack: {
      currentRun: {},
      currentTurn: {},
      persistent: {},
    },
    effects: [],
    events: [],
    corpPrompt: [],
    runnerPrompt: [],
    queuedEvents: [],
    turnEvents: [],
    stack: [],
    damage: {
      damageChooseRunner: false,
      damageChooseCorp: false,
      chosenDamage: [],
    },
    typing: [],
  };
}

export const newState = newGameState;

/** Returns the prompt queue for the given side. */
export function getSidePrompt(state: GameState, side: string): Prompt[] {
  return side === CORP_SIDE ? state.corpPrompt : state.runnerPrompt;
}

/** Sets the prompt queue for the given side. */
export function setSidePrompt(
  state: GameState,
  side: string,
  prompts: Prompt[],
): void {
  if (side === CORP_SIDE) {
    state.corpPrompt = prompts;
  } else {
    state.runnerPrompt = prompts;
  }
}

/** Returns Corp or Runner by side string. */
export function getPlayer(state: GameState, side: string): Corp | Runner {
  return side === CORP_SIDE ? state.corp : state.runner;
}

/** Allocates the next remote server ID. */
export function makeRID(state: GameState): number {
  const rid = state.rid;
  state.rid += 1;
  return rid;
}

export const makeRid = makeRID;
