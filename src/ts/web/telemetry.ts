// Telemetry and periodic stats logging. Mirrors: src/clj/web/telemetry.clj

import { allActive } from "../game/core/board";
import type { GameState } from "../game/core/state";
import { getAppState } from "./app_state";
import { fetchDelayLog, lobbyUpdateUids, poolOccupantsInfo } from "./lobby";
import {
  connectedSockets,
  connections,
  bufferSize,
  getBufferUsage,
  connectedUids,
} from "./ws";

// ---- Constants ----

const LOG_STAT_FREQUENCY = 5 * 60 * 1000; // 5 minutes (enc/ms :mins 5)

// ---- Percentile / delay formatting (mirrors percentile, format-percentiles, format-delay!) ----

/**
 * Calculate the given percentile of a sorted data set.
 * Mirrors: (percentile vector percentile)
 */
function percentile(data: number[], percentile: number): string {
  const sorted = [...data].sort((a, b) => a - b);
  const idx = Math.floor((percentile * sorted.length) / 100);
  return `${sorted[idx]}ms`;
}

/**
 * Format a data set as a string of percentiles separated by "/".
 * Mirrors: (format-percentiles data percentiles)
 */
function formatPercentiles(data: number[], percentiles: number[]): string {
  return percentiles.map((p) => percentile(data, p)).join("/");
}

/**
 * Format delay log for display.
 * Mirrors: (format-delay!)
 */
function formatDelay(): string {
  const delays = fetchDelayLog();
  const percentiles = [5, 25, 50, 75, 95];
  const avg = (arr: number[]): number =>
    Math.floor(arr.reduce((sum, v) => sum + v, 0) / arr.length);

  const fmt = (arr: number[]): string =>
    `Average: ${avg(arr)}ms - Count: ${arr.length} - Percentiles (5/25/50/75/95): ${formatPercentiles(arr, percentiles)}`;

  const parts: string[] = [];
  delays.forEach((value, key) => {
    parts.push(`${key}: ${fmt(value)}`);
  });
  return `{${parts.join(" ")}}`;
}

// ---- Subscriber time metrics (mirrors subscriber-time-metrics) ----

/**
 * Calculate average and oldest subscriber time in minutes.
 * Mirrors: (subscriber-time-metrics subs)
 * Returns [average, oldest] in minutes.
 */
export function subscriberTimeMetrics(subs: Date[]): [number, number] {
  const now = new Date();
  const subsByMinute = subs
    .map((date) => Math.floor((now.getTime() - date.getTime()) / 1000 / 60))
    .sort((a, b) => a - b);
  const oldest =
    subsByMinute.length > 0 ? subsByMinute[subsByMinute.length - 1] : 0;
  const average =
    subsByMinute.length > 0
      ? Math.floor(
          subsByMinute.reduce((sum, v) => sum + v, 0) / subsByMinute.length,
        )
      : 0;
  return [average, oldest];
}

// ---- Active card frequencies (mirrors lobby->active-cards, active-card-frequencies) ----

/**
 * Extract active card titles from a lobby's game state.
 * Mirrors: (lobby->active-cards lobby)
 */
function lobbyActiveCards(lobby: Record<string, unknown>): string[] {
  if (!(lobby.started as boolean)) return [];
  const state = lobby.state as GameState | undefined;
  if (!state) return [];
  const runnerCards = allActive(state, ":runner");
  const corpCards = allActive(state, ":corp");
  const titles = [
    ...runnerCards.map((c: any) => c.title),
    ...corpCards.map((c: any) => c.title),
  ];
  return titles;
}

/**
 * Count frequencies of active cards across all lobbies.
 * Mirrors: (active-card-frequencies lobbies)
 */
export function activeCardFrequencies(
  lobbies: Record<string, Record<string, unknown>>,
): Map<string, number> {
  const allCards: string[] = [];
  for (const lobby of Object.values(lobbies)) {
    allCards.push(...lobbyActiveCards(lobby));
  }
  const freqs = new Map<string, number>();
  for (const card of allCards) {
    freqs.set(card, (freqs.get(card) ?? 0) + 1);
  }
  return freqs;
}

