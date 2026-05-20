// State summarization and diffing for client transmission.
// Mirrors: src/clj/game/core/diffs.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability, Subroutine } from "./types";
import {
  isCorp,
  isRunner,
  isAgenda,
  isAsset,
  isICE,
  isUpgrade,
  isHardware,
  isProgram,
  isResource,
  isEvent,
  isOperation,
  isInstalled,
  isFacedown,
  isRezzed,
  inHand,
  inDiscard,
} from "./card";
import { cardDef } from "./card_defs";
import { cardAbilityCost } from "./cost_fns";
import { canTrigger } from "./engine";
import { anyEffects, isDisabledReg, getEffects } from "./effects";
import { corpCanPayAndInstall, runnerCanPayAndInstall } from "./installing";
import { canPay, createClickCost } from "./payment";
import { canPlayInstant } from "./play_instants";
import { agendaPointsRequiredToWin } from "./winning";
import { installableServers } from "./board";
import { getCard } from "./finding";
import { dissocIn } from "../utils";
import { selectNonNilKeys } from "../../jinteki/utils";

// Generic JSON-like value used throughout state summaries and diffs.
type JsonLike = Record<string, unknown>;
// Player object as stored in state — kebab-case keys, so use record shape.
type Player = Record<string, unknown>;
// Ability summaries / cards summaries return shapes that are subsets of Card.
type CardLike = Card | (Partial<Card> & Record<string, unknown>);


// ---------------------------------------------------------------------------
// is-public? local helper (card.ts does not yet export it)
// ---------------------------------------------------------------------------

function isPublic(card: Card | null, side: string): boolean {
  if (!card) return false;
  // Identities and revealed cards are public to all
  if (card.type === "Identity") return true;
  if (card.seen) return true;
  if (isInstalled(card) && !isFacedown(card) && isRezzed(card)) return true;
  // Card belonging to viewer is visible
  return card.side?.toLowerCase?.() === side?.toLowerCase?.();
}

// ---------------------------------------------------------------------------
// playable? family
// ---------------------------------------------------------------------------

function isOwnedBy(card: Card | null, side: string): boolean {
  return side === "corp" ? isCorp(card) : isRunner(card);
}

export function playable(
  card: Card | null,
  state: GameState,
  side: string,
): Card | null {
  if (!card) return card;
  const owned = isOwnedBy(card, side);
  const inHandLike =
    inHand(card) ||
    anyEffects(
      state,
      side,
      "can-play-as-if-in-hand",
      (v: unknown) => v === true,
      card,
      [],
    ) ||
    !!card["as-flashback"];
  const stateRec = state as unknown as JsonLike;
  const phase12 = stateRec["corp-phase-12"] || stateRec["runner-phase-12"];

  if (!(owned && inHandLike) || phase12) return card;

  let canPlay = false;

  if (isAgenda(card) || isAsset(card) || isICE(card) || isUpgrade(card)) {
    const servers = installableServers(state, card);
    canPlay = (servers as string[]).some((server) =>
      corpCanPayAndInstall(
        state,
        "corp",
        { source: card, "source-type": "corp-install" } as unknown as EID,
        card,
        server,
        {
          "base-cost": [createClickCost(1, false, null)],
          action: "corp-click-install",
          "no-toast": true,
        },
      ),
    );
  } else if (isHardware(card) || isProgram(card) || isResource(card)) {
    canPlay =
      !state.run &&
      runnerCanPayAndInstall(
        state,
        "runner",
        { source: card, "source-type": "runner-install" } as unknown as EID,
        card,
        {
          "base-cost": [createClickCost(1, false, null)],
          "no-toast": true,
        } as unknown as Parameters<typeof runnerCanPayAndInstall>[4],
      );
  } else if (isEvent(card) || isOperation(card)) {
    const def = cardDef(card) as JsonLike | undefined;
    const baseCost = !card["as-flashback"]
      ? [createClickCost(1, false, null)]
      : def?.flashback;
    canPlay =
      !state.run &&
      canPlayInstant(
        state,
        side,
        { source: card, "source-type": "play" } as unknown as EID,
        card,
        { "base-cost": baseCost, silent: true } as unknown as Parameters<typeof canPlayInstant>[4],
      );
  }

  return canPlay ? { ...card, playable: true } : card;
}

