// Chat page with channel list, message panel, and news sidebar.
// Mirrors: src/cljs/nr/chat.cljs
import React, { useEffect, useRef, useState } from "react";
import { useAppState, type ChatChannel, type ChatMessage } from "./appstate";
import { GET, POST } from "./ajax";
import { onWSEvent, wsSend } from "./ws";
import { authenticated } from "./auth";
import { tr, trSpan, trElement, trPronouns } from "./translations";
import {
  renderMessage,
  formatDateTime,
  dayWordWithTimeFormatter,
  nonGameToast,
  trNonGameToast,
} from "./utils";
import Avatar from "./avatar";
import News from "./news";
import {
  cardPreviewMouseOver,
  cardPreviewMouseOut,
  setZoomChannelCallback,
} from "./gameboard/card_preview";
import { imageUrl } from "./cardbrowser_1";
import type { CardData } from "./cardbrowser_1";

// ──────────────────────────────────────────────────────────────────
// Helpers (mirrors current-block-list, filter-blocked-messages)
// ──────────────────────────────────────────────────────────────────

function currentBlockList(options: Record<string, unknown>): string[] {
  return (options["blocked-users"] as string[] | undefined) ?? [];
}

// ──────────────────────────────────────────────────────────────────
// Individual message (mirrors message-view)
// ──────────────────────────────────────────────────────────────────

interface MessageViewProps {
  message: ChatMessage & {
    emailhash?: string;
    pronouns?: string;
    _id?: string;
    msg?: string;
  };
  onDelete: (msg: ChatMessage) => void;
  onDeleteAll: (username: string) => void;
  onBlock: (username: string) => void;
}

