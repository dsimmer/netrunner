// New game form: create-game dialog with format, side, options.
// Mirrors: src/cljs/nr/new_game.cljs
import React, { useState } from "react";
import { useAppState } from "./appstate";
import { authenticated } from "./auth";
import {
  tr,
  trSpan,
  trElement,
  trFormat,
  trSide,
} from "./translations";
import { condButton, slugToFormat } from "./utils";
import { strToInt } from "../jinteki/utils";
import { allMatchups, matchupByKey } from "../jinteki/preconstructed";
import { wsSend } from "./ws";

// ─── Types ────────────────────────────────────────────────────────

interface StateShape {
  flashMessage: string;
  format: string;
  room: string;
  side: string;
  gatewayType: string;
  precon: string;
  title: string;
  description: string;
}

interface OptionsShape {
  allowSpectator: boolean;
  apiAccess: boolean;
  password: string;
  protected: boolean;
  saveReplay: boolean;
  singleton: boolean;
  spectatorhands: boolean;
  openDecklists: boolean;
  timed: boolean;
  timer: number | null;
}

// ─── create-game ──────────────────────────────────────────────────

function createGame(
  state: React.MutableRefObject<StateShape>,
  lobbyState: React.MutableRefObject<{ editing: boolean; [key: string]: unknown }>,
  options: React.MutableRefObject<OptionsShape>,
): void {
  authenticated(() => {
    if (!state.current.title) {
      state.current.flashMessage = tr([
        "lobby_title-error",
        "Please fill a game title.",
      ]);
    } else if (options.current.protected && !options.current.password) {
      state.current.flashMessage = tr([
        "lobby_password-error",
        "Please fill a password.",
      ]);
    } else {
      const stateKeys = [
        "flashMessage",
        "format",
        "room",
        "side",
        "gatewayType",
        "precon",
        "title",
        "description",
      ];
      const newGame: Record<string, unknown> = {};
      for (const key of stateKeys) {
        const val = (state.current as unknown as Record<string, unknown>)[key];
        if (val !== null && val !== undefined) {
          newGame[key] = val;
        }
      }
      for (const key of Object.keys(options.current as object)) {
        const val = (options.current as unknown as Record<string, unknown>)[key];
        if (val !== null && val !== undefined && !(key in newGame)) {
          newGame[key] = val;
        }
      }
      lobbyState.current.editing = false;
      wsSend(":lobby/create", newGame);
    }
  });
}

// ─── create-new-game (main component) ─────────────────────────────

