// Application state. Mirrors: src/clj/web/app_state.clj
// Manages connected users, lobbies, tournament state, and lobby update subscriptions.

// ---- Types ----

export interface Lobby {
  gameid?: string;
  room?: string;
  title?: string;
  players?: Record<string, unknown>[];
  spectators?: Record<string, unknown>[];
  "corp-spectators"?: Record<string, unknown>[];
  "runner-spectators"?: Record<string, unknown>[];
  "time-extension"?: number;
  excluded?: boolean;
  "exclude?"?: boolean;
  started?: boolean;
  messages?: unknown[];
  "last-update"?: Date;
  pool?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TournamentState {
  "source-uid"?: string;
  "round-start"?: Date;
  "round-start-alert"?: unknown;
  "round-start-1m-alert"?: unknown;
  "round-end"?: Date;
  "round-20m-warning"?: Date | null;
  "round-5m-warning"?: Date | null;
  "round-1m-warning"?: Date | null;
  "round-time-call"?: string;
  "round-time-explainer"?: string | null;
  "report-match"?: string | null;
  [key: string]: unknown;
}

interface AppStateData {
  lobbies: Record<string, Lobby>;
  "lobby-updates": Record<string, Date>;
  tournament: TournamentState | null;
  "block-game-creation": boolean;
  users: Record<string, Record<string, unknown>>;
}

// ---- Main Application State (mirrors app_state.clj defonce app-state) ----

let appState: AppStateData = {
  lobbies: {},
  "lobby-updates": {},
  tournament: null,
  "block-game-creation": false,
  users: {},
};

/**
 * Get the full application state.
 */
export function getAppState(): AppStateData {
  return appState;
}

/**
 * Atomically update the application state using a transform function.
 * Mirrors: swap! app-state f args...
 */
export function swapAppState(f: (state: AppStateData) => AppStateData): AppStateData {
  appState = f(appState);
  return appState;
}

// ---- Users (mirrors app_state.clj) ----

const lobbySubsTimeoutHours: number = 1; // 1 hour

/**
 * Build new state with user registered. Mirrors: (register-user app-state uid user)
 */
function registerUser(state: AppStateData, uid: string, user: Record<string, unknown>): AppStateData {
  const users = { ...state.users };
  users[uid] = { ...user, uid };
  const lobbyUpdates = { ...state["lobby-updates"] };
  lobbyUpdates[uid] = new Date();
  return { ...state, users, "lobby-updates": lobbyUpdates };
}

/**
 * Get all users from app-state.
 * Mirrors: (get-users) -> (vals (:users @app-state))
 */
export function getUsers(): Record<string, unknown>[] {
  return Object.values(appState.users);
}

/**
 * Get a specific user from app-state.
 * Mirrors: (get-user uid) -> (get-in @app-state [:users uid])
 */
export function getUser(uid: string): Record<string, unknown> | undefined {
  return appState.users[uid];
}

/**
 * Register a user in app-state. Mutates.
 * Mirrors: (register-user! uid user)
 */
export function registerUserInAppState(uid: string, user: Record<string, unknown>): void {
  swapAppState((state) => registerUser(state, uid, user));
}

/**
 * Deregister a user from app-state. Mutates.
 * Mirrors: (deregister-user! uid)
 */
export function deregisterUserFromAppState(uid: string): void {
  pauseLobbyUpdates(uid);
  swapAppState((state) => {
    const users = { ...state.users };
    delete users[uid];
    return { ...state, users };
  });
}

// ---- Lobbies (mirrors app_state.clj) ----

/**
 * Get all lobby values.
 * Mirrors: (get-lobbies) -> (vals (:lobbies @app-state))
 */
export function getLobbies(): Lobby[] {
  return Object.values(appState.lobbies);
}

/**
 * Get tournament state or null.
 * Mirrors: (tournament-state) -> (:tournament @app-state nil)
 */
export function tournamentState(): TournamentState | null {
  return appState.tournament;
}

/**
 * Get a lobby by gameid.
 * Mirrors: (get-lobby gameid) -> (get lobbies gameid)
 */
export function getLobby(gameid: string): Lobby | undefined {
  return appState.lobbies[gameid];
}

/**
 * Set the full lobbies map (for bulk updates).
 */
export function setLobbies(lobbies: Record<string, Lobby>): void {
  appState.lobbies = lobbies;
}

/**
 * Set the tournament state.
 */
export function setTournament(tournament: TournamentState | null): void {
  appState.tournament = tournament;
}

/**
 * Find the first lobby where uid appears as a player or spectator.
 * Mirrors: (uid->lobby uid)
 */
export function uidToLobby(uid: string): Lobby | undefined {
  return uidToLobbyFromLobbies(appState.lobbies, uid);
}

function uidToLobbyFromLobbies(lobbies: Record<string, Lobby>, uid: string): Lobby | undefined {
  for (const lobby of Object.values(lobbies)) {
    const players: Record<string, unknown>[] = (lobby.players as Record<string, unknown>[]) || [];
    const spectators: Record<string, unknown>[] = (lobby.spectators as Record<string, unknown>[]) || [];
    const all = [...players, ...spectators];
    if (all.some((p: Record<string, unknown>) => p.uid === uid)) {
      return lobby;
    }
  }
  return undefined;
}

/**
 * Find the first lobby where uid appears as a player (not spectator).
 * Mirrors: (uid-player->lobby uid)
 */
export function uidPlayerToLobby(uid: string): Lobby | undefined {
  return uidPlayerToLobbyFromLobbies(appState.lobbies, uid);
}

function uidPlayerToLobbyFromLobbies(lobbies: Record<string, Lobby>, uid: string): Lobby | undefined {
  for (const lobby of Object.values(lobbies)) {
    const players: Record<string, unknown>[] = (lobby.players as Record<string, unknown>[]) || [];
    if (players.some((p: Record<string, unknown>) => p.uid === uid)) {
      return lobby;
    }
  }
  return undefined;
}

/**
 * Check if uid is in a lobby as a player.
 * Mirrors: (uid-in-lobby-as-player? uid)
 */
export function uidInLobbyAsPlayer(uid: string): boolean {
  return uidPlayerToLobby(uid) !== undefined;
}

// ---- Lobby subscription helpers (mirrors app_state.clj) ----

/**
 * Remove uid from lobby-updates. Mirrors: (pause-lobby-updates uid)
 */
export function pauseLobbyUpdates(uid: string): void {
  swapAppState((state) => {
    const lobbyUpdates = { ...state["lobby-updates"] };
    delete lobbyUpdates[uid];
    return { ...state, "lobby-updates": lobbyUpdates };
  });
}

/**
 * Set uid's lobby-updates timestamp to now. Mirrors: (continue-lobby-updates uid)
 */
export function continueLobbyUpdates(uid: string): void {
  swapAppState((state) => {
    const lobbyUpdates = { ...state["lobby-updates"] };
    lobbyUpdates[uid] = new Date();
    return { ...state, "lobby-updates": lobbyUpdates };
  });
}

/**
 * Check if a user receives lobby updates, updating state if timed out to amortize subsequent checks. Mutates.
 * Mirrors: (receive-lobby-updates? uid)
 */
export function receiveLobbyUpdatesCheck(uid: string): boolean {
  const lastPing = appState["lobby-updates"][uid];
  if (!lastPing) {
    pauseLobbyUpdates(uid);
    return false;
  }
  const now = new Date();
  const cutoff = new Date(now.getTime() - lobbySubsTimeoutHours * 60 * 60 * 1000);
  if (lastPing > cutoff) {
    return true;
  }
  pauseLobbyUpdates(uid);
  return false;
}

// ---- Periodic cleanup of lobby subscriptions (mirrors cleanup-lobby-subs) ----

const lobbySubsClearoutFreq = 5 * 60 * 1000; // 5 minutes (mirrors (enc/ms :mins 5))
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startLobbySubsCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    for (const user of Object.values(appState.users)) {
      receiveLobbyUpdatesCheck((user as Record<string, unknown>).uid as string);
    }
  }, lobbySubsClearoutFreq);
}

export function stopLobbySubsCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