// ---- Recent command frequencies (mirrors lobby->recent-commands, recent-command-frequencies) ----

/**
 * Extract recent commands from a lobby's game state.
 * Mirrors: (lobby->recent-commands lobby)
 */
function lobbyRecentCommands(lobby: Record<string, unknown>): string[] {
  if (!(lobby.started as boolean)) return [];
  const state = lobby.state as Record<string, unknown> | undefined;
  if (!state) return [];
  const commandLog = (state["command-log"] as any[]) ?? [];
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const recent = commandLog.filter((cmd: any) => {
    const ts = new Date(cmd.timestamp as number | string);
    return ts > fiveMinutesAgo;
  });
  return recent.map((cmd: any) => cmd.command);
}

/**
 * Count frequencies of recent commands across all lobbies.
 * Mirrors: (recent-command-frequencies lobbies)
 */
export function recentCommandFrequencies(
  lobbies: Record<string, Record<string, unknown>>,
): Map<string, number> {
  const allCommands: string[] = [];
  for (const lobby of Object.values(lobbies)) {
    allCommands.push(...lobbyRecentCommands(lobby));
  }
  const freqs = new Map<string, number>();
  for (const cmd of allCommands) {
    freqs.set(cmd, (freqs.get(cmd) ?? 0) + 1);
  }
  return freqs;
}

// ---- JVM / system metrics (mirrors heap-usage, system-load-average, thread-stats) ----

/**
 * Get heap memory usage info.
 * Mirrors: (heap-usage)
 */
