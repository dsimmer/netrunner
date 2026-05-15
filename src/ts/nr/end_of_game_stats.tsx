// End-of-game statistics panel.
// Mirrors: src/cljs/nr/end_of_game_stats.cljs
import React from "react";
import { tr, trElement, trSide } from "./translations";

/** Stat tuple: [translated-label, numeric-value] */
export type StatTuple = [string, number];

/** Deeply-nested stat data object from game recording */
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
 * computed-stat: get a value, transform it, return tuple if positive.
 * Mirrors: (defn computed-stat [s stat-tr key transform]
 *           (let [val (get-in s key)
 *                 val (when val (transform val))]
 *             (when (and val (pos? val))
 *               [stat-tr val])))
 */
function computedStat(
  s: StatsData,
  statTr: string[],
  key: string[],
  transform: (val: unknown) => number,
): StatTuple | undefined {
  const val = getIn(s, key) as unknown;
  const transformed = val != null ? transform(val) : undefined;
  if (transformed !== undefined && transformed > 0) {
    return [tr(statTr), transformed];
  }
  return undefined;
}

/**
 * optional-stat: get a value, return tuple if positive.
 * Mirrors: (defn optional-stat [s stat-tr key]
 *           (let [val (get-in s key)]
 *             (when (and val (pos? val))
 *               [stat-tr (get-in s key)])))
 */
function optionalStat(
  s: StatsData,
  statTr: string[],
  key: string[],
): StatTuple | undefined {
  const val = getIn(s, key) as number | undefined;
  if (val !== undefined && val > 0) {
    return [tr(statTr), val];
  }
  return undefined;
}

/* ── Corp stats ────────────────────────────────────────────────────────── */
export function corpStats(s: StatsData): StatTuple[] {
  const raw: (StatTuple | undefined)[] = [
    [tr([":stats_clicks-gained", "Clicks Gained"]) as string,
     getIn(s, ["gain", "click"]) as number],
    [tr([":stats_credits-gained", "Credits Gained"]) as string,
     getIn(s, ["gain", "credit"]) as number],
    [tr([":stats_credits-spent", "Credits Spent"]) as string,
     getIn(s, ["spent", "credit"]) as number],
    [tr([":stats_credits-click", "Credits by the Basic Action"]) as string,
     getIn(s, ["click", "credit"]) as number],
    [tr([":stats_cards-drawn", "Cards Drawn"]) as string,
     getIn(s, ["gain", "card"]) as number],
    [tr([":stats_cards-click", "Cards Drawn by the Basic Action"]) as string,
     getIn(s, ["click", "draw"]) as number],
    [tr([":stats_damage-done", "Damage Done"]) as string,
     getIn(s, ["damage", "all"]) as number],
    [tr([":stats_cards-rezzed", "Cards Rezzed"]) as string,
     getIn(s, ["cards", "rezzed"]) as number],
    optionalStat(s, [":stats_shuffle-count", "Shuffle Count"], ["shuffle-count"]),
    optionalStat(s, [":stats_operations-played", "Operations Played"], ["cards-played", "play-instant"]),
    optionalStat(s, [":stats_rashida-count", "Rashida Count"], ["rashida-count"]),
    // psi games
    optionalStat(s, [":stats_psi-game-total", "Psi Game: Games Played"], ["psi-game", "games-played"]),
    optionalStat(s, [":stats_psi-game-total-wins", "Psi Game: Wins"], ["psi-game", "wins"]),
    optionalStat(s, [":stats_psi-game-total-bid-0", "Psi Game: Bid 0"], ["psi-game", "bet-0"]),
    optionalStat(s, [":stats_psi-game-total-bid-1", "Psi Game: Bid 1"], ["psi-game", "bet-1"]),
    optionalStat(s, [":stats_psi-game-total-bid-2", "Psi Game: Bid 2"], ["psi-game", "bet-2"]),
  ];
  return raw.filter((x): x is StatTuple => x != null);
}

