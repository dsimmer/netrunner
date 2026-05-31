// Quick draft format handling.
// Mirrors: src/clj/game/core/quick_draft.clj

import type { Card } from "./card";
import {
  agenda as isAgenda,
  corp as isCorpCard,
  hasAnySubtype,
  hasSubtype,
  ice as isIce,
  identity as isIdentityCard,
  runner as isRunnerCard,
} from "./card";
import type { EID } from "./eid";
import { effectCompleted } from "./eid";
import { resolveAbility } from "./engine_1";
import { cardInit, makeCard } from "./initializing";
import {
  clearWaitPrompt,
  showPrompt,
  showWaitPrompt,
} from "./prompts";
import { systemMsg } from "./say";
import type { GameState } from "./state";
import { toast } from "./toasts";
import type { Ability } from "./types";
import { AllCards } from "../../jinteki/cards";
import { corpBans } from "../../jinteki/chimera";
import { otherSide } from "../../jinteki/utils";
import { wait_for } from "../macros";
import { quantify, sameSide, serverCard } from "../utils";

// ---------------------------------------------------------------------------
// Banned cards (runner side)
// ---------------------------------------------------------------------------

export const runnerBans = new Set<string>([
  "Blackmail",
  "Calling in Favors",
  "Charm Offensive",
  "Data Breach",
  "Diana's Hunt",
  "Direct Access",
  "Employee Strike",
  "Endurance",
  "Exploratory Romp",
  "Feint",
  "Government Investigations",
  "Immolation Script",
  "Itinerant Protesters",
  "Leverage",
  "Mass Install",
  "Networking",
  "Office Supplies",
  "Paper Tripping",
  "Populist Rally",
  "Power Nap",
  "Rebirth",
  "Reboot",
  "Spree",
  "Surge",
  "Traffic Jam",
  "Uninstall",
  // "Watch the World Burn",
  "Acacia",
  "Archives Interface",
  "BMI Buffer",
  "Bookmark",
  "Capstone",
  "Capybara",
  "Deep Red",
  // "Dorm Computer",
  "Ekomind",
  "Forger",
  // "Jeitinho",
  "LLDS Processor",
  "MemStrips",
  "Monolith",
  "Mu Safecracker",
  "Muresh Bodysuit",
  "Plascrete Carapace",
  "Public Terminal",
  "Qianju PT",
  "Rabbit Hole",
  "Ramujan-reliant 550 BMI",
  "Recon Drone",
  "Replicator",
  "Security Chip",
  "Titanium Ribs",
  "Unregistered S&W '35",
  "Window",
  "Activist Support",
  "Adjusted Chronotype",
  "Akshara Sareen",
  "Angel Arena",
  "Assimilator",
  "Bazaar",
  "Bio-Modeled Network",
  "Chrome Parlor",
  "Citadel Sanctuary",
  "Cookbook",
  "Crash Space",
  // "Daeg, First Net-Cat",
  "Debbie \"Downtown\" Moreira",
  "District 99",
  "Donut Taganes",
  "Dr. Lovegood",
  "Fester",
  "Bloo Moose",
  "Rezeki",
  "First Responders",
  "Gene Conditioning Shoppe",
  "Globalsec Security Clearance",
  "Investigative Journalism",
  "Investigator Inez Delgado",
  "Investigator Inez Delgado 2",
  "Investigator Inez Delgado 3",
  "Investigator Inez Delgado 4",
  "Jarogniew Mercs",
  "Keros Mcintyre",
  "Liberated Chela",
  "Motivation",
  // "Net Mercur",
  "New Angeles City Hall",
  "Off-Campus Apartment",
  "Order of Sol",
  "Paige Piper",
  "Paparazzi",
  "Power Tap",
  "Public Sympathy",
  "Sacrificial Clone",
  "Shadow Team",
  "Starlight Crusade Funding",
  "Synthetic Blood",
  "Tallie Perrault",
  "The Back",
  "Thunder Art Gallery",
  "Underworld Contact",
  "Urban Art Vernissage",
  "Valentina Ferreira Carvalho",
  "Virus Breeding Ground",
  "Wasteland",
  "Whistleblower",
  "Wireless Net Pavilion",
  // "Blackstone",
  "Crowbar",
  // "Dagger",
  "Dai V",
  // "Fawkes",
  // "Houdini",
  // "Sage",
  "Shiv",
  "Spike",
  // "Umbrella",
  "Au Revoir",
  "Copycat",
  "Disrupter",
  "Flux Capacitor",
  "Heliamphora",
  "Hivemind",
  "Incubator",
  "Ixodidae",
  "LLDS Energy Regulator",
  "Panchatantra",
  "Pawn",
  "Plague",
  "Progenitor",
  "Surveillance Network Key",
  "Surveillance Network Key 2",
]);