export function flashbackPlayable(
  card: Card | null,
  state: GameState,
  side: string,
): Card | null {
  if (!card || !inDiscard(card)) return card;
  const def = cardDef(card) as JsonLike | undefined;
  const flashbackCost = def?.flashback;
  if (!flashbackCost) return card;
  const adjusted: Card = { ...card, "as-flashback": true };
  const result = playable(adjusted, state, side);
  return { ...card, "flashback-playable": result?.playable };
}

export function playableAsIfInHand(
  card: Card | null,
  state: GameState,
  side: string,
): Card | null {
  if (!card) return card;
  if (
    anyEffects(
      state,
      side,
      "can-play-as-if-in-hand",
      (v: unknown) => v === true,
      card,
      [],
    )
  ) {
    return { ...card, "playable-as-if-in-hand": true };
  }
  return card;
}

// ---------------------------------------------------------------------------
// abilities / subroutines summaries
// ---------------------------------------------------------------------------

const abilityKeys = [
  "cost-label",
  "dynamic",
  "index",
  "keep-menu-open",
  "label",
  "msg",
  "playable",
  "source",
] as const;

export function abilityPlayable(
  ability: Ability,
  abilityIdx: number,
  state: GameState,
  side: string,
  card: Card,
): Ability {
  const cost = cardAbilityCost(state, side, ability, card);
  const eid = {
    source: card,
    "source-type": "ability",
    "source-info": { "ability-idx": abilityIdx },
  } as unknown as EID;

  const active =
    !!card.active ||
    !!card.autoresolve ||
    !!ability?.autoresolve;
  // Note: clj uses (active? card) — TS card.ts has no `active?`; we approximate.
  const notDisabled = !isDisabledReg(state, card);
  const notActionDuringRun = !(ability?.action && state.run);
  const payable = canPay(state, side, eid, card, null, cost);
  const triggerable = canTrigger(
    state,
    side,
    eid,
    ability,
    card,
    [],
  );

  if (
    (active || ability?.autoresolve) &&
    notDisabled &&
    notActionDuringRun &&
    payable &&
    triggerable
  ) {
    return { ...ability, playable: true };
  }
  return ability;
}

export function abilitySummary(
  state: GameState,
  side: string,
  card: Card,
  abIdx: number,
  ability: Ability,
): Partial<Ability> {
  const a = abilityPlayable(ability, abIdx, state, side, card);
  return selectNonNilKeys(a, abilityKeys as unknown as (keyof typeof a)[]);
}

export function abilitiesSummary(
  abilities: Ability[] | undefined,
  card: Card,
  state: GameState,
  side: string,
): Partial<Ability>[] | undefined {
  if (!abilities || !abilities.length) return undefined;
  return abilities.map((ab, i) => abilitySummary(state, side, card, i, ab));
}

export function iconSummary(card: Card | null, state: GameState): Card | null {
  if (!card) return card;
  const icons = getEffects(state, null as unknown as string, "icon", card, []);
  if (icons && icons.length > 0) return { ...card, icon: [...icons] };
  return card;
}

const subroutineKeys = ["broken", "fired", "label", "msg", "resolve"] as const;

export function subroutinesSummary(
  subroutines: Subroutine[] | undefined,
): Partial<Subroutine>[] | undefined {
  if (!subroutines || !subroutines.length) return undefined;
  return subroutines.map((s) =>
    selectNonNilKeys(s, subroutineKeys as unknown as (keyof typeof s)[]),
  );
}

export function cardAbilitiesSummary(
  card: Card,
  state: GameState,
  side: string,
): Card {
  const out: Card = { ...card };
  const abilities = card.abilities as Ability[] | undefined;
  if (abilities) out.abilities = abilitiesSummary(abilities, card, state, side);
  const corpAbilities = card["corp-abilities"] as Ability[] | undefined;
  if (corpAbilities)
    out["corp-abilities"] = abilitiesSummary(corpAbilities, card, state, side);
  const runnerAbilities = card["runner-abilities"] as Ability[] | undefined;
  if (runnerAbilities)
    out["runner-abilities"] = abilitiesSummary(
      runnerAbilities,
      card,
      state,
      side,
    );
  if (card.subroutines) out.subroutines = subroutinesSummary(card.subroutines);
  return out;
}

// ---------------------------------------------------------------------------
// card-summary / cards-summary
// ---------------------------------------------------------------------------

