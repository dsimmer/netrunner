// Users admin page: moderators, special users, tournament organizers, bans.
// Mirrors: src/cljs/nr/users.cljs
import React from "react";
import { create } from "zustand";
import { useAppState } from "./appstate";
import { nonGameToast } from "./utils";
import { wsSend, onWSEvent } from "./ws";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface User {
  _id: string;
  username: string;
  ismoderator?: boolean;
  special?: boolean;
  "tournament-organizer"?: boolean;
  banned?: boolean;
  [key: string]: unknown;
}

interface IpBanEntry {
  username: string;
  "ip-address": string;
}

// ---------------------------------------------------------------------------
// Zustand store (mirrors users-state = r/atom)
// ---------------------------------------------------------------------------
interface UsersState {
  mods: User[];
  specials: User[];
  tos: User[];
  banned: User[];
  "ip-banned": IpBanEntry[];
  "ip-lookup-name": string;
  "ip-lookup-result": string;
}

const defaultUsersState: UsersState = {
  mods: [],
  specials: [],
  tos: [],
  banned: [],
  "ip-banned": [],
  "ip-lookup-name": "",
  "ip-lookup-result": "",
};

interface UsersStore extends UsersState {
  setUsersStore: (updater: Partial<UsersState>) => void;
}

const useUsersStore = create<UsersStore>((set) => ({
  ...defaultUsersState,
  setUsersStore: (updater: Partial<UsersState>) => set(updater),
}));

// ---------------------------------------------------------------------------
// WebSocket handlers (mirrors defmethod event-msg-handler)
// ---------------------------------------------------------------------------

// :admin/fetch-users
onWSEvent("admin/fetch-users", ({ success }: { success?: User[] }) => {
  if (!success) return;
  const mods: User[] = [];
  const specials: User[] = [];
  const tos: User[] = [];
  const banned: User[] = [];
  for (const user of success) {
    if (user.ismoderator) mods.push(user);
    if (user.special) specials.push(user);
    if (user["tournament-organizer"]) tos.push(user);
    if (user.banned) banned.push(user);
  }
  useUsersStore.setState({ mods, specials, tos, banned });
});

// :admin/fetch-ip-bans
onWSEvent("admin/fetch-ip-bans", ({ success }: { success?: IpBanEntry[] }) => {
  if (!success) return;
  useUsersStore.setState({ "ip-banned": success });
});

// :admin/look-up-ip
onWSEvent("admin/look-up-ip", ({ success, error }: { success?: { username: string; "last-ip-address"?: string }; error?: string }) => {
  if (success) {
    const { username, "last-ip-address": lastIpAddress } = success;
    useUsersStore.setState({ "ip-lookup-name": username, "ip-lookup-result": lastIpAddress ?? "" });
  } else if (error) {
    nonGameToast(error, undefined, undefined);
  }
});

// :admin/ip-ban-user
onWSEvent("admin/ip-ban-user", ({ success, error }: { success?: { username: string; "ip-address": string }; error?: string }) => {
  if (success) {
    const { username, "ip-address": ipAddress } = success;
    useUsersStore.setState({
      "ip-banned": [...useUsersStore.getState()["ip-banned"], { username, "ip-address": ipAddress }],
    });
  } else if (error) {
    nonGameToast(error, undefined, undefined);
  }
});

// :admin/ip-unban-user
onWSEvent("admin/ip-unban-user", ({ success, error }: { success?: { username: string; "ip-address": string }; error?: string }) => {
  if (success) {
    const { username } = success;
    const ipBanned = useUsersStore.getState()["ip-banned"];
    useUsersStore.setState({ "ip-banned": ipBanned.filter(m => m.username !== username) });
  } else if (error) {
    nonGameToast(error, undefined, undefined);
  }
});

// :admin/user-edit
onWSEvent("admin/user-edit", ({ success, error }: { success?: { action?: string; user?: User; "user-type"?: string }; error?: string }) => {
  if (error) {
    nonGameToast(error, "error", undefined);
    return;
  }
  if (success) {
    const { action, userType: userTypeKey, user } = success;
    if (!user) return;
    const username = user.username;
    switch (action) {
      case "admin/add-user": {
        const current = useUsersStore.getState()[userTypeKey] ?? [];
        useUsersStore.setState({ [userTypeKey]: [...current, user] });
        nonGameToast(`Updated ${username}`, "success", undefined);
        break;
      }
      case "admin/remove-user": {
        const current = useUsersStore.getState()[userTypeKey] ?? [];
        const updated = current.filter((elt: User) => elt._id !== user._id);
        useUsersStore.setState({ [userTypeKey]: updated });
        nonGameToast(`Removed ${username}`, "success", undefined);
        break;
      }
      default:
        nonGameToast("Wrong action type", "error", undefined);
        break;
    }
  }
});

// ---------------------------------------------------------------------------
// Helper functions (mirrors remove-user and add-user)
// ---------------------------------------------------------------------------
function removeUser(userType: string): (username: string) => void {
  return (username: string) => {
    wsSend("admin/edit-user", { action: "admin/remove-user", "user-type": userType, username });
  };
}

