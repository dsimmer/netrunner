// State summarization and diffing for client transmission.
// Mirrors: src/clj/game/core/diffs.clj

import type { GameState } from "./state.js";
import type { Card } from "./card.js";
import {
  isCorp, isRunner, isAgenda, isAsset, isICE, isUpgrade,
  isHardware, isProgram, isResource, isEvent, isOperation,
  isInstalled, isFacedown, isRezzed, inHand, inDiscard,
} from "./card.js";
import { cardDef } from "./card_defs.js";
import { cardAbilityCost } from "./cost_fns.js";
import { canTrigger } from "./engine.js";
import { anyEffects, isDisabledReg, getEffects } from "./effects.js";
import {
  corpCanPayAndInstall, runnerCanPayAndInstall,
} from "./installing.js";
import { canPay, createClickCost } from "./payment.js";
import { canPlayInstant } from "./play_instants.js";
import { agendaPointsRequiredToWin } from "./winning.js";
import { installableServers } from "./board.js";
import { getCard } from "./finding.js";
import { dissocIn } from "../utils.js";
import { selectNonNilKeys } from "../../jinteki/utils.js";

// ---------------------------------------------------------------------------
// is-public? local helper (card.ts does not yet export it)
// ---------------------------------------------------------------------------

function isPublic(card: any, side: string): boolean {
  if (!card) return false;
  // Identities and revealed cards are public to all
  if ((card as any).type === "Identity") return true;
  if ((card as any).seen) return true;
  if (isInstalled(card) && !isFacedown(card) && isRezzed(card)) return true;
  // Card belonging to viewer is visible
  return (card as any).side?.toLowerCase?.() === side?.toLowerCase?.();
}

// ---------------------------------------------------------------------------
// playable? family
// ---------------------------------------------------------------------------

function isOwnedBy(card: any, side: string): boolean {
  return side === "corp" ? isCorp(card) : isRunner(card);
}

export function playable(card: any, state: GameState, side: string): any {
  if (!card) return card;
  const owned = isOwnedBy(card, side);
  const inHandLike =
    inHand(card) ||
    anyEffects(state, side, "can-play-as-if-in-hand", (v: unknown) => v === true, card) ||
    !!(card as any)["as-flashback"];
  const phase12 = (state as any)["corp-phase-12"] || (state as any)["runner-phase-12"];

  if (!(owned && inHandLike) || phase12) return card;

  let canPlay = false;

  if (isAgenda(card) || isAsset(card) || isICE(card) || isUpgrade(card)) {
    const servers = installableServers(state, card);
    canPlay = servers.some((server: any) =>
      corpCanPayAndInstall(
        state, "corp",
        { source: card, "source-type": "corp-install" },
        card, server,
        {
          "base-cost": [createClickCost(1, false, null)],
          action: "corp-click-install",
          "no-toast": true,
        },
      ),
    );
  } else if (isHardware(card) || isProgram(card) || isResource(card)) {
    canPlay = !state.run && runnerCanPayAndInstall(
      state, "runner",
      { source: card, "source-type": "runner-install" },
      card,
      {
        "base-cost": [createClickCost(1, false, null)],
        "no-toast": true,
      },
    );
  } else if (isEvent(card) || isOperation(card)) {
    const baseCost = !(card as any)["as-flashback"]
      ? [createClickCost(1, false, null)]
      : (cardDef(card) as any)?.flashback;
    canPlay = !state.run && canPlayInstant(
      state, side,
      { source: card, "source-type": "play" },
      card,
      { "base-cost": baseCost, silent: true },
    );
  }

  return canPlay ? { ...card, playable: true } : card;
}

export function flashbackPlayable(card: any, state: GameState, side: string): any {
  if (!card || !inDiscard(card)) return card;
  const flashbackCost = (cardDef(card) as any)?.flashback;
  if (!flashbackCost) return card;
  const adjusted = { ...card, "as-flashback": true };
  const result = playable(adjusted, state, side);
  return { ...card, "flashback-playable": result?.playable };
}

export function playableAsIfInHand(card: any, state: GameState, side: string): any {
  if (!card) return card;
  if (anyEffects(state, side, "can-play-as-if-in-hand", (v: unknown) => v === true, card)) {
    return { ...card, "playable-as-if-in-hand": true };
  }
  return card;
}

// ---------------------------------------------------------------------------
// abilities / subroutines summaries
// ---------------------------------------------------------------------------

const abilityKeys = [
  "cost-label", "dynamic", "index", "keep-menu-open",
  "label", "msg", "playable", "source",
] as const;