const cardKeys = [
  "abilities",
  "advance-counter",
  "advanceable",
  "advancementcost",
  "agendapoints",
  "card-target",
  "cid",
  "code",
  "corp-abilities",
  "cost",
  "counter",
  "current-advancement-requirement",
  "current-points",
  "current-strength",
  "disabled",
  "extra-advance-counter",
  "face",
  "faces",
  "facedown",
  "flashback-playable",
  "host",
  "hosted",
  "icon",
  "images",
  "implementation",
  "installed",
  "new",
  "normalizedtitle",
  "playable",
  "playable-as-if-in-hand",
  "printed-title",
  "rezzed",
  "runner-abilities",
  "seen",
  "selected",
  "side",
  "strength",
  "subroutines",
  "subtype-target",
  "poison",
  "highlight-in-discard",
  "subtypes",
  "title",
  "type",
  "zone",
] as const;

const privateCardKeys = [
  "advance-counter",
  "cid",
  "counter",
  "extra-advance-counter",
  "host",
  "hosted",
  "icon",
  "new",
  "side",
  "zone",
] as const;

/** Returns only public information when card is in a private state. */
export function privateCard(card: Card): Partial<Card> {
  return selectNonNilKeys(
    card,
    privateCardKeys as unknown as (keyof typeof card)[],
  );
}

export function cardSummary(
  card: Card | null,
  state: GameState,
  side: string,
): Card | Partial<Card> | null {
  if (!card) return card;
  if (isPublic(card, side)) {
    let c: Card = card;
    if (c.host) {
      const h = dissocIn(c.host as unknown as JsonLike, ["hosted"]) as Card;
      c = { ...c, host: cardSummary(h, state, side) as Card };
    }
    if (c.hosted)
      c = {
        ...c,
        hosted: cardsSummary(c.hosted, state, side) as Card[] | undefined,
      };
    c = playable(c, state, side) as Card;
    c = flashbackPlayable(c, state, side) as Card;
    c = playableAsIfInHand(c, state, side) as Card;
    c = cardAbilitiesSummary(c, state, side);
    c = iconSummary(c, state) as Card;
    return selectNonNilKeys(c, cardKeys as unknown as (keyof typeof c)[]);
  }
  // private path
  let c: Card = card;
  if (c.host) {
    const h = dissocIn(c.host as unknown as JsonLike, ["hosted"]) as Card;
    c = { ...c, host: cardSummary(h, state, side) as Card };
  }
  if (c.hosted)
    c = {
      ...c,
      hosted: cardsSummary(c.hosted, state, side) as Card[] | undefined,
    };
  c = iconSummary(c, state) as Card;
  return privateCard(c);
}

export function cardsSummary(
  cards: (Card | null)[] | undefined,
  state: GameState,
  side: string,
): (Card | Partial<Card> | null)[] | undefined {
  if (!cards || !cards.length) return undefined;
  return cards.map((c) => cardSummary(c, state, side));
}

// ---------------------------------------------------------------------------
// prompt / toast summaries
// ---------------------------------------------------------------------------

const promptKeys = [
  "msg",
  "choices",
  "card",
  "prompt-type",
  "show-discard",
  "show-opponent-discard",
  "selectable",
  "eid",
  "offer-bad-pub?",
  "player",
  "base",
  "bonus",
  "strength",
  "unbeatable",
  "beat-trace",
  "link",
  "corp-credits",
  "runner-credits",
] as const;

function notEmpty<T>(v: T): T | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v) && v.length === 0) return undefined;
  if (typeof v === "object" && v && Object.keys(v).length === 0)
    return undefined;
  return v;
}

type PromptChoice = { value?: { cid?: string } & JsonLike } & JsonLike;
type PromptLike = JsonLike & {
  eid?: { eid?: number } & JsonLike;
  card?: Card;
  choices?: PromptChoice[];
};