/* ── Runner stats ──────────────────────────────────────────────────────── */
export function runnerStats(s: StatsData): StatTuple[] {
  const raw: (StatTuple | undefined)[] = [
    [tr([":stats_clicks-gained", "Clicks Gained"]) as string,
     getIn(s, ["gain", "click"]) as number],
    [tr([":stats_credits-gained", "Credits Gained"]) as string,
     getIn(s, ["gain", "credit"]) as number],
    [tr([":stats_credits-spent", "Credits Spent"]) as string,
     getIn(s, ["spent", "credit"]) as number],
    [tr([":stats_credits-click", "Credits by the Basic Action"]) as string,
     getIn(s, ["click", "credit"]) as number],
    [tr([":stats_cards-drawn", "Cards Drawn"]) as string,
     getIn(s, ["gain", "card"]) as number],
    [tr([":stats_cards-click", "Cards Drawn by the Basic Action"]) as string,
     getIn(s, ["click", "draw"]) as number],
    [tr([":stats_tags-gained", "Tags Gained"]) as string,
     getIn(s, ["gain", "tag", "base"]) as number],
    [tr([":stats_runs-made", "Runs Made"]) as string,
     getIn(s, ["runs", "started"]) as number],
    [tr([":stats_cards-accessed", "Cards Accessed"]) as string,
     getIn(s, ["access", "cards"]) as number],
    optionalStat(s, [":stats_shuffle-count", "Shuffle Count"], ["shuffle-count"]),
    optionalStat(s, [":stats_cards-sabotaged", "Sabotage Count"], ["cards-sabotaged"]),
    optionalStat(s, [":stats_events-played", "Events Played"], ["cards-played", "play-instant"]),
    computedStat(
      s,
      [":stats_unique-accesses", "Unique Cards Accessed"],
      ["access", "unique-cards"],
      (v: unknown) => {
        if (Array.isArray(v)) return v.length;
        return 0;
      },
    ),
    // psi games
    optionalStat(s, [":stats_psi-game-total", "Psi Game: Games Played"], ["psi-game", "games-played"]),
    optionalStat(s, [":stats_psi-game-total-wins", "Psi Game: Wins"], ["psi-game", "wins"]),
    optionalStat(s, [":stats_psi-game-total-bid-0", "Psi Game: Bid 0"], ["psi-game", "bet-0"]),
    optionalStat(s, [":stats_psi-game-total-bid-1", "Psi Game: Bid 1"], ["psi-game", "bet-1"]),
    optionalStat(s, [":stats_psi-game-total-bid-2", "Psi Game: Bid 2"], ["psi-game", "bet-2"]),
  ];
  return raw.filter((x): x is StatTuple => x != null);
}

/* ── Map longest helper (mirrors nr.utils map-longest) ─────────────────── */
/**
 * Like map but pads shorter arrays with a default value.
 * (defn map-longest [f default & colls]
 *   (lazy-seq
 *     (when (some seq colls)
 *       (cons (apply f (map #(if (seq %) (first %) default) colls))
 *             (apply map-longest f default (map rest colls))))))
 */
export function mapLongest<A, T, R>(
  f: (...args: T[]) => R,
  defaultVal: T,
  ...colls: T[][]
): R[] {
  const result: R[] = [];
  let idx = 0;
  while (colls.some(c => idx < c.length)) {
    const args = colls.map(c => (idx < c.length ? c[idx] : defaultVal)) as unknown as [...T[]];
    result.push(f(...args));
    idx++;
  }
  return result;
}

/* ── Show stat: returns value string or "-" ────────────────────────────── */
export function showStat(stat: StatTuple | undefined): string {
  if (stat != null && stat[1] > 0) {
    return String(stat[1]);
  }
  return "-";
}

/* ── Build the stats table (mirrors build-game-stats) ──────────────────── */
export default function EndOfGameStats(corp: StatsData, runner: StatsData): React.ReactElement {
  const stats = mapLongest(
    (c: StatTuple | undefined, r: StatTuple | undefined) => [c, r] as [StatTuple | undefined, StatTuple | undefined],
    undefined as unknown as StatTuple,
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
          {stats.map((pair: [StatTuple | undefined, StatTuple | undefined], i: number) => {
            const [corpStat, runnerStat] = pair;
            return (
              <tr key={i}>
                {corpStat ? (
                  <td>{trElement("td", corpStat[0] as string[])}</td>
                ) : (
                  <td />
                )}
                <td>{showStat(corpStat)}</td>
                {runnerStat ? (
                  <td>{trElement("td", runnerStat[0] as string[])}</td>
                ) : (
                  <td />
                )}
                <td>{showStat(runnerStat)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