export function abilityPlayable(
  ability: any, abilityIdx: number, state: GameState, side: string, card: Card,
): any {
  const cost = cardAbilityCost(state, side, ability, card);
  const eid = {
    source: card,
    "source-type": "ability",
    "source-info": { "ability-idx": abilityIdx },
  } as any;

  const active = !!(card as any).active || !!(card as any).autoresolve || !!ability?.autoresolve;
  // Note: clj uses (active? card) — TS card.ts has no `active?`; we approximate.
  const notDisabled = !isDisabledReg(state, card);
  const notActionDuringRun = !(ability?.action && state.run);
  const payable = (canPay as any)(state, side, eid, card, null, cost);
  const triggerable = (canTrigger as any)(state, side, eid, ability, card, null);

  if ((active || ability?.autoresolve) && notDisabled && notActionDuringRun && payable && triggerable) {
    return { ...ability, playable: true };
  }
  return ability;
}

export function abilitySummary(
  state: GameState, side: string, card: Card, abIdx: number, ability: any,
): any {
  const a = abilityPlayable(ability, abIdx, state, side, card);
  return selectNonNilKeys(a, abilityKeys as unknown as (keyof typeof a)[]);
}

export function abilitiesSummary(
  abilities: any[] | undefined, card: Card, state: GameState, side: string,
): any[] | undefined {
  if (!abilities || !abilities.length) return undefined;
  return abilities.map((ab, i) => abilitySummary(state, side, card, i, ab));
}

export function iconSummary(card: any, state: GameState): any {
  const icons = getEffects(state, null as any, "icon", card, []);
  if (icons && icons.length > 0) return { ...card, icon: [...icons] };
  return card;
}

const subroutineKeys = ["broken", "fired", "label", "msg", "resolve"] as const;

export function subroutinesSummary(subroutines: any[] | undefined): any[] | undefined {
  if (!subroutines || !subroutines.length) return undefined;
  return subroutines.map((s) => selectNonNilKeys(s, subroutineKeys as unknown as (keyof typeof s)[]));
}

export function cardAbilitiesSummary(card: any, state: GameState, side: string): any {
  const out = { ...card };
  if (card.abilities) out.abilities = abilitiesSummary(card.abilities, card, state, side);
  if (card["corp-abilities"]) out["corp-abilities"] = abilitiesSummary(card["corp-abilities"], card, state, side);
  if (card["runner-abilities"]) out["runner-abilities"] = abilitiesSummary(card["runner-abilities"], card, state, side);
  if (card.subroutines) out.subroutines = subroutinesSummary(card.subroutines);
  return out;
}

// ---------------------------------------------------------------------------
// card-summary / cards-summary
// ---------------------------------------------------------------------------

const cardKeys = [
  "abilities", "advance-counter", "advanceable", "advancementcost",
  "agendapoints", "card-target", "cid", "code", "corp-abilities",
  "cost", "counter", "current-advancement-requirement", "current-points",
  "current-strength", "disabled", "extra-advance-counter", "face",
  "faces", "facedown", "flashback-playable", "host", "hosted",
  "icon", "images", "implementation", "installed", "new",
  "normalizedtitle", "playable", "playable-as-if-in-hand", "printed-title",
  "rezzed", "runner-abilities", "seen", "selected", "side",
  "strength", "subroutines", "subtype-target", "poison",
  "highlight-in-discard", "subtypes", "title", "type", "zone",
] as const;

const privateCardKeys = [
  "advance-counter", "cid", "counter", "extra-advance-counter",
  "host", "hosted", "icon", "new", "side", "zone",
] as const;

/** Returns only public information when card is in a private state. */
export function privateCard(card: any): any {
  return selectNonNilKeys(card, privateCardKeys as unknown as (keyof typeof card)[]);
}

export function cardSummary(card: any, state: GameState, side: string): any {
  if (!card) return card;
  if (isPublic(card, side)) {
    let c: any = card;
    if (c.host) {
      const h = dissocIn(c.host as any, ["hosted"] as any);
      c = { ...c, host: cardSummary(h, state, side) };
    }
    if (c.hosted) c = { ...c, hosted: cardsSummary(c.hosted, state, side) };
    c = playable(c, state, side);
    c = flashbackPlayable(c, state, side);
    c = playableAsIfInHand(c, state, side);
    c = cardAbilitiesSummary(c, state, side);
    c = iconSummary(c, state);
    return selectNonNilKeys(c, cardKeys as unknown as (keyof typeof c)[]);
  }
  // private path
  let c: any = card;
  if (c.host) {
    const h = dissocIn(c.host as any, ["hosted"] as any);
    c = { ...c, host: cardSummary(h, state, side) };
  }
  if (c.hosted) c = { ...c, hosted: cardsSummary(c.hosted, state, side) };
  c = iconSummary(c, state);
  return privateCard(c);
}

