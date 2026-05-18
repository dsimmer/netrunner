// End-of-game statistics panel.
// Mirrors: src/cljs/nr/end_of_game_stats.cljs
import React from "react";
import { trElement, trSide } from "./translations";

/** Stat entry: [tr-resource-tuple, numeric-value] */
export type StatEntry = [[string, string], number | undefined];

export interface StatsData {
  [key: string]: unknown;
}

/** Traverse a nested object by an array of keys (mirrors get-in) */
function getIn(obj: unknown, path: (string | number)[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * computed-stat: get a value, transform it, return entry if positive.
 * Mirrors: computed-stat in end_of_game_stats.cljs
 */
function computedStat(
  s: StatsData,
  statTr: [string, string],
  key: string[],
  transform: (val: unknown) => number,
): StatEntry | undefined {
  const val = getIn(s, key);
  const transformed = val != null ? transform(val) : undefined;
  if (transformed !== undefined && transformed > 0) {
    return [statTr, transformed];
  }
  return undefined;
}

/**
 * optional-stat: get a value, return entry if positive.
 * Mirrors: optional-stat in end_of_game_stats.cljs
 */
function optionalStat(
  s: StatsData,
  statTr: [string, string],
  key: string[],
): StatEntry | undefined {
  const val = getIn(s, key) as number | undefined;
  if (val !== undefined && val > 0) {
    return [statTr, val];
  }
  return undefined;
}

/* ── Corp stats ────────────────────────────────────────────────────────── */
export function corpStats(s: StatsData): StatEntry[] {
  const raw: (StatEntry | undefined)[] = [
    [["stats_clicks-gained", "Clicks Gained"], getIn(s, ["gain", "click"]) as number | undefined],
    [["stats_credits-gained", "Credits Gained"], getIn(s, ["gain", "credit"]) as number | undefined],
    [["stats_credits-spent", "Credits Spent"], getIn(s, ["spent", "credit"]) as number | undefined],
    [["stats_credits-click", "Credits by the Basic Action"], getIn(s, ["click", "credit"]) as number | undefined],
    [["stats_cards-drawn", "Cards Drawn"], getIn(s, ["gain", "card"]) as number | undefined],
    [["stats_cards-click", "Cards Drawn by the Basic Action"], getIn(s, ["click", "draw"]) as number | undefined],
    [["stats_damage-done", "Damage Done"], getIn(s, ["damage", "all"]) as number | undefined],
    [["stats_cards-rezzed", "Cards Rezzed"], getIn(s, ["cards", "rezzed"]) as number | undefined],
    optionalStat(s, ["stats_shuffle-count", "Shuffle Count"], ["shuffle-count"]),
    optionalStat(s, ["stats_operations-played", "Operations Played"], ["cards-played", "play-instant"]),
    optionalStat(s, ["stats_rashida-count", "Rashida Count"], ["rashida-count"]),
    optionalStat(s, ["stats_psi-game-total", "Psi Game: Games Played"], ["psi-game", "games-played"]),
    optionalStat(s, ["stats_psi-game-total-wins", "Psi Game: Wins"], ["psi-game", "wins"]),
    optionalStat(s, ["stats_psi-game-total-bid-0", "Psi Game: Bid 0"], ["psi-game", "bet-0"]),
    optionalStat(s, ["stats_psi-game-total-bid-1", "Psi Game: Bid 1"], ["psi-game", "bet-1"]),
    optionalStat(s, ["stats_psi-game-total-bid-2", "Psi Game: Bid 2"], ["psi-game", "bet-2"]),
  ];
  return raw.filter((x): x is StatEntry => x != null);
}

/* ── Runner stats ──────────────────────────────────────────────────────── */
export function runnerStats(s: StatsData): StatEntry[] {
  const raw: (StatEntry | undefined)[] = [
    [["stats_clicks-gained", "Clicks Gained"], getIn(s, ["gain", "click"]) as number | undefined],
    [["stats_credits-gained", "Credits Gained"], getIn(s, ["gain", "credit"]) as number | undefined],
    [["stats_credits-spent", "Credits Spent"], getIn(s, ["spent", "credit"]) as number | undefined],
    [["stats_credits-click", "Credits by the Basic Action"], getIn(s, ["click", "credit"]) as number | undefined],
    [["stats_cards-drawn", "Cards Drawn"], getIn(s, ["gain", "card"]) as number | undefined],
    [["stats_cards-click", "Cards Drawn by the Basic Action"], getIn(s, ["click", "draw"]) as number | undefined],
    [["stats_tags-gained", "Tags Gained"], getIn(s, ["gain", "tag", "base"]) as number | undefined],
    [["stats_runs-made", "Runs Made"], getIn(s, ["runs", "started"]) as number | undefined],
    [["stats_cards-accessed", "Cards Accessed"], getIn(s, ["access", "cards"]) as number | undefined],
    optionalStat(s, ["stats_shuffle-count", "Shuffle Count"], ["shuffle-count"]),
    optionalStat(s, ["stats_cards-sabotaged", "Sabotage Count"], ["cards-sabotaged"]),
    optionalStat(s, ["stats_events-played", "Events Played"], ["cards-played", "play-instant"]),
    computedStat(s, ["stats_unique-accesses", "Unique Cards Accessed"], ["access", "unique-cards"],
      (v) => Array.isArray(v) ? v.length : 0),
    optionalStat(s, ["stats_psi-game-total", "Psi Game: Games Played"], ["psi-game", "games-played"]),
    optionalStat(s, ["stats_psi-game-total-wins", "Psi Game: Wins"], ["psi-game", "wins"]),
    optionalStat(s, ["stats_psi-game-total-bid-0", "Psi Game: Bid 0"], ["psi-game", "bet-0"]),
    optionalStat(s, ["stats_psi-game-total-bid-1", "Psi Game: Bid 1"], ["psi-game", "bet-1"]),
    optionalStat(s, ["stats_psi-game-total-bid-2", "Psi Game: Bid 2"], ["psi-game", "bet-2"]),
  ];
  return raw.filter((x): x is StatEntry => x != null);
}

/* ── Map longest helper (mirrors nr.utils map-longest) ─────────────────── */
export function mapLongest<T, R>(
  f: (...args: (T | undefined)[]) => R,
  defaultVal: T | undefined,
  ...colls: T[][]
): R[] {
  const result: R[] = [];
  let idx = 0;
  while (colls.some(c => idx < c.length)) {
    const args = colls.map(c => (idx < c.length ? c[idx] : defaultVal));
    result.push(f(...args));
    idx++;
  }
  return result;
}

/** Show stat value: returns numeric string if positive, "-" otherwise.
 *  Mirrors: show-stat in end_of_game_stats.cljs */
export function showStat(stat: StatEntry | undefined): string | number {
  if (!stat) return "";
  const val = stat[1];
  if (val != null && val > 0) return val;
  return "-";
}

/** Build the end-of-game stats table. Mirrors: build-game-stats */
export default function EndOfGameStats({ corp, runner }: { corp: StatsData; runner: StatsData }): React.ReactElement {
  const pairs = mapLongest<StatEntry, [StatEntry | undefined, StatEntry | undefined]>(
    (c, r) => [c, r],
    undefined,
    corpStats(corp),
    runnerStats(runner),
  );

  return (
    <div>
      <table className="win table">
        <tbody>
          <tr className="win th">
            <td className="win th">{trSide("Corp")}</td>
            <td className="win th" />
            <td className="win th">{trSide("Runner")}</td>
            <td className="win th" />
          </tr>
          {pairs.map(([corpStat, runnerStat], i) => (
            <tr key={i}>
              {corpStat ? trElement("td", corpStat[0]) : <td />}
              <td>{showStat(corpStat)}</td>
              {runnerStat ? trElement("td", runnerStat[0]) : <td />}
              <td>{showStat(runnerStat)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
