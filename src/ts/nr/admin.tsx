// Admin page: site news, version, banned message, announcements, game creation control.
// Mirrors: src/cljs/nr/admin.cljs
import React, { useEffect, useState, useCallback } from "react";
import { useAppState } from "./appstate";
import { GET, POST, PUT, DELETE } from "./ajax";
import {
  nonGameToast,
  formatDateTime,
  iSOIshFormatter,
  renderIcons,
} from "./utils";
import { wsSend, wsSendWithCb } from "./ws";

interface NewsItem {
  _id: string;
  date: string;
  item: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers mirroring the CLJS namespace functions                     */
/* ------------------------------------------------------------------ */

// Fetches the latest news from the server and calls `cb` with the result.
function refreshNews(cb: (items: NewsItem[]) => void): void {
  GET("/data/news").then(r => {
    if (r.status === 200 && Array.isArray(r.json)) {
      cb(r.json as NewsItem[]);
    }
  });
}

// Fetches the latest version from the server and calls `cb` with the result.
function refreshVersion(cb: (v: string) => void): void {
  GET("/admin/version").then(r => {
    if (r.status === 200) {
      cb((r.json as { version?: string })?.version ?? "");
    }
  });
}

// Round-trip request/reply now provided by ws.ts via wsSendWithCb (mirrors
// sente's ws-send! timeout+callback form).

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminPage(): React.ReactElement {
  const user = useAppState(s => s.user);
  const blockGameCreationInit = useAppState(s => s.blockGameCreation);

  const [news, setNews] = useState<NewsItem[]>([]);
  const [version, setVersion] = useState("");
  const [bannedMessage, setBannedMessage] = useState<unknown>(null);
  const [pauseGameCreation, setPauseGameCreation] = useState(blockGameCreationInit);
  const [newsMsg, setNewsMsg] = useState("");
  const [versionMsg, setVersionMsg] = useState("");
  const [bannedInput, setBannedInput] = useState("");
  const [announceMsg, setAnnounceMsg] = useState("");

  // ---- Load initial data on mount (mirrors CLJS go blocks) ----
  useEffect(() => {
    refreshNews(setNews);
  }, []);

  useEffect(() => {
    if (user?.isadmin) {
      refreshVersion(setVersion);
    }
  }, [user?.isadmin]);

  /* ---------------------------------------------------------------- */
  /*  News helpers                                                     */
  /* ---------------------------------------------------------------- */

  async function deleteNewsItem(id: string): Promise<void> {
    const response = await DELETE(`/admin/news/${id}`);
    if (response.status === 200) {
      refreshNews(setNews);
      nonGameToast("Updated news items", "success", undefined);
    } else {
      nonGameToast("Failed to update news items", "error", undefined);
    }
  }

  async function postNewsItem(msg: string): Promise<void> {
    const response = await POST("/admin/news", JSON.stringify({ item: msg }), "json");
    if (response.status === 200) {
      refreshNews(setNews);
      nonGameToast("Updated news items", "success", undefined);
    } else {
      nonGameToast("Failed to update news items", "error", undefined);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Version helpers                                                  */
  /* ---------------------------------------------------------------- */

  async function updateVersionItem(msg: string): Promise<void> {
    const response = await PUT("/admin/version", JSON.stringify({ version: msg }), "json");
    if (response.status === 200) {
      refreshVersion(setVersion);
      nonGameToast("Updated version", "success", undefined);
    } else {
      nonGameToast("Failed to update version", "error", undefined);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Banned message helpers                                           */
  /* ---------------------------------------------------------------- */

  async function updateBannedItem(msg: string): Promise<void> {
    const response = await PUT("/admin/banned", JSON.stringify({ banned: msg }), "json");
    if (response.status === 200) {
      const r = await GET("/admin/banned");
      if (r.status === 200) {
        setBannedMessage(r.json);
      }
      nonGameToast("Updated banned message", "success", undefined);
    } else {
      nonGameToast("Failed to update banned message", "error", undefined);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Announcement helpers                                             */
  /* ---------------------------------------------------------------- */

  function updateAnnounceResponse(response: unknown): void {
    // Mirrors sente/cb-success? + case on response
    const status = typeof response === "number" ? response : (response as any)?.status;
    if (status === 200) {
      nonGameToast("Sent announcement", "success", undefined);
    } else if (status === 403) {
      nonGameToast("Not an admin", "error", undefined);
    } else {
      nonGameToast("Failed to send announcement", "error", undefined);
    }
  }

  function postAnnounceItem(msg: string): void {
    wsSendWithCb("admin/announce", { message: msg }, 8000, updateAnnounceResponse);
  }

  /* ---------------------------------------------------------------- */
  /*  Game creation control                                            */
  /* ---------------------------------------------------------------- */

  function updatePauseGameCreation(paused: boolean): void {
    wsSendWithCb("admin/block-game-creation", paused, 8000, (response: unknown) => {
      // Mirrors (swap! admin-state assoc :pause-game-creation response)
      if (typeof response === "boolean") {
        setPauseGameCreation(response);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Form submit handlers                                             */
  /* ---------------------------------------------------------------- */

  const handleNewsSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const msg = newsMsg;
    if (msg.trim()) {
      postNewsItem(msg);
      setNewsMsg("");
    }
  }, [newsMsg]);

  const handleVersionSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const msg = versionMsg;
    if (msg.trim()) {
      updateVersionItem(msg);
      setVersionMsg("");
    }
  }, [versionMsg]);

  const handleBannedSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const msg = bannedInput;
    if (msg.trim()) {
      updateBannedItem(msg);
      setBannedInput("");
    }
  }, [bannedInput]);

  const handleAnnounceSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const msg = announceMsg;
    if (msg.trim()) {
      postAnnounceItem(msg);
      setAnnounceMsg("");
    }
  }, [announceMsg]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  // Mirrors CLJS: when not isadmin, render just the container + help-bg
  if (!user?.isadmin) {
    return (
      <div className="page-container">
        <div className="help-bg" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="help-bg" />
      <div className="container panel blue-shade content-page">

        {/* Site News */}
        <h3>Site News</h3>
        <div className="news-box panel blue-shade">
          <ul className="list">
            {news.map(d => (
              <li className="news-item" key={d.date}>
                <span>
                  <button
                    className="delete"
                    onClick={() => deleteNewsItem(d._id)}
                  >
                    Delete
                  </button>
                </span>
                <span className="date">
                  {formatDateTime(iSOIshFormatter, d.date)}
                </span>
                <span className="title">
                  {renderIcons(d.item || "") as React.ReactNode}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <h4>Add news item</h4>
        <form className="msg-box" onSubmit={handleNewsSubmit}>
          <input
            type="text"
            placeholder="Post something...."
            value={newsMsg}
            onChange={e => setNewsMsg(e.target.value)}
          />
          <button
            disabled={!newsMsg.trim()}
            className={!newsMsg.trim() ? "disabled" : ""}
          >
            Post
          </button>
        </form>

        <br />

        {/* App Version */}
        <h3>App Version</h3>
        <div className="panel">
          <input type="text" name="version" value={version} readOnly />
        </div>
        <h4>Update app version string</h4>
        <form className="msg-box" onSubmit={handleVersionSubmit}>
          <input
            type="text"
            placeholder="Type something...."
            value={versionMsg}
            onChange={e => setVersionMsg(e.target.value)}
          />
          <button
            disabled={!versionMsg.trim()}
            className={!versionMsg.trim() ? "disabled" : ""}
          >
            Update
          </button>
        </form>

        <br />

        {/* Update banned user login failure message */}
        <h3>Update banned user login failure message</h3>
        <form className="msg-box" onSubmit={handleBannedSubmit}>
          <input
            type="text"
            placeholder="Type something...."
            value={bannedInput}
            onChange={e => setBannedInput(e.target.value)}
          />
          <button
            disabled={!bannedInput.trim()}
            className={!bannedInput.trim() ? "disabled" : ""}
          >
            Update
          </button>
        </form>

        <br />

        {/* Site Announcement */}
        <h3>Site Announcement</h3>
        <form className="msg-box" onSubmit={handleAnnounceSubmit}>
          <input
            type="text"
            placeholder="Type something...."
            value={announceMsg}
            onChange={e => setAnnounceMsg(e.target.value)}
          />
          <button
            disabled={!announceMsg.trim()}
            className={!announceMsg.trim() ? "disabled" : ""}
          >
            Send
          </button>
        </form>

        <br />

        {/* Game Creation Control */}
        <h3>Game Creation Control</h3>
        <div className="panel blue-shade">
          <label>
            <input
              type="checkbox"
              checked={pauseGameCreation}
              onChange={e => updatePauseGameCreation(e.target.checked)}
            />
            {" "}Pause new game creation (allows draining games before maintenance)
          </label>
        </div>
      </div>
    </div>
  );
}