export function cardsSummary(cards: any[] | undefined, state: GameState, side: string): any[] | undefined {
  if (!cards || !cards.length) return undefined;
  return cards.map((c) => cardSummary(c, state, side));
}

// ---------------------------------------------------------------------------
// prompt / toast summaries
// ---------------------------------------------------------------------------

const promptKeys = [
  "msg", "choices", "card", "prompt-type", "show-discard",
  "show-opponent-discard", "selectable", "eid",
  "offer-bad-pub?",
  "player", "base", "bonus", "strength", "unbeatable",
  "beat-trace", "link", "corp-credits", "runner-credits",
] as const;

function notEmpty<T>(v: T): T | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v) && v.length === 0) return undefined;
  if (typeof v === "object" && v && Object.keys(v).length === 0) return undefined;
  return v;
}

export function promptSummary(prompt: any, _state: GameState, _side: string, sameSide: boolean): any {
  if (!sameSide || !prompt) return undefined;
  const p: any = { ...prompt };
  if (p.eid) {
    p.eid = p.eid.eid ? { eid: p.eid.eid } : undefined;
  }
  if (p.card) {
    const cc = selectNonNilKeys(p.card, ["cid", "title", "printed-title", "code", "side"] as any);
    p.card = notEmpty(cc);
  }
  if (Array.isArray(p.choices)) {
    const mapped = p.choices.map((choice: any) => {
      if (choice?.value?.cid) {
        return {
          ...choice,
          value: notEmpty(selectNonNilKeys(choice.value, ["cid", "title", "printed-title"] as any)),
        };
      }
      return choice;
    });
    p.choices = notEmpty(mapped);
  }
  return notEmpty(selectNonNilKeys(p, promptKeys as unknown as (keyof typeof p)[]));
}

export function toastSummary(toast: any, sameSide: boolean): any {
  return sameSide ? toast : undefined;
}

// ---------------------------------------------------------------------------
// player-summary
// ---------------------------------------------------------------------------

const playerKeys = [
  "aid", "user", "identity", "basic-action-card", "deck", "deck-id",
  "hand", "discard", "scored", "rfg", "play-area", "current",
  "set-aside", "destroyed", "click", "credit", "toast", "hand-size",
  "keep", "quote", "properties", "prompt-state", "agenda-point",
  "agenda-point-req",
] as const;

export function playerSummary(
  player: any, state: GameState, side: string, sameSide: boolean,
  additionalKeys: readonly string[],
): any {
  const p: any = { ...player };
  p.identity = cardSummary(p.identity, state, side);
  p["basic-action-card"] = cardSummary(p["basic-action-card"], state, side);
  p.current = cardsSummary(p.current, state, side);
  p["play-area"] = cardsSummary(p["play-area"], state, side);
  p.rfg = cardsSummary(p.rfg, state, side);
  p.scored = cardsSummary(p.scored, state, side);
  p["set-aside"] = cardsSummary(p["set-aside"], state, side);
  p["prompt-state"] = promptSummary(p["prompt-state"], state, side, sameSide);
  p.toast = toastSummary(p.toast, sameSide);
  const allKeys = [...playerKeys, ...additionalKeys];
  return selectNonNilKeys(p, allKeys as unknown as (keyof typeof p)[]);
}

// ---------------------------------------------------------------------------
// corp / runner summaries
// ---------------------------------------------------------------------------

const corpKeys = ["servers", "bad-publicity"] as const;

export function serversSummary(state: GameState, side: string): Record<string, any> {
  const servers = (state.corp as any)?.servers ?? {};
  const out: Record<string, any> = {};
  for (const [serverKw, server] of Object.entries(servers)) {
    const s = server as any;
    out[serverKw] = {
      content: cardsSummary(s.content, state, side),
      ices: cardsSummary(s.ices, state, side),
    };
  }
  return out;
}

export function pruneCards(cards: any[]): any[] {
  return cards.map((c) => selectNonNilKeys(c, cardKeys as unknown as (keyof typeof c)[]));
}