// ---------------------------------------------------------------------------
// Valid card pools
// ---------------------------------------------------------------------------

export const valid3Pointers = [
  "Bellona",
  "City Works Project",
  "Degree Mill",
  "Elective Upgrade",
  "Fujii Asset Retrieval",
  "Global Food Initiative",
  "Ikawah Project",
  "Obokata Protocol",
  "Project Vacheron",
  "SDS Drone Deployment",
  "Send a Message",
  "SSL Endorsement",
  "The Basalt Spire",
  "The Future Perfect",
  "Vulnerability Audit",
];

export const valid2Pointers = [
  "Above the Law",
  "Accelerated Beta Test",
  "AstroScript Pilot Program",
  "Azef Protocol",
  "Broad Daylight",
  "Blood in the Water",
  "Cyberdex Sandbox",
  "Longevity Serum",
  "Medical Breakthrough",
  "NAPD Contract",
  "Freedom of Information",
  "Oaktown Renovation",
  "Offworld Office",
  "Philotic Entanglement",
  "Project Beale",
  "Tomorrow's Headline",
];

export const validCorpIds = [
  "Strategic Innovations: Future Forward",
  "Synthetic Systems: The World Re-imagined",
  "Information Dynamics: All You Need To Know",
  "Fringe Applications: Tomorrow, Today",
  "Cybernetics Division: Humanity Upgraded",
  "Hyoubu Institute: Absolute Clarity",
  "AgInfusion: New Miracles for a New World",
  "PT Untaian: Life's Building Blocks",
  "NBN: The World is Yours*",
  "Pravdivost Consulting: Political Solutions",
  "Argus Security: Protection Guaranteed",
  "Thule Subsea: Safety Below",
  "Sportsmetal: Go Big or Go Home",
  "Jinteki: Replicating Perfection",
  "NBN: Reality Plus",
  "Epiphany Analytica: Nations Undivided",
  "Weyland Consortium: Built to Last",
  "Haas-Bioroid: Precision Design",
  "The Outfit: Family Owned and Operated",
  "Earth Station: SEA Headquarters",
];