function createNewGame(
  lobbyState: React.MutableRefObject<{ editing: boolean; [key: string]: unknown }>,
  user: Record<string, unknown> | null,
): React.ReactElement {
  const blockGameCreation = useAppState((s) => s.blockGameCreation);
  const defaultFormat = useAppState((s) => s.options.defaultFormat);
  const lobbyRoom = useAppState((s) =>
    (lobbyState.current.room as string) ?? "casual",
  );

  // Main state
  const [state, setState] = useState<StateShape>(() => {
    const username = user?.username ?? "";
    const titleStr =
      typeof username === "string"
        ? `${username}'s game`
        : username
        ? `${String(username)}'s game`
        : "";
    return {
      flashMessage: "",
      format: (defaultFormat as string) || "standard",
      room: lobbyRoom as string,
      side: "Any Side",
      gatewayType: "Beginner",
      precon: "worlds-2012-a",
      title: titleStr,
      description: "",
    };
  });

  // Options state
  const [options, setOptions] = useState<OptionsShape>({
    allowSpectator: true,
    apiAccess: false,
    password: "",
    protected: false,
    saveReplay: lobbyRoom !== "casual",
    singleton: false,
    spectatorhands: false,
    openDecklists: false,
    timed: false,
    timer: null,
  });

  // ─── JSX Sub-components ─────────────────────────────────────────

  const renderTitleSection = () => (
    <section>
      {trElement("h3", ["lobby_title", "Title"])}
      <input
        className="game-title"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setState((prev) => ({ ...prev, title: e.target.value }));
        }}
        value={state.title}
        data-i18n-key="lobby_title"
        placeholder={tr(["lobby_title", "Title"])}
        maxLength={100}
      />
    </section>
  );

  const renderSideSection = () => (
    <section>
      {trElement("h3", ["lobby_side", "Side"])}
      {["Any Side", "Corp", "Runner"].map((option) => (
        <p key={option}>
          <label>
            <input
              type="radio"
              name="side"
              value={option}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setState((prev) => ({ ...prev, side: e.target.value }));
              }}
              checked={state.side === option}
            />
            {trSide(option)}
          </label>
        </p>
      ))}
    </section>
  );

  const renderSingletonCheckbox = () => (
    <label>
      <input
        type="checkbox"
        checked={options.singleton}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setOptions((prev) => ({ ...prev, singleton: e.target.checked }));
        }}
      />
      {trSpan(["lobby_singleton", "Singleton"])}
    </label>
  );

  const renderOpenDecklists = () => (
    <label>
      <input
        type="checkbox"
        checked={options.openDecklists}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setOptions((prev) => ({ ...prev, openDecklists: e.target.checked }));
        }}
      />
      {trSpan(["lobby_open-decklists", "Open Decklists"])}
    </label>
  );

  const renderGatewayChoice = () => {
    const display = state.format === "system-gateway" ? "block" : "none";
    return (
      <div style={{ display }}>
        {["Beginner", "Intermediate", "Constructed"].map((option) => (
          <span key={option}>
            <label>
              <input
                type="radio"
                name="gateway-type"
                value={option}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setState((prev) => ({
                    ...prev,
                    gatewayType: e.target.value,
                  }));
                }}
                checked={state.gatewayType === option}
              />
              {trSpan(["lobby_gateway-format", option], { format: option })}
            </label>{"    "}
          </span>
        ))}
      </div>
    );
  };

  const renderPreconChoice = () => {
    const display = state.format === "preconstructed" ? "block" : "none";
    const matchup = matchupByKey(state.precon as any);
    return (
      <div style={{ display }}>
        <span>
          {"Decks:     "}
          {tr(Array.isArray(matchup?.trUnderline) ? matchup.trUnderline : [])}
        </span>
        <div>
          <label>Match:    </label>
          <select
            className="precon"
            value={state.precon || "worlds-2012-a"}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setState((prev) => ({ ...prev, precon: e.target.value }));
            }}
          >
            {Array.from(allMatchups)
              .sort((a, b) => (a > b ? 1 : -1))
              .map((matchupKey) => {
                const m = matchupByKey(matchupKey);
                return (
                  <option key={matchupKey} value={matchupKey}>
                    {tr(Array.isArray(m?.trInner) ? m.trInner : [])}
                  </option>
                );
              })}
          </select>
        </div>
      </div>
    );
  };

  const renderFormatSection = () => (
    <section>
      {trElement("h3", ["lobby_default-game-format", "Default game format"])}
      <select
        className="format"
        value={state.format || "standard"}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          setState((prev) => ({ ...prev, format: e.target.value }));
        }}
      >
        {Object.entries(slugToFormat).map(([k, v]) => (
          <option key={k} value={k}>
            {trFormat(v)}
          </option>
        ))}
      </select>
      {renderSingletonCheckbox()}
      {renderGatewayChoice()}
      {renderPreconChoice()}
      {state.format === "quick-draft" && (
        <div className="infobox blue-shade">
          <p>
            {tr([
              "lobby_quick-draft",
              "Quickly draft a deck to play against your opponent, using a smaller deck size and lower than normal agenda-point total.",
            ])}
          </p>
        </div>
      )}
      {options.singleton && (
        <div className="infobox blue-shade">
          <p>
            {trElement("p", [
              "lobby_singleton-details",
              "This will restrict decklists to only those which do not contain any duplicate cards. It is recommended you use the listed singleton-based identities.",
            ])}
          </p>
          <p>
            {trElement("p", [
              "lobby_singleton-example",
              "1) Nova Initiumia: Catalyst & Impetus 2) Ampere: Cybernetics For Anyone",
            ])}
          </p>
        </div>
      )}
    </section>
  );

  const renderDescriptionSection = () => (
    <section>
      {trElement("h4", ["lobby_game-description", "Game Description"])}
      <select
        className="description"
        value={state.description || "new-game_default"}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          setState((prev) => ({ ...prev, description: e.target.value }));
        }}
      >
        {Object.entries({
          "new-game_default": "No special conditions",
          "new-game_meta-deck": "Play against meta decks",
          "new-game_casual": "Casual play",
          "new-game_competitive": "Play competitive games",
          "new-game_new-player": "Learning the game",
        }).map(([k, v]) => (
          <option key={k} value={k} data-i18n-key={k}>
            {tr([k, v])}
          </option>
        ))}
      </select>
    </section>
  );

  const renderAllowSpectators = () => (
    <p>
      <label>
        <input
          type="checkbox"
          checked={options.allowSpectator}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setOptions((prev) => ({
              ...prev,
              allowSpectator: e.target.checked,
            }));
          }}
        />
        {trSpan(["lobby_spectators", "Allow spectators"])}
      </label>
    </p>
  );

  const renderToggleHiddenInfo = () => (
    <>
      <p>
        <label>
          <input
            type="checkbox"
            checked={options.spectatorhands}
            disabled={!options.allowSpectator}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setOptions((prev) => ({
                ...prev,
                spectatorhands: e.target.checked,
              }));
            }}
          />
          {trSpan([
            "lobby_hidden",
            "Make players' hidden information visible to spectators",
          ])}
        </label>
      </p>
      {options.spectatorhands && (
        <div className="infobox blue-shade">
          <p>
            {trElement("p", [
              "lobby_hidden-details",
              "This will reveal both players' hidden information to ALL spectators of your game, including hand and face-down cards.",
            ])}
          </p>
          <p>
            {trElement("p", [
              "lobby_hidden-password",
              "We recommend using a password to prevent strangers from spoiling the game.",
            ])}
          </p>
        </div>
      )}
    </>
  );

  const renderPasswordInput = () => {
    const passwordPlaceholder = tr(["lobby_password", "Password"]);
    return (
      <>
        <p>
          <label>
            <input
              type="checkbox"
              checked={options.protected}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const checked = e.target.checked;
                setOptions((prev) => ({
                  ...prev,
                  protected: checked,
                  password: checked ? prev.password : "",
                }));
              }}
            />
            {trSpan(["lobby_password-protected", "Password protected"])}
          </label>
        </p>
        {options.protected && (
          <p>
            <input
              className="game-title"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setOptions((prev) => ({
                  ...prev,
                  password: e.target.value,
                }));
              }}
              value={options.password}
              data-i18n-key="lobby_password"
              placeholder={passwordPlaceholder}
              maxLength={30}
            />
          </p>
        )}
      </>
    );
  };

  const renderAddTimer = () => {
    const showTimer = lobbyRoom !== "casual";
    const timerPlaceholder = tr(["lobby_timer-length", "Timer length (minutes)"]);
    const timerDetailsText = tr([
      "lobby_timed-game-details",
      "Timer is only for convenience: the game will not stop when timer runs out.",
    ]);
    return (
      <>
        {showTimer && (
          <p>
            <label>
              <input
                type="checkbox"
                checked={options.timed}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const checked = e.target.checked;
                  setOptions((prev) => ({
                    ...prev,
                    timed: checked,
                    timer: checked ? 35 : null,
                  }));
                }}
              />
              {trSpan(["lobby_timed-game", "Start with timer"])}
            </label>
          </p>
        )}
        {options.timed && (
          <p>
            <input
              className="game-title"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = strToInt(e.target.value);
                if (!isNaN(value)) {
                  setOptions((prev) => ({
                    ...prev,
                    timer: value,
                  }));
                }
              }}
              type="number"
              value={options.timer ?? ""}
              data-i18n-key="lobby_timer-length"
              placeholder={timerPlaceholder}
            />
          </p>
        )}
        {options.timed && (
          <div className="infobox blue-shade">
            <p>{timerDetailsText}</p>
          </div>
        )}
      </>
    );
  };

  const renderSaveReplay = () => {
    const replayDetails = tr([
      "lobby_save-replay-details",
      "This will save a replay file of this match with open information (e.g. open cards in hand). The file is available only after the game is finished.",
    ]);
    const replayUnshared = tr([
      "lobby_save-replay-unshared",
      "Only your latest 15 unshared games will be kept, so make sure to either download or share the match afterwards.",
    ]);
    const replayBeta = tr([
      "lobby_save-replay-beta",
      "BETA Functionality: Be aware that we might need to reset the saved replays, so make sure to download games you want to keep. Also, please keep in mind that we might need to do future changes to the site that might make replays incompatible.",
    ]);
    return (
      <>
        <p>
          <label>
            <input
              type="checkbox"
              checked={options.saveReplay}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setOptions((prev) => ({
                  ...prev,
                  saveReplay: e.target.checked,
                }));
              }}
            />
            {"🟢 "}
            {trSpan(["lobby_save-replay", "Save replay"])}
          </label>
        </p>
        {options.saveReplay && (
          <div className="infobox blue-shade">
            <p>{replayDetails}</p>
            <p>{replayUnshared}</p>
            <p>{replayBeta}</p>
          </div>
        )}
      </>
    );
  };

  const renderApiAccess = () => {
    const hasKeys = !!(
      user && (user as Record<string, unknown>)["has-api-keys"]
    );
    const apiAccessDetails = tr([
      "lobby_api-access-details",
      "This allows access to information about your game to 3rd party extensions. Requires an API Key to be created in Settings.",
    ]);
    return (
      <>
        <p>
          <label>
            <input
              disabled={!hasKeys}
              type="checkbox"
              checked={options.apiAccess}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setOptions((prev) => ({
                  ...prev,
                  apiAccess: e.target.checked,
                }));
              }}
            />
            {trSpan([
              "lobby_api-access",
              "Allow API access to game information",
            ])}
            {!hasKeys && (
              <>
                {" "}
                {trSpan([
                  "lobby_api-requires-key",
                  "(Requires an API Key in Settings)",
                ])}
              </>
            )}
          </label>
        </p>
        {options.apiAccess && (
          <div className="infobox blue-shade">
            <p>{apiAccessDetails}</p>
          </div>
        )}
      </>
    );
  };

  // ─── Button bar ─────────────────────────────────────────────────

  const blockCreationMessage = tr([
    "lobby_creation-paused",
    "Game creation is currently paused for maintenance.",
  ]);

  const buttonBarEl = (
    <div className="button-bar">
      {condButton(
        trSpan(["lobby_create", "Create"]),
        !blockGameCreation,
        () => {
          createGame(
            { current: state } as React.MutableRefObject<StateShape>,
            lobbyState,
            { current: options } as React.MutableRefObject<OptionsShape>,
          );
        },
        blockGameCreation ? { title: blockCreationMessage } : undefined,
      )}
      <button
        type="button"
        onClick={() => {
          lobbyState.current.editing = false;
        }}
      >
        {trSpan(["lobby_cancel", "Cancel"])}
      </button>
    </div>
  );

  // ─── Main render ────────────────────────────────────────────────

  return (
    <div>
      {buttonBarEl}
      {state.flashMessage && (
        <p className="flash-message">{state.flashMessage}</p>
      )}
      {blockGameCreation && (
        <div className="infobox blue-shade">
          <p style={{ margin: "10px 5px 10px 0px" }}>
            {blockCreationMessage}
          </p>
        </div>
      )}
      <div className="content">
        {renderTitleSection()}
        {renderSideSection()}
        {renderFormatSection()}
        {renderDescriptionSection()}
        <section>
          {trElement("h3", ["lobby_options", "Options"])}
          {renderAllowSpectators()}
          {renderToggleHiddenInfo()}
          {renderOpenDecklists()}
          {renderPasswordInput()}
          {renderAddTimer()}
          {renderSaveReplay()}
          {renderApiAccess()}
        </section>
      </div>
    </div>
  );
}

export { createNewGame };
export default createNewGame;