/** Is the player's deck publicly visible? */
export function deckSummary(deck: any[], sameSide: boolean, player: any): any[] {
  if (sameSide && player?.["view-deck"]) return pruneCards(deck);
  return [];
}

/** Is the player's hand publicly visible? */
export function handSummary(
  hand: any[], state: GameState, sameSide: boolean, side: string, player: any,
): any[] {
  if (sameSide || player?.openhand) return cardsSummary(hand, state, side) ?? [];
  return [];
}

export function discardSummary(
  discard: any[], state: GameState, sameSide: boolean, side: string, player: any,
): any[] {
  if (sameSide || player?.openhand) return cardsSummary(discard, state, "corp") ?? [];
  return cardsSummary(discard, state, side) ?? [];
}

export function corpSummary(corp: any, state: GameState, side: string): any {
  const corpPlayer = side === "corp";
  const installList = corp?.["install-list"];
  const meliesTarget = corp?.identity?.["melies-target"];
  let p = playerSummary(corp, state, side, corpPlayer, corpKeys);
  (p as any)["agenda-point-req"] = agendaPointsRequiredToWin(state, "corp");
  (p as any).deck = deckSummary(corp.deck ?? [], corpPlayer, corp);
  (p as any).hand = handSummary(corp.hand ?? [], state, corpPlayer, "corp", corp);
  (p as any).discard = discardSummary(corp.discard ?? [], state, corpPlayer, side, corp);
  (p as any)["deck-count"] = (corp.deck ?? []).length;
  (p as any)["hand-count"] = (corp.hand ?? []).length;
  (p as any).servers = serversSummary(state, side);
  if (corpPlayer && installList) (p as any)["install-list"] = installList;
  if (corpPlayer && meliesTarget) {
    (p as any).identity = { ...((p as any).identity ?? {}), "melies-target": meliesTarget };
  }
  return p;
}

const runnerKeys = [
  "rig", "run-credit", "bad-pub-credit", "link",
  "tag", "memory", "brain-damage",
] as const;

export function rigSummary(state: GameState, side: string): any {
  const rig = (state.runner as any)?.rig ?? {};
  return {
    ...rig,
    hardware: cardsSummary(rig.hardware, state, side),
    facedown: cardsSummary(rig.facedown, state, side),
    program: cardsSummary(rig.program, state, side),
    resource: cardsSummary(rig.resource, state, side),
  };
}

export function runnerSummary(runner: any, state: GameState, side: string): any {
  const runnerPlayer = side === "runner";
  const runnableList = runner?.["runnable-list"];
  let p = playerSummary(runner, state, side, runnerPlayer, runnerKeys);
  (p as any)["agenda-point-req"] = agendaPointsRequiredToWin(state, "runner");
  (p as any).deck = deckSummary(runner.deck ?? [], runnerPlayer, runner);
  (p as any).hand = handSummary(runner.hand ?? [], state, runnerPlayer, "runner", runner);
  (p as any).discard = pruneCards(runner.discard ?? []);
  (p as any)["bad-pub-credit"] = (state.run as any)?.["bad-publicity-available"] ?? 0;
  (p as any)["deck-count"] = (runner.deck ?? []).length;
  (p as any)["hand-count"] = (runner.hand ?? []).length;
  (p as any).rig = rigSummary(state, side);
  if (runnerPlayer && runnableList) (p as any)["runnable-list"] = runnableList;
  return p;
}

// ---------------------------------------------------------------------------
// options / user summaries
// ---------------------------------------------------------------------------

const optionsKeys = [
  "alt-arts", "background", "card-resolution", "corp-card-sleeve",
  "runner-card-sleeve", "language", "card-language", "pronouns",
  "show-alt-art",
] as const;

export function optionsSummary(options: any): any {
  if (!options || (typeof options === "object" && Object.keys(options).length === 0)) return undefined;
  return selectNonNilKeys(options, optionsKeys as unknown as (keyof typeof options)[]);
}

const userKeys = ["_id", "username", "emailhash", "options", "special"] as const;

export function userSummary(user: any): any {
  if (!user) return user;
  const u: any = { ...user };
  if ("options" in u) u.options = optionsSummary(u.options);
  return selectNonNilKeys(u, userKeys as unknown as (keyof typeof u)[]);
}

// ---------------------------------------------------------------------------
// run / encounter summaries
// ---------------------------------------------------------------------------

const runKeys = [
  "server", "position", "corp-auto-no-action", "cannot-jack-out",
  "phase", "next-phase", "no-action", "source-card",
  "approached-ice-in-position?",
] as const;

