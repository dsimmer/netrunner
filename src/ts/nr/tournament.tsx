// Tournament organizer page: round timer, table management.
// Mirrors: src/cljs/nr/tournament.cljs
import React, { useState, useEffect, useRef, useCallback } from "react";
import { condButton, nonGameToast } from "./utils";
import { wsSend, onWSEvent } from "./ws";
import { useAppState } from "./appstate";
import { LocalDateTime, Duration, ChronoUnit } from "@js-joda/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlayerInfo {
  uid: string;
  side: string | null;
  [key: string]: unknown;
}

interface CompetitiveLobby {
  gameid: string;
  title: string;
  players: PlayerInfo[];
  [key: string]: unknown;
}

interface SplitLobby {
  gameid: string;
  title: string;
  corp: string;
  runner: string;
  excluded?: boolean;
  timeExtension?: number;
  [key: string]: unknown;
}

interface TournamentSettings {
  reporting: {
    selfReporting: boolean;
    selfReportingUrl: string;
  };
  roundStart: {
    alert: boolean;
    oneMinuteWarning: boolean;
    startIn: number;
  };
  round: {
    timeInRound: number;
    timeExpiryText: string;
    timeExpiryRulesText: string;
    explainTimeResolution: boolean;
    twentyMinuteWarning: boolean;
    fiveMinuteWarning: boolean;
    oneMinuteWarning: boolean;
  };
}

interface ActiveRoundData {
  sourceUid?: string;
  roundEnd?: string;
  round20mWarning?: boolean;
  round5mWarning?: boolean;
  round1mWarning?: boolean;
  reportMatch?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Global state (mirrors the defonce atoms in cljs)
// ---------------------------------------------------------------------------

// We use refs + a "tick" counter to force re-renders, mirroring reagent atoms.
let storedTablesRef: SplitLobby[] = [];
let invariableTablesRef: SplitLobby[] = [];
let actionSummaryRef: SplitLobby[] = [];
let activeRoundRef: ActiveRoundData | null = null;
let tournamentStateRef: TournamentSettings = {
  reporting: {
    selfReporting: false,
    selfReportingUrl: "https://tournaments.nullsignal.games/",
  },
  roundStart: {
    alert: true,
    oneMinuteWarning: true,
    startIn: 5,
  },
  round: {
    timeInRound: 40,
    timeExpiryText: "TIME IN ROUND",
    timeExpiryRulesText:
      "Time has been called. The active player finishes their turn, then the opposing player takes a turn. If the game has not concluded by the end of that turn, then the game is decided on agenda points.",
    explainTimeResolution: true,
    twentyMinuteWarning: false,
    fiveMinuteWarning: true,
    oneMinuteWarning: false,
  },
};

// Global tick forces all tournament components to re-render when any atom changes.
let globalTick = 0;
function tick() {
  globalTick++;
  // Notify all subscribers
  subscribers.forEach((cb) => cb());
}
const subscribers: (() => void)[] = [];
function subscribe(cb: () => void) {
  subscribers.push(cb);
  return () => {
    const idx = subscribers.indexOf(cb);
    if (idx >= 0) subscribers.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// split-players  (mirrors split-players in cljs)
// ---------------------------------------------------------------------------
function splitPlayers(competitiveLobbies: CompetitiveLobby[]): SplitLobby[] {
  return competitiveLobbies.map((lobby) => {
    const corp = lobby.players.find((p) => p.side === "Corp");
    const runner = lobby.players.find((p) => p.side === "Runner");
    const result: SplitLobby = {
      ...lobby,
      corp: corp?.uid ?? "-",
      runner: runner?.uid ?? "-",
    };
    delete (result as Record<string, unknown>)["players"];
    return result;
  });
}

// ---------------------------------------------------------------------------
// time-until  (mirrors time-until in cljs)
// Returns [minutes, seconds]
// ---------------------------------------------------------------------------
function timeUntil(endStr: string): [number, number] {
  const now = LocalDateTime.now();
  const end = LocalDateTime.parse(endStr);
  const diff = Duration.between(now, end);
  const totalSeconds = diff.get(ChronoUnit.SECONDS);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.abs(totalSeconds % 60);
  return [minutes, seconds];
}

// ---------------------------------------------------------------------------
// Helper: get-in (mirrors Clojure get-in)
// ---------------------------------------------------------------------------
function getIn(obj: unknown, keys: (string | number)[], defaultValue: unknown): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return defaultValue;
    current = (current as Record<string, unknown>)[key];
  }
  return current !== undefined ? current : defaultValue;
}

// Helper: assoc-in (mirrors Clojure assoc-in)
function assocIn<T extends object>(obj: T, keys: string[], value: unknown): T {
  const clone = JSON.parse(JSON.stringify(obj));
  let current: Record<string, unknown> = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in current) || typeof current[k] !== "object" || current[k] === null) {
      current[k] = {};
    }
    current = current[k] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
  return clone as T;
}

