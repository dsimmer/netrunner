// Board queries: installed cards, servers, zone helpers.
// Mirrors: src/clj/game/core/board.clj + src/go/game/core/board.go

import type { Corp, GameState, Runner, ServerZone } from "./state";
import type { Card, Zone } from "./card";
import { CORP_SIDE, RUNNER_SIDE, makeRID } from "./state";
import {
  isCorp,
  isRunner,
  isInstalled,
  isType,
  isFacedown,
  isRezzed,
  isOperation,
  isEvent,
} from "./card";

// ---------------------------------------------------------------------------
// Server / rig card collections
// ---------------------------------------------------------------------------

/**
 * Returns all content and ICE cards in Corp servers.
 * Mirrors: corp-servers-cards in board.clj
 */
export function corpServerCards(state: GameState): Card[] {
  const out: Card[] = [];
  const c = state.corp;
  for (const s of [c.servers.hq, c.servers.rd, c.servers.archives]) {
    out.push(...s.content, ...s.ices);
  }
  for (const s of Object.values(c.servers.remote)) {
    out.push(...s.content, ...s.ices);
  }
  return out;
}

/**
 * Returns all cards in the Runner's rig.
 * Mirrors: runner-rig-cards in board.clj
 */
export function runnerRigCards(state: GameState): Card[] {
  const rig = state.runner.rig;
  return [...rig.facedown, ...rig.hardware, ...rig.program, ...rig.resource];
}

// ---------------------------------------------------------------------------
// All-cards traversal (BFS, includes hosted)
// ---------------------------------------------------------------------------

function hostedOnAll(cards: Card[]): Card[] {
  const out: Card[] = [];
  for (const c of cards) {
    if (c.hosted?.length) out.push(...c.hosted);
  }
  return out;
}

// ---------------------------------------------------------------------------
// All-cards traversal (BFS, includes hosted)
// ---------------------------------------------------------------------------

/**
 * Every single card in the game. All cards in the hand, deck, discard, play-area,
 * set-aside, score zone, currents, and removed from the game. And all cards that
 * are installed and hosted.
 * Mirrors: get-all-cards in board.clj
 */
export function getAllCards(state: GameState): Card[] {
  const corp = state.corp;
  const runner = state.runner;
  const zones: (keyof Corp | keyof Runner)[] = [
    "deck",
    "hand",
    "discard",
    "current",
    "scored",
    "playArea",
    "rfg",
    "setAside",
  ];
  const cardsInZones: Card[] = [];
  for (const player of [corp, runner]) {
    for (const z of zones) {
      const cards = (player as any)[z] as Card[];
      if (cards) cardsInZones.push(...cards);
    }
  }
  const installedCorp = corpServerCards(state);
  const installedRunner = runnerRigCards(state);
  const identities = [corp.identity, runner.identity].filter(
    (c): c is Card => c != null,
  );
  const unchecked: Card[] = [
    ...installedCorp,
    ...installedRunner,
    ...cardsInZones,
    ...identities,
  ];
  const checked: Card[] = [];
  while (unchecked.length > 0) {
    const card = unchecked.shift()!;
    checked.push(card);
    if (card.hosted?.length) {
      unchecked.push(...card.hosted);
    }
  }
  return checked;
}

// ---------------------------------------------------------------------------
// Installed queries
// ---------------------------------------------------------------------------

/**
 * Returns all installed Runner cards (including those hosted on Corp cards).
 * Mirrors: all-installed-runner in board.clj
 */
export function allInstalledRunner(state: GameState): Card[] {
  const installed: Card[] = [];
  const unchecked: Card[] = [
    ...runnerRigCards(state),
    ...hostedOnAll(corpServerCards(state)),
  ];
  while (unchecked.length) {
    const card = unchecked.shift()!;
    if (isRunner(card) && isInstalled(card)) installed.push(card);
    if (card.hosted?.length) unchecked.push(...card.hosted);
  }
  return installed;
}

/**
 * Returns all installed Corp cards (including those hosted on Runner cards).
 * Mirrors: all-installed-corp in board.clj
 */
export function allInstalledCorp(state: GameState): Card[] {
  const installed: Card[] = [];
  const unchecked: Card[] = [
    ...corpServerCards(state),
    ...hostedOnAll(runnerRigCards(state)),
  ];
  while (unchecked.length) {
    const card = unchecked.shift()!;
    if (isCorp(card) && isInstalled(card)) installed.push(card);
    if (card.hosted?.length) unchecked.push(...card.hosted);
  }
  return installed;
}

/**
 * Returns all installed cards for the given side.
 * Mirrors: all-installed in board.clj
 */
export function allInstalled(state: GameState, side: string): Card[] {
  if (side === RUNNER_SIDE) return allInstalledRunner(state);
  return allInstalledCorp(state);
}

/**
 * Returns all installed cards plus the side's scored cards.
 */