export function promptSummary(
  prompt: PromptLike | null | undefined,
  _state: GameState,
  _side: string,
  sameSide: boolean,
): JsonLike | undefined {
  if (!sameSide || !prompt) return undefined;
  const p: PromptLike = { ...prompt };
  if (p.eid) {
    p.eid = p.eid.eid ? { eid: p.eid.eid } : undefined;
  }
  if (p.card) {
    const cc = selectNonNilKeys(p.card, [
      "cid",
      "title",
      "printed-title",
      "code",
      "side",
    ] as unknown as (keyof Card)[]);
    p.card = notEmpty(cc) as Card | undefined;
  }
  if (Array.isArray(p.choices)) {
    const mapped = p.choices.map((choice) => {
      if (choice?.value?.cid) {
        return {
          ...choice,
          value: notEmpty(
            selectNonNilKeys(choice.value, [
              "cid",
              "title",
              "printed-title",
            ] as unknown as (keyof typeof choice.value)[]),
          ),
        };
      }
      return choice;
    });
    p.choices = notEmpty(mapped) as PromptChoice[] | undefined;
  }
  return notEmpty(
    selectNonNilKeys(p, promptKeys as unknown as (keyof typeof p)[]),
  ) as JsonLike | undefined;
}

export function toastSummary(
  toast: unknown,
  sameSide: boolean,
): unknown | undefined {
  return sameSide ? toast : undefined;
}

// ---------------------------------------------------------------------------
// player-summary
// ---------------------------------------------------------------------------

const playerKeys = [
  "aid",
  "user",
  "identity",
  "basic-action-card",
  "deck",
  "deck-id",
  "hand",
  "discard",
  "scored",
  "rfg",
  "play-area",
  "current",
  "set-aside",
  "destroyed",
  "click",
  "credit",
  "toast",
  "hand-size",
  "keep",
  "quote",
  "properties",
  "prompt-state",
  "agenda-point",
  "agenda-point-req",
] as const;

export function playerSummary(
  player: Player,
  state: GameState,
  side: string,
  sameSide: boolean,
  additionalKeys: readonly string[],
): Player {
  const p: Player = { ...player };
  p.identity = cardSummary(p.identity as Card | null, state, side);
  p["basic-action-card"] = cardSummary(
    p["basic-action-card"] as Card | null,
    state,
    side,
  );
  p.current = cardsSummary(p.current as Card[] | undefined, state, side);
  p["play-area"] = cardsSummary(
    p["play-area"] as Card[] | undefined,
    state,
    side,
  );
  p.rfg = cardsSummary(p.rfg as Card[] | undefined, state, side);
  p.scored = cardsSummary(p.scored as Card[] | undefined, state, side);
  p["set-aside"] = cardsSummary(
    p["set-aside"] as Card[] | undefined,
    state,
    side,
  );
  p["prompt-state"] = promptSummary(
    p["prompt-state"] as PromptLike | undefined,
    state,
    side,
    sameSide,
  );
  p.toast = toastSummary(p.toast, sameSide);
  const allKeys = [...playerKeys, ...additionalKeys];
  return selectNonNilKeys(p, allKeys as unknown as (keyof typeof p)[]);
}

// ---------------------------------------------------------------------------
// corp / runner summaries
// ---------------------------------------------------------------------------

const corpKeys = ["servers", "bad-publicity"] as const;

type ServerSummary = {
  content?: (Card | Partial<Card> | null)[];
  ices?: (Card | Partial<Card> | null)[];
};

export function serversSummary(
  state: GameState,
  side: string,
): Record<string, ServerSummary> {
  const corpServers = (state.corp as unknown as JsonLike)?.servers as
    | Record<string, { content?: Card[]; ices?: Card[] }>
    | undefined;
  const servers = corpServers ?? {};
  const out: Record<string, ServerSummary> = {};
  for (const [serverKw, server] of Object.entries(servers)) {
    out[serverKw] = {
      content: cardsSummary(server.content, state, side),
      ices: cardsSummary(server.ices, state, side),
    };
  }
  return out;
}

export function pruneCards(cards: Card[]): Partial<Card>[] {
  return cards.map((c) =>
    selectNonNilKeys(c, cardKeys as unknown as (keyof typeof c)[]),
  );
}

/** Is the player's deck publicly visible? */
export function deckSummary(
  deck: Card[],
  sameSide: boolean,
  player: Player,
): Partial<Card>[] {
  if (sameSide && player?.["view-deck"]) return pruneCards(deck);
  return [];
}

/** Is the player's hand publicly visible? */
export function handSummary(
  hand: Card[],
  state: GameState,
  sameSide: boolean,
  side: string,
  player: Player,
): (Card | Partial<Card> | null)[] {
  if (sameSide || player?.openhand)
    return cardsSummary(hand, state, side) ?? [];
  return [];
}

