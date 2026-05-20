// Replay viewer page: load replay from URL or local file.
// Mirrors: src/cljs/nr/replay_game.cljs
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GET } from "./ajax";
import { authenticated } from "./auth";
import { launchGame } from "./gameboard/actions";
import type { GameStateData } from "./gameboard/state";
import { trSpan } from "./translations";

function startReplayFromData(replayData: unknown, gameid?: string) {
  const replay = replayData as {
    history?: unknown[];
    "replay-shared"?: boolean;
  };
  const history = replay.history ?? [];
  let initState = (history[0] as Record<string, unknown>) ?? {};
  const diffs = history.slice(1);
  initState = {
    ...initState,
    gameid: gameid ?? "local-replay",
    "replay-diffs": diffs,
    "replay-shared": replay["replay-shared"] ?? false,
    options: {
      ...((initState.options as Record<string, unknown>) ?? {}),
      spectatorhands: true,
    },
  };
  launchGame(initState as GameStateData);
}

function LocalReplayLoader(): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [flash, setFlash] = useState("");
  const navigate = useNavigate();

  function start() {
    authenticated(() => {
      if (!file) { setFlash("Select a valid replay file."); return; }
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target?.result as string);
          startReplayFromData(data);
        } catch {
          setFlash("Invalid replay file.");
        }
      };
      reader.readAsText(file);
    });
  }

  return (
    <div>
      <div className="button-bar">
        <button type="button" onClick={start}>
          {trSpan(["lobby_start-replay", "Start replay"])}
        </button>
        <button type="button" onClick={() => navigate("/play")}>
          {trSpan(["lobby_cancel", "Cancel"])}
        </button>
      </div>
      {flash && <p className="flash-message">{flash}</p>}
      <div>
        <input type="file" accept=".json"
          onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </div>
    </div>
  );
}

export default function ReplayPage(): React.ReactElement {
  const { rid } = useParams<{ rid: string }>();
  const [loading, setLoading] = useState(!!rid);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!rid) return;
    setLoading(true);
    // Try /replay first, then /bug-report
    const isBugReport = window.location.pathname.includes("bug-report");
    const endpoint = isBugReport
      ? `/bug-report/${rid}`
      : `/replay/${rid}`;
    GET(endpoint).then(r => {
      if (r.status === 200) {
        startReplayFromData(r.json, rid);
      } else {
        setError("Replay link invalid.");
      }
      setLoading(false);
    });
  }, [rid]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="panel blue-shade content-page">
          <p>Loading replay...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="panel blue-shade content-page">
          <p className="flash-message">{error}</p>
        </div>
      </div>
    );
  }

  // No rid — show local file loader
  return (
    <div className="page-container">
      <div className="panel blue-shade content-page">
        <h3>Load Replay</h3>
        <LocalReplayLoader />
      </div>
    </div>
  );
}