export function allInstalledAndScored(state: GameState, side: string): Card[] {
  const installed = allInstalled(state, side);
  if (side === CORP_SIDE) return [...installed, ...state.corp.scored];
  return [...installed, ...state.runner.scored];
}

/**
 * Returns all installed cards from both sides (BFS, includes hosted).
 * Mirrors: get-all-installed in board.clj
 */
export function getAllInstalled(state: GameState): Card[] {
  const installed: Card[] = [];
  const unchecked: Card[] = [
    ...runnerRigCards(state),
    ...corpServerCards(state),
  ];
  while (unchecked.length) {
    const card = unchecked.shift()!;
    if (isInstalled(card)) installed.push(card);
    if (card.hosted?.length) unchecked.push(...card.hosted);
  }
  return installed;
}

/**
 * Returns all installed, non-facedown Runner cards of a given type.
 */
export function allInstalledRunnerType(
  state: GameState,
  cardType: string,
): Card[] {
  return allInstalled(state, RUNNER_SIDE).filter(
    (c) => isType(c, cardType) && !isFacedown(c),
  );
}

// ---------------------------------------------------------------------------
// Active cards
// ---------------------------------------------------------------------------

/**
 * Returns active installed cards for the given side.
 * Mirrors: all-active-installed in board.clj
 */
export function allActiveInstalled(state: GameState, side: string, _ignored?: unknown): Card[] {
  return allInstalled(state, side).filter((c: any) =>
    side === RUNNER_SIDE ? !isFacedown(c) : isRezzed(c),
  );
}

/**
 * Returns all active cards for the given side.
 * Mirrors: all-active in board.clj
 */
export function allActive(state: GameState, side: string): Card[] {
  let ids: Card[] = [];
  let current: Card[] = [];
  let playArea: Card[] = [];
  let scored: Card[] = [];

  if (side === CORP_SIDE) {
    if (state.corp.identity) ids = [state.corp.identity];
    current = state.corp.current;
    playArea = state.corp.playArea.filter(isOperation);
    scored = state.corp.scored;
  } else {
    if (state.runner.identity) ids = [state.runner.identity];
    current = state.runner.current;
    playArea = state.runner.playArea.filter(isEvent);
  }

  const activeInstalled = allActiveInstalled(state, side);
  const combined = [...ids, ...activeInstalled, ...current, ...playArea];
  if (side === CORP_SIDE) combined.push(...scored);

  return combined.filter((c: any) => c != null && !c.disabled);
}

// ---------------------------------------------------------------------------
// Named lookups
// ---------------------------------------------------------------------------

/**
 * Returns a card matching title from the active-installed cards on the given side.
 */
export function installedByName(
  state: GameState,
  side: string,
  title: string,
): Card | null {
  return allActiveInstalled(state, side).find((c: any) => c.title === title) ?? null;
}

/**
 * Returns true if any active-installed card of the given side matches the title.
 */
export function inPlay(state: GameState, card: Card): boolean {
  const side = (card.side ?? "").toLowerCase();
  return installedByName(state, side, card.title ?? "") !== null;
}

// ---------------------------------------------------------------------------
// Server zone helpers
// ---------------------------------------------------------------------------

function remoteKey(rid: number): string {
  return `remote${rid}`;
}

/**
 * Converts a server name to a zone path.
 * Mirrors: server->zone in board.clj
 */
export function serverToZone(state: GameState, server: string): Zone {
  switch (server) {
    case "HQ":
      return ["servers", "hq"];
    case "R&D":
      return ["servers", "rd"];
    case "Archives":
      return ["servers", "archives"];
    case "New remote": {
      const rid = makeRID(state);
      return ["servers", remoteKey(rid)];
    }
    default: {
      // "Server N" → "remoteN"
      const parts = server.split(" ");
      if (parts.length === 2 && parts[0] === "Server") {
        return ["servers", `remote${parts[1]}`];
      }
      return ["servers", server];
    }
  }
}

/**
 * Returns the ServerZone the card is installed in.
 */
export function cardToServer(state: GameState, card: Card): ServerZone | null {
  const z = card.zone ?? [];
  if (z.length < 2 || z[0] !== "servers") return null;
  return getServerZone(state, z[1]) ?? null;
}

/**
 * Returns the ServerZone for a server key (hq, rd, archives, remoteN).
 */
export function getServerZone(
  state: GameState,
  key: string,
): ServerZone | undefined {
  switch (key) {
    case "hq":
      return state.corp.servers.hq;
    case "rd":
      return state.corp.servers.rd;
    case "archives":
      return state.corp.servers.archives;
    default:
      return state.corp.servers.remote[key];
  }
}

/**
 * Returns names of all remote servers.
 */
export function getRemotes(state: GameState): string[] {
  return Object.keys(state.corp.servers.remote);
}

/**
 * Returns all server keys (hq, rd, archives, remoteN, ...).
 */
export function getZones(state: GameState): string[] {
  return ["hq", "rd", "archives", ...getRemotes(state)];
}