export function discardSummary(
  discard: Card[],
  state: GameState,
  sameSide: boolean,
  side: string,
  player: Player,
): (Card | Partial<Card> | null)[] {
  if (sameSide || player?.openhand)
    return cardsSummary(discard, state, "corp") ?? [];
  return cardsSummary(discard, state, side) ?? [];
}

export function corpSummary(
  corp: Player,
  state: GameState,
  side: string,
): Player {
  const corpPlayer = side === "corp";
  const installList = corp?.["install-list"];
  const identity = corp?.identity as JsonLike | undefined;
  const meliesTarget = identity?.["melies-target"];
  const deck = (corp.deck as Card[]) ?? [];
  const hand = (corp.hand as Card[]) ?? [];
  const discard = (corp.discard as Card[]) ?? [];
  const p = playerSummary(corp, state, side, corpPlayer, corpKeys);
  p["agenda-point-req"] = agendaPointsRequiredToWin(state, "corp");
  p.deck = deckSummary(deck, corpPlayer, corp);
  p.hand = handSummary(hand, state, corpPlayer, "corp", corp);
  p.discard = discardSummary(discard, state, corpPlayer, side, corp);
  p["deck-count"] = deck.length;
  p["hand-count"] = hand.length;
  p.servers = serversSummary(state, side);
  if (corpPlayer && installList) p["install-list"] = installList;
  if (corpPlayer && meliesTarget) {
    p.identity = {
      ...((p.identity as JsonLike) ?? {}),
      "melies-target": meliesTarget,
    };
  }
  return p;
}

const runnerKeys = [
  "rig",
  "run-credit",
  "bad-pub-credit",
  "link",
  "tag",
  "memory",
  "brain-damage",
] as const;

type Rig = {
  hardware?: Card[];
  facedown?: Card[];
  program?: Card[];
  resource?: Card[];
} & JsonLike;

export function rigSummary(state: GameState, side: string): Rig {
  const rig = ((state.runner as unknown as JsonLike)?.rig as Rig | undefined) ?? {};
  return {
    ...rig,
    hardware: cardsSummary(rig.hardware, state, side) as Card[] | undefined,
    facedown: cardsSummary(rig.facedown, state, side) as Card[] | undefined,
    program: cardsSummary(rig.program, state, side) as Card[] | undefined,
    resource: cardsSummary(rig.resource, state, side) as Card[] | undefined,
  };
}

export function runnerSummary(
  runner: Player,
  state: GameState,
  side: string,
): Player {
  const runnerPlayer = side === "runner";
  const runnableList = runner?.["runnable-list"];
  const deck = (runner.deck as Card[]) ?? [];
  const hand = (runner.hand as Card[]) ?? [];
  const discard = (runner.discard as Card[]) ?? [];
  const p = playerSummary(runner, state, side, runnerPlayer, runnerKeys);
  p["agenda-point-req"] = agendaPointsRequiredToWin(state, "runner");
  p.deck = deckSummary(deck, runnerPlayer, runner);
  p.hand = handSummary(hand, state, runnerPlayer, "runner", runner);
  p.discard = pruneCards(discard);
  p["bad-pub-credit"] =
    (state.run as unknown as JsonLike)?.["bad-publicity-available"] ?? 0;
  p["deck-count"] = deck.length;
  p["hand-count"] = hand.length;
  p.rig = rigSummary(state, side);
  if (runnerPlayer && runnableList) p["runnable-list"] = runnableList;
  return p;
}

// ---------------------------------------------------------------------------
// options / user summaries
// ---------------------------------------------------------------------------

const optionsKeys = [
  "alt-arts",
  "background",
  "card-resolution",
  "corp-card-sleeve",
  "runner-card-sleeve",
  "language",
  "card-language",
  "pronouns",
  "show-alt-art",
] as const;

export function optionsSummary(
  options: JsonLike | null | undefined,
): JsonLike | undefined {
  if (
    !options ||
    (typeof options === "object" && Object.keys(options).length === 0)
  )
    return undefined;
  return selectNonNilKeys(
    options,
    optionsKeys as unknown as (keyof typeof options)[],
  ) as JsonLike;
}

const userKeys = [
  "_id",
  "username",
  "emailhash",
  "options",
  "special",
] as const;