function heapUsage(): string {
  const mem = process.memoryUsage();
  return `rss: ${(mem.rss / 1024 / 1024).toFixed(1)}MB, heapTotal: ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB, heapUsed: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB, external: ${(mem.external / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * Get system load average as percentage of available CPUs.
 * Mirrors: (system-load-average)
 */
function systemLoadAverage(): string {
  const loadAvg = require("os").loadavg()[0];
  const numCPUs = require("os").cpus().length;
  const pct = Math.floor((loadAvg / numCPUs) * 100);
  return `${pct}%`;
}

/**
 * Get thread (async operation) stats.
 * Mirrors: (thread-stats)
 *
 * Node.js is single-threaded, so this returns event loop and active handles info.
 */
function threadStats(): string {
  const activeHandles = require("process").getActiveResourcesInfo?.() ?? [];
  const freqs = new Map<string, number>();
  for (const resource of activeHandles) {
    const type = typeof resource === "string" ? resource : String(resource);
    freqs.set(type, (freqs.get(type) ?? 0) + 1);
  }
  return `{${Array.from(freqs.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .slice(0, 10)
    .join(", ")}}`;
}

// ---- WebSocket buffer backlog (mirrors ws-chan-backlog) ----

/**
 * Get websocket buffer backlog info.
 * Mirrors: (ws-chan-backlog)
 */
function wsChanBacklog(): string {
  return `websocket-buffer: ${getBufferUsage()} / ${bufferSize}`;
}

// ---- GC stats (mirrors log-gc) ----

const lastGcStats: Map<string, { collections: number; time: number }> =
  new Map();

/**
 * Log garbage collection stats.
 * Mirrors: (log-gc)
 *
 * Node.js doesn't expose GC MXBeans like JVM, so this logs basic memory info.
 */
function logGc(): void {
  // Node.js doesn't have direct GC stats like JVM.
  // Log heap info as proxy.
  console.info(`GC: ${heapUsage()}`);
}

// ---- Open file descriptors (mirrors log-open-file-descriptors) ----

/**
 * Log open file descriptor count.
 * Mirrors: (log-open-file-descriptors)
 *
 * Node.js doesn't expose FD counts directly; this is a no-op placeholder.
 */
function logOpenFileDescriptors(): void {
  console.info("Warning: Open FD count not supported in Node");
}

// ---- Connected socket helpers (mirrors connected-sockets / connections_ access) ----

function countUids(map: Map<string, Set<any>>): number {
  return map.size;
}

function countConnections(map: Map<string, Set<any>>): number {
  let total = 0;
  map.forEach((sockets) => {
    total += sockets.size;
  });
  return total;
}

function connectionCounts(map: Map<string, Set<any>>): number[] {
  const counts: number[] = [];
  map.forEach((s) => {
    counts.push(s.size);
  });
  return counts;
}

// ---- Periodic stats logging (mirrors log-stats go loop) ----

let statsTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic stats logging timer.
 * Mirrors: (defonce log-stats (go (while true ...)))
 */
export function startStatsLogging(): void {
  if (statsTimer) return;

  const logStats = () => {
    const appState = getAppState();
    const lobbies = appState.lobbies;
    const lobbiesCount = Object.keys(lobbies).length;
    const players = Object.values(lobbies).reduce(
      (sum, l) => sum + ((l.players as any[])?.length ?? 0),
      0,
    );
    const spectators = Object.values(lobbies).reduce(
      (sum, l) => sum + ((l.spectators as any[])?.length ?? 0),
      0,
    );
    const userCacheCount = Object.keys(appState.users).length;
    const lobbyUpdates = appState["lobby-updates"];
    const activeLobbyUpdates = Object.entries(lobbyUpdates).filter(
      ([, v]) => v !== null && v !== undefined,
    );
    const lobbySubCount = activeLobbyUpdates.length;
    const lUpdateUids = lobbyUpdateUids();
    const lobbyUpdateUidCount = lUpdateUids.length;
    const subsTimestamps: Date[] = activeLobbyUpdates.map(([, v]) => v as Date);
    const [averageSubTime, oldestSubTime] =
      subscriberTimeMetrics(subsTimestamps);
    const latencies = formatDelay();
    const ajaxUidCount = countUids(connectedSockets);
    const ajaxConnCounts = connectionCounts(connectedSockets);
    const ajaxConnTotal = ajaxConnCounts.reduce((s, v) => s + v, 0);
    const wsUidCount = countUids(connectedSockets);
    const wsConnCounts = connectionCounts(connectedSockets);
    const wsConnTotal = wsConnCounts.reduce((s, v) => s + v, 0);

    console.info(
      `stats -` +
        ` lobbies: ${lobbiesCount}` +
        ` players: ${players}` +
        ` spectators: ${spectators}` +
        ` cached-users: ${userCacheCount}` +
        ` lobby-subs: ${lobbySubCount}` +
        ` lobby-update-uids: ${lobbyUpdateUidCount}` +
        ` average-lobby-subs-lifetime: ${averageSubTime}m` +
        ` oldest-lobby-sub: ${oldestSubTime}m` +
        ` |` +
        ` websockets -` +
        ` :ajax {` +
        ` uid: ${ajaxUidCount}` +
        ` conn: ${ajaxConnTotal}` +
        ` } :ws {` +
        ` uid: ${wsUidCount}` +
        ` conn: ${wsConnTotal}` +
        ` }`,
    );

    const poolInfo = poolOccupantsInfo();
    console.info(`pool occupants: [${poolInfo.join(", ")}]`);

    console.info(latencies);

    // note: the two below (active cards and recent commands) are not relevant for our current situation I think
    // if we ever get locking issues or something in the future, it can be useful to diagnose them though
    // console.info(`Active Cards (across all lobbies): ${JSON.stringify(activeCardFrequencies(lobbies))}`);
    // console.info(`Recent Commands (across all lobbies): ${JSON.stringify(recentCommandFrequencies(lobbies))}`);

    console.info(`thread states: ${threadStats()}`);
    console.info(wsChanBacklog());
    logGc();
    logOpenFileDescriptors();
    console.info(
      `System Load (average): ${systemLoadAverage()} - heap: ${heapUsage()}\n`,
    );
  };

  // Run immediately on start
  logStats();

  statsTimer = setInterval(logStats, LOG_STAT_FREQUENCY);
}

/**
 * Stop the periodic stats logging timer.
 */
export function stopStatsLogging(): void {
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
}
