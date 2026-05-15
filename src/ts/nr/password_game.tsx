import * as React from "react";
import { authenticated } from "nr/auth";
import { tr, trSpan, trElement, trRoomType } from "nr/translations";
import { wsSend } from "nr/ws";
import * as sente from "taoensso.sente";

interface LobbyState {
  "password-game"?: {
    game?: any;
    action?: string;
    "request-side"?: string;
  } | null;
  editing?: boolean;
  [key: string]: any;
}

interface PasswordGameProps {
  lobbyState: LobbyState;
  setLobbyState: React.Dispatch<React.SetStateAction<LobbyState>>;
}

interface InputState {
  password?: string;
  "error-msg"?: string | null;
}

const joinGame = (
  setLobbyState: React.Dispatch<React.SetStateAction<LobbyState>>,
  setInputState: React.Dispatch<React.SetStateAction<InputState>>,
  inputState: InputState,
  game: any,
  action: string,
  requestSide: string | undefined
) => {
  authenticated((_: any) => {
    const actionMap: Record<string, string> = {
      join: "lobby/join",
      watch: "lobby/watch",
      rejoin: "game/rejoin",
    };
    const command = actionMap[action] || "lobby/join";
    const params: Record<string, any> = {
      gameid: game.gameid,
      password: inputState.password,
    };
    if (requestSide) {
      params.request_side = requestSide;
    }

    wsSend(
      [command, params],
      8000,
      (res: any) => {
        if (sente.cbSuccess(res)) {
          if (res === 403) {
            setInputState((prev) => ({
              ...prev,
              "error-msg": tr("lobby_invalid-password"),
            }));
          } else if (res === 404) {
            setInputState((prev) => ({
              ...prev,
              "error-msg": tr("lobby_not-allowed"),
            }));
          } else if (res === 200) {
            setLobbyState((prev) => ({
              ...prev,
              editing: false,
              "password-game": null,
            }));
          }
        } else {
          setInputState((prev) => ({
            ...prev,
            "error-msg": tr("lobby_aborted"),
          }));
        }
      }
    );
  });
};

export const passwordGame = ({
  lobbyState,
  setLobbyState,
}: PasswordGameProps) => {
  const [inputState, setInputState] = React.useState<InputState>({
    password: undefined,
    "error-msg": null,
  });

  const passwordGame = lobbyState["password-game"];
  const game = passwordGame?.game;
  const action = passwordGame?.action;
  const requestSide = passwordGame?.["request-side"];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    joinGame(setLobbyState, setInputState, inputState, game, action, requestSide);
  };

  const handleCancel = () => {
    setLobbyState((prev) => {
      const next = { ...prev };
      delete next["password-game"];
      return next;
    });
    setInputState({ "error-msg": null, password: undefined });
  };

  if (!game) {
    return null;
  }

  return (
    <div className="password-prompt">
      <h3>
        {tr("lobby_password-for")} {game.title}
      </h3>
      <p>
        <input
          className="game-title"
          onChange={(e) =>
            setInputState((prev) => ({ ...prev, password: e.target.value }))
          }
          value={inputState.password || ""}
          placeholder={tr("lobby_password")}
          data-i18n-key="lobby_password"
          maxLength={30}
          onKeyPress={(e) => {
            if (e.charCode === 13) {
              handleSubmit(e);
            }
          }}
        />
      </p>
      <p>
        <button type="button" onClick={handleSubmit}>
          {trRoomType(action || "")}
        </button>
        <span className="fake-link" onClick={handleCancel}>
          {trSpan(["lobby_cancel", "Cancel"])}
        </span>
      </p>
      {inputState["error-msg"] && (
        <p className="flash-message">
          {trElement("span", inputState["error-msg"])}
        </p>
      )}
    </div>
  );
};