export function runSummary(state: GameState): any {
  const run = state.run as any;
  if (!run) return undefined;
  const approached = run.phase === "approach-ice"
    ? !!getCard(state, run["current-ice"])
    : undefined;
  const r = {
    ...run,
    "approached-ice-in-position?": approached,
    "cannot-jack-out": anyEffects(state, "corp", "cannot-jack-out", (v: unknown) => v === true),
  };
  return selectNonNilKeys(r, runKeys as unknown as (keyof typeof r)[]);
}

export function encounterIceSummary(ice: any, state: GameState): any {
  const c = getCard(state, ice);
  if (!c) return undefined;
  return cardSummary(c, state, "corp");
}

const encounterKeys = ["encounter-count", "ice", "no-action"] as const;

export function encountersSummary(state: GameState): any {
  const encounters = (state.encounters as any[]) ?? [];
  if (!encounters.length) return undefined;
  const current = encounters[encounters.length - 1];
  if (!current) return undefined;
  const out = {
    ...current,
    ice: encounterIceSummary(current.ice, state),
    "encounter-count": encounters.length,
  };
  return selectNonNilKeys(out, encounterKeys as unknown as (keyof typeof out)[]);
}

// ---------------------------------------------------------------------------
// state-summary, strip-state, public-states
// ---------------------------------------------------------------------------

const stateKeys = [
  "active-player", "corp", "corp-phase-12", "corp-post-discard",
  "decklists", "encounters", "end-turn", "forced-encounter",
  "gameid", "last-revealed", "log", "mark", "options", "psi",
  "reason", "room", "run", "runner", "runner-phase-12",
  "runner-post-discard", "sfx", "sfx-current-id", "start-date",
  "stats", "trace", "turn", "typing", "winning-user", "winner",
] as const;

export function stripState(state: GameState): any {
  const s: any = { ...state };
  if (s.corp?.user) s.corp = { ...s.corp, user: userSummary(s.corp.user) };
  if (s.runner?.user) s.runner = { ...s.runner, user: userSummary(s.runner.user) };
  s.stats = (state as any).winner ? state.stats : undefined;
  s.run = runSummary(state);
  s.encounters = encountersSummary(state);
  return selectNonNilKeys(s, stateKeys as unknown as (keyof typeof s)[]);
}

export function stateSummary(stripped: any, state: GameState, side: string): any {
  return {
    ...stripped,
    corp: corpSummary(stripped.corp, state, side),
    runner: runnerSummary(stripped.runner, state, side),
  };
}

export function stripForReplay(stripped: any, corpPlayer: any, runnerPlayer: any): any {
  return { ...stripped, corp: corpPlayer.corp, runner: runnerPlayer.runner };
}

export function stripForSpectators(stripped: any, corpState: any, runnerState: any): any {
  const spectatorHands = stripped?.options?.spectatorhands;
  return {
    ...stripped,
    corp: spectatorHands ? corpState.corp : runnerState.corp,
    runner: spectatorHands ? runnerState.runner : corpState.runner,
  };
}

export function stripForCorpSpect(stripped: any, corpState: any, runnerState: any): any {
  return { ...stripped, corp: corpState.corp, runner: corpState.runner };
}

export function stripForRunnerSpect(stripped: any, corpState: any, runnerState: any): any {
  return { ...stripped, corp: runnerState.corp, runner: runnerState.runner };
}

function pickSideLog(log: any[], side: string): any[] {
  return (log ?? []).map((entry) => entry?.[side] ?? entry?.public).filter((x) => x != null);
}

export interface PublicStates {
  "corp-state": any;
  "runner-state": any;
  "spect-state": any;
  "corp-spect-state": any;
  "runner-spect-state": any;
  "hist-state": any;
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
    return { ...s, log: pickSideLog((s as any).log, "corp") };
  })();
  const runnerState = (() => {
    const s = stateSummary(stripped, state, "runner");
    return { ...s, log: pickSideLog((s as any).log, "runner") };
  })();
  const replayState = (() => {
    const s = stripForReplay(stripped, corpState, runnerState);
    return { ...s, log: pickSideLog((s as any).log, "public") };
  })();

  return {
    "corp-state": corpState,
    "runner-state": runnerState,
    "spect-state": spectators ? stripForSpectators(replayState, corpState, runnerState) : undefined,
    "corp-spect-state": corpSpectators ? stripForCorpSpect(replayState, corpState, runnerState) : undefined,
    "runner-spect-state": runnerSpectators ? stripForRunnerSpect(replayState, corpState, runnerState) : undefined,
    "hist-state": replayState,
  };
}