export function userSummary(
  user: JsonLike | null | undefined,
): JsonLike | null | undefined {
  if (!user) return user;
  const u: JsonLike = { ...user };
  if ("options" in u) u.options = optionsSummary(u.options as JsonLike);
  return selectNonNilKeys(u, userKeys as unknown as (keyof typeof u)[]) as JsonLike;
}

// ---------------------------------------------------------------------------
// run / encounter summaries
// ---------------------------------------------------------------------------

const runKeys = [
  "server",
  "position",
  "corp-auto-no-action",
  "cannot-jack-out",
  "phase",
  "next-phase",
  "no-action",
  "source-card",
  "approached-ice-in-position?",
] as const;

export function runSummary(state: GameState): JsonLike | undefined {
  const run = state.run as unknown as JsonLike | null | undefined;
  if (!run) return undefined;
  const approached =
    run.phase === "approach-ice"
      ? !!getCard(state, run["current-ice"] as Card | null)
      : undefined;
  const r = {
    ...run,
    "approached-ice-in-position?": approached,
    "cannot-jack-out": anyEffects(
      state,
      "corp",
      "cannot-jack-out",
      (v: unknown) => v === true,
    ),
  };
  return selectNonNilKeys(r, runKeys as unknown as (keyof typeof r)[]) as JsonLike;
}

export function encounterIceSummary(
  ice: Card | null,
  state: GameState,
): Card | Partial<Card> | null | undefined {
  const c = getCard(state, ice);
  if (!c) return undefined;
  return cardSummary(c, state, "corp");
}

const encounterKeys = ["encounter-count", "ice", "no-action"] as const;

export function encountersSummary(state: GameState): JsonLike | undefined {
  const encounters = (state.encounters as unknown as JsonLike[]) ?? [];
  if (!encounters.length) return undefined;
  const current = encounters[encounters.length - 1];
  if (!current) return undefined;
  const out = {
    ...current,
    ice: encounterIceSummary(current.ice as Card | null, state),
    "encounter-count": encounters.length,
  };
  return selectNonNilKeys(
    out,
    encounterKeys as unknown as (keyof typeof out)[],
  ) as JsonLike;
}

// ---------------------------------------------------------------------------
// state-summary, strip-state, public-states
// ---------------------------------------------------------------------------

const stateKeys = [
  "active-player",
  "corp",
  "corp-phase-12",
  "corp-post-discard",
  "decklists",
  "encounters",
  "end-turn",
  "forced-encounter",
  "gameid",
  "last-revealed",
  "log",
  "mark",
  "options",
  "psi",
  "reason",
  "room",
  "run",
  "runner",
  "runner-phase-12",
  "runner-post-discard",
  "sfx",
  "sfx-current-id",
  "start-date",
  "stats",
  "trace",
  "turn",
  "typing",
  "winning-user",
  "winner",
] as const;

type StrippedState = JsonLike & {
  corp?: Player;
  runner?: Player;
  options?: JsonLike;
  log?: unknown[];
};

export function stripState(state: GameState): StrippedState {
  const s: StrippedState = { ...(state as unknown as JsonLike) } as StrippedState;
  const corp = s.corp;
  if (corp?.user)
    s.corp = { ...corp, user: userSummary(corp.user as JsonLike) };
  const runner = s.runner;
  if (runner?.user)
    s.runner = { ...runner, user: userSummary(runner.user as JsonLike) };
  s.stats = state.winner ? state.stats : undefined;
  s.run = runSummary(state);
  s.encounters = encountersSummary(state);
  return selectNonNilKeys(
    s,
    stateKeys as unknown as (keyof typeof s)[],
  ) as StrippedState;
}

export function stateSummary(
  stripped: StrippedState,
  state: GameState,
  side: string,
): StrippedState {
  return {
    ...stripped,
    corp: corpSummary(stripped.corp ?? {}, state, side),
    runner: runnerSummary(stripped.runner ?? {}, state, side),
  };
}

export function stripForReplay(
  stripped: StrippedState,
  corpPlayer: StrippedState,
  runnerPlayer: StrippedState,
): StrippedState {
  return { ...stripped, corp: corpPlayer.corp, runner: runnerPlayer.runner };
}