export const validRunnerIds = [
  "Hayley Kaplan: Universal Scholar",
  "Lat: Ethical Freelancer",
  "Jamie \"Bzzz\" Micken: Techno Savant",
  "Ele \"Smoke\" Scovak: Cynosure of the Net",
  "Nasir Meidan: Cyber Explorer",
  "Rielle \"Kit\" Peddler: Transhuman",
  "Captain Padma Isbister: Intrepid Explorer",

  "Nero Severn: Information Broker",
  "Boris \"Syfr\" Kovac: Crafty Veteran",
  "Barry \"Baz\" Wong: Tri-Maf Veteran",
  "Silhouette: Stealth Operative",
  "Zahya Sadeghi: Versatile Smuggler",
  "Az McCaffrey: Mechanical Prodigy",
  "Gabriel Santiago: Consummate Professional",

  "Wyvern: Chemically Enhanced",
  "Edward Kim: Humanity's Hammer",
  "Nathaniel \"Gnat\" Hall: One-of-a-Kind",
  "Topan: Ormas Leader",
  "Sebastião Souza Pessoa: Activist Organizer",
  "Quetzal: Free Spirit",
  "Reina Roja: Freedom Fighter",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RawCard = Record<string, unknown>;

interface DraftDeckPick {
  type: "deck";
  prompt: string;
  qty: number;
  phase: string;
  choices: string[];
}

interface DraftIdentityPick {
  type: "identity";
  phase: string;
  prompt: string;
  choices: string[];
}

interface DraftInfoPick {
  type: "info";
  phase: string;
  prompt: string;
  cards: string[];
}

type SideDraftPick = DraftDeckPick | DraftIdentityPick | DraftInfoPick;

interface SideDraft {
  info: DraftInfoPick;
  stageOne: SideDraftPick[];
  identity: DraftIdentityPick;
  stageTwo: SideDraftPick[];
}

interface CombinedItem {
  type: "info" | "deck" | "identity";
  corp: SideDraftPick;
  runner: SideDraftPick;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffleArray<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function take<T>(n: number, arr: readonly T[]): T[] {
  return arr.slice(0, n);
}

function titleOf(c: RawCard): string {
  return (c.title as string) ?? "";
}

// ---------------------------------------------------------------------------
// Pick generators
// ---------------------------------------------------------------------------

/** Generates a pick from one category of cards. Mirrors generate-pick. */
function generatePick(
  input: readonly RawCard[],
  qty: number,
  choices: number,
  title: string,
  phase: string,
): DraftDeckPick {
  return {
    type: "deck",
    prompt: `Choose a ${title}. You will receive ${qty} copies`,
    qty,
    phase,
    choices: take(choices, shuffleArray(input)).map(titleOf),
  };
}

/** Generates a pick from two categories of card. Mirrors generate-multi-pick. */
function generateMultiPick(
  inputA: readonly RawCard[],
  inputB: readonly RawCard[],
  qty: number,
  choicesA: number,
  choicesB: number,
  title: string,
  phase: string,
): DraftDeckPick {
  return {
    type: "deck",
    prompt: `Choose a ${title}. You will receive ${qty} copies`,
    qty,
    phase,
    choices: [
      ...take(choicesA, shuffleArray(inputA)).map(titleOf),
      ...take(choicesB, shuffleArray(inputB)).map(titleOf),
    ],
  };
}

// ---------------------------------------------------------------------------
// Corp / runner draft generation
// ---------------------------------------------------------------------------

function generateCorpQuickDraft(): SideDraft {
  const all = Object.values(AllCards) as RawCard[];
  const corpCards = all.filter(
    (c) => isCorpCard(c as unknown as Card) && c.set_code !== "tdc",
  );
  const corpFormatCards = corpCards.filter(
    (c) =>
      !corpBans.has(titleOf(c)) &&
      !isIdentityCard(c as unknown as Card) &&
      !isAgenda(c as unknown as Card),
  );
  const iceCards = take(
    12,
    shuffleArray(corpFormatCards.filter((c: RawCard) => isIce(c as unknown as Card))),
  );

  const corpIce: DraftDeckPick = {
    type: "deck",
    prompt: "Choose an ice. You will receive 3 copies.",
    phase: "ice",
    qty: 3,
    choices: iceCards.map(titleOf),
  };

  const corpInfo: DraftInfoPick = {
    type: "info",
    phase: "info",
    cards: [
      "Hedge Fund",
      "Hedge Fund",
      "Hedge Fund",
      "Jackson Howard",
      "Jackson Howard",
    ],
    prompt:
      "Your deck starts with 3 copies of Hedge Fund and 2 copies of Jackson Howard",
  };

  return {
    info: corpInfo,
    stageOne: [
      {
        type: "deck",
        phase: "agenda-3",
        prompt:
          "Choose an agenda (This game will be played to 6 points. You will receive 2 copies, and have 14 points in your deck)",
        qty: 2,
        choices: take(5, shuffleArray(valid3Pointers)),
      },
      {
        type: "deck",
        phase: "agenda-2",
        prompt:
          "Choose an agenda (This game will be played to 6 points. You will receive 4 copies, and have 14 points in your deck)",
        qty: 4,
        choices: take(5, shuffleArray(valid2Pointers)),
      },
      corpIce,
      generatePick(corpFormatCards, 3, 9, "card", "card"),
      generatePick(corpFormatCards, 3, 9, "card", "card"),
      generatePick(corpFormatCards, 3, 9, "card", "card"),
      generatePick(corpFormatCards, 3, 9, "card", "card"),
    ],
    identity: {
      type: "identity",
      phase: "identity",
      prompt: "Choose your identity",
      choices: take(4, shuffleArray(validCorpIds)),
    },
    stageTwo: [
      generatePick(corpFormatCards, 2, 12, "card", "card"),
      generatePick(corpFormatCards, 2, 12, "card", "card"),
      generatePick(corpFormatCards, 2, 12, "card", "card"),
      generatePick(corpFormatCards, 2, 12, "card", "card"),
    ],
  };
}

function generateRunnerQuickDraft(): SideDraft {
  const all = Object.values(AllCards) as RawCard[];
  const runnerCards = all.filter(
    (c) => isRunnerCard(c as unknown as Card) && c.set_code !== "tdc",
  );
  const runnerFormatCards = runnerCards.filter(
    (c) => !runnerBans.has(titleOf(c)) && !isIdentityCard(c as unknown as Card),
  );
  const notMainBreaker = (c: RawCard): boolean =>
    !hasAnySubtype(c as unknown as Card, ["Fracter", "Decoder", "Killer"]);
  const nonPrograms = runnerFormatCards.filter(notMainBreaker);
  const fracters = runnerFormatCards.filter((c: RawCard) =>
    hasSubtype(c as unknown as Card, "Fracter"),
  );
  const decoders = runnerFormatCards.filter((c: RawCard) =>
    hasSubtype(c as unknown as Card, "Decoder"),
  );
  const killers = runnerFormatCards.filter((c: RawCard) =>
    hasSubtype(c as unknown as Card, "Killer"),
  );

  const runnerInfo: DraftInfoPick = {
    type: "info",
    cards: [
      "Blueberry!™ Diesel",
      "Blueberry!™ Diesel",
      "Blueberry!™ Diesel",
      "Sure Gamble",
      "Sure Gamble",
      "Crypsis",
    ],
    phase: "info",
    prompt:
      "Your deck starts with 3 copies of Blueberry!™ Diesel, 2 copies of Sure Gamble, and 1 copy of Crypsis",
  };

  return {
    info: runnerInfo,
    stageOne: [
      generatePick(nonPrograms, 3, 9, "card", "card"),
      generatePick(runnerFormatCards, 3, 10, "card", "card"),
      generatePick(nonPrograms, 3, 9, "card", "card"),
      generatePick(runnerFormatCards, 3, 10, "card", "card"),
      generateMultiPick(fracters, nonPrograms, 2, 4, 3, "fracter", "fracter"),
      generateMultiPick(decoders, nonPrograms, 2, 4, 3, "decoder", "decoder"),
      generateMultiPick(killers, nonPrograms, 2, 4, 3, "killer", "killer"),
    ],
    identity: {
      type: "identity",
      phase: "identity",
      prompt: "Choose your identity",
      choices: take(4, shuffleArray(validRunnerIds)),
    },
    stageTwo: [
      generatePick(nonPrograms, 2, 12, "card", "card"),
      generatePick(runnerFormatCards, 2, 12, "card", "card"),
      generatePick(nonPrograms, 2, 12, "card", "card"),
      generatePick(runnerFormatCards, 2, 12, "card", "card"),
    ],
  };
}

function combine(
  corp: SideDraftPick[],
  runner: SideDraftPick[],
): CombinedItem[] {
  const out: CombinedItem[] = [];
  const len = Math.min(corp.length, runner.length);
  for (let i = 0; i < len; i++) {
    out.push({ type: "deck", corp: corp[i], runner: runner[i] });
  }
  return out;
}

function generateQuickDraft(): CombinedItem[] {
  const corp = generateCorpQuickDraft();
  const runner = generateRunnerQuickDraft();
  return [
    { type: "info", corp: corp.info, runner: runner.info },
    ...combine(corp.stageOne, runner.stageOne),
    { type: "identity", corp: corp.identity, runner: runner.identity },
    ...combine(corp.stageTwo, runner.stageTwo),
  ];
}

// ---------------------------------------------------------------------------
// Card construction
// ---------------------------------------------------------------------------

/**
 * Builds a Card from a string title or partial card data.
 * Mirrors build-card.
 */
function buildCard(card: string | RawCard): Card {
  let sCard: RawCard | null = null;
  let artSource: RawCard | null = null;

  if (typeof card === "string") {
    sCard = (serverCard(card) as RawCard | null) ?? null;
    artSource = null;
  } else {
    artSource = card;
    sCard =
      (serverCard(titleOf(card)) as RawCard | null) ??
      card;
  }
  const built = makeCard((sCard ?? card) as RawCard);
  if (artSource && (artSource as RawCard).art !== undefined) {
    (built as unknown as RawCard).art = (artSource as RawCard).art;
  }
  return built;
}

/** Sets the chosen identity for the given side. Mirrors set-id. */
function setId(state: GameState, side: string, cardName: string): void {
  try {
    const sCard = serverCard(cardName) as RawCard | null;
    const built =
      sCard && sameSide((sCard as RawCard).side, side)
        ? buildCard(sCard)
        : null;
    if (built) {
      const idSource = serverCard(built.title as string) as RawCard | null;
      const newIdRaw = makeCard((idSource ?? sCard) as RawCard);
      const newId = newIdRaw as Card & Record<string, unknown>;
      newId.zone = ["identity"];
      (newId as Record<string, unknown>).type = "Identity";
      const player = (state as unknown as Record<string, { identity: Card | null }>)[side];
      player.identity = newId;
      cardInit(state, side, newId, { resolveEffect: true, initData: true });
    } else {
      toast(state, side, `${cardName} isn't a valid card`);
    }
  } catch {
    toast(state, side, `${cardName} isn't a real card`);
  }
}

/** Adds prebuilt cards to the side's deck. */
function addCardsList(
  state: GameState,
  side: string,
  cards: Array<string | RawCard>,
): void {
  const built = cards.map((c: string | RawCard) => {
    const card = buildCard(c) as Card & Record<string, unknown>;
    card.zone = ["deck"];
    return card;
  });
  const player = (state as unknown as Record<string, { deck: Card[] }>)[side];
  player.deck = [...player.deck, ...built];
}

/** Adds `qty` copies of the same card to the side's deck. */
function addCardsQty(
  state: GameState,
  side: string,
  qty: number,
  card: string | RawCard,
): void {
  const repeated: Array<string | RawCard> = [];
  for (let i = 0; i < qty; i++) repeated.push(card);
  addCardsList(state, side, repeated);
}

// ---------------------------------------------------------------------------
// Prompt coordination
// ---------------------------------------------------------------------------

/** Mutable draft tracking on state. */
interface DraftState {
  phase: number;
  phases?: { corp: string[]; runner: string[] };
  pick?: Record<string, boolean>;
}

function getDraft(state: GameState): DraftState {
  return ((state as unknown as Record<string, unknown>).draft ??
    {}) as DraftState;
}

function setDraft(state: GameState, draft: DraftState | undefined): void {
  if (draft === undefined) {
    delete (state as unknown as Record<string, unknown>).draft;
  } else {
    (state as unknown as Record<string, unknown>).draft = draft;
  }
}

/**
 * Builds the prompt callback that defers eid completion until both players
 * have answered. Mirrors maybe-complete.
 */
function maybeComplete(
  state: GameState,
  side: string,
  eid: EID,
  f: (
    state: GameState,
    side: string,
    eid: EID | null,
    targets: unknown[],
  ) => void,
): (selection: unknown) => void {
  return (selection: unknown) => {
    const target = (selection as { value?: unknown })?.value ?? selection;
    const os = otherSide(side) as string;
    const draft = getDraft(state);
    const pick = draft.pick ?? {};
    const otherSideComplete = pick[os] === true;
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState) {
          if (!otherSideComplete) {
            const d = getDraft(s);
            d.pick = { ...(d.pick ?? {}), [side]: true };
            setDraft(s, d);
            showWaitPrompt(s, side, "your opponent to pick an option");
            // Deliberately leave the eid open until both players have picked.
          } else {
            clearWaitPrompt(s, otherSide(side) as string);
            effectCompleted(s, side, eid);
          }
        },
      ],
      [f, state, side, null, [target]],
    );
  };
}