// ---------------------------------------------------------------------------
// differ.diff: returns [updates, deletions] tuple
// ---------------------------------------------------------------------------

type DifferTuple = [Record<string, any>, Record<string, any>];

function isPlainObject(v: any): boolean {
  return v && typeof v === "object" && !Array.isArray(v);
}

/** Minimal port of differ.core/diff for plain JSON-like maps. */
export function differDiff(a: any, b: any): DifferTuple {
  const updates: Record<string, any> = {};
  const deletions: Record<string, any> = {};
  if (!isPlainObject(a) || !isPlainObject(b)) {
    return [b, {}];
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

function fakeLogDiff(oldS: any, newS: any): [Record<string, any>, Record<string, any>] {
  const oldLog = (oldS?.log ?? []) as any[];
  const newLog = (newS?.log ?? []) as any[];
  const changes = newLog.slice(oldLog.length);
  if (changes.length) {
    const out: any[] = [];
    for (const c of changes) out.push("+", c);
    return [{ log: out }, {}];
  }
  return [{}, {}];
}

function getMessageDiff(oldState: any, newState: GameState | null, side: string): [Record<string, any>, Record<string, any>] {
  const oldMessages = { log: pickSideLog(oldState?.log ?? [], side) };
  const newMessages = { log: pickSideLog((newState as any)?.log ?? [], side) };
  return fakeLogDiff(oldMessages, newMessages);
}

function diffAndPatchLog(
  oldState: any, newState: any,
  messageDiff: [Record<string, any>, Record<string, any>],
): DifferTuple {
  const a = { ...(oldState ?? {}) };
  const b = { ...(newState ?? {}) };
  delete a.log;
  delete b.log;
  const baseDiff = differDiff(a, b);
  const logDiff = messageDiff[0]?.log;
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
  oldState: any, newState: GameState,
  spectators: boolean, corpSpectators: boolean, runnerSpectators: boolean,
): PublicDiffs {
  const oldStates = oldState ? publicStates(oldState as GameState, spectators, corpSpectators, runnerSpectators) : ({} as Partial<PublicStates>);
  const newStates = publicStates(newState, spectators, corpSpectators, runnerSpectators);

  const runnerMsgDiff = getMessageDiff(oldState, newState, "runner");
  const corpMsgDiff = getMessageDiff(oldState, newState, "corp");
  const publicMsgDiff = getMessageDiff(oldState, newState, "public");

  return {
    "runner-diff": diffAndPatchLog(oldStates["runner-state"], newStates["runner-state"], runnerMsgDiff),
    "corp-diff": diffAndPatchLog(oldStates["corp-state"], newStates["corp-state"], corpMsgDiff),
    "spect-diff": spectators
      ? diffAndPatchLog(oldStates["spect-state"], newStates["spect-state"], publicMsgDiff)
      : undefined,
    "runner-spect-diff": runnerSpectators
      ? diffAndPatchLog(oldStates["runner-spect-state"], newStates["runner-spect-state"], runnerMsgDiff)
      : undefined,
    "corp-spect-diff": corpSpectators
      ? diffAndPatchLog(oldStates["corp-spect-state"], newStates["corp-spect-state"], corpMsgDiff)
      : undefined,
    "hist-diff": diffAndPatchLog(oldStates["hist-state"], newStates["hist-state"], publicMsgDiff),
  };
}

export interface MessageDiffs {
  "runner-diff": [Record<string, any>, Record<string, any>];
  "corp-diff": [Record<string, any>, Record<string, any>];
  "spect-diff": [Record<string, any>, Record<string, any>];
  "runner-spect-diff": [Record<string, any>, Record<string, any>];
  "corp-spect-diff": [Record<string, any>, Record<string, any>];
  "hist-diff": [Record<string, any>, Record<string, any>];
}

export function messageDiffs(oldState: any, newState: GameState): MessageDiffs {
  const runnerDiff = getMessageDiff(oldState, newState, "runner");
  const corpDiff = getMessageDiff(oldState, newState, "corp");
  const publicDiff = getMessageDiff(oldState, newState, "public");
  return {
    "runner-diff": runnerDiff,
    "corp-diff": corpDiff,
    "spect-diff": publicDiff,
    "runner-spect-diff": runnerDiff,
    "corp-spect-diff": corpDiff,
    "hist-diff": publicDiff,
  };
}