function addUser(userType: string): (username: string) => void {
  return (username: string) => {
    wsSend("admin/edit-user", { action: "admin/add-user", "user-type": userType, username });
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function UsersList({ users, removeFn }: { users: User[]; removeFn: (username: string) => void }): React.ReactElement {
  const sorted = React.useMemo(
    () => [...users].sort((a, b) => a.username.toLowerCase().localeCompare(b.username.toLowerCase())),
    [users],
  );

  return (
    <div className="users-box panel blue-shade">
      <ul className="list">
        {sorted.map(d => (
          <li key={d._id} className="users-item">
            <span>
              <button className="delete" onClick={() => removeFn(d.username)}>
                Remove
              </button>
            </span>
            <span className="title">{d.username}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IpBansList({ users }: { users: IpBanEntry[] }): React.ReactElement {
  const sorted = React.useMemo(
    () => [...users].sort((a, b) => a.username.toLowerCase().localeCompare(b.username.toLowerCase())),
    [users],
  );

  return (
    <div className="users-box panel blue-shade">
      <ul className="list">
        {sorted.map(d => (
          <li key={d.username} className="users-item">
            <span>
              <button
                className="delete"
                onClick={() => wsSend("admin/ip-unban-user", { username: d.username })}
              >
                Remove
              </button>
            </span>
            <span className="title">{d.username}</span>{" "}
            <span> - {d["ip-address"]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IpBanUserAdd(): React.ReactElement {
  const [input, setInput] = React.useState("");
  const disabled = input.trim() === "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const username = input.trim();
    if (!username) return;
    wsSend("admin/ip-ban-user", { username });
    setInput("");
  };

  return (
    <form className="msg-box" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Type username"
        value={input}
        onChange={e => setInput(e.target.value)}
      />
      <button disabled={disabled} className={disabled ? "disabled" : ""}>
        IP Ban User
      </button>
    </form>
  );
}

function UserAdd({ stateKey, addFn }: { stateKey: string; addFn: (username: string) => void }): React.ReactElement {
  const [input, setInput] = React.useState("");
  const disabled = input.trim() === "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const username = input.trim();
    if (!username) return;
    addFn(username);
    setInput("");
  };

  return (
    <form className="msg-box" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Type username"
        value={input}
        onChange={e => setInput(e.target.value)}
      />
      <button disabled={disabled} className={disabled ? "disabled" : ""}>
        Add
      </button>
    </form>
  );
}

function IpLookupBox(): React.ReactElement {
  const ipLookupName = useUsersStore(s => s["ip-lookup-name"]);
  const ipLookupResult = useUsersStore(s => s["ip-lookup-result"]);
  const disabled = ipLookupName.trim() === "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ipLookupName.trim()) return;
    wsSend("admin/look-up-ip", { username: ipLookupName });
  };

  return (
    <form className="msg-box" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Type username"
        value={ipLookupName}
        onChange={e => useUsersStore.setState({ "ip-lookup-name": e.target.value })}
      />
      <input
        type="text"
        readOnly
        value={ipLookupResult}
        placeholder="Look up an IP"
      />
      <button disabled={disabled} className={disabled ? "disabled" : ""}>
        Search
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// users-container (mirrors users-container in CLJS)
// ---------------------------------------------------------------------------
function UsersContainer(): React.ReactElement {
  const mods = useUsersStore(s => s.mods);
  const specials = useUsersStore(s => s.specials);
  const tos = useUsersStore(s => s.tos);
  const banned = useUsersStore(s => s.banned);
  const ipBans = useUsersStore(s => s["ip-banned"]);

  const rows = [
    { h3: "Moderators", cursor: mods, key: "mods" as const, h4: "Add moderator" },
    { h3: "Alt Art Access", cursor: specials, key: "specials" as const, h4: "Give user alt art access" },
    { h3: "Tournament Organizers", cursor: tos, key: "tos" as const, h4: "Add Tournament Organizer" },
    { h3: "Banned Users", cursor: banned, key: "banned" as const, h4: "Ban user" },
  ];

  return (
    <div className="container panel blue-shade content-page">
      {rows.map((row, idx) => (
        <React.Fragment key={row.key}>
          <h3>{row.h3}</h3>
          <UsersList users={row.cursor} removeFn={removeUser(row.key)} />
          <h4>{row.h4}</h4>
          <UserAdd stateKey={row.key} addFn={addUser(row.key)} />
          <br key={`br-${idx}`} />
        </React.Fragment>
      ))}
      <h3>IP Lookup</h3>
      <IpLookupBox />
      <br />
      <h3>Ip Bans</h3>
      <IpBansList users={ipBans} />
      <IpBanUserAdd />
    </div>
  );
}

// ---------------------------------------------------------------------------
// users (main entry point)
// ---------------------------------------------------------------------------
export function Users(): React.ReactElement {
  const user = useAppState(s => s.user);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    const isAdmin = !!(user.isadmin || user.ismoderator);
    wsSend("admin/fetch-users");
    wsSend("admin/fetch-ip-bans");
    setVisible(isAdmin);
  }, [user]);

  return (
    <div className="page-container">
      <div className="account-bg" />
      {visible ? <UsersContainer /> : null}
    </div>
  );
}