/** Shows the same prompt to both sides. Mirrors show-draft-prompt. */
function showDraftPrompt(
  state: GameState,
  _side: string,
  eid: EID,
  corpAbility: Ability,
  runnerAbility: Ability,
): void {
  const draft = getDraft(state);
  draft.pick = {};
  setDraft(state, draft);
  const corpEffect = (corpAbility as Record<string, unknown>).effect as
    | ((
        state: GameState,
        side: string,
        eid: EID | null,
        targets: unknown[],
      ) => void)
    | undefined;
  const runnerEffect = (runnerAbility as Record<string, unknown>).effect as
    | ((
        state: GameState,
        side: string,
        eid: EID | null,
        targets: unknown[],
      ) => void)
    | undefined;
  showPrompt(
    state,
    "corp",
    null,
    (corpAbility as Record<string, unknown>).prompt as string,
    (corpAbility as Record<string, unknown>).choices,
    maybeComplete(
      state,
      "corp",
      eid,
      corpEffect ??
        ((s, sd, e) => {
          if (e) effectCompleted(s, sd, e);
        }),
    ),
    { promptType: "draft" },
  );
  showPrompt(
    state,
    "runner",
    null,
    (runnerAbility as Record<string, unknown>).prompt as string,
    (runnerAbility as Record<string, unknown>).choices,
    maybeComplete(
      state,
      "runner",
      eid,
      runnerEffect ??
        ((s, sd, e) => {
          if (e) effectCompleted(s, sd, e);
        }),
    ),
    { promptType: "draft" },
  );
}

