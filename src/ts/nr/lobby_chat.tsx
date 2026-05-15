import * as React from "react";
import { avatar } from "nr/avatar";
import { tr, trElement } from "nr/translations";
import { wsSend } from "nr/ws";

interface User {
  __type?: string;
  [key: string]: any;
}

interface Message {
  user: User | "__system__";
  text: string;
  timestamp: string | number;
  username?: string;
}

interface CurrentGame {
  gameid?: string;
  [key: string]: any;
}

interface LobbyChatProps {
  currentGame: CurrentGame;
  messages: Message[];
}

const send = (
  msg: string,
  setMsg: React.Dispatch<React.SetStateAction<string>>,
  setShouldScroll: React.Dispatch<React.SetStateAction<boolean>>,
  currentGame: CurrentGame
) => {
  if (typeof msg === "string" && msg.length > 0) {
    wsSend(["lobby/say", { gameid: currentGame.gameid, text: msg }]);
    setShouldScroll(true);
    setMsg("");
  }
};

const scrolledToEnd = (el: HTMLDivElement, tolerance: number) => {
  return tolerance > el.scrollHeight - el.scrollTop - el.clientHeight;
};

export const lobbyChat = React.forwardRef<HTMLDivElement, LobbyChatProps>(
  function LobbyChat({ currentGame, messages }, ref) {
    const [msg, setMsg] = React.useState("");
    const [shouldScroll, setShouldScroll] = React.useState(false);
    const messageListEl = React.useRef<HTMLDivElement>(null);

    React.useImperativeHandle(ref, () => messageListEl.current as HTMLDivElement);

    React.useEffect(() => {
      if (messageListEl.current) {
        messageListEl.current.scrollTop = messageListEl.current.scrollHeight;
      }
    }, []);

    React.useEffect(() => {
      if (messageListEl.current) {
        if (shouldScroll || scrolledToEnd(messageListEl.current, 15)) {
          setShouldScroll(false);
          messageListEl.current.scrollTop = messageListEl.current.scrollHeight;
        }
      }
    }, [messages, shouldScroll]);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      send(msg, setMsg, setShouldScroll, currentGame);
    };

    return (
      <div className="chat-box">
        {trElement("h3", tr(["lobby_chat", "Chat"]))}
        <div className="message-list" ref={messageListEl}>
          {messages.map((msgItem) =>
            msgItem.user === "__system__" ? (
              <div key={msgItem.timestamp} className="system">
                {msgItem.text}
              </div>
            ) : (
              <div key={msgItem.timestamp} className="message">
                {avatar(msgItem.user as User, { opts: { size: 38 } })}
                <div className="content">
                  <div className="username">
                    {(msgItem.user as any).username}
                  </div>
                  <div>{msgItem.text}</div>
                </div>
              </div>
            )
          )}
        </div>
        <div>
          <form className="msg-box" onSubmit={handleSubmit}>
            <input
              placeholder={tr(["chat_placeholder", "Say something..."])}
              data-i18n-key="chat_placeholder"
              type="text"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
            />
            {trElement("button", tr(["chat_send", "Send"]))}
          </form>
        </div>
      </div>
    );
  }
);