export function stripForSpectators(
  stripped: StrippedState,
  corpState: StrippedState,
  runnerState: StrippedState,
): StrippedState {
  const spectatorHands = stripped?.options?.spectatorhands;
  return {
    ...stripped,
    corp: spectatorHands ? corpState.corp : runnerState.corp,
    runner: spectatorHands ? runnerState.runner : corpState.runner,
  };
}

export function stripForCorpSpect(
  stripped: StrippedState,
  corpState: StrippedState,
  _runnerState: StrippedState,
): StrippedState {
  return { ...stripped, corp: corpState.corp, runner: corpState.runner };
}

export function stripForRunnerSpect(
  stripped: StrippedState,
  _corpState: StrippedState,
  runnerState: StrippedState,
): StrippedState {
  return { ...stripped, corp: runnerState.corp, runner: runnerState.runner };
}

type LogEntry = JsonLike & { public?: unknown };

function pickSideLog(log: LogEntry[] | unknown, side: string): unknown[] {
  return (Array.isArray(log) ? log : [])
    .map((entry: LogEntry) => entry?.[side] ?? entry?.public)
    .filter((x: unknown) => x != null);
}

export interface PublicStates {
  "corp-state": StrippedState;
  "runner-state": StrippedState;
  "spect-state"?: StrippedState;
  "corp-spect-state"?: StrippedState;
  "runner-spect-state"?: StrippedState;
  "hist-state": StrippedState;
}

/**
 * Generates privatised states for Corp, Runner, spectators, and replay history.
 */
export function publicStates(
  state: GameState,
  spectators = true,
  corpSpectators = true,
  runnerSpectators = true,
): PublicStates {
  const stripped = stripState(state);
  const corpState = (() => {
    const s = stateSummary(stripped, state, "corp");
    return { ...s, log: pickSideLog(s.log, "corp") };
  })();
  const runnerState = (() => {
    const s = stateSummary(stripped, state, "runner");
    return { ...s, log: pickSideLog(s.log, "runner") };
  })();
  const replayState = (() => {
    const s = stripForReplay(stripped, corpState, runnerState);
    return { ...s, log: pickSideLog(s.log, "public") };
  })();

  return {
    "corp-state": corpState,
    "runner-state": runnerState,
    "spect-state": spectators
      ? stripForSpectators(replayState, corpState, runnerState)
      : undefined,
    "corp-spect-state": corpSpectators
      ? stripForCorpSpect(replayState, corpState, runnerState)
      : undefined,
    "runner-spect-state": runnerSpectators
      ? stripForRunnerSpect(replayState, corpState, runnerState)
      : undefined,
    "hist-state": replayState,
  };
}

// ---------------------------------------------------------------------------
// differ.diff: returns [updates, deletions] tuple
// ---------------------------------------------------------------------------

type DifferTuple = [Record<string, unknown>, Record<string, unknown>];

