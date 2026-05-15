export interface HandSize {
  base: number;
  total: number;
}

export interface ServerContent {
  content: unknown[];
  ices: unknown[];
}

export interface Servers {
  hq: ServerContent;
  rd: ServerContent;
  archives: ServerContent;
}

export interface BadPublicity {
  base: number;
  additional: number;
}

export interface Corp {
  aid: number;
  user: unknown;
  identity: unknown;
  options: unknown;
  basic_action_card: unknown | null;
  deck: unknown[];
  deck_id: string;
  hand: unknown[];
  discard: unknown[];
  scored: unknown[];
  rfg: unknown[];
  play_area: unknown[];
  current: unknown[];
  set_aside: unknown[];
  set_aside_tracking: Record<string, unknown>;
  servers: Servers;
  click: number;
  click_per_turn: number;
  credit: number;
  bad_publicity: BadPublicity;
  toast: unknown[];
  properties: Record<string, unknown>;
  hand_size: HandSize;
  agenda_point: number;
  agenda_point_req: number;
  keep: boolean;
  quote: unknown;
}

export function newCorp(
  user: unknown,
  c_identity: unknown,
  options: unknown,
  deck: unknown[],
  deck_id: string,
  c_quote: unknown
): Corp {
  return {
    aid: 0,
    user,
    identity: c_identity,
    options,
    basic_action_card: null,
    deck,
    deck_id,
    hand: [],
    discard: [],
    scored: [],
    rfg: [],
    play_area: [],
    current: [],
    set_aside: [],
    set_aside_tracking: {},
    servers: {
      hq: { content: [], ices: [] },
      rd: { content: [], ices: [] },
      archives: { content: [], ices: [] }
    },
    click: 0,
    click_per_turn: 3,
    credit: 5,
    bad_publicity: { base: 0, additional: 0 },
    toast: [],
    properties: {},
    hand_size: { base: 5, total: 5 },
    agenda_point: 0,
    agenda_point_req: 7,
    keep: false,
    quote: c_quote
  };
}

export interface Tags {
  base: number;
  total: number;
  is_tagged: boolean;
}

export interface Rig {
  facedown: unknown[];
  hardware: unknown[];
  program: unknown[];
  resource: unknown[];
}

export interface Memory {
  base: number;
  available: number;
  used: number;
  only_for: Record<string, unknown>;
}

export interface Runner {
  aid: number;
  user: unknown;
  identity: unknown;
  options: unknown;
  basic_action_card: unknown | null;
  deck: unknown[];
  deck_id: string;
  hand: unknown[];
  discard: unknown[];
  scored: unknown[];
  rfg: unknown[];
  play_area: unknown[];
  current: unknown[];
  set_aside: unknown[];
  set_aside_tracking: Record<string, unknown>;
  rig: Rig;
  toast: unknown[];
  click: number;
  click_per_turn: number;
  credit: number;
  run_credit: number;
  bad_pub_credit: number;
  link: number;
  tag: Tags;
  properties: Record<string, unknown>;
  memory: Memory;
  hand_size: HandSize;
  agenda_point: number;
  agenda_point_req: number;
  hq_access: unknown[];
  rd_access: unknown[];
  rd_access_fn: (coll: unknown[]) => unknown[];
  hq_access_fn: (coll: unknown[]) => unknown[];
  brain_damage: number;
  keep: boolean;
  quote: unknown;
}

export function newRunner(
  user: unknown,
  r_identity: unknown,
  options: unknown,
  deck: unknown[],
  deck_id: string,
  r_quote: unknown
): Runner {
  return {
    aid: 0,
    user,
    identity: r_identity,
    options,
    basic_action_card: null,
    deck,
    deck_id,
    hand: [],
    discard: [],
    scored: [],
    rfg: [],
    play_area: [],
    current: [],
    set_aside: [],
    set_aside_tracking: {},
    rig: {
      facedown: [],
      hardware: [],
      program: [],
      resource: []
    },
    toast: [],
    click: 0,
    click_per_turn: 4,
    credit: 5,
    run_credit: 0,
    bad_pub_credit: 0,
    link: 0,
    tag: { base: 0, total: 0, is_tagged: false },
    properties: {},
    memory: {
      base: 4,
      available: 0,
      used: 0,
      only_for: {}
    },
    hand_size: { base: 5, total: 5 },
    agenda_point: 0,
    agenda_point_req: 7,
    hq_access: [],
    rd_access: [],
    rd_access_fn: (coll: unknown[]) => coll,
    hq_access_fn: (coll: unknown[]) => coll,
    brain_damage: 0,
    keep: false,
    quote: r_quote
  };
}
