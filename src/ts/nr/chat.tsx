// Chat page with channel list, message panel, and news sidebar.
// Mirrors: src/cljs/nr/chat.cljs
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAppState, type ChatChannel, type ChatMessage } from "./appstate";
import { GET, POST } from "./ajax";
import { onWSEvent, wsSend } from "./ws";
import { authenticated } from "./auth";

// ──────────────────────────────────────────────────────────────────
// News (inline — mirrors news.cljs)
// ──────────────────────────────────────────────────────────────────

interface NewsItem {
  date: string;
  item: string;
}

function News(): React.ReactElement {
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    GET("/data/news").then(r => {
      if (r.status === 200 && Array.isArray(r.json)) {
        setNews(r.json as NewsItem[]);
      }
    });
  }, []);

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <div id="news" className="news-box panel blue-shade">
      <ul className="list">
        {news.map(d => (
          <li className="news-item" key={d.date}>
            <span className="date">{formatDate(d.date)}</span>
            <span className="title">{d.item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Avatar
// ──────────────────────────────────────────────────────────────────

function Avatar({ emailhash, size = 38 }: { emailhash: string; size?: number }): React.ReactElement {
  return (
    <img
      className="avatar"
      src={`https://www.gravatar.com/avatar/${emailhash}?d=retro&s=${size}`}
      width={size}
      height={size}
      alt=""
    />
  );
}

// ──────────────────────────────────────────────────────────────────
// Individual message
// ──────────────────────────────────────────────────────────────────

interface MessageViewProps {
  message: ChatMessage & { emailhash?: string; pronouns?: string; _id?: string };
  onDelete: (msg: ChatMessage) => void;
  onDeleteAll: (username: string) => void;
  onBlock: (username: string) => void;
}

function MessageView({ message, onDelete, onDeleteAll, onBlock }: MessageViewProps): React.ReactElement {
  const user = useAppState(s => s.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const myMsg = user && (user.username as string) === message.username;
  const isAdmin = user?.isadmin;
  const isModerator = user?.ismoderator;

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="message">
      <Avatar emailhash={(message as { emailhash?: string }).emailhash ?? ""} />
      <div className="content">
        <div className="name-menu">
          <span
            className={`username${myMsg ? "" : " clickable"}`}
            onClick={() => { if (!myMsg) setMenuOpen(o => !o); }}
          >
            {message.username}
          </span>
          {message.pronouns && message.pronouns !== "blank" && (
            <span className="pronouns">({message.pronouns.toLowerCase()})</span>
          )}
          {user && !myMsg && menuOpen && (
            <div className="panel blue-shade block-menu">
              {(isAdmin || isModerator) && (
                <div onClick={() => { onDelete(message); setMenuOpen(false); }}>
                  Delete Message
                </div>
              )}
              {(isAdmin || isModerator) && (
                <div onClick={() => { onDeleteAll(message.username); setMenuOpen(false); }}>
                  Delete All Messages From User
                </div>
              )}
              <div onClick={() => { onBlock(message.username); setMenuOpen(false); }}>
                Block User
              </div>
              <div onClick={() => setMenuOpen(false)}>Cancel</div>
            </div>
          )}
          <span className="date">{formatDate(message.date)}</span>
        </div>
        <div>{message.text}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Channel tab
// ──────────────────────────────────────────────────────────────────

const CHANNELS: ChatChannel[] = [
  "general", "america", "europe", "asia-pacific", "united-kingdom",
  "français", "español", "italia", "polska", "português", "sverige", "русский",
];

// ──────────────────────────────────────────────────────────────────
// Chat page
// ──────────────────────────────────────────────────────────────────

export default function ChatPage(): React.ReactElement {
  const user = useAppState(s => s.user);
  const channels = useAppState(s => s.channels);
  const appendChannel = useAppState(s => s.appendChannel);
  const options = useAppState(s => s.options);

  const [activeChannel, setActiveChannel] = useState<ChatChannel>("general");
  const [msg, setMsg] = useState("");
  const [maxLen, setMaxLen] = useState<number | null>(null);
  const [scrolling, setScrolling] = useState(false);

  const msgListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const appVersion = useAppState(s => (s as { appVersion?: string }).appVersion);

  // Load chat config
  useEffect(() => {
    GET("/chat/config").then(r => {
      if (r.status === 200 && r.json) {
        setMaxLen((r.json as { "max-length"?: number })["max-length"] ?? null);
      }
    });
  }, []);

  // Fetch all message history on mount
  useEffect(() => {
    CHANNELS.forEach(ch => {
      GET(`/messages/${ch}`).then(r => {
        if (r.status === 200 && Array.isArray(r.json)) {
          const blockedUsers: string[] = (options.blockedUsers as string[]) ?? [];
          const filtered = (r.json as ChatMessage[]).filter(
            m => !blockedUsers.includes(m.username)
          );
          // bulk-set channel via store action (appendChannel one by one would be noisy)
          // Use setChannelMessages if available; otherwise append each
          filtered.forEach(m => appendChannel(ch, m));
        }
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WS handlers
  useEffect(() => {
    onWSEvent("chat/message", (data: unknown) => {
      const m = data as ChatMessage & { channel: string };
      const ch = m.channel as ChatChannel;
      const blockedUsers: string[] = (options.blockedUsers as string[]) ?? [];
      if (!blockedUsers.includes(m.username)) {
        appendChannel(ch, m);
      }
    });
  }, [appendChannel, options]);

  // Auto-scroll to bottom when new messages arrive (unless user scrolled up)
  useEffect(() => {
    if (!scrolling && msgListRef.current) {
      msgListRef.current.scrollTop = msgListRef.current.scrollHeight;
    }
  });

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    setScrolling(!atBottom);
  }

  const illegalMessage = !msg.trim() || (maxLen !== null && msg.length >= maxLen);

  function sendMsg(e: React.FormEvent) {
    e.preventDefault();
    if (illegalMessage) return;
    authenticated(u => {
      wsSend("chat/say", {
        channel: activeChannel,
        msg,
        username: u.username,
        emailhash: u.emailhash,
      });
      setMsg("");
      inputRef.current?.focus();
      if (msgListRef.current) {
        msgListRef.current.scrollTop = msgListRef.current.scrollHeight + 500;
      }
    });
  }

  function handleDelete(message: ChatMessage) {
    authenticated(() => {
      wsSend("chat/delete-msg", { msg: message });
    });
  }

  function handleDeleteAll(username: string) {
    authenticated(() => {
      wsSend("chat/delete-all", { sender: username });
    });
  }

  function handleBlock(blockedUser: string) {
    authenticated(u => {
      if (!blockedUser || blockedUser === (u.username as string)) return;
      const blocked: string[] = (options.blockedUsers as string[]) ?? [];
      if (blocked.includes(blockedUser)) return;
      const newList = [...blocked, blockedUser];
      // Post updated options
      POST("/profile", JSON.stringify({ options: { ...options, blockedUsers: newList } }))
        .then(r => {
          if (r.status === 200) {
            useAppState.getState().setOptions({ blockedUsers: newList } as never);
          }
        });
    });
  }

  const messages = channels[activeChannel] ?? [];
  const blockedUsers: string[] = (options.blockedUsers as string[]) ?? [];
  const visibleMessages = messages.filter(m => !blockedUsers.includes(m.username));

  return (
    <div className="container">
      <div className="home-bg" />
      <h1>Play Netrunner in your browser</h1>
      <News />
      <div id="chat" className="chat-app">
        <div className="blue-shade panel channel-list">
          <h4>Channels</h4>
          {CHANNELS.map(ch => (
            <div
              key={ch}
              className={`block-link${ch === activeChannel ? " active" : ""}`}
              onClick={() => { setScrolling(false); setActiveChannel(ch); }}
            >
              #{ch}
            </div>
          ))}
        </div>
        <div className="chat-container">
          <div className="chat-box">
            <div
              className="blue-shade panel message-list"
              ref={msgListRef}
              onScroll={handleScroll}
            >
              {visibleMessages.map((m, i) => (
                <div key={i}>
                  <MessageView
                    message={m as ChatMessage & { emailhash?: string }}
                    onDelete={handleDelete}
                    onDeleteAll={handleDeleteAll}
                    onBlock={handleBlock}
                  />
                </div>
              ))}
            </div>
            {user && (
              <form className="msg-box" onSubmit={sendMsg}>
                <input
                  type="text"
                  ref={inputRef}
                  placeholder="Say something..."
                  accessKey="l"
                  value={msg}
                  onChange={e => setMsg(e.target.value)}
                />
                <button type="submit" disabled={illegalMessage} className={illegalMessage ? "disabled" : ""}>
                  Send
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      <div id="version">
        <span>Version {appVersion ?? "Unknown"}</span>
      </div>
    </div>
  );
}