// ---------------------------------------------------------------------------
// Per-phase prompt builders
// ---------------------------------------------------------------------------

function picksRemaining(s: string, remaining: number): string {
  return `${s} - you have ${quantify(remaining, "pick")} remaining`;
}

/** Info-stage prompt for one side. Mirrors info-prompt. */
function infoPrompt(pick: DraftInfoPick, remaining: number): Ability {
  return {
    prompt: picksRemaining(pick.prompt, remaining),
    choices: ["OK"],
    async: true,
    effect: ((
      state: GameState,
      side: string,
      eid: EID | null,
      _card: Card | null,
      _targets: unknown[],
    ) => {
      addCardsList(state, side, pick.cards);
      if (eid) effectCompleted(state, side, eid);
    }) as unknown as Ability["effect"],
  } as Ability;
}

/** Deck-pick prompt for one side. Mirrors deck-prompt. */
function deckPrompt(pick: DraftDeckPick, remaining: number): Ability {
  return {
    prompt: picksRemaining(pick.prompt, remaining + 1),
    choices: pick.choices,
    async: true,
    waitingPrompt: true,
    effect: ((
      state: GameState,
      side: string,
      eid: EID | null,
      _card: Card | null,
      targets: unknown[],
    ) => {
      const target = targets[0] as string;
      addCardsQty(state, side, pick.qty, target);
      if (eid) effectCompleted(state, side, eid);
    }) as unknown as Ability["effect"],
  } as Ability;
}