/**
 * Returns the remote-only zone keys.
 * Mirrors: get-remote-zones in board.clj
 */
export function getRemoteZones(state: GameState): string[] {
  return getZones(state).filter((z: any) => isRemoteZone(z));
}

/**
 * Returns the sorted human-readable names of all remote servers.
 * Mirrors: get-remote-names in board.clj
 */
export function getRemoteNames(state: GameState): string[] {
  return zonesToSortedNamesLocal(getRemoteZones(state));
}

/**
 * Returns the sorted human-readable names of all servers (including centrals).
 * Mirrors: server-list in board.clj
 */
export function serverList(state: GameState): string[] {
  return zonesToSortedNamesLocal(getZones(state));
}

/**
 * Returns server names excluding the supplied list.
 * Mirrors: server-list-exclude in board.clj
 */
export function serverListExclude(state: GameState, excludeList: string[]): string[] {
  const exclude = new Set(excludeList);
  return zonesToSortedNamesLocal(getZones(state).filter((z: any) => !exclude.has(z)));
}

function isRemoteZone(z: string): boolean {
  return /^remote/.test(z) || /^:remote/.test(z);
}

function zoneSortKeyLocal(zone: string): number {
  const s = String(zone).replace(/^:/, "").toLowerCase();
  if (s === "archives" || s === "discard") return -3;
  if (s === "rd" || s === "deck") return -2;
  if (s === "hq" || s === "hand") return -1;
  const m = s.match(/^remote(\d+)$/);
  if (m) return Number(m[1]);
  return 0;
}

function zoneDisplayLocal(zone: string): string {
  const s = String(zone).replace(/^:/, "").toLowerCase();
  if (s === "hq" || s === "hand") return "HQ";
  if (s === "rd" || s === "deck") return "R&D";
  if (s === "archives" || s === "discard") return "Archives";
  const m = s.match(/^remote(\d+)$/);
  if (m) return `Server ${m[1]}`;
  return zone;
}

function zonesToSortedNamesLocal(zones: string[]): string[] {
  return [...zones].sort((a: any, b: any) => zoneSortKeyLocal(a) - zoneSortKeyLocal(b)).map(zoneDisplayLocal);
}

/**
 * Removes remote servers with no content and no ice.
 * Mirrors: clear-empty-remotes in board.clj
 */
export function clearEmptyRemotes(state: GameState): void {
  for (const [k, s] of Object.entries(state.corp.servers.remote)) {
    if (s.content.length === 0 && s.ices.length === 0) {
      delete state.corp.servers.remote[k];
    }
  }
}

// ---------------------------------------------------------------------------
// Installable servers
// ---------------------------------------------------------------------------

/**
 * Get list of servers the specified card can be installed in.
 * Mirrors: installable-servers in board.clj
 */
export function installableServers(
  state: GameState,
  card: Card,
): string[] {
  const baseList = ["HQ", "R&D", "Archives", ...getRemotes(state).map((k: any) => `Remote ${k}`)];
  return baseList;
}

/** All scored agendas for a side. */
export function getAgendas(state: GameState, side: string): Card[] {
  const sideKey = String(side).replace(":", "");
  return ((state as any)?.[sideKey]?.scored ?? []) as Card[];
}

/** Cards in a given zone (e.g., ["hand"], ["servers","hq","content"]). */
export function getZoneCards(state: GameState, side: string, zone: string[]): Card[] {
  let cur: any = (state as any)?.[String(side).replace(":", "")];
  for (const seg of zone) {
    if (!cur) return [];
    cur = cur[seg];
  }
  return Array.isArray(cur) ? (cur as Card[]) : [];
}

/** First card in zone matching the cid. */
export function getCardInZone(state: GameState, side: string, zone: string[], cid: string): Card | null;
export function getCardInZone(player: any, zone: any): Card[] | null;
export function getCardInZone(...args: any[]): Card[] | Card | null {
  if (args.length === 2) {
    // 2-arg form: (player, zone) — return cards at that zone path
    const player = args[0];
    const zone = args[1];
    if (!player || !zone) return [];
    // zone is like ["servers", "remote1", "content"] — walk into player
    let node: any = player;
    const pathParts = Array.isArray(zone) ? zone : [zone];
    for (const seg of pathParts) {
      if (node == null) return [];
      node = node[seg];
    }
    return Array.isArray(node) ? (node as Card[]) : [];
  }
  const [state, side, zone, cid] = args as [GameState, string, string[], string];
  return getZoneCards(state, side, zone).find((c: any) => c.cid === cid) ?? null;
}

import { getRunnableZones } from "./runs";
import type { Server } from './types';


/** Sorted names of zones the runner can currently run. */
export function runnableServers(state: GameState, side?: string, eid?: any, card?: any): string[] {
  const zones = getRunnableZones(state as any, (side ?? "runner") as any, eid as any, card as any, null);
  return zonesToSortedNamesLocal(zones as unknown as string[]);
}

export { getZone } from "./card";