function MessageView({
  message,
  onDelete,
  onDeleteAll,
  onBlock,
}: MessageViewProps): React.ReactElement {
  const user = useAppState((s) => s.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const myMsg = user && (user.username as string) === message.username;
  const isAdmin = !!user?.isadmin;
  const isModerator = !!user?.ismoderator;

  // Mirrors (when-let [pronouns (:pronouns message)]) — show pronouns block in
  // lowercase unless explicitly "blank".
  const pronouns = message.pronouns;
  const pronounStr =
    pronouns && pronouns !== "blank"
      ? `(${trPronouns(pronouns)})`.toLowerCase()
      : null;

  return (
    <div className="message">
      <Avatar
        user={{ emailhash: message.emailhash ?? "", username: message.username }}
        opts={{ size: 38 }}
      />
      <div className="content">
        <div className="name-menu">
          <span
            className={`username${myMsg ? "" : " clickable"}`}
            onClick={() => {
              if (!myMsg) setMenuOpen((o) => !o);
            }}
          >
            {message.username}
          </span>
          {pronounStr && <span className="pronouns">{pronounStr}</span>}
          {user && !myMsg && menuOpen && (
            <div className="panel blue-shade block-menu">
              {(isAdmin || isModerator) && (
                <div
                  onClick={() => {
                    onDelete(message);
                    setMenuOpen(false);
                  }}
                >
                  {trSpan(["chat_delete", "Delete Message"])}
                </div>
              )}
              {(isAdmin || isModerator) && (
                <div
                  onClick={() => {
                    onDeleteAll(message.username);
                    setMenuOpen(false);
                  }}
                >
                  {trSpan([
                    "chat_delete-all",
                    "Delete All Messages From User",
                  ])}
                </div>
              )}
              <div
                onClick={() => {
                  onBlock(message.username);
                  setMenuOpen(false);
                }}
              >
                {trSpan(["chat_block", "Block User"])}
              </div>
              <div onClick={() => setMenuOpen(false)}>
                {trSpan(["chat_cancel", "Cancel"])}
              </div>
            </div>
          )}
          <span className="date">
            {formatDateTime(dayWordWithTimeFormatter, message.date)}
          </span>
        </div>
        <div
          onMouseOver={(e) => cardPreviewMouseOver(e)}
          onMouseOut={(e) => cardPreviewMouseOut(e)}
        >
          {renderMessage(message.msg ?? message.text ?? "") as React.ReactNode}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card zoom preview (mirrors card-zoom / card-zoom-image)
// ──────────────────────────────────────────────────────────────────

function CardZoom({ card }: { card: CardData | null }): React.ReactElement {
  if (!card) {
    return <div className="card-zoom" />;
  }
  const url = imageUrl(card);
  return (
    <div className="card-zoom fade">
      <div className="card-preview blue-shade">
        {url && <img src={url} alt={card.title ?? ""} />}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Channel list (mirrors :channels in app-state + channel-view)
// ──────────────────────────────────────────────────────────────────

const CHANNELS: ChatChannel[] = [
  "general",
  "america",
  "europe",
  "asia-pacific",
  "united-kingdom",
  "français",
  "español",
  "italia",
  "polska",
  "português",
  "sverige",
  "русский",
];

// ──────────────────────────────────────────────────────────────────
// Chat page
// ──────────────────────────────────────────────────────────────────

export default function ChatPage(): React.ReactElement {
  const user = useAppState((s) => s.user);
  const channels = useAppState((s) => s.channels);
  const appendChannel = useAppState((s) => s.appendChannel);
  const options = useAppState((s) => s.options);

  const [activeChannel, setActiveChannel] = useState<ChatChannel>("general");
  const [msg, setMsg] = useState("");
  const [maxLen, setMaxLen] = useState<number | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const [zoomCard, setZoomCard] = useState<CardData | null>(null);

  const msgListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const appVersion = useAppState(
    (s) => (s as { appVersion?: string }).appVersion,
  );

  // Subscribe to the zoom channel so message hover/out (which call
  // cardPreviewMouseOver/Out → zoomChannelPut) update the preview panel.
  // Mirrors (go (while true (let [card (<! (:zoom-ch @s))] (swap! s assoc :zoom card))))
  useEffect(() => {
    setZoomChannelCallback((value: unknown) => {
      if (value && typeof value === "object") {
        setZoomCard(value as CardData);
      } else {
        setZoomCard(null);
      }
    });
    return () => {
      setZoomChannelCallback(() => undefined);
    };
  }, []);

  // Mirrors (go (swap! chat-state assoc :config (:json (<! (GET "/chat/config")))))
  useEffect(() => {
    GET("/chat/config").then((r) => {
      if (r.status === 200 && r.json) {
        setMaxLen(
          (r.json as { "max-length"?: number })["max-length"] ?? null,
        );
      }
    });
  }, []);

  // Mirrors fetch-all-messages
  useEffect(() => {
    CHANNELS.forEach((ch) => {
      GET(`/messages/${ch}`).then((r) => {
        if (r.status === 200 && Array.isArray(r.json)) {
          const blocked = currentBlockList(options);
          const filtered = (r.json as ChatMessage[]).filter(
            (m) => !blocked.includes(m.username),
          );
          filtered.forEach((m) => appendChannel(ch, m));
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WS handlers (mirrors defmethod event-msg-handler for :chat/message,
  // :chat/delete-msg, :chat/delete-all, :chat/blocked)
  useEffect(() => {
    onWSEvent("chat/message", (data: unknown) => {
      const m = data as ChatMessage & { channel: string };
      const ch = m.channel as ChatChannel;
      const blocked = currentBlockList(options);
      if (!blocked.includes(m.username)) {
        appendChannel(ch, m);
      }
    });

    // Mirrors chat/delete-msg: remove a single message by _id from its channel
    onWSEvent("chat/delete-msg", (data: unknown) => {
      const m = data as { channel: string; _id: string };
      const ch = m.channel as ChatChannel;
      const st = useAppState.getState();
      const next = (st.channels[ch] ?? []).filter(
        (x) => (x as { _id?: string })._id !== m._id,
      );
      useAppState.setState({
        channels: { ...st.channels, [ch]: next },
      });
    });

    // Mirrors chat/delete-all: drop every message by `username` across channels
    onWSEvent("chat/delete-all", (data: unknown) => {
      const m = data as { username: string };
      const st = useAppState.getState();
      const newChannels = { ...st.channels };
      for (const ch of Object.keys(newChannels) as ChatChannel[]) {
        newChannels[ch] = (newChannels[ch] ?? []).filter(
          (x) => x.username !== m.username,
        );
      }
      useAppState.setState({ channels: newChannels });
    });

    // Mirrors chat/blocked: toast when the server refuses a chat send
    onWSEvent("chat/blocked", (data: unknown) => {
      const d = data as { reason?: string };
      const reasonStr =
        d.reason === "rate-exceeded"
          ? tr(["chat_rate-exceeded", "Rate exceeded"])
          : d.reason === "length-exceeded"
            ? tr(["chat_length-exceeded", "Length exceeded"])
            : "";
      trNonGameToast(
        ["chat_message-blocked", "Message blocked: {{reason-str}}"],
        { "reason-str": reasonStr },
        "warning",
        null,
      );
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
    const atBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    setScrolling(!atBottom);
  }

  const illegalMessage =
    !msg.trim() || (maxLen !== null && msg.length >= maxLen);

  // Mirrors send-msg
  function sendMsg(e: React.FormEvent) {
    e.preventDefault();
    if (illegalMessage) return;
    authenticated((u) => {
      wsSend("chat/say", {
        channel: activeChannel,
        msg,
        username: u.username,
        emailhash: u.emailhash,
      });
      setMsg("");
      inputRef.current?.focus();
      if (msgListRef.current) {
        msgListRef.current.scrollTop =
          msgListRef.current.scrollHeight + 500;
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

  // Mirrors block-user: optimistically update options, then POST profile
  // (cljs delegates to account/post-options; here we POST inline).
  function handleBlock(blockedUser: string) {
    authenticated((u) => {
      const myUserName = u.username as string;
      const blocked = currentBlockList(options);
      if (
        !blockedUser.trim() ||
        blockedUser === myUserName ||
        blocked.includes(blockedUser)
      ) {
        return;
      }
      const newList = [...blocked, blockedUser];
      useAppState.getState().setOptions({
        "blocked-users": newList,
      } as never);
      POST(
        "/profile",
        JSON.stringify({
          ...options,
          "blocked-users": newList,
        }),
        "json",
      ).then((r) => {
        if (r.status === 200) {
          nonGameToast(
            `Blocked user ${blockedUser}. Refresh browser to update.`,
            "success",
            null,
          );
        } else {
          nonGameToast("Failed to block user", "error", null);
        }
      });
    });
  }

  const messages = channels[activeChannel] ?? [];
  const blocked = currentBlockList(options);
  const visibleMessages = messages.filter(
    (m) => !blocked.includes(m.username),
  );

  return (
    <div className="container">
      <div className="home-bg" />
      {trElement("h1", [
        "chat_title",
        "Play Netrunner in your browser",
      ])}
      <News />
      <div id="chat" className="chat-app">
        <div className="blue-shade panel channel-list">
          {trElement("h4", ["chat_channels", "Channels"])}
          {CHANNELS.map((ch) => (
            <div
              key={ch}
              className={`block-link${ch === activeChannel ? " active" : ""}`}
              onClick={() => {
                setScrolling(false);
                setActiveChannel(ch);
              }}
            >
              #{ch}
            </div>
          ))}
        </div>
        <div className="chat-container">
          <div className="chat-card-zoom">
            <CardZoom card={zoomCard} />
          </div>
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
                  placeholder={tr([
                    "chat_placeholder",
                    "Say something...",
                  ])}
                  data-i18n-key="chat_placeholder"
                  accessKey="l"
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={illegalMessage}
                  className={illegalMessage ? "disabled" : ""}
                >
                  {trSpan(["chat_send", "Send"])}
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