/**
 * Identity-stage prompt. Corp picks first, then runner. Mirrors id-prompt.
 */
function idPrompt(
  _state: GameState,
  _side: string,
  corp: DraftIdentityPick,
  runner: DraftIdentityPick,
  remaining: number,
): Ability {
  const runnerPrompt: Ability = {
    prompt: picksRemaining(runner.prompt, remaining + 1),
    choices: runner.choices,
    waitingPrompt: true,
    effect: ((
      state: GameState,
      side: string,
      _eid: EID | null,
      _card: Card | null,
      targets: unknown[],
    ) => {
      const target = targets[0] as string;
      systemMsg(state, side, `selects ${target} as their identity`);
      setId(state, side, target);
    }) as unknown as Ability["effect"],
  } as Ability;

  return {
    prompt: `${corp.prompt} - you have ${remaining} picks remaining`,
    choices: corp.choices,
    waitingPrompt: true,
    async: true,
    effect: ((
      state: GameState,
      side: string,
      _eid: EID | null,
      _card: Card | null,
      targets: unknown[],
    ) => {
      const target = targets[0] as string;
      systemMsg(state, side, `selects ${target} as their identity`);
      setId(state, side, target);
      // Runner identity prompt fires after corp picks.
      resolveAbility(state, "runner", runnerPrompt, null, []);
    }) as unknown as Ability["effect"],
  } as Ability;
}