// ---------------------------------------------------------------------------
// check-helper (mirrors check-helper in cljs)
// ---------------------------------------------------------------------------
interface CheckHelperProps {
  state: React.MutableRefObject<TournamentSettings>;
  keyseq: string[];
  label: string;
}

function CheckHelper({ state, keyseq, label }: CheckHelperProps): React.ReactElement {
  const checked = getIn(state.current, keyseq, true) as boolean;
  const [_tick] = useState(globalTick); // forces re-render on tick

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => {
            const newVal = !checked;
            state.current = assocIn(state.current, keyseq, newVal);
            tick();
          }}
        />
        {label}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// minutes-helper (mirrors minutes-helper in cljs)
// ---------------------------------------------------------------------------
interface MinutesHelperProps {
  state: React.MutableRefObject<TournamentSettings>;
  keyseq: string[];
  labelPre: string;
  labelPost: string;
}

function MinutesHelper({ state, keyseq, labelPre, labelPost }: MinutesHelperProps): React.ReactElement {
  const value = getIn(state.current, keyseq, 5) as number;
  const [_tick] = useState(globalTick);

  return (
    <div>
      <label>
        {labelPre}
        <input
          type="number"
          min={0}
          step={1}
          style={{ width: "10ch" }}
          value={value}
          onChange={(e) => {
            const v = (e.target as HTMLInputElement).valueAsNumber;
            state.current = assocIn(state.current, keyseq, v);
            tick();
          }}
        />
        {labelPost}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// dividerlabel (mirrors dividerlabel in cljs)
// ---------------------------------------------------------------------------
function Dividerlabel({ text }: { text: string }): React.ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", margin: "12px 0" }}>
      <div style={{ flex: "1", height: "1px", background: "#ccc" }} />
      <span style={{ margin: "0 8px" }}>{text}</span>
      <div style={{ flex: "1", height: "1px", background: "#ccc" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// text-helper (mirrors text-helper in cljs)
// ---------------------------------------------------------------------------
interface TextHelperProps {
  state: React.MutableRefObject<Record<string, unknown>>;
  keyseq: string[];
  label: string;
}

function TextHelper({ state, keyseq, label }: TextHelperProps): React.ReactElement {
  const value = getIn(state.current, keyseq, "placeholder") as string;
  const [_tick] = useState(globalTick);

  return (
    <div>
      <label>
        {label}
        <input
          type="text"
          style={{ width: "100%" }}
          value={value}
          onChange={(e) => {
            const v = (e.target as HTMLInputElement).value;
            state.current = assocIn(state.current, keyseq, v);
            tick();
          }}
        />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// countdown (mirrors countdown in cljs)
// ---------------------------------------------------------------------------
function Countdown({ targetTime }: { targetTime: string }): React.ReactElement {
  const [remaining, setRemaining] = useState<[number, number] | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setRemaining(timeUntil(targetTime));
    intervalRef.current = setInterval(() => {
      setRemaining(timeUntil(targetTime));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [targetTime]);

  if (!remaining) {
    return <span>Loading...</span>;
  }

  return (
    <span style={remaining[0] <= 0 ? { color: "red" } : undefined}>
      {remaining[0]} minutes and {remaining[1]} seconds remaining until the round ends
    </span>
  );
}

// ---------------------------------------------------------------------------
// timer-management (mirrors timer-management in cljs)
// ---------------------------------------------------------------------------
function TimerManagement(): React.ReactElement {
  const tsRef = useRef(tournamentStateRef);
  const [_tick] = useState(globalTick);

  // Keep ref in sync
  useEffect(() => {
    const unsub = subscribe(() => {
      // ref is already updated globally
    });
    return unsub;
  }, []);

  return (
    <div>
      <h3>Set up a round</h3>
      <form>
        {/* Reporting */}
        <fieldset>
          <legend>Reporting</legend>
          <CheckHelper
            state={tsRef}
            keyseq={["reporting", "selfReporting"]}
            label="Encourage self-reporting?"
          />
          <TextHelper
            state={tsRef as React.MutableRefObject<Record<string, unknown>>}
            keyseq={["reporting", "selfReportingUrl"]}
            label="Link for reporting: "
          />
        </fieldset>

        {/* Round start */}
        <fieldset>
          <legend>Round start</legend>
          <CheckHelper
            state={tsRef}
            keyseq={["roundStart", "alert"]}
            label="Inform players about round start?"
          />
          <CheckHelper
            state={tsRef}
            keyseq={["roundStart", "oneMinuteWarning"]}
            label="Inform players 1 minute before round start?"
          />
          <MinutesHelper
            state={tsRef}
            keyseq={["roundStart", "startIn"]}
            labelPre="Round starts in "
            labelPost=" minutes"
          />
        </fieldset>

        {/* Round properties */}
        <fieldset>
          <legend>Round properties</legend>
          <MinutesHelper
            state={tsRef}
            keyseq={["round", "timeInRound"]}
            labelPre="Round is "
            labelPost=" minutes long"
          />
          <TextHelper
            state={tsRef as React.MutableRefObject<Record<string, unknown>>}
            keyseq={["round", "timeExpiryText"]}
            label="Time call: "
          />
          <CheckHelper
            state={tsRef}
            keyseq={["round", "explainTimeResolution"]}
            label="Explain resolution when calling time in round (text below)?"
          />
          <TextHelper
            state={tsRef as React.MutableRefObject<Record<string, unknown>>}
            keyseq={["round", "timeExpiryRulesText"]}
            label="Time rules explainer: "
          />
          <Dividerlabel text="Warnings" />
          <CheckHelper
            state={tsRef}
            keyseq={["round", "twentyMinuteWarning"]}
            label="Give players a 20-minute warning (half-way for 40 minute rounds)"
          />
          <CheckHelper
            state={tsRef}
            keyseq={["round", "fiveMinuteWarning"]}
            label="Give players a 5-minute warning"
          />
          <CheckHelper
            state={tsRef}
            keyseq={["round", "oneMinuteWarning"]}
            label="Give players a 1-minute warning"
          />
        </fieldset>
      </form>
      <p />
      {condButton(
        "Declare Round",
        !activeRoundRef,
        () => {
          nonGameToast("locking in a round structure...", "info", null);
          wsSend("tournament/declare-round", {
            "tournament-settings": tournamentStateRef,
          });
        }
      )}
      {condButton(
        "Conclude Round",
        !!activeRoundRef,
        () => {
          if (
            window.confirm(
              "Are you sure you want to conclude the round? This CANNOT be undone"
            )
          ) {
            nonGameToast("attempting to conclude round...", "info", null);
            wsSend("tournament/conclude-round", {});
          }
        }
      )}
      <p />
    </div>
  );
}

// ---------------------------------------------------------------------------
// tournament-lobbies-container (mirrors tournament-lobbies-container in cljs)
// ---------------------------------------------------------------------------
function TournamentLobbiesContainer(): React.ReactElement {
  const [_tick] = useState(globalTick);

  useEffect(() => {
    return subscribe(() => {});
  }, []);

  return (
    <div>
      <h3>Tournament lobbies</h3>
      <div>
        Here you can load all lobbies in the competitive channel, set time
        extensions on specific lobbies, and exclude lobbies from timers and
        announcements.
      </div>
      <p />
      <div>
        <button
          type="button"
          onClick={() => {
            wsSend("tournament/view-tables", {});
            nonGameToast("refreshing tables...", "info", null);
          }}
        >
          Refresh State
        </button>{" "}
        <button
          type="button"
          onClick={() => {
            wsSend("tournament/update-tables", {
              "competitive-lobbies": storedTablesRef,
            });
            nonGameToast("locking in changes...", "info", null);
          }}
        >
          Commit Changes
        </button>
      </div>
      <p />

      {/* Table of all active competitive lobbies */}
      <table
        style={{
          borderCollapse: "collapse",
          textAlign: "center",
          width: "100%",
        }}
      >
        <thead>
          <tr>
            {[
              "Lobby name",
              "Corporation",
              "Runner",
              "Excluded?",
              "Time ext (min)",
            ].map((h) => (
              <th key={h} style={{ border: "1px solid #ccc", padding: "4px" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {storedTablesRef.map((row, idx) => (
            <tr key={row.gameid}>
              <td>{row.title}</td>
              <td>{row.corp}</td>
              <td>{row.runner}</td>
              <td>
                <input
                  type="checkbox"
                  checked={!!row.excluded}
                  onChange={() => {
                    storedTablesRef[idx] = {
                      ...storedTablesRef[idx],
                      excluded: !storedTablesRef[idx].excluded,
                    };
                    tick();
                  }}
                />
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={row.timeExtension ?? 0}
                  style={{ width: "10ch" }}
                  onChange={(e) => {
                    const v = (e.target as HTMLInputElement).valueAsNumber;
                    storedTablesRef[idx] = {
                      ...storedTablesRef[idx],
                      timeExtension: v,
                    };
                    tick();
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// active-round-section (mirrors active-round-section in cljs)
// ---------------------------------------------------------------------------
function ActiveRoundSection(): React.ReactElement {
  const [_tick] = useState(globalTick);

  useEffect(() => {
    return subscribe(() => {});
  }, []);

  const excluded = invariableTablesRef.filter((t) => t.excluded);
  const extensions = invariableTablesRef.filter(
    (t) => (t.timeExtension ?? 0) > 0
  );

  return (
    <div>
      <h3>Active Round</h3>
      {activeRoundRef ? (
        <div>
          <ul style={{ listStyle: "disc", paddingLeft: "20px" }}>
            <li>{activeRoundRef.sourceUid} declared the round</li>
            <li>
              {activeRoundRef.roundEnd ? (
                <Countdown targetTime={activeRoundRef.roundEnd as string} />
              ) : null}
            </li>
            {activeRoundRef.round20mWarning && <li>There is a 20m warning</li>}
            {activeRoundRef.round5mWarning && <li>There is a 5m warning</li>}
            {activeRoundRef.round1mWarning && <li>There is a 1m warning</li>}
            {activeRoundRef.reportMatch && (
              <li>Players will be asked to report at: {activeRoundRef.reportMatch}</li>
            )}
          </ul>
        </div>
      ) : (
        <div>There is no currently active round. Set one up below.</div>
      )}
      <h3>Actions Taken</h3>
      <div>
        {excluded.length > 0 && (
          <div>
            Excluded tables: {excluded.map((t) => t.title).join(", ")}
          </div>
        )}
        {extensions.length > 0 && (
          <div>
            Time extensions:
            <ul style={{ listStyle: "disc", paddingLeft: "20px" }}>
              {extensions.map((t) => (
                <li key={`${t.gameid}-${t.timeExtension} minutes`}>
                  {t.title}: {t.timeExtension}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <p />
      <div>
        <button
          type="button"
          onClick={() => {
            wsSend("tournament/view-tables", {});
            nonGameToast("refreshing tables...", "info", null);
          }}
        >
          Refresh State
        </button>
      </div>
      <p />
    </div>
  );
}

// ---------------------------------------------------------------------------
// announce-section (mirrors announce-section in cljs)
// ---------------------------------------------------------------------------
function AnnounceSection(): React.ReactElement {
  const [announceText, setAnnounceText] = useState<Record<string, unknown>>({
    msg: "",
  });

  return (
    <div>
      <h3>Announcements</h3>
      <fieldset>
        <legend>Announce</legend>
        <div>
          <label>
            Make an announcement to all non-excluded tournament lobbies{" "}
            <input
              type="text"
              style={{ width: "100%" }}
              value={(announceText.msg as string) ?? ""}
              onChange={(e) => {
                setAnnounceText({ ...announceText, msg: (e.target as HTMLInputElement).value });
              }}
            />
          </label>
        </div>
        {condButton(
          "Announce",
          !!(announceText.msg && (announceText.msg as string).trim()),
          () => {
            nonGameToast("announcing...", "info", null);
            wsSend("tournament/announce", announceText);
            setAnnounceText({ msg: "" });
          }
        )}
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------------
// tournament (mirrors tournament in cljs)
// ---------------------------------------------------------------------------
function TournamentPage(): React.ReactElement {
  const user = useAppState((s) => s.user) as Record<string, unknown> | null;

  if (!user?.["tournament-organizer"]) {
    return <div />;
  }

  return (
    <div className="container">
      <div className="about-bg" />
      <div className="container panel blue-shade content-page">
        <h1>Tournament Manager</h1>
        <hr />
        <AnnounceSection />
        <hr />
        <ActiveRoundSection />
        <hr />
        <TimerManagement />
        <hr />
        <TournamentLobbiesContainer />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ws handlers (mirrors defmethod event-msg-handler in cljs)
// ---------------------------------------------------------------------------

onWSEvent("tournament/view-tables", (rawData) => {
  const data = rawData as {
    competitiveLobbies?: CompetitiveLobby[];
    tournamentState?: ActiveRoundData | null;
  };
  const d = rawData as Record<string, unknown>;
  const playerSplit = splitPlayers(data.competitiveLobbies ?? []);
  storedTablesRef = playerSplit;
  invariableTablesRef = playerSplit;
  actionSummaryRef = playerSplit.filter(
    (t) => (t.timeExtension ?? 0) > 0 || !!t.excluded
  );
  console.log("Data: " + JSON.stringify(d));
  activeRoundRef = data.tournamentState ?? null;
  nonGameToast("tables refreshed!", "info", null);
  tick();
});

onWSEvent("tournament/declare-round", (rawData) => {
  const data = rawData as { error?: string };
  nonGameToast(data.error ?? "", "error", null);
});

export default TournamentPage;
