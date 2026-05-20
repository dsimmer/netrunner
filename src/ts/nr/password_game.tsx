import * as React from "react";
import { authenticated } from "./auth";
import { tr, trSpan, trRoomType } from "./translations";
import { wsSendWithCb } from "./ws";

interface PasswordGameInfo {
  game?: PasswordGameTarget;
  action?: string;
  "request-side"?: string;
}

export interface LobbyState {
  "password-game"?: PasswordGameInfo | null;
  editing?: boolean;
  [key: string]: unknown;
}

interface PasswordGameTarget {
  gameid?: string;
  title?: string;
  [key: string]: unknown;
}

interface PasswordGameProps {
  lobbyState: LobbyState;
  setLobbyState: React.Dispatch<React.SetStateAction<LobbyState>>;
}

interface InputState {
  password?: string;
  "error-msg"?: [string, string] | null;
}

interface JoinParams {
  gameid?: string;
  password?: string;
  "request-side"?: string;
}

const joinGame = (
  setLobbyState: React.Dispatch<React.SetStateAction<LobbyState>>,
  setInputState: React.Dispatch<React.SetStateAction<InputState>>,
  inputState: InputState,
  game: PasswordGameTarget,
  action: string,
  requestSide: string | undefined
) => {
  authenticated(() => {
    const actionMap: Record<string, string> = {
      join: "lobby/join",
      watch: "lobby/watch",
      rejoin: "game/rejoin",
    };
    const command = actionMap[action] || "lobby/join";
    const params: JoinParams = {
      gameid: game.gameid,
      password: inputState.password,
    };
    if (requestSide) {
      params["request-side"] = requestSide;
    }

    // Mirrors (sente/cb-success? + case on response):
    //   200 → close password modal
    //   403 → invalid password
    //   404 → not allowed
    //   anything else → connection aborted
    wsSendWithCb(command, params, 8000, (response) => {
      const status =
        typeof response === "number"
          ? response
          : (response as { status?: number } | null)?.status;
      if (status === 200) {
        setLobbyState((prev) => ({
          ...prev,
          editing: false,
          "password-game": null,
        }));
        return;
      }
      const errorMsg: [string, string] =
        status === 403
          ? ["lobby_invalid-password", "Invalid password"]
          : status === 404
            ? ["lobby_not-allowed", "Not allowed"]
            : ["lobby_aborted", "Connection aborted"];
      setInputState((prev) => ({ ...prev, "error-msg": errorMsg }));
    });
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
    joinGame(setLobbyState, setInputState, inputState, game, action ?? "", requestSide);
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
          {tr(inputState["error-msg"])}
        </p>
      )}
    </div>
  );
};