// ---------------------------------------------------------------------------
// Resolution loop
// ---------------------------------------------------------------------------

function resolveQuickDraft(
  state: GameState,
  side: string,
  eid: EID,
  draftQueue: CombinedItem[],
): void {
  if (draftQueue.length === 0) {
    // Shuffle decks and clean up draft state.
    state.corp.deck = shuffleArray(state.corp.deck) as Card[];
    state.runner.deck = shuffleArray(state.runner.deck) as Card[];
    setDraft(state, undefined);
    effectCompleted(state, side, eid);
    return;
  }

  const [item, ...rest] = draftQueue;
  const remaining = rest.length;
  const draft = getDraft(state);
  draft.phase = (draft.phase ?? -1) + 1;
  setDraft(state, draft);

  const next = () => resolveQuickDraft(state, side, eid, rest);

  switch (item.type) {
    case "info": {
      const corpAbility = infoPrompt(item.corp as DraftInfoPick, remaining);
      const runnerAbility = infoPrompt(
        item.runner as DraftInfoPick,
        remaining,
      );
      wait_for(
        state,
        [{ asyncResult: "result" }, next],
        [showDraftPrompt, state, side, eid, corpAbility, runnerAbility],
      );
      return;
    }
    case "deck": {
      const corpAbility = deckPrompt(item.corp as DraftDeckPick, remaining);
      const runnerAbility = deckPrompt(
        item.runner as DraftDeckPick,
        remaining,
      );
      wait_for(
        state,
        [{ asyncResult: "result" }, next],
        [showDraftPrompt, state, side, eid, corpAbility, runnerAbility],
      );
      return;
    }
    case "identity": {
      const ability = idPrompt(
        state,
        "corp",
        item.corp as DraftIdentityPick,
        item.runner as DraftIdentityPick,
        remaining,
      );
      wait_for(
        state,
        [{ asyncResult: "result" }, next],
        [resolveAbility, state, side, ability, null, []],
      );
      return;
    }
  }
}

function phases(draftQueue: CombinedItem[], side: "corp" | "runner"): string[] {
  return draftQueue.map((item: CombinedItem) => {
    const pick = item[side] as SideDraftPick;
    return pick.phase;
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Entry point for quick-draft format initialization.
 * Mirrors check-quick-draft.
 */
export function checkQuickDraft(
  state: GameState,
  format: string,
  eid: EID,
): void {
  if (format !== "quick-draft") {
    effectCompleted(state, "", eid);
    return;
  }
  const draftQueue = generateQuickDraft();
  state.runner.agendaPointReq = 6;
  state.corp.agendaPointReq = 5;
  setDraft(state, {
    phase: -1,
    phases: {
      corp: phases(draftQueue, "corp"),
      runner: phases(draftQueue, "runner"),
    },
  });
  resolveQuickDraft(state, "corp", eid, draftQueue);
}
