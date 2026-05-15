// Mirrors: src/cljs/nr/prizes.cljs
import React, { useState, useEffect, useCallback } from "react";
import { useAppState } from "./appstate";
import { wsSend, onWSEvent } from "./ws";
import { nonGameToast } from "./utils";
import { justPrizes, type CardBack } from "../jinteki/card_backs";

interface PrizesData {
  "card-backs"?: Record<string, boolean>;
  [key: string]: unknown;
}

interface SelectedUser {
  username: string;
  prizes: PrizesData;
}

function AssignCardBacks({ selectedUser, onTogglePrize }: {
  selectedUser: SelectedUser | null;
  onTogglePrize: (key: string, checked: boolean) => void;
}) {
  const backs = justPrizes();
  const groups = Array.from(
    new Set(
      Object.values(backs)
        .map((b: CardBack) => b.group)
        .filter((g): g is string => !!g)
    )
  ).sort();

  return (
    <section>
      <h3>Card Backs</h3>
      <p>
        These are card backs that the player can select in the settings menu.
        Players can opt to see the card backs other players use, only the ones
        they select, or only ffg/nsg backs for their opponents.
      </p>
      <br />
      {groups.map((group) => (
        <section key={group}>
          <h3>{group}</h3>
          {Object.entries(backs)
            .filter(([, v]) => v.group === group)
            .map(([k, prize]: [string, CardBack]) => {
              const checked = !!selectedUser?.prizes?.["card-backs"]?.[k];
              return (
                <div key={k}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => onTogglePrize(k, e.target.checked)}
                    />
                    {`${prize.name} - ${prize.description}`}
                  </label>
                </div>
              );
            })}
        </section>
      ))}
    </section>
  );
}

export default function PrizesPage(): React.ReactElement {
  const user = useAppState(s => s.user);
  const [prizesState, setPrizesState] = useState({ username: "" });
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);

  useEffect(() => {
    onWSEvent("prizes/load-user", (data: unknown) => {
      const d = data as { error?: string; success?: { username: string; prizes: PrizesData } };
      if (d.error) {
        nonGameToast(d.error, "error", undefined);
        return;
      }
      if (d.success) {
        nonGameToast(`loaded user: ${d.success.username}`, "info", undefined);
        setSelectedUser({ username: d.success.username, prizes: d.success.prizes });
      }
    });

    onWSEvent("prizes/update-user", (data: unknown) => {
      const d = data as { error?: string; success?: string };
      if (d.error) {
        nonGameToast(d.error, "error", undefined);
        return;
      }
      if (d.success) {
        nonGameToast(d.success, "info", undefined);
        setSelectedUser(null);
      }
    });

    wsSend("admin/fetch-users");
  }, []);

  const handleTogglePrize = useCallback((key: string, checked: boolean) => {
    setSelectedUser((prev) => {
      if (!prev) return prev;
      const cardBacks = { ...(prev.prizes["card-backs"] ?? {}) };
      cardBacks[key] = checked;
      return { ...prev, prizes: { ...prev.prizes, "card-backs": cardBacks } };
    });
  }, []);

  const loadUser = useCallback((username: string) => {
    wsSend("prizes/load-user", { username });
  }, []);

  const saveUser = useCallback(() => {
    if (!selectedUser?.username) return;
    const cardBacks = selectedUser.prizes["card-backs"];
    const filteredCardBacks = Object.fromEntries(
      Object.entries(cardBacks ?? {}).filter(([, v]) => v)
    );
    const prizes: { "card-backs": Record<string, boolean> } = {
      "card-backs": filteredCardBacks,
    };
    wsSend("prizes/update-user", {
      username: selectedUser.username,
      prizes,
    });
  }, [selectedUser]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prizesState.username.trim()) {
      loadUser(prizesState.username);
    }
  };

  return (
    <div className="page-container">
      <div className="account-bg" />
      {(!user?.isadmin && !user?.ismoderator) ? null : (
        <div className="container panel blue-shade content-page">
          <section>
            <h3>Tournament Prizes</h3>
            <p>
              Assign tournament prizes to users. I&apos;m trusting you to be
              honest. These are done on a per-user basis.
            </p>
            <br />
            <p>
              To assign: Load a user. Tick the prizes they should have. Save the
              user.
            </p>
            <form className="msg-box" onSubmit={handleFormSubmit}>
              <input
                type="text"
                placeholder="Type username"
                value={prizesState.username}
                onChange={(e) =>
                  setPrizesState({ username: e.target.value })
                }
              />
              <button
                type="submit"
                disabled={!prizesState.username.trim()}
                className={!prizesState.username.trim() ? "disabled" : ""}
              >
                Load User
              </button>
            </form>
          </section>
          <section>
            <div>
              User Selected: {selectedUser?.username ?? "(nil)"}
            </div>
          </section>
          <AssignCardBacks
            selectedUser={selectedUser}
            onTogglePrize={handleTogglePrize}
          />
          <section>
            <p className="float-right">
              <button
                disabled={!selectedUser?.username}
                className={!selectedUser?.username ? "disabled" : ""}
                onClick={saveUser}
              >
                Save User
              </button>
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