function isPlainObject(v: unknown): v is JsonLike {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Minimal port of differ.core/diff for plain JSON-like maps. */
export function differDiff(
  a: unknown,
  b: unknown,
): DifferTuple {
  const updates: Record<string, unknown> = {};
  const deletions: Record<string, unknown> = {};
  if (!isPlainObject(a) || !isPlainObject(b)) {
    return [b as Record<string, unknown>, {}];
  }
  for (const k of Object.keys(b)) {
    if (!(k in a)) {
      updates[k] = b[k];
    } else if (a[k] !== b[k]) {
      if (isPlainObject(a[k]) && isPlainObject(b[k])) {
        const [u, d] = differDiff(a[k], b[k]);
        if (Object.keys(u).length) updates[k] = u;
        if (Object.keys(d).length) deletions[k] = d;
      } else {
        updates[k] = b[k];
      }
    }
  }
  for (const k of Object.keys(a)) {
    if (!(k in b)) deletions[k] = 0;
  }
  return [updates, deletions];
}

// ---------------------------------------------------------------------------
// Log diffing
// ---------------------------------------------------------------------------

function fakeLogDiff(
  oldS: { log?: unknown[] } | null | undefined,
  newS: { log?: unknown[] } | null | undefined,
): DifferTuple {
  const oldLog = oldS?.log ?? [];
  const newLog = newS?.log ?? [];
  const changes = newLog.slice(oldLog.length);
  if (changes.length) {
    const out: unknown[] = [];
    for (const c of changes) out.push("+", c);
    return [{ log: out }, {}];
  }
  return [{}, {}];
}

function getMessageDiff(
  oldState: JsonLike | null | undefined,
  newState: JsonLike | GameState | null,
  side: string,
): DifferTuple {
  const oldMessages = {
    log: pickSideLog((oldState?.log as LogEntry[] | undefined) ?? [], side),
  };
  const newMessages = {
    log: pickSideLog(
      ((newState as unknown as JsonLike)?.log as LogEntry[] | undefined) ?? [],
      side,
    ),
  };
  return fakeLogDiff(oldMessages, newMessages);
}

function diffAndPatchLog(
  oldState: JsonLike | null | undefined,
  newState: JsonLike | null | undefined,
  messageDiff: DifferTuple,
): DifferTuple {
  const a: JsonLike = { ...(oldState ?? {}) };
  const b: JsonLike = { ...(newState ?? {}) };
  delete a.log;
  delete b.log;
  const baseDiff = differDiff(a, b);
  const logDiff = (messageDiff[0] as JsonLike)?.log;
  if (logDiff) {
    baseDiff[0] = { ...baseDiff[0], log: logDiff };
  }
  return baseDiff;
}

export interface PublicDiffs {
  "runner-diff": DifferTuple;
  "corp-diff": DifferTuple;
  "spect-diff"?: DifferTuple;
  "runner-spect-diff"?: DifferTuple;
  "corp-spect-diff"?: DifferTuple;
  "hist-diff": DifferTuple;
}

export function publicDiffs(
  oldState: GameState | null | undefined,
  newState: GameState,
  spectators: boolean,
  corpSpectators: boolean,
  runnerSpectators: boolean,
): PublicDiffs {
  const oldStates = oldState
    ? publicStates(oldState, spectators, corpSpectators, runnerSpectators)
    : ({} as Partial<PublicStates>);
  const newStates = publicStates(
    newState,
    spectators,
    corpSpectators,
    runnerSpectators,
  );

  const runnerMsgDiff = getMessageDiff(oldState as unknown as JsonLike, newState as unknown as JsonLike, "runner");
  const corpMsgDiff = getMessageDiff(oldState as unknown as JsonLike, newState as unknown as JsonLike, "corp");
  const publicMsgDiff = getMessageDiff(oldState as unknown as JsonLike, newState as unknown as JsonLike, "public");

  return {
    "runner-diff": diffAndPatchLog(
      oldStates["runner-state"],
      newStates["runner-state"],
      runnerMsgDiff,
    ),
    "corp-diff": diffAndPatchLog(
      oldStates["corp-state"],
      newStates["corp-state"],
      corpMsgDiff,
    ),
    "spect-diff": spectators
      ? diffAndPatchLog(
          oldStates["spect-state"],
          newStates["spect-state"],
          publicMsgDiff,
        )
      : undefined,
    "runner-spect-diff": runnerSpectators
      ? diffAndPatchLog(
          oldStates["runner-spect-state"],
          newStates["runner-spect-state"],
          runnerMsgDiff,
        )
      : undefined,
    "corp-spect-diff": corpSpectators
      ? diffAndPatchLog(
          oldStates["corp-spect-state"],
          newStates["corp-spect-state"],
          corpMsgDiff,
        )
      : undefined,
    "hist-diff": diffAndPatchLog(
      oldStates["hist-state"],
      newStates["hist-state"],
      publicMsgDiff,
    ),
  };
}

export interface MessageDiffs {
  "runner-diff": DifferTuple;
  "corp-diff": DifferTuple;
  "spect-diff": DifferTuple;
  "runner-spect-diff": DifferTuple;
  "corp-spect-diff": DifferTuple;
  "hist-diff": DifferTuple;
}

export function messageDiffs(
  oldState: GameState | null | undefined,
  newState: GameState,
): MessageDiffs {
  const runnerDiff = getMessageDiff(oldState as unknown as JsonLike, newState as unknown as JsonLike, "runner");
  const corpDiff = getMessageDiff(oldState as unknown as JsonLike, newState as unknown as JsonLike, "corp");
  const publicDiff = getMessageDiff(oldState as unknown as JsonLike, newState as unknown as JsonLike, "public");
  return {
    "runner-diff": runnerDiff,
    "corp-diff": corpDiff,
    "spect-diff": publicDiff,
    "runner-spect-diff": runnerDiff,
    "corp-spect-diff": corpDiff,
    "hist-diff": publicDiff,
  };
}
